// Metni sese çevirir. İki motor:
// - "yerel": Supertonic-3, bilgisayarda çalışır (ücretsiz, internetsiz, ~140 MB). Asıl üretim yerel-zeka.js'de.
// - "edge": Microsoft Edge'in ücretsiz nöral sesleri (internet gerekir). Yerel motor hata verirse yedek.
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const ONERILEN_SESLER = [
  { ad: 'tr-TR-EmelNeural', etiket: 'Emel (Türkçe, kadın)' },
  { ad: 'tr-TR-AhmetNeural', etiket: 'Ahmet (Türkçe, erkek)' },
  { ad: 'en-US-AvaMultilingualNeural', etiket: 'Ava (çok dilli, kadın)' },
  { ad: 'en-US-EmmaMultilingualNeural', etiket: 'Emma (çok dilli, kadın)' },
  { ad: 'de-DE-SeraphinaMultilingualNeural', etiket: 'Seraphina (çok dilli, kadın)' },
  { ad: 'fr-FR-VivienneMultilingualNeural', etiket: 'Vivienne (çok dilli, kadın)' },
  { ad: 'pt-BR-ThalitaMultilingualNeural', etiket: 'Thalita (çok dilli, kadın)' },
  { ad: 'en-US-AndrewMultilingualNeural', etiket: 'Andrew (çok dilli, erkek)' },
  { ad: 'en-US-BrianMultilingualNeural', etiket: 'Brian (çok dilli, erkek)' },
  { ad: 'fr-FR-RemyMultilingualNeural', etiket: 'Remy (çok dilli, erkek)' },
  { ad: 'de-DE-FlorianMultilingualNeural', etiket: 'Florian (çok dilli, erkek)' },
  { ad: 'it-IT-GiuseppeMultilingualNeural', etiket: 'Giuseppe (çok dilli, erkek)' },
  { ad: 'en-AU-WilliamMultilingualNeural', etiket: 'William (çok dilli, erkek)' },
];

// Yerel motorun 10 sesi (perde ölçümüyle: 0-4 kadın, 5-9 erkek).
const YEREL_SESLER = [
  { sid: 0, etiket: 'Kadın 1 (sıcak)' },
  { sid: 1, etiket: 'Kadın 2 (canlı, ince)' },
  { sid: 2, etiket: 'Kadın 3' },
  { sid: 3, etiket: 'Kadın 4 (net)' },
  { sid: 4, etiket: 'Kadın 5 (kalın)' },
  { sid: 5, etiket: 'Erkek 1 (genç, enerjik)' },
  { sid: 6, etiket: 'Erkek 2 (tok)' },
  { sid: 7, etiket: 'Erkek 3 (tok)' },
  { sid: 8, etiket: 'Erkek 4 (orta)' },
  { sid: 9, etiket: 'Erkek 5 (en kalın, sakin)' },
];

// "+8%" -> 1.08
function hizCarpani(hiz) {
  const m = String(hiz || '').match(/^([+-]?\d+(?:\.\d+)?)%$/);
  return m ? Math.min(1.5, Math.max(0.6, 1 + Number(m[1]) / 100)) : 1;
}

// Float32 örnekleri 16-bit PCM WAV'a çevirir (arayüz WAV'ı doğrudan çalabilir).
function wav(ornekler, ornekleme) {
  const n = ornekler.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(ornekleme, 24);
  b.writeUInt32LE(ornekleme * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ornekler[i])) * 32767), 44 + i * 2);
  return b;
}

function xmlKacis(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Emoji ve okunmaması gereken işaretleri at.
function temizle(metin) {
  return String(metin || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sentezle(metin, ses) {
  const temiz = temizle(metin);
  if (!temiz) return null;
  const tts = new MsEdgeTTS();
  const cokDilli = /Multilingual/.test(ses.ad);
  await tts.setMetadata(ses.ad, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3, cokDilli ? { voiceLocale: 'tr-TR' } : undefined);
  return new Promise((resolve, reject) => {
    const zamanAsimi = setTimeout(() => {
      tts.close();
      reject(new Error('Ses üretimi zaman aşımına uğradı.'));
    }, 30_000);
    const { audioStream } = tts.toStream(xmlKacis(temiz), { rate: ses.hiz || '+0%', pitch: ses.perde || '+0Hz' });
    const parcalar = [];
    audioStream.on('data', (p) => parcalar.push(p));
    audioStream.on('end', () => {
      clearTimeout(zamanAsimi);
      tts.close();
      resolve(Buffer.concat(parcalar));
    });
    audioStream.on('error', (e) => {
      clearTimeout(zamanAsimi);
      tts.close();
      reject(e);
    });
  });
}

module.exports = { sentezle, temizle, wav, hizCarpani, ONERILEN_SESLER, YEREL_SESLER };
