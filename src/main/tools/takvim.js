// Takvim ve hatırlatma araçları (Elif başta olmak üzere).
const fs = require('fs');
const path = require('path');
const store = require('../store');
const hat = require('../hatirlatmalar');
const ics = require('../ics');
const z = require('../zaman');

const VARSAYILAN = { etkinlikler: [], abonelikler: [] };
const oku = () => store.oku('takvim', VARSAYILAN);

const normal = (s) => String(s || '').toLocaleLowerCase('tr').replace(/\s+/g, ' ').trim();

function tekrarCoz(t) {
  if (!t) return null;
  if (typeof t === 'string') t = { siklik: t };
  if (!z.SIKLIKLAR.includes(t.siklik)) throw new Error(`tekrar.siklik şunlardan biri olmalı: ${z.SIKLIKLAR.join(', ')}`);
  const k = { siklik: t.siklik, aralik: Math.max(1, Number(t.aralik) || 1) };
  if (t.gunler?.length) k.gunler = t.gunler.map(z.gunNumarasi);
  if (t.bitis_tarihi || t.bitis) k.bitis = z.tarihCoz(t.bitis_tarihi || t.bitis, 'tekrar bitiş tarihi').toISOString();
  if (t.adet) k.adet = Math.max(1, Number(t.adet));
  return k;
}

// Tüm etkinlikler (yerel + abone olunan takvimler).
function tumKaynak() {
  const t = oku();
  const abone = t.abonelikler.flatMap((a) => a.etkinlikler.map((e) => ({ ...e, id: `${a.id}:${e.uid}`, abone: a.ad, hatirlat: a.hatirlat })));
  return [...t.etkinlikler, ...abone];
}

// [bas, son] aralığına düşen tüm örnekler (tekrarlar açılmış halde).
function ornekleriGetir(bas, son, kaynak = tumKaynak()) {
  const liste = [];
  for (const e of kaynak) {
    const sure = new Date(e.bitis) - new Date(e.baslangic);
    if (!e.tekrar) {
      if (new Date(e.bitis) > bas && new Date(e.baslangic) <= son) liste.push({ e, baslangic: new Date(e.baslangic), bitis: new Date(e.bitis) });
      continue;
    }
    const ist = new Set((e.istisnalar || []).map((x) => Math.round(new Date(x).getTime() / 60_000)));
    const bitis = e.tekrar.bitis ? new Date(e.tekrar.bitis) : null;
    for (const d of z.ornekler(new Date(e.baslangic), e.tekrar, new Date(bas.getTime() - sure), son, { bitis, adet: e.tekrar.adet })) {
      if (ist.has(Math.round(d.getTime() / 60_000))) continue;
      liste.push({ e, baslangic: d, bitis: new Date(d.getTime() + sure) });
    }
  }
  return liste.sort((a, b) => a.baslangic - b.baslangic);
}

function gorunum(o) {
  const { e } = o;
  const ayniGun = z.gunAnahtari(o.baslangic) === z.gunAnahtari(new Date(o.bitis.getTime() - 1));
  const r = { id: e.id, baslik: e.baslik, baslangic: e.tumGun ? z.gunAnahtari(o.baslangic) : z.yerelIso(o.baslangic), okunur: z.okunur(o.baslangic, { saat: !e.tumGun }) };
  if (e.tumGun) r.tumGun = true;
  else r.bitis = ayniGun ? z.yerelIso(o.bitis).slice(11, 16) : z.yerelIso(o.bitis);
  if (e.yer) r.yer = e.yer;
  if (e.not) r.not = e.not.slice(0, 120);
  if (e.tekrar) r.tekrar = e.tekrar.siklik;
  if (e.abone) r.kaynak = `${e.abone} (salt okunur)`;
  return r;
}

function cakisanlar(bas, bit, haricId) {
  return ornekleriGetir(bas, bit)
    .filter((o) => o.e.id !== haricId && !o.e.tumGun && o.baslangic < bit && o.bitis > bas)
    .slice(0, 3)
    .map(gorunum);
}

function zamanlariCoz(a, mevcut = null) {
  let bas = a.baslangic ? (a.tum_gun ? z.gunBaslangici(a.baslangic) : z.tarihCoz(a.baslangic, 'baslangic')) : mevcut && new Date(mevcut.baslangic);
  const tumGun = a.tum_gun ?? mevcut?.tumGun ?? false;
  if (tumGun) bas = z.gunBaslangici(z.gunAnahtari(bas));
  let bit;
  if (a.bitis) bit = tumGun ? new Date(z.gunBaslangici(a.bitis).getTime() + 864e5) : z.tarihCoz(a.bitis, 'bitis');
  else if (a.sure_dk) bit = new Date(bas.getTime() + a.sure_dk * 60_000);
  else if (mevcut) bit = new Date(bas.getTime() + (new Date(mevcut.bitis) - new Date(mevcut.baslangic)));
  else bit = new Date(bas.getTime() + (tumGun ? 864e5 : 3600_000));
  if (bit <= bas) throw new Error('Bitiş başlangıçtan sonra olmalı.');
  return { bas, bit, tumGun };
}

function gecmisKontrol(bas, a) {
  if (bas < new Date(Date.now() - 5 * 60_000) && !a.gecmis_onay) {
    throw new Error(`${z.okunur(bas)} geçmişte kaldı. Kullanıcı bir sonraki günü/haftayı kastetmiş olabilir; emin değilsen sor. Gerçekten geçmişe eklenecekse gecmis_onay:true ver.`);
  }
}

function etkinlikEkle(a, ajanId) {
  if (!String(a.baslik || '').trim()) throw new Error('Başlık gerekli.');
  const { bas, bit, tumGun } = zamanlariCoz(a);
  gecmisKontrol(bas, a);
  const tekrar = tekrarCoz(a.tekrar);
  const ayni = !a._tekrarKopyasi && oku().etkinlikler.find((e) => normal(e.baslik) === normal(a.baslik) && Math.abs(new Date(e.baslangic) - bas) < 10 * 60_000);
  if (ayni) return { zatenVar: gorunum({ e: ayni, baslangic: new Date(ayni.baslangic), bitis: new Date(ayni.bitis) }), bilgi: 'Aynı etkinlik zaten kayıtlı, tekrar eklenmedi.' };
  const etk = store.guncelle('takvim', VARSAYILAN, (t) => {
    const e = {
      id: store.yeniId('etk'),
      baslik: String(a.baslik).trim().slice(0, 200),
      baslangic: bas.toISOString(),
      bitis: bit.toISOString(),
      tumGun,
      yer: a.yer || '',
      not: a.not || '',
      tekrar,
      istisnalar: [],
      hatirlat: a.hatirlat_dk_once ?? (tumGun ? [] : [30]),
      ekleyen: ajanId,
      etiket: a.etiket || '',
    };
    t.etkinlikler.push(e);
    return e;
  });
  senkronla();
  return { eklendi: gorunum({ e: etk, baslangic: bas, bitis: bit }), cakisanlar: tumGun ? [] : cakisanlar(bas, bit, etk.id) };
}

function yerelBul(id) {
  const e = oku().etkinlikler.find((x) => x.id === id);
  if (!e) {
    if (String(id).includes(':')) throw new Error('Bu etkinlik abone olunan bir takvimden geliyor, buradan değiştirilemez (salt okunur).');
    throw new Error('Etkinlik bulunamadı: ' + id + '. Önce etkinlikleri_listele ile doğru id’yi bul.');
  }
  return e;
}

function etkinlikGuncelle(a, ajanId) {
  const e = yerelBul(a.id);
  if (e.tekrar && a.sadece_bu_tarih) {
    // Tekrarlı etkinliğin tek bir örneğini değiştir: o örneği atla, değişmiş kopyasını ekle.
    const ornek = z.tarihCoz(a.sadece_bu_tarih, 'sadece_bu_tarih');
    const sure = new Date(e.bitis) - new Date(e.baslangic);
    store.guncelle('takvim', VARSAYILAN, (t) => t.etkinlikler.find((x) => x.id === e.id).istisnalar.push(ornek.toISOString()));
    hat.kaynagaGoreSil('etkinlik', e.id);
    return etkinlikEkle(
      {
        baslik: a.baslik ?? e.baslik,
        baslangic: a.baslangic ?? ornek.toISOString(),
        bitis: a.bitis ?? (a.baslangic ? undefined : new Date(ornek.getTime() + sure).toISOString()),
        sure_dk: a.baslangic && !a.bitis ? sure / 60_000 : undefined,
        yer: a.yer ?? e.yer,
        not: a.not ?? e.not,
        hatirlat_dk_once: a.hatirlat_dk_once ?? e.hatirlat,
        gecmis_onay: a.gecmis_onay,
        _tekrarKopyasi: true,
      },
      ajanId
    );
  }
  const { bas, bit, tumGun } = zamanlariCoz(a, e);
  if (a.baslangic) gecmisKontrol(bas, a);
  const yeni = store.guncelle('takvim', VARSAYILAN, (t) => {
    const x = t.etkinlikler.find((y) => y.id === a.id);
    Object.assign(x, { baslangic: bas.toISOString(), bitis: bit.toISOString(), tumGun });
    for (const k of ['baslik', 'yer', 'not', 'etiket']) if (a[k] !== undefined) x[k] = a[k];
    if (a.hatirlat_dk_once) x.hatirlat = a.hatirlat_dk_once;
    if (a.tekrar !== undefined) x.tekrar = a.tekrar ? tekrarCoz(a.tekrar) : null;
    return { ...x };
  });
  hat.kaynagaGoreSil('etkinlik', e.id);
  senkronla();
  return { guncellendi: gorunum({ e: yeni, baslangic: bas, bitis: bit }), cakisanlar: tumGun ? [] : cakisanlar(bas, bit, e.id) };
}

function etkinlikSil(a) {
  const e = yerelBul(a.id);
  if (e.tekrar && a.sadece_bu_tarih) {
    const ornek = z.tarihCoz(a.sadece_bu_tarih, 'sadece_bu_tarih');
    store.guncelle('takvim', VARSAYILAN, (t) => t.etkinlikler.find((x) => x.id === e.id).istisnalar.push(ornek.toISOString()));
    hat.kaynagaGoreSil('etkinlik', e.id);
    senkronla();
    return { silindi: `${e.baslik}, sadece ${z.okunur(ornek)}` };
  }
  store.guncelle('takvim', VARSAYILAN, (t) => {
    t.etkinlikler = t.etkinlikler.filter((x) => x.id !== e.id);
  });
  hat.kaynagaGoreSil('etkinlik', e.id);
  return { silindi: e.baslik + (e.tekrar ? ' (tüm tekrarlarıyla)' : '') };
}

// Önümüzdeki 3 günün etkinlik hatırlatmalarını kurar (tekrarlılar dahil). Zamanlayıcı her turda çağırır.
function senkronla(simdi = new Date()) {
  for (const o of ornekleriGetir(simdi, new Date(simdi.getTime() + 3 * 864e5))) {
    for (const dk of o.e.hatirlat || []) {
      const zaman = new Date(o.baslangic.getTime() - dk * 60_000);
      const ne = dk === 0 ? 'şimdi başlıyor' : `${z.sureMetni(dk)} sonra başlıyor`;
      hat.senkronEkle(`etk:${o.e.id}:${o.baslangic.toISOString()}:${dk}`, {
        metin: `${o.e.baslik} ${ne}${o.e.yer ? `, yer: ${o.e.yer}` : ''}.`,
        zaman: zaman.toISOString(),
        ajan: o.e.ekleyen || 'elif',
        kaynak: { tur: 'etkinlik', id: o.e.id },
      });
    }
  }
}

function bosZamanBul(a) {
  const sure = Math.max(5, Number(a.sure_dk) || 60) * 60_000;
  const tampon = Math.max(0, Number(a.tampon_dk) || 0) * 60_000;
  const gunSayisi = Math.min(31, Math.max(1, Number(a.gun_sayisi) || 1));
  const adet = Math.min(20, Math.max(1, Number(a.adet) || 6));
  const ilkGun = a.baslangic_tarih ? z.gunBaslangici(a.baslangic_tarih) : z.gunBaslangici(z.gunAnahtari());
  const [bh, bm] = String(a.gun_baslangic || '09:00').split(':').map(Number);
  const [sh, sm] = String(a.gun_bitis || '23:00').split(':').map(Number);
  const sonuc = [];
  // parcala: boşluğu "sure" uzunluğunda ardışık oturumlara böl (çalışma planı için).
  const ekle = (b, s) => {
    if (!a.parcala) return sonuc.push({ baslangic: z.yerelIso(b), bitis: z.yerelIso(s), okunur: z.okunur(b) });
    for (let t = b.getTime(); s - t >= sure && sonuc.length < adet; t += sure + Math.max(tampon, 10 * 60_000)) {
      sonuc.push({ baslangic: z.yerelIso(new Date(t)), bitis: z.yerelIso(new Date(t + sure)), okunur: z.okunur(new Date(t)) });
    }
  };
  for (let g = 0; g < gunSayisi && sonuc.length < adet; g++) {
    const gun = new Date(ilkGun.getTime() + g * 864e5);
    let imlec = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate(), bh, bm || 0);
    const son = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate(), sh, sm || 0);
    const simdi = new Date(Math.ceil(Date.now() / 900_000) * 900_000);
    if (imlec < simdi) imlec = simdi;
    for (const o of ornekleriGetir(imlec, son).filter((x) => !x.e.tumGun)) {
      const ob = new Date(o.baslangic.getTime() - tampon);
      if (ob - imlec >= sure) ekle(imlec, ob);
      const obit = new Date(o.bitis.getTime() + tampon);
      if (obit > imlec) imlec = obit;
      if (sonuc.length >= adet) break;
    }
    if (son - imlec >= sure && sonuc.length < adet) ekle(imlec, son);
  }
  return sonuc;
}

async function aboneliktenCek(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!r.ok) throw new Error(`Takvim adresi açılamadı (HTTP ${r.status}).`);
  const metin = await r.text();
  if (metin.length > 8_000_000) throw new Error('Takvim dosyası çok büyük.');
  if (!metin.includes('BEGIN:VCALENDAR')) throw new Error('Bu adres bir takvim (.ics) dosyası döndürmüyor. Google Takvim’de "iCal biçimindeki gizli adres"i kullan.');
  return ics.coz(metin);
}

async function aboneleriYenile() {
  for (const a of oku().abonelikler) {
    try {
      const etkinlikler = await aboneliktenCek(a.url);
      store.guncelle('takvim', VARSAYILAN, (t) => {
        const x = t.abonelikler.find((y) => y.id === a.id);
        if (x) Object.assign(x, { etkinlikler, sonGuncelleme: new Date().toISOString(), hata: null });
      });
    } catch (e) {
      store.guncelle('takvim', VARSAYILAN, (t) => {
        const x = t.abonelikler.find((y) => y.id === a.id);
        if (x) x.hata = e.message;
      });
    }
  }
}

// ---------------- "Haftamı planla": işleri boş saatlere yerleştir ----------------
// Açık görevler, ödevler ve hazırlığı yapılmamış sınavlar son tarihe göre sıralanır; her biri tahmini
// süresi kadar bloğa bölünüp son tarihinden ÖNCEKİ boş saatlere yerleştirilir. Önce taslak üretilir,
// kullanıcı onaylayınca plani_uygula ile takvime yazılır.
function haftaPlani(a) {
  const gunSayisi = Math.min(14, Math.max(1, Number(a.gun_sayisi) || 7));
  const blokDk = Math.min(180, Math.max(25, Number(a.blok_dk) || 60));
  const gunlukMaks = Math.min(8, Math.max(1, Number(a.gunluk_en_fazla_blok) || 3));
  const ufuk = new Date(z.gunBaslangici(z.gunAnahtari()).getTime() + gunSayisi * 864e5);
  const planliKaynaklar = new Set(
    ornekleriGetir(new Date(), ufuk)
      .filter((o) => o.e.etiket === 'plan' && o.e.kaynak)
      .map((o) => `${o.e.kaynak.tur}:${o.e.kaynak.id}`)
  );
  const isler = [];
  const sira = { yuksek: 0, orta: 1, dusuk: 2 };
  for (const g of store.oku('gorevler', { kayitlar: [] }).kayitlar) {
    if (g.tamam || planliKaynaklar.has(`gorev:${g.id}`)) continue;
    const son = g.sonTarih ? new Date(g.sonTarih) : ufuk;
    if (son < new Date()) continue;
    isler.push({ baslik: g.baslik, sureDk: g.tahminiDk || 60, son, oncelik: sira[g.oncelik] ?? 1, kaynak: { tur: 'gorev', id: g.id } });
  }
  const okul = store.oku('okul', { odevler: [], sinavlar: [] });
  for (const o of okul.odevler) {
    if (o.tamam || planliKaynaklar.has(`odev:${o.id}`) || new Date(o.teslim) < new Date()) continue;
    isler.push({ baslik: `${o.ders} ödevi: ${o.aciklama}`.slice(0, 80), sureDk: o.tahminiDk || 120, son: new Date(new Date(o.teslim).getTime() - 2 * 3600_000), oncelik: 0, kaynak: { tur: 'odev', id: o.id } });
  }
  for (const x of okul.sinavlar) {
    const t = new Date(x.tarih);
    if (t < new Date() || t > new Date(ufuk.getTime() + 7 * 864e5) || planliKaynaklar.has(`sinav:${x.id}`)) continue;
    const calisildi = ornekleriGetir(new Date(), t).some((o) => o.e.etiket === 'calisma' && o.e.baslik.toLocaleLowerCase('tr').includes(x.ders.toLocaleLowerCase('tr')));
    if (!calisildi) isler.push({ baslik: `${x.ders} sınavına çalışma`, sureDk: 180, son: new Date(z.gunBaslangici(z.gunAnahtari(t)).getTime()), oncelik: 0, kaynak: { tur: 'sinav', id: x.id } });
  }
  isler.sort((p, q) => p.son - q.son || p.oncelik - q.oncelik);

  // Gün gün boş bloklar (günlük sınır kadar).
  const bloklar = [];
  for (let g = 0; g < gunSayisi; g++) {
    const gun = z.gunAnahtari(new Date(z.gunBaslangici(z.gunAnahtari()).getTime() + g * 864e5));
    for (const b of bosZamanBul({ baslangic_tarih: gun, gun_sayisi: 1, sure_dk: blokDk, gun_baslangic: a.gun_baslangic || '10:00', gun_bitis: a.gun_bitis || '22:00', tampon_dk: 10, adet: gunlukMaks, parcala: true })) {
      bloklar.push({ ...b, bas: new Date(b.baslangic), dolu: false });
    }
  }
  const plan = [];
  const yerlesmeyen = [];
  for (const is of isler) {
    let gerekli = Math.ceil(is.sureDk / blokDk);
    const adaylar = bloklar.filter((b) => !b.dolu && new Date(b.bitis) <= is.son);
    const ayrilan = adaylar.slice(0, gerekli);
    for (const [i, b] of ayrilan.entries()) {
      b.dolu = true;
      plan.push({ baslik: gerekli > 1 ? `${is.baslik} (${i + 1}/${gerekli})` : is.baslik, baslangic: b.baslangic, bitis: b.bitis, kaynak: is.kaynak });
    }
    if (ayrilan.length < gerekli) yerlesmeyen.push({ is: is.baslik, eksikBlok: gerekli - ayrilan.length, sonTarih: z.okunur(is.son) });
  }
  plan.sort((p, q) => p.baslangic.localeCompare(q.baslangic));
  const taslak = { id: store.yeniId('plan'), olusma: new Date().toISOString(), bloklar: plan, yerlesmeyen };
  store.guncelle('durum', {}, (d) => (d.planTaslagi = taslak));
  return taslak;
}

function planGorunum(t) {
  const gunler = {};
  for (const b of t.bloklar) (gunler[z.okunur(b.baslangic, { saat: false })] ||= []).push(`${z.yerelIso(b.baslangic).slice(11, 16)} ${b.baslik}`);
  return { gunler, toplamBlok: t.bloklar.length, yerlesmeyen: t.yerlesmeyen.length ? t.yerlesmeyen : undefined };
}

// ---------------- Odak modu ----------------
const odakDurumu = () => {
  const o = store.oku('durum', {}).odak;
  return o && new Date(o.bitis) > new Date() ? o : null;
};

const TEKRAR_SEMA = {
  type: 'object',
  description: 'Tekrarlı etkinlik için. Örn. her salı-perşembe: {"siklik":"haftalik","gunler":["sali","persembe"]}',
  properties: {
    siklik: { type: 'string', enum: z.SIKLIKLAR },
    aralik: { type: 'number', description: 'Kaç birimde bir (2 = iki haftada bir)' },
    gunler: { type: 'array', items: { type: 'string' }, description: 'haftalik için günler: pazartesi..pazar' },
    bitis_tarihi: { type: 'string', description: 'Tekrar bu tarihten sonra durur (ISO)' },
    adet: { type: 'number', description: 'Toplam kaç kez' },
  },
  required: ['siklik'],
};

module.exports = {
  odakDurumu,
  ornekleriGetir,
  gorunum,
  etkinlikEkle,
  etkinlikSil: (id) => {
    try {
      return etkinlikSil({ id });
    } catch {
      return null;
    }
  },
  bosZamanBul,
  senkronla,
  aboneleriYenile,
  araclar: [
    {
      name: 'etkinlik_ekle',
      description: 'Takvime etkinlik ekler (tekrarlı da olabilir). Varsayılan 30 dk önce hatırlatır. Aynısı varsa eklemez, çakışmaları döndürür.',
      parameters: {
        type: 'object',
        properties: {
          baslik: { type: 'string' },
          baslangic: { type: 'string', description: 'ISO 8601 saat dilimiyle; tum_gun ise YYYY-MM-DD' },
          bitis: { type: 'string' },
          sure_dk: { type: 'number', description: 'bitis yerine süre' },
          tum_gun: { type: 'boolean' },
          yer: { type: 'string' },
          not: { type: 'string' },
          hatirlat_dk_once: { type: 'array', items: { type: 'number' }, description: 'Örn. [1440, 30]. [] = hatırlatma yok' },
          tekrar: TEKRAR_SEMA,
          gecmis_onay: { type: 'boolean', description: 'Sadece geçmiş tarihe bilerek ekleniyorsa true' },
        },
        required: ['baslik', 'baslangic'],
      },
      calistir: (a, ctx) => etkinlikEkle(a, ctx.ajan.id),
    },
    {
      name: 'etkinlikleri_listele',
      description: 'Takvimi listeler (tekrarlar ve abone takvimler dahil). Varsayılan: şimdiden 7 gün. "ara" ile başlıkta arar.',
      parameters: { type: 'object', properties: { baslangic: { type: 'string' }, bitis: { type: 'string' }, ara: { type: 'string' } } },
      calistir: (a) => {
        const bas = a.baslangic ? z.tarihCoz(a.baslangic, 'baslangic') : new Date();
        const son = a.bitis ? z.tarihCoz(a.bitis, 'bitis') : new Date(bas.getTime() + 7 * 864e5);
        let l = ornekleriGetir(bas, son);
        if (a.ara) l = l.filter((o) => normal(o.e.baslik).includes(normal(a.ara)));
        return { etkinlikler: l.slice(0, 40).map(gorunum), kesildi: l.length > 40 || undefined };
      },
    },
    {
      name: 'gun_programi',
      description: 'Bir günün tam programı: etkinlikler, hatırlatmalar, o gün teslim ödevler ve son tarihli görevler.',
      parameters: { type: 'object', properties: { tarih: { type: 'string', description: 'YYYY-MM-DD, varsayılan bugün' } } },
      calistir: (a) => {
        const bas = z.gunBaslangici(a.tarih || z.gunAnahtari());
        const son = new Date(bas.getTime() + 864e5 - 1);
        const ayni = (iso) => new Date(iso) >= bas && new Date(iso) <= son;
        const okul = require('./okul').oku();
        const gorev = store.oku('gorevler', { kayitlar: [] }).kayitlar;
        return {
          gun: z.okunur(bas, { saat: false }),
          etkinlikler: ornekleriGetir(bas, son).map(gorunum),
          hatirlatmalar: hat.listele().filter((k) => ayni(k.zaman)).map((k) => ({ saat: z.yerelIso(k.zaman).slice(11, 16), metin: k.metin })),
          teslimOdevler: okul.odevler.filter((o) => !o.tamam && ayni(o.teslim)).map((o) => `${o.ders}: ${o.aciklama}`),
          sonTarihliGorevler: gorev.filter((g) => !g.tamam && g.sonTarih && ayni(g.sonTarih)).map((g) => g.baslik),
        };
      },
    },
    {
      name: 'etkinlik_guncelle',
      description: 'Etkinliği değiştirir (sadece verilen alanlar). Tekrarlı etkinlikte tek bir günü değiştirmek için sadece_bu_tarih ver.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          baslik: { type: 'string' },
          baslangic: { type: 'string' },
          bitis: { type: 'string' },
          sure_dk: { type: 'number' },
          tum_gun: { type: 'boolean' },
          yer: { type: 'string' },
          not: { type: 'string' },
          hatirlat_dk_once: { type: 'array', items: { type: 'number' } },
          tekrar: TEKRAR_SEMA,
          sadece_bu_tarih: { type: 'string', description: 'Tekrarlı etkinliğin değişecek örneğinin başlangıcı (ISO)' },
          gecmis_onay: { type: 'boolean' },
        },
        required: ['id'],
      },
      calistir: (a, ctx) => etkinlikGuncelle(a, ctx.ajan.id),
    },
    {
      name: 'etkinlik_ertele',
      description: 'Etkinliği N dakika ileri/geri kaydırır (negatif = öne alır) ya da yeni başlangıca taşır. Süre korunur.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' }, dakika: { type: 'number' }, yeni_baslangic: { type: 'string' }, sadece_bu_tarih: { type: 'string' } },
        required: ['id'],
      },
      calistir: (a, ctx) => {
        const e = yerelBul(a.id);
        const temel = a.sadece_bu_tarih ? z.tarihCoz(a.sadece_bu_tarih) : new Date(e.baslangic);
        const yeni = a.yeni_baslangic ? z.tarihCoz(a.yeni_baslangic, 'yeni_baslangic') : new Date(temel.getTime() + (Number(a.dakika) || 0) * 60_000);
        return etkinlikGuncelle({ id: a.id, baslangic: yeni.toISOString(), sadece_bu_tarih: a.sadece_bu_tarih }, ctx.ajan.id);
      },
    },
    {
      name: 'etkinlik_sil',
      description: 'Etkinliği siler. Tekrarlıda sadece bir günü silmek için sadece_bu_tarih ver; vermezsen tüm seri silinir.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, sadece_bu_tarih: { type: 'string' } }, required: ['id'] },
      calistir: (a) => etkinlikSil(a),
    },
    {
      name: 'bos_zaman_bul',
      description: 'Bir veya birkaç gün içinde istenen süre kadar boş aralıklar bulur (tüm gün etkinlikleri engellemez).',
      parameters: {
        type: 'object',
        properties: {
          baslangic_tarih: { type: 'string', description: 'YYYY-MM-DD, varsayılan bugün' },
          gun_sayisi: { type: 'number' },
          sure_dk: { type: 'number' },
          gun_baslangic: { type: 'string', description: 'SS:DD, varsayılan 09:00' },
          gun_bitis: { type: 'string', description: 'SS:DD, varsayılan 23:00' },
          tampon_dk: { type: 'number', description: 'Etkinliklerin önüne/arkasına bırakılacak boşluk' },
          adet: { type: 'number' },
        },
        required: ['sure_dk'],
      },
      calistir: (a) => ({ bos_araliklar: bosZamanBul(a) }),
    },
    {
      name: 'hatirlatma_kur',
      description: 'Belirli zamanda sesli hatırlatma kurar (tekrarlı olabilir). Kuran ajan seslendirir.',
      parameters: {
        type: 'object',
        properties: { metin: { type: 'string' }, zaman: { type: 'string', description: 'ISO 8601' }, tekrar: { type: 'string', enum: hat.TEKRARLAR } },
        required: ['metin', 'zaman'],
      },
      calistir: (a, ctx) => {
        const d = z.tarihCoz(a.zaman, 'zaman');
        if (d < new Date(Date.now() - 60_000)) throw new Error(`${z.okunur(d)} geçmişte kaldı; doğru zamanı hesapla.`);
        const k = hat.ekle({ metin: a.metin, zaman: a.zaman, tekrar: a.tekrar || 'yok', ajan: ctx.ajan.id });
        return { kuruldu: { id: k.id, okunur: z.okunur(k.zaman), tekrar: k.tekrar } };
      },
    },
    {
      name: 'hatirlatmalari_listele',
      description: 'Bekleyen hatırlatmaları listeler.',
      parameters: { type: 'object', properties: { ara: { type: 'string' } } },
      calistir: (a) => {
        let l = hat.listele();
        if (a.ara) l = l.filter((k) => normal(k.metin).includes(normal(a.ara)));
        return { hatirlatmalar: l.slice(0, 40).map((k) => ({ id: k.id, metin: k.metin, okunur: z.okunur(k.zaman), tekrar: k.tekrar !== 'yok' ? k.tekrar : undefined, ajan: k.ajan })) };
      },
    },
    {
      name: 'hatirlatma_sil',
      description: 'Hatırlatmayı iptal eder.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) => ({ silindi: hat.sil(a.id) }),
    },
    {
      name: 'hatirlatma_ertele',
      description: 'Hatırlatmayı N dakika sonraya erteler. id verilmezse az önce çalan hatırlatma ertelenir ("5 dk sonra tekrar söyle").',
      parameters: { type: 'object', properties: { dakika: { type: 'number' }, id: { type: 'string' } }, required: ['dakika'] },
      calistir: (a) => {
        const k = hat.ertele(a.id, a.dakika);
        return { ertelendi: { metin: k.metin, okunur: z.okunur(k.zaman) } };
      },
    },
    {
      name: 'takvim_abone_ol',
      description: 'Dış bir takvimi (.ics adresi; Google Takvim "iCal biçimindeki gizli adres", okul takvimi vb.) salt okunur olarak bağlar. Saatte bir güncellenir.',
      parameters: {
        type: 'object',
        properties: { ad: { type: 'string' }, url: { type: 'string' }, hatirlat_dk_once: { type: 'array', items: { type: 'number' } } },
        required: ['ad', 'url'],
      },
      calistir: async (a) => {
        const url = String(a.url).trim().replace(/^webcal:\/\//i, 'https://');
        if (!/^https:\/\//i.test(url)) throw new Error('Sadece https/webcal adresleri kabul edilir.');
        if (oku().abonelikler.some((x) => x.url === url)) throw new Error('Bu takvim zaten bağlı.');
        const etkinlikler = await aboneliktenCek(url);
        return store.guncelle('takvim', VARSAYILAN, (t) => {
          const ab = { id: store.yeniId('abone'), ad: String(a.ad).slice(0, 60), url, hatirlat: a.hatirlat_dk_once ?? [15], etkinlikler, sonGuncelleme: new Date().toISOString(), hata: null };
          t.abonelikler.push(ab);
          return { baglandi: ab.ad, etkinlikSayisi: etkinlikler.length };
        });
      },
    },
    {
      name: 'takvim_abonelikleri',
      description: 'Bağlı dış takvimleri ve son güncelleme durumlarını gösterir.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({ abonelikler: oku().abonelikler.map((a) => ({ id: a.id, ad: a.ad, etkinlikSayisi: a.etkinlikler.length, sonGuncelleme: a.sonGuncelleme && z.okunur(a.sonGuncelleme), hata: a.hata || undefined })) }),
    },
    {
      name: 'takvim_abonelik_sil',
      description: 'Bağlı bir dış takvimi kaldırır.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) =>
        store.guncelle('takvim', VARSAYILAN, (t) => {
          const once = t.abonelikler.length;
          t.abonelikler = t.abonelikler.filter((x) => x.id !== a.id);
          return { silindi: once !== t.abonelikler.length };
        }),
    },
    {
      name: 'takvim_disa_aktar',
      description: "Yerel takvimi .ics dosyası olarak kaydeder ve Finder'da gösterir (telefona/Google'a içe aktarmak için).",
      parameters: { type: 'object', properties: {} },
      calistir: async (a, ctx) => {
        const klasor = path.join(store.DATA_DIR, 'disari');
        fs.mkdirSync(klasor, { recursive: true });
        const dosya = path.join(klasor, 'ai-kadrom-takvim.ics');
        fs.writeFileSync(dosya, ics.yaz(oku().etkinlikler));
        ctx.klasordeGoster?.(dosya);
        return { dosya, etkinlikSayisi: oku().etkinlikler.length };
      },
    },
    {
      name: 'haftayi_planla',
      description: 'Açık görevleri, ödevleri ve hazırlıksız sınavları son tarihlerine göre önümüzdeki günlerin boş saatlerine yerleştiren bir TASLAK üretir (takvime henüz yazmaz). Taslağı kısaca özetle, kullanıcı onaylarsa plani_uygula çağır.',
      parameters: {
        type: 'object',
        properties: {
          gun_sayisi: { type: 'number', description: 'Varsayılan 7' },
          blok_dk: { type: 'number', description: 'Çalışma bloğu uzunluğu, varsayılan 60' },
          gunluk_en_fazla_blok: { type: 'number', description: 'Varsayılan 3' },
          gun_baslangic: { type: 'string', description: 'SS:DD, varsayılan 10:00' },
          gun_bitis: { type: 'string', description: 'SS:DD, varsayılan 22:00' },
        },
      },
      calistir: (a) => planGorunum(haftaPlani(a)),
    },
    {
      name: 'plani_uygula',
      description: 'Son üretilen plan taslağını takvime yazar (her blok 10 dk önce hatırlatılır).',
      parameters: { type: 'object', properties: {} },
      calistir: (a, ctx) => {
        const t = store.oku('durum', {}).planTaslagi;
        if (!t) throw new Error('Uygulanacak plan taslağı yok; önce haftayi_planla.');
        if (Date.now() - new Date(t.olusma) > 6 * 3600_000) throw new Error('Taslak eskimiş; haftayi_planla ile yeniden üret.');
        let n = 0;
        for (const b of t.bloklar) {
          if (new Date(b.baslangic) < new Date()) continue;
          const r = etkinlikEkle({ baslik: b.baslik, baslangic: b.baslangic, bitis: b.bitis, hatirlat_dk_once: [10], etiket: 'plan' }, ctx.ajan.id);
          if (r.eklendi) {
            store.guncelle('takvim', VARSAYILAN, (x) => (x.etkinlikler.find((e) => e.id === r.eklendi.id).kaynak = b.kaynak));
            n++;
          }
        }
        store.guncelle('durum', {}, (d) => delete d.planTaslagi);
        return { takvimeEklenenBlok: n };
      },
    },
    {
      name: 'plani_temizle',
      description: 'Takvimdeki gelecek plan bloklarını (haftayi_planla ile eklenenler) siler; yeniden planlamadan önce kullan.',
      parameters: { type: 'object', properties: {} },
      calistir: () => {
        const simdi = new Date().toISOString();
        const silinecek = oku().etkinlikler.filter((e) => e.etiket === 'plan' && e.baslangic > simdi).map((e) => e.id);
        for (const id of silinecek) etkinlikSil({ id });
        return { silinenBlok: silinecek.length };
      },
    },
    {
      name: 'odak_baslat',
      description: 'Odak modu: süre boyunca hatırlatmalar sesli söylenmez, sona saklanır; süre bitince mola haber verilir.',
      parameters: { type: 'object', properties: { dk: { type: 'number', description: 'Varsayılan 45' }, konu: { type: 'string' }, mola_dk: { type: 'number', description: 'Varsayılan 5' } } },
      calistir: (a, ctx) => {
        const dk = Math.min(180, Math.max(5, Number(a.dk) || 45));
        const o = { baslangic: new Date().toISOString(), bitis: new Date(Date.now() + dk * 60_000).toISOString(), konu: a.konu || '', molaDk: Math.min(30, Math.max(1, Number(a.mola_dk) || 5)), bekleyenler: [], ajan: ctx.ajan.id };
        store.guncelle('durum', {}, (d) => (d.odak = o));
        ctx.olay?.('odak', { bitis: o.bitis, konu: o.konu });
        return { basladi: true, bitis: z.okunur(o.bitis) };
      },
    },
    {
      name: 'odak_bitir',
      description: 'Odak modunu erken bitirir; saklanan hatırlatmaları döndürür.',
      parameters: { type: 'object', properties: {} },
      calistir: (a, ctx) => {
        const o = store.oku('durum', {}).odak;
        store.guncelle('durum', {}, (d) => delete d.odak);
        ctx.olay?.('odak', { bitis: null });
        return o ? { bitti: true, sureDk: Math.round((Date.now() - new Date(o.baslangic)) / 60_000), saklananHatirlatmalar: o.bekleyenler.map((k) => k.metin) } : { aktifOdakYok: true };
      },
    },
  ],
};
