# API Contracts

Base URL:

```text
http://127.0.0.1:8766
```

Tüm JSON endpointleri CORS açık ve `no-store` cache header'ı ile döner. Image endpointleri public cache ile döner.

## Health

```http
GET /api/health
```

Döner:

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

Döner:

- request counters
- source success/failure stats
- error log
- rate limit bilgisi
- cache boyutları
- katalog sayısı

## Market Data

```http
GET /api/snapshotssymbols=NVDA,AMD,TSLA
GET /api/snapshot/NVDA
GET /api/history/NVDArange=1d&interval=5m
GET /api/performance/NVDA
```

Ana fiyat kontratı `/api/snapshots` endpointidir. UI toplu fiyat için bu endpointi kullanır.

History destekleri:

- Range: `1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`
- Interval: `1m`, `5m`, `15m`, `30m`, `1h`, `1d`, `1wk`

`data.points` formatı:

```json
[
  {
    "time": 1780666200,
    "open": 212.1,
    "high": 215.22,
    "low": 211.84,
    "close": 214.46,
    "volume": 42100320
  }
]
```

`close` zorunlu alandır. `open`, `high`, `low` ve `volume` veri sağlayıcıdan gelirse döner; UI bu alanları hacim barları, mum grafiği ve hover OHLC bilgisi için kullanır.

## News, Analysis and Research

```http
GET /api/news/NVDA
GET /api/analysis/NVDA
GET /api/research/NVDA
GET /api/signalssymbols=NVDA,AMD,TSLA
```

`/api/news/:symbol` Yahoo Finance RSS kaynaklı haber listesini normalize eder. Haber item alanları:

- `title`
- `source`
- `publishedAt`
- `url`
- `symbol`
- `sentiment`
- `sentimentScore`
- `impact`
- `impactScore`
- `turkishSummary`

`/api/research/:symbol` haber etkisi, teknik özet, analist verisi ve provenance bilgisiyle Türkçe araştırma paketi döndürür. LLM ayarı yoksa rule-based özet ve açık "LLM yapılandırması gerekli" mesajı döner; endpoint boş ekran üretmez.

Önemli research alanları:

- `symbol`
- `generatedAt`
- `provider`
- `llmProvider`
- `summaryTr`
- `weeklySummary`
- `importantNews`
- `items`
- `impactScore`
- `priceReaction`
- `source`
- `provenance`
- `technicalSummary`
- `technicalSummaryDetail`
- `riskSummary`
- `riskSummaryDetail`
- `analyst.targetPrice`
- `analystTargetPrice`
- `snapshotStored`

`technicalSummary` ve `riskSummary` UI için kısa Türkçe metin olarak kalır. Admin snapshot ve ilerideki detay panelleri için aynı bilgilerin yapılandırılmış hali `technicalSummaryDetail` ve `riskSummaryDetail` alanlarında döner. Haber itemları hem UI uyumluluğu için `source/url`, hem admin snapshot uyumluluğu için `publisher/link` alanlarını taşır.

## Logo and Catalog

```http
GET /api/logo/NVDA
GET /api/nasdaq-universeq=SpaceX&limit=10
GET /api/stocks
GET /api/stocks/NVDA
```

Logo kaynak sırası:

1. `https://logo.clearbit.com/{domain}`
2. `https://icons.duckduckgo.com/ip3/{domain}.ico`
3. `https://www.google.com/s2/faviconsdomain={domain}&sz=128`
4. katalogdaki `stock.logo`
5. local SVG fallback

Endpoint her zaman görsel döndürmeye çalışır; böylece UI'da kırık logo oluşmaz.

## Admin Foundation

Admin endpointleri aynı proxy içinde çalışır ve token tabanlı auth kullanır.

Header seçenekleri:

- `Authorization: Bearer <token>`
- `X-Admin-Session: <token>`

Endpointler:

```http
POST /api/admin/login
POST /api/admin/logout
GET /api/admin/me
GET /api/admin/settings
PUT /api/admin/settings
GET /api/admin/providers
PUT /api/admin/providers
POST /api/admin/providers/test
POST /api/admin/providers/:id/test
GET /api/admin/llm
PUT /api/admin/llm
POST /api/admin/llm/test
GET /api/admin/jobs
POST /api/admin/jobs/run
POST /api/admin/cache/clear
GET /api/admin/auditlimit=50
GET /api/admin/research-snapshotslimit=20
POST /api/admin/research-snapshots/clear
GET /api/admin/exportauditLimit=50&researchLimit=20
```

Provider ve LLM secret alanları maskelenmiş cevaplanır; kullanıcı portföy/not/hedef localStorage verisi admin export'a dahil edilmez.

Provider ve LLM test cevapları operasyon paneli için `ok`, `status`, `latencyMs`, `message`, `testUrl` ve `testedAt` alanlarını döndürür. Secret, API key veya authorization header değerleri cevap gövdesine yazılmaz; UI yalnızca durum, süre, HTTP kodu ve kısa mesaj gösterir.

Research snapshot kalıcılığı operasyon verisidir. Kullanıcı portföy/not/hedef verisi değildir; SQLite veya JSON fallback store içinde sadece admin/cache/denetim amacıyla tutulur. Snapshot içinde haber URL'leri, özetler, sinyal snapshot'ı, kaynak bilgisi ve üretilme zamanı saklanabilir; provider/LLM secret alanları saklanmaz.

`POST /api/admin/research-snapshots/clear` yalnızca admin research snapshot latest/event kayıtlarını temizler ve `deleted`, `clearedAt` alanları döndürür. Kullanıcı localStorage verisi, portföy, not, alarm ve hedefler etkilenmez.

## Local-First User Feature Contracts

Aşağıdaki özellikler API endpointi değil, tarayıcı localStorage kontratıdır:

- Kaydedilmiş screener presetleri: kriter adı, aktif tarama kriterleri, dashboard filtre/sıralama/periyot bağlamı, oluşturma tarihi.
- Broker CSV import önizlemesi: parse edilen sembol, tarih, işlem tipi, fiyat, adet ve hata listesi.
- Çalışma alanları: ad, sembol listesi, oluşturma tarihi.

Bu veriler `matrix-backup.json` export/import paketine dahil edilir. Backend yalnızca sistem ayarları ve operasyon verisi saklar.
