// Hatırlatma kayıtları. Zamanlayıcı (zamanlayici.js) bunları zamanı gelince seslendirir.
// Takvim/doğum günü/ödeme gibi kaynaklardan gelen hatırlatmalar "anahtar" ile senkronlanır:
// aynı anahtar bir kez kurulur, çaldıktan sonra tekrar kurulmaz.
const store = require('./store');
const { tarihCoz, sonraki, SIKLIKLAR } = require('./zaman');

const VARSAYILAN = { kayitlar: [] };
const TEKRARLAR = ['yok', ...SIKLIKLAR];
const SAKLAMA_GUN = 45;

function ekle({ metin, zaman, ajan, tekrar = 'yok', kaynak = null, anahtar = null }) {
  const d = tarihCoz(zaman, 'zaman');
  if (!TEKRARLAR.includes(tekrar)) throw new Error(`Tekrar şunlardan biri olmalı: ${TEKRARLAR.join(', ')}`);
  return store.guncelle('hatirlatmalar', VARSAYILAN, (h) => {
    const k = { id: store.yeniId('hat'), metin: String(metin).slice(0, 500), zaman: d.toISOString(), ajan, tekrar, kaynak, anahtar, calindi: false };
    h.kayitlar.push(k);
    return k;
  });
}

// Anahtar daha önce hiç kurulmadıysa ekler (çalmış olsa bile tekrar kurmaz).
function senkronEkle(anahtar, veri) {
  const var_ = store.oku('hatirlatmalar', VARSAYILAN).kayitlar.some((k) => k.anahtar === anahtar);
  if (var_ || new Date(veri.zaman) < new Date(Date.now() - 60_000)) return null;
  return ekle({ ...veri, anahtar });
}

function listele({ hepsi = false } = {}) {
  const k = store.oku('hatirlatmalar', VARSAYILAN).kayitlar;
  return (hepsi ? k : k.filter((x) => !x.calindi)).sort((a, b) => a.zaman.localeCompare(b.zaman));
}

function sil(id) {
  return store.guncelle('hatirlatmalar', VARSAYILAN, (h) => {
    const once = h.kayitlar.length;
    h.kayitlar = h.kayitlar.filter((k) => k.id !== id);
    return once !== h.kayitlar.length;
  });
}

// Bir kaynağa (etkinlik, ödev...) ait henüz çalmamış hatırlatmaları siler.
function kaynagaGoreSil(tur, id) {
  store.guncelle('hatirlatmalar', VARSAYILAN, (h) => {
    h.kayitlar = h.kayitlar.filter((k) => !(k.kaynak && k.kaynak.tur === tur && k.kaynak.id === id && !k.calindi));
  });
}

// Son çalan (ya da verilen) hatırlatmayı N dakika ertele.
function ertele(id, dakika) {
  const dk = Math.max(1, Math.round(Number(dakika) || 10));
  const kayitlar = store.oku('hatirlatmalar', VARSAYILAN).kayitlar;
  const hedef = id ? kayitlar.find((k) => k.id === id) : kayitlar.filter((k) => k.calindi && k.calmaZamani).sort((a, b) => b.calmaZamani.localeCompare(a.calmaZamani))[0];
  if (!hedef) throw new Error('Ertelenecek hatırlatma bulunamadı.');
  return ekle({ metin: hedef.metin, zaman: new Date(Date.now() + dk * 60_000).toISOString(), ajan: hedef.ajan, kaynak: hedef.kaynak });
}

// Zamanı gelmiş hatırlatmaları işaretleyip döndürür; tekrarlıları bir sonraki zamana kurar.
function zamaniGelenleriAl(simdi = new Date()) {
  return store.guncelle('hatirlatmalar', VARSAYILAN, (h) => {
    const gelenler = [];
    for (const k of h.kayitlar) {
      if (k.calindi || new Date(k.zaman) > simdi) continue;
      const gecikmeDk = (simdi - new Date(k.zaman)) / 60_000;
      gelenler.push({ ...k, gecikmeDk });
      if (k.tekrar === 'yok') {
        k.calindi = true;
        k.calmaZamani = simdi.toISOString();
        k.kacirildi = gecikmeDk > 60;
      } else {
        let t = new Date(k.zaman);
        for (let i = 0; i < 5000 && t <= simdi; i++) t = sonraki(t, { siklik: k.tekrar });
        k.zaman = t.toISOString();
        k.sonCalma = simdi.toISOString();
      }
    }
    const sinir = simdi.getTime() - SAKLAMA_GUN * 864e5;
    h.kayitlar = h.kayitlar.filter((k) => !k.calindi || new Date(k.zaman).getTime() > sinir);
    return gelenler;
  });
}

function kacirilanlar(gun = 7) {
  const sinir = Date.now() - gun * 864e5;
  return store.oku('hatirlatmalar', VARSAYILAN).kayitlar.filter((k) => k.kacirildi && new Date(k.zaman).getTime() > sinir);
}

module.exports = { ekle, senkronEkle, listele, sil, kaynagaGoreSil, ertele, zamaniGelenleriAl, kacirilanlar, TEKRARLAR };
