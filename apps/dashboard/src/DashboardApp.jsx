import React from "react";
import "./dashboard.css";
import { Badge } from "@ui/Badge.jsx";
import { Button } from "@ui/Button.jsx";
import { Card, CardTitle } from "@ui/Card.jsx";
import { ageLabel, fmtNumber, fmtPct, fmtUsd, signalLabel, targetLabel } from "@shared/formatters.js";
import { alertTypeLabel } from "@shared/signalEngine.js";
import {
  getAnalysis,
  getHealth,
  getHistory,
  getNasdaqUniverse,
  getNews,
  getPerformance,
  getSnapshots,
  getStatus,
  PROXY_ROOT
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

  return (
    <div className="mfe-app">
      <Sidebar route={route} />
      <main className="mfe-main">
        <Topbar onRefresh={() => refreshAll(rerender, { manual: true })} />
        {route === "signals" ? (
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
    </div>
  );
}

function getRoute() {
  const hash = String(window.location.hash || "#dashboard").replace("#", "");
  return hash === "signals" ? "signals" : "dashboard";
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
    const count = universe.count || universe.rows?.length || 0;
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
      new Notification(`FVT ${alert.symbol}`, { body: alert.message, tag: alert.id });
    }
  }
}

function Sidebar({ route }) {
  return (
    <aside className="mfe-sidebar">
      <div className="brand-mark">FVT</div>
      <nav>
        <a href="#dashboard" className={route === "dashboard" ? "active" : ""}>Dashboard</a>
        <a href="#signals" className={route === "signals" ? "active" : ""}>Sinyaller</a>
        <a href="#catalog">Katalog</a>
        <a href="#news">Haberler</a>
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
        <h1>Hisse Takip Dashboard</h1>
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
          <strong>{items?.slice(0, 3).map((row) => row.symbol).join(" · ") || "-"}</strong>
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
  const signalCounts = {
    buy: rows.filter((row) => ["strong_buy", "buy"].includes(row.technicalSignal)).length,
    watch: rows.filter((row) => row.technicalSignal === "watch").length,
    risky: rows.filter((row) => ["risky", "sell", "strong_sell"].includes(row.technicalSignal)).length,
    alerts: activeAlerts.length
  };

  return (
    <Card className="signals-center" id="signals">
      <div className="signals-hero">
        <div>
          <p className="eyebrow">Sinyal merkezi</p>
          <h2>Teknik analiz, haber etkisi ve alarm motoru</h2>
          <small>Bu alan analiz ve izleme amaçlıdır; yatırım tavsiyesi değildir.</small>
        </div>
        <div className="signals-score-grid">
          <Metric label="Al/Güçlü Al" value={signalCounts.buy} />
          <Metric label="İzle" value={signalCounts.watch} />
          <Metric label="Riskli/Sat" value={signalCounts.risky} />
          <Metric label="Aktif alarm" value={signalCounts.alerts} tone={signalCounts.alerts ? "down" : ""} />
        </div>
      </div>
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

function SignalTable({ rows, onChange }) {
  return (
    <div className="signal-table-wrap">
      <table className="signal-table">
        <thead>
          <tr>
            <th>Hisse</th>
            <th>Fiyat</th>
            <th>Sinyal</th>
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
  const rootRef = React.useRef(null);
  const options = React.Children.toArray(children)
    .filter((child) => React.isValidElement(child))
    .map((child) => ({
      value: String(child.props.value ?? child.props.children ?? ""),
      label: String(child.props.children ?? child.props.value ?? "")
    }));
  const selected = options.find((option) => option.value === String(value)) || options[0];
  const filtered = options.filter((option) =>
    option.label.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
    || option.value.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr"))
  );
  React.useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);
  return (
    <label className="field">
      <span>{label}</span>
      <div ref={rootRef} className={`metronic-select ${open ? "open" : ""}`}>
        <button type="button" onClick={() => { setOpen((current) => !current); setSearch(""); }}>
          <span>{selected?.label || "Seç"}</span>
          <i>⌄</i>
        </button>
        {open ? (
          <div className="metronic-options">
            <div className="metronic-search">
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`${label} ara...`}
              />
            </div>
            {filtered.length ? filtered.map((option) => (
              <button key={option.value} type="button" className={option.value === String(value) ? "active" : ""} onClick={() => { onChange(option.value); setOpen(false); }}>
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
      <ReturnHeatmap returns={row.returns} title="1-12 aylık getiri ısı haritası" />
      <SignalStrip row={row} />
      <div className="detail-metrics">
        <Metric label="Fib hedef" value={fmtUsd(row.fibTarget)} />
        <Metric label="Fib uzaklığı" value={fmtPct(row.fibDistancePct)} />
        <Metric label="Hedef durumu" value={targetLabel(row.targetStatus)} />
        <Metric label="Genel skor" value={`+${row.score}`} />
        <Metric label="Teknik sinyal" value={signalLabel(row.technicalSignal)} />
        <Metric label="Risk" value={riskLabel(row.riskLevel)} />
      </div>
      <div className="returns-grid">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
          const value = row.returns?.find((item) => item.month === month)?.value;
          return <Metric key={month} label={`${month}A`} value={fmtPct(value)} tone={Number(value) >= 0 ? "up" : "down"} />;
        })}
      </div>
    </Card>
  );
}

function SparkChart({ points, target, signal }) {
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const values = (points || []).map((point) => Number(point.close ?? point.price)).filter(Number.isFinite);
  if (values.length < 2) return <div className="chart-empty">Grafik verisi yükleniyor</div>;
  const width = 640;
  const height = 220;
  const min = Math.min(...values, Number(target) || Infinity);
  const max = Math.max(...values, Number(target) || -Infinity);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return { value, x, y };
  });
  const path = coords.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const area = `${path} L${width} ${height} L0 ${height} Z`;
  const targetY = Number.isFinite(Number(target)) ? height - ((Number(target) - min) / span) * height : null;
  const hover = Number.isInteger(hoverIndex) ? coords[hoverIndex] : null;
  const signalPoint = coords.at(-1);
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
      <path d={path} fill="none" stroke="#00d4ff" strokeWidth="3" strokeLinecap="round" />
      {signalPoint ? (
        <g className={`signal-chart-marker ${signalToneClass(signal?.signal)}`}>
          <circle cx={signalPoint.x} cy={signalPoint.y} r="7" />
          <rect x={Math.max(6, signalPoint.x - 96)} y={Math.max(6, signalPoint.y - 42)} width="92" height="24" rx="6" />
          <text x={Math.max(14, signalPoint.x - 88)} y={Math.max(22, signalPoint.y - 26)}>{signalLabel(signal?.signal)}</text>
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
          <rect x={Math.min(width - 118, Math.max(6, hover.x + 10))} y={Math.max(6, hover.y - 34)} width="108" height="24" rx="6" />
          <text x={Math.min(width - 110, Math.max(14, hover.x + 18))} y={Math.max(22, hover.y - 18)}>{fmtUsd(hover.value)}</text>
        </g>
      ) : null}
    </svg>
  );
}

function ReturnHeatmap({ returns = [], compact = false, title = "1-12 aylık getiri" }) {
  const values = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const item = returns.find((entry) => Number(entry.month) === month);
    const value = Number(item?.value);
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
  const items = Array.isArray(payload?.items) ? payload.items.slice(0, 6) : [];
  return (
    <Card>
      <CardTitle title="Haber Etkisi" subtitle={`${row.newsCount || items.length || 0} haber`} />
      <div className="news-list">
        {items.length ? items.map((item, index) => (
          <a key={`${item.url || item.title}-${index}`} className="news-item" href={item.url} target="_blank" rel="noreferrer">
            <Badge tone={newsTone(item.sentiment)}>{item.sentiment || "neutral"}</Badge>
            <strong>{item.title}</strong>
            <p>{item.turkishSummary || item.summary || "Türkçe özet hazırlanıyor."}</p>
            <small>{item.source || payload?.source || "haber kaynağı"}</small>
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
        <Metric label="RSI 14" value={fmtNumber(signal.indicators?.rsi14 ?? row.technicals?.rsi14, 1)} />
        <Metric label="MACD" value={fmtNumber(signal.indicators?.macdHistogram, 2)} />
        <Metric label="MA20 / MA50" value={`${fmtUsd(signal.indicators?.sma20 ?? row.technicals?.ma20)} / ${fmtUsd(signal.indicators?.sma50 ?? row.technicals?.ma50)}`} />
      </div>
      <div className="signal-explain">
        {(signal.reasons || []).map((reason) => <span key={reason}>{reason}</span>)}
      </div>
    </Card>
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

function CatalogManager({ onChange }) {
  const [category, setCategory] = React.useState("");
  const [editingCategory, setEditingCategory] = React.useState("");
  const [editingValue, setEditingValue] = React.useState("");
  const [stockCategory, setStockCategory] = React.useState(state.filters.category !== "all" ? state.filters.category : "");
  const [query, setQuery] = React.useState("");
  const [selectedSymbol, setSelectedSymbol] = React.useState("");
  const [fibTarget, setFibTargetInput] = React.useState("");
  const [nasdaqOpen, setNasdaqOpen] = React.useState(false);
  const options = filterNasdaq(query).slice(0, 16);
  const selected = state.nasdaqUniverse.find((item) => item.symbol === selectedSymbol);
  const categories = getCategories();
  const customCategories = state.customCategories || [];

  return (
    <Card className="catalog-card" id="catalog">
      <CardTitle title="Kategori ve Hisse Ekle" subtitle={state.nasdaqUniverseStatus.message || "Nasdaq listesinden şirket seç"} />
      <div className="catalog-stack">
        <form onSubmit={async (event) => {
          event.preventDefault();
          const picked = selected || filterNasdaq(query)[0];
          const finalSymbol = picked?.symbol || query;
          const finalFibTarget = fibTarget || await resolveAutoFibTarget(finalSymbol, picked);
          const finalCategory = stockCategory || picked?.category || "Diğer Nasdaq Hisseleri";
          const result = addCustomStock({
            symbol: finalSymbol,
            company: picked?.company || query,
            category: finalCategory,
            categoryDescription: picked?.categoryDescription || finalCategory,
            fibTarget: finalFibTarget,
            logo: picked?.logo || picked?.domain
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
              <div className={`smart-select ${nasdaqOpen ? "open" : ""}`}>
                <input
                  value={query}
                  onFocus={() => setNasdaqOpen(true)}
                  onChange={(event) => { setQuery(event.target.value); setSelectedSymbol(""); setNasdaqOpen(true); }}
                  placeholder="MSFT, SpaceX, Apple..."
                />
                <button type="button" aria-label="Nasdaq listesini aç" onClick={() => setNasdaqOpen((value) => !value)}>⌄</button>
                {nasdaqOpen ? (
                  <div className="smart-options combo-list">
                    {options.map((item) => (
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
                    ))}
                  </div>
                ) : null}
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
  if (Number.isFinite(Number(picked?.autoFibTarget)) && Number(picked.autoFibTarget) > 0) return Number(picked.autoFibTarget);
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
    const fibTarget = calculateFibonacciTarget(history, price);
    if (Number.isFinite(fibTarget) && fibTarget > 0) return fibTarget;
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
  const text = String(symbol || "?").slice(0, 2).toUpperCase();
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

