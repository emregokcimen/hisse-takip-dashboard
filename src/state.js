import { STOCKS } from "./catalog.js";

import { computeSignal, defaultAlarmRules, evaluateAlarmRules } from "./signal-engine.js";

const SETTINGS_KEY = "hisse-dashboard-settings-v3";
const SNAPSHOT_KEY = "hisse-dashboard-last-snapshots-v3";
const INVESTMENT_PLANS_KEY = "hisse-dashboard-investment-plans-v1";
const CUSTOM_STOCKS_KEY = "hisse-dashboard-custom-stocks-v1";
const CUSTOM_CATEGORIES_KEY = "hisse-dashboard-custom-categories-v1";
const ALERT_RULES_KEY = "hisse-dashboard-alert-rules-v1";
const TRIGGERED_ALERTS_KEY = "hisse-dashboard-triggered-alerts-v1";

const defaultSettings = {
  filters: {
    search: "",
    category: "all",
    status: "all",
    fibOnly: false,
    favoritesOnly: false,
    returnPeriod: 12,
    sortBy: "fibDistancePct",
    sortDir: "asc",
    target: "all",
    signal: "all",
    news: "all"
  },
  ui: {
    theme: "dark",
    density: "comfortable",
    historyRange: "1d",
    historyInterval: "5m",
    alertThreshold: 0.5,
    detailTab: "grafik"
  },
  favorites: [],
  fibTargets: {},
  hiddenSymbols: []
};

const defaultInvestmentPlan = {
  note: "",
  entryPrice: null,
  buyZone: "",
  stopPrice: null,
  positionTag: "\u0130zle",
  shares: null,
  avgCost: null,
  journal: []
};

function readSettings() {
  try {
    const parsed = JSON.parse(readStorageItem(SETTINGS_KEY) || "null");
    if (!parsed) return structuredClone(defaultSettings);
    return {
      filters: { ...defaultSettings.filters, ...(parsed.filters || {}) },
      ui: { ...defaultSettings.ui, ...(parsed.ui || {}) },
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      fibTargets: sanitizeFibTargets(parsed.fibTargets),
      hiddenSymbols: Array.isArray(parsed.hiddenSymbols) ? parsed.hiddenSymbols.map((item) => String(item).toUpperCase()).filter(Boolean) : [],
      selectedSymbol: typeof parsed.selectedSymbol === "string" ? parsed.selectedSymbol.toUpperCase() : null
    };
  } catch {
    return structuredClone(defaultSettings);
  }
}

function readInvestmentPlans() {
  try {
    const parsed = JSON.parse(readStorageItem(INVESTMENT_PLANS_KEY) || "null");
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([symbol, plan]) => [String(symbol).toUpperCase(), sanitizeInvestmentPlan(plan)])
        .filter(([symbol]) => Boolean(symbol))
    );
  } catch {
    return {};
  }
}

function readCustomStocks() {
  try {
    const parsed = JSON.parse(readStorageItem(CUSTOM_STOCKS_KEY) || "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCustomStock).filter(Boolean);
  } catch {
    return [];
  }
}

function readCustomCategories() {
  try {
    const parsed = JSON.parse(readStorageItem(CUSTOM_CATEGORIES_KEY) || "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeCustomCategory).filter(Boolean);
  } catch {
    return [];
  }
}

function readAlertRules() {
  try {
    const parsed = JSON.parse(readStorageItem(ALERT_RULES_KEY) || "null");
    const rules = Array.isArray(parsed) ? parsed.map(sanitizeAlertRule).filter(Boolean) : defaultAlarmRules();
    return rules.length ? rules : defaultAlarmRules();
  } catch {
    return defaultAlarmRules();
  }
}

function readTriggeredAlerts() {
  try {
    const parsed = JSON.parse(readStorageItem(TRIGGERED_ALERTS_KEY) || "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeTriggeredAlert).filter(Boolean).slice(0, 120);
  } catch {
    return [];
  }
}

function sanitizeFibTargets(value) {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([symbol, target]) => [String(symbol).toUpperCase(), Number(target)])
      .filter(([symbol, target]) => symbol && Number.isFinite(target) && target > 0)
  );
}

function sanitizeInvestmentPlan(value) {
  const plan = value && typeof value === "object" ? value : {};
  return {
    note: sanitizeText(plan.note),
    entryPrice: sanitizeNumberOrNull(plan.entryPrice),
    buyZone: sanitizeText(plan.buyZone),
    stopPrice: sanitizeNumberOrNull(plan.stopPrice),
    positionTag: sanitizeText(plan.positionTag),
    shares: sanitizeNumberOrNull(plan.shares),
    avgCost: sanitizeNumberOrNull(plan.avgCost),
    journal: sanitizeJournalEntries(plan.journal)
  };
}

function sanitizeJournalEntries(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const entry = item && typeof item === "object" ? item : {};
      const id = sanitizeText(entry.id || `journal-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const type = sanitizeText(entry.type || "not");
      const date = sanitizeText(entry.date || new Date().toISOString().slice(0, 10));
      const price = sanitizeNumberOrNull(entry.price);
      const quantity = sanitizeNumberOrNull(entry.quantity);
      const note = sanitizeText(entry.note);
      if (!id || (!note && price === null && quantity === null)) return null;
      return { id, type, date, price, quantity, note };
    })
    .filter(Boolean)
    .slice(-100);
}

function sanitizeCustomStock(value) {
  const item = value && typeof value === "object" ? value : {};
  const symbol = String(item.symbol || "").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
  const company = sanitizeText(item.company || symbol);
  const category = sanitizeText(item.category);
  const fibTarget = Number(String(item.fibTarget ?? "").replace(",", "."));
  if (!symbol || !company || !category || !Number.isFinite(fibTarget) || fibTarget <= 0) return null;
  const logoInput = sanitizeText(item.logo || item.domain || "");
  const logo = normalizeLogoInput(logoInput);
  return {
    symbol,
    company,
    category,
    categoryDescription: sanitizeText(item.categoryDescription || category),
    fibTarget,
    logo,
    isCustom: true
  };
}

function normalizeLogoInput(value) {
  const raw = sanitizeText(value);
  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return raw;
  const domain = raw.replace(/^www\./i, "").replace(/\/.*$/, "");
  return domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : "";
}

function mergeStocks(baseStocks, customStocks, hiddenSymbols = new Set()) {
  const normalizedBase = baseStocks.map((stock) => ({
    ...stock,
    symbol: String(stock.symbol).toUpperCase(),
    fibTarget: Number(stock.fibTarget),
    isCustom: false
  })).filter((stock) => !hiddenSymbols.has(stock.symbol));
  const map = new Map(normalizedBase.map((stock) => [stock.symbol, stock]));
  for (const stock of customStocks) map.set(stock.symbol, stock);
  return Array.from(map.values());
}

function sanitizeText(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return fixEncoding(normalized);
}

function fixEncoding(value) {
  if (!/[\u00c2\u00c3\u00c4\u00c5]/.test(value)) return value;
  try {
    const bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i += 1) {
      bytes[i] = value.charCodeAt(i) & 0xff;
    }
    const decoded = new TextDecoder("utf-8").decode(bytes);
    if (!decoded.includes("\uFFFD") && /[\u00c0-\u00ff]/.test(decoded)) {
      return decoded;
    }
  } catch {
    // Preserve original text if UTF-8 fix cannot be parsed.
  }
  return value;
}

function sanitizeNumberOrNull(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function sanitizeCustomCategory(value) {
  return sanitizeText(value);
}

function sanitizeAlertRule(value) {
  const item = value && typeof value === "object" ? value : {};
  const type = sanitizeText(item.type || "target_near");
  const scope = ["all", "symbol", "category"].includes(item.scope) ? item.scope : "all";
  return {
    id: sanitizeText(item.id || `rule-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    name: sanitizeText(item.name || type),
    type,
    scope,
    symbol: sanitizeText(item.symbol).toUpperCase(),
    category: sanitizeText(item.category),
    threshold: sanitizeNumberOrNull(item.threshold),
    enabled: item.enabled !== false,
    muted: Boolean(item.muted),
    createdAt: Number(item.createdAt || Date.now())
  };
}

function sanitizeTriggeredAlert(value) {
  const item = value && typeof value === "object" ? value : {};
  const id = sanitizeText(item.id);
  const symbol = sanitizeText(item.symbol).toUpperCase();
  if (!id || !symbol) return null;
  return {
    id,
    ruleId: sanitizeText(item.ruleId),
    symbol,
    type: sanitizeText(item.type),
    title: sanitizeText(item.title),
    message: sanitizeText(item.message),
    severity: sanitizeText(item.severity || "info"),
    createdAt: Number(item.createdAt || Date.now()),
    acknowledged: Boolean(item.acknowledged)
  };
}

function readStorageItem(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key, value) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort in browser environments.
  }
}

const saved = readSettings();
const savedInvestmentPlans = readInvestmentPlans();
const savedCustomStocks = readCustomStocks();
const savedCustomCategories = readCustomCategories();
const savedAlertRules = readAlertRules();
const savedTriggeredAlerts = readTriggeredAlerts();
const savedHiddenSymbols = new Set(saved.hiddenSymbols || []);
const initialStocks = mergeStocks(STOCKS, savedCustomStocks, savedHiddenSymbols);
const initialSelectedSymbol = initialStocks.some((stock) => stock.symbol === saved.selectedSymbol)
  ? saved.selectedSymbol
  : initialStocks[0]?.symbol || null;

export const state = {
  stocks: initialStocks,
  customStocks: savedCustomStocks,
  customCategories: savedCustomCategories,
  snapshots: new Map(),
  histories: new Map(),
  performances: new Map(),
  news: new Map(),
  analysis: new Map(),
  alerts: new Set(),
  alertRules: savedAlertRules,
  triggeredAlerts: savedTriggeredAlerts,
  favorites: new Set(saved.favorites),
  fibTargets: saved.fibTargets,
  hiddenSymbols: savedHiddenSymbols,
  investmentPlans: savedInvestmentPlans,
  filters: saved.filters,
  ui: saved.ui,
  selectedSymbol: initialSelectedSymbol,
  catalogStatus: { kind: "idle", message: "" },
  nasdaqUniverse: [],
  nasdaqUniverseMeta: null,
  nasdaqUniverseStatus: { kind: "idle", message: "" },
  loading: true,
  proxyStatus: null,
  lastRefreshAt: null,
  error: null
};

loadOfflineSnapshots();

export function persistSettings() {
  writeStorageItem(SETTINGS_KEY, JSON.stringify({
    filters: state.filters,
    ui: state.ui,
    favorites: Array.from(state.favorites),
    fibTargets: state.fibTargets,
    hiddenSymbols: Array.from(state.hiddenSymbols),
    selectedSymbol: state.selectedSymbol
  }));
}

export function persistInvestmentPlans() {
  writeStorageItem(INVESTMENT_PLANS_KEY, JSON.stringify(state.investmentPlans));
}

export function persistCustomStocks() {
  writeStorageItem(CUSTOM_STOCKS_KEY, JSON.stringify(state.customStocks));
}

export function persistCustomCategories() {
  writeStorageItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(state.customCategories));
}

export function persistAlertRules() {
  writeStorageItem(ALERT_RULES_KEY, JSON.stringify(state.alertRules));
}

export function persistTriggeredAlerts() {
  writeStorageItem(TRIGGERED_ALERTS_KEY, JSON.stringify(state.triggeredAlerts));
}

export function persistSnapshots() {
  const payload = Array.from(state.snapshots.values()).filter((snapshot) => !snapshot.error);
  writeStorageItem(SNAPSHOT_KEY, JSON.stringify({ savedAt: Date.now(), data: payload }));
}

function loadOfflineSnapshots() {
  try {
    const parsed = JSON.parse(readStorageItem(SNAPSHOT_KEY) || "null");
    if (!Array.isArray(parsed.data)) return;
    for (const snapshot of parsed.data) {
      state.snapshots.set(snapshot.symbol, { ...snapshot, source: snapshot.source || "lastKnown", isStale: true, isLive: false });
    }
  } catch {
    // Offline cache is optional.
  }
}

export function mergeSnapshot(snapshot) {
  state.snapshots.set(snapshot.symbol, snapshot);
}

export function setHistory(symbol, range, interval, points) {
  state.histories.set(historyKey(symbol, range, interval), points);
}

export function getHistory(symbol, range = state.ui.historyRange, interval = state.ui.historyInterval) {
  return state.histories.get(historyKey(symbol, range, interval)) || [];
}

export function historyKey(symbol, range, interval) {
  return `${symbol}:${range}:${interval}`;
}

export function setPerformance(symbol, performance) {
  state.performances.set(symbol, performance);
}

export function setNews(symbol, news) {
  state.news.set(symbol, news);
}

export function setAnalysis(symbol, analysis) {
  state.analysis.set(symbol, analysis);
}

export function addAlertRule(input) {
  const rule = sanitizeAlertRule(input);
  state.alertRules = [rule, ...state.alertRules.filter((item) => item.id !== rule.id)];
  persistAlertRules();
  return rule;
}

export function updateAlertRule(id, patch) {
  const key = sanitizeText(id);
  state.alertRules = state.alertRules.map((rule) => rule.id === key ? sanitizeAlertRule({ ...rule, ...(patch || {}) }) : rule);
  persistAlertRules();
}

export function removeAlertRule(id) {
  const key = sanitizeText(id);
  state.alertRules = state.alertRules.filter((rule) => rule.id !== key);
  state.triggeredAlerts = state.triggeredAlerts.filter((alert) => alert.ruleId !== key);
  persistAlertRules();
  persistTriggeredAlerts();
}

export function acknowledgeAlert(id) {
  const key = sanitizeText(id);
  state.triggeredAlerts = state.triggeredAlerts.map((alert) => alert.id === key ? { ...alert, acknowledged: true } : alert);
  persistTriggeredAlerts();
}

export function clearTriggeredAlerts() {
  state.triggeredAlerts = [];
  state.alerts.clear();
  persistTriggeredAlerts();
}

export function evaluateStockAlerts(rows = getVisibleRows()) {
  const nextAlerts = [];
  for (const row of rows) {
    const alerts = evaluateAlarmRules(state.alertRules, { row, signal: row.signalDetail });
    for (const alert of alerts) {
      if (state.alerts.has(alert.id) || state.triggeredAlerts.some((item) => item.id === alert.id)) continue;
      state.alerts.add(alert.id);
      nextAlerts.push(alert);
    }
  }
  if (nextAlerts.length) {
    state.triggeredAlerts = [...nextAlerts, ...state.triggeredAlerts].slice(0, 120);
    persistTriggeredAlerts();
  }
  return nextAlerts;
}

export function getCategories() {
  return Array.from(new Set([
    ...state.stocks.map((stock) => stock.category),
    ...state.customCategories
  ].map((category) => sanitizeText(category)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
}

export function getSymbols() {
  return state.stocks.map((stock) => stock.symbol);
}

export function addCustomStock(input) {
  const stock = sanitizeCustomStock(input);
  if (!stock) return { ok: false, message: "Sembol, şirket, kategori ve Fib hedefi zorunlu." };
  state.hiddenSymbols.delete(stock.symbol);
  state.customStocks = [...state.customStocks.filter((item) => item.symbol !== stock.symbol), stock];
  state.stocks = mergeStocks(STOCKS, state.customStocks, state.hiddenSymbols);
  state.customCategories = Array.from(new Set([...state.customCategories, stock.category].map(sanitizeCustomCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  if (!state.selectedSymbol) state.selectedSymbol = stock.symbol;
  persistCustomStocks();
  persistCustomCategories();
  return { ok: true, stock };
}

export function addCustomCategory(input) {
  const category = sanitizeCustomCategory(input);
  if (!category) return { ok: false, message: "Kategori adı gerekli." };
  const exists = getCategories().some((item) => item.localeCompare(category, "tr", { sensitivity: "base" }) === 0);
  if (exists) return { ok: true, existed: true, category };
  state.customCategories = Array.from(new Set([...state.customCategories, category].map(sanitizeCustomCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  persistCustomCategories();
  return { ok: true, category };
}

export function renameCustomCategory(oldValue, nextValue) {
  const oldCategory = sanitizeCustomCategory(oldValue);
  const nextCategory = sanitizeCustomCategory(nextValue);
  if (!oldCategory || !nextCategory) return { ok: false, message: "Kategori adı gerekli." };
  const exists = getCategories().some((item) =>
    item.localeCompare(nextCategory, "tr", { sensitivity: "base" }) === 0
    && item.localeCompare(oldCategory, "tr", { sensitivity: "base" }) !== 0
  );
  if (exists) return { ok: false, message: "Bu kategori zaten var." };
  state.customCategories = Array.from(new Set(state.customCategories.map((category) =>
    category.localeCompare(oldCategory, "tr", { sensitivity: "base" }) === 0 ? nextCategory : category
  ).map(sanitizeCustomCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b, "tr"));
  state.customStocks = state.customStocks.map((stock) =>
    stock.category.localeCompare(oldCategory, "tr", { sensitivity: "base" }) === 0
       ? { ...stock, category: nextCategory, categoryDescription: nextCategory }
      : stock
  );
  state.stocks = mergeStocks(STOCKS, state.customStocks, state.hiddenSymbols);
  persistCustomCategories();
  persistCustomStocks();
  return { ok: true, category: nextCategory };
}

export function removeCustomCategory(value) {
  const category = sanitizeCustomCategory(value);
  if (!category) return { ok: false, message: "Kategori adı gerekli." };
  const inUse = state.customStocks.some((stock) => stock.category.localeCompare(category, "tr", { sensitivity: "base" }) === 0);
  if (inUse) return { ok: false, message: "Bu kategori özel hisselerde kullanılıyor. Önce kategoriyi düzenle veya hisseleri sil." };
  state.customCategories = state.customCategories
    .filter((item) => item.localeCompare(category, "tr", { sensitivity: "base" }) !== 0)
    .sort((a, b) => a.localeCompare(b, "tr"));
  persistCustomCategories();
  return { ok: true, category };
}
export function setCatalogStatus(kind, message = "") {
  state.catalogStatus = { kind, message };
}

export function setNasdaqUniverse(payload) {
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  state.nasdaqUniverse = rows
    .map((row) => ({
      symbol: String(row.symbol || "").toUpperCase(),
      company: sanitizeText(row.company || row.symbol),
      exchange: sanitizeText(row.exchange || "NASDAQ"),
      category: sanitizeText(row.category || "Diğer Nasdaq Hisseleri"),
      categoryDescription: sanitizeText(row.categoryDescription || row.category || "Diğer Nasdaq Hisseleri"),
      autoFibTarget: Number.isFinite(Number(row.autoFibTarget)) ? Number(row.autoFibTarget) : null,
      logo: normalizeLogoInput(row.logo || row.domain || ""),
      domain: sanitizeText(row.domain || ""),
      aliases: Array.isArray(row.aliases) ? row.aliases.map(sanitizeText).filter(Boolean) : []
    }))
    .filter((row) => row.symbol && row.company);
  state.nasdaqUniverseMeta = {
    count: Number(payload.count || state.nasdaqUniverse.length),
    returned: Number(payload.returned || state.nasdaqUniverse.length),
    source: payload.source || "Nasdaq",
    savedAt: payload.savedAt || null,
    stale: Boolean(payload.stale)
  };
}

export function setNasdaqUniverseStatus(kind, message = "") {
  state.nasdaqUniverseStatus = { kind, message };
}

export function findNasdaqCompany(symbol) {
  const key = String(symbol || "").toUpperCase();
  return state.nasdaqUniverse.find((row) => row.symbol === key) || null;
}

export function removeCustomStock(symbol) {
  const key = String(symbol || "").toUpperCase();
  state.customStocks = state.customStocks.filter((stock) => stock.symbol !== key);
  state.stocks = mergeStocks(STOCKS, state.customStocks, state.hiddenSymbols);
  state.snapshots.delete(key);
  state.histories.forEach((_, mapKey) => { if (String(mapKey).startsWith(`${key}:`)) state.histories.delete(mapKey); });
  state.performances.delete(key);
  state.news.delete(key);
  state.analysis.delete(key);
  state.alertRules = state.alertRules.filter((rule) => rule.scope !== "symbol" || rule.symbol !== key);
  state.triggeredAlerts = state.triggeredAlerts.filter((alert) => alert.symbol !== key);
  state.favorites.delete(key);
  delete state.fibTargets[key];
  delete state.investmentPlans[key];
  if (state.selectedSymbol === key) state.selectedSymbol = state.stocks[0]?.symbol || null;
  persistCustomStocks();
  persistInvestmentPlans();
  persistAlertRules();
  persistTriggeredAlerts();
  persistSettings();
}

export function removeStockFromList(symbol) {
  const key = String(symbol || "").toUpperCase();
  if (!key) return;
  const isCustom = state.customStocks.some((stock) => stock.symbol === key);
  if (isCustom) {
    removeCustomStock(key);
    return;
  }
  state.hiddenSymbols.add(key);
  state.stocks = mergeStocks(STOCKS, state.customStocks, state.hiddenSymbols);
  state.snapshots.delete(key);
  state.histories.forEach((_, mapKey) => { if (String(mapKey).startsWith(`${key}:`)) state.histories.delete(mapKey); });
  state.performances.delete(key);
  state.news.delete(key);
  state.analysis.delete(key);
  state.alertRules = state.alertRules.filter((rule) => rule.scope !== "symbol" || rule.symbol !== key);
  state.triggeredAlerts = state.triggeredAlerts.filter((alert) => alert.symbol !== key);
  state.favorites.delete(key);
  delete state.fibTargets[key];
  delete state.investmentPlans[key];
  if (state.selectedSymbol === key) state.selectedSymbol = state.stocks[0]?.symbol || null;
  persistAlertRules();
  persistTriggeredAlerts();
  persistSettings();
}
export function getInvestmentPlan(symbol) {
  const key = String(symbol || "").toUpperCase();
  if (!key) return structuredClone(defaultInvestmentPlan);
  return { ...defaultInvestmentPlan, ...(state.investmentPlans[key] || {}) };
}

export function setInvestmentPlan(symbol, patch) {
  return updateInvestmentPlan(symbol, patch);
}

export function getInvestmentPlanNote(symbol) {
  return getInvestmentPlan(symbol).note;
}

export function getInvestmentPlanEntryPrice(symbol) {
  return getInvestmentPlan(symbol).entryPrice;
}

export function getInvestmentPlanBuyZone(symbol) {
  return getInvestmentPlan(symbol).buyZone;
}

export function getInvestmentPlanStopPrice(symbol) {
  return getInvestmentPlan(symbol).stopPrice;
}

export function getInvestmentPlanPositionTag(symbol) {
  return getInvestmentPlan(symbol).positionTag;
}

export function setInvestmentPlanNote(symbol, note) {
  return updateInvestmentPlan(symbol, { note });
}

export function setInvestmentPlanEntryPrice(symbol, entryPrice) {
  return updateInvestmentPlan(symbol, { entryPrice });
}

export function setInvestmentPlanBuyZone(symbol, buyZone) {
  return updateInvestmentPlan(symbol, { buyZone });
}

export function setInvestmentPlanStopPrice(symbol, stopPrice) {
  return updateInvestmentPlan(symbol, { stopPrice });
}

export function setInvestmentPlanPositionTag(symbol, positionTag) {
  return updateInvestmentPlan(symbol, { positionTag });
}

function updateInvestmentPlan(symbol, patch) {
  const key = String(symbol || "").toUpperCase();
  if (!key) return null;
  const next = sanitizeInvestmentPlan({ ...getInvestmentPlan(key), ...(patch || {}) });
  state.investmentPlans[key] = next;
  persistInvestmentPlans();
  return next;
}

export function toggleFavorite(symbol) {
  if (state.favorites.has(symbol)) state.favorites.delete(symbol);
  else state.favorites.add(symbol);
  persistSettings();
}

export function setFilters(patch) {
  Object.assign(state.filters, patch);
  persistSettings();
}

export function setUi(patch) {
  Object.assign(state.ui, patch);
  persistSettings();
  applyTheme();
}

export function getFibTarget(stockOrSymbol) {
  const symbol = typeof stockOrSymbol === "string" ? stockOrSymbol : stockOrSymbol.symbol;
  const fallback = typeof stockOrSymbol === "string"
     ? state.stocks.find((stock) => stock.symbol === stockOrSymbol).fibTarget
    : stockOrSymbol.fibTarget;
  const override = state.fibTargets[String(symbol || "").toUpperCase()];
  return Number.isFinite(Number(override)) && Number(override) > 0 ? Number(override) : Number(fallback);
}

export function getCatalogFibTarget(symbol) {
  return Number(state.stocks.find((stock) => stock.symbol === symbol).fibTarget);
}

export function setFibTarget(symbol, value) {
  const next = Number(value);
  if (!symbol || !Number.isFinite(next) || next <= 0) return false;
  state.fibTargets[String(symbol).toUpperCase()] = next;
  state.alerts.clear();
  persistSettings();
  return true;
}

export function resetFibTarget(symbol) {
  if (!symbol) return;
  delete state.fibTargets[String(symbol).toUpperCase()];
  state.alerts.clear();
  persistSettings();
}

export function applyTheme() {
  document.documentElement.dataset.theme = state.ui.theme;
  document.documentElement.dataset.density = state.ui.density;
}

export function getReturnFor(symbol, month) {
  const item = (state.performances.get(symbol)?.returns || []).find((entry) => Number(entry.month) === Number(month));
  return Number.isFinite(Number(item?.percent)) ? Number(item.percent) : null;
}

export function getVolatility(symbol) {
  const points = state.performances.get(symbol)?.points || [];
  const values = points.slice(-21).map((point) => Number(point.close)).filter(Number.isFinite);
  if (values.length < 3) return null;
  const returns = values.slice(1).map((value, index) => ((value - values[index]) / values[index]) * 100);
  const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

export function getTechnicals(symbol) {
  const points = state.performances.get(symbol)?.points || [];
  const closes = points.map((point) => Number(point.close)).filter(Number.isFinite);
  const latest = closes[closes.length - 1];
  if (!Number.isFinite(latest)) return { rsi14: null, ma20: null, ma50: null, high52w: null, low52w: null, high52wPct: null, low52wPct: null };
  const ma = (period) => {
    const slice = closes.slice(-period);
    return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : null;
  };
  const rsi14 = calculateRsi(closes, 14);
  const high52w = Math.max(...closes.slice(-252));
  const low52w = Math.min(...closes.slice(-252));
  return {
    rsi14,
    ma20: ma(20),
    ma50: ma(50),
    high52w,
    low52w,
    high52wPct: Number.isFinite(high52w) && high52w !== 0 ? ((latest - high52w) / high52w) * 100 : null,
    low52wPct: Number.isFinite(low52w) && low52w !== 0 ? ((latest - low52w) / low52w) * 100 : null
  };
}

function calculateRsi(values, period = 14) {
  if (values.length <= period) return null;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  const recent = changes.slice(-period);
  const gains = recent.map((value) => Math.max(0, value));
  const losses = recent.map((value) => Math.max(0, -value));
  const avgGain = gains.reduce((sum, value) => sum + value, 0) / period;
  const avgLoss = losses.reduce((sum, value) => sum + value, 0) / period;
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

export function getRowModel(stock) {
  const snapshot = state.snapshots.get(stock.symbol) || {};
  const performance = state.performances.get(stock.symbol);
  const news = normalizeNewsRow(state.news.get(stock.symbol));
  const analysis = normalizeAnalysisRow(state.analysis.get(stock.symbol));
  const price = Number(snapshot.price);
  const fibTarget = getFibTarget(stock);
  const fibDistanceAbs = Number.isFinite(price) && Number.isFinite(fibTarget) ? fibTarget - price : null;
  const fibDistancePct = Number.isFinite(price) && Number.isFinite(fibTarget) && fibTarget !== 0
     ? ((fibTarget - price) / fibTarget) * 100
    : null;
  const selectedReturn = getReturnFor(stock.symbol, state.filters.returnPeriod);
  const returns = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, value: getReturnFor(stock.symbol, index + 1) }));
  const momentum1m = getReturnFor(stock.symbol, 1);
  const momentum3m = getReturnFor(stock.symbol, 3);
  const momentum6m = getReturnFor(stock.symbol, 6);
  const momentum12m = getReturnFor(stock.symbol, 12);
  const volatility20d = snapshot.metrics?.volatility20d ?? getVolatility(stock.symbol);
  const technicals = getTechnicals(stock.symbol);
  const status = snapshot.isLive ? "live" : snapshot.isStale ? "stale" : "loading";
  const scoreInfo = scoreRow({ fibDistancePct, momentum1m, momentum12m, status });
  const targetStatus = getTargetStatus({ price, fibTarget, alertThreshold: state.ui.alertThreshold });
  const targetMode = Number.isFinite(Number(state.fibTargets[stock.symbol])) ? "custom" : "catalog";
  const signalDetail = computeSignal({
    symbol: stock.symbol,
    price,
    points: performance?.points || [],
    fibTarget,
    alertThreshold: state.ui.alertThreshold,
    newsSentiment: news.newsSentiment,
    newsImpact: news.newsImpact,
    freshnessSec: snapshot.sourceFreshnessSec
  });
  const technicalSignal = normalizeSignalForFilters(signalDetail.signal || getTechnicalSignal({ technicals, momentum1m, momentum3m, momentum12m, analysis }));
  const technicalSignalScore = getTechnicalSignalScore(technicalSignal);
  const riskProfile = getRiskProfile({
    volatility20d,
    newsSentiment: news.newsSentiment,
    newsImpact: news.newsImpact,
    technicalSignal,
    targetStatus,
    fibDistancePct,
    analysisRecommendation: analysis.recommendation
  });
  const momentumNewsScore = getMomentumNewsScore({ momentum1m, momentum3m, momentum12m, news, technicalSignal, scoreInfo });
  const investmentPlan = getInvestmentPlan(stock.symbol);

  return {
    ...stock,
    catalogFibTarget: Number(stock.fibTarget),
    isCustomFibTarget: Number.isFinite(Number(state.fibTargets[stock.symbol])),
    fibTarget,
    snapshot,
    performance,
    price,
    fibDistanceAbs,
    fibDistancePct,
    targetDistanceAbs: fibDistanceAbs,
    targetDistancePct: fibDistancePct,
    fibProgress: Number.isFinite(price) && Number.isFinite(fibTarget) && fibTarget !== 0 ? (price / fibTarget) * 100 : null,
    selectedReturn,
    returns,
    momentum1m,
    momentum3m,
    momentum6m,
    momentum12m,
    volatility20d,
    technicals,
    newsImpact: news.newsImpact,
    newsSentiment: news.newsSentiment,
    newsImpactScore: news.newsImpactScore,
    newsSentimentScore: news.newsSentimentScore,
    newsCount: news.newsCount,
    newsSummary: news.newsSummary,
    analysisTargetPrice: analysis.targetMeanPrice,
    analysisRecommendation: analysis.recommendation,
    analysisEarningsDate: analysis.earningsDate,
    analysisAvailable: analysis.available,
    signalDetail,
    technicalSignal,
    technicalSignalScore,
    targetStatus,
    targetMode,
    riskLevel: riskProfile.riskLevel,
    riskScore: riskProfile.riskScore,
    momentumNewsScore,
    investmentPlan,
    investmentNote: investmentPlan.note,
    investmentEntryPrice: investmentPlan.entryPrice,
    investmentBuyZone: investmentPlan.buyZone,
    investmentStopPrice: investmentPlan.stopPrice,
    investmentPositionTag: investmentPlan.positionTag,
    investmentShares: investmentPlan.shares,
    investmentAvgCost: investmentPlan.avgCost,
    investmentJournal: investmentPlan.journal,
    score: scoreInfo.total,
    scoreInfo,
    isFavorite: state.favorites.has(stock.symbol),
    isNearFib: Number.isFinite(fibDistancePct) && Math.abs(fibDistancePct) <= Number(state.ui.alertThreshold || 3),
    status: snapshot.error ? "error" : snapshot.isStale ? "stale" : snapshot.isLive ? "live" : "loading",
    trend: trendLabel(momentum1m, momentum3m, snapshot)
  };
}

function normalizeNewsRow(rawNews) {
  const news = rawNews && typeof rawNews === "object" ? rawNews : {};
  const impactSummary = news.impactSummary && typeof news.impactSummary === "object" ? news.impactSummary : {};
  const newsSentimentScore = Number.isFinite(Number(impactSummary.averageSentimentScore))
     ? Number(impactSummary.averageSentimentScore)
    : 0;
  const newsImpactScore = Number.isFinite(Number(impactSummary.averageImpactScore))
     ? Number(impactSummary.averageImpactScore)
    : 0;
  return {
    newsSentimentScore,
    newsImpactScore,
    newsSentiment: newsSentimentScore > 0.25 ? "positive" : newsSentimentScore < -0.25 ? "negative" : "neutral",
    newsImpact: newsImpactScore >= 2.5 || Number(impactSummary.highImpactCount) > 0 ? "high" : newsImpactScore >= 1.25 ? "medium" : "low",
    newsCount: Number(impactSummary.totalCount || 0),
    newsSummary: impactSummary
  };
}

function normalizeAnalysisRow(rawAnalysis) {
  const analysis = rawAnalysis && typeof rawAnalysis === "object" ? rawAnalysis : {};
  return {
    targetMeanPrice: Number.isFinite(Number(analysis.targetMeanPrice)) ? Number(analysis.targetMeanPrice) : null,
    recommendation: Number.isFinite(Number(analysis.recommendation)) ? Number(analysis.recommendation) : null,
    earningsDate: analysis.earningsDate || null,
    available: Boolean(analysis.available)
  };
}

function getTargetStatus({ price, fibTarget, alertThreshold }) {
  if (!Number.isFinite(price) || !Number.isFinite(fibTarget) || fibTarget === 0) return "unknown";
  if (Math.abs(((fibTarget - price) / fibTarget) * 100) <= Number(alertThreshold || 0)) return "near";
  if (price > fibTarget) return "above";
  if (price < fibTarget) return "below";
  return "near";
}

function getTechnicalSignal({ technicals, momentum1m, momentum3m, momentum12m, analysis }) {
  let score = 0;
  if (Number.isFinite(momentum1m)) score += momentum1m > 0 ? 1 : momentum1m < 0 ? -1 : 0;
  if (Number.isFinite(momentum3m)) score += momentum3m > 0 ? 1 : momentum3m < 0 ? -1 : 0;
  if (Number.isFinite(momentum12m)) score += momentum12m > 0 ? 1 : momentum12m < 0 ? -1 : 0;
  if (Number.isFinite(technicals.ma20) && Number.isFinite(technicals.ma50)) score += technicals.ma20 >= technicals.ma50 ? 1 : -1;
  if (Number.isFinite(technicals.rsi14)) {
    if (technicals.rsi14 < 30) score += 1;
    else if (technicals.rsi14 > 70) score -= 1;
  }
  if (Number.isFinite(analysis.recommendation)) {
    score += analysis.recommendation <= 1.5 ? 2
      : analysis.recommendation <= 2.5 ? 1
      : analysis.recommendation <= 3.5 ? 0
      : analysis.recommendation <= 4.5 ? -1
      : -2;
  }
  if (score >= 4) return "strong_buy";
  if (score >= 2) return "buy";
  if (score <= -4) return "strong_sell";
  if (score <= -2) return "sell";
  return "neutral";
}

function getTechnicalSignalScore(signal) {
  if (signal === "strong_buy") return 3;
  if (signal === "buy") return 2;
  if (signal === "watch") return 1;
  if (signal === "neutral") return 0;
  if (signal === "risky") return -1;
  if (signal === "sell") return -2;
  return -3;
}

function normalizeSignalForFilters(signal) {
  const value = String(signal || "neutral");
  if (["strong_buy", "buy", "watch", "neutral", "risky", "sell", "strong_sell"].includes(value)) return value;
  return "neutral";
}

function getRiskProfile({ volatility20d, newsSentiment, newsImpact, technicalSignal, targetStatus, fibDistancePct, analysisRecommendation }) {
  let riskScore = 0;
  if (Number.isFinite(volatility20d)) riskScore += Math.min(3, Math.max(0, volatility20d / 6));
  if (newsSentiment === "negative") riskScore += 1.5;
  else if (newsSentiment === "positive") riskScore -= 0.5;
  if (newsImpact === "high") riskScore += 1.2;
  else if (newsImpact === "medium") riskScore += 0.6;
  if (technicalSignal === "strong_sell") riskScore += 2.5;
  else if (technicalSignal === "sell") riskScore += 1.5;
  else if (technicalSignal === "buy") riskScore -= 0.5;
  else if (technicalSignal === "strong_buy") riskScore -= 1;
  if (targetStatus === "above") riskScore += 0.5;
  if (Number.isFinite(fibDistancePct) && Math.abs(fibDistancePct) > 20) riskScore += 0.5;
  if (Number.isFinite(analysisRecommendation) && analysisRecommendation >= 4) riskScore += 1;
  riskScore = Math.max(0, Number(riskScore.toFixed(2)));
  return {
    riskScore,
    riskLevel: riskScore >= 3.5 ? "high" : riskScore >= 1.8 ? "medium" : "low"
  };
}

function getMomentumNewsScore({ momentum1m, momentum3m, momentum12m, news, technicalSignal, scoreInfo }) {
  const momentumScore = [
    Number.isFinite(momentum12m) ? momentum12m * 0.45 : 0,
    Number.isFinite(momentum3m) ? momentum3m * 0.25 : 0,
    Number.isFinite(momentum1m) ? momentum1m * 0.15 : 0
  ].reduce((sum, value) => sum + value, 0);
  const newsScore = (news.newsSentimentScore * 12) + (news.newsImpactScore * 2);
  const signalScore = technicalSignal === "strong_buy" ? 6
    : technicalSignal === "buy" ? 3
    : technicalSignal === "neutral" ? 0
    : technicalSignal === "sell" ? -3
    : -6;
  return Number((momentumScore + newsScore + signalScore + (scoreInfo.trendScore || 0) * 0.25).toFixed(2));
}

function scoreRow({ fibDistancePct, momentum1m, momentum12m, status }) {
  const fibScore = Number.isFinite(fibDistancePct) ? Math.max(0, 35 - Math.abs(fibDistancePct) * 2) : 0;
  const trendScore = Number.isFinite(momentum12m) ? Math.max(0, Math.min(35, 17 + momentum12m / 6)) : 0;
  const monthScore = Number.isFinite(momentum1m) ? Math.max(0, Math.min(20, 10 + momentum1m)) : 0;
  const freshness = status === "live" ? 10 : status === "stale" ? 4 : 0;
  return {
    total: Math.round(fibScore + trendScore + monthScore + freshness),
    fibScore: Math.round(fibScore),
    trendScore: Math.round(trendScore),
    monthScore: Math.round(monthScore),
    freshness: Math.round(freshness)
  };
}

function trendLabel(momentum1m, momentum3m, snapshot) {
  if (snapshot.isStale) return "Veri Eski";
  if (Number.isFinite(momentum1m) && Number.isFinite(momentum3m) && momentum1m > 0 && momentum3m > 0) return "G\u00fc\u00e7l\u00fc Trend";
  if (Number.isFinite(momentum1m) && momentum1m < 0) return "Zay\u0131f Trend";
  return "N\u00f6tr";
}

export function getVisibleRows() {
  const q = String(state.filters.search || "").trim().toLowerCase();
  const categoryFilter = normalizeCategoryFilter(state.filters.category);
  const statusFilter = normalizeEnumFilter(state.filters.status, ["all", "live", "stale", "error"]);
  const targetFilter = normalizeEnumFilter(state.filters.target, ["all", "custom", "near", "above", "below"]);
  const signalFilter = normalizeEnumFilter(state.filters.signal, ["all", "strong_buy", "buy", "watch", "neutral", "risky", "sell", "strong_sell"]);
  const newsFilter = normalizeEnumFilter(state.filters.news, ["all", "positive", "negative", "neutral", "high", "medium", "low"]);
  let rows = state.stocks.map(getRowModel);

  rows = rows.filter((row) => {
    const matchesSearch = !q ||
      row.symbol.toLowerCase().includes(q) ||
      row.company.toLowerCase().includes(q) ||
      row.category.toLowerCase().includes(q);
    const matchesCategory = isAllCategory(categoryFilter) || row.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || row.status === statusFilter;
    const matchesFib = !state.filters.fibOnly || row.isNearFib;
    const matchesFavorites = !state.filters.favoritesOnly || row.isFavorite;
    const matchesTarget = matchesTargetFilter(row, targetFilter);
    const matchesSignal = matchesSignalFilter(row, signalFilter);
    const matchesNews = matchesNewsFilter(row, newsFilter);
    return matchesSearch && matchesCategory && matchesStatus && matchesFib && matchesFavorites && matchesTarget && matchesSignal && matchesNews;
  });

  const dir = state.filters.sortDir === "desc" ? -1 : 1;
  rows.sort((a, b) => compareRows(a, b, state.filters.sortBy) * dir);
  return rows;
}


function isAllCategory(value) {
  const normalized = String(value || "all").toLowerCase();
  const normalizedNoAccent = normalized
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return (
    normalized === "all" ||
    normalizedNoAccent === "tumu" ||
    normalizedNoAccent === "tum" ||
    normalized === "tümü" ||
    normalized === "tumu" ||
    normalized === "tm" ||
    normalized.includes("tm")
  );
}

function normalizeCategoryFilter(value) {
  if (isAllCategory(value)) return "all";
  const text = String(value || "").trim();
  return getCategories().includes(text) ? text : "all";
}

function normalizeEnumFilter(value, allowed) {
  const text = String(value || "all");
  return allowed.includes(text) ? text : "all";
}

function matchesTargetFilter(row, filter) {
  const value = String(filter || "all");
  if (value === "all") return true;
  if (value === "custom") return row.isCustomFibTarget;
  if (value === "at" || value === "near") return row.targetStatus === "near";
  return row.targetStatus === value;
}

function matchesSignalFilter(row, filter) {
  const value = String(filter || "all");
  if (value === "all") return true;
  return row.technicalSignal === value;
}

function matchesNewsFilter(row, filter) {
  const value = String(filter || "all");
  if (value === "all") return true;
  if (["positive", "negative", "neutral"].includes(value)) return row.newsSentiment === value;
  if (["high", "medium", "low"].includes(value)) return row.newsImpact === value;
  return row.newsSentiment === value || row.newsImpact === value;
}

function compareNullable(a, b) {
  const aa = Number.isFinite(Number(a)) ? Number(a) : null;
  const bb = Number.isFinite(Number(b)) ? Number(b) : null;
  if (aa === null && bb === null) return 0;
  if (aa === null) return 1;
  if (bb === null) return -1;
  return aa - bb;
}

function compareRows(a, b, key) {
  if (a.isCustom !== b.isCustom) return a.isCustom ? -1 : 1;
  if (key === "symbol") return a.symbol.localeCompare(b.symbol);
  if (key === "category") return a.category.localeCompare(b.category, "tr");
  if (key === "company") return a.company.localeCompare(b.company, "tr");
  if (key === "price") return compareNullable(a.price, b.price);
  if (key === "fibTarget") return compareNullable(a.fibTarget, b.fibTarget);
  if (key === "freshness") return compareNullable(a.snapshot.sourceFreshnessSec, b.snapshot.sourceFreshnessSec);
  if (key === "return") return compareNullable(a.selectedReturn, b.selectedReturn);
  if (key === "return1") return compareNullable(a.momentum1m, b.momentum1m);
  if (key === "return12") return compareNullable(a.momentum12m, b.momentum12m);
  if (key === "falling") return compareNullable(a.momentum1m, b.momentum1m);
  if (key === "score") return compareNullable(a.score, b.score);
  if (key === "status") return compareNullable(statusRank(a.status), statusRank(b.status));
  if (key === "newsPositive") return compareNullable(a.newsSentimentScore, b.newsSentimentScore);
  if (key === "newsNegative") return compareNullable(a.newsSentimentScore, b.newsSentimentScore);
  if (key === "highRisk") return compareNullable(a.riskScore, b.riskScore);
  if (key === "targetClosest") return compareNullable(Math.abs(a.targetDistancePct ?? Infinity), Math.abs(b.targetDistancePct ?? Infinity));
  if (key === "momentumNews") return compareNullable(a.momentumNewsScore, b.momentumNewsScore);
  return compareNullable(Math.abs(a.fibDistancePct ?? Infinity), Math.abs(b.fibDistancePct ?? Infinity));
}

function statusRank(status) {
  if (status === "live") return 0;
  if (status === "stale") return 1;
  if (status === "error") return 2;
  return 3;
}

export function getKpis(rows = getVisibleRows()) {
  const live = rows.filter((row) => row.status === "live").length;
  const stale = rows.filter((row) => row.status === "stale").length;
  const error = rows.filter((row) => row.status === "error").length;
  const nearFib = rows.filter((row) => row.isNearFib).length;
  const positive = rows.filter((row) => Number(row.selectedReturn) > 0).length;
  const negative = rows.filter((row) => Number(row.selectedReturn) < 0).length;
  const newsPositive = rows.filter((row) => row.newsSentiment === "positive").length;
  const newsNegative = rows.filter((row) => row.newsSentiment === "negative").length;
  const customTargets = rows.filter((row) => row.isCustomFibTarget).length;
  const targetAbove = rows.filter((row) => row.targetStatus === "above").length;
  const strongTechnical = rows.filter((row) => row.technicalSignal === "strong_buy").length;
  const highRisk = rows.filter((row) => row.riskLevel === "high").length;
  const closestFib = [...rows].filter((row) => Number.isFinite(row.fibDistancePct)).sort((a, b) => Math.abs(a.fibDistancePct) - Math.abs(b.fibDistancePct)).slice(0, 5);
  const strongest12m = [...rows].filter((row) => Number.isFinite(row.momentum12m)).sort((a, b) => b.momentum12m - a.momentum12m).slice(0, 5);
  const topNewsPositive = [...rows].filter((row) => row.newsSentiment === "positive").sort((a, b) => b.newsSentimentScore - a.newsSentimentScore).slice(0, 5);
  const topNewsNegative = [...rows].filter((row) => row.newsSentiment === "negative").sort((a, b) => a.newsSentimentScore - b.newsSentimentScore).slice(0, 5);
  const topHighRisk = [...rows].filter((row) => Number.isFinite(row.riskScore)).sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);
  const topTargetClosest = [...rows].filter((row) => Number.isFinite(row.targetDistancePct)).sort((a, b) => Math.abs(a.targetDistancePct) - Math.abs(b.targetDistancePct)).slice(0, 5);
  const topStrongTechnical = [...rows].filter((row) => Number.isFinite(row.technicalSignalScore)).sort((a, b) => b.technicalSignalScore - a.technicalSignalScore).slice(0, 5);
  const topMomentumNews = [...rows].filter((row) => Number.isFinite(row.momentumNewsScore)).sort((a, b) => b.momentumNewsScore - a.momentumNewsScore).slice(0, 5);
  const topAnalystTarget = [...rows].filter((row) => Number.isFinite(row.analysisTargetPrice)).sort((a, b) => b.analysisTargetPrice - a.analysisTargetPrice).slice(0, 5);

  return {
    total: rows.length,
    live,
    stale,
    error,
    nearFib,
    positive,
    negative,
    newsPositive,
    newsNegative,
    customTargets,
    targetAbove,
    strongTechnical,
    highRisk,
    closestFib,
    strongest12m,
    topNewsPositive,
    topNewsNegative,
    topHighRisk,
    topTargetClosest,
    topStrongTechnical,
    topMomentumNews,
    topAnalystTarget
  };
}
