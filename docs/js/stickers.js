// Kitty theme stickers: small original drawings scattered behind the content,
// plus a kitten peeking over the "Today" card. Only rendered when the Kitty theme is on.
'use strict';

const KITTY_INK = '#5c2342';
const FUR = { white: '#fff8fb', pink: '#ffd9e8', lilac: '#ebe3f7', peach: '#ffe2cc' };

/** Draw a path twice: a thick white sticker border behind, then the coloured shape. */
function stickerShape(d, fill, extra = '') {
  return `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="12" stroke-linejoin="round"/>
    <path d="${d}" fill="${fill}" stroke="${KITTY_INK}" stroke-width="3.5" stroke-linejoin="round" ${extra}/>`;
}

const HEAD = 'M20 50 L26 14 L50 33 Q60 30 70 33 L94 14 L100 50 Q106 64 100 78 Q90 102 60 102 Q30 102 20 78 Q14 64 20 50Z';
function kittyFace(fur, { eyes = 'happy' } = {}) {
  const eyeShapes = eyes === 'happy'
    ? `<path d="M38 64 q6 -8 12 0 M70 64 q6 -8 12 0" fill="none" stroke="${KITTY_INK}" stroke-width="3.5" stroke-linecap="round"/>`
    : eyes === 'sleepy'
      ? `<path d="M38 62 q6 6 12 0 M70 62 q6 6 12 0" fill="none" stroke="${KITTY_INK}" stroke-width="3.5" stroke-linecap="round"/>`
      : `<circle cx="44" cy="62" r="6" fill="${KITTY_INK}"/><circle cx="76" cy="62" r="6" fill="${KITTY_INK}"/>
         <circle cx="46" cy="60" r="2" fill="#fff"/><circle cx="78" cy="60" r="2" fill="#fff"/>`;
  return `${stickerShape(HEAD, fur)}
    <path d="M30 25 L34 42 L45 35Z M90 25 L86 42 L75 35Z" fill="#ffb3d0"/>
    ${eyeShapes}
    <ellipse cx="35" cy="76" rx="7" ry="4.5" fill="#ff9cc4" opacity=".75"/><ellipse cx="85" cy="76" rx="7" ry="4.5" fill="#ff9cc4" opacity=".75"/>
    <path d="M56.5 70 h7 l-3.5 4z" fill="#ff7aa8" stroke="#ff7aa8" stroke-width="2" stroke-linejoin="round"/>
    <path d="M52 77 q4 5 8 0 q4 5 8 0" fill="none" stroke="${KITTY_INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M10 70 l15 2 M11 80 l14 -3 M110 70 l-15 2 M109 80 l-14 -3" stroke="${KITTY_INK}" stroke-width="2.2" stroke-linecap="round"/>`;
}

const STICKERS = {
  face: { box: '0 0 120 112', svg: kittyFace(FUR.white) },
  facePink: { box: '0 0 120 112', svg: kittyFace(FUR.pink, { eyes: 'open' }) },
  sitting: {
    box: '0 0 130 160',
    svg: `<path d="M96 140 Q124 140 120 110 Q118 98 108 103" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round"/>
      <path d="M96 140 Q124 140 120 110 Q118 98 108 103" fill="none" stroke="${KITTY_INK}" stroke-width="15" stroke-linecap="round"/>
      <path d="M96 140 Q124 140 120 110 Q118 98 108 103" fill="none" stroke="${FUR.lilac}" stroke-width="9" stroke-linecap="round"/>
      ${stickerShape('M36 84 Q24 118 30 146 Q62 156 94 146 Q100 118 88 84Z', FUR.lilac)}
      <ellipse cx="50" cy="148" rx="10" ry="6" fill="${FUR.lilac}" stroke="${KITTY_INK}" stroke-width="3"/>
      <ellipse cx="76" cy="148" rx="10" ry="6" fill="${FUR.lilac}" stroke="${KITTY_INK}" stroke-width="3"/>
      <path d="M50 108 q12 8 26 0" fill="none" stroke="#ffb3d0" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(4 0) scale(1)">${kittyFace(FUR.lilac, { eyes: 'open' })}</g>`,
  },
  sleepy: {
    box: '0 0 160 110',
    svg: `${stickerShape('M40 100 Q30 100 30 84 Q32 52 70 50 L120 50 Q152 52 152 80 Q152 100 128 100Z', FUR.peach)}
      <path d="M124 100 Q154 102 150 82" fill="none" stroke="${KITTY_INK}" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M96 64 q10 6 20 0 M104 78 q10 6 20 0" fill="none" stroke="#f3b98f" stroke-width="4" stroke-linecap="round"/>
      <g transform="translate(0 16) scale(.76)">${kittyFace(FUR.peach, { eyes: 'sleepy' })}</g>
      <text x="88" y="28" font-family="system-ui, sans-serif" font-weight="800" font-size="20" fill="#e0558f" stroke="#fff" stroke-width="5" paint-order="stroke">z</text>
      <text x="106" y="16" font-family="system-ui, sans-serif" font-weight="800" font-size="14" fill="#e0558f" stroke="#fff" stroke-width="4" paint-order="stroke">z</text>`,
  },
  lifter: {
    box: '0 0 130 150',
    svg: `<g transform="translate(5 0)">${kittyFace(FUR.white, { eyes: 'open' })}</g>
      <rect x="14" y="116" width="102" height="10" rx="5" fill="#fff" stroke="#fff" stroke-width="10"/>
      <rect x="14" y="116" width="102" height="10" rx="5" fill="#b8b3c4" stroke="${KITTY_INK}" stroke-width="3"/>
      ${stickerShape('M4 104 h18 v34 h-18z', '#e0558f')}${stickerShape('M108 104 h18 v34 h-18z', '#e0558f')}
      <ellipse cx="44" cy="120" rx="11" ry="9" fill="${FUR.white}" stroke="${KITTY_INK}" stroke-width="3"/>
      <ellipse cx="86" cy="120" rx="11" ry="9" fill="${FUR.white}" stroke="${KITTY_INK}" stroke-width="3"/>`,
  },
  paw: {
    box: '0 0 100 100',
    svg: `${stickerShape('M50 88 Q28 88 26 70 Q26 54 50 50 Q74 54 74 70 Q72 88 50 88Z', '#ff9cc4')}
      ${stickerShape('M22 46 a9 11 -15 1 0 0.1 0Z', '#ff9cc4')}${stickerShape('M40 32 a9 11 -5 1 0 0.1 0Z', '#ff9cc4')}
      ${stickerShape('M60 32 a9 11 5 1 0 0.1 0Z', '#ff9cc4')}${stickerShape('M78 46 a9 11 15 1 0 0.1 0Z', '#ff9cc4')}`,
  },
  heart: {
    box: '0 0 100 92',
    svg: stickerShape('M50 84 Q14 60 10 36 Q8 14 30 12 Q44 12 50 26 Q56 12 70 12 Q92 14 90 36 Q86 60 50 84Z', '#ffb3d0'),
  },
  sparkle: {
    box: '0 0 80 80',
    svg: stickerShape('M40 6 Q44 32 74 40 Q44 48 40 74 Q36 48 6 40 Q36 32 40 6Z', '#fff2a8'),
  },
};

/** Where stickers sit on wide screens: [sticker, left %, top %, size px, rotation]. */
const STICKER_LAYOUT = [
  ['face', 88, 12, 74, -10], ['paw', 24, 32, 46, 18], ['sleepy', 72, 46, 120, 4],
  ['heart', 52, 8, 40, 12], ['lifter', 6, 70, 92, -6], ['sparkle', 94, 60, 38, 0],
  ['sitting', 90, 82, 92, 6], ['facePink', 40, 88, 66, 10], ['paw', 64, 70, 40, -24],
  ['sparkle', 30, 54, 30, 0], ['heart', 16, 6, 34, -14], ['paw', 96, 30, 36, 30],
];
/** On phones there is no spare margin, so the stickers hug the screen edges, half tucked away,
    and stay clear of the top bar and headings. */
const STICKER_LAYOUT_PHONE = [
  ['face', 102, 26, 62, -14], ['paw', -1, 40, 40, 22], ['sleepy', 104, 55, 92, 6],
  ['lifter', -3, 69, 74, -8], ['heart', 101, 82, 34, 14], ['sparkle', 1, 55, 26, 0], ['facePink', -2, 93, 54, 12],
];

function stickerSVG(name, cls = '') {
  const s = STICKERS[name];
  return `<svg class="sticker ${cls}" viewBox="${s.box}" aria-hidden="true">${s.svg}</svg>`;
}

/** Fill the fixed background layer when the Kitty theme is on; empty it otherwise. */
function renderStickers() {
  const layer = $('#stickers');
  if (!layer) return;
  if (state.settings.palette !== 'kitty') { layer.innerHTML = ''; return; }
  const spots = (layout, cls) => layout.map(([name, left, top, size, rot]) =>
    `<span class="sticker-spot ${cls}" style="left:${left}%;top:${top}%;width:${size}px;transform:translate(-50%,-50%) rotate(${rot}deg)">${stickerSVG(name)}</span>`).join('');
  layer.innerHTML = spots(STICKER_LAYOUT, 'wide-only') + spots(STICKER_LAYOUT_PHONE, 'phone-only');
}

/** A kitten peeking over the top edge of the Today card. */
const PEEK_SVG = `<svg class="peek-kitty" viewBox="0 0 120 62" aria-hidden="true">
  <path d="M18 62 L20 30 L26 6 L48 24 Q60 21 72 24 L94 6 L100 30 L102 62Z" fill="#fff" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>
  <path d="M18 62 L20 30 L26 6 L48 24 Q60 21 72 24 L94 6 L100 30 L102 62" fill="${FUR.white}" stroke="${KITTY_INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M30 16 L33 30 L43 24Z M90 16 L87 30 L77 24Z" fill="#ffb3d0"/>
  <circle cx="45" cy="44" r="6" fill="${KITTY_INK}"/><circle cx="75" cy="44" r="6" fill="${KITTY_INK}"/>
  <circle cx="47" cy="42" r="2" fill="#fff"/><circle cx="77" cy="42" r="2" fill="#fff"/>
  <ellipse cx="34" cy="54" rx="6" ry="4" fill="#ff9cc4" opacity=".75"/><ellipse cx="86" cy="54" rx="6" ry="4" fill="#ff9cc4" opacity=".75"/>
  <path d="M57 50 h6 l-3 3.5z" fill="#ff7aa8"/>
  <ellipse cx="30" cy="62" rx="12" ry="8" fill="${FUR.white}" stroke="${KITTY_INK}" stroke-width="3"/>
  <ellipse cx="90" cy="62" rx="12" ry="8" fill="${FUR.white}" stroke="${KITTY_INK}" stroke-width="3"/>
  <path d="M26 58 v6 M34 58 v6 M86 58 v6 M94 58 v6" stroke="${KITTY_INK}" stroke-width="2" stroke-linecap="round"/></svg>`;
const peekKitty = () => (state.settings.palette === 'kitty' ? PEEK_SVG : '');
