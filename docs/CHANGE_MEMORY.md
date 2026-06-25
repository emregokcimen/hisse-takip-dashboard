# Change Memory

Bu dosya projede yapilan onemli karar ve duzeltmeleri kisa hafiza olarak tutar.

## 2026-06-07

### Yatirim Izleme ve Haber Etkisi Paketi

- Proxy haber endpointi haberleri rule-based sentiment/impact skoruyla normalize eder.
- Haber item alanlari `sentiment`, `impact`, `sentimentScore`, `impactScore`, `turkishSummary` ile genisletildi.
- Dashboard KPI'lari haber pozitif/negatif, ozel hedef, hedef ustu, guclu sinyal ve yuksek risk sayilarini kapsayacak sekilde genisletildi.
- Hedef, teknik/risk ve haber etkisi icin yeni select filtreleri eklendi.
- Detay paneli Grafik, Haberler, Analiz ve Notlar sekmelerine ayrildi.
- Notlar sekmesinde izleme notu, giris fiyati, alim bolgesi, stop seviyesi ve pozisyon etiketi localStorage'da saklanir.
- Finans terminali gorselligi ve animasyonlari genisletildi; `prefers-reduced-motion` korunur.

### Fiyat Tazeligi, Logo ve Ozel Katalog

- Yahoo fiyat `updatedAt` alani son normal piyasa islem/kapanis zamanini gosterebilir; hafta sonu bu deger 1 gun once gorunmesi normaldir.
- UI stale olmayan ama saatler once kapanmis piyasa fiyatini `Son piyasa fiyati: ...` etiketiyle gosterir.
- Logo rozetleri dairesel yapildi; img beyaz kutu arka plani kaldirildi ve logo daireyi dolduracak sekilde `object-fit: cover` kullanir.
- Kullanici yeni kategori/hisseyi UI'daki `Yeni kategori / hisse ekle` panelinden ekleyebilir.
- Ozel hisseler localStorage `hisse-dashboard-custom-stocks-v1` anahtarinda saklanir ve runtime katalogla birlestirilir.
- Proxy katalogda olmayan sembolleri artik dogrudan reddetmez; Yahoo/Stooq/Google ile fiyat denemesi yapar.

### Vite Dashboard'a Tasima

- Eski tek HTML uygulama Vite app yapisina tasindi.
- Proje `hisse takip` klasorunde calisacak sekilde duzenlendi.
- Legacy HTML calisir yedek/yonlendirme olarak korundu.

### Proxy Veri Otoritesi

- Tarayicinin dogrudan FVT/Yahoo/Google fallback yonetmesi kaldirildi.
- Fiyat fallback sirasi proxy'ye tasindi:
  - Yahoo Finance
  - Stooq
  - FVT
  - Google Finance
  - lastKnown
- Batch snapshot endpointi eklendi: `/api/snapshots?symbols=...`
- Health/status/fallback rapor endpointleri eklendi.

### UI Dashboard

- KPI kartlari, kategori tablari, kontrol paneli, quick sortlar eklendi.
- Desktop table ve mobile card akisi ayrildi.
- Detay paneli eklendi.
- Tema, density ve favoriler localStorage ile kalici yapildi.

### Fibonacci ve Fiyat Duzeltmeleri

- Fib hedef/fiyat uzakligi state modelinde normalize edildi.
- Fib'e yakin hisseler icin toast uyarisi korundu.
- Grafik uzerinde Fib hedef cizgisi ve son fiyat marker'i eklendi.

### NAND Depolama ve Veri Saklama

- NAND/depolama kategorisi katalogda listelenir.
- Depolama hisseleri dashboard filtre/siralama akisi icinde normal hisse gibi davranir.

### Performans ve Heatmap

- 1-12 aylik getiriler performance endpointinden alinir.
- Heatmap tablo/kartta kompakt bar, detay panelinde buyuk bar olarak ayrildi.
- 1A/3A/6A/12A ozetleri detay panelinde gosterilir.

### Arama Focus Duzeltmesi

- Sorun: tek harf yazinca render input'u yeniden olusturuyor, focus kayboluyordu.
- Cozum:
  - `captureFocusState()`
  - `restoreFocusState()`
- Dogrulanan akış: `n -> nv -> nvd -> nvda`
- Focus `searchInput` uzerinde kalir, caret ilerler, sonuc sayisi dinamik guncellenir.

### Kategori Selectbox ve 12 Aylik Getiri

- Kategori buton seridi kaldirildi.
- Kategori filtresi kontrol panelinde `categoryFilter` selectbox olarak gosterilir.
- Durum ve uyari esigi selectboxlari `select-field` gorsel sistemiyle duzenlendi.
- Detay panelinde grafik altindaki getiri kutulari 1A, 2A, 3A, 4A, 5A, 6A, 7A, 8A, 9A, 10A, 11A, 12A olarak tamamlandi.

### Logo Duzeltmesi

- Logo endpointi gercek sirket logosu kaynaklarini once dener.
- Kaynak sirasi:
  - Clearbit
  - DuckDuckGo icon
  - Google favicon
  - katalog logo
  - SVG fallback

### Grafik Gorsellestirme

- Basit cizgi grafik yerine katmanli SVG grafik eklendi.
- Son fiyat etiketi sagda, Fib etiketi solda tutulur.
- Min/max marker ve fiyat guide eklendi.
- 6A ve 1Y gibi uzun grafiklerde cizgi animasyonunun yarim kalmamasi icin SVG path `pathLength="1"` ile normalize edildi; CSS dash de `1` uzerinden calisir.

### Skor Bilgilendirme

- Skor bilesenleri row modeline eklendi: Fib yakinligi, 12A trend, 1A momentum, veri tazeligi.
- Tablo, mobil kart ve detay panelinde skor yanina info tooltip eklendi.
- "Skor" etiketi "Genel skor" olarak netlestirildi. Tooltip toplam skorun sadece Fib'e yakinlik olmadigini ve Fib puaninin 35 puanlik ayri bir bilesen oldugunu gosterir.
- Tablo ilk iki satirindaki skor tooltip'i yukari tasip kesilmemesi icin asagi acilir.
- Tablo basliklari kolon siralamasi icin tiklanabilir hale getirildi.
- Fib hedef altindaki kafa karistiran "% tamam" metni kaldirildi; hedefe kalan veya hedef ustu yuzdesi gosterilir.
- Fiyat kaynagi rozeti fiyat altinda ayri ve kompakt satir olarak hizalandi.
- Ilk iki satirdaki genel skor popup'i opak arka planla ve heatmap kolonuna binmeyecek sekilde sag tarafa acilir.
- Fib hedefleri artik detay panelinden duzenlenebilir; kullanici hedefleri localStorage `fibTargets` alaninda kalici tutulur ve hesap/grafik/uyari akisi bu hedefleri kullanir.

## Bilinen Riskler

- Finans kaynaklari ucretsiz/public endpointlere bagli oldugu icin zaman zaman gecici hata verebilir.
- Yahoo history bazi range/interval kombinasyonlarinda bos donebilir.
- Analysis verisi ucretsiz kaynaklardan geldigi icin her sembolde dolu olmayabilir.
- Proje vanilla JS oldugu icin render tum HTML'i yeniden yazar; interaktif alanlarda focus koruma dikkatle korunmalidir.

## Gelecek Gelistirme Fikirleri

- RSI/MACD paneli.
- Haber sentiment ozeti.
- Bilanco takvimi.
- Watchlist import/export.
- Local SQLite veya JSON cache.
- Detay panelinde coklu grafik karsilastirma.
- Proxy icin daha ayrintili retry/backoff politikasi.
