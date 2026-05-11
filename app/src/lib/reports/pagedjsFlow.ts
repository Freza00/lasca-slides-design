// ============================================================================
// Lasca — paged.js report rendering primitives (production channel)
// ============================================================================
// Composes the live-rendered two-pane report editor (see ReportEditor.tsx).
// Exposes three primitives:
//   - buildFlowHtml(parsed, t) → flow HTML string (cover + body blocks)
//   - buildPageCss(header, footer, pageSize, t) → @page + body CSS string
//   - runPagedjs(flowEl, pageCss, mountEl) → Promise<{ total }>
//
// Design decisions (every-table-own-page, author-numeral folios, cover page
// inlined into the flow, etc.) are documented in the project memory
// `project_lasca_pagedjs_migration.md` and the /test-paged spike.
//
// SSR: pagedjs is dynamically imported inside runPagedjs so top-level
// evaluation never touches `document`. Callers must invoke from a browser
// context; runPagedjs throws if `document` is undefined.
// ============================================================================

import type { Theme, ThemeConfig, ReportBlock, ReportCoverData } from '../types';
import { renderReportBlock } from './renderReportPage';
import { getSignature } from '../themeCatalog';
import type { Element, ParsedReport } from './mdToReportDeck';

// ── Tunables ────────────────────────────────────────────────────────────────

const PAGE_DIMENSIONS_CSS: Record<'letter' | 'a4', string> = {
  letter: 'letter',
  a4: 'A4',
};

// ── HTML builders ───────────────────────────────────────────────────────────

function escText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Strip the undefined texture-var prefix from a theme's composite bg. See
// comment on `.pagedjs_page { background: ... }` below — the slide renderer
// defines `--lasca-texture-{theme}-url`, paged.js does not, so the shorthand
// is invalid and the page renders transparent without this. Accepts either
// the raw palette bg (plain hex / gradient, passed through) or the derived
// textured bg ('var(...) repeat, {color}' — the color is returned).
function stripTextureVar(bg: string): string {
  const m = bg.match(/var\(--lasca-texture-[^)]*\)\s*repeat\s*,\s*(.+)$/);
  return m ? m[1].trim() : bg;
}

function buildCoverHtml(cover: ReportCoverData | null | undefined, t: ThemeConfig, theme: Theme): string {
  if (!cover) return '';

  const title = escText(cover.title);
  const subtitle = cover.subtitle ? escText(cover.subtitle) : '';
  const date = cover.date ? escText(cover.date) : '';
  const author = cover.author ? escText(cover.author) : '';
  const meta = [date, author].filter(Boolean).join(' · ');

  // Each theme gets a distinctive cover treatment. Shared wrapper ensures
  // `.cover-page` fills page 1 (paged.js sees it as a self-contained block
  // before the first __page_break__ marker emits).
  const wrap = (inner: string, align: 'flex-start' | 'center' = 'flex-start') => `
    <div class="cover-page" style="display:flex; flex-direction:column; justify-content:center; align-items:${align}; min-height:900px; padding:40px 0;">
      ${inner}
    </div>`;

  switch (theme) {
    case 'cool':
      // Top hairline + title; meta row at bottom-right.
      return wrap(`
        <div style="width:100%; border-top:1px solid ${t.primary}; padding-top:44px; margin-bottom:80px;"></div>
        <h1 style="font-size:40px; font-weight:500; color:${t.text}; line-height:1.2; margin:0 0 20px; max-width:680px; letter-spacing:-0.01em;">${title}</h1>
        ${subtitle ? `<p style="font-size:15px; color:${t.muted}; margin:0 0 140px; line-height:1.6; max-width:560px;">${subtitle}</p>` : '<div style="height:140px"></div>'}
        <div style="align-self:flex-end; text-align:right;">
          ${date ? `<p style="font-size:11px; color:${t.primary}; letter-spacing:0.18em; text-transform:uppercase; margin:0 0 4px; font-weight:600;">${date}</p>` : ''}
          ${author ? `<p style="font-size:11px; color:${t.muted}; letter-spacing:0.12em; text-transform:uppercase; margin:0;">${author}</p>` : ''}
        </div>`);

    case 'dark':
      // Centered, gold dot, italic subtitle — "lamp in the dark" vibe.
      return wrap(`
        <div style="width:6px; height:6px; border-radius:50%; background:${t.accent}; margin-bottom:60px;"></div>
        <h1 style="font-size:44px; font-weight:500; color:${t.text}; line-height:1.2; margin:0 0 24px; max-width:640px; text-align:center;">${title}</h1>
        ${subtitle ? `<p style="font-size:17px; color:${t.muted}; font-style:italic; margin:0 0 80px; line-height:1.6; max-width:520px; text-align:center;">${subtitle}</p>` : '<div style="height:80px"></div>'}
        <div style="width:36px; height:1px; background:${t.accent}; margin-bottom:14px;"></div>
        ${meta ? `<p style="font-size:11px; color:${t.muted}; letter-spacing:0.16em; text-transform:uppercase; margin:0; text-align:center;">${meta}</p>` : ''}
      `, 'center');

    case 'analysis-paper':
      // Left-aligned serif title + small "REPORT" label.
      return wrap(`
        <p style="font-size:10px; color:${t.accent}; letter-spacing:0.2em; text-transform:uppercase; font-weight:700; margin:0 0 32px;">Research Report</p>
        <h1 style="font-size:42px; font-weight:500; color:${t.primary}; line-height:1.15; margin:0 0 24px; max-width:660px; font-style:italic;">${title}</h1>
        ${subtitle ? `<p style="font-size:15px; color:${t.text}; margin:0 0 120px; line-height:1.6; max-width:560px;">${subtitle}</p>` : '<div style="height:120px"></div>'}
        <div style="width:100%; display:flex; justify-content:space-between; align-items:flex-end; border-top:1px solid ${t.border}; padding-top:12px;">
          ${author ? `<span style="font-size:11px; color:${t.muted}; letter-spacing:0.1em; text-transform:uppercase;">${author}</span>` : '<span></span>'}
          ${date ? `<span style="font-size:11px; color:${t.muted}; letter-spacing:0.1em; text-transform:uppercase;">${date}</span>` : ''}
        </div>`);

    case 'analysis-memo':
      // Navy header band + dense meta block. "MEMO" alone stays generic —
      // "Policy Memo" read as insurance-adjacent in translation.
      return wrap(`
        <div style="width:100%; background:${t.primary}; color:#fff; padding:14px 0 12px; margin-bottom:56px; text-align:center;">
          <p style="font-size:11px; font-weight:700; letter-spacing:0.32em; text-transform:uppercase; margin:0;">Memorandum</p>
        </div>
        <h1 style="font-size:36px; font-weight:600; color:${t.primary}; line-height:1.2; margin:0 0 22px; max-width:640px;">${title}</h1>
        ${subtitle ? `<p style="font-size:14px; color:${t.muted}; margin:0 0 60px; line-height:1.55; max-width:540px;">${subtitle}</p>` : '<div style="height:60px"></div>'}
        <div style="width:100%; border-top:1px solid ${t.border}; padding-top:12px; display:grid; grid-template-columns:repeat(3, 1fr); gap:16px;">
          ${author ? `<div><p style="font-size:9px; color:${t.muted}; letter-spacing:0.2em; text-transform:uppercase; margin:0 0 4px;">Author</p><p style="font-size:12px; color:${t.text}; margin:0;">${author}</p></div>` : '<div></div>'}
          ${date ? `<div><p style="font-size:9px; color:${t.muted}; letter-spacing:0.2em; text-transform:uppercase; margin:0 0 4px;">Date</p><p style="font-size:12px; color:${t.text}; margin:0;">${date}</p></div>` : '<div></div>'}
          <div><p style="font-size:9px; color:${t.muted}; letter-spacing:0.2em; text-transform:uppercase; margin:0 0 4px;">Confidential</p><p style="font-size:12px; color:${t.text}; margin:0;">Internal Only</p></div>
        </div>`);

    case 'analysis-field':
      // Noir: massive serif title + cherry-red hairline mark.
      return wrap(`
        <div style="width:72px; height:3px; background:${t.primary}; margin-bottom:48px;"></div>
        <h1 style="font-size:54px; font-weight:500; color:${t.text}; line-height:1.08; margin:0 0 32px; max-width:720px; letter-spacing:-0.015em;">${title}</h1>
        ${subtitle ? `<p style="font-size:17px; color:${t.muted}; font-style:italic; margin:0 0 120px; line-height:1.55; max-width:540px;">${subtitle}</p>` : '<div style="height:120px"></div>'}
        ${meta ? `<p style="font-size:11px; color:${t.primary}; letter-spacing:0.18em; text-transform:uppercase; font-weight:700; margin:0;">${meta}</p>` : ''}
      `);

    case 'warm':
    default: {
      // Warm / fallback: serif title with a solid accent bar under it.
      const subtitleBlock = subtitle
        ? `<p style="font-size:15px; color:${t.muted}; margin:0 0 60px; line-height:1.6; max-width:560px;">${subtitle}</p>`
        : '<div style="height:60px"></div>';
      const metaBlock = meta
        ? `<p style="font-size:11px; color:${t.muted}; letter-spacing:0.12em; text-transform:uppercase; margin:0;">${meta}</p>`
        : '';
      return wrap(`
        <h1 style="font-size:36px; font-weight:600; color:${t.primary}; line-height:1.25; margin:0 0 14px; max-width:640px;">${title}</h1>
        <div style="width:96px; height:6px; background:${t.primary}; margin:0 0 28px;"></div>
        ${subtitleBlock}
        ${metaBlock}`);
    }
  }
}

/** Build the full report flow HTML — cover page (if any) inlined at the top,
 *  followed by body blocks with page-break markers honoring the numbered-H2
 *  ceremony and every-table-own-page rules. */
export function buildFlowHtml(parsed: ParsedReport, t: ThemeConfig, theme: Theme = 'warm'): string {
  const parts: string[] = [];
  let blockIdx = 0;

  const pushBreakIfNotDup = () => {
    const last = parts[parts.length - 1] ?? '';
    if (!last.includes('paged-break')) {
      parts.push('<div class="paged-break" aria-hidden="true"></div>');
    }
  };

  // Minimal HTML-attribute escape — covers the three characters that would
  // break an attr-value string wrapped in ". &/< come along because an unescaped
  // & invalidates the entity stream and < confuses parsers that see it mid-attr.
  const escapeAttr = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

  // Stamps sync-anchor attributes on the root tag of a block's rendered HTML:
  //   data-lasca-source-line        block's own md-line start
  //   data-lasca-source-line-end    block's last md-line (only if > start)
  //   data-lasca-section-line       md-line of nearest parent H1/H2/H3
  //   data-lasca-section-title      plain-text title of that parent heading
  //
  // The dblclick-to-locate handler reads section-title and does a substring
  // search in the textarea ("用 find 函数找 10 个字" design) —
  // robust against paged.js split-clone edge cases and parser line-count
  // drift. section-line / source-line are kept for diagnostic grep only.
  const stampSourceLine = (
    html: string,
    line: number | undefined,
    lineEnd: number | undefined,
    sectionLine: number | undefined,
    sectionTitle: string | undefined,
  ): string => {
    if (line == null) return html;
    const endAttr = lineEnd != null && lineEnd !== line ? ` data-lasca-source-line-end="${lineEnd}"` : '';
    const sectionAttr = sectionLine != null ? ` data-lasca-section-line="${sectionLine}"` : '';
    const trimmedTitle = sectionTitle?.trim();
    const titleAttr = trimmedTitle ? ` data-lasca-section-title="${escapeAttr(trimmedTitle)}"` : '';
    return html.replace(/^(\s*<\w+)/, `$1 data-lasca-source-line="${line}"${endAttr}${sectionAttr}${titleAttr}`);
  };
  const renderEl = (el: ReportBlock & { sourceLine?: number; sourceLineEnd?: number; sectionLine?: number; sectionTitle?: string }): string => {
    const raw = renderReportBlock(el as ReportBlock, blockIdx++, t, false);
    return stampSourceLine(raw, el.sourceLine, el.sourceLineEnd, el.sectionLine, el.sectionTitle);
  };

  // Cover first. Setting sawAnyContent so the first __page_break__ marker
  // (before Section 01) naturally emits a page break.
  const coverHtml = buildCoverHtml(parsed.cover, t, theme);
  if (coverHtml) parts.push(coverHtml);
  let sawAnyContent = coverHtml !== '';

  const ATOMIC_NEXT_KINDS: ReadonlySet<Element['kind']> = new Set([
    'figure', 'callout', 'quote-pull', 'list-block', 'sidenote-group',
  ]);

  const elements = parsed.elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (el.kind === '__page_break__') {
      if (sawAnyContent) pushBreakIfNotDup();
      continue;
    }

    // Every table-block starts on a fresh page. paged.js has a reproducible
    // silent-row-drop bug when a mid-page table overflows remaining space.
    if (el.kind === 'table-block' && sawAnyContent) {
      pushBreakIfNotDup();
      parts.push(renderEl(el as ReportBlock & { sourceLine?: number; sourceLineEnd?: number; sectionLine?: number; sectionTitle?: string }));
      continue;
    }

    sawAnyContent = true;
    const selfHtml = renderEl(el as ReportBlock & { sourceLine?: number; sourceLineEnd?: number; sectionLine?: number; sectionTitle?: string });

    if (el.kind === 'section-heading') {
      const next = elements[i + 1];

      // heading + table pair: break + heading + table as a single unit.
      if (next && next.kind === 'table-block') {
        pushBreakIfNotDup();
        parts.push(selfHtml);
        parts.push(renderEl(next as ReportBlock & { sourceLine?: number; sourceLineEnd?: number; sectionLine?: number; sectionTitle?: string }));
        i++;
        continue;
      }

      // heading + atomic-next packaged as .keep-with-next.
      if (next && next.kind !== '__page_break__' && ATOMIC_NEXT_KINDS.has(next.kind)) {
        const nextHtml = renderEl(next as ReportBlock & { sourceLine?: number; sourceLineEnd?: number; sectionLine?: number; sectionTitle?: string });
        parts.push(`<div class="keep-with-next">${selfHtml}${nextHtml}</div>`);
        i++;
        continue;
      }
    }

    parts.push(selfHtml);
  }

  // End page: closes the report with a centered sign-off whose wording
  // varies per theme. Only emit if the flow had any content — an empty md
  // shouldn't produce a lonely "End of Report" page.
  if (sawAnyContent) {
    parts.push(buildEndPageHtml(t, theme, parsed.cover));
  }

  return parts.join('');
}

// ── Per-theme typography CSS ────────────────────────────────────────────────
//
// Pulls the rich font pairs from themeCatalog (Fraunces / Lora / Source Serif
// etc.) and applies per-theme body rhythm — paper/memo run tight and
// academic, Noir airy and editorial, Cavern serif-throughout, etc.

interface ThemeRhythm {
  lineHeight: number;
  fontSize: number;    // px
  paraMargin: number;  // px
}

const THEME_RHYTHM: Partial<Record<Theme, ThemeRhythm>> = {
  warm:              { lineHeight: 1.7,  fontSize: 14,   paraMargin: 12 },
  cool:              { lineHeight: 1.7,  fontSize: 14,   paraMargin: 12 },
  dark:              { lineHeight: 1.75, fontSize: 14.5, paraMargin: 13 },
  'analysis-paper':  { lineHeight: 1.6,  fontSize: 13.5, paraMargin: 10 },
  'analysis-memo':   { lineHeight: 1.6,  fontSize: 13.5, paraMargin: 10 },
  'analysis-field':  { lineHeight: 1.85, fontSize: 14.5, paraMargin: 16 },
};

function themeTypographyCss(theme: Theme): string {
  const sig = getSignature(theme);
  const rhythm = THEME_RHYTHM[theme] ?? { lineHeight: 1.7, fontSize: 14, paraMargin: 12 };
  // Fallbacks if the catalog doesn't list this theme (legacy brand themes).
  const headlineFont = sig
    ? `${sig.fontHeadlineLatin}, ${sig.fontHeadlineCjk}, sans-serif`
    : "'Poppins', 'Noto Sans SC', sans-serif";
  const bodyFont = sig
    ? `${sig.fontBodyLatin}, ${sig.fontBodyCjk}, sans-serif`
    : "'Poppins', 'Noto Sans SC', sans-serif";

  return `
    /* Per-theme typography — headline pair + body pair from themeCatalog,
       rhythm tuned so paper/memo read tight and Noir reads airy. */
    .lasca-flow,
    .lasca-flow p,
    .lasca-flow li,
    .lasca-flow td,
    .lasca-flow th {
      font-family: ${bodyFont};
    }
    .lasca-flow h1,
    .lasca-flow h2,
    .lasca-flow h3,
    .lasca-flow h4,
    .lasca-flow .cover-page h1 {
      font-family: ${headlineFont};
    }
    .lasca-flow p,
    .lasca-flow li {
      font-size: ${rhythm.fontSize}px;
      line-height: ${rhythm.lineHeight};
    }
    .lasca-flow p {
      margin: 0 0 ${rhythm.paraMargin}px;
    }`;
}

// ── Per-theme decorative CSS ────────────────────────────────────────────────
//
// Each theme gets a distinct treatment for the section-heading number
// capsule, the short anchor rule under H2, and the pull-quote left accent.
// The purpose is to differentiate the three base (warm/cool/dark) and three
// analysis (paper/memo/field) themes beyond color alone — each carries a
// signature shape so a glance identifies the theme.

function themeDecorCss(theme: Theme, t: ThemeConfig): string {
  const primary = t.primary;
  const accent = t.accent;
  const muted = t.muted;

  // Default (warm-like): filled orange capsule.
  let sectionNum = `
    .lasca-flow .lasca-section-num {
      display: inline-block;
      background: ${primary};
      color: #fff !important;
      padding: 2px 10px;
      border-radius: 4px;
      margin-right: 12px !important;
      font-weight: 700;
      letter-spacing: 0.06em;
      font-size: 0.88em;
    }`;
  let sectionRule = `
    .lasca-flow .lasca-section-rule {
      width: 44px !important;
      height: 2px !important;
      background: ${primary} !important;
    }`;
  let pullQuote = `
    .lasca-flow blockquote,
    .lasca-flow div[style*="border-left:3px solid"] {
      border-left-color: ${primary} !important;
      border-left-width: 4px !important;
    }`;

  switch (theme) {
    case 'cool':
      // Outline pill — engineering/report feel.
      sectionNum = `
        .lasca-flow .lasca-section-num {
          display: inline-block;
          background: transparent;
          color: ${primary} !important;
          padding: 1px 10px;
          border: 1.5px solid ${primary};
          border-radius: 999px;
          margin-right: 12px !important;
          font-weight: 600;
          letter-spacing: 0.08em;
          font-size: 0.85em;
        }`;
      sectionRule = `
        .lasca-flow .lasca-section-rule {
          width: 80px !important;
          height: 1px !important;
          background: ${primary} !important;
          position: relative;
        }
        .lasca-flow .lasca-section-rule::after {
          content: "";
          position: absolute;
          left: 36px; top: -2px;
          width: 5px; height: 5px;
          background: ${accent};
          border-radius: 50%;
        }`;
      break;
    case 'dark':
      // Gold underlined number, no fill.
      sectionNum = `
        .lasca-flow .lasca-section-num {
          display: inline-block;
          color: ${accent} !important;
          padding: 0 2px 1px;
          border-bottom: 2px solid ${accent};
          margin-right: 12px !important;
          font-weight: 800;
          letter-spacing: 0.1em;
          font-size: 0.95em;
        }`;
      sectionRule = `
        .lasca-flow .lasca-section-rule {
          width: 32px !important;
          height: 3px !important;
          background: ${accent} !important;
        }`;
      pullQuote = `
        .lasca-flow blockquote,
        .lasca-flow div[style*="border-left:3px solid"] {
          border-left-color: ${accent} !important;
          border-left-width: 3px !important;
        }`;
      break;
    case 'analysis-paper':
      // Economist/FT-ish: serif number + hairline underneath.
      sectionNum = `
        .lasca-flow .lasca-section-num {
          display: inline-block;
          color: ${primary} !important;
          padding: 0 8px 2px 0;
          font-family: 'Georgia', 'Times New Roman', serif;
          font-weight: 400;
          font-style: italic;
          font-size: 1em;
          margin-right: 8px !important;
          border-right: 1px solid ${muted};
        }`;
      sectionRule = `
        .lasca-flow .lasca-section-rule {
          width: 100% !important;
          height: 1px !important;
          background: ${muted} !important;
          opacity: 0.35;
        }`;
      break;
    case 'analysis-memo':
      // Square filled block, strong typographic stamp.
      sectionNum = `
        .lasca-flow .lasca-section-num {
          display: inline-block;
          background: ${primary};
          color: #fff !important;
          padding: 3px 8px;
          border-radius: 0;
          margin-right: 12px !important;
          font-weight: 700;
          letter-spacing: 0.12em;
          font-size: 0.82em;
          text-transform: uppercase;
        }`;
      sectionRule = `
        .lasca-flow .lasca-section-rule {
          width: 24px !important;
          height: 4px !important;
          background: ${primary} !important;
        }`;
      break;
    case 'analysis-field':
      // Field-notes vibe: italic accent, left chevron.
      sectionNum = `
        .lasca-flow .lasca-section-num {
          display: inline-block;
          color: ${accent} !important;
          font-style: italic;
          font-weight: 700;
          margin-right: 10px !important;
          font-size: 0.95em;
          position: relative;
          padding-left: 14px;
        }
        .lasca-flow .lasca-section-num::before {
          content: "▸";
          position: absolute;
          left: 0; top: 0;
          color: ${accent};
          font-weight: 900;
          font-style: normal;
        }`;
      sectionRule = `
        .lasca-flow .lasca-section-rule {
          width: 56px !important;
          height: 1px !important;
          background: ${accent} !important;
          opacity: 0.6;
        }`;
      break;
    default:
      break;
  }

  return sectionNum + sectionRule + pullQuote;
}

// ── End-page HTML ───────────────────────────────────────────────────────────
//
// Appended after the body flow. Signs off the report with a centered mark;
// the visual style comes from themeDecorCss + inline per-theme flavor.

function buildEndPageHtml(t: ThemeConfig, theme: Theme, cover: ReportCoverData | null | undefined): string {
  const signoff =
    theme === 'analysis-paper' ? '— End of Report —'
    : theme === 'analysis-memo' ? '// END'
    : theme === 'analysis-field' ? '▸ End of field notes'
    : theme === 'dark' ? '✦ End'
    : theme === 'cool' ? 'End of Report'
    : 'End of Report';
  const bylineParts: string[] = [];
  if (cover?.author) bylineParts.push(cover.author);
  if (cover?.date) bylineParts.push(cover.date);
  const byline = bylineParts.length
    ? `<p style="font-size:11px; color:${t.muted}; letter-spacing:0.1em; text-transform:uppercase; margin:10px 0 0;">${bylineParts.join(' · ')}</p>`
    : '';
  return `
    <div class="paged-break" aria-hidden="true"></div>
    <div class="lasca-end-page" style="display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:760px; text-align:center; padding:40px 0;">
      <div style="width:64px; height:2px; background:${t.primary}; margin-bottom:18px;"></div>
      <p style="font-size:14px; color:${t.primary}; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; margin:0;">${signoff}</p>
      ${byline}
    </div>`;
}

/** Build the @page + page-body CSS for the paged.js stylesheet channel. */
export function buildPageCss(
  header: string | undefined,
  footer: string | undefined,
  pageSize: 'letter' | 'a4',
  t: ThemeConfig,
  theme: Theme = 'warm',
): string {
  const headerContent = header ? JSON.stringify(header) : '""';
  const footerContent = footer ? JSON.stringify(footer) : '""';
  const size = PAGE_DIMENSIONS_CSS[pageSize];
  const fontBody = t.fontBody ?? "'Poppins','Noto Sans SC',sans-serif";

  return `
@page {
  size: ${size};
  margin: 72px 72px 72px 72px;

  @top-left {
    content: ${headerContent};
    font-family: ${fontBody};
    font-size: 10px;
    color: ${t.muted};
    letter-spacing: 0.05em;
    padding-bottom: 6px;
    border-bottom: 1px solid ${t.border};
    width: 100%;
    vertical-align: bottom;
  }
  @top-right {
    /* Short mark on the right balances the user-provided @top-left header
       without overflowing the narrow right margin box. Phase 2.2 will let
       the user configure this string from the chrome bar. */
    content: "§ LASCA";
    font-family: ${fontBody};
    font-size: 10px;
    font-weight: 600;
    color: ${t.muted};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
    padding-bottom: 6px;
    padding-right: 2px;
    border-bottom: 1px solid ${t.border};
    vertical-align: bottom;
  }
  @bottom-left {
    content: ${footerContent};
    font-family: ${fontBody};
    font-size: 10px;
    color: ${t.muted};
    padding-top: 6px;
    border-top: 1px solid ${t.border};
    width: 100%;
    vertical-align: top;
  }
  @bottom-right {
    /* Just the page number (no total). paged.js's narrow right margin box
       wrapped "2 / 21" across three lines when both tokens were present. */
    content: counter(page);
    font-family: ${fontBody};
    font-size: 10px;
    font-weight: 600;
    color: ${t.accent};
    white-space: nowrap;
    padding-top: 6px;
    padding-right: 2px;
    border-top: 1px solid ${t.border};
    vertical-align: top;
  }
}

/* Cover owns page 1 — keep chrome off the first page. */
@page :first {
  @top-left { content: ""; border: none; }
  @top-right { content: ""; border: none; }
  @bottom-left { content: ""; border: none; }
  @bottom-right { content: ""; border: none; }
}

html, body {
  background: ${t.bg};
  color: ${t.text};
  font-family: ${fontBody};
  margin: 0;
  padding: 0;
}

/* .lasca-flow carries NO background — paged.js clones ancestors onto each
   page when an element is split, so a coloured bg here would appear only on
   pages containing split-continuation elements. */
.lasca-flow {
  color: ${t.text};
  font-family: ${fontBody};
}

.paged-break {
  break-before: page;
  height: 0;
  margin: 0;
  padding: 0;
}

table { break-inside: auto; }
tbody { break-inside: auto; }
tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
.lasca-flow > figure { break-inside: avoid; }

/* Table cell width fixes — word-break:keep-all stops CJK wrapping per char;
   min-width on first column reserves space for 4-char CJK labels. */
.lasca-flow table th,
.lasca-flow table td {
  word-break: keep-all !important;
  overflow-wrap: anywhere !important;
}
.lasca-flow table th:first-child,
.lasca-flow table td:first-child {
  min-width: 100px;
}

/* Neutralize the legacy overflow:auto wrapper on report table wrappers. */
.lasca-flow div[style*="overflow:auto"],
.lasca-flow div[style*="overflow: auto"] {
  overflow: visible !important;
}

/* Citation-keep locally scoped (the global rule at globals.css:954 is gated
   behind .preset-bilingual-report which the paged.js flow doesn't wear). */
.citation-keep { break-inside: avoid; }

/* Heading + atomic next travel together. */
.keep-with-next { break-inside: avoid; }
h1, h2, h3, h4 { break-after: avoid; }

p { widows: 2; orphans: 2; }

/* Click-to-locate affordance — section headings are clickable in the editor
   preview pane; they jump the left textarea to the matching line. */
.lasca-flow .lasca-section-heading {
  cursor: pointer;
  transition: outline 0.15s;
}
.lasca-flow .lasca-section-heading:hover {
  outline: 1px dashed currentColor;
  outline-offset: 4px;
  border-radius: 2px;
}

/* Pagedjs chrome — long column of pages, white page w/ soft shadow. */
.pagedjs_pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}
.pagedjs_page {
  /* Page background follows the theme. The canvas intentionally sits at the
     Lasca shell editor-bg color, so page/canvas lightness is close — depth
     comes from a pronounced drop shadow rather than color contrast. This is
     how Figma/Keynote/Apple Pages separate paper from desk: the paper looks
     "lifted" regardless of tone.

     IMPORTANT: t.bg is the textured composite from deriveTheme
     ('var(--lasca-texture-X-url) repeat, #hex'), but the CSS variable is
     only defined in the slide renderer, never in paged.js. An undefined
     var() with no fallback invalidates the ENTIRE background shorthand
     (CSS spec), which is why for months the pages rendered with no bg —
     the canvas showed through and paper colors looked identical across
     themes. We strip the texture prefix and use the trailing solid color
     (or gradient) alone. Pure-hex themes still work; gradient themes
     (cool / dark) keep their gradient.

     Dark themes (Cavern onyx on warm-charcoal canvas) would lose a black
     shadow against the dark desk, so we use a warm-amber halo instead —
     the page reads as a luminous sheet in a dim room, matching Cavern's
     "lamp in the dark" signature. */
  background: ${stripTextureVar(t.bg)};
  ${theme === 'dark'
    ? `box-shadow: 0 0 0 1px rgba(210, 175, 120, 0.18),
                   0 2px 10px rgba(210, 175, 120, 0.14),
                   0 12px 36px rgba(210, 175, 120, 0.10),
                   0 24px 64px rgba(0, 0, 0, 0.55);`
    : `box-shadow: 0 2px 6px rgba(0, 0, 0, 0.14),
                   0 8px 28px rgba(0, 0, 0, 0.10),
                   0 16px 48px rgba(0, 0, 0, 0.06);`}
}

${themeTypographyCss(theme)}

${themeDecorCss(theme, t)}
`;
}

// ── paged.js runner ─────────────────────────────────────────────────────────

/** Runs paged.js on the supplied flow HTML, mounting its paginated output
 *  into `mountEl`. Callers are responsible for clearing `mountEl` before
 *  calling again. Returns `{ total }` — the page count. */
export async function runPagedjs(
  flowHtml: string,
  pageCss: string,
  mountEl: HTMLElement,
): Promise<{ total: number }> {
  if (typeof document === 'undefined') {
    throw new Error('runPagedjs must run in a browser context');
  }

  // Dynamic import keeps pagedjs out of the SSR bundle; the library reads
  // `document` at module load, so it cannot sit at top level.
  const pagedjs = await import('pagedjs');
  const { Previewer } = pagedjs as unknown as {
    Previewer: new () => {
      preview: (
        content: string | HTMLElement,
        stylesheets: Array<string | Record<string, string>>,
        renderTo: HTMLElement,
      ) => Promise<{ total: number }>;
    };
  };

  // createContextualFragment mirrors paged.js's own string-path parser
  // internals and lets us pass an HTMLElement — avoids a quirk where string
  // content under Next.js's <html class="__variable_..."> tripped an internal
  // querySelectorAll call with the enclosing outerHTML as a selector.
  const range = document.createRange();
  const fragment = range.createContextualFragment(
    `<div class="lasca-flow">${flowHtml}</div>`,
  );
  const flowEl = fragment.firstElementChild as HTMLElement | null;
  if (!flowEl) throw new Error('Failed to construct flow element for paged.js');

  const previewer = new Previewer();
  // Stylesheet MUST be passed as { urlKey: css } — bare strings get
  // XHR-fetched by paged.js (polisher.js add()), which under a dev server
  // returns the root HTML and blows up the CSS parser downstream.
  const result = await previewer.preview(
    flowEl,
    [{ 'lasca-page-css': pageCss }],
    mountEl,
  );
  return { total: result.total };
}
