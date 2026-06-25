# Architecture

## Genel Akış

Uygulama iki çalışan parçadan oluşur:

1. React/Vite web app: `http://127.0.0.1:8765/`
2. Local fiyat proxy: `http://127.0.0.1:8766/`

Tarayıcı fiyat, haber, analiz, logo ve Nasdaq evreni için doğrudan dış finans kaynaklarına gitmez. Bu kararların tamamı `fvt-price-proxy.cjs` içinde verilir.

```text
Browser UI
  -> packages/shared/src/api.js
  -> src/api.js
  -> fvt-price-proxy.cjs
  -> Yahoo Finance / Stooq / FVT / Google / lastKnown
```

## Frontend Yapısı

### `apps/shell`

- Ana giriş noktasıdır.
- `apps/shell/src/main.jsx`, `DashboardApp` bileşenini render eder.
- Kullanıcı için tek web URL `http://127.0.0.1:8765/` olarak tutulur.
- Shell hata sınırı içerir; dashboard render hatasında kullanıcıya açık fallback gösterir.

### `apps/dashboard`

- Finans dashboard yüzeyini içerir.
- Ana dosya: `apps/dashboard/src/DashboardApp.jsx`.
- Stil dosyası: `apps/dashboard/src/dashboard.css`.
- KPI, filtre, tablo, mobil kartlar, detay paneli, grafik, haberler, analiz, notlar ve katalog yönetimi burada bulunur.
- Desktop görünümde tablo, `760px` altında mobil kart akışı kullanılır.

### `packages/shared`

- `api.js`: mevcut `src/api.js` proxy client sözleşmesini dışa aktarır.
- `stateBridge.js`: mevcut `src/state.js` state/selectors/persistence yüzeyini dışa aktarır.
- `formatters.js`: fiyat, yüzde, sayı, tazelik ve etiket formatlama yardımcılarıdır.

### `packages/ui`

- Basit ortak UI atomları:
  - `Badge`
  - `Button`
  - `Card`
  - `CardTitle`

## State ve Veri Akışı

`src/state.js` şu an ortak mutable store olarak kullanılır.

Önemli alanlar:

- `state.stocks`
- `state.snapshots`
- `state.histories`
- `state.performances`
- `state.news`
- `state.analysis`
- `state.filters`
- `state.ui`
- `state.favorites`
- `state.fibTargets`
- `state.investmentPlans`
- `state.customStocks`
- `state.customCategories`

Önemli localStorage anahtarları:

- `hisse-dashboard-settings-v3`
- `hisse-dashboard-last-snapshots-v3`
- `hisse-dashboard-investment-plans-v1`
- `hisse-dashboard-custom-stocks-v1`
- `hisse-dashboard-custom-categories-v1`

Ana selector/işlem yüzeyleri:

- `getVisibleRows()`
- `getKpis()`
- `getRowModel()`
- `setFilters()`
- `setUi()`
- `setFibTarget()`
- `resetFibTarget()`
- `toggleFavorite()`
- `addCustomStock()`
- `removeCustomStock()`
- `addCustomCategory()`

## Refresh Modeli

`DashboardApp.jsx` içinde:

- İlk açılışta Nasdaq evreni ve fiyat snapshotları yüklenir.
- Snapshotlar batch olarak `/api/snapshots` endpointinden gelir.
- History ve performance verileri parça parça yüklenir.
- Seçili hisse için news ve analysis ayrıca yüklenir.
- Otomatik refresh süresi `60 saniye`.
- `refreshInFlight` aynı anda ikinci refresh çalışmasını engeller.

## Proxy Mimarisi

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
- `GET /api/nasdaq-universe`
- `GET /api/logo/:symbol`

Kaynak önceliği:

1. Yahoo Finance
2. Stooq
3. FVT
4. Google Finance
5. lastKnown

## Başlatma

Önerilen kullanıcı akışı:

```powershell
start-dashboard.cmd
```

Script:

- Node/npm varlığını kontrol eder.
- React bağımlılıkları yoksa `npm install` çalıştırır.
- `8766` proxy için doğru health marker bekler.
- `8765` shell için doğru HTML marker bekler.
- Yanlış süreç portu işgal ediyorsa sessizce devam etmez; açık hata verir.

## Doğrulama

Kullanılacak temel komutlar:

```powershell
npm run build
npm run smoke:http
```

Browser doğrulamasında beklenenler:

- Desktop: tablo görünür, 52 satır yüklenir, yatay taşma yoktur.
- `760px` altında: tablo gizlenir, mobil kartlar görünür.
- Console/network hatası yoktur.
- `Proxy canlı` görünür.
- Favori, özel hisse ekle/sil, Fib hedef kaydet/sıfırla, not kaydet ve sekmeler çalışır.
