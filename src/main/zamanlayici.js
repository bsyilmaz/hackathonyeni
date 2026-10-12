// Arka plan işleri. API'yi sadece gerektiğinde kullanır:
// - Hatırlatmalar: ajanın kendi kalıp cümleleriyle, API'siz seslendirilir.
// - Sessiz saatlerde konuşulmaz, sadece bildirim gelir.
// - Brifing/akşam kontrolü: veri yerelde toplanır; söylenecek bir şey yoksa API'siz kısa cümle,
//   varsa TEK ve araçsız bir çağrı (bütçe dolduysa yerel özet).
// - Günlük: yedek, Kerem çöp kutusu temizliği. Saatlik: takvim aboneliklerini yenileme.
const store = require('./store');
const config = require('./config');
const hat = require('./hatirlatmalar');
const kadro = require('./kadro');
const deepseek = require('./deepseek');
const hafiza = require('./hafiza');
const yonetici = require('./yonetici');
const araclar = require('./tools');
const z = require('./zaman');

const ARALIK_MS = 15_000;
let calisiyor = false;
let zamanlayici = null;
const rastgele = (l) => l[Math.floor(Math.random() * l.length)];

const VARSAYILAN_KALIP = ['Hatırlatma: {metin}', 'Unutma: {metin}'];

function kaliplaSoyle(ajan, k) {
  const kalip = rastgele(ajan.hatirlatmaKalibi?.length ? ajan.hatirlatmaKalibi : VARSAYILAN_KALIP);
  const metin = kalip.replace('{metin}', k.metin);
  return k.gecikmeDk > 60 ? `Kaçırdığın bir hatırlatma vardı, ${z.okunur(k.zaman)} için: ${k.metin}` : metin;
}

function aracSahibi(aracAdi, tercih) {
  const t = kadro.bul(tercih);
  return t && araclar.ajanAracAdlari(t).includes(aracAdi) ? t : kadro.liste().find((a) => a.araclar.includes(aracAdi));
}

async function hatirlatmalar(ctx) {
  const gelenler = hat.zamaniGelenleriAl();
  if (!gelenler.length) return;
  // Odak modundayken hatırlatmalar saklanır, odak bitince toplu söylenir.
  if (araclar.MODULLER.takvim.odakDurumu()) {
    store.guncelle('durum', {}, (d) => d.odak && d.odak.bekleyenler.push(...gelenler.map((k) => ({ metin: k.metin, ajan: k.ajan }))));
    return;
  }
  const sessiz = config.sessizMi();
  // Uygulama uzun süre kapalı kaldıysa çok sayıda kaçırılan birikebilir: tek tek okumak yerine özetle.
  const kacirilan = gelenler.filter((k) => k.gecikmeDk > 60);
  const zamaninda = gelenler.filter((k) => k.gecikmeDk <= 60);
  for (const k of zamaninda) {
    const ajan = kadro.bul(k.ajan) || kadro.sef();
    ctx.bildirim(ajan.name, k.metin, { zorla: sessiz });
    ctx.olay?.('hatirlatma', { id: k.id, ajan: ajan.id, metin: k.metin });
    if (sessiz) continue;
    const metin = kaliplaSoyle(ajan, k);
    kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin });
    await yonetici.sirala(() => ctx.soyle(ajan.id, metin));
  }
  if (kacirilan.length) {
    const cem = kadro.bul('cem') || kadro.sef();
    ctx.bildirim(cem.name, `${kacirilan.length} hatırlatma kaçırıldı`, { zorla: sessiz });
    ctx.olay?.('hatirlatma', { id: null, ajan: cem.id, kacirilan: true, metin: kacirilan.map((k) => k.metin).join('\n') });
    if (sessiz) return;
    const metin =
      kacirilan.length === 1
        ? kaliplaSoyle(cem, kacirilan[0])
        : `Sen yokken ${kacirilan.length} hatırlatma kaçırdın: ${kacirilan
            .slice(0, 4)
            .map((k) => k.metin.replace(/\.$/, ''))
            .join('; ')}${kacirilan.length > 4 ? ' ve diğerleri' : ''}.`;
    kadro.gecmiseEkle({ rol: 'ajan', ajan: cem.id, metin });
    await yonetici.sirala(() => ctx.soyle(cem.id, metin));
  }
}

async function planliPaylasimlar(ctx) {
  const sosyal = araclar.MODULLER.sosyal;
  for (const p of sosyal.zamaniGelenPlanlilar()) {
    const ajan = aracSahibi('paylasim_hazirla', 'mert');
    if (!ajan) continue;
    try {
      await araclar.calistir('paylasim_hazirla', { platform: p.platform, parcalar: p.parcalar }, { ...ctx, ajan, kadro: kadro.liste() });
    } catch (e) {
      console.error('[plan]', e.message);
      continue;
    }
    ctx.bildirim(ajan.name, 'Planlı paylaşım onay bekliyor');
    if (!config.sessizMi()) await yonetici.sirala(() => ctx.soyle(ajan.id, 'Planladığımız paylaşımın zamanı geldi. Ekrana koydum, onaylarsan açıyorum.'));
  }
}

function bosMu(o) {
  return Object.entries(o).every(([k, v]) => k === 'suAn' || v === undefined || (Array.isArray(v) && !v.length));
}

const RUTINLER = [
  {
    anahtar: 'sonBrifing',
    saat: () => config.ayarlar().sabahBrifingi,
    bos: () => rastgele(['Günaydın kanka! Bugün takvimin bomboş, kafana göre takıl. Bir şey eklemek istersen buradayım.', 'Günaydın! Bugün planlı bir şey yok, güzel bir gün olsun.']),
    istek: 'Sabah brifingi ver: günaydın de, bugünün en önemli şeylerini ve unutmaması gerekenleri 3-4 kısa cümlede söyle.',
  },
  {
    anahtar: 'sonAksam',
    saat: () => config.ayarlar().aksamKontrolu,
    bos: () => rastgele(['Akşam kontrolü: bugün her şey yolunda görünüyor kanka, eline sağlık.', 'Bugün kaçan bir şey yok, rahat bir akşam geçir.']),
    istek: 'Akşam kontrolü: geciken ya da kaçırılan şeyleri yüzüne vur ama destek ol; yarın için en önemli 1-2 şeyi söyle. En fazla 3 cümle.',
  },
];

async function rutinMetni(r, ajan, veri) {
  if (bosMu(veri)) return r.bos();
  if (!config.gizliOku('deepseekApiKey') || deepseek.butceDoldu()) {
    // API yoksa / bütçe dolduysa: yerel, basit özet.
    const p = [];
    if (veri.bugunVeYarin) p.push(`Takvimde ${veri.bugunVeYarin.slice(0, 2).join(', ')} var`);
    if (veri.yaklasanOdevler) p.push(`yaklaşan ödev: ${veri.yaklasanOdevler[0]}`);
    if (veri.acikGorevler) p.push(`${veri.acikGorevler.length} açık işin var`);
    return `${r.anahtar === 'sonBrifing' ? 'Günaydın!' : 'Akşam kontrolü:'} ${p.join('; ')}.`;
  }
  const y = await deepseek.sohbet({
    mesajlar: [
      { role: 'system', content: `Sen ${ajan.name}'sin. ${ajan.persona || ''} Cevabın sesli okunacak: emoji, markdown, liste yok. Kısa ve doğal konuş.` },
      { role: 'user', content: `${r.istek}\nVeriler: ${JSON.stringify(veri)}` },
    ],
    maksToken: 220,
    ajan: ajan.id,
    zorunlu: false,
  });
  return kadro.sesliMetin(y.content);
}

async function rutinler(ctx) {
  const simdi = new Date();
  const bugun = z.gunAnahtari(simdi);
  for (const r of RUTINLER) {
    const saat = r.saat();
    if (!saat) continue;
    const baslangic = z.bugunSaat(saat, simdi);
    if (simdi < baslangic || simdi - baslangic > 3 * 3600_000) continue;
    if (store.oku('durum', {})[r.anahtar] === bugun) continue;
    store.guncelle('durum', {}, (d) => (d[r.anahtar] = bugun));
    if (config.sessizMi()) continue;
    const ajan = aracSahibi('hayat_ozeti', 'cem') || kadro.sef();
    await yonetici.sirala(async () => {
      ctx.olay?.('dusunuyor', { ajan: ajan.id });
      try {
        const metin = await rutinMetni(r, ajan, araclar.MODULLER.gorevler.hayatOzeti());
        if (!metin) return;
        kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin });
        hafiza.konusmaEkle(ajan.id, r.anahtar === 'sonBrifing' ? '(sabah brifingi)' : '(akşam kontrolü)', metin);
        ctx.bildirim(ajan.name, metin.slice(0, 140));
        await ctx.soyle(ajan.id, metin);
      } catch (e) {
        console.error('[rutin]', e.message);
      } finally {
        ctx.olay?.('bitti', {});
      }
    });
  }
}

// Odak süresi bitti mi?
async function odakKontrol(ctx) {
  const o = store.oku('durum', {}).odak;
  if (!o || new Date(o.bitis) > new Date()) return;
  store.guncelle('durum', {}, (d) => delete d.odak);
  ctx.olay?.('odak', { bitis: null });
  const ajan = kadro.bul(o.ajan) || kadro.bul('elif') || kadro.sef();
  const biriken = o.bekleyenler || [];
  const metin =
    `Odak süren bitti, harika iş! ${o.molaDk} dakika mola ver.` +
    (biriken.length ? ` Bu arada ${biriken.length} hatırlatma birikti: ${biriken.slice(0, 4).map((k) => k.metin.replace(/\.$/, '')).join('; ')}.` : '');
  ctx.bildirim(ajan.name, 'Odak bitti, mola zamanı', { zorla: true });
  kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin });
  if (!config.sessizMi()) await yonetici.sirala(() => ctx.soyle(ajan.id, metin));
}

// API kullanmayan, günde/haftada bir kez çalışan küçük dürtmeler.
const DURTMELER = [
  {
    anahtar: 'sonKartHatirlatma',
    zamani: (s) => s.getHours() >= 19 && s.getHours() < 22,
    calistir: (ctx) => {
      const n = araclar.MODULLER.okul.vadesiGelenler().length;
      if (!n || !kadro.bul('zeynep')) return null;
      yonetici.soruSor('zeynep', 20);
      return { ajan: 'zeynep', metin: `Bugün tekrar zamanı gelmiş ${n} soru kartın var. Beş dakikalık bir sözlü sınav yapalım mı?` };
    },
  },
  {
    anahtar: 'sonGununIsiSorusu',
    zamani: (s) => {
      const b = z.bugunSaat(config.ayarlar().sabahBrifingi || '09:00', s);
      return s - b > 2 * 60_000 && s - b < 3 * 3600_000;
    },
    calistir: () => {
      if (araclar.MODULLER.gorevler.gununIsi()) return null;
      const sef = kadro.sef();
      yonetici.soruSor(sef.id, 20);
      return { ajan: sef.id, metin: 'Bugünün en önemli tek işi ne olsun? Onu söyle, gün bitmeden bitirmen için takipte olayım.' };
    },
  },
  {
    anahtar: 'sonNotKutusu',
    zamani: (s) => s.getDay() === 0 && s.getHours() >= 20 && s.getHours() < 23,
    calistir: () => {
      const n = araclar.MODULLER.gorevler.notKutusu().length;
      if (!n || !kadro.bul('cem')) return null;
      yonetici.soruSor('cem', 20);
      return { ajan: 'cem', metin: `Not kutunda bu hafta ${n} not birikti kanka. Beş dakikada ayıklayalım mı?` };
    },
  },
];

async function durtmeler(ctx) {
  if (config.sessizMi() || araclar.MODULLER.takvim.odakDurumu()) return;
  const s = new Date();
  const bugun = z.gunAnahtari(s);
  for (const d of DURTMELER) {
    if (!d.zamani(s) || store.oku('durum', {})[d.anahtar] === bugun) continue;
    store.guncelle('durum', {}, (x) => (x[d.anahtar] = bugun));
    const r = d.calistir(ctx);
    if (!r) continue;
    const ajan = kadro.bul(r.ajan);
    ctx.bildirim(ajan.name, r.metin);
    kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin: r.metin });
    await yonetici.sirala(() => ctx.soyle(ajan.id, r.metin));
  }
}

async function bakim() {
  const d = store.oku('durum', {});
  const bugun = z.gunAnahtari();
  if (d.sonBakim !== bugun) {
    store.guncelle('durum', {}, (x) => (x.sonBakim = bugun));
    try {
      store.gunlukYedek(bugun);
    } catch (e) {
      console.error('[yedek]', e.message);
    }
    araclar.MODULLER.kod.copTemizle();
  }
  if (!d.sonAbonelik || Date.now() - d.sonAbonelik > 3600_000) {
    store.guncelle('durum', {}, (x) => (x.sonAbonelik = Date.now()));
    await araclar.MODULLER.takvim.aboneleriYenile();
  }
}

async function tik(ctx) {
  if (calisiyor) return;
  calisiyor = true;
  try {
    araclar.MODULLER.takvim.senkronla();
    araclar.MODULLER.gorevler.senkronla();
    await odakKontrol(ctx);
    await hatirlatmalar(ctx);
    await planliPaylasimlar(ctx);
    await rutinler(ctx);
    await durtmeler(ctx);
    await bakim();
    await hafiza.bekleyenleriGom();
  } catch (e) {
    console.error('[zamanlayici]', e);
  } finally {
    calisiyor = false;
  }
}

// ctx: { soyle(ajanId, metin), bildirim(baslik, govde, {zorla}), olay(tip, veri), ... }
function baslat(ctx) {
  durdur();
  zamanlayici = setInterval(() => tik(ctx), ARALIK_MS);
  setTimeout(() => tik(ctx), 4000);
}

function durdur() {
  if (zamanlayici) clearInterval(zamanlayici);
  zamanlayici = null;
}

module.exports = { baslat, durdur, tik };
