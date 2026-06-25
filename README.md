# Hisse Takip Dashboard

Bu klasor tasinabilir local web app olarak hazirlandi. Klasoru baska bir Windows bilgisayara kopyalayip calistirmak icin Node.js LTS yeterlidir.

## Baslatma

1. Node.js LTS kurulu olmalidir: https://nodejs.org/
2. `start-dashboard.cmd` dosyasina cift tiklayin.
3. Uygulama acilmazsa tarayicidan `http://127.0.0.1:8765/` adresini acin.

Script ilk calistirmada `npm install` ile Vite bagimliliklarini kurar, sonra:

- React shell: `http://127.0.0.1:8765/`
- Fiyat proxy: `http://127.0.0.1:8766/`

Gelistirme komutlari:

```powershell
npm run dev:shell
npm run proxy
```

## Veri Sirasi

Snapshot fiyatlari proxy tarafinda normalize edilir. Oncelik sirasi:

1. Yahoo Finance
2. Stooq
3. FVT `https://fvt.com.tr/`
4. Google Finance
5. Son bilinen cache

FVT verisi korunur fakat birincil otorite degildir. Tarayici dogrudan finans kaynaklariyla ugrasmaz; kaynak/fallback karari proxy icindedir.

## Kontrol

Saglik kontrolu:

```powershell
Invoke-RestMethod http://127.0.0.1:8766/api/health
```

Toplu fiyat kontrolu:

```powershell
Invoke-RestMethod "http://127.0.0.1:8766/api/snapshots?symbols=NVDA,AMD,TSLA"
```

Yerel smoke kontrolu:

```powershell
npm run smoke:http
npm run smoke:browser
```
