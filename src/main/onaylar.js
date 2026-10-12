// Dışarıya etkisi olan işlemler (ör. tweet) kullanıcı onayına düşer.
const store = require('./store');

const VARSAYILAN = { kayitlar: [] };

function olustur({ arac, args, ajan, baslik, detay, meta = null }) {
  return store.guncelle('onaylar', VARSAYILAN, (o) => {
    const k = { id: store.yeniId('onay'), arac, args, ajan, baslik, detay, meta, durum: 'bekliyor', tarih: new Date().toISOString() };
    o.kayitlar.push(k);
    o.kayitlar = o.kayitlar.slice(-100);
    return k;
  });
}

function bekleyenler() {
  return store.oku('onaylar', VARSAYILAN).kayitlar.filter((k) => k.durum === 'bekliyor');
}

function bul(id) {
  return store.oku('onaylar', VARSAYILAN).kayitlar.find((k) => k.id === id);
}

function durumYaz(id, durum, sonuc) {
  store.guncelle('onaylar', VARSAYILAN, (o) => {
    const k = o.kayitlar.find((x) => x.id === id);
    if (k) {
      k.durum = durum;
      k.sonuc = sonuc;
    }
  });
}

function argsGuncelle(id, args) {
  store.guncelle('onaylar', VARSAYILAN, (o) => {
    const k = o.kayitlar.find((x) => x.id === id);
    if (k) k.args = args;
  });
}

module.exports = { olustur, bekleyenler, bul, durumYaz, argsGuncelle };
