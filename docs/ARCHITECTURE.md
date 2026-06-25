# Architecture

## Genel Akış

Uygulama iki yerel parçadan oluşur:

1. React/Vite shell: `http://127.0.0.1:8765/`
2. Local fiyat proxy: `http://127.0.0.1:8766/`

Tarayıcı fiyat, haber, analiz, logo ve Nasdaq evreni için doğrudan dış finans kaynaklarına gitmez. Bu kararlar `fvt-price-proxy.cjs` içinde verilir.

```text
Browser UI
  -> packages/shared/src/api.js
  -> src/api.js
  -> fvt-price-proxy.cjs
  -> Yahoo Finance / Stooq / FVT / Google / lastKnown
```

## Frontend

- `apps/shell`: tek kullanıcı giriş noktasıdır ve `DashboardApp` bileşenini render eder.
- `apps/dashboard`: dashboard, sinyaller sayfası, katalog, tablo, mobil kartlar, detay paneli, grafik, haber, analiz ve not ekranlarını içerir.
- `packages/shared`: API client, state bridge, formatters ve sinyal motoru export yüzeyidir.
- `packages/ui`: `Badge`, `Button`, `Card`, `CardTitle` ortak UI atomlarını içerir.

Aktif route davranışı:

- `#dashboard`: ana izleme dashboardu.
- `#signals`: ayrı sinyal merkezi ve alarm motoru sayfası.

## State ve Veri

`src/state.js` ortak mutable store olarak kullanılır. Önemli veri alanları:

- `stocks`, `snapshots`, `histories`, `performances`
- `news`, `analysis`, `filters`, `ui`
- `favorites`, `fibTargets`, `investmentPlans`
- `customStocks`, `customCategories`
- `alertRules`, `triggeredAlerts`

Önemli localStorage anahtarları:

- `hisse-dashboard-settings-v3`
- `hisse-dashboard-last-snapshots-v3`
- `hisse-dashboard-investment-plans-v1`
- `hisse-dashboard-custom-stocks-v1`
- `hisse-dashboard-custom-categories-v1`
- `hisse-dashboard-alert-rules-v1`
- `hisse-dashboard-triggered-alerts-v1`

## Proxy

`fvt-price-proxy.cjs` tek Node HTTP server olarak çalışır.

Önemli endpointler:

- `GET /api/health`
- `GET /api/status`
- `GET /api/snapshots?symbols=...`
- `GET /api/snapshot/:symbol`
- `GET /api/history/:symbol?range=...&interval=...`
- `GET /api/performance/:symbol`
- `GET /api/news/:symbol`
- `GET /api/analysis/:symbol`
- `GET /api/signals?symbols=...`
- `GET /api/nasdaq-universe`
- `GET /api/logo/:symbol`

Kaynak önceliği:

1. Yahoo Finance
2. Stooq
3. FVT
4. Google Finance
5. lastKnown

## Başlatma ve Doğrulama

```powershell
start-dashboard.cmd
npm run build
npm run smoke
```

Smoke testleri hem HTTP endpointlerini hem de desktop/mobil browser akışını kontrol eder.
