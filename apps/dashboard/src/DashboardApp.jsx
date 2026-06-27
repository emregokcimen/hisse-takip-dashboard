import React from "react";
import "./dashboard.css";
import { Badge } from "@ui/Badge.jsx";
import { Button } from "@ui/Button.jsx";
import { Card, CardTitle } from "@ui/Card.jsx";
import { ageLabel, fmtNumber, fmtPct, fmtUsd, signalLabel, targetLabel } from "@shared/formatters.js";
import { alertTypeLabel, computeDynamicFibPlan } from "@shared/signalEngine.js";
import {
  adminLogin,
  adminLogout,
  clearAdminCache,
  clearAdminResearchSnapshots,
  getAnalysis,
  getAdminAudit,
  getAdminCache,
  getAdminExport,
  getAdminJobs,
  getAdminLlm,
  getAdminMe,
  getAdminProviders,
  getAdminResearchSnapshots,
  getAdminSettings,
  getHealth,
  getHistory,
  getNasdaqUniverse,
  getNews,
  getPerformance,
  getResearch,
  getSnapshots,
  getStatus,
  PROXY_ROOT,
  runAdminJob,
  saveAdminLlm,
  saveAdminProviders,
  saveAdminSettings,
  testAdminLlm,
  testAdminProvider
} from "@shared/api.js";
import {
  acknowledgeAlert,
  addAlertRule,
  addCustomCategory,
  addCustomStock,
  applyTheme,
  clearTriggeredAlerts,
  evaluateStockAlerts,
  getCategories,
  getHistory as getCachedHistory,
  getKpis,
  getSymbols,
  getVisibleRows,
  mergeSnapshot,
  persistSnapshots,
  removeAlertRule,
  removeCustomCategory,
  removeStockFromList,
  renameCustomCategory,
  resetFibTarget,
  setAnalysis,
  setCatalogStatus,
  setFibTarget,
  setFilters,
  setHistory,
  setInvestmentPlan,
  setNasdaqUniverse,
  setNasdaqUniverseStatus,
  setNews,
  setPerformance,
  setUi,
  state,
  toggleFavorite
} from "@shared/stateBridge.js";

const REFRESH_MS = 60000;
const RETURN_PERIODS = [1, 3, 6, 12];
const DETAIL_TABS = [
  ["grafik", "Grafik"],
  ["haberler", "Haberler"],
  ["analiz", "Analiz"],
  ["notlar", "Notlar"]
];
const SIGNAL_TABS = [
  ["active", "Aktif Sinyaller"],
  ["rules", "Alarm Kuralları"],
  ["alerts", "Tetiklenen Alarmlar"],
  ["history", "Sinyal Geçmişi"]
];
const ALERT_TYPE_OPTIONS = [
  "target_near",
  "fib_breakout",
  "rsi_extreme",
  "macd_cross",
  "ma_trend_break",
  "bollinger_breakout",
  "volume_spike",
  "news_high",
  "risk_rising"
];

let refreshInFlight = false;

export default function DashboardApp() {
  const [renderVersion, forceRender] = React.useReducer((value) => value + 1, 0);
  const [route, setRoute] = React.useState(getRoute());
  const [commandOpen, setCommandOpen] = React.useState(false);
  const rerender = React.useCallback(() => forceRender(), []);

  React.useEffect(() => {
    applyTheme();
    bootstrap(rerender);
    const timer = window.setInterval(() => refreshAll(rerender), REFRESH_MS);
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [rerender]);

  const rows = React.useMemo(() => getVisibleRows(), [renderVersion]);
  const selected = rows.find((row) => row.symbol === state.selectedSymbol)
    || state.stocks.map((stock) => rows.find((row) => row.symbol === stock.symbol)).find(Boolean)
    || rows[0];
  const kpis = getKpis(rows);

  React.useEffect(() => {
    if (selected?.symbol && selected.symbol !== state.selectedSymbol) {
      state.selectedSymbol = selected.symbol;
      loadSelectedNews(rerender, false);
      loadSelectedAnalysis(rerender, false);
    }
  }, [selected?.symbol, renderVersion, rerender]);

  React.useEffect(() => {
    const onCommandKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setCommandOpen(false);
      }
    };
    window.addEventListener("keydown", onCommandKey);
    return () => window.removeEventListener("keydown", onCommandKey);
  }, []);

  return (
    <div className="mfe-app">
      <Sidebar route={route} />
      <main className="mfe-main">
        <Topbar onRefresh={() => refreshAll(rerender, { manual: true })} />
        {route === "admin" ? (
          <AdminPage />
        ) : route === "research" ? (
          <>
            <MarketStrip kpis={kpis} />
            <ResearchPage rows={rows} selected={selected} onChange={rerender} />
          </>
        ) : route === "portfolio" ? (
          <>
            <MarketStrip kpis={kpis} />
            <PortfolioPage rows={rows} onChange={rerender} />
          </>
        ) : route === "reports" ? (
          <>
            <MarketStrip kpis={kpis} />
            <ReportsPage rows={rows} kpis={kpis} onChange={rerender} />
          </>
        ) : route === "screener" ? (
          <>
            <MarketStrip kpis={kpis} />
            <ScreenerPage rows={rows} onChange={rerender} />
          </>
        ) : route === "signals" ? (
          <>
            <MarketStrip kpis={kpis} />
            <SignalsPage rows={rows} onChange={rerender} />
            <div className="signals-workspace">
              <StockDetailPanel row={selected} onChange={rerender} />
            </div>
          </>
        ) : (
          <>
            <MarketStrip kpis={kpis} />
            <KpiGrid kpis={kpis} />
            <InsightGrid kpis={kpis} onChange={rerender} />
            <FilterToolbar onChange={rerender} />
            <div className="workspace-grid">
              <section className="workspace-left">
                <CatalogManager onChange={rerender} />
                <StockTable rows={rows} selected={selected} onChange={rerender} />
                <StockCardList rows={rows} selected={selected} onChange={rerender} />
              </section>
              <StockDetailPanel row={selected} onChange={rerender} />
            </div>
          </>
        )}
      </main>
      <div id="alertStack" className="toast-stack" />
      {commandOpen ? <CommandPalette rows={rows} onClose={() => setCommandOpen(false)} onChange={rerender} /> : null}
    </div>
  );
}

function getRoute() {
  const hash = String(window.location.hash || "#dashboard").replace("#", "");
  if (hash === "signals") return "signals";
  if (hash === "screener") return "screener";
  if (hash === "research") return "research";
  if (hash === "portfolio") return "portfolio";
  if (hash === "reports") return "reports";
  if (hash === "admin") return "admin";
  return "dashboard";
}

async function bootstrap(rerender) {
  if (!state.nasdaqUniverse.length) loadNasdaqUniverse(rerender);
  await refreshAll(rerender, { renderStart: true });
}

async function refreshAll(rerender, options = {}) {
  if (refreshInFlight) return;
  refreshInFlight = true;
  state.loading = true;
  state.error = null;
  if (options.renderStart) rerender();

  try {
    const [health, status] = await Promise.allSettled([getHealth(), getStatus()]);
    state.proxyStatus = {
      health: health.status === "fulfilled" ? health.value : null,
      status: status.status === "fulfilled" ? status.value : null
    };

    await loadSnapshots(getSymbols());
    state.lastRefreshAt = Date.now();
    state.loading = false;
    rerender();

    await loadSecondaryData();
    await Promise.allSettled([
      loadSelectedNews(rerender, false),
      loadSelectedAnalysis(rerender, false)
    ]);
    checkFibAlerts();
    showTriggeredAlerts(evaluateStockAlerts(getVisibleRows()));
  } catch (error) {
    state.loading = false;
    state.error = error.message || String(error);
  } finally {
    refreshInFlight = false;
    rerender();
  }
}

async function loadSnapshots(symbols) {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  const failures = [];
  for (let index = 0; index < unique.length; index += 12) {
    const chunk = unique.slice(index, index + 12);
    try {
      const snapshots = await getSnapshots(chunk);
      snapshots.forEach(mergeSnapshot);
    } catch (error) {
      failures.push(error);
    }
  }
  if (!state.snapshots.size && failures.length) throw failures[0];
  persistSnapshots();
}

async function loadSecondaryData() {
  const symbols = getSymbols();
  const selected = state.selectedSymbol || symbols[0];
  const priority = Array.from(new Set([selected, ...symbols.slice(0, 18), ...symbols]));
  for (let index = 0; index < priority.length; index += 6) {
    const chunk = priority.slice(index, index + 6);
    await Promise.allSettled(chunk.flatMap((symbol) => [
      getHistory(symbol, state.ui.historyRange, state.ui.historyInterval).then((points) => setHistory(symbol, state.ui.historyRange, state.ui.historyInterval, points)),
      getPerformance(symbol).then((performance) => setPerformance(symbol, performance))
    ]));
  }
}

async function loadNasdaqUniverse(rerender, force = false) {
  setNasdaqUniverseStatus("loading", force ? "Nasdaq listesi yenileniyor..." : "Nasdaq listesi yükleniyor...");
  rerender();
  try {
    const universe = await getNasdaqUniverse("", 6000, force);
    setNasdaqUniverse(universe);
    const count = universe.count || universe.rows.length || 0;
    setNasdaqUniverseStatus(universe.stale ? "warning" : "success", `${fmtNumber(count)} Nasdaq hissesi hazır.`);
  } catch (error) {
    setNasdaqUniverseStatus("error", `Nasdaq listesi alınamadı: ${error.message}`);
  } finally {
    rerender();
  }
}

async function loadSelectedNews(rerender, shouldRender = true) {
  const symbol = state.selectedSymbol || getSymbols()[0];
  try {
    setNews(symbol, await getNews(symbol));
  } catch {
    setNews(symbol, { symbol, items: [], source: "Yahoo Finance RSS" });
  } finally {
    if (shouldRender) rerender();
  }
}

async function loadSelectedAnalysis(rerender, shouldRender = true) {
  const symbol = state.selectedSymbol || getSymbols()[0];
  try {
    setAnalysis(symbol, await getAnalysis(symbol));
  } catch {
    setAnalysis(symbol, { symbol, available: false, source: "free-source-unavailable" });
  } finally {
    if (shouldRender) rerender();
  }
}

function checkFibAlerts() {
  const stack = document.getElementById("alertStack");
  if (!stack) return;
  for (const stock of state.stocks) {
    const snapshot = state.snapshots.get(stock.symbol);
    const price = Number(snapshot?.price);
    const fib = Number(state.fibTargets[stock.symbol] || stock.fibTarget);
    if (!Number.isFinite(price) || !Number.isFinite(fib)) continue;
    const distance = Math.abs((fib - price) / fib) * 100;
    const key = `${stock.symbol}:${fib}:${state.ui.alertThreshold}`;
    if (distance > Number(state.ui.alertThreshold || 0.5) || state.alerts.has(key)) continue;
    state.alerts.add(key);
    const toast = document.createElement("div");
    toast.className = "fib-toast";
    toast.textContent = `${stock.symbol} Fibonacci hedefine yaklaştı: ${distance.toFixed(2)}%`;
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 9000);
  }
}

function showTriggeredAlerts(alerts = []) {
  const stack = document.getElementById("alertStack");
  if (!stack || !alerts.length) return;
  for (const alert of alerts.slice(0, 5)) {
    const toast = document.createElement("div");
    toast.className = `fib-toast signal-alert-toast ${alert.severity || "info"}`;
    toast.textContent = `${alert.symbol} · ${alert.title}: ${alert.message}`;
    stack.appendChild(toast);
    window.setTimeout(() => toast.remove(), 10000);
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(`Matrix ${alert.symbol}`, { body: alert.message, tag: alert.id });
    }
  }
}

function Sidebar({ route }) {
  return (
    <aside className="mfe-sidebar">
      <div className="brand-mark" aria-label="Matrix"><span className="matrix-symbol">M</span><span className="matrix-word">Matrix</span></div>
      <nav>
        <a href="#dashboard" className={route === "dashboard" ? "active" : ""}>Panel</a>
        <a href="#signals" className={route === "signals" ? "active" : ""}>Sinyaller</a>
        <a href="#screener" className={route === "screener" ? "active" : ""}>Tarama</a>
        <a href="#research" className={route === "research" ? "active" : ""}>Araştırma</a>
        <a href="#portfolio" className={route === "portfolio" ? "active" : ""}>Portföy</a>
        <a href="#reports" className={route === "reports" ? "active" : ""}>Raporlar</a>
        <a href="#catalog">Katalog</a>
        <a href="#admin" className={route === "admin" ? "active" : ""}>Yönetim</a>
      </nav>
      <div className="sidebar-note">Yatırım izleme ve analiz paneli</div>
    </aside>
  );
}

function Topbar({ onRefresh }) {
  const proxyOk = Boolean(state.proxyStatus?.health?.success || state.proxyStatus?.health?.data?.service);
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Canlı piyasa izleme</p>
        <h1>Matrix Finans Paneli</h1>
      </div>
      <div className="topbar-actions">
        <Badge tone={proxyOk ? "success" : "warning"}>{proxyOk ? "Proxy canlı" : "Proxy kontrol"}</Badge>
        <span className="muted">{state.lastRefreshAt ? `Son yenileme ${new Date(state.lastRefreshAt).toLocaleTimeString("tr-TR")}` : "Henüz yenilenmedi"}</span>
        <Button onClick={onRefresh} disabled={state.loading}>{state.loading ? "Yenileniyor" : "Yenile"}</Button>
      </div>
      {state.error ? <div className="error-banner">Veri alınamadı: {state.error}</div> : null}
    </header>
  );
}

function MarketStrip({ kpis }) {
  const groups = [
    ["Fib'e en yakın", kpis.closestFib],
    ["12A güçlü", kpis.strongest12m],
    ["Haber pozitif", kpis.topNewsPositive],
    ["Risk yüksek", kpis.topHighRisk]
  ];
  return (
    <Card className="market-strip">
      <div className="market-strip-head">
        <span>Piyasa Özeti</span>
        <strong>{state.loading ? "Veriler yenileniyor" : "Canlı takip aktif"}</strong>
      </div>
      {groups.map(([title, items]) => (
        <div key={title} className="market-mini">
          <span>{title}</span>
          <strong>{items.slice(0, 3).map((row) => row.symbol).join(" · ") || "-"}</strong>
        </div>
      ))}
    </Card>
  );
}

function KpiGrid({ kpis }) {
  const items = [
    ["Görünen", kpis.total, "filtre sonrası"],
    ["Fib'e yakın", kpis.nearFib, `${state.ui.alertThreshold}% eşik`],
    ["Canlı", kpis.live, "güncel kaynak"],
    ["Haber +", kpis.newsPositive, "pozitif etki"],
    ["Haber -", kpis.newsNegative, "negatif etki"],
    ["Risk yüksek", kpis.highRisk, "kontrol gerekli"],
    ["Özel hedef", kpis.customTargets, `${kpis.targetAbove} hedef üstü`],
    ["Güçlü sinyal", kpis.strongTechnical, "teknik olumlu"]
  ];
  return (
    <section className="kpi-grid">
      {items.map(([label, value, sub]) => (
        <Card key={label} className="kpi-card">
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{sub}</small>
        </Card>
      ))}
    </section>
  );
}

function InsightGrid({ kpis, onChange }) {
  const cards = [
    ["Momentum + Haber", "Skor", kpis.topMomentumNews, (row) => fmtNumber(row.momentumNewsScore, 1)],
    ["Analist Hedefi", "Analist fiyatı", kpis.topAnalystTarget, (row) => fmtUsd(row.analysisTargetPrice)],
    ["Hedefe En Yakın", "Fib uzaklığı", kpis.topTargetClosest, (row) => fmtPct(row.targetDistancePct)]
  ];
  return (
    <section className="insight-grid">
      {cards.map(([title, valueLabel, items, value]) => (
        <Card key={title} className="insight-card">
          <div className="insight-head">
            <span>{title}</span>
            <strong>{items?.[0]?.symbol || "-"}</strong>
          </div>
          <div className="insight-list">
            {(items || []).slice(0, 3).map((row) => (
              <button key={row.symbol} onClick={() => { selectRow(row.symbol, onChange); setUi({ detailTab: "grafik" }); onChange(); }}>
                <span>{row.symbol}</span>
                <small>{row.company}</small>
                <b><em>{valueLabel}</em>{value(row)}</b>
              </button>
            ))}
          </div>
        </Card>
      ))}
    </section>
  );
}

function SignalsPage({ rows, onChange }) {
  const [tab, setTab] = React.useState("active");
  const sortedRows = React.useMemo(() => [...rows].sort((a, b) => (b.signalDetail?.score || 0) - (a.signalDetail?.score || 0)), [rows]);
  const activeAlerts = state.triggeredAlerts.filter((alert) => !alert.acknowledged);
  const [notificationPermission, setNotificationPermission] = React.useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const signalCounts = {
    buy: rows.filter((row) => ["strong_buy", "buy"].includes(row.technicalSignal)).length,
    watch: rows.filter((row) => row.technicalSignal === "watch").length,
    risky: rows.filter((row) => ["risky", "sell", "strong_sell"].includes(row.technicalSignal)).length,
    alerts: activeAlerts.length,
    macdCross: rows.filter((row) => ["bullish", "bearish"].includes(row.signalDetail?.indicators?.macdCross)).length,
    volumeSpike: rows.filter((row) => Number(row.signalDetail?.indicators?.volumeSpikeRatio) >= 1.8).length,
    fibConfidence: rows.filter((row) => Number(row.signalDetail?.fibPlan?.confidence) >= 70).length
  };
  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return setNotificationPermission("unsupported");
    const next = await Notification.requestPermission();
    setNotificationPermission(next);
  };

  return (
    <Card className="signals-center" id="signals">
      <div className="signals-hero">
        <div>
          <p className="eyebrow">Sinyal merkezi</p>
          <h2>Teknik analiz, haber etkisi ve alarm motoru</h2>
          <small>Bu alan analiz ve izleme amaçlıdır; yatırım tavsiyesi değildir.</small>
          <div className="signal-hero-actions">
            <Button type="button" variant={notificationPermission === "granted" ? "secondary" : "primary"} onClick={requestNotifications}>
              {notificationPermission === "granted" ? "Bildirim açık" : notificationPermission === "denied" ? "Bildirim engelli" : "Bildirimleri aç"}
            </Button>
            <span>{activeAlerts.length ? `${activeAlerts.length} okunmamış alarm` : "Alarm kuyruğu temiz"}</span>
          </div>
        </div>
        <div className="signals-score-grid">
          <Metric label="Al/Güçlü Al" value={signalCounts.buy} />
          <Metric label="İzle" value={signalCounts.watch} />
          <Metric label="Riskli/Sat" value={signalCounts.risky} />
          <Metric label="Aktif alarm" value={signalCounts.alerts} tone={signalCounts.alerts ? "down" : ""} />
        </div>
      </div>
      <SignalResearchPanel rows={rows} stats={signalCounts} />
      <div className="signal-tabs">
        {SIGNAL_TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {tab === "active" ? <SignalTable rows={sortedRows} onChange={onChange} /> : null}
      {tab === "rules" ? <AlertRuleBuilder rows={rows} onChange={onChange} /> : null}
      {tab === "alerts" ? <TriggeredAlerts onChange={onChange} /> : null}
      {tab === "history" ? <SignalHistory rows={sortedRows} onChange={onChange} /> : null}
    </Card>
  );
}

function SignalResearchPanel({ rows, stats }) {
  const strongest = [...rows].filter((row) => Number.isFinite(row.signalDetail?.score)).sort((a, b) => (b.signalDetail?.score || 0) - (a.signalDetail?.score || 0)).slice(0, 4);
  const warning = [...rows].filter((row) => ["risky", "sell", "strong_sell"].includes(row.technicalSignal)).sort((a, b) => (b.signalDetail?.riskScore || 0) - (a.signalDetail?.riskScore || 0)).slice(0, 4);
  const fibWatch = [...rows].filter((row) => Number.isFinite(row.signalDetail?.fibPlan?.confidence)).sort((a, b) => (b.signalDetail?.fibPlan?.confidence || 0) - (a.signalDetail?.fibPlan?.confidence || 0)).slice(0, 4);
  return (
    <div className="signal-research-panel">
      <div className="research-card">
        <span>İndikatör kapsamı</span>
        <strong>RSI, MACD, MA20/50/150/200, Bollinger, ATR, hacim</strong>
        <small>{stats.macdCross} MACD kesişimi · {stats.volumeSpike} hacim sıçraması</small>
      </div>
      <div className="research-card">
        <span>Dinamik Fibonacci</span>
        <strong>1 yıllık pivot swing + retracement/extension</strong>
        <small>{stats.fibConfidence} hissede Fib güveni yüksek</small>
      </div>
      <MiniSignalList title="En güçlü sinyaller" rows={strongest} value={(row) => fmtNumber(row.signalDetail?.score, 0)} />
      <MiniSignalList title="Risk kontrol" rows={warning} value={(row) => fmtNumber(row.signalDetail?.riskScore, 0)} />
      <MiniSignalList title="Fib izleme" rows={fibWatch} value={(row) => `${fmtNumber(row.signalDetail?.fibPlan?.confidence, 0)}%`} />
    </div>
  );
}

function MiniSignalList({ title, rows, value }) {
  return (
    <div className="research-list">
      <span>{title}</span>
      {rows.length ? rows.map((row) => (
        <div key={row.symbol}>
          <b>{row.symbol}</b>
          <small>{signalLabel(row.technicalSignal)}</small>
          <strong>{value(row)}</strong>
        </div>
      )) : <small>Veri hazırlanıyor</small>}
    </div>
  );
}

function SignalTable({ rows, onChange }) {
  return (
    <div className="signal-table-wrap">
      <table className="signal-table">
        <thead>
          <tr>
            <th>Hisse</th>
            <th>Fiyat</th>
            <th>Sinyal</th>
            <th>Tetikleyici</th>
            <th>Skor</th>
            <th>Güven</th>
            <th>Haber</th>
            <th>Risk</th>
            <th>Hedef</th>
            <th>Son güncelleme</th>
            <th>Nedenler</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const signal = row.signalDetail || {};
            return (
              <tr key={row.symbol} onClick={() => { selectRow(row.symbol, onChange); setUi({ detailTab: "grafik" }); onChange(); }}>
                <td><strong>{row.symbol}</strong><small>{row.company}</small></td>
                <td>{fmtUsd(row.price)}</td>
                <td><span className={`signal-pill ${signalToneClass(row.technicalSignal)}`}>{signalLabel(row.technicalSignal)}</span></td>
                <td><TriggerStack row={row} /></td>
                <td><b>{fmtNumber(signal.score, 0)}</b></td>
                <td>{fmtNumber(signal.confidence, 0)}%</td>
                <td><Badge tone={newsTone(row.newsSentiment)}>{newsLabel(row.newsSentiment)}</Badge></td>
                <td><Badge tone={riskTone(signal.risk || row.riskLevel)}>{riskLabel(signal.risk || row.riskLevel)}</Badge></td>
                <td>{targetLabel(row.targetStatus)}</td>
                <td>{ageLabel(row.snapshot?.sourceFreshnessSec)}</td>
                <td>
                  <div className="signal-reasons">
                    {(signal.reasons || ["Sinyal nedeni hazırlanıyor."]).slice(0, 3).map((reason) => <span key={reason}>{reason}</span>)}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TriggerStack({ row }) {
  const indicators = row.signalDetail?.indicators || {};
  const fibPlan = row.signalDetail?.fibPlan || {};
  const triggers = [
    indicators.macdCross === "bullish" ? ["MACD ↑", "positive"] : null,
    indicators.macdCross === "bearish" ? ["MACD ↓", "negative"] : null,
    Number(indicators.volumeSpikeRatio) >= 1.8 ? [`Hacim ${fmtNumber(indicators.volumeSpikeRatio, 1)}x`, "warning"] : null,
    indicators.bollingerPosition === "upper" ? ["Bollinger üst", "warning"] : null,
    indicators.bollingerPosition === "lower" ? ["Bollinger alt", "positive"] : null,
    Number(fibPlan.confidence) >= 70 ? [`Fib ${fmtNumber(fibPlan.confidence, 0)}%`, "neutral"] : null,
    row.newsImpact === "high" ? ["Haber yüksek", row.newsSentiment === "negative" ? "negative" : "positive"] : null
  ].filter(Boolean);
  return (
    <div className="trigger-stack">
      {triggers.length ? triggers.slice(0, 4).map(([label, tone]) => <span key={label} className={tone}>{label}</span>) : <small>Standart takip</small>}
    </div>
  );
}

function AlertRuleBuilder({ rows, onChange }) {
  const categories = getCategories();
  const [draft, setDraft] = React.useState({
    name: "Yeni alarm",
    type: "target_near",
    scope: "all",
    symbol: rows[0]?.symbol || "",
    category: categories[0] || "",
    threshold: 1,
    enabled: true
  });
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const symbols = rows.map((row) => row.symbol);

  return (
    <div className="alert-rules-grid">
      <form className="alert-rule-form" onSubmit={(event) => {
        event.preventDefault();
        addAlertRule({ ...draft, id: `rule-${Date.now()}`, createdAt: Date.now() });
        onChange();
      }}>
        <label className="field"><span>Alarm adı</span><input value={draft.name} onChange={(event) => patch("name", event.target.value)} /></label>
        <SelectField label="Kural tipi" value={draft.type} onChange={(value) => patch("type", value)}>
          {ALERT_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{alertTypeLabel(type)}</option>)}
        </SelectField>
        <SelectField label="Kapsam" value={draft.scope} onChange={(value) => patch("scope", value)}>
          <option value="all">Tüm hisseler</option>
          <option value="symbol">Tek hisse</option>
          <option value="category">Kategori</option>
        </SelectField>
        {draft.scope === "symbol" ? (
          <SelectField label="Hisse" value={draft.symbol} onChange={(value) => patch("symbol", value)}>
            {symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
          </SelectField>
        ) : null}
        {draft.scope === "category" ? (
          <SelectField label="Kategori" value={draft.category} onChange={(value) => patch("category", value)}>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </SelectField>
        ) : null}
        <label className="field"><span>Eşik</span><input type="number" step="0.1" value={draft.threshold ?? ""} onChange={(event) => patch("threshold", event.target.value)} /></label>
        <Button type="submit">Alarm Kur</Button>
        <Button type="button" variant="secondary" onClick={() => {
          if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
        }}>Tarayıcı Bildirimini Aç</Button>
      </form>
      <div className="alert-rule-list">
        {state.alertRules.map((rule) => (
          <div className="alert-rule-row" key={rule.id}>
            <div>
              <strong>{rule.name}</strong>
              <small>{alertTypeLabel(rule.type)} · {rule.scope === "all" ? "Tüm hisseler" : rule.scope === "symbol" ? rule.symbol : rule.category}</small>
            </div>
            <Badge tone={rule.enabled ? "success" : "warning"}>{rule.enabled ? "Aktif" : "Pasif"}</Badge>
            <button type="button" onClick={() => { removeAlertRule(rule.id); onChange(); }}>Sil</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TriggeredAlerts({ onChange }) {
  return (
    <div className="triggered-alerts">
      <div className="signal-section-head">
        <strong>{state.triggeredAlerts.length} alarm kaydı</strong>
        <Button variant="secondary" onClick={() => { clearTriggeredAlerts(); onChange(); }}>Geçmişi Temizle</Button>
      </div>
      {state.triggeredAlerts.length ? state.triggeredAlerts.map((alert) => (
        <div className={`triggered-alert ${alert.severity}`} key={alert.id}>
          <div>
            <strong>{alert.symbol} · {alert.title}</strong>
            <p>{alert.message}</p>
            <small>{new Date(alert.createdAt).toLocaleString("tr-TR")}</small>
          </div>
          <Button variant="secondary" onClick={() => { acknowledgeAlert(alert.id); onChange(); }}>{alert.acknowledged ? "Onaylandı" : "Onayla"}</Button>
        </div>
      )) : <p className="empty">Henüz tetiklenen alarm yok.</p>}
    </div>
  );
}

function SignalHistory({ rows, onChange }) {
  return (
    <div className="signal-history-grid">
      {rows.slice(0, 18).map((row) => (
        <button key={row.symbol} className="signal-history-card" onClick={() => { selectRow(row.symbol, onChange); setUi({ detailTab: "grafik" }); onChange(); }}>
          <span>{row.symbol}</span>
          <strong>{signalLabel(row.technicalSignal)}</strong>
          <small>{(row.signalDetail?.reasons || []).slice(0, 2).join(" · ") || "Sinyal nedeni yok"}</small>
          <b>{fmtNumber(row.signalDetail?.score, 0)}</b>
        </button>
      ))}
    </div>
  );
}

const SCREENER_PRESETS = [
  ["all", "Tüm görünür hisseler"],
  ["fib", "Fib'e yakın"],
  ["momentum", "Momentum güçlü"],
  ["newsPositive", "Haber pozitif"],
  ["lowRsi", "RSI düşük"],
  ["highRisk", "Risk yüksek"],
  ["analystUpside", "Analist hedef üstü"]
];

const SCREENER_PRESET_STORAGE_KEY = "matrix-screener-presets-v1";
const DEFAULT_SCREENER_CRITERIA = {
  minScore: "",
  maxRisk: "",
  minAnalystUpside: "",
  triggerCategory: "all"
};
const SCREENER_TRIGGER_OPTIONS = [
  ["all", "Tüm triggerlar"],
  ["technical", "Teknik"],
  ["volume", "Hacim"],
  ["fib", "Fib"],
  ["news", "Haber"],
  ["risk", "Risk"]
];
const BROKER_IMPORT_STORAGE_KEY = "matrix-broker-import-preview-v1";
const REPORT_HISTORY_STORAGE_KEY = "matrix-report-history-v1";
const BROKER_SAMPLE_CSV = "symbol,date,type,quantity,price,note\nNVDA,2026-06-26,buy,10,192.5,ilk alım\nAMD,2026-06-27,sell,4,165.2,kısmi satış";

function readSavedScreenerPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SCREENER_PRESET_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(sanitizeSavedScreenerPreset).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writeSavedScreenerPresets(items) {
  localStorage.setItem(SCREENER_PRESET_STORAGE_KEY, JSON.stringify(items));
}

function sanitizeSavedScreenerPreset(item) {
  if (!item || typeof item !== "object") return null;
  const id = String(item.id || "").trim();
  const name = String(item.name || "").trim().slice(0, 48);
  if (!id || !name) return null;
  return {
    id,
    name,
    preset: SCREENER_PRESETS.some(([presetId]) => presetId === item.preset) ? item.preset : "all",
    filters: sanitizeScreenerPresetFilters(item.filters),
    criteria: sanitizeScreenerCriteria(item.criteria),
    alertThreshold: Number.isFinite(Number(item.alertThreshold)) ? Number(item.alertThreshold) : Number(state.ui.alertThreshold || 1),
    createdAt: Number(item.createdAt) || Date.now()
  };
}

function sanitizeScreenerPresetFilters(filters = {}) {
  return {
    search: String(filters.search || ""),
    category: String(filters.category || "all"),
    status: String(filters.status || "all"),
    sortBy: String(filters.sortBy || "fibDistancePct"),
    sortDir: filters.sortDir === "desc" ? "desc" : "asc",
    returnPeriod: Number(filters.returnPeriod) || 12,
    target: String(filters.target || "all"),
    signal: String(filters.signal || "all"),
    news: String(filters.news || "all"),
    fibOnly: Boolean(filters.fibOnly),
    favoritesOnly: Boolean(filters.favoritesOnly)
  };
}

function sanitizeScreenerCriteria(criteria = {}) {
  const triggerCategory = SCREENER_TRIGGER_OPTIONS.some(([id]) => id === criteria.triggerCategory) ? criteria.triggerCategory : "all";
  return {
    minScore: Number.isFinite(Number(criteria.minScore)) && String(criteria.minScore).trim() !== "" ? String(Number(criteria.minScore)) : "",
    maxRisk: Number.isFinite(Number(criteria.maxRisk)) && String(criteria.maxRisk).trim() !== "" ? String(Number(criteria.maxRisk)) : "",
    minAnalystUpside: Number.isFinite(Number(criteria.minAnalystUpside)) && String(criteria.minAnalystUpside).trim() !== "" ? String(Number(criteria.minAnalystUpside)) : "",
    triggerCategory
  };
}

function ScreenerPage({ rows, onChange }) {
  const [preset, setPreset] = React.useState("all");
  const [presetName, setPresetName] = React.useState("");
  const [savedPresets, setSavedPresets] = React.useState(() => readSavedScreenerPresets());
  const [criteria, setCriteria] = React.useState(DEFAULT_SCREENER_CRITERIA);
  const [compareSymbols, setCompareSymbols] = React.useState(() => rows.slice(0, 3).map((row) => row.symbol));
  const screenedRows = React.useMemo(() => buildScreenerRows(rows, preset, criteria), [rows, preset, criteria]);
  const metrics = React.useMemo(() => getScreenerMetrics(screenedRows), [screenedRows]);
  const heatmap = React.useMemo(() => buildCategoryHeatmap(screenedRows), [screenedRows]);
  const compareRows = compareSymbols
    .map((symbol) => rows.find((row) => row.symbol === symbol))
    .filter(Boolean)
    .slice(0, 4);
  const toggleCompare = (symbol) => {
    setCompareSymbols((current) => {
      if (current.includes(symbol)) return current.filter((item) => item !== symbol);
      return [...current, symbol].slice(-4);
    });
  };
  const openDashboardRow = (symbol) => {
    selectRow(symbol, onChange);
    setUi({ detailTab: "grafik" });
    window.location.hash = "dashboard";
    onChange();
  };
  const saveCurrentPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const item = {
      id: `screen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      preset,
      filters: sanitizeScreenerPresetFilters(state.filters),
      criteria,
      alertThreshold: Number(state.ui.alertThreshold || 1),
      createdAt: Date.now()
    };
    setSavedPresets((current) => {
      const next = [item, ...current.filter((saved) => saved.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
      writeSavedScreenerPresets(next);
      return next;
    });
    setPresetName("");
  };
  const applySavedPreset = (item) => {
    setPreset(item.preset || "all");
    setFilters(sanitizeScreenerPresetFilters(item.filters));
    setCriteria(sanitizeScreenerCriteria(item.criteria));
    setUi({ alertThreshold: Number(item.alertThreshold || state.ui.alertThreshold || 1) });
    onChange();
  };
  const deleteSavedPreset = (id) => {
    setSavedPresets((current) => {
      const next = current.filter((item) => item.id !== id);
      writeSavedScreenerPresets(next);
      return next;
    });
  };

  React.useEffect(() => {
    setCompareSymbols((current) => {
      const valid = current.filter((symbol) => rows.some((row) => row.symbol === symbol));
      return valid.length ? valid.slice(0, 4) : rows.slice(0, 3).map((row) => row.symbol);
    });
  }, [rows]);

  return (
    <section className="pro-page screener-page" id="screener">
      <div className="section-header">
        <div>
          <p className="eyebrow">Hisse tarama</p>
          <h2>Çok kriterli hisse tarama ve karşılaştırma</h2>
          <p className="section-note">Fib, momentum, haber, risk, RSI ve analist hedeflerini aynı satır modelinden izler. Bu alan analiz ve izleme amaçlıdır; yatırım tavsiyesi değildir.</p>
          <p className="screener-sort-context">Aktif liste: <strong>{rows.length} hisse</strong> · Sonuç: <strong>{screenedRows.length}</strong> · Preset: <strong>{SCREENER_PRESETS.find(([id]) => id === preset)?.[1]}</strong></p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => downloadScreenerCsv(screenedRows)}>CSV Dışa Aktar</Button>
          <Button variant="secondary" onClick={() => { setFilters({ sortBy: "targetClosest", sortDir: "asc" }); onChange(); }}>Fib'e Göre Sırala</Button>
        </div>
      </div>

      <div className="screener-summary-strip">
        <Metric label="Sonuç" value={metrics.total} />
        <Metric label="Pozitif getiri" value={metrics.positiveReturn} tone="up" />
        <Metric label="Fib yakın" value={metrics.nearFib} />
        <Metric label="Risk yüksek" value={metrics.highRisk} tone={metrics.highRisk ? "down" : ""} />
        <Metric label="Analist üstü" value={metrics.analystUpside} tone="up" />
        <Metric label="Haber pozitif" value={metrics.positiveNews} tone="up" />
      </div>

      <div className="screener-grid">
        <Card>
          <CardTitle title="Kriter Presetleri" subtitle="Tek tıkla hazır taramalar" />
          <div className="preset-row">
            {SCREENER_PRESETS.map(([id, label]) => (
              <button key={id} type="button" className={`toggle-pill ${preset === id ? "active" : ""}`} onClick={() => setPreset(id)}>{label}</button>
            ))}
          </div>
          <p className="preset-note">Mevcut dashboard filtreleri korunur; bu sayfa sonuçları ayrıca daraltır.</p>
          <div className="active-filter-row">
            <Badge tone="neutral">{state.filters.category === "all" ? "Tüm kategoriler" : state.filters.category}</Badge>
            <Badge tone="neutral">{state.filters.status === "all" ? "Tüm durumlar" : state.filters.status}</Badge>
            <Badge tone="neutral">{state.filters.returnPeriod}A getiri</Badge>
            {criteria.minScore ? <Badge tone="neutral">Skor ≥ {criteria.minScore}</Badge> : null}
            {criteria.maxRisk ? <Badge tone="neutral">Risk ≤ {criteria.maxRisk}</Badge> : null}
            {criteria.minAnalystUpside ? <Badge tone="neutral">Analist farkı ≥ %{criteria.minAnalystUpside}</Badge> : null}
            {criteria.triggerCategory !== "all" ? <Badge tone="neutral">{SCREENER_TRIGGER_OPTIONS.find(([id]) => id === criteria.triggerCategory)?.[1]}</Badge> : null}
            {state.filters.fibOnly ? <Badge tone="warning">Fib yakın filtresi aktif</Badge> : null}
            {state.filters.favoritesOnly ? <Badge tone="warning">Favoriler aktif</Badge> : null}
          </div>
          <div className="advanced-screener-grid" data-testid="advanced-screener-criteria">
            <label>
              <span>Min skor</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={criteria.minScore}
                onChange={(event) => setCriteria((current) => ({ ...current, minScore: event.target.value }))}
                placeholder="örn. 60"
              />
            </label>
            <label>
              <span>Max risk</span>
              <input
                type="number"
                min="0"
                step="0.1"
                value={criteria.maxRisk}
                onChange={(event) => setCriteria((current) => ({ ...current, maxRisk: event.target.value }))}
                placeholder="örn. 3.5"
              />
            </label>
            <label>
              <span>Min analist farkı %</span>
              <input
                type="number"
                step="1"
                value={criteria.minAnalystUpside}
                onChange={(event) => setCriteria((current) => ({ ...current, minAnalystUpside: event.target.value }))}
                placeholder="örn. 15"
              />
            </label>
            <SelectField label="Trigger" value={criteria.triggerCategory} onChange={(value) => setCriteria((current) => ({ ...current, triggerCategory: value }))}>
              {SCREENER_TRIGGER_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </SelectField>
            <Button variant="secondary" onClick={() => setCriteria(DEFAULT_SCREENER_CRITERIA)}>Kriterleri Temizle</Button>
          </div>
          <div className="preset-save-row">
            <input
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveCurrentPreset();
              }}
              placeholder="Bu taramayı adlandır"
              aria-label="Screener preset adı"
            />
            <Button variant="secondary" onClick={saveCurrentPreset} disabled={!presetName.trim()}>Kaydet</Button>
          </div>
          <div className="saved-preset-list" data-testid="saved-screener-presets">
            {savedPresets.length ? savedPresets.map((item) => (
              <div className="saved-preset-row" key={item.id}>
                <button type="button" onClick={() => applySavedPreset(item)}>
                  <strong>{item.name}</strong>
                  <small>{SCREENER_PRESETS.find(([id]) => id === item.preset)?.[1] || "Tüm görünür hisseler"} · {item.filters.returnPeriod}A · {formatScreenerCriteriaSummary(item.criteria)} · {new Date(item.createdAt).toLocaleDateString("tr-TR")}</small>
                </button>
                <button type="button" className="danger" onClick={() => deleteSavedPreset(item.id)}>Sil</button>
              </div>
            )) : <p className="preset-note">Kaydedilmiş tarama yok.</p>}
          </div>
        </Card>

        <Card>
          <CardTitle title="Kategori Isı Haritası" subtitle="Ortalama getiri, risk ve haber etkisi" />
          <div className="category-heatmap">
            {heatmap.map((item) => (
              <button key={item.category} type="button" className={`heat-tile ${item.avgReturn >= 0 ? "positive" : "negative"}`} onClick={() => { setFilters({ category: item.category }); onChange(); }}>
                <span>{item.category}</span>
                <strong>{fmtPct(item.avgReturn)}</strong>
                <small>{item.count} hisse · Risk {fmtNumber(item.avgRisk, 1)} · Haber +{item.positiveNews}</small>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="compare-panel">
        <div className="compare-panel-head">
          <div>
            <CardTitle title="Karşılaştırma Matrisi" subtitle="En fazla 4 hisseyi yan yana incele" />
            <p className="compare-panel-copy">Tablodan “Karşılaştır” ile seçim yapabilir, “Grafiği Aç” ile dashboard detayına geçebilirsin.</p>
          </div>
          <div className="active-filter-row">
            {compareRows.map((row) => <Badge key={row.symbol} tone="neutral">{row.symbol}</Badge>)}
          </div>
        </div>
        <div className="compare-grid" data-testid="screener-compare-grid">
          {compareRows.map((row) => (
            <div className="compare-cell" key={row.symbol}>
              <div className="compare-cell-head">
                <strong>{row.symbol}</strong>
                <small>{row.company}</small>
              </div>
              <Metric label="Fiyat" value={fmtUsd(row.price)} />
              <Metric label="Fib uzaklığı" value={fmtPct(row.targetDistancePct)} />
              <Metric label={`${state.filters.returnPeriod}A getiri`} value={fmtPct(row.selectedReturn)} tone={row.selectedReturn >= 0 ? "up" : "down"} />
              <Metric label="Sinyal" value={signalLabel(row.technicalSignal)} />
              <Metric label="Risk" value={riskLabel(row.riskLevel)} tone={row.riskLevel === "high" ? "down" : ""} />
              <Metric label="Analist hedefi" value={fmtUsd(row.analysisTargetPrice)} />
              <Metric label="Hedef farkı" value={fmtPct(getAnalystUpsidePct(row))} tone={analystUpsideTone(row)} />
              <Metric label="Haber skoru" value={fmtNumber(row.newsImpactScore ?? row.newsSentimentScore, 1)} />
              <SignalStrip row={row} compact />
              <TriggerSummary row={row} />
              <ScreenerEvidence row={row} />
            </div>
          ))}
        </div>
      </Card>

      <Card className="pro-table-shell">
        <CardTitle title="Tarama Sonuçları" subtitle={`${screenedRows.length} hisse kriterlere uyuyor`} />
        <table className="pro-table">
          <thead>
            <tr>
              <th>Hisse</th>
              <th>Fiyat</th>
              <th>Fib</th>
              <th>Getiri</th>
              <th>Isı Haritası</th>
              <th>Sinyal</th>
              <th>Haber</th>
              <th>Risk</th>
              <th>Analist</th>
              <th>Trigger</th>
              <th>Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            {screenedRows.map((row) => (
              <tr key={row.symbol} className="screener-result-row">
                <td><strong>{row.symbol}</strong><small>{row.company}</small></td>
                <td>{fmtUsd(row.price)}<small>{ageLabel(row.snapshot?.sourceFreshnessSec)}</small></td>
                <td>{fmtUsd(row.fibTarget)}<small>{fmtPct(row.targetDistancePct)}</small></td>
                <td>{fmtPct(row.selectedReturn)}<small>{state.filters.returnPeriod}A</small></td>
                <td><ReturnHeatmap returns={row.returns} compact /></td>
                <td><SignalStrip row={row} compact /></td>
                <td><Badge tone={newsTone(row.newsSentiment)}>{newsLabel(row.newsSentiment)}</Badge></td>
                <td><Badge tone={riskTone(row.riskLevel)}>{riskLabel(row.riskLevel)}</Badge></td>
                <td>{fmtUsd(row.analysisTargetPrice)}<small>{fmtPct(getAnalystUpsidePct(row))} fark · {row.analysisRecommendation || "-"}</small></td>
                <td><TriggerSummary row={row} /><ScreenerEvidence row={row} compact /></td>
                <td>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => toggleCompare(row.symbol)}>{compareSymbols.includes(row.symbol) ? "Çıkar" : "Karşılaştır"}</Button>
                    <Button variant="secondary" onClick={() => openDashboardRow(row.symbol)}>Grafiği Aç</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

function buildScreenerRows(rows, preset, criteria = DEFAULT_SCREENER_CRITERIA) {
  const cleanCriteria = sanitizeScreenerCriteria(criteria);
  const filtered = rows.filter((row) => {
    if (preset === "fib") return Number.isFinite(row.targetDistancePct) && Math.abs(row.targetDistancePct) <= Number(state.ui.alertThreshold || 1);
    if (preset === "momentum") return Number(row.momentumNewsScore || 0) >= 60 || Number(row.selectedReturn || 0) > 0;
    if (preset === "newsPositive") return row.newsSentiment === "positive" || Number(row.newsSentimentScore || 0) > 0.35;
    if (preset === "lowRsi") return Number(row.signalDetail?.indicators?.rsi14 ?? row.technicals?.rsi14) <= 35;
    if (preset === "highRisk") return row.riskLevel === "high" || Number(row.riskScore || 0) >= 3.5;
    if (preset === "analystUpside") return Number(getAnalystUpsidePct(row)) > 0;
    return true;
  }).filter((row) => {
    const score = Number(row.signalDetail?.score ?? row.score);
    const risk = Number(row.riskScore);
    const analystUpside = Number(getAnalystUpsidePct(row));
    const minScore = Number(cleanCriteria.minScore);
    const maxRisk = Number(cleanCriteria.maxRisk);
    const minAnalystUpside = Number(cleanCriteria.minAnalystUpside);
    if (cleanCriteria.minScore && (!Number.isFinite(score) || score < minScore)) return false;
    if (cleanCriteria.maxRisk && (!Number.isFinite(risk) || risk > maxRisk)) return false;
    if (cleanCriteria.minAnalystUpside && (!Number.isFinite(analystUpside) || analystUpside < minAnalystUpside)) return false;
    if (cleanCriteria.triggerCategory !== "all" && !getScreenerTriggerCategories(row).includes(cleanCriteria.triggerCategory)) return false;
    return true;
  });
  return [...filtered].sort((a, b) => screenerRank(b, preset) - screenerRank(a, preset));
}

function getScreenerTriggerCategories(row) {
  const indicators = row.signalDetail?.indicators || {};
  const fibPlan = row.signalDetail?.fibPlan || {};
  const categories = new Set();
  if (indicators.macdCross || indicators.bollingerPosition || Number(indicators.rsi14 ?? row.technicals?.rsi14) <= 35 || Number(indicators.rsi14 ?? row.technicals?.rsi14) >= 70) categories.add("technical");
  if (Number(indicators.volumeSpikeRatio) >= 1.8) categories.add("volume");
  if (Number(fibPlan.confidence) >= 70 || row.isNearFib) categories.add("fib");
  if (row.newsImpact === "high" || row.newsSentiment === "positive" || row.newsSentiment === "negative") categories.add("news");
  if (row.riskLevel === "high" || Number(row.riskScore || 0) >= 3.5) categories.add("risk");
  return Array.from(categories);
}

function formatScreenerCriteriaSummary(criteria = {}) {
  const clean = sanitizeScreenerCriteria(criteria);
  const parts = [];
  if (clean.minScore) parts.push(`Skor ≥ ${clean.minScore}`);
  if (clean.maxRisk) parts.push(`Risk ≤ ${clean.maxRisk}`);
  if (clean.minAnalystUpside) parts.push(`Analist ≥ %${clean.minAnalystUpside}`);
  if (clean.triggerCategory !== "all") parts.push(SCREENER_TRIGGER_OPTIONS.find(([id]) => id === clean.triggerCategory)?.[1] || clean.triggerCategory);
  return parts.length ? parts.join(" · ") : "ek kriter yok";
}

function screenerRank(row, preset) {
  if (preset === "fib") return 100 - Math.abs(Number(row.targetDistancePct || 100));
  if (preset === "momentum") return Number(row.momentumNewsScore || 0) + Number(row.selectedReturn || 0);
  if (preset === "newsPositive") return Number(row.newsSentimentScore || 0) * 100 + Number(row.newsImpactScore || 0) * 10;
  if (preset === "lowRsi") return 100 - Number(row.signalDetail?.indicators?.rsi14 ?? row.technicals?.rsi14 ?? 100);
  if (preset === "highRisk") return Number(row.riskScore || 0) * 10;
  if (preset === "analystUpside") return Number(getAnalystUpsidePct(row) || -999);
  return Number(row.score || row.signalDetail?.score || 0);
}

function getScreenerMetrics(rows) {
  return {
    total: rows.length,
    positiveReturn: rows.filter((row) => Number(row.selectedReturn || 0) > 0).length,
    nearFib: rows.filter((row) => row.isNearFib || Math.abs(Number(row.targetDistancePct || 999)) <= Number(state.ui.alertThreshold || 1)).length,
    highRisk: rows.filter((row) => row.riskLevel === "high" || Number(row.riskScore || 0) >= 3.5).length,
    analystUpside: rows.filter((row) => Number(getAnalystUpsidePct(row)) > 0).length,
    positiveNews: rows.filter((row) => row.newsSentiment === "positive" || Number(row.newsSentimentScore || 0) > 0.25).length
  };
}

function getAnalystUpsidePct(row) {
  const target = Number(row.analysisTargetPrice);
  const price = Number(row.price);
  if (!Number.isFinite(target) || !Number.isFinite(price) || price <= 0) return null;
  return ((target - price) / price) * 100;
}

function analystUpsideTone(row) {
  const value = getAnalystUpsidePct(row);
  if (!Number.isFinite(Number(value))) return "";
  return Number(value) >= 0 ? "up" : "down";
}

function TriggerSummary({ row }) {
  const categories = getScreenerTriggerCategories(row);
  return (
    <div className="trigger-summary-strip" aria-label="Screener trigger özeti">
      {categories.length ? categories.map((category) => <em key={category} className={category}>{screenerTriggerLabel(category)}</em>) : <em>Trigger yok</em>}
    </div>
  );
}

function ScreenerEvidence({ row, compact = false }) {
  const reason = Array.isArray(row.signalDetail?.reasons) && row.signalDetail.reasons.length
    ? row.signalDetail.reasons[0]
    : "Sinyal kanıtı hazırlanıyor";
  return (
    <div className={`screener-evidence ${compact ? "compact" : ""}`}>
      <span>Risk {fmtNumber(row.riskScore, 1)}</span>
      <span>Haber {fmtNumber(row.newsImpactScore ?? row.newsSentimentScore, 1)}</span>
      <small>{reason}</small>
    </div>
  );
}

function screenerTriggerLabel(category) {
  return SCREENER_TRIGGER_OPTIONS.find(([id]) => id === category)?.[1] || category;
}

function buildCategoryHeatmap(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.category || "Diğer";
    const current = groups.get(key) || { category: key, count: 0, returnSum: 0, riskSum: 0, positiveNews: 0 };
    current.count += 1;
    current.returnSum += Number(row.selectedReturn || 0);
    current.riskSum += Number(row.riskScore || 0);
    current.positiveNews += row.newsSentiment === "positive" ? 1 : 0;
    groups.set(key, current);
  });
  return [...groups.values()]
    .map((item) => ({
      ...item,
      avgReturn: item.count ? item.returnSum / item.count : 0,
      avgRisk: item.count ? item.riskSum / item.count : 0
    }))
    .sort((a, b) => Math.abs(b.avgReturn) - Math.abs(a.avgReturn))
    .slice(0, 12);
}

function downloadScreenerCsv(rows) {
  const headers = [
    "symbol",
    "company",
    "category",
    "price",
    "fibTarget",
    "targetDistancePct",
    "selectedReturn",
    "technicalSignal",
    "riskLevel",
    "riskScore",
    "newsSentiment",
    "analysisTargetPrice",
    "analystUpsidePct",
    "triggerCategories",
    "source",
    "freshnessSec"
  ];
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue({
      symbol: row.symbol,
      company: row.company,
      category: row.category,
      price: row.price,
      fibTarget: row.fibTarget,
      targetDistancePct: row.targetDistancePct,
      selectedReturn: row.selectedReturn,
      technicalSignal: signalLabel(row.technicalSignal),
      riskLevel: riskLabel(row.riskLevel),
      riskScore: row.riskScore,
      newsSentiment: newsLabel(row.newsSentiment),
      analysisTargetPrice: row.analysisTargetPrice,
      analystUpsidePct: getAnalystUpsidePct(row),
      triggerCategories: getScreenerTriggerCategories(row).map(screenerTriggerLabel).join(" | "),
      source: row.snapshot.source || row.status,
      freshnessSec: row.snapshot?.sourceFreshnessSec
    }[header])).join(","))
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `matrix-screener-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function ReportsPage({ rows, kpis, onChange }) {
  const [importText, setImportText] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [reportHistory, setReportHistory] = React.useState(() => readReportHistory());
  const daily = React.useMemo(() => buildDailySummary(rows, kpis), [rows, kpis]);
  const backup = React.useMemo(() => buildUserBackup(rows), [rows]);
  const importPreview = React.useMemo(() => buildBackupImportPreview(importText), [importText]);
  const weeklySections = React.useMemo(() => buildWeeklyReportSections(daily), [daily]);
  const exportCsv = () => downloadTextFile("matrix-watchlist.csv", buildWatchlistCsv(rows), "text/csv;charset=utf-8");
  const exportSignals = () => downloadTextFile("matrix-signals.csv", buildSignalsCsv(rows), "text/csv;charset=utf-8");
  const exportPortfolio = () => downloadTextFile("matrix-portfolio.csv", buildPortfolioCsv(buildPortfolioPositions(rows)), "text/csv;charset=utf-8");
  const exportJournal = () => downloadTextFile("matrix-journal.csv", buildJournalCsv(rows), "text/csv;charset=utf-8");
  const exportAlerts = () => downloadTextFile("matrix-alert-history.csv", buildAlertsCsv(), "text/csv;charset=utf-8");
  const exportBackup = () => downloadTextFile(`matrix-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(buildUserBackup(rows), null, 2), "application/json;charset=utf-8");
  const exportHtml = () => downloadTextFile(`matrix-weekly-report-${new Date().toISOString().slice(0, 10)}.html`, buildWeeklyHtmlReport(rows, daily), "text/html;charset=utf-8");
  const saveDailyReport = () => {
    const item = buildReportHistoryItem(rows, daily);
    setReportHistory((current) => {
      const next = [item, ...current].slice(0, 20);
      writeReportHistory(next);
      return next;
    });
    setMessage("Günlük rapor geçmişe kaydedildi.");
  };
  const clearReportHistory = () => {
    writeReportHistory([]);
    setReportHistory([]);
    setMessage("Rapor geçmişi temizlendi.");
  };
  const importBackup = () => {
    try {
      const payload = JSON.parse(importText);
      const result = restoreUserBackup(payload);
      setMessage(`${result.count} kayıt içe aktarıldı. Uygulama yeniden yükleniyor.`);
      onChange();
      window.setTimeout(() => window.location.reload(), 400);
    } catch (error) {
      setMessage(`İçe aktarma başarısız: ${error.message}`);
    }
  };

  return (
    <section className="pro-page reports-page" id="reports">
      <div className="section-header">
        <div>
          <p className="eyebrow">Raporlama ve yedekleme</p>
          <h2>Günlük piyasa özeti, dışa aktarma ve JSON yedek</h2>
          <p className="section-note">Favoriler, hedefler, alarm kuralları, özel kategoriler, portföy notları ve görünür izleme listesi local dosya olarak dışa aktarılabilir.</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={exportBackup}>JSON Yedek</Button>
          <Button variant="secondary" onClick={exportHtml}>Haftalık HTML</Button>
          <Button variant="secondary" onClick={saveDailyReport}>Özeti Kaydet</Button>
        </div>
      </div>

      <Card className="daily-summary-card">
        <CardTitle title="Günlük Piyasa Özeti" subtitle={state.lastRefreshAt ? `Son yenileme ${new Date(state.lastRefreshAt).toLocaleString("tr-TR")}` : "Veri yenileniyor"} />
        <div className="daily-summary-grid">
          {daily.metrics.map((item) => (
            <div className="daily-summary-metric" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.sub}</small>
            </div>
          ))}
        </div>
        <div className="daily-summary-copy">
          {daily.paragraphs.map((line) => <p key={line}>{line}</p>)}
        </div>
      </Card>

      <Card className="weekly-report-card">
        <CardTitle title="Haftalık Rapor Bölümleri" subtitle="HTML raporun karar destek kapsamı" />
        <div className="weekly-report-grid">
          {weeklySections.map((section) => (
            <article className="weekly-report-section" key={section.id}>
              <div>
                <span>{section.title}</span>
                <strong>{section.rows.length}</strong>
              </div>
              <small>{section.description}</small>
              <p>{section.rows.length ? section.rows.map((row) => row.symbol).join(" · ") : "Veri hazırlanıyor"}</p>
            </article>
          ))}
        </div>
      </Card>

      <div className="report-action-grid">
        <Card className="report-action-card">
          <CardTitle title="CSV Dışa Aktarma" subtitle="Tablo ve sinyal çıktılarını indir" />
          <p className="report-action-copy">İzleme listesi, sinyal merkezi, portföy, işlem günlüğü ve alarm geçmişi ayrı CSV olarak hazırlanır. Türkçe karakterler için UTF-8 BOM eklenir.</p>
          <div className="report-button-stack report-button-stack-wide">
            <Button variant="secondary" onClick={exportCsv}>İzleme CSV</Button>
            <Button variant="secondary" onClick={exportSignals}>Sinyal CSV</Button>
            <Button variant="secondary" onClick={exportPortfolio}>Portföy CSV</Button>
            <Button variant="secondary" onClick={exportJournal}>Günlük CSV</Button>
            <Button variant="secondary" onClick={exportAlerts}>Alarm CSV</Button>
          </div>
        </Card>
        <Card className="report-action-card">
          <CardTitle title="HTML Rapor" subtitle="Haftalık özet dosyası" />
          <p className="report-action-copy">En güçlü 5, en riskli 5, Fib'e yaklaşanlar ve haber etkisi yüksek hisseler tek HTML dosyasında toplanır.</p>
          <div className="report-button-stack">
            <Button variant="secondary" onClick={exportHtml}>HTML İndir</Button>
            <Button variant="secondary" onClick={() => window.print()}>Sayfayı Yazdır</Button>
          </div>
        </Card>
        <Card className="report-action-card">
          <CardTitle title="JSON Yedek" subtitle="Kullanıcı verisi yedeği" />
          <p className="report-action-copy">Tarayıcı yerel deposunda tutulan kullanıcı tercihleri yedeklenir. Canlı fiyat önbelleği yatırım verisi olmadığı için yedeğe dahil edilmez.</p>
          <div className="report-button-stack">
            <Button variant="secondary" onClick={exportBackup}>Yedeği İndir</Button>
            <Button variant="secondary" onClick={() => setImportText(JSON.stringify(buildUserBackup(rows), null, 2))}>Önizle</Button>
          </div>
        </Card>
      </div>

      <Card className="report-history-card">
        <div className="report-history-head">
          <CardTitle title="Rapor Geçmişi" subtitle="Kaydedilmiş günlük özetler" />
          <div className="button-row">
            <Button variant="secondary" onClick={saveDailyReport}>Bugünkü Özeti Kaydet</Button>
            <Button variant="secondary" onClick={clearReportHistory} disabled={!reportHistory.length}>Geçmişi Temizle</Button>
          </div>
        </div>
        <div className="report-history-list">
          {reportHistory.length ? reportHistory.map((item) => (
            <article className="report-history-item" key={item.id}>
              <div>
                <strong>{new Date(item.createdAt).toLocaleString("tr-TR")}</strong>
                <small>{item.visibleCount} hisse · {item.positiveCount} pozitif · {item.highRiskCount} yüksek risk</small>
              </div>
              <div className="report-history-metrics">
                <span>Fib yakın <b>{item.nearFibCount}</b></span>
                <span>Alarm <b>{item.alertCount}</b></span>
                <span>Canlı <b>{item.liveCount}</b></span>
                <span>Portföy P/L <b>{item.portfolioPl || "-"}</b></span>
              </div>
              <p>{item.paragraphs.join(" ")}</p>
            </article>
          )) : <p className="empty">Henüz kaydedilmiş rapor yok.</p>}
        </div>
      </Card>

      <Card className="backup-scope-card">
        <CardTitle title="Yedek Kapsamı" subtitle="Yedek dosyasına dahil edilen alanlar" />
        <div className="backup-scope-grid">
          {backup.scopes.map((scope) => (
            <div className="backup-scope-item" key={scope.label}>
              <span>{scope.label}</span>
              <strong>{scope.count}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card className="import-card">
        <CardTitle title="JSON Import" subtitle="Önceden alınan Matrix backup dosyasını geri yükle" />
        <p className="report-action-copy">Geçerli backup JSON’unu buraya yapıştır. İçe aktarma sonrası uygulama state’i temiz başlatmak için yeniden yüklenir.</p>
        <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'{ "version": 1, "settings": ... }'} />
        <BackupImportPreview preview={importPreview} />
        <div className="button-row">
          <Button variant="secondary" data-testid="backup-import-submit" onClick={importBackup} disabled={!importPreview.canImport}>İçe Aktar ve Yeniden Yükle</Button>
          <Button variant="secondary" onClick={() => { setImportText(""); setMessage(""); }}>Temizle</Button>
        </div>
        {message ? <p className="admin-message">{message}</p> : null}
      </Card>
    </section>
  );
}

function BackupImportPreview({ preview }) {
  return (
    <div className={`backup-import-preview ${preview.status}`}>
      <div className="backup-import-preview-head">
        <Badge tone={preview.status === "success" ? "success" : preview.status === "danger" ? "danger" : "neutral"}>{preview.label}</Badge>
        <strong>{preview.title}</strong>
      </div>
      <p>{preview.message}</p>
      {preview.scopes.length ? (
        <div className="backup-import-preview-grid">
          {preview.scopes.map((scope) => (
            <span key={scope.label}><b>{scope.count}</b>{scope.label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function buildDailySummary(rows, kpis) {
  const portfolioPositions = buildPortfolioPositions(rows);
  const portfolioSummary = buildPortfolioSummary(portfolioPositions);
  const portfolioPerformance = buildPortfolioPerformance(portfolioPositions);
  const strongest = [...rows].filter((row) => Number.isFinite(row.selectedReturn)).sort((a, b) => b.selectedReturn - a.selectedReturn).slice(0, 5);
  const weakest = [...rows].filter((row) => Number.isFinite(row.selectedReturn)).sort((a, b) => a.selectedReturn - b.selectedReturn).slice(0, 5);
  const highRisk = [...rows].filter((row) => row.riskLevel === "high" || Number(row.riskScore || 0) >= 3.5).sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)).slice(0, 5);
  const nearFib = [...rows].filter((row) => Number.isFinite(row.targetDistancePct)).sort((a, b) => Math.abs(a.targetDistancePct) - Math.abs(b.targetDistancePct)).slice(0, 5);
  const highNews = [...rows].filter((row) => row.newsImpact === "high" || row.newsSentiment === "positive" || row.newsSentiment === "negative").slice(0, 5);
  return {
    metrics: [
      { label: "Görünen", value: rows.length, sub: "hisse" },
      { label: "Canlı", value: kpis.live, sub: `${kpis.stale} stale` },
      { label: "Pozitif", value: kpis.positive, sub: `${state.filters.returnPeriod}A getiri` },
      { label: "Negatif", value: kpis.negative, sub: `${state.filters.returnPeriod}A getiri` },
      { label: "Fib yakın", value: kpis.nearFib, sub: `${state.ui.alertThreshold}% eşik` },
      { label: "Risk yüksek", value: kpis.highRisk, sub: "kontrol listesi" },
      { label: "Alarm", value: state.triggeredAlerts.length, sub: "geçmiş kayıt" },
      { label: "Portföy P/L", value: fmtUsd(portfolioSummary.unrealizedPl), sub: `${portfolioPerformance.closedTrades} kapanan işlem` }
    ],
    strongest,
    weakest,
    highRisk,
    nearFib,
    highNews,
    portfolioPositions,
    portfolioSummary,
    portfolioPerformance,
    paragraphs: [
      `En güçlü ${state.filters.returnPeriod}A performans: ${formatSymbolList(strongest)}.`,
      `Risk kontrol listesi: ${formatSymbolList(highRisk)}.`,
      `Fib hedefine en yakın hisseler: ${formatSymbolList(nearFib)}.`,
      `Haber etkisi izlenen hisseler: ${formatSymbolList(highNews)}.`,
      `Portföy özeti: açık P/L ${fmtUsd(portfolioSummary.unrealizedPl)}, gerçekleşmiş P/L ${fmtUsd(portfolioSummary.realizedPl)}, kazanç oranı ${fmtPct(portfolioPerformance.winRatePct)}.`
    ]
  };
}

function buildReportHistoryItem(rows, daily) {
  return {
    id: `report-${Date.now().toString(36)}`,
    createdAt: Date.now(),
    visibleCount: rows.length,
    positiveCount: daily.metrics.find((item) => item.label === "Pozitif").value || 0,
    negativeCount: daily.metrics.find((item) => item.label === "Negatif").value || 0,
    highRiskCount: daily.metrics.find((item) => item.label === "Risk yüksek").value || 0,
    nearFibCount: daily.metrics.find((item) => item.label === "Fib yakın").value || 0,
    liveCount: daily.metrics.find((item) => item.label === "Canlı").value || 0,
    alertCount: daily.metrics.find((item) => item.label === "Alarm").value || 0,
    portfolioPl: daily.metrics.find((item) => item.label === "Portföy P/L").value || "",
    strongest: daily.strongest.map((row) => row.symbol),
    weakest: daily.weakest.map((row) => row.symbol),
    highRisk: daily.highRisk.map((row) => row.symbol),
    nearFib: daily.nearFib.map((row) => row.symbol),
    paragraphs: daily.paragraphs
  };
}

function readReportHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REPORT_HISTORY_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map(sanitizeReportHistoryItem).filter(Boolean).slice(0, 20) : [];
  } catch {
    return [];
  }
}

function writeReportHistory(items) {
  localStorage.setItem(REPORT_HISTORY_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items.slice(0, 20) : []));
}

function sanitizeReportHistoryItem(item) {
  if (!item || typeof item !== "object") return null;
  const id = String(item.id || `report-${Date.now().toString(36)}`);
  const paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs.map((line) => String(line || "").slice(0, 280)).filter(Boolean) : [];
  return {
    id,
    createdAt: Number(item.createdAt) || Date.now(),
    visibleCount: Number(item.visibleCount) || 0,
    positiveCount: Number(item.positiveCount) || 0,
    negativeCount: Number(item.negativeCount) || 0,
    highRiskCount: Number(item.highRiskCount) || 0,
    nearFibCount: Number(item.nearFibCount) || 0,
    liveCount: Number(item.liveCount) || 0,
    alertCount: Number(item.alertCount) || 0,
    portfolioPl: String(item.portfolioPl || ""),
    strongest: Array.isArray(item.strongest) ? item.strongest.map((symbol) => String(symbol).toUpperCase()).slice(0, 8) : [],
    weakest: Array.isArray(item.weakest) ? item.weakest.map((symbol) => String(symbol).toUpperCase()).slice(0, 8) : [],
    highRisk: Array.isArray(item.highRisk) ? item.highRisk.map((symbol) => String(symbol).toUpperCase()).slice(0, 8) : [],
    nearFib: Array.isArray(item.nearFib) ? item.nearFib.map((symbol) => String(symbol).toUpperCase()).slice(0, 8) : [],
    paragraphs
  };
}

function formatSymbolList(rows) {
  return rows.length ? rows.map((row) => row.symbol).join(", ") : "veri hazırlanıyor";
}

function buildWeeklyReportSections(daily) {
  return [
    {
      id: "strongest",
      title: "En güçlü performans",
      description: "Seçili periyotta en güçlü fiyat performansı gösteren hisseler.",
      rows: daily.strongest,
      metricLabel: "Getiri",
      metric: (row) => fmtPct(row.selectedReturn),
      note: (row) => `${signalLabel(row.technicalSignal)} · Risk ${riskLabel(row.riskLevel)}`
    },
    {
      id: "weakest",
      title: "Zayıf performans",
      description: "Seçili periyotta geride kalan ve tekrar kontrol edilmesi gereken hisseler.",
      rows: daily.weakest,
      metricLabel: "Getiri",
      metric: (row) => fmtPct(row.selectedReturn),
      note: (row) => `${signalLabel(row.technicalSignal)} · Haber ${newsLabel(row.newsSentiment)}`
    },
    {
      id: "risk",
      title: "Risk kontrol listesi",
      description: "Volatilite, düşüş ve sinyal risk skoru nedeniyle izlenmesi gereken hisseler.",
      rows: daily.highRisk,
      metricLabel: "Risk",
      metric: (row) => riskLabel(row.riskLevel),
      note: (row) => `Risk skoru ${fmtNumber(row.riskScore, 1)} · ${signalLabel(row.technicalSignal)}`
    },
    {
      id: "fib",
      title: "Fib hedefine yakın",
      description: "Fibonacci hedef uzaklığı en düşük olan hisseler.",
      rows: daily.nearFib,
      metricLabel: "Fib uzaklığı",
      metric: (row) => fmtPct(row.targetDistancePct),
      note: (row) => `Hedef ${fmtUsd(row.fibTarget)} · Fiyat ${fmtUsd(row.price)}`
    },
    {
      id: "news",
      title: "Haber etkisi izleme",
      description: "Pozitif veya negatif haber etkisiyle takip edilmesi gereken hisseler.",
      rows: daily.highNews,
      metricLabel: "Haber",
      metric: (row) => newsLabel(row.newsSentiment),
      note: (row) => `Etki ${row.newsImpact || "-"} · Analist hedefi ${fmtUsd(row.analysisTargetPrice)}`
    },
    {
      id: "portfolio",
      title: "Portföy ve işlem disiplini",
      description: "Açık P/L, gerçekleşmiş P/L ve işlem günlüğü verisiyle portföy kontrolü.",
      rows: (daily.portfolioPositions || []).slice(0, 5),
      metricLabel: "Açık P/L",
      metric: (row) => fmtUsd(row.unrealizedPl),
      note: (row) => `Gerçekleşmiş ${fmtUsd(row.realizedPl)} · İşlem ${row.journal.length}`
    }
  ];
}

function buildUserBackup(rows) {
  const settings = {
    filters: state.filters,
    ui: state.ui,
    favorites: Array.from(state.favorites),
    fibTargets: state.fibTargets,
    hiddenSymbols: Array.from(state.hiddenSymbols),
    selectedSymbol: state.selectedSymbol
  };
  const backup = {
    version: 1,
    app: "Matrix",
    generatedAt: new Date().toISOString(),
    settings,
    investmentPlans: state.investmentPlans,
    customStocks: state.customStocks,
    customCategories: state.customCategories,
    alertRules: state.alertRules,
    triggeredAlerts: state.triggeredAlerts,
    screenerPresets: readSavedScreenerPresets(),
    brokerImportPreview: readBrokerImportPreview(),
    reportHistory: readReportHistory(),
    watchlistSummary: rows.map((row) => ({
      symbol: row.symbol,
      company: row.company,
      category: row.category,
      price: row.price,
      fibTarget: row.fibTarget,
      selectedReturn: row.selectedReturn,
      riskLevel: row.riskLevel,
      technicalSignal: row.technicalSignal
    }))
  };
  backup.scopes = [
    { label: "Favori", count: settings.favorites.length },
    { label: "Fib hedef", count: Object.keys(settings.fibTargets || {}).length },
    { label: "Gizli hisse", count: settings.hiddenSymbols.length },
    { label: "Özel hisse", count: backup.customStocks.length },
    { label: "Kategori", count: backup.customCategories.length },
    { label: "Plan", count: Object.keys(backup.investmentPlans || {}).length },
    { label: "Alarm", count: backup.alertRules.length },
    { label: "Tetiklenen", count: backup.triggeredAlerts.length },
    { label: "Tarama presetleri", count: backup.screenerPresets.length },
    { label: "Broker önizleme", count: backup.brokerImportPreview.items.length },
    { label: "Rapor geçmişi", count: backup.reportHistory.length },
    { label: "Özet", count: backup.watchlistSummary.length },
    { label: "Versiyon", count: backup.version }
  ];
  return backup;
}

function buildBackupImportPreview(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return {
      status: "idle",
      label: "Bekliyor",
      title: "Yedek JSON bekleniyor",
      message: "Matrix backup içeriğini yapıştırınca içe aktarılacak alanlar burada doğrulanır.",
      canImport: false,
      scopes: []
    };
  }
  try {
    const payload = JSON.parse(raw);
    const validation = validateUserBackupPayload(payload);
    return {
      status: validation.canImport ? "success" : "danger",
      label: validation.canImport ? "Geçerli" : "Eksik",
      title: validation.canImport ? `Matrix yedek v${payload.version}` : "Yedek içeriği eksik",
      message: validation.canImport
        ? `${validation.writeCount} localStorage alanı içe aktarılabilir. Kullanıcı verisi tarayıcıda kalır; admin/SQLite operasyon verisi etkilenmez.`
        : validation.error,
      canImport: validation.canImport,
      scopes: validation.scopes
    };
  } catch (error) {
    return {
      status: "danger",
      label: "Hatalı",
      title: "JSON okunamadı",
      message: error.message || "Geçerli JSON formatı bekleniyor.",
      canImport: false,
      scopes: []
    };
  }
}

function validateUserBackupPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { canImport: false, error: "JSON nesnesi bekleniyor.", writeCount: 0, scopes: [] };
  }
  if (!payload.version) {
    return { canImport: false, error: "Yedek sürüm alanı eksik.", writeCount: 0, scopes: [] };
  }
  const typeError = validateBackupPayloadTypes(payload);
  if (typeError) {
    return { canImport: false, error: typeError, writeCount: 0, scopes: buildBackupImportScopes(payload) };
  }
  const writes = getBackupImportWrites(payload);
  const scopes = buildBackupImportScopes(payload);
  if (!writes.length) {
    return { canImport: false, error: "İçe aktarılacak kullanıcı verisi bulunamadı.", writeCount: 0, scopes };
  }
  return { canImport: true, error: "", writeCount: writes.length, scopes };
}

function validateBackupPayloadTypes(payload) {
  const objectFields = [
    ["settings", "Ayarlar"],
    ["investmentPlans", "Portföy planları"],
    ["brokerImportPreview", "Broker önizleme"]
  ];
  const arrayFields = [
    ["customStocks", "Özel hisseler"],
    ["customCategories", "Kategoriler"],
    ["alertRules", "Alarm kuralları"],
    ["triggeredAlerts", "Tetiklenen alarmlar"],
    ["screenerPresets", "Tarama presetleri"],
    ["reportHistory", "Rapor geçmişi"]
  ];
  for (const [key, label] of objectFields) {
    if (payload[key] !== undefined && (!payload[key] || typeof payload[key] !== "object" || Array.isArray(payload[key]))) {
      return `${label} alanı nesne olmalı.`;
    }
  }
  for (const [key, label] of arrayFields) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) {
      return `${label} alanı liste olmalı.`;
    }
  }
  if (payload.brokerImportPreview !== undefined && payload.brokerImportPreview.items !== undefined && !Array.isArray(payload.brokerImportPreview.items)) {
    return "Broker önizleme items alanı liste olmalı.";
  }
  if (payload.settings.favorites !== undefined && !Array.isArray(payload.settings.favorites)) {
    return "Favori alanı liste olmalı.";
  }
  if (payload.settings.hiddenSymbols !== undefined && !Array.isArray(payload.settings.hiddenSymbols)) {
    return "Gizli hisse alanı liste olmalı.";
  }
  if (payload.settings.fibTargets !== undefined && (!payload.settings.fibTargets || typeof payload.settings.fibTargets !== "object" || Array.isArray(payload.settings.fibTargets))) {
    return "Fib hedef alanı nesne olmalı.";
  }
  return "";
}

function getBackupImportWrites(payload) {
  return [
    ["hisse-dashboard-settings-v3", payload.settings],
    ["hisse-dashboard-investment-plans-v1", payload.investmentPlans],
    ["hisse-dashboard-custom-stocks-v1", payload.customStocks],
    ["hisse-dashboard-custom-categories-v1", payload.customCategories],
    ["hisse-dashboard-alert-rules-v1", payload.alertRules],
    ["hisse-dashboard-triggered-alerts-v1", payload.triggeredAlerts],
    [SCREENER_PRESET_STORAGE_KEY, payload.screenerPresets],
    [BROKER_IMPORT_STORAGE_KEY, payload.brokerImportPreview],
    [REPORT_HISTORY_STORAGE_KEY, payload.reportHistory]
  ].filter(([, value]) => value !== undefined);
}

function buildBackupImportScopes(payload) {
  const settings = payload.settings || {};
  const brokerItems = Array.isArray(payload.brokerImportPreview.items) ? payload.brokerImportPreview.items : [];
  const scopes = [
    { label: "Favori", count: Array.isArray(settings.favorites) ? settings.favorites.length : 0 },
    { label: "Fib hedef", count: Object.keys(settings.fibTargets || {}).length },
    { label: "Gizli hisse", count: Array.isArray(settings.hiddenSymbols) ? settings.hiddenSymbols.length : 0 },
    { label: "Özel hisse", count: Array.isArray(payload.customStocks) ? payload.customStocks.length : 0 },
    { label: "Kategori", count: Array.isArray(payload.customCategories) ? payload.customCategories.length : 0 },
    { label: "Plan", count: Object.keys(payload.investmentPlans || {}).length },
    { label: "Alarm", count: Array.isArray(payload.alertRules) ? payload.alertRules.length : 0 },
    { label: "Tetiklenen", count: Array.isArray(payload.triggeredAlerts) ? payload.triggeredAlerts.length : 0 },
    { label: "Tarama", count: Array.isArray(payload.screenerPresets) ? payload.screenerPresets.length : 0 },
    { label: "Broker", count: brokerItems.length },
    { label: "Rapor", count: Array.isArray(payload.reportHistory) ? payload.reportHistory.length : 0 }
  ];
  return scopes.filter((scope) => scope.count > 0).slice(0, 12);
}

function restoreUserBackup(payload) {
  if (!payload || typeof payload !== "object") throw new Error("JSON nesnesi bekleniyor.");
  if (!payload.version) throw new Error("Yedek sürüm alanı eksik.");
  const typeError = validateBackupPayloadTypes(payload);
  if (typeError) throw new Error(typeError);
  const writes = getBackupImportWrites(payload);
  if (!writes.length) throw new Error("İçe aktarılacak kullanıcı verisi bulunamadı.");
  writes.forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  return { count: writes.length };
}

function buildWatchlistCsv(rows) {
  const headers = ["symbol", "company", "category", "price", "fibTarget", "targetDistancePct", "selectedReturn", "status", "riskLevel", "technicalSignal", "newsSentiment", "analysisTargetPrice"];
  return toCsv(headers, rows.map((row) => ({
    symbol: row.symbol,
    company: row.company,
    category: row.category,
    price: row.price,
    fibTarget: row.fibTarget,
    targetDistancePct: row.targetDistancePct,
    selectedReturn: row.selectedReturn,
    status: row.status,
    riskLevel: riskLabel(row.riskLevel),
    technicalSignal: signalLabel(row.technicalSignal),
    newsSentiment: newsLabel(row.newsSentiment),
    analysisTargetPrice: row.analysisTargetPrice
  })));
}

function buildSignalsCsv(rows) {
  const headers = ["symbol", "signal", "score", "confidence", "riskScore", "rsi14", "macd", "macdCross", "reasons"];
  return toCsv(headers, rows.map((row) => ({
    symbol: row.symbol,
    signal: signalLabel(row.technicalSignal),
    score: row.signalDetail?.score,
    confidence: row.signalDetail?.confidence,
    riskScore: row.riskScore,
    rsi14: row.signalDetail?.indicators?.rsi14 ?? row.technicals?.rsi14,
    macd: row.signalDetail?.indicators?.macdHistogram,
    macdCross: row.signalDetail?.indicators?.macdCross,
    reasons: (row.signalDetail?.reasons || []).join(" | ")
  })));
}

function buildAlertsCsv() {
  const headers = ["id", "symbol", "title", "message", "severity", "acknowledged", "createdAt"];
  return toCsv(headers, state.triggeredAlerts.map((alert) => ({
    id: alert.id,
    symbol: alert.symbol,
    title: alert.title,
    message: alert.message,
    severity: alert.severity,
    acknowledged: Boolean(alert.acknowledged),
    createdAt: alert.createdAt ? new Date(alert.createdAt).toISOString() : ""
  })));
}

function buildJournalCsv(rows) {
  const rowMap = new Map(rows.map((row) => [row.symbol, row]));
  const records = Object.entries(state.investmentPlans || {}).flatMap(([symbol, plan]) => {
    const row = rowMap.get(symbol);
    const journal = Array.isArray(plan.journal) ? plan.journal : [];
    return journal.map((entry) => ({
      symbol,
      company: row.company || "",
      category: row.category || "",
      date: entry.date || "",
      type: journalTypeLabel(entry.type),
      rawType: entry.type || "",
      price: entry.price,
      quantity: entry.quantity,
      note: entry.note || ""
    }));
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  const headers = ["symbol", "company", "category", "date", "type", "rawType", "price", "quantity", "note"];
  return toCsv(headers, records);
}

function toCsv(headers, records) {
  const lines = [headers.join(","), ...records.map((record) => headers.map((header) => escapeCsvValue(record[header])).join(","))];
  return `\uFEFF${lines.join("\n")}`;
}

function buildWeeklyHtmlReport(rows, daily) {
  const sections = buildWeeklyReportSections(daily);
  const renderSection = (section) => `
    <section>
      <h2>${escapeHtml(section.title)}</h2>
      <p>${escapeHtml(section.description)}</p>
      <table>
        <thead><tr><th>Sembol</th><th>Şirket</th><th>Kategori</th><th>Fiyat</th><th>${escapeHtml(section.metricLabel)}</th><th>İzleme Notu</th></tr></thead>
        <tbody>${section.rows.map((row) => `<tr><td>${escapeHtml(row.symbol)}</td><td>${escapeHtml(row.company)}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(fmtUsd(row.price))}</td><td>${escapeHtml(section.metric(row))}</td><td>${escapeHtml(section.note(row))}</td></tr>`).join("") || `<tr><td colspan="6">Veri hazırlanıyor</td></tr>`}</tbody>
      </table>
    </section>`;
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Matrix Haftalık Rapor</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;padding:32px}
    h1,h2{color:#fff} section{margin:24px 0;padding:18px;border:1px solid #334155;border-radius:12px;background:#111827}
    table{width:100%;border-collapse:collapse} th,td{padding:10px;border-bottom:1px solid #334155;text-align:left;vertical-align:top}
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.metric{background:#1f2937;border-radius:10px;padding:12px}.metric strong{display:block;font-size:22px}
    .brief{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.brief div{background:#1f2937;border-radius:10px;padding:12px}.brief strong{display:block;color:#fff;margin-bottom:6px}
  </style>
</head>
<body>
  <h1>Matrix Haftalık Rapor</h1>
  <p>Üretim zamanı: ${escapeHtml(new Date().toLocaleString("tr-TR"))}. Bu rapor analiz ve izleme amaçlıdır, yatırım tavsiyesi değildir.</p>
  <div class="metrics">${daily.metrics.map((item) => `<div class="metric"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(String(item.value))}</strong><small>${escapeHtml(item.sub)}</small></div>`).join("")}</div>
  <section><h2>Yönetici Özeti</h2><div class="brief">${daily.paragraphs.map((line) => `<div><strong>Özet</strong><span>${escapeHtml(line)}</span></div>`).join("")}</div></section>
  ${sections.map(renderSection).join("")}
  <section><h2>İzleme Listesi</h2><p>${rows.length} hisse rapora dahil edildi.</p></section>
</body>
</html>`;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function PortfolioPage({ rows, onChange }) {
  const [selectedSymbol, setSelectedSymbol] = React.useState(() => rows.find((row) => hasPortfolioData(row))?.symbol || rows[0]?.symbol || "");
  const selected = rows.find((row) => row.symbol === selectedSymbol) || rows[0];
  const positions = React.useMemo(() => buildPortfolioPositions(rows), [rows]);
  const summary = React.useMemo(() => buildPortfolioSummary(positions), [positions]);
  const performance = React.useMemo(() => buildPortfolioPerformance(positions), [positions]);
  const riskSummary = React.useMemo(() => buildPortfolioRiskSummary(positions, summary), [positions, summary]);
  const riskRows = React.useMemo(() => [...positions].sort((a, b) => b.riskAmount - a.riskAmount).slice(0, 8), [positions]);
  const targetRows = React.useMemo(() => [...positions].filter((item) => Number.isFinite(item.targetGapPct)).sort((a, b) => Math.abs(a.targetGapPct) - Math.abs(b.targetGapPct)).slice(0, 8), [positions]);
  const exposureRows = React.useMemo(() => buildPortfolioExposure(positions, summary.marketValue), [positions, summary.marketValue]);

  React.useEffect(() => {
    if (!selectedSymbol && rows[0]) setSelectedSymbol(rows[0].symbol);
  }, [rows, selectedSymbol]);

  return (
    <section className="pro-page portfolio-page" id="portfolio">
      <div className="section-header">
        <div>
          <p className="eyebrow">Portföy ve risk</p>
          <h2>P/L, stop mesafesi, hedef takibi ve işlem günlüğü</h2>
          <p className="section-note">Kullanıcı portföy verisi localStorage’da kalır. Canlı fiyatlar sadece analiz ve izleme amaçlı hesaplamalarda kullanılır.</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => downloadTextFile("matrix-portfolio.csv", buildPortfolioCsv(positions), "text/csv;charset=utf-8")}>Portföy CSV</Button>
          <Button variant="secondary" onClick={() => { window.location.hash = "reports"; }}>Yedek Sayfası</Button>
        </div>
      </div>

      <div className="portfolio-kpis">
        <Card className="metric-card"><span>Piyasa değeri</span><strong>{fmtUsd(summary.marketValue)}</strong><small>{positions.length} pozisyon</small></Card>
        <Card className={`metric-card ${summary.unrealizedPl >= 0 ? "positive" : "negative"}`}><span>Açık P/L</span><strong>{fmtUsd(summary.unrealizedPl)}</strong><small>{fmtPct(summary.unrealizedPlPct)}</small></Card>
        <Card className={`metric-card ${summary.realizedPl >= 0 ? "positive" : "negative"}`}><span>Gerçekleşmiş P/L</span><strong>{fmtUsd(summary.realizedPl)}</strong><small>{summary.sellCount} satış kaydı</small></Card>
        <Card className="metric-card negative"><span>Risk edilen tutar</span><strong>{fmtUsd(summary.riskAmount)}</strong><small>stop seviyesine göre</small></Card>
        <Card className="metric-card"><span>Hedefe kalan</span><strong>{fmtUsd(summary.targetRoom)}</strong><small>Fib/manuel hedef</small></Card>
      </div>

      <Card className="portfolio-risk-card">
        <CardTitle title="Risk Limit Özeti" subtitle="Stop, pozisyon büyüklüğü ve yoğunlaşma kontrolü" />
        <div className="portfolio-risk-grid">
          <div className="portfolio-risk-tile">
            <span>Risk / Portföy</span>
            <strong>{fmtPct(riskSummary.riskPct)}</strong>
            <small>{fmtUsd(riskSummary.totalRisk)} risk edilen tutar</small>
          </div>
          <div className="portfolio-risk-tile">
            <span>Yüksek risk</span>
            <strong>{riskSummary.highRiskCount}</strong>
            <small>{riskSummary.highRiskSymbols || "kontrol listesi boş"}</small>
          </div>
          <div className="portfolio-risk-tile">
            <span>En büyük ağırlık</span>
            <strong>{fmtPct(riskSummary.maxWeightPct)}</strong>
            <small>{riskSummary.maxWeightSymbol || "pozisyon yok"}</small>
          </div>
          <div className="portfolio-risk-tile">
            <span>Stopsuz pozisyon</span>
            <strong>{riskSummary.missingStopCount}</strong>
            <small>{riskSummary.missingStopSymbols || "tamam"}</small>
          </div>
        </div>
      </Card>

      <Card className="portfolio-performance-card">
        <CardTitle title="İşlem Performansı" subtitle="Günlük kayıtlarından kapatılan işlem ve disiplin özeti" />
        <div className="portfolio-performance-grid">
          <div className="portfolio-performance-tile">
            <span>Kapanan işlem</span>
            <strong>{performance.closedTrades}</strong>
            <small>{performance.sellCount} satış kaydı</small>
          </div>
          <div className="portfolio-performance-tile">
            <span>Kazanç oranı</span>
            <strong>{fmtPct(performance.winRatePct)}</strong>
            <small>{performance.winCount} kazanç · {performance.lossCount} kayıp</small>
          </div>
          <div className="portfolio-performance-tile positive">
            <span>Ortalama kazanç</span>
            <strong>{fmtPct(performance.avgWinPct)}</strong>
            <small>{fmtUsd(performance.avgWinAmount)} ortalama P/L</small>
          </div>
          <div className="portfolio-performance-tile negative">
            <span>Ortalama kayıp</span>
            <strong>{fmtPct(performance.avgLossPct)}</strong>
            <small>{fmtUsd(performance.avgLossAmount)} ortalama P/L</small>
          </div>
          <div className="portfolio-performance-tile">
            <span>Net gerçekleşmiş</span>
            <strong>{fmtUsd(performance.realizedPl)}</strong>
            <small>{performance.bestTradeSymbol || "işlem bekleniyor"} en iyi işlem</small>
          </div>
        </div>
      </Card>

      <BrokerImportCard rows={rows} onChange={onChange} />

      <div className="risk-grid">
        <Card>
          <CardTitle title="Yüksek Riskli Pozisyonlar" subtitle="Stop mesafesi ve risk edilen tutar" />
          <div className="journal-list">
            {riskRows.length ? riskRows.map((item) => (
              <button key={item.symbol} type="button" className="journal-entry" onClick={() => setSelectedSymbol(item.symbol)}>
                <div><strong>{item.symbol}</strong><Badge tone={item.riskAmount > 0 ? "warning" : "neutral"}>{fmtUsd(item.riskAmount)}</Badge></div>
                <p>{item.company}</p>
                <small>Stop mesafesi {fmtPct(item.stopGapPct)} · P/L {fmtUsd(item.unrealizedPl)}</small>
              </button>
            )) : <p className="empty">Adet ve maliyet girilen pozisyon yok.</p>}
          </div>
        </Card>
        <Card>
          <CardTitle title="Hedefe Yakın Pozisyonlar" subtitle="Fib/manuel hedef mesafesi" />
          <div className="journal-list">
            {targetRows.length ? targetRows.map((item) => (
              <button key={item.symbol} type="button" className="journal-entry" onClick={() => setSelectedSymbol(item.symbol)}>
                <div><strong>{item.symbol}</strong><Badge tone={Math.abs(item.targetGapPct) <= Number(state.ui.alertThreshold || 1) ? "warning" : "neutral"}>{fmtPct(item.targetGapPct)}</Badge></div>
                <p>{item.company}</p>
                <small>Hedef {fmtUsd(item.fibTarget)} · Kalan {fmtUsd(item.targetRoom)}</small>
              </button>
            )) : <p className="empty">Hedef verisi hazırlanıyor.</p>}
          </div>
        </Card>
        <Card>
          <CardTitle title="Kategori Yoğunlaşması" subtitle="Piyasa değeri, risk ve P/L dağılımı" />
          <div className="journal-list exposure-list">
            {exposureRows.length ? exposureRows.map((item) => (
              <button key={item.category} type="button" className="exposure-row" onClick={() => { setFilters({ category: item.category }); window.location.hash = "dashboard"; }}>
                <div>
                  <strong>{item.category}</strong>
                  <small>{item.count} pozisyon · {fmtPct(item.weightPct)} ağırlık</small>
                </div>
                <div>
                  <span>{fmtUsd(item.marketValue)}</span>
                  <small className={item.unrealizedPl >= 0 ? "positive-text" : "negative-text"}>{fmtUsd(item.unrealizedPl)} açık P/L</small>
                  <small>Risk {fmtUsd(item.riskAmount)}</small>
                </div>
              </button>
            )) : <p className="empty">Kategori yoğunlaşması için portföy pozisyonu yok.</p>}
          </div>
        </Card>
      </div>

      <Card className="pro-table-shell">
        <CardTitle title="Pozisyon Tablosu" subtitle="Adet ve ortalama maliyet girilen hisseler öncelikli listelenir" />
        <table className="pro-table portfolio-table">
          <thead>
            <tr>
              <th>Hisse</th>
              <th>Adet</th>
              <th>Ort. maliyet</th>
              <th>Fiyat</th>
              <th>Piyasa değeri</th>
              <th>Açık P/L</th>
              <th>Gerçekleşmiş</th>
              <th>Stop</th>
              <th>Hedef</th>
              <th>Etiket</th>
            </tr>
          </thead>
          <tbody>
            {(positions.length ? positions : rows.slice(0, 12).map(rowToPortfolioPosition)).map((item) => (
              <tr key={item.symbol} className="portfolio-row" onClick={() => setSelectedSymbol(item.symbol)}>
                <td><strong>{item.symbol}</strong><small>{item.company}</small></td>
                <td>{fmtNumber(item.shares, 2)}</td>
                <td>{fmtUsd(item.avgCost)}</td>
                <td>{fmtUsd(item.price)}</td>
                <td>{fmtUsd(item.marketValue)}</td>
                <td><span className={item.unrealizedPl >= 0 ? "positive-text" : "negative-text"}>{fmtUsd(item.unrealizedPl)}</span><small>{fmtPct(item.unrealizedPlPct)}</small></td>
                <td><span className={item.realizedPl >= 0 ? "positive-text" : "negative-text"}>{fmtUsd(item.realizedPl)}</span><small>{item.sellCount} satış</small></td>
                <td>{fmtUsd(item.stopPrice)}<small>{fmtPct(item.stopGapPct)}</small></td>
                <td>{fmtUsd(item.fibTarget)}<small>{fmtPct(item.targetGapPct)}</small></td>
                <td><Badge tone="neutral">{item.positionTag || "İzle"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {selected ? <PortfolioEditor row={selected} onChange={onChange} /> : null}
    </section>
  );
}

function BrokerImportCard({ rows, onChange }) {
  const [csvText, setCsvText] = React.useState("");
  const [preview, setPreview] = React.useState(() => readBrokerImportPreview());
  const [message, setMessage] = React.useState("");
  const validRows = preview.items.filter((item) => item.valid);
  const invalidRows = preview.items.filter((item) => !item.valid);
  const summary = preview.summary || buildBrokerPreviewSummary(preview.items);
  const parse = () => {
    const next = parseBrokerCsv(csvText, rows);
    setPreview(next);
    writeBrokerImportPreview(next);
    setMessage(next.items.length ? `${next.items.length} satır okundu, ${next.validCount} satır aktarılabilir.` : "CSV içinde okunabilir işlem bulunamadı.");
  };
  const apply = () => {
    const result = applyBrokerImport(preview, rows);
    setMessage(`${result.imported} işlem günlüğe aktarıldı. ${result.updated} pozisyon güncellendi.`);
    onChange();
  };
  const clear = () => {
    setCsvText("");
    setPreview(emptyBrokerPreview());
    writeBrokerImportPreview(emptyBrokerPreview());
    setMessage("");
  };
  const loadSample = () => {
    const next = parseBrokerCsv(BROKER_SAMPLE_CSV, rows);
    setCsvText(BROKER_SAMPLE_CSV);
    setPreview(next);
    writeBrokerImportPreview(next);
    setMessage(`Örnek CSV yüklendi ve ${next.validCount} satır önizlemeye hazırlandı.`);
  };

  return (
    <Card className="broker-import-card" id="broker-import">
      <div className="broker-import-head">
        <div>
          <CardTitle title="Broker CSV İçe Aktarma" subtitle="İşlem günlüğü ve pozisyon önizleme" />
          <p className="broker-import-copy">CSV satırları sembol, tarih, işlem tipi, fiyat, adet ve not olarak eşlenir. Geçerli kayıtlar localStorage portföy planına yazılır; yatırım tavsiyesi değildir.</p>
        </div>
        <div className="broker-import-meta">
          <span>{preview.items.length} satır</span>
          <span>{validRows.length} geçerli</span>
          <span>{invalidRows.length} uyarı</span>
          <span>{summary.symbolCount} sembol</span>
        </div>
      </div>
      <label className="broker-import-field">
        <span className="broker-import-label">CSV içeriği</span>
        <textarea
          value={csvText}
          onChange={(event) => setCsvText(event.target.value)}
          placeholder={"symbol,date,type,quantity,price,note\nNVDA,2026-06-26,buy,10,192.5,ilk alım"}
        />
      </label>
      <div className="broker-import-summary" data-testid="broker-import-summary">
        <span>Alım <b>{summary.buyCount}</b> / {fmtUsd(summary.buyValue)}</span>
        <span>Satım <b>{summary.sellCount}</b> / {fmtUsd(summary.sellValue)}</span>
        <span>Etkilenen <b>{summary.symbols.join(", ") || "-"}</b></span>
      </div>
      <div className="button-row">
        <Button variant="secondary" onClick={parse} disabled={!csvText.trim()}>Önizle</Button>
        <Button variant="secondary" onClick={apply} disabled={!validRows.length}>Geçerli Kayıtları Aktar</Button>
        <Button variant="secondary" onClick={loadSample}>Örnek Yükle</Button>
        <Button variant="secondary" onClick={clear}>Temizle</Button>
      </div>
      {message ? <p className="broker-import-help">{message}</p> : null}
      {invalidRows.length ? (
        <div className="broker-warning-list">
          {invalidRows.slice(0, 5).map((item) => <span key={item.id}>{item.rowNumber}. satır: {item.errors.join(", ")}</span>)}
        </div>
      ) : null}
      {!preview.items.length ? <p className="empty">Henüz broker CSV önizlemesi yok. CSV yapıştır veya örnek yükle.</p> : null}
      {preview.items.length ? (
        <div className="broker-preview-shell">
          <table className="pro-table broker-preview-table">
            <thead>
              <tr>
                <th>Durum</th>
                <th>Sembol</th>
                <th>Tarih</th>
                <th>Tip</th>
                <th>Adet</th>
                <th>Fiyat</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {preview.items.slice(0, 20).map((item) => (
                <tr key={item.id}>
                  <td><Badge tone={item.valid ? "success" : "warning"}>{item.valid ? "Hazır" : "Uyarı"}</Badge></td>
                  <td><strong>{item.symbol || "-"}</strong><small>{item.company || item.errors.join(", ")}</small></td>
                  <td>{item.date || "-"}</td>
                  <td>{journalTypeLabel(item.type)}</td>
                  <td>{fmtNumber(item.quantity, 2)}</td>
                  <td>{fmtUsd(item.price)}</td>
                  <td>{item.note || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

function emptyBrokerPreview() {
  return { savedAt: null, items: [], validCount: 0, invalidCount: 0, summary: buildBrokerPreviewSummary([]) };
}

function readBrokerImportPreview() {
  try {
    const parsed = JSON.parse(localStorage.getItem(BROKER_IMPORT_STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return emptyBrokerPreview();
    const items = parsed.items.map(sanitizeBrokerImportItem).filter(Boolean).slice(0, 200);
    return {
      savedAt: Number(parsed.savedAt) || null,
      items,
      validCount: items.filter((item) => item.valid).length,
      invalidCount: items.filter((item) => !item.valid).length,
      summary: buildBrokerPreviewSummary(items)
    };
  } catch {
    return emptyBrokerPreview();
  }
}

function writeBrokerImportPreview(preview) {
  localStorage.setItem(BROKER_IMPORT_STORAGE_KEY, JSON.stringify(preview || emptyBrokerPreview()));
}

function parseBrokerCsv(text, rows) {
  const rowMap = new Map(rows.map((row) => [row.symbol, row]));
  const lines = String(text || "").split(/\r\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return emptyBrokerPreview();
  const delimiter = detectCsvDelimiter(lines[0]);
  const first = splitCsvLine(lines[0], delimiter).map((cell) => normalizeHeader(cell));
  const hasHeader = first.some((header) => ["symbol", "date", "type", "quantity", "price", "note"].includes(header));
  const headers = hasHeader ? first : ["symbol", "date", "type", "quantity", "price", "note"];
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const items = dataLines.map((line, index) => {
    const values = splitCsvLine(line, delimiter);
    const raw = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""]));
    return sanitizeBrokerImportItem({
      id: `broker-${Date.now()}-${index}`,
      rowNumber: (hasHeader ? index + 2 : index + 1),
      symbol: raw.symbol,
      date: raw.date,
      type: raw.type,
      quantity: raw.quantity,
      price: raw.price,
      note: raw.note,
      rowMap
    });
  }).filter(Boolean);
  return {
    savedAt: Date.now(),
    items,
    validCount: items.filter((item) => item.valid).length,
    invalidCount: items.filter((item) => !item.valid).length,
    summary: buildBrokerPreviewSummary(items)
  };
}

function buildBrokerPreviewSummary(items = []) {
  const validItems = (items || []).filter((item) => item.valid);
  const symbols = [...new Set(validItems.map((item) => item.symbol).filter(Boolean))].sort();
  return validItems.reduce((summary, item) => {
    const value = Number(item.quantity || 0) * Number(item.price || 0);
    if (item.type === "buy") {
      summary.buyCount += 1;
      summary.buyValue += Number.isFinite(value) ? value : 0;
    }
    if (item.type === "sell") {
      summary.sellCount += 1;
      summary.sellValue += Number.isFinite(value) ? value : 0;
    }
    return summary;
  }, { buyCount: 0, sellCount: 0, buyValue: 0, sellValue: 0, symbolCount: symbols.length, symbols });
}

function sanitizeBrokerImportItem(item) {
  if (!item || typeof item !== "object") return null;
  const rowMap = item.rowMap instanceof Map ? item.rowMap : null;
  const symbol = String(item.symbol || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  const row = rowMap.get(symbol);
  const type = normalizeBrokerType(item.type);
  const quantity = parseBrokerNumber(item.quantity);
  const price = parseBrokerNumber(item.price);
  const date = normalizeBrokerDate(item.date);
  const note = String(item.note || "").trim().slice(0, 180);
  const errors = [];
  if (!symbol) errors.push("sembol eksik");
  if (rowMap && symbol && !row) errors.push("sembol izleme listesinde yok");
  if (!date) errors.push("tarih eksik");
  if (!type) errors.push("işlem tipi eksik");
  if ((type === "buy" || type === "sell") && (!Number.isFinite(quantity) || quantity <= 0)) errors.push("adet geçersiz");
  if ((type === "buy" || type === "sell") && (!Number.isFinite(price) || price <= 0)) errors.push("fiyat geçersiz");
  return {
    id: String(item.id || `broker-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    rowNumber: Number(item.rowNumber) || 1,
    symbol,
    company: row.company || "",
    date,
    type: type || "not",
    quantity: Number.isFinite(quantity) ? quantity : null,
    price: Number.isFinite(price) ? price : null,
    note,
    errors,
    valid: errors.length === 0
  };
}

function applyBrokerImport(preview, rows) {
  const rowMap = new Map(rows.map((row) => [row.symbol, row]));
  let imported = 0;
  let updated = 0;
  (preview.items || []).filter((item) => item.valid).forEach((item) => {
    const row = rowMap.get(item.symbol);
    if (!row) return;
    const plan = { ...(state.investmentPlans[item.symbol] || row.investmentPlan || {}) };
    const journal = Array.isArray(plan.journal) ? plan.journal : [];
    const nextJournal = [...journal, {
      id: `broker-${item.symbol}-${Date.now()}-${imported}`,
      date: item.date,
      type: item.type,
      price: item.price,
      quantity: item.quantity,
      note: item.note || "Broker CSV import"
    }];
    const nextPlan = { ...plan, journal: nextJournal };
    if (item.type === "buy") {
      const currentShares = Number(plan.shares) || 0;
      const currentAvg = Number(plan.avgCost) || Number(plan.entryPrice) || 0;
      const currentCost = currentShares * currentAvg;
      const nextShares = currentShares + item.quantity;
      nextPlan.shares = nextShares;
      nextPlan.avgCost = nextShares > 0 ? (currentCost + item.quantity * item.price) / nextShares : item.price;
      nextPlan.entryPrice = nextPlan.entryPrice || item.price;
      nextPlan.positionTag = nextPlan.positionTag || "İzle";
      updated += 1;
    }
    if (item.type === "sell") {
      const currentShares = Number(plan.shares) || 0;
      nextPlan.shares = Math.max(0, currentShares - item.quantity);
      updated += 1;
    }
    setInvestmentPlan(item.symbol, nextPlan);
    imported += 1;
  });
  return { imported, updated };
}

function detectCsvDelimiter(line) {
  const candidates = [",", ";", "\t"];
  return candidates.map((delimiter) => [delimiter, splitCsvLine(line, delimiter).length]).sort((a, b) => b[1] - a[1])[0][0];
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value) {
  const text = String(value || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  if (["symbol", "sembol", "ticker", "hisse"].includes(text)) return "symbol";
  if (["date", "tarih", "islemtarihi", "transactiondate"].includes(text)) return "date";
  if (["type", "tip", "islem", "islemtipi", "side", "action"].includes(text)) return "type";
  if (["quantity", "adet", "miktar", "qty", "lot"].includes(text)) return "quantity";
  if (["price", "fiyat", "birimfiyat", "avgprice"].includes(text)) return "price";
  if (["note", "not", "aciklama", "description"].includes(text)) return "note";
  return text;
}

function normalizeBrokerType(value) {
  const text = String(value || "").trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["buy", "alim", "al", "b"].includes(text)) return "buy";
  if (["sell", "satim", "sat", "s"].includes(text)) return "sell";
  if (["plan", "hedef"].includes(text)) return "plan";
  if (["note", "not"].includes(text)) return "not";
  return text ? "not" : "";
}

function parseBrokerNumber(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const normalized = text
    .replace(/\s/g, "")
    .replace(/\$/g, "")
    .replace(/%/g, "")
    .replace(/\.(=\d{3}(:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function normalizeBrokerDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const tr = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (tr) return `${tr[3]}-${tr[2].padStart(2, "0")}-${tr[1].padStart(2, "0")}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function PortfolioEditor({ row, onChange }) {
  const plan = row.investmentPlan || {};
  const [draft, setDraft] = React.useState(plan);
  const [journalDraft, setJournalDraft] = React.useState({ type: "not", price: "", quantity: "", note: "" });
  React.useEffect(() => setDraft(plan), [row.symbol]);
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    setInvestmentPlan(row.symbol, draft);
    onChange();
  };
  const addJournal = () => {
    const journal = Array.isArray(draft.journal) ? draft.journal : [];
    const next = {
      id: `journal-${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      type: journalDraft.type || "not",
      price: journalDraft.price,
      quantity: journalDraft.quantity,
      note: journalDraft.note
    };
    const nextDraft = { ...draft, journal: [...journal, next] };
    setDraft(nextDraft);
    setInvestmentPlan(row.symbol, nextDraft);
    setJournalDraft({ type: "not", price: "", quantity: "", note: "" });
    onChange();
  };
  const removeJournal = (id) => {
    const nextDraft = { ...draft, journal: (draft.journal || []).filter((item) => item.id !== id) };
    setDraft(nextDraft);
    setInvestmentPlan(row.symbol, nextDraft);
    onChange();
  };

  return (
    <div className="journal-grid">
      <Card>
        <CardTitle title={`${row.symbol} Portföy Planı`} subtitle={row.company} />
        <div className="journal-form">
          <label>Adet<input value={draft.shares ?? ""} onChange={(event) => patch("shares", event.target.value)} placeholder="100" /></label>
          <label>Ortalama maliyet<input value={draft.avgCost ?? ""} onChange={(event) => patch("avgCost", event.target.value)} placeholder="125.50" /></label>
          <label>Giriş fiyatı<input value={draft.entryPrice ?? ""} onChange={(event) => patch("entryPrice", event.target.value)} /></label>
          <label>Stop seviyesi<input value={draft.stopPrice ?? ""} onChange={(event) => patch("stopPrice", event.target.value)} /></label>
          <label>Planlanan alım bölgesi<input value={draft.buyZone || ""} onChange={(event) => patch("buyZone", event.target.value)} /></label>
          <label>Plan notu<textarea value={draft.note || ""} onChange={(event) => patch("note", event.target.value)} /></label>
          <SelectField label="Pozisyon etiketi" value={draft.positionTag || "İzle"} onChange={(value) => patch("positionTag", value)}>
            {["İzle", "Alım bölgesi", "Riskli", "Kârda", "Hedefte"].map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </SelectField>
          <Button type="button" onClick={save}>Planı Kaydet</Button>
        </div>
      </Card>
      <Card>
        <CardTitle title="İşlem Günlüğü" subtitle="Alım nedeni, beklenti ve sonuç notları" />
        <div className="journal-form">
          <SelectField label="Kayıt tipi" value={journalDraft.type} onChange={(value) => setJournalDraft((current) => ({ ...current, type: value }))}>
            <option value="buy">Alım</option>
            <option value="sell">Satım</option>
            <option value="plan">Plan</option>
            <option value="not">Not</option>
          </SelectField>
          <label>Fiyat<input value={journalDraft.price} onChange={(event) => setJournalDraft((current) => ({ ...current, price: event.target.value }))} /></label>
          <label>Adet<input value={journalDraft.quantity} onChange={(event) => setJournalDraft((current) => ({ ...current, quantity: event.target.value }))} /></label>
          <label>Not<textarea value={journalDraft.note} onChange={(event) => setJournalDraft((current) => ({ ...current, note: event.target.value }))} placeholder="Alım nedeni, beklenti, çıkış planı..." /></label>
          <Button type="button" variant="secondary" onClick={addJournal}>Günlüğe Ekle</Button>
        </div>
        <div className="journal-list">
          {(draft.journal || []).length ? [...draft.journal].reverse().map((entry) => (
            <div className="journal-entry" key={entry.id}>
              <div><strong>{journalTypeLabel(entry.type)}</strong><Badge tone="neutral">{entry.date}</Badge><button className="delete-button" type="button" onClick={() => removeJournal(entry.id)}>Sil</button></div>
              <p>{entry.note || "Not yok"}</p>
              <small>Fiyat {fmtUsd(entry.price)} · Adet {fmtNumber(entry.quantity, 2)}</small>
            </div>
          )) : <p className="empty">Bu hisse için günlük kaydı yok.</p>}
        </div>
      </Card>
    </div>
  );
}

function hasPortfolioData(row) {
  const plan = row.investmentPlan || {};
  return Number(plan.shares) > 0 || Number(plan.avgCost) > 0 || Number(plan.stopPrice) > 0 || Boolean(plan.note) || (Array.isArray(plan.journal) && plan.journal.length > 0);
}

function buildPortfolioPositions(rows) {
  return rows.map(rowToPortfolioPosition).filter((item) => item.hasPosition || item.hasPlan);
}

function rowToPortfolioPosition(row) {
  const plan = row.investmentPlan || {};
  const ledger = computePortfolioLedger(plan.journal);
  const manualShares = Number(plan.shares);
  const manualAvgCost = Number(plan.avgCost ?? plan.entryPrice);
  const shares = Number.isFinite(manualShares) && manualShares > 0 ? manualShares : ledger.openShares;
  const avgCost = Number.isFinite(manualAvgCost) && manualAvgCost > 0 ? manualAvgCost : ledger.avgCost;
  const price = Number(row.price);
  const stopPrice = Number(plan.stopPrice);
  const fibTarget = Number(row.fibTarget);
  const hasPosition = Number.isFinite(shares) && shares > 0 && Number.isFinite(avgCost) && avgCost > 0;
  const marketValue = hasPosition && Number.isFinite(price) ? shares * price : null;
  const costBasis = hasPosition ? shares * avgCost : null;
  const unrealizedPl = Number.isFinite(marketValue) && Number.isFinite(costBasis) ? marketValue - costBasis : null;
  const unrealizedPlPct = Number.isFinite(unrealizedPl) && Number.isFinite(costBasis) && costBasis !== 0 ? (unrealizedPl / costBasis) * 100 : null;
  const riskAmount = hasPosition && Number.isFinite(stopPrice) ? Math.max(0, (price - stopPrice) * shares) : 0;
  const stopGapPct = Number.isFinite(price) && Number.isFinite(stopPrice) && price !== 0 ? ((stopPrice - price) / price) * 100 : null;
  const targetRoom = hasPosition && Number.isFinite(fibTarget) && Number.isFinite(price) ? Math.max(0, (fibTarget - price) * shares) : null;
  const targetGapPct = Number.isFinite(price) && Number.isFinite(fibTarget) && price !== 0 ? ((fibTarget - price) / price) * 100 : null;
  return {
    ...row,
    shares,
    avgCost,
    price,
    stopPrice,
    fibTarget,
    hasPosition,
    hasPlan: hasPortfolioData(row),
    marketValue,
    costBasis,
    unrealizedPl,
    unrealizedPlPct,
    realizedPl: ledger.realizedPl,
    sellCount: ledger.sellCount,
    closedTrades: ledger.closedTrades,
    ledgerShares: ledger.openShares,
    ledgerAvgCost: ledger.avgCost,
    riskAmount,
    stopGapPct,
    targetRoom,
    targetGapPct,
    positionTag: plan.positionTag,
    journal: plan.journal || []
  };
}

function computePortfolioLedger(journal = []) {
  const entries = Array.isArray(journal) ? [...journal] : [];
  entries.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
  let openShares = 0;
  let avgCost = 0;
  let realizedPl = 0;
  let sellCount = 0;
  const closedTrades = [];

  entries.forEach((entry) => {
    const type = String(entry.type || "").toLowerCase();
    const quantity = Number(entry.quantity);
    const price = Number(entry.price);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) return;

    if (type === "buy") {
      const currentCost = openShares * avgCost;
      const nextShares = openShares + quantity;
      avgCost = nextShares > 0 ? (currentCost + quantity * price) / nextShares : 0;
      openShares = nextShares;
    }

    if (type === "sell") {
      const closedQty = Math.min(openShares, quantity);
      const entryAvgCost = avgCost;
      const pl = closedQty * (price - entryAvgCost);
      const plPct = entryAvgCost > 0 ? ((price - entryAvgCost) / entryAvgCost) * 100 : null;
      realizedPl += pl;
      if (closedQty > 0) {
        closedTrades.push({
          date: entry.date || "",
          quantity: closedQty,
          price,
          avgCost: entryAvgCost,
          pl,
          plPct
        });
      }
      openShares = Math.max(0, openShares - closedQty);
      if (openShares === 0) avgCost = 0;
      sellCount += 1;
    }
  });

  return { openShares, avgCost, realizedPl, sellCount, closedTrades };
}

function buildPortfolioSummary(positions) {
  const totals = positions.reduce((acc, item) => {
    acc.marketValue += Number(item.marketValue || 0);
    acc.costBasis += Number(item.costBasis || 0);
    acc.unrealizedPl += Number(item.unrealizedPl || 0);
    acc.realizedPl += Number(item.realizedPl || 0);
    acc.sellCount += Number(item.sellCount || 0);
    acc.riskAmount += Number(item.riskAmount || 0);
    acc.targetRoom += Number(item.targetRoom || 0);
    return acc;
  }, { marketValue: 0, costBasis: 0, unrealizedPl: 0, realizedPl: 0, sellCount: 0, riskAmount: 0, targetRoom: 0 });
  return {
    ...totals,
    unrealizedPlPct: totals.costBasis ? (totals.unrealizedPl / totals.costBasis) * 100 : null
  };
}

function buildPortfolioPerformance(positions) {
  const trades = positions.flatMap((item) => (Array.isArray(item.closedTrades) ? item.closedTrades : []).map((trade) => ({
    ...trade,
    symbol: item.symbol,
    company: item.company
  })));
  const wins = trades.filter((trade) => Number(trade.pl || 0) > 0);
  const losses = trades.filter((trade) => Number(trade.pl || 0) < 0);
  const realizedPl = trades.reduce((sum, trade) => sum + Number(trade.pl || 0), 0);
  const sellCount = positions.reduce((sum, item) => sum + Number(item.sellCount || 0), 0);
  const average = (items, key) => items.length ? items.reduce((sum, item) => sum + Number(item[key] || 0), 0) / items.length : null;
  const bestTrade = [...trades].sort((a, b) => Number(b.pl || 0) - Number(a.pl || 0))[0];
  const worstTrade = [...trades].sort((a, b) => Number(a.pl || 0) - Number(b.pl || 0))[0];
  return {
    closedTrades: trades.length,
    sellCount,
    winCount: wins.length,
    lossCount: losses.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : null,
    avgWinPct: average(wins, "plPct"),
    avgLossPct: average(losses, "plPct"),
    avgWinAmount: average(wins, "pl"),
    avgLossAmount: average(losses, "pl"),
    realizedPl,
    bestTradeSymbol: bestTrade?.symbol || "",
    worstTradeSymbol: worstTrade?.symbol || ""
  };
}

function buildPortfolioRiskSummary(positions, summary) {
  const active = positions.filter((item) => item.hasPosition && Number(item.marketValue || 0) > 0);
  const totalMarketValue = Number(summary.marketValue || 0);
  const totalRisk = Number(summary.riskAmount || 0);
  const riskPct = totalMarketValue > 0 ? (totalRisk / totalMarketValue) * 100 : null;
  const weighted = active.map((item) => ({
    ...item,
    weightPct: totalMarketValue > 0 ? (Number(item.marketValue || 0) / totalMarketValue) * 100 : 0
  })).sort((a, b) => b.weightPct - a.weightPct);
  const highRisk = active
    .filter((item) => Number(item.riskAmount || 0) > 0 && (Number(item.riskAmount || 0) / Math.max(1, Number(item.marketValue || 0))) * 100 >= 8)
    .sort((a, b) => Number(b.riskAmount || 0) - Number(a.riskAmount || 0));
  const missingStop = active.filter((item) => !Number.isFinite(Number(item.stopPrice)) || Number(item.stopPrice) <= 0);
  return {
    totalRisk,
    riskPct,
    highRiskCount: highRisk.length,
    highRiskSymbols: highRisk.slice(0, 4).map((item) => item.symbol).join(" · "),
    maxWeightPct: weighted[0]?.weightPct ?? null,
    maxWeightSymbol: weighted[0]?.symbol || "",
    missingStopCount: missingStop.length,
    missingStopSymbols: missingStop.slice(0, 4).map((item) => item.symbol).join(" · ")
  };
}

function buildPortfolioExposure(positions, totalMarketValue) {
  const groups = new Map();
  positions.filter((item) => item.hasPosition || Number(item.marketValue || 0) > 0).forEach((item) => {
    const category = item.category || "Diğer";
    const current = groups.get(category) || { category, count: 0, marketValue: 0, unrealizedPl: 0, realizedPl: 0, riskAmount: 0 };
    current.count += 1;
    current.marketValue += Number(item.marketValue || 0);
    current.unrealizedPl += Number(item.unrealizedPl || 0);
    current.realizedPl += Number(item.realizedPl || 0);
    current.riskAmount += Number(item.riskAmount || 0);
    groups.set(category, current);
  });
  return Array.from(groups.values())
    .map((item) => ({
      ...item,
      weightPct: Number(totalMarketValue) > 0 ? (item.marketValue / totalMarketValue) * 100 : null
    }))
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 8);
}

function buildPortfolioCsv(positions) {
  const headers = ["symbol", "company", "shares", "avgCost", "price", "marketValue", "unrealizedPl", "unrealizedPlPct", "realizedPl", "sellCount", "closedTrades", "winCount", "lossCount", "winRatePct", "stopPrice", "riskAmount", "fibTarget", "targetRoom", "positionTag"];
  return toCsv(headers, positions.map((item) => ({
    ...item,
    ...buildPortfolioPerformance([item]),
    symbol: item.symbol,
    company: item.company,
    shares: item.shares,
    avgCost: item.avgCost,
    price: item.price,
    marketValue: item.marketValue,
    unrealizedPl: item.unrealizedPl,
    unrealizedPlPct: item.unrealizedPlPct,
    realizedPl: item.realizedPl,
    sellCount: item.sellCount,
    stopPrice: item.stopPrice,
    riskAmount: item.riskAmount,
    fibTarget: item.fibTarget,
    targetRoom: item.targetRoom,
    positionTag: item.positionTag
  })));
}

function journalTypeLabel(type) {
  if (type === "buy") return "Alım";
  if (type === "sell") return "Satım";
  if (type === "plan") return "Plan";
  return "Not";
}

function ResearchPage({ rows, selected, onChange }) {
  const [symbol, setSymbol] = React.useState(selected?.symbol || rows[0]?.symbol || "");
  const [payload, setPayload] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const row = rows.find((item) => item.symbol === symbol) || selected || rows[0];

  const load = React.useCallback(async (nextSymbol = symbol) => {
    if (!nextSymbol) return;
    setLoading(true);
    setError("");
    try {
      const data = await getResearch(nextSymbol);
      setPayload(data);
    } catch (err) {
      setError(err.message || String(err));
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  React.useEffect(() => {
    if (symbol) load(symbol);
  }, [symbol, load]);

  const openDetail = () => {
    if (!row) return;
    selectRow(row.symbol, onChange);
    setUi({ detailTab: "haberler" });
    window.location.hash = "dashboard";
    onChange();
  };

  const researchPayload = payload || {};
  const importantNews = Array.isArray(researchPayload.importantNews) ? researchPayload.importantNews : Array.isArray(researchPayload.items) ? researchPayload.items : [];
  const provenance = researchPayload.provenance || {};
  const priceReaction = researchPayload.priceReaction || {};
  const technicalDetail = researchPayload.technicalSummaryDetail || {};
  const riskDetail = researchPayload.riskSummaryDetail || {};
  const analyst = researchPayload.analyst || {};
  const researchPrice = researchPayload.price ?? row?.price;
  const analystUpside = Number.isFinite(Number(analyst.targetPrice)) && Number.isFinite(Number(researchPrice))
    ? ((Number(analyst.targetPrice) - Number(researchPrice)) / Number(researchPrice)) * 100
    : null;

  return (
    <section className="pro-page research-page" id="research">
      <div className="section-header">
        <div>
          <p className="eyebrow">Araştırma paneli</p>
          <h2>Türkçe haber özeti, fiyat tepkisi ve kaynak görünürlüğü</h2>
          <p className="section-note">Araştırma servisi haber, analiz, sinyal ve fiyat tepkisini tek hisse odağında özetler. İçerik analiz ve izleme amaçlıdır; yatırım tavsiyesi değildir.</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => load(symbol)} disabled={loading}>{loading ? "Hazırlanıyor" : "Yenile"}</Button>
          <Button variant="secondary" onClick={openDetail}>Panel Detayı</Button>
        </div>
      </div>

      <Card className="research-summary">
        <CardTitle title="Hisse Araştırması" subtitle={row ? `${row.symbol} · ${row.company}` : "Hisse seç"} />
        <div className="form-row">
          <SelectField label="Hisse" value={symbol} onChange={(value) => setSymbol(value)}>
            {rows.map((item) => <option key={item.symbol} value={item.symbol}>{item.symbol} · {item.company}</option>)}
          </SelectField>
        </div>
        {error ? <p className="error-banner">Araştırma verisi alınamadı: {error}</p> : null}
        <p>{researchPayload.summaryTr || (loading ? "Türkçe araştırma özeti hazırlanıyor." : "Araştırma özeti için hisse seç ve yenile.")}</p>
        <small>{researchPayload.weeklySummary || "Haftalık özet verisi hazırlanıyor."}</small>
      </Card>

      <div className="research-impact-grid">
        <div className="research-impact-metric">
          <span>Haber Etkisi</span>
          <strong>{fmtNumber(researchPayload.impactScore ?? row?.newsImpactScore, 1)}</strong>
          <small>{row?.newsSentiment ? newsLabel(row.newsSentiment) : "nötr"}</small>
        </div>
        <div className="research-impact-metric">
          <span>Analist Hedefi</span>
          <strong>{fmtUsd(researchPayload.analystTargetPrice ?? row?.analysisTargetPrice)}</strong>
          <small>{row?.analysisRecommendation || "veri yok"}</small>
        </div>
        <div className="research-impact-metric">
          <span>+1G Tepki</span>
          <strong>{fmtPct(priceReaction.plus1d)}</strong>
          <small>haber sonrası</small>
        </div>
        <div className="research-impact-metric">
          <span>+3G Tepki</span>
          <strong>{fmtPct(priceReaction.plus3d)}</strong>
          <small>haber sonrası</small>
        </div>
        <div className="research-impact-metric">
          <span>+7G Tepki</span>
          <strong>{fmtPct(priceReaction.plus7d)}</strong>
          <small>haber sonrası</small>
        </div>
      </div>

      <div className="research-impact-grid">
        <Card>
          <CardTitle title="Bu Hisse Neden Önemli" subtitle="Teknik, risk ve haber etkisi birleşimi" />
          <div className="daily-summary-copy">
            <p>{researchPayload.technicalSummary || `Teknik sinyal: ${signalLabel(row?.technicalSignal)}. Skor ${fmtNumber(row?.signalDetail?.score, 0)}.`}</p>
            <p>{researchPayload.riskSummary || `Risk seviyesi: ${riskLabel(row?.riskLevel)}. Risk skoru ${fmtNumber(row?.riskScore, 1)}.`}</p>
            <p>{researchPayload.provider ? `Araştırma sağlayıcısı: ${researchPayload.provider}.` : "Araştırma sağlayıcısı bilgisi hazırlanıyor."}</p>
          </div>
        </Card>
        <Card className="research-detail-card">
          <CardTitle title="Teknik Detay" subtitle="Sinyal kanıtı ve tetikleyiciler" />
          <div className="research-detail-grid">
            <Metric label="Sinyal" value={technicalDetail.signal || signalLabel(row?.technicalSignal)} />
            <Metric label="Skor" value={fmtNumber(technicalDetail.score ?? row?.signalDetail?.score, 0)} />
            <Metric label="Güven" value={Number.isFinite(Number(technicalDetail.confidence)) ? `${fmtNumber(technicalDetail.confidence, 0)}%` : "-"} />
            <Metric label="Risk" value={technicalDetail.risk || riskLabel(row?.riskLevel)} />
          </div>
          <div className="research-chip-list">
            {(technicalDetail.triggerTags || []).slice(0, 8).map((tag) => <span key={tag}>{tag}</span>)}
            {!(technicalDetail.triggerTags || []).length ? <span>Tetikleyici hazırlanıyor</span> : null}
          </div>
          <div className="research-reason-list">
            {(technicalDetail.reasons || []).slice(0, 4).map((reason) => <p key={reason}>{reason}</p>)}
          </div>
        </Card>
        <Card className="research-detail-card">
          <CardTitle title="Risk ve Analist" subtitle="Risk skoru, uyarılar ve hedef fiyat" />
          <div className="research-detail-grid">
            <Metric label="Risk skoru" value={fmtNumber(riskDetail.riskScore ?? row?.riskScore, 0)} />
            <Metric label="Risk seviyesi" value={riskDetail.level || riskLabel(row?.riskLevel)} />
            <Metric label="Analist hedef" value={fmtUsd(analyst.targetPrice ?? researchPayload.analystTargetPrice ?? row?.analysisTargetPrice)} />
            <Metric label="Hedef farkı" value={fmtPct(analystUpside)} />
          </div>
          <div className="research-chip-list warning">
            {(riskDetail.warnings || []).slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)}
            {!(riskDetail.warnings || []).length ? <span>Ek risk uyarısı yok</span> : null}
          </div>
          <p className="research-detail-note">{riskDetail.text || researchPayload.riskSummary || "Risk özeti hazırlanıyor."}</p>
        </Card>
        <Card>
          <CardTitle title="En Etkili Haberler" subtitle={`${importantNews.length} haber`} />
          <div className="important-news-list">
            {importantNews.length ? importantNews.slice(0, 5).map((item, index) => (
              <a className="important-news-item" key={`${item.url || item.title}-${index}`} href={item.url || "#"} target="_blank" rel="noreferrer">
                <Badge tone={newsTone(item.sentiment)}>{item.sentiment || item.impact || "neutral"}</Badge>
                <span>{item.title || "Başlık yok"}</span>
                <small>{item.turkishSummary || item.summary || item.source || "Türkçe özet hazırlanıyor."}</small>
                <em>{formatNewsReaction(item.reactions || priceReaction)} · {item.importanceReason || item.publisher || item.source || "Haber izleme"}</em>
              </a>
            )) : <p className="empty">Bu hisse için etkili haber bulunamadı.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle title="Kaynak Kanıtı" subtitle="Araştırma çıktısının hangi verilerle üretildiği" />
        <div className="research-provenance-row">
          <span><b>Sağlayıcı</b>{researchPayload.provider || "-"}</span>
          <span><b>LLM</b>{researchPayload.llmProvider || "Yapılandırılmadı"}</span>
          <span><b>Üretim</b>{researchPayload.generatedAt ? new Date(researchPayload.generatedAt * 1000).toLocaleString("tr-TR") : "-"}</span>
          <span><b>Fiyat</b>{provenance.snapshot ? "anlık kayıt" : "yedek kaynak"}</span>
          <span><b>Haber</b>{provenance.news ? "haber servisi" : "yok"}</span>
          <span><b>Analiz</b>{provenance.analysis ? "analiz servisi" : "yok"}</span>
        </div>
      </Card>
    </section>
  );
}

function CommandPalette({ rows, onClose, onChange }) {
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef(null);
  const commands = React.useMemo(() => buildCommandItems(rows, onChange), [rows, onChange]);
  const filtered = React.useMemo(() => {
    const q = normalizeCommandText(query);
    const list = !q ? commands : commands.filter((item) => normalizeCommandText(`${item.title} ${item.subtitle} ${item.keywords || ""}`).includes(q));
    return list.slice(0, 18);
  }, [commands, query]);

  React.useEffect(() => {
    inputRef.current.focus();
  }, []);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const run = (item) => {
    if (!item) return;
    item.action();
    onClose();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => filtered.length ? (value + 1) % filtered.length : 0);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => filtered.length ? (value - 1 + filtered.length) % filtered.length : 0);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      run(filtered[activeIndex]);
    }
  };

  return (
    <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="command-palette" role="dialog" aria-modal="true" aria-label="Komut paleti">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Komut veya hisse ara..."
        />
        <div className="command-list">
          {filtered.length ? filtered.map((item, index) => (
            <button
              key={item.id}
              type="button"
              data-command-id={item.id}
              className={index === activeIndex ? "active" : ""}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => run(item)}
            >
              <span>{item.title}<small>{item.subtitle}</small></span>
              <small>{item.group}</small>
            </button>
          )) : <p className="empty">Sonuç yok.</p>}
        </div>
      </div>
    </div>
  );
}

function formatNewsReaction(reactions = {}) {
  const parts = [
    ["+1G", reactions.plus1d],
    ["+3G", reactions.plus3d],
    ["+7G", reactions.plus7d]
  ].filter(([, value]) => Number.isFinite(Number(value)));
  if (!parts.length) return "Fiyat tepkisi hazırlanıyor";
  return parts.map(([label, value]) => `${label} ${fmtPct(Number(value))}`).join(" · ");
}

function buildCommandItems(rows, onChange) {
  const route = (hash) => () => {
    window.location.hash = hash;
    onChange();
  };
  const applyFilter = (patch, hash = "#dashboard") => () => {
    setFilters(patch);
    window.location.hash = hash;
    onChange();
  };
  const openSymbol = (row, hash = "#dashboard") => () => {
    selectRow(row.symbol, onChange);
    window.location.hash = hash;
    onChange();
  };
  const staticCommands = [
    { id: "route-dashboard", group: "Sayfa", title: "Paneli aç", subtitle: "Ana izleme paneline git", keywords: "ana ekran fiyat tablo dashboard", action: route("#dashboard") },
    { id: "route-signals", group: "Sayfa", title: "Sinyaller aç", subtitle: "Sinyal merkezi ve alarm motoru", keywords: "alarm teknik analiz rsi macd", action: route("#signals") },
    { id: "route-screener", group: "Sayfa", title: "Taramayı aç", subtitle: "Çok kriterli hisse tarama", keywords: "tarama filtre heatmap screener", action: route("#screener") },
    { id: "route-research", group: "Sayfa", title: "Araştırma aç", subtitle: "Türkçe haber özeti ve araştırma paneli", keywords: "haber araştırma özet sentiment research", action: route("#research") },
    { id: "route-portfolio", group: "Sayfa", title: "Portföy aç", subtitle: "P/L, stop ve işlem günlüğü", keywords: "risk işlem günlük pozisyon", action: route("#portfolio") },
    { id: "route-reports", group: "Sayfa", title: "Raporları aç", subtitle: "CSV, HTML ve JSON yedek", keywords: "export import yedek backup", action: route("#reports") },
    { id: "route-admin", group: "Sayfa", title: "Yönetimi aç", subtitle: "Sağlayıcı, LLM, önbellek ve denetim", keywords: "ayar operasyon llm provider admin", action: route("#admin") },
    { id: "filter-risk", group: "Filtre", title: "Risklileri göster", subtitle: "Risk yüksek sıralamasıyla dashboard", keywords: "risk stop zarar", action: applyFilter({ sortBy: "highRisk", sortDir: "desc", signal: "all", target: "all" }, "#dashboard") },
    { id: "filter-fib", group: "Filtre", title: "Fib'e yakınları göster", subtitle: "Fib yakın filtresini aç", keywords: "hedef fibonacci yakın", action: applyFilter({ fibOnly: true, sortBy: "targetClosest", sortDir: "asc" }, "#dashboard") },
    { id: "filter-news", group: "Filtre", title: "Haber etkisi yüksekleri listele", subtitle: "Haber pozitif öncelikli screener", keywords: "haber sentiment etki", action: applyFilter({ news: "positive", sortBy: "newsPositive", sortDir: "desc" }, "#screener") },
    { id: "filter-favorites", group: "Filtre", title: "Favorileri göster", subtitle: "Favori watchlist filtresi", keywords: "yıldız izleme", action: applyFilter({ favoritesOnly: true }, "#dashboard") },
    { id: "clear-filters", group: "Filtre", title: "Filtreleri temizle", subtitle: "Tüm hisseleri varsayılan sıralamada göster", keywords: "reset temizle tümü", action: applyFilter({ search: "", category: "all", status: "all", fibOnly: false, favoritesOnly: false, target: "all", signal: "all", news: "all", sortBy: "fibDistancePct", sortDir: "asc" }, "#dashboard") }
  ];
  const workspaceCommands = buildWorkspaceCommandItems(rows, applyFilter, route);
  const stockCommands = rows.slice(0, 120).map((row) => ({
    id: `stock-${row.symbol}`,
    group: "Hisse",
    title: `${row.symbol} aç`,
    subtitle: `${row.company} · ${row.category}`,
    keywords: `${row.company} ${row.category} ${row.newsSentiment} ${signalLabel(row.technicalSignal)}`,
    action: openSymbol(row)
  }));
  const researchCommands = rows.slice(0, 30).map((row) => ({
    id: `research-${row.symbol}`,
    group: "Araştırma",
    title: `${row.symbol} araştırmasını aç`,
    subtitle: `${row.company} · haber ${newsLabel(row.newsSentiment)} · ${signalLabel(row.technicalSignal)}`,
    keywords: `research haber özet analiz ${row.company} ${row.category}`,
    action: openSymbol(row, "#research")
  }));
  const alarmCommands = rows
    .filter((row) => row.isNearFib || row.riskLevel === "high" || row.newsImpact === "high")
    .slice(0, 20)
    .map((row) => ({
      id: `watch-${row.symbol}`,
      group: "İzleme",
      title: `${row.symbol} sinyalini incele`,
      subtitle: `${signalLabel(row.technicalSignal)} · Risk ${riskLabel(row.riskLevel)} · Fib ${fmtPct(row.targetDistancePct)}`,
      keywords: `sinyal alarm fib risk ${row.company}`,
      action: openSymbol(row, "#signals")
    }));
  return [...staticCommands, ...workspaceCommands, ...alarmCommands, ...researchCommands, ...stockCommands];
}

function buildWorkspaceCommandItems(rows, applyFilter, route) {
  const categoryNames = [...new Set(rows.map((row) => row.category).filter(Boolean))];
  const findCategory = (patterns) => categoryNames.find((category) => patterns.some((pattern) => normalizeCommandText(category).includes(pattern)));
  const aiCategory = findCategory(["yapay zeka", "ai", "semiconductor", "yarı iletken", "yari iletken"]);
  const nandCategory = findCategory(["nand", "depolama", "veri saklama", "storage"]);
  const commands = [
    {
      id: "workspace-favorites",
      group: "Çalışma Alanı",
      title: "Favoriler çalışma alanı",
      subtitle: `${rows.filter((row) => row.isFavorite).length} favori hisseyi dashboard'da göster`,
      keywords: "workspace çalışma alanı favori yıldız watchlist",
      action: applyFilter({ search: "", category: "all", favoritesOnly: true, fibOnly: false, status: "all", target: "all", signal: "all", news: "all", sortBy: "fibDistancePct", sortDir: "asc" }, "#dashboard")
    },
    {
      id: "workspace-risk",
      group: "Çalışma Alanı",
      title: "Risk çalışma alanı",
      subtitle: `${rows.filter((row) => row.riskLevel === "high" || Number(row.riskScore || 0) >= 3.5).length} yüksek riskli hisse`,
      keywords: "workspace çalışma alanı risk stop zarar kontrol",
      action: applyFilter({ search: "", category: "all", favoritesOnly: false, fibOnly: false, status: "all", target: "all", signal: "all", news: "all", sortBy: "highRisk", sortDir: "desc" }, "#dashboard")
    },
    {
      id: "workspace-fib",
      group: "Çalışma Alanı",
      title: "Fib'e yakın çalışma alanı",
      subtitle: `${rows.filter((row) => row.isNearFib).length} hedefe yakın hisse`,
      keywords: "workspace çalışma alanı fibonacci fib hedef yakın",
      action: applyFilter({ search: "", category: "all", favoritesOnly: false, fibOnly: true, status: "all", target: "all", signal: "all", news: "all", sortBy: "targetClosest", sortDir: "asc" }, "#dashboard")
    },
    {
      id: "workspace-news",
      group: "Çalışma Alanı",
      title: "Haber etkisi çalışma alanı",
      subtitle: `${rows.filter((row) => row.newsSentiment === "positive" || row.newsImpact === "high").length} haber etkili hisse`,
      keywords: "workspace çalışma alanı haber sentiment pozitif etki research",
      action: applyFilter({ search: "", category: "all", favoritesOnly: false, fibOnly: false, status: "all", target: "all", signal: "all", news: "positive", sortBy: "newsPositive", sortDir: "desc" }, "#screener")
    },
    {
      id: "workspace-portfolio",
      group: "Çalışma Alanı",
      title: "Portföy çalışma alanı",
      subtitle: "P/L, stop, işlem günlüğü ve risk sayfasını aç",
      keywords: "workspace çalışma alanı portföy portfolio pl stop işlem günlük",
      action: route("#portfolio")
    }
  ];
  if (aiCategory) {
    commands.push({
      id: "workspace-ai",
      group: "Çalışma Alanı",
      title: "AI çalışma alanı",
      subtitle: `${aiCategory} kategorisini dashboard'da göster`,
      keywords: `workspace çalışma alanı ai yapay zeka ${aiCategory}`,
      action: applyFilter({ search: "", category: aiCategory, favoritesOnly: false, fibOnly: false, status: "all", target: "all", signal: "all", news: "all", sortBy: "fibDistancePct", sortDir: "asc" }, "#dashboard")
    });
  }
  if (nandCategory) {
    commands.push({
      id: "workspace-nand",
      group: "Çalışma Alanı",
      title: "NAND çalışma alanı",
      subtitle: `${nandCategory} kategorisini dashboard'da göster`,
      keywords: `workspace çalışma alanı nand depolama veri saklama storage ${nandCategory}`,
      action: applyFilter({ search: "", category: nandCategory, favoritesOnly: false, fibOnly: false, status: "all", target: "all", signal: "all", news: "all", sortBy: "fibDistancePct", sortDir: "asc" }, "#dashboard")
    });
  }
  return commands;
}

function normalizeCommandText(value) {
  return String(value || "")
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function FilterToolbar({ onChange }) {
  const categories = getCategories();
  const update = (patch) => {
    setFilters(patch);
    onChange();
  };
  return (
    <Card className="filter-card">
      <div className="field search-field">
        <label>Arama</label>
        <input value={state.filters.search} onChange={(event) => update({ search: event.target.value })} placeholder="NVDA, Tesla, NAND..." />
      </div>
      <SelectField label="Kategori" value={state.filters.category} onChange={(value) => update({ category: value })}>
        <option value="all">Tümü</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </SelectField>
      <SelectField label="Durum" value={state.filters.status} onChange={(value) => update({ status: value })}>
        <option value="all">Tümü</option>
        <option value="live">Canlı</option>
        <option value="stale">Eski</option>
        <option value="error">Hata</option>
      </SelectField>
      <SelectField label="Sıralama" value={state.filters.sortBy} onChange={(value) => update({ sortBy: value })}>
        <option value="fibDistancePct">Fib'e en yakın</option>
        <option value="price">Fiyat</option>
        <option value="score">Genel skor</option>
        <option value="return">Seçili getiri</option>
        <option value="newsPositive">Haber pozitif</option>
        <option value="highRisk">Risk yüksek</option>
        <option value="symbol">Sembol</option>
      </SelectField>
      <SelectField label="Periyot" value={String(state.filters.returnPeriod)} onChange={(value) => update({ returnPeriod: Number(value) })}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => <option key={month} value={month}>{month}A</option>)}
      </SelectField>
      <SelectField label="Hedef" value={state.filters.target} onChange={(value) => update({ target: value })}>
        <option value="all">Tümü</option>
        <option value="near">Hedefe yakın</option>
        <option value="above">Hedef üstü</option>
        <option value="below">Hedef altı</option>
        <option value="custom">Özel hedef</option>
      </SelectField>
      <SelectField label="Sinyal" value={state.filters.signal} onChange={(value) => update({ signal: value })}>
        <option value="all">Tümü</option>
        <option value="strong_buy">Güçlü Al</option>
        <option value="buy">Al</option>
        <option value="watch">İzle</option>
        <option value="neutral">Nötr</option>
        <option value="risky">Riskli</option>
        <option value="sell">Sat</option>
        <option value="strong_sell">Güçlü Sat</option>
      </SelectField>
      <label className="field compact-field">
        <span>Uyarı eşiği</span>
        <input type="number" min="0.1" max="20" step="0.1" value={state.ui.alertThreshold} onChange={(event) => { setUi({ alertThreshold: Number(event.target.value) }); onChange(); }} />
      </label>
      <button className={`toggle-pill ${state.filters.fibOnly ? "active" : ""}`} onClick={() => update({ fibOnly: !state.filters.fibOnly })}>Fib'e yakın</button>
      <button className={`toggle-pill ${state.filters.favoritesOnly ? "active" : ""}`} onClick={() => update({ favoritesOnly: !state.filters.favoritesOnly })}>Favoriler</button>
    </Card>
  );
}

function SelectField({ label, value, onChange, children }) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef(null);
  const optionText = (content) => React.Children.toArray(content)
    .map((item) => {
      if (typeof item === "string" || typeof item === "number") return String(item);
      if (React.isValidElement(item)) return optionText(item.props.children);
      return "";
    })
    .join("")
    .trim();
  const options = React.Children.toArray(children)
    .filter((child) => React.isValidElement(child))
    .map((child) => {
      const childLabel = optionText(child.props.children);
      const childValue = child.props.value ?? childLabel;
      return {
        value: String(childValue ?? ""),
        label: childLabel || String(childValue ?? "")
      };
    });
  const selected = options.find((option) => option.value === String(value)) || options[0];
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
    || option.value.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
  );
  const safeFiltered = filtered.length ? filtered : options;
  React.useEffect(() => {
    if (!open) return;
    const currentIndex = Math.max(0, safeFiltered.findIndex((option) => option.value === String(value)));
    setActiveIndex(currentIndex >= 0 ? currentIndex : 0);
  }, [open, search, value]);
  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);
  const safeSelect = (optionValue) => {
    onChange(optionValue);
    setSearch("");
    setOpen(false);
  };
  const onSelectKeyDown = (event) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((value) => (safeFiltered.length ? (value + 1) % safeFiltered.length : 0));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((value) => (safeFiltered.length ? (value - 1 + safeFiltered.length) % safeFiltered.length : 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const candidate = safeFiltered[activeIndex];
      if (candidate) safeSelect(candidate.value);
    }
  };
  return (
    <label className="field">
      <span>{label}</span>
      <div ref={rootRef} className={`metronic-select ${open ? "open" : ""}`}>
        <button type="button" onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            setOpen(false);
          }
        }} onClick={() => { setOpen((current) => !current); setSearch(""); }}>
          <span>{selected.label || "Seç"}</span>
          <i>⌄</i>
        </button>
        {open ? (
          <div className="metronic-options">
            <div className="metronic-search">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={onSelectKeyDown}
                placeholder={`${label} ara...`}
              />
            </div>
            {filtered.length ? filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`${option.value === String(value) ? "active" : ""} ${safeFiltered[activeIndex].value === option.value ? "focused" : ""}`}
                onMouseEnter={() => setActiveIndex(safeFiltered.findIndex((item) => item.value === option.value))}
                onClick={(event) => { event.preventDefault(); safeSelect(option.value); }}
              >
                {option.label}
              </button>
            )) : <p className="metronic-empty">Sonuç yok</p>}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function StockTable({ rows, selected, onChange }) {
  const sort = (sortBy) => {
    const sortDir = state.filters.sortBy === sortBy && state.filters.sortDir === "asc" ? "desc" : "asc";
    setFilters({ sortBy, sortDir });
    onChange();
  };
  return (
    <Card className="table-card">
      <CardTitle title="İzleme Listesi" subtitle={`${rows.length} hisse listeleniyor`} />
      <div className="stock-table-wrap">
        <table className="stock-table">
          <thead>
            <tr>
              <th></th>
              <SortableTh id="symbol" onSort={sort}>Sembol</SortableTh>
              <SortableTh id="company" onSort={sort}>Şirket</SortableTh>
              <SortableTh id="price" onSort={sort}>Güncel</SortableTh>
              <SortableTh id="fibTarget" onSort={sort}>Fib hedef</SortableTh>
              <SortableTh id="targetClosest" onSort={sort}>Fib uzaklığı</SortableTh>
              <SortableTh id="return" onSort={sort}>Getiri</SortableTh>
              <th>Isı Haritası</th>
              <SortableTh id="momentumNews" onSort={sort}>Sinyal</SortableTh>
              <SortableTh id="highRisk" onSort={sort}>Risk</SortableTh>
              <SortableTh id="score" onSort={sort}>Skor</SortableTh>
              <SortableTh id="status" onSort={sort}>Durum</SortableTh>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className={selected?.symbol === row.symbol ? "selected" : ""} onClick={() => selectRow(row.symbol, onChange)}>
                <td>
                  <button className="star-button" onClick={(event) => { event.stopPropagation(); toggleFavorite(row.symbol); onChange(); }}>
                    {row.isFavorite ? "★" : "☆"}
                  </button>
                </td>
                <td>
                  <div className="symbol-cell">
                    <span className="logo-badge"><img src={logoUrl(row)} alt="" onError={(event) => { event.currentTarget.src = fallbackLogo(row.symbol); }} /></span>
                    <div><strong>{row.symbol}</strong><small>{row.snapshot?.source || "kaynak yok"}</small></div>
                  </div>
                </td>
                <td><span>{row.company}</span><small>{row.category}</small></td>
                <td><strong>{fmtUsd(row.price)}</strong><small>{ageLabel(row.snapshot?.sourceFreshnessSec)}</small></td>
                <td><strong>{fmtUsd(row.fibTarget)}</strong><small>{row.isCustomFibTarget ? "Özel hedef" : targetLabel(row.targetStatus)}</small></td>
                <td className={Number(row.fibDistancePct) >= 0 ? "up" : "down"}><strong>{fmtPct(row.fibDistancePct)}</strong></td>
                <td className={Number(row.selectedReturn) >= 0 ? "up" : "down"}>{fmtPct(row.selectedReturn)}</td>
                <td><ReturnHeatmap returns={row.returns} compact /></td>
                <td><SignalStrip row={row} compact /></td>
                <td><Badge tone={riskTone(row.riskLevel)}>{riskLabel(row.riskLevel)}</Badge></td>
                <td><span className="score-pill">{row.score}</span></td>
                <td><Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge></td>
                <td>
                  <button className="delete-button" onClick={(event) => { event.stopPropagation(); removeStockFromList(row.symbol); onChange(); }}>
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function StockCardList({ rows, selected, onChange }) {
  return (
    <div className="stock-card-list">
      {rows.map((row) => (
        <Card key={row.symbol} className={`stock-mobile-card ${selected?.symbol === row.symbol ? "selected" : ""}`}>
          <div className="mobile-card-main">
            <button className="star-button" onClick={() => { toggleFavorite(row.symbol); onChange(); }}>
              {row.isFavorite ? "★" : "☆"}
            </button>
            <button className="mobile-card-select" onClick={() => selectRow(row.symbol, onChange)}>
              <span className="logo-badge"><img src={logoUrl(row)} alt="" onError={(event) => { event.currentTarget.src = fallbackLogo(row.symbol); }} /></span>
              <span><strong>{row.symbol}</strong><small>{row.company}</small></span>
              <strong>{fmtUsd(row.price)}</strong>
            </button>
            <button className="delete-button" onClick={() => { removeStockFromList(row.symbol); onChange(); }}>Sil</button>
          </div>
          <div className="mobile-card-metrics">
            <Metric label="Fib" value={fmtUsd(row.fibTarget)} />
            <Metric label="Uzaklık" value={fmtPct(row.fibDistancePct)} tone={Number(row.fibDistancePct) >= 0 ? "up" : "down"} />
            <Metric label={`${state.filters.returnPeriod}A`} value={fmtPct(row.selectedReturn)} tone={Number(row.selectedReturn) >= 0 ? "up" : "down"} />
            <Metric label="Skor" value={`+${row.score}`} />
          </div>
          <ReturnHeatmap returns={row.returns} />
          <SignalStrip row={row} />
        </Card>
      ))}
    </div>
  );
}

function SortableTh({ id, onSort, children }) {
  const active = state.filters.sortBy === id;
  return (
    <th>
      <button className={`sort-head ${active ? "active" : ""}`} onClick={() => onSort(id)}>
        {children} {active ? (state.filters.sortDir === "asc" ? "↑" : "↓") : ""}
      </button>
    </th>
  );
}

function selectRow(symbol, onChange) {
  state.selectedSymbol = symbol;
  setUi({ detailTab: state.ui.detailTab || "grafik" });
  onChange();
  loadSelectedNews(onChange, true);
  loadSelectedAnalysis(onChange, true);
}

function StockDetailPanel({ row, onChange }) {
  const [targetInput, setTargetInput] = React.useState(row?.fibTarget ? String(row.fibTarget) : "");
  React.useEffect(() => setTargetInput(row?.fibTarget ? String(row.fibTarget) : ""), [row?.symbol, row?.fibTarget]);
  if (!row) return <Card className="detail-panel"><p>Hisse seçimi yok.</p></Card>;

  const history = getCachedHistory(row.symbol, state.ui.historyRange, state.ui.historyInterval);
  const tab = state.ui.detailTab || "grafik";
  const plan = row.investmentPlan || {};

  return (
    <aside className="detail-panel">
      <Card className="detail-header">
        <div className="detail-title">
          <span className="logo-badge detail-logo"><img src={logoUrl(row)} alt="" onError={(event) => { event.currentTarget.src = fallbackLogo(row.symbol); }} /></span>
          <div>
            <h2>{row.symbol}</h2>
            <p>{row.company}</p>
          </div>
        </div>
        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
        <strong className="detail-price">{fmtUsd(row.price)}</strong>
        <small>{row.snapshot?.source || "kaynak yok"} · {ageLabel(row.snapshot?.sourceFreshnessSec)}</small>
        <form className="target-form" onSubmit={(event) => {
          event.preventDefault();
          setFibTarget(row.symbol, Number(targetInput));
          onChange();
        }}>
          <label>Fib hedefi</label>
          <div>
            <input value={targetInput} onChange={(event) => setTargetInput(event.target.value)} />
            <Button type="submit">Kaydet</Button>
          </div>
          <button type="button" onClick={() => { resetFibTarget(row.symbol); onChange(); }}>Varsayılan hedefe dön</button>
        </form>
      </Card>

      <div className="tabbar">
        {DETAIL_TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => { setUi({ detailTab: id }); onChange(); }}>{label}</button>
        ))}
      </div>

      {tab === "grafik" ? <ChartTab row={row} history={history} onChange={onChange} /> : null}
      {tab === "haberler" ? <NewsTab row={row} /> : null}
      {tab === "analiz" ? <AnalysisTab row={row} /> : null}
      {tab === "notlar" ? <NotesTab row={row} plan={plan} onChange={onChange} /> : null}
    </aside>
  );
}

function ChartTab({ row, history, onChange }) {
  const returns = Array.isArray(row.returns) ? row.returns : [];
  const fibPlan = row.signalDetail?.fibPlan || {};
  return (
    <Card>
      <div className="range-row">
        {[
          ["1d", "5m", "1G"],
          ["5d", "30m", "1H"],
          ["1mo", "1d", "1A"],
          ["3mo", "1d", "3A"],
          ["6mo", "1d", "6A"],
          ["1y", "1d", "1Y"]
        ].map(([range, interval, label]) => (
          <button key={`${range}:${interval}`} className={state.ui.historyRange === range && state.ui.historyInterval === interval ? "active" : ""} onClick={async () => {
            setUi({ historyRange: range, historyInterval: interval });
            onChange();
            try {
              setHistory(row.symbol, range, interval, await getHistory(row.symbol, range, interval));
            } catch (error) {
              console.warn(`Grafik verisi alınamadı: ${row.symbol} ${range}/${interval}`, error);
            } finally {
              onChange();
            }
          }}>{label}</button>
        ))}
      </div>
      <SparkChart points={history} target={row.fibTarget} signal={row.signalDetail} />
      <ReturnHeatmap returns={returns} title="1-12 aylık getiri ısı haritası" />
      <SignalStrip row={row} />
      <div className="detail-metrics">
        <Metric label="Fib hedef" value={fmtUsd(row.fibTarget)} />
        <Metric label="Fib uzaklığı" value={fmtPct(row.fibDistancePct)} />
        <Metric label="Hedef durumu" value={targetLabel(row.targetStatus)} />
        <Metric label="Fib güven" value={`${fmtNumber(fibPlan.confidence, 0)}%`} />
        <Metric label="Fib destek" value={fmtUsd(fibPlan.support?.price)} />
        <Metric label="Fib direnç" value={fmtUsd(fibPlan.resistance?.price)} />
        <Metric label="Genel skor" value={`+${row.score}`} />
        <Metric label="Teknik sinyal" value={signalLabel(row.technicalSignal)} />
        <Metric label="Risk" value={riskLabel(row.riskLevel)} />
      </div>
      <div className="returns-grid">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
          const value = returns.find((item) => item.month === month)?.value;
          return <Metric key={month} label={`${month}A`} value={fmtPct(value)} tone={Number(value) >= 0 ? "up" : "down"} />;
        })}
      </div>
    </Card>
  );
}

function SparkChart({ points, target, signal }) {
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const sourcePoints = (points || [])
    .map((point) => ({ ...point, value: Number(point.close ?? point.price) }))
    .filter((point) => Number.isFinite(point.value));
  const values = sourcePoints.map((point) => point.value);
  if (values.length < 2) return <div className="chart-empty">Grafik verisi yükleniyor</div>;
  const width = 640;
  const height = 220;
  const fibLevels = getVisibleFibLevels(signal?.fibPlan, Number(target));
  const fibPrices = fibLevels.map((level) => Number(level.price)).filter(Number.isFinite);
  const overlays = buildChartOverlays(values);
  const overlayValues = overlays.flatMap((overlay) => overlay.points.map((point) => point.value)).filter(Number.isFinite);
  const ohlcValues = sourcePoints.flatMap((point) => [point.open, point.high, point.low, point.close].map(Number)).filter(Number.isFinite);
  const min = Math.min(...values, ...ohlcValues, ...fibPrices, ...overlayValues, Number(target) || Infinity);
  const max = Math.max(...values, ...ohlcValues, ...fibPrices, ...overlayValues, Number(target) || -Infinity);
  const span = max - min || 1;
  const yForValue = (value) => height - ((value - min) / span) * height;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = yForValue(value);
    return { value, x, y, source: sourcePoints[index] };
  });
  const candleWidth = Math.max(2, Math.min(8, (width / values.length) * 0.62));
  const candles = sourcePoints.map((point, index) => {
    const open = Number(point.open);
    const high = Number(point.high);
    const low = Number(point.low);
    const close = Number(point.close ?? point.value);
    if (![open, high, low, close].every(Number.isFinite)) return null;
    const x = (index / (values.length - 1)) * width;
    const openY = yForValue(open);
    const closeY = yForValue(close);
    const highY = yForValue(high);
    const lowY = yForValue(low);
    return {
      x,
      y: Math.min(openY, closeY),
      wickTop: Math.min(highY, lowY),
      wickBottom: Math.max(highY, lowY),
      height: Math.max(1.5, Math.abs(openY - closeY)),
      width: candleWidth,
      direction: close >= open ? "up" : "down"
    };
  }).filter(Boolean);
  const finiteVolumes = sourcePoints.map((point) => Number(point.volume)).filter((volume) => Number.isFinite(volume) && volume > 0);
  const maxVolume = finiteVolumes.length ? Math.max(...finiteVolumes) : 0;
  const volumeHeight = 42;
  const volumeBars = maxVolume > 0 ? sourcePoints.map((point, index) => {
    const volume = Number(point.volume);
    if (!Number.isFinite(volume) || volume <= 0) return null;
    const x = (index / (values.length - 1)) * width;
    const barWidth = Math.max(1.4, Math.min(7, (width / values.length) * 0.58));
    const barHeight = Math.max(1, (volume / maxVolume) * volumeHeight);
    const previous = values[Math.max(0, index - 1)];
    return {
      x: Math.max(0, x - barWidth / 2),
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
      direction: index === 0 || point.value >= previous ? "up" : "down"
    };
  }).filter(Boolean) : [];
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  const overlayPaths = overlays.map((overlay) => ({
    ...overlay,
    path: overlay.points
      .map((point, index) => {
        const x = (point.index / (values.length - 1)) * width;
        const y = yForValue(point.value);
        return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ")
  }));
  const overlayLabels = overlayPaths.map((overlay, index) => ({
    ...overlay,
    x: 14,
    y: 18 + index * 16
  }));
  const fibLabels = fibLevels.map((level, index) => ({
    ...level,
    y: 46 + index * 18
  }));
  const targetY = Number.isFinite(Number(target)) ? yForValue(Number(target)) : null;
  const hover = Number.isInteger(hoverIndex) ? coords[hoverIndex] : null;
  const hoverBox = hover ? {
    x: Math.min(width - 214, Math.max(6, hover.x + 10)),
    y: Math.min(height - 84, Math.max(6, hover.y - 86))
  } : null;
  const signalPoint = coords.at(-1);
  const signalLabelX = signalPoint ? Math.min(width - 102, Math.max(8, signalPoint.x - 104)) : 8;
  const signalLabelY = signalPoint ? Math.min(height - 34, Math.max(8, signalPoint.y - 44)) : 8;
  const onMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * (values.length - 1)));
  };
  return (
    <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hisse fiyat grafiği" preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHoverIndex(null)}>
      <defs>
        <linearGradient id="chartGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#chartGlow)" />
      <g className="chart-volume-bars" aria-label="Hacim barları">
        {volumeBars.map((bar, index) => (
          <rect key={`${bar.x}-${index}`} className={bar.direction} x={bar.x.toFixed(2)} y={bar.y.toFixed(2)} width={bar.width.toFixed(2)} height={bar.height.toFixed(2)} rx="1" />
        ))}
      </g>
      <g className="chart-candlesticks" aria-label="Mum grafiği">
        {candles.map((candle, index) => (
          <g key={`${candle.x}-${index}`} className={candle.direction}>
            <line x1={candle.x.toFixed(2)} x2={candle.x.toFixed(2)} y1={candle.wickTop.toFixed(2)} y2={candle.wickBottom.toFixed(2)} />
            <rect x={(candle.x - candle.width / 2).toFixed(2)} y={candle.y.toFixed(2)} width={candle.width.toFixed(2)} height={candle.height.toFixed(2)} rx="1.5" />
          </g>
        ))}
      </g>
      {overlayPaths.map((overlay) => overlay.path ? (
        <g key={overlay.id} className={`indicator-path ${overlay.id}`}>
          <path d={overlay.path} />
        </g>
      ) : null)}
      <g className="chart-overlay-labels" aria-label="Hareketli ortalama etiketleri">
        {overlayLabels.map((overlay) => overlay.path ? (
          <g key={`${overlay.id}-label`} className={`indicator-label ${overlay.id}`}>
            <rect x={overlay.x - 6} y={overlay.y - 12} width="58" height="16" rx="5" />
            <text x={overlay.x} y={overlay.y}>{overlay.label}</text>
          </g>
        ) : null)}
      </g>
      <path d={path} fill="none" stroke="#00d4ff" strokeWidth="3" strokeLinecap="round" />
      {fibLevels.map((level) => {
        const y = yForValue(Number(level.price));
        return (
          <g key={`${level.label}-${level.price}`} className={`fib-level-line ${level.type}`}>
            <line x1="0" x2={width} y1={y} y2={y} />
          </g>
        );
      })}
      <g className="fib-level-labels" aria-label="Fibonacci seviye etiketleri">
        {fibLabels.map((level) => (
          <g key={`${level.label}-${level.price}-label`} className={`fib-level-label ${level.type}`}>
            <rect x={width - 134} y={level.y - 13} width="126" height="17" rx="5" />
            <text x={width - 128} y={level.y}>{level.label} {fmtUsd(level.price)}</text>
          </g>
        ))}
      </g>
      {signalPoint ? (
        <g className={`signal-chart-marker ${signalToneClass(signal.signal)}`}>
          <circle cx={signalPoint.x} cy={signalPoint.y} r="7" />
          <line x1={signalPoint.x} x2={signalLabelX + 100} y1={signalPoint.y} y2={signalLabelY + 12} />
          <rect x={signalLabelX} y={signalLabelY} width="100" height="24" rx="6" />
          <text x={signalLabelX + 8} y={signalLabelY + 16}>{signalLabel(signal.signal)}</text>
        </g>
      ) : null}
      {targetY !== null ? (
        <g className="fib-target-mark">
          <line x1="0" x2={width} y1={targetY} y2={targetY} stroke="#f6c343" strokeDasharray="8 7" />
          <rect x="12" y={Math.max(6, targetY - 24)} width="112" height="20" rx="5" />
          <text x="18" y={Math.max(20, targetY - 10)}>Fib hedef {fmtUsd(target)}</text>
        </g>
      ) : null}
      {hover ? (
        <g className="chart-hover">
          <line x1={hover.x} x2={hover.x} y1="0" y2={height} />
          <circle cx={hover.x} cy={hover.y} r="5" />
          <rect x={hoverBox.x} y={hoverBox.y} width="206" height="78" rx="6" />
          <text x={hoverBox.x + 10} y={hoverBox.y + 18}>{fmtUsd(hover.value)}</text>
          <text className="muted" x={hoverBox.x + 10} y={hoverBox.y + 34}>{formatChartTime(hover.source)}</text>
          <text className="muted" x={hoverBox.x + 10} y={hoverBox.y + 50}>{formatChartOhlc(hover.source)}</text>
          <text className="muted" x={hoverBox.x + 10} y={hoverBox.y + 66}>Hacim {formatChartVolume(hover.source)}</text>
        </g>
      ) : null}
    </svg>
  );
}

function buildChartOverlays(values) {
  return [
    { id: "ma20", label: "MA20", period: 20, order: 0 },
    { id: "ma50", label: "MA50", period: 50, order: 1 },
    { id: "ma200", label: "MA200", period: 200, order: 2 }
  ].map((overlay) => ({
    ...overlay,
    points: movingAveragePoints(values, overlay.period)
  })).filter((overlay) => overlay.points.length >= 2);
}

function movingAveragePoints(values, period) {
  if (!Array.isArray(values) || values.length < Math.max(2, period)) return [];
  const points = [];
  for (let index = period - 1; index < values.length; index += 1) {
    const slice = values.slice(index - period + 1, index + 1);
    const average = slice.reduce((sum, value) => sum + value, 0) / period;
    if (Number.isFinite(average)) points.push({ index, value: average });
  }
  return points;
}

function formatChartTime(point) {
  const raw = point.time ?? point.date ?? point.timestamp ?? point.datetime;
  if (raw === null || raw === undefined) return "zaman yok";
  const numeric = Number(raw);
  const date = Number.isFinite(numeric)
    ? new Date(numeric > 1e12 ? numeric : numeric * 1000)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatChartVolume(point) {
  const volume = Number(point.volume);
  if (!Number.isFinite(volume) || volume <= 0) return "-";
  return new Intl.NumberFormat("tr-TR", { notation: "compact", maximumFractionDigits: 1 }).format(volume);
}

function formatChartOhlc(point) {
  const open = Number(point.open);
  const high = Number(point.high);
  const low = Number(point.low);
  const close = Number(point.close ?? point.value);
  if (![open, high, low, close].every(Number.isFinite)) return "OHLC yok";
  return `A ${fmtUsd(open)} Y ${fmtUsd(high)} D ${fmtUsd(low)} K ${fmtUsd(close)}`;
}

function getVisibleFibLevels(fibPlan, target) {
  const levels = [
    fibPlan.support,
    fibPlan.resistance,
    fibPlan.activeLevel,
    Number.isFinite(target) ? { label: "Hedef", price: target, type: "target" } : null
  ].filter((level) => level && Number.isFinite(Number(level.price)));
  const unique = new Map();
  for (const level of levels) unique.set(`${level.label}:${level.price}`, level);
  return Array.from(unique.values()).slice(0, 4);
}

function ReturnHeatmap({ returns = [], compact = false, title = "1-12 aylık getiri" }) {
  const values = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const item = returns.find((entry) => Number(entry.month) === month);
    const value = Number(item.value);
    const finite = Number.isFinite(value);
    const intensity = finite ? Math.min(1, Math.abs(value) / 80) : 0;
    return { month, value, finite, intensity };
  });
  return (
    <div className={`return-heatmap ${compact ? "compact" : ""}`} aria-label={title} title={title}>
      {!compact ? <div className="heatmap-title"><span>{title}</span><strong>1A-12A</strong></div> : null}
      <div className="heatmap-cells">
        {values.map((item) => (
          <span
            key={item.month}
            className={`heat-cell ${!item.finite ? "neutral" : item.value >= 0 ? "positive" : "negative"}`}
            style={{ "--heat": item.intensity }}
            title={`${item.month}A ${fmtPct(item.value)}`}
          >
            <i>{item.month}A</i>
            {!compact ? <b>{fmtPct(item.value)}</b> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function SignalStrip({ row, compact = false }) {
  return (
    <div className={`signal-strip ${compact ? "compact" : ""}`}>
      <span className={`signal-chip ${signalToneClass(row.technicalSignal)}`}>Teknik {signalLabel(row.technicalSignal)}</span>
      <span className={`signal-chip ${newsToneClass(row.newsSentiment)}`}>Haber {newsLabel(row.newsSentiment)}</span>
      <span className={`signal-chip ${targetToneClass(row.targetStatus)}`}>{targetLabel(row.targetStatus)}</span>
      {!compact ? <span className={`signal-chip risk-${row.riskLevel || "low"}`}>Risk {riskLabel(row.riskLevel)}</span> : null}
    </div>
  );
}
function Metric({ label, value, tone = "" }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NewsTab({ row }) {
  const payload = state.news.get(row.symbol);
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 6) : [];
  return (
    <Card>
      <CardTitle title="Haber Etkisi" subtitle={`${row.newsCount || items.length || 0} haber`} />
      <div className="news-list">
        {items.length ? items.map((item, index) => (
          <a key={`${item.url || item.title}-${index}`} className="news-item" href={item.url} target="_blank" rel="noreferrer">
            <Badge tone={newsTone(item.sentiment)}>{item.sentiment || "neutral"}</Badge>
            <strong>{item.title}</strong>
            <p>{item.turkishSummary || item.summary || "Türkçe özet hazırlanıyor."}</p>
            <small>{item.source || payload.source || "haber kaynağı"}</small>
          </a>
        )) : <p className="empty">Bu hisse için haber verisi henüz yok.</p>}
      </div>
    </Card>
  );
}

function AnalysisTab({ row }) {
  const signal = row.signalDetail || {};
  return (
    <Card>
      <CardTitle title="Analiz Sinyalleri" subtitle="Bilgilendirme amaçlı karar destek verileri" />
      <div className="detail-metrics">
        <Metric label="Teknik sinyal" value={signalLabel(row.technicalSignal)} />
        <Metric label="Sinyal skoru" value={fmtNumber(signal.score, 0)} />
        <Metric label="Güven" value={`${fmtNumber(signal.confidence, 0)}%`} />
        <Metric label="Haber etkisi" value={row.newsSentiment || "neutral"} />
        <Metric label="Risk skoru" value={fmtNumber(row.riskScore, 1)} />
        <Metric label="Analist hedefi" value={fmtUsd(row.analysisTargetPrice)} />
        <Metric label="RSI 14" value={fmtNumber(signal.indicators.rsi14 ?? row.technicals.rsi14, 1)} />
        <Metric label="MACD" value={fmtNumber(signal.indicators.macdHistogram, 2)} />
        <Metric label="MACD kesişim" value={signal.indicators.macdCross === "bullish" ? "Yukarı" : signal.indicators.macdCross === "bearish" ? "Aşağı" : "Yok"} />
        <Metric label="Bollinger" value={signal.indicators.bollingerPosition || "middle"} />
        <Metric label="Hacim" value={Number.isFinite(signal.indicators.volumeSpikeRatio) ? `${fmtNumber(signal.indicators.volumeSpikeRatio, 1)}x` : "-"} />
        <Metric label="Fib güven" value={`${fmtNumber(signal.fibPlan.confidence, 0)}%`} />
        <Metric label="MA20 / MA50" value={`${fmtUsd(signal.indicators.sma20 ?? row.technicals.ma20)} / ${fmtUsd(signal.indicators.sma50 ?? row.technicals.ma50)}`} />
      </div>
      <FibLevelGrid fibPlan={signal.fibPlan} />
      <div className="signal-explain">
        {(signal.reasons || []).map((reason) => <span key={reason}>{reason}</span>)}
      </div>
    </Card>
  );
}

function FibLevelGrid({ fibPlan }) {
  const levels = (fibPlan.levels || []).filter((level) => [0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618].includes(Number(level.ratio)));
  if (!levels.length) return <p className="empty">Dinamik Fibonacci için yeterli seviye hazırlanamadı.</p>;
  return (
    <div className="fib-level-grid">
      <div className="fib-level-head">
        <strong>Dinamik Fibonacci seviyeleri</strong>
        <span>{fibPlan.method === "pivot_swing_1y" ? "1Y pivot swing" : "Hazırlanıyor"}</span>
      </div>
      {levels.map((level) => (
        <div key={`${level.label}-${level.price}`} className={level.type}>
          <span>{level.label}</span>
          <strong>{fmtUsd(level.price)}</strong>
          <small>{level.type === "extension" ? "Extension" : "Retracement"}</small>
        </div>
      ))}
    </div>
  );
}

function NotesTab({ row, plan, onChange }) {
  const [draft, setDraft] = React.useState(plan);
  React.useEffect(() => setDraft(plan), [row.symbol]);
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Card>
      <CardTitle title="Yatırım Planı" subtitle="LocalStorage üzerinde saklanır" />
      <div className="notes-form">
        <label>Not<textarea value={draft.note || ""} onChange={(event) => patch("note", event.target.value)} /></label>
        <label>Giriş fiyatı<input value={draft.entryPrice ?? ""} onChange={(event) => patch("entryPrice", event.target.value)} /></label>
        <label>Alım bölgesi<input value={draft.buyZone || ""} onChange={(event) => patch("buyZone", event.target.value)} /></label>
        <label>Stop seviyesi<input value={draft.stopPrice ?? ""} onChange={(event) => patch("stopPrice", event.target.value)} /></label>
        <SelectField label="Etiket" value={draft.positionTag || "İzle"} onChange={(value) => patch("positionTag", value)}>
          {["İzle", "Alım bölgesi", "Riskli", "Kârda", "Hedefte"].map((value) => <option key={value}>{value}</option>)}
        </SelectField>
        <Button onClick={() => { setInvestmentPlan(row.symbol, draft); onChange(); }}>Planı Kaydet</Button>
      </div>
    </Card>
  );
}

const ADMIN_SESSION_KEY = "matrix-admin-session-v1";
const ADMIN_LOAD_SECTION_LABELS = ["ayarlar", "sağlayıcı", "LLM", "görev", "önbellek", "denetim", "araştırma", "dışa aktarma"];

function AdminPage() {
  const [session, setSession] = React.useState(() => sessionStorage.getItem(ADMIN_SESSION_KEY) || "");
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("");
  const [data, setData] = React.useState(null);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [settingsDraft, setSettingsDraft] = React.useState(null);
  const [llmDraft, setLlmDraft] = React.useState(null);
  const [providersDraft, setProvidersDraft] = React.useState({ providers: [] });
  const [providersDirty, setProvidersDirtyState] = React.useState(false);
  const [providerTestResults, setProviderTestResults] = React.useState({});
  const [llmTestResult, setLlmTestResult] = React.useState(null);
  const [auditQuery, setAuditQuery] = React.useState("");
  const [auditStatus, setAuditStatus] = React.useState("all");
  const [researchQuery, setResearchQuery] = React.useState("");
  const [researchProvider, setResearchProvider] = React.useState("all");
  const [operationResult, setOperationResult] = React.useState(null);
  const providersDirtyRef = React.useRef(false);
  const setProvidersDirty = (value) => {
    providersDirtyRef.current = Boolean(value);
    setProvidersDirtyState(Boolean(value));
  };

  const loadAdmin = React.useCallback(async (nextSession = session) => {
    if (!nextSession) return;
    setLoading(true);
    setMessage("");
    try {
      const me = await getAdminMe(nextSession);
      const results = await Promise.allSettled([
        getAdminSettings(nextSession),
        getAdminProviders(nextSession),
        getAdminLlm(nextSession),
        getAdminJobs(nextSession),
        getAdminCache(nextSession),
        getAdminAudit(nextSession, 8),
        getAdminResearchSnapshots(nextSession, 8),
        getAdminExport(nextSession)
      ]);
      const [settings, providers, llm, jobs, cache, audit, research, operationExport] = normalizeAdminLoadResults(results);
      setData({ me, settings, providers, llm, jobs, cache, audit, research, operationExport });
      setSettingsDraft(settings);
      if (!providersDirtyRef.current) {
        setProvidersDraft(normalizeProviderDraft(providers, { lockExistingIds: true }));
      }
      setLlmDraft(llm);
      const failedSections = results
        .map((result, index) => result.status === "rejected" ? ADMIN_LOAD_SECTION_LABELS[index] : "")
        .filter(Boolean);
      if (failedSections.length) {
        setMessage(`Admin panel açıldı; şu bölümler yenilenemedi: ${failedSections.join(", ")}.`);
      } else if (providersDirtyRef.current) {
        setMessage("Sağlayıcı taslağı kaydedilmediği için ekranda korunuyor.");
      }
    } catch (error) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setSession("");
      setData(null);
      setMessage(`Admin oturumu geçersiz: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [session]);

  React.useEffect(() => {
    if (session) loadAdmin(session);
  }, [session, loadAdmin]);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const result = await adminLogin(username, password);
      const nextSession = result.session.token;
      if (!nextSession) throw new Error("Oturum bilgisi alınamadı");
      sessionStorage.setItem(ADMIN_SESSION_KEY, nextSession);
      setPassword("");
      setSession(nextSession);
      setMessage("Admin oturumu açıldı.");
      await loadAdmin(nextSession);
    } catch (error) {
      setMessage(`Giriş başarısız: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (session) await adminLogout(session);
    } catch {
      // Local session is cleared even if the proxy is unavailable.
    }
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setSession("");
    setData(null);
    setMessage("Admin oturumu kapatıldı.");
  };

  const saveSettings = async () => {
    if (!settingsDraft) return;
    setLoading(true);
    try {
      const next = await saveAdminSettings(session, settingsDraft);
      setSettingsDraft(next);
      setData((current) => ({ ...current, settings: next }));
      setMessage("Ayarlar kaydedildi.");
    } catch (error) {
      setMessage(`Ayarlar kaydedilemedi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveLlm = async () => {
    if (!llmDraft) return;
    setLoading(true);
    try {
      const next = await saveAdminLlm(session, llmDraft);
      setLlmDraft(next);
      setData((current) => ({ ...current, llm: next }));
      setMessage("LLM ayarları kaydedildi.");
    } catch (error) {
      setMessage(`LLM ayarları kaydedilemedi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const saveProviders = async () => {
    setLoading(true);
    try {
      const next = await saveAdminProviders(session, buildProviderSavePayload(providersDraft));
      setProvidersDirty(false);
      setProvidersDraft(normalizeProviderDraft(next, { lockExistingIds: true }));
      setData((current) => ({ ...current, providers: next }));
      setMessage("Veri sağlayıcıları kaydedildi.");
    } catch (error) {
      setMessage(`Veri sağlayıcıları kaydedilemedi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const patchProvider = (index, patch) => {
    setProvidersDirty(true);
    setProvidersDraft((current) => {
      const base = normalizeProviderDraft(current);
      return {
        ...base,
        providers: base.providers.map((provider, providerIndex) => (
          providerIndex === index ? { ...provider, ...patch } : provider
        ))
      };
    });
  };

  const addProvider = () => {
    setProvidersDirty(true);
    setProvidersDraft((current) => {
      const base = normalizeProviderDraft(current);
      const nextIndex = base.providers.length + 1;
      return {
        ...base,
        providers: [
          ...base.providers,
          {
            id: `provider-${nextIndex}`,
            label: `Yeni Sağlayıcı ${nextIndex}`,
            enabled: false,
            priority: nextIndex,
            baseUrl: "",
            testUrl: "",
            timeoutMs: 5000,
            notes: "",
            _lockedId: false
          }
        ]
      };
    });
  };

  const removeProvider = (index) => {
    setProvidersDirty(true);
    setProvidersDraft((current) => {
      const base = normalizeProviderDraft(current);
      return {
        ...base,
        providers: base.providers.filter((_, providerIndex) => providerIndex !== index)
      };
    });
  };

  const testProvider = async (providerId) => {
    setLoading(true);
    setProviderTestResults((current) => ({
      ...current,
      [providerId]: { state: "pending", message: "Test çalışıyor...", testedAt: Date.now() }
    }));
    try {
      const payload = await testAdminProvider(session, providerId, buildProviderSavePayload(providersDraft).providers);
      const result = (payload.results || []).find((item) => item.id === providerId) || payload.results?.[0];
      setProviderTestResults((current) => ({
        ...current,
        [providerId]: normalizeAdminTestResult(result, payload.testedAt)
      }));
      setMessage(`${providerId} sağlayıcı testi tamamlandı.`);
    } catch (error) {
      setProviderTestResults((current) => ({
        ...current,
        [providerId]: normalizeAdminTestResult({ ok: false, message: error.message }, Date.now())
      }));
      setMessage(`${providerId} sağlayıcı testi başarısız: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testLlm = async () => {
    setLoading(true);
    setLlmTestResult({ state: "pending", message: "LLM testi çalışıyor...", testedAt: Date.now() });
    try {
      const result = await testAdminLlm(session, llmDraft || {});
      setLlmTestResult(normalizeAdminTestResult(result, result.testedAt));
      setMessage("LLM testi tamamlandı.");
    } catch (error) {
      setLlmTestResult(normalizeAdminTestResult({ ok: false, message: error.message }, Date.now()));
      setMessage(`LLM testi başarısız: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runJob = async (jobId) => {
    setLoading(true);
    setOperationResult({ kind: "job", status: "pending", title: jobId, message: "Görev çalıştırılıyor...", startedAt: Date.now() });
    try {
      const result = await runAdminJob(session, jobId);
      setOperationResult(normalizeAdminOperationResult("job", result, jobId));
      setMessage(`${jobId} çalıştırıldı.`);
      await loadAdmin(session);
    } catch (error) {
      setOperationResult(normalizeAdminOperationResult("job", { status: "failed", message: error.message }, jobId));
      setMessage(`Görev çalıştırılamadı: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearCache = async (scope) => {
    setLoading(true);
    setOperationResult({ kind: "cache", status: "pending", title: `${scope} önbellek`, message: "Önbellek temizleniyor...", startedAt: Date.now() });
    try {
      const result = await clearAdminCache(session, scope);
      setOperationResult(normalizeAdminOperationResult("cache", result, scope));
      setMessage(`${scope} önbelleği temizlendi.`);
      await loadAdmin(session);
    } catch (error) {
      setOperationResult(normalizeAdminOperationResult("cache", { status: "failed", message: error.message }, scope));
      setMessage(`Önbellek temizlenemedi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearResearchSnapshots = async () => {
    setLoading(true);
    setOperationResult({ kind: "research", status: "pending", title: "Araştırma kaydı", message: "Araştırma kayıtları temizleniyor...", startedAt: Date.now() });
    try {
      const result = await clearAdminResearchSnapshots(session);
      setOperationResult(normalizeAdminOperationResult("research", result, "Araştırma kaydı"));
      setMessage(`${result.deleted || 0} araştırma kaydı temizlendi.`);
      await loadAdmin(session);
    } catch (error) {
      setOperationResult(normalizeAdminOperationResult("research", { status: "failed", message: error.message }, "Araştırma kaydı"));
      setMessage(`Araştırma kaydı temizlenemedi: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <section className="pro-page" id="admin">
        <div className="section-header">
          <div>
            <p className="eyebrow">Operasyon paneli</p>
            <h2>Matrix Yönetim</h2>
            <p className="section-note">Veri sağlayıcı, LLM, görev, önbellek, denetim ve araştırma kaydı yönetimi.</p>
          </div>
        </div>
        <Card className="admin-login-card">
          <CardTitle title="Yönetici Girişi" subtitle="Varsayılan yerel yönetici bilgisi ile giriş yapılır" />
          <form className="admin-login-form" onSubmit={login}>
            <label>Kullanıcı<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Şifre<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            <Button type="submit" disabled={loading}>{loading ? "Kontrol ediliyor" : "Giriş Yap"}</Button>
          </form>
          {message ? <p className="admin-message">{message}</p> : null}
        </Card>
      </section>
    );
  }

  const health = data.operationExport.status || {};
  const cacheEntries = Object.entries(data.cache || {});
  const providers = data.providers.providers || [];
  const providerRows = normalizeProviderDraft(providersDraft).providers;
  const jobs = data.jobs || [];
  const audit = data.audit || [];
  const auditSummary = buildAdminAuditSummary(audit);
  const auditStatuses = getAdminAuditStatuses(audit);
  const filteredAudit = filterAdminAudit(audit, auditQuery, auditStatus);
  const research = data.research || [];
  const researchProviders = getAdminResearchProviders(research);
  const filteredResearch = filterAdminResearchSnapshots(research, researchQuery, researchProvider);
  const researchSummary = buildAdminResearchSummary(research);

  return (
    <section className="pro-page" id="admin">
      <div className="section-header">
        <div>
          <p className="eyebrow">Operasyon paneli</p>
          <h2>Matrix Yönetim</h2>
          <p className="section-note">Sistem ayarları, veri sağlayıcıları, LLM, görev, önbellek, denetim ve araştırma kaydı akışları.</p>
        </div>
        <div className="button-row">
          <Button variant="secondary" onClick={() => loadAdmin(session)} disabled={loading}>Yenile</Button>
          <Button variant="secondary" onClick={logout}>Çıkış</Button>
        </div>
      </div>
      {message ? <p className="admin-status-line">{message}</p> : null}
      <AdminOperationResult result={operationResult} />

      <div className="admin-grid">
        <Card className="admin-card admin-health-card">
          <CardTitle title="Sistem Sağlığı" subtitle={data.me.storage ? `${data.me.storage.driver} depo` : "Durum yükleniyor"} />
          <div className="admin-health-grid">
            <AdminMetric label="Depolama" value={data.me.storage.driver || "-"} sub={data.me.storage.path || ""} />
            <AdminMetric label="Denetim" value={health.auditCount ?? "-"} sub="kayıt" />
            <AdminMetric label="Oturum" value={health.activeSessions ?? "-"} sub="aktif" />
            <AdminMetric label="Araştırma" value={health.researchSnapshots.count ?? "-"} sub="kayıt" />
            <AdminMetric label="Önbellek" value={cacheEntries.length} sub="kapsam" />
            <AdminMetric label="LLM" value={data.llm.enabled ? "Açık" : "Kapalı"} sub={data.llm.provider || ""} />
          </div>
          <div className="admin-health-footer">
            <span>Kullanıcı: {data.me.user.username || "admin"}</span>
            <span>Güncelleme: {new Date().toLocaleTimeString("tr-TR")}</span>
          </div>
        </Card>

        <Card className="admin-card">
          <CardTitle title="Uygulama Ayarları" subtitle="Sistem ve araştırma davranışı" />
          <div className="admin-form-grid">
            <label>Dil<input value={settingsDraft.language || ""} onChange={(event) => setSettingsDraft((current) => ({ ...current, language: event.target.value }))} /></label>
            <label>Zaman dilimi<input value={settingsDraft.timezone || ""} onChange={(event) => setSettingsDraft((current) => ({ ...current, timezone: event.target.value }))} /></label>
            <label>Eski veri eşiği sn<input type="number" value={settingsDraft.staleThresholdSec ?? ""} onChange={(event) => setSettingsDraft((current) => ({ ...current, staleThresholdSec: Number(event.target.value) }))} /></label>
            <label className="admin-check"><input type="checkbox" checked={Boolean(settingsDraft.paidProvidersEnabled)} onChange={(event) => setSettingsDraft((current) => ({ ...current, paidProvidersEnabled: event.target.checked }))} />Ücretli sağlayıcı aktif</label>
            <label className="admin-check"><input type="checkbox" checked={Boolean(settingsDraft.llmResearchEnabled)} onChange={(event) => setSettingsDraft((current) => ({ ...current, llmResearchEnabled: event.target.checked }))} />LLM araştırması aktif</label>
            <Button type="button" onClick={saveSettings} disabled={loading}>Ayarları Kaydet</Button>
          </div>
        </Card>

        <Card className="admin-card">
          <CardTitle title="LLM Ayarları" subtitle="Secret değerleri maskeli tutulur" />
          <div className="admin-form-grid">
            <label>Sağlayıcı<input value={llmDraft.provider || ""} onChange={(event) => setLlmDraft((current) => ({ ...current, provider: event.target.value }))} /></label>
            <label>Model<input value={llmDraft.model || ""} onChange={(event) => setLlmDraft((current) => ({ ...current, model: event.target.value }))} /></label>
            <label>Temel URL<input value={llmDraft.baseUrl || ""} onChange={(event) => setLlmDraft((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
            <label className="admin-check"><input type="checkbox" checked={Boolean(llmDraft.enabled)} onChange={(event) => setLlmDraft((current) => ({ ...current, enabled: event.target.checked }))} />LLM açık</label>
            <div className="admin-provider-actions">
              <Button type="button" onClick={saveLlm} disabled={loading}>LLM Kaydet</Button>
              <Button type="button" variant="secondary" onClick={testLlm} disabled={loading}>LLM Test Et</Button>
            </div>
            <AdminTestResult result={llmTestResult} empty="LLM henüz test edilmedi." />
          </div>
        </Card>

        <Card className="admin-card admin-cache-card">
          <div className="admin-card-head">
            <CardTitle title="Veri Sağlayıcıları ve Önbellek" subtitle={`${providerRows.length} sağlayıcı yapılandırıldı`} />
            <div className="button-row">
              {providersDirty ? <Badge tone="warning">Kaydedilmemiş</Badge> : null}
              <Button type="button" variant="secondary" onClick={addProvider} disabled={loading}>Sağlayıcı Ekle</Button>
              <Button type="button" onClick={saveProviders} disabled={loading}>Sağlayıcıları Kaydet</Button>
            </div>
          </div>
          <div className="admin-provider-list">
            {providerRows.length ? providerRows.map((provider, index) => (
              <div className="admin-provider-row" key={`${provider.id || "provider"}-${index}`}>
                <label className="admin-check"><input type="checkbox" checked={provider.enabled !== false} onChange={(event) => patchProvider(index, { enabled: event.target.checked })} />Aktif</label>
                <label>Kimlik<input value={provider.id || ""} onChange={(event) => patchProvider(index, { id: event.target.value })} placeholder="örn. polygon" disabled={provider._lockedId} title={provider._lockedId ? "Kayıtlı sağlayıcı kimliği secret eşleşmesini korumak için kilitlidir." : ""} /></label>
                <label>Ad<input value={provider.label || ""} onChange={(event) => patchProvider(index, { label: event.target.value })} placeholder="Sağlayıcı adı" /></label>
                <label>Öncelik<input type="number" min="1" value={provider.priority ?? index + 1} onChange={(event) => patchProvider(index, { priority: Number(event.target.value) || index + 1 })} /></label>
                <label>Temel URL<input value={provider.baseUrl || ""} onChange={(event) => patchProvider(index, { baseUrl: event.target.value })} placeholder="https://..." /></label>
                <label>Test URL<input value={provider.testUrl || ""} onChange={(event) => patchProvider(index, { testUrl: event.target.value })} placeholder="https://..." /></label>
                <label>Zaman aşımı ms<input type="number" min="1000" step="500" value={provider.timeoutMs ?? 5000} onChange={(event) => patchProvider(index, { timeoutMs: Number(event.target.value) || 5000 })} /></label>
                <label className="admin-provider-notes">Not<input value={provider.notes || ""} onChange={(event) => patchProvider(index, { notes: event.target.value })} placeholder="Kapsam, limit veya kullanım notu" /></label>
                <div className="admin-provider-actions">
                  <Button type="button" variant="secondary" onClick={() => testProvider(provider.id)} disabled={loading || !provider.id}>Test Et</Button>
                  <Button type="button" variant="secondary" onClick={() => removeProvider(index)} disabled={loading}>Sil</Button>
                </div>
                <AdminTestResult result={providerTestResults[provider.id]} empty="Sağlayıcı henüz test edilmedi." />
              </div>
            )) : <p className="admin-empty-state">Henüz veri sağlayıcı yok. Yeni sağlayıcı ekleyip kaydedebilirsin.</p>}
          </div>
          <div className="admin-cache-summary">
            {cacheEntries.map(([key, value]) => <span key={key}><strong>{key}</strong> {String(value)}</span>)}
          </div>
          <div className="button-row">
            <Button variant="secondary" onClick={() => clearCache("market")} disabled={loading}>Piyasa Önbelleğini Temizle</Button>
            <Button variant="secondary" onClick={() => clearCache("logos")} disabled={loading}>Logo Önbelleğini Temizle</Button>
            <Button variant="secondary" onClick={() => clearCache("all")} disabled={loading}>Tüm Önbellek</Button>
          </div>
        </Card>

        <Card className="admin-card">
          <CardTitle title="Görev Yönetimi" subtitle="Manuel operasyon işleri" />
          <div className="admin-job-list">
            {jobs.map((job) => (
              <div className="admin-job-row" key={job.id}>
                <div>
                  <strong>{job.name}</strong>
                  <small>{job.description || job.lastSummary || "Hazır"}</small>
                </div>
                <Button type="button" variant="secondary" onClick={() => runJob(job.id)} disabled={loading}>Çalıştır</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="admin-card admin-research-card">
          <CardTitle title="Araştırma Kayıtları" subtitle="Son üretilen araştırma kayıtları" />
          <div className="admin-research-toolbar">
            <label>
              <span>Araştırma kaydı ara</span>
              <input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="sembol, özet, sağlayıcı..." />
            </label>
            <label>
              <span>Sağlayıcı</span>
              <select value={researchProvider} onChange={(event) => setResearchProvider(event.target.value)}>
                <option value="all">Tümü</option>
                {researchProviders.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={() => { setResearchQuery(""); setResearchProvider("all"); }} disabled={!researchQuery && researchProvider === "all"}>Filtreyi Temizle</Button>
            <Button type="button" variant="secondary" onClick={clearResearchSnapshots} disabled={loading || !research.length}>Araştırma Kayıtlarını Temizle</Button>
          </div>
          <div className="admin-research-summary">
            <span>Toplam <b>{researchSummary.total}</b></span>
            <span>Görünen <b>{filteredResearch.length}</b></span>
            <span>Sağlayıcı <b>{researchSummary.providerCount}</b></span>
            <span>Yüksek etki <b>{researchSummary.highImpact}</b></span>
            <span>Son üretim <b>{researchSummary.latestLabel}</b></span>
          </div>
          <div className="admin-research-list">
            {filteredResearch.length ? filteredResearch.map((item) => (
              <div className="admin-research-row" key={item.id || `${item.symbol}-${item.generatedAt}`}>
                <div className="admin-research-head">
                  <div>
                    <strong>{item.symbol}</strong>
                    <small>{item.generatedAt ? new Date(item.generatedAt * 1000).toLocaleString("tr-TR") : "tarih yok"}</small>
                  </div>
                  <div className="admin-research-badges">
                    <Badge tone="neutral">{item.provider || "research"}</Badge>
                    <Badge tone={item.impactScore > 1 ? "warning" : "neutral"}>Etki {fmtNumber(item.impactScore, 1)}</Badge>
                  </div>
                </div>
                <p>{item.summaryTr || item.weeklySummary || "Özet hazırlanıyor."}</p>
              </div>
            )) : <p className="admin-empty-state">{research.length ? "Filtreye uygun araştırma kaydı yok." : "Henüz araştırma kaydı yok."}</p>}
          </div>
        </Card>

        <Card className="admin-card admin-audit-card">
          <CardTitle title="Denetim Kayıtları" subtitle="Son operasyon kayıtları" />
          <div className="admin-audit-toolbar">
            <label>
              <span>Denetim kaydı ara</span>
              <input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder="aksiyon, kullanıcı, durum..." />
            </label>
            <label>
              <span>Durum</span>
              <select value={auditStatus} onChange={(event) => setAuditStatus(event.target.value)}>
                <option value="all">Tümü</option>
                {auditStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <Button type="button" variant="secondary" onClick={() => { setAuditQuery(""); setAuditStatus("all"); }} disabled={!auditQuery && auditStatus === "all"}>Temizle</Button>
          </div>
          <div className="admin-audit-summary">
            <span>Toplam <b>{audit.length}</b></span>
            <span>Başarılı <b>{auditSummary.success}</b></span>
            <span>Uyarı <b>{auditSummary.warning}</b></span>
            <span>Hata <b>{auditSummary.failed}</b></span>
            <span>Görünen <b>{filteredAudit.length}</b></span>
          </div>
          <div className="admin-audit-list">
            {filteredAudit.length ? filteredAudit.map((entry) => (
              <div key={entry.id || `${entry.action}-${entry.at}`}>
                <div>
                  <strong>{entry.action || "audit"}</strong>
                  <small>{entry.at ? new Date(entry.at).toLocaleString("tr-TR") : ""} · {entry.status || "ok"} · {entry.actor || "system"}</small>
                </div>
              </div>
            )) : <p className="admin-empty-state">Filtreye uygun denetim kaydı yok.</p>}
          </div>
        </Card>
      </div>
    </section>
  );
}

function AdminMetric({ label, value, sub }) {
  return (
    <div className="admin-health-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function normalizeAdminLoadResults(results) {
  const valueAt = (index, fallback) => results[index].status === "fulfilled" ? results[index].value : fallback;
  return [
    valueAt(0, { language: "tr", timezone: "Europe/Istanbul", staleThresholdSec: 259200, paidProvidersEnabled: false, llmResearchEnabled: false }),
    valueAt(1, { providers: [] }),
    valueAt(2, { enabled: false, provider: "openai", model: "", baseUrl: "" }),
    valueAt(3, []),
    valueAt(4, {}),
    valueAt(5, []),
    valueAt(6, []),
    valueAt(7, { status: {}, audit: [], researchSnapshots: [] })
  ];
}

function normalizeProviderDraft(value, options = {}) {
  const providers = Array.isArray(value.providers)
    ? value.providers
    : Array.isArray(value)
      ? value
      : [];
  return {
    updatedAt: Number(value.updatedAt) || 0,
    providers: providers
      .filter((provider) => provider && typeof provider === "object")
      .map((provider, index) => ({
        id: String(provider.id || provider.label || `provider-${index + 1}`).trim(),
        label: String(provider.label || provider.id || `Sağlayıcı ${index + 1}`).trim(),
        enabled: provider.enabled !== false,
        priority: Number(provider.priority) || index + 1,
        baseUrl: String(provider.baseUrl || "").trim(),
        testUrl: String(provider.testUrl || "").trim(),
        timeoutMs: Math.max(1000, Number(provider.timeoutMs) || 5000),
        headers: provider.headers && typeof provider.headers === "object" && !Array.isArray(provider.headers) ? provider.headers : {},
        notes: String(provider.notes || "").trim(),
        _lockedId: provider._lockedId != null ? Boolean(provider._lockedId) : Boolean(options.lockExistingIds)
      }))
  };
}

function buildProviderSavePayload(value) {
  const draft = normalizeProviderDraft(value);
  return {
    updatedAt: draft.updatedAt,
    providers: draft.providers.map((provider) => ({
      id: provider.id,
      label: provider.label,
      enabled: provider.enabled,
      priority: provider.priority,
      baseUrl: provider.baseUrl,
      testUrl: provider.testUrl,
      timeoutMs: provider.timeoutMs,
      headers: provider.headers,
      notes: provider.notes
    }))
  };
}

function AdminTestResult({ result, empty }) {
  const state = result.state || "pending";
  return (
    <div className={`admin-provider-test-result ${state}`}>
      <Badge tone={state === "success" ? "success" : state === "danger" ? "danger" : "warning"}>
        {state === "success" ? "Başarılı" : state === "danger" ? "Hata" : "Bekliyor"}
      </Badge>
      <span>{result.message || empty}</span>
      {Number.isFinite(result.status) ? <span>HTTP {result.status}</span> : null}
      {Number.isFinite(result.latencyMs) ? <span>{result.latencyMs} ms</span> : null}
      {result.testedAt ? <span>{new Date(result.testedAt).toLocaleTimeString("tr-TR")}</span> : null}
    </div>
  );
}

function AdminOperationResult({ result }) {
  const current = result || {
    kind: "idle",
    status: "idle",
    title: "Operasyon bekleniyor",
    message: "Görev çalıştırma veya önbellek temizleme sonrası sonuç burada görünür."
  };
  const tone = current.status === "success" ? "success" : current.status === "failed" ? "danger" : "warning";
  return (
    <Card className={`admin-operation-card ${current.status || "idle"}`}>
      <CardTitle title="Son Operasyon Sonucu" subtitle="Görev ve önbellek aksiyonlarının görünür özeti" />
      <p className="admin-operation-note">{current.message}</p>
      <div className="admin-operation-grid">
        <div className="admin-operation-metric">
          <span>Tür</span>
          <strong>{adminOperationKindLabel(current.kind)}</strong>
        </div>
        <div className="admin-operation-metric">
          <span>Durum</span>
          <strong><Badge tone={tone}>{adminOperationStatusLabel(current.status)}</Badge></strong>
        </div>
        <div className="admin-operation-metric">
          <span>Hedef</span>
          <strong>{current.title || "-"}</strong>
        </div>
        <div className="admin-operation-metric">
          <span>Başlangıç</span>
          <strong>{current.startedAt ? new Date(current.startedAt).toLocaleTimeString("tr-TR") : "-"}</strong>
        </div>
        <div className="admin-operation-metric">
          <span>Bitiş</span>
          <strong>{current.finishedAt ? new Date(current.finishedAt).toLocaleTimeString("tr-TR") : "-"}</strong>
        </div>
        <div className="admin-operation-metric">
          <span>Süre</span>
          <strong>{Number.isFinite(current.durationMs) ? `${current.durationMs} ms` : "-"}</strong>
        </div>
      </div>
    </Card>
  );
}

function normalizeAdminTestResult(result, testedAt) {
  if (!result) {
    return {
      state: "danger",
      message: "Test sonucu alınamadı.",
      testedAt: normalizeAdminTime(testedAt)
    };
  }
  return {
    ...result,
    state: result.state || (result.ok ? "success" : "danger"),
    message: result.message || (result.ok ? "Bağlantı başarılı." : "Bağlantı doğrulanamadı."),
    testedAt: normalizeAdminTime(testedAt || result.testedAt),
    latencyMs: Number.isFinite(Number(result.latencyMs)) ? Number(result.latencyMs) : undefined,
    status: Number.isFinite(Number(result.status)) ? Number(result.status) : undefined
  };
}

function normalizeAdminTime(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return Date.now();
  return numeric < 10000000000 ? numeric * 1000 : numeric;
}

function normalizeAdminOperationResult(kind, result, fallbackTitle) {
  const startedAt = normalizeOptionalAdminTime(result.startedAt || result.clearedAt);
  const finishedAt = normalizeOptionalAdminTime(result.finishedAt || result.clearedAt || Date.now());
  const status = result.status === "failed" || result.status === "error" ? "failed" : "success";
  return {
    kind,
    status,
    title: kind === "cache" ? `${result.scope || fallbackTitle || "all"} önbellek` : result.jobId || fallbackTitle || "görev",
    message: result.message || result.lastSummary || (status === "success" ? "Operasyon başarıyla tamamlandı." : "Operasyon tamamlanamadı."),
    startedAt,
    finishedAt,
    durationMs: Number.isFinite(startedAt) && Number.isFinite(finishedAt) ? Math.max(0, finishedAt - startedAt) : undefined
  };
}

function normalizeOptionalAdminTime(value) {
  if (value === null || value === undefined || value === "") return undefined;
  return normalizeAdminTime(value);
}

function adminOperationStatusLabel(status) {
  if (status === "success") return "Başarılı";
  if (status === "failed") return "Hata";
  if (status === "pending") return "Çalışıyor";
  return "Bekliyor";
}

function adminOperationKindLabel(kind) {
  if (kind === "cache") return "Önbellek";
  if (kind === "job") return "Görev";
  if (kind === "research") return "Araştırma";
  return "Bekliyor";
}

function filterAdminAudit(audit, query, status) {
  const q = normalizeCommandText(query);
  return (audit || []).filter((entry) => {
    const entryStatus = String(entry.status || "ok").toLowerCase();
    if (status !== "all" && entryStatus !== status) return false;
    if (!q) return true;
    return normalizeCommandText([
      entry.action,
      entry.actor,
      entry.status,
      JSON.stringify(entry.detail || {})
    ].join(" ")).includes(q);
  });
}

function filterAdminResearchSnapshots(items, query, provider) {
  const q = normalizeCommandText(query);
  return (items || []).filter((item) => {
    const itemProvider = String(item.provider || item.source.type || "research").toLowerCase();
    if (provider !== "all" && itemProvider !== provider) return false;
    if (!q) return true;
    return normalizeCommandText([
      item.symbol,
      item.provider,
      item.llmProvider,
      item.summaryTr,
      item.weeklySummary,
      item.technicalSummary,
      item.riskSummary
    ].join(" ")).includes(q);
  });
}

function getAdminResearchProviders(items) {
  return [...new Set((items || []).map((item) => String(item.provider || item.source.type || "research").toLowerCase()).filter(Boolean))].sort();
}

function buildAdminResearchSummary(items) {
  const rows = Array.isArray(items) ? items : [];
  const providers = getAdminResearchProviders(rows);
  const latest = rows.reduce((max, item) => Math.max(max, Number(item.generatedAt || 0)), 0);
  return {
    total: rows.length,
    providerCount: providers.length,
    highImpact: rows.filter((item) => Math.abs(Number(item.impactScore || 0)) >= 1).length,
    latestLabel: latest ? ageLabel(Math.max(0, Math.floor(Date.now() / 1000) - latest)) : "-"
  };
}

function getAdminAuditStatuses(audit) {
  return [...new Set((audit || []).map((entry) => String(entry.status || "ok").toLowerCase()).filter(Boolean))].sort();
}

function buildAdminAuditSummary(audit) {
  return (audit || []).reduce((summary, entry) => {
    const status = String(entry.status || "ok").toLowerCase();
    if (status === "success" || status === "ok") summary.success += 1;
    else if (status === "warning") summary.warning += 1;
    else if (status === "failed" || status === "error") summary.failed += 1;
    else summary.warning += 1;
    return summary;
  }, { success: 0, warning: 0, failed: 0 });
}

function CatalogManager({ onChange }) {
  const [category, setCategory] = React.useState("");
  const [editingCategory, setEditingCategory] = React.useState("");
  const [editingValue, setEditingValue] = React.useState("");
  const [stockCategory, setStockCategory] = React.useState(state.filters.category !== "all" ? state.filters.category : "");
  const [query, setQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [fibTarget, setFibTargetInput] = React.useState("");
  const [nasdaqOpen, setNasdaqOpen] = React.useState(false);
  const nasdaqRef = React.useRef(null);
  const options = filterNasdaq(query).slice(0, 16);
  const selected = state.nasdaqUniverse.find((item) => item.symbol === selectedSymbol);
  const categories = getCategories();
  const customCategories = state.customCategories || [];

  React.useEffect(() => {
    if (!nasdaqOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!nasdaqRef.current.contains(event.target)) setNasdaqOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [nasdaqOpen]);

  React.useEffect(() => {
    if (!nasdaqOpen) return;
    const onEscape = (event) => {
      if (event.key === "Escape") setNasdaqOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [nasdaqOpen]);

  return (
    <Card className="catalog-card" id="catalog">
      <CardTitle title="Kategori ve Hisse Ekle" subtitle={state.nasdaqUniverseStatus.message || "Nasdaq listesinden şirket seç"} />
      <div className="catalog-stack">
        <form onSubmit={async (event) => {
          event.preventDefault();
          const picked = selected || filterNasdaq(query)[0];
          const finalSymbol = picked.symbol || query;
          const finalFibTarget = fibTarget || await resolveAutoFibTarget(finalSymbol, picked);
          const finalCategory = stockCategory || picked.category || "Diğer Nasdaq Hisseleri";
          const result = addCustomStock({
            symbol: finalSymbol,
            company: picked.company || query,
            category: finalCategory,
            categoryDescription: picked.categoryDescription || finalCategory,
            fibTarget: finalFibTarget,
            logo: picked.logo || picked.domain
          });
          setCatalogStatus(result.ok ? "success" : "error", result.ok ? `${result.stock.symbol} özel kataloga eklendi.` : result.message);
          if (result.ok) {
            setQuery("");
            setSelectedSymbol("");
            setFibTargetInput("");
            if (!stockCategory) setStockCategory(finalCategory);
            await refreshAll(onChange, { manual: true });
          } else {
            onChange();
          }
        }} className="catalog-primary">
          <div className="form-row">
            <label className="field nasdaq-field">
              <span>Nasdaq şirket seç</span>
              <div ref={nasdaqRef} className={`smart-select ${nasdaqOpen ? "open" : ""}`}>
                <input
                  value={query}
                  onFocus={() => setNasdaqOpen(true)}
                  onChange={(event) => { setQuery(event.target.value); setSelectedSymbol(""); setNasdaqOpen(true); }}
                  placeholder="MSFT, SpaceX, Apple..."
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setNasdaqOpen(false);
                  }}
                />
                <button type="button" aria-label="Nasdaq listesini aç" onClick={() => setNasdaqOpen((value) => !value)}>⌄</button>
                <div className="smart-options combo-list" style={{ display: nasdaqOpen ? "grid" : "none" }}>
                  {options.length ? options.map((item) => (
                    <button type="button" key={item.symbol} onClick={() => {
                      setSelectedSymbol(item.symbol);
                      setQuery(`${item.symbol} - ${item.company}`);
                      setStockCategory(item.category || "Diğer Nasdaq Hisseleri");
                      setFibTargetInput(item.autoFibTarget ? String(item.autoFibTarget) : "");
                      setNasdaqOpen(false);
                    }}>
                      <span className="logo-badge"><img src={logoUrl(item)} alt="" onError={(event) => { event.currentTarget.src = fallbackLogo(item.symbol); }} /></span>
                      <span>{item.symbol}</span>
                      <small><b>{item.category || "Diğer Nasdaq Hisseleri"}</b>{item.company}</small>
                    </button>
                  )) : (
                    <p className="metronic-empty">Sonuç yok</p>
                  )}
                </div>
              </div>
            </label>
            <SelectField label="Kategori" value={stockCategory} onChange={setStockCategory}>
              <option value="">Özel Liste</option>
              {categories.map((item) => <option key={item} value={item}>{item}</option>)}
            </SelectField>
            <label className="field compact-field"><span>Fib hedef</span><input value={fibTarget} onChange={(event) => setFibTargetInput(event.target.value)} placeholder="Boşsa otomatik" /></label>
          </div>
          <p className="auto-fib-note">Fib hedef boşsa 1 yıllık günlük grafikteki son anlamlı dip-tepe aralığına göre en yakın Fibonacci direnç/extension seviyesi hesaplanır.</p>
          <div className="form-actions">
            <Button type="submit">Hisse Ekle</Button>
            <Button type="button" variant="secondary" onClick={() => loadNasdaqUniverse(onChange, true)}>Nasdaq Senkron</Button>
          </div>
        </form>
        <div className="category-manager">
          <form onSubmit={(event) => {
            event.preventDefault();
            const result = addCustomCategory(category);
            setCatalogStatus(result.ok ? "success" : "error", result.ok ? `${category} eklendi.` : result.message);
            setCategory("");
            onChange();
          }}>
            <div className="form-row aligned">
              <label className="field"><span>Özel kategori oluştur</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Yeni kategori" /></label>
              <Button type="submit">Kategori Ekle</Button>
            </div>
          </form>
          <div className="category-edit-list">
            {customCategories.length ? customCategories.map((item) => (
              <div className="category-edit-row" key={item}>
                {editingCategory === item ? (
                  <input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
                ) : (
                  <span>{item}</span>
                )}
                {editingCategory === item ? (
                  <>
                    <button type="button" onClick={() => {
                      const result = renameCustomCategory(item, editingValue);
                      setCatalogStatus(result.ok ? "success" : "error", result.ok ? `${item} güncellendi.` : result.message);
                      setEditingCategory("");
                      setEditingValue("");
                      onChange();
                    }}>Kaydet</button>
                    <button type="button" onClick={() => { setEditingCategory(""); setEditingValue(""); }}>Vazgeç</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setEditingCategory(item); setEditingValue(item); }}>Düzenle</button>
                    <button type="button" className="danger" onClick={() => {
                      const result = removeCustomCategory(item);
                      setCatalogStatus(result.ok ? "success" : "error", result.ok ? `${item} silindi.` : result.message);
                      onChange();
                    }}>Sil</button>
                  </>
                )}
              </div>
            )) : <p className="empty">Henüz özel kategori yok.</p>}
          </div>
        </div>
      </div>
      {state.catalogStatus.message ? <p className={`catalog-status ${state.catalogStatus.kind}`}>{state.catalogStatus.message}</p> : null}
    </Card>
  );
}

function filterNasdaq(query) {
  const q = String(query || "").toLowerCase().replace(/^[a-z0-9.-]+\s+-\s+/i, "");
  if (!q) return state.nasdaqUniverse;
  return state.nasdaqUniverse.filter((item) => [
    item.symbol,
    item.company,
    item.exchange,
    item.category,
    ...(item.aliases || [])
  ].some((value) => String(value || "").toLowerCase().includes(q)));
}

async function resolveAutoFibTarget(symbol, picked) {
  if (Number.isFinite(Number(picked.autoFibTarget)) && Number(picked.autoFibTarget) > 0) return Number(picked.autoFibTarget);
  const key = String(symbol || "").trim().toUpperCase();
  if (!key) return "";
  try {
    const [snapshotResult, historyResult] = await Promise.allSettled([
      getSnapshots([key]),
      getHistory(key, "1y", "1d")
    ]);
    const [snapshot] = snapshotResult.status === "fulfilled" ? snapshotResult.value : [];
    const price = Number(snapshot?.price);
    const history = historyResult.status === "fulfilled" ? historyResult.value : [];
    const fibPlan = computeDynamicFibPlan(history, price);
    if (Number.isFinite(fibPlan.target) && fibPlan.target > 0) return fibPlan.target;
  } catch {
    // Manual input remains available when live price cannot be reached.
  }
  return "";
}

function calculateFibonacciTarget(points, currentPrice) {
  const closes = (points || [])
    .map((point) => Number(point.close ?? point.price))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(-252);
  const current = Number.isFinite(Number(currentPrice)) && Number(currentPrice) > 0
    ? Number(currentPrice)
    : closes.at(-1);
  if (!Number.isFinite(current) || current <= 0) return "";
  if (closes.length < 20) return roundFibPrice(current * 1.272);

  const swing = findRecentFibSwing(closes);
  if (!swing) return roundFibPrice(current * 1.272);

  const { low, high } = swing;
  const range = high - low;
  if (!Number.isFinite(range) || range <= 0) return roundFibPrice(current * 1.272);

  const levels = [0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2]
    .map((ratio) => low + range * ratio)
    .sort((a, b) => a - b);
  const minTarget = current * 1.005;
  const target = levels.find((level) => level > minTarget) || (high + range * 0.618);
  return roundFibPrice(target);
}

function findRecentFibSwing(values) {
  const depth = Math.max(3, Math.min(8, Math.floor(values.length / 40)));
  const pivots = [];
  for (let index = depth; index < values.length - depth; index += 1) {
    const window = values.slice(index - depth, index + depth + 1);
    const value = values[index];
    if (value === Math.min(...window)) pivots.push({ type: "low", value, index });
    if (value === Math.max(...window)) pivots.push({ type: "high", value, index });
  }

  for (let index = pivots.length - 1; index >= 0; index -= 1) {
    const highPivot = pivots[index];
    if (highPivot.type !== "high") continue;
    const lowPivot = [...pivots.slice(0, index)].reverse()
      .find((pivot) => pivot.type === "low" && highPivot.value > pivot.value * 1.03);
    if (lowPivot) return { low: lowPivot.value, high: highPivot.value };
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  return high > low ? { low, high } : null;
}

function roundFibPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number < 10) return Number(number.toFixed(2));
  if (number < 100) return Number(number.toFixed(1));
  return Number(Math.round(number));
}

function logoUrl(row) {
  return `${PROXY_ROOT}/api/logo/${encodeURIComponent(row.symbol)}`;
}

function fallbackLogo(symbol) {
  const text = String(symbol || "").slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="24" fill="#ffffff"/><rect x="8" y="8" width="112" height="112" rx="20" fill="#eef6ff"/><text x="64" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="#1e3a8a">${text}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function statusTone(status) {
  if (status === "live") return "success";
  if (status === "stale") return "warning";
  if (status === "error") return "danger";
  return "neutral";
}

function statusLabel(status) {
  if (status === "live") return "Canlı";
  if (status === "stale") return "Eski";
  if (status === "error") return "Hata";
  return "Yükleniyor";
}

function riskTone(value) {
  if (value === "high") return "danger";
  if (value === "medium") return "warning";
  return "success";
}

function riskLabel(value) {
  if (value === "high") return "Yüksek";
  if (value === "medium") return "Orta";
  return "Düşük";
}

function newsTone(sentiment) {
  if (sentiment === "positive") return "success";
  if (sentiment === "negative") return "danger";
  return "neutral";
}

function newsLabel(sentiment) {
  if (sentiment === "positive") return "Pozitif";
  if (sentiment === "negative") return "Negatif";
  return "Nötr";
}

function newsToneClass(sentiment) {
  if (sentiment === "positive") return "positive";
  if (sentiment === "negative") return "negative";
  return "neutral";
}

function signalToneClass(signal) {
  if (signal === "strong_buy" || signal === "buy") return "positive";
  if (signal === "watch") return "warning";
  if (signal === "risky" || signal === "strong_sell" || signal === "sell") return "negative";
  return "neutral";
}

function targetToneClass(status) {
  if (status === "near") return "warning";
  if (status === "above") return "positive";
  if (status === "below") return "neutral";
  return "neutral";
}
