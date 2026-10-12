// Parametrik, sevimli 2D maskot çizimi (SVG). Görünüm ajan dosyasındaki "gorunum" alanından gelir:
// { ten, sac, sacStili: kisa|topuz|uzun|kep|daginik|bere, kiyafet, aksesuar: kulaklik|gozluk|kare-gozluk|saat, vurgu }

function ton(hex, miktar) {
  const n = parseInt(hex.replace('#', ''), 16);
  const k = (v) => Math.max(0, Math.min(255, Math.round(v + (miktar / 100) * 255)));
  return '#' + [k((n >> 16) & 255), k((n >> 8) & 255), k(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function arkaSac(g) {
  const s = g.sac;
  switch (g.sacStili) {
    case 'kisa':
      return `<path d="M36 105 C34 50 64 34 100 34 C136 34 166 50 164 105 L165 150 Q152 160 141 149 L59 149 Q48 160 35 150 Z" fill="${s}" class="k"/>`;
    case 'topuz':
      return `<circle cx="100" cy="30" r="25" fill="${s}" class="k"/><ellipse cx="100" cy="52" rx="15" ry="5" fill="${g.vurgu}" class="k"/>`;
    case 'uzun':
      return `<path d="M33 100 C29 44 64 29 100 29 C136 29 171 44 167 100 L173 212 Q100 228 27 212 Z" fill="${s}" class="k"/>`;
    default:
      return '';
  }
}

function onSac(g) {
  const s = g.sac;
  const koyu = ton(s, -6);
  switch (g.sacStili) {
    case 'kisa':
      return `<path d="M42 94 C44 52 70 39 100 39 C130 39 156 52 158 94 C142 78 124 64 100 71 C80 62 58 76 42 94 Z" fill="${s}" class="k"/>
        <path d="M41 88 C37 110 39 134 46 149 L60 149 C54 128 52 108 57 90 Z" fill="${s}" class="k"/>
        <path d="M159 88 C163 110 161 134 154 149 L140 149 C146 128 148 108 143 90 Z" fill="${s}" class="k"/>`;
    case 'topuz':
      return `<path d="M40 100 C38 52 66 38 100 38 C134 38 162 52 160 100 C150 80 128 63 100 66 C72 63 50 80 40 100 Z" fill="${s}" class="k"/>
        <path d="M44 96 C42 106 43 116 46 122 L52 118 C50 110 50 102 52 96 Z" fill="${koyu}"/>`;
    case 'uzun':
      return `<path d="M40 100 C40 50 68 35 100 35 C134 35 160 52 160 98 C146 70 118 56 90 66 C72 72 54 84 40 100 Z" fill="${s}" class="k"/>`;
    case 'kep': {
      const sapka = g.vurgu;
      return `<path d="M44 100 C42 112 44 120 48 124 L54 110 Z M156 100 C158 112 156 120 152 124 L146 110 Z" fill="${s}"/>
        <path d="M40 88 C40 40 70 27 100 27 C130 27 160 40 160 88 Z" fill="${sapka}" class="k"/>
        <path d="M100 27 C112 40 116 64 116 88" stroke="${ton(sapka, -12)}" stroke-width="3" fill="none"/>
        <path d="M100 27 C88 40 84 64 84 88" stroke="${ton(sapka, -12)}" stroke-width="3" fill="none"/>
        <rect x="38" y="82" width="124" height="10" rx="5" fill="${ton(sapka, -14)}" class="k"/>
        <path d="M118 84 C140 80 172 82 188 95 C174 103 140 98 118 94 Z" fill="${ton(sapka, -8)}" class="k"/>
        <circle cx="100" cy="28" r="5" fill="${ton(sapka, -16)}" class="k"/>`;
    }
    case 'daginik':
      return `<path d="M38 100 C34 60 52 38 72 34 L66 18 L86 30 L92 12 L106 28 L122 14 L124 32 L144 24 L139 42 C158 52 167 72 162 100 C150 82 136 70 120 70 L111 79 L101 68 L86 78 C66 72 50 84 38 100 Z" fill="${s}" class="k"/>`;
    case 'bere': {
      const b = g.vurgu;
      return `<path d="M44 100 C42 110 44 118 48 122 L56 106 Z M156 100 C158 110 156 118 152 122 L144 106 Z" fill="${s}"/>
        <path d="M38 90 C36 40 68 23 100 23 C132 23 164 40 162 90 Z" fill="${b}" class="k"/>
        <rect x="33" y="76" width="134" height="22" rx="11" fill="${ton(b, -10)}" class="k"/>
        ${[48, 62, 76, 90, 104, 118, 132, 146].map((x) => `<line x1="${x}" y1="79" x2="${x}" y2="95" stroke="${ton(b, -20)}" stroke-width="2.5" stroke-linecap="round"/>`).join('')}
        <circle cx="100" cy="21" r="13" fill="#f4efe4" class="k"/><circle cx="96" cy="17" r="4" fill="#ffffff" opacity=".7"/>`;
    }
    default:
      return `<path d="M40 96 C40 50 68 36 100 36 C132 36 160 50 160 96 C140 74 120 66 100 68 C80 66 60 74 40 96 Z" fill="${s}" class="k"/>`;
  }
}

function aksesuar(g) {
  const v = g.vurgu;
  switch (g.aksesuar) {
    case 'kulaklik':
      return `<path d="M36 104 C34 22 166 22 164 104" stroke="#2c2840" stroke-width="7" fill="none" stroke-linecap="round"/>
        <rect x="26" y="92" width="18" height="30" rx="8" fill="#2c2840" class="k"/><rect x="156" y="92" width="18" height="30" rx="8" fill="#2c2840" class="k"/>
        <rect x="29" y="97" width="6" height="20" rx="3" fill="${v}"/>
        <path d="M36 120 C38 142 58 148 78 143" stroke="#2c2840" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <circle cx="81" cy="142" r="5.5" fill="${v}" class="k"/>`;
    case 'gozluk':
      return `<g class="gozluk"><circle cx="78" cy="104" r="15" stroke="#3b2a20" stroke-width="3.5" fill="#ffffff" fill-opacity=".14"/>
        <circle cx="122" cy="104" r="15" stroke="#3b2a20" stroke-width="3.5" fill="#ffffff" fill-opacity=".14"/>
        <path d="M93 102 Q100 97 107 102" stroke="#3b2a20" stroke-width="3.5" fill="none"/></g>`;
    case 'kare-gozluk':
      return `<g class="gozluk"><rect x="61" y="92" width="34" height="25" rx="7" stroke="#11131c" stroke-width="4" fill="#9fb4ff" fill-opacity=".12"/>
        <rect x="105" y="92" width="34" height="25" rx="7" stroke="#11131c" stroke-width="4" fill="#9fb4ff" fill-opacity=".12"/>
        <path d="M95 101 L105 101" stroke="#11131c" stroke-width="4"/></g>`;
    case 'saat':
      return `<circle cx="42" cy="122" r="3.5" fill="${v}"/><circle cx="158" cy="122" r="3.5" fill="${v}"/>`;
    default:
      return '';
  }
}

function govdeEkleri(g) {
  if (g.sacStili === 'daginik') {
    // kapüşonlu: kapüşon + ipler
    return `<path d="M58 176 C66 152 134 152 142 176 C128 168 72 168 58 176 Z" fill="${ton(g.kiyafet, -10)}" class="k"/>
      <path d="M90 180 L87 214" stroke="${g.vurgu}" stroke-width="3" stroke-linecap="round"/><circle cx="87" cy="216" r="3" fill="${g.vurgu}"/>
      <path d="M110 180 L113 214" stroke="${g.vurgu}" stroke-width="3" stroke-linecap="round"/><circle cx="113" cy="216" r="3" fill="${g.vurgu}"/>`;
  }
  if (g.sacStili === 'kep') {
    return `<path d="M70 196 L130 196" stroke="${ton(g.kiyafet, -18)}" stroke-width="4" stroke-linecap="round"/>
      <text x="100" y="228" text-anchor="middle" font-size="22" font-weight="800" fill="${ton(g.kiyafet, -30)}" font-family="'Baloo 2', sans-serif">#</text>`;
  }
  const saat =
    g.aksesuar === 'saat'
      ? `<g transform="translate(132 206)"><circle r="12" fill="#fffaf0" class="k"/>
        <path d="M0 -7 L0 0 L5 3" stroke="#3a2a2a" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>`
      : '';
  return `<path d="M84 171 Q100 187 116 171" fill="none" stroke="${ton(g.kiyafet, -22)}" stroke-width="4" stroke-linecap="round"/>${saat}`;
}

export function maskotSVG(g) {
  const tenKoyu = ton(g.ten, -8);
  const kas = ton(g.sac, -4);
  const sakal = g.sacStili === 'bere' ? `<path d="M60 124 Q100 172 140 124 Q134 152 100 158 Q66 152 60 124 Z" fill="${g.sac}" opacity=".16"/>` : '';
  return `<svg viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="100" cy="244" rx="58" ry="6" class="golge"/>
    <g class="beden">
      ${g.sacStili === 'uzun' ? arkaSac(g) : ''}
      <path d="M36 248 C36 192 62 168 100 168 C138 168 164 192 164 248 Z" fill="${g.kiyafet}" class="k"/>
      ${govdeEkleri(g)}
      <rect x="88" y="148" width="24" height="26" rx="11" fill="${tenKoyu}" class="k"/>
      <g class="kafa">
        ${g.sacStili !== 'uzun' ? arkaSac(g) : ''}
        <circle cx="42" cy="106" r="12" fill="${g.ten}" class="k"/><circle cx="158" cy="106" r="12" fill="${g.ten}" class="k"/>
        <circle cx="42" cy="106" r="6" fill="${tenKoyu}"/><circle cx="158" cy="106" r="6" fill="${tenKoyu}"/>
        <ellipse cx="100" cy="100" rx="60" ry="58" fill="${g.ten}" class="k"/>
        ${sakal}
        ${onSac(g)}
        <g class="kaslar">
          <path d="M67 85 Q77 79 88 84" stroke="${kas}" stroke-width="4" fill="none" stroke-linecap="round"/>
          <path d="M112 84 Q123 79 133 85" stroke="${kas}" stroke-width="4" fill="none" stroke-linecap="round"/>
        </g>
        <g class="gozler">
          <g class="goz-bebek">
            <ellipse cx="78" cy="104" rx="7.5" ry="9.5" fill="#2a1d1a"/><circle cx="80.6" cy="100.4" r="2.9" fill="#fff"/>
            <ellipse cx="122" cy="104" rx="7.5" ry="9.5" fill="#2a1d1a"/><circle cx="124.6" cy="100.4" r="2.9" fill="#fff"/>
          </g>
        </g>
        <ellipse cx="64" cy="124" rx="9.5" ry="5.5" fill="#ff7f8f" opacity=".38"/>
        <ellipse cx="136" cy="124" rx="9.5" ry="5.5" fill="#ff7f8f" opacity=".38"/>
        <path class="burun" d="M97 115 Q100 118 103 115" stroke="${ton(g.ten, -22)}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path class="agiz-kapali" d="M89 129 Q100 139 111 129" stroke="#5a2a2a" stroke-width="3.6" fill="none" stroke-linecap="round"/>
        <g class="agiz-acik">
          <ellipse cx="100" cy="132" rx="10" ry="8" fill="#4e1b22"/>
          <ellipse cx="100" cy="137" rx="6" ry="3" fill="#ff7b8a"/>
          <rect x="93" y="124.5" width="14" height="3.5" rx="1.5" fill="#fff"/>
        </g>
        ${aksesuar(g)}
      </g>
    </g>
  </svg>`;
}
