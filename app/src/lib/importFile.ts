// ============================================================================
// Lasca — Import file into Slide[] objects
// Supports: .html / .htm / .lasca / .json / .pptx / .pdf / .md / .txt
//
// PPTX import has two modes:
//   - 'text'     (default for back-compat) →抽文字, A 路径
//   - 'faithful' → @jvmr/pptx-to-html 1:1 复刻, B 路径
//
// PDF import mirrors the same pattern:
//   - 'text'     → pdfjs text layer → first-line title heuristic → Lasca layouts
//   - 'faithful' → pdfjs text layer → absolute-positioned <span>s = 'pdf-faithful'
// ============================================================================

import type { Slide, DeckPageSize } from './types';
import type { MdContext, MdContextPage } from './ai/harness/types';
import { logger } from './logger';
import { addToast } from './toast';
import { t } from '@/lib/i18n';
import { useEditorStore } from '@/lib/store';

export type PptxImportMode = 'text' | 'faithful';
export type PdfImportMode = 'text' | 'faithful';

/** Result of a successful import */
export interface ImportResult {
  name: string;
  slides: Slide[];
  /** Report-deck source markdown — set when re-importing a `{slides:[],
   *  sourceMd}` envelope (JSON / .lasca round trip). Caller stores it on
   *  `deck.sourceMd` so the editor's paged.js preview + fast-path PDF
   *  export both work without re-running the LLM. */
  sourceMd?: string;
  /** Optional non-fatal message (e.g. fallback used). Surfaced in chat. */
  warning?: string;
  /**
   * Deck-level page size from a faithful PDF import. The Toolbar / LandingHero
   * writes this straight into `deck.pageSize` so that Canvas + Presenter +
   * export paths all pick up the correct (possibly portrait) layout without
   * having to re-inspect the first slide. PPTX and redesign paths leave this
   * unset and fall back to 'slide-16:9' in the caller.
   */
  deckPageSize?: DeckPageSize;
  deckPageWidth?: number;
  deckPageHeight?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strip HTML tags and decode entities to get plain text */
function stripHtml(html: string): string {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.textContent?.trim() || '';
}

/** Build a cover slide from title + optional subtitle */
function makeCoverSlide(title: string, subtitle?: string): Slide {
  return {
    layout: 'cover',
    data: { title: title || 'Imported Slide', subtitle: subtitle || '', footnote: '', author: '' },
  };
}

/** Build a quote slide from a block of text */
function makeQuoteSlide(text: string): Slide {
  const lines = text.split('\n').filter(l => l.trim());
  return {
    layout: 'quote',
    data: { quote: lines[0] || '', body: lines.slice(1).join('\n'), author: '' },
  };
}

/** Build a two-column slide from title + body text */
function makeContentSlide(title: string, body: string): Slide {
  return {
    layout: 'two-column',
    data: {
      title,
      left: { heading: '', content: body, sub: '' },
      right: { heading: '', content: '', sub: '' },
      footer: '',
    },
  };
}

/**
 * Convert extracted text slides (from PPTX/PDF redesign) into an MdContext
 * that the /create flow can consume. Zero LLM cost — purely structural.
 */
export function textSlidesToMdContext(
  textSlides: { title: string; body: string }[],
  fileName: string,
): MdContext {
  const pages: MdContextPage[] = textSlides.map((s, i) => ({
    title: s.title || `Slide ${i + 1}`,
    corePoint: s.body.split('\n').find(l => l.trim()) || s.title || '',
    body: s.body,
    pageType: i === 0 ? 'cover' as const : i === textSlides.length - 1 ? 'back' as const : 'content' as const,
  }));

  const canonicalMd = textSlides
    .map(s => `# ${s.title}\n\n${s.body}`)
    .join('\n\n---\n\n');

  return {
    frontmatter: { title: fileName },
    pages,
    demands: {},
    canonicalMd,
    changeLevel: 'none',
    diff: { changes: [], changeLevel: 'none' },
  };
}

// ---------------------------------------------------------------------------
// HTML / .lasca import
// ---------------------------------------------------------------------------

interface HtmlImport {
  slides: Slide[];
  sourceMd?: string;
}

function extractSourceMdFromHtml(doc: Document): string | undefined {
  const node = doc.querySelector('script[type="application/x-lasca-source-md"]');
  if (!node) return undefined;
  // exportLasca escapes `</script` to `<\/script`; reverse here so the
  // round-tripped sourceMd is byte-identical to what was exported.
  const raw = node.textContent ?? '';
  const restored = raw.replace(/<\\\/script/gi, '</script');
  return restored.trim() ? restored : undefined;
}

function parseHtmlToImport(text: string): HtmlImport {
  const slides = parseHtmlToSlides(text);
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  const sourceMd = extractSourceMdFromHtml(doc);
  return { slides, sourceMd };
}

function parseHtmlToSlides(text: string): Slide[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');

  // Try 1: JSON slide data embedded (new Lasca format — Slide[] in script)
  const scripts = doc.querySelectorAll('script');
  for (const script of scripts) {
    const content = script.textContent || '';
    // Match const SLIDES = [...] or var SLIDES = [...]
    const match = content.match(/(?:const|var|let)\s+SLIDES\s*=\s*(\[[\s\S]*?\]);/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data) && data.length > 0) {
          // Check if it's our Slide[] format (has layout+data)
          if (data[0].layout && data[0].data) {
            return data as Slide[];
          }
          // Old prototype format ({id, html}) — extract text and build cover slides
          if (data[0].html) {
            return data.map((item: { html: string }, i: number) => {
              const text = stripHtml(item.html);
              const lines = text.split('\n').filter(l => l.trim());
              return makeCoverSlide(lines[0] || `Slide ${i + 1}`, lines.slice(1, 3).join('\n'));
            });
          }
        }
      } catch {
        // Try function eval as fallback
        try {
          const fn = new Function('return ' + match[1]);
          const data = fn();
          if (Array.isArray(data) && data.length > 0 && data[0].layout) {
            return data as Slide[];
          }
        } catch { /* ignore */ }
      }
    }
  }

  // Try 2: .slide / section divs
  const slideDivs = doc.querySelectorAll('.slide, [data-slide], section');
  if (slideDivs.length > 0) {
    return Array.from(slideDivs).map((div, i) => {
      const textContent = (div as HTMLElement).innerText || div.textContent || '';
      const lines = textContent.split('\n').filter(l => l.trim());
      const title = lines[0] || `Slide ${i + 1}`;
      const body = lines.slice(1).join('\n');
      if (body.length > 0) {
        return makeContentSlide(title, body);
      }
      return makeCoverSlide(title);
    });
  }

  // Try 3: entire body as one slide
  const bodyText = doc.body?.innerText || doc.body?.textContent || '';
  const lines = bodyText.split('\n').filter(l => l.trim());
  if (lines.length > 0) {
    return [makeCoverSlide(lines[0], lines.slice(1, 5).join('\n'))];
  }

  return [makeCoverSlide('Imported Slide')];
}

// ---------------------------------------------------------------------------
// JSON import
// ---------------------------------------------------------------------------

interface JsonImport {
  slides: Slide[];
  sourceMd?: string;
}

function parseJsonToImport(text: string): JsonImport {
  const data = JSON.parse(text);

  // Direct Slide[] array
  if (Array.isArray(data)) {
    if (data.length > 0 && data[0].layout && data[0].data) {
      return { slides: data as Slide[] };
    }
    // Old prototype format
    if (data.length > 0 && data[0].html) {
      const slides = data.map((item: { html: string }, i: number) => {
        const text = stripHtml(item.html);
        const lines = text.split('\n').filter(l => l.trim());
        return makeCoverSlide(lines[0] || `Slide ${i + 1}`, lines.slice(1, 3).join('\n'));
      });
      return { slides };
    }
  }

  // Deck object with slides property — and optionally sourceMd for fast-path
  // report decks.
  if (data && Array.isArray(data.slides)) {
    const out: JsonImport = { slides: data.slides as Slide[] };
    if (typeof data.sourceMd === 'string' && data.sourceMd.trim().length > 0) {
      out.sourceMd = data.sourceMd;
    }
    return out;
  }

  throw new Error('JSON format not recognized. Expected Slide[] or { slides: Slide[] }.');
}

// ---------------------------------------------------------------------------
// PPTX import (uses JSZip loaded from CDN)
// ---------------------------------------------------------------------------

async function parsePptxToSlides(file: File): Promise<Slide[]> {
  // Dynamically load JSZip from CDN
  if (!(window as unknown as Record<string, unknown>).JSZip) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }

  const JSZip = (window as unknown as Record<string, unknown>).JSZip as {
    loadAsync: (data: File) => Promise<{
      files: Record<string, { async: (type: string) => Promise<string> }>;
    }>;
  };

  const zip = await JSZip.loadAsync(file);

  // Find slide XML files
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)![1]);
      const nb = parseInt(b.match(/slide(\d+)/)![1]);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    throw new Error('No slides found in PPTX file.');
  }

  const slides: Slide[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('text');
    const xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');

    // Extract text runs, grouping by paragraph
    const texts: string[] = [];
    const tNodes = xmlDoc.querySelectorAll('t');
    let currentPara: string[] = [];
    let lastParent: Element | null = null;

    tNodes.forEach(t => {
      const para = t.closest('p') || t.parentElement;
      if (para !== lastParent && currentPara.length > 0) {
        texts.push(currentPara.join(''));
        currentPara = [];
      }
      lastParent = para;
      currentPara.push(t.textContent || '');
    });
    if (currentPara.length > 0) texts.push(currentPara.join(''));

    const title = texts[0] || `Slide ${i + 1}`;
    const body = texts.slice(1).filter(t => t.trim());

    if (body.length > 0) {
      slides.push(makeContentSlide(title, body.join('\n')));
    } else {
      slides.push(makeCoverSlide(title));
    }
  }

  return slides;
}

/**
 * Extract raw text from a PPTX file as title+body pairs (for redesign flow).
 * Same logic as parsePptxToSlides but returns structured text instead of Slide[].
 */
export async function extractPptxText(file: File): Promise<{ title: string; body: string }[]> {
  // Reuse the same JSZip loading
  if (!(window as unknown as Record<string, unknown>).JSZip) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(s);
    });
  }

  const JSZip = (window as unknown as Record<string, unknown>).JSZip as {
    loadAsync: (data: File) => Promise<{
      files: Record<string, { async: (type: string) => Promise<string> }>;
    }>;
  };

  const zip = await JSZip.loadAsync(file);
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/i.test(f))
    .sort((a, b) => parseInt(a.match(/slide(\d+)/)![1]) - parseInt(b.match(/slide(\d+)/)![1]));

  const result: { title: string; body: string }[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('text');
    const xmlDoc = new DOMParser().parseFromString(xml, 'text/xml');
    const texts: string[] = [];
    const tNodes = xmlDoc.querySelectorAll('t');
    let currentPara: string[] = [];
    let lastParent: Element | null = null;
    tNodes.forEach(t => {
      const para = t.closest('p') || t.parentElement;
      if (para !== lastParent && currentPara.length > 0) {
        texts.push(currentPara.join(''));
        currentPara = [];
      }
      lastParent = para;
      currentPara.push(t.textContent || '');
    });
    if (currentPara.length > 0) texts.push(currentPara.join(''));

    result.push({
      title: texts[0] || `Slide ${i + 1}`,
      body: texts.slice(1).filter(t => t.trim()).join('\n'),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Markdown / text import
// ---------------------------------------------------------------------------

function parseMarkdownToSlides(text: string): Slide[] {
  const slides: Slide[] = [];

  // Split by headings (## or #) or triple blank lines
  const sections = text.split(/(?=^#{1,2}\s)/m).filter(s => s.trim());

  if (sections.length === 0) {
    // Fallback: split by double blank lines
    const blocks = text.split(/\n{3,}/).filter(s => s.trim());
    if (blocks.length === 0) return [makeCoverSlide('Imported Text')];
    return blocks.map((block, i) => {
      const lines = block.split('\n').filter(l => l.trim());
      const title = lines[0]?.replace(/^#+\s*/, '') || `Slide ${i + 1}`;
      const body = lines.slice(1).join('\n');
      if (body) return makeContentSlide(title, body);
      return makeCoverSlide(title);
    });
  }

  for (let i = 0; i < sections.length; i++) {
    const lines = sections[i].split('\n').filter(l => l.trim());
    const title = lines[0]?.replace(/^#+\s*/, '') || `Slide ${i + 1}`;
    const body = lines.slice(1).join('\n');

    if (i === 0 && !body) {
      // First section with only a title -> cover
      slides.push(makeCoverSlide(title));
    } else if (body.length > 200) {
      // Long content -> quote style
      slides.push(makeQuoteSlide(title + '\n' + body));
    } else if (body) {
      slides.push(makeContentSlide(title, body));
    } else {
      slides.push(makeCoverSlide(title));
    }
  }

  return slides.length > 0 ? slides : [makeCoverSlide('Imported Text')];
}

// ---------------------------------------------------------------------------
// Main import function
// ---------------------------------------------------------------------------

export async function importFile(
  file: File,
  options: { pptxMode?: PptxImportMode; pdfMode?: PdfImportMode } = {},
): Promise<ImportResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const pptxMode: PptxImportMode = options.pptxMode || 'text';
  const pdfMode: PdfImportMode = options.pdfMode || 'faithful';
  const locale = useEditorStore.getState().locale ?? 'en';
  const startMs = Date.now();
  logger.info('import', `import start: ${file.name}`, { fileSize: `${(file.size / 1024).toFixed(1)}KB`, ext, pptxMode, pdfMode });

  try {
    switch (ext) {
      case 'html':
      case 'htm':
      case 'lasca': {
        const text = await file.text();
        const { slides, sourceMd } = parseHtmlToImport(text);
        return { name: baseName, slides, sourceMd };
      }

      case 'json': {
        const text = await file.text();
        const { slides, sourceMd } = parseJsonToImport(text);
        return { name: baseName, slides, sourceMd };
      }

      case 'pptx': {
        if (pptxMode === 'faithful') {
          // Lazy import so the parser is only bundled when actually used.
          const { parsePptxFaithful } = await import('./import/pptxFaithful');
          try {
            const slides = await parsePptxFaithful(file);
            logger.info('import', `PPTX faithful 解析完成`, { slideCount: slides.length, elapsed: `${Date.now() - startMs}ms` });
            return { name: baseName, slides };
          } catch (err) {
            logger.warn('import', 'PPTX faithful parse failed, falling back to text mode', { error: (err as Error).message });
            addToast('warn', t(locale, 'import.faithful_failed_fallback'), (err as Error).message);
            const slides = await parsePptxToSlides(file);
            logger.info('import', `PPTX text fallback complete`, { slideCount: slides.length, elapsed: `${Date.now() - startMs}ms` });
            return { name: baseName, slides, warning: t(locale, 'import.faithful_failed_detail') };
          }
        }
        const slides = await parsePptxToSlides(file);
        logger.info('import', `PPTX text 解析完成`, { slideCount: slides.length, elapsed: `${Date.now() - startMs}ms` });
        return { name: baseName, slides };
      }

      case 'pdf': {
        // Lazy-load pdfjs-dist (~2MB) only when a PDF is actually dropped.
        const { parsePdfFaithful, parsePdfToSlides } = await import('./import/pdfFaithful');
        if (pdfMode === 'faithful') {
          try {
            const result = await parsePdfFaithful(file);
            logger.info('import', `PDF faithful 解析完成`, {
              slideCount: result.slides.length,
              pageSize: result.deckPageSize,
              elapsed: `${Date.now() - startMs}ms`,
            });
            return {
              name: baseName,
              slides: result.slides,
              warning: result.warning,
              deckPageSize: result.deckPageSize,
              deckPageWidth: result.deckPageWidth,
              deckPageHeight: result.deckPageHeight,
            };
          } catch (err) {
            logger.warn('import', 'PDF faithful parse failed, falling back to text mode', { error: (err as Error).message });
            addToast('warn', t(locale, 'import.faithful_failed_fallback'), (err as Error).message);
            const slides = await parsePdfToSlides(file);
            return {
              name: baseName,
              slides,
              warning: t(locale, 'import.faithful_failed_detail'),
            };
          }
        }
        const slides = await parsePdfToSlides(file);
        logger.info('import', `PDF text 解析完成`, { slideCount: slides.length, elapsed: `${Date.now() - startMs}ms` });
        return { name: baseName, slides };
      }

      case 'md':
      case 'txt': {
        const text = await file.text();
        const slides = parseMarkdownToSlides(text);
        return { name: baseName, slides };
      }

      default:
        throw new Error(`Unsupported file format: .${ext}`);
    }
  } catch (err) {
    logger.error('import', `import failed: ${file.name}`, { error: (err as Error).message });
    addToast('error', `${t(locale, 'import.failed')}: ${(err as Error).message}`);
    throw new Error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
