// Sesli okuma için metin yardımcıları.

// Markdown, link vb. sesli okunmayacak şeyleri temizler.
function sesliMetin(metin) {
  return String(metin || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\*\*|__|[*_#`>|]/g, '')
    .replace(/^\s*(?:[-•]|\d+\.)\s+/gm, '')
    .replace(/https?:\/\/\S+/g, 'bağlantı')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// Akış halinde gelen metni cümlelere böler; her tam cümle hazır olur olmaz geri çağırır.
// Böylece ajan cevabın tamamını beklemeden konuşmaya başlar.
// - Çok kısa parçalar ("Tamam.") bir sonrakiyle birleştirilir (sesler kesik kesik olmasın).
// - Uzun ve noktasız metin virgülden bölünür.
// - Kod blokları (```) kapanana kadar tutulur ve okunmaz.
class CumleBolucu {
  constructor(geriCagir, { enAz = 25, enCok = 220 } = {}) {
    this.cb = geriCagir;
    this.t = '';
    this.enAz = enAz;
    this.enCok = enCok;
    this.toplam = '';
  }

  ekle(parca) {
    this.t += parca;
    this.toplam += parca;
    this.bosalt(false);
  }

  bitir() {
    this.bosalt(true);
  }

  bosalt(son) {
    for (;;) {
      // Kapanmamış kod bloğu varsa, onun başından sonrasını beklet.
      const citler = [...this.t.matchAll(/```/g)];
      const islenebilir = citler.length % 2 === 1 && !son ? this.t.slice(0, citler.at(-1).index) : this.t;
      const re = /[.!?…]+["'”’)]*\s+|\n+/g;
      let kes = -1;
      let m;
      while ((m = re.exec(islenebilir))) {
        const bitis = m.index + m[0].length;
        const aday = islenebilir.slice(0, bitis);
        if ((aday.match(/```/g) || []).length % 2 === 1) continue; // kod bloğunun içi
        if (sesliMetin(aday).length >= this.enAz) {
          kes = bitis;
          break;
        }
      }
      if (kes < 0 && islenebilir.length > this.enCok && !/```/.test(islenebilir)) {
        const v = islenebilir.lastIndexOf(', ', this.enCok - 20);
        if (v > 60) kes = v + 2;
      }
      if (kes < 0) break;
      this.yay(this.t.slice(0, kes));
      this.t = this.t.slice(kes);
    }
    if (son && this.t.trim()) {
      this.yay(this.t);
      this.t = '';
    }
  }

  yay(s) {
    const temiz = sesliMetin(s);
    if (temiz) this.cb(temiz);
  }
}

module.exports = { sesliMetin, CumleBolucu };
