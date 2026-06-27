# Matrix Platform - Devam Notu

Dashboard ve Sinyaller sayfaları korunarak Matrix V2 geliştirmelerine devam edilecek. Bu dosya eski devir notlarının temiz Türkçe özeti olarak tutulur.

## Korunacak Davranışlar

- Dashboard ana görünümü, detay paneli, grafik, haber, favori, Fib hedef ve katalog akışları korunacak.
- Sinyaller sayfası ayrı sayfa olarak kalacak.
- Alarm kuralı, tetik geçmişi, susturma, erteleme ve bildirim durumu akışları korunacak.
- Kullanıcı verisi localStorage + JSON export/import modeliyle kalacak.

## Devam Edilecek Alanlar

- Grafik hover, marker, hacim ve candlestick kalitesi.
- Select/combobox ortak standartları.
- Screener, Portföy ve Raporlar sayfalarının görsel ve teknik geliştirmeleri.
- Admin panelinde provider, LLM, job, cache ve audit yönetimi.

## Doğrulama

```powershell
npm run build
npm run smoke:http
npm run smoke:browser
```
