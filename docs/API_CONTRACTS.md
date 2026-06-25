# API Contracts

Base URL:

```text
http://127.0.0.1:8766
```

Tum JSON endpointleri CORS acik ve `no-store` cache header'i ile doner. Image endpointleri public cache ile doner.

## Health

```http
GET /api/health
```

Doner:

- `service`
- `version`
- `uptimeSec`
- `now`
- `sourcePriority`
- `capabilities`

## Status

```http
GET /api/status
```

Doner:

- request counters
- source success/failure stats
- error log
- rate limit bilgisi
- cache boyutlari
- katalog sayisi

## Fallback Report

```http
GET /api/fallback-report
```

Snapshot cache icindeki kaynak dagilimini ve son hatalari ozetler.

## Batch Snapshot

```http
GET /api/snapshots?symbols=NVDA,AMD,TSLA
```

Ana fiyat kontrati budur. UI toplu fiyat icin bu endpointi kullanir.

Basarili cevap:

```json
{
  "success": true,
  "data": [
    {
      "symbol": "NVDA",
      "company": "NVIDIA",
      "category": "Yapay Zeka Donanimi",
      "fibTarget": 192,
      "price": 205.1,
      "currency": "USD",
      "updatedAt": 1780689600,
      "source": "Yahoo Finance",
      "sourcePriority": ["Yahoo Finance", "Stooq", "FVT", "Google Finance", "lastKnown"],
      "sourceFreshnessSec": 102829,
      "isLive": true,
      "isStale": false,
      "fallbackLevel": 0,
      "warnings": [],
      "metrics": {
        "fibDistanceAbs": -13.1,
        "fibDistancePct": -6.82,
        "momentum1m": null,
        "momentum3m": null,
        "momentum12m": null,
        "volatility20d": null,
        "sourceFreshnessSec": 102829
      }
    }
  ]
}
```

## Single Snapshot

```http
GET /api/snapshot/NVDA
```

Tek hisse icin snapshot dondurur.

## History

```http
GET /api/history/NVDA?range=1d&interval=5m
```

Desteklenen range:

- `1d`
- `5d`
- `1mo`
- `3mo`
- `6mo`
- `1y`
- `2y`

Desteklenen interval:

- `1m`
- `5m`
- `15m`
- `30m`
- `1h`
- `1d`

Donen `data.points` format:

```json
[
  { "time": 1780666200, "close": 214.46 }
]
```

## Chart Alias

```http
GET /api/chart/NVDA
```

Yahoo chart icin eski uyumluluk endpointidir.

## Quote

```http
GET /api/quote/NVDA
```

Basit fiyat cevabi:

- `symbol`
- `price`
- `updatedAt`

## Performance

```http
GET /api/performance/NVDA
```

1-12 aylik getiri, performans points ve pratik metrikler icin kullanilir.

## News

```http
GET /api/news/NVDA
```

Yahoo Finance RSS kaynakli haber listesini dondurur. Haberler proxy tarafinda normalize edilir.

Yeni haber item alanlari:

- `title`
- `source`
- `publishedAt`
- `url`
- `link`
- `symbol`
- `sentiment`: `positive`, `negative`, `neutral`
- `sentimentScore`
- `impact`: `high`, `medium`, `low`
- `impactScore`
- `turkishSummary`

Payload ayrica `impactSummary` dondurur:

- `totalCount`
- `positiveCount`
- `negativeCount`
- `neutralCount`
- `highImpactCount`
- `aggregateSentimentScore`
- `aggregateImpactScore`
- `averageSentimentScore`
- `averageImpactScore`

## Analysis

```http
GET /api/analysis/NVDA
```

Ucretsiz kaynaklardan analist hedefi, bilanco tarihi ve not bilgisi dondurmeye calisir.

## Logo

```http
GET /api/logo/NVDA
```

Logo kaynak sirasi:

1. `https://logo.clearbit.com/{domain}`
2. `https://icons.duckduckgo.com/ip3/{domain}.ico`
3. `https://www.google.com/s2/favicons?domain={domain}&sz=128`
4. katalogdaki `stock.logo`
5. local SVG fallback

Endpoint her zaman gorsel dondurmeye calisir; boylece UI'da kirik logo olusmaz.

## Legacy Stocks

```http
GET /api/stocks
GET /api/stocks/NVDA
```

FVT kaynakli eski uyumluluk endpointleridir.
