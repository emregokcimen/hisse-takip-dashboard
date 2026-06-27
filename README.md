# Matrix Finansal Analiz Platformu

Matrix, yerel çalışan React + Vite micro frontend tabanlı finansal izleme ve analiz uygulamasıdır. Dashboard, sinyal merkezi, screener, araştırma, portföy, raporlar ve yönetim paneli aynı local proxy üzerinden çalışır.

Uygulama finansal verileri analiz ve izleme amacıyla gösterir; yatırım tavsiyesi değildir.

## Özellikler

- Canlı fiyat izleme, Fibonacci hedefleri ve hedefe yakınlık uyarıları
- Ayrı Sinyaller sayfası: teknik sinyal, risk, haber etkisi, alarm kuralları ve tetiklenen alarmlar
- Screener: Fib yakınlığı, momentum, haber, risk ve analist hedefi kriterleri
- Araştırma paneli: haber etkisi, Türkçe özet alanları ve kaynak/provenance bilgisi
- Portföy ve işlem günlüğü: giriş, stop, hedef, not, P/L ve broker CSV önizleme
- Raporlar: günlük/haftalık özet, CSV export, JSON backup/import
- Yönetim paneli: provider, LLM, cache, job, audit ve araştırma snapshot yönetimi
- Nasdaq universe araması, özel kategori/hisse ekleme, favoriler ve logo endpointleri

## Mimari

```text
apps/shell       Ana Vite shell, port 8765
apps/dashboard   Dashboard remote ve tüm feature sayfaları
packages/shared  API bridge, formatter ve signal engine re-exportları
packages/ui      Ortak React UI bileşenleri
src              State, API client, signal engine ve admin backend yardımcıları
fvt-price-proxy  Node proxy, fiyat/veri/admin API, port 8766
scripts          Smoke testleri ve yardımcı doğrulamalar
docs             Mimari, API ve devir dokümanları
```

## Gereksinimler

- Windows 10/11
- Node.js LTS
- npm
- Modern Chrome veya Edge tarayıcı

## İlk Kurulum

Tek komut:

```powershell
.\setup-dashboard.ps1
```

Alternatif olarak çift tıklama:

```text
setup-dashboard.cmd
```

Bu script:

- Node.js ve npm varlığını kontrol eder
- `package-lock.json` varsa `npm ci`, yoksa `npm install` çalıştırır
- `data`, `docs`, `scripts` klasörlerini hazırlar
- `fvt-price-proxy.cjs`, `src/signal-engine.cjs` ve smoke scriptlerini syntax kontrolünden geçirir
- React shell ve dashboard build alır

## Uygulamayı Çalıştırma

Çift tık:

```text
start-dashboard.cmd
```

Komut satırı:

```powershell
npm run start
```

Adresler:

- Web app: `http://127.0.0.1:8765/`
- Fiyat/Admin proxy: `http://127.0.0.1:8766/`
- Proxy health: `http://127.0.0.1:8766/api/health`

## Geliştirme Komutları

```powershell
npm run dev:shell
npm run proxy
npm run build
npm run smoke:http
npm run smoke:browser
npm run smoke:palette
npm run smoke
```

## Veri Akışı

Tarayıcı doğrudan finans kaynaklarıyla konuşmaz. Tüm veri ve fallback kararları `fvt-price-proxy.cjs` içinde normalize edilir.

Temel endpointler:

- `GET /api/health`
- `GET /api/status`
- `GET /api/snapshots?symbols=NVDA,AMD,TSLA`
- `GET /api/history/NVDA?range=1y&interval=1d`
- `GET /api/signals?symbols=NVDA,AMD,TSLA`
- `GET /api/research/NVDA`
- `GET /api/nasdaq-universe?q=SpaceX&limit=10`
- `GET /api/logo/NVDA`

## Yönetim Paneli

Yönetim paneli `#admin` route altında yer alır. Admin tarafı local kullanım içindir; provider, LLM, cache, job, audit ve research snapshot yönetimini sağlar.

LLM veya ücretli veri sağlayıcıları yapılandırılmadığında uygulama mevcut ücretsiz/proxy fallback akışıyla çalışmaya devam eder.

## Doğrulama

Kurulumdan sonra hızlı kontrol:

```powershell
Invoke-RestMethod http://127.0.0.1:8766/api/health
Invoke-RestMethod "http://127.0.0.1:8766/api/snapshots?symbols=NVDA,AMD,TSLA"
npm run build
npm run smoke:http
```

Tam smoke:

```powershell
npm run smoke
```

Not: Browser smoke, tüm route ve yönetim paneli kontrollerini çalıştırır. Bir alt test başarısız olursa terminalde ilgili route adı görünür.

## Kullanıcı Verisi

Kullanıcıya ait favoriler, özel hedefler, portföy planları, notlar, alarm kuralları ve çalışma alanları localStorage içinde tutulur. JSON backup/import akışı Raporlar sayfasından yapılır.

SQLite/`data` tarafı sistem ayarları, admin, cache, job, audit ve araştırma snapshot verileri için kullanılır; yatırım verisi burada zorunlu olarak tutulmaz.
