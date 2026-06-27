export const PROXY_ROOT = location.hostname === "host.docker.internal"
   ? "http://host.docker.internal:8766"
  : "http://127.0.0.1:8766";

async function fetchJson(path, timeoutMs = 10000, session = "") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(PROXY_ROOT + path, {
      cache: "no-store",
      signal: controller.signal,
      headers: session ? { "X-Admin-Session": session } : undefined
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json.success) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function sendJson(path, body = {}, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const response = await fetch(PROXY_ROOT + path, {
      method: options.method || "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.session ? { "X-Admin-Session": options.session } : {}),
        ...(options.headers || {})
      },
      body: JSON.stringify(body || {})
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json.success) {
      throw new Error(json.message || `HTTP ${response.status}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAdmin(path, session, timeoutMs = 10000) {
  return fetchJson(path, timeoutMs, session);
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
  return json.data.points || [];
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

export async function getResearch(symbol) {
  const json = await fetchJson(`/api/research/${encodeURIComponent(symbol)}`, 18000);
  return json.data;
}

export async function getNasdaqUniverse(query = "", limit = 500, force = false) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (limit) params.set("limit", String(limit));
  if (force) params.set("force", "1");
  const queryString = params.toString();
  const path = `/api/nasdaq-universe${queryString ? `?${queryString}` : ""}`;
  try {
    const json = await fetchJson(path, 25000);
    return json.data;
  } catch (error) {
    return getCachedNasdaqUniverse(query, limit, error);
  }
}

export async function adminLogin(username, password) {
  const json = await sendJson("/api/admin/login", { username, password }, { timeoutMs: 10000 });
  return json.data;
}

export async function adminLogout(session) {
  const json = await sendJson("/api/admin/logout", {}, { session, timeoutMs: 8000 });
  return json.data;
}

export async function getAdminMe(session) {
  const json = await fetchAdmin("/api/admin/me", session, 8000);
  return json.data;
}

export async function getAdminSettings(session) {
  const json = await fetchAdmin("/api/admin/settings", session, 8000);
  return json.data;
}

export async function saveAdminSettings(session, settings) {
  const json = await sendJson("/api/admin/settings", settings, { method: "PUT", session, timeoutMs: 10000 });
  return json.data;
}

export async function getAdminProviders(session) {
  const json = await fetchAdmin("/api/admin/providers", session, 8000);
  return json.data;
}

export async function saveAdminProviders(session, providers) {
  const json = await sendJson("/api/admin/providers", providers, { method: "PUT", session, timeoutMs: 10000 });
  return json.data;
}

export async function testAdminProvider(session, providerId, providers = []) {
  const path = providerId
     ? `/api/admin/providers/${encodeURIComponent(providerId)}/test`
    : "/api/admin/providers/test";
  const json = await sendJson(path, { providerId, providers }, { session, timeoutMs: 15000 });
  return json.data;
}

export async function getAdminLlm(session) {
  const json = await fetchAdmin("/api/admin/llm", session, 8000);
  return json.data;
}

export async function saveAdminLlm(session, llm) {
  const json = await sendJson("/api/admin/llm", llm, { method: "PUT", session, timeoutMs: 10000 });
  return json.data;
}

export async function testAdminLlm(session, llm = {}) {
  const json = await sendJson("/api/admin/llm/test", llm, { session, timeoutMs: 15000 });
  return json.data;
}

export async function getAdminJobs(session) {
  const json = await fetchAdmin("/api/admin/jobs", session, 8000);
  return json.data;
}

export async function runAdminJob(session, jobId) {
  const json = await sendJson(`/api/admin/jobs/${encodeURIComponent(jobId)}/run`, {}, { session, timeoutMs: 20000 });
  return json.data;
}

export async function getAdminCache(session) {
  const json = await fetchAdmin("/api/admin/cache", session, 8000);
  return json.data;
}

export async function clearAdminCache(session, scope = "all") {
  const json = await sendJson("/api/admin/cache/clear", { scope }, { session, timeoutMs: 12000 });
  return json.data;
}

export async function getAdminAudit(session, limit = 20) {
  const json = await fetchAdmin(`/api/admin/audit?limit=${encodeURIComponent(limit)}`, session, 8000);
  return json.data;
}

export async function getAdminResearchSnapshots(session, limit = 10) {
  const json = await fetchAdmin(`/api/admin/research-snapshots?limit=${encodeURIComponent(limit)}`, session, 8000);
  return json.data;
}

export async function clearAdminResearchSnapshots(session) {
  const json = await sendJson("/api/admin/research-snapshots/clear", {}, { session, timeoutMs: 12000 });
  return json.data;
}

export async function getAdminExport(session) {
  const json = await fetchAdmin("/api/admin/export?auditLimit=20&researchLimit=10", session, 10000);
  return json.data;
}

async function getCachedNasdaqUniverse(query, limit, originalError) {
  const response = await fetch("/nasdaq-universe-cache.json", { cache: "no-store" });
  if (!response.ok) throw originalError;
  const cached = await response.json();
  const rows = Array.isArray(cached.data) ? cached.data : [];
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
