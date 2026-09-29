# ⚙️ scripts — Yardımcı komutlar

Komutları repo klasöründe aç (GitHub Desktop → **Repository → Open in Command Prompt**) ve çalıştır.
Ek paket gerekmez, sadece Python 3.

| Komut | Ne yapar |
|---|---|
| `python scripts/progress.py save <isim>` | Çözdüğün challenge'ları `progress/<isim>.json`'a kaydeder |
| `python scripts/progress.py status` | Ekibin OWASP kategorisine göre ilerleme tablosu |
| `python scripts/progress.py load [isim]` | Kayıtlı ilerlemeyi Juice Shop'a yükler |
| `python scripts/validate.py` | Dosya adları, klasörler ve bulgu alanlarını kontrol eder. **Push'lamadan önce çalıştır.** |

`python` bulunamadı derse `py` ile dene.
