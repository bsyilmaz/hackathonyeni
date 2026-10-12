// Ders takibi araçları (Zeynep).
const store = require('../store');
const hat = require('../hatirlatmalar');
const z = require('../zaman');
const takvim = require('./takvim');

const VARSAYILAN = { dersler: [], odevler: [], sinavlar: [], notlar: [], calisma: [], aktifOturum: null, kartlar: [], aktifSinav: null };
const SINAV_ZAMAN_ASIMI_DK = 30;
const oku = () => store.oku('okul', VARSAYILAN);
const normal = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Ders adı/id ile bul. Kısmi eşleşme tekse kabul edilir.
function dersBul(ad, { zorunlu = false } = {}) {
  const l = oku().dersler;
  const n = normal(ad);
  const bulunan = l.find((d) => d.id === ad) || l.find((d) => normal(d.ad) === n) || (() => {
    const k = l.filter((d) => normal(d.ad).includes(n) || n.includes(normal(d.ad)));
    if (k.length > 1) throw new Error(`"${ad}" birden fazla derse uyuyor: ${k.map((d) => d.ad).join(', ')}. Hangisi olduğunu netleştir.`);
    return k[0];
  })();
  if (!bulunan && zorunlu) throw new Error(`"${ad}" adında ders yok. Kayıtlı dersler: ${l.map((d) => d.ad).join(', ') || 'yok'}.`);
  return bulunan;
}

function dersAdi(ad) {
  return dersBul(ad)?.ad || String(ad || '').trim().slice(0, 100);
}

function programEtkinlikleri(ders, ajanId) {
  const idler = [];
  for (const s of ders.program || []) {
    const gun = z.gunNumarasi(s.gun);
    const [bh, bm] = String(s.baslangic).split(':').map(Number);
    const [sh, sm] = String(s.bitis).split(':').map(Number);
    const ilk = new Date();
    ilk.setHours(bh, bm || 0, 0, 0);
    while (z.isoGun(ilk) !== gun || ilk < new Date()) ilk.setDate(ilk.getDate() + 1);
    const bitis = new Date(ilk);
    bitis.setHours(sh, sm || 0, 0, 0);
    const r = takvim.etkinlikEkle(
      {
        baslik: `${ders.ad} dersi`,
        baslangic: ilk.toISOString(),
        bitis: bitis.toISOString(),
        yer: s.yer || '',
        tekrar: { siklik: 'haftalik', gunler: [gun], bitis_tarihi: ders.donemBitis || undefined },
        hatirlat_dk_once: [15],
        etiket: 'ders',
      },
      ajanId
    );
    idler.push((r.eklendi || r.zatenVar).id);
  }
  return idler;
}

function programCoz(p) {
  return (p || []).map((s) => {
    if (!/^\d{1,2}:\d{2}$/.test(s.baslangic) || !/^\d{1,2}:\d{2}$/.test(s.bitis)) throw new Error('Program saatleri SS:DD olmalı.');
    return { gun: z.gunNumarasi(s.gun), baslangic: s.baslangic, bitis: s.bitis, yer: s.yer || '' };
  });
}

function odevHatirlatmalari(odev, ajanId) {
  hat.kaynagaGoreSil('odev', odev.id);
  const teslim = new Date(odev.teslim);
  for (const [dk, ne] of [
    [1440, '1 gün'],
    [180, '3 saat'],
  ]) {
    const zmn = new Date(teslim.getTime() - dk * 60_000);
    if (zmn > new Date()) hat.ekle({ metin: `${odev.ders} ödevinin teslimine ${ne} kaldı: ${odev.aciklama}`, zaman: zmn.toISOString(), ajan: ajanId, kaynak: { tur: 'odev', id: odev.id } });
  }
}

function sinavEtkinligi(s, ajanId) {
  const r = takvim.etkinlikEkle({ baslik: `${s.ders} ${s.tur || 'sınavı'}`.replace(/sınavı sınavı/, 'sınavı'), baslangic: s.tarih, sure_dk: s.sureDk || 90, yer: s.yer, not: s.konular, hatirlat_dk_once: [4320, 1440, 120], etiket: 'sinav', gecmis_onay: true }, ajanId);
  return (r.eklendi || r.zatenVar).id;
}

function ortalamaHesapla(dersAd, hedef) {
  const notlar = oku().notlar.filter((n) => !dersAd || normal(n.ders) === normal(dersAd));
  const gruplar = {};
  for (const n of notlar) (gruplar[n.ders] ||= []).push(n);
  const dersler = oku().dersler;
  const sonuc = Object.entries(gruplar).map(([ders, l]) => {
    const agirlikli = l.filter((n) => n.agirlik > 0);
    const yuzde = (n) => (n.puan / (n.maks || 100)) * 100;
    let ort;
    let kalanAgirlik = null;
    if (agirlikli.length) {
      const top = agirlikli.reduce((a, n) => a + n.agirlik, 0);
      ort = agirlikli.reduce((a, n) => a + yuzde(n) * n.agirlik, 0) / top;
      kalanAgirlik = Math.max(0, 100 - top);
    } else ort = l.reduce((a, n) => a + yuzde(n), 0) / l.length;
    const r = { ders, notlar: l.map((n) => `${n.ad}: ${n.puan}/${n.maks || 100}${n.agirlik ? ` (%${n.agirlik})` : ''}`), ortalama: Number(ort.toFixed(1)) };
    if (kalanAgirlik) {
      r.kalanAgirlikYuzde = kalanAgirlik;
      r.suankiKatki = Number(((ort * (100 - kalanAgirlik)) / 100).toFixed(1));
      if (hedef) r.hedefIcinKalanlardaGerekenOrtalama = Number(((hedef - r.suankiKatki) / (kalanAgirlik / 100)).toFixed(1));
    }
    return r;
  });
  const kredililer = sonuc.map((r) => ({ r, kredi: dersler.find((d) => normal(d.ad) === normal(r.ders))?.kredi })).filter((x) => x.kredi);
  const genel = kredililer.length ? Number((kredililer.reduce((a, x) => a + x.r.ortalama * x.kredi, 0) / kredililer.reduce((a, x) => a + x.kredi, 0)).toFixed(1)) : undefined;
  return { dersler: sonuc, krediAgirlikliGenelOrtalama: genel };
}

function calismaPlani(a, ajanId) {
  const o = oku();
  let hedefTarih;
  let ders;
  if (a.sinav_id) {
    const s = o.sinavlar.find((x) => x.id === a.sinav_id);
    if (!s) throw new Error('Sınav bulunamadı.');
    hedefTarih = new Date(s.tarih);
    ders = s.ders;
  } else {
    ders = dersAdi(a.ders);
    if (!ders) throw new Error('sinav_id ya da ders ver.');
    const s = o.sinavlar.filter((x) => normal(x.ders) === normal(ders) && new Date(x.tarih) > new Date()).sort((x, y) => x.tarih.localeCompare(y.tarih))[0];
    hedefTarih = a.son_tarih ? z.tarihCoz(a.son_tarih) : s ? new Date(s.tarih) : null;
    if (!hedefTarih) throw new Error(`${ders} için yaklaşan sınav yok; son_tarih ver.`);
  }
  const oturumDk = Math.min(180, Math.max(20, Number(a.oturum_dk) || 50));
  const gerekli = Math.ceil(((Number(a.toplam_saat) || 6) * 60) / oturumDk);
  const gunlukMaks = Math.max(1, Number(a.gunluk_en_fazla) || 2);
  const gunler = [];
  for (let d = z.gunBaslangici(z.gunAnahtari()); d < z.gunBaslangici(z.gunAnahtari(hedefTarih)); d = new Date(d.getTime() + 864e5)) gunler.push(new Date(d));
  if (!gunler.length) throw new Error('Sınava plan yapacak gün kalmamış.');
  // Gün başına aday aralıklar; sonra günlere sırayla dağıt (hepsi son güne yığılmasın).
  const adaylar = gunler.map((g) => takvim.bosZamanBul({ baslangic_tarih: z.gunAnahtari(g), gun_sayisi: 1, sure_dk: oturumDk, gun_baslangic: a.gun_baslangic || '10:00', gun_bitis: a.gun_bitis || '22:00', tampon_dk: 10, adet: gunlukMaks, parcala: true }));
  // Önce her güne bir oturum (eşit aralıklı), yetmezse günlerin ikinci, üçüncü... oturumları.
  const esitSec = (liste, n) => (n >= liste.length ? liste : Array.from({ length: n }, (_, i) => liste[Math.round((i * (liste.length - 1)) / Math.max(1, n - 1))]));
  const secilen = [];
  for (let tur = 0; tur < gunlukMaks && secilen.length < gerekli; tur++) {
    const katman = adaylar.map((l) => l[tur]).filter(Boolean);
    secilen.push(...esitSec(katman, gerekli - secilen.length));
  }
  const olusan = secilen
    .sort((x, y) => x.baslangic.localeCompare(y.baslangic))
    .map((s) => takvim.etkinlikEkle({ baslik: `${ders} çalışma`, baslangic: s.baslangic, sure_dk: oturumDk, hatirlat_dk_once: [10], etiket: 'calisma', not: a.konular || '' }, ajanId))
    .map((r) => (r.eklendi || r.zatenVar).okunur);
  return { ders, sinav: z.okunur(hedefTarih), olusturulanOturumlar: olusan, eksikOturum: Math.max(0, gerekli - olusan.length) || undefined };
}

// ---------------- Soru kartları ve aralıklı tekrar (SM-2) ----------------
// kalite: 0-5 (0 hiç bilemedi, 3 zorlanarak bildi, 5 kusursuz). 3 altı kart ertesi gün tekrar gelir.
function sm2(k, kalite, simdi = new Date()) {
  let { tekrar = 0, aralik = 0, ef = 2.5 } = k;
  if (kalite < 3) {
    tekrar = 0;
    aralik = 1;
  } else {
    tekrar += 1;
    aralik = tekrar === 1 ? 1 : tekrar === 2 ? 3 : Math.round(aralik * ef);
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - kalite) * (0.08 + (5 - kalite) * 0.02)));
  const sonraki = z.gunBaslangici(z.gunAnahtari(new Date(simdi.getTime() + aralik * 864e5)));
  sonraki.setHours(6, 0, 0, 0);
  return { tekrar, aralik, ef: Number(ef.toFixed(2)), sonraki: sonraki.toISOString() };
}

const vadesiGelenler = (ders, simdi = new Date()) => oku().kartlar.filter((k) => (!ders || normal(k.ders) === normal(ders)) && new Date(k.sonraki) <= simdi);

function aktifSinav() {
  const s = oku().aktifSinav;
  if (!s) return null;
  if (Date.now() - new Date(s.sonAktivite).getTime() > SINAV_ZAMAN_ASIMI_DK * 60_000) {
    store.guncelle('okul', VARSAYILAN, (o) => (o.aktifSinav = null));
    return null;
  }
  return s;
}

function sinavSorusu(s) {
  const k = oku().kartlar.find((x) => x.id === s.kuyruk[s.sira]);
  return k ? { kartId: k.id, no: s.sira + 1, toplam: s.kuyruk.length, ders: k.ders, soru: k.soru } : null;
}

// Zeynep'in her isteğine eklenen kısa bağlam (yerel, API yok).
function baglamEki() {
  const s = aktifSinav();
  if (!s) {
    const n = vadesiGelenler().length;
    return n ? `Bugün tekrar zamanı gelmiş ${n} soru kartı var.` : '';
  }
  const k = oku().kartlar.find((x) => x.id === s.kuyruk[s.sira]);
  if (!k) return '';
  return `AKTİF SÖZLÜ SINAV (${s.sira + 1}/${s.kuyruk.length}, ${s.dogru} doğru, ${s.yanlis} yanlış). Kullanıcının bu mesajı büyük ihtimalle şu soruya cevap:\nSoru: ${k.soru}\nDoğru cevap (değerlendirmek için; kullanıcı yanlış bilirse kısaca söyle): ${k.cevap}\nCevabı değerlendirip sinav_cevapla ile 0-5 puan ver, sonra sıradaki soruyu sor. Kullanıcı "bilmiyorum/pas" derse 0 ver. Sınavı bitirmek isterse sinav_bitir.`;
}

const PROGRAM_SEMA = {
  type: 'array',
  items: { type: 'object', properties: { gun: { type: 'string' }, baslangic: { type: 'string', description: 'SS:DD' }, bitis: { type: 'string' }, yer: { type: 'string' } }, required: ['gun', 'baslangic', 'bitis'] },
};

module.exports = {
  oku,
  dersBul,
  aktifSinav,
  vadesiGelenler,
  baglamEki,
  sm2,
  araclar: [
    {
      name: 'ders_ekle',
      description: 'Ders ekler. Haftalık program verilirse takvime tekrarlı etkinlik olarak işlenir (15 dk önce hatırlatır).',
      parameters: {
        type: 'object',
        properties: {
          ad: { type: 'string' },
          program: PROGRAM_SEMA,
          hoca: { type: 'string' },
          kredi: { type: 'number' },
          devamsizlik_siniri: { type: 'number', description: 'Saat cinsinden' },
          donem_bitis: { type: 'string', description: 'YYYY-MM-DD; program bu tarihte biter' },
        },
        required: ['ad'],
      },
      calistir: (a, ctx) => {
        if (dersBul(a.ad) && normal(dersBul(a.ad).ad) === normal(a.ad)) throw new Error(`${a.ad} zaten kayıtlı; değiştirmek için ders_guncelle kullan.`);
        const ders = { id: store.yeniId('ders'), ad: String(a.ad).trim().slice(0, 100), hoca: a.hoca || '', kredi: a.kredi || null, devamsizlikSiniri: a.devamsizlik_siniri || null, devamsizlik: 0, donemBitis: a.donem_bitis || null, program: programCoz(a.program) };
        ders.etkinlikIdleri = programEtkinlikleri(ders, ctx.ajan.id);
        store.guncelle('okul', VARSAYILAN, (o) => o.dersler.push(ders));
        return { eklendi: ders.ad, takvimeIslenenDersSaati: ders.etkinlikIdleri.length };
      },
    },
    {
      name: 'ders_guncelle',
      description: 'Ders bilgilerini değiştirir. Program değişirse takvim yeniden kurulur.',
      parameters: {
        type: 'object',
        properties: { ders: { type: 'string' }, yeni_ad: { type: 'string' }, program: PROGRAM_SEMA, hoca: { type: 'string' }, kredi: { type: 'number' }, devamsizlik_siniri: { type: 'number' }, donem_bitis: { type: 'string' } },
        required: ['ders'],
      },
      calistir: (a, ctx) => {
        const d = dersBul(a.ders, { zorunlu: true });
        const programDegisti = a.program || a.donem_bitis || a.yeni_ad;
        if (programDegisti) for (const id of d.etkinlikIdleri || []) takvim.etkinlikSil(id);
        const yeni = store.guncelle('okul', VARSAYILAN, (o) => {
          const x = o.dersler.find((y) => y.id === d.id);
          if (a.yeni_ad) x.ad = a.yeni_ad;
          if (a.program) x.program = programCoz(a.program);
          if (a.hoca !== undefined) x.hoca = a.hoca;
          if (a.kredi !== undefined) x.kredi = a.kredi;
          if (a.devamsizlik_siniri !== undefined) x.devamsizlikSiniri = a.devamsizlik_siniri;
          if (a.donem_bitis !== undefined) x.donemBitis = a.donem_bitis;
          return x;
        });
        if (programDegisti) {
          const idler = programEtkinlikleri(yeni, ctx.ajan.id);
          store.guncelle('okul', VARSAYILAN, (o) => (o.dersler.find((y) => y.id === d.id).etkinlikIdleri = idler));
        }
        return { guncellendi: yeni.ad };
      },
    },
    {
      name: 'ders_sil',
      description: 'Dersi ve takvimdeki ders saatlerini siler (ödev/sınav kayıtları kalır).',
      parameters: { type: 'object', properties: { ders: { type: 'string' } }, required: ['ders'] },
      calistir: (a) => {
        const d = dersBul(a.ders, { zorunlu: true });
        for (const id of d.etkinlikIdleri || []) takvim.etkinlikSil(id);
        store.guncelle('okul', VARSAYILAN, (o) => (o.dersler = o.dersler.filter((x) => x.id !== d.id)));
        return { silindi: d.ad };
      },
    },
    {
      name: 'odev_ekle',
      description: 'Ödev ekler; teslimden 1 gün ve 3 saat önce hatırlatır. Aynısı varsa eklemez.',
      parameters: {
        type: 'object',
        properties: { ders: { type: 'string' }, aciklama: { type: 'string' }, teslim: { type: 'string', description: 'ISO 8601' }, tahmini_sure_dk: { type: 'number' }, gecmis_onay: { type: 'boolean' } },
        required: ['ders', 'aciklama', 'teslim'],
      },
      calistir: (a, ctx) => {
        const teslim = z.tarihCoz(a.teslim, 'teslim');
        if (teslim < new Date() && !a.gecmis_onay) throw new Error(`Teslim tarihi (${z.okunur(teslim)}) geçmişte; doğru tarihi hesapla ya da kullanıcıya sor.`);
        const ders = dersAdi(a.ders);
        const ayni = oku().odevler.find((o) => normal(o.ders) === normal(ders) && normal(o.aciklama) === normal(a.aciklama) && Math.abs(new Date(o.teslim) - teslim) < 3600_000);
        if (ayni) return { zatenVar: { id: ayni.id, okunur: z.okunur(ayni.teslim) } };
        const odev = store.guncelle('okul', VARSAYILAN, (o) => {
          const x = { id: store.yeniId('odev'), ders, aciklama: String(a.aciklama).slice(0, 500), teslim: teslim.toISOString(), tahminiDk: a.tahmini_sure_dk || null, tamam: false };
          o.odevler.push(x);
          return x;
        });
        odevHatirlatmalari(odev, ctx.ajan.id);
        return { eklendi: { id: odev.id, ders, okunur: z.okunur(odev.teslim) }, dersKayitliDegil: dersBul(a.ders) ? undefined : true };
      },
    },
    {
      name: 'odev_guncelle',
      description: 'Ödevin açıklamasını veya teslim tarihini değiştirir.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, aciklama: { type: 'string' }, teslim: { type: 'string' } }, required: ['id'] },
      calistir: (a, ctx) => {
        const odev = store.guncelle('okul', VARSAYILAN, (o) => {
          const x = o.odevler.find((y) => y.id === a.id);
          if (!x) throw new Error('Ödev bulunamadı: ' + a.id);
          if (a.aciklama) x.aciklama = a.aciklama;
          if (a.teslim) x.teslim = z.tarihCoz(a.teslim, 'teslim').toISOString();
          return { ...x };
        });
        if (!odev.tamam) odevHatirlatmalari(odev, ctx.ajan.id);
        return { guncellendi: { ders: odev.ders, okunur: z.okunur(odev.teslim) } };
      },
    },
    {
      name: 'odev_tamamla',
      description: 'Ödevi tamamlandı işaretler (geri_al:true ile geri açar).',
      parameters: { type: 'object', properties: { id: { type: 'string' }, geri_al: { type: 'boolean' } }, required: ['id'] },
      calistir: (a, ctx) => {
        const odev = store.guncelle('okul', VARSAYILAN, (o) => {
          const x = o.odevler.find((d) => d.id === a.id);
          if (!x) throw new Error('Ödev bulunamadı: ' + a.id);
          x.tamam = !a.geri_al;
          x.tamamlanma = x.tamam ? new Date().toISOString() : null;
          return { ...x };
        });
        if (odev.tamam) hat.kaynagaGoreSil('odev', a.id);
        else odevHatirlatmalari(odev, ctx.ajan.id);
        return { tamam: odev.tamam, kalanAcikOdev: oku().odevler.filter((x) => !x.tamam).length };
      },
    },
    {
      name: 'odev_sil',
      description: 'Ödevi tamamen siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) => {
        hat.kaynagaGoreSil('odev', a.id);
        return store.guncelle('okul', VARSAYILAN, (o) => {
          const once = o.odevler.length;
          o.odevler = o.odevler.filter((x) => x.id !== a.id);
          return { silindi: once !== o.odevler.length };
        });
      },
    },
    {
      name: 'sinav_ekle',
      description: 'Sınav ekler; takvime işler ve 3 gün, 1 gün, 2 saat önce hatırlatır.',
      parameters: {
        type: 'object',
        properties: { ders: { type: 'string' }, tarih: { type: 'string', description: 'ISO 8601' }, tur: { type: 'string', description: 'vize, final, quiz...' }, konular: { type: 'string' }, yer: { type: 'string' }, sure_dk: { type: 'number' } },
        required: ['ders', 'tarih'],
      },
      calistir: (a, ctx) => {
        const t = z.tarihCoz(a.tarih, 'tarih');
        const ders = dersAdi(a.ders);
        const ayni = oku().sinavlar.find((s) => normal(s.ders) === normal(ders) && Math.abs(new Date(s.tarih) - t) < 3 * 3600_000);
        if (ayni) return { zatenVar: { id: ayni.id, okunur: z.okunur(ayni.tarih) } };
        const s = { id: store.yeniId('sinav'), ders, tur: a.tur || '', tarih: t.toISOString(), konular: a.konular || '', yer: a.yer || '', sureDk: a.sure_dk || 90 };
        s.etkinlikId = sinavEtkinligi(s, ctx.ajan.id);
        store.guncelle('okul', VARSAYILAN, (o) => o.sinavlar.push(s));
        return { eklendi: { id: s.id, ders, okunur: z.okunur(s.tarih) }, ipucu: 'İstersen calisma_plani_olustur ile boş saatlere çalışma planı kurabilirim.' };
      },
    },
    {
      name: 'sinav_guncelle',
      description: 'Sınavın tarihini/konularını/yerini değiştirir (takvim de güncellenir).',
      parameters: { type: 'object', properties: { id: { type: 'string' }, tarih: { type: 'string' }, konular: { type: 'string' }, yer: { type: 'string' }, tur: { type: 'string' } }, required: ['id'] },
      calistir: (a, ctx) => {
        const s = oku().sinavlar.find((x) => x.id === a.id);
        if (!s) throw new Error('Sınav bulunamadı: ' + a.id);
        takvim.etkinlikSil(s.etkinlikId);
        const yeni = { ...s, ...(a.tarih && { tarih: z.tarihCoz(a.tarih, 'tarih').toISOString() }), ...(a.konular !== undefined && { konular: a.konular }), ...(a.yer !== undefined && { yer: a.yer }), ...(a.tur !== undefined && { tur: a.tur }) };
        yeni.etkinlikId = sinavEtkinligi(yeni, ctx.ajan.id);
        store.guncelle('okul', VARSAYILAN, (o) => Object.assign(o.sinavlar.find((x) => x.id === a.id), yeni));
        return { guncellendi: { ders: yeni.ders, okunur: z.okunur(yeni.tarih) } };
      },
    },
    {
      name: 'sinav_sil',
      description: 'Sınavı ve takvim kaydını siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) => {
        const s = oku().sinavlar.find((x) => x.id === a.id);
        if (!s) throw new Error('Sınav bulunamadı: ' + a.id);
        takvim.etkinlikSil(s.etkinlikId);
        store.guncelle('okul', VARSAYILAN, (o) => (o.sinavlar = o.sinavlar.filter((x) => x.id !== a.id)));
        return { silindi: `${s.ders} ${s.tur || 'sınavı'}` };
      },
    },
    {
      name: 'not_gir',
      description: 'Bir sınav/ödev notunu kaydeder ve güncel ortalamayı döndürür. Aynı ad tekrar girilirse not güncellenir.',
      parameters: {
        type: 'object',
        properties: { ders: { type: 'string' }, ad: { type: 'string', description: 'Vize, Final, Quiz 1...' }, puan: { type: 'number' }, maks_puan: { type: 'number', description: 'Varsayılan 100' }, agirlik_yuzde: { type: 'number' } },
        required: ['ders', 'ad', 'puan'],
      },
      calistir: (a) => {
        const ders = dersAdi(a.ders);
        const maks = Number(a.maks_puan) || 100;
        if (a.puan < 0 || a.puan > maks) throw new Error(`Puan 0 ile ${maks} arasında olmalı.`);
        store.guncelle('okul', VARSAYILAN, (o) => {
          const var_ = o.notlar.find((n) => normal(n.ders) === normal(ders) && normal(n.ad) === normal(a.ad));
          const kayit = { ders, ad: a.ad, puan: a.puan, maks, agirlik: a.agirlik_yuzde || var_?.agirlik || 0, tarih: new Date().toISOString() };
          if (var_) Object.assign(var_, kayit);
          else o.notlar.push(kayit);
        });
        return ortalamaHesapla(ders);
      },
    },
    {
      name: 'ortalama',
      description: 'Ders(ler)in ağırlıklı ortalaması; hedef verilirse kalan sınavlarda gereken ortalamayı hesaplar.',
      parameters: { type: 'object', properties: { ders: { type: 'string' }, hedef: { type: 'number', description: 'Ulaşılmak istenen ortalama' } } },
      calistir: (a) => ortalamaHesapla(a.ders ? dersAdi(a.ders) : null, a.hedef),
    },
    {
      name: 'devamsizlik_ekle',
      description: 'Derse devamsızlık ekler (saat). Sınıra yaklaşınca uyarır. geri_al:true ile düşer.',
      parameters: { type: 'object', properties: { ders: { type: 'string' }, saat: { type: 'number' }, geri_al: { type: 'boolean' } }, required: ['ders'] },
      calistir: (a) => {
        const d = dersBul(a.ders, { zorunlu: true });
        const yeni = store.guncelle('okul', VARSAYILAN, (o) => {
          const x = o.dersler.find((y) => y.id === d.id);
          x.devamsizlik = Math.max(0, (x.devamsizlik || 0) + (a.geri_al ? -1 : 1) * (Number(a.saat) || 1));
          return x.devamsizlik;
        });
        const sinir = d.devamsizlikSiniri;
        return { ders: d.ad, devamsizlik: yeni, sinir: sinir || 'tanımlı değil', kalan: sinir ? sinir - yeni : undefined, uyari: sinir && yeni >= sinir ? 'SINIR AŞILDI' : sinir && yeni >= sinir * 0.8 ? 'Sınıra çok yakın' : undefined };
      },
    },
    {
      name: 'calisma_baslat',
      description: 'Çalışma kronometresini başlatır.',
      parameters: { type: 'object', properties: { ders: { type: 'string' }, konu: { type: 'string' } }, required: ['ders'] },
      calistir: (a) => {
        const aktif = oku().aktifOturum;
        if (aktif) return { zatenAktif: { ders: aktif.ders, baslangic: z.okunur(aktif.baslangic), gecenDk: Math.round((Date.now() - new Date(aktif.baslangic)) / 60_000) } };
        store.guncelle('okul', VARSAYILAN, (o) => (o.aktifOturum = { ders: dersAdi(a.ders), konu: a.konu || '', baslangic: new Date().toISOString() }));
        return { basladi: true };
      },
    },
    {
      name: 'calisma_bitir',
      description: 'Aktif çalışma oturumunu bitirip süreyi kaydeder.',
      parameters: { type: 'object', properties: { gercek_dakika: { type: 'number', description: 'Kullanıcı süreyi düzeltirse' } } },
      calistir: (a) => {
        const aktif = oku().aktifOturum;
        if (!aktif) return { aktifOturumYok: true };
        let dk = Math.round((Date.now() - new Date(aktif.baslangic)) / 60_000);
        const supheli = dk > 300 && !a.gercek_dakika;
        if (a.gercek_dakika) dk = Math.round(a.gercek_dakika);
        store.guncelle('okul', VARSAYILAN, (o) => {
          o.calisma.push({ ders: aktif.ders, dakika: supheli ? 0 : dk, konu: aktif.konu, tarih: new Date().toISOString() });
          o.aktifOturum = supheli ? aktif : null;
        });
        if (supheli) return { uyari: `Kronometre ${z.sureMetni(dk)}dir açık, unutulmuş olabilir. Gerçek süreyi sor ve gercek_dakika ile tekrar çağır.` };
        const bugun = oku().calisma.filter((c) => z.gunAnahtari(c.tarih) === z.gunAnahtari()).reduce((t, c) => t + c.dakika, 0);
        return { kaydedildi: { ders: aktif.ders, sure: z.sureMetni(dk) }, bugunToplam: z.sureMetni(bugun) };
      },
    },
    {
      name: 'calisma_kaydet',
      description: 'Geriye dönük çalışma süresi kaydeder.',
      parameters: { type: 'object', properties: { ders: { type: 'string' }, dakika: { type: 'number' }, konu: { type: 'string' }, tarih: { type: 'string' } }, required: ['ders', 'dakika'] },
      calistir: (a) =>
        store.guncelle('okul', VARSAYILAN, (o) => {
          o.calisma.push({ ders: dersAdi(a.ders), dakika: Math.max(0, Math.round(a.dakika)), konu: a.konu || '', tarih: a.tarih ? z.tarihCoz(a.tarih).toISOString() : new Date().toISOString() });
          return { kaydedildi: true };
        }),
    },
    {
      name: 'calisma_plani_olustur',
      description: 'Sınava kadar takvimdeki boş saatlere çalışma oturumları yerleştirir (günlere yayar, 10 dk önce hatırlatır).',
      parameters: {
        type: 'object',
        properties: {
          sinav_id: { type: 'string' },
          ders: { type: 'string' },
          son_tarih: { type: 'string' },
          toplam_saat: { type: 'number', description: 'Varsayılan 6' },
          oturum_dk: { type: 'number', description: 'Varsayılan 50' },
          gunluk_en_fazla: { type: 'number', description: 'Günde en fazla kaç oturum (varsayılan 2)' },
          gun_baslangic: { type: 'string' },
          gun_bitis: { type: 'string' },
          konular: { type: 'string' },
        },
      },
      calistir: (a, ctx) => calismaPlani(a, ctx.ajan.id),
    },
    {
      name: 'ders_durumu',
      description: 'Dersler, açık ödevler, yaklaşan sınavlar, devamsızlıklar, aktif çalışma.',
      parameters: { type: 'object', properties: {} },
      calistir: () => {
        const o = oku();
        const simdi = Date.now();
        return {
          dersler: o.dersler.map((d) => ({ ad: d.ad, devamsizlik: d.devamsizlikSiniri ? `${d.devamsizlik}/${d.devamsizlikSiniri}` : undefined })),
          acikOdevler: o.odevler.filter((x) => !x.tamam).sort((x, y) => x.teslim.localeCompare(y.teslim)).slice(0, 15).map((x) => ({ id: x.id, ders: x.ders, aciklama: x.aciklama, okunur: z.okunur(x.teslim), gecikti: new Date(x.teslim) < simdi || undefined })),
          yaklasanSinavlar: o.sinavlar.filter((s) => new Date(s.tarih) > simdi).sort((x, y) => x.tarih.localeCompare(y.tarih)).slice(0, 10).map((s) => ({ id: s.id, ders: s.ders, tur: s.tur || undefined, okunur: z.okunur(s.tarih), kalanGun: Math.ceil((new Date(s.tarih) - simdi) / 864e5) })),
          aktifCalisma: o.aktifOturum ? { ders: o.aktifOturum.ders, gecenDk: Math.round((simdi - new Date(o.aktifOturum.baslangic)) / 60_000) } : undefined,
        };
      },
    },
    {
      name: 'haftalik_rapor',
      description: 'Son 7 günün ders bazında çalışma süreleri (önceki haftayla kıyas), tamamlanan ve geciken ödevler.',
      parameters: { type: 'object', properties: {} },
      calistir: () => {
        const o = oku();
        const simdi = Date.now();
        const topla = (b, s) => {
          const r = {};
          for (const c of o.calisma) {
            const t = new Date(c.tarih).getTime();
            if (t > b && t <= s) r[c.ders] = (r[c.ders] || 0) + c.dakika;
          }
          return r;
        };
        return {
          buHaftaDk: topla(simdi - 7 * 864e5, simdi),
          gecenHaftaDk: topla(simdi - 14 * 864e5, simdi - 7 * 864e5),
          tamamlananOdev: o.odevler.filter((x) => x.tamam && x.tamamlanma && new Date(x.tamamlanma).getTime() > simdi - 7 * 864e5).length,
          gecikenOdev: o.odevler.filter((x) => !x.tamam && new Date(x.teslim).getTime() < simdi).map((x) => `${x.ders}: ${x.aciklama}`),
        };
      },
    },
    {
      name: 'kart_ekle',
      description: 'Ders için soru-cevap kartları ekler (aralıklı tekrar için). Kartları ders notundan/belgeden sen üret: kısa, tek bilgiyi soran sorular; cevaplar 1-2 cümle.',
      parameters: {
        type: 'object',
        properties: {
          ders: { type: 'string' },
          kartlar: { type: 'array', items: { type: 'object', properties: { soru: { type: 'string' }, cevap: { type: 'string' } }, required: ['soru', 'cevap'] } },
          kaynak: { type: 'string', description: 'Örn. belge adı ya da konu' },
        },
        required: ['ders', 'kartlar'],
      },
      calistir: (a) => {
        const ders = dersAdi(a.ders);
        const simdi = new Date().toISOString();
        return store.guncelle('okul', VARSAYILAN, (o) => {
          let eklenen = 0;
          for (const k of (a.kartlar || []).slice(0, 60)) {
            const soru = String(k.soru || '').trim().slice(0, 400);
            const cevap = String(k.cevap || '').trim().slice(0, 600);
            if (!soru || !cevap) continue;
            if (o.kartlar.some((x) => normal(x.ders) === normal(ders) && normal(x.soru) === normal(soru))) continue;
            o.kartlar.push({ id: store.yeniId('kart'), ders, soru, cevap, kaynak: a.kaynak || '', tekrar: 0, aralik: 0, ef: 2.5, sonraki: simdi, gecmis: [] });
            eklenen++;
          }
          return { eklenen, dersteToplam: o.kartlar.filter((x) => normal(x.ders) === normal(ders)).length };
        });
      },
    },
    {
      name: 'kartlar',
      description: 'Ders bazında kart sayıları, bugün tekrar zamanı gelenler ve zayıf kartlar.',
      parameters: { type: 'object', properties: { ders: { type: 'string' } } },
      calistir: (a) => {
        const l = oku().kartlar.filter((k) => !a.ders || normal(k.ders) === normal(dersAdi(a.ders)));
        const gruplar = {};
        for (const k of l) {
          const g = (gruplar[k.ders] ||= { toplam: 0, vadesiGelen: 0, ogrenilmis: 0 });
          g.toplam++;
          if (new Date(k.sonraki) <= new Date()) g.vadesiGelen++;
          if (k.aralik >= 7) g.ogrenilmis++;
        }
        const zayif = l.filter((k) => k.gecmis.length >= 2 && k.ef < 2).slice(0, 5).map((k) => ({ id: k.id, soru: k.soru }));
        return { dersler: gruplar, zayifKartlar: zayif };
      },
    },
    {
      name: 'kart_sil',
      description: 'Bir kartı siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) =>
        store.guncelle('okul', VARSAYILAN, (o) => {
          const once = o.kartlar.length;
          o.kartlar = o.kartlar.filter((k) => k.id !== a.id);
          return { silindi: once !== o.kartlar.length };
        }),
    },
    {
      name: 'sinav_baslat',
      description: 'Sözlü sınav başlatır: önce tekrar zamanı gelen kartlar, sonra (gerekirse) diğerleri. İlk soruyu döndürür; soruyu kullanıcıya sesli sor. Sınav sürerken kullanıcının cevapları otomatik sana gelir.',
      parameters: { type: 'object', properties: { ders: { type: 'string' }, adet: { type: 'number', description: 'Varsayılan 8' }, sadece_vadesi_gelen: { type: 'boolean' } } },
      calistir: (a) => {
        const ders = a.ders ? dersAdi(a.ders) : null;
        const adet = Math.min(30, Math.max(1, Number(a.adet) || 8));
        const vade = vadesiGelenler(ders).sort((x, y) => x.sonraki.localeCompare(y.sonraki));
        let secilen = vade.slice(0, adet);
        if (secilen.length < adet && !a.sadece_vadesi_gelen) {
          const digerleri = oku()
            .kartlar.filter((k) => (!ders || normal(k.ders) === normal(ders)) && !secilen.includes(k))
            .sort((x, y) => x.ef - y.ef);
          secilen = [...secilen, ...digerleri.slice(0, adet - secilen.length)];
        }
        if (!secilen.length) return { kartYok: true, bilgi: ders ? `${ders} için kart yok; önce notlardan kart üret.` : 'Hiç kart yok.' };
        const s = { ders, kuyruk: secilen.map((k) => k.id), sira: 0, dogru: 0, yanlis: 0, baslangic: new Date().toISOString(), sonAktivite: new Date().toISOString() };
        store.guncelle('okul', VARSAYILAN, (o) => (o.aktifSinav = s));
        return { basladi: true, ilkSoru: sinavSorusu(s) };
      },
    },
    {
      name: 'sinav_cevapla',
      description: 'Aktif sınavda kullanıcının cevabını puanlar (0-5) ve sıradaki soruyu döndürür. Bittiyse özet döner.',
      parameters: { type: 'object', properties: { kalite: { type: 'number', description: '0 bilemedi, 1-2 yanlış ama yakın, 3 zorlanarak doğru, 4 doğru, 5 kusursuz' }, kullanici_cevabi: { type: 'string' } }, required: ['kalite'] },
      calistir: (a) => {
        const s = aktifSinav();
        if (!s) return { aktifSinavYok: true };
        const kalite = Math.max(0, Math.min(5, Math.round(Number(a.kalite) || 0)));
        const kartId = s.kuyruk[s.sira];
        const sonuc = store.guncelle('okul', VARSAYILAN, (o) => {
          const k = o.kartlar.find((x) => x.id === kartId);
          if (k) {
            Object.assign(k, sm2(k, kalite));
            k.gecmis = [...(k.gecmis || []), { tarih: new Date().toISOString(), kalite }].slice(-20);
          }
          const x = o.aktifSinav;
          x.sira++;
          kalite >= 3 ? x.dogru++ : x.yanlis++;
          x.sonAktivite = new Date().toISOString();
          if (x.sira >= x.kuyruk.length) {
            o.aktifSinav = null;
            const sure = Math.round((Date.now() - new Date(x.baslangic)) / 60_000);
            o.calisma.push({ ders: x.ders || 'Tekrar', dakika: sure, konu: 'sözlü sınav', tarih: new Date().toISOString() });
            return { bitti: true, ozet: { dogru: x.dogru, yanlis: x.yanlis, toplam: x.kuyruk.length, sureDk: sure } };
          }
          return { siradaki: null, x: { ...x } };
        });
        const k = oku().kartlar.find((x) => x.id === kartId);
        if (sonuc.bitti) return { dogruCevapti: k?.cevap, sonrakiTekrar: k && z.okunur(k.sonraki, { saat: false }), ...sonuc };
        return { dogruCevapti: k?.cevap, sonrakiTekrar: k && z.okunur(k.sonraki, { saat: false }), siradaki: sinavSorusu(sonuc.x) };
      },
    },
    {
      name: 'sinav_bitir',
      description: 'Aktif sözlü sınavı erkenden bitirir ve özet verir.',
      parameters: { type: 'object', properties: {} },
      calistir: () => {
        const s = aktifSinav();
        store.guncelle('okul', VARSAYILAN, (o) => (o.aktifSinav = null));
        return s ? { bitti: true, dogru: s.dogru, yanlis: s.yanlis, cevaplanan: s.sira, toplam: s.kuyruk.length } : { aktifSinavYok: true };
      },
    },
  ],
};
