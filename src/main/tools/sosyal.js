// Sosyal medya araçları (Mert). API YOK, bot YOK:
// Mert metni hazırlar -> kullanıcı onaylar -> uygulamanın kendi "sosyal penceresinde" (kullanıcının bir kez
// giriş yaptığı oturum) platformun hazır paylaşım ekranı metin dolu açılır -> kullanıcı "Gönder"e basar.
// Bu yol ücretsizdir ve hesabı riske atmaz (otomatik gönderim yapılmaz).
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const store = require('../store');
const z = require('../zaman');

const PLATFORMLAR = {
  x: { ad: 'X', limit: 280, url: (t) => 'https://x.com/intent/post?text=' + encodeURIComponent(t), giris: 'https://x.com/login' },
  threads: { ad: 'Threads', limit: 500, url: (t) => 'https://www.threads.net/intent/post?text=' + encodeURIComponent(t), giris: 'https://www.threads.net/login' },
  bluesky: { ad: 'Bluesky', limit: 300, url: (t) => 'https://bsky.app/intent/compose?text=' + encodeURIComponent(t), giris: 'https://bsky.app' },
  linkedin: { ad: 'LinkedIn', limit: 3000, url: (t) => 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(t), giris: 'https://www.linkedin.com/login' },
  instagram: { ad: 'Instagram', limit: 2200, url: null, giris: 'https://www.instagram.com/' },
};

const VARSAYILAN = { taslaklar: [], planli: [], paylasilanlar: [], aktif: null, tarz: '' };
const oku = () => store.oku('sosyal', VARSAYILAN);

// X: bağlantılar 23 karakter sayılır, emoji vb. 2 karakter.
function uzunluk(platform, metin) {
  let m = String(metin);
  if (platform !== 'x') return [...m].length;
  m = m.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  let n = 0;
  for (const c of m) n += /\p{Extended_Pictographic}|[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u.test(c) ? 2 : 1;
  return n;
}

function platformu(p) {
  const k = String(p || 'x').toLowerCase().replace(/[^a-z]/g, '');
  const anahtar = k === 'twitter' ? 'x' : k;
  if (!PLATFORMLAR[anahtar]) throw new Error(`Platform şunlardan biri olmalı: ${Object.keys(PLATFORMLAR).join(', ')}`);
  return anahtar;
}

function parcalariDogrula(platform, parcalar) {
  if (!Array.isArray(parcalar) || !parcalar.length) throw new Error('En az bir parça metin gerekli.');
  if (parcalar.length > 15) throw new Error('En fazla 15 parça.');
  const lim = PLATFORMLAR[platform].limit;
  const hatalar = [];
  const temiz = parcalar.map((p, i) => {
    const m = String(p || '').trim();
    if (!m) hatalar.push(`${i + 1}. parça boş`);
    const u = uzunluk(platform, m);
    if (u > lim) hatalar.push(`${i + 1}. parça ${u} karakter (sınır ${lim}, ${u - lim} fazla)`);
    return m;
  });
  if (hatalar.length) throw new Error(hatalar.join('; ') + '. Kısaltıp tekrar dene.');
  return temiz;
}

function detay(platform, parcalar) {
  return parcalar.length === 1 ? parcalar[0] : parcalar.map((p, i) => `${i + 1}/${parcalar.length}: ${p}`).join('\n\n');
}

async function parcaAc(platform, metin, ctx) {
  const P = PLATFORMLAR[platform];
  if (P.url) await ctx.paylasimAc(P.url(metin));
  else {
    ctx.panoyaKopyala?.(metin);
    await ctx.paylasimAc(P.giris);
  }
}

async function paylasimBaslat({ platform, parcalar }, ctx) {
  platform = platformu(platform);
  parcalar = parcalariDogrula(platform, parcalar);
  await parcaAc(platform, parcalar[0], ctx);
  store.guncelle('sosyal', VARSAYILAN, (s) => {
    s.aktif = parcalar.length > 1 ? { platform, parcalar, sira: 1 } : null;
    s.paylasilanlar.push({ platform, metin: parcalar.join('\n---\n'), tarih: new Date().toISOString() });
    s.paylasilanlar = s.paylasilanlar.slice(-300);
  });
  const panoda = !PLATFORMLAR[platform].url;
  return {
    acildi: true,
    platform: PLATFORMLAR[platform].ad,
    toplamParca: parcalar.length,
    bilgi: panoda ? 'Instagram’da hazır paylaşım ekranı yok; metin panoya kopyalandı, sosyal pencerede yapıştırabilir.' : 'Paylaşım ekranı açıldı, kullanıcının "Gönder"e basması yeterli.',
    sonrakiIcin: parcalar.length > 1 ? 'Kullanıcı gönderdikten sonra "sıradaki" diyerek ya da karttaki butonla diğer parçayı açar.' : undefined,
  };
}

// Çok parçalı paylaşımda sıradaki parçayı açar.
async function sonrakiParca(ctx) {
  const a = oku().aktif;
  if (!a) return null;
  if (a.sira >= a.parcalar.length) {
    store.guncelle('sosyal', VARSAYILAN, (s) => (s.aktif = null));
    return { bitti: true };
  }
  await parcaAc(a.platform, a.parcalar[a.sira], ctx);
  const sira = a.sira + 1;
  store.guncelle('sosyal', VARSAYILAN, (s) => (s.aktif = sira >= a.parcalar.length ? null : { ...a, sira }));
  return { acilan: sira, toplam: a.parcalar.length, bitti: sira >= a.parcalar.length };
}

function zamaniGelenPlanlilar(simdi = new Date()) {
  return store.guncelle('sosyal', VARSAYILAN, (s) => {
    const gelen = s.planli.filter((p) => !p.yapildi && new Date(p.zaman) <= simdi);
    for (const p of gelen) p.yapildi = true;
    return gelen;
  });
}

// ---------------- Görsel üretimi (HTML -> PNG, tamamen yerel) ----------------
const RENKLER = { gunes: ['#ffc43d', '#141a2b'], gece: ['#22304f', '#fff6e6'], domates: ['#ff6b5b', '#141a2b'], nane: ['#9fd3c7', '#141a2b'], kagit: ['#fff6e6', '#141a2b'], mor: ['#b9a7ff', '#141a2b'] };
const BOYUTLAR = { kare: [1080, 1080], dikey: [1080, 1350], yatay: [1200, 675] };
const kac = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function gorselHtml({ sablon = 'duyuru', baslik = '', metin = '', maddeler = [], alt_yazi = '', renk = 'gunes', boyut = 'kare' }) {
  const [zemin, zeminMetin] = RENKLER[renk] || RENKLER.gunes;
  const [w, h] = BOYUTLAR[boyut] || BOYUTLAR.kare;
  const fontlar = pathToFileURL(path.join(store.ROOT, 'src', 'renderer', 'fontlar.css')).href;
  let govde = '';
  if (sablon === 'alinti') {
    govde = `<div class="tirnak">“</div><p class="alinti sigdir">${kac(metin || baslik)}</p>${alt_yazi ? `<div class="imza">${kac(alt_yazi)}</div>` : ''}`;
  } else if (sablon === 'liste' || sablon === 'hafta') {
    const isaret = sablon === 'hafta' ? '✓' : null;
    govde = `<h1 class="sigdir">${kac(baslik)}</h1><ol class="liste">${(maddeler || []).slice(0, 8).map((m, i) => `<li><span class="no">${isaret || i + 1}</span><span>${kac(m)}</span></li>`).join('')}</ol>${alt_yazi ? `<div class="imza">${kac(alt_yazi)}</div>` : ''}`;
  } else {
    govde = `<h1 class="sigdir">${kac(baslik)}</h1>${metin ? `<p class="metin">${kac(metin)}</p>` : ''}${alt_yazi ? `<div class="etiket">${kac(alt_yazi)}</div>` : ''}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${fontlar}"><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${w}px;height:${h}px;overflow:hidden}
  body{background:${zemin};font-family:'Rubik',sans-serif;color:#221d33;display:grid;place-items:center;padding:${Math.round(w * 0.07)}px}
  .kart{position:relative;width:100%;height:100%;background:#fff6e6;border:8px solid #141a2b;border-radius:40px;box-shadow:18px 18px 0 #141a2b;padding:${Math.round(w * 0.07)}px;display:flex;flex-direction:column;justify-content:center;gap:32px;overflow:hidden}
  h1{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:${boyut === 'yatay' ? 76 : 96}px;line-height:1.02;letter-spacing:-1px}
  .metin{font-size:${boyut === 'yatay' ? 34 : 42}px;line-height:1.35;color:#3a3450}
  .tirnak{font-family:'Baloo 2',sans-serif;font-weight:800;font-size:220px;line-height:.6;color:${zemin === '#fff6e6' ? '#ffc43d' : zemin};-webkit-text-stroke:6px #141a2b}
  .alinti{font-family:'Baloo 2',sans-serif;font-weight:700;font-size:72px;line-height:1.12}
  .imza{font-size:34px;font-weight:600;color:#5c5470}
  .etiket{align-self:flex-start;font-family:'Baloo 2',sans-serif;font-weight:800;font-size:34px;padding:4px 22px;border:5px solid #141a2b;border-radius:16px;background:${zemin === '#fff6e6' ? '#ffc43d' : zemin};color:${zeminMetin === '#fff6e6' ? '#fff6e6' : '#141a2b'};transform:rotate(-2deg)}
  .liste{list-style:none;padding:0;display:flex;flex-direction:column;gap:22px}
  .liste li{display:flex;align-items:center;gap:24px;font-size:40px;line-height:1.25}
  .liste .no{flex:none;display:grid;place-items:center;width:64px;height:64px;border:5px solid #141a2b;border-radius:50%;background:${zemin === '#fff6e6' ? '#ffc43d' : zemin};color:${zeminMetin === '#fff6e6' ? '#fff6e6' : '#141a2b'};font-family:'Baloo 2',sans-serif;font-weight:800;font-size:34px}
  </style></head><body><div class="kart">${govde}</div>
  <script>
    // Yazı sığmazsa küçült.
    document.fonts.ready.then(() => {
      const k = document.querySelector('.kart');
      for (const el of document.querySelectorAll('.sigdir, .metin, .liste li')) {
        let f = parseFloat(getComputedStyle(el).fontSize);
        while (k.scrollHeight > k.clientHeight + 2 && f > 22) { f -= 2; el.style.fontSize = f + 'px'; }
      }
      document.title = 'hazir';
    });
  </script></body></html>`;
}

const PARCA_SEMA = { type: 'array', items: { type: 'string' }, description: 'Tek gönderi için 1 eleman; flood/thread için sırayla parçalar' };
const PLATFORM_SEMA = { type: 'string', enum: Object.keys(PLATFORMLAR) };

const paylasimHazirla = {
  name: 'paylasim_hazirla',
  description: 'Gönderi (ya da flood) hazırlayıp kullanıcının onayına sunar. Onaylanınca sosyal pencerede paylaşım ekranı metin dolu açılır, kullanıcı Gönder’e basar. Onaysız hiçbir şey açılmaz.',
  parameters: { type: 'object', properties: { platform: PLATFORM_SEMA, parcalar: PARCA_SEMA }, required: ['platform', 'parcalar'] },
  onay: (a) => {
    const p = platformu(a.platform);
    const parcalar = parcalariDogrula(p, a.parcalar);
    return {
      baslik: `${PLATFORMLAR[p].ad} için ${parcalar.length > 1 ? `${parcalar.length} parçalık flood` : 'gönderi'} hazır`,
      detay: detay(p, parcalar),
      meta: { tur: 'paylasim', platform: p, platformAd: PLATFORMLAR[p].ad, sinir: PLATFORMLAR[p].limit, parcalar },
    };
  },
  duzenlenebilir: ['parcalar'],
  calistir: (a, ctx) => paylasimBaslat(a, ctx),
};

module.exports = {
  gorselHtml,
  PLATFORMLAR,
  uzunluk,
  zamaniGelenPlanlilar,
  sonrakiParca,
  aktifPaylasim: () => oku().aktif,
  baglamEki: () => (oku().tarz ? `Kullanıcının paylaşım tarzı rehberi: ${oku().tarz}` : 'Henüz tarz rehberi yok; kullanıcı örnek verirse tarz_rehberi ile kaydet.'),
  araclar: [
    paylasimHazirla,
    {
      name: 'paylasim_planla',
      description: 'Gönderiyi ileri bir zamana planlar. Zamanı gelince Mert haber verir ve onay ister.',
      parameters: { type: 'object', properties: { platform: PLATFORM_SEMA, parcalar: PARCA_SEMA, zaman: { type: 'string', description: 'ISO 8601' } }, required: ['platform', 'parcalar', 'zaman'] },
      calistir: (a) => {
        const platform = platformu(a.platform);
        const parcalar = parcalariDogrula(platform, a.parcalar);
        const zmn = z.tarihCoz(a.zaman, 'zaman');
        if (zmn < new Date()) throw new Error('Planlanan zaman geçmişte.');
        return store.guncelle('sosyal', VARSAYILAN, (s) => {
          const p = { id: store.yeniId('plan'), platform, parcalar, zaman: zmn.toISOString(), yapildi: false };
          s.planli.push(p);
          return { planlandi: { id: p.id, platform: PLATFORMLAR[platform].ad, okunur: z.okunur(p.zaman) } };
        });
      },
    },
    {
      name: 'planli_paylasimlar',
      description: 'Bekleyen planlı gönderileri listeler.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({ planli: oku().planli.filter((p) => !p.yapildi).map((p) => ({ id: p.id, platform: p.platform, okunur: z.okunur(p.zaman), ilkParca: p.parcalar[0].slice(0, 120), parcaSayisi: p.parcalar.length })) }),
    },
    {
      name: 'planli_paylasim_guncelle',
      description: 'Planlı gönderinin metnini ya da zamanını değiştirir.',
      parameters: { type: 'object', properties: { id: { type: 'string' }, parcalar: PARCA_SEMA, zaman: { type: 'string' } }, required: ['id'] },
      calistir: (a) =>
        store.guncelle('sosyal', VARSAYILAN, (s) => {
          const p = s.planli.find((x) => x.id === a.id && !x.yapildi);
          if (!p) throw new Error('Planlı gönderi bulunamadı.');
          if (a.parcalar) p.parcalar = parcalariDogrula(p.platform, a.parcalar);
          if (a.zaman) p.zaman = z.tarihCoz(a.zaman, 'zaman').toISOString();
          return { guncellendi: z.okunur(p.zaman) };
        }),
    },
    {
      name: 'planli_paylasim_sil',
      description: 'Planlı gönderiyi iptal eder.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) =>
        store.guncelle('sosyal', VARSAYILAN, (s) => {
          const once = s.planli.length;
          s.planli = s.planli.filter((x) => x.id !== a.id);
          return { silindi: once !== s.planli.length };
        }),
    },
    {
      name: 'taslak_kaydet',
      description: 'Gönderi taslağı ya da içerik fikrini sonraya kaydeder.',
      parameters: { type: 'object', properties: { metin: { type: 'string' }, tur: { type: 'string', enum: ['taslak', 'fikir'] }, platform: PLATFORM_SEMA, etiket: { type: 'string' } }, required: ['metin'] },
      calistir: (a) =>
        store.guncelle('sosyal', VARSAYILAN, (s) => {
          const t = { id: store.yeniId('tas'), metin: String(a.metin).slice(0, 3000), tur: a.tur || 'taslak', platform: a.platform || null, etiket: a.etiket || '', tarih: new Date().toISOString() };
          s.taslaklar.push(t);
          return { kaydedildi: t.id, toplam: s.taslaklar.length };
        }),
    },
    {
      name: 'taslaklar',
      description: 'Kayıtlı taslak ve fikirleri listeler (arama yapılabilir).',
      parameters: { type: 'object', properties: { ara: { type: 'string' }, tur: { type: 'string', enum: ['taslak', 'fikir'] } } },
      calistir: (a) => {
        let l = oku().taslaklar;
        if (a.tur) l = l.filter((t) => t.tur === a.tur);
        if (a.ara) l = l.filter((t) => t.metin.toLocaleLowerCase('tr').includes(String(a.ara).toLocaleLowerCase('tr')));
        return { taslaklar: l.slice(-20).map((t) => ({ id: t.id, tur: t.tur, metin: t.metin.slice(0, 200), etiket: t.etiket || undefined })) };
      },
    },
    {
      name: 'taslak_sil',
      description: 'Taslağı/fikri siler.',
      parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      calistir: (a) =>
        store.guncelle('sosyal', VARSAYILAN, (s) => {
          const once = s.taslaklar.length;
          s.taslaklar = s.taslaklar.filter((x) => x.id !== a.id);
          return { silindi: once !== s.taslaklar.length };
        }),
    },
    {
      name: 'icerik_takvimi',
      description: 'Önümüzdeki günlerin planlı gönderileri ve hiç gönderi olmayan günler.',
      parameters: { type: 'object', properties: { gun: { type: 'number', description: 'Varsayılan 14' } } },
      calistir: (a) => {
        const n = Math.min(60, Number(a.gun) || 14);
        const planli = oku().planli.filter((p) => !p.yapildi);
        const bos = [];
        for (let i = 0; i < n; i++) {
          const g = z.gunAnahtari(new Date(Date.now() + i * 864e5));
          if (!planli.some((p) => z.gunAnahtari(p.zaman) === g)) bos.push(z.okunur(z.gunBaslangici(g), { saat: false }));
        }
        return { planli: planli.map((p) => `${z.okunur(p.zaman)} ${PLATFORMLAR[p.platform].ad}: ${p.parcalar[0].slice(0, 80)}`), bosGunler: bos.slice(0, 14), sonPaylasim: oku().paylasilanlar.at(-1) ? z.okunur(oku().paylasilanlar.at(-1).tarih) : 'yok' };
      },
    },
    {
      name: 'paylasim_gecmisi',
      description: 'Son açılan/paylaşılan gönderiler.',
      parameters: { type: 'object', properties: { platform: PLATFORM_SEMA, adet: { type: 'number' } } },
      calistir: (a) => {
        let l = oku().paylasilanlar;
        if (a.platform) l = l.filter((p) => p.platform === platformu(a.platform));
        return { gecmis: l.slice(-(Number(a.adet) || 10)).map((p) => ({ platform: p.platform, tarih: z.okunur(p.tarih), metin: p.metin.slice(0, 200) })) };
      },
    },
    {
      name: 'tarz_rehberi',
      description: 'Kullanıcının paylaşım tarzını (ses tonu, sevdiği/sevmediği şeyler, hashtag kullanımı, örnekler) kaydeder/günceller. metin verilmezse mevcut rehberi döndürür.',
      parameters: { type: 'object', properties: { metin: { type: 'string', description: 'Rehberin TAMAMI (eskisinin yerine geçer), en fazla 1500 karakter' } } },
      calistir: (a) => {
        if (a.metin) store.guncelle('sosyal', VARSAYILAN, (s) => (s.tarz = String(a.metin).slice(0, 1500)));
        return { tarz: oku().tarz || '(boş)' };
      },
    },
    {
      name: 'karakter_say',
      description: 'Metnin platforma göre karakter sayısı ve sınır (X’te bağlantı=23, emoji=2).',
      parameters: { type: 'object', properties: { platform: PLATFORM_SEMA, metin: { type: 'string' } }, required: ['platform', 'metin'] },
      calistir: (a) => {
        const p = platformu(a.platform);
        const u = uzunluk(p, a.metin);
        return { uzunluk: u, sinir: PLATFORMLAR[p].limit, kalan: PLATFORMLAR[p].limit - u };
      },
    },
    {
      name: 'sosyal_giris_ac',
      description: 'Kullanıcının bir platforma giriş yapabilmesi için sosyal pencerede giriş sayfasını açar (bir kez yeterli, oturum hatırlanır).',
      parameters: { type: 'object', properties: { platform: PLATFORM_SEMA }, required: ['platform'] },
      calistir: async (a, ctx) => {
        const p = platformu(a.platform);
        await ctx.paylasimAc(PLATFORMLAR[p].giris);
        return { acildi: PLATFORMLAR[p].ad, bilgi: 'Kullanıcı şifresini kendisi girmeli; asla şifre isteme.' };
      },
    },
    {
      name: 'gorsel_olustur',
      description: 'Paylaşım için çizgi film tarzında görsel (PNG) üretir: alinti (söz), duyuru (başlık + metin), liste (numaralı maddeler), hafta (bu hafta yaptıklarım). Görsel kaydedilir ve panoya kopyalanır; kullanıcı paylaşım ekranında ⌘V ile ekler.',
      parameters: {
        type: 'object',
        properties: {
          sablon: { type: 'string', enum: ['alinti', 'duyuru', 'liste', 'hafta'] },
          baslik: { type: 'string', description: 'Kısa ve vurucu (en fazla ~8 kelime)' },
          metin: { type: 'string' },
          maddeler: { type: 'array', items: { type: 'string' } },
          alt_yazi: { type: 'string', description: 'İmza, tarih ya da kısa etiket' },
          renk: { type: 'string', enum: Object.keys(RENKLER) },
          boyut: { type: 'string', enum: Object.keys(BOYUTLAR), description: 'kare: Instagram/LinkedIn, dikey: Instagram, yatay: X/LinkedIn' },
        },
        required: ['sablon', 'baslik'],
      },
      calistir: async (a, ctx) => {
        if (!ctx.gorselUret) throw new Error('Görsel üretimi bu ortamda kullanılamıyor.');
        const [w, h] = BOYUTLAR[a.boyut] || BOYUTLAR.kare;
        const { png, kucuk } = await ctx.gorselUret(gorselHtml(a), w, h);
        const klasor = path.join(store.DATA_DIR, 'gorseller');
        fs.mkdirSync(klasor, { recursive: true });
        const dosya = path.join(klasor, `${new Date().toISOString().slice(0, 10)}-${store.yeniId('gorsel')}.png`);
        fs.writeFileSync(dosya, png);
        ctx.panoyaGorsel?.(dosya);
        ctx.olay?.('gorsel', { ajan: ctx.ajan?.id, dosya, kucuk });
        return { kaydedildi: dosya, panoya: true, bilgi: 'Görsel panoda; paylaşım ekranında ⌘V ile eklenebilir.' };
      },
    },
  ],
};
