// ============================================================================
// Content signal analysis — detect data, structure, and patterns in user input
// ============================================================================
// Pure function, no LLM. Regex-based analysis of raw input to detect:
// - Numeric data (percentages, currency, large numbers)
// - Comparisons (before→after, vs, from...to)
// - Time series (dates, temporal sequences)
// - List structure (numbered/bulleted lists)
//
// Used by: mdContext builder (suggest data-centric layouts), clarifier (ask
// about data emphasis), MdContextCards UI (show detection badges).
// ============================================================================

import type { Layout } from '../../types';

export interface ContentSignals {
  /** Found percentages, large numbers, or currency amounts */
  hasNumericData: boolean;
  /** Found "vs", "→", "from...to", comparative patterns */
  hasComparisons: boolean;
  /** Found date patterns, temporal sequence markers */
  hasTimeSeries: boolean;
  /** Found numbered/bulleted lists or step indicators */
  hasListStructure: boolean;
  /** Suggested data-centric layouts based on detected patterns */
  suggestedLayouts: Layout[];
  /** Extracted numeric data points (for UI display) */
  dataPoints: string[];
  /** Summary string for prompt injection */
  summary: string;
}

// --- Pattern matchers ---

const RE_PERCENTAGE = /\d+(\.\d+)?%/g;
const RE_CURRENCY = /[\$¥€£]\s?\d[\d,]*(\.\d+)?|\d[\d,]*(\.\d+)?\s?(元|美元|万|亿|千)/g;
const RE_LARGE_NUMBER = /\b\d{3,}[kKmMbB]?\b|\b\d+(\.\d+)?[kKmMbB]\b/g;
const RE_COMPARISON = /→|➜|->|vs\.?|VS\.?|对比|相比|从.{1,20}到|compared\s+to/g;
const RE_BEFORE_AFTER = /(\d+(\.\d+)?%?\s*)(→|->|到|至)\s*(\d+(\.\d+)?%?)/g;
const RE_DATE = /\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?|[QqQ][1-4]|第[一二三四]季度|\d{1,2}月/g;
const RE_TEMPORAL = /去年|今年|上个?月|下个?月|同比|环比|year[\s-]over[\s-]year|YoY|MoM|QoQ/gi;
const RE_LIST = /^(\s*[-•·]\s|\s*\d+[.)]\s|\s*[①②③④⑤⑥⑦⑧⑨⑩]\s)/gm;
const RE_STEP = /第[一二三四五六七八九十\d]+步|step\s+\d+/gi;

export function analyzeContentSignals(rawInput: string): ContentSignals {
  const percentages = rawInput.match(RE_PERCENTAGE) ?? [];
  const currencies = rawInput.match(RE_CURRENCY) ?? [];
  const largeNumbers = rawInput.match(RE_LARGE_NUMBER) ?? [];
  const comparisons = rawInput.match(RE_COMPARISON) ?? [];
  const beforeAfter = rawInput.match(RE_BEFORE_AFTER) ?? [];
  const dates = rawInput.match(RE_DATE) ?? [];
  const temporal = rawInput.match(RE_TEMPORAL) ?? [];
  const listItems = rawInput.match(RE_LIST) ?? [];
  const steps = rawInput.match(RE_STEP) ?? [];

  const hasNumericData = percentages.length > 0 || currencies.length > 0 || largeNumbers.length >= 2;
  const hasComparisons = comparisons.length > 0 || beforeAfter.length > 0;
  const hasTimeSeries = dates.length >= 2 || temporal.length > 0;
  const hasListStructure = listItems.length >= 3 || steps.length >= 2;

  // Collect extracted data points (deduped, max 8)
  const dataPoints = [...new Set([...percentages, ...currencies, ...beforeAfter.map(m => m.trim())])]
    .slice(0, 8);

  // Suggest layouts based on patterns
  const suggestedLayouts: Layout[] = [];

  // 宪法 §4.1：chart 默认 inline，不作为独立 page layout 建议。
  // 分析型比较 / 占比 / 时间序列的页面建议走可嵌 chart 字段的布局
  // (two-column / split-image / title-bento)，由渲染层把 chart 塞进卡片。
  if (beforeAfter.length > 0 || hasComparisons) {
    suggestedLayouts.push('stacked-bars', 'two-column', 'split-image');
  }

  if (percentages.length >= 3) {
    suggestedLayouts.push('two-column', 'split-image');
  }

  if (hasTimeSeries && hasNumericData) {
    suggestedLayouts.push('timeline', 'two-column');
  }

  if (largeNumbers.length >= 2 || (percentages.length >= 1 && percentages.length <= 2)) {
    suggestedLayouts.push('big-number');
  }

  if (hasListStructure) {
    suggestedLayouts.push('icon-list');
  }

  if (steps.length >= 2) {
    suggestedLayouts.push('steps');
    suggestedLayouts.push('timeline');
  }

  // Build summary for prompt injection
  const parts: string[] = [];
  if (hasNumericData) parts.push(`数据密集（${dataPoints.slice(0, 4).join(', ')}）`);
  if (hasComparisons) parts.push('包含对比/变化');
  if (hasTimeSeries) parts.push('包含时间序列');
  if (hasListStructure) parts.push('包含列表结构');
  const summary = parts.length > 0 ? `内容特征: ${parts.join('、')}` : '';

  return {
    hasNumericData,
    hasComparisons,
    hasTimeSeries,
    hasListStructure,
    suggestedLayouts: [...new Set(suggestedLayouts)],
    dataPoints,
    summary,
  };
}
