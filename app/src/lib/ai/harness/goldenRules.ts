// ============================================================================
// Lasca AI Harness — Golden Rules 硬约束校验器
// ============================================================================
// 这一层是 Lasca 的"稳定性保险"。
//
// 用户洞察："让 AI 生成 JSON 已经没有难度。harness 的价值是让结果不是随机抽卡，
// 而是稳定朝着水准线。"
//
// 这个文件就是"水准线"的具体定义。纯函数 → 不调 LLM → 便宜、快、可单测。
// 任何一条 error 级规则不通过都会触发重试。warning 级只记录不阻断。
//
// 规则来自 docs/AESTHETICS.md（设计宪法）和原始产品规范：
//   - 同层级字体和字号必须一致
//   - 不能有大块无意义留白
//   - 同层级内容跨页位置差不多
//   - 可以参考黄金比例
// ============================================================================

import type {
  Slide,
  Layout,
  CoverData,
  BigNumberData,
  ThreeCardsData,
  TwoColumnData,
  StackedBarsData,
  GridCardsData,
  QuoteData,
  ImageData,
  TitleBodyData,
  SplitImageData,
  IconListData,
  TimelineData,
  TableData,
  FeaturedGridData,
  BentoData,
} from '../../types';
import type { RuleReport, RuleViolation, StylePreset } from './types';
import { containsEmoji } from '../../placeholders/glyph';

// ============================================================================
// 规则定义
// ============================================================================

type RuleFn = (slide: Slide, ctx: RuleContext) => RuleViolation[];

interface RuleContext {
  pageIndex: number;
  totalPages: number;
  deck: Slide[];
  preset?: StylePreset;
}

// ---- 文本长度类规则 ----

/** 标题必须 ≤ 12 个中文字符或 ≤ 8 个英文词 */
const R_TITLE_LENGTH: RuleFn = (slide, ctx) => {
  const title = extractTitle(slide);
  if (!title) return [];

  const charCount = countVisibleChars(title);
  const wordCount = title.trim().split(/\s+/).length;

  if (charCount > 18 || wordCount > 10) {
    return [{
      ruleId: 'R_TITLE_LENGTH',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: `标题过长: "${title}" (${charCount} 字)`,
      suggestedFix: `把标题压到 ≤ 12 个中文字符或 ≤ 8 个英文词。当前: "${title}"`,
    }];
  }
  if (charCount > 12 || wordCount > 8) {
    return [{
      ruleId: 'R_TITLE_LENGTH',
      severity: 'warning',
      pageIndex: ctx.pageIndex,
      message: `标题偏长: "${title}"`,
    }];
  }
  return [];
};

/** 卡片描述不超过 40 字符 */
const R_CARD_DESC_LENGTH: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  if (slide.layout === 'three-cards' || slide.layout === 'grid-cards') {
    const cards = (slide.data as ThreeCardsData | GridCardsData).cards ?? [];
    cards.forEach((card, i) => {
      if (card.desc && countVisibleChars(card.desc) > 45) {
        violations.push({
          ruleId: 'R_CARD_DESC_LENGTH',
          severity: 'error',
          pageIndex: ctx.pageIndex,
          message: `卡片 ${i + 1} 描述过长 (${countVisibleChars(card.desc)} 字): ${truncate(card.desc, 30)}`,
          suggestedFix: `把第 ${i + 1} 张卡片的描述压到 ≤ 40 字。`,
        });
      }
    });
  }
  return violations;
};

/** 卡片 label 是 52px 巨号序号/数字（≤6 字符），不是标题短语 */
const R_CARD_LABEL_LENGTH: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  if (slide.layout === 'three-cards' || slide.layout === 'grid-cards') {
    const cards = (slide.data as ThreeCardsData | GridCardsData).cards ?? [];
    cards.forEach((card, i) => {
      const label = card.label ?? '';
      const len = countVisibleChars(label);
      if (len > 6) {
        violations.push({
          ruleId: 'R_CARD_LABEL_LENGTH',
          severity: 'error',
          pageIndex: ctx.pageIndex,
          message: `卡片 ${i + 1} label 过长 (${len} 字): "${label}" — label 是 52px 巨号序号，不是标题短语`,
          suggestedFix: `把第 ${i + 1} 张卡片的 label 改成 ≤4 字符的短序号或数据（如 "01"、"42%"、"#1"），原内容挪到 title。`,
        });
      }
    });
  }
  return violations;
};

/** icon-list / featured-grid / bento 的 icon 字段禁止 emoji（审美红线：AI slop 标志） */
const R_NO_EMOJI_IN_ICON: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  const mkViolation = (where: string, i: number, icon: string): RuleViolation => ({
    ruleId: 'R_NO_EMOJI_IN_ICON',
    severity: 'error',
    pageIndex: ctx.pageIndex,
    message: `${where}[${i}].icon 含 emoji "${icon}" — Lasca 审美红线，所有 icon 必须是排印符号/数字或留空`,
    suggestedFix: `把 ${where}[${i}].icon 改成排印符号（§ ★ ◆ → ● 等）、数字（1-9）、或留空让系统自动生成几何图形。绝不要 emoji。`,
  });

  if (slide.layout === 'icon-list') {
    const items = (slide.data as IconListData).items ?? [];
    items.forEach((item, i) => {
      if (containsEmoji(item.icon)) violations.push(mkViolation('items', i, item.icon));
    });
  } else if (slide.layout === 'featured-grid') {
    const tiles = (slide.data as FeaturedGridData).tiles ?? [];
    tiles.forEach((tile, i) => {
      if (containsEmoji(tile.icon)) violations.push(mkViolation('tiles', i, tile.icon ?? ''));
    });
  } else if (slide.layout === 'bento') {
    const items = (slide.data as BentoData).items ?? [];
    items.forEach((item, i) => {
      if (containsEmoji(item.icon)) violations.push(mkViolation('items', i, item.icon ?? ''));
    });
  }
  return violations;
};

/** 大数字页: number 字段必须真的是"大数字"（≤ 8 个可见字符），不是一段话 */
const R_BIG_NUMBER_IS_NUMBER: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'big-number') return [];
  const data = slide.data as BigNumberData;
  const num = data.number ?? '';
  if (countVisibleChars(num) > 10) {
    return [{
      ruleId: 'R_BIG_NUMBER_IS_NUMBER',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: `big-number 的 number 字段不应该是一段话: "${num}"`,
      suggestedFix: '把 number 改成真正的数字或极短符号（如 "3.5M"、"87%"、"0→1"），把原文字挪到 text 字段。',
    }];
  }
  return [];
};

/** Quote 页引用不能太长 */
const R_QUOTE_LENGTH: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'quote') return [];
  const data = slide.data as QuoteData;
  const count = countVisibleChars(data.quote ?? '');
  if (count > 60) {
    return [{
      ruleId: 'R_QUOTE_LENGTH',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: `引用过长 (${count} 字)，无法形成视觉冲击力。`,
      suggestedFix: '把 quote 压到 ≤ 40 字。过长的内容可以放进 body 字段作为出处或解释。',
    }];
  }
  return [];
};

// ---- 结构类规则 ----

/** Three-cards 必须有 2-5 张卡；grid-cards 必须有 2-12 张 */
const R_CARD_COUNT: RuleFn = (slide, ctx) => {
  if (slide.layout === 'three-cards') {
    const count = (slide.data as ThreeCardsData).cards?.length ?? 0;
    if (count < 2) {
      return [{
        ruleId: 'R_CARD_COUNT',
        severity: 'error',
        pageIndex: ctx.pageIndex,
        message: `three-cards 至少要 2 张卡片，当前 ${count} 张。`,
        suggestedFix: '补齐到至少 2 张卡片，或换成 big-number / cover layout。',
      }];
    }
    if (count > 5) {
      return [{
        ruleId: 'R_CARD_COUNT',
        severity: 'error',
        pageIndex: ctx.pageIndex,
        message: `three-cards 最多 5 张卡片，当前 ${count} 张。`,
        suggestedFix: '合并相似卡片，或换成 grid-cards layout。',
      }];
    }
  }
  if (slide.layout === 'grid-cards') {
    const data = slide.data as GridCardsData;
    const count = data.cards?.length ?? 0;
    const cols = data.columns ?? 3;
    if (count < 2 || count > 12) {
      return [{
        ruleId: 'R_CARD_COUNT',
        severity: 'error',
        pageIndex: ctx.pageIndex,
        message: `grid-cards 应该有 2-12 张卡片，当前 ${count} 张。`,
        suggestedFix: `保持在 ${cols * 2}~${cols * 3} 张之间，或调整 columns。`,
      }];
    }
    // 卡片数能被列数整除时视觉最稳（允许差 1 张）
    if (count % cols !== 0 && (cols - (count % cols)) > 1) {
      return [{
        ruleId: 'R_CARD_COUNT',
        severity: 'warning',
        pageIndex: ctx.pageIndex,
        message: `grid-cards ${count} 张卡配 ${cols} 列会有空位。`,
      }];
    }
  }
  return [];
};

/** Stacked-bars 必须有 2-7 根 */
const R_BAR_COUNT: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'stacked-bars') return [];
  const bars = (slide.data as StackedBarsData).bars ?? [];
  if (bars.length < 2 || bars.length > 7) {
    return [{
      ruleId: 'R_BAR_COUNT',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: `stacked-bars 应该有 2-7 根，当前 ${bars.length} 根。`,
      suggestedFix: '合并同类项或拆成两页。',
    }];
  }
  return [];
};

/** Two-column 必须两列都有内容 */
const R_TWO_COLUMN_BOTH_SIDES: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'two-column') return [];
  const data = slide.data as TwoColumnData;
  const leftHasContent = !!(data.left?.heading || data.left?.content);
  const rightHasContent = !!(data.right?.heading || data.right?.content);
  if (!leftHasContent || !rightHasContent) {
    return [{
      ruleId: 'R_TWO_COLUMN_BOTH_SIDES',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: 'two-column 布局有一列是空的，对比失效。',
      suggestedFix: '给空的那一列补内容，或换成 quote / big-number layout。',
    }];
  }
  return [];
};

// ---- 跨页一致性规则 ----

/** 首页必须是 cover，末页应该是总结型 layout */
const R_DECK_BOOKENDS: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  // 只在第一页检查（一次就够）
  if (ctx.pageIndex === 0) {
    if (slide.layout !== 'cover') {
      violations.push({
        ruleId: 'R_DECK_BOOKENDS',
        severity: 'warning',
        pageIndex: 0,
        message: `首页不是 cover（是 ${slide.layout}），用户打开第一眼缺乏入场感。`,
      });
    }
  }
  return violations;
};

/** Suggest alternative layouts that haven't been used recently */
function suggestAlternativeLayouts(current: Layout, ctx: RuleContext): string {
  const recent = new Set(
    ctx.deck
      .slice(Math.max(0, ctx.pageIndex - 2), ctx.pageIndex)
      .map(s => s.layout),
  );
  const all: Layout[] = ['cover', 'big-number', 'three-cards', 'two-column', 'stacked-bars', 'grid-cards', 'quote', 'image'];
  const available = all.filter(l => !recent.has(l) && l !== current);
  return available.slice(0, 3).join(' / ') || 'two-column';
}

/** 连续 2 页不能是同一个 layout（从 3 收紧到 2，2026-04-09） */
const R_LAYOUT_REPETITION: RuleFn = (slide, ctx) => {
  if (ctx.pageIndex < 1) return [];
  const prev = ctx.deck[ctx.pageIndex - 1]?.layout;
  if (slide.layout === prev) {
    return [{
      ruleId: 'R_LAYOUT_REPETITION',
      severity: 'error',
      pageIndex: ctx.pageIndex,
      message: `第 ${ctx.pageIndex + 1} 页和前一页都是 ${slide.layout}，视觉节奏单调。`,
      suggestedFix: `换成其他 layout。禁止再用 ${slide.layout}。建议: ${suggestAlternativeLayouts(slide.layout, ctx)}`,
    }];
  }
  return [];
};

/** 关键词过度重复（简化版 consistency-checker） */
const R_KEYWORD_REPETITION: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  // 只在最后一页做一次全 deck 检查
  if (ctx.pageIndex !== ctx.totalPages - 1) return [];

  const titles = ctx.deck
    .map(s => extractTitle(s))
    .filter((t): t is string => !!t);

  const wordFreq = new Map<string, number>();
  for (const title of titles) {
    const tokens = tokenize(title);
    for (const token of tokens) {
      if (token.length < 2) continue;
      wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
    }
  }

  for (const [word, count] of wordFreq) {
    if (count >= 3) {
      violations.push({
        ruleId: 'R_KEYWORD_REPETITION',
        severity: 'warning',
        pageIndex: ctx.pageIndex,
        message: `关键词 "${word}" 在标题中出现 ${count} 次，显得重复。`,
      });
    }
  }
  return violations;
};

// ---- 斐波那契 / 黄金分割规则 ----
// 设计原理：人眼天然偏好 Fibonacci 数列（2, 3, 5, 8, 13）和黄金比例（φ ≈ 1.618）。
// 卡片数、条目数落在斐波那契数上时视觉节奏最稳；长度比落在 1:φ 附近时最和谐。
// 这里的规则都是 warning 级——不阻断生成，但记录下来让 orchestrator 有机会微调。

const FIBONACCI_COUNTS = new Set([2, 3, 5, 8, 13]);
const PHI = 1.618;
const PHI_TOLERANCE = 0.35; // ratio 落在 [1/(φ+0.35), φ+0.35] 范围内算和谐

/** Three-cards / grid-cards 的卡片数偏好斐波那契数（2, 3, 5, 8） */
const R_FIBONACCI_CARD_COUNT: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'three-cards' && slide.layout !== 'grid-cards') return [];
  const cards = (slide.data as ThreeCardsData | GridCardsData).cards ?? [];
  const n = cards.length;
  if (n === 0) return [];
  if (FIBONACCI_COUNTS.has(n)) return [];
  return [{
    ruleId: 'R_FIBONACCI_CARD_COUNT',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `卡片数 ${n} 不在斐波那契数列（2/3/5/8）上，节奏次优。`,
    suggestedFix: `考虑合并或拆分到 ${nearestFib(n)} 张卡片。`,
  }];
};

/** Stacked-bars 的条目数偏好斐波那契数 */
const R_FIBONACCI_BAR_COUNT: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'stacked-bars') return [];
  const bars = (slide.data as StackedBarsData).bars ?? [];
  const n = bars.length;
  if (n === 0) return [];
  if (FIBONACCI_COUNTS.has(n)) return [];
  return [{
    ruleId: 'R_FIBONACCI_BAR_COUNT',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `bar 条目数 ${n} 不在斐波那契数列上，视觉层次次优。`,
    suggestedFix: `考虑调整到 ${nearestFib(n)} 根。`,
  }];
};

/** Cover 的 title:subtitle 长度比应接近 φ 或 1/φ */
const R_GOLDEN_COVER_RATIO: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'cover') return [];
  const data = slide.data as CoverData;
  if (!data.title || !data.subtitle) return [];
  const titleLen = countVisibleChars(data.title);
  const subtitleLen = countVisibleChars(data.subtitle);
  if (titleLen === 0 || subtitleLen === 0) return [];

  // 取大 / 小 的比
  const ratio = Math.max(titleLen, subtitleLen) / Math.min(titleLen, subtitleLen);
  const distanceFromPhi = Math.abs(ratio - PHI);
  // 可接受：接近 φ（黄金）、或接近 1（等长）
  if (distanceFromPhi <= PHI_TOLERANCE || ratio <= 1.2) return [];

  return [{
    ruleId: 'R_GOLDEN_COVER_RATIO',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `封面 title/subtitle 长度比 ${ratio.toFixed(2)} 偏离黄金比（φ=1.618）。`,
    suggestedFix: titleLen > subtitleLen
      ? '把标题略压短 或 把副标题略加长，让两者长度比接近 1:1.618。'
      : '把副标题略压短 或 把标题略加长，让两者长度比接近 1:1.618。',
  }];
};

/** Two-column 的两列内容长度比应接近 1:1 或 1:φ */
const R_GOLDEN_TWO_COLUMN_BALANCE: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'two-column') return [];
  const data = slide.data as TwoColumnData;
  const leftLen =
    countVisibleChars(data.left?.heading ?? '') +
    countVisibleChars(data.left?.content ?? '') +
    countVisibleChars(data.left?.sub ?? '');
  const rightLen =
    countVisibleChars(data.right?.heading ?? '') +
    countVisibleChars(data.right?.content ?? '') +
    countVisibleChars(data.right?.sub ?? '');

  if (leftLen === 0 || rightLen === 0) return [];

  const ratio = Math.max(leftLen, rightLen) / Math.min(leftLen, rightLen);
  // 可接受范围：1.0-1.25（几乎等长）或 1.45-1.85（黄金带）
  const isBalanced = ratio <= 1.25;
  const isGolden = Math.abs(ratio - PHI) <= PHI_TOLERANCE;
  if (isBalanced || isGolden) return [];

  return [{
    ruleId: 'R_GOLDEN_TWO_COLUMN_BALANCE',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `two-column 两列长度严重失衡 (${leftLen}:${rightLen} ≈ ${ratio.toFixed(2)})。`,
    suggestedFix: '压缩较长的一列，或给较短的一列补内容，让比例接近 1:1 或 1:1.618。',
  }];
};

/** 整个 deck 的 big-number 页数量应该稀缺（黄金分割：约占 1/φ² ≈ 38% 以下） */
const R_BIG_NUMBER_SCARCITY: RuleFn = (slide, ctx) => {
  // 只在最后一页跑一次
  if (ctx.pageIndex !== ctx.totalPages - 1) return [];
  const bigNumberCount = ctx.deck.filter(s => s.layout === 'big-number').length;
  const ratio = bigNumberCount / ctx.totalPages;
  if (ratio <= 0.4) return []; // 合理
  return [{
    ruleId: 'R_BIG_NUMBER_SCARCITY',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `big-number 占 ${(ratio * 100).toFixed(0)}%，过于频繁反而失去冲击力。`,
    suggestedFix: `把部分 big-number 页改成其他布局，保持在 30-40% 以下。`,
  }];
};

// ---- Preset 类规则（受 style preset 影响） ----

/** Preset 偏好的 layout 命中率检查 */
const R_PRESET_LAYOUT_FIT: RuleFn = (slide, ctx) => {
  const preset = ctx.preset;
  if (!preset) return [];
  if (!preset.avoidLayouts?.includes(slide.layout)) return [];
  return [{
    ruleId: 'R_PRESET_LAYOUT_FIT',
    severity: 'warning',
    pageIndex: ctx.pageIndex,
    message: `${preset.displayName.zh} 风格不建议用 ${slide.layout} 布局。`,
  }];
};

// ---- 元素交叠类规则（最高优先级硬约束） ----
//
// maintainer's original words："绝对绝对，不能出现有意义的元素（非装饰元素，如文本框、表格、图片等）
// 互相交叠重叠的情况！！！！"
//
// 对 8 种模板 layout（cover/big-number/three-cards/...），renderSlide.ts 用 CSS grid/flex
// 保证天生不交叠 —— 这里主要防"内容溢出把邻居挤变形"：超量卡片、超长文字块。
//
// 对 pptx-faithful / pdf-faithful 这种绝对定位 rawHtml，必须真正解析元素盒子
// 做 AABB 相交检测，一旦发现有意义元素交叠，直接 error。

/** 解析 rawHtml 里绝对定位的元素盒子，检测两两交叠 */
interface AbsBox {
  idx: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  meaningful: boolean;
  kind: string;
}

function parseAbsBoxes(rawHtml: string): AbsBox[] {
  const boxes: AbsBox[] = [];
  // 粗匹配每一个带 style 的 tag；宽松但足够捕获常见 pptx-to-html 输出
  const tagRe = /<(div|span|p|img|table|h[1-6])\b[^>]*style="([^"]*)"[^>]*>([\s\S]*?)<\/\1>|<img\b[^>]*style="([^"]*)"[^>]*\/?\s*>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = tagRe.exec(rawHtml)) !== null) {
    const style = (m[2] || m[4] || '').toLowerCase();
    if (!style.includes('position:absolute') && !style.includes('position: absolute')) continue;
    const left = pxOf(style, 'left');
    const top = pxOf(style, 'top');
    const width = pxOf(style, 'width');
    const height = pxOf(style, 'height');
    if (left == null || top == null || width == null || height == null) continue;
    if (width < 2 || height < 2) continue;
    const inner = (m[3] || '').replace(/<[^>]+>/g, '').trim();
    const tag = (m[1] || 'img').toLowerCase();
    const isImg = tag === 'img';
    const isTable = tag === 'table';
    const hasText = inner.length > 0;
    // "有意义"元素：有文字 / 图片 / 表格。纯装饰矩形/线条不算。
    const meaningful = hasText || isImg || isTable;
    boxes.push({
      idx: i++,
      left,
      top,
      right: left + width,
      bottom: top + height,
      meaningful,
      kind: isImg ? 'image' : isTable ? 'table' : hasText ? 'text' : 'shape',
    });
  }
  return boxes;
}

function pxOf(style: string, prop: string): number | null {
  const re = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*(-?[0-9.]+)(px|pt|%)?`);
  const m = style.match(re);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  return n; // 同一 rawHtml 内单位一致即可做相对比较
}

function boxesOverlap(a: AbsBox, b: AbsBox, tolerance = 1): boolean {
  return !(
    a.right - tolerance <= b.left ||
    b.right - tolerance <= a.left ||
    a.bottom - tolerance <= b.top ||
    b.bottom - tolerance <= a.top
  );
}

/** 🚨 最高优先级：有意义元素之间绝对不能交叠 */
const R_NO_ELEMENT_OVERLAP: RuleFn = (slide, ctx) => {
  // 只有 pptx-faithful / pdf-faithful 用绝对定位，其他模板 layout 由 CSS grid 保证
  if (slide.layout !== 'pptx-faithful' && slide.layout !== 'pdf-faithful') {
    return [];
  }
  const raw = (slide.data as { rawHtml?: string }).rawHtml;
  if (!raw) return [];

  const boxes = parseAbsBoxes(raw);
  if (boxes.length < 2) return [];

  const violations: RuleViolation[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      // 只关心"有意义 vs 有意义"的交叠；装饰元素被文字盖住是常见手法不报错
      if (!a.meaningful || !b.meaningful) continue;
      if (!boxesOverlap(a, b)) continue;
      const key = `${Math.min(a.idx, b.idx)}-${Math.max(a.idx, b.idx)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        ruleId: 'R_NO_ELEMENT_OVERLAP',
        severity: 'error',
        pageIndex: ctx.pageIndex,
        message: `有意义元素互相交叠：${a.kind}#${a.idx} 与 ${b.kind}#${b.idx}。绝对禁止。`,
        suggestedFix:
          '调整其中一个元素的 left/top/width/height，让两个盒子完全分离，' +
          '或把被遮挡的元素移到空白区。装饰形状不算有意义元素。',
      });
    }
  }
  return violations;
};

/** 防止 grid-cards 卡片超量导致溢出（软性"容量交叠"） */
const R_GRID_CARDS_OVERFLOW: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'grid-cards') return [];
  const cards = (slide.data as GridCardsData).cards ?? [];
  if (cards.length <= 12) return [];
  return [{
    ruleId: 'R_GRID_CARDS_OVERFLOW',
    severity: 'error',
    pageIndex: ctx.pageIndex,
    message: `grid-cards 有 ${cards.length} 张卡片，超出安全容量（最多 12），会溢出或与相邻元素交叠。`,
    suggestedFix: '拆成两页，或删减到 ≤12 张。',
  }];
};

/** 防止 table 行/列/单元格内容过密导致溢出。
 *  渲染层（renderSlide.renderTable）会在内容超出预算时自动收紧字号/边距，但
 *  到 `tight` 一档仍兜不住的极端情况会被 CSS 静默裁剪。这条规则在生成阶段
 *  就提示模型瘦身，避免走到那一步。 */
const R_TABLE_OVERSIZED: RuleFn = (slide, ctx) => {
  if (slide.layout !== 'table') return [];
  const data = slide.data as TableData;
  const rows = data.rows ?? [];
  const headers = data.headers ?? [];
  const violations: RuleViolation[] = [];

  if (rows.length > 6) {
    violations.push({
      ruleId: 'R_TABLE_OVERSIZED',
      severity: 'warning',
      pageIndex: ctx.pageIndex,
      message: `table 有 ${rows.length} 行，超过推荐上限 6 行。`,
      suggestedFix: '拆成两页，或合并相邻行。',
    });
  }
  if (headers.length > 5) {
    violations.push({
      ruleId: 'R_TABLE_OVERSIZED',
      severity: 'warning',
      pageIndex: ctx.pageIndex,
      message: `table 有 ${headers.length} 列，超过推荐上限 5 列。`,
      suggestedFix: '合并相近列，或把次要维度搬到 footnote。',
    });
  }

  // Per-cell length: any single cell over 140 chars is almost guaranteed to
  // force `tight` density and still risk clipping. Average over 60 also pushes
  // the renderer below `roomy`. Both are warnings — let the recheck step nudge.
  let maxCellChars = 0;
  let totalChars = 0;
  let cellCount = 0;
  for (const row of rows) {
    for (const cell of row) {
      const n = countVisibleChars(String(cell ?? ''));
      maxCellChars = Math.max(maxCellChars, n);
      totalChars += n;
      cellCount += 1;
    }
  }
  if (maxCellChars > 140) {
    violations.push({
      ruleId: 'R_TABLE_OVERSIZED',
      severity: 'warning',
      pageIndex: ctx.pageIndex,
      message: `table 中存在长度 ${maxCellChars} 字符的单元格，会挤压表格高度并触发自动收缩。`,
      suggestedFix: '把超长解释挪到 footnote，单元格只保留关键短语（≤60 字符）。',
    });
  } else if (cellCount > 0 && totalChars / cellCount > 60) {
    violations.push({
      ruleId: 'R_TABLE_OVERSIZED',
      severity: 'warning',
      pageIndex: ctx.pageIndex,
      message: `table 平均单元格 ${Math.round(totalChars / cellCount)} 字符，整体偏密。`,
      suggestedFix: '把"why it matters"类长描述挪到 footnote，表格保留事实+短标签。',
    });
  }

  return violations;
};

// ---- Schema 校验：必需字段 / 类型 / 非空 ----

type FieldSpec = {
  field: string;
  type: 'string' | 'array' | 'number' | 'object';
  minItems?: number;
  maxItems?: number;
  itemFields?: string[];
};

const LAYOUT_REQUIRED_FIELDS: Partial<Record<Layout, FieldSpec[]>> = {
  'cover':        [{ field: 'title', type: 'string' }],
  'big-number':   [{ field: 'number', type: 'string' }, { field: 'text', type: 'string' }],
  'three-cards':  [{ field: 'title', type: 'string' }, { field: 'cards', type: 'array', minItems: 2, itemFields: ['label', 'title'] }],
  'two-column':   [{ field: 'title', type: 'string' }, { field: 'left', type: 'object' }, { field: 'right', type: 'object' }],
  'stacked-bars': [{ field: 'title', type: 'string' }, { field: 'bars', type: 'array' }],
  'grid-cards':   [{ field: 'title', type: 'string' }, { field: 'cards', type: 'array' }, { field: 'columns', type: 'number' }],
  'quote':        [{ field: 'quote', type: 'string' }],
  'title-body':   [{ field: 'title', type: 'string' }, { field: 'body', type: 'string' }],
  'icon-list':    [{ field: 'title', type: 'string' }, { field: 'items', type: 'array' }],
  'timeline':     [{ field: 'title', type: 'string' }, { field: 'events', type: 'array' }],
  'table':        [{ field: 'title', type: 'string' }, { field: 'headers', type: 'array' }, { field: 'rows', type: 'array' }],
  // image: 无必需字段
  // split-image: 特殊处理（title 或 body 至少一个）
  // --- Diagrams (10) ---
  'flowchart':    [{ field: 'title', type: 'string' }, { field: 'steps', type: 'array', minItems: 2, maxItems: 8, itemFields: ['text'] }],
  'funnel':       [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 6, itemFields: ['text'] }],
  'pyramid':      [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 6, itemFields: ['text'] }],
  'steps':        [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 8, itemFields: ['label', 'text'] }],
  'matrix':       [{ field: 'title', type: 'string' }, { field: 'topLeft', type: 'string' }, { field: 'topRight', type: 'string' }, { field: 'bottomLeft', type: 'string' }, { field: 'bottomRight', type: 'string' }],
  'versus':       [{ field: 'title', type: 'string' }, { field: 'left', type: 'object' }, { field: 'right', type: 'object' }],
  'venn':         [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 3, itemFields: ['text'] }],
  'bullseye':     [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 5, itemFields: ['text'] }],
  'cycle':        [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 3, maxItems: 6, itemFields: ['text'] }],
  'hub-spoke':    [{ field: 'title', type: 'string' }, { field: 'center', type: 'string' }, { field: 'spokes', type: 'array', minItems: 3, maxItems: 8, itemFields: ['text'] }],
  // --- Charts (7) — bar/horizontal-bar XOR (items vs labels+series) checked in R_LAYOUT_STRUCTURE ---
  'bar-chart':            [{ field: 'title', type: 'string' }],
  'horizontal-bar-chart': [{ field: 'title', type: 'string' }],
  'line-chart':           [{ field: 'title', type: 'string' }, { field: 'labels', type: 'array', minItems: 2 }, { field: 'series', type: 'array', minItems: 1, maxItems: 4 }],
  'stacked-bar-chart':    [{ field: 'title', type: 'string' }, { field: 'labels', type: 'array', minItems: 2 }, { field: 'series', type: 'array', minItems: 1, maxItems: 4 }],
  'pie-chart':            [{ field: 'title', type: 'string' }, { field: 'items', type: 'array', minItems: 2, maxItems: 8, itemFields: ['label', 'value'] }],
  'scatter-chart':        [{ field: 'title', type: 'string' }, { field: 'points', type: 'array', minItems: 3 }],
  'dual-axis-bar':        [{ field: 'title', type: 'string' }, { field: 'labels', type: 'array', minItems: 2 }, { field: 'leftSeries', type: 'object' }, { field: 'rightSeries', type: 'object' }],
  'heatmap':              [{ field: 'title', type: 'string' }, { field: 'rows', type: 'array', minItems: 2 }, { field: 'cols', type: 'array', minItems: 2 }, { field: 'cells', type: 'array', minItems: 2 }],
};

/** R_REQUIRED_FIELDS: 每个 layout 的必需字段必须存在 */
const R_REQUIRED_FIELDS: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  const data = slide.data as Record<string, unknown>;

  // split-image 特殊逻辑
  if (slide.layout === 'split-image') {
    if (!data.body && !data.title) {
      violations.push({
        ruleId: 'R_REQUIRED_FIELDS', severity: 'error', pageIndex: ctx.pageIndex,
        message: 'split-image 必须有 title 或 body（至少一个）。',
        suggestedFix: '添加 title 或 body 字段。',
      });
    }
    return violations;
  }

  const specs = LAYOUT_REQUIRED_FIELDS[slide.layout as Layout];
  if (!specs) return [];

  for (const spec of specs) {
    const value = data[spec.field];
    if (value === undefined || value === null) {
      violations.push({
        ruleId: 'R_REQUIRED_FIELDS', severity: 'error', pageIndex: ctx.pageIndex,
        message: `${slide.layout} 缺少必需字段 ${spec.field}。`,
        suggestedFix: `添加 ${spec.field}（类型：${spec.type}）。`,
      });
      continue;
    }
    // array item-count bounds
    if (Array.isArray(value)) {
      if (spec.minItems !== undefined && value.length < spec.minItems) {
        violations.push({
          ruleId: 'R_REQUIRED_FIELDS', severity: 'error', pageIndex: ctx.pageIndex,
          message: `${slide.layout}.${spec.field} 至少需要 ${spec.minItems} 项（当前 ${value.length}）。`,
          suggestedFix: `补齐到 ${spec.minItems}${spec.maxItems !== undefined ? `-${spec.maxItems}` : '+'} 项。`,
        });
      }
      if (spec.maxItems !== undefined && value.length > spec.maxItems) {
        violations.push({
          ruleId: 'R_REQUIRED_FIELDS', severity: 'error', pageIndex: ctx.pageIndex,
          message: `${slide.layout}.${spec.field} 最多 ${spec.maxItems} 项（当前 ${value.length}）。`,
          suggestedFix: `裁剪到 ${spec.minItems ?? 1}-${spec.maxItems} 项，保留最重要的。`,
        });
      }
    }
    // array item fields check
    if (spec.itemFields && Array.isArray(value)) {
      (value as Record<string, unknown>[]).forEach((item, i) => {
        for (const itemField of spec.itemFields!) {
          if (!item || typeof item !== 'object' || !(itemField in item)) {
            violations.push({
              ruleId: 'R_REQUIRED_FIELDS', severity: 'error', pageIndex: ctx.pageIndex,
              message: `${slide.layout} 的 ${spec.field}[${i}] 缺少 ${itemField}。`,
              suggestedFix: `给 ${spec.field}[${i}] 添加 ${itemField} 字段。`,
            });
          }
        }
      });
    }
  }
  return violations;
};

/** R_DATA_TYPES: 已存在的字段类型必须正确（缺失由 R_REQUIRED_FIELDS 负责） */
const R_DATA_TYPES: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  const data = slide.data as Record<string, unknown>;
  const specs = LAYOUT_REQUIRED_FIELDS[slide.layout as Layout];
  if (!specs) return [];

  for (const spec of specs) {
    const value = data[spec.field];
    if (value === undefined || value === null) continue; // R_REQUIRED_FIELDS handles missing

    let typeOk = false;
    switch (spec.type) {
      case 'string': typeOk = typeof value === 'string'; break;
      case 'number': typeOk = typeof value === 'number'; break;
      case 'array':  typeOk = Array.isArray(value); break;
      case 'object': typeOk = typeof value === 'object' && !Array.isArray(value); break;
    }

    if (!typeOk) {
      violations.push({
        ruleId: 'R_DATA_TYPES', severity: 'error', pageIndex: ctx.pageIndex,
        message: `${slide.layout}.${spec.field} 应该是 ${spec.type}，实际是 ${typeof value}。`,
        suggestedFix: `把 ${spec.field} 改成 ${spec.type} 类型。`,
      });
    }
  }
  return violations;
};

/** R_NON_EMPTY_CONTENT: 关键 string 字段不能是空白 */
const NON_EMPTY_FIELDS: Partial<Record<Layout, string[]>> = {
  'cover':      ['title'],
  'big-number': ['number', 'text'],
  'quote':      ['quote'],
  'title-body': ['title', 'body'],
};

const R_NON_EMPTY_CONTENT: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  const fields = NON_EMPTY_FIELDS[slide.layout as Layout];
  if (!fields) return [];

  const data = slide.data as Record<string, unknown>;
  for (const field of fields) {
    const value = data[field];
    if (typeof value === 'string' && value.trim().length === 0) {
      violations.push({
        ruleId: 'R_NON_EMPTY_CONTENT', severity: 'error', pageIndex: ctx.pageIndex,
        message: `${slide.layout}.${field} 是空白，缺少内容。`,
        suggestedFix: `给 ${field} 填入有意义的内容。`,
      });
    }
  }
  return violations;
};

/** R_LAYOUT_STRUCTURE: 跨字段语义校验（LAYOUT_REQUIRED_FIELDS 的 schema 粒度
 *  cover 不到的），包括 matrix 四象限非空 / versus 两侧 points 非空 / horizontal-bar
 *  items XOR (labels+series) / chart unit 格式 */
const R_LAYOUT_STRUCTURE: RuleFn = (slide, ctx) => {
  const violations: RuleViolation[] = [];
  const data = slide.data as Record<string, unknown>;
  const layout = slide.layout as Layout;

  if (layout === 'matrix') {
    for (const q of ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']) {
      const v = data[q];
      if (typeof v !== 'string' || v.trim().length === 0) {
        violations.push({
          ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
          message: `matrix.${q} 必须非空（四象限都要有内容，否则退化成列表）。`,
          suggestedFix: `给 ${q} 填入该象限的简短描述（≤10 汉字）。如果内容只够 3 个象限，改用 three-cards 或 versus。`,
        });
      }
    }
  }

  if (layout === 'versus') {
    const left = data.left as { points?: unknown[] } | undefined;
    const right = data.right as { points?: unknown[] } | undefined;
    const leftPts = Array.isArray(left?.points) ? left!.points! : [];
    const rightPts = Array.isArray(right?.points) ? right!.points! : [];
    if (leftPts.length === 0) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: 'versus.left.points 不能为空。',
        suggestedFix: '给 left.points 至少填 1 条要点（每侧 2-5 条最佳）。',
      });
    }
    if (rightPts.length === 0) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: 'versus.right.points 不能为空。',
        suggestedFix: '给 right.points 至少填 1 条要点（每侧 2-5 条最佳）。',
      });
    }
  }

  if (layout === 'bar-chart') {
    const itemsArr = Array.isArray(data.items) ? (data.items as unknown[]) : null;
    const labelsArr = Array.isArray(data.labels) ? (data.labels as unknown[]) : null;
    const seriesArr = Array.isArray(data.series) ? (data.series as unknown[]) : null;
    const hasItems = itemsArr !== null && itemsArr.length >= 2;
    const hasGrouped = labelsArr !== null && labelsArr.length >= 2 && seriesArr !== null && seriesArr.length >= 1;
    if (!hasItems && !hasGrouped) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: 'bar-chart 需要 items[{label,value}]（单 series）或 labels[]+series[{name,values[]}]（分组柱）。',
        suggestedFix: '二选一：单实体多类目用 items；多实体×多年份/类目用 labels+series。',
      });
    }
    if (hasGrouped && seriesArr!.length > 6) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: `bar-chart.series 最多 6 组（当前 ${seriesArr!.length}）。`,
        suggestedFix: '裁到 6 个最重要的 series；超过会让单 bar 太窄读不出。',
      });
    }
    if (hasItems && itemsArr!.length > 12) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: `bar-chart.items 最多 12 条（当前 ${itemsArr!.length}）。`,
        suggestedFix: '裁到 12 条；超过这个数量纵向柱图密度过高。',
      });
    }
  }

  if (layout === 'horizontal-bar-chart') {
    const itemsArr = Array.isArray(data.items) ? (data.items as unknown[]) : null;
    const labelsArr = Array.isArray(data.labels) ? (data.labels as unknown[]) : null;
    const seriesArr = Array.isArray(data.series) ? (data.series as unknown[]) : null;
    const hasItems = itemsArr !== null && itemsArr.length > 0;
    const hasGrouped = labelsArr !== null && labelsArr.length > 0 && seriesArr !== null && seriesArr.length > 0;
    if (!hasItems && !hasGrouped) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: 'horizontal-bar-chart 需要 items[{label,value}]（单 series）或 labels[]+series[{name,values[]}]（分组柱）。',
        suggestedFix: '二选一，根据"多实体×多指标"选 labels+series，"单实体排名"选 items。',
      });
    }
    if (hasGrouped && seriesArr!.length > 6) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: `horizontal-bar-chart.series 最多 6 组（当前 ${seriesArr!.length}）。`,
        suggestedFix: '裁到 6 个最重要的 series；超过 6 个图例会挤爆。',
      });
    }
    if (hasItems && itemsArr!.length > 8) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: `horizontal-bar-chart.items 最多 8 条（当前 ${itemsArr!.length}）。`,
        suggestedFix: '裁到 8 条最重要的类目。',
      });
    }
  }

  const chartLayouts = new Set<Layout>([
    'bar-chart', 'horizontal-bar-chart', 'line-chart',
    'stacked-bar-chart', 'pie-chart', 'scatter-chart', 'dual-axis-bar', 'heatmap',
  ]);
  if (chartLayouts.has(layout) && typeof data.unit === 'string' && data.unit.length > 0) {
    const u = data.unit;
    if (u.length > 4 || /\s|\//.test(u)) {
      violations.push({
        ruleId: 'R_LAYOUT_STRUCTURE', severity: 'error', pageIndex: ctx.pageIndex,
        message: `${layout}.unit 必须 ≤4 字符、无空格无斜杠（当前："${u}"）。`,
        suggestedFix: '复合单位（如 "% / 10k units"）放到 chart title 里说明；unit 只留纯单位（如 "%", "万", "mo"）。',
      });
    }
  }

  return violations;
};

// ============================================================================
// 规则注册表
// ============================================================================

const RULES: { id: string; fn: RuleFn }[] = [
  // 文本长度类（硬约束）
  { id: 'R_TITLE_LENGTH',          fn: R_TITLE_LENGTH },
  { id: 'R_CARD_DESC_LENGTH',      fn: R_CARD_DESC_LENGTH },
  { id: 'R_CARD_LABEL_LENGTH',     fn: R_CARD_LABEL_LENGTH },
  { id: 'R_NO_EMOJI_IN_ICON',      fn: R_NO_EMOJI_IN_ICON },
  { id: 'R_BIG_NUMBER_IS_NUMBER',  fn: R_BIG_NUMBER_IS_NUMBER },
  { id: 'R_QUOTE_LENGTH',          fn: R_QUOTE_LENGTH },
  // 结构类（硬约束）
  { id: 'R_CARD_COUNT',            fn: R_CARD_COUNT },
  { id: 'R_BAR_COUNT',             fn: R_BAR_COUNT },
  { id: 'R_TWO_COLUMN_BOTH_SIDES', fn: R_TWO_COLUMN_BOTH_SIDES },
  // 跨页一致性
  { id: 'R_DECK_BOOKENDS',         fn: R_DECK_BOOKENDS },
  { id: 'R_LAYOUT_REPETITION',     fn: R_LAYOUT_REPETITION },
  { id: 'R_KEYWORD_REPETITION',    fn: R_KEYWORD_REPETITION },
  // 斐波那契 / 黄金分割（审美偏好，warning 级）
  { id: 'R_FIBONACCI_CARD_COUNT',  fn: R_FIBONACCI_CARD_COUNT },
  { id: 'R_FIBONACCI_BAR_COUNT',   fn: R_FIBONACCI_BAR_COUNT },
  { id: 'R_GOLDEN_COVER_RATIO',    fn: R_GOLDEN_COVER_RATIO },
  { id: 'R_GOLDEN_TWO_COLUMN_BALANCE', fn: R_GOLDEN_TWO_COLUMN_BALANCE },
  { id: 'R_BIG_NUMBER_SCARCITY',   fn: R_BIG_NUMBER_SCARCITY },
  // Preset 相关
  { id: 'R_PRESET_LAYOUT_FIT',     fn: R_PRESET_LAYOUT_FIT },
  // Schema 校验：必需字段 / 类型 / 非空（硬约束）
  { id: 'R_REQUIRED_FIELDS',       fn: R_REQUIRED_FIELDS },
  { id: 'R_DATA_TYPES',            fn: R_DATA_TYPES },
  { id: 'R_NON_EMPTY_CONTENT',     fn: R_NON_EMPTY_CONTENT },
  { id: 'R_LAYOUT_STRUCTURE',      fn: R_LAYOUT_STRUCTURE },
  // 🚨 元素交叠（最高优先级硬约束）
  { id: 'R_NO_ELEMENT_OVERLAP',    fn: R_NO_ELEMENT_OVERLAP },
  { id: 'R_GRID_CARDS_OVERFLOW',   fn: R_GRID_CARDS_OVERFLOW },
  { id: 'R_TABLE_OVERSIZED',       fn: R_TABLE_OVERSIZED },
];

// ============================================================================
// 公开 API
// ============================================================================

/**
 * 对一份完整的 deck 跑一遍所有规则。返回聚合报告。
 * 这是 orchestrator 在每一轮生成之后的必经闸门。
 */
export function validateDeck(
  deck: Slide[],
  preset?: StylePreset,
): RuleReport {
  const violations: RuleViolation[] = [];
  const perPage: RuleReport['perPage'] = [];

  deck.forEach((slide, pageIndex) => {
    const ctx: RuleContext = {
      pageIndex,
      totalPages: deck.length,
      deck,
      preset,
    };
    const pageViolations: RuleViolation[] = [];
    for (const rule of RULES) {
      try {
        pageViolations.push(...rule.fn(slide, ctx));
      } catch (err) {
        // 一个规则崩了不应该影响别的规则
        console.warn(`[goldenRules] rule ${rule.id} threw:`, err);
      }
    }
    violations.push(...pageViolations);
    perPage.push({
      pageIndex,
      pass: pageViolations.every(v => v.severity !== 'error'),
      errors: pageViolations.filter(v => v.severity === 'error').length,
      warnings: pageViolations.filter(v => v.severity === 'warning').length,
    });
  });

  return {
    pass: violations.every(v => v.severity !== 'error'),
    violations,
    perPage,
  };
}

/**
 * 对单页跑规则（edit-page workflow 使用）。
 */
export function validateSlide(
  slide: Slide,
  pageIndex: number,
  deck: Slide[],
  preset?: StylePreset,
): RuleViolation[] {
  const ctx: RuleContext = {
    pageIndex,
    totalPages: deck.length,
    deck,
    preset,
  };
  const violations: RuleViolation[] = [];
  for (const rule of RULES) {
    try {
      violations.push(...rule.fn(slide, ctx));
    } catch (err) {
      console.warn(`[goldenRules] rule ${rule.id} threw:`, err);
    }
  }
  return violations;
}

/**
 * 把 RuleReport 压缩成可以直接塞进 LLM fix prompt 的文字。
 */
export function formatViolationsForPrompt(violations: RuleViolation[]): string {
  if (violations.length === 0) return '(无问题)';
  return violations
    .filter(v => v.severity === 'error')
    .map(v => {
      const head = `第 ${v.pageIndex + 1} 页: ${v.message}`;
      return v.suggestedFix ? `${head}\n  → ${v.suggestedFix}` : head;
    })
    .join('\n');
}

// ============================================================================
// 辅助函数
// ============================================================================

function extractTitle(slide: Slide): string | undefined {
  const data = slide.data as Record<string, unknown>;
  switch (slide.layout) {
    case 'cover':
      return (data as unknown as CoverData).title;
    case 'big-number':
      return (data as unknown as BigNumberData).text;
    case 'three-cards':
    case 'two-column':
    case 'stacked-bars':
    case 'grid-cards':
      return (data as { title?: string }).title;
    case 'quote':
      return (data as unknown as QuoteData).quote;
    case 'image':
      return (data as unknown as ImageData).title;
    case 'title-body':
      return (data as unknown as TitleBodyData).title;
    case 'split-image':
      return (data as unknown as SplitImageData).title;
    case 'icon-list':
      return (data as unknown as IconListData).title;
    case 'timeline':
      return (data as unknown as TimelineData).title;
    case 'table':
      return (data as unknown as TableData).title;
    default:
      return undefined;
  }
}

/** 近似字符数：CJK 算 1，其他 2 个字符算 1（因为英文占位窄） */
function countVisibleChars(s: string): number {
  let count = 0;
  for (const ch of s) {
    if (/[\u4e00-\u9fff\u3000-\u303f]/.test(ch)) {
      count += 1; // CJK
    } else if (/\s/.test(ch)) {
      count += 0.5;
    } else {
      count += 0.5; // 英文字母大致按半宽算
    }
  }
  return Math.ceil(count);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}

/** 找到离 n 最近的斐波那契数（在 2-13 范围内） */
function nearestFib(n: number): number {
  const fibs = [2, 3, 5, 8, 13];
  return fibs.reduce((best, f) => Math.abs(f - n) < Math.abs(best - n) ? f : best);
}

/** 粗粒度分词：中文按字拆，英文按空格拆 */
function tokenize(s: string): string[] {
  const tokens: string[] = [];
  const cjkPart = s.match(/[\u4e00-\u9fff]+/g) ?? [];
  const englishWords = s.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  // CJK: 2-gram（更能代表"关键词"）
  for (const seg of cjkPart) {
    for (let i = 0; i + 2 <= seg.length; i++) {
      tokens.push(seg.slice(i, i + 2));
    }
  }
  tokens.push(...englishWords);
  return tokens;
}

// Export RULES for debugging / eval inspection
export const __INTERNAL__ = { RULES };

// Layout 类型的使用者无需引用 Layout 但保留以便未来扩展
export type { Layout };
