// ============================================================================
// rawHtml DOM → structured content (EnrichedLine[] + ExtractedImage[])
// ============================================================================
// Converts the absolutely-positioned rawHtml from a pptx-faithful or
// pdf-faithful slide into the same structured format that pdfFaithful.ts's
// matchPageToSlide() expects. This enables converting faithful slides to
// native Lasca layouts without re-importing the source file.
//
// Pure client-side DOM parse — zero LLM, instant.
// ============================================================================

export interface EnrichedLine {
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  x: number;
  y: number;
  width: number;
  centered: boolean;
}

export interface ExtractedImage {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  areaRatio: number;
}

export interface ExtractedContent {
  lines: EnrichedLine[];
  images: ExtractedImage[];
  pageW: number;
  pageH: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePixels(value: string | null | undefined): number {
  if (!value) return 0;
  const m = value.match(/([\d.]+)\s*px/);
  return m ? parseFloat(m[1]) : 0;
}

function parseFontWeight(value: string | null | undefined): number {
  if (!value) return 400;
  const n = parseInt(value, 10);
  if (!isNaN(n)) return n;
  if (/bold|black|heavy/i.test(value)) return 700;
  return 400;
}

function isCentered(x: number, width: number, pageW: number): boolean {
  const center = x + width / 2;
  return Math.abs(center - pageW / 2) < pageW * 0.15;
}

/** Group text items that are vertically close into lines. */
function groupIntoLines(items: { text: string; fontSize: number; fontName: string; isBold: boolean; x: number; y: number; width: number }[], yGap: number): EnrichedLine[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: typeof items[] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = lines[lines.length - 1];
    const prevY = prev[prev.length - 1].y;
    if (Math.abs(sorted[i].y - prevY) <= yGap) {
      prev.push(sorted[i]);
    } else {
      lines.push([sorted[i]]);
    }
  }

  return lines.map(group => {
    const text = group.sort((a, b) => a.x - b.x).map(g => g.text).join(' ').trim();
    const maxFontSize = Math.max(...group.map(g => g.fontSize));
    const minX = Math.min(...group.map(g => g.x));
    const maxRight = Math.max(...group.map(g => g.x + g.width));
    const lineWidth = maxRight - minX;
    return {
      text,
      fontSize: maxFontSize,
      fontName: group[0].fontName,
      isBold: group.some(g => g.isBold),
      x: minX,
      y: group[0].y,
      width: lineWidth,
      centered: false, // set later once we know pageW
    };
  }).filter(l => l.text.length > 0);
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

/**
 * Parse rawHtml from a faithful slide into structured text lines + images.
 *
 * Works with both pptx-faithful (output of @jvmr/pptx-to-html) and
 * pdf-faithful (output of pdfjs text layer + extracted images).
 *
 * The output is compatible with matchPageToSlide() from pdfFaithful.ts.
 */
export function extractFromRawHtml(
  rawHtml: string,
  sourceWidth: number,
  sourceHeight: number,
): ExtractedContent {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${rawHtml}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  if (!root) return { lines: [], images: [], pageW: sourceWidth, pageH: sourceHeight };

  const pageW = sourceWidth || 960;
  const pageH = sourceHeight || 540;
  const pageArea = pageW * pageH;

  // ----- Extract text items from all elements with text content -----
  const textItems: { text: string; fontSize: number; fontName: string; isBold: boolean; x: number; y: number; width: number }[] = [];

  // Walk all elements that might contain text
  const allEls = root.querySelectorAll('span, p, div, h1, h2, h3, h4, h5, h6, td, th, li, a, strong, b, em, i, label');
  const seen = new Set<string>();

  allEls.forEach(node => {
    const el = node as HTMLElement;
    // Skip elements that are containers of other matched elements
    if (el.querySelector('span, p, div, h1, h2, h3, h4, h5, h6')) return;

    const text = (el.textContent || '').trim();
    if (!text || text.length === 0) return;

    // Deduplicate — same text at same position
    const style = el.getAttribute('style') || '';
    const key = `${text}|${style.substring(0, 80)}`;
    if (seen.has(key)) return;
    seen.add(key);

    // Extract position from inline style
    const x = parsePixels(style.match(/left:\s*([\d.]+px)/)?.[1]);
    const y = parsePixels(style.match(/top:\s*([\d.]+px)/)?.[1]);

    // Extract font info from inline style
    const fontSizeMatch = style.match(/font-size:\s*([\d.]+)px/);
    const fontSize = fontSizeMatch ? parseFloat(fontSizeMatch[1]) : 16;

    const fontFamilyMatch = style.match(/font-family:\s*([^;]+)/);
    const fontName = fontFamilyMatch ? fontFamilyMatch[1].trim().replace(/['"]/g, '') : 'sans-serif';

    const fontWeight = parseFontWeight(style.match(/font-weight:\s*([^;]+)/)?.[1]);
    const isBold = fontWeight >= 600 || el.tagName === 'B' || el.tagName === 'STRONG';

    // Estimate width from text length and font size (rough)
    const widthMatch = style.match(/width:\s*([\d.]+)px/);
    const width = widthMatch ? parseFloat(widthMatch[1]) : text.length * fontSize * 0.6;

    textItems.push({ text, fontSize, fontName, isBold, x, y, width });
  });

  // Group into lines (items within ~2% of page height are on the same line)
  const yGap = pageH * 0.02;
  const lines = groupIntoLines(textItems, yGap);

  // Set centered flag now that we know pageW
  lines.forEach(l => { l.centered = isCentered(l.x, l.width, pageW); });

  // ----- Extract images -----
  const images: ExtractedImage[] = [];
  const imgEls = root.querySelectorAll('img');
  imgEls.forEach(img => {
    const src = img.getAttribute('src') || '';
    if (!src) return;
    const style = img.getAttribute('style') || '';
    const x = parsePixels(style.match(/left:\s*([\d.]+px)/)?.[1]);
    const y = parsePixels(style.match(/top:\s*([\d.]+px)/)?.[1]);
    const w = parsePixels(style.match(/width:\s*([\d.]+px)/)?.[1]) || parseFloat(img.getAttribute('width') || '0');
    const h = parsePixels(style.match(/height:\s*([\d.]+px)/)?.[1]) || parseFloat(img.getAttribute('height') || '0');
    if (w < 5 || h < 5) return; // skip tiny images (decorative)
    images.push({
      dataUrl: src,
      x, y,
      width: w,
      height: h,
      areaRatio: (w * h) / pageArea,
    });
  });

  return { lines, images, pageW, pageH };
}

// ---------------------------------------------------------------------------
// Prompt serialization — converts ExtractedContent to text for the AI
// redesign endpoint. Compatible with pdfFaithful.ts pageAnalysesToPromptText.
// ---------------------------------------------------------------------------

/**
 * Serialize extracted content to a compact text format that the
 * smartRedesignSystemPrompt() can parse.
 */
export function toPromptText(content: ExtractedContent, pageIndex = 0): string {
  const { lines, images, pageW, pageH } = content;
  const parts: string[] = [];
  parts.push(`=== Page ${pageIndex} (${Math.round(pageW)}×${Math.round(pageH)}) ===`);

  // Text lines sorted by fontSize descending
  const sorted = [...lines].sort((a, b) => b.fontSize - a.fontSize);
  parts.push('Texts (by size):');
  for (const l of sorted) {
    const boldTag = l.isBold ? ', bold' : '';
    const truncated = l.text.length > 80 ? l.text.slice(0, 77) + '...' : l.text;
    parts.push(`  [${Math.round(l.fontSize)}px${boldTag}] "${truncated}"`);
  }

  // Images
  if (images.length > 0) {
    parts.push(`Images: ${images.length}`);
    images.forEach((img, i) => {
      const pos = img.x + img.width / 2 < pageW * 0.33 ? 'left' :
                  img.x + img.width / 2 > pageW * 0.67 ? 'right' : 'center';
      parts.push(`  [${i}] ${Math.round(img.width)}×${Math.round(img.height)}px, ${pos}, ${Math.round(img.areaRatio * 100)}% of page`);
    });
  } else {
    parts.push('Images: 0');
  }

  // Hints
  const hints: string[] = [];
  if (lines.length <= 2) hints.push('minimal text');
  if (lines.length > 8) hints.push('text-heavy');
  if (lines.length > 0 && lines[0].fontSize > (lines[1]?.fontSize || 0) * 1.5) hints.push('title-dominant');
  const hasLargeImage = images.some(img => img.areaRatio > 0.25);
  if (hasLargeImage) hints.push('has large image (>25% area)');
  if (hints.length > 0) parts.push(`Hints: ${hints.join(', ')}`);

  return parts.join('\n');
}
