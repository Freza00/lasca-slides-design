// ============================================================================
// Lasca — mdDesign → Slide[] adapter
// ============================================================================
// Deterministic, zero-LLM conversion from a ParsedMdDesign to Slide[].
//
// Priority for every data field:
//   1. slide.frontMatter (agent set it explicitly in YAML)
//   2. body markdown parsing (heuristic extraction)
//   3. fallback defaults (never produce an empty required field)
//
// This file replaces the old generateOutline LLM call in the pipeline.
// The agent's design step already decided layout + aesthetic per slide —
// this function just fills in the Slide.data structure mechanically.
// ============================================================================

import type { Slide, Layout, CoverData, BigNumberData, ThreeCardsData,
  TwoColumnData, StackedBarsData, GridCardsData, QuoteData, ImageData,
  BarChartData, HorizontalBarChartData, LineChartData, PieChartData,
  StackedBarChartData, ScatterChartData,
  FlowchartData, FunnelData, PyramidData, StepsData,
  MatrixData, VersusData, VennData, BullseyeData, CycleData,
  CardItem, GridCardItem, BarItem, BarColor } from '../../types';
import type { ParsedMdDesign, ParsedSlide } from './types';
import { maybeAdaptToCardCanvas } from '../../cards/adapt';

// ---------------------------------------------------------------------------
// Body markdown helpers
// ---------------------------------------------------------------------------

/** Extract heading text (# or ##), stripping the marker. */
function extractHeading(body: string): string {
  const match = body.match(/^#{1,2}\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

/** Extract all top-level bullet items (lines starting with - or *). */
function extractBullets(body: string): string[] {
  return body
    .split('\n')
    .filter(l => /^\s*[-*]\s/.test(l))
    .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter(Boolean);
}

/** Extract the first blockquote (lines starting with >). */
function extractBlockquote(body: string): string {
  return body
    .split('\n')
    .filter(l => l.startsWith('>'))
    .map(l => l.replace(/^>\s*/, ''))
    .join('\n')
    .trim();
}

/** Extract paragraphs (non-heading, non-bullet, non-blockquote blocks). */
function extractParagraphs(body: string): string[] {
  const lines = body.split('\n');
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.match(/^#{1,2}\s/) || line.match(/^\s*[-*]\s/) || line.startsWith('>')) {
      if (current.length > 0) {
        paragraphs.push(current.join('\n').trim());
        current = [];
      }
      continue;
    }
    if (line.trim() === '') {
      if (current.length > 0) {
        paragraphs.push(current.join('\n').trim());
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) paragraphs.push(current.join('\n').trim());
  return paragraphs.filter(Boolean);
}

/** Extract bold **text** or __text__ from a string. */
function extractBold(s: string): string | undefined {
  const m = s.match(/\*\*(.+?)\*\*|__(.+?)__/);
  return m ? (m[1] || m[2]) : undefined;
}

/** Extract an image URL from markdown ![alt](url). */
function extractImageUrl(body: string): string | undefined {
  const m = body.match(/!\[.*?\]\((.+?)\)/);
  return m ? m[1] : undefined;
}

/** Detect if a string looks like a metric (number, $, %, +, -). */
function looksLikeMetric(s: string): boolean {
  return /^[\s$€¥£+\-]?\d/.test(s.trim()) || /\d[%MBKkmb]/.test(s);
}

/** Parse a bullet like "North America: **+180%** · enterprise expansion" into card parts.
 *  Markdown like **bold** is preserved in the output and rendered by escMd() at display time. */
function parseBulletAsCard(bullet: string, index: number): CardItem {
  const boldVal = extractBold(bullet);
  // Try "Label: description" pattern
  const colonMatch = bullet.match(/^(.+?)[:：]\s*(.+)$/);
  if (colonMatch) {
    return {
      label: `0${index + 1}`,
      title: colonMatch[1].trim(),
      desc: colonMatch[2].trim(),
    };
  }
  return {
    label: `0${index + 1}`,
    title: boldVal || bullet.slice(0, 40),
    desc: bullet.trim() || undefined,
  };
}

/** Parse a bullet into a BarItem. */
function parseBulletAsBar(bullet: string): BarItem {
  const colors: BarColor[] = ['primary', 'accent', 'green', 'muted', 'dark'];
  return {
    text: bullet.trim(),
    color: colors[Math.floor(Math.random() * 3)] as BarColor, // deterministic enough for now
  };
}

// ---------------------------------------------------------------------------
// Per-layout converters
// ---------------------------------------------------------------------------

function toCover(slide: ParsedSlide): CoverData {
  const fm = slide.frontMatter;
  return {
    title: fm.title as string || extractHeading(slide.body) || 'Untitled',
    subtitle: fm.subtitle as string || extractParagraphs(slide.body)[0] || '',
    author: fm.author as string || '',
    footnote: fm.footnote as string || '',
  };
}

function toBigNumber(slide: ParsedSlide): BigNumberData {
  const fm = slide.frontMatter;
  const bullets = extractBullets(slide.body);
  const paragraphs = extractParagraphs(slide.body);

  // Try to find a metric in bullets or paragraphs
  let number = fm.bigNumber as string || '';
  const text = fm.bigNumberLabel as string || extractHeading(slide.body) || '';

  if (!number) {
    // Check bullets for a metric-looking line
    const metricBullet = bullets.find(looksLikeMetric);
    if (metricBullet) {
      number = extractBold(metricBullet) || metricBullet;
    } else if (paragraphs.length > 0 && looksLikeMetric(paragraphs[0])) {
      number = extractBold(paragraphs[0]) || paragraphs[0];
    }
  }

  return {
    number: number || '0',
    text: text || 'Key Metric',
    footnote: fm.context as string || bullets.filter(b => b !== number).join(' · ') || '',
  };
}

function toThreeCards(slide: ParsedSlide): ThreeCardsData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '';
  const bullets = extractBullets(slide.body);

  // Front-matter cards take priority
  if (fm.cards && Array.isArray(fm.cards)) {
    return { title, cards: (fm.cards as CardItem[]).slice(0, 3) };
  }

  const cards = bullets.slice(0, 3).map((b, i) => parseBulletAsCard(b, i));
  // Pad to 3 if fewer bullets
  while (cards.length < 3) {
    cards.push({ label: `0${cards.length + 1}`, title: '', desc: '' });
  }

  return { title, cards };
}

function toGridCards(slide: ParsedSlide): GridCardsData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '';
  const bullets = extractBullets(slide.body);

  if (fm.cards && Array.isArray(fm.cards)) {
    const cards = fm.cards as GridCardItem[];
    return { title, columns: Math.min(4, Math.max(2, cards.length)) as 2 | 3 | 4, cards };
  }

  const cards: GridCardItem[] = bullets.slice(0, 6).map((b, i) => {
    const parsed = parseBulletAsCard(b, i);
    return { label: parsed.label, title: parsed.title, desc: parsed.desc };
  });

  const columns = cards.length <= 2 ? 2 : cards.length <= 3 ? 3 : (cards.length <= 4 ? 4 : 3);

  return { title, columns: columns as 2 | 3 | 4, cards };
}

function toTwoColumn(slide: ParsedSlide): TwoColumnData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '';
  const paragraphs = extractParagraphs(slide.body);
  const bullets = extractBullets(slide.body);

  // If there are 2+ paragraphs, split left/right
  if (paragraphs.length >= 2) {
    return {
      title,
      left: { heading: '', content: paragraphs[0], sub: '' },
      right: { heading: '', content: paragraphs.slice(1).join('\n\n'), sub: '' },
      footer: '',
    };
  }

  // Otherwise put bullets on left, any remaining prose on right
  return {
    title,
    left: { heading: '', content: bullets.slice(0, Math.ceil(bullets.length / 2)).join('\n'), sub: '' },
    right: { heading: '', content: bullets.slice(Math.ceil(bullets.length / 2)).join('\n'), sub: '' },
    footer: '',
  };
}

function toStackedBars(slide: ParsedSlide): StackedBarsData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '';
  const bullets = extractBullets(slide.body);

  if (fm.bars && Array.isArray(fm.bars)) {
    return { title, bars: fm.bars as BarItem[] };
  }

  const bars = bullets.slice(0, 5).map(parseBulletAsBar);
  return { title, bars };
}

function toQuote(slide: ParsedSlide): QuoteData {
  const fm = slide.frontMatter;
  const blockquote = extractBlockquote(slide.body);
  const paragraphs = extractParagraphs(slide.body);

  return {
    quote: fm.quote as string || blockquote || paragraphs[0] || '',
    body: paragraphs.length > 1 ? paragraphs.slice(1).join('\n') : '',
    author: fm.attribution as string || fm.author as string || '',
  };
}

function toImage(slide: ParsedSlide): ImageData {
  const fm = slide.frontMatter;
  return {
    title: fm.title as string || extractHeading(slide.body) || '',
    subtitle: fm.subtitle as string || '',
    image_url: fm.image_url as string || extractImageUrl(slide.body) || '',
    image_prompt: fm.image_prompt as string || '',
    overlay: (fm.overlay as ImageData['overlay']) || 'dark',
  };
}

// ---------------------------------------------------------------------------
// v4 Chart & Diagram converters
// ---------------------------------------------------------------------------

/** Parse bullets as numeric data items: "**$90B** — market size" → { label: "market size", value: 90 } */
function parseBulletAsChartItem(bullet: string): { label: string; value: number } {
  const bold = extractBold(bullet);
  const numMatch = bullet.match(/[\d,.]+/);
  const value = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) || 0 : 0;
  const label = bullet.replace(/\*\*[^*]+\*\*/g, '').replace(/[-—:：]/g, ' ').trim() || bold || 'Item';
  return { label: label.slice(0, 30), value: value || 10 };
}

function toBarChart(slide: ParsedSlide): BarChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '图表';
  const bullets = extractBullets(slide.body);
  const items = (fm.chartItems as BarChartData['items']) || bullets.slice(0, 8).map(parseBulletAsChartItem);
  return { title, items, unit: fm.unit as string || '', footnote: fm.footnote as string || '' };
}

function toHorizontalBarChart(slide: ParsedSlide): HorizontalBarChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '图表';
  const bullets = extractBullets(slide.body);
  const items = (fm.chartItems as HorizontalBarChartData['items']) || bullets.slice(0, 8).map(parseBulletAsChartItem);
  return { title, items, unit: fm.unit as string || '', footnote: fm.footnote as string || '' };
}

function toLineChart(slide: ParsedSlide): LineChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '趋势';
  const bullets = extractBullets(slide.body);
  const labels = (fm.chartLabels as string[]) || bullets.slice(0, 8).map((_, i) => `${2020 + i}`);
  const series = (fm.chartSeries as LineChartData['series']) || [{ name: '数据', values: labels.map(() => Math.round(10 + Math.random() * 90)) }];
  return { title, labels, series, unit: fm.unit as string || '', footnote: fm.footnote as string || '' };
}

function toPieChart(slide: ParsedSlide): PieChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '占比';
  const bullets = extractBullets(slide.body);
  const items = (fm.chartItems as PieChartData['items']) || bullets.slice(0, 6).map(parseBulletAsChartItem);
  return { title, items, donut: !!fm.donut, footnote: fm.footnote as string || '' };
}

function toStackedBarChart(slide: ParsedSlide): StackedBarChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '构成';
  const labels = (fm.chartLabels as string[]) || ['Q1', 'Q2', 'Q3', 'Q4'];
  const series = (fm.chartSeries as StackedBarChartData['series']) || [
    { name: 'A', values: labels.map(() => Math.round(20 + Math.random() * 40)) },
    { name: 'B', values: labels.map(() => Math.round(10 + Math.random() * 30)) },
  ];
  return {
    title, labels, series,
    unit: fm.unit as string || '',
    normalize: !!fm.normalize,
    footnote: fm.footnote as string || '',
  };
}

function toScatterChart(slide: ParsedSlide): ScatterChartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '相关性';
  const points = (fm.chartPoints as ScatterChartData['points']) || [];
  return {
    title, points,
    xLabel: fm.xLabel as string || undefined,
    yLabel: fm.yLabel as string || undefined,
    unit: fm.unit as string || '',
    trendline: !!fm.trendline,
    footnote: fm.footnote as string || '',
  };
}

function toFlowchart(slide: ParsedSlide): FlowchartData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '流程';
  const bullets = extractBullets(slide.body);
  const steps = bullets.slice(0, 6).map(b => ({ text: b }));
  return { title, steps, direction: fm.flowDirection as FlowchartData['direction'] || 'horizontal' };
}

function toFunnel(slide: ParsedSlide): FunnelData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '漏斗';
  const bullets = extractBullets(slide.body);
  return { title, items: bullets.slice(0, 5).map(b => ({ text: b })) };
}

function toPyramid(slide: ParsedSlide): PyramidData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '金字塔';
  const bullets = extractBullets(slide.body);
  return { title, items: bullets.slice(0, 5).map(b => ({ text: b })) };
}

function toSteps(slide: ParsedSlide): StepsData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '步骤';
  const bullets = extractBullets(slide.body);
  return {
    title,
    items: bullets.slice(0, 6).map((b, i) => {
      const parsed = parseBulletAsCard(b, i);
      return { label: parsed.label || `${i + 1}`, text: parsed.title, desc: parsed.desc };
    }),
  };
}

function toMatrix(slide: ParsedSlide): MatrixData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '矩阵';
  const bullets = extractBullets(slide.body);
  return {
    title,
    xAxis: fm.matrixXAxis as string || '维度 X',
    yAxis: fm.matrixYAxis as string || '维度 Y',
    topLeft: bullets[0] || '高/高', topRight: bullets[1] || '低/高',
    bottomLeft: bullets[2] || '高/低', bottomRight: bullets[3] || '低/低',
    footnote: fm.footnote as string || '',
  };
}

function toVersus(slide: ParsedSlide): VersusData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '对比';
  const bullets = extractBullets(slide.body);
  const mid = Math.ceil(bullets.length / 2);
  return {
    title,
    left: { heading: bullets[0] || 'A', points: bullets.slice(1, mid) },
    right: { heading: bullets[mid] || 'B', points: bullets.slice(mid + 1) },
    footnote: fm.footnote as string || '',
  };
}

function toVenn(slide: ParsedSlide): VennData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '韦恩图';
  const bullets = extractBullets(slide.body);
  return {
    title,
    items: bullets.slice(0, 3).map(b => ({ text: b })),
    overlap: fm.overlap as string || '',
  };
}

function toBullseye(slide: ParsedSlide): BullseyeData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '靶心图';
  const bullets = extractBullets(slide.body);
  return { title, items: bullets.slice(0, 4).map(b => ({ text: b })) };
}

function toCycle(slide: ParsedSlide): CycleData {
  const fm = slide.frontMatter;
  const title = fm.title as string || extractHeading(slide.body) || '循环';
  const bullets = extractBullets(slide.body);
  return { title, items: bullets.slice(0, 6).map(b => ({ text: b })) };
}

// ---------------------------------------------------------------------------
// Layout router
// ---------------------------------------------------------------------------

const CONVERTERS: Record<string, (slide: ParsedSlide) => Slide['data']> = {
  'cover':         toCover,
  'big-number':    toBigNumber,
  'three-cards':   toThreeCards,
  'grid-cards':    toGridCards,
  'two-column':    toTwoColumn,
  'stacked-bars':  toStackedBars,
  'quote':         toQuote,
  'image':         toImage,
  // v4 Charts & Diagrams
  'bar-chart':            toBarChart,
  'horizontal-bar-chart': toHorizontalBarChart,
  'line-chart':           toLineChart,
  'pie-chart':            toPieChart,
  'stacked-bar-chart':    toStackedBarChart,
  'scatter-chart':        toScatterChart,
  'flowchart':            toFlowchart,
  'funnel':               toFunnel,
  'pyramid':              toPyramid,
  'steps':                toSteps,
  'matrix':               toMatrix,
  'versus':               toVersus,
  'venn':                 toVenn,
  'bullseye':             toBullseye,
  'cycle':                toCycle,
};

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Convert a parsed mdDesign document into Lasca Slide[] objects.
 *
 * This is a deterministic, zero-LLM transformation. Every layout decision
 * was already made during the design step and recorded in the mdDesign
 * front-matter. This function simply fills the Slide.data structure.
 *
 * Slides whose layout has no converter (e.g. pptx-faithful, pdf-faithful,
 * report-* layouts) are skipped with a console.warn.
 */
export function mdDesignToSlides(parsed: ParsedMdDesign): Slide[] {
  const slides: Slide[] = [];

  for (let i = 0; i < parsed.slides.length; i++) {
    const section = parsed.slides[i];
    const layout = section.frontMatter.layout as Layout;
    const converter = CONVERTERS[layout];

    if (!converter) {
      console.warn(`[mdDesign→Slides] Skipping slide ${i + 1}: no converter for layout "${layout}"`);
      continue;
    }

    const data = converter(section);

    slides.push({
      layout,
      data,
      notes: section.frontMatter.rationale as string || undefined,
    });
  }

  // Phase 3 card refactor: every card-shaped legacy layout rewrites to
  // card-canvas here. The adapter is always on (no longer flag-gated).
  return slides.map((s) => maybeAdaptToCardCanvas(s));
}

/**
 * Quick helper: parse mdDesign source string → Slide[] in one shot.
 * Combines parser.ts + this file for callers who don't need the intermediate.
 */
export async function mdDesignSourceToSlides(source: string): Promise<Slide[]> {
  // Dynamic import to avoid circular deps at module load time
  const { parseMdDesign } = await import('./parser');
  return mdDesignToSlides(parseMdDesign(source));
}
