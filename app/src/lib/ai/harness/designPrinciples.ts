// ============================================================================
// Lasca AI Harness — Design Principles (审美底座)
// ============================================================================
//
// 蒸馏自 Claude Code 官方 skill: frontend-design
// 安装：/plugin marketplace add anthropics/claude-code
//       /plugin install frontend-design@claude-code-plugins
//
// 上游 SKILL.md:
//   https://raw.githubusercontent.com/anthropics/claude-code/main/plugins/frontend-design/skills/frontend-design/SKILL.md
//
// 这是 Lasca 全部 AI prompt 的审美 single source of truth：
//   - 原生生成路径 (/api/ai/generate → orchestrator → prompts.ts) 引用
//   - faithful polish 路径 (/api/ai/polish → pptxPolishSystemPrompt) 引用
//   - recheck 路径 (recheckSystemPrompt) 引用
//
// 为什么不直接用插件本身？Claude Code skill 只在 Claude Code session 内对模型起
// 作用；Lasca 的 API route 通过 @anthropic-ai/sdk 直接调 Anthropic API，那条路径
// 接触不到 skill。所以装插件 ≠ 集成 — 必须把内容蒸馏到 runtime prompt 层。
//
// 如果上游 SKILL.md 更新，重新蒸馏并同步本文件。
// ============================================================================

/**
 * Lasca 当前在 layout.tsx 加载的 distinctive 字体配对。AI 必须从这里挑，
 * 不允许凭空捏造字体名 — 不在这个清单里的字体不会被浏览器加载。
 *
 * 与 app/src/app/layout.tsx 的 next/font/google 加载严格一一对应。
 * 改这里之前先改 layout.tsx + globals.css。
 */
export const DESIGN_FONT_PAIRS = [
  {
    id: 'editorial-serif',
    display: 'Fraunces',
    body: 'Lora',
    cssDisplayVar: '--font-display-serif',
    cssBodyVar: '--font-body-serif',
    vibe: '杂志感 / 编辑部 / 全衬线 / 长读',
  },
  {
    id: 'warm-modern',
    display: 'Fraunces',
    body: 'Plus Jakarta Sans',
    cssDisplayVar: '--font-display-serif',
    cssBodyVar: '--font-body-sans',
    vibe: 'serif display + sans body / 温暖现代 / 故事感',
  },
  {
    id: 'modern-sans',
    display: 'Bricolage Grotesque',
    body: 'Plus Jakarta Sans',
    cssDisplayVar: '--font-display-sans',
    cssBodyVar: '--font-body-sans',
    vibe: '极简 / Linear / 科技 / 高对比',
  },
] as const;

export type DesignFontPairId = typeof DESIGN_FONT_PAIRS[number]['id'];

/**
 * 必须避免的反模式。直接抽取自 SKILL.md 的 "NEVER use generic AI-generated
 * aesthetics" 段落，并补充 Lasca-specific 项。
 */
export const BANNED_AESTHETICS: readonly string[] = [
  'Inter / Arial / Roboto / Helvetica / system-ui 作为主字体',
  '紫色渐变 + 白底（最典型的 AI slop 配色）',
  '所有元素居中对齐 + 灰底（"安全牌"布局）',
  '均匀分布的彩虹调色板（每个色权重相同）',
  '绝对禁止在 icon / tile / bento / card / featured-grid 任何 icon 字段里放 emoji（⏰⚙️💅💻🚀✨等都是 AI slop 标志）—— 需要符号就用排印字符（§ ★ ◆ → ● 1–9）或留空让系统生成几何图形',
  'Space Grotesk —— 已被 AI 生成内容用滥（SKILL.md 显式警告 NEVER converge on this）',
  // Report 类型反模式
  '密集文字墙 + 小字号（report 不是 Word 文档，要有视觉呼吸）',
  '标题和正文字号差距 < 2 倍（层级不清晰）',
  '纯文字页面无视觉锚点（至少要有数字、引用、或分隔线）',
  '段落间距 = 行距（视觉粘连，无法快速扫读）',
  '超过 4 级字号层级（过度复杂，破坏统一感）',
];

/**
 * Lasca-tuned 设计原则 preamble。约 350 token。
 *
 * 注入策略：作为 system prompt 的最前面一段，**所有** Lasca AI 调用都加这段。
 * 这样 generate / edit / polish / recheck 看到的是同一套审美底线。
 */
export const DESIGN_PRINCIPLES_PROMPT = `## 设计底座（必须遵守，所有幻灯片审美决策的最高优先级）

你正在为 Lasca 演示文稿做审美设计。每一张幻灯片都必须有一个**明确的审美方向**，而不是"安全的居中 + 灰底 + 通用字体"。

### 核心：Intentionality（意图性）
Bold maximalism 和 refined minimalism 都可以做出好作品。关键不是强度，而是**方向是否清晰**、是否始终如一。如果一页拿掉所有装饰之后看起来像 100 个其他 deck 的一页，那就是失败。

### Typography（字体）
- **绝对禁止**主字体：Inter、Arial、Roboto、Helvetica、system-ui — 这些是最典型的 AI slop。
- **必须**从 Lasca 已加载的 distinctive 字体里挑：display 用 \`Fraunces\`（serif，editorial）或 \`Bricolage Grotesque\`（sans，有性格的 grotesque）；body 用 \`Plus Jakarta Sans\`（refined sans）或 \`Lora\`（serif）。
- 引用 CSS 变量而不是字体名字符串：\`var(--font-display-serif)\` / \`var(--font-display-sans)\` / \`var(--font-body-sans)\` / \`var(--font-body-serif)\`。
- display 和 body 的搭配要刻意。三种合法配对：全 serif（Fraunces + Lora）/ 暖现代（Fraunces + Plus Jakarta Sans）/ 全 sans（Bricolage Grotesque + Plus Jakarta Sans）。

### Color（色彩）
- 不要均匀分布的调色板。挑 1-2 个**主导色** + 1 个尖锐 **accent**。
- **绝对禁止**：紫色渐变 + 白底。
- 主色要承担情绪：暖橙 #d97757 = 故事感 / 黑 + 电蓝 = 科技感 / 米白 + 深褐 = 编辑部感 / 饱和橙 + 互补色 = 活泼感。

### Spatial Composition（空间）
- 优先非对称、留白对比、出格元素。
- 避免无脑居中。封面优先大字号 + 大量负空间。
- 多元素布局可以错位排列以打破网格。

### Visual Hierarchy（层次感）
- **前景**：主要信息（标题、关键数字、核心观点）— 最大字号、最高对比度、占据视觉焦点
- **中景**：支撑信息（副标题、说明文字、卡片内容）— 中等字号、适度对比
- **背景**：装饰元素（底纹、分隔线、辅助图形）— 低对比度、不抢夺注意力
- 三层必须有明确的**视觉权重差**：前景 vs 中景字号比 ≥ 2:1，中景 vs 背景对比度差 ≥ 40%

### Report 专属规则（当 pageSize = letter 或 a4 时）
- **纵向优化**：利用垂直空间，标题可以占据上 1/4，正文分 2-3 栏
- **段落呼吸**：段落间距 = 1.5-2× 行距，避免文字墙
- **视觉锚点**：每页至少有 1 个非文字元素（数字、引用框、分隔线、小图表）
- **字号层级**：最多 3 级（标题 / 正文 / 注释），标题 vs 正文 ≥ 2:1
- **边距慷慨**：上下左右边距 ≥ 页面尺寸的 8%，给内容留出呼吸空间

### Differentiation（记忆点）
每页必须有一个让人**记得住**的元素：一个意外的字号、一个出格位置、一个反差色、一句金句。

### 执行精度
Minimal 设计要在间距、对齐、字距上做到精确；maximalist 设计要把效果细节填满。**两者都不能半吊子。**`;

/**
 * Helper：根据 preset id 推荐字体配对。stylePresets.ts 引用这个函数，
 * 把字体配对信息注入到各 preset 的 promptAppendix 里。
 */
export function recommendedFontPair(presetId: string): typeof DESIGN_FONT_PAIRS[number] {
  switch (presetId) {
    // All-serif presets
    case 'editorial':
    case 'airbnb':    // 窑变: Fraunces italic + Lora — all-serif warmth
    case 'bilingual-report':  // Kai body + Fraunces/Lora for EN; all-serif warmth
      return DESIGN_FONT_PAIRS[0]; // editorial-serif

    // Warm-modern (serif display + sans body)
    case 'warm':
    case 'playful':
    case 'notion':    // 和紙: Fraunces light + Plus Jakarta — contemplative
      return DESIGN_FONT_PAIRS[1]; // warm-modern

    // Modern-sans (sans display + sans body)
    case 'minimal':
    case 'dark-tech':
    case 'stripe':    // 冰锋: Plus Jakarta ultra-thin
    case 'apple':     // 月白: Plus Jakarta refined
    case 'spotify':   // 极光: Bricolage Grotesque bold + Plus Jakarta
    case 'vercel':    // 碑文: Bricolage Grotesque ultra-bold + Familjen Grotesk
    case 'linear':    // 黑曜: Familjen Grotesk + Plus Jakarta
    case 'ferrari':   // 墨金: Fraunces italic + Plus Jakarta (cross-category)
    default:
      return DESIGN_FONT_PAIRS[2]; // modern-sans
  }
}
