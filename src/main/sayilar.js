// Seslendirmeden önce rakamları Türkçe okunuşa çevirir (yerel ses modeli rakamları her zaman doğru okumuyor).
// "15:30'da" -> "on beş otuzda", "%20" -> "yüzde yirmi", "72,5" -> "yetmiş iki virgül beş", "2026" -> "iki bin yirmi altı".
const BIRLER = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const ONLAR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const BUYUKLER = ['', 'bin', 'milyon', 'milyar', 'trilyon'];

function ucBasamak(n) {
  const y = Math.floor(n / 100);
  const o = Math.floor((n % 100) / 10);
  const b = n % 10;
  return [y ? (y === 1 ? 'yüz' : `${BIRLER[y]} yüz`) : '', ONLAR[o], BIRLER[b]].filter(Boolean).join(' ');
}

function sayiyiOku(s) {
  const temiz = String(s).replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(s)) return 'sıfır';
  if (temiz.length > 15) return temiz.split('').map((r) => (r === '0' ? 'sıfır' : BIRLER[r])).join(' ');
  let n = Number(temiz);
  const parcalar = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const g = n % 1000;
    if (!g) continue;
    // "bir bin" denmez, "bin" denir.
    parcalar.unshift(i === 1 && g === 1 ? 'bin' : [ucBasamak(g), BUYUKLER[i]].filter(Boolean).join(' '));
  }
  return parcalar.join(' ');
}

// Ondalık kısım: baştaki sıfırlar tek tek okunur ("0,05" -> "sıfır virgül sıfır beş").
function ondalik(s) {
  const bas = s.match(/^0+/)?.[0] || '';
  const kalan = s.slice(bas.length);
  return [...bas].map(() => 'sıfır').concat(kalan ? [sayiyiOku(kalan)] : []).join(' ');
}

const KISALTMALAR = [
  [/\bTL\b/g, 'lira'],
  [/\b(\d+)\s?dk\b/g, '$1 dakika'],
  [/\b(\d+)\s?sn\b/g, '$1 saniye'],
  [/\b(\d+)\s?km\b/g, '$1 kilometre'],
  [/\b(\d+)\s?kg\b/g, '$1 kilo'],
  [/\bvb\./g, 've benzeri'],
  [/\bvs\./g, 'vesaire'],
  [/\bDr\./g, 'Doktor'],
  [/\bProf\./g, 'Profesör'],
  [/\$\s?(\d+(?:[.,]\d+)?)/g, '$1 dolar'],
  [/(\d+(?:[.,]\d+)?)\s?\$/g, '$1 dolar'],
  [/€\s?(\d+(?:[.,]\d+)?)/g, '$1 avro'],
];

function sayilariOku(metin) {
  let m = String(metin || '');
  for (const [r, y] of KISALTMALAR) m = m.replace(r, y);
  return (
    m
      // Yüzde: %20, %7,5
      .replace(/%\s?(\d+)(?:[,.](\d+))?/g, (_, a, b) => `yüzde ${sayiyiOku(a)}${b ? ` virgül ${ondalik(b)}` : ''}`)
      // Saat: 15:30, 09:05
      .replace(/\b(\d{1,2})[:.](\d{2})\b(?!\d)/g, (_, h, m) => `${sayiyiOku(h)} ${m === '00' ? '' : m.startsWith('0') ? 'sıfır ' + BIRLER[m[1]] : sayiyiOku(m)}`.trim())
      // Binlik ayraçlı sayılar: 15.000, 1.250.000
      .replace(/\b\d{1,3}(?:\.\d{3})+\b/g, (s) => s.replace(/\./g, ''))
      // Ondalık: 72,5
      .replace(/\b(\d+),(\d+)\b/g, (_, a, b) => `${sayiyiOku(a)} virgül ${ondalik(b)}`)
      // Kalan tam sayılar
      .replace(/\d+/g, (s) => sayiyiOku(s))
      // Sayıdan sonra gelen kesme işareti: "otuz'da" -> "otuzda"
      .replace(/([a-zçğıöşü])['’](?=[a-zçğıöşü])/gi, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

module.exports = { sayilariOku, sayiyiOku };
