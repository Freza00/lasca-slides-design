// ============================================================================
// Lasca — Core Type Definitions
// ============================================================================

import type { CardCanvasData } from './cards/types';
export type { CardCanvasData } from './cards/types';
import type { ReportPageData } from './reports/types';
export type { ReportBlock, ReportPageData } from './reports/types';

export type Theme = 'warm' | 'cool' | 'dark' | 'original'
  // Legacy brand themes (kept for backward compatibility during v2 transition)
  | 'stripe' | 'linear' | 'notion' | 'vercel' | 'apple' | 'spotify' | 'airbnb' | 'ferrari'
  // Scene × Colorway themes (v2)
  | 'analyst-light' | 'analyst-mist' | 'analyst-dark'
  // Analysis report themes (v2.4, report-only) — rooted in bilingual-report-template skill
  | 'analysis-paper' | 'analysis-memo' | 'analysis-field'
  // Lookbook family (slide-only) — ember (Phase B) + forest / ink (Phase C)
  | 'lookbook-ember' | 'lookbook-forest' | 'lookbook-ink'
  // Private-banking family (slide-only) — Phase C: sovereign / noir / clay
  | 'private-banking-sovereign' | 'private-banking-noir' | 'private-banking-clay';

/** Theme family — composer queries this to pick which family rules apply.
 *  Each theme carries a `family` field; the composer never infers from id. */
export type ThemeFamily = 'base' | 'analysis' | 'private-banking' | 'lookbook';

export type Layout =
  | 'cover'
  | 'big-number'
  | 'three-cards'
  | 'two-column'
  | 'stacked-bars'
  | 'grid-cards'
  | 'quote'
  | 'image'
  // v3 — New slide layouts for better PDF→native coverage.
  | 'title-body'
  | 'split-image'
  | 'icon-list'
  | 'timeline'
  | 'table'
  // v4 — Chart & Diagram layouts (data viz + structural diagrams).
  | 'bar-chart'
  | 'horizontal-bar-chart'
  | 'line-chart'
  | 'pie-chart'
  | 'stacked-bar-chart'
  | 'scatter-chart'
  | 'dual-axis-bar'
  | 'heatmap'
  | 'flowchart'
  | 'funnel'
  | 'pyramid'
  | 'steps'
  | 'matrix'
  | 'versus'
  | 'venn'
  | 'bullseye'
  | 'cycle'
  // v5 — Business / pitch-deck layouts.
  | 'agenda'
  | 'team'
  | 'logo-wall'
  | 'pricing'
  | 'device-mockup'
  | 'section-break'
  | 'closing'
  | 'stat-row'
  // v6 — Complex compound layouts (screen-split, bento, dashboard, radial).
  | 'featured-grid'
  | 'bento'
  | 'dashboard'
  | 'hub-spoke'
  | 'title-bento'
  | 'pptx-faithful'
  | 'pdf-faithful'
  // v6.1 — svg-figure escape hatch: LLM emits sanitized inline SVG for
  // metaphorical/non-template visuals (bell curves, phase axes, layered
  // cakes). Adapted to card-canvas full-bleed; NOT registered in
  // LAYOUT_REGISTRY (no selector-model metadata fits).
  | 'svg-figure'
  // Card refactor: primary native layout — every supported legacy layout is
  // rewritten to card-canvas by adapt.ts. LAYOUT_REGISTRY entries above stay
  // as LLM vocabulary (human-readable names that generation prompts use).
  | 'card-canvas'
  // v2.4 — Report layouts (vertical letter/a4 format).
  // Deliberately fewer + simpler than slides: reports are mostly text, so the
  // layouts codify structural patterns (section heading, offset body column,
  // pull quote) rather than visual variety.
  | 'report-cover'
  | 'report-toc'
  | 'report-section'
  | 'report-body'
  | 'report-quote'
  | 'report-page';

// Runtime SSOT for every Layout union member. The Record-of-true shape forces
// compile-time exhaustiveness: add a value to the union above and TS will
// require it here too. Used by pipeline.ts to catch LLM-hallucinated layouts
// (e.g. "gradient-hero") before parallel slide generation.
const LAYOUT_RUNTIME: Record<Layout, true> = {
  'cover': true, 'big-number': true, 'three-cards': true, 'two-column': true,
  'stacked-bars': true, 'grid-cards': true, 'quote': true, 'image': true,
  'title-body': true, 'split-image': true, 'icon-list': true, 'timeline': true, 'table': true,
  'bar-chart': true, 'horizontal-bar-chart': true, 'line-chart': true, 'pie-chart': true,
  'stacked-bar-chart': true, 'scatter-chart': true, 'dual-axis-bar': true, 'heatmap': true,
  'flowchart': true, 'funnel': true, 'pyramid': true, 'steps': true, 'matrix': true,
  'versus': true, 'venn': true, 'bullseye': true, 'cycle': true,
  'agenda': true, 'team': true, 'logo-wall': true, 'pricing': true, 'device-mockup': true,
  'section-break': true, 'closing': true, 'stat-row': true,
  'featured-grid': true, 'bento': true, 'dashboard': true, 'hub-spoke': true, 'title-bento': true,
  'pptx-faithful': true, 'pdf-faithful': true, 'card-canvas': true, 'svg-figure': true,
  'report-cover': true, 'report-toc': true, 'report-section': true, 'report-body': true, 'report-quote': true, 'report-page': true,
};

export function isLayout(x: unknown): x is Layout {
  return typeof x === 'string' && x in LAYOUT_RUNTIME;
}

// ---------------------------------------------------------------------------
// Layout registry — single source of truth for picker UI.
// Add new layouts here; SlideToolbar reads this automatically.
// ---------------------------------------------------------------------------

export type LayoutCategory = 'content' | 'chart' | 'diagram';

/**
 * Intent groups — user-facing taxonomy for the Layout panel's "Intent" layer.
 * The user picks "what is this slide ABOUT", system derives composition.
 * Charts are excluded: they live in their own picker (data sub-type matters
 * more than intent for chart slides).
 */
export type IntentGroup =
  | 'structural'   // cover / section / agenda / quote
  | 'hero'         // single focal point: big number / hero image / prose
  | 'parallel'     // multiple equal items: cards / grid / list / pricing tiers
  | 'compare'      // two-sided or matrix comparison
  | 'sequence'     // ordered flow: timeline / steps / process
  | 'compound';    // mixed-emphasis: bento / dashboard / hub-spoke / venn

export const INTENT_GROUP_ORDER: IntentGroup[] =
  ['structural', 'hero', 'parallel', 'compare', 'sequence', 'compound'];

export const INTENT_GROUP_LABELS: Record<IntentGroup, { zh: string; en: string }> = {
  structural: { zh: '结构页',  en: 'Structural' },
  hero:       { zh: '单点强调', en: 'Single focus' },
  parallel:   { zh: '并列陈列', en: 'Parallel items' },
  compare:    { zh: '对比',    en: 'Compare' },
  sequence:   { zh: '流程',    en: 'Sequence' },
  compound:   { zh: '复合',    en: 'Compound' },
};

export const INTENT_GROUP_HINTS: Record<IntentGroup, { zh: string; en: string }> = {
  structural: { zh: '封面、章节、目录、引言这类导航/装饰页', en: 'Cover, section, agenda, quote — navigation pages' },
  hero:       { zh: '一页一个核心点：大数字、单图、一段话', en: 'One focal point: big number, one image, single passage' },
  parallel:   { zh: '多个等权项目并列展示', en: 'Multiple equal items shown side-by-side' },
  compare:    { zh: '两侧对照、矩阵、前后差异', en: 'Two sides, matrix, before/after' },
  sequence:   { zh: '时间、步骤、流程、漏斗', en: 'Timeline, steps, flow, funnel' },
  compound:   { zh: '不对称网格、KPI 看板、关系图', en: 'Asymmetric grid, KPI dashboard, relationships' },
};

export interface LayoutMeta {
  layout: Layout;
  label: { zh: string; en: string };
  category: LayoutCategory;
  /** Intent group for the user-facing "Intent" picker. Omit for layouts that
   *  shouldn't appear in the intent layer (charts live in the chart picker;
   *  some niche layouts may also opt out). */
  intent?: IntentGroup;
  /** LLM selection guidance — omit for layouts not suitable for auto-selection */
  hint?: { zh: string; en: string };
}

/**
 * All user-selectable layouts, grouped by category.
 * Faithful and report layouts are excluded (not switchable in the picker).
 * When you add a new Layout to the union above, add it here too.
 */
export const LAYOUT_REGISTRY: LayoutMeta[] = [
  // Content layouts
  { layout: 'cover',        label: { zh: '封面', en: 'Cover' },           category: 'content', intent: 'structural' },
  { layout: 'big-number',   label: { zh: '数字', en: 'Big Number' },      category: 'content', intent: 'hero',
    hint: { en: 'Single prominent stat/metric (e.g. "73% growth"). Use when one number is the hero.', zh: '单个突出指标（如"73%增长"）。当一个数字是主角时用。' } },
  { layout: 'three-cards',  label: { zh: '三卡', en: 'Three Cards' },     category: 'content', intent: 'parallel',
    hint: { en: 'Three equal items (challenge/solution/result, or 3 features). Balanced, scannable.', zh: '三个并列项（挑战/方案/成果，或3个特性）。均衡、易扫读。' } },
  { layout: 'two-column',   label: { zh: '双栏', en: 'Two Column' },      category: 'content', intent: 'compare',
    hint: { en: 'Side-by-side comparison or complementary ideas. Good for before/after, pros/cons, concept + example.', zh: '左右对比或互补内容。适合前后对比、优缺点、概念+示例。' } },
  { layout: 'stacked-bars', label: { zh: '横条', en: 'Stacked Bars' },    category: 'content', intent: 'parallel',
    hint: { en: 'Horizontal progress bars or ranked items. Use for priorities, feature comparison, maturity levels.', zh: '横向进度条或排名列表。适合优先级、功能对比、成熟度分级。' } },
  { layout: 'grid-cards',   label: { zh: '网格', en: 'Grid Cards' },      category: 'content', intent: 'parallel',
    hint: { en: '4-6 items in a grid. Good for feature lists, team members, customer logos.', zh: '4-6个项目的网格。适合功能列表、团队成员、客户logo。' } },
  { layout: 'quote',        label: { zh: '引用', en: 'Quote' },           category: 'content', intent: 'structural',
    hint: { en: 'Large text, minimal decoration. Use for punchlines, questions, or powerful quotes.', zh: '大字体，极简装饰。适合金句、问题、有力引用。' } },
  { layout: 'image',        label: { zh: '图片', en: 'Image' },           category: 'content', intent: 'hero' },
  { layout: 'title-body',   label: { zh: '标题正文', en: 'Title + Body' }, category: 'content', intent: 'hero',
    hint: { en: 'Title + flowing prose body. Use for narrative or explanatory content with no clear bullet structure.', zh: '标题+正文段落。适合叙述性或解释性内容，没有明显的bullet结构。' } },
  { layout: 'split-image',  label: { zh: '图文分栏', en: 'Split Image' }, category: 'content', intent: 'compare' },
  { layout: 'icon-list',    label: { zh: '图标列表', en: 'Icon List' },   category: 'content', intent: 'parallel',
    hint: { en: '3-5 items each with an icon. Good for benefits, principles, or feature highlights.', zh: '3-5个带图标的项目。适合优势、原则或功能亮点。' } },
  { layout: 'timeline',     label: { zh: '时间线', en: 'Timeline' },      category: 'content', intent: 'sequence',
    hint: { en: 'Chronological sequence. Use when time/order matters (roadmap, history, process stages).', zh: '时间顺序。当时间/顺序重要时用（路线图、历史、流程阶段）。' } },
  { layout: 'table',        label: { zh: '表格', en: 'Table' },           category: 'content', intent: 'compare',
    hint: { en: 'Structured rows and columns. Use for comparing multiple attributes across multiple items.', zh: '结构化行列。适合多个项目跨多个属性的对比。' } },
  // Business / pitch-deck
  { layout: 'agenda',        label: { zh: '议程', en: 'Agenda' },          category: 'content', intent: 'structural',
    hint: { en: 'Table of contents / agenda. Use for TOC pages listing the deck sections.', zh: '目录/议程。用于列出章节的目录页。' } },
  { layout: 'team',          label: { zh: '团队', en: 'Team' },            category: 'content', intent: 'parallel' },
  { layout: 'logo-wall',     label: { zh: '品牌墙', en: 'Logo Wall' },    category: 'content', intent: 'parallel' },
  { layout: 'pricing',       label: { zh: '定价', en: 'Pricing' },         category: 'content', intent: 'parallel' },
  { layout: 'device-mockup', label: { zh: '设备展示', en: 'Device Mockup' }, category: 'content', intent: 'hero' },
  { layout: 'section-break', label: { zh: '章节页', en: 'Section Break' }, category: 'content', intent: 'structural',
    hint: { en: 'Section divider with title + subtitle. Use at major topic transitions in long decks.', zh: '章节分隔页，有标题+副标题。用于长篇演示的主题切换处。' } },
  { layout: 'closing', label: { zh: '结尾页', en: 'Closing' }, category: 'content', intent: 'structural',
    hint: { en: 'Final "Thank You" slide. Title + optional subtitle + optional signature line. NO numeric badge — that\'s what section-break is for.', zh: '结尾"感谢聆听"页。标题+可选副标题+可选署名行。不带编号——那是 section-break 的职责。' } },
  { layout: 'stat-row',      label: { zh: '指标', en: 'Stat Row' },        category: 'content', intent: 'parallel',
    hint: { en: 'Row of 3-4 key metrics side by side. Use when you have multiple stats to show at once.', zh: '3-4个关键指标并排展示。有多个数据需要同时呈现时用。' } },
  // v6 Compound
  { layout: 'featured-grid', label: { zh: '上文下卡', en: 'Featured Grid' }, category: 'content', intent: 'compound',
    hint: { en: 'Hero text above + card grid below. Use for a key point supported by multiple sub-items.', zh: '上方核心文字+下方卡片网格。适合一个核心观点+多个支撑项。' } },
  { layout: 'bento',         label: { zh: '混合网格', en: 'Bento Grid' },   category: 'content', intent: 'compound',
    hint: { en: 'Asymmetric grid of mixed-size cards. Use for rich, varied content with visual hierarchy.', zh: '不对称混合尺寸卡片网格。适合内容丰富、有视觉层次的页面。' } },
  { layout: 'dashboard',     label: { zh: 'KPI面板', en: 'Dashboard' },     category: 'content', intent: 'compound',
    hint: { en: 'KPI dashboard with multiple metrics and charts. Use for performance review or analytics pages.', zh: 'KPI面板，含多个指标和图表。适合绩效回顾或数据分析页。' } },
  { layout: 'title-bento',   label: { zh: '标题卡片', en: 'Title Bento' },  category: 'content', intent: 'compound',
    hint: { en: 'Large title + supporting cards. Use for section openers or concept introductions.', zh: '大标题+支撑卡片。适合章节开篇或概念介绍。' } },
  // Charts
  { layout: 'bar-chart',            label: { zh: '柱状图', en: 'Bar Chart' },   category: 'chart',
    hint: { en: 'Vertical bars comparing categories. Use for 3-6 data points across categories.', zh: '纵向柱状图对比类别。有3-6个类别数据点时用。' } },
  { layout: 'horizontal-bar-chart', label: { zh: '横柱图', en: 'H-Bar Chart' }, category: 'chart',
    hint: { en: 'Horizontal bars for ranked lists. Better than vertical when labels are long.', zh: '横向柱状图，适合排名列表。标签较长时比纵向更好。' } },
  { layout: 'line-chart',           label: { zh: '折线图', en: 'Line Chart' },  category: 'chart',
    hint: { en: 'Trend over time. Use for growth curves, performance tracking, forecasts.', zh: '随时间的趋势。适合增长曲线、绩效追踪、预测。' } },
  { layout: 'pie-chart',            label: { zh: '饼图', en: 'Pie Chart' },     category: 'chart',
    hint: { en: 'Part-to-whole breakdown. Use sparingly — only when percentages add to 100%.', zh: '部分与整体的关系。谨慎使用——仅当百分比加总为100%时。' } },
  { layout: 'stacked-bar-chart',    label: { zh: '堆叠柱图', en: 'Stacked Bar' }, category: 'chart',
    hint: { en: 'Part-to-whole across categories (e.g. channel mix by quarter). Use when each category splits into the same sub-components.', zh: '跨类别的部分-整体关系（如按季度的渠道占比）。每个类别都拆分成相同子项时用。' } },
  { layout: 'scatter-chart',        label: { zh: '散点图', en: 'Scatter' },      category: 'chart',
    hint: { en: 'Two-variable correlation. Use to show relationship between two metrics; optional trendline.', zh: '双变量相关性。展示两个指标之间的关系；可选趋势线。' } },
  { layout: 'dual-axis-bar',        label: { zh: '双轴柱图', en: 'Dual-Axis Bar' }, category: 'chart',
    hint: { en: 'Two metrics on different scales side-by-side per category (e.g. rent + vacancy by region). Use when comparing units of different magnitude.', zh: '同一类别下两个不同量纲指标并排（如各地区租金+空置率）。两个指标量级不同时用。' } },
  { layout: 'heatmap',              label: { zh: '热力图', en: 'Heatmap' },     category: 'chart',
    hint: { en: 'Color-graded matrix of rows × columns. Use for sector × indicator scoring, region × period intensity, multi-dimensional categorical comparison.', zh: '行×列着色矩阵。适合行业×指标打分、地区×周期强度、多维度分类对比。' } },
  // Diagrams (also surfaced in Intent picker via `intent` field)
  { layout: 'flowchart',  label: { zh: '流程图', en: 'Flowchart' },   category: 'diagram', intent: 'sequence',
    hint: { en: 'Decision tree or branching logic. Use for conditional processes, user journeys.', zh: '决策树或分支逻辑。适合条件流程、用户旅程。' } },
  { layout: 'funnel',     label: { zh: '漏斗', en: 'Funnel' },        category: 'diagram', intent: 'sequence',
    hint: { en: 'Narrowing stages (e.g. sales funnel). Use when volume decreases at each step.', zh: '递减阶段（如销售漏斗）。每步数量减少时用。' } },
  { layout: 'pyramid',    label: { zh: '金字塔', en: 'Pyramid' },     category: 'diagram', intent: 'compound',
    hint: { en: 'Hierarchical layers from base to apex. Use for priority tiers or Maslow-style models.', zh: '从底部到顶部的层级结构。适合优先级层级或马斯洛式模型。' } },
  { layout: 'steps',      label: { zh: '步骤', en: 'Steps' },         category: 'diagram', intent: 'sequence',
    hint: { en: 'Numbered sequential process (1→2→3). Use for how-to, workflows, sequential actions.', zh: '编号顺序流程（1→2→3）。适合操作指南、工作流、顺序动作。' } },
  { layout: 'matrix',     label: { zh: '矩阵', en: 'Matrix' },        category: 'diagram', intent: 'compare',
    hint: { en: '2×2 grid (e.g. impact/effort, urgent/important). Use for prioritization frameworks.', zh: '2×2矩阵（如影响/投入、紧急/重要）。适合优先级框架。' } },
  { layout: 'versus',     label: { zh: '对比', en: 'Versus' },        category: 'diagram', intent: 'compare',
    hint: { en: 'Head-to-head comparison (A vs B). Use for competitive analysis, old vs new approach.', zh: '正面对比（A vs B）。适合竞品分析、新旧方案对比。' } },
  { layout: 'venn',       label: { zh: '韦恩', en: 'Venn' },          category: 'diagram', intent: 'compound',
    hint: { en: 'Overlapping circles showing shared and unique attributes. Use for overlap/intersection analysis.', zh: '重叠圆圈展示共同和独特属性。适合交集/重叠分析。' } },
  { layout: 'bullseye',   label: { zh: '靶心', en: 'Bullseye' },      category: 'diagram', intent: 'compound',
    hint: { en: 'Concentric rings showing priority or focus levels. Use for target audience or priority tiers.', zh: '同心圆展示优先级或聚焦层级。适合目标受众或优先级分层。' } },
  { layout: 'cycle',      label: { zh: '循环', en: 'Cycle' },         category: 'diagram', intent: 'sequence',
    hint: { en: 'Circular repeating process. Use for feedback loops, recurring workflows, or lifecycle stages.', zh: '循环重复流程。适合反馈循环、周期性工作流或生命周期阶段。' } },
  { layout: 'hub-spoke',  label: { zh: '辐射图', en: 'Hub-Spoke' },   category: 'diagram', intent: 'compound',
    hint: { en: 'Central concept with radiating connections. Use for one core idea with multiple related elements.', zh: '中心概念向外辐射连接。适合一个核心概念+多个相关元素。' } },
];

// ---------------------------------------------------------------------------
// Intent grouping helpers — used by SlideToolbar / CardSidePanel.
// ---------------------------------------------------------------------------

/** Layouts in a given intent group, in registry order. */
export function layoutsByIntent(intent: IntentGroup): LayoutMeta[] {
  return LAYOUT_REGISTRY.filter(m => m.intent === intent);
}

/** All intent groups paired with their layouts (preserves INTENT_GROUP_ORDER).
 *  Empty groups are skipped. */
export function layoutsGroupedByIntent(): { intent: IntentGroup; items: LayoutMeta[] }[] {
  return INTENT_GROUP_ORDER
    .map(intent => ({ intent, items: layoutsByIntent(intent) }))
    .filter(g => g.items.length > 0);
}

// --- Per-layout data types ---

/** Slide-channel cover variants. Independent registry from the report channel.
 *  When unset, `renderCover` falls back to its default editorial layout.
 *  New variants land in Phase B/C as composer-driven renderers come online. */
export type SlideCoverVariant =
  | 'private-banking-split'
  | 'private-banking-classic'
  | 'lookbook-hero'
  | 'lookbook-numbered'
  | 'lookbook-bold';

export interface CoverData {
  title: string;
  /** Optional English title for bilingual covers (lookbook / private-banking
   *  variants). When present, renderers stack ZH on top + EN underneath in
   *  label face. Default cover ignores this field — single-language only. */
  titleEn?: string;
  subtitle?: string;
  footnote?: string;
  author?: string;
  coverVariant?: SlideCoverVariant;
  /** Optional numbered pills used by `lookbook-numbered` (and future variants).
   *  Composer or LLM populates this; renderer defaults to ['01'..'05'] when absent. */
  pills?: Array<{ num: string; label?: string }>;
}

export interface BigNumberData {
  number: string;
  text: string;
  footnote?: string;
  highlight?: string;
}

export interface CardItem {
  label: string;
  title: string;
  desc?: string;
  /** Optional badge/tag pill shown above the card title (e.g. "Mass market leaders"). */
  badge?: string;
  /** Optional image URL displayed in the card. */
  image_url?: string;
}

export interface ThreeCardsData {
  title: string;
  cards: CardItem[];
}

export interface ColumnData {
  heading?: string;
  content?: string;
  sub?: string;
}

/** Inline chart embedded in a layout (split-image or two-column). */
export interface ChartEmbed {
  type: Layout;
  data: Record<string, unknown>;
}

export interface TwoColumnData {
  title: string;
  left: ColumnData;
  right: ColumnData;
  footer?: string;
  /** When set, replaces the designated column with an inline chart. */
  chart?: ChartEmbed;
  chartPosition?: 'left' | 'right';
}

export type BarColor = 'primary' | 'accent' | 'green' | 'muted' | 'dark';

export interface BarItem {
  text: string;
  color: BarColor;
}

export interface StackedBarsData {
  title: string;
  bars: BarItem[];
}

export interface GridCardItem {
  label: string;
  title: string;
  desc?: string;
  /** Optional badge/tag pill shown above the card title. */
  badge?: string;
  /** Optional image URL displayed in the card. */
  image_url?: string;
}

export interface GridCardsData {
  title: string;
  columns: 2 | 3 | 4;
  cards: GridCardItem[];
  footer?: string;
}

export interface QuoteData {
  quote: string;
  body?: string;
  highlight?: string;
  author?: string;
}

export type Overlay = 'dark' | 'light' | 'none';

export interface ImageData {
  title?: string;
  subtitle?: string;
  image_prompt?: string;
  image_url?: string;
  overlay?: Overlay;
}

// --- v3 new slide layout data types ---

/** Title + body paragraphs — the most common slide type for narrative content. */
export interface TitleBodyData {
  title: string;
  /** Paragraphs separated by \n\n, lines by \n. */
  body: string;
  footnote?: string;
}

/** Image fills one half, text content on the other. */
export interface SplitImageData {
  title?: string;
  /** Supports \n for line breaks. */
  body?: string;
  image_url?: string;
  image_prompt?: string;
  /**
   * 'left' | 'right' — side-by-side (text on the other side).
   * 'top' | 'bottom' — vertical stack. 'bottom' = 上文下图 (text above, media below),
   * the analyst default when chart is present.
   */
  imagePosition: 'left' | 'right' | 'top' | 'bottom';
  /** When set, renders chart in the image area instead of image_url. */
  chart?: ChartEmbed;
}

/** Vertical list of items with icons/numbers on the left. */
export interface IconListItem {
  icon: string;
  text: string;
  sub?: string;
}

export interface IconListData {
  title: string;
  items: IconListItem[];
}

/** Horizontal timeline with labeled events and connectors. */
export interface TimelineEvent {
  label: string;
  title: string;
  desc?: string;
}

export interface TimelineData {
  title: string;
  events: TimelineEvent[];
}

/** Multi-column comparison table. */
export interface TableData {
  title: string;
  headers: string[];
  rows: string[][];
  /** Column index to highlight with accent background. */
  highlight?: number;
  footnote?: string;
}

// --- v4: Chart data types (SVG-rendered, numeric) ---

export interface BarChartItem {
  label: string;
  value: number;
  /** Override the auto-assigned palette color for this bar (e.g. accent the
   *  current quarter, mute peers). When unset, falls back to `labelColor(i, t)`. */
  color?: string;
}

/**
 * Annotation primitives for analyst-style charts. 宪法 §4.2：reference line
 * shows targets / baselines, range-band shows acceptable zones, callout pins
 * a short label to a specific data point.
 */
export type ChartAnnotation =
  | { type: 'reference-line'; value: number; label?: string }
  | { type: 'range-band'; from: number; to: number; label?: string }
  | { type: 'callout'; at: number | string; text: string; seriesIndex?: number };

export interface BarChartData {
  title: string;
  items: BarChartItem[];
  unit?: string;
  footnote?: string;
  annotations?: ChartAnnotation[];
  /** Grouped (multi-series) mode: when both `labels` and `series` are set, each
   *  category in `labels` gets one bar per series rendered side-by-side. `items`
   *  is ignored in this mode. Mirrors `HorizontalBarChartData.labels/series`. */
  labels?: string[];
  series?: LineChartSeries[];
}

export interface HorizontalBarChartItem {
  label: string;
  value: number;
  /** Override the auto-assigned palette color for this bar. */
  color?: string;
}

export interface HorizontalBarChartData {
  title: string;
  items: HorizontalBarChartItem[];
  unit?: string;
  footnote?: string;
  annotations?: ChartAnnotation[];
  /** Grouped (multi-series) mode: when `series` is set, each category in `labels`
   *  gets one bar per series rendered side-by-side. `items` is ignored in this mode. */
  labels?: string[];
  series?: LineChartSeries[];
  /** Diverging mode: bars cross a zero line; negative values extend left, positive
   *  extend right. Use for sentiment / surplus-vs-deficit / gap charts. Works in
   *  both single-series (`items`) and grouped (`labels`+`series`) modes. */
  diverging?: boolean;
}

export interface LineChartSeries {
  name: string;
  values: number[];
}

export interface LineChartData {
  title: string;
  labels: string[];
  series: LineChartSeries[];
  unit?: string;
  footnote?: string;
  annotations?: ChartAnnotation[];
  /** Fill under the line (area chart mode). FT Visual Vocabulary "magnitude". */
  area?: boolean;
}

/**
 * Stacked vertical bars: each category splits into the same sub-components.
 * FT Visual Vocabulary "part-to-whole over time" / "magnitude composition".
 */
export interface StackedBarChartData {
  title: string;
  labels: string[];               // category axis, e.g. ['Q1','Q2','Q3','Q4']
  series: LineChartSeries[];      // each series = one stack segment across all categories
  unit?: string;
  /** Normalize each bar to 100% — emphasizes composition over magnitude. */
  normalize?: boolean;
  footnote?: string;
  annotations?: ChartAnnotation[];
}

/**
 * Heatmap matrix: rows × cols of cells, each colored by a value or sentiment.
 * Three rendering modes:
 *  - `numeric`: cell value rendered as text, fill opacity scales with magnitude
 *  - `dot`: a circle in each cell whose radius/opacity scales with magnitude
 *  - `text`: cells contain a string label (e.g. "强烈支持"); fill driven by `sentiment`
 *  Auto mode: if cells are numbers → `numeric`; if strings → `text`.
 */
export interface HeatmapData {
  title: string;
  rows: string[];
  cols: string[];
  cells: (number | string | null | undefined)[][];
  cellMode?: 'numeric' | 'dot' | 'text';
  unit?: string;
  /** For text mode: per-cell sentiment governs fill color. Same shape as `cells`. */
  sentiment?: ('positive' | 'neutral' | 'negative' | null | undefined)[][];
  scaleMin?: number;
  scaleMax?: number;
  /** sequential: 0→max maps muted→primary. diverging: <0 uses negative pole, >0 primary. */
  colorScale?: 'sequential' | 'diverging';
  footnote?: string;
}

/**
 * Dual-axis vertical bar chart: each category gets one bar from `leftSeries`
 * and one bar from `rightSeries`, scaled against independent left and right
 * Y-axes. Use when two metrics with different units (e.g. rent $ / sqft vs
 * vacancy %) need to be read together per category.
 */
export interface DualAxisBarChartData {
  title: string;
  labels: string[];
  leftSeries: { name: string; values: number[]; unit?: string };
  rightSeries: { name: string; values: number[]; unit?: string };
  footnote?: string;
}

export interface ScatterChartPoint {
  x: number;
  y: number;
  label?: string;
  group?: string;
}

/**
 * Two-variable scatter. FT Visual Vocabulary "correlation".
 * Optional trendline is a simple linear regression, drawn only when there
 * are ≥ 3 points.
 */
export interface ScatterChartData {
  title: string;
  xLabel?: string;
  yLabel?: string;
  points: ScatterChartPoint[];
  unit?: string;
  trendline?: boolean;
  footnote?: string;
  annotations?: ChartAnnotation[];
}

export interface PieChartItem {
  label: string;
  value: number;
}

export interface PieChartData {
  title: string;
  items: PieChartItem[];
  donut?: boolean;
  footnote?: string;
}

// --- v4: Diagram data types (HTML/CSS + SVG, text-centric) ---

export interface FlowchartStep {
  text: string;
  /** 'dashed' marks a step that's 摩擦/假设/未成熟—rendered with dashed border. */
  style?: 'solid' | 'dashed';
  /** Short label rendered on the arrow to the next step (e.g. "模型厂商往上吃"). */
  transitionLabel?: string;
  /** One-liner rendered alongside the step (right for horizontal, below for vertical).
   *  For fan-out flows where each branch needs its own side-note ("简单但 M × N"). ≤10 汉字. */
  annotation?: string;
  /** Mark one step as the recommended/preferred branch. Renders a small star + accent color. */
  highlight?: 'recommended';
}

/** A vertical bracket spanning `fromIndex..toIndex` (inclusive, 0-based) with
 *  a label—used to group sub-sequences inside a diagram ("跟你无关" across
 *  bottom 4 layers of a pyramid). */
export interface GroupLabel {
  fromIndex: number;
  toIndex: number;
  text: string;
}

export interface FlowchartData {
  title: string;
  steps: FlowchartStep[];
  direction?: 'horizontal' | 'vertical';
  footnote?: string;
  groupLabel?: GroupLabel;
}

export interface FunnelItem {
  text: string;
}

export interface FunnelData {
  title: string;
  items: FunnelItem[];
  footnote?: string;
}

export interface PyramidItem {
  text: string;
  /** One-liner rendered to the right of this layer ("烧钱的地方"). ≤10 汉字. */
  sidenote?: string;
  /** 'dashed' = 未成熟/假设/摩擦. */
  style?: 'solid' | 'dashed';
}

/** items[0] = top (smallest layer), last = bottom (widest). */
export interface PyramidData {
  title: string;
  items: PyramidItem[];
  footnote?: string;
  groupLabel?: GroupLabel;
}

export interface StepsItem {
  label: string;
  text: string;
  desc?: string;
  /** One-liner rendered to the right of this step. ≤10 汉字. */
  sidenote?: string;
  /** Short label between this step and the next ("模型厂商往上吃"). */
  transitionLabel?: string;
}

export interface StepsData {
  title: string;
  items: StepsItem[];
  footnote?: string;
  groupLabel?: GroupLabel;
}

export interface MatrixData {
  title: string;
  xAxis: string;
  yAxis: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  footnote?: string;
}

export interface VersusData {
  title: string;
  left: { heading: string; points: string[] };
  right: { heading: string; points: string[] };
  footnote?: string;
}

export interface VennItem {
  text: string;
}

export interface VennData {
  title: string;
  items: VennItem[];
  overlap?: string;
  footnote?: string;
}

export interface BullseyeItem {
  text: string;
}

/** items[0] = innermost ring, last = outermost. */
export interface BullseyeData {
  title: string;
  items: BullseyeItem[];
  footnote?: string;
}

export interface CycleItem {
  text: string;
  /** One-liner rendered outside the ring, near this node. ≤10 汉字. */
  sidenote?: string;
  /** Label rendered on the arrow from this node to the next. */
  transitionLabel?: string;
}

export interface CycleData {
  title: string;
  items: CycleItem[];
  footnote?: string;
}

// --- v5: Business / pitch-deck layout data types ---

export interface AgendaItem {
  text: string;
  sub?: string;
}

/** Agenda / table-of-contents page with optional highlight on current item. */
export interface AgendaData {
  title: string;
  items: AgendaItem[];
  /** 0-based index of the currently active / highlighted item. */
  active?: number;
}

export interface TeamMember {
  name: string;
  role: string;
  /** Emoji, initials, or image URL shown as avatar. */
  avatar?: string;
}

/** Team grid — 2-6 members with avatar, name, and role. */
export interface TeamData {
  title: string;
  members: TeamMember[];
}

export interface LogoItem {
  name: string;
  image_url?: string;
}

/** Logo wall — partner / client logo grid. */
export interface LogoWallData {
  title: string;
  subtitle?: string;
  logos: LogoItem[];
}

export interface PricingTier {
  name: string;
  price: string;
  period?: string;
  features: string[];
  /** Mark this tier as recommended / highlighted. */
  highlight?: boolean;
  cta?: string;
}

/** Pricing comparison — 2-4 tier cards side by side. */
export interface PricingData {
  title: string;
  tiers: PricingTier[];
  footnote?: string;
}

/** Device mockup — phone or laptop frame wrapping a screenshot. */
export interface DeviceMockupData {
  title?: string;
  subtitle?: string;
  device: 'phone' | 'laptop';
  image_url?: string;
  image_prompt?: string;
}

/** Section break / chapter divider — large centered heading with optional number. */
export interface SectionBreakData {
  title: string;
  subtitle?: string;
  /** Chapter/section number, e.g. "01", "Part 1". */
  number?: string;
}

/** Closing / "Thank You" slide — end-of-deck sign-off. No numeric badge
 *  (that's what SectionBreak is for); optional byline for author / audience. */
export interface ClosingData {
  title: string;
  subtitle?: string;
  /** Author / team line, e.g. "Acme Research Team". */
  signature?: string;
  /** Role / audience line, e.g. "For Institutional Investors Only". */
  role?: string;
}

export interface StatItem {
  value: string;
  label: string;
  /** Trend indicator, e.g. "+12%", "↑ 5pts". */
  change?: string;
  /** Sparkline data points for a tiny trend visualization. */
  trend?: number[];
  /** 0-1 ratio for a mini donut chart (e.g. 0.92 = 92%). */
  donut?: number;
}

/** Stat row — 3-4 KPI metrics displayed horizontally. */
export interface StatRowData {
  title?: string;
  stats: StatItem[];
  footnote?: string;
}

// --- v6: Complex compound layouts ---

export interface FeaturedGridTile {
  icon?: string;
  title: string;
  desc?: string;
  /** Optional badge/tag pill shown above the tile title. */
  badge?: string;
  /** Optional image URL displayed at the top of the tile. */
  image_url?: string;
  /** Inline chart rendered inside this tile (replaces icon/image). */
  chart?: ChartEmbed;
}

/** Hero text zone (top ~35%) + bottom tile grid (2-4 columns). */
export interface FeaturedGridData {
  title: string;
  subtitle?: string;
  body?: string;
  tiles: FeaturedGridTile[];
  columns?: 2 | 3 | 4;
}

export interface BentoItem {
  heading: string;
  body?: string;
  icon?: string;
  /** When true, this item gets the large tile in asymmetric layouts. */
  highlight?: boolean;
  /** Optional badge/tag pill shown above the heading. */
  badge?: string;
  /** Optional image URL displayed in the tile. */
  image_url?: string;
  /** Inline chart rendered inside this tile. */
  chart?: ChartEmbed;
}

/** Asymmetric mixed-size tile grid (Apple bento-box style). 3-6 items. */
export interface BentoData {
  title?: string;
  items: BentoItem[];
}

export interface DashboardMetric {
  value: string;
  label: string;
  change?: string;
  /** Sparkline data points (renders tiny line chart). */
  trend?: number[];
  /** 0-1 ratio for mini donut (e.g. 0.92 = 92%). */
  donut?: number;
}

/** Multi-metric KPI tile grid with optional mini-charts. */
export interface DashboardData {
  title?: string;
  metrics: DashboardMetric[];
  columns?: 2 | 3;
}

export interface HubSpokeItem {
  text: string;
  desc?: string;
  /** One-liner rendered near this spoke, separate from `desc`. ≤10 汉字.
   *  Use for "why this spoke matters" callouts; keep `desc` for definitional text. */
  sidenote?: string;
}

/** Radial concept map: central idea with 4-8 radiating spokes. */
export interface HubSpokeData {
  title: string;
  center: string;
  spokes: HubSpokeItem[];
  footnote?: string;
}

export interface TitleBentoCard {
  heading: string;
  body?: string;
  /** Optional badge/tag pill shown above the heading. */
  badge?: string;
  /** Optional image URL displayed in the card. */
  image_url?: string;
  /** Inline chart rendered inside this card. */
  chart?: ChartEmbed;
}

/** Left hero title (~40%) + right card grid (~60%). Chronicle-inspired. */
export interface TitleBentoData {
  /** Small category label above the title (e.g. "Key dynamics"). */
  label?: string;
  title: string;
  footer?: string;
  cards: TitleBentoCard[];
}

// --- Report-specific data types (v2.4) ---

/** Title page of a report. Centered vertical stack. */
export interface ReportCoverData {
  title: string;
  subtitle?: string;
  date?: string;
  author?: string;
  /** Count of h2 sections in the source — surfaced as a metadata chip on
   *  covers and as the page subtitle of the dedicated TOC page. */
  sectionCount?: number;
  /** Estimated reading time in minutes, derived from content length at
   *  paginate time. Blends EN words and CJK chars at ~900 c/m. */
  readingMinutes?: number;
  /** Layout variant for the cover. If omitted, `defaultVariantForTheme` picks
   *  one based on theme personality. `editorial` / `masthead` / `index` are
   *  the generic variants; `paper` / `memo` / `field` are bespoke to the
   *  analysis-* premium themes. */
  coverVariant?: 'editorial' | 'masthead' | 'index' | 'paper' | 'memo' | 'field';
}

/** Dedicated table-of-contents page that sits between the cover and the body.
 *  Populated by `mdToReportDeck` from the full list of h2 section titles
 *  (disclaimer sections excluded). Emitted only when the source has ≥ 3
 *  h2 sections — shorter reports don't warrant a dedicated page. */
export interface ReportTocData {
  /** One entry per h2 heading, in source order. */
  entries: { number: string; title: string }[];
  /** Optional deck-level title mirror — lets the TOC page reference its parent
   *  report without re-parsing the cover slide. Kept optional for robustness. */
  reportTitle?: string;
  date?: string;
  author?: string;
  /** Mirrored from cover for contextual footer — not re-derived. */
  readingMinutes?: number;
}

/** A section of a report: heading + body paragraphs, optional right-side callout. */
export interface ReportSectionData {
  /** Optional section number like "1", "2.1", "A". */
  number?: string;
  heading: string;
  /** Body text, paragraphs separated by \n\n. */
  body: string;
  /** Optional warm-tinted quote box occupying the right column. */
  callout?: string;
}

/** Body-heavy page. Full-width by default; `offset: true` shifts body to the
 *  right 62% column with an optional left-column `sidenote` — codifies the
 *  "standard report puts text on the right side" pattern. */
export interface ReportBodyData {
  body: string;
  offset?: boolean;
  sidenote?: string;
  footnote?: string;
}

/** Pull quote page. Large italic quote with attribution. */
export interface ReportQuoteData {
  quote: string;
  attribution?: string;
  context?: string;
}

/**
 * Pixel-imperfect 1:1 import of a PPTX slide.
 * The rawHtml is an absolutely-positioned HTML fragment produced by an
 * OOXML parser (e.g. @jvmr/pptx-to-html); inline images are baked in as
 * data URLs. The slide is read-only in v1 — AI polish patches it via
 * applyRawHtmlPatch on the store, not via data-field bindings.
 */
export interface PptxFaithfulData {
  rawHtml: string;
  /** AI-rewritten HTML with CSS var references for theme-aware colors.
   *  Used when theme !== 'original'. Original rawHtml preserved for
   *  faithful display. Generated by /api/ai/recolor endpoint. */
  themedHtml?: string;
  width: number;
  height: number;
  backgroundColor?: string;
  /** original page index in the source PPTX, 0-based */
  sourcePage?: number;
}

/**
 * Text-layer-based 1:1 import of a PDF page. Mirrors PptxFaithfulData
 * so the Canvas / Presenter / image-escape code can reuse the same
 * `data-pptx-faithful` / `data-pptx-inner` markers.
 */
export type PdfPageSize = 'letter' | 'a4' | 'custom';

export interface PdfFaithfulData {
  rawHtml: string;
  /** AI-rewritten HTML with CSS var references for theme-aware colors. */
  themedHtml?: string;
  width: number;     // page width in PDF points (72 DPI)
  height: number;    // page height in PDF points
  pageSize: PdfPageSize;
  backgroundColor?: string;
  sourcePage?: number;
}

/** svg-figure — LLM-authored sanitized inline SVG for metaphorical /
 *  non-template visuals (bell curves, phase axes, layered cakes). Content
 *  flows through adapt.ts → card-canvas full-bleed. svg string is sanitized
 *  by sanitizeSvg() at render time; callers pass it in raw. */
export interface SvgFigureData {
  svg: string;
  title?: string;
  caption?: string;
  /** Optional aspect ratio hint (width / height). Defaults to 16/9. */
  aspectRatio?: number;
}

// --- Slide & Deck ---

export type SlideData =
  | CoverData
  | BigNumberData
  | ThreeCardsData
  | TwoColumnData
  | StackedBarsData
  | GridCardsData
  | QuoteData
  | ImageData
  | TitleBodyData
  | SplitImageData
  | IconListData
  | TimelineData
  | TableData
  | BarChartData
  | HorizontalBarChartData
  | LineChartData
  | PieChartData
  | DualAxisBarChartData
  | HeatmapData
  | FlowchartData
  | FunnelData
  | PyramidData
  | StepsData
  | MatrixData
  | VersusData
  | VennData
  | BullseyeData
  | CycleData
  | AgendaData
  | TeamData
  | LogoWallData
  | PricingData
  | DeviceMockupData
  | SectionBreakData
  | ClosingData
  | StatRowData
  | FeaturedGridData
  | BentoData
  | DashboardData
  | HubSpokeData
  | TitleBentoData
  | PptxFaithfulData
  | PdfFaithfulData
  | CardCanvasData
  | ReportCoverData
  | ReportTocData
  | ReportSectionData
  | ReportBodyData
  | ReportQuoteData
  | ReportPageData;

// Slide entry transition style — applied to all children of the slide
export type TransitionType =
  | 'fade'        // pure cross-fade (calm)
  | 'slide-up'    // all elements rise from below
  | 'slide-down'  // drop in from above
  | 'slide-left'  // glide in from the right (moving leftward)
  | 'slide-right' // glide in from the left (moving rightward)
  | 'zoom'        // scale up from 0.92 to 1.0
  | 'none';       // instant, no animation

/** Per-slide style overrides — a subset of ThemeConfig that can be set on
 *  individual slides to override the deck-level theme. The AI edit flow
 *  writes to these fields for visual modifications (e.g. "变成黑色"). */
export interface SlideStyleOverrides {
  bg?: string;           // 背景色/渐变 (CSS background value)
  text?: string;         // 正文颜色
  primary?: string;      // 标题/强调色
  accent?: string;       // 辅色
  muted?: string;        // 弱色
  cardBg?: string;       // 卡片背景
  cardShadow?: string;   // 卡片阴影
  fontHeadline?: string; // 标题字体
  fontBody?: string;     // 正文字体
  headlineWeight?: number;
}

/** Origin of a slide — determines rendering strategy. */
export type SlideSource = 'generated' | 'imported' | 'manual';

/** N2 — review state machine borrowed from Claude Design's register_assets. */
export type ReviewStatus = 'needs-review' | 'approved' | 'changes-requested';

export interface Slide {
  layout: Layout;
  data: SlideData;
  /** Where this slide came from. 'imported' triggers relaxed rendering
   *  (auto font sizing, overflow:auto) so PDF/PPTX content isn't clipped. */
  source?: SlideSource;
  style?: SlideStyleOverrides;
  notes?: string;
  transition?: TransitionType; // optional override; falls back to layout default
  /** Scale factor for the chart/diagram body area (default 1.0).
   *  Applied via `transform: scale(chartScale)` on the chart container.
   *  Only meaningful for chart/diagram layouts. Range: 0.5–1.5. */
  chartScale?: number;
  /** Per-element drag offsets for diagram layouts. Key = data-field path,
   *  value = pixel offset from normal flow position. Applied as position:relative + left/top. */
  _dragOffsets?: Record<string, { x: number; y: number }>;
  /** Per-element width/height overrides set by the corner resize handles.
   *  Key = data-field path, value = pixel size. Applied as inline style.
   *  Without this, native-slide resize was DOM-only — invisible to undo and
   *  wiped on next render (the headline 'undo doesn't work' bug). */
  _dragSizes?: Record<string, { w?: number; h?: number }>;
  /** Per-field inline style overrides set by StylePanel (color, fontSize,
   *  fontFamily, fontWeight, textAlign, opacity, backgroundColor).
   *  Key = data-field path. Same recovery story as _dragSizes — without this,
   *  StylePanel changes were DOM-only and not undoable. */
  _fieldStyles?: Record<string, Partial<{
    color: string;
    backgroundColor: string;
    fontSize: string;
    fontFamily: string;
    fontWeight: string;
    fontStyle: string;
    textDecoration: string;
    textAlign: string;
    opacity: string;
  }>>;
  /** data-field paths hidden in the rendered canvas. Used by canvas-delete
   *  on native slides — underlying slide.data stays intact so undo restores,
   *  while post-render removes matching elements from the DOM. Faithful slides
   *  don't use this (they serialize raw HTML via updateFaithfulRawHtml). */
  _hiddenFields?: string[];
  /** Semantic page type (封面/内容/数据/...). Set by create flow or user override.
   *  When absent, inferPageType() derives it from layout + position. */
  pageType?: import('@/lib/ai/harness/types').PageType;
  /** N2 — optional review state. Only rendered when LASCA_REVIEW_STATUS flag is on. */
  reviewStatus?: ReviewStatus;
}

// Default transition per layout
export const DEFAULT_TRANSITION: Record<Layout, TransitionType> = {
  'cover':         'fade',
  'quote':         'fade',
  'big-number':    'zoom',
  'three-cards':   'slide-up',
  'grid-cards':    'slide-up',
  'two-column':    'slide-left',
  'stacked-bars':  'slide-up',
  'image':         'fade',
  // v3 new layouts
  'title-body':    'fade',
  'split-image':   'slide-left',
  'icon-list':     'slide-up',
  'timeline':      'slide-left',
  'table':         'fade',
  // v4 Charts & Diagrams
  'bar-chart':            'slide-up',
  'horizontal-bar-chart': 'slide-left',
  'line-chart':           'fade',
  'pie-chart':            'zoom',
  'stacked-bar-chart':    'slide-up',
  'scatter-chart':        'fade',
  'dual-axis-bar':        'slide-up',
  'heatmap':              'fade',
  'flowchart':            'slide-left',
  'funnel':               'slide-up',
  'pyramid':              'zoom',
  'steps':                'slide-up',
  'matrix':               'fade',
  'versus':               'slide-left',
  'venn':                 'fade',
  'bullseye':             'zoom',
  'cycle':                'fade',
  // v5 Business
  'agenda':         'fade',
  'team':           'slide-up',
  'logo-wall':      'fade',
  'pricing':        'slide-up',
  'device-mockup':  'zoom',
  'section-break':  'fade',
  'closing':        'fade',
  'stat-row':       'slide-up',
  // v6 Compound
  'featured-grid':  'slide-up',
  'bento':          'fade',
  'dashboard':      'slide-up',
  'hub-spoke':      'fade',
  'title-bento':    'slide-left',
  'pptx-faithful': 'fade',
  'pdf-faithful':  'fade',
  // Card refactor — card-canvas is the primary layout; per-composition
  // transitions live in DEFAULT_TRANSITION_BY_COMPOSITION below. This entry
  // is the final fallback for composition ids not in that overlay.
  'card-canvas':   'fade',
  // svg-figure is adapted to card-canvas full-bleed; transition falls through
  // to card-canvas anyway, but the exhaustive Record<Layout, TransitionType>
  // requires the entry.
  'svg-figure':    'fade',
  // Reports: quieter than slides by default
  'report-cover':   'fade',
  'report-toc':     'fade',
  'report-section': 'fade',
  'report-body':    'fade',
  'report-quote':   'fade',
  'report-page':    'fade',
};

/** For faithful decks (pdf-faithful / pptx-faithful) every slide has the
 *  same layout, so DEFAULT_TRANSITION would return 'fade' for every page.
 *  Auto mode instead rotates through this small set by slide index so the
 *  audience sees varied entries across a long document. */
const FAITHFUL_AUTO_ROTATION: TransitionType[] = ['fade', 'slide-up', 'zoom', 'slide-left'];

/** Per-composition transition overlay for card-canvas slides. Keyed by
 *  compositionId. Miss → falls back to DEFAULT_TRANSITION['card-canvas'].
 *  Keeps card-canvas slides from collapsing to a uniform 'fade'. */
export const DEFAULT_TRANSITION_BY_COMPOSITION: Record<string, TransitionType> = {
  // 18 canonical compositions — one entry each.
  'full-bleed':       'fade',
  'full-center':      'fade',
  'split-equal':      'slide-left',
  'split-media':      'slide-left',
  'split-60-40':      'slide-left',
  'split-40-60':      'slide-left',
  'stack-text-media': 'slide-up',
  'stack-media-text': 'slide-up',
  'grid-2col':        'slide-up',
  'grid-3col':        'slide-up',
  'grid-4col':        'slide-up',
  'grid-2x2':         'slide-up',
  'bento-1+2':        'slide-up',
  'bento-1+3':        'slide-up',
  'bento-1+4':        'slide-up',
  'bento-2x3':        'fade',
  'hero-grid':        'slide-up',
  'title-grid':       'slide-left',
};

export function getTransition(slide: Slide, slideIndex?: number): TransitionType {
  if (slide.transition) return slide.transition;
  // Faithful layouts get a per-index rotation so same-layout decks still
  // have visual variety. Native layouts use their DEFAULT_TRANSITION entry
  // (which already varies because each native layout has a distinct value).
  if ((slide.layout === 'pdf-faithful' || slide.layout === 'pptx-faithful')
      && typeof slideIndex === 'number') {
    return FAITHFUL_AUTO_ROTATION[slideIndex % FAITHFUL_AUTO_ROTATION.length];
  }
  // card-canvas: consult per-composition overlay so most slides don't
  // collapse to 'fade' (the single DEFAULT_TRANSITION['card-canvas'] entry).
  if (slide.layout === 'card-canvas') {
    const cid = (slide.data as { compositionId?: string } | undefined)?.compositionId;
    if (cid) {
      const overlay = DEFAULT_TRANSITION_BY_COMPOSITION[cid];
      if (overlay) return overlay;
    }
  }
  return DEFAULT_TRANSITION[slide.layout] || 'fade';
}

export const TRANSITION_LABELS: Record<TransitionType, { zh: string; en: string }> = {
  'fade':        { zh: '淡入', en: 'Fade' },
  'slide-up':    { zh: '从下', en: 'From bottom' },
  'slide-down':  { zh: '从上', en: 'From top' },
  'slide-left':  { zh: '从右', en: 'From right' },
  'slide-right': { zh: '从左', en: 'From left' },
  'zoom':        { zh: '放大', en: 'Zoom' },
  'none':        { zh: '无', en: 'None' },
};

/** Page-size the deck should render and export at. */
export type DeckPageSize = 'slide-16:9' | 'letter' | 'a4' | 'custom';

/**
 * How a pdf-faithful slide should be rendered on screen.
 * - 'raster': full-page rasterised PNG/JPEG from pdfjs page.render() — 100%
 *   visual fidelity (vector paths, charts, masks, form XObjects, etc.) but
 *   only the text layer is editable. Default for new PDF imports (v2.4+).
 * - 'vector': text spans + extracted bitmap images, no background raster —
 *   high editability but coverage is limited to what the operator-list walk
 *   supports. Used for decks that need heavy text editing.
 */
export type PdfRenderMode = 'raster' | 'vector';

export interface Deck {
  id: string;
  name: string;
  theme: Theme;
  slides: Slide[];
  /** Defaults to 'slide-16:9' (960×540 landscape). PDF faithful imports
   *  set this from the detected PDF page size. */
  pageSize?: DeckPageSize;
  /** Required when pageSize === 'custom'; in CSS pixels at 96 DPI. */
  pageWidth?: number;
  pageHeight?: number;
  /** For decks containing pdf-faithful slides: which layer is visible.
   *  Defaults to 'raster' on fresh imports (v2.4+). Can be toggled from
   *  the status-bar button in the editor. */
  pdfRenderMode?: PdfRenderMode;
  /** 底纹 (Texture) — static background SVG patterns that sit below the
   *  content. Default on. Turning off gives a "plain palette" look.
   *  Independent from ambient. */
  texture?: boolean;
  /** Per-theme texture variant id (e.g. { warm: 'grid', cool: 'diagonal',
   *  dark: 'constellation' }). When a theme's key is missing, falls back
   *  to the theme's default variant. See lib/themes.ts → TEXTURE_VARIANTS
   *  for the catalog. Each theme tracks its variant independently — toggling
   *  theme doesn't reset the others. */
  textureVariant?: Partial<Record<Theme, string>>;
  /** 氛围 (Ambience) — animated motion layer ON TOP of texture. Default on.
   *  Can be off while texture stays on. Independent from texture. */
  ambient?: boolean;
  /** Per-theme ambient variant id (e.g. { warm: 'glow', cool: 'shimmer',
   *  dark: 'campfire' }). Each theme has its own catalog of ambient effects.
   *  When a key is missing, falls back to the theme's first (default) variant.
   *  See lib/themes.ts → AMBIENT_VARIANTS. */
  ambientVariant?: Partial<Record<Theme, string>>;
  /** Optional running header text — rendered at the top of every report-*
   *  page as a small muted line with a hairline rule below. Ignored for
   *  slide/faithful layouts. */
  header?: string;
  /** Optional running footer text — rendered at the bottom of every
   *  report-* page as a small muted line with a hairline rule above.
   *  Ignored for slide/faithful layouts. */
  footer?: string;
  /** 文字锁: when true, AI edits can only modify style/layout/transition,
   *  not text content in data. Auto-enabled after generation. */
  contentLocked?: boolean;
  /** Style preset used to generate this deck (e.g. 'minimal', 'stripe').
   *  Informs default layout for newly added slides and is shown in the toolbar. */
  presetId?: string;
  /** For report-type decks: the original markdown source. When present, the
   *  editor switches to the two-pane report view (md textarea + live paged.js
   *  render) instead of the slide Canvas. Slide decks leave this undefined. */
  sourceMd?: string;
}

// --- AI Chat ---

export type ChatMessageType = 'user' | 'greeting' | 'hint' | 'status' | 'action' | 'done' | 'confirm';

export interface ChatMessage {
  id: string;
  type: ChatMessageType;
  text: string;
  timestamp: number;
  pages?: number[];       // affected pages
  detail?: string;        // collapsible detail for 'action' type
  scope?: 'page' | 'multi' | 'global';
  scopeLabel?: string;
  options?: { label: string; action: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

// --- Theme Config ---

export interface ThemeConfig {
  /** Family this theme belongs to. Set on every theme registered in `THEMES`.
   *  Composer reads this directly — no classify(), no id-prefix inference.
   *  Optional only because legacy brand themes are migrated lazily (Phase D). */
  family?: ThemeFamily;
  /** Theme-level prompt hints injected into LLM2 system prompt when this
   *  theme is active. For brand themes, this is where the (formerly
   *  preset-owned) brand voice / typography / layout rules live. Orchestrator
   *  dedups against preset.promptAppendix when preset id matches theme id. */
  promptHints?: string;
  primary: string;
  accent: string;
  bg: string;          // 可以是 hex 或任意 CSS background value (gradient 等)
  text: string;
  muted: string;
  green: string;
  dark: string;
  border: string;
  cardBg: string;
  cardShadow: string;
  // === Typography (全 optional, 有 fallback) ===
  fontHeadline?: string;            // 默认 fontBody
  fontBody?: string;                // 默认 "'Poppins','Noto Sans SC',sans-serif"
  headlineWeight?: number;          // 默认 700
  headlineTracking?: string;        // 默认 cover/big-number/quote 的 -1px / 其它的 0
  headlineFeatures?: string;        // CSS font-feature-settings, 默认 normal
  headlineStyle?: 'normal' | 'italic'; // 默认 normal
  headlineVariationSettings?: string;  // CSS font-variation-settings (Fraunces wonky 用)
  opticalSizing?: 'auto' | 'none';  // Fraunces 用得到

  // === Layered fonts v1 (2026-04-16) — all optional, fallback chain ===
  // Lets institutional themes (analyst-*) use distinct fonts per role.
  fontDisplay?: string;             // cover title / big-number hero. Fallback: fontHeadline → fontBody
  fontLabel?: string;               // badges, eyebrows, folio, table headers. Fallback: fontBody
  fontNumeric?: string;             // stat numbers, KPI, numeric table cells. Fallback: fontHeadline → fontBody
  numericFeatures?: string;         // CSS font-feature-settings for numerics, 默认 "'tnum', 'lnum'"
  labelTracking?: string;           // letter-spacing for labels, 默认 '0.08em'
  labelTransform?: 'uppercase' | 'none'; // text-transform for labels, 默认 'uppercase'
  // === Surface / shape ===
  cardSurface?: string;             // 替代 cardShadow，承载 hairline/glow/shadow 组合
  radiusCard?: number;              // 默认 12 (three-cards) / 10 (grid-cards)
  radiusBar?: number;               // 默认 8 (stacked-bars)
  /** Chrome strategy for multi-slot compositions in the card-canvas renderer.
   *  'none' = bare regions (CSS grid only, no tile bg). 'subtle' = cardBg +
   *  cardShadow. 'framed' = subtle + 1px border. Default 'none'. */
  cardChrome?: 'none' | 'subtle' | 'framed';

  // === Signature v2 (2026-04-15) — all optional, backward-compat ===

  /** Latin-only headline stack. When set, `fontHeadline` should be built as
   *  `${fontHeadlineLatin}, ${fontHeadlineCjk}, <generic>` so CSS cascade picks
   *  the right font per character. Leave unset to keep the single-stack fallback. */
  fontHeadlineLatin?: string;
  fontBodyLatin?: string;
  /** CJK headline / body stacks. Together with *Latin they enable per-character
   *  font switching without JS. */
  fontHeadlineCjk?: string;
  fontBodyCjk?: string;

  /** ONE distinctive visual element repeated across all layouts of this style
   *  (pptx skill: "Commit to a visual motif"). The id routes to a renderer in
   *  renderSlide.ts → renderThemeDecoration / renderReportSignature. */
  motif?: {
    id: string;              // 'paper-deckle' | 'hairline-frame' | 'crop-marks' | ...
  };

  /** 1-line tagline shown on StylePicker cards; also piped into AI prompts as
   *  direction ("Editorial Warmth" vs "Industrial Precision"). */
  philosophy?: {
    zh: string;
    en: string;
  };

  /** Per-locale thumbnail preview text — lets StylePicker render native-feeling
   *  sample content instead of reusing the card name. */
  previewCopy?: {
    zh: { title: string; subtitle: string; body: string };
    en: { title: string; subtitle: string; body: string };
  };

  /** Editorial caption styling — used for uppercase section captions, page
   *  folios, footer marks. Pairs with `fontHeadline` not a separate font. */
  captionStyle?: {
    textTransform?: 'uppercase' | 'none';
    letterSpacing?: string;
    fontSize?: string;
    fontWeight?: number;
  };

  /** Which decoration strategy to run on top of this theme. Renderer reads
   *  these to pick between `motif-default` (use motif.id lookup), `minimal`
   *  (no decoration at all, apple), or `baseline` (report universal chrome). */
  decoration?: {
    slide?: 'motif-default' | 'minimal';
    report?: 'baseline' | 'motif-default' | 'minimal';
  };

  // === Scene Design Dimensions v2 (2026-04-16) — all optional, backward-compat ===
  // These let a scene express not just typography + palette, but also its
  // data-viz language, table conventions, image treatment, AI rules, and the
  // 60/25/15 color dominance ratio that real institutional decks follow.

  /** Color dominance ratio. Consumed by CSS as custom properties + AI prompt
   *  rules so one color stays dominant rather than painting every pill/badge
   *  in equal weight. Example: `{primary: 60, accent: 25, muted: 15}`. */
  paletteWeight?: { primary: number; accent: number; muted: number };

  /** Data visualization language. Consumed by renderCharts.ts primitives via
   *  `getVizPalette(t)` — replaces the generic labelColor() rainbow cycle
   *  with a curated ordinal palette that matches the scene's firm. */
  dataViz?: {
    paletteOrdinal: string[];
    gridOpacity?: number;
    axisColor?: string;
    barCornerRadius?: number;
  };

  /** Table styling conventions. Consumed by renderTable in renderSlide.ts. */
  table?: {
    headerBg?: string;
    headerText?: string;
    rowStripeBg?: string;
    borderStyle?: 'hairline' | 'solid' | 'none';
    rightAlignNumbers?: boolean;
  };

  /** Image treatment — CSS filter applied to <img> + optional overlay gradient. */
  imageTreatment?: {
    filter?: string;
    overlayGradient?: string;
  };

  /** Structured Do's & Don'ts for AI prompt injection. */
  rules?: { must?: string[]; avoid?: string[] };
}
