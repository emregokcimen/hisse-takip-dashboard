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
- `#screener`: tarama, heatmap ve karşılaştırma akışı.
- `#research`: haber etkisi ve Türkçe araştırma paneli.
- `#portfolio`: pozisyon, risk ve işlem günlüğü alanı.
- `#reports`: günlük/haftalık rapor, CSV ve JSON yedekleme.
- `#admin`: provider, LLM, cache, job, audit ve sistem sağlık paneli.

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

Local-first genişletmeler aynı ilkeyi izler:

- kaydedilmiş screener presetleri
- broker CSV import önizleme ve eşleştirme ayarları
- kullanıcı çalışma alanı paketleri

Bu veriler kullanıcı tercihi sayılır ve backend DB'ye taşınmaz. SQLite yalnızca admin, provider, LLM, cache, job, audit ve research snapshot gibi sistem/operasyon verileri içindir.

## Proxy

`fvt-price-proxy.cjs` tek Node HTTP server olarak çalışır.

Matrix V2 admin foundation aynı process içinde çalışır. Varsayılan kalıcı storage `data/matrix-admin.sqlite` dosyasıdır; `node:sqlite` bulunamazsa JSON fallback kullanılır.

Önemli endpointler:

- `GET /api/health`
- `GET /api/status`
- `GET /api/snapshotssymbols=...`
- `GET /api/snapshot/:symbol`
- `GET /api/history/:symbolrange=...&interval=...`
- `GET /api/performance/:symbol`
- `GET /api/news/:symbol`
- `GET /api/analysis/:symbol`
- `GET /api/signalssymbols=...`
- `GET /api/research/:symbol`
- `GET /api/nasdaq-universe`
- `GET /api/logo/:symbol`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `GET|PUT /api/admin/settings`
- `GET|PUT /api/admin/providers`
- `POST /api/admin/providers/test`
- `GET|PUT /api/admin/llm`
- `POST /api/admin/llm/test`
- `GET /api/admin/jobs`
- `POST /api/admin/jobs/run`
- `POST /api/admin/cache/clear`
- `GET /api/admin/audit`
- `GET /api/admin/research-snapshots`
- `POST /api/admin/research-snapshots/clear`

Kaynak önceliği:

1. Yahoo Finance
2. Stooq
3. FVT
4. Google Finance
5. lastKnown

Admin auth contract:

- Login session token döndürür.
- Sonraki admin istekleri `Authorization: Bearer <token>` veya `X-Admin-Session: <token>` ile gönderilir.
- Provider ve LLM secret alanları admin API cevaplarında maskelenir.

## Başlatma ve Doğrulama

```powershell
start-dashboard.cmd
npm run build
npm run smoke
```

Smoke testleri varsayılan olarak HTTP endpointlerini ve desktop/mobil browser akışlarını kontrol eder. Admin login/settings/provider/LLM/job/audit/cache akışı için `MATRIX_ADMIN_HTTP_SMOKE=1` ile HTTP smoke çalıştırılır.

Research snapshot akışında `/api/research/:symbol` cevabı UI için hemen döndürülür, aynı zamanda secret içermeyen özet admin store'a yazılır. Bu veri kullanıcı yatırım verisi değil; operasyonel cache/audit bağlamı olduğu için SQLite/JSON fallback içinde tutulur ve admin panelinden izlenir.

Research kalıcılığı iki seviyelidir: latest uyumluluğu için sembol bazlı son snapshot tutulur, admin geçmişi için her üretim ayrı event olarak saklanır. SQLite tarafında `admin_research_snapshots` latest tablo, `admin_research_snapshot_events` history tablosudur. JSON fallback tarafında `researchSnapshots` ve `researchSnapshotEvents` aynı sorumlulukları taşır.

Research snapshot temizleme operasyonu yalnızca bu operasyonel latest/event kayıtlarını siler. Kullanıcının localStorage tarafındaki portföy, alarm, hedef, not ve özel liste verileri backend temizleme operasyonundan etkilenmez.
