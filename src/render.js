import { PROXY_ROOT } from "./api.js";
import {
  addCustomStock,
  addCustomCategory,
  findNasdaqCompany,
  getCategories,
  getHistory,
  getKpis,
  getReturnFor,
  getVisibleRows,
  persistSettings,
  removeCustomStock,
  resetFibTarget,
  setFilters,
  setFibTarget,
  setInvestmentPlan,
  setCatalogStatus,
  setNasdaqUniverseStatus,
  setUi,
  state,
  toggleFavorite
} from "./state.js";

const app = document.getElementById("app");

const HISTORY_RANGES = [
  { label: "1G", range: "1d", interval: "5m" },
  { label: "1H", range: "5d", interval: "30m" },
  { label: "1A", range: "1mo", interval: "1d" },
  { label: "3A", range: "3mo", interval: "1d" },
  { label: "6A", range: "6mo", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1d" }
];

const QUICK_SORTS = [
  { label: "Fib'e En Yakın", sortBy: "fibDistancePct", sortDir: "asc" },
  { label: "1A En Güçlü", sortBy: "return1", sortDir: "desc" },
  { label: "12A En Güçlü", sortBy: "return12", sortDir: "desc" },
  { label: "Hedefe Göre", sortBy: "targetClosest", sortDir: "asc" },
  { label: "Teknik Risk", sortBy: "highRisk", sortDir: "desc" },
  { label: "Haber Etkisi", sortBy: "momentumNews", sortDir: "desc" },
  { label: "Düşüşte Olanlar", sortBy: "falling", sortDir: "asc" }
];

const DETAIL_TABS = [
  { id: "grafik", label: "Grafik" },
  { id: "haberler", label: "Haberler" },
  { id: "analiz", label: "Analiz" },
  { id: "notlar", label: "Notlar" }
];

const POSITION_TAGS = [
  { value: "İzle", label: "İzle" },
  { value: "Kademeli", label: "Kademeli" },
  { value: "Swing", label: "Swing" },
  { value: "Uzun vade", label: "Uzun vade" }
];

const fmtUsd = (value) => Number.isFinite(Number(value))
  ? "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : "-";

const fmtPct = (value) => Number.isFinite(Number(value))
  ? (Number(value) > 0 ? "+" : "") + Number(value).toFixed(1) + "%"
  : "-";

const fmtAbsPct = (value) => Number.isFinite(Number(value))
  ? "%" + Math.abs(Number(value)).toFixed(1)
  : "-";

const fmtSigned = (value) => Number.isFinite(Number(value))
  ? (Number(value) > 0 ? "+" : "") + Number(value).toFixed(0)
  : "-";

const ageLabel = (epochSec) => {
  if (!Number.isFinite(Number(epochSec))) return "zaman yok";
  const minutes = Math.max(0, Math.floor((Date.now() - Number(epochSec) * 1000) / 60000));
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} saat önce` : `${Math.floor(hours / 24)} gün önce`;
};

function priceFreshnessLabel(row) {
  const age = ageLabel(row.snapshot.updatedAt);
  if (row.snapshot.isStale) return `Veri eski: ${age}`;
  if (row.snapshot?.isLive && Number(row.snapshot?.sourceFreshnessSec) > 4 * 60 * 60) return `Son piyasa fiyatı: ${age}`;
  return age;
}

function statusText(row) {
  if (row.status === "live") return "Canlı";
  if (row.status === "stale") return "Veri Eski";
  if (row.status === "error") return "Hata";
  return "Yükleniyor";
}

function targetStatusLabel(value) {
  if (value === "above") return "Hedef üstü";
  if (value === "near") return "Hedefte";
  if (value === "below") return "Hedefe kalan";
  if (value === "custom") return "Özel hedef";
  return "Bilinmiyor";
}

function technicalSignalLabel(value) {
  if (value === "strong_buy") return "Güçlü al";
  if (value === "buy") return "Al";
  if (value === "neutral") return "Nötr";
  if (value === "sell") return "Sat";
  if (value === "strong_sell") return "Güçlü sat";
  return "Bilinmiyor";
}

function riskLevelLabel(value) {
  if (value === "high") return "Yüksek";
  if (value === "medium") return "Orta";
  if (value === "low") return "Düşük";
  return "Bilinmiyor";
}

function newsEffectLabel(row) {
  if (row.newsImpact === "high") return "Yüksek etki";
  if (row.newsImpact === "medium") return "Orta etki";
  if (row.newsImpact === "low") return "Düşük etki";
  return newsSentimentText(row.newsSentiment);
}

function marketChip(row, metric = "fib") {
  if (!row) return "";
  const value = metric === "return12"
    ? fmtPct(row.momentum12m)
    : metric === "risk"
      ? riskLevelLabel(row.riskLevel)
      : metric === "news"
        ? newsEffectLabel(row)
        : metric === "target"
          ? targetStatusLabel(row.targetStatus)
          : fmtPct(row.fibDistancePct);
  return `<button class="market-chip" data-symbol="${escapeAttr(row.symbol)}">${logoBadge(row)}<span><b>${row.symbol}</b><small>${escapeHtml(value)}</small></span></button>`;
}

function buildSummaryGroups(rows) {
  return {
    live: rows.filter((row) => row.status === "live").slice(0, 5),
    strong: [...rows].filter((row) => row.technicalSignal === "strong_buy").sort((a, b) => b.technicalSignalScore - a.technicalSignalScore).slice(0, 5),
    risky: [...rows].filter((row) => row.riskLevel === "high").sort((a, b) => b.riskScore - a.riskScore).slice(0, 5),
    highNews: [...rows].filter((row) => row.newsImpact === "high").sort((a, b) => b.newsImpactScore - a.newsImpactScore).slice(0, 5)
  };
}

function summaryList(title, rows, metric = "fib", empty = "Veri yok") {
  return `
    <div class="summary-list">
      <span>${title}</span>
      <div>${rows.length ? rows.map((row) => marketChip(row, metric)).join("") : `<span>${empty}</span>`}</div>
    </div>
  `;
}

function summaryPanel(rows, kpis) {
  const groups = buildSummaryGroups(rows);
  return `
    <section class="summary-panel">
      <div class="summary-main">
        <span>Piyasa Özeti</span>
        <strong>${kpis.total}</strong>
        <small>${kpis.positive} yükselen · ${kpis.negative} düşen · ${kpis.live} canlı</small>
      </div>
      <div class="summary-list">
        <span>Fib'e en yakın 5</span>
        <div>${kpis.closestFib.map((row) => marketChip(row)).join("")}</div>
      </div>
      <div class="summary-list">
        <span>En güçlü 12A</span>
        <div>${kpis.strongest12m.map((row) => marketChip(row, "return12")).join("")}</div>
      </div>
      ${summaryList("Canlılar", groups.live, "fib")}
      ${summaryList("Güçlüler", groups.strong, "return12")}
      ${summaryList("Riskliler", groups.risky, "risk")}
      ${summaryList("Yüksek haber", groups.highNews, "news")}
    </section>
  `;
}

function kpiCard(label, value, hint) {
  return `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${hint}</small><i aria-hidden="true"></i></article>`;
}

function shortCategory(category) {
  return String(category)
    .replace("Yapay Zekâ ", "")
    .replace(" ve Veri Saklama", "")
    .replace(" Teknolojileri", "")
    .replace(" Çözümleri", "")
    .replace("Fiziksel Yapay Zekâ ve ", "");
}

function controlsTemplate(visibleCount = 0) {
  const f = state.filters;
  const isSearching = Boolean(f.search.trim());
  const nasdaqMeta = state.nasdaqUniverseMeta || {};
  const defaultCatalogMessage = "Nasdaq sirketi sec, kategori olustur veya mevcut kategoriye ekle.";
  const nasdaqStatus = state.nasdaqUniverseStatus?.message || `${state.nasdaqUniverse.length} Nasdaq hissesi secime hazir.`;
  const activeStatus = state.catalogStatus?.message
    ? state.catalogStatus
    : { kind: state.nasdaqUniverseStatus?.kind || "idle", message: nasdaqStatus };
  return `
    <section class="control-panel">
      <label class="search-box ${isSearching ? "active" : ""}">
        <span>Arama</span>
        <div class="search-field">
          <input id="searchInput" type="search" value="${escapeHtml(f.search)}" placeholder="NVDA, Tesla, NAND..." autocomplete="off" spellcheck="false" />
          <small>${isSearching ? `${visibleCount} sonuç` : "sembol"}</small>
        </div>
      </label>
      ${selectBox("categoryFilter", "Kategori", [["all", "Tümü"], ...getCategories().map((category) => [category, shortCategory(category)])], f.category, "category-select")}
      ${selectBox("statusFilter", "Durum", [["all", "Tümü"], ["live", "Canlı"], ["stale", "Veri Eski"], ["error", "Hata"]], f.status)}
      ${selectBox("targetFilter", "Hedef durumu", [["all", "Tümü"], ["custom", "Özel hedef"], ["near", "Hedefte"], ["above", "Hedef üstü"], ["below", "Hedefe kalan"]], f.target)}
      ${selectBox("signalFilter", "Teknik / risk", [["all", "Tümü"], ["strong_buy", "Güçlü al"], ["buy", "Al"], ["neutral", "Nötr"], ["sell", "Sat"], ["strong_sell", "Güçlü sat"]], f.signal)}
      ${selectBox("newsFilter", "Haber etkisi", [["all", "Tümü"], ["positive", "Pozitif"], ["negative", "Negatif"], ["neutral", "Nötr"], ["high", "Yüksek etki"], ["medium", "Orta etki"], ["low", "Düşük etki"]], f.news)}
      ${selectBox("alertThreshold", "Uyarı eşiği", [0.5, 1, 3, 5].map((value) => [String(value), `%${value}`]), String(state.ui.alertThreshold))}
      <label class="toggle-line">
        <input id="fibOnly" type="checkbox" ${f.fibOnly ? "checked" : ""} />
        <span>Fib'e yakın</span>
      </label>
      <label class="toggle-line">
        <input id="favoritesOnly" type="checkbox" ${f.favoritesOnly ? "checked" : ""} />
        <span>Takip listem</span>
      </label>
      <button id="themeButton" class="tool-button">${state.ui.theme === "dark" ? "Açık tema" : "Koyu tema"}</button>
      <button id="densityButton" class="tool-button">${state.ui.density === "compact" ? "Rahat" : "Kompakt"}</button>
      <button id="notifyButton" class="tool-button">Bildirim</button>
      <button id="refreshButton" class="primary">Yenile</button>
      <a class="tool-button nav-tool-link" href="/binance.html">Binance</a>
    </section>
    <section class="quick-sorts">
      ${QUICK_SORTS.map((item) => `<button class="${f.sortBy === item.sortBy ? "active" : ""}" data-sort-by="${item.sortBy}" data-sort-dir="${item.sortDir}">${item.label}</button>`).join("")}
    </section>
    <section class="add-stock-panel">
      <details open>
        <summary>Yeni kategori / hisse ekle</summary>
        <div class="catalog-meta">
          <span>${state.customCategories.length} özel kategori</span>
          <span>${state.customStocks.length} özel hisse</span>
          <span>${nasdaqMeta.count || state.nasdaqUniverse.length || 0} Nasdaq hissesi</span>
          <span>${escapeHtml(nasdaqMeta.source || "Nasdaq")}</span>
        </div>
        <form class="add-category-form catalog-form-row" data-add-category-form>
          <label class="search-box catalog-field"><span>Kategori olustur</span><div class="search-field plain-field"><input name="categoryName" placeholder="Yeni kategori adi" autocomplete="off" /></div></label>
          <button class="tool-button" type="submit">Kategori ekle</button>
        </form>
        <form class="add-stock-form catalog-form-row" data-add-stock-form>
          <label class="wide-field smart-combobox catalog-field" data-nasdaq-combobox><span>Nasdaq sirketi sec</span><div class="smart-field"><input name="nasdaqSymbol" role="combobox" aria-expanded="false" placeholder="Sembol veya sirket ara: MSFT, Apple, Tesla..." autocomplete="off" /><button type="button" data-combobox-toggle aria-label="Listeyi ac">&#8964;</button></div><div class="smart-options" role="listbox"></div></label>
          <label class="search-box catalog-field"><span>Sembol</span><div class="search-field plain-field"><input name="symbol" placeholder="Secimden gelir" autocomplete="off" readonly /></div></label>
          <label class="search-box catalog-field"><span>Sirket</span><div class="search-field plain-field"><input name="company" placeholder="Secimden gelir" autocomplete="off" readonly /></div></label>
          <label class="wide-field smart-combobox catalog-field" data-category-combobox><span>Kategori</span><div class="smart-field"><input name="category" role="combobox" aria-expanded="false" placeholder="Yeni veya mevcut kategori" autocomplete="off" /><button type="button" data-combobox-toggle aria-label="Kategori listesini ac">&#8964;</button></div><div class="smart-options category-options" role="listbox"></div></label>
          <label class="search-box catalog-field"><span>Fib hedef</span><div class="search-field plain-field"><input name="fibTarget" inputmode="decimal" placeholder="Orn. 520" /></div></label>
          <label class="search-box catalog-field"><span>Logo/domain</span><div class="search-field plain-field"><input name="logo" placeholder="Secimden gelir, gerekirse degistir" autocomplete="off" /></div></label>
          <button class="primary" type="submit">Hisse ekle</button>
          <button class="tool-button" type="button" id="syncNasdaqButton">Nasdaq senkron</button>
          <small>Nasdaq evreni proxy tarafinda gunluk cache'lenir. Yeni listelenen hisseler senkron sonrasi secilebilir olur.</small>
          <p class="catalog-status ${activeStatus.kind}" role="status" aria-live="polite">${escapeHtml(activeStatus.message || defaultCatalogMessage)}</p>
        </form>
      </details>
    </section>
  `;
}

function selectBox(id, label, options, selected, extraClass = "") {
  return `
    <label class="select-box ${extraClass}">
      <span>${label}</span>
      <div class="select-field">
        <select id="${id}">
          ${options.map(([value, text]) => `<option value="${escapeAttr(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
        </select>
      </div>
    </label>
  `;
}

export function renderShell(actions, options = {}) {
  const focusState = captureFocusState();
  const scrollState = options.preserveScroll ? captureScrollState() : null;
  const rows = getVisibleRows();
  const kpis = getKpis(rows);
  const selected = rows.find((row) => row.symbol === state.selectedSymbol) || rows[0] || null;

  app.innerHTML = `
    <main class="page-shell metronic-shell ${options.quiet ? "quiet-render" : ""}">
      <aside class="metronic-sidebar" aria-label="Ana navigasyon">
        <a class="metronic-brand" href="/">
          <span class="brand-mark">FVT</span>
          <strong>Finansal Veri Takibi</strong>
        </a>
        <nav class="metronic-menu">
          <a class="active" href="#"><span>Dashboard</span><small>Canli takip</small></a>
          <a href="#watchlist"><span>Takip Listem</span><small>Favoriler</small></a>
          <a href="#signals"><span>Sinyaller</span><small>Risk ve momentum</small></a>
          <a href="#catalog"><span>Katalog</span><small>Hisse ekle</small></a>
          <a href="/binance.html"><span>Binance Paralel</span><small>Alternatif tema</small></a>
        </nav>
      </aside>

      <section class="metronic-main">
        <header class="metronic-topbar">
          <div>
            <span class="metronic-breadcrumb">Dashboard / Hisse Takip</span>
            <h1>Hisse Takip Dashboard</h1>
            <p class="subtitle">Fiyat, Fibonacci hedefi, haber etkisi, teknik sinyal, risk ve yatirim plani ayni karar destek ekraninda.</p>
          </div>
          <div class="proxy-pill ${state.error ? "bad" : "good"}">${state.error ? "Veri hatasi" : "Veri akisi aktif"} · ${state.lastRefreshAt ? new Date(state.lastRefreshAt).toLocaleTimeString("tr-TR") : "bekliyor"}</div>
        </header>

        <section class="metronic-toolbar">
          ${controlsTemplate(rows.length)}
        </section>

        <section class="metronic-dashboard-grid">
          <div class="metronic-left">
            ${summaryPanel(rows, kpis)}

            <section class="kpi-grid">
              ${kpiCard("Gorunen", kpis.total, "filtre sonrasi")}
              ${kpiCard("Fib'e yakin", kpis.nearFib, `%${state.ui.alertThreshold} esik`)}
              ${kpiCard("Canli", kpis.live, "guncel kaynak")}
              ${kpiCard("Haber + / -", `${kpis.newsPositive}/${kpis.newsNegative}`, "haber etkisi")}
              ${kpiCard("Ozel hedef", kpis.customTargets, `${kpis.targetAbove} hedef ustu`)}
              ${kpiCard("Guclu sinyal", kpis.strongTechnical, `${kpis.highRisk} yuksek risk`)}
              ${kpiCard(`${state.filters.returnPeriod}A pozitif`, kpis.positive, `${kpis.negative} negatif`)}
            </section>

            <section class="workspace">
              <div class="results">
                <div class="desktop-table">${tableTemplate(rows)}</div>
                <div class="mobile-list">${rows.map(cardTemplate).join("") || emptyTemplate()}</div>
              </div>
            </section>
          </div>
          <div class="metronic-right">
            ${detailTemplate(selected)}
          </div>
        </section>
      </section>

      <div id="alertStack" class="alert-stack" aria-live="polite"></div>
    </main>
  `;
  wireEvents(actions);
  restoreFocusState(focusState);
  restoreScrollState(scrollState);
}

function tableTemplate(rows) {
  if (!rows.length) return emptyTemplate();
  return `
    <table>
      <thead>
        <tr>
          ${sortableHeader("Hisse", "symbol", "pin-col")}
          ${sortableHeader("Kategori", "category")}
          ${sortableHeader("Fiyat", "price")}
          ${sortableHeader("Fib hedef", "fibTarget")}
          ${sortableHeader("Fib uzaklığı", "fibDistancePct")}
          ${sortableHeader("Heatmap 1-12A", "return")}
          ${sortableHeader("Haber", "newsPositive")}
          ${sortableHeader("Risk", "highRisk")}
          ${sortableHeader("Genel skor", "score")}
          ${sortableHeader("Durum", "status")}
        </tr>
      </thead>
      <tbody>${rows.map((row, index) => rowTemplate(row, index)).join("")}</tbody>
    </table>
  `;
}

function sortableHeader(label, sortBy, className = "") {
  const active = state.filters.sortBy === sortBy;
  const firstDir = ["score", "return", "newsPositive", "highRisk", "targetClosest", "momentumNews"].includes(sortBy) ? "desc" : "asc";
  const nextDir = active ? state.filters.sortDir === "asc" ? "desc" : "asc" : firstDir;
  const arrow = !active ? "sort" : state.filters.sortDir === "asc" ? "asc" : "desc";
  const ariaSort = active ? state.filters.sortDir === "asc" ? "ascending" : "descending" : "none";
  return `<th class="${className}" aria-sort="${ariaSort}"><button class="sort-header ${active ? "active" : ""}" data-table-sort-by="${sortBy}" data-sort-dir="${nextDir}"><span>${label}</span><i aria-hidden="true">${arrow}</i></button></th>`;
}

function rowTemplate(row, index = 0) {
  const selected = row.symbol === state.selectedSymbol ? "selected" : "";
  const rowState = [
    selected,
    row.isNearFib ? "near-fib" : "",
    row.isCustomFibTarget ? "custom-target-row" : "",
    row.newsSentiment === "positive" ? "news-positive" : "",
    row.newsSentiment === "negative" ? "news-negative" : "",
    row.riskLevel === "high" ? "risk-high" : ""
  ].filter(Boolean).join(" ");
  return `
    <tr class="${rowState}" data-symbol="${escapeAttr(row.symbol)}">
      <td class="pin-col"><div class="identity"><button class="favorite ${row.isFavorite ? "on" : ""}" data-favorite="${escapeAttr(row.symbol)}" aria-label="Favori">${row.isFavorite ? "★" : "☆"}</button>${logoBadge(row)}<strong>${row.symbol}</strong><span>${escapeHtml(row.company)}</span></div></td>
      <td>${escapeHtml(row.category)}</td>
      <td><div class="price-cell"><strong>${fmtUsd(row.price)}</strong>${sourceBadge(row)}</div></td>
      <td>${fmtUsd(row.fibTarget)}${fibTargetNote(row)}${row.isCustomFibTarget ? '<small class="custom-target-badge">Özel hedef</small>' : ""}</td>
      <td class="${Number(row.fibDistancePct) >= 0 ? "positive" : "negative"}">${fmtPct(row.fibDistancePct)}</td>
      <td>${heatmap(row.returns)}</td>
      <td>${newsBadge(row)}</td>
      <td>${riskBadge(row)}</td>
      <td>${scoreBadge(row, index < 2 ? "drop-down" : "")}</td>
      <td><div class="row-actions"><span class="status ${row.status}">${statusText(row)}</span>${row.isCustom ? `<button class="delete-stock-button" type="button" data-remove-custom-stock="${escapeAttr(row.symbol)}" title="Eklenen hisseyi sil" aria-label="${escapeAttr(row.symbol)} hissesini sil">Sil</button>` : ""}</div></td>
    </tr>
  `;
}

function cardTemplate(row) {
  return `
    <article class="stock-card ${row.isNearFib ? "near-fib" : ""}" data-symbol="${escapeAttr(row.symbol)}">
      <div class="card-head"><div class="identity"><button class="favorite ${row.isFavorite ? "on" : ""}" data-favorite="${escapeAttr(row.symbol)}" aria-label="Favori">${row.isFavorite ? "★" : "☆"}</button>${logoBadge(row)}<strong>${row.symbol}</strong><span>${escapeHtml(row.company)}</span></div><span class="status ${row.status}">${statusText(row)}</span></div>
      <div class="card-grid">
        <span>Fiyat <strong>${fmtUsd(row.price)}</strong>${sourceBadge(row)}</span>
        <span>Fib <strong>${fmtUsd(row.fibTarget)}</strong>${row.isCustomFibTarget ? '<small class="custom-target-badge">Özel hedef</small>' : ""}</span>
        <span>Haber <strong>${newsSentimentText(row.newsSentiment)}</strong></span>
        <span>Risk <strong>${riskLevelLabel(row.riskLevel)}</strong></span>
        <span>Genel skor ${scoreBadge(row)}</span>
      </div>
      ${signalStrip(row)}
      ${heatmap(row.returns)}
      <small>${escapeHtml(row.category)}</small>
    </article>
  `;
}

function detailTemplate(row) {
  if (!row) return `<aside class="detail-panel"><h2>Detay</h2><p>Filtreye uygun hisse yok.</p></aside>`;
  const activeTab = DETAIL_TABS.some((tab) => tab.id === state.ui.detailTab) ? state.ui.detailTab : "grafik";
  const analysis = state.analysis.get(row.symbol) || {};
  const newsData = state.news.get(row.symbol) || { items: [], impactSummary: null };
  const plan = state.investmentPlans?.[row.symbol] || row.investmentPlan || {};
  return `
    <aside class="detail-panel">
      <div class="detail-head">
        <div class="identity big">${logoBadge(row)}<strong>${row.symbol}</strong><span>${escapeHtml(row.company)}</span></div>
        <span class="status ${row.status}">${statusText(row)}</span>
      </div>
      <div class="detail-price">${fmtUsd(row.price)} <small>${priceFreshnessLabel(row)} · ${escapeHtml(row.snapshot?.source || "-")}</small></div>
      ${fibTargetEditor(row)}
      <div class="range-tabs detail-tabs" role="tablist">
        ${DETAIL_TABS.map((tab) => `<button class="${activeTab === tab.id ? "active" : ""}" data-detail-tab="${tab.id}" type="button" aria-selected="${activeTab === tab.id ? "true" : "false"}">${tab.label}</button>`).join("")}
      </div>
      <section class="detail-tab-panel" data-tab-panel="grafik" ${activeTab === "grafik" ? "" : "hidden"}>
        ${chartPanel(row, analysis)}
      </section>
      <section class="detail-tab-panel" data-tab-panel="haberler" ${activeTab === "haberler" ? "" : "hidden"}>
        ${newsPanel(row, newsData)}
      </section>
      <section class="detail-tab-panel" data-tab-panel="analiz" ${activeTab === "analiz" ? "" : "hidden"}>
        ${analysisPanel(row, analysis)}
      </section>
      <section class="detail-tab-panel" data-tab-panel="notlar" ${activeTab === "notlar" ? "" : "hidden"}>
        ${notesPanel(row, plan)}
      </section>
    </aside>
  `;
}

function chartPanel(row, analysis) {
  const history = getHistory(row.symbol);
  const returns = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: getReturnFor(row.symbol, index + 1) }));
  return `
    <div style="display:grid;gap:12px;">
      <div class="range-tabs">
        ${HISTORY_RANGES.map((item) => `<button class="${state.ui.historyRange === item.range && state.ui.historyInterval === item.interval ? "active" : ""}" data-range="${item.range}" data-interval="${item.interval}">${item.label}</button>`).join("")}
      </div>
      <div class="chart-wrap">
        <span class="chart-label ${trendClass(row.trend)}">${row.isNearFib ? "Fib'e Yakın" : row.trend}</span>
        <svg class="detail-chart" viewBox="0 0 1000 180" preserveAspectRatio="none">${chartPaths(history, 1000, 180, row)}</svg>
      </div>
      <div class="detail-metrics">
        <span>Fib hedef <strong>${fmtUsd(row.fibTarget)}</strong></span>
        <span>Fib uzaklığı <strong>${fmtPct(row.fibDistancePct)}</strong></span>
        <span>Hedef durumu <strong>${targetStatusLabel(row.targetStatus)}</strong></span>
        ${scoreMetric(row)}
        <span>Teknik sinyal <strong>${technicalSignalLabel(row.technicalSignal)}</strong></span>
        <span>Risk seviyesi <strong>${riskLevelLabel(row.riskLevel)}</strong></span>
        <span>Kaynak <strong>${row.snapshot?.source || "-"}</strong></span>
        <span>Volatilite 20G <strong>${fmtPct(row.volatility20d)}</strong></span>
        <span>RSI 14 <strong>${Number.isFinite(row.technicals.rsi14) ? row.technicals.rsi14.toFixed(1) : "-"}</strong></span>
        <span>MA20 / MA50 <strong>${fmtUsd(row.technicals.ma20)} / ${fmtUsd(row.technicals.ma50)}</strong></span>
        <span>52H Zirve/Dip <strong>${fmtPct(row.technicals.high52wPct)} / ${fmtPct(row.technicals.low52wPct)}</strong></span>
        <span>Analist hedefi <strong>${fmtUsd(analysis.targetMeanPrice)}</strong></span>
        <span>Bilan?o tarihi <strong>${analysis.earningsDate || "-"}</strong></span>
        <span>Analist notu <strong>${Number.isFinite(analysis.recommendation) ? analysis.recommendation.toFixed(2) : "-"}</strong></span>
      </div>
      ${monthlyReturns(returns)}
      ${heatmap(row.returns)}
      <div class="source-report">
        <b>Kaynak sırası</b>
        <span>${(row.snapshot?.sourcePriority || state.proxyStatus?.health?.sourcePriority || []).join(" -> ") || "Yahoo Finance -> Stooq -> FVT -> Google Finance -> lastKnown"}</span>
        <span>Analiz kayna??: ${escapeHtml(analysis.source || "Finviz HTML / ?cretsiz kaynak bekleniyor")}</span>
      </div>
    </div>
  `;
}

function newsPanel(row, newsData) {
  const items = Array.isArray(newsData.items) ? newsData.items : [];
  const summary = newsData.impactSummary || {};
  const topItems = [...items].sort((a, b) => (b.impactScore || 0) - (a.impactScore || 0)).slice(0, 4);
  const summaryLine = items.length
    ? `${items.length} haber, ${summary.highImpactCount || 0} yüksek etki, ${summary.positiveCount || 0} olumlu ve ${summary.negativeCount || 0} olumsuz`
    : "Bu hisse için haber akışı henüz oluşmadı.";
  return `
    <div style="display:grid;gap:12px;">
      <div class="signal-row">${newsBadge(row)}${impactBadge(summary)}${signalBadge(row)}</div>
      <div class="detail-metrics">
        <span>Haber sayısı <strong>${items.length}</strong></span>
        <span>Yüksek etki <strong>${summary.highImpactCount || 0}</strong></span>
        <span>Ortalama duygu <strong>${Number.isFinite(summary.averageSentimentScore) ? summary.averageSentimentScore.toFixed(2) : "-"}</strong></span>
        <span>Ortalama etki <strong>${Number.isFinite(summary.averageImpactScore) ? summary.averageImpactScore.toFixed(2) : "-"}</strong></span>
      </div>
      <div class="source-report">
        <b>Haber özeti</b>
        <span>${escapeHtml(summaryLine)}</span>
      </div>
      <div class="news-list">
        <b>En etkili haberler</b>
        ${topItems.length ? topItems.map(newsItemTemplate).join("") : "<span>Haber bulunamadı.</span>"}
      </div>
    </div>
  `;
}

function analysisPanel(row, analysis) {
  return `
    <div style="display:grid;gap:12px;">
      <div class="detail-metrics">
        <span>Teknik sinyal <strong>${technicalSignalLabel(row.technicalSignal)}</strong></span>
        <span>Haber etkisi <strong>${newsEffectLabel(row)}</strong></span>
        <span>Risk seviyesi <strong>${riskLevelLabel(row.riskLevel)}</strong></span>
        <span>Hedef durumu <strong>${targetStatusLabel(row.targetStatus)}</strong></span>
        <span>MA20 / MA50 <strong>${fmtUsd(row.technicals.ma20)} / ${fmtUsd(row.technicals.ma50)}</strong></span>
        <span>52H Zirve/Dip <strong>${fmtPct(row.technicals.high52wPct)} / ${fmtPct(row.technicals.low52wPct)}</strong></span>
        <span>Analist hedefi <strong>${fmtUsd(analysis.targetMeanPrice)}</strong></span>
        <span>Bilan?o tarihi <strong>${analysis.earningsDate || "-"}</strong></span>
        <span>Analist notu <strong>${Number.isFinite(analysis.recommendation) ? analysis.recommendation.toFixed(2) : "-"}</strong></span>
        <span>Momentum + haber <strong>${fmtSigned(row.momentumNewsScore)}</strong></span>
      </div>
      <div class="source-report">
        <b>Kaynak sırası</b>
        <span>${(row.snapshot?.sourcePriority || state.proxyStatus?.health?.sourcePriority || []).join(" -> ") || "Yahoo Finance -> Stooq -> FVT -> Google Finance -> lastKnown"}</span>
        <span>Analiz kayna??: ${escapeHtml(analysis.source || "Finviz HTML / ?cretsiz kaynak bekleniyor")}</span>
      </div>
    </div>
  `;
}

function notesPanel(row, plan) {
  const noteValue = plan.note || "";
  return `
    <form class="detail-tab-panel investment-plan-form" data-investment-plan-form="${escapeAttr(row.symbol)}">
      <label><span>İzleme notu</span><textarea name="note" rows="4" maxlength="600" placeholder="Bu hisse için izleme gerekçesi...">${escapeHtml(noteValue)}</textarea></label>
      <div class="form-grid">
        <label><span>Giriş fiyatı</span><input name="entryPrice" inputmode="decimal" value="${escapeAttr(plan.entryPrice ?? "")}" placeholder="Örn. 48.20" /></label>
        <label><span>Planlanan alım bölgesi</span><input name="buyZone" value="${escapeAttr(plan.buyZone || "")}" placeholder="Örn. 45-48" /></label>
        <label><span>Stop seviyesi</span><input name="stopPrice" inputmode="decimal" value="${escapeAttr(plan.stopPrice ?? "")}" placeholder="Örn. 42.00" /></label>
        <label><span>Pozisyon etiketi</span><select name="positionTag">${POSITION_TAGS.map((tag) => `<option value="${escapeAttr(tag.value)}" ${String(plan.positionTag || "?zle") === tag.value ? "selected" : ""}>${escapeHtml(tag.label)}</option>`).join("")}</select></label>
      </div>
      <button class="primary" type="submit">Yatırım planını kaydet</button>
      <small>Bu alanlar sadece bu tarayıcıda localStorage içinde saklanır. Yatırım tavsiyesi değildir.</small>
    </form>
  `;
}

function newsItemTemplate(item) {
  const sentiment = item.sentiment || "neutral";
  const impact = item.impact || "low";
  const href = item.url || item.link || "#";
  return `
    <a class="${sentiment}" data-sentiment="${sentiment}" data-impact="${impact}" href="${escapeAttr(href)}" target="_blank" rel="noreferrer">
      <span class="news-meta">${escapeHtml(item.source || "Kaynak")} · ${escapeHtml(formatNewsDate(item.publishedAt))} · ${escapeHtml(newsSentimentText(sentiment))}${impact === "high" ? " · Yüksek etki" : ""}</span>
      <strong>${escapeHtml(item.title || "Başlık yok")}</strong>
      <small>${escapeHtml(item.turkishSummary || "Türkçe özet için başlık bazlı kısa yorum üretilemedi.")}</small>
    </a>
  `;
}

function formatNewsDate(value) {
  if (!value) return "tarih yok";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
}

function monthlyReturns(returns) {
  return `
    <div class="return-strip monthly-returns" aria-label="1-12 aylık hisse getirileri">
      ${returns.map((item) => {
        const value = Number(item.value);
        const cls = !Number.isFinite(value) ? "neutral" : value >= 0 ? "positive" : "negative";
        return `<span class="${cls}" title="${item.month}A getiri ${fmtPct(value)}"><b>${item.month}A</b>${fmtPct(value)}</span>`;
      }).join("")}
    </div>
  `;
}

function trendClass(label) {
  if (label === "Güçlü Trend") return "strong";
  if (label === "Zayıf Trend") return "weak";
  if (label === "Veri Eski") return "old";
  return "near";
}

function fibTargetEditor(row) {
  const current = Number.isFinite(Number(row.fibTarget)) ? Number(row.fibTarget).toFixed(2) : "";
  const catalog = Number.isFinite(Number(row.catalogFibTarget)) ? fmtUsd(row.catalogFibTarget) : "-";
  return `
    <form class="fib-target-editor" data-fib-target-form="${escapeAttr(row.symbol)}">
      <label>
        <span>Fib hedefini düzenle</span>
        <div class="fib-target-field">
          <input id="fibTargetInput-${escapeAttr(row.symbol)}" name="fibTarget" inputmode="decimal" value="${escapeAttr(current)}" aria-label="${escapeAttr(row.symbol)} Fib hedef fiyatı" />
          <button type="submit">Kaydet</button>
        </div>
      </label>
      <div class="fib-target-meta">
        <small>Varsayılan: ${catalog}</small>
        ${row.isCustomFibTarget ? `<button type="button" data-reset-fib-target="${escapeAttr(row.symbol)}">Varsayılana dön</button>` : ""}
      </div>
    </form>
  `;
}

function fibTargetText(row) {
  const price = Number(row.price);
  const target = Number(row.fibTarget);
  if (!Number.isFinite(price) || !Number.isFinite(target) || target === 0) return "-";
  if (Math.abs(price - target) < 0.005) return "Hedefte";
  const pct = ((price - target) / target) * 100;
  return pct > 0 ? `Hedef üstü ${fmtAbsPct(pct)}` : `Hedefe kalan ${fmtAbsPct(pct)}`;
}

function fibTargetNote(row) {
  const price = Number(row.price);
  const target = Number(row.fibTarget);
  const cls = Number.isFinite(price) && Number.isFinite(target) && price > target ? "above" : "remaining";
  return `<small class="target-note ${cls}">${fibTargetText(row)}</small>`;
}

function scoreBadge(row, popoverClass = "", options = {}) {
  const info = row.scoreInfo || {};
  const scoreText = options.plain ? String(Math.round(Number(row.score))) : fmtSigned(row.score);
  const detail = scoreDetail(row, info);
  return `<span class="score-wrap" tabindex="0" title="${escapeAttr(detail)}"><span class="score">${scoreText}</span><span class="score-info" aria-label="Genel skor hesaplama bilgisi">i</span>${scorePopover(row, info, popoverClass)}</span>`;
}

function scoreMetric(row) {
  return `<span>Genel skor <strong>${fmtSigned(row.score)}</strong></span>`;
}

function scoreDetail(row, info = row.scoreInfo || {}) {
  return [
    "Genel skor sadece Fib yakınlığı değildir.",
    `Toplam skor: ${fmtSigned(row.score)}`,
    `Fib uzaklığı: ${fmtPct(row.fibDistancePct)}`,
    `Fib puanı: ${fmtSigned(info.fibScore)} / 35`,
    `12A trend: ${fmtSigned(info.trendScore)} / 35`,
    `1A momentum: ${fmtSigned(info.monthScore)} / 20`,
    `Veri tazeliği: ${fmtSigned(info.freshness)} / 10`,
    "Formül: Fib puanı + 12A trend + 1A momentum + veri tazeliği. Yatırım tavsiyesi değildir."
  ].join("\n");
}

function scorePopover(row, info = row.scoreInfo || {}, popoverClass = "") {
  return `<span class="score-popover ${popoverClass}" role="tooltip"><b>Genel skor nasıl hesaplandı?</b><small>Toplam skor Fib'e yakınlık skoru değildir.</small><small>Fib uzaklığı <strong>${fmtPct(row.fibDistancePct)}</strong></small><small>Fib puanı <strong>${fmtSigned(info.fibScore)}/35</strong></small><small>12A trend <strong>${fmtSigned(info.trendScore)}/35</strong></small><small>1A momentum <strong>${fmtSigned(info.monthScore)}/20</strong></small><small>Veri tazeliği <strong>${fmtSigned(info.freshness)}/10</strong></small><em>Bilgilendirme amaçlıdır.</em></span>`;
}

function signalStrip(row) {
  return `<div class="signal-row">${signalBadge(row)}${riskBadge(row)}${targetBadge(row)}${newsBadge(row)}</div>`;
}

function signalBadge(row) {
  const label = technicalSignalLabel(row.technicalSignal);
  const cls = row.technicalSignal === "strong_buy" || row.technicalSignal === "buy" ? "positive" : row.technicalSignal === "sell" || row.technicalSignal === "strong_sell" ? "negative" : "neutral";
  return `<span class="signal-badge ${cls}">Teknik ${label}</span>`;
}

function riskBadge(row) {
  const cls = row.riskLevel === "high" ? "high" : row.riskLevel === "medium" ? "medium" : "low";
  return `<span class="risk-badge ${cls}">${riskLevelLabel(row.riskLevel)}</span>`;
}

function targetBadge(row) {
  const cls = row.targetStatus === "above" ? "above" : row.targetStatus === "near" ? "near" : "far";
  return `<span class="target-badge ${cls}">${targetStatusLabel(row.targetStatus)}</span>`;
}

function newsBadge(row) {
  const cls = row.newsSentiment || "neutral";
  return `<span class="news-badge ${cls}">${newsSentimentText(cls)}</span>`;
}

function impactBadge(newsImpact) {
  const high = Number(newsImpact.highImpactCount || 0);
  return `<span class="news-badge ${high ? "high" : "neutral"}">${high ? `${high} yüksek etki` : "Etki düşük"}</span>`;
}

function newsSentimentText(value) {
  if (value === "positive") return "Pozitif";
  if (value === "negative") return "Negatif";
  return "Nötr";
}

function heatmap(returns) {
  return `<div class="heatmap" title="1-12 aylık getiri">${returns.map((item) => {
    const value = Number(item.value);
    const capped = Number.isFinite(value) ? Math.max(-80, Math.min(80, value)) : 0;
    const intensity = Number.isFinite(value) ? Math.min(1, Math.abs(capped) / 80) : 0;
    const bar = Number.isFinite(value) ? Math.max(14, Math.round(Math.abs(capped) / 80 * 100)) : 0;
    const cls = !Number.isFinite(value) ? "empty" : value >= 0 ? "up" : "down";
    return `<span class="${cls}" style="--heat:${intensity.toFixed(2)};--bar:${bar}%;" title="${item.month}A ${fmtPct(value)}" aria-label="${item.month}A ${fmtPct(value)}"><i>${item.month}</i></span>`;
  }).join("")}</div>`;
}

export function chartPaths(points, width = 1000, height = 64, row = null) {
  const values = (points || []).map((point) => Number(point.close)).filter(Number.isFinite);
  if (values.length < 2) {
    return `<g class="chart-empty"><text x="${width / 2}" y="${height / 2}" text-anchor="middle">Grafik verisi bekleniyor</text></g>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const historyRange = max - min || Math.max(1, max * 0.02);
  const price = Number(row.price);
  const fibTarget = Number(row.fibTarget);
  const scaleSeeds = [...values];
  if (Number.isFinite(price)) scaleSeeds.push(price);
  const targetFitsChart = Number.isFinite(fibTarget) && fibTarget >= min - historyRange * 0.55 && fibTarget <= max + historyRange * 0.55;
  if (targetFitsChart) scaleSeeds.push(fibTarget);
  const seedMin = Math.min(...scaleSeeds);
  const seedMax = Math.max(...scaleSeeds);
  const pad = Math.max((seedMax - seedMin || historyRange) * 0.12, 0.01);
  const scaleMin = seedMin - pad;
  const scaleMax = seedMax + pad;
  const range = scaleMax - scaleMin || 1;
  const yFor = (value) => height - ((value - scaleMin) / range) * (height - 24) - 12;
  const coords = values.map((value, index) => [(index / (values.length - 1)) * width, yFor(value)]);
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const up = values[values.length - 1] >= values[0];
  const first = values[0];
  const last = values[values.length - 1];
  const minPoint = coords[values.indexOf(min)];
  const maxPoint = coords[values.indexOf(max)];
  const lastPoint = coords[coords.length - 1];
  const grid = [0.25, 0.5, 0.75].map((ratio) => `<line class="grid-line" x1="0" y1="${(height * ratio).toFixed(2)}" x2="${width}" y2="${(height * ratio).toFixed(2)}"></line>`).join("");
  const fibY = Number.isFinite(fibTarget)
    ? (targetFitsChart ? yFor(fibTarget) : fibTarget > scaleMax ? 14 : height - 14)
    : null;
  const priceY = Number.isFinite(price) ? yFor(price) : lastPoint[1];
  let fibTextY = Number.isFinite(fibY)
    ? Math.max(18, Math.min(height - 10, Math.abs(fibY - priceY) < 30 ? fibY + (fibY > priceY ? 26 : -22) : fibY - 7))
    : null;
  let priceTextY = Math.max(20, Math.min(height - 14, Math.abs((fibTextY ?? -999) - priceY) < 28 ? priceY + 30 : priceY - 12));
  if (Number.isFinite(fibTextY) && Math.abs(fibTextY - priceTextY) < 38) {
    if (priceY > height * 0.55 || fibY > height * 0.55) {
      fibTextY = height - 18;
      priceTextY = height - 56;
    } else {
      priceTextY = 24;
      fibTextY = 58;
    }
  }
  const fibLine = Number.isFinite(fibY)
    ? `<line class="fib-line ${targetFitsChart ? "" : "clamped"}" x1="0" y1="${fibY.toFixed(2)}" x2="${width}" y2="${fibY.toFixed(2)}"></line><text class="fib-label" x="16" y="${fibTextY.toFixed(2)}" text-anchor="start">Fib ${fmtUsd(fibTarget)}</text>`
    : "";
  const change = ((last - first) / (first || 1)) * 100;
  return `
    <defs>
      <linearGradient id="chartAreaGradient" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="currentColor" stop-opacity=".30"></stop>
        <stop offset=".72" stop-color="currentColor" stop-opacity=".08"></stop>
        <stop offset="1" stop-color="currentColor" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    ${grid}
    ${fibLine}
    <path class="area ${up ? "up" : "down"}" d="${area}"></path>
    <path class="line ${up ? "up" : "down"}" d="${line}" pathLength="1"></path>
    <circle class="extreme-marker low" cx="${minPoint[0].toFixed(2)}" cy="${minPoint[1].toFixed(2)}" r="4.5"></circle>
    <circle class="extreme-marker high" cx="${maxPoint[0].toFixed(2)}" cy="${maxPoint[1].toFixed(2)}" r="4.5"></circle>
    <line class="price-guide" x1="${Math.max(0, lastPoint[0] - 86).toFixed(2)}" y1="${priceY.toFixed(2)}" x2="${width}" y2="${priceY.toFixed(2)}"></line>
    <circle class="price-marker ${up ? "up" : "down"}" cx="${lastPoint[0].toFixed(2)}" cy="${priceY.toFixed(2)}" r="7"></circle>
    <text class="chart-callout" x="${width - 14}" y="${priceTextY.toFixed(2)}" text-anchor="end">${fmtUsd(price)} / ${fmtPct(change)}</text>
  `;
}

function emptyTemplate() {
  return `<div class="empty">Bu filtrelere uygun hisse bulunamadı.</div>`;
}

function logoBadge(row) {
  const logo = row.isCustom && row.logo ? highResLogoUrl(row.logo) : logoUrlForSymbol(row.symbol);
  const fallback = row.logo ? highResLogoUrl(row.logo) : "";
  const onError = fallback && fallback !== logo ? ` onerror="this.onerror=null;this.src='${escapeAttr(fallback)}'"` : "";
  return `<span class="logo-badge" aria-hidden="true"><img src="${escapeAttr(logo)}" alt="" loading="eager" decoding="async"${onError} /></span>`;
}

function logoUrlForSymbol(symbol) {
  return `${PROXY_ROOT}/api/logo/${encodeURIComponent(symbol || "")}?v=logo6`;
}

function logoUrlForNasdaq(row) {
  return row.logo ? highResLogoUrl(row.logo) : logoUrlForSymbol(row.symbol || "");
}

function logoFallbackForNasdaq(row) {
  return logoUrlForSymbol(row.symbol || "");
}

function nasdaqMatches(query) {
  const q = String(query || "").trim().toLowerCase();
  const rows = state.nasdaqUniverse || [];
  const matches = q
    ? rows.filter((row) =>
      row.symbol.toLowerCase().includes(q) ||
      row.company.toLowerCase().includes(q) ||
      (Array.isArray(row.aliases) && row.aliases.some((alias) => String(alias).toLowerCase().includes(q)))
    )
    : rows;
  return matches
    .sort((a, b) => {
      const aExact = a.symbol.toLowerCase() === q ? -2 : a.symbol.toLowerCase().startsWith(q) ? -1 : 0;
      const bExact = b.symbol.toLowerCase() === q ? -2 : b.symbol.toLowerCase().startsWith(q) ? -1 : 0;
      return aExact - bExact || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 12);
}

function nasdaqOptionTemplate(row) {
  const logo = logoUrlForNasdaq(row);
  const fallback = logoFallbackForNasdaq(row);
  const onError = fallback && fallback !== logo ? ` onerror="this.onerror=null;this.src='${escapeAttr(fallback)}'"` : "";
  return `
    <button type="button" class="smart-option" data-nasdaq-pick="${escapeAttr(row.symbol)}" role="option">
      <span class="smart-logo"><img src="${escapeAttr(logo)}" alt="" loading="eager" decoding="async"${onError} /></span>
      <span class="smart-main"><b>${escapeHtml(row.symbol)}</b><small>${escapeHtml(row.company)}</small></span>
      <span class="smart-tag">${escapeHtml(row.exchange || "NASDAQ")}</span>
    </button>
  `;
}

function categoryOptionTemplate(category) {
  return `
    <button type="button" class="smart-option category-option" data-category-pick="${escapeAttr(category)}" role="option">
      <span class="smart-main"><b>${escapeHtml(shortCategory(category))}</b><small>${escapeHtml(category)}</small></span>
      <span class="smart-tag">Kategori</span>
    </button>
  `;
}

function fillNasdaqSelection(form, selected) {
  if (!form || !selected) return;
  form.querySelector("[name='nasdaqSymbol']").value = selected.symbol;
  form.querySelector("[name='symbol']").value = selected.symbol;
  form.querySelector("[name='company']").value = selected.company;
  form.querySelector("[name='logo']").value = logoUrlForNasdaq(selected);
  const message = `${selected.symbol} secildi. Kategori ve Fib hedef girip ekleyebilirsin.`;
  setCatalogStatus("info", message);
  const status = form.querySelector(".catalog-status");
  if (status) {
    status.className = "catalog-status info";
    status.textContent = message;
  }
}

function clearNasdaqSelection(form) {
  if (!form) return;
  form.querySelector("[name='symbol']").value = "";
  form.querySelector("[name='company']").value = "";
  form.querySelector("[name='logo']").value = "";
  const message = "Nasdaq sirketi sec, kategori olustur veya mevcut kategoriye ekle.";
  setCatalogStatus("idle", message);
  const status = form.querySelector(".catalog-status");
  if (status) {
    status.className = "catalog-status idle";
    status.textContent = message;
  }
}

function wireNasdaqCombobox() {
  const root = document.querySelector("[data-nasdaq-combobox]");
  const input = root.querySelector("[name='nasdaqSymbol']");
  const list = root.querySelector(".smart-options");
  const form = root.closest("form");
  if (!root || !input || !list || !form) return;

  const close = () => {
    root.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    root.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  };
  const renderOptions = () => {
    const matches = nasdaqMatches(input.value);
    list.innerHTML = matches.length
      ? matches.map(nasdaqOptionTemplate).join("")
      : `<div class="smart-empty">Sonuc yok. Nasdaq senkron ile listeyi yenileyebilirsin.</div>`;
    open();
  };

  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", () => {
    if (!input.value.trim()) {
      clearNasdaqSelection(form);
      list.innerHTML = "";
      close();
      return;
    }
    const selected = findNasdaqCompany(input.value);
    if (selected) fillNasdaqSelection(form, selected);
    renderOptions();
  });
  root.querySelector("[data-combobox-toggle]").addEventListener("click", () => {
    if (root.classList.contains("open")) close();
    else {
      input.focus();
      renderOptions();
    }
  });
  list.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-nasdaq-pick]");
    if (!button) return;
    event.preventDefault();
    const selected = findNasdaqCompany(button.dataset.nasdaqPick);
    fillNasdaqSelection(form, selected);
    close();
  });
  document.addEventListener("mousedown", (event) => {
    if (!root.contains(event.target)) close();
  });
}

function wireCategoryCombobox() {
  const root = document.querySelector("[data-category-combobox]");
  if (!root) return;
  const input = root.querySelector("[name='category']");
  const list = root.querySelector(".smart-options");
  if (!input || !list) return;

  const close = () => {
    root.classList.remove("open");
    input.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    root.classList.add("open");
    input.setAttribute("aria-expanded", "true");
  };
  const renderOptions = () => {
    const q = input.value.trim().toLowerCase();
    const matches = getCategories()
      .filter((category) => !q || category.toLowerCase().includes(q) || shortCategory(category).toLowerCase().includes(q))
      .slice(0, 12);
    list.innerHTML = matches.length
      ? matches.map(categoryOptionTemplate).join("")
      : `<div class="smart-empty">Bu adla yeni kategori olusturabilirsin.</div>`;
    open();
  };

  input.addEventListener("focus", renderOptions);
  input.addEventListener("input", renderOptions);
  root.querySelector("[data-combobox-toggle]").addEventListener("click", () => {
    if (root.classList.contains("open")) close();
    else {
      input.focus();
      renderOptions();
    }
  });
  list.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-category-pick]");
    if (!button) return;
    event.preventDefault();
    input.value = button.dataset.categoryPick || "";
    close();
  });
  document.addEventListener("mousedown", (event) => {
    if (!root.contains(event.target)) close();
  });
}

function highResLogoUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "www.google.com" && parsed.pathname === "/s2/favicons") {
      parsed.searchParams.set("sz", "256");
      return parsed.toString();
    }
  } catch {
    // Keep the original catalog URL when it is not an absolute URL.
  }
  return url;
}

function sourceBadge(row) {
  const source = row.snapshot?.source || "yükleniyor";
  const normalized = source.toLowerCase().replace(/[^a-z]/g, "");
  return `<small class="source-badge ${normalized}">${escapeHtml(source)}</small>`;
}

function logoTheme(symbol) {
  const palettes = [
    ["#38bdf8", "#22c55e"],
    ["#60a5fa", "#f59e0b"],
    ["#a78bfa", "#06b6d4"],
    ["#f43f5e", "#facc15"],
    ["#14b8a6", "#8b5cf6"],
    ["#fb7185", "#2dd4bf"],
    ["#f97316", "#84cc16"],
    ["#e879f9", "#38bdf8"]
  ];
  const index = [...symbol].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palettes.length;
  return { a: palettes[index][0], b: palettes[index][1] };
}

function wireEvents(actions) {
  const rerender = () => renderShell(actions);
  const updateFilters = (patch) => {
    setFilters(patch);
    const visible = getVisibleRows();
    if (!visible.some((row) => row.symbol === state.selectedSymbol)) state.selectedSymbol = visible[0].symbol || null;
    rerender();
  };

  document.getElementById("searchInput").addEventListener("input", (event) => updateFilters({ search: event.target.value }));
  document.getElementById("categoryFilter").addEventListener("change", (event) => updateFilters({ category: event.target.value }));
  document.getElementById("statusFilter").addEventListener("change", (event) => updateFilters({ status: event.target.value }));
  document.getElementById("targetFilter").addEventListener("change", (event) => updateFilters({ target: event.target.value }));
  document.getElementById("signalFilter").addEventListener("change", (event) => updateFilters({ signal: event.target.value }));
  document.getElementById("newsFilter").addEventListener("change", (event) => updateFilters({ news: event.target.value }));
  document.getElementById("alertThreshold").addEventListener("change", (event) => { setUi({ alertThreshold: Number(event.target.value) }); rerender(); });
  document.getElementById("fibOnly").addEventListener("change", (event) => updateFilters({ fibOnly: event.target.checked }));
  document.getElementById("favoritesOnly").addEventListener("change", (event) => updateFilters({ favoritesOnly: event.target.checked }));
  document.getElementById("refreshButton").addEventListener("click", actions.refreshAll);
  document.getElementById("themeButton").addEventListener("click", () => { setUi({ theme: state.ui.theme === "dark" ? "light" : "dark" }); rerender(); });
  document.getElementById("densityButton").addEventListener("click", () => { setUi({ density: state.ui.density === "compact" ? "comfortable" : "compact" }); rerender(); });
  document.getElementById("notifyButton").addEventListener("click", actions.requestNotifications);
  document.getElementById("syncNasdaqButton").addEventListener("click", () => {
    setNasdaqUniverseStatus("loading", "Nasdaq listesi yeniden senkronlanıyor...");
    actions.loadNasdaqUniverse?.(true);
  });

  wireNasdaqCombobox();
  wireCategoryCombobox();

  document.querySelector("[data-add-category-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.querySelector("[name='categoryName']");
    const result = addCustomCategory(input.value);
    if (!result.ok) {
      setCatalogStatus("error", result.message);
      input.setAttribute("aria-invalid", "true");
      input.focus();
      rerender();
      return;
    }
    setCatalogStatus(result.existed ? "info" : "success", result.existed ? `Kategori zaten vardı: ${result.category}` : `Yeni kategori eklendi: ${result.category}`);
    if (input) input.value = "";
    rerender();
  });

  document.querySelector("[data-add-stock-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const selected = findNasdaqCompany(form.querySelector("[name='nasdaqSymbol']").value);
    const result = addCustomStock({
      symbol: selected.symbol || form.querySelector("[name='symbol']").value,
      company: selected.company || form.querySelector("[name='company']").value,
      category: form.querySelector("[name='category']").value,
      fibTarget: parseNullableNumberInput(form.querySelector("[name='fibTarget']").value),
      logo: form.querySelector("[name='logo']").value || selected.logo || selected.domain
    });
    if (!result.ok) {
      setCatalogStatus("error", result.message);
      form.querySelector("[name='symbol']").setAttribute("aria-invalid", "true");
      form.querySelector("[name='symbol']").focus();
      rerender();
      return;
    }
    setCatalogStatus("success", `${result.stock.symbol} özel kataloga eklendi.`);
    state.selectedSymbol = result.stock.symbol;
    setFilters({ category: "all", search: result.stock.symbol });
    form.reset();
    actions.refreshAll();
    rerender();
  });

  document.querySelectorAll("[data-detail-tab]").forEach((button) => button.addEventListener("click", () => {
    setUi({ detailTab: button.dataset.detailTab });
    rerender();
  }));

  document.querySelectorAll("[data-investment-plan-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const symbol = form.dataset.investmentPlanForm;
    setInvestmentPlan(symbol, {
      note: form.querySelector("[name='note']").value || "",
      entryPrice: parseNullableNumberInput(form.querySelector("[name='entryPrice']").value),
      buyZone: form.querySelector("[name='buyZone']").value || "",
      stopPrice: parseNullableNumberInput(form.querySelector("[name='stopPrice']").value),
      positionTag: form.querySelector("[name='positionTag']")?.value || "İzle"
    });
    rerender();
  }));

  document.querySelectorAll("[data-fib-target-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("[name='fibTarget']");
    const value = parseNumberInput(input.value);
    if (!Number.isFinite(value) || value <= 0) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return;
    }
    setFibTarget(form.dataset.fibTargetForm, value);
    rerender();
  }));

  document.querySelectorAll("[data-reset-fib-target]").forEach((button) => button.addEventListener("click", () => {
    resetFibTarget(button.dataset.resetFibTarget);
    rerender();
  }));

  document.querySelectorAll("[data-remove-custom-stock]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const symbol = button.dataset.removeCustomStock;
    if (!symbol) return;
    removeCustomStock(symbol);
    setCatalogStatus("info", `${symbol} özel katalogdan silindi.`);
    rerender();
  }));

  document.querySelectorAll("[data-sort-by]").forEach((button) => button.addEventListener("click", () => updateFilters({ sortBy: button.dataset.sortBy, sortDir: button.dataset.sortDir })));
  document.querySelectorAll("[data-table-sort-by]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    updateFilters({ sortBy: button.dataset.tableSortBy, sortDir: button.dataset.sortDir });
  }));
  document.querySelectorAll("[data-range]").forEach((button) => button.addEventListener("click", () => {
    setUi({ historyRange: button.dataset.range, historyInterval: button.dataset.interval });
    actions.loadSelectedHistory();
  }));
  document.querySelectorAll("[data-favorite]").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleFavorite(button.dataset.favorite);
    rerender();
  }));
  document.querySelectorAll("[data-symbol]").forEach((row) => row.addEventListener("click", () => {
    state.selectedSymbol = row.dataset.symbol;
    persistSettings();
    actions.loadSelectedHistory();
    actions.loadSelectedNews();
    actions.loadSelectedAnalysis();
    rerender();
  }));
}

function captureFocusState() {
  const active = document.activeElement;
  if (!active || active === document.body || !active.id) return null;
  const isTextField = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  return {
    id: active.id,
    selectionStart: isTextField ? active.selectionStart : null,
    selectionEnd: isTextField ? active.selectionEnd : null,
    value: isTextField ? active.value : null
  };
}

function restoreFocusState(focusState) {
  if (!focusState?.id) return;
  const next = document.getElementById(focusState.id);
  if (!next) return;
  next.focus({ preventScroll: true });
  if (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement) {
    const end = String(next.value ?? "").length;
    const start = Math.min(focusState.selectionStart ?? end, end);
    const finish = Math.min(focusState.selectionEnd ?? start, end);
    try {
      next.setSelectionRange(start, finish);
    } catch {
      // Some input types do not support caret selection.
    }
  }
}

function captureScrollState() {
  return {
    x: window.scrollX,
    y: window.scrollY
  };
}

function restoreScrollState(scrollState) {
  if (!scrollState) return;
  window.scrollTo(scrollState.x, scrollState.y);
  requestAnimationFrame(() => window.scrollTo(scrollState.x, scrollState.y));
}

function parseNullableNumberInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNumberInput(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
