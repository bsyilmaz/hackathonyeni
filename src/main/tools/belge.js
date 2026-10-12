// Belgeler: kullanıcının uygulamaya bıraktığı dosyalar (PDF, görsel, Word, metin).
// Metin BİLGİSAYARDA çıkarılır: PDF -> pdf.js, görsel -> Tesseract (Türkçe yazı tanıma),
// Word/RTF/HTML -> macOS'un kendi textutil aracı. Sonuç önbelleğe yazılır, tekrar işlenmez.
// Ajanlara belgenin tamamı değil, istenen bölüm ya da soruyla en ilgili parçalar verilir.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const store = require('../store');
const z = require('../zaman');
const web = require('./web');

const VARSAYILAN = { kayitlar: [] };
const MAKS_BOYUT = 50 * 1024 * 1024;
const BOLUM = 6000;
const TURLER = {
  pdf: ['.pdf'],
  gorsel: ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff', '.heic', '.gif'],
  belge: ['.docx', '.doc', '.rtf', '.odt', '.html', '.htm', '.pages'],
  metin: ['.txt', '.md', '.csv', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.css', '.log', '.xml', '.yaml', '.yml'],
};

const klasor = () => {
  const k = path.join(store.DATA_DIR, 'belgeler');
  fs.mkdirSync(k, { recursive: true });
  return k;
};
const tur = (ad) => Object.entries(TURLER).find(([, l]) => l.includes(path.extname(ad).toLowerCase()))?.[0] || null;

function calistir(komut, args, { zaman = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(komut, args, { timeout: zaman, maxBuffer: 50 * 1024 * 1024 }, (hata, stdout, stderr) => (hata ? reject(new Error((stderr || hata.message).slice(0, 300))) : resolve(stdout)));
  });
}

async function pdfMetni(yol) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const yukleme = getDocument({ data: new Uint8Array(fs.readFileSync(yol)), isEvalSupported: false, useSystemFonts: false, verbosity: 0 });
  const doc = await yukleme.promise;
  const sayfalar = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
      const t = await (await doc.getPage(i)).getTextContent();
      sayfalar.push(`[Sayfa ${i}]\n` + t.items.map((x) => x.str + (x.hasEOL ? '\n' : '')).join(''));
    }
    return { metin: sayfalar.join('\n\n'), sayfa: doc.numPages };
  } finally {
    await yukleme.destroy(); // pdf.js'in iç işçisini kapat (bellek ve açık kaynak kalmasın)
  }
}

let ocrIscisi = null;
async function ocr(yol) {
  if (!ocrIscisi) {
    const { createWorker } = require('tesseract.js');
    const cache = path.join(store.DATA_DIR, 'modeller', 'ocr');
    fs.mkdirSync(cache, { recursive: true });
    ocrIscisi = createWorker(['tur', 'eng'], 1, { cachePath: cache }).catch((e) => {
      ocrIscisi = null;
      throw e;
    });
  }
  const w = await ocrIscisi;
  // HEIC/GIF/TIFF gibi biçimleri önce PNG'ye çevir (macOS sips, sadece geçici dosyaya yazar).
  let girdi = yol;
  if (!/\.(png|jpe?g|bmp|webp)$/i.test(yol)) {
    girdi = path.join(os.tmpdir(), `aikadro-ocr-${Date.now()}.png`);
    await calistir('/usr/bin/sips', ['-s', 'format', 'png', yol, '--out', girdi]);
  }
  try {
    const { data } = await w.recognize(girdi);
    return data.text;
  } finally {
    if (girdi !== yol) fs.rmSync(girdi, { force: true });
  }
}

async function metinCikar(yol, t) {
  if (t === 'pdf') {
    const r = await pdfMetni(yol);
    // Taranmış PDF: yazı yoksa ilk sayfayı görsele çevirip oku.
    if (r.metin.replace(/\[Sayfa \d+\]|\s/g, '').length < 40) {
      const png = path.join(os.tmpdir(), `aikadro-pdf-${Date.now()}.png`);
      await calistir('/usr/bin/sips', ['-s', 'format', 'png', yol, '--out', png]);
      try {
        return { metin: `[Taranmış belge, sadece ilk sayfa okundu]\n${await ocr(png)}`, sayfa: r.sayfa };
      } finally {
        fs.rmSync(png, { force: true });
      }
    }
    return r;
  }
  if (t === 'gorsel') return { metin: await ocr(yol) };
  if (t === 'belge') {
    if (/\.html?$/i.test(yol)) return { metin: web.htmlMetne(fs.readFileSync(yol, 'utf8')).metin };
    return { metin: await calistir('/usr/bin/textutil', ['-convert', 'txt', '-stdout', yol]) };
  }
  return { metin: fs.readFileSync(yol, 'utf8') };
}

// Arayüzden bırakılan dosyayı kopyalar ve metnini çıkarır (asıl dosyaya dokunmaz).
async function belgeEkle(kaynak, olay) {
  const st = fs.statSync(kaynak);
  if (!st.isFile()) throw new Error('Sadece dosya bırakılabilir.');
  if (st.size > MAKS_BOYUT) throw new Error('Dosya çok büyük (50 MB sınırı).');
  const t = tur(kaynak);
  if (!t) throw new Error(`Bu dosya türü okunamıyor: ${path.extname(kaynak) || 'uzantısız'}`);
  const id = store.yeniId('belge');
  const hedef = path.join(klasor(), id + path.extname(kaynak).toLowerCase());
  fs.copyFileSync(kaynak, hedef);
  const kayit = { id, ad: path.basename(kaynak).normalize('NFC'), tur: t, yol: hedef, boyut: st.size, tarih: new Date().toISOString(), durum: 'okunuyor' };
  store.guncelle('belgeler', VARSAYILAN, (b) => b.kayitlar.push(kayit));
  olay?.('belge-durum', { id, ad: kayit.ad, durum: 'okunuyor' });
  try {
    const r = await metinCikar(hedef, t);
    const metin = String(r.metin || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim();
    fs.writeFileSync(path.join(klasor(), id + '.txt'), metin);
    store.guncelle('belgeler', VARSAYILAN, (b) => Object.assign(b.kayitlar.find((x) => x.id === id), { durum: 'hazir', uzunluk: metin.length, sayfa: r.sayfa || null }));
    olay?.('belge-durum', { id, ad: kayit.ad, durum: 'hazir', uzunluk: metin.length });
  } catch (e) {
    store.guncelle('belgeler', VARSAYILAN, (b) => Object.assign(b.kayitlar.find((x) => x.id === id), { durum: 'hata', hata: e.message }));
    olay?.('belge-durum', { id, ad: kayit.ad, durum: 'hata', hata: e.message });
  }
  return store.oku('belgeler', VARSAYILAN).kayitlar.find((x) => x.id === id);
}

function bul(id) {
  const l = store.oku('belgeler', VARSAYILAN).kayitlar;
  const b = l.find((x) => x.id === id) || l.find((x) => x.ad.toLocaleLowerCase('tr').includes(String(id).toLocaleLowerCase('tr')));
  if (!b) throw new Error('Belge bulunamadı. belgeler aracıyla listele.');
  return b;
}

module.exports = {
  belgeEkle,
  bul,
  tur,
  araclar: [
    {
      name: 'belgeler',
      description: 'Kullanıcının uygulamaya bıraktığı belgeleri (PDF, ekran görüntüsü, Word, metin) listeler.',
      parameters: { type: 'object', properties: {} },
      calistir: () => ({
        belgeler: store
          .oku('belgeler', VARSAYILAN)
          .kayitlar.slice(-20)
          .reverse()
          .map((b) => ({ id: b.id, ad: b.ad, tur: b.tur, eklendi: z.okunur(b.tarih), durum: b.durum, sayfa: b.sayfa || undefined, uzunluk: b.uzunluk })),
      }),
    },
    {
      name: 'belge_oku',
      description: 'Bir belgenin metnini okur. "odak" verirsen (ne arıyorsun) sadece en ilgili kısımlar gelir; vermezsen "bolum" numarasıyla (1, 2, ...) parça parça okursun.',
      parameters: {
        type: 'object',
        properties: { belge_id: { type: 'string', description: 'id ya da dosya adının bir kısmı' }, odak: { type: 'string' }, bolum: { type: 'number' } },
        required: ['belge_id'],
      },
      calistir: async (a) => {
        const b = bul(a.belge_id);
        if (b.durum === 'okunuyor') return { durum: 'Belge hâlâ okunuyor, birkaç saniye sonra tekrar dene.' };
        if (b.durum === 'hata') throw new Error('Bu belge okunamadı: ' + b.hata);
        const metin = fs.readFileSync(path.join(klasor(), b.id + '.txt'), 'utf8');
        if (a.odak) return { belge: b.ad, icerik: await web.ilgiliParcalar(metin, a.odak, { adet: 8, sinir: 8000 }), toplamUzunluk: metin.length };
        const toplam = Math.max(1, Math.ceil(metin.length / BOLUM));
        const n = Math.min(toplam, Math.max(1, Number(a.bolum) || 1));
        return { belge: b.ad, bolum: n, toplamBolum: toplam, icerik: metin.slice((n - 1) * BOLUM, n * BOLUM) };
      },
    },
  ],
};
