// Electron ana süreci: pencere, arayüz köprüsü, ses, yerel zeka işçisi, sosyal pencere, zamanlayıcı.
const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, session, shell, Notification, dialog, utilityProcess, systemPreferences, powerMonitor, clipboard, nativeImage } = require('electron');

app.setName('AI Kadrom');

const store = require('./store');
const config = require('./config');
const kadro = require('./kadro');
const hafiza = require('./hafiza');
const yonetici = require('./yonetici');
const onaylar = require('./onaylar');
const deepseek = require('./deepseek');
const zamanlayici = require('./zamanlayici');
const sesMotoru = require('./ses');
const { sayilariOku } = require('./sayilar');
const kod = require('./tools/kod');
const sosyal = require('./tools/sosyal');
const araclar = require('./tools');
const hatirlatmalar = require('./hatirlatmalar');
const belge = require('./tools/belge');
const gorevler = require('./tools/gorevler');
const takvim = require('./tools/takvim');

const RENDERER = path.join(__dirname, '..', 'renderer', 'index.html');
const SOSYAL_OTURUM = 'persist:sosyal';
let pencere = null;
let sosyalPencere = null;
let cikiyor = false;

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- Arayüze olay gönderme ----------
function gonder(tip, veri = {}) {
  if (pencere && !pencere.isDestroyed()) pencere.webContents.send('olay', { tip, ...veri });
}

// Önce yerel motor (Supertonic, çevrimdışı); hata verirse Edge; o da olmazsa arayüz Mac sesine düşer.
async function sesUret(metin, ses, motor = config.ayarlar().sesMotoru) {
  if (motor === 'yerel' && ses.yerel != null) {
    const temiz = sesMotoru.temizle(metin);
    if (!temiz) return null;
    try {
      const r = await sesIscisi.istek({ tur: 'seslendir', metin: sayilariOku(temiz), sid: Number(ses.yerel), hiz: sesMotoru.hizCarpani(ses.hiz) }, 90_000);
      return sesMotoru.wav(Float32Array.from(r.ornekler), r.ornekleme);
    } catch (e) {
      console.error('[yerel ses]', e.message);
    }
  }
  return sesMotoru.sentezle(metin, ses);
}

// Sesler paralel üretilir ama arayüze HER ZAMAN çağrılma sırasıyla gönderilir (cümleler karışmasın).
let gonderimSirasi = Promise.resolve();
let sonSesHatasi = 0;
function soyle(ajanId, metin, { tur = null } = {}) {
  const ajan = kadro.bul(ajanId) || kadro.sef();
  const sentez = sesUret(metin, kadro.sesi(ajan)).catch((e) => {
    console.error('[ses]', e.message);
    if (Date.now() - sonSesHatasi > 10 * 60_000) {
      sonSesHatasi = Date.now();
      gonder('bildirim', { tur: 'uyari', baslik: 'Sesler çevrimdışı', metin: "İnternete ulaşamadım, şimdilik Mac'in kendi sesiyle konuşuyoruz." });
    }
    return null;
  });
  const p = gonderimSirasi.then(async () => {
    const ses = await sentez;
    // Ses üretilemezse (internet yok) arayüz Mac'in yerleşik sesine düşer.
    gonder('soyle', { ajan: ajan.id, metin, ses: ses ? new Uint8Array(ses) : null, tur });
  });
  gonderimSirasi = p.catch(() => {});
  return p;
}

function bildirim(baslik, govde, { zorla = false } = {}) {
  if (!zorla && pencere && pencere.isVisible() && pencere.isFocused()) return;
  if (Notification.isSupported()) new Notification({ title: baslik, body: String(govde).slice(0, 200) }).show();
}

// Sosyal pencere: kullanıcının platformlara bir kez giriş yaptığı, kalıcı oturumlu ayrı pencere.
function paylasimAc(url) {
  if (!/^https:\/\//.test(url)) throw new Error('Sadece https adresleri açılabilir.');
  if (!sosyalPencere || sosyalPencere.isDestroyed()) {
    sosyalPencere = new BrowserWindow({
      width: 640,
      height: 760,
      title: 'Sosyal hesaplar · AI Kadrom',
      webPreferences: { partition: SOSYAL_OTURUM, sandbox: true, contextIsolation: true, nodeIntegration: false },
    });
    sosyalPencere.webContents.setWindowOpenHandler(({ url: u }) => (/^https:\/\//.test(u) ? { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { partition: SOSYAL_OTURUM, sandbox: true } } } : { action: 'deny' }));
  }
  sosyalPencere.loadURL(url);
  sosyalPencere.show();
  sosyalPencere.focus();
}

// Kerem için: yerel sayfayı görünmez pencerede açıp hataları toplar.
function sayfaKontrol(url) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition: 'kerem-test', sandbox: true, contextIsolation: true, nodeIntegration: false } });
    const konsol = [];
    const basarisiz = [];
    w.webContents.on('console-message', (e) => {
      if (e.level === 'error' || e.level === 'warning') konsol.push(`[${e.level}] ${e.message}`.slice(0, 300));
    });
    w.webContents.on('did-fail-load', (_e, kodNo, aciklama, u) => basarisiz.push(`${kodNo} ${aciklama} ${u}`));
    w.webContents.session.webRequest.onCompleted((d) => {
      if (d.statusCode >= 400) basarisiz.push(`${d.statusCode} ${d.method} ${d.url}`.slice(0, 200));
    });
    let bitti = false;
    const son = async (zamanAsimi) => {
      if (bitti) return;
      bitti = true;
      let baslik = '';
      let metin = '';
      try {
        baslik = w.webContents.getTitle();
        metin = await w.webContents.executeJavaScript('document.body ? document.body.innerText.slice(0, 4000) : ""');
      } catch {
        /* sayfa yüklenemedi */
      }
      w.destroy();
      resolve({ url, baslik, zamanAsimi: zamanAsimi || undefined, konsolHatalari: konsol.slice(0, 30), basarisizIstekler: [...new Set(basarisiz)].slice(0, 20), sayfaMetni: metin });
    };
    w.webContents.once('did-finish-load', () => setTimeout(() => son(false), 2500));
    setTimeout(() => son(true), 25_000);
    w.loadURL(url).catch(() => {});
  });
}

// Mert için: HTML şablonunu görünmez pencerede çizip PNG'ye çevirir (tamamen yerel).
async function gorselUret(html, w, h) {
  const klasor = path.join(store.DATA_DIR, 'gorseller');
  fs.mkdirSync(klasor, { recursive: true });
  const dosya = path.join(klasor, '_sablon.html');
  fs.writeFileSync(dosya, html);
  const pen = new BrowserWindow({ show: false, width: w, height: h, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, partition: 'gorsel' } });
  try {
    await pen.loadFile(dosya);
    for (let i = 0; i < 60 && pen.webContents.getTitle() !== 'hazir'; i++) await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 200));
    const img = await pen.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
    return { png: img.toPNG(), kucuk: img.resize({ width: 320 }).toDataURL() };
  } finally {
    pen.destroy();
    fs.rmSync(dosya, { force: true });
  }
}

const ctx = {
  gorselUret,
  panoyaGorsel: (dosya) => {
    const img = nativeImage.createFromPath(dosya);
    if (typeof clipboard.writeImage === 'function') clipboard.writeImage(img);
    else clipboard.write({ image: img });
  },
  soyle,
  bildirim,
  olay: gonder,
  paylasimAc,
  sayfaKontrol,
  panoyaKopyala: (m) => clipboard.writeText(String(m)),
  klasordeGoster: (p) => shell.showItemInFolder(p),
  yerelAc: (url) => shell.openExternal(url),
};

// ---------- Yerel zeka işçisi (konuşma tanıma + anlam vektörleri) ----------
// İki ayrı süreç:
// - "hafiza": anlam modeli (yönlendirme + hafıza). Her sözde gerekir, hep açık (~600 MB).
// - "ses": Whisper (kulak) + Supertonic (yerel ses). Sadece kullanılırken açık; 10 dk boşta kalınca
//   süreç tamamen kapatılır (bellek kesin geri verilir). Mikrofona basınca / ajan düşünürken önceden açılır.
const modelDurumu = {};
const SES_BOSTA_KAPAT_MS = Number(process.env.AIKADRO_SES_BOSTA_MS) || 10 * 60_000;

function isciYoneticisi(rol, { bostaKapatMs = 0, acilinca = null } = {}) {
  let surec = null;
  let sayac = 0;
  let kapatZamani = null;
  const bekleyen = new Map();

  const zamanlayiciyiYenile = () => {
    if (!bostaKapatMs) return;
    clearTimeout(kapatZamani);
    kapatZamani = setTimeout(() => {
      if (surec && !bekleyen.size) {
        surec.kill();
        for (const m of ['whisper', 'ses']) if (modelDurumu[m]) gonder('model-durum', (modelDurumu[m] = { model: m, durum: 'uykuda' }));
      }
    }, bostaKapatMs);
  };

  function baslat() {
    surec = utilityProcess.fork(path.join(__dirname, 'yerel-zeka.js'), [], {
      serviceName: `AI Kadrom ${rol}`,
      env: { ...process.env, AIKADRO_ROL: rol, AIKADRO_WHISPER: config.ayarlar().whisperModel, AIKADRO_MODEL_DIR: path.join(store.DATA_DIR, 'modeller') },
    });
    const bu = surec;
    surec.on('message', (m) => {
      if (m.tur === 'durum') {
        modelDurumu[m.model] = m;
        gonder('model-durum', m);
      } else if (m.tur === 'sonuc') {
        const b = bekleyen.get(m.id);
        if (!b) return;
        bekleyen.delete(m.id);
        clearTimeout(b.zaman);
        m.hata ? b.reject(new Error(m.hata)) : b.resolve(m.sonuc);
        zamanlayiciyiYenile();
      }
    });
    surec.on('exit', () => {
      if (surec !== bu) return;
      for (const b of bekleyen.values()) b.reject(new Error('Yerel zeka süreci kapandı.'));
      bekleyen.clear();
      surec = null;
    });
    acilinca?.(surec);
  }

  return {
    // Modeli önceden yüklet (cevap beklemeden).
    isit(mesaj) {
      if (!surec) baslat();
      surec.postMessage(mesaj);
      zamanlayiciyiYenile();
    },
    istek(mesaj, sureMs = 180_000) {
      if (!surec) baslat();
      const id = ++sayac;
      zamanlayiciyiYenile();
      return new Promise((resolve, reject) => {
        const zaman = setTimeout(() => {
          bekleyen.delete(id);
          reject(new Error('Yerel zeka zaman aşımına uğradı.'));
        }, sureMs);
        bekleyen.set(id, { resolve, reject, zaman });
        surec.postMessage({ ...mesaj, id });
      });
    },
    yenidenBaslat() {
      if (surec) surec.kill();
      surec = null;
    },
    kapat() {
      clearTimeout(kapatZamani);
      if (surec) surec.kill();
    },
  };
}

const hafizaIscisi = isciYoneticisi('hafiza', { acilinca: (s) => s.postMessage({ tur: 'hazirla-gomme' }) });
const sesIscisi = isciYoneticisi('ses', { bostaKapatMs: SES_BOSTA_KAPAT_MS });
const sesMotoruYerelMi = () => config.ayarlar().sesMotoru === 'yerel';

hafiza.gomucuAyarla(async (metinler) => (await hafizaIscisi.istek({ tur: 'gom', metinler }, 120_000)).map((v) => Float32Array.from(v)));

// ---------- Pencere ----------
function pencereAc() {
  pencere = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 620,
    title: 'AI Kadrom',
    backgroundColor: '#18223a',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false, // pencere gizliyken de hatırlatmalar seslendirilsin
    },
  });
  pencere.loadFile(RENDERER);
  if (process.env.AIKADRO_OZTEST) ozTest();
  pencere.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  pencere.webContents.on('will-navigate', (e) => e.preventDefault());
  // Kapatınca arka planda çalışmaya devam etsin (hatırlatmalar için). Çıkış: Cmd+Q.
  pencere.on('close', (e) => {
    if (!cikiyor) {
      e.preventDefault();
      pencere.hide();
    }
  });
}

// Geliştirici kendini testi (AIKADRO_OZTEST=1 npm start): sessizce ses üretir, arayüzde 16 kHz'e çevirip
// konuşma tanımaya ve yerel yönlendirmeye gönderir, sonucu terminale yazar.
function ozTest() {
  pencere.webContents.setAudioMuted(true);
  pencere.webContents.on('console-message', (e) => console.log('[arayuz]', e.message));
  pencere.webContents.once('did-finish-load', () =>
    setTimeout(async () => {
      await pencere.webContents.executeJavaScript(`(async () => {
          const ses = await window.kadroApi.sesDene('cem', null);
          const c = new AudioContext({ sampleRate: 16000 });
          const t = await c.decodeAudioData(ses.buffer.slice(0));
          const m = await window.kadroApi.dinle(t.getChannelData(0));
          console.log('OZTEST maskot=' + document.querySelectorAll('.maskot').length + ' motor=' + (String.fromCharCode(...ses.slice(0, 4)) === 'RIFF' ? 'yerel' : 'edge') + ' metin=' + m);
        })().catch((e) => console.log('OZTEST hata: ' + e.message))`);
      // Genişletilmiş kendini test (AIKADRO_OZTEST=2): görsel üretimi, belge/OCR, web araması.
      if (process.env.AIKADRO_OZTEST === '2') {
        const araclar = require('./tools');
        const mert = kadro.bul('mert');
        try {
          const g = await araclar.calistir('gorsel_olustur', { sablon: 'liste', baslik: 'Bu hafta neler yaptım', maddeler: ['Fizik ödevi bitti', 'Siteye form eklendi', 'Üç gün spor'], boyut: 'kare', renk: 'gunes' }, { ...ctx, ajan: mert, kadro: kadro.liste() });
          console.log('OZTEST gorsel:', g.kaydedildi, fs.statSync(g.kaydedildi).size, 'bayt');
        } catch (e) {
          console.log('OZTEST gorsel HATA', e.message);
        }
        if (process.env.AIKADRO_OZTEST_BELGE) {
          const b = await belge.belgeEkle(process.env.AIKADRO_OZTEST_BELGE).catch((e) => ({ durum: 'hata', hata: e.message }));
          const metin = b.durum === 'hazir' ? fs.readFileSync(path.join(store.DATA_DIR, 'belgeler', b.id + '.txt'), 'utf8') : b.hata;
          console.log('OZTEST belge:', b.durum, JSON.stringify(String(metin).slice(0, 160)));
        }
        try {
          const w = await araclar.calistir('web_ara', { sorgu: 'pdf.js getDocument destroy', adet: 2 }, { ...ctx, ajan: kadro.bul('kerem'), kadro: kadro.liste() });
          console.log('OZTEST web:', JSON.stringify(w).slice(0, 200));
        } catch (e) {
          console.log('OZTEST web HATA', e.message);
        }
      }
      for (const c of ['haftamı planla', 'beni fizikten sına', 'bunun için instagram görseli yap', 'yarın saat üçte diş randevum var takvime ekle', 'matematik vizem ne zamandı', 'bir tweet hazırla yeni projemle ilgili', 'sitenin ana sayfasındaki butonun rengini değiştir', 'süt ve yumurta almayı unutmayayım', 'naber nasılsın', 'tamam onu beşe al']) {
        const k = await yonetici.yerelKarar(c).catch((e) => ({ hata: e.message }));
        console.log('OZTEST yonlendirme:', c, '->', k ? `${k.tur} ${k.hedefler?.map((h) => h.ajan).join(',') || ''} ${k.yol || ''} ${k.puan?.toFixed?.(2) || ''}` : 'LLM gerekli');
      }
    }, 1500)
  );
}

function guvenliGonderen(e) {
  const url = e.senderFrame?.url || '';
  if (!url.startsWith('file://') || !decodeURIComponent(url).includes(path.join('src', 'renderer'))) throw new Error('Yetkisiz istek');
}

function ipc(kanal, fn) {
  ipcMain.handle(kanal, (e, ...args) => {
    guvenliGonderen(e);
    return fn(...args);
  });
}

function ayarPaketi() {
  return { ...config.arayuzIcin(), modeller: modelDurumu, onerilenSesler: sesMotoru.ONERILEN_SESLER, yerelSesler: sesMotoru.YEREL_SESLER, kullanim: deepseek.buAy(), sosyalPlatformlar: Object.entries(sosyal.PLATFORMLAR).map(([id, p]) => ({ id, ad: p.ad })) };
}

function ipcKur() {
  ipc('kadro', () => kadro.arayuzIcin());
  ipc('ayarlar:al', () => ayarPaketi());
  ipc('ayarlar:kaydet', (d = {}) => {
    const onceki = config.ayarlar().whisperModel;
    if (d.sesMotoru === 'yerel') sesIscisi.isit({ tur: 'ses-hazirla' });
    for (const k of config.GIZLI_ANAHTARLAR) {
      if (typeof d[k] === 'string' && d[k].trim()) config.gizliYaz(k, d[k].trim());
      if (d[k] === null) config.gizliYaz(k, '');
      delete d[k];
    }
    config.ayarlariGuncelle(d);
    if (config.ayarlar().whisperModel !== onceki) sesIscisi.yenidenBaslat();
    return ayarPaketi();
  });
  ipc('kod-dunyasi:sec', async () => {
    const r = await dialog.showOpenDialog(pencere, { title: "Kerem'in kod dünyası klasörünü seç", properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    const onceki = config.ayarlar().kodDunyasi;
    config.ayarlariGuncelle({ kodDunyasi: r.filePaths[0] });
    try {
      kod.dunya();
    } catch (e) {
      config.ayarlariGuncelle({ kodDunyasi: onceki });
      throw e;
    }
    return r.filePaths[0];
  });
  ipc('sosyal:giris', (platform) => {
    const p = sosyal.PLATFORMLAR[platform];
    if (p) paylasimAc(p.giris);
  });
  ipc('sosyal:sonraki', () => yonetici.sonrakiParca(ctx));
  // Belgeler: sürükle-bırak ya da dosya seçici. Asıl dosya kopyalanır, aslına dokunulmaz.
  ipc('belge:ekle', async (yollar) => {
    const sonuc = [];
    for (const y of [].concat(yollar).slice(0, 10)) {
      if (typeof y !== 'string' || !path.isAbsolute(y)) continue;
      try {
        sonuc.push(await belge.belgeEkle(y, gonder));
      } catch (e) {
        gonder('bildirim', { tur: 'hata', baslik: 'Belge eklenemedi', metin: `${path.basename(y)}: ${e.message}` });
      }
    }
    return sonuc.map((b) => ({ id: b.id, ad: b.ad, durum: b.durum }));
  });
  ipc('belge:sec', async () => {
    const r = await dialog.showOpenDialog(pencere, { title: 'Ekibe belge ver', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Belgeler', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'webp', 'docx', 'doc', 'rtf', 'txt', 'md', 'csv', 'html'] }] });
    return r.canceled ? [] : r.filePaths;
  });
  ipc('gorsel:goster', (dosya) => {
    const k = path.join(store.DATA_DIR, 'gorseller');
    if (typeof dosya === 'string' && path.resolve(dosya).startsWith(k + path.sep)) shell.showItemInFolder(dosya);
  });
  ipc('gunun-isi:al', () => gorevler.gununIsi());
  ipc('gunun-isi:tamam', (tamam) => {
    const g = gorevler.gununIsiTamamla(tamam !== false);
    gonder('gunun-isi', g);
    return g;
  });
  ipc('odak:al', () => takvim.odakDurumu());
  ipc('odak:bitir', () => {
    store.guncelle('durum', {}, (d) => d.odak && (d.odak.bitis = new Date().toISOString()));
    zamanlayici.tik(ctx);
  });
  ipc('dinle', (ses) => sesIscisi.istek({ tur: 'cevir', ses }));
  // Mikrofona basılınca kulağı (ve gerekirse yerel sesi) önceden aç: kullanıcı konuşurken hazır olur.
  ipc('kulak:hazirla', () => {
    sesIscisi.isit({ tur: 'hazirla-whisper' });
    if (sesMotoruYerelMi()) sesIscisi.isit({ tur: 'ses-hazirla' });
  });
  ipc('konus', (metin) => {
    if (sesMotoruYerelMi()) sesIscisi.isit({ tur: 'ses-hazirla' }); // ajan düşünürken ses hazır olsun
    yonetici.isle(String(metin || '').slice(0, 4000), ctx);
    return true;
  });
  ipc('iptal', () => yonetici.iptalEt());
  ipc('onay', ({ id, karar, args }) => {
    yonetici.onayiIsle(String(id), karar === 'onay' ? 'onay' : 'red', ctx, args && typeof args === 'object' ? args : null);
    return true;
  });
  ipc('onay:dogrula', ({ id, args }) => {
    // Kartta düzenlenen metni göndermeden önce kontrol et (karakter sınırı vb.).
    try {
      araclar.onayDuzenlemesiniDogrula(String(id), args);
      return { gecerli: true };
    } catch (e) {
      return { gecerli: false, hata: e.message };
    }
  });
  ipc('hatirlatma:ertele', ({ id, dk }) => {
    const k = hatirlatmalar.ertele(id ? String(id) : null, Math.min(24 * 60, Math.max(1, Number(dk) || 10)));
    return { okunur: require('./zaman').okunur(k.zaman) };
  });
  ipc('onaylar', () => onaylar.bekleyenler());
  ipc('dis:ac', (url) => {
    const izinli = ['https://platform.deepseek.com/', 'https://calendar.google.com/', 'https://support.google.com/calendar/'];
    if (typeof url === 'string' && izinli.some((o) => url.startsWith(o))) shell.openExternal(url);
  });
  ipc('ses:dene', async ({ ajanId, ses, motor }) => {
    const ajan = kadro.bul(ajanId);
    if (!ajan) return null;
    const b = await sesUret(`Selam kanka, ben ${ajan.name}. Sesim böyle, beğendin mi?`, { ...kadro.sesi(ajan), ...(ses || {}) }, motor === 'edge' || motor === 'yerel' ? motor : undefined);
    return b ? new Uint8Array(b) : null;
  });
  ipc('merhaba', async () => {
    const sef = kadro.sef();
    const ad = config.ayarlar().kullaniciAdi;
    const metin = config.gizliOku('deepseekApiKey')
      ? `Selam ${ad || 'kanka'}, ekip hazır. Boşluk tuşuna basılı tutup konuşabilirsin.`
      : 'Selam kanka, ben Defne. Ekibi çalıştırmak için önce sağ alttaki ayarlardan DeepSeek API anahtarını girmen lazım.';
    await soyle(sef.id, metin);
    return true;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, izin, cb, ayrinti) => cb(izin === 'media' && (ayrinti.mediaTypes || []).every((t) => t === 'audio')));
  session.defaultSession.setPermissionCheckHandler((wc, izin) => izin === 'media');
  // Sosyal pencere ve test penceresi hiçbir cihaz izni alamaz.
  for (const s of [session.fromPartition(SOSYAL_OTURUM), session.fromPartition('kerem-test')]) {
    s.setPermissionRequestHandler((wc, izin, cb) => cb(izin === 'clipboard-sanitized-write'));
  }
  if (process.platform === 'darwin') systemPreferences.askForMediaAccess('microphone').catch(() => {});
  kadro.yukle();
  ipcKur();
  // Kerem'in hata bekçisi: dev sunucusunda hata görünce "Kerem baksın mı?" bildirimi.
  kod.hataDinleyiciAyarla((v) => {
    const son = v.hata.split('\n').filter((x) => x.trim()).slice(-3).join('\n');
    gonder('bildirim', { ajan: 'kerem', tur: 'uyari', baslik: `${v.proje} sunucusunda hata`, metin: son.slice(0, 300), sure: 30000, eylem: { etiket: 'Kerem baksın', konus: `Kerem, ${v.proje} projesindeki "${v.ad}" sunucusunda hata çıktı, sebebini bul ve düzelt. Son çıktı:\n${v.hata.slice(-600)}` } });
    bildirim('Kerem', `${v.proje} sunucusunda hata çıktı`);
  });
  pencereAc();
  hafizaIscisi.isit({ tur: 'hazirla-gomme' });
  // Açılışta Defne'nin karşılaması için ses ve kulak bir kez hazırlanır; 10 dk boşta kalınca kapanır.
  sesIscisi.isit({ tur: 'hazirla-whisper' });
  if (sesMotoruYerelMi()) sesIscisi.isit({ tur: 'ses-hazirla' });
  zamanlayici.baslat(ctx);
  // Mac uykudan uyanınca kaçırılanları hemen kontrol et.
  powerMonitor.on('resume', () => setTimeout(() => zamanlayici.tik(ctx), 3000));
});

app.on('second-instance', () => {
  if (pencere) {
    pencere.show();
    pencere.focus();
  }
});
app.on('activate', () => pencere && pencere.show());
app.on('before-quit', () => {
  cikiyor = true;
  zamanlayici.durdur();
  kod.hepsiniDurdur();
  hafizaIscisi.kapat();
  sesIscisi.kapat();
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
