import stocks from "../stock-catalog.json";

export const STOCKS = stocks.map((stock) => ({
  ...stock,
  symbol: String(stock.symbol).toUpperCase(),
  fibTarget: Number(stock.fibTarget)
}));

export const CATEGORIES = Array.from(new Set(STOCKS.map((stock) => stock.category)));

export const SYMBOLS = STOCKS.map((stock) => stock.symbol);
