# Matrix Platform - Yarın Devam Dokümanı

**Tarih:** 2026-06-27

Bu doküman yarın kaldığımız yerden hızlı devam etmek için hazırlandı. Ana kural değişmedi: Dashboard ve Sinyaller sayfalarındaki mevcut özellikler korunacak, yeni Matrix V2 geliştirmeleri parça parça eklenecek.

## Proje ve Çalışma Adresleri

- Proje klasörü: `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`
- Web app: `http://127.0.0.1:8765/`
- Proxy/Admin API: `http://127.0.0.1:8766/`
- Ana route'lar: `#dashboard`, `#signals`, `#screener`, `#research`, `#portfolio`, `#reports`, `#admin`
- Detaylı devir notları: `docs/DEVIR_NOTLARI_2026-06-27.md`
- Kısa yarın planı: `docs/YARIN_DEVAM_2026-06-28.md`

## Bugün Tamamlananlar

### Stabilizasyon ve Admin Temeli

- React + Vite microfrontend yapı korunarak geliştirmeye devam edildi.
- Dashboard, Sinyaller, Screener, Research, Portfolio, Reports ve Admin route'ları korunuyor.
- `src/admin/` altında Node tabanlı admin altyapısı eklendi.
- Admin tarafında sistem verileri için store hazırlandı: admin session, provider ayarları, LLM ayarları, app settings, jobs, audit logs, cache ve research snapshot.
- Kullanıcı yatırım verileri backend'e taşınmadı; favoriler, hedefler, portföy, notlar, alarm kuralları ve çalışma alanları localStorage + JSON import/export akışı ile kaldı.

### Admin API ve Admin UI

- Admin login/logout/me endpointleri çalışır hale getirildi.
- Provider, LLM, jobs, cache, audit, research snapshot ve operasyon export endpointleri eklendi veya genişletildi.
- `#admin` sayfasına local admin login, sistem sağlığı, provider/LLM ayarları, job/cache/audit ve operasyon export panelleri eklendi.
- Provider ve LLM secret değerleri UI ve export tarafında maskeli/secret-safe kalacak şekilde düzenlendi.
- Admin HTTP smoke testi admin kapsamıyla çalışır hale getirildi.

### Araştırma, Haber ve Provenance

- Haberler sekmesi araştırma paneli gibi zenginleştirildi.
- Türkçe özet, haber etki skoru, pozitif/negatif/nötr dağılım, fiyat tepkisi ve provenance bilgileri gösteriliyor.
- En etkili haberler ayrıca vurgulanıyor.
- LLM ayarı yoksa ekran bozulmadan "LLM yapılandırması gerekli" durumu gösteriliyor.

### Sinyal Merkezi Geliştirmeleri

- `#signals` ayrı sayfa olarak korundu.
- Aktif sinyaller için gelişmiş filtreler eklendi: trend, momentum, reversal, breakout, risk, haber, Fib ve hacim.
- Seçili sinyal explorer eklendi.
- Explorer içinde kompakt grafik, skor, güven, tetikleyici rozetleri, teknik/haber/hedef/risk şeridi ve nedenler gösteriliyor.
- Seçili sinyal odağı screener preset olarak kaydedilebiliyor.
- Seçili sinyal odağından toplu alarm kuralı oluşturulabiliyor.
- Risk odağı için preset, filter context ve toplu alarm kuralı browser smoke ile doğrulandı.

### Alarm Merkezi

- Seçili sinyal için hızlı alarm aksiyonları eklendi.
- Alarm kuralları inline edit edilebilir hale getirildi.
- Alarm validasyonu eklendi: ad, kapsam, sembol/kategori, eşik ve cooldown kontrol ediliyor.
- Alarm satırlarında önem, cooldown, kapsam, bildirim izni ve geçmiş sayısı gösteriliyor.
- Tetiklenen alarm geçmişi kural bazlı odaklanabiliyor.
- Alarm susturma, erteleme, onaylama ve detay kartı akışları eklendi.
- Browser notification sonucu alarm kaydına yazılıyor.
- Alarm detay kartında bildirim durumu, son bildirim ve bildirim geçmişi gösteriliyor.
- Alarm CSV export kolonları bildirim durumu ve son bildirim bilgilerini içeriyor.

### Sinyal Geçmişi ve Trigger Timeline

- Sinyal geçmişi önceki skor, skor değişimi, yön ve değişim nedenini tutuyor.
- Sinyal geçmişi kartlarında skor farkı ve yön görsel olarak ayrılıyor.
- Sinyal geçmişi CSV export kolonları genişletildi.
- `SelectedSignalExplorer` içine `Trigger zaman çizelgesi` kartı eklendi.
- Timeline teknik, haber, risk, Fib ve hacim kategorilerine göre filtrelenebiliyor.
- Timeline MACD, RSI, Supertrend, VWAP, hacim, Fib, hedef uzaklığı, haber etkisi ve risk verilerinden üretilecek şekilde tasarlandı.

### Grafik Trigger Marker'ları

- `SparkChart` artık `row` bağlamı alarak grafik üzerinde trigger marker'ları çiziyor.
- Marker kategorileri timeline ile aynı aileden geliyor: teknik, hacim, Fib, haber ve risk.
- Marker title metni tip, kısa neden, tarih ve fiyat bilgisini içeriyor.
- Marker'lar fiyat çizgisi, Fib hedef çizgisi ve hover kutusunu bozmadan SVG katmanında gösteriliyor.
- Grafik marker'ları tıklanabilir ve keyboard ile seçilebilir SVG button gibi çalışıyor.
- Marker seçilince `Grafik marker detayı` kartı doluyor.
- Seçilen marker kategorisi timeline filtresini aynı kategoriye odaklıyor.

### Trigger Özeti: Sinyal Geçmişi ve Raporlar

- Trigger kategori özeti ortak helper ile üretiliyor: teknik, haber, risk, Fib ve hacim.
- Sinyal geçmişi kartları artık trigger kategori rozetlerini gösteriyor.
- Watchlist CSV ve Sinyaller CSV export kolonlarına `Trigger Kategorileri` eklendi.
- Günlük piyasa özeti kartına `Trigger odağı` metriği eklendi.

## Son Doğrulanan Komutlar

```powershell
node --check scripts\smoke-browser.mjs
npm run build
npm run smoke:browser
npm run smoke:http
$env:MATRIX_ADMIN_HTTP_SMOKE='1'; npm run smoke:http
git diff --check -- apps\dashboard\src\DashboardApp.jsx apps\dashboard\src\dashboard.css scripts\smoke-browser.mjs
```

Not: `git diff --check` sadece LF/CRLF uyarı satırları verdi; fonksiyonel hata yoktu.

## Yarın İlk Yapılacak Kontrol

```powershell
cd "C:\Users\emreg\OneDrive\Masaüstü\hisse takip"
git status --short
npm run build
npm run smoke:http
$env:MATRIX_ADMIN_HTTP_SMOKE='1'; npm run smoke:http
npm run smoke:browser
```

Bu komutlar geçmeden yeni büyük feature'a geçilmemeli. Özellikle Dashboard ve Sinyaller route'larında özellik kaybı olmadığı tekrar kontrol edilmeli.

## Yarın İlk Geliştirme Hedefi

Sıradaki hedef: marker ve trigger özetlerini screener/karşılaştırma akışlarıyla bağlamak.

Kapsam:

- Marker metinlerini daha uzun verilerde taşma ve çakışma için kontrol et.
- Screener satırlarında trigger kategori özeti göster.
- Karşılaştırma panelinde trigger odağı kolonu ekle.
- Trigger kategoriye göre screener filtre/preset aksiyonu ekle.
- Browser smoke screener/karşılaştırma entegrasyonunu doğrulasın.

Muhtemel dosyalar:

- `apps/dashboard/src/DashboardApp.jsx`
- `apps/dashboard/src/dashboard.css`
- `scripts/smoke-browser.mjs`

## Kalan İşler

### 1. Sinyal Merkezi Pro

- Marker ve trigger özetlerini screener/karşılaştırma akışlarıyla bağlama.
- Marker metinlerini uzun veri setlerinde taşma/çakışma için iyileştirme.
- Browser notification canlı tetikleme koşullarının daha derin doğrulanması.
- Alarm susturma/erteleme akışı için daha geniş regresyon senaryoları.
- Sinyal geçmişinde zaman bazlı grafik/özet görünümü.

### 2. Dinamik Fibonacci

- 1Y swing high/low hesaplamasının daha açık anlatımı.
- Pivot, retracement, extension ve destek/direnç seviyelerinin daha görünür hale getirilmesi.
- Otomatik Fib hedefi ile manuel hedef ayrımının detay panelinde netleştirilmesi.
- Fib güven skorunun nedenleriyle gösterilmesi.

### 3. Gelişmiş Grafik

- Candlestick görünüm kalite kontrolü.
- Hacim barları.
- MA20/50/200, Bollinger, VWAP ve Fib overlay etiketleri.
- RSI, MACD ve OBV alt panellerinin okunabilirlik kontrolü.
- Hover bilgisinde tarih, OHLC, hacim ve indikatör değerleri.

### 4. Screener ve Karşılaştırma

- Kaydedilebilir screener kriterleri.
- Çoklu hisse karşılaştırma ekranı.
- Kategori heatmap okunabilirliği.
- Screener CSV export kolon kontrolü.
- Signal focus presetleri ile screener arasındaki bağlantının güçlendirilmesi.

### 5. Portföy ve İşlem Günlüğü

- Realized/unrealized P/L.
- Stop/hedef mesafesi.
- Risk edilen tutar.
- İşlem günlüğü sonuç notu.
- Broker CSV import eşleme taslağı.

### 6. Raporlama ve Export

- Günlük piyasa özeti.
- Haftalık HTML rapor.
- Sinyaller, alarm geçmişi, portföy ve screener için CSV export doğrulaması.
- JSON backup/restore akışı.
- Kullanıcı backup verisi ile admin operasyon export farkının UI'da netleştirilmesi.

### 7. Admin Panel

- Provider test detayları.
- LLM test önizlemesi.
- Job run sonuç detayları.
- Audit log filtreleme.
- Cache/research snapshot temizleme ve yenileme kontrolleri.

## Dikkat Edilecekler

- Worktree geniş dirty durumda; alakasız değişiklikler revert edilmeyecek.
- `src/admin/` untracked görünebilir; silinmeyecek.
- Secret, API key, token, cookie veya `.env` değeri terminale, UI'a veya export'a düz metin yazdırılmayacak.
- Dashboard ve Sinyaller sayfalarında özellik kaybı kabul edilmeyecek.
- Finansal metinler yatırım tavsiyesi gibi yazılmayacak; analiz ve izleme dili korunacak.
- Global line ending temizliği yapılmamalı; mevcut LF/CRLF karması gereksiz diff büyütüyor.

## Devam Ederken Önerilen Ajan Dağılımı

- `frontend_lead`: Grafik marker UX'i, timeline/marker ortak kategori modeli, sayfa regresyon riski.
- `react_developer`: `SparkChart` marker implementasyonu ve responsive UI.
- `test_engineer`: Browser smoke selector ve desktop/mobile kabul senaryoları.
- `software_architect`: Matrix V2 kalan modüllerin öncelik ve sınır kontrolü.
