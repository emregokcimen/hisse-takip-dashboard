export function fmtUsd(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(number);
}

export function fmtPct(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(digits)}%`;
}

export function fmtNumber(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return number.toLocaleString("tr-TR", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  });
}

export function ageLabel(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "Tazelik yok";
  if (value < 60) return `${Math.max(1, Math.round(value))} sn önce`;
  if (value < 3600) return `${Math.round(value / 60)} dk önce`;
  if (value < 86400) return `${Math.round(value / 3600)} saat önce`;
  return `${Math.round(value / 86400)} gün önce`;
}

export function signalLabel(value) {
  return {
    strong_buy: "Güçlü Al",
    buy: "Al",
    watch: "İzle",
    neutral: "Nötr",
    risky: "Riskli",
    sell: "Sat",
    strong_sell: "Güçlü Sat",
    insufficient_data: "Veri Yetersiz"
  }[value] || "Nötr";
}

export function targetLabel(value) {
  return {
    near: "Hedefe yakın",
    above: "Hedef üstü",
    below: "Hedef altı",
    unknown: "Hedef yok"
  }[value] || "Hedef yok";
}
