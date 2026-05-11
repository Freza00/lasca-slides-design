// ============================================================================
// Export a deck as a self-contained .lasca (HTML) file
// Uses transform: scale() to fill any viewport while keeping the deck's
// logical page size as the base (slide-16:9 = 960×540, letter = 612×792,
// a4 = 595×842, custom = deck.pageWidth × deck.pageHeight)
//
// N1 (2026-04-20) — Offline font inlining. When `inlineFonts: true`, the
// theme's Google Fonts families are fetched client-side (CSS2 API) and
// rewritten so every woff2 URL becomes a `data:font/woff2;base64,...` URI.
// The result is a single .lasca file that renders with the correct typography
// even without network access. Opt-in — off by default so existing export
// behavior (Google Fonts CDN link) is untouched.
// ============================================================================

import { renderSlide } from './renderSlide';
import { getLogicalDims } from './pageSize';
import { logger } from './logger';
import { THEMES } from './themes';
import type { Deck, ThemeConfig } from './types';
import type { Locale } from '@/lib/i18n';

// Google Fonts families Lasca themes reference. Families NOT on this list are
// treated as system fonts and skipped during inlining (user's machine handles
// them, or the CSS stack falls through to a generic family).
const GOOGLE_FONT_FAMILIES = new Set<string>([
  'Poppins', 'Noto Sans SC', 'Noto Serif SC',
  'Instrument Serif', 'Familjen Grotesk', 'Fraunces',
  'Plus Jakarta Sans', 'Bricolage Grotesque', 'Lora',
  'Inter', 'Source Serif 4', 'IBM Plex Sans', 'IBM Plex Mono',
  'Cormorant Garamond', 'Work Sans', 'Libre Caslon Text',
]);

// Weights to inline per family. Keeping this tight is the difference between
// a ~200KB font payload and a ~2MB one. Covers regular / medium / semibold /
// bold — the headline/body weights every Lasca theme uses in practice.
const INLINE_WEIGHTS = ['400', '500', '600', '700'];

function extractFirstFamily(stack: string): string | null {
  // e.g. "'Poppins','Noto Sans SC',sans-serif" → "Poppins"
  const match = stack.match(/^\s*'([^']+)'/);
  return match ? match[1] : null;
}

function collectUsedFamilies(theme: ThemeConfig): string[] {
  const stacks = [
    theme.fontDisplay, theme.fontHeadline, theme.fontBody,
    theme.fontLabel, theme.fontNumeric,
  ].filter((s): s is string => typeof s === 'string' && s.length > 0);
  const fams = new Set<string>();
  for (const s of stacks) {
    const f = extractFirstFamily(s);
    if (f && GOOGLE_FONT_FAMILIES.has(f)) fams.add(f);
  }
  // CJK fallback — always include so Chinese content doesn't go tofu when the
  // theme's primary family is Latin-only.
  fams.add('Noto Sans SC');
  return Array.from(fams);
}

function buildGoogleFontsUrl(families: string[], weights: string[]): string {
  const parts = families.map(f => {
    const encFamily = f.replace(/ /g, '+');
    return `family=${encFamily}:wght@${weights.join(';')}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join('&')}&display=swap`;
}

/**
 * Fetch the Google Fonts CSS for the given families/weights, then replace
 * every `url(https://fonts.gstatic.com/...woff2)` with a base64 data URI.
 * Returns the rewritten CSS ready to inline inside a `<style>` tag.
 *
 * All fetches are parallel. Any single font failure is swallowed (the URL
 * stays as the original remote reference); the export still succeeds.
 */
async function inlineGoogleFontsCss(families: string[], weights: string[]): Promise<string> {
  const cssUrl = buildGoogleFontsUrl(families, weights);
  const cssRes = await fetch(cssUrl);
  if (!cssRes.ok) throw new Error(`Google Fonts CSS fetch failed: ${cssRes.status}`);
  let css = await cssRes.text();

  const urlRe = /url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+\.woff2)\)/g;
  const remoteUrls = Array.from(new Set(Array.from(css.matchAll(urlRe), m => m[1])));

  const dataUriByUrl = new Map<string, string>();
  await Promise.all(remoteUrls.map(async (u) => {
    try {
      const res = await fetch(u);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      // Chunked to avoid "Maximum call stack size exceeded" on large files
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const b64 = btoa(bin);
      dataUriByUrl.set(u, `data:font/woff2;base64,${b64}`);
    } catch {
      // Leave the remote URL in place if a single font fails.
    }
  }));

  for (const [u, dataUri] of dataUriByUrl) {
    // Plain split/join is faster than regex replace and safe because the URL
    // is a unique fully-qualified path.
    css = css.split(u).join(dataUri);
  }
  return css;
}

export interface ExportLascaOptions {
  /** Inline Google Fonts as base64 woff2 data URIs so the .lasca file renders
   *  with the correct typography even without network access. Default false
   *  keeps the legacy behavior (CDN `<link>`). */
  inlineFonts?: boolean;
}

export async function exportLasca(
  deck: Deck,
  locale: Locale = 'en',
  opts: ExportLascaOptions = {},
): Promise<string> {
  const inlineFonts = !!opts.inlineFonts;
  logger.info('export', `export .lasca`, { slideCount: deck.slides.length, inlineFonts });
  const logical = getLogicalDims(deck);
  const slidesHtml = deck.slides.map((slide, i) => {
    const html = renderSlide(slide, deck.theme, logical, undefined, i, deck.slides.length);
    return `<div class="slide" data-index="${i}" style="display:${i === 0 ? 'flex' : 'none'};"><div class="slide-inner">${html}</div></div>`;
  }).join('\n');

  // Font stylesheet block. When inlineFonts is on, fetch + inline woff2;
  // otherwise fall back to the legacy Google Fonts CDN link.
  let fontBlock: string;
  if (inlineFonts) {
    try {
      const themeCfg = THEMES[deck.theme];
      const families = themeCfg ? collectUsedFamilies(themeCfg) : ['Poppins', 'Noto Sans SC'];
      const css = await inlineGoogleFontsCss(families, INLINE_WEIGHTS);
      fontBlock = `<style>\n${css}\n</style>`;
    } catch (err) {
      logger.warn('export', 'font inline failed, falling back to CDN link', { err: String(err) });
      fontBlock = `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">`;
    }
  } else {
    fontBlock = `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap" rel="stylesheet">`;
  }

  return `<!DOCTYPE html>
<html lang="${locale === 'en' ? 'en' : 'zh-CN'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${deck.name || 'Lasca Presentation'}</title>
  ${fontBlock}
  <style>
    /* Theme texture CSS custom properties — must match globals.css ~line 220.
     * Without these defined, slides styled as
     *   background: var(--lasca-texture-warm-url) repeat, #faf9f5
     * fail the CSS shorthand's var() resolution, the whole background
     * declaration gets dropped (CSS spec: invalid-at-computed-value-time),
     * the slide becomes transparent, and the black body shows through —
     * producing an all-black export. Keep in sync if globals.css changes.
     */
    :root {
      --lasca-texture-warm-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='1.1' fill='rgba(140,105,70,0.18)'/%3E%3C/svg%3E");
      --lasca-texture-cool-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='1.1' fill='rgba(40,80,130,0.20)'/%3E%3C/svg%3E");
      --lasca-texture-dark-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='1.1' fill='rgba(255,245,220,0.11)'/%3E%3C/svg%3E");
      --lasca-texture-original-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='1.1' fill='rgba(120,120,120,0.12)'/%3E%3C/svg%3E");
      --lasca-texture-stripe-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 48 48'%3E%3Cg stroke='rgba(10,37,64,0.04)' fill='none' stroke-width='0.5'%3E%3Cpath d='M0 24 L48 24'/%3E%3Cpath d='M24 0 L24 48'/%3E%3C/g%3E%3Ccircle cx='24' cy='24' r='0.5' fill='rgba(83,58,253,0.06)'/%3E%3C/svg%3E");
      --lasca-texture-linear-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='48' viewBox='0 0 28 48'%3E%3Cg stroke='rgba(94,106,210,0.06)' fill='none' stroke-width='0.4'%3E%3Cpath d='M14 0 L28 8 L28 24 L14 32 L0 24 L0 8 Z'/%3E%3Cpath d='M14 16 L28 24 L28 40 L14 48 L0 40 L0 24 Z'/%3E%3C/g%3E%3C/svg%3E");
      --lasca-texture-notion-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill='rgba(55,53,47,0.025)' stroke='none'%3E%3Ccircle cx='23' cy='17' r='0.4'/%3E%3Ccircle cx='67' cy='43' r='0.3'/%3E%3Ccircle cx='112' cy='8' r='0.5'/%3E%3Ccircle cx='156' cy='31' r='0.3'/%3E%3Ccircle cx='45' cy='72' r='0.4'/%3E%3Ccircle cx='89' cy='95' r='0.5'/%3E%3Ccircle cx='134' cy='67' r='0.3'/%3E%3Ccircle cx='178' cy='88' r='0.4'/%3E%3Ccircle cx='12' cy='123' r='0.3'/%3E%3Ccircle cx='56' cy='148' r='0.5'/%3E%3Ccircle cx='98' cy='134' r='0.3'/%3E%3Ccircle cx='145' cy='156' r='0.4'/%3E%3Ccircle cx='189' cy='142' r='0.3'/%3E%3Ccircle cx='34' cy='178' r='0.4'/%3E%3Ccircle cx='78' cy='191' r='0.3'/%3E%3Ccircle cx='123' cy='183' r='0.5'/%3E%3Ccircle cx='167' cy='172' r='0.3'/%3E%3C/g%3E%3C/svg%3E");
      --lasca-texture-spotify-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Cg fill='none'%3E%3Ccircle cx='45' cy='67' r='18' stroke='rgba(29,185,84,0.03)' stroke-width='0.5'/%3E%3Ccircle cx='198' cy='34' r='12' stroke='rgba(29,185,84,0.025)' stroke-width='0.4'/%3E%3Ccircle cx='267' cy='145' r='22' stroke='rgba(29,185,84,0.02)' stroke-width='0.5'/%3E%3Ccircle cx='89' cy='234' r='15' stroke='rgba(29,185,84,0.03)' stroke-width='0.4'/%3E%3Ccircle cx='178' cy='189' r='10' stroke='rgba(29,185,84,0.025)' stroke-width='0.3'/%3E%3C/g%3E%3C/svg%3E");
      --lasca-texture-airbnb-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='480' height='320' viewBox='0 0 480 320'%3E%3Cg fill='none' stroke='rgba(255,90,95,0.04)' stroke-width='0.6' stroke-linecap='round'%3E%3Cpath d='M-20 55 Q90 35 190 60 T390 50 T580 70'/%3E%3Cpath d='M-20 120 Q80 100 200 125 T400 115 T580 130'/%3E%3Cpath d='M-20 190 Q100 170 210 195 T410 185 T580 200'/%3E%3Cpath d='M-20 260 Q90 240 180 265 T380 255 T580 270'/%3E%3C/g%3E%3C/svg%3E");
      --lasca-texture-ferrari-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Cpath d='M10 0 L10 20' stroke='rgba(240,236,228,0.025)' stroke-width='0.4' fill='none'/%3E%3C/svg%3E");
      --lasca-texture-analyst-light-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='0.8' fill='rgba(37,99,235,0.06)'/%3E%3C/svg%3E");
      --lasca-texture-analyst-mist-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='0.8' fill='rgba(67,56,202,0.06)'/%3E%3C/svg%3E");
      --lasca-texture-analyst-dark-url: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='0.8' fill='rgba(96,165,250,0.08)'/%3E%3C/svg%3E");
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #000; }
    .slide {
      position: absolute; inset: 0;
      align-items: center; justify-content: center;
    }
    .slide-inner {
      width: ${logical.w}px; height: ${logical.h}px;
      flex-shrink: 0; overflow: hidden;
    }
    #counter { position: fixed; bottom: 16px; right: 24px; font-size: 13px; color: rgba(255,255,255,0.4); font-family: 'Poppins', sans-serif; z-index: 10; }
    #progress { position: fixed; bottom: 0; left: 0; height: 3px; background: #d97757; transition: width 0.3s; z-index: 10; }
    .nav { position: fixed; top: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer; color: rgba(255,255,255,0.3); font-size: 24px; z-index: 10; user-select: none; }
    .nav:hover { color: rgba(255,255,255,0.7); }
    #prev { left: 12px; transform: translateY(-50%); }
    #next { right: 12px; transform: translateY(-50%); }
  </style>
</head>
<body>
  ${slidesHtml}
  <div id="counter">1 / ${deck.slides.length}</div>
  <div id="progress" style="width: ${100 / deck.slides.length}%"></div>
  <div class="nav" id="prev" onclick="go(-1)">&#x2039;</div>
  <div class="nav" id="next" onclick="go(1)">&#x203A;</div>
  <script>
    var cur = 0, total = ${deck.slides.length};
    var slides = document.querySelectorAll('.slide');
    var inners = document.querySelectorAll('.slide-inner');

    function updateScale() {
      var s = Math.min(window.innerWidth / ${logical.w}, window.innerHeight / ${logical.h});
      inners.forEach(function(el) {
        el.style.transform = 'scale(' + s + ')';
        el.style.transformOrigin = 'center center';
      });
    }
    updateScale();
    window.addEventListener('resize', updateScale);

    function go(d) {
      var n = cur + d;
      if (n < 0 || n >= total) return;
      slides[cur].style.display = 'none';
      cur = n;
      slides[cur].style.display = 'flex';
      document.getElementById('counter').textContent = (cur + 1) + ' / ' + total;
      document.getElementById('progress').style.width = ((cur + 1) / total * 100) + '%';
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); go(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(-1); }
      if (e.key === 'Escape') { if (document.fullscreenElement) document.exitFullscreen(); }
      if (e.key === 'f' || e.key === 'F') { document.documentElement.requestFullscreen(); }
    });
    document.addEventListener('click', function(e) {
      if (e.target.closest('.nav')) return;
      go(1);
    });
  </script>
  ${deck.sourceMd ? renderSourceMdBlock(deck.sourceMd) : ''}
  <!-- Made with Lasca — lasca.ai -->
</body>
</html>`;
}

// Embed the report's source markdown as a non-executable script block. Browser
// ignores it (unknown MIME); importFile.ts looks it up via querySelector and
// restores deck.sourceMd so the round-tripped deck still drives the paged.js
// preview + sidecar PDF export. CDATA isolation prevents stray `</script>` in
// user prose from prematurely closing the block.
function renderSourceMdBlock(md: string): string {
  // Escape `</script` (case-insensitive) by splitting on the angle-script
  // boundary; CDATA-like guard isn't honored in HTML5 but the split is.
  const safe = md.replace(/<\/script/gi, '<\\/script');
  return `<script type="application/x-lasca-source-md">${safe}</script>`;
}

export async function downloadLasca(
  deck: Deck,
  locale: Locale = 'en',
  opts: ExportLascaOptions = {},
): Promise<void> {
  const html = await exportLasca(deck, locale, opts);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deck.name || 'presentation'}.lasca`;
  a.click();
  URL.revokeObjectURL(url);
}
