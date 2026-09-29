# 👋 Başlangıç Rehberi — GitHub'ı ilk kez kullananlar için

Bu rehber sıfırdan ilk bulgunu eklemene kadar her adımı anlatır. Sırayla git, bir adımı atlama.
Takıldığın yerde [Sık karşılaşılan sorunlar](#sık-karşılaşılan-sorunlar) bölümüne bak, çözemezsen Alper'e yaz.

## İçindekiler
1. [Önce birkaç kelime (sözlük)](#1-önce-birkaç-kelime-sözlük)
2. [Tek seferlik kurulum](#2-tek-seferlik-kurulum)
3. [Her çalışma oturumu](#3-her-çalışma-oturumu)
4. [Bulgu ekleme ve Pull Request](#4-bulgu-ekleme-ve-pull-request)
5. [Arkadaşının PR'ını onaylama (review)](#5-arkadaşının-prını-onaylama-review)
6. [AI ile çalışma](#6-ai-ile-çalışma)
7. [Sık karşılaşılan sorunlar](#sık-karşılaşılan-sorunlar)

---

## 1. Önce birkaç kelime (sözlük)

| Terim | Anlamı |
|---|---|
| **Repo** | Projenin tüm dosyalarının durduğu klasör. Bu sayfa bir repo. |
| **Clone** | Repoyu kendi bilgisayarına indirmek (bir kere yapılır). |
| **Commit** | Yaptığın değişiklikleri bir açıklamayla kaydetmek. Oyundaki "save" gibi. |
| **Push** | Kendi bilgisayarındaki commit'leri GitHub'a göndermek. |
| **Pull / Fetch** | Başkalarının GitHub'a gönderdiklerini kendi bilgisayarına almak. |
| **Branch (dal)** | Ana projeyi bozmadan çalıştığın kendi kopyan. Her bulgu için yeni bir dal açılır. |
| **main** | Ana dal. Herkesin onaylanmış işi burada. **Buraya doğrudan yazamazsın**, bu bilerek böyle. |
| **Pull Request (PR)** | "Benim dalımdaki değişiklikleri main'e ekleyin" isteği. Bir arkadaş onaylayınca eklenir. |
| **Review** | Bir arkadaşının PR'ını kontrol edip onaylamak. |
| **✅ / ❌ (kontrol)** | Her PR'da otomatik çalışan dosya kontrolü. ❌ ise bir şey yanlış, detayına bak. |

Özet akış:
**dal aç → çöz → dosyaları ekle → commit → push → PR aç → ✅ + arkadaş onayı → main'e eklenir**

---

## 2. Tek seferlik kurulum

### 2.1 GitHub hesabı
1. https://github.com/signup adresinden hesap aç. Üniversite e-postanla açarsan https://education.github.com/pack ile ücretsiz Pro alabilirsin.
2. Kullanıcı adını Alper'e gönder.
3. E-postana gelen **davet**i kabul et, yoksa repoya dosya ekleyemezsin.

### 2.2 Programlar
| Program | Link | Not |
|---|---|---|
| **GitHub Desktop** | https://desktop.github.com | Git'i komut yazmadan kullanmak için. Önerilen yol bu. |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop | Juice Shop'u çalıştırmak için. Kurulumdan sonra bilgisayarı yeniden başlat. |
| **Python 3** | https://www.python.org/downloads | Kurarken **"Add python.exe to PATH"** kutusunu işaretle! |
| **VS Code** (isteğe bağlı) | https://code.visualstudio.com | `.md` dosyalarını düzenlemek ve önizlemek için rahat. Not Defteri de olur. |

Burp Suite / ZAP şimdilik gerekmez. Tarayıcının F12 (DevTools) aracıyla başla, ne zaman gerektiği [docs/methodology.md](docs/methodology.md#tools)'de yazıyor.

### 2.3 Repoyu bilgisayarına indir (clone)
1. GitHub Desktop'u aç → GitHub hesabınla giriş yap.
2. **File → Clone repository** → listeden `minniesmick/owasp-assessment-lab` seç.
3. **Local path** olarak kolay bulacağın bir yer seç (örn. `Belgeler\owasp-assessment-lab`) → **Clone**.

### 2.4 Juice Shop'u ilk kez çalıştır
1. Docker Desktop'u aç, sol altta yeşil "Engine running" yazana kadar bekle.
2. GitHub Desktop'ta **Repository → Open in Command Prompt** (veya PowerShell).
3. Açılan pencereye yaz:
   ```
   docker compose up -d
   ```
   İlk sefer birkaç dakika sürer (indiriyor).
4. Tarayıcıda http://127.0.0.1:3000 aç. Juice Shop açıldıysa kurulum tamam 🎉
5. İlk challenge'ı hemen çöz: http://127.0.0.1:3000/#/score-board adresine git.

---

## 3. Her çalışma oturumu

**Başlarken:**
1. Docker Desktop'u aç (Juice Shop otomatik başlar; başlamazsa `docker compose up -d`).
2. GitHub Desktop → üstteki **Fetch origin** → **Pull origin** varsa ona bas. Böylece herkesin son hali sende olur.
3. Üstte **Current branch → New branch** → isim ver: `isim/kisa-aciklama` (örn. `elif/js-a01-basket`) → **Create branch**.

**Çalışırken:**
- Sadece **kendi OWASP kategorilerinden** challenge çöz ([README'deki Ekip tablosu](ReadMeTr.md#ekip)).
- Bir açık bulduğunda **hemen ekran görüntüsü al.** Juice Shop yeniden başlayınca her şey sıfırlanır.

**Bitirirken:**
1. İlerlemeni kaydet (komut penceresinde):
   ```
   python scripts/progress.py save Elif
   ```
   (kendi ismini yaz; `python` bulunamadı derse `py scripts/progress.py save Elif` dene)
2. Bulgu yazdıysan → [4. adım](#4-bulgu-ekleme-ve-pull-request). Yazmadıysan sadece commit + push + PR yap (4.3'ten itibaren).

---

## 4. Bulgu ekleme ve Pull Request

### 4.1 Bulgu dosyasını oluştur
1. `findings/_TEMPLATE.md` dosyasını kopyala.
2. `findings/juice-shop/` içine yapıştır ve yeniden adlandır:
   ```
   JS-A01-001-basket-idor.md
   │  │   │   └─ kısa açıklama: küçük harf, boşluk yerine tire
   │  │   └──── 3 haneli sıra no (kategoride kaçıncı bulgu: 001, 002 ...)
   │  └──────── OWASP kategorisi (A01 ... A10)
   └─────────── JS = Juice Shop, PS = PortSwigger
   ```
   Sıra numarası için klasöre bak, o kategorideki son numaranın bir fazlasını ver.
3. Dosyayı aç, `---` arasındaki alanları doldur (her alanın yanında açıklaması var), sonra alttaki bölümleri yaz.
4. **Bulgular İngilizce yazılır** (makale İngilizce). AI'dan yardım alabilirsin → [6. AI ile çalışma](#6-ai-ile-çalışma).

### 4.2 Ekran görüntülerini ekle
1. Görüntüleri `evidence/juice-shop/` klasörüne koy.
2. İsimleri: `JS-A01-001-1.png`, `JS-A01-001-2.png` … (bulgu ID'si + tire + sıra).
3. Bulgu dosyasındaki `evidence:` listesine ve **Evidence** bölümüne bu yolları yaz.

### 4.3 Kontrol et
```
python scripts/validate.py
```
- `Kontrol gecti.` → devam.
- `[HATA]` satırları çıktıysa her birini düzelt, tekrar çalıştır. Hata mesajı neyin yanlış olduğunu ve nasıl düzeltileceğini söyler.

### 4.4 Commit ve push
1. GitHub Desktop'a dön. Solda değişen dosyalar listelenir — sadece kendi dosyaların olduğundan emin ol.
2. Sol altta **Summary** kutusuna kısa açıklama yaz: `Add JS-A01-001 basket IDOR`
3. **Commit to elif/js-a01-basket** → sonra üstteki **Publish branch** (veya **Push origin**).

### 4.5 Pull Request aç
1. GitHub Desktop'ta **Create Pull Request** butonuna bas → tarayıcı açılır.
2. Açılan formdaki kontrol listesini işaretle → **Create pull request**.
3. Birkaç saniye içinde otomatik kontrol çalışır:
   - ✅ yeşil → bir arkadaşından review iste (sağda **Reviewers**).
   - ❌ kırmızı → **Details**'e tıkla, hangi dosyada ne yanlış yazıyor. Düzelt, 4.3–4.4'ü tekrarla (aynı dalda), PR kendiliğinden güncellenir.
4. ✅ + onay gelince **Merge pull request** → **Delete branch**. Bitti!

---

## 5. Arkadaşının PR'ını onaylama (review)

Bir bulguyu onaylamak = **kendi Juice Shop'unda tekrar edip aynı sonucu aldığını doğrulamak.**
1. GitHub'da PR'ı aç → **Files changed** sekmesinden bulgu dosyasını oku.
2. **Steps to reproduce** adımlarını kendi Juice Shop'unda uygula.
3. Sonuç:
   - Çalıştı → sağ üstte **Review changes → Approve → Submit review**.
   - Çalışmadı / anlaşılmıyor → **Review changes → Request changes**, neyin çalışmadığını yaz.
4. Satıra yorum yazmak için satır numarasının yanındaki **+** işaretine bas.

---

## 6. AI ile çalışma

Bulguyu İngilizce yazarken, bir kavramı anlamaya çalışırken veya bir hatayı çözerken AI kullanabilirsin.
Repoda AI için hazırlanmış kurallar dosyası var: **[AGENTS.md](AGENTS.md)**. Dosya adı kuralları, zorunlu alanlar,
yazım stili ve yasaklar orada; AI bunu okuyunca doğru formatta yazar.

**Nasıl kullanılır:**
- **ChatGPT / Claude / Gemini (web sohbet):** sohbetin başında `AGENTS.md` ve `findings/_TEMPLATE.md` dosyalarını ekle
  (sürükle-bırak), sonra ne yaptığını anlat: hangi sayfada ne denedin, hangi isteği gönderdin, ne sonuç aldın.
  Ekran görüntülerini de ekleyebilirsin.
- **Cursor / Copilot / Claude Code / Codex (kod editörü):** repo klasörünü açman yeterli, `AGENTS.md`'yi kendileri okur.

Örnek istek:
> AGENTS.md kurallarına göre JS-A01-001 bulgusunu yaz. Juice Shop'ta giriş yaptıktan sonra DevTools → Network'te
> `GET /rest/basket/6` isteğini gördüm, 6'yı 1 yapıp tekrar gönderince başka kullanıcının sepeti geldi. Ekran görüntüleri ekte.

**Kurallar:**
- ⚠️ **AI bulgu uyduramaz.** Adımlar, istekler, sonuçlar ve ekran görüntüleri **senin gerçekten yaptığın** şeyler olmalı.
  AI sadece yazıyı düzenler, formatlar, çevirir, açıklar.
- AI'ın yazdığını **oku ve anla** — sunumda hoca sorarsa sen açıklayacaksın.
- AI'ın verdiği kaynak linklerini tıklayıp kontrol et; AI bazen var olmayan link uydurur.
- Sonunda yine `python scripts/validate.py` çalıştır.
- AI'dan yardım aldığımızı makalede kısaca belirteceğiz, saklanacak bir şey değil.

---

## Sık karşılaşılan sorunlar

| Sorun | Çözüm |
|---|---|
| `python` komutu bulunamadı | `py` yazmayı dene. O da olmazsa Python'u "Add to PATH" işaretli tekrar kur. |
| `docker` komutu bulunamadı / "cannot connect" | Docker Desktop açık değil. Aç, "Engine running" olana kadar bekle. |
| http://127.0.0.1:3000 açılmıyor | Komut penceresinde `docker compose up -d` çalıştır, 30 sn bekle. |
| Juice Shop'taki ilerlemem gitti | Normal, yeniden başlayınca sıfırlanır. `python scripts/progress.py load Elif` ile geri yükle. |
| Push'ta "protected branch" hatası | `main` dalındasın. **Current branch → New branch** ile dal aç, tekrar push'la. |
| GitHub Desktop "conflict" diyor | Aynı dosyayı iki kişi değiştirmiş. Dokunma, Alper'e yaz. (Herkes sadece kendi dosyalarını değiştirirse olmaz.) |
| PR'da ❌ var | **Details**'e bak. Lokalde `python scripts/validate.py` aynı hatayı gösterir. |
| Yanlış dosyayı commit'ledim | Henüz push'lamadıysan: GitHub Desktop → **History** → commit'e sağ tık → **Undo commit**. Push'ladıysan Alper'e yaz. |

## Altın kurallar
- ✋ Sadece **kendi dosyalarını** değiştir (kendi bulguların + `progress/<isim>.json`).
- 🧪 Test sadece **kendi bilgisayarındaki Juice Shop'ta** ve PortSwigger lablarında. Başka hiçbir siteye deneme yapma ([docs/ethics.md](docs/ethics.md)).
- ✍️ Bulgular **İngilizce** ve özgün olmalı; internetten çözüm kopyalama. AI yazıya yardım eder, bulguyu uyduramaz.
- 📸 Bulduğun an ekran görüntüsü al.
