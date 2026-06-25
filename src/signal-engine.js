export const SIGNAL_LABELS = {
  strong_buy: "Güçlü Al",
  buy: "Al",
  watch: "İzle",
  neutral: "Nötr",
  risky: "Riskli",
  sell: "Sat",
  insufficient_data: "Veri Yetersiz"
};

export const ALERT_TYPES = [
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

export function alertTypeLabel(type) {
  return {
    target_near: "Fiyat hedefe yaklaştı",
    fib_breakout: "Fib hedef kırıldı",
    rsi_extreme: "RSI aşırı satım/alım",
    macd_cross: "MACD kesişimi",
    ma_trend_break: "MA trend kırılımı",
    bollinger_breakout: "Bollinger kırılımı",
    volume_spike: "Hacim sıçraması",
    news_high: "Haber etkisi yüksek",
    risk_rising: "Risk yükseldi"
  }[type] || type;
}

export function defaultAlarmRules() {
  return [
    { id: "default-target-near", name: "Fib hedefe yakın", type: "target_near", scope: "all", threshold: 1, enabled: true },
    { id: "default-rsi-extreme", name: "RSI aşırı bölge", type: "rsi_extreme", scope: "all", threshold: 30, enabled: true },
    { id: "default-news-high", name: "Yüksek etkili haber", type: "news_high", scope: "all", enabled: true }
  ];
}

export function computeSignal(input = {}) {
  const symbol = String(input.symbol || "").toUpperCase();
  const points = normalizePoints(input.points);
  const price = numberOrNull(input.price) ?? points.at(-1)?.close ?? null;
  if (!symbol || points.length < 30 || !Number.isFinite(price)) return emptySignal(symbol, price);

  const indicators = computeIndicators(points, price);
  const fibTarget = numberOrNull(input.fibTarget);
  const targetDistancePct = Number.isFinite(fibTarget) && fibTarget !== 0 ? ((fibTarget - price) / fibTarget) * 100 : null;
  const targetStatus = getTargetStatus(price, fibTarget, numberOrNull(input.alertThreshold) ?? 0.5);
  const newsSentiment = input.newsSentiment || "neutral";
  const newsImpact = input.newsImpact || "low";
  const freshnessSec = numberOrNull(input.freshnessSec);
  const reasons = [];
  let raw = 0;

  raw += scoreReason(indicators.sma50 > indicators.sma200, 16, -16, reasons, "MA50 MA200 üstünde", "MA50 MA200 altında");
  raw += scoreReason(indicators.sma20 > indicators.sma50, 10, -8, reasons, "MA20 MA50 üstünde", "MA20 MA50 altında");
  raw += scoreReason(indicators.macdHistogram > 0, 12, -12, reasons, "MACD pozitif bölgede", "MACD negatif bölgede");
  raw += scoreReason(indicators.rsi14 < 35, 8, indicators.rsi14 > 72 ? -10 : 0, reasons, `RSI ${round(indicators.rsi14, 1)} aşırı satıma yakın`, `RSI ${round(indicators.rsi14, 1)} aşırı alıma yakın`);
  raw += scoreReason(indicators.high52wDistancePct > -25, 8, -6, reasons, "Fiyat 52 hafta zirvesine makul yakın", "Fiyat 52 hafta zirvesinden uzak");
  raw += scoreReason(indicators.momentum20d > 0, 12, -10, reasons, `20 günlük momentum ${round(indicators.momentum20d, 1)}%`, `20 günlük momentum ${round(indicators.momentum20d, 1)}%`);

  if (targetStatus === "near") {
    raw += 8;
    reasons.push(`Fib hedefe ${round(Math.abs(targetDistancePct), 2)}% kaldı`);
  } else if (targetStatus === "above") {
    raw -= 4;
    reasons.push(`Fiyat Fib hedef üstünde ${round(Math.abs(targetDistancePct), 2)}%`);
  }

  if (newsSentiment === "positive") {
    raw += newsImpact === "high" ? 10 : 5;
    reasons.push(`Haber etkisi pozitif (${newsImpact})`);
  } else if (newsSentiment === "negative") {
    raw -= newsImpact === "high" ? 12 : 6;
    reasons.push(`Haber etkisi negatif (${newsImpact})`);
  }
  if (indicators.atr14Pct > 7) {
    raw -= 8;
    reasons.push(`ATR volatilitesi yüksek: ${round(indicators.atr14Pct, 1)}%`);
  }
  if (Number.isFinite(freshnessSec) && freshnessSec > 72 * 60 * 60) {
    raw -= 8;
    reasons.push("Veri eski, sinyal güveni düşürüldü");
  }

  const score = Math.max(0, Math.min(100, Math.round(50 + raw)));
  const riskScore = computeRiskScore({ indicators, newsSentiment, newsImpact, targetStatus, freshnessSec });
  const signal = classifySignal(score, riskScore, indicators);
  return {
    symbol,
    price,
    signal,
    label: SIGNAL_LABELS[signal] || signal,
    score,
    confidence: computeConfidence({ points, indicators, freshnessSec, reasons }),
    direction: signal === "strong_buy" || signal === "buy" ? "up" : signal === "sell" || signal === "risky" ? "down" : "flat",
    indicators,
    reasons: reasons.slice(0, 6),
    risk: riskScore >= 70 ? "high" : riskScore >= 40 ? "medium" : "low",
    riskScore,
    newsImpact,
    newsSentiment,
    targetStatus,
    targetDistancePct,
    freshnessSec,
    generatedAt: Math.floor(Date.now() / 1000)
  };
}

export function computeIndicators(points, latestPrice) {
  const closes = points.map((point) => point.close).filter(Number.isFinite);
  const volumes = points.map((point) => point.volume).filter(Number.isFinite);
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine = ema12.map((value, index) => Number.isFinite(value) && Number.isFinite(ema26[index]) ? value - ema26[index] : null).filter(Number.isFinite);
  const macdSignal = emaSeries(macdLine, 9).at(-1) ?? null;
  const macd = macdLine.at(-1) ?? null;
  const bollinger = bollingerBands(closes, 20);
  const high52w = Math.max(...closes.slice(-252));
  const low52w = Math.min(...closes.slice(-252));
  const latestVolume = volumes.at(-1) ?? null;
  const avgVolume20 = volumes.length ? sma(volumes, Math.min(20, volumes.length)) : null;
  const atr14 = atr(points, 14);
  return {
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    sma150: sma(closes, 150),
    sma200: sma(closes, 200),
    ema12: ema12.at(-1) ?? null,
    ema26: ema26.at(-1) ?? null,
    macd,
    macdSignal,
    macdHistogram: Number.isFinite(macd) && Number.isFinite(macdSignal) ? macd - macdSignal : null,
    rsi14: rsi(closes, 14),
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    bollingerBandwidthPct: Number.isFinite(bollinger.upper) && Number.isFinite(bollinger.lower) && Number.isFinite(bollinger.middle) && bollinger.middle !== 0 ? ((bollinger.upper - bollinger.lower) / bollinger.middle) * 100 : null,
    atr14,
    atr14Pct: Number.isFinite(atr14) && latestPrice ? (atr14 / latestPrice) * 100 : null,
    high52w,
    low52w,
    high52wDistancePct: Number.isFinite(high52w) && high52w ? ((latestPrice - high52w) / high52w) * 100 : null,
    low52wDistancePct: Number.isFinite(low52w) && low52w ? ((latestPrice - low52w) / low52w) * 100 : null,
    momentum20d: momentum(closes, 20),
    momentum60d: momentum(closes, 60),
    avgVolume20,
    latestVolume,
    volumeSpikeRatio: Number.isFinite(latestVolume) && Number.isFinite(avgVolume20) && avgVolume20 > 0 ? latestVolume / avgVolume20 : null
  };
}

export function evaluateAlarmRules(rules = [], context = {}) {
  return rules
    .filter((rule) => rule && rule.enabled !== false)
    .filter((rule) => matchesRuleScope(rule, context.row || context))
    .map((rule) => evaluateAlarmRule(rule, context))
    .filter(Boolean);
}

export function evaluateAlarmRule(rule = {}, context = {}) {
  const row = context.row || context;
  const signal = context.signal || row.signalDetail || row.signal || {};
  const type = String(rule.type || "");
  const threshold = numberOrNull(rule.threshold);
  const keyBase = `${rule.id || type}:${row.symbol}:${Math.floor((signal.generatedAt || Date.now() / 1000) / 300)}`;
  const make = (message, severity = "info") => ({ id: `${keyBase}:${type}`, ruleId: rule.id, symbol: row.symbol, type, title: rule.name || alertTypeLabel(type), message, severity, createdAt: Date.now() });
  if (type === "target_near" && Number.isFinite(row.targetDistancePct) && Math.abs(row.targetDistancePct) <= (threshold ?? 1)) return make(`${row.symbol} Fib hedefe ${round(Math.abs(row.targetDistancePct), 2)}% uzaklıkta.`, "warning");
  if (type === "fib_breakout" && row.targetStatus === "above") return make(`${row.symbol} Fib hedef seviyesinin üstünde işlem görüyor.`, "success");
  if (type === "rsi_extreme" && Number.isFinite(signal.indicators?.rsi14) && (signal.indicators.rsi14 <= (threshold ?? 30) || signal.indicators.rsi14 >= 70)) return make(`${row.symbol} RSI ${round(signal.indicators.rsi14, 1)} seviyesinde.`, signal.indicators.rsi14 <= 30 ? "success" : "warning");
  if (type === "macd_cross" && Number.isFinite(signal.indicators?.macdHistogram) && Math.abs(signal.indicators.macdHistogram) <= (threshold ?? 0.5)) return make(`${row.symbol} MACD kesişim bölgesinde.`);
  if (type === "ma_trend_break" && Number.isFinite(signal.indicators?.sma50) && Number.isFinite(row.price) && row.price < signal.indicators.sma50) return make(`${row.symbol} fiyatı MA50 altına indi.`, "danger");
  if (type === "bollinger_breakout" && Number.isFinite(signal.indicators?.bollingerUpper) && Number.isFinite(row.price) && row.price > signal.indicators.bollingerUpper) return make(`${row.symbol} Bollinger üst bandını kırdı.`, "success");
  if (type === "volume_spike" && Number.isFinite(signal.indicators?.volumeSpikeRatio) && signal.indicators.volumeSpikeRatio >= (threshold ?? 1.8)) return make(`${row.symbol} hacim ortalamanın ${round(signal.indicators.volumeSpikeRatio, 1)} katı.`, "warning");
  if (type === "news_high" && row.newsImpact === "high") return make(`${row.symbol} için yüksek etkili haber akışı var.`, row.newsSentiment === "negative" ? "danger" : "success");
  if (type === "risk_rising" && (row.riskLevel === "high" || signal.risk === "high")) return make(`${row.symbol} risk seviyesi yüksek.`, "danger");
  return null;
}

function normalizePoints(points = []) {
  return points.map((point) => ({
    time: Number(point.time || point.date || 0),
    close: numberOrNull(point.close ?? point.price ?? point.adjClose),
    high: numberOrNull(point.high ?? point.close ?? point.price),
    low: numberOrNull(point.low ?? point.close ?? point.price),
    volume: numberOrNull(point.volume)
  })).filter((point) => Number.isFinite(point.close) && point.close > 0);
}

function scoreReason(condition, positive, negative, reasons, positiveText, negativeText) {
  if (condition === true) {
    if (positiveText) reasons.push(positiveText);
    return positive;
  }
  if (condition === false) {
    if (negativeText && negative) reasons.push(negativeText);
    return negative;
  }
  return 0;
}

function sma(values, period) {
  const slice = values.filter(Number.isFinite).slice(-period);
  if (!slice.length || slice.length < Math.min(period, values.length)) return null;
  return slice.reduce((sum, value) => sum + value, 0) / slice.length;
}

function emaSeries(values, period) {
  const multiplier = 2 / (period + 1);
  const output = [];
  let previous = null;
  for (const value of values.map(numberOrNull)) {
    if (!Number.isFinite(value)) {
      output.push(null);
      continue;
    }
    previous = previous === null ? value : (value - previous) * multiplier + previous;
    output.push(previous);
  }
  return output;
}

function rsi(values, period = 14) {
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

function bollingerBands(values, period = 20) {
  const slice = values.slice(-period);
  if (slice.length < period) return { upper: null, middle: null, lower: null };
  const middle = slice.reduce((sum, value) => sum + value, 0) / slice.length;
  const variance = slice.reduce((sum, value) => sum + Math.pow(value - middle, 2), 0) / slice.length;
  const deviation = Math.sqrt(variance);
  return { upper: middle + deviation * 2, middle, lower: middle - deviation * 2 };
}

function atr(points, period = 14) {
  if (points.length <= period) return null;
  const ranges = points.slice(1).map((point, index) => {
    const prev = points[index];
    const high = Number.isFinite(point.high) ? point.high : point.close;
    const low = Number.isFinite(point.low) ? point.low : point.close;
    return Math.max(high - low, Math.abs(high - prev.close), Math.abs(low - prev.close));
  }).slice(-period);
  return ranges.reduce((sum, value) => sum + value, 0) / ranges.length;
}

function momentum(values, period) {
  if (values.length <= period) return null;
  const latest = values.at(-1);
  const base = values.at(-period - 1);
  return Number.isFinite(base) && base !== 0 ? ((latest - base) / base) * 100 : null;
}

function classifySignal(score, riskScore, indicators) {
  if (riskScore >= 76) return "risky";
  if (score >= 78 && indicators.sma50 > indicators.sma200) return "strong_buy";
  if (score >= 62) return "buy";
  if (score >= 52) return "watch";
  if (score <= 32) return "sell";
  return "neutral";
}

function computeRiskScore({ indicators, newsSentiment, newsImpact, targetStatus, freshnessSec }) {
  let risk = 20;
  if (indicators.atr14Pct > 8) risk += 24;
  else if (indicators.atr14Pct > 5) risk += 12;
  if (indicators.rsi14 > 75) risk += 12;
  if (indicators.sma20 < indicators.sma50) risk += 10;
  if (newsSentiment === "negative") risk += newsImpact === "high" ? 18 : 8;
  if (targetStatus === "above") risk += 6;
  if (Number.isFinite(freshnessSec) && freshnessSec > 72 * 60 * 60) risk += 12;
  return Math.max(0, Math.min(100, Math.round(risk)));
}

function computeConfidence({ points, indicators, freshnessSec, reasons }) {
  let confidence = 45;
  if (points.length >= 200) confidence += 25;
  else if (points.length >= 80) confidence += 15;
  if (Number.isFinite(indicators.rsi14)) confidence += 8;
  if (Number.isFinite(indicators.macdHistogram)) confidence += 8;
  if (Number.isFinite(indicators.atr14Pct)) confidence += 6;
  if (reasons.length >= 4) confidence += 5;
  if (Number.isFinite(freshnessSec) && freshnessSec > 72 * 60 * 60) confidence -= 15;
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function matchesRuleScope(rule, row) {
  if ((rule.scope || "all") === "all") return true;
  if (rule.scope === "symbol") return String(rule.symbol || "").toUpperCase() === String(row.symbol || "").toUpperCase();
  if (rule.scope === "category") return String(rule.category || "") === String(row.category || "");
  return true;
}

function getTargetStatus(price, target, threshold) {
  if (!Number.isFinite(price) || !Number.isFinite(target) || target === 0) return "unknown";
  const distance = ((target - price) / target) * 100;
  if (Math.abs(distance) <= threshold) return "near";
  return price > target ? "above" : "below";
}

function emptySignal(symbol, price) {
  return {
    symbol,
    price,
    signal: "insufficient_data",
    label: SIGNAL_LABELS.insufficient_data,
    score: 0,
    confidence: 0,
    direction: "flat",
    indicators: {},
    reasons: ["Sinyal için yeterli geçmiş veri yok."],
    risk: "medium",
    riskScore: 50,
    newsImpact: "low",
    newsSentiment: "neutral",
    targetStatus: "unknown",
    targetDistancePct: null,
    freshnessSec: null,
    generatedAt: Math.floor(Date.now() / 1000)
  };
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}
