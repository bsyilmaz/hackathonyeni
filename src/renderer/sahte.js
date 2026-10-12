// Sadece tarayıcıda tasarım önizlemesi için: Electron köprüsü yokken sahte veriler döner.
const IDLER = ['defne', 'mert', 'zeynep', 'kerem', 'elif', 'cem'];

export function sahteApi() {
  let dinleyici = () => {};
  const yay = (o) => setTimeout(() => dinleyici(o), 0);
  let ajanlar = null;
  return {
    kadro: async () => {
      if (!ajanlar) ajanlar = await Promise.all(IDLER.map((id) => fetch(`../../agents/${id}.json`).then((r) => r.json())));
      return ajanlar.map((a) => ({ ...a, renk: a.renk, ses: a.ses }));
    },
    ayarlar: async () => ({
      kullaniciAdi: '', deepseekModel: 'deepseek-chat', sabahBrifingi: '09:00', aksamKontrolu: '21:00', sessizBaslangic: '00:30', sessizBitis: '08:00',
      whisperModel: 'onnx-community/whisper-small', aylikButceUSD: 5, fiyatOnbellekIsabet: 0.028, fiyatOnbellekKacirma: 0.28, fiyatCikti: 0.42,
      kodDunyasi: '/Users/sen/Desktop/keremcodeworld', anahtarlar: { deepseekApiKey: false }, sesler: {}, onerilenSesler: [], sesMotoru: 'yerel', yerelSesler: [0,1,2,3,4,5,6,7,8,9].map((sid) => ({ sid, etiket: (sid < 5 ? 'Kadın ' + (sid + 1) : 'Erkek ' + (sid - 4)) })),
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
    konus: async (metin) => {
      // Önizleme senaryoları: tweet -> onay kartı; ödev -> sevinç; hatırlat -> hatırlatma kartı; diğer -> akışlı cevap.
      const tur = Date.now();
      const sirali = (l) => l.forEach(([ms, o]) => setTimeout(() => yay(o), ms));
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
    onayDogrula: async (id, args) => ({ gecerli: args.parcalar.every((p) => [...p].length <= 280), hata: 'Bir parça 280 karakteri aşıyor.' }),
    hatirlatmaErtele: async (id, dk) => ({ okunur: `${dk} dakika sonra` }),
    onaylar: async () => [],
    sesDene: async () => null,
    merhaba: async () => {},
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
