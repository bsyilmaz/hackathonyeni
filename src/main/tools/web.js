// İnternette araştırma (ücretsiz, API anahtarı yok).
// - web_ara: DuckDuckGo'nun HTML arayüzünden sonuç listesi.
// - sayfa_oku: sayfayı indirir, BİLGİSAYARDA sadeleştirir; "odak" verilirse yerel anlam modeliyle sadece
//   en ilgili paragrafları seçer. Böylece DeepSeek'e tüm sayfa değil birkaç yüz kelime gider.
// Güvenlik: sadece http(s); yerel ağ / iç IP adreslerine gidilmez (SSRF koruması); boyut ve süre sınırı var.
const dns = require('dns').promises;
const net = require('net');
const hafiza = require('../hafiza');

const TARAYICI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const MAKS_BAYT = 3_000_000;
const MAKS_METIN = 7000;

function ozelIpMi(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const k = ip.toLowerCase();
  return k === '::1' || k === '::' || k.startsWith('fc') || k.startsWith('fd') || k.startsWith('fe80') || k.startsWith('::ffff:');
}

async function urlKontrol(adres) {
  let u;
  try {
    u = new URL(String(adres).trim());
  } catch {
    throw new Error('Geçersiz adres.');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Sadece http/https adresleri okunabilir.');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error('Yerel adreslere erişilmez.');
  const ipler = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!ipler.length) throw new Error('Alan adı çözülemedi: ' + u.hostname);
  if (ipler.some((x) => ozelIpMi(x.address))) throw new Error('İç ağ adreslerine erişilmez.');
  return u;
}

// Yönlendirmeleri elle takip eder; her adımda adres yeniden kontrol edilir.
async function getir(adres, { method = 'GET', body, headers = {} } = {}) {
  let u = await urlKontrol(adres);
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { method, body, headers: { 'User-Agent': TARAYICI, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8', ...headers }, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      u = await urlKontrol(new URL(r.headers.get('location'), u).toString());
      method = 'GET';
      body = undefined;
      continue;
    }
    if (!r.ok) throw new Error(`Sayfa açılamadı (HTTP ${r.status}).`);
    const tur = r.headers.get('content-type') || '';
    if (!/text\/|html|json|xml/.test(tur)) throw new Error(`Bu bir metin sayfası değil (${tur.split(';')[0] || 'bilinmiyor'}).`);
    const okuyucu = r.body.getReader();
    const parcalar = [];
    let boy = 0;
    for (;;) {
      const { done, value } = await okuyucu.read();
      if (done) break;
      boy += value.length;
      if (boy > MAKS_BAYT) {
        okuyucu.cancel();
        break;
      }
      parcalar.push(value);
    }
    return { url: u.toString(), metin: Buffer.concat(parcalar).toString('utf8'), tur };
  }
  throw new Error('Çok fazla yönlendirme.');
}

const VARLIKLAR = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', ndash: '-', mdash: '-', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
function varlikCoz(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, v) => {
    if (v[0] === '#') {
      const n = v[1] === 'x' || v[1] === 'X' ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return VARLIKLAR[v.toLowerCase()] ?? m;
  });
}

// HTML'den okunabilir metin: script/stil/menü/altbilgi atılır, varsa <article>/<main> tercih edilir.
function htmlMetne(html) {
  let h = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|iframe|template|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|aside|header)[\s\S]*?<\/\1>/gi, ' ');
  const baslik = varlikCoz((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].replace(/\s+/g, ' ').trim());
  const ana = h.match(/<article[\s\S]*?<\/article>/i) || h.match(/<main[\s\S]*?<\/main>/i);
  if (ana && ana[0].length > 800) h = ana[0];
  const metin = varlikCoz(
    h
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/pre)[^>]*>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<h[1-6][^>]*>/gi, '\n## ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { baslik, metin };
}

function parcala(metin, boy = 600) {
  // Paragraflara böl; çok uzun paragrafları cümle sınırlarından ~boy uzunluğunda parçala.
  const paragraflar = metin
    .split(/\n{1,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 30)
    .flatMap((p) => {
      if (p.length <= boy * 1.5) return [p];
      const cumleler = p.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [p];
      const l = [];
      let t = '';
      for (const c of cumleler) {
        if ((t + c).length > boy && t) {
          l.push(t.trim());
          t = '';
        }
        t += c.length > boy * 2 ? c.slice(0, boy * 2) : c;
      }
      if (t.trim()) l.push(t.trim());
      return l;
    });
  const sonuc = [];
  let simdiki = '';
  for (const p of paragraflar) {
    if ((simdiki + '\n' + p).length > boy && simdiki) {
      sonuc.push(simdiki);
      simdiki = p;
    } else simdiki = simdiki ? simdiki + '\n' + p : p;
  }
  if (simdiki) sonuc.push(simdiki);
  return sonuc;
}

// Metinden, odak sorusuyla en ilgili parçaları seçer (yerel gömme; yoksa kelime eşleşmesi).
async function ilgiliParcalar(metin, odak, { adet = 6, sinir = MAKS_METIN } = {}) {
  if (!odak) return metin.slice(0, sinir);
  const parcalar = parcala(metin).slice(0, 200);
  if (parcalar.length <= adet) return parcalar.join('\n\n').slice(0, sinir);
  let puanlar;
  const v = await hafiza.gom([odak, ...parcalar]);
  if (v) {
    const [q, ...pv] = v;
    puanlar = pv.map((x) => x.reduce((t, y, i) => t + y * q[i], 0));
  } else {
    const k = String(odak).toLocaleLowerCase('tr').split(/\s+/).filter((w) => w.length > 2).map((w) => w.slice(0, 5));
    puanlar = parcalar.map((p) => k.filter((w) => p.toLocaleLowerCase('tr').includes(w)).length);
  }
  const secilen = puanlar
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p - a.p)
    .slice(0, adet)
    .sort((a, b) => a.i - b.i)
    .map((x) => parcalar[x.i]);
  return secilen.join('\n\n…\n\n').slice(0, sinir);
}

function ddgSonuclari(html) {
  const sonuc = [];
  // İki biçim: html.duckduckgo.com (class="result__a" ... "result__snippet") ve lite.duckduckgo.com (class='result-link' ... 'result-snippet').
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*class=["']result(?:__a|-link)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?class=["']result(?:__snippet|-snippet)["'][^>]*>([\s\S]*?)<\/(?:a|div|td)>|<a[^>]+class=["']result__a["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?class=["']result__snippet["'][^>]*>([\s\S]*?)<\/(?:a|div|td)>/g;
  let m;
  while ((m = re.exec(html))) {
    if (!m[1]) m = [m[0], m[4], m[5], m[6]];
    let url = varlikCoz(m[1]);
    const ic = url.match(/[?&]uddg=([^&]+)/);
    if (ic) url = decodeURIComponent(ic[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    if (/duckduckgo\.com\/y\.js|ad_provider|bing\.com\/aclick/.test(url)) continue; // reklam
    sonuc.push({ baslik: varlikCoz(m[2].replace(/<[^>]+>/g, '')).trim(), url, ozet: varlikCoz(m[3].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() });
  }
  return sonuc;
}

module.exports = {
  htmlMetne,
  ilgiliParcalar,
  ddgSonuclari,
  ozelIpMi,
  urlKontrol,
  araclar: [
    {
      name: 'web_ara',
      description: 'İnternette arama yapar; başlık, adres ve kısa özet listesi döner. Güncel bilgi, doküman ya da kaynak gerektiğinde kullan; ardından sayfa_oku ile detaya bak.',
      parameters: { type: 'object', properties: { sorgu: { type: 'string' }, adet: { type: 'number', description: 'Varsayılan 6, en fazla 10' } }, required: ['sorgu'] },
      calistir: async (a) => {
        const q = encodeURIComponent(String(a.sorgu).slice(0, 300));
        // Önce hafif "lite" sürüm; olmazsa HTML sürüm. Bot doğrulaması çıkarsa aşmaya çalışılmaz.
        let metin = '';
        for (const deneme of [() => getir(`https://lite.duckduckgo.com/lite/?q=${q}&kl=tr-tr`), () => getir('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `q=${q}&kl=tr-tr` })]) {
          try {
            metin = (await deneme()).metin;
          } catch {
            metin = '';
          }
          if (ddgSonuclari(metin).length) break;
        }
        const l = ddgSonuclari(metin).slice(0, Math.min(10, Number(a.adet) || 6));
        if (!l.length) return { sonuc: [], bilgi: 'Sonuç bulunamadı ya da arama motoru şu an cevap vermiyor; sorguyu değiştir.' };
        return { sonuclar: l };
      },
    },
    {
      name: 'sayfa_oku',
      description: 'Bir web sayfasını okur ve sadeleştirilmiş metnini döndürür. "odak" verirsen (ne aradığın) sadece en ilgili kısımlar gelir; her zaman odak ver.',
      parameters: { type: 'object', properties: { url: { type: 'string' }, odak: { type: 'string', description: 'Sayfada ne arıyorsun?' } }, required: ['url'] },
      calistir: async (a) => {
        const s = await getir(a.url);
        const { baslik, metin } = /html/.test(s.tur) ? htmlMetne(s.metin) : { baslik: '', metin: s.metin };
        if (metin.length < 80) return { url: s.url, baslik, uyari: 'Sayfadan okunabilir metin çıkmadı (JavaScript ile yükleniyor olabilir).' };
        return { url: s.url, baslik, icerik: await ilgiliParcalar(metin, a.odak), toplamUzunluk: metin.length };
      },
    },
  ],
};
