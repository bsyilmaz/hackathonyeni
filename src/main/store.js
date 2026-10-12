// Basit JSON dosya deposu. Her koleksiyon data/<ad>.json dosyasında durur.
// Yazımlar önce .tmp dosyasına yapılıp sonra yeniden adlandırılır (yarım yazılmış dosya kalmaz).
// Bozuk bir dosya bulunursa en son günlük yedekten geri yüklenir.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.AIKADRO_DATA_DIR || path.join(ROOT, 'data');
const YEDEK_DIR = path.join(DATA_DIR, 'yedek');
const YEDEK_SAKLAMA_GUN = 14;
fs.mkdirSync(DATA_DIR, { recursive: true });

const cache = new Map();

function dosya(ad) {
  return path.join(DATA_DIR, ad + '.json');
}

function yedektenOku(ad) {
  if (!fs.existsSync(YEDEK_DIR)) return undefined;
  for (const gun of fs.readdirSync(YEDEK_DIR).sort().reverse()) {
    try {
      return JSON.parse(fs.readFileSync(path.join(YEDEK_DIR, gun, ad + '.json'), 'utf8'));
    } catch {
      /* sıradaki yedeğe bak */
    }
  }
  return undefined;
}

function oku(ad, varsayilan) {
  if (cache.has(ad)) return cache.get(ad);
  let deger;
  if (fs.existsSync(dosya(ad))) {
    try {
      deger = JSON.parse(fs.readFileSync(dosya(ad), 'utf8'));
    } catch {
      console.error(`[store] ${ad}.json bozuk, yedekten geri yükleniyor`);
      fs.copyFileSync(dosya(ad), dosya(ad) + `.bozuk-${Date.now()}`);
      deger = yedektenOku(ad);
    }
  }
  if (deger === undefined) deger = structuredClone(varsayilan);
  // Eksik alanları varsayılandan tamamla (sürüm yükseltmelerinde eski dosyalar bozulmasın).
  if (varsayilan && typeof varsayilan === 'object' && !Array.isArray(varsayilan)) {
    for (const [k, v] of Object.entries(varsayilan)) if (deger[k] === undefined) deger[k] = structuredClone(v);
  }
  cache.set(ad, deger);
  return deger;
}

function kaydet(ad) {
  const tmp = dosya(ad) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache.get(ad)), { mode: 0o600 });
  fs.renameSync(tmp, dosya(ad));
}

// fn koleksiyonu yerinde değiştirir; dönüş değeri aynen geri verilir.
function guncelle(ad, varsayilan, fn) {
  const deger = oku(ad, varsayilan);
  const sonuc = fn(deger);
  kaydet(ad);
  return sonuc;
}

function yeniId(onek) {
  return `${onek}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// Günde bir kez tüm JSON dosyalarını data/yedek/YYYY-MM-DD altına kopyalar, eski yedekleri siler.
function gunlukYedek(gun) {
  const hedef = path.join(YEDEK_DIR, gun);
  if (fs.existsSync(hedef)) return false;
  fs.mkdirSync(hedef, { recursive: true });
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(DATA_DIR, f), path.join(hedef, f));
  }
  const gunler = fs.readdirSync(YEDEK_DIR).sort();
  for (const eski of gunler.slice(0, Math.max(0, gunler.length - YEDEK_SAKLAMA_GUN))) {
    fs.rmSync(path.join(YEDEK_DIR, eski), { recursive: true, force: true });
  }
  return true;
}

// Testler için önbelleği temizler.
function _sifirla() {
  cache.clear();
}

module.exports = { ROOT, DATA_DIR, oku, kaydet, guncelle, yeniId, gunlukYedek, _sifirla };
