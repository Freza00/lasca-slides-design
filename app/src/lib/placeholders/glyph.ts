// ============================================================================
// Algorithmic Glyph — per-tile geometric SVG placeholders
// ============================================================================
// Reference: https://github.com/anthropics/skills/tree/main/skills/algorithmic-art
//
// Companion to `algorithmicArt.ts` (full-page backdrops) — this module produces
// small, restrained SVG glyphs (24–48px) used where a decorative icon would
// otherwise be an emoji. The visual language is editorial-minimal: 2 colors
// max, thin strokes, confident geometry. Deterministic on `seed` so a given
// tile index always produces the same glyph.
//
// Wired into: renderIconList / renderFeaturedGrid / renderBento.
// ============================================================================

export interface GlyphOptions {
  seed: number;
  size: number;
  color: string;
  accent?: string;
}

type Variant = (s: number, color: string, accent: string, rng: () => number) => string;

function makeRng(seed: number): () => number {
  let x = (seed | 0) || 1;
  return () => {
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function wrap(size: number, content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block;flex-shrink:0;">${content}</svg>`;
}

// --- Variants ---------------------------------------------------------------

const concentricRings: Variant = (s, color, accent) => {
  const c = s / 2;
  const r1 = s * 0.42;
  const r2 = s * 0.24;
  const sw = Math.max(1, s / 20);
  return wrap(s, `
    <circle cx="${c}" cy="${c}" r="${r1}" fill="none" stroke="${color}" stroke-width="${sw}"/>
    <circle cx="${c}" cy="${c}" r="${r2}" fill="${accent}" opacity="0.85"/>`);
};

const dotMatrix: Variant = (s, color, accent, rng) => {
  const n = 3;
  const cell = s / (n + 1);
  const highlighted = Math.floor(rng() * n * n);
  let out = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const r = i === highlighted ? s * 0.09 : s * 0.045;
      const fill = i === highlighted ? accent : color;
      out += `<circle cx="${(x + 1) * cell}" cy="${(y + 1) * cell}" r="${r}" fill="${fill}"/>`;
    }
  }
  return wrap(s, out);
};

const chamferedSquare: Variant = (s, color, accent) => {
  const m = s * 0.18;
  const sw = Math.max(1, s / 20);
  // outer chamfered rect (top-right corner cut)
  const pts = `${m},${m} ${s - m * 1.8},${m} ${s - m},${m * 1.8} ${s - m},${s - m} ${m},${s - m}`;
  return wrap(s, `
    <polygon points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="miter"/>
    <rect x="${s * 0.35}" y="${s * 0.35}" width="${s * 0.22}" height="${s * 0.22}" fill="${accent}"/>`);
};

const triangleStack: Variant = (s, color, accent) => {
  const sw = Math.max(1, s / 20);
  const outer = `${s / 2},${s * 0.15} ${s * 0.88},${s * 0.82} ${s * 0.12},${s * 0.82}`;
  const inner = `${s / 2},${s * 0.42} ${s * 0.68},${s * 0.74} ${s * 0.32},${s * 0.74}`;
  return wrap(s, `
    <polygon points="${outer}" fill="none" stroke="${color}" stroke-width="${sw}"/>
    <polygon points="${inner}" fill="${accent}"/>`);
};

const plusSign: Variant = (s, color, accent) => {
  const t = s * 0.14;
  const m = s / 2;
  return wrap(s, `
    <rect x="${m - t / 2}" y="${s * 0.18}" width="${t}" height="${s * 0.64}" fill="${color}"/>
    <rect x="${s * 0.18}" y="${m - t / 2}" width="${s * 0.64}" height="${t}" fill="${color}"/>
    <circle cx="${m}" cy="${m}" r="${t * 0.6}" fill="${accent}"/>`);
};

const segmentedRing: Variant = (s, color, accent, rng) => {
  const c = s / 2;
  const r = s * 0.38;
  const sw = Math.max(2, s / 14);
  const startAngle = rng() * Math.PI * 2;
  const sweep = Math.PI * 1.4;
  const x1 = c + r * Math.cos(startAngle);
  const y1 = c + r * Math.sin(startAngle);
  const x2 = c + r * Math.cos(startAngle + sweep);
  const y2 = c + r * Math.sin(startAngle + sweep);
  const largeArc = sweep > Math.PI ? 1 : 0;
  return wrap(s, `
    <path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>
    <circle cx="${c}" cy="${c}" r="${s * 0.08}" fill="${accent}"/>`);
};

const diagonalLines: Variant = (s, color) => {
  const sw = Math.max(1.5, s / 18);
  const gap = s * 0.22;
  let out = '';
  for (let i = -1; i <= 2; i++) {
    const offset = i * gap;
    out += `<line x1="${s * 0.15 + offset}" y1="${s * 0.85}" x2="${s * 0.85 + offset}" y2="${s * 0.15}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  return wrap(s, `<g clip-path="inset(0 0 0 0)">${out}</g>`);
};

const nestedSquares: Variant = (s, color, accent) => {
  const sw = Math.max(1, s / 20);
  const outer = s * 0.7;
  const ox = (s - outer) / 2;
  const c = s / 2;
  const inner = s * 0.28;
  return wrap(s, `
    <rect x="${ox}" y="${ox}" width="${outer}" height="${outer}" fill="none" stroke="${color}" stroke-width="${sw}"/>
    <rect x="${c - inner / 2}" y="${c - inner / 2}" width="${inner}" height="${inner}" fill="${accent}" transform="rotate(45 ${c} ${c})"/>`);
};

const VARIANTS: Variant[] = [
  concentricRings,
  dotMatrix,
  chamferedSquare,
  triangleStack,
  plusSign,
  segmentedRing,
  diagonalLines,
  nestedSquares,
];

// --- Public API -------------------------------------------------------------

/**
 * Render a geometric SVG glyph. Same (seed, size, color, accent) → same output.
 * Use when a decorative icon slot would otherwise get an emoji.
 */
export function renderGlyph(opts: GlyphOptions): string {
  const { seed, size, color, accent } = opts;
  const variantIdx = ((seed % VARIANTS.length) + VARIANTS.length) % VARIANTS.length;
  const rng = makeRng(seed + 7);
  return VARIANTS[variantIdx](size, color, accent ?? color, rng);
}

// --- Emoji detection (shared with goldenRules + render fallback) ------------

/**
 * Matches emoji-presentation characters OR any character carrying the FE0F
 * variation selector (which forces emoji rendering on an otherwise neutral
 * codepoint like U+2699 ⚙️). Narrower than Extended_Pictographic so plain
 * typographic symbols (★ ◆ § → ● numbers) are preserved as-is — those are
 * exactly the characters the AI prompt recommends as legitimate icons.
 */
export const EMOJI_RE = /\p{Emoji_Presentation}|\uFE0F/u;

export function containsEmoji(s: string | undefined | null): boolean {
  if (!s) return false;
  return EMOJI_RE.test(s);
}
