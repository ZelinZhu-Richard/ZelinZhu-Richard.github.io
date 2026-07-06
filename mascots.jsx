// mascots.jsx — Original SVG mascot characters for ODDHAUS

const BlobMascot = ({ size = 120, mood = 'happy', color = '#C74141' }) => (
  <svg viewBox="0 0 130 130" width={size} height={size} aria-hidden="true" style={{overflow:'visible'}}>
    {/* Body */}
    <path d="M65,10 C90,6 114,28 116,56 C118,84 100,110 72,116 C44,122 16,106 11,78 C6,50 22,18 48,12 C53,10 59,9 65,10 Z" fill={color} />
    {/* Underbelly */}
    <path d="M65,10 C90,6 114,28 116,56 C118,84 100,110 72,116" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="4" strokeLinecap="round"/>
    {/* Eyes */}
    <circle cx="48" cy="60" r="10" fill="white"/>
    <circle cx="78" cy="57" r="10" fill="white"/>
    {/* Pupils */}
    <circle cx="50" cy="62" r="5" fill="#1A1511"/>
    <circle cx="80" cy="59" r="5" fill="#1A1511"/>
    {/* Shine */}
    <circle cx="52" cy="60" r="1.8" fill="white"/>
    <circle cx="82" cy="57" r="1.8" fill="white"/>
    {/* Mouth */}
    {mood === 'happy' && <path d="M50,80 Q63,92 76,80" stroke="#1A1511" strokeWidth="3" fill="none" strokeLinecap="round"/>}
    {mood === 'surprised' && <ellipse cx="63" cy="85" rx="7" ry="7" fill="#1A1511"/>}
    {mood === 'thinking' && <path d="M52,82 Q63,79 74,82" stroke="#1A1511" strokeWidth="3" fill="none" strokeLinecap="round"/>}
    {/* Blush */}
    <circle cx="36" cy="74" r="7" fill="rgba(230,100,80,.22)"/>
    <circle cx="90" cy="71" r="7" fill="rgba(230,100,80,.22)"/>
    {/* Arms */}
    <path d="M11,78 C2,74 -4,60 6,54" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"/>
    <path d="M116,56 C124,50 128,36 120,30" stroke={color} strokeWidth="10" fill="none" strokeLinecap="round"/>
  </svg>
);

const CoffeeMascot = ({ size = 100 }) => (
  <svg viewBox="0 0 100 115" width={size} height={size*1.15} aria-hidden="true">
    {/* Saucer */}
    <ellipse cx="50" cy="103" rx="42" ry="9" fill="#C8B898"/>
    <ellipse cx="50" cy="100" rx="42" ry="7" fill="#D4C4A0"/>
    {/* Cup */}
    <path d="M16,58 L20,94 Q50,102 80,94 L84,58 Z" fill="#FAF6EF" stroke="#1A1511" strokeWidth="2.2"/>
    {/* Rim */}
    <ellipse cx="50" cy="58" rx="34" ry="8" fill="#E9E0D2" stroke="#1A1511" strokeWidth="2.2"/>
    {/* Coffee */}
    <ellipse cx="50" cy="58" rx="29" ry="6" fill="#6B3E26"/>
    {/* Handle */}
    <path d="M84,68 C100,68 100,88 84,88" stroke="#1A1511" strokeWidth="5" fill="none" strokeLinecap="round"/>
    {/* Face */}
    <circle cx="40" cy="76" r="4.5" fill="#1A1511"/>
    <circle cx="60" cy="76" r="4.5" fill="#1A1511"/>
    <circle cx="41.5" cy="74.5" r="1.6" fill="white"/>
    <circle cx="61.5" cy="74.5" r="1.6" fill="white"/>
    <path d="M42,86 Q50,93 58,86" stroke="#1A1511" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    {/* Blush */}
    <circle cx="30" cy="82" r="5" fill="rgba(200,64,64,.2)"/>
    <circle cx="70" cy="82" r="5" fill="rgba(200,64,64,.2)"/>
    {/* Steam */}
    <path d="M36,46 C34,40 38,33 36,26" stroke="rgba(26,21,17,.25)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <path d="M50,44 C48,38 52,31 50,24" stroke="rgba(26,21,17,.25)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <path d="M64,46 C62,40 66,33 64,26" stroke="rgba(26,21,17,.25)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    {/* Red stripe */}
    <path d="M16,72 L84,72" stroke="#C74141" strokeWidth="2" strokeDasharray="4,4"/>
  </svg>
);

const FishMascot = ({ size = 120, color = '#486A88' }) => (
  <svg viewBox="0 0 150 100" width={size} height={size*0.67} aria-hidden="true">
    {/* Tail */}
    <path d="M110,50 L138,22 L144,50 L138,78 Z" fill={color}/>
    {/* Body */}
    <ellipse cx="66" cy="50" rx="60" ry="35" fill={color}/>
    {/* Belly */}
    <ellipse cx="60" cy="58" rx="42" ry="20" fill="rgba(255,255,255,.18)"/>
    {/* Fin */}
    <path d="M60,18 C54,7 76,2 80,18" fill={color} stroke="rgba(0,0,0,.1)" strokeWidth="1"/>
    {/* Eye */}
    <circle cx="28" cy="44" r="14" fill="white"/>
    <circle cx="30" cy="46" r="8" fill="#1A1511"/>
    <circle cx="33" cy="43" r="3" fill="white"/>
    {/* Glasses frame */}
    <circle cx="28" cy="44" r="14.5" fill="none" stroke="#1A1511" strokeWidth="2.8"/>
    <line x1="13" y1="44" x2="2" y2="42" stroke="#1A1511" strokeWidth="2.8" strokeLinecap="round"/>
    {/* Mouth */}
    <path d="M6,56 C10,51 16,50 12,60 C10,63 4,63 6,56 Z" fill="#1A1511"/>
    {/* Scales */}
    <path d="M68,22 Q77,31 68,40 Q59,31 68,22 Z" fill="rgba(255,255,255,.16)"/>
    <path d="M84,28 Q93,37 84,46 Q75,37 84,28 Z" fill="rgba(255,255,255,.12)"/>
    <path d="M90,46 Q99,55 90,64 Q81,55 90,46 Z" fill="rgba(255,255,255,.12)"/>
    {/* Bubbles */}
    <circle cx="8" cy="38" r="4" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.5"/>
    <circle cx="16" cy="28" r="2.5" fill="none" stroke="rgba(255,255,255,.4)" strokeWidth="1.5"/>
  </svg>
);

const BrowserMascot = ({ size = 110 }) => (
  <svg viewBox="0 0 120 108" width={size} height={size*0.9} aria-hidden="true">
    {/* Frame */}
    <rect x="4" y="4" width="112" height="100" rx="14" fill="#FAF6EF" stroke="#1A1511" strokeWidth="2.5"/>
    {/* Top bar */}
    <rect x="4" y="4" width="112" height="30" rx="14" fill="#1A1511"/>
    <rect x="4" y="20" width="112" height="14" fill="#1A1511"/>
    {/* Buttons */}
    <circle cx="24" cy="20" r="5.5" fill="#C74141"/>
    <circle cx="40" cy="20" r="5.5" fill="#D3A73F"/>
    <circle cx="56" cy="20" r="5.5" fill="#5B7A58"/>
    {/* URL bar */}
    <rect x="66" y="13" width="42" height="14" rx="5" fill="rgba(255,255,255,.14)"/>
    {/* Face */}
    <circle cx="42" cy="70" r="7" fill="#1A1511"/>
    <circle cx="78" cy="70" r="7" fill="#1A1511"/>
    <circle cx="44" cy="68" r="2.4" fill="white"/>
    <circle cx="80" cy="68" r="2.4" fill="white"/>
    <path d="M42,85 Q60,96 78,85" stroke="#1A1511" strokeWidth="3" fill="none" strokeLinecap="round"/>
    {/* Arms */}
    <path d="M4,72 C-6,70 -8,58 0,55" stroke="#1A1511" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
    <path d="M116,72 C126,70 128,58 120,55" stroke="#1A1511" strokeWidth="4.5" fill="none" strokeLinecap="round"/>
    {/* Blush */}
    <circle cx="28" cy="78" r="7" fill="rgba(199,65,65,.2)"/>
    <circle cx="92" cy="78" r="7" fill="rgba(199,65,65,.2)"/>
  </svg>
);

const PencilMascot = ({ size = 100 }) => (
  <svg viewBox="0 0 60 140" width={size*0.43} height={size} aria-hidden="true">
    {/* Body */}
    <rect x="16" y="10" width="28" height="96" rx="6" fill="#D3A73F"/>
    {/* Eraser top */}
    <rect x="16" y="10" width="28" height="18" rx="5" fill="#C74141"/>
    {/* Metal band */}
    <rect x="16" y="26" width="28" height="7" fill="#9A9088"/>
    {/* Grain lines */}
    <line x1="16" y1="50" x2="44" y2="50" stroke="rgba(0,0,0,.1)" strokeWidth="1"/>
    <line x1="16" y1="62" x2="44" y2="62" stroke="rgba(0,0,0,.08)" strokeWidth="1"/>
    <line x1="16" y1="74" x2="44" y2="74" stroke="rgba(0,0,0,.08)" strokeWidth="1"/>
    {/* Tip */}
    <path d="M16,106 L30,132 L44,106 Z" fill="#FAF6EF" stroke="#1A1511" strokeWidth="1.2"/>
    <path d="M20,106 L30,126 L40,106 Z" fill="#C8B898"/>
    <circle cx="30" cy="118" r="2.2" fill="#1A1511"/>
    {/* Face */}
    <circle cx="25" cy="68" r="4" fill="#1A1511"/>
    <circle cx="35" cy="68" r="4" fill="#1A1511"/>
    <circle cx="26.2" cy="66.8" r="1.4" fill="white"/>
    <circle cx="36.2" cy="66.8" r="1.4" fill="white"/>
    <path d="M25,78 Q30,83 35,78" stroke="#1A1511" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
    {/* Arms */}
    <path d="M16,78 C7,78 4,69 10,65" stroke="#D3A73F" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
    <path d="M44,78 C53,78 56,69 50,65" stroke="#D3A73F" strokeWidth="5.5" fill="none" strokeLinecap="round"/>
  </svg>
);

const SkullMascot = ({ size = 90 }) => (
  <svg viewBox="0 0 100 115" width={size} height={size*1.15} aria-hidden="true">
    {/* Head */}
    <ellipse cx="50" cy="48" rx="42" ry="44" fill="#1A1511"/>
    {/* Highlight */}
    <ellipse cx="36" cy="28" rx="12" ry="10" fill="rgba(255,255,255,.06)" transform="rotate(-20,36,28)"/>
    {/* Eye sockets */}
    <ellipse cx="32" cy="44" rx="13" ry="15" fill="white"/>
    <ellipse cx="68" cy="44" rx="13" ry="15" fill="white"/>
    {/* Irises */}
    <circle cx="32" cy="46" r="7" fill="#C74141"/>
    <circle cx="68" cy="46" r="7" fill="#C74141"/>
    {/* Pupils */}
    <circle cx="32" cy="46" r="3.5" fill="#1A1511"/>
    <circle cx="68" cy="46" r="3.5" fill="#1A1511"/>
    <circle cx="33.5" cy="44.5" r="1.4" fill="white"/>
    <circle cx="69.5" cy="44.5" r="1.4" fill="white"/>
    {/* Nose */}
    <path d="M46,60 L50,68 L54,60 Z" fill="rgba(255,255,255,.25)"/>
    {/* Jaw */}
    <path d="M18,74 Q50,90 82,74 L78,105 Q50,112 22,105 Z" fill="#1A1511"/>
    {/* Teeth */}
    <rect x="30" y="77" width="11" height="16" rx="3" fill="white"/>
    <rect x="45" y="77" width="11" height="16" rx="3" fill="white"/>
    <rect x="60" y="77" width="10" height="14" rx="3" fill="white"/>
    {/* Decoration */}
    <text x="84" y="20" fontSize="16" fill="#C74141">✦</text>
  </svg>
);

const EyeMascot = ({ size = 70 }) => (
  <svg viewBox="0 0 90 90" width={size} height={size} aria-hidden="true">
    {/* Outer shape */}
    <path d="M4,45 Q45,4 86,45 Q45,86 4,45 Z" fill="#C74141"/>
    {/* White */}
    <ellipse cx="45" cy="45" rx="24" ry="24" fill="white"/>
    {/* Iris */}
    <circle cx="45" cy="45" r="17" fill="#486A88"/>
    {/* Pupil */}
    <circle cx="45" cy="45" r="10" fill="#1A1511"/>
    {/* Shine */}
    <circle cx="50" cy="40" r="4.5" fill="white"/>
    <circle cx="42" cy="50" r="2.2" fill="white"/>
    {/* Lashes */}
    <line x1="4" y1="45" x2="-4" y2="40" stroke="#1A1511" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="4" y1="45" x2="-4" y2="50" stroke="#1A1511" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="86" y1="45" x2="94" y2="40" stroke="#1A1511" strokeWidth="2.2" strokeLinecap="round"/>
    <line x1="86" y1="45" x2="94" y2="50" stroke="#1A1511" strokeWidth="2.2" strokeLinecap="round"/>
  </svg>
);

const StickerStar = ({ size = 52, color = '#D3A73F' }) => (
  <svg viewBox="0 0 52 52" width={size} height={size} aria-hidden="true">
    <path d="M26,2 L31,19 L49,19 L35,30 L40,47 L26,36 L12,47 L17,30 L3,19 L21,19 Z" fill={color}/>
  </svg>
);

const StickerBlob = ({ size = 52, color = '#C8B898' }) => (
  <svg viewBox="0 0 60 60" width={size} height={size} aria-hidden="true">
    <path d="M30,4 C46,3 58,14 57,30 C56,46 45,58 29,57 C13,56 2,44 3,30 C4,15 14,5 30,4 Z" fill={color}/>
    <circle cx="22" cy="27" r="3.5" fill="#1A1511"/>
    <circle cx="38" cy="27" r="3.5" fill="#1A1511"/>
    <path d="M20,37 Q30,45 40,37" stroke="#1A1511" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
  </svg>
);

const RotatingBadge = ({ size = 92 }) => (
  <svg viewBox="0 0 92 92" width={size} height={size} aria-hidden="true">
    <defs>
      <path id="rp" d="M46,46 m-32,0 a32,32 0 1,1 64,0 a32,32 0 1,1 -64,0"/>
    </defs>
    <circle cx="46" cy="46" r="44" fill="#C74141"/>
    <circle cx="46" cy="46" r="33" fill="#C74141" stroke="rgba(255,255,255,.28)" strokeWidth="1" strokeDasharray="3,4"/>
    <text fontSize="7.5" fontFamily="'Syne',sans-serif" fontWeight="700" letterSpacing="3.5" fill="white">
      <textPath href="#rp" startOffset="0%">ODDHAUS ✦ EST. 2025 ✦ ODDHAUS ✦</textPath>
    </text>
    <text x="46" y="50" textAnchor="middle" fontSize="22" fill="white">✦</text>
  </svg>
);

Object.assign(window, {
  BlobMascot, CoffeeMascot, FishMascot, BrowserMascot,
  PencilMascot, SkullMascot, EyeMascot,
  StickerStar, StickerBlob, RotatingBadge,
});
