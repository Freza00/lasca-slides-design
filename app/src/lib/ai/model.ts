// ============================================================================
// Lasca — Model provider abstraction
// ============================================================================
// Single source of truth for which LLM to use. Every pipeline.ts /
// orchestrator.ts call site imports from here instead of hardcoding a
// provider SDK.
//
// Env vars:
//   AI_PROVIDER   = 'openai' | 'anthropic' | 'google'   (default: 'openai')
//   AI_MODEL      = model name override                   (optional)
//   OPENAI_API_KEY      = sk-...     (when provider=openai)
//   ANTHROPIC_API_KEY   = sk-ant-... (when provider=anthropic)
//
// Uses Vercel AI SDK (`ai` package, already in package.json) as the
// abstraction layer. Each provider package (@ai-sdk/openai, @ai-sdk/anthropic)
// is a thin adapter — the actual API call goes through `generateText()` or
// `streamText()` from the `ai` package.
// ============================================================================

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText } from 'ai';
import type { LanguageModel } from 'ai';
import { logger } from '@/lib/logger';

export type AIProvider = 'openai' | 'anthropic';

// ---------------------------------------------------------------------------
// Default model per provider
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.5',
  anthropic: 'claude-sonnet-4-20250514',
};

// ---------------------------------------------------------------------------
// Provider instances (created once, reused)
// ---------------------------------------------------------------------------

let _openai: ReturnType<typeof createOpenAI> | null = null;
let _anthropic: ReturnType<typeof createAnthropic> | null = null;

function getOpenAI() {
  if (!_openai) {
    _openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      // Endpoint selection lives at the model factory (getOpenAI().chat() vs
      // getOpenAI()(...)) — the older `compatibility: 'compatible'` setting
      // was removed from OpenAIProviderSettings in @ai-sdk/openai v3.
    });
  }
  return _openai;
}

function getAnthropic() {
  if (!_anthropic) {
    _anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get the current AI provider name from env.
 */
export function getProviderName(): AIProvider {
  return (process.env.AI_PROVIDER as AIProvider) || 'openai';
}

/**
 * Get a configured LanguageModel for use with Vercel AI SDK's
 * `generateText()` / `streamText()` / `generateObject()`.
 *
 * @param modelOverride  Force a specific model name (e.g. 'gpt-4o-mini'
 *                       for cheaper calls like refine). When omitted, uses
 *                       AI_MODEL env var or the provider's default.
 */
export function getModel(modelOverride?: string): LanguageModel {
  const provider = getProviderName();
  const modelName = modelOverride || process.env.AI_MODEL || DEFAULT_MODELS[provider];

  switch (provider) {
    case 'openai':
      // Use .chat() to force the legacy /v1/chat/completions endpoint.
      // The default `openai(modelName)` factory in @ai-sdk/openai v3 routes
      // to /v1/responses (the new Responses API), which most third-party
      // OpenAI-compatible proxies do NOT implement — they return HTTP 500
      // with `convert_request_failed: not implemented`. The previous
      // `compatibility: 'compatible'` knob was removed from
      // OpenAIProviderSettings in v3.
      return getOpenAI().chat(modelName);
    case 'anthropic':
      return getAnthropic()(modelName);
    default:
      throw new Error(`Unknown AI_PROVIDER: "${provider}". Set to 'openai' or 'anthropic'.`);
  }
}

/**
 * Build OpenAI reasoning provider options for GPT-5.x / o-series models.
 * Returns undefined for non-reasoning models so it can be safely spread.
 * Defaults to 'xhigh' (extra high); override with `AI_REASONING_EFFORT` env.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getReasoningOpts(modelId: string): any {
  if (getProviderName() !== 'openai') return undefined;
  if (!/^gpt-5/i.test(modelId) && !/^o[134]/i.test(modelId)) return undefined;
  const effort = process.env.AI_REASONING_EFFORT || 'xhigh';
  return { openai: { reasoningEffort: effort } };
}

/**
 * Get a cheap/fast model for low-stakes tasks (quality judgment, md refine).
 * Falls back to the main model if no cheap alternative is configured.
 */
export function getCheapModel(): LanguageModel {
  const provider = getProviderName();
  switch (provider) {
    case 'openai':
      return getOpenAI().chat(process.env.AI_CHEAP_MODEL || 'gpt-4o-mini');
    case 'anthropic':
      return getAnthropic()(process.env.AI_CHEAP_MODEL || 'claude-haiku-4-5-20241022');
    default:
      return getModel();
  }
}

// ---------------------------------------------------------------------------
// Unified LLM call helper
// ---------------------------------------------------------------------------
// Some OpenAI-compatible proxies return `content: null` for reasoning
// models (GPT-5.x) in non-streaming mode, but correctly return content in
// streaming mode. This helper detects when OPENAI_BASE_URL is set (proxy)
// and automatically uses streaming + text collection, while direct API calls
// use the simpler generateText() path.
//
// All call sites should use `callLLM()` instead of `generateText()` directly.
// ---------------------------------------------------------------------------

export interface CallLLMParams {
  model?: LanguageModel;
  /** System prompt. String form → treated as fully cacheable static head
   *  (what all current call sites use). Object form lets callers split a
   *  static-cacheable head from a dynamic per-call tail (future use; the
   *  tail stays UNCACHED so Anthropic's prefix match still hits on head). */
  system?: string | { head: string; tail?: string };
  messages: Array<{ role: 'user' | 'assistant'; content: string | Array<{ type: string; [key: string]: unknown }> }>;
  /** Provider-specific options. Passed through to Vercel AI SDK's `providerOptions`. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerOptions?: any;
  /** Optional label for LASCA_TRACE logs — helps distinguish outline vs slide vs md-context. */
  traceStage?: string;
}

/**
 * Provider-aware cache options. Returns the right providerOptions for the
 * current AI_PROVIDER, or undefined if the provider doesn't support caching.
 *
 * - Anthropic: `{ anthropic: { cacheControl: { type: 'ephemeral' } } }` —
 *   applied at top-level generateText providerOptions. The SDK propagates
 *   cacheControl to the system prompt so deck-level static content stays
 *   cached across per-slide calls within the 5-min TTL.
 * - OpenAI: undefined (no equivalent mechanism via Vercel AI SDK).
 *
 * Call sites pass the result as `providerOptions: getCacheOpts()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCacheOpts(): any {
  if (getProviderName() === 'anthropic') {
    return { anthropic: { cacheControl: { type: 'ephemeral' } } };
  }
  return undefined;
}

export interface CallLLMResult {
  text: string;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff for 429/529/network errors
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;

function isRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message;
    // Anthropic / OpenAI rate-limit or overloaded
    if (/429|529|rate.limit|overloaded|too many requests/i.test(msg)) return true;
    // Network errors
    if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network/i.test(msg)) return true;
    // Upstream 5xx / gateway flake: some proxies emit these as
    // { type: 'error', code: 'server_error' } stream chunks. We surface them
    // as thrown Errors with these substrings so the normal retry path rescues
    // single-shot failures instead of collapsing the whole batch.
    if (/server_error|An error occurred while processing/i.test(msg)) return true;
  }
  return false;
}

function getRetryAfterMs(err: unknown): number | null {
  // Some SDKs expose the response headers on the error object
  const headers = (err as { headers?: Record<string, string> })?.headers;
  const ra = headers?.['retry-after'];
  if (ra) {
    const secs = Number(ra);
    if (!isNaN(secs) && secs > 0) return secs * 1000;
  }
  return null;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ---------------------------------------------------------------------------
// Concurrency tracking
// ---------------------------------------------------------------------------
let activeCalls = 0;

/**
 * Extract rate-limit info from response headers (works for both Anthropic and OpenAI).
 */
function extractRateLimitInfo(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;
  const remaining =
    headers['anthropic-ratelimit-requests-remaining'] ||
    headers['x-ratelimit-remaining-requests'];
  const tokensRemaining =
    headers['anthropic-ratelimit-tokens-remaining'] ||
    headers['x-ratelimit-remaining-tokens'];
  const inputTokensRemaining =
    headers['anthropic-ratelimit-input-tokens-remaining'];
  if (!remaining && !tokensRemaining) return undefined;
  return {
    requestsRemaining: remaining,
    tokensRemaining,
    inputTokensRemaining,
  };
}

/**
 * Build a metadata log object from Vercel AI SDK usage/response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLLMLog(usage: any, headers: Record<string, string> | undefined, finishReason: string | undefined, elapsed: number, attempt: number, modelId: string, textLen: number) {
  return {
    model: modelId,
    provider: getProviderName(),
    elapsed: `${elapsed}ms`,
    attempt: attempt + 1,
    activeCalls,
    finishReason,
    // Token usage
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    totalTokens: usage?.totalTokens,
    // Cache (Anthropic)
    cacheRead: usage?.inputTokenDetails?.cacheReadTokens ?? undefined,
    cacheWrite: usage?.inputTokenDetails?.cacheWriteTokens ?? undefined,
    // Reasoning (o1/o3)
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? undefined,
    // Rate limits
    rateLimit: extractRateLimitInfo(headers),
    // Output
    textLen,
  };
}

/**
 * Normalize system input. String → just a system string. Object form lets
 * callers split a static-cacheable head from a dynamic per-call tail; we
 * concatenate them into a single system string (the whole system prompt is
 * deck-level static for Lasca's usage today, so per-call tail splitting is
 * reserved for future use).
 */
function flattenSystem(s: CallLLMParams['system']): { system: string; head: string; tail: string } {
  if (!s) return { system: '', head: '', tail: '' };
  if (typeof s === 'string') return { system: s, head: s, tail: '' };
  const head = s.head ?? '';
  const tail = s.tail ?? '';
  return { system: tail ? `${head}\n\n${tail}` : head, head, tail };
}

/**
 * Call LLM with automatic streaming fallback for proxy services,
 * prompt caching support, retry with exponential backoff, and
 * detailed logging (tokens, cache, rate limits, concurrency).
 */
export async function callLLM(params: CallLLMParams): Promise<CallLLMResult> {
  const model = params.model || getModel();
  const modelId = (model as unknown as { modelId?: string }).modelId || 'unknown';
  const isOpenAIProxy = !!process.env.OPENAI_BASE_URL;
  // Streaming-via-proxy is a workaround for the content:null bug that affects
  // OpenAI **reasoning models** (gpt-5.x / o-series) on third-party proxies.
  // Non-reasoning models (gpt-4o, Kimi, Qwen, DeepSeek, etc.) don't need it,
  // and many OpenAI-compatible proxies have flaky SSE implementations that
  // yield zero stream chunks for these models — manifesting as empty text
  // downstream. So gate the workaround on the model class, not just the
  // presence of OPENAI_BASE_URL.
  const isReasoningModel = /^gpt-5/i.test(modelId) || /^o[134]/i.test(modelId);
  const useProxy = isOpenAIProxy && isReasoningModel;

  const { system, head, tail } = flattenSystem(params.system);

  // Dev-mode trace: double-gated so production can't leak full prompts.
  // NODE_ENV=production closes the outer lock; LASCA_TRACE=1 opts in explicitly.
  if (process.env.NODE_ENV === 'development' && process.env.LASCA_TRACE === '1') {
    try {
      // eslint-disable-next-line no-console
      console.log('[LASCA_TRACE]', JSON.stringify({
        stage: params.traceStage ?? 'unknown',
        model: modelId,
        provider: getProviderName(),
        systemHead: head,
        systemTail: tail || undefined,
        messages: params.messages,
      }, null, 2));
    } catch {
      // Trace logging is best-effort; never break the call
    }
  }

  activeCalls++;
  logger.info('ai', `LLM 调用开始`, { activeCalls, model: modelId, provider: getProviderName() });

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const callStart = Date.now();
      try {
        // Auto-merge reasoning effort with caller-supplied providerOptions.
        // Reasoning kicks in for openai gpt-5.x / o-series; other models noop.
        const reasoningOpts = getReasoningOpts(modelId);
        const mergedProviderOpts = reasoningOpts || params.providerOptions
          ? { ...(params.providerOptions ?? {}), ...(reasoningOpts ?? {}) }
          : undefined;

        // Build common options for both paths
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts: any = {
          model,
          system,
          messages: params.messages,
          ...(mergedProviderOpts ? { providerOptions: mergedProviderOpts } : {}),
        };

        if (useProxy) {
          // Proxy mode: use streaming to avoid content:null issue with reasoning models
          const result = streamText(opts);

          // Collect full text from stream
          let text = '';
          for await (const chunk of result.textStream) {
            text += chunk;
          }

          // Await metadata from the stream (available after stream is consumed).
          // We extract finishReason separately so we can enforce retry on
          // upstream error chunks (see below).
          let streamFinishReason: string | undefined;
          try {
            const usage = await result.usage;
            const response = await result.response;
            const elapsed = Date.now() - callStart;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const headers = (response as any)?.headers as Record<string, string> | undefined;
            streamFinishReason = await result.finishReason;
            logger.info('ai', `LLM 调用完成 (stream)`, buildLLMLog(usage, headers, streamFinishReason, elapsed, attempt, modelId, text.length));
          } catch {
            // Metadata extraction is best-effort; don't break the call
            logger.info('ai', `LLM 调用完成 (stream, metadata unavailable)`, { elapsed: `${Date.now() - callStart}ms`, textLen: text.length });
          }

          // Some upstream proxies can emit { type: 'error', code:
          // 'server_error' } as a stream chunk; the SDK surfaces that as
          // finishReason='error' with empty/partial text instead of a thrown
          // error. Without this throw, callers downstream get an empty string,
          // parseJSON blows up, and the retry loop above never sees anything
          // retryable. Throwing here + isRetryable matching 'server_error'
          // routes the failure through the existing exponential-backoff retry.
          if (streamFinishReason === 'error') {
            throw new Error(`server_error: upstream stream finished with error reason (textLen=${text.length})`);
          }

          // Empty completion with non-error finish reason — observed when a
          // proxy doesn't actually serve the requested model name, when the
          // prompt exceeds the model's context, or when the proxy silently
          // refuses. Without this throw, callers see an empty string and
          // surface a useless "no JSON" error. Treat as server_error so the
          // retry loop kicks in; if it's a permanent config issue, the final
          // thrown message points operators at finishReason + model.
          if (!text.trim()) {
            throw new Error(`server_error: empty completion (model=${modelId}, finishReason=${streamFinishReason ?? 'unknown'}). Likely proxy/model misconfig — verify OPENAI_BASE_URL serves AI_MODEL.`);
          }

          return { text };
        }

        // Direct API mode: use generateText (simpler, no streaming overhead)
        const result = await generateText(opts);
        const elapsed = Date.now() - callStart;

        // Log detailed metadata
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const headers = (result.response as any)?.headers as Record<string, string> | undefined;
          logger.info('ai', `LLM 调用完成`, buildLLMLog(result.usage, headers, result.finishReason, elapsed, attempt, modelId, result.text?.length || 0));
        } catch {
          logger.info('ai', `LLM 调用完成 (metadata unavailable)`, { elapsed: `${elapsed}ms`, textLen: result.text?.length });
        }

        // Same empty-completion guard as the proxy/stream path above.
        if (!result.text?.trim()) {
          throw new Error(`server_error: empty completion (model=${modelId}, finishReason=${result.finishReason ?? 'unknown'}). Likely API/model misconfig — verify OPENAI_API_KEY and AI_MODEL.`);
        }

        return { text: result.text };
      } catch (err) {
        if (attempt < MAX_RETRIES && isRetryable(err)) {
          const retryAfter = getRetryAfterMs(err);
          const delay = retryAfter ?? INITIAL_DELAY_MS * Math.pow(2, attempt);
          logger.warn('ai', `LLM 重试`, {
            attempt: attempt + 1,
            maxRetries: MAX_RETRIES,
            model: modelId,
            error: (err as Error).message,
            retryDelay: `${delay}ms`,
            retryAfterHeader: retryAfter ? `${retryAfter}ms` : null,
          });
          await sleep(delay);
          continue;
        }
        logger.error('ai', `LLM 调用失败`, {
          model: modelId,
          attempt: attempt + 1,
          error: (err as Error).message,
          activeCalls,
        });
        throw err;
      }
    }
    // Unreachable, but TypeScript needs it
    throw new Error('callLLM: exhausted retries');
  } finally {
    activeCalls--;
  }
}
