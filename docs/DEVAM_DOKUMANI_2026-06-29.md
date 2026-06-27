# Matrix Platform Devam Notu ve Teslim Özeti

**Tarih:** 2026-06-28  
**Çalışma klasörü:** `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`  
**Ana kural:** Dashboard ve Sinyaller sayfalarındaki mevcut özellikler kaybedilmeden geliştirme devam edecek.

## 1. Bugüne Kadar Tamamlananlar

### Altyapı ve Çekirdek

- React + Vite microfrontend mimarisi korunuyor: shell + dashboard remote.
- Admin operasyon katmanı `src/admin/*` altında kuruldu ve sistem ayarları için backend entegrasyonu eklendi.
- Admin oturum akışları eklendi: login, logout ve me.
- Secret-safe yaklaşım korundu: provider ve LLM anahtarları UI ve export tarafında maskeli taşınıyor.
- Proxy tarafında endpoint seti genişletildi ve admin operasyonları devreye alındı.
- Provider ve LLM testleri Admin UI'dan çalıştırılabiliyor; sonuç satırları durum, HTTP kodu, süre ve test saatini gösteriyor.

### Dashboard, Sinyaller ve Grafik

- Sinyaller sayfası ayrı sayfa olarak korunuyor.
- Gelişmiş sinyal filtreleri kullanıma açıldı: trend, momentum, reversal, breakout, risk, haber, Fib ve hacim.
- Seçili sinyal explorer ve trigger timeline kartları aktif.
- Seçili sinyal filtreleri için context/preset davranışı `state.filters.signalFocus` üzerinden çalışıyor.
- Grafikte sinyal marker metadata akışı mevcut: kategori, tooltip ve neden bilgileri.
- Detay grafiği ile explorer marker etkileşimi arasındaki odaklama davranışı bağlandı.

### Alarm Merkezi

- Alarm kuralları düzenleme ve validasyon akışı güçlendirildi.
- Tetiklenen alarm geçmişi kartları ve detay paneli eklendi.
- Browser notification sonuçları alarm kaydına yazılıyor: durum, zaman ve geçmiş.
- Alarm susturma, erteleme, tekrar tetikleme metrikleri ve kural bazlı filtrelenmiş geçmiş görünümü eklendi.
- Kural meta alanları genişletildi: önem, cooldown, kapsam ve bildirim durumu.

### Araştırma ve Haber Katmanı

- Haber paneli araştırma formatında genişledi: özet, sentiment, impact, etkili haber öne çıkarma, özet dili ve provenance alanları.
- `summaryTr`, fiyat tepkisi ve etki skorları taşınıyor.
- LLM yapılandırması eksikse ekran bozulmadan açık uyarı gösteriliyor.
- `/api/research/:symbol` kontratı admin snapshot ile hizalandı: haftalık özet, teknik/risk metni, teknik/risk detay objeleri, source objesi, haber `publisher/link` uyumluluğu ve analyst `targetPrice` alanı birlikte dönüyor.
- Research UI yeni kontratı kullanıyor: teknik detay, risk/analist detayları, trigger etiketleri, uyarılar ve haber başına fiyat reaksiyonu görünür hale getirildi.

### Sinyal Geçmişi ve Snapshot

- Sinyal geçmişi skor farkı, yön ve değişim nedeni ile tutuluyor.
- CSV export kolonları geçmiş odaklı zenginleştirildi.
- Dashboard ve Sinyaller akışında trigger/score olayları için temel regresyon doğrulamaları eklendi.

### Test ve Doğrulama

- `node --check`, `npm run build`, `npm run smoke:http` ve `npm run smoke:browser` akışları çalıştırıldı.
- Senaryoların büyük bölümü browser smoke ile desktop ve 750px viewportta doğrulandı.

### Önemli Kod/Girdi Değişiklikleri

- `apps/dashboard/src/DashboardApp.jsx`: sinyal filtreleri, grafik, screener, portföy, raporlar ve admin UI davranışları.
- `apps/dashboard/src/dashboard.css`: dashboard, sinyaller, screener, portföy, rapor ve admin görsel düzenleri.
- `scripts/smoke-browser.mjs`: route, grafik, sinyal, alarm, screener, portföy ve rapor doğrulamaları.
- `src/state.js`, `src/api.js`, `src/signal-engine.js`, `src/signal-engine.cjs`.
- `fvt-price-proxy.cjs`.
- `docs/*`: teknik sözleşme, mimari ve devir notları.

## 2. Kalan İşler

### A. Kritik Teknik Tamamlama

1. `#signals` smoke deterministikliği: satır sayısı hesabı filtre etkisini yansıtıyor; `all` baseline ile karşılaştırma kurulmalı.
2. Tüm `SignalFilter` aksiyonları tekil `data-*` selector ile sabitlenmeli; metin eşleşmesi bağımlılığı kaldırılmalı.
3. Quick alarm ve preset akışında `signalRows` okumaları `signalFilterState` ile hizalanmalı.
4. Selectbox/comboboxların dışarı tıklama ile kapanma ve odak/blur davranışı stabil hale getirilmeli.

### B. Gelişmiş Grafik ve Marker

1. Marker hover metinleri ve overlap kontrolü iyileştirilecek.
2. Trigger markerları için gösterim, renk ve okuma ergonomisi netleştirilecek.
3. Candlestick, hacim barları ve hover OHLC bilgisi eklendi; overlay/Fib etiketleri ayrı raylara taşınarak marker okunabilirliği artırıldı.

### C. Dinamik Fibonacci ve Sinyal Etkisi

1. Manuel hedef ile otomatik Fib hedef farkı net açıklama halinde gösterilmeye devam edecek.
2. Fib güven skoru ve otomatik planlama açıklaması kullanıcıya net anlatıma dönüştürülecek.
3. Sinyal skorunda yakınlık arttıkça skorun nasıl değiştiği ve formüller tooltip/doküman ile açıklanacak.

### D. Screener, Kıyaslama ve Heatmap

1. Trigger özetleri screener kartlarına taşındı.
2. Kıyaslama sayfasına trigger odaklı kolonlar eklendi.
3. Screener gelişmiş kriterleri eklendi: min skor, max risk ve trigger kategorisi kaydedilebilir preset modeline dahil edildi.
4. Analist hedef farkı screener kriteri, özet metriği, karşılaştırma kartı, sonuç tablosu ve CSV export kapsamına eklendi.

### E. Portföy, Rapor ve Gelişmiş Export

1. Gerçekleşen ve gerçekleşmemiş kâr/zarar hesapları genişletildi.
2. İşlem günlüğü ve stop/target izleme akışı güçlendirildi; risk limit özeti risk/portföy oranı, yoğunlaşma ve stopsuz pozisyon kontrolü gösteriyor.
3. Günlük/haftalık rapor UX'i geliştirildi: HTML rapor güçlüler, zayıflar, risk, Fib ve haber etkisi bölümlerini ortak section modeliyle üretiyor; CSV export izleme, sinyal, portföy, işlem günlüğü ve alarm geçmişini kapsıyor; JSON backup/restore korunuyor.

### F. Admin UI Dokunuşları

1. Provider/LLM test sonuçlarında durum, HTTP kodu, süre ve test saati görünür hale getirildi.
2. Job run ve cache temizleme sonuçları `Son Operasyon Sonucu` kartında tür, durum, hedef, zaman ve süre bilgisiyle görünür hale getirildi.
3. Audit filtreleme alanı arama, durum filtresi ve özet metrikleriyle genişletildi.

## 3. Yarın İlk Saatte Yapılacak Sıralı Adımlar

1. `git status --short` ile değişiklikleri kontrol et ve sadece işaretli dosyalara odaklan.
2. Servisleri ayağa kaldır ve sağlık kontrolü yap: `npm run start`, ardından `GET /api/health`.
3. `npm run build`, `npm run smoke:http` ve `npm run smoke:browser` çalıştır.
4. `scripts/smoke-browser.mjs` içinde `#signals` için önce `all` filtre baseline'ını, sonra `risk` filtreli durumu doğrulayan akışı uygula.
5. Dashboard ve Sinyallerde regresyon yoksa kalan yeni özelliklere geç.

## 4. Yüksek Riskli Noktalar

- Türkçe karakter bozulmaları geçmişte çıktıda oluştu; UI metinleri UTF-8 ve file encoding kontrolünde sürdürülmeli.
- Hisse logosu, selector listeleri ve comboboxlarda görsel uyum problemleri tekrar test edilmeden yeni özellik eklenmemeli.
- Kullanıcı verisi; favori, hedef, plan, alarm ve watchlist dahil olmak üzere localStorage + JSON export/import hattında korunmalı.

## 5. İletişim Notu

Bu belge yarın devam için güncel handover olarak kullanılabilir. Öncelik, dashboard ve sinyallerde özellik kaybı yaratmadan Matrix V2 planındaki kalan işleri küçük doğrulanabilir parçalara bölerek ilerlemektir.
