// ============================================================================
// Lasca — Layout content budget helpers (Phase 7.2)
// ============================================================================
// Before rendering a card with dense content (e.g. two-column list mode),
// estimate the total vertical pixel height the content will occupy, and
// compare against the card's available height. If over budget, reduce font
// size (or drop optional elements) rather than silently clipping at render.
//
// Context: Phase 2.1 added CSS overflow:hidden + min-height:0 everywhere to
// prevent visual bleeding, but users still saw content packed to the card
// edges because CSS clipping doesn't shrink the content. User feedback
// (2026-04-16): "这是你在卡片系统设计的问题。元素装进卡片，没有制约好。"
//
// This helper is a step toward the full card-content-contract system
// described in Phase 7 — a pragmatic mid-term fix that makes adaptive font
// sizing content-volume-aware, not just newline-count-aware (which Phase 7.1
// already fixed for `autoBodyFontSize`).
// ============================================================================

/** A single renderable element with known typography. */
export interface LayoutElement {
  /** Raw text content. Used only for length estimation. */
  text: string;
  /** CSS font-size in pixels. */
  fontSize: number;
  /** CSS line-height ratio (1.55 = 155%). */
  lineHeight: number;
  /** Extra vertical margin added BEFORE this element (px). */
  marginTop?: number;
  /** Extra vertical margin added AFTER this element (px). */
  marginBottom?: number;
  /** Optional: override computed visual lines (e.g. hard-coded section heading). */
  fixedLines?: number;
}

/** Estimate how many visual rows a text takes when rendered in `fontSize`
 *  inside a container of `containerWidthPx`. CJK chars are ~1.6× the display
 *  width of Latin, so we halve the charsPerLine for CJK-heavy text. */
export function estimateVisualLines(
  text: string,
  fontSize: number,
  containerWidthPx: number,
): number {
  if (!text || !text.trim()) return 0;
  // Empirical: at 17px, ~10-11px average char width for Latin text.
  // charsPerLine scales inversely with font size.
  const avgCharWidthPx = fontSize * 0.58;        // Latin avg
  const cjkCharWidthPx = fontSize * 1.0;         // CJK is full-width
  const hasCjk = /[\u3400-\u9fff\uff00-\uffef]/.test(text);
  // Blend based on CJK character density — a mixed paragraph lands between.
  const cjkRatio = (text.match(/[\u3400-\u9fff\uff00-\uffef]/g) || []).length / text.length;
  const effectiveCharWidth = avgCharWidthPx * (1 - cjkRatio) + cjkCharWidthPx * cjkRatio;
  const charsPerLine = Math.max(8, Math.floor(containerWidthPx / effectiveCharWidth));

  // Newlines are hard breaks. We count empty lines too because renderers like
  // nl2brMd convert every \n to <br>, so a \n\n paragraph break renders as
  // two <br>s (one blank line between paragraphs). Dropping empties here
  // would under-count body height and defeat fitToBudget in renderQuote
  // / renderTitleBody on multi-paragraph content.
  const segments = text.split('\n');
  let totalLines = 0;
  for (const seg of segments) {
    if (seg.length === 0) {
      totalLines += 1;
    } else {
      totalLines += Math.max(1, Math.ceil(seg.length / charsPerLine));
    }
  }
  void hasCjk; // kept for future tuning if we want a bigger CJK bias
  return totalLines;
}

/** Estimate the vertical pixel height of one element inside a given container. */
export function estimateElementHeight(
  el: LayoutElement,
  containerWidthPx: number,
): number {
  const lines = el.fixedLines ?? estimateVisualLines(el.text, el.fontSize, containerWidthPx);
  if (lines === 0) return 0;
  const textHeight = lines * el.fontSize * el.lineHeight;
  return textHeight + (el.marginTop ?? 0) + (el.marginBottom ?? 0);
}

/** Sum heights of a list of elements. */
export function estimateTotalHeight(
  elements: LayoutElement[],
  containerWidthPx: number,
): number {
  return elements.reduce((sum, el) => sum + estimateElementHeight(el, containerWidthPx), 0);
}

/** Budget-aware font sizing for a list of same-role body elements.
 *
 *  Given: a list of body elements (e.g. bullets) at a starting font size,
 *  a shared heading + optional sub, and a target budget — return the
 *  largest font size (from maxPx down to minPx) that makes total height fit.
 *  If even minPx doesn't fit, also report which optional elements should be
 *  dropped.
 *
 *  Returns:
 *    - `bodyFontSize`: the chosen body font size (bullets)
 *    - `dropSub`: true if the optional sub element should be omitted to fit
 *    - `fits`: false if even dropping sub at minPx still overflows
 */
export interface BudgetFitResult {
  bodyFontSize: number;
  dropSub: boolean;
  fits: boolean;
  estimatedHeight: number;
}

export interface BudgetFitInput {
  /** Static elements (heading, etc.) — not resized. */
  fixed: LayoutElement[];
  /** Body elements whose font-size scales together (e.g. bullets). */
  body: LayoutElement[];
  /** Optional element that can be dropped to fit budget (e.g. sub / footnote). */
  optional?: LayoutElement;
  /** Container inner width (px) for line-count estimation. */
  containerWidthPx: number;
  /** Maximum available height in px. */
  budgetPx: number;
  /** Starting (maximum) body font size. */
  maxBodyPx: number;
  /** Minimum body font size (never go below this). */
  minBodyPx: number;
  /** Step size for font-size decrements. Default 1. */
  stepPx?: number;
}

export function fitToBudget(input: BudgetFitInput): BudgetFitResult {
  const step = input.stepPx ?? 1;
  const fixedHeight = estimateTotalHeight(input.fixed, input.containerWidthPx);
  const optionalHeight = input.optional
    ? estimateElementHeight(input.optional, input.containerWidthPx)
    : 0;

  // Try from max down to min, keeping optional if it fits.
  for (let px = input.maxBodyPx; px >= input.minBodyPx; px -= step) {
    const bodyEls = input.body.map(el => ({ ...el, fontSize: px }));
    const bodyH = estimateTotalHeight(bodyEls, input.containerWidthPx);
    const total = fixedHeight + bodyH + optionalHeight;
    if (total <= input.budgetPx) {
      return { bodyFontSize: px, dropSub: false, fits: true, estimatedHeight: total };
    }
  }
  // Even at minPx with optional, doesn't fit. Try again dropping optional.
  if (input.optional) {
    for (let px = input.maxBodyPx; px >= input.minBodyPx; px -= step) {
      const bodyEls = input.body.map(el => ({ ...el, fontSize: px }));
      const bodyH = estimateTotalHeight(bodyEls, input.containerWidthPx);
      const total = fixedHeight + bodyH;
      if (total <= input.budgetPx) {
        return { bodyFontSize: px, dropSub: true, fits: true, estimatedHeight: total };
      }
    }
  }
  // Nothing fits — accept minPx + drop optional, let CSS clip the rest.
  const lastBody = input.body.map(el => ({ ...el, fontSize: input.minBodyPx }));
  const total = fixedHeight + estimateTotalHeight(lastBody, input.containerWidthPx);
  return {
    bodyFontSize: input.minBodyPx,
    dropSub: !!input.optional,
    fits: false,
    estimatedHeight: total,
  };
}
