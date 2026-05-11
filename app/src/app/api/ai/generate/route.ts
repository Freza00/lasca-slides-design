// ============================================================================
// /api/ai/generate — Lasca AI 生成接口
// ============================================================================
// Milestone 1 升级：从直调 pipeline 改为调 harness orchestrator。
//
// 向后兼容：保留原来的 { prompt, pageCount, theme } 入参形状——
// 当请求里没有 workflow 字段时，回落到旧的 pipeline（无 clarifier、无硬约束）。
//
// 新入参形状：
//   {
//     workflow: 'generate-from-draft' | ...,
//     rawInput: '用户的原始草稿或指令',
//     clarifierAnswers?: { audience: 'boss', length: 5, preset: 'warm' },
//     presetId?: 'warm',
//     pageCount?: 5,
//     theme?: 'warm',
//     skipClarifier?: false
//   }
// ============================================================================

import { NextRequest } from 'next/server';
import { generateDeck } from '@/lib/ai/pipeline';
import { runOrchestrator } from '@/lib/ai/harness/orchestrator';
import { logger } from '@/lib/logger';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { Theme } from '@/lib/types';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';
import type {
  OrchestratorInput,
  WorkflowType,
  ClarifierAnswers,
  StylePresetId,
  MdContext,
} from '@/lib/ai/harness/types';

type LegacyBody = {
  prompt: string;
  pageCount?: number;
  theme?: Theme;
  /** v2.4: 'slide' (default, 8 horizontal layouts) or 'report' (4 vertical
   *  report-* layouts for letter/a4 decks). ChatPanel derives this from
   *  activeDeck.pageSize. */
  format?: 'slide' | 'report';
  /** i18n: locale for AI prompt language. Defaults to 'zh'. */
  locale?: Locale;
};

type HarnessBody = {
  workflow: WorkflowType;
  rawInput: string;
  /** 用户已批准的 PlanOutline；回传后 orchestrator 用 plan 约束生成 mdContext */
  planOverride?: import('@/lib/ai/harness/types').PlanOutline;
  /** 用户已批准的 MdContext；回传后 orchestrator 跳过 md-context 构建阶段 */
  mdContextOverride?: MdContext;
  clarifierAnswers?: ClarifierAnswers;
  /** Step 2 LLM-generated content questions (id + question text). Passed
   *  through to orchestrator which pairs them with clarifierAnswers to feed
   *  buildPlanOutline's aiQA prompt block. */
  aiQuestions?: Array<{ id: string; question: string }>;
  presetId?: StylePresetId;
  pageCount?: number;
  theme?: Theme;
  skipClarifier?: boolean;
  /** v2.4: 'slide' (default) or 'report' for letter/a4 vertical output. */
  format?: 'slide' | 'report';
  /** Pre-built mdDesign (Slidev-format string). When provided, orchestrator
   *  skips both design and outline LLM calls — goes straight to slide gen. */
  mdDesign?: string;
  /** i18n: locale for AI prompt language. Defaults to 'zh'. */
  locale?: Locale;
  /** Full-content mode: try direct MdContext parse before falling back to plan outline. */
  skipPlanIfStructured?: boolean;
  /** ModeChooser "polish" pick — preserve every user paragraph, only fix
   *  typos / phrasing / restore implicit headings / add connectives. */
  polishMode?: boolean;
};

/** Coarse content-language detection. Generated content should follow the
 *  user's *input* language, not the UI locale. When UI=en but rawInput is
 *  Chinese, we override locale to 'zh' so prompts switch to the zh branch
 *  (and `orchestrator.langGuard`'s "output only in English" suffix drops out).
 *  Returns null when input is too short or not confidently Chinese — callers
 *  fall back to the UI locale. */
function detectContentLocale(input: string | undefined): 'zh' | null {
  if (!input) return null;
  const cjk = (input.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latin = (input.match(/[A-Za-z]/g) ?? []).length;
  const meaningful = cjk + latin;
  if (meaningful < 4) return null;
  if (cjk >= 4 && cjk / meaningful >= 0.15) return 'zh';
  return null;
}

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 2 * 1024 * 1024); // 2MB (mdContextOverride for 47-page institutional decks ≈ 1MB; was 200KB)
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'generate', 3);
  if (rateLimited) return rateLimited;

  const body = (await request.json()) as LegacyBody | HarnessBody;

  const isHarness = 'workflow' in body && typeof body.workflow === 'string';
  const auth = verifyToken(request);

  if (isHarness) {
    const h = body as HarnessBody;
    if (!h.rawInput) {
      logger.warn('ai', 'generate: rawInput 为空');
      return Response.json({ error: 'rawInput 不能为空' }, { status: 400 });
    }
  } else {
    const l = body as LegacyBody;
    if (!l.prompt) {
      return Response.json({ error: 'prompt 不能为空' }, { status: 400 });
    }
  }

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

    await logEvent(user.id, null, 'ai_generate', {
      mode: isHarness ? 'harness' : 'legacy',
      workflow: isHarness ? (body as HarnessBody).workflow : null,
      format: 'format' in body ? body.format ?? null : null,
      pageCount: body.pageCount ?? null,
    });
  }

  const startMs = Date.now();
  logger.info('ai', `收到 generate 请求`, { isHarness, body: { ...body, rawInput: (body as HarnessBody).rawInput?.slice(0, 200), prompt: (body as LegacyBody).prompt?.slice(0, 200) } });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          const data = JSON.stringify(event);
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // Client disconnected — stop sending
          closed = true;
        }
      };

      // Heartbeat: long blocking LLM calls (e.g. buildMdContext, ~90s each) emit
      // no SSE events. Without periodic traffic the frontend's inactivity timer
      // aborts a live request. Send a tick every 10s so the client knows we're
      // still alive.
      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', data: { t: Date.now() } });
      }, 10000);

      try {
        if (isHarness) {
          // ----- 新路径：走 harness orchestrator -----
          const h = body as HarnessBody;
          const effectiveLocale = detectContentLocale(h.rawInput) ?? h.locale ?? DEFAULT_LOCALE;
          const input: OrchestratorInput = {
            workflow: h.workflow,
            rawInput: h.rawInput,
            planOverride: h.planOverride,
            mdContextOverride: h.mdContextOverride,
            clarifierAnswers: h.clarifierAnswers,
            aiQuestions: h.aiQuestions,
            presetId: h.presetId,
            pageCount: h.pageCount,
            theme: h.theme,
            skipClarifier: h.skipClarifier,
            format: h.format,
            mdDesign: h.mdDesign,
            locale: effectiveLocale,
            skipPlanIfStructured: h.skipPlanIfStructured,
            polishMode: h.polishMode,
          };

          for await (const event of runOrchestrator(input)) {
            send(event);
          }
        } else {
          // ----- 旧路径：直调 pipeline，保持现有前端不坏 -----
          const l = body as LegacyBody;
          for await (const event of generateDeck(
            l.prompt,
            l.pageCount || 5,
            l.theme || 'warm',
            { format: l.format || 'slide', locale: l.locale ?? DEFAULT_LOCALE },
          )) {
            send(event);
          }
        }

        logger.info('ai', `generate 流完成`, { elapsed: `${Date.now() - startMs}ms` });
        if (!closed) {
          try { controller.enqueue(encoder.encode('data: [DONE]\n\n')); } catch { /* client left */ }
        }
      } catch (err) {
        logger.error('ai', 'generate 失败', { error: (err as Error).message, stack: (err as Error).stack?.split('\n').slice(0, 5).join('\n') });
        send({
          type: 'error',
          data: { message: (err as Error).message, fatal: true },
        });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
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
