import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getModel } from '@/lib/ai/model';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { ClarifierAnswers, ClarifierQuestion, ClarifierOption } from '@/lib/ai/harness/types';
import { STEP1_AXES, DECIDE_FOR_YOU_VALUE } from '@/lib/ai/harness/types';
import { inferSlideStructure } from '@/lib/ai/harness/orchestrator';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';

type Mode = 'topic' | 'full-content';
type QuestionDensity = 'full' | 'compact';

// ── Prompt builders ────────────────────────────────────────────────────
// Two axes (locale + density) × base rules.  The base rules — especially the
// Step 1 blacklist and the recommendedValue / 由你决定 conventions — stay
// identical; only the target count and the "how aggressive" wording shifts.

const BLACKLIST_LINE_ZH =
  `严禁追问以下轴（第一步 pill 已收集）：受众 audience / 目的 purpose / 页数 length / 语言 language / 叙事 narrative / 证据 evidence / 信息密度 density / 核心结论 key-takeaway。如果你觉得这些 Step 1 的答案和内容不匹配，可以在问题的措辞里隐式提醒，但不要直接再问。`;
const BLACKLIST_LINE_EN =
  `Do NOT ask about any of these axes (already collected in Step 1 pills): audience / purpose / length / language / narrative / evidence / density / key-takeaway. If a Step 1 answer seems mismatched with the content, hint at it implicitly in the wording — do not re-ask.`;

function buildPrompt(locale: Locale, density: QuestionDensity): string {
  const range = density === 'full' ? '5-8' : '2-4';

  if (locale === 'en') {
    return `You are Lasca AI's content advisor. The user has already picked the templated axes in Step 1 pills. Your job is to ask CONTENT-SPECIFIC questions — things only someone who read this particular draft could ask.

## Task

Generate ${range} questions. Quality over quantity — don't pad. Each must be grounded in specific words/numbers/concepts from the user's input (a metric name, a city, a time range, a competitor, a methodology, a data source, etc.).

## Dimensions to probe

- content focus (which aspects to emphasize — often multi-select)
- domain-specific metric or methodology (e.g. "which rent-to-price ratio definition")
- scope / coverage (e.g. "how many cities", "which time range")
- visualization preference (chart type, map style, table vs text) — when content has data
- data source handling (cite / paraphrase / omit) — when content has external data
- tweaks / adjustments the user might want later (multi-select)
- 2-3 ad-hoc axes extracted from the content

## Hard rules

- ${BLACKLIST_LINE_EN}
- DO NOT ask about style / color / fonts / theme (handled by StylePicker).
- Every question MUST include a \`recommendedValue\` field — your best guess answer after reading the content. For multiSelect questions it's an array.
- Every question MUST end with a "Let AI decide" escape hatch option: \`{ "label": "Let AI decide", "value": "${DECIDE_FOR_YOU_VALUE}", "isDecideForYou": true }\`.
- Every option needs an \`implication\` field starting with "->" describing how AI will act on that choice.
- Open-ended or domain-specific axes (metric definitions, source cities, methodology) should set \`"allowCustom": true\` so users can type a value.
- Non-exclusive axes (content focus, tweaks) should set \`"multiSelect": true\`.
- Options: 2-7 per question, plus the auto-injected "Let AI decide".
- Provide an optional \`hint\` subtitle under the question when it helps the user understand what the axis will affect (e.g. "Affects chart selection and data density").

## Return format

\`\`\`json
{
  "questions": [
    {
      "id": "short-slug",
      "header": "Short label",
      "question": "Full question, referencing something concrete from the content",
      "hint": "Optional subtitle explaining what this controls",
      "multiSelect": false,
      "allowCustom": false,
      "recommendedValue": "value-of-best-guess-option",
      "options": [
        { "label": "Option A", "value": "a", "hint": "Short clarifier", "implication": "-> AI will focus on A" },
        { "label": "Option B", "value": "b", "implication": "-> AI will focus on B" }
      ]
    }
  ]
}
\`\`\`

Write the strings in natural, concise English.`;
  }

  return `你是 Lasca AI 的"内容顾问"。用户已经在第一步通过 pill 行选过模板化的轴。你只问**内容特定**的问题 —— 只有读过这份稿子的人才能问得出的那种。

## 任务

生成 ${range} 个问题。宁可少、宁可精，不要凑数。每题必须引用内容里具体的字词或概念（指标名、城市名、时间段、公司名、方法论、数据来源等）。

## 可问方向

- 内容重点 / 取舍（通常多选）
- 领域特定口径 / 方法论（例 "用哪种租售比口径"）
- 覆盖范围 / 数量（例 "覆盖几个城市" / "哪个时段"）
- 可视化偏好（图表类型、地图呈现、表 vs 文字）—— 内容涉及数据时
- 数据来源处理（引用 / 转述 / 省略）—— 内容涉及外部数据时
- 后续可调项 / Tweaks（多选）
- 2-3 个从内容里抽取的 ad-hoc 轴

## 硬规则

- ${BLACKLIST_LINE_ZH}
- 不要问配色 / 字体 / 主题样式（StylePicker 负责）。
- 每题都必须有 \`recommendedValue\` —— 你读完内容后的最佳猜测。多选题里它是数组。
- 每题必须在末尾留一个"由你决定"兜底选项：\`{ "label": "由你决定", "value": "${DECIDE_FOR_YOU_VALUE}", "isDecideForYou": true }\`。
- 每个选项必须有 \`implication\` 字段（以 "→" 开头），描述选此项 AI 会如何处理。
- 开放或领域特定的轴（口径定义、数据来源、城市清单）设 \`"allowCustom": true\`，让用户可以自己填。
- 非互斥的轴（内容重点、Tweaks）设 \`"multiSelect": true\`。
- 每题 2-7 个选项（加上自动注入的"由你决定"）。
- 可选的 \`hint\` 作为问题下方小字副标题，解释这个轴会影响什么（例 "影响图表选型和数据密度"）。

## 返回格式

\`\`\`json
{
  "questions": [
    {
      "id": "短 slug",
      "header": "短标签（2-4字）",
      "question": "完整问句，引用内容里的具体字词",
      "hint": "（可选）小字副标题",
      "multiSelect": false,
      "allowCustom": false,
      "recommendedValue": "最推荐选项的 value",
      "options": [
        { "label": "选项 A", "value": "a", "hint": "补充说明", "implication": "→ AI 会侧重 A" },
        { "label": "选项 B", "value": "b", "implication": "→ AI 会侧重 B" }
      ]
    }
  ]
}
\`\`\`

问题用中文，简洁自然。`;
}

// ── Main handler ──────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 64 * 1024); // 64KB — full-content pastes can be long
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'clarify', 5);
  if (rateLimited) return rateLimited;

  const body = await request.json() as {
    rawInput: string;
    existingAnswers?: ClarifierAnswers;
    workflow?: string;
    mode?: Mode;
    format: 'slide' | 'report';
    locale?: Locale;
  };
  const locale: Locale = body.locale ?? DEFAULT_LOCALE;
  const mode: Mode = body.mode ?? 'topic';

  logger.info('ai', 'AI clarify 请求', {
    inputLen: body.rawInput?.length,
    format: body.format,
    mode,
  });

  if (!body.rawInput || body.rawInput.length < 3) {
    return NextResponse.json({ questions: [], needsPlanReview: true, structureHint: 'topic' });
  }

  const auth = verifyToken(request);
  if (process.env.POSTGRES_URL && auth?.userId) {
    const user = await getUserById(auth.userId);
    if (!user || user.status === 'banned') {
      return NextResponse.json({ error: '账号已被限制' }, { status: 403 });
    }
    await touchLastActive(user.id);
    const quota = await checkAndIncrementAiCalls(user.id);
    if (!quota.allowed) {
      return NextResponse.json({
        error: 'AI 调用次数已达今日上限',
        remaining: 0,
        resetAt: quota.resetAt,
      }, { status: 429 });
    }
    await logEvent(user.id, null, 'ai_clarify', {
      mode,
      format: body.format,
      inputLen: body.rawInput.length,
    });
  }

  // Decide question density + plan routing based on structure.
  // topic → full Q&A, full plan review.
  // full-content unstructured → full Q&A, full plan review (e.g. report→slides).
  // full-content structured → compact Q&A, skip plan review (user already sliced).
  let density: QuestionDensity = 'full';
  let needsPlanReview = true;
  let structureHint: 'structured' | 'unstructured' | 'topic' = 'topic';

  if (mode === 'full-content') {
    const inferred = inferSlideStructure(body.rawInput);
    if (inferred.structured) {
      density = 'compact';
      needsPlanReview = false;
      structureHint = 'structured';
    } else {
      structureHint = 'unstructured';
    }
  }

  // Readable summary of Step 1 answers — tells the LLM what NOT to re-ask.
  const existingAnswers = body.existingAnswers || {};
  const prefLines = Object.entries(existingAnswers)
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('\n');

  // Window the raw input.  4000 chars is enough for the LLM to sample theme
  // and terminology even on a 30k-char report — more wastes prompt tokens
  // and triggers cache misses.
  const SAMPLE_WINDOW = 4000;
  const rawSample = body.rawInput.slice(0, SAMPLE_WINDOW);
  const truncated = body.rawInput.length > SAMPLE_WINDOW;

  try {
    const system = buildPrompt(locale, density);
    const userMsg = locale === 'en'
      ? `## User content (mode: ${mode}${truncated ? ', first 4k chars' : ''})

${rawSample}

## Step 1 answers (already collected — DO NOT re-ask)

${prefLines || '(none)'}

## Format

${body.format === 'report' ? 'Report' : 'Presentation'}

Now generate the content-specific questions per the rules above.`
      : `## 用户内容（模式：${mode}${truncated ? '，截取前 4000 字' : ''}）

${rawSample}

## Step 1 已选（已收集 —— 不要再问）

${prefLines || '（无）'}

## 文稿类型

${body.format === 'report' ? '报告' : '演示文稿'}

按上面的规则生成内容特定问题。`;

    const result = await callLLM({
      model: getModel(),
      system,
      messages: [{ role: 'user', content: userMsg }],
    });

    const text = result.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('ai', 'clarify: no JSON found in response', { text: text.slice(0, 200) });
      return NextResponse.json({ questions: [], needsPlanReview, structureHint });
    }

    let parsed: { questions: ClarifierQuestion[] };
    try {
      parsed = JSON.parse(jsonMatch[0]) as { questions: ClarifierQuestion[] };
    } catch (e) {
      logger.warn('ai', 'clarify: JSON parse failed', { err: (e as Error).message });
      return NextResponse.json({ questions: [], needsPlanReview, structureHint });
    }

    const validQuestions = postProcessQuestions(parsed.questions || [], locale, density);

    if (validQuestions.length === 0) {
      logger.warn('ai', 'clarify: LLM returned 0 valid questions', { inputLen: body.rawInput.length, mode });
    }

    return NextResponse.json({
      questions: validQuestions,
      needsPlanReview,
      structureHint,
    });
  } catch (err) {
    logger.error('ai', 'AI clarify failed', { error: (err as Error).message });
    // Non-critical — return empty so the flow continues with Step 1 answers only.
    return NextResponse.json({ questions: [], needsPlanReview, structureHint });
  }
}

// ── Validation / normalization ───────────────────────────────────────

/** Everything the LLM returns needs a defensive pass:
 *  1. Drop questions that touch Step 1 axes (blacklist enforcement).
 *  2. Drop malformed shapes (missing id / header / question / <2 options).
 *  3. Clamp option count to 7 + auto-append "let AI decide" sentinel.
 *  4. Clamp question count to 8 (5-8 target; anything above is likely padding).
 *  5. Normalize `id` with ai- prefix so it can't collide with Step 1 ids.
 */
function postProcessQuestions(
  raw: ClarifierQuestion[],
  locale: Locale,
  density: QuestionDensity,
): ClarifierQuestion[] {
  const deferLabel = locale === 'en' ? 'Let AI decide' : '由你决定';
  const cap = density === 'full' ? 8 : 4;

  const blacklistSubstrings: Record<string, readonly string[]> = {
    en: ['audience', 'length', 'pages', 'how many pages', 'language', 'narrative', 'story arc', 'evidence', 'density', 'purpose', 'key takeaway', 'takeaway'],
    zh: ['受众', '听众', '目标用户', '页数', '几页', '多少页', '语言', '叙事', '证据', '信息密度', '密度', '目的', '核心结论', '核心信息'],
  };
  const bannedHeaderSubs = blacklistSubstrings[locale === 'en' ? 'en' : 'zh'];

  const isStep1Axis = (q: ClarifierQuestion): boolean => {
    const idLc = (q.id ?? '').toLowerCase().replace(/^ai-/, '');
    if ((STEP1_AXES as readonly string[]).includes(idLc)) return true;
    const haystack = `${q.header ?? ''} ${q.question ?? ''}`.toLowerCase();
    return bannedHeaderSubs.some(sub => haystack.includes(sub));
  };

  const processed: ClarifierQuestion[] = [];
  for (const q of raw) {
    if (!q || !q.id || !q.header || !q.question) continue;
    if (!Array.isArray(q.options) || q.options.length < 2) continue;
    if (isStep1Axis(q)) {
      logger.warn('ai', 'clarify: dropping Step 1 axis from LLM response', { id: q.id, header: q.header });
      continue;
    }

    // Clamp options, then ensure a "let AI decide" option exists.
    let options = q.options.slice(0, 7) as ClarifierOption[];
    // Drop duplicate defer options the LLM might have generated.
    options = options.filter(o => !o.isDecideForYou && o.value !== DECIDE_FOR_YOU_VALUE);
    options.push({
      label: deferLabel,
      value: DECIDE_FOR_YOU_VALUE,
      isDecideForYou: true,
    });

    processed.push({
      ...q,
      id: q.id.startsWith('ai-') ? q.id : `ai-${q.id}`,
      options,
    });
  }

  return processed.slice(0, cap);
}
