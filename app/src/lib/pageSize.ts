// ============================================================================
// Lasca — page-size utilities
// ============================================================================
// There are THREE coordinate systems we care about:
//
//   1. Logical dims  — the authoring coordinate system. Slide content (text
//      positions, font sizes, Lasca-native layouts) is authored against this.
//      • slide-16:9 → 960×540 (Lasca's native canvas)
//      • letter     → 612×792 (PDF points, 72 DPI)
//      • a4         → 595×842 (PDF points, 72 DPI)
//      • custom     → deck.pageWidth × deck.pageHeight
//
//   2. Display dims  — what a specific consumer (Canvas, Sidebar thumbnail,
//      Presenter viewport, etc.) actually renders at. Derived by fitting the
//      logical aspect ratio into whatever bounding box is available.
//
//   3. Print dims    — the physical paper size at 96 DPI, used by exportPdf's
//      @page rule + .print-slide CSS size.
//      • letter → 816×1056  (8.5" × 11" @ 96 DPI)
//      • a4     → 794×1123  (210mm × 297mm @ 96 DPI)
//      • slide-16:9 → 960×540 (same as logical)
//      • custom → same as logical (CSS px is authoritative)
// ============================================================================

import type { Deck } from './types';

type DeckLike = Pick<Deck, 'pageSize' | 'pageWidth' | 'pageHeight'>;

/** Authoring coord system for a deck — used by renderSlide's outputs. */
export function getLogicalDims(deck: DeckLike): { w: number; h: number } {
  const ps = deck.pageSize || 'slide-16:9';
  if (ps === 'letter') return { w: 612, h: 792 };
  if (ps === 'a4')     return { w: 595, h: 842 };
  if (ps === 'custom') return { w: deck.pageWidth || 960, h: deck.pageHeight || 540 };
  return { w: 960, h: 540 }; // slide-16:9
}

/** Print-at-96-DPI dimensions used by exportPdf / exportLasca / @page rule. */
export function getPrintDims(deck: DeckLike): { w: number; h: number; pageCss: string } {
  const ps = deck.pageSize || 'slide-16:9';
  if (ps === 'letter') return { w: 816,  h: 1056, pageCss: 'letter portrait' };
  if (ps === 'a4')     return { w: 794,  h: 1123, pageCss: 'A4 portrait' };
  if (ps === 'custom') {
    const w = deck.pageWidth || 960;
    const h = deck.pageHeight || 540;
    return { w, h, pageCss: `${w}px ${h}px` };
  }
  return { w: 960, h: 540, pageCss: '960px 540px landscape' };
}

/** Fit a logical aspect ratio into an available bounding box. */
export function fitToBox(
  logicalW: number,
  logicalH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number; scale: number } {
  const scale = Math.min(boxW / logicalW, boxH / logicalH);
  return {
    w: Math.floor(logicalW * scale),
    h: Math.floor(logicalH * scale),
    scale,
  };
}

/** Short human-readable label shown in the editor status bar. */
export function getPageSizeLabel(deck: DeckLike): string {
  const ps = deck.pageSize || 'slide-16:9';
  if (ps === 'letter') return 'Letter · 612×792';
  if (ps === 'a4')     return 'A4 · 595×842';
  if (ps === 'custom') return `${deck.pageWidth || 960}×${deck.pageHeight || 540}`;
  return '960×540';
}
