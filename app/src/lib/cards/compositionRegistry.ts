// ============================================================================
// Lasca — Composition registry (UI vocabulary)
// ============================================================================
// 18 canonical compositions in 6 categories — the full UI vocabulary. Panels
// (SlideToolbar, CardSidePanel) render from this list, optionally filtered by
// pageType.
//
// LAYOUT_REGISTRY (lib/types.ts) is a separate LLM vocabulary — unrelated to
// user-facing picking.
// ============================================================================

import { COMPOSITIONS } from './compositions';
import type { PageType } from '@/lib/ai/harness/types';

export type CompositionCategory = 'full' | 'split' | 'stack' | 'grid' | 'bento' | 'banner';

export interface CompositionMeta {
  id: string;
  category: CompositionCategory;
  label: { zh: string; en: string };
  /** Display order within its category (lower first). */
  order: number;
  /** Typical tile count (for sorting / hints). */
  slotCount: number;
  /** Which pageTypes this composition applies to. Unset = ['content']. */
  pageTypes?: PageType[];
}

export const CATEGORY_LABELS: Record<CompositionCategory, { zh: string; en: string }> = {
  full:   { zh: '整页',   en: 'Full' },
  split:  { zh: '两栏',   en: 'Split' },
  stack:  { zh: '上下堆叠', en: 'Stack' },
  grid:   { zh: '网格',   en: 'Grid' },
  bento:  { zh: 'Bento', en: 'Bento' },
  banner: { zh: '横幅',   en: 'Banner' },
};

export const CATEGORY_ORDER: CompositionCategory[] =
  ['full', 'split', 'stack', 'grid', 'bento', 'banner'];

export const COMPOSITION_REGISTRY: CompositionMeta[] = [
  // --- full (single slot; dispatch by role for full-bleed) ---
  { id: 'full-center', category: 'full',
    label: { zh: '居中', en: 'Centered' },
    order: 1, slotCount: 1,
    pageTypes: ['cover', 'section', 'back', 'content'] },
  { id: 'full-bleed',  category: 'full',
    label: { zh: '整页', en: 'Full bleed' },
    order: 2, slotCount: 1 },

  // --- split (two-pane) ---
  { id: 'split-equal', category: 'split',
    label: { zh: '两栏平分', en: 'Equal split' },
    order: 1, slotCount: 2 },
  { id: 'split-media', category: 'split',
    label: { zh: '图文并列', en: 'Image + text' },
    order: 2, slotCount: 2 },
  { id: 'split-60-40', category: 'split',
    label: { zh: '两栏 60/40', en: '60/40 split' },
    order: 3, slotCount: 2 },
  { id: 'split-40-60', category: 'split',
    label: { zh: '两栏 40/60', en: '40/60 split' },
    order: 4, slotCount: 2 },

  // --- stack (vertical 2-slot) ---
  { id: 'stack-text-media', category: 'stack',
    label: { zh: '上文下图', en: 'Text over media' },
    order: 1, slotCount: 2,
    pageTypes: ['content', 'cover'] },
  { id: 'stack-media-text', category: 'stack',
    label: { zh: '上图下文', en: 'Media over text' },
    order: 2, slotCount: 2 },

  // --- grid (uniform N cols) ---
  { id: 'grid-2col', category: 'grid',
    label: { zh: '2 列', en: '2 columns' },
    order: 1, slotCount: 2 },
  { id: 'grid-3col', category: 'grid',
    label: { zh: '3 列', en: '3 columns' },
    order: 2, slotCount: 3 },
  { id: 'grid-4col', category: 'grid',
    label: { zh: '4 列', en: '4 columns' },
    order: 3, slotCount: 4 },
  { id: 'grid-2x2', category: 'grid',
    label: { zh: '2×2 对比', en: '2×2 compare' },
    order: 4, slotCount: 4 },

  // --- bento (asymmetric with hero tile) ---
  { id: 'bento-1+2', category: 'bento',
    label: { zh: 'Bento 1+2', en: 'Bento 1+2' },
    order: 1, slotCount: 3 },
  { id: 'bento-1+3', category: 'bento',
    label: { zh: 'Bento 1+3', en: 'Bento 1+3' },
    order: 2, slotCount: 4 },
  { id: 'bento-1+4', category: 'bento',
    label: { zh: 'Bento 1+4', en: 'Bento 1+4' },
    order: 3, slotCount: 5 },
  { id: 'bento-2x3', category: 'bento',
    label: { zh: 'Bento 2×3', en: 'Bento 2×3' },
    order: 4, slotCount: 6 },

  // --- banner (hero/title zone + tile row) ---
  { id: 'hero-grid',  category: 'banner',
    label: { zh: '头图+网格', en: 'Hero + grid' },
    order: 1, slotCount: 4 },
  { id: 'title-grid', category: 'banner',
    label: { zh: '标题+网格', en: 'Title + grid' },
    order: 2, slotCount: 4 },
];

// Dev-time sanity: every registry id must resolve to a Composition.
if (process.env.NODE_ENV !== 'production') {
  for (const meta of COMPOSITION_REGISTRY) {
    if (!COMPOSITIONS[meta.id]) {
      console.warn(`[composition-registry] missing composition: ${meta.id}`);
    }
  }
}

export function compositionsByCategory(cat: CompositionCategory): CompositionMeta[] {
  return COMPOSITION_REGISTRY
    .filter(m => m.category === cat)
    .sort((a, b) => a.order - b.order);
}

export function getCompositionMeta(id: string): CompositionMeta | undefined {
  return COMPOSITION_REGISTRY.find(m => m.id === id);
}

/** Compositions applicable to a given pageType. Unset `pageTypes` on a meta
 *  defaults to `['content']`. Pass `undefined` to get the full registry. */
export function compositionsForPageType(pt: PageType | undefined): CompositionMeta[] {
  if (!pt) return COMPOSITION_REGISTRY;
  return COMPOSITION_REGISTRY.filter(m => (m.pageTypes ?? ['content']).includes(pt));
}
