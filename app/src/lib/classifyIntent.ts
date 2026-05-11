// ============================================================================
// Lasca — Intent Classification for Chat Routing
// ============================================================================
// Rule-based classifier that determines whether a chat message is an edit
// request, a batch-edit-all request, a generate-new-deck request, or ambiguous.
//
// No LLM calls — fast, free, deterministic. Runs before dispatch in ChatPanel.
// ============================================================================

import { detectPages } from './detectPages';

export type ChatIntent =
  | { type: 'edit'; pages: number[] }   // edit specific pages
  | { type: 'edit-all' }                // edit all pages (batch)
  | { type: 'generate' }                // create new deck from scratch
  | { type: 'ambiguous' };              // can't tell — ask user

// --- Keyword patterns ---

// Edit: verbs/nouns indicating modification of existing content
const EDIT_PATTERNS: RegExp[] = [
  // Layout / structure changes
  /(?:换|改|调整?|修改|替换|更换|优化).*(?:layout|布局|版式|排版|模板|格式)/i,
  /(?:layout|布局|版式|排版).*(?:换|改|调|变)/i,
  // Style / visual changes
  /(?:换|改|调整?|修改|变).*(?:颜色|配色|色调|字体|背景|样式|风格|主题)/,
  /(?:颜色|配色|背景|字体|样式|风格).*(?:换|改|调|变)/,
  // Content editing verbs
  /(?:改|修改|换|替换|更新|重写|润色|精简|缩短|扩展|补充).*(?:标题|副标题|正文|文字|内容|文案|描述)/,
  /(?:标题|副标题|正文|文字|内容|文案).*(?:改|换|调|缩短|扩展|精简)/,
  // Structural operations
  /(?:删除?|去掉|移除|删掉)(?:这|第|那)/,
  /(?:加|添加|插入|加上|补上).*(?:到|在|一个|一张|一页)/,
  // Transform verbs
  /(?:放大|缩小|居中|对齐|加粗|变色|加深|变浅|调亮|调暗)/,
  // Explicit "this page" / "current page" references
  /(?:这一?页|当前页|这张|这个|上一页|下一页).*(?:的|改|换|调)/,
  // Direct imperative edits (short commands)
  /^(?:改成|换成|变成|调成)/,
  // Redesign / redo verbs targeting existing pages
  /(?:重新设计|重新排版|重新布局|重做|redesign)/i,
  // English edit verbs
  /\b(?:change|modify|edit|update|fix|adjust|resize|move|align|swap)\b/i,
];

// "All pages" qualifier combined with edit intent
const ALL_PAGES_PATTERNS: RegExp[] = [
  /(?:所有|全部|每一?)(?:页|张|个)?.*(?:换|改|调|变|删|加|统一|一致)/,
  /(?:换|改|调|变|统一).*(?:所有|全部|每一?)(?:页|张)/,
  /统一.*(?:风格|样式|颜色|字体|背景|布局)/,
  /(?:所有|全部)(?:页|张).*(?:的|都)/,
];

// Generate: keywords indicating creation of a new deck
const GENERATE_PATTERNS: RegExp[] = [
  // Explicit creation verbs + deck-like objects
  /(?:做|创建|生成|写|新建|制作|帮我做|帮我写|帮我生成).*(?:deck|ppt|幻灯片|slides?|报告|presentation|演示)/i,
  /(?:deck|ppt|幻灯片|slides?|报告|presentation|演示).*(?:做|创建|生成|写|新建|制作)/i,
  // "About X" topic patterns (typically generation)
  /(?:关于|围绕|针对|讲述|介绍).*(?:的\s*(?:deck|ppt|幻灯片|slides?|报告|演示))/i,
  // "From scratch" / "start over"
  /(?:从头|从零|重新做|重新生成|重做整个|全部重做)/,
  // "N pages about X" pattern
  /\d+\s*页.*(?:关于|讲|介绍|分析)/,
  // English generate verbs
  /\b(?:create|generate|make|build)\s+(?:a\s+)?(?:deck|presentation|slides?)\b/i,
];

/**
 * Classify a chat message's intent: edit, edit-all, generate, or ambiguous.
 *
 * @param text        — user's raw input text
 * @param slideCount  — number of slides currently in the deck (0 = empty/new deck)
 */
export function classifyIntent(
  text: string,
  slideCount: number,
): ChatIntent {
  const detectedPages = detectPages(text);

  // --- Rule 1: Explicit page reference → always edit ---
  if (detectedPages && detectedPages.length > 0) {
    return { type: 'edit', pages: detectedPages };
  }

  const hasEditSignal = EDIT_PATTERNS.some(p => p.test(text));
  const hasAllPagesSignal = ALL_PAGES_PATTERNS.some(p => p.test(text));
  const hasGenerateSignal = GENERATE_PATTERNS.some(p => p.test(text));

  // --- Rule 2: "All pages" + edit keywords → batch edit ---
  if (hasAllPagesSignal && hasEditSignal) {
    return { type: 'edit-all' };
  }

  // --- Rule 3: Clear edit intent, no generate signal → edit current page ---
  if (hasEditSignal && !hasGenerateSignal) {
    return { type: 'edit', pages: [] }; // empty = current page (resolved by caller)
  }

  // --- Rule 4: Clear generate intent, no edit signal → generate ---
  if (hasGenerateSignal && !hasEditSignal) {
    return { type: 'generate' };
  }

  // --- Rule 5: Long text without page refs or edit keywords → likely a draft paste ---
  if (text.length > 100 && !hasEditSignal) {
    // Count markdown headings as a draft signal
    const headingCount = (text.match(/^#+\s/gm) || []).length;
    if (headingCount >= 2) return { type: 'generate' };
    // Long freeform text
    if (text.length > 200) return { type: 'generate' };
  }

  // --- Rule 6: Short text on existing deck → safer to default to edit ---
  if (text.length < 20 && slideCount > 0 && !hasGenerateSignal) {
    return { type: 'edit', pages: [] };
  }

  // --- Rule 7: Empty deck → lean toward generate ---
  if (slideCount === 0) {
    return { type: 'generate' };
  }

  // --- Rule 8: Both signals or neither → ambiguous ---
  return { type: 'ambiguous' };
}
