// ============================================================================
// Lasca — Structure bases (UI-only compression of the 18 compositions)
// ============================================================================
// The 18 canonical compositions live in compositionRegistry.ts and stay the
// runtime SSOT. This file is a UI-presentation layer: it groups those 18 into
// 6 base structures with variant chips, so the picker shows ~6 fundamental
// shapes (each with a small variant strip) instead of 18 enumerated tiles.
//
// Mapping rules:
//   full        = full-bleed | full-center
//   split-h     = split-equal | split-60-40 | split-40-60 | split-media
//   split-v     = stack-text-media | stack-media-text
//   grid        = grid-2col | grid-3col | grid-4col | grid-2x2 | bento-2x3
//   hero-bento  = bento-1+2 | bento-1+3 | bento-1+4   (1+N hero asymmetric)
//   banner      = title-grid | hero-grid
//
// `bento-2x3` lives in the grid base, not bento — it's a uniform 2-row × 3-col
// grid with no hero tile (despite its compositionRegistry category).
// ============================================================================

export type StructureBaseId =
  | 'full'
  | 'split-h'
  | 'split-v'
  | 'grid'
  | 'hero-bento'
  | 'banner';

export interface StructureVariant {
  compositionId: string;
  chip: { zh: string; en: string };
  /** Optional one-line tooltip explaining when to use this variant. */
  hint?: { zh: string; en: string };
}

export interface StructureBase {
  id: StructureBaseId;
  label: { zh: string; en: string };
  /** Which composition the base falls back to when first activated and the
   *  current slide is in a different family. */
  defaultCompositionId: string;
  variants: StructureVariant[];
}

export const STRUCTURE_BASES: StructureBase[] = [
  {
    id: 'full',
    label: { zh: '整页', en: 'Full' },
    defaultCompositionId: 'full-center',
    variants: [
      { compositionId: 'full-center', chip: { zh: '居中', en: 'Centered' },
        hint: { zh: '内容居中，四周留白', en: 'Content centered with padding' } },
      { compositionId: 'full-bleed',  chip: { zh: '满铺', en: 'Bleed' },
        hint: { zh: '内容铺满整页，无边距', en: 'Content fills the slide edge to edge' } },
    ],
  },
  {
    id: 'split-h',
    label: { zh: '横向两栏', en: 'Two pane' },
    defaultCompositionId: 'split-equal',
    variants: [
      { compositionId: 'split-equal',  chip: { zh: '50 / 50', en: '50 / 50' } },
      { compositionId: 'split-60-40',  chip: { zh: '60 / 40', en: '60 / 40' } },
      { compositionId: 'split-40-60',  chip: { zh: '40 / 60', en: '40 / 60' } },
      { compositionId: 'split-media',  chip: { zh: '图文', en: 'Image + text' },
        hint: { zh: '图片满边、文字带留白', en: 'Image edge-to-edge, text with padding' } },
    ],
  },
  {
    id: 'split-v',
    label: { zh: '上下堆叠', en: 'Stack' },
    defaultCompositionId: 'stack-text-media',
    variants: [
      { compositionId: 'stack-text-media', chip: { zh: '文上图下', en: 'Text top' } },
      { compositionId: 'stack-media-text', chip: { zh: '图上文下', en: 'Image top' } },
    ],
  },
  {
    id: 'grid',
    label: { zh: '均分网格', en: 'Even grid' },
    defaultCompositionId: 'grid-3col',
    variants: [
      { compositionId: 'grid-2col', chip: { zh: '2 列', en: '2 col' } },
      { compositionId: 'grid-3col', chip: { zh: '3 列', en: '3 col' } },
      { compositionId: 'grid-4col', chip: { zh: '4 列', en: '4 col' } },
      { compositionId: 'grid-2x2',  chip: { zh: '2×2', en: '2×2' } },
      { compositionId: 'bento-2x3', chip: { zh: '2×3', en: '2×3' } },
    ],
  },
  {
    id: 'hero-bento',
    label: { zh: '主图非对称', en: 'Hero asymmetric' },
    defaultCompositionId: 'bento-1+2',
    variants: [
      { compositionId: 'bento-1+2', chip: { zh: '1 + 2', en: '1 + 2' } },
      { compositionId: 'bento-1+3', chip: { zh: '1 + 3', en: '1 + 3' } },
      { compositionId: 'bento-1+4', chip: { zh: '1 + 4', en: '1 + 4' } },
    ],
  },
  {
    id: 'banner',
    label: { zh: '横幅', en: 'Banner' },
    defaultCompositionId: 'title-grid',
    variants: [
      { compositionId: 'title-grid', chip: { zh: '标题带', en: 'Title' },
        hint: { zh: '左侧/顶部标题列 + 网格', en: 'Title column or band + tile grid' } },
      { compositionId: 'hero-grid',  chip: { zh: '头图', en: 'Hero image' },
        hint: { zh: '顶部头图区 + 网格', en: 'Hero image banner + tile grid' } },
    ],
  },
];

/** Lookup the base structure that owns a given compositionId. */
export function baseForComposition(compositionId: string): StructureBase | undefined {
  return STRUCTURE_BASES.find(b => b.variants.some(v => v.compositionId === compositionId));
}

/** Lookup a base by id. */
export function getBase(id: StructureBaseId): StructureBase | undefined {
  return STRUCTURE_BASES.find(b => b.id === id);
}

// Dev-time sanity: every variant id must resolve to a real composition.
if (process.env.NODE_ENV !== 'production') {
  // Lazy require to avoid circular import at module load. We only use the
  // registry here for sanity checking, not at runtime.
  import('./compositionRegistry').then(({ COMPOSITION_REGISTRY }) => {
    const known = new Set(COMPOSITION_REGISTRY.map(m => m.id));
    for (const base of STRUCTURE_BASES) {
      for (const v of base.variants) {
        if (!known.has(v.compositionId)) {
          console.warn(`[structureBases] missing composition: ${v.compositionId} in base "${base.id}"`);
        }
      }
    }
    // Also verify every composition is reachable from at least one base.
    const reachable = new Set(STRUCTURE_BASES.flatMap(b => b.variants.map(v => v.compositionId)));
    for (const id of known) {
      if (!reachable.has(id)) {
        console.warn(`[structureBases] composition not surfaced via any base: ${id}`);
      }
    }
  });
}
