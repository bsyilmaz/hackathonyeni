// Basit iCalendar (.ics) okuyucu/yazıcı. Google Takvim'in "iCal biçimindeki gizli adres"i,
// okul takvimleri vb. API'siz bağlanabilsin diye. RRULE: DAILY/WEEKLY(BYDAY)/MONTHLY/YEARLY,
// INTERVAL, COUNT, UNTIL, EXDATE ve RECURRENCE-ID (tek örnek değişikliği) desteklenir.
const GUN_KODLARI = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const SIKLIK = { DAILY: 'gunluk', WEEKLY: 'haftalik', MONTHLY: 'aylik', YEARLY: 'yillik' };

function kacis(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\([,;\\])/g, '$1')
    .trim();
}

// 20261002 (tüm gün) | 20261002T150000 (yerel) | 20261002T120000Z (UTC)
function tarihCoz(deger) {
  const m = String(deger).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, ay, g, h, dk, sn, z] = m;
  if (h === undefined) return { tarih: new Date(+y, +ay - 1, +g), tumGun: true };
  const d = z ? new Date(Date.UTC(+y, +ay - 1, +g, +h, +dk, +(sn || 0))) : new Date(+y, +ay - 1, +g, +h, +dk, +(sn || 0));
  return { tarih: d, tumGun: false };
}

function rruleCoz(deger) {
  const p = Object.fromEntries(
    String(deger)
      .split(';')
      .map((x) => x.split('='))
      .filter((x) => x.length === 2)
      .map(([k, v]) => [k.toUpperCase(), v])
  );
  const siklik = SIKLIK[p.FREQ];
  if (!siklik) return null;
  const kural = { siklik, aralik: Number(p.INTERVAL) || 1 };
  if (siklik === 'haftalik' && p.BYDAY) {
    kural.gunler = p.BYDAY.split(',')
      .map((g) => GUN_KODLARI[g.replace(/^[+-]?\d+/, '')])
      .filter(Boolean);
  }
  if (p.UNTIL) kural.bitis = tarihCoz(p.UNTIL)?.tarih?.toISOString();
  if (p.COUNT) kural.adet = Number(p.COUNT);
  return kural;
}

function coz(metin) {
  const satirlar = String(metin).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const olaylar = [];
  let o = null;
  for (const satir of satirlar) {
    if (satir === 'BEGIN:VEVENT') {
      o = { exdate: [] };
      continue;
    }
    if (satir === 'END:VEVENT') {
      if (o && o.baslangic) olaylar.push(o);
      o = null;
      continue;
    }
    if (!o) continue;
    const i = satir.indexOf(':');
    if (i < 0) continue;
    const anahtar = satir.slice(0, i).split(';')[0].toUpperCase();
    const deger = satir.slice(i + 1);
    switch (anahtar) {
      case 'UID':
        o.uid = deger.trim();
        break;
      case 'SUMMARY':
        o.baslik = kacis(deger);
        break;
      case 'LOCATION':
        o.yer = kacis(deger);
        break;
      case 'DESCRIPTION':
        o.not = kacis(deger).slice(0, 300);
        break;
      case 'STATUS':
        o.iptal = deger.trim().toUpperCase() === 'CANCELLED';
        break;
      case 'DTSTART': {
        const t = tarihCoz(deger);
        if (t) {
          o.baslangic = t.tarih;
          o.tumGun = t.tumGun;
        }
        break;
      }
      case 'DTEND': {
        const t = tarihCoz(deger);
        if (t) o.bitis = t.tarih;
        break;
      }
      case 'RRULE':
        o.tekrar = rruleCoz(deger);
        break;
      case 'EXDATE':
        for (const d of deger.split(',')) {
          const t = tarihCoz(d);
          if (t) o.exdate.push(t.tarih.toISOString());
        }
        break;
      case 'RECURRENCE-ID': {
        const t = tarihCoz(deger);
        if (t) o.yinelemeId = t.tarih.toISOString();
        break;
      }
    }
  }
  // Tek örnek değişiklikleri: ana olayda o tarihi atla, değişmiş hali ayrı olay olarak kalsın.
  const anaOlaylar = new Map(olaylar.filter((x) => !x.yinelemeId).map((x) => [x.uid, x]));
  for (const x of olaylar) {
    if (x.yinelemeId && anaOlaylar.has(x.uid)) anaOlaylar.get(x.uid).exdate.push(x.yinelemeId);
  }
  return olaylar
    .filter((x) => !x.iptal)
    .map((x) => {
      const bitis = x.bitis || new Date(x.baslangic.getTime() + (x.tumGun ? 864e5 : 3600_000));
      return {
        uid: x.uid,
        baslik: x.baslik || '(başlıksız)',
        baslangic: x.baslangic.toISOString(),
        bitis: bitis.toISOString(),
        tumGun: !!x.tumGun,
        yer: x.yer || '',
        not: x.not || '',
        tekrar: x.tekrar || null,
        istisnalar: x.exdate,
      };
    });
}

const p2 = (n) => String(n).padStart(2, '0');
function utc(d) {
  d = new Date(d);
  return `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}00Z`;
}
function gun(d) {
  d = new Date(d);
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
}
function kac(s) {
  return String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
}

function yaz(etkinlikler) {
  const kodlar = Object.fromEntries(Object.entries(GUN_KODLARI).map(([k, v]) => [v, k]));
  const freq = Object.fromEntries(Object.entries(SIKLIK).map(([k, v]) => [v, k]));
  const s = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI Kadrom//TR', 'CALSCALE:GREGORIAN'];
  for (const e of etkinlikler) {
    s.push('BEGIN:VEVENT', `UID:${e.id}@ai-kadrom`, `DTSTAMP:${utc(new Date())}`);
    if (e.tumGun) s.push(`DTSTART;VALUE=DATE:${gun(e.baslangic)}`, `DTEND;VALUE=DATE:${gun(e.bitis)}`);
    else s.push(`DTSTART:${utc(e.baslangic)}`, `DTEND:${utc(e.bitis)}`);
    s.push(`SUMMARY:${kac(e.baslik)}`);
    if (e.yer) s.push(`LOCATION:${kac(e.yer)}`);
    if (e.not) s.push(`DESCRIPTION:${kac(e.not)}`);
    const t = e.tekrar;
    if (t) {
      let r = t.siklik === 'hafta_ici' ? 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : `FREQ=${freq[t.siklik]};INTERVAL=${t.aralik || 1}`;
      if (t.siklik === 'haftalik' && t.gunler?.length) r += ';BYDAY=' + t.gunler.map((g) => kodlar[g]).join(',');
      if (t.bitis) r += ';UNTIL=' + utc(t.bitis);
      if (t.adet) r += ';COUNT=' + t.adet;
      s.push('RRULE:' + r);
      for (const x of e.istisnalar || []) s.push('EXDATE:' + utc(x));
    }
    s.push('END:VEVENT');
  }
  s.push('END:VCALENDAR');
  return s.join('\r\n');
}

module.exports = { coz, yaz };
