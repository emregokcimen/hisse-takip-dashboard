# Matrix Platform - Yarın Devam Detay Dokümanı

Bu doküman, kaldığımız yerden hızlı ve güvenli devam etmek için hazırlanmıştır. Ana kural: Dashboard ve Sinyaller sayfalarındaki mevcut özellikler kaybedilmeyecek, Matrix V2 planı parça parça uygulanacak.

## Proje Bilgisi

- Proje klasörü: `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`
- Web uygulaması: `http://127.0.0.1:8765/`
- Proxy/Admin API: `http://127.0.0.1:8766/`
- Ana rotalar: `#dashboard`, `#signals`, `#screener`, `#portfolio`, `#reports`, `#admin`
- Önemli not: Worktree kirli olabilir; alakasız dosyalar geri alınmayacak.

## Güncel Durum

- Dashboard, Sinyaller, Screener, Portfolio, Reports ve Admin rotaları ana akışta korunuyor.
- Kullanıcı yatırım verisi localStorage + JSON import/export tarafında kalıyor.
- Admin/backend sistem verileri, provider/LLM ayarları, job, audit, cache ve research snapshot akışları ayrı tutuluyor.
- Haber sekmesi araştırma paneli gibi genişletildi.
- Türkçe özet, haber etkisi, fiyat tepkisi, provenance, en etkili haberler ve LLM yapılandırma durumu gösteriliyor.
- `#signals` ayrı sayfa olarak korundu.
- Aktif sinyaller için Trend, Momentum, Reversal, Breakout, Risk, Haber, Fib ve Hacim filtreleri korunuyor.
- Trigger timeline ve grafik markerları teknik, hacim, Fib, haber ve risk kategorilerine göre çalışıyor.
- Watchlist CSV ve Sinyaller CSV export kolonlarına trigger kategori bilgileri eklendi.

## Son Başlanan Parça

- Screener kriterlerine trigger odaklı filtreler eklendi.
- Momentum preset'i hacim trigger kriterini de kullanacak şekilde genişletildi.
- Screener tablosuna trigger kolonu ve trigger summary strip eklendi.
- Karşılaştırma matrisine trigger metriği eklendi.

## Doğrulama Komutları

```powershell
npm run build
npm run smoke:http
npm run smoke:browser
```

## Devam Planı

1. Dashboard ve Sinyaller regresyonunu tekrar doğrula.
2. Grafik hacim barları, candlestick ve hover OHLC bilgilerini geliştir.
3. Alarm geçmişi, susturma, erteleme ve bildirim akışını daha iyi test et.
4. Screener preset, kategori heatmap ve karşılaştırma metriklerini genişlet.
5. Portföy tarafında realized/unrealized P/L ve broker CSV import akışını güçlendir.
6. Raporlar tarafında günlük/haftalık rapor geçmişi ve JSON backup doğrulamasını sürdür.
