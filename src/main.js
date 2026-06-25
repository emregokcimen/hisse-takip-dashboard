import "./styles.css";
import { getAnalysis, getHealth, getHistory, getNasdaqUniverse, getNews, getPerformance, getSnapshots, getStatus } from "./api.js";
import {
  applyTheme,
  getFibTarget,
  getSymbols,
  mergeSnapshot,
  persistSnapshots,
  setHistory,
  setAnalysis,
  setNews,
  setNasdaqUniverse,
  setNasdaqUniverseStatus,
  setPerformance,
  state
} from "./state.js";
import { renderShell } from "./render.js";

const actions = {
  refreshAll,
  loadNasdaqUniverse,
  loadSelectedHistory,
  loadSelectedNews,
  loadSelectedAnalysis,
  requestNotifications
};

let refreshInFlight = false;
const quietRender = { quiet: true, preserveScroll: true };

async function refreshAll(options = {}) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  const shouldRenderStart = options?.renderStart === true;
  state.loading = true;
  state.error = null;
  if (shouldRenderStart) renderShell(actions);

  try {
    const [health, status] = await Promise.allSettled([getHealth(), getStatus()]);
    state.proxyStatus = {
      health: health.status === "fulfilled" ? health.value.data : null,
      status: status.status === "fulfilled" ? status.value.data : null
    };

    await loadSnapshotsForSymbols(getSymbols());
    state.lastRefreshAt = Date.now();
    state.loading = false;

    await loadSecondaryData();
    await loadSelectedNews({ render: false });
    await loadSelectedAnalysis({ render: false });
    renderShell(actions, quietRender);
    checkFibAlerts();
  } catch (error) {
    state.loading = false;
    state.error = error.message;
    renderShell(actions, quietRender);
  } finally {
    refreshInFlight = false;
  }
}

async function loadNasdaqUniverse(force = false) {
  setNasdaqUniverseStatus("loading", force ? "Nasdaq listesi yenileniyor..." : "Nasdaq listesi yükleniyor...");
  renderShell(actions, quietRender);
  try {
    const universe = await getNasdaqUniverse("", 6000, force);
    setNasdaqUniverse(universe);
    const count = universe.count || universe.rows?.length || 0;
    const suffix = universe.stale
      ? ` Yerel cache kullanılıyor${universe.warning ? ` (${universe.warning})` : "."}`
      : " Şirket seçip kategoriye ekleyebilirsin.";
    setNasdaqUniverseStatus(universe.stale ? "warning" : "success", `${count} Nasdaq hissesi hazır.${suffix}`);
  } catch (error) {
    setNasdaqUniverseStatus("error", `Nasdaq listesi alınamadı: ${error.message}`);
  } finally {
    renderShell(actions, quietRender);
  }
}
async function loadSnapshotsForSymbols(symbols) {
  const uniqueSymbols = Array.from(new Set((symbols || []).filter(Boolean)));
  const chunks = [];
  for (let i = 0; i < uniqueSymbols.length; i += 12) chunks.push(uniqueSymbols.slice(i, i + 12));

  const failures = [];
  for (const chunk of chunks) {
    try {
      const snapshots = await getSnapshots(chunk);
      snapshots.forEach(mergeSnapshot);
    } catch (error) {
      failures.push(error);
    }
  }

  if (!state.snapshots.size && failures.length) {
    throw failures[0];
  }

  persistSnapshots();
}

async function loadSecondaryData() {
  const symbols = getSymbols();
  const selected = state.selectedSymbol || symbols[0];
  const priority = Array.from(new Set([selected, ...symbols.slice(0, 16), ...symbols]));
  const chunks = [];
  for (let i = 0; i < priority.length; i += 6) chunks.push(priority.slice(i, i + 6));

  for (const chunk of chunks) {
    await Promise.allSettled(chunk.flatMap((symbol) => [
      loadHistory(symbol, state.ui.historyRange, state.ui.historyInterval),
      getPerformance(symbol).then((performance) => setPerformance(symbol, performance))
    ]));
  }
}

async function loadHistory(symbol, range, interval) {
  const points = await getHistory(symbol, range, interval);
  setHistory(symbol, range, interval, points);
}

async function loadSelectedHistory() {
  const symbol = state.selectedSymbol || getSymbols()[0];
  try {
    await loadHistory(symbol, state.ui.historyRange, state.ui.historyInterval);
  } finally {
    renderShell(actions);
  }
}

async function loadSelectedNews(options = {}) {
  const shouldRender = options?.render !== false;
  const symbol = state.selectedSymbol || getSymbols()[0];
  try {
    const news = await getNews(symbol);
    setNews(symbol, news);
  } catch {
    setNews(symbol, { symbol, items: [], source: "Yahoo Finance RSS" });
  } finally {
    if (shouldRender) renderShell(actions);
  }
}

async function loadSelectedAnalysis(options = {}) {
  const shouldRender = options?.render !== false;
  const symbol = state.selectedSymbol || getSymbols()[0];
  try {
    const analysis = await getAnalysis(symbol);
    setAnalysis(symbol, analysis);
  } catch {
    setAnalysis(symbol, { symbol, available: false, source: "free-source-unavailable" });
  } finally {
    if (shouldRender) renderShell(actions);
  }
}

function checkFibAlerts() {
  const stack = document.getElementById("alertStack");
  if (!stack) return;
  for (const stock of state.stocks) {
    const snapshot = state.snapshots.get(stock.symbol);
    const price = Number(snapshot.price);
    const fib = getFibTarget(stock);
    if (!Number.isFinite(price) || !Number.isFinite(fib)) continue;
    const distance = Math.abs((fib - price) / fib) * 100;
    const key = `${stock.symbol}:${fib}:${state.ui.alertThreshold}`;
    if (distance > Number(state.ui.alertThreshold || 0.5) || state.alerts.has(key)) continue;
    state.alerts.add(key);
    const text = `${stock.symbol} Fibonacci seviyesine yaklaştı: ${distance.toFixed(2)}%`;
    const toast = document.createElement("div");
    toast.className = "fib-toast";
    toast.textContent = text;
    stack.appendChild(toast);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("Fibonacci uyarısı", { body: text });
    }
    try {
      const audio = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
      audio.volume = 0.15;
      audio.play().catch(() => {});
    } catch {
      // Sound is optional.
    }
    setTimeout(() => toast.remove(), 9000);
  }
}

async function requestNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
  renderShell(actions);
}

async function start() {
  try {
    applyTheme();
    renderShell(actions);
    loadNasdaqUniverse();
    await refreshAll();
    setInterval(refreshAll, 60000);
  } catch (error) {
    const app = document.getElementById("app");
    if (app) {
      app.innerHTML = `<main class="page-shell"><section class="hero"><div><h1>Hisse Takip Dashboard</h1><p class="subtitle">Uygulama başlatılamadı: ${String(error.message || error)}</p><pre style="white-space:pre-wrap;color:#fecdd3">${String(error.stack || "")}</pre></div></section></main>`;
    }
    console.error(error);
  }
}

start();
