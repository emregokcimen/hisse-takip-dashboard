export const PROXY_ROOT = location.hostname === "host.docker.internal"
  ? "http://host.docker.internal:8766"
  : "http://127.0.0.1:8766";

async function fetchJson(path, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PROXY_ROOT + path, {
      cache: "no-store",
      signal: controller.signal
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) {
      throw new Error(json?.message || `HTTP ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function getHealth() {
  return fetchJson("/api/health", 4000);
}

export async function getStatus() {
  return fetchJson("/api/status", 5000);
}

export async function getSnapshots(symbols) {
  const query = encodeURIComponent(symbols.join(","));
  const json = await fetchJson(`/api/snapshots?symbols=${query}`, 20000);
  return json.data || [];
}

export async function getSignals(symbols, alertThreshold = 0.5) {
  const query = encodeURIComponent(symbols.join(","));
  const json = await fetchJson(`/api/signals?symbols=${query}&alertThreshold=${encodeURIComponent(alertThreshold)}`, 25000);
  return json.data || [];
}

export async function getHistory(symbol, range = "1d", interval = "5m") {
  const json = await fetchJson(`/api/history/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, 10000);
  return json.data?.points || [];
}

export async function getPerformance(symbol) {
  const json = await fetchJson(`/api/performance/${encodeURIComponent(symbol)}`, 12000);
  return json.data;
}

export async function getNews(symbol) {
  const json = await fetchJson(`/api/news/${encodeURIComponent(symbol)}`, 12000);
  return json.data;
}

export async function getAnalysis(symbol) {
  const json = await fetchJson(`/api/analysis/${encodeURIComponent(symbol)}`, 12000);
  return json.data;
}

export async function getNasdaqUniverse(query = "", limit = 500, force = false) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (limit) params.set("limit", String(limit));
  if (force) params.set("force", "1");
  const path = `/api/nasdaq-universe${params.toString() ? `?${params}` : ""}`;
  try {
    const json = await fetchJson(path, 25000);
    return json.data;
  } catch (error) {
    return getCachedNasdaqUniverse(query, limit, error);
  }
}

async function getCachedNasdaqUniverse(query, limit, originalError) {
  const response = await fetch("/nasdaq-universe-cache.json", { cache: "no-store" });
  if (!response.ok) throw originalError;
  const cached = await response.json();
  const rows = Array.isArray(cached?.data) ? cached.data : [];
  const q = String(query || "").trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) => String(row.symbol || "").toLowerCase().includes(q) || String(row.company || "").toLowerCase().includes(q))
    : rows;
  return {
    rows: filtered.slice(0, Math.max(1, Math.min(6000, Number(limit) || 500))),
    count: Number(cached.count || rows.length),
    returned: Math.min(filtered.length, Number(limit) || 500),
    source: `${cached.source || "NasdaqTrader"} yerel cache`,
    savedAt: cached.savedAt || null,
    stale: true,
    warning: `Canlı Nasdaq senkronu kullanılamadı: ${originalError.message}. Yerel cache gösteriliyor.`
  };
}
