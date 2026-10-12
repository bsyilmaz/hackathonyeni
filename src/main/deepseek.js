// DeepSeek sohbet API'si (OpenAI uyumlu /chat/completions).
// - Her çağrının token kullanımı (önbellek isabeti dahil) data/kullanim.json'a yazılır.
// - Aylık bütçe dolarsa "zorunlu olmayan" çağrılar (brifing vb.) yapılmaz, diğerleri uyarıyla durur.
// - Geçici hatalarda (429/5xx/ağ) 2 kez tekrar dener.
const config = require('./config');
const store = require('./store');

class KullaniciHatasi extends Error {}

const KULLANIM_VARSAYILAN = { aylar: {} };

function ayAnahtari(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function maliyet(k, a = config.ayarlar()) {
  return (k.isabet * a.fiyatOnbellekIsabet + k.kacirma * a.fiyatOnbellekKacirma + k.cikti * a.fiyatCikti) / 1e6;
}

function kullanimKaydet(ajan, usage) {
  if (!usage) return;
  const isabet = usage.prompt_cache_hit_tokens ?? 0;
  const kacirma = usage.prompt_cache_miss_tokens ?? Math.max(0, (usage.prompt_tokens || 0) - isabet);
  const cikti = usage.completion_tokens || 0;
  store.guncelle('kullanim', KULLANIM_VARSAYILAN, (k) => {
    const ay = (k.aylar[ayAnahtari()] ||= { cagri: 0, isabet: 0, kacirma: 0, cikti: 0, ajanlar: {} });
    const aj = (ay.ajanlar[ajan || 'diger'] ||= { cagri: 0, isabet: 0, kacirma: 0, cikti: 0 });
    for (const h of [ay, aj]) {
      h.cagri += 1;
      h.isabet += isabet;
      h.kacirma += kacirma;
      h.cikti += cikti;
    }
  });
}

function buAy() {
  const ay = store.oku('kullanim', KULLANIM_VARSAYILAN).aylar[ayAnahtari()] || { cagri: 0, isabet: 0, kacirma: 0, cikti: 0, ajanlar: {} };
  const girdi = ay.isabet + ay.kacirma;
  return {
    ...ay,
    maliyetUSD: maliyet(ay),
    onbellekOrani: girdi ? ay.isabet / girdi : 0,
    ajanlar: Object.fromEntries(Object.entries(ay.ajanlar).map(([id, a]) => [id, { ...a, maliyetUSD: maliyet(a) }])),
  };
}

function butceDoldu() {
  const b = config.ayarlar().aylikButceUSD;
  return b > 0 && buAy().maliyetUSD >= b;
}

const bekle = (ms, signal) =>
  new Promise((r, j) => {
    const t = setTimeout(r, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      j(signal.reason);
    });
  });

// Akışlı (stream) cevabı okur: metin parçalarını geldikçe akis() ile iletir, araç çağrılarını birleştirir.
async function akisOku(yanit, akis, ajan) {
  const okuyucu = yanit.body.getReader();
  const cozucu = new TextDecoder();
  let tampon = '';
  let icerik = '';
  let bitis = null;
  let usage = null;
  const cagrilar = [];
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    tampon += cozucu.decode(value, { stream: true });
    let i;
    while ((i = tampon.indexOf('\n')) >= 0) {
      const satir = tampon.slice(0, i).trim();
      tampon = tampon.slice(i + 1);
      if (!satir.startsWith('data:')) continue;
      const veri = satir.slice(5).trim();
      if (!veri || veri === '[DONE]') continue;
      let j;
      try {
        j = JSON.parse(veri);
      } catch {
        continue;
      }
      if (j.usage) usage = j.usage;
      const c = j.choices?.[0];
      if (!c) continue;
      const d = c.delta || {};
      if (d.content) {
        icerik += d.content;
        try {
          akis(d.content);
        } catch (e) {
          console.error('[akis]', e);
        }
      }
      for (const tc of d.tool_calls || []) {
        const x = (cagrilar[tc.index ?? cagrilar.length] ||= { id: '', type: 'function', function: { name: '', arguments: '' } });
        if (tc.id) x.id = tc.id;
        if (tc.function?.name) x.function.name += tc.function.name;
        if (tc.function?.arguments) x.function.arguments += tc.function.arguments;
      }
      if (c.finish_reason) bitis = c.finish_reason;
    }
  }
  kullanimKaydet(ajan, usage);
  return { content: icerik, tool_calls: cagrilar.filter(Boolean), bitis };
}

// opts: { mesajlar, araclar, json, sicaklik, maksToken, ajan, zorunlu, signal, akis(parca) }
async function gercekSohbet({ mesajlar, araclar, json = false, sicaklik = 0.6, maksToken = 500, ajan, zorunlu = true, signal, akis }) {
  const anahtar = config.gizliOku('deepseekApiKey');
  if (!anahtar) throw new KullaniciHatasi('DeepSeek API anahtarı girilmemiş. Sağ alttaki ayarlardan ekleyebilirsin.');
  if (butceDoldu()) {
    throw new KullaniciHatasi(zorunlu ? 'Bu ayın DeepSeek bütçesi doldu kanka. Ayarlardan bütçeyi artırabilirsin.' : 'bütçe doldu');
  }
  const a = config.ayarlar();
  const govde = { model: a.deepseekModel, messages: mesajlar, temperature: sicaklik, max_tokens: maksToken };
  if (araclar && araclar.length) {
    govde.tools = araclar.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
  if (json) govde.response_format = { type: 'json_object' };
  if (akis) {
    govde.stream = true;
    govde.stream_options = { include_usage: true };
  }

  let sonHata;
  for (let deneme = 0; deneme < 3; deneme++) {
    if (deneme) await bekle(deneme === 1 ? 1500 : 4000, signal);
    let yanit;
    try {
      yanit = await fetch(a.deepseekAdres.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${anahtar}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(govde),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      sonHata = new KullaniciHatasi("İnternete ya da DeepSeek'e ulaşamıyorum kanka.");
      continue;
    }
    if (yanit.ok) {
      if (akis) return akisOku(yanit, akis, ajan);
      const veri = await yanit.json();
      kullanimKaydet(ajan, veri.usage);
      const m = veri.choices?.[0]?.message;
      if (!m) throw new Error('DeepSeek boş cevap döndü.');
      return { content: m.content || '', tool_calls: m.tool_calls || [], bitis: veri.choices[0].finish_reason };
    }
    const metin = await yanit.text().catch(() => '');
    if (yanit.status === 401) throw new KullaniciHatasi('DeepSeek API anahtarı geçersiz görünüyor.');
    if (yanit.status === 402) throw new KullaniciHatasi('DeepSeek hesabında bakiye kalmamış.');
    if (yanit.status === 400) throw new Error(`DeepSeek isteği reddetti: ${metin.slice(0, 300)}`);
    sonHata = yanit.status === 429 ? new KullaniciHatasi('DeepSeek şu an çok yoğun, birazdan tekrar dene.') : new Error(`DeepSeek hatası ${yanit.status}: ${metin.slice(0, 200)}`);
    if (yanit.status !== 429 && yanit.status < 500) break;
  }
  throw sonHata;
}

let uygulama = gercekSohbet;

module.exports = {
  KullaniciHatasi,
  sohbet: (opts) => uygulama(opts),
  buAy,
  butceDoldu,
  _kullanimKaydet: kullanimKaydet,
  // Testlerde sahte model takmak için.
  _degistir: (fn) => {
    uygulama = fn || gercekSohbet;
  },
};
