// ============================================================================
// /api/ai/recolor — Rewrite faithful rawHtml colors → CSS custom properties
// ============================================================================
// Takes rawHtml from a faithful slide, sends it to the LLM with
// recolorSystemPrompt(), returns the rewritten HTML where hardcoded
// colors are replaced with var(--lasca-primary, #fallback) references.
// Streams progress via SSE.
// ============================================================================

import { NextRequest } from 'next/server';
import { callLLM, getCacheOpts } from '@/lib/ai/model';
import { recolorSystemPrompt } from '@/lib/ai/prompts';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';

interface RecolorBody {
  rawHtml: string;
  /** i18n: locale for AI prompt language. Defaults to 'zh'. */
  locale?: Locale;
}

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 2 * 1024 * 1024); // 2MB
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'recolor', 5);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as RecolorBody;
  const locale: Locale = body.locale ?? DEFAULT_LOCALE;

  if (!body.rawHtml) {
    return new Response(JSON.stringify({ error: 'Missing rawHtml' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({
          type: 'status',
          data: { message: locale === 'en' ? 'Analyzing colors and typography...' : '正在分析颜色和字体...' },
        });

        const result = await callLLM({
          system: recolorSystemPrompt(locale),
          messages: [{ role: 'user', content: body.rawHtml }],
          providerOptions: getCacheOpts(),
        });

        // The AI should return raw HTML starting with '<'
        let themedHtml = result.text?.trim() || '';

        // Strip code fences if AI wrapped the output
        if (themedHtml.startsWith('```')) {
          themedHtml = themedHtml
            .replace(/^```(?:html)?\s*\n?/, '')
            .replace(/\n?```\s*$/, '')
            .trim();
        }

        if (!themedHtml || !themedHtml.includes('<')) {
          send({
            type: 'error',
            data: { message: locale === 'en' ? 'AI returned invalid HTML' : 'AI 返回的 HTML 无效', fatal: true },
          });
        } else {
          send({ type: 'done', data: { themedHtml } });
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        send({
          type: 'error',
          data: { message: (err as Error).message, fatal: true },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
