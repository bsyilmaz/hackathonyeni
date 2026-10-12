import { maskotSVG } from './maskot.js';
import * as B from './bilesenler.js';

// Electron dışında (tarayıcıda önizleme) sahte köprü kullanılır.
const tarayiciOnizleme = !window.kadroApi;
const api = window.kadroApi || (await import('./sahte.js')).sahteApi();
const ILK_DEMO_KOMUTU = 'Bu uygulamayı cuma günü tanıtacağım. İngilizce LinkedIn paylaşımı, tanıtım görseli ve lansman planı hazırla.';
const REVIZYON_DEMO_KOMUTU = 'Lansmanı pazartesiye taşı, metni daha profesyonel yap, görsel aynı kalsın.';

const $ = (s) => document.querySelector(s);
const durum = {
  ajanlar: [],
  temelAjanlar: [],
  el: new Map(), // ajanId -> { kok, agiz }
  kuyruk: [],
  caliyor: false,
  aktif: null, // { durdur() }
  kayit: false,
  basiliTut: false,
  hedef: null,
  ayarlar: null,
  altyazi: false,
  atlananTurlar: new Set(), // kullanıcının araya girdiği konuşma turları (kalan cümleleri atlanır)
  calanTur: null,
};

B.kur({ api, ajanlar: () => durum.ajanlar, maskotEl: (id) => durum.el.get(id)?.kok });

// ---------------- Sahne ----------------
function sahneSirasi(ajanlar) {
  const sef = ajanlar.find((a) => a.yonlendirici);
  const digerleri = ajanlar.filter((a) => a !== sef);
  const sol = digerleri.filter((_, i) => i % 2 === 0);
  const sag = digerleri.filter((_, i) => i % 2 === 1);
  return [...sol.reverse(), ...(sef ? [sef] : []), ...sag];
}

function ciz() {
  const kadro = $('#kadro');
  kadro.innerHTML = '';
  durum.el.clear();
  sahneSirasi(durum.ajanlar).forEach((a, i) => {
    const kok = document.createElement('div');
    kok.className = 'maskot' + (a.yonlendirici ? ' sef' : '');
    kok.dataset.id = a.id;
    kok.style.setProperty('--renk', a.renk);
    kok.style.setProperty('--gecikme', `${-i * 0.7}s`);
    kok.title = `${a.name}: ${a.rol}\nTıkla, sıradaki sözün doğrudan ${a.name}'e gitsin.`;
    kok.innerHTML = `${maskotSVG(a.gorunum)}<div class="baloncuk"><i></i><i></i><i></i></div>`;
    const isim = document.createElement('div');
    isim.className = 'isim';
    isim.textContent = a.name;
    kok.appendChild(isim);
    kok.addEventListener('click', () => hedefSec(a.id));
    kadro.appendChild(kok);
    durum.el.set(a.id, { kok, agiz: kok.querySelector('.agiz-acik'), bebek: kok.querySelector('.goz-bebek') });
  });
}

// ---------------- Tarayıcı demosu: kişisel kadro ----------------
const WEB_KADRO_ANAHTARI = 'ai-kadrom.web-kadro.v1';
const OZEL_GORUNUMLER = [
  { ten: '#d9a77f', sac: '#251b18', sacStili: 'uzun', kiyafet: '#2f6f68', aksesuar: 'gozluk', vurgu: '#ffc43d' },
  { ten: '#f0c39d', sac: '#3b2419', sacStili: 'kisa', kiyafet: '#a8323e', aksesuar: 'kulaklik', vurgu: '#9fd3c7' },
  { ten: '#c98f68', sac: '#17120f', sacStili: 'bere', kiyafet: '#31558a', aksesuar: '', vurgu: '#e6a93d' },
];
let webKadroTaslagi = null;

function webKadroBos() {
  return { pasif: [], ozeller: [] };
}

function webKadroOku() {
  try {
    const veri = JSON.parse(localStorage.getItem(WEB_KADRO_ANAHTARI) || 'null');
    if (!veri || !Array.isArray(veri.pasif) || !Array.isArray(veri.ozeller)) return webKadroBos();
    return {
      pasif: veri.pasif.filter((id) => typeof id === 'string'),
      ozeller: veri.ozeller
        .filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.rol === 'string')
        .slice(0, 3)
        .map((a) => ({
          id: a.id,
          name: a.name.slice(0, 32),
          rol: a.rol.slice(0, 100),
          skills: Array.isArray(a.skills) ? a.skills.filter((s) => typeof s === 'string').map((s) => s.slice(0, 80)).slice(0, 12) : [],
        })),
    };
  } catch {
    return webKadroBos();
  }
}

function ozelAjaniHazirla(a, sira) {
  const gorunum = OZEL_GORUNUMLER[sira % OZEL_GORUNUMLER.length];
  const skills = a.skills.length ? a.skills : ['Genel destek'];
  return {
    ...a,
    ozel: true,
    renk: gorunum.kiyafet,
    gorunum,
    ses: { ad: 'tr-TR-AhmetNeural', hiz: '+0%', perde: '+0Hz', yerel: 5 },
    rol: `${a.rol} Skill'ler: ${skills.join(', ')}.`,
    skills,
    yonlendirici: false,
  };
}

function webKadroyuUygula(ayar = webKadroOku()) {
  if (!tarayiciOnizleme) return;
  const pasif = new Set(ayar.pasif);
  durum.ajanlar = [
    ...durum.temelAjanlar.filter((a) => !pasif.has(a.id)),
    ...ayar.ozeller.filter((a) => !pasif.has(a.id)).map(ozelAjaniHazirla),
  ];
  durum.hedef = durum.ajanlar.some((a) => a.id === durum.hedef) ? durum.hedef : null;
  ciz();
  gozKirp();
}

function kadroEditorDurumu(metin, hata = false) {
  const alan = $('#kadroEditorDurum');
  alan.textContent = metin;
  alan.classList.toggle('hata', hata);
}

function kadroEditorListeleriniCiz() {
  const hazirListe = $('#hazirAjanListesi');
  const ozelListe = $('#ozelAjanListesi');
  hazirListe.replaceChildren();
  ozelListe.replaceChildren();
  const pasif = new Set(webKadroTaslagi.pasif);

  for (const ajan of durum.temelAjanlar) {
    const satir = document.createElement('label');
    satir.className = `kadro-editor-satiri${pasif.has(ajan.id) ? ' pasif' : ''}`;
    const secim = document.createElement('input');
    secim.type = 'checkbox';
    secim.checked = !pasif.has(ajan.id);
    secim.dataset.ajan = ajan.id;
    secim.addEventListener('change', () => {
      const kume = new Set(webKadroTaslagi.pasif);
      if (secim.checked) kume.delete(ajan.id);
      else kume.add(ajan.id);
      webKadroTaslagi.pasif = [...kume];
      satir.classList.toggle('pasif', !secim.checked);
    });
    const bilgi = document.createElement('span');
    const ad = document.createElement('strong');
    ad.textContent = ajan.name;
    const rol = document.createElement('small');
    rol.textContent = ajan.rol;
    bilgi.append(ad, rol);
    const durumMetni = document.createElement('span');
    durumMetni.className = 'kadro-editor-durum';
    durumMetni.textContent = secim.checked ? 'Sahnede' : 'Pasif';
    secim.addEventListener('change', () => (durumMetni.textContent = secim.checked ? 'Sahnede' : 'Pasif'));
    satir.append(secim, bilgi, durumMetni);
    hazirListe.append(satir);
  }

  for (const ajan of webKadroTaslagi.ozeller) {
    const satir = document.createElement('div');
    satir.className = 'kadro-editor-satiri';
    const bilgi = document.createElement('span');
    const ad = document.createElement('strong');
    ad.textContent = ajan.name;
    const rol = document.createElement('small');
    rol.textContent = `${ajan.rol} · ${ajan.skills.join(', ') || 'Skill etiketi yok'}`;
    bilgi.append(ad, rol);
    const sil = document.createElement('button');
    sil.type = 'button';
    sil.className = 'kadro-editor-buton tehlike';
    sil.textContent = 'Kaldır';
    sil.setAttribute('aria-label', `${ajan.name} karakterini kaldır`);
    sil.onclick = () => {
      webKadroTaslagi.ozeller = webKadroTaslagi.ozeller.filter((a) => a.id !== ajan.id);
      kadroEditorListeleriniCiz();
      kadroEditorDurumu(`${ajan.name} taslaktan kaldırıldı. Kaydedince sahne güncellenecek.`);
    };
    satir.append(bilgi, sil);
    ozelListe.append(satir);
  }

  if (!webKadroTaslagi.ozeller.length) {
    const bos = document.createElement('p');
    bos.textContent = 'Henüz özel karakter eklenmedi.';
    ozelListe.append(bos);
  }
}

function kadroEditorAc() {
  webKadroTaslagi = structuredClone(webKadroOku());
  kadroEditorListeleriniCiz();
  kadroEditorDurumu('Skill alanları bu demoda yalnızca güvenli metin etiketleridir; harici kod çalıştırılmaz.');
  $('#kadroEditor').hidden = false;
  $('#ozelAjanAdi').focus();
}

function kadroEditorKapat() {
  $('#kadroEditor').hidden = true;
  webKadroTaslagi = null;
  $('#ayarBtn').focus();
}

function yeniOzelAjanEkle() {
  if (webKadroTaslagi.ozeller.length >= 3) {
    kadroEditorDurumu('Web demosunda en fazla 3 özel karakter eklenebilir.', true);
    return;
  }
  const name = $('#ozelAjanAdi').value.trim();
  const rol = $('#ozelAjanRolu').value.trim();
  const hazirSkills = [...document.querySelectorAll('input[name="ozelSkill"]:checked')].map((e) => e.value);
  const ozelSkills = $('#ozelSkillMetni').value
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
  const skills = [...new Set([...hazirSkills, ...ozelSkills])].slice(0, 12);
  if (!name || !rol || !skills.length) {
    kadroEditorDurumu('Ad, rol ve en az bir skill etiketi gerekli.', true);
    return;
  }
  const kimlik = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  webKadroTaslagi.ozeller.push({ id: `ozel-${kimlik}`, name: name.slice(0, 32), rol: rol.slice(0, 100), skills });
  $('#ozelAjanAdi').value = '';
  $('#ozelAjanRolu').value = '';
  $('#ozelSkillMetni').value = '';
  document.querySelectorAll('input[name="ozelSkill"]').forEach((e) => (e.checked = false));
  kadroEditorListeleriniCiz();
  kadroEditorDurumu(`${name} taslağa eklendi. Kaydettiğinde sahnede görünecek.`);
}

function hedefSec(id) {
  durum.hedef = durum.hedef === id ? null : id;
  for (const [aid, e] of durum.el) e.kok.classList.toggle('secili', aid === durum.hedef);
  const a = durum.ajanlar.find((x) => x.id === durum.hedef);
  ipucu(a ? `Sıradaki sözün ${a.name}'e gidecek` : 'Boşluk tuşuna basılı tut ve konuş');
}

let gozKirpSurumu = 0;
function gozKirp() {
  const surum = ++gozKirpSurumu;
  for (const { kok } of durum.el.values()) {
    const kirp = () => {
      if (surum !== gozKirpSurumu || !kok.isConnected) return;
      kok.classList.add('kirp');
      setTimeout(() => kok.classList.remove('kirp'), 140);
      setTimeout(kirp, 2200 + Math.random() * 4500);
    };
    setTimeout(kirp, Math.random() * 3000);
  }
}

// Gözler fareyi takip etsin.
window.addEventListener('mousemove', (e) => {
  for (const { kok, bebek } of durum.el.values()) {
    const r = kok.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height * 0.4);
    const u = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, u / 400) * 3.2;
    bebek.style.transform = `translate(${(dx / u) * k}px, ${(dy / u) * k}px)`;
  }
});

function dusunuyor(id, acik) {
  durum.el.get(id)?.kok.classList.toggle('dusunuyor', acik);
}

const bitirZamanlari = new Map();
function konusmaBasla(id, metin, devam) {
  const e = durum.el.get(id);
  if (!e) return;
  clearTimeout(bitirZamanlari.get(id));
  dusunuyor(id, false);
  B.cipKapat(id);
  for (const [aid, x] of durum.el) if (aid !== id) x.kok.classList.remove('konusuyor');
  e.kok.classList.add('konusuyor');
  $('#kadro').classList.add('biri-konusuyor');
  const isik = $('#isik');
  const r = e.kok.getBoundingClientRect();
  isik.style.left = `${r.left + r.width / 2}px`;
  isik.style.setProperty('--isik-renk', e.kok.style.getPropertyValue('--renk') + '66');
  isik.classList.add('acik');
  if (durum.altyazi) B.konusmaBalonu(id, metin, devam);
}

// Aynı ajanın bir sonraki cümlesi hemen gelecekse animasyonu kesme (akışta cümleler ardışık gelir).
function konusmaBitir(id) {
  const e = durum.el.get(id);
  if (!e) return;
  e.agiz.style.transform = '';
  clearTimeout(bitirZamanlari.get(id));
  bitirZamanlari.set(
    id,
    setTimeout(() => {
      if (durum.caliyor && durum.suAnKonusan === id) return;
      e.kok.classList.remove('konusuyor');
      if (!durum.caliyor && !durum.kuyruk.length) {
        $('#kadro').classList.remove('biri-konusuyor');
        $('#isik').classList.remove('acik');
        B.balonKapat();
      }
    }, 700)
  );
}

// ---------------- Ses çalma + dudak hareketi ----------------
let sesBaglami = null;
function baglam() {
  if (!sesBaglami) sesBaglami = new AudioContext();
  if (sesBaglami.state === 'suspended') sesBaglami.resume();
  return sesBaglami;
}

function agizAc(id, deger) {
  const e = durum.el.get(id);
  if (e) e.agiz.style.transform = `scale(${0.9 + deger * 0.25}, ${Math.max(0.12, Math.min(1.25, deger))})`;
}

async function mp3Cal(id, bayt) {
  const c = baglam();
  const tampon = await c.decodeAudioData(bayt.buffer.slice(bayt.byteOffset, bayt.byteOffset + bayt.byteLength));
  const kaynak = c.createBufferSource();
  kaynak.buffer = tampon;
  const analiz = c.createAnalyser();
  analiz.fftSize = 1024;
  kaynak.connect(analiz).connect(c.destination);
  const veri = new Float32Array(analiz.fftSize);
  let yumusak = 0;
  let bitti = false;
  return new Promise((resolve) => {
    const dongu = () => {
      if (bitti) return;
      analiz.getFloatTimeDomainData(veri);
      let t = 0;
      for (const v of veri) t += v * v;
      const rms = Math.sqrt(t / veri.length);
      yumusak = yumusak * 0.5 + Math.min(1.25, rms * 7) * 0.5;
      agizAc(id, yumusak);
      requestAnimationFrame(dongu);
    };
    const son = () => {
      if (bitti) return;
      bitti = true;
      durum.aktif = null;
      resolve();
    };
    kaynak.onended = son;
    durum.aktif = {
      durdur: () => {
        try {
          kaynak.stop();
        } catch {}
        son();
      },
    };
    kaynak.start();
    dongu();
  });
}

// İnternet yoksa Mac'in yerleşik Türkçe sesine düş.
function yerlesikSes(id, metin) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    const s = new SpeechSynthesisUtterance(metin);
    s.lang = 'tr-TR';
    const tr = speechSynthesis.getVoices().find((v) => v.lang.startsWith('tr'));
    if (tr) s.voice = tr;
    let t = 0;
    const zaman = setInterval(() => agizAc(id, 0.35 + Math.abs(Math.sin((t += 0.6))) * 0.7), 90);
    const son = () => {
      clearInterval(zaman);
      durum.aktif = null;
      resolve();
    };
    s.onend = son;
    s.onerror = son;
    durum.aktif = {
      durdur: () => {
        speechSynthesis.cancel();
        son();
      },
    };
    speechSynthesis.speak(s);
  });
}

function sirayaKoy(id, metin, ses, tur = null) {
  if (tur != null && durum.atlananTurlar.has(tur)) return;
  durum.kuyruk.push({ id, metin, ses, tur });
  kuyruguIsle();
}

let oncekiKonusan = null;
async function kuyruguIsle() {
  if (durum.caliyor) return;
  const s = durum.kuyruk.shift();
  if (!s) return;
  durum.caliyor = true;
  durum.suAnKonusan = s.id;
  durum.calanTur = s.tur;
  konusmaBasla(s.id, s.metin, oncekiKonusan === s.id);
  oncekiKonusan = s.id;
  try {
    if (s.ses) await mp3Cal(s.id, s.ses);
    else await yerlesikSes(s.id, s.metin);
  } catch (e) {
    console.error(e);
  } finally {
    durum.caliyor = false;
    durum.suAnKonusan = null;
    konusmaBitir(s.id);
    kuyruguIsle();
  }
}

// Kullanıcı konuşmaya başlayınca: o anki turun kalan cümlelerini atla (ajan arka planda işini bitirir).
function sozuKes() {
  if (durum.calanTur != null) durum.atlananTurlar.add(durum.calanTur);
  for (const k of durum.kuyruk) if (k.tur != null) durum.atlananTurlar.add(k.tur);
  susdur();
}

function susdur() {
  durum.kuyruk.length = 0;
  durum.aktif?.durdur();
  oncekiKonusan = null;
}

// ---------------- Mikrofon ----------------
let akim = null;
let kaydedici = null;
let parcalar = [];
let kayitBaslangici = 0;
let seviyeDongusu = null;
let ornekleyici = null;
let tarayiciTaniyici = null;
let tarayiciKayitBildirildi = false;

function kayitGorunumunuKapat() {
  durum.kayit = false;
  $('#mikrofon').classList.remove('kayit', 'isleniyor');
  $('#kadro').classList.remove('dinliyor');
}

function yaziGirdisiniAc() {
  const form = $('#yaziFormu');
  form.hidden = false;
  $('#klavyeBtn').classList.add('aktif');
  document.body.classList.add('yazi-acik');
  $('#yaziGirdisi').focus();
}

function tarayiciKayitBasla() {
  const Taniyici = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Taniyici) {
    durum.basiliTut = false;
    yaziGirdisiniAc();
    ipucu('Bu tarayıcı ses tanımayı desteklemiyor; komutu yazarak gönderebilirsin');
    if (!tarayiciKayitBildirildi) {
      tarayiciKayitBildirildi = true;
      B.bildirim({ tur: 'bilgi', baslik: 'Ses girişi kullanılamıyor', metin: 'Klavye düğmesindeki hazır komutu Enter ile gönderebilirsin.', sure: 6500 });
    }
    return;
  }

  sozuKes();
  const taniyici = new Taniyici();
  tarayiciTaniyici = taniyici;
  let metin = '';
  let hata = null;
  let tamamlandi = false;
  taniyici.lang = 'tr-TR';
  taniyici.continuous = false;
  taniyici.interimResults = true;
  taniyici.maxAlternatives = 1;
  taniyici.onresult = (e) => {
    let gecici = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const parca = e.results[i][0]?.transcript || '';
      if (e.results[i].isFinal) metin += `${parca} `;
      else gecici += parca;
    }
    const duyulan = `${metin}${gecici}`.trim();
    if (duyulan) ipucu(`Duydum: ${duyulan}`);
  };
  taniyici.onerror = (e) => {
    hata = e.error;
  };
  taniyici.onend = () => {
    if (tamamlandi) return;
    tamamlandi = true;
    tarayiciTaniyici = null;
    kayitGorunumunuKapat();
    const sonuc = metin.trim();
    if (sonuc) {
      B.duyulanGoster(sonuc);
      gonder(sonuc);
      return;
    }
    if (hata === 'not-allowed' || hata === 'service-not-allowed') {
      B.bildirim({ tur: 'hata', baslik: 'Mikrofon izni yok', metin: 'Tarayıcının adres çubuğundan mikrofon izni verebilir ya da komutu yazabilirsin.', sure: 8000 });
    }
    ipucu('Ses anlaşılmadı; klavye düğmesindeki komutu deneyebilirsin');
  };

  durum.kayit = true;
  kayitBaslangici = Date.now();
  $('#mikrofon').classList.add('kayit');
  $('#kadro').classList.add('dinliyor');
  ipucu('Dinliyorum…');
  try {
    taniyici.start();
  } catch (e) {
    tarayiciTaniyici = null;
    kayitGorunumunuKapat();
    B.bildirim({ tur: 'hata', baslik: 'Ses girişi başlatılamadı', metin: e.message, sure: 6000 });
  }
}

async function kayitBasla() {
  if (durum.kayit) return;
  durum.basiliTut = true;
  baglam();
  if (tarayiciOnizleme) {
    tarayiciKayitBasla();
    return;
  }
  sozuKes();
  api.kulakHazirla?.(); // uykudaysa Whisper sen konuşurken açılsın
  try {
    if (!akim) akim = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    B.bildirim({ tur: 'hata', baslik: 'Mikrofon izni yok', metin: 'Sistem Ayarları > Gizlilik ve Güvenlik > Mikrofon kısmından AI Kadrom’a (Electron) izin ver.', sure: 9000 });
    return;
  }
  if (!durum.basiliTut) return; // izin beklerken bırakıldıysa
  parcalar = [];
  kaydedici = new MediaRecorder(akim);
  kaydedici.ondataavailable = (e) => e.data.size && parcalar.push(e.data);
  kaydedici.start();
  kayitBaslangici = Date.now();
  durum.kayit = true;
  $('#mikrofon').classList.add('kayit');
  $('#kadro').classList.add('dinliyor');
  ipucu('Dinliyorum…');
  seviyeGoster();
}

function seviyeGoster() {
  const c = baglam();
  const kaynak = c.createMediaStreamSource(akim);
  const analiz = c.createAnalyser();
  analiz.fftSize = 512;
  kaynak.connect(analiz);
  const veri = new Float32Array(analiz.fftSize);
  const dongu = () => {
    if (!durum.kayit) {
      kaynak.disconnect();
      return;
    }
    analiz.getFloatTimeDomainData(veri);
    let t = 0;
    for (const v of veri) t += v * v;
    $('#halka').style.setProperty('--seviye', String(1 + Math.min(0.5, Math.sqrt(t / veri.length) * 4)));
    seviyeDongusu = requestAnimationFrame(dongu);
  };
  dongu();
}

async function kayitBitir() {
  durum.basiliTut = false;
  if (!durum.kayit) return;
  if (tarayiciOnizleme) {
    try {
      tarayiciTaniyici?.stop();
    } catch {}
    return;
  }
  durum.kayit = false;
  cancelAnimationFrame(seviyeDongusu);
  $('#mikrofon').classList.remove('kayit');
  $('#kadro').classList.remove('dinliyor');
  const durdu = new Promise((r) => (kaydedici.onstop = r));
  kaydedici.stop();
  await durdu;
  if (Date.now() - kayitBaslangici < 400) {
    ipucu('Biraz daha uzun basılı tut');
    return;
  }
  $('#mikrofon').classList.add('isleniyor');
  ipucu('Anlamaya çalışıyorum…');
  try {
    const blob = new Blob(parcalar, { type: kaydedici.mimeType });
    if (!ornekleyici) ornekleyici = new AudioContext({ sampleRate: 16000 });
    const tampon = await ornekleyici.decodeAudioData(await blob.arrayBuffer());
    const metin = (await api.dinle(tampon.getChannelData(0))).trim();
    if (!metin) {
      ipucu('Duyamadım, tekrar dener misin?');
      return;
    }
    B.duyulanGoster(metin);
    gonder(metin);
  } catch (e) {
    B.bildirim({ tur: 'hata', baslik: 'Konuşma tanınamadı', metin: e.message });
  } finally {
    $('#mikrofon').classList.remove('isleniyor');
  }
}

function gonder(metin) {
  const a = durum.ajanlar.find((x) => x.id === durum.hedef);
  if (a) {
    metin = `${a.name}, ${metin}`;
    hedefSec(null);
  }
  ipucu(tarayiciOnizleme ? 'Ekip çalışıyor…' : 'Boşluk tuşuna basılı tut ve konuş');
  const ozelBaglam = tarayiciOnizleme && a?.ozel ? { ozelAjan: { id: a.id, name: a.name, rol: a.rol, skills: a.skills } } : undefined;
  api.konus(metin, ozelBaglam);
}

const yaziAlaniMi = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !yaziAlaniMi() && $('#ayarlar').hidden && $('#kadroEditor').hidden) {
    e.preventDefault();
    kayitBasla();
  }
  if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    B.komutPaleti(paletEylemleri());
    return;
  }
  if (e.key === 'Escape') {
    if (tarayiciOnizleme && !$('#kadroEditor').hidden) {
      kadroEditorKapat();
      return;
    }
    if (document.querySelector('.palet-arka')) return B.paletKapat();
    susdur();
    api.iptal?.();
    $('#yaziFormu').hidden = true;
    $('#klavyeBtn').classList.remove('aktif');
    document.body.classList.remove('yazi-acik');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && !yaziAlaniMi()) {
    e.preventDefault();
    kayitBitir();
  }
});
window.addEventListener('blur', () => kayitBitir());

const mik = $('#mikrofon');
mik.addEventListener('pointerdown', (e) => {
  mik.setPointerCapture(e.pointerId);
  kayitBasla();
});
mik.addEventListener('pointerup', () => kayitBitir());
mik.addEventListener('pointercancel', () => kayitBitir());

// ---------------- Küçük arayüz parçaları ----------------
function ipucu(m) {
  $('#ipucu').textContent = m;
}

let durumZamani = null;
function durumGoster(m, hata = false, sure = 6000) {
  const d = $('#durum');
  d.textContent = m;
  d.classList.toggle('hata', hata);
  d.hidden = false;
  clearTimeout(durumZamani);
  if (sure) durumZamani = setTimeout(() => (d.hidden = true), sure);
}

$('#klavyeBtn').onclick = () => {
  const f = $('#yaziFormu');
  f.hidden = !f.hidden;
  $('#klavyeBtn').classList.toggle('aktif', !f.hidden);
  document.body.classList.toggle('yazi-acik', !f.hidden);
  if (!f.hidden) $('#yaziGirdisi').focus();
};
$('#yaziFormu').onsubmit = (e) => {
  e.preventDefault();
  const g = $('#yaziGirdisi');
  const m = g.value.trim();
  if (!m) return;
  g.value = '';
  baglam();
  gonder(m);
};

$('#altyaziBtn').onclick = () => {
  durum.altyazi = !durum.altyazi;
  $('#altyaziBtn').classList.toggle('aktif', durum.altyazi);
  if (!durum.altyazi) B.balonKapat();
  B.bildirim({ tur: 'bilgi', baslik: durum.altyazi ? 'Konuşma balonları açık' : 'Konuşma balonları kapalı', sure: 1800 });
  api.ayarlariKaydet({ altyazi: durum.altyazi });
};

// ---------------- Ayarlar ----------------
const GIZLI = ['deepseekApiKey'];
const DUZ = ['sesMotoru', 'kullaniciAdi', 'deepseekModel', 'sabahBrifingi', 'aksamKontrolu', 'sessizBaslangic', 'sessizBitis', 'whisperModel', 'aylikButceUSD', 'fiyatOnbellekIsabet', 'fiyatOnbellekKacirma', 'fiyatCikti'];
const SAYISAL = new Set(['aylikButceUSD', 'fiyatOnbellekIsabet', 'fiyatOnbellekKacirma', 'fiyatCikti']);

// Bu ayın kullanımı: tek cümlelik özet + ajanların maliyet payı çubuğu.
function kullanimYaz(k) {
  const el = $('#kullanim');
  el.innerHTML = '';
  const ozet = document.createElement('p');
  ozet.className = 'kullanim-ozet';
  const tutar = document.createElement('b');
  tutar.textContent = `$${(k?.maliyetUSD || 0).toFixed(3)}`;
  ozet.append(tutar, document.createTextNode(` harcandı. ${k?.cagri || 0} API çağrısı, girdilerin %${Math.round((k?.onbellekOrani || 0) * 100)}'i önbellekten (ucuz) geldi.`));
  el.append(ozet);
  const renk = (id) => durum.ajanlar.find((a) => a.id === id)?.renk || '#cfc6b3';
  const ad = (id) => durum.ajanlar.find((a) => a.id === id)?.name || (id === 'yonlendirici' ? 'Yönlendirme' : id);
  const ajanlar = Object.entries(k?.ajanlar || {}).sort((a, b) => b[1].maliyetUSD - a[1].maliyetUSD);
  const toplam = ajanlar.reduce((t, [, a]) => t + a.maliyetUSD, 0);
  if (!ajanlar.length || !toplam) return;
  const cubuk = document.createElement('div');
  cubuk.className = 'pay-cubugu';
  const liste = document.createElement('ul');
  liste.className = 'pay-listesi';
  for (const [id, a] of ajanlar) {
    const pay = a.maliyetUSD / toplam;
    if (pay >= 0.01) {
      const i = document.createElement('i');
      i.style.width = `${pay * 100}%`;
      i.style.setProperty('--renk', renk(id));
      i.title = `${ad(id)}: $${a.maliyetUSD.toFixed(3)}`;
      cubuk.append(i);
    }
    const li = document.createElement('li');
    li.style.setProperty('--renk', renk(id));
    li.textContent = `${ad(id)} ${a.cagri} çağrı, $${a.maliyetUSD.toFixed(3)}`;
    liste.append(li);
  }
  el.append(cubuk, liste);
}

function ayarlariDoldur(a) {
  const f = $('#ayarFormu');
  for (const k of DUZ) f.elements[k].value = a[k] ?? '';
  for (const k of GIZLI) {
    f.elements[k].value = '';
    f.elements[k].placeholder = a.anahtarlar?.[k] ? 'Kayıtlı ✓ (değiştirmek için yaz)' : 'sk-...';
  }
  $('#kodDunyasi').textContent = a.kodDunyasi || '';
  kullanimYaz(a.kullanim);
  modelDurumuYaz(a.modeller);
  const sosyal = $('#sosyalHesaplar');
  sosyal.innerHTML = '';
  for (const p of a.sosyalPlatformlar || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${p.ad} girişi`;
    b.onclick = () => api.sosyalGiris(p.id);
    sosyal.appendChild(b);
  }
  sesListesiniCiz(a, a.sesMotoru || 'yerel');
  $('#sesMotoruSecimi').onchange = (e) => sesListesiniCiz(a, e.target.value);
}

// Seçili motora göre her ajan için ses seçici (yerel: 10 Supertonic sesi, edge: Microsoft sesleri).
function sesListesiniCiz(a, motor) {
  const liste = $('#sesListesi');
  liste.innerHTML = '';
  liste.dataset.motor = motor;
  for (const ajan of durum.ajanlar) {
    const satir = document.createElement('div');
    satir.className = 'ses-satiri';
    satir.style.setProperty('--renk', ajan.renk);
    const ad = document.createElement('b');
    ad.textContent = ajan.name;
    const sec = document.createElement('select');
    sec.dataset.ajan = ajan.id;
    if (motor === 'yerel') {
      const secili = String(a.sesler?.[ajan.id]?.yerel ?? ajan.ses.yerel ?? 0);
      for (const s of a.yerelSesler || []) sec.add(new Option(s.etiket, String(s.sid), false, String(s.sid) === secili));
    } else {
      const secili = a.sesler?.[ajan.id]?.ad || ajan.ses.ad;
      for (const s of a.onerilenSesler || []) sec.add(new Option(s.etiket, s.ad, false, s.ad === secili));
      if (![...sec.options].some((o) => o.value === secili)) sec.add(new Option(secili, secili, false, true));
    }
    const dinle = document.createElement('button');
    dinle.type = 'button';
    dinle.textContent = 'Dinle';
    dinle.onclick = async () => {
      dinle.disabled = true;
      try {
        const ses = await api.sesDene(ajan.id, motor === 'yerel' ? { yerel: Number(sec.value) } : { ad: sec.value }, motor);
        susdur();
        sirayaKoy(ajan.id, `Selam kanka, ben ${ajan.name}.`, ses);
      } finally {
        dinle.disabled = false;
      }
    };
    satir.append(ad, sec, dinle);
    liste.appendChild(satir);
  }
}

const MODEL_ADI = { whisper: 'Konuşma tanıma', gomme: 'Hafıza/yönlendirme modeli', ses: 'Yerel ses modeli' };
function modelDurumuYaz(modeller) {
  const el = $('#modelDurumu');
  const satir = (m) =>
    `${MODEL_ADI[m.model] || m.model}: ` +
    (m.durum === 'indiriliyor' ? `indiriliyor %${m.yuzde}` : m.durum === 'hazir' ? 'hazır' : m.durum === 'uykuda' ? 'uykuda (kullanınca açılır)' : m.durum === 'hata' ? 'hata: ' + m.hata : 'hazırlanıyor…');
  el.textContent = Object.values(modeller || {}).map(satir).join(' · ');
}

$('#ayarBtn').onclick = async () => {
  if (tarayiciOnizleme) {
    kadroEditorAc();
    return;
  }
  durum.ayarlar = await api.ayarlar();
  ayarlariDoldur(durum.ayarlar);
  $('#ayarlar').hidden = false;
};
$('#ayarKapat').onclick = () => ($('#ayarlar').hidden = true);
$('#ayarlar').addEventListener('click', (e) => {
  if (e.target.id === 'ayarlar') $('#ayarlar').hidden = true;
});
$('#kadroEditorKapat').onclick = kadroEditorKapat;
$('#kadroEditor').addEventListener('click', (e) => {
  if (e.target.id === 'kadroEditor') kadroEditorKapat();
});
$('#ozelAjanEkle').onclick = yeniOzelAjanEkle;
$('#kadroEditorSifirla').onclick = () => {
  webKadroTaslagi = webKadroBos();
  kadroEditorListeleriniCiz();
  kadroEditorDurumu('Varsayılan altı kişilik kadro taslağa geri alındı. Uygulamak için kaydet.');
};
$('#kadroEditorKaydet').onclick = () => {
  const etkinHazir = durum.temelAjanlar.filter((a) => !webKadroTaslagi.pasif.includes(a.id)).length;
  if (!etkinHazir && !webKadroTaslagi.ozeller.length) {
    kadroEditorDurumu('Sahnede en az bir karakter kalmalı.', true);
    return;
  }
  try {
    localStorage.setItem(WEB_KADRO_ANAHTARI, JSON.stringify(webKadroTaslagi));
  } catch {
    kadroEditorDurumu('Tarayıcı kadro tercihini kaydedemedi.', true);
    return;
  }
  webKadroyuUygula(webKadroTaslagi);
  kadroEditorKapat();
  B.bildirim({ tur: 'basari', baslik: 'Kadro güncellendi', metin: `${durum.ajanlar.length} karakter sahnede. Skill manifestleri yalnızca bu tarayıcıda saklanıyor.`, sure: 5000 });
};
$('#kodDunyasiSec').onclick = async () => {
  try {
    const yol = await api.kodDunyasiSec();
    if (yol) $('#kodDunyasi').textContent = yol;
  } catch (e) {
    B.bildirim({ tur: 'hata', baslik: 'Klasör değiştirilemedi', metin: String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
  }
};
document.querySelectorAll('[data-dis]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault();
    api.disAc?.(a.dataset.dis);
  })
);

$('#ayarFormu').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const d = {};
  for (const k of DUZ) d[k] = SAYISAL.has(k) ? Number(f.elements[k].value) || 0 : f.elements[k].value.trim();
  for (const k of GIZLI) if (f.elements[k].value.trim()) d[k] = f.elements[k].value.trim();
  // Diğer motorun seçimleri korunur, sadece görünen motorunki güncellenir.
  const motor = $('#sesListesi').dataset.motor;
  d.sesler = {};
  for (const s of document.querySelectorAll('#sesListesi select')) {
    const ajan = durum.ajanlar.find((a) => a.id === s.dataset.ajan);
    const onceki = durum.ayarlar?.sesler?.[ajan.id] || {};
    d.sesler[ajan.id] = { ...ajan.ses, ...onceki, ...(motor === 'yerel' ? { yerel: Number(s.value) } : { ad: s.value }) };
  }
  const anahtarYeni = !!d.deepseekApiKey && !durum.ayarlar?.anahtarlar?.deepseekApiKey;
  durum.ayarlar = await api.ayarlariKaydet(d);
  durum.ajanlar = await api.kadro();
  $('#ayarlar').hidden = true;
  B.bildirim({ tur: 'basari', baslik: 'Ayarlar kaydedildi', sure: 2500 });
  if (anahtarYeni) api.merhaba();
};

// ---------------- Ana süreçten gelen olaylar ----------------
function olayIsle(o) {
  switch (o.tip) {
    case 'soyle':
      sirayaKoy(o.ajan, o.metin, o.ses, o.tur);
      break;
    case 'dusunuyor':
      dusunuyor(o.ajan, true);
      break;
    case 'dusunme-bitti':
      dusunuyor(o.ajan, false);
      break;
    case 'bitti':
      for (const id of durum.el.keys()) dusunuyor(id, false);
      break;
    case 'sustur':
      susdur();
      for (const id of durum.el.keys()) dusunuyor(id, false);
      break;
    case 'arac':
      B.aktiviteCipi(o.ajan, o.arac);
      break;
    case 'arac-sonuc':
      B.aracSonucu(o);
      break;
    case 'onay':
      B.onayKarti(o);
      break;
    case 'onay-cozuldu':
      B.onayKaldir(o.id);
      break;
    case 'paylasim-devam':
      B.devamKarti(o);
      break;
    case 'hatirlatma':
      B.hatirlatmaKarti(o);
      break;
    case 'bildirim':
      // Ana süreçten gelen eylemli bildirim (ör. "Kerem baksın").
      B.bildirim({ ...o, butonlar: o.eylem ? [{ etiket: o.eylem.etiket, birincil: true, tikla: () => gonder(o.eylem.konus) }, { etiket: 'Yoksay' }] : [] });
      break;
    case 'belge-durum':
      if (o.durum === 'okunuyor') B.bildirim({ tur: 'bilgi', baslik: 'Belge okunuyor…', metin: o.ad, sure: 4000 });
      else if (o.durum === 'hazir') B.belgeKarti(o);
      else if (o.durum === 'hata') B.bildirim({ tur: 'hata', baslik: 'Belge okunamadı', metin: `${o.ad}: ${o.hata}`, sure: 9000 });
      break;
    case 'ogrendi': {
      const a = durum.ajanlar.find((x) => x.id === o.ajan);
      B.bildirim({ ajan: o.ajan, baslik: 'Öğrendim', metin: `Bu tür istekler artık doğrudan ${a?.name || o.ajan}'e gidecek.`, sure: 5000 });
      break;
    }
    case 'gorev-verildi': {
      const ajanBul = (id) => durum.ajanlar.find((x) => x.id === id) || durum.temelAjanlar.find((x) => x.id === id);
      const k = ajanBul(o.kimden);
      const h = ajanBul(o.kime);
      B.bildirim({ ajan: o.kime, baslik: 'Ekip içi görev', metin: `${k?.name || o.kimden || 'Ekip'} bir iş verdi, ${h?.name || o.kime || 'uzman'} sırada.`, sure: 4000 });
      dusunuyor(o.kime, true);
      break;
    }
    case 'odak':
      B.odakSayaci(o.bitis);
      break;
    case 'gunun-isi':
      B.gununIsiNotu(o, gununIsiTamamla);
      break;
    case 'gorsel':
      B.gorselBildirim(o);
      break;
    case 'lansman-paketi': {
      const paket = o.paket || o;
      if (typeof B.lansmanPaketiGoster === 'function') B.lansmanPaketiGoster(paket);
      else B.bildirim({ tur: 'basari', baslik: 'Lansman paketi hazır', metin: 'Paylaşım, görsel ve plan birlikte hazırlandı.', sure: 6000 });
      if (tarayiciOnizleme) {
        const girdi = $('#yaziGirdisi');
        yaziGirdisiniAc();
        if (paket.surum === 'v1' && !girdi.value.trim()) {
          girdi.value = REVIZYON_DEMO_KOMUTU;
          girdi.setSelectionRange(0, 0);
          ipucu('İkinci tur hazır: revizyonu göndermek için Enter’a bas');
        } else if (paket.surum === 'v2') {
          ipucu('Revizyon tamam: metin ve plan güncellendi, görsel korundu');
        }
      }
      break;
    }
    case 'model-durum': {
      durum.modeller = { ...(durum.modeller || {}), [o.model]: o };
      if (!$('#ayarlar').hidden) modelDurumuYaz(durum.modeller);
      const indirilen = Object.values(durum.modeller).filter((m) => m.durum === 'indiriliyor');
      if (indirilen.length) durumGoster(`Ekip hazırlanıyor (ilk açılışa özel): ${indirilen.map((m) => `${MODEL_ADI[m.model]} %${m.yuzde}`).join(', ')}`, false, 0);
      else if (o.durum === 'hata') B.bildirim({ tur: 'hata', baslik: `${MODEL_ADI[o.model]} yüklenemedi`, metin: o.hata, sure: 0 });
      else if (o.durum === 'hazir' && !Object.values(durum.modeller).some((m) => m.durum !== 'hazir')) $('#durum').hidden = true;
      break;
    }
  }
}

// ---------------- Belgeler: sürükle-bırak ve ataş butonu ----------------
async function belgeleriGonder(yollar) {
  const l = yollar.filter(Boolean);
  if (!l.length) return;
  await api.belgeEkle?.(l);
}

window.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('surukleniyor');
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('surukleniyor');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('surukleniyor');
  const yollar = [...(e.dataTransfer?.files || [])].map((f) => api.dosyaYolu?.(f));
  belgeleriGonder(yollar);
});
$('#belgeBtn').onclick = async () => belgeleriGonder((await api.belgeSec?.()) || []);

async function gununIsiTamamla(tamam) {
  const g = await api.gununIsiTamam?.(tamam);
  B.gununIsiNotu(g, gununIsiTamamla);
  if (g?.tamam) {
    B.sevinc(durum.ajanlar.find((a) => a.yonlendirici)?.id);
    B.bildirim({ tur: 'basari', baslik: 'Günün işi bitti!', metin: g.metin, sure: 4000 });
  }
}

// ⌘K paletindeki hazır eylemler.
function paletEylemleri() {
  const soz = (m) => () => {
    baglam();
    gonder(m);
  };
  return [
    { ad: 'Bugün neler var?', ajan: 'defne', yap: soz('bugün neler var'), anahtar: 'program gün' },
    { ad: 'Kaçırdığım bir şey var mı?', ajan: 'cem', yap: soz('Cem, kaçırdığım bir şey var mı'), anahtar: 'unut' },
    { ad: 'Yapılacaklarım', ajan: 'cem', yap: soz('Cem, yapılacaklarım neler'), anahtar: 'görev' },
    { ad: 'Bu haftanın takvimi', ajan: 'elif', yap: soz('Elif, bu hafta takvimimde neler var'), anahtar: 'takvim' },
    { ad: 'Ödev ve sınav durumum', ajan: 'zeynep', yap: soz('Zeynep, açık ödevlerim ve yaklaşan sınavlarım neler'), anahtar: 'ders' },
    { ad: 'İçerik takvimi', ajan: 'mert', yap: soz('Mert, içerik takvimimiz nasıl görünüyor'), anahtar: 'sosyal tweet' },
    { ad: 'Projelerim', ajan: 'kerem', yap: soz('Kerem, hangi projeler var ve en son ne yaptın'), anahtar: 'kod' },
    { ad: 'Haftamı planla', ajan: 'elif', yap: soz('Elif, haftamı planla'), anahtar: 'plan takvim' },
    { ad: '45 dakika odaklan', ajan: 'elif', yap: soz('Elif, 45 dakikalık odak modunu aç'), anahtar: 'odak pomodoro' },
    { ad: 'Beni sına (sözlü sınav)', ajan: 'zeynep', yap: soz('Zeynep, tekrar zamanı gelen kartlardan beni sına'), anahtar: 'kart sınav tekrar' },
    { ad: 'Not kutusunu ayıkla', ajan: 'cem', yap: soz('Cem, not kutumu ayıklayalım'), anahtar: 'not' },
    { ad: 'Ekibe belge ver', yap: () => $('#belgeBtn').click(), anahtar: 'pdf dosya belge' },
    { ad: 'Yazarak konuş', yap: () => $('#klavyeBtn').click(), kisayol: '' },
    { ad: durum.altyazi ? 'Konuşma balonlarını kapat' : 'Konuşma balonlarını aç', yap: () => $('#altyaziBtn').click(), anahtar: 'altyazı' },
    { ad: 'Herkesi sustur', yap: () => (susdur(), api.iptal?.()), kisayol: 'Esc' },
    { ad: 'Ayarlar ve kullanım', yap: () => $('#ayarBtn').click(), anahtar: 'maliyet bütçe' },
  ];
}

// Karşılama ekranı için kısa mikrofon testi: ~2.5 sn seviye ölçer.
async function mikrofonTesti(seviye) {
  try {
    if (!akim) akim = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  } catch {
    return false;
  }
  const c = baglam();
  const kaynak = c.createMediaStreamSource(akim);
  const analiz = c.createAnalyser();
  analiz.fftSize = 512;
  kaynak.connect(analiz);
  const veri = new Float32Array(analiz.fftSize);
  let enYuksek = 0;
  const bitis = Date.now() + 2500;
  await new Promise((r) => {
    const dongu = () => {
      analiz.getFloatTimeDomainData(veri);
      let t = 0;
      for (const v of veri) t += v * v;
      const rms = Math.sqrt(t / veri.length);
      enYuksek = Math.max(enYuksek, rms);
      seviye(rms);
      if (Date.now() < bitis) requestAnimationFrame(dongu);
      else r();
    };
    dongu();
  });
  kaynak.disconnect();
  seviye(0);
  return enYuksek > 0.01;
}

async function basla() {
  durum.temelAjanlar = await api.kadro();
  if (tarayiciOnizleme) webKadroyuUygula();
  else {
    durum.ajanlar = durum.temelAjanlar;
    ciz();
  }
  gozKirp();
  durum.ayarlar = await api.ayarlar();
  durum.altyazi = !!durum.ayarlar.altyazi;
  $('#altyaziBtn').classList.toggle('aktif', durum.altyazi);
  api.olay(olayIsle);
  if (tarayiciOnizleme) {
    const form = $('#yaziFormu');
    const girdi = $('#yaziGirdisi');
    form.hidden = false;
    $('#klavyeBtn').classList.add('aktif');
    document.body.classList.add('yazi-acik');
    girdi.value = ILK_DEMO_KOMUTU;
    girdi.placeholder = 'Ekibe bir hedef yaz…';
    girdi.setAttribute('aria-label', 'AI ekibine verilecek hedef');
    $('.kisayol-ipucu').textContent = 'WEB DEMOSU · örnek veriler kullanılır, hiçbir şey yayımlanmaz';
    ipucu('Hazır hedefi ekibe vermek için Enter’a bas');
    $('#ayarBtn').title = 'Kadronu düzenle';
    $('#ayarBtn').setAttribute('aria-label', 'Kadronu düzenle');
  }
  for (const k of await api.onaylar()) B.onayKarti(k);
  B.gununIsiNotu(await api.gununIsi?.(), gununIsiTamamla);
  const odak = await api.odak?.();
  if (odak) B.odakSayaci(odak.bitis);
  let gorulduMu = false;
  try {
    gorulduMu = localStorage.getItem('karsilamaGoruldu') === '1';
  } catch {}
  if (!durum.ayarlar.anahtarlar?.deepseekApiKey && !gorulduMu) {
    B.karsilama({
      mikrofonTesti,
      bitince: async (kaydedildi) => {
        try {
          localStorage.setItem('karsilamaGoruldu', '1');
        } catch {}
        durum.ayarlar = await api.ayarlar();
        baglam();
        api.merhaba();
        if (kaydedildi) setTimeout(() => B.bildirim({ tur: 'bilgi', baslik: 'İpucu', metin: '⌘K ile hızlı komutlar, Esc ile susturma. Bir maskota tıklarsan sıradaki sözün ona gider.', sure: 9000 }), 2500);
      },
    });
  } else api.merhaba();
}

basla();
