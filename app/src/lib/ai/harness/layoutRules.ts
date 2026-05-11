import type { Layout } from '../../types';
import type { MdContextPage } from './types';

export interface LayoutMismatchCtx {
  /** Slide is the final slot in the deck (closing / sign-off). */
  isLast?: boolean;
}

export function detectLayoutMismatch(
  page: MdContextPage,
  layout: Layout,
  ctx?: LayoutMismatchCtx,
): string | null {
  const subCount = page.subPoints?.length ?? 0;
  const bodyLen = page.body.length;
  // Estimate paragraph count from hard breaks. Used by body-heavy layouts
  // whose renderer has no per-row scroll fallback (overflow is silently
  // clipped by baseStyle overflow:hidden at the slide boundary).
  const paraCount = page.body.split(/\n\s*\n/).filter(p => p.trim()).length;

  // Closing-slot contract: the last slide must use 'closing' (or 'quote' as
  // legacy fallback). A chapter-divider rendered at the end produces the "big
  // 01 over Thank You" bug we saw in the bilingual-report run.
  if (ctx?.isLast || page.pageType === 'back') {
    if (layout === 'section-break')
      return `last slide uses section-break (number+subtitle style), but the closing slot must use 'closing'`;
    if (page.pageType === 'back' && layout !== 'closing' && layout !== 'quote')
      return `back-type page should use 'closing' layout, got '${layout}'`;
  }

  if (layout === 'three-cards' && subCount > 3)
    return `three-cards supports max 3 items, but content has ${subCount} sub-points`;
  if (layout === 'big-number' && subCount > 2)
    return `big-number is for single metrics, but content has ${subCount} sub-points`;
  if (layout === 'quote' && bodyLen > 300)
    return `quote is for short text, but content is ${bodyLen} characters`;
  if (layout === 'grid-cards' && subCount < 4)
    return `grid-cards works best with 4+ items, but content has ${subCount} sub-points`;
  if (layout === 'two-column' && subCount > 2)
    return `two-column supports max 2 items, but content has ${subCount} sub-points`;
  if (layout === 'title-body' && (bodyLen > 900 || paraCount > 4))
    return `title-body overflow risk: ${bodyLen} chars, ${paraCount} paragraphs (hard limit: 4 paragraphs / 900 chars). Split into two slides or use icon-list/two-column.`;
  if (layout === 'split-image' && (bodyLen > 600 || paraCount > 3))
    return `split-image overflow risk: ${bodyLen} chars, ${paraCount} paragraphs in narrow text column (hard limit: 3 paragraphs / 600 chars).`;

  return null;
}
