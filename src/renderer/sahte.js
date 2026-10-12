// Sadece tarayıcıda tasarım önizlemesi için: Electron köprüsü yokken sahte veriler döner.
const IDLER = ['defne', 'mert', 'zeynep', 'kerem', 'elif', 'cem'];

const LANS_MAN_GORSELI = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" role="img" aria-label="AI Kadrom launch visual">
  <rect width="1200" height="675" fill="#fff6e6"/>
  <path d="M0 0h430v675H0z" fill="#a8323e"/>
  <path d="M430 0h24v675h-24z" fill="#141a2b"/>
  <circle cx="216" cy="188" r="108" fill="#ffc43d" stroke="#141a2b" stroke-width="12"/>
  <path d="M114 421h205v36H114zm42-64h205v36H156zm42-64h205v36H198z" fill="#fff6e6" stroke="#141a2b" stroke-width="9"/>
  <text x="520" y="238" fill="#22304f" font-family="Arial, sans-serif" font-size="42" font-weight="700" letter-spacing="5">SOLO FOUNDER'S</text>
  <text x="520" y="340" fill="#141a2b" font-family="Arial, sans-serif" font-size="88" font-weight="900">AI KADROM</text>
  <path d="M520 390h568" stroke="#141a2b" stroke-width="12"/>
  <text x="520" y="468" fill="#22304f" font-family="Arial, sans-serif" font-size="35" font-weight="700">ONE GOAL. ONE COORDINATED CREW.</text>
  <g fill="#ffc43d" stroke="#141a2b" stroke-width="8">
    <circle cx="548" cy="560" r="26"/><circle cx="628" cy="560" r="26"/><circle cx="708" cy="560" r="26"/>
    <circle cx="788" cy="560" r="26"/><circle cx="868" cy="560" r="26"/><circle cx="948" cy="560" r="26"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
})();

const ILK_LANSMAN_ISTEGI = /(?=.*(?:cuma|friday))(?=.*(?:linkedin|paylaşım|paylasim))(?=.*(?:görsel|gorsel|lansman|tanıt))/is;
const LANSMAN_REVIZYONU = /(?=.*(?:pazartesi|monday))(?=.*(?:profesyonel|professional))(?=.*(?:görsel|gorsel))(?=.*(?:aynı|ayni|koru))/is;

async function ajanDosyasiOku(id) {
  let sonHata;
  for (const yol of [`./agents/${id}.json`, `../../agents/${id}.json`]) {
    try {
      const yanit = await fetch(yol);
      if (!yanit.ok) throw new Error(`${yanit.status} ${yanit.statusText}`);
      return await yanit.json();
    } catch (e) {
      sonHata = e;
    }
  }
  throw new Error(`${id} ajanı yüklenemedi: ${sonHata?.message || 'dosya bulunamadı'}`);
}

const V1_PAKETI = {
  surum: 'v1',
  paylasim: {
    metin: `We are launching AI Kadrom this Friday.

AI Kadrom turns one spoken or written goal into coordinated work across a personal AI team. Defne routes the brief, Kerem verifies the product facts, Mert prepares the launch story and visual, and Elif builds the schedule.

The result is not another chat transcript. It is an editable LinkedIn draft, a downloadable visual, and a launch plan you can review before anything goes live.

Built for solo founders who want to move faster without giving up control.`,
  },
  gorsel: { src: LANS_MAN_GORSELI, alt: 'AI Kadrom için düz renkli lansman afişi', dosyaAdi: 'ai-kadrom-launch.svg' },
  plan: [
    { tarih: 'Salı · 13 Ekim', baslik: 'Ürün gerçeklerini kilitle', detay: 'Demo kapsamını ve üç temel çıktıyı doğrula.', baslangic: '2026-10-13T10:00:00+03:00' },
    { tarih: 'Çarşamba · 14 Ekim', baslik: 'Metin ve görseli gözden geçir', detay: 'LinkedIn metnini düzenle, görsel dosyasını indir.', baslangic: '2026-10-14T14:00:00+03:00' },
    { tarih: 'Perşembe · 15 Ekim', baslik: 'Canlı demo provası yap', detay: 'İlk hedef ve revizyon akışını uçtan uca dene.', baslangic: '2026-10-15T16:00:00+03:00' },
    { tarih: 'Cuma · 16 Ekim', baslik: 'Lansmanı yayımla', detay: 'Son onaydan sonra paylaşımı kullanıcı kendi hesabından yayımlar.', baslangic: '2026-10-16T10:00:00+03:00' },
  ],
  acikSekme: 'paylasim',
};

const V2_PAKETI = {
  surum: 'v2',
  paylasim: {
    metin: `On Monday, we are introducing AI Kadrom, a personal AI team designed for solo founders.

A single spoken or written objective is translated into coordinated work: Defne manages the brief, Kerem validates product facts, Mert develops the launch narrative and visual, and Elif structures the delivery plan.

Every result remains under the founder's control. The LinkedIn copy is editable, the visual is downloadable, and the launch plan is reviewable before publication.

AI Kadrom is our practical answer to a simple question: what if one clear goal could mobilize an entire specialist team?`,
  },
  // Aynı sabit data URL bilinçli olarak yeniden kullanılır; görsel revizyonda üretilmez.
  gorsel: { src: LANS_MAN_GORSELI, alt: 'AI Kadrom için düz renkli lansman afişi', dosyaAdi: 'ai-kadrom-launch.svg' },
  plan: [
    { tarih: 'Cuma · 16 Ekim', baslik: 'Profesyonel metni son kez incele', detay: 'Ton, ürün iddiaları ve çağrıyı doğrula.', baslangic: '2026-10-16T15:00:00+03:00' },
    { tarih: 'Cumartesi · 17 Ekim', baslik: 'Demo kaydını kontrol et', detay: 'Hedef ve revizyon akışının kesintisiz çalıştığını doğrula.', baslangic: '2026-10-17T11:00:00+03:00' },
    { tarih: 'Pazar · 18 Ekim', baslik: 'Pazartesi paketini kilitle', detay: 'Metni ve planı onayla; mevcut görseli aynen koru.', baslangic: '2026-10-18T17:00:00+03:00' },
    { tarih: 'Pazartesi · 19 Ekim', baslik: 'Lansmanı yayımla', detay: 'Son onaydan sonra paylaşımı kullanıcı kendi hesabından yayımlar.', baslangic: '2026-10-19T10:00:00+03:00' },
  ],
  revizyon: {
    degisti: ['LinkedIn metni', 'Lansman tarihi', 'Plan adımları'],
    korundu: ['Tanıtım görseli'],
  },
  acikSekme: 'paylasim',
};

export function sahteApi() {
  let dinleyici = () => {};
  const yay = (o) => setTimeout(() => dinleyici(o), 0);
  let ajanlar = null;
  let akisSirasi = 0;
  const sirali = (liste) => {
    const buAkis = ++akisSirasi;
    liste.forEach(([ms, o]) => setTimeout(() => buAkis === akisSirasi && yay(o), ms));
  };
  return {
    kadro: async () => {
      if (!ajanlar) ajanlar = await Promise.all(IDLER.map(ajanDosyasiOku));
      return ajanlar.map((a) => ({ ...a, renk: a.renk, ses: a.ses }));
    },
    ayarlar: async () => ({
      kullaniciAdi: '', deepseekModel: 'deepseek-chat', sabahBrifingi: '09:00', aksamKontrolu: '21:00', sessizBaslangic: '00:30', sessizBitis: '08:00',
      whisperModel: 'onnx-community/whisper-small', aylikButceUSD: 5, fiyatOnbellekIsabet: 0.028, fiyatOnbellekKacirma: 0.28, fiyatCikti: 0.42,
      kodDunyasi: '/Users/sen/Desktop/keremcodeworld', anahtarlar: { deepseekApiKey: true }, sesler: {}, onerilenSesler: [], sesMotoru: 'yerel', yerelSesler: [0,1,2,3,4,5,6,7,8,9].map((sid) => ({ sid, etiket: (sid < 5 ? 'Kadın ' + (sid + 1) : 'Erkek ' + (sid - 4)) })),
      modeller: { whisper: { model: 'whisper', durum: 'hazir' }, gomme: { model: 'gomme', durum: 'hazir' } },
      kullanim: { cagri: 142, maliyetUSD: 0.0412, onbellekOrani: 0.83, ajanlar: { kerem: { cagri: 60, maliyetUSD: 0.03 }, elif: { cagri: 40, maliyetUSD: 0.006 }, yonlendirici: { cagri: 12, maliyetUSD: 0.0004 } } },
      sosyalPlatformlar: [{ id: 'x', ad: 'X' }, { id: 'threads', ad: 'Threads' }, { id: 'bluesky', ad: 'Bluesky' }, { id: 'linkedin', ad: 'LinkedIn' }, { id: 'instagram', ad: 'Instagram' }],
    }),
    ayarlariKaydet: async (d) => d,
    kodDunyasiSec: async () => null,
    sosyalGiris: async () => {},
    sosyalSonraki: async () => {},
    iptal: async () => {},
    dinle: async () => '',
    konus: async (metin, baglam = {}) => {
      // Önizleme senaryoları: tweet -> onay kartı; ödev -> sevinç; hatırlat -> hatırlatma kartı; diğer -> akışlı cevap.
      const tur = Date.now();
      const ozel = baglam?.ozelAjan;
      if (ozel?.id) {
        const beceriler = (ozel.skills || []).slice(0, 3).join(', ') || 'atanan uzmanlık';
        return sirali([
          [100, { tip: 'dusunuyor', ajan: ozel.id }],
          [450, { tip: 'arac', ajan: ozel.id, arac: 'hatirla' }],
          [1050, { tip: 'soyle', ajan: ozel.id, metin: `${ozel.name} devrede. ${ozel.rol} rolüyle “${metin}” hedefini ele alıyorum. Kullanacağım başlıklar: ${beceriler}. İlk adım, beklenen çıktıyı ve başarı ölçütünü netleştirmek.`, ses: null, tur }],
          [1500, { tip: 'bitti' }],
        ]);
      }
      if (LANSMAN_REVIZYONU.test(metin)) {
        return sirali([
          [100, { tip: 'dusunuyor', ajan: 'defne' }],
          [350, { tip: 'soyle', ajan: 'defne', metin: 'Revizyonu ayırdım: metin ve tarih değişecek, mevcut görsele dokunulmayacak.', ses: null, tur }],
          [650, { tip: 'dusunme-bitti', ajan: 'defne' }],
          [750, { tip: 'gorev-verildi', kimden: 'defne', kime: 'mert' }],
          [950, { tip: 'arac', ajan: 'mert', arac: 'paylasim_hazirla' }],
          [1550, { tip: 'soyle', ajan: 'mert', metin: 'LinkedIn metnini daha kurumsal bir tonda yeniden yazdım. Görsel referansı aynen kaldı.', ses: null, tur }],
          [1800, { tip: 'dusunme-bitti', ajan: 'mert' }],
          [1900, { tip: 'gorev-verildi', kimden: 'mert', kime: 'elif' }],
          [2150, { tip: 'arac', ajan: 'elif', arac: 'etkinlik_guncelle' }],
          [2750, { tip: 'soyle', ajan: 'elif', metin: 'Lansman gününü pazartesiye taşıdım ve hazırlık adımlarını yeni tarihe göre düzenledim.', ses: null, tur }],
          [3000, { tip: 'dusunme-bitti', ajan: 'elif' }],
          [3250, { tip: 'soyle', ajan: 'defne', metin: 'İkinci sürüm hazır. Değişen ve korunan alanları paketin altında görebilirsin.', ses: null, tur }],
          [3500, { tip: 'lansman-paketi', paket: V2_PAKETI }],
          [3650, { tip: 'bitti' }],
        ]);
      }
      if (ILK_LANSMAN_ISTEGI.test(metin)) {
        return sirali([
          [100, { tip: 'dusunuyor', ajan: 'defne' }],
          [350, { tip: 'arac', ajan: 'defne', arac: 'ekibe_ilet' }],
          [650, { tip: 'soyle', ajan: 'defne', metin: 'Hedefi üç çıktıya ayırdım: doğrulanmış ürün hikâyesi, LinkedIn metni ve görseli, tarihli lansman planı.', ses: null, tur }],
          [850, { tip: 'dusunme-bitti', ajan: 'defne' }],
          [900, { tip: 'gorev-verildi', kimden: 'defne', kime: 'kerem' }],
          [1150, { tip: 'arac', ajan: 'kerem', arac: 'proje_ozeti' }],
          [1750, { tip: 'soyle', ajan: 'kerem', metin: 'Ürünün gerçek kapsamını çıkardım: tek hedef, koordineli ekip, düzenlenebilir çıktı ve tutarlı revizyon.', ses: null, tur }],
          [1950, { tip: 'dusunme-bitti', ajan: 'kerem' }],
          [2000, { tip: 'gorev-verildi', kimden: 'kerem', kime: 'mert' }],
          [2250, { tip: 'arac', ajan: 'mert', arac: 'paylasim_hazirla' }],
          [2850, { tip: 'soyle', ajan: 'mert', metin: 'İngilizce LinkedIn taslağını ve düz renkli lansman görselini hazırladım.', ses: null, tur }],
          [3050, { tip: 'dusunme-bitti', ajan: 'mert' }],
          [3100, { tip: 'gorev-verildi', kimden: 'mert', kime: 'elif' }],
          [3300, { tip: 'arac', ajan: 'elif', arac: 'etkinlik_ekle' }],
          [3850, { tip: 'soyle', ajan: 'elif', metin: 'Cuma lansmanına kadar yapılacakları tarihledim ve takvim dosyasını hazırladım.', ses: null, tur }],
          [4050, { tip: 'dusunme-bitti', ajan: 'elif' }],
          [4200, { tip: 'soyle', ajan: 'defne', metin: 'Lansman paketi hazır. İncelemeden ve sen onaylamadan hiçbir şey yayımlanmaz.', ses: null, tur }],
          [4450, { tip: 'lansman-paketi', paket: V1_PAKETI }],
          [4600, { tip: 'bitti' }],
        ]);
      }
      if (/tweet|paylaş/i.test(metin)) {
        return sirali([
          [100, { tip: 'dusunuyor', ajan: 'mert' }],
          [500, { tip: 'arac', ajan: 'mert', arac: 'paylasim_hazirla' }],
          [1300, { tip: 'onay', id: 'o1', ajan: 'mert', baslik: 'X için 2 parçalık flood hazır', meta: { tur: 'paylasim', platform: 'x', sinir: 280, parcalar: ['benimhakkimda.com yayında! Kendini anlatmanın en kolay yolu 🚀', 'Kurulumu 2 dakika, tamamen ücretsiz. Linki profilimde.'] } }],
          [1400, { tip: 'soyle', ajan: 'mert', metin: 'İki parçalık bir flood hazırladım, ekrana koydum.', ses: null, tur }],
          [1500, { tip: 'bitti' }],
        ]);
      }
      if (/ödev|bitirdim/i.test(metin)) {
        return sirali([
          [100, { tip: 'dusunuyor', ajan: 'zeynep' }],
          [400, { tip: 'arac', ajan: 'zeynep', arac: 'odev_tamamla' }],
          [1100, { tip: 'arac-sonuc', ajan: 'zeynep', arac: 'odev_tamamla', basarili: true }],
          [1200, { tip: 'soyle', ajan: 'zeynep', metin: 'Helal olsun! Fizik ödevini kapattım.', ses: null, tur }],
          [1300, { tip: 'bitti' }],
        ]);
      }
      if (/plan/i.test(metin)) {
        return sirali([
          [100, { tip: 'dusunuyor', ajan: 'kerem' }],
          [400, { tip: 'arac', ajan: 'kerem', arac: 'dosya_oku' }],
          [1200, { tip: 'onay', id: 'p1', ajan: 'kerem', baslik: 'Plan: İletişim formu ekle', meta: { tur: 'plan', adimlar: ['src/app/iletisim/page.tsx sayfasını oluştur', 'Formu Supabase tablosuna bağla', 'Spam için basit hız sınırı ekle', 'Build al, sayfa_kontrol ile test et'], dosyalar: ['src/app/iletisim/page.tsx', 'src/lib/supabase.ts'] } }],
          [1300, { tip: 'soyle', ajan: 'kerem', metin: 'Planı ekrana koydum, onaylarsan başlarım.', ses: null, tur }],
          [1400, { tip: 'bitti' }],
        ]);
      }
      if (/odak/i.test(metin)) return sirali([[300, { tip: 'odak', bitis: new Date(Date.now() + 45 * 60000).toISOString() }]]);
      if (/belge/i.test(metin)) return sirali([[200, { tip: 'belge-durum', id: 'b1', ad: 'fizik-izlence.pdf', durum: 'hazir', uzunluk: 12400, tur: 'pdf' }]]);
      if (/günün işi/i.test(metin)) return sirali([[200, { tip: 'gunun-isi', metin: 'Fizik ödevini bitir', tamam: false }]]);
      if (/görsel/i.test(metin)) return sirali([[200, { tip: 'gorsel', ajan: 'mert', dosya: '/tmp/x.png', kucuk: '' }]]);
      if (/hatırlat/i.test(metin)) {
        return sirali([[200, { tip: 'hatirlatma', id: 'h1', ajan: 'elif', metin: 'Diş randevun 30 dakika sonra başlıyor, yer: Kızılay.' }]]);
      }
      sirali([
        [100, { tip: 'dusunuyor', ajan: 'elif' }],
        [500, { tip: 'arac', ajan: 'elif', arac: 'etkinlikleri_listele' }],
        [1400, { tip: 'soyle', ajan: 'elif', metin: `Tamam, "${metin}" dedin.`, ses: null, tur }],
        [1500, { tip: 'soyle', ajan: 'elif', metin: 'Bu bir önizleme, gerçek uygulamada cevaplar cümle cümle akarak gelir.', ses: null, tur }],
        [1600, { tip: 'bitti' }],
      ]);
    },
    onay: async () => {},
    onayDogrula: async (id, args = {}) => ({ gecerli: (args.parcalar || args.adimlar || []).every((p) => [...p].length <= 280), hata: 'Bir parça 280 karakteri aşıyor.' }),
    hatirlatmaErtele: async (id, dk) => ({ okunur: `${dk} dakika sonra` }),
    onaylar: async () => [],
    sesDene: async () => null,
    merhaba: async () => yay({
      tip: 'bildirim',
      tur: 'bilgi',
      baslik: 'Web demosu hazır',
      metin: 'Hazır hedefi Enter ile ekibe ver. Örnek veriler kullanılır; hiçbir paylaşım otomatik yayımlanmaz.',
      sure: 5200,
    }),
    disAc: async () => {},
    dosyaYolu: () => null,
    belgeEkle: async () => [],
    belgeSec: async () => [],
    gorselGoster: async () => {},
    gununIsi: async () => null,
    gununIsiTamam: async (t) => ({ metin: 'Fizik ödevini bitir', tamam: t !== false }),
    odak: async () => null,
    odakBitir: async () => yay({ tip: 'odak', bitis: null }),
    olay: (fn) => {
      dinleyici = fn;
    },
  };
}
