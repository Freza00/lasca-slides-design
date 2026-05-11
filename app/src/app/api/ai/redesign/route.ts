// ============================================================================
// /api/ai/redesign — Smart PDF → native Lasca slides via AI
// ============================================================================
// Receives pre-serialized page analysis text (no base64 images),
// calls LLM (via model.ts abstraction — supports OpenAI proxy + Anthropic)
// to map each page to a Lasca layout + fill data fields,
// streams progress via SSE.
// ============================================================================

import { NextRequest } from 'next/server';
import { callLLM, getCacheOpts } from '@/lib/ai/model';
import { smartRedesignSystemPrompt } from '@/lib/ai/prompts';
import { logger } from '@/lib/logger';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { Slide, Layout, SlideData } from '@/lib/types';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';

interface RedesignBody {
  pages: Array<{ pageIndex: number; width: number; height: number }>;
  /** Full prompt text built client-side from PageAnalysis[] */
  promptText: string;
  /** i18n: locale for AI prompt language. Defaults to 'zh'. */
  locale?: Locale;
}

const VALID_LAYOUTS = new Set<Layout>([
  'cover', 'big-number', 'title-body', 'three-cards', 'two-column',
  'split-image', 'icon-list', 'stacked-bars', 'grid-cards',
  'timeline', 'table', 'quote', 'image',
]);

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 500 * 1024); // 500KB
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'redesign', 3);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as RedesignBody;
  const locale: Locale = body.locale ?? DEFAULT_LOCALE;

  if (!body.promptText || !body.pages?.length) {
    logger.warn('ai', 'redesign: 缺少 promptText 或 pages');
    return new Response(JSON.stringify({ error: 'Missing promptText or pages' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = verifyToken(request);
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
    await logEvent(user.id, null, 'ai_redesign', {
      pageCount: body.pages.length,
      locale,
    });
  }

  logger.info('ai', `收到 redesign 请求`, { pageCount: body.pages.length, promptLen: body.promptText.length });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({
          type: 'status',
          data: {
            message: locale === 'en'
              ? `Analyzing ${body.pages.length} PDF pages with AI...`
              : `正在让 AI 分析 ${body.pages.length} 页 PDF...`,
          },
        });

        const systemPrompt = smartRedesignSystemPrompt(locale);

        const result = await callLLM({
          system: systemPrompt,
          messages: [{ role: 'user', content: body.promptText }],
          providerOptions: getCacheOpts(),
        });

        send({
          type: 'status',
          data: {
            message: locale === 'en'
              ? 'AI analysis finished, parsing the result...'
              : 'AI 分析完成，正在解析结果...',
          },
        });
        logger.info('ai', 'redesign LLM 返回', { textLen: result.text?.length });

        const text = result.text;

        // Try to parse JSON — may be wrapped in ```json ... ```
        let jsonStr = text;
        const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenceMatch) jsonStr = fenceMatch[1];

        let parsed: Array<{ page: number; layout: string; data: Record<string, unknown> }>;
        try {
          parsed = JSON.parse(jsonStr.trim());
        } catch {
          logger.error('ai', 'redesign JSON 解析失败', { raw: jsonStr.slice(0, 500) });
          send({
            type: 'error',
            data: { message: locale === 'en' ? 'Failed to parse AI JSON output' : 'AI 返回的 JSON 解析失败', fatal: true },
          });
          controller.close();
          return;
        }

        if (!Array.isArray(parsed)) {
          send({
            type: 'error',
            data: { message: locale === 'en' ? 'AI returned an unexpected format' : 'AI 返回格式异常', fatal: true },
          });
          controller.close();
          return;
        }

        // Build Slide[] with validation
        const slides: Slide[] = [];
        for (const item of parsed) {
          const layout = VALID_LAYOUTS.has(item.layout as Layout)
            ? (item.layout as Layout)
            : 'title-body';
          const data = (item.data && typeof item.data === 'object')
            ? { ...(item.data as Record<string, unknown>) }
            : {};
          delete data.style;
          slides.push({
            layout,
            data: data as SlideData,
          });
        }

        logger.info('ai', `redesign 完成`, { slideCount: slides.length });
        send({
          type: 'done',
          data: { slides, pageCount: slides.length },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.error('ai', 'redesign 失败', { error: msg });
        send({
          type: 'error',
          data: { message: locale === 'en' ? `AI redesign failed: ${msg}` : `AI 重新设计失败: ${msg}`, fatal: true },
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
