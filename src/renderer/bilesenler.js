// Uygulama içi popup'lar ve küçük bileşenler: bildirimler, hatırlatma kartları, onay kartları,
// etkinlik çipleri, konuşma balonları, "ne duydum" balonu, karşılama ve komut paleti.
import { maskotSVG } from './maskot.js';

let api = null;
let ajanlar = () => [];
let maskotEl = () => null;

export function kur(o) {
  api = o.api;
  ajanlar = o.ajanlar;
  maskotEl = o.maskotEl;
}

const ajanBul = (id) => ajanlar().find((a) => a.id === id);

function el(etiket, sinif, metin) {
  const e = document.createElement(etiket);
  if (sinif) e.className = sinif;
  if (metin !== undefined) e.textContent = metin;
  return e;
}

// Maskotun sadece kafası, yuvarlak avatar olarak.
export function kafaAvatari(ajan, boyut = 34) {
  const a = el('span', 'avatar');
  a.style.width = a.style.height = `${boyut}px`;
  if (!ajan) return a;
  a.style.setProperty('--renk', ajan.renk);
  a.innerHTML = maskotSVG(ajan.gorunum).replace('viewBox="0 0 200 250"', 'viewBox="28 14 144 144"');
  return a;
}

const M = '#141a2b';
const IKONLAR = {
  bilgi: `<circle cx="12" cy="12" r="9" fill="#fff" stroke="${M}" stroke-width="2.2"/><path d="M12 11v5" stroke="${M}" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.6" fill="${M}"/>`,
  basari: `<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="${M}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  uyari: `<path d="M12 3.5 2.8 20h18.4L12 3.5z" fill="#fff" stroke="${M}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="${M}" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.5" fill="${M}"/>`,
  hata: `<path d="M7 7l10 10M17 7 7 17" stroke="${M}" stroke-width="3" stroke-linecap="round"/>`,
};
const ikon = (ad) => `<svg viewBox="0 0 24 24" class="ikon">${IKONLAR[ad] || IKONLAR.bilgi}</svg>`;

// ---------------- Bildirimler (sağ üst) ----------------
export function bildirim({ ajan, baslik, metin, tur = 'bilgi', sure = 5000, butonlar = [], sinif = '' }) {
  const kap = document.getElementById('bildirimler');
  const b = el('div', `bildirim ${tur} ${sinif}`);
  const a = ajan ? ajanBul(ajan) : null;
  if (a) b.style.setProperty('--renk', a.renk);
  const sol = a ? kafaAvatari(a, 38) : Object.assign(el('span', 'ikon-kutu'), { innerHTML: ikon(tur) });
  const govde = el('div', 'govde');
  const ust = el('div', 'ust');
  ust.append(el('b', '', baslik || a?.name || ''));
  if (a) b.style.setProperty('--renk', a.renk);
  const kapat = el('button', 'kapat', '×');
  kapat.setAttribute('aria-label', 'Kapat');
  ust.append(kapat);
  govde.append(ust);
  if (metin) govde.append(el('p', '', metin));
  if (butonlar.length) {
    const bs = el('div', 'butonlar');
    for (const x of butonlar) {
      const btn = el('button', x.birincil ? 'birincil' : '', x.etiket);
      btn.onclick = async () => {
        btn.disabled = true;
        try {
          if ((await x.tikla?.()) !== false) kaldir();
        } finally {
          btn.disabled = false;
        }
      };
      bs.append(btn);
    }
    govde.append(bs);
  }
  b.append(sol, govde);
  let cubuk = null;
  if (sure) {
    cubuk = el('i', 'sure');
    cubuk.style.animationDuration = `${sure}ms`;
    b.append(cubuk);
  }
  kap.prepend(b);
  while (kap.children.length > 5) kap.lastChild.remove();

  let zaman = null;
  let kalan = sure;
  let basladi = Date.now();
  const kaldir = () => {
    clearTimeout(zaman);
    b.classList.add('cikis');
    setTimeout(() => b.remove(), 260);
  };
  const baslat = () => {
    if (!sure) return;
    basladi = Date.now();
    zaman = setTimeout(kaldir, kalan);
  };
  b.addEventListener('mouseenter', () => {
    clearTimeout(zaman);
    kalan -= Date.now() - basladi;
    b.classList.add('durdu');
  });
  b.addEventListener('mouseleave', () => {
    b.classList.remove('durdu');
    baslat();
  });
  kapat.onclick = kaldir;
  baslat();
  return { kaldir };
}

// ---------------- Hatırlatma kartı (erteleme butonlu) ----------------
export function hatirlatmaKarti(o) {
  const a = ajanBul(o.ajan);
  const ertele = (dk) => ({
    etiket: dk < 60 ? `${dk} dk` : `${dk / 60} sa`,
    tikla: async () => {
      const r = await api.hatirlatmaErtele(o.id, dk);
      bildirim({ ajan: o.ajan, baslik: 'Ertelendi', metin: `${r.okunur} için tekrar hatırlatacağım.`, tur: 'basari', sure: 3500 });
    },
  });
  bildirim({
    ajan: o.ajan,
    baslik: o.kacirilan ? 'Kaçırdıkların' : `${a?.name || ''} hatırlatıyor`,
    metin: o.metin,
    sure: o.kacirilan ? 20000 : 60000,
    sinif: 'hatirlatma',
    butonlar: o.id ? [{ etiket: 'Tamam', birincil: true }, ertele(5), ertele(15), ertele(60)] : [{ etiket: 'Tamam', birincil: true }],
  });
}

// ---------------- Onay kartı (düzenlenebilir) ----------------
function uzunluk(platform, metin) {
  let m = String(metin);
  if (platform !== 'x') return [...m].length;
  m = m.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  let n = 0;
  for (const c of m) n += /\p{Extended_Pictographic}|[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u.test(c) ? 2 : 1;
  return n;
}

export function onayKarti(k) {
  if (document.querySelector(`[data-onay="${k.id}"]`)) return;
  const a = ajanBul(k.ajan);
  const meta = k.meta || {};
  const kart = el('div', `onay-karti ${meta.riskli ? 'riskli' : ''}`);
  kart.dataset.onay = k.id;
  kart.tabIndex = 0;
  kart.style.setProperty('--renk', a?.renk || '#8f7dff');

  const ust = el('div', 'ust');
  ust.append(kafaAvatari(a, 36));
  const bas = el('div', 'basliklar');
  const etiket = el('span', 'ad-etiketi', a?.name || '');
  bas.append(etiket, el('span', '', k.baslik));
  ust.append(bas);
  kart.append(ust);

  let parcaAlanlari = [];
  const alanAdi = meta.tur === 'plan' ? 'adimlar' : 'parcalar';
  const govde = el('div', 'icerik');
  if (meta.tur === 'plan') {
    meta.adimlar.forEach((p, i) => {
      const kutu = el('div', 'parca adim');
      kutu.append(el('span', 'adim-no', String(i + 1)));
      const ta = el('textarea');
      ta.value = p;
      ta.readOnly = true;
      ta.rows = 1;
      ta.addEventListener('input', () => {
        ta.style.height = 'auto';
        ta.style.height = `${ta.scrollHeight + 2}px`;
      });
      kutu.append(ta);
      govde.append(kutu);
      parcaAlanlari.push(ta);
    });
    if (meta.dosyalar?.length) govde.append(el('small', 'dosyalar', `Dokunulacak dosyalar: ${meta.dosyalar.join(', ')}`));
  } else if (meta.tur === 'paylasim') {
    meta.parcalar.forEach((p, i) => {
      const kutu = el('div', 'parca');
      if (meta.parcalar.length > 1) kutu.append(el('span', 'no', `${i + 1}/${meta.parcalar.length}`));
      const ta = el('textarea');
      ta.value = p;
      ta.readOnly = true;
      ta.rows = Math.min(8, Math.max(2, Math.ceil(p.length / 46)));
      const sayac = el('span', 'sayac');
      const guncelle = () => {
        const u = uzunluk(meta.platform, ta.value);
        sayac.textContent = `${u}/${meta.sinir}`;
        sayac.classList.toggle('asti', u > meta.sinir);
        // Metin uzadıkça kutu da uzasın (sayaç yazının üstüne binmesin).
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(260, ta.scrollHeight + 2)}px`;
      };
      ta.addEventListener('input', guncelle);
      guncelle();
      kutu.append(ta, sayac);
      govde.append(kutu);
      parcaAlanlari.push(ta);
    });
  } else if (meta.tur === 'komut') {
    govde.append(el('code', 'komut', meta.komut));
    govde.append(el('small', 'uyari-not', 'Geri dönüşü zor bir işlem. Emin değilsen vazgeç.'));
  } else {
    govde.append(el('p', '', k.detay));
  }
  kart.append(govde);
  const hata = el('small', 'hata-not');
  hata.hidden = true;
  kart.append(hata);

  const butonlar = el('div', 'butonlar');
  const red = el('button', '', 'Vazgeç');
  const duzenle = meta.tur === 'paylasim' || meta.tur === 'plan' ? el('button', '', 'Düzenle') : null;
  const evet = el('button', 'evet', meta.riskli ? 'Onayla ve çalıştır' : meta.tur === 'plan' ? 'Onayla, başla' : 'Onayla');
  evet.title = '⌘↵';
  let duzenlendi = false;
  red.onclick = () => {
    kapat();
    api.onay(k.id, 'red');
  };
  if (duzenle) {
    duzenle.onclick = () => {
      const acik = parcaAlanlari[0].readOnly;
      parcaAlanlari.forEach((t) => (t.readOnly = !acik));
      kart.classList.toggle('duzenleniyor', acik);
      duzenle.textContent = acik ? 'Bitti' : 'Düzenle';
      if (acik) parcaAlanlari[0].focus();
      duzenlendi = true;
    };
  }
  evet.onclick = async () => {
    let args = null;
    if (duzenlendi) {
      args = { [alanAdi]: parcaAlanlari.map((t) => t.value.trim()).filter(Boolean) };
      const d = await api.onayDogrula(k.id, args);
      if (!d.gecerli) {
        hata.textContent = d.hata;
        hata.hidden = false;
        kart.classList.add('salla');
        setTimeout(() => kart.classList.remove('salla'), 400);
        return;
      }
    }
    kapat();
    api.onay(k.id, 'onay', args);
  };
  butonlar.append(red, ...(duzenle ? [duzenle] : []), evet);
  kart.append(butonlar);
  kart.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      evet.click();
    }
  });
  const kapat = () => {
    kart.classList.add('cikis');
    setTimeout(() => kart.remove(), 260);
  };
  document.getElementById('onaylar').appendChild(kart);
  // Yükseklik ancak sayfaya eklendikten sonra ölçülebilir.
  requestAnimationFrame(() => parcaAlanlari.forEach((t) => t.dispatchEvent(new Event('input'))));
}

export function onayKaldir(id) {
  const k = document.querySelector(`[data-onay="${id}"]`);
  if (!k) return;
  k.classList.add('cikis');
  setTimeout(() => k.remove(), 260);
}

// ⌘↵ ile en yeni onay kartını onayla.
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.target.closest?.('.onay-karti')) {
    const son = [...document.querySelectorAll('.onay-karti:not(.cikis) .evet')].at(-1);
    if (son) {
      e.preventDefault();
      son.click();
    }
  }
});

// Flood paylaşımında sıradaki parçayı açan kart.
export function devamKarti({ sira, toplam, bitti }) {
  onayKaldir('paylasim-devam');
  if (bitti || sira >= toplam) return;
  const mert = ajanBul('mert');
  const kart = el('div', 'onay-karti');
  kart.dataset.onay = 'paylasim-devam';
  kart.style.setProperty('--renk', mert?.renk || '#ffb02e');
  const ust = el('div', 'ust');
  ust.append(kafaAvatari(mert, 36));
  const bas = el('div', 'basliklar');
  bas.append(el('span', 'ad-etiketi', mert?.name || 'Mert'), el('span', '', `Flood ${sira}/${toplam} açıldı. Gönderince sıradakini aç ya da "sıradaki" de.`));
  ust.append(bas);
  const ilerleme = el('div', 'ilerleme');
  for (let i = 1; i <= toplam; i++) ilerleme.append(el('i', i <= sira ? 'dolu' : ''));
  const butonlar = el('div', 'butonlar');
  const kapat = el('button', '', 'Kapat');
  kapat.onclick = () => onayKaldir('paylasim-devam');
  const ileri = el('button', 'evet', `Sıradaki (${sira + 1}/${toplam})`);
  ileri.onclick = () => {
    onayKaldir('paylasim-devam');
    api.sosyalSonraki();
  };
  butonlar.append(kapat, ileri);
  kart.append(ust, ilerleme, butonlar);
  document.getElementById('onaylar').appendChild(kart);
}

// ---------------- Maskot üstü "ne yapıyor" çipi ve sevinç ----------------
const ETIKETLER = [
  [/^etkinlik_ekle$/, 'Takvime ekliyor'],
  [/^(etkinlikleri_listele|gun_programi)$/, 'Takvime bakıyor'],
  [/^etkinlik_(guncelle|ertele)$/, 'Takvimi düzenliyor'],
  [/^etkinlik_sil$/, 'Takvimden siliyor'],
  [/^bos_zaman_bul$/, 'Boş zaman arıyor'],
  [/^hatirlatma_/, 'Hatırlatmalarla uğraşıyor'],
  [/^takvim_/, 'Takvim bağlantısı'],
  [/^(ders|odev|sinav)_/, 'Ders defterini açtı'],
  [/^(not_gir|ortalama)$/, 'Hesaplıyor'],
  [/^devamsizlik/, 'Devamsızlığa bakıyor'],
  [/^calisma_plani/, 'Çalışma planı kuruyor'],
  [/^calisma_/, 'Kronometrede'],
  [/^haftalik_/, 'Haftayı topluyor'],
  [/^gorev/, 'Yapılacaklara bakıyor'],
  [/^liste_/, 'Listeyi güncelliyor'],
  [/^aliskanlik/, 'Alışkanlıklara bakıyor'],
  [/^(ozel_gun|odeme)/, 'Önemli günlere bakıyor'],
  [/^(hayat_ozeti|kacirilanlar)$/, 'Genel duruma bakıyor'],
  [/^paylasim_hazirla$/, 'Gönderi hazırlıyor'],
  [/^(paylasim|planli|icerik)/, 'İçerik takvimine bakıyor'],
  [/^(taslak|tarz|karakter)/, 'Taslaklara bakıyor'],
  [/^sosyal_/, 'Sosyal pencereyi açıyor'],
  [/^(dosya_oku|dosya_listele|dosya_ara)$/, 'Kodu okuyor'],
  [/^(dosya_yaz|dosya_duzenle|dosya_tasi|klasor_olustur)$/, 'Kod yazıyor'],
  [/^(sil|cop_)/, 'Topluyor'],
  [/^komut_calistir$/, 'Komut çalıştırıyor'],
  [/^arka_plan/, 'Sunucuyla uğraşıyor'],
  [/^sayfa_kontrol$/, 'Siteyi test ediyor'],
  [/^git/, 'Git işi yapıyor'],
  [/^proje/, 'Projeyle uğraşıyor'],
  [/^hatirla$/, 'Not alıyor'],
  [/^(hafizada_ara|gecmiste_ara)$/, 'Hafızasını yokluyor'],
  [/^ekibe_ilet$/, 'Ekibe haber veriyor'],
];
const KUTLAMA = new Set(['gorev_tamamla', 'odev_tamamla', 'aliskanlik_isaretle', 'calisma_bitir', 'liste_isaretle']);

const cipZamanlari = new Map();
export function aktiviteCipi(ajanId, arac) {
  const m = maskotEl(ajanId);
  if (!m) return;
  let c = m.querySelector('.cip');
  if (!c) {
    c = el('div', 'cip');
    m.append(c);
  }
  c.textContent = (ETIKETLER.find(([r]) => r.test(arac)) || [, 'Çalışıyor'])[1];
  c.classList.add('acik');
  clearTimeout(cipZamanlari.get(ajanId));
  cipZamanlari.set(ajanId, setTimeout(() => c.classList.remove('acik'), 3500));
}

export function cipKapat(ajanId) {
  maskotEl(ajanId)?.querySelector('.cip')?.classList.remove('acik');
}

export function aracSonucu({ ajan, arac, basarili }) {
  const m = maskotEl(ajan);
  if (!m) return;
  if (!basarili) {
    m.classList.add('uzgun');
    setTimeout(() => m.classList.remove('uzgun'), 1200);
    return;
  }
  if (KUTLAMA.has(arac)) sevinc(ajan);
}

export function sevinc(ajanId) {
  const m = maskotEl(ajanId);
  if (!m) return;
  m.classList.remove('sevinc');
  void m.offsetWidth;
  m.classList.add('sevinc');
  const kap = el('div', 'parilti');
  for (let i = 0; i < 10; i++) {
    const p = el('i');
    p.style.setProperty('--a', `${i * 36 + Math.random() * 20}deg`);
    p.style.setProperty('--d', `${50 + Math.random() * 40}px`);
    kap.append(p);
  }
  m.append(kap);
  setTimeout(() => {
    m.classList.remove('sevinc');
    kap.remove();
  }, 1300);
}

// ---------------- Konuşma balonu (altyazı açıkken) ----------------
let balon = null;
let balonAjan = null;
export function konusmaBalonu(ajanId, metin, devam) {
  const m = maskotEl(ajanId);
  if (!m) return;
  if (!balon) {
    balon = el('div', 'konusma-balonu');
    document.body.append(balon);
  }
  const a = ajanBul(ajanId);
  balon.style.setProperty('--renk', a?.renk);
  if (!devam || balonAjan !== ajanId) balon.textContent = '';
  balonAjan = ajanId;
  balon.append(document.createTextNode((balon.textContent ? ' ' : '') + metin));
  // Uzunsa baştan kırp: hep son cümleler görünsün.
  while (balon.textContent.length > 260 && balon.firstChild) balon.firstChild.remove();
  // Konum, maskotun animasyon BİTTİKTEN sonraki haline göre hesaplanır (konuşan maskot
  // 12px yükselip 1.18 kat büyür), yoksa balon başının üstüne biner.
  const kadroAlt = m.parentElement.getBoundingClientRect().bottom - parseFloat(getComputedStyle(m.parentElement).paddingBottom);
  const olcek = m.classList.contains('konusuyor') ? 1.18 : 1;
  const ust = kadroAlt - m.offsetHeight * olcek - (olcek > 1 ? 12 : 0);
  const orta = m.offsetLeft + m.offsetWidth / 2 + m.parentElement.getBoundingClientRect().left;
  balon.style.left = `${Math.min(window.innerWidth - 180, Math.max(180, orta))}px`;
  balon.style.bottom = `${window.innerHeight - ust + 24}px`;
  balon.classList.add('acik');
}

export function balonKapat() {
  balon?.classList.remove('acik');
  balonAjan = null;
}

// ---------------- "Ne duydum" balonu ----------------
let duyulanZaman = null;
export function duyulanGoster(metin) {
  const d = document.getElementById('duyulan');
  d.textContent = `“${metin}”`;
  d.classList.add('acik');
  clearTimeout(duyulanZaman);
  duyulanZaman = setTimeout(() => d.classList.remove('acik'), 3800);
}

// ---------------- İlk açılış: karşılama ----------------
export function karsilama({ mikrofonTesti, bitince }) {
  const arka = el('div', 'modal-arka');
  const m = el('div', 'modal karsilama');
  const sira = el('div', 'avatar-sirasi');
  ajanlar().forEach((a, i) => {
    const av = kafaAvatari(a, 54);
    av.style.animationDelay = `${i * 80}ms`;
    av.title = a.name;
    sira.append(av);
  });
  m.append(sira, el('h2', '', 'Ekibinle tanış'), el('p', 'alt', 'Altı kişilik bir ekip seni bekliyor. Üç küçük adımda hazırız.'));

  const adim = (no, baslik, icerik) => {
    const k = el('div', 'adim');
    k.append(el('span', 'no', String(no)));
    const sag = el('div');
    sag.append(el('b', '', baslik), icerik);
    k.append(sag);
    return k;
  };
  const ad = el('input');
  ad.placeholder = 'ör. Selim';
  const anahtar = el('input');
  anahtar.type = 'password';
  anahtar.placeholder = 'sk-...';
  const anahtarKutu = el('div');
  const link = el('a', '', 'Anahtarı nereden alırım?');
  link.href = '#';
  link.onclick = (e) => {
    e.preventDefault();
    api.disAc('https://platform.deepseek.com/api_keys');
  };
  anahtarKutu.append(anahtar, link);
  const mikKutu = el('div', 'mik-test');
  const mikBtn = el('button', '', 'Mikrofonu dene');
  const seviye = el('div', 'seviye');
  const dolgu = el('i');
  seviye.append(dolgu);
  const mikNot = el('small', '', 'Butona bas ve bir şey söyle.');
  mikBtn.onclick = async () => {
    mikBtn.disabled = true;
    mikNot.textContent = 'Dinliyorum…';
    const sonuc = await mikrofonTesti((v) => (dolgu.style.width = `${Math.min(100, v * 400)}%`));
    mikNot.textContent = sonuc ? 'Harika, seni duyuyoruz!' : 'Ses gelmedi. Sistem Ayarları > Gizlilik > Mikrofon’dan izin ver.';
    mikBtn.disabled = false;
  };
  mikKutu.append(mikBtn, seviye, mikNot);
  m.append(adim(1, 'Sana nasıl hitap edelim?', ad), adim(2, 'DeepSeek API anahtarı (ekibin beyni)', anahtarKutu), adim(3, 'Mikrofon testi', mikKutu));

  const alt = el('div', 'modal-alt');
  const sonra = el('button', 'hafif', 'Sonra');
  const basla = el('button', 'birincil', 'Başlayalım');
  const hata = el('small', 'hata-not');
  hata.hidden = true;
  sonra.onclick = () => kapat(false);
  basla.onclick = async () => {
    if (!anahtar.value.trim()) {
      hata.textContent = 'Ekibin konuşabilmesi için anahtar gerekli (sonra da girebilirsin).';
      hata.hidden = false;
      return;
    }
    await api.ayarlariKaydet({ kullaniciAdi: ad.value.trim(), deepseekApiKey: anahtar.value.trim() });
    kapat(true);
  };
  alt.append(hata, sonra, basla);
  m.append(alt);
  arka.append(m);
  document.body.append(arka);
  setTimeout(() => ad.focus(), 300);
  const kapat = (kaydedildi) => {
    arka.classList.add('cikis');
    setTimeout(() => arka.remove(), 250);
    bitince(kaydedildi);
  };
}

// ---------------- ⌘K komut paleti ----------------
let palet = null;
export function komutPaleti(eylemler) {
  if (palet) return paletKapat();
  palet = el('div', 'modal-arka palet-arka');
  const kutu = el('div', 'palet');
  const girdi = el('input');
  girdi.placeholder = 'Ne yapmak istersin?';
  const liste = el('div', 'palet-liste');
  kutu.append(girdi, liste);
  palet.append(kutu);
  document.body.append(palet);
  let secili = 0;
  let gorunen = eylemler;
  const ciz = () => {
    const q = girdi.value.toLocaleLowerCase('tr').trim();
    gorunen = eylemler.filter((e) => !q || e.ad.toLocaleLowerCase('tr').includes(q) || (e.anahtar || '').includes(q));
    secili = Math.min(secili, Math.max(0, gorunen.length - 1));
    liste.innerHTML = '';
    gorunen.forEach((e, i) => {
      const s = el('button', `palet-oge ${i === secili ? 'secili' : ''}`);
      if (e.ajan) s.append(kafaAvatari(ajanBul(e.ajan), 26));
      else s.append(el('span', 'nokta'));
      s.append(el('span', '', e.ad));
      if (e.kisayol) s.append(el('kbd', '', e.kisayol));
      s.onclick = () => calistir(e);
      liste.append(s);
    });
  };
  const calistir = (e) => {
    paletKapat();
    e.yap();
  };
  girdi.addEventListener('input', () => {
    secili = 0;
    ciz();
  });
  girdi.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') secili = Math.min(gorunen.length - 1, secili + 1);
    else if (e.key === 'ArrowUp') secili = Math.max(0, secili - 1);
    else if (e.key === 'Enter' && gorunen[secili]) return calistir(gorunen[secili]);
    else if (e.key === 'Escape') return paletKapat();
    else return;
    e.preventDefault();
    ciz();
  });
  palet.addEventListener('click', (e) => e.target === palet && paletKapat());
  ciz();
  girdi.focus();
}

export function paletKapat() {
  palet?.remove();
  palet = null;
}

// ---------------- Belge: "kime vereyim?" kartı ----------------
const BELGE_ONERI = { pdf: 'zeynep', gorsel: 'kerem' };
export function belgeKarti(b) {
  const onerilen = BELGE_ONERI[b.tur] || 'defne';
  const ajanlarListesi = ajanlar();
  bildirim({
    baslik: 'Belge hazır, kime vereyim?',
    metin: `${b.ad}${b.uzunluk ? ` (${Math.round(b.uzunluk / 1000)} bin karakter)` : ''}`,
    tur: 'basari',
    sure: 45000,
    sinif: 'belge',
    butonlar: [
      ...ajanlarListesi
        .slice()
        .sort((x, y) => (y.id === onerilen) - (x.id === onerilen))
        .map((a) => ({
          etiket: a.name,
          birincil: a.id === onerilen,
          tikla: () => api.konus(`${a.name}, "${b.ad}" belgesini incele ve işine yarayanı yap (belge id: ${b.id}).`),
        })),
      { etiket: 'Sadece sakla' },
    ],
  });
}

// ---------------- Görsel önizleme bildirimi ----------------
export function gorselBildirim(o) {
  const b = bildirim({ ajan: o.ajan, baslik: 'Görsel hazır, panoya kopyalandı', metin: 'Paylaşım ekranında ⌘V ile ekleyebilirsin.', sure: 20000, butonlar: [{ etiket: "Finder'da göster", tikla: () => api.gorselGoster(o.dosya) }] });
  if (o.kucuk) {
    const img = el('img', 'gorsel-onizleme');
    img.src = o.kucuk;
    img.alt = 'Üretilen görselin önizlemesi';
    document.querySelector('.bildirim .govde')?.prepend(img);
  }
  return b;
}

// ---------------- Odak sayacı ----------------
let odakZamani = null;
export function odakSayaci(bitis) {
  let k = document.getElementById('odak');
  clearInterval(odakZamani);
  if (!bitis) {
    k?.remove();
    return;
  }
  if (!k) {
    k = el('div', 'odak-sayac');
    k.id = 'odak';
    const yazi = el('span', 'sure-yazi');
    const bitir = el('button', '', 'Bitir');
    bitir.onclick = () => api.odakBitir?.();
    k.append(el('b', '', 'Odak'), yazi, bitir);
    document.body.append(k);
  }
  const yaz = () => {
    const kalan = Math.max(0, new Date(bitis) - Date.now());
    const dk = Math.floor(kalan / 60000);
    const sn = Math.floor((kalan % 60000) / 1000);
    k.querySelector('.sure-yazi').textContent = `${String(dk).padStart(2, '0')}:${String(sn).padStart(2, '0')}`;
    if (!kalan) clearInterval(odakZamani);
  };
  yaz();
  odakZamani = setInterval(yaz, 1000);
}

// ---------------- Günün tek işi: duvardaki yapışkan not ----------------
export function gununIsiNotu(g, tamamla) {
  let n = document.getElementById('gunun-isi');
  if (!g || !g.metin) {
    n?.remove();
    return;
  }
  if (!n) {
    n = el('button', 'gunun-isi');
    n.id = 'gunun-isi';
    n.title = 'Tıkla: yapıldı olarak işaretle';
    n.append(el('i', 'raptiye'), el('small', '', 'Bugünün tek işi'), el('span', 'is'));
    n.onclick = () => tamamla(!n.classList.contains('tamam'));
    document.body.append(n);
  }
  n.querySelector('.is').textContent = g.metin;
  n.classList.toggle('tamam', !!g.tamam);
}
