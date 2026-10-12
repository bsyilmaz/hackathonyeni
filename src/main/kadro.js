// Ajanları agents/*.json dosyalarından yükler ve bir ajanı (araç döngüsüyle) çalıştırır.
// Yeni ajan eklemek = agents/ klasörüne yeni bir JSON dosyası koymak.
//
// Token verimliliği:
// - Sistem istemi + araç tanımları her istekte BİREBİR aynıdır (saat, not vb. içermez), böylece
//   DeepSeek'in otomatik önbelleği bu kısmı ~10 kat ucuza sayar.
// - Değişken her şey (saat, ilgili hatıralar, proje durumu) en sondaki kullanıcı mesajına eklenir.
// - Hafızanın tamamı değil, yerel modelle bulunan en ilgili birkaç kayıt eklenir.
// - Sadece son 12 saatin konuşması (en fazla 6) birebir eklenir; eskisi hafızadan gerekirse çekilir.
const fs = require('fs');
const path = require('path');
const store = require('./store');
const config = require('./config');
const hafiza = require('./hafiza');
const araclar = require('./tools');
const deepseek = require('./deepseek');
const { suAnMetni, ofset } = require('./zaman');
const { sesliMetin, CumleBolucu } = require('./metin');

const AJAN_KLASORU = path.join(store.ROOT, 'agents');
const VARSAYILAN_GORUNUM = { ten: '#f1c7a3', sac: '#3b2a20', sacStili: 'kisa', kiyafet: '#8892b0', aksesuar: '', vurgu: '#ffffff' };
const VARSAYILAN_SES = { ad: 'tr-TR-EmelNeural', hiz: '+0%', perde: '+0Hz' };
const ARAC_SONUCU_SINIRI = 20_000;

let ajanlar = null;
let sonKonusan = { ajan: null, zaman: 0 };

function yukle() {
  const liste = [];
  for (const dosya of fs.readdirSync(AJAN_KLASORU).filter((f) => f.endsWith('.json')).sort()) {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(AJAN_KLASORU, dosya), 'utf8'));
      if (!a.id || !a.name || !a.rol) throw new Error('id, name ve rol zorunlu');
      a.id = String(a.id).toLowerCase();
      a.gorunum = { ...VARSAYILAN_GORUNUM, ...(a.gorunum || {}) };
      a.araclar = (a.araclar || []).filter((t) => {
        if (araclar.KAYIT.has(t)) return true;
        console.error(`[kadro] ${a.id}: bilinmeyen araç "${t}" atlandı`);
        return false;
      });
      a.hafiza = a.hafiza || {};
      a.ornekler = a.ornekler || [];
      a.anahtarlar = a.anahtarlar || [];
      a.lakaplar = a.lakaplar || [];
      liste.push(a);
    } catch (e) {
      console.error(`[kadro] ${dosya} yüklenemedi:`, e.message);
    }
  }
  if (!liste.some((a) => a.yonlendirici) && liste.length) liste[0].yonlendirici = true;
  ajanlar = liste;
  return liste;
}

const liste = () => ajanlar || yukle();
const bul = (id) => liste().find((a) => a.id === id);
const sef = () => liste().find((a) => a.yonlendirici);

function sesi(ajan) {
  return { ...VARSAYILAN_SES, ...(ajan.ses || {}), ...(config.ayarlar().sesler?.[ajan.id] || {}) };
}

function arayuzIcin() {
  return liste().map((a) => ({ id: a.id, name: a.name, rol: a.rol, renk: a.renk || a.gorunum.kiyafet, gorunum: a.gorunum, yonlendirici: !!a.yonlendirici, ses: sesi(a) }));
}

// Arayüz ve yönlendirici için kısa ortak konuşma kaydı (kalıcı arşiv hafiza.js'de).
const GECMIS_VARSAYILAN = { kayitlar: [] };
function gecmiseEkle(kayit) {
  store.guncelle('gecmis', GECMIS_VARSAYILAN, (g) => {
    g.kayitlar.push({ ...kayit, tarih: new Date().toISOString() });
    g.kayitlar = g.kayitlar.slice(-60);
  });
  if (kayit.rol === 'ajan') sonKonusan = { ajan: kayit.ajan, zaman: Date.now() };
}
const sonKayitlar = (n = 8) => store.oku('gecmis', GECMIS_VARSAYILAN).kayitlar.slice(-n);

// ---- Sabit sistem istemi (önbelleğe uygun) ----
function sistemIstemi(ajan) {
  const ad = config.ayarlar().kullaniciAdi;
  const ekip = liste()
    .filter((x) => x.id !== ajan.id)
    .map((x) => `- ${x.name} (${x.id}): ${x.rol}`)
    .join('\n');
  return `Sen ${ajan.name}'sin. ${ajan.persona || ''}
Görevin: ${ajan.rol}
Kullanıcı${ad ? ` (${ad})` : ''} senin patronun ve arkadaşın. Bir ekip olarak onun hayatını kolaylaştırıyorsunuz.

Ekip arkadaşların:
${ekip}

Kurallar:
- Türkçe konuş. Cevabın SESLİ okunacak: markdown, madde işareti, emoji, link, kod bloğu, tablo YOK.
- Gerçek bir insan gibi doğal ve KISA konuş (genelde 1-3 cümle). Liste okuma; en önemlisini söyle.
- Uydurma. Kayıtlı veriyi araçla kontrol et; işi araçla gerçekten yap, yapmadığın işi yaptım deme. Araç hata verirse hatayı düzeltip tekrar dene ya da kullanıcıya dürüstçe söyle.
- Belirsizse (hangi gün? hangi kayıt?) tahmin etme, kısa bir soru sor.
- Tarih/saatleri araçlara ISO 8601 ve saat dilimiyle (${ofset()}) ver; "yarın", "cuma" gibi ifadeleri mesajdaki "Şu an" bilgisine göre hesapla.
- Sadece kendi alanındaki işi yap. Başka bir ekip arkadaşını ilgilendiren önemli bir bilgi varsa ekibe_ilet ile SADECE ona ilet.
- Kullanıcı hakkında kalıcı, işe yarar bir şey öğrenirsen hatirla ile kaydet. Önemsiz şeyleri kaydetme.
- Mesajın başındaki [Bağlam] bölümü sana yardımcı bilgidir; ilgili değilse görmezden gel ve ondan bahsetme.`;
}

async function dinamikBaglam(ajan, metin, haric) {
  const parcalar = [`Şu an: ${suAnMetni()}`];
  const ek = ajan.baglam && araclar.BAGLAM_EKLERI[ajan.baglam];
  if (ek) parcalar.push(ek());
  const ilgili = await hafiza.ara(ajan, metin, { k: 6, haric });
  if (ilgili.length) parcalar.push('İlgili hatıraların:\n' + ilgili.map(hafiza.satir).join('\n'));
  return `[Bağlam]\n${parcalar.join('\n')}`;
}

// Ajanı çalıştırır: araçları kullanır, sonunda kullanıcıya söyleyeceği metni döndürür.
// ctx.cumle(metin) verilirse cevap akış halinde, cümle cümle hemen seslendirilmek üzere iletilir
// (araç kullanmadan önce söylediği "bakıyorum" gibi ara cümleler dahil).
async function calistir(ajan, { kullaniciMetni, gorev, arsivle = true }, ctx = {}) {
  const tanimlar = araclar.ajanAraclari(ajan, liste());
  const yakin = hafiza.sonKonusmalar(ajan.id);
  const gecmisMesajlar = yakin.flatMap((k) => [
    { role: 'user', content: k.kullanici },
    { role: 'assistant', content: k.cevap },
  ]);
  const baglam = await dinamikBaglam(ajan, `${kullaniciMetni} ${gorev || ''}`, new Set(yakin.map((k) => k.id)));
  const not = gorev && gorev.trim() !== kullaniciMetni.trim() ? `\n[Defne'nin notu: ${gorev}]` : '';
  const mesajlar = [{ role: 'system', content: sistemIstemi(ajan) }, ...gecmisMesajlar, { role: 'user', content: `${baglam}\n\n[Kullanıcı]: ${kullaniciMetni}${not}` }];
  const maks = ajan.maksimumAdim || 8;
  const aracCtx = { ...ctx, ajan, kadro: liste() };
  const opts = { araclar: tanimlar, ajan: ajan.id, maksToken: ajan.maksToken || 500, signal: ctx.signal, zorunlu: ctx.zorunlu ?? true };
  const soylenen = [];

  // Tek bir model çağrısı; varsa akışla cümle cümle seslendirir.
  const cagir = async (ek) => {
    let bolucu = null;
    let akisGeldi = false;
    if (ctx.cumle) {
      bolucu = new CumleBolucu((c) => {
        soylenen.push(c);
        ctx.cumle(c);
      });
    }
    const yanit = await deepseek.sohbet({
      ...opts,
      ...ek,
      akis: bolucu
        ? (p) => {
            akisGeldi = true;
            bolucu.ekle(p);
          }
        : undefined,
    });
    if (bolucu) {
      if (!akisGeldi && yanit.content) bolucu.ekle(yanit.content);
      bolucu.bitir();
    }
    return yanit;
  };

  let cevap = null;
  for (let adim = 0; adim < maks && cevap === null; adim++) {
    const yanit = await cagir({ mesajlar });
    if (!yanit.tool_calls.length) {
      cevap = sesliMetin(yanit.content);
      break;
    }
    mesajlar.push({ role: 'assistant', content: yanit.content || '', tool_calls: yanit.tool_calls });
    for (const cagri of yanit.tool_calls) {
      const ad = cagri.function.name;
      ctx.olay?.('arac', { ajan: ajan.id, arac: ad });
      let sonuc;
      let basarili = true;
      try {
        const args = JSON.parse(cagri.function.arguments || '{}');
        sonuc = await araclar.calistir(ad, args, aracCtx);
      } catch (e) {
        if (ctx.signal?.aborted) throw e;
        basarili = false;
        sonuc = { hata: e.message };
      }
      ctx.olay?.('arac-sonuc', { ajan: ajan.id, arac: ad, basarili: basarili && !sonuc?.zatenVar });
      let metin = JSON.stringify(sonuc ?? null);
      if (metin.length > ARAC_SONUCU_SINIRI) metin = metin.slice(0, ARAC_SONUCU_SINIRI) + '…(kesildi)';
      mesajlar.push({ role: 'tool', tool_call_id: cagri.id, content: metin });
    }
  }
  if (cevap === null) {
    const son = await cagir({ araclar: undefined, mesajlar: [...mesajlar, { role: 'user', content: 'Adım sınırına geldin. Ne yaptığını ve kalanı kısaca, sesli söyleyecek şekilde özetle.' }] });
    cevap = sesliMetin(son.content);
  }
  // Akışta söylenenlerin tamamı (ara cümleler dahil) arşivlenir.
  const tamami = soylenen.length ? soylenen.join(' ') : cevap;
  if (arsivle) hafiza.konusmaEkle(ajan.id, kullaniciMetni, tamami);
  return tamami;
}

module.exports = {
  yukle,
  liste,
  bul,
  sef,
  sesi,
  arayuzIcin,
  calistir,
  gecmiseEkle,
  sonKayitlar,
  sesliMetin,
  sistemIstemi,
  sonKonusan: () => sonKonusan,
};
