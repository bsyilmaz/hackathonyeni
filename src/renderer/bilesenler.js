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

// ---------------- Lansman paketi: paylaşım, görsel ve plan ----------------
// Web demosu bu tek çekmeceyi kullanır. Electron tarafı da aynı veri şemasıyla
// çağırabilir; DOM index.html'de yoksa burada oluşturulur.
let paketDugumu = null;
let paketKapanmaZamani = null;
let paketEscapeKuruldu = false;

const VARSAYILAN_PAYLASIM = `Meet AI Kadrom: one goal, a coordinated team, and launch-ready work you can actually edit.

Defne coordinates the brief, Kerem checks the product facts, Mert prepares the story and visual, and Elif turns it into a practical launch plan.

Built for solo founders who want to move from intention to a consistent launch package without giving up control.`;

function paketMetinListesi(deger) {
  if (!deger) return [];
  return (Array.isArray(deger) ? deger : [deger])
    .map((x) => (typeof x === 'string' ? x : x?.baslik || x?.ad || ''))
    .map((x) => x.trim())
    .filter(Boolean);
}

function paketVerisiniDuzenle(veri = {}) {
  const paylasim = typeof veri.paylasim === 'string' ? { metin: veri.paylasim } : veri.paylasim || {};
  const gorsel = typeof veri.gorsel === 'string' ? { src: veri.gorsel } : veri.gorsel || {};
  const hamPlan = Array.isArray(veri.plan) ? veri.plan : veri.plan?.adimlar || veri.adimlar || [];
  const revizyon = veri.revizyon || {};
  return {
    surum: String(veri.surum || veri.versiyon || 'v1'),
    paylasim: {
      metin: String(paylasim.metin || veri.metin || VARSAYILAN_PAYLASIM),
    },
    gorsel: {
      src: gorsel.src || gorsel.url || gorsel.svg || '',
      alt: String(gorsel.alt || 'AI Kadrom lansman görseli'),
      dosyaAdi: String(gorsel.dosyaAdi || gorsel.dosya || 'ai-kadrom-lansman.svg'),
      baslik: String(gorsel.baslik || 'AI KADROM'),
    },
    plan: hamPlan.map((p, i) => {
      if (typeof p === 'string') return { tarih: `Adım ${i + 1}`, baslik: p, detay: '', tamam: false };
      return {
        tarih: String(p.tarih || p.zaman || `Adım ${i + 1}`),
        baslik: String(p.baslik || p.ad || p.metin || `Hazırlık ${i + 1}`),
        detay: String(p.detay || p.aciklama || ''),
        tamam: !!p.tamam,
        baslangic: p.baslangic || p.baslangicISO || p.iso || '',
        bitis: p.bitis || p.bitisISO || '',
      };
    }),
    revizyon: {
      degisti: paketMetinListesi(revizyon.degisti || revizyon.degisen || veri.degisti || veri.degisen),
      korundu: paketMetinListesi(revizyon.korundu || revizyon.korunan || veri.korundu || veri.korunan),
    },
    acikSekme: ['paylasim', 'gorsel', 'plan'].includes(veri.acikSekme) ? veri.acikSekme : null,
  };
}

function varsayilanPaketGorseli(baslik) {
  const temizBaslik = String(baslik || 'AI KADROM').replace(/[<>&"']/g, '').slice(0, 34);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="AI Kadrom lansman afişi">
  <rect width="1200" height="675" fill="#fff6e6"/>
  <path d="M0 0h430v675H0z" fill="#a8323e"/>
  <path d="M430 0h24v675h-24z" fill="#141a2b"/>
  <circle cx="216" cy="188" r="108" fill="#ffc43d" stroke="#141a2b" stroke-width="12"/>
  <path d="M114 421h205v36H114zm42-64h205v36H156zm42-64h205v36H198z" fill="#fff6e6" stroke="#141a2b" stroke-width="9"/>
  <text x="520" y="238" fill="#22304f" font-family="Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="5">SOLO FOUNDER'S</text>
  <text x="520" y="340" fill="#141a2b" font-family="Arial, sans-serif" font-size="88" font-weight="900">${temizBaslik}</text>
  <path d="M520 390h568" stroke="#141a2b" stroke-width="12"/>
  <text x="520" y="468" fill="#22304f" font-family="Arial, sans-serif" font-size="35" font-weight="700">ONE GOAL. ONE COORDINATED CREW.</text>
  <g fill="#ffc43d" stroke="#141a2b" stroke-width="8">
    <circle cx="548" cy="560" r="26"/><circle cx="628" cy="560" r="26"/><circle cx="708" cy="560" r="26"/>
    <circle cx="788" cy="560" r="26"/><circle cx="868" cy="560" r="26"/><circle cx="948" cy="560" r="26"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function paketGorselKaynagi(gorsel) {
  const kaynak = String(gorsel.src || '').trim();
  if (!kaynak) return varsayilanPaketGorseli(gorsel.baslik);
  if (kaynak.startsWith('<svg')) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(kaynak)}`;
  if (/^(data:image\/(?:svg\+xml|png|jpe?g|webp|gif);|blob:|https?:\/\/|\.?\.?\/|\/)/i.test(kaynak)) return kaynak;
  return varsayilanPaketGorseli(gorsel.baslik);
}

function guvenliDosyaAdi(ad, varsayilan) {
  const temiz = String(ad || '').replace(/[\\/:*?"<>|]+/g, '-').trim();
  return temiz || varsayilan;
}

function dosyaIndir(href, dosyaAdi) {
  const a = document.createElement('a');
  a.href = href;
  a.download = dosyaAdi;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

async function panoyaYaz(metin) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(metin);
  const alan = el('textarea');
  alan.value = metin;
  alan.style.position = 'fixed';
  alan.style.left = '-9999px';
  document.body.append(alan);
  alan.select();
  const basarili = document.execCommand('copy');
  alan.remove();
  if (!basarili) throw new Error('Kopyalanamadı');
}

const icsKacir = (metin) => String(metin || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const icsTarih = (deger) => {
  const d = new Date(deger);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

function planIcsIndir(plan) {
  const damga = icsTarih(new Date());
  const satirlar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI Kadrom//Lansman Plani//TR', 'CALSCALE:GREGORIAN'];
  plan.forEach((p, i) => {
    const son = icsTarih(p.bitis || p.baslangic);
    satirlar.push('BEGIN:VTODO', `UID:ai-kadrom-${Date.now()}-${i}@demo.local`, `DTSTAMP:${damga}`, `SUMMARY:${icsKacir(p.baslik)}`);
    if (p.detay || p.tarih) satirlar.push(`DESCRIPTION:${icsKacir([p.tarih, p.detay].filter(Boolean).join(' · '))}`);
    if (son) satirlar.push(`DUE:${son}`);
    satirlar.push(`STATUS:${p.tamam ? 'COMPLETED' : 'NEEDS-ACTION'}`, 'END:VTODO');
  });
  satirlar.push('END:VCALENDAR');
  const url = URL.createObjectURL(new Blob([`${satirlar.join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' }));
  dosyaIndir(url, 'ai-kadrom-lansman-plani.ics');
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function paketOlayi(ad, detay) {
  document.dispatchEvent(new CustomEvent(`lansman-paketi:${ad}`, { detail: detay }));
}

function paketRevizyonOzeti(revizyon) {
  if (!revizyon.degisti.length && !revizyon.korundu.length) return null;
  const alan = el('section', 'paket-revizyon');
  alan.setAttribute('aria-label', 'Revizyon özeti');
  alan.append(el('h3', '', 'Revizyon özeti'));
  const liste = el('dl');
  if (revizyon.degisti.length) {
    liste.append(el('dt', 'degisti', 'Değişti'), el('dd', '', revizyon.degisti.join(' · ')));
  }
  if (revizyon.korundu.length) {
    liste.append(el('dt', 'korundu', 'Korundu'), el('dd', '', revizyon.korundu.join(' · ')));
  }
  alan.append(liste);
  return alan;
}

export function lansmanPaketiKapat() {
  if (!paketDugumu) return;
  paketDugumu.classList.add('kapaniyor');
  document.body.classList.remove('paket-acik');
  clearTimeout(paketKapanmaZamani);
  paketKapanmaZamani = setTimeout(() => {
    paketDugumu?.remove();
    paketDugumu = null;
  }, 180);
}

export function lansmanPaketiGoster(veri = {}) {
  const paket = paketVerisiniDuzenle(veri);
  clearTimeout(paketKapanmaZamani);
  const yeni = !paketDugumu;
  if (!paketDugumu) {
    paketDugumu = el('aside', 'lansman-paketi');
    paketDugumu.id = 'lansman-paketi';
    paketDugumu.setAttribute('aria-label', 'Lansman paketi');
    document.body.append(paketDugumu);
  }
  paketDugumu.classList.remove('kapaniyor');
  paketDugumu.innerHTML = '';
  document.body.classList.add('paket-acik');

  const ust = el('header', 'paket-ust');
  const basliklar = el('div');
  basliklar.append(el('h2', '', `Lansman paketi · ${paket.surum}`), el('p', '', 'Düzenle, indir, son kararı sen ver.'));
  const kapat = el('button', 'paket-kapat', 'Kapat');
  kapat.type = 'button';
  kapat.onclick = lansmanPaketiKapat;
  ust.append(basliklar, kapat);

  const sekmeler = el('div', 'paket-sekmeler');
  sekmeler.setAttribute('role', 'tablist');
  sekmeler.setAttribute('aria-label', 'Paket çıktıları');
  const sayfa = el('div', 'paket-sayfa');
  sayfa.setAttribute('role', 'tabpanel');
  const sekmeBilgileri = [
    ['paylasim', 'Paylaşım'],
    ['gorsel', 'Görsel'],
    ['plan', 'Plan'],
  ];
  let acikSekme = paket.acikSekme || paketDugumu.dataset.acikSekme || 'paylasim';

  const durumYaz = (metin, hata = false) => {
    let d = sayfa.querySelector('.paket-durum');
    if (!d) {
      d = el('span', 'paket-durum');
      d.setAttribute('aria-live', 'polite');
      sayfa.append(d);
    }
    d.textContent = metin;
    d.classList.toggle('hata', hata);
  };

  const paylasimiCiz = () => {
    sayfa.append(el('h3', '', 'İngilizce LinkedIn paylaşımı'));
    const alan = el('textarea', 'paket-paylasim');
    alan.value = paket.paylasim.metin;
    alan.rows = 12;
    alan.setAttribute('aria-label', 'İngilizce LinkedIn paylaşımı');
    alan.addEventListener('input', () => {
      paket.paylasim.metin = alan.value;
      paketOlayi('paylasim-degisti', { metin: alan.value, surum: paket.surum });
    });
    const alt = el('div', 'paket-eylemler');
    const not = el('small', '', 'Metin burada düzenlenebilir; otomatik yayımlanmaz.');
    const kopyala = el('button', 'paket-buton birincil', 'Metni kopyala');
    kopyala.type = 'button';
    kopyala.onclick = async () => {
      try {
        await panoyaYaz(alan.value);
        durumYaz('Metin panoya kopyalandı.');
        paketOlayi('paylasim-kopyalandi', { metin: alan.value, surum: paket.surum });
      } catch {
        durumYaz('Kopyalama izni verilmedi. Metni seçip kopyalayabilirsin.', true);
      }
    };
    alt.append(not, kopyala);
    sayfa.append(alan, alt);
  };

  const gorseliCiz = () => {
    sayfa.append(el('h3', '', 'Tanıtım görseli'));
    const kaynak = paketGorselKaynagi(paket.gorsel);
    const sekil = el('figure', 'paket-gorsel');
    const img = el('img');
    img.src = kaynak;
    img.alt = paket.gorsel.alt;
    sekil.append(img, el('figcaption', '', 'Mert’in hazırladığı sabit görsel çıktısı'));
    const alt = el('div', 'paket-eylemler');
    alt.append(el('small', '', 'Revizyonda korunabilir ve yeniden üretilmeden indirilebilir.'));
    const indir = el('button', 'paket-buton birincil', 'SVG’yi indir');
    indir.type = 'button';
    indir.onclick = () => {
      dosyaIndir(kaynak, guvenliDosyaAdi(paket.gorsel.dosyaAdi, 'ai-kadrom-lansman.svg'));
      durumYaz('Görsel indirmeye hazırlandı.');
      paketOlayi('gorsel-indirildi', { surum: paket.surum });
    };
    alt.append(indir);
    sayfa.append(sekil, alt);
  };

  const planiCiz = () => {
    sayfa.append(el('h3', '', 'Lansman planı'));
    if (!paket.plan.length) {
      sayfa.append(el('p', 'paket-bos', 'Plan adımları birazdan burada görünecek.'));
      return;
    }
    const liste = el('ol', 'paket-plan-listesi');
    paket.plan.forEach((p, i) => {
      const oge = el('li');
      const isaret = el('input');
      isaret.type = 'checkbox';
      isaret.checked = p.tamam;
      isaret.setAttribute('aria-label', `${p.baslik} tamamlandı`);
      isaret.onchange = () => {
        p.tamam = isaret.checked;
        oge.classList.toggle('tamam', p.tamam);
        paketOlayi('plan-degisti', { sira: i, tamam: p.tamam, surum: paket.surum });
      };
      const yazi = el('div');
      const zaman = el('time', '', p.tarih);
      const baslik = el('strong', '', p.baslik);
      yazi.append(zaman, baslik);
      if (p.detay) yazi.append(el('p', '', p.detay));
      oge.classList.toggle('tamam', p.tamam);
      oge.append(isaret, yazi);
      liste.append(oge);
    });
    const alt = el('div', 'paket-eylemler');
    alt.append(el('small', '', 'Takvim dosyası görevleri ve varsa tarihleri içerir.'));
    const indir = el('button', 'paket-buton birincil', 'Takvim dosyasını indir');
    indir.type = 'button';
    indir.onclick = () => {
      planIcsIndir(paket.plan);
      durumYaz('Plan .ics dosyası olarak hazırlandı.');
      paketOlayi('plan-indirildi', { surum: paket.surum });
    };
    alt.append(indir);
    sayfa.append(liste, alt);
  };

  const sekmeyiAc = (ad, odakla = false) => {
    acikSekme = ad;
    paketDugumu.dataset.acikSekme = ad;
    sayfa.innerHTML = '';
    sekmeler.querySelectorAll('[role="tab"]').forEach((btn) => {
      const secili = btn.dataset.sekme === ad;
      btn.classList.toggle('secili', secili);
      btn.setAttribute('aria-selected', String(secili));
      btn.tabIndex = secili ? 0 : -1;
      if (secili && odakla) btn.focus();
    });
    if (ad === 'gorsel') gorseliCiz();
    else if (ad === 'plan') planiCiz();
    else paylasimiCiz();
    paketOlayi('sekme', { sekme: ad, surum: paket.surum });
  };

  sekmeBilgileri.forEach(([ad, etiket], i) => {
    const btn = el('button', '', etiket);
    btn.type = 'button';
    btn.dataset.sekme = ad;
    btn.id = `paket-sekme-${ad}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', 'paket-sayfa');
    btn.onclick = () => sekmeyiAc(ad);
    btn.onkeydown = (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const yon = e.key === 'ArrowRight' ? 1 : -1;
      const sonraki = sekmeBilgileri[(i + yon + sekmeBilgileri.length) % sekmeBilgileri.length][0];
      sekmeyiAc(sonraki, true);
    };
    sekmeler.append(btn);
  });
  sayfa.id = 'paket-sayfa';
  const revizyon = paketRevizyonOzeti(paket.revizyon);
  paketDugumu.append(ust, sekmeler, sayfa, ...(revizyon ? [revizyon] : []));
  sekmeyiAc(acikSekme);

  if (yeni) {
    paketDugumu.classList.add('aciliyor');
    requestAnimationFrame(() => paketDugumu?.classList.remove('aciliyor'));
  }
  if (!paketEscapeKuruldu) {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && paketDugumu && !document.querySelector('.modal-arka, .ayarlar-arka')) lansmanPaketiKapat();
    });
    paketEscapeKuruldu = true;
  }
  return paketDugumu;
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
