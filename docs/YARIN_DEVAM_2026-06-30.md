# Matrix Platform Devam Notu

## Tarih

2026-06-27 20:55 Türkiye saati

## Proje Konumu

- Klasör: `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`
- Ana URL: `http://127.0.0.1:8765/`
- Proxy/Admin API: `http://127.0.0.1:8766/`
- Rotalar: `#dashboard`, `#signals`, `#screener`, `#portfolio`, `#reports`, `#admin`

## Bugüne Kadar Tamamlananlar

- React + Vite microfrontend çekirdeği korunarak geliştirme devam ettirildi.
- Admin alanı ve SQLite odaklı operasyon modeli `src/admin/` altında inşa edildi.
- `#admin` paneli login, provider ve LLM ayarı, job çalıştırma, cache temizleme, audit ve sağlık durumu kartlarıyla çalışır hale getirildi.
- Araştırma panelinde Türkçe özet, haber skoru, sentiment, önemli haber vurgusu ve provenance göstergeleri eklendi.
- Sinyal merkezi gelişmiş filtreler, seçili sinyal explorer, trigger timeline, hızlı alarm önerisi ve alarm kuralı akışlarıyla genişletildi.
- Alarm merkezi kural düzenleme, validasyon, tetik geçmişi, susturma, erteleme ve browser notification bilgileriyle güçlendirildi.
- Sinyal geçmişinde önceki skor, skor farkı, yön, değişim nedeni ve meta strip gösterimi eklendi.
- Gelişmiş grafik tarafında indikatör panelleri, dinamik Fib plan kartı ve marker metadata akışı eklendi.

## Son Doğrulama

Çalıştırılan komutlar:

```powershell
node --check scripts\smoke-browser.mjs
node --check src\state.js
npm run build
npm run smoke:http
```

## Kalan Öncelikler

1. `#signals` browser smoke içindeki hızlı alarm kurgusu ve persistence kontrolünü stabil hale getir.
2. Grafik üzerinde trigger marker, hover ve etiket okunabilirliğini artır.
3. Candlestick, hacim paneli ve overlay görselleştirmelerini kalite kontrolünden geçir.
4. Fib skor mantığını, manuel ve otomatik hedef farkını kullanıcıya daha net açıkla.
5. Select/combobox bileşenlerini tek standartta tut.
6. Screener, Portföy ve Raporlar sayfalarını geliştirmeye devam et.

## Notlar

- Dashboard ve Sinyaller sayfalarında özellik kaybı olmamalı.
- Lokal kullanıcı verisi localStorage + JSON backup modeliyle korunacak.
- Finans dili analiz ve izleme dili olarak kalacak; yatırım tavsiyesi dili kullanılmayacak.
