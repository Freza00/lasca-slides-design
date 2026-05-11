// ============================================================================
// Lasca AI Harness — Type definitions
// ============================================================================
// 这一层是"壳"——包裹现有 pipeline.ts，加上 clarifier / style preset / 硬约束校验 / trace。
// 现有 pipeline.ts 保持不动，作为内部的 "basic generator"。
// ============================================================================

import type { Slide, Layout, Theme, ThemeFamily, SlideCoverVariant } from '../../types';

// ----- Workflow 类型 -----

export type WorkflowType =
  | 'generate-from-draft'
  | 'redesign-deck'
  | 'extend-deck'
  | 'match-style'
  | 'edit-page';

// ----- Clarifier 相关 -----

/** 每个问题的一个选项 */
export interface ClarifierOption {
  /** 选项显示文字 */
  label: string;
  /** 选项内部值（传回 orchestrator） */
  value: string | number;
  /** 可选的短说明（在选项下方小字展示） */
  hint?: string;
  /** 选中后显示的反馈语，说明这个选项如何影响输出 */
  implication?: string;
  /** B3 — optional ~80×56 inline SVG markup rendered above label.
   *  Use for *visual* decisions (density / preset / narrative structure)
   *  where text alone makes the user guess. Skip for factual questions
   *  (audience, length, data-emphasis) — the extra art becomes clutter. */
  previewSvg?: string;
  /** "由你决定" sentinel — selecting it means user abdicates this axis to
   *  the LLM. Value is conventionally '__defer__'; stripped from answers
   *  before they hit LLM1/LLM2 so the default-recommendation path runs. */
  isDecideForYou?: boolean;
}

/** 一个 clarifier 问题 */
export interface ClarifierQuestion {
  id: string;
  header: string;   // 短标签，如"目标受众"
  question: string; // 完整的问句
  /** 问句下方小字副标题，例 "这会影响语言风格和数据深度" */
  hint?: string;
  options: ClarifierOption[];
  /** 是否允许多选。默认 false。 */
  multiSelect?: boolean;
  /** LLM 基于内容预选的答案（value 或 value[] for multi-select）。
   *  QAStep 用它做 pill pre-select + "推荐" badge。*/
  recommendedValue?: string | number | (string | number)[];
  /** 渲染 "Other…" 自由文本框。输入非空覆盖 pill 选择，值存为 `custom:${text}`。*/
  allowCustom?: boolean;
}

/** Sentinel value for the "let AI decide" option. */
export const DECIDE_FOR_YOU_VALUE = '__defer__';

/** Step 1 pill axes — LLM Q&A must never duplicate these.
 *  See `feedback_clarifier_step_division.md` in user memory for the rule. */
export const STEP1_AXES = [
  'audience',
  'length',
  'language',
  'narrative',
  'evidence',
  'density',
  'purpose',
  'key-takeaway',   // mapped from `narrative` in TopicInput submit
] as const;

/** Clarifier 对用户输入的判定 */
export type Complexity = 'trivial' | 'simple' | 'medium' | 'complex';

/** Clarifier 的决策结果 */
export type ClarifierDecision =
  | { action: 'proceed'; answers: ClarifierAnswers }
  | { action: 'ask'; questions: ClarifierQuestion[] };

/** 用户对 clarifier 问题的回答集合（id → value） */
export type ClarifierAnswers = Record<string, string | number | (string | number)[]>;

// ----- Style Preset -----

/** Built-in preset ids (hand-crafted in stylePresets.ts) */
export type BuiltinPresetId =
  | 'minimal'           // Linear / Vercel 感：单色、留白大、无装饰
  | 'warm'              // Lasca 招牌暖色：#d97757 主色，适合复盘、汇报
  | 'dark-tech'         // terminal-style：纯黑、等宽字
  | 'editorial'         // 杂志感：衬线字、非对称布局
  | 'playful'           // 圆角、饱和色、适合 pitch / 对外展示
  | 'bilingual-report'; // 机构研报：Kai + 暖纸色 + 橙色 accent，仅 report

/** Premium preset ids */
export type PremiumPresetId =
  | 'stripe'
  | 'linear'
  | 'notion'
  | 'vercel'
  | 'apple'
  | 'spotify'
  | 'airbnb'
  | 'ferrari';

/** All preset ids */
export type StylePresetId = BuiltinPresetId | PremiumPresetId;

// ----- Composer (Phase B): preset-as-function -----
//
// `derivePreset(inputs) → ComputedPreset` is the new path. The 14 hand-written
// `StylePreset` objects above stay for legacy CreateFlow / clarifier callers
// until Phase D deletes them; the composer is dead-code from the orchestrator's
// view until step 7 wires CreateFlow to call it.

/** Re-export so harness consumers don't need a second import path. */
export type { ThemeFamily } from '../../types';

/** Eyebrow convention by family — composer reads this to keep section heads
 *  consistent across a deck. Plain string `'NONE'` means no eyebrow chrome. */
export type EyebrowConvention =
  | 'ALL_CAPS_LATIN'      // analysis: "EXECUTIVE SUMMARY"
  | 'ASSET_N_CATEGORY'    // private-banking: "ASSET 1 · DEBT"
  | 'NN_DOT_TOPIC'        // lookbook: "01 · EDUCATION"
  | 'NONE';               // base

/** Inputs to `derivePreset`. Most fields are optional — composer fills in
 *  defaults from the family rules when a selector wasn't answered. */
export interface PresetInputs {
  theme:        Theme;
  purpose?:     'research' | 'report-up' | 'persuade' | 'sales' | 'academic' | 'share';
  density?:     'minimal' | 'moderate' | 'detailed';
  narrative?:   'conclusion-first' | 'progressive' | 'story' | 'comparison';
  evidence?:    'opinion' | 'key-data' | 'data-heavy' | 'case-study';
  length?:      number;
  language?:    'zh' | 'en' | 'bilingual';
  /** User override of the family's default cover. Leave undefined to let the
   *  composer pick (reads `FAMILY_PROMPTS[family].defaultCover`). */
  cover?:       SlideCoverVariant;
}

/** Output of `derivePreset`. Shape mirrors `StylePreset` enough that the
 *  orchestrator can consume either once step 7 lands. */
export interface ComputedPreset {
  family:           ThemeFamily;
  theme:            Theme;
  cover:            SlideCoverVariant | 'default';
  promptAppendix:   string;
  preferredLayouts: Layout[];
  avoidLayouts:     Layout[];
  eyebrowConv:      EyebrowConvention;
  bookends:         { opening?: string; closing?: string };
  maxFontLevels:    number;
}

/** Brand color palette for premium presets (displayed in style picker) */
export interface BrandColors {
  primary: string;
  accent: string;
  bg: string;
  text: string;
}

/** Style preset 定义。这些是喂给 orchestrator 的约束包。 */
export interface StylePreset {
  id: StylePresetId;
  /** Output channel this preset belongs to. Slide presets are shown in the
   *  /create slide picker; report presets live behind /create?type=report.
   *  Required so any future preset declares its channel up front instead of
   *  leaking via id-string compares (D14a). */
  format: 'slide' | 'report';
  /** 展示给用户的名字 (bilingual) */
  displayName: { zh: string; en: string };
  /** 一行描述，进 clarifier 选项的 hint (bilingual) */
  tagline: { zh: string; en: string };
  /** 建议的主题 */
  theme: Theme;
  /** 追加到 system prompt 的硬约束文字（中文或英文） */
  promptAppendix: string;
  /** 受 preset 偏好的布局（打分时加权） */
  preferredLayouts: Layout[];
  /** 不喜欢的布局（打分时扣分，不强制禁止） */
  avoidLayouts?: Layout[];
  /** 最大字号层级数（硬约束） */
  maxFontLevels?: number;
  /** Premium presets require a license. Free presets omit or set false. */
  isPremium?: boolean;
  /** Brand color swatches for the style picker UI */
  brandColors?: BrandColors;
  /** Reference to a design system in the knowledge base */
  knowledgeRef?: string;
}

// ----- md-context（内容层：把用户 md 整理成 canonical 内容契约） -----
//
// md-context 的作用域**只**是内容：
//   - 标题是什么？
//   - 每页写什么？
//   - deck 级元信息是什么（audience / pageCount / tone）？
//
// md-context **不**做 layout / 审美决策。那些是下游 skill agent 的事。
// 但如果用户显式写了 `> hint: big-number` 或 `preset: warm` 这种内容，
// 提取出来放进 demands 字段——标记为"用户主动要求的"，不是 AI 猜的。

export type ChangeLevel = 'none' | 'light' | 'heavy';

/**
 * md-context 顶部 frontmatter 允许出现的字段。全是**内容级**元信息（给 copy-polisher
 * 用的 tone 也算）。注意：preset 虽然在 frontmatter 语法里允许，但它的语义上是 demand，
 * 会被同步到 MdContext.demands.preset。
 */
export interface DeckFrontmatter {
  title?: string;
  /** 自由文本；常见值：boss / product-manager / all-hands / client / investor */
  audience?: string;
  preset?: StylePresetId;
  pageCount?: number;
  /** 自由文本描述，给 copy-polisher 用 */
  tone?: string;
}

/** Page type for structural awareness.
 *  宪法 §2 规定仅 4 种。细分语义（目录/数据/案例/总结/过渡/Q&A 等）
 *  由 layout 承担，不进 pageType。
 */
export type PageType =
  | 'cover'    // 封面（第一页，唯一）
  | 'section'  // 小节标题 / 目录 / 分隔页（导航类）
  | 'content'  // 所有正文页
  | 'back';    // 尾页（最后一页，唯一）

/**
 * 一页的内容。纯粹是"标题+这页写什么"，没有任何 layout 字段。
 * layout 决策是下游的事，即使是用户显式写的 layout 也不放这里，而是存在 UserDemand。
 */
export interface MdContextPage {
  /** H1 标题 */
  title: string;
  /** H2 副标题（可选） */
  subtitle?: string;
  /** body 首行，可能是 `[TODO: 核心观点]` 占位 */
  corePoint: string;
  /** 论据列表——对核心观点的支撑性阐述（从 `- **xxx**` bullets 解析） */
  subPoints?: string[];
  /** 数据/引证——具体数据、案例、原文金句（从 `> xxx` 引用块解析，排除 hint/note） */
  evidence?: string[];
  /** 核心观点之外的 body 文本（bullets、段落等） */
  body: string;
  /** 页级 speaker notes，对应 slide.notes */
  notes?: string;
  /** 页面类型：封面、目录、小节封面、内容、总结、尾页 */
  pageType?: PageType;
}

/**
 * 用户**主动写**的、非内容层面的要求——在 md-context 提取阶段被识别并搬到这里，
 * 和内容分开存储。下游的 layout / style 决策阶段会读这里。
 *
 * 关键不变式：demands 里每一项都必须来自用户原文（显式 frontmatter 字段、`> hint:` 块等），
 * **绝不**放 AI 的启发式猜测。AI 的猜测是下游 skill 的职责。
 */
export interface UserDemand {
  /** 用户在 frontmatter 里写了 `preset: warm` 之类 */
  preset?: StylePresetId;
  /** 用户在某页写了 `> hint: big-number`，pageIndex → Layout（内容布局） */
  pageLayouts?: Record<number, Layout>;
  /** 用户指定的图表/结构类型，pageIndex → chart Layout（独立于 pageLayouts） */
  pageCharts?: Record<number, Layout>;
  /** 用户从 CardSidePanel/SlideToolbar 选中的 composition 变体，pageIndex → compositionId。
   *  生效于 adapter 的 compositionHint 参数，覆盖 pickComposition 的默认选择。 */
  pageCompositions?: Record<number, string>;
}

export type MdContextChangeKind =
  | 'parsed-frontmatter'
  | 'hoisted-deck-hint'
  | 'split-into-pages'
  | 'extracted-user-demand'
  | 'merged-duplicate-page'
  | 'proposed-page-count'
  | 'filled-todo-placeholder'
  | 'dropped-unsupported-hint'
  | 'llm-restructured'
  | 'unchanged';

export interface MdContextChange {
  kind: MdContextChangeKind;
  /** 给用户看的中文短句 */
  detail: string;
  /** 影响到的页 index（0-based），deck 级改动留空 */
  pageIndex?: number;
}

export interface MdContextDiff {
  changes: MdContextChange[];
  changeLevel: ChangeLevel;
}

export interface MdContext {
  frontmatter: DeckFrontmatter;
  pages: MdContextPage[];
  /** 用户主动写的非内容要求。只来自原文，不含 AI 启发式。 */
  demands: UserDemand;
  /** 序列化出的完美 md 字符串——用户一定会在 ChatPanel 里看到这个 */
  canonicalMd: string;
  /** 冗余字段：== diff.changeLevel，放外面方便前端读 */
  changeLevel: ChangeLevel;
  diff: MdContextDiff;
  /** LLM1 自审核 warnings（纯函数检查，不触发重试）。前端在 preview 里展示。 */
  reviewWarnings?: MdContextWarning[];
  /** Content signals detected by analyzeContentSignals() — data density, comparisons, etc. */
  contentSignals?: import('./contentAnalysis').ContentSignals;
}

// ----- md-context 自审核 -----

export interface MdContextWarning {
  ruleId: string;
  severity: 'error' | 'warning';
  /** undefined = deck 级问题 */
  pageIndex?: number;
  message: string;
}

// ----- Golden Rules 硬约束 -----

export type RuleSeverity = 'error' | 'warning';

export interface RuleViolation {
  /** 违反的规则 id */
  ruleId: string;
  severity: RuleSeverity;
  /** 受影响的 slide index（0-based） */
  pageIndex: number;
  /** 人类可读的问题描述 */
  message: string;
  /** 建议的修复指令（会传给重试 prompt） */
  suggestedFix?: string;
}

/** 校验器对一份 deck 的完整评估结果 */
export interface RuleReport {
  pass: boolean;
  violations: RuleViolation[];
  /** 每页单独的通过/失败 */
  perPage: Array<{ pageIndex: number; pass: boolean; errors: number; warnings: number }>;
}

// ----- Plan Outline (轻量结构计划，不含完整内容) -----

/** 一页的计划：只有标题+方向，不含完整内容 */
export interface PlanPage {
  title: string;
  /** 一句话：这页要讲什么方向 */
  direction: string;
  pageType: PageType;
}

/** AI 输出的轻量结构计划 */
export interface PlanOutline {
  /** deck 标题 */
  title: string;
  /** AI 对用户意图的一句话总结 */
  summary: string;
  /** 每页的标题+方向 */
  pages: PlanPage[];
  suggestedPageCount: number;
  /** AI explains if it couldn't meet the requested page count */
  pageCountNote?: string;
}

// ----- Harness 事件流 -----

/**
 * Harness 对外暴露的事件类型。扩展了现有 PipelineEvent。
 * orchestrator 用 AsyncGenerator 把这些事件流出去，
 * API route 把它们转成 SSE，前端 ChatPanel 按类型渲染。
 */
export type HarnessEvent =
  | { type: 'content-too-short'; data: { rawInput: string } }
  | { type: 'plan-outline'; data: { plan: PlanOutline } }
  | { type: 'md-context-preview'; data: {
      /** 完整 MdContext；前端应保留这份并在用户点"就这么干"时作为 mdContextOverride 回传 */
      mdContext: MdContext;
    }}
  | { type: 'clarify-needed'; questions: ClarifierQuestion[] }
  | { type: 'plan'; plan: HarnessPlan }
  | { type: 'design-ready'; data: { mdDesign: string; slideCount: number } }
  | { type: 'outline'; data: unknown }
  | { type: 'generating'; data: { from: number; to: number; total: number } }
  | { type: 'slide'; data: { index: number; slide: Slide } }
  | { type: 'validating'; data: { round: number } }
  | { type: 'violations'; data: { report: RuleReport } }
  | { type: 'fixing'; data: { pageIndex: number; reason: string } }
  | { type: 'fixed'; data: { pageIndex: number } }
  | { type: 'rechecking'; data: { round: number; pages: number[] } }
  /** B4 — cover variation picker. alternates: up to 2 extra layouts forked
   *  in parallel after cover lands. Consumer renders a picker; pick replaces
   *  slides[0], dismiss keeps original. Event may be absent (flag off / fork
   *  failed / single-page deck). */
  | { type: 'cover-variations'; data: { original: Slide; alternates: Slide[] } }
  | { type: 'done'; data: { slides: Slide[]; report: RuleReport; presetId?: string } }
  | { type: 'error'; data: {
      message: string;
      /** Required: producers MUST classify their error.
       *  Consumers default to non-fatal when missing (fail-open) — see
       *  GenerationPreview's `fatal === true` check. */
      fatal: boolean;
      /** UI routing hint:
       *  - 'recheck-fix-failed' → AiActionBlock (B2 P1)
       *  - 'slide-generation-failed' → silent placeholder for one missing page */
      kind?: 'recheck-fix-failed' | 'slide-generation-failed';
      page?: number;
      issues?: string[];
    }};

/** 在执行前展示给用户的 plan */
export interface HarnessPlan {
  workflow: WorkflowType;
  summary: string;            // 一句话总结
  steps: string[];            // 短句列表，像 todo 一样
  estimatedCostUsd?: number;
  estimatedDurationSec?: number;
  preset: StylePresetId;
}

// ----- Orchestrator 输入 -----

export interface OrchestratorInput {
  workflow: WorkflowType;
  /** 用户原始输入（草稿文字、指令等） */
  rawInput: string;
  /**
   * 已批准的 PlanOutline。第一轮调用时不传，orchestrator 会 buildPlanOutline 并 emit
   * plan-outline 事件。前端把用户审批后的 plan 回传触发第二轮，orchestrator 用
   * plan 作为结构约束调 buildMdContext 生成完整内容。
   */
  planOverride?: PlanOutline;
  /**
   * 已批准的 MdContext。当有 planOverride 时，orchestrator 先用 plan 生成 mdContext，
   * 然后 emit md-context-preview。如果直接传了 mdContextOverride，跳过 plan 和 mdContext
   * 两个阶段直接进入 slide 生成。
   */
  mdContextOverride?: MdContext;
  /** 用户已经回答的 clarifier（第二次调用时传回） */
  clarifierAnswers?: ClarifierAnswers;
  /** Step 2 LLM 生成的内容问题清单（仅 id + question 文本，不带 options）。
   *  orchestrator 用它和 clarifierAnswers 配对成 {question, answer} 注入
   *  buildPlanOutline 的 prompt，让 outline LLM 看得见原问题而不是只看答案文本。 */
  aiQuestions?: Array<{ id: string; question: string }>;
  /** 强制跳过 clarifier（前端给"用默认值"按钮时使用） */
  skipClarifier?: boolean;
  /** 直接指定 preset（跳过 clarifier 里的 style 问题） */
  presetId?: StylePresetId;
  /** 直接指定页数 */
  pageCount?: number;
  /** 主题 fallback */
  theme?: Theme;
  /** v2.4: 'slide' (default, 16:9 deck) or 'report' (letter/a4 vertical).
   *  Threaded into pipeline.generateDeck so the layout set switches accordingly. */
  format?: 'slide' | 'report';
  /** UI locale for user-facing strings in clarifier questions, plan summaries, etc. */
  locale?: 'zh' | 'en';

  // ---- mdDesign three-stage pipeline (2026-04-09) ----

  /** Pre-built mdDesign (Slidev-format string). When provided, the orchestrator
   *  skips both the design LLM call and the outline LLM call — the design step
   *  was already done (either by AI or by user hand-editing). Passed through
   *  to pipeline.generateDeck as opts.mdDesign. */
  mdDesign?: string;

  // ---- Full-content mode (2026-04-14) ----

  /** When true, try parsing content directly into MdContext first.
   *  Only fall back to buildPlanOutline if content needs heavy restructuring.
   *  Emits 'content-too-short' if input is too brief for full-content mode. */
  skipPlanIfStructured?: boolean;

  /** Polish mode — user picked "Let AI polish" in ModeChooser. Adds a
   *  hard-constraint prompt block to buildMdContext: preserve every user
   *  paragraph, only allow typo/phrasing fixes + implicit-heading restoration
   *  + connective-word additions, no new sections, no content invention. The
   *  rest of the pipeline (clarifier, plan, generate) is unchanged. */
  polishMode?: boolean;
}
