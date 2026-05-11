// ============================================================================
// Lasca — Markdown → Report AST (pure functions, no LLM, no DOM)
// ============================================================================
// Takes a complete institutional-grade markdown report and deterministically
// parses it into `ParsedReport` — a flat element stream + cover + header/footer
// metadata — without paraphrasing or trimming.
//
// Pipeline (two pure stages; pagination lives in pagedjsFlow.ts):
//   1. parse: md text → AST<MdBlock>
//   2. map:   AST → ReportBlock[] (with __page_break__ markers between
//             numbered H2 sections) + cover extraction + TOC entries
//
// Consumers: pagedjsFlow.ts (production paged.js channel), test-paged spike,
// CreateFlow.mdLooksComplete heuristic.
//
// Historical note: prior to 2026-04-23 this file also hosted a JS paginator
// (paginateWithDom + paginate + probe geometry helpers). That approach hit
// an architectural ceiling (see project memory `lasca_pagedjs_migration`)
// and was replaced by paged.js. The paginator code was removed; parse + map
// are still used because they're pure and paginator-agnostic.
// ============================================================================

import type {
  Slide,
  Theme,
  ReportBlock,
  ReportCoverData,
  TableData,
} from '../types';

// ── Public API ──────────────────────────────────────────────────────────────

/** Heuristic: is this markdown structured enough for the fast path? */
export function mdLooksComplete(md: string): boolean {
  if (!md || md.length < 200) return false;
  const h1Count = (md.match(/^#\s+\S/gm) || []).length;
  const h2Count = (md.match(/^##\s+\S/gm) || []).length;
  return h1Count >= 1 || h2Count >= 2;
}

export interface MdToReportDeckOptions {
  locale?: 'zh' | 'en';
  theme?: Theme;
  pageSize?: 'letter' | 'a4';
  defaultDeckName?: string;
}

export interface MdToReportDeckResult {
  name: string;
  slides: Slide[];
  header?: string;
  footer?: string;
}

/** Parse md into cover + elements + header/footer. Pure function; no DOM.
 *  Split from `mdToReportDeck` so CreateFlow can validate structure at
 *  content-submit time but defer pagination until theme is picked. */
export function parseMd(md: string, opts: MdToReportDeckOptions = {}): ParsedReport {
  const ast = parse(md);
  const { cover, elements, header, footer, tocEntries } = mapAstToElements(ast, opts.locale ?? 'en');
  return { cover, elements, header, footer, tocEntries };
}

export interface ParsedReport {
  cover: ReportCoverData | null;
  elements: Element[];
  header?: string;
  footer?: string;
  tocEntries: { number: string; title: string }[];
}


// ── Stage 1: Parse ──────────────────────────────────────────────────────────

type MdBlockCore =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[]; ordered: boolean }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'blockquote'; text: string }
  | { kind: 'meta'; key: string; value: string; sep: string }
  | { kind: 'hr' };

// sourceLine / sourceLineEnd = zero-based line indices in the original md
// where this block starts / ends (inclusive). Used by the editor's
// Click-to-locate sync (ReportSourcePane's textarea jumps to — and selects
// the full span of — the block the user dblclicked on the right pane).
// Single-line blocks (heading, meta, hr) have sourceLineEnd === sourceLine.
type MdBlock = MdBlockCore & { sourceLine: number; sourceLineEnd: number };

/** Parse markdown into a flat block list. No inline-markdown processing —
 *  raw text is preserved verbatim for downstream rendering. */
function parse(md: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines between blocks
    if (trimmed === '') {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(---|\*\*\*|___)\s*$/.test(trimmed)) {
      blocks.push({ kind: 'hr', sourceLine: i, sourceLineEnd: i });
      i++;
      continue;
    }

    // Heading: # / ## / ### (#### and deeper collapse to ###)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: headingMatch[2].trim(), sourceLine: i, sourceLineEnd: i });
      i++;
      continue;
    }

    // Meta line: **Key:** value  or  **Key：** value  — both angle forms of colon
    const metaInside = trimmed.match(/^\*\*([^*]+?)([：:])\*\*\s*(.+)$/);
    const metaOutside = trimmed.match(/^\*\*([^*]+?)\*\*\s*([：:])\s*(.+)$/);
    const metaMatch = metaInside || metaOutside;
    if (metaMatch) {
      blocks.push({
        kind: 'meta',
        key: metaMatch[1].trim(),
        sep: metaMatch[2],
        value: metaMatch[3].trim(),
        sourceLine: i,
        sourceLineEnd: i,
      });
      i++;
      continue;
    }

    // Table: pipe-style with optional separator row
    if (line.includes('|') && trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('|')) {
        tableLines.push(lines[j]);
        j++;
      }
      if (tableLines.length >= 2) {
        const table = parseTable(tableLines);
        if (table) {
          blocks.push({ ...table, sourceLine: i, sourceLineEnd: j - 1 });
          i = j;
          continue;
        }
      }
    }

    // Unordered list
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*[-*+]\s+(.+)$/);
        if (!m) break;
        items.push(m[1].trim());
        j++;
      }
      blocks.push({ kind: 'list', items, ordered: false, sourceLine: i, sourceLineEnd: j - 1 });
      i = j;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(/^\s*\d+\.\s+(.+)$/);
        if (!m) break;
        items.push(m[1].trim());
        j++;
      }
      blocks.push({ kind: 'list', items, ordered: true, sourceLine: i, sourceLineEnd: j - 1 });
      i = j;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const parts: string[] = [];
      let j = i;
      while (j < lines.length && lines[j].trim().startsWith('>')) {
        parts.push(lines[j].replace(/^\s*>\s?/, ''));
        j++;
      }
      blocks.push({ kind: 'blockquote', text: parts.join('\n').trim(), sourceLine: i, sourceLineEnd: j - 1 });
      i = j;
      continue;
    }

    // Paragraph (concat non-blank lines until next blank or block starter)
    const paraStart = i;
    const paraLines: string[] = [line];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      const nextTrim = next.trim();
      if (nextTrim === '') break;
      if (/^#{1,6}\s/.test(nextTrim)) break;
      if (/^(---|\*\*\*|___)\s*$/.test(nextTrim)) break;
      if (nextTrim.startsWith('|')) break;
      if (/^[-*+]\s/.test(nextTrim)) break;
      if (/^\d+\.\s/.test(nextTrim)) break;
      if (nextTrim.startsWith('>')) break;
      paraLines.push(next);
      j++;
    }
    blocks.push({ kind: 'paragraph', text: paraLines.join(' ').trim(), sourceLine: paraStart, sourceLineEnd: j - 1 });
    i = j;
  }

  return blocks;
}

function parseTable(lines: string[]): { kind: 'table'; headers: string[]; rows: string[][] } | null {
  const splitRow = (raw: string): string[] =>
    raw.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

  const headers = splitRow(lines[0]);
  let bodyStart = 1;
  // Detect the separator row (|---|---|)
  if (lines[1] && /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[1].trim())) {
    bodyStart = 2;
  }
  const rows: string[][] = [];
  for (let k = bodyStart; k < lines.length; k++) {
    const cells = splitRow(lines[k]);
    if (cells.length > 0) rows.push(cells);
  }
  if (headers.length === 0) return null;
  return { kind: 'table', headers, rows };
}

// ── Stage 2: Map AST → elements ────────────────────────────────────────────

/** Marker emitted between ReportBlocks to force a new page. */
export interface PageBreak { kind: '__page_break__' }

/** ReportBlock + optional source-line metadata for editor sync. Not added
 *  to the persisted ReportBlock type itself — only the parseMd pipeline
 *  carries this; buildFlowHtml stamps it onto rendered HTML then discards.
 *  - sourceLine / sourceLineEnd: inclusive md-line indices covering the
 *    full block span (1 line for heading/hr, N lines for paragraphs and
 *    tables).
 *  - sectionLine: the md-line of the nearest parent H1/H2/H3 heading for
 *    this block. The dblclick sync uses this to jump to a SECTION not a
 *    specific block — users think in sections, not individual paragraphs.
 *  - sectionTitle: the plain-text title of that heading. Stamped into DOM
 *    as data-lasca-section-title; the dblclick handler does a substring
 *    search for it in the textarea instead of trusting line counts. */
export type ElementWithSource = (ReportBlock & {
  sourceLine?: number;
  sourceLineEnd?: number;
  sectionLine?: number;
  sectionTitle?: string;
}) | PageBreak;
export type Element = ElementWithSource;

const DATE_KEYS = ['date', '日期', 'published', '发布', '发布日期', 'issued'];
const AUTHOR_KEYS = ['author', '作者', 'authors', 'by', 'prepared by', '撰写', '撰稿'];
const DISCLAIMER_HEADINGS = [
  'disclaimer', 'disclosures', 'notes', 'footnotes', 'sources',
  '免责声明', '披露', '注释', '脚注', '信源', '参考',
];

interface MappedResult {
  cover: ReportCoverData | null;
  elements: Element[];
  header?: string;
  footer?: string;
  /** All non-disclaimer h2 sections, in source order. Fed to the dedicated
   *  report-toc slide (emitted only when there are ≥ 3 entries). */
  tocEntries: { number: string; title: string }[];
}

function mapAstToElements(ast: MdBlock[], _locale: 'zh' | 'en'): MappedResult {
  let cover: ReportCoverData | null = null;
  const elements: Element[] = [];
  let h2Counter = 0;
  let inDisclaimerSection = false;
  // Nearest enclosing H1/H2/H3 md-line. Dblclick-to-locate jumps to this
  // line so users land on the section heading, not on individual blocks.
  let currentSectionLine: number | undefined = undefined;
  // Plain-text title of the same heading — stamped into DOM so the sync
  // handler can `textarea.value.indexOf(title)` directly, bypassing any
  // line-counting mismatches between parser / paged.js / textarea.
  let currentSectionTitle: string | undefined = undefined;
  // Enrichment collected during the walk:
  //   tocEntries → dedicated report-toc slide (all non-disclaimer h2s)
  //   contentChars → reading-time estimate on cover + TOC
  const tocEntries: { number: string; title: string }[] = [];
  let contentChars = 0;

  // ── Extract cover from leading H1 + optional first paragraph + meta lines.
  // If no H1 exists (common when md was synthesized from a Word doc whose
  // headings were just bolded paragraphs — wordImport.ts promotes those to
  // H2, never H1), fall back to the first H2 so the report still gets a
  // proper cover page instead of slamming straight into section 1.
  let startIdx = 0;
  let coverHeadingIdx = ast.findIndex(b => b.kind === 'heading' && b.level === 1);
  let coverPromotedFromH2 = false;
  if (coverHeadingIdx === -1) {
    coverHeadingIdx = ast.findIndex(b => b.kind === 'heading' && b.level === 2);
    coverPromotedFromH2 = coverHeadingIdx !== -1;
  }
  if (coverHeadingIdx !== -1) {
    const h = ast[coverHeadingIdx] as Extract<MdBlock, { kind: 'heading' }>;
    cover = { title: h.text };
    // Cover + pre-first-H2 content falls back to the heading line for sync.
    currentSectionLine = h.sourceLine;
    currentSectionTitle = h.text;
    startIdx = coverHeadingIdx + 1;
    void coverPromotedFromH2;

    // First paragraph directly after H1 → subtitle (preserve verbatim)
    if (ast[startIdx]?.kind === 'paragraph') {
      cover.subtitle = (ast[startIdx] as Extract<MdBlock, { kind: 'paragraph' }>).text;
      startIdx++;
    }

    // Consume contiguous meta lines — fill cover.date/author, drop the rest
    // into body elements (they should still be visible somewhere).
    const leftoverMeta: Extract<MdBlock, { kind: 'meta' }>[] = [];
    while (startIdx < ast.length && ast[startIdx].kind === 'meta') {
      const m = ast[startIdx] as Extract<MdBlock, { kind: 'meta' }>;
      const keyLower = m.key.toLowerCase().trim();
      if (!cover.date && DATE_KEYS.some(k => keyLower.includes(k))) {
        cover.date = m.value;
      } else if (!cover.author && AUTHOR_KEYS.some(k => keyLower.includes(k))) {
        cover.author = m.value;
      } else {
        leftoverMeta.push(m);
      }
      startIdx++;
    }
    // Push leftover meta lines back as body paragraphs
    for (const m of leftoverMeta) {
      elements.push({ kind: 'body-para', text: `${m.key}${m.sep} ${m.value}`, sourceLine: m.sourceLine, sourceLineEnd: m.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
    }
  }

  // ── Walk remaining blocks ─────────────────────────────────────────────────
  for (let i = startIdx; i < ast.length; i++) {
    const b = ast[i];

    if (b.kind === 'heading') {
      const lower = b.text.toLowerCase();
      const isDisclaimer = DISCLAIMER_HEADINGS.some(k => lower.includes(k));
      if (b.level === 2) {
        h2Counter++;
        const stripped = stripNumericPrefix(b.text);
        // Option B: trust the author's explicit ordinal. When the heading
        // starts with 一、/ 2./ 十二、 etc., use that numeral as the folio.
        // Unprefixed H2 (e.g. `## 风险提示`, `## 上月预判回顾`) stays a major
        // section (own page, orange section-heading styling) but without a
        // "NN" folio — prevents a stray ## from shifting the sequence and
        // claiming a number the author never wrote (e.g. "上月预判回顾"
        // previously stole 05, pushing "五、德州" down to 06).
        const parsedNum = parseHeadingNumber(b.text);
        const number = parsedNum != null
          ? String(parsedNum).padStart(2, '0')
          : undefined;
        if (!isDisclaimer) {
          tocEntries.push({ number: number ?? '', title: stripped });
        }
        // Numbered H2 (`## 一、X` / `## 1. X`) keeps the "major section owns
        // its own page" semantic — that's the institutional-research layout
        // these reports were designed for. Unnumbered H2 (`## 货币与财政`,
        // `## 数据层面`) used to also force a hard break, which created huge
        // empty pages whenever a section was 1-2 paragraphs long (the typical
        // Word weekly-report shape). Letting paged.js reflow short
        // unnumbered sections fixes that without changing how authors who
        // *do* number their sections experience the layout.
        if (parsedNum != null) {
          elements.push({ kind: '__page_break__' });
        }
        inDisclaimerSection = isDisclaimer;
        currentSectionLine = b.sourceLine;
        currentSectionTitle = stripped;
        elements.push({
          kind: 'section-heading',
          text: stripped,
          ...(number ? { number } : {}),
          sourceLine: b.sourceLine,
          sourceLineEnd: b.sourceLineEnd,
          sectionLine: b.sourceLine,
          sectionTitle: stripped,
        });
      } else if (b.level === 3) {
        const stripped3 = stripNumericPrefix(b.text);
        currentSectionLine = b.sourceLine;
        currentSectionTitle = stripped3;
        elements.push({ kind: 'section-heading', text: stripped3, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: b.sourceLine, sectionTitle: stripped3 });
      } else {
        // Stray H1 after the first one — treat as section-heading
        const strippedH = stripNumericPrefix(b.text);
        currentSectionLine = b.sourceLine;
        currentSectionTitle = strippedH;
        elements.push({ kind: 'section-heading', text: strippedH, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: b.sourceLine, sectionTitle: strippedH });
      }
      continue;
    }

    if (b.kind === 'paragraph') {
      contentChars += b.text.length;
      if (inDisclaimerSection) {
        elements.push({ kind: 'footnote-row', text: b.text, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      } else {
        elements.push({ kind: 'body-para', text: b.text, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      }
      continue;
    }

    if (b.kind === 'list') {
      for (const item of b.items) contentChars += item.length;
      elements.push({ kind: 'list-block', items: b.items, ordered: b.ordered, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      continue;
    }

    if (b.kind === 'table') {
      const title = findPrecedingHeading(ast, i);
      for (const h of b.headers) contentChars += h.length;
      for (const row of b.rows) for (const cell of row) contentChars += cell.length;
      const table: TableData = {
        title: title || '',
        headers: b.headers,
        rows: b.rows,
      };
      elements.push({ kind: 'table-block', table, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      continue;
    }

    if (b.kind === 'blockquote') {
      contentChars += b.text.length;
      const pulled = tryExtractPullQuote(b.text);
      if (pulled) {
        elements.push({ ...pulled, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      } else {
        elements.push({ kind: 'callout', text: b.text, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      }
      continue;
    }

    if (b.kind === 'meta') {
      // Stray meta line inside body — render as plain paragraph
      elements.push({ kind: 'body-para', text: `${b.key}${b.sep} ${b.value}`, sourceLine: b.sourceLine, sourceLineEnd: b.sourceLineEnd, sectionLine: currentSectionLine, sectionTitle: currentSectionTitle });
      continue;
    }

    // 'hr' → explicit page break. Authors insert `---` via the Page-break
    // toolbar button (or by hand) to force a fresh page where paged.js
    // wouldn't break naturally. The `__page_break__` element is consumed by
    // pagedjsFlow.ts and the sidecar's serializer alike.
    if (b.kind === 'hr') {
      elements.push({ kind: '__page_break__' });
      continue;
    }
  }

  // Enrich the cover with derived stats — each is optional so the renderer
  // degrades gracefully when there's no body content yet.
  if (cover) {
    cover.sectionCount = h2Counter || undefined;
    // 900 chars/min blends English (~1100 c/m at 220 wpm × 5 c/word) and CJK
    // (~500 c/m) into one coarse estimate. Good enough for a "X min read" chip.
    if (contentChars > 0) {
      cover.readingMinutes = Math.max(1, Math.round(contentChars / 900));
    }
  }

  return { cover, elements, tocEntries };
}

/** Strip a leading numeric or Chinese-numeral prefix. Matches either
 *  "1." / "一、" / "(1)" style (digits + punct separator) or bare
 *  "04 结论" / "1 Overview" style (digits + whitespace, no punct).
 *  Prevents double-numbering when the renderer adds its own "01 / 02" folio
 *  in front of the heading. Bare "04结论" (no whitespace at all) is left
 *  alone — that's a genuine prefix the author probably wanted preserved. */
function stripNumericPrefix(text: string): string {
  const stripped = text.replace(
    /^\s*(?:[(（]?[0-9０-９]+[)）]?|[一二三四五六七八九十百千]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+)(?:\s*[、．.。:：)）\]】》]|\s+)\s*/,
    '',
  ).trim();
  return stripped || text;
}

const CJK_DIGIT_MAP: Record<string, number> = {
  '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
  '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
};

const ROMAN_DIGIT_MAP: Record<string, number> = {
  'Ⅰ': 1, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4, 'Ⅴ': 5,
  'Ⅵ': 6, 'Ⅶ': 7, 'Ⅷ': 8, 'Ⅸ': 9, 'Ⅹ': 10,
};

function cjkNumeralToArabic(s: string): number | null {
  if (s.length === 1) return CJK_DIGIT_MAP[s] ?? null;
  if (s.length === 2) {
    // 十X → 11–19
    if (s[0] === '十' && CJK_DIGIT_MAP[s[1]]) return 10 + CJK_DIGIT_MAP[s[1]];
    // X十 → 20, 30, ..., 90
    if (s[1] === '十' && CJK_DIGIT_MAP[s[0]]) return CJK_DIGIT_MAP[s[0]] * 10;
  }
  if (s.length === 3 && s[1] === '十' && CJK_DIGIT_MAP[s[0]] && CJK_DIGIT_MAP[s[2]]) {
    // X十Y → 21–99
    return CJK_DIGIT_MAP[s[0]] * 10 + CJK_DIGIT_MAP[s[2]];
  }
  return null;
}

/** Extract the numeric value of a heading's leading ordinal, if any.
 *  Honors the author's explicit number instead of auto-counting:
 *    "## 一、X"   → 1
 *    "## 2. X"   → 2
 *    "## 04 X"   → 4
 *    "## 十二、X" → 12
 *    "## X"      → null (no prefix; caller treats as unnumbered)
 *  Roman (Ⅰ–Ⅹ) supported for completeness. */
export function parseHeadingNumber(text: string): number | null {
  const m = text.match(
    /^\s*(?:[(（]?([0-9０-９]+)[)）]?|([一二三四五六七八九十]+)|([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]+))(?:\s*[、．.。:：)）\]】》]|\s+)/,
  );
  if (!m) return null;
  if (m[1]) {
    // Normalize fullwidth digits to ASCII before parsing.
    const normalized = m[1].replace(/[０-９]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xff10 + 0x30),
    );
    const n = parseInt(normalized, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (m[2]) return cjkNumeralToArabic(m[2]);
  if (m[3] && m[3].length === 1) return ROMAN_DIGIT_MAP[m[3]] ?? null;
  return null;
}

function findPrecedingHeading(ast: MdBlock[], idx: number): string | null {
  for (let k = idx - 1; k >= 0; k--) {
    const b = ast[k];
    if (b.kind === 'heading') return b.text;
    if (b.kind === 'paragraph' || b.kind === 'list' || b.kind === 'table') return null;
  }
  return null;
}

/** If a blockquote looks like a pullable quote (short + dash attribution),
 *  return a quote-pull block; otherwise return null. */
function tryExtractPullQuote(text: string): ReportBlock | null {
  if (text.length > 180) return null;
  const dashSplit = text.split(/\n?\s*[—–]\s+/);
  if (dashSplit.length >= 2) {
    const quote = dashSplit[0].trim();
    const attribution = dashSplit.slice(1).join(' — ').trim();
    if (quote && attribution) {
      return { kind: 'quote-pull', text: quote, attribution };
    }
  }
  return null;
}
