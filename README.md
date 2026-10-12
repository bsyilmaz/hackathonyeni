# AI Kadrom

Bilgisayarında sesli konuştuğun, maskotlu kişisel asistan ekibi. Beyin: DeepSeek API. Kulak, hafıza ve yönlendirme: bilgisayarında çalışan ücretsiz yerel modeller.

## Başlatma
`AI Kadrom.command` dosyasına çift tıkla (ya da terminalde `npm start`). İlk açılışta ⚙️ ayarlardan **DeepSeek API anahtarını** gir.

- **Konuşmak:** Boşluk tuşuna (veya mor mikrofona) basılı tut, konuş, bırak.
- **Belirli birine:** "Kerem, …" diye başla ya da maskotuna tıkla.
- **Susturmak:** "dur" de ya da Esc.
- **Yazarak:** sol alttaki klavye simgesi. **Altyazı:** yanındaki simge.
- Pencereyi kapatınca arka planda çalışır (hatırlatmalar için). Tamamen çıkmak: `Cmd+Q`.

## Ekip
| Ajan | Neler yapar |
|---|---|
| **Defne** | Şef. Sözünü sadece ilgili kişiye iletir; genel sohbet, "bugün neler var" |
| **Mert** | X, Threads, Bluesky, LinkedIn, Instagram gönderisi/flood hazırlar, planlar; fikir/taslak bankası, içerik takvimi, tarz rehberi |
| **Zeynep** | Ders programı (takvime işlenir), ödev, sınav, not/ortalama/hedef hesabı, devamsızlık, çalışma kronometresi, sınava çalışma planı, haftalık rapor |
| **Kerem** | `keremcodeworld` içinde projeler: açar/siler/içe aktarır, kod yazar, komut çalıştırır, dev sunucusu açar, siteyi test eder, git |
| **Elif** | Takvim (tekrarlı, erteleme, çakışma, boş zaman), hatırlatma/erteleme, Google Takvim bağlama, .ics dışa aktarma |
| **Cem** | Görevler (alt görev, tekrar, erteleme sayacı), listeler, alışkanlık serileri, doğum günleri, ödemeler, kaçırılanlar, sabah brifingi ve akşam kontrolü |

## API verimliliği
- **Çoğu söz DeepSeek'e hiç gitmeden yönlendirilir:** "dur, evet, sıradaki, teşekkürler, selam" yerel; isimle hitap yerel; geri kalanı ajanların örnek cümleleriyle yerel anlam modeli eşleştirir. Sadece belirsiz/çok konulu sözler için küçük bir yönlendirme çağrısı yapılır.
- **Önbellek:** Her ajanın sistem talimatı ve araçları her çağrıda birebir aynıdır; DeepSeek bu kısmı ~10 kat ucuz sayar. Ayarlarda önbellek isabet oranını görürsün.
- **Hafıza seçici:** İsteğe tüm hafıza değil, yerel modelin bulduğu en ilgili ≤6 kayıt eklenir.
- **Hatırlatmalar API kullanmaz** (ajanların kendi kalıp cümleleri). Boş günde brifing de API'siz.
- Ayarlarda **bu ayın maliyeti** (ajan bazında) ve **aylık bütçe sınırı** var.

## Üretkenlik özellikleri
- **Öğrenen yönlendirme:** Yanlış kişiye gittiyse "hayır bunu Zeynep'e sor" de. İstek doğru kişiye gider ve Defne bunu öğrenir. DeepSeek'e sorulan yönlendirmeler de öğrenilir, zamanla neredeyse hiç API'ye sorulmaz.
- **Ajanlar birbirine iş verir:** Örneğin Kerem bir özelliği bitirince Mert'e tweet taslağı işi verir. Bir turda en fazla 3 görev, 2 kademe derinlik.
- **İnternette araştırma:** Kerem, Mert, Zeynep ve Defne arama yapıp sayfa okuyabilir. Sayfa bilgisayarda sadeleştirilir, DeepSeek'e sadece ilgili kısımlar gider. Yerel ağa erişim yok.
- **Belgeler:** Dosyayı pencereye sürükle ya da sol alttaki belge butonuna bas. PDF, ekran görüntüsü (Türkçe yazı tanıma), Word ve metin dosyaları bilgisayarında okunur. Sonra "kime vereyim?" diye sorulur.
- **Zeynep, sözlü sınav:** "Bu nottan soru kartı çıkar", sonra "beni fizikten sına". Aralıklı tekrar (SM-2) kullanır. Her akşam tekrar zamanı gelen kartları hatırlatır.
- **Elif, haftamı planla:** Görev, ödev ve sınav hazırlıklarını son tarihten önceki boş saatlere yerleştirir. Önce taslağı söyler, onaylarsan takvime yazar. **Odak modu:** "45 dakika odaklanacağım". Hatırlatmalar sona saklanır.
- **Kerem:** Büyük işlerde önce plan kartı sunar (düzenleyebilirsin). Her projede `KEREM.md` proje notu tutar. Dev sunucusunda hata çıkınca "Kerem baksın mı?" diye bildirir.
- **Mert, görsel:** Alıntı, duyuru, liste ya da "bu hafta" görseli üretir (kare, dikey, yatay). Görsel panoya kopyalanır, paylaşım ekranında ⌘V ile eklersin.
- **Cem, not kutusu:** "Aklıma geldi: …" diye söylediklerin API'siz not kutusuna gider. Pazar akşamı ayıklamayı teklif eder.
- **Defne, günün tek işi:** Sabah brifinginden sonra sorar, duvara yapışkan not olarak asar. Tıklayınca yapıldı olur.

## Hafıza
- Her ajanın **kendi** hafızası vardır, diğerleri göremez.
- **Ortak** hafızada sadece seninle ilgili temel bilgiler durur (sadece Cem ve Defne yazabilir).
- Bir ajan diğerinin işine yarayacak bir şey öğrenirse **sadece ona** iletir.
- **Hiçbir konuşma silinmez.** Hepsi arşivlenir ve anlamca aranır: "geçen hafta Elif'e ne demiştim" sorusu çalışır.

## Ses
- Sesler varsayılan olarak **bilgisayarında** üretilir: Supertonic-3 (ücretsiz, internetsiz, ~170 MB disk, 10 ses, her ajana ayrı). Hata olursa Microsoft Edge seslerine, internet de yoksa Mac'in kendi sesine düşer. Ayarlar > Sesler'den motor ve ses değiştirilebilir.
- Kulak (Whisper) ve yerel ses ayrı bir süreçte çalışır; 10 dakika kullanılmazsa kapanıp belleği geri verir, mikrofona basınca ~1 saniyede yeniden açılır.

## Güvenlik
- Her şey bu klasörde (`data/`) durur. Konuşma tanıma ve hafıza araması bilgisayarında çalışır.
- **Kerem** sadece `keremcodeworld` içinde dosya oluşturur/siler. Sildikleri `.kerem-cop` çöpünde 30 gün durur.
  Komutları macOS güvenlik kilidinde (sandbox) çalışır: bu klasör dışına yazamaz/silemez, Masaüstü/Belgeler/SSH anahtarlarını okuyamaz.
  `sudo`, `rm`, global kurulum, sistem ayarı gibi komutlar baştan reddedilir. `.env` dosyalarını okuyamaz.
  **GitHub'a gönderme ve canlıya alma her zaman onay kartıyla** olur (sesle sadece açıkça "onaylıyorum" denirse).
- **Mert** hiçbir şeyi kendiliğinden paylaşmaz: onaylarsın → paylaşım ekranı metin dolu açılır → Gönder'e sen basarsın. API/bot yok, hesabın risk almaz.
- DeepSeek anahtarı macOS Anahtar Zinciri ile şifrelenir. Veriler her gün `data/yedek` altına yedeklenir (14 gün).

## Kurulum ipuçları
- **Sosyal hesaplar:** Ayarlar → "X girişi" vb. ile bir kez giriş yap.
- **Google Takvim:** Google Takvim → Ayarlar → takvimin → "iCal biçimindeki gizli adres"i kopyala, Elif'e klavyeden "şu takvimi bağla: <adres>" yaz.
- **Mevcut bir projeyi Kerem'e vermek:** "Kerem, masaüstündeki X klasöründeki projeyi al". Kopyalar, aslına dokunmaz.

## Yeni ajan eklemek
`agents/` klasörüne yeni bir JSON koy (mevcut birini kopyala) ve uygulamayı yeniden başlat:
`id`, `name`, `rol`, `persona`, `ses`, `gorunum` (maskot), `araclar`, `ornekler` (yerel yönlendirme için 8-12 örnek cümle),
`anahtarlar`, `lakaplar`, `hatirlatmaKalibi`. Defne yeni ajanı otomatik tanır.

## Geliştirici
- `npm test`: arka plan testleri (sahte DeepSeek ve sahte gömme modeliyle, 42 test)
- `AIKADRO_OZTEST=1 npm start`: ses üret → konuşma tanıma → yerel yönlendirme uçtan uca kendini testi
- `AIKADRO_OZTEST=2 npm start`: ek olarak görsel üretimi ve web araması (`AIKADRO_OZTEST_BELGE=dosya` ile belge okuma)
