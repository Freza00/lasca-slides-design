// ============================================================================
// 智能 layout 推断 — 纯函数，零 LLM 开销
// ============================================================================
// 抽离自 orchestrator.ts，让浏览器侧的 MdContextCards 能预览每页"自动选什么 layout"。
// orchestrator.ts 的其它部分 import 了 server-only 的 @ai-sdk/* 包，所以不能整文件
// 直接在 client 里用。这个文件只依赖 type imports，可以两边共用。
// ============================================================================

import type { Layout } from '../../types';
import type { MdContextPage } from './types';
import type { ContentSignals } from './contentAnalysis';

// Regex patterns for per-page content analysis
const RE_NUM = /\d+(\.\d+)?[%kKmMbB亿万千元]?/g;
const RE_CMP = /→|➜|->|vs\.?|VS\.?|对比|相比|从.{1,15}到|compared|优于|劣于|胜过/i;
const RE_TIME = /\d{4}[-/.]\d{1,2}|[QqQ][1-4]|第[一二三四]季度|\d{1,2}月|去年|今年|同比|环比|YoY|MoM/i;
const RE_STEP = /第[一二三四五六七八九十\d]+步|step\s*\d+|阶段[一二三四五六\d]|phase\s*\d/i;
const RE_QUOTE = /"|"|「|」|『|』|——|说过|曾说|名言|格言/;
// Diagram-specific semantic triggers (§4.6 Diagram 视觉规范 — proactive).
// Each regex targets a distinct structural relationship that Lasca already
// renders as a diagram, so LLM doesn't default to bullet lists when a
// diagram would carry the meaning better.
const RE_CYCLE = /循环|迭代|闭环|反馈回路|周而复始|cycle|iterat(e|ion|ive)|loop|feedback loop/i;
const RE_HUB = /核心.{0,4}(围绕|连接|辐射|驱动)|以.{1,8}为中心|中枢|ecosystem|hub|中心.{0,2}辐射|辐射.{0,2}到/i;
const RE_MATRIX = /二维|2\s*x\s*2|矩阵|四象限|quadrant|high\/?low|高低|坐标系|BCG|SWOT/i;
const RE_VENN = /交集|重叠|共同点|相交|交叉|overlap|intersection|common ground|in common/i;
const RE_BULLSEYE = /优先级|核心→外围|核心到.{0,3}外|内到外|nested|核心圈|由内而外|priorit(y|ies).{0,10}(ring|tier|level)/i;
const RE_PYRAMID = /层级|金字塔|等级|tier|pyramid|层次结构|hierarchy|分级|由上至下|top.?down/i;
const RE_FUNNEL = /漏斗|转化率|流失|筛选|conversion|funnel|drop.?off|lead.{0,3}qual/i;

/**
 * Content-aware layout inference. Analyzes a single MdContextPage's text to
 * pick the most suitable layout. Pure function, <1ms per page.
 *
 * Priority:
 *   1. pageType structural slots (cover / section / back) — 宪法 §2 仅 4 种
 *   2. Content pattern matching (numbers, comparisons, steps, quotes, etc.)
 *   3. SubPoint count heuristic
 *   4. Preset preferredLayouts tiebreaker
 *   5. Diversity: avoid last 2 used layouts
 *   6. Fallback: two-column
 *
 * 细分意图（数据/案例/Q&A/总结/过渡）降级到 content 的内容模式匹配，不走 pageType 分支。
 */
export function inferLayout(
  page: MdContextPage,
  pageIndex: number,
  totalPages: number,
  contentSignals: ContentSignals | undefined,
  preferredLayouts: Layout[],
  avoidLayouts: Layout[] | undefined,
  usedRecently: Layout[],
): Layout {
  // Defensive: a malformed page object reaches here only when an upstream
  // shape guard has been bypassed, but we'd rather emit a safe fallback
  // layout than throw inside MdContextCards' render phase.
  if (!page || typeof page !== 'object') {
    return pageIndex === 0 ? 'cover' : pageIndex === totalPages - 1 ? 'closing' : 'two-column';
  }

  // --- 1. Structural slots from pageType (4 种：cover / section / content / back) ---
  if (page.pageType === 'cover' || pageIndex === 0) return 'cover';
  if (page.pageType === 'back' || pageIndex === totalPages - 1) return 'closing';
  if (page.pageType === 'section') {
    // section 角色：目录 or 小节分隔。用首词和 subPoints 数量粗判。
    const looksLikeToc = /目录|agenda|contents|outline/i.test(page.title)
      || (page.subPoints?.length ?? 0) >= 3;
    return looksLikeToc ? 'agenda' : 'section-break';
  }

  const text = `${page.corePoint} ${page.body} ${(page.subPoints ?? []).join(' ')} ${(page.evidence ?? []).join(' ')}`;
  const titleAndCore = `${page.title} ${page.corePoint}`;
  const numMatches = text.match(RE_NUM) ?? [];
  const hasComparison = RE_CMP.test(text);
  const hasTime = RE_TIME.test(text);
  const hasSteps = RE_STEP.test(text);
  const hasQuote = RE_QUOTE.test(text);
  const hasCycle = RE_CYCLE.test(text);
  const hasHub = RE_HUB.test(text);
  const hasMatrix = RE_MATRIX.test(titleAndCore);
  const hasVenn = RE_VENN.test(text);
  const hasBullseye = RE_BULLSEYE.test(text);
  const hasPyramid = RE_PYRAMID.test(titleAndCore);
  const hasFunnel = RE_FUNNEL.test(titleAndCore);
  const subCount = page.subPoints?.length ?? 0;
  const bodyLen = page.body.length;

  // --- 2. Content pattern matching → candidate list ---
  const candidates: Layout[] = [];

  // Single prominent number — require unit suffix AND that the page is genuinely
  // about that number (either multiple stats clustered together, or a single stat
  // on a very short body). A lone "提升 23% 效率" inside a 150-char narrative
  // paragraph used to over-trigger big-number; tightened so narrative pages
  // mentioning a stat in passing don't get hijacked.
  const hasUnitSuffix = (numMatches ?? []).some(m => /[%kKmMbB亿万千元]$/.test(m));
  const isSingleNumberFocus = numMatches.length >= 2
    || (numMatches.length === 1 && bodyLen < 80);
  if (isSingleNumberFocus && numMatches.length <= 3 && hasUnitSuffix) {
    candidates.push('big-number');
  }

  // Comparison patterns — chart inline inside two-column / split-image, not as
  // its own page. 宪法 §4.1：chart 默认不占整页。
  if (hasComparison) {
    candidates.push('versus', 'two-column', 'split-image');
  }

  // Time series — ditto. line-chart embeds as `chart` field of two-column /
  // split-image / title-bento; stays out of page-level candidate set.
  if (hasTime && numMatches.length >= 2) {
    candidates.push('timeline', 'two-column', 'split-image');
  }

  // Step/process patterns
  if (hasSteps || (subCount >= 3 && RE_STEP.test((page.subPoints ?? []).join(' ')))) {
    candidates.push('steps', 'flowchart');
  }

  // Diagram triggers (proactive — §4.6). These push diagram candidates when the
  // content semantics call for them. `hasMatrix` / `hasPyramid` / `hasFunnel`
  // match on title+corePoint only (stricter) so narrative mentions don't
  // hijack; the rest match full text.
  if (hasCycle && subCount >= 2) candidates.push('cycle');
  if (hasHub && subCount >= 3) candidates.push('hub-spoke');
  if (hasMatrix) candidates.push('matrix');
  if (hasVenn && subCount >= 2 && subCount <= 3) candidates.push('venn');
  if (hasBullseye && subCount >= 2) candidates.push('bullseye');
  if (hasPyramid && subCount >= 2) candidates.push('pyramid');
  if (hasFunnel && subCount >= 2) candidates.push('funnel');

  // Quote
  if (hasQuote && bodyLen < 200) {
    candidates.push('quote');
  }

  // 标题暗示总结/回顾 + 多个数字 → stat-row
  if (/总结|回顾|summary|recap|takeaway/i.test(page.title) && numMatches.length >= 3) {
    candidates.push('stat-row');
  }

  // --- 3. SubPoint count heuristic (if no strong signal yet) ---
  if (candidates.length === 0) {
    if (subCount === 2) candidates.push('two-column', 'split-image');
    else if (subCount === 3) candidates.push('three-cards', 'icon-list');
    else if (subCount >= 4 && subCount <= 6) candidates.push('grid-cards', 'icon-list');
    else if (subCount > 6) candidates.push('grid-cards', 'stacked-bars');
    else if (bodyLen > 200) candidates.push('title-body');
    else candidates.push('two-column');
  }

  // Inject contentSignals.suggestedLayouts (deck-level signals apply to all pages)
  if (contentSignals?.suggestedLayouts?.length) {
    for (const sl of contentSignals.suggestedLayouts) {
      if (!candidates.includes(sl)) candidates.push(sl);
    }
  }

  // --- 4. Score candidates: prefer preset.preferredLayouts, penalize avoidLayouts ---
  const avoid = new Set(avoidLayouts ?? []);
  const recentSet = new Set(usedRecently);
  const scored = candidates.map(layout => {
    let score = 0;
    if (preferredLayouts.includes(layout)) score += 2;
    if (avoid.has(layout)) score -= 3;
    if (recentSet.has(layout)) score -= 4; // diversity penalty
    return { layout, score };
  });
  scored.sort((a, b) => b.score - a.score);

  // --- 5. Pick best non-duplicate, fallback to two-column ---
  const chosen: Layout = scored[0]?.layout ?? 'two-column';

  // Trace per-page layout selection when LASCA_TRACE=1 (server-only, skipped in
  // production and in the browser-side MdContextCards preview). Uses
  // console.error because Next.js 16 dev silently swallows console.log and
  // console.info from API routes — only console.error reaches stdout /
  // piped log files. This is diagnostic output, not a real error.
  if (
    typeof process !== 'undefined'
    && process.env?.LASCA_TRACE === '1'
    && process.env?.NODE_ENV !== 'production'
  ) {
    console.error(`[LASCA_TRACE] inferLayout ${JSON.stringify({
      stage: 'inferLayout',
      pageIndex,
      title: page.title?.slice(0, 60) ?? '',
      pageType: page.pageType,
      subCount,
      bodyLen,
      candidates,
      scored: scored.map(s => `${s.layout}(${s.score})`),
      preferredLayouts,
      avoidLayouts: avoidLayouts ?? [],
      usedRecently,
      chosen,
    })}`);
  }

  return chosen;
}

// ============================================================================
// Density → layout filter
// ============================================================================
// Page count ≠ info density. A 5-page exec summary can still be dense;
// a 20-page report of investment research is inherently text-heavy per slide.
// Density is a first-class axis that narrows the allowed layout set.
//
// Precedence when combined with a style preset:
//   candidate = preset.preferredLayouts ∩ densityAllowed[density]
//   → if intersection non-empty, use it.
//   → if empty, density wins (content > style — layout serves content).
// ============================================================================

export type Density = 'minimal' | 'moderate' | 'detailed';

/**
 * Layouts that make sense at each density level. A layout can appear in
 * multiple buckets (e.g. two-column works at minimal and moderate).
 * Reports (report-*) and faithful (*-faithful) are excluded — those are
 * format-specific and never picked by density.
 */
// 宪法 §4.1：chart 默认 inline（进 two-column / split-image / title-bento 的
// chart 字段），不作为 page-level layout。独占全页的 chart 走 data-hero 特例路径，
// 目前由 adapt.ts: chartFullToCardCanvas() 处理遗留数据；density 桶不再把它们作
// 为建议候选。
const DENSITY_LAYOUTS: Record<Density, Layout[]> = {
  minimal: [
    'cover', 'quote', 'big-number', 'section-break',
    'two-column', 'split-image', 'image',
  ],
  moderate: [
    'cover', 'three-cards', 'two-column', 'split-image',
    'timeline', 'icon-list', 'versus', 'steps',
    'agenda', 'stat-row', 'quote',
    // Diagrams that read well at 3-5 items — admit into moderate so proactive
    // triggers (§4.6) have somewhere to land when deck density isn't 'detailed'.
    'cycle', 'matrix', 'hub-spoke', 'flowchart',
    // bento / featured-grid / title-bento live here (moderate) because their
    // tiles only fit short-label or single-sentence content. When bodies are
    // paragraph-length, use the detailed bucket instead.
    'bento', 'featured-grid', 'title-bento',
  ],
  detailed: [
    'timeline', 'table', 'dashboard', 'stacked-bars',
    'grid-cards', 'three-cards', 'icon-list',
    'matrix', 'hub-spoke', 'flowchart', 'funnel', 'pyramid',
    'cycle', 'venn', 'bullseye', 'versus', 'steps',
    'title-body', 'two-column',
  ],
};

/**
 * Narrow a layout candidate list to those appropriate for the given density.
 * If density is undefined, returns the input untouched.
 *
 * When intersected with `preset.preferredLayouts`, density wins on empty
 * intersection — content > style.
 */
export function filterLayoutsByDensity(
  allowed: Layout[],
  density: Density | undefined,
): Layout[] {
  if (!density) return allowed;
  const densitySet = new Set(DENSITY_LAYOUTS[density]);
  const intersection = allowed.filter(l => densitySet.has(l));
  // Density wins when the preset has no overlap with the density bucket.
  return intersection.length > 0 ? intersection : DENSITY_LAYOUTS[density];
}

/** Get the full layout set for a density level (no preset constraint). */
export function layoutsForDensity(density: Density): Layout[] {
  return [...DENSITY_LAYOUTS[density]];
}
