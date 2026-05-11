import { NextRequest } from 'next/server';
import { callLLM, getModel, getCacheOpts } from '@/lib/ai/model';
import { editSystemPrompt, editSingleFieldSystemPrompt } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { Theme } from '@/lib/types';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';
import { PROMPT_FRAGMENTS as ZH } from '@/lib/ai/prompts.zh';
import { PROMPT_FRAGMENTS as EN } from '@/lib/ai/prompts.en';

// Resolve a dot-path like "cards[0].title" (same shape that
// store.updateSlideField accepts and that Canvas puts in `data-field` attrs)
// against a slide object. Returns null when the path is broken or the leaf
// isn't a string — single-field rewriting only makes sense on string leaves.
function resolveFieldValue(slide: unknown, fieldPath: string): string | null {
  if (!slide || typeof slide !== 'object') return null;
  // data-field paths on Lasca's native layouts are rooted at slide.data
  // (e.g. "cards[0].title" means slide.data.cards[0].title). Fall back to
  // slide root if .data isn't an object.
  const root: unknown = (slide as Record<string, unknown>).data ?? slide;
  const parts = fieldPath.split('.');
  let current: unknown = root;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return null;
    const m = part.match(/^([^[]+)(?:\[(\d+)\])?$/);
    if (!m) return null;
    const key = m[1];
    const idx = m[2];
    current = (current as Record<string, unknown>)[key];
    if (idx !== undefined) {
      if (!Array.isArray(current)) return null;
      current = current[Number(idx)];
    }
  }
  return typeof current === 'string' ? current : null;
}

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 50 * 1024); // 50KB
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'edit', 10);
  if (rateLimited) return rateLimited;

  const body = await request.json() as {
    theme: Theme;
    outline: string[];
    targetPage: number;
    currentSlide: Record<string, unknown>;
    prevTitle?: string;
    nextTitle?: string;
    message: string;
    contentLocked?: boolean;
    /** When true, return { plan: rawText } instead of parsing as slide JSON.
     *  Used by the chart conversion flow to get a human-readable plan first. */
    planOnly?: boolean;
    /** When set, locks the AI to this specific layout (chart conversion mode).
     *  Also auto-bypasses contentLocked since chart conversion necessarily changes content. */
    targetLayout?: string;
    /** B1 — when set (e.g. "cards[0].title"), the AI rewrites only that leaf
     *  string and returns {newValue}. Skips layout/content-lock prompts since
     *  single-field edits can't violate those. Only valid for native layouts;
     *  pptx-faithful / pdf-faithful still go through the whole-slide path. */
    fieldPath?: string;
    /** i18n: locale for AI prompt language. Defaults to 'zh'. */
    locale?: Locale;
  };
  const auth = verifyToken(request);

  const locale: Locale = body.locale ?? DEFAULT_LOCALE;
  const ef = locale === 'en' ? EN.editRoute : ZH.editRoute;

  logger.info('ai', `收到 edit 请求`, { targetPage: body.targetPage, message: body.message?.slice(0, 100), fieldPath: body.fieldPath });
  const startMs = Date.now();

  // B1 — single-field path: the user clicked a specific [data-field] before
  // typing into chat. Route to editSingleFieldSystemPrompt; context becomes
  // just the instruction (prompt already embeds fieldPath + current value).
  const singleField = body.fieldPath
    ? resolveFieldValue(body.currentSlide, body.fieldPath)
    : null;
  const isSingleFieldMode = body.fieldPath != null && singleField != null && !body.planOnly && !body.targetLayout;

  const context = isSingleFieldMode
    ? body.message
    : [
      `${ef.outlineLabel}: ${body.outline?.join(' | ') || ''}`,
      `${ef.currentPageLabel(body.targetPage)}: ${JSON.stringify(body.currentSlide)}`,
      body.prevTitle ? `${ef.prevTitleLabel}: ${body.prevTitle}` : '',
      body.nextTitle ? `${ef.nextTitleLabel}: ${body.nextTitle}` : '',
      `\n${ef.userInstructionLabel}: ${body.message}`,
    ].filter(Boolean).join('\n');

  try {
    if (process.env.POSTGRES_URL && auth?.userId) {
      const user = await getUserById(auth.userId);
      if (!user || user.status === 'banned') {
        return Response.json({ error: '账号已被限制' }, { status: 403 });
      }

      await touchLastActive(user.id);
      const quota = await checkAndIncrementAiCalls(user.id);
      if (!quota.allowed) {
        return Response.json({
          error: 'AI 调用次数已达今日上限',
          remaining: 0,
          resetAt: quota.resetAt,
        }, { status: 429 });
      }

      await logEvent(user.id, null, 'ai_edit', {
        targetPage: body.targetPage,
        planOnly: !!body.planOnly,
        targetLayout: body.targetLayout ?? null,
      });
    }

    const system = isSingleFieldMode
      ? editSingleFieldSystemPrompt(body.theme || 'warm', body.fieldPath!, singleField!, locale)
      : editSystemPrompt(body.theme || 'warm', {
        contentLocked: body.targetLayout ? false : body.contentLocked,
        targetLayout: body.targetLayout,
      }, locale);

    const { text } = await callLLM({
      model: getModel(),
      system,
      messages: [{ role: 'user', content: context }],
      providerOptions: getCacheOpts(),
    });

    logger.info('ai', `edit LLM 返回`, { elapsed: `${Date.now() - startMs}ms`, textLen: text?.length, mode: isSingleFieldMode ? 'single-field' : 'full-slide' });

    // Plan-only mode: return raw LLM text without JSON parsing (for chart conversion flow)
    if (body.planOnly) {
      const planText = (text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      return Response.json({ plan: planText });
    }

    const cleaned = (text || '{}').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const patch = JSON.parse(cleaned);
      logger.info('ai', `edit JSON 解析成功`, { keys: Object.keys(patch), mode: isSingleFieldMode ? 'single-field' : 'full-slide' });
      if (isSingleFieldMode) {
        // Single-field response: the LLM returns {newValue}. Echo fieldPath so
        // the client can pass both to store.updateSlideField directly without
        // tracking its own in-flight state.
        const newValue = typeof patch.newValue === 'string' ? patch.newValue : null;
        if (newValue == null) {
          logger.error('ai', 'single-field edit missing newValue', { raw: cleaned.slice(0, 300) });
          return Response.json({ error: 'AI response missing newValue', raw: text }, { status: 500 });
        }
        return Response.json({ fieldPath: body.fieldPath, newValue });
      }
      return Response.json(patch);
    } catch {
      logger.error('ai', 'edit JSON 解析失败', { raw: cleaned.slice(0, 500) });
      return Response.json({ error: 'Failed to parse AI response', raw: text }, { status: 500 });
    }
  } catch (err) {
    logger.error('ai', 'edit LLM 调用失败', { error: (err as Error).message });
    return Response.json({ error: (err as Error).message || 'Edit failed' }, { status: 500 });
  }
}
