// ============================================================================
// Lasca — Structural Diagram Renderers (v4)
// flowchart, funnel, pyramid, steps, matrix, versus, venn, bullseye, cycle
// ============================================================================

import type { ThemeConfig, Theme, GroupLabel } from './types';
import type {
  FlowchartData, FunnelData, PyramidData, StepsData,
  MatrixData, VersusData, VennData, BullseyeData, CycleData,
  HubSpokeData,
} from './types';
import {
  esc, escMd, df, labelColor, themeClass, baseStyle, headlineStyle,
  autoFontSize, IMPORT_WORD_BREAK, ensureTextContrast,
} from './renderSlide';

/** Inline style fragment added to draggable diagram elements so Canvas.tsx
 *  can reposition them via style.left / style.top during drag. */
const DRAGGABLE = 'position:relative;';

/** Pick an SVG font-size (in viewBox units) that keeps the label within `maxPx`
 *  of horizontal space, clamped to `[minFont, maxFont]`. CJK glyphs get ratio 1.0,
 *  Latin ~0.58 (same numbers renderCharts.ts::autoCategoryFontSize uses). SVG
 *  `<text>` never wraps, so this is the only line-of-defense against Venn/
 *  Bullseye/Cycle/HubSpoke labels bleeding outside their circles. */
function fitSvgText(label: string, maxPx: number, minFont: number, maxFont: number): number {
  const text = label || '';
  if (!text) return maxFont;
  const isCjk = /[一-鿿぀-ヿ가-힯]/.test(text);
  const charRatio = isCjk ? 1.0 : 0.58;
  const needed = maxPx / (text.length * charRatio);
  return Math.max(minFont, Math.min(maxFont, Math.floor(needed)));
}

/** Shared diagram footnote (§4.2-analog source/caption line). Centered under
 *  the structure; aligns with matrix/versus/hub-spoke's existing rendering so
 *  all 10 diagrams render footnote identically. */
function diagramFootnote(fn: string | undefined, t: ThemeConfig): string {
  if (!fn) return '';
  return `<p ${df('footnote')} style="font-size:12px; color:${t.muted}; margin-top:16px; text-align:center;">${esc(fn)}</p>`;
}

/** Vertical "[" bracket overlay spanning `[fromIndex..toIndex]` of an n-item
 *  stack. Absolutely positioned inside a `position:relative` parent sized to
 *  the stack; parent must reserve left padding (≥64px) so the bracket + label
 *  don't clip the items. Each item is assumed to occupy 1/totalItems of the
 *  parent's height. */
function renderGroupBracket(gl: GroupLabel, totalItems: number, t: ThemeConfig): string {
  const from = Math.max(0, Math.min(gl.fromIndex, totalItems - 1));
  const to = Math.max(from, Math.min(gl.toIndex, totalItems - 1));
  const topPct = (from / totalItems) * 100;
  const botPct = ((to + 1) / totalItems) * 100;
  const color = t.accent;
  // CJK chars don't rotate inside `writing-mode:vertical-rl`, so adding
  // `rotate(180deg)` (the Latin "book-spine" trick) flips every glyph upside
  // down and renders garbled. For CJK text, use natural top-to-bottom stacking
  // without rotation; keep the letter-spacing/uppercase treatment Latin-only.
  const isCjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(gl.text || '');
  const labelStyle = isCjk
    ? `writing-mode:vertical-rl; font-size:12px; font-weight:600; color:${color}; white-space:nowrap;`
    : `writing-mode:vertical-rl; transform:rotate(180deg); font-size:11px; font-weight:700; color:${color}; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap;`;
  return `
    <div aria-hidden="true" style="position:absolute; left:0; top:${topPct}%; bottom:${100 - botPct}%; width:56px; display:flex; align-items:center; gap:6px; pointer-events:none;">
      <svg width="16" height="100%" viewBox="0 0 16 100" preserveAspectRatio="none" style="flex-shrink:0;">
        <path d="M14 1 L4 1 L4 99 L14 99" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
      </svg>
      <span ${df('groupLabel.text')} style="${labelStyle}">${esc(gl.text)}</span>
    </div>`;
}

// ---------------------------------------------------------------------------
// 1. Flowchart — boxes connected by arrows
// ---------------------------------------------------------------------------

export function renderFlowchart(
  data: FlowchartData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const steps = data.steps || [];
  const isVert = data.direction === 'vertical';
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;
  const radius = t.radiusCard ?? 12;

  const arrow = (color: string, label: string | undefined, idx: number) => {
    const labelHtml = label
      ? `<span ${df(`steps.${idx}.transitionLabel`)} style="font-size:11px; color:${t.accent}; font-weight:600; letter-spacing:0.02em; white-space:nowrap; ${IMPORT_WORD_BREAK}">${escMd(label)}</span>`
      : '';
    return isVert
      ? `<div style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:2px 0;">
           <svg width="20" height="24" viewBox="0 0 20 24"><path d="M10 0 L10 16 M4 12 L10 20 L16 12" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
           ${labelHtml}
         </div>`
      : `<div style="display:flex; flex-direction:column; align-items:center; gap:4px; padding:0 2px;">
           <svg width="28" height="20" viewBox="0 0 28 20"><path d="M0 10 L18 10 M14 4 L22 10 L14 16" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
           ${labelHtml}
         </div>`;
  };

  const boxes = steps.map((step, i) => {
    const baseColor = labelColor(i, t);
    const recommended = step.highlight === 'recommended';
    const borderColor = recommended ? t.accent : baseColor;
    const num = String(i + 1).padStart(2, '0');
    const numBadge = `<span aria-hidden="true" style="display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:22px; padding:0 6px; border-radius:11px; background:${borderColor}; color:${ensureTextContrast('#fff', borderColor)}; font-size:11px; font-weight:700; letter-spacing:0.04em; flex-shrink:0;">${num}</span>`;
    const star = recommended
      ? `<span aria-hidden="true" style="color:${t.accent}; font-size:14px; margin-left:6px; flex-shrink:0;">★</span>`
      : '';
    const inner = isVert
      ? `<div style="display:flex; flex-direction:column; align-items:center; gap:8px;">${numBadge}<span ${df(`steps.${i}.text`)} style="${IMPORT_WORD_BREAK}">${escMd(step.text)}${star}</span></div>`
      : `<div style="display:flex; align-items:center; gap:10px;">${numBadge}<span ${df(`steps.${i}.text`)} style="flex:1; min-width:0; ${IMPORT_WORD_BREAK}">${escMd(step.text)}${star}</span></div>`;
    const dashed = step.style === 'dashed';
    const borderStyle = dashed
      ? `border:2px dashed ${borderColor};`
      : `border-left:4px solid ${borderColor};`;
    const bg = dashed ? 'transparent' : t.cardBg;
    const shadow = dashed ? 'none' : (t.cardSurface ?? t.cardShadow);
    const box = `<div style="${DRAGGABLE} background:${bg}; border-radius:${radius}px; padding:16px 20px; box-shadow:${shadow}; ${borderStyle} font-size:14px; color:${t.text}; ${isVert ? 'text-align:center;' : ''}">${inner}</div>`;
    const annotationHtml = step.annotation
      ? `<div ${df(`steps.${i}.annotation`)} style="font-size:11px; color:${t.muted}; ${isVert ? 'text-align:center;' : ''} ${IMPORT_WORD_BREAK}">${escMd(step.annotation)}</div>`
      : '';
    const cellStyle = isVert
      ? 'display:flex; flex-direction:column; gap:6px; align-items:stretch;'
      : 'flex:1; min-width:0; display:flex; flex-direction:column; gap:6px;';
    const cell = `<div style="${cellStyle}">${box}${annotationHtml}</div>`;
    if (i < steps.length - 1) return cell + arrow(t.muted, step.transitionLabel, i);
    return cell;
  }).join('');

  const dir = isVert ? 'flex-direction:column; align-items:stretch;' : 'flex-direction:row; align-items:center;';

  // Group bracket only makes sense on vertical flowcharts (where items stack).
  const hasGroupLabel = isVert && !!data.groupLabel;
  const leftPad = hasGroupLabel ? 64 : 0;
  const bracket = hasGroupLabel ? renderGroupBracket(data.groupLabel!, steps.length || 1, t) : '';

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:24px; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; ${dir} justify-content:center; gap:0; position:relative; padding-left:${leftPad}px;">
    ${bracket}
    ${boxes}
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 2. Funnel — tapering sections top to bottom
// ---------------------------------------------------------------------------

export function renderFunnel(
  data: FunnelData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const n = items.length || 1;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  const sections = items.map((item, i) => {
    const color = labelColor(i, t);
    const txtColor = ensureTextContrast('#fff', color);
    const topW = 100 - (i / n) * 60;       // 100% → 40%
    const botW = 100 - ((i + 1) / n) * 60;
    const topL = (100 - topW) / 2;
    const topR = topL + topW;
    const botL = (100 - botW) / 2;
    const botR = botL + botW;
    return `<div style="position:relative; flex:1; min-height:0;">
      <div style="position:absolute; inset:0; clip-path:polygon(${topL}% 0%, ${topR}% 0%, ${botR}% 100%, ${botL}% 100%); background:${color}; opacity:0.85;"></div>
      <div ${df(`items.${i}.text`)} style="position:relative; z-index:1; display:flex; align-items:center; justify-content:center; height:100%; font-size:14px; color:${txtColor}; font-weight:600; text-align:center; padding:0 20%; ${IMPORT_WORD_BREAK}">${escMd(item.text)}</div>
    </div>`;
  }).join('');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:24px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; flex-direction:column; gap:4px; max-width:680px; margin:0 auto; width:100%;">
    ${sections}
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 3. Pyramid — layered triangle (top=smallest, bottom=widest)
// ---------------------------------------------------------------------------

export function renderPyramid(
  data: PyramidData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const n = items.length || 1;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  // Feature detection: only enable columns when actually used, so decks
  // without annotations render pixel-identical to pre-C1.
  const anySidenote = items.some(it => !!it.sidenote);
  const hasGroupLabel = !!data.groupLabel;
  const leftPad = hasGroupLabel ? 64 : 0;
  const sidenoteW = anySidenote ? 150 : 0;

  const layers = items.map((item, i) => {
    const color = labelColor(i, t);
    const txtColor = ensureTextContrast('#fff', color);
    // Top = narrow, bottom = wide (opposite of funnel)
    const topW = 20 + (i / n) * 70;        // 20% → 90%
    const botW = 20 + ((i + 1) / n) * 70;
    const topL = (100 - topW) / 2;
    const topR = topL + topW;
    const botL = (100 - botW) / 2;
    const botR = botL + botW;
    const dashed = item.style === 'dashed';
    // Dashed = 未成熟/假设/摩擦. Keep polygon clip for layout parity; dim the
    // fill and overlay a dashed SVG outline at the same geometry so the slice
    // still reads as "this layer but conditional".
    const fillOpacity = dashed ? 0.22 : 0.85;
    const dashedOverlay = dashed
      ? `<svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; pointer-events:none;"><polygon points="${topL},0 ${topR},0 ${botR},100 ${botL},100" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="4,3" vector-effect="non-scaling-stroke"/></svg>`
      : '';
    const slice = `<div style="position:relative; flex:1; min-height:0;">
      <div style="position:absolute; inset:0; clip-path:polygon(${topL}% 0%, ${topR}% 0%, ${botR}% 100%, ${botL}% 100%); background:${color}; opacity:${fillOpacity};"></div>
      ${dashedOverlay}
      <div ${df(`items.${i}.text`)} style="position:relative; z-index:1; display:flex; align-items:center; justify-content:center; height:100%; font-size:14px; color:${dashed ? t.text : txtColor}; font-weight:600; text-align:center; padding:0 20%; ${IMPORT_WORD_BREAK}">${escMd(item.text)}</div>
    </div>`;

    if (!anySidenote) return slice;
    const sidenoteHtml = item.sidenote
      ? `<div ${df(`items.${i}.sidenote`)} style="width:${sidenoteW}px; flex-shrink:0; font-size:12px; color:${t.muted}; line-height:1.4; padding-left:12px; border-left:2px solid ${color}; ${IMPORT_WORD_BREAK}">${escMd(item.sidenote)}</div>`
      : `<div style="width:${sidenoteW}px; flex-shrink:0;"></div>`;
    return `<div style="display:flex; align-items:center; gap:14px; flex:1; min-height:0;">${slice}${sidenoteHtml}</div>`;
  }).join('');

  const bracket = hasGroupLabel ? renderGroupBracket(data.groupLabel!, n, t) : '';

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:24px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; flex-direction:column; gap:4px; max-width:${680 + sidenoteW + (anySidenote ? 14 : 0) + leftPad}px; margin:0 auto; width:100%; position:relative; padding-left:${leftPad}px;">
    ${bracket}
    ${layers}
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 4. Steps — numbered circles + text
// ---------------------------------------------------------------------------

export function renderSteps(
  data: StepsData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  // Dense mode shrinks the chrome (circle / connector / spacing) so 5+ steps
  // fit. 4-item lists DON'T trigger dense — with dense the connector collapses
  // to 10px and the whole timeline gets squeezed into a ~40% band centered
  // vertically, leaving huge top/bottom gaps below the title (the
  // image-11 bug). Readability beats density; trigger only at 5+.
  const dense = items.length >= 5;
  const hasTransitionLabel = items.some(it => it.transitionLabel);
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : (dense ? 24 : 30);
  const titleMb = dense ? 14 : 24;
  // Bump connector height when transitionLabels exist so the mini labels
  // have vertical room instead of colliding with the next step's circle.
  const connectorH = dense
    ? (hasTransitionLabel ? 22 : 10)
    : (hasTransitionLabel ? 36 : 24);
  const circleSize = dense ? 32 : 40;
  const circleFont = dense ? 13 : 16;
  const connectorMl = Math.round(circleSize / 2 - 1);

  const anySidenote = items.some(it => !!it.sidenote);
  const hasGroupLabel = !!data.groupLabel;
  const leftPad = hasGroupLabel ? 64 : 0;
  const sidenoteW = anySidenote ? 160 : 0;

  const stepsHtml = items.map((item, i) => {
    const color = labelColor(i, t);
    const nextColor = i < items.length - 1 ? labelColor(i + 1, t) : color;
    // Connector = subtle gradient between this step's color and the next, so
    // the eye traces a colored path instead of a dull gray bar.
    const transitionHtml = item.transitionLabel && i < items.length - 1
      ? `<span ${df(`items.${i}.transitionLabel`)} style="position:absolute; left:${connectorMl + 14}px; top:50%; transform:translateY(-50%); font-size:11px; color:${t.accent}; font-weight:600; letter-spacing:0.03em; white-space:nowrap; ${IMPORT_WORD_BREAK}">${escMd(item.transitionLabel)}</span>`
      : '';
    const connector = i < items.length - 1
      ? `<div aria-hidden="true" style="position:relative; height:${connectorH}px;">
          <div style="width:3px; height:100%; background:linear-gradient(to bottom, ${color}, ${nextColor}); margin-left:${connectorMl}px; opacity:0.55; border-radius:2px;"></div>
          ${transitionHtml}
        </div>`
      : '';
    const sidenoteCol = anySidenote
      ? (item.sidenote
          ? `<div ${df(`items.${i}.sidenote`)} style="width:${sidenoteW}px; flex-shrink:0; font-size:12px; color:${t.muted}; line-height:1.45; padding-left:12px; border-left:2px solid ${color}; ${IMPORT_WORD_BREAK}">${escMd(item.sidenote)}</div>`
          : `<div style="width:${sidenoteW}px; flex-shrink:0;"></div>`)
      : '';
    return `
      <div style="display:flex; gap:16px; align-items:flex-start;">
        <div style="width:${circleSize}px; height:${circleSize}px; border-radius:50%; background:${color}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <span ${df(`items.${i}.label`)} style="font-size:${circleFont}px; color:#fff; font-weight:700;">${esc(item.label)}</span>
        </div>
        <div style="flex:1; padding-top:4px; min-width:0;">
          <div ${df(`items.${i}.text`)} style="font-size:16px; color:${t.text}; font-weight:600; ${IMPORT_WORD_BREAK}">${escMd(item.text)}</div>
          ${item.desc ? `<div ${df(`items.${i}.desc`)} style="font-size:13px; color:${t.muted}; margin-top:4px; ${IMPORT_WORD_BREAK}">${escMd(item.desc)}</div>` : ''}
        </div>
        ${sidenoteCol}
      </div>
      ${connector}`;
  }).join('');

  const bracket = hasGroupLabel ? renderGroupBracket(data.groupLabel!, items.length || 1, t) : '';
  const maxW = 700 + sidenoteW + (anySidenote ? 16 : 0) + leftPad;

  // safe-center: degrades to flex-start when the items collectively overflow
  // the flex:1 region — without it `center` pushes the first item above the
  // top edge and clips the last (the Image-5 bug).
  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px; overflow:hidden;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:${titleMb}px; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; min-height:0; display:flex; flex-direction:column; gap:0; justify-content:safe center; max-width:${maxW}px; margin:0 auto; width:100%; overflow:hidden; position:relative; padding-left:${leftPad}px;">
    ${bracket}
    ${stepsHtml}
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 5. Matrix (2×2 quadrant)
// ---------------------------------------------------------------------------

export function renderMatrix(
  data: MatrixData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;
  const radius = t.radiusCard ?? 12;
  const qStyle = `position:relative; display:flex; align-items:center; justify-content:center; text-align:center; font-size:14px; color:${t.text}; padding:20px; ${IMPORT_WORD_BREAK}`;
  // Quadrant tint: reading-order (topLeft=0, topRight=1, bottomLeft=2, bottomRight=3)
  // with labelColor rotation for subtle semantic differentiation. Opacity low so
  // text on tinted bg still hits WCAG AA.
  // Tint = cardBg + labelColor at ~8% alpha via inset shadow. labelColor always
  // returns hex from ThemeConfig (primary/accent/green/muted/dark or paletteOrdinal);
  // appending "14" = alpha 0x14/0xFF ≈ 8%. Safe because non-hex values only
  // appear in `bg`, never in the ordinal palette.
  const tint = (i: number) => {
    const c = labelColor(i, t);
    return `background:${t.cardBg}; box-shadow:inset 0 0 0 9999px ${c}14;`;
  };

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:20px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; min-height:0; display:flex; align-items:center; justify-content:center;">
    <div style="position:relative; height:100%; aspect-ratio:1; max-width:560px; max-height:560px;">
      <!-- Y-axis label -->
      <div ${df('yAxis')} style="position:absolute; left:-40px; top:50%; transform:translateY(-50%) rotate(-90deg); font-size:12px; color:${t.muted}; white-space:nowrap; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;">${esc(data.yAxis)}</div>
      <!-- X-axis label -->
      <div ${df('xAxis')} style="position:absolute; bottom:-28px; left:50%; transform:translateX(-50%); font-size:12px; color:${t.muted}; white-space:nowrap; font-weight:600; letter-spacing:0.06em; text-transform:uppercase;">${esc(data.xAxis)}</div>
      <!-- Quadrant grid -->
      <div style="position:relative; display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; width:100%; height:100%; gap:0; border-radius:${radius}px; overflow:hidden; box-shadow:${t.cardSurface ?? t.cardShadow};">
        <div ${df('topLeft')} style="${tint(0)} ${qStyle}">${escMd(data.topLeft)}</div>
        <div ${df('topRight')} style="${tint(1)} ${qStyle}">${escMd(data.topRight)}</div>
        <div ${df('bottomLeft')} style="${tint(2)} ${qStyle}">${escMd(data.bottomLeft)}</div>
        <div ${df('bottomRight')} style="${tint(3)} ${qStyle}">${escMd(data.bottomRight)}</div>
        <!-- Center cross (vertical + horizontal) -->
        <div aria-hidden="true" style="position:absolute; left:50%; top:0; bottom:0; width:1px; background:${t.border}; transform:translateX(-0.5px); pointer-events:none;"></div>
        <div aria-hidden="true" style="position:absolute; top:50%; left:0; right:0; height:1px; background:${t.border}; transform:translateY(-0.5px); pointer-events:none;"></div>
      </div>
      <!-- Axis arrows (visual anchors at arrow heads) -->
      <div aria-hidden="true" style="position:absolute; left:-8px; top:50%; transform:translate(-100%, -50%); width:0; height:0; border-right:6px solid ${t.muted}; border-top:4px solid transparent; border-bottom:4px solid transparent; opacity:0.5;"></div>
      <div aria-hidden="true" style="position:absolute; bottom:-8px; left:50%; transform:translate(-50%, 100%); width:0; height:0; border-top:6px solid ${t.muted}; border-left:4px solid transparent; border-right:4px solid transparent; opacity:0.5;"></div>
    </div>
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 6. Versus — left vs right comparison
// ---------------------------------------------------------------------------

export function renderVersus(
  data: VersusData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;
  const left = data.left || { heading: '', points: [] };
  const right = data.right || { heading: '', points: [] };
  const radius = t.radiusCard ?? 12;
  const maxBullets = Math.max((left.points || []).length, (right.points || []).length);
  const dense = maxBullets >= 5;
  const bulletFs = dense ? 13 : 14.5;
  const bulletMb = dense ? 6 : 8;
  const bulletLh = dense ? 1.4 : 1.5;
  const cardPad = dense ? '14px 18px' : '18px 22px';
  const headingFs = dense ? 16 : 18;
  const headingMb = dense ? 8 : 12;

  const renderSide = (side: typeof left, prefix: string, sideColor: string, kicker: string) => {
    const pts = (side.points || []).map((p, i) =>
      `<div style="display:flex; align-items:baseline; gap:10px; margin-bottom:${bulletMb}px;">
        <span aria-hidden="true" style="width:3px; height:12px; border-radius:2px; background:${sideColor}; flex-shrink:0; transform:translateY(2px);"></span>
        <span ${df(`${prefix}.points.${i}`)} style="font-size:${bulletFs}px; color:${t.text}; line-height:${bulletLh}; ${IMPORT_WORD_BREAK}">${escMd(p)}</span>
      </div>`
    ).join('');
    return `
      <div style="flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; background:${t.cardBg}; border-radius:${radius}px; padding:${cardPad}; box-shadow:${t.cardSurface ?? t.cardShadow}; border-top:3px solid ${sideColor}; overflow:hidden;">
        <span aria-hidden="true" style="display:inline-block; font-size:10.5px; font-weight:700; color:${sideColor}; letter-spacing:0.12em; text-transform:uppercase; margin-bottom:4px;">${kicker}</span>
        <h3 ${df(`${prefix}.heading`)} style="font-size:${headingFs}px; color:${t.primary}; margin-bottom:${headingMb}px; ${headlineStyle(t)}">${escMd(side.heading)}</h3>
        <div style="flex:1; min-height:0; overflow:hidden;">${pts}</div>
      </div>`;
  };

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${dense ? '24px 40px' : '32px 48px'};">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:${dense ? 16 : 22}px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; min-height:0; display:flex; align-items:stretch; gap:20px; overflow:hidden;">
    ${renderSide(left, 'left', t.accent, 'Side A')}
    <div style="width:56px; align-self:center; height:56px; border-radius:50%; background:${t.accent}; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:${t.cardSurface ?? t.cardShadow};">
      <span style="font-size:16px; color:${ensureTextContrast('#fff', t.accent)}; font-weight:800; letter-spacing:0.08em;">VS</span>
    </div>
    ${renderSide(right, 'right', t.primary, 'Side B')}
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 7. Venn — 2-3 overlapping circles (SVG + HTML overlay)
// ---------------------------------------------------------------------------

export function renderVenn(
  data: VennData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const n = Math.min(items.length, 3) || 2;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  const svgW = 800, svgH = 380;
  const r = n === 2 ? 140 : 120;

  // Circle centers
  const centers: [number, number][] = n === 2
    ? [[svgW / 2 - 80, svgH / 2], [svgW / 2 + 80, svgH / 2]]
    : [[svgW / 2, svgH / 2 - 60], [svgW / 2 - 80, svgH / 2 + 50], [svgW / 2 + 80, svgH / 2 + 50]];

  const circles = centers.slice(0, n).map((c, i) => {
    const color = labelColor(i, t);
    return `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2"/>`;
  }).join('\n');

  // Label positions: push each circle's label into its unique (non-overlap)
  // zone, not near the overlap seam. Previous offsets kept labels tight to the
  // center — 3-circle labels crowded near the triple-intersection.
  const labelOffsets: [number, number][] = n === 2
    ? [[-80, 0], [80, 0]]
    : [[0, -75], [-68, 42], [68, 42]];

  const labels = centers.slice(0, n).map((c, i) => {
    const x = c[0] + labelOffsets[i][0];
    const y = c[1] + labelOffsets[i][1];
    const text = items[i]?.text || '';
    const fs = fitSvgText(text, 160, 10, 18);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${fs}" font-weight="600" fill="${t.text}" font-family="inherit" data-field="items.${i}.text">${esc(text)}</text>`;
  }).join('\n');

  // Overlap label at center of all circles
  const ocx = centers.slice(0, n).reduce((s, c) => s + c[0], 0) / n;
  const ocy = centers.slice(0, n).reduce((s, c) => s + c[1], 0) / n;
  const overlapLabel = data.overlap
    ? `<text x="${ocx}" y="${ocy}" text-anchor="middle" dominant-baseline="middle" font-size="${fitSvgText(data.overlap, 110, 8, 14)}" font-weight="700" fill="${t.primary}" font-family="inherit" data-field="overlap">${esc(data.overlap)}</text>`
    : '';

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:16px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${circles}
      ${labels}
      ${overlapLabel}
    </svg>
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 8. Bullseye — concentric rings (items[0] = innermost)
// ---------------------------------------------------------------------------

export function renderBullseye(
  data: BullseyeData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const n = items.length || 1;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  const svgW = 800, svgH = 380;
  const cx = svgW / 2, cy = svgH / 2;
  const maxR = 170;

  // Draw from outermost (last) to innermost (first) so inner paints on top
  const rings = [...items].reverse().map((item, revI) => {
    const i = n - 1 - revI; // original index (0=inner)
    const color = labelColor(i, t);
    const r = maxR * (n - i) / n;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity="${0.2 + i * 0.12}"/>`;
  }).join('\n');

  // Labels: bullseye is read center-outward (i=0 = innermost bullseye).
  // Place inner label dead-center; distribute outer labels around the ring at
  // even angles so 5+ labels never collide (old algorithm used fixed 0.35π step
  // which crowded into one semicircle).
  const outerCount = Math.max(n - 1, 1);
  const labels = items.map((item, i) => {
    if (i === 0) {
      const innerFs = fitSvgText(item.text, 120, 10, 16);
      return `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${innerFs}" font-weight="700" fill="${t.primary}" font-family="inherit" data-field="items.${i}.text">${escMd(item.text)}</text>`;
    }
    const innerR = maxR * (n - i) / n;
    const outerR = maxR * (n - i + 1) / n;
    const midR = (innerR + outerR) / 2;
    // Start at top (-π/2), distribute evenly, alternate around circle.
    const angle = -Math.PI / 2 + ((i - 1) * 2 * Math.PI) / outerCount;
    const lx = cx + midR * Math.cos(angle);
    const ly = cy + midR * Math.sin(angle);
    const outerFs = fitSvgText(item.text, 110, 9, 14);
    return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="${outerFs}" font-weight="600" fill="${t.text}" font-family="inherit" data-field="items.${i}.text">${escMd(item.text)}</text>`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:16px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${rings}
      ${labels}
    </svg>
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 9. Cycle — circular process with arrows
// ---------------------------------------------------------------------------

export function renderCycle(
  data: CycleData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const n = items.length || 1;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  const svgW = 800, svgH = 380;
  const cx = svgW / 2, cy = svgH / 2;
  const orbitR = 140;
  const nodeR = 36;

  // Node positions around a circle
  const nodes = items.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + orbitR * Math.cos(angle), y: cy + orbitR * Math.sin(angle) };
  });

  // Curved arrows between consecutive nodes
  const arrows = nodes.map((from, i) => {
    const to = nodes[(i + 1) % n];
    // Control point perpendicular to midpoint, curved outward
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len * 20; // perpendicular offset
    const ny = dx / len * 20;
    const cpx = mx + nx;
    const cpy = my + ny;
    // Shorten path to not overlap nodes
    const shrink = nodeR + 4;
    const fAngle = Math.atan2(cpy - from.y, cpx - from.x);
    const tAngle = Math.atan2(to.y - cpy, to.x - cpx);
    const sx = from.x + shrink * Math.cos(fAngle);
    const sy = from.y + shrink * Math.sin(fAngle);
    const ex = to.x - shrink * Math.cos(tAngle);
    const ey = to.y - shrink * Math.sin(tAngle);
    // Arrowhead
    const aLen = 8;
    const aAngle = Math.atan2(ey - cpy, ex - cpx);
    const a1x = ex - aLen * Math.cos(aAngle - 0.4);
    const a1y = ey - aLen * Math.sin(aAngle - 0.4);
    const a2x = ex - aLen * Math.cos(aAngle + 0.4);
    const a2y = ey - aLen * Math.sin(aAngle + 0.4);
    // Transition label sits just outside the arc's apex, along the same
    // outward normal as the control point but further out so it clears the
    // curve without overlapping neighbouring nodes.
    const transitionLabel = items[i]?.transitionLabel;
    const labelScale = 2.0; // label at 2× the arc's outward-normal offset
    const lx = mx + nx * labelScale;
    const ly = my + ny * labelScale;
    const tLabelSvg = transitionLabel
      ? `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="10" font-weight="600" fill="${t.accent}" font-family="inherit" data-field="items.${i}.transitionLabel">${esc(transitionLabel)}</text>`
      : '';
    return `<path d="M${sx},${sy} Q${cpx},${cpy} ${ex},${ey}" fill="none" stroke="${t.muted}" stroke-width="1.8"/>
            <polygon points="${ex},${ey} ${a1x},${a1y} ${a2x},${a2y}" fill="${t.muted}"/>
            ${tLabelSvg}`;
  }).join('\n');

  // Node circles + labels. Each node now carries an ordinal eyebrow (01, 02...)
  // so viewers can follow the sequence; the label sits slightly below center.
  const nodesSvg = nodes.map((pos, i) => {
    const color = labelColor(i, t);
    const num = String(i + 1).padStart(2, '0');
    // Sidenote sits radially outward from this node, outside the orbit.
    const sidenote = items[i]?.sidenote;
    let sidenoteSvg = '';
    if (sidenote) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const sR = orbitR + nodeR + 14;
      const sx = cx + sR * Math.cos(angle);
      const sy = cy + sR * Math.sin(angle);
      // Anchor based on quadrant so text leans away from the node.
      const anchor = Math.abs(Math.cos(angle)) < 0.25
        ? 'middle'
        : (Math.cos(angle) > 0 ? 'start' : 'end');
      sidenoteSvg = `<text x="${sx}" y="${sy}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" font-style="italic" fill="${t.muted}" font-family="inherit" data-field="items.${i}.sidenote">${esc(sidenote)}</text>`;
    }
    const nodeText = items[i]?.text || '';
    const nodeFs = fitSvgText(nodeText, 64, 9, 14);
    return `
      <circle cx="${pos.x}" cy="${pos.y}" r="${nodeR}" fill="${color}" fill-opacity="0.15" stroke="${color}" stroke-width="2"/>
      <text x="${pos.x}" y="${pos.y - 7}" text-anchor="middle" dominant-baseline="middle" font-size="9" font-weight="700" fill="${color}" font-family="inherit" letter-spacing="0.08em">${num}</text>
      <text x="${pos.x}" y="${pos.y + 9}" text-anchor="middle" dominant-baseline="middle" font-size="${nodeFs}" font-weight="600" fill="${t.text}" font-family="inherit" data-field="items.${i}.text">${esc(nodeText)}</text>
      ${sidenoteSvg}`;
  }).join('\n');

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:16px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${arrows}
      ${nodesSvg}
    </svg>
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}

// ---------------------------------------------------------------------------
// 10. Hub & Spoke — central concept with radiating connections
// ---------------------------------------------------------------------------

export function renderHubSpoke(
  data: HubSpokeData, t: ThemeConfig, theme: Theme,
  _tw: number, _th: number, isImport = false,
): string {
  const spokes = data.spokes || [];
  const n = Math.min(spokes.length, 8) || 4;
  const titlePx = isImport ? autoFontSize(data.title, 30, 20) : 30;

  const svgW = 800, svgH = 400;
  const cx = svgW / 2, cy = svgH / 2;
  const hubR = 56;
  const orbitR = 160;
  const spokeR = 38;

  // Spoke positions evenly distributed around center
  const spokePositions = spokes.slice(0, n).map((_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + orbitR * Math.cos(angle), y: cy + orbitR * Math.sin(angle) };
  });

  // Connector lines from hub to each spoke.
  // stroke = t.muted + opacity vs. t.border: border is near-invisible in dark
  // themes (background is close to it), muted + 0.5 opacity reads in both.
  const lines = spokePositions.map(pos => {
    const dx = pos.x - cx, dy = pos.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy);
    const sx = cx + (hubR + 2) * dx / len;
    const sy = cy + (hubR + 2) * dy / len;
    const ex = pos.x - (spokeR + 2) * dx / len;
    const ey = pos.y - (spokeR + 2) * dy / len;
    return `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${t.muted}" stroke-opacity="0.55" stroke-width="1.8" stroke-dasharray="4,4"/>`;
  }).join('\n');

  // Spoke nodes
  // Desc / sidenote labels use <foreignObject> with an HTML <div> so long
  // multilingual text wraps. SVG <text> never wraps, so 30+ char Chinese
  // descs bled horizontally and overlapped the hub on side spokes. Width is
  // capped at 180px; labels sit below the circle or nudge outward on side
  // spokes (angle near 0 / π) to add breathing room from the hub center.
  const foWidth = 180;
  const spokeNodes = spokePositions.map((pos, i) => {
    const color = labelColor(i, t);
    const spoke = spokes[i];
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    // When a spoke sits near the hub's vertical midline (angle ≈ ±π/2), its
    // text would crowd the hub center horizontally even after wrapping. Push
    // those labels radially outward instead of straight down.
    const isSideSpoke = Math.abs(Math.sin(angle)) < 0.45;
    const descYOffset = isSideSpoke ? 2 : spokeR + 8;
    const descY = pos.y + descYOffset;
    const descLabel = spoke.desc
      ? `<foreignObject x="${pos.x - foWidth / 2}" y="${descY}" width="${foWidth}" height="80" data-field="spokes.${i}.desc">
           <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:11.5px; line-height:1.35; color:${t.muted}; font-family:inherit; text-align:center; word-wrap:break-word; overflow-wrap:break-word;">${esc(spoke.desc)}</div>
         </foreignObject>`
      : '';
    const sidenoteY = descY + (spoke.desc ? 38 : 0);
    const sidenoteLabel = spoke.sidenote
      ? `<foreignObject x="${pos.x - foWidth / 2}" y="${sidenoteY}" width="${foWidth}" height="32" data-field="spokes.${i}.sidenote">
           <div xmlns="http://www.w3.org/1999/xhtml" style="font-size:10px; font-style:italic; color:${t.accent}; font-family:inherit; text-align:center; line-height:1.3; word-wrap:break-word; overflow-wrap:break-word;">${esc(spoke.sidenote)}</div>
         </foreignObject>`
      : '';
    const spokeFs = fitSvgText(spoke.text, 68, 9, 14);
    return `
      <circle cx="${pos.x}" cy="${pos.y}" r="${spokeR}" fill="${t.cardBg}" stroke="${color}" stroke-width="2"/>
      <text x="${pos.x}" y="${pos.y}" text-anchor="middle" dominant-baseline="middle" font-size="${spokeFs}" font-weight="600" fill="${t.text}" font-family="inherit" data-field="spokes.${i}.text">${esc(spoke.text)}</text>
      ${descLabel}
      ${sidenoteLabel}`;
  }).join('\n');

  // Central hub
  const hubFs = fitSvgText(data.center, 100, 10, 16);
  const hub = `
    <circle cx="${cx}" cy="${cy}" r="${hubR}" fill="${t.primary}" stroke="${t.primary}" stroke-width="0"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-size="${hubFs}" font-weight="700" fill="#fff" font-family="inherit" data-field="center">${esc(data.center)}</text>`;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:32px 40px;">
  <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:16px; text-align:center; ${IMPORT_WORD_BREAK} ${headlineStyle(t)}">${escMd(data.title)}</h2>
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 ${svgW} ${svgH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${lines}
      ${spokeNodes}
      ${hub}
    </svg>
  </div>
  ${diagramFootnote(data.footnote, t)}
</div>`;
}
