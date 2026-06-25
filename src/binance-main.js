import "./binance-styles.css";
import { getHealth, getHistory as fetchHistory, getPerformance, getSnapshots, getStatus } from "./api.js";
import {
  getSymbols,
  mergeSnapshot,
  persistSettings,
  persistSnapshots,
  setFilters,
  setHistory,
  setPerformance,
  state
} from "./state.js";
import { renderBinanceDashboard } from "./binance-render.js";

const actions = {
  refreshAll,
  setSearch(value) {
    setFilters({ search: value });
    render();
  },
  setCategory(value) {
    setFilters({ category: value });
    render();
  },
  setSort(sortBy, sortDir = "desc") {
    setFilters({ sortBy, sortDir });
    render();
  },
  selectSymbol(symbol) {
    state.selectedSymbol = symbol;
    persistSettings();
    loadSelectedHistory().finally(render);
    render();
  }
};

let refreshInFlight = false;

function render() {
  renderBinanceDashboard(actions);
}

async function refreshAll() {
  if (refreshInFlight) return;
  refreshInFlight = true;
  state.loading = true;
  state.error = null;
  render();

  try {
    const [health, status] = await Promise.allSettled([getHealth(), getStatus()]);
    state.proxyStatus = {
      health: health.status === "fulfilled" ? health.value.data : null,
      status: status.status === "fulfilled" ? status.value.data : null
    };

    await loadSnapshots();
    await loadMarketContext();
    state.lastRefreshAt = Date.now();
    state.loading = false;
  } catch (error) {
    state.loading = false;
    state.error = error.message || String(error);
  } finally {
    refreshInFlight = false;
    render();
  }
}

async function loadSnapshots() {
  const symbols = getSymbols();
  for (let i = 0; i < symbols.length; i += 16) {
    const chunk = symbols.slice(i, i + 16);
    const snapshots = await getSnapshots(chunk);
    snapshots.forEach(mergeSnapshot);
  }
  persistSnapshots();
}

async function loadMarketContext() {
  const symbols = getSymbols();
  const selected = state.selectedSymbol || symbols[0];
  const priority = Array.from(new Set([selected, ...symbols.slice(0, 20)]));
  await Promise.allSettled(priority.flatMap((symbol) => [
    fetchHistory(symbol, "1d", "5m").then((points) => setHistory(symbol, "1d", "5m", points)),
    getPerformance(symbol).then((performance) => setPerformance(symbol, performance))
  ]));
}

async function loadSelectedHistory() {
  const symbol = state.selectedSymbol || getSymbols()[0];
  const points = await fetchHistory(symbol, "1d", "5m");
  setHistory(symbol, "1d", "5m", points);
}

render();
refreshAll();
setInterval(refreshAll, 60000);
