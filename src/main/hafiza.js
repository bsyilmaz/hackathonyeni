// Uzun süreli hafıza.
//
// Kurallar (gereksiz paylaşım yok, gereksiz token yok):
// - Her ajanın KENDİ hafızası vardır; başka ajan göremez.
// - "ortak" hafıza sadece kullanıcıyla ilgili temel gerçekler içindir (adı, okulu, önemli kişiler...).
//   Sadece "ortakYazar" yetkisi olan ajanlar (Cem, Defne) buraya yazabilir.
// - Bir ajan diğerine bilgi vermek isterse ekibe_ilet ile SADECE o ajanın hafızasına mesaj bırakır.
// - Her konuşma kalıcı olarak arşivlenir (unutma yok) ve yerel bir modelle anlamsal olarak aranır.
// - İsteğe, tüm hafıza değil sadece en ilgili birkaç kayıt eklenir (token tasarrufu).
const fs = require('fs');
const path = require('path');
const store = require('./store');

const BOYUT = 384;
const VEKTOR_DOSYASI = () => path.join(store.DATA_DIR, 'hafiza-vektor.bin');
const VARSAYILAN = { kayitlar: [] };

let gomucu = null; // async (metinler: string[]) => Float32Array[] (normalize edilmiş)
let vektorler = new Float32Array(0);
let vektorAdet = 0;
let vektorYuklendi = false;

function gomucuAyarla(fn) {
  gomucu = fn;
}

// Yönlendirme gibi başka modüllerin de kullandığı gömme; model hazır değilse null.
async function gom(metinler) {
  if (!gomucu) return null;
  try {
    return await gomucu(metinler);
  } catch {
    return null;
  }
}

function vektorleriYukle() {
  if (vektorYuklendi) return;
  vektorYuklendi = true;
  try {
    const b = fs.readFileSync(VEKTOR_DOSYASI());
    vektorAdet = Math.floor(b.length / (4 * BOYUT));
    vektorler = new Float32Array(Math.max(1024, vektorAdet * 2) * BOYUT);
    vektorler.set(new Float32Array(b.buffer, b.byteOffset, vektorAdet * BOYUT));
  } catch {
    vektorAdet = 0;
  }
  // Dosya yarım kaldıysa (çökme), indeksi dosyada olmayan kayıtlar yeniden gömülsün.
  const h = store.oku('hafiza', VARSAYILAN);
  let degisti = false;
  for (const k of h.kayitlar) {
    if (k.vi != null && k.vi >= vektorAdet) {
      k.vi = null;
      degisti = true;
    }
  }
  if (degisti) store.kaydet('hafiza');
}

function vektorEkle(v) {
  if ((vektorAdet + 1) * BOYUT > vektorler.length) {
    const yeni = new Float32Array(Math.max(1024, vektorAdet * 2) * BOYUT);
    yeni.set(vektorler.subarray(0, vektorAdet * BOYUT));
    vektorler = yeni;
  }
  vektorler.set(v, vektorAdet * BOYUT);
  fs.appendFileSync(VEKTOR_DOSYASI(), Buffer.from(new Float32Array(v).buffer));
  return vektorAdet++;
}

function vektor(i) {
  return vektorler.subarray(i * BOYUT, (i + 1) * BOYUT);
}

// ---------------- Yazma ----------------
function normal(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ekle(kayit) {
  const k = store.guncelle('hafiza', VARSAYILAN, (h) => {
    const x = { id: store.yeniId('h'), tarih: new Date().toISOString(), vi: null, ...kayit };
    h.kayitlar.push(x);
    return x;
  });
  setImmediate(() => bekleyenleriGom().catch(() => {}));
  return k;
}

function notEkle(ajan, metin, { ortak = false } = {}) {
  const temiz = String(metin || '').trim().slice(0, 800);
  if (!temiz) throw new Error('Not boş olamaz.');
  if (ortak && !ajan.hafiza?.ortakYazar) throw new Error(`${ajan.name} ortak hafızaya yazamaz; bilgiyi kendi hafızasına kaydet ya da ekibe_ilet ile ilgili kişiye gönder.`);
  const sahip = ortak ? 'ortak' : ajan.id;
  const n = normal(temiz);
  const ayni = store.oku('hafiza', VARSAYILAN).kayitlar.find((k) => k.tur === 'not' && k.sahip === sahip && normal(k.metin) === n);
  if (ayni) return { ...ayni, zatenVardi: true };
  return ekle({ tur: 'not', sahip, yazan: ajan.id, metin: temiz });
}

function konusmaEkle(ajanId, kullanici, cevap) {
  const k = String(kullanici || '').slice(0, 700);
  const c = String(cevap || '').slice(0, 700);
  return ekle({ tur: 'konusma', sahip: ajanId, kullanici: k, cevap: c, metin: `Kullanıcı: ${k}\nCevap: ${c}` });
}

function mesajGonder(gonderen, alici, metin) {
  const temiz = String(metin || '').trim().slice(0, 800);
  if (!temiz) throw new Error('Mesaj boş olamaz.');
  return ekle({ tur: 'mesaj', sahip: alici.id, kaynak: gonderen.id, metin: `${gonderen.name} iletti: ${temiz}` });
}

function sil(ajan, id) {
  return store.guncelle('hafiza', VARSAYILAN, (h) => {
    const i = h.kayitlar.findIndex((k) => k.id === id && (k.sahip === ajan.id || (k.sahip === 'ortak' && ajan.hafiza?.ortakYazar)));
    if (i < 0) return false;
    h.kayitlar.splice(i, 1);
    return true;
  });
}

// ---------------- Gömme (yerel model) ----------------
let gomuluyor = false;
async function bekleyenleriGom(parti = 32) {
  if (!gomucu || gomuluyor) return 0;
  gomuluyor = true;
  let toplam = 0;
  try {
    vektorleriYukle();
    for (;;) {
      const bekleyen = store.oku('hafiza', VARSAYILAN).kayitlar.filter((k) => k.vi == null).slice(0, parti);
      if (!bekleyen.length) break;
      const vler = await gomucu(bekleyen.map((k) => k.metin));
      store.guncelle('hafiza', VARSAYILAN, (h) => {
        const harita = new Map(h.kayitlar.map((k) => [k.id, k]));
        bekleyen.forEach((b, i) => {
          const k = harita.get(b.id);
          if (k && k.vi == null && vler[i]) k.vi = vektorEkle(vler[i]);
        });
      });
      toplam += bekleyen.length;
    }
  } finally {
    gomuluyor = false;
  }
  return toplam;
}

// ---------------- Okuma ----------------
function gorebilir(ajan, k) {
  return k.sahip === ajan.id || k.sahip === 'ortak';
}

function koklar(s) {
  return new Set(
    normal(s)
      .split(' ')
      .filter((w) => w.length >= 3)
      .map((w) => w.slice(0, 5))
  );
}

function kelimePuani(sorguKokleri, metin) {
  if (!sorguKokleri.size) return 0;
  const m = koklar(metin);
  let ortak = 0;
  for (const k of sorguKokleri) if (m.has(k)) ortak++;
  return ortak / sorguKokleri.size;
}

// İlgili kayıtları bulur. Gömücü yoksa (ör. model yükleniyor) kelime eşleşmesine düşer.
async function ara(ajan, sorgu, { k = 6, esik = 0.36, turler = null, baslangic = null, bitis = null, haric = null } = {}) {
  vektorleriYukle();
  let adaylar = store.oku('hafiza', VARSAYILAN).kayitlar.filter((x) => gorebilir(ajan, x));
  if (turler) adaylar = adaylar.filter((x) => turler.includes(x.tur));
  if (baslangic) adaylar = adaylar.filter((x) => new Date(x.tarih) >= baslangic);
  if (bitis) adaylar = adaylar.filter((x) => new Date(x.tarih) <= bitis);
  if (haric) adaylar = adaylar.filter((x) => !haric.has(x.id));
  if (!adaylar.length) return [];
  if (!String(sorgu || '').trim()) return adaylar.slice(-k).reverse();

  let q = null;
  if (gomucu) {
    try {
      [q] = await gomucu([sorgu]);
    } catch {
      q = null;
    }
  }
  const sk = koklar(sorgu);
  const simdi = Date.now();
  const puanli = adaylar.map((x) => {
    let p = kelimePuani(sk, x.metin) * 0.6;
    if (q && x.vi != null) {
      const v = vektor(x.vi);
      let d = 0;
      for (let i = 0; i < BOYUT; i++) d += v[i] * q[i];
      p = Math.max(p, d + kelimePuani(sk, x.metin) * 0.1);
    }
    if (x.tur === 'not' || x.tur === 'mesaj') p += 0.03; // kalıcı bilgiler biraz öne
    if (simdi - new Date(x.tarih).getTime() < 2 * 864e5) p += 0.02;
    return { x, p };
  });
  return puanli
    .filter((y) => y.p >= esik)
    .sort((a, b) => b.p - a.p)
    .slice(0, k)
    .map((y) => ({ ...y.x, puan: Number(y.p.toFixed(2)) }));
}

// Son N saatteki konuşmalar (kısa süreli bağlam).
function sonKonusmalar(ajanId, { saat = 12, adet = 6 } = {}) {
  const sinir = Date.now() - saat * 3600_000;
  return store
    .oku('hafiza', VARSAYILAN)
    .kayitlar.filter((k) => k.tur === 'konusma' && k.sahip === ajanId && new Date(k.tarih).getTime() > sinir)
    .slice(-adet);
}

function goreceliTarih(iso) {
  const d = new Date(iso);
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const gun = Math.round((bugun - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const tarih = d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  if (gun <= 0) return 'bugün';
  if (gun === 1) return 'dün';
  if (gun < 7) return `${gun} gün önce`;
  if (gun < 30) return `${Math.round(gun / 7)} hafta önce, ${tarih}`;
  return tarih + (d.getFullYear() !== bugun.getFullYear() ? ' ' + d.getFullYear() : '');
}

function satir(k) {
  const etiket = k.tur === 'konusma' ? 'konuşma' : k.sahip === 'ortak' ? 'ortak bilgi' : k.tur === 'mesaj' ? 'ekipten' : 'notum';
  return `- [${etiket}, ${goreceliTarih(k.tarih)}] ${k.metin.replace(/\n/g, ' | ')}`;
}

module.exports = { gomucuAyarla, gom, notEkle, konusmaEkle, mesajGonder, sil, ara, sonKonusmalar, bekleyenleriGom, satir, goreceliTarih, BOYUT };
