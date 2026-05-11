// ============================================================================
// Lasca AI Harness — Clarifier
// ============================================================================
// Project motto: "先问后干，多提问不蛮干。" — ask first, build second.
//
// Clarifier 是 Lasca 的第一道闸门。它不调 LLM（至少 v0.1 不调），而是基于
// 规则判定复杂度 + 从模板库挑问题。优点：快、便宜、稳、可测试。
//
// 关键哲学："用选择题替代开放题"。每个问题 2-4 个选项，用户点一下就答完。
// 永远不问"你想要什么风格？"，永远问"A/B/C 哪个更像你想要的？"
// ============================================================================

import type {
  Complexity,
  ClarifierDecision,
  ClarifierQuestion,
  ClarifierAnswers,
  WorkflowType,
} from './types';
import { listPresetOptions } from './stylePresets';
import { DENSITY_THUMBS, TAKEAWAY_THUMBS, PRESET_THUMBS } from './clarifierThumbs';

// N4: per-question fallback. User picks this → treat as unanswered → defaults apply.
// Sentinel is a string so it serialises cleanly through SSE / JSON.
export const AUTO_SENTINEL = '__auto__';

function autoFallbackOption(locale: 'zh' | 'en') {
  return locale === 'en'
    ? { label: 'Decide for me', value: AUTO_SENTINEL, hint: 'Skip this — use a sensible default' }
    : { label: '让模型来选',     value: AUTO_SENTINEL, hint: '跳过本题，走默认值' };
}

function appendAutoFallback(questions: ClarifierQuestion[], locale: 'zh' | 'en'): ClarifierQuestion[] {
  const auto = autoFallbackOption(locale);
  return questions.map(q => ({ ...q, options: [...q.options, auto] }));
}

function isAutoValue(v: unknown): boolean {
  if (v === AUTO_SENTINEL) return true;
  if (Array.isArray(v) && v.length > 0 && v.every(x => x === AUTO_SENTINEL)) return true;
  return false;
}

// ============================================================================
// 复杂度判定
// ============================================================================

interface AssessContext {
  workflow: WorkflowType;
  rawInput: string;
  /** 是否已经有已存在的 deck */
  hasExistingDeck: boolean;
  /** 用户连续改同一页的次数（由 UI 跟踪） */
  consecutiveSamePageEdits?: number;
}

export function assessComplexity(ctx: AssessContext): Complexity {
  const charLen = ctx.rawInput.trim().length;

  // 超复杂：连续改同一页 > 2 次 → 说明理解错了
  if ((ctx.consecutiveSamePageEdits ?? 0) > 2) return 'complex';

  switch (ctx.workflow) {
    case 'edit-page':
      if (charLen < 20) return 'trivial';
      if (charLen < 80) return 'simple';
      return 'medium';

    case 'extend-deck':
      if (charLen < 30) return 'simple';
      return 'medium';

    case 'redesign-deck':
      // 重新设计本质上是风格决策，至少要问一次
      return 'medium';

    case 'match-style':
      return 'simple';

    case 'generate-from-draft':
      // 从零生成，目标受众不明 → complex；有草稿 → medium
      if (charLen < 50) return 'complex';
      if (charLen < 300) return 'medium';
      return 'medium'; // 长草稿也要问受众
  }
}

// ============================================================================
// 问题模板库
// ============================================================================

/** generate-from-draft 的问题库（形式 + 内容方向，风格在 Step 4 选） */
function questionsForGenerateFromDraft(locale: 'zh' | 'en' = 'zh'): ClarifierQuestion[] {
  if (locale === 'en') {
    return [
      {
        id: 'audience',
        header: 'Audience',
        question: 'Who is this for?',
        options: [
          { label: 'Boss (1 person)',  value: 'boss',     hint: 'KPIs + issues + next steps', implication: 'Focus on KPIs and action plans, cut the preamble' },
          { label: 'All-hands',        value: 'all-hands', hint: 'Story + wins + outlook', implication: 'Narrative arc, highlight team achievements and outlook' },
          { label: 'Client',           value: 'client',   hint: 'Pain points + solution + cases', implication: 'Lead with pain points, showcase solutions and case studies' },
          { label: 'Investor',         value: 'investor', hint: 'Growth + market + team', implication: 'Highlight growth data, market size, and team' },
          { label: 'Academic',         value: 'academic', hint: 'Professor / class / thesis', implication: 'Structured argument with citations; allow more body text and references' },
        ],
      },
      {
        id: 'length',
        header: 'Length',
        question: 'How many pages?',
        options: [
          { label: 'Short (5 pages)',   value: 5,  hint: 'Total including cover and end', implication: 'More info per page, keep the essentials' },
          { label: 'Medium (8 pages)',  value: 8,  hint: 'Total including cover and end', implication: 'Standard pace, one point per page' },
          { label: 'Long (12 pages)',   value: 12, hint: 'Total including cover and end', implication: 'Section covers and transitions to keep the rhythm' },
        ],
      },
      {
        id: 'key-takeaway',
        header: 'Key Takeaway',
        question: 'What should the reader remember most?',
        options: [
          { label: 'One key number or conclusion', value: 'number', hint: 'Highlighted with big-number', implication: 'Core data gets a full page, everything supports it', previewSvg: TAKEAWAY_THUMBS.number },
          { label: 'A complete analysis logic',    value: 'logic',  hint: 'Ordered by cause & effect', implication: 'Each page builds on the previous, conclusion last', previewSvg: TAKEAWAY_THUMBS.logic },
          { label: 'An actionable plan',           value: 'action', hint: 'Ends with action items',    implication: 'Last page is a clear next step',                    previewSvg: TAKEAWAY_THUMBS.action },
          { label: 'A story or case study',        value: 'story',  hint: 'Narrative structure',        implication: 'Story arc throughout, immersion first',             previewSvg: TAKEAWAY_THUMBS.story },
        ],
      },
      {
        id: 'density',
        header: 'Density',
        question: 'More or less content per page?',
        options: [
          { label: 'Minimal',  value: 'minimal',  hint: 'Lots of whitespace, one point per page', implication: 'Big whitespace, only one core point per page',        previewSvg: DENSITY_THUMBS.minimal },
          { label: 'Moderate', value: 'moderate', hint: 'Title + 2-3 bullet points',              implication: 'Title + 2-3 points, balance info and clarity',         previewSvg: DENSITY_THUMBS.moderate },
          { label: 'Detailed', value: 'detailed', hint: 'Title + subtitle + multiple arguments',  implication: 'Full argument per page: point + evidence + data',      previewSvg: DENSITY_THUMBS.detailed },
        ],
      },
      {
        id: 'data-emphasis',
        header: 'Data',
        question: 'Need to highlight numbers/data?',
        options: [
          { label: 'No',          value: 'none',  hint: 'Mostly text and ideas', implication: 'Focus on text and ideas, no emphasis on numbers' },
          { label: 'Some data',   value: 'some',  hint: 'Key numbers highlighted', implication: 'Key numbers get big-number treatment' },
          { label: 'Data-heavy',  value: 'heavy', hint: 'Charts, metrics, comparisons', implication: 'Charts and data visualization first' },
        ],
      },
    ];
  }

  return [
    // 形式问题
    {
      id: 'audience',
      header: '目标受众',
      question: '这份内容是给谁看的？',
      options: [
        { label: '老板（1 人）',   value: 'boss',     hint: 'KPI + 问题 + 下一步', implication: '→ 聚焦 KPI 和行动计划，删掉铺垫' },
        { label: '全公司',         value: 'all-hands', hint: '故事 + 成绩 + 展望', implication: '→ 故事线串联，突出团队成绩和展望' },
        { label: '客户',           value: 'client',   hint: '痛点 + 方案 + 案例', implication: '→ 从痛点切入，重点展示方案和案例' },
        { label: '投资人',         value: 'investor', hint: '增长 + 市场 + 团队', implication: '→ 突出增长数据、市场规模和团队' },
        { label: '学术',           value: 'academic', hint: '教授 / 课堂 / 答辩', implication: '→ 结构化论证、允许更多正文和引用，避免营销语气' },
      ],
    },
    {
      id: 'length',
      header: '长度',
      question: '大概几页？',
      options: [
        { label: '短（5 页）',   value: 5,  hint: '总页数（含封面和尾页）', implication: '→ 每页信息量更大，确保精华不遗漏' },
        { label: '中（8 页）',   value: 8,  hint: '总页数（含封面和尾页）', implication: '→ 标准节奏，每个论点独立一页' },
        { label: '长（12 页）',  value: 12, hint: '总页数（含封面和尾页）', implication: '→ 会有小节封面和过渡页，保持节奏' },
      ],
    },
    // 内容方向问题 — 放在第 3 位，确保 medium 复杂度（前 4 个）也能问到
    {
      id: 'key-takeaway',
      header: '核心信息',
      question: '读者看完最该记住什么？',
      options: [
        { label: '一个关键数字或结论', value: 'number', hint: '用 big-number 放大', implication: '→ 核心数据会占一整页，全文围绕这个数字展开', previewSvg: TAKEAWAY_THUMBS.number },
        { label: '一套完整的分析逻辑', value: 'logic',  hint: '按逻辑链排序',     implication: '→ 每页按因果关系递进，结论在最后',             previewSvg: TAKEAWAY_THUMBS.logic },
        { label: '一个可执行的方案',   value: 'action', hint: '结尾落到行动',     implication: '→ 最后一页是明确的 next step',                 previewSvg: TAKEAWAY_THUMBS.action },
        { label: '一个故事或案例',     value: 'story',  hint: '叙事结构',         implication: '→ 用故事线串联全文，代入感优先',                previewSvg: TAKEAWAY_THUMBS.story },
      ],
    },
    // 形式问题续
    {
      id: 'density',
      header: '信息量',
      question: '每页内容多一些还是少一些？',
      options: [
        { label: '少而精', value: 'minimal',  hint: '大留白、一页一个观点',  implication: '→ 大留白，每页只保留一个核心观点',            previewSvg: DENSITY_THUMBS.minimal },
        { label: '适中',   value: 'moderate', hint: '标题 + 2-3 个要点',     implication: '→ 标题 + 2-3 要点，平衡信息量和清爽',         previewSvg: DENSITY_THUMBS.moderate },
        { label: '详细',   value: 'detailed', hint: '标题 + 副标题 + 多个论据', implication: '→ 每页会有完整论证：论点 + 论据 + 数据/引证', previewSvg: DENSITY_THUMBS.detailed },
      ],
    },
    {
      id: 'data-emphasis',
      header: '数据',
      question: '需要突出展示数字/数据吗？',
      options: [
        { label: '不需要',     value: 'none',   hint: '主要是文字和观点', implication: '→ 主要用文字和观点，不强调数字' },
        { label: '少量数据',   value: 'some',   hint: '关键数字放大展示', implication: '→ 关键数字会用 big-number 放大展示' },
        { label: '数据为主',   value: 'heavy',  hint: '图表、指标、对比', implication: '→ 图表和数据可视化优先' },
      ],
    },
  ];
}

/** Attach PRESET_THUMBS to preset options. Lives here (not in stylePresets.ts)
 *  so the thumbnail catalog stays a clarifier concern — keeps stylePresets
 *  focused on prompts/theme data. */
function presetOptionsWithThumbs(locale: 'zh' | 'en') {
  return listPresetOptions(locale).map(o => ({
    ...o,
    previewSvg: PRESET_THUMBS[o.value as string],
  }));
}

/** redesign-deck 的问题库 */
function questionsForRedesignDeck(locale: 'zh' | 'en' = 'zh'): ClarifierQuestion[] {
  if (locale === 'en') {
    return [
      {
        id: 'preset',
        header: 'New style',
        question: 'What style do you want?',
        options: presetOptionsWithThumbs('en'),
      },
      {
        id: 'preserve',
        header: 'Preserve',
        question: 'What should be kept?',
        multiSelect: true,
        options: [
          { label: 'Text content',   value: 'text' },
          { label: 'Images',         value: 'images' },
          { label: 'Page count',     value: 'page-count' },
          { label: 'Structure',      value: 'structure' },
        ],
      },
    ];
  }
  return [
    {
      id: 'preset',
      header: '新风格',
      question: '想换成什么风格？',
      options: presetOptionsWithThumbs('zh'),
    },
    {
      id: 'preserve',
      header: '保留',
      question: '哪些东西要保留？',
      multiSelect: true,
      options: [
        { label: '文字内容',   value: 'text' },
        { label: '图片',       value: 'images' },
        { label: '页数',       value: 'page-count' },
        { label: '原本结构',   value: 'structure' },
      ],
    },
  ];
}

/** extend-deck 的问题库 */
function questionsForExtendDeck(locale: 'zh' | 'en' = 'zh'): ClarifierQuestion[] {
  if (locale === 'en') {
    return [
      {
        id: 'count',
        header: 'New pages',
        question: 'How many pages to add?',
        options: [
          { label: '1 page', value: 1 },
          { label: '2 pages', value: 2 },
          { label: '3 pages', value: 3 },
        ],
      },
      {
        id: 'position',
        header: 'Position',
        question: 'Where to add them?',
        options: [
          { label: 'After current page', value: 'after-current' },
          { label: 'At the end',         value: 'end' },
          { label: 'At the start',       value: 'start' },
        ],
      },
    ];
  }
  return [
    {
      id: 'count',
      header: '新增页数',
      question: '加几页？',
      options: [
        { label: '1 页', value: 1 },
        { label: '2 页', value: 2 },
        { label: '3 页', value: 3 },
      ],
    },
    {
      id: 'position',
      header: '位置',
      question: '加在哪里？',
      options: [
        { label: '当前页之后', value: 'after-current' },
        { label: '结尾',       value: 'end' },
        { label: '开头',       value: 'start' },
      ],
    },
  ];
}

/** match-style 的问题库 */
function questionsForMatchStyle(locale: 'zh' | 'en' = 'zh'): ClarifierQuestion[] {
  if (locale === 'en') {
    return [
      {
        id: 'scope',
        header: 'Scope',
        question: 'Apply this style to where?',
        options: [
          { label: 'Current page only', value: 'current' },
          { label: 'All pages',         value: 'all' },
          { label: 'I\'ll choose later', value: 'later' },
        ],
      },
    ];
  }
  return [
    {
      id: 'scope',
      header: '应用范围',
      question: '这个风格应用到哪里？',
      options: [
        { label: '只改当前页', value: 'current' },
        { label: '改所有页',   value: 'all' },
        { label: '我稍后选',   value: 'later' },
      ],
    },
  ];
}

const TEMPLATES: Record<WorkflowType, (locale?: 'zh' | 'en') => ClarifierQuestion[]> = {
  'generate-from-draft': questionsForGenerateFromDraft,
  'redesign-deck':       questionsForRedesignDeck,
  'extend-deck':         questionsForExtendDeck,
  'match-style':         questionsForMatchStyle,
  'edit-page':           () => [], // edit-page 默认不问
};

// ============================================================================
// 主入口
// ============================================================================

export function runClarifier(
  ctx: AssessContext & { existingAnswers?: ClarifierAnswers; presetId?: string; locale?: 'zh' | 'en' },
): ClarifierDecision {
  const complexity = assessComplexity(ctx);
  const locale = ctx.locale ?? 'zh';

  // 如果前端已经传了 existingAnswers 且 clarifier 需要的问题都已经答了，直接 proceed
  const allQuestions = appendAutoFallback((TEMPLATES[ctx.workflow] ?? (() => []))(locale), locale);
  // N4: __auto__ answers are treated as "not answered" so re-ask logic and defaults fire.
  const rawAnswered = ctx.existingAnswers ?? {};
  const answered: ClarifierAnswers = Object.fromEntries(
    Object.entries(rawAnswered).filter(([, v]) => !isAutoValue(v)),
  );

  // trivial / edit-page: 不问，直接走
  if (complexity === 'trivial' || ctx.workflow === 'edit-page') {
    return { action: 'proceed', answers: answered };
  }

  // 过滤掉已回答的问题
  const unanswered = allQuestions.filter(q => {
    // 如果 presetId 已经从外部传入（比如前端提前选好了），跳过 preset 问题
    if (q.id === 'preset' && ctx.presetId) return false;
    return !(q.id in answered);
  });

  if (unanswered.length === 0) {
    return { action: 'proceed', answers: answered };
  }

  // simple: 问 2 个（形式 + 内容各 1）
  if (complexity === 'simple') {
    return { action: 'ask', questions: unanswered.slice(0, 2) };
  }

  // medium: 问 4 个（覆盖形式 + 内容方向）
  if (complexity === 'medium') {
    return { action: 'ask', questions: unanswered.slice(0, 4) };
  }

  // complex: 问全部
  return { action: 'ask', questions: unanswered };
}

/**
 * 把 clarifier 答案抽取成 orchestrator 需要的字段。
 *
 * Known keys get typed coercion. Unknown keys (custom-pill input, `extra-note`,
 * anything the UI adds in future) fall through into `freeFormHints` verbatim so
 * downstream (mdContext.ts, orchestrator systemPromptSuffix) can surface them
 * to the LLM as "用户备注（逐字遵守）". This fixes the silent-drop bug where
 * users typed an extra-note and the model never saw it.
 */
const KNOWN_KEYS = new Set<string>([
  'audience', 'length', 'preset', 'preserve', 'count', 'position', 'scope',
  'density', 'data-emphasis', 'key-takeaway', 'purpose', 'narrative', 'evidence',
]);

export function extractFromAnswers(answers: ClarifierAnswers) {
  // N4: strip __auto__ answers so the downstream `as ... | undefined` cast
  // yields undefined and orchestrator / mdContext fallbacks kick in.
  const cleaned: ClarifierAnswers = Object.fromEntries(
    Object.entries(answers).filter(([, v]) => !isAutoValue(v)),
  );
  const freeFormHints: Record<string, string> = {};
  for (const [k, v] of Object.entries(cleaned)) {
    if (KNOWN_KEYS.has(k)) continue;
    if (v === undefined || v === null) continue;
    const str = Array.isArray(v) ? v.join(', ') : String(v);
    if (str.trim()) freeFormHints[k] = str.trim();
  }
  return {
    audience:      (cleaned.audience        as string | undefined),
    length:        (cleaned.length          as number | undefined),
    presetId:      (cleaned.preset          as string | undefined),
    preserve:      (cleaned.preserve        as string[] | undefined),
    count:         (cleaned.count           as number | undefined),
    position:      (cleaned.position        as string | undefined),
    scope:         (cleaned.scope           as string | undefined),
    density:       (cleaned.density         as string | undefined),
    dataEmphasis:  (cleaned['data-emphasis'] as string | undefined),
    keyTakeaway:   (cleaned['key-takeaway'] as string | undefined),
    purpose:       (cleaned.purpose         as string | undefined),
    narrative:     (cleaned.narrative       as string | undefined),
    evidence:      (cleaned.evidence        as string | undefined),
    freeFormHints,
  };
}
