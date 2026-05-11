// ============================================================================
// Lasca — renderSlide(slide, theme)
// 输入 Slide JSON + theme，输出带 data-field 属性的 HTML 字符串
// data-field 用于 contentEditable 双向绑定：编辑器读取 field path → 写回 JSON
// ============================================================================

import type { Slide, Theme, ThemeConfig, Deck, ChartEmbed, Layout } from './types';
import type {
  CoverData, BigNumberData, ThreeCardsData, TwoColumnData,
  StackedBarsData, GridCardsData, QuoteData, ImageData,
  TitleBodyData, SplitImageData, IconListData, TimelineData, TableData,
  AgendaData, TeamData, LogoWallData, PricingData,
  DeviceMockupData, SectionBreakData, ClosingData, StatRowData,
  FeaturedGridData, BentoData, DashboardData, TitleBentoData,
  PptxFaithfulData, PdfFaithfulData,
  ReportCoverData, ReportSectionData, ReportBodyData, ReportQuoteData, ReportTocData,
} from './types';
import { THEMES, mergeStyleOverrides, getSceneFromTheme, getSceneVariant } from './themes';
import { getArtPlaceholder, renderScenePanels, paletteFromTheme, hashSeed } from './placeholders/algorithmicArt';
import { renderGlyph, containsEmoji } from './placeholders/glyph';
import { renderBarChart, renderHorizontalBarChart, renderLineChart, renderPieChart, renderStackedBarChart, renderScatterChart, renderDualAxisBar, renderHeatmap, renderSparkline, renderMiniDonut } from './renderCharts';
import { renderFlowchart, renderFunnel, renderPyramid, renderSteps, renderMatrix, renderVersus, renderVenn, renderBullseye, renderCycle, renderHubSpoke } from './renderDiagrams';
import { renderCardCanvas } from './cards/renderCardCanvas';
import { renderReportPage } from './reports/renderReportPage';
import { fitToBudget, estimateVisualLines, type BudgetFitResult, type LayoutElement } from './layoutBudget';

// --- Helpers (exported for renderCharts.ts / renderDiagrams.ts) ---

export function esc(str: string | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function nl2br(str: string | undefined): string {
  if (!str) return '';
  return esc(str).replace(/\n/g, '<br>');
}

// Inline markdown → HTML. Escapes first (XSS-safe), then transforms
// **bold**, *italic*, `code`. Used for AI/user text fields; NOT for
// numeric values, icons, badges, or anywhere literal asterisks are expected.
export function escMd(str: string | undefined): string {
  if (!str) return '';
  const safe = esc(str);
  return safe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+?)`/g, '<code style="background:rgba(0,0,0,0.05); padding:1px 5px; border-radius:4px; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.92em;">$1</code>');
}

export function nl2brMd(str: string | undefined): string {
  if (!str) return '';
  return escMd(str).replace(/\n/g, '<br>');
}

// Multi-line text clamp for card body content. Prevents one verbose
// entry from pushing siblings off-canvas in grid layouts.
export function clampLines(n: number): string {
  return `display:-webkit-box; -webkit-line-clamp:${n}; -webkit-box-orient:vertical; overflow:hidden;`;
}

/** data-field attribute for contentEditable binding */
export function df(path: string): string {
  return `data-field="${path}"`;
}

export function resolveBarColor(colorName: string, t: ThemeConfig): string {
  return (t as unknown as Record<string, string>)[colorName] || t.primary;
}

export function labelColor(index: number, t: ThemeConfig): string {
  // Scene v2: if the theme supplies a curated ordinal palette via dataViz,
  // use it. Replaces the rainbow-ish primary/accent/green/muted/dark cycle
  // with a firm-appropriate series (investment-bank navy family, consulting-firm blue
  // gradient, PE-style monochromatic cream). Non-scene themes fall
  // through to the legacy cycle (backward compat).
  const ordinal = t.dataViz?.paletteOrdinal;
  if (ordinal && ordinal.length > 0) {
    return ordinal[index % ordinal.length];
  }
  const cycle = [t.primary, t.accent, t.green, t.muted, t.dark];
  return cycle[index % cycle.length];
}

const DEFAULT_FONT_STACK = "'Poppins','Noto Sans SC',sans-serif";

/** Outer wrapper class for ambient animation hooks (see globals.css). */
export function themeClass(theme: Theme): string {
  return `lasca-theme-${theme}`;
}

export function baseStyle(t: ThemeConfig, isImport = false, allowOverflow = false): string {
  const fontBody = t.fontBody ?? DEFAULT_FONT_STACK;
  const opsz = t.opticalSizing ? `font-optical-sizing:${t.opticalSizing};` : '';
  // allowOverflow=true lets long content spill past the slide frame — used by
  // report-page in the Editor canvas, since paged.js fragmentation only runs
  // in the preview pane. Silent clipping was hiding content from authors.
  const overflow = allowOverflow
    ? 'overflow:visible;'
    : isImport ? 'overflow-y:auto; overflow-x:hidden;' : 'overflow:hidden;';
  return `font-family:${fontBody}; ${opsz} position:relative; ${overflow} height:100%; background:${t.bg};`;
}

/** Render a small colored badge/tag pill. Returns empty string if no badge. */
export function badgePill(badge: string | undefined, t: ThemeConfig, fieldPath?: string): string {
  if (!badge) return '';
  const dfAttr = fieldPath ? df(fieldPath) : '';
  // labelStyle() drives font-family / tracking / text-transform from the theme;
  // hardcoded size + weight + color stay inline so the pill stays compact.
  return `<span ${dfAttr} style="display:inline-block; font-size:10.5px; font-weight:600; color:${t.accent}; margin-bottom:10px; ${labelStyle(t)}">${esc(badge)}</span>`;
}

/** Pick white or dark text for readable contrast on a colored background.
 *  Uses WCAG relative luminance formula. Returns '#fff' for dark backgrounds,
 *  '#000' for light ones. Handles hex colors only (the format used in ThemeConfig). */
function contrastTextOnBg(bg: string): string {
  const hex = bg.replace('#', '');
  if (hex.length < 6) return '#fff'; // fallback for non-hex (gradients etc.)
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  // Perceived brightness (ITU-R BT.601)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.55 ? '#000' : '#fff';
}

function _hexLum(hex6: string): number {
  const r = parseInt(hex6.slice(0, 2), 16) / 255;
  const g = parseInt(hex6.slice(2, 4), 16) / 255;
  const b = parseInt(hex6.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Guarantee text color is legible on bg. If they're too close in luminance,
 *  flip text to white or black based on bg luminance. Hex-only — gradients/vars
 *  pass through unchanged (we trust the theme). Threshold 0.4 catches the
 *  primary===text case (Apple) without flipping intentionally-subtle pairs. */
export function ensureTextContrast(textColor: string, bgColor: string): string {
  const bgHex = bgColor.replace('#', '').slice(0, 6);
  const txHex = textColor.replace('#', '').slice(0, 6);
  if (bgHex.length < 6 || txHex.length < 6) return textColor;
  const bgL = _hexLum(bgHex);
  const txL = _hexLum(txHex);
  if (Math.abs(bgL - txL) < 0.4) return bgL > 0.5 ? '#000' : '#fff';
  return textColor;
}

// Slide-level breathing room. Applied as `padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px`
// to layouts that would otherwise hug the slide edges. Some layouts (cover,
// quote, report-*) intentionally use larger insets — those are kept as-is.
export const SAFE_INSET = { y: 40, x: 56 };
const CARD_INSET = { y: 20, x: 24 };

// Decoration Safe Zone (pptx skill: "Leave breathing room — don't fill every inch").
// Ring band OUTSIDE content inset where motif decorations live. Content never
// touches decorations; decorations never intrude on content.
//
// The `gap` is the breathing room between content and decoration. `outer` is how
// far from the slide edge the motif can extend inward — so a motif living in
// `[outer, outer+16]` from each edge stays out of content that starts at SAFE_INSET.
//
// Exception: 90%-visual layouts (cover, big-number, quote, section-break,
// report-cover) allow motif into the content area because they're intentionally
// sparse — call `canDecorateContentArea(layout)` to check.
export const DECO_SAFE_ZONE = {
  gap: 16,
  outerTop: 12,
  outerBottom: 12,
  outerSide: 20,
} as const;

function canDecorateContentArea(layout: Layout): boolean {
  switch (layout) {
    case 'cover':
    case 'big-number':
    case 'quote':
    case 'section-break':
    case 'report-cover':
      return true;
    default:
      return false;
  }
}

/** Render a rounded image block inside a card. Returns empty string if no url. */
export function cardImage(url: string | undefined, radius: number, height = '120px'): string {
  if (!url) return '';
  return `<div style="width:100%; height:${height}; border-radius:${radius}px; overflow:hidden; margin-bottom:12px; flex-shrink:0;">
    <img src="${url}" style="width:100%; height:100%; object-fit:cover; display:block;" loading="lazy"/>
  </div>`;
}

// --- Theme-specific slide decoration (visual fingerprint) ---
// Layout-adaptive edge borders + diagonal accents. Each theme gets a signature
// edge treatment (3-6px gradient, per premium presentation research) that adapts
// to layout type: hero (cover) → full decoration, content → standard, data →
// edge only, image/faithful → skip. Colors from ThemeConfig, not hardcoded.
// Guided by public design-system references and frontend-design principles.

type DecoLevel = 'hero' | 'content' | 'minimal' | 'skip';

function getDecoLevel(layout: Layout): DecoLevel {
  switch (layout) {
    case 'cover': case 'section-break': case 'report-cover': return 'hero';
    case 'title-body': case 'two-column':
    case 'icon-list': case 'agenda': case 'quote': case 'report-body':
    case 'report-section': case 'report-quote': return 'content';
    // split-image has full-bleed image on one side — unpredictable, skip entirely
    case 'split-image': case 'image':
    case 'pptx-faithful': case 'pdf-faithful': return 'skip';
    default: return 'minimal';
  }
}

/** Can we safely place decoration on left/right edges without clashing with content?
 *  Card/grid/column layouts have content extending to the edges → side edges unsafe.
 *  Centered layouts (cover, big-number, quote) have ample side margins → safe. */
function sideEdgeSafe(layout: Layout): boolean {
  switch (layout) {
    case 'cover': case 'big-number': case 'quote': case 'section-break':
    case 'device-mockup': case 'report-cover': case 'report-quote':
      return true;  // content is centered, sides are clear
    default:
      return false;  // cards, columns, grids, lists — sides have content
  }
}

// Single-motif slide decoration. Each theme's `motif.id` (themes.ts) picks one
// visual fingerprint that repeats across EVERY layout — per pptx skill rule
// "Commit to a visual motif". Decorations live in the DECO_SAFE_ZONE ring band
// outside SAFE_INSET, except for 90%-visual layouts where they may enter the
// content area (see canDecorateContentArea).
//
// AI-slop guards (pptx): no top-edge line "under" a section title on content
// layouts. The neon-underline motif (stripe) is the one intentional exception
// — only on hero layouts where the underline IS the motif, not decoration.
function renderThemeDecoration(
  theme: Theme, t: ThemeConfig, w: number, h: number,
  layout: Layout, format: 'slide' | 'report' = 'slide',
  slideIndex?: number, totalSlides?: number,
): string {
  const level = getDecoLevel(layout);
  if (level === 'skip') return '';

  const motifId = t.motif?.id ?? themeMotifFallback(theme);
  if (!motifId) return '';

  if (format === 'report') {
    const reportMode = t.decoration?.report;
    if (reportMode === 'minimal') return '';
    return renderReportSignature(motifId, t, w, h, layout, slideIndex, totalSlides);
  }

  if (t.decoration?.slide === 'minimal') return '';

  const a = 'position:absolute;pointer-events:none;z-index:1;';
  const isHero = level === 'hero';
  const allowCenter = canDecorateContentArea(layout);

  // Scene v2: structural composition panels (color fields, art panels, corner
  // marks) for specific (scene, layout) combinations. Unlike the rejected
  // backdrop experiment, these panels take real compositional space — e.g.
  // consulting-firm cover has an art panel occupying the right 60% and the layout
  // text is pushed to the left 40% via companion CSS in globals.css.
  const palette = paletteFromTheme(t.primary, t.accent, t.muted, t.cardBg);
  const scenePanels = renderScenePanels(theme, layout, palette, hashSeed(`panel:${theme}:${layout}`));
  const motifHtml = renderMotifChrome(motifId, theme, t, w, h, layout, isHero, allowCenter, a, slideIndex, totalSlides);
  return scenePanels + motifHtml;
}

// Motif chrome dispatcher. Extracted from renderThemeDecoration so the outer
// function can compose motif chrome with scene backdrop art cleanly.
function renderMotifChrome(
  motifId: string,
  theme: Theme,
  t: ThemeConfig,
  w: number,
  h: number,
  layout: Layout,
  isHero: boolean,
  allowCenter: boolean,
  a: string,
  slideIndex?: number,
  totalSlides?: number,
): string {
  switch (motifId) {

    // ── paper-deckle (warm) ─────────────────────────────────────────
    // Left edge torn-paper nibbles + top-right folio dot on hero.
    case 'paper-deckle': {
      const nibbles = [16, 42, 68, 94, 120, 146].slice(0, isHero ? 6 : 4)
        .map(y => `<div style="${a}left:0;top:${y}px;width:8px;height:8px;background:${t.primary};opacity:0.55;clip-path:polygon(0 0,100% 50%,0 100%);"></div>`)
        .join('');
      const folio = allowCenter
        ? `<div style="${a}top:${DECO_SAFE_ZONE.outerTop}px;right:${DECO_SAFE_ZONE.outerSide}px;width:5px;height:5px;border-radius:50%;background:${t.primary};opacity:0.6;"></div>`
        : '';
      return nibbles + folio;
    }

    // ── hairline-frame (cool) ───────────────────────────────────────
    // Four-edge thin frame. Full frame on hero, horizontals only on content.
    case 'hairline-frame': {
      const o = DECO_SAFE_ZONE.outerTop;
      const s = DECO_SAFE_ZONE.outerSide;
      const top = `<div style="${a}top:${o}px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
      const bot = `<div style="${a}bottom:${o}px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
      const sides = (isHero || sideEdgeSafe(layout))
        ? `<div style="${a}top:${o}px;bottom:${o}px;left:${s}px;width:1px;background:${t.border};opacity:0.4;"></div>
           <div style="${a}top:${o}px;bottom:${o}px;right:${s}px;width:1px;background:${t.border};opacity:0.4;"></div>`
        : '';
      return top + bot + sides;
    }

    // ── constellation (dark) ────────────────────────────────────────
    // Scattered star points. Hero: both corners. Content: one corner.
    case 'constellation': {
      const stars = (x: number, y: number) => `
        <svg style="${a}top:${y}px;left:${x}px;width:44px;height:30px;" viewBox="0 0 44 30" fill="${t.primary}">
          <circle cx="6" cy="10" r="1.6" opacity="0.6"/>
          <circle cx="22" cy="5" r="1.1" opacity="0.4"/>
          <circle cx="36" cy="16" r="1.9" opacity="0.55"/>
          <circle cx="14" cy="22" r="1.2" opacity="0.35"/>
          <line x1="6" y1="10" x2="22" y2="5" stroke="${t.primary}" stroke-width="0.4" opacity="0.25"/>
          <line x1="22" y1="5" x2="36" y2="16" stroke="${t.primary}" stroke-width="0.4" opacity="0.25"/>
        </svg>`;
      const tl = stars(DECO_SAFE_ZONE.outerSide, DECO_SAFE_ZONE.outerTop);
      if (!isHero) return tl;
      const br = `<svg style="${a}bottom:${DECO_SAFE_ZONE.outerBottom}px;right:${DECO_SAFE_ZONE.outerSide}px;width:44px;height:30px;" viewBox="0 0 44 30" fill="${t.primary}">
        <circle cx="6" cy="18" r="1.3" opacity="0.4"/>
        <circle cx="20" cy="22" r="1.8" opacity="0.55"/>
        <circle cx="36" cy="10" r="1.4" opacity="0.45"/>
      </svg>`;
      return tl + br;
    }

    // ── neon-underline (stripe) ─────────────────────────────────────
    // Hero only: 2px gradient bar as signature motif. Non-hero: corner pip.
    case 'neon-underline': {
      if (allowCenter) {
        const grad = `linear-gradient(90deg,${t.primary},${t.accent ?? t.primary},transparent)`;
        return `<div style="${a}left:${SAFE_INSET.x}px;top:${Math.round(h * 0.58)}px;width:${Math.round(w * 0.32)}px;height:2px;background:${grad};opacity:0.9;"></div>`;
      }
      return `<div style="${a}bottom:${DECO_SAFE_ZONE.outerBottom}px;right:${DECO_SAFE_ZONE.outerSide}px;width:6px;height:6px;border-radius:50%;background:${t.primary};opacity:0.45;"></div>`;
    }

    // ── grid-dot-matrix (linear) ────────────────────────────────────
    // Low-opacity dot grid + corner ticks. No lines.
    case 'grid-dot-matrix': {
      const grid = `<div style="${a}inset:0;background-image:radial-gradient(${t.primary} 0.6px,transparent 0.6px);background-size:18px 18px;opacity:0.14;"></div>`;
      const ts = DECO_SAFE_ZONE.outerSide, tt = DECO_SAFE_ZONE.outerTop, bb = DECO_SAFE_ZONE.outerBottom;
      const tl = `<div style="${a}top:${tt}px;left:${ts}px;width:10px;height:1px;background:${t.primary};opacity:0.55;"></div>
                  <div style="${a}top:${tt}px;left:${ts}px;width:1px;height:10px;background:${t.primary};opacity:0.55;"></div>`;
      const tr = `<div style="${a}top:${tt}px;right:${ts}px;width:10px;height:1px;background:${t.primary};opacity:0.55;"></div>
                  <div style="${a}top:${tt}px;right:${ts}px;width:1px;height:10px;background:${t.primary};opacity:0.55;"></div>`;
      const bl = `<div style="${a}bottom:${bb}px;left:${ts}px;width:10px;height:1px;background:${t.primary};opacity:0.55;"></div>
                  <div style="${a}bottom:${bb}px;left:${ts}px;width:1px;height:10px;background:${t.primary};opacity:0.55;"></div>`;
      const br = `<div style="${a}bottom:${bb}px;right:${ts}px;width:10px;height:1px;background:${t.primary};opacity:0.55;"></div>
                  <div style="${a}bottom:${bb}px;right:${ts}px;width:1px;height:10px;background:${t.primary};opacity:0.55;"></div>`;
      return grid + tl + tr + bl + br;
    }

    // ── left-rule (notion) ──────────────────────────────────────────
    // Vertical 1px rule on the left + top-right marker dot.
    case 'left-rule': {
      const o = DECO_SAFE_ZONE.outerTop;
      const s = DECO_SAFE_ZONE.outerSide;
      const rule = `<div style="${a}top:${o}px;bottom:${o}px;left:${s}px;width:${isHero ? 2 : 1}px;background:${t.primary};opacity:${isHero ? 0.7 : 0.45};"></div>`;
      const marker = `<div style="${a}top:${o}px;right:${s}px;width:4px;height:4px;border-radius:50%;background:${t.primary};opacity:0.45;"></div>`;
      return rule + marker;
    }

    // ── crop-marks (vercel) ─────────────────────────────────────────
    // Four corner crop marks. Architectural registration mark.
    case 'crop-marks': {
      const m = DECO_SAFE_ZONE.outerTop;
      const arm = isHero ? 22 : 16;
      const stroke = t.accent ?? t.primary;
      return `<svg style="${a}inset:0;width:100%;height:100%;" viewBox="0 0 ${w} ${h}" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.5">
        <path d="M${m} ${m + arm} L${m} ${m} L${m + arm} ${m}"/>
        <path d="M${w - m} ${m + arm} L${w - m} ${m} L${w - m - arm} ${m}"/>
        <path d="M${m} ${h - m - arm} L${m} ${h - m} L${m + arm} ${h - m}"/>
        <path d="M${w - m} ${h - m - arm} L${w - m} ${h - m} L${w - m - arm} ${h - m}"/>
      </svg>`;
    }

    // ── void (apple) ────────────────────────────────────────────────
    case 'void':
      return '';

    // ── waveform (spotify) ──────────────────────────────────────────
    // Bottom waveform bars. Hero: 14 bars full. Non-hero: right-aligned mini.
    case 'waveform': {
      const heights = isHero
        ? [4, 9, 5, 12, 7, 10, 13, 6, 9, 4, 11, 7, 9, 5]
        : [3, 6, 4, 8, 5, 7, 9, 4, 5];
      const bars = heights.map(bh =>
        `<div style="width:2px;height:${bh}px;background:${t.primary};opacity:0.55;margin-right:2px;border-radius:1px;"></div>`
      ).join('');
      const width = isHero ? '50%' : '120px';
      const left = isHero ? `left:${DECO_SAFE_ZONE.outerSide}px` : `right:${DECO_SAFE_ZONE.outerSide}px`;
      return `<div style="${a}${left};bottom:${DECO_SAFE_ZONE.outerBottom}px;width:${width};display:flex;align-items:flex-end;height:14px;">${bars}</div>`;
    }

    // ── rubber-stamp (airbnb) ───────────────────────────────────────
    // Bottom-right rounded caption block (soft pill, hand-stamped feel).
    case 'rubber-stamp': {
      const sz = isHero ? { w: 52, h: 20 } : { w: 34, h: 14 };
      return `<div style="${a}bottom:${DECO_SAFE_ZONE.outerBottom}px;right:${DECO_SAFE_ZONE.outerSide}px;width:${sz.w}px;height:${sz.h}px;border-radius:${sz.h / 2}px;border:1.3px solid ${t.primary};background:${t.primary}14;opacity:0.85;"></div>`;
    }

    // ── racing-chevron (ferrari) ────────────────────────────────────
    // Top-right 45° chevron stripe + gold folio accent on hero.
    case 'racing-chevron': {
      const len = isHero ? 96 : 72;
      const chevron = `<div style="${a}top:-10px;right:-20px;width:${len}px;height:6px;background:${t.primary};transform:rotate(-45deg);transform-origin:top right;opacity:0.85;"></div>`;
      const folio = allowCenter
        ? `<div style="${a}bottom:${DECO_SAFE_ZONE.outerBottom}px;right:${DECO_SAFE_ZONE.outerSide}px;font-size:10px;letter-spacing:0.2em;color:${t.accent ?? t.primary};opacity:0.65;font-weight:600;">★</div>`
        : '';
      return chevron + folio;
    }

    // ── precision-rule (analyst) ────────────────────────────────────
    // Each Analyst colorway directly copies the chrome signature of a
    // real institution. Don't invent a Lasca visual language — mirror
    // three institutional registers so the user picks by "I want that
    // firm's look" rather than by abstract color preference.
    //
    //   analyst-light → an investment bank      (single 1px navy hairline)
    //   analyst-mist  → consulting-firm & Company (hairline + vivid-blue accent
    //                                        stripe just below — their
    //                                        signature "50 shades of blue")
    //   analyst-dark  → private-equity         (no top rule; deep bg carries
    //                                        the gravitas, minimal wordmark
    //                                        only — Kris Sowersby / Chronicle
    //                                        restraint)
    //
    // Shared across all three: LASCA wordmark top-left, bottom hairline,
    // real page folio bottom-right.
    case 'precision-rule': {
      const s = DECO_SAFE_ZONE.outerSide;
      const bm = DECO_SAFE_ZONE.outerBottom;
      const variant = getSceneVariant(theme);
      const fontBody = t.fontBody ?? 'sans-serif';
      const acc = t.accent ?? t.primary;

      // Page folio: current page only, no "/ total". Project preference —
      // total-page counts read as noise since the page number alone already
      // anchors the reader within a known deck.
      const folio = (slideIndex != null)
        ? String(slideIndex + 1).padStart(2, '0')
        : null;

      if (variant === 'light') {
        // ── investment-bank signature chrome ─────────────────────────────
        // Real GS pitch book: thick navy band at top running full width,
        // white wordmark tag inset into that band, conservative bottom
        // hairline. The thick top band is the single loudest identifier
        // of "this was made by investment-bank" — IB deck cover scanned from 100ft.
        const thickBar = `<div style="${a}top:0;left:0;right:0;height:8px;background:${t.primary};"></div>`;
        const underRule = `<div style="${a}top:8px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.65;"></div>`;
        const wordmark = `<div style="${a}top:0;left:${s}px;height:8px;display:flex;align-items:center;font-size:8px;letter-spacing:0.3em;color:#ffffff;font-weight:700;text-transform:uppercase;font-family:${fontBody};">LASCA</div>`;
        const bottomRule = `<div style="${a}bottom:${bm + 4}px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
        const folioHtml = folio
          ? `<div style="${a}bottom:${Math.max(bm - 14, 6)}px;right:${s}px;font-size:9px;letter-spacing:0.14em;color:${t.muted};opacity:0.85;font-weight:600;font-variant-numeric:tabular-nums lining-nums;font-family:${fontBody};">${folio}</div>`
          : '';
        return thickBar + underRule + wordmark + bottomRule + folioHtml;
      }

      if (variant === 'mist') {
        // ── consulting-firm signature chrome ──────────────────────────────────
        // Real consulting-firm deck: no top bar at all. Instead a bold vivid-blue
        // SQUARE MARK top-left (their section-tag signature) + thin left
        // vertical rule running the whole page (editorial margin). The
        // vivid-blue square is the loudest signifier — it replaces the
        // firm name, acting as a branded "you are here" marker.
        //
        // Cover exception: real consulting-firm covers are editorial-minimal —
        // wordmark top-left, big serif title, and the convergence-fan art.
        // No square tag, no rules, no page folio. So on cover we render
        // only the wordmark (shifted to sit where the square would have
        // been, since no square anchors it anymore).
        const isCover = layout === 'cover';

        if (isCover) {
          // Editorial-minimal cover: LASCA wordmark top-left + full-width
          // hairline rule under it (masthead divider) + a small vivid-
          // blue square in the bottom-right corner (brand anchor,
          // echoes the inner-page square mark). No right-side art —
          // algorithmic line art on this cover was a dead end (see
          // memory: feedback_mist_cover_art).
          const wordmarkCover = `<div style="${a}top:18px;left:${s}px;font-size:9px;letter-spacing:0.28em;color:${t.primary};font-weight:700;text-transform:uppercase;font-family:${fontBody};line-height:11px;">LASCA</div>`;
          const topRule = `<div style="${a}top:38px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
          const coverMark = `<div style="${a}bottom:${bm + 18}px;right:${s}px;width:14px;height:14px;background:${acc};"></div>`;
          return wordmarkCover + topRule + coverMark;
        }

        const squareTag = `<div style="${a}top:16px;left:${s}px;width:14px;height:14px;background:${acc};"></div>`;
        const wordmark = `<div style="${a}top:18px;left:${s + 22}px;font-size:9px;letter-spacing:0.28em;color:${t.primary};font-weight:700;text-transform:uppercase;font-family:${fontBody};line-height:11px;">LASCA</div>`;
        const leftVerticalRule = `<div style="${a}top:${DECO_SAFE_ZONE.outerTop + 40}px;bottom:${bm + 20}px;left:${s + 6}px;width:1px;background:${t.border};opacity:0.5;"></div>`;
        const bottomRule = `<div style="${a}bottom:${bm + 4}px;left:${s + 20}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
        const folioHtml = folio
          ? `<div style="${a}bottom:${Math.max(bm - 14, 6)}px;right:${s}px;font-size:9px;letter-spacing:0.14em;color:${acc};opacity:0.95;font-weight:700;font-variant-numeric:tabular-nums lining-nums;font-family:${fontBody};">${folio}</div>`
          : '';
        return squareTag + wordmark + leftVerticalRule + bottomRule + folioHtml;
      }

      if (variant === 'dark') {
        // ── private-equity signature chrome ────────────────────────────────
        // Real PE deck: restraint as brand. Zero header, zero
        // footer. ONE element: an oversized wordmark top-center. The
        // deep black bg + warm cream serif carry all the gravitas.
        // Page folio is still functional but moved to bottom-center
        // (not right) — ceremonial, like a book.
        const wordmark = `<div style="${a}top:18px;left:0;right:0;text-align:center;font-size:11px;letter-spacing:0.48em;color:${t.primary};opacity:0.92;font-weight:400;text-transform:uppercase;font-family:${fontBody};">LASCA</div>`;
        const folioHtml = folio
          ? `<div style="${a}bottom:${Math.max(bm - 14, 6)}px;left:0;right:0;text-align:center;font-size:9px;letter-spacing:0.3em;color:${t.muted};opacity:0.6;font-weight:400;font-variant-numeric:tabular-nums lining-nums;font-family:${fontBody};">${folio}</div>`
          : '';
        return wordmark + folioHtml;
      }

      // Fallback for any new Analyst colorway: minimal baseline.
      const topRule = `<div style="${a}top:12px;left:${s}px;right:${s}px;height:1px;background:${t.primary};opacity:0.85;"></div>`;
      const wordmark = `<div style="${a}top:${Math.max(0, 12 - 14)}px;left:${s}px;font-size:9px;letter-spacing:0.22em;color:${t.primary};opacity:0.85;font-weight:700;text-transform:uppercase;font-family:${fontBody};line-height:14px;">Lasca</div>`;
      const bottomRule = `<div style="${a}bottom:${bm + 4}px;left:${s}px;right:${s}px;height:1px;background:${t.border};opacity:0.55;"></div>`;
      return topRule + wordmark + bottomRule;
    }

    default:
      return '';
  }
}

// Legacy fallback: themes without explicit motif.id map here. Once all 11
// themes have motif set in themes.ts, this should return null for unknown.
function themeMotifFallback(theme: Theme): string | null {
  switch (theme) {
    case 'warm': return 'paper-deckle';
    case 'cool': return 'hairline-frame';
    case 'dark': return 'constellation';
    case 'stripe': return 'neon-underline';
    case 'linear': return 'grid-dot-matrix';
    case 'notion': return 'left-rule';
    case 'vercel': return 'crop-marks';
    case 'apple': return 'void';
    case 'spotify': return 'waveform';
    case 'airbnb': return 'rubber-stamp';
    case 'ferrari': return 'racing-chevron';
    default: return null;
  }
}

// Report decoration = editorial baseline + motif-specific accent.
// Baseline (all themes): top uppercase caption + primary hairline, bottom-right
// folio "07", optional left rule based on motif. Modeled on the
// bilingual-report skill (v1.1, 2026-04-11) so existing report decks stay
// consistent while every theme gains a variant.
//
// Motif mapping (one per theme):
//   paper-deckle  → left deckle nibbles along the left rule
//   hairline-frame → full four-edge hairline + no left rule
//   constellation → light points replacing folio
//   neon-underline → gradient bar under the caption hairline
//   grid-dot-matrix → corner tick marks + no dots
//   left-rule     → solid left rule at full height
//   crop-marks    → four corner marks + folio
//   void          → no decoration at all
//   waveform      → thin waveform along the bottom rule
//   rubber-stamp  → rounded pill at the folio position
//   racing-chevron → top-right chevron + gold folio
function renderReportSignature(motifId: string, t: ThemeConfig, _w: number, _h: number, layout: Layout, slideIndex?: number, totalSlides?: number): string {
  if (motifId === 'void') return '';

  const a = 'position:absolute;pointer-events:none;z-index:1;';
  const caps = t.captionStyle;
  const capsCss = `text-transform:${caps?.textTransform ?? 'uppercase'};letter-spacing:${caps?.letterSpacing ?? '0.14em'};font-size:${caps?.fontSize ?? '0.62rem'};font-weight:${caps?.fontWeight ?? 500};`;
  const topCaption = layout === 'report-cover' ? '' :
    `<div style="${a}top:22px;left:72px;right:72px;height:1px;background:${t.primary};opacity:0.55;"></div>
     <div style="${a}top:10px;left:72px;color:${t.muted};${capsCss}">§ REPORT</div>
     <div style="${a}top:10px;right:72px;color:${t.muted};${capsCss}">LASCA</div>`;

  // Page folio: current page only (no "/ total"). Total-pages reads as
  // noise once the deck size is established.
  const folioText = (slideIndex != null)
    ? String(slideIndex + 1).padStart(2, '0')
    : '07';
  const folioBase = `<div style="${a}bottom:18px;right:44px;color:${t.primary};font-weight:600;font-size:11px;letter-spacing:0.1em;font-variant-numeric:tabular-nums lining-nums;">${folioText}</div>`;

  // Per bilingual-report skill: rules ONLY at top/bottom hairlines + table grids.
  // For base themes (warm/cool/dark), render only the editorial baseline.
  // Analysis themes now have three distinct line kits — see switch below.
  const SKILL_MINIMAL = new Set(['paper-deckle', 'hairline-frame', 'constellation']);
  if (SKILL_MINIMAL.has(motifId)) {
    return topCaption + folioBase;
  }

  // Analysis · editorial — unchanged single hairline + caption + folio.
  if (motifId === 'analysis-editorial') {
    return topCaption + folioBase;
  }

  // Analysis · memo — double top rule (two stacked hairlines ~5px apart), the
  // classic institutional-memo header; caption in "MEMO" frame.
  if (motifId === 'analysis-memo') {
    const memoCaption = layout === 'report-cover' ? '' :
      `<div style="${a}top:22px;left:72px;right:72px;height:1px;background:${t.primary};opacity:0.75;"></div>
       <div style="${a}top:27px;left:72px;right:72px;height:1px;background:${t.primary};opacity:0.35;"></div>
       <div style="${a}top:8px;left:72px;color:${t.primary};${capsCss};font-weight:600;">§ Memo</div>
       <div style="${a}top:8px;right:72px;color:${t.muted};${capsCss}">Lasca Research</div>`;
    return memoCaption + folioBase;
  }

  // Analysis · noir — four corner tick marks (L-shape, 10×10 border color)
  // plus a centered ornament caption. No continuous top rule — the tick marks
  // ARE the frame. Folio moves to bottom-center for book-like symmetry.
  if (motifId === 'analysis-noir') {
    if (layout === 'report-cover') {
      return ''; // cover stays clean
    }
    const tickColor = t.primary;
    const tickOp = '0.9';
    const tickLen = 12;
    const tickWidth = 1;
    const inset = 30;
    const mkTick = (corner: 'tl' | 'tr' | 'bl' | 'br') => {
      const h = corner === 'tl' || corner === 'tr' ? 'top' : 'bottom';
      const v = corner === 'tl' || corner === 'bl' ? 'left' : 'right';
      return `<div style="${a}${h}:${inset}px;${v}:${inset}px;width:${tickLen}px;height:${tickWidth}px;background:${tickColor};opacity:${tickOp};"></div>
              <div style="${a}${h}:${inset}px;${v}:${inset}px;width:${tickWidth}px;height:${tickLen}px;background:${tickColor};opacity:${tickOp};"></div>`;
    };
    const ticks = mkTick('tl') + mkTick('tr') + mkTick('bl') + mkTick('br');
    const noirCaption =
      `<div style="${a}top:14px;left:0;right:0;text-align:center;color:${t.muted};${capsCss}">§ &nbsp;·&nbsp; Lasca Report &nbsp;·&nbsp; §</div>`;
    // Noir folio: bottom-CENTER, serif, in cherry red
    const noirFolio = `<div style="${a}bottom:18px;left:0;right:0;text-align:center;color:${t.primary};font-weight:500;font-size:12px;letter-spacing:0.24em;font-variant-numeric:lining-nums;">— ${folioText} —</div>`;
    return ticks + noirCaption + noirFolio;
  }

  const leftRuleWidth = motifId === 'left-rule' ? 2 : 1;
  const leftRule = `<div style="${a}top:40px;bottom:40px;left:44px;width:${leftRuleWidth}px;background:${t.primary};opacity:${motifId === 'left-rule' ? 0.8 : 0.4};"></div>`;

  switch (motifId) {
    // Note: paper-deckle / hairline-frame / constellation / analysis-minimal
    // are handled by the SKILL_MINIMAL early-return above.
    case 'neon-underline': {
      const bar = `<div style="${a}top:23px;left:72px;width:120px;height:2px;background:linear-gradient(90deg,${t.primary},${t.accent ?? t.primary},transparent);opacity:0.85;"></div>`;
      return topCaption + bar + leftRule + folioBase;
    }
    case 'grid-dot-matrix': {
      const tl = `<div style="${a}top:36px;left:36px;width:10px;height:1px;background:${t.primary};opacity:0.6;"></div>
                  <div style="${a}top:36px;left:36px;width:1px;height:10px;background:${t.primary};opacity:0.6;"></div>`;
      const br = `<div style="${a}bottom:36px;right:36px;width:10px;height:1px;background:${t.primary};opacity:0.6;"></div>
                  <div style="${a}bottom:36px;right:36px;width:1px;height:10px;background:${t.primary};opacity:0.6;"></div>`;
      return topCaption + tl + br + folioBase;
    }
    case 'left-rule':
      return topCaption + leftRule + folioBase;
    case 'crop-marks': {
      const m = 28, arm = 14;
      const stroke = t.accent ?? t.primary;
      const marks = `<svg style="${a}inset:0;width:100%;height:100%;" viewBox="0 0 ${_w} ${_h}" fill="none" stroke="${stroke}" stroke-width="1" opacity="0.55">
        <path d="M${m} ${m + arm} L${m} ${m} L${m + arm} ${m}"/>
        <path d="M${_w - m} ${m + arm} L${_w - m} ${m} L${_w - m - arm} ${m}"/>
        <path d="M${m} ${_h - m - arm} L${m} ${_h - m} L${m + arm} ${_h - m}"/>
        <path d="M${_w - m} ${_h - m - arm} L${_w - m} ${_h - m} L${_w - m - arm} ${_h - m}"/>
      </svg>`;
      return topCaption + marks + folioBase;
    }
    case 'waveform': {
      const heights = [3, 5, 4, 7, 5, 8, 6, 4, 7, 5, 9, 6, 4, 7, 5, 6, 4, 5];
      const bars = heights.map(bh => `<div style="width:2px;height:${bh}px;background:${t.primary};opacity:0.6;margin-right:2px;border-radius:1px;"></div>`).join('');
      const wave = `<div style="${a}bottom:38px;left:72px;width:200px;height:10px;display:flex;align-items:flex-end;">${bars}</div>`;
      return topCaption + leftRule + wave + folioBase;
    }
    case 'rubber-stamp': {
      const stamp = `<div style="${a}bottom:14px;right:36px;width:48px;height:20px;border-radius:10px;border:1.2px solid ${t.primary};background:${t.primary}14;opacity:0.85;"></div>
                     <div style="${a}bottom:18px;right:50px;color:${t.primary};font-size:10px;font-weight:600;letter-spacing:0.12em;">07</div>`;
      return topCaption + leftRule + stamp;
    }
    case 'racing-chevron': {
      const chevron = `<div style="${a}top:0;right:0;width:96px;height:6px;background:${t.primary};transform:rotate(-45deg);transform-origin:top right;opacity:0.85;"></div>`;
      const folioGold = `<div style="${a}bottom:18px;right:44px;color:${t.accent ?? t.primary};font-weight:700;font-size:11px;letter-spacing:0.18em;">★ 07</div>`;
      return topCaption + leftRule + chevron + folioGold;
    }
    case 'precision-rule': {
      // Report mode: IB-grade header bar (3px primary) + double hairline +
      // shared §/LASCA caption + folio placeholder. The "Source:" footnote
      // that belongs on a report page is layout-driven content, not motif.
      const headerBar = `<div style="${a}top:0;left:0;right:0;height:3px;background:${t.primary};opacity:0.95;"></div>`;
      const headerRule = `<div style="${a}top:6px;left:36px;right:36px;height:1px;background:${t.border};opacity:0.6;"></div>`;
      const headerLabel = layout === 'report-cover' ? '' :
        `<div style="${a}top:14px;left:36px;color:${t.muted};${capsCss}">§ REPORT</div>
         <div style="${a}top:14px;right:36px;color:${t.muted};${capsCss}">LASCA</div>`;
      const footerRule = `<div style="${a}bottom:28px;left:36px;right:36px;height:1px;background:${t.border};opacity:0.55;"></div>`;
      return headerBar + headerRule + headerLabel + leftRule + footerRule + folioBase;
    }
    default:
      return topCaption + leftRule + folioBase;
  }
}

// --- Import-adaptive font sizing ---
// When source='imported', content length is unpredictable. Scale fonts down
// to fit rather than clipping.

export function autoFontSize(text: string | undefined, maxPx: number, minPx: number): number {
  if (!text) return maxPx;
  const len = text.length;
  if (len <= 15) return maxPx;
  if (len <= 40) return Math.round(Math.max(minPx, maxPx - (len - 15) * (maxPx - minPx) / 25));
  return minPx;
}

// Auto-scale body font size based on REAL content volume (character count +
// newline count). Previous version only counted newlines — so 3 bullets of
// 100 chars each counted as "3 lines" and got max font, even though each
// bullet wraps to 3 visual lines. Now we estimate visual rows using both
// metrics and pick whichever suggests more density.
function autoBodyFontSize(text: string | undefined, maxPx: number, minPx: number): number {
  if (!text) return maxPx;
  const newlineRows = text.split('\n').length;
  // Estimate visual rows from char count (assuming ~42 chars/visual row at max
  // font in a typical ~460px body container). Chinese chars ≈ 1.6× display
  // width of Latin, so we bias the estimate upward for CJK content.
  const hasCjk = /[\u3400-\u9fff\uff00-\uffef]/.test(text);
  const charsPerRow = hasCjk ? 26 : 42;
  const charRows = Math.ceil(text.length / charsPerRow);
  const rows = Math.max(newlineRows, charRows);
  if (rows <= 6) return maxPx;
  if (rows <= 20) return Math.round(Math.max(minPx, maxPx - (rows - 6) * (maxPx - minPx) / 14));
  return minPx;
}

export const IMPORT_WORD_BREAK = 'word-break:break-word; overflow-wrap:anywhere;';

/**
 * Inline style fragment for a headline element. `isDisplay=true` for the
 * slide's primary display content (cover h1, big-number span, quote h2,
 * image h2) — gets the -1px tracking fallback and applies font-style if set.
 * Section headings and labels pass `isDisplay=false`.
 *
 * Always applies font-family / weight / features / variation-settings when set.
 * Only applies font-style on display elements (numbers/labels shouldn't be italic).
 */
export function headlineStyle(t: ThemeConfig, opts: { isDisplay?: boolean } = {}): string {
  const family = t.fontHeadline ?? t.fontBody ?? DEFAULT_FONT_STACK;
  const weight = t.headlineWeight ?? 700;
  const tracking = t.headlineTracking ?? (opts.isDisplay ? '-1px' : '0');
  const features = t.headlineFeatures ? `font-feature-settings:${t.headlineFeatures};` : '';
  const variation = t.headlineVariationSettings ? `font-variation-settings:${t.headlineVariationSettings};` : '';
  const style = (opts.isDisplay && t.headlineStyle) ? `font-style:${t.headlineStyle};` : '';
  return `font-family:${family}; font-weight:${weight}; letter-spacing:${tracking}; ${features}${variation}${style}`;
}

/**
 * displayStyle — hero text (cover titles, big-number heroes, quote openers).
 * Prefers `fontDisplay` when a theme defines one; falls back through fontHeadline
 * → fontBody. Respects headlineStyle (italic) and variation-settings like headlineStyle.
 */
export function displayStyle(t: ThemeConfig): string {
  const family = t.fontDisplay ?? t.fontHeadline ?? t.fontBody ?? DEFAULT_FONT_STACK;
  const weight = t.headlineWeight ?? 700;
  const tracking = t.headlineTracking ?? '-1px';
  const features = t.headlineFeatures ? `font-feature-settings:${t.headlineFeatures};` : '';
  const variation = t.headlineVariationSettings ? `font-variation-settings:${t.headlineVariationSettings};` : '';
  const style = t.headlineStyle ? `font-style:${t.headlineStyle};` : '';
  return `font-family:${family}; font-weight:${weight}; letter-spacing:${tracking}; ${features}${variation}${style}`;
}

/**
 * labelStyle — eyebrows, badges, folio, table headers, small-caps meta.
 * Falls back to fontBody. Defaults to uppercase + 0.08em tracking when the
 * theme doesn't specify labelTracking / labelTransform.
 */
export function labelStyle(t: ThemeConfig): string {
  const family = t.fontLabel ?? t.fontBody ?? DEFAULT_FONT_STACK;
  const tracking = t.labelTracking ?? '0.08em';
  const transform = t.labelTransform ?? 'uppercase';
  return `font-family:${family}; letter-spacing:${tracking}; text-transform:${transform};`;
}

/**
 * numericStyle — stat values, KPI numbers, numeric table cells.
 * Prefers `fontNumeric` (often the display face or a monospace for tables);
 * falls back through fontHeadline → fontBody. Injects tabular / lining numerals
 * by default so columns of numbers align cleanly.
 */
export function numericStyle(t: ThemeConfig): string {
  const family = t.fontNumeric ?? t.fontHeadline ?? t.fontBody ?? DEFAULT_FONT_STACK;
  const features = t.numericFeatures ?? "'tnum', 'lnum'";
  return `font-family:${family}; font-feature-settings:${features};`;
}

// ============================================================================
// Composer-shared primitives (Phase A — used by new cover variants and layouts
// across families: analysis / private-banking / lookbook). Pure string helpers,
// no DOM, safe to call from any renderer.
// ============================================================================

/**
 * Eyebrow label preceded by a short accent bar. The bar is the family's
 * signature device — a tiny editorial mark before an uppercase, letter-spaced
 * caption ("EXECUTIVE SUMMARY", "ASSET 1 · DEBT", "01 · EDUCATION").
 */
export function renderEyebrowWithBar(
  t: ThemeConfig,
  eyebrow: string,
  opts: { barWidthPx?: number; barColor?: string; fieldPath?: string } = {},
): string {
  const barWidth = opts.barWidthPx ?? 24;
  const barColor = opts.barColor ?? t.accent ?? t.primary;
  const fieldAttr = opts.fieldPath ? ` ${df(opts.fieldPath)}` : '';
  return `<div style="display:inline-flex; align-items:center; gap:10px;">
  <span style="display:inline-block; width:${barWidth}px; height:2px; background:${barColor};"></span>
  <span${fieldAttr} style="${labelStyle(t)} font-size:11px; color:${t.muted}; line-height:1;">${esc(eyebrow)}</span>
</div>`;
}

/**
 * Bilingual title block. ZH on top in display face, EN underneath in label
 * face — used on covers, section breaks, and any spot that wants a primary
 * + secondary heading pair. `inline` lays them side-by-side with a hairline
 * separator (good for narrow title strips); `stacked` is the default.
 */
export function renderBilingualTitle(
  t: ThemeConfig,
  zhTitle: string,
  enTitle?: string,
  opts: { zhSize?: number; enSize?: number; layout?: 'stacked' | 'inline'; fieldPath?: string } = {},
): string {
  const zhPx = opts.zhSize ?? 44;
  const enPx = opts.enSize ?? 18;
  const layout = opts.layout ?? 'stacked';
  const zhPath = opts.fieldPath ? `${opts.fieldPath}.zh` : undefined;
  const enPath = opts.fieldPath ? `${opts.fieldPath}.en` : undefined;
  const zhAttr = zhPath ? ` ${df(zhPath)}` : '';
  const enAttr = enPath ? ` ${df(enPath)}` : '';
  const zhEl = `<span${zhAttr} style="${displayStyle(t)} font-size:${zhPx}px; color:${t.text}; line-height:1.15; padding:0.05em 0; display:inline-block;">${esc(zhTitle)}</span>`;
  const enEl = enTitle
    ? `<span${enAttr} style="${labelStyle(t)} font-size:${enPx}px; color:${t.muted}; line-height:1.2;">${esc(enTitle)}</span>`
    : '';
  if (layout === 'inline' && enEl) {
    return `<div style="display:flex; align-items:baseline; gap:14px;">
  ${zhEl}
  <span style="display:inline-block; width:1px; height:${Math.round(zhPx * 0.6)}px; background:${t.border};"></span>
  ${enEl}
</div>`;
  }
  return `<div style="display:flex; flex-direction:column; gap:6px;">
  ${zhEl}
  ${enEl}
</div>`;
}

/**
 * Row of numbered pills ("01" · "02" · …) — the lookbook family's signature
 * cover/index device. Each pill carries a numeral and an optional caption;
 * numerals use `numericStyle` for tabular alignment, captions use `labelStyle`.
 */
export function renderNumberedPillRow(
  t: ThemeConfig,
  items: Array<{ num: string; label?: string }>,
  opts: { align?: 'left' | 'center'; spacing?: number } = {},
): string {
  const align = opts.align ?? 'left';
  const gap = opts.spacing ?? 18;
  const justify = align === 'center' ? 'center' : 'flex-start';
  const pills = items.map((item) => {
    const num = `<span style="${numericStyle(t)} font-size:14px; font-weight:600; color:${t.primary};">${esc(item.num)}</span>`;
    const label = item.label
      ? `<span style="${labelStyle(t)} font-size:10px; color:${t.muted};">${esc(item.label)}</span>`
      : '';
    const sep = item.label ? `<span style="display:inline-block; width:8px; height:1px; background:${t.border};"></span>` : '';
    return `<div style="display:inline-flex; align-items:center; gap:6px; padding:6px 12px; border:1px solid ${t.border}; border-radius:999px;">
    ${num}${sep}${label}
  </div>`;
  }).join('');
  return `<div style="display:flex; align-items:center; justify-content:${justify}; flex-wrap:wrap; gap:${gap}px;">
  ${pills}
</div>`;
}

// ============================================================================
// ---------------------------------------------------------------------------
// Chart embed helper — renders an inline chart for split-image / two-column
// ---------------------------------------------------------------------------

const CHART_RENDERERS: Record<string, (data: never, t: ThemeConfig, theme: Theme, tw: number, th: number) => string> = {};

/** Render a ChartEmbed into an HTML string suitable for embedding inside
 *  a split-image image area or a two-column column. Returns just the chart
 *  content (no outer wrapper with baseStyle). */
export function renderChartEmbed(chart: ChartEmbed, t: ThemeConfig, theme: Theme, tw = 460, th = 400): string {
  // Lazy-populate on first call to avoid circular import issues
  if (Object.keys(CHART_RENDERERS).length === 0) {
    // These are the same renderers registered in RENDERERS, but we need
    // access before RENDERERS is built (declared later in file).
    const c = require('./renderCharts');
    const d = require('./renderDiagrams');
    Object.assign(CHART_RENDERERS, {
      'bar-chart': c.renderBarChart,
      'horizontal-bar-chart': c.renderHorizontalBarChart,
      'line-chart': c.renderLineChart,
      'pie-chart': c.renderPieChart,
      'stacked-bar-chart': c.renderStackedBarChart,
      'scatter-chart': c.renderScatterChart,
      'dual-axis-bar': c.renderDualAxisBar,
      'heatmap': c.renderHeatmap,
      'flowchart': d.renderFlowchart,
      'funnel': d.renderFunnel,
      'pyramid': d.renderPyramid,
      'steps': d.renderSteps,
      'matrix': d.renderMatrix,
      'versus': d.renderVersus,
      'venn': d.renderVenn,
      'bullseye': d.renderBullseye,
      'cycle': d.renderCycle,
      'hub-spoke': d.renderHubSpoke,
    });
  }
  const renderer = CHART_RENDERERS[chart.type];
  if (!renderer) {
    return `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:${t.muted}; font-size:13px;">未知图表: ${esc(chart.type)}</div>`;
  }
  // Render the chart. The chart renderer returns a full slide HTML (with
  // baseStyle wrapper). We strip the outermost div's background so it
  // blends into the parent layout.
  const html = renderer(chart.data as never, t, theme, tw, th);
  // Replace the background in the outermost wrapper to transparent
  return html.replace(/background:[^;]*;/, 'background:transparent;');
}

// ============================================================================
// 8 Layout Renderers
// ============================================================================

function renderCoverDefault(data: CoverData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 52, 28);
  const subPx = autoFontSize(data.subtitle, 22, 16);
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h1 ${df('title')} style="font-size:${titlePx}px; line-height:1.15; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:16px; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${displayStyle(t)}">${escMd(data.title)}</h1>
  ${data.subtitle ? `<p ${df('subtitle')} style="font-size:${subPx}px; color:${ensureTextContrast(t.text, t.bg)}; margin-bottom:8px; ${IMPORT_WORD_BREAK}">${escMd(data.subtitle)}</p>` : ''}
  ${data.footnote ? `<p ${df('footnote')} style="font-size:15px; color:${ensureTextContrast(t.muted, t.bg)};">${esc(data.footnote)}</p>` : ''}
  ${data.author ? `<div style="width:200px; height:3px; background:${t.primary}; margin:28px 0 16px;"></div><p ${df('author')} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)};">${esc(data.author)}</p>` : ''}
</div>`;
}

/** Private Banking · Split cover — 40/60 split: left panel uses the theme's
 *  primary as a solid mass (navy / charcoal / burgundy) carrying the eyebrow
 *  + bilingual title + "FOR CLIENT" mark; right panel is the theme's cream
 *  background flat. Used for advisor-to-client deliverables. */
function renderCoverPbSplit(
  data: CoverData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  // Synthesise an inverted theme proxy for the dark panel: text reads against
  // the primary color, accent stays the theme's accent (gold / champagne / brass).
  const onPrimary: ThemeConfig = { ...t, text: '#f5f0e2', muted: 'rgba(245,240,226,0.65)', border: 'rgba(245,240,226,0.18)', primary: '#f5f0e2' };
  const eyebrow = data.subtitle
    ? renderEyebrowWithBar(onPrimary, data.subtitle, { fieldPath: 'subtitle', barColor: t.accent })
    : '';
  return `
<div class="${themeClass(theme)}" style="display:flex; ${baseStyle(t, isImport)} padding:0;">
  <div style="flex:0 0 40%; background:${t.primary}; color:#f5f0e2; padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px; display:flex; flex-direction:column; justify-content:space-between;">
    ${eyebrow || '<div></div>'}
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:36px 0;">
      ${renderBilingualTitle(onPrimary, data.title, data.titleEn, { zhSize: 52, fieldPath: 'title' })}
    </div>
    <div style="display:flex; flex-direction:column; gap:10px;">
      <span style="${labelStyle(t)} font-size:10.5px; color:${t.accent}; letter-spacing:0.22em;">FOR CLIENT · DISCUSSION ONLY</span>
      ${data.author ? `<p ${df('author')} style="font-size:13px; color:rgba(245,240,226,0.75); margin:0;">${esc(data.author)}</p>` : ''}
      ${data.footnote ? `<p ${df('footnote')} style="font-size:11.5px; color:rgba(245,240,226,0.55); margin:0;">${esc(data.footnote)}</p>` : ''}
    </div>
  </div>
  <div aria-hidden="true" style="flex:1;"></div>
</div>`;
}

/** Private Banking · Classic cover — full-bleed cream with a thin accent
 *  stripe along the top edge and a centered serif title. Ceremonial, used
 *  for traditional banking briefs and family-office annual reviews. */
function renderCoverPbClassic(
  data: CoverData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const titlePx = autoFontSize(data.title, 56, 32);
  return `
<div class="${themeClass(theme)}" style="position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <div aria-hidden="true" style="position:absolute; top:0; left:0; right:0; height:3px; background:${t.accent};"></div>
  ${data.subtitle ? `<p ${df('subtitle')} style="${labelStyle(t)} font-size:11px; color:${t.accent}; margin:0 0 24px;">${esc(data.subtitle)}</p>` : ''}
  <h1 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin:0; max-width:80%; line-height:1.15; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${displayStyle(t)}">${escMd(data.title)}</h1>
  ${data.footnote ? `<p ${df('footnote')} style="font-size:14px; color:${t.muted}; margin-top:32px;">${esc(data.footnote)}</p>` : ''}
  ${data.author ? `<p ${df('author')} style="${labelStyle(t)} font-size:11px; color:${t.muted}; margin-top:14px;">${esc(data.author)}</p>` : ''}
  <div aria-hidden="true" style="position:absolute; bottom:0; left:0; right:0; height:1px; background:${t.border};"></div>
</div>`;
}

/** Lookbook · Hero cover — 70/30 split: left near-black panel carries the
 *  eyebrow + bilingual title + numbered pills; right coral panel is a flat
 *  color mass (no content). Imposes its own colors regardless of theme bg. */
function renderCoverLookbookHero(
  data: CoverData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const pills = data.pills ?? [
    { num: '01' }, { num: '02' }, { num: '03' }, { num: '04' }, { num: '05' },
  ];
  // Override the theme's neutral text color so eyebrow / pills stay legible
  // against the near-black panel. We synthesise a high-contrast ThemeConfig
  // proxy for the dark side without mutating the original.
  const darkSide: ThemeConfig = { ...t, text: '#f5f4ef', muted: '#9a9892', border: 'rgba(255,255,255,0.18)', primary: '#f5f4ef' };
  const eyebrow = data.subtitle
    ? renderEyebrowWithBar(darkSide, data.subtitle, { fieldPath: 'subtitle', barColor: t.accent || '#d97757' })
    : '';
  return `
<div class="${themeClass(theme)}" style="display:flex; ${baseStyle(t, isImport)} padding:0;">
  <div style="flex:0 0 70%; background:#141413; color:#f5f4ef; padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px; display:flex; flex-direction:column; justify-content:space-between;">
    ${eyebrow || '<div></div>'}
    <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:36px 0;">
      ${renderBilingualTitle(darkSide, data.title, data.titleEn, { zhSize: 64, fieldPath: 'title' })}
    </div>
    <div style="display:flex; flex-direction:column; gap:14px;">
      ${renderNumberedPillRow(darkSide, pills, { align: 'left', spacing: 14 })}
      ${data.footnote ? `<p ${df('footnote')} style="font-size:13px; color:#9a9892;">${esc(data.footnote)}</p>` : ''}
      ${data.author ? `<p ${df('author')} style="font-size:12px; color:#9a9892;">${esc(data.author)}</p>` : ''}
    </div>
  </div>
  <div aria-hidden="true" style="flex:0 0 30%; background:${t.primary || '#d97757'};"></div>
</div>`;
}

/** Lookbook · Bold cover — full-bleed near-black with a single oversized
 *  bilingual title; small accent block in the bottom-right corner. Reads
 *  as a magazine cover statement, not a deck cover. */
function renderCoverLookbookBold(
  data: CoverData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const darkSide: ThemeConfig = { ...t, text: '#f5f4ef', muted: '#9a9892', border: 'rgba(255,255,255,0.2)', primary: '#f5f4ef' };
  const eyebrow = data.subtitle
    ? renderEyebrowWithBar(darkSide, data.subtitle, { fieldPath: 'subtitle', barColor: t.accent || '#d97757' })
    : '';
  return `
<div class="${themeClass(theme)}" style="position:relative; display:flex; flex-direction:column; justify-content:space-between; background:#141413; color:#f5f4ef; padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px; min-height:100%;">
  ${eyebrow || '<div></div>'}
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:48px 0;">
    ${renderBilingualTitle(darkSide, data.title, data.titleEn, { zhSize: 96, fieldPath: 'title' })}
  </div>
  <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:24px;">
    <div style="flex:1;">
      ${data.footnote ? `<p ${df('footnote')} style="font-size:13px; color:#9a9892; margin:0;">${esc(data.footnote)}</p>` : ''}
      ${data.author ? `<p ${df('author')} style="font-size:12px; color:#9a9892; margin:6px 0 0;">${esc(data.author)}</p>` : ''}
    </div>
    <div aria-hidden="true" style="width:84px; height:24px; background:${t.accent || '#d97757'}; flex-shrink:0;"></div>
  </div>
</div>`;
}

/** Lookbook · Numbered cover — full-bleed cream, top-left eyebrow with bar,
 *  centered headline, bottom row of 01-05 numbered pills. The signature
 *  cover for the `lookbook` family; pairs with `lookbook-ember` theme. */
function renderCoverLookbookNumbered(
  data: CoverData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const pills = data.pills ?? [
    { num: '01' }, { num: '02' }, { num: '03' }, { num: '04' }, { num: '05' },
  ];
  const eyebrow = data.subtitle
    ? renderEyebrowWithBar(t, data.subtitle, { fieldPath: 'subtitle' })
    : '<div></div>';
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; justify-content:space-between; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${eyebrow}
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:48px 0;">
    ${renderBilingualTitle(t, data.title, data.titleEn, { zhSize: 72, fieldPath: 'title' })}
  </div>
  <div style="display:flex; flex-direction:column; gap:18px;">
    ${renderNumberedPillRow(t, pills, { align: 'left', spacing: 14 })}
    ${data.footnote ? `<p ${df('footnote')} style="font-size:13px; color:${t.muted};">${esc(data.footnote)}</p>` : ''}
    ${data.author ? `<p ${df('author')} style="font-size:12px; color:${t.muted};">${esc(data.author)}</p>` : ''}
  </div>
</div>`;
}

/** Slide-channel cover router. `data.coverVariant` (set by the composer or by
 *  user override) selects a variant renderer; unknown / unset / unimplemented
 *  variants fall back to the default editorial layout. New variant renderers
 *  are added in Phase B/C as the lookbook / private-banking families come on. */
function renderCover(data: CoverData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  switch (data.coverVariant) {
    case 'lookbook-numbered':
      return renderCoverLookbookNumbered(data, t, theme, tw, th, isImport);
    case 'lookbook-hero':
      return renderCoverLookbookHero(data, t, theme, tw, th, isImport);
    case 'lookbook-bold':
      return renderCoverLookbookBold(data, t, theme, tw, th, isImport);
    case 'private-banking-split':
      return renderCoverPbSplit(data, t, theme, tw, th, isImport);
    case 'private-banking-classic':
      return renderCoverPbClassic(data, t, theme, tw, th, isImport);
    default:
      return renderCoverDefault(data, t, theme, tw, th, isImport);
  }
}

export function renderBigNumber(data: BigNumberData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const numPx = autoFontSize(data.number, 140, 40);
  const textPx = autoFontSize(data.text, 28, 18);
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <span ${df('number')} style="font-size:${numPx}px; color:${ensureTextContrast(t.primary, t.bg)}; line-height:1; font-weight:${t.headlineWeight ?? 700}; letter-spacing:${t.headlineTracking ?? '-1px'}; ${numericStyle(t)}">${esc(data.number)}</span>
  <p ${df('text')} style="font-size:${textPx}px; color:${ensureTextContrast(t.text, t.bg)}; margin-top:16px; ${IMPORT_WORD_BREAK}">${escMd(data.text)}</p>
  ${(data.footnote || data.highlight) ? `<div style="width:120px; height:2px; background:${t.border}; margin:24px 0;"></div>` : ''}
  ${data.footnote ? `<p ${df('footnote')} style="font-size:14px; color:${ensureTextContrast(t.muted, t.bg)};">${esc(data.footnote)}</p>` : ''}
  ${data.highlight ? `<p ${df('highlight')} style="font-size:17px; color:${ensureTextContrast(t.accent, t.bg)}; margin-top:20px; font-weight:500;">${escMd(data.highlight)}</p>` : ''}
</div>`;
}

/** three-cards is now an alias for grid-cards in hero mode (backward compat). */
function renderThreeCards(data: ThreeCardsData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  // Adapt ThreeCardsData to GridCardsData shape then delegate to grid-cards.
  // When AI generates >3 items, use 2-col grid (2×2) instead of 3+1 which
  // leaves an ugly empty cell. ≤3 items always use 3-col single row.
  const cards = data.cards || [];
  const cols = cards.length > 3 ? 2 : 3;
  const gridData: GridCardsData = { title: data.title, columns: cols, cards, footer: undefined };
  return renderGridCards(gridData, t, theme, tw, th, isImport, /* heroMode */ true);
}

function renderTwoColumn(data: TwoColumnData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const left = data.left || {};
  const right = data.right || {};
  const titlePx = autoFontSize(data.title, 30, 20);
  const wb = IMPORT_WORD_BREAK;
  const colOverflow = isImport ? 'overflow-y:auto;' : '';
  const chartOnRight = (data.chartPosition || 'right') === 'right';

  /** Detect list-like content: 2+ non-empty lines separated by \n */
  const isListContent = (text?: string) => {
    if (!text) return false;
    const lines = text.split('\n').filter(l => l.trim());
    return lines.length >= 2;
  };

  // ---- Phase 7.2: pre-render content budget check --------------------
  // Estimate total content height per column; if over the card budget,
  // reduce body font size and/or drop optional sub. Addresses user feedback
  // that long bullet lists pack to the card edge without breathing room
  // even after CSS clipping fixes.
  //
  // Budget math (slide canvas 540px):
  //   canvas height           540
  //   outer padding top+bot   -80  (SAFE_INSET.y × 2)
  //   title + margin          -60  (auto-sized headline + 24px)
  //   footer (if present)     -30
  //   row gap                  -0  (flex handles it)
  //   → row height ≈          370-380px
  //   card padding top+bot    -40  (20px × 2 inside card)
  //   → card content area ≈   330-340px
  //
  // Column inner width at 960 canvas, 56px horizontal padding each side,
  // 32px row gap between columns, 1px divider:
  //   (960 - 112 - 32 - 1) / 2 ≈ 407px, minus 22px card padding × 2 = 363px
  const CARD_CONTENT_BUDGET = data.footer ? 310 : 340;
  const CARD_INNER_WIDTH = 360;

  // Fit each column independently but use the TIGHTEST resulting font size
  // across both columns so they render with matching typography.
  const fitColumn = (col: typeof left): BudgetFitResult | null => {
    if (!col.content) return null;
    const isList = isListContent(col.content);
    const bullets = col.content.split('\n').filter(l => l.trim());

    const fixed: LayoutElement[] = [];
    if (col.heading) {
      fixed.push({
        text: col.heading,
        fontSize: 20,
        lineHeight: 1.3,
        marginBottom: isList ? 16 : 12,
      });
    }

    const body: LayoutElement[] = isList
      ? bullets.map(b => ({ text: b, fontSize: 17, lineHeight: 1.55, marginBottom: 8 }))
      : [{ text: col.content, fontSize: 17, lineHeight: 1.8, marginBottom: 0 }];

    const optional: LayoutElement | undefined = col.sub
      ? { text: col.sub, fontSize: 14, lineHeight: 1.6, marginTop: 12 }
      : undefined;

    return fitToBudget({
      fixed,
      body,
      optional,
      containerWidthPx: CARD_INNER_WIDTH,
      budgetPx: CARD_CONTENT_BUDGET,
      maxBodyPx: 17,
      minBodyPx: 12,
    });
  };

  const leftFit = fitColumn(left);
  const rightFit = fitColumn(right);

  // Tightest font size across both columns for visual parity.
  const contentPx = Math.min(
    leftFit?.bodyFontSize ?? 17,
    rightFit?.bodyFontSize ?? 17,
  );
  // Per-column dropSub decision (each column can independently drop its sub).
  const dropSubLeft = leftFit?.dropSub ?? false;
  const dropSubRight = rightFit?.dropSub ?? false;

  /** Render content as bullet list or paragraph based on content shape */
  const renderContent = (text: string, prefix: string, dotColor: string) => {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length >= 2) {
      // List mode: render each line with an accent dot bullet
      const items = lines.map((line) =>
        `<div style="display:flex; align-items:baseline; gap:10px; margin-bottom:8px;">
          <span style="width:6px; height:6px; border-radius:50%; background:${dotColor}; flex-shrink:0; margin-top:7px;"></span>
          <span ${df(`${prefix}.content`)} style="font-size:${contentPx}px; color:${t.text}; line-height:1.55; ${wb}">${escMd(line)}</span>
        </div>`
      ).join('\n');
      return `<div>${items}</div>`;
    }
    // Paragraph mode: original behavior
    return `<p ${df(`${prefix}.content`)} style="font-size:${contentPx}px; color:${t.text}; line-height:1.8; ${wb}">${nl2brMd(text)}</p>`;
  };

  const renderCol = (col: typeof left, prefix: 'left' | 'right', useAccent = false, dropSub = false) => {
    const hColor = useAccent ? t.primary : t.muted;
    const dotColor = useAccent ? t.primary : t.accent;
    const isList = isListContent(col.content);
    // Add card-like background when content is list-like for visual weight
    const cardStyle = isList ? `background:${t.cardBg}; border-radius:${t.radiusCard ?? 12}px; padding:20px 22px;` : '';
    // Top-align content in both columns (no margin:auto 0). Previously we
    // tried to center content vertically, but that creates visual asymmetry
    // when one column has more content than the other — the shorter one
    // appears "floating mid-card" while the denser one fills from top. Users
    // perceive this as a card-height bug even though card backgrounds ARE
    // equal height (flex:1 + default align-items:stretch on the row). Top-
    // alignment gives both columns the same starting point.
    return `<div style="flex:1; display:flex; flex-direction:column; overflow:hidden; ${colOverflow}">
      <div style="flex:1; display:flex; flex-direction:column; ${cardStyle}">
        <div style="flex:1; min-height:0; overflow:hidden;">
          ${col.heading ? `<p ${df(`${prefix}.heading`)} style="font-size:20px; color:${hColor}; margin:0 0 ${isList ? '16' : '12'}px; ${wb} ${headlineStyle(t)}">${escMd(col.heading)}</p>` : ''}
          ${col.content ? renderContent(col.content, prefix, dotColor) : ''}
          ${col.sub && !dropSub ? `<p ${df(`${prefix}.sub`)} style="font-size:14px; color:${t.muted}; margin-top:12px; line-height:1.6; ${wb}">${nl2brMd(col.sub)}</p>` : ''}
        </div>
      </div>
    </div>`;
  };

  const chartCol = data.chart
    ? `<div style="flex:1; display:flex; align-items:center; justify-content:center; overflow:hidden;">${renderChartEmbed(data.chart, t, theme, 420, 360)}</div>`
    : null;

  const leftHtml = data.chart && !chartOnRight ? chartCol! : renderCol(left, 'left', false, dropSubLeft);
  const rightHtml = data.chart && chartOnRight ? chartCol! : renderCol(right, 'right', true, dropSubRight);

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:24px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:flex; gap:32px; flex:1; min-height:0; overflow:hidden;">
    ${leftHtml}
    <div style="width:1px; background:${t.border};"></div>
    ${rightHtml}
  </div>
  ${data.footer ? `<p ${df('footer')} style="font-size:15px; font-weight:500; text-align:center; color:${t.accent}; margin-top:16px;">${esc(data.footer)}</p>` : ''}
</div>`;
}

export function renderStackedBars(data: StackedBarsData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const bars = data.bars || [];
  const barRadius = t.radiusBar ?? 8;
  const barsHtml = bars.map((bar, i) => {
    const bg = resolveBarColor(bar.color, t);
    return `<div ${df(`bars.${i}.text`)} style="background:${bg}; color:${contrastTextOnBg(bg)}; padding:14px 24px; border-radius:${barRadius}px; font-size:16px; text-align:center;">${escMd(bar.text)}</div>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:20px; line-height:1.15; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:flex; flex-direction:column; gap:8px; flex:1; min-height:0; overflow:hidden; justify-content:center; ${isImport ? 'overflow-y:auto;' : ''}">
    ${barsHtml}
  </div>
</div>`;
}

function renderGridCards(data: GridCardsData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false, heroMode = false): string {
  const rawCards = data.cards || [];
  // Drop empty-shell cards (no label/desc/image) — prevents orphan-badge
  // cards from appearing when LLM emits `{badge:"DATA"}` with nothing else.
  const cards = rawCards.filter(c => {
    if (!c) return false;
    const hasText = (c.label && c.label.trim()) || (c.desc && c.desc.trim());
    return hasText || !!c.image_url;
  });
  const cols = data.columns || Math.min(cards.length, 4) || 3;
  const cardSurface = t.cardSurface ?? t.cardShadow;
  const radius = t.radiusCard ?? (heroMode ? 12 : 10);
  // Hero mode (used by three-cards alias): larger label, more padding
  const labelMaxPx = heroMode ? (isImport ? 36 : 52) : 32;
  const titleMaxPx = heroMode ? 16 : 15;
  const descMaxPx = 13;
  const cardPad = heroMode ? '28px 20px' : '20px';
  const cardPadV = heroMode ? 56 : 40; // vertical padding (top + bottom)
  const cardPadH = heroMode ? 40 : 40; // horizontal padding (l + r)
  const gridGap = heroMode ? 20 : 14;
  const wb = IMPORT_WORD_BREAK;
  const imgRadius = Math.max(radius - 4, 4);

  // ───── Per-card height/width budget (Phase 7.2 fitToBudget) ──────────
  // The previous implementation stacked label(52px) + title(2 lines × 15)
  // + desc(4 lines × 13×1.5) inside `overflow:hidden` and silently clipped
  // anything past the card's flex-derived height. Now we size each card to
  // a real budget and shrink (or drop desc) to fit. See note at top of
  // renderFeaturedGrid / renderBento for sibling layouts that share this
  // pattern — port this block before inventing a new shrink algorithm.
  const titlePx = autoFontSize(data.title, heroMode ? 34 : 28, heroMode ? 22 : 18);
  const titleArea = data.title ? titlePx * 1.2 + (heroMode ? 28 : 20) : 0;
  const footerArea = data.footer ? 13 * 1.5 + 12 : 0;
  const innerH = Math.max(120, th - SAFE_INSET.y * 2 - titleArea - footerArea);
  const rowCount = Math.max(1, Math.ceil(cards.length / cols));
  const rowGapTotal = gridGap * (rowCount - 1);
  const cardBudgetPx = Math.max(80, Math.floor((innerH - rowGapTotal) / rowCount) - cardPadV);
  const cardWidthCss = Math.max(120, Math.floor((tw - SAFE_INSET.x * 2 - (cols - 1) * gridGap) / cols) - cardPadH);

  const cardsHtml = cards.map((card, i) => {
    const hasImg = !!card.image_url;
    const align = hasImg ? 'align-items:stretch;' : 'align-items:flex-start;';
    const pad = hasImg ? `0 0 ${heroMode ? 20 : 16}px 0` : cardPad;
    const labelStr = card.label ?? '';
    const labelLen = [...labelStr].length;
    // Metric (numeric or very short token) stays hero-sized (52/32px); phrase
    // labels render as a compact sub-headline so text-only tiles don't bloat.
    // CJK chars are ~2x wider than Latin, so the char-count threshold is half.
    const hasCJK = /[㐀-鿿豈-﫿]/.test(labelStr);
    const isMetric = (hasCJK ? labelLen <= 3 : labelLen <= 6) || /^[\d\s.,$¥€%+\-/–~]+$/.test(labelStr);
    const labelStartPx = isMetric ? labelMaxPx : (heroMode ? 22 : 18);

    // Run fitToBudget on text-only cards (image cards are sized by the
    // image itself; the text below is short by design — clampLines(2) handles it).
    let labelPx = labelStartPx;
    let titleAdjPx = titleMaxPx;
    let showDesc = !!card.desc;
    if (!hasImg) {
      const fixedEls: LayoutElement[] = [];
      if (card.badge) {
        fixedEls.push({ text: card.badge, fontSize: 11, lineHeight: 1.4, marginBottom: 6 });
      }
      const bodyEls: LayoutElement[] = [
        { text: labelStr, fontSize: labelStartPx, lineHeight: 1.1, marginBottom: heroMode ? 10 : 6 },
        { text: card.title ?? '', fontSize: titleMaxPx, lineHeight: 1.3, marginBottom: heroMode ? 6 : 4, fixedLines: card.title ? Math.min(2, estimateVisualLines(card.title, titleMaxPx, cardWidthCss)) : 0 },
      ];
      const descMaxLines = heroMode ? 8 : 4;
      const optionalEl: LayoutElement | undefined = card.desc
        ? { text: card.desc, fontSize: descMaxPx, lineHeight: 1.5, fixedLines: Math.min(descMaxLines, estimateVisualLines(card.desc, descMaxPx, cardWidthCss)) }
        : undefined;
      const fit: BudgetFitResult = fitToBudget({
        fixed: fixedEls,
        body: bodyEls,
        optional: optionalEl,
        containerWidthPx: cardWidthCss,
        budgetPx: cardBudgetPx,
        maxBodyPx: labelStartPx,
        minBodyPx: 14,
      });
      // body[] all share one font-size, but label and title need different
      // sizes — interpret fit.bodyFontSize as a scale ratio from labelStartPx.
      const r = fit.bodyFontSize / labelStartPx;
      labelPx = Math.max(isMetric ? 16 : 14, Math.round(labelStartPx * r));
      titleAdjPx = Math.max(11, Math.round(titleMaxPx * r));
      showDesc = !!card.desc && !fit.dropSub;
    }

    const labelColorCss = isMetric
      ? ensureTextContrast(labelColor(i, t), t.cardBg)
      : ensureTextContrast(t.text, t.cardBg);
    const labelStyleExtra = isMetric ? headlineStyle(t) : 'font-weight:600;';
    // Suppress duplicate title when it equals label (common from upstream
    // builders that pass the same string into both fields).
    const titleEqualsLabel = (card.title || '').trim() === (card.label || '').trim();
    const showTitle = !!card.title && !titleEqualsLabel;
    return `
    <div style="background:${t.cardBg}; border-radius:${radius}px; padding:${pad}; display:flex; flex-direction:column; ${align} box-shadow:${cardSurface}; overflow:hidden; ${isImport ? 'overflow-y:auto;' : ''}">
      ${cardImage(card.image_url, 0, heroMode ? '140px' : '100px')}
      <div style="${hasImg ? 'padding:0 16px;' : ''} min-width:0;">
        ${badgePill(card.badge, t, `cards.${i}.badge`)}
        ${!hasImg ? `<span ${df(`cards.${i}.label`)} style="font-size:${labelPx}px; color:${labelColorCss}; ${labelStyleExtra}">${esc(card.label)}</span>` : ''}
        ${showTitle ? `<p ${df(`cards.${i}.title`)} style="font-size:${hasImg ? autoFontSize(card.title, heroMode ? 16 : 15, 12) : titleAdjPx}px; color:${ensureTextContrast(t.text, t.cardBg)}; margin-top:${hasImg ? 0 : (heroMode ? 10 : 6)}px; font-weight:${hasImg ? 600 : 500}; ${wb} ${clampLines(2)}">${escMd(card.title)}</p>` : ''}
        ${(hasImg ? !!card.desc : showDesc) ? `<p ${df(`cards.${i}.desc`)} style="font-size:${descMaxPx}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:${heroMode ? 6 : 4}px; line-height:1.5; ${wb} ${clampLines(heroMode ? 8 : 4)}">${escMd(card.desc)}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');

  // grid-auto-rows: minmax(0, 1fr) is load-bearing — without the 0 floor,
  // the browser lets each row grow to intrinsic content height, which
  // defeats `flex:1` on the parent and causes the whole grid to scroll
  // the slide instead of dividing height evenly.
  const gridStyle = heroMode && isImport
    ? `display:flex; flex-wrap:wrap; gap:${gridGap}px; flex:1; min-height:0; min-width:0;`
    : `display:grid; grid-template-columns:repeat(${cols}, minmax(0, 1fr)); grid-auto-rows:minmax(0, 1fr); gap:${gridGap}px; flex:1; min-height:0; min-width:0; ${isImport ? 'overflow-y:auto;' : ''}`;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:${heroMode ? 28 : 20}px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="${gridStyle}">
    ${cardsHtml}
  </div>
  ${data.footer ? `<p ${df('footer')} style="font-size:13px; text-align:center; color:${ensureTextContrast(t.muted, t.bg)}; margin-top:12px;">${escMd(data.footer)}</p>` : ''}
</div>`;
}

function renderQuote(data: QuoteData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  const quotePx = autoFontSize(data.quote, 34, 20);
  const padX = 72, padY = 48;
  const contentWidth = Math.max(200, tw - padX * 2);
  const bodyWidth = Math.floor(contentWidth * 0.8); // matches max-width:80%

  // Build a fitToBudget call: quote is fixed (autoFontSize already picked),
  // body is the scalable element, highlight is optional (drop to save space).
  const quoteWidth = Math.floor(contentWidth * 0.9); // matches max-width:90%
  const quoteLines = estimateVisualLines(data.quote || '', quotePx, quoteWidth);
  const quoteHeight = quoteLines * quotePx * 1.2 + 20; // + margin-bottom:20
  const glyphHeight = 80 * 0.8 + 12; // big opening quote
  const dividerBlock = 2 + 24 + 12; // divider height + margins
  const authorHeight = data.author ? 13 * 1.2 : 0;
  const fixedHeight = glyphHeight + quoteHeight + dividerBlock + authorHeight;

  const bodyEl: LayoutElement | null = data.body
    ? { text: data.body, fontSize: 18, lineHeight: 1.7, marginBottom: 0 }
    : null;
  const highlightEl: LayoutElement | null = data.highlight
    ? { text: data.highlight, fontSize: 16, lineHeight: 1.3, marginTop: 20, marginBottom: 0 }
    : null;
  const budget = Math.max(60, th - padY * 2 - fixedHeight - 8);

  let bodyPx = 18;
  let dropHighlight = false;
  if (bodyEl) {
    const fit = fitToBudget({
      fixed: [], body: [bodyEl], optional: highlightEl || undefined,
      containerWidthPx: bodyWidth, budgetPx: budget,
      maxBodyPx: 18, minBodyPx: 12, stepPx: 1,
    });
    bodyPx = fit.bodyFontSize;
    dropHighlight = fit.dropSub;
  }
  // Two-block structure: main quote is vertically centered in a flex:1 zone;
  // the byline (divider + author) pins to the bottom of the padded content
  // area. Prevents the attribution from floating mid-slide — fixes the
  // "在了不该在的地方" complaint — and keeps clear of the scene's bottom chrome
  // (PE-style centered folio sits at bottom:6px, below the padY:48 area).
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${padY}px ${padX}px;">
  <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:0; width:100%;">
    <span style="font-size:80px; color:${t.border}; font-weight:700; line-height:0.8; margin-bottom:12px; opacity:0.6;">\u201C</span>
    <h2 ${df('quote')} style="font-size:${quotePx}px; line-height:1.15; padding:0.05em 0; color:${t.primary}; margin-bottom:20px; text-align:center; max-width:90%; ${IMPORT_WORD_BREAK} ${headlineStyle(t, { isDisplay: true })}">${escMd(data.quote)}</h2>
    ${data.body ? `<p ${df('body')} style="font-size:${bodyPx}px; color:${t.text}; line-height:1.7; text-align:center; max-width:80%; margin:0 auto;">${nl2brMd(data.body)}</p>` : ''}
    ${data.highlight && !dropHighlight ? `<p ${df('highlight')} style="font-size:16px; font-weight:600; color:${t.accent}; margin-top:20px; text-align:center;">${escMd(data.highlight)}</p>` : ''}
  </div>
  ${data.author ? `<div style="display:flex; flex-direction:column; align-items:center; flex-shrink:0;">
    <div style="width:120px; height:2px; background:${t.primary}; margin-bottom:12px;"></div>
    <p ${df('author')} style="font-size:13px; color:${t.muted}; margin:0;">${esc(data.author)}</p>
  </div>` : ''}
</div>`;
}

function renderImage(data: ImageData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const overlayMap: Record<string, string> = {
    dark:  'rgba(0,0,0,0.45)',
    light: 'rgba(255,255,255,0.35)',
    none:  'transparent',
  };
  const overlay = overlayMap[data.overlay || 'dark'] || overlayMap.dark;
  const hasImage = !!data.image_url;
  // Scene v2: when image URL is missing AND the theme belongs to a scene,
  // render algorithmic-art SVG as the full-bleed background instead of
  // the emoji-in-dashed-box placeholder. Non-scene themes keep the legacy
  // emoji fallback for backward compat.
  const sceneArtSvg = !hasImage ? getArtPlaceholder(
    theme,
    _tw, _th,
    hashSeed(`image:${data.title || ''}:${data.image_prompt || ''}`),
    paletteFromTheme(t.primary, t.accent, t.muted, t.cardBg),
  ) : '';
  const hasSceneArt = sceneArtSvg.length > 0;

  const bgImage = hasImage
    ? `background-image:url('${data.image_url}'); background-size:cover; background-position:center;`
    : `background:${t.bg};`;
  const isDarkBgFlat = !hasImage && typeof t.bg === 'string' && t.bg.startsWith('#') && t.bg.toLowerCase() === '#1a1a1a';
  const textColor = (data.overlay === 'light' || isDarkBgFlat) ? t.text : '#ffffff';
  const mutedColor = (data.overlay === 'light' || isDarkBgFlat) ? t.muted : 'rgba(255,255,255,0.7)';

  // Legacy emoji fallback only when no scene art + no image.
  const legacyPlaceholder = (!hasImage && !hasSceneArt) ? `
    <div style="width:120px; height:120px; border:2px dashed ${t.muted}; border-radius:16px; display:flex; align-items:center; justify-content:center; margin-bottom:24px;">
      <span style="font-size:40px; color:${t.muted};">\uD83D\uDDBC</span>
    </div>
    ${data.image_prompt ? `<p style="font-size:13px; color:${t.muted}; margin-bottom:24px; font-style:italic;">${esc(data.image_prompt)}</p>` : ''}
  ` : '';

  // Scene art as a full-bleed background layer under the text content.
  const sceneArtLayer = hasSceneArt
    ? `<div style="position:absolute; inset:0; z-index:0;">${sceneArtSvg}</div>`
    : '';

  return `
<div class="${themeClass(theme)}" style="position:relative; overflow:hidden; ${baseStyle(t)} ${bgImage}">
  ${sceneArtLayer}
  ${hasImage ? `<div style="position:absolute; inset:0; background:${overlay};"></div>` : ''}
  <div style="position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:60px; text-align:center;">
    ${legacyPlaceholder}
    ${data.title ? `<h2 ${df('title')} style="font-size:40px; line-height:1.15; padding:0.05em 0; color:${hasImage ? textColor : t.primary}; margin-bottom:12px; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h2>` : ''}
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:20px; color:${hasImage ? mutedColor : t.text};">${escMd(data.subtitle)}</p>` : ''}
  </div>
</div>`;
}

// ============================================================================
// v3 New Slide Layouts
// ============================================================================

function renderTitleBody(data: TitleBodyData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 30, 20);
  const wb = IMPORT_WORD_BREAK;
  const padX = 64, padY = 48;
  // Body wrapper uses max-width:85% of the content area (tw - padX*2).
  const contentWidth = Math.max(200, (tw - padX * 2));
  const bodyWidth = Math.floor(contentWidth * 0.85);
  const paragraphs = (data.body || '').split(/\n\s*\n/).filter(p => p.trim());

  // Compute vertical budget: slide height − top/bottom padding − title block − optional footnote.
  const titleLines = data.title ? estimateVisualLines(data.title, titlePx, contentWidth) : 0;
  const titleHeight = titleLines > 0 ? titleLines * titlePx * 1.2 + 24 : 0; // 24 = margin-bottom
  const footnoteHeight = data.footnote
    ? estimateVisualLines(data.footnote, 14, contentWidth) * 14 * 1.5 + 24
    : 0;
  const budget = Math.max(60, th - padY * 2 - titleHeight - footnoteHeight - 8);

  // Budget-aware font pick. Each paragraph = one LayoutElement.
  const bodyEls: LayoutElement[] = paragraphs.map(p => ({
    text: p, fontSize: 17, lineHeight: 1.7, marginBottom: 14,
  }));
  const fit = paragraphs.length > 0
    ? fitToBudget({
        fixed: [], body: bodyEls, containerWidthPx: bodyWidth,
        budgetPx: budget, maxBodyPx: 17, minBodyPx: 11, stepPx: 1,
      })
    : { bodyFontSize: 17, dropSub: false, fits: true, estimatedHeight: 0 };
  const bodyPx = fit.bodyFontSize;

  const bodyHtml = paragraphs.map((p, i) =>
    `<p ${df(`body.${i}`)} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.text, t.bg)}; line-height:1.7; margin:0 0 14px; ${wb}">${nl2brMd(p.trim())}</p>`
  ).join('');
  // Fallback: even at minPx the content overflows. Show a scrollbar instead
  // of silently clipping at the slide edge. Imports already had this; now all
  // overflow cases get it.
  const needsScroll = isImport || !fit.fits;
  const scrollStyle = needsScroll ? `overflow-y:auto; max-height:${budget}px;` : '';
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; justify-content:center; ${baseStyle(t, isImport)} padding:${padY}px ${padX}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:24px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="max-width:85%; ${scrollStyle}">${bodyHtml}</div>
  ${data.footnote ? `<p ${df('footnote')} style="font-size:14px; color:${ensureTextContrast(t.muted, t.bg)}; margin-top:24px;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

function renderSplitImage(data: SplitImageData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  const hasChart = !!data.chart;
  const hasImage = !!data.image_url;
  const pos = data.imagePosition;
  const isVertical = pos === 'top' || pos === 'bottom';

  // Chart canvas target. Horizontal split → half width × full height.
  // Vertical split → full width × ~55% height (text zone auto-sized above/below).
  const chartW = isVertical ? Math.max(320, tw - SAFE_INSET.x * 2) : 460;
  const chartH = isVertical ? Math.max(220, Math.round(th * 0.55)) : 480;
  const artW = isVertical ? Math.max(320, tw) : 640;
  const artH = isVertical ? Math.max(220, Math.round(th * 0.55)) : 540;

  let mediaSide: string;
  if (hasChart) {
    mediaSide = `<div style="${isVertical ? 'flex:1; min-height:0;' : 'flex:1;'} display:flex; align-items:center; justify-content:center; overflow:hidden;">
      ${renderChartEmbed(data.chart!, t, theme, chartW, chartH)}
    </div>`;
  } else {
    const sceneArtSvg = !hasImage ? getArtPlaceholder(
      theme,
      artW, artH,
      hashSeed(`split:${data.title || ''}:${data.image_prompt || ''}`),
      paletteFromTheme(t.primary, t.accent, t.muted, t.cardBg),
    ) : '';
    const hasSceneArt = sceneArtSvg.length > 0;
    if (hasImage) {
      mediaSide = `<div style="flex:1; min-height:0; background-image:url('${data.image_url}'); background-size:cover; background-position:center;"></div>`;
    } else if (hasSceneArt) {
      mediaSide = `<div style="flex:1; min-height:0; position:relative; overflow:hidden;">${sceneArtSvg}</div>`;
    } else {
      mediaSide = `<div style="flex:1; min-height:0; background:${t.cardBg}; display:flex; align-items:center; justify-content:center;">
        <div style="text-align:center;">
          <div style="width:80px; height:80px; border:2px dashed ${t.muted}; border-radius:12px; display:flex; align-items:center; justify-content:center; margin:0 auto 12px;">
            <span style="font-size:32px; color:${t.muted};">\uD83D\uDDBC</span>
          </div>
          ${data.image_prompt ? `<p style="font-size:12px; color:${t.muted}; font-style:italic;">${esc(data.image_prompt)}</p>` : ''}
        </div>
      </div>`;
    }
  }

  const titlePx = autoFontSize(data.title, 28, 18);
  const wb = IMPORT_WORD_BREAK;
  // Horizontal: text side is half width. Vertical: text zone is full width minus padding,
  // height-budget is whatever the media leaves behind (~40% of th).
  const textSideWidth = isVertical
    ? Math.max(200, tw - SAFE_INSET.x * 2)
    : Math.max(160, tw / 2 - SAFE_INSET.x * 2);
  const paragraphs = (data.body || '').split(/\n\s*\n/).filter(p => p.trim());
  const titleLines = data.title ? estimateVisualLines(data.title, titlePx, textSideWidth) : 0;
  const titleHeight = titleLines > 0 ? titleLines * titlePx * 1.2 + 16 : 0;
  const budget = isVertical
    ? Math.max(40, Math.round(th * 0.35) - SAFE_INSET.y * 2 - titleHeight - 8)
    : Math.max(60, th - SAFE_INSET.y * 2 - titleHeight - 8);

  const bodyEls: LayoutElement[] = paragraphs.map(p => ({
    text: p, fontSize: 16, lineHeight: 1.7, marginBottom: 10,
  }));
  const fit = paragraphs.length > 0
    ? fitToBudget({
        fixed: [], body: bodyEls, containerWidthPx: textSideWidth,
        budgetPx: budget, maxBodyPx: 16, minBodyPx: 11, stepPx: 1,
      })
    : { bodyFontSize: 16, dropSub: false, fits: true, estimatedHeight: 0 };
  const bodyPx = fit.bodyFontSize;
  const needsScroll = isImport || !fit.fits;
  const bodyHtml = paragraphs.length > 1
    ? paragraphs.map((p, i) => `<p ${df(`body.${i}`)} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.text, t.bg)}; line-height:1.7; margin:0 0 10px; ${wb}">${nl2brMd(p.trim())}</p>`).join('')
    : (data.body ? `<p ${df('body')} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.text, t.bg)}; line-height:1.7; margin:0; ${wb}">${nl2brMd(data.body)}</p>` : '');
  // Vertical stacks: text zone sizes to content (flex:0 0 auto), media fills remainder.
  // Horizontal: text and media split 50/50 (flex:1 each).
  const textFlex = isVertical ? 'flex:0 0 auto;' : 'flex:1;';
  const textSide = `<div style="${textFlex} display:flex; flex-direction:column; justify-content:center; padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px; ${needsScroll && !isVertical ? `overflow-y:auto; max-height:${th}px;` : ''}">
    ${data.title ? `<h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:${isVertical ? 10 : 16}px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
    ${bodyHtml}
  </div>`;

  // Layout assembly. bottom = 上文下图 (textSide then mediaSide in column).
  const flexDir = isVertical ? 'flex-direction:column;' : '';
  const mediaFirst = pos === 'left' || pos === 'top';
  return `
<div class="${themeClass(theme)}" style="display:flex; ${flexDir} ${baseStyle(t, isImport)}">
  ${mediaFirst ? mediaSide + textSide : textSide + mediaSide}
</div>`;
}

export function renderIconList(data: IconListData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const items = data.items || [];
  const itemsHtml = items.map((item, i) => {
    const iconColor = labelColor(i, t);
    const needsGlyph = !item.icon || containsEmoji(item.icon);
    const iconVisual = needsGlyph
      ? `<span ${df(`items.${i}.icon`)} style="display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:44px; height:44px;" aria-hidden="true">${renderGlyph({ seed: i + 1, size: 36, color: iconColor, accent: t.accent })}</span>`
      : `<span ${df(`items.${i}.icon`)} style="font-size:36px; color:${iconColor}; line-height:1; flex-shrink:0; min-width:44px; text-align:center; ${headlineStyle(t)}">${esc(item.icon)}</span>`;
    return `
    <div style="display:flex; align-items:flex-start; gap:16px;">
      ${iconVisual}
      <div style="flex:1;">
        <p ${df(`items.${i}.text`)} style="font-size:16px; color:${t.text}; font-weight:600; margin:0 0 2px;">${escMd(item.text)}</p>
        ${item.sub ? `<p ${df(`items.${i}.sub`)} style="font-size:13px; color:${t.muted}; margin:0;">${escMd(item.sub)}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:28px; line-height:1.15; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; ${isImport ? 'overflow-y:auto;' : ''}">
    <div style="margin:auto 0; display:flex; flex-direction:column; gap:16px;">
      ${itemsHtml}
    </div>
  </div>
</div>`;
}

export function renderTimeline(data: TimelineData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const events = data.events || [];
  const n = events.length;
  const eventsHtml = events.map((ev, i) => `
    <div style="flex:1; display:flex; flex-direction:column; align-items:center; position:relative;">
      <p ${df(`events.${i}.label`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0 0 8px; text-align:center;">${esc(ev.label)}</p>
      <div style="width:14px; height:14px; border-radius:50%; background:${labelColor(i, t)}; flex-shrink:0; position:relative; z-index:1;"></div>
      <p ${df(`events.${i}.title`)} style="font-size:15px; color:${ensureTextContrast(t.text, t.bg)}; font-weight:600; margin:8px 0 2px; text-align:center;">${escMd(ev.title)}</p>
      ${ev.desc ? `<p ${df(`events.${i}.desc`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0; text-align:center;">${escMd(ev.desc)}</p>` : ''}
    </div>`).join('\n');
  // Connector line spans from center of first dot to center of last dot
  const lineLeft = `calc(${100 / (2 * n)}%)`;
  const lineRight = `calc(${100 / (2 * n)}%)`;
  const showConnector = n >= 2;
  // Title stays top-anchored (page chrome consistency); only the timeline rail
  // centers vertically in the space below it. `safe center` degrades to
  // flex-start when bodies overflow, so long paragraphs never get clipped.
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin:0; line-height:1.15; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; flex-direction:column; justify-content:safe center; min-height:0;">
    <div style="display:flex; position:relative; padding:0 ${SAFE_INSET.x / 2}px; ${isImport ? 'overflow-x:auto;' : ''}">
      ${showConnector ? `<div style="position:absolute; top:calc(13px + 7px); left:calc(${lineLeft} + ${SAFE_INSET.x / 2}px); right:calc(${lineRight} + ${SAFE_INSET.x / 2}px); height:2px; background:${t.border};"></div>` : ''}
      ${eventsHtml}
    </div>
  </div>
</div>`;
}

// Slides don't scroll. When a `table` layout's natural row heights overflow
// the available card budget, we shrink the row density (font + padding) rather
// than emitting a scrollbar. Three tiers below; `pickTableDensity` picks the
// most generous tier whose estimated total height fits the budget.
export type TableDensity = 'roomy' | 'compact' | 'tight' | 'xtight';

interface TableDensitySpec {
  headerFontPx: number;
  bodyFontPx: number;
  padY: number;
  padX: number;
}

const TABLE_DENSITY_SPECS: Record<TableDensity, TableDensitySpec> = {
  roomy:   { headerFontPx: 12, bodyFontPx: 14, padY: 10, padX: 14 },
  compact: { headerFontPx: 11, bodyFontPx: 12, padY: 7,  padX: 10 },
  tight:   { headerFontPx: 10, bodyFontPx: 11, padY: 5,  padX: 8  },
  xtight:  { headerFontPx: 9,  bodyFontPx: 10, padY: 3,  padX: 6  },
};

/** Pick the most generous density tier whose estimated table height fits
 *  within `budgetPx`. Falls back to `tight` if even that overflows — caller
 *  should clip with overflow:hidden rather than scroll. */
export function pickTableDensity(
  data: TableData,
  contentWidthPx: number,
  budgetPx: number,
): TableDensity {
  const headers = data.headers || [];
  const rows = data.rows || [];
  const colCount = Math.max(headers.length, rows[0]?.length ?? 1, 1);
  const colWidthPx = Math.max(40, contentWidthPx / colCount);
  const tiers: TableDensity[] = ['roomy', 'compact', 'tight', 'xtight'];
  for (const tier of tiers) {
    const spec = TABLE_DENSITY_SPECS[tier];
    const cellInnerW = Math.max(20, colWidthPx - 2 * spec.padX);
    const headerLines = headers.length === 0
      ? 1
      : Math.max(1, ...headers.map(h => estimateVisualLines(String(h ?? ''), spec.headerFontPx, cellInnerW)));
    const headerH = headerLines * spec.headerFontPx * 1.4 + spec.padY * 2;
    let bodyH = 0;
    for (const row of rows) {
      const cellLines = row.length === 0
        ? 1
        : Math.max(1, ...row.map(c => estimateVisualLines(String(c ?? ''), spec.bodyFontPx, cellInnerW)));
      bodyH += cellLines * spec.bodyFontPx * 1.4 + spec.padY * 2;
    }
    const bordersH = (rows.length + 1) * 1; // 1px hairline per row gap
    if (headerH + bodyH + bordersH <= budgetPx) return tier;
  }
  return 'xtight';
}

/** Render a bare <table> for a TableData — no slide wrapper, no title/footnote.
 *  Used both by `renderTable` (with a wrapper + title + footnote) and by the
 *  Phase 3 `report-page` `table-block` renderer (inline inside a block flow).
 *  `fieldPrefix` lets callers rewrite data-field paths; default empty matches
 *  the legacy table layout paths (`headers.N`, `rows.R.C`).
 *  `density` controls font/padding tier — defaults to `roomy` so report-page
 *  callers behave exactly as before. */
export function renderTableInline(
  data: TableData,
  t: ThemeConfig,
  fieldPrefix = '',
  density: TableDensity = 'roomy',
): string {
  const headers = data.headers || [];
  const rows = data.rows || [];
  const hl = data.highlight;
  const prefix = fieldPrefix ? `${fieldPrefix}.` : '';
  // Scene v2 table conventions — Analyst tables get pale-blue header + zebra
  // alt rows + right-aligned numbers (IB pitch-book style) when `t.table` is
  // populated. Non-scene themes fall through to legacy behavior.
  const tableCfg = t.table;
  const headerBg = tableCfg?.headerBg ?? t.primary;
  const headerText = tableCfg?.headerText ?? contrastTextOnBg(t.primary);
  const accentHeaderBg = tableCfg?.headerBg ? t.accent : t.accent;  // highlight col stays accent-bg
  const stripeBg = tableCfg?.rowStripeBg !== undefined ? tableCfg.rowStripeBg : 'rgba(0,0,0,0.02)';
  const rightAlignNums = tableCfg?.rightAlignNumbers ?? false;
  const isNumeric = (s: string): boolean => {
    if (!s) return false;
    // Treat anything that reads as a number (possibly with %, $, commas, etc.) as numeric.
    return /^\s*[-+]?[$€¥£]?\s*[\d,]+(\.\d+)?\s*[%x×]?\s*$/.test(s);
  };
  const borderHairline = tableCfg?.borderStyle === 'hairline' ? `1px solid ${t.border}` : 'none';
  const radius = tableCfg?.borderStyle === 'hairline' ? 0 : 8;
  const spec = TABLE_DENSITY_SPECS[density];
  const cellPad = `${spec.padY}px ${spec.padX}px`;
  const thCells = headers.map((h, i) => {
    const isHl = hl === i;
    const bg = isHl ? accentHeaderBg : headerBg;
    const text = isHl ? contrastTextOnBg(t.accent) : headerText;
    const align = rightAlignNums && isNumeric(h) ? 'right' : 'left';
    // Table headers are labels: labelStyle() gives uppercase + tracking when theme asks.
    return `<th ${df(`${prefix}headers.${i}`)} style="padding:${cellPad}; font-size:${spec.headerFontPx}px; font-weight:600; text-align:${align}; color:${text}; background:${bg}; border-bottom:${borderHairline}; ${labelStyle(t)}">${escMd(h)}</th>`;
  }).join('');
  const bodyRows = rows.map((row, ri) => {
    const cells = row.map((cell, ci) => {
      const isHl = hl === ci;
      const evenStripe = stripeBg === '' ? 'transparent' : (ri % 2 === 0 ? t.cardBg : stripeBg);
      const bg = isHl ? (ri % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)') : evenStripe;
      const cellIsNumeric = isNumeric(cell);
      const align = rightAlignNums && cellIsNumeric ? 'right' : 'left';
      const borderBottom = tableCfg?.borderStyle === 'hairline' ? `1px solid ${t.border}` : 'none';
      // Numeric cells get fontNumeric + tabular figures so columns align.
      const numCss = cellIsNumeric ? numericStyle(t) : '';
      return `<td ${df(`${prefix}rows.${ri}.${ci}`)} style="padding:${cellPad}; font-size:${spec.bodyFontPx}px; color:${t.text}; background:${bg}; text-align:${align}; border-bottom:${borderBottom}; word-break:break-word; overflow-wrap:break-word; ${numCss}">${escMd(cell)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  // table-layout:auto lets columns size by content — narrow label columns
  // (e.g. "维度") shrink, long data columns get the extra width. Combined
  // with word-break:break-word on cells, this avoids the equal-25%-column
  // trap where short labels waste space and long values wrap 4-6 lines.
  return `<table style="width:100%; border-collapse:collapse; border-radius:${radius}px; overflow:hidden; table-layout:auto;">
      <thead><tr>${thCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
}

export function renderTable(data: TableData, t: ThemeConfig, theme: Theme, tw: number, th: number, isImport = false): string {
  // Compute available height for the table itself (slide height minus paddings,
  // title, optional footnote) and pick a density tier whose estimated row
  // heights fit. Slides never scroll: if even `tight` overflows we let CSS
  // clip silently — same trade-off every other layout makes.
  const titlePx = autoFontSize(data.title, 28, 18);
  const contentWidth = Math.max(120, tw - SAFE_INSET.x * 2);
  const titleLines = data.title ? estimateVisualLines(data.title, titlePx, contentWidth) : 0;
  const titleHeight = titleLines > 0 ? titleLines * titlePx * 1.2 + 20 : 0; // 20 = margin-bottom
  const footnoteHeight = data.footnote
    ? estimateVisualLines(data.footnote, 13, contentWidth) * 13 * 1.5 + 12
    : 0;
  const budget = Math.max(80, th - SAFE_INSET.y * 2 - titleHeight - footnoteHeight - 8);
  const density = pickTableDensity(data, contentWidth, budget);
  // Imported decks keep their scroll affordance (matches baseStyle's isImport
  // branch); generated decks clip with overflow:hidden so no scrollbar appears.
  // `min-height:0` is the canonical flex-child fix that lets the wrapper clip
  // instead of expanding to fit children.
  const overflowStyle = isImport ? 'overflow-y:auto;' : 'overflow:hidden;';
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:20px; line-height:1.15; padding:0.05em 0; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; min-height:0; ${overflowStyle}">
    ${renderTableInline(data, t, '', density)}
  </div>
  ${data.footnote ? `<p ${df('footnote')} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin-top:12px;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ============================================================================
// ============================================================================
// v5 Business / Pitch-Deck Layouts
// ============================================================================

export function renderAgenda(data: AgendaData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 34, 22);
  const wb = IMPORT_WORD_BREAK;
  const items = data.items || [];
  const itemsHtml = items.map((item, i) => {
    const isActive = data.active === i;
    const dotColor = isActive ? t.primary : t.border;
    const textColor = isActive ? t.primary : t.text;
    const weight = isActive ? 'font-weight:600;' : '';
    const subColor = isActive ? t.accent : t.muted;
    return `
    <div style="display:flex; align-items:flex-start; gap:16px; padding:10px 0; ${isActive ? `background:${t.cardBg}; margin:0 -16px; padding:10px 16px; border-radius:8px;` : ''}">
      <div style="width:10px; height:10px; border-radius:50%; background:${dotColor}; margin-top:6px; flex-shrink:0;"></div>
      <div>
        <p ${df(`items.${i}.text`)} style="font-size:18px; color:${textColor}; ${weight} margin:0; ${wb}">${escMd(item.text)}</p>
        ${item.sub ? `<p ${df(`items.${i}.sub`)} style="font-size:14px; color:${subColor}; margin:4px 0 0; ${wb}">${escMd(item.sub)}</p>` : ''}
      </div>
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:48px 60px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:32px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;">
    <div style="margin:auto 0; display:flex; flex-direction:column; gap:4px;">
      ${itemsHtml}
    </div>
  </div>
</div>`;
}

function renderTeam(data: TeamData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 34, 22);
  const wb = IMPORT_WORD_BREAK;
  const members = data.members || [];
  const cols = members.length <= 3 ? members.length : members.length <= 4 ? 2 : 3;
  const membersHtml = members.map((m, i) => {
    const initial = (m.avatar && m.avatar.length <= 2) ? m.avatar : (m.name ? m.name[0].toUpperCase() : '?');
    const hasImageUrl = m.avatar && (m.avatar.startsWith('http') || m.avatar.startsWith('data:'));
    const avatarInner = hasImageUrl
      ? `<div style="width:64px; height:64px; border-radius:50%; background-image:url('${m.avatar}'); background-size:cover; background-position:center;"></div>`
      : `<div style="width:64px; height:64px; border-radius:50%; background:${labelColor(i, t)}; display:flex; align-items:center; justify-content:center;">
          <span style="font-size:24px; color:${contrastTextOnBg(labelColor(i, t))}; ${headlineStyle(t)}">${esc(initial)}</span>
        </div>`;
    return `
    <div style="display:flex; flex-direction:column; align-items:center; gap:8px; padding:16px;">
      ${avatarInner}
      <p ${df(`members.${i}.name`)} style="font-size:16px; color:${ensureTextContrast(t.text, t.bg)}; font-weight:600; margin:0; text-align:center; ${wb}">${esc(m.name)}</p>
      <p ${df(`members.${i}.role`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0; text-align:center; ${wb}">${escMd(m.role)}</p>
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:28px; text-align:center; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:16px; flex:1; min-height:0; min-width:0; overflow:hidden; align-content:center;">
    ${membersHtml}
  </div>
</div>`;
}

function renderLogoWall(data: LogoWallData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 30, 20);
  const wb = IMPORT_WORD_BREAK;
  const logos = data.logos || [];
  const cols = logos.length <= 4 ? 2 : logos.length <= 6 ? 3 : 4;
  const logosHtml = logos.map((logo, i) => {
    const hasImage = logo.image_url && (logo.image_url.startsWith('http') || logo.image_url.startsWith('data:'));
    const inner = hasImage
      ? `<img src="${logo.image_url}" alt="${esc(logo.name)}" style="max-width:100%; max-height:48px; object-fit:contain;" />`
      : `<span ${df(`logos.${i}.name`)} style="font-size:16px; color:${ensureTextContrast(t.text, t.cardBg)}; font-weight:600; ${wb}">${esc(logo.name)}</span>`;
    return `
    <div style="background:${t.cardBg}; border-radius:${t.radiusCard ?? 10}px; padding:20px; display:flex; align-items:center; justify-content:center; box-shadow:${t.cardSurface ?? t.cardShadow}; min-height:72px;">
      ${inner}
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:8px; text-align:center; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  ${data.subtitle ? `<p ${df('subtitle')} style="font-size:16px; color:${ensureTextContrast(t.muted, t.bg)}; text-align:center; margin-bottom:24px; ${wb}">${escMd(data.subtitle)}</p>` : '<div style="margin-bottom:24px;"></div>'}
  <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:14px; flex:1; min-height:0; min-width:0; overflow:hidden; align-content:center;">
    ${logosHtml}
  </div>
</div>`;
}

function renderPricing(data: PricingData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 30, 20);
  const wb = IMPORT_WORD_BREAK;
  const tiers = data.tiers || [];
  const radius = t.radiusCard ?? 12;
  const tiersHtml = tiers.map((tier, i) => {
    const border = tier.highlight ? `border:2px solid ${t.primary};` : `border:1px solid ${t.border};`;
    const badge = tier.highlight ? `<div style="position:absolute; top:-1px; left:50%; transform:translateX(-50%); background:${t.primary}; color:${contrastTextOnBg(t.primary)}; font-size:11px; padding:2px 12px; border-radius:0 0 6px 6px; font-weight:600;">推荐</div>` : '';
    const featuresHtml = (tier.features || []).map((f, fi) =>
      `<p ${df(`tiers.${i}.features.${fi}`)} style="font-size:13px; color:${ensureTextContrast(t.text, t.cardBg)}; margin:0; padding:6px 0; border-bottom:1px solid ${t.border}; ${wb}">${escMd(f)}</p>`
    ).join('');
    return `
    <div style="flex:1; position:relative; background:${t.cardBg}; border-radius:${radius}px; ${border} padding:24px 16px; display:flex; flex-direction:column; box-shadow:${t.cardSurface ?? t.cardShadow};">
      ${badge}
      <p ${df(`tiers.${i}.name`)} style="font-size:15px; color:${ensureTextContrast(t.muted, t.cardBg)}; text-align:center; margin:8px 0 4px; font-weight:500; ${wb}">${esc(tier.name)}</p>
      <p ${df(`tiers.${i}.price`)} style="font-size:32px; color:${ensureTextContrast(t.primary, t.cardBg)}; text-align:center; margin:0; ${headlineStyle(t, { isDisplay: true })}">${esc(tier.price)}</p>
      ${tier.period ? `<p ${df(`tiers.${i}.period`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.cardBg)}; text-align:center; margin:0 0 16px;">${esc(tier.period)}</p>` : '<div style="margin-bottom:16px;"></div>'}
      <div style="flex:1;">${featuresHtml}</div>
      ${tier.cta ? `<p ${df(`tiers.${i}.cta`)} style="font-size:14px; color:${tier.highlight ? '#fff' : ensureTextContrast(t.primary, t.cardBg)}; text-align:center; margin:16px 0 0; padding:8px; background:${tier.highlight ? t.primary : 'transparent'}; border-radius:6px; font-weight:500; ${wb}">${escMd(tier.cta)}</p>` : ''}
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:24px; text-align:center; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="display:flex; gap:16px; flex:1; min-height:0; align-items:stretch;">
    ${tiersHtml}
  </div>
  ${data.footnote ? `<p ${df('footnote')} style="font-size:12px; color:${ensureTextContrast(t.muted, t.bg)}; text-align:center; margin-top:12px;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

function renderDeviceMockup(data: DeviceMockupData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const wb = IMPORT_WORD_BREAK;
  const isPhone = data.device === 'phone';
  const frameW = isPhone ? 200 : 480;
  const frameH = isPhone ? 400 : 300;
  const radius = isPhone ? 28 : 12;
  const bezel = isPhone ? 8 : 6;

  const hasImage = !!data.image_url;
  const screenContent = hasImage
    ? `<div style="width:100%; height:100%; background-image:url('${data.image_url}'); background-size:cover; background-position:center top;"></div>`
    : `<div style="width:100%; height:100%; background:${t.cardBg}; display:flex; align-items:center; justify-content:center;">
        <span style="font-size:40px; color:${t.muted};">${isPhone ? '\uD83D\uDCF1' : '\uD83D\uDCBB'}</span>
      </div>`;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${data.title ? `<h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:8px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
  ${data.subtitle ? `<p ${df('subtitle')} style="font-size:16px; color:${ensureTextContrast(t.muted, t.bg)}; margin-bottom:20px; ${wb}">${escMd(data.subtitle)}</p>` : ''}
  <div style="width:${frameW}px; height:${frameH}px; background:${t.dark}; border-radius:${radius}px; padding:${bezel}px; box-shadow:0 8px 32px rgba(0,0,0,0.18); position:relative;">
    ${isPhone ? `<div style="position:absolute; top:${bezel + 6}px; left:50%; transform:translateX(-50%); width:60px; height:5px; background:${t.muted}; border-radius:3px; opacity:0.5; z-index:1;"></div>` : `<div style="position:absolute; top:0; left:0; right:0; height:${bezel + 16}px; background:${t.dark}; border-radius:${radius}px ${radius}px 0 0; display:flex; align-items:center; padding-left:12px; gap:5px;"><span style="width:8px; height:8px; border-radius:50%; background:#ff5f57;"></span><span style="width:8px; height:8px; border-radius:50%; background:#ffbd2e;"></span><span style="width:8px; height:8px; border-radius:50%; background:#28c840;"></span></div>`}
    <div style="width:100%; height:100%; border-radius:${radius - bezel}px; overflow:hidden; ${isPhone ? '' : `margin-top:${16}px;`}">
      ${screenContent}
    </div>
  </div>
</div>`;
}

function renderSectionBreak(data: SectionBreakData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 48, 28);
  const wb = IMPORT_WORD_BREAK;
  // Drop data.number when the title already carries a chapter marker
  // ("一、/二、..." in CN, "Chapter N / Part N / Section N" in EN). The LLM
  // sometimes fills number with the deck page index, which duplicates the
  // report page folio and visually echoes the wrong count.
  const rawNumber = (data.number ?? '').trim();
  const titleStr = (data.title ?? '').trim();
  const titleHasChapterMarker =
    /^[一二三四五六七八九十百千]+[、．.\s]/.test(titleStr) ||
    /^(chapter|part|section|ch\.?|§)\s*[\dIVX]+/i.test(titleStr);
  const showNumber = rawNumber && !titleHasChapterMarker;
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; ${baseStyle(t, isImport)} background:${t.primary};">
  ${(() => { const ct = contrastTextOnBg(t.primary); const isDark = ct === '#fff'; return `
  ${showNumber ? `<p ${df('number')} style="font-size:64px; color:${isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.15)'}; margin-bottom:8px; ${headlineStyle(t, { isDisplay: true })}">${esc(rawNumber)}</p>` : ''}
  <h1 ${df('title')} style="font-size:${titlePx}px; line-height:1.15; padding:0.05em 0; color:${ct}; text-align:center; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
  ${data.subtitle ? `<p ${df('subtitle')} style="font-size:20px; color:${isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.55)'}; margin-top:16px; text-align:center; ${wb}">${escMd(data.subtitle)}</p>` : ''}
  `; })()}
</div>`;
}

function renderClosing(data: ClosingData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const titlePx = autoFontSize(data.title, 72, 40);
  const wb = IMPORT_WORD_BREAK;
  const bylineColor = ensureTextContrast(t.muted, t.bg);
  const titleColor = ensureTextContrast(t.primary, t.bg);
  const bylineParts: string[] = [];
  if (data.signature) bylineParts.push(`<span ${df('signature')}>${escMd(data.signature)}</span>`);
  if (data.role) bylineParts.push(`<span ${df('role')}>${escMd(data.role)}</span>`);
  const bylineHtml = bylineParts.length
    ? `<p style="font-size:14px; color:${bylineColor}; margin:0; text-align:center; letter-spacing:0.04em; ${wb}">${bylineParts.join('<span style="margin:0 10px; opacity:0.4;">·</span>')}</p>`
    : '';
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; ${baseStyle(t, isImport)}">
  <h1 ${df('title')} style="font-size:${titlePx}px; line-height:1.15; padding:0.05em 0; color:${titleColor}; text-align:center; margin:0; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
  ${data.subtitle ? `<p ${df('subtitle')} style="font-size:22px; color:${ensureTextContrast(t.text, t.bg)}; margin:0; text-align:center; max-width:76%; line-height:1.5; ${wb}">${escMd(data.subtitle)}</p>` : ''}
  ${bylineHtml ? `<div style="margin-top:28px;">${bylineHtml}</div>` : ''}
</div>`;
}

function renderStatRow(data: StatRowData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const wb = IMPORT_WORD_BREAK;
  const stats = data.stats || [];
  const statsHtml = stats.map((s, i) => {
    const changeColor = s.change && s.change.includes('-') ? '#e74c3c' : t.green;
    // autoFontSize: long values like "RMB13.04bn" or "$2.5M" overflow a narrow
    // card column at fixed 42px. Shrink based on character length, with the
    // floor still readable as a stat headline (22px).
    const valuePx = autoFontSize(s.value, 42, 22);
    const trendHtml = s.trend && s.trend.length >= 2
      ? `<div style="margin:6px auto 0; display:flex; justify-content:center;">${renderSparkline(s.trend, 60, 20, t.primary, t.cardBg)}</div>`
      : '';
    const donutHtml = s.donut != null
      ? `<div style="margin:6px auto 0; display:flex; justify-content:center;">${renderMiniDonut(s.donut, 14, t.primary, t.border)}</div>`
      : '';
    return `
    <div style="flex:1; min-width:0; text-align:center; padding:16px; ${i < stats.length - 1 ? `border-right:1px solid ${t.border};` : ''}">
      <p ${df(`stats.${i}.value`)} style="font-size:${valuePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin:0 0 4px; font-weight:${t.headlineWeight ?? 700}; letter-spacing:${t.headlineTracking ?? '-1px'}; word-break:break-all; ${numericStyle(t)}">${esc(s.value)}</p>
      <p ${df(`stats.${i}.label`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0; ${wb} ${labelStyle(t)}">${escMd(s.label)}</p>
      ${s.change ? `<p ${df(`stats.${i}.change`)} style="font-size:13px; color:${changeColor}; margin:6px 0 0; font-weight:500; ${numericStyle(t)}">${esc(s.change)}</p>` : ''}
      ${trendHtml}${donutHtml}
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${data.title ? `<h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:24px; text-align:center; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
  <div style="display:flex; flex:1; min-height:0; overflow:hidden; align-items:center;">
    ${statsHtml}
  </div>
  ${data.footnote ? `<p ${df('footnote')} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; text-align:center; margin-top:16px;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ============================================================================
// v6 Compound layouts — complex screen divisions
// ============================================================================

function renderFeaturedGrid(data: FeaturedGridData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const rawTiles = data.tiles || [];
  // Drop empty-shell tiles (no title/desc/image/chart) to prevent orphan
  // badge pills with blank-card backgrounds.
  const tiles = rawTiles.filter(x => {
    if (!x) return false;
    const hasText = (x.title && x.title.trim()) || (x.desc && x.desc.trim());
    const hasMedia = x.image_url || x.chart;
    return hasText || hasMedia;
  });
  const cols = data.columns || Math.min(tiles.length, 4) || 3;
  const titlePx = autoFontSize(data.title, 36, 22);
  const wb = IMPORT_WORD_BREAK;
  const radius = t.radiusCard ?? 12;
  const cardSurface = t.cardSurface ?? t.cardShadow;

  // Phase 7.3: budget-aware hero sizing. Hero zone takes natural height
  // (flex:0 0 auto), so if title + subtitle + body are all dense it can
  // eat into the tile grid. Keep subtitle fixed (usually short), scale the
  // body font down with the budget helper when body is long.
  const HERO_BUDGET_PX = 160;           // ≈ 30% of 540px canvas
  const HERO_INNER_WIDTH = 850;         // 960 - 2 × SAFE_INSET.x (56)
  const bodyFit = data.body
    ? fitToBudget({
        fixed: [
          { text: data.title, fontSize: titlePx, lineHeight: 1.2, marginBottom: 8, fixedLines: 1 },
          ...(data.subtitle ? [{ text: data.subtitle, fontSize: 18, lineHeight: 1.4, marginBottom: 4 }] : []),
        ],
        body: [{ text: data.body, fontSize: 15, lineHeight: 1.6, marginTop: 8 }],
        containerWidthPx: HERO_INNER_WIDTH,
        budgetPx: HERO_BUDGET_PX,
        maxBodyPx: 15,
        minBodyPx: 12,
      })
    : null;
  const bodyPx = bodyFit?.bodyFontSize ?? 15;

  const tilesHtml = tiles.map((tile, i) => {
    const color = labelColor(i, t);
    const hasImg = !!tile.image_url;
    const hasChart = !!tile.chart;
    const chartHtml = hasChart ? `<div style="margin-bottom:8px; overflow:hidden; border-radius:${Math.max(radius - 4, 4)}px;">${renderChartEmbed(tile.chart!, t, theme, 200, 100)}</div>` : '';
    return `
    <div style="background:${t.cardBg}; border-radius:${radius}px; ${hasImg ? 'padding:0;' : 'padding:16px 16px;'} display:flex; flex-direction:column; ${hasImg ? 'align-items:stretch;' : 'align-items:center; text-align:center;'} box-shadow:${cardSurface}; ${!hasImg && !hasChart ? `border-top:3px solid ${color};` : ''} overflow:hidden;">
      ${hasChart ? chartHtml : cardImage(tile.image_url, 0, '110px')}
      <div style="${hasImg ? 'padding:12px 16px;' : ''}">
        ${badgePill(tile.badge, t, `tiles.${i}.badge`)}
        ${tile.icon && !hasImg && !hasChart
          ? (containsEmoji(tile.icon)
              ? `<span ${df(`tiles.${i}.icon`)} style="display:inline-flex; align-items:center; justify-content:center; margin-bottom:6px;" aria-hidden="true">${renderGlyph({ seed: i + 1, size: 28, color, accent: t.accent })}</span>`
              : `<span ${df(`tiles.${i}.icon`)} style="font-size:28px; color:${color}; margin-bottom:6px;">${esc(tile.icon)}</span>`)
          : ''}
        <p ${df(`tiles.${i}.title`)} style="font-size:15px; color:${t.text}; font-weight:600; margin:0; ${wb} ${clampLines(2)}">${escMd(tile.title)}</p>
        ${tile.desc ? `<p ${df(`tiles.${i}.desc`)} style="font-size:12px; color:${t.muted}; margin-top:4px; line-height:1.5; ${wb} ${clampLines(2)}">${escMd(tile.desc)}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <div style="flex:0 0 auto; display:flex; flex-direction:column; justify-content:center; overflow:hidden; padding-bottom:16px;">
    <h2 ${df('title')} style="font-size:${titlePx}px; line-height:1.15; padding:0.05em 0; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:8px; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h2>
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:18px; color:${ensureTextContrast(t.text, t.bg)}; margin-bottom:4px; ${wb}">${escMd(data.subtitle)}</p>` : ''}
    ${data.body ? `<p ${df('body')} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.muted, t.bg)}; line-height:1.6; margin-top:8px; ${wb} ${clampLines(3)}">${nl2brMd(data.body)}</p>` : ''}
  </div>
  <div style="width:100%; height:1px; background:${t.border}; margin-bottom:12px;"></div>
  <div style="flex:1; min-height:0; min-width:0; display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:16px; align-content:start;">
    ${tilesHtml}
  </div>
</div>`;
}

function renderBento(data: BentoData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const rawItems = data.items || [];
  // Drop empty-shell tiles (badge-only, no heading/body/image/chart). Without
  // this, LLM hallucinations leave orphan "DATA" pills floating in blank
  // cards — visually matches the image-7 LLM hallucination case.
  const items = rawItems.filter(it => {
    if (!it) return false;
    const hasText = (it.heading && it.heading.trim()) || (it.body && it.body.trim());
    const hasMedia = it.image_url || it.chart;
    return hasText || hasMedia;
  });
  const n = Math.min(items.length, 6) || 3;
  const wb = IMPORT_WORD_BREAK;
  const radius = t.radiusCard ?? 12;
  const cardSurface = t.cardSurface ?? t.cardShadow;

  // Find highlighted item (first with highlight:true, or index 0)
  const hiIdx = items.findIndex(it => it.highlight) >= 0 ? items.findIndex(it => it.highlight) : 0;

  // Grid template areas based on item count
  let areas: string;
  let gridCols: string;
  let gridRows: string;
  // NOTE: grid-template-areas uses single-quoted CSS strings so the value
  // stays inside the outer style="..." attribute. Double-quoted strings
  // would prematurely close the attribute and silently drop the grid.
  if (n <= 3) {
    // 1 large left + 2 small right stacked
    areas = `'a b' 'a c'`;
    gridCols = '1.6fr 1fr';
    gridRows = '1fr 1fr';
  } else if (n === 4) {
    // 1 large left + 2 small right + 1 full bottom
    areas = `'a b' 'a c' 'd d'`;
    gridCols = '1.6fr 1fr';
    gridRows = '1fr 1fr 0.8fr';
  } else if (n === 5) {
    // 1 large left + 2 small right + 2 bottom
    areas = `'a b' 'a c' 'd e'`;
    gridCols = '1.6fr 1fr';
    gridRows = '1fr 1fr 0.8fr';
  } else {
    // 6: uniform 2×3 grid
    areas = `'a b c' 'd e f'`;
    gridCols = '1fr 1fr 1fr';
    gridRows = '1fr 1fr';
  }

  const areaNames = ['a', 'b', 'c', 'd', 'e', 'f'];
  // Reorder: put highlighted item first (area 'a'), rest fill remaining areas
  const ordered = [hiIdx, ...items.map((_, i) => i).filter(i => i !== hiIdx)].slice(0, n);

  const tilesHtml = ordered.map((origIdx, areaIdx) => {
    const item = items[origIdx];
    if (!item) return '';
    const areaName = areaNames[areaIdx];
    const isLarge = areaIdx === 0 && n < 6;
    const color = labelColor(origIdx, t);
    const headingPx = isLarge ? 24 : 16;
    const bodyPx = isLarge ? 15 : 13;
    const hasImg = !!item.image_url;
    const hasChart = !!item.chart;
    const chartW = isLarge ? 340 : 180;
    const chartH = isLarge ? 200 : 100;
    const chartHtml = hasChart ? `<div style="overflow:hidden; border-radius:${Math.max(radius - 4, 4)}px; ${isLarge ? 'flex:1; min-height:0;' : 'margin-bottom:8px;'}">${renderChartEmbed(item.chart!, t, theme, chartW, chartH)}</div>` : '';
    // Image tiles: image fills the tile background, text at bottom
    if (hasImg && isLarge) {
      return `
      <div style="grid-area:${areaName}; border-radius:${radius}px; overflow:hidden; box-shadow:${cardSurface}; position:relative; display:flex; flex-direction:column; justify-content:flex-end; background:url('${item.image_url}') center/cover no-repeat;">
        <div style="padding:24px; background:linear-gradient(transparent, rgba(0,0,0,0.6));">
          ${badgePill(item.badge, t, `items.${origIdx}.badge`)}
          <p ${df(`items.${origIdx}.heading`)} style="font-size:${headingPx}px; color:#fff; font-weight:600; margin:0; line-height:1.3; ${wb} ${headlineStyle(t)}">${escMd(item.heading)}</p>
          ${item.body ? `<p ${df(`items.${origIdx}.body`)} style="font-size:${bodyPx}px; color:rgba(255,255,255,0.8); margin-top:6px; line-height:1.4; ${wb} ${clampLines(3)}">${escMd(item.body)}</p>` : ''}
        </div>
      </div>`;
    }
    return `
    <div style="grid-area:${areaName}; background:${t.cardBg}; border-radius:${radius}px; ${hasImg ? 'padding:0;' : `padding:${isLarge ? '28px 24px' : '20px 16px'};`} display:flex; flex-direction:column; ${isLarge ? 'justify-content:center;' : ''} box-shadow:${cardSurface}; overflow:hidden;">
      ${hasChart ? chartHtml : cardImage(item.image_url, 0, '80px')}
      <div style="${hasImg ? 'padding:8px 14px 14px;' : ''}">
        ${badgePill(item.badge, t, `items.${origIdx}.badge`)}
        ${item.icon && !hasImg && !hasChart
          ? (containsEmoji(item.icon)
              ? `<span ${df(`items.${origIdx}.icon`)} style="display:inline-flex; align-items:center; justify-content:center; margin-bottom:${isLarge ? 12 : 6}px;" aria-hidden="true">${renderGlyph({ seed: origIdx + 1, size: isLarge ? 36 : 24, color, accent: t.accent })}</span>`
              : `<span ${df(`items.${origIdx}.icon`)} style="font-size:${isLarge ? 36 : 24}px; color:${color}; margin-bottom:${isLarge ? 12 : 6}px;">${esc(item.icon)}</span>`)
          : ''}
        <p ${df(`items.${origIdx}.heading`)} style="font-size:${headingPx}px; color:${ensureTextContrast(t.text, t.cardBg)}; font-weight:600; margin:0; line-height:1.3; ${wb} ${isLarge ? headlineStyle(t) : ''} ${clampLines(isLarge ? 3 : 2)}">${escMd(item.heading)}</p>
        ${item.body ? `<p ${df(`items.${origIdx}.body`)} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:8px; line-height:1.5; ${wb} ${clampLines(isLarge ? 5 : 3)}">${escMd(item.body)}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${data.title ? `<h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:20px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
  <div style="flex:1; min-height:0; min-width:0; display:grid; grid-template-areas:${areas}; grid-template-columns:${gridCols}; grid-template-rows:${gridRows}; gap:14px;">
    ${tilesHtml}
  </div>
</div>`;
}

function renderDashboard(data: DashboardData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const metrics = data.metrics || [];
  const cols = data.columns || (metrics.length <= 4 ? 2 : 3);
  const wb = IMPORT_WORD_BREAK;
  const radius = t.radiusCard ?? 12;
  const cardSurface = t.cardSurface ?? t.cardShadow;

  const tilesHtml = metrics.map((m, i) => {
    const changeColor = m.change && m.change.includes('-') ? '#e74c3c' : t.green;
    const trendHtml = m.trend && m.trend.length >= 2
      ? `<div style="margin-top:8px;">${renderSparkline(m.trend, 80, 24, t.primary, t.cardBg)}</div>`
      : '';
    const donutHtml = m.donut != null
      ? `<div style="margin-top:8px;">${renderMiniDonut(m.donut, 18, t.primary, t.border)}</div>`
      : '';
    return `
    <div style="background:${t.cardBg}; border-radius:${radius}px; padding:${CARD_INSET.y}px ${CARD_INSET.x}px; box-shadow:${cardSurface}; display:flex; flex-direction:column;">
      <p ${df(`metrics.${i}.value`)} style="font-size:32px; color:${ensureTextContrast(t.primary, t.cardBg)}; margin:0; font-weight:${t.headlineWeight ?? 700}; letter-spacing:${t.headlineTracking ?? '-1px'}; ${numericStyle(t)}">${esc(m.value)}</p>
      <p ${df(`metrics.${i}.label`)} style="font-size:11px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin:4px 0 0; ${wb} ${labelStyle(t)}">${escMd(m.label)}</p>
      ${m.change ? `<p ${df(`metrics.${i}.change`)} style="font-size:12px; color:${changeColor}; margin:4px 0 0; font-weight:600; ${numericStyle(t)}">${esc(m.change)}</p>` : ''}
      ${trendHtml}${donutHtml}
    </div>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${data.title ? `<h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:20px; line-height:1.15; padding:0.05em 0; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
  <div style="flex:1; min-height:0; min-width:0; display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:16px; align-content:center;">
    ${tilesHtml}
  </div>
</div>`;
}

function renderTitleBento(data: TitleBentoData, t: ThemeConfig, theme: Theme, _tw: number, _th: number, isImport = false): string {
  const cards = data.cards || [];
  const titlePx = autoFontSize(data.title, 44, 28);
  const wb = IMPORT_WORD_BREAK;
  const radius = t.radiusCard ?? 12;
  const cardSurface = t.cardSurface ?? t.cardShadow;
  const n = cards.length;

  // Phase 7.3: budget-aware footer sizing. Left title column is fixed 40%
  // of canvas width. Title already uses autoFontSize (44→28) for adaptive
  // headline. Footer (margin-top:auto, 14px fixed) can spill off the bottom
  // if long — scale it down with the budget helper when the title column
  // can't absorb it all at 14px.
  const TITLE_COL_WIDTH = Math.floor((960 - 2 * 56) * 0.4) - 32;  // 40% minus padding-right
  const TITLE_COL_BUDGET = 540 - 2 * 40 - 40;                    // canvas - SAFE_INSET×2 - reserve
  const footerFit = data.footer
    ? fitToBudget({
        fixed: [
          ...(data.label ? [{ text: data.label, fontSize: 13, lineHeight: 1.4, marginBottom: 12 }] : []),
          { text: data.title, fontSize: titlePx, lineHeight: 1.15, marginBottom: 0 },
        ],
        body: [{ text: data.footer, fontSize: 14, lineHeight: 1.6, marginTop: 16 }],
        containerWidthPx: TITLE_COL_WIDTH,
        budgetPx: TITLE_COL_BUDGET,
        maxBodyPx: 14,
        minBodyPx: 11,
      })
    : null;
  const footerPx = footerFit?.bodyFontSize ?? 14;

  // Auto grid: 2×2 offset for 3-4, 2-col for 2, 3-col for 5-6
  let gridCols: string;
  let gridRows: string;
  if (n <= 2) {
    gridCols = '1fr';
    gridRows = '1fr 1fr';
  } else if (n <= 4) {
    gridCols = '1fr 1fr';
    gridRows = n <= 2 ? '1fr' : '1fr 1fr';
  } else {
    gridCols = '1fr 1fr 1fr';
    gridRows = '1fr 1fr';
  }

  const cardsHtml = cards.map((card, i) => {
    const hasImg = !!card.image_url;
    const hasChart = !!card.chart;
    const chartHtml = hasChart ? `<div style="margin-bottom:8px; overflow:hidden; border-radius:${Math.max(radius - 4, 4)}px;">${renderChartEmbed(card.chart!, t, theme, 180, 100)}</div>` : '';
    return `
    <div style="background:${t.cardBg}; border-radius:${radius}px; ${hasImg ? 'padding:0;' : `padding:${CARD_INSET.y}px ${CARD_INSET.x}px;`} box-shadow:${cardSurface}; overflow:hidden; display:flex; flex-direction:column;">
      ${hasChart ? chartHtml : cardImage(card.image_url, 0, '80px')}
      <div style="${hasImg ? 'padding:10px 16px 16px;' : ''} flex:1;">
        ${badgePill(card.badge, t, `cards.${i}.badge`)}
        <p ${df(`cards.${i}.heading`)} style="font-size:16px; color:${ensureTextContrast(t.text, t.cardBg)}; font-weight:600; margin:0; line-height:1.3; ${wb} ${clampLines(2)}">${escMd(card.heading)}</p>
        ${card.body ? `<p ${df(`cards.${i}.body`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:6px; line-height:1.5; ${wb} ${clampLines(3)}">${escMd(card.body)}</p>` : ''}
      </div>
    </div>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  <div style="flex:0 0 40%; display:flex; flex-direction:column; justify-content:center; padding-right:32px;">
    ${data.label ? `<p ${df('label')} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin-bottom:12px; font-weight:500; ${wb}">${escMd(data.label)}</p>` : ''}
    <h2 ${df('title')} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.bg)}; line-height:1.15; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h2>
    ${data.footer ? `<p ${df('footer')} style="font-size:${footerPx}px; color:${ensureTextContrast(t.muted, t.bg)}; margin-top:auto; line-height:1.6; ${wb}">${nl2brMd(data.footer)}</p>` : ''}
  </div>
  <div style="flex:1; min-height:0; min-width:0; display:grid; grid-template-columns:${gridCols}; grid-template-rows:${gridRows}; gap:14px; align-content:center;">
    ${cardsHtml}
  </div>
</div>`;
}

// ============================================================================
// Report layouts (v2.4) — vertical letter/a4 format.
// Typography is calibrated for 612px-wide canvas (not the 960px slide).
// Each layout is deliberately simple: reports are mostly text, so the
// complexity is in the structural pattern (offset column, section heading,
// pull quote) rather than visual variety.
// ============================================================================

/** Render body text as <p> elements, splitting on blank lines (\n\n).
 *
 *  For bilingual-report preset: detect trailing `[信源：...]` (fullwidth or ASCII
 *  colon) or `[Source: ...]` marker, split into body + muted citation line
 *  wrapped in `.citation-keep` so CSS `break-inside: avoid` binds them together.
 *  The extra DOM nodes are invisible without `.preset-bilingual-report` scoping,
 *  so this is preset-agnostic at the renderer level. */
export const CITATION_RE = /\[(?:信源[：:]|Source:\s*)([^\]]+)\]\s*$/;

export function renderParagraphs(body: string, fieldPath: string, t: ThemeConfig, fontSize = 15): string {
  const paragraphs = body.split(/\n\s*\n/).filter(p => p.trim());
  return paragraphs.map((p, i) => {
    const trimmed = p.trim();
    const match = trimmed.match(CITATION_RE);
    if (match) {
      const bodyPart = trimmed.slice(0, match.index).trim();
      const citation = match[1].trim();
      return `
    <div class="citation-keep" ${df(`${fieldPath}.${i}`)}>
      <p class="body" style="font-size:${fontSize}px; color:${t.text}; line-height:1.75; margin:0 0 2px; text-align:justify;">${nl2brMd(bodyPart)}</p>
      <p class="citation" style="font-size:${Math.max(11, fontSize - 3)}px; color:${t.muted}; line-height:1.5; margin:0 0 14px;">${esc(citation)}</p>
    </div>
  `;
    }
    return `
    <p ${df(`${fieldPath}.${i}`)} style="font-size:${fontSize}px; color:${t.text}; line-height:1.75; margin:0 0 14px; text-align:justify;">${nl2brMd(trimmed)}</p>
  `;
  }).join('');
}

// ── Report cover — 6 variants ──────────────────────────────────────────────
// 3 generic: editorial / masthead / index (shared across regular themes).
// 3 bespoke: paper / memo / field — each tailored to one analysis-* theme
// so the premium analysis signatures each get a distinct opening page.
// Template-driven, no LLM. Each variant consumes ReportCoverData + optional
// derived fields (sectionCount / readingMinutes) and renders a distinct
// editorial layout. Variant is chosen by theme personality via
// `defaultVariantForTheme` unless the deck overrides with `coverVariant`.
// Deliberately no SVG motifs / line art / scene panels on the cover — past
// experiments (mist bowtie etc.) all produced focal knots that fought the
// title. Typographic composition + derived metadata does the heavy lifting.

type CoverVariant = 'editorial' | 'masthead' | 'index' | 'paper' | 'memo' | 'field';

function defaultVariantForTheme(theme: Theme): CoverVariant {
  switch (theme) {
    // Analysis-* premium themes each get a bespoke cover — don't fall through
    // to the generic variants.
    case 'analysis-paper': return 'paper';
    case 'analysis-memo':  return 'memo';
    case 'analysis-field': return 'field';
    // Dark-bg themes with vivid primary → inverted band reads strong
    case 'dark':
    case 'linear':
    case 'ferrari':
    case 'analyst-dark':
      return 'masthead';
    // Light-bg + distinctive accent → asymmetric rail feels like the
    // opening page of a printed analyst report
    case 'stripe':
    case 'notion':
    case 'apple':
    case 'vercel':
    case 'analyst-light':
      return 'index';
    default:
      return 'editorial';
  }
}

function renderReportCoverMeta(data: ReportCoverData, t: ThemeConfig): string {
  // Compact "X MIN READ · Y SECTIONS · AUTHOR · DATE" strip. Separators are
  // a muted middot; each chip is omitted individually so empty data degrades
  // cleanly. Uses tracked small-caps for editorial tone.
  const chips: string[] = [];
  if (data.readingMinutes) chips.push(`${data.readingMinutes} min read`);
  if (data.sectionCount) chips.push(`${data.sectionCount} ${data.sectionCount === 1 ? 'section' : 'sections'}`);
  if (data.author) chips.push(`<span ${df('author')}>${esc(data.author)}</span>`);
  if (data.date) chips.push(`<span ${df('date')}>${esc(data.date)}</span>`);
  if (chips.length === 0) return '';
  const sep = `<span style="color:${t.muted}; opacity:0.6; margin:0 10px;">·</span>`;
  return `<div style="font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600;">${chips.join(sep)}</div>`;
}

function renderReportCoverEditorial(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  // Polished version of the original "Minimal Editorial" recipe:
  //   ─ brand eyebrow + 4px accent bar (was 1.5px — too timid to read)
  //   ─ display title at 64px dropped ~30% down
  //   ─ subtitle under title at 20px, tighter max-width
  //   ─ bottom meta strip with reading time · sections · author · date
  const meta = renderReportCoverMeta(data, t);
  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="editorial" style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:72px 80px 64px;">
  <div style="font-size:10.5px; letter-spacing:0.24em; text-transform:uppercase; color:${t.primary}; font-weight:600;">
    § Lasca · Report
  </div>
  <div style="width:64px; height:4px; background:${t.primary}; margin-top:16px; border-radius:2px;"></div>
  <div style="margin-top:30%; display:flex; flex-direction:column; gap:22px;">
    <h1 ${df('title')} style="font-size:64px; color:${t.primary}; margin:0; line-height:1.05; letter-spacing:-0.01em; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:20px; color:${t.text}; margin:0; line-height:1.5; max-width:78%; opacity:0.82;">${escMd(data.subtitle)}</p>` : ''}
  </div>
  <div style="margin-top:auto; padding-top:56px; display:flex; flex-direction:column; gap:14px;">
    <div style="width:100%; height:1px; background:${t.muted}; opacity:0.25;"></div>
    ${meta}
  </div>
</div>`;
}

function renderReportCoverMasthead(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  // Top ~32% is a solid t.primary band with inverted white brand wordmark
  // + right-aligned author/date column. Bottom ~68% is base bg with title
  // in primary, subtitle + metadata line.
  const author = data.author ? esc(data.author) : '';
  const date = data.date ? esc(data.date) : '';
  const bandMeta = (author || date) ? `
    <div style="text-align:right; display:flex; flex-direction:column; gap:4px;">
      ${author ? `<p ${df('author')} style="font-size:10.5px; color:rgba(255,255,255,0.88); margin:0; letter-spacing:0.2em; text-transform:uppercase; font-weight:600;">${author}</p>` : ''}
      ${date ? `<p ${df('date')} style="font-size:10.5px; color:rgba(255,255,255,0.68); margin:0; letter-spacing:0.16em;">${date}</p>` : ''}
    </div>` : '';
  const bottomMeta: string[] = [];
  if (data.readingMinutes) bottomMeta.push(`${data.readingMinutes} min read`);
  if (data.sectionCount) bottomMeta.push(`${data.sectionCount} ${data.sectionCount === 1 ? 'section' : 'sections'}`);
  const bottomMetaStrip = bottomMeta.length > 0
    ? `<div style="font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600;">${bottomMeta.join(`<span style="color:${t.muted}; opacity:0.6; margin:0 10px;">·</span>`)}</div>`
    : '';
  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="masthead" style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:0;">
  <div style="background:${t.primary}; padding:56px 80px 40px; display:flex; flex-direction:column; justify-content:space-between; min-height:32%; box-sizing:border-box;">
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px;">
      <div style="font-size:11px; letter-spacing:0.26em; text-transform:uppercase; color:#ffffff; font-weight:600;">
        § Lasca · Report
      </div>
      ${bandMeta}
    </div>
    <div style="width:48px; height:2px; background:rgba(255,255,255,0.55); margin-top:24px;"></div>
  </div>
  <div style="flex:1; padding:64px 80px 56px; display:flex; flex-direction:column;">
    <div style="display:flex; flex-direction:column; gap:22px;">
      <h1 ${df('title')} style="font-size:56px; color:${t.primary}; margin:0; line-height:1.05; letter-spacing:-0.01em; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
      ${data.subtitle ? `<p ${df('subtitle')} style="font-size:20px; color:${t.text}; margin:0; line-height:1.5; max-width:80%; opacity:0.82;">${escMd(data.subtitle)}</p>` : ''}
    </div>
    <div style="margin-top:auto; padding-top:40px; display:flex; flex-direction:column; gap:14px;">
      <div style="width:100%; height:1px; background:${t.muted}; opacity:0.25;"></div>
      ${bottomMetaStrip}
    </div>
  </div>
</div>`;
}

function renderReportCoverIndex(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  // Asymmetric: left ~38% rail with brand + year + date + author + length
  // stacked in small-caps labeled fields; right ~62% column with title +
  // subtitle. (No inline TOC — contents live on their own dedicated page.)
  const yearFromDate = (() => {
    if (!data.date) return '';
    const m = data.date.match(/(19|20)\d{2}/);
    return m ? m[0] : '';
  })();
  const railItems: string[] = [];
  railItems.push(`<div style="font-size:10.5px; letter-spacing:0.26em; text-transform:uppercase; color:${t.primary}; font-weight:700;">§ Lasca · Report</div>`);
  if (yearFromDate) {
    railItems.push(`<div style="font-size:44px; color:${t.primary}; line-height:1; margin-top:18px; letter-spacing:-0.01em; ${headlineStyle(t, { isDisplay: true })}">${yearFromDate}</div>`);
  }
  if (data.date) {
    railItems.push(`<div style="margin-top:${yearFromDate ? 10 : 18}px;">
      <div style="font-size:9.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600;">Date</div>
      <div ${df('date')} style="font-size:13px; color:${t.text}; margin-top:4px; line-height:1.5;">${esc(data.date)}</div>
    </div>`);
  }
  if (data.author) {
    railItems.push(`<div style="margin-top:18px;">
      <div style="font-size:9.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600;">Author</div>
      <div ${df('author')} style="font-size:13px; color:${t.text}; margin-top:4px; line-height:1.5;">${esc(data.author)}</div>
    </div>`);
  }
  if (data.readingMinutes) {
    railItems.push(`<div style="margin-top:18px;">
      <div style="font-size:9.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600;">Length</div>
      <div style="font-size:13px; color:${t.text}; margin-top:4px; line-height:1.5;">${data.readingMinutes} min read${data.sectionCount ? ` · ${data.sectionCount} sections` : ''}</div>
    </div>`);
  }

  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="index" style="display:flex; flex-direction:row; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:72px 72px 64px;">
  <div style="flex:0 0 38%; padding-right:36px; border-right:1px solid ${t.muted}40; display:flex; flex-direction:column;">
    ${railItems.join('')}
  </div>
  <div style="flex:1; padding-left:44px; display:flex; flex-direction:column; justify-content:center;">
    <div style="display:flex; flex-direction:column; gap:22px;">
      <h1 ${df('title')} style="font-size:56px; color:${t.primary}; margin:0; line-height:1.06; letter-spacing:-0.01em; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
      ${data.subtitle ? `<p ${df('subtitle')} style="font-size:19px; color:${t.text}; margin:0; line-height:1.55; max-width:92%; opacity:0.82;">${escMd(data.subtitle)}</p>` : ''}
    </div>
  </div>
</div>`;
}

// CJK glyphs eat ~1em per char at display sizes; Latin averages ~0.5em. Weigh
// CJK 2× for title-length estimation so long bilingual titles get downscaled
// to avoid orphaned single-char last lines and runaway line counts.
function coverTitleWeightedLen(title: string): number {
  const cjk = (title.match(/[　-鿿＀-￯]/g) || []).length;
  return title.length + cjk;
}

// ── Paper: academic-journal cover for `analysis-paper` ─────────────────────
// Symmetric, scholarly. Small-caps journal wordmark + double horizontal rule,
// centered serif title, italic subtitle, authors/affiliation line, and a
// footer volume-notation strip ("VOL. R · 2026 · X MIN READ · Y SECTIONS").
function renderReportCoverPaper(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  const year = (() => {
    if (!data.date) return new Date().getFullYear().toString();
    const m = data.date.match(/(19|20)\d{2}/);
    return m ? m[0] : new Date().getFullYear().toString();
  })();
  const footerBits: string[] = [`VOL. R`, year];
  if (data.readingMinutes) footerBits.push(`${data.readingMinutes} MIN READ`);
  if (data.sectionCount) footerBits.push(`${data.sectionCount} ${data.sectionCount === 1 ? 'SECTION' : 'SECTIONS'}`);
  const footer = footerBits.join(`<span style="color:${t.muted}; opacity:0.55; margin:0 12px;">·</span>`);
  const wl = coverTitleWeightedLen(data.title);
  const titleSize = wl > 60 ? 34 : wl > 40 ? 42 : wl > 24 ? 48 : 52;
  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="paper" style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:84px 96px 64px;">
  <div style="text-align:center;">
    <div style="font-size:10.5px; letter-spacing:0.32em; text-transform:uppercase; color:${t.primary}; font-weight:600;">Lasca · Review of Analysis</div>
    <div style="margin:14px auto 0; width:62%; border-top:1px solid ${t.primary}; border-bottom:1px solid ${t.primary}; height:6px;"></div>
  </div>
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; text-align:center; gap:28px; padding:0 2%; min-height:0;">
    <h1 ${df('title')} style="font-size:${titleSize}px; color:${t.primary}; margin:0; line-height:1.2; letter-spacing:-0.005em; word-break:break-word; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:18px; color:${t.text}; margin:0; line-height:1.55; font-style:italic; opacity:0.82;">${escMd(data.subtitle)}</p>` : ''}
    ${(data.author || data.date) ? `
    <div style="margin-top:14px; display:flex; flex-direction:column; gap:6px;">
      ${data.author ? `<div ${df('author')} style="font-size:14px; color:${t.text}; letter-spacing:0.04em;">${esc(data.author)}</div>` : ''}
      ${data.date ? `<div ${df('date')} style="font-size:11.5px; color:${t.muted}; letter-spacing:0.18em; text-transform:uppercase;">${esc(data.date)}</div>` : ''}
    </div>` : ''}
  </div>
  <div style="text-align:center;">
    <div style="margin:0 auto 14px; width:32%; border-top:1px solid ${t.muted}; opacity:0.45;"></div>
    <div style="font-size:10px; letter-spacing:0.26em; color:${t.muted}; font-weight:600;">${footer}</div>
  </div>
</div>`;
}

// ── Memo: TO/FROM/RE/DATE header for `analysis-memo` ───────────────────────
// Internal-memo aesthetic. Top rule + "MEMORANDUM" wordmark; definition-list
// style metadata block with TO/FROM/RE/DATE; large subject title below; body
// subtitle reads like a one-line summary.
function renderReportCoverMemo(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  const row = (label: string, value: string, field?: string) => `
    <div style="display:flex; gap:16px; align-items:baseline; padding:10px 0; border-bottom:1px dashed ${t.muted}55;">
      <div style="flex:0 0 90px; font-size:10.5px; letter-spacing:0.26em; text-transform:uppercase; color:${t.muted}; font-weight:700;">${label}</div>
      <div ${field ? df(field) : ''} style="flex:1; font-size:14px; color:${t.text}; line-height:1.5;">${value}</div>
    </div>`;
  const rows: string[] = [];
  rows.push(row('To', 'Reader · File Copy'));
  if (data.author) rows.push(row('From', esc(data.author), 'author'));
  rows.push(row('Re', `<span ${df('title')}>${escMd(data.title)}</span>`));
  if (data.date) rows.push(row('Date', esc(data.date), 'date'));
  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="memo" style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:72px 88px 60px;">
  <div style="display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid ${t.primary}; padding-bottom:14px;">
    <div style="font-size:13px; letter-spacing:0.32em; text-transform:uppercase; color:${t.primary}; font-weight:700;">Memorandum</div>
    <div style="font-size:10.5px; letter-spacing:0.24em; text-transform:uppercase; color:${t.muted}; font-weight:600;">§ Lasca · Private</div>
  </div>
  <div style="margin-top:26px;">
    ${rows.join('')}
  </div>
  <div style="margin-top:44px; display:flex; flex-direction:column; gap:22px;">
    <h1 ${df('title')} style="font-size:44px; color:${t.primary}; margin:0; line-height:1.1; letter-spacing:-0.005em; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.title)}</h1>
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:18px; color:${t.text}; margin:0; line-height:1.55; max-width:88%; opacity:0.86;">${escMd(data.subtitle)}</p>` : ''}
  </div>
  <div style="margin-top:auto; padding-top:32px; display:flex; justify-content:space-between; align-items:baseline; border-top:1px solid ${t.muted}55;">
    <div style="font-size:10px; letter-spacing:0.26em; text-transform:uppercase; color:${t.muted}; font-weight:600;">${data.readingMinutes ? `${data.readingMinutes} min read` : 'Internal circulation'}</div>
    <div style="font-size:10px; letter-spacing:0.26em; text-transform:uppercase; color:${t.muted}; font-weight:600;">${data.sectionCount ? `${data.sectionCount} ${data.sectionCount === 1 ? 'section' : 'sections'}` : 'Confidential'}</div>
  </div>
</div>`;
}

// ── Field: dossier / noir cover for `analysis-field` ───────────────────────
// Dark theatrical aesthetic. Full-bleed dark canvas with a glowing
// primary-color sigil, massive all-caps display title broken across 1–2
// lines, low-contrast byline strip at the bottom, and a classified-style
// corner stamp. Pure type — no illustration.
function renderReportCoverField(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  const titleUpper = data.title.toUpperCase();
  const wl = coverTitleWeightedLen(data.title);
  const titleSize = wl > 72 ? 40 : wl > 48 ? 52 : wl > 30 ? 62 : 74;
  return `
<div class="${themeClass(theme)}" data-layout="report-cover" data-cover-variant="field" style="position:relative; display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:76px 84px 64px;">
  <div style="position:absolute; top:28px; right:28px; border:1px solid ${t.primary}; padding:6px 12px; font-size:9.5px; letter-spacing:0.3em; text-transform:uppercase; color:${t.primary}; font-weight:700;">Dossier · Open</div>
  <div style="display:flex; align-items:center; gap:14px;">
    <div style="width:10px; height:10px; background:${t.primary}; box-shadow:0 0 16px ${t.primary}; border-radius:999px;"></div>
    <div style="font-size:11px; letter-spacing:0.32em; text-transform:uppercase; color:${t.primary}; font-weight:700;">Lasca · Field Report</div>
  </div>
  <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:28px; min-height:0;">
    <h1 ${df('title')} style="font-size:${titleSize}px; color:${t.text}; margin:0; line-height:1.02; letter-spacing:-0.015em; text-transform:uppercase; font-weight:800; word-break:break-word; ${headlineStyle(t, { isDisplay: true })}">${escMd(titleUpper)}</h1>
    ${data.subtitle ? `<p ${df('subtitle')} style="font-size:19px; color:${t.muted}; margin:0; line-height:1.55; max-width:72%; letter-spacing:0.01em;">${escMd(data.subtitle)}</p>` : ''}
  </div>
  <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:24px; padding-top:24px; border-top:1px solid ${t.muted}55;">
    <div style="display:flex; flex-direction:column; gap:6px; min-width:0; max-width:65%;">
      ${data.author ? `<div ${df('author')} style="font-size:13px; color:${t.text}; letter-spacing:0.08em; text-transform:uppercase; font-weight:600; line-height:1.4;">${esc(data.author)}</div>` : ''}
      ${data.date ? `<div ${df('date')} style="font-size:10.5px; color:${t.muted}; letter-spacing:0.22em; text-transform:uppercase; line-height:1.5;">${esc(data.date)}</div>` : ''}
    </div>
    <div style="text-align:right; display:flex; flex-direction:column; gap:6px; flex-shrink:0;">
      ${data.readingMinutes ? `<div style="font-size:10.5px; color:${t.muted}; letter-spacing:0.22em; text-transform:uppercase; white-space:nowrap;">${data.readingMinutes} min read</div>` : ''}
      ${data.sectionCount ? `<div style="font-size:10.5px; color:${t.muted}; letter-spacing:0.22em; text-transform:uppercase; white-space:nowrap;">${data.sectionCount} ${data.sectionCount === 1 ? 'section' : 'sections'}</div>` : ''}
    </div>
  </div>
</div>`;
}

function renderReportCover(data: ReportCoverData, t: ThemeConfig, theme: Theme): string {
  const variant = data.coverVariant ?? defaultVariantForTheme(theme);
  switch (variant) {
    case 'masthead': return renderReportCoverMasthead(data, t, theme);
    case 'index':    return renderReportCoverIndex(data, t, theme);
    case 'paper':    return renderReportCoverPaper(data, t, theme);
    case 'memo':     return renderReportCoverMemo(data, t, theme);
    case 'field':    return renderReportCoverField(data, t, theme);
    case 'editorial':
    default:         return renderReportCoverEditorial(data, t, theme);
  }
}

// ── Report TOC — dedicated page 2 with full contents list ──────────────────
// Emitted when ≥ 3 h2 sections exist. Takes full page budget so even long
// reports can list every entry without truncation. Classic two-column
// numbered list with dotted leader lines; small header strip mirrors the
// report title/author/date for continuity with the cover.
function renderReportToc(data: ReportTocData, t: ThemeConfig, theme: Theme): string {
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const rows = entries.map((entry, i) => {
    const n = entry.number || String(i + 1).padStart(2, '0');
    const title = escMd(entry.title ?? '');
    return `
      <div style="display:flex; align-items:baseline; gap:14px; padding:14px 0; border-bottom:1px solid ${t.muted}33;">
        <span style="font-size:11px; letter-spacing:0.24em; color:${t.primary}; font-weight:700; min-width:30px;">${esc(n)}</span>
        <span style="flex:1; font-size:16px; color:${t.text}; line-height:1.45;">${title}</span>
      </div>`;
  }).join('');
  const contextBits: string[] = [];
  if (data.readingMinutes) contextBits.push(`${data.readingMinutes} min read`);
  if (entries.length) contextBits.push(`${entries.length} ${entries.length === 1 ? 'section' : 'sections'}`);
  if (data.date) contextBits.push(esc(data.date));
  const contextSep = `<span style="color:${t.muted}; opacity:0.55; margin:0 10px;">·</span>`;
  return `
<div class="${themeClass(theme)}" data-layout="report-toc" style="display:flex; flex-direction:column; box-sizing:border-box; height:100%; ${baseStyle(t)} padding:80px 88px 64px;">
  <div style="display:flex; justify-content:space-between; align-items:baseline;">
    <div style="font-size:10.5px; letter-spacing:0.28em; text-transform:uppercase; color:${t.primary}; font-weight:700;">Contents</div>
    ${data.reportTitle ? `<div style="font-size:10.5px; letter-spacing:0.2em; text-transform:uppercase; color:${t.muted}; font-weight:600; max-width:60%; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escMd(data.reportTitle)}</div>` : ''}
  </div>
  <div style="width:48px; height:3px; background:${t.primary}; margin-top:12px; border-radius:2px;"></div>
  <h2 style="font-size:36px; color:${t.primary}; margin:28px 0 0; line-height:1.15; letter-spacing:-0.005em; ${headlineStyle(t, { isDisplay: true })}">Table of Contents</h2>
  <div style="margin-top:32px; border-top:1px solid ${t.muted}55; flex:1; overflow:hidden;">
    ${rows}
  </div>
  ${contextBits.length ? `
  <div style="margin-top:28px; padding-top:20px; border-top:1px solid ${t.muted}33; font-size:10.5px; letter-spacing:0.22em; text-transform:uppercase; color:${t.muted}; font-weight:600;">
    ${contextBits.join(contextSep)}
  </div>` : ''}
</div>`;
}

function renderReportSection(data: ReportSectionData, t: ThemeConfig, theme: Theme): string {
  const hasCallout = !!data.callout;
  const numberPart = data.number ? `<span ${df('number')} style="color:${t.accent}; margin-right:10px;">${esc(data.number)}</span>` : '';
  return `
<div class="${themeClass(theme)}" data-layout="report-section" style="display:flex; flex-direction:column; box-sizing:border-box; ${baseStyle(t, false, true)} padding:72px;">
  <h2 style="font-size:24px; color:${t.primary}; margin:0 0 20px; line-height:1.3; ${headlineStyle(t)}">
    ${numberPart}<span ${df('heading')}>${escMd(data.heading)}</span>
  </h2>
  <div style="width:40px; height:2px; background:${t.primary}; margin-bottom:28px;"></div>
  ${hasCallout
    ? `<div style="display:flex; gap:28px; flex:1; min-height:0;">
        <div style="flex:0 0 58%; padding-bottom:18px;">
          ${renderParagraphs(data.body, 'body', t)}
        </div>
        <div style="flex:1; background:${t.cardBg}; border-left:3px solid ${t.accent}; padding:20px 24px 28px; align-self:flex-start;">
          <p ${df('callout')} style="font-size:14px; color:${t.text}; line-height:1.7; margin:0; font-style:italic;">${nl2brMd(data.callout!)}</p>
        </div>
      </div>`
    : `<div style="flex:1; min-height:0; padding-bottom:18px;">${renderParagraphs(data.body, 'body', t)}</div>`
  }
</div>`;
}

function renderReportBody(data: ReportBodyData, t: ThemeConfig, theme: Theme): string {
  const offset = !!data.offset;
  return `
<div class="${themeClass(theme)}" data-layout="report-body" style="display:flex; flex-direction:column; box-sizing:border-box; ${baseStyle(t, false, true)} padding:72px;">
  ${offset
    ? `<div style="display:flex; gap:36px; flex:1; min-height:0;">
        <div style="flex:0 0 34%;">
          ${data.sidenote ? `<p ${df('sidenote')} style="font-size:11px; color:${t.muted}; line-height:1.7; margin:0; font-style:italic;">${nl2brMd(data.sidenote)}</p>` : ''}
        </div>
        <div style="flex:1; padding-bottom:18px;">
          ${renderParagraphs(data.body, 'body', t)}
        </div>
      </div>`
    : `<div style="flex:1; min-height:0; padding-bottom:18px;">${renderParagraphs(data.body, 'body', t)}</div>`
  }
  ${data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; line-height:1.6; margin-top:16px; padding-top:10px; border-top:1px solid ${t.border};">${esc(data.footnote)}</p>` : ''}
</div>`;
}

function renderReportQuote(data: ReportQuoteData, t: ThemeConfig, theme: Theme): string {
  return `
<div class="${themeClass(theme)}" data-layout="report-quote" style="display:flex; flex-direction:column; justify-content:center; ${baseStyle(t)} padding:88px 84px;">
  <div style="font-size:56px; color:${t.primary}; line-height:1; font-style:italic; margin-bottom:16px; opacity:0.4;">&ldquo;</div>
  <p ${df('quote')} style="font-size:28px; color:${t.text}; line-height:1.4; margin:0 0 32px; font-style:italic; ${headlineStyle(t, { isDisplay: true })}">${escMd(data.quote)}</p>
  ${data.attribution ? `<p ${df('attribution')} style="font-size:14px; color:${t.accent}; margin:0; font-weight:500;">— ${esc(data.attribution)}</p>` : ''}
  ${data.context ? `<p ${df('context')} style="font-size:13px; color:${t.muted}; margin:8px 0 0; line-height:1.6;">${escMd(data.context)}</p>` : ''}
</div>`;
}

// ----------------------------------------------------------------------------
// pptx-faithful — 1:1 import via OOXML parser
// rawHtml is a self-contained absolutely-positioned fragment (with inline
// style and data-URL images). The outer wrapper isolates it inside the
// canvas and scales it to fit. v1.1: the slide is editable (drag + text),
// theme switcher applies a CSS filter for one-click recoloring.
// ----------------------------------------------------------------------------
/**
 * Shared faithful-slide wrapper used by both PPTX and PDF imports. Emits
 * the `data-pptx-faithful` / `data-pptx-inner` markers that Canvas.tsx's
 * drag / edit / findBlock / image-escape code all key off of — the name
 * is a historical artifact, think of it as "data-faithful".
 *
 * @param targetW/targetH — the deck's logical canvas size. The faithful
 *   source is scaled to fit inside this target. When target aspect matches
 *   source aspect exactly (typical path: pdf-faithful in a letter deck),
 *   scale=1 and there's no letterbox. When they mismatch (mixed deck),
 *   the content is letterboxed centered inside target.
 *
 * Note: faithful slides now carry the `lasca-theme-*` class so they
 * participate in the ambient animation system. The old CSS filter approach
 * (invert/hue-rotate/sepia) was replaced with a subtle tint overlay that
 * preserves source colors while giving a hint of the active theme.
 */
function renderFaithfulFrame(
  rawHtml: string,
  width: number,
  height: number,
  backgroundColor: string | undefined,
  t: ThemeConfig,
  theme: Theme,
  targetW: number,
  targetH: number,
  themedHtml?: string,
): string {
  const w = width || 960;
  const h = height || 540;
  const scale = Math.min(targetW / w, targetH / h);
  const offsetX = (targetW - w * scale) / 2;
  const offsetY = (targetH - h * scale) / 2;

  // When AI-recolored HTML exists and theme is not 'original', use it.
  // The themedHtml has CSS var references that resolve per-theme.
  // For 'original' theme, always use the original rawHtml.
  const html = (theme !== 'original' && themedHtml) ? themedHtml : rawHtml;

  // Source background preserved. Texture and tint rendered as separate
  // overlay divs ON TOP of the content (not as background layers underneath
  // it, which the inner rawHtml would completely cover).
  const sourceBg = backgroundColor || '#ffffff';

  // Theme tint: stronger than before (old 0.06 was invisible on dark bg).
  // Uses the theme's primary color at moderate alpha. blend mode adapts:
  // multiply darkens (good for light source bg), screen lightens (good for
  // dark source bg like this user's dark olive PPT).
  let tintColor = '';
  let blendMode = 'multiply';
  if (theme === 'warm') {
    tintColor = 'rgba(217,119,87,0.15)';
    blendMode = 'color';
  } else if (theme === 'cool') {
    tintColor = 'rgba(15,61,122,0.15)';
    blendMode = 'color';
  } else if (theme === 'dark') {
    tintColor = 'rgba(232,153,104,0.10)';
    blendMode = 'color';
  }
  // 'original': no tint

  // v2.4.2 unified PDF mode — raster layer is always visible underneath
  // and the vector layer sits on top for editability. Each text span gets
  // a small white background that masks the raster's baked text so the
  // user sees the live (editable) span cleanly. Extracted <img> tags keep
  // no background so the raster image shows through until the user drags
  // them off.
  const vectorMaskStyle = `<style>
[data-pptx-faithful="1"] [data-lasca-vector="1"] > span {
  background:#ffffff;
  padding:1px 2px;
  border-radius:1px;
  cursor:text;
}
[data-pptx-faithful="1"] [data-lasca-vector="1"] > img { cursor:grab; }
</style>`;

  // Texture overlay: sits ON TOP of content so the rawHtml (which covers
  // the entire inner area) doesn't obscure it. Uses the theme's texture
  // CSS var as a repeating background-image on a transparent div.
  const textureOverlay = `<div data-lasca-texture-overlay="1" style="position:absolute;inset:0;background:var(--lasca-texture-${theme}-url) repeat;pointer-events:none;z-index:3;opacity:0.7;"></div>`;

  // Tint overlay: color wash on top of everything.
  const tintOverlay = tintColor
    ? `<div style="position:absolute;inset:0;background:${tintColor};mix-blend-mode:${blendMode};pointer-events:none;z-index:4;"></div>`
    : '';

  return `${vectorMaskStyle}
<div data-pptx-faithful="1" data-pptx-scale="${scale}" class="${themeClass(theme)}" style="position:relative;width:100%;height:100%;background:${sourceBg};overflow:hidden;font-family:'Poppins','Noto Sans SC',sans-serif;color:${t.text};">
  <div data-pptx-inner="1" style="position:absolute;left:${offsetX}px;top:${offsetY}px;width:${w}px;height:${h}px;transform:scale(${scale});transform-origin:top left;">
    ${html}
  </div>
  ${textureOverlay}
  ${tintOverlay}
</div>`;
}

function renderPptxFaithful(data: PptxFaithfulData, t: ThemeConfig, theme: Theme, targetW: number, targetH: number): string {
  return renderFaithfulFrame(data.rawHtml, data.width, data.height, data.backgroundColor, t, theme, targetW, targetH, data.themedHtml);
}

// ----------------------------------------------------------------------------
// pdf-faithful — 1:1 import of a PDF page via pdfjs-dist text layer
// rawHtml is an absolutely-positioned fragment of <span>s. Shares the same
// wrapper as pptx-faithful so Canvas interaction code is unchanged.
// v2.4.2: unified mode. Raster layer (if present) is always visible as a
// background; vector layer (text spans + extracted images) sits on top.
// Text spans are masked by a white background so the raster's baked text
// doesn't ghost through. Each span is clickable / editable.
// ----------------------------------------------------------------------------
function renderPdfFaithful(
  data: PdfFaithfulData,
  t: ThemeConfig,
  theme: Theme,
  targetW: number,
  targetH: number,
): string {
  return renderFaithfulFrame(
    data.rawHtml, data.width, data.height, data.backgroundColor,
    t, theme, targetW, targetH, data.themedHtml,
  );
}

// ============================================================================
// Main
// ============================================================================

export type Renderer = (
  data: never,
  t: ThemeConfig,
  theme: Theme,
  targetW: number,
  targetH: number,
  isImport?: boolean,
) => string;

const RENDERERS: Record<string, Renderer> = {
  'cover':          renderCover as Renderer,
  'big-number':     renderBigNumber as Renderer,
  'three-cards':    renderThreeCards as Renderer,
  'two-column':     renderTwoColumn as Renderer,
  'stacked-bars':   renderStackedBars as Renderer,
  'grid-cards':     renderGridCards as Renderer,
  'quote':          renderQuote as Renderer,
  'image':          renderImage as Renderer,
  'title-body':     renderTitleBody as Renderer,
  'split-image':    renderSplitImage as Renderer,
  'icon-list':      renderIconList as Renderer,
  'timeline':       renderTimeline as Renderer,
  'table':          renderTable as Renderer,
  // v4 Charts & Diagrams
  'bar-chart':            renderBarChart as Renderer,
  'horizontal-bar-chart': renderHorizontalBarChart as Renderer,
  'line-chart':           renderLineChart as Renderer,
  'pie-chart':            renderPieChart as Renderer,
  'stacked-bar-chart':    renderStackedBarChart as Renderer,
  'scatter-chart':        renderScatterChart as Renderer,
  'dual-axis-bar':        renderDualAxisBar as Renderer,
  'heatmap':              renderHeatmap as Renderer,
  'flowchart':            renderFlowchart as Renderer,
  'funnel':               renderFunnel as Renderer,
  'pyramid':              renderPyramid as Renderer,
  'steps':                renderSteps as Renderer,
  'matrix':               renderMatrix as Renderer,
  'versus':               renderVersus as Renderer,
  'venn':                 renderVenn as Renderer,
  'bullseye':             renderBullseye as Renderer,
  'cycle':                renderCycle as Renderer,
  // v5 Business
  'agenda':         renderAgenda as Renderer,
  'team':           renderTeam as Renderer,
  'logo-wall':      renderLogoWall as Renderer,
  'pricing':        renderPricing as Renderer,
  'device-mockup':  renderDeviceMockup as Renderer,
  'section-break':  renderSectionBreak as Renderer,
  'closing':        renderClosing as Renderer,
  'stat-row':       renderStatRow as Renderer,
  // v6 Compound
  'featured-grid':  renderFeaturedGrid as Renderer,
  'bento':          renderBento as Renderer,
  'dashboard':      renderDashboard as Renderer,
  'hub-spoke':      renderHubSpoke as Renderer,
  'title-bento':    renderTitleBento as Renderer,
  'pptx-faithful':  renderPptxFaithful as Renderer,
  'pdf-faithful':   renderPdfFaithful as Renderer,
  // Card refactor: primary native layout after Phase 3. Every supported
  // legacy layout is rewritten here via adapt.ts. Legacy entries above remain
  // as a fallback for old decks that were stored before the adapter landed.
  'card-canvas':    renderCardCanvas as Renderer,
  'report-cover':   renderReportCover as Renderer,
  'report-toc':     renderReportToc as Renderer,
  'report-section': renderReportSection as Renderer,
  'report-body':    renderReportBody as Renderer,
  'report-quote':   renderReportQuote as Renderer,
  // Phase 3 — block-based report page (9-block ReportBlock union).
  'report-page':    renderReportPage as Renderer,
};

/** Whether a layout is one of the v2.4 report layouts. */
function isReportLayout(layout: string): boolean {
  return layout.startsWith('report-');
}

/**
 * Render a Slide JSON object to an HTML string with data-field attributes.
 *
 * @param logicalDims — the deck's authoring coord system. Defaults to
 *   960×540 (slide-16:9) for backward compatibility. Faithful renderers
 *   use it as the letterbox target. Native layouts ignore it because
 *   their flex/grid containers use height:100% and adapt to the outer
 *   wrapper automatically.
 * @param deckChrome — optional running header/footer text from the deck
 *   level. Rendered only for report-* layouts (as small muted overlays
 *   at the top and bottom edges). Page numbers are deliberately deferred
 *   to a follow-up so we don't need to thread slide index through every
 *   Canvas / Sidebar / Presenter call site.
 *
 * Note: the old `pdfRenderMode` arg was removed in v2.4.2 when PDF switched
 * to a single unified mode (raster background + editable text overlay).
 */
export function renderSlide(
  slide: Slide,
  theme: Theme = 'warm',
  logicalDims: { w: number; h: number } = { w: 960, h: 540 },
  deckChrome?: { header?: string; footer?: string },
  /** 0-based index of this slide in its deck. When provided with
   *  `totalSlides`, scene motifs (e.g. precision-rule) render a real
   *  page folio like "07 / 24" instead of a placeholder. Thumbnails
   *  and preview shots can omit these to suppress the folio. */
  slideIndex?: number,
  totalSlides?: number,
): string {
  const base = THEMES[theme] || THEMES.warm;
  const t = mergeStyleOverrides(base, slide.style);
  const renderer = RENDERERS[slide.layout];
  if (!renderer) {
    return `<div style="${baseStyle(t)} display:flex; align-items:center; justify-content:center;">
      <p style="color:${t.muted};">Unknown layout: ${esc(slide.layout)}</p>
    </div>`;
  }
  const isImport = slide.source === 'imported';
  let body = renderer(slide.data as never, t, theme, logicalDims.w, logicalDims.h, isImport);

  // Attribute injection on the slide root wrapper — lets globals.css scope
  // styling per layout + scene without branching any layout renderer. The
  // `preset-bilingual-report` block already uses `[data-layout^="report-"]`;
  // this makes the same targeting available for ALL layouts + scenes.
  const sceneId = getSceneFromTheme(theme);
  const sceneVariantId = getSceneVariant(theme);
  const sceneAttr = sceneId ? ` data-scene="${sceneId}"` : '';
  const variantAttr = sceneVariantId ? ` data-scene-variant="${sceneVariantId}"` : '';
  body = body.replace(
    /(<div)([^>]*class="lasca-theme-[^"]*")/,
    (_m, open, rest) => `${open} data-layout="${esc(slide.layout)}"${sceneAttr}${variantAttr}${rest}`,
  );

  // Theme-specific decoration overlay. Format split so slide vs report decks
  // express the same motif through different "languages" — slides lean on corner
  // marks / edge rules; reports lean on editorial baseline (caption / hairline /
  // left rule / folio). Layout prefix is the authoritative format signal.
  const format: 'slide' | 'report' = slide.layout.startsWith('report-') ? 'report' : 'slide';
  const deco = renderThemeDecoration(theme, t, logicalDims.w, logicalDims.h, slide.layout, format, slideIndex, totalSlides);
  if (deco) {
    body = body.replace(
      /(<div[^>]*class="lasca-theme-[^"]*"[^>]*>)/,
      `$1${deco}`,
    );
  }

  // Apply chartScale if set (chart/diagram resize)
  if (slide.chartScale && slide.chartScale !== 1) {
    const s = Math.max(0.5, Math.min(1.5, slide.chartScale));
    body = body.replace(
      /(<div[^>]*class="lasca-theme-[^"]*"[^>]*>)/,
      `$1<div data-chart-body="1" style="transform:scale(${s}); transform-origin:center; width:100%; height:100%;">`,
    ) + '</div>';
  }

  // Deck-level running header/footer: report layouts only, skip if both empty.
  const hasChrome = isReportLayout(slide.layout)
    && deckChrome
    && (deckChrome.header || deckChrome.footer);
  if (!hasChrome) return body;

  const chrome = `
${deckChrome!.header ? `<div style="position:absolute; top:24px; left:72px; right:72px; font-size:10px; color:${t.muted}; border-bottom:1px solid ${t.border}; padding-bottom:6px; pointer-events:none;">${escMd(deckChrome!.header)}</div>` : ''}
${deckChrome!.footer ? `<div style="position:absolute; bottom:24px; left:72px; right:72px; font-size:10px; color:${t.muted}; border-top:1px solid ${t.border}; padding-top:6px; pointer-events:none;">${escMd(deckChrome!.footer)}</div>` : ''}
`;
  // Append chrome at the end of the body HTML. The report wrappers use
  // position:relative (via baseStyle) so absolute children anchor to them.
  // Insert before the closing </div> of the outermost wrapper.
  const lastClose = body.lastIndexOf('</div>');
  if (lastClose === -1) return body + chrome;
  return body.slice(0, lastClose) + chrome + body.slice(lastClose);
}

/**
 * Render a full deck as an array of HTML strings.
 */
export function renderDeck(deck: {
  theme?: Theme;
  slides: Slide[];
  pageSize?: Deck['pageSize'];
  pageWidth?: number;
  pageHeight?: number;
  header?: string;
  footer?: string;
}): string[] {
  const theme = deck.theme || 'warm';
  // Inline logical-dims derivation to avoid a circular import back to pageSize.ts
  const ps = deck.pageSize || 'slide-16:9';
  let logical: { w: number; h: number };
  if (ps === 'letter') logical = { w: 612, h: 792 };
  else if (ps === 'a4') logical = { w: 595, h: 842 };
  else if (ps === 'custom') logical = { w: deck.pageWidth || 960, h: deck.pageHeight || 540 };
  else logical = { w: 960, h: 540 };
  const chrome = (deck.header || deck.footer) ? { header: deck.header, footer: deck.footer } : undefined;
  return deck.slides.map((slide, i) => renderSlide(slide, theme, logical, chrome, i, deck.slides.length));
}

/**
 * Parse a data-field path and set the value on a slide's data object.
 * e.g. setFieldValue(data, "cards.0.title", "New Title")
 */
export function setFieldValue(data: Record<string, unknown>, fieldPath: string, value: string): void {
  const parts = fieldPath.split('.');
  let current: Record<string, unknown> = data;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = /^\d+$/.test(parts[i]) ? parseInt(parts[i]) : parts[i];
    current = current[key as string] as Record<string, unknown>;
  }
  const lastKey = parts[parts.length - 1];
  current[lastKey] = value;
}
