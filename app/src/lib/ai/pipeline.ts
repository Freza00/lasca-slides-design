// ============================================================================
// Lasca AI Pipeline — 编排器
// 大纲 → 并行生成 → 视觉 recheck → 修复
// ============================================================================

import { callLLM, getCacheOpts } from './model';
import { getModel } from './model';
import { outlineSystemPrompt, slideSystemPrompt, isHighRisk, slideSystemPrompt as fixSystemPrompt, designSystemPrompt, type GenerateFormat } from './prompts';
import { recheckSlides } from './recheck';
import { maybeAdaptToCardCanvas } from '../cards/adapt';
import { isLayout } from '../types';
import type { Slide, Theme, Layout } from '../types';
import type { Locale } from '../i18n';
import type { UserDemand, PageType } from './harness/types';
import type { ParsedMdDesign } from './mdDesign/types';
import { PROMPT_FRAGMENTS as ZH } from './prompts.zh';
import { PROMPT_FRAGMENTS as EN } from './prompts.en';

/** Select pipeline-specific fragment set by locale. */
function PF(locale: Locale = 'zh') { return locale === 'en' ? EN.pipeline : ZH.pipeline; }

export interface OutlineItem {
  page: number;
  layout: Layout;
  point: string;
  subPoints?: string[];
  evidence?: string[];
  // Optional user-approved fields from mdContext. When present, they bypass
  // LLM paraphrasing: title/subtitle/notes are written directly onto the Slide,
  // body/pageType feed the prompt as context only.
  title?: string;
  subtitle?: string;
  body?: string;
  notes?: string;
  pageType?: PageType;
}

/** Options for generateDeck. prebuiltOutline lets the caller bypass generateOutline entirely. */
export interface GenerateDeckOptions {
  /** If provided, generateDeck skips the LLM outline call and uses this directly. */
  prebuiltOutline?: OutlineItem[];
  /** Extra text appended to slideSystemPrompt for every per-slide generation call.
   *  Orchestrator uses this to inject StylePreset.promptAppendix so the prebuiltOutline
   *  path doesn't lose preset influence (in the generateOutline path the preset ends up
   *  in the outline generator's prompt instead). */
  systemPromptSuffix?: string;
  /** v2.4: 'slide' (default, 8 horizontal layouts) vs 'report' (4 vertical report-*
   *  layouts). The format selects which layout set the outline and per-slide prompts
   *  use, and — for reports — disables visual recheck (the recheck heuristic is
   *  calibrated to slide layouts only). */
  format?: GenerateFormat;

  // ---- mdDesign three-stage pipeline fields (2026-04-09) ----

  /** Structured content markdown from the refine step (your mdContext). When
   *  provided together with mdDesign, generateDeck skips both outline and
   *  design LLM calls — the design step was already done. */
  mdContext?: string;

  /** User's explicit visual/aesthetic overrides. Injected into the design
   *  prompt so demand fields override preset defaults unconditionally. */
  demand?: UserDemand;

  /** Pre-built mdDesign string (Slidev format). When provided, generateDeck
   *  parses it via parseMdDesign() → mdDesignToSlides() to derive the outline,
   *  then does parallel slide generation from those derived outline items.
   *  Skips both outline and design LLM calls. */
  mdDesign?: string;

  /** i18n: locale for AI prompt language. Defaults to 'zh'. */
  locale?: Locale;
}

export interface PipelineEvent {
  type: 'outline' | 'generating' | 'slide' | 'rechecking' | 'fixed' | 'done' | 'error' | 'cover-variations';
  data: unknown;
}

/** Parse JSON from LLM response, stripping markdown fences */
function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}


/** Step 1: Generate outline */
async function generateOutline(prompt: string, pageCount: number, format: GenerateFormat = 'slide', locale: Locale = 'zh'): Promise<OutlineItem[]> {
  const pf = PF(locale);
  const result = await callLLM({
    model: getModel(),
    system: outlineSystemPrompt(format, locale),
    messages: [{
      role: 'user',
      content: `${pf.topicLabel}: ${prompt}\n${pf.pageCountLabel}: ${pageCount}${pf.pageCountConstraint(pageCount)}\n\n${pf.generateOutlineRequest}`,
    }],
    providerOptions: getCacheOpts(),
  });
  return parseJSON<OutlineItem[]>(result.text);
}

// ============================================================================
// Design step: mdContext + demand → mdDesign (Slidev-format markdown)
// ============================================================================
// This replaces the outline LLM call when the three-stage pipeline is active.
// One LLM call (Sonnet), ~5k tokens in/out. The output is a full Slidev-format
// mdDesign document that parseMdDesign() can parse into per-slide front-matter
// + body. The design step decides layout/aesthetic/fonts/colors per slide;
// the generation step (Step 2) then fills in the exact Slide.data JSON.
// ============================================================================

export interface DesignStepResult {
  /** The raw mdDesign string (Slidev format), for storage/display/editing */
  raw: string;
  /** Parsed structure for immediate consumption */
  parsed: ParsedMdDesign;
  /** Derived outline items for feeding into parallel slide generation */
  outline: OutlineItem[];
}

/**
 * Run the design agent: takes mdContext + demand, produces mdDesign.
 *
 * Uses Sonnet 4 (same model as outline/slide gen) because the design step
 * requires aesthetic judgment that Haiku can't reliably do.
 */
export async function generateDesign(
  mdContext: string,
  demand?: UserDemand,
  presetId?: string,
  locale: Locale = 'zh',
): Promise<DesignStepResult> {
  const demandJson = demand ? JSON.stringify(demand, null, 2) : '(none — use preset defaults)';
  const presetStr = presetId || 'warm';

  const { text: raw } = await callLLM({
    model: getModel(),
    system: designSystemPrompt(locale),
    messages: [{
      role: 'user',
      content: `## mdContext\n\n${mdContext}\n\n## demand\n\n${demandJson}\n\n## preset\n\n${presetStr}`,
    }],
    providerOptions: getCacheOpts(),
  });

  // Parse the mdDesign output
  const { parseMdDesign } = await import('./mdDesign/parser');
  const parsed = parseMdDesign(raw);

  // Derive outline items from the parsed slides (for the parallel generation step)
  const outline: OutlineItem[] = parsed.slides.map((s, i) => ({
    page: i + 1,
    layout: s.frontMatter.layout,
    point: s.body.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim()
      || s.frontMatter.title as string
      || `Slide ${i + 1}`,
  }));

  return { raw, parsed, outline };
}

/**
 * B4 — Pick up to 2 alternate layouts for a cover variation fork. We prefer
 * visually distinct covers (big-number for quantitative decks, image/split-image
 * for hero-style, title-body for editorial). The original layout is always
 * excluded; caller is responsible for tracking it.
 */
function pickCoverAltLayouts(original: Layout): Layout[] {
  const pool: Layout[] = ['big-number', 'image', 'split-image', 'title-body', 'cover'];
  return pool.filter(l => l !== original).slice(0, 2);
}

/** Step 2: Generate a single slide from outline item */
async function generateSlide(
  item: OutlineItem,
  outline: OutlineItem[],
  theme: Theme,
  systemPromptSuffix?: string,
  format: GenerateFormat = 'slide',
  locale: Locale = 'zh',
): Promise<Slide> {
  const pf = PF(locale);
  const prevTitle = item.page > 1 ? outline[item.page - 2]?.point : undefined;
  const nextTitle = item.page < outline.length ? outline[item.page]?.point : undefined;

  const context = [
    `${pf.pageLabel}: ${item.page}/${outline.length}`,
    `${pf.layoutLabel}: ${item.layout}`,
    item.title
      ? `🚨 ${pf.titleLabel} (use verbatim, do NOT rewrite): ${item.title}`
      : '',
    item.subtitle
      ? `🚨 ${pf.subtitleLabel} (use verbatim): ${item.subtitle}`
      : '',
    item.pageType ? `${pf.pageTypeLabel}: ${item.pageType}` : '',
    `${pf.corePointLabel}: ${item.point}`,
    item.subPoints?.length
      ? `🚨 Supporting points (use verbatim):\n${item.subPoints.map(s => `- ${s}`).join('\n')}`
      : '',
    item.evidence?.length
      ? `🚨 Data/evidence (use verbatim):\n${item.evidence.map(e => `> ${e}`).join('\n')}`
      : '',
    item.body && item.body.trim().length > 0
      ? `📝 ${pf.bodyLabel} (integrate naturally, may paraphrase for layout fit):\n${item.body.trim()}`
      : '',
    prevTitle ? `${pf.prevPageLabel}: ${prevTitle}` : '',
    nextTitle ? `${pf.nextPageLabel}: ${nextTitle}` : '',
  ].filter(Boolean).join('\n');

  const baseSystem = slideSystemPrompt(theme, format, locale);
  const system = systemPromptSuffix ? `${baseSystem}\n\n${systemPromptSuffix}` : baseSystem;

  const { text } = await callLLM({
    model: getModel(),
    system,
    messages: [{
      role: 'user',
      content: context,
    }],
    providerOptions: getCacheOpts(),
  });

  const data = parseJSON(text);

  // Generation should stay on one deck-wide theme system. If the model leaks a
  // per-page style object, strip it rather than hoisting it into Slide.style.
  if (data && typeof data === 'object' && 'style' in (data as Record<string, unknown>)) {
    delete (data as Record<string, unknown>).style;
  }

  // Force user-approved fields onto the result. Prompt is not a hard guarantee;
  // post-write makes it one. subPoints/evidence may end up unrendered on layouts
  // that don't consume them — harmless extras, but never a silent rewrite.
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (item.title) d.title = item.title;
    if (item.subtitle) d.subtitle = item.subtitle;
    if (item.subPoints?.length) d.subPoints = item.subPoints;
    if (item.evidence?.length) d.evidence = item.evidence;
  }

  return {
    layout: item.layout,
    data,
    ...(item.notes ? { notes: item.notes } : {}),
    ...(item.pageType ? { pageType: item.pageType } : {}),
  } as Slide;
}

/**
 * B5 — Guard against LLM-hallucinated layout values. Outline items with a
 * layout outside the Layout union (e.g. "gradient-hero", "modern-cards") are
 * rewritten to 'title-body' and logged. Warning-phase: we fall back silently
 * to collect trace data; after a week of production logs we decide whether to
 * upgrade to a hard user-visible error.
 */
function validateOutlineLayouts(outline: OutlineItem[]): OutlineItem[] {
  return outline.map(item => {
    if (isLayout(item.layout)) return item;
    const invalid = String(item.layout);
    console.warn(
      `[validateOutlineLayouts] page ${item.page}: unknown layout "${invalid}" → title-body fallback`,
    );
    if (process.env.NODE_ENV === 'development' && process.env.LASCA_TRACE === '1') {
      // eslint-disable-next-line no-console
      console.log('[LASCA_TRACE]', JSON.stringify({
        stage: 'outline-layout-invalid',
        page: item.page,
        invalid,
        fallback: 'title-body',
        point: item.point,
      }));
    }
    return { ...item, layout: 'title-body' as Layout };
  });
}

/**
 * Post-outline diversity check: replace layout when 3+ consecutive pages share it.
 * Previously replaced on 2 consecutive, which silently overrode deliberate LLM
 * hints (e.g. two KPI dashboards or a two-quote reflection section). Three in a
 * row almost never reflects intent, so we keep that as the trigger and log
 * every replacement for observability.
 */
function enforceLayoutDiversity(outline: OutlineItem[]): OutlineItem[] {
  const allLayouts: Layout[] = [
    'cover', 'big-number', 'three-cards', 'two-column', 'stacked-bars', 'grid-cards', 'quote', 'image',
    'title-body', 'split-image', 'icon-list', 'timeline', 'table',
    'bar-chart', 'horizontal-bar-chart', 'line-chart', 'pie-chart',
    'stacked-bar-chart', 'scatter-chart', 'dual-axis-bar', 'heatmap',
    'flowchart', 'funnel', 'pyramid', 'steps', 'matrix', 'versus', 'venn', 'bullseye', 'cycle',
  ];

  for (let i = 2; i < outline.length; i++) {
    if (
      outline[i].layout === outline[i - 1].layout
      && outline[i - 1].layout === outline[i - 2].layout
    ) {
      const recent = new Set(
        [outline[i - 1].layout, outline[i - 2]?.layout].filter(Boolean),
      );
      const alternatives = allLayouts.filter(l => !recent.has(l));
      const newLayout = alternatives[0] || 'two-column';
      console.warn(
        `[enforceLayoutDiversity] page ${i + 1}: ${outline[i].layout} → ${newLayout} (3 consecutive)`,
      );
      outline[i] = { ...outline[i], layout: newLayout };
    }
  }
  return outline;
}

/** Full pipeline: outline → parallel generate → return */
export async function* generateDeck(
  prompt: string,
  pageCount: number,
  theme: Theme,
  opts?: GenerateDeckOptions,
): AsyncGenerator<PipelineEvent> {
  const format: GenerateFormat = opts?.format ?? 'slide';
  const locale: Locale = opts?.locale ?? 'zh';
  const pf = PF(locale);
  try {
    // ---- Three-stage path: mdContext provided → design step → derived outline ----
    let designResult: DesignStepResult | undefined;

    if (opts?.mdDesign) {
      // mdDesign already provided (user hand-edited or cached) — parse directly
      const { parseMdDesign } = await import('./mdDesign/parser');
      const parsed = parseMdDesign(opts.mdDesign);
      const outline: OutlineItem[] = parsed.slides.map((s, i) => ({
        page: i + 1,
        layout: s.frontMatter.layout,
        point: s.body.match(/^#{1,2}\s+(.+)$/m)?.[1]?.trim()
          || s.frontMatter.title as string
          || `Slide ${i + 1}`,
      }));
      designResult = { raw: opts.mdDesign, parsed, outline };
    } else if (opts?.mdContext) {
      // mdContext provided → run design step (1 LLM call)
      designResult = await generateDesign(opts.mdContext, opts.demand, opts.systemPromptSuffix, locale);
    }

    // Step 1: Outline — from design step, prebuilt, or LLM
    const rawOutline = designResult?.outline
      ?? opts?.prebuiltOutline
      ?? await generateOutline(prompt, pageCount, format, locale);

    // B5 — Catch LLM-hallucinated layout values before any downstream code
    // sees them (diversity check, renderer, goldenRules). Warning-phase:
    // falls back to title-body silently, logs to warn + LASCA_TRACE.
    const validatedOutline = validateOutlineLayouts(rawOutline);

    // Post-outline diversity: no 2 consecutive same layouts (zero-LLM-cost fix)
    const outline = enforceLayoutDiversity(validatedOutline);
    yield { type: 'outline', data: outline };

    // Step 2: Parallel generate all slides
    const slides: Slide[] = [];
    const batchSize = 4; // parallel batch

    // B4 — cover variations fork. Gated by LASCA_COVER_VARIATIONS (default on;
    // set to '0' to disable). Only runs for slide format (reports don't have
    // a cover concept) and when the deck has at least 2 pages (no point
    // offering variations for a single-slide cover).
    const coverVariationsEnabled =
      process.env.LASCA_COVER_VARIATIONS !== '0'
      && format === 'slide'
      && outline.length >= 2;
    let coverAltsPromise: Promise<Slide[]> | null = null;

    for (let i = 0; i < outline.length; i += batchSize) {
      const batch = outline.slice(i, i + batchSize);
      yield { type: 'generating', data: { from: i + 1, to: Math.min(i + batchSize, outline.length), total: outline.length } };

      // Per-item try/catch so a single failing slide in a batch of 4 doesn't
      // reject the whole Promise.all and throw away its 3 successful
      // siblings. Before this, a flaky upstream (~20% server_error rate on
      // one proxy we tested) could collapse an 11-page deck to 4 pages even
      // though 9 LLM calls succeeded. See model.ts for the complementary
      // retry fix that catches server_error as retryable.
      const batchResults = await Promise.all(
        batch.map(async item => {
          try {
            const slide = await generateSlide(item, outline, theme, opts?.systemPromptSuffix, format, locale);
            return { ok: true as const, slide };
          } catch (err) {
            return { ok: false as const, error: err as Error };
          }
        })
      );
      // Emit individual slide events so the frontend can render progressively.
      // Adapter rewrites every supported legacy layout → card-canvas, applying
      // the user's per-page compositionHint when provided. We also thread the
      // pre-adapter `rawSlide` on the event so downstream consumers (e.g. the
      // harness orchestrator) can run goldenRules/layoutRules against the
      // legacy-layout form — those rules branch on `slide.layout === 'bento'`
      // etc. and would silently skip every card-canvas slide.
      for (let j = 0; j < batchResults.length; j++) {
        const pageIdx = i + j;
        const result = batchResults[j];

        if (!result.ok) {
          // Placeholder slide preserves page count + lets user see which
          // page failed. 'title-body' renders reliably regardless of theme
          // and matches mdContext.pages.length so the deck shape stays whole.
          const isEn = locale === 'en';
          const placeholder: Slide = {
            layout: 'title-body',
            data: {
              title: isEn ? 'Generation failed' : '生成失败',
              body: isEn
                ? `Page ${pageIdx + 1} did not generate. Reason: ${result.error.message}. You can regenerate this page from the editor or delete it.`
                : `第 ${pageIdx + 1} 页未能生成。原因：${result.error.message}。可在编辑器中重新生成此页或删除它。`,
            },
          };
          slides.push(placeholder);
          yield { type: 'slide', data: { index: pageIdx, slide: placeholder, rawSlide: placeholder } };
          yield {
            type: 'error',
            data: {
              message: `Page ${pageIdx + 1} generation failed: ${result.error.message}`,
              fatal: false,
              kind: 'slide-generation-failed',
              page: pageIdx + 1,
            },
          };
          console.warn(`[pipeline] page ${pageIdx + 1} generation failed:`, result.error.message);
          continue;
        }

        const compositionHint = opts?.demand?.pageCompositions?.[pageIdx];
        const raw = result.slide;
        const adapted = maybeAdaptToCardCanvas(raw, compositionHint);
        slides.push(adapted);
        yield { type: 'slide', data: { index: pageIdx, slide: adapted, rawSlide: raw } };

        // B4 — as soon as the cover (index 0) lands, kick off 2 alt-layout
        // forks in the background. They run concurrent with the rest of the
        // pipeline (generation + recheck) so the user picker shows up before
        // or alongside `done`, not gated behind the whole deck.
        if (coverVariationsEnabled && pageIdx === 0 && !coverAltsPromise) {
          const altLayouts = pickCoverAltLayouts(outline[0].layout);
          coverAltsPromise = Promise.all(
            altLayouts.map(alt =>
              generateSlide(
                { ...outline[0], layout: alt },
                outline,
                theme,
                opts?.systemPromptSuffix,
                format,
                locale,
              ).then(r => maybeAdaptToCardCanvas(r, undefined))
                .catch(err => {
                  console.warn('[coverVariations] alt generation failed', alt, (err as Error).message);
                  return null;
                }),
            ),
          ).then(results => results.filter((s): s is Slide => s !== null));
        }
      }
    }

    // B4 — if cover alts were forked, await + emit the picker event before
    // recheck/done. Failures are non-fatal: we just skip the picker.
    if (coverAltsPromise) {
      try {
        const alts = await coverAltsPromise;
        if (alts.length > 0) {
          yield {
            type: 'cover-variations',
            data: { original: slides[0], alternates: alts },
          };
        }
      } catch (err) {
        console.warn('[coverVariations] all alts failed', (err as Error).message);
      }
    }

    // Step 3: Visual recheck — slide format only. For reports we skip recheck
    // because the heuristic (isHighRisk) and the screenshot prompts are all
    // calibrated to 960×540 slide layouts; reusing them on letter would
    // produce noisy false positives. Report recheck is a follow-up.
    //
    // B2 Phase 1 — Silent-on-pass contract (2026-04-20):
    //   • All pass (failures.length === 0): emit NO events. The UI must treat
    //     the absence of 'rechecking'/'fixed'/recheck-error as a clean pass.
    //     Consumers (ChatPanel, GenerationPreview) MUST NOT render a generic
    //     "✓ checked" toast — 'done' already signals completion.
    //   • Auto-fix succeeded: 'rechecking' + 'fixed' events fire, but UI keeps
    //     them silent (transient working indicator is enough). The user didn't
    //     need to do anything; no need to surface it.
    //   • Auto-fix failed: emit 'error' with kind='recheck-fix-failed' + issues.
    //     ChatPanel renders this as an AiActionBlock (type:'action') with
    //     expandable issue detail — the user should know what we couldn't fix.
    if (format === 'slide') {
      // Step 3: Identify high-risk slides for recheck
      const highRiskIndices = slides
        .map((slide, i) => isHighRisk(slide.layout, slide.data as Record<string, unknown>) ? i : -1)
        .filter(i => i !== -1);

      // Step 3: Visual recheck high-risk slides (max 2 rounds)
      for (let round = 0; round < 2; round++) {
        const failures = await recheckSlides(slides, theme, locale);
        if (failures.length === 0) break;

        yield { type: 'rechecking', data: { round: round + 1, pages: failures.map(f => f.page) } };

        // Fix failed slides
        for (const failure of failures) {
          const idx = failure.page - 1;
          const item = outline[idx];
          const issues = failure.issues?.join('; ') || 'visual quality issue';

          const { text: fixText } = await callLLM({
            model: getModel(),
            system: fixSystemPrompt(theme, format, locale),
            messages: [{
              role: 'user',
              content: pf.fixRequest(item.page, outline.length, item.layout, item.point, JSON.stringify(slides[idx].data), issues),
            }],
            providerOptions: getCacheOpts(),
          });
          try {
            const fixedData = parseJSON(fixText);
            const compositionHint = opts?.demand?.pageCompositions?.[idx];
            const rawFixed = { layout: item.layout, data: fixedData } as Slide;
            slides[idx] = maybeAdaptToCardCanvas(rawFixed, compositionHint);
            yield { type: 'fixed', data: { page: failure.page, issues: failure.issues, rawSlide: rawFixed } };
          } catch {
            // Parse failure — surface to user via AiActionBlock (see contract above).
            // 'kind' lets ChatPanel distinguish recheck-fix errors from other
            // non-fatal errors; 'issues' feeds the expandable detail pane.
            yield {
              type: 'error',
              data: {
                message: pf.fixFailedMessage(failure.page),
                fatal: false,
                kind: 'recheck-fix-failed',
                page: failure.page,
                issues: failure.issues ?? [],
              },
            };
          }
        }
      }
    }

    yield { type: 'done', data: { slides } };
  } catch (err) {
    yield { type: 'error', data: { message: (err as Error).message, fatal: true } };
  }
}
