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

export const FIB_LEVEL_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.414, 1.618, 2, 2.618];

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
    { id: "default-macd-cross", name: "MACD kesişim takibi", type: "macd_cross", scope: "all", threshold: 0.35, enabled: true },
    { id: "default-volume-spike", name: "Hacim sıçraması", type: "volume_spike", scope: "all", threshold: 1.8, enabled: true },
    { id: "default-news-high", name: "Yüksek etkili haber", type: "news_high", scope: "all", enabled: true }
  ];
}

export function computeSignal(input = {}) {
  const symbol = String(input.symbol || "").toUpperCase();
  const points = normalizePoints(input.points);
  const price = numberOrNull(input.price) ?? points.at(-1)?.close ?? null;
  if (!symbol || points.length < 30 || !Number.isFinite(price)) return emptySignal(symbol, price);

  const fibTarget = numberOrNull(input.fibTarget);
  const indicators = computeIndicators(points, price);
  const fibPlan = computeDynamicFibPlan(points, price, fibTarget);
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
  raw += scoreReason(indicators.macdCross === "bullish", 7, indicators.macdCross === "bearish" ? -9 : 0, reasons, "MACD yukarı kesişim verdi", "MACD aşağı kesişim verdi");
  raw += scoreReason(indicators.rsi14 < 35, 8, indicators.rsi14 > 72 ? -10 : 0, reasons, `RSI ${round(indicators.rsi14, 1)} aşırı satıma yakın`, `RSI ${round(indicators.rsi14, 1)} aşırı alıma yakın`);
  raw += scoreReason(indicators.bollingerPosition === "lower", 5, indicators.bollingerPosition === "upper" ? -6 : 0, reasons, "Fiyat Bollinger alt bandına yakın", "Fiyat Bollinger üst bandında");
  raw += scoreReason(indicators.volumeSpikeRatio >= 1.8 && indicators.momentum20d > 0, 6, 0, reasons, `Hacim ortalamanın ${round(indicators.volumeSpikeRatio, 1)} katı`, "");
  raw += scoreReason(indicators.high52wDistancePct > -25, 8, -6, reasons, "Fiyat 52 hafta zirvesine makul yakın", "Fiyat 52 hafta zirvesinden uzak");
  raw += scoreReason(indicators.momentum20d > 0, 12, -10, reasons, `20 günlük momentum ${round(indicators.momentum20d, 1)}%`, `20 günlük momentum ${round(indicators.momentum20d, 1)}%`);

  if (targetStatus === "near") {
    raw += 8;
    reasons.push(`Fib hedefe ${round(Math.abs(targetDistancePct), 2)}% kaldı`);
  } else if (targetStatus === "above") {
    raw -= 4;
    reasons.push(`Fiyat Fib hedef üstünde ${round(Math.abs(targetDistancePct), 2)}%`);
  }
  if (fibPlan.activeLevel.type === "extension" && fibPlan.target === fibPlan.activeLevel.price) {
    raw += 4;
    reasons.push(`Dinamik Fib hedefi ${fibPlan.activeLevel.label} extension`);
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
    fibPlan,
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
  const previousMacdHistogram = getPreviousMacdHistogram(macdLine);
  const macdHistogram = Number.isFinite(macd) && Number.isFinite(macdSignal) ? macd - macdSignal : null;
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
    macdHistogram,
    previousMacdHistogram,
    macdCross: getMacdCross(previousMacdHistogram, macdHistogram),
    rsi14: rsi(closes, 14),
    bollingerUpper: bollinger.upper,
    bollingerMiddle: bollinger.middle,
    bollingerLower: bollinger.lower,
    bollingerPosition: getBollingerPosition(latestPrice, bollinger),
    bollingerBandwidthPct: Number.isFinite(bollinger.upper) && Number.isFinite(bollinger.lower) && Number.isFinite(bollinger.middle) && bollinger.middle !== 0 ? ((bollinger.upper - bollinger.lower) / bollinger.middle) * 100 : null,
    atr14,
    atr14Pct: Number.isFinite(atr14) && latestPrice ? (atr14 / latestPrice) * 100 : null,
    high52w,
    low52w,
    high52wDistancePct: Number.isFinite(high52w) && high52w ? ((latestPrice - high52w) / high52w) * 100 : null,
    low52wDistancePct: Number.isFinite(low52w) && low52w ? ((latestPrice - low52w) / low52w) * 100 : null,
    momentum20d: momentum(closes, 20),
    momentum60d: momentum(closes, 60),
    momentum120d: momentum(closes, 120),
    trendTemplate: getTrendTemplate({ latestPrice, sma50: sma(closes, 50), sma150: sma(closes, 150), sma200: sma(closes, 200), high52w, low52w }),
    avgVolume20,
    latestVolume,
    volumeSpikeRatio: Number.isFinite(latestVolume) && Number.isFinite(avgVolume20) && avgVolume20 > 0 ? latestVolume / avgVolume20 : null
  };
}

export function computeDynamicFibPlan(points = [], currentPrice, manualTarget = null) {
  const normalized = normalizePoints(points).slice(-252);
  const closes = normalized.map((point) => point.close).filter(Number.isFinite);
  const current = numberOrNull(currentPrice) ?? closes.at(-1) ?? null;
  const manual = numberOrNull(manualTarget);
  if (!Number.isFinite(current) || closes.length < 20) {
    return {
      target: Number.isFinite(manual) && manual > 0 ? manual : null,
      confidence: 0,
      swing: null,
      activeLevel: null,
      levels: [],
      support: null,
      resistance: null,
      method: "insufficient_data"
    };
  }

  const swing = findRecentFibSwing(closes);
  if (!swing) return { target: Number.isFinite(manual) && manual > 0 ? manual : null, confidence: 20, swing: null, activeLevel: null, levels: [], support: null, resistance: null, method: "no_swing" };
  const range = swing.high - swing.low;
  if (!Number.isFinite(range) || range <= 0) return { target: Number.isFinite(manual) && manual > 0 ? manual : null, confidence: 20, swing, activeLevel: null, levels: [], support: null, resistance: null, method: "flat_swing" };

  const levels = FIB_LEVEL_RATIOS.map((ratio) => {
    const price = swing.direction === "up"
      ? swing.low + range * ratio
      : swing.high - range * ratio;
    return {
      ratio,
      label: ratio <= 1 ? `${round(ratio * 100, 1)}%` : `${round(ratio, 3)}x`,
      price: roundFibPrice(price),
      type: ratio <= 1 ? "retracement" : "extension"
    };
  }).filter((level) => Number.isFinite(level.price)).sort((a, b) => a.price - b.price);

  const support = [...levels].reverse().find((level) => level.price <= current) || null;
  const resistance = levels.find((level) => level.price > current) || null;
  const activeLevel = resistance || support;
  const autoTarget = resistance?.price ?? roundFibPrice(swing.high + range * 0.618);
  const target = Number.isFinite(manual) && manual > 0 ? manual : autoTarget;

  return {
    target,
    confidence: computeFibConfidence({ closes, swing, current, activeLevel }),
    swing,
    activeLevel,
    support,
    resistance,
    levels,
    method: "pivot_swing_1y"
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
  if (type === "rsi_extreme" && Number.isFinite(signal.indicators.rsi14) && (signal.indicators.rsi14 <= (threshold ?? 30) || signal.indicators.rsi14 >= 70)) return make(`${row.symbol} RSI ${round(signal.indicators.rsi14, 1)} seviyesinde.`, signal.indicators.rsi14 <= 30 ? "success" : "warning");
  if (type === "macd_cross" && signal.indicators.macdCross === "bullish") return make(`${row.symbol} MACD yukarı kesişim verdi.`, "success");
  if (type === "macd_cross" && signal.indicators.macdCross === "bearish") return make(`${row.symbol} MACD aşağı kesişim verdi.`, "danger");
  if (type === "macd_cross" && Number.isFinite(signal.indicators.macdHistogram) && Math.abs(signal.indicators.macdHistogram) <= (threshold ?? 0.5)) return make(`${row.symbol} MACD kesişim bölgesinde.`);
  if (type === "ma_trend_break" && Number.isFinite(signal.indicators.sma50) && Number.isFinite(row.price) && row.price < signal.indicators.sma50) return make(`${row.symbol} fiyatı MA50 altına indi.`, "danger");
  if (type === "bollinger_breakout" && Number.isFinite(signal.indicators.bollingerUpper) && Number.isFinite(row.price) && row.price > signal.indicators.bollingerUpper) return make(`${row.symbol} Bollinger üst bandını kırdı.`, "success");
  if (type === "bollinger_breakout" && Number.isFinite(signal.indicators.bollingerLower) && Number.isFinite(row.price) && row.price < signal.indicators.bollingerLower) return make(`${row.symbol} Bollinger alt bandını kırdı.`, "danger");
  if (type === "volume_spike" && Number.isFinite(signal.indicators.volumeSpikeRatio) && signal.indicators.volumeSpikeRatio >= (threshold ?? 1.8)) return make(`${row.symbol} hacim ortalamanın ${round(signal.indicators.volumeSpikeRatio, 1)} katı.`, "warning");
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

function getPreviousMacdHistogram(macdLine) {
  const values = macdLine.filter(Number.isFinite);
  if (values.length < 12) return null;
  const previousLine = values.at(-2);
  const previousSignal = emaSeries(values.slice(0, -1), 9).at(-1) ?? null;
  return Number.isFinite(previousLine) && Number.isFinite(previousSignal) ? previousLine - previousSignal : null;
}

function getMacdCross(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return "none";
  if (previous <= 0 && current > 0) return "bullish";
  if (previous >= 0 && current < 0) return "bearish";
  return "none";
}

function getBollingerPosition(price, bands) {
  if (!Number.isFinite(price) || !Number.isFinite(bands.upper) || !Number.isFinite(bands.lower)) return "middle";
  const span = bands.upper - bands.lower;
  if (span <= 0) return "middle";
  const ratio = (price - bands.lower) / span;
  if (ratio <= 0.18) return "lower";
  if (ratio >= 0.82) return "upper";
  return "middle";
}

function getTrendTemplate({ latestPrice, sma50, sma150, sma200, high52w, low52w }) {
  const checks = [
    latestPrice > sma50,
    latestPrice > sma150,
    latestPrice > sma200,
    sma50 > sma150,
    sma150 > sma200,
    latestPrice >= high52w * 0.75,
    latestPrice >= low52w * 1.25
  ].filter((value) => value === true).length;
  return {
    passed: checks,
    total: 7,
    pct: Math.round((checks / 7) * 100)
  };
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
    const pivot = pivots[index];
    const previous = [...pivots.slice(0, index)].reverse().find((item) => item.type !== pivot.type);
    if (!previous) continue;
    const low = Math.min(previous.value, pivot.value);
    const high = Math.max(previous.value, pivot.value);
    if (high > low * 1.03) {
      return {
        low,
        high,
        lowIndex: previous.value <= pivot.value ? previous.index : pivot.index,
        highIndex: previous.value > pivot.value ? previous.index : pivot.index,
        direction: pivot.type === "high" ? "up" : "down"
      };
    }
  }

  const low = Math.min(...values);
  const high = Math.max(...values);
  return high > low ? { low, high, lowIndex: values.indexOf(low), highIndex: values.indexOf(high), direction: values.indexOf(low) < values.indexOf(high) ? "up" : "down" } : null;
}

function computeFibConfidence({ closes, swing, current, activeLevel }) {
  let confidence = 35;
  if (closes.length >= 200) confidence += 20;
  if (Math.abs(swing.highIndex - swing.lowIndex) >= 20) confidence += 15;
  if (activeLevel && Number.isFinite(activeLevel.price)) {
    const distance = Math.abs((activeLevel.price - current) / current) * 100;
    if (distance <= 3) confidence += 15;
    else if (distance <= 8) confidence += 8;
  }
  if (swing.direction === "up" && current >= swing.low) confidence += 10;
  return Math.max(0, Math.min(100, Math.round(confidence)));
}

function roundFibPrice(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (number < 10) return Number(number.toFixed(2));
  if (number < 100) return Number(number.toFixed(1));
  return Number(Math.round(number));
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
