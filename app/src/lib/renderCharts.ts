// ============================================================================
// Lasca — SVG Data Chart Renderers (v4)
// bar-chart, horizontal-bar-chart, line-chart, pie-chart
// ============================================================================

import type { ThemeConfig, Theme } from './types';
import type {
  BarChartData, HorizontalBarChartData, LineChartData, PieChartData,
  StackedBarChartData, ScatterChartData, DualAxisBarChartData, HeatmapData,
  ChartAnnotation,
} from './types';
import {
  esc, escMd, df, labelColor, themeClass, baseStyle, headlineStyle,
  autoFontSize, IMPORT_WORD_BREAK, ensureTextContrast,
} from './renderSlide';

// ---------------------------------------------------------------------------
// SVG helpers
// ---------------------------------------------------------------------------

/** Compute nice round tick values for an axis. */
function niceScale(maxVal: number, desiredTicks = 5): { max: number; step: number; ticks: number[] } {
  if (maxVal <= 0) return { max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] };
  const rough = maxVal / desiredTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;
  let nice: number;
  if (residual <= 1.5) nice = 1;
  else if (residual <= 3) nice = 2;
  else if (residual <= 7) nice = 5;
  else nice = 10;
  const step = nice * mag;
  const max = Math.ceil(maxVal / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { max, step, ticks };
}

/** Signed variant of `niceScale` — picks tick step from the absolute span and
 *  snaps both ends so a zero line is one of the ticks. Used by diverging bars. */
function niceScaleSigned(
  minVal: number, maxVal: number, desiredTicks = 5,
): { min: number; max: number; step: number; ticks: number[] } {
  const lo = Math.min(0, minVal);
  const hi = Math.max(0, maxVal);
  if (lo === 0 && hi === 0) return { min: 0, max: 100, step: 20, ticks: [0, 20, 40, 60, 80, 100] };
  if (lo === 0) {
    const r = niceScale(hi, desiredTicks);
    return { min: 0, max: r.max, step: r.step, ticks: r.ticks };
  }
  if (hi === 0) {
    const r = niceScale(-lo, desiredTicks);
    return { min: -r.max, max: 0, step: r.step, ticks: r.ticks.map(v => -v).reverse() };
  }
  const r = niceScale(hi - lo, desiredTicks);
  const step = r.step;
  const niceMax = Math.ceil(hi / step) * step;
  const niceMin = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: niceMin, max: niceMax, step, ticks };
}

/** Format a value with optional unit for axis labels. */
function fmtVal(v: number, unit?: string): string {
  const s = v >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
    : v >= 1e4 ? (v / 1e3).toFixed(0) + 'k'
    : String(v);
  if (!unit) return s;
  // Single-char units (%, $, €, etc.) sit snug — "4%" not "4 %". Word units
  // (months, mo, pts) get a space so "4months" doesn't mash into one token.
  return unit.length === 1 ? s + unit : s + ' ' + unit;
}

/**
 * Strip composite/verbose units (containing space or slash) before passing to
 * fmtVal for data labels. Keeps simple tokens like %, $, k, mo. Prevents
 * "1.8 % / 10k units" from blowing past the bar width and colliding with
 * neighbours when an LLM hands us a noisy unit string.
 */
function shortUnit(unit?: string): string | undefined {
  if (!unit) return undefined;
  if (unit.length > 4) return undefined;
  if (/[\s/]/.test(unit)) return undefined;
  return unit;
}

/**
 * Pick an X-axis category-label font-size so labels fit the space each bar
 * owns (barW + barGap). Latin chars ≈ 0.55 × fontSize wide; CJK chars ≈ 1.0 ×
 * fontSize wide, so we pick a heuristic-per-char based on whether any label
 * contains CJK. Floors at 16 so nothing ever becomes unreadable — if even 16px
 * can't fit, we accept a little overlap rather than hide the label entirely.
 */
function autoCategoryFontSize(
  labels: string[], slotWidth: number, naturalSize = 32, floorSize = 16,
): number {
  const maxLen = Math.max(...labels.map(l => (l ?? '').length), 1);
  const hasCJK = labels.some(l => /[一-鿿]/.test(l ?? ''));
  const charRatio = hasCJK ? 1.0 : 0.58;
  const fit = Math.floor(slotWidth / (maxLen * charRatio));
  return Math.max(floorSize, Math.min(naturalSize, fit));
}

/**
 * Strip a shared trailing token ("YoY", "%", "MoM") from every label when
 * every label ends with the same whitespace-separated token. Prevents
 * "Median rent YoY / Leased homes YoY / Pending leases YoY" from wasting
 * horizontal space repeating the same suffix on every bar.
 */
function stripSharedSuffix(labels: string[]): { labels: string[]; suffix: string } {
  if (labels.length < 2) return { labels, suffix: '' };
  const tokens = labels.map(l => (l ?? '').trim().split(/\s+/));
  const lasts = tokens.map(t => t[t.length - 1]);
  const common = lasts[0];
  if (!common || common.length < 2) return { labels, suffix: '' };
  if (!lasts.every(t => t === common)) return { labels, suffix: '' };
  // Every label must have at least one OTHER token so stripping doesn't leave empties.
  if (tokens.some(t => t.length < 2)) return { labels, suffix: '' };
  return {
    labels: tokens.map(t => t.slice(0, -1).join(' ')),
    suffix: common,
  };
}

/**
 * SVG horizontal gridlines. Renders at 0.35 opacity so the passed color stays
 * readable on both light (t.border near-white) and dark themes (t.border near
 * panel bg). 宪法 §4.2 rule 5：网格线主题自适应。
 */
function gridLinesSvg(
  ticks: number[], maxVal: number,
  chartX: number, chartW: number, chartY: number, chartH: number,
  color: string,
): string {
  return ticks.map(v => {
    const y = chartY + chartH - (v / maxVal) * chartH;
    return `<line x1="${chartX}" y1="${y}" x2="${chartX + chartW}" y2="${y}" stroke="${color}" stroke-width="0.5" stroke-opacity="0.35" stroke-dasharray="3,3"/>`;
  }).join('\n');
}

/** SVG vertical gridlines (for horizontal bar chart). */
function vGridLinesSvg(
  ticks: number[], maxVal: number,
  chartX: number, chartW: number, chartY: number, chartH: number,
  color: string,
): string {
  return ticks.map(v => {
    const x = chartX + (v / maxVal) * chartW;
    return `<line x1="${x}" y1="${chartY}" x2="${x}" y2="${chartY + chartH}" stroke="${color}" stroke-width="0.5" stroke-opacity="0.35" stroke-dasharray="3,3"/>`;
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Annotation helpers (宪法 §4.2: reference-line / range-band / callout)
// ---------------------------------------------------------------------------

interface VAxisCtx {
  orientation: 'vertical'; // value axis is vertical (bar / line)
  chartX: number; chartW: number; chartY: number; chartH: number;
  maxVal: number;
  labels: string[]; // category axis labels (items[].label for bar, labels for line)
  indexToX(i: number): number; // returns x coord of category i
}

interface HAxisCtx {
  orientation: 'horizontal'; // value axis is horizontal (horizontal-bar)
  chartX: number; chartW: number; chartY: number; chartH: number;
  maxVal: number;
  /** Minimum of the value axis. Defaults to 0; non-zero only in diverging mode. */
  minVal?: number;
  labels: string[];
  indexToY(i: number): number;
}

type AxisCtx = VAxisCtx | HAxisCtx;

function resolveCategoryIndex(at: number | string, labels: string[]): number {
  if (typeof at === 'number') return Math.max(0, Math.min(labels.length - 1, Math.floor(at)));
  const idx = labels.findIndex(l => l === at);
  return idx < 0 ? 0 : idx;
}

function annotationsSvg(
  annotations: ChartAnnotation[] | undefined,
  axis: AxisCtx,
  t: ThemeConfig,
): string {
  if (!annotations || annotations.length === 0) return '';
  const parts: string[] = [];
  for (const a of annotations) {
    if (a.type === 'reference-line') {
      if (axis.orientation === 'vertical') {
        const y = axis.chartY + axis.chartH - (a.value / axis.maxVal) * axis.chartH;
        parts.push(`<line x1="${axis.chartX}" y1="${y}" x2="${axis.chartX + axis.chartW}" y2="${y}" stroke="${t.primary}" stroke-width="1" stroke-dasharray="4,3" stroke-opacity="0.7"/>`);
        if (a.label) {
          parts.push(`<text x="${axis.chartX + axis.chartW - 4}" y="${y - 4}" text-anchor="end" font-size="13" font-weight="600" fill="${t.primary}" font-family="inherit">${esc(a.label)}</text>`);
        }
      } else {
        const minV = axis.minVal ?? 0;
        const range = axis.maxVal - minV || 1;
        const x = axis.chartX + ((a.value - minV) / range) * axis.chartW;
        parts.push(`<line x1="${x}" y1="${axis.chartY}" x2="${x}" y2="${axis.chartY + axis.chartH}" stroke="${t.primary}" stroke-width="1" stroke-dasharray="4,3" stroke-opacity="0.7"/>`);
        if (a.label) {
          parts.push(`<text x="${x + 4}" y="${axis.chartY + 10}" font-size="13" font-weight="600" fill="${t.primary}" font-family="inherit">${esc(a.label)}</text>`);
        }
      }
    } else if (a.type === 'range-band') {
      const lo = Math.min(a.from, a.to);
      const hi = Math.max(a.from, a.to);
      if (axis.orientation === 'vertical') {
        const yHi = axis.chartY + axis.chartH - (hi / axis.maxVal) * axis.chartH;
        const yLo = axis.chartY + axis.chartH - (lo / axis.maxVal) * axis.chartH;
        parts.push(`<rect x="${axis.chartX}" y="${yHi}" width="${axis.chartW}" height="${yLo - yHi}" fill="${t.accent}" fill-opacity="0.08"/>`);
        if (a.label) {
          parts.push(`<text x="${axis.chartX + 6}" y="${yHi + 11}" font-size="13" fill="${t.muted}" font-family="inherit">${esc(a.label)}</text>`);
        }
      } else {
        const minV = axis.minVal ?? 0;
        const range = axis.maxVal - minV || 1;
        const xLo = axis.chartX + ((lo - minV) / range) * axis.chartW;
        const xHi = axis.chartX + ((hi - minV) / range) * axis.chartW;
        parts.push(`<rect x="${xLo}" y="${axis.chartY}" width="${xHi - xLo}" height="${axis.chartH}" fill="${t.accent}" fill-opacity="0.08"/>`);
        if (a.label) {
          parts.push(`<text x="${xLo + 4}" y="${axis.chartY + 11}" font-size="13" fill="${t.muted}" font-family="inherit">${esc(a.label)}</text>`);
        }
      }
    } else if (a.type === 'callout') {
      const idx = resolveCategoryIndex(a.at, axis.labels);
      const ax = axis.orientation === 'vertical' ? axis.indexToX(idx) : axis.chartX + axis.chartW * 0.5;
      const ay = axis.orientation === 'horizontal' ? axis.indexToY(idx) : axis.chartY + axis.chartH * 0.4;
      const padX = 6, padY = 3;
      const approxCharWidth = 6.2;
      const boxW = Math.max(40, a.text.length * approxCharWidth + padX * 2);
      const boxH = 18;
      const boxX = Math.min(Math.max(ax - boxW / 2, axis.chartX), axis.chartX + axis.chartW - boxW);
      const boxY = Math.max(ay - boxH - 8, axis.chartY + 2);
      parts.push(`<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="3" fill="${t.bg}" stroke="${t.primary}" stroke-width="1"/>`);
      parts.push(`<text x="${boxX + boxW / 2}" y="${boxY + boxH / 2 + 3}" text-anchor="middle" font-size="13" font-weight="600" fill="${t.primary}" font-family="inherit">${esc(a.text)}</text>`);
      parts.push(`<line x1="${ax}" y1="${boxY + boxH}" x2="${ax}" y2="${ay - 2}" stroke="${t.primary}" stroke-width="1" stroke-opacity="0.6"/>`);
    }
  }
  return parts.join('\n');
}

/** SVG arc path for pie slices. */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = (startDeg - 90) * Math.PI / 180;
  const end = (endDeg - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

// ---------------------------------------------------------------------------
// Sparkline — tiny inline line chart for stat-row / dashboard tiles
// ---------------------------------------------------------------------------

/** Render a tiny SVG sparkline. Returns an <svg> string. */
export function renderSparkline(
  data: number[], w = 60, h = 20, color: string, _bgColor?: string,
): string {
  if (!data || data.length < 2) return '';
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  const gradId = `sp${Math.random().toString(36).slice(2, 8)}`;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
    <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.25"/><stop offset="100%" stop-color="${color}" stop-opacity="0.02"/></linearGradient></defs>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${gradId})" stroke="none"/>
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>
  </svg>`;
}

/** Render a tiny SVG donut chart showing a single ratio (0-1). */
export function renderMiniDonut(
  ratio: number, r = 16, color: string, bgColor: string,
): string {
  const val = Math.max(0, Math.min(1, ratio));
  const circ = 2 * Math.PI * r;
  const dash = val * circ;
  const gap = circ - dash;
  const size = (r + 4) * 2;
  const cx = size / 2, cy = size / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${bgColor}" stroke-width="4" opacity="0.3"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="${dash} ${gap}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="700" fill="${color}" font-family="inherit">${Math.round(val * 100)}%</text>
  </svg>`;
}

// ---------------------------------------------------------------------------
// 1. Bar Chart (vertical)
// ---------------------------------------------------------------------------

/** Grouped path: when `data.series` + `data.labels` are present, render multiple
 *  series per category side-by-side along the X-axis. Mirror image of
 *  renderGroupedHorizontalBar (rotated 90°). Use cases: refi-wall by year × sector,
 *  rent vs vacancy by region, etc. */
function renderGroupedVerticalBar(
  data: BarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const labels = data.labels || [];
  const allSeries = (data.series || []).slice(0, 6);
  const isCompact = tw > 0 && tw < 150;
  const n = labels.length || 1;
  const s = allSeries.length || 1;

  const maxVal = Math.max(1, ...allSeries.flatMap(ser => ser.values));
  const { max, ticks } = niceScale(maxVal);
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  const chartX = 110, chartY = 0, chartW = 790, chartH = 340;
  // Tighter slot gap when ≥6 series — every pixel of inter-bar space matters.
  const slotGapFactor = s >= 6 ? 0.12 : s >= 5 ? 0.15 : 0.18;
  const slotGap = Math.max(8, Math.round(chartW / n * slotGapFactor));
  const slotW = Math.max(24, Math.round((chartW - slotGap * (n + 1)) / n));
  const barGap = s >= 5 ? 1 : Math.max(2, Math.round(slotW * 0.05));
  const barW = Math.max(8, Math.round((slotW - barGap * (s - 1)) / s));
  const radius = Math.min(t.radiusBar ?? 6, barW / 2);

  // Winner = global max across all series × categories.
  let winnerI = -1, winnerJ = -1, winnerV = -Infinity;
  allSeries.forEach((ser, j) => {
    ser.values.forEach((v, i) => {
      if (v > winnerV) { winnerV = v; winnerI = i; winnerJ = j; }
    });
  });

  const catFontSize = autoCategoryFontSize(labels, slotW + slotGap, 22, 14);

  // Smaller font when many bars per slot — labels start to collide otherwise.
  const baseSize = s >= 6 ? 13 : s >= 5 ? 14 : s >= 4 ? 16 : (s >= 3 ? 18 : 22);
  const winnerSize = Math.max(baseSize + 4, 22);

  // Per-slot two-pass: compute every potential value-label's bbox, then drop
  // the lower-priority label of any overlapping pair. Priority: global winner
  // > per-slot max > everyone else. This kills the "90B85B" string-of-mush
  // when adjacent bars in a 4-series slot have similar values.
  const approxCharW = 0.55; // SVG-unit width per char at our font sizes (Latin)

  const slots = labels.map((label, i) => {
    const slotX = chartX + slotGap + i * (slotW + slotGap);

    // Find slot-max (per-category leader) for label priority.
    let slotMaxJ = 0, slotMaxV = -Infinity;
    allSeries.forEach((ser, j) => {
      const v = ser.values[i] ?? 0;
      if (v > slotMaxV) { slotMaxV = v; slotMaxJ = j; }
    });

    // Build per-bar drawing meta so collision pass can read it.
    type BarMeta = {
      v: number; x: number; y: number; h: number; cx: number;
      isWinner: boolean; isSlotMax: boolean;
      labelText: string; labelHalfW: number; labelY: number;
      fontSize: number; fontWeight: number; fill: string;
      show: boolean;
    };
    const metas: BarMeta[] = allSeries.map((ser, j) => {
      const v = ser.values[i] ?? 0;
      const h = (v / max) * chartH;
      const x = slotX + j * (barW + barGap);
      const y = chartY + chartH - h;
      const isWinner = (i === winnerI && j === winnerJ);
      const isSlotMax = j === slotMaxJ;
      const labelText = fmtVal(v, shortUnit(data.unit));
      const fontSize = isWinner ? winnerSize : baseSize;
      const labelHalfW = labelText.length * approxCharW * fontSize * 0.5;
      return {
        v, x, y, h, cx: x + barW / 2,
        isWinner, isSlotMax,
        labelText, labelHalfW,
        labelY: Math.max(y - 6, fontSize),
        fontSize,
        fontWeight: isWinner ? 700 : 400,
        fill: isWinner ? t.text : t.muted,
        show: barW >= 16 || isWinner,
      };
    });

    // Collision drop: greedy pass in priority order. Each label is "accepted"
    // only if it doesn't overlap any already-accepted label. Priority: winner
    // > slot-max > everyone else. Same-priority ties broken by lower j (left
    // bar wins), so when two adjacent bars share the same value (e.g. 80B/80B)
    // we keep the left label and drop the right.
    const priority = (m: BarMeta) => m.isWinner ? 3 : m.isSlotMax ? 2 : 1;
    const order = metas
      .map((m, j) => ({ idx: j, m }))
      .sort((a, b) => priority(b.m) - priority(a.m) || a.idx - b.idx);
    const accepted: BarMeta[] = [];
    for (const { m } of order) {
      if (!m.show) continue;
      const overlaps = accepted.some(acc => {
        const dx = Math.abs(m.cx - acc.cx);
        const minDx = m.labelHalfW + acc.labelHalfW + 4;
        const dy = Math.abs(m.labelY - acc.labelY);
        return dx < minDx && dy < m.fontSize;
      });
      if (overlaps) m.show = false;
      else accepted.push(m);
    }

    const bars = metas.map((m, j) => {
      const color = labelColor(j, t);
      return `
        <rect x="${m.x}" y="${m.y}" width="${barW}" height="${m.h}" rx="${radius}" fill="${color}"/>
        ${isCompact || !m.show ? '' : `<text x="${m.cx}" y="${m.labelY}" text-anchor="middle" font-size="${m.fontSize}" font-weight="${m.fontWeight}" fill="${m.fill}" font-family="inherit">${m.labelText}</text>`}`;
    }).join('');
    const catLabel = isCompact ? '' : `<text x="${slotX + slotW / 2}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="${catFontSize}" fill="${t.text}" font-family="inherit">${esc(label)}</text>`;
    return catLabel + bars;
  }).join('');

  const yLabels = isCompact ? '' : ticks.map(v => {
    const y = chartY + chartH - (v / max) * chartH;
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  const legendHtml = isCompact ? '' : allSeries.map((ser, j) => {
    const color = labelColor(j, t);
    return `<span style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:${t.muted}; margin-left:18px;">
      <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${color};"></span>
      ${esc(ser.name)}
    </span>`;
  }).join('');

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxX = isCompact ? chartX - 10 : 0;
  const viewBoxW = isCompact ? chartW + 20 : 960;
  const viewBoxH = isCompact ? chartH + 20 : 390;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<div style="display:flex; align-items:baseline; flex-wrap:wrap; margin-bottom:10px;">
    <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600; margin:0;">${escMd(data.title)}</h2>
    <div style="flex:1;"></div>
    ${legendHtml}
  </div>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="${viewBoxX} -30 ${viewBoxW} ${viewBoxH + 30}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${gridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${yLabels}
      ${slots}
      ${annotationsSvg(data.annotations, {
        orientation: 'vertical',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        labels,
        indexToX: (i) => chartX + slotGap + i * (slotW + slotGap) + slotW / 2,
      }, t)}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

export function renderBarChart(
  data: BarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  if (data.series && data.series.length > 0 && data.labels && data.labels.length > 0) {
    return renderGroupedVerticalBar(data, t, theme, tw, _th, isImport);
  }
  const items = data.items || [];
  const isCompact = tw > 0 && tw < 150;
  const maxVal = Math.max(...items.map(d => d.value), 1);
  const { max, ticks } = niceScale(maxVal);
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  // Layout constants (inside a 960×540 logical viewport). chartX bumped from 80
  // to leave room for bigger Y-axis tick labels; chartW shrunk to compensate.
  const chartX = 110, chartY = 0, chartW = 790, chartH = 340;
  const barGap = Math.max(8, Math.round(chartW / items.length * 0.25));
  const barW = Math.max(20, Math.round((chartW - barGap * (items.length + 1)) / items.length));
  const radius = Math.min(t.radiusBar ?? 6, barW / 2);

  // Auto-fit X-axis category labels: strip any shared suffix (e.g. "YoY"),
  // then shrink font if labels would still collide with neighbours.
  const rawCatLabels = items.map(it => it.label ?? '');
  const { labels: catLabels, suffix: catSuffix } = stripSharedSuffix(rawCatLabels);
  const catFontSize = autoCategoryFontSize(catLabels, barW + barGap, 22, 14);

  // Winner emphasis (analyst convention): the top-value bar gets a darker,
  // heavier numeric label so the reader's eye lands there first. Ties resolve
  // on the first occurrence, which matches fmt-reader intuition.
  const maxIdx = items.findIndex(it => it.value === maxVal);
  const bars = items.map((item, i) => {
    const color = item.color ?? labelColor(i, t);
    const h = (item.value / max) * chartH;
    const x = chartX + barGap + i * (barW + barGap);
    const y = chartY + chartH - h;
    const isWinner = i === maxIdx;
    const valFill = isWinner ? t.text : t.muted;
    const valWeight = isWinner ? 700 : 400;
    const valSize = isWinner ? 26 : 22;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="${radius}" fill="${color}"/>
      ${isCompact ? '' : `<text x="${x + barW / 2}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="${catFontSize}" fill="${t.text}" font-family="inherit">${esc(catLabels[i])}</text>`}
      ${isCompact ? '' : `<text x="${x + barW / 2}" y="${y - 10}" text-anchor="middle" font-size="${valSize}" font-weight="${valWeight}" fill="${valFill}" font-family="inherit">${fmtVal(item.value, shortUnit(data.unit))}</text>`}`;
  }).join('');

  // Y-axis tick labels — drop unit; it's redundant with chart title and bar
  // value labels. Verbose units like "% / 10k units" used to clip out of the
  // viewBox here ("0 % / 10k units" → "k units" cut-off bug).
  const yLabels = isCompact ? '' : ticks.map(v => {
    const y = chartY + chartH - (v / max) * chartH;
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  // If we stripped a shared suffix off every X category ("YoY", "%"), surface
  // it once as an axis subtitle so the reader still sees the common dimension.
  const catSuffixLabel = (catSuffix && !isCompact)
    ? `<text x="${chartX + chartW / 2}" y="${chartY + chartH + 36 + catFontSize + 18}" text-anchor="middle" font-size="14" fill="${t.muted}" font-family="inherit" font-style="italic">${esc(catSuffix)}</text>`
    : '';

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxX = isCompact ? chartX - 10 : 0;
  const viewBoxW = isCompact ? chartW + 20 : 960;
  // Bigger X-axis font + optional suffix label needs more vertical room.
  const viewBoxH = isCompact ? chartH + 20 : (catSuffix ? 420 : 390);

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="${viewBoxX} -30 ${viewBoxW} ${viewBoxH + 30}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${gridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${yLabels}
      ${bars}
      ${catSuffixLabel}
      ${annotationsSvg(data.annotations, {
        orientation: 'vertical',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        labels: items.map(it => it.label),
        indexToX: (i) => chartX + barGap + i * (barW + barGap) + barW / 2,
      }, t)}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 2. Horizontal Bar Chart
// ---------------------------------------------------------------------------

/** Grouped path: when `data.series` + `data.labels` are present, render multiple
 *  series per category side-by-side (benchmark-style: CLI / CLI+Skills / MCP × 5 tasks). */
function renderGroupedHorizontalBar(
  data: HorizontalBarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const labels = data.labels || [];
  const allSeries = (data.series || []).slice(0, 6);
  const isCompact = tw > 0 && tw < 150;
  const n = labels.length || 1;
  const s = allSeries.length || 1;

  const flatVals = allSeries.flatMap(ser => ser.values);
  const diverging = !!data.diverging;
  const rawMin = flatVals.length ? Math.min(...flatVals) : 0;
  const rawMax = flatVals.length ? Math.max(...flatVals) : 1;
  const scale = diverging
    ? niceScaleSigned(rawMin, rawMax)
    : (() => {
        const r = niceScale(Math.max(1, rawMax));
        return { min: 0, max: r.max, step: r.step, ticks: r.ticks };
      })();
  const { min: minV, max, ticks } = scale;
  const range = (max - minV) || 1;
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  const chartX = isCompact ? 20 : 200, chartY = 0, chartW = isCompact ? 880 : 700, chartH = 340;
  const slotGap = Math.max(10, Math.round(chartH / n * 0.15));
  const slotH = Math.max(24, Math.round((chartH - slotGap * (n + 1)) / n));
  const barGap = Math.max(2, Math.round(slotH * 0.05));
  const barH = Math.max(10, Math.round((slotH - barGap * (s - 1)) / s));
  const radius = Math.min(t.radiusBar ?? 6, barH / 2);

  // Diverging: bars grow outward from a zero line. In purely-positive mode
  // (minV === 0), xZero === chartX so bars behave identically to the legacy path.
  const xZero = chartX + ((0 - minV) / range) * chartW;

  // Winner = global max-magnitude across all series × categories (bold emphasis).
  let winnerI = -1, winnerJ = -1, winnerMag = -Infinity;
  allSeries.forEach((ser, j) => {
    ser.values.forEach((v, i) => {
      if (Math.abs(v) > winnerMag) { winnerMag = Math.abs(v); winnerI = i; winnerJ = j; }
    });
  });

  const slots = labels.map((label, i) => {
    const slotY = chartY + slotGap + i * (slotH + slotGap);
    const bars = allSeries.map((ser, j) => {
      const v = ser.values[i] ?? 0;
      const w = (Math.abs(v) / range) * chartW;
      const x = v >= 0 ? xZero : xZero - w;
      const y = slotY + j * (barH + barGap);
      const color = labelColor(j, t);
      const isWinner = (i === winnerI && j === winnerJ);
      const valInside = w > chartW * 0.85;
      const valX = v >= 0
        ? (valInside ? x + w - 8 : x + w + 6)
        : (valInside ? x + 8 : x - 6);
      const valAnchor = v >= 0
        ? (valInside ? 'end' : 'start')
        : (valInside ? 'start' : 'end');
      const valFill = valInside ? ensureTextContrast('#ffffff', color) : (isWinner ? t.text : t.muted);
      const valWeight = isWinner || valInside ? 700 : 400;
      const valSize = isWinner ? 28 : (valInside ? 24 : 22);
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${barH}" rx="${radius}" fill="${color}"/>
        ${isCompact ? '' : `<text x="${valX}" y="${y + barH / 2 + 7}" text-anchor="${valAnchor}" font-size="${valSize}" font-weight="${valWeight}" fill="${valFill}" font-family="inherit">${fmtVal(v, shortUnit(data.unit))}</text>`}`;
    }).join('');
    const labelY = slotY + slotH / 2 + 8;
    // In diverging mode pin labels to the chart's left edge so the eye lands
    // on the category before reading either side of the zero line.
    const labelAnchorX = diverging ? chartX - 14 : chartX - 14;
    const catLabel = isCompact ? '' : `<text x="${labelAnchorX}" y="${labelY}" text-anchor="end" font-size="22" fill="${t.text}" font-family="inherit">${esc(label)}</text>`;
    return catLabel + bars;
  }).join('');

  const xLabels = isCompact ? '' : ticks.map(v => {
    const x = chartX + ((v - minV) / range) * chartW;
    return `<text x="${x}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  // Diverging gridlines: signed ticks; emphasize the zero line.
  const divGridLines = !diverging ? '' : ticks.map(v => {
    const x = chartX + ((v - minV) / range) * chartW;
    const isZero = Math.abs(v) < 1e-9;
    const strokeOp = isZero ? 0.7 : 0.35;
    const strokeW = isZero ? 1 : 0.5;
    const dash = isZero ? '' : 'stroke-dasharray="3,3"';
    return `<line x1="${x}" y1="${chartY}" x2="${x}" y2="${chartY + chartH}" stroke="${isZero ? t.border : t.muted}" stroke-width="${strokeW}" stroke-opacity="${strokeOp}" ${dash}/>`;
  }).join('\n');

  const legendHtml = isCompact ? '' : allSeries.map((ser, j) => {
    const color = labelColor(j, t);
    return `<span style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:${t.muted}; margin-left:18px;">
      <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${color};"></span>
      ${esc(ser.name)}
    </span>`;
  }).join('');

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxH = isCompact ? chartH + 10 : 370;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<div style="display:flex; align-items:baseline; flex-wrap:wrap; margin-bottom:10px;">
    <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600; margin:0;">${escMd(data.title)}</h2>
    <div style="flex:1;"></div>
    ${legendHtml}
  </div>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 960 ${viewBoxH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${diverging ? divGridLines : vGridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      ${diverging ? '' : `<line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>`}
      ${xLabels}
      ${slots}
      ${annotationsSvg(data.annotations, {
        orientation: 'horizontal',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        minVal: minV,
        labels,
        indexToY: (i) => chartY + slotGap + i * (slotH + slotGap) + slotH / 2,
      }, t)}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

export function renderHorizontalBarChart(
  data: HorizontalBarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  if (data.series && data.series.length > 0 && data.labels && data.labels.length > 0) {
    return renderGroupedHorizontalBar(data, t, theme, tw, _th, isImport);
  }
  // Diverging single-series: route through grouped path so the zero-cross /
  // signed-scale math lives in one place.
  if (data.diverging && data.items && data.items.length > 0) {
    const items = data.items;
    return renderGroupedHorizontalBar({
      ...data,
      labels: items.map(it => it.label),
      series: [{ name: '', values: items.map(it => it.value) }],
    }, t, theme, tw, _th, isImport);
  }
  const items = data.items || [];
  const isCompact = tw > 0 && tw < 150;
  const maxVal = Math.max(...items.map(d => d.value), 1);
  const { max, ticks } = niceScale(maxVal);
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  // chartX bumped to leave room for bigger Y-axis category labels.
  const chartX = isCompact ? 20 : 200, chartY = 0, chartW = isCompact ? 880 : 700, chartH = 340;
  const barGap = Math.max(6, Math.round(chartH / items.length * 0.2));
  const barH = Math.max(16, Math.round((chartH - barGap * (items.length + 1)) / items.length));
  const radius = Math.min(t.radiusBar ?? 6, barH / 2);

  const maxIdxH = items.findIndex(it => it.value === maxVal);
  const bars = items.map((item, i) => {
    const color = item.color ?? labelColor(i, t);
    const w = (item.value / max) * chartW;
    const y = chartY + barGap + i * (barH + barGap);
    const isWinner = i === maxIdxH;
    // Clamp: if the bar consumes >85% of chart width, the outside label would
    // overflow past the chart frame — tuck it inside at the right edge with
    // contrast-safe text instead.
    const valInside = w > chartW * 0.85;
    const valX = valInside ? chartX + w - 8 : chartX + w + 6;
    const valAnchor = valInside ? 'end' : 'start';
    const valFill = valInside
      ? ensureTextContrast('#ffffff', color)
      : (isWinner ? t.text : t.muted);
    const valWeight = isWinner || valInside ? 700 : 400;
    const valSize = isWinner ? 32 : (valInside ? 28 : 26);
    return `
      <rect x="${chartX}" y="${y}" width="${w}" height="${barH}" rx="${radius}" fill="${color}"/>
      ${isCompact ? '' : `<text x="${chartX - 14}" y="${y + barH / 2 + 8}" text-anchor="end" font-size="22" fill="${t.text}" font-family="inherit">${esc(item.label)}</text>`}
      ${isCompact ? '' : `<text x="${valX}" y="${y + barH / 2 + 8}" text-anchor="${valAnchor}" font-size="${valSize}" font-weight="${valWeight}" fill="${valFill}" font-family="inherit">${fmtVal(item.value, shortUnit(data.unit))}</text>`}`;
  }).join('');

  // X-axis tick labels — drop unit (redundant with bar value labels).
  const xLabels = isCompact ? '' : ticks.map(v => {
    const x = chartX + (v / max) * chartW;
    return `<text x="${x}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxH = isCompact ? chartH + 10 : 370;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 960 ${viewBoxH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${vGridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${xLabels}
      ${bars}
      ${annotationsSvg(data.annotations, {
        orientation: 'horizontal',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        labels: items.map(it => it.label),
        indexToY: (i) => chartY + barGap + i * (barH + barGap) + barH / 2,
      }, t)}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 3. Line Chart
// ---------------------------------------------------------------------------

export function renderLineChart(
  data: LineChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const labels = data.labels || [];
  const series = data.series || [];
  const isCompact = tw > 0 && tw < 150;
  const allVals = series.flatMap(s => s.values);
  const maxVal = Math.max(...allVals, 1);
  const { max, ticks } = niceScale(maxVal);
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  // chartX bumped to leave room for bigger Y-axis tick labels.
  const chartX = isCompact ? 20 : 110, chartY = 10, chartW = isCompact ? 920 : 770, chartH = 310;

  const isArea = !!data.area;
  const areaGradIdBase = `la${Math.random().toString(36).slice(2, 8)}`;
  const areaDefs = isArea ? `<defs>${series.map((_, si) => {
    const color = labelColor(si, t);
    return `<linearGradient id="${areaGradIdBase}-${si}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity="0.28"/><stop offset="100%" stop-color="${color}" stop-opacity="0.02"/></linearGradient>`;
  }).join('')}</defs>` : '';
  const lines = series.map((s, si) => {
    const color = labelColor(si, t);
    const pts = s.values.map((v, vi) => {
      const x = chartX + (labels.length > 1 ? vi / (labels.length - 1) : 0.5) * chartW;
      const y = chartY + chartH - (v / max) * chartH;
      return `${x},${y}`;
    });
    const areaPoly = isArea && pts.length > 0
      ? `<polygon points="${chartX},${chartY + chartH} ${pts.join(' ')} ${chartX + chartW},${chartY + chartH}" fill="url(#${areaGradIdBase}-${si})" stroke="none"/>`
      : '';
    const dots = s.values.map((v, vi) => {
      const x = chartX + (labels.length > 1 ? vi / (labels.length - 1) : 0.5) * chartW;
      const y = chartY + chartH - (v / max) * chartH;
      return `<circle cx="${x}" cy="${y}" r="${isCompact ? 5 : 3.5}" fill="${color}" stroke="${t.bg}" stroke-width="1.5"/>`;
    });
    return `${areaPoly}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${isCompact ? 4 : 2.5}" stroke-linejoin="round" stroke-linecap="round"/>${dots.join('')}`;
  }).join('\n');

  // X-axis labels — strip any shared suffix (rare for line charts but free)
  // and auto-shrink font when densely packed labels would collide.
  const { labels: xCatLabels, suffix: xCatSuffix } = stripSharedSuffix(labels);
  const xSlotW = labels.length > 1 ? chartW / (labels.length - 1) : chartW;
  const xCatFontSize = autoCategoryFontSize(xCatLabels, xSlotW, 28, 16);
  // Subsample when the label band would crowd. Picks a stride so ~6-8 labels
  // remain, always keeping first + last so reader sees the time-axis bounds.
  const maxLen = Math.max(...xCatLabels.map(l => (l ?? '').length), 1);
  const hasCJK = xCatLabels.some(l => /[一-鿿]/.test(l ?? ''));
  const labelPxWidth = maxLen * (hasCJK ? 1.0 : 0.58) * xCatFontSize;
  const labelStride = labelPxWidth + 8 > xSlotW
    ? Math.max(1, Math.ceil((labelPxWidth + 8) / xSlotW))
    : 1;
  const lastIdx = labels.length - 1;
  // Build keep-list: stride from the right edge (so last label always lands).
  // Then re-add first label only if it's not too close to the leftmost stride
  // label (otherwise "22Q4" mashes into "23Q1").
  const keepSet = new Set<number>();
  for (let i = lastIdx; i >= 0; i -= labelStride) keepSet.add(i);
  if (lastIdx > 0 && labelStride > 1) {
    const leftmostStride = Math.min(...Array.from(keepSet));
    if (leftmostStride > labelStride / 2) keepSet.add(0);
  } else {
    keepSet.add(0);
  }
  const xLabels = isCompact ? '' : labels.map((_lbl, i) => {
    if (!keepSet.has(i)) return '';
    const x = chartX + (labels.length > 1 ? i / lastIdx : 0.5) * chartW;
    return `<text x="${x}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="${xCatFontSize}" fill="${t.muted}" font-family="inherit">${esc(xCatLabels[i])}</text>`;
  }).join('');
  const xCatSuffixLabel = (xCatSuffix && !isCompact)
    ? `<text x="${chartX + chartW / 2}" y="${chartY + chartH + 36 + xCatFontSize + 18}" text-anchor="middle" font-size="14" fill="${t.muted}" font-family="inherit" font-style="italic">${esc(xCatSuffix)}</text>`
    : '';

  // Y-axis — drop unit (redundant; was clipping verbose units like "120 index" → ") index").
  const yLabels = isCompact ? '' : ticks.map(v => {
    const y = chartY + chartH - (v / max) * chartH;
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  // Direct labels at line ends (analyst-style, 宪法 §4.2 rule 2) when series
  // names are short enough to not collide. Falls back to legend when names
  // would overlap or overflow.
  const maxNameLen = Math.max(...series.map(s => (s.name ?? '').length), 0);
  const canDirectLabel = !isCompact && series.length >= 2 && maxNameLen > 0 && maxNameLen <= 14;
  // Collision-avoid: when two series end at close Y values their labels
  // overlap. Greedily shift lower-ranked labels downward by min 16px.
  const directLabels = canDirectLabel ? (() => {
    const ranked = series.map((s, si) => {
      const color = labelColor(si, t);
      const lastIdx = s.values.length - 1;
      const lastVal = s.values[lastIdx];
      const x = chartX + (labels.length > 1 ? lastIdx / (labels.length - 1) : 0.5) * chartW;
      const y = chartY + chartH - (lastVal / max) * chartH;
      return { s, color, x, y };
    }).sort((a, b) => a.y - b.y);
    const MIN_GAP = 16;
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].y - ranked[i - 1].y < MIN_GAP) {
        ranked[i].y = ranked[i - 1].y + MIN_GAP;
      }
    }
    return ranked.map(({ s, color, x, y }) =>
      `<text x="${x + 12}" y="${y + 6}" font-size="16" font-weight="600" fill="${color}" font-family="inherit">${esc(s.name)}</text>`
    ).join('');
  })() : '';

  // Legacy legend for cases where direct labeling can't fit. Width-aware so
  // CJK + long Latin names stop colliding ("全美 vacancyCBRE prime vacancy").
  const legend = !isCompact && series.length > 1 && !canDirectLabel ? (() => {
    const legendFontSize = 24;
    const swatchW = 16, swatchGap = 8, entryGap = 28;
    const widthFor = (name: string) => {
      const cjkChars = (name.match(/[一-鿿]/g) || []).length;
      const otherChars = name.length - cjkChars;
      return swatchW + swatchGap + Math.ceil(cjkChars * legendFontSize + otherChars * legendFontSize * 0.58);
    };
    const widths = series.map(s => widthFor(s.name ?? ''));
    let cursorX = chartX;
    return series.map((s, si) => {
      const color = labelColor(si, t);
      const x = cursorX;
      cursorX += widths[si] + entryGap;
      return `<rect x="${x}" y="${chartY + chartH + 46}" width="${swatchW}" height="${swatchW}" rx="2" fill="${color}"/>
              <text x="${x + swatchW + swatchGap}" y="${chartY + chartH + 58}" font-size="${legendFontSize}" fill="${t.text}" font-family="inherit">${esc(s.name)}</text>`;
    }).join('');
  })() : '';

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  // Bigger X-axis font + optional suffix label needs more vertical room.
  const baseH = series.length > 1 && !canDirectLabel ? 400 : 370;
  const viewBoxH = isCompact ? chartH + 20 : (xCatSuffix ? baseH + 30 : baseH);

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 -30 960 ${viewBoxH + 30}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${areaDefs}
      ${gridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${yLabels}
      ${xLabels}
      ${xCatSuffixLabel}
      ${lines}
      ${annotationsSvg(data.annotations, {
        orientation: 'vertical',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        labels,
        indexToX: (i) => chartX + (labels.length > 1 ? i / (labels.length - 1) : 0.5) * chartW,
      }, t)}
      ${directLabels}
      ${legend}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 4. Pie / Donut Chart
// ---------------------------------------------------------------------------

export function renderPieChart(
  data: PieChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const items = data.items || [];
  const isCompact = tw > 0 && tw < 150;
  const rawTotal = items.reduce((sum, d) => sum + (d.value || 0), 0);
  if (rawTotal === 0) {
    const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);
    const outerPad0 = isCompact ? '6px 8px' : '32px 40px';
    return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad0};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <p style="font-size:14px; color:${t.muted};">No data</p>
  </div>
</div>`;
  }
  const total = rawTotal;
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);
  const isDonut = !!data.donut;

  // In compact mode, center the pie; full mode puts pie on left + legend on right
  const cx = isCompact ? 200 : 240, cy = isCompact ? 200 : 190, r = isCompact ? 170 : 150;
  const innerR = isDonut ? r * 0.55 : 0;

  let angle = 0;
  // Collect slice labels separately so they stack on top of all slice paths
  // (prevents neighboring slice fills from overdrawing a label's half-pixel
  // antialias fringe).
  const sliceLabels: string[] = [];
  const slices = items.map((item, i) => {
    const color = labelColor(i, t);
    const sweep = (item.value / total) * 360;
    const startDeg = angle;
    const endDeg = angle + sweep;
    angle = endDeg;

    // Slice-center percent label (direct labeling, 宪法 §4.2 rule 2). Only
    // emit when the slice is visually large enough to host text without
    // overflowing its wedge or becoming unreadable (~8% of circle).
    const pct = Math.round((item.value / total) * 100);
    const radLabelBig = isDonut ? (r + innerR) / 2 : r * 0.65;
    if (pct >= 8 && !isCompact) {
      const midDeg = (startDeg + endDeg) / 2;
      const mid = (midDeg - 90) * Math.PI / 180;
      const lx = cx + radLabelBig * Math.cos(mid);
      const ly = cy + radLabelBig * Math.sin(mid);
      const txtColor = ensureTextContrast('#ffffff', color);
      sliceLabels.push(`<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="700" fill="${txtColor}" font-family="inherit">${pct}%</text>`);
    }

    if (isDonut) {
      // Donut: use two arcs
      const s1 = (startDeg - 90) * Math.PI / 180;
      const e1 = (endDeg - 90) * Math.PI / 180;
      const large = sweep > 180 ? 1 : 0;
      const ox1 = cx + r * Math.cos(s1), oy1 = cy + r * Math.sin(s1);
      const ox2 = cx + r * Math.cos(e1), oy2 = cy + r * Math.sin(e1);
      const ix1 = cx + innerR * Math.cos(e1), iy1 = cy + innerR * Math.sin(e1);
      const ix2 = cx + innerR * Math.cos(s1), iy2 = cy + innerR * Math.sin(s1);
      return `<path d="M ${ox1} ${oy1} A ${r} ${r} 0 ${large} 1 ${ox2} ${oy2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${large} 0 ${ix2} ${iy2} Z" fill="${color}"/>`;
    }
    return `<path d="${describeArc(cx, cy, r, startDeg, endDeg)}" fill="${color}"/>`;
  }).join('\n');

  // Donut center: total value (analyst convention — gives context without
  // needing to eyeball the legend). Skip when compact mode, where there's
  // no room; skip when not a donut (the pie has no hole to fill).
  const donutCenter = isDonut && !isCompact
    ? `<text x="${cx}" y="${cy - 6}" text-anchor="middle" dominant-baseline="central" font-size="11" fill="${t.muted}" font-family="inherit" style="letter-spacing:0.08em; text-transform:uppercase;">Total</text>
       <text x="${cx}" y="${cy + 14}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="700" fill="${t.text}" font-family="inherit">${esc(fmtVal(total))}</text>`
    : '';

  // Legend on the right (full mode only)
  const legendX = 460;
  const legendItems = isCompact ? '' : items.map((item, i) => {
    const color = labelColor(i, t);
    const pct = Math.round(item.value / total * 100);
    const y = 80 + i * 36;
    return `
      <rect x="${legendX}" y="${y}" width="18" height="18" rx="3" fill="${color}"/>
      <text x="${legendX + 28}" y="${y + 15}" font-size="18" fill="${t.text}" font-family="inherit">${esc(item.label)}</text>
      <text x="${legendX + 380}" y="${y + 15}" text-anchor="end" font-size="18" fill="${t.muted}" font-family="inherit">${fmtVal(item.value)} (${pct}%)</text>`;
  }).join('');

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBox = isCompact ? '0 0 400 400' : '0 0 880 400';

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="${viewBox}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${slices}
      ${sliceLabels.join('\n')}
      ${donutCenter}
      ${legendItems}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 5. Stacked Bar Chart (vertical; part-to-whole over categories)
// ---------------------------------------------------------------------------

export function renderStackedBarChart(
  data: StackedBarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const labels = data.labels || [];
  const series = data.series || [];
  const isCompact = tw > 0 && tw < 150;
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);
  const normalize = !!data.normalize;

  const totals = labels.map((_, i) =>
    series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const rawMax = Math.max(...totals, 1);
  const maxVal = normalize ? 100 : rawMax;
  const { max, ticks } = niceScale(maxVal);

  // chartX bumped to leave room for bigger Y-axis tick labels.
  const chartX = 110, chartY = 10, chartW = 790, chartH = 320;
  const n = Math.max(1, labels.length);
  const barGap = Math.max(10, Math.round(chartW / n * 0.28));
  const barW = Math.max(20, Math.round((chartW - barGap * (n + 1)) / n));
  const radius = Math.min(t.radiusBar ?? 6, barW / 2);

  // Auto-fit X-axis category labels (strip shared suffix, shrink if packed).
  const { labels: stackCatLabels, suffix: stackCatSuffix } = stripSharedSuffix(labels);
  const stackCatFontSize = autoCategoryFontSize(stackCatLabels, barW + barGap, 22, 14);

  const bars = labels.map((_lbl, i) => {
    const total = totals[i];
    const scale = normalize && total > 0 ? 100 / total : 1;
    let accValue = 0;
    const x = chartX + barGap + i * (barW + barGap);
    const segsParts: string[] = [];
    const segLabels: string[] = [];
    series.forEach((s, si) => {
      const raw = s.values[i] ?? 0;
      if (raw <= 0) return;
      const displayed = raw * scale;
      const segH = (displayed / max) * chartH;
      const yBottom = chartY + chartH - (accValue / max) * chartH;
      const yTop = yBottom - segH;
      const isLastNonZero = series.slice(si + 1).every((s2) => (s2.values[i] ?? 0) <= 0);
      const r = isLastNonZero ? radius : 0;
      const color = labelColor(si, t);
      segsParts.push(`<rect x="${x}" y="${yTop}" width="${barW}" height="${segH}" ${r ? `rx="${r}"` : ''} fill="${color}"/>`);
      // In-segment direct label (analyst convention): readable only when the
      // segment is tall enough (≥18px) and its share is material (≥12% of
      // the bar). Smaller segments stay anonymous — the legend covers them.
      if (!isCompact && segH >= 28 && displayed / max >= 0.12) {
        const txt = normalize ? `${Math.round(raw / (total || 1) * 100)}%` : fmtVal(raw, shortUnit(data.unit));
        const txtColor = ensureTextContrast('#ffffff', color);
        segLabels.push(`<text x="${x + barW / 2}" y="${yTop + segH / 2 + 8}" text-anchor="middle" font-size="20" font-weight="600" fill="${txtColor}" font-family="inherit">${esc(txt)}</text>`);
      }
      accValue += displayed;
    });
    const xLabel = isCompact ? '' :
      `<text x="${x + barW / 2}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="${stackCatFontSize}" fill="${t.text}" font-family="inherit">${esc(stackCatLabels[i])}</text>`;
    // Segment labels stack on top of all segment rects for this bar so later
    // rects never overdraw a label's antialias edge.
    return segsParts.join('') + segLabels.join('') + xLabel;
  }).join('');

  // Y-axis — drop unit (redundant); keep "%" when normalize since it's load-bearing.
  const yLabels = isCompact ? '' : ticks.map(v => {
    const y = chartY + chartH - (v / max) * chartH;
    const txt = normalize ? `${v}%` : fmtVal(v);
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="22" fill="${t.muted}" font-family="inherit">${txt}</text>`;
  }).join('');

  const legend = isCompact ? '' : series.map((s, si) => {
    const color = labelColor(si, t);
    const y = 30 + si * 30;
    return `<rect x="${chartX + chartW + 10}" y="${y}" width="16" height="16" rx="2" fill="${color}"/>
            <text x="${chartX + chartW + 32}" y="${y + 14}" font-size="18" fill="${t.text}" font-family="inherit">${esc(s.name)}</text>`;
  }).join('');

  const stackCatSuffixLabel = (stackCatSuffix && !isCompact)
    ? `<text x="${chartX + chartW / 2}" y="${chartY + chartH + 36 + stackCatFontSize + 18}" text-anchor="middle" font-size="14" fill="${t.muted}" font-family="inherit" font-style="italic">${esc(stackCatSuffix)}</text>`
    : '';
  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxX = isCompact ? chartX - 10 : 0;
  const viewBoxW = isCompact ? chartW + 20 : 1040;
  // Bigger X-axis font + optional suffix label needs more vertical room.
  const viewBoxH = isCompact ? chartH + 20 : (stackCatSuffix ? 410 : 380);

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="${viewBoxX} -30 ${viewBoxW} ${viewBoxH + 30}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${gridLinesSvg(ticks, max, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${yLabels}
      ${bars}
      ${stackCatSuffixLabel}
      ${legend}
      ${annotationsSvg(data.annotations, {
        orientation: 'vertical',
        chartX, chartW, chartY, chartH,
        maxVal: max,
        labels,
        indexToX: (i) => chartX + barGap + i * (barW + barGap) + barW / 2,
      }, t)}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 6. Scatter Chart (two-variable correlation, optional trendline)
// ---------------------------------------------------------------------------

function linearRegression(
  points: { x: number; y: number }[],
): { m: number; b: number } | null {
  if (points.length < 3) return null;
  const n = points.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
  const denom = n * sxx - sx * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const m = (n * sxy - sx * sy) / denom;
  const b = (sy - m * sx) / n;
  return { m, b };
}

export function renderScatterChart(
  data: ScatterChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const points = data.points || [];
  const isCompact = tw > 0 && tw < 150;
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  if (points.length === 0) {
    const outerPad0 = isCompact ? '6px 8px' : '32px 40px';
    return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad0};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;"><p style="font-size:14px; color:${t.muted};">No data</p></div>
</div>`;
  }

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const xRaw = { min: Math.min(...xs), max: Math.max(...xs) };
  const yRaw = { min: Math.min(...ys), max: Math.max(...ys) };
  const xScaled = niceScale(xRaw.max > 0 ? xRaw.max : 1);
  const yScaled = niceScale(yRaw.max > 0 ? yRaw.max : 1);
  const xMin = Math.min(0, xRaw.min);
  const yMin = Math.min(0, yRaw.min);
  const xMax = xScaled.max;
  const yMax = yScaled.max;

  // chartX bumped to leave room for bigger Y-axis tick labels.
  const chartX = isCompact ? 30 : 110, chartY = 10, chartW = isCompact ? 900 : 790, chartH = 310;

  const xToPx = (x: number) => chartX + ((x - xMin) / (xMax - xMin || 1)) * chartW;
  const yToPx = (y: number) => chartY + chartH - ((y - yMin) / (yMax - yMin || 1)) * chartH;

  const groups = Array.from(new Set(points.map(p => p.group).filter((g): g is string => !!g)));
  const groupColor = (g?: string) => {
    if (!g) return t.primary;
    const i = groups.indexOf(g);
    return labelColor(i < 0 ? 0 : i, t);
  };

  const dots = points.map(p => {
    const cx = xToPx(p.x);
    const cy = yToPx(p.y);
    const color = groupColor(p.group);
    const label = !isCompact && p.label
      ? `<text x="${cx + 8}" y="${cy - 8}" font-size="22" fill="${t.text}" font-family="inherit">${esc(p.label)}</text>`
      : '';
    return `<circle cx="${cx}" cy="${cy}" r="${isCompact ? 4 : 5}" fill="${color}" fill-opacity="0.78" stroke="${t.bg}" stroke-width="1"/>${label}`;
  }).join('');

  const reg = data.trendline ? linearRegression(points) : null;
  const trend = reg
    ? (() => {
      const x1 = xMin, x2 = xMax;
      const y1 = reg.m * x1 + reg.b;
      const y2 = reg.m * x2 + reg.b;
      return `<line x1="${xToPx(x1)}" y1="${yToPx(y1)}" x2="${xToPx(x2)}" y2="${yToPx(y2)}" stroke="${t.primary}" stroke-width="1.5" stroke-dasharray="5,3" stroke-opacity="0.7"/>`;
    })()
    : '';

  // Y-axis — drop unit (axis title carries unit; tick labels stay clean).
  const yLabels = isCompact ? '' : yScaled.ticks.map(v => {
    const y = yToPx(v);
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  const xLabels = isCompact ? '' : xScaled.ticks.map(v => {
    const x = xToPx(v);
    return `<text x="${x}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="22" fill="${t.muted}" font-family="inherit">${fmtVal(v)}</text>`;
  }).join('');

  const xAxisLabel = !isCompact && data.xLabel
    ? `<text x="${chartX + chartW / 2}" y="${chartY + chartH + 52}" text-anchor="middle" font-size="22" font-weight="600" fill="${t.text}" font-family="inherit">${esc(data.xLabel)}</text>`
    : '';
  const yAxisLabel = !isCompact && data.yLabel
    ? `<text x="${chartX - 52}" y="${chartY + chartH / 2}" text-anchor="middle" font-size="22" font-weight="600" fill="${t.text}" font-family="inherit" transform="rotate(-90 ${chartX - 52} ${chartY + chartH / 2})">${esc(data.yLabel)}</text>`
    : '';

  const legend = !isCompact && groups.length > 1 ? groups.map((g, gi) => {
    const y = 20 + gi * 28;
    return `<rect x="${chartX + chartW + 10}" y="${y}" width="16" height="16" rx="2" fill="${labelColor(gi, t)}"/>
            <text x="${chartX + chartW + 32}" y="${y + 14}" font-size="24" fill="${t.text}" font-family="inherit">${esc(g)}</text>`;
  }).join('') : '';

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxW = isCompact ? chartW + 40 : (groups.length > 1 ? 1040 : 960);
  const viewBoxH = isCompact ? chartH + 30 : 350;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 ${viewBoxW} ${viewBoxH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${gridLinesSvg(yScaled.ticks, yMax, chartX, chartW, chartY, chartH, t.muted)}
      <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      ${yLabels}
      ${xLabels}
      ${xAxisLabel}
      ${yAxisLabel}
      ${trend}
      ${dots}
      ${legend}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 8. Dual-Axis Bar Chart
// ---------------------------------------------------------------------------

/**
 * Two metrics with different units shown side-by-side per category. Each
 * category gets two bars (left-series + right-series); each side has its own
 * Y-axis. Use case: rent $/sqft + vacancy %, GDP + unemployment, headcount +
 * revenue. The user picks which metric belongs on which side; chart does NOT
 * auto-decide — the LLM/builder is responsible for sensible assignments.
 */
export function renderDualAxisBar(
  data: DualAxisBarChartData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const labels = data.labels || [];
  const isCompact = tw > 0 && tw < 150;
  const n = labels.length || 1;
  const left = data.leftSeries || { name: '', values: [] };
  const right = data.rightSeries || { name: '', values: [] };

  const leftMin = left.values.length ? Math.min(...left.values) : 0;
  const leftMax = left.values.length ? Math.max(...left.values) : 1;
  const rightMin = right.values.length ? Math.min(...right.values) : 0;
  const rightMax = right.values.length ? Math.max(...right.values) : 1;
  let leftScale = niceScaleSigned(leftMin, leftMax);
  let rightScale = niceScaleSigned(rightMin, rightMax);

  // Align both axes' zero baselines onto the same horizontal y. The anchor
  // side keeps its nice ticks; the other side's ticks are stretched to share
  // exactly the same zeroFrac so paired bars share an origin.
  const leftZeroFrac = leftScale.min < 0 ? -leftScale.min / (leftScale.max - leftScale.min) : 0;
  const rightZeroFrac = rightScale.min < 0 ? -rightScale.min / (rightScale.max - rightScale.min) : 0;
  const stretchScale = (
    sc: { min: number; max: number; step: number; ticks: number[] },
    targetFrac: number,
  ) => {
    if (sc.max <= 0) return sc;
    const newMin = -sc.max * targetFrac / (1 - targetFrac);
    const tickCount = Math.max(sc.ticks.length, 5);
    const step = (sc.max - newMin) / (tickCount - 1);
    const ticks = Array.from({ length: tickCount }, (_, i) => Math.round((newMin + step * i) * 100) / 100);
    return { min: newMin, max: sc.max, step, ticks };
  };
  if (leftZeroFrac > 0 && leftZeroFrac >= rightZeroFrac && leftZeroFrac < 1) {
    rightScale = stretchScale(rightScale, leftZeroFrac);
  } else if (rightZeroFrac > 0 && rightZeroFrac > leftZeroFrac && rightZeroFrac < 1) {
    leftScale = stretchScale(leftScale, rightZeroFrac);
  }
  const leftRange = (leftScale.max - leftScale.min) || 1;
  const rightRange = (rightScale.max - rightScale.min) || 1;

  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  // Wider right-edge padding (110px) leaves room for right-axis tick labels.
  const chartX = 110, chartY = 0, chartW = 740, chartH = 340;
  const slotGap = Math.max(10, Math.round(chartW / n * 0.18));
  const slotW = Math.max(24, Math.round((chartW - slotGap * (n + 1)) / n));
  const barGap = Math.max(2, Math.round(slotW * 0.05));
  const barW = Math.max(10, Math.round((slotW - barGap) / 2));
  const radius = Math.min(t.radiusBar ?? 6, barW / 2);

  // Two distinct accent colors — analyst convention pairs the dominant metric
  // with the brand primary, the secondary with a darker/muted tone. Use index 3
  // (≈ muted in legacy cycle, mid-tone in ordinal palettes) so dark monochromatic
  // themes like analyst-dark still get visible left/right contrast.
  const leftColor = labelColor(0, t);
  const rightColor = labelColor(3, t);

  const projectLeft = (v: number) =>
    chartY + chartH - ((v - leftScale.min) / leftRange) * chartH;
  const projectRight = (v: number) =>
    chartY + chartH - ((v - rightScale.min) / rightRange) * chartH;

  const catFontSize = autoCategoryFontSize(labels, slotW + slotGap, 22, 14);

  const slots = labels.map((label, i) => {
    const slotX = chartX + slotGap + i * (slotW + slotGap);
    const lv = left.values[i] ?? 0;
    const rv = right.values[i] ?? 0;
    const lY = projectLeft(lv);
    const rY = projectRight(rv);
    const lZeroY = projectLeft(0);
    const rZeroY = projectRight(0);
    // Bars grow from each axis's zero outward so negative values render below.
    const lBarY = Math.min(lY, lZeroY);
    const lBarH = Math.abs(lY - lZeroY);
    const rBarY = Math.min(rY, rZeroY);
    const rBarH = Math.abs(rY - rZeroY);
    const lX = slotX;
    const rX = slotX + barW + barGap;
    // Shrink value labels when bars get narrow (n>=8 slots) so paired left/right
    // labels above adjacent bars don't collide.
    const valFontSize = n >= 9 ? 14 : n >= 8 ? 16 : 18;
    const labelTopL = lv >= 0 ? lBarY - 8 : lBarY + lBarH + valFontSize + 4;
    const labelTopR = rv >= 0 ? rBarY - 8 : rBarY + rBarH + valFontSize + 4;
    const valLabels = isCompact ? '' : `
      <text x="${lX + barW / 2}" y="${labelTopL}" text-anchor="middle" font-size="${valFontSize}" fill="${leftColor}" font-weight="600" font-family="inherit">${fmtVal(lv, shortUnit(left.unit))}</text>
      <text x="${rX + barW / 2}" y="${labelTopR}" text-anchor="middle" font-size="${valFontSize}" fill="${rightColor}" font-weight="600" font-family="inherit">${fmtVal(rv, shortUnit(right.unit))}</text>`;
    const catLabel = isCompact ? '' : `<text x="${slotX + slotW / 2}" y="${chartY + chartH + 36}" text-anchor="middle" font-size="${catFontSize}" fill="${t.text}" font-family="inherit">${esc(label)}</text>`;
    return `
      <rect x="${lX}" y="${lBarY}" width="${barW}" height="${lBarH}" rx="${radius}" fill="${leftColor}"/>
      <rect x="${rX}" y="${rBarY}" width="${barW}" height="${rBarH}" rx="${radius}" fill="${rightColor}"/>
      ${valLabels}
      ${catLabel}`;
  }).join('');

  // Left Y-axis tick labels (anchored to chartX-12).
  const leftYLabels = isCompact ? '' : leftScale.ticks.map(v => {
    const y = projectLeft(v);
    return `<text x="${chartX - 12}" y="${y + 8}" text-anchor="end" font-size="20" fill="${leftColor}" font-family="inherit">${fmtVal(v, shortUnit(left.unit))}</text>`;
  }).join('');
  // Right Y-axis tick labels (anchored to chartX+chartW+12).
  const rightYLabels = isCompact ? '' : rightScale.ticks.map(v => {
    const y = projectRight(v);
    return `<text x="${chartX + chartW + 12}" y="${y + 8}" text-anchor="start" font-size="20" fill="${rightColor}" font-family="inherit">${fmtVal(v, shortUnit(right.unit))}</text>`;
  }).join('');

  // Use the LEFT axis's ticks for horizontal gridlines (analyst convention —
  // pick one to avoid a doubled grid). Render at lower opacity so left ticks
  // still feel attached.
  const grid = isCompact ? '' : leftScale.ticks.map(v => {
    const y = projectLeft(v);
    return `<line x1="${chartX}" y1="${y}" x2="${chartX + chartW}" y2="${y}" stroke="${t.muted}" stroke-width="0.5" stroke-opacity="0.3" stroke-dasharray="3,3"/>`;
  }).join('\n');

  const legendHtml = isCompact ? '' : `
    <span style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:${t.muted}; margin-left:18px;">
      <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${leftColor};"></span>
      ${esc(left.name)}${left.unit ? ` (${esc(left.unit)})` : ''}
    </span>
    <span style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:${t.muted}; margin-left:18px;">
      <span style="display:inline-block; width:12px; height:12px; border-radius:2px; background:${rightColor};"></span>
      ${esc(right.name)}${right.unit ? ` (${esc(right.unit)})` : ''}
    </span>`;

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const viewBoxX = isCompact ? chartX - 10 : 0;
  const viewBoxW = isCompact ? chartW + 20 : 960;
  const viewBoxH = isCompact ? chartH + 20 : 390;

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<div style="display:flex; align-items:baseline; flex-wrap:wrap; margin-bottom:10px;">
    <h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600; margin:0;">${escMd(data.title)}</h2>
    <div style="flex:1;"></div>
    ${legendHtml}
  </div>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="${viewBoxX} -30 ${viewBoxW} ${viewBoxH + 30}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${grid}
      <line x1="${chartX}" y1="${chartY + chartH}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="1"/>
      <line x1="${chartX}" y1="${chartY}" x2="${chartX}" y2="${chartY + chartH}" stroke="${leftColor}" stroke-width="0.6" stroke-opacity="0.5"/>
      <line x1="${chartX + chartW}" y1="${chartY}" x2="${chartX + chartW}" y2="${chartY + chartH}" stroke="${rightColor}" stroke-width="0.6" stroke-opacity="0.5"/>
      ${leftYLabels}
      ${rightYLabels}
      ${slots}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}

// ---------------------------------------------------------------------------
// 9. Heatmap
// ---------------------------------------------------------------------------

const HEATMAP_NEGATIVE_POLE = '#dc2626';

/** Auto-pick cell mode from cell types if author left it implicit. */
function pickHeatmapMode(data: HeatmapData): 'numeric' | 'dot' | 'text' {
  if (data.cellMode) return data.cellMode;
  for (const row of data.cells || []) {
    for (const cell of row) {
      if (typeof cell === 'number') return 'numeric';
      if (typeof cell === 'string' && cell.length > 0) return 'text';
    }
  }
  return 'numeric';
}

/** Compute numeric extent across all cells (skipping non-numeric / null). */
function heatmapExtent(cells: HeatmapData['cells']): { min: number; max: number } {
  let lo = Infinity, hi = -Infinity;
  for (const row of cells || []) {
    for (const c of row) {
      if (typeof c === 'number' && Number.isFinite(c)) {
        if (c < lo) lo = c;
        if (c > hi) hi = c;
      }
    }
  }
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = 1;
  return { min: lo, max: hi };
}

export function renderHeatmap(
  data: HeatmapData, t: ThemeConfig, theme: Theme,
  tw: number, _th: number, isImport = false,
): string {
  const rows = data.rows || [];
  const cols = data.cols || [];
  const cells = data.cells || [];
  const isCompact = tw > 0 && tw < 150;
  const mode = pickHeatmapMode(data);
  const ext = heatmapExtent(cells);
  const minV = data.scaleMin ?? ext.min;
  const maxV = data.scaleMax ?? ext.max;
  const scale = data.colorScale
    ?? (minV < 0 && maxV > 0 ? 'diverging' : 'sequential');
  const range = (maxV - minV) || 1;
  const titlePx = isImport ? autoFontSize(data.title, 22, 14) : autoFontSize(data.title, 26, 18);

  // Layout: 960×420 viewBox (shorter than slide height) leaves DOM siblings
  // space for the title and footnote which sit outside the SVG.
  const chartX = 180, chartY = 50, chartW = 740, chartH = 300;
  const colW = cols.length > 0 ? chartW / cols.length : chartW;
  const rowH = rows.length > 0 ? chartH / rows.length : chartH;

  const rowFontSize = autoCategoryFontSize(rows, rowH * 0.9, 26, 13);
  const colFontSize = autoCategoryFontSize(cols, colW * 0.95, 24, 12);

  // Color picker: returns {fill, opacity} for a numeric cell. Sequential ramps
  // from t.muted (low) to t.primary (high) via opacity. Diverging splits the
  // ramp around zero — negatives get the negative pole, positives t.primary.
  const cellNumericFill = (v: number): { fill: string; opacity: number } => {
    if (scale === 'diverging') {
      if (v >= 0) {
        const norm = maxV > 0 ? Math.min(1, v / maxV) : 0;
        return { fill: t.primary, opacity: 0.10 + 0.75 * norm };
      }
      const norm = minV < 0 ? Math.min(1, v / minV) : 0;
      return { fill: HEATMAP_NEGATIVE_POLE, opacity: 0.10 + 0.75 * norm };
    }
    const norm = Math.min(1, Math.max(0, (v - minV) / range));
    return { fill: t.primary, opacity: 0.08 + 0.78 * norm };
  };

  const sentimentFill = (s: 'positive' | 'neutral' | 'negative' | null | undefined): { fill: string; opacity: number } => {
    if (s === 'positive') return { fill: t.primary, opacity: 0.22 };
    if (s === 'negative') return { fill: HEATMAP_NEGATIVE_POLE, opacity: 0.22 };
    return { fill: t.muted, opacity: 0.10 };
  };

  // Format numeric cell label honoring optional unit. Lightly truncate big
  // numbers so they don't overflow narrow cells.
  const fmtCell = (v: number): string => {
    const u = shortUnit(data.unit);
    return fmtVal(Math.round(v * 100) / 100, u);
  };

  const rowLabelsSvg = isCompact ? '' : rows.map((r, i) => {
    const y = chartY + i * rowH + rowH / 2 + rowFontSize * 0.35;
    return `<text x="${chartX - 14}" y="${y}" text-anchor="end" font-size="${rowFontSize}" fill="${t.text}" font-family="inherit">${esc(r)}</text>`;
  }).join('');

  const colLabelsSvg = isCompact ? '' : cols.map((c, j) => {
    const x = chartX + j * colW + colW / 2;
    return `<text x="${x}" y="${chartY - 14}" text-anchor="middle" font-size="${colFontSize}" fill="${t.text}" font-family="inherit" font-weight="600">${esc(c)}</text>`;
  }).join('');

  const cellsSvg = rows.map((_, i) => {
    return cols.map((_c, j) => {
      const cell = cells[i]?.[j];
      const x = chartX + j * colW;
      const y = chartY + i * rowH;
      const cellPad = 2;
      const innerX = x + cellPad;
      const innerY = y + cellPad;
      const innerW = colW - cellPad * 2;
      const innerH = rowH - cellPad * 2;
      // Empty / null / undefined: subtle empty box
      if (cell == null || (typeof cell === 'string' && cell.length === 0)) {
        return `<rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="3" fill="${t.muted}" fill-opacity="0.05"/>`;
      }
      if (mode === 'dot' && typeof cell === 'number') {
        const norm = Math.min(1, Math.max(0, (Math.abs(cell) - 0) / Math.max(1e-9, Math.max(Math.abs(minV), Math.abs(maxV)))));
        const radius = Math.max(3, Math.min(innerW, innerH) / 2 - 4) * (0.35 + 0.6 * norm);
        const fill = scale === 'diverging' && cell < 0 ? HEATMAP_NEGATIVE_POLE : t.primary;
        return `<circle cx="${innerX + innerW / 2}" cy="${innerY + innerH / 2}" r="${radius}" fill="${fill}" fill-opacity="${(0.30 + 0.65 * norm).toFixed(2)}"/>`;
      }
      if (mode === 'text' || typeof cell === 'string') {
        const sentArr = data.sentiment?.[i];
        const s = sentArr ? sentArr[j] : undefined;
        const { fill, opacity } = sentimentFill(s);
        const txt = String(cell);
        const fontSize = autoCategoryFontSize([txt], innerW * 0.9, Math.min(rowFontSize, 22), 11);
        return `
          <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="4" fill="${fill}" fill-opacity="${opacity}"/>
          <text x="${innerX + innerW / 2}" y="${innerY + innerH / 2 + fontSize * 0.35}" text-anchor="middle" font-size="${fontSize}" fill="${t.text}" font-family="inherit" font-weight="500">${esc(txt)}</text>`;
      }
      // Numeric mode — color the cell and write the value inside.
      const v = cell as number;
      const { fill, opacity } = cellNumericFill(v);
      const fontSize = Math.min(22, Math.max(11, Math.floor(Math.min(innerW, innerH) * 0.42)));
      // Pick contrasting text color when the fill is dense.
      const textFill = opacity >= 0.55 ? ensureTextContrast('#ffffff', fill) : t.text;
      return `
        <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="4" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>
        <text x="${innerX + innerW / 2}" y="${innerY + innerH / 2 + fontSize * 0.35}" text-anchor="middle" font-size="${fontSize}" fill="${textFill}" font-family="inherit" font-weight="600">${esc(fmtCell(v))}</text>`;
    }).join('');
  }).join('\n');

  // Light grid lines between cells for legibility on dark themes.
  const gridSvg: string = isCompact ? '' : (() => {
    const parts: string[] = [];
    for (let j = 0; j <= cols.length; j++) {
      const x = chartX + j * colW;
      parts.push(`<line x1="${x}" y1="${chartY}" x2="${x}" y2="${chartY + chartH}" stroke="${t.border}" stroke-width="0.4" stroke-opacity="0.5"/>`);
    }
    for (let i = 0; i <= rows.length; i++) {
      const y = chartY + i * rowH;
      parts.push(`<line x1="${chartX}" y1="${y}" x2="${chartX + chartW}" y2="${y}" stroke="${t.border}" stroke-width="0.4" stroke-opacity="0.5"/>`);
    }
    return parts.join('\n');
  })();

  // Numeric legend strip (only for numeric/dot modes). Renders a small ramp
  // from minV → maxV with two value labels.
  const legendSvg: string = isCompact || mode === 'text' ? '' : (() => {
    const lx = chartX + chartW - 200;
    const ly = chartY + chartH + 28;
    const lw = 180, lh = 10;
    const stops = 12;
    const stopW = lw / stops;
    const stopRects: string[] = [];
    for (let k = 0; k < stops; k++) {
      const tFrac = k / (stops - 1);
      const v = minV + range * tFrac;
      const { fill, opacity } = cellNumericFill(v);
      stopRects.push(`<rect x="${lx + k * stopW}" y="${ly}" width="${stopW + 0.5}" height="${lh}" fill="${fill}" fill-opacity="${opacity.toFixed(2)}"/>`);
    }
    return `
      ${stopRects.join('')}
      <text x="${lx}" y="${ly - 4}" font-size="14" fill="${t.muted}" font-family="inherit">${esc(fmtCell(minV))}</text>
      <text x="${lx + lw}" y="${ly - 4}" text-anchor="end" font-size="14" fill="${t.muted}" font-family="inherit">${esc(fmtCell(maxV))}</text>`;
  })();

  const outerPad = isCompact ? '6px 8px' : '24px 44px';
  const hasNumericLegend = !isCompact && mode !== 'text';
  const viewBoxH = isCompact ? chartH + 30 : (hasNumericLegend ? 400 : 370);

  return `
<div class="${themeClass(theme)}" style="display:flex; flex-direction:column; ${baseStyle(t, isImport)} padding:${outerPad};">
  ${isCompact ? '' : `<h2 ${df('title')} style="font-size:${titlePx}px; color:${t.primary}; margin-bottom:12px; ${isImport ? IMPORT_WORD_BREAK : ''} font-weight:600;">${escMd(data.title)}</h2>`}
  <div style="flex:1; display:flex; align-items:center; justify-content:center;">
    <svg viewBox="0 0 960 ${viewBoxH}" style="width:100%; max-height:100%;" xmlns="http://www.w3.org/2000/svg">
      ${gridSvg}
      ${rowLabelsSvg}
      ${colLabelsSvg}
      ${cellsSvg}
      ${legendSvg}
    </svg>
  </div>
  ${!isCompact && data.footnote ? `<p ${df('footnote')} style="font-size:11px; color:${t.muted}; margin-top:8px; text-align:center;">${esc(data.footnote)}</p>` : ''}
</div>`;
}
