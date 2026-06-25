# Hisse Takip Dashboard Memory

Bu dosya projenin devralma notudur. Yeni bir gelistirme turuna baslamadan once bu dosyayi ve `docs/` klasorundeki ayrintili notlari oku.

## Proje Ozeti

- Proje tipi: Vite tabanli vanilla JavaScript web app.
- Ana klasor: `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`
- Uygulama URL: `http://127.0.0.1:8765/`
- Fiyat proxy URL: `http://127.0.0.1:8766/`
- Finansal cikti bilgilendirme amaclidir; yatirim tavsiyesi dili kullanilmaz.

## Dosya Haritasi

- `index.html`: Vite giris HTML dosyasi.
- `src/api.js`: Tarayici tarafindan proxy API cagrilari.
- `src/catalog.js`: `stock-catalog.json` icin katalog wrapper'i.
- `src/main.js`: Uygulama baslatma, veri yenileme, history/news/analysis yukleme.
- `src/state.js`: Filtreler, localStorage, row model, skor, teknik metrikler.
- `src/render.js`: Dashboard HTML render, event wiring, chart/heatmap/logo UI.
- `src/styles.css`: Tum tema, layout, tablo, detay paneli, grafik ve animasyon stilleri.
- `fvt-price-proxy.cjs`: Local HTTP proxy, fiyat fallback, history, performance, news, analysis ve logo endpointleri.
- `stock-catalog.json`: Hisse katalogu, kategori, Fibonacci hedefi ve logo domainleri.
- `start-dashboard.ps1` / `start-dashboard.cmd`: Proxy + Vite baslatma scriptleri.
- `legacy/`: Eski tek HTML uygulama yedegi.
- `dist/`: `npm run build` uretimi.

## Calistirma

```powershell
cd "C:\Users\emreg\OneDrive\Masaüstü\hisse takip"
npm start
```

Alternatif olarak:

```powershell
npm run proxy
npm run dev
```

## Dogrulama Komutlari

```powershell
npm run build
node -c .\fvt-price-proxy.cjs
Invoke-RestMethod http://127.0.0.1:8766/api/health
Invoke-RestMethod "http://127.0.0.1:8766/api/snapshots?symbols=NVDA,AMD,TSLA"
Invoke-RestMethod "http://127.0.0.1:8766/api/history/NVDA?range=1d&interval=5m"
Invoke-RestMethod http://127.0.0.1:8766/api/performance/NVDA
```

## Son Onemli Davranislar

- Arama input'u her karakterde dinamik filtreleme yapar ve render sonrasi focus/caret pozisyonunu korur.
- Kategori filtresi ust buton seridi degil, kontrol panelinde selectbox olarak gosterilir.
- Tablo ve mobil kartlar ayni state modelinden uretilir.
- Desktop tablo basliklari `data-table-sort-by` ile kolon siralamasi yapar; Heatmap kolonu secili getiri periyoduna gore siralanir.
- Fib hedef kolonu `fibTargetNote()` kullanir; "% tamam" yerine "Hedefe kalan" / "Hedef ustu" metni gosterilir.
- Fib hedefleri kullanici tarafindan detay panelindeki form ile degistirilebilir; `state.fibTargets` localStorage ayarlari icinde kalici saklanir.
- Fiyat kaynagi `sourceBadge()` fiyat altinda ayri rozet olarak hizalanir.
- Detay grafikte son fiyat etiketi sagda, Fibonacci hedef etiketi solda durur.
- Detay paneli sekmeli yapidadir: Grafik, Haberler, Analiz, Notlar.
- Haber verisi proxy tarafinda rule-based sentiment/impact ve Turkce ozet fallback alanlariyla normalize edilir.
- Kullanici yatirim plani alanlari localStorage icinde `hisse-dashboard-investment-plans-v1` anahtariyla saklanir.
- Ek filtreler state uzerindedir: `target`, `signal`, `news`.
- Ozel hisse/kategori ekleme localStorage tabanlidir: `hisse-dashboard-custom-stocks-v1`.
- Ozel semboller icin proxy katalog zorunlulugu gevsetildi; katalogda olmayan sembolde Yahoo/Stooq/Google fiyat denemesi yapilir.
- Detay fiyat tazeligi stale degilse ve piyasa kapanisindan geliyorsa `Son piyasa fiyati` diliyle gosterilir.
- Heatmap tablo/kartlarda kompakt bar, detay panelinde daha buyuk bar olarak gosterilir.
- Genel skor; Fib puani, 12A trend, 1A momentum ve veri tazeligi bilesenlerinden hesaplanir. Fib'e yakinlik tek basina toplam skoru belirlemez; UI'da info tooltip ile aciklanir.
- Tablo ilk iki satirindaki genel skor popup'i `drop-down` class'i ile asagi/saga acilir ve opak arka plan kullanir.
- Logo proxy once public stock/company logo kaynaklarini dener; basarisiz olursa SVG fallback dondurur.
- Snapshot fiyat kaynagi onceligi proxy tarafindadir: `Yahoo Finance -> Stooq -> FVT -> Google Finance -> lastKnown`.
- Veri yenileme `src/main.js` icinde 60 saniyelik interval ile calisir.

## Dikkat Edilecekler

- Tarayici dogrudan finans kaynaklarina gitmemeli; fallback ve normalize isleri proxy icinde kalmali.
- `renderShell()` tum HTML'i yeniden yazar. Input gibi aktif alanlarda focus kaybi olmamasi icin `captureFocusState()` / `restoreFocusState()` korunmali.
- Yeni filtre veya siralama eklenecekse DOM uzerinden degil `state.filters` ve `getVisibleRows()` uzerinden yapilmali.
- Selectbox filtreleri `select-field` wrapper'i ile stillenir; ciplak select eklenmemeli.
- Finansal veri hatali/stale ise UI bunu acik gostermeli.
- Yeni kategori/hisse eklerken `stock-catalog.json` guncellenmeli.

## Ayrintili Dokumanlar

- `docs/ARCHITECTURE.md`: Mimari ve modul sorumluluklari.
- `docs/API_CONTRACTS.md`: Proxy endpoint kontratlari.
- `docs/UI_BEHAVIOR.md`: UI, arama, grafik, heatmap, mobil davranis notlari.
- `docs/CHANGE_MEMORY.md`: Uygulamada yapilmis onemli degisikliklerin kisa hafizasi.
