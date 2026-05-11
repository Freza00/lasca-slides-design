import { NextRequest, NextResponse } from 'next/server';
import { callLLM, getModel } from '@/lib/ai/model';
import { checkRateLimit, checkBodySize, getClientIp } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { verifyToken } from '@/lib/auth';
import { getUserById, touchLastActive, checkAndIncrementAiCalls, logEvent } from '@/lib/db';
import type { MdContext, MdContextPage } from '@/lib/ai/harness/types';
import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';

const DECK_SYSTEM_PROMPT_ZH = `你是 Lasca 的大纲编辑助手。用户正在编辑一份演示文稿的大纲（md-context）。

你的任务：根据用户的指令修改大纲，返回修改后的完整大纲。

规则：
0. **语言匹配（最高优先，不可违反）**：严格跟随当前大纲的主要语言输出。大纲以英文为主 → 全英文回复（包括 pages 内容、summary、changes）；以中文为主 → 全中文；中英混合 → 保留原混合，绝不把用户原文翻译成另一种语言。即使用户用中文给你发指令，大纲若为英文，回复仍必须全英文。
1. 只修改用户要求修改的部分，保留其他内容不变
2. 如果用户要求添加页面，在合理位置插入
3. 如果用户要求删除页面，直接移除
4. 如果用户要求重新排序，调整 pages 数组顺序
5. 如果用户要求修改标题/内容，只改指定的字段
6. 返回的 pages 数组中每个 page 必须有 title、corePoint、body 三个字段。可选字段：subPoints（论据，对核心观点的支撑阐述）、evidence（数据/引证）
7. 返回 JSON 格式

返回格式：
{
  "pages": [{ "title": "...", "corePoint": "...", "body": "..." }],
  "summary": "一句话描述修改了什么",
  "changes": ["修改1", "修改2"]
}`;

const PAGE_SYSTEM_PROMPT_ZH = `你是 Lasca 的大纲编辑助手。用户要求你修改演示文稿大纲中的某一页。

规则：
0. **语言匹配（最高优先，不可违反）**：严格跟随当前页面的主要语言输出（page 字段内容 + summary 都遵守此规则）。页面以英文为主 → 全英文回复；以中文为主 → 全中文；混合 → 保留原混合。即使用户用中文下指令，页面若为英文，回复仍必须全英文。
1. 只修改这一页的内容
2. 保留 title、corePoint、body 三个字段的结构
3. 论据（subPoints）每条一行，用 "- **关键词** — 说明" 格式，每条都是对核心观点的支撑性阐述
4. 返回 JSON 格式

返回格式：
{
  "page": { "title": "...", "corePoint": "...", "body": "..." },
  "summary": "一句话描述修改了什么"
}`;

const DECK_SYSTEM_PROMPT_EN = `You are Lasca's outline editor. The user is editing a presentation/report outline (md-context).

Your task: update the outline according to the user's instruction and return the full revised outline.

Rules:
0. **Language matching (highest priority, non-negotiable):** Match the outline's existing primary language. If the outline is primarily English, reply entirely in English (pages content, summary, and changes). If primarily Chinese, reply entirely in Chinese. If mixed, preserve the mix — never translate the user's words into the other language. Even if the user writes the instruction in a different language, still output in the outline's language.
1. Only change what the user asked for.
2. Insert new pages in a sensible place when asked.
3. Remove pages directly when asked.
4. Reorder the pages array when asked.
5. If the user asks to revise copy, only update the relevant fields.
6. Every page in the returned pages array must include title, corePoint, and body. Optional fields: subPoints and evidence.
7. Return JSON only.

Return format:
{
  "pages": [{ "title": "...", "corePoint": "...", "body": "..." }],
  "summary": "One sentence summary of what changed",
  "changes": ["Change 1", "Change 2"]
}`;

const PAGE_SYSTEM_PROMPT_EN = `You are Lasca's outline editor. The user wants you to revise one specific page in an outline.

Rules:
0. **Language matching (highest priority, non-negotiable):** Match the page's existing primary language (page fields and summary). If the page is primarily English, reply entirely in English. If primarily Chinese, reply entirely in Chinese. If mixed, preserve the mix — never translate. Even if the user writes the instruction in a different language, still output in the page's language.
1. Only modify that page.
2. Preserve the title, corePoint, and body structure.
3. If subPoints are present, format each one as "- **Keyword** — explanation".
4. Return JSON only.

Return format:
{
  "page": { "title": "...", "corePoint": "...", "body": "..." },
  "summary": "One sentence summary of what changed"
}`;

export async function POST(request: NextRequest) {
  const tooBig = checkBodySize(request, 50 * 1024);
  if (tooBig) return tooBig;
  const rateLimited = checkRateLimit(getClientIp(request), 'outline-chat', 10);
  if (rateLimited) return rateLimited;

  const body = await request.json() as {
    mdContext: MdContext;
    message: string;
    scope: 'deck' | 'page';
    pageIndex?: number;
    history?: { role: string; content: string }[];
    locale?: Locale;
  };
  const locale: Locale = body.locale ?? DEFAULT_LOCALE;

  if (!body.message?.trim()) {
    return NextResponse.json({ error: locale === 'en' ? 'Message is required' : '消息不能为空' }, { status: 400 });
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
    await logEvent(user.id, null, 'ai_outline_chat', {
      scope: body.scope,
      pageIndex: body.pageIndex ?? null,
      locale,
    });
  }

  logger.info('ai', 'outline-chat', { scope: body.scope, pageIndex: body.pageIndex, msgLen: body.message.length });

  try {
    if (body.scope === 'page' && body.pageIndex !== undefined) {
      // Page-scoped edit
      const page = body.mdContext.pages[body.pageIndex];
      if (!page) {
        return NextResponse.json({ error: locale === 'en' ? 'Page does not exist' : '页面不存在' }, { status: 400 });
      }

      const result = await callLLM({
        model: getModel(),
        system: locale === 'en' ? PAGE_SYSTEM_PROMPT_EN : PAGE_SYSTEM_PROMPT_ZH,
        messages: [
          {
            role: 'user',
            content: locale === 'en'
              ? `Current page:\nTitle: ${page.title}\nCore point: ${page.corePoint}${page.subPoints?.length ? `\nSub-points:\n${page.subPoints.map(s => `- ${s}`).join('\n')}` : ''}${page.evidence?.length ? `\nEvidence:\n${page.evidence.map(e => `> ${e}`).join('\n')}` : ''}\nBody:\n${page.body}\n\nUser instruction: ${body.message}`
              : `当前页面内容：\n标题: ${page.title}\n核心观点（论点）: ${page.corePoint}${page.subPoints?.length ? `\n论据:\n${page.subPoints.map(s => `- ${s}`).join('\n')}` : ''}${page.evidence?.length ? `\n数据/引证:\n${page.evidence.map(e => `> ${e}`).join('\n')}` : ''}\n正文:\n${page.body}\n\n用户指令: ${body.message}`,
          },
        ],
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: locale === 'en' ? 'Failed to parse response' : '解析失败' }, { status: 500 });
      }

      const parsed = JSON.parse(jsonMatch[0]) as { page: MdContextPage; summary: string };
      return NextResponse.json({
        page: parsed.page,
        summary: parsed.summary || (locale === 'en' ? 'Updated' : '已更新'),
      });
    } else {
      // Deck-scoped edit
      const pagesStr = body.mdContext.pages.map((p, i) =>
        locale === 'en'
          ? `Page ${i + 1}: ${p.title}\n  Core point: ${p.corePoint}\n  Body:\n${p.body.split('\n').map(l => '    ' + l).join('\n')}`
          : `第 ${i + 1} 页: ${p.title}\n  核心观点: ${p.corePoint}\n  正文:\n${p.body.split('\n').map(l => '    ' + l).join('\n')}`
      ).join('\n\n');

      const messages: { role: 'user' | 'assistant'; content: string }[] = [
        ...(body.history ?? []).map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        {
          role: 'user' as const,
          content: locale === 'en'
            ? `Current outline (${body.mdContext.pages.length} pages):\n\n${pagesStr}\n\nUser instruction: ${body.message}`
            : `当前大纲（共 ${body.mdContext.pages.length} 页）:\n\n${pagesStr}\n\n用户指令: ${body.message}`,
        },
      ];

      const result = await callLLM({
        model: getModel(),
        system: locale === 'en' ? DECK_SYSTEM_PROMPT_EN : DECK_SYSTEM_PROMPT_ZH,
        messages,
      });

      const text = result.text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return NextResponse.json({ error: locale === 'en' ? 'Failed to parse response' : '解析失败' }, { status: 500 });
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        pages: MdContextPage[];
        summary: string;
        changes: string[];
      };

      return NextResponse.json({
        pages: parsed.pages,
        summary: parsed.summary || (locale === 'en' ? 'Updated' : '已更新'),
        changes: parsed.changes || [],
      });
    }
  } catch (err) {
    logger.error('ai', 'outline-chat failed', { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
