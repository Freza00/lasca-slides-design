// ============================================================================
// Lasca — PDF faithful import via pdfjs-dist text layer
// ============================================================================
// For each page of a PDF we extract the text content (with positions and
// font sizes) and emit absolutely-positioned <span>s inside a relative div.
// The resulting rawHtml mirrors the shape of @jvmr/pptx-to-html output so
// Canvas.tsx's pptx-faithful interaction code (drag, edit, theme filter,
// image-escape layer) works unchanged.
// ----------------------------------------------------------------------------

import type { Slide, PdfPageSize, DeckPageSize } from '../types';
import { logger } from '../logger';

/**
 * A PDF is either a horizontal slide deck (exported from PPT/Keynote) or
 * a vertical report (letter / a4 / etc.). We treat these as two different
 * products — different IntentChooser copy, different Canvas orientation,
 * different export paper size. The split is decided from the first page's
 * aspect ratio; users can override it from the editor status bar.
 */
export type PdfKind = 'slide' | 'report';

export interface ParsePdfFaithfulResult {
  slides: Slide[];
  kind: PdfKind;
  /** Deck-level page size derived from the first page + kind. */
  deckPageSize: DeckPageSize;
  /** Required when deckPageSize === 'custom'. */
  deckPageWidth?: number;
  deckPageHeight?: number;
  warning?: string;
}

/** First-page aspect-ratio heuristic. w/h > 1.1 → slide; else → report. */
export function detectPdfKind(w: number, h: number): PdfKind {
  if (h <= 0) return 'slide';
  return w / h > 1.1 ? 'slide' : 'report';
}

/**
 * Derive a deck-level pageSize from the detected kind + first-page dims.
 * - slide + ≈16:9    → 'slide-16:9' (native Lasca 960×540 semantics)
 * - slide + other    → 'custom' (preserves raw aspect: 4:3, 16:10, etc.)
 * - report + letter  → 'letter'
 * - report + a4      → 'a4'
 * - report + other   → 'custom' (preserves raw aspect)
 */
export function deriveDeckPageSize(
  kind: PdfKind,
  w: number,
  h: number,
): { deckPageSize: DeckPageSize; deckPageWidth?: number; deckPageHeight?: number } {
  if (kind === 'slide') {
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) < 0.02) return { deckPageSize: 'slide-16:9' };
    return { deckPageSize: 'custom', deckPageWidth: w, deckPageHeight: h };
  }
  // report
  if (Math.abs(w - 612) < 5 && Math.abs(h - 792) < 5) return { deckPageSize: 'letter' };
  if (Math.abs(w - 595) < 5 && Math.abs(h - 842) < 5) return { deckPageSize: 'a4' };
  return { deckPageSize: 'custom', deckPageWidth: w, deckPageHeight: h };
}

/** Detect standard page sizes from PDF points (1pt = 1/72 inch). */
function detectPageSize(w: number, h: number): PdfPageSize {
  // Letter = 612×792, A4 = 595.28×841.89 (±5pt tolerance)
  if (Math.abs(w - 612) < 5 && Math.abs(h - 792) < 5) return 'letter';
  if (Math.abs(w - 595) < 5 && Math.abs(h - 842) < 5) return 'a4';
  return 'custom';
}

/** Escape a string for safe inclusion in an HTML attribute or text node. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Lightweight local types — avoids pulling pdfjs-dist types into the public
// surface of this file (the dynamic import returns `any` at runtime).
interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
  hasEOL?: boolean;
}

// ---------------------------------------------------------------------------
// Image extraction helpers (v2.3)
// ---------------------------------------------------------------------------
// pdfjs exposes each page's drawing as an "operator list" — a flat array of
// ops like save/restore/transform/paintImageXObject. To recover the device-
// space bounding box of each painted image we walk the list while maintaining
// a CTM (current transformation matrix) stack via save/restore/transform, and
// at every paintImage* op we read the current CTM. Under the standard PDF
// imaging model, the image's unit square [0,0]→[1,1] in user space lands at
// the CTM's own basis vectors, so axis-aligned images produce a bbox of
// (e, f, |a|, |d|). This is the canonical trick for pulling image rects out
// of a PDF operator stream.
// ---------------------------------------------------------------------------

interface ExtractedImageTag {
  /** Ready-to-append HTML string, or null if extraction failed for this op. */
  html: string | null;
}

function multiplyMatrix(m1: number[], m2: number[]): number[] {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function isJpegStream(data: Uint8Array | Uint8ClampedArray): boolean {
  // JPEG SOI marker: 0xFF 0xD8
  return data.length > 3 && data[0] === 0xff && data[1] === 0xd8;
}

function isPngStream(data: Uint8Array | Uint8ClampedArray): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return (
    data.length > 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  );
}

function base64Encode(data: Uint8Array | Uint8ClampedArray): string {
  // Chunked to avoid "Maximum call stack size" on large images.
  let out = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < data.length; i += CHUNK) {
    out += String.fromCharCode(...data.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

/**
 * Convert various pdfjs pixel buffer layouts into RGBA bytes suitable for
 * ImageData. Returns null for unknown `kind` values so the caller can bail.
 * pdfjs ImageKind enum (src/shared/util.js):
 *   1 = GRAYSCALE_1BPP
 *   2 = RGB_24BPP
 *   3 = RGBA_32BPP
 */
function toRgba(
  data: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  kind: number | undefined,
): Uint8ClampedArray<ArrayBuffer> | null {
  const totalPixels = width * height;
  // All paths allocate a fresh `Uint8ClampedArray(length)` (giving us a
  // `<ArrayBuffer>` backing) and copy bytes in. We never return a view
  // over the source buffer — that would (a) alias with pdfjs's internal
  // storage and (b) produce a `<ArrayBufferLike>` type which the ImageData
  // constructor rejects in strict TS.
  if (kind === 3 && data.length >= totalPixels * 4) {
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    for (let i = 0; i < totalPixels * 4; i++) rgba[i] = data[i];
    return rgba;
  }
  if (kind === 2 && data.length >= totalPixels * 3) {
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    for (let i = 0, j = 0; i < totalPixels; i++, j += 3) {
      rgba[i * 4] = data[j];
      rgba[i * 4 + 1] = data[j + 1];
      rgba[i * 4 + 2] = data[j + 2];
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  if (kind === 1) {
    // 1bpp bit-packed grayscale — used for masks, scans, etc.
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    for (let i = 0; i < totalPixels; i++) {
      const bit = (data[i >> 3] >> (7 - (i & 7))) & 1;
      const v = bit ? 255 : 0;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }
  // If `kind` is missing but the buffer length matches a plain RGBA
  // layout, try it — newer pdfjs sometimes omits `kind` on ImageBitmap-
  // adjacent paths.
  if (data.length >= totalPixels * 4) {
    const rgba = new Uint8ClampedArray(totalPixels * 4);
    for (let i = 0; i < totalPixels * 4; i++) rgba[i] = data[i];
    return rgba;
  }
  return null;
}

/**
 * Turn one pdfjs image object + CTM into an <img> HTML string. Handles the
 * three shapes pdfjs can surface: raw JPEG/PNG byte streams, ImageBitmap,
 * and raw pixel buffers with a `kind` tag.
 */
function emitFromImgObj(
  imgObj: unknown,
  ctm: number[],
  pageIdx: number,
  imgIdx: number,
  viewportHeight: number,
): ExtractedImageTag {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const img = imgObj as any;
  if (!img) return { html: null };

  const width = img.width || img.bitmap?.width;
  const height = img.height || img.bitmap?.height;
  if (!width || !height) return { html: null };

  let dataUrl: string | null = null;
  try {
    // Fast path A: raw JPEG stream — base64 directly (no canvas round-trip).
    if (img.data && isJpegStream(img.data)) {
      dataUrl = `data:image/jpeg;base64,${base64Encode(img.data)}`;
    }
    // Fast path B: raw PNG stream (some decoders keep the original bytes).
    else if (img.data && isPngStream(img.data)) {
      dataUrl = `data:image/png;base64,${base64Encode(img.data)}`;
    }
    // Fast path C: ImageBitmap from newer pdfjs decoders.
    else if (img.bitmap) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { html: null };
      ctx.drawImage(img.bitmap, 0, 0);
      dataUrl = canvas.toDataURL('image/png');
    }
    // Slow path: raw pixel buffer → ImageData → toDataURL.
    else if (img.data) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { html: null };
      const rgba = toRgba(img.data, width, height, img.kind);
      if (!rgba) return { html: null };
      const imageData = new ImageData(rgba, width, height);
      ctx.putImageData(imageData, 0, 0);
      // PNG preserves alpha; JPEG would be smaller but lose transparency.
      dataUrl = canvas.toDataURL('image/png');
    }
  } catch {
    return { html: null };
  }

  if (!dataUrl) return { html: null };

  // Compute device-space bbox from CTM. For axis-aligned images a/d are
  // non-zero and b/c are zero; for skewed/rotated cases v2.3 still falls
  // back to the axis-aligned bbox (|a| × |d|) which is "good enough" given
  // that users can't rotate images in Canvas anyway.
  const [a, , , d, e, f] = ctm;
  const boxW = Math.abs(a);
  const boxH = Math.abs(d);
  const x = e;
  const yBottom = f;

  // Flip Y: PDF origin is bottom-left, HTML origin is top-left.
  const top = viewportHeight - yBottom - boxH;

  // Sanity: skip micro-images that are likely decorative artifacts or masks.
  if (boxW < 2 || boxH < 2) return { html: null };

  const html =
    `<img data-field="pdf.p${pageIdx}.img${imgIdx}" ` +
    `src="${dataUrl}" ` +
    `style="position:absolute;left:${x.toFixed(2)}px;top:${top.toFixed(2)}px;` +
    `width:${boxW.toFixed(2)}px;height:${boxH.toFixed(2)}px;` +
    `object-fit:contain;pointer-events:auto;user-select:none;" />`;

  return { html };
}

/**
 * Resolve a named image XObject from the page's object stores. pdfjs keeps
 * per-page images in `page.objs` and cross-page shared ones in
 * `page.commonObjs`; we try the page first then fall through.
 */
async function resolveAndEmit(
  page: unknown,
  name: string,
  ctm: number[],
  pageIdx: number,
  imgIdx: number,
  viewportHeight: number,
): Promise<ExtractedImageTag> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = page as any;
  let imgObj: unknown = null;
  try {
    imgObj = await new Promise((resolve) => {
      try {
        p.objs.get(name, (obj: unknown) => resolve(obj));
      } catch {
        resolve(null);
      }
    });
  } catch {
    imgObj = null;
  }
  if (!imgObj) {
    try {
      imgObj = await new Promise((resolve) => {
        try {
          p.commonObjs.get(name, (obj: unknown) => resolve(obj));
        } catch {
          resolve(null);
        }
      });
    } catch {
      imgObj = null;
    }
  }
  if (!imgObj) return { html: null };
  return emitFromImgObj(imgObj, ctm, pageIdx, imgIdx, viewportHeight);
}

/**
 * Walk a page's operator list, track the CTM via save/restore/transform,
 * and emit an <img> tag for each paintImage* op we can decode.
 */
async function extractPageImages(
  page: unknown,
  ops: { fnArray: number[]; argsArray: unknown[][] },
  pdfjs: { OPS: Record<string, number> },
  pageIdx: number,
  viewportHeight: number,
): Promise<ExtractedImageTag[]> {
  const OPS = pdfjs.OPS;
  const PAINT_IMAGE_XOBJECT = OPS.paintImageXObject;
  const PAINT_INLINE_IMAGE = OPS.paintInlineImageXObject;
  const PAINT_IMAGE_REPEAT = OPS.paintImageXObjectRepeat;
  const SAVE = OPS.save;
  const RESTORE = OPS.restore;
  const TRANSFORM = OPS.transform;

  // CTM stack — each entry is [a, b, c, d, e, f] (pdfjs 6-value affine).
  const ctmStack: number[][] = [[1, 0, 0, 1, 0, 0]];
  let ctm = ctmStack[0];

  const results: ExtractedImageTag[] = [];
  let imgIdx = 0;

  for (let opIdx = 0; opIdx < ops.fnArray.length; opIdx++) {
    const op = ops.fnArray[opIdx];
    const args = ops.argsArray[opIdx] as unknown[];

    if (op === SAVE) {
      ctmStack.push(ctm.slice());
      continue;
    }
    if (op === RESTORE) {
      if (ctmStack.length > 1) ctmStack.pop();
      ctm = ctmStack[ctmStack.length - 1];
      continue;
    }
    if (op === TRANSFORM) {
      ctm = multiplyMatrix(ctm, args as number[]);
      ctmStack[ctmStack.length - 1] = ctm;
      continue;
    }

    if (op === PAINT_IMAGE_XOBJECT || op === PAINT_IMAGE_REPEAT) {
      const name = args[0] as string;
      if (typeof name === 'string') {
        const tag = await resolveAndEmit(
          page, name, ctm, pageIdx, imgIdx, viewportHeight,
        );
        results.push(tag);
        imgIdx++;
      } else {
        results.push({ html: null });
        imgIdx++;
      }
      continue;
    }
    if (op === PAINT_INLINE_IMAGE) {
      const imgObj = args[0];
      const tag = emitFromImgObj(imgObj, ctm, pageIdx, imgIdx, viewportHeight);
      results.push(tag);
      imgIdx++;
      continue;
    }
    // Unsupported in v2.3: paintImageMaskXObject, image groups, soft masks.
    // Those produce no entry here, so they don't count as "extracted" nor
    // as "missing" (v2.3 leaves silent skip for pure masks, which are
    // usually decorative / clipping-only).
  }

  return results;
}

// ---------------------------------------------------------------------------
// Vector path extraction (v2.4.3)
// ---------------------------------------------------------------------------
// pdfjs' operator list contains not just image ops but also all the drawing
// primitives: moveTo / lineTo / curveTo / rectangle / fill / stroke / etc.
// In pdfjs 5.x these are batched inside `constructPath` ops (op 91) whose
// args are [paintOp, [Float32Array pathBuffer], [minX minY maxX maxY]].
// The pathBuffer uses a DrawOPS-style packed format where coordinates are
// ALREADY in device space (CTM was applied on the worker side before being
// sent over). That means we can directly convert them to page-coordinate
// HTML elements — no CTM math needed here, only a Y-flip from PDF's
// bottom-left origin to HTML's top-left.
//
// We also track color state via setFillRGBColor / setFillGray /
// setFillCMYKColor (and corresponding stroke ops) + setLineWidth, plus
// save/restore for the color stack.
//
// For axis-aligned rectangles we emit lightweight <div>s with background.
// For general paths (curved lines, diagonal shapes) we emit <svg><path>.
// Both get a data-field attribute so findBlock picks them up in Canvas.
// ---------------------------------------------------------------------------

// DrawOPS enum from pdfjs (pdf.worker.mjs:330)
const DRAW_OPS_MOVE = 0;
const DRAW_OPS_LINE = 1;
const DRAW_OPS_CURVE = 2;
// const DRAW_OPS_QUAD = 3;  // pdfjs converts to cubic internally
const DRAW_OPS_CLOSE = 4;

interface GfxState {
  fillRgb: string;     // "rgb(R,G,B)" or "none"
  strokeRgb: string;
  lineWidth: number;
  fillAlpha: number;
  strokeAlpha: number;
}

interface VectorTag {
  html: string;
}

/**
 * Walk the operator list and extract filled/stroked vector paths as HTML
 * elements (div for rects, svg for general paths). Returns an array of
 * ready-to-append HTML fragments, in paint order.
 */
function extractPageVectors(
  ops: { fnArray: number[]; argsArray: unknown[][] },
  pdfjs: { OPS: Record<string, number> },
  pageIdx: number,
  viewportHeight: number,
): VectorTag[] {
  const OPS = pdfjs.OPS;
  const CONSTRUCT_PATH = OPS.constructPath;       // 91
  const SAVE = OPS.save;                           // 10
  const RESTORE = OPS.restore;                     // 11
  const SET_FILL_RGB = OPS.setFillRGBColor;        // 59
  const SET_FILL_GRAY = OPS.setFillGray;           // 57
  const SET_FILL_CMYK = OPS.setFillCMYKColor;      // 61
  const SET_STROKE_RGB = OPS.setStrokeRGBColor;    // 58
  const SET_STROKE_GRAY = OPS.setStrokeGray;       // 56
  const SET_STROKE_CMYK = OPS.setStrokeCMYKColor;  // 60
  const SET_LINE_WIDTH = OPS.setLineWidth;          // 2
  const SET_FILL_ALPHA = OPS.setGState;             // 9 — carries alpha via dict
  // Fill/stroke ops (standalone, not inside constructPath)
  const FILL = OPS.fill;                            // 22
  const EO_FILL = OPS.eoFill;                       // 23
  const STROKE = OPS.stroke;                        // 20
  const FILL_STROKE = OPS.fillStroke;               // 24
  const EO_FILL_STROKE = OPS.eoFillStroke;          // 25
  // Legacy individual path ops (pdfjs may still emit them in some codepaths)
  const RECTANGLE = OPS.rectangle;                  // 19

  const defaultState: GfxState = {
    fillRgb: 'rgb(0,0,0)',
    strokeRgb: 'rgb(0,0,0)',
    lineWidth: 1,
    fillAlpha: 1,
    strokeAlpha: 1,
  };
  const stateStack: GfxState[] = [{ ...defaultState }];
  let gs = stateStack[0];

  const results: VectorTag[] = [];
  let shapeIdx = 0;

  // Pending path segments collected from standalone ops (moveTo..rectangle)
  // or from constructPath's packed buffer. We accumulate them and flush on
  // fill/stroke/endPath.
  let pendingPath: { type: 'rect'; x: number; y: number; w: number; h: number }[] = [];

  // Emit an axis-aligned rect as a <div>
  function emitRect(
    x: number, yBottom: number, w: number, h: number,
    doFill: boolean, doStroke: boolean,
  ): void {
    if (w < 1 && h < 1) return; // skip sub-pixel artifacts
    const top = viewportHeight - yBottom - h;
    const fill = doFill ? gs.fillRgb : 'transparent';
    const opacity = doFill ? gs.fillAlpha : gs.strokeAlpha;
    let border = '';
    if (doStroke && gs.lineWidth > 0) {
      border = `border:${gs.lineWidth}px solid ${gs.strokeRgb};box-sizing:border-box;`;
    }
    const opacityStyle = opacity < 0.99 ? `opacity:${opacity.toFixed(2)};` : '';
    results.push({
      html:
        `<div data-field="pdf.p${pageIdx}.s${shapeIdx}" ` +
        `style="position:absolute;left:${x.toFixed(1)}px;top:${top.toFixed(1)}px;` +
        `width:${Math.abs(w).toFixed(1)}px;height:${Math.abs(h).toFixed(1)}px;` +
        `background:${fill};${border}${opacityStyle}pointer-events:auto;"></div>`,
    });
    shapeIdx++;
  }

  // Emit a general SVG path
  function emitSvgPath(
    d: string,
    bbox: { minX: number; minY: number; maxX: number; maxY: number },
    doFill: boolean, doStroke: boolean,
  ): void {
    const bw = bbox.maxX - bbox.minX;
    const bh = bbox.maxY - bbox.minY;
    if (bw < 1 && bh < 1) return;
    const top = viewportHeight - bbox.maxY;
    const fill = doFill ? gs.fillRgb : 'none';
    const stroke = doStroke ? `stroke="${gs.strokeRgb}" stroke-width="${gs.lineWidth}"` : '';
    const opacity = doFill ? gs.fillAlpha : gs.strokeAlpha;
    const opacityAttr = opacity < 0.99 ? ` opacity="${opacity.toFixed(2)}"` : '';
    results.push({
      html:
        `<svg data-field="pdf.p${pageIdx}.s${shapeIdx}" ` +
        `style="position:absolute;left:${bbox.minX.toFixed(1)}px;top:${top.toFixed(1)}px;` +
        `width:${bw.toFixed(1)}px;height:${bh.toFixed(1)}px;overflow:visible;pointer-events:auto;" ` +
        `viewBox="${bbox.minX.toFixed(1)} ${(viewportHeight - bbox.maxY).toFixed(1)} ${bw.toFixed(1)} ${bh.toFixed(1)}"` +
        `${opacityAttr}>` +
        `<path d="${d}" fill="${fill}" ${stroke}/>` +
        `</svg>`,
    });
    shapeIdx++;
  }

  // Process a constructPath packed buffer
  function processConstructPath(
    paintOp: number,
    buffer: Float32Array | null,
    minMax: Float32Array | null,
  ): void {
    if (!buffer || buffer.length === 0) return;

    const doFill = paintOp === FILL || paintOp === EO_FILL ||
                   paintOp === FILL_STROKE || paintOp === EO_FILL_STROKE ||
                   paintOp === (OPS.closeFillStroke ?? 26) ||
                   paintOp === (OPS.closeEOFillStroke ?? 27);
    const doStroke = paintOp === STROKE || paintOp === FILL_STROKE ||
                     paintOp === EO_FILL_STROKE ||
                     paintOp === (OPS.closeStroke ?? 21) ||
                     paintOp === (OPS.closeFillStroke ?? 26) ||
                     paintOp === (OPS.closeEOFillStroke ?? 27);
    // endPath (28) = no paint, just discard
    if (paintOp === (OPS.endPath ?? 28)) return;

    // Try to detect a single rectangle in the buffer
    // Pattern: moveTo x y, lineTo x2 y, lineTo x2 y2, lineTo x y2, closePath
    // Or: the legacy rectangle op encoded as 4 numbers (x, y, w, h) inline
    // For simplicity: if minMax gives a tight bbox and the buffer has ≤ ~14
    // entries (move + 3 lines + close), treat it as a rect candidate.
    if (minMax && buffer.length <= 14) {
      // Check if all coords lie on the bbox edges (axis-aligned rect test)
      const [bMinX, bMinY, bMaxX, bMaxY] = minMax;
      let allOnEdge = true;
      let i = 0;
      while (i < buffer.length) {
        const op = buffer[i];
        if (op === DRAW_OPS_MOVE || op === DRAW_OPS_LINE) {
          const px = buffer[i + 1];
          const py = buffer[i + 2];
          const onX = Math.abs(px - bMinX) < 0.5 || Math.abs(px - bMaxX) < 0.5;
          const onY = Math.abs(py - bMinY) < 0.5 || Math.abs(py - bMaxY) < 0.5;
          if (!onX && !onY) { allOnEdge = false; break; }
          i += 3;
        } else if (op === DRAW_OPS_CLOSE) {
          i += 1;
        } else {
          allOnEdge = false; break;
        }
      }
      if (allOnEdge && (bMaxX - bMinX) >= 1 && (bMaxY - bMinY) >= 1) {
        emitRect(bMinX, bMinY, bMaxX - bMinX, bMaxY - bMinY, doFill, doStroke);
        return;
      }
    }

    // General path — build SVG `d` string. Coordinates in the buffer are
    // already in device space (PDF bottom-left origin). We need to Y-flip
    // them to HTML top-left. We'll set the SVG viewBox in flipped coords.
    let d = '';
    let pMinX = Infinity, pMinY = Infinity, pMaxX = -Infinity, pMaxY = -Infinity;
    let i = 0;
    const flipY = (y: number) => viewportHeight - y;
    while (i < buffer.length) {
      const op = buffer[i];
      if (op === DRAW_OPS_MOVE) {
        const x = buffer[i + 1], y = flipY(buffer[i + 2]);
        d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
        pMinX = Math.min(pMinX, x); pMinY = Math.min(pMinY, y);
        pMaxX = Math.max(pMaxX, x); pMaxY = Math.max(pMaxY, y);
        i += 3;
      } else if (op === DRAW_OPS_LINE) {
        const x = buffer[i + 1], y = flipY(buffer[i + 2]);
        d += `L${x.toFixed(1)} ${y.toFixed(1)}`;
        pMinX = Math.min(pMinX, x); pMinY = Math.min(pMinY, y);
        pMaxX = Math.max(pMaxX, x); pMaxY = Math.max(pMaxY, y);
        i += 3;
      } else if (op === DRAW_OPS_CURVE) {
        const cx1 = buffer[i + 1], cy1 = flipY(buffer[i + 2]);
        const cx2 = buffer[i + 3], cy2 = flipY(buffer[i + 4]);
        const x = buffer[i + 5], y = flipY(buffer[i + 6]);
        d += `C${cx1.toFixed(1)} ${cy1.toFixed(1)} ${cx2.toFixed(1)} ${cy2.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
        pMinX = Math.min(pMinX, cx1, cx2, x);
        pMinY = Math.min(pMinY, cy1, cy2, y);
        pMaxX = Math.max(pMaxX, cx1, cx2, x);
        pMaxY = Math.max(pMaxY, cy1, cy2, y);
        i += 7;
      } else if (op === DRAW_OPS_CLOSE) {
        d += 'Z';
        i += 1;
      } else {
        // Unknown draw op — skip one value and hope for the best
        i += 1;
      }
    }
    if (!d) return;
    emitSvgPath(d, { minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY }, doFill, doStroke);
  }

  // ---- Main op walk ----
  for (let opIdx = 0; opIdx < ops.fnArray.length; opIdx++) {
    const op = ops.fnArray[opIdx];
    const args = ops.argsArray[opIdx];

    if (op === SAVE) {
      stateStack.push({ ...gs });
      continue;
    }
    if (op === RESTORE) {
      if (stateStack.length > 1) stateStack.pop();
      gs = stateStack[stateStack.length - 1];
      continue;
    }

    // Color state
    if (op === SET_FILL_RGB) {
      const [r, g, b] = args as number[];
      gs.fillRgb = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      continue;
    }
    if (op === SET_STROKE_RGB) {
      const [r, g, b] = args as number[];
      gs.strokeRgb = `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
      continue;
    }
    if (op === SET_FILL_GRAY) {
      const g255 = Math.round((args[0] as number) * 255);
      gs.fillRgb = `rgb(${g255},${g255},${g255})`;
      continue;
    }
    if (op === SET_STROKE_GRAY) {
      const g255 = Math.round((args[0] as number) * 255);
      gs.strokeRgb = `rgb(${g255},${g255},${g255})`;
      continue;
    }
    if (op === SET_FILL_CMYK) {
      const [c, m, y, k] = args as number[];
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      gs.fillRgb = `rgb(${r},${g},${b})`;
      continue;
    }
    if (op === SET_STROKE_CMYK) {
      const [c, m, y, k] = args as number[];
      const r = Math.round(255 * (1 - c) * (1 - k));
      const g = Math.round(255 * (1 - m) * (1 - k));
      const b = Math.round(255 * (1 - y) * (1 - k));
      gs.strokeRgb = `rgb(${r},${g},${b})`;
      continue;
    }
    if (op === SET_LINE_WIDTH) {
      gs.lineWidth = args[0] as number;
      continue;
    }

    // constructPath — the batched path op in pdfjs 5.x
    if (op === CONSTRUCT_PATH) {
      const paintOp = args[0] as number;
      const bufferArr = args[1] as (Float32Array | null)[];
      const minMaxArr = args[2] as Float32Array | null;
      // args[1] is an array of Float32Arrays (usually length 1)
      const buffer = bufferArr?.[0] ?? null;
      processConstructPath(paintOp, buffer, minMaxArr);
      continue;
    }

    // Legacy standalone rectangle op (some codepaths still emit it)
    if (op === RECTANGLE) {
      const [x, y, w, h] = args as number[];
      pendingPath.push({ type: 'rect', x, y, w, h });
      continue;
    }
    // Standalone fill/stroke flush pendingPath
    if (op === FILL || op === EO_FILL || op === STROKE ||
        op === FILL_STROKE || op === EO_FILL_STROKE) {
      const doFill = op === FILL || op === EO_FILL || op === FILL_STROKE || op === EO_FILL_STROKE;
      const doStroke = op === STROKE || op === FILL_STROKE || op === EO_FILL_STROKE;
      for (const p of pendingPath) {
        emitRect(p.x, p.y, p.w, p.h, doFill, doStroke);
      }
      pendingPath = [];
      continue;
    }
    if (op === (OPS.endPath ?? 28)) {
      pendingPath = [];
      continue;
    }

    // GState dict may carry fill/stroke alpha
    if (op === SET_FILL_ALPHA && Array.isArray(args) && args.length > 0) {
      const dictArr = args as unknown[];
      if (dictArr[0] && typeof dictArr[0] === 'object') {
        const dict = dictArr[0] as Record<string, unknown>;
        if (typeof dict.ca === 'number') gs.fillAlpha = dict.ca;
        if (typeof dict.CA === 'number') gs.strokeAlpha = dict.CA;
      }
      continue;
    }
  }

  return results;
}

// pdfjs-dist 5.x depends on `Map.prototype.getOrInsertComputed` and
// `Map.prototype.getOrInsert` (TC39 Stage 2/3 proposal, shipped in V8 ~12.4
// / Chrome 124+). Users on older browsers or embedded WebViews fall into a
// "this._intentStates.getOrInsertComputed is not a function" crash the very
// first time anything calls `getOperatorList`. Since the proposal is
// well-specified and idempotent we can polyfill it before pdfjs ever runs.
function polyfillMapGetOrInsertComputed() {
  const mp = Map.prototype as unknown as Record<string, unknown>;
  if (typeof mp.getOrInsertComputed !== 'function') {
    mp.getOrInsertComputed = function (
      this: Map<unknown, unknown>,
      key: unknown,
      compute: (k: unknown) => unknown,
    ) {
      if (this.has(key)) return this.get(key);
      const v = compute(key);
      this.set(key, v);
      return v;
    };
  }
  if (typeof mp.getOrInsert !== 'function') {
    mp.getOrInsert = function (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) {
      if (this.has(key)) return this.get(key);
      this.set(key, value);
      return value;
    };
  }
}

// pdfjs-dist 5.x has initialization bugs when loaded through webpack/turbopack's
// module graph — it throws "Object.defineProperty called on non-object" the
// first time something calls its `shadow()` helper. The robust workaround is
// to load pdf.min.mjs + pdf.worker.min.mjs directly from the node_modules
// path as a browser ESM module, bypassing the bundler's module-wrapping
// entirely. We cache the loaded module on `window` so we only do this once.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pdfjsCache: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfJs(): Promise<any> {
  if (pdfjsCache) return pdfjsCache;
  // Install the Map polyfill BEFORE pdfjs touches anything — it's idempotent
  // and a no-op on runtimes that already have the method.
  polyfillMapGetOrInsertComputed();
  // Resolve URLs via new URL(..., import.meta.url) so the bundler still
  // fingerprints the file paths, but we import() them as raw ESM scripts
  // rather than module-graph entries.
  const pdfUrl = new URL('pdfjs-dist/build/pdf.min.mjs', import.meta.url).toString();
  const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  // Use a dynamic import with a variable — this becomes a runtime fetch
  // rather than a bundler resolved graph node, which avoids the shadow()
  // initialization bug.
  const mod = await import(/* webpackIgnore: true */ /* @vite-ignore */ pdfUrl);
  const pdfjs = mod.default ?? mod;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  pdfjsCache = pdfjs;
  return pdfjs;
}

// ---------------------------------------------------------------------------
// Text grouping — group pdfjs per-item text fragments into line-level spans.
// ---------------------------------------------------------------------------
// pdfjs's getTextContent() returns items at whatever granularity the PDF's
// text objects were encoded at — often per-word or per-glyph. Emitting one
// <span> per item makes the editor feel broken: you click to edit a word
// and get a 3-character fragment. We group by baseline (same visual line)
// then concatenate with implicit spaces based on horizontal gaps.
// ---------------------------------------------------------------------------
interface LinePart {
  x: number;
  width: number;
  str: string;
  fontSize: number;
  fontName: string;
}
interface Line {
  yBaseline: number;
  maxFontSize: number;
  minX: number;
  parts: LinePart[];
}

function groupItemsIntoLines(items: TextItem[]): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const a = item.transform[0] ?? 1;
    const d = item.transform[3] ?? 1;
    const x = item.transform[4] ?? 0;
    const yBottom = item.transform[5] ?? 0;
    const fontSize = Math.abs(d) || 12;
    // Rough width fallback when pdfjs doesn't provide one.
    const width = item.width || Math.abs(a) * item.str.length * 0.5;
    const fontName = item.fontName && /^[A-Za-z0-9_\-]+$/.test(item.fontName)
      ? item.fontName
      : 'sans-serif';

    // Match existing line whose baseline is within half a font size.
    // Using a tolerance proportional to font size handles mixed-size lines
    // (e.g. a large heading with a smaller superscript) reasonably.
    const tol = fontSize * 0.5;
    let line = lines.find(l => Math.abs(l.yBaseline - yBottom) < tol);
    if (!line) {
      line = { yBaseline: yBottom, maxFontSize: fontSize, minX: x, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x, width, str: item.str, fontSize, fontName });
    if (fontSize > line.maxFontSize) line.maxFontSize = fontSize;
    if (x < line.minX) line.minX = x;
  }
  return lines;
}

function buildLineText(line: Line): string {
  // Sort by x so reading order is preserved.
  const parts = [...line.parts].sort((a, b) => a.x - b.x);
  let text = '';
  let prevEnd = -Infinity;
  for (const p of parts) {
    if (prevEnd > -Infinity) {
      const gap = p.x - prevEnd;
      // Gap wider than ~30% of the font height is probably a real space
      // the PDF didn't encode; insert one.
      if (gap > p.fontSize * 0.3 && !text.endsWith(' ') && !p.str.startsWith(' ')) {
        text += ' ';
      }
    }
    text += p.str;
    prevEnd = p.x + p.width;
  }
  return text;
}

// ---------------------------------------------------------------------------
// Raster layer — full-page rasterisation via pdfjs page.render().
// Produces a JPEG data-URL at 2x scale for crisp 1:1 visual fidelity.
// This is v2.4's fallback for everything pdfjs can't surface in the
// operator walk (vector paths, charts, masks, form XObjects, etc.).
// ---------------------------------------------------------------------------
const RASTER_SCALE = 2;
const RASTER_JPEG_QUALITY = 0.85;

interface PdfPageWithRender {
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> };
  getViewport: (params: { scale: number }) => { width: number; height: number };
}

async function rasterisePageToDataUrl(page: unknown): Promise<string | null> {
  try {
    const p = page as PdfPageWithRender;
    const vp = p.getViewport({ scale: RASTER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await p.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas.toDataURL('image/jpeg', RASTER_JPEG_QUALITY);
  } catch (err) {
    logger.warn('import', 'PDF 页面 raster 化失败', { error: (err as Error).message });
    return null;
  }
}

export async function parsePdfFaithful(file: File): Promise<ParsePdfFaithfulResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  logger.info('import', `PDF 加载完成`, { pages: pdf.numPages, fileSize: `${(data.length / 1024).toFixed(1)}KB` });

  const slides: Slide[] = [];
  let totalMissingImages = 0;
  let firstPageWidth = 0;
  let firstPageHeight = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    if (i === 1) {
      firstPageWidth = vp.width;
      firstPageHeight = vp.height;
    }

    // 1) Text content (critical — page is unusable without it).
    const tc = await page.getTextContent();
    const items = (tc.items || []) as TextItem[];

    // 2) Operator list (best-effort — only needed for vector-mode images).
    let ops: { fnArray: number[]; argsArray: unknown[][] } | null = null;
    try {
      ops = await page.getOperatorList();
    } catch (err) {
      logger.warn('import', `PDF 第${i}页: operator list 失败, 跳过图片`, { error: (err as Error).message });
    }

    // ------ Build the vector layer (text + extracted images) ------
    // Order is critical: extract images BEFORE rasterising the page, because
    // page.render() marks the worker-side operator-list intent complete and
    // drops the cached image objects from page.objs. If we swap these steps,
    // resolveAndEmit's page.objs.get callbacks never fire and every image
    // returns html:null. v2.4 shipped with the wrong order → missing images.

    // Group per-item text fragments into line-level spans for better
    // editability — user clicks a line, gets the whole line as a unit.
    const lines = groupItemsIntoLines(items);
    const vectorChildren: string[] = [];
    let lineIdx = 0;
    for (const line of lines) {
      const text = buildLineText(line).trim();
      if (!text) continue;
      // Baseline y is measured from page bottom; top-of-glyph ≈ baseline - fontSize
      const top = vp.height - line.yBaseline - line.maxFontSize;
      const fontName = line.parts[0]?.fontName || 'sans-serif';
      vectorChildren.push(
        `<span data-field="pdf.p${i - 1}.l${lineIdx}" ` +
        `style="position:absolute;left:${line.minX.toFixed(2)}px;top:${top.toFixed(2)}px;` +
        `font-size:${line.maxFontSize.toFixed(2)}px;color:#141413;white-space:pre;` +
        `font-family:${fontName},'Noto Sans SC',sans-serif;line-height:1;">` +
        `${escapeHtml(text)}</span>`,
      );
      lineIdx++;
    }

    // Extract images from the operator list while page.objs is still
    // populated (i.e. before page.render()). Each emitted tag becomes a
    // draggable `<img data-field="pdf.pN.imgM">` in the vector layer.
    if (ops) {
      try {
        const imageTags = await extractPageImages(
          page, ops, pdfjs, i - 1, vp.height,
        );
        for (const tag of imageTags) {
          if (tag.html) vectorChildren.push(tag.html);
          else totalMissingImages++;
        }
      } catch (err) {
        logger.warn('import', `PDF 第${i}页: 图片提取失败`, { error: (err as Error).message });
      }
    }

    // v2.4.3: extract vector shapes (rects, paths) from the operator list.
    // These go into a separate layer between the raster background and text.
    const vectorShapes: VectorTag[] = [];
    if (ops) {
      try {
        const tags = extractPageVectors(ops, pdfjs, i - 1, vp.height);
        vectorShapes.push(...tags);
      } catch (err) {
        logger.warn('import', `PDF 第${i}页: vector 提取失败`, { error: (err as Error).message });
      }
    }

    // Full-page raster (the visual-fidelity fallback). Must run AFTER
    // extractPageImages AND extractPageVectors because page.render()
    // invalidates page.objs.
    const rasterDataUrl = await rasterisePageToDataUrl(page);

    // ------ Assemble the three-layer rawHtml ------
    // z-index 0: raster bake (always visible, covers everything pdfjs can
    //            render — gradients, patterns, text hinting, etc.)
    // z-index 1: vector shapes (editable rects/paths, cover most solid fills)
    // z-index 2: vector text + extracted bitmap images (editable spans + imgs)
    const rasterLayer = rasterDataUrl
      ? `<img data-lasca-raster="1" src="${rasterDataUrl}" ` +
        `style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;` +
        `z-index:0;pointer-events:none;user-select:none;" />`
      : '';

    const shapesLayer = vectorShapes.length > 0
      ? `<div data-lasca-vector-shapes="1" style="position:absolute;inset:0;z-index:1;">` +
        `${vectorShapes.map(t => t.html).join('')}</div>`
      : '';

    const vectorLayer =
      `<div data-lasca-vector="1" style="position:absolute;inset:0;z-index:2;">` +
      `${vectorChildren.join('')}</div>`;

    const rawHtml =
      `<div style="position:relative;width:${vp.width}px;height:${vp.height}px;` +
      `background:#ffffff;overflow:hidden;">${rasterLayer}${shapesLayer}${vectorLayer}</div>`;

    slides.push({
      layout: 'pdf-faithful',
      data: {
        rawHtml,
        width: vp.width,
        height: vp.height,
        pageSize: detectPageSize(vp.width, vp.height),
        backgroundColor: '#ffffff',
        sourcePage: i - 1,
      },
    });
  }

  const kind = detectPdfKind(firstPageWidth, firstPageHeight);
  const derived = deriveDeckPageSize(kind, firstPageWidth, firstPageHeight);

  return {
    slides,
    kind,
    deckPageSize: derived.deckPageSize,
    deckPageWidth: derived.deckPageWidth,
    deckPageHeight: derived.deckPageHeight,
    warning: totalMissingImages > 0
      ? `PDF 里有 ${totalMissingImages} 张位图在可编辑模式下暂未导入（通常是遮罩 / 矢量图形 / 特殊色彩空间）。原样模式下它们通过整页光栅正常显示。`
      : undefined,
  };
}

/**
 * Lightweight PDF kind detection — loads only page 1 to read its viewport.
 * Used by IntentChooser to pick copy ("slide PDF" vs "report") BEFORE the
 * full parse runs. Typical cost < 100ms.
 */
export async function peekPdfKind(file: File): Promise<{
  kind: PdfKind;
  width: number;
  height: number;
  numPages: number;
}> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const page = await pdf.getPage(1);
  const vp = page.getViewport({ scale: 1 });
  return {
    kind: detectPdfKind(vp.width, vp.height),
    width: vp.width,
    height: vp.height,
    numPages: pdf.numPages,
  };
}

// ============================================================================
// Spatial layout matching — PDF → native Lasca slides (zero AI)
// ============================================================================
// Analyses each PDF page's spatial structure (text positions, font sizes,
// image bounding boxes) and picks the Lasca layout that most closely
// resembles the original visual arrangement.
// ============================================================================

export interface EnrichedLine {
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  x: number;
  y: number;        // top-of-page origin
  width: number;    // approximate line width
  centered: boolean; // roughly centered on page?
}

export interface ExtractedImage {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  areaRatio: number; // image area / page area
}

/** Parse an ExtractedImageTag html string into structured data. */
function parseImageTag(html: string, pageW: number, pageH: number): ExtractedImage | null {
  const srcM = html.match(/src="([^"]+)"/);
  const xM = html.match(/left:\s*([\d.]+)px/);
  const yM = html.match(/top:\s*([\d.]+)px/);
  const wM = html.match(/width:\s*([\d.]+)px/);
  const hM = html.match(/height:\s*([\d.]+)px/);
  if (!srcM || !wM || !hM) return null;
  const w = parseFloat(wM[1]);
  const h = parseFloat(hM[1]);
  return {
    dataUrl: srcM[1],
    x: xM ? parseFloat(xM[1]) : 0,
    y: yM ? parseFloat(yM[1]) : 0,
    width: w,
    height: h,
    areaRatio: (w * h) / (pageW * pageH),
  };
}

export function looksNumeric(text: string): boolean {
  return /^[\s$€¥£#%\d.,+\-×xMBKkTtbm/]+$/.test(text.trim()) && /\d/.test(text);
}

export function isCenteredOnPage(x: number, width: number, pageW: number): boolean {
  const center = x + width / 2;
  return Math.abs(center - pageW / 2) < pageW * 0.15;
}

/** Cluster numbers into groups where adjacent values are within `gap`. */
export function cluster(values: number[], gap: number): number[][] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const groups: number[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] <= gap) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  return groups;
}

/** Extract title (largest font) and classify lines into title/subtitle/body. */
export function classifyLines(lines: EnrichedLine[]) {
  if (lines.length === 0) return { title: '', subtitle: null as string | null, body: [] as EnrichedLine[] };
  const sorted = [...lines].sort((a, b) => b.fontSize - a.fontSize);
  const title = sorted[0].text;
  const titleSize = sorted[0].fontSize;
  const rest = sorted.slice(1);
  const median = rest.length > 0 ? rest[Math.floor(rest.length / 2)].fontSize : titleSize;
  const subtitle = rest.length > 0 && rest[0].fontSize >= median * 1.3 ? rest[0].text : null;
  const body = lines.filter(l => l.text !== title && l.text !== subtitle).sort((a, b) => a.y - b.y);
  return { title, subtitle, body };
}

/**
 * Spatial layout matching: analyse one PDF page and return the best-fit Slide.
 */
export function matchPageToSlide(
  lines: EnrichedLine[],
  images: ExtractedImage[],
  pageW: number,
  pageH: number,
  pageIndex: number,
): Slide {
  const pageArea = pageW * pageH;
  const { title, subtitle, body } = classifyLines(lines);
  const biggestImg = images.length > 0
    ? images.reduce((a, b) => (b.areaRatio > a.areaRatio ? b : a))
    : null;

  // --- 1. Full-bleed image ---
  if (biggestImg && biggestImg.areaRatio > 0.5 && lines.length <= 2) {
    return {
      layout: 'image',
      data: {
        title: title || '',
        subtitle: subtitle || '',
        image_url: biggestImg.dataUrl,
        overlay: 'dark',
      },
    };
  }

  // --- 2. Split image (image on one side, text on other) ---
  if (biggestImg && biggestImg.areaRatio > 0.15 && lines.length >= 1) {
    const imgCenterX = biggestImg.x + biggestImg.width / 2;
    const imgOnLeft = imgCenterX < pageW * 0.5;
    const textLines = body.length > 0 ? body : lines.filter(l => l.text !== title);
    return {
      layout: 'split-image',
      data: {
        title: title || '',
        body: textLines.map(l => l.text).join('\n'),
        image_url: biggestImg.dataUrl,
        image_prompt: '',
        imagePosition: imgOnLeft ? 'left' : 'right',
      },
    };
  }

  // --- 3. Cover (few elements, large title, centered) ---
  if (lines.length <= 3) {
    const allCentered = lines.every(l => l.centered);
    const titleDominates = lines.length === 1 ||
      (lines.length >= 2 && lines.sort((a, b) => b.fontSize - a.fontSize)[0].fontSize > lines[1].fontSize * 1.5);
    if (allCentered || titleDominates) {
      return {
        layout: 'cover',
        data: { title, subtitle: subtitle || (body[0]?.text ?? ''), footnote: body[1]?.text ?? '', author: '' },
      };
    }
  }

  // --- 4. Big number (short large text that looks numeric) ---
  if (lines.length >= 2) {
    const sorted = [...lines].sort((a, b) => b.fontSize - a.fontSize);
    const biggest = sorted[0];
    const secondSize = sorted[1]?.fontSize || biggest.fontSize;
    if (biggest.text.length <= 8 && looksNumeric(biggest.text) && biggest.fontSize > secondSize * 1.5) {
      const label = sorted.slice(1).map(l => l.text).join(' ');
      return {
        layout: 'big-number',
        data: { number: biggest.text, text: label, footnote: '' },
      };
    }
  }

  // --- 5. Table (grid pattern: ≥2 x-clusters × ≥2 y-clusters) ---
  if (lines.length >= 4) {
    const xClusters = cluster(lines.map(l => l.x), pageW * 0.08);
    const yClusters = cluster(lines.map(l => l.y), pageH * 0.04);
    if (xClusters.length >= 2 && yClusters.length >= 3) {
      // Looks like a table — build headers + rows
      const cols = xClusters.length;
      const yGroups = yClusters.map(yg => {
        const yCenter = yg.reduce((s, v) => s + v, 0) / yg.length;
        return lines.filter(l => Math.abs(l.y - yCenter) < pageH * 0.04)
                     .sort((a, b) => a.x - b.x);
      }).filter(g => g.length >= 2); // rows must span ≥2 columns

      if (yGroups.length >= 2) {
        const headers = yGroups[0].map(l => l.text);
        const rows = yGroups.slice(1).map(row => row.map(l => l.text));
        // Pad rows to match header length
        const maxCols = Math.max(headers.length, ...rows.map(r => r.length));
        while (headers.length < maxCols) headers.push('');
        rows.forEach(r => { while (r.length < maxCols) r.push(''); });
        return {
          layout: 'table',
          data: { title: title !== headers[0] ? title : '', headers, rows: rows.slice(0, 6), footnote: '' },
        };
      }
    }
  }

  // --- 6. Cards (3+ groups at roughly same y level, arranged horizontally) ---
  if (lines.length >= 3) {
    // Group by y: lines at similar y form a "row"
    const yRows = cluster(lines.map(l => l.y), pageH * 0.06);
    // Find the largest y-row (most items at the same vertical level)
    const largestRow = yRows.reduce((a, b) => (b.length > a.length ? b : a));
    if (largestRow.length >= 3) {
      // 3+ elements at the same y → likely horizontal cards
      const rowY = largestRow[0];
      const cardLines = lines.filter(l => Math.abs(l.y - rowY) < pageH * 0.06).sort((a, b) => a.x - b.x);
      // Try to find desc lines below each card
      const cards = cardLines.map((cl, i) => {
        const below = body.filter(bl =>
          Math.abs(bl.x - cl.x) < pageW * 0.1 && bl.y > cl.y && bl.y < cl.y + pageH * 0.2
        );
        return {
          label: String(i + 1),
          title: cl.text,
          desc: below.map(b => b.text).join(' ') || undefined,
        };
      });
      if (cards.length >= 3 && cards.length <= 5) {
        return {
          layout: 'three-cards',
          data: { title, cards },
        };
      }
      if (cards.length > 5) {
        return {
          layout: 'grid-cards',
          data: { title, columns: Math.min(4, cards.length) as 2 | 3 | 4, cards, footer: '' },
        };
      }
    }
  }

  // --- 7. Two-column (text clusters into left/right halves) ---
  if (body.length >= 4) {
    const leftLines = body.filter(l => l.x + l.width / 2 < pageW * 0.45);
    const rightLines = body.filter(l => l.x + l.width / 2 > pageW * 0.55);
    if (leftLines.length >= 2 && rightLines.length >= 2) {
      return {
        layout: 'two-column',
        data: {
          title,
          left: { heading: leftLines[0].text, content: leftLines.slice(1).map(l => l.text).join('\n'), sub: '' },
          right: { heading: rightLines[0].text, content: rightLines.slice(1).map(l => l.text).join('\n'), sub: '' },
          footer: '',
        },
      };
    }
  }

  // --- 8. Icon-list (lines with consistent left margin, possibly numbered/bulleted) ---
  if (body.length >= 2 && body.length <= 6) {
    const leftMargins = body.map(l => l.x);
    const consistent = leftMargins.every(m => Math.abs(m - leftMargins[0]) < pageW * 0.05);
    if (consistent) {
      // Check for leading numbers/symbols
      const items = body.map((l, i) => {
        const match = l.text.match(/^(\d+[.)\-]?|[•●○▪▸►→\-–])\s*/);
        return {
          icon: match ? match[1].replace(/[.)\-\s]/g, '') || String(i + 1) : String(i + 1),
          text: match ? l.text.slice(match[0].length) : l.text,
          sub: undefined as string | undefined,
        };
      });
      return {
        layout: 'icon-list',
        data: { title, items },
      };
    }
  }

  // --- 9. Quote (1-3 centered lines, no images) ---
  if (lines.length <= 3 && images.length === 0 && lines.every(l => l.centered)) {
    const allText = lines.map(l => l.text);
    return {
      layout: 'quote',
      data: { quote: allText[0] || '', body: allText.slice(1).join('\n') || undefined, author: '' },
    };
  }

  // --- 10. Default: title-body ---
  return {
    layout: 'title-body',
    data: {
      title,
      body: body.map(l => l.text).join('\n'),
      footnote: '',
    },
  };
}

/**
 * PDF → native editable Lasca slides via spatial layout matching.
 * Zero AI, pure client-side heuristics. Each page is analysed for its
 * spatial structure (text positions, font sizes, images) and matched
 * to the visually closest Lasca layout.
 */
export async function parsePdfToSlides(file: File): Promise<Slide[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const slides: Slide[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const pageW = vp.width;
    const pageH = vp.height;

    // 1. Text extraction
    const tc = await page.getTextContent();
    const items = (tc.items || []) as TextItem[];
    const rawLines = groupItemsIntoLines(items);

    const enrichedLines: EnrichedLine[] = rawLines.map(line => {
      const text = buildLineText(line).trim();
      const fontName = line.parts[0]?.fontName || 'sans-serif';
      const sortedParts = [...line.parts].sort((a, b) => a.x - b.x);
      const last = sortedParts[sortedParts.length - 1];
      const lineWidth = last ? (last.x + last.width) - line.minX : 0;
      return {
        text,
        fontSize: line.maxFontSize,
        fontName,
        isBold: /bold|black|heavy/i.test(fontName),
        x: line.minX,
        y: pageH - line.yBaseline - line.maxFontSize,
        width: lineWidth,
        centered: isCenteredOnPage(line.minX, lineWidth, pageW),
      };
    }).filter(l => l.text.length > 0);

    // 2. Image extraction (best-effort)
    const images: ExtractedImage[] = [];
    try {
      const ops = await page.getOperatorList();
      const imgTags = await extractPageImages(page, ops, pdfjs, i - 1, pageH);
      for (const tag of imgTags) {
        if (tag.html) {
          const parsed = parseImageTag(tag.html, pageW, pageH);
          if (parsed) images.push(parsed);
        }
      }
    } catch {
      // best-effort — continue without images
    }

    // 3. Spatial match + mark as imported
    let slide: Slide;
    if (enrichedLines.length === 0 && images.length === 0) {
      slide = { layout: 'cover', data: { title: `Page ${i}`, subtitle: '', footnote: '', author: '' } };
    } else {
      slide = matchPageToSlide(enrichedLines, images, pageW, pageH, i - 1);
    }
    slide.source = 'imported';
    slides.push(slide);
  }

  return slides;
}

// ============================================================================
// Enhanced PDF extraction for AI smart redesign (v3)
// ============================================================================
// Produces a PageAnalysis per page: structured text elements with font size,
// image elements with bounding boxes, and heuristic hints (title candidate,
// hasLargeImage, etc.). This is the input to the AI redesign pipeline.
// ============================================================================

export interface PdfTextElement {
  text: string;
  fontSize: number;
  fontName: string;
  isBold: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfImageElement {
  dataUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** image area / page area (0-1) */
  areaRatio: number;
}

export interface PageAnalysis {
  pageIndex: number;
  width: number;
  height: number;
  textElements: PdfTextElement[];
  images: PdfImageElement[];
  // Heuristic hints
  titleCandidate: string | null;
  subtitleCandidate: string | null;
  bodyLines: string[];
  hasLargeImage: boolean;
  largestImageIndex: number | null;
}

/**
 * Extract structured PageAnalysis from every page of a PDF.
 * This is the enhanced extraction for the AI smart redesign pipeline.
 * Text + images are extracted; images carry base64 data (kept client-side,
 * only metadata is sent to the AI).
 */
export async function extractPageAnalyses(file: File): Promise<PageAnalysis[]> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const results: PageAnalysis[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const pageArea = vp.width * vp.height;

    // --- Text extraction ---
    const tc = await page.getTextContent();
    const items = (tc.items || []) as TextItem[];
    const lines = groupItemsIntoLines(items);

    const textElements: PdfTextElement[] = [];
    for (const line of lines) {
      const text = buildLineText(line).trim();
      if (!text) continue;
      const top = vp.height - line.yBaseline - line.maxFontSize;
      const fontName = line.parts[0]?.fontName || 'sans-serif';
      const isBold = /bold|black|heavy/i.test(fontName);
      // Approximate width from parts
      const sortedParts = [...line.parts].sort((a, b) => a.x - b.x);
      const lastPart = sortedParts[sortedParts.length - 1];
      const lineWidth = lastPart ? (lastPart.x + lastPart.width) - line.minX : 0;

      textElements.push({
        text,
        fontSize: Math.round(line.maxFontSize * 10) / 10,
        fontName,
        isBold,
        x: Math.round(line.minX * 10) / 10,
        y: Math.round(top * 10) / 10,
        width: Math.round(lineWidth * 10) / 10,
        height: Math.round(line.maxFontSize * 10) / 10,
      });
    }

    // --- Image extraction ---
    const images: PdfImageElement[] = [];
    let ops: { fnArray: number[]; argsArray: unknown[][] } | null = null;
    try {
      ops = await page.getOperatorList();
    } catch {
      // best-effort
    }
    if (ops) {
      try {
        const imageTags = await extractPageImages(page, ops, pdfjs, i - 1, vp.height);
        for (const tag of imageTags) {
          if (tag.html) {
            // Parse position from the HTML tag's inline style
            const xMatch = tag.html.match(/left:\s*([\d.]+)px/);
            const yMatch = tag.html.match(/top:\s*([\d.]+)px/);
            const wMatch = tag.html.match(/width:\s*([\d.]+)px/);
            const hMatch = tag.html.match(/height:\s*([\d.]+)px/);
            // Extract data URL
            const srcMatch = tag.html.match(/src="([^"]+)"/);
            if (srcMatch && wMatch && hMatch) {
              const imgW = parseFloat(wMatch[1]);
              const imgH = parseFloat(hMatch[1]);
              images.push({
                dataUrl: srcMatch[1],
                x: xMatch ? parseFloat(xMatch[1]) : 0,
                y: yMatch ? parseFloat(yMatch[1]) : 0,
                width: imgW,
                height: imgH,
                areaRatio: (imgW * imgH) / pageArea,
              });
            }
          }
        }
      } catch {
        // best-effort
      }
    }

    // --- Heuristic hints ---
    // Sort by fontSize descending for title/subtitle detection
    const sortedBySize = [...textElements].sort((a, b) => b.fontSize - a.fontSize);
    const titleCandidate = sortedBySize.length > 0 ? sortedBySize[0].text : null;

    // Subtitle: second-largest font, must be ≥1.2× median body size
    const bodySizes = sortedBySize.slice(1).map(e => e.fontSize);
    const medianBody = bodySizes.length > 0
      ? bodySizes[Math.floor(bodySizes.length / 2)]
      : (sortedBySize[0]?.fontSize || 12);
    const subtitleCandidate = sortedBySize.length > 1 && sortedBySize[1].fontSize >= medianBody * 1.2
      ? sortedBySize[1].text : null;

    // Body: everything that's not title or subtitle, in reading order (top→bottom)
    const bodyTexts = textElements
      .filter(e => e.text !== titleCandidate && e.text !== subtitleCandidate)
      .sort((a, b) => a.y - b.y)
      .map(e => e.text);

    // Image hints
    const hasLargeImage = images.some(img => img.areaRatio > 0.25);
    let largestImageIndex: number | null = null;
    if (images.length > 0) {
      let maxArea = 0;
      images.forEach((img, idx) => {
        const area = img.width * img.height;
        if (area > maxArea) {
          maxArea = area;
          largestImageIndex = idx;
        }
      });
    }

    results.push({
      pageIndex: i - 1,
      width: vp.width,
      height: vp.height,
      textElements,
      images,
      titleCandidate,
      subtitleCandidate,
      bodyLines: bodyTexts,
      hasLargeImage,
      largestImageIndex,
    });
  }

  return results;
}

/**
 * Serialize PageAnalysis[] into a compact text format for the AI prompt.
 * Images are represented as metadata only (no base64 data).
 */
export function pageAnalysesToPromptText(pages: PageAnalysis[]): string {
  return pages.map(p => {
    const lines: string[] = [`=== Page ${p.pageIndex} (${Math.round(p.width)}×${Math.round(p.height)}pt) ===`];

    // Text elements sorted by fontSize desc
    const sorted = [...p.textElements].sort((a, b) => b.fontSize - a.fontSize);
    if (sorted.length > 0) {
      lines.push('Texts (by size):');
      for (const el of sorted) {
        const boldTag = el.isBold ? ', bold' : '';
        // Truncate long text to 100 chars for prompt efficiency
        const text = el.text.length > 100 ? el.text.slice(0, 100) + '…' : el.text;
        lines.push(`  [${Math.round(el.fontSize)}pt${boldTag}] "${text}"`);
      }
    } else {
      lines.push('Texts: (none)');
    }

    // Image metadata
    if (p.images.length > 0) {
      const imgDescs = p.images.map((img, idx) => {
        const pos = img.x < p.width * 0.4 ? 'left' : img.x > p.width * 0.6 ? 'right' : 'center';
        return `  [${idx}] ${Math.round(img.width)}×${Math.round(img.height)}px, ${pos} side, ${Math.round(img.areaRatio * 100)}% of page`;
      });
      lines.push(`Images: ${p.images.length}`);
      lines.push(...imgDescs);
    } else {
      lines.push('Images: none');
    }

    // Hints
    const hints: string[] = [];
    if (p.hasLargeImage) hints.push('has large image (>25% area)');
    if (p.textElements.length <= 3) hints.push('minimal text');
    if (p.textElements.length > 10) hints.push('text-heavy');
    if (p.bodyLines.length === 0 && p.titleCandidate) hints.push('title-only page');
    if (hints.length > 0) lines.push(`Hints: ${hints.join(', ')}`);

    return lines.join('\n');
  }).join('\n\n');
}
