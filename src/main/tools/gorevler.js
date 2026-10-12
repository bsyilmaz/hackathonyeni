// Cem'in araçları: görevler, listeler, alışkanlıklar, özel günler, ödemeler, kaçırılanlar, hayat özeti.
const store = require('../store');
const hat = require('../hatirlatmalar');
const onaylar = require('../onaylar');
const z = require('../zaman');
const takvim = require('./takvim');
const okul = require('./okul');

const VARSAYILAN = { kayitlar: [], aliskanliklar: [], listeler: {}, ozelGunler: [], odemeler: [], notKutusu: [] };
const GUN_VARSAYILAN = {};
const ONCELIKLER = ['dusuk', 'orta', 'yuksek'];
const oku = () => store.oku('gorevler', VARSAYILAN);
const normal = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function gorevGorunum(g) {
  const r = { id: g.id, baslik: g.baslik, oncelik: g.oncelik };
  if (g.sonTarih) {
    r.sonTarih = z.yerelIso(new Date(g.sonTarih));
    r.okunur = z.okunur(g.sonTarih);
    if (!g.tamam && new Date(g.sonTarih) < new Date()) r.gecikti = true;
  }
  if (g.ertelemeSayisi) r.ertelemeSayisi = g.ertelemeSayisi;
  if (g.tekrar) r.tekrar = g.tekrar;
  if (g.altGorevler?.length) r.altGorevler = g.altGorevler.map((a, i) => `${i + 1}. ${a.tamam ? '✓' : '○'} ${a.metin}`);
  if (g.not) r.not = g.not.slice(0, 150);
  if (g.tamam) r.tamam = true;
  return r;
}

function gorevBul(id) {
  const g = oku().kayitlar.find((x) => x.id === id);
  if (!g) throw new Error('Görev bulunamadı: ' + id + '. Önce gorevleri_listele ile id’yi bul.');
  return g;
}

function gorevHatirlat(g, ajanId) {
  hat.kaynagaGoreSil('gorev', g.id);
  if (!g.sonTarih || g.tamam) return;
  for (const dk of g.hatirlat || [180]) {
    const zmn = new Date(new Date(g.sonTarih).getTime() - dk * 60_000);
    if (zmn > new Date()) hat.ekle({ metin: `"${g.baslik}" işinin son tarihine ${z.sureMetni(dk)} kaldı.`, zaman: zmn.toISOString(), ajan: ajanId, kaynak: { tur: 'gorev', id: g.id } });
  }
}

// MM-DD ya da YYYY-MM-DD -> bir sonraki yıllık tarih
function sonrakiYillik(tarih, simdi = new Date()) {
  const m = String(tarih).match(/(\d{1,2})-(\d{1,2})$/);
  if (!m) throw new Error('Tarih MM-GG ya da YYYY-MM-GG olmalı.');
  const [ay, gun] = [Number(m[1]), Number(m[2])];
  const bugun = z.gunBaslangici(z.gunAnahtari(simdi));
  let d = new Date(simdi.getFullYear(), ay - 1, gun);
  if (d < bugun) d = new Date(simdi.getFullYear() + 1, ay - 1, gun);
  return d;
}

function sonrakiOdeme(o, simdi = new Date()) {
  const bugun = z.gunBaslangici(z.gunAnahtari(simdi));
  const ayinGunu = (y, ay) => new Date(y, ay, Math.min(o.gun, new Date(y, ay + 1, 0).getDate()));
  if (o.siklik === 'yillik') {
    let d = ayinGunu(simdi.getFullYear(), (o.ay || 1) - 1);
    if (d < bugun) d = ayinGunu(simdi.getFullYear() + 1, (o.ay || 1) - 1);
    return d;
  }
  let d = ayinGunu(simdi.getFullYear(), simdi.getMonth());
  if (d < bugun) d = ayinGunu(simdi.getFullYear(), simdi.getMonth() + 1);
  return d;
}

// Önümüzdeki 8 gün için özel gün/ödeme/alışkanlık hatırlatmalarını kurar (zamanlayıcı çağırır).
function senkronla(simdi = new Date()) {
  const ufuk = simdi.getTime() + 8 * 864e5;
  const saat9 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0);
  for (const g of oku().ozelGunler) {
    const d = sonrakiYillik(g.tarih, simdi);
    for (const once of g.hatirlatGunOnce || [7, 1, 0]) {
      const zmn = saat9(new Date(d.getTime() - once * 864e5));
      if (zmn.getTime() > ufuk) continue;
      const yas = g.yil ? `, ${d.getFullYear() - g.yil}. yaşı` : '';
      const ne = once === 0 ? 'bugün' : once === 1 ? 'yarın' : `${once} gün sonra`;
      hat.senkronEkle(`ozel:${g.id}:${z.gunAnahtari(d)}:${once}`, { metin: `${g.kisi} için ${g.tur} ${ne}${yas}.${once >= 3 ? ' Hediye ya da plan düşünmek için iyi zaman.' : ''}`, zaman: zmn.toISOString(), ajan: 'cem', kaynak: { tur: 'ozelgun', id: g.id } });
    }
  }
  for (const o of oku().odemeler) {
    const d = sonrakiOdeme(o, simdi);
    for (const once of o.hatirlatGunOnce || [3, 0]) {
      const zmn = saat9(new Date(d.getTime() - once * 864e5));
      if (zmn.getTime() > ufuk) continue;
      const ne = once === 0 ? 'bugün' : `${once} gün sonra`;
      hat.senkronEkle(`odeme:${o.id}:${z.gunAnahtari(d)}:${once}`, { metin: `${o.ad} ödemesi ${ne}${o.tutar ? `, tutar ${o.tutar}` : ''}.`, zaman: zmn.toISOString(), ajan: 'cem', kaynak: { tur: 'odeme', id: o.id } });
    }
  }
}

function seri(kayitlar) {
  const set = new Set(kayitlar);
  let d = new Date();
  if (!set.has(z.gunAnahtari(d))) d = new Date(d.getTime() - 864e5); // bugün henüz yapılmadıysa dünden say
  let n = 0;
  while (set.has(z.gunAnahtari(d))) {
    n++;
    d = new Date(d.getTime() - 864e5);
  }
  return n;
}

function aliskanlikBul(ad) {
  const a = oku().aliskanliklar.find((x) => x.id === ad || normal(x.ad) === normal(ad)) || oku().aliskanliklar.find((x) => normal(x.ad).includes(normal(ad)));
  if (!a) throw new Error(`"${ad}" alışkanlığı yok. Kayıtlı: ${oku().aliskanliklar.map((x) => x.ad).join(', ') || 'yok'}.`);
  return a;
}

function kacirilanlar() {
  const simdi = Date.now();
  const o = okul.oku();
  return {
    gecikenGorevler: oku().kayitlar.filter((g) => !g.tamam && g.sonTarih && new Date(g.sonTarih) < simdi).map(gorevGorunum),
    cokErtelenenler: oku().kayitlar.filter((g) => !g.tamam && g.ertelemeSayisi >= 3).map((g) => ({ baslik: g.baslik, ertelemeSayisi: g.ertelemeSayisi })),
    kacirilanHatirlatmalar: hat.kacirilanlar().map((k) => ({ metin: k.metin, okunur: z.okunur(k.zaman) })),
    gecikenOdevler: o.odevler.filter((x) => !x.tamam && new Date(x.teslim) < simdi).map((x) => `${x.ders}: ${x.aciklama}`),
    bugunYapilmayanAliskanliklar: oku().aliskanliklar.filter((a) => a.siklik === 'gunluk' && !a.kayitlar.includes(z.gunAnahtari())).map((a) => a.ad),
  };
}

// ---------------- Hızlı not kutusu (Cem) ----------------
function hizliNot(metin) {
  const m = String(metin || '').trim().slice(0, 500);
  if (!m) throw new Error('Not boş.');
  return store.guncelle('gorevler', VARSAYILAN, (t) => {
    const n = { id: store.yeniId('not'), metin: m, tarih: new Date().toISOString() };
    t.notKutusu.push(n);
    return { ...n, toplam: t.notKutusu.length };
  });
}

// ---------------- Günün tek önemli işi (Defne) ----------------
function gununIsi() {
  const g = store.oku('gunun_isi', GUN_VARSAYILAN);
  return g.gun === z.gunAnahtari() ? g : null;
}

function gununIsiBelirle(metin) {
  const m = String(metin || '').trim().slice(0, 200);
  if (!m) throw new Error('İş boş olamaz.');
  return store.guncelle('gunun_isi', GUN_VARSAYILAN, (g) => Object.assign(g, { gun: z.gunAnahtari(), metin: m, tamam: false, tarih: new Date().toISOString() }));
}

function gununIsiTamamla(tamam = true) {
  if (!gununIsi()) throw new Error('Bugün için belirlenmiş bir iş yok.');
  return store.guncelle('gunun_isi', GUN_VARSAYILAN, (g) => Object.assign(g, { tamam }));
}

function hayatOzeti() {
  const simdi = new Date();
  const o = okul.oku();
  const kisa = (l) => (l.length ? l : undefined);
  const ozel = oku()
    .ozelGunler.map((g) => ({ g, d: sonrakiYillik(g.tarih, simdi) }))
    .filter((x) => x.d - simdi < 3 * 864e5)
    .map((x) => `${x.g.kisi} ${x.g.tur}: ${z.okunur(x.d, { saat: false })}`);
  const odeme = oku()
    .odemeler.map((x) => ({ x, d: sonrakiOdeme(x, simdi) }))
    .filter((y) => y.d - simdi < 3 * 864e5)
    .map((y) => `${y.x.ad}: ${z.okunur(y.d, { saat: false })}`);
  return {
    suAn: z.suAnMetni(simdi),
    bugunVeYarin: kisa(takvim.ornekleriGetir(simdi, new Date(z.gunBaslangici(z.gunAnahtari(simdi)).getTime() + 2 * 864e5)).slice(0, 12).map((x) => `${z.okunur(x.baslangic, { saat: !x.e.tumGun })} ${x.e.baslik}`)),
    acikGorevler: kisa(oku().kayitlar.filter((g) => !g.tamam).sort((a, b) => (a.sonTarih || '9').localeCompare(b.sonTarih || '9')).slice(0, 8).map((g) => `${g.baslik}${g.sonTarih ? ` (${z.okunur(g.sonTarih)})` : ''}${g.oncelik === 'yuksek' ? ' !' : ''}`)),
    yaklasanOdevler: kisa(o.odevler.filter((x) => !x.tamam && new Date(x.teslim) - simdi < 4 * 864e5).map((x) => `${x.ders}: ${x.aciklama} (${z.okunur(x.teslim)})`)),
    yaklasanSinavlar: kisa(o.sinavlar.filter((s) => new Date(s.tarih) > simdi && new Date(s.tarih) - simdi < 10 * 864e5).map((s) => `${s.ders} ${s.tur || 'sınavı'} (${z.okunur(s.tarih)})`)),
    ozelGunler: kisa(ozel),
    odemeler: kisa(odeme),
    bekleyenOnaylar: kisa(onaylar.bekleyenler().map((k) => k.baslik)),
    kacirilanlar: kisa(hat.kacirilanlar(2).map((k) => k.metin)),
    bugunYapilmayanAliskanliklar: kisa(oku().aliskanliklar.filter((a) => a.siklik === 'gunluk' && !a.kayitlar.includes(z.gunAnahtari())).map((a) => a.ad)),
    gununTekIsi: gununIsi() ? `${gununIsi().metin}${gununIsi().tamam ? ' (yapıldı)' : ' (henüz yapılmadı)'}` : undefined,
    notKutusundaBekleyen: oku().notKutusu.length || undefined,
  };
}

module.exports = {
  hizliNot,
  gununIsi,
  gununIsiBelirle,
  gununIsiTamamla,
  notKutusu: () => oku().notKutusu,
  hayatOzeti,
  kacirilanlar,
  senkronla,
  araclar: [
    {
      name: 'gorev_ekle',
      description: 'Yapılacaklara görev ekler (alt görevli, tekrarlı olabilir). Son tarih varsa varsayılan 3 saat önce hatırlatır. Aynısı varsa eklemez.',
      parameters: {
        type: 'object',
        properties: {
          baslik: { type: 'string' },
          son_tarih: { type: 'string', description: 'ISO 8601' },
          oncelik: { type: 'string', enum: ONCELIKLER },
          not: { type: 'string' },
          alt_gorevler: { type: 'array', items: { type: 'string' } },
          tekrar: { type: 'string', enum: z.SIKLIKLAR, description: 'Tamamlanınca bir sonraki otomatik oluşur' },
          hatirlat_dk_once: { type: 'array', items: { type: 'number' } },
          tahmini_sure_dk: { type: 'number', description: 'İşin yaklaşık süresi (Elif planlarken kullanır)' },
        },
        required: ['baslik'],
      },
      calistir: (a, ctx) => {
        const son = a.son_tarih ? z.tarihCoz(a.son_tarih, 'son_tarih') : null;
        if (a.tekrar && !son) throw new Error('Tekrarlı görev için son_tarih gerekli (ilk tekrarın zamanı).');
        const ayni = oku().kayitlar.find((g) => !g.tamam && normal(g.baslik) === normal(a.baslik));
        if (ayni) return { zatenVar: gorevGorunum(ayni) };
        const g = store.guncelle('gorevler', VARSAYILAN, (t) => {
          const x = {
            id: store.yeniId('gorev'),
            baslik: String(a.baslik).trim().slice(0, 300),
            sonTarih: son ? son.toISOString() : null,
            oncelik: ONCELIKLER.includes(a.oncelik) ? a.oncelik : 'orta',
            not: a.not || '',
            altGorevler: (a.alt_gorevler || []).map((m) => ({ metin: String(m).slice(0, 200), tamam: false })),
            tekrar: a.tekrar || null,
            hatirlat: a.hatirlat_dk_once || [180],
            tahminiDk: a.tahmini_sure_dk ? Math.round(a.tahmini_sure_dk) : null,
            ertelemeSayisi: 0,
            tamam: false,
            eklenme: new Date().toISOString(),
          };
          t.kayitlar.push(x);
          return x;
        });
        gorevHatirlat(g, ctx.ajan.id);
        return { eklendi: gorevGorunum(g) };
      },
    },
    {
      name: 'gorev_guncelle',
      description: 'Görevin başlık/son tarih/öncelik/notunu değiştirir ya da alt görev ekler.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, baslik: { type: 'string' }, son_tarih: { type: 'string' }, oncelik: { type: 'string', enum: ONCELIKLER }, not: { type: 'string' }, alt_gorev_ekle: { type: 'array', items: { type: 'string' } }, tahmini_sure_dk: { type: 'number' } },
        required: ['id'],
      },
      calistir: (a, ctx) => {
        gorevBul(a.id);
        const g = store.guncelle('gorevler', VARSAYILAN, (t) => {
          const x = t.kayitlar.find((y) => y.id === a.id);
          if (a.baslik) x.baslik = a.baslik;
          if (a.son_tarih) x.sonTarih = z.tarihCoz(a.son_tarih, 'son_tarih').toISOString();
          if (a.oncelik) x.oncelik = a.oncelik;
          if (a.not !== undefined) x.not = a.not;
          if (a.tahmini_sure_dk) x.tahminiDk = Math.round(a.tahmini_sure_dk);
          for (const m of a.alt_gorev_ekle || []) x.altGorevler.push({ metin: m, tamam: false });
          return { ...x };
        });
        gorevHatirlat(g, ctx.ajan.id);
        return { guncellendi: gorevGorunum(g) };
      },
    },
    {
      name: 'gorev_tamamla',
      description: 'Görevi (ya da alt_gorev_no ile bir alt görevini) tamamlar. Tekrarlıysa bir sonrakini oluşturur. geri_al:true geri açar.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, alt_gorev_no: { type: 'number' }, geri_al: { type: 'boolean' } }, required: ['id'] },
      calistir: (a, ctx) => {
        gorevBul(a.id);
        const sonuc = store.guncelle('gorevler', VARSAYILAN, (t) => {
          const x = t.kayitlar.find((y) => y.id === a.id);
          if (a.alt_gorev_no) {
            const alt = x.altGorevler[a.alt_gorev_no - 1];
            if (!alt) throw new Error('Böyle bir alt görev yok.');
            alt.tamam = !a.geri_al;
            return { altGorev: alt.metin, kalanAltGorev: x.altGorevler.filter((y) => !y.tamam).length };
          }
          x.tamam = !a.geri_al;
          x.tamamlanma = x.tamam ? new Date().toISOString() : null;
          let sonraki = null;
          if (x.tamam && x.tekrar && x.sonTarih) {
            sonraki = { ...x, id: store.yeniId('gorev'), tamam: false, tamamlanma: null, ertelemeSayisi: 0, sonTarih: z.sonraki(new Date(x.sonTarih), { siklik: x.tekrar }).toISOString(), altGorevler: x.altGorevler.map((y) => ({ ...y, tamam: false })) };
            t.kayitlar.push(sonraki);
          }
          return { tamamlandi: x.tamam, sonrakiTekrar: sonraki ? z.okunur(sonraki.sonTarih) : undefined, sonraki };
        });
        if (!a.alt_gorev_no) {
          const g = gorevBul(a.id);
          gorevHatirlat(g, ctx.ajan.id);
          if (sonuc.sonraki) gorevHatirlat(sonuc.sonraki, ctx.ajan.id);
        }
        delete sonuc.sonraki;
        return sonuc;
      },
    },
    {
      name: 'gorev_ertele',
      description: 'Görevin son tarihini ileri atar ve erteleme sayısını artırır (çok ertelenenleri yüzüne vurmak için).',
      parameters: { type: 'object', properties: { id: { type: 'string' }, yeni_son_tarih: { type: 'string' } }, required: ['id', 'yeni_son_tarih'] },
      calistir: (a, ctx) => {
        gorevBul(a.id);
        const g = store.guncelle('gorevler', VARSAYILAN, (t) => {
          const x = t.kayitlar.find((y) => y.id === a.id);
          x.sonTarih = z.tarihCoz(a.yeni_son_tarih, 'yeni_son_tarih').toISOString();
          x.ertelemeSayisi = (x.ertelemeSayisi || 0) + 1;
          return { ...x };
        });
        gorevHatirlat(g, ctx.ajan.id);
        return { ertelendi: gorevGorunum(g) };
      },
    },
    {
      name: 'gorev_sil',
      description: 'Görevi siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) => {
        const g = gorevBul(a.id);
        hat.kaynagaGoreSil('gorev', a.id);
        store.guncelle('gorevler', VARSAYILAN, (t) => (t.kayitlar = t.kayitlar.filter((x) => x.id !== a.id)));
        return { silindi: g.baslik };
      },
    },
    {
      name: 'gorevleri_listele',
      description: 'Görevleri listeler. durum: acik (varsayılan), bugun, geciken, tamam, hepsi.',
      parameters: { type: 'object', properties: { durum: { type: 'string', enum: ['acik', 'bugun', 'geciken', 'tamam', 'hepsi'] }, ara: { type: 'string' } } },
      calistir: (a) => {
        const simdi = new Date();
        const bugunSon = new Date(z.gunBaslangici(z.gunAnahtari()).getTime() + 864e5);
        const f = {
          acik: (g) => !g.tamam,
          bugun: (g) => !g.tamam && g.sonTarih && new Date(g.sonTarih) < bugunSon,
          geciken: (g) => !g.tamam && g.sonTarih && new Date(g.sonTarih) < simdi,
          tamam: (g) => g.tamam,
          hepsi: () => true,
        }[a.durum || 'acik'];
        let l = oku().kayitlar.filter(f);
        if (a.ara) l = l.filter((g) => normal(g.baslik).includes(normal(a.ara)));
        if (a.durum === 'tamam') l = l.slice(-20);
        const sira = { yuksek: 0, orta: 1, dusuk: 2 };
        l.sort((x, y) => (x.sonTarih || '9').localeCompare(y.sonTarih || '9') || sira[x.oncelik] - sira[y.oncelik]);
        return { gorevler: l.slice(0, 30).map(gorevGorunum), toplam: l.length };
      },
    },
    {
      name: 'liste_ekle',
      description: 'Bir listeye (alışveriş, okunacak kitaplar, izlenecekler...) öğe ekler. Liste yoksa oluşturur.',
      parameters: { type: 'object', properties: { liste: { type: 'string' }, ogeler: { type: 'array', items: { type: 'string' } } }, required: ['liste', 'ogeler'] },
      calistir: (a) =>
        store.guncelle('gorevler', VARSAYILAN, (t) => {
          const ad = Object.keys(t.listeler).find((k) => normal(k) === normal(a.liste)) || String(a.liste).trim();
          const l = (t.listeler[ad] ||= []);
          const eklenen = [];
          for (const o of a.ogeler) {
            if (!l.some((x) => !x.tamam && normal(x.metin) === normal(o))) {
              l.push({ metin: String(o).slice(0, 200), tamam: false });
              eklenen.push(o);
            }
          }
          return { liste: ad, eklenen, toplamAcik: l.filter((x) => !x.tamam).length };
        }),
    },
    {
      name: 'liste_goster',
      description: 'Bir listeyi ya da (liste verilmezse) tüm listelerin adlarını gösterir.',
      parameters: { type: 'object', properties: { liste: { type: 'string' } } },
      calistir: (a) => {
        const t = oku();
        if (!a.liste) return { listeler: Object.entries(t.listeler).map(([k, v]) => `${k} (${v.filter((x) => !x.tamam).length} açık)`) };
        const ad = Object.keys(t.listeler).find((k) => normal(k) === normal(a.liste));
        if (!ad) return { yok: true, mevcut: Object.keys(t.listeler) };
        return { liste: ad, acik: t.listeler[ad].filter((x) => !x.tamam).map((x) => x.metin), alinan: t.listeler[ad].filter((x) => x.tamam).map((x) => x.metin) };
      },
    },
    {
      name: 'liste_isaretle',
      description: 'Listedeki öğeleri alındı/yapıldı işaretler (tamam:false geri açar).',
      parameters: { type: 'object', properties: { liste: { type: 'string' }, ogeler: { type: 'array', items: { type: 'string' } }, tamam: { type: 'boolean' } }, required: ['liste', 'ogeler'] },
      calistir: (a) =>
        store.guncelle('gorevler', VARSAYILAN, (t) => {
          const ad = Object.keys(t.listeler).find((k) => normal(k) === normal(a.liste));
          if (!ad) throw new Error(`"${a.liste}" listesi yok.`);
          const bulunamayan = [];
          for (const o of a.ogeler) {
            const x = t.listeler[ad].find((y) => normal(y.metin) === normal(o)) || t.listeler[ad].find((y) => normal(y.metin).includes(normal(o)));
            if (x) x.tamam = a.tamam !== false;
            else bulunamayan.push(o);
          }
          return { liste: ad, kalan: t.listeler[ad].filter((x) => !x.tamam).map((x) => x.metin), bulunamayan: bulunamayan.length ? bulunamayan : undefined };
        }),
    },
    {
      name: 'liste_temizle',
      description: 'Listeden tamamlananları (ya da tümünü) siler.',
      parameters: { type: 'object', properties: { liste: { type: 'string' }, hepsi: { type: 'boolean' } }, required: ['liste'] },
      calistir: (a) =>
        store.guncelle('gorevler', VARSAYILAN, (t) => {
          const ad = Object.keys(t.listeler).find((k) => normal(k) === normal(a.liste));
          if (!ad) throw new Error(`"${a.liste}" listesi yok.`);
          if (a.hepsi) delete t.listeler[ad];
          else t.listeler[ad] = t.listeler[ad].filter((x) => !x.tamam);
          return { temizlendi: ad };
        }),
    },
    {
      name: 'aliskanlik_ekle',
      description: 'Takip edilecek alışkanlık ekler (su içmek, spor, kitap...). İstenirse her gün o saatte hatırlatır.',
      parameters: {
        type: 'object',
        properties: { ad: { type: 'string' }, siklik: { type: 'string', enum: ['gunluk', 'haftalik'] }, haftalik_hedef: { type: 'number', description: 'haftalik ise haftada kaç kez' }, hatirlat_saat: { type: 'string', description: 'SS:DD' } },
        required: ['ad'],
      },
      calistir: (a, ctx) => {
        if (oku().aliskanliklar.some((x) => normal(x.ad) === normal(a.ad))) throw new Error('Bu alışkanlık zaten var.');
        const al = { id: store.yeniId('alis'), ad: String(a.ad).slice(0, 100), siklik: a.siklik || 'gunluk', hedef: a.haftalik_hedef || null, kayitlar: [], hatirlatmaId: null };
        if (a.hatirlat_saat) {
          let t = z.bugunSaat(a.hatirlat_saat);
          if (t < new Date()) t = new Date(t.getTime() + 864e5);
          al.hatirlatmaId = hat.ekle({ metin: `${al.ad} zamanı!`, zaman: t.toISOString(), tekrar: 'gunluk', ajan: ctx.ajan.id, kaynak: { tur: 'aliskanlik', id: al.id } }).id;
        }
        store.guncelle('gorevler', VARSAYILAN, (t) => t.aliskanliklar.push(al));
        return { eklendi: al.ad };
      },
    },
    {
      name: 'aliskanlik_isaretle',
      description: 'Alışkanlığı bugün (ya da verilen gün) yapıldı işaretler; seriyi döndürür. geri_al:true işareti kaldırır.',
      parameters: { type: 'object', properties: { ad: { type: 'string' }, tarih: { type: 'string', description: 'YYYY-MM-DD' }, geri_al: { type: 'boolean' } }, required: ['ad'] },
      calistir: (a) => {
        const al = aliskanlikBul(a.ad);
        const gun = a.tarih || z.gunAnahtari();
        const k = store.guncelle('gorevler', VARSAYILAN, (t) => {
          const x = t.aliskanliklar.find((y) => y.id === al.id);
          x.kayitlar = a.geri_al ? x.kayitlar.filter((d) => d !== gun) : [...new Set([...x.kayitlar, gun])].sort();
          return x.kayitlar;
        });
        return { ad: al.ad, seriGun: seri(k), buHafta: k.filter((d) => new Date(d) > new Date(Date.now() - 7 * 864e5)).length };
      },
    },
    {
      name: 'aliskanlik_durumu',
      description: 'Tüm alışkanlıkların serileri ve bu haftaki durumları.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({
        aliskanliklar: oku().aliskanliklar.map((a) => ({
          ad: a.ad,
          seriGun: seri(a.kayitlar),
          bugunYapildi: a.kayitlar.includes(z.gunAnahtari()),
          son7Gun: a.kayitlar.filter((d) => new Date(d) > new Date(Date.now() - 7 * 864e5)).length,
          haftalikHedef: a.hedef || undefined,
        })),
      }),
    },
    {
      name: 'aliskanlik_sil',
      description: 'Alışkanlığı ve hatırlatmasını siler.',
      parameters: { type: 'object', properties: { ad: { type: 'string' } }, required: ['ad'] },
      calistir: (a) => {
        const al = aliskanlikBul(a.ad);
        if (al.hatirlatmaId) hat.sil(al.hatirlatmaId);
        store.guncelle('gorevler', VARSAYILAN, (t) => (t.aliskanliklar = t.aliskanliklar.filter((x) => x.id !== al.id)));
        return { silindi: al.ad };
      },
    },
    {
      name: 'ozel_gun_ekle',
      description: 'Doğum günü, yıldönümü gibi her yıl tekrarlanan özel günü ekler; varsayılan 7 gün, 1 gün önce ve o gün sabah 9’da hatırlatır.',
      parameters: {
        type: 'object',
        properties: { kisi: { type: 'string' }, tur: { type: 'string', description: 'doğum günü, yıldönümü...' }, tarih: { type: 'string', description: 'MM-GG ya da YYYY-MM-GG (yıl verilirse yaş hesaplanır)' }, hatirlat_gun_once: { type: 'array', items: { type: 'number' } } },
        required: ['kisi', 'tur', 'tarih'],
      },
      calistir: (a) => {
        const d = sonrakiYillik(a.tarih);
        const yil = /^\d{4}-/.test(a.tarih) ? Number(a.tarih.slice(0, 4)) : null;
        if (oku().ozelGunler.some((g) => normal(g.kisi) === normal(a.kisi) && normal(g.tur) === normal(a.tur))) throw new Error('Bu özel gün zaten kayıtlı.');
        store.guncelle('gorevler', VARSAYILAN, (t) => t.ozelGunler.push({ id: store.yeniId('ozel'), kisi: a.kisi, tur: a.tur, tarih: a.tarih.slice(-5), yil, hatirlatGunOnce: a.hatirlat_gun_once || [7, 1, 0] }));
        senkronla();
        return { eklendi: `${a.kisi} ${a.tur}`, siradaki: z.okunur(d, { saat: false }) };
      },
    },
    {
      name: 'odeme_ekle',
      description: 'Düzenli ödeme ekler (kira, fatura, abonelik). Varsayılan 3 gün önce ve o gün hatırlatır.',
      parameters: {
        type: 'object',
        properties: { ad: { type: 'string' }, tutar: { type: 'string' }, gun: { type: 'number', description: 'Ayın kaçı (1-31)' }, siklik: { type: 'string', enum: ['aylik', 'yillik'] }, ay: { type: 'number', description: 'yillik ise ay (1-12)' }, hatirlat_gun_once: { type: 'array', items: { type: 'number' } } },
        required: ['ad', 'gun'],
      },
      calistir: (a) => {
        if (a.gun < 1 || a.gun > 31) throw new Error('gun 1-31 arası olmalı.');
        const o = { id: store.yeniId('odeme'), ad: a.ad, tutar: a.tutar || '', gun: a.gun, siklik: a.siklik || 'aylik', ay: a.ay || null, hatirlatGunOnce: a.hatirlat_gun_once || [3, 0] };
        store.guncelle('gorevler', VARSAYILAN, (t) => t.odemeler.push(o));
        senkronla();
        return { eklendi: o.ad, siradaki: z.okunur(sonrakiOdeme(o), { saat: false }) };
      },
    },
    {
      name: 'ozel_gunler_ve_odemeler',
      description: 'Kayıtlı özel günler ve ödemeler, sıradaki tarihleriyle.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({
        ozelGunler: oku().ozelGunler.map((g) => ({ id: g.id, kisi: g.kisi, tur: g.tur, siradaki: z.okunur(sonrakiYillik(g.tarih), { saat: false }) })),
        odemeler: oku().odemeler.map((o) => ({ id: o.id, ad: o.ad, tutar: o.tutar || undefined, siradaki: z.okunur(sonrakiOdeme(o), { saat: false }) })),
      }),
    },
    {
      name: 'ozel_gun_veya_odeme_sil',
      description: 'Özel günü ya da ödemeyi id ile siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) => {
        const tur = a.id.startsWith('odeme') ? 'odeme' : 'ozelgun';
        hat.kaynagaGoreSil(tur, a.id);
        return store.guncelle('gorevler', VARSAYILAN, (t) => {
          const once = t.ozelGunler.length + t.odemeler.length;
          t.ozelGunler = t.ozelGunler.filter((x) => x.id !== a.id);
          t.odemeler = t.odemeler.filter((x) => x.id !== a.id);
          return { silindi: once !== t.ozelGunler.length + t.odemeler.length };
        });
      },
    },
    {
      name: 'kacirilanlar',
      description: 'Kaçırılan/geciken her şey: geciken görevler, 3+ kez ertelenenler, kaçırılan hatırlatmalar, geciken ödevler, bugün yapılmayan alışkanlıklar.',
      parameters: { type: 'object', properties: {} },
      calistir: () => kacirilanlar(),
    },
    {
      name: 'hayat_ozeti',
      description: 'Kullanıcının genel durumu: bugün-yarın takvim, açık görevler, yaklaşan ödev/sınav, özel günler, ödemeler, bekleyen onaylar, kaçırılanlar.',
      parameters: { type: 'object', properties: {} },
      calistir: () => hayatOzeti(),
    },
    {
      name: 'haftalik_degerlendirme',
      description: 'Son 7 gün: tamamlanan görevler, en çok ertelenenler, alışkanlık başarı oranları.',
      parameters: { type: 'object', properties: {} },
      calistir: () => {
        const sinir = Date.now() - 7 * 864e5;
        const t = oku();
        return {
          tamamlanan: t.kayitlar.filter((g) => g.tamam && g.tamamlanma && new Date(g.tamamlanma).getTime() > sinir).map((g) => g.baslik),
          acikKalan: t.kayitlar.filter((g) => !g.tamam).length,
          enCokErtelenen: t.kayitlar.filter((g) => !g.tamam && g.ertelemeSayisi).sort((a, b) => b.ertelemeSayisi - a.ertelemeSayisi).slice(0, 3).map((g) => `${g.baslik} (${g.ertelemeSayisi} kez)`),
          aliskanliklar: t.aliskanliklar.map((a) => `${a.ad}: 7 günde ${a.kayitlar.filter((d) => new Date(d).getTime() > sinir).length}`),
        };
      },
    },
    {
      name: 'hizli_not',
      description: 'Kullanıcının aklına gelen bir şeyi soru sormadan not kutusuna atar (sonra ayıklanır).',
      parameters: { type: 'object', properties: { metin: { type: 'string' } }, required: ['metin'] },
      calistir: (a) => {
        const n = hizliNot(a.metin);
        return { kaydedildi: true, kutudakiToplam: n.toplam };
      },
    },
    {
      name: 'not_kutusu',
      description: 'Not kutusundaki ayıklanmamış notları listeler. Ayıklarken her notu uygun yere taşı (gorev_ekle, liste_ekle, hatirla, ekibe_gorev_ver...) sonra not_kutusundan_cikar ile kaldır.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({ notlar: oku().notKutusu.map((n) => ({ id: n.id, metin: n.metin, eklendi: z.okunur(n.tarih) })) }),
    },
    {
      name: 'not_kutusundan_cikar',
      description: 'Ayıklanan notları kutudan kaldırır.',
      parameters: { type: 'object', properties: { idler: { type: 'array', items: { type: 'string' } } }, required: ['idler'] },
      calistir: (a) =>
        store.guncelle('gorevler', VARSAYILAN, (t) => {
          const once = t.notKutusu.length;
          t.notKutusu = t.notKutusu.filter((n) => !(a.idler || []).includes(n.id));
          return { cikarilan: once - t.notKutusu.length, kalan: t.notKutusu.length };
        }),
    },
    {
      name: 'gunun_isi',
      description: 'Bugünün en önemli tek işini belirler (metin verilirse) ya da gösterir. Kullanıcı sabah söylediğinde kaydet.',
      parameters: { type: 'object', properties: { metin: { type: 'string' } } },
      calistir: (a, ctx) => {
        if (a.metin) {
          const g = gununIsiBelirle(a.metin);
          ctx.olay?.('gunun-isi', g);
          return { belirlendi: g.metin };
        }
        return gununIsi() || { belirlenmedi: true };
      },
    },
    {
      name: 'gunun_isi_tamamla',
      description: 'Bugünün tek önemli işini yapıldı olarak işaretler.',
      parameters: { type: 'object', properties: { geri_al: { type: 'boolean' } } },
      calistir: (a, ctx) => {
        const g = gununIsiTamamla(!a.geri_al);
        ctx.olay?.('gunun-isi', g);
        return { tamam: g.tamam };
      },
    },
  ],
};
