// Defne'nin yönlendirme katmanı. Hedef: kullanıcının sözünü SADECE ilgili ajana, mümkünse hiç API
// harcamadan iletmek. Sıra:
// 1) Yerel komutlar (dur/iptal, evet/hayır onay, sıradaki parça, teşekkür, selam) -> 0 API
// 2) İsimle hitap ("Kerem, ...") -> 0 API
// 3) Yerel anlam eşleşmesi (ajanların örnek cümleleri, yerel gömme modeli) -> 0 API
// 4) Konuşmanın devamı (az önce konuşan ajana kısa cevap) -> 0 API
// 5) Belirsiz / çok konulu ise küçük bir DeepSeek yönlendirme çağrısı
// Öğrenme: kullanıcı "bunu Zeynep'e sor" diye düzeltirse ya da LLM bir yönlendirme yaparsa, o cümle
// ilgili ajanın örneklerine eklenir; benzer sözler bir dahakine API'siz doğru yere gider.
const store = require('./store');
const kadro = require('./kadro');
const deepseek = require('./deepseek');
const hafiza = require('./hafiza');
const onaylar = require('./onaylar');
const araclar = require('./tools');
const sosyal = require('./tools/sosyal');
const config = require('./config');
const okul = require('./tools/okul');
const gorevler = require('./tools/gorevler');

const MAKS_HEDEF = 4;
const ESIK = 0.5;
const FARK = 0.08;
const DEVAM_SURESI_MS = 5 * 60_000;
const OGRENME_SINIRI = 200; // ajan başına öğrenilen örnek
const ZINCIR_SINIRI = 3; // bir turda ajanların birbirine verebileceği görev sayısı
const ZINCIR_DERINLIK = 2;

const KALIP = {
  iptal: /^(dur|sus|kes|iptal( et)?|boş ?ver|tamam yeter|yeter|sessiz ol)[.! ]*$/iu,
  onay: /^(evet|onayla(dım)?|onaylıyorum|olur|tamam|okey|ok|at|gönder|paylaş|yap)( (onu|onayla|at|gönder|paylaş|yap))*[.! ]*$/iu,
  red: /^(hayır|reddet|iptal( et)?|vazgeç|atma|gönderme|paylaşma|yapma|istemiyorum)[.! ]*$/iu,
  sonraki: /^(sıradaki|sonraki|devam( et)?|diğer(ini)?( aç)?|sıradakini aç)( parça| parçayı aç)?[.! ]*$/iu,
  tesekkur: /^(çok )?(teşekkür(ler| ederim)|sağ ?ol(un|asın)?|eyvallah|harikasın|süpersin|eline sağlık)[.! ]*(kanka|defne|ekip|abi|abla)?[.! ]*$/iu,
  hizliNot: /^(aklıma geldi|aklımda olsun|not al|not et|not kutusuna (at|ekle))[:,]?\s+(.{3,})$/iu,
  selam: /^((selam|merhaba|hey|günaydın|iyi akşamlar|iyi geceler|naber|nasılsın|ne haber|napıyorsun|ne yapıyorsun)[,.!? ]*)+(kanka|defne|ekip|millet)?[.!? ]*$/iu,
};

const rastgele = (l) => l[Math.floor(Math.random() * l.length)];

function selamCevabi(metin) {
  const s = new Date().getHours();
  const ad = config.ayarlar().kullaniciAdi || 'kanka';
  if (/iyi geceler/i.test(metin)) return rastgele([`İyi geceler ${ad}, yarın görüşürüz.`, `Tatlı rüyalar ${ad}. Hatırlatmalar bende.`]);
  if (/nasılsın|naber|ne haber/i.test(metin)) return rastgele([`İyiyim ${ad}, ekip de hazır. Sen nasılsın, ne yapıyoruz?`, `Bomba gibiyiz! Sende ne var ne yok?`]);
  const zaman = s < 11 ? 'Günaydın' : s < 18 ? 'Selam' : 'İyi akşamlar';
  return rastgele([`${zaman} ${ad}! Ne yapıyoruz?`, `${zaman}! Buradayım, söyle bakalım.`]);
}

// ---------- Öğrenilen yönlendirme örnekleri ----------
const OGRENME_VARSAYILAN = { ornekler: {} };
const normal = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const ogrenilenler = (id) => store.oku('ogrenme', OGRENME_VARSAYILAN).ornekler[id] || [];

async function ogren(ajanId, metin) {
  const m = String(metin || '').trim();
  const kelime = m.split(/\s+/).length;
  if (!kadro.bul(ajanId) || kelime < 2 || kelime > 25) return false;
  const n = normal(m);
  let baskasindanSilindi = false;
  const yeni = store.guncelle('ogrenme', OGRENME_VARSAYILAN, (o) => {
    // Aynı cümle başka bir ajana öğretilmişse oradan sil (düzeltme önceki öğrenmeyi ezer).
    for (const [id, l] of Object.entries(o.ornekler)) {
      if (id === ajanId) continue;
      const k = l.filter((x) => normal(x) !== n);
      if (k.length !== l.length) baskasindanSilindi = true;
      o.ornekler[id] = k;
    }
    const l = (o.ornekler[ajanId] ||= []);
    if (l.some((x) => normal(x) === n)) return false;
    l.push(m);
    if (l.length > OGRENME_SINIRI) l.shift();
    return true;
  });
  if (baskasindanSilindi) prototipler = null;
  else if (yeni && prototipler) {
    const v = await hafiza.gom([m]);
    const p = prototipler.find((x) => x.ajan.id === ajanId);
    if (v && p) p.vektorler.push(v[0]);
    else prototipler = null;
  }
  return yeni;
}

// "bunu Zeynep'e sor", "hayır bu Elif'in işi" gibi kısa düzeltmeler.
function duzeltmeHedefi(metin) {
  const k = metin.toLocaleLowerCase('tr');
  if (k.split(/\s+/).length > 9) return null;
  if (!/(^|[\s,])(bu|bunu|onu|o|yanlış|hayır)([\s,.!]|$)/u.test(k)) return null;
  if (!/(işi|sor|söyle|ilet|yapsın|baksın|ilgilensin|halletsin|gitsin|gitmeli|kişi)/u.test(k)) return null;
  const adaylar = kadro.liste().filter((a) => [a.name, ...a.lakaplar].some((ad) => new RegExp(`(^|[^\\p{L}])${ad.toLocaleLowerCase('tr')}`, 'u').test(k)));
  return adaylar.length === 1 ? adaylar[0] : null;
}

function oncekiIstek() {
  const l = kadro.sonKayitlar(12).filter((x) => x.rol === 'kullanici');
  const son = l.at(-1);
  return son && Date.now() - new Date(son.tarih).getTime() < 10 * 60_000 ? son : null;
}

// ---------- Bekleyen soru: bir ajan soru sorduysa sıradaki söz ona gider ----------
let bekleyenSoru = null;
function soruSor(ajanId, dk = 10) {
  bekleyenSoru = { ajan: ajanId, bitis: Date.now() + dk * 60_000 };
}

// ---------- Yerel anlam eşleşmesi ----------
let prototipler = null; // [{ ajan, vektorler: Float32Array[] }]
async function prototipleriHazirla() {
  if (prototipler) return prototipler;
  const l = kadro
    .liste()
    .map((a) => ({ a, ornekler: [...a.ornekler, ...ogrenilenler(a.id)] }))
    .filter((x) => x.ornekler.length);
  const hepsi = l.flatMap((x) => x.ornekler);
  const vler = await hafiza.gom(hepsi);
  if (!vler) return null;
  let i = 0;
  prototipler = l.map((x) => ({ ajan: x.a, vektorler: x.ornekler.map(() => vler[i++]) }));
  return prototipler;
}

function nokta(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

async function yerelPuanlar(metin) {
  const p = await prototipleriHazirla();
  if (!p) return null;
  const [q] = (await hafiza.gom([metin])) || [];
  if (!q) return null;
  const kucuk = metin.toLocaleLowerCase('tr');
  return p
    .map(({ ajan, vektorler }) => {
      let s = Math.max(...vektorler.map((v) => nokta(v, q)));
      const isabet = ajan.anahtarlar.filter((k) => kucuk.includes(k.toLocaleLowerCase('tr'))).length;
      s += Math.min(2, isabet) * 0.08;
      return { ajan, puan: s };
    })
    .sort((a, b) => b.puan - a.puan);
}

function isimleHitap(metin) {
  const kucuk = metin.trim().toLocaleLowerCase('tr');
  for (const a of kadro.liste()) {
    for (const ad of [a.name, ...a.lakaplar].map((x) => x.toLocaleLowerCase('tr'))) {
      if (new RegExp(`^((hey|selam|merhaba|bak|ya)\\s+)?${ad}(\\b|'|’|,)`, 'u').test(kucuk)) return a;
    }
  }
  return null;
}

const COK_KONULU = /\s(ve|ayrıca|bir de|sonra da|hem de|aynı zamanda)\s|,\s*(bir de|ayrıca)/iu;

// ---------- LLM yönlendirme (son çare; sabit istem önbelleğe uygun) ----------
function yonlendirmeIstemi() {
  const ekip = kadro
    .liste()
    .map((a) => `- ${a.id}: ${a.rol}`)
    .join('\n');
  return `Sen bir kişisel asistan ekibinin yönlendiricisisin. Kullanıcının sözünü SADECE ilgili ajan(lar)a ilet.
Ekip:
${ekip}
Kurallar: Her ajana sadece kendi kısmını, gereken tüm detaylarla (tarih, saat, isim) yaz. Sohbet/selamlaşma ya da genel soru ise "${kadro.sef().id}" seç. Bir öncekinin devamıysa aynı ajanı seç. Bekleyen onay varken kullanıcı açıkça onaylıyor/reddediyorsa "onay" doldur.
SADECE JSON: {"hedefler":[{"ajan":"<id>","gorev":"<kısa görev>"}],"onay":null}  (onay: {"id":"...","karar":"onay"|"red"})`;
}

async function llmYonlendir(metin, signal) {
  const gecmis = kadro
    .sonKayitlar(6)
    .map((k) => (k.rol === 'kullanici' ? `Kullanıcı: ${k.metin}` : `${k.ajan}: ${k.metin}`))
    .join('\n');
  const bekleyen = onaylar.bekleyenler();
  const ek = bekleyen.length ? `\nBekleyen onaylar: ${bekleyen.map((k) => `[${k.id}] ${k.baslik}`).join(' | ')}` : '';
  const yanit = await deepseek.sohbet({
    mesajlar: [
      { role: 'system', content: yonlendirmeIstemi() },
      { role: 'user', content: `Son konuşmalar:\n${gecmis || '(yok)'}${ek}\n\nYeni söz: ${metin}` },
    ],
    json: true,
    sicaklik: 0,
    maksToken: 250,
    ajan: 'yonlendirici',
    signal,
  });
  let karar;
  try {
    karar = JSON.parse(yanit.content);
  } catch {
    return { hedefler: [{ ajan: kadro.sef().id, gorev: metin }], onay: null };
  }
  const gecerli = new Set(kadro.liste().map((a) => a.id));
  const hedefler = (Array.isArray(karar.hedefler) ? karar.hedefler : [])
    .filter((h) => h && gecerli.has(String(h.ajan).toLowerCase()))
    .map((h) => ({ ajan: String(h.ajan).toLowerCase(), gorev: String(h.gorev || metin) }))
    .slice(0, MAKS_HEDEF);
  const hedefOnay = karar.onay?.id && onaylar.bul(karar.onay.id);
  const riskliOnay = hedefOnay && karar.onay.karar === 'onay' && ['git_gonder', 'onayli_komut'].includes(hedefOnay.arac);
  const onay = hedefOnay && ['onay', 'red'].includes(karar.onay.karar) && !riskliOnay ? karar.onay : null;
  return { hedefler: hedefler.length || onay ? hedefler : [{ ajan: kadro.sef().id, gorev: metin }], onay };
}

// Yerel karar: { tur: 'yerel', ... } | { tur: 'hedef', hedefler, yol } | null (LLM gerekli)
async function yerelKarar(metin) {
  const sade = metin.trim();
  const bekleyen = onaylar.bekleyenler();
  // Geri dönüşü zor işlerde (push, canlıya alma) "tamam/evet" yetmez, açıkça "onaylıyorum" gerekir.
  const riskli = bekleyen.length === 1 && ['git_gonder', 'onayli_komut'].includes(bekleyen[0].arac);
  const onayKalibi = riskli ? /^(onayla|onaylıyorum)[.! ]*$/iu : KALIP.onay;
  if (bekleyen.length === 1 && onayKalibi.test(sade)) return { tur: 'onay', id: bekleyen[0].id, karar: 'onay' };
  if (bekleyen.length === 1 && KALIP.red.test(sade)) return { tur: 'onay', id: bekleyen[0].id, karar: 'red' };
  if (KALIP.iptal.test(sade)) return { tur: 'iptal' };
  const notEslesme = sade.match(KALIP.hizliNot);
  if (notEslesme) return { tur: 'hizliNot', metin: notEslesme[3] };
  const duzeltme = duzeltmeHedefi(sade);
  const onceki = duzeltme && oncekiIstek();
  if (duzeltme && onceki && normal(onceki.metin) !== normal(sade)) return { tur: 'duzeltme', ajan: duzeltme.id, onceki: onceki.metin };
  if (sosyal.aktifPaylasim() && KALIP.sonraki.test(sade)) return { tur: 'sonraki' };
  if (KALIP.tesekkur.test(sade)) return { tur: 'tesekkur' };
  if (KALIP.selam.test(sade)) return { tur: 'selam' };

  const hitap = isimleHitap(sade);
  if (hitap) return { tur: 'hedef', hedefler: [{ ajan: hitap.id, gorev: sade }], yol: 'isim' };

  // Sözlü sınav sürerken cevaplar Zeynep'e gider.
  if (okul.aktifSinav() && kadro.bul('zeynep')) return { tur: 'hedef', hedefler: [{ ajan: 'zeynep', gorev: sade }], yol: 'sinav' };
  // Bir ajan az önce soru sorduysa cevap ona gider.
  if (bekleyenSoru && bekleyenSoru.bitis > Date.now()) {
    const ajan = bekleyenSoru.ajan;
    bekleyenSoru = null;
    return { tur: 'hedef', hedefler: [{ ajan, gorev: sade }], yol: 'soru' };
  }

  const puanlar = await yerelPuanlar(sade);
  const son = kadro.sonKonusan();
  const devamEdiyor = son.ajan && Date.now() - son.zaman < DEVAM_SURESI_MS;
  if (puanlar) {
    const [b, i] = puanlar;
    const cokKonulu = COK_KONULU.test(sade) && i && i.puan >= ESIK - 0.05;
    if (!cokKonulu && b.puan >= ESIK && (!i || b.puan - i.puan >= FARK)) return { tur: 'hedef', hedefler: [{ ajan: b.ajan.id, gorev: sade }], yol: 'anlam', puan: b.puan };
    if (!cokKonulu && devamEdiyor && b.puan < ESIK && sade.split(/\s+/).length <= 10) return { tur: 'hedef', hedefler: [{ ajan: son.ajan, gorev: sade }], yol: 'devam' };
  } else if (devamEdiyor && sade.split(/\s+/).length <= 6) {
    return { tur: 'hedef', hedefler: [{ ajan: son.ajan, gorev: sade }], yol: 'devam' };
  }
  return null;
}

// ---------- Çalıştırma ----------
let aktifIptal = null;
let turSayaci = 0;

// Birden fazla ajanın konuşmasını sıraya koyar. ctx.soyle sırayı korur (ana süreç sesleri
// paralel üretip sırayla gönderir), bu yüzden burada sadece kimin ne zaman konuşacağı belirlenir.
function siraliKonusma(ctx, adet) {
  const kanallar = Array.from({ length: adet }, () => ({ cumleler: [], bitti: false, konustu: false }));
  let aktif = 0;
  let son = Promise.resolve();
  const pompala = () => {
    while (aktif < kanallar.length) {
      const k = kanallar[aktif];
      while (k.cumleler.length) {
        const { ajan, metin } = k.cumleler.shift();
        k.konustu = true;
        if (!ctx.signal?.aborted) son = ctx.soyle(ajan, metin);
      }
      if (!k.bitti) return;
      aktif++;
    }
  };
  return {
    ekle(i, ajan, metin) {
      kanallar[i].cumleler.push({ ajan, metin });
      pompala();
    },
    bitir(i) {
      kanallar[i].bitti = true;
      pompala();
    },
    konustu: (i) => kanallar[i].konustu || kanallar[i].cumleler.length > 0,
    bekle: () => son,
  };
}

// Bir grup ajanı çalıştırır (paralel), sırayla konuşturur. Ajanlar ekibe_gorev_ver ile birbirine iş
// verebilir: bu işler c.zincir'e girer ve ana iş bitince sırayla yapılır (sınırlı sayı ve derinlik).
async function ajanlariCalistir(hedefler, kullaniciMetni, c, derinlik = 0) {
  const sira = siraliKonusma(c, hedefler.length);
  const isler = hedefler.map((h, i) => {
    const ajan = kadro.bul(h.ajan);
    c.olay?.('dusunuyor', { ajan: ajan.id });
    if (ajan.baslarken?.length && derinlik === 0) sira.ekle(i, ajan.id, rastgele(ajan.baslarken));
    const ajanCtx = {
      ...c,
      cumle: (cumle) => sira.ekle(i, ajan.id, cumle),
      gorevVer: (kimden, kime, gorev) => {
        if (derinlik + 1 > ZINCIR_DERINLIK) throw new Error('Görev zinciri çok uzadı; bunu kullanıcıya bırak.');
        if (c.zincir.length >= ZINCIR_SINIRI) throw new Error('Bu turda yeterince görev verildi.');
        c.zincir.push({ kimden, kime, gorev, derinlik: derinlik + 1 });
        c.olay?.('gorev-verildi', { kimden: kimden.id, kime: kime.id });
      },
    };
    return kadro
      .calistir(ajan, { kullaniciMetni, gorev: h.gorev }, ajanCtx)
      .then(
        (cevap) => {
          if (!sira.konustu(i)) sira.ekle(i, ajan.id, cevap || 'Tamamdır.');
          kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin: cevap || 'Tamamdır.' });
        },
        (hata) => {
          if (c.signal?.aborted) return;
          console.error(`[${ajan.id}]`, hata);
          sira.ekle(i, ajan.id, hata instanceof deepseek.KullaniciHatasi ? hata.message : 'Bir sorun çıktı, şu an yapamadım: ' + String(hata.message).slice(0, 120));
        }
      )
      .finally(() => {
        c.olay?.('dusunme-bitti', { ajan: ajan.id });
        sira.bitir(i);
      });
  });
  await Promise.all(isler);
  await sira.bekle();
}

async function zinciriIsle(c) {
  while (c.zincir.length && !c.signal?.aborted) {
    const g = c.zincir.shift();
    await ajanlariCalistir([{ ajan: g.kime.id, gorev: g.gorev }], `(${g.kimden.name} senden istiyor) ${g.gorev}`, c, g.derinlik);
  }
}

async function onayiIsle(id, karar, ctx, args = null) {
  const k = onaylar.bul(id);
  const ajan = kadro.bul(k?.ajan) || kadro.sef();
  try {
    const { sonuc } = await araclar.onayiCoz(id, karar, { ...ctx, ajan, kadro: kadro.liste() }, args);
    ctx.olay?.('onay-cozuldu', { id, karar });
    let metin;
    if (karar !== 'onay') metin = rastgele(['Tamam, iptal ettim.', 'Peki, vazgeçtim.']);
    else if (sonuc?.toplamParca > 1) {
      metin = `İlk parçayı açtım. Gönderince "sıradaki" de, ${sonuc.toplamParca - 1} parça daha var.`;
      ctx.olay?.('paylasim-devam', { sira: 1, toplam: sonuc.toplamParca });
    } else if (sonuc?.acildi) metin = sonuc.bilgi?.includes('panoya') ? 'Metni panoya kopyaladım, pencerede yapıştırıp paylaşabilirsin.' : "Hazır, pencerede Gönder'e basman yeterli.";
    else if (sonuc?.cikisKodu === 0 || sonuc?.push) metin = 'Tamamdır, komut başarıyla çalıştı.';
    else if (sonuc?.cikisKodu) metin = `Komut hata verdi, çıkış kodu ${sonuc.cikisKodu}. İstersen bakayım.`;
    else metin = 'Tamamdır, hallettim.';
    kadro.gecmiseEkle({ rol: 'ajan', ajan: ajan.id, metin });
    hafiza.konusmaEkle(ajan.id, `(onay kartı: ${k?.baslik} -> ${karar})`, metin + (sonuc ? ` Sonuç: ${JSON.stringify(sonuc).slice(0, 300)}` : ''));
    if (sonuc?.devam && kadro.bul(sonuc.devam.ajan)) {
      // Onaylanan plan gibi işlerde ajan kaldığı yerden devam eder.
      await ctx.soyle(ajan.id, rastgele(['Onayladın, başlıyorum.', 'Tamam, plana göre başlıyorum.']));
      const c = { ...ctx, zincir: ctx.zincir || [] };
      await ajanlariCalistir([{ ajan: sonuc.devam.ajan, gorev: sonuc.devam.gorev }], sonuc.devam.gorev, c);
      await zinciriIsle(c);
      c.olay?.('bitti', {});
      return;
    }
    await ctx.soyle(ajan.id, metin);
  } catch (e) {
    ctx.olay?.('onay-cozuldu', { id, karar });
    await ctx.soyle(ajan.id, 'Olmadı, bir hata çıktı: ' + e.message.slice(0, 150));
  }
}

async function sonrakiParca(ctx) {
  const r = await sosyal.sonrakiParca(ctx);
  if (!r) return ctx.soyle('mert', 'Açık bir paylaşım yok.');
  if (r.bitti && !r.acilan) return ctx.soyle('mert', 'Flood bitti, tebrikler!');
  ctx.olay?.('paylasim-devam', { sira: r.acilan, toplam: r.toplam, bitti: r.bitti });
  return ctx.soyle('mert', r.bitti ? `Son parçayı açtım (${r.acilan}/${r.toplam}).` : `${r.acilan}. parçayı açtım.`);
}

async function isle(metin, ctx) {
  metin = String(metin || '').trim();
  if (!metin) return;
  const sef = kadro.sef();
  const iptal = new AbortController();
  aktifIptal = iptal;
  // Her konuşma turunun bir numarası var: kullanıcı araya girerse arayüz o turun kalan cümlelerini atlar.
  const tur = ++turSayaci;
  const asilSoyle = ctx.soyle;
  ctx = { ...ctx, signal: iptal.signal, soyle: (a, m) => asilSoyle(a, m, { tur }), zincir: [] };
  const c = ctx;
  try {
    const yerel = await yerelKarar(metin);
    if (yerel?.tur === 'onay') return await onayiIsle(yerel.id, yerel.karar, c);
    if (yerel?.tur === 'sonraki') return await sonrakiParca(c);
    if (yerel?.tur === 'iptal') return ctx.olay?.('sustur', {});
    if (yerel?.tur === 'tesekkur') {
      const kim = kadro.sonKonusan().ajan || sef.id;
      return await ctx.soyle(kim, rastgele(['Rica ederim!', 'Ne demek, her zaman.', 'Ne demek kanka.', 'Görevimiz!']));
    }
    if (yerel?.tur === 'selam') return await ctx.soyle(sef.id, selamCevabi(metin));
    if (yerel?.tur === 'hizliNot') {
      const n = gorevler.hizliNot(yerel.metin);
      const cem = kadro.bul('cem') || sef;
      ctx.olay?.('arac-sonuc', { ajan: cem.id, arac: 'hizli_not', basarili: true });
      return await ctx.soyle(cem.id, rastgele([`Not kutusuna attım. Kutuda ${n.toplam} not var.`, 'Tamam, not kutusunda. Sonra beraber ayıklarız.']));
    }
    let karar0 = yerel;
    if (yerel?.tur === 'duzeltme') {
      // Önceki isteği doğru kişiye yolla ve bunu öğren.
      await ogren(yerel.ajan, yerel.onceki);
      ctx.olay?.('ogrendi', { ajan: yerel.ajan, metin: yerel.onceki });
      metin = yerel.onceki;
      karar0 = { tur: 'hedef', hedefler: [{ ajan: yerel.ajan, gorev: yerel.onceki }], yol: 'duzeltme' };
    }

    ctx.olay?.('dusunuyor', { ajan: sef.id });
    const karar = karar0 || { ...(await llmYonlendir(metin, iptal.signal)), yol: 'llm' };
    // LLM'in tek ajanlı kararlarını öğren: benzer sözler bir dahakine API'siz gider.
    if (karar.yol === 'llm' && karar.hedefler.length === 1 && karar.hedefler[0].ajan !== sef.id) ogren(karar.hedefler[0].ajan, metin).catch(() => {});
    ctx.olay?.('yonlendirildi', { hedefler: karar.hedefler.map((h) => h.ajan), yol: karar.yol });
    kadro.gecmiseEkle({ rol: 'kullanici', metin, hedefler: karar.hedefler.map((h) => h.ajan) });
    if (karar.onay) await onayiIsle(karar.onay.id, karar.onay.karar, c);
    if (!karar.hedefler.some((h) => h.ajan === sef.id)) ctx.olay?.('dusunme-bitti', { ajan: sef.id });

    await ajanlariCalistir(karar.hedefler, metin, c);
    await zinciriIsle(c);
  } catch (e) {
    if (iptal.signal.aborted) return;
    console.error('[yonetici]', e);
    await ctx.soyle(sef.id, e instanceof deepseek.KullaniciHatasi ? e.message : 'Bir sorun çıktı kanka: ' + String(e.message).slice(0, 150));
  } finally {
    if (aktifIptal === iptal) aktifIptal = null;
    ctx.olay?.('bitti', {});
  }
}

// Sırayla işlesin: kullanıcı peş peşe konuşursa karışmasın. "Dur" gibi iptaller kuyruğu beklemez.
let kuyruk = Promise.resolve();
function sirala(fn) {
  const p = kuyruk.then(fn, fn);
  kuyruk = p.catch(() => {});
  return p;
}

function iptalEt() {
  aktifIptal?.abort(new Error('iptal'));
}

module.exports = {
  isle: (metin, ctx) => {
    if (KALIP.iptal.test(String(metin).trim()) && !onaylar.bekleyenler().length) {
      iptalEt();
      ctx.olay?.('sustur', {});
      return Promise.resolve();
    }
    return sirala(() => isle(metin, ctx));
  },
  onayiIsle: (id, karar, ctx, args) => sirala(() => onayiIsle(id, karar, ctx, args)),
  sonrakiParca: (ctx) => sirala(() => sonrakiParca(ctx)),
  iptalEt,
  sirala,
  yerelKarar,
  llmYonlendir,
  ogren,
  ogrenilenler,
  soruSor,
  duzeltmeHedefi,
  isimleHitap,
  _prototipleriSifirla: () => (prototipler = null),
};
