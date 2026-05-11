// ============================================================================
// Lasca — PPTX 1:1 import (B path "保留原样 + AI 优化")
// ----------------------------------------------------------------------------
// Uses @jvmr/pptx-to-html to parse OOXML in the browser. Each slide becomes
// a self-contained HTML fragment with absolute positioning + inline styles +
// data-URL images. Fidelity is roughly ~80%; the missing 20% is by design
// what Lasca's AI polish pass repairs / improves afterwards.
//
// v2.4.3: after pptxToHtml() finishes, we open the same zip with JSZip and
// read ppt/slideMasters/slideMaster1.xml. Any non-placeholder shapes in the
// master's spTree (brand bars, decorative stripes, logos) are emitted as
// absolutely-positioned <div>s and PREPENDED to every slide's rawHtml. This
// fixes the "顶部蓝色消失" bug: those shapes lived on the master and were
// silently dropped by the parser because it only walks each slide's own
// spTree.
// ============================================================================

import { pptxToHtml } from '@jvmr/pptx-to-html';
import JSZip from 'jszip';
import type { Slide, PptxFaithfulData } from '../types';
import type { ImportResult } from '../importFile';
import { logger } from '../logger';

const TARGET_W = 960;
const TARGET_H = 540;

// EMUs (English Metric Units) per pixel — same constant pptx-to-html uses.
const EMU_PER_PX = 9525;

// ---------------------------------------------------------------------------
// Master-shape extractor
// ---------------------------------------------------------------------------

/**
 * Read the PPTX zip, parse the first slide master's shape tree, and return
 * an HTML fragment for each non-placeholder decorative shape. These shapes
 * get PREPENDED to every slide's rawHtml so they appear as the background
 * layer underneath the library's parsed content.
 *
 * Graceful: returns '' on any error so the parser output is never damaged.
 */
/**
 * Parse ppt/theme/theme1.xml and build a map from scheme-color names
 * (dk1, lt1, dk2, lt2, accent1..accent6, hlink, folHlink) to hex values.
 * Returns an empty map on failure — the caller treats missing entries as
 * "skip this shape" which is safe.
 */
async function loadThemeColors(zip: JSZip): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const themePath = Object.keys(zip.files).find(
      f => /^ppt\/theme\/theme\d+\.xml$/i.test(f),
    );
    if (!themePath) return map;
    const xml = await zip.files[themePath].async('text');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');

    // The color scheme sits under a:theme > a:themeElements > a:clrScheme.
    // Each child element's localName IS the scheme-color key and it has
    // exactly one child: either <a:srgbClr val="RRGGBB"/> or
    // <a:sysClr lastClr="RRGGBB"/>.
    const clrScheme = Array.from(doc.querySelectorAll('*')).find(
      el => el.localName === 'clrScheme',
    );
    if (!clrScheme) return map;

    for (const child of Array.from(clrScheme.children)) {
      const name = child.localName; // e.g. "dk1", "accent1", ...
      // Try srgbClr first
      const srgb = Array.from(child.querySelectorAll('*')).find(
        c => c.localName === 'srgbClr',
      );
      if (srgb) {
        const val = srgb.getAttribute('val');
        if (val) { map.set(name, val); continue; }
      }
      // Fallback: sysClr with lastClr (Windows system-color mapped value)
      const sys = Array.from(child.querySelectorAll('*')).find(
        c => c.localName === 'sysClr',
      );
      if (sys) {
        const last = sys.getAttribute('lastClr');
        if (last) map.set(name, last);
      }
    }
  } catch {
    // Non-fatal; an empty map just means we skip schemeClr shapes.
  }
  return map;
}

async function extractMasterShapes(buffer: ArrayBuffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);

    // Load theme colors so we can resolve schemeClr references
    const themeColors = await loadThemeColors(zip);

    // Read native slide size from ppt/presentation.xml (<p:sldSz cx="..." cy="..."/>)
    // so we can scale master shapes from native EMU coords to TARGET_W × TARGET_H.
    let nativeW = TARGET_W;  // fallback
    let nativeH = TARGET_H;
    try {
      const presXml = await zip.files['ppt/presentation.xml']?.async('text');
      if (presXml) {
        const presDoc = new DOMParser().parseFromString(presXml, 'application/xml');
        const sldSz = Array.from(presDoc.querySelectorAll('*')).find(
          el => el.localName === 'sldSz',
        );
        if (sldSz) {
          const cx = parseInt(sldSz.getAttribute('cx') || '0', 10);
          const cy = parseInt(sldSz.getAttribute('cy') || '0', 10);
          if (cx > 0 && cy > 0) {
            nativeW = cx / EMU_PER_PX;
            nativeH = cy / EMU_PER_PX;
          }
        }
      }
    } catch { /* use fallback */ }
    const scaleX = TARGET_W / nativeW;
    const scaleY = TARGET_H / nativeH;

    // Find the first slide master — usually ppt/slideMasters/slideMaster1.xml
    const masterPath = Object.keys(zip.files).find(
      f => /^ppt\/slideMasters\/slideMaster\d+\.xml$/i.test(f),
    );
    if (!masterPath) return '';

    const masterXml = await zip.files[masterPath].async('text');
    const parser = new DOMParser();
    const doc = parser.parseFromString(masterXml, 'application/xml');

    console.log('[lasca] Master shape extraction: found', masterPath, '| theme colors:', themeColors.size);

    // The shape tree is under p:cSld > p:spTree
    // We need to handle the OOXML namespace prefixes. DOMParser in the
    // browser doesn't always honour them; use getElementsByTagNameNS or
    // a simple query-all + local-name check.
    const shapes: string[] = [];

    // Also check slideLayout shapes — many brand bars live on the layout
    // rather than the master. Walk ALL layout files.
    const layoutPaths = Object.keys(zip.files).filter(
      f => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/i.test(f),
    );

    // Collect shapes from master + all layouts into one pass
    const xmlDocs = [doc];
    for (const lp of layoutPaths) {
      try {
        const lxml = await zip.files[lp].async('text');
        xmlDocs.push(parser.parseFromString(lxml, 'application/xml'));
      } catch { /* skip unreadable layouts */ }
    }

    console.log('[lasca] Walking', xmlDocs.length, 'XML docs (1 master +', layoutPaths.length, 'layouts)');

    // Collect all <p:sp> elements from master + layouts
    // Use a Set to deduplicate by position+size (same shape may appear in
    // both master and layout due to inheritance — we only need it once)
    const seen = new Set<string>();
    for (const xmlDoc of xmlDocs) {
    const spEls = xmlDoc.querySelectorAll('*');
    for (const el of spEls) {
      if (el.localName !== 'sp') continue;

      // Skip placeholders: if this sp has a <p:ph> descendant, it's a
      // content/title/footer placeholder that the slide overrides.
      const phEl = Array.from(el.querySelectorAll('*')).find(
        c => c.localName === 'ph',
      );
      if (phEl) continue;

      // Extract position + size from a:xfrm > a:off + a:ext
      const xfrmEl = Array.from(el.querySelectorAll('*')).find(
        c => c.localName === 'xfrm',
      );
      if (!xfrmEl) continue;

      const offEl = Array.from(xfrmEl.children).find(c => c.localName === 'off');
      const extEl = Array.from(xfrmEl.children).find(c => c.localName === 'ext');
      if (!offEl || !extEl) continue;

      const rawX = parseInt(offEl.getAttribute('x') || '0', 10) / EMU_PER_PX;
      const rawY = parseInt(offEl.getAttribute('y') || '0', 10) / EMU_PER_PX;
      const rawW = parseInt(extEl.getAttribute('cx') || '0', 10) / EMU_PER_PX;
      const rawH = parseInt(extEl.getAttribute('cy') || '0', 10) / EMU_PER_PX;
      if (rawW < 1 || rawH < 1) continue;

      // Scale from native PPT coords to TARGET_W × TARGET_H (pptxToHtml
      // outputs at this grid with scaleToFit: true).
      const x = rawX * scaleX;
      const y = rawY * scaleY;
      const w = rawW * scaleX;
      const h = rawH * scaleY;

      // Extract fill color — try srgbClr first, then schemeClr via theme lookup
      let fill = '';
      const solidFillEl = Array.from(el.querySelectorAll('*')).find(
        c => c.localName === 'solidFill',
      );
      if (solidFillEl) {
        const srgbEl = Array.from(solidFillEl.children).find(
          c => c.localName === 'srgbClr',
        );
        if (srgbEl) {
          const val = srgbEl.getAttribute('val');
          if (val) fill = `#${val}`;
        }
        if (!fill) {
          const schemeEl = Array.from(solidFillEl.children).find(
            c => c.localName === 'schemeClr',
          );
          if (schemeEl) {
            const schemeName = schemeEl.getAttribute('val'); // e.g. "accent1", "dk1"
            if (schemeName) {
              const hex = themeColors.get(schemeName);
              if (hex) fill = `#${hex}`;
            }
          }
        }
      }
      if (!fill) continue; // skip shapes with no detectable fill

      // Geometry preset
      const geomEl = Array.from(el.querySelectorAll('*')).find(
        c => c.localName === 'prstGeom',
      );
      const prst = geomEl?.getAttribute('prst') || 'rect';
      let borderRadius = '';
      if (prst === 'roundRect') borderRadius = 'border-radius:8px;';
      else if (prst === 'ellipse') borderRadius = 'border-radius:50%;';

      // Line / border
      let border = '';
      const lnEl = Array.from(el.querySelectorAll('*')).find(
        c => c.localName === 'ln' && c.parentElement?.localName === 'spPr',
      );
      if (lnEl) {
        const lnFill = Array.from(lnEl.querySelectorAll('*')).find(
          c => c.localName === 'srgbClr',
        );
        if (lnFill) {
          const lnColor = lnFill.getAttribute('val') || '000000';
          const lnW = parseInt(lnEl.getAttribute('w') || '12700', 10) / EMU_PER_PX;
          border = `border:${Math.max(1, Math.round(lnW))}px solid #${lnColor};box-sizing:border-box;`;
        }
      }

      const key = `${x.toFixed(0)},${y.toFixed(0)},${w.toFixed(0)},${h.toFixed(0)},${fill}`;
      if (seen.has(key)) continue;
      seen.add(key);

      shapes.push(
        `<div style="position:absolute;left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;` +
        `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;background:${fill};` +
        `${borderRadius}${border}pointer-events:auto;z-index:0;"></div>`,
      );
    }
    } // end for (const xmlDoc of xmlDocs)

    logger.info('import', `PPTX master/layout shapes: ${shapes.length} 个`);
    return shapes.join('');
  } catch (err) {
    logger.warn('import', 'PPTX master shape 提取失败 (非致命)', { error: (err as Error).message });
    return '';
  }
}

/** Parse a .pptx File into an array of Slides using the faithful pipeline. */
export async function parsePptxFaithful(file: File): Promise<Slide[]> {
  logger.info('import', `PPTX faithful 解析开始`, { fileName: file.name, fileSize: `${(file.size / 1024).toFixed(1)}KB` });
  const buffer = await file.arrayBuffer();
  const htmlPages = await pptxToHtml(buffer, {
    width: TARGET_W,
    height: TARGET_H,
    scaleToFit: true,
    letterbox: false,
  });

  if (!htmlPages || htmlPages.length === 0) {
    throw new Error('PPTX 解析返回空结果');
  }
  logger.info('import', `PPTX 解析完成`, { slideCount: htmlPages.length });

  // v2.4.3: extract master/layout shapes and prepend to every slide.
  const masterHtml = await extractMasterShapes(buffer);

  return htmlPages.map((rawHtml, i): Slide => {
    // v2.4.3: fix z-order. @jvmr/pptx-to-html sometimes renders a full-page
    // background <img> (from <p:pic>) on top of filled shapes, hiding them.
    // Detect any <img> that covers ≥90% of TARGET_W×TARGET_H and push it to
    // z-index:-1 so filled shape divs paint on top.
    const fixedHtml = rawHtml.replace(
      /(<img\b[^>]*style="[^"]*)(position:\s*absolute[^"]*width:\s*(\d+(?:\.\d+)?)px[^"]*height:\s*(\d+(?:\.\d+)?)px)/gi,
      (match, prefix, stylePart, w, h) => {
        const imgW = parseFloat(w);
        const imgH = parseFloat(h);
        if (imgW >= TARGET_W * 0.9 && imgH >= TARGET_H * 0.9) {
          // Full-page background image — push behind everything
          return prefix + stylePart + ';z-index:-1';
        }
        return match;
      },
    );

    const data: PptxFaithfulData = {
      rawHtml: masterHtml + fixedHtml,
      width: TARGET_W,
      height: TARGET_H,
      sourcePage: i,
    };
    return { layout: 'pptx-faithful', data, transition: 'fade' };
  });
}

/** Wrapper that returns the same shape as importFile() */
export async function importPptxFaithful(file: File): Promise<ImportResult> {
  const slides = await parsePptxFaithful(file);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return { name: baseName, slides };
}
