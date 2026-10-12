// Tarih/saat yardımcıları. Her şey bilgisayarın yerel saat diliminde çalışır.

const GUNLER = { pazartesi: 1, sali: 2, salı: 2, carsamba: 3, çarşamba: 3, persembe: 4, perşembe: 4, cuma: 5, cumartesi: 6, pazar: 7 };
const SIKLIKLAR = ['gunluk', 'hafta_ici', 'haftalik', 'aylik', 'yillik'];

function tarihCoz(deger, alan = 'tarih') {
  const d = new Date(deger);
  if (!deger || Number.isNaN(d.getTime())) {
    throw new Error(`Geçersiz ${alan}: "${deger}". ISO 8601 biçiminde ver, örn. 2026-10-02T15:00:00${ofset()}`);
  }
  return d;
}

function ofset(d = new Date()) {
  const dk = -d.getTimezoneOffset();
  const m = Math.abs(dk);
  return `${dk >= 0 ? '+' : '-'}${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const p2 = (n) => String(n).padStart(2, '0');

// Yerel saatle ISO: 2026-10-02T15:00:00+03:00
function yerelIso(d = new Date()) {
  d = new Date(d);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:00${ofset(d)}`;
}

function gunAnahtari(d = new Date()) {
  d = new Date(d);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

// Sesli okunacak biçim: "2 Ekim Cuma 15:00"
function okunur(deger, { saat = true } = {}) {
  const d = new Date(deger);
  const o = { day: 'numeric', month: 'long', weekday: 'long' };
  if (saat) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleString('tr-TR', o);
}

function suAnMetni(d = new Date()) {
  const gun = d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const saat = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${gun}, saat ${saat} (ISO ${yerelIso(d)})`;
}

// "21:00" -> o günün o saati
function bugunSaat(hhmm, d = new Date()) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = new Date(d);
  t.setHours(h || 0, m || 0, 0, 0);
  return t;
}

// "2026-10-02" -> o günün 00:00'ı (yerel)
function gunBaslangici(deger) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(deger))) {
    const [y, m, g] = deger.split('-').map(Number);
    return new Date(y, m - 1, g);
  }
  const d = tarihCoz(deger);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ISO hafta günü: Pazartesi=1 ... Pazar=7
function isoGun(d) {
  return ((new Date(d).getDay() + 6) % 7) + 1;
}

function gunNumarasi(g) {
  if (typeof g === 'number' && g >= 1 && g <= 7) return g;
  const n = GUNLER[String(g || '').toLocaleLowerCase('tr').trim()];
  if (!n) throw new Error(`Geçersiz gün: "${g}". pazartesi..pazar ya da 1..7 ver.`);
  return n;
}

function ayEkle(d, n) {
  const t = new Date(d);
  const gun = t.getDate();
  t.setDate(1);
  t.setMonth(t.getMonth() + n);
  const sonGun = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  t.setDate(Math.min(gun, sonGun));
  return t;
}

// Tekrar kuralına göre bir sonraki tarihi verir. kural: { siklik, aralik?, gunler? }
function sonraki(d, kural) {
  const aralik = Math.max(1, Number(kural.aralik) || 1);
  const t = new Date(d);
  switch (kural.siklik) {
    case 'gunluk':
      t.setDate(t.getDate() + aralik);
      return t;
    case 'hafta_ici':
      do t.setDate(t.getDate() + 1);
      while (isoGun(t) > 5);
      return t;
    case 'haftalik': {
      const gunler = (kural.gunler || []).map(gunNumarasi).sort();
      if (!gunler.length) {
        t.setDate(t.getDate() + 7 * aralik);
        return t;
      }
      for (let i = 1; i <= 7 * aralik + 7; i++) {
        t.setDate(t.getDate() + 1);
        if (gunler.includes(isoGun(t))) return t;
      }
      return t;
    }
    case 'aylik':
      return ayEkle(t, aralik);
    case 'yillik':
      return ayEkle(t, 12 * aralik);
    default:
      throw new Error(`Bilinmeyen tekrar: ${kural.siklik}. Şunlardan biri: ${SIKLIKLAR.join(', ')}`);
  }
}

// Tekrarlı bir başlangıcın [bas, son] aralığındaki tüm örneklerini üretir.
function ornekler(ilk, kural, bas, son, { bitis = null, adet = null, sinir = 2000 } = {}) {
  const sonuc = [];
  let t = new Date(ilk);
  // Haftalık + gün listesi: ilk tarih listedeki bir güne denk gelmiyorsa ilk uygun güne kaydır.
  if (kural && kural.siklik === 'haftalik' && kural.gunler?.length && !kural.gunler.map(gunNumarasi).includes(isoGun(t))) {
    t = sonraki(t, kural);
  }
  for (let i = 0; i < sinir; i++) {
    if (adet && i >= adet) break;
    if (bitis && t > bitis) break;
    if (t > son) break;
    if (t >= bas) sonuc.push(new Date(t));
    if (!kural) break;
    t = sonraki(t, kural);
  }
  return sonuc;
}

function sureMetni(dk) {
  dk = Math.round(dk);
  if (dk >= 1440 && dk % 1440 === 0) return `${dk / 1440} gün`;
  if (dk >= 60) return dk % 60 ? `${Math.floor(dk / 60)} saat ${dk % 60} dakika` : `${dk / 60} saat`;
  return `${dk} dakika`;
}

module.exports = { tarihCoz, yerelIso, okunur, suAnMetni, bugunSaat, gunAnahtari, gunBaslangici, ofset, isoGun, gunNumarasi, sonraki, ornekler, sureMetni, ayEkle, SIKLIKLAR };
