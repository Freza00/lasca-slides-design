// ============================================================================
// Lasca AI Harness — Style Presets
// ============================================================================
// Style preset 是 Lasca 审美稳定性的主要来源。
//
// 用户洞察："harness 的价值是让 AI 朝着 user 想要的方向，有成熟的风格。"
// Preset 就是那些"成熟的风格"。
//
// 每个 preset = 一套约束包：追加的 prompt 指令 + 偏好 layout + 硬限制。
// Clarifier 让用户挑 preset，orchestrator 把 preset 注入到 generation + 校验两端。
//
// 未来：从 public design-system reference repos 同步 58+ 套 DESIGN.md
// 作为扩展 preset 库。v0.1 先手写 5 个核心 preset。
// ============================================================================

import type {
  StylePreset, StylePresetId, BuiltinPresetId,
  ComputedPreset, PresetInputs, EyebrowConvention, ThemeFamily,
} from './types';
import type { Layout, SlideCoverVariant } from '../../types';
import { THEMES } from '../../themes';

// ----- minimal: developer-tool / clean-tech aesthetic -----

const MINIMAL: StylePreset = {
  id: 'minimal',
  format: 'slide',
  displayName: { zh: '极简', en: 'Minimal' },
  tagline: { zh: '大留白、单色系、几何精准', en: 'Generous whitespace, monochrome, geometric precision' },
  theme: 'warm', // 在 warm 基础上 override 成单色
  promptAppendix: `
## 极简风格约束 — Geometric Minimalism

### 核心识别：减法的艺术
极简不是"什么都没有"，而是**只留下必要的**。每个元素都必须回答"如果去掉它，这页还能传达信息吗？"如果答案是"能"，那就去掉。Source: Dieter Rams 的第十条原则 "Good design is as little design as possible"。

### Typography 规则
- **标题**：\`var(--font-display-sans)\`（Bricolage Grotesque），weight 600，letter-spacing -0.02em（略紧——增加密度感）
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 400，line-height 1.6
- **字号对比强烈**：标题 vs 正文 ≥ 2.5:1（48px vs 18px）——极简需要清晰的层级
- **绝对禁止**：Inter / Arial / Helvetica（这些字体太"安全"，没有性格）
- **数字**：用 tabular-nums (\`font-variant-numeric: tabular-nums\`)，让数字对齐如表格

### 空间 × 构图
- **留白 ≥ 60%**——极简的力量来自空间，不是元素
- **一页一个观点**：如果需要说两件事，那就是两页。绝不妥协
- **每页可视元素 ≤ 4 个**：标题 + 1-3 个支撑元素（数字/图表/一句话）
- **对齐是灵魂**：所有元素必须对齐到同一条隐形网格线。左对齐优先，居中次之，绝不混用
- **间距系统**：8px 基准单位。所有间距必须是 8 的倍数（16/24/32/48/64）

### 色彩策略
- **单色系 + 1 个强调色**：主色（黑/深灰）+ 中性灰阶 + 1 个饱和强调色（电蓝/荧光绿/纯红）
- 背景：纯白 #ffffff 或极浅灰 #fafafa
- 文字：深灰 #1a1a1a（不是纯黑——纯黑对比度过高，视觉疲劳）
- 强调色**只用于一个元素**：一个数字、一条下划线、一个图标。一页最多出现一次
- **禁止渐变、禁止纹理、禁止阴影**（阴影是"装饰"——极简不需要装饰）

### 文案人格
- **名词为主，动词精简**：去掉所有"其实"、"非常"、"真的"、"一些"、"可能"
- **标题用陈述句**：不用疑问句（疑问句是"引导"，极简是"断言"）、不用感叹号（感叹号是"强调"，极简不需要强调——它本身就是强调）
- **数字说话**：用精确数字代替形容词。不说"大幅增长"，说"+127%"
- **标题 ≤ 6 个词**：每个词都必须承载信息，没有填充词
- 适合：产品发布、数据报告、技术文档、战略规划、投资者简报

### 布局偏好
- **big-number**：极简的明星布局——一个巨大数字 + 一句解释
- **cover**：大标题 + 大留白，不需要其他任何东西
- **two-column**：左右分栏，清晰的信息分组
- **quote**：一句话占据整页，其余全是空白
- **避免**：grid-cards（太多元素）、stacked-bars（视觉复杂）
`.trim(),
  preferredLayouts: ['big-number', 'cover', 'two-column', 'quote'],
  avoidLayouts: ['grid-cards', 'stacked-bars'],
  maxFontLevels: 3,
};

// ----- warm: Lasca 招牌暖色（默认） -----

const WARM: StylePreset = {
  id: 'warm',
  format: 'slide',
  displayName: { zh: '温暖（Lasca 招牌）', en: 'Warm (Lasca Signature)' },
  tagline: { zh: '暖橙色系，适合复盘、汇报、内部分享', en: 'Warm orange palette, great for reviews, reports, internal sharing' },
  theme: 'warm',
  promptAppendix: `
## 温暖风格约束 — Storytelling Warmth

### 核心识别：像在讲故事
温暖不是"加暖色"，而是**有人情味的叙事节奏**。每个 deck 都是一个故事：有开头（我们从哪里来）、转折（遇到了什么）、收束（现在到了哪里）。观众看完后记住的不只是数据，还有"这个团队经历了什么"。

### Typography 规则
- **标题**：\`var(--font-display-serif)\`（Fraunces），weight 500-600，SOFT 轴 50-75（适度柔和）——serif 标题给故事感，像杂志封面
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 400，line-height 1.7
- **serif display + sans body** 的搭配是温暖现代感的核心——标题有温度，正文有清晰度
- **字号对比适中**：标题 vs 正文 = 2:1（不要太极端——温暖是"亲近"而非"震撼"）
- **允许标题有情感温度**：可以用"我们终于做到了"这种带情绪的表达，但不煽情

### 空间 × 构图
- **留白 40-50%**——比极简少，但仍然慷慨。温暖需要呼吸空间
- **非对称但不极端**：标题可以偏左，但不要完全贴边。像手写信的自然排版
- **每页至少有一个能被记住的具体细节**：数字、引用、例子、人名、场景
- **卡片圆角 12px**——柔和但不过度，像圆润的陶器边缘
- **卡片有温暖的阴影**：rgba(217,119,87,0.08) 暖橙色调阴影，2-3 层叠加

### 色彩策略
- **主色 #d97757 暖橙**（Lasca 招牌色）——用于标题强调、关键数字、section 分隔
- 背景 #faf9f5（米白色，比纯白温暖 3%——像老照片的底色）
- 文字 #2d2d2d（温暖的深灰，不是冷黑）
- **辅助色 #c17a5f 赭石**——用于次级强调、图标、标签
- **点缀色 #8b7355 深褐**——用于引用边框、分隔线
- 暖色系的灰阶：#e8e4df / #d4cfc8 / #b8b0a8（所有灰色都偏暖）

### 文案人格
- **像在讲一个故事**：有开头、转折、收束。不是平铺直叙的数据列表
- **可以用"我们"、"你"、"一起"**——拉近关系的词，但不过度使用
- **节奏自然**：长短句交替，不要全是短句（太急促）也不要全是长句（太拖沓）
- **每页有一个记忆点**：一个意外的数字、一句用户原话、一个转折点、一个具体场景
- **允许适度的情感表达**：可以说"这是艰难的一个月"，但不说"这是史上最艰难的一个月！！！"
- 适合：团队复盘、季度汇报、内部分享、用户故事、产品回顾、年终总结

### 布局偏好
- **three-cards**：讲三个并列的故事/案例/阶段
- **two-column**：对比/前后/问题-解决
- **big-number**：关键 metric 作为故事的转折点
- **quote**：用户原话、团队感悟——故事里的"金句"
- **cover**：故事的开场——标题要有"钩子"
`.trim(),
  preferredLayouts: ['three-cards', 'two-column', 'big-number', 'quote', 'cover'],
  maxFontLevels: 4,
};

// ----- dark-tech: terminal-style -----

const DARK_TECH: StylePreset = {
  id: 'dark-tech',
  format: 'slide',
  displayName: { zh: '深色科技（终端感）', en: 'Dark Tech (Terminal)' },
  tagline: { zh: '黑底、等宽字、冷峻', en: 'Dark background, monospace, cold and sharp' },
  theme: 'dark',
  promptAppendix: `
## 深色科技风格约束 — Terminal Precision

### 核心识别：机器的语言
不是"深色模式"——是**工程师写给工程师的**。每一行文字都像 git commit message：精确、无废话、有意义。美感来自信息密度和排版精度，不来自装饰。

### Typography 规则
- **标题**：\`var(--font-display-sans)\`（Bricolage Grotesque），weight 600，letter-spacing -0.02em
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 400，line-height 1.6
- **技术术语**：用 \`font-family: monospace\` 的 inline code 样式标记（API、webhook、v2.3 等）
- **绝对禁止**：Inter / Roboto / system-ui——那是最普通的科技 PPT
- **数字**：tabular-nums，字号比正文大 1.5-2×，用强调色高亮

### 空间 × 构图
- **信息密度适中**：不像极简那么空，但每个元素都有存在理由
- **左对齐为主**：像终端输出，从左边开始，整齐排列
- **卡片用 1px 边框**：rgba(255,255,255,0.08)——像终端窗口的边框，微妙但清晰
- **分隔线**：1px 水平线，rgba(255,255,255,0.1)——像代码编辑器的行分隔
- **圆角 4-6px**：保持利落感，不要太圆

### 色彩策略
- 背景 #0a0a0a（接近纯黑，但不是纯黑——纯黑太"设计感"，这个更像真实终端）
- 文字 #e8e8e8（不是纯白——纯白在深色底上刺眼）
- **强调色选一个**：荧光绿 #00ff88 / 电蓝 #00d4ff / 琥珀 #ffb800——只选一个，全 deck 统一
- 强调色**只用于关键数字、状态标签、CTA**——像终端里的高亮输出
- 次级文字 #888888（muted，像注释）
- **禁止暖色**：没有橙色、红色（除非是错误状态）、黄色

### 文案人格
- **Changelog 语气**：冷、直接、像 release notes。"支持批量导出" 而不是 "我们很高兴地宣布支持批量导出！"
- **标题是断言**：不用问句，不用感叹号，不用"我们"
- **数字和技术术语要突出**：这是工程师最关心的
- **标点简洁**：中英混排时英文前后加空格。允许用 \`backtick\` 标记技术术语
- **禁止**：感叹号、emoji（除 ✅ ❌ 状态符号）、温暖词汇、煽情表达
- 适合：技术分享、产品 roadmap、工程复盘、API 文档、系统架构介绍
`.trim(),
  preferredLayouts: ['big-number', 'stacked-bars', 'two-column', 'cover', 'quote'],
  avoidLayouts: ['three-cards'],
  maxFontLevels: 3,
};

// ----- editorial: 杂志 / 长读感 -----

const EDITORIAL: StylePreset = {
  id: 'editorial',
  format: 'slide',
  displayName: { zh: '编辑部（杂志感）', en: 'Editorial (Magazine Style)' },
  tagline: { zh: '衬线字、非对称、像 The New Yorker', en: 'Serif type, asymmetric layout, The New Yorker feel' },
  theme: 'warm',
  promptAppendix: `
## 编辑部风格约束 — Magazine Editorial

### 核心识别：每页都是一篇文章的开头
编辑部的美学来自印刷杂志：**衬线字体的温度 + 非对称构图的张力 + 精心选择的留白**。每一页都像 The New Yorker 的封面——有悬念、有层次、有让人想继续读下去的冲动。

### Typography 规则
- **标题**：\`var(--font-display-serif)\`（Fraunces），weight 600-700，SOFT 轴 50——杂志封面标题的气质
- **正文**：\`var(--font-body-serif)\`（Lora），weight 400，line-height 1.8——**全衬线配对**是这个 preset 的核心识别特征
- **全衬线**：display Fraunces + body Lora。绝不混入 sans-serif——衬线的统一感是编辑部气质的来源
- **标题可以长**：10-15 字的标题是允许的，像杂志封面故事标题
- **副标题是导语**：一句话交代"为什么这件事重要"，像文章的 lede

### 空间 × 构图
- **非对称是灵魂**：标题靠左偏上，大面积右侧或下方留白。像杂志的跨页排版
- **宽边距**：上下左右边距比其他 preset 大 20%——给内容"呼吸的框架"
- **错位排列**：标题和副标题可以不在同一对齐线上，制造视觉张力
- **引用框**：用左侧 3px 竖线 + 缩进标记引用，像报纸的 pull quote
- **卡片圆角 8px**，阴影极淡（rgba(0,0,0,0.04)）——编辑部不需要"浮起来"的感觉

### 色彩策略
- 背景 #faf8f4（暖白，像高级杂志的纸张）
- 文字 #1a1208（深暖褐，像印刷墨水）
- **强调色 #8b4513 赭石**——用于引用标记、关键词下划线、section 标题
- **点缀色 #c17a5f 赭橙**——偶尔用于数字、标签
- 卡片背景 #f5f0e8（比页面背景略深，像杂志内页的色块）
- **禁止**：高饱和色、渐变、深色背景（编辑部是纸张的颜色）

### 文案人格
- **标题有悬念感**：让人想继续读。"我们烧了 30 万才发现的真相" 比 "Q1 复盘" 更编辑部
- **副标题是导语**：一句话交代背景和重要性
- **允许文学性**：比喻、排比、对仗都可以。这是唯一允许修辞的 preset
- **每页至少有一个金句**：可以是引用、可以是数据、可以是一个反直觉的结论
- **quote layout 用得比其他 preset 多**：引用是编辑部的核心表达方式
- 适合：深度报告、品牌故事、年度回顾、研究发现、长篇叙事
`.trim(),
  preferredLayouts: ['quote', 'cover', 'two-column', 'image'],
  avoidLayouts: ['stacked-bars', 'grid-cards'],
  maxFontLevels: 4,
};

// ----- playful: 对外 pitch / 创业风 -----

const PLAYFUL: StylePreset = {
  id: 'playful',
  format: 'slide',
  displayName: { zh: '活泼（对外 pitch）', en: 'Playful (External Pitch)' },
  tagline: { zh: '圆角、饱和色、故事感', en: 'Rounded corners, saturated colors, story-driven' },
  theme: 'warm',
  promptAppendix: `
## 活泼风格约束 — Pitch Energy

### 核心识别：让人坐直身体的那种 deck
活泼不是"花哨"——是**有能量、有节奏、让人想继续看**。每一页都有一个"钩子"，每一个数字都有戏剧性，整个 deck 像一个精心设计的故事：问题 → 转折 → 解决 → 结果。

### Typography 规则
- **标题**：\`var(--font-display-serif)\`（Fraunces），weight 600-700——serif 给夸张的标题撑起气势和戏剧感
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 400，line-height 1.65
- **big-number 用超大字号**：80-120px，让整页有呼吸的爆点
- **标题可以有情绪**："我们烧了 30 万才发现的真相" 是好标题，"Q1 用户增长" 不是
- **允许适度夸张**：但必须有数据支撑

### 空间 × 构图
- **可以打破网格**：big-number 可以溢出卡片边界，标题可以超大到占据页面 50%
- **卡片圆角 16-20px**——圆润、有弹性、像消费品 app 的卡片
- **卡片有彩色阴影**：用主色调的 rgba 做外发光，增加活力感
- **每页有一个"爆点"**：一个超大数字、一句震撼引用、一个意外的对比
- **留白 35-45%**——比极简少，但仍然有呼吸空间

### 色彩策略
- **饱和暖色为主**：主色 #d97757 暖橙 + 互补色（电蓝 #0066ff 或 翠绿 #00c896）
- **对比强烈**：主色和背景的对比度 ≥ 4.5:1（WCAG AA）
- **每页可以有不同的主色调**——活泼允许 deck 内的色彩变化，制造节奏感
- **数字用强调色**：关键 metric 用饱和色高亮，让它"跳出来"
- **禁止**：灰色调（太沉闷）、低饱和色（太保守）

### 文案人格
- **标题有"钩子"**：让人想继续看。用意外、反转、具体数字制造悬念
- **允许适度夸张**：但每个夸张都要有数据支撑
- **故事结构**：问题 → 转折 → 解决 → 结果。每个 deck 都要有这个弧线
- **可以用口语**："说实话"、"你猜怎么着"——但不低幼
- **数字要有戏剧性**：不说"增长了"，说"+312%"；不说"很多用户"，说"47,000 个用户"
- **允许感叹号**（每 deck 最多 3 个）和 emoji（每页最多 1 个，只用数据相关的）
- 适合：融资 pitch、产品发布、增长汇报、对外演讲、创业故事
`.trim(),
  preferredLayouts: ['big-number', 'cover', 'quote', 'three-cards', 'image'],
  maxFontLevels: 4,
};

// ============================================================================
// Premium presets — distilled from public design-system references
// ============================================================================

const STRIPE: StylePreset = {
  id: 'stripe',
  format: 'slide',
  displayName: { zh: '冰锋（Swiss Precision）', en: 'Ice Edge (Swiss Precision)' },
  tagline: { zh: '纤细字重 × 数学留白 × 色散光谱，精密仪器般的 SaaS 美学', en: 'Thin weights, mathematical whitespace, prismatic color — precision SaaS aesthetics' },
  theme: 'stripe',
  isPremium: true,
  brandColors: { primary: '#533afd', accent: '#00d4ff', bg: '#ffffff', text: '#061b31' },
  knowledgeRef: 'stripe',
  promptAppendix: `
## 冰锋风格约束 — Swiss Precision

### 核心识别：纤细即力量
Weight 300 是这套排版的标志性选择——当别人用 600-700 来抢注意力时，这里用轻盈作为奢华。文字如此自信，不需要粗体来建立权威。

### Typography 规则
- **标题**：weight 300（精确值，不是 200 也不是 400）——这是品牌声音
- **正文**：weight 300-400，letter-spacing 正常
- **数字**：比同页文字大 3× 以上，加 tabular-nums (\`tnum\`)。数字是视觉锚点
- **字体**：display 用 \`var(--font-body-sans)\`（Plus Jakarta Sans），body 同
- **letter-spacing 随字号递进收紧**：56px 时 -0.025em，32px 时 -0.02em，16px 及以下 normal

### 空间 × 构图
- 留白 ≥ 50%——精确的负空间，每一块留白都是设计的一部分
- 间距用 8px 倍数（8/16/24/32/48/64），密集数据区域精确到 2px 级别
- 标题优先**左对齐 + 右侧大面积留白**，不居中
- 每页最多 3 个视觉元素（标题 + 1 数据 + 1 辅助文案）

### 色彩策略
- 深蓝黑 #061b31 文字——不是纯黑，是深海军蓝，带来温暖和深度
- 主色 #533afd 紫只用于**单一强调元素**（一个数字、一条下划线、一个标签）
- 辅助色 #00d4ff 青只在需要二级层次时极少量使用

### 阴影 × 深度（atmosphere technique）
- 蓝调双层阴影：远层 rgba(50,50,93,0.25) + 近层 rgba(0,0,0,0.1)——like elements floating in twilight
- 蓝灰阴影色(50,50,93)直接呼应品牌的深蓝调色板——连阴影都是 on-brand 的
- **绝不用**灰色阴影、纯黑阴影——always tint with blue

### Do's and Don'ts (from source DESIGN.md §7)
- **Do**: weight 300 for all headlines; blue-tinted shadows; #061b31 for headings (not #000)
- **Don't**: weight ≥ 400 for headlines; border-radius 12px+（保持 4-8px conservative）; neutral gray shadows; 大面积暖色

### 文案人格
- **克制到极致**。标题 ≤ 8 个词。正文 ≤ 3 句。如果一个词能说清，不用两个
- 语气：像一份精炼的产品 changelog——技术自信，不解释为什么好，只陈述事实
- 禁止感叹号、emoji、"我们"、"一起"等温暖词汇
- 数字不加修饰语（不说"惊人的 99.9%"，只说"99.9%"）
`.trim(),
  preferredLayouts: ['cover', 'big-number', 'two-column', 'quote'],
  avoidLayouts: ['grid-cards', 'three-cards'],
  maxFontLevels: 3,
};

const LINEAR: StylePreset = {
  id: 'linear',
  format: 'slide',
  displayName: { zh: '黑曜（Obsidian）', en: 'Obsidian' },
  tagline: { zh: '宝石般的深色层次 × 欧洲 grotesque 字体 × 单色宝石光，开发者工具美学', en: 'Gem-like dark layers, European grotesque, monochrome glow — developer tool aesthetics' },
  theme: 'linear',
  isPremium: true,
  brandColors: { primary: '#5e6ad2', accent: '#26b5ce', bg: '#08090a', text: '#f7f8f8' },
  knowledgeRef: 'linear',
  promptAppendix: `
## 黑曜风格约束 — Obsidian

### 核心识别：深度即奢华
不是"深色模式"——是**宝石切面**。黑曜石的美来自层次：表面 #08090a → 卡片 #141414 → 悬浮 #1a1a1a → 高亮边框 #23252a。每一层微妙地浅一点，像在黑色矿石里看到不同的切面。深度通过 luminance stepping 实现，不靠 drop shadow（source: "Don't use drop shadows for elevation on dark surfaces"）。

### Typography 规则
- **标题**：weight 500，letter-spacing -0.03em（比正常紧 3 倍），让字母几乎咬合——信息密度极高的感觉
- **正文**：weight 400，letter-spacing 正常，line-height 1.7（暗色背景需要更大行距才不压抑）
- **字体**：display 用 \`var(--font-familjen-grotesk)\`（Familjen Grotesk——北欧 grotesque，天生的 developer 气质，比 Plus Jakarta 更有棱角）。body 用 \`var(--font-body-sans)\`（Plus Jakarta Sans）
- **关键特征**：Familjen Grotesk 的 g/a/e 字形有独特的开口，在深色背景上辨识度极高

### 空间 × 构图
- 每页一个视觉焦点，其余全是呼吸空间
- 标题 ≤ 6 个词——像 git commit message 的第一行
- 卡片之间间距 ≥ 24px，用留白代替分割线
- 所有卡片左上角有 1px 顶部边框，从 #5e6ad2 渐变到 transparent——"液态光"效果，是这个 preset 的视觉签名

### 色彩策略
- 文字 #f7f8f8（source: "not pure #ffffff"——纯白在深色底上会刺眼）
- 主色 #5e6ad2 紫蓝**只用于高亮和交互态**（数字、标签、边框光），绝不用于大面积填充
- 辅色 #26b5ce 青只在需要第二层次时极少量使用
- 卡片背景 #141414，边框 #252525——通过 1px 线条暗示层次，不用阴影（阴影在深色底上看不见）
- 整体感觉：开灯看到的是黑色；关灯后，卡片边缘微微发出紫蓝色的光

### 文案人格
- **Changelog 语气**。标题是陈述句，像 release notes 标题："支持自定义域名" 而不是 "自定义域名来了！"
- 每页只说一件事。如果需要说两件事，那就是两页
- 正文可以用代码术语（API、webhook、pipeline），不需要解释
- 禁止感叹号、emoji、煽情词。允许 \`backtick\` 标记技术术语
`.trim(),
  preferredLayouts: ['big-number', 'cover', 'two-column', 'quote'],
  avoidLayouts: ['three-cards', 'grid-cards', 'stacked-bars'],
  maxFontLevels: 3,
};

const NOTION: StylePreset = {
  id: 'notion',
  format: 'slide',
  displayName: { zh: '和紙（Washi）', en: 'Washi' },
  tagline: { zh: '侘寂美学 × 轻盈字重 × 手漉纸质感，让信息自然呼吸', en: 'Wabi-sabi aesthetics, light weights, handmade paper texture — let content breathe' },
  theme: 'notion',
  isPremium: true,
  brandColors: { primary: '#0075de', accent: '#eb5757', bg: '#faf8f4', text: '#37352f' },
  knowledgeRef: 'notion',
  promptAppendix: `
## 和紙风格约束 — Washi

### 核心识别：轻盈即优雅
侘寂（wabi-sabi）：在不完美中找到美。这个 preset 的美来自**极致的轻盈**——字重轻、颜色浅、留白多、结构松。像手漉和纸上的墨迹——不是印刷的精确，而是书写的从容。

### Typography 规则
- **标题**：\`var(--font-display-serif)\`（Fraunces），weight 400（不是 600/700——轻盈是灵魂），SOFT 轴 100（最大柔和度），WONK 1（有机变化）
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 300（比正常更轻一档），line-height 1.8（宽松到像在翻书）
- **关键特征**：Fraunces weight 400 + SOFT 100 出来的字形有手写的有机弧度，每个字母略有不同，像手工铅字
- **字号对比温和**：标题和正文的字号差不要太大（1.5-2× 即可），避免"喊叫"感

### 空间 × 构图
- **非对称是灵魂**。标题靠左、大面积右侧留白。或者标题靠上 1/3、下方 2/3 全是呼吸空间
- 不居中。居中是"安全的"但没有性格。和紙的每一页都像手写信——自然地从左上角开始
- 元素之间用留白分隔，绝不用分割线。留白 ≥ 40%
- 卡片无阴影——用 1px 暖色边框 rgba(55,53,47,0.08) 暗示边界，像宣纸的毛边
- 圆角 6-8px，不要太圆（太圆太"可爱"），也不要太方（太方太"企业"）

### 色彩策略
- 文字 #37352f（温暖的棕黑，不是冷的纯黑——像墨汁干透后的颜色）
- 背景 #faf8f4（微微偏黄的暖白，像宣纸）
- 强调色 #eb5757 红**极少量使用**——一页最多出现一次，用于一个关键词或一个数字。像印章——整封信只盖一个章
- 主色 #0075de 蓝用于链接和 CTA——它是唯一的品牌色
- 卡片有 4 层微阴影（每层 opacity ≤ 0.05）——whisper elevation，几乎看不到但确实存在
- 圆角 12px（standard cards）

### 文案人格
- **写信的口气**。像在给一个信任你的同事写 doc，不是在做 presentation
- 可以用"我们"、"你"、"一起"——有温度但不煽情
- 标题清晰直白，不追求悬念。"Q1 用户增长回顾" 比 "增长的秘密" 更和紙
- 允许比其他 preset 多一些正文——和紙是为阅读设计的，不是为"看一眼就翻"设计的
- 每页有一个安静的细节：一个精确的数字、一句引用、一个具体的人名
`.trim(),
  preferredLayouts: ['two-column', 'quote', 'cover', 'three-cards', 'title-body'],
  maxFontLevels: 4,
};

const VERCEL: StylePreset = {
  id: 'vercel',
  format: 'slide',
  displayName: { zh: '碑文（Monument）', en: 'Monument' },
  tagline: { zh: '建筑级粗体 × 纯黑白平面 × 纪念碑般的存在感，让每个字都有重量', en: 'Architectural bold, pure black & white, monumental presence — every word carries weight' },
  theme: 'vercel',
  isPremium: true,
  brandColors: { primary: '#000000', accent: '#0070f3', bg: '#000000', text: '#ffffff' },
  knowledgeRef: 'vercel',
  promptAppendix: `
## 碑文风格约束 — Monument

### 核心识别：字就是建筑
Brutalist architecture（粗野主义建筑）的设计哲学：原始材料 + 巨大尺度 + 零装饰 = 震撼。这个 preset 把这个逻辑搬到幻灯片上——**标题本身就是整页的建筑**。weight 800 的巨型字母占据页面 60%+，剩下的全是黑色或白色的负空间。

### Typography 规则
- **标题**：\`var(--font-display-sans)\`（Bricolage Grotesque），weight 800（最粗——这是碑文的识别特征）。字号尽可能大——cover 标题可以 80-120px，让字母成为视觉主体
- **正文**：\`var(--font-familjen-grotesk)\`（Familjen Grotesk），weight 400，与 800 标题形成极端粗细对比
- **标题可以分行**：把一个短句拆成 2-3 行，每行 2-3 个词，让巨型字母堆叠出纪念碑般的体量感
- **Cover 页标题允许全大写**（英文部分），增强建筑感。非 cover 页用 sentence case

### 空间 × 构图
- **留白 ≥ 55%**。碑文的力量来自周围的空旷——就像广场中央的纪念碑
- 绝对不居中（居中太温和）。标题靠左下或左上对齐，像建筑的基座
- 零装饰：不要分割线、不要图标、不要圆角（0-2px）、不要阴影、不要渐变
- 卡片用 shadow-as-border 技术（\`0 0 0 1px\` ring 替代传统 border）——source 的核心表面处理
- 每页最多 2 个视觉元素。如果标题已经够大，不需要其他任何东西
- **letter-spacing -0.04em**——source 说这是"the most aggressive negative tracking of any major design system"

### 色彩策略
- 只有黑 #000 和白 #fff。两者互换：黑底白字或白底黑字（deck 内可以交替使用制造节奏）
- 唯一允许的颜色：#0070f3 电蓝——像建筑工地的蓝色标记线，只用于极少量高亮（一个数字、一条短下划线）
- 禁止渐变、禁止灰色（灰色是妥协——碑文不妥协）
- **Don't**: weight 700 on body text (source max: 600); traditional CSS border on cards; 跳过 ligatures

### 文案人格
- **宣言式**。标题是断言，不是描述。"重新定义 API" 而不是 "我们如何重新定义了 API"
- 动词优先。名词可以被动，动词永远主动
- 极短：标题 ≤ 5 个词，正文 ≤ 2 句
- 禁止问句（碑文不提问）、禁止感叹号（碑文不需要强调——它本身就是强调）
- 语气：像纪念碑上的铭文——简洁、永恒、不解释
`.trim(),
  preferredLayouts: ['cover', 'big-number', 'two-column', 'quote'],
  avoidLayouts: ['three-cards', 'grid-cards', 'stacked-bars'],
  maxFontLevels: 2,
};

const APPLE: StylePreset = {
  id: 'apple',
  format: 'slide',
  displayName: { zh: '月白（Moonlight）', en: 'Moonlight' },
  tagline: { zh: '隐形设计 × 微米级精度 × 柔光摄影棚质感，你只看到内容', en: 'Invisible design, micron-level precision, soft studio lighting — you only see content' },
  theme: 'apple',
  isPremium: true,
  brandColors: { primary: '#1d1d1f', accent: '#0071e3', bg: '#fbfbfd', text: '#1d1d1f' },
  knowledgeRef: 'apple',
  promptAppendix: `
## 月白风格约束 — Moonlight

### 核心识别：看不见的设计
最好的设计是让人注意不到设计本身。月白的目标是"隐形"——观众看完整个 deck 后，记住的是内容，不是样式。但如果仔细看，每一个间距、每一个字重、每一个颜色值都是精心计算的。像苹果的产品——拿起来就是对的，但你说不清为什么。

### Typography 规则
- **标题**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 600，letter-spacing -0.02em。不用衬线——衬线有"性格"，月白要"无性格"
- **正文**：同 Plus Jakarta Sans，weight 400，line-height 精确到 1.6（不是 1.5 也不是 1.7——1.6 是呼吸和密度的甜蜜点）
- **字号系统严格遵守比率**：标题 / 副标题 / 正文 / 辅助 = 1 / 0.67 / 0.5 / 0.42。绝不出现比率之外的字号
- **标题和正文的字号差距要大**（≥ 2× 倍），但都不夸张——标题 36-48px，正文 16-18px，让对比存在于精确而非极端

### 空间 × 构图
- **每页只有一个焦点**。如果是文字，居中或偏左。如果是数字，居中且巨大。如果是引用，居中偏上。绝不同时有两个争夺注意力的元素
- 留白 ≥ 50%——但留白的分布要**对称**（月白是唯一允许居中的 preset——因为居中在极致精度下是最安静的构图）
- 卡片有 1px 边框 #d2d2d7 + 极淡阴影（2px blur, rgba(0,0,0,0.04)）——深度暗示只有一层，像月光在纸面上投下的微影
- 圆角 16px——比其他 preset 都大，柔和到几乎不被注意

### 色彩策略
- 背景 #fbfbfd（几乎是白色，但多了 0.8% 的蓝灰——纯白太刺眼，这个白色像月光照亮的白纸）
- 文字 #1d1d1f（不是纯黑——比纯黑柔和 8%，减少对比度疲劳）
- 主色蓝 #0071e3 **只用于 CTA 和链接**，在整个 deck 中出现次数 ≤ 5。它是"出口标志"而不是装饰
- 灰色层次精确：muted text #86868b，border #d2d2d7，极淡 bg #f5f5f7——每个灰度都有明确的语义
- 阴影是偏移定向的（3px 5px 20px）——like studio side-lighting，不是均匀的 box shadow
- 圆角 ≤ 12px（source: "Don't use rounded corners larger than 12px on rectangular elements"）
- **Don't**: textures/patterns/gradients on backgrounds（solid colors only）; 装饰性元素; warm accent colors

### 文案人格
- **产品文案的最高水平**。一句话讲清价值——如果需要第二句，说明第一句不够好
- 语气像苹果 Keynote：自信但不张扬，陈述事实而不是卖东西
- 面向消费者，不面向开发者。避免技术术语
- 允许形容词但每句最多一个：不说"极致流畅丝滑的体验"，说"流畅"
`.trim(),
  preferredLayouts: ['cover', 'big-number', 'image', 'quote'],
  avoidLayouts: ['grid-cards', 'stacked-bars'],
  maxFontLevels: 3,
};

const SPOTIFY: StylePreset = {
  id: 'spotify',
  format: 'slide',
  displayName: { zh: '极光（Aurora）', en: 'Aurora' },
  tagline: { zh: '暗场霓虹 × 有性格的 grotesque × 绿光脉冲，暗夜里最亮的那束光', en: 'Dark neon, characterful grotesque, green pulse — the brightest light in the dark' },
  theme: 'spotify',
  isPremium: true,
  brandColors: { primary: '#1ed760', accent: '#1db954', bg: '#121212', text: '#ffffff' },
  knowledgeRef: 'spotify',
  promptAppendix: `
## 极光风格约束 — Aurora

### 核心识别：暗场中的霓虹
北极光不是"亮"——是在极致的黑暗中，一束光有了意义。极光的美学不是"深色模式 + 绿色"，而是**在深色场景中用一种颜色创造能量和方向**。绿色不是填色，是光——有发光感、有渐变、有脉冲。

### Typography 规则
- **标题**：\`var(--font-display-sans)\`（Bricolage Grotesque），weight 700-800——粗壮有力，充满能量。Bricolage 的字形有"quirky"的角度变化（g/a/e 的弧度不规则），在暗色底上显得有活力而非呆板
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 400
- **标题可以大胆、甚至夸张**——60-80px 不嫌多。极光就是大胆的自然现象
- **允许标题用感叹号**（这是唯一允许感叹号的 premium preset）

### 空间 × 构图
- 信息密度可以比其他 preset 高——极光 preset 面向年轻受众，他们习惯高密度信息流
- 卡片式布局是核心表达方式。three-cards、grid-cards 都欢迎
- 卡片圆角 16px（柔和、有弹性——像音乐 app 的卡片）
- 卡片有绿色微光：box-shadow 用 rgba(29,185,84,0.12) 做外发光——像霓虹灯管在雾中的漫射

### 色彩策略
- 深灰 #121212 底（不是纯黑——纯黑太硬，#121212 有一点温度）
- 文字 #ffffff（极光需要对比度来"发光"）
- **绿色是光，不是色**：#1ed760（source: primary brand green）用于 play buttons、active states、CTAs
- 绿色元素可以做"发光"处理：neon sign in fog 效果。卡片用绿色外发光阴影
- 卡片背景 #181818，边框 #282828。卡片圆角 6-8px（source: pills 500px+ 只用于 buttons，cards 用 6-8px）
- **大写按钮标签 + 宽字距 1.4-2px**——source 的标志性 UI pattern（uppercase + wide letter-spacing）
- **Don't**: 装饰性使用绿色——green is functional only (play, CTA, active); 不用暖色

### 文案人格
- **播客主播的语气**：热情、直接、用短句制造节奏感
- 可以用口语（"说实话"、"你猜怎么着"）但不低幼
- 数字和增长率用绿色突出——这是"好消息"的视觉编码
- 允许更多文案量（3-4 句正文），但每句都要有信息增量
- 可以用 emoji 但限一页 ≤ 1 个，且只用数据相关 emoji（📈 🎯 🔥 ✅），不用装饰性 emoji
`.trim(),
  preferredLayouts: ['big-number', 'three-cards', 'cover', 'stacked-bars', 'grid-cards'],
  maxFontLevels: 4,
};

const AIRBNB: StylePreset = {
  id: 'airbnb',
  format: 'slide',
  displayName: { zh: '窑变（Kiln Glaze）', en: 'Kiln Glaze' },
  tagline: { zh: '珊瑚釉色 × 全衬线温度 × 有机留白，烧出来的温暖', en: 'Coral glaze, all-serif warmth, organic whitespace — kiln-fired warmth' },
  theme: 'airbnb',
  isPremium: true,
  brandColors: { primary: '#ff385c', accent: '#00a699', bg: '#faf7f2', text: '#222222' },
  knowledgeRef: 'airbnb',
  promptAppendix: `
## 窑变风格约束 — Kiln Glaze

### 核心识别：泥土烧出的颜色
窑变（kiln transmutation）：陶器在窑火中发生的不可预期的色彩变化——珊瑚、青绿、赭石、奶白，每一件都独一无二。这个 preset 的美学是**有机的温暖**——不是数码调出来的精确配色，而是像自然生成的、有温度的色彩关系。

### Typography 规则
- **标题**：\`var(--font-display-serif)\`（Fraunces），weight 500，style italic——Fraunces 的 italic 有手写般的有机弧度，是窑变的视觉签名
- **正文**：\`var(--font-body-serif)\`（Lora），weight 400——**全衬线配对**（Fraunces italic + Lora regular），像一本精装杂志的排版。衬线的温暖感是窑变与其他 preset 最大的区分点
- **关键特征**：标题的 italic + 正文的 roman，斜体和直体的交替创造了阅读节奏
- 字号适中，不追求巨大标题——窑变是"细看"而不是"一眼震撼"

### 空间 × 构图
- 留白有机而非对称——像手工陶器的不规则边缘。标题可以偏左上、偏右下，不必严格对齐
- 每页至少有一个**人**的痕迹：一句引用、一个人名、一个故事片段、一个具体场景
- 引用标记（"）用珊瑚色 #ff5a5f 大字号（60px+），作为整页的视觉锚点
- 卡片圆角 12px，阴影用珊瑚色调 rgba(255,90,95,0.06)——阴影本身也是暖的
- 分隔用短横线（——）或小圆点（·），不用直线

### 色彩策略
- 背景 #faf7f2（比纯白偏黄偏暖——像陶器的底釉）
- 文字 #222222（source: "warm near-black, never pure #000"——温暖的墨色）
- Coral red #ff385c 是主角（source: 品牌标志色）——用于引用标记、关键数据、section 转场的短横线
- 青绿 #00a699 是配角——偶尔出现在图标、标签、次级高亮
- 卡片圆角 **20px+**（source: "20px+ core to identity", "Don't use sharp corners 0-4px on cards"）
- 卡片用 3 层阴影：ring(0.02) + near(0.04) + far(0.1)——tactile photography-card depth
- **Don't**: 尖角卡片（0-4px radius）; 单层阴影; 纯黑文字

### 文案人格
- **讲故事的人**。窑变的每一页都应该有叙事感——不是列数据，而是用数据讲故事
- 语气温暖但不煽情。可以说"我们发现了一个有趣的趋势"，不说"令人震惊的发现！"
- 每页至少有一个具体的人/场景/细节：不说"用户满意度提升"，说"用户王明说：终于不用加班导数据了"
- 引用（quote layout）是窑变的明星布局——用它来展示用户原话、团队感悟、客户反馈
- 适合：社区分享、用户增长报告、品牌叙事、年终回顾、团队文化分享
`.trim(),
  preferredLayouts: ['quote', 'three-cards', 'cover', 'two-column', 'image'],
  maxFontLevels: 4,
};

const FERRARI: StylePreset = {
  id: 'ferrari',
  format: 'slide',
  displayName: { zh: '墨金（Noir & Gold）', en: 'Noir & Gold' },
  tagline: { zh: 'Didone 斜体奢华 × 电影级黑场 × 每页一滴红，戏剧性克制', en: 'Didone italic luxury, cinematic black, one drop of red per page — dramatic restraint' },
  theme: 'ferrari',
  isPremium: true,
  brandColors: { primary: '#DA291C', accent: '#FFF200', bg: '#0c0c0c', text: '#f0ece4' },
  knowledgeRef: 'ferrari',
  promptAppendix: `
## 墨金风格约束 — Noir & Gold

### 核心识别：一滴红
Film noir 的美学核心：在极致的克制中，一个突破性元素产生戏剧性。Deep red #DA291C 就是这一滴——每页只出现在一个元素上（一个词、一个数字、一条短线），其余全是黑白。这一滴红的规则是：以近乎外科手术般的克制使用，只保留给 CTA 和真正需要强调的瞬间。

### Typography 规则
- **标题**：\`var(--font-instrument-serif)\`（Instrument Serif），weight 400，style **italic**——这是 Lasca 字库中最奢华的字形。Didone 风格的高对比粗细笔画 + italic 的优雅倾斜 = 高定时装秀的邀请函
- **正文**：\`var(--font-body-sans)\`（Plus Jakarta Sans），weight 300（纤细——与 Instrument Serif 的戏剧性形成极端对比）
- **字间距**：标题用 +0.04em（比正常宽——luxury 品牌的标准做法，让字母之间有"呼吸的空间"，像 Chanel / Dior 的 logo 排版）
- **数字**：关键 metric 用 Instrument Serif italic 渲染，字号 80-120px，成为整页的视觉中心

### 空间 × 构图
- **留白 ≥ 55%**。奢侈品的留白不是"空"，是"我有足够的空间可以浪费"
- 每页 1-2 个视觉元素，绝不超过 2 个。如果标题已经足够有力，不需要正文
- 标题位置：cover 居中偏下（像电影海报），内页左对齐偏上
- 卡片有 1px 边框 + 深色阴影（rgba(0,0,0,0.5)）+ 微妙的红色底光 rgba(220,0,0,0.03)——像暗室里的红光
- 圆角 8px（不能太圆——奢侈品需要利落感）

### 色彩策略
- 背景 #0c0c0c（哑光黑——像黑色天鹅绒）+ 暗场/亮场 chiaroscuro 交替节奏：dramatic alternations between inky-dark cinematic sections and crisp white editorial panels
- 文字 #f0ece4（暖奶白色，像高级信纸）
- **深红 #DA291C 的规则：每页只允许出现在一个元素上。** 这一滴红以近乎外科手术般的克制使用
- Racing Yellow #FFF200 **在整个 deck 中最多出现 2 次**——heritage accent for special contexts
- 圆角 **2px**——nearly zero border-radius reflecting precision engineering aesthetics
- **零阴影**——depth comes from chiaroscuro surface contrast, not from box-shadows
- **Don't**: box-shadows on cards; rounded-pill buttons; large border-radii; 装饰性颜色使用

### 文案人格
- **luxury copywriting 的黄金法则：少即多，短即贵**。标题 ≤ 4 个词（不是建议——是硬规则）
- 语气像奢侈品广告：不解释"为什么好"，只呈现"它是什么"。用户自己感受价值
- 禁止感叹号、emoji、口语、"我们"。用第三人称或无主语句式
- Cover 标题像 luxury brand campaign：一个词或短语，不是完整的句子。"Transcendence" 而不是 "我们如何超越了所有人"
- 适合：年度报告、investor pitch、品牌发布、高端产品展示、颁奖典礼
`.trim(),
  preferredLayouts: ['cover', 'big-number', 'quote', 'image'],
  avoidLayouts: ['grid-cards', 'stacked-bars', 'three-cards'],
  maxFontLevels: 3,
};

// ----- bilingual-report: 机构研报（Kai + 暖纸色 + 橙色 accent，仅 report） -----

const BILINGUAL_REPORT: StylePreset = {
  id: 'bilingual-report',
  format: 'report',
  displayName: {
    zh: '双语机构研报',
    en: 'Bilingual Institutional Research',
  },
  tagline: {
    zh: 'Kai 楷 + 暖纸色 + 橙色 accent，月报 / 投研 / 机构分析',
    en: 'Kai serif + warm paper + orange accent — monthlies, investor research',
  },
  theme: 'warm',
  brandColors: { primary: '#d97757', accent: '#6a9bcc', bg: '#faf9f5', text: '#141413' },
  promptAppendix: `
## Institutional Research Report — Visual & Writing Constraints (strict)

This preset produces a print-style institutional research report. Visual DNA distilled from an institutional US housing research series we used as the reference look. Mood: **serious, quiet, editorial**. Restraint is the soul — any decoration is instantly visible as excess.

### Language (takes precedence over everything below)
Honor the base system prompt's language-matching directive. This preset provides visual and structural rules only; it does **NOT** override language choice. If the user's input is English, generate English — use Lora for body, Fraunces for display, \`[Source: ...]\` for citations. If the user's input is Chinese, generate Chinese — use Kai for body, heiti for bold/KPI, \`[信源：...]\` for citations. If mixed, preserve the mix per paragraph — never auto-translate the user's words.

### Typography
- **CN body / headings**: Kai serif (\`'KaiTi','STKaiti','Kai'\`, web fallback Noto Serif SC). Kai's soft strokes carry the humanistic-institutional feel.
- **CN bold / KPI / numbers**: Heiti (Noto Sans SC bold). Numbers must be heiti, never Kai.
- **EN body**: Lora serif. Warm, serif, pairs naturally with Kai.
- **EN display / cover title**: Fraunces serif.
- **EN uppercase tracked micro-labels** ("MARKET BRIEF", "KEY DATA", "SOURCE"): Plus Jakarta Sans bold, letter-spacing 0.08em, ALL CAPS.
- **Page folio**: Lora bold, orange #d97757.
- **≤ 3 type levels**. Title vs. body contrast ≥ 2:1.

### Color (strict restraint)
- Paper: #faf9f5 (warm cream) — page background.
- Ink: #141413 — body text.
- **Single primary accent**: orange #d97757. Use only for: section intro rule, page folio, cover brand underline, table header emphasis. At most one prominent orange element per page.
- **Secondary accents** (for observation callouts only; never large surfaces sharing a page with orange):
  - Observation / cool: #6a9bcc (blue)
  - Positive / healthy: #788c5d (sage)
- Neutrals: #b0aea5 (citation gray), #e8e6dc (table header bg), #ddd4c6 (hairline), #f7f3ec (section-intro tint), #fcfaf4 (ink wash).
- **Forbidden**: purples, gradients, drop shadows, multicolor palettes, emoji, pure #000 (too hard), pure #fff (destroys paper feel).

### Spatial
- A4 portrait. Side margins ≥ 8% of page width. Top/bottom margins ≥ 7%.
- Target body width 164mm (A4 minus 2×23mm).
- Every page needs **at least one non-text visual anchor**: a number, quote block, table, rule, or small orange accent.
- Paragraph breathing: spacing ≈ 1.5–2× line height. Line height 1.8 (CJK-friendly).
- **Single-column only**. No multi-column body.

### H3 subheads (load-bearing rule — strict)
- Each H3 (\`###\`) sits with a **visibly generous air** above it, regardless of what precedes it (body text, table, citation line, bullet).
- Target ~30pt of space above. Lasca's CSS handles this automatically (\`.preset-bilingual-report h3\` has margin-top).
- H3 text: bold, ink #141413, slightly larger than body.

### Source citations (load-bearing rule — strict)
- Every data point, market judgment, or third-party opinion **must** end with a citation marker **on the same paragraph** (not a new paragraph).
- Chinese content: \`[信源：NAR 全美成屋销售月报, 2026年4月14日]\`
- English content: \`[Source: NAR Existing Home Sales, April 2026]\`
- The renderer auto-splits \`[信源：...]\` / \`[Source: ...]\` into a smaller muted line tied to the parent paragraph via \`break-inside: avoid\`. Do not manually format it as a separate paragraph.
- Hard claims without a citation: rewrite or remove.
- **Charts: never duplicate the citation.** When a chart block is paired with a caption / body-para that already ends in \`[信源：...]\` / \`[Source: ...]\`, leave \`chart.footnote\` **empty**. Use \`chart.footnote\` only for methodology / unit / disclaimer notes that are NOT already in the caption (e.g. "SAAR-adjusted; excludes new construction"). Never put a \`[信源：...]\` / \`[Source: ...]\` marker inside \`chart.footnote\` under this preset — it duplicates the caption's citation. Pick exactly one home for the source attribution.

### Cover metadata
- After the cover H1, add \`**Field:** value\` rows — one key/value per line.
- CN example:
  \`\`\`
  # 2026年3月全美住宅市场分析报告

  **发布日期：** 2026年4月14日
  **覆盖范围：** 全国成屋市场 / Texas 三城 / BTR
  **作者：** Acme Research
  \`\`\`
- EN example:
  \`\`\`
  # US Residential Market Analysis — March 2026

  **Published:** April 14, 2026
  **Scope:** National existing-home sales / Texas metros / BTR
  **Author:** Acme Research
  \`\`\`
- Use fullwidth colon (：) in CN, regular colon (:) in EN.
- Keep to 2–4 metadata rows. Never emit a bilingual duplicate of the title — one language per cover.

### Layout preferences
- **report-cover**: warm paper, orange top rule, large Fraunces (EN) or Kai (CN) title, subtitle (optional), author + date at bottom as muted uppercase-tracked kickers.
- **report-section**: **single-column only**. Section-tint background + orange left rule. The \`callout\` field is forbidden — if you feel tempted to add a side-note, fold it into a new paragraph instead. (Lasca strips \`callout\` post-generation as a safety net, but do not rely on it.)
- **report-body**: body paragraphs with embedded table / bullet / small visual anchor.
- **report-quote**: large serif pull-quote + orange left bar + Lora attribution.
- **Avoid**: \`grid-cards\` (too scattered), \`big-number\` (single giant number hogging a page), \`three-cards\` (breaks single-column rule).

### Voice (applied in whichever language you generate)
- Noun-heavy, verb-spare. Strip hedges ("actually", "very", "really", "kind of" / "其实" "非常" "真的" "一些").
- **Numbers speak**: use exact figures instead of adjectives. Not "grew significantly" / "增长较多" — use "+10.3%".
- Declarative sentences only. No rhetorical questions, no exclamation marks.
- Title ≤ 12 characters (CN) / ≤ 10 words (EN). Every character carries information.
- Tone: serious, calm, editorial. No marketing voice ("breaking", "must-read", "震惊", "重磅").

### Fit
- Monthly / quarterly market reports (institutional research style)
- Investor memos / investment research
- Sector analysis / market observation
- Institutional decision-support documents
- Bilingual research notes (when source material is already bilingual)
`.trim(),
  // Phase 3: 'report-page' is the preferred block-based layout; legacy 4 kept
  // for old-deck backward compat. bilingual-report's 870-line promptAppendix
  // drives composition regardless of which layout the model picks.
  preferredLayouts: ['report-page', 'report-cover', 'report-section', 'report-body', 'report-quote'],
  avoidLayouts: ['grid-cards', 'three-cards', 'big-number', 'stacked-bars'],
  maxFontLevels: 3,
};

// ============================================================================
// 注册表
// ============================================================================

/** Built-in (non-premium) presets */
export const BUILTIN_PRESETS: Record<BuiltinPresetId, StylePreset> = {
  minimal: MINIMAL,
  warm: WARM,
  'dark-tech': DARK_TECH,
  editorial: EDITORIAL,
  playful: PLAYFUL,
  'bilingual-report': BILINGUAL_REPORT,
};

/** Premium presets */
export const PREMIUM_PRESETS: Record<string, StylePreset> = {
  stripe: STRIPE,
  linear: LINEAR,
  notion: NOTION,
  vercel: VERCEL,
  apple: APPLE,
  spotify: SPOTIFY,
  airbnb: AIRBNB,
  ferrari: FERRARI,
};

/** All presets combined */
export const STYLE_PRESETS: Record<string, StylePreset> = {
  ...BUILTIN_PRESETS,
  ...PREMIUM_PRESETS,
};

/** Per-channel defaults. `DEFAULT_PRESET_ID` is kept as an alias of the slide
 *  default for backward compatibility — new code should pick the right one
 *  by channel via getPreset(id, format) or by reading these directly. */
export const DEFAULT_SLIDE_PRESET_ID: StylePresetId = 'warm';
export const DEFAULT_REPORT_PRESET_ID: StylePresetId = 'bilingual-report';
export const DEFAULT_PRESET_ID: StylePresetId = DEFAULT_SLIDE_PRESET_ID;

/** Resolve a preset by id, optionally constrained to a channel.
 *  - `format` omitted → legacy behavior (any preset, slide default fallback).
 *  - `format` provided + lookup misses or channel mismatches → return that
 *    channel's default. Never throws; mirrors the prior `?? warm` fallback. */
export function getPreset(id?: StylePresetId, format?: 'slide' | 'report'): StylePreset {
  const resolved = STYLE_PRESETS[id ?? DEFAULT_PRESET_ID];
  if (!format) return resolved ?? STYLE_PRESETS[DEFAULT_SLIDE_PRESET_ID];
  if (resolved && resolved.format === format) return resolved;
  const fallbackId = format === 'report' ? DEFAULT_REPORT_PRESET_ID : DEFAULT_SLIDE_PRESET_ID;
  return STYLE_PRESETS[fallbackId];
}

/** Clarifier / picker option list. `format` filters to one channel. */
export function listPresetOptions(locale: 'zh' | 'en' = 'zh', format?: 'slide' | 'report') {
  const all = Object.values(BUILTIN_PRESETS) as StylePreset[];
  const filtered = format ? all.filter(p => p.format === format) : all;
  return filtered.map(p => ({
    label: p.displayName[locale],
    value: p.id,
    hint: p.tagline[locale],
  }));
}

/** Style picker 用：返回所有 presets 按 free/premium 分组 */
export function listAllPresets(): { free: StylePreset[]; premium: StylePreset[] } {
  return {
    free: Object.values(BUILTIN_PRESETS),
    premium: Object.values(PREMIUM_PRESETS),
  };
}

// ============================================================================
// Composer (Phase B) — preset-as-function. Dead code from the orchestrator's
// view until step 7 wires CreateFlow to call `derivePreset`. The 14 hand-built
// `StylePreset` objects above stay live; Phase D will delete them.
//
// Architecture: family rules are the skeleton; selector answers (purpose /
// density / evidence / narrative) layer small prompt fragments on top. Family
// is read directly from `theme.family` — no classify(), no id-prefix inference.
// ============================================================================

interface FamilyRules {
  identity:        string;
  defaultCover:    SlideCoverVariant | 'default';
  defaultEyebrow:  EyebrowConvention;
  preferredLayouts: Layout[];
  avoidLayouts:    Layout[];
  constraints:     string;
  closing?:        string;
  maxFontLevels:   number;
}

const FAMILY_PROMPTS: Record<ThemeFamily, FamilyRules> = {
  base: {
    identity: '',
    defaultCover: 'default',
    defaultEyebrow: 'NONE',
    preferredLayouts: [],
    avoidLayouts: [],
    constraints: '',
    maxFontLevels: 4,
  },

  // Currently the analysis themes (`analysis-paper` / `analysis-memo` /
  // `analysis-field`) are report-only, so this rule set is dormant for the
  // slide channel. Filled now so a future slide-side analysis theme picks it up.
  analysis: {
    identity: '你在写一份机构级研究报告。每页只承载一个核心观点 + 1-2 个支撑数据点，结论型标题先行，数据必带信源。',
    defaultCover: 'default',
    defaultEyebrow: 'ALL_CAPS_LATIN',
    preferredLayouts: ['stat-row', 'featured-grid', 'title-body', 'bar-chart', 'line-chart'],
    avoidLayouts: ['quote', 'image'],
    constraints: [
      '每个数据点必须以 [信源：...] 结尾。',
      '禁用指标名做 headline；标题必须是结论而非描述。',
      'KPI 旁始终标单位与时间窗口。',
    ].join('\n'),
    closing: '末页放风险提示与展望 + 数据来源清单。',
    maxFontLevels: 4,
  },

  'private-banking': {
    identity: '你在为高净值客户写定制资产方案 / 家族办公室年度回顾。语气克制、机构感强；客户视角先于产品视角。',
    defaultCover: 'private-banking-split',
    defaultEyebrow: 'ASSET_N_CATEGORY',
    preferredLayouts: ['cover', 'two-column', 'stat-row', 'timeline', 'table', 'big-number'],
    avoidLayouts: ['quote'],
    constraints: [
      '**第一张 slide 必须是 `layout: cover` 且 `data.coverVariant: "private-banking-split"`**（不是 title-body / big-number 等其它布局）。封面只放 title + subtitle（"ASSET N · CATEGORY" 格式，如 "ASSET 1 · DEBT"），不要往 cover 塞长 body。',
      'KPI 卡必带币种与时间窗口（USD / CNY / 截止日期）。',
      '禁用 radar / pie；展望与现金流用 timeline 表达。',
      'Eyebrow 用 "ASSET N · CATEGORY" 格式（如 "ASSET 1 · DEBT"）。',
      '每条数据点配一句简短的"何以见得"——不堆砌数字。',
      '**配色纪律**：所有数字、KPI、强调文字必须使用 family 主 accent（theme primary 或 accent）的**单一色**。禁止在同一页混用绿/橙/红来表示涨跌——pb family 的克制感来自统一深色 + 一个强调色，不是信号灯多色。',
      '末页必含 "FOR DISCUSSION ONLY" 与免责声明（disclosures）。',
    ].join('\n'),
    closing: '末页：感谢客户的信任 + 法律免责声明 (disclosures)。',
    maxFontLevels: 4,
  },

  lookbook: {
    identity: '你在写一份项目简报 / 产品集 / 公司画册（lookbook genre）。每页是一个独立"卡片"，靠编号 + 大数字 + 简洁配图叙事，不是连续散文。',
    defaultCover: 'lookbook-numbered',
    defaultEyebrow: 'NN_DOT_TOPIC',
    preferredLayouts: ['cover', 'grid-cards', 'featured-grid', 'big-number', 'bento', 'timeline'],
    avoidLayouts: ['quote', 'two-column'],
    constraints: [
      '**第一张 slide 必须是 `layout: cover` 且 `data.coverVariant: "lookbook-numbered"`**（不是 title-body / big-number 等其它布局）。封面只放 title + subtitle（"NN · TOPIC" 格式，如 "01 · Investment thesis"），不要往 cover 塞长 body。详细论述放到第二张及之后的页面。',
      '每个 pillar 独立成页：1 个 hero 数字 + 3-4 个支撑细节卡。',
      '禁长段散文；body 段落控制在 2 句以内。',
      '结论型标题：标题里写出主张，不写指标名。',
      'Eyebrow 用 "NN · TOPIC" 格式（如 "01 · 城市更新"），与 cover 上的编号胶囊呼应。',
      '**配色纪律**：数字、KPI、强调文字使用 family 主 accent（theme accent 或 primary）的**单一色**。lookbook 的 minimal-decoration 美学要求一页只用一个高饱和强调色——禁止在同一页同时出现绿色"+106%"和橙色"38%"，更不要为涨跌区分红绿。需要差异时改用粗细 / 字号 / position 区分。',
    ].join('\n'),
    closing: '末页放数据来源 / 致谢 / 联系方式索引。',
    maxFontLevels: 5,
  },
};

// --- Selector fragments -----------------------------------------------------
// Each fragment is short (one paragraph). Composer opt-in joins them based on
// which selectors the user answered. Skipping a selector skips its fragment.

function purposeFragment(p?: PresetInputs['purpose']): string {
  switch (p) {
    case 'research': return '语气审慎、数据驱动；每条论点必须有信源。';
    case 'report-up': return '语气克制；先结论后论证；适合向上级汇报。';
    case 'persuade': return '语气主动、明确表态；用对比 / 数字 / 案例驱动观点。';
    case 'sales':    return '面向客户的提案语气；强调价值与差异化，弱化技术细节。';
    case 'academic': return '严谨学术语气；定义先于论证；引用规范。';
    case 'share':    return '轻量分享语气；可口语化；避免 jargon。';
    default:         return '';
  }
}

function densityFragment(d?: PresetInputs['density']): string {
  switch (d) {
    case 'minimal':  return '每页一个核心观点；大量留白；最多 1 个数据点。';
    case 'moderate': return '每页 1 个核心观点 + 2-3 行支撑或 1-2 个数据点。';
    case 'detailed': return '每页可放 2-3 个数据 + 3-4 行支撑；禁止整页大块留白。';
    default:         return '';
  }
}

function evidenceFragment(e?: PresetInputs['evidence']): string {
  switch (e) {
    case 'opinion':    return '以观点驱动；数据为辅，可不出现具体数字。';
    case 'key-data':   return '观点驱动 + 关键数据点支撑（每页 1-2 个）。';
    case 'data-heavy': return '图表 / KPI 为主，散文为辅；优先 chart layout。';
    case 'case-study': return '案例驱动；每页一个具体案例 + 1-2 个量化结果。';
    default:           return '';
  }
}

function narrativeFragment(n?: PresetInputs['narrative']): string {
  switch (n) {
    case 'conclusion-first': return '叙事结构：结论先行 → 论据 → 风险 / 展望。';
    case 'progressive':      return '叙事结构：背景 → 发现 → 结论 → 行动。';
    case 'story':            return '叙事结构：场景 → 冲突 → 转折 → 解决。';
    case 'comparison':       return '叙事结构：每页对比框架（versus / two-column / stacked-bars）。';
    default:                 return '';
  }
}

/**
 * Derive a `ComputedPreset` from selector inputs + the theme's family. Family
 * is read directly from `THEMES[inputs.theme].family`; if absent (legacy theme
 * not yet migrated), falls back to `'base'`.
 */
export function derivePreset(inputs: PresetInputs): ComputedPreset {
  const themeConfig = THEMES[inputs.theme];
  const family: ThemeFamily = themeConfig?.family ?? 'base';
  const rules = FAMILY_PROMPTS[family];

  const cover = inputs.cover ?? rules.defaultCover;

  const promptAppendix = [
    rules.identity,
    purposeFragment(inputs.purpose),
    densityFragment(inputs.density),
    evidenceFragment(inputs.evidence),
    narrativeFragment(inputs.narrative),
    rules.constraints,
  ].filter(Boolean).join('\n\n');

  return {
    family,
    theme: inputs.theme,
    cover,
    promptAppendix,
    preferredLayouts: rules.preferredLayouts,
    avoidLayouts: rules.avoidLayouts,
    eyebrowConv: rules.defaultEyebrow,
    bookends: rules.closing ? { closing: rules.closing } : {},
    maxFontLevels: rules.maxFontLevels,
  };
}
