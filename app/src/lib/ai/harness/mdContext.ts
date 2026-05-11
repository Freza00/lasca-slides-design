// ============================================================================
// Lasca AI Harness — md-context Skill (rawInput → MdContext)
// ============================================================================
// 一句 prompt + 一次 LLM 调用。
//
// 用户给什么格式都行（散文、bullet 列表、完美 canonical md、一句话 topic），
// LLM 把它整理成 canonical md，纯函数 parse 输出，done。
//
// 不做 layout / 审美决策。用户显式写的 `> hint:` / frontmatter `preset:` 提取
// 到 MdContext.demands，和内容分开。
// ============================================================================

import { callLLM, getModel } from '../model';
import { LAYOUT_REGISTRY, type Layout } from '../../types';
import type { Locale } from '../../i18n';
import { mdContextSystemPrompt, planOutlineSystemPrompt } from '../prompts';
import { STYLE_PRESETS } from './stylePresets';
import { buildPreferencesBlock } from './selectorRules';
import type {
  ChangeLevel,
  DeckFrontmatter,
  MdContext,
  MdContextPage,
  MdContextWarning,
  UserDemand,
  StylePresetId,
  PlanOutline,
  PlanPage,
  PageType,
} from './types';

// ----------------------------------------------------------------------------
// Layout validation (inlined from deleted mdContextHeuristics.ts)
// ----------------------------------------------------------------------------

// Any slide layout (non-report, non-faithful) is an acceptable `> hint:`.
// Derived from LAYOUT_REGISTRY so the accept-list stays in sync with
// buildLayoutList() in prompts.ts — if a layout is shown to the LLM in
// the prompt, we must accept it back in the hint. Previously this was a
// hardcoded 8-item list; LLM hints like `title-body`, `steps`, `bar-chart`
// were silently dropped and the page fell back to rule-based inference.
const HINTABLE_SLIDE_LAYOUTS: ReadonlySet<string> = new Set(
  LAYOUT_REGISTRY
    .filter(m => !m.layout.startsWith('report-') && !m.layout.endsWith('-faithful'))
    .map(m => m.layout),
);

function isHintableSlideLayout(s: string): s is Layout {
  return HINTABLE_SLIDE_LAYOUTS.has(s);
}

// Channel-partitioned preset id sets — derived from STYLE_PRESETS so they
// stay in sync automatically when presets are added/removed/retagged.
// `isValidPreset` checks any-channel; the more specific isValidSlidePreset /
// isValidReportPreset enforce channel during validation.
const VALID_SLIDE_PRESETS: readonly string[] = Object.values(STYLE_PRESETS)
  .filter(p => p.format === 'slide').map(p => p.id);
const VALID_REPORT_PRESETS: readonly string[] = Object.values(STYLE_PRESETS)
  .filter(p => p.format === 'report').map(p => p.id);
const VALID_PRESETS: readonly string[] = [...VALID_SLIDE_PRESETS, ...VALID_REPORT_PRESETS];

function isValidPreset(s: string): s is StylePresetId {
  return VALID_PRESETS.includes(s);
}

// ----------------------------------------------------------------------------
// Parse canonical md (LLM output → structured data)
// ----------------------------------------------------------------------------

interface ParsedCanonical {
  frontmatter: DeckFrontmatter;
  pages: Array<{ title: string; body: string; pageType?: string }>;
}

/** Simple YAML subset: only `key: value` lines, values are string or number. */
function parseYamlFrontmatter(text: string): DeckFrontmatter {
  const out: DeckFrontmatter = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([a-zA-Z][\w-]*)\s*:\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value: string | number = m[2].trim();
    if (/^['"].*['"]$/.test(value)) value = value.slice(1, -1);
    if (key === 'pageCount') {
      const n = parseInt(String(value), 10);
      if (Number.isFinite(n)) out.pageCount = n;
      continue;
    }
    if (key === 'title' || key === 'audience' || key === 'preset' || key === 'tone') {
      (out as Record<string, string>)[key] = String(value);
    }
  }
  return out;
}

function splitByHeading(
  body: string,
  headingRe: RegExp,
): Array<{ title: string; body: string; pageType?: string }> {
  const lines = body.split('\n');
  const pages: Array<{ title: string; body: string; pageType?: string }> = [];
  let current: { title: string; bodyLines: string[]; pageType?: string } | null = null;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current) pages.push({ title: current.title, body: current.bodyLines.join('\n').trim(), pageType: current.pageType });
      let rawTitle = m[1].trim();
      let pageType: string | undefined;
      // Extract [type: xxx] tag from title
      const typeMatch = rawTitle.match(/\s*\[type:\s*([\w-]+)\]\s*/i);
      if (typeMatch) {
        pageType = typeMatch[1].toLowerCase();
        rawTitle = rawTitle.replace(typeMatch[0], '').trim();
      }
      current = { title: rawTitle, bodyLines: [], pageType };
    } else if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) pages.push({ title: current.title, body: current.bodyLines.join('\n').trim(), pageType: current.pageType });
  return pages;
}

function parseCanonicalMd(text: string): ParsedCanonical {
  const trimmed = text.trim();
  if (!trimmed) return { frontmatter: {}, pages: [] };

  let frontmatter: DeckFrontmatter = {};
  let body = trimmed;
  const fmMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (fmMatch) {
    frontmatter = parseYamlFrontmatter(fmMatch[1]);
    body = fmMatch[2].trim();
  }

  // Canonical form: one # H1 per page. Split on H1 first.
  const h1Pages = splitByHeading(body, /^#\s+(.+?)\s*$/);
  if (h1Pages.length >= 2) return { frontmatter, pages: h1Pages };

  // Fallback: input has <2 H1s but may use ## as section boundaries (common for
  // user-pasted docs with one # doc-title + many ## chapters). Mirrors the
  // useH2 heuristic in orchestrator.ts inferSlideStructure — detection and
  // parsing must agree on which heading level denotes a page.
  const h2Pages = splitByHeading(body, /^##\s+(.+?)\s*$/);
  if (h2Pages.length >= 2) return { frontmatter, pages: h2Pages };

  return { frontmatter, pages: h1Pages };
}

// ----------------------------------------------------------------------------
// Extract demands from parsed pages (only explicit user directives)
// ----------------------------------------------------------------------------

function extractDemandsFromPages(
  rawPages: Array<{ title: string; body: string; pageType?: string }>,
  frontmatter: DeckFrontmatter,
): { pages: MdContextPage[]; demands: UserDemand } {
  const pageLayouts: Record<number, Layout> = {};
  // 宪法 §2：仅 4 种 pageType。旧 keyword（toc/data/qa/case-study/summary/transition/end/section-cover）
  // 不再兼容——硬切换（用户确认）。旧 markdown 的 [type: xxx] 标签将被忽略、降级为 undefined。
  const VALID_PAGE_TYPES: ReadonlyArray<string> = ['cover', 'section', 'content', 'back'];

  const pages: MdContextPage[] = rawPages.map((page, idx) => {
    // Pull out `> hint:`, `> note:`, `> evidence`, `## subtitle` lines
    const lines = page.body.split('\n');
    const kept: string[] = [];
    let notes: string | undefined;
    let subtitle: string | undefined;
    const subPoints: string[] = [];
    const evidence: string[] = [];

    for (const line of lines) {
      // > hint: layout
      const hint = line.match(/^>\s*hint\s*:\s*([\w-]+)\s*$/i);
      if (hint) {
        const val = hint[1].trim();
        if (isHintableSlideLayout(val)) pageLayouts[idx] = val;
        continue;
      }
      // > note: speaker notes
      const note = line.match(/^>\s*note\s*:\s*(.+?)\s*$/i);
      if (note) {
        notes = (notes ? notes + '\n' : '') + note[1].trim();
        continue;
      }
      // ## subtitle
      const sub = line.match(/^##\s+(.+?)\s*$/);
      if (sub && !subtitle) {
        subtitle = sub[1].trim();
        continue;
      }
      // > evidence/data (not hint/note)
      const ev = line.match(/^>\s+(.+?)\s*$/);
      if (ev) {
        evidence.push(ev[1].trim());
        continue;
      }
      // - **subpoint** — description (bold bullet = subpoint)
      const sp = line.match(/^-\s+\*\*(.+?)\*\*\s*(?:—|–|-)\s*(.+?)\s*$/);
      if (sp) {
        subPoints.push(`**${sp[1]}** — ${sp[2]}`);
        kept.push(line); // also keep in body for backward compat
        continue;
      }
      kept.push(line);
    }

    const cleanBody = kept.join('\n').trim();
    const bodyLines = cleanBody.split('\n');
    const corePoint = bodyLines[0]?.trim() || page.title;
    const bodyRest = bodyLines.slice(1).join('\n').trim();

    // Validate page type. `end` is accepted as an alias for `back` because the
    // LLM sometimes emits the older tag (and early prompt revisions used it).
    const rawType = page.pageType === 'end' ? 'back' : page.pageType;
    const pageType = rawType && VALID_PAGE_TYPES.includes(rawType)
      ? rawType as MdContextPage['pageType']
      : undefined;

    return {
      title: page.title,
      subtitle: subtitle || undefined,
      corePoint,
      subPoints: subPoints.length > 0 ? subPoints : undefined,
      evidence: evidence.length > 0 ? evidence : undefined,
      body: bodyRest,
      notes,
      pageType,
    };
  });

  const demands: UserDemand = {};
  if (frontmatter.preset && isValidPreset(frontmatter.preset)) {
    demands.preset = frontmatter.preset;
  }
  if (Object.keys(pageLayouts).length > 0) {
    demands.pageLayouts = pageLayouts;
  }

  return { pages, demands };
}

// ----------------------------------------------------------------------------
// Change level (structural comparison: raw input vs LLM output)
// ----------------------------------------------------------------------------

function computeChangeLevel(rawInput: string, llmParsed: ParsedCanonical): ChangeLevel {
  const rawParsed = parseCanonicalMd(rawInput);
  const rawPageCount = rawParsed.pages.length;
  const llmPageCount = llmParsed.pages.length;

  // If raw input was already perfect canonical with similar page count → none
  if (rawParsed.frontmatter.title && rawPageCount > 0 && rawPageCount === llmPageCount) {
    return 'none';
  }
  // Some structure existed → light
  if (rawPageCount > 0) {
    return 'light';
  }
  // Raw input had no H1 structure at all → heavy
  return 'heavy';
}

// ----------------------------------------------------------------------------
// Main entry
// ----------------------------------------------------------------------------

/**
 * md-context skill: 一次 LLM 调用把任意用户输入整理成 canonical md。
 *
 * 不变式：
 *   1. 永远调 LLM，永远返回可显示的 canonicalMd
 *   2. demands 里只有用户显式写的东西
 *   3. 不做 layout / 审美决策
 */
/** Strip markdown code fences that LLMs sometimes wrap around output. */
function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:markdown|md)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/** Validate that parsed output looks like a usable md-context. */
function isUsableOutput(parsed: ParsedCanonical): boolean {
  return parsed.pages.length > 0
    && parsed.pages.every(p => p.title.length > 0);
}

// ----------------------------------------------------------------------------
// LLM1 自审核：纯函数检查 md-context 质量（不触发重试，只标 warning）
// ----------------------------------------------------------------------------

function reviewMdContext(parsed: ParsedCanonical, rawInput: string): MdContextWarning[] {
  const warnings: MdContextWarning[] = [];

  // MC_TITLE_EXISTS: deck 标题非空
  if (!parsed.frontmatter.title?.trim()) {
    warnings.push({ ruleId: 'MC_TITLE_EXISTS', severity: 'warning', message: '缺少 deck 标题（frontmatter.title）' });
  }

  // MC_PAGE_COUNT_MATCH: frontmatter.pageCount 匹配实际页数
  if (parsed.frontmatter.pageCount !== undefined && parsed.frontmatter.pageCount !== parsed.pages.length) {
    warnings.push({
      ruleId: 'MC_PAGE_COUNT_MATCH', severity: 'warning',
      message: `frontmatter 声明 ${parsed.frontmatter.pageCount} 页，实际 ${parsed.pages.length} 页`,
    });
  }

  // MC_USER_PAGE_COUNT: 用户原文 "N 页" 匹配实际页数
  const rawMatch = rawInput.match(/(\d+)\s*页/);
  if (rawMatch) {
    const userWants = parseInt(rawMatch[1], 10);
    if (userWants > 0 && userWants !== parsed.pages.length) {
      warnings.push({
        ruleId: 'MC_USER_PAGE_COUNT', severity: 'warning',
        message: `用户要求 ${userWants} 页，实际生成 ${parsed.pages.length} 页`,
      });
    }
  }

  // MC_VALID_PRESET: frontmatter.preset 合法
  if (parsed.frontmatter.preset && !isValidPreset(parsed.frontmatter.preset)) {
    warnings.push({
      ruleId: 'MC_VALID_PRESET', severity: 'warning',
      message: `未知 preset "${parsed.frontmatter.preset}"，将忽略`,
    });
  }

  // Per-page checks
  const titlesSeen = new Map<string, number>();
  for (let i = 0; i < parsed.pages.length; i++) {
    const page = parsed.pages[i];

    // Skip content validation for cover and back pages (they only need title + optional subtitle)
    const isCoverOrEnd = page.pageType === 'cover' || page.pageType === 'back';

    // MC_CORE_POINT: 每页有非空 corePoint（body 第一行）— error 级别，触发自检修复
    const bodyLines = page.body.split('\n').filter(l => !l.match(/^>\s*(hint|note)\s*:/i));
    const firstLine = bodyLines[0]?.trim();
    if (!isCoverOrEnd && !firstLine) {
      warnings.push({
        ruleId: 'MC_CORE_POINT', severity: 'error', pageIndex: i,
        message: `第 ${i + 1} 页缺少核心观点（body 首行为空）`,
      });
    }

    // MC_HAS_BULLETS: 每页有支撑内容（body 不止一行）
    const contentLines = bodyLines.filter(l => l.trim().length > 0);
    if (!isCoverOrEnd && contentLines.length < 2) {
      warnings.push({
        ruleId: 'MC_HAS_BULLETS', severity: 'warning', pageIndex: i,
        message: `第 ${i + 1} 页只有标题和核心观点，缺少支撑内容（bullet）`,
      });
    }

    // MC_DUPLICATE_TITLES: 无重复标题
    const normalizedTitle = page.title.trim().toLowerCase();
    if (titlesSeen.has(normalizedTitle)) {
      warnings.push({
        ruleId: 'MC_DUPLICATE_TITLES', severity: 'warning', pageIndex: i,
        message: `第 ${i + 1} 页标题"${page.title}"与第 ${(titlesSeen.get(normalizedTitle)!) + 1} 页重复`,
      });
    }
    titlesSeen.set(normalizedTitle, i);
  }

  return warnings;
}

export async function buildMdContext(
  rawInput: string,
  opts?: {
    defaultPageCount?: number;
    /**
     * When user picks Auto: heuristic-derived soft range. LLM sees suggested +
     * min/max, picks its own count based on actual source depth. Mutually
     * exclusive with `defaultPageCount` (explicit user pick takes priority).
     */
    pageCountRange?: { min: number; max: number; suggested: number };
    audience?: string;
    density?: string;
    dataEmphasis?: string;
    keyTakeaway?: string;
    purpose?: string;
    narrative?: string;
    evidence?: string;
    locale?: Locale;
    /** Unknown-key answers + extra-note, surfaced via buildPreferencesBlock. */
    freeFormHints?: Record<string, string>;
    /** Polish mode: prepend a hard-constraint block to the user message that
     *  forbids the LLM from dropping or merging paragraphs. Only typo /
     *  phrasing fixes, implicit-heading restoration, and connective-word
     *  additions are allowed. See ModeChooser. */
    polishMode?: boolean;
  },
): Promise<MdContext> {
  let canonicalMd = '';

  // Inject page count constraint into user message if specified
  // Note: defaultPageCount = TOTAL pages (including cover and end)
  const pageCountHint = opts?.defaultPageCount
    ? (opts?.locale === 'en'
        ? `\n\n[🚨 Hard constraint: total pages must be exactly ${opts.defaultPageCount} (including cover and back). One [type: cover], one [type: back], and ${opts.defaultPageCount - 2} body pages — each body page is either [type: section] (TOC / divider / navigational) or [type: content] (everything else). If a plan is given, mirror its per-page [type: xxx] exactly.]`
        : `\n\n[🚨 硬约束：总页数必须恰好为 ${opts.defaultPageCount} 页（包含封面和尾页）。其中封面 [type: cover] 1 页，尾页 [type: back] 1 页，中间 ${opts.defaultPageCount - 2} 页是正文页——每页是 [type: section]（目录/分隔/导航类）或 [type: content]（其它正文）之一。若给了 plan，严格沿用每页的 [type: xxx] 标注。]`)
    : opts?.pageCountRange
      ? (opts?.locale === 'en'
          ? `\n\n[Page count guidance: you decide based on the actual source depth. Suggested ~${opts.pageCountRange.suggested} pages; must fall within [${opts.pageCountRange.min}, ${opts.pageCountRange.max}] including cover and back. A dense data-heavy section (e.g., 1500+ source chars with multiple tables or stat clusters) generally needs 2-4 pages; do not compress it into one "4 stat cards" page. Always include one [type: cover] and one [type: back]; everything in between is [type: section] or [type: content].]`
          : `\n\n[页数指引：由你根据原文实际深度决定。建议 ~${opts.pageCountRange.suggested} 页；必须落在 [${opts.pageCountRange.min}, ${opts.pageCountRange.max}] 区间（包含封面和尾页）。数据密集的 section（如原文 1500+ 字、含多张表/多组指标）通常需要 2-4 页展开，不要压缩成单张"4 个数字卡"页。始终包含 [type: cover] 1 页 + [type: back] 1 页；中间是 [type: section] 或 [type: content]。]`)
      : '';

  // Inject clarifier answers so LLM1 knows user preferences when structuring content.
  // buildPreferencesBlock pulls from selectorRules.ts SSOT — labels AND full rules,
  // so LLM1 sees WHAT the user picked AND the directive it implies.
  const prefsBlock = buildPreferencesBlock({
    purpose: opts?.purpose,
    narrative: opts?.narrative,
    evidence: opts?.evidence,
    audience: opts?.audience,
    density: opts?.density,
    keyTakeaway: opts?.keyTakeaway,
    dataEmphasis: opts?.dataEmphasis,
  }, opts?.freeFormHints, opts?.locale);

  const prefsHeader = opts?.locale === 'en' ? '[User preferences]' : '[用户偏好]';
  const prefsHint = prefsBlock ? `\n\n${prefsHeader}\n${prefsBlock}` : '';

  // Polish-mode hard constraint. The user picked "Let AI polish" — they
  // want their content kept verbatim except for trivial fixes. This block
  // is intentionally directive and uses the 🚨 marker so it sits at the
  // same priority level as the page-count constraint above. The content
  // promise here is the user-facing meaning of "polish" and must not
  // silently weaken: every paragraph must survive into the final mdContext.
  const polishHint = opts?.polishMode
    ? (opts?.locale === 'en'
        ? `\n\n[🚨 POLISH MODE — preserve user content exactly:
- DO NOT delete, merge, summarize, or paraphrase any user paragraph. Every paragraph in the source must appear in the output, in the same order.
- DO NOT invent new sections, new bullet points, or new factual content.
- ALLOWED edits: fix typos, smooth phrasing, add connective words ("specifically", "in addition"), promote bold-only short lines that look like section titles to ## headings.
- When unsure whether something is a heading vs. an emphasized paragraph, KEEP IT AS A PARAGRAPH (do not promote).
- Body text language and figures (numbers, percentages, names, dates) must stay byte-identical to the source.]`
        : `\n\n[🚨 润色模式 — 必须原样保留用户内容：
- 禁止删除、合并、概括或改写任何用户段落。原文每个段落必须按原顺序出现在输出里。
- 禁止凭空新增章节、新增列表项、新增事实性内容。
- 允许的编辑：修错别字、改顺通顺、补连接词（"具体而言"、"此外"等）、把单行整体加粗看起来像标题的段落 promote 成 ## 标题。
- 拿不准某段是标题还是强调段落时，**保留为段落**（不要 promote）。
- 正文文字、数字、百分比、人名、日期必须与原文逐字相同。]`)
    : '';

  // 1. LLM call — try up to 2 times
  let prevPageCount: number | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      // On retry after page count mismatch, add a stronger correction hint
      let retryHint = '';
      if (attempt === 2 && prevPageCount !== undefined) {
        if (opts?.defaultPageCount) {
          retryHint = opts?.locale === 'en'
            ? `\n\n[🚨 Last attempt produced ${prevPageCount} pages. The hard constraint requires exactly ${opts.defaultPageCount} pages (including cover and back). You must output exactly ${opts.defaultPageCount - 2} body-page H1s (each tagged [type: section] or [type: content]) plus one [type: cover] H1 and one [type: back] H1, for ${opts.defaultPageCount} H1s total.]`
            : `\n\n[🚨 上次生成了 ${prevPageCount} 页，硬约束要求总页数恰好为 ${opts.defaultPageCount} 页（包含封面和尾页）。必须恰好 ${opts.defaultPageCount - 2} 个正文 H1（每个标注 [type: section] 或 [type: content]），加上 [type: cover] 和 [type: back] 各 1 个，共 ${opts.defaultPageCount} 个 H1。]`;
        } else if (opts?.pageCountRange) {
          const r = opts.pageCountRange;
          retryHint = opts?.locale === 'en'
            ? `\n\n[🚨 Last attempt produced ${prevPageCount} pages, outside the allowed range [${r.min}, ${r.max}]. Re-output with total pages in [${r.min}, ${r.max}], preferring ~${r.suggested}.]`
            : `\n\n[🚨 上次生成了 ${prevPageCount} 页，不在允许区间 [${r.min}, ${r.max}] 内。请重新输出，总页数落在 [${r.min}, ${r.max}]，接近 ${r.suggested} 最佳。]`;
        }
      }

      const { text } = await callLLM({
        model: getModel(),
        system: mdContextSystemPrompt(opts?.locale),
        messages: [{ role: 'user', content: rawInput + pageCountHint + prefsHint + polishHint + retryHint }],
      });
      const cleaned = stripCodeFence(text || '');
      const testParse = parseCanonicalMd(cleaned);

      if (isUsableOutput(testParse)) {
        const gotPages = testParse.pages.length;
        // Hard-constraint path (explicit user length): retry if delta > ±2.
        if (opts?.defaultPageCount) {
          const PAGE_COUNT_TOLERANCE = 2;
          if (
            Math.abs(gotPages - opts.defaultPageCount) > PAGE_COUNT_TOLERANCE &&
            attempt < 2
          ) {
            console.warn(`[md-context] attempt ${attempt}: 页数差异较大 (want ${opts.defaultPageCount}, got ${gotPages}), retrying...`);
            prevPageCount = gotPages;
            continue;
          }
        } else if (opts?.pageCountRange) {
          // Soft-range path (Auto mode): retry only if outside [min, max].
          const r = opts.pageCountRange;
          if ((gotPages < r.min || gotPages > r.max) && attempt < 2) {
            console.warn(`[md-context] attempt ${attempt}: 页数 ${gotPages} 超出区间 [${r.min}, ${r.max}], retrying...`);
            prevPageCount = gotPages;
            continue;
          }
        }
        canonicalMd = cleaned;
        break; // success
      }

      // LLM returned something but it's not usable (no pages, no titles)
      console.warn(`[md-context] attempt ${attempt}: LLM output has no usable pages, ${attempt < 2 ? 'retrying...' : 'giving up'}`);
    } catch (err) {
      console.warn(`[md-context] attempt ${attempt} failed:`, (err as Error).message);
    }
  }

  if (!canonicalMd) {
    console.warn('[md-context] All attempts failed, falling back to raw input');
  }

  // 2. Parse — use LLM output if available, otherwise parse raw input directly
  const source = canonicalMd || rawInput;
  const parsed = parseCanonicalMd(source);
  if (!canonicalMd) {
    canonicalMd = rawInput.trim();
  }

  // 3. Extract demands from explicit user directives
  const { pages, demands } = extractDemandsFromPages(parsed.pages, parsed.frontmatter);

  // Helper: trim pages array to target count (cover + N content + back)
  const applyPageCountTrim = (pagesArray: MdContextPage[], totalTarget: number, frontmatter: any, locale: Locale | undefined) => {
    const isEn = locale === 'en';
    const contentTarget = totalTarget - 2; // Subtract cover and back
    const coverPage = pagesArray.find(p => p.pageType === 'cover');
    const endPage = pagesArray.find(p => p.pageType === 'back');
    const contentPages = pagesArray.filter(p => p.pageType !== 'cover' && p.pageType !== 'back');

    const finalCover = coverPage || {
      title: frontmatter.title || (isEn ? 'Cover' : '封面'),
      corePoint: '',
      body: '',
      pageType: 'cover' as const,
    };
    const finalEnd = endPage || {
      title: isEn ? 'Thank you' : '谢谢',
      corePoint: '',
      body: '',
      pageType: 'back' as const,
    };

    if (contentPages.length < contentTarget) {
      console.warn(`[md-context] LLM generated ${contentPages.length} content pages, target was ${contentTarget}, padding...`);
      while (contentPages.length < contentTarget) {
        contentPages.push({
          title: isEn ? `Content ${contentPages.length + 1}` : `内容页 ${contentPages.length + 1}`,
          corePoint: '',
          body: '',
          pageType: 'content' as const,
        });
      }
    } else if (contentPages.length > contentTarget) {
      contentPages.splice(contentTarget);
      console.log(`[md-context] Trimmed to ${contentTarget} content pages`);
    }

    pagesArray.length = 0;
    pagesArray.push(finalCover, ...contentPages, finalEnd);
  };

  // 3b. pageCount 硬约束：LLM 生成页数不对时，裁剪到目标页数
  // Note: opts.defaultPageCount = TOTAL pages (including cover and end)
  if (opts?.defaultPageCount && opts.defaultPageCount > 0) {
    applyPageCountTrim(pages, opts.defaultPageCount, parsed.frontmatter, opts?.locale);
    parsed.frontmatter.pageCount = pages.length;
  } else {
    // Range mode: don't force a count. Still guarantee cover + back exist
    // (architecture invariant — every deck has both). Use a target that keeps
    // all LLM-produced content pages as-is; only fabricates cover/back if the
    // LLM omitted them.
    const hasCover = pages.some(p => p.pageType === 'cover');
    const hasBack = pages.some(p => p.pageType === 'back');
    const contentCount = pages.filter(p => p.pageType !== 'cover' && p.pageType !== 'back').length;
    const targetTotal = contentCount + 2; // always cover + content + back
    if (!hasCover || !hasBack || pages.length !== targetTotal) {
      applyPageCountTrim(pages, targetTotal, parsed.frontmatter, opts?.locale);
    }
    parsed.frontmatter.pageCount = pages.length;
  }

  // 4. Compute change level
  const changeLevel: ChangeLevel = (pages.length === 0)
    ? 'heavy'  // LLM 没产出有效内容，需要用户关注
    : (canonicalMd === rawInput.trim() ? 'none' : computeChangeLevel(rawInput, parsed));

  // 5. Self-review: 纯函数检查质量，标 warning 给前端
  let reviewWarnings = reviewMdContext(parsed, rawInput);

  // 5b. Error-level warnings → 触发一轮 LLM 修复（最多 1 轮，失败静默降级）
  const errorWarnings = reviewWarnings.filter(w => w.severity === 'error');
  if (errorWarnings.length > 0 && canonicalMd) {
    const fixPrompt = errorWarnings.map(w => `- ${w.message}`).join('\n');
    try {
      console.log(`[md-context] 自检发现 ${errorWarnings.length} 个 error，尝试修复...`);
      const isEnFix = opts?.locale === 'en';
      const pageCountNote = opts?.defaultPageCount
        ? (isEnFix
            ? `\n\n[System hint: output exactly ${opts.defaultPageCount} pages]`
            : `\n\n[系统提示：严格生成 ${opts.defaultPageCount} 页]`)
        : '';
      const fixInstruction = isEnFix
        ? `The output above has the following issues. Return a complete revised version (same format):\n${fixPrompt}`
        : `上面的输出有以下问题，请修复并返回完整的修正版（保持相同格式）：\n${fixPrompt}`;
      const { text: fixText } = await callLLM({
        model: getModel(),
        system: mdContextSystemPrompt(opts?.locale),
        messages: [
          { role: 'user' as const, content: rawInput + pageCountNote + polishHint },
          { role: 'assistant' as const, content: canonicalMd },
          { role: 'user' as const, content: fixInstruction },
        ],
      });
      const fixedParsed = parseCanonicalMd(stripCodeFence(fixText || ''));
      if (isUsableOutput(fixedParsed) && fixedParsed.pages.length > 0) {
        // Replace parsed data with fixed version
        const fixedExtracted = extractDemandsFromPages(fixedParsed.pages, fixedParsed.frontmatter);
        pages.length = 0;
        pages.push(...fixedExtracted.pages);
        Object.assign(demands, fixedExtracted.demands);

        // Re-apply page count trim after self-repair
        if (opts?.defaultPageCount && opts.defaultPageCount > 0) {
          applyPageCountTrim(pages, opts.defaultPageCount, fixedParsed.frontmatter, opts?.locale);
        }

        canonicalMd = stripCodeFence(fixText || '');
        reviewWarnings = reviewMdContext(fixedParsed, rawInput);
        console.log(`[md-context] 修复后 warnings: ${reviewWarnings.length} (errors: ${reviewWarnings.filter(w => w.severity === 'error').length})`);
      } else {
        console.warn('[md-context] 修复输出不可用，保留原始版本');
      }
    } catch (err) {
      console.warn('[md-context] 自检修复失败，降级继续:', (err as Error).message);
    }
  }

  // 6. Content signal analysis — detect data, comparisons, time series
  const { analyzeContentSignals } = await import('./contentAnalysis');
  const contentSignals = analyzeContentSignals(rawInput);

  // 6c. Auto-infer layout for pages without explicit hints with diversity tracking
  const { inferLayout } = await import('./inferLayout');
  const existingLayoutHints = demands.pageLayouts ?? {};
  const autoLayouts: Record<number, Layout> = {};
  const usedRecently: Layout[] = [];

  pages.forEach((page, i) => {
    if (!(i in existingLayoutHints)) {
      const layout = inferLayout(page, i, pages.length, contentSignals, [], undefined, usedRecently);
      autoLayouts[i] = layout;
      usedRecently.push(layout);
      if (usedRecently.length > 2) usedRecently.shift();
    }
  });

  if (Object.keys(autoLayouts).length > 0) {
    demands.pageLayouts = { ...autoLayouts, ...existingLayoutHints };
  }

  // 6b. If content signals suggest data-centric layouts, inject as demand hints
  // for pages that don't already have explicit layout hints
  if (contentSignals.suggestedLayouts.length > 0 && pages.length > 0) {
    const currentHints = demands.pageLayouts ?? {};
    const suggestedIdx = pages.findIndex((p, i) =>
      !(i in currentHints) && (
        contentSignals.hasNumericData && /\d+%|\d+[kKmMbB]/.test(p.body + p.corePoint)
      )
    );
    if (suggestedIdx >= 0 && contentSignals.suggestedLayouts[0]) {
      demands.pageLayouts = {
        ...currentHints,
        [suggestedIdx]: contentSignals.suggestedLayouts[0],
      };
    }
  }

  return {
    frontmatter: parsed.frontmatter,
    pages,
    demands,
    canonicalMd,
    changeLevel,
    reviewWarnings,
    contentSignals,
    diff: { changes: [], changeLevel },
  };
}

// ----------------------------------------------------------------------------
// Plan Outline — lightweight structure planning (no full content)
// ----------------------------------------------------------------------------

const VALID_PLAN_PAGE_TYPES: PageType[] = ['cover', 'section', 'content', 'back'];

export async function buildPlanOutline(
  rawInput: string,
  opts?: {
    defaultPageCount?: number;
    audience?: string;
    density?: string;
    dataEmphasis?: string;
    keyTakeaway?: string;
    purpose?: string;
    narrative?: string;
    evidence?: string;
    /** AI questions and user answers from Step 2 */
    aiQA?: Array<{ question: string; answer: string }>;
    locale?: Locale;
    /** Unknown-key answers + extra-note, surfaced via buildPreferencesBlock. */
    freeFormHints?: Record<string, string>;
  },
): Promise<PlanOutline> {
  // Build user preferences context (labels + rules from selectorRules.ts SSOT)
  const prefLines = buildPreferencesBlock({
    purpose: opts?.purpose,
    narrative: opts?.narrative,
    evidence: opts?.evidence,
    audience: opts?.audience,
    density: opts?.density,
    keyTakeaway: opts?.keyTakeaway,
    dataEmphasis: opts?.dataEmphasis,
  }, opts?.freeFormHints, opts?.locale);

  const isEn = opts?.locale === 'en';

  const pageCountHint = opts?.defaultPageCount
    ? (isEn
        ? `\n\n🚨 Hard constraint: total pages must be exactly ${opts.defaultPageCount} (including cover and back). 1 [type: cover], 1 [type: back], and ${opts.defaultPageCount - 2} body pages — each body page is either [type: section] (TOC / divider / navigational) or [type: content] (everything else).`
        : `\n\n🚨 硬约束：总页数必须恰好为 ${opts.defaultPageCount} 页（包含封面和尾页）。其中 [type: cover] 1 页、[type: back] 1 页，中间 ${opts.defaultPageCount - 2} 页是正文——每页是 [type: section]（目录/分隔/导航类）或 [type: content]（其它正文）之一。`)
    : '';

  // Build AI Q&A context from Step 2
  const qaContext = opts?.aiQA?.length
    ? (isEn
        ? `\n\n## User answers to content questions\n${opts.aiQA.map(qa => `- Q: ${qa.question}\n  A: ${qa.answer}`).join('\n')}`
        : `\n\n## 用户回答的内容问题\n${opts.aiQA.map(qa => `- Q: ${qa.question}\n  A: ${qa.answer}`).join('\n')}`)
    : '';

  const userMessage = isEn
    ? `## User input\n\n${rawInput.slice(0, 1500)}\n\n## User preferences\n\n${prefLines || '(none)'}${qaContext}${pageCountHint}`
    : `## 用户输入\n\n${rawInput.slice(0, 1500)}\n\n## 用户偏好\n\n${prefLines || '（无）'}${qaContext}${pageCountHint}`;

  try {
    const { text } = await callLLM({
      model: getModel(),
      system: planOutlineSystemPrompt(opts?.locale),
      messages: [{ role: 'user', content: userMessage }],
    });

    const cleaned = text.trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`[plan-outline] LLM returned no JSON: ${cleaned.slice(0, 200)}`);
    }

    let parsed: PlanOutline;
    try {
      parsed = JSON.parse(jsonMatch[0]) as PlanOutline;
    } catch (parseErr) {
      throw new Error(
        `[plan-outline] LLM returned malformed JSON (${(parseErr as Error).message}): ${jsonMatch[0].slice(0, 200)}`,
      );
    }

    if (!parsed.pages?.length) {
      throw new Error(`[plan-outline] LLM returned JSON with empty pages array: ${jsonMatch[0].slice(0, 200)}`);
    }

    // Sanitize page types
    parsed.pages = parsed.pages.map(p => ({
      ...p,
      pageType: VALID_PLAN_PAGE_TYPES.includes(p.pageType) ? p.pageType : 'content',
    }));

    // Enforce page count if specified
    if (opts?.defaultPageCount && opts.defaultPageCount > 0) {
      const target = opts.defaultPageCount;
      const coverFallback = isEn
        ? { title: parsed.title || 'Cover', direction: 'Opening', pageType: 'cover' as PageType }
        : { title: parsed.title || '封面', direction: '开场', pageType: 'cover' as PageType };
      const endFallback = isEn
        ? { title: 'Summary', direction: 'Closing', pageType: 'back' as PageType }
        : { title: '总结', direction: '收尾', pageType: 'back' as PageType };
      const cover = parsed.pages.find(p => p.pageType === 'cover') ?? coverFallback;
      const end = parsed.pages.find(p => p.pageType === 'back') ?? endFallback;
      const content = parsed.pages.filter(p => p.pageType !== 'cover' && p.pageType !== 'back');
      const contentTarget = target - 2;
      if (content.length > contentTarget) {
        content.splice(contentTarget);
      } else {
        while (content.length < contentTarget) {
          content.push({
            title: isEn ? `Key point ${content.length + 1}` : `要点 ${content.length + 1}`,
            direction: isEn ? 'To be filled' : '待补充',
            pageType: 'content' as PageType,
          });
        }
      }
      parsed.pages = [cover, ...content, end];
    }

    parsed.suggestedPageCount = parsed.pages.length;
    return parsed;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.startsWith('[plan-outline]')) throw err;
    throw new Error(`[plan-outline] LLM call failed: ${msg}`);
  }
}


// ----------------------------------------------------------------------------
// Clarifier labels moved to selectorRules.ts (single source of truth).
// Use labelFor(key, value) / buildPreferencesBlock(ctx, freeFormHints) instead.
// ----------------------------------------------------------------------------
