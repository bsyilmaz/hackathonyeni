// Araç kaydı. Her ajan sadece kendi dosyasındaki "araclar" listesindeki araçları görür
// (hafıza araçları herkeste otomatik vardır). "onay" alanı olan araçlar kullanıcı onayına düşer.
const hafiza = require('../hafiza');
const onaylar = require('../onaylar');
const z = require('../zaman');

// Her ajanda otomatik bulunan araçlar.
const HAFIZA_ARACLARI = ['hatirla', 'hafizada_ara', 'gecmiste_ara', 'ekibe_ilet', 'ekibe_gorev_ver', 'unut', 'belgeler', 'belge_oku'];

const hafizaAraclari = [
  {
    name: 'hatirla',
    description: 'Kalıcı ve ileride işe yarayacak bir bilgiyi KENDİ hafızana kaydeder (tercih, karar, kişi, hedef...). Geçici şeyleri kaydetme.',
    parameters: (ajan) => ({
      type: 'object',
      properties: {
        bilgi: { type: 'string', description: 'Tek cümlelik net bilgi, ör. "Kullanıcı sabah 7’den önce toplantı istemiyor"' },
        ...(ajan.hafiza?.ortakYazar && { ortak: { type: 'boolean', description: 'Sadece kullanıcıyla ilgili TÜM ekibin bilmesi gereken temel gerçekler için true (adı, okulu, yaşadığı şehir...)' } }),
      },
      required: ['bilgi'],
    }),
    calistir: (a, ctx) => {
      const n = hafiza.notEkle(ctx.ajan, a.bilgi, { ortak: !!a.ortak });
      return { kaydedildi: n.id, zatenVardi: n.zatenVardi || undefined };
    },
  },
  {
    name: 'hafizada_ara',
    description: 'Kendi hafızanda (notlar, eski konuşmalar, ekipten gelen bilgiler, ortak bilgiler) anlamca arar.',
    parameters: { type: 'object', properties: { sorgu: { type: 'string' } }, required: ['sorgu'] },
    calistir: async (a, ctx) => ({ sonuclar: (await hafiza.ara(ctx.ajan, a.sorgu, { k: 10, esik: 0.3 })).map((k) => ({ id: k.id, kayit: hafiza.satir(k) })) }),
  },
  {
    name: 'gecmiste_ara',
    description: 'Kullanıcıyla geçmiş konuşmalarını tarih aralığına göre getirir ("geçen hafta ne konuşmuştuk", "3 gün önce ne demiştim"). sorgu verilirse o aralıkta anlamca arar.',
    parameters: {
      type: 'object',
      properties: {
        sorgu: { type: 'string' },
        kac_gun_once: { type: 'number', description: 'Aralığın başlangıcı: bugünden kaç gün önce' },
        aralik_gun: { type: 'number', description: 'Kaç günlük aralık (varsayılan 1; kac_gun_once verilmezse son 30 gün)' },
      },
    },
    calistir: async (a, ctx) => {
      let bas = null;
      let son = null;
      if (a.kac_gun_once != null) {
        bas = new Date(z.gunBaslangici(z.gunAnahtari()).getTime() - Number(a.kac_gun_once) * 864e5);
        son = new Date(bas.getTime() + Math.max(1, Number(a.aralik_gun) || 1) * 864e5);
      } else {
        bas = new Date(Date.now() - 30 * 864e5);
      }
      const l = await hafiza.ara(ctx.ajan, a.sorgu || '', { k: 15, esik: 0.25, turler: ['konusma'], baslangic: bas, bitis: son });
      return { konusmalar: l.sort((x, y) => x.tarih.localeCompare(y.tarih)).map(hafiza.satir), bulunamadi: !l.length || undefined };
    },
  },
  {
    name: 'ekibe_ilet',
    description: 'Bir ekip arkadaşının işine yarayacak bilgiyi SADECE ona iletir (onun hafızasına düşer). Gereksiz bilgi iletme.',
    parameters: (ajan, kadro) => ({
      type: 'object',
      properties: {
        ajan: { type: 'string', enum: kadro.filter((x) => x.id !== ajan.id).map((x) => x.id) },
        bilgi: { type: 'string' },
      },
      required: ['ajan', 'bilgi'],
    }),
    calistir: (a, ctx) => {
      const alici = ctx.kadro?.find((x) => x.id === a.ajan);
      if (!alici) throw new Error('Böyle bir ekip arkadaşı yok.');
      hafiza.mesajGonder(ctx.ajan, alici, a.bilgi);
      return { iletildi: alici.name };
    },
  },
  {
    name: 'ekibe_gorev_ver',
    description: 'Bir ekip arkadaşına İŞ verir (bilgi değil): o ajan, senin işin bittikten hemen sonra bunu yapar ve sonucu kullanıcıya kendisi söyler. Örn. Kerem özellik bitirince Mert\'e tweet taslağı; Zeynep sınav ekleyince Elif\'e çalışma bloğu. Sadece gerçekten gerekliyse kullan.',
    parameters: (ajan, kadro) => ({
      type: 'object',
      properties: {
        ajan: { type: 'string', enum: kadro.filter((x) => x.id !== ajan.id).map((x) => x.id) },
        gorev: { type: 'string', description: 'Net, kendi başına anlaşılır görev; gerekli tüm bilgileri içersin' },
      },
      required: ['ajan', 'gorev'],
    }),
    calistir: (a, ctx) => {
      const alici = ctx.kadro?.find((x) => x.id === a.ajan);
      if (!alici || alici.id === ctx.ajan.id) throw new Error('Geçersiz ekip arkadaşı.');
      if (!ctx.gorevVer) throw new Error('Şu an görev verilemiyor.');
      ctx.gorevVer(ctx.ajan, alici, String(a.gorev).slice(0, 1500));
      return { verildi: alici.name, bilgi: `${alici.name} senin işin bitince bunu yapıp sonucu kendisi söyleyecek; sen sadece kısaca haber ver.` };
    },
  },
  {
    name: 'unut',
    description: 'Kullanıcı isterse hafızandaki bir kaydı siler (id’yi hafizada_ara ile bul).',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    calistir: (a, ctx) => ({ silindi: hafiza.sil(ctx.ajan, a.id) }),
  },
];

const MODULLER = {
  web: require('./web'),
  belge: require('./belge'),
  takvim: require('./takvim'),
  okul: require('./okul'),
  gorevler: require('./gorevler'),
  sosyal: require('./sosyal'),
  kod: require('./kod'),
};

const TUM = [...Object.values(MODULLER).flatMap((m) => m.araclar), ...hafizaAraclari];
const KAYIT = new Map(TUM.map((t) => [t.name, t]));

// Ajana göre dinamik bağlam (yerel, API çağrısı yok).
const BAGLAM_EKLERI = { sosyal: MODULLER.sosyal.baglamEki, kod: MODULLER.kod.baglamEki, okul: MODULLER.okul.baglamEki };

function ajanAracAdlari(ajan) {
  return [...new Set([...(ajan.araclar || []), ...HAFIZA_ARACLARI])];
}

function ajanAraclari(ajan, kadro = []) {
  return ajanAracAdlari(ajan)
    .map((ad) => KAYIT.get(ad))
    .filter(Boolean)
    .map((t) => ({ name: t.name, description: t.description, parameters: typeof t.parameters === 'function' ? t.parameters(ajan, kadro) : t.parameters }));
}

// ctx: { ajan, kadro, disAc, paylasimAc, sayfaKontrol, olay, signal, ... }
async function calistir(ad, args, ctx) {
  const arac = KAYIT.get(ad);
  if (!arac || !ajanAracAdlari(ctx.ajan).includes(ad)) throw new Error(`${ctx.ajan.name} "${ad}" aracını kullanamaz.`);
  if (arac.onay) {
    const { baslik, detay, meta } = arac.onay(args, ctx);
    const k = onaylar.olustur({ arac: ad, args, ajan: ctx.ajan.id, baslik, detay, meta });
    ctx.olay?.('onay', k);
    return { durum: 'onay_bekleniyor', onayId: k.id, bilgi: 'Ekrana onay kartı çıktı. Kullanıcıya kısaca ne istediğini ve onayını beklediğini söyle.' };
  }
  return arac.calistir(args || {}, ctx);
}

// Kullanıcı onay kartında metni düzenlediyse: sadece izin verilen alanlar değişebilir ve
// aracın kendi doğrulamasından (ör. karakter sınırı) geçmelidir.
function onayDuzenlemesiniDogrula(id, yeniArgs) {
  const k = onaylar.bul(id);
  if (!k || k.durum !== 'bekliyor') throw new Error('Bekleyen böyle bir onay yok.');
  const arac = KAYIT.get(k.arac);
  if (!arac.duzenlenebilir) throw new Error('Bu işlem düzenlenemez.');
  const args = { ...k.args };
  for (const alan of arac.duzenlenebilir) if (yeniArgs?.[alan] !== undefined) args[alan] = yeniArgs[alan];
  arac.onay(args, {});
  return args;
}

async function onayiCoz(id, karar, ctx, yeniArgs = null) {
  const k = onaylar.bul(id);
  if (!k || k.durum !== 'bekliyor') throw new Error('Bekleyen böyle bir onay yok.');
  if (yeniArgs && karar === 'onay') {
    k.args = onayDuzenlemesiniDogrula(id, yeniArgs);
    onaylar.argsGuncelle(id, k.args);
  }
  if (karar !== 'onay') {
    onaylar.durumYaz(id, 'reddedildi');
    return { kayit: k, sonuc: null };
  }
  try {
    const sonuc = await KAYIT.get(k.arac).calistir(k.args, ctx);
    onaylar.durumYaz(id, 'onaylandi', sonuc);
    return { kayit: k, sonuc };
  } catch (e) {
    onaylar.durumYaz(id, 'hata', { hata: e.message });
    throw e;
  }
}

module.exports = { ajanAraclari, ajanAracAdlari, calistir, onayiCoz, onayDuzenlemesiniDogrula, KAYIT, MODULLER, BAGLAM_EKLERI, HAFIZA_ARACLARI };
