// ============================================================================
// Lasca — renderCardCanvas
// ============================================================================
// Unified renderer for the `card-canvas` layout. Composition = CSS-grid
// structure (which regions exist); chrome (bg/radius/shadow/border) is a
// THEME decision via `ThemeConfig.cardChrome` ('none' | 'subtle' | 'framed').
// Single-slot / full-bleed / full-center compositions never get chrome.
//
// Variable-slot compositions (grid / hero-grid / title-grid) synthesize slot
// names and gridTemplate from the actual card count. `data.sidelined[]` from
// shrink-swaps is preserved but not rendered — a corner badge surfaces the
// count so the user can swap back to recover.
// ============================================================================

import type {
  Theme,
  ThemeConfig,
  BigNumberData,
  IconListData,
  AgendaData,
  StackedBarsData,
  TimelineData,
  TableData,
  FunnelData,
  PyramidData,
  StepsData,
  MatrixData,
  VersusData,
  VennData,
  BullseyeData,
  CycleData,
  HubSpokeData,
  FlowchartData,
} from '../types';
import type { CardCanvasData, Card, CardContent, Composition } from './types';
import { COMPOSITIONS, generateSlots } from './compositions';
import { renderSparkline, renderMiniDonut } from '../renderCharts';
import { fitToBudget } from '../layoutBudget';
import {
  baseStyle,
  themeClass,
  df,
  esc,
  escMd,
  nl2brMd,
  clampLines,
  autoFontSize,
  headlineStyle,
  labelColor,
  badgePill,
  cardImage,
  ensureTextContrast,
  renderChartEmbed,
  renderBigNumber,
  renderIconList,
  renderAgenda,
  renderStackedBars,
  renderTimeline,
  renderTable,
  IMPORT_WORD_BREAK,
  SAFE_INSET,
} from '../renderSlide';
import {
  renderFlowchart,
  renderFunnel,
  renderPyramid,
  renderSteps,
  renderMatrix,
  renderVersus,
  renderVenn,
  renderBullseye,
  renderCycle,
  renderHubSpoke,
} from '../renderDiagrams';
import { sanitizeSvg } from '../sanitizeSvg';

const CARD_INSET = { y: 20, x: 24 };

/** Resolve slot names for variable-slot compositions. */
function resolveSlots(composition: Composition, cardCount: number): string[] {
  if (composition.variableSlots) return generateSlots(cardCount, 'a');
  return (composition.slots ?? []).slice(0, cardCount);
}

/** Synthesize gridTemplate for adaptive compositions (hero-grid / title-grid
 *  / split-media) from actual card count. Returns the full inline grid CSS. */
function adaptiveGridTemplate(composition: Composition, cards: Card[]): string {
  if (composition.gridTemplate) return composition.gridTemplate;
  const n = cards.length;
  if (composition.mode === 'hero-grid') {
    const tileCount = Math.max(n - 1, 1);
    const slots = generateSlots(tileCount, 'a').join(' ');
    const heroRow = Array(tileCount).fill('hero').join(' ');
    return `grid-template-columns:repeat(${tileCount},1fr); grid-template-rows:auto 1fr; grid-template-areas:'${heroRow}' '${slots}';`;
  }
  if (composition.mode === 'title-grid') {
    const tileCount = Math.max(n - 1, 1);
    if (tileCount <= 3) {
      const slots = generateSlots(tileCount, 'a').join(' ');
      return `grid-template-columns:2fr repeat(${tileCount},1fr); grid-template-rows:1fr; grid-template-areas:'title ${slots}';`;
    }
    const rows = Math.ceil(tileCount / 2);
    const names = generateSlots(tileCount, 'a');
    const rowAreas: string[] = [];
    for (let r = 0; r < rows; r++) {
      const a = names[r * 2] ?? names[names.length - 1];
      const b = names[r * 2 + 1] ?? a;
      rowAreas.push(`'title ${a} ${b}'`);
    }
    return `grid-template-columns:2fr 1fr 1fr; grid-template-rows:repeat(${rows},1fr); grid-template-areas:${rowAreas.join(' ')};`;
  }
  if (composition.mode === 'split') {
    // split-media: media-role card anchors the image column; if cards[1] is
    // media, mirror to put image on the right.
    const mediaIdx = cards.findIndex(c => c.content.role === 'media');
    if (mediaIdx === 1) {
      return `grid-template-columns:1fr 1fr; grid-template-rows:1fr; grid-template-areas:'a b';`;
    }
    return `grid-template-columns:1fr 1fr; grid-template-rows:1fr; grid-template-areas:'a b';`;
  }
  return '';
}

function renderTextCard(
  content: Extract<CardContent, { role: 'text' }>,
  index: number,
  isLarge: boolean,
  composition: Composition,
  t: ThemeConfig,
  fieldBase: string,
  tileWrapper: (inner: string, extraStyle?: string) => string,
): string {
  const wb = IMPORT_WORD_BREAK;
  const color = labelColor(index, t);

  // Full-center: title above body, centered both axes, no card surface.
  if (composition.mode === 'full-center') {
    const titlePx = autoFontSize(content.title, 40, 22);
    // Auto-shrink body font based on content length so long prose pages don't
    // overflow the card. Thresholds tuned for Chinese prose (CJK packs more
    // information per char than Latin): <240 chars → editorial 18px, 240-500
    // → reading 15px, 500+ → dense 13px. Keeps longest content inside a
    // single card at the cost of smaller text — preference over
    // truncation ("字可以小一点，可以少写一点，只要最关键的").
    const bodyLen = content.body?.length ?? 0;
    const bodyPx = bodyLen < 240 ? 18 : bodyLen < 500 ? 15 : 13;
    const bodyLh = bodyLen < 240 ? 1.6 : bodyLen < 500 ? 1.55 : 1.5;
    const inner = `
      ${badgePill(content.badge, t, `${fieldBase}.badge`)}
      ${content.icon ? `<span ${df(`${fieldBase}.icon`)} style="font-size:40px; color:${color}; margin-bottom:12px;">${esc(content.icon)}</span>` : ''}
      ${content.label ? `<p ${df(`${fieldBase}.label`)} style="font-size:14px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0 0 12px; font-weight:500; letter-spacing:0.04em; ${wb}">${escMd(content.label)}</p>` : ''}
      ${content.title ? `<h2 ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.bg)}; margin:0; line-height:1.2; ${wb} ${headlineStyle(t, { isDisplay: true })} ${clampLines(3)}">${escMd(content.title)}</h2>` : ''}
      ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.text, t.bg)}; margin:16px 0 0; line-height:${bodyLh}; ${wb} ${clampLines(50)}">${nl2brMd(content.body)}</p>` : ''}
      ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin:18px 0 0; line-height:1.5; ${wb} ${clampLines(2)}">${escMd(content.footnote)}</p>` : ''}
    `;
    return tileWrapper(inner, 'align-items:safe center; justify-content:safe center; text-align:center; padding:48px;');
  }

  // Label-hero variant (grid card with prominent numeric/letter label).
  if (content.label && isLarge) {
    const titlePx = autoFontSize(content.title, 16, 12);
    const inner = `
      ${badgePill(content.badge, t, `${fieldBase}.badge`)}
      <span ${df(`${fieldBase}.label`)} style="font-size:52px; color:${ensureTextContrast(color, t.cardBg)}; ${headlineStyle(t)}">${esc(content.label)}</span>
      ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.cardBg)}; margin-top:16px; font-weight:500; text-align:center; ${wb} ${clampLines(2)}">${escMd(content.title)}</p>` : ''}
      ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.cardBg)}; text-align:center; margin-top:6px; line-height:1.5; ${wb} ${clampLines(10)}">${escMd(content.body)}</p>` : ''}
      ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.cardBg)}; text-align:center; margin-top:auto; line-height:1.4; ${wb}">${escMd(content.footnote)}</p>` : ''}
    `;
    return tileWrapper(inner, 'align-items:safe center; justify-content:safe center; text-align:center; padding:28px 20px;');
  }

  // Default text card.
  const titlePx = isLarge ? 24 : 16;
  const bodyPx = isLarge ? 15 : 13;
  const align = content.align === 'center' ? 'text-align:center;' : '';
  const inner = `
    ${badgePill(content.badge, t, `${fieldBase}.badge`)}
    ${content.icon ? `<span ${df(`${fieldBase}.icon`)} style="font-size:${isLarge ? 36 : 24}px; color:${color}; margin-bottom:${isLarge ? 12 : 6}px;">${esc(content.icon)}</span>` : ''}
    ${content.label ? `<p ${df(`${fieldBase}.label`)} style="font-size:${isLarge ? 14 : 12}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin:0 0 4px; font-weight:500; letter-spacing:0.04em; ${wb}">${escMd(content.label)}</p>` : ''}
    ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.cardBg)}; font-weight:600; margin:0; line-height:1.3; ${align} ${wb} ${isLarge ? headlineStyle(t) : ''} ${clampLines(isLarge ? 3 : 2)}">${escMd(content.title)}</p>` : ''}
    ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:${bodyPx}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:8px; line-height:1.5; ${align} ${wb} ${clampLines(composition.mode === 'split' || composition.mode === 'stack' ? 14 : (isLarge ? 10 : 4))}">${escMd(content.body)}</p>` : ''}
    ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:auto; padding-top:8px; line-height:1.4; ${align} ${wb} ${clampLines(2)}">${escMd(content.footnote)}</p>` : ''}
  `;
  // Multi-line text cards must top-align: tileWrapper's isLarge default
  // (justify-content:center) + overflow:hidden centers the eyebrow+title+body
  // group and crops both ends symmetrically when content overflows the slot.
  return tileWrapper(inner, 'justify-content:flex-start;');
}

function renderStatCard(
  content: Extract<CardContent, { role: 'stat' }>,
  isLarge: boolean,
  t: ThemeConfig,
  fieldBase: string,
  tileWrapper: (inner: string, extraStyle?: string) => string,
): string {
  const wb = IMPORT_WORD_BREAK;
  const changeColor = content.delta && content.delta.includes('-') ? '#e74c3c' : t.green;
  const valuePx = isLarge ? 48 : 32;
  const valueColor = ensureTextContrast(t.primary, t.cardBg);
  const textColor = ensureTextContrast(t.text, t.cardBg);
  const mutedColor = ensureTextContrast(t.muted, t.cardBg);

  // Stat-card trend sparklines and mini-donuts used to render from
  // content.trend / content.donut, but the LLM hallucinated arbitrary data
  // points (2-3 numbers with no semantic grounding) and rendered them as
  // tiny decorative charts — see Images 6, 7, 10. the design review repeatedly flagged
  // them "unnecessary and meaningless". The underlying data stays in the
  // Card type so a future layout (e.g. real trend-chart role) can use it,
  // but the stat card no longer surfaces them. Don't reintroduce here
  // without a semantic gate that can prove the trend data is real.
  const trendHtml = '';
  const donutHtml = '';

  const inner = `
    ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:13px; color:${mutedColor}; margin:0 0 6px; font-weight:500; letter-spacing:0.03em; ${wb}">${escMd(content.title)}</p>` : ''}
    <p ${df(`${fieldBase}.value`)} style="font-size:${valuePx}px; color:${valueColor}; margin:0; font-weight:700; line-height:1; ${headlineStyle(t, { isDisplay: true })}">${esc(content.value)}</p>
    ${content.delta ? `<p ${df(`${fieldBase}.delta`)} style="font-size:12px; color:${changeColor}; margin:4px 0 0; font-weight:600;">${esc(content.delta)}</p>` : ''}
    ${trendHtml}${donutHtml}
    ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:13px; color:${textColor}; margin:8px 0 0; line-height:1.5; ${wb} ${clampLines(6)}">${escMd(content.body)}</p>` : ''}
    ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:12px; color:${mutedColor}; margin-top:auto; padding-top:8px; line-height:1.4; ${wb}">${escMd(content.footnote)}</p>` : ''}
  `;
  return tileWrapper(inner, `padding:${CARD_INSET.y}px ${CARD_INSET.x}px;`);
}

// ---- Phase 2.5: hero / title zone renderers ------------------------------
// These bypass the card-surface tile wrapper — they render directly into
// their grid-area with no bg/radius/shadow. Used when
// `Composition.slotRoles[card.slot] === 'hero' | 'title'`. Mirrors the hero
// and title zones from legacy renderFeaturedGrid (renderSlide.ts:1121-1158)
// and renderTitleBento (renderSlide.ts:1281-1329).

function renderHeroZone(
  content: CardContent,
  t: ThemeConfig,
  fieldBase: string,
): string {
  if (content.role !== 'text') return '';
  const wb = IMPORT_WORD_BREAK;
  const titlePx = autoFontSize(content.title, 36, 22);

  const HERO_BUDGET_PX = 160;
  const HERO_INNER_WIDTH = 850;
  const footnoteFit = content.footnote
    ? fitToBudget({
        fixed: [
          ...(content.title ? [{ text: content.title, fontSize: titlePx, lineHeight: 1.2, marginBottom: 8, fixedLines: 1 }] : []),
          ...(content.body ? [{ text: content.body, fontSize: 18, lineHeight: 1.4, marginBottom: 4 }] : []),
        ],
        body: [{ text: content.footnote, fontSize: 15, lineHeight: 1.6, marginTop: 8 }],
        containerWidthPx: HERO_INNER_WIDTH,
        budgetPx: HERO_BUDGET_PX,
        maxBodyPx: 15,
        minBodyPx: 12,
      })
    : null;
  const footnotePx = footnoteFit?.bodyFontSize ?? 15;

  return `
    <div style="grid-area:hero; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:safe center; padding:8px 0 24px;">
      ${content.title ? `<h2 ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.primary, t.bg)}; margin:0 0 8px; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(content.title)}</h2>` : ''}
      ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:18px; color:${ensureTextContrast(t.text, t.bg)}; margin:0 0 4px; ${wb} ${clampLines(6)}">${escMd(content.body)}</p>` : ''}
      ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:${footnotePx}px; color:${ensureTextContrast(t.muted, t.bg)}; line-height:1.6; margin:8px 0 0; ${wb} ${clampLines(6)}">${escMd(content.footnote)}</p>` : ''}
    </div>`;
}

function renderTitleZone(
  content: CardContent,
  t: ThemeConfig,
  fieldBase: string,
): string {
  if (content.role !== 'text') return '';
  const wb = IMPORT_WORD_BREAK;
  const titlePx = autoFontSize(content.title, 44, 28);

  const TITLE_COL_WIDTH = Math.floor((960 - 2 * 56) * 0.4) - 32;
  const TITLE_COL_BUDGET = 540 - 2 * 40 - 40;
  const footnoteFit = content.footnote
    ? fitToBudget({
        fixed: [
          ...(content.label ? [{ text: content.label, fontSize: 13, lineHeight: 1.4, marginBottom: 12 }] : []),
          ...(content.title ? [{ text: content.title, fontSize: titlePx, lineHeight: 1.15, marginBottom: 0 }] : []),
        ],
        body: [{ text: content.footnote, fontSize: 14, lineHeight: 1.6, marginTop: 16 }],
        containerWidthPx: TITLE_COL_WIDTH,
        budgetPx: TITLE_COL_BUDGET,
        maxBodyPx: 14,
        minBodyPx: 11,
      })
    : null;
  const footnotePx = footnoteFit?.bodyFontSize ?? 14;

  return `
    <div style="grid-area:title; min-width:0; min-height:0; display:flex; flex-direction:column; justify-content:safe center; padding-right:32px;">
      ${content.label ? `<p ${df(`${fieldBase}.label`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin:0 0 12px; font-weight:500; ${wb}">${escMd(content.label)}</p>` : ''}
      ${content.title ? `<h2 ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.bg)}; line-height:1.15; margin:0; ${wb} ${headlineStyle(t, { isDisplay: true })}">${escMd(content.title)}</h2>` : ''}
      ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:${footnotePx}px; color:${ensureTextContrast(t.muted, t.bg)}; margin-top:auto; line-height:1.6; ${wb}">${escMd(content.footnote)}</p>` : ''}
    </div>`;
}

// ---- Phase 3: full-bleed legacy-renderer short-circuit ---------------------
// When a single-card composition uses `fullBleed: true`, many structured
// roles (diagrams, table, big-number, list) are rendered by the original
// whole-page legacy renderer. The renderer owns its own layout, title, and
// padding — we just hand it the reconstructed legacy data shape and return
// its full-page HTML, skipping the grid/tile wrapping entirely.
//
// Returns `null` if the role doesn't map to a legacy renderer (caller falls
// through to the regular grid/tile path).
function renderFullBleedLegacy(
  content: CardContent,
  title: string,
  t: ThemeConfig,
  theme: Theme,
  tw: number,
  th: number,
  isImport: boolean,
): string | null {
  switch (content.role) {
    case 'big-number': {
      const data: BigNumberData = {
        number: content.number,
        text: content.title ?? '',
        footnote: content.footnote,
        highlight: content.highlight,
      };
      return renderBigNumber(data, t, theme, tw, th, isImport);
    }
    case 'table': {
      const data: TableData = {
        title: content.title ?? title,
        headers: content.columns,
        rows: content.rows,
        highlight: content.highlight,
        footnote: content.footnote,
      };
      return renderTable(data, t, theme, tw, th, isImport);
    }
    case 'timeline': {
      const data: TimelineData = { title: content.title ?? title, events: content.events };
      return renderTimeline(data, t, theme, tw, th, isImport);
    }
    case 'list': {
      const t0 = content.title ?? title;
      if (content.style === 'bar') {
        const data: StackedBarsData = {
          title: t0,
          bars: content.items.map((it) => ({
            text: it.title,
            color: it.color ?? 'primary',
          })),
        };
        return renderStackedBars(data, t, theme, tw, th, isImport);
      }
      if (content.ordered || content.style === 'number') {
        const data: AgendaData = {
          title: t0,
          items: content.items.map((it) => ({ text: it.title, sub: it.desc })),
        };
        return renderAgenda(data, t, theme, tw, th, isImport);
      }
      const data: IconListData = {
        title: t0,
        items: content.items.map((it) => ({
          icon: it.icon ?? '',
          text: it.title,
          sub: it.desc,
        })),
      };
      return renderIconList(data, t, theme, tw, th, isImport);
    }
    case 'funnel': {
      const data: FunnelData = { title: content.title ?? title, items: content.items, footnote: content.footnote };
      return renderFunnel(data, t, theme, tw, th, isImport);
    }
    case 'pyramid': {
      const data: PyramidData = { title: content.title ?? title, items: content.items, footnote: content.footnote, groupLabel: content.groupLabel };
      return renderPyramid(data, t, theme, tw, th, isImport);
    }
    case 'steps': {
      const data: StepsData = { title: content.title ?? title, items: content.items, footnote: content.footnote, groupLabel: content.groupLabel };
      return renderSteps(data, t, theme, tw, th, isImport);
    }
    case 'matrix': {
      const data: MatrixData = {
        title: content.title ?? title,
        xAxis: content.xAxis,
        yAxis: content.yAxis,
        topLeft: content.topLeft,
        topRight: content.topRight,
        bottomLeft: content.bottomLeft,
        bottomRight: content.bottomRight,
        footnote: content.footnote,
      };
      return renderMatrix(data, t, theme, tw, th, isImport);
    }
    case 'versus': {
      const data: VersusData = {
        title: content.title ?? title,
        left: content.left,
        right: content.right,
        footnote: content.footnote,
      };
      return renderVersus(data, t, theme, tw, th, isImport);
    }
    case 'venn': {
      const data: VennData = {
        title: content.title ?? title,
        items: content.items,
        overlap: content.overlap,
        footnote: content.footnote,
      };
      return renderVenn(data, t, theme, tw, th, isImport);
    }
    case 'bullseye': {
      const data: BullseyeData = { title: content.title ?? title, items: content.items, footnote: content.footnote };
      return renderBullseye(data, t, theme, tw, th, isImport);
    }
    case 'cycle': {
      const data: CycleData = { title: content.title ?? title, items: content.items, footnote: content.footnote };
      return renderCycle(data, t, theme, tw, th, isImport);
    }
    case 'hub-spoke': {
      const data: HubSpokeData = {
        title: content.title ?? title,
        center: content.center,
        spokes: content.spokes,
        footnote: content.footnote,
      };
      return renderHubSpoke(data, t, theme, tw, th, isImport);
    }
    case 'flowchart': {
      const data: FlowchartData = {
        title: content.title ?? title,
        steps: content.steps,
        direction: content.direction,
        footnote: content.footnote,
        groupLabel: content.groupLabel,
      };
      return renderFlowchart(data, t, theme, tw, th, isImport);
    }
    case 'svg-figure': {
      const cleaned = sanitizeSvg(content.svg ?? '');
      if (!cleaned) return null;
      const titleText = content.title ?? title;
      const caption = content.caption ?? content.footnote;
      // The SVG itself is wrapped in data-no-edit so Canvas.tsx's drag /
      // double-click / syncSlideHtml never descend into SVG children (text
      // nodes there look like leaf data-fields to findBlock). The outer div
      // has no data-field — editing the figure means editing `svg` via chat.
      return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  ${titleText ? `<h2 data-field="title" style="font-size:30px; color:${t.primary}; margin-bottom:20px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(titleText)}</h2>` : ''}
  <div data-no-edit="1" style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; color:${t.text};">${cleaned}</div>
  ${caption ? `<p data-field="caption" style="font-size:12px; color:${t.muted}; margin-top:14px; text-align:center; line-height:1.5; ${IMPORT_WORD_BREAK}">${escMd(caption)}</p>` : ''}
</div>`;
    }
    default:
      return null;
  }
}

function renderCard(
  card: Card,
  index: number,
  totalCards: number,
  isLarge: boolean,
  composition: Composition,
  t: ThemeConfig,
  theme: Theme,
  radius: number,
  cardSurface: string,
  usesNamedAreas: boolean,
  fieldBaseOverride?: string,
): string {
  const wb = IMPORT_WORD_BREAK;
  const areaName = card.slot;
  const fieldBase = fieldBaseOverride ?? `cards.${index}.content`;
  const mode = composition.mode;
  // Card = CSS-grid region (structure). Whether each region renders chrome
  // (bg/radius/shadow/border) is a THEME decision — `t.cardChrome`. Single-
  // slot / full-bleed compositions never get chrome regardless of theme.
  const chromeLevel = t.cardChrome ?? 'none';
  const multiSlot = (composition.slots?.length ?? 0) > 1;
  const hasSurface = chromeLevel !== 'none' && multiSlot && mode !== 'full-bleed' && mode !== 'full-center';
  // grid-area:<slot> only works when the composition's gridTemplate defines
  // matching named areas. For area-less compositions (full-*, split-*, grid-Ncol,
  // grid-2x2) `grid-area:a` resolves to an undefined named line and CSS pushes
  // the element into the implicit grid (typically bottom-right). Omit the
  // declaration in that case and let auto-placement fill cells in DOM order.
  const placement = usesNamedAreas ? `grid-area:${areaName};` : '';

  const tileWrapper = (inner: string, extraStyle = ''): string => {
    const surfaceCss = hasSurface
      ? chromeLevel === 'framed'
        ? `background:${t.cardBg}; border-radius:${radius}px; box-shadow:${cardSurface}; border:1px solid ${t.border}; overflow:hidden;`
        : `background:${t.cardBg}; border-radius:${radius}px; box-shadow:${cardSurface}; overflow:hidden;`
      : 'overflow:hidden;';
    const defaultPadding = mode === 'full-bleed'
      ? 'padding:0;'
      : mode === 'full-center'
        ? 'padding:48px;'
        : `padding:${isLarge ? '28px 24px' : '20px 16px'};`;
    const hasPaddingInExtra = /padding:/i.test(extraStyle);
    // `safe center` keeps the centered look for short content but reverts
    // to flex-start when content overflows — preventing the symmetric
    // top+bottom crop that overflow:hidden causes on a centered flex group.
    const centerCss = mode === 'full-center'
      ? 'justify-content:safe center; align-items:safe center; text-align:center;'
      : isLarge
        ? 'justify-content:safe center;'
        : '';
    return `
    <div style="${placement} min-width:0; min-height:0; display:flex; flex-direction:column; ${centerCss} ${surfaceCss} ${hasPaddingInExtra ? '' : defaultPadding} ${extraStyle}">
      ${inner}
    </div>`;
  };

  const content = card.content;
  switch (content.role) {
    case 'media': {
      const isFull = mode === 'full-bleed' || mode === 'split';
      const titlePx = isLarge ? 24 : 16;
      if ((isLarge || isFull) && content.imageUrl) {
        // Image-first: full-cover background with optional text overlay.
        const hasOverlay = content.title || content.body || content.footnote;
        const overlay = hasOverlay ? `
          <div style="padding:24px; background:linear-gradient(transparent, rgba(0,0,0,0.6));">
            ${badgePill(content.badge, t, `${fieldBase}.badge`)}
            ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:#fff; font-weight:600; margin:0; line-height:1.3; ${wb} ${headlineStyle(t)}">${escMd(content.title)}</p>` : ''}
            ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:${isLarge ? 15 : 13}px; color:rgba(255,255,255,0.85); margin-top:6px; line-height:1.4; ${wb} ${clampLines(3)}">${escMd(content.body)}</p>` : ''}
            ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:12px; color:rgba(255,255,255,0.7); margin-top:4px; ${wb}">${escMd(content.footnote)}</p>` : ''}
          </div>` : '';
        const radiusCss = hasSurface ? `border-radius:${radius}px; box-shadow:${cardSurface};` : '';
        return `
      <div style="${placement} min-width:0; min-height:0; ${radiusCss} overflow:hidden; position:relative; display:flex; flex-direction:column; justify-content:flex-end; background:url('${content.imageUrl}') center/cover no-repeat;">
        ${overlay}
      </div>`;
      }
      const inner = `
        ${cardImage(content.imageUrl, 0, '80px')}
        <div style="padding:8px 14px 14px;">
          ${badgePill(content.badge, t, `${fieldBase}.badge`)}
          ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${titlePx}px; color:${ensureTextContrast(t.text, t.cardBg)}; font-weight:600; margin:0; line-height:1.3; ${wb} ${isLarge ? headlineStyle(t) : ''} ${clampLines(isLarge ? 3 : 2)}">${escMd(content.title)}</p>` : ''}
          ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:${isLarge ? 15 : 13}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:8px; line-height:1.5; ${wb} ${clampLines(mode === 'split' || mode === 'stack' ? 14 : (isLarge ? 10 : 4))}">${escMd(content.body)}</p>` : ''}
          ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:12px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:4px; ${wb}">${escMd(content.footnote)}</p>` : ''}
        </div>`;
      return tileWrapper(inner, 'padding:0;');
    }
    case 'chart': {
      const isBleed = mode === 'full-bleed';
      // Dedicated chart slot in split-cards-chart / stack-cards-chart — the
      // chart owns its region (not competing with text tiles), so it renders
      // much larger than a peer tile but smaller than full-bleed.
      const isDedicated = areaName === 'chart' && (mode === 'split-chart' || mode === 'stack-chart');
      const chartW = isBleed ? 860 : isDedicated ? 500 : (isLarge ? 340 : 180);
      const chartH = isBleed ? 420 : isDedicated ? 300 : (isLarge ? 200 : 100);
      const chartInner = renderChartEmbed(content.chart, t, theme, chartW, chartH);
      if (isBleed) {
        const inner = `
        ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:22px; color:${ensureTextContrast(t.text, t.bg)}; margin:0 0 12px; font-weight:600; ${wb} ${headlineStyle(t)}">${escMd(content.title)}</p>` : ''}
        <div style="flex:1; min-height:0; min-width:0; display:flex; flex-direction:column; align-items:stretch; justify-content:center;">${chartInner}</div>
        ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:13px; color:${ensureTextContrast(t.muted, t.bg)}; margin:8px 0 0; line-height:1.5; text-align:center; ${wb}">${escMd(content.footnote)}</p>` : ''}`;
        return tileWrapper(inner);
      }
      const stretched = chartInner.replace(
        /style="width:100%;\s*max-height:100%[^"]*"/,
        'style="width:100%; height:100%; display:block;"'
      );
      const inner = `
        ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${isLarge ? 16 : 13}px; color:${ensureTextContrast(t.text, t.cardBg)}; margin:0 0 8px; font-weight:600; ${wb} ${clampLines(2)}">${escMd(content.title)}</p>` : ''}
        <div style="overflow:hidden; border-radius:${Math.max(radius - 4, 4)}px; flex:1; min-height:0;">${stretched}</div>
        ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:${isLarge ? 13 : 12}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:8px; line-height:1.5; ${wb} ${clampLines(5)}">${escMd(content.footnote)}</p>` : ''}`;
      return tileWrapper(inner);
    }
    case 'stat':
      return renderStatCard(content, isLarge, t, fieldBase, tileWrapper);
    case 'quote': {
      const isCentered = mode === 'full-center';
      const quotePx = isCentered ? 32 : isLarge ? 22 : 15;
      const attribPx = isCentered ? 16 : isLarge ? 15 : 13;
      const bg = hasSurface ? t.cardBg : t.bg;
      const inner = `
        <p ${df(`${fieldBase}.quote`)} style="font-size:${quotePx}px; color:${ensureTextContrast(t.text, bg)}; font-style:italic; line-height:1.5; ${wb} ${isCentered ? '' : clampLines(isLarge ? 10 : 6)}">${escMd(content.quote)}</p>
        ${content.footnote ? `<p ${df(`${fieldBase}.footnote`)} style="font-size:${attribPx}px; color:${ensureTextContrast(t.muted, bg)}; margin-top:${isCentered ? 16 : 10}px; ${wb}">— ${esc(content.footnote)}</p>` : ''}
        ${content.body ? `<p ${df(`${fieldBase}.body`)} style="font-size:${isCentered ? 14 : 12}px; color:${ensureTextContrast(t.muted, bg)}; margin-top:8px; line-height:1.5; ${wb}">${escMd(content.body)}</p>` : ''}`;
      return tileWrapper(inner);
    }
    // --- Phase 3: structured / diagram roles -------------------------------
    // These normally render via the full-bleed short-circuit in
    // renderCardCanvas. The tile-embedded fallback below nests the legacy
    // renderer's full-page output inside a tile — visually redundant but
    // safe when someone drops one into a non-full-bleed composition.
    case 'list':
    case 'table':
    case 'big-number':
    case 'funnel':
    case 'pyramid':
    case 'matrix':
    case 'versus':
    case 'venn':
    case 'bullseye':
    case 'cycle':
    case 'hub-spoke':
    case 'flowchart':
    case 'steps':
    case 'timeline': {
      const legacy = renderFullBleedLegacy(content, '', t, theme, 960, 540, false);
      return tileWrapper(legacy ?? '');
    }
    case 'svg-figure': {
      const cleaned = sanitizeSvg(content.svg ?? '');
      if (!cleaned) return tileWrapper('');
      const inner = `
        ${content.title ? `<p ${df(`${fieldBase}.title`)} style="font-size:${isLarge ? 16 : 13}px; color:${ensureTextContrast(t.text, t.cardBg)}; margin:0 0 8px; font-weight:600; ${wb} ${clampLines(2)}">${escMd(content.title)}</p>` : ''}
        <div data-no-edit="1" style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center; overflow:hidden; color:${ensureTextContrast(t.text, t.cardBg)};">${cleaned}</div>
        ${content.caption ? `<p ${df(`${fieldBase}.caption`)} style="font-size:${isLarge ? 12 : 11}px; color:${ensureTextContrast(t.muted, t.cardBg)}; margin-top:8px; line-height:1.4; text-align:center; ${wb} ${clampLines(2)}">${escMd(content.caption)}</p>` : ''}`;
      return tileWrapper(inner);
    }
    case 'card-group':
      // Defensive: a card-group at the inner level (doubly nested). The main
      // renderCardCanvas loop intercepts top-level card-group cards directly,
      // so this path is rare. fieldBase is already set to the outer path.
      return renderCardGroup(content, areaName, fieldBase, t, theme, radius, cardSurface, usesNamedAreas);
    case 'text':
    default:
      return renderTextCard(content as Extract<CardContent, { role: 'text' }>, index, isLarge, composition, t, fieldBase, tileWrapper);
  }
}

/** Render a card-group: a slot whose content is itself a grid of nested cards.
 *  The wrapper is chrome-less (no bg / radius / shadow) — inner cards each
 *  carry their own chrome. data-field paths are nested:
 *    `cards.${outerIdx}.content.cards.${innerIdx}.content.*`
 *  so inline editing (Canvas.tsx + updateSlideField) writes back correctly. */
function renderCardGroup(
  content: Extract<CardContent, { role: 'card-group' }>,
  outerSlot: string,
  outerFieldBase: string,
  t: ThemeConfig,
  theme: Theme,
  radius: number,
  cardSurface: string,
  outerUsesNamedAreas: boolean,
): string {
  const innerComp: Composition = COMPOSITIONS[content.innerCompositionId] ?? COMPOSITIONS['bento-1+2'];
  const innerCards = content.cards ?? [];
  const innerMode = innerComp.mode;

  // Reuse outer's slot resolution for inner cards (variable-slot compositions
  // regenerate slot names from count).
  const slotList = resolveSlots(innerComp, innerCards.length);
  let cards: Card[];
  if (innerMode === 'hero-grid' || innerMode === 'title-grid') {
    const zone = innerMode === 'hero-grid' ? 'hero' : 'title';
    const tileSlots = generateSlots(Math.max(innerCards.length - 1, 0), 'a');
    cards = innerCards.map((card, i) =>
      i === 0 ? { ...card, slot: zone } : { ...card, slot: tileSlots[i - 1] ?? card.slot },
    );
  } else if (innerComp.variableSlots) {
    cards = innerCards.map((card, i) => ({ ...card, slot: slotList[i] ?? card.slot }));
  } else {
    cards = innerCards.slice(0, (innerComp.slots ?? []).length);
  }

  const innerLargeSet = new Set(innerComp.largeSlots ?? []);
  const innerGap = innerComp.gap ?? 14;
  const innerGridTemplate = adaptiveGridTemplate(innerComp, cards);
  const innerUsesNamedAreas = /grid-template-areas/.test(innerGridTemplate);

  const tilesHtml = cards.map((card, j) => {
    const innerFieldBase = `${outerFieldBase}.cards.${j}.content`;
    if (card.slot === 'hero') return renderHeroZone(card.content, t, innerFieldBase);
    if (card.slot === 'title') return renderTitleZone(card.content, t, innerFieldBase);
    const isLargeInner = innerLargeSet.has(card.slot);
    return renderCard(
      card,
      j,
      cards.length,
      isLargeInner,
      innerComp,
      t,
      theme,
      radius,
      cardSurface,
      innerUsesNamedAreas,
      innerFieldBase,
    );
  }).join('\n');

  // Wrapper fills its outer grid slot entirely, no chrome, no padding.
  // `grid-area:${outerSlot}` only if the OUTER composition uses named areas
  // (split-cards-chart / stack-cards-chart both do).
  const placement = outerUsesNamedAreas ? `grid-area:${outerSlot};` : '';
  return `
    <div style="${placement} min-width:0; min-height:0; display:grid; ${innerGridTemplate} gap:${innerGap}px;">
      ${tilesHtml}
    </div>`;
}

export function renderCardCanvas(
  data: CardCanvasData,
  t: ThemeConfig,
  theme: Theme,
  _tw: number,
  _th: number,
  isImport = false,
): string {
  const wb = IMPORT_WORD_BREAK;
  const radius = t.radiusCard ?? 12;
  const cardSurface = t.cardSurface ?? t.cardShadow;
  const composition: Composition = COMPOSITIONS[data.compositionId] ?? COMPOSITIONS['bento-1+2'];
  const rawCards = data.cards || [];
  const mode = composition.mode;

  // full-bleed single-card with a structured role (diagram / table / list /
  // big-number / timeline) delegates to the original whole-page legacy
  // renderer. The renderer owns its own theme wrapper, title, and padding,
  // so we return its output verbatim and skip grid/tile setup entirely.
  if (mode === 'full-bleed' && rawCards.length === 1) {
    const legacy = renderFullBleedLegacy(
      rawCards[0].content,
      data.title ?? '',
      t,
      theme,
      _tw,
      _th,
      isImport,
    );
    if (legacy) return legacy;
  }

  // Variable-slot compositions (grid / hero-grid / title-grid) regenerate
  // slot names from actual card count; fixed compositions keep their labels.
  // For hero-grid / title-grid, the first card takes the hero/title zone
  // and the rest get sequential tile slots starting at 'a'.
  const slotList = resolveSlots(composition, rawCards.length);
  let cards: Card[];
  if (mode === 'hero-grid' || mode === 'title-grid') {
    const zone = mode === 'hero-grid' ? 'hero' : 'title';
    const tileSlots = generateSlots(Math.max(rawCards.length - 1, 0), 'a');
    cards = rawCards.map((card, i) =>
      i === 0 ? { ...card, slot: zone } : { ...card, slot: tileSlots[i - 1] ?? card.slot },
    );
  } else if (composition.variableSlots) {
    cards = rawCards.map((card, i) => ({ ...card, slot: slotList[i] ?? card.slot }));
  } else {
    cards = rawCards.slice(0, (composition.slots ?? []).length);
  }

  const largeSet = new Set(composition.largeSlots ?? []);
  const gap = composition.gap ?? 14;
  const gridTemplate = adaptiveGridTemplate(composition, cards);
  // hero/title zones always need grid-area (their gridTemplate has the area).
  // For other compositions, only emit grid-area if grid-template-areas is
  // defined — otherwise CSS implicit-grid pushes the card outside the
  // explicit grid (the "card stuck in bottom-right" bug).
  const usesNamedAreas = /grid-template-areas/.test(gridTemplate);

  const tilesHtml = cards.map((card, i) => {
    const fieldBase = `cards.${i}.content`;
    if (card.slot === 'hero') return renderHeroZone(card.content, t, fieldBase);
    if (card.slot === 'title') return renderTitleZone(card.content, t, fieldBase);
    // card-group = sub-grid of cards filling one outer slot (split/stack-chart).
    // Dispatched here so the outer slot's usesNamedAreas context is available.
    if (card.content.role === 'card-group') {
      return renderCardGroup(card.content, card.slot, fieldBase, t, theme, radius, cardSurface, usesNamedAreas);
    }
    const isLarge = largeSet.has(card.slot);
    return renderCard(card, i, cards.length, isLarge, composition, t, theme, radius, cardSurface, usesNamedAreas);
  }).join('\n');

  // Sidelined cards are preserved across shrink-swaps but not rendered. Show
  // a small corner badge so the user knows hidden content exists and can
  // recover it by swapping to a composition with more slots. The native
  // title tooltip lists what's hidden so the user knows whether to bother.
  // Editor-only — exports (PDF/PPTX) skip it via `isImport`.
  const sidelinedCount = data.sidelined?.length ?? 0;
  const sidelinedLabels = (data.sidelined ?? [])
    .map((c, i) => {
      const zones = 'title' in c.content ? c.content.title : undefined;
      return zones ? `${i + 1}. ${zones}` : `${i + 1}. [${c.content.role}]`;
    })
    .join('\n');
  const sidelinedTip = `Hidden cards (restore by switching to a composition with more slots):\n${sidelinedLabels}`;
  const sidelinedBadge = sidelinedCount > 0 && !isImport
    ? `<div title="${esc(sidelinedTip)}" style="position:absolute; bottom:12px; right:12px; font-size:11px; padding:4px 8px; border-radius:10px; background:${t.bg}; color:${ensureTextContrast(t.muted, t.bg)}; border:1px solid ${t.border}; opacity:0.7; pointer-events:auto; user-select:none;">${sidelinedCount} hidden</div>`
    : '';

  return `
<div class="${themeClass(theme)}" style="position:relative; display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${SAFE_INSET.y}px ${SAFE_INSET.x}px;">
  ${data.title ? `<h2 ${df('title')} style="font-size:${autoFontSize(data.title, 30, 20)}px; color:${ensureTextContrast(t.primary, t.bg)}; margin-bottom:20px; ${wb} ${headlineStyle(t)}">${escMd(data.title)}</h2>` : ''}
  <div style="flex:1; min-height:0; min-width:0; display:grid; ${gridTemplate} gap:${gap}px;">
    ${tilesHtml}
  </div>
  ${sidelinedBadge}
</div>`;
}
