import type { Layout } from '../types';
import { LAYOUT_REGISTRY } from '../types';
import type { Locale } from '../i18n';
import { DESIGN_PRINCIPLES_PROMPT } from './harness/designPrinciples';
import { PROMPT_FRAGMENTS as ZH } from './prompts.zh';
import { PROMPT_FRAGMENTS as EN } from './prompts.en';

function buildLayoutList(locale: 'en' | 'zh'): string {
  return LAYOUT_REGISTRY
    .filter(m => m.hint)
    .map(m => `- \`${m.layout}\` — ${m.hint![locale]}`)
    .join('\n');
}

/** v2.4: pipeline format — slide deck (16:9) or report (letter/a4 vertical). */
export type GenerateFormat = 'slide' | 'report';

/** Select fragment set by locale. Default to Chinese. */
function F(locale: Locale = 'zh') { return locale === 'en' ? EN : ZH; }

// ---------------------------------------------------------------------------
// Re-export top-level constants for backward compat (callers that import them
// directly). These remain Chinese — they're only used by callers that haven't
// been updated to pass locale yet.
// ---------------------------------------------------------------------------
export const LAYOUTS_DESCRIPTION = ZH.LAYOUTS_DESCRIPTION;
export const CONSTRAINTS = ZH.CONSTRAINTS;
export const REPORT_LAYOUTS_DESCRIPTION = ZH.REPORT_LAYOUTS_DESCRIPTION;
export const REPORT_CONSTRAINTS = ZH.REPORT_CONSTRAINTS;

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

export function outlineSystemPrompt(format: GenerateFormat = 'slide', locale: Locale = 'zh'): string {
  const f = F(locale);
  if (format === 'report') {
    return `${f.outlineSystemRole_report}

${DESIGN_PRINCIPLES_PROMPT}

${f.REPORT_LAYOUTS_DESCRIPTION}

${f.REPORT_CONSTRAINTS}

${f.outlineReportOutputFormat}`;
  }
  return `${f.outlineSystemRole_slide}

${DESIGN_PRINCIPLES_PROMPT}

${f.LAYOUTS_DESCRIPTION}

${f.CONSTRAINTS}

${f.outlineOutputFormat}`;
}

// ---------------------------------------------------------------------------
// Slide generation
// ---------------------------------------------------------------------------

export function slideSystemPrompt(theme: string, format: GenerateFormat = 'slide', locale: Locale = 'zh'): string {
  const f = F(locale);
  if (format === 'report') {
    return `${f.slideSystemRole_report}

${DESIGN_PRINCIPLES_PROMPT}

${f.REPORT_LAYOUTS_DESCRIPTION}

Theme: ${theme}

${f.REPORT_CONSTRAINTS}

${f.slideReportOutputFormat}`;
  }
  return `${f.slideSystemRole_slide}

${DESIGN_PRINCIPLES_PROMPT}

${f.LAYOUTS_DESCRIPTION}

Theme: ${theme}

${f.CONSTRAINTS}

## Content Fidelity Rule

When the user message contains "🚨 Page title (use verbatim)", "🚨 Subtitle (use verbatim)", "🚨 Supporting points (use verbatim)", or "🚨 Data/evidence (use verbatim)", you MUST use that content exactly as provided. Do not paraphrase, reword, or embellish titles/subtitles; do not summarize or omit supporting items. These are user-approved content that must appear in the final slide. If the layout cannot fit all items, use a layout that accommodates all content rather than dropping items.

The "📝 Additional content" block is context — you may paraphrase or restructure it to fit the layout, but do not contradict its meaning or drop key facts.

${f.slideOutputFormat}`;
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

export function editSystemPrompt(
  theme: string,
  opts?: { contentLocked?: boolean; targetLayout?: string },
  locale: Locale = 'zh',
): string {
  const f = F(locale);

  // Chart conversion mode: lock layout, skip text lock (content necessarily changes)
  if (opts?.targetLayout) {
    const layoutLine = f.LAYOUTS_DESCRIPTION
      .split('\n')
      .find(l => l.trimStart().startsWith(`- ${opts.targetLayout}:`));
    const schemaDesc = layoutLine ? layoutLine.trim() : `layout: ${opts.targetLayout}`;

    return `${f.editChartConversionRole}

${DESIGN_PRINCIPLES_PROMPT}

Theme: ${theme}

${f.editChartConversionMode(opts.targetLayout)}

${locale === 'en' ? 'Field definition' : '字段定义'}:
${schemaDesc}

${f.editChartRules}`;
  }

  const lockBlock = opts?.contentLocked ? `\n${f.editTextLock}\n` : '';

  return `${f.editSystemRole}

${DESIGN_PRINCIPLES_PROMPT}

${f.LAYOUTS_DESCRIPTION}

Theme: ${theme}

${f.editTypeJudgment}

${f.editStyleFields}
${lockBlock}
${f.editPartialUpdate}`;
}

// ---------------------------------------------------------------------------
// Single-field edit (B1)
// ---------------------------------------------------------------------------
// Used when ChatPanel sends fieldPath — the user clicked a specific text field
// in Canvas before typing into chat, so the intent is scoped to that one leaf.
// Prompt is deliberately tiny (no layout descriptions, no design principles,
// no style fields) because the LLM's job here is single-string rewriting, not
// layout/composition judgment. Returns {"newValue": "..."} ONLY.
export function editSingleFieldSystemPrompt(
  theme: string,
  fieldPath: string,
  currentValue: string,
  locale: Locale = 'zh',
): string {
  if (locale === 'en') {
    return `You are a copy editor for a slide at theme "${theme}".

The user is editing ONE specific text field on the current slide. Your job is
to rewrite ONLY that field's string value based on their instruction. Do NOT
touch any other field, add new fields, change layout, or return the whole
slide.

Field path: ${fieldPath}
Current value: ${JSON.stringify(currentValue)}

Return ONLY a JSON object with exactly this shape, nothing else:
{"newValue": "<the rewritten string>"}

Rules:
- Preserve the user's original language unless they ask for translation.
- Keep length comparable to the current value unless the instruction explicitly
  asks for longer/shorter text.
- Never include markdown fences, comments, or explanations — only the JSON.`;
  }

  return `你是幻灯片（主题："${theme}"）的文案编辑。

用户正在编辑当前页的**一个具体字段**。你的任务是**只**根据指令改写这一个字段的字符串值。**不要**改动其它字段、新增字段、改 layout，也不要返回整页。

字段路径：${fieldPath}
当前值：${JSON.stringify(currentValue)}

只返回如下形状的 JSON，不要任何其它内容：
{"newValue": "<改写后的字符串>"}

规则：
- 保留用户原来使用的语言，除非指令明确要求翻译。
- 长度与当前值保持接近，除非指令明确要求更长/更短。
- 不要加 markdown 围栏、不要加注释或解释，只返回 JSON。`;
}

// ---------------------------------------------------------------------------
// Plan outline
// ---------------------------------------------------------------------------

export function planOutlineSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  const langGuard = locale === 'en'
    ? `

## Output language (highest priority, non-negotiable)

**Match the user's raw input language. If the user wrote in English, every field in your JSON — \`title\`, \`summary\`, every page's \`title\` and \`direction\`, and any \`pageCountNote\` — must be entirely in English.**

The user message may include a \`## User preferences\` block whose \`Rule:\` lines are written in Chinese (internal rule shorthand). **Apply their meaning, but never mirror Chinese wording into your output.** Do not emit Chinese page titles like "封面" / "总结", Chinese directions like "开场，引出主题", or Chinese keywords like "核心观点" / "关键数据" — render their intent with appropriate English vocabulary.`
    : '';
  return `${f.planOutlineSystemRole}${langGuard}

${f.planOutlineBody}`;
}

// ---------------------------------------------------------------------------
// md-context
// ---------------------------------------------------------------------------

export function mdContextSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);

  // The mdContext prompt is very long (scope, format, examples, strategies, rules).
  // We keep the full body inline here because it contains extensive formatting examples
  // that differ by locale. The system role line comes from fragments.
  if (locale === 'en') {
    return `${f.mdContextSystemRole}

## Output language (highest priority, non-negotiable)

**Match the user's raw input language. If the user wrote in English, every field you output — titles, corePoint, subPoints, bullet keywords (the bold \`**...**\` part), taglines, subtitles, frontmatter fields, and the \`> data/citation\` line — must be entirely in English.**

The user message below may include a \`[User preferences]\` block and style/skill/theme instructions that are themselves written in Chinese (internal rule shorthand). **Apply their meaning, but never mirror their Chinese wording into your output.** Do not translate user content into Chinese, do not insert Chinese keywords like "关键数据" / "核心观点" / "情景" / "论据" into bullet labels, do not emit mixed-language bullets like \`**分歧最大的变量** — …\` for an English deck. If a rule is written in Chinese (e.g. "研究分析：投行/咨询式深度分析"), render its intent with English vocabulary appropriate to the deck.

## Scope

You handle **content** (titles, what each page covers, deck metadata) and **layout selection** (one \`> hint:\` per page).

## Output format

\`\`\`
---
title: <deck title>
pageCount: <number>  # Total pages including cover and end
audience: <optional, fill when user mentions audience>
tone: <optional, "casual"/"serious"/"narrative" etc.>
preset: <optional, only when user explicitly mentions style: warm/minimal/dark-tech/editorial/playful>
---

# <First page title> [type: cover]
<Subtitle or tagline (optional, one sentence)>

# <Second page title> [type: content]
## <Subtitle (optional, clarifies title direction)>
<Core point: one sentence>
- **<Evidence 1>** — <one sentence explanation>
- **<Evidence 2>** — <one sentence explanation>
> <Data/citation (optional, specific data, case studies, original quotes)>
> hint: two-column

# <Third page title> [type: content]
<Core point: one sentence>
- **<keyword/number>** — <one sentence explanation>
- **<keyword/number>** — <one sentence explanation>
> hint: big-number
\`\`\`

### Layout selection

For each content page, add a \`> hint: <layout>\` line to recommend the best visual layout. Think like a presentation designer: what structure best serves this page's message?

**Available layouts** (pick one per page):
${buildLayoutList('en')}

**Selection principles**:
1. Match content to structure: numbers → \`big-number\`; charts → choose between a standalone chart layout (when the chart IS the page) or a text layout (\`two-column\`/\`split-image\`/\`title-bento\`) with a \`chart\` field inline (when prose and chart coexist). Process → \`steps\`/\`flowchart\`; comparison → \`versus\`/\`two-column\`. Standalone \`bar-chart\`/\`line-chart\`/\`pie-chart\`/\`horizontal-bar-chart\`/\`stacked-bar-chart\`/\`scatter-chart\`/\`dual-axis-bar\`/\`heatmap\` are encouraged when the page's primary message IS the chart (title + chart + brief annotations/footnote is enough). Do NOT degrade chartable data into card-grids (three-cards/stat-row) just to look denser.
2. Vary layouts across pages — avoid 5 consecutive \`two-column\` slides
3. When in doubt, \`two-column\` is the safe default for text-heavy content
4. Cover and end pages don't need \`> hint:\` (they have fixed layouts)

### Page type tags (only 4 — constitution §2)

Every H1 **must** be followed by \`[type: xxx]\`. Exactly four values are allowed:
- \`[type: cover]\` — Cover page (first page, required)
- \`[type: section]\` — Section / TOC / divider page (navigational, minimal text; 7+ pages should have a TOC at the start, 10+ pages should have dividers at topic switches)
- \`[type: content]\` — All body pages (data pages, case studies, Q&A, transitions, summaries are all \`content\` — fine-grained intent is expressed through \`> hint:\` layout like \`big-number\` / \`three-cards\` / \`stat-row\` / \`steps\` / \`versus\`, NOT through pageType)
- \`[type: back]\` — End page (last page, required; can be a punchline, thanks, contact info, or CTA)

**Do not** emit legacy tags such as \`[type: data]\`, \`[type: case-study]\`, \`[type: transition]\`, \`[type: section-cover]\`, \`[type: toc]\`, \`[type: qa]\`, or \`[type: summary]\` — they will be rejected downstream. If the user's plan already labels a page as \`[section]\` or \`[content]\`, mirror that label exactly.

### Per-page structure

Below H1, in order:
1. **\`## Subtitle\`** (optional) — clarifies the title direction
2. **Core point** (required, one sentence) — the most important sentence on this page
3. **Evidence bullets** (required, 2-5) — use \`- **xxx** — ...\` format, each is a supporting argument for the core point. Downstream will turn each bullet into a card / bar / column
4. **Data/citation** (optional) — use \`> data/quote\` format. Specific data, case studies, original quotes

### Global structure

- **Always** generate a cover [type: cover] (first page) and end page [type: back] (last page)
- For **7+ pages**, consider a table-of-contents page — emit it as [type: section] with a minimal agenda-style body
- For **10+ pages**, add topic dividers at chapter transitions — also [type: section]
- Closing summary / transition / Q&A pages are [type: content]; differentiate them through \`> hint:\` layout choice, not a dedicated page type

## Three input types, three strategies

### A. Short topic (one or two sentences, e.g. "5 pages about remote work")
Propose a title + core point + 2-3 bullets per page as **suggestions**. The system will display them for user review.
Use your knowledge to supplement with reasonable content, but do not fabricate specific data (percentages, amounts, etc.) — use qualitative descriptions instead.

### B. Medium content (outline/bullets/a few paragraphs)
Organize it. Preserve the user's original arguments and data, don't change the meaning. You may polish wording and trim redundancy.

### C. Long content (article/script/report, over 300 words)
**Preserve depth, do not over-compress** — this is your most important capability:
- Read the entire text, identify the major sections (usually follows the source's H2/H3 structure)
- A dense data-heavy section (≥1500 source chars with tables or multiple stat clusters) usually needs **2-4 pages**, not one. Do not force it into a single "4 stat cards" page.
- Short argument-only sections can stay as 1 page.
- **Must preserve**: every numeric value (percentages, amounts, counts, YoY/MoM deltas), named entities (places, cities, companies, people), case study names, table rows with distinct data, original quoted punchlines. If the source has a 10-row table, the deck should surface most of it — split across pages if needed — not collapse to 3 bullets.
- **Must remove**: transition sentences, setup, "hello everyone" openings, repeated arguments, pleasantries
- Rule of thumb: a 5,000-word analytical report typically maps to 15-25 deck pages, not 7.

### D. Mixed input (half has content, half only has a topic)
Pages with content → organize and preserve; pages with only a topic → supplement with suggested content. Add a marker before suggested content bullets so the user can identify what was AI-supplemented.

## Rules

1. **[TODO] placeholders are absolutely forbidden**. Every page must have a core point + at least 2 bullets, EXCEPT:
   - Cover pages [type: cover]: title + optional subtitle only, no bullets required
   - End pages [type: back]: title + optional subtitle/CTA only, no bullets required
2. **Page count must match**. User says N pages → N H1s. If not specified → short topics default to 5 pages, long content based on argument count.
3. **Bullets are raw material for downstream**. 2-5 bullets per page, one bullet per line. Do not write paragraphs. Downstream will turn each bullet into a card / bar / column.
4. **Add \`> hint:\` for every content page**. Pick the layout that best serves the page's message (see Layout selection above). Cover and end pages are exempt.
5. **Output canonical md only**. No explanations, no commentary, no "here is the organized result".`;
  }

  // Chinese (default) — original prompt text
  return `${f.mdContextSystemRole}

## 作用域

你负责**内容**（标题、每页写什么、deck 元信息）和 **layout 选择**（每页一个 \`> hint:\`）。

## 输出格式

\`\`\`
---
title: <deck 标题>
pageCount: <数字>  # 总页数，包含封面和尾页
audience: <可选，用户提到受众时填>
tone: <可选，"轻松"/"严肃"/"故事感"等>
preset: <可选，仅用户明确提风格时: warm/minimal/dark-tech/editorial/playful>
---

# <第一页标题> [type: cover]
<副标题或 tagline（可选，一句话）>

# <第二页标题> [type: content]
## <副标题（可选，补充说明标题方向）>
<核心观点：一句话>
- **<论据 1>** — <一句话说明>
- **<论据 2>** — <一句话说明>
> <数据/引证（可选，具体数据、案例、原文金句）>
> hint: two-column

# <第三页标题> [type: content]
<核心观点：一句话>
- **<关键词/数字>** — <一句话说明>
- **<关键词/数字>** — <一句话说明>
> hint: big-number
\`\`\`

### Layout 选择

每个内容页加一行 \`> hint: <layout>\`，推荐最适合该页信息的视觉结构。像演示设计师一样思考：什么结构最能服务这页的核心信息？

**可用 layout**（每页选一个）：
${buildLayoutList('zh')}

**选择原则**：
1. 内容匹配结构：数字 → \`big-number\` 或文字类 layout（\`two-column\`/\`split-image\`/\`title-bento\`）再把 chart 作为字段内嵌；流程 → \`steps\`/\`flowchart\`；对比 → \`versus\`/\`two-column\`。**不要**直接选独立的 \`bar-chart\`/\`line-chart\`/\`pie-chart\`/\`horizontal-bar-chart\`/\`stacked-bar-chart\`/\`scatter-chart\`——仅当整页只有一张图、完全没有旁白文字时才用独占 chart layout。
2. 跨页变换 layout——避免连续5页都是 \`two-column\`
3. 拿不准时，\`two-column\` 是文字密集内容的安全默认
4. 封面和尾页不需要 \`> hint:\`（它们有固定 layout）

### 页面类型标签（仅 4 种——宪法 §2）

每页 H1 后面**必须**加 \`[type: xxx]\`，且只能是以下 4 种之一：
- \`[type: cover]\` — 封面（第一页，必须有）
- \`[type: section]\` — 小节 / 目录 / 分隔页（导航类，文字极简；7+ 页建议开头有目录，10+ 页建议主题切换处插入分隔）
- \`[type: content]\` — 所有正文页（数据页、案例、Q&A、过渡、总结都归 \`content\`——细分语义通过 \`> hint:\` layout 表达，如 \`big-number\` / \`three-cards\` / \`stat-row\` / \`steps\` / \`versus\`，**不**体现在 pageType）
- \`[type: back]\` — 尾页（最后一页，必须有；可以是金句、致谢、联系方式或 CTA）

**不要**再使用旧的 \`[type: data]\` / \`[type: case-study]\` / \`[type: transition]\` / \`[type: section-cover]\` / \`[type: toc]\` / \`[type: qa]\` / \`[type: summary]\` 等标签——下游会拒绝。如果用户给的 plan 里某页已经标注了 \`[section]\` 或 \`[content]\`，**原样沿用**。

### 每页结构

H1 下面按顺序：
1. **\`## 副标题\`**（可选）— 补充说明标题方向
2. **核心观点**（必须，一句话）— 这页最重要的一句话
3. **论据 bullets**（必须，2-5 条）— 用 \`- **xxx** — ...\` 格式，每条是对核心观点的支撑性阐述。下游会把每条变成一张 card / 一根 bar
4. **数据/引证**（可选）— 用 \`> 数据/引用\` 格式。具体数据、案例、原文金句

### 全局结构

- **始终**生成封面 [type: cover]（第一页）和尾页 [type: back]（最后一页）
- **7+ 页**时考虑加目录页——作为 [type: section]，正文极简（议程式）
- **10+ 页**时在主题切换处加分隔页——同样是 [type: section]
- 结尾前的总结页、过渡页、Q&A 页都是 [type: content]，靠 \`> hint:\` 选 layout 区分（而不是给 pageType 开新种类）

## 三种输入，三种策略

### A. 短 topic（一两句话，如"5 页关于远程办公"）
为每页提一个标题 + 核心观点 + 2-3 个 bullet 作为**建议**。系统会展示给用户审阅。
用你的知识补充合理内容，但不要编造具体数据（百分比、金额等）——用定性描述代替。

### B. 中等内容（大纲/bullet/几段话）
组织它。保留用户原始论点和数据，不改意思。可以润色措辞、精简冗余。

### C. 长内容（文章/脚本/报告，超过 300 字）
**保留深度，切勿过度压缩**——这是你最重要的能力：
- 通读全文，识别主要章节（通常沿用原文的 H2/H3 结构）
- 数据密集、含表格/多组指标的 section（原文 ≥1500 字）通常需要 **2-4 页**展开，不要压成单张"4 个数字卡"页
- 短的、只有论点的 section 保留 1 页即可
- **必须保留**：每一个数值（百分比、金额、计数、同比/环比）、专有名词（地名/城市/公司/人名）、案例名、表格里有区分度的每一行数据、引用原文金句。原文如果有 10 行的表，deck 里就应该大部分呈现出来——必要时跨多页——不能压成 3 个 bullet
- **必须删掉**：过渡句、铺垫、"大家好"开场、重复论述、客套话
- 经验法则：一篇 5000 字的分析报告典型对应 15-25 页 deck，而非 7 页

### D. 混合输入（一半有内容，一半只有 topic）
有内容的页 → 组织保留；只有 topic 的页 → 补充建议内容。在建议内容的 bullet 前加 💡 标记，方便用户识别哪些是 AI 补充的。

## 规则

1. **绝对不允许 \`[TODO]\` 占位符**。每页必须有核心观点 + 至少 2 个 bullet，**除了**：
   - 封面 [type: cover]：只需标题 + 可选副标题，不需要 bullet
   - 尾页 [type: back]：只需标题 + 可选副标题/CTA，不需要 bullet
2. **页数必须匹配**。用户说 N 页 → N 个 H1。没说 → 短 topic 默认 5 页，长内容按论点数。
3. **bullet 是下游的原料**。每页 2-5 个 bullet，每个 bullet 一行。不要写段落。下游会把每个 bullet 变成一张 card / 一根 bar / 一个 column。
4. **每个内容页加 \`> hint:\`**。选择最能服务该页信息的 layout（见上面 Layout 选择）。封面和尾页不需要。
5. **只输出 canonical md**。不要解释、不要评论、不要"以下是整理结果"。
6. **🚨 Plan-constrained mode**：当用户消息以"🚨 硬约束"开头时，必须严格按照给定的页面结构生成，每页的标题和 pageType 不可更改，只填充详细内容。`;
}

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

export function designSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  return `${f.designSystemRole}

${DESIGN_PRINCIPLES_PROMPT}

${f.designInputDescription}

## ${locale === 'en' ? 'Output' : '输出'}

${locale === 'en' ? 'Output a Slidev-format mdDesign document' : '输出一份 Slidev 格式的 mdDesign 文档'}:

### ${locale === 'en' ? 'deck level (YAML front-matter at the very top of the document)' : 'deck 级（文档最顶部的 YAML front-matter）'}:
\`\`\`yaml
---
theme: lasca
preset: <preset-id>
colorTheme: <warm|cool|dark|original>
emphasis: <minimal|bold|editorial>
accent: "<hex color>"
fonts:
  display: <fraunces|bricolage-grotesque|plus-jakarta|lora>
  body: <fraunces|bricolage-grotesque|plus-jakarta|lora>
rationale: "<${locale === 'en' ? 'one sentence explaining your choice' : '一句话解释你为什么这样选'}>"
---
\`\`\`

### ${locale === 'en' ? 'slide level (one --- separated YAML block + body per page)' : 'slide 级（每页一个 --- 分隔的 YAML block + body）'}:
\`\`\`yaml
---
layout: <cover|big-number|title-body|three-cards|two-column|split-image|icon-list|stacked-bars|grid-cards|timeline|table|quote|image|bar-chart|horizontal-bar-chart|line-chart|pie-chart|stacked-bar-chart|scatter-chart|flowchart|funnel|pyramid|steps|matrix|versus|venn|bullseye|cycle|agenda|team|logo-wall|pricing|device-mockup|section-break|stat-row>
aesthetic: "<${locale === 'en' ? 'one-sentence visual description, e.g.: giant number centered, dark bg with accent horizontal rule' : '一句话视觉描述，如：巨型数字居中，暗底 accent 横线'}>"
rationale: "<${locale === 'en' ? 'why this layout' : '为什么选这个 layout'}>"
---
\`\`\`

${f.designSlideLevelFormat}

## ${locale === 'en' ? 'Available layouts' : '可用 layouts'}

${f.LAYOUTS_DESCRIPTION}

## ${locale === 'en' ? 'Constraints' : '约束'}

${f.CONSTRAINTS}

${f.designDemandRules}

${f.designDecisionScope}

${f.designFontRules}

${f.designOutputFormat}`;
}

// ---------------------------------------------------------------------------
// Smart PDF redesign
// ---------------------------------------------------------------------------

export function smartRedesignSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  return `${f.smartRedesignSystemRole}

${DESIGN_PRINCIPLES_PROMPT}

## ${locale === 'en' ? 'Available layouts' : '可用 layouts'}

${f.LAYOUTS_DESCRIPTION}

${f.smartRedesignLayoutRules}

${f.smartRedesignConstraints}
- ${f.CONSTRAINTS.split('\n').filter(l => l.includes(locale === 'en' ? 'CRITICAL' : '绝对禁止')).join('\n')}

${f.smartRedesignOutputFormat}`;
}

// ---------------------------------------------------------------------------
// Recheck
// ---------------------------------------------------------------------------

export function recheckSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  return `${f.recheckSystemRole}

${DESIGN_PRINCIPLES_PROMPT}

${f.recheckChecklist}`;
}

// ---------------------------------------------------------------------------
// PPTX polish
// ---------------------------------------------------------------------------

export function pptxPolishSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  return `${f.polishSystemRole}

${DESIGN_PRINCIPLES_PROMPT}

${f.polishOutputFormat}

${f.polishRules}`;
}

// ---------------------------------------------------------------------------
// Recolor
// ---------------------------------------------------------------------------

export function recolorSystemPrompt(locale: Locale = 'zh'): string {
  const f = F(locale);
  return `${f.recolorSystemRole}

${f.recolorTask}

${f.recolorCssVariables}

${f.recolorFontVariables}

${f.recolorRules}

${f.recolorOutputFormat}`;
}

// ---------------------------------------------------------------------------
// isHighRisk (pure logic, no locale needed)
// ---------------------------------------------------------------------------

/** Determine whether a slide is high-risk and needs visual recheck */
export function isHighRisk(layout: Layout, data: Record<string, unknown>): boolean {
  if (layout === 'three-cards') {
    const cards = data.cards as unknown[] | undefined;
    if (cards && cards.length >= 4) return true;
  }
  if (layout === 'stacked-bars') {
    const bars = data.bars as unknown[] | undefined;
    if (bars && bars.length >= 5) return true;
  }
  if (layout === 'grid-cards') {
    const cards = data.cards as unknown[] | undefined;
    if (cards && cards.length >= 6) return true;
  }
  if (layout === 'icon-list') {
    const items = data.items as unknown[] | undefined;
    if (items && items.length >= 5) return true;
  }
  if (layout === 'timeline') {
    const events = data.events as unknown[] | undefined;
    if (events && events.length >= 5) return true;
  }
  if (layout === 'table') {
    const rows = data.rows as unknown[][] | undefined;
    const headers = data.headers as unknown[] | undefined;
    if (rows && rows.length >= 5) return true;
    if (headers && headers.length >= 5) return true;
  }
  // v4 Charts & Diagrams
  if (layout === 'bar-chart' || layout === 'horizontal-bar-chart') {
    const items = data.items as unknown[] | undefined;
    if (items && items.length >= 7) return true;
  }
  if (layout === 'line-chart') {
    const series = data.series as unknown[] | undefined;
    const labels = data.labels as unknown[] | undefined;
    if (series && series.length >= 3) return true;
    if (labels && labels.length >= 7) return true;
  }
  if (layout === 'pie-chart') {
    const items = data.items as unknown[] | undefined;
    if (items && items.length >= 5) return true;
  }
  if (layout === 'stacked-bar-chart') {
    const series = data.series as unknown[] | undefined;
    const labels = data.labels as unknown[] | undefined;
    if (series && series.length >= 5) return true;
    if (labels && labels.length >= 8) return true;
  }
  if (layout === 'scatter-chart') {
    const points = data.points as unknown[] | undefined;
    if (points && points.length >= 40) return true;
  }
  if (layout === 'flowchart' || layout === 'cycle') {
    const arr = (data.steps || data.items) as unknown[] | undefined;
    if (arr && arr.length >= 5) return true;
  }
  // Check text length
  const title = data.title as string | undefined;
  if (title && title.length > 12) return true;

  return false;
}
