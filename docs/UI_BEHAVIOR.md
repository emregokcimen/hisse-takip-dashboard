# UI Behavior

## Dashboard Alanları

- Topbar: canlı proxy durumu, son yenileme saati ve manuel yenileme butonu.
- Piyasa özeti: Fib'e en yakın hisseler, güçlü 12A hisseler, pozitif haber ve yüksek risk özetleri.
- KPI grid: görünen hisse, Fib'e yakın, canlı veri, haber pozitif, risk yüksek, 12A pozitif sayıları.
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

- `ReturnHeatmap` bileşeni her hisse için 1A-12A getirileri gösterir.
- Yeşil hücreler pozitif, kırmızı hücreler negatif, gri hücreler veri yok durumudur.
- Renk yoğunluğu mutlak getiri büyüdükçe artar.
- Tablo görünümünde heatmap kompakt gösterilir; detay panelinde değer etiketleriyle daha geniş gösterilir.
- `SignalStrip` teknik sinyal, haber etkisi, hedef durumu ve risk etiketlerini birlikte gösterir.

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

## Logo

Logo URL'si UI tarafında proxy üzerinden kullanılır:

```text
{PROXY_ROOT}/api/logo/{SYMBOL}
```

Logo yüklenemezse inline SVG fallback kullanılır. UI dış favicon servislerine doğrudan gitmez; böylece console/network 404 oluşmaz.

## Animasyon ve Görsel Kurallar

- KPI değerleri kısa geçiş animasyonu kullanır.
- Hover satırları hafif yükselir.
- Grafik çizgisi glow efekti kullanır.
- Heatmap hücreleri pozitif/negatif yoğunluğu görsel olarak vurgular.
- Fibonacci toast sağ üstte çıkar; grafik veya detay panel metinlerini örtmez.
- `prefers-reduced-motion` korunur.
