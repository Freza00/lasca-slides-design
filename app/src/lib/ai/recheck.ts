// ============================================================================
// Visual Recheck — screenshot slide → Claude vision → pass/fail
// ============================================================================

import { callLLM, getModel, getCacheOpts } from './model';
import { recheckSystemPrompt, isHighRisk } from './prompts';
import { screenshotSlide } from './screenshot';
import type { Slide, Theme } from '../types';
import type { Locale } from '../i18n';
import { PROMPT_FRAGMENTS as ZH } from './prompts.zh';
import { PROMPT_FRAGMENTS as EN } from './prompts.en';

export interface RecheckResult {
  page: number;
  pass: boolean;
  issues?: string[];
}

/**
 * Visual recheck a single slide.
 * Takes a screenshot and sends it to Claude vision for quality assessment.
 */
async function recheckOne(slide: Slide, theme: Theme, pageNum: number, locale: Locale = 'zh'): Promise<RecheckResult> {
  const base64 = await screenshotSlide(slide, theme);

  if (!base64) {
    // Puppeteer not available, skip recheck
    return { page: pageNum, pass: true };
  }

  const rf = locale === 'en' ? EN.recheck : ZH.recheck;
  const { text } = await callLLM({
    model: getModel(),
    system: recheckSystemPrompt(locale),
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          image: `data:image/png;base64,${base64}`,
        },
        {
          type: 'text',
          // For card-canvas slides, pass the compositionId instead of the bare
          // layout name — it carries finer-grained signal (grid-3col vs
          // bento-1large-2small vs cover-center) than the single 'card-canvas'
          // label. Legacy (non-card-canvas) slides pass through as before.
          text: rf.checkRequest(
            slide.layout === 'card-canvas'
              ? ((slide.data as { compositionId?: string } | undefined)?.compositionId ?? slide.layout)
              : slide.layout,
            theme,
          ),
        },
      ],
    }],
    providerOptions: getCacheOpts(),
  });

  const cleaned = (text || '{"pass": true}').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    const result = JSON.parse(cleaned);
    return { page: pageNum, ...result };
  } catch {
    return { page: pageNum, pass: true }; // Parse failure = assume pass
  }
}

/**
 * Recheck an array of slides, only checking high-risk ones.
 * Returns results for checked slides.
 */
export async function recheckSlides(
  slides: Slide[],
  theme: Theme,
  locale: Locale = 'zh',
): Promise<RecheckResult[]> {
  const highRiskIndices = slides
    .map((slide, i) => isHighRisk(slide.layout, slide.data as Record<string, unknown>) ? i : -1)
    .filter(i => i !== -1);

  if (highRiskIndices.length === 0) return [];

  const results = await Promise.all(
    highRiskIndices.map(i => recheckOne(slides[i], theme, i + 1, locale))
  );

  return results.filter(r => !r.pass);
}
