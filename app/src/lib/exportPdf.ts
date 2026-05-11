// ============================================================================
// Lasca — Export deck as PDF.
//
// Two paths, both client-side via html2canvas + jsPDF:
//   - Slide decks: render each slide via renderSlide() into a hidden offscreen
//     container at logical dims, capture at 1080p.
//   - Report decks: paginate the deck's sourceMd via paged.js inside an
//     offscreen iframe (same flow as ReportPreviewPane), then capture each
//     `.pagedjs_page` element. The output PDF is byte-for-byte the same
//     paged.js visual the user sees in the editor — same fonts, spacing,
//     folio numbers, covers — because the rendering code is literally shared.
//
// Why raster (not vector)? The previous reportlab sidecar produced vector PDFs
// but the rendering engine diverged from paged.js, so it could never match
// the preview. Raster screenshot of paged.js is the simplest path that's both
// WYSIWYG and zero-infrastructure. Trade-off: PDF text isn't selectable /
// searchable. Acceptable at current scale; revisit (Puppeteer + paged.js
// sidecar) if it becomes a real complaint.
// ============================================================================

import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { renderSlide } from './renderSlide';
import { getLogicalDims } from './pageSize';
import { logger } from './logger';
import { parseMd } from './reports/mdToReportDeck';
import { buildFlowHtml, buildPageCss, runPagedjs } from './reports/pagedjsFlow';
import { THEMES } from './themes';
import type { Deck, Layout } from './types';

// Same set the deleted serializeReportPayload.ts used to gate on. Kept local
// since the only caller is exportPdf's report-vs-slide branch below.
const REPORT_LAYOUTS: ReadonlySet<Layout> = new Set<Layout>([
  'report-cover',
  'report-section',
  'report-body',
  'report-quote',
  'report-page',
]);

function isReportLayout(layout: string): boolean {
  return REPORT_LAYOUTS.has(layout as Layout);
}

const TARGET_HEIGHT_PX = 1080;

export async function exportPdf(
  deck: Deck,
  onProgress?: (current: number, total: number) => void,
) {
  // Report decks: either materialized as report-* slides, or stored as
  // `{ slides: [], sourceMd }` (the fast-path shape from CreateFlow). Both
  // route through the reportlab sidecar — html2canvas can't paginate
  // long-form prose. The sidecar route does the sourceMd → blocks
  // conversion server-side so we can keep this entry tiny.
  const isMaterializedReport = deck.slides.length > 0
    && deck.slides.every((s) => isReportLayout(s.layout));
  const isSourceMdReport = deck.slides.length === 0
    && typeof deck.sourceMd === 'string'
    && deck.sourceMd.trim().length > 0;
  if (isMaterializedReport || isSourceMdReport) {
    return exportReportPdf(deck, onProgress);
  }
  logger.info('export', `导出 PDF`, { pageSize: deck.pageSize, slideCount: deck.slides.length });

  const logical = getLogicalDims(deck);
  const scaleFactor = TARGET_HEIGHT_PX / logical.h;
  const targetW = Math.round(logical.w * scaleFactor);
  const targetH = Math.round(logical.h * scaleFactor);

  // Hidden offscreen container at logical dimensions
  const container = document.createElement('div');
  container.style.cssText = `position:fixed;left:-99999px;top:0;width:${logical.w}px;height:${logical.h}px;overflow:hidden;`;
  document.body.appendChild(container);

  // PDF page size in mm (150 DPI for print quality)
  const DPI = 150;
  const pageWmm = (targetW / DPI) * 25.4;
  const pageHmm = (targetH / DPI) * 25.4;
  const orientation: 'l' | 'p' = logical.w > logical.h ? 'l' : 'p';

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pageWmm, pageHmm],
    compress: true,
  });

  await document.fonts.ready;

  const deckChrome = { header: deck.header, footer: deck.footer };

  try {
    for (let i = 0; i < deck.slides.length; i++) {
      onProgress?.(i + 1, deck.slides.length);

      container.innerHTML = renderSlide(deck.slides[i], deck.theme, logical, deckChrome, i, deck.slides.length);

      const canvas = await html2canvas(container, {
        width: logical.w,
        height: logical.h,
        scale: scaleFactor,
        useCORS: true,
        logging: false,
        backgroundColor: null,
      });

      if (i > 0) pdf.addPage([pageWmm, pageHmm], orientation);

      // JPEG 92% — visually lossless, ~200-400KB per 1920×1080 page
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG', 0, 0, pageWmm, pageHmm,
      );
    }
  } finally {
    document.body.removeChild(container);
  }

  pdf.save(`${deck.name || 'Lasca Presentation'}.pdf`);
}

// ---------------------------------------------------------------------------
// Report-deck PDF — paged.js inside an offscreen iframe + html2canvas
// ---------------------------------------------------------------------------
// The iframe is sized to the print page in CSS pixels (96 DPI) so paged.js
// paginates against the same canvas the user sees in ReportPreviewPane.
// We then capture each .pagedjs_page at scale 2 for crisp JPEG output and
// assemble a multi-page PDF whose page format matches the chosen paper size.
//
// Letter:  8.5" × 11"     → 816 × 1056 px @ 96 DPI
// A4:      8.27" × 11.69" → 794 × 1123 px @ 96 DPI

const REPORT_PAGE_PX: Record<'letter' | 'a4', { w: number; h: number }> = {
  letter: { w: 816, h: 1056 },
  a4:     { w: 794, h: 1123 },
};

const REPORT_PAGE_MM: Record<'letter' | 'a4', { w: number; h: number }> = {
  letter: { w: 215.9, h: 279.4 },
  a4:     { w: 210.0, h: 297.0 },
};

async function exportReportPdf(
  deck: Deck,
  onProgress?: (current: number, total: number) => void,
) {
  logger.info('export', 'report PDF 导出 (paged.js + html2canvas)', {
    pageSize: deck.pageSize,
    slideCount: deck.slides.length,
    sourceMdLen: deck.sourceMd?.length,
  });
  onProgress?.(0, 1);

  const sourceMd = deck.sourceMd ?? '';
  if (!sourceMd.trim()) {
    throw new Error('Report deck has no sourceMd to export');
  }

  const pageSize: 'letter' | 'a4' = deck.pageSize === 'a4' ? 'a4' : 'letter';
  const pagePx = REPORT_PAGE_PX[pageSize];
  const pageMm = REPORT_PAGE_MM[pageSize];

  // Why iframe, not a div: paged.js owns large amounts of CSS that needs to
  // live in its own document scope (page-break rules, @page declarations).
  // Cohabiting with the live editor's CSS would either pollute the capture
  // or get fought by editor stylesheets.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed',
    'left:-99999px',
    'top:0',
    `width:${pagePx.w}px`,
    `height:${pagePx.h}px`,
    'border:0',
    'background:transparent',
  ].join(';');
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error('Failed to create offscreen iframe document');
    doc.open();
    doc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();

    // Build the same HTML + CSS the live preview pane builds.
    const parsed = parseMd(sourceMd, {
      theme: deck.theme,
      pageSize,
      defaultDeckName: deck.name,
    });
    const themeConfig = THEMES[deck.theme] ?? THEMES.warm;
    const flowHtml = buildFlowHtml(parsed, themeConfig, deck.theme);
    const pageCss = buildPageCss(
      deck.header || undefined,
      deck.footer || undefined,
      pageSize,
      themeConfig,
      deck.theme,
    );

    // Mirror the host's font + theme stylesheets so paged.js inside the
    // iframe sees the same Outfit / Lora / Noto Sans SC / KaiCN fonts the
    // user sees in the editor. Without this the capture renders in system
    // sans and looks nothing like the preview.
    for (const node of Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))) {
      doc.head.appendChild(node.cloneNode(true));
    }
    if (iframe.contentWindow) {
      await iframe.contentWindow.document.fonts?.ready;
    }

    await runPagedjs(flowHtml, pageCss, doc.body);

    const pages = Array.from(doc.querySelectorAll<HTMLElement>('.pagedjs_page'));
    if (pages.length === 0) {
      throw new Error('paged.js produced 0 pages');
    }

    const orientation: 'l' | 'p' = pagePx.w > pagePx.h ? 'l' : 'p';
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: [pageMm.w, pageMm.h],
      compress: true,
    });

    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i + 1, pages.length);
      const pageEl = pages[i];

      // scale 2 ≈ 192 DPI capture. Higher scales blow up file size faster
      // than they improve perceived quality at typical view zooms.
      const canvas = await html2canvas(pageEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: null,
        width: pageEl.offsetWidth,
        height: pageEl.offsetHeight,
        windowWidth: pageEl.offsetWidth,
        windowHeight: pageEl.offsetHeight,
      });

      if (i > 0) pdf.addPage([pageMm.w, pageMm.h], orientation);
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG', 0, 0, pageMm.w, pageMm.h,
      );
    }

    pdf.save(`${deck.name || 'Lasca Report'}.pdf`);
    onProgress?.(pages.length, pages.length);
  } finally {
    document.body.removeChild(iframe);
  }
}
