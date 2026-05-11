// ============================================================================
// Lasca — renderReportPage (Phase 3)
// ============================================================================
// Block-based report page renderer. Walks ReportPageData.blocks top-to-bottom,
// with footnote-row blocks always bottom-anchored (via flex + margin-top:auto).
//
// Outer wrapper matches legacy report-* layouts (padding 72px, portrait
// geometry inherited from deck pageSize). Deck chrome (header/footer) applies
// automatically via isReportLayout() check in renderSlide() — `'report-page'`
// matches `startsWith('report-')`.
//
// All 9 block renderers reuse helpers from renderSlide.ts:
//   - baseStyle / themeClass / ensureTextContrast / headlineStyle
//   - df / esc / escMd / nl2brMd / clampLines
//   - renderParagraphs (body-para + sidenote-group body)
//   - renderTableInline (table-block, reuses legacy table's <table> body)
// ============================================================================

import type { Theme, ThemeConfig, ReportBlock, ReportPageData } from '../types';
import {
  baseStyle,
  themeClass,
  df,
  esc,
  escMd,
  nl2brMd,
  ensureTextContrast,
  headlineStyle,
  renderParagraphs,
  renderTableInline,
} from '../renderSlide';

// ---- Per-block renderers ---------------------------------------------------

function renderSectionHeadingBlock(
  block: Extract<ReportBlock, { kind: 'section-heading' }>,
  i: number,
  t: ThemeConfig,
  isFirstOnPage: boolean,
): string {
  const numberPart = block.number
    // The lasca-section-num class is the hook buildPageCss uses to paint a
    // per-theme capsule/outline/underline around the folio number. Inline
    // color is kept as a fallback for contexts (non-report, legacy) that
    // don't load the paged.js stylesheet.
    ? `<span class="lasca-section-num" ${df(`blocks.${i}.number`)} style="color:${t.accent}; margin-right:10px;">${esc(block.number)}</span>`
    : '';
  // Per bilingual-report-template skill: horizontal rules only at page
  // header/footer hairlines. Rhythm between subheads comes from spacing,
  // not accent lines. Numbered H2 (section-intro) keeps a short anchor
  // rule for hierarchy; unnumbered H3 relies on margin + weight alone.
  const isH2 = Boolean(block.number);
  const marginTop = isFirstOnPage ? 0 : isH2 ? 28 : 22;
  const marginBottom = isH2 ? 8 : 10;
  const anchorRule = isH2
    ? `<div class="lasca-section-rule" style="width:40px; height:2px; background:${t.primary}; margin-bottom:16px;"></div>`
    : '';
  // data-lasca-section-num carries the AUTHORED folio (01, 02, ...) when
  // present. The editor's Click-to-locate binds on this value so both sides
  // agree on "section 03" without maintaining a parallel ordinal counter.
  const numAttr = block.number ? ` data-lasca-section-num="${esc(block.number)}"` : '';
  return `
    <h2 class="${isH2 ? 'lasca-section-heading' : 'lasca-sub-heading'}"${numAttr} style="font-size:${isH2 ? 22 : 18}px; color:${t.primary}; margin:${marginTop}px 0 ${marginBottom}px; line-height:1.3; ${headlineStyle(t)}">
      ${numberPart}<span ${df(`blocks.${i}.text`)}>${escMd(block.text)}</span>
    </h2>
    ${anchorRule}`;
}

function renderBodyParaBlock(
  block: Extract<ReportBlock, { kind: 'body-para' }>,
  i: number,
  t: ThemeConfig,
): string {
  // renderParagraphs expects `\n\n`-delimited text; we usually have a single
  // paragraph here, so it emits one <p>. The citation-regex handling carries
  // over for free.
  return `<div style="margin-bottom:12px;">${renderParagraphs(block.text, `blocks.${i}.text`, t, 15)}</div>`;
}

function renderCalloutBlock(
  block: Extract<ReportBlock, { kind: 'callout' }>,
  i: number,
  t: ThemeConfig,
): string {
  return `
    <div style="background:${t.cardBg}; border-left:3px solid ${t.accent}; padding:16px 20px; margin:8px 0 16px;">
      <p ${df(`blocks.${i}.text`)} style="font-size:14px; color:${t.text}; line-height:1.7; margin:0; font-style:italic;">${nl2brMd(block.text)}</p>
    </div>`;
}

function renderQuotePullBlock(
  block: Extract<ReportBlock, { kind: 'quote-pull' }>,
  i: number,
  t: ThemeConfig,
): string {
  return `
    <div style="margin:20px 0 24px; padding-left:20px; border-left:3px solid ${t.border};">
      <p ${df(`blocks.${i}.text`)} style="font-size:22px; color:${t.text}; line-height:1.4; margin:0 0 10px; font-style:italic; ${headlineStyle(t, { isDisplay: true })}">${escMd(block.text)}</p>
      ${block.attribution ? `<p ${df(`blocks.${i}.attribution`)} style="font-size:13px; color:${t.accent}; margin:0; font-weight:500;">— ${esc(block.attribution)}</p>` : ''}
      ${block.context ? `<p ${df(`blocks.${i}.context`)} style="font-size:12px; color:${t.muted}; margin:6px 0 0; line-height:1.5;">${escMd(block.context)}</p>` : ''}
    </div>`;
}

function renderFigureBlock(
  block: Extract<ReportBlock, { kind: 'figure' }>,
  i: number,
  t: ThemeConfig,
): string {
  const alt = esc(block.alt || block.caption || 'Figure');
  return `
    <figure style="margin:16px 0 20px;">
      <img src="${esc(block.imageUrl)}" alt="${alt}" style="width:100%; max-height:280px; object-fit:cover; border-radius:4px; display:block;" />
      ${block.caption ? `<figcaption ${df(`blocks.${i}.caption`)} style="font-size:12px; color:${t.muted}; font-style:italic; margin-top:8px; text-align:center;">${escMd(block.caption)}</figcaption>` : ''}
    </figure>`;
}

function renderTableBlock(
  block: Extract<ReportBlock, { kind: 'table-block' }>,
  i: number,
  t: ThemeConfig,
): string {
  // Report-page flow is ~672px wide (letter, after padding). At the legacy
  // 'roomy' default (14px font + 14px padX) a 4-column CJK data table has
  // only ~140px of cell inner width, which force-wraps entries like
  // "SAAR 43万套，环比-8.5%，同比-12.2%" to 3 ugly lines with single-character
  // tail columns. 'compact' (12px font + 10px padX) packs visibly cleaner on
  // the same canvas without looking cramped.
  return `
    <div style="margin:12px 0 20px; overflow:auto;">
      ${renderTableInline(block.table, t, `blocks.${i}.table`, 'compact')}
    </div>`;
}

function renderFootnoteRowBlock(
  block: Extract<ReportBlock, { kind: 'footnote-row' }>,
  i: number,
  t: ThemeConfig,
): string {
  return `
    <p ${df(`blocks.${i}.text`)} style="font-size:11px; color:${t.muted}; line-height:1.6; margin:16px 0 0; padding-top:10px; border-top:1px solid ${t.border};">${nl2brMd(block.text)}</p>`;
}

function renderSidenoteGroupBlock(
  block: Extract<ReportBlock, { kind: 'sidenote-group' }>,
  i: number,
  t: ThemeConfig,
): string {
  return `
    <div style="display:flex; gap:36px; margin:12px 0 16px;">
      <div style="flex:0 0 34%;">
        <p ${df(`blocks.${i}.sidenote`)} style="font-size:11px; color:${t.muted}; line-height:1.7; margin:0; font-style:italic;">${nl2brMd(block.sidenote)}</p>
      </div>
      <div style="flex:1; min-width:0;">
        ${renderParagraphs(block.body, `blocks.${i}.body`, t, 15)}
      </div>
    </div>`;
}

function renderListBlock(
  block: Extract<ReportBlock, { kind: 'list-block' }>,
  i: number,
  t: ThemeConfig,
): string {
  const Tag = block.ordered ? 'ol' : 'ul';
  const items = block.items.map((item, j) =>
    `<li ${df(`blocks.${i}.items.${j}`)} style="font-size:15px; color:${t.text}; line-height:1.75; margin-bottom:6px;">${nl2brMd(item)}</li>`
  ).join('');
  return `
    <${Tag} style="margin:8px 0 16px; padding-left:22px;">
      ${items}
    </${Tag}>`;
}

// ---- Dispatcher ------------------------------------------------------------

export function renderReportBlock(block: ReportBlock, i: number, t: ThemeConfig, isFirstOnPage: boolean): string {
  return renderBlock(block, i, t, isFirstOnPage);
}

function renderBlock(block: ReportBlock, i: number, t: ThemeConfig, isFirstOnPage: boolean): string {
  switch (block.kind) {
    case 'section-heading': return renderSectionHeadingBlock(block, i, t, isFirstOnPage);
    case 'body-para':       return renderBodyParaBlock(block, i, t);
    case 'callout':         return renderCalloutBlock(block, i, t);
    case 'quote-pull':      return renderQuotePullBlock(block, i, t);
    case 'figure':          return renderFigureBlock(block, i, t);
    case 'table-block':     return renderTableBlock(block, i, t);
    case 'footnote-row':    return renderFootnoteRowBlock(block, i, t);
    case 'sidenote-group':  return renderSidenoteGroupBlock(block, i, t);
    case 'list-block':      return renderListBlock(block, i, t);
    default: {
      // TypeScript exhaustiveness: if we add a new block kind, this lights up.
      const _exhaustive: never = block;
      void _exhaustive;
      return '';
    }
  }
}

// ---- Main renderer ---------------------------------------------------------

export function renderReportPage(
  data: ReportPageData,
  t: ThemeConfig,
  theme: Theme,
  _tw: number,
  _th: number,
  isImport = false,
): string {
  const blocks = data.blocks || [];

  // Partition: footnote-row blocks flow to the bottom; all others stay in
  // their declared order at the top. Index is preserved from the ORIGINAL
  // array so that data-field paths (`blocks.N.*`) remain stable for the
  // editor's lodash.set on `slide.data.blocks[N]`.
  // First non-footnote block gets the "first on page" treatment (no top margin
  // for section-heading). Compute index once so the flag stays stable.
  const firstFlowIdx = blocks.findIndex((b) => b.kind !== 'footnote-row');
  const flowHtml = blocks
    .map((b, i) => b.kind === 'footnote-row' ? '' : renderBlock(b, i, t, i === firstFlowIdx))
    .join('');
  const footnoteHtml = blocks
    .map((b, i) => b.kind === 'footnote-row' ? renderBlock(b, i, t, false) : '')
    .join('');

  // Outer wrapper parallels legacy report-* layouts, but with allowOverflow=true:
  // paged.js handles fragmentation in ReportPreviewPane, while the Editor canvas
  // renders one slide per report-page block into a fixed-height frame. Silent
  // clipping hid content from authors; we now let it visibly spill and trust
  // the author to fix via edit / regenerate.
  return `
<div class="${themeClass(theme)}" data-layout="report-page" style="display:flex; flex-direction:column; box-sizing:border-box; ${baseStyle(t, isImport, true)} padding:52px 72px 64px;">
  <div style="flex:1; min-height:0;">
    ${flowHtml}
  </div>
  ${footnoteHtml}
</div>`;
}
