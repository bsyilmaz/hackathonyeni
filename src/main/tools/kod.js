// Kerem'in yazılım araçları. Kerem'in dünyası: ayarlardaki "kodDunyasi" klasörü (varsayılan ~/Desktop/keremcodeworld).
//
// Güvenlik katmanları:
// 1) Dosya araçları sadece kod dünyasının içinde çalışır (yol ve sembolik bağlantı kontrolü).
// 2) Silme kalıcı değildir: her şey kod dünyasındaki .kerem-cop klasörüne taşınır, 30 gün sonra temizlenir.
// 3) Komutlar macOS sandbox-exec içinde çalışır: kod dünyası dışına YAZAMAZ/SİLEMEZ; Masaüstü, Belgeler,
//    SSH anahtarları vb. kişisel klasörleri OKUYAMAZ. Ayrıca tehlikeli komutlar (sudo, rm, global kurulum,
//    sistem ayarları...) baştan reddedilir.
// 4) git push ve canlıya alma gibi dışarıya etkili işler kullanıcı onayına düşer.
// 5) .env ve anahtar dosyaları okunamaz/yazılamaz (DeepSeek'e gizli bilgi gitmesin).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const store = require('../store');
const config = require('../config');

const COP = '.kerem-cop';
const COP_SAKLAMA_GUN = 30;
const YASAK_KLASORLER = new Set(['.git', 'node_modules', COP, '.next', '.turbo']);
const YASAK_DOSYA = /^\.env(?!\.example$|\.sample$)|\.(pem|key|p12|pfx|keystore|jks)$|^id_(rsa|ed25519|ecdsa)|^secrets?\.(json|ya?ml)$|^\.npmrc$|^\.netrc$/i;
const KOPYALAMA_DISI = new Set(['node_modules', '.next', '.turbo', '.cache', 'dist', 'build', 'out', '.vercel/output', 'coverage', '.DS_Store']);
const MAKS_OKUMA_SATIR = 400;
const MAKS_YAZMA = 400_000;
const SANDBOX = '/usr/bin/sandbox-exec';

const ev = os.homedir();
const durum = () => store.oku('kerem', { aktifProje: null });

// ---------------- Yollar ----------------
function dunya() {
  const d = path.resolve(config.ayarlar().kodDunyasi);
  const gecici = fs.realpathSync(os.tmpdir());
  const uygun = (d.startsWith(ev + path.sep) && d !== path.join(ev, 'Desktop') && d !== path.join(ev, 'Documents')) || (process.env.AIKADRO_DATA_DIR && fs.existsSync(d) && fs.realpathSync(d).startsWith(gecici + path.sep));
  if (!uygun) throw new Error('Kod dünyası ev klasörünün içinde ayrı bir klasör olmalı (Masaüstünün kendisi olamaz).');
  fs.mkdirSync(path.join(d, COP), { recursive: true });
  return fs.realpathSync(d);
}

function projeAdiKontrol(ad) {
  const a = String(ad || '').trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._ -]{0,80}$/u.test(a) || a.includes('..')) throw new Error(`Geçersiz proje adı: "${ad}". Harf/rakam/-/_ kullan.`);
  return a;
}

function projeKoku(ad) {
  const d = dunya();
  const p = path.join(d, projeAdiKontrol(ad));
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) throw new Error(`"${ad}" adında proje yok. Projeler: ${projeListesi().join(', ') || 'yok'}.`);
  return p;
}

function aktifKok() {
  const a = durum().aktifProje;
  if (!a) throw new Error('Aktif proje yok. projeler ile listele, proje_sec ile seç ya da proje_olustur / proje_ice_aktar kullan.');
  try {
    return projeKoku(a);
  } catch {
    store.guncelle('kerem', { aktifProje: null }, (k) => (k.aktifProje = null));
    throw new Error(`Aktif proje "${a}" artık yok. Başka bir proje seç.`);
  }
}

function projeListesi() {
  const d = dunya();
  return fs
    .readdirSync(d, { withFileTypes: true })
    .filter((g) => g.isDirectory() && !g.name.startsWith('.'))
    .map((g) => g.name)
    .sort();
}

// Proje içi göreli yolu güvenli tam yola çevirir.
function guvenliYol(kok, yol, { yazma = false } = {}) {
  if (typeof yol !== 'string' || !yol.trim()) throw new Error('Dosya yolu gerekli.');
  const tam = path.resolve(kok, yol.trim().replace(/^\/+/, ''));
  const goreli = path.relative(kok, tam);
  if (goreli.startsWith('..') || path.isAbsolute(goreli)) throw new Error('Proje dışına erişim yasak.');
  const parcalar = goreli.split(path.sep);
  if (parcalar.some((p) => YASAK_KLASORLER.has(p)) && (yazma || parcalar[0] !== 'node_modules')) throw new Error(`Bu yola erişim kapalı: ${goreli}`);
  if (YASAK_DOSYA.test(path.basename(tam))) throw new Error(`Gizli bilgi içerebilecek dosyalara (${path.basename(tam)}) erişemem; bunu kullanıcı kendisi düzenlemeli.`);
  let kontrol = tam;
  while (!fs.existsSync(kontrol)) kontrol = path.dirname(kontrol);
  const gercek = path.relative(fs.realpathSync(kok), fs.realpathSync(kontrol));
  if (gercek.startsWith('..') || path.isAbsolute(gercek)) throw new Error('Sembolik bağlantı proje dışına çıkıyor, erişim yasak.');
  return { tam, goreli: goreli || '.' };
}

function* gez(kok, alt = '', derinlik = Infinity) {
  let girdiler;
  try {
    girdiler = fs.readdirSync(path.join(kok, alt), { withFileTypes: true });
  } catch {
    return;
  }
  girdiler.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
  for (const g of girdiler) {
    const goreli = path.join(alt, g.name);
    const seviye = goreli.split(path.sep).length - 1;
    if (g.isDirectory()) {
      if (YASAK_KLASORLER.has(g.name) || g.name === 'dist' || g.name === 'build' || g.name === '.vercel') {
        yield { goreli, klasor: true, seviye, gizli: true };
        continue;
      }
      yield { goreli, klasor: true, seviye };
      if (seviye + 1 < derinlik) yield* gez(kok, goreli, derinlik);
    } else if (g.isFile() || g.isSymbolicLink()) {
      yield { goreli, klasor: false, seviye, gizliDosya: YASAK_DOSYA.test(g.name) };
    }
  }
}

// ---------------- Git ----------------
function git(args, cwd, { zaman = 30_000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: zaman, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }, (hata, stdout, stderr) => {
      if (hata) reject(new Error(`git ${args[0]}: ${(stderr || stdout || hata.message).trim().slice(0, 600)}`));
      else resolve(stdout.trim());
    });
  });
}
const KIMLIK = ['-c', 'user.name=Kerem (AI Kadrom)', '-c', 'user.email=kerem@ai-kadrom.local'];
const gitVarMi = (kok) => fs.existsSync(path.join(kok, '.git'));

async function gitBaslat(kok, mesaj) {
  if (!gitVarMi(kok)) await git(['init', '-q', '-b', 'main'], kok);
  await git(['add', '-A'], kok);
  const st = await git(['status', '--porcelain'], kok);
  if (st) await git([...KIMLIK, 'commit', '-q', '-m', mesaj], kok);
}

// ---------------- Çöp kutusu ----------------
function copaTasi(tam, d = dunya()) {
  const ad = `${new Date().toISOString().replace(/[:.]/g, '-')}__${path.basename(tam)}`;
  const hedef = path.join(d, COP, ad);
  fs.renameSync(tam, hedef);
  fs.writeFileSync(hedef + '.json', JSON.stringify({ orijinal: path.relative(d, tam), tarih: new Date().toISOString() }));
  return ad;
}

function copTemizle() {
  try {
    const c = path.join(dunya(), COP);
    const sinir = Date.now() - COP_SAKLAMA_GUN * 864e5;
    for (const f of fs.readdirSync(c)) {
      const t = fs.statSync(path.join(c, f)).mtimeMs;
      if (t < sinir) fs.rmSync(path.join(c, f), { recursive: true, force: true });
    }
  } catch {
    /* kod dünyası yoksa sorun değil */
  }
}

// ---------------- Komutlar (sandbox) ----------------
const KOMUT_YASAKLARI = [
  [/\bsudo\b|(^|[;&|]\s*)su\s/, 'sudo/su yasak.'],
  [/(^|[;&|(`]\s*|\s)(rm|rmdir|unlink|shred|srm)\s/, 'Silmek için "sil" aracını kullan (çöp kutusuna taşır, geri alınabilir).'],
  [/\bgit\s+push\b/, 'Push için git_gonder aracını kullan (kullanıcı onayı gerekir).'],
  [/\bgit\s+(clean|filter-branch)\b|\bgit\s+reset\s+--hard\b|\bgit\s+checkout\s+--\s+\./, 'Geri dönüşsüz git işlemi yasak; git aracındaki güvenli işlemleri kullan.'],
  [/\b(npm|pnpm|yarn|bun)\b[^;&|]*\s(-g|--global|--location[= ]global)\b|\bnpm\s+link\b|\bcorepack\s+enable\b/, 'Global kurulum yasak (bilgisayarın geneline yazar). Paketleri projeye kur.'],
  [/\bbrew\b|\bport\s+install\b|\bsoftwareupdate\b|\binstaller\b/, 'Sisteme program kurmak yasak.'],
  [/\b(curl|wget)\b[^;&|]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/, 'İnternetten script indirip çalıştırmak yasak.'],
  [/\b(osascript|launchctl|crontab|systemsetup|networksetup|diskutil|csrutil|spctl|pmset|scutil|dscl|security|tccutil|nvram)\b|\bdefaults\s+(write|delete)\b/, 'Sistem ayarlarına dokunan komutlar yasak.'],
  [/\b(shutdown|reboot|halt|mkfs|fdisk)\b|\bdd\s+if=/, 'Tehlikeli sistem komutu.'],
  [/\b(kill|killall|pkill)\b/, 'Süreç durdurmak için arka_plan_durdur kullan.'],
  [/(^|[;&|]\s*)open\s/, 'Tarayıcıda açmak için tarayicida_ac kullan.'],
  [/\b(ssh|scp|sftp|rsync|ftp|telnet|nc|ncat)\b/, 'Uzak bağlantı komutları yasak.'],
  [/\bchown\b|\bchmod\s+[-+]?[0-7]*\s*-R\s+\/|\bchflags\b/, 'Sahiplik/izin değişikliği yasak.'],
  [/\bvercel\b[^;&|]*(--prod|deploy)|\bnetlify\s+deploy\b|\bnpm\s+publish\b|\bfirebase\s+deploy\b|\bsupabase\s+db\s+push\b/, 'Canlıya alma/yayınlama için onayli_komut kullan (kullanıcı onayı gerekir).'],
  [/(^|[\s'"=])~\/(Desktop|Documents|Downloads|Library|\.ssh)|\$HOME\/(Desktop|Documents|Downloads|Library|\.ssh)/, 'Kişisel klasörlere erişim yasak.'],
];
const ONAYLI_YASAKLAR = KOMUT_YASAKLARI.filter(([r]) => /sudo|brew|osascript|shutdown|ssh|chown|Desktop/.test(r.source));

function komutKontrol(komut, liste = KOMUT_YASAKLARI) {
  const k = String(komut || '').trim();
  if (!k) throw new Error('Komut boş.');
  if (k.length > 4000) throw new Error('Komut çok uzun.');
  for (const [r, neden] of liste) if (r.test(k)) throw new Error(`Komut reddedildi: ${neden}`);
  return k;
}

function sbYol(p) {
  return `"${String(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function sandboxProfili(ekYazma = []) {
  const d = dunya();
  const yazilabilir = [d, '/private/tmp', '/private/var/folders', '/dev', ...['.npm', '.cache', 'Library/Caches', '.pnpm-store', 'Library/pnpm', '.yarn', '.bun', '.local/share/pnpm', '.node-gyp', '.cargo/registry'].map((x) => path.join(ev, x)), ...ekYazma];
  const okunamaz = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies', 'Music', '.ssh', '.aws', '.gnupg', '.config/gh', '.docker', '.kube', '.netrc', 'Library/Keychains', 'Library/Messages', 'Library/Mail', 'Library/Cookies', 'Library/Safari', 'Library/Application Support/Google', 'Library/Mobile Documents', store.DATA_DIR].map((x) => (path.isAbsolute(x) ? x : path.join(ev, x)));
  return [
    '(version 1)',
    '(allow default)',
    '(deny file-write*)',
    `(allow file-write* ${yazilabilir.map((p) => `(subpath ${sbYol(p)})`).join(' ')})`,
    `(deny file-read-data ${okunamaz.map((p) => `(subpath ${sbYol(p)})`).join(' ')})`,
    `(allow file-read-data (subpath ${sbYol(d)}))`,
  ].join('\n');
}

function komutOrtami() {
  const yollar = [path.join(ev, '.bun/bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  try {
    const nvm = path.join(ev, '.nvm/versions/node');
    const surum = fs.readdirSync(nvm).sort().pop();
    if (surum) yollar.unshift(path.join(nvm, surum, 'bin'));
  } catch {
    /* nvm yok */
  }
  return {
    PATH: [...new Set([...yollar, ...(process.env.PATH || '').split(':')])].filter(Boolean).join(':'),
    HOME: ev,
    USER: os.userInfo().username,
    LANG: 'en_US.UTF-8',
    TERM: 'dumb',
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    NEXT_TELEMETRY_DISABLED: '1',
    npm_config_update_notifier: 'false',
    npm_config_fund: 'false',
    npm_config_audit: 'false',
    TMPDIR: os.tmpdir(),
  };
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const sonu = (s, n) => (s.length > n ? '…(baştan kesildi)…\n' + s.slice(-n) : s);

function sandboxBaslat(komut, cwd, ekYazma) {
  if (!fs.existsSync(SANDBOX)) throw new Error('Bu macOS sürümünde sandbox-exec yok; güvenlik gereği komut çalıştıramıyorum.');
  return spawn(SANDBOX, ['-p', sandboxProfili(ekYazma), '/bin/zsh', '-f', '-c', komut], { cwd, env: komutOrtami(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
}

function grupOldur(cocuk, sinyal = 'SIGTERM') {
  try {
    process.kill(-cocuk.pid, sinyal);
  } catch {
    /* zaten bitmiş */
  }
}

function komutCalistir(komut, { cwd, zamanAsimiSn = 180, ekYazma = [], signal } = {}) {
  return new Promise((resolve, reject) => {
    let cocuk;
    try {
      cocuk = sandboxBaslat(komut, cwd, ekYazma);
    } catch (e) {
      return reject(e);
    }
    let cikti = '';
    const ekle = (b) => {
      cikti += b.toString();
      if (cikti.length > 400_000) cikti = cikti.slice(-200_000);
    };
    cocuk.stdout.on('data', ekle);
    cocuk.stderr.on('data', ekle);
    const bas = Date.now();
    let zamanAsimi = false;
    const t = setTimeout(() => {
      zamanAsimi = true;
      grupOldur(cocuk);
      setTimeout(() => grupOldur(cocuk, 'SIGKILL'), 3000);
    }, Math.min(900, Math.max(5, zamanAsimiSn)) * 1000);
    signal?.addEventListener('abort', () => grupOldur(cocuk));
    cocuk.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    cocuk.on('close', (kod) => {
      clearTimeout(t);
      const temiz = cikti.replace(ANSI, '').replace(/\r/g, '');
      const engellendi = /Operation not permitted|sandbox/i.test(temiz) ? 'Not: "Operation not permitted" hataları, kod dünyası dışına yazma girişiminin güvenlik kilidine takıldığını gösterir.' : undefined;
      resolve({ cikisKodu: zamanAsimi ? null : kod, zamanAsimi: zamanAsimi || undefined, sureSn: Math.round((Date.now() - bas) / 1000), cikti: sonu(temiz.trim(), 6000), not: engellendi });
    });
  });
}

// ---------------- Arka plan süreçleri (dev sunucuları vb.) ----------------
const surecler = new Map();
let surecSayac = 0;
let hataDinleyici = null; // (veri) => void ; main.js kurar
const HATA_DESENI = /(\b\w*Error\b|ERR!|Failed to compile|Unhandled|\b\w*Exception\b|Module not found|Cannot find module|EADDRINUSE|⨯)/;
const URL_DESENI = /(https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(?::\d+)?[^\s'"]*)/i;

function arkaPlanBaslat(komut, cwd, ad) {
  const calisanlar = [...surecler.values()].filter((s) => s.durum === 'calisiyor');
  if (calisanlar.length >= 5) throw new Error('En fazla 5 arka plan süreci çalışabilir; birini durdur.');
  const cocuk = sandboxBaslat(komut, cwd);
  const id = `s${++surecSayac}`;
  const s = { id, ad: ad || komut.slice(0, 40), komut, proje: path.basename(cwd), cocuk, log: '', url: null, durum: 'calisiyor', cikisKodu: null, baslangic: Date.now() };
  const ekle = (b) => {
    const m = b.toString().replace(ANSI, '').replace(/\r/g, '');
    s.log = (s.log + m).slice(-100_000);
    if (!s.url) {
      const u = m.match(URL_DESENI);
      if (u) s.url = u[1].replace('0.0.0.0', 'localhost').replace(/[).,]+$/, '');
    }
    // Hata bekçisi: sunucu çalışırken hata satırı görünce (dakikada en fazla bir kez) haber ver.
    if (hataDinleyici && HATA_DESENI.test(m) && Date.now() - (s.sonHataBildirimi || 0) > 60_000 && Date.now() - s.baslangic > 3000) {
      s.sonHataBildirimi = Date.now();
      setTimeout(() => hataDinleyici({ id: s.id, ad: s.ad, proje: s.proje, url: s.url, hata: s.log.slice(-700).trim() }), 1500);
    }
  };
  cocuk.stdout.on('data', ekle);
  cocuk.stderr.on('data', ekle);
  cocuk.on('close', (kod) => {
    s.durum = 'bitti';
    s.cikisKodu = kod;
  });
  surecler.set(id, s);
  return s;
}

function surecGorunum(s, satir = 3000) {
  return { id: s.id, ad: s.ad, proje: s.proje, durum: s.durum, cikisKodu: s.cikisKodu ?? undefined, url: s.url || undefined, calismaSuresiSn: Math.round((Date.now() - s.baslangic) / 1000), sonCikti: sonu(s.log.trim(), satir) };
}

function hepsiniDurdur() {
  for (const s of surecler.values()) if (s.durum === 'calisiyor') grupOldur(s.cocuk, 'SIGKILL');
}

const yerelUrlMi = (u) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(String(u || ''));

// ---------------- Bağlam (her istekte Kerem'e eklenen kısa durum özeti; API çağrısı yok) ----------------
function baglamEki() {
  try {
    const d = dunya();
    const p = projeListesi();
    const a = durum().aktifProje;
    const calisan = [...surecler.values()].filter((s) => s.durum === 'calisiyor').map((s) => `${s.id} ${s.ad}${s.url ? ` (${s.url})` : ''}`);
    let not = '';
    if (a) {
      const yol = path.join(d, a, 'KEREM.md');
      not = fs.existsSync(yol)
        ? `\nProje notun (KEREM.md, özet):\n${fs.readFileSync(yol, 'utf8').slice(0, 1500)}`
        : '\nBu projede henüz KEREM.md yok: projeyi tanıdıktan sonra mimariyi, komutları ve önemli kararları proje_notu_yaz ile kaydet.';
    }
    return `Kod dünyan: ${d}\nProjeler: ${p.join(', ') || 'henüz yok'}\nAktif proje: ${a || 'yok'}${calisan.length ? `\nÇalışan süreçler: ${calisan.join('; ')}` : ''}${not}`;
  } catch (e) {
    return 'Kod dünyası hazır değil: ' + e.message;
  }
}

const p = (o) => ({ type: 'object', properties: o.ozellikler || {}, required: o.zorunlu || [] });

module.exports = {
  hataDinleyiciAyarla: (fn) => (hataDinleyici = fn),
  baglamEki,
  hepsiniDurdur,
  copTemizle,
  komutKontrol,
  guvenliYol,
  sandboxProfili,
  dunya,
  araclar: [
    {
      name: 'projeler',
      description: 'Kod dünyasındaki projeleri listeler (git dalı, son commit, aktif olan).',
      parameters: p({}),
      calistir: async () => {
        const d = dunya();
        const aktif = durum().aktifProje;
        const liste = [];
        for (const ad of projeListesi()) {
          const kok = path.join(d, ad);
          const r = { ad, aktif: ad === aktif || undefined, paketJson: fs.existsSync(path.join(kok, 'package.json')) || undefined };
          if (gitVarMi(kok)) {
            r.dal = await git(['rev-parse', '--abbrev-ref', 'HEAD'], kok).catch(() => '?');
            r.sonCommit = await git(['log', '-1', '--format=%s (%cr)'], kok).catch(() => 'yok');
          }
          liste.push(r);
        }
        return { kodDunyasi: d, projeler: liste };
      },
    },
    {
      name: 'proje_sec',
      description: 'Üzerinde çalışılacak aktif projeyi seçer. Dosya/komut araçları aktif projede çalışır.',
      parameters: p({ ozellikler: { ad: { type: 'string' } }, zorunlu: ['ad'] }),
      calistir: (a) => {
        let ad = a.ad;
        const liste = projeListesi();
        if (!liste.includes(ad)) {
          const n = (s) => s.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '');
          const adaylar = liste.filter((x) => n(x).includes(n(ad)) || n(ad).includes(n(x)));
          if (adaylar.length !== 1) throw new Error(`"${ad}" bulunamadı. Projeler: ${liste.join(', ') || 'yok'}.`);
          ad = adaylar[0];
        }
        projeKoku(ad);
        store.guncelle('kerem', { aktifProje: null }, (k) => (k.aktifProje = ad));
        return { aktifProje: ad };
      },
    },
    {
      name: 'proje_olustur',
      description: 'Kod dünyasında yeni, boş bir proje klasörü açar (git, README ve .gitignore ile) ve aktif yapar. Şablon kurmak için sonra komut_calistir kullan (ör. npx create-next-app@latest . --yes).',
      parameters: p({ ozellikler: { ad: { type: 'string' }, aciklama: { type: 'string' } }, zorunlu: ['ad'] }),
      calistir: async (a) => {
        const ad = projeAdiKontrol(a.ad);
        const kok = path.join(dunya(), ad);
        if (fs.existsSync(kok)) throw new Error(`"${ad}" zaten var. proje_sec ile seçebilirsin.`);
        fs.mkdirSync(kok);
        fs.writeFileSync(path.join(kok, 'README.md'), `# ${ad}\n\n${a.aciklama || ''}\n`);
        fs.writeFileSync(path.join(kok, '.gitignore'), 'node_modules/\n.next/\ndist/\nbuild/\n.env*\n!.env.example\n.DS_Store\n');
        await gitBaslat(kok, 'Kerem: proje oluşturuldu');
        store.guncelle('kerem', { aktifProje: null }, (k) => (k.aktifProje = ad));
        return { olusturuldu: ad, yol: kok };
      },
    },
    {
      name: 'proje_ice_aktar',
      description: 'Bilgisayardaki başka bir klasördeki projeyi kod dünyasına KOPYALAR (asıl klasöre dokunmaz). node_modules/.next/dist kopyalanmaz. Kullanıcı yolu söylemeli.',
      parameters: p({ ozellikler: { kaynak_yol: { type: 'string', description: 'Mutlak yol, ~ ile başlayabilir' }, ad: { type: 'string', description: 'Kod dünyasındaki yeni adı' } }, zorunlu: ['kaynak_yol'] }),
      calistir: async (a) => {
        const kaynak = path.resolve(String(a.kaynak_yol).replace(/^~(?=$|\/)/, ev));
        if (!fs.existsSync(kaynak) || !fs.statSync(kaynak).isDirectory()) throw new Error('Kaynak klasör bulunamadı: ' + kaynak);
        const d = dunya();
        const gercek = fs.realpathSync(kaynak);
        const yasak = [ev, path.join(ev, 'Desktop'), path.join(ev, 'Documents'), path.join(ev, 'Downloads'), path.join(ev, 'Library'), path.join(ev, '.ssh'), '/', '/Users', '/System', '/Applications'];
        if (yasak.includes(gercek) || gercek.startsWith(path.join(ev, 'Library') + path.sep) || gercek.startsWith(path.join(ev, '.ssh'))) throw new Error('Bu klasörün tamamı kopyalanamaz; belirli bir proje klasörü ver.');
        if (gercek === d || gercek.startsWith(d + path.sep)) throw new Error('Bu klasör zaten kod dünyasının içinde.');
        // Boyut kontrolü
        let dosya = 0;
        let bayt = 0;
        const say = (dir) => {
          for (const g of fs.readdirSync(dir, { withFileTypes: true })) {
            if (KOPYALAMA_DISI.has(g.name)) continue;
            const t = path.join(dir, g.name);
            if (g.isDirectory()) say(t);
            else if (g.isFile()) {
              dosya++;
              bayt += fs.statSync(t).size;
            }
            if (dosya > 30_000 || bayt > 1.5e9) throw new Error('Proje çok büyük (30.000 dosya / 1,5 GB sınırı). Doğru klasör olduğundan emin ol.');
          }
        };
        say(gercek);
        let ad = projeAdiKontrol(a.ad || path.basename(gercek).normalize('NFC').replace(/[^\p{L}\p{N}._-]+/gu, '-'));
        let hedef = path.join(d, ad);
        for (let i = 2; fs.existsSync(hedef); i++) hedef = path.join(d, `${ad}-${i}`);
        ad = path.basename(hedef);
        fs.cpSync(gercek, hedef, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true, filter: (src) => !KOPYALAMA_DISI.has(path.basename(src)) });
        const gitVardi = gitVarMi(hedef);
        await gitBaslat(hedef, 'Kerem: içe aktarıldı');
        store.guncelle('kerem', { aktifProje: null }, (k) => (k.aktifProje = ad));
        return {
          aktarildi: ad,
          dosyaSayisi: dosya,
          boyutMB: Math.round(bayt / 1e6),
          gitGecmisiKorundu: gitVardi,
          not: 'Asıl klasöre dokunulmadı. node_modules kopyalanmadı; çalıştırmak için önce paket kurulumu gerekir. .env dosyaları kopyalandı ama Kerem onları okuyamaz.',
        };
      },
    },
    {
      name: 'proje_sil',
      description: 'Projeyi kod dünyasının çöp kutusuna taşır (30 gün içinde cop_geri_al ile geri alınabilir).',
      parameters: p({ ozellikler: { ad: { type: 'string' } }, zorunlu: ['ad'] }),
      calistir: (a) => {
        const kok = projeKoku(a.ad);
        for (const s of surecler.values()) if (s.durum === 'calisiyor' && s.proje === path.basename(kok)) grupOldur(s.cocuk, 'SIGKILL');
        const copAdi = copaTasi(kok);
        store.guncelle('kerem', { aktifProje: null }, (k) => {
          if (k.aktifProje === a.ad) k.aktifProje = null;
        });
        return { copaTasindi: a.ad, copAdi };
      },
    },
    {
      name: 'dosya_listele',
      description: 'Aktif projede klasör ağacını gösterir (node_modules, .git vb. içi gösterilmez).',
      parameters: p({ ozellikler: { yol: { type: 'string', description: 'Varsayılan proje kökü' }, derinlik: { type: 'number', description: 'Varsayılan 2' } } }),
      calistir: (a) => {
        const kok = aktifKok();
        const { goreli } = guvenliYol(kok, a.yol || '.');
        const alt = goreli === '.' ? '' : goreli;
        const satirlar = [];
        const temel = alt ? alt.split(path.sep).length : 0;
        for (const g of gez(kok, alt, temel + Math.min(6, a.derinlik || 2))) {
          satirlar.push('  '.repeat(g.seviye - temel) + path.basename(g.goreli) + (g.klasor ? '/' : '') + (g.gizli ? ' (içi gizli)' : '') + (g.gizliDosya ? ' (erişilemez)' : ''));
          if (satirlar.length >= 300) {
            satirlar.push('… (kesildi, daha dar bir klasör iste)');
            break;
          }
        }
        return { proje: path.basename(kok), agac: satirlar.join('\n') || '(boş)' };
      },
    },
    {
      name: 'dosya_oku',
      description: `Dosyayı okur. Satır aralığı verilmezse ilk ${MAKS_OKUMA_SATIR} satır döner; uzun dosyalarda aralık ver.`,
      parameters: p({ ozellikler: { yol: { type: 'string' }, baslangic_satir: { type: 'number' }, bitis_satir: { type: 'number' } }, zorunlu: ['yol'] }),
      calistir: (a) => {
        const { tam, goreli } = guvenliYol(aktifKok(), a.yol);
        if (!fs.existsSync(tam) || !fs.statSync(tam).isFile()) throw new Error('Dosya yok: ' + goreli);
        if (fs.statSync(tam).size > 3_000_000) throw new Error('Dosya çok büyük (3 MB üstü).');
        const icerik = fs.readFileSync(tam, 'utf8');
        if (icerik.includes('\u0000')) throw new Error('İkili (binary) dosya okunamaz.');
        const satirlar = icerik.split('\n');
        const b = Math.max(1, a.baslangic_satir || 1);
        const s = Math.min(satirlar.length, a.bitis_satir || b + MAKS_OKUMA_SATIR - 1);
        return { yol: goreli, toplamSatir: satirlar.length, satirlar: `${b}-${s}`, devamiVar: s < satirlar.length || undefined, icerik: satirlar.slice(b - 1, s).join('\n') };
      },
    },
    {
      name: 'dosya_ara',
      description: 'Aktif projede metin arar (varsayılan büyük/küçük harf duyarsız). Yol + satır no döner.',
      parameters: p({ ozellikler: { metin: { type: 'string' }, uzanti: { type: 'string', description: 'Örn. .tsx' }, klasor: { type: 'string' }, buyuk_kucuk_duyarli: { type: 'boolean' } }, zorunlu: ['metin'] }),
      calistir: (a) => {
        const kok = aktifKok();
        const alt = a.klasor ? guvenliYol(kok, a.klasor).goreli : '';
        const ara = a.buyuk_kucuk_duyarli ? String(a.metin) : String(a.metin).toLowerCase();
        if (!ara) throw new Error('Aranacak metin boş.');
        const sonuc = [];
        for (const g of gez(kok, alt === '.' ? '' : alt)) {
          if (g.klasor || g.gizliDosya || (a.uzanti && !g.goreli.endsWith(a.uzanti))) continue;
          const tam = path.join(kok, g.goreli);
          let st;
          try {
            st = fs.statSync(tam);
          } catch {
            continue;
          }
          if (st.size > 600_000) continue;
          const icerik = fs.readFileSync(tam, 'utf8');
          if (icerik.includes('\u0000')) continue;
          const satirlar = icerik.split('\n');
          for (let i = 0; i < satirlar.length && sonuc.length < 60; i++) {
            const s = a.buyuk_kucuk_duyarli ? satirlar[i] : satirlar[i].toLowerCase();
            if (s.includes(ara)) sonuc.push(`${g.goreli}:${i + 1}: ${satirlar[i].trim().slice(0, 160)}`);
          }
          if (sonuc.length >= 60) break;
        }
        return { sonuclar: sonuc, kesildi: sonuc.length >= 60 || undefined };
      },
    },
    {
      name: 'dosya_yaz',
      description: 'Dosyayı verilen içerikle tamamen yazar (yoksa klasörleriyle oluşturur). Küçük değişiklikte dosya_duzenle kullan.',
      parameters: p({ ozellikler: { yol: { type: 'string' }, icerik: { type: 'string' } }, zorunlu: ['yol', 'icerik'] }),
      calistir: (a) => {
        const { tam, goreli } = guvenliYol(aktifKok(), a.yol, { yazma: true });
        if (String(a.icerik).length > MAKS_YAZMA) throw new Error('İçerik çok büyük.');
        const vardi = fs.existsSync(tam);
        fs.mkdirSync(path.dirname(tam), { recursive: true });
        fs.writeFileSync(tam, a.icerik);
        return { yazildi: goreli, yeniDosya: !vardi || undefined, satir: String(a.icerik).split('\n').length };
      },
    },
    {
      name: 'dosya_duzenle',
      description: '"eski" metni birebir bulup "yeni" ile değiştirir. "eski" tam bir kez geçmeli (hepsi:true ise tüm geçişler).',
      parameters: p({ ozellikler: { yol: { type: 'string' }, eski: { type: 'string' }, yeni: { type: 'string' }, hepsi: { type: 'boolean' } }, zorunlu: ['yol', 'eski', 'yeni'] }),
      calistir: (a) => {
        const { tam, goreli } = guvenliYol(aktifKok(), a.yol, { yazma: true });
        if (!fs.existsSync(tam)) throw new Error('Dosya yok: ' + goreli);
        const icerik = fs.readFileSync(tam, 'utf8');
        if (!a.eski) throw new Error('"eski" boş olamaz.');
        const adet = icerik.split(a.eski).length - 1;
        if (adet === 0) throw new Error('"eski" metni dosyada bulunamadı. Dosyayı yeniden oku; boşluk/girinti birebir aynı olmalı.');
        if (adet > 1 && !a.hepsi) throw new Error(`"eski" metni ${adet} kez geçiyor; daha fazla bağlam ekle ya da hepsi:true ver.`);
        fs.writeFileSync(tam, a.hepsi ? icerik.split(a.eski).join(a.yeni) : icerik.replace(a.eski, () => a.yeni));
        return { duzenlendi: goreli, degisenYer: a.hepsi ? adet : 1 };
      },
    },
    {
      name: 'dosya_tasi',
      description: 'Dosya/klasörü proje içinde taşır ya da yeniden adlandırır.',
      parameters: p({ ozellikler: { kaynak: { type: 'string' }, hedef: { type: 'string' } }, zorunlu: ['kaynak', 'hedef'] }),
      calistir: (a) => {
        const kok = aktifKok();
        const k = guvenliYol(kok, a.kaynak, { yazma: true });
        const h = guvenliYol(kok, a.hedef, { yazma: true });
        if (!fs.existsSync(k.tam)) throw new Error('Kaynak yok: ' + k.goreli);
        if (fs.existsSync(h.tam)) throw new Error('Hedef zaten var: ' + h.goreli);
        fs.mkdirSync(path.dirname(h.tam), { recursive: true });
        fs.renameSync(k.tam, h.tam);
        return { tasindi: `${k.goreli} -> ${h.goreli}` };
      },
    },
    {
      name: 'klasor_olustur',
      description: 'Aktif projede klasör oluşturur.',
      parameters: p({ ozellikler: { yol: { type: 'string' } }, zorunlu: ['yol'] }),
      calistir: (a) => {
        const { tam, goreli } = guvenliYol(aktifKok(), a.yol, { yazma: true });
        fs.mkdirSync(tam, { recursive: true });
        return { olusturuldu: goreli };
      },
    },
    {
      name: 'sil',
      description: 'Aktif projede dosya/klasörü çöp kutusuna taşır (kalıcı silmez, cop_geri_al ile geri alınır). Projenin tamamı için proje_sil.',
      parameters: p({ ozellikler: { yol: { type: 'string' } }, zorunlu: ['yol'] }),
      calistir: (a) => {
        const kok = aktifKok();
        const { tam, goreli } = guvenliYol(kok, a.yol, { yazma: true });
        if (goreli === '.') throw new Error('Projenin tamamını silmek için proje_sil kullan.');
        if (!fs.existsSync(tam)) throw new Error('Böyle bir dosya/klasör yok: ' + goreli);
        return { copaTasindi: goreli, copAdi: copaTasi(tam) };
      },
    },
    {
      name: 'cop_kutusu',
      description: 'Kod dünyasının çöp kutusundakileri listeler (30 gün saklanır).',
      parameters: p({}),
      calistir: () => {
        const c = path.join(dunya(), COP);
        return {
          cop: fs
            .readdirSync(c)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
              const m = JSON.parse(fs.readFileSync(path.join(c, f), 'utf8'));
              return { copAdi: f.slice(0, -5), orijinal: m.orijinal, tarih: m.tarih.slice(0, 16).replace('T', ' ') };
            })
            .slice(-30),
        };
      },
    },
    {
      name: 'cop_geri_al',
      description: 'Çöp kutusundaki bir öğeyi eski yerine geri koyar.',
      parameters: p({ ozellikler: { cop_adi: { type: 'string' } }, zorunlu: ['cop_adi'] }),
      calistir: (a) => {
        const d = dunya();
        const ad = path.basename(String(a.cop_adi));
        const kaynak = path.join(d, COP, ad);
        if (!fs.existsSync(kaynak)) throw new Error('Çöpte böyle bir öğe yok.');
        const meta = JSON.parse(fs.readFileSync(kaynak + '.json', 'utf8'));
        const hedef = path.resolve(d, meta.orijinal);
        if (!hedef.startsWith(d + path.sep)) throw new Error('Geçersiz hedef.');
        if (fs.existsSync(hedef)) throw new Error(`Eski yerde zaten bir şey var: ${meta.orijinal}`);
        fs.mkdirSync(path.dirname(hedef), { recursive: true });
        fs.renameSync(kaynak, hedef);
        fs.rmSync(kaynak + '.json', { force: true });
        return { geriAlindi: meta.orijinal };
      },
    },
    {
      name: 'komut_calistir',
      description: 'Aktif projede kabuk komutu çalıştırır (npm install, build, test, lint, npx create-..., python...). Güvenlik kilidinde: proje dünyası dışına yazamaz. Uzun süren sunucular için arka_plan_baslat kullan. Etkileşimli sorular soran komutlara --yes gibi bayraklar ver.',
      parameters: p({ ozellikler: { komut: { type: 'string' }, klasor: { type: 'string', description: 'Proje içi alt klasör (opsiyonel)' }, zaman_asimi_sn: { type: 'number', description: 'Varsayılan 180, en fazla 900' } }, zorunlu: ['komut'] }),
      calistir: (a, ctx) => {
        const komut = komutKontrol(a.komut);
        const kok = aktifKok();
        const cwd = a.klasor ? guvenliYol(kok, a.klasor).tam : kok;
        return komutCalistir(komut, { cwd, zamanAsimiSn: a.zaman_asimi_sn || 180, signal: ctx.signal });
      },
    },
    {
      name: 'arka_plan_baslat',
      description: 'Uzun süren komutu (npm run dev vb.) arka planda başlatır; birkaç saniye sonra ilk çıktıyı ve bulunduysa yerel adresi döndürür.',
      parameters: p({ ozellikler: { komut: { type: 'string' }, ad: { type: 'string' } }, zorunlu: ['komut'] }),
      calistir: async (a) => {
        const s = arkaPlanBaslat(komutKontrol(a.komut), aktifKok(), a.ad);
        for (let i = 0; i < 16 && !s.url && s.durum === 'calisiyor'; i++) await new Promise((r) => setTimeout(r, 500));
        return surecGorunum(s, 2500);
      },
    },
    {
      name: 'arka_plan_durum',
      description: 'Arka plan süreçlerinin durumu ve son çıktısı (id verilmezse hepsi kısaca).',
      parameters: p({ ozellikler: { id: { type: 'string' } } }),
      calistir: (a) => {
        if (a.id) {
          const s = surecler.get(a.id);
          if (!s) throw new Error('Böyle bir süreç yok.');
          return surecGorunum(s, 5000);
        }
        return { surecler: [...surecler.values()].slice(-10).map((s) => ({ ...surecGorunum(s, 300) })) };
      },
    },
    {
      name: 'arka_plan_durdur',
      description: 'Arka plan sürecini durdurur.',
      parameters: p({ ozellikler: { id: { type: 'string' } }, zorunlu: ['id'] }),
      calistir: async (a) => {
        const s = surecler.get(a.id);
        if (!s) throw new Error('Böyle bir süreç yok.');
        grupOldur(s.cocuk);
        await new Promise((r) => setTimeout(r, 1500));
        if (s.durum === 'calisiyor') grupOldur(s.cocuk, 'SIGKILL');
        return { durduruldu: s.ad };
      },
    },
    {
      name: 'sayfa_kontrol',
      description: 'Yerel adresteki sayfayı görünmez bir tarayıcıda açar; başlığı, konsol hatalarını, başarısız istekleri ve sayfa metnini döndürür. Değişiklikten sonra sitenin gerçekten çalıştığını doğrulamak için kullan.',
      parameters: p({ ozellikler: { url: { type: 'string', description: 'http://localhost:PORT/...' } }, zorunlu: ['url'] }),
      calistir: async (a, ctx) => {
        if (!yerelUrlMi(a.url)) throw new Error('Sadece localhost adresleri kontrol edilebilir.');
        if (!ctx.sayfaKontrol) throw new Error('Sayfa kontrolü bu ortamda kullanılamıyor.');
        return ctx.sayfaKontrol(a.url);
      },
    },
    {
      name: 'tarayicida_ac',
      description: 'Yerel adresi kullanıcının tarayıcısında açar (ona göstermek için).',
      parameters: p({ ozellikler: { url: { type: 'string' } }, zorunlu: ['url'] }),
      calistir: async (a, ctx) => {
        if (!yerelUrlMi(a.url)) throw new Error('Sadece localhost adresleri açılabilir.');
        await ctx.yerelAc?.(a.url);
        return { acildi: a.url };
      },
    },
    {
      name: 'git',
      description:
        'Aktif projede güvenli git işlemleri. islem: durum | fark (dosya opsiyonel) | gecmis | commit (mesaj; tüm değişiklikleri ekler) | dal_listele | dal_olustur (dal) | dal_gec (dal) | birlestir (dal) | geri_al (commit: o commit’i tersine çeviren yeni commit) | dosyayi_geri_yukle (dosya: son commit’teki haline döner).',
      parameters: p({
        ozellikler: {
          islem: { type: 'string', enum: ['durum', 'fark', 'gecmis', 'commit', 'dal_listele', 'dal_olustur', 'dal_gec', 'birlestir', 'geri_al', 'dosyayi_geri_yukle'] },
          mesaj: { type: 'string' },
          dal: { type: 'string' },
          commit: { type: 'string' },
          dosya: { type: 'string' },
        },
        zorunlu: ['islem'],
      }),
      calistir: async (a) => {
        const kok = aktifKok();
        if (!gitVarMi(kok)) await gitBaslat(kok, 'Kerem: git başlatıldı');
        const dalKontrol = (d) => {
          if (!/^[\w./-]{1,100}$/.test(String(d || '')) || String(d).startsWith('-')) throw new Error('Geçersiz dal adı.');
          return d;
        };
        switch (a.islem) {
          case 'durum':
            return { durum: (await git(['status', '--short', '--branch'], kok)) || 'temiz' };
          case 'fark': {
            const ek = a.dosya ? ['--', guvenliYol(kok, a.dosya).goreli] : [];
            const stat = await git(['diff', 'HEAD', '--stat', ...ek], kok).catch(() => '');
            const fark = await git(['diff', 'HEAD', ...ek], kok).catch(() => '');
            return { ozet: stat || 'değişiklik yok', fark: fark.length > 8000 ? fark.slice(0, 8000) + '\n…(kesildi)' : fark };
          }
          case 'gecmis':
            return { gecmis: await git(['log', '--oneline', '-20', '--format=%h %s (%cr, %an)'], kok).catch(() => 'henüz commit yok') };
          case 'commit': {
            await git(['add', '-A'], kok);
            if (!(await git(['status', '--porcelain'], kok))) return { bilgi: 'Commit edilecek değişiklik yok.' };
            await git([...KIMLIK, 'commit', '-q', '-m', String(a.mesaj || 'Kerem: güncelleme').slice(0, 300)], kok);
            return { commit: await git(['log', '-1', '--format=%h %s'], kok) };
          }
          case 'dal_listele':
            return { dallar: await git(['branch', '--format=%(HEAD) %(refname:short)'], kok) };
          case 'dal_olustur':
            await git(['checkout', '-b', dalKontrol(a.dal)], kok);
            return { yeniDal: a.dal };
          case 'dal_gec':
            await git(['checkout', dalKontrol(a.dal)], kok);
            return { dal: a.dal };
          case 'birlestir':
            return { sonuc: await git([...KIMLIK, 'merge', '--no-edit', dalKontrol(a.dal)], kok) };
          case 'geri_al':
            if (!/^[0-9a-f]{4,40}$/i.test(String(a.commit || ''))) throw new Error('Geçerli bir commit kimliği ver.');
            await git([...KIMLIK, 'revert', '--no-edit', a.commit], kok);
            return { geriAlindi: a.commit, yeni: await git(['log', '-1', '--format=%h %s'], kok) };
          case 'dosyayi_geri_yukle': {
            const { goreli } = guvenliYol(kok, a.dosya, { yazma: true });
            await git(['checkout', 'HEAD', '--', goreli], kok);
            return { geriYuklendi: goreli };
          }
          default:
            throw new Error('Bilinmeyen git işlemi.');
        }
      },
    },
    {
      name: 'git_gonder',
      description: 'Aktif projeyi uzak depoya push eder. KULLANICI ONAYI GEREKİR.',
      parameters: p({ ozellikler: { uzak: { type: 'string', description: 'Varsayılan origin' }, dal: { type: 'string' } } }),
      onay: (a) => {
        const proje = durum().aktifProje;
        if (!proje) throw new Error('Aktif proje yok.');
        const komut = `git push ${a.uzak || 'origin'} ${a.dal || '(mevcut dal)'}`;
        return { baslik: `Kerem "${proje}" projesini GitHub'a göndermek istiyor`, detay: komut, meta: { tur: 'komut', komut, proje, riskli: true } };
      },
      calistir: async (a) => {
        const kok = aktifKok();
        const uzak = /^[\w.-]+$/.test(a.uzak || 'origin') ? a.uzak || 'origin' : 'origin';
        const dal = a.dal || (await git(['rev-parse', '--abbrev-ref', 'HEAD'], kok));
        if (!/^[\w./-]+$/.test(dal)) throw new Error('Geçersiz dal.');
        const cikti = await git(['push', '-u', uzak, dal], kok, { zaman: 120_000 }).catch((e) => e.message);
        return { push: cikti || 'tamam' };
      },
    },
    {
      name: 'onayli_komut',
      description: 'Normalde yasak olan ama gerekli bir komutu (canlıya alma: vercel --prod, npm publish, supabase db push...) kullanıcı ONAYIYLA çalıştırır. Yine güvenlik kilidinde çalışır. Nedenini açıkça yaz.',
      parameters: p({ ozellikler: { komut: { type: 'string' }, neden: { type: 'string' } }, zorunlu: ['komut', 'neden'] }),
      onay: (a) => {
        komutKontrol(a.komut, ONAYLI_YASAKLAR);
        return { baslik: `Kerem bir komut çalıştırmak istiyor: ${a.neden}`, detay: `${durum().aktifProje || '?'} $ ${a.komut}`, meta: { tur: 'komut', komut: a.komut, proje: durum().aktifProje, riskli: true } };
      },
      calistir: (a) => {
        const komut = komutKontrol(a.komut, ONAYLI_YASAKLAR);
        // CLI'ların kendi ayar klasörlerine yazabilsin (giriş bilgisi vb.).
        const ek = ['.config', '.vercel', 'Library/Application Support/com.vercel.cli', '.supabase', '.netlify', '.firebase', '.npmrc'].map((x) => path.join(ev, x));
        return komutCalistir(komut, { cwd: aktifKok(), zamanAsimiSn: 600, ekYazma: ek });
      },
    },
    {
      name: 'plan_sun',
      description: 'Büyük işlerde (yeni özellik, 3+ dosya, mimari değişiklik, silme) koda dokunmadan ÖNCE planını kullanıcının onayına sun. Onaylanınca sana "plan onaylandı" diye geri dönülür ve uygularsın. Planı sunduktan sonra kısaca söyle ve dur.',
      parameters: p({
        ozellikler: { baslik: { type: 'string' }, adimlar: { type: 'array', items: { type: 'string' }, description: 'Kısa, somut adımlar' }, dosyalar: { type: 'array', items: { type: 'string' } } },
        zorunlu: ['baslik', 'adimlar'],
      }),
      onay: (a) => {
        const adimlar = (a.adimlar || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
        if (!adimlar.length) throw new Error('Plan en az bir adım içermeli.');
        return { baslik: `Plan: ${String(a.baslik).slice(0, 120)}`, detay: adimlar.map((x, i) => `${i + 1}. ${x}`).join('\n'), meta: { tur: 'plan', adimlar, dosyalar: (a.dosyalar || []).slice(0, 30), proje: durum().aktifProje } };
      },
      duzenlenebilir: ['adimlar'],
      calistir: (a) => ({
        onaylandi: true,
        devam: { ajan: 'kerem', gorev: `Kullanıcı planını onayladı, şimdi uygula ("${a.baslik}"):\n${(a.adimlar || []).map((x, i) => `${i + 1}. ${x}`).join('\n')}\nBitince derle/test et, commit et ve KEREM.md'yi güncelle.` },
      }),
    },
    {
      name: 'proje_notu_oku',
      description: "Aktif projenin KEREM.md notunu (mimari, komutlar, kararlar) tamamen okur.",
      parameters: p({}),
      calistir: () => {
        const { tam } = guvenliYol(aktifKok(), 'KEREM.md');
        return fs.existsSync(tam) ? { icerik: fs.readFileSync(tam, 'utf8') } : { yok: true };
      },
    },
    {
      name: 'proje_notu_yaz',
      description: "Aktif projenin KEREM.md notunu baştan yazar. Kısa tut (en fazla ~60 satır): proje amacı, teknoloji, klasör yapısı, çalıştırma komutları, önemli kararlar, yapılacaklar.",
      parameters: p({ ozellikler: { icerik: { type: 'string' } }, zorunlu: ['icerik'] }),
      calistir: (a) => {
        const { tam } = guvenliYol(aktifKok(), 'KEREM.md', { yazma: true });
        fs.writeFileSync(tam, String(a.icerik).slice(0, 8000));
        return { kaydedildi: 'KEREM.md' };
      },
    },
  ],
};
