const crypto = require("crypto");
const { createMatrixAdminStore } = require("./matrix-admin-store.cjs");

const SETTINGS_KEY = "admin.settings";
const AUTH_KEY = "admin.auth";
const PROVIDERS_KEY = "admin.providers";
const LLM_KEY = "admin.llm";
const JOB_STATE_KEY = "admin.jobs";
const SESSION_TTL_MS = 12 * 60 * 60_000;
const SECRET_KEY_PATTERN = /(authorization|api[-_]key|key|secret|token|password)$/i;

function createMatrixAdminFoundation(options) {
  const {
    dataDir,
    dbPath,
    DatabaseSync,
    env = process.env,
    sourcePriority = [],
    runtime = {},
    jobs = [],
    fetchImpl = globalThis.fetch,
    now = () => Date.now()
  } = options;

  const store = createMatrixAdminStore({ dataDir, dbPath, DatabaseSync, now });
  const defaults = createDefaults({ env, sourcePriority, runtime, now });
  seedDefaults(store, defaults, now, env);

  return {
    storage: {
      driver: store.driver,
      path: store.storagePath
    },
    async login({ username, password, ipAddress, userAgent }) {
      store.pruneSessions(now());
      const auth = getAuthConfig(store);
      const normalizedUser = String(username || "").trim();
      const normalizedPassword = String(password || "");
      if (!normalizedUser || !normalizedPassword || normalizedUser !== auth.username || !verifyPassword(normalizedPassword, auth.salt, auth.hash)) {
        addAudit(store, {
          actor: normalizedUser || "anonymous",
          action: "admin.login",
          status: "failed",
          detail: {
            ipAddress,
            userAgent,
            reason: "invalid_credentials"
          }
        }, now);
        const error = new Error("Invalid admin credentials");
        error.status = 401;
        throw error;
      }
      const session = {
        token: crypto.randomBytes(24).toString("hex"),
        username: auth.username,
        roles: ["admin"],
        issuedAt: now(),
        expiresAt: now() + SESSION_TTL_MS,
        lastSeenAt: now(),
        ipAddress: ipAddress || "",
        userAgent: userAgent || ""
      };
      store.setSession(session);
      addAudit(store, {
        actor: auth.username,
        action: "admin.login",
        status: "success",
        detail: {
          ipAddress,
          userAgent
        }
      }, now);
      return {
        user: presentUser(auth),
        session: presentSession(session)
      };
    },
    async logout(token, actor = "admin") {
      if (!token) {
        const error = new Error("Admin session token is required");
        error.status = 401;
        throw error;
      }
      store.deleteSession(token);
      addAudit(store, {
        actor,
        action: "admin.logout",
        status: "success",
        detail: {}
      }, now);
      return { loggedOut: true };
    },
    requireSession(token) {
      store.pruneSessions(now());
      if (!token) {
        const error = new Error("Admin session token is required");
        error.status = 401;
        throw error;
      }
      const session = store.getSession(token);
      if (!session || Number(session.expiresAt) <= now()) {
        if (session.token) store.deleteSession(session.token);
        const error = new Error("Admin session is not valid");
        error.status = 401;
        throw error;
      }
      session.lastSeenAt = now();
      store.setSession(session);
      return session;
    },
    getMe(token) {
      const session = this.requireSession(token);
      return {
        authenticated: true,
        user: presentUser(getAuthConfig(store)),
        session: presentSession(session),
        storage: {
          driver: store.driver,
          path: store.storagePath
        }
      };
    },
    getSettings() {
      return presentSettings(store);
    },
    updateSettings(payload, actor = "admin") {
      const current = store.getRecord(SETTINGS_KEY, defaults.settings);
      const currentAuth = getAuthConfig(store);
      const next = mergeConfig(current, pickSettingsPayload(payload));
      next.updatedAt = now();
      store.setRecord(SETTINGS_KEY, next);

      let authChanged = false;
      const incomingAuth = payload.auth && typeof payload.auth === "object" ? payload.auth : null;
      if (incomingAuth) {
        const nextAuth = {
          ...currentAuth,
          username: String(incomingAuth.username || currentAuth.username || "admin").trim() || currentAuth.username || "admin"
        };
        const nextPassword = typeof incomingAuth.password === "string" ? incomingAuth.password : "";
        if (nextPassword) {
          nextAuth.salt = crypto.randomBytes(16).toString("hex");
          nextAuth.hash = hashPassword(nextPassword, nextAuth.salt);
          nextAuth.passwordSource = "api";
          nextAuth.isDefaultPassword = false;
          nextAuth.lastRotatedAt = now();
          authChanged = true;
        } else if (nextAuth.username !== currentAuth.username) {
          nextAuth.lastRotatedAt = currentAuth.lastRotatedAt || now();
          authChanged = true;
        }
        if (authChanged) {
          store.setRecord(AUTH_KEY, nextAuth);
        }
      }

      addAudit(store, {
        actor,
        action: "admin.settings.update",
        status: "success",
        detail: {
          changedAuth: authChanged,
          payload: maskSensitive(payload)
        }
      }, now);
      return presentSettings(store);
    },
    getProviders() {
      return presentProviders(store);
    },
    updateProviders(payload, actor = "admin") {
      const current = store.getRecord(PROVIDERS_KEY, defaults.providers);
      const incoming = normalizeProvidersPayload(payload, current);
      const next = {
        updatedAt: now(),
        providers: incoming.providers
      };
      store.setRecord(PROVIDERS_KEY, next);
      addAudit(store, {
        actor,
        action: "admin.providers.update",
        status: "success",
        detail: {
          providers: incoming.providers.map((provider) => ({ id: provider.id, enabled: Boolean(provider.enabled), priority: provider.priority }))
        }
      }, now);
      return presentProviders(store);
    },
    async testProviders(payload, actor = "admin") {
      const stored = store.getRecord(PROVIDERS_KEY, defaults.providers);
      const target = normalizeProvidersPayload(payload, stored);
      const results = [];
      for (const provider of target.providers) {
        if (payload.providerId && provider.id !== payload.providerId) continue;
        const headers = {
          ...(provider.headers || {})
        };
        if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
        results.push(await runHttpTest({
          id: provider.id,
          label: provider.label || provider.id,
          url: provider.testUrl || provider.baseUrl,
          timeoutMs: provider.timeoutMs || 5000,
          headers,
          fetchImpl
        }));
      }
      addAudit(store, {
        actor,
        action: "admin.providers.test",
        status: results.every((item) => item.ok) ? "success" : "warning",
        detail: {
          providerId: payload.providerId || null,
          results: maskSensitive(results)
        }
      }, now);
      return {
        results,
        testedAt: now()
      };
    },
    getLlm() {
      return presentLlm(store);
    },
    getInternalSettings() {
      return store.getRecord(SETTINGS_KEY, defaults.settings);
    },
    getInternalLlm() {
      return store.getRecord(LLM_KEY, defaults.llm);
    },
    recordResearchSnapshot(payload) {
      const snapshot = sanitizeResearchSnapshot(payload, now);
      if (!snapshot.symbol) {
        const error = new Error("Research snapshot symbol is required");
        error.status = 400;
        throw error;
      }
      return store.setResearchSnapshot(snapshot.symbol, snapshot);
    },
    listResearchSnapshots(limit = 10) {
      return store.listResearchSnapshots(limit).map(presentResearchSnapshotSummary);
    },
    updateLlm(payload, actor = "admin") {
      const current = store.getRecord(LLM_KEY, defaults.llm);
      const next = normalizeLlmPayload(payload, current);
      next.updatedAt = now();
      store.setRecord(LLM_KEY, next);
      addAudit(store, {
        actor,
        action: "admin.llm.update",
        status: "success",
        detail: {
          config: maskSensitive(next)
        }
      }, now);
      return presentLlm(store);
    },
    async testLlm(payload, actor = "admin") {
      const stored = store.getRecord(LLM_KEY, defaults.llm);
      const config = normalizeLlmPayload(payload, stored);
      const testUrl = resolveLlmTestUrl(config);
      if (!testUrl) {
        const error = new Error("LLM config needs testUrl or baseUrl");
        error.status = 400;
        throw error;
      }
      const headers = {
        ...(config.headers || {})
      };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
      const result = await runHttpTest({
        id: config.provider || "llm",
        label: config.model || "llm",
        url: testUrl,
        timeoutMs: config.timeoutMs || 10000,
        headers,
        fetchImpl
      });
      addAudit(store, {
        actor,
        action: "admin.llm.test",
        status: result.ok ? "success" : "warning",
        detail: {
          config: maskSensitive({ provider: config.provider, model: config.model, testUrl }),
          result
        }
      }, now);
      return {
        ...result,
        config: maskSensitive({
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
          testUrl
        }),
        testedAt: now()
      };
    },
    listJobs() {
      const states = store.getRecord(JOB_STATE_KEY, {});
      return jobs.map((job) => ({
        id: job.id,
        name: job.name,
        description: job.description,
        manualOnly: job.manualOnly !== false,
        lastRunAt: states[job.id].lastRunAt || null,
        lastStatus: states[job.id].lastStatus || "idle",
        lastSummary: states[job.id].lastSummary || null
      }));
    },
    async runJob(payload, actor = "admin") {
      const jobId = String(payload.jobId || "").trim();
      const job = jobs.find((item) => item.id === jobId);
      if (!job) {
        const error = new Error(`Unknown admin job: ${jobId || "missing"}`);
        error.status = 404;
        throw error;
      }
      const startedAt = now();
      try {
        const result = await job.run(payload.payload || {});
        const summary = summarizeJobResult(result);
        const states = store.getRecord(JOB_STATE_KEY, {});
        states[job.id] = {
          lastRunAt: startedAt,
          lastStatus: "success",
          lastSummary: summary
        };
        store.setRecord(JOB_STATE_KEY, states);
        addAudit(store, {
          actor,
          action: "admin.jobs.run",
          status: "success",
          detail: {
            jobId: job.id,
            summary
          }
        }, now);
        return {
          jobId: job.id,
          startedAt,
          finishedAt: now(),
          status: "success",
          result
        };
      } catch (error) {
        const states = store.getRecord(JOB_STATE_KEY, {});
        states[job.id] = {
          lastRunAt: startedAt,
          lastStatus: "failed",
          lastSummary: error.message
        };
        store.setRecord(JOB_STATE_KEY, states);
        addAudit(store, {
          actor,
          action: "admin.jobs.run",
          status: "failed",
          detail: {
            jobId: job.id,
            message: error.message
          }
        }, now);
        throw error;
      }
    },
    async clearCache(payload, actor = "admin") {
      const cacheHandlers = runtime.cacheHandlers || {};
      if (typeof cacheHandlers.clear !== "function") {
        const error = new Error("Cache clear handler is not configured");
        error.status = 500;
        throw error;
      }
      const scope = payload.scope || "all";
      const result = await cacheHandlers.clear(scope);
      addAudit(store, {
        actor,
        action: "admin.cache.clear",
        status: "success",
        detail: {
          scope,
          result
        }
      }, now);
      return {
        scope,
        clearedAt: now(),
        ...result
      };
    },
    listAudit(limit = 50) {
      return store.listAudit(limit).map((entry) => ({
        ...entry,
        detail: maskSensitive(entry.detail)
      }));
    },
    clearResearchSnapshots(actor = "admin") {
      const result = typeof store.clearResearchSnapshots === "function"
         ? store.clearResearchSnapshots()
        : { deleted: 0 };
      addAudit(store, {
        actor,
        action: "admin.research.clear",
        status: "success",
        detail: result
      }, now);
      return {
        clearedAt: now(),
        ...result
      };
    },
    getStatus() {
      const stats = store.getStats();
      return {
        storage: {
          driver: store.driver,
          path: store.storagePath
        },
        ...stats,
        researchSnapshots: {
          count: Number(stats.researchSnapshotCount || 0),
          latest: this.listResearchSnapshots(5)
        }
      };
    }
  };
}

function createDefaults({ env, sourcePriority, runtime, now }) {
  const createdAt = now();
  return {
    settings: {
      timezone: runtime.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Istanbul",
      marketLocale: runtime.marketLocale || "en-US",
      marketDataMode: "proxy-first",
      staleThresholdSec: runtime.staleThresholdSec || 72 * 60 * 60,
      llmResearchEnabled: false,
      paidProvidersEnabled: false,
      language: "tr",
      refreshIntervalsSec: {
        snapshots: 60,
        signals: 300,
        research: 900,
        nasdaqUniverse: 86400
      },
      auditRetentionDays: 30,
      createdAt,
      updatedAt: createdAt
    },
    providers: {
      updatedAt: createdAt,
      providers: [
        {
          id: "yahoo-finance",
          label: "Yahoo Finance",
          enabled: sourcePriority.includes("Yahoo Finance"),
          priority: sourcePriority.indexOf("Yahoo Finance") + 1 || 1,
          baseUrl: "https://query1.finance.yahoo.com",
          testUrl: "https://query1.finance.yahoo.com/v8/finance/chart/NVDA?range=1d&interval=1d",
          timeoutMs: 6000
        },
        {
          id: "stooq",
          label: "Stooq",
          enabled: sourcePriority.includes("Stooq"),
          priority: sourcePriority.indexOf("Stooq") + 1 || 2,
          baseUrl: "https://stooq.com",
          testUrl: "https://stooq.com/q/d/l/s=nvda.us&i=d",
          timeoutMs: 6000
        },
        {
          id: "fvt",
          label: "FVT",
          enabled: sourcePriority.includes("FVT"),
          priority: sourcePriority.indexOf("FVT") + 1 || 3,
          baseUrl: "https://fvt.com.tr/api",
          testUrl: "https://fvt.com.tr/api/stocks?yabanci=1&includeLive=1&limit=5",
          timeoutMs: 6000
        },
        {
          id: "google-finance",
          label: "Google Finance",
          enabled: sourcePriority.includes("Google Finance"),
          priority: sourcePriority.indexOf("Google Finance") + 1 || 4,
          baseUrl: "https://www.google.com/finance",
          testUrl: "https://www.google.com/finance",
          timeoutMs: 6000
        },
        {
          id: "nasdaq",
          label: "Nasdaq Universe",
          enabled: true,
          priority: 1,
          baseUrl: "https://api.nasdaq.com/api/screener/stocks",
          testUrl: "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5&offset=0&exchange=nasdaq",
          timeoutMs: 8000
        }
      ]
    },
    llm: {
      updatedAt: createdAt,
      enabled: false,
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
      baseUrl: "",
      apiKey: "",
      systemPrompt: "Matrix V2 admin analysis",
      timeoutMs: 10000,
      headers: {}
    }
  };
}

function seedDefaults(store, defaults, now, env) {
  const auth = store.getRecord(AUTH_KEY, null);
  const envUsername = env.MATRIX_ADMIN_USERNAME;
  const envPassword = env.MATRIX_ADMIN_PASSWORD;

  if (!auth) {
    const salt = crypto.randomBytes(16).toString("hex");
    const password = String(envPassword || "matrix-local-admin");
    store.setRecord(AUTH_KEY, {
      username: String(envUsername || "admin").trim() || "admin",
      salt,
      hash: hashPassword(password, salt),
      passwordSource: envPassword ? "env" : "default",
      isDefaultPassword: !envPassword,
      lastRotatedAt: now()
    });
  } else if (envPassword || envUsername) {
    const next = { ...auth };
    if (envUsername) next.username = String(envUsername).trim() || next.username || "admin";
    if (envPassword) {
      next.salt = crypto.randomBytes(16).toString("hex");
      next.hash = hashPassword(String(envPassword), next.salt);
      next.passwordSource = "env";
      next.isDefaultPassword = false;
      next.lastRotatedAt = now();
    }
    store.setRecord(AUTH_KEY, next);
  }

  if (!store.getRecord(SETTINGS_KEY, null)) store.setRecord(SETTINGS_KEY, defaults.settings);
  if (!store.getRecord(PROVIDERS_KEY, null)) store.setRecord(PROVIDERS_KEY, defaults.providers);
  if (!store.getRecord(LLM_KEY, null)) store.setRecord(LLM_KEY, defaults.llm);
  if (!store.getRecord(JOB_STATE_KEY, null)) store.setRecord(JOB_STATE_KEY, {});
}

function getAuthConfig(store) {
  const auth = store.getRecord(AUTH_KEY, {});
  return {
    username: String(auth.username || "admin"),
    salt: String(auth.salt || ""),
    hash: String(auth.hash || ""),
    passwordSource: auth.passwordSource || "unknown",
    isDefaultPassword: Boolean(auth.isDefaultPassword),
    lastRotatedAt: Number(auth.lastRotatedAt) || null
  };
}

function presentUser(auth) {
  return {
    username: auth.username,
    roles: ["admin"],
    passwordSource: auth.passwordSource,
    isDefaultPassword: Boolean(auth.isDefaultPassword),
    lastRotatedAt: auth.lastRotatedAt || null
  };
}

function presentSession(session) {
  return {
    token: session.token,
    issuedAt: session.issuedAt,
    expiresAt: session.expiresAt,
    lastSeenAt: session.lastSeenAt
  };
}

function presentSettings(store) {
  const settings = store.getRecord(SETTINGS_KEY, {});
  const auth = getAuthConfig(store);
  return {
    ...settings,
    auth: {
      username: auth.username,
      passwordConfigured: Boolean(auth.hash),
      passwordSource: auth.passwordSource,
      isDefaultPassword: Boolean(auth.isDefaultPassword),
      lastRotatedAt: auth.lastRotatedAt
    },
    storage: {
      driver: store.driver,
      path: store.storagePath
    }
  };
}

function presentProviders(store) {
  return maskSensitive(store.getRecord(PROVIDERS_KEY, { updatedAt: 0, providers: [] }));
}

function presentLlm(store) {
  return maskSensitive(store.getRecord(LLM_KEY, {}));
}

function normalizeProvidersPayload(payload, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : { updatedAt: 0, providers: [] };
  const existingById = new Map((Array.isArray(base.providers) ? base.providers : [])
    .filter((provider) => provider && typeof provider === "object")
    .map((provider) => [normalizeProviderId(provider.id || provider.label), provider]));
  const incomingProviders = Array.isArray(payload.providers)
     ? payload.providers
    : Array.isArray(payload)
       ? payload
      : Array.isArray(base.providers)
         ? base.providers
        : [];
  const providers = incomingProviders
    .filter((provider) => provider && typeof provider === "object")
    .map((provider, index) => {
      const id = normalizeProviderId(provider.id || provider.label || `provider-${index + 1}`);
      const existing = existingById.get(id) || {};
      return {
        id,
        label: String(provider.label || provider.id || `Provider ${index + 1}`).trim(),
        enabled: provider.enabled !== false,
        priority: Number(provider.priority) || index + 1,
        baseUrl: String(provider.baseUrl || "").trim(),
        testUrl: String(provider.testUrl || "").trim(),
        timeoutMs: Math.max(1000, Number(provider.timeoutMs) || 5000),
        headers: sanitizeObject(provider.headers),
        apiKey: preserveSensitiveValue(existing.apiKey, provider.apiKey),
        apiSecret: preserveSensitiveValue(existing.apiSecret, provider.apiSecret),
        notes: String(provider.notes || "").trim()
      };
    });
  return {
    updatedAt: Number(base.updatedAt) || 0,
    providers
  };
}

function normalizeProviderId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLlmPayload(payload, fallback) {
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const incoming = payload && typeof payload === "object" ? payload : {};
  return {
    enabled: incoming.enabled == null ? Boolean(base.enabled) : Boolean(incoming.enabled),
    provider: String(incoming.provider || base.provider || "openai-compatible").trim(),
    model: String(incoming.model || base.model || "gpt-4.1-mini").trim(),
    baseUrl: String(incoming.baseUrl || base.baseUrl || "").trim(),
    testUrl: String(incoming.testUrl || base.testUrl || "").trim(),
    apiKey: preserveSensitiveValue(base.apiKey, incoming.apiKey),
    systemPrompt: String(incoming.systemPrompt || base.systemPrompt || "").trim(),
    timeoutMs: Math.max(1000, Number(incoming.timeoutMs) || Number(base.timeoutMs) || 10000),
    headers: sanitizeObject(mergeConfig(base.headers || {}, incoming.headers || {})),
    temperature: incoming.temperature == null ? Number(base.temperature ? 0) : Number(incoming.temperature)
  };
}

function pickSettingsPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const next = {};
  if (source.timezone != null) next.timezone = String(source.timezone).trim();
  if (source.marketLocale != null) next.marketLocale = String(source.marketLocale).trim();
  if (source.marketDataMode != null) next.marketDataMode = String(source.marketDataMode).trim();
  if (source.language != null) next.language = String(source.language).trim();
  if (source.llmResearchEnabled != null) next.llmResearchEnabled = Boolean(source.llmResearchEnabled);
  if (source.paidProvidersEnabled != null) next.paidProvidersEnabled = Boolean(source.paidProvidersEnabled);
  if (source.staleThresholdSec != null) next.staleThresholdSec = Math.max(300, Number(source.staleThresholdSec) || 300);
  if (source.auditRetentionDays != null) next.auditRetentionDays = Math.max(1, Number(source.auditRetentionDays) || 30);
  if (source.refreshIntervalsSec && typeof source.refreshIntervalsSec === "object") {
    next.refreshIntervalsSec = {};
    for (const [key, value] of Object.entries(source.refreshIntervalsSec)) {
      next.refreshIntervalsSec[key] = Math.max(1, Number(value) || 1);
    }
  }
  return next;
}

function mergeConfig(current, incoming, parentKey = "") {
  if (Array.isArray(incoming)) return incoming.map((item) => clone(item));
  if (!incoming || typeof incoming !== "object") return incoming;
  const next = clone(current && typeof current === "object" ? current : {});
  for (const [key, value] of Object.entries(incoming)) {
    const qualifiedKey = parentKey ? `${parentKey}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = mergeConfig(next[key], value, qualifiedKey);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      next[key] = preserveSensitiveValue(next[key], value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function preserveSensitiveValue(existingValue, incomingValue) {
  if (incomingValue == null) return existingValue || "";
  const normalized = String(incomingValue);
  if (!normalized) return "";
  if (isMaskedValue(normalized) && existingValue) return existingValue;
  return normalized;
}

function isMaskedValue(value) {
  return /^\*{6,}/.test(String(value || ""));
}

function sanitizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, String(entry)]));
}

function resolveLlmTestUrl(config) {
  if (config.testUrl) return config.testUrl;
  if (!config.baseUrl) return "";
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  if (config.provider === "openai-compatible") return `${baseUrl}/models`;
  return baseUrl;
}

async function runHttpTest({ id, label, url, timeoutMs, headers, fetchImpl }) {
  if (!fetchImpl || !url) {
    return {
      id,
      label,
      ok: false,
      status: 0,
      latencyMs: 0,
      testUrl: url || "",
      message: url ? "Fetch implementation is not available" : "Test URL is not configured"
    };
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "MatrixV2Admin/1.0",
        ...(headers || {})
      },
      signal: controller.signal
    });
    const message = response.ok ? "ok" : `HTTP ${response.status}`;
    return {
      id,
      label,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      testUrl: url,
      message
    };
  } catch (error) {
    return {
      id,
      label,
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      testUrl: url,
      message: error.name === "AbortError" ? "Request timed out" : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function addAudit(store, entry, now) {
  const auditEntry = {
    at: now(),
    actor: entry.actor || "system",
    action: entry.action || "unknown",
    status: entry.status || "info",
    detail: maskSensitive(entry.detail || {})
  };
  store.addAudit(auditEntry);
  applyAuditRetention(store, now);
}

function applyAuditRetention(store, now) {
  if (typeof store.pruneAudit !== "function") return;
  const settings = store.getRecord(SETTINGS_KEY, {});
  const retentionDays = Math.max(1, Number(settings.auditRetentionDays) || 30);
  const cutoff = now() - retentionDays * 24 * 60 * 60 * 1000;
  store.pruneAudit(cutoff);
}

function summarizeJobResult(result) {
  if (result == null) return "completed";
  if (typeof result === "string") return result.slice(0, 160);
  if (typeof result === "number" || typeof result === "boolean") return String(result);
  if (Array.isArray(result)) return `${result.length} item(s)`;
  const summary = Object.entries(result)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${truncateValue(value)}`);
  return summary.join(", ");
}

function sanitizeResearchSnapshot(payload, now) {
  const source = payload && typeof payload === "object" ? payload : {};
  const items = Array.isArray(source.items) ? source.items : [];
  const topNews = Array.isArray(source.topNews)
     ? source.topNews
    : Array.isArray(source.importantNews)
       ? source.importantNews
      : [];
  const sanitizedTopNews = topNews.map(sanitizeResearchNewsItem).slice(0, 5);
  return {
    symbol: String(source.symbol || "").trim().toUpperCase(),
    generatedAt: Math.max(0, Math.floor(Number(source.generatedAt) || now() / 1000)),
    price: finiteNumberOrNull(source.price),
    provider: truncateText(source.provider, 160),
    llmProvider: truncateText(source.llmProvider, 160),
    summaryTr: truncateText(source.summaryTr, 4000),
    impactScore: finiteNumberOrNull(source.impactScore),
    weeklySummary: truncateText(source.weeklySummary, 4000),
    provenance: sanitizePlainObject(source.provenance),
    source: sanitizePlainObject(source.source),
    technicalSummary: sanitizeResearchTechnicalSummary(source.technicalSummaryDetail  source.technicalSummary),
    riskSummary: sanitizeResearchRiskSummary(source.riskSummaryDetail  source.riskSummary),
    newsImpact: sanitizePlainObject(source.newsImpact),
    importantNews: sanitizedTopNews,
    topNews: sanitizedTopNews,
    itemCount: items.length,
    items: items.map(sanitizeResearchNewsItem).slice(0, 20),
    analyst: sanitizeResearchAnalyst(source.analyst)
  };
}

function presentResearchSnapshotSummary(snapshot) {
  const topNews = Array.isArray(snapshot.topNews) ? snapshot.topNews : [];
  return {
    symbol: String(snapshot.symbol || "").trim().toUpperCase(),
    generatedAt: Number(snapshot.generatedAt) || null,
    price: finiteNumberOrNull(snapshot.price),
    provider: truncateText(snapshot.provider, 160),
    llmProvider: truncateText(snapshot.llmProvider, 160),
    impactScore: finiteNumberOrNull(snapshot.impactScore),
    itemCount: Math.max(0, Number(snapshot.itemCount) || 0),
    latestHeadline: topNews[0].title || null,
    summaryTr: truncateText(snapshot.summaryTr, 240),
    weeklySummary: truncateText(snapshot.weeklySummary, 240),
    source: sanitizePlainObject(snapshot.source),
    provenance: sanitizePlainObject(snapshot.provenance)
  };
}

function truncateValue(value) {
  if (value == null) return "null";
  if (typeof value === "string") return value.slice(0, 40);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length}`;
  return Object.keys(value).slice(0, 4).join("|");
}

function sanitizeResearchNewsItem(item) {
  const source = item && typeof item === "object" ? item : {};
  return {
    title: truncateText(source.title, 280),
    publisher: truncateText(source.publisher, 160),
    link: sanitizeUrl(source.link),
    publishedAt: Number(source.publishedAt) || null,
    sentiment: truncateText(source.sentiment, 40),
    impactScore: finiteNumberOrNull(source.impactScore),
    turkishSummary: truncateText(source.turkishSummary, 1200),
    importanceReason: truncateText(source.importanceReason, 600),
    reactions: sanitizePlainObject(source.reactions)
  };
}

function sanitizeResearchAnalyst(analyst) {
  const source = analyst && typeof analyst === "object" ? analyst : {};
  return {
    available: Boolean(source.available),
    source: truncateText(source.source, 120),
    consensus: truncateText(source.consensus, 160),
    recommendation: truncateText(source.recommendation, 160),
    targetPrice: finiteNumberOrNull(source.targetPrice  source.analystTarget),
    currentPrice: finiteNumberOrNull(source.currentPrice),
    updatedAt: Number(source.updatedAt) || null,
    notes: truncateText(source.notes, 1200)
  };
}

function sanitizeResearchTechnicalSummary(summary) {
  if (typeof summary === "string") {
    return {
      signal: "",
      score: null,
      confidence: null,
      risk: "",
      reasons: [],
      triggerTags: [],
      indicatorSnapshot: {},
      text: truncateText(summary, 1200)
    };
  }
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    signal: truncateText(source.signal, 120),
    score: finiteNumberOrNull(source.score),
    confidence: finiteNumberOrNull(source.confidence),
    risk: truncateText(source.risk, 80),
    reasons: Array.isArray(source.reasons) ? source.reasons.map((item) => truncateText(item, 280)).slice(0, 10) : [],
    triggerTags: Array.isArray(source.triggerTags) ? source.triggerTags.map((item) => truncateText(item, 120)).slice(0, 10) : [],
    indicatorSnapshot: sanitizePlainObject(source.indicatorSnapshot),
    text: truncateText(source.text, 1200)
  };
}

function sanitizeResearchRiskSummary(summary) {
  if (typeof summary === "string") {
    return {
      level: "",
      riskScore: null,
      warnings: [],
      text: truncateText(summary, 1200)
    };
  }
  const source = summary && typeof summary === "object" ? summary : {};
  return {
    level: truncateText(source.level, 80),
    riskScore: finiteNumberOrNull(source.riskScore),
    warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => truncateText(item, 240)).slice(0, 10) : [],
    text: truncateText(source.text, 1200)
  };
}

function sanitizePlainObject(value, depth = 0) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  if (depth >= 2) return {};
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) {
      next[key] = entry;
      continue;
    }
    if (typeof entry === "string") {
      next[key] = truncateText(SECRET_KEY_PATTERN.test(key) ? createMask(entry) : entry, 400);
      continue;
    }
    if (typeof entry === "number" || typeof entry === "boolean") {
      next[key] = entry;
      continue;
    }
    if (Array.isArray(entry)) {
      next[key] = entry
        .slice(0, 10)
        .map((item) => typeof item === "string" ? truncateText(item, 200) : typeof item === "number" || typeof item === "boolean" ? item : null)
        .filter((item) => item != null);
      continue;
    }
    next[key] = sanitizePlainObject(entry, depth + 1);
  }
  return next;
}

function truncateText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}\u2026` : text;
}

function sanitizeUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return truncateText(text, 400);
  }
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password || ""), String(salt || ""), 120000, 32, "sha256").toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actual = hashPassword(password, salt);
  const expectedBuffer = Buffer.from(String(expectedHash || ""), "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length === 0 || expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function maskSensitive(value, key = "") {
  if (Array.isArray(value)) return value.map((item) => maskSensitive(item, key));
  if (!value || typeof value !== "object") {
    if (SECRET_KEY_PATTERN.test(key) && typeof value === "string") return createMask(value);
    return value;
  }
  const next = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(childKey) && typeof childValue === "string") {
      next[childKey] = createMask(childValue);
      continue;
    }
    next[childKey] = maskSensitive(childValue, childKey);
  }
  return next;
}

function createMask(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length <= 4) return "****";
  return `${"*".repeat(Math.max(8, text.length - 4))}${text.slice(-4)}`;
}

function clone(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createMatrixAdminFoundation,
  maskSensitive
};
