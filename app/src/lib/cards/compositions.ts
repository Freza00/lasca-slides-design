// ============================================================================
// Lasca — Card compositions (canonical 18)
// ============================================================================
// 18 canonical compositions in 6 categories:
//   full:    full-bleed, full-center
//   split:   split-equal, split-media, split-60-40, split-40-60
//   stack:   stack-text-media, stack-media-text   (NEW — vertical 2-slot)
//   grid:    grid-2col, grid-3col, grid-4col, grid-2x2
//   bento:   bento-1+2, bento-1+3, bento-1+4, bento-2x3
//   banner:  hero-grid, title-grid
//
// Chrome (card bg/radius/shadow) is a THEME decision via ThemeConfig.cardChrome —
// NOT a composition decision. A composition here only defines CSS grid structure.
//
// Compositions with variable slot counts (`variableSlots`) derive slot names
// and, where applicable, gridTemplate at render time from the actual card
// count. See renderCardCanvas for the expansion rules.
// ============================================================================

import type { Composition } from './types';
import type { Layout } from '../types';

// NOTE: grid-template-areas uses single-quoted CSS strings so the value
// stays inside the outer style="..." attribute on the rendered element.
export const COMPOSITIONS: Record<string, Composition> = {
  // --- full ---------------------------------------------------------------
  'full-bleed': {
    id: 'full-bleed',
    mode: 'full-bleed',
    gridTemplate: 'grid-template-columns:1fr; grid-template-rows:1fr;',
    slots: ['a'],
    largeSlots: ['a'],
    gap: 0,
  },
  'full-center': {
    id: 'full-center',
    mode: 'full-center',
    gridTemplate: 'grid-template-columns:1fr; grid-template-rows:1fr;',
    slots: ['a'],
    largeSlots: ['a'],
    gap: 0,
  },

  // --- split --------------------------------------------------------------
  'split-equal': {
    id: 'split-equal',
    mode: 'split',
    gridTemplate: 'grid-template-columns:1fr 1fr; grid-template-rows:1fr;',
    slots: ['a', 'b'],
    gap: 16,
  },
  'split-media': {
    id: 'split-media',
    mode: 'split',
    // grid template generated at render-time so the media card can land on
    // left or right based on card order (media-role card anchors the image
    // column). No gap — image spans edge-to-edge with text padding.
    slots: ['a', 'b'],
    gap: 0,
  },
  'split-60-40': {
    id: 'split-60-40',
    mode: 'split',
    gridTemplate: 'grid-template-columns:1.5fr 1fr; grid-template-rows:1fr;',
    slots: ['a', 'b'],
    gap: 16,
  },
  'split-40-60': {
    id: 'split-40-60',
    mode: 'split',
    gridTemplate: 'grid-template-columns:1fr 1.5fr; grid-template-rows:1fr;',
    slots: ['a', 'b'],
    gap: 16,
  },

  // --- stack (NEW — vertical 2-slot) --------------------------------------
  // Text-top + media-bottom (or reverse). Row heights are asymmetric so the
  // text zone sizes to its content and the media fills the remainder.
  'stack-text-media': {
    id: 'stack-text-media',
    mode: 'stack',
    gridTemplate: "grid-template-columns:1fr; grid-template-rows:auto 1fr; grid-template-areas:'a' 'b';",
    slots: ['a', 'b'],
    gap: 16,
  },
  'stack-media-text': {
    id: 'stack-media-text',
    mode: 'stack',
    gridTemplate: "grid-template-columns:1fr; grid-template-rows:1fr auto; grid-template-areas:'a' 'b';",
    slots: ['a', 'b'],
    gap: 16,
  },

  // --- grid ---------------------------------------------------------------
  'grid-2col': {
    id: 'grid-2col',
    mode: 'grid',
    gridTemplate: 'grid-template-columns:1fr 1fr; grid-auto-rows:1fr;',
    slots: ['a', 'b', 'c', 'd'],
    gap: 16,
    variableSlots: true,
  },
  'grid-3col': {
    id: 'grid-3col',
    mode: 'grid',
    gridTemplate: 'grid-template-columns:1fr 1fr 1fr; grid-auto-rows:1fr;',
    slots: ['a', 'b', 'c', 'd', 'e', 'f'],
    gap: 14,
    variableSlots: true,
  },
  'grid-4col': {
    id: 'grid-4col',
    mode: 'grid',
    gridTemplate: 'grid-template-columns:1fr 1fr 1fr 1fr; grid-auto-rows:1fr;',
    slots: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    gap: 14,
    variableSlots: true,
  },
  // 2×2 comparison grid — fixed 4 slots, not variable. Useful for matrix-style
  // content where each cell has equal emphasis.
  'grid-2x2': {
    id: 'grid-2x2',
    mode: 'grid',
    gridTemplate: 'grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr;',
    slots: ['a', 'b', 'c', 'd'],
    gap: 14,
  },

  // --- bento (asymmetric; hero tile in slot 'a') --------------------------
  'bento-1+2': {
    id: 'bento-1+2',
    mode: 'bento',
    gridTemplate:
      "grid-template-columns:1.6fr 1fr; grid-template-rows:1fr 1fr; grid-template-areas:'a b' 'a c';",
    slots: ['a', 'b', 'c'],
    largeSlots: ['a'],
    gap: 14,
  },
  'bento-1+3': {
    id: 'bento-1+3',
    mode: 'bento',
    // Row heights uniform 1fr — earlier 0.8fr last row compressed cards below
    // their content min, silently clipping body text. Visual hierarchy comes
    // from `largeSlots` (slot 'a' spans 2 rows), not shorter footers.
    gridTemplate:
      "grid-template-columns:1.6fr 1fr; grid-template-rows:1fr 1fr 1fr; grid-template-areas:'a b' 'a c' 'd d';",
    slots: ['a', 'b', 'c', 'd'],
    largeSlots: ['a'],
    gap: 14,
  },
  'bento-1+4': {
    id: 'bento-1+4',
    mode: 'bento',
    gridTemplate:
      "grid-template-columns:1.6fr 1fr; grid-template-rows:1fr 1fr 1fr; grid-template-areas:'a b' 'a c' 'd e';",
    slots: ['a', 'b', 'c', 'd', 'e'],
    largeSlots: ['a'],
    gap: 14,
  },
  'bento-2x3': {
    id: 'bento-2x3',
    mode: 'bento',
    gridTemplate:
      "grid-template-columns:1fr 1fr 1fr; grid-template-rows:1fr 1fr; grid-template-areas:'a b c' 'd e f';",
    slots: ['a', 'b', 'c', 'd', 'e', 'f'],
    gap: 14,
  },

  // --- chart-split (cards sub-grid + dedicated chart region) --------------
  // Used when a slide has BOTH chart and non-chart items. Non-chart cards
  // go into a 'cards' slot as a `card-group` (sub-grid), the chart occupies
  // its own 'chart' slot — chart is no longer cramped into a peer tile.
  // Adapter picks split (landscape, ≤2 non-chart) vs stack (portrait, ≥3).
  'split-cards-chart': {
    id: 'split-cards-chart',
    mode: 'split-chart',
    gridTemplate:
      "grid-template-columns:3fr 2fr; grid-template-rows:1fr; grid-template-areas:'cards chart';",
    slots: ['cards', 'chart'],
    largeSlots: ['cards'],
    gap: 16,
  },
  'stack-cards-chart': {
    id: 'stack-cards-chart',
    mode: 'stack-chart',
    gridTemplate:
      "grid-template-columns:1fr; grid-template-rows:3fr 2fr; grid-template-areas:'cards' 'chart';",
    slots: ['cards', 'chart'],
    largeSlots: ['cards'],
    gap: 16,
  },

  // --- banner (hero/title adapts to card count) ---------------------------
  // First card = the hero/title zone. Remaining cards fill tile slots.
  'hero-grid': {
    id: 'hero-grid',
    mode: 'hero-grid',
    // gridTemplate synthesized at render-time based on tile count (2-4).
    slots: ['hero', 'a', 'b', 'c', 'd'],
    gap: 16,
  },
  'title-grid': {
    id: 'title-grid',
    mode: 'title-grid',
    // gridTemplate synthesized at render-time based on tile count (1-6).
    slots: ['title', 'a', 'b', 'c', 'd', 'e', 'f'],
    gap: 14,
  },
};

/** Generate N slot names starting at slotPrefix (e.g. 'a' → ['a','b','c']). */
export function generateSlots(n: number, prefix = 'a'): string[] {
  const start = prefix.charCodeAt(0);
  const slots: string[] = [];
  for (let i = 0; i < n; i++) slots.push(String.fromCharCode(start + i));
  return slots;
}

/** Pick bento variant by tile count. n=1 collapses to a single-slot
 *  composition — a 3-slot bento with one card looks like an empty canvas
 *  with a card stuck in the corner. Caller decides bleed vs centered via
 *  pickComposition. */
export function pickBentoComposition(itemCount: number, opts: { dense?: boolean } = {}): string {
  const n = Math.min(Math.max(itemCount, 1), 6) || 3;
  if (n <= 1) return 'full-center';
  if (n === 2) return 'split-equal';
  // Dense content (long body per card) overflows the small slots in 1+3 /
  // 1+4 / 2x3. Cap at bento-1+2 so each card has a meaningful slot height;
  // adapt.ts slices items to the composition's slot count, so excess cards
  // get dropped — a cleaner failure than rendering with cropped text.
  if (opts.dense) return 'bento-1+2';
  if (n === 3) return 'bento-1+2';
  if (n === 4) return 'bento-1+3';
  if (n === 5) return 'bento-1+4';
  return 'bento-2x3';
}

/** Pick the canonical compositionId for a legacy Layout + tile count.
 *
 *  When `itemCount` is too small for the layout's natural multi-slot
 *  composition, fall back to a single-slot composition. Without this guard,
 *  a `featured-grid` with 1 tile would render as `hero-grid` with empty
 *  cells — title at the top, one tiny card in the corner, 60–70% empty
 *  canvas. The fallback target depends on content kind: text/list layouts
 *  → `full-center` (centered with padding), data/chart layouts →
 *  `full-bleed` (edge-to-edge). */
function pickCompositionImpl(
  layout: Layout,
  itemCount: number,
  columnsHint?: number,
  opts: { dense?: boolean } = {},
): string {
  const n = Math.max(itemCount, 0);
  switch (layout) {
    case 'bento':
      return pickBentoComposition(n, opts);
    case 'three-cards':
      if (n <= 1) return 'full-center';
      if (n === 2) return 'grid-2col';
      if (opts.dense) return 'grid-2col';
      return 'grid-3col';
    case 'stat-row':
      if (n <= 1) return 'full-bleed';
      if (n === 2) return 'grid-2col';
      if (n === 3) return 'grid-3col';
      return 'grid-4col';
    case 'dashboard': {
      if (n <= 1) return 'full-bleed';
      if (n === 2) return 'grid-2col';
      if (n === 3) return 'grid-3col';
      // n=4: force 2x2 — 3+1 leaves a lonely card in the second row.
      if (n === 4) return 'grid-2x2';
      // n=5: bento-1+4 gives one hero tile + 4 companions with no empty
      // cells. Alternative would be grid-3col with 3+2 and a visible hole
      // in the bottom row, which reads as broken rather than intentional.
      if (n === 5) return 'bento-1+4';
      // n=6: bento-2x3 packs all 6 equally, no hero emphasis. Beyond 6 we
      // fall back to a denser grid — too many KPIs for a single slide anyway.
      if (n === 6) return 'bento-2x3';
      return columnsHint === 2 ? 'grid-2col' : 'grid-3col';
    }
    case 'grid-cards': {
      if (n <= 1) return 'full-center';
      if (n === 2) return 'grid-2col';
      // n=4: prefer 2x2 unless caller explicitly asks for a single row of 4.
      if (n === 4 && columnsHint !== 4) return 'grid-2x2';
      const cols = columnsHint ?? Math.min(n, 4);
      if (cols === 2) return 'grid-2col';
      if (cols === 4) return 'grid-4col';
      return 'grid-3col';
    }
    case 'featured-grid':
      // hero-grid synthesizes to hero + N tiles. With 0–1 tiles the bottom
      // tile row becomes a single empty cell stretching across the canvas.
      // Counts include only tiles (the hero is added by the adapter).
      if (n <= 1) return 'full-center';
      // Dense tiles in hero-grid get squeezed into the bottom row — at 4+
      // tiles each tile is <120px tall and can't hold a title + body.
      // Fall back to split-equal so the hero text and a single richer tile
      // each get half the canvas; excess tiles are dropped by the adapter.
      if (opts.dense && n >= 3) return 'split-equal';
      return 'hero-grid';
    case 'title-bento':
      // title-grid is title column + tile grid. Counts here are user cards
      // (excluding the synthetic title card). With 0–1 cards the tile zone
      // is mostly empty — collapse to a single-slot title page.
      if (n <= 1) return 'full-center';
      if (opts.dense && n >= 3) return 'split-equal';
      return 'title-grid';

    // single-slot vertical-center
    case 'cover':
    case 'section-break':
    case 'quote':
    case 'device-mockup':
    case 'title-body':
      return 'full-center';

    // single-slot full-bleed (dispatched by role inside the renderer)
    case 'big-number':
    case 'table':
    case 'icon-list':
    case 'agenda':
    case 'stacked-bars':
    case 'timeline':
    case 'flowchart':
    case 'funnel':
    case 'pyramid':
    case 'steps':
    case 'matrix':
    case 'versus':
    case 'venn':
    case 'bullseye':
    case 'cycle':
    case 'hub-spoke':
    case 'image':
      return 'full-bleed';

    // two-pane
    case 'two-column':
      return 'split-equal';
    case 'split-image':
      return 'split-media';

    // business-ish layouts aliased onto grids
    case 'team':
      if (n <= 1) return 'full-center';
      if (n === 2) return 'grid-2col';
      // n=4: 2x2 instead of 3+1 (one lonely member on row 2).
      if (n === 4) return 'grid-2x2';
      return 'grid-3col';
    case 'logo-wall':
      if (n <= 1) return 'full-bleed';
      if (n === 2) return 'grid-2col';
      if (n <= 4) return 'grid-4col';
      if (n <= 6) return 'grid-3col';
      return 'grid-4col';
    case 'pricing':
      if (n <= 1) return 'full-center';
      if (n === 2) return 'grid-2col';
      if (n <= 3) return 'grid-3col';
      return 'grid-4col';

    default:
      return pickBentoComposition(n, opts);
  }
}

/** Wrapper around pickCompositionImpl that emits a LASCA_TRACE line on every
 *  call. Used to audit whether composition variety is the real monotony lever
 *  in investment-research decks — e.g., if most pages resolve to 'full-center'
 *  despite inferLayout picking diverse layouts, pickComposition is the choke
 *  point, not the scoring function. Server-only; browser bundles strip the
 *  branch since LASCA_TRACE is not a NEXT_PUBLIC_ var. */
export function pickComposition(
  layout: Layout,
  itemCount: number,
  columnsHint?: number,
  opts: { dense?: boolean } = {},
): string {
  const result = pickCompositionImpl(layout, itemCount, columnsHint, opts);
  if (
    typeof process !== 'undefined'
    && process.env?.LASCA_TRACE === '1'
    && process.env?.NODE_ENV !== 'production'
  ) {
    // console.error (not .log/.info) because Next.js 16 dev swallows those.
    console.error(`[LASCA_TRACE] pickComposition ${JSON.stringify({
      stage: 'pickComposition',
      layout,
      itemCount,
      columnsHint: columnsHint ?? null,
      dense: opts.dense ?? false,
      result,
    })}`);
  }
  return result;
}
