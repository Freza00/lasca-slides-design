// ============================================================================
// Word (.docx + Office HTML) → Markdown
// ----------------------------------------------------------------------------
// Used by the /create FullContentInput so users can drop / paste / upload a
// structured Word doc (e.g. 周报-2026-04-27.docx) and feed the existing
// `rawInput → fast path / generate-from-draft` pipeline without losing
// headings, lists, or simple tables.
//
// All imports are dynamic so the ~110KB gz of mammoth + turndown stay out of
// the root bundle and only load on the FullContentInput chunk on demand.
// ============================================================================

const MAX_DOCX_BYTES = 10 * 1024 * 1024; // 10 MB

export type WordSource =
  | { kind: 'docx'; file: File }
  | { kind: 'office-html'; html: string };

export interface WordImportResult {
  markdown: string;
  /** N images stripped during conversion (Word inline images are dropped). */
  ignoredImages: number;
}

export type WordImportErrorCode = 'FILE_TOO_LARGE' | 'PARSE_FAILED';

export class WordImportError extends Error {
  constructor(
    public readonly code: WordImportErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'WordImportError';
  }
}

// ---------------------------------------------------------------------------
// Office-HTML detection
// ---------------------------------------------------------------------------

// Three signatures cover Word desktop / Word for Mac / Word Web / Outlook
// pasting. Plain web HTML or pasted markdown won't match any of them, so we
// can leave non-Office paste to the browser default.
const OFFICE_HTML_SIGNATURES: RegExp[] = [
  /xmlns:o="urn:schemas-microsoft-com:office/i,
  /class="?Mso/i,
  /\bmso-/i,
];

export function looksLikeOfficeHtml(html: string | null | undefined): boolean {
  if (!html) return false;
  return OFFICE_HTML_SIGNATURES.some(re => re.test(html));
}

// ---------------------------------------------------------------------------
// HTML cleanup — strip the noise Word emits before turndown sees it
// ---------------------------------------------------------------------------

interface CleanResult {
  html: string;
  ignoredImages: number;
}

function stripOfficeNoise(html: string): CleanResult {
  let out = html;

  // Office conditional comments: <!--[if gte mso 9]>...<![endif]-->
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/g, '');

  // Namespaced tags: <o:p>, <w:document>, <m:oMath>, etc. (open and close)
  out = out.replace(/<\/?[a-z]+:[a-z][^>]*>/gi, '');

  // <style>...</style> blocks (mammoth and Word HTML both emit these)
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Count + drop <img> (we don't carry inline images through the pipeline)
  const imgMatches = out.match(/<img\b[^>]*>/gi) ?? [];
  const ignoredImages = imgMatches.length;
  out = out.replace(/<img\b[^>]*>/gi, '');

  // Drop mso-* declarations from style="..." (keeps non-mso CSS)
  out = out.replace(/style="([^"]*)"/gi, (_, body: string) => {
    const cleaned = body
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !/^-?mso-/i.test(s))
      .join('; ');
    return cleaned ? `style="${cleaned}"` : '';
  });

  // class="MsoNormal" / class="MsoListParagraph" etc. — pure noise
  out = out.replace(/\sclass="?Mso[^"\s>]*"?/gi, '');

  return { html: out, ignoredImages };
}

// ---------------------------------------------------------------------------
// Bold-paragraph → heading promotion
// ----------------------------------------------------------------------------
// Word users overwhelmingly mark headings with bold + larger font instead of
// the built-in "Heading 1/2" paragraph style. mammoth maps Heading-styled
// paragraphs to <h1>/<h2> faithfully but emits everything else as <p>, which
// erases the visual hierarchy. We restore it by promoting any <p> whose ENTIRE
// inline content is wrapped in <strong> / <b> (and is reasonably short and
// punctuation-light) to <h2>. False positives are bounded: a true emphasized
// sentence rarely fits the "short, all-bold, no period" pattern.
// ---------------------------------------------------------------------------

const HEADING_PROMOTION_MAX_LEN = 80;

// Trailing punctuation tolerated in headings: Chinese/English colon, both
// dashes, trailing whitespace. We strip these before length-checking so a
// title like "美联储动态：" is detected even though it ends with `：`.
const HEADING_TRAILING_PUNCT = /[\s：:、—–·]+$/u;

function promoteBoldParagraphs(html: string): string {
  return html.replace(
    /<p\b([^>]*)>([\s\S]*?)<\/p>/gi,
    (full, attrs: string, inner: string) => {
      const trimmed = inner.trim();
      if (!trimmed) return full;

      // Match a paragraph whose ONLY child is a single <strong>/<b> wrapping
      // pure text (no nested elements, no anchors, no <br>). This is the
      // exact Word-bold-heading shape and very stable across Word versions.
      const m = trimmed.match(/^<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>$/i);
      if (!m) return full;

      const text = m[2].replace(/<[^>]+>/g, '').trim(); // any inner spans
      if (!text) return full;

      const stripped = text.replace(HEADING_TRAILING_PUNCT, '');
      if (stripped.length === 0) return full;
      if (stripped.length > HEADING_PROMOTION_MAX_LEN) return full;
      // Headings rarely contain sentence-final periods. A long chunk that ends
      // with one is more likely an emphasized statement than a section title.
      if (/[。.!?！？]\s*$/.test(stripped) && stripped.length > 30) return full;

      return `<h2${attrs}>${text}</h2>`;
    },
  );
}

// ---------------------------------------------------------------------------
// HTML → Markdown via turndown + GFM tables
// ---------------------------------------------------------------------------

interface TurndownLike {
  turndown(html: string): string;
  use(plugin: unknown): TurndownLike;
}

interface TurndownCtor {
  new (opts: Record<string, unknown>): TurndownLike;
}

interface GfmModule {
  gfm: unknown;
  tables?: unknown;
}

async function htmlToMarkdown(html: string): Promise<string> {
  const [tdMod, gfmMod] = await Promise.all([
    import('turndown') as Promise<{ default: TurndownCtor }>,
    import('turndown-plugin-gfm') as Promise<GfmModule>,
  ]);
  const Turndown = tdMod.default;
  const td = new Turndown({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '_',
  });
  td.use(gfmMod.gfm);
  return td.turndown(html);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface MammothResult {
  value: string;
  messages?: unknown[];
}

interface MammothLike {
  convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}

async function loadMammoth(): Promise<MammothLike> {
  // mammoth's package.json `browser` field already swaps the Node-only
  // unzip / files modules for browser-safe versions, so a plain
  // `import('mammoth')` works in both Webpack and Turbopack.
  const mod = await import('mammoth');
  return ((mod as unknown as { default?: MammothLike }).default ?? mod) as MammothLike;
}

export async function wordToMarkdown(source: WordSource): Promise<WordImportResult> {
  let html: string;

  if (source.kind === 'docx') {
    if (source.file.size > MAX_DOCX_BYTES) {
      throw new WordImportError('FILE_TOO_LARGE');
    }
    let arrayBuffer: ArrayBuffer;
    try {
      arrayBuffer = await source.file.arrayBuffer();
    } catch (e) {
      throw new WordImportError('PARSE_FAILED', (e as Error).message);
    }
    const mammoth = await loadMammoth();
    let result: MammothResult;
    try {
      result = await mammoth.convertToHtml({ arrayBuffer });
    } catch (e) {
      throw new WordImportError('PARSE_FAILED', (e as Error).message);
    }
    html = result.value;
  } else {
    html = source.html;
  }

  const cleaned = stripOfficeNoise(html);
  const promoted = promoteBoldParagraphs(cleaned.html);

  let markdown: string;
  try {
    markdown = await htmlToMarkdown(promoted);
  } catch (e) {
    throw new WordImportError('PARSE_FAILED', (e as Error).message);
  }

  // Word HTML and mammoth both emit a lot of empty paragraphs. Collapse 3+
  // blank lines into 2 so the markdown reads cleanly in the textarea.
  markdown = markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown, ignoredImages: cleaned.ignoredImages };
}
