# Matrix Platform Devir Notları - 2026-06-27

Bu doküman, Matrix Platform V2 çalışmalarına kaldığımız yerden devam etmek için hazırlanmıştır. Ana kural değişmedi: Dashboard ve Sinyaller sayfalarındaki mevcut özellikler korunacak, yeni özellikler parça parça eklenecek.

## Proje Bilgisi

- Proje klasörü: `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`
- Web uygulaması: `http://127.0.0.1:8765/`
- Proxy/Admin API: `http://127.0.0.1:8766/`
- Ana rotalar: `#dashboard`, `#signals`, `#screener`, `#portfolio`, `#reports`, `#admin`

## Tamamlanan Ana İşler

- React + Vite microfrontend yapısı korunarak geliştirmeye devam edildi.
- Dashboard, Sinyaller, Screener, Portföy, Raporlar ve Admin rotaları korundu.
- `src/admin/` altında Node tabanlı admin altyapısı eklendi.
- Admin tarafında provider, LLM, job, cache, audit ve research snapshot akışları oluşturuldu.
- Kullanıcı yatırım verisi veritabanına taşınmadı; favoriler, hedefler, portföy, notlar ve alarm kuralları localStorage + JSON export/import modeliyle kalıyor.
- Admin panelinde local login, sistem sağlığı, provider/LLM testleri, cache temizleme, job çalıştırma ve audit görüntüleme akışları eklendi.
- Research panelinde Türkçe özet, haber etkisi, fiyat tepkisi, önemli haberler ve provenance bilgileri gösteriliyor.
- LLM ayarı yoksa ekran bozulmadan açık durum mesajı gösteriliyor.
- Sinyaller sayfası ayrı sayfa olarak korundu; gelişmiş filtreler, seçili sinyal explorer, trigger timeline, alarm kuralı ve alarm geçmişi akışları genişletildi.
- Grafik alanına indikatör panelleri, dinamik Fibonacci planı, sinyal marker bilgisi ve açıklanabilir sinyal detayları eklendi.

## Doğrulama

Önceki çalışmalarda aşağıdaki doğrulamalar kullanıldı:

```powershell
npm run build
npm run smoke:http
npm run smoke:browser
```

## Devam Öncelikleri

1. Dashboard ve Sinyaller için regresyonu kapalı tut.
2. Grafik marker, hacim, candlestick ve hover bilgilerini güçlendir.
3. Sinyal alarm geçmişi, susturma, erteleme ve bildirim akışlarını daha stabil hale getir.
4. Screener, Portföy ve Raporlar sayfalarını Dashboard/Sinyaller seviyesine yaklaştır.
5. Türkçe karakter ve okunabilirlik kontrolünü her değişiklik sonrası çalıştır.
