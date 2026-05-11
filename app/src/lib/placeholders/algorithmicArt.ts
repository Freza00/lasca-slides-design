// ============================================================================
// Algorithmic Art Placeholders
// ============================================================================
// Reference: https://github.com/anthropics/skills/tree/main/skills/algorithmic-art
//
// The Anthropic algorithmic-art skill defines 5 named generative aesthetics
// with p5.js + seeded randomness:
//
//   1. Organic Turbulence — chaos constrained by natural law, flow fields
//   2. Quantum Harmonics — particles on grids, sine-wave interference
//   3. Recursive Whispers — self-similarity, L-systems, golden ratios
//   4. Field Dynamics — vector fields visualized via particle flow
//   5. Stochastic Crystallization — random processes crystallizing into order
//
// We port three of them to lightweight SVG (no p5.js runtime, SSR-friendly,
// clean PDF export). Each is deterministic: same (w, h, seed) → same output,
// so thumbnails stay stable across re-renders.
//
// Assignment per Analyst colorway (direct quotes from firm-research notes):
//
//   analyst-light → an investment bank      → Stochastic Crystallization
//                                        (Swiss-modernist rigor)
//   analyst-mist  → consulting-firm & Company → Field Dynamics
//                                        (signature blue-wave motif)
//   analyst-dark  → private-equity         → Organic Turbulence
//                                        (Rothko color field + restraint)
//
// Each generator follows the skill's craftsmanship principle — "painstaking
// optimization, master-level implementation" — and stays deliberately
// un-busy, because these are slide placeholders, not hero artworks.
// ============================================================================

import type { Theme } from '../types';
import { getSceneVariant } from '../themes';

export interface ArtPalette {
  bg: string;
  primary: string;
  accent: string;
  muted: string;
}

/**
 * Seeded LCG (Linear Congruential Generator) — 8 lines of deterministic
 * pseudo-randomness. Mulberry32 constants, good enough for art placement.
 */
function makeRng(seed: number): () => number {
  let s = (seed | 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), s | 1);
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// 1. Stochastic Crystallization (investment-bank) — Swiss-modernist composition, v2
// ---------------------------------------------------------------------------
// Philosophy: "Random processes crystallizing into ordered structures."
// Translated to investment-bank's visual register: Müller-Brockmann Swiss-style
// composition — bold geometric primitives placed on a disciplined grid,
// generous negative space, one dominant element + supporting hierarchy.
//
// Real investment-bank covers are typography-only, so this is an abstract
// "stand-in" that needs to feel INSTITUTIONALLY CORRECT — never kitschy,
// never random-looking. Swiss modernism is the closest visual register:
// Armin Hofmann posters, Max Bill, Universal Studios 2019 identity.
//
// Craftsmanship (v2):
//  1. Three-element hierarchy: ONE large anchor circle (Deep navy filled),
//     ONE medium-weight ring (Accent blue hairline ring), ONE vertical rule
//     (Deep navy line) — exactly the kind of 3-object composition
//     Müller-Brockmann builds a poster around.
//  2. Constellation of micro-dots (the "crystallization" phase) scattered
//     with seeded jitter around but CONSTRAINED to a rule-of-thirds grid.
//  3. Positions rely on the golden-ratio / rule-of-thirds anchors so the
//     composition reads as deliberately authored, not procedurally random.
export function stochasticCrystallization(
  w: number,
  h: number,
  p: ArtPalette,
  seed: number,
): string {
  const rng = makeRng(seed * 9973 + 17);

  // Three hierarchy elements anchored to rule-of-thirds points.
  // Using 1/3 / 2/3 for rule-of-thirds; small seeded offset (< 8% of shortest
  // dim) keeps each placeholder unique without breaking the grid.
  const shortest = Math.min(w, h);
  const jitter = (base: number) => base + (rng() - 0.5) * shortest * 0.08;

  // ANCHOR: large filled navy disc, lower-left third (primary visual mass).
  const anchorX = jitter(w * 0.33);
  const anchorY = jitter(h * 0.66);
  const anchorR = shortest * 0.22;
  const anchor = `<circle cx="${anchorX.toFixed(1)}" cy="${anchorY.toFixed(1)}" r="${anchorR.toFixed(1)}" fill="${p.primary}" opacity="0.92"/>`;

  // COUNTERWEIGHT: medium GS-Blue HAIRLINE ring, upper-right third.
  // Hollow ring balances the anchor's solid mass without competing.
  const ringX = jitter(w * 0.68);
  const ringY = jitter(h * 0.32);
  const ringR = shortest * 0.14;
  const ring = `<circle cx="${ringX.toFixed(1)}" cy="${ringY.toFixed(1)}" r="${ringR.toFixed(1)}" fill="none" stroke="${p.accent}" stroke-width="1.8" opacity="0.88"/>`;

  // VERTICAL RULE: a single navy hairline running ~70% of the canvas height,
  // positioned at the first vertical third. Structural backbone.
  const ruleX = w * 0.33;
  const ruleTop = h * 0.15;
  const ruleBot = h * 0.85;
  const rule = `<line x1="${ruleX.toFixed(1)}" y1="${ruleTop.toFixed(1)}" x2="${ruleX.toFixed(1)}" y2="${ruleBot.toFixed(1)}" stroke="${p.primary}" stroke-width="0.6" opacity="0.38"/>`;

  // MICRO-DOT CONSTELLATION: the "crystallization" — 12 small navy dots,
  // seeded positions but confined to a 4×3 cell grid so they read as
  // crystallization nodes rather than scattered noise.
  const dots: string[] = [];
  const gridCols = 4;
  const gridRows = 3;
  for (let ri = 0; ri < gridRows; ri++) {
    for (let ci = 0; ci < gridCols; ci++) {
      // Tiny offset WITHIN each grid cell — dots stay near cell centers.
      const cellCx = (ci + 0.5) * (w / gridCols);
      const cellCy = (ri + 0.5) * (h / gridRows);
      const dx = (rng() - 0.5) * (w / gridCols) * 0.4;
      const dy = (rng() - 0.5) * (h / gridRows) * 0.4;
      const r = 1.2 + rng() * 1.5;
      // Skip dots that would land inside the anchor disc or the ring
      const cx = cellCx + dx, cy = cellCy + dy;
      const toAnchor = Math.hypot(cx - anchorX, cy - anchorY);
      const toRing = Math.hypot(cx - ringX, cy - ringY);
      if (toAnchor < anchorR + 6) continue;
      if (Math.abs(toRing - ringR) < 6) continue;
      const alpha = 0.25 + rng() * 0.25;
      dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${p.primary}" opacity="${alpha.toFixed(2)}"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="${w}" height="${h}" fill="${p.bg}"/>
    ${rule}
    ${dots.join('')}
    ${anchor}
    ${ring}
  </svg>`;
}

// ---------------------------------------------------------------------------
// 2. Field Dynamics (consulting-firm) — Tangent Silk
// ---------------------------------------------------------------------------
// Algorithm ported from the project's tangent-silk sketch `/sketches/tangent-silk/` —
// pure geometry, no noise, fully deterministic.
//
// Construction: two line segments (a short SOURCE + a long TARGET).
// For N steps i ∈ [0, N), draw a line from
//    A(t) = lerp(s1, s2, t)      on source,
//    B(t) = lerp(t1, t2, (1-t)^warp)   on target.
// The REVERSED mapping on target is what "twists" the strands and produces
// the parabolic envelope the eye reads as a curve — straight lines that
// together form a silken curved surface.
//
// Philosophy ("Field Dynamics" per algorithmic-art skill): invisible
// forces made visible. The force here is the reverse mapping — it exists
// only as the asymmetry between source and target traversal, yet it warps
// the entire composition into a living curve.
//
// Orientation: for the cover art panel (tall/square aspect), we rotate the
// default horizontal tangent-silk to VERTICAL — source segment at top,
// target at bottom, silk flowing TOP → BOTTOM across the panel.
export function fieldDynamics(
  w: number,
  h: number,
  p: ArtPalette,
  seed: number,
  opts: { coverMode?: boolean } = {},
): string {
  const rng = makeRng(seed * 7919 + 31);
  const hexLerpSilk = (a: string, b: string, k: number): string => {
    const ah = a.replace('#', ''); const bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
    const rr = Math.round(ar + (br - ar) * k);
    const rg = Math.round(ag + (bg - ag) * k);
    const rbl = Math.round(ab + (bb - ab) * k);
    return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rbl.toString(16).padStart(2, '0')}`;
  };

  const jx = (rng() - 0.5) * 0.012;
  const jy = (rng() - 0.5) * 0.012;

  // Cover mode: VERTICAL bowtie — source band sits on the TOP edge of
  // the panel, target band sits on the BOTTOM edge. The x-offset
  // between source center (~0.32) and target center (~0.68) keeps the
  // overall gesture diagonal. Dominant axis flips from horizontal to
  // vertical, which reads better next to a full-height left-side
  // title on a right-60% cover panel.
  // Non-cover (generic placeholder) keeps the original horizontal silk.
  const cover = !!opts.coverMode;
  // Cover: target extends to y=1.40 (off-panel, clipped by overflow).
  // Knot = midpoint of source y and target y = (0 + 1.40)/2 = 0.70,
  // which lines up with the title→subtitle transition on the left.
  // Ribbon pours from top edge, pinches at subtitle baseline, trails
  // off below the panel rather than splatting a symmetric fan at the
  // bottom edge. Title and knot now share a horizontal reading line.
  const s1x = w * ((cover ? 0.22 : 0.10) + jx);
  const s1y = h * ((cover ? 0.00 : 0.10) + jy);
  const s2x = w * ((cover ? 0.44 : 0.10) + jx);
  const s2y = h * ((cover ? 0.00 : 0.28) + jy);
  const t1x = w * ((cover ? 0.56 : 0.98) + jx);
  const t1y = h * ((cover ? 1.40 : 0.54) + jy);
  const t2x = w * ((cover ? 0.78 : 0.97) + jx);
  const t2y = h * ((cover ? 1.40 : 0.98) + jy);

  // Silk parameters. Cover mode uses more strands (finer density) with
  // lighter strokes so the stretched bundle still reads as a calm,
  // unified ribbon rather than a sparse set of long diagonals.
  const N: number = cover ? 36 : 28;
  const warp = 1.0;
  const strokeW = cover ? 0.70 : 0.85;
  const baseAlpha = cover ? 0.46 : 0.58;

  // Gentler color range — don't let primary go all the way to near-black.
  // Lerp endpoint is 68% toward primary (not 100%), producing a softer
  // "dark end" that blends naturally with accent's vivid blue instead of
  // hitting a harsh near-black contrast. Transition feels more natural.
  const darkEnd = hexLerpSilk(p.accent, p.primary, 0.68);

  const lines: string[] = [];
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1);
    const ax = s1x + (s2x - s1x) * t;
    const ay = s1y + (s2y - s1y) * t;
    const tm = Math.pow(1 - t, warp);
    const bx = t1x + (t2x - t1x) * tm;
    const by = t1y + (t2y - t1y) * tm;
    // Color lerp: accent (vivid blue) → darkEnd (soft deep-blue, not black)
    // The tighter gradient range makes transitions read as one family of
    // blues rather than a stark light→dark jump.
    const col = hexLerpSilk(p.accent, darkEnd, t);
    // Subtler V-shape alpha dip — 25% (was 40%) so the waist softens
    // without creating a visible "seam" where alpha drops sharply.
    const waist = 1 - 0.25 * Math.sin(t * Math.PI);
    const alpha = (baseAlpha * waist).toFixed(3);
    lines.push(`<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${col}" stroke-width="${strokeW}" stroke-opacity="${alpha}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="${w}" height="${h}" fill="${p.bg}"/>
    <g>${lines.join('')}</g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// 2b. Convergence Fan (consulting-firm cover only) — ribbon-twist string art
// ---------------------------------------------------------------------------
// Modeled on real consulting-firm webinar/report cover art: a bundle of hair-thin
// lines converging at a single point near the top, sweeping downward in a
// pronounced S-curve / ribbon-twist shape — as if a silk scarf were hanging
// with a half-twist.
//
// Geometry (important — previous version failed because curvature was too
// small, so it read as a flat radial burst):
//   1. Source: single point at the top of the canvas, ~60% from left.
//   2. Target arc: a long quadratic Bezier sweeping from bottom-left through
//      the lower-right corner and up to the right edge — target points are
//      distributed along this arc so the BOTTOM ENVELOPE of the bundle is
//      naturally curved.
//   3. Each individual stroke is itself a strongly-curved quadratic Bezier:
//      control point displaced perpendicular to the S→T line by ~18% of the
//      line's length, ALL in the same direction (to the LEFT of S→T when
//      walking from S to T). Uniform-direction offset is what gives the
//      bundle its coherent ribbon-twist look instead of a noisy cloud.
//   4. Strokes curve so the LEFT envelope of the bundle pulls inward (concave)
//      while the RIGHT envelope bulges outward (convex) — the signature
//      "ribbon" silhouette.
//
// Palette: vivid-blue → pale lavender-blue, then each stroke lerped 55% toward
// white so the whole fan reads as pastel, not saturated (reference art is
// almost watercolor-pale on bright white paper).
export function convergenceFan(
  w: number,
  h: number,
  p: ArtPalette,
  seed: number,
): string {
  const rng = makeRng(seed * 5381 + 17);
  const hexLerp = (a: string, b: string, k: number): string => {
    const ah = a.replace('#', ''); const bh = b.replace('#', '');
    const ar = parseInt(ah.slice(0, 2), 16), ag = parseInt(ah.slice(2, 4), 16), ab = parseInt(ah.slice(4, 6), 16);
    const br = parseInt(bh.slice(0, 2), 16), bg = parseInt(bh.slice(2, 4), 16), bb = parseInt(bh.slice(4, 6), 16);
    const rr = Math.round(ar + (br - ar) * k);
    const rg = Math.round(ag + (bg - ag) * k);
    const rbl = Math.round(ab + (bb - ab) * k);
    return `#${rr.toString(16).padStart(2, '0')}${rg.toString(16).padStart(2, '0')}${rbl.toString(16).padStart(2, '0')}`;
  };

  // Convergence point — at top edge, ~60% from left of the art panel.
  // Tiny negative y so the bundle reads as "coming from beyond the frame."
  const sx = w * 0.60;
  const sy = h * -0.01;

  // Target arc — sweeps from bottom-left, bulges through bottom-right, and
  // rises to the right edge near mid-height. Target points distributed along
  // this arc drive the bundle's bottom envelope.
  const a0x = w * 0.08, a0y = h * 1.02; // arc start: bottom-left
  const a2x = w * 1.05, a2y = h * 0.35; // arc end: right edge, upper-mid
  const acx = w * 1.20, acy = h * 1.15; // arc control: pulled far out bottom-right

  const pointOnArc = (t: number): [number, number] => {
    const mt = 1 - t;
    const x = mt * mt * a0x + 2 * mt * t * acx + t * t * a2x;
    const y = mt * mt * a0y + 2 * mt * t * acy + t * t * a2y;
    return [x, y];
  };

  const N = 96;
  const strokeW = 0.55;
  const baseOpacity = 0.42;

  // Pale lavender-blue endpoint — reference art hue.
  const paleEnd = '#a8b5dd';
  const accent = p.accent;

  const paths: string[] = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const [tx, ty] = pointOnArc(t);

    // Midpoint between source and target.
    const mx = sx + (tx - sx) * 0.5;
    const my = sy + (ty - sy) * 0.5;

    // Perpendicular vector to S→T. (px, py) points to the LEFT of the line
    // direction (when walking from S toward T). We ALWAYS offset in this
    // direction so every strand bows the same way — the whole bundle twists
    // as one ribbon instead of looking like a noisy spray.
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const px = -dy / len;
    const py = dx / len;

    // Curvature amount: proportional to line length, so longer strands bow
    // more. The `curveAmount` multiplier is the key variable — 0.18 produces
    // a visible ribbon twist without the strands collapsing into a knot.
    // A tiny per-line jitter (0-4% of length) breaks exact symmetry so the
    // bundle feels hand-drawn rather than mathematical.
    const curveAmount = 0.18 + rng() * 0.04;
    const shift = len * curveAmount;
    const cx = mx + px * shift;
    const cy = my + py * shift;

    // Color: accent vivid blue → pale lavender-blue, then lerp 55% toward
    // white so the whole family reads pastel (reference art is not saturated).
    const hue = hexLerp(accent, paleEnd, t);
    const col = hexLerp(hue, '#ffffff', 0.55);

    // Slightly lower opacity for the first and last lines (bundle edges) so
    // the fan fades into the paper at its extremes instead of hard-stopping.
    const edge = Math.min(t, 1 - t);          // 0 at edges, 0.5 at middle
    const opacity = baseOpacity * (0.55 + 0.9 * edge * 2); // 0.55× at edge, 1.45× at mid (capped below)
    const clamped = Math.min(0.55, opacity).toFixed(3);

    paths.push(
      `<path d="M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="${col}" stroke-width="${strokeW}" stroke-opacity="${clamped}" fill="none"/>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <rect width="${w}" height="${h}" fill="#ffffff"/>
    <g>${paths.join('')}</g>
  </svg>`;
}

// ---------------------------------------------------------------------------
// 3. Organic Turbulence (private-equity) — atmospheric color-field, v2
// ---------------------------------------------------------------------------
// Philosophy: "Chaos constrained by natural law, order from disorder."
// Rothko color field as photography stand-in: such PE decks use
// commissioned architectural photography on covers; our abstract version
// has to carry the same atmospheric gravitas through paint, not pattern.
//
// Craftsmanship (v2):
//  1. RADIAL atmospheric gradient from lower-center radiating warmth — like
//     a light source on a monolithic building (private-equity's photo subjects).
//  2. TWO soft horizontal bands (kept from v1, but lower opacity + broader
//     diffusion) suggest a horizon or floor-plate division.
//  3. A subtle HAZE layer (very-low-opacity SVG noise via feTurbulence)
//     adds film-grain texture so the surface reads as a photograph rather
//     than flat paint.
//  4. No hard edges anywhere. Every element diffused with Gaussian blur.
export function organicTurbulence(
  w: number,
  h: number,
  p: ArtPalette,
  seed: number,
): string {
  const rng = makeRng(seed * 6151 + 23);

  const filterBlur = `turbblur-${seed}`;
  const filterGrain = `turbgrain-${seed}`;
  const radialId = `turbrad-${seed}`;
  const topBandId = `turbtop-${seed}`;
  const botBandId = `turbbot-${seed}`;

  // Horizontal bands: seeded vertical position + height for per-slide variety
  const topY = h * (0.14 + rng() * 0.08);
  const topHeight = h * (0.30 + rng() * 0.08);
  const bottomY = h * (0.58 + rng() * 0.08);
  const bottomHeight = h * (0.24 + rng() * 0.06);

  // Radial gradient anchor — warmth rising from lower-center, like light
  // glancing off a marble floor. Position jittered slightly per seed.
  const radCx = 40 + rng() * 20;   // 40-60% in horizontal
  const radCy = 70 + rng() * 15;   // 70-85% in vertical

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <defs>
      <filter id="${filterBlur}" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="${(Math.min(w, h) * 0.018).toFixed(1)}"/>
      </filter>
      <filter id="${filterGrain}" x="0%" y="0%" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.8" numOctaves="2" seed="${seed}"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0.91  0 0 0 0 0.88  0 0 0 0 0.82  0 0 0 0.05 0"/>
      </filter>
      <radialGradient id="${radialId}" cx="${radCx}%" cy="${radCy}%" r="80%">
        <stop offset="0%" stop-color="${p.primary}" stop-opacity="0.16"/>
        <stop offset="45%" stop-color="${p.primary}" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="${p.primary}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="${topBandId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.primary}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${p.primary}" stop-opacity="0.09"/>
        <stop offset="100%" stop-color="${p.primary}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="${botBandId}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${p.accent}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${p.accent}" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="${p.accent}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <!-- Base near-black -->
    <rect width="${w}" height="${h}" fill="${p.bg}"/>
    <!-- Radial warmth (photograph stand-in: light-on-marble feel) -->
    <rect width="${w}" height="${h}" fill="url(#${radialId})"/>
    <!-- Horizontal soft bands (horizon + floor-plate) -->
    <rect x="0" y="${topY.toFixed(1)}" width="${w}" height="${topHeight.toFixed(1)}" fill="url(#${topBandId})" filter="url(#${filterBlur})"/>
    <rect x="0" y="${bottomY.toFixed(1)}" width="${w}" height="${bottomHeight.toFixed(1)}" fill="url(#${botBandId})" filter="url(#${filterBlur})"/>
    <!-- Film grain — very low opacity, lives on top to simulate photo surface -->
    <rect width="${w}" height="${h}" filter="url(#${filterGrain})" opacity="0.6"/>
  </svg>`;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Build an ArtPalette from a Theme's runtime colors. Falls back to a neutral
 * gray palette if no scene applies — so non-Analyst themes can still call
 * this without error (they just get a generic placeholder).
 */
export function paletteFromTheme(primary: string, accent: string, muted: string, bg: string): ArtPalette {
  return { primary, accent, muted, bg };
}

/**
 * Deterministic string hash → non-negative integer, usable as LCG seed.
 * Used by placeholder callers that don't thread slideIndex but DO have a
 * unique-per-slide string (title + prompt) they can hash. djb2-style.
 */
export function hashSeed(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

// ---------------------------------------------------------------------------
// Scene-level STRUCTURAL panel composition
// ---------------------------------------------------------------------------
// Each Analyst colorway composes specific page types (cover / section-break /
// closing) differently — mirroring real three institutional registers deck
// conventions. Rather than modifying layout composers (`renderCover`, etc.),
// we inject absolutely-positioned STRUCTURAL panels into the decoration layer:
//
//   - color-field: solid-colored full-region panel (investment-bank section dividers,
//     consulting-firm right-60 vivid-blue panel)
//   - art-panel: algorithmic-art SVG filling a region (consulting-firm cover right-60,
//     private-equity cover full-bleed)
//   - corner-mark: tiny branded square in a corner (investment-bank bottom-right logo)
//
// A companion CSS block in globals.css pushes layout content out of the art
// region via `padding-right: 60%` (consulting-firm) etc.
//
// Wordmark text "LASCA" is a PLACEHOLDER — pro users will eventually swap it
// for their own firm name via settings. Centralized here so the swap is
// one-point.

/** Placeholder firm name embedded in scene marks. Pro users customize later. */
const SCENE_WORDMARK = 'LASCA';

type PanelRegion = 'full' | 'right-60' | 'left-40' | 'top-40' | 'bottom-60';
type PanelColor  = 'primary' | 'accent' | 'muted';
type ArtAesthetic = 'stochasticCrystallization' | 'fieldDynamics' | 'organicTurbulence' | 'convergenceFan';

interface ColorFieldPanel {
  type: 'color-field';
  region: PanelRegion;
  color: PanelColor;
  opacity?: number;
}
interface ArtPanel {
  type: 'art-panel';
  region: PanelRegion;
  aesthetic: ArtAesthetic;
  opacity?: number;
}
interface CornerMarkPanel {
  type: 'corner-mark';
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  label: string;
  size?: number;
  color: PanelColor;
  textColor?: string;
}
type Panel = ColorFieldPanel | ArtPanel | CornerMarkPanel;

/**
 * Per-scene, per-layout composition specs. Used by renderScenePanels() to
 * compose structural panels for cover / section-break / closing pages.
 * Non-listed (variant, layout) pairs get no panels — layout renders as normal.
 */
const SCENE_PANELS: Record<string, Record<string, Panel[]>> = {
  // ── IB LIGHT ─────────────────────────────────────────────────
  //   cover + closing: small blue-square with "LASCA" text inset
  //   section-break:  full-bleed navy color field (title flips white via CSS)
  light: {
    cover: [
      { type: 'corner-mark', corner: 'bottom-right', label: SCENE_WORDMARK, color: 'primary', textColor: '#ffffff', size: 22 },
    ],
    'section-break': [
      { type: 'color-field', region: 'full', color: 'primary', opacity: 1 },
    ],
    closing: [
      { type: 'corner-mark', corner: 'bottom-right', label: SCENE_WORDMARK, color: 'primary', textColor: '#ffffff', size: 22 },
    ],
  },
  // ── CONSULTING MIST ─────────────────────────────────────────────────
  //   cover:         right 60% = convergenceFan (modeled on real consulting-firm
  //                  webinar cover art — fine-line ribbon converging from
  //                  a single point on a white ground). Replaces the old
  //                  fieldDynamics diagonal silk, which was the wrong
  //                  geometric language for a cover.
  //   section-break: right 60% = full-height vivid-blue color field
  mist: {
    // Cover intentionally has no art panel. We tried six different
    // algorithmic-line-art geometries (bowtie, fan, flow-field, vertical
    // bowtie with knot at subtitle baseline, etc.) and every one
    // produced a convergence focal point that competed with the title.
    // Cover decoration is now handled purely by editorial chrome in
    // renderSlide.ts (top hairline rule + small vivid-blue corner mark).
    cover: [],
    'section-break': [
      { type: 'color-field', region: 'right-60', color: 'accent', opacity: 1 },
    ],
  },
  // ── PE DARK ────────────────────────────────────────────────
  //   cover + section-break: full-bleed organicTurbulence as photography
  //     stand-in (such PE decks use architectural photography;
  //     our algorithmic art fills the same compositional role).
  //     Opacity 0.6 by design — art IS the composition.
  dark: {
    cover: [
      { type: 'art-panel', region: 'full', aesthetic: 'organicTurbulence', opacity: 0.6 },
    ],
    'section-break': [
      { type: 'art-panel', region: 'full', aesthetic: 'organicTurbulence', opacity: 0.65 },
    ],
  },
};

function regionToStyle(region: PanelRegion): string {
  switch (region) {
    case 'full':      return 'inset:0;';
    case 'right-60':  return 'top:0;bottom:0;right:0;width:60%;';
    case 'left-40':   return 'top:0;bottom:0;left:0;width:40%;';
    case 'top-40':    return 'top:0;left:0;right:0;height:40%;';
    case 'bottom-60': return 'bottom:0;left:0;right:0;height:60%;';
  }
}

function resolvePanelColor(ref: PanelColor, p: ArtPalette): string {
  if (ref === 'primary') return p.primary;
  if (ref === 'accent')  return p.accent;
  return p.muted;
}

function renderColorField(panel: ColorFieldPanel, p: ArtPalette): string {
  const style = regionToStyle(panel.region);
  const op = panel.opacity ?? 1;
  return `<div style="position:absolute;${style}z-index:0;background:${resolvePanelColor(panel.color, p)};opacity:${op};pointer-events:none;"></div>`;
}

function renderArtPanel(
  panel: ArtPanel,
  p: ArtPalette,
  seed: number,
  opts: { coverMode?: boolean } = {},
): string {
  const style = regionToStyle(panel.region);
  const op = panel.opacity ?? 1;
  // For non-full regions we need specific width/height passed to the generator
  // — we use 1000×560 as a canonical canvas and the panel SVG scales via viewBox.
  const canvasW = 1000;
  const canvasH = 560;
  let svg = '';
  switch (panel.aesthetic) {
    case 'stochasticCrystallization': svg = stochasticCrystallization(canvasW, canvasH, p, seed); break;
    case 'fieldDynamics':             svg = fieldDynamics(canvasW, canvasH, p, seed, opts); break;
    case 'organicTurbulence':         svg = organicTurbulence(canvasW, canvasH, p, seed); break;
    case 'convergenceFan':            svg = convergenceFan(canvasW, canvasH, p, seed); break;
  }
  return `<div style="position:absolute;${style}z-index:0;opacity:${op};pointer-events:none;overflow:hidden;">${svg}</div>`;
}

function renderCornerMark(panel: CornerMarkPanel, p: ArtPalette): string {
  const size = panel.size ?? 22;
  const bg = resolvePanelColor(panel.color, p);
  const text = panel.textColor ?? '#ffffff';
  const cornerStyle: Record<typeof panel.corner, string> = {
    'top-left':     `top:18px;left:28px;`,
    'top-right':    `top:18px;right:28px;`,
    'bottom-left':  `bottom:18px;left:28px;`,
    'bottom-right': `bottom:18px;right:28px;`,
  };
  // Tiny serif-style wordmark inset in the square — mirrors investment-bank's
  // blue-box logo that sits in the bottom-right of every cover.
  return `<div style="position:absolute;${cornerStyle[panel.corner]}width:${size}px;height:${size}px;background:${bg};z-index:2;pointer-events:none;display:flex;align-items:center;justify-content:center;font-size:6.5px;letter-spacing:0.14em;color:${text};font-weight:700;text-transform:uppercase;font-family:sans-serif;">${panel.label}</div>`;
}

/**
 * Compose the structural panel layer for a slide. Returns concatenated HTML
 * of zero or more absolutely-positioned panels. When variant + layout combo
 * has no entry in SCENE_PANELS, returns '' (no change to decoration).
 */
export function renderScenePanels(
  theme: Theme,
  layout: string,
  palette: ArtPalette,
  seed: number,
): string {
  const variant = getSceneVariant(theme);
  if (!variant) return '';
  const spec = SCENE_PANELS[variant]?.[layout];
  if (!spec || spec.length === 0) return '';

  // mist + cover: the CSS already forces the slide bg to white on this page
  // (globals.css). The art panel's internal bg rect therefore has to paint
  // white too (not the theme's cool gray #f0f2f6) or a hard left/right seam
  // appears where the two halves meet. Also lerp accent 25% toward white so
  // the line art reads pastel on the unified white ground.
  const isMistCover = variant === 'mist' && layout === 'cover';
  const effectivePalette: ArtPalette = isMistCover
    ? { ...palette, bg: '#ffffff', accent: mixHex(palette.accent, '#ffffff', 0.25) }
    : palette;

  return spec.map(panel => {
    switch (panel.type) {
      case 'color-field': return renderColorField(panel, effectivePalette);
      case 'art-panel':   return renderArtPanel(panel, effectivePalette, seed, { coverMode: isMistCover });
      case 'corner-mark': return renderCornerMark(panel, effectivePalette);
      default:            return '';
    }
  }).join('');
}

function mixHex(a: string, b: string, k: number): string {
  const parse = (s: string): [number, number, number] => {
    const h = s.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * k);
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${hex(mix(ar, br))}${hex(mix(ag, bg))}${hex(mix(ab, bb))}`;
}

// ---------------------------------------------------------------------------
// Scene-level backdrop art (DEPRECATED — was the wrong approach)
// ---------------------------------------------------------------------------
// Text-light layouts (cover, section-break, quote, big-number) get the scene's
// algorithmic-art aesthetic as a subtle full-bleed BACKDROP under the text
// content. Text-dense layouts (two-column, three-cards, agenda, title-body)
// stay clean — too much art behind text degrades legibility.
//
// The backdrop sits in position:absolute at z-index:0 (below the layout's
// natural flow content which reads at the default stacking context) — so the
// layout renderers don't need to know about it. Caller injects the returned
// HTML into the slide wrapper alongside motif decoration.

interface BackdropConfig {
  /** 0-1 visual weight of the art vs text legibility */
  opacity: number;
  /** Layout category this config applies to */
  category: 'hero-bold' | 'hero-soft' | 'corner-accent' | 'none';
}

/** Per-layout backdrop policy. Layouts not listed get no backdrop. */
function getBackdropPolicy(layout: string): BackdropConfig {
  // Hero-bold: text is a single sparse statement, art can dominate
  if (layout === 'section-break') return { opacity: 0.55, category: 'hero-bold' };
  if (layout === 'cover')         return { opacity: 0.32, category: 'hero-bold' };
  if (layout === 'report-cover')  return { opacity: 0.28, category: 'hero-bold' };
  // Hero-soft: text is prominent but sparse — keep art visible but restrained
  if (layout === 'quote')         return { opacity: 0.22, category: 'hero-soft' };
  if (layout === 'big-number')    return { opacity: 0.2,  category: 'hero-soft' };
  // Corner-accent: text is dense, only a small art flourish in a corner
  if (layout === 'agenda')        return { opacity: 0.3,  category: 'corner-accent' };
  // Everything else: no backdrop (would compete with content)
  return { opacity: 0, category: 'none' };
}

/**
 * Build the backdrop art layer HTML for a slide. Returns '' when:
 *  - theme has no scene (non-Analyst themes)
 *  - layout isn't in the backdrop-eligible category
 *
 * Injected by renderThemeDecoration alongside motif chrome. Uses the layout
 * name + theme as the seed so each (scene, layout) pair is deterministic but
 * different (a cover looks different from a section-break in the same scene).
 */
export function getSceneBackdropArt(
  theme: Theme,
  layout: string,
  w: number,
  h: number,
  palette: ArtPalette,
): string {
  const variant = getSceneVariant(theme);
  if (!variant) return '';
  const policy = getBackdropPolicy(layout);
  if (policy.category === 'none') return '';

  const seed = hashSeed(`backdrop:${theme}:${layout}`);
  const artSvg = getArtPlaceholder(theme, w, h, seed, palette);
  if (!artSvg) return '';

  if (policy.category === 'corner-accent') {
    // Small corner bloom — top-right, sized ~25% of canvas, so text stays clear
    const aw = Math.round(w * 0.28);
    const ah = Math.round(h * 0.42);
    return `<div style="position:absolute; top:0; right:0; width:${aw}px; height:${ah}px; z-index:0; opacity:${policy.opacity}; pointer-events:none; overflow:hidden;">${artSvg}</div>`;
  }

  // Hero full-bleed
  return `<div style="position:absolute; inset:0; z-index:0; opacity:${policy.opacity}; pointer-events:none;">${artSvg}</div>`;
}

/**
 * Return a self-contained SVG placeholder string for a given theme, sized to
 * (w × h), with a seed (use slideIndex) for deterministic output.
 *
 * Returns `''` for non-scene themes — caller is expected to keep existing
 * emoji-in-dashed-box fallback for those cases (backward compat).
 */
export function getArtPlaceholder(
  theme: Theme,
  w: number,
  h: number,
  seed: number,
  palette: ArtPalette,
): string {
  const variant = getSceneVariant(theme);
  const s = seed + 1; // avoid seed=0 pathology in LCG
  switch (variant) {
    case 'light': return stochasticCrystallization(w, h, palette, s);
    case 'mist':  return fieldDynamics(w, h, palette, s);
    case 'dark':  return organicTurbulence(w, h, palette, s);
    default:      return '';
  }
}
