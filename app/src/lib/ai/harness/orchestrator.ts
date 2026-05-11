// ============================================================================
// Lasca AI Harness — Orchestrator
// ============================================================================
// 这是 Lasca 智能体架构的"总指挥"。它不写文案、不调色、不挑布局——它只做四件事：
//   1. 理解意图（workflow + 用户输入）
//   2. 问 clarifier 要不要提问
//   3. 生成一个用户可见的 plan
//   4. 派活给内部的 generateDeck（现有 pipeline）+ 硬约束闸门 + 修复循环
//
// 和现有 pipeline.ts 的关系：
//   - pipeline.ts = 基础生成引擎（outline → parallel generate → visual recheck）
//   - orchestrator.ts = 包在外面的约束/校验/修复层
//   - 现有 /api/ai/generate 可以渐进迁移到这里
// ============================================================================

import { callLLM, getModel, getCacheOpts } from '../model';
import type { Slide, Layout, Theme, ClosingData, CoverData } from '../../types';
import { THEMES } from '../../themes';
import { generateDeck, type PipelineEvent, type OutlineItem } from '../pipeline';
import type { ContentSignals } from './contentAnalysis';
import type { MdContextPage } from './types';
import { slideSystemPrompt } from '../prompts';
import { validateDeck } from './goldenRules';
import { maybeAdaptToCardCanvas } from '../../cards/adapt';
import { getPreset, DEFAULT_PRESET_ID, derivePreset } from './stylePresets';
import { runClarifier, extractFromAnswers, AUTO_SENTINEL } from './clarifier';
import { buildMdContext, buildPlanOutline } from './mdContext';
import { detectLayoutMismatch } from './layoutRules';
import { buildPreferencesBlock } from './selectorRules';
import { selectSkills, invokeSkills } from './skills';
import type {
  HarnessEvent,
  HarnessPlan,
  MdContext,
  OrchestratorInput,
  StylePreset,
  StylePresetId,
} from './types';

const MAX_FIX_ROUNDS = 2;

// Layouts that satisfy the closing-slot contract. 'closing' is the primary
// target; 'quote' is accepted as legacy since older decks and a few presets
// still use it intentionally. Anything else on the final slide gets coerced.
const CLOSING_OK: ReadonlySet<Layout> = new Set(['closing', 'quote']);

/**
 * Coerce a final-slot slide to the 'closing' layout when it isn't already an
 * accepted closing shape. Rescues title/subtitle/signature/role from the
 * incoming data, drops incompatible fields (number, bullets, stats, charts…),
 * and synthesizes a locale-appropriate "Thank You" title when the incoming
 * title looks like body copy rather than a sign-off.
 */
function enforceClosingSlide(slide: Slide, locale?: string): Slide {
  if (CLOSING_OK.has(slide.layout)) return slide;
  const isEn = locale === 'en';
  const src = slide.data as Record<string, unknown>;
  const pick = (k: string): string | undefined => {
    const v = src[k];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  const rawTitle = pick('title');
  // A good closing title is short; long narrative strings are body copy from
  // a wrongly-picked content layout — replace with a canonical sign-off.
  const title = rawTitle && rawTitle.length <= 40
    ? rawTitle
    : (isEn ? 'Thank You' : '感谢聆听');
  const data: ClosingData = { title };
  const subtitle = pick('subtitle');
  if (subtitle) data.subtitle = subtitle;
  const signature = pick('signature') ?? pick('author') ?? pick('team');
  if (signature) data.signature = signature;
  const role = pick('role') ?? pick('audience');
  if (role) data.role = role;
  console.warn(`[closing-enforce] layout '${slide.layout}' → 'closing' on final slide (title: "${title}")`);
  return { ...slide, layout: 'closing', data };
}

// ============================================================================
// 主入口
// ============================================================================

/**
 * 运行一次完整 workflow。返回 AsyncGenerator，事件流可直接被 API route 转成 SSE。
 *
 * 用法：
 *   for await (const event of runOrchestrator(input)) {
 *     yieldToClient(event);
 *   }
 */
export async function* runOrchestrator(
  input: OrchestratorInput,
): AsyncGenerator<HarnessEvent> {
  try {
    // ----- 0. Extract clarifier answers early (needed by both md-context and downstream) -----
    const earlyAnswers = extractFromAnswers(input.clarifierAnswers ?? {});

    // ----- 0b. Two-stage content pipeline -----
    // Stage A: Plan outline (lightweight structure)
    //   - 第一轮调用（无 planOverride 和 mdContextOverride）→ buildPlanOutline → emit plan-outline → return
    //   - 用户审阅、修改 plan、点"就这么做"
    // Stage B: Full md-context (based on approved plan)
    //   - 第二轮调用（有 planOverride）→ buildMdContext with plan constraint → emit md-context-preview → return
    //   - 或直接 mdContextOverride 跳过两阶段
    let mdContext: MdContext;
    if (input.mdContextOverride) {
      // Fast path: already have approved mdContext (e.g., from outline editing)
      mdContext = input.mdContextOverride;
    } else if (input.planOverride) {
      // Stage B: User approved a plan → generate full mdContext constrained by plan
      const planConstraint = input.planOverride.pages
        .map((p, i) => `${i + 1}. [${p.pageType}] ${p.title} — ${p.direction}`)
        .join('\n');

      // Total page count from plan (including cover and end)
      const totalPageCount = input.planOverride.pages.length;

      // Put plan constraint first (hard constraint), rawInput as background material
      const isPlanEn = input.locale === 'en';
      const userMsg = isPlanEn
        ? `🚨 Hard constraint: you must strictly follow this page structure — title, pageType, and direction for each page are fixed:

${planConstraint}

Background material (use only to fill each page's detail; do not change the structure above):
${input.rawInput}`
        : `🚨 硬约束：必须严格按照以下页面结构生成内容，每页的标题、pageType 和方向不可更改：

${planConstraint}

以下是背景材料（仅用于填充每页的详细内容，不能改变上面的结构）：
${input.rawInput}`;

      mdContext = await buildMdContext(
        userMsg,
        {
          defaultPageCount: totalPageCount,
          audience: earlyAnswers.audience,
          density: earlyAnswers.density,
          dataEmphasis: earlyAnswers.dataEmphasis,
          keyTakeaway: earlyAnswers.keyTakeaway,
          purpose: earlyAnswers.purpose,
          narrative: earlyAnswers.narrative,
          evidence: earlyAnswers.evidence,
          locale: input.locale,
          freeFormHints: earlyAnswers.freeFormHints,
          polishMode: input.polishMode,
        },
      );

      // Emit md-context preview so cards step can display them
      yield { type: 'md-context-preview', data: { mdContext } };
      return;
    } else {
      // Stage A: Generate lightweight plan outline (or direct mdContext for full-content mode)

      // Pair Step 2 LLM-generated questions with their answers for the
      // outline LLM. Without this, answers are still surfaced via
      // freeFormHints (preference text) but the LLM only sees the answer
      // string with no original question context — hurts outline quality
      // when answers are short/cryptic ("yes", "Q4-2026", "ARR").
      const aiQA: Array<{ question: string; answer: string }> = [];
      const rawAnswers = input.clarifierAnswers ?? {};
      for (const q of input.aiQuestions ?? []) {
        const ans = rawAnswers[q.id];
        if (ans === undefined || ans === null) continue;
        if (ans === AUTO_SENTINEL) continue;
        if (Array.isArray(ans) && ans.length > 0 && ans.every(x => x === AUTO_SENTINEL)) continue;
        const ansStr = Array.isArray(ans) ? ans.join(', ') : String(ans);
        if (!ansStr.trim()) continue;
        aiQA.push({ question: q.question, answer: ansStr.trim() });
      }

      const buildOpts: {
        defaultPageCount?: number;
        pageCountRange?: { min: number; max: number; suggested: number };
        audience?: string;
        density?: string;
        dataEmphasis?: string;
        keyTakeaway?: string;
        purpose?: string;
        narrative?: string;
        evidence?: string;
        locale?: typeof input.locale;
        freeFormHints?: Record<string, string>;
        polishMode?: boolean;
        aiQA?: Array<{ question: string; answer: string }>;
      } = {
        defaultPageCount: input.pageCount,
        audience: earlyAnswers.audience,
        density: earlyAnswers.density,
        dataEmphasis: earlyAnswers.dataEmphasis,
        keyTakeaway: earlyAnswers.keyTakeaway,
        purpose: earlyAnswers.purpose,
        narrative: earlyAnswers.narrative,
        evidence: earlyAnswers.evidence,
        locale: input.locale,
        freeFormHints: earlyAnswers.freeFormHints,
        polishMode: input.polishMode,
        aiQA: aiQA.length > 0 ? aiQA : undefined,
      };

      // Full-content mode: check if content is already well-structured
      if (input.skipPlanIfStructured) {
        const trimmed = input.rawInput.trim();
        const charCount = trimmed.length;
        const lineCount = trimmed.split('\n').filter(l => l.trim()).length;

        // Too short for full-content mode → tell frontend to redirect
        if (charCount < 200 || lineCount < 5) {
          yield { type: 'content-too-short', data: { rawInput: input.rawInput } };
          return;
        }

        // Structure inference: tells us (a) whether to skip plan-outline and
        // (b) what page count to anchor downstream generation on.
        //
        // Two modes:
        //   - User gave explicit length (Short/Medium/Long picker) → defaultPageCount
        //     is a HARD constraint (LLM must match ± tolerance, else retry).
        //   - User left Auto → heuristic result becomes a SOFT suggestion. LLM reads
        //     the source and decides its own page count within a range; we only trim
        //     if it falls outside [min, max]. This is the "LLM decides" path —
        //     previously the heuristic was forced on the LLM as an exact number,
        //     which is why long reports always came out at the heuristic's cap.
        const hints = inferSlideStructure(trimmed);
        const userGaveExplicitLength = typeof buildOpts.defaultPageCount === 'number';
        if (!userGaveExplicitLength) {
          // Auto mode: let the LLM decide. Heuristic becomes soft range passed
          // into the prompt via pageCountRange; defaultPageCount stays undefined
          // so mdContext.ts does NOT emit a hard-constraint line.
          const suggested = hints.suggestedPageCount;
          buildOpts.pageCountRange = {
            min: Math.max(5, Math.floor(suggested * 0.7)),
            max: Math.min(40, Math.ceil(suggested * 1.5)),
            suggested,
          };
        }

        if (hints.structured) {
          const directMdContext = await buildMdContext(input.rawInput, buildOpts);
          yield { type: 'md-context-preview', data: { mdContext: directMdContext } };
          return;
        }
        // Not structured → fall through to plan outline below (now with page count)
      }

      let plan;
      try {
        plan = await buildPlanOutline(input.rawInput, buildOpts);
      } catch (err) {
        const detail = (err as Error).message;
        const isEn = input.locale === 'en';
        const message = isEn
          ? `AI couldn't generate an outline from your input. Please try again. (${detail})`
          : `AI 没能基于你的输入生成大纲，请重试。（${detail}）`;
        yield { type: 'error', data: { message, fatal: true } };
        return;
      }
      yield { type: 'plan-outline', data: { plan } };
      return; // Wait for user to approve the plan
    }

    // ----- 1. Clarifier (读 frontmatter + demands 跳过已答问题) -----
    if (!input.skipClarifier) {
      const decision = runClarifier({
        workflow: input.workflow,
        rawInput: input.rawInput,
        hasExistingDeck: false, // TODO: 让前端传
        existingAnswers: mergeAnswersWithMdContext(input.clarifierAnswers, mdContext),
        presetId: input.presetId ?? mdContext.demands.preset,
        locale: input.locale,
      });

      if (decision.action === 'ask') {
        yield { type: 'clarify-needed', questions: decision.questions };
        return; // 等前端把答案回填后再次调用
      }
    }

    // ----- 2. 解析答案 → 决策参数 (frontmatter/demands 优先, clarifier 答案 fallback) -----
    const answers = input.clarifierAnswers ?? {};
    const fromAnswers = earlyAnswers; // already extracted in step 0

    const presetId = (
      input.presetId
      ?? mdContext.demands.preset
      ?? fromAnswers.presetId
      ?? DEFAULT_PRESET_ID
    ) as StylePresetId;
    const preset = getPreset(presetId);
    const theme: Theme = input.theme ?? preset.theme;
    // Page count priority: explicit input > approved outline > frontmatter > regex > clarifier answer > default
    const rawPageCountMatch = input.rawInput.match(/(\d+)\s*页/);
    const rawPageCount = rawPageCountMatch ? parseInt(rawPageCountMatch[1], 10) : undefined;
    const pageCount = input.pageCount
      || mdContext.pages.length
      || mdContext.frontmatter.pageCount
      || fromAnswers.length
      || rawPageCount
      || 5;

    // ----- 3. 生成 plan 给用户看 -----
    const plan: HarnessPlan = buildPlan({
      workflow: input.workflow,
      preset,
      pageCount,
      audience: fromAnswers.audience,
      locale: input.locale,
    });
    yield { type: 'plan', plan };

    // ----- 4. 只处理 generate-from-draft（Milestone 1 范围） -----
    if (input.workflow !== 'generate-from-draft') {
      yield {
        type: 'error',
        data: {
          message: `Workflow "${input.workflow}" 还没实现，Milestone 1 只支持 generate-from-draft`,
          fatal: true,
        },
      };
      return;
    }

    // ----- 5. 调内部 pipeline 生成 deck -----
    // 如果所有 corePoint 都是实际内容 → 用 prebuiltOutline 跳过 generateOutline，
    //   preset 风格通过 systemPromptSuffix 注入每一页的 generateSlide 调用
    // 如果有 [TODO:] 占位 → 用 canonicalMd 作为 prompt 让 LLM 填 outline
    //
    // v2.4: When format='report', the slide-shaped mdContextToOutline /
    // buildInnerPrompt helpers don't apply (they hardcode slide layouts like
    // cover/quote/three-cards and inject slide preferredLayouts). Always
    // route reports through the generateOutline path — the report-aware
    // prompt will pick from report-* layouts based on REPORT_CONSTRAINTS.
    const format = input.format ?? 'slide';
    const isReport = format === 'report';
    // `slides` carries adapted card-canvas slides — what the frontend renders
    // and what the final deck stores. `rawSlides` holds the pre-adapter legacy
    // forms that pipeline.ts streams alongside each `slide` event, so
    // goldenRules/layoutRules (which branch on `slide.layout === 'bento'` etc.)
    // can keep working without every rule hitting `card-canvas` and silently
    // no-oping. The two arrays stay in lockstep; fixes rewrite both.
    const slides: Slide[] = [];
    const rawSlides: Slide[] = [];
    const pageCompositions = mdContext.demands.pageCompositions ?? {};
    const hasPages = mdContext.pages.length > 0;
    const audienceForPrompt = mdContext.frontmatter.audience ?? fromAnswers.audience;
    // prebuiltOutline: use mdContext pages directly when available
    // Trust that user has reviewed and approved the cards
    const prebuiltOutline = isReport || !hasPages
      ? undefined
      : mdContextToOutline(mdContext, preset, fromAnswers.density as Density | undefined);
    // promptForOutline: only needed when we don't have prebuiltOutline
    // For reports: use canonicalMd
    // For slides without pages: build full prompt from rawInput
    // For slides with pages: empty string (prebuiltOutline handles it)
    const promptForOutline = isReport
      ? mdContext.canonicalMd
      : (!hasPages
        ? buildInnerPrompt(mdContext.canonicalMd || input.rawInput, preset, audienceForPrompt, fromAnswers.density, fromAnswers.dataEmphasis, fromAnswers.keyTakeaway, fromAnswers.freeFormHints, input.locale)
        : '');
    // Per-selector rules (density / audience / data / keyTakeaway) + any
    // free-form hints from extractFromAnswers. Deck-level static — same for
    // every slide call, so it fits the cached-prefix pattern. Pulled from
    // selectorRules.ts SSOT so adding a new option flows end-to-end.
    const prefsBlockForSuffix = buildPreferencesBlock({
      audience: audienceForPrompt,
      density: fromAnswers.density,
      dataEmphasis: fromAnswers.dataEmphasis,
      keyTakeaway: fromAnswers.keyTakeaway,
      purpose: fromAnswers.purpose,
      narrative: fromAnswers.narrative,
      evidence: fromAnswers.evidence,
    }, fromAnswers.freeFormHints, input.locale);

    // ----- Skill dispatch (Phase 0) -----
    // First real invocation of the skills registry. Today only brand-guidelines
    // adds non-empty content (when preset.knowledgeRef points at a vendored
    // design system). theme-factory dispatches but returns empty; frontend-design
    // is intentionally skipped to avoid duplicating prompts.ts::slideSystemPrompt.
    // canvas-design is a per-slide concern, wired in Phase 1.
    const activeSkills = selectSkills({
      intent: input.workflow,
      workflowType: input.workflow,
      preset,
      scope: 'deck',
      format,
    });
    const skillOut = await invokeSkills(
      activeSkills,
      { intent: input.workflow, context: mdContext, preset, workflowType: input.workflow, format },
      { locale: input.locale ?? 'zh' },
    );
    if (process.env.NODE_ENV === 'development' && process.env.LASCA_TRACE === '1') {
      // eslint-disable-next-line no-console
      console.log('[LASCA_TRACE]', JSON.stringify({
        stage: 'skill-dispatch',
        skills: activeSkills,
        perSkill: skillOut.perSkill,
        totalChars: skillOut.promptAppendix.length,
      }, null, 2));
    }
    const isEn = input.locale === 'en';
    const H_SKILL = isEn ? '## Skill instructions' : '## Skill 指引';
    const H_STYLE = isEn ? '## Style requirements (mandatory)' : '## 风格要求（必须遵守）';
    const H_PREFS = isEn ? '## User preferences (mandatory)' : '## 用户偏好（必须遵守）';
    const H_SCENE = isEn ? '## Scene rules (theme-level, must follow)' : '## 场景规则（theme-level, must follow）';
    const H_FAMILY = isEn ? '## Family rules (composer, must follow)' : '## Family 规则（composer 自动注入，必须遵守）';
    const H_THEME = isEn ? '## Theme guidance (brand-level, must follow)' : '## Theme 指引（brand-level, must follow）';
    const langGuard = isEn
      ? '\n\n> **Output language reminder:** The blocks above contain Chinese-language rule text (internal shorthand). Apply their meaning, but output **only in English** — never mirror Chinese keywords, titles, or taglines into slide content.'
      : '';

    const skillSuffix = skillOut.promptAppendix
      ? `\n\n${H_SKILL}\n${skillOut.promptAppendix}`
      : '';

    // Preset style suffix applies to slides. For reports:
    //  - bilingual-report has its own 870-line promptAppendix encoding the
    //    institutional-research visual system — inject as styleSuffix.
    //  - Other report presets (Phase 3+) go through the `report-structure`
    //    skill (see selectSkills above), which emits a block-based composition
    //    guide. Phase 3 replaced the silent `undefined` bypass with a
    //    deliberate gate.
    const styleSuffix = `${H_STYLE}\n${preset.promptAppendix}`;
    // Composer (Phase B): when the active theme carries a `family` field
    // (lookbook / private-banking / analysis), inject the family-level prompt
    // *additionally* alongside the legacy preset.promptAppendix. Family='base'
    // (or absent) contributes empty — no behavior change for legacy themes.
    const composed = derivePreset({ theme });
    const familySuffix = composed.promptAppendix
      ? `\n\n${H_FAMILY}\n${composed.promptAppendix}`
      : '';
    // Phase D step 15: theme-level prompt hints (brand voice / typography
    // rules formerly owned by the matching brand preset). Inject when the
    // active theme exposes them; dedup when preset.id === theme (the legacy
    // brand-default case where preset.promptAppendix already carries the
    // same content) so we don't double-prompt.
    const themeHints = THEMES[theme]?.promptHints;
    const themeHintsSuffix = (themeHints && preset.id !== theme)
      ? `\n\n${H_THEME}\n${themeHints}`
      : '';
    const prefsSuffix = prefsBlockForSuffix ? `\n\n${H_PREFS}\n${prefsBlockForSuffix}` : '';
    // Scene v2: the active theme may carry structured Do's & Don'ts
    // (ThemeConfig.rules) — inject them as a dedicated block so generation
    // respects scene conventions without bloating the preset promptAppendix.
    const themeRules = THEMES[theme]?.rules;
    const rulesSuffix = (themeRules && (themeRules.must?.length || themeRules.avoid?.length))
      ? `\n\n${H_SCENE}` +
        (themeRules.must?.length ? `\nMust:\n${themeRules.must.map(r => `- ${r}`).join('\n')}` : '') +
        (themeRules.avoid?.length ? `\nAvoid:\n${themeRules.avoid.map(r => `- ${r}`).join('\n')}` : '')
      : '';
    // Phase 3: report-structure skill output is already part of skillSuffix
    // (via invokeSkills merge). For reports, we use it instead of the preset
    // styleSuffix — unless the preset is bilingual-report, in which case the
    // preset owns the visual system and report-structure returned empty.
    const systemPromptSuffix = (isReport
      ? (preset.format === 'report'
          ? styleSuffix + prefsSuffix + rulesSuffix
          : skillSuffix + prefsSuffix + rulesSuffix)
      : styleSuffix + familySuffix + themeHintsSuffix + prefsSuffix + skillSuffix + rulesSuffix) + langGuard;

    // Report-channel presets (currently just bilingual-report) are single-column
    // by design — strip any callout the model emitted on report-section pages
    // so renderReportSection takes its single-column branch. Prompt also tells
    // the model not to emit it, but data-layer strip is the reliable enforcement.
    const stripBilingualCallout = (slide: Slide): Slide => {
      if (preset.format !== 'report') return slide;
      if (slide.layout !== 'report-section') return slide;
      const d = slide.data as { callout?: string };
      if (!d || !d.callout) return slide;
      const { callout: _drop, ...rest } = d;
      return { ...slide, data: rest as Slide['data'] };
    };

    for await (const pe of generateDeck(promptForOutline, pageCount, theme, {
      prebuiltOutline,
      systemPromptSuffix,
      format,
      locale: input.locale,
      demand: mdContext.demands,
    })) {
      // 把 PipelineEvent 透传为 HarnessEvent（类型名兼容）
      const translated = translatePipelineEvent(pe);
      if (translated) yield translated;

      // Accumulate slides from individual slide events (progressive).
      // `slide` is adapted (card-canvas) and drives progressive rendering;
      // `rawSlide` is the pre-adapter legacy form used only for validation.
      if (pe.type === 'slide') {
        const sd = pe.data as { index: number; slide: Slide; rawSlide?: Slide };
        let raw = sd.rawSlide ?? sd.slide;
        let adapted = sd.slide;
        // Family-aware coverVariant backstop. The lookbook / private-banking
        // family prompt tells the LLM to emit `data.coverVariant`, but the
        // model sometimes drops it. Without a variant `adapt.ts` falls back
        // to the legacy centered cover, which defeats the family signature.
        // Inject the family default and re-adapt so renderCover routes to
        // the correct lookbook-/pb- renderer.
        if (
          raw.layout === 'cover'
          && composed.cover !== 'default'
          && !(raw.data as CoverData)?.coverVariant
        ) {
          const patchedData: CoverData = { ...(raw.data as CoverData), coverVariant: composed.cover };
          raw = { ...raw, data: patchedData };
          adapted = maybeAdaptToCardCanvas(raw, pageCompositions[sd.index]);
        }
        slides[sd.index] = stripBilingualCallout(adapted);
        rawSlides[sd.index] = stripBilingualCallout(raw);
      }
      // Mirror rawSlide on recheck fixes so validation stays in sync, and
      // re-adapt the adapted copy so the final `done` reflects the fix too
      // (the original orchestrator flow dropped pipeline fixes because
      // progressive `slide` events never replayed after a `fixed` event).
      if (pe.type === 'fixed') {
        const fd = pe.data as { page: number; issues?: string[]; rawSlide?: Slide };
        if (fd.rawSlide && typeof fd.page === 'number') {
          const idx = fd.page - 1;
          const raw = stripBilingualCallout(fd.rawSlide);
          rawSlides[idx] = raw;
          slides[idx] = maybeAdaptToCardCanvas(raw, pageCompositions[idx]);
        }
      }
      // Fallback: fill any gaps from the done event (backward compat).
      // Pipeline's done carries adapted slides; use them to seed both arrays
      // so validateDeck doesn't crash on an undefined slot. Gap-fills don't
      // preserve legacy layout information — acceptable tradeoff for a path
      // that should never actually fire when progressive events succeed.
      if (pe.type === 'done') {
        const data = pe.data as { slides: Slide[] };
        data.slides.forEach((s, i) => {
          if (!slides[i]) slides[i] = stripBilingualCallout(s);
          if (!rawSlides[i]) rawSlides[i] = stripBilingualCallout(s);
        });
      }
    }

    if (slides.length === 0) {
      yield { type: 'error', data: { message: '生成没有产出任何 slide', fatal: true } };
      return;
    }

    // Hard guard: the last slide must be a closing slot. LLM2 / preset /
    // md-cards approval can all override inferLayout's 'closing' suggestion,
    // so we coerce here after generation but before validation. See
    // lasca-layout-magical-pancake plan §A3 — without this guard a
    // bilingual-report run produced a section-break rendering big "01" +
    // team byline as the "Thank You" page.
    if (!isReport) {
      const lastIdx = slides.length - 1;
      const coerced = enforceClosingSlide(rawSlides[lastIdx], input.locale);
      if (coerced !== rawSlides[lastIdx]) {
        rawSlides[lastIdx] = coerced;
        slides[lastIdx] = maybeAdaptToCardCanvas(coerced, pageCompositions[lastIdx]);
      }
    }

    // ----- 6. 硬约束闸门 + 修复循环 -----
    // goldenRules/validateDeck + fixSlide are calibrated to slide layouts only
    // (preset.preferredLayouts, slide field semantics). For reports we skip
    // the gate and emit an empty pass-through report — the per-layout report
    // constraints in prompts.ts + the report renderers handle correctness.
    if (isReport) {
      yield { type: 'done', data: { slides, report: { pass: true, perPage: [], violations: [] }, presetId } };
    } else {
      // Validate on pre-adapter legacy slides so goldenRules' per-layout
      // branches (`slide.layout === 'three-cards'` etc.) actually match.
      // The adapted card-canvas copies in `slides` are only used as the
      // final output shape.
      let report = validateDeck(rawSlides, preset);
      yield { type: 'validating', data: { round: 0 } };
      yield { type: 'violations', data: { report } };

      for (let round = 1; round <= MAX_FIX_ROUNDS && !report.pass; round++) {
        const errorPages = report.perPage.filter(p => !p.pass).map(p => p.pageIndex);
        for (const pageIdx of errorPages) {
          const pageViolations = report.violations.filter(
            v => v.pageIndex === pageIdx && v.severity === 'error',
          );
          if (pageViolations.length === 0) continue;

          yield {
            type: 'fixing',
            data: {
              pageIndex: pageIdx,
              reason: pageViolations[0].message,
            },
          };

          const fixed = await fixSlide({
            slide: rawSlides[pageIdx],
            pageIndex: pageIdx,
            violations: pageViolations,
            theme,
            preset,
            originalOutlinePoint: mdContext.pages[pageIdx]?.corePoint,
            locale: input.locale,
          });

          if (fixed) {
            // Sanity check: does the fix introduce NEW errors?
            const tmpDeck = [...rawSlides];
            tmpDeck[pageIdx] = fixed;
            const quickCheck = validateDeck(tmpDeck, preset);
            const newErrors = quickCheck.violations.filter(
              v => v.pageIndex === pageIdx && v.severity === 'error',
            );
            if (newErrors.length <= pageViolations.length) {
              rawSlides[pageIdx] = fixed;
              slides[pageIdx] = maybeAdaptToCardCanvas(fixed, pageCompositions[pageIdx]);
              yield { type: 'fixed', data: { pageIndex: pageIdx } };
            } else {
              console.warn(`[orchestrator] Fix for page ${pageIdx + 1} made it worse (${newErrors.length} errors vs ${pageViolations.length}), keeping original`);
            }
          }
        }

        report = validateDeck(rawSlides, preset);
        yield { type: 'validating', data: { round } };
        yield { type: 'violations', data: { report } };
      }

      // ----- 7. 完成 -----
      yield { type: 'done', data: { slides, report, presetId } };
    }
  } catch (err) {
    yield {
      type: 'error',
      data: { message: (err as Error).message ?? String(err), fatal: true },
    };
  }
}

// ============================================================================
// 辅助：plan 生成
// ============================================================================

function buildPlan(opts: {
  workflow: OrchestratorInput['workflow'];
  preset: StylePreset;
  pageCount: number;
  audience?: string;
  locale?: 'zh' | 'en';
}): HarnessPlan {
  const { workflow, preset, pageCount, audience, locale = 'zh' } = opts;

  if (locale === 'en') {
    const audienceLabelEn = {
      boss: 'boss',
      'all-hands': 'all-hands',
      client: 'client',
      investor: 'investor',
    }[audience ?? ''] ?? 'audience';

    if (workflow === 'generate-from-draft') {
      return {
        workflow,
        summary: `Generate ${pageCount}-page ${preset.displayName.en} deck for ${audienceLabelEn}.`,
        steps: [
          `1. Draft outline (pick ${pageCount} core points)`,
          `2. Choose layout per page (${preset.preferredLayouts.slice(0, 3).join(' / ')}, etc.)`,
          `3. Fill content in parallel`,
          `4. Validate hard constraints (title length, card count, whitespace, consistency)`,
          `5. Auto-redo failing pages, show passing ones`,
        ],
        estimatedCostUsd: pageCount * 0.025,
        estimatedDurationSec: Math.max(15, pageCount * 4),
        preset: preset.id,
      };
    }

    return {
      workflow,
      summary: `${workflow} (${pageCount} pages)`,
      steps: ['Not yet implemented'],
      preset: preset.id,
    };
  }

  const audienceLabel = {
    boss: '老板',
    'all-hands': '全公司',
    client: '客户',
    investor: '投资人',
  }[audience ?? ''] ?? '读者';

  if (workflow === 'generate-from-draft') {
    return {
      workflow,
      summary: `生成 ${pageCount} 页 ${preset.displayName.zh} 风格的 deck，给 ${audienceLabel} 看。`,
      steps: [
        `1. 想大纲（挑 ${pageCount} 个核心观点）`,
        `2. 每页挑合适的布局（${preset.preferredLayouts.slice(0, 3).join(' / ')} 等）`,
        `3. 并行填充内容`,
        `4. 自检硬约束（标题长度、卡片数、留白、一致性）`,
        `5. 不合格的页自动重做，合格的直接给你看`,
      ],
      estimatedCostUsd: pageCount * 0.025,
      estimatedDurationSec: Math.max(15, pageCount * 4),
      preset: preset.id,
    };
  }

  return {
    workflow,
    summary: `${workflow}（${pageCount} 页）`,
    steps: ['暂未实现'],
    preset: preset.id,
  };
}

// ============================================================================
// 辅助：把 preset 注入到用户 prompt 里
// ============================================================================

function buildInnerPrompt(
  rawInput: string,
  preset: StylePreset,
  audience?: string,
  density?: string,
  dataEmphasis?: string,
  keyTakeaway?: string,
  freeFormHints?: Record<string, string>,
  locale?: 'zh' | 'en',
): string {
  // All per-selector rules + free-form notes come from the selectorRules.ts SSOT.
  // buildPreferencesBlock returns labels AND full prompt rules for each axis.
  const prefsBlock = buildPreferencesBlock({
    audience, density, dataEmphasis, keyTakeaway,
  }, freeFormHints, locale);

  const isEn = locale === 'en';
  const H_STYLE = isEn ? '## Style requirements (mandatory)' : '## 风格要求（必须遵守）';
  const H_LAYOUT = isEn ? '## Layout preferences' : '## 布局偏好';
  const L_PREFER = isEn ? 'Prefer:' : '优先用：';
  const L_AVOID = isEn ? 'Avoid:' : '尽量避免：';
  const H_PREFS = isEn ? '## User preferences' : '## 用户偏好';
  const prefsNote = prefsBlock ? `\n\n${H_PREFS}\n${prefsBlock}` : '';
  const langGuard = isEn
    ? '\n\n> **Output language reminder:** The rule blocks above contain Chinese-language shorthand. Apply their intent, but produce slide content **entirely in English** — do not emit Chinese keywords, titles, or taglines.'
    : '';

  return `${rawInput}

---
${H_STYLE}
${preset.promptAppendix}

${H_LAYOUT}
${L_PREFER}${preset.preferredLayouts.join(', ')}
${preset.avoidLayouts ? `${L_AVOID}${preset.avoidLayouts.join(', ')}` : ''}${prefsNote}${langGuard}`;
}

// ============================================================================
// 辅助：把 PipelineEvent 转成 HarnessEvent
// ============================================================================

function translatePipelineEvent(pe: PipelineEvent): HarnessEvent | null {
  switch (pe.type) {
    case 'outline':
      return { type: 'outline', data: pe.data };
    case 'generating':
      return {
        type: 'generating',
        data: pe.data as { from: number; to: number; total: number },
      };
    case 'rechecking':
      return {
        type: 'rechecking',
        data: pe.data as { round: number; pages: number[] },
      };
    case 'slide':
      return { type: 'slide', data: pe.data as { index: number; slide: Slide } };
    case 'fixed':
      return { type: 'fixed', data: pe.data as { pageIndex: number } };
    case 'cover-variations':
      return {
        type: 'cover-variations',
        data: pe.data as { original: Slide; alternates: Slide[] },
      };
    case 'error': {
      const ed = pe.data as {
        message: string;
        fatal?: boolean;
        kind?: 'recheck-fix-failed' | 'slide-generation-failed';
        page?: number;
        issues?: string[];
      };
      return {
        type: 'error',
        data: {
          message: ed.message,
          // Pass through pipeline's classification. Default false: pipeline-level
          // errors are page-scoped and recoverable; only the route's outer catch
          // (in api/ai/generate/route.ts) emits true-fatal events.
          fatal: ed.fatal ?? false,
          ...(ed.kind ? { kind: ed.kind } : {}),
          ...(ed.page !== undefined ? { page: ed.page } : {}),
          ...(ed.issues ? { issues: ed.issues } : {}),
        },
      };
    }
    case 'done':
      // done 由 orchestrator 自己在硬约束后发
      return null;
    default:
      return null;
  }
}

// ============================================================================
// 辅助：修复单页（调 LLM）
// ============================================================================

async function fixSlide(opts: {
  slide: Slide;
  pageIndex: number;
  violations: { ruleId: string; message: string; suggestedFix?: string }[];
  theme: Theme;
  preset: StylePreset;
  originalOutlinePoint?: string;
  locale?: 'zh' | 'en';
}): Promise<Slide | null> {
  const { slide, violations, theme, preset, originalOutlinePoint, locale } = opts;
  const isFixEn = locale === 'en';

  // --- Layout-change fix: R_LAYOUT_REPETITION requires a different layout ---
  const layoutViolation = violations.find(v => v.ruleId === 'R_LAYOUT_REPETITION');
  if (layoutViolation) {
    const suggestion = layoutViolation.suggestedFix || '';
    // Match both `建议: xxx` (zh) and `Suggested: xxx` (en) forms
    const altMatch = suggestion.match(/(?:建议|Suggested)[:：]\s*([\w-]+)/);
    const newLayout = (altMatch?.[1] || 'two-column') as Layout;
    const point = originalOutlinePoint || '';

    try {
      const layoutFixMsg = isFixEn
        ? `Layout: ${newLayout}\nCore point: ${point}\n\nGenerate the data JSON for this page. No layout field, no style field.`
        : `Layout: ${newLayout}\n核心观点: ${point}\n\n请生成该页的 data JSON。不要包含 layout 字段，不要包含 style 字段。`;
      const { text } = await callLLM({
        model: getModel(),
        system: slideSystemPrompt(theme, 'slide', locale),
        messages: [{ role: 'user', content: layoutFixMsg }],
        providerOptions: getCacheOpts(),
      });
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const newData = JSON.parse(cleaned);
      if (newData && typeof newData === 'object' && 'style' in newData) delete newData.style;
      return { layout: newLayout, data: newData } as Slide;
    } catch (err) {
      console.warn(`[orchestrator] layout-change fix failed for page ${opts.pageIndex + 1}:`, err);
      return null;
    }
  }

  // --- Data-only fix: all other violations ---
  const fixSuggestionLabel = isFixEn ? 'Fix suggestion' : '修复建议';
  const issuesText = violations
    .map(v => `- ${v.message}${v.suggestedFix ? `\n  ${fixSuggestionLabel}${isFixEn ? ': ' : '：'}${v.suggestedFix}` : ''}`)
    .join('\n');

  const prompt = isFixEn
    ? `Page: ${opts.pageIndex + 1}
Layout: ${slide.layout}
${originalOutlinePoint ? `Core point: ${originalOutlinePoint}` : ''}

Current data:
${JSON.stringify(slide.data, null, 2)}

Found these hard-constraint violations (must fix):
${issuesText}

## Style constraints
${preset.promptAppendix}

Output the corrected full data JSON (no layout field, no style field, no other text).`
    : `页码: ${opts.pageIndex + 1}
Layout: ${slide.layout}
${originalOutlinePoint ? `核心观点: ${originalOutlinePoint}` : ''}

当前 data:
${JSON.stringify(slide.data, null, 2)}

发现以下硬约束问题（必须修复）：
${issuesText}

## 风格约束
${preset.promptAppendix}

请输出修复后的完整 data JSON（不要 layout 字段，不要 style 字段，不要其他文字）。`;

  try {
    const { text } = await callLLM({
      model: getModel(),
      system: slideSystemPrompt(theme, 'slide', locale),
      messages: [{ role: 'user', content: prompt }],
      providerOptions: getCacheOpts(),
    });

    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const fixedData = JSON.parse(cleaned);
    if (fixedData && typeof fixedData === 'object' && 'style' in fixedData) delete fixedData.style;

    return { layout: slide.layout, data: fixedData } as Slide;
  } catch (err) {
    console.warn(`[orchestrator] fixSlide failed for page ${opts.pageIndex + 1}:`, err);
    return null;
  }
}

// ============================================================================
// 辅助：MdContext → pipeline 输入适配
// ============================================================================

// inferLayout 抽到了 ./inferLayout.ts (浏览器侧 MdContextCards 也要用)。
// 这里 re-export 让现有 import 路径不变。
import { inferLayout, filterLayoutsByDensity, type Density } from './inferLayout';
export { inferLayout };

/**
 * 把已批准的 MdContext 转成 pipeline 的 OutlineItem[]，跳过 generateOutline
 * 的 LLM 调用。只在所有 corePoint 都是真实内容（无 [TODO] 占位）时走这条路。
 *
 * Layout 选择顺序：
 *   1. mdContext.demands.pageLayouts[i]（用户**显式**写的 `> hint:`）
 *   2. inferLayout() 根据内容智能推断
 *
 * 注意：mdContext 本身不带 layout 字段（scope = 内容），所有 layout 推断都在这里发生。
 */
function mdContextToOutline(mdContext: MdContext, preset?: StylePreset, density?: Density): OutlineItem[] {
  const total = mdContext.pages.length;
  const demandedLayouts = mdContext.demands.pageLayouts ?? {};
  const usedRecently: Layout[] = [];

  // Density narrows the layout pool before preset preferences weigh in.
  // Precedence rule (per plan): candidate = preset.preferredLayouts ∩ density.
  // Empty intersection → density wins (content > style).
  const preferredAfterDensity = filterLayoutsByDensity(
    preset?.preferredLayouts ?? [],
    density,
  );

  return mdContext.pages.map((page, i) => {
    const approved = {
      title: sanitizeTitle(page.title),
      subtitle: page.subtitle,
      body: page.body,
      notes: page.notes,
      pageType: page.pageType,
    };

    let layout: Layout;
    let source: 'hint' | 'inferred';
    // User's explicit hint always wins
    if (demandedLayouts[i] !== undefined) {
      layout = demandedLayouts[i];
      source = 'hint';
    } else {
      layout = inferLayout(
        page, i, total,
        mdContext.contentSignals,
        preferredAfterDensity,
        preset?.avoidLayouts,
        usedRecently,
      );
      source = 'inferred';
    }

    usedRecently.push(layout);
    if (usedRecently.length > 2) usedRecently.shift();

    // Soft schema check: log when the chosen layout violates its content
    // contract (e.g. three-cards with 5 subpoints). Observation only — we
    // don't override, because LLM intent outranks the schema today. If this
    // warning fires frequently in production, revisit as a hard fallback.
    const mismatch = detectLayoutMismatch(page, layout, { isLast: i === total - 1 });
    if (mismatch) {
      console.warn(`[layout mismatch] page ${i + 1} (${source}): ${mismatch}`);
    }

    return {
      page: i + 1,
      layout,
      point: page.corePoint,
      subPoints: page.subPoints,
      evidence: page.evidence,
      ...approved,
    };
  });
}

/** Filter TODO placeholders and empty values so downstream generateSlide
 *  falls back to LLM-authored title rather than leaking a placeholder. */
function sanitizeTitle(t: string | undefined): string | undefined {
  if (!t) return undefined;
  const trimmed = t.trim();
  if (!trimmed) return undefined;
  if (/^\[?\s*todo\b/i.test(trimmed)) return undefined;
  if (/^〈.*〉$/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * clarifier 读 md-context 的 frontmatter + demands 跳过已答问题。把它们映射到
 * clarifier 的 answers 字段名（audience / preset / length）。
 */
function mergeAnswersWithMdContext(
  existing: OrchestratorInput['clarifierAnswers'] | undefined,
  mdContext: MdContext,
): OrchestratorInput['clarifierAnswers'] {
  const merged: Record<string, string | number | (string | number)[]> = { ...(existing ?? {}) };
  if (mdContext.frontmatter.audience && merged.audience === undefined) {
    merged.audience = mdContext.frontmatter.audience;
  }
  if (mdContext.demands.preset && merged.preset === undefined) {
    merged.preset = mdContext.demands.preset;
  }
  if (mdContext.frontmatter.pageCount !== undefined && merged.length === undefined) {
    merged.length = mdContext.frontmatter.pageCount;
  }
  return merged;
}

// ============================================================================
// 辅助：推断内容是否结构化 + 建议页数（纯正则，不调 LLM）
// ============================================================================

const COVER_KEYWORDS_RE = /(opening|intro(duction)?|welcome|overview|agenda|开场|简介|引言|概述|议程)/i;
const END_KEYWORDS_RE = /(closing|conclusion|thank|q\s*&\s*a|questions?|contact|wrap[\s-]?up|结尾|结束|总结|致谢|感谢|问答|联系)/i;

/**
 * Fast heuristic: is the content already organized per-slide, and if so how many pages?
 *
 * Returns `{ structured, suggestedPageCount }`.
 * - `structured: true` → orchestrator skips plan-outline and goes straight to md-context.
 * - `suggestedPageCount` is always returned so it can seed `defaultPageCount` for
 *   both the structured (direct md-context) and unstructured (plan-outline) branches.
 *
 * Structured patterns (any → structured):
 *   1. ≥3 headings with explicit slide/page markers ("## Slide 3", "## 第3页")
 *   2. ≥3 Chinese ordinal page markers ("第一页", "第二页…")
 *   3. ≥3 top-level H1 or H2 headings (trust markdown structure as a slicing signal;
 *      full-content mode means the user pre-sliced the content)
 *
 * Page count rules (checked in priority order):
 *   - Explicit slide markers ("## SLIDE 1" × N): N + 2. User numbered their slides
 *     as content; cover/end are extra slots so the architecture's forced cover+end
 *     structure (see mdContext.ts hard constraint) does not compress user content.
 *   - Heading structure only: N + (no cover-like first? +1) + (no end-like last? +1)
 *     — labelled sections like "OPENING"/"CLOSING" double as cover/end.
 *   - Unstructured (<3 headings): words/150 + 2, clamped to [5, 20]
 */
export function inferSlideStructure(content: string): {
  structured: boolean;
  suggestedPageCount: number;
  perSectionHint?: number[];
} {
  const lines = content.split('\n');

  const slideHeadingRe = /^#{1,3}\s*(slide|page|第\s*\d+\s*(页|张)|p\.\s*\d+)/i;
  const chinesePageRe = /^第[一二三四五六七八九十百\d]+[页张]\s*[：:．.、]?\s*\S/;
  const h1Re = /^#\s+(\S.*)$/;
  const h2Re = /^##\s+(\S.*)$/;

  let slideMarkers = 0;
  let chineseMarkers = 0;
  const h1Titles: string[] = [];
  const h2Titles: string[] = [];
  const h1LineIdx: number[] = [];
  const h2LineIdx: number[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx].trim();
    if (!l) continue;
    if (slideHeadingRe.test(l)) slideMarkers++;
    if (chinesePageRe.test(l)) chineseMarkers++;
    const h1m = l.match(h1Re);
    if (h1m && !/^#\s*#/.test(l)) {
      h1Titles.push(h1m[1]);
      h1LineIdx.push(idx);
    }
    const h2m = l.match(h2Re);
    if (h2m) {
      h2Titles.push(h2m[1]);
      h2LineIdx.push(idx);
    }
  }

  // Pick the heading level that best represents sections (whichever has more).
  const useH2 = h2Titles.length >= h1Titles.length;
  const sectionTitles = useH2 ? h2Titles : h1Titles;
  const sectionLineIdx = useH2 ? h2LineIdx : h1LineIdx;
  const sectionCount = sectionTitles.length;

  const patternMarkers = slideMarkers >= 3 || chineseMarkers >= 3;
  const patternHeadings = sectionCount >= 3;
  const structured = patternMarkers || patternHeadings;

  let suggestedPageCount: number;
  let perSectionHint: number[] | undefined;
  if (patternMarkers) {
    // Explicit "## SLIDE N" / "第N页" numbering = user declared "these N are my
    // content slides." The architecture forces every deck to have a cover + end
    // (see mdContext.ts hard constraint + applyPageCountTrim), so we pad +2 to
    // give cover/end their own slots — otherwise SLIDE 1 and SLIDE N get
    // compressed into cover/end roles and lose their body content.
    const base = Math.max(slideMarkers, chineseMarkers);
    suggestedPageCount = base + 2;
  } else if (patternHeadings) {
    // Content-weight estimate. 1 H2 ≠ 1 slide for long-form reports: a section
    // with 800 CJK chars should split across ~2 slides. We measure the block
    // between each heading and the next, then allocate pages via a ~300-char/
    // page rule of thumb (clamped to [1, 5] — dense data sections routinely
    // need 3-4 pages for a monthly report). Fixes the bug where a 30k-char
    // monthly report with 9 H2s collapsed into 11 slides at the 400-char /
    // 3-page cap.
    const CHARS_PER_PAGE = 300;
    const MAX_PAGES_PER_SECTION = 5;
    perSectionHint = [];
    for (let i = 0; i < sectionCount; i++) {
      const startLine = sectionLineIdx[i] + 1;
      const endLine = i + 1 < sectionCount ? sectionLineIdx[i + 1] : lines.length;
      const block = lines.slice(startLine, endLine).join('\n');
      const asciiWords = (block.match(/[A-Za-z0-9]+/g) ?? []).length;
      const cjkChars = (block.match(/[\u4e00-\u9fa5]/g) ?? []).length;
      const weight = asciiWords * 2 + cjkChars;
      const pages = Math.max(1, Math.min(MAX_PAGES_PER_SECTION, Math.round(weight / CHARS_PER_PAGE)));
      perSectionHint.push(pages);
    }
    const bodyPages = perSectionHint.reduce((a, b) => a + b, 0);
    const first = sectionTitles[0] ?? '';
    const last = sectionTitles[sectionCount - 1] ?? '';
    const hasCover = COVER_KEYWORDS_RE.test(first);
    const hasEnd = END_KEYWORDS_RE.test(last);
    suggestedPageCount = bodyPages + (hasCover ? 0 : 1) + (hasEnd ? 0 : 1);
  } else {
    // No structure signal — rough estimate by length
    const asciiWords = (content.match(/[A-Za-z0-9]+/g) ?? []).length;
    const cjkChars = (content.match(/[\u4e00-\u9fa5]/g) ?? []).length;
    const wordEquiv = asciiWords + Math.round(cjkChars / 2);
    suggestedPageCount = Math.round(wordEquiv / 150) + 2;
  }

  // Clamp to a reasonable slide range regardless of branch. Upper bound at 40
  // so long-form reports can claim enough slots without the old 20-cap
  // silently truncating the estimate.
  if (suggestedPageCount < 5) suggestedPageCount = 5;
  if (suggestedPageCount > 40) suggestedPageCount = 40;

  return { structured, suggestedPageCount, perSectionHint };
}

// Re-export for convenience
export type { HarnessEvent, HarnessPlan, RuleReport, OrchestratorInput } from './types';
