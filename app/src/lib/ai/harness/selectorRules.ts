// ============================================================================
// Lasca AI Harness — Selector Rules (Single Source of Truth)
// ============================================================================
// One table drives three layers:
//   1. UI copy (clarifier.ts reads `implication` for in-flow hints)
//   2. LLM1 content structuring (mdContext.ts injects `promptRule` into
//      the preferences block)
//   3. LLM2 per-slide generation (orchestrator.ts appends `promptRule` to the
//      system prompt suffix)
//
// Adding a new option = one edit here. Adding a new axis = add to SelectorKey.
// ============================================================================

export type SelectorKey =
  | 'purpose'
  | 'density'
  | 'narrative'
  | 'evidence'
  | 'audience'
  | 'keyTakeaway'
  | 'language';

export interface SelectorOption {
  /** Internal value (stable across UI/LLM layers) */
  value: string;
  /** Short implication shown after the user picks — UI hint */
  implication: string;
  /** Full directive injected into LLM prompts (Chinese — default) */
  promptRule: string;
  /** English-locale label (falls back to `label`/`value`) */
  labelEn?: string;
  /** English-locale promptRule — used when `locale === 'en'`. When absent,
   *  `promptRule` (Chinese) is injected regardless; modern LLMs cope but
   *  tone may bleed, so provide this for every option in a shipped preset. */
  promptRuleEn?: string;
  /** Optional human-readable label for LLM preference block (falls back to value) */
  label?: string;
}

// ----------------------------------------------------------------------------
// The rules table
// ----------------------------------------------------------------------------

export const SELECTOR_RULES: Record<SelectorKey, SelectorOption[]> = {
  purpose: [
    {
      value: 'research',
      label: '研究分析',
      labelEn: 'Research analysis',
      implication: '→ 投行/咨询式深度分析，数据驱动',
      promptRule: '研究分析：投行/咨询式深度分析。每个论点必须有数据或引用支撑。允许更多正文，保持学术严谨。优先 two-column、title-body、timeline、table、dashboard、grid-cards、three-cards 等等宽 tile 布局（能装下整段论证）。bento / feature-grid / title-bento 只在每个 tile 是短标签或一句话时才用，段落型论证塞进去会被截断。',
      promptRuleEn: 'Research analysis: IB/consulting-grade deep analysis. Every claim must be backed by data or a citation. Allow longer body copy, keep academic rigor. Prefer equal-width tile layouts that can hold a full argument: two-column, title-body, timeline, table, dashboard, grid-cards, three-cards. Use bento / featured-grid / title-bento only when each tile is a short label or single sentence — paragraph-length arguments get clipped in their narrow tiles.',
    },
    {
      value: 'report-up',
      label: '工作汇报',
      labelEn: 'Progress report',
      implication: '→ 面向上级，每页有成果/问题/下一步',
      promptRule: '工作汇报：给上级看。每页结构清晰：成果 / 问题 / 下一步。删掉铺垫，直接给结论。数据证明成果，不是科普。',
      promptRuleEn: 'Progress report: written for a manager. Every page follows the same skeleton: Results / Issues / Next steps. Cut preamble, lead with the conclusion. Use data to prove outcomes, not to educate.',
    },
    {
      value: 'persuade',
      label: '说服提案',
      labelEn: 'Persuasion proposal',
      implication: '→ 痛点→方案→ROI→行动建议',
      promptRule: '说服提案：目标是拿到批准。每页推进一步决策逻辑（痛点 → 方案 → ROI → 行动建议）。结尾必须有明确的 CTA。',
      promptRuleEn: 'Persuasion proposal: the goal is to get approval. Each page moves the decision logic forward: pain point → solution → ROI → recommended action. The final page must carry an explicit call to action.',
    },
    {
      value: 'sales',
      label: '客户销售',
      labelEn: 'Customer sales',
      implication: '→ 价值主张→差异化→客户案例→CTA',
      promptRule: '客户销售：给外部客户看。结构：价值主张 → 差异化 → 客户案例 → CTA。避免内部术语，多用具体场景和客户原话。',
      promptRuleEn: 'Customer sales: written for an external prospect. Flow: value proposition → differentiation → customer case → CTA. Avoid internal jargon; favor concrete scenarios and direct quotes from customers.',
    },
    {
      value: 'academic',
      label: '学术',
      labelEn: 'Academic',
      implication: '→ 结构化论证，允许更多正文和引用',
      promptRule: '学术演讲：研究问题 → 文献/背景 → 方法 → 证据/数据 → 讨论 → 结论。允许较多正文和脚注式引用（作者 + 年份）。避免营销口吻和空洞标语。结尾给出局限性与后续研究方向。',
      promptRuleEn: 'Academic talk: research question → literature / background → method → evidence / data → discussion → conclusion. Allow longer body copy and footnote-style citations (author + year). Avoid marketing voice and empty slogans. Close with limitations and future research directions.',
    },
    {
      value: 'share',
      label: '知识分享',
      labelEn: 'Knowledge sharing',
      implication: '→ 团队传递经验，由浅入深',
      promptRule: '知识分享：给团队传递经验。由浅入深、有案例、有反思。语气温暖、使用"我们"的口吻，可以分享失败经验。',
      promptRuleEn: 'Knowledge sharing: passing experience to your team. Go from simple to deep, include cases, include reflections. Warm tone, use "we", and failure stories are welcome.',
    },
  ],

  density: [
    {
      value: 'minimal',
      label: '少而精',
      labelEn: 'Minimal',
      implication: '→ 大留白，每页只保留一个核心观点',
      promptRule: '信息密度 — 少而精：每页只放一个观点。标题 + 1 行核心观点即可，不超过 1 个 bullet。大量留白。布局偏向 cover、quote、big-number、two-column（稀疏版）。',
      promptRuleEn: 'Information density — Minimal: one idea per page. Title + a single line carrying the core point; at most one bullet. Plenty of whitespace. Favor cover, quote, big-number, two-column (sparse variant).',
    },
    {
      value: 'moderate',
      label: '适中',
      labelEn: 'Moderate',
      implication: '→ 标题 + 2-3 要点',
      promptRule: '信息密度 — 适中：每页 1 个标题 + 2-3 个要点。不要超过 4 个 bullet。布局偏向 three-cards、two-column、timeline（≤4 项）、split-image。',
      promptRuleEn: 'Information density — Moderate: one title plus 2–3 supporting points per page. Cap bullets at 4. Favor three-cards, two-column, timeline (≤4 items), split-image.',
    },
    {
      value: 'detailed',
      label: '详细',
      labelEn: 'Detailed',
      implication: '→ 完整论证：论点 + 论据 + 数据',
      promptRule: '信息密度 — 详细：每页可以有标题 + 副标题 + 3-5 个论据（支撑核心观点的阐述）+ 数据/引证。允许更多文字，但仍然保持结构化。布局偏向 two-column、title-body、timeline（长）、table、dashboard、stacked-bars、grid-cards、three-cards（每个 tile 给到等宽空间，能装下整段正文）。避免 bento / featured-grid / title-bento —— 这三种把版面切成 hero + 小 tile，小 tile 只能放短标签或一句话，detailed 段落塞进去会被截断。',
      promptRuleEn: 'Information density — Detailed: each page may carry title + subtitle + 3–5 supporting arguments (full prose that develops the core point) + data / citations. Long body copy is allowed but must stay structured. Favor two-column, title-body, timeline (long), table, dashboard, stacked-bars, grid-cards, three-cards — layouts that give each tile equal width and enough room for paragraph-length body. Avoid bento / featured-grid / title-bento: they split the canvas into a hero + small tiles, and the small tiles can only hold a short label or one sentence; detailed paragraphs get clipped there.',
    },
  ],

  narrative: [
    {
      value: 'conclusion-first',
      label: '结论先行',
      labelEn: 'Conclusion-first',
      implication: '→ 第一页给答案，后续解释原因',
      promptRule: '叙事方式 — 结论先行：第一页（或封面后的第一页）就给答案，后面用证据解释为什么。适合决策者和时间紧的场景。',
      promptRuleEn: 'Narrative — Conclusion-first: put the answer on page 1 (or the first page after the cover), then use the rest of the deck to prove why. Best for decision-makers and time-constrained settings.',
    },
    {
      value: 'progressive',
      label: '层层推导',
      labelEn: 'Progressive reasoning',
      implication: '→ 问题→分析→证据→结论',
      promptRule: '叙事方式 — 层层推导：按问题 → 分析 → 证据 → 结论的顺序推进。每一页在前一页的基础上进一步，让读者跟着逻辑链走到终点。描述步骤/流程的页用 steps 或 flowchart（二者自动带序号，比 bullet list 更易读）；描述反馈/迭代关系用 cycle。',
      promptRuleEn: 'Narrative — Progressive reasoning: problem → analysis → evidence → conclusion. Each page builds on the previous one so the reader follows the full logic chain. Use steps or flowchart for process-style pages (both render numbered and read cleaner than a bullet list); use cycle for feedback / iterative relationships.',
    },
    {
      value: 'story',
      label: '故事驱动',
      labelEn: 'Story-driven',
      implication: '→ 开头冲突、中间展开、结尾解决',
      promptRule: '叙事方式 — 故事驱动：用叙事结构串联。开头设冲突/悬念，中间展开，结尾解决。代入感优先。',
      promptRuleEn: 'Narrative — Story-driven: thread the deck with a narrative arc. Open with tension / a hook, develop it in the middle, resolve it at the end. Emotional engagement beats structural neatness.',
    },
    {
      value: 'comparison',
      label: '对比论证',
      labelEn: 'Comparison',
      implication: '→ A vs B，用对比让结论不言自明',
      promptRule: '叙事方式 — 对比论证：A vs B。用 versus / two-column / split-image 等对比布局让结论不言自明。当比较涉及两个维度（如"成本 vs 价值"、"风险 vs 回报"）时优先 matrix（2×2 象限）；当要突出"共同点 / 差异点"时用 venn（2-3 圈）。需要图表时把 chart 嵌入其中一侧（默认不用独占 chart 页）。适合竞品分析、方案对比。',
      promptRuleEn: 'Narrative — Comparison: A vs B. Use versus / two-column / split-image so the conclusion is obvious without being spelled out. When the comparison crosses two dimensions (cost vs value, risk vs reward), prefer matrix (2×2). When you need to show overlap / differences, use venn (2–3 circles). Embed any chart inside one side rather than giving it its own page. Fits competitive analysis and option comparison.',
    },
  ],

  evidence: [
    {
      value: 'opinion',
      label: '纯观点',
      labelEn: 'Opinion-driven',
      implication: '→ 用逻辑和判断，不依赖数字',
      promptRule: '论据类型 — 纯观点：用逻辑和判断说服，不依赖数字。适合战略方向和认知类内容。图表数量控制在 1 个以内。**抽象关系用结构图表达**，不要堆 bullet：核心概念与周边要素用 hub-spoke；层级/优先级用 pyramid 或 bullseye；循环/反馈用 cycle；二维取舍用 matrix。每条 diagram 选择先满足宪法 §4.6：flowchart / steps / cycle 必须有序号，hub-spoke / venn / matrix 适合无序关系。',
      promptRuleEn: 'Evidence — Opinion-driven: persuade with logic and judgment, not numbers. Best for strategy direction and conceptual content. Cap charts at 1 across the deck. **Express abstract relationships with structural diagrams**, not bullet stacks: use hub-spoke for a core concept with radiating attributes; pyramid or bullseye for hierarchy / priority; cycle for feedback / loops; matrix for two-axis trade-offs. Per §4.6: flowchart / steps / cycle require ordered steps; hub-spoke / venn / matrix fit unordered relationships.',
    },
    {
      value: 'key-data',
      label: '关键数据',
      labelEn: 'Key-data',
      implication: '→ 几个核心数字放大展示',
      promptRule: '论据类型 — 关键数据：几个核心数字放大展示，数据是点缀不是主角。只有真正关键的 1-2 个数字用 big-number。',
      promptRuleEn: 'Evidence — Key-data: enlarge a few core numbers; data accents the argument rather than driving it. Reserve big-number for the 1–2 numbers that truly earn their own page.',
    },
    {
      value: 'data-heavy',
      label: '数据驱动',
      labelEn: 'Data-heavy',
      implication: '→ 图表和指标贯穿始终',
      promptRule: '论据类型 — 数据驱动：图表和指标贯穿始终。优先用 two-column / split-image / dashboard / stat-row 作为页面骨架，把 chart（bar / horizontal-bar / line（可选 area:true） / pie / stacked-bar / scatter）嵌入其中一个卡片 / 槽位——每页至少一个数据可视化。仅当每张 tile 内容都是短标签（≤ 1 句话）时，才可以用 title-bento / featured-grid / bento；否则小 tile 装不下正文。宪法 §4.1：chart 默认不独占整页；仅当一页只有纯图表、无旁白时才用独立 chart layout。big-number 仅留给真正需要单独放大的关键数字。',
      promptRuleEn: 'Evidence — Data-heavy: charts and metrics run through every page. Use two-column / split-image / dashboard / stat-row as the page skeleton and embed a chart (bar / horizontal-bar / line [optionally area:true] / pie / stacked-bar / scatter) inside one card or slot — every page gets at least one visualization. Use title-bento / featured-grid / bento only when each tile is a short label (≤ 1 sentence); otherwise the narrow tiles can not hold body copy. Per §4.1, charts do not take the whole page by default; reserve standalone chart layouts for pages that are pure visualization with no surrounding prose. Reserve big-number for numbers that truly deserve their own page.',
    },
    {
      value: 'case-study',
      label: '案例为主',
      labelEn: 'Case-study',
      implication: '→ 真实案例和客户故事支撑',
      promptRule: '论据类型 — 案例为主：真实案例和客户故事支撑每个论点。three-cards（挑战 → 方案 → 结果）或 timeline 叙述案例时间线。适合销售和分享场景。',
      promptRuleEn: 'Evidence — Case-study: real cases and customer stories back every claim. Use three-cards (challenge → solution → result) or timeline to walk through a case. Best for sales or knowledge-sharing decks.',
    },
  ],

  audience: [
    {
      value: 'boss',
      label: '老板（1 人决策者）',
      labelEn: 'Boss (single decision-maker)',
      implication: '→ 聚焦 KPI 和行动计划，删掉铺垫',
      promptRule: '受众 — 老板（决策者）：每页必须有一个可行动的 next step 或决策建议。用数据说话。不要铺垫，直接给结论。',
      promptRuleEn: 'Audience — Boss (decision-maker): every page must carry one actionable next step or a decision recommendation. Let data do the talking. Skip preamble, lead with the conclusion.',
    },
    {
      value: 'all-hands',
      label: '全公司',
      labelEn: 'All-hands',
      implication: '→ 故事感、鼓舞，用"我们"的口吻',
      promptRule: '受众 — 全公司：每页讲一个故事或成绩。语气温暖、鼓舞人心。用"我们"的口吻。第一页点题、最后一页展望。',
      promptRuleEn: 'Audience — All-hands: every page tells a story or a win. Warm, motivating tone; use "we" throughout. Page 1 names the theme, the final page looks forward.',
    },
    {
      value: 'client',
      label: '客户（外部决策者）',
      labelEn: 'Client (external buyer)',
      implication: '→ 从痛点切入，案例和方案',
      promptRule: '受众 — 客户：每页必须有一个痛点 → 方案的对应关系。用案例和具体场景说服。不用内部术语。',
      promptRuleEn: 'Audience — Client: every page pairs a pain point with its solution. Persuade with cases and concrete scenarios. Never use internal jargon.',
    },
    {
      value: 'investor',
      label: '投资人',
      labelEn: 'Investor',
      implication: '→ 增长数据、市场、团队',
      promptRule: '受众 — 投资人：每页至少有一个增长数据点。突出 TAM/SAM/SOM、用户增长曲线、团队核心竞争力。',
      promptRuleEn: 'Audience — Investor: every page surfaces at least one growth data point. Foreground TAM / SAM / SOM, the user-growth curve, and the team\'s core competitive edge.',
    },
    {
      value: 'academic',
      label: '学术受众（教授 / 同学 / 答辩委员会）',
      labelEn: 'Academic (faculty / peers / defense panel)',
      implication: '→ 结构化论证，允许引用和正文',
      promptRule: '受众 — 学术：采用结构化论证（研究问题 → 文献/背景 → 方法 → 证据/数据 → 讨论 → 结论）。允许更多正文与脚注式引用（标注作者 + 年份）。避免营销口吻、避免空洞标语。结尾给出局限性与后续研究方向。',
      promptRuleEn: 'Audience — Academic: use a structured argument (research question → literature / background → method → evidence / data → discussion → conclusion). Allow longer body copy and footnote-style citations (author + year). Avoid marketing voice and empty slogans. Close with limitations and future research directions.',
    },
  ],

  keyTakeaway: [
    {
      value: 'number',
      label: '一个关键数字或结论',
      labelEn: 'One key number / conclusion',
      implication: '→ 全文围绕一个数字展开',
      promptRule: '核心信息 — 关键数字：全文围绕一个关键数字展开。用 big-number 布局突出核心数据，其它页做铺垫和论证。',
      promptRuleEn: 'Key takeaway — Key number: the whole deck orbits a single headline number. Use big-number to feature it; other pages set up and prove that number.',
    },
    {
      value: 'logic',
      label: '一套完整的分析逻辑',
      labelEn: 'Complete analytical logic',
      implication: '→ 每页按因果关系递进',
      promptRule: '核心信息 — 完整逻辑：每页按因果关系递进。先问题，再分析，最后结论。读者看完后能复述完整逻辑链。',
      promptRuleEn: 'Key takeaway — Complete logic: each page advances the causal chain. Problem first, analysis next, conclusion last. The reader should be able to replay the full logic after reading.',
    },
    {
      value: 'action',
      label: '一个可执行的方案',
      labelEn: 'One actionable plan',
      implication: '→ 最后一页是明确的 next step',
      promptRule: '核心信息 — 行动方案：最后一页必须是明确的行动方案（who / what / when）。前面的页为这个行动提供理由。',
      promptRuleEn: 'Key takeaway — Actionable plan: the final page must be an explicit action plan (who / what / when). Every earlier page supplies a reason to take that action.',
    },
    {
      value: 'story',
      label: '一个故事或案例',
      labelEn: 'One story / case',
      implication: '→ 叙事结构，代入感优先',
      promptRule: '核心信息 — 故事：用叙事结构串联全文。开头设置冲突/悬念，中间展开，结尾解决。代入感优先。',
      promptRuleEn: 'Key takeaway — Story: thread the whole deck with a narrative arc. Open with tension / a hook, develop it in the middle, resolve it at the end. Emotional engagement beats structural neatness.',
    },
  ],
  language: [
    {
      value: 'zh',
      label: '全中文',
      labelEn: 'Chinese',
      implication: '→ 标题、正文、数据全中文',
      promptRule: '语言：全中文。标题、正文、图表标签、数据单位全部使用中文。专有名词可以括注英文，但主要呈现用中文。',
      promptRuleEn: 'Language: all Chinese. Titles, body copy, chart labels, and data units all in Chinese. Proper nouns can be parenthesized in English, but the primary surface stays Chinese.',
    },
    {
      value: 'en',
      label: '全英文',
      labelEn: 'English',
      implication: '→ All English surface',
      promptRule: '语言：全英文。所有文案（标题 / 正文 / 图表标签 / 单位）均为英文。即使内容来源是中文也要翻译。',
      promptRuleEn: 'Language: all English. Every surface string (titles, body, chart labels, units) must be in English. If the source material is Chinese, translate it.',
    },
    {
      value: 'bilingual',
      label: '中英混排',
      labelEn: 'Bilingual',
      implication: '→ 中文标题 + 英文术语/数据',
      promptRule: '语言：中英混排。标题和主要正文用中文，但专业术语、英文缩写、数据单位、来源引用保留英文（例：Zillow、CPI、YoY、Q1 2026）。适合面向国内但讨论海外市场的演示。',
      promptRuleEn: 'Language: bilingual. Titles and main body in Chinese; technical terms, English acronyms, data units, and citations stay in English (e.g., Zillow, CPI, YoY, Q1 2026). Good for Chinese-language decks discussing overseas markets.',
    },
  ],
};

// ----------------------------------------------------------------------------
// Lookup helpers
// ----------------------------------------------------------------------------

/** Find option by key + value. Returns undefined if unknown value. */
export function getSelectorOption(key: SelectorKey, value: string | undefined): SelectorOption | undefined {
  if (!value) return undefined;
  return SELECTOR_RULES[key]?.find(o => o.value === value);
}

/** Get the label for LLM prompt injection (falls back to value verbatim). */
export function labelFor(key: SelectorKey, value: string | undefined, locale?: 'zh' | 'en'): string | undefined {
  if (!value) return undefined;
  const opt = getSelectorOption(key, value);
  if (!opt) return undefined;
  return (locale === 'en' ? opt.labelEn : undefined) ?? opt.label ?? value;
}

/** Get the prompt rule text for LLM injection. undefined if no option. */
export function promptRuleFor(key: SelectorKey, value: string | undefined, locale?: 'zh' | 'en'): string | undefined {
  if (!value) return undefined;
  const opt = getSelectorOption(key, value);
  if (!opt) return undefined;
  return (locale === 'en' ? opt.promptRuleEn : undefined) ?? opt.promptRule;
}

/** Get the UI implication hint. undefined if no option. */
export function implicationFor(key: SelectorKey, value: string | undefined): string | undefined {
  if (!value) return undefined;
  return getSelectorOption(key, value)?.implication;
}

// ----------------------------------------------------------------------------
// Bulk helpers — used by mdContext.ts and orchestrator.ts to build the
// injected preferences block
// ----------------------------------------------------------------------------

export interface SelectorContext {
  purpose?: string;
  density?: string;
  narrative?: string;
  evidence?: string;
  audience?: string;
  keyTakeaway?: string;
  dataEmphasis?: string;
}

/**
 * Build the preferences block with BOTH labels (for human scanning) AND full
 * prompt rules (for the LLM to act on). English locale uses `labelEn` /
 * `promptRuleEn` when present so English decks don't get a Chinese rule body
 * baked into their system prompt.
 *
 * Used by:
 *   - mdContext.ts (LLM1 content structuring)
 *   - orchestrator.ts (LLM2 per-slide generation)
 */
export function buildPreferencesBlock(
  ctx: SelectorContext,
  freeFormHints?: Record<string, string>,
  locale?: 'zh' | 'en',
): string {
  const isEn = locale === 'en';
  const lines: string[] = [];

  const pairs: Array<[SelectorKey, string | undefined, string, string]> = [
    ['purpose', ctx.purpose, '目的', 'Purpose'],
    ['narrative', ctx.narrative, '叙事方式', 'Narrative'],
    ['evidence', ctx.evidence, '论据类型', 'Evidence'],
    ['audience', ctx.audience, '受众', 'Audience'],
    ['density', ctx.density, '信息密度', 'Information density'],
    ['keyTakeaway', ctx.keyTakeaway, '核心信息', 'Key takeaway'],
  ];

  for (const [key, value, headingZh, headingEn] of pairs) {
    const opt = getSelectorOption(key, value);
    if (!opt) continue;
    const labelOut = (isEn ? opt.labelEn : undefined) ?? opt.label ?? opt.value;
    const ruleOut = (isEn ? opt.promptRuleEn : undefined) ?? opt.promptRule;
    lines.push(`${isEn ? headingEn : headingZh}${isEn ? ': ' : '：'}${labelOut}`);
    lines.push(`${isEn ? 'Rule' : '规则'}${isEn ? ': ' : '：'}${ruleOut}`);
    lines.push('');
  }

  // data-emphasis uses evidence-adjacent semantics — inject directly for backward compat
  if (ctx.dataEmphasis && ctx.dataEmphasis !== 'none') {
    const zhRules: Record<string, string> = {
      some: '页面里有数字时优先嵌入到现有 layout（cards / title-body 内联），仅当一整页的核心就是一个关键数字时才用 big-number。',
      heavy: '数据贯穿每页：优先用 two-column / split-image / dashboard / stat-row 作为页面骨架，把 bar-chart / line-chart / pie-chart / horizontal-bar-chart 作为 chart 字段嵌入其中一个卡片（宪法 §4.1：chart 默认不独占整页）。仅当每张 tile 内容都是短标签（≤ 1 句话）时，才可以用 title-bento / featured-grid / bento；否则小 tile 装不下正文。独立 bar-chart / line-chart / pie-chart 页面仅在该页纯粹是一张图、无旁白时使用，一份 deck 最多 1 页。big-number 仅留给真正需要单独放大展示的关键数字（一份 deck 通常 1-2 页）。',
    };
    const enRules: Record<string, string> = {
      some: 'When a page carries numbers, embed them inside an existing layout (cards / title-body inline). Reserve big-number for pages whose whole point is a single key number.',
      heavy: 'Data threads through every page. Use two-column / split-image / dashboard / stat-row as the page skeleton and embed chart (bar / horizontal-bar / line / pie / stacked-bar / scatter) inside one card or slot (§4.1: charts do not take the whole page by default). Use title-bento / featured-grid / bento only when each tile is a short label (≤ 1 sentence); otherwise the narrow tiles can not hold body copy. Reserve standalone bar-chart / line-chart / pie-chart pages for pages that are pure visualization with no surrounding prose — at most 1 per deck. Reserve big-number for the 1–2 headline numbers that truly deserve their own page.',
    };
    const rule = (isEn ? enRules : zhRules)[ctx.dataEmphasis];
    if (rule) {
      lines.push(`${isEn ? 'Data display' : '数据展示'}${isEn ? ': ' : '：'}${ctx.dataEmphasis}`);
      lines.push(`${isEn ? 'Rule' : '规则'}${isEn ? ': ' : '：'}${rule}`);
      lines.push('');
    }
  }

  // Append free-form hints verbatim (unknown-key answers and extra-note)
  if (freeFormHints && Object.keys(freeFormHints).length > 0) {
    lines.push(isEn ? 'User notes (apply verbatim):' : '用户备注（逐字遵守）：');
    for (const [k, v] of Object.entries(freeFormHints)) {
      if (!v?.trim()) continue;
      lines.push(`- ${k}: ${v.trim()}`);
    }
  }

  return lines.join('\n').trim();
}
