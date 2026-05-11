import { NextRequest } from 'next/server';
import { callLLM, getModel, getCacheOpts } from '@/lib/ai/model';
import { pptxPolishSystemPrompt } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';
import { PROMPT_FRAGMENTS as ZH } from '@/lib/ai/prompts.zh';
import { PROMPT_FRAGMENTS as EN } from '@/lib/ai/prompts.en';

export interface PolishSuggestion {
  kind: 'copy' | 'color' | 'typography' | 'spacing' | 'repair';
  severity: 'high' | 'medium' | 'low';
  description: string;
  find: string;
  replace: string;
}

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 2 * 1024 * 1024); // 2MB (rawHtml with base64 images)
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'polish', 10);
  if (rateLimited) return rateLimited;

  const body = await request.json() as {
    rawHtml: string;
    pageIndex: number;
    /** i18n: locale for AI prompt language. Defaults to 'zh'. */
    locale?: Locale;
  };
  const auth = verifyToken(request);
  const locale: Locale = body.locale ?? DEFAULT_LOCALE;
  const prf = locale === 'en' ? EN.polishRoute : ZH.polishRoute;

  if (!body.rawHtml || typeof body.rawHtml !== 'string') {
    logger.warn('ai', 'polish: rawHtml 缺失');
    return Response.json({ error: 'rawHtml required' }, { status: 400 });
  }

  logger.info('ai', `收到 polish 请求`, { pageIndex: body.pageIndex, rawHtmlLen: body.rawHtml.length });
  const startMs = Date.now();

  // Truncate aggressively — polish should focus on text, not gigantic data URLs.
  // Strip embedded base64 image payloads before sending to the model.
  const stripped = body.rawHtml
    .replace(/data:image\/[^"')\s]+/g, 'data:image/...truncated...')
    .slice(0, 18000);

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

      await logEvent(user.id, null, 'ai_polish', {
        pageIndex: body.pageIndex,
        rawHtmlLength: body.rawHtml.length,
      });
    }

    const { text } = await callLLM({
      model: getModel(),
      system: pptxPolishSystemPrompt(locale),
      messages: [
        {
          role: 'user',
          content: `${prf.pageHtmlLabel(body.pageIndex + 1)}:\n\n${stripped}`,
        },
      ],
      providerOptions: getCacheOpts(),
    });

    logger.info('ai', `polish LLM 返回`, { pageIndex: body.pageIndex, elapsed: `${Date.now() - startMs}ms`, textLen: text?.length });

    const cleaned = (text || '{}').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    try {
      const parsed = JSON.parse(cleaned);
      const suggestions: PolishSuggestion[] = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      // Filter out suggestions whose find string is the truncation placeholder
      // (would never match in the real rawHtml).
      const usable = suggestions.filter(s =>
        s.find && s.replace && !s.find.includes('truncated')
      );
      logger.info('ai', `polish 解析成功`, { pageIndex: body.pageIndex, suggestionCount: usable.length });
      return Response.json({ suggestions: usable });
    } catch {
      logger.error('ai', 'polish JSON 解析失败', { pageIndex: body.pageIndex, raw: cleaned.slice(0, 500) });
      return Response.json({ suggestions: [], parseError: true, raw: text }, { status: 200 });
    }
  } catch (err) {
    logger.error('ai', 'polish LLM 调用失败', { pageIndex: body.pageIndex, error: (err as Error).message });
    return Response.json(
      { error: err instanceof Error ? err.message : 'Polish failed' },
      { status: 500 },
    );
  }
}
