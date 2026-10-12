// Ayrı bir süreçte (utilityProcess) çalışan yerel zeka işçisi. İnternete/API'ye gitmez:
// - "cevir": Whisper ile konuşmayı yazıya çevirir.
// - "gom": cümleleri anlam vektörüne çevirir (hafıza araması ve yönlendirme için).
// - "seslendir": Supertonic-3 (int8, ~140 MB, MIT/OpenRAIL-M) ile metni sese çevirir; 10 ses, Türkçe dahil 31 dil.
// Modeller ilk kullanımda bir kez indirilir (data/modeller).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const WHISPER = process.env.AIKADRO_WHISPER || 'onnx-community/whisper-small';
const GOMME = process.env.AIKADRO_GOMME || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const MODEL_KLASORU = process.env.AIKADRO_MODEL_DIR || path.join(__dirname, '..', '..', 'data', 'modeller');

const SES_MODELI_ADRES = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2';
const SES_MODELI_KLASORU = path.join(MODEL_KLASORU, 'supertonic-3');

let kutuphane = null;
const modeller = {};

function bildir(m) {
  process.parentPort.postMessage(m);
}

async function kutuphaneyiYukle() {
  if (!kutuphane) {
    kutuphane = await import('@huggingface/transformers');
    kutuphane.env.cacheDir = MODEL_KLASORU;
    kutuphane.env.allowLocalModels = false;
  }
  return kutuphane;
}

function modelHazirla(tur) {
  if (modeller[tur]) return modeller[tur];
  modeller[tur] = (async () => {
    const { pipeline } = await kutuphaneyiYukle();
    const ilerleme = {};
    bildir({ tur: 'durum', model: tur, durum: 'yukleniyor' });
    const p = await pipeline(tur === 'whisper' ? 'automatic-speech-recognition' : 'feature-extraction', tur === 'whisper' ? WHISPER : GOMME, {
      dtype: 'q8',
      progress_callback: (x) => {
        if (x.status === 'progress' && x.total) {
          ilerleme[x.file] = [x.loaded, x.total];
          const [y, t] = Object.values(ilerleme).reduce((a, [l, tt]) => [a[0] + l, a[1] + tt], [0, 0]);
          bildir({ tur: 'durum', model: tur, durum: 'indiriliyor', yuzde: Math.round((y / t) * 100) });
        }
      },
    });
    bildir({ tur: 'durum', model: tur, durum: 'hazir' });
    return p;
  })().catch((e) => {
    delete modeller[tur];
    bildir({ tur: 'durum', model: tur, durum: 'hata', hata: e.message });
    throw e;
  });
  return modeller[tur];
}

// ---------------- Yerel ses (Supertonic-3) ----------------
let sesMotoru = null;

async function sesModeliniIndir() {
  if (fs.existsSync(path.join(SES_MODELI_KLASORU, 'vocoder.int8.onnx'))) return;
  fs.mkdirSync(MODEL_KLASORU, { recursive: true });
  const arsiv = path.join(MODEL_KLASORU, 'supertonic-3.tar.bz2');
  const r = await fetch(SES_MODELI_ADRES, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!r.ok) throw new Error(`Ses modeli indirilemedi (HTTP ${r.status})`);
  const toplam = Number(r.headers.get('content-length')) || 0;
  const yaz = fs.createWriteStream(arsiv);
  let inen = 0;
  let sonYuzde = -1;
  for await (const parca of r.body) {
    yaz.write(parca);
    inen += parca.length;
    const yuzde = toplam ? Math.round((inen / toplam) * 100) : 0;
    if (yuzde !== sonYuzde) {
      sonYuzde = yuzde;
      bildir({ tur: 'durum', model: 'ses', durum: 'indiriliyor', yuzde });
    }
  }
  await new Promise((ok) => yaz.end(ok));
  const gecici = SES_MODELI_KLASORU + '.gecici';
  fs.rmSync(gecici, { recursive: true, force: true });
  fs.mkdirSync(gecici, { recursive: true });
  // macOS'un kendi tar aracıyla aç (sadece model klasörüne yazar).
  await new Promise((ok, hata) => execFile('/usr/bin/tar', ['-xjf', arsiv, '-C', gecici, '--strip-components', '1'], (e) => (e ? hata(e) : ok())));
  fs.rmSync(arsiv, { force: true });
  fs.renameSync(gecici, SES_MODELI_KLASORU);
}

function sesHazirla() {
  if (sesMotoru) return sesMotoru;
  sesMotoru = (async () => {
    bildir({ tur: 'durum', model: 'ses', durum: 'yukleniyor' });
    await sesModeliniIndir();
    const sherpa = require('sherpa-onnx-node');
    const d = SES_MODELI_KLASORU + path.sep;
    const tts = new sherpa.OfflineTts({
      model: {
        supertonic: { durationPredictor: d + 'duration_predictor.int8.onnx', textEncoder: d + 'text_encoder.int8.onnx', vectorEstimator: d + 'vector_estimator.int8.onnx', vocoder: d + 'vocoder.int8.onnx', ttsJson: d + 'tts.json', unicodeIndexer: d + 'unicode_indexer.bin', voiceStyle: d + 'voice.bin' },
        numThreads: 2, // RAM ve CPU'yu düşük tutmak için
        provider: 'cpu',
        debug: 0,
      },
      maxNumSentences: 1,
    });
    bildir({ tur: 'durum', model: 'ses', durum: 'hazir' });
    return tts;
  })().catch((e) => {
    sesMotoru = null;
    bildir({ tur: 'durum', model: 'ses', durum: 'hata', hata: e.message });
    throw e;
  });
  return sesMotoru;
}

// Seslendirmeler sırayla yapılır (aynı model nesnesi eşzamanlı kullanılmaz).
let sesKuyrugu = Promise.resolve();
function seslendir(istek) {
  const p = sesKuyrugu.then(() => seslendirTek(istek));
  sesKuyrugu = p.catch(() => {});
  return p;
}

async function seslendirTek({ metin, sid = 0, hiz = 1, adim = 6 }) {
  const tts = await sesHazirla();
  const a = await tts.generateAsync({
    text: String(metin).slice(0, 2000),
    sid,
    speed: hiz,
    enableExternalBuffer: false,
    generationConfig: { sid, speed: hiz, numSteps: adim, extra: { lang: 'tr' } },
  });
  return { ornekler: a.samples, ornekleme: a.sampleRate };
}

// Whisper'ın sessizlikte uydurduğu bilinen kalıplar.
const HALUSINASYON = /altyaz[ıi]|abone ol|izlediğiniz için|^\s*\.+\s*$|^\s*\[?müzik\]?\s*$/i;

// Süreçler arası taşınırken tip kaybolabilir; her biçimi Float32Array'e çevir.
function sesiCoz(veri) {
  if (veri instanceof Float32Array) return veri;
  if (ArrayBuffer.isView(veri)) return new Float32Array(new Uint8Array(veri.buffer, veri.byteOffset, veri.byteLength).slice().buffer);
  if (veri instanceof ArrayBuffer) return new Float32Array(veri.slice(0));
  return Float32Array.from(veri || []);
}

async function cevir(veri) {
  const ses = sesiCoz(veri);
  let enerji = 0;
  for (let i = 0; i < ses.length; i++) enerji += ses[i] * ses[i];
  const rms = Math.sqrt(enerji / Math.max(1, ses.length));
  if (ses.length < 16000 * 0.4 || rms < 0.004) return '';
  const t = await modelHazirla('whisper');
  const r = await t(ses, { language: 'turkish', task: 'transcribe', chunk_length_s: 30 });
  const metin = String(r.text || '').trim();
  return HALUSINASYON.test(metin) && metin.length < 60 ? '' : metin;
}

async function gom(metinler) {
  const e = await modelHazirla('gomme');
  const sonuc = [];
  for (let i = 0; i < metinler.length; i += 16) {
    const parti = metinler.slice(i, i + 16).map((m) => String(m || '').slice(0, 1500));
    const t = await e(parti, { pooling: 'mean', normalize: true });
    const boyut = t.dims[1];
    for (let j = 0; j < parti.length; j++) sonuc.push(Array.from(t.data.subarray(j * boyut, (j + 1) * boyut)));
  }
  return sonuc;
}

process.parentPort.on('message', async (e) => {
  const m = e.data;
  // Önceden yükleme istekleri (cevap beklenmez).
  if (m.tur === 'hazirla-gomme') return void modelHazirla('gomme').catch(() => {});
  if (m.tur === 'hazirla-whisper') return void modelHazirla('whisper').catch(() => {});
  if (m.tur === 'ses-hazirla') return void sesHazirla().catch(() => {});
  try {
    if (m.tur === 'cevir') bildir({ tur: 'sonuc', id: m.id, sonuc: await cevir(m.ses) });
    else if (m.tur === 'gom') bildir({ tur: 'sonuc', id: m.id, sonuc: await gom(m.metinler) });
    else if (m.tur === 'seslendir') bildir({ tur: 'sonuc', id: m.id, sonuc: await seslendir(m) });
  } catch (err) {
    bildir({ tur: 'sonuc', id: m.id, hata: err.message });
  }
});
