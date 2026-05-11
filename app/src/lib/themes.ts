import type { Theme, ThemeConfig, ThemeFamily, SlideStyleOverrides } from './types';

// Font stacks. The bare-string font names ("Instrument Serif" etc.) match
// the Google Font names that next/font/google injects via the <html> className
// stack — so writing them in inline styles inside renderSlide.ts will resolve
// to the loaded subset.
const POPPINS_STACK = "'Poppins','Noto Sans SC',sans-serif";
const INSTRUMENT_SERIF_STACK = "'Instrument Serif','Poppins','Noto Sans SC',serif";
const FAMILJEN_GROTESK_STACK = "'Familjen Grotesk','Poppins','Noto Sans SC',sans-serif";
const FRAUNCES_STACK = "'Fraunces','Poppins','Noto Sans SC',serif";
const PLUS_JAKARTA_STACK = "'Plus Jakarta Sans','Poppins','Noto Sans SC',sans-serif";
const BRICOLAGE_GROTESQUE_STACK = "'Bricolage Grotesque','Poppins','Noto Sans SC',sans-serif";
const LORA_STACK = "'Lora','Poppins','Noto Sans SC',serif";

// Analyst-scene stacks (loaded in app/layout.tsx). Each analyst colorway picks
// its own display / body / numeric trio so the three "firms" read differently.
const INTER_STACK = "'Inter','Poppins','Noto Sans SC',sans-serif";
const SOURCE_SERIF_STACK = "'Source Serif 4','Poppins','Noto Serif SC',serif";
const IBM_PLEX_SANS_STACK = "'IBM Plex Sans','Poppins','Noto Sans SC',sans-serif";
const IBM_PLEX_MONO_STACK = "'IBM Plex Mono','SFMono-Regular',Menlo,monospace";
const CORMORANT_STACK = "'Cormorant Garamond','Poppins','Noto Serif SC',serif";
const WORK_SANS_STACK = "'Work Sans','Poppins','Noto Sans SC',sans-serif";
const LIBRE_CASLON_STACK = "'Libre Caslon Text','Poppins','Noto Serif SC',serif";

// ============================================================================
// 底纹 (Texture) variants — per-theme catalog
// ============================================================================
// 每个主题有多个 variant, 用户通过 Toolbar 的底纹下拉菜单挑选。每个 variant 都要
// 足够"若隐若现" (alpha < 0.06), 只是给纯色背景加一点 material feel, 类似
// Claude client dark mode 的那种 grid pattern.
//
// themes.ts 的 `bg` 字段引用 CSS var `var(--lasca-texture-{theme}-url)`,
// 默认值在 globals.css 里写死, Editor.tsx 根据 deck.textureVariant override.
// 这样 themes.ts 本身是 static, variant switching 不需要重新渲染整个 slide.
// ----------------------------------------------------------------------------

// URL-encode SVG markup: angle brackets + double quotes + hashes need escaping
// so inline SVG data URLs are safe inside style="..." HTML attributes.
function encSvg(svg: string): string {
  return svg.replace(/"/g, '%22').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/#/g, '%23');
}

function svgUrl(svg: string): string {
  return `url('data:image/svg+xml;utf8,${encSvg(svg)}')`;
}

export interface TextureVariant {
  id: string;
  label: { zh: string; en: string };
  url: string;         // CSS url('data:...') string, ready to plug into background-image
}

// --- Grid variants (Claude-style dot grid, default for all 3 themes) ------
// 2x2 dots at regular intervals, very subtle. Color tuned per theme.
// The tile is 24×24px so dots sit every 24px — far enough to read as
// "texture" not "pattern".

function gridDotVariant(alphaColor: string, label: { zh: string; en: string }): TextureVariant {
  return {
    id: 'grid',
    label,
    url: svgUrl(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1.1" fill="${alphaColor}"/></svg>`
    ),
  };
}

// --- Warm variants ---

const WARM_GRID = gridDotVariant('rgba(140,105,70,0.18)', { zh: '网点', en: 'Dot Grid' });

const WARM_CONTOUR: TextureVariant = {
  id: 'contour',
  label: { zh: '等高线', en: 'Contour' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><g fill="none" stroke="rgba(130,95,60,0.07)" stroke-width="0.7" stroke-linecap="round"><path d="M-20 60 Q80 30 180 55 T380 50 T580 65"/><path d="M-20 95 Q100 70 200 90 T400 85 T580 100"/><path d="M-20 130 Q90 110 180 125 T380 120 T580 135"/><path d="M-20 165 Q110 145 210 160 T410 155 T580 170"/><path d="M-20 200 Q80 185 180 195 T380 190 T580 205"/><path d="M-20 235 Q100 220 200 230 T400 225 T580 240"/><path d="M-20 270 Q90 255 180 265 T380 260 T580 275"/></g><g fill="rgba(130,95,60,0.06)"><circle cx="65" cy="45" r="0.7"/><circle cx="220" cy="78" r="0.6"/><circle cx="355" cy="52" r="0.8"/><circle cx="140" cy="155" r="0.5"/><circle cx="300" cy="182" r="0.7"/><circle cx="80" cy="245" r="0.7"/><circle cx="395" cy="255" r="0.6"/></g></svg>`
  ),
};

const WARM_WEAVE: TextureVariant = {
  id: 'weave',
  label: { zh: '织纹', en: 'Weave' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" stroke="rgba(140,105,70,0.09)" stroke-width="0.6"><path d="M0 8 L16 8"/><path d="M8 0 L8 16"/><path d="M0 0 L16 16"/></g></svg>`
  ),
};

// --- Cool variants ---

const COOL_GRID = gridDotVariant('rgba(40,80,130,0.20)', { zh: '网点', en: 'Dot Grid' });

const COOL_DIAGONAL: TextureVariant = {
  id: 'diagonal',
  label: { zh: '斜纹', en: 'Diagonal' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path d="M-2 10 L 16 -8 M-2 14 L 16 -4 M-2 18 L 16 0" stroke="rgba(40,80,130,0.10)" stroke-width="0.6" fill="none"/></svg>`
  ),
};

const COOL_CROSS: TextureVariant = {
  id: 'cross',
  label: { zh: '十字', en: 'Cross' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g stroke="rgba(40,80,130,0.12)" stroke-width="0.6" stroke-linecap="round" fill="none"><path d="M16 13 L 16 19"/><path d="M13 16 L 19 16"/></g></svg>`
  ),
};

// --- Dark variants ---

const DARK_GRID = gridDotVariant('rgba(255,245,220,0.11)', { zh: '网点', en: 'Dot Grid' });

const DARK_CONSTELLATION: TextureVariant = {
  id: 'constellation',
  label: { zh: '星座', en: 'Constellation' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="540" viewBox="0 0 800 540"><g stroke="rgba(255,245,220,0.085)" stroke-width="0.5" fill="none" stroke-linecap="round"><path d="M60 70 L 105 55 L 155 85 L 140 135"/><path d="M105 55 L 130 25"/><path d="M340 65 L 395 90 L 445 55 L 500 95"/><path d="M445 55 L 455 15"/><path d="M620 95 L 680 65 L 735 110 L 770 155"/><path d="M680 65 L 720 35"/><path d="M110 280 L 175 295 L 220 340 L 195 400"/><path d="M175 295 L 235 260"/><path d="M430 310 L 490 285 L 555 325 L 580 385 L 520 420"/><path d="M490 285 L 540 250"/><path d="M130 470 L 190 455 L 235 495"/><path d="M625 435 L 690 455 L 735 490"/></g><g fill="rgba(255,245,220,0.35)"><circle cx="60" cy="70" r="0.9"/><circle cx="105" cy="55" r="1.1"/><circle cx="155" cy="85" r="0.8"/><circle cx="140" cy="135" r="0.9"/><circle cx="130" cy="25" r="0.7"/><circle cx="340" cy="65" r="1"/><circle cx="395" cy="90" r="0.7"/><circle cx="445" cy="55" r="1.1"/><circle cx="500" cy="95" r="0.8"/><circle cx="455" cy="15" r="0.6"/><circle cx="620" cy="95" r="0.9"/><circle cx="680" cy="65" r="1.1"/><circle cx="735" cy="110" r="0.7"/><circle cx="770" cy="155" r="0.8"/><circle cx="720" cy="35" r="0.7"/><circle cx="110" cy="280" r="0.8"/><circle cx="175" cy="295" r="1.1"/><circle cx="220" cy="340" r="0.7"/><circle cx="195" cy="400" r="0.9"/><circle cx="235" cy="260" r="0.6"/><circle cx="430" cy="310" r="1"/><circle cx="490" cy="285" r="1.2"/><circle cx="555" cy="325" r="0.7"/><circle cx="580" cy="385" r="0.8"/><circle cx="520" cy="420" r="0.9"/><circle cx="540" cy="250" r="0.5"/><circle cx="130" cy="470" r="0.8"/><circle cx="190" cy="455" r="1"/><circle cx="235" cy="495" r="0.6"/><circle cx="625" cy="435" r="0.8"/><circle cx="690" cy="455" r="1.1"/><circle cx="735" cy="490" r="0.7"/></g></svg>`
  ),
};

const DARK_MESH: TextureVariant = {
  id: 'mesh',
  label: { zh: '石壁', en: 'Stone' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><g fill="none" stroke="rgba(255,245,220,0.07)" stroke-width="0.5"><path d="M0 20 L40 20"/><path d="M20 0 L20 40"/><path d="M0 0 L40 40"/><path d="M40 0 L0 40"/></g></svg>`
  ),
};

// --- Premium theme textures (unique per theme for visual identity) ---

// 冰锋 — ultra-fine horizontal graph lines, like precision instruments
const STRIPE_GRAPH: TextureVariant = {
  id: 'graph',
  label: { zh: '刻度', en: 'Scale Marks' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g stroke="rgba(10,37,64,0.04)" fill="none" stroke-width="0.5"><path d="M0 24 L48 24"/><path d="M24 0 L24 48"/></g><circle cx="24" cy="24" r="0.5" fill="rgba(83,58,253,0.06)"/></svg>`
  ),
};

// 黑曜 — hexagonal micro-grid, tech precision in obsidian
const LINEAR_HEX: TextureVariant = {
  id: 'hex',
  label: { zh: '六角', en: 'Hexagon' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="48" viewBox="0 0 28 48"><g stroke="rgba(94,106,210,0.06)" fill="none" stroke-width="0.4"><path d="M14 0 L28 8 L28 24 L14 32 L0 24 L0 8 Z"/><path d="M14 16 L28 24 L28 40 L14 48 L0 40 L0 24 Z"/></g></svg>`
  ),
};

// 和紙 — paper fiber noise, organic randomness like handmade paper
const NOTION_FIBER: TextureVariant = {
  id: 'fiber',
  label: { zh: '纸纹', en: 'Paper' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><g fill="rgba(55,53,47,0.025)" stroke="none"><circle cx="23" cy="17" r="0.4"/><circle cx="67" cy="43" r="0.3"/><circle cx="112" cy="8" r="0.5"/><circle cx="156" cy="31" r="0.3"/><circle cx="45" cy="72" r="0.4"/><circle cx="89" cy="95" r="0.5"/><circle cx="134" cy="67" r="0.3"/><circle cx="178" cy="88" r="0.4"/><circle cx="12" cy="123" r="0.3"/><circle cx="56" cy="148" r="0.5"/><circle cx="98" cy="134" r="0.3"/><circle cx="145" cy="156" r="0.4"/><circle cx="189" cy="142" r="0.3"/><circle cx="34" cy="178" r="0.4"/><circle cx="78" cy="191" r="0.3"/><circle cx="123" cy="183" r="0.5"/><circle cx="167" cy="172" r="0.3"/></g><g stroke="rgba(55,53,47,0.015)" fill="none" stroke-width="0.3"><path d="M15 50 Q45 48 75 52"/><path d="M90 110 Q120 107 150 112"/><path d="M30 160 Q60 158 90 162"/></g></svg>`
  ),
};

// 碑文 — no texture (pure flat surfaces — the absence IS the identity)
// Uses a 1×1 transparent SVG so the texture system doesn't break
const VERCEL_NONE: TextureVariant = {
  id: 'none',
  label: { zh: '无', en: 'None' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"/>`
  ),
};

// 极光 — subtle circular bokeh dots, out-of-focus light in darkness
const SPOTIFY_BOKEH: TextureVariant = {
  id: 'bokeh',
  label: { zh: '光斑', en: 'Bokeh' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><g fill="none"><circle cx="45" cy="67" r="18" stroke="rgba(29,185,84,0.03)" stroke-width="0.5"/><circle cx="198" cy="34" r="12" stroke="rgba(29,185,84,0.025)" stroke-width="0.4"/><circle cx="267" cy="145" r="22" stroke="rgba(29,185,84,0.02)" stroke-width="0.5"/><circle cx="89" cy="234" r="15" stroke="rgba(29,185,84,0.03)" stroke-width="0.4"/><circle cx="178" cy="189" r="10" stroke="rgba(29,185,84,0.025)" stroke-width="0.3"/><circle cx="134" cy="123" r="8" stroke="rgba(30,215,96,0.02)" stroke-width="0.3"/></g></svg>`
  ),
};

// 窑变 — organic contour lines in coral tint, like glaze flow on pottery
const AIRBNB_GLAZE: TextureVariant = {
  id: 'glaze',
  label: { zh: '釉纹', en: 'Glaze' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320"><g fill="none" stroke="rgba(255,90,95,0.04)" stroke-width="0.6" stroke-linecap="round"><path d="M-20 55 Q90 35 190 60 T390 50 T580 70"/><path d="M-20 120 Q80 100 200 125 T400 115 T580 130"/><path d="M-20 190 Q100 170 210 195 T410 185 T580 200"/><path d="M-20 260 Q90 240 180 265 T380 255 T580 270"/></g><g fill="rgba(0,166,153,0.03)"><circle cx="120" cy="88" r="0.6"/><circle cx="310" cy="155" r="0.5"/><circle cx="75" cy="230" r="0.7"/><circle cx="400" cy="88" r="0.5"/></g></svg>`
  ),
};

// 墨金 — vertical pinstripe, like luxury suit fabric
const FERRARI_PINSTRIPE: TextureVariant = {
  id: 'pinstripe',
  label: { zh: '条纹', en: 'Pinstripe' },
  url: svgUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><path d="M10 0 L10 20" stroke="rgba(240,236,228,0.025)" stroke-width="0.4" fill="none"/></svg>`
  ),
};

// --- Original variants (neutral gray, theme-agnostic) ---

const ORIGINAL_GRID = gridDotVariant('rgba(120,120,120,0.12)', { zh: '网点', en: 'Dot Grid' });

/** Public catalog: per-theme list of available texture variants.
 *  The FIRST entry of each list is the default (used when deck.textureVariant
 *  doesn't specify a variant for that theme). */
export const TEXTURE_VARIANTS: Record<Theme, readonly TextureVariant[]> = {
  warm:     [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  cool:     [COOL_GRID, COOL_DIAGONAL, COOL_CROSS],
  dark:     [DARK_GRID, DARK_CONSTELLATION, DARK_MESH],
  original: [ORIGINAL_GRID],
  // Shared catalog: one entry per unique id (no duplicate 'grid' / 'grid' / 'grid')
  // WARM_GRID is the representative dot grid (neutral enough for any theme).
  // Premium themes: own texture first (default), then rest of shared catalog.
  stripe:   [STRIPE_GRAPH,      WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, LINEAR_HEX, NOTION_FIBER, SPOTIFY_BOKEH, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  linear:   [LINEAR_HEX,        WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, NOTION_FIBER, SPOTIFY_BOKEH, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  notion:   [NOTION_FIBER,      WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, SPOTIFY_BOKEH, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  vercel:   [VERCEL_NONE,       WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, NOTION_FIBER, SPOTIFY_BOKEH, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  apple:    [WARM_GRID,         WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, NOTION_FIBER, SPOTIFY_BOKEH, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  spotify:  [SPOTIFY_BOKEH,     WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, NOTION_FIBER, AIRBNB_GLAZE, FERRARI_PINSTRIPE],
  airbnb:   [AIRBNB_GLAZE,     WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, NOTION_FIBER, SPOTIFY_BOKEH, FERRARI_PINSTRIPE],
  ferrari:  [FERRARI_PINSTRIPE, WARM_GRID, WARM_CONTOUR, WARM_WEAVE, COOL_DIAGONAL, COOL_CROSS, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH, LINEAR_HEX, NOTION_FIBER, SPOTIFY_BOKEH, AIRBNB_GLAZE],
  // Scene × Colorway: Analyst — reuse Linear's hex grid (same grid-dot-matrix motif family)
  'analyst-light': [LINEAR_HEX, WARM_GRID, COOL_DIAGONAL, STRIPE_GRAPH, NOTION_FIBER],
  'analyst-mist':  [LINEAR_HEX, COOL_DIAGONAL, WARM_GRID, STRIPE_GRAPH, NOTION_FIBER],
  'analyst-dark':  [LINEAR_HEX, DARK_CONSTELLATION, DARK_MESH, STRIPE_GRAPH],
  // Analysis report — warm paper grid first (matches skill's paper feel)
  'analysis-paper': [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  'analysis-memo':  [WARM_GRID, COOL_DIAGONAL, WARM_CONTOUR],
  'analysis-field': [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  // Lookbook — minimal decoration, but still need a fallback texture catalog
  // for the editor's texture picker. Reuse the warm paper textures.
  'lookbook-ember':  [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  'lookbook-forest': [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  'lookbook-ink':    [WARM_GRID, WARM_CONTOUR, COOL_DIAGONAL],
  // Private-banking — minimal decoration too
  'private-banking-sovereign': [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
  'private-banking-noir':      [WARM_GRID, WARM_CONTOUR, COOL_DIAGONAL],
  'private-banking-clay':      [WARM_GRID, WARM_CONTOUR, WARM_WEAVE],
};

/** Look up a variant by theme + id (fall back to first if id missing). */
export function getTextureVariant(theme: Theme, id: string | undefined): TextureVariant | undefined {
  const list = TEXTURE_VARIANTS[theme];
  if (!list || list.length === 0) return undefined;
  if (!id) return list[0];
  return list.find(v => v.id === id) ?? list[0];
}

// ============================================================================
// 氛围 (Ambience) variants — per-theme catalog of ANIMATED effects
// ============================================================================
// 每个主题 3 个可选效果。跟底纹一样，用户通过 Toolbar 下拉菜单挑选。
// 实际的 @keyframes + CSS 规则在 globals.css 里，由
// `data-lasca-ambient-{theme}="{id}"` 属性选择器 gate。
// Editor.tsx 根据 deck.ambientVariant 把 data 属性 set 到 <html> 上。
// 第一个 variant 是默认。
// ----------------------------------------------------------------------------

export interface AmbientVariant {
  id: string;
  label: { zh: string; en: string };
  desc: { zh: string; en: string };
}

/** 岩壁 warm */
const WARM_PULSE: AmbientVariant = { id: 'pulse', label: { zh: '脉动', en: 'Pulse' }, desc: { zh: '整体明度 ±8% 缓呼吸 (6s)', en: 'Global brightness ±8% slow breath (6s)' } };
const WARM_GLOW:  AmbientVariant = { id: 'glow',  label: { zh: '暖晕', en: 'Warm Glow' }, desc: { zh: '中心暖橙柔光缓脉动 (5s)', en: 'Center warm-orange soft glow pulse (5s)' } };
const WARM_DRIFT: AmbientVariant = { id: 'drift', label: { zh: '沙纹', en: 'Sand Ripple' }, desc: { zh: '底纹极缓漂移，如风过沙面 (25s)', en: 'Ultra-slow texture drift, like wind over sand (25s)' } };

/** 冰川 cool */
const COOL_PULSE:   AmbientVariant = { id: 'pulse',   label: { zh: '脉动', en: 'Pulse' }, desc: { zh: '卡片 hairline + 整体明度微动 (4s)', en: 'Card hairline + global brightness micro-shift (4s)' } };
const COOL_SHIMMER: AmbientVariant = { id: 'shimmer', label: { zh: '微光', en: 'Shimmer' }, desc: { zh: '极淡冷白折光斜向扫过 (15s)', en: 'Ultra-faint cool-white refraction sweep (15s)' } };
const COOL_FROST:   AmbientVariant = { id: 'frost',   label: { zh: '结霜', en: 'Frost' }, desc: { zh: '底纹缓慢漂移 + 明度微冻 (30s)', en: 'Slow texture drift + brightness micro-freeze (30s)' } };

/** 洞穴 dark */
const DARK_CAMPFIRE: AmbientVariant = { id: 'campfire', label: { zh: '篝火', en: 'Campfire' }, desc: { zh: 'brightness/saturate 不规则跳动 (5s)', en: 'Irregular brightness/saturate flicker (5s)' } };
const DARK_STARRY:   AmbientVariant = { id: 'starry',   label: { zh: '星空', en: 'Starry' }, desc: { zh: '星座层闪烁 + 极缓漂移 (7s)', en: 'Constellation twinkle + ultra-slow drift (7s)' } };
const DARK_CANDLE:   AmbientVariant = { id: 'candle',   label: { zh: '烛光', en: 'Candlelight' }, desc: { zh: '暖橙中心柔光慢脉动 (6s)', en: 'Warm-orange center soft glow slow pulse (6s)' } };

/** 原样 original — neutral, theme-agnostic */
const ORIGINAL_PULSE: AmbientVariant = { id: 'pulse', label: { zh: '脉动', en: 'Pulse' }, desc: { zh: '整体明度 ±5% 缓呼吸 (6s)', en: 'Global brightness ±5% slow breath (6s)' } };

export const AMBIENT_VARIANTS: Record<Theme, readonly AmbientVariant[]> = {
  warm:     [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
  cool:     [COOL_PULSE, COOL_SHIMMER, COOL_FROST],
  dark:     [DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  original: [ORIGINAL_PULSE],
  // Shared ambient catalog: one per unique id (no duplicate 'pulse' entries).
  // 8 unique effects: pulse, glow, drift, shimmer, frost, campfire, starry, candle.
  stripe:   [COOL_SHIMMER,  WARM_PULSE, WARM_GLOW, WARM_DRIFT, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  linear:   [DARK_STARRY,   WARM_PULSE, WARM_GLOW, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_CANDLE],
  notion:   [WARM_DRIFT,    WARM_PULSE, WARM_GLOW, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  vercel:   [WARM_PULSE,    WARM_GLOW, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  apple:    [WARM_PULSE,    WARM_GLOW, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  spotify:  [DARK_CAMPFIRE, WARM_PULSE, WARM_GLOW, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_STARRY, DARK_CANDLE],
  airbnb:   [WARM_GLOW,    WARM_PULSE, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY, DARK_CANDLE],
  ferrari:  [DARK_CANDLE,  WARM_PULSE, WARM_GLOW, WARM_DRIFT, COOL_SHIMMER, COOL_FROST, DARK_CAMPFIRE, DARK_STARRY],
  // Scene × Colorway: Analyst
  'analyst-light': [COOL_SHIMMER,  WARM_PULSE, COOL_FROST, WARM_GLOW],
  'analyst-mist':  [COOL_SHIMMER,  COOL_FROST, WARM_PULSE, WARM_GLOW],
  'analyst-dark':  [DARK_STARRY,   DARK_CAMPFIRE, COOL_SHIMMER, WARM_PULSE],
  // Analysis report — paper feel, gentle breath only
  'analysis-paper': [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
  'analysis-memo':  [COOL_SHIMMER, WARM_PULSE, COOL_FROST],
  'analysis-field': [WARM_PULSE, WARM_DRIFT, COOL_SHIMMER],
  // Lookbook — calm warm pulse, no drama
  'lookbook-ember':  [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
  'lookbook-forest': [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
  'lookbook-ink':    [WARM_PULSE, COOL_SHIMMER, WARM_GLOW],
  // Private-banking — gentle, ceremonial
  'private-banking-sovereign': [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
  'private-banking-noir':      [WARM_PULSE, COOL_SHIMMER, WARM_GLOW],
  'private-banking-clay':      [WARM_PULSE, WARM_GLOW, WARM_DRIFT],
};

export function getAmbientVariant(theme: Theme, id: string | undefined): AmbientVariant | undefined {
  const list = AMBIENT_VARIANTS[theme];
  if (!list || list.length === 0) return undefined;
  if (!id) return list[0];
  return list.find(v => v.id === id) ?? list[0];
}

// ============================================================================
// Scene × Colorway derivation engine (v2)
// ============================================================================
// Each scene defines shared typographic + motif identity. Color palettes are
// separate objects. `deriveTheme()` merges them into a full ThemeConfig.
// This avoids duplicating 40+ fields across 3 colorways of the same scene.
// ============================================================================

interface SceneBase {
  /** Family that all themes built from this base belong to. Forwarded into
   *  `ThemeConfig.family` so the composer can read it directly. */
  family?: ThemeFamily;
  fontHeadline: string;
  fontBody: string;
  headlineWeight: number;
  headlineTracking: string;
  headlineFeatures?: string;
  headlineStyle?: 'normal' | 'italic';
  headlineVariationSettings?: string;
  opticalSizing?: 'auto' | 'none';
  /** Layered-font extensions (2026-04-16). Optional — analyst scenes use
   *  these; other scenes keep the 2-layer headline/body pair. */
  fontDisplay?: string;
  fontLabel?: string;
  fontNumeric?: string;
  numericFeatures?: string;
  labelTracking?: string;
  labelTransform?: 'uppercase' | 'none';
  motif: { id: string };
  captionStyle: ThemeConfig['captionStyle'];
  decoration: ThemeConfig['decoration'];
  radiusCard: number;
  radiusBar: number;
  /** Optional advanced card surface (hairline + glow combos). When omitted,
   *  deriveTheme() uses the palette's cardShadow only. */
  cardSurfaceTemplate?: (p: ScenePalette) => string;
}

interface ScenePalette {
  bg: string;           // solid color only (texture CSS var prefix added by deriveTheme)
  text: string;
  primary: string;
  accent: string;
  muted: string;
  green: string;
  dark: string;
  border: string;
  cardBg: string;
  cardShadow: string;
  // v2 scene design dimensions (per-colorway, because investment-bank's data-viz
  // palette differs from consulting-firm's). All optional — omitting them falls
  // back to generic theme-color-based defaults downstream.
  paletteWeight?: ThemeConfig['paletteWeight'];
  dataViz?: ThemeConfig['dataViz'];
  table?: ThemeConfig['table'];
  imageTreatment?: ThemeConfig['imageTreatment'];
  rules?: ThemeConfig['rules'];
}

function deriveTheme(
  themeId: Theme,
  base: SceneBase,
  palette: ScenePalette,
): ThemeConfig {
  return {
    ...(base.family ? { family: base.family } : {}),
    primary:    palette.primary,
    accent:     palette.accent,
    bg:         `var(--lasca-texture-${themeId}-url) repeat, ${palette.bg}`,
    text:       palette.text,
    muted:      palette.muted,
    green:      palette.green,
    dark:       palette.dark,
    border:     palette.border,
    cardBg:     palette.cardBg,
    cardShadow: palette.cardShadow,
    ...(base.cardSurfaceTemplate ? { cardSurface: base.cardSurfaceTemplate(palette) } : {}),
    fontHeadline:              base.fontHeadline,
    fontBody:                  base.fontBody,
    headlineWeight:            base.headlineWeight,
    headlineTracking:          base.headlineTracking,
    ...(base.headlineFeatures          ? { headlineFeatures: base.headlineFeatures } : {}),
    ...(base.headlineStyle             ? { headlineStyle: base.headlineStyle } : {}),
    ...(base.headlineVariationSettings ? { headlineVariationSettings: base.headlineVariationSettings } : {}),
    ...(base.opticalSizing             ? { opticalSizing: base.opticalSizing } : {}),
    ...(base.fontDisplay               ? { fontDisplay: base.fontDisplay } : {}),
    ...(base.fontLabel                 ? { fontLabel: base.fontLabel } : {}),
    ...(base.fontNumeric               ? { fontNumeric: base.fontNumeric } : {}),
    ...(base.numericFeatures           ? { numericFeatures: base.numericFeatures } : {}),
    ...(base.labelTracking             ? { labelTracking: base.labelTracking } : {}),
    ...(base.labelTransform            ? { labelTransform: base.labelTransform } : {}),
    radiusCard: base.radiusCard,
    radiusBar:  base.radiusBar,
    cardChrome: 'subtle',
    motif:      base.motif,
    captionStyle: base.captionStyle,
    decoration: base.decoration,
    // v2 scene design dimensions — spread only when the palette provides them.
    // Omitting keeps ThemeConfig lean for non-scene themes.
    ...(palette.paletteWeight   ? { paletteWeight:   palette.paletteWeight   } : {}),
    ...(palette.dataViz         ? { dataViz:         palette.dataViz         } : {}),
    ...(palette.table           ? { table:           palette.table           } : {}),
    ...(palette.imageTreatment  ? { imageTreatment:  palette.imageTreatment  } : {}),
    ...(palette.rules           ? { rules:           palette.rules           } : {}),
  };
}

// --- Analyst scene bases ------------------------------------------------
// Three institutional archetypes. Non-font fields are shared; typography
// differs per colorway so three institutional registers read distinctly at a
// glance. All fonts are Google Fonts — NO proprietary faces to avoid
// licensing and brand-impersonation risk.

// Shared non-font chrome across all three analyst colorways.
const ANALYST_SHARED = {
  headlineWeight: 400,
  headlineTracking: '-0.005em',
  motif: { id: 'precision-rule' as const },
  captionStyle: { textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontSize: '0.62rem', fontWeight: 600 },
  decoration: { slide: 'motif-default' as const, report: 'motif-default' as const },
  radiusCard: 4,
  radiusBar: 2,
  cardSurfaceTemplate: (p: ScenePalette) =>
    `0 0 0 1px ${p.border}, 0 1px 4px rgba(0,0,0,0.05)`,
};

// analyst-light — investment-bank-esque: Fraunces display + Inter body + Fraunces numerics.
// 2020s investment-banking register: variable serif authority + neutral geometric sans.
const ANALYST_LIGHT_BASE: SceneBase = {
  ...ANALYST_SHARED,
  fontDisplay:  FRAUNCES_STACK,
  fontHeadline: FRAUNCES_STACK,
  fontBody:     INTER_STACK,
  fontLabel:    INTER_STACK,
  fontNumeric:  FRAUNCES_STACK,
  headlineFeatures: "'tnum'",
  numericFeatures: "'tnum', 'lnum'",
  labelTracking: '0.08em',
  labelTransform: 'uppercase',
  opticalSizing: 'auto',
};

// analyst-mist — consulting-firm-esque: Source Serif 4 display + IBM Plex Sans body +
// IBM Plex Mono numerics. Consulting deck DNA: newsprint serif titles, data sans,
// monospaced figures for reports and tables.
const ANALYST_MIST_BASE: SceneBase = {
  ...ANALYST_SHARED,
  fontDisplay:  SOURCE_SERIF_STACK,
  fontHeadline: SOURCE_SERIF_STACK,
  fontBody:     IBM_PLEX_SANS_STACK,
  fontLabel:    IBM_PLEX_SANS_STACK,
  fontNumeric:  IBM_PLEX_MONO_STACK,
  headlineFeatures: "'tnum'",
  numericFeatures: "'tnum', 'lnum'",
  labelTracking: '0.1em',
  labelTransform: 'uppercase',
};

// analyst-dark — PE-esque: Cormorant Garamond display + Work Sans body +
// Libre Caslon numerics. PE pitch-book old-money register: garalde serif elegance
// + humanist sans + old-style lining numerals.
const ANALYST_DARK_BASE: SceneBase = {
  ...ANALYST_SHARED,
  fontDisplay:  CORMORANT_STACK,
  fontHeadline: CORMORANT_STACK,
  fontBody:     WORK_SANS_STACK,
  fontLabel:    WORK_SANS_STACK,
  fontNumeric:  LIBRE_CASLON_STACK,
  headlineWeight: 500,                      // Cormorant runs a little lighter; bump for balance
  headlineFeatures: "'tnum'",
  numericFeatures: "'tnum', 'lnum'",
  labelTracking: '0.12em',
  labelTransform: 'uppercase',
};

// Palettes: each colorway is tuned to a recognisable institutional research
// register. Don't blend them toward a single "Lasca palette" — the value is
// that each colorway reads distinctly at a glance.

// → ANALYST LIGHT — investment-bank register (deep navy + accent blue on white)
//   Deep Navy #00355F, Accent Blue #6B96C3, Dark Gray #231F20
const ANALYST_LIGHT: ScenePalette = {
  bg:         '#ffffff',
  text:       '#231F20',                    // Dark gray
  primary:    '#00355F',                    // Deep navy (primary)
  accent:     '#6B96C3',                    // Accent blue (secondary)
  muted:      '#58575A',                    // Mid gray
  green:      '#2f7a4a',
  dark:       '#231F20',
  border:     '#cdd9e3',
  cardBg:     '#f7f9fb',
  cardShadow: 'rgba(0,0,0,0.05) 0px 1px 4px',
  // v2 dimensions — institutional pitch-book conventions
  paletteWeight:  { primary: 60, accent: 25, muted: 15 },
  dataViz: {
    // Curated ordinal palette: navy-blue shades + muted greys for series that
    // read as "institutional report" rather than rainbow-dashboard.
    paletteOrdinal: ['#00355F', '#6B96C3', '#8CA9C4', '#A8BED5', '#58575A', '#9B9A9D'],
    gridOpacity: 0.12,
    axisColor: '#58575A',
    barCornerRadius: 0,                     // razor-sharp, Swiss-modernist
  },
  table: {
    headerBg: '#eaf1f7',                    // pale accent-blue tint (IB convention)
    headerText: '#00355F',
    rowStripeBg: 'rgba(107,150,195,0.06)',  // subtle accent-blue zebra
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
  imageTreatment: {
    filter: 'none',                         // GS keeps images raw, conservative
  },
  rules: {
    must: [
      'Include a "Source:" footnote on every data slide.',
      'One concept per slide — no more than 3 supporting points.',
      'Tables: hairline borders, right-aligned numbers, pale-blue header.',
      'Reserve accent GS-Blue for highlight/emphasis, never body.',
    ],
    avoid: [
      'Decorative quotes or pullquotes (IB decks do not use these).',
      'Full-bleed imagery in pitch pages.',
      'Rainbow chart palettes — use restrained navy-blue family.',
    ],
  },
};

// → ANALYST MIST — consulting-firm register (vivid blue + grayscale)
//   Deep Blue #051C2C, Vivid Blue #2251FF ("50 shades of blue" core pair)
const ANALYST_MIST: ScenePalette = {
  bg:         '#f0f2f6',
  text:       '#051C2C',                    // consulting-firm Deep Blue (body ink)
  primary:    '#051C2C',                    // consulting-firm Deep Blue (signature)
  accent:     '#2251FF',                    // consulting-firm Vivid Blue (electric accent)
  muted:      '#5e6f80',
  green:      '#2f7a4a',
  dark:       '#051C2C',
  border:     '#c8d0dc',
  cardBg:     '#ffffff',
  cardShadow: 'rgba(0,0,0,0.04) 0px 1px 4px',
  // v2 dimensions — consulting-firm "50 shades of blue" system + consulting rigor
  paletteWeight:  { primary: 55, accent: 30, muted: 15 },
  dataViz: {
    // consulting-firm's signature gradient from Deep Blue to Vivid Blue with
    // cool-blue tints between — matches their "scales of blue" identity.
    paletteOrdinal: ['#051C2C', '#2251FF', '#4A7FB5', '#7FA8D1', '#B4CCE2', '#5e6f80'],
    gridOpacity: 0.1,
    axisColor: '#5e6f80',
    barCornerRadius: 2,                     // softer than investment-bank, still tight
  },
  table: {
    headerBg: '#051C2C',                    // deep blue header (inverse — white text)
    headerText: '#ffffff',
    rowStripeBg: 'rgba(34,81,255,0.04)',    // faint vivid-blue zebra
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
  imageTreatment: {
    // canonical consulting signature: grayscale + subtle cool tint on editorial imagery
    filter: 'grayscale(0.85) contrast(1.05) brightness(1.02)',
    overlayGradient: 'linear-gradient(135deg, rgba(5,28,44,0.08) 0%, rgba(34,81,255,0.06) 100%)',
  },
  rules: {
    must: [
      'Write action titles (S-V-O with a number or verdict, not topic labels).',
      'Use vivid-blue as the scarce accent — one emphasis per slide maximum.',
      'Apply the Pyramid Principle: executive summary up top, proof below.',
      'Every data point must have a source attribution.',
    ],
    avoid: [
      'Topic-title headlines like "Market Overview" — use a conclusion instead.',
      'Overloaded slides — MECE structure, one frame per page.',
      'Warm accent colors — the palette is cool-blue only.',
    ],
  },
};

// → ANALYST DARK — private-equity register (deep ink + restrained chrome)
//   Pure black + white, Chronicle serif family, no secondary palette.
//   Warm cream text on near-black bg — restraint is the brand.
const ANALYST_DARK: ScenePalette = {
  bg:         '#0a0a0a',                    // near-pure black (PE-style signature)
  text:       '#e8e0d0',                    // warm cream parchment
  primary:    '#e8e0d0',                    // monochromatic — wordmark in cream
  accent:     '#a89372',                    // aged brass (subtle ceremonial touch)
  muted:      '#7a7a7a',                    // neutral gray
  green:      '#4ead6a',
  dark:       '#e8e0d0',
  border:     '#222222',                    // hairline on black
  cardBg:     '#141414',                    // slightly lifted black for cards
  cardShadow: '0 1px 4px rgba(0,0,0,0.3)',
  // v2 dimensions — private-equity restraint: monochromatic + ceremonial
  paletteWeight:  { primary: 70, accent: 10, muted: 20 }, // dominance is extreme
  dataViz: {
    // Monochromatic cream gradient with aged-brass highlight — series differ
    // by value/opacity, not by hue. Pure gravitas, no "consumer dashboard" feel.
    paletteOrdinal: ['#e8e0d0', '#c9bfaa', '#a89372', '#8a7d63', '#6a6155', '#4a4440'],
    gridOpacity: 0.08,
    axisColor: '#7a7a7a',
    barCornerRadius: 0,                     // squared, serif book feel
  },
  table: {
    headerBg: 'transparent',                // no header fill — hairline only
    headerText: '#e8e0d0',
    rowStripeBg: '',                        // no zebra — pure typography reads
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
  imageTreatment: {
    filter: 'grayscale(1) contrast(1.1)',   // all imagery desaturated (private-equity style)
    overlayGradient: 'linear-gradient(180deg, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.5) 100%)',
  },
  rules: {
    must: [
      'Use generous negative space — the page should feel spacious.',
      'Headlines set in serif italic, one dominant statement per page.',
      'Metrics in tabular numerals, understated — no decorative flourishes.',
    ],
    avoid: [
      'Vivid colors — the palette is black + warm cream + aged brass only.',
      'Heavy card chrome — card surfaces should be nearly invisible.',
      'Multi-color charts — use monochromatic value gradients only.',
    ],
  },
};

// --- Analysis-report scene (v2.4, report-only) ------------------------------
// Three distinct institutional typefaces + distinct page chrome. Rooted in the
// bilingual-report-template pdf skill (paper/ink palette, hairline-only rules)
// but each colorway carries its OWN font pairing + motif so the reader can
// tell them apart at a glance — not just by accent color.
//   · paper (editorial warm)   : Lora + Plus Jakarta, single top hairline
//   · memo  (institutional blue): Source Serif 4 + IBM Plex Sans, double rule
//   · noir  (luxury cherry B/W) : Cormorant + Libre Caslon, corner ticks
const ANALYSIS_SHARED_RULES = {
  radiusCard: 4,
  radiusBar: 2,
  headlineWeight: 500,
  headlineTracking: '-0.005em',
  headlineFeatures: "'tnum'",
  numericFeatures: "'tnum', 'lnum'",
  labelTracking: '0.12em',
  labelTransform: 'uppercase' as const,
  decoration: { slide: 'minimal' as const, report: 'motif-default' as const },
  cardSurfaceTemplate: (p: ScenePalette) =>
    `0 0 0 1px ${p.border}, 0 1px 3px rgba(0,0,0,0.04)`,
};

const ANALYSIS_PAPER_BASE: SceneBase = {
  ...ANALYSIS_SHARED_RULES,
  fontDisplay:  LORA_STACK,
  fontHeadline: LORA_STACK,
  fontBody:     PLUS_JAKARTA_STACK,
  fontLabel:    PLUS_JAKARTA_STACK,
  fontNumeric:  LORA_STACK,
  motif: { id: 'analysis-editorial' as const },
  captionStyle: { textTransform: 'uppercase' as const, letterSpacing: '0.16em', fontSize: '0.62rem', fontWeight: 500 },
};

const ANALYSIS_MEMO_BASE: SceneBase = {
  ...ANALYSIS_SHARED_RULES,
  fontDisplay:  SOURCE_SERIF_STACK,
  fontHeadline: SOURCE_SERIF_STACK,
  fontBody:     IBM_PLEX_SANS_STACK,
  fontLabel:    IBM_PLEX_SANS_STACK,
  fontNumeric:  IBM_PLEX_MONO_STACK,
  motif: { id: 'analysis-memo' as const },
  captionStyle: { textTransform: 'uppercase' as const, letterSpacing: '0.20em', fontSize: '0.60rem', fontWeight: 600 },
};

const ANALYSIS_NOIR_BASE: SceneBase = {
  ...ANALYSIS_SHARED_RULES,
  fontDisplay:  CORMORANT_STACK,
  fontHeadline: CORMORANT_STACK,
  fontBody:     LIBRE_CASLON_STACK,
  fontLabel:    INTER_STACK,
  fontNumeric:  CORMORANT_STACK,
  motif: { id: 'analysis-noir' as const },
  captionStyle: { textTransform: 'uppercase' as const, letterSpacing: '0.26em', fontSize: '0.58rem', fontWeight: 500 },
};

// Shared neutrals per skill. Only `primary` / `accent` / tint colors change.
const ANALYSIS_NEUTRALS = {
  bg:         '#faf9f5',
  text:       '#141413',
  muted:      '#6b6a65',
  green:      '#788c5d',
  dark:       '#141413',
  border:     '#e8e6dc',
  cardBg:     '#ffffff',
  cardShadow: 'rgba(0,0,0,0.04) 0px 1px 3px',
};

const ANALYSIS_PAPER: ScenePalette = {
  ...ANALYSIS_NEUTRALS,
  // Clay-light paper — the shell "warm" theme's bg (#faf9f5) lightened one
  // notch. Design intent: Premium papers should read as Clay/Glacier off-
  // whites, not warm creams or canary yellows. Terracotta accent carries
  // all the warmth; paper stays quietly neutral.
  bg:      '#fcfbf8',
  border:  '#ecebe4',
  primary: '#d97757',  // skill's default orange
  accent:  '#8b6f4e',
  paletteWeight: { primary: 55, accent: 20, muted: 25 },
  dataViz: {
    paletteOrdinal: ['#d97757', '#8b6f4e', '#a89372', '#6b6a65', '#b0aea5', '#e8a87c'],
    gridOpacity: 0.1,
    axisColor: '#6b6a65',
    barCornerRadius: 0,
  },
  table: {
    headerBg: '#f5efe8',
    headerText: '#141413',
    rowStripeBg: '',
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
  rules: {
    must: [
      'Rules only at top/bottom hairlines and table grids. No left rule, no corner marks.',
      'Every data claim ends with a source footnote.',
      'Tables: hairline borders, right-aligned numbers, subtle header tint.',
    ],
    avoid: ['Decorative lines under subheads.', 'Full-bleed imagery.', 'Multi-color ordinal charts.'],
  },
};

const ANALYSIS_MEMO: ScenePalette = {
  ...ANALYSIS_NEUTRALS,
  // Glacier-light paper — the shell "cool" theme's bg (#f8f9fc) lightened
  // one notch. Design intent: Memo uses Glacier's cool off-white to match
  // the navy primary. Earlier warm-cream and canary-yellow tries were all
  // rejected; cool white is the correct frame for navy.
  bg:      '#fafbfe',
  border:  '#e4e6ec',
  primary: '#243957',  // deeper memo navy — more serious than before
  accent:  '#6a89b4',
  paletteWeight: { primary: 55, accent: 20, muted: 25 },
  dataViz: {
    paletteOrdinal: ['#243957', '#6a89b4', '#8ea9c9', '#b2c4d9', '#6b6a65', '#b0aea5'],
    gridOpacity: 0.08,
    axisColor: '#6b6a65',
    barCornerRadius: 0,
  },
  table: {
    headerBg: '#e8eef6',
    headerText: '#243957',
    rowStripeBg: '',
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
};

// Noir (replaces the previous green "field" palette): high-end, almost entirely
// black-and-white — cherry red appears ONLY on section numbers, the folio, the
// cover accent stroke, and inline callout ticks. Everywhere else is ink + paper.
const ANALYSIS_NOIR: ScenePalette = {
  ...ANALYSIS_NEUTRALS,
  // Noir-neutral — a hair less yellow than Paper's Clay-light. Shifts the
  // paper toward a cool-editorial register (Parisian magazine / Ralph Lauren
  // catalog) so the cherry primary reads 高贵冷艳 rather than rustic. The
  // delta from Paper is intentionally tiny: 1 point in green, 2 in blue.
  bg:      '#fcfcfa',
  border:  '#ebebe7',
  muted:   '#5c5a54',  // slightly deeper muted for editorial restraint
  primary: '#a3251f',  // 樱桃红 — deep, restrained cherry (Ferrari red muted)
  accent:  '#6b1a15',  // wine-cherry for secondary emphasis
  paletteWeight: { primary: 45, accent: 15, muted: 40 },
  dataViz: {
    paletteOrdinal: ['#a3251f', '#141413', '#5c5a54', '#b0aea5', '#dcd6c9', '#6b1a15'],
    gridOpacity: 0.08,
    axisColor: '#5c5a54',
    barCornerRadius: 0,
  },
  table: {
    headerBg: '#f2ede1',
    headerText: '#141413',
    rowStripeBg: '',
    borderStyle: 'hairline',
    rightAlignNumbers: true,
  },
  rules: {
    must: [
      'Cherry red is scarce — only section numbers, folio, short accent stroke. Everything else is ink + paper.',
      'Body is serif on serif: Cormorant Garamond display + Libre Caslon Text body.',
      'Four corner tick marks at the page edges; no continuous border.',
    ],
    avoid: ['Red backgrounds, red rules beyond ~40px, red body copy.'],
  },
};

// --- Lookbook scene (Phase B start, slide-only) -----------------------------
// Slide-channel "lookbook" family — modeled on the Georgetown / company-brief
// genre: cream paper, large numerals, minimal decoration, Poppins throughout.
// Decoration is intentionally `minimal` on both surfaces: identity reads from
// palette + numerals + cover variant, not from background motifs.
const LOOKBOOK_EMBER_BASE: SceneBase = {
  family: 'lookbook',
  fontDisplay:    POPPINS_STACK,
  fontHeadline:   POPPINS_STACK,
  fontBody:       POPPINS_STACK,
  fontLabel:      POPPINS_STACK,
  fontNumeric:    POPPINS_STACK,
  headlineWeight: 600,
  headlineTracking: '-0.02em',
  labelTracking:  '0.18em',
  labelTransform: 'uppercase',
  motif:          { id: 'lookbook-chrome' },
  captionStyle:   { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.62rem', fontWeight: 600 },
  decoration:     { slide: 'minimal', report: 'minimal' },
  radiusCard:     8,
  radiusBar:      4,
};

const LOOKBOOK_EMBER: ScenePalette = {
  bg:         '#faf9f5',         // cream — same off-white as warm/Clay
  text:       '#141413',         // ink
  primary:    '#d97757',         // coral — the only chromatic mass
  accent:     '#141413',         // ink as accent: structural contrast, not decoration
  muted:      '#7d7b75',
  green:      '#788c5d',
  dark:       '#141413',
  border:     '#e6e3da',
  cardBg:     '#ffffff',
  cardShadow: '0 1px 3px rgba(0,0,0,0.04)',
  dataViz: {
    paletteOrdinal: ['#d97757', '#e8a78d', '#a8553f', '#141413', '#7d7b75'],
  },
};

// Lookbook · Forest — Bricolage display + Plus Jakarta body. Forest green
// hero color with mint as the chromatic accent; paper-white background.
const LOOKBOOK_FOREST_BASE: SceneBase = {
  family: 'lookbook',
  fontDisplay:    BRICOLAGE_GROTESQUE_STACK,
  fontHeadline:   BRICOLAGE_GROTESQUE_STACK,
  fontBody:       PLUS_JAKARTA_STACK,
  fontLabel:      PLUS_JAKARTA_STACK,
  fontNumeric:    BRICOLAGE_GROTESQUE_STACK,
  headlineWeight: 600,
  headlineTracking: '-0.02em',
  labelTracking:  '0.18em',
  labelTransform: 'uppercase',
  motif:          { id: 'lookbook-chrome' },
  captionStyle:   { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.62rem', fontWeight: 600 },
  decoration:     { slide: 'minimal', report: 'minimal' },
  radiusCard:     8,
  radiusBar:      4,
};

const LOOKBOOK_FOREST: ScenePalette = {
  bg:         '#f5f5f0',         // paper white with a hint of green-grey
  text:       '#141413',
  primary:    '#2c5f2d',         // forest — the dominant chromatic mass
  accent:     '#97bc62',         // mint — secondary highlight
  muted:      '#6b6f60',
  green:      '#2c5f2d',
  dark:       '#141413',
  border:     '#dee0d4',
  cardBg:     '#ffffff',
  cardShadow: '0 1px 3px rgba(0,0,0,0.04)',
  dataViz: {
    paletteOrdinal: ['#2c5f2d', '#97bc62', '#5a8a47', '#c4dfa3', '#6b6f60'],
  },
};

// Lookbook · Ink — Fraunces display + Inter body. Pure ink-on-paper, with
// coral as the only chromatic accent. Reads "editorial monograph" rather
// than "lookbook"; the genre still applies because of layout discipline.
const LOOKBOOK_INK_BASE: SceneBase = {
  family: 'lookbook',
  fontDisplay:    FRAUNCES_STACK,
  fontHeadline:   FRAUNCES_STACK,
  fontBody:       INTER_STACK,
  fontLabel:      INTER_STACK,
  fontNumeric:    FRAUNCES_STACK,
  headlineWeight: 600,
  headlineTracking: '-0.02em',
  headlineVariationSettings: "'opsz' 144, 'SOFT' 50, 'WONK' 0",
  opticalSizing:  'auto',
  labelTracking:  '0.20em',
  labelTransform: 'uppercase',
  motif:          { id: 'lookbook-chrome' },
  captionStyle:   { textTransform: 'uppercase', letterSpacing: '0.20em', fontSize: '0.6rem', fontWeight: 600 },
  decoration:     { slide: 'minimal', report: 'minimal' },
  radiusCard:     6,
  radiusBar:      3,
};

const LOOKBOOK_INK: ScenePalette = {
  bg:         '#ffffff',
  text:       '#141413',
  primary:    '#141413',         // ink as the dominant — title-as-mass aesthetic
  accent:     '#d97757',         // coral as the only chromatic punctuation
  muted:      '#7d7b75',
  green:      '#788c5d',
  dark:       '#141413',
  border:     '#e6e3da',
  cardBg:     '#ffffff',
  cardShadow: '0 1px 2px rgba(0,0,0,0.05)',
  dataViz: {
    paletteOrdinal: ['#141413', '#d97757', '#5c5a54', '#e8a78d', '#a09e96'],
  },
};

// --- Private-banking scene (Phase C, slide-only) ----------------------------
// Three colorways for "advisor-to-client" deliverables: navy/gold (sovereign),
// charcoal/champagne (noir), burgundy/brass (clay). Each carries its own
// font pair (cross-font is structural, not a combo override).
const PB_SHARED_RULES = {
  family:        'private-banking' as ThemeFamily,
  headlineWeight: 500,
  headlineTracking: '-0.005em',
  labelTracking:  '0.18em',
  labelTransform: 'uppercase' as const,
  motif:          { id: 'private-banking-hairline' as const },
  decoration:     { slide: 'minimal' as const, report: 'minimal' as const },
  radiusCard:     2,
  radiusBar:      2,
};

const PB_SOVEREIGN_BASE: SceneBase = {
  ...PB_SHARED_RULES,
  fontDisplay:  CORMORANT_STACK,
  fontHeadline: CORMORANT_STACK,
  fontBody:     PLUS_JAKARTA_STACK,
  fontLabel:    PLUS_JAKARTA_STACK,
  fontNumeric:  CORMORANT_STACK,
  captionStyle: { textTransform: 'uppercase', letterSpacing: '0.20em', fontSize: '0.62rem', fontWeight: 500 },
};

const PB_SOVEREIGN: ScenePalette = {
  bg:         '#f8f6f1',         // cream — paper for client-facing deliverables
  text:       '#141413',
  primary:    '#1a3360',         // deep navy — institutional gravitas
  accent:     '#b08a4f',         // gold — the only chromatic punctuation
  muted:      '#7a7670',
  green:      '#788c5d',
  dark:       '#141413',
  border:     '#e6e1d6',
  cardBg:     '#ffffff',
  cardShadow: '0 1px 2px rgba(20,20,19,0.05)',
  dataViz: {
    paletteOrdinal: ['#1a3360', '#b08a4f', '#3d5984', '#d4b87a', '#7a7670'],
  },
};

const PB_NOIR_BASE: SceneBase = {
  ...PB_SHARED_RULES,
  fontDisplay:  CORMORANT_STACK,
  fontHeadline: CORMORANT_STACK,
  fontBody:     WORK_SANS_STACK,
  fontLabel:    WORK_SANS_STACK,
  fontNumeric:  CORMORANT_STACK,
  captionStyle: { textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: '0.6rem', fontWeight: 500 },
};

const PB_NOIR: ScenePalette = {
  bg:         '#f5f2ea',         // warm stone
  text:       '#0b0b0c',         // charcoal
  primary:    '#0b0b0c',         // charcoal — title-as-mass
  accent:     '#c9a35f',         // champagne — restrained gold
  muted:      '#6d6a64',
  green:      '#788c5d',
  dark:       '#0b0b0c',
  border:     '#e3dfd4',
  cardBg:     '#ffffff',
  cardShadow: '0 1px 2px rgba(11,11,12,0.05)',
  dataViz: {
    paletteOrdinal: ['#0b0b0c', '#c9a35f', '#3a3a3c', '#e3c790', '#6d6a64'],
  },
};

const PB_CLAY_BASE: SceneBase = {
  ...PB_SHARED_RULES,
  fontDisplay:  INSTRUMENT_SERIF_STACK,
  fontHeadline: INSTRUMENT_SERIF_STACK,
  fontBody:     PLUS_JAKARTA_STACK,
  fontLabel:    PLUS_JAKARTA_STACK,
  fontNumeric:  INSTRUMENT_SERIF_STACK,
  captionStyle: { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.62rem', fontWeight: 500 },
};

const PB_CLAY: ScenePalette = {
  bg:         '#ece2d0',         // warm clay paper
  text:       '#141413',
  primary:    '#6d2e46',         // burgundy — old-money depth
  accent:     '#a88856',         // brass — warm metallic
  muted:      '#7a7570',
  green:      '#788c5d',
  dark:       '#141413',
  border:     '#d8cdba',
  cardBg:     '#fbf6ec',
  cardShadow: '0 1px 2px rgba(20,20,19,0.05)',
  dataViz: {
    paletteOrdinal: ['#6d2e46', '#a88856', '#8a4862', '#d4b58a', '#7a7570'],
  },
};

export const THEMES: Record<Theme, ThemeConfig> = {
  // ======================================================================
  // 岩壁 — Anthropic clay/sand. Typography & colors UNCHANGED from V1.
  // Ambient animation comes from globals.css `.lasca-theme-warm` selector.
  // The new optional fields below are filled with "current value equivalents"
  // so the renderSlide.ts `??` fallback chain stays consistent.
  // ======================================================================
  warm: {
    cardChrome: 'subtle',
    primary:    '#d97757',
    accent:     '#6a9bcc',
    // 底纹层通过 CSS var 注入, Editor.tsx 根据 deck.textureVariant 动态 set
    bg:         'var(--lasca-texture-warm-url) repeat, #faf9f5',
    text:       '#141413',
    muted:      '#b0aea5',
    green:      '#788c5d',
    dark:       '#141413',
    border:     '#e8e6dc',
    cardBg:     '#ffffff',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    // typography: Fraunces display (serif) + Plus Jakarta Sans body (sans)
    // Matches designPrinciples.ts warm-modern pair. SOFT=100 gives maximum
    // softness (vs dark theme's SOFT=50 for hand-cut feel).
    fontHeadline: FRAUNCES_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 600,
    headlineTracking: '-0.01em',
    headlineFeatures: "'dlig'",
    headlineVariationSettings: "'WONK' 1, 'SOFT' 100",
    opticalSizing: 'auto',
    radiusCard: 12,
    radiusBar:  8,
    // Signature v2: motif + editorial caption + decoration route
    motif: { id: 'paper-deckle' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: '0.68rem', fontWeight: 700 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
  },

  // ======================================================================
  // 冰川 — Northern Editorial. Instrument Serif italic display + Familjen
  // Grotesk body. Steel blue ink on cool paper, hairline border surfaces.
  // ======================================================================
  cool: {
    cardChrome: 'subtle',
    primary:    '#0f3d7a',                                  // Prussian blue
    accent:     '#c2410c',                                  // oxidized terracotta single accent
    // 底纹层通过 CSS var 注入 (tile repeat), 基础层是冷纸渐变
    bg:         'var(--lasca-texture-cool-url) repeat, linear-gradient(180deg,#eff4f8 0%,#f4f6f9 100%)',
    text:       '#0a1422',                                  // deep ink
    muted:      '#5e6f80',                                  // cool slate
    green:      '#2f7a4a',                                  // crisper sage
    dark:       '#0a1422',
    border:     '#cdd9e3',                                  // cool fog
    cardBg:     '#fcfdfe',                                  // paper, micro-off-white
    cardShadow: 'none',                                     // hairline replaces shadow
    // 1px hairline ring whose alpha is animated by --lasca-fx-breath (see globals.css)
    cardSurface: '0 0 0 1px rgba(205,217,227,var(--lasca-fx-breath,1))',
    fontHeadline:   INSTRUMENT_SERIF_STACK,
    fontBody:       FAMILJEN_GROTESK_STACK,
    headlineWeight: 400,                                    // Instrument Serif's natural weight
    headlineTracking: '-0.005em',
    headlineFeatures: "'tnum'",                             // tabular numbers for data slides
    headlineStyle:    'italic',                             // signature didone italic on cover
    radiusCard: 6,                                          // editorial restraint
    radiusBar:  4,
    motif: { id: 'hairline-frame' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.18em', fontSize: '0.62rem', fontWeight: 500 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
  },

  // ======================================================================
  // 洞穴 — Ancient Manuscript. Fraunces (with wonky) display + body, near-true
  // black radial-gradient bg, warm parchment text, firelight glow on cards.
  // ======================================================================
  dark: {
    cardChrome: 'subtle',
    primary:    '#e89968',                                  // firelight 提亮
    accent:     '#a89372',                                  // aged brass
    // 底纹层通过 CSS var 注入 + 洞穴 radial 火光
    bg:         'var(--lasca-texture-dark-url) repeat, radial-gradient(ellipse 80% 60% at 50% 35%,#14151a 0%,#0a0b0e 75%)',
    text:       '#e8e0d0',                                  // warm parchment
    muted:      '#6a665e',                                  // warm slate
    green:      '#6b8050',
    dark:       '#e8e0d0',
    border:     '#1f1d22',                                  // almost invisible elevation line
    cardBg:     '#15131a',                                  // slightly purple-tinted deep
    cardShadow: '0 1px 4px rgba(0,0,0,0.3)',                // legacy fallback (unused when cardSurface set)
    // 4-layer composite: hairline + drop shadow + warm outer glow + top inset highlight
    // Glow alpha animated by --lasca-fx-breath
    cardSurface:
      '0 0 0 1px #25252a, 0 12px 32px rgba(0,0,0,0.55), 0 0 64px rgba(232,153,104,calc(0.18*var(--lasca-fx-breath,1))), inset 0 1px 0 rgba(255,255,255,0.06)',
    fontHeadline:   FRAUNCES_STACK,
    fontBody:       FRAUNCES_STACK,
    headlineWeight: 500,
    headlineTracking: '-0.005em',
    headlineFeatures: "'dlig'",                             // discretionary ligatures
    headlineVariationSettings: "'WONK' 1, 'SOFT' 50",       // hand-cut feel
    opticalSizing: 'auto',                                  // Fraunces opsz axis
    radiusCard: 8,
    radiusBar:  4,
    motif: { id: 'constellation' },
    captionStyle: { textTransform: 'none', letterSpacing: '0.08em', fontSize: '0.68rem', fontWeight: 400 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
  },

  // ======================================================================
  // 原样 — Faithful import passthrough. NEVER apply any styling, gradients,
  // or animations — would break 1:1 source rendering. The renderFaithfulFrame
  // is the actual implementation; this entry only provides safe fallbacks
  // for any non-faithful slide that happens to coexist in a faithful deck.
  // ======================================================================
  original: {
    cardChrome: 'none',
    primary:    '#d97757',
    accent:     '#6a9bcc',
    bg:         'var(--lasca-texture-original-url) repeat, #ffffff',
    text:       '#141413',
    muted:      '#b0aea5',
    green:      '#788c5d',
    dark:       '#141413',
    border:     '#e8e6dc',
    cardBg:     '#ffffff',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
    fontHeadline: POPPINS_STACK,
    fontBody:     POPPINS_STACK,
    headlineWeight: 700,
    radiusCard: 12,
    radiusBar:  8,
    // 原样 stays decoration-free — never overlay anything on faithful imports.
    decoration: { slide: 'minimal', report: 'minimal' },
  },

  // ======================================================================
  // Premium themes — one per Premium preset
  // ======================================================================

  // 冰锋 — Swiss Precision. Weight 300 signature
  // DESIGN.md §3: "Weight 300 as the signature headline weight"). Blue-tinted
  // dual-layer shadows (§6), conservative 4-8px radius (§5 Do's/Don'ts).
  stripe: {
    cardChrome: 'subtle',
    primary:    '#533afd',
    accent:     '#00d4ff',
    bg:         'var(--lasca-texture-stripe-url) repeat, #ffffff',
    text:       '#061b31',                               // source: Deep Navy, not #0a2540
    muted:      '#64748d',                               // source: Slate body text
    green:      '#15be53',                               // source: Success Green
    dark:       '#061b31',
    border:     '#e5edf5',                               // source: Border Default
    cardBg:     '#ffffff',
    cardShadow: 'rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
    // Atmospheric depth: blue-tinted far shadow + neutral near shadow (source §6 Elevated)
    cardSurface: '0 0 0 1px rgba(229,237,245,0.6), rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px',
    fontHeadline: PLUS_JAKARTA_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 300,                                 // source: "Weight 300 as the signature"
    headlineTracking: '-0.025em',
    headlineFeatures: "'ss01', 'tnum'",                  // source: "ss01 everywhere, non-negotiable"
    radiusCard: 6,                                       // source: 4-8px, "Don't use 12px+"
    radiusBar:  6,
    motif: { id: 'neon-underline' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.72rem', fontWeight: 600 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    // Phase D step 15: brand voice + typography rules formerly owned by the
    // STRIPE preset's promptAppendix. Lives on the theme so a non-Stripe
    // preset (e.g. composer-driven) running on this theme still gets the
    // brand discipline. Orchestrator dedups against preset.promptAppendix
    // when the active preset id matches the theme id.
    promptHints: `## 冰锋风格约束 — Swiss Precision

### 核心识别：纤细即力量
Weight 300 是这套排版的标志性选择——当别人用 600-700 来抢注意力时，这里用轻盈作为奢华。文字如此自信，不需要粗体来建立权威。

### Typography 规则
- **标题**：weight 300（精确值，不是 200 也不是 400）——这是品牌声音
- **正文**：weight 300-400，letter-spacing 正常
- **数字**：比同页文字大 3× 以上，加 tabular-nums (\`tnum\`)。数字是视觉锚点
- **字体**：display 用 \`var(--font-body-sans)\`（Plus Jakarta Sans），body 同
- **letter-spacing 随字号递进收紧**：56px 时 -0.025em，32px 时 -0.02em，16px 及以下 normal

### 空间 × 构图
- 留白 ≥ 50%——精确的负空间，每一块留白都是设计的一部分
- 间距用 8px 倍数（8/16/24/32/48/64），密集数据区域精确到 2px 级别
- 标题优先**左对齐 + 右侧大面积留白**，不居中
- 每页最多 3 个视觉元素（标题 + 1 数据 + 1 辅助文案）

### 色彩策略
- 深蓝黑 #061b31 文字——不是纯黑，是深海军蓝，带来温暖和深度
- 主色 #533afd 紫只用于**单一强调元素**（一个数字、一条下划线、一个标签）
- 辅助色 #00d4ff 青只在需要二级层次时极少量使用

### 阴影 × 深度（atmosphere technique）
- 蓝调双层阴影：远层 rgba(50,50,93,0.25) + 近层 rgba(0,0,0,0.1)——like elements floating in twilight
- 蓝灰阴影色(50,50,93)直接呼应品牌的深蓝调色板——连阴影都是 on-brand 的
- **绝不用**灰色阴影、纯黑阴影——always tint with blue

### Do's and Don'ts (from source DESIGN.md §7)
- **Do**: weight 300 for all headlines; blue-tinted shadows; #061b31 for headings (not #000)
- **Don't**: weight ≥ 400 for headlines; border-radius 12px+（保持 4-8px conservative）; neutral gray shadows; 大面积暖色

### 文案人格
- **克制到极致**。标题 ≤ 8 个词。正文 ≤ 3 句。如果一个词能说清，不用两个
- 语气：像一份精炼的 changelog——技术自信，不解释为什么好，只陈述事实
- 禁止感叹号、emoji、"我们"、"一起"等温暖词汇
- 数字不加修饰语（不说"惊人的 99.9%"，只说"99.9%"）`,
  },

  // 黑曜 — Obsidian. Design note: luminance-stepping depth (not shadows),
  // Marketing Black #08090a, text #f7f8f8 ("not pure white"). Familjen Grotesk
  // display for Nordic editorial character. Liquid light top-border signature.
  linear: {
    cardChrome: 'subtle',
    primary:    '#5e6ad2',
    accent:     '#26b5ce',
    bg:         'var(--lasca-texture-linear-url) repeat, #08090a',  // source: Marketing Black
    text:       '#f7f8f8',                               // source: "not pure #ffffff"
    muted:      '#8a8f98',
    green:      '#45e5a0',
    dark:       '#f7f8f8',
    border:     '#23252a',                               // source: Border Primary
    cardBg:     '#141414',
    cardShadow: '0 2px 8px rgba(0,0,0,0.3)',
    // 4-layer: top gradient border + subtle outer glow + hairline + inset highlight
    cardSurface:
      'inset 0 1px 0 rgba(94,106,210,0.25), 0 0 0 1px #23252a, 0 8px 24px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(255,255,255,0.03)',
    fontHeadline: FAMILJEN_GROTESK_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 500,
    headlineTracking: '-0.03em',
    headlineFeatures: "'cv01', 'ss03'",                  // source: "non-negotiable" identity features
    radiusCard: 8,
    radiusBar:  6,                                       // source: 6px comfortable for interactive
    motif: { id: 'grid-dot-matrix' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: '0.6rem', fontWeight: 500 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 黑曜风格约束 — Obsidian

### 核心识别：深度即奢华
不是"深色模式"——是**宝石切面**。黑曜石的美来自层次：表面 #08090a → 卡片 #141414 → 悬浮 #1a1a1a → 高亮边框 #23252a。每一层微妙地浅一点，像在黑色矿石里看到不同的切面。深度通过 luminance stepping 实现，不靠 drop shadow。

### Typography 规则
- **标题**：weight 500，letter-spacing -0.03em（比正常紧 3 倍），让字母几乎咬合——信息密度极高的感觉
- **正文**：weight 400，letter-spacing 正常，line-height 1.7（暗色背景需要更大行距才不压抑）
- **字体**：display 用 Familjen Grotesk（北欧 grotesque，天生的 developer 气质），body 用 Plus Jakarta Sans
- **关键特征**：Familjen Grotesk 的 g/a/e 字形有独特的开口，在深色背景上辨识度极高

### 空间 × 构图
- 每页一个视觉焦点，其余全是呼吸空间
- 标题 ≤ 6 个词——像 git commit message 的第一行
- 卡片之间间距 ≥ 24px，用留白代替分割线
- 所有卡片左上角有 1px 顶部边框，从 #5e6ad2 渐变到 transparent——"液态光"效果，是这个 preset 的视觉签名

### 色彩策略
- 文字 #f7f8f8（不是纯白——纯白在深色底上会刺眼）
- 主色 #5e6ad2 紫蓝**只用于高亮和交互态**，绝不用于大面积填充
- 辅色 #26b5ce 青只在需要第二层次时极少量使用
- 卡片背景 #141414，边框 #252525——通过 1px 线条暗示层次，不用阴影

### 文案人格
- **Changelog 语气**。标题是陈述句，像 release notes 标题
- 每页只说一件事。如果需要说两件事，那就是两页
- 正文可以用代码术语（API、webhook、pipeline），不需要解释
- 禁止感叹号、emoji、煽情词`,
  },

  // 和紙 — Washi. Design note: primary accent is the brand blue #0075de (not
  // black). 4-layer whisper shadow (no layer > 0.05 opacity). 12px card radius.
  // Lasca creative: keep #eb5757 red-stamp accent for washi identity, Fraunces
  // SOFT 100 for organic curves (source uses weight 700, Lasca uses 400 light).
  notion: {
    cardChrome: 'none',
    primary:    '#0075de',                               // primary blue accent
    accent:     '#eb5757',                               // Lasca creative: washi red-stamp
    bg:         'var(--lasca-texture-notion-url) repeat, #faf8f4',
    text:       '#37352f',
    muted:      '#615d59',                               // source: Warm Gray 500 secondary text
    green:      '#4dab5c',
    dark:       '#37352f',
    border:     'rgba(0,0,0,0.1)',                       // source: whisper border
    cardBg:     '#ffffff',                               // source: cards are white
    // Source §6: 4-layer micro-shadow, no layer > 0.05 opacity
    cardShadow: 'rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px',
    cardSurface: '0 0 0 1px rgba(0,0,0,0.1), rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2px 8px, rgba(0,0,0,0.01) 0px 0.175px 1.04px',
    fontHeadline: FRAUNCES_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 400,                              // Lasca creative: light contemplative
    headlineTracking: '-0.02em',                      // source: tighter tracking at display
    headlineFeatures: "'lnum', 'dlig'",               // source: lining numerals
    headlineVariationSettings: "'WONK' 1, 'SOFT' 100",
    opticalSizing: 'auto',
    radiusCard: 12,                                   // source: 12px standard cards
    radiusBar:  4,
    motif: { id: 'left-rule' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '0.65rem', fontWeight: 500 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 和紙风格约束 — Washi

### 核心识别：轻盈即优雅
侘寂（wabi-sabi）：在不完美中找到美。这个 preset 的美来自**极致的轻盈**——字重轻、颜色浅、留白多、结构松。像手漉和纸上的墨迹——不是印刷的精确，而是书写的从容。

### Typography 规则
- **标题**：Fraunces，weight 400（不是 600/700——轻盈是灵魂），SOFT 轴 100，WONK 1
- **正文**：Plus Jakarta Sans，weight 300（比正常更轻一档），line-height 1.8（宽松到像在翻书）
- **关键特征**：Fraunces weight 400 + SOFT 100 出来的字形有手写的有机弧度，每个字母略有不同
- **字号对比温和**：标题和正文的字号差不要太大（1.5-2× 即可），避免"喊叫"感

### 空间 × 构图
- **非对称是灵魂**。标题靠左、大面积右侧留白。或者标题靠上 1/3、下方 2/3 全是呼吸空间
- 不居中。居中是"安全的"但没有性格
- 元素之间用留白分隔，绝不用分割线。留白 ≥ 40%
- 卡片无阴影——用 1px 暖色边框 rgba(55,53,47,0.08) 暗示边界，像宣纸的毛边
- 圆角 6-12px，不要太圆也不要太方

### 色彩策略
- 文字 #37352f（温暖的棕黑——像墨汁干透后的颜色）
- 背景 #faf8f4（微微偏黄的暖白，像宣纸）
- 强调色 #eb5757 红**极少量使用**——一页最多出现一次。像印章——整封信只盖一个章
- 主色 #0075de 蓝用于链接和 CTA

### 文案人格
- **写信的口气**。像在给一个信任你的同事写 doc，不是在做 presentation
- 可以用"我们"、"你"、"一起"——有温度但不煽情
- 标题清晰直白，不追求悬念
- 允许比其他 preset 多一些正文——和紙是为阅读设计的
- 每页有一个安静的细节：一个精确的数字、一句引用、一个具体的人名`,
  },

  // 碑文 — Monument / Brutalist. Design note: tracking -0.04em (most
  // aggressive of any major design system), ligatures non-negotiable. Lasca
  // creative interpretation: dark bg (source is white), weight 800 (source max
  // is 600) for brutalist emphasis.
  vercel: {
    cardChrome: 'none',
    primary:    '#000000',
    accent:     '#0070f3',
    bg:         '#000000',
    text:       '#ffffff',
    muted:      '#888888',
    green:      '#50e3c2',
    dark:       '#ffffff',
    border:     '#333333',
    cardBg:     '#111111',
    cardShadow: 'none',
    fontHeadline: BRICOLAGE_GROTESQUE_STACK,
    fontBody:     FAMILJEN_GROTESK_STACK,
    headlineWeight: 800,                              // Lasca brutalist (source max: 600)
    headlineTracking: '-0.04em',                      // source: most aggressive tracking
    headlineFeatures: "'liga'",                       // source: "ligatures non-negotiable"
    radiusCard: 2,
    radiusBar:  0,
    motif: { id: 'crop-marks' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.24em', fontSize: '0.55rem', fontWeight: 500 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 碑文风格约束 — Monument

### 核心识别：字就是建筑
Brutalist architecture：原始材料 + 巨大尺度 + 零装饰 = 震撼。**标题本身就是整页的建筑**。weight 800 的巨型字母占据页面 60%+，剩下的全是黑色或白色的负空间。

### Typography 规则
- **标题**：Bricolage Grotesque，weight 800（最粗——这是碑文的识别特征）。字号尽可能大——cover 标题可以 80-120px
- **正文**：Familjen Grotesk，weight 400，与 800 标题形成极端粗细对比
- **标题可以分行**：把一个短句拆成 2-3 行，每行 2-3 个词，让巨型字母堆叠出纪念碑般的体量感
- **Cover 页标题允许全大写**（英文部分），增强建筑感

### 空间 × 构图
- **留白 ≥ 55%**。碑文的力量来自周围的空旷
- 绝对不居中（居中太温和）。标题靠左下或左上对齐，像建筑的基座
- 零装饰：不要分割线、不要图标、不要圆角（0-2px）、不要阴影、不要渐变
- 每页最多 2 个视觉元素
- **letter-spacing -0.04em** —— "the most aggressive negative tracking of any major design system"

### 色彩策略
- 只有黑 #000 和白 #fff。两者互换：黑底白字或白底黑字
- 唯一允许的颜色：#0070f3 电蓝——只用于极少量高亮
- 禁止渐变、禁止灰色（灰色是妥协——碑文不妥协）

### 文案人格
- **宣言式**。标题是断言，不是描述
- 动词优先。名词可以被动，动词永远主动
- 极短：标题 ≤ 5 个词，正文 ≤ 2 句
- 禁止问句、禁止感叹号
- 语气：像纪念碑上的铭文——简洁、永恒、不解释`,
  },

  // 月白 — Moonlight. Design note: Brand blue #0071e3, max radius 12px
  // ("Don't use >12px on rectangles"), offset directional shadow. Source says
  // "solid colors only" for bg — Lasca adds subtle radial as creative choice.
  apple: {
    cardChrome: 'subtle',
    primary:    '#0071e3',                               // Signature blue — differentiated from text so headlines pop on white cards
    accent:     '#0071e3',                               // source: Brand blue CTA
    bg:         'radial-gradient(ellipse 70% 60% at 50% 40%, #fefefe 0%, #fbfbfd 100%)',
    text:       '#1d1d1f',
    muted:      '#86868b',
    green:      '#34c759',
    dark:       '#1d1d1f',
    border:     '#d2d2d7',
    cardBg:     '#ffffff',
    cardShadow: '3px 5px 20px rgba(0,0,0,0.10)',        // source: offset directional shadow
    cardSurface: '0 0 0 1px rgba(210,210,215,0.4), 3px 5px 20px rgba(0,0,0,0.08)',
    fontHeadline: PLUS_JAKARTA_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 600,
    headlineTracking: '-0.02em',
    radiusCard: 12,                                   // source: "Don't use >12px"
    radiusBar:  10,
    // apple motif is 'void' — decoration by absence. Slide renderer returns
    // null for 'minimal', so the theme never gets accent lines, corner marks,
    // or any geometry on slides. Report still needs baseline chrome though.
    motif: { id: 'void' },
    captionStyle: { textTransform: 'none', letterSpacing: '0.02em', fontSize: '0.75rem', fontWeight: 400 },
    decoration: { slide: 'minimal', report: 'motif-default' },
    promptHints: `## 月白风格约束 — Moonlight

### 核心识别：看不见的设计
最好的设计是让人注意不到设计本身。月白的目标是"隐形"——观众记住的是内容，不是样式。但仔细看，每一个间距、字重、颜色值都是精心计算的。

### Typography 规则
- **标题**：Plus Jakarta Sans，weight 600，letter-spacing -0.02em。不用衬线
- **正文**：同 Plus Jakarta Sans，weight 400，line-height 精确到 1.6
- **字号系统严格遵守比率**：标题 / 副标题 / 正文 / 辅助 = 1 / 0.67 / 0.5 / 0.42
- **标题和正文的字号差距要大**（≥ 2× 倍），但都不夸张——标题 36-48px，正文 16-18px

### 空间 × 构图
- **每页只有一个焦点**。绝不同时有两个争夺注意力的元素
- 留白 ≥ 50%——但留白的分布要**对称**（月白是唯一允许居中的 preset）
- 卡片有 1px 边框 #d2d2d7 + 极淡阴影（2px blur, rgba(0,0,0,0.04)）
- 圆角 ≤ 12px——比其他 preset 都大，柔和到几乎不被注意

### 色彩策略
- 背景 #fbfbfd（几乎是白色，但多了 0.8% 的蓝灰）
- 文字 #1d1d1f（不是纯黑——比纯黑柔和 8%）
- Signature blue #0071e3 **只用于 CTA 和链接**，整 deck ≤ 5 次
- 灰色层次精确：muted text #86868b，border #d2d2d7
- 阴影是偏移定向的（3px 5px 20px）——like studio side-lighting
- **Don't**: textures/patterns/gradients on backgrounds; 装饰性元素; warm accent colors

### 文案人格
- **产品文案的最高水平**。一句话讲清价值
- 语气像苹果 Keynote：自信但不张扬
- 面向消费者，不面向开发者。避免技术术语
- 允许形容词但每句最多一个`,
  },

  // 极光 — Aurora. Design note: primary brand green is the signature green #1ed760, card radius
  // 6-8px (pills 500px+ are for buttons only). Heavy shadows on elevated elements.
  spotify: {
    cardChrome: 'framed',
    primary:    '#1ed760',                               // source: Spotify Green brand primary
    accent:     '#1db954',                               // source: border/secondary variant
    bg:         'var(--lasca-texture-spotify-url) repeat, #121212',
    text:       '#ffffff',
    muted:      '#b3b3b3',
    green:      '#1ed760',
    dark:       '#ffffff',
    border:     '#282828',
    cardBg:     '#181818',
    cardShadow: 'rgba(0,0,0,0.5) 0px 8px 24px',        // source: heavy shadow for elevated
    // Neon glow: green outer light + hairline + depth shadow
    cardSurface:
      '0 0 0 1px #282828, rgba(0,0,0,0.5) 0px 8px 24px, 0 0 40px rgba(29,185,84,0.08)',
    fontHeadline: BRICOLAGE_GROTESQUE_STACK,
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 700,
    radiusCard: 8,                                     // source: 6-8px for cards
    radiusBar:  8,
    motif: { id: 'waveform' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '0.68rem', fontWeight: 700 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 极光风格约束 — Aurora

### 核心识别：暗场中的霓虹
北极光不是"亮"——是在极致的黑暗中，一束光有了意义。**在深色场景中用一种颜色创造能量和方向**。绿色不是填色，是光。

### Typography 规则
- **标题**：Bricolage Grotesque，weight 700-800——粗壮有力，充满能量
- **正文**：Plus Jakarta Sans，weight 400
- **标题可以大胆、甚至夸张**——60-80px 不嫌多
- **允许标题用感叹号**（这是唯一允许感叹号的 premium preset）

### 空间 × 构图
- 信息密度可以比其他 preset 高——面向年轻受众
- 卡片式布局是核心表达方式。three-cards、grid-cards 都欢迎
- 卡片圆角 6-8px——pills 500px+ 只用于 buttons
- 卡片有绿色微光：box-shadow 用 rgba(29,185,84,0.12) 做外发光

### 色彩策略
- 深灰 #121212 底（不是纯黑）
- 文字 #ffffff（极光需要对比度来"发光"）
- **绿色是光，不是色**：#1ed760 用于 play buttons、active states、CTAs
- 卡片背景 #181818，边框 #282828
- **大写按钮标签 + 宽字距 1.4-2px**——极光的标志性 UI pattern
- **Don't**: 装饰性使用绿色——green is functional only; 不用暖色

### 文案人格
- **播客主播的语气**：热情、直接、用短句制造节奏感
- 可以用口语但不低幼
- 数字和增长率用绿色突出
- 允许更多文案量（3-4 句正文），但每句都要有信息增量
- 可以用 emoji 但限一页 ≤ 1 个，且只用数据相关 emoji（📈 🎯 🔥 ✅）`,
  },

  // 窑变 — Kiln Glaze. Design note: Coral red #ff385c, text #222222
  // (warm near-black), 3-layer shadow stack, 20px card radius ("Don't use
  // sharp corners 0-4px on cards — 20px+ is core"). All-serif Lasca creative.
  airbnb: {
    cardChrome: 'none',
    primary:    '#ff385c',                               // source: coral red — primary brand color
    accent:     '#00a699',
    bg:         'var(--lasca-texture-airbnb-url) repeat, #faf7f2',
    text:       '#222222',                               // source: "warm near-black"
    muted:      '#6a6a6a',                               // source: Secondary Gray
    green:      '#00a699',
    dark:       '#222222',
    border:     '#ebebeb',
    cardBg:     '#ffffff',                               // source: cards are white
    // Source §6: 3-layer shadow stack (ring + near + far)
    cardShadow: 'rgba(0,0,0,0.02) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px',
    cardSurface:
      'rgba(0,0,0,0.02) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 6px, rgba(0,0,0,0.1) 0px 4px 8px',
    fontHeadline: FRAUNCES_STACK,
    fontBody:     LORA_STACK,                          // Lasca creative: all-serif warmth
    headlineWeight: 600,                               // source: 600 for card headings
    headlineStyle: 'italic',                           // Lasca creative: kiln signature
    headlineTracking: '-0.015em',                      // source: tighter tracking
    headlineFeatures: "'salt', 'dlig'",                // source: stylistic alternates
    headlineVariationSettings: "'WONK' 1, 'SOFT' 80",
    opticalSizing: 'auto',
    radiusCard: 20,                                    // source: "20px+ core to identity"
    radiusBar:  8,
    motif: { id: 'rubber-stamp' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: '0.65rem', fontWeight: 500 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 窑变风格约束 — Kiln Glaze

### 核心识别：泥土烧出的颜色
窑变（kiln transmutation）：陶器在窑火中发生的不可预期的色彩变化——珊瑚、青绿、赭石、奶白，每一件都独一无二。**有机的温暖**——像自然生成的、有温度的色彩关系。

### Typography 规则
- **标题**：Fraunces，weight 500，style italic——Fraunces 的 italic 有手写般的有机弧度
- **正文**：Lora，weight 400——**全衬线配对**（Fraunces italic + Lora regular），像一本精装杂志
- **关键特征**：标题的 italic + 正文的 roman，斜体和直体的交替创造了阅读节奏
- 字号适中，不追求巨大标题——窑变是"细看"而不是"一眼震撼"

### 空间 × 构图
- 留白有机而非对称——像手工陶器的不规则边缘
- 每页至少有一个**人**的痕迹：一句引用、一个人名、一个故事片段、一个具体场景
- 引用标记（"）用珊瑚色 #ff5a5f 大字号（60px+）
- 卡片圆角 **20px+**——20px+ 是 core to identity
- 卡片用 3 层阴影：ring(0.02) + near(0.04) + far(0.1)
- 分隔用短横线（——）或小圆点（·），不用直线

### 色彩策略
- 背景 #faf7f2（比纯白偏黄偏暖）
- 文字 #222222（warm near-black, never pure #000）
- Coral red #ff385c 是主角——用于引用标记、关键数据、section 转场
- 青绿 #00a699 是配角——偶尔出现在图标、标签
- **Don't**: 尖角卡片（0-4px radius）; 单层阴影; 纯黑文字

### 文案人格
- **讲故事的人**。窑变的每一页都应该有叙事感——不是列数据，而是用数据讲故事
- 语气温暖但不煽情
- 每页至少有一个具体的人/场景/细节
- 引用（quote layout）是窑变的明星布局
- 适合：社区分享、用户增长报告、品牌叙事、年终回顾、团队文化分享`,
  },

  // 墨金 — Noir & Gold. Design note: Deep red #DA291C, 2px radius
  // ("razor precision"), "Don't add box-shadows — depth via surface contrast",
  // chiaroscuro black/white alternation. Lasca creative: Instrument Serif italic
  // (source uses FerrariSans), warm cream text, luxury wide tracking.
  ferrari: {
    cardChrome: 'framed',
    primary:    '#DA291C',                             // source: deep red — signature color
    accent:     '#FFF200',                             // source: Racing Yellow heritage
    bg:         'var(--lasca-texture-ferrari-url) repeat, #0c0c0c',
    text:       '#f0ece4',                             // Lasca creative: warm cream
    muted:      '#8F8F8F',                             // source: Mid Gray
    green:      '#03904A',                             // source: Success Green
    dark:       '#f0ece4',
    border:     '#303030',                             // source: Dark Surface
    cardBg:     '#141414',
    cardShadow: 'none',                                // source: "Don't add box-shadows"
    // Editorial flat: hairline only + subtle red underlight (no heavy shadows)
    cardSurface:
      '0 0 0 1px #303030, 0 0 40px rgba(218,41,28,0.02), inset 0 1px 0 rgba(255,255,255,0.04)',
    fontHeadline: INSTRUMENT_SERIF_STACK,              // Lasca creative: didone luxury
    fontBody:     PLUS_JAKARTA_STACK,
    headlineWeight: 400,                               // Instrument Serif natural weight
    headlineStyle: 'italic',                           // Lasca creative: luxury italic
    headlineTracking: '0.04em',                        // wide — luxury brand spacing
    headlineFeatures: "'tnum'",
    radiusCard: 2,                                     // source: "2px default, razor precision"
    radiusBar:  2,                                     // source: 2px for all interactive
    motif: { id: 'racing-chevron' },
    captionStyle: { textTransform: 'uppercase', letterSpacing: '0.22em', fontSize: '0.6rem', fontWeight: 400 },
    decoration: { slide: 'motif-default', report: 'motif-default' },
    promptHints: `## 墨金风格约束 — Noir & Gold

### 核心识别：一滴红
Film noir 的美学核心：在极致的克制中，一个突破性元素产生戏剧性。Deep red #DA291C 就是这一滴——每页只出现在一个元素上，其余全是黑白。"Ferrari Red appears with almost surgical sparseness."

### Typography 规则
- **标题**：Instrument Serif，weight 400，style **italic**——Lasca 字库中最奢华的字形。Didone 风格的高对比粗细笔画
- **正文**：Plus Jakarta Sans，weight 300（纤细——与 Instrument Serif 的戏剧性形成极端对比）
- **字间距**：标题用 +0.04em（比正常宽——luxury 品牌的标准做法）
- **数字**：关键 metric 用 Instrument Serif italic 渲染，字号 80-120px

### 空间 × 构图
- **留白 ≥ 55%**。奢侈品的留白不是"空"，是"我有足够的空间可以浪费"
- 每页 1-2 个视觉元素，绝不超过 2 个
- 标题位置：cover 居中偏下（像电影海报），内页左对齐偏上
- 卡片有 1px 边框 + 深色阴影 + 微妙的红色底光 rgba(220,0,0,0.03)
- 圆角 **2px**——nearly zero border-radius reflecting precision engineering aesthetics

### 色彩策略
- 背景 #0c0c0c（哑光黑）+ 暗场/亮场 chiaroscuro 交替节奏
- 文字 #f0ece4（暖奶白色，像高级信纸）
- **Deep red #DA291C 的规则：每页只允许出现在一个元素上**
- Racing Yellow #FFF200 **在整个 deck 中最多出现 2 次**
- **零阴影**——depth via chiaroscuro surface contrast
- **Don't**: box-shadows on cards; rounded-pill buttons; large border-radii

### 文案人格
- **luxury copywriting：少即多，短即贵**。标题 ≤ 4 个词（硬规则）
- 语气像奢侈品广告：不解释"为什么好"，只呈现"它是什么"
- 禁止感叹号、emoji、口语、"我们"。用第三人称或无主语句式
- Cover 标题像 luxury brand campaign：一个词或短语
- 适合：年度报告、investor pitch、品牌发布、高端产品展示、颁奖典礼`,
  },

  // ======================================================================
  // Scene × Colorway: Analyst (3 colorways derived from shared base)
  // ======================================================================
  'analyst-light': deriveTheme('analyst-light', ANALYST_LIGHT_BASE, ANALYST_LIGHT),
  'analyst-mist':  deriveTheme('analyst-mist',  ANALYST_MIST_BASE,  ANALYST_MIST),
  'analyst-dark':  deriveTheme('analyst-dark',  ANALYST_DARK_BASE,  ANALYST_DARK),

  // ======================================================================
  // Analysis report (3 colorways, report-only) — bilingual-report skill
  // ======================================================================
  'analysis-paper': deriveTheme('analysis-paper', ANALYSIS_PAPER_BASE, ANALYSIS_PAPER),
  'analysis-memo':  deriveTheme('analysis-memo',  ANALYSIS_MEMO_BASE,  ANALYSIS_MEMO),
  'analysis-field': deriveTheme('analysis-field', ANALYSIS_NOIR_BASE,  ANALYSIS_NOIR),

  // ======================================================================
  // Lookbook family (slide-only) — ember (Phase B) + forest / ink (Phase C)
  // ======================================================================
  'lookbook-ember':  deriveTheme('lookbook-ember',  LOOKBOOK_EMBER_BASE,  LOOKBOOK_EMBER),
  'lookbook-forest': deriveTheme('lookbook-forest', LOOKBOOK_FOREST_BASE, LOOKBOOK_FOREST),
  'lookbook-ink':    deriveTheme('lookbook-ink',    LOOKBOOK_INK_BASE,    LOOKBOOK_INK),

  // ======================================================================
  // Private-banking family (slide-only) — Phase C
  // ======================================================================
  'private-banking-sovereign': deriveTheme('private-banking-sovereign', PB_SOVEREIGN_BASE, PB_SOVEREIGN),
  'private-banking-noir':      deriveTheme('private-banking-noir',      PB_NOIR_BASE,      PB_NOIR),
  'private-banking-clay':      deriveTheme('private-banking-clay',      PB_CLAY_BASE,      PB_CLAY),
};

export const THEME_NAMES: Record<Theme, string> = {
  warm:     '岩壁',
  cool:     '冰川',
  dark:     '洞穴',
  original: '原样',
  stripe:   '冰锋',
  linear:   '黑曜',
  notion:   '和紙',
  vercel:   '碑文',
  apple:    '月白',
  spotify:  '极光',
  airbnb:   '窑变',
  ferrari:  '墨金',
  'analyst-light': 'Analyst Light',
  'analyst-mist':  'Analyst Mist',
  'analyst-dark':  'Analyst Dark',
  'analysis-paper': 'Analysis · Paper',
  'analysis-memo':  'Analysis · Memo',
  'analysis-field': 'Analysis · Noir',
  'lookbook-ember':  'Lookbook · Ember',
  'lookbook-forest': 'Lookbook · Forest',
  'lookbook-ink':    'Lookbook · Ink',
  'private-banking-sovereign': 'Private Banking · Sovereign',
  'private-banking-noir':      'Private Banking · Noir',
  'private-banking-clay':      'Private Banking · Clay',
};

// ============================================================================
// Scene helpers — used by both renderSlide.ts (dispatcher attribute injection)
// and React wrappers (Canvas / Sidebar / Presenter / GenerationPreview) so that
// scene-aware CSS in globals.css can scope layout styling via
// `.scene-<id> [data-layout="..."]` selectors.
// ============================================================================

/** Returns the scene id for a theme, or null if the theme is not scene-based.
 *  e.g., 'analyst-light' / 'analyst-mist' / 'analyst-dark' → 'analyst'. */
export function getSceneFromTheme(theme: Theme): string | null {
  if (theme.startsWith('analyst-')) return 'analyst';
  if (theme.startsWith('analysis-')) return 'analysis';
  // Storyteller / Keynote / Scholar will be added in later phases.
  return null;
}

/** Returns the colorway variant suffix for a scene-based theme, or null.
 *  e.g., 'analyst-light' → 'light', 'analyst-mist' → 'mist'. Used by CSS
 *  scoping (`.scene-analyst [data-scene-variant="dark"]`) and by motif
 *  decoration to express subtle per-colorway personality differences. */
export function getSceneVariant(theme: Theme): string | null {
  const scene = getSceneFromTheme(theme);
  if (!scene) return null;
  const dash = theme.indexOf('-');
  return dash >= 0 ? theme.slice(dash + 1) : null;
}

/** Returns the CSS class name for the theme's scene, or empty string.
 *  Used by React wrappers in the same conditional slot where
 *  `preset-bilingual-report` is applied. */
export function getSceneClass(theme: Theme): string {
  const scene = getSceneFromTheme(theme);
  return scene ? `scene-${scene}` : '';
}

/** Merge per-slide style overrides into a ThemeConfig. Returns the base
 *  unchanged (no allocation) when overrides is undefined or empty. */
export function mergeStyleOverrides(
  base: ThemeConfig,
  overrides: SlideStyleOverrides | undefined,
): ThemeConfig {
  if (!overrides) return base;
  return {
    ...base,
    ...(overrides.bg != null && { bg: overrides.bg }),
    ...(overrides.text != null && { text: overrides.text }),
    ...(overrides.primary != null && { primary: overrides.primary }),
    ...(overrides.accent != null && { accent: overrides.accent }),
    ...(overrides.muted != null && { muted: overrides.muted }),
    ...(overrides.cardBg != null && { cardBg: overrides.cardBg }),
    ...(overrides.cardShadow != null && { cardShadow: overrides.cardShadow }),
    ...(overrides.fontHeadline != null && { fontHeadline: overrides.fontHeadline }),
    ...(overrides.fontBody != null && { fontBody: overrides.fontBody }),
    ...(overrides.headlineWeight != null && { headlineWeight: overrides.headlineWeight }),
  };
}
