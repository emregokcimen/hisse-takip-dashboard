# UI Behavior

## Dashboard Alanları

- Topbar: canlı proxy durumu, son yenileme saati ve manuel yenileme butonu.
- Piyasa özeti: Fib'e en yakın hisseler, güçlü 12A hisseler, pozitif haber ve yüksek risk özetleri.
- KPI grid: görünen hisse, Fib'e yakın, canlı veri, haber pozitif, risk yüksek, 12A pozitif sayıları.
- `#dashboard`: ana izleme dashboardudur; sinyal merkezi bu sayfaya gömülmez.
- `#signals`: aktif sinyaller, alarm kuralları, tetiklenen alarmlar ve sinyal geçmişi için ayrı sayfadır.
- Filtre paneli: arama, kategori, durum, sıralama, getiri periyodu, hedef filtresi, sinyal filtresi, uyarı eşiği, Fib'e yakın ve favoriler.
- Filtre panelindeki ve form alanlarındaki dropdownlar native select yerine Metronic benzeri custom select bileşeniyle gösterilir.
- Ortak `SelectField` kullanılan tüm dropdownlarda yazıyla arama kutusu bulunur; kategori, durum, sıralama, periyot, hedef, sinyal, pozisyon etiketi ve katalog kategori seçimi aynı standarttadır.
- İzleme listesi: desktop tabloda sembol, şirket, güncel fiyat, Fib hedefi, Fib uzaklığı, seçili getiri, 1-12A ısı haritası, sinyal şeridi, risk, skor ve durum.
- Mobil kartlar: `760px` altında tablo yerine kart akışı; kartlarda fiyat, Fib metrikleri, 1-12A ısı haritası ve sinyal şeridi korunur.
- Detay paneli: seçili hisse, fiyat, Fib hedef editörü, sekmeler, grafik, 1-12A ısı haritası, metrikler, haberler, analiz ve yatırım notları.
- Katalog paneli: izleme listesinin üstünde yer alır; Nasdaq şirket arama/seçme, kategori seçme, Fib hedef girme, hisse ekleme, Nasdaq senkron ve özel kategori yönetimi sağlar.

## Breakpoint

CSS breakpoint:

```css
@media (max-width: 760px)
```

Bu breakpoint altında:

- `.table-card` gizlenir.
- `.stock-card-list` grid olarak görünür.
- Mobil kartlarda favori toggle, satır seçimi, özel hisse silme, heatmap ve sinyal rozetleri korunur.
- Sayfa yatay scroll üretmemelidir.

## Arama ve Filtreler

Arama kutusu React controlled input olarak çalışır.

Arama eşleşen alanlar:

- `symbol`
- `company`
- `category`

Filtreler `setFilters()` üzerinden state'e yazılır. Görünür satırlar `getVisibleRows()` ile yeniden hesaplanır.

Filtre sonrası seçili hisse görünür listede yoksa dashboard ilk görünür satırı detay paneline senkronize eder. Böylece detay paneli ile arka planda yüklenen haber/analiz sembolü ayrışmaz.

## Sıralama

Desktop tablo başlıkları tıklanabilir sıralama kontrolüdür.

Desteklenen sıralama alanları:

- Sembol
- Şirket
- Güncel fiyat
- Fib hedef
- Fib uzaklığı
- Seçili getiri
- Sinyal
- Risk
- Skor
- Durum

Aynı başlığa tekrar tıklanırsa sıralama yönü değişir.

## Isı Haritası ve Sinyaller

- `ReturnHeatmap` bileşeni her hisse için 1A-12A getiri ısı haritasını gösterir.
- Yeşil hücreler pozitif, kırmızı hücreler negatif, gri hücreler veri yok durumudur.
- Renk yoğunluğu mutlak getiri büyüdükçe artar.
- Tablo görünümünde heatmap kompakt gösterilir; detay panelinde değer etiketleriyle daha geniş gösterilir.
- `SignalStrip` teknik sinyal, haber etkisi, hedef durumu ve risk etiketlerini birlikte gösterir.
- Gelişmiş sinyal listesi ve alarm motoru yalnızca `#signals` sayfasında gösterilir.
- Sinyal satırına tıklanınca seçili hisse detay paneli grafik sekmesine geçer ve sinyal marker'ı grafikte görünür.
- Alarm kuralları ve tetiklenen alarm geçmişi localStorage'da saklanır.

## Screener

- Screener hazır presetleri, kategori heatmap'i ve karşılaştırma matrisiyle çalışır.
- Gelişmiş kriter panelinde minimum sinyal skoru, maksimum risk skoru, minimum analist hedef farkı ve trigger kategorisi seçilebilir.
- Kaydedilen screener presetleri dashboard filtreleriyle birlikte gelişmiş kriterleri de saklar.
- Trigger kategorileri teknik, hacim, Fib, haber ve risk olarak ayrılır.
- Screener özetinde analist hedefi güncel fiyatın üstünde olan hisse sayısı ve pozitif haber sayısı görünür.
- Karşılaştırma matrisinde analist hedef farkı, haber skoru ve trigger özetleri gösterilir.
- Tarama CSV dışa aktarımı analist hedef farkı ve tetikleyici kategorilerini içerir.

## Detay Paneli

Detay paneli sekmeleri:

- Grafik
- Haberler
- Analiz
- Notlar

Grafik sekmesi:

- Range butonları: `1G`, `1H`, `1A`, `3A`, `6A`, `1Y`
- `1H` görünümü proxy tarafından desteklenen `5d/30m` geçmiş verisiyle yüklenir; geçersiz `1h/1m` isteği atılmaz.
- Fiyat çizgisi ve Fib hedef çizgisi gösterilir.
- Fib hedef çizgisi grafik üzerinde etiketlenir.
- Grafik üzerinde hover yapılınca ilgili konumdaki fiyat marker ve tooltip olarak gösterilir.
- Grafik hover bilgisinde tarih, fiyat, OHLC ve hacim bilgisi bulunur.
- History verisi OHLC içeriyorsa grafik çizgisiyle birlikte mum katmanı ve hacim barları gösterilir.
- MA overlay etiketleri sol üst rayda, Fibonacci seviye etiketleri sağ rayda gösterilir; böylece grafik üzerindeki çizgiler ve sinyal rozeti birbirini örtmez.
- Grafik altında 1A-12A heatmap ve getiri kutuları bulunur.

Fib hedef formu:

- `Kaydet` seçili hisse için özel hedefi localStorage'a yazar.
- `Varsayılan hedefe dön` katalog hedefine geri döner.

Notlar sekmesi:

- Not
- Giriş fiyatı
- Alım bölgesi
- Stop seviyesi
- Pozisyon etiketi

Bu alanlar localStorage'da saklanır.

## Genel Skor

Genel skor yatırım tavsiyesi değildir; sadece izleme ve sıralama yardımcısıdır.

Formül bileşenleri:

- Fib puanı: hedefe yakınlık arttıkça yükselir.
- 12A trend: uzun dönem momentum pozitifse yükselir.
- 1A momentum: kısa dönem momentum pozitifse yükselir.
- Veri tazeliği: canlı veri daha yüksek puan alır.

## Katalog ve Özel Hisseler

Katalog panelinde:

- Yeni kategori eklenebilir.
- Nasdaq evreninden şirket aranabilir.
- Nasdaq evreni proxy tarafında 24 saatlik TTL ile otomatik yenilenir; proxy açık kaldığında günlük arka plan senkronu da çalışır.
- Nasdaq arama sonucu Metronic tarzı açılır combobox içinde sembol, şirket ve otomatik kategori bilgisiyle birlikte gösterilir.
- Seçilen Nasdaq hissesi otomatik kategoriyle forma gelir; kullanıcı isterse kategoriyi elle değiştirebilir.
- Fib hedef boş bırakılırsa hisse ekleme sırasında 1 yıllık günlük fiyat geçmişinden son anlamlı swing low/high aralığı bulunur.
- Otomatik Fib hedef hesabı şu oranları kullanır: `0.236`, `0.382`, `0.5`, `0.618`, `0.786`, `1`, `1.272`, `1.618`, `2`.
- Güncel fiyat eski tepenin altında kalıyorsa üstteki en yakın Fibonacci direnç seviyesi hedef seçilir; fiyat tepeye yakın/üstündeyse extension seviyeleri hedefe dönüşür.
- Yeterli geçmiş veri yoksa son çare olarak güncel fiyatın `1.272` uzantısı kullanılır.
- Seçilen şirket için kategori ve Fib hedef girilerek özel hisse eklenebilir.
- Kullanıcı Fib hedef alanına elle değer girerse otomatik hesap yerine bu değer kullanılır.
- Kullanıcı özel kategori oluşturabilir, adını düzenleyebilir veya kullanılmayan özel kategoriyi silebilir.
- Özel hisse desktop tabloda ve mobil kartta `Sil` aksiyonu ile kaldırılabilir.
- Sabit katalog hisseleri de `Sil` aksiyonu ile izleme listesinden gizlenebilir; aynı sembol Nasdaq listesinden tekrar eklenirse görünür hale gelir.
- Özel hisse silinince snapshot, history, performance, news, analysis, favori, özel hedef ve yatırım planı ilişkili state'ten temizlenir.

## Portföy ve Risk

- Portföy KPI alanında piyasa değeri, açık P/L, gerçekleşmiş P/L, risk edilen tutar ve hedefe kalan değer gösterilir.
- İşlem performansı kartı, işlem günlüğündeki satışlardan kapanan işlem sayısını, kazanç oranını, ortalama kazanç/kayıp yüzdelerini ve net gerçekleşmiş P/L bilgisini hesaplar.
- Portföy CSV export kapanan işlem, kazanç/kayıp sayısı ve kazanç oranı kolonlarını içerir.
- Broker CSV içe aktarma kartında örnek CSV yükleme, geçerli/uyarı sayısı, alım/satım toplam değeri ve etkilenen semboller görünür; önizleme yapmadan localStorage'a yazılmaz.
- Broker CSV içe aktarma geçerli satırları işlem günlüğüne aktarır ve alım/satım pozisyon adedi ile ortalama maliyeti günceller.
- Risk Limit Özeti kartında risk/portföy oranı, yüksek riskli pozisyon sayısı, en büyük pozisyon ağırlığı ve stop tanımı olmayan pozisyon sayısı gösterilir.
- Risk listesi stop mesafesi ve risk edilen tutara göre, hedef listesi Fib/manuel hedef mesafesine göre sıralanır.
- Kategori yoğunlaşması kartı piyasa değeri, açık P/L ve risk dağılımını kategori bazında gösterir.

## Raporlama

- Günlük piyasa özeti kartında görünür hisse, canlı veri, pozitif/negatif getiri, Fib yakın, risk ve alarm metrikleri gösterilir.
- Günlük piyasa özetinde portföy açık P/L, gerçekleşmiş P/L ve işlem kazanç oranı ayrı paragraf olarak görünür.
- Haftalık rapor kartında en güçlü performans, zayıf performans, risk kontrol listesi, Fib hedefine yakın hisseler, haber etkisi izleme ve portföy disiplini bölümleri görünür.
- HTML rapor aynı haftalık bölüm modelini kullanır; her tabloda sembol, şirket, kategori, fiyat, ana metrik ve izleme notu yer alır.
- CSV export kapsamı izleme listesi, sinyaller, portföy pozisyonları, işlem günlüğü ve alarm geçmişini ayrı dosyalar olarak sunar.
- JSON yedek/içe aktarma kullanıcı verisini localStorage kapsamıyla sınırlar.
- JSON içe aktarma alanı yapıştırılan yedek içeriğini yazmadan önce doğrular; geçerli dosyada içe aktarılacak localStorage kapsamı ve kayıt sayıları önizleme kartında görünür.

## Komut Paleti

- `Ctrl+K` komut paleti sayfa geçişi, hisse açma, araştırma açma ve filtre komutlarını destekler.
- Hazır çalışma alanı komutları bulunur: Favoriler, Risk, Fib'e yakın, Haber etkisi, Portföy ve mevcut kategoriye göre AI/NAND.
- Çalışma alanı komutları yeni veri modeli oluşturmaz; mevcut filtreleri, sıralamaları ve route'ları tek aksiyonla uygular.
- Komut butonları stabil test/otomasyon için `data-command-id` taşır; workspace komutları `workspace-*` id standardını kullanır.

## Araştırma Paneli

- Araştırma paneli Türkçe özet, haftalık özet, haber etkisi, analist hedefi ve `+1G/+3G/+7G` fiyat tepkisini gösterir.
- Teknik detay kartı sinyal, skor, güven, risk, trigger etiketleri ve açıklama nedenlerini listeler.
- Risk ve analist kartı risk skoru, risk seviyesi, analist hedefi, hedef farkı ve risk uyarılarını gösterir.
- En etkili haberlerde Türkçe özetin altında haber sonrası fiyat reaksiyonu ve haberin neden öne çıkarıldığı yazılır.

## Admin Operasyon Paneli

- Yönetim paneli giriş sonrası sistem sağlığı, uygulama ayarları, LLM ayarları, sağlayıcı/önbellek, görev, araştırma kaydı ve denetim kartlarını gösterir.
- Sağlayıcı satırlarında aç/kapat, ad, öncelik, temel URL, test URL, zaman aşımı ve not alanları düzenlenebilir; kayıtlı sağlayıcının kimliği secret eşleşmesini korumak için kilitlidir. Yeni eklenen sağlayıcının kimliği ilk kayda kadar düzenlenebilir.
- `Sağlayıcı Ekle`, `Sil`, `Sağlayıcıları Kaydet` ve `Test Et` aksiyonları bulunur. Kaydedilmemiş sağlayıcı taslağı yönetim paneli yenilense bile ekranda korunur ve `Kaydedilmemiş` rozetiyle gösterilir.
- Sağlayıcı test sonucu satırı başarı/hata durumunu, HTTP kodunu, süreyi ve test saatini gösterir. Secret alanları UI draft'ına taşınmaz ve gerçek değerle gösterilmez; backend maskeli/preserve akışını korur.
- LLM ayar kartında `LLM Test Et` aksiyonu bulunur; secret değerler gösterilmeden sadece test durumu ve kısa mesaj yazılır.
- Test sonucu yoksa kullanıcıya `henüz test edilmedi` durumu gösterilir; boş alan bırakılmaz.
- Görev çalıştırma ve önbellek temizleme aksiyonları sonrası `Son Operasyon Sonucu` kartında tür, durum, hedef, başlangıç, bitiş ve süre bilgisi gösterilir.
- Denetim kartında aksiyon/kullanıcı/durum üzerinden arama yapılabilir, durum filtresi seçilebilir ve toplam/başarılı/uyarı/hata/görünen kayıt özeti gösterilir.
- Araştırma kayıtları kartında sembol/özet/sağlayıcı araması, sağlayıcı filtresi, toplam/görünen/sağlayıcı/yüksek etki/son üretim özeti ve araştırma kaydı temizleme aksiyonu bulunur.
- Yönetim veri yükleme akışında oturum doğrulaması ayrı tutulur; araştırma/dışa aktarma gibi ikincil bölüm hatalarında panel kapanmaz, kullanıcıya eksik bölüm mesajı gösterilir.

## Logo

Logo URL'si UI tarafında proxy üzerinden kullanılır:

```text
{PROXY_ROOT}/api/logo/{SYMBOL}
```

Logo yüklenemezse gömülü SVG yedek görsel kullanılır. UI dış favicon servislerine doğrudan gitmez; böylece konsol/ağ 404 hatası oluşmaz.

## Animasyon ve Görsel Kurallar

- KPI değerleri kısa geçiş animasyonu kullanır.
- Hover satırları hafif yükselir.
- Grafik çizgisi glow efekti kullanır.
- Isı haritası hücreleri pozitif/negatif yoğunluğu görsel olarak vurgular.
- Fibonacci toast sağ üstte çıkar; grafik veya detay panel metinlerini örtmez.
- `prefers-reduced-motion` korunur.
