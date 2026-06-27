# Matrix Platform - Yarına Devam Dokümanı

**Tarih:** 2026-06-28  
**Klasör:** `C:\Users\emreg\OneDrive\Masaüstü\hisse takip`  
**Ana URL:** `http://127.0.0.1:8765/`  
**Proxy/Admin URL:** `http://127.0.0.1:8766/`

## Tamamlananlar

- React + Vite microfrontend çekirdeği korunarak Matrix V2 akışına devam edildi.
- Dashboard ve Sinyaller sayfalarında özellik kaybı olmadan geliştirme sürdürüldü.
- `src/admin/` altında admin operasyon katmanı eklendi.
- Provider, LLM, job, cache, audit ve kalıcı ayar akışları hazırlandı.
- Sinyal ve alarm tarafında trend, momentum, reversal, breakout, risk, haber, Fib ve hacim odaklı filtreler genişletildi.
- Alarm kuralları, bildirim durumu, susturma, erteleme ve tekrar tetiklenme bilgileri güçlendirildi.
- Araştırma tarafında Türkçe özet, haber etkisi, önem sıralaması ve provenance bilgisi gösteriliyor.
- LLM yapılandırması yoksa kullanıcıya açık uyarı veriliyor.
- Grafik tarafında sinyal marker ve metrik akışı geliştirildi.

## Kritik Kural

Dashboard ve Sinyaller sayfalarında mevcut özellik kaybı kabul edilmeyecek. Yeni işler diğer sayfaları geliştirebilir ancak ana akışları bozmamalıdır.

## Devam Sırası

1. `npm run build`, `npm run smoke:http` ve `npm run smoke:browser` ile mevcut durumu doğrula.
2. Sinyaller sayfasındaki alarm kuralı ve alarm geçmişi akışını stabil tut.
3. Select/combobox standartlarını, logo görünümünü ve metin hizalamalarını kontrol et.
4. Screener, Portföy ve Raporlar tarafındaki kalan Matrix V2 geliştirmelerine devam et.
