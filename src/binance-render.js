import { PROXY_ROOT } from "./api.js";
import { getCategories, getHistory, getKpis, getVisibleRows, setFilters, state } from "./state.js";

const app = document.getElementById("app");

const fmtUsd = (value) => Number.isFinite(Number(value))
  ? "$" + Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : "-";

const fmtPct = (value) => Number.isFinite(Number(value))
  ? (Number(value) > 0 ? "+" : "") + Number(value).toFixed(2) + "%"
  : "-";

const shortTime = (ms) => ms ? new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "bekliyor";

export function renderBinanceDashboard(actions) {
  const rows = getVisibleRows();
  const kpis = getKpis(rows);
  const selected = rows.find((row) => row.symbol === state.selectedSymbol) || rows[0] || null;
  const topGainers = [...rows].sort((a, b) => Number(b.momentum1m || 0) - Number(a.momentum1m || 0)).slice(0, 5);
  const riskRows = [...rows].sort((a, b) => Number(b.riskScore || 0) - Number(a.riskScore || 0)).slice(0, 5);

  app.innerHTML = `
    <main class="bn-shell">
      <nav class="bn-nav">
        <a class="bn-brand" href="/"><span></span>Hisse Takip</a>
        <div class="bn-nav-links">
          <a href="/">Klasik Dashboard</a>
          <a class="active" href="/binance.html">Binance Paralel</a>
        </div>
        <button id="bnRefresh" class="bn-primary" type="button">${state.loading ? "Yenileniyor" : "Yenile"}</button>
      </nav>

      <section class="bn-hero">
        <div>
          <p class="bn-eyebrow">Binance tasarim paraleli</p>
          <h1>Finansal izleme icin hizli, koyu ve sari odakli terminal.</h1>
          <p class="bn-subtitle">Ayni hisse, fiyat, Fibonacci, momentum ve risk verisi; Binance tasarim dokumanindaki kontrast, sayi dili ve piyasa tablosu yapisiyla sunulur.</p>
          <div class="bn-hero-actions">
            <button id="bnSortFib" class="bn-primary" type="button">Fib'e en yakin</button>
            <button id="bnSortMomentum" class="bn-secondary" type="button">1A momentum</button>
          </div>
        </div>
        <aside class="bn-market-card">
          <div class="bn-card-head">
            <span>Market Snapshot</span>
            <small>${state.error ? "Veri hatasi" : "Canli akis"} / ${shortTime(state.lastRefreshAt)}</small>
          </div>
          ${marketTicker(topGainers)}
        </aside>
      </section>

      <section class="bn-stats">
        ${statCard("Gorunen", kpis.total, "filtre sonrasi")}
        ${statCard("Canli", kpis.live, "proxy kaynak")}
        ${statCard("Fib yakin", kpis.nearFib, "uyari esigi")}
        ${statCard("Pozitif / Negatif", `${kpis.positive}/${kpis.negative}`, `${state.filters.returnPeriod}A getiri`)}
      </section>

      <section class="bn-controls">
        <label>
          <span>Arama</span>
          <input id="bnSearch" value="${escapeHtml(state.filters.search)}" placeholder="NVDA, TSLA, MSFT..." />
        </label>
        <label>
          <span>Kategori</span>
          <select id="bnCategory">
            <option value="all">Tumu</option>
            ${getCategories().map((category) => `<option value="${escapeAttr(category)}" ${state.filters.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
          </select>
        </label>
        <label>
          <span>Siralama</span>
          <select id="bnSort">
            ${sortOption("fibDistancePct", "asc", "Fib'e en yakin")}
            ${sortOption("return1", "desc", "1A en guclu")}
            ${sortOption("score", "desc", "Genel skor")}
            ${sortOption("highRisk", "desc", "Risk en yuksek")}
          </select>
        </label>
      </section>

      <section class="bn-grid">
        <div class="bn-table-card">
          <div class="bn-card-head">
            <span>Markets</span>
            <small>${rows.length} hisse</small>
          </div>
          ${marketTable(rows)}
        </div>
        <aside class="bn-side">
          ${detailCard(selected)}
          <div class="bn-table-card compact">
            <div class="bn-card-head"><span>Risk Radar</span><small>top 5</small></div>
            ${sideList(riskRows, "risk")}
          </div>
        </aside>
      </section>
    </main>
  `;

  wire(actions);
}

function statCard(label, value, hint) {
  return `<article class="bn-stat"><span>${label}</span><strong>${value}</strong><small>${hint}</small></article>`;
}

function marketTicker(rows) {
  return `<div class="bn-ticker">${rows.map((row) => `
    <button type="button" data-symbol="${escapeAttr(row.symbol)}">
      ${logo(row)}
      <span><b>${row.symbol}</b><small>${fmtPct(row.momentum1m)}</small></span>
    </button>
  `).join("")}</div>`;
}

function marketTable(rows) {
  if (!rows.length) return `<div class="bn-empty">Filtreye uygun hisse yok.</div>`;
  return `
    <table class="bn-table">
      <thead>
        <tr>
          <th>Pair</th>
          <th>Last Price</th>
          <th>Fib Target</th>
          <th>Fib Distance</th>
          <th>1A</th>
          <th>Risk</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr data-symbol="${escapeAttr(row.symbol)}" class="${row.symbol === state.selectedSymbol ? "selected" : ""}">
            <td><div class="bn-pair">${logo(row)}<span><b>${row.symbol}</b><small>${escapeHtml(row.company)}</small></span></div></td>
            <td class="num">${fmtUsd(row.price)}</td>
            <td class="num">${fmtUsd(row.fibTarget)}</td>
            <td class="${Number(row.fibDistancePct) >= 0 ? "up" : "down"}">${fmtPct(row.fibDistancePct)}</td>
            <td class="${Number(row.momentum1m) >= 0 ? "up" : "down"}">${fmtPct(row.momentum1m)}</td>
            <td>${riskPill(row)}</td>
            <td><button class="bn-row-action" type="button" data-symbol="${escapeAttr(row.symbol)}">Detay</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function detailCard(row) {
  if (!row) return `<div class="bn-detail"><h2>Detay</h2><p>Secili hisse yok.</p></div>`;
  return `
    <div class="bn-detail">
      <div class="bn-detail-head">
        <div class="bn-pair">${logo(row)}<span><b>${row.symbol}</b><small>${escapeHtml(row.company)}</small></span></div>
        <span class="bn-status ${row.status}">${row.status}</span>
      </div>
      <strong class="bn-price">${fmtUsd(row.price)}</strong>
      <small class="bn-muted">Fib hedef ${fmtUsd(row.fibTarget)} / ${fmtPct(row.fibDistancePct)}</small>
      <div class="bn-chart">${chart(row)}</div>
      <div class="bn-metrics">
        <span><small>1A</small><b class="${Number(row.momentum1m) >= 0 ? "up" : "down"}">${fmtPct(row.momentum1m)}</b></span>
        <span><small>3A</small><b class="${Number(row.momentum3m) >= 0 ? "up" : "down"}">${fmtPct(row.momentum3m)}</b></span>
        <span><small>12A</small><b class="${Number(row.momentum12m) >= 0 ? "up" : "down"}">${fmtPct(row.momentum12m)}</b></span>
        <span><small>Skor</small><b>${Math.round(Number(row.score || 0))}</b></span>
      </div>
    </div>
  `;
}

function sideList(rows, mode) {
  return `<div class="bn-side-list">${rows.map((row) => `
    <button type="button" data-symbol="${escapeAttr(row.symbol)}">
      ${logo(row)}
      <span><b>${row.symbol}</b><small>${mode === "risk" ? `Risk ${Math.round(row.riskScore || 0)}` : fmtPct(row.momentum1m)}</small></span>
      <i>${fmtPct(row.fibDistancePct)}</i>
    </button>
  `).join("")}</div>`;
}

function chart(row) {
  const points = getHistory(row.symbol, "1d", "5m");
  const values = points.map((point) => Number(point.close ?? point.price)).filter(Number.isFinite);
  if (values.length < 2) return `<div class="bn-chart-empty">Grafik verisi bekleniyor</div>`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const path = values.map((value, index) => {
    const x = (index / (values.length - 1)) * 1000;
    const y = 170 - ((value - min) / span) * 140;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const up = values.at(-1) >= values[0];
  return `<svg viewBox="0 0 1000 190" preserveAspectRatio="none"><path class="area ${up ? "up" : "down"}" d="${path} L1000 190 L0 190 Z"></path><path class="line ${up ? "up" : "down"}" d="${path}"></path></svg>`;
}

function riskPill(row) {
  const label = row.riskLevel === "high" ? "Yuksek" : row.riskLevel === "medium" ? "Orta" : "Dusuk";
  return `<span class="bn-risk ${row.riskLevel}">${label}</span>`;
}

function logo(row) {
  const src = `${PROXY_ROOT}/api/logo/${encodeURIComponent(row.symbol)}?v=binance2`;
  return `<span class="bn-logo"><img src="${escapeAttr(src)}" alt="" /></span>`;
}

function sortOption(sortBy, sortDir, label) {
  const value = `${sortBy}:${sortDir}`;
  const selected = state.filters.sortBy === sortBy && state.filters.sortDir === sortDir ? "selected" : "";
  return `<option value="${value}" ${selected}>${label}</option>`;
}

function wire(actions) {
  document.getElementById("bnRefresh")?.addEventListener("click", actions.refreshAll);
  document.getElementById("bnSearch")?.addEventListener("input", (event) => actions.setSearch(event.target.value));
  document.getElementById("bnCategory")?.addEventListener("change", (event) => actions.setCategory(event.target.value));
  document.getElementById("bnSort")?.addEventListener("change", (event) => {
    const [sortBy, sortDir] = event.target.value.split(":");
    actions.setSort(sortBy, sortDir);
  });
  document.getElementById("bnSortFib")?.addEventListener("click", () => actions.setSort("fibDistancePct", "asc"));
  document.getElementById("bnSortMomentum")?.addEventListener("click", () => actions.setSort("return1", "desc"));
  document.querySelectorAll("[data-symbol]").forEach((element) => {
    element.addEventListener("click", () => actions.selectSymbol(element.dataset.symbol));
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}
