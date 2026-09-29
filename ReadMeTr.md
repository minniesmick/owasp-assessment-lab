<div align="center">

[![English](https://img.shields.io/badge/lang-English-blue?style=for-the-badge)](README.md)
[![Türkçe](https://img.shields.io/badge/dil-T%C3%BCrk%C3%A7e-red?style=for-the-badge)](ReadMeTr.md)
[![Dashboard](https://img.shields.io/badge/Dashboard-live-6d5bd0?style=for-the-badge)](https://minniesmick.github.io/owasp-assessment-lab/)

# OWASP Top 10 Güvenlik Değerlendirme Laboratuvarı

Introduction to Cyber Security — Grup Projesi, 2026/2027 (Seçenek 3)

</div>

> [!TIP]
> **İlk kez mi buradasın?** GitHub'a alışık değilsen önce **[BASLANGIC.md](BASLANGIC.md)** rehberini oku —
> kurulumdan ilk bulguyu eklemeye kadar her adım orada.

**OWASP Juice Shop** uygulamasının **OWASP Top 10:2025**'in tüm kategorilerine göre güvenlik değerlendirmesi.
**PortSwigger Web Security Academy** lablarından derinlemesine teknik analizlerle desteklenir.
Bulgular ortak bir formatta toplanır ve bir değerlendirme panelinde (dashboard) görselleştirilir.

## İçindekiler
- [Dashboard](#dashboard)
- [Klasör yapısı](#klasör-yapısı)
- [Kurulum](#kurulum)
- [Çalışma akışı](#çalışma-akışı)
- [Challenge ilerlemesini paylaşma](#challenge-ilerlemesini-paylaşma)
- [Ekip](#ekip)
- [Etik](#etik)

## Dashboard
**https://minniesmick.github.io/owasp-assessment-lab/**

Ekibin çalışmasının canlı özeti: kim ne yaptı, OWASP kapsaması, bulgular, risk ve aktivite. Her `main` güncellemesinde
repodaki dosyalardan otomatik yeniden oluşturulur. Final sunumunda çalışmalar, bulgular ve ekran görüntüleri buradan gösterilecek.
Arayüzle ilgili öneriler için Alper'e yazın veya bir Issue açın — ayrıntılar [BASLANGIC.md → Dashboard](BASLANGIC.md#-dashboard).

## Klasör yapısı
| Yol | İçerik |
|---|---|
| `BASLANGIC.md` | Yeni başlayanlar için adım adım rehber |
| `AGENTS.md` | AI asistanları (ChatGPT, Claude, Copilot…) için proje kuralları |
| `findings/_TEMPLATE.md` | Bulgu şablonu — her bulgu için kopyalanır |
| `findings/juice-shop/` | Her Juice Shop bulgusu için bir Markdown dosyası (`JS-A05-001-login-sqli.md`) |
| `findings/portswigger/` | Her PortSwigger lab writeup'ı için bir dosya (`PS-A05-001-...md`) |
| `evidence/` | Ekran görüntüleri, `<bulgu-id>-<n>.png` şeklinde adlandırılır |
| `progress/` | Üye başına kayıtlı Juice Shop challenge ilerlemesi |
| `scripts/progress.py` | İlerlemeyi kaydetme / görüntüleme / yükleme |
| `scripts/validate.py` | Dosya adı, klasör ve zorunlu alanları kontrol eder (GitHub'da da çalışır) |
| `docs/` | Metodoloji, OWASP kapsam tablosu, etik |
| `paper/` | IEEE makalesi (5–7 sayfa) |
| `dashboard/` | Değerlendirme paneli (web arayüzü) — canlı: https://minniesmick.github.io/owasp-assessment-lab/ |
| `team.json` | Ekip listesi: isimler, GitHub kullanıcı adları, sorumlu OWASP kategorileri |
| `data/` | Juice Shop challenge kataloğu (dashboard için) |

## Kurulum
Gerekenler: **Docker Desktop**, **Python 3**, DevTools'lu bir tarayıcı (Chrome / Firefox).
İsteğe bağlı: **Burp Suite Community** veya **OWASP ZAP** — sadece isteklerin yakalanması veya tekrarlanması gereken challenge'lar için.
Hangi aracın ne zaman kullanılacağı: [Tools](docs/methodology.md#tools).

```bash
docker compose up -d        # Juice Shop'u başlat → http://127.0.0.1:3000
docker compose down         # durdur
```
- Sürüm **Juice Shop v20.2.0**'a sabitlendi, herkes aynı sürümü test eder.
- Juice Shop **her yeniden başlatmada tüm verileri sıfırlar**. Bir şey bulduğunda ekran görüntüsünü hemen al.
- Score Board (`/#/score-board`) tüm challenge'ları listeler, kategoriye göre filtrelenebilir.

## Çalışma akışı
1. **Kendi OWASP kategorilerinden** bir challenge seç (bkz. [Ekip](#ekip)).
2. Önce ilgili PortSwigger konusunu oku, sonra Juice Shop'ta çöz — DevTools (F12) ile başla, Burp/ZAP'ı sadece gerekince kullan.
3. İlerlemeni kaydet: `python scripts/progress.py save <isim>`.
4. Önemli challenge'lar için bulgu yaz: `findings/_TEMPLATE.md`'yi kopyala, doldur, ekran görüntülerini `evidence/`'a koy.
5. Dosyalarını kontrol et: `python scripts/validate.py` — çıkan her `[HATA]`'yı düzelt.
6. Commit'le ve push'la. Aynı kontrol GitHub'da otomatik çalışır; kırmızı ❌ bir şeyin yanlış olduğunu gösterir.
7. Bulgu `reviewed` olmadan önce başka bir üye tarafından tekrar edilir.

Bulgular **İngilizce** yazılır. Challenge çözmek ≠ bulgu yazmak. Makale `findings/` klasöründen yazılır; her OWASP kategorisi için en az 2–3 bulgu hedeflenir.
Detaylar: [CONTRIBUTING.md](CONTRIBUTING.md), [docs/methodology.md](docs/methodology.md).

## Challenge ilerlemesini paylaşma
Juice Shop veritabanı paylaşılamaz (her yeniden başlatmada sıfırlanır). Bu yüzden ilerleme, Juice Shop'un
**continue code**'ları ile `progress/<isim>.json` dosyalarında paylaşılır.

| Komut | Ne yapar |
|---|---|
| `python scripts/progress.py save <isim>` | Çözdüğün challenge'ları `progress/<isim>.json`'a ekler. Birikimli: yeniden başlatmadan sonra bile önceki kayıtlar korunur. |
| `python scripts/progress.py status` | OWASP kategorisi ve üye bazında ekip özeti. Hiçbir şeyi değiştirmez. |
| `python scripts/progress.py load [isim ...]` | Kayıtlı challenge'ları **senin** lokal Juice Shop'unda çözülmüş yapar (isim verilmezse tüm üyeler). |

Notlar:
- Her zaman **kendi isminle** kaydet. Bir takım arkadaşına zaten yazılmış challenge'lar sana tekrar yazılmaz.
- Ekibi takip etmek için `status` kullan. `load`'u sadece demo için kullan — arkadaşının challenge'larını yüklersen sende çözülmüş görünür.
- `save` ve `load` için Juice Shop çalışıyor olmalı. Farklı adres için `JUICE_SHOP_URL` ayarlanır.

## Ekip
| Üye | Sorumluluk |
|---|---|
| Alper | Lab kurulumu, PortSwigger writeup'ları, dashboard |
| Elif | Juice Shop: A01, A05, A07 |
| Samed | Juice Shop: A02, A04, A10 |
| Altay | Juice Shop: A03, A06, A08, A09 + CVSS puanlaması |

Tüm kategori eşlemesi: [docs/owasp-mapping.md](docs/owasp-mapping.md).

## Etik
Tüm testler **yalnızca** lokalde çalışan Juice Shop (`127.0.0.1`'e bağlı) ve PortSwigger Academy lablarında yapılır.
Başka hiçbir sistem test edilmez. Bkz. [docs/ethics.md](docs/ethics.md).
