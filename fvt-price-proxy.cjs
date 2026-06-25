const http = require("http");
const fs = require("fs");
const path = require("path");
const { computeSignal } = require("./src/signal-engine.cjs");

const PORT = 8766;
const VERSION = "2.0.0";
const FVT_STOCKS_URL = "https://fvt.com.tr/api/stocks?yabanci=1&includeLive=1&limit=5000";
const NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&offset=0&exchange=nasdaq";
const NASDAQ_TRADER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const SOURCE_PRIORITY = ["Yahoo Finance", "Stooq", "FVT", "Google Finance", "lastKnown"];
const CACHE_TTL_MS = 60_000;
const STALE_TTL_MS = 15 * 60_000;
const MARKET_STALE_SEC = 72 * 60 * 60;
const HISTORY_CACHE_TTL_MS = 60_000;
const PERFORMANCE_CACHE_TTL_MS = 6 * 60 * 60_000;
const NASDAQ_UNIVERSE_TTL_MS = 24 * 60 * 60_000;
const MAX_BATCH = 80;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 2000;
const ALLOWED_RANGES = new Set(["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y"]);
const ALLOWED_INTERVALS = new Set(["1m", "5m", "15m", "30m", "1h", "1d"]);
const NASDAQ_COMPANY_OVERRIDES = {
  SPCX: {
    domain: "spacex.com",
    aliases: ["SpaceX", "Space Exploration Technologies", "Starlink", "Elon Musk"]
  }
};

const CATEGORY_RULES = [
  { category: "ETF ve Fonlar", keywords: [" ETF", "Fund", "Trust", "Income", "Bond", "Treasury", "Yield", "Dividend", "Index", "Shares"] },
  { category: "SPAC ve Birleşme Şirketleri", keywords: ["Acquisition", "Blank Check", "Holdings Corp.", "Units", "Rights", "Warrants"] },
  { category: "Yarı İletken ve Çip", keywords: ["Semiconductor", "Micro", "Chip", "NVIDIA", "AMD", "Intel", "Arm", "Silicon", "Photonics"] },
  { category: "Yapay Zeka ve Bulut", keywords: ["AI", "Artificial Intelligence", "Cloud", "Data Center", "Software", "Analytics", "Cyber", "Security"] },
  { category: "NAND Depolama ve Veri Saklama", keywords: ["Storage", "Memory", "NAND", "Disk", "Data Storage", "Micron", "Western Digital", "Seagate"] },
  { category: "Biyoteknoloji ve Sağlık", keywords: ["Bio", "Pharma", "Therapeutics", "Medical", "Health", "Oncology", "Vaccine", "Genetic", "Diagnostics"] },
  { category: "Finans ve Fintech", keywords: ["Bank", "Financial", "Capital", "Insurance", "Fintech", "Payments", "Credit", "Mortgage"] },
  { category: "Enerji ve Temiz Teknoloji", keywords: ["Energy", "Solar", "Power", "Battery", "Hydrogen", "Mining", "Oil", "Gas", "Renewable"] },
  { category: "Tüketici ve E-Ticaret", keywords: ["Retail", "Consumer", "Commerce", "Restaurant", "Food", "Travel", "Hotel", "Entertainment"] },
  { category: "İletişim ve Medya", keywords: ["Media", "Communications", "Telecom", "Streaming", "Network", "Advertising"] },
  { category: "Endüstri ve Ulaşım", keywords: ["Industrial", "Aerospace", "Defense", "Automotive", "Transportation", "Logistics", "Manufacturing"] },
  { category: "Gayrimenkul ve Altyapı", keywords: ["Real Estate", "REIT", "Infrastructure", "Properties", "Construction"] }
];

const catalogPath = path.join(__dirname, "stock-catalog.json");
const nasdaqUniversePath = path.join(__dirname, "nasdaq-universe-cache.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")).map((stock) => ({
  ...stock,
  symbol: String(stock.symbol).toUpperCase()
}));
const catalogMap = new Map(catalog.map((stock) => [stock.symbol, stock]));

let fvtCache = null;
let fvtCacheTime = 0;
let nasdaqUniverseCache = readNasdaqUniverseCache();
let nasdaqUniverseCacheTime = nasdaqUniverseCache?.savedAt || 0;
const historyCache = new Map();
const performanceCache = new Map();
const snapshotCache = new Map();
const logoCache = new Map();
const newsCache = new Map();
const analysisCache = new Map();
const requestBuckets = new Map();
const errorLog = [];
const sourceStats = {
  FVT: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null },
  Yahoo: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null },
  Stooq: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null },
  Google: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null },
  Finviz: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null },
  lastKnown: { success: 0, failure: 0, lastSuccess: null, lastFailure: null, lastError: null, lastLatencyMs: null }
};
const counters = {
  startedAt: Date.now(),
  totalRequests: 0,
  responses2xx: 0,
  responses4xx: 0,
  responses5xx: 0,
  endpoints: {},
  cacheHits: 0,
  cacheMisses: 0
};

const lastKnownPrices = Object.fromEntries(catalog.map((stock) => [stock.symbol, null]));

function readNasdaqUniverseCache() {
  try {
    const parsed = JSON.parse(fs.readFileSync(nasdaqUniversePath, "utf8"));
    if (!Array.isArray(parsed?.data)) return null;
    return {
      savedAt: Number(parsed.savedAt) || 0,
      source: parsed.source || "cache",
      data: parsed.data.map(normalizeNasdaqUniverseRow).filter(Boolean)
    };
  } catch {
    return null;
  }
}

function writeNasdaqUniverseCache(payload) {
  try {
    fs.writeFileSync(nasdaqUniversePath, JSON.stringify(payload, null, 2), "utf8");
  } catch (error) {
    pushErrorLog({ url: "/api/nasdaq-universe/cache-write" }, error);
  }
}

function sendJson(res, status, payload) {
  if (status >= 500) counters.responses5xx += 1;
  else if (status >= 400) counters.responses4xx += 1;
  else counters.responses2xx += 1;
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendImage(res, status, body, contentType) {
  if (status >= 500) counters.responses5xx += 1;
  else if (status >= 400) counters.responses4xx += 1;
  else counters.responses2xx += 1;
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400"
  });
  res.end(body);
}

function recordEndpoint(pathname) {
  counters.totalRequests += 1;
  counters.endpoints[pathname] = (counters.endpoints[pathname] || 0) + 1;
}

function isRateLimited(req) {
  const key = req.socket.remoteAddress || "local";
  const now = Date.now();
  const bucket = requestBuckets.get(key) || [];
  const recent = bucket.filter((time) => now - time < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  requestBuckets.set(key, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function pushErrorLog(req, error) {
  errorLog.unshift({
    time: new Date().toISOString(),
    path: req.url,
    message: error.message
  });
  if (errorLog.length > 50) errorLog.length = 50;
}

async function timedSource(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    Object.assign(sourceStats[name], {
      success: sourceStats[name].success + 1,
      lastSuccess: Math.floor(Date.now() / 1000),
      lastLatencyMs: Date.now() - started
    });
    return value;
  } catch (error) {
    Object.assign(sourceStats[name], {
      failure: sourceStats[name].failure + 1,
      lastFailure: Math.floor(Date.now() / 1000),
      lastError: error.message,
      lastLatencyMs: Date.now() - started
    });
    throw error;
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

function logoFallbackSvg(stock) {
  const symbol = escapeSvg(String(stock?.symbol || "").slice(0, 5));
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="64" fill="#ffffff"/><circle cx="128" cy="128" r="86" fill="#f1f5f9"/><text x="128" y="143" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="#0f172a">${symbol}</text></svg>`);
}

function escapeSvg(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

function extractLogoDomain(logoUrl) {
  if (!logoUrl) return null;
  try {
    const parsed = new URL(logoUrl);
    const domainParam = parsed.searchParams.get("domain");
    if (domainParam) return domainParam.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function googleFaviconUrl(domain, size = 256) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

function inferLogoDomain(symbol, company = "") {
  const overrides = {
    GOOGL: "abc.xyz",
    GOOG: "abc.xyz",
    META: "meta.com",
    SPCX: "spacex.com",
    BRK: "berkshirehathaway.com",
    BRK_A: "berkshirehathaway.com",
    BRK_B: "berkshirehathaway.com"
  };
  const key = String(symbol || "").toUpperCase().replace(/[.-]/g, "_");
  if (overrides[key]) return overrides[key];
  const words = String(company || "")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|ltd|limited|plc|holdings|holding|class|common|stock|ordinary|shares|american|depositary|each|representing|the|and|of)\b/gi, " ")
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words[0]) return `${words[0].toLowerCase()}.com`;
  return `${String(symbol || "").toLowerCase().replace(/[^a-z0-9]/g, "")}.com`;
}

function normalizeNasdaqSymbol(symbol) {
  return String(symbol || "").trim().toUpperCase().replace(/\s+/g, "").replace(/\//g, ".");
}

function cleanNasdaqCompanyName(name) {
  return String(name || "")
    .replace(/\s+-\s+Common Stock.*$/i, "")
    .replace(/\s+Common Stock.*$/i, "")
    .replace(/\s+-\s+Class [A-Z].*$/i, "")
    .replace(/\s+Ordinary Shares.*$/i, "")
    .replace(/\s+American Depositary Shares.*$/i, "")
    .trim();
}

function inferNasdaqCategory(row, company, symbol) {
  const override = NASDAQ_COMPANY_OVERRIDES[symbol] || {};
  if (override.category) return override.category;
  const haystack = [
    company,
    row?.sector,
    row?.Sector,
    row?.industry,
    row?.Industry,
    row?.name,
    row?.["Security Name"],
    symbol
  ].filter(Boolean).join(" ").toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()))) {
      return rule.category;
    }
  }
  return "Diğer Nasdaq Hisseleri";
}

function autoFibTargetFromPrice(price) {
  const number = Number(price);
  if (!Number.isFinite(number) || number <= 0) return null;
  const extension = number * 1.272;
  if (extension < 10) return Number(extension.toFixed(2));
  if (extension < 100) return Number(extension.toFixed(1));
  return Number(Math.round(extension));
}

function normalizeNasdaqUniverseRow(row) {
  const symbol = normalizeNasdaqSymbol(row?.symbol || row?.Symbol);
  const company = cleanNasdaqCompanyName(row?.name || row?.["Security Name"] || row?.company || symbol);
  if (!symbol || !company || symbol === "FILE") return null;
  if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return null;
  const override = NASDAQ_COMPANY_OVERRIDES[symbol] || {};
  const domain = override.domain || row?.domain || inferLogoDomain(symbol, company);
  const category = row?.category || inferNasdaqCategory(row, company, symbol);
  const rawPrice = row?.lastsale || row?.lastSale || row?.price || row?.Price;
  return {
    symbol,
    company,
    exchange: "NASDAQ",
    category,
    categoryDescription: category,
    marketCategory: row?.marketCategory || row?.["Market Category"] || "",
    isEtf: String(row?.etf || row?.ETF || "").toUpperCase() === "Y",
    isTest: String(row?.testIssue || row?.["Test Issue"] || "").toUpperCase() === "Y",
    autoFibTarget: row?.autoFibTarget || autoFibTargetFromPrice(String(rawPrice || "").replace(/[$,]/g, "")),
    logo: googleFaviconUrl(domain, 256),
    domain,
    aliases: Array.isArray(override.aliases) ? override.aliases : []
  };
}

async function fetchNasdaqScreenerUniverse() {
  const response = await fetchWithTimeout(NASDAQ_SCREENER_URL, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/market-activity/stocks/screener"
    }
  }, 20000);
  if (!response.ok) throw new Error(`Nasdaq screener HTTP ${response.status}`);
  const json = await response.json();
  const rows = json?.data?.table?.rows;
  if (!Array.isArray(rows) || !rows.length) throw new Error("Nasdaq screener data missing");
  return rows.map(normalizeNasdaqUniverseRow).filter(Boolean);
}

async function fetchNasdaqTraderUniverse() {
  const response = await fetchWithTimeout(NASDAQ_TRADER_URL, { headers: { Accept: "text/plain,*/*", "User-Agent": "Mozilla/5.0" } }, 20000);
  if (!response.ok) throw new Error(`NasdaqTrader HTTP ${response.status}`);
  const text = await response.text();
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const headers = headerLine.split("|");
  return lines
    .map((line) => Object.fromEntries(line.split("|").map((value, index) => [headers[index], value])))
    .map(normalizeNasdaqUniverseRow)
    .filter((row) => row && !row.isTest);
}

async function getNasdaqUniverse({ force = false } = {}) {
  if (!force && nasdaqUniverseCache?.data?.length && Date.now() - nasdaqUniverseCacheTime < NASDAQ_UNIVERSE_TTL_MS) {
    counters.cacheHits += 1;
    return nasdaqUniverseCache;
  }
  counters.cacheMisses += 1;
  const errors = [];
  for (const [source, loader] of [["NasdaqTrader", fetchNasdaqTraderUniverse], ["Nasdaq Screener", fetchNasdaqScreenerUniverse]]) {
    try {
      const data = await loader();
      const unique = Array.from(new Map(data.map((row) => [row.symbol, row])).values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
      const payload = { savedAt: Date.now(), source, count: unique.length, data: unique };
      nasdaqUniverseCache = payload;
      nasdaqUniverseCacheTime = payload.savedAt;
      writeNasdaqUniverseCache(payload);
      return payload;
    } catch (error) {
      errors.push(`${source}: ${error.message}`);
      pushErrorLog({ url: `/api/nasdaq-universe/${source}` }, error);
    }
  }
  if (nasdaqUniverseCache?.data?.length) return { ...nasdaqUniverseCache, stale: true, errors };
  throw new Error(`Nasdaq evreni alınamadı. ${errors.join(" | ")}`);
}

function filterNasdaqUniverse(rows, query, limit = 80) {
  const q = String(query || "").trim().toLowerCase();
  const filtered = !q ? rows : rows.filter((row) =>
    row.symbol.toLowerCase().includes(q) ||
    row.company.toLowerCase().includes(q) ||
    String(row.category || "").toLowerCase().includes(q) ||
    (Array.isArray(row.aliases) && row.aliases.some((alias) => String(alias).toLowerCase().includes(q)))
  );
  return filtered.slice(0, Math.max(1, Math.min(6000, Number(limit) || 80)));
}

function logoCandidates(stock) {
  const symbol = String(stock?.symbol || "").toUpperCase();
  const symbolSlug = symbol.replace(/\./g, "-").replace(/\//g, "-");
  const domain = extractLogoDomain(stock.logo);
  const urls = [];
  if (symbolSlug) {
    urls.push(`https://companiesmarketcap.com/img/company-logos/256/${symbolSlug}.png`);
    urls.push(`https://companiesmarketcap.com/img/company-logos/64/${symbolSlug}.png`);
    urls.push(`https://storage.googleapis.com/iex/api/logos/${symbol}.png`);
    urls.push(`https://financialmodelingprep.com/image-stock/${symbol}.png`);
  }
  if (domain) {
    urls.push(`https://logo.clearbit.com/${domain}?size=256`);
    urls.push(`https://logo.clearbit.com/${domain}`);
    urls.push(googleFaviconUrl(domain, 512));
    urls.push(googleFaviconUrl(domain, 256));
    urls.push(googleFaviconUrl(domain, 128));
    urls.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  }
  if (stock.logo) urls.push(stock.logo);
  return [...new Set(urls)];
}

async function getLogo(symbol) {
  const stock = catalogMap.get(symbol) || nasdaqUniverseCache?.data?.find((row) => row.symbol === symbol);
  if (!stock) {
    const error = new Error(`${symbol} is not in catalog`);
    error.status = 404;
    throw error;
  }
  const cached = logoCache.get(symbol);
  if (cached) return cached;
  for (const candidate of logoCandidates(stock)) {
    try {
      const response = await fetchWithTimeout(candidate, { headers: { Accept: "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*" } }, 5000);
      const contentType = response.headers.get("content-type") || "";
      if (response.ok && contentType.startsWith("image/")) {
        const payload = { body: Buffer.from(await response.arrayBuffer()), contentType };
        logoCache.set(symbol, payload);
        return payload;
      }
    } catch {
      // Try the next public logo provider, then fall back to local SVG.
    }
  }
  const payload = { body: logoFallbackSvg(stock), contentType: "image/svg+xml; charset=utf-8" };
  logoCache.set(symbol, payload);
  return payload;
}

async function getFvtStocks() {
  if (fvtCache && Date.now() - fvtCacheTime < CACHE_TTL_MS) {
    counters.cacheHits += 1;
    return fvtCache;
  }
  counters.cacheMisses += 1;
  return timedSource("FVT", async () => {
    const response = await fetchWithTimeout(FVT_STOCKS_URL);
    if (!response.ok) throw new Error(`FVT HTTP ${response.status}`);
    const json = await response.json();
    const rows = Array.isArray(json?.data?.data) ? json.data.data : [];
    fvtCache = rows;
    fvtCacheTime = Date.now();
    return rows;
  });
}

function parseFvtStock(stock) {
  const price = Number(stock?.anlikFiyat || stock?.fiyat || stock?.gunlukKapanis);
  const updated = stock?.sonGuncelleme
    ? Math.floor(new Date(stock.sonGuncelleme).getTime() / 1000)
    : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(price)) throw new Error("FVT price missing");
  return { price, updatedAt: updated, source: "FVT" };
}

async function getFvtQuote(symbol) {
  const rows = await getFvtStocks();
  const stock = rows.find((item) => String(item.hisseKodu || "").toUpperCase() === symbol);
  if (!stock) throw new Error(`${symbol} not found in FVT`);
  return parseFvtStock(stock);
}

async function getYahooChart(symbol, range = "1d", interval = "5m") {
  const key = `${symbol}:${range}:${interval}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.cacheTime < HISTORY_CACHE_TTL_MS) {
    counters.cacheHits += 1;
    return cached.data;
  }
  counters.cacheMisses += 1;
  return timedSource("Yahoo", async () => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Yahoo chart HTTP ${response.status}`);
    const json = await response.json();
    const result = json?.chart?.result?.[0];
    const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const closes = Array.isArray(result?.indicators?.quote?.[0]?.close) ? result.indicators.quote[0].close : [];
    const points = timestamps
      .map((time, index) => ({ time, close: typeof closes[index] === "number" ? closes[index] : null }))
      .filter((point) => typeof point.close === "number");
    const payload = { symbol, range, interval, points, meta: result?.meta || {} };
    historyCache.set(key, { cacheTime: Date.now(), data: payload });
    return payload;
  });
}

async function getYahooQuote(symbol) {
  const chart = await getYahooChart(symbol, "1d", "5m");
  const metaPrice = Number(chart.meta?.regularMarketPrice);
  const metaTime = Number(chart.meta?.regularMarketTime);
  if (Number.isFinite(metaPrice)) {
    return { price: metaPrice, updatedAt: Number.isFinite(metaTime) ? metaTime : Math.floor(Date.now() / 1000), source: "Yahoo Finance" };
  }
  const last = chart.points[chart.points.length - 1];
  if (!last) throw new Error(`Yahoo quote missing for ${symbol}`);
  return { price: last.close, updatedAt: last.time, source: "Yahoo Finance" };
}

async function getStooqQuote(symbol) {
  return timedSource("Stooq", async () => {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(symbol.toLowerCase() + ".us")}&f=sd2t2ohlcv&h&e=csv`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "text/csv" } }, 6000);
    if (!response.ok) throw new Error(`Stooq HTTP ${response.status}`);
    const csv = await response.text();
    const [headerLine, valueLine] = csv.trim().split(/\r?\n/);
    if (!headerLine || !valueLine) throw new Error(`Stooq quote missing for ${symbol}`);
    const headers = headerLine.split(",");
    const values = valueLine.split(",");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const close = Number(row.Close);
    if (!Number.isFinite(close) || close <= 0) throw new Error(`Stooq price missing for ${symbol}`);
    const timestamp = row.Date && row.Time && row.Date !== "N/D"
      ? Math.floor(new Date(`${row.Date}T${row.Time}`).getTime() / 1000)
      : Math.floor(Date.now() / 1000);
    return { price: close, updatedAt: timestamp, source: "Stooq" };
  });
}

function parseGooglePrice(html) {
  const lastPriceMatch = html.match(/data-last-price="([0-9.]+)"/);
  if (lastPriceMatch) return Number(lastPriceMatch[1]);
  const ariaMatch = html.match(/\$([0-9][0-9,.]*)/);
  return ariaMatch ? Number(ariaMatch[1].replace(/,/g, "")) : NaN;
}

async function getGoogleQuote(symbol) {
  return timedSource("Google", async () => {
    const exchanges = ["NASDAQ", "NYSE", "AMEX"];
    const errors = [];
    for (const exchange of exchanges) {
      try {
        const url = `https://www.google.com/finance/quote/${encodeURIComponent(symbol + ":" + exchange)}`;
        const response = await fetchWithTimeout(url, { headers: { Accept: "text/html" } }, 6000);
        if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
        const price = parseGooglePrice(await response.text());
        if (Number.isFinite(price) && price > 0) {
          return { price, updatedAt: Math.floor(Date.now() / 1000), source: "Google Finance" };
        }
        throw new Error("Google price missing");
      } catch (error) {
        errors.push(`${exchange}: ${error.message}`);
      }
    }
    throw new Error(errors.join("; "));
  });
}

async function getYahooPerformance(symbol) {
  const key = symbol.toUpperCase();
  const cached = performanceCache.get(key);
  if (cached && Date.now() - cached.cacheTime < PERFORMANCE_CACHE_TTL_MS) {
    counters.cacheHits += 1;
    return cached.data;
  }
  counters.cacheMisses += 1;
  const history = await getYahooChart(key, "2y", "1d");
  const points = history.points;
  const latest = points[points.length - 1];
  if (!latest) throw new Error(`Yahoo performance not found for ${key}`);
  const monthSeconds = 30.4375 * 24 * 60 * 60;
  const returns = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const targetTime = latest.time - month * monthSeconds;
    const base = [...points].reverse().find((point) => point.time <= targetTime);
    return { month, percent: base?.close ? ((latest.close - base.close) / base.close) * 100 : null };
  });
  const payload = { symbol: key, updatedAt: latest.time, latestClose: latest.close, returns, points };
  performanceCache.set(key, { cacheTime: Date.now(), data: payload });
  return payload;
}

async function getYahooNews(symbol) {
  const key = symbol.toUpperCase();
  const cached = newsCache.get(key);
  if (cached && Date.now() - cached.cacheTime < 15 * 60_000) {
    counters.cacheHits += 1;
    return cached.data;
  }
  counters.cacheMisses += 1;
  const payload = await timedSource("Yahoo", async () => {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(key)}&region=US&lang=en-US`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/rss+xml,text/xml" } }, 7000);
    if (!response.ok) throw new Error(`Yahoo news HTTP ${response.status}`);
    const xml = await response.text();
    const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g)).slice(0, 6).map((match) => {
      const item = match[1];
      return normalizeNewsItem({
        symbol: key,
        title: decodeXml(readXml(item, "title")),
        link: decodeXml(readXml(item, "link")),
        publishedAt: decodeXml(readXml(item, "pubDate")),
        source: "Yahoo Finance RSS"
      });
    }).filter((item) => item.title);
    return {
      symbol: key,
      items,
      impactSummary: summarizeNewsImpact(items),
      updatedAt: Math.floor(Date.now() / 1000),
      source: "Yahoo Finance RSS"
    };
  });
  newsCache.set(key, { cacheTime: Date.now(), data: payload });
  return payload;
}

const SENTIMENT_KEYWORDS = {
  positive: [
    "beat", "beats", "surge", "surges", "gain", "gains", "growth", "upgrade", "upgrades",
    "bullish", "buyback", "record", "strong", "outperform", "outperforms", "partnership",
    "profit", "profits", "expands", "expansion", "raise", "raises", "raised", "optimistic"
  ],
  negative: [
    "miss", "misses", "drop", "drops", "fall", "falls", "plunge", "plunges", "downgrade",
    "downgrades", "lawsuit", "probe", "investigation", "weak", "warning", "cuts", "cut",
    "delay", "delays", "recall", "decline", "declines", "loss", "losses", "bearish", "risk"
  ],
  impact: [
    "earnings", "guidance", "forecast", "merger", "acquisition", "buyout", "sec", "fda",
    "tariff", "bankruptcy", "ipo", "dividend", "layoffs", "share offering", "antitrust",
    "restructuring", "rating", "target price", "outlook", "results"
  ]
};

function normalizeNewsItem(item) {
  const title = String(item?.title || "").trim();
  const url = String(item?.link || item?.url || "").trim();
  const publishedAt = normalizePublishedAt(item?.publishedAt);
  const source = normalizeNewsSource(item?.source, url);
  const scores = scoreNewsTitle(title);
  return {
    title,
    source,
    publishedAt,
    url,
    link: url,
    symbol: String(item?.symbol || "").toUpperCase(),
    sentiment: scores.sentiment,
    sentimentScore: scores.sentimentScore,
    impact: scores.impact,
    impactScore: scores.impactScore,
    turkishSummary: buildTurkishNewsSummary({
      title,
      symbol: item?.symbol,
      source,
      sentiment: scores.sentiment,
      impact: scores.impact
    })
  };
}

function normalizePublishedAt(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function normalizeNewsSource(source, url) {
  const explicit = String(source || "").trim();
  if (explicit && explicit !== "Yahoo Finance RSS") return explicit;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname || explicit || "Yahoo Finance RSS";
  } catch {
    return explicit || "Yahoo Finance RSS";
  }
}

function scoreNewsTitle(title) {
  const text = String(title || "").toLowerCase();
  const positiveHits = countKeywordHits(text, SENTIMENT_KEYWORDS.positive);
  const negativeHits = countKeywordHits(text, SENTIMENT_KEYWORDS.negative);
  const impactHits = countKeywordHits(text, SENTIMENT_KEYWORDS.impact);
  const exclamationBoost = (text.match(/!/g) || []).length > 0 ? 0.5 : 0;
  const sentimentScore = clampScore((positiveHits * 1.2) - (negativeHits * 1.2));
  const rawImpactScore = (impactHits * 1.5) + Math.max(positiveHits, negativeHits) * 0.4 + exclamationBoost;
  const impactScore = clampScore(rawImpactScore, 0, 5);
  return {
    sentiment: sentimentScore > 0.75 ? "positive" : sentimentScore < -0.75 ? "negative" : "neutral",
    sentimentScore,
    impact: impactScore >= 3 ? "high" : impactScore >= 1.5 ? "medium" : "low",
    impactScore
  };
}

function countKeywordHits(text, keywords) {
  return keywords.reduce((count, keyword) => count + (text.includes(keyword) ? 1 : 0), 0);
}

function clampScore(value, min = -5, max = 5) {
  return Math.max(min, Math.min(max, Number(value.toFixed(2))));
}

function buildTurkishNewsSummary({ title, symbol, source, sentiment, impact }) {
  const cleanTitle = String(title || "").replace(/\s+/g, " ").trim();
  const symbolText = String(symbol || "").toUpperCase() || "hisse";
  const sentimentText = sentiment === "positive" ? "olumlu" : sentiment === "negative" ? "olumsuz" : "nötr";
  const impactText = impact === "high" ? "yüksek etkili" : impact === "medium" ? "orta etkili" : "düşük etkili";
  if (cleanTitle) {
    return `${symbolText} için ${impactText} ve ${sentimentText} tonda haber: ${cleanTitle}`;
  }
  return `${source || "Kaynak"} haberinde ${symbolText} için ${impactText}, ${sentimentText} bir görünüm öne çıkıyor.`;
}

function summarizeNewsImpact(items) {
  const summary = {
    totalCount: items.length,
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    highImpactCount: 0,
    aggregateSentimentScore: 0,
    aggregateImpactScore: 0,
    averageSentimentScore: 0,
    averageImpactScore: 0
  };
  for (const item of items) {
    if (item.sentiment === "positive") summary.positiveCount += 1;
    else if (item.sentiment === "negative") summary.negativeCount += 1;
    else summary.neutralCount += 1;
    if (item.impact === "high") summary.highImpactCount += 1;
    summary.aggregateSentimentScore += Number(item.sentimentScore || 0);
    summary.aggregateImpactScore += Number(item.impactScore || 0);
  }
  if (items.length) {
    summary.aggregateSentimentScore = Number(summary.aggregateSentimentScore.toFixed(2));
    summary.aggregateImpactScore = Number(summary.aggregateImpactScore.toFixed(2));
    summary.averageSentimentScore = Number((summary.aggregateSentimentScore / items.length).toFixed(2));
    summary.averageImpactScore = Number((summary.aggregateImpactScore / items.length).toFixed(2));
  }
  return summary;
}

function readXml(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "") : "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function getFinvizAnalysis(symbol) {
  const key = symbol.toUpperCase();
  const cached = analysisCache.get(key);
  if (cached && Date.now() - cached.cacheTime < 6 * 60 * 60_000) {
    counters.cacheHits += 1;
    return cached.data;
  }
  counters.cacheMisses += 1;
  const payload = await timedSource("Finviz", async () => {
    const url = `https://finviz.com/quote.ashx?t=${encodeURIComponent(key)}&p=d`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "text/html" } }, 9000);
    if (!response.ok) throw new Error(`Finviz HTTP ${response.status}`);
    const html = await response.text();
    const targetMeanPrice = parseNumberFromText(readFinvizField(html, "Target Price"));
    const recommendation = parseNumberFromText(readFinvizField(html, "Recom"));
    const earningsDate = readFinvizField(html, "Earnings") || null;
    const pe = readFinvizField(html, "P/E") || null;
    const epsTtm = readFinvizField(html, "EPS (ttm)") || null;
    return {
      symbol: key,
      source: "Finviz HTML",
      updatedAt: Math.floor(Date.now() / 1000),
      targetMeanPrice,
      recommendation,
      earningsDate,
      pe,
      epsTtm,
      available: !!(targetMeanPrice || recommendation || earningsDate)
    };
  });
  analysisCache.set(key, { cacheTime: Date.now(), data: payload });
  return payload;
}

function readFinvizField(html, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<div class="snapshot-td-label"(?:[^>]*)>(?:<a[^>]*>)?${escapedLabel}(?:<\\/a>)?<\\/div><\\/td><td[^>]*><div class="snapshot-td-content">([\\s\\S]*?)<\\/div><\\/td>`, "i");
  const match = html.match(pattern);
  return match ? stripHtml(match[1]) : null;
}

function stripHtml(value) {
  return decodeXml(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim());
}

function parseNumberFromText(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function volatility(points, days = 20) {
  const values = points.slice(-days - 1).map((point) => point.close).filter(Number.isFinite);
  if (values.length < 3) return null;
  const returns = values.slice(1).map((value, index) => ((value - values[index]) / values[index]) * 100);
  const avg = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / returns.length;
  return Math.sqrt(variance);
}

async function createSnapshot(symbol) {
  const stock = catalogMap.get(symbol) || {
    symbol,
    company: symbol,
    category: "Özel Hisseler",
    categoryDescription: "Kullanıcı tarafından eklenen özel hisse",
    fibTarget: null,
    logo: ""
  };
  const isCatalogStock = catalogMap.has(symbol);
  const cached = snapshotCache.get(symbol);
  if (cached && Date.now() - cached.cacheTime < CACHE_TTL_MS) {
    counters.cacheHits += 1;
    return cached.data;
  }
  counters.cacheMisses += 1;
  const warnings = [];
  let quote;
  let fallbackLevel = 0;
  const liveSources = [
    ["Yahoo", () => getYahooQuote(symbol)],
    ["Stooq", () => getStooqQuote(symbol)],
    ...(isCatalogStock ? [["FVT", () => getFvtQuote(symbol)]] : []),
    ["Google", () => getGoogleQuote(symbol)]
  ];
  for (let index = 0; index < liveSources.length; index += 1) {
    const [name, getter] = liveSources[index];
    try {
      quote = await getter();
      fallbackLevel = index;
      break;
    } catch (error) {
      warnings.push(`${name}: ${error.message}`);
    }
  }
  if (!quote) {
    fallbackLevel = liveSources.length;
    const previous = snapshotCache.get(symbol)?.data;
    if (previous) {
      quote = { price: previous.price, updatedAt: previous.updatedAt, source: "lastKnown" };
    } else if (lastKnownPrices[symbol]) {
      quote = { price: lastKnownPrices[symbol], updatedAt: Math.floor(Date.now() / 1000), source: "lastKnown" };
    } else {
      throw new Error(warnings.join("; "));
    }
  }
  if (quote.source === "lastKnown") {
    sourceStats.lastKnown.success += 1;
    sourceStats.lastKnown.lastSuccess = Math.floor(Date.now() / 1000);
  }
  const performance = performanceCache.get(symbol)?.data || null;
  const price = Number(quote.price);
  const fib = Number(stock.fibTarget);
  const sourceFreshnessSec = Math.max(0, Math.floor(Date.now() / 1000) - Number(quote.updatedAt || 0));
  const snapshot = {
    ...stock,
    price,
    currency: "USD",
    updatedAt: quote.updatedAt,
    source: quote.source,
    sourcePriority: SOURCE_PRIORITY,
    sourceFreshnessSec,
    isLive: fallbackLevel < 4 && sourceFreshnessSec < MARKET_STALE_SEC,
    isStale: sourceFreshnessSec >= MARKET_STALE_SEC || fallbackLevel >= 4,
    fallbackLevel,
    cacheAgeMs: cached ? Date.now() - cached.cacheTime : 0,
    warnings,
    metrics: {
      fibDistanceAbs: Number.isFinite(price) && Number.isFinite(fib) ? fib - price : null,
      fibDistancePct: Number.isFinite(price) && Number.isFinite(fib) && fib !== 0 ? ((fib - price) / fib) * 100 : null,
      momentum1m: performance?.returns?.find((item) => item.month === 1)?.percent ?? null,
      momentum3m: performance?.returns?.find((item) => item.month === 3)?.percent ?? null,
      momentum12m: performance?.returns?.find((item) => item.month === 12)?.percent ?? null,
      volatility20d: performance?.points ? volatility(performance.points, 20) : null,
      sourceFreshnessSec
    }
  };
  snapshotCache.set(symbol, { cacheTime: Date.now(), data: snapshot });
  return snapshot;
}

async function createSignal(symbol, options = {}) {
  const key = String(symbol || "").toUpperCase();
  try {
    const [snapshotResult, performanceResult, newsResult] = await Promise.allSettled([
      createSnapshot(key),
      getYahooPerformance(key),
      getYahooNews(key)
    ]);
    const snapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : { symbol: key };
    const performance = performanceResult.status === "fulfilled" ? performanceResult.value : null;
    const news = newsResult.status === "fulfilled" ? newsResult.value : null;
    const summary = news?.impactSummary || {};
    const sentimentScore = Number(summary.averageSentimentScore || 0);
    const impactScore = Number(summary.averageImpactScore || 0);
    const stock = catalogMap.get(key) || nasdaqUniverseCache?.data?.find((row) => row.symbol === key) || { symbol: key, fibTarget: null };
    return computeSignal({
      symbol: key,
      price: snapshot.price,
      points: performance?.points || [],
      fibTarget: Number(stock.fibTarget),
      alertThreshold: Number(options.alertThreshold || 0.5),
      newsSentiment: sentimentScore > 0.25 ? "positive" : sentimentScore < -0.25 ? "negative" : "neutral",
      newsImpact: impactScore >= 2.5 || Number(summary.highImpactCount) > 0 ? "high" : impactScore >= 1.25 ? "medium" : "low",
      freshnessSec: snapshot.sourceFreshnessSec
    });
  } catch (error) {
    return {
      symbol: key,
      signal: "insufficient_data",
      label: "Veri Yetersiz",
      score: 0,
      confidence: 0,
      direction: "flat",
      indicators: {},
      reasons: [error.message],
      risk: "medium",
      newsImpact: "low",
      targetStatus: "unknown",
      freshnessSec: null,
      generatedAt: Math.floor(Date.now() / 1000)
    };
  }
}

function parseSymbols(value) {
  return Array.from(new Set(String(value || "").split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))).slice(0, MAX_BATCH);
}

async function refreshNasdaqUniverseIfDue() {
  if (nasdaqUniverseCache?.data?.length && Date.now() - nasdaqUniverseCacheTime < NASDAQ_UNIVERSE_TTL_MS) return;
  try {
    await getNasdaqUniverse({ force: true });
  } catch (error) {
    pushErrorLog({ url: "/api/nasdaq-universe/daily-refresh" }, error);
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 200, { success: true });
  if (isRateLimited(req)) return sendJson(res, 429, { success: false, message: "Rate limit exceeded" });
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  recordEndpoint(url.pathname);
  try {
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { success: true, data: { service: "hisse-price-proxy", version: VERSION, uptimeSec: Math.floor(process.uptime()), now: Math.floor(Date.now() / 1000), sourcePriority: SOURCE_PRIORITY, capabilities: ["snapshots", "history", "performance", "signals", "status"] } });
    }
    if (url.pathname === "/api/status") {
      return sendJson(res, 200, { success: true, data: { counters, sources: sourceStats, sourcePriority: SOURCE_PRIORITY, errorLog, rateLimit: { windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }, cache: { fvtReady: !!fvtCache, history: historyCache.size, performance: performanceCache.size, snapshots: snapshotCache.size, logos: logoCache.size, news: newsCache.size, analysis: analysisCache.size, nasdaqUniverse: nasdaqUniverseCache?.data?.length || 0 }, catalog: { count: catalog.length } } });
    }
    if (url.pathname === "/api/nasdaq-universe" || url.pathname === "/api/nasdaq-universe/sync") {
      const force = url.pathname.endsWith("/sync") || url.searchParams.get("force") === "1";
      const universe = await getNasdaqUniverse({ force });
      const rows = filterNasdaqUniverse(universe.data, url.searchParams.get("q"), url.searchParams.get("limit"));
      return sendJson(res, 200, { success: true, data: { rows, count: universe.count || universe.data.length, returned: rows.length, source: universe.source, savedAt: universe.savedAt, stale: Boolean(universe.stale), errors: universe.errors || [] } });
    }
    const nasdaqUniverseMatch = url.pathname.match(/^\/api\/nasdaq-universe\/([^/]+)$/);
    if (nasdaqUniverseMatch) {
      const symbol = normalizeNasdaqSymbol(decodeURIComponent(nasdaqUniverseMatch[1]));
      const universe = await getNasdaqUniverse({ force: url.searchParams.get("force") === "1" });
      const row = universe.data.find((item) => item.symbol === symbol);
      return row
        ? sendJson(res, 200, { success: true, data: { ...row, source: universe.source, savedAt: universe.savedAt } })
        : sendJson(res, 404, { success: false, message: `${symbol} Nasdaq evreninde bulunamadı` });
    }
    if (url.pathname === "/api/fallback-report") {
      const snapshots = Array.from(snapshotCache.values()).map((entry) => entry.data);
      const bySource = snapshots.reduce((acc, snapshot) => {
        acc[snapshot.source] = (acc[snapshot.source] || 0) + 1;
        return acc;
      }, {});
      return sendJson(res, 200, { success: true, data: { sourcePriority: SOURCE_PRIORITY, bySource, cachedSnapshots: snapshots.length, errors: errorLog.slice(0, 10) } });
    }
    const logoMatch = url.pathname.match(/^\/api\/logo\/([^/]+)$/);
    if (logoMatch) {
      const logo = await getLogo(decodeURIComponent(logoMatch[1]).toUpperCase());
      return sendImage(res, 200, logo.body, logo.contentType);
    }
    if (url.pathname === "/api/stocks") {
      const stocks = await getFvtStocks();
      return sendJson(res, 200, { success: true, data: { data: stocks }, source: "FVT" });
    }
    if (url.pathname === "/api/snapshots") {
      const symbols = parseSymbols(url.searchParams.get("symbols"));
      const results = await Promise.all(symbols.map(async (symbol) => {
        try { return await createSnapshot(symbol); }
        catch (error) { return { symbol, error: true, message: error.message, status: error.status || 502 }; }
      }));
      return sendJson(res, 200, { success: true, data: results });
    }
    if (url.pathname === "/api/signals") {
      const symbols = parseSymbols(url.searchParams.get("symbols"));
      const alertThreshold = Number(url.searchParams.get("alertThreshold") || 0.5);
      const results = await Promise.all(symbols.map((symbol) => createSignal(symbol, { alertThreshold })));
      return sendJson(res, 200, { success: true, data: results, source: "FVT Signal Engine" });
    }
    const snapshotMatch = url.pathname.match(/^\/api\/snapshot\/([^/]+)$/);
    if (snapshotMatch) {
      const snapshot = await createSnapshot(decodeURIComponent(snapshotMatch[1]).toUpperCase());
      return sendJson(res, 200, { success: true, data: snapshot });
    }
    const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
    if (historyMatch) {
      const symbol = decodeURIComponent(historyMatch[1]).toUpperCase();
      const range = url.searchParams.get("range") || "1d";
      const interval = url.searchParams.get("interval") || "5m";
      if (!ALLOWED_RANGES.has(range) || !ALLOWED_INTERVALS.has(interval)) return sendJson(res, 400, { success: false, message: "Invalid range or interval" });
      const chart = await getYahooChart(symbol, range, interval);
      return sendJson(res, 200, { success: true, data: chart, source: "Yahoo Finance" });
    }
    const chartMatch = url.pathname.match(/^\/api\/chart\/([^/]+)$/);
    if (chartMatch) {
      const chart = await getYahooChart(decodeURIComponent(chartMatch[1]).toUpperCase(), "1d", "5m");
      return sendJson(res, 200, { success: true, data: chart, source: "Yahoo Finance" });
    }
    const quoteMatch = url.pathname.match(/^\/api\/quote\/([^/]+)$/);
    if (quoteMatch) {
      const quote = await getYahooQuote(decodeURIComponent(quoteMatch[1]).toUpperCase());
      return sendJson(res, 200, { success: true, data: { symbol: decodeURIComponent(quoteMatch[1]).toUpperCase(), price: quote.price, updatedAt: quote.updatedAt }, source: "Yahoo Finance" });
    }
    const performanceMatch = url.pathname.match(/^\/api\/performance\/([^/]+)$/);
    if (performanceMatch) {
      const performance = await getYahooPerformance(decodeURIComponent(performanceMatch[1]).toUpperCase());
      return sendJson(res, 200, { success: true, data: performance, source: "Yahoo Finance" });
    }
    const newsMatch = url.pathname.match(/^\/api\/news\/([^/]+)$/);
    if (newsMatch) {
      const news = await getYahooNews(decodeURIComponent(newsMatch[1]).toUpperCase());
      return sendJson(res, 200, { success: true, data: news, source: "Yahoo Finance RSS" });
    }
    const analysisMatch = url.pathname.match(/^\/api\/analysis\/([^/]+)$/);
    if (analysisMatch) {
      const analysis = await getFinvizAnalysis(decodeURIComponent(analysisMatch[1]).toUpperCase());
      return sendJson(res, 200, { success: true, data: analysis, source: analysis.source });
    }
    const stockMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)$/);
    if (stockMatch) {
      const symbol = decodeURIComponent(stockMatch[1]).toUpperCase();
      const rows = await getFvtStocks();
      const stock = rows.find((item) => String(item.hisseKodu || "").toUpperCase() === symbol);
      return sendJson(res, 200, stock ? { success: true, data: stock, source: "FVT" } : { success: false, message: `${symbol} bulunamadı` });
    }
    return sendJson(res, 404, { success: false, message: "Not found" });
  } catch (error) {
    pushErrorLog(req, error);
    return sendJson(res, error.status || 502, { success: false, message: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`FVT fiyat proxy calisiyor: http://127.0.0.1:${PORT}`);
  setTimeout(refreshNasdaqUniverseIfDue, 10_000).unref?.();
  setInterval(refreshNasdaqUniverseIfDue, NASDAQ_UNIVERSE_TTL_MS).unref?.();
});
