// Ayarlar (data/ayarlar.json) ve gizli anahtarlar (data/gizli.json).
// Gizli anahtarlar mümkünse macOS Anahtar Zinciri destekli safeStorage ile şifrelenir
// ve arayüze (renderer) asla gönderilmez.
const os = require('os');
const path = require('path');
const store = require('./store');

const VARSAYILAN = {
  kullaniciAdi: '',
  deepseekModel: 'deepseek-chat',
  deepseekAdres: 'https://api.deepseek.com',
  kodDunyasi: path.join(os.homedir(), 'Desktop', 'keremcodeworld'),
  sabahBrifingi: '09:00',
  aksamKontrolu: '21:00',
  sessizBaslangic: '00:30', // bu saatler arasında sesli konuşulmaz, sadece bildirim gelir
  sessizBitis: '08:00',
  whisperModel: 'onnx-community/whisper-small',
  sesMotoru: 'yerel', // 'yerel' (Supertonic, çevrimdışı) | 'edge' (Microsoft, internet)
  altyazi: false,
  aylikButceUSD: 0, // 0 = sınırsız
  // 1 milyon token başına USD (DeepSeek fiyat sayfasından güncellenebilir)
  fiyatOnbellekIsabet: 0.028,
  fiyatOnbellekKacirma: 0.28,
  fiyatCikti: 0.42,
  sesler: {}, // { ajanId: { ad, hiz, perde } }, ajan dosyasındaki sesi ezer
};

const GIZLI_ANAHTARLAR = ['deepseekApiKey'];

let safeStorage = null;
try {
  const e = require('electron');
  if (e && typeof e === 'object' && e.safeStorage) safeStorage = e.safeStorage;
} catch {
  /* düz node (testler) */
}

function sifrelemeVar() {
  try {
    return !!safeStorage && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function ayarlar() {
  return { ...VARSAYILAN, ...store.oku('ayarlar', {}) };
}

function ayarlariGuncelle(degisiklik) {
  return store.guncelle('ayarlar', {}, (a) => {
    for (const [k, v] of Object.entries(degisiklik)) {
      if (!(k in VARSAYILAN)) continue;
      a[k] = typeof VARSAYILAN[k] === 'number' ? Math.max(0, Number(v) || 0) : v;
    }
    return { ...VARSAYILAN, ...a };
  });
}

function gizliOku(ad) {
  const g = store.oku('gizli', {})[ad];
  if (!g) return '';
  if (g.sifreli) {
    if (!sifrelemeVar()) return '';
    return safeStorage.decryptString(Buffer.from(g.deger, 'base64'));
  }
  return g.deger;
}

function gizliYaz(ad, deger) {
  if (!GIZLI_ANAHTARLAR.includes(ad)) throw new Error('Bilinmeyen gizli anahtar: ' + ad);
  store.guncelle('gizli', {}, (g) => {
    if (!deger) delete g[ad];
    else if (sifrelemeVar()) g[ad] = { sifreli: true, deger: safeStorage.encryptString(deger).toString('base64') };
    else g[ad] = { sifreli: false, deger };
  });
}

// Arayüze gönderilen güvenli görünüm: anahtarların kendisi yok, sadece var/yok bilgisi.
function arayuzIcin() {
  const g = store.oku('gizli', {});
  return { ...ayarlar(), anahtarlar: Object.fromEntries(GIZLI_ANAHTARLAR.map((k) => [k, !!g[k]])) };
}

// Şu an sessiz saatlerde miyiz? (gece yarısını geçen aralıkları da destekler)
function sessizMi(d = new Date()) {
  const a = ayarlar();
  if (!a.sessizBaslangic || !a.sessizBitis || a.sessizBaslangic === a.sessizBitis) return false;
  const dk = d.getHours() * 60 + d.getMinutes();
  const cevir = (s) => {
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  const b = cevir(a.sessizBaslangic);
  const s = cevir(a.sessizBitis);
  return b < s ? dk >= b && dk < s : dk >= b || dk < s;
}

module.exports = { ayarlar, ayarlariGuncelle, gizliOku, gizliYaz, arayuzIcin, sessizMi, GIZLI_ANAHTARLAR, VARSAYILAN };
