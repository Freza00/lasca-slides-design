# Lasca 设计宪法

> 任何设计决策，先查这里。这里的规则不经明确讨论不允许改动。

---

## §0 顶级原则：如无必要，勿增实体

在增加新 Style / Canvas type / Layout / Chart / Texture / Ambient / Sprite / Motion 之前，
必须能回答："现有的东西为什么不够用？"
答不上来，就不加。

本原则是**所有后续章节的前置约束**。凡是后文写"可无限增加""可扩展"的地方，默认都在 §0 的前提下。

---

## §0.1 宪法与 AI Harness 的关系

宪法 = **设计层**（产出物长什么样）
Harness = **执行层**（AI 如何决策和生成）

两者在以下位置汇合，是连接桥梁：
- `lib/ai/harness/stylePresets.ts` — Style preset 的代码权威（见 §1 清单管理）
- `lib/ai/harness/selectorRules.ts` — 把用户偏好翻译成设计维度（density / audience 等）
- `lib/ai/harness/designPrinciples.ts` — 审美底座、字体白名单、反模式清单（见 §1 / §11）
- `lib/ai/harness/skills/` — 每个 skill 把宪法的一个设计子域带入 AI prompt（见附录 B）

**宪法不描述 harness 内部**。遇到 harness 架构问题直接读 `app/src/lib/ai/harness/` 下的代码（`orchestrator.ts`、`stylePresets.ts`、`goldenRules.ts` 等）。

---

## §0.2 术语表

| 术语 | 一句话释义 |
|---|---|
| **Style** | 皮肤。决定色彩、字体、装饰、氛围，详见 §1。 |
| **Canvas** | 一张幻灯片 / 报告页面。本质是网页，详见 §2。 |
| **Page Type** | Canvas 在文档里的角色：cover / back / section / content。 |
| **Layout** | 把 Canvas 切成若干卡片的网格方案，详见 §3。 |
| **Card** | Layout 切出的一个命名区域，装内容。 |
| **Composition** | Layout 的技术实现，定义 `grid-template-areas`，位于 `cards/compositions.ts`。 |
| **Chart** | 数据可视化，装在 Card 里，详见 §4。 |
| **Texture** | Canvas 背景上的静态视觉图案，详见 §5。 |
| **Ambient** | Canvas 上的动态背景层（纯 CSS），详见 §6。 |
| **Sprite** | Canvas 前景的动画角色 / 元素，详见 §7。 |
| **Motion** | 页面切换动画 + 元素入场动画，详见 §8。 |

---

## §0.3 核心不可违反规则

以下三条是绝对红线，**不允许讨论**：

1. **可访问性**：文字与背景满足 WCAG AA。详见 §10。
2. **Shell 基准色**：附录 A 的 9 个 token 值不经明确讨论不允许改动。
3. **动效兜底**：`prefers-reduced-motion` 和 `@media print` 下，所有 Ambient / Sprite / Motion 动效永远关闭。

---

## §1 Style（样式）

### 本质定义
Style = 皮肤。同一套 layout，换 style，得到完全不同的视觉结果。
最终呈现效果类似 brand guidelines（参照：Anthropic Brand Guidelines 的结构）。

### 组成要素
每个 Style 包含：
- **色系**：主色 60-70% + 辅色 1-2 个 + 点缀色 1 个
- **字体组合**：从 `lib/ai/harness/designPrinciples.ts: DESIGN_FONT_PAIRS` 中挑一套。**该常量是字体配对的唯一合法清单**（与 `app/src/app/layout.tsx` 的 `next/font/google` 严格一一绑定）。宪法不在此复列字体名，避免双真理。
- **装饰语言**：线条、形状、边框风格
- **占位艺术作品**（见 §1.1）
- **底纹**（见 §5）
- **氛围**（见 §6）

### 分类
**Slides** 和 **Report** 是两套独立的 Style 体系，分别设计，不混用。Report 额外受 §9 约束。

### 清单管理
**权威 Style preset 清单以 `app/src/lib/ai/harness/stylePresets.ts` 为准**，宪法不复列，避免 preset 新增时宪法反复追改。

当前 Style 按对标来源分 5 类：
- **投行 / 咨询 / PE**（机构研究风格——三种不同的 institutional register）
- **科技公司**（八套 developer-tool / consumer-tech / fintech / luxury 风格变体）
- **Lasca 原生**（暖陶土 / 冰川 / 洞穴——中文命名待与代码 preset id 同步）
- **Faithful**（1:1 复刻导入文档的 PPTX / PDF 视觉）
- **双语报告**（bilingual-report）

### 规则
1. Style **在 §0 前提下可增加**，但每个新 Style 必须有明确对标（品牌 / 公司 / 时代风格），不凭空发明。
2. 每个 Style 支持颜色变体（在主配色基础上切换），但 §0.3 rule 1（WCAG AA）始终优先。
3. 设计新 Style 必须参考：
   - pptx skill（`pptxgenjs.md`）的设计原则
   - frontend-design skill（每张 canvas 本质是网页）
   - 对应风格家族的设计系统知识
   - 其他参考：canvas-design / theme-factory / algorithmic-art skill（https://github.com/anthropics/skills/tree/main/skills）
4. **Style 必须针对每个 canvas type 单独优化**。同一个 style 在不同页面不是机械死套——cover、尾页、目录、section 标题都是重点设计对象，每个 layout 在该 style 下都应有专属调校（排版、装饰、留白、色彩权重）。当前示例：analyst-mist 的 cover 针对机构研究风格专门做了 40/60 构图 + 艺术面板处理。

### §1.1 占位艺术作品（Placeholder Art）

**定义**：填充 canvas 上非内容区域的视觉艺术，主要出现在 cover、section、back page。
它让结构页从"空白"变成"有设计感"。是每个 Style 美学身份的集中体现。

**两种形式**：

| 形式 | 描述 | 技术 | 示例 |
|---|---|---|---|
| **抽象图形** | 几何/有机形状组合，平面色彩，Calder/Matisse 风 | SVG | 粉色背景 + 黑白有机线条 |
| **算法线条艺术** | 数学曲线、粒子流、扇形线族，有生成感 | Canvas / p5.js | 机构研究蓝色扇形曲线 |

**规则**：
- 占位艺术作品随 Style 切换。每个 Style 必须配套自己的占位艺术。
- 算法类占位艺术参考 algorithmic-art skill 的生成方法。
- 占位艺术作品本身不携带内容信息（不是图表，不是照片），只是视觉装饰。
- 在没有占位艺术的情况下，对应区域显示底纹（§5）作为最低保底。

---

## §2 Canvas（画布）

### 本质定义
Canvas = 一张幻灯片 / 报告页面。每张 Canvas 本质上是一个**网页**（这决定了技术选型和设计方法）。

### 页面类型（Page Types）—— 保持极简

type 只回答一个问题："这一页在文档结构里是什么角色？"
不回答"这页有什么内容"——内容由 layout 决定。

| type | 说明 | 约束 |
|---|---|---|
| `cover` | 封面 | 每文档唯一 |
| `back` | 尾页 | 每文档唯一 |
| `section` | 小节标题 / 目录 / 分隔页 | 导航类，文字极简 |
| `content` | 所有正文页 | 无约束，layout 决定一切 |

**为什么这么少？** 遵循 §0。`data` 页不是独立 type——上文下图（text above, chart below）是一种 layout，不是一种 page type。`image` 页也是 content type + image-focused layout 的组合。

### 核心原则
- **type 决定文档角色，layout 决定视觉排版**。两者正交，不耦合。
- Slides 和 Report 共用 type 分类，但各自有独立的 layout 池。
- 新增 page type 必须满足 §0 的标准（现有 4 种为什么不够用？）。

---

## §3 Layout（布局）

### 本质定义
Layout = 把一张 canvas 切割成不同大小卡片/block 的方案。
本质是 **CSS Grid 卡片系统**（`grid-template-areas` 命名区域）。
所有内容（文字、chart、图片、占位艺术）都是装进卡片里的东西。

### 核心原则
1. **网格优先**：每个 layout 底层是 CSS Grid，区域有名字。
2. **内容无关**：layout 只管切割，不管内容是什么。内容由 type + style 决定。
3. **混合排版是常态**：上文下图、左图右文、三栏混合……这些不是特殊情况，是 layout 系统要覆盖的核心场景，尤其是 analysis 类文档。
4. **可在 §0 前提下扩展**：新 layout 扩展 `cards/compositions.ts`，不修改其他文件。

### 分类
**Slides** 和 **Report** 是两套独立的 Layout 体系，分别设计，不混用。Report 额外受 §9 约束。

### 工程层连接（代码约束，以代码为权威）
以下是工程实现层的约束，属于代码纪律、会随重构演进。以 `app/src/lib/cards/` 和 `app/src/lib/renderSlide.ts` 为准：

- 新 native layout（cards flag on）→ 扩展 `cards/compositions.ts`
- `report-*` layouts → 永远在 `renderSlide.ts`，不进 cards
- `*-faithful` layouts → 永远在 `renderSlide.ts`，不进 cards
- Canvas 尺寸 → 唯一入口 `pageSize.ts`，禁止硬编码像素值

### 参考来源
- pptx skill（`pptxgenjs.md`）：layout 设计原则，"不要重复相同 layout"
- frontend-design skill：spatial composition（asymmetry / overlap / grid-breaking）
- canvas-design skill：breathing room / negative space

---

## §4 Chart（图表）

### 本质定义
Chart = 数据的视觉呈现，**装在 layout 卡片里**，不是独立的页面结构。
Chart 类型清单以 `app/src/lib/types.ts` 和 `renderCharts.ts` 为权威，宪法不复列，避免双真理。

### §4.1 出现方式（两档，默认非全页）

| 档位 | 何时 | 组合 | 数据来源 |
|---|---|---|---|
| **Inline**（默认）| 分析、报告、带论述文字的 content page | `stack-text-media`（上文下图，analysis 默认）/ `split-60-40` / `split-40-60` / `grid-2x2` | chart 进某个 card 的 `role:'chart'` 字段 |
| **Data-hero**（特例）| 数据本身是全页焦点、无旁白 | `full-bleed` | 必须由 mdContext 阶段显式标 `layoutHint: 'data-hero'` |

**关键约束**：
- Chart **禁止默认吃满整页**。生成层（`inferLayout.ts`）不允许把 `bar-chart` / `line-chart` / `pie-chart` / `horizontal-bar-chart` 作为**页面 layout**候选；必须作为卡片内容出现。走 data-hero 通道的唯一路径是 mdContext 显式打标。
- analysis 类内容（preset 为 `bilingual-report` / `editorial` / `analyst-*`，或 density=detailed）默认使用 `stack-text-media`；非此类内容可再考虑 split 变体。

### §4.2 Analyst 美学（比图表类型更重要）

1. **Headline-as-insight**：标题写**结论**，不是**指标名**。
   - ✗ "2024 年华北销量"
   - ✓ "华北销量连续 6 季下滑"
   - prompt 层强制（`chart-design` skill）。
2. **Direct labeling > 图例**：把系列名放到线端 / 柱顶 / 切片旁；图例只在 ≥ 3 系列且无法 direct-label 时出现，最多 5 项。
3. **Source line 硬约束**：每个 chart 必须有 `footnote` 字段携带 `[Source: ...]` / `[信源：...]`；缺失视为脏数据，不予渲染。与 `bilingual-report` 已有规则一致，横向推广。
4. **数字优先于形容词**：所有数值标签显示精确数字 + 单位（`+10.3%`, `24M`），不用 "significantly" / "较多"。已在 `designPrinciples.ts: BANNED_AESTHETICS` 有总则，此处为 chart 专属复述。
5. **网格线主题自适应**：`gridLinesSvg()` 用 `t.muted` + `stroke-opacity="0.35"`（2026-04-17 从 `t.border` 迁出，暗色主题下不再消失）。
6. **调色板禁区**（继承 §11）：不用均匀分布的彩虹；主色 60% + 辅色 2-3 个。饼图 / 堆叠条必须用 `labelColor(i, t)` 统一色序。
7. **Winner emphasis**（2026-04-20 D1）：bar / horizontal-bar 图的**最大值条目**数字标签用 `font-weight:700 + font-size:12 + t.text`；其余条目保持 `10 + t.muted`。让读者的眼睛先落在"赢家"，这是分析师惯例。
8. **In-shape direct labels**（2026-04-20 D1）：
   - Pie / donut: 切片占比 ≥ 8% 且非 compact 时，在切片几何中心（donut 为内外圈中点）画 `13px/700` 百分比标签；文字颜色用 `ensureTextContrast('#ffffff', sliceColor)` 自适应黑白。
   - Donut: 中心孔内画 "Total" + 总值（`22px/700` 主文字色 + `11px` muted letter-spaced 标签）。给数据一个读取锚点，不强迫用户扫图例做加法。
   - Stacked bar: 段高 ≥ 18px 且占比 ≥ 12% 时在段中央画 `11px/600` 直接标签（normalize 模式是 `%`，否则是原值）；较小段保持沉默，由图例兜底。
9. **Line chart 直接标签防重叠**（2026-04-20 D1）：系列名直接贴在末端点时，按 Y 排序并强制最小 16px 间距——原先两条曲线终点重合时标签会挤成一团。
10. **Horizontal-bar 溢出夹**（2026-04-20 D1）：当一条水平柱占 > 85% chartW 时，数值标签改放在柱内右端（`text-anchor="end"`，对比安全色），避免标签被裁出图表框外。

### §4.3 分类参考（FT Visual Vocabulary 九类）

以 Financial Times Visual Vocabulary 九大用途为规划基线：
deviation / correlation / ranking / distribution / change-over-time / magnitude / part-to-whole / spatial / flow。

当前覆盖情况以 `types.ts` 为准，宪法不罗列。新增图表类型必须对齐以上九类之一，并回答 §0：**现有类型为什么不够用？**

### §4.4 反模式（chart 专属，§11 的延伸）

- 彩虹饼图 / 彩虹堆叠条（色相均匀分布）。
- 图例项 > 5。
- 标题是名词短语而非结论。
- 网格线比数据线更显眼。
- chart 全页但无 data-hero 标记（== 默认吃整页，宪法层禁止）。
- 缺 source line 却含非常识数据。

### §4.5 工程接口（权威在代码）

- 图表 SVG 渲染入口：`app/src/lib/renderCharts.ts`（数据图）、`renderDiagrams.ts`（结构图）。
- Inline 卡片承接：`split-image` / `two-column` / `featured-grid` / `bento` / `title-bento` 的 card content 上有 `chart?: {type, data}` 字段；`renderCardCanvas.ts` 的 `role:'chart'` 分支负责尺寸自适应渲染。
- Data-hero 全页：`adapt.ts: chartFullToCardCanvas()`，仅当该 slide 显式需要整页图表时使用，否则 analysis 默认走 inline。
- Annotation 层：`renderCharts.ts: annotationsSvg()` 支持 `reference-line` / `range-band` / `callout`，bar / horizontal-bar / line / stacked-bar 四种均已接入（scatter 暂不接）。
- Style 注入：`ThemeConfig.dataColors`（由 `themes.ts` 提供），`labelColor(i, t)` 为唯一取色函数。禁止在 render 函数里硬编码色值。

### §4.6 Diagram（结构图）视觉规范

Diagram ≠ Chart：**Diagram 是关系/流程/结构的视觉呈现，没有底层数据轴**。权威清单和渲染入口在 `app/src/lib/renderDiagrams.ts`（flowchart / funnel / pyramid / steps / matrix / versus / venn / bullseye / cycle / hub-spoke 10 种）。

Diagram 遵循 §4.2 Analyst 美学的以下条款，其余无需套用：

1. **Headline-as-insight 同样适用**：diagram 的 `title` 写**关系/结论**（"三支柱缺一不可"），不是**标签**（"公司价值观"）。
2. **序号可视化**（flowchart / steps / cycle 强制）：每个节点必须有 `01/02/03` 序号标签；无序号的抽象关系（hub-spoke / venn / matrix）不需要。
3. **色序由 `labelColor(i, t)` 唯一决定**，禁止硬编码。
4. **对比度红线（§10）**：节点/段落上的文字颜色必须过 `ensureTextContrast(desired, bg)`；不允许写死 `#fff` 或 `#000`。已在 funnel / pyramid / flowchart 数字胶囊 / versus VS 徽章落地。
5. **Footnote/source 字段统一**：10 种 diagram 的 Data interface 都有 `footnote?: string`；渲染走 `renderDiagrams.ts: diagramFootnote()` 单一 helper，外观一致（12px / t.muted / 居中 / margin-top:16px）。
6. **dashed / muted 线条可见性**：hub-spoke / 连线类必须用 `t.muted + stroke-opacity:0.55`，不允许用 `t.border`（dark theme 下消失）。
7. **label 分布必须成算法**（不允许硬编码单次 offset 循环）：bullseye 外环用 `-π/2 + (i-1)*2π/(n-1)`；venn 按 n 分两档常量；cycle 圆周均分。加新 diagram 类型时同样要求。

**反模式**（diagram 专属）：

- 节点白字打在浅色 `labelColor` 背景上（WCAG AA 失败）
- flowchart / steps / cycle 没有序号
- 连线使用 `t.border`（dark theme 隐身）
- label 排布用硬编码偏移（加数据量就撞）
- 数据类 chart 伪装成 diagram 来突破 §4.1「不作为 page-level layout 候选」约束

**工程接口补充**：

- Footnote 透传：`renderCardCanvas.ts` 各 diagram case 必须传 `footnote: content.footnote`，CardZones 已统一定义该字段。
- 新增 diagram 类型必须：(a) 在 `types.ts` 加 `FooData` 接口含 `footnote?`、(b) 渲染函数内调用 `diagramFootnote(data.footnote, t)`、(c) `renderCardCanvas.ts` 的 case 分支透传 content.footnote。

**§4.6.1 结构化注解原语（2026-04-20 C1）**

pyramid / steps / cycle / flowchart / hub-spoke 新增 4 种可选字段，让 LLM 能表达"每项独立侧注 + 层间过渡 + 跨项括号 + 语义化样式"——覆盖 Claude 视觉图 2/3 中 70% 的信息密度缺口。所有字段 optional、向后兼容：不填时渲染与 C1 前像素级一致。

| 字段 | 在哪 | 语义 | 规则 |
|---|---|---|---|
| `sidenote` | pyramid.item / steps.item / cycle.item / hub-spoke.spoke | 针对单项的独立一句话洞察 | ≤10 汉字 (en: ≤6 词)。必须与 text/desc 互补不重复；没有洞察就不要填，留空永远优于硬凑。hub-spoke 的 sidenote 与 desc 语义互斥——desc 是"它是什么"（定义），sidenote 是"它为什么重要"（编辑性评注）。|
| `transitionLabel` | steps.item / cycle.item / flowchart.step | 指向下一节点的过渡标签 | ≤10 字 (en: ≤8 词)。只在"谁推动了转换 / 为什么跳下一步"有明确故事时才填；没有故事就省略，不要填通用词（"然后"/"接着"）。|
| `style: 'dashed'` | pyramid.item / flowchart.step | 该层/步是 "未成熟 / 假设 / 摩擦 / 断层" | solid 是默认；dashed 是**语义**信号不是样式偏好。用于翻译层、待验证假设、过渡状态。滥用会稀释语义。|
| `groupLabel` | pyramid / steps / flowchart (vertical) | 跨连续几项的纵向括号+标签（"跟你无关"覆盖底4层）| `{fromIndex, toIndex, text}`，0-based 闭区间。只在连续项确实共享同一归属时才加；单项或非连续不要用 groupLabel——用多个 sidenote。|

渲染约束：
- **Sidenote** 用 `t.muted` + 12px（HTML）或 10px italic（SVG），左侧 2px solid 色条（与节点色一致）以视觉"连接"而非浮空。
- **transitionLabel** 用 `t.accent` 让它和节点文字（`t.text`）区分。
- **dashed** pyramid 用同色低透明度 clip-path 填充 + 同色 dashed SVG outline 叠加；dashed flowchart 用 `border:2px dashed ${color}` 替代 `border-left:4px solid`，并移除 card shadow（示意不成熟）。
- **groupLabel** 渲染为 SVG "[" 括号 + 垂直旋转 accent 色文字，绝对定位在 stack 左侧；容器需预留 64px 左 padding。

**LLM 引导原则**：`prompts.{zh,en}.ts` 已写明"Empty is better than low-signal annotation"。如果发现 LLM 在无洞察场景硬填 sidenote / 用通用词填 transitionLabel，不是加 few-shot 而是加负面示例。

### §4.7 svg-figure 自由槽（2026-04-20 C2，逃生舱）

当 §4.6 的 10 种结构化 diagram 都表达不出某类"隐喻性 / 非数据型"视觉时（浪窗曲线 + dot pin + 相位虚线 + 双轴注解、桥接层、非对称叠层、自定义阶段轴等），LLM 可输出 `layout: 'svg-figure'` 直接吐出 inline `<svg>`。由 `lib/sanitizeSvg.ts` 白名单消毒后渲染为 card-canvas full-bleed。

**使用规则**：
- **只在结构化 diagram 真的表达不出时用**。优先级：bar/pie/line chart → 10 种 diagram → svg-figure。把 svg-figure 当"最后一招"而非默认手段。
- **单页最多 1 个**；`caption` 必填（一句话说明读图要点）。无 caption 的 svg-figure 视为失败输出。
- **禁止**用 svg-figure 画柱状 / 饼 / 折线图——那些用现有 chart layout。svg-figure 专职"隐喻性 / 非数据型"视觉。
- **尺寸**：`viewBox="0 0 1280 720"`。任何其他 viewBox 会按原比例缩放但 layout 会不齐。

**颜色 / 主题桥接**：
- 只能用 `currentColor` 或 CSS 变量 `var(--lasca-primary)` / `accent` / `text` / `muted` / `green` / `dark` / `border`。任何 `#rrggbb` 硬编码都是错误——会破坏 4 种 theme（original/warm/cool/dark）切换。
- 文字默认通过外层容器的 `color: t.text` 继承，SVG 内用 `currentColor` 即可。

**消毒白名单**（`lib/sanitizeSvg.ts`）：
- 允许：`svg/g/defs/path/rect/circle/ellipse/line/polyline/polygon/text/tspan/use/marker/linearGradient/radialGradient/stop/clipPath/mask/title/desc/pattern/textpath/symbol`。
- 禁止：`<script>` / `<foreignObject>` / `<iframe>` / `on*` 事件 / `javascript:` | `data:` | `vbscript:` | `file:` 协议 URL / `href` 非 `<use>` 元素 / `style` 属性内的 `url()`。
- 消毒失败（或白名单全部移除后为空）时返回空字符串，渲染器跳过整个卡片。

**编辑器保护**（`Canvas.tsx`）：
- 渲染容器包 `<div data-no-edit="1">` 做"原子块"标记。`findBlock` / `handleDoubleClick` / `syncSlideHtml` 都会检查 `closest('[data-no-edit]')`，命中则跳过——这样点击 SVG 内的 `<text>` 不会误入 contenteditable，且内部 DOM 不会被 React 的 innerText 同步覆写。
- 用户仍能拖动整个 svg-figure 块，但内部结构是只读的。需要换图就重新生成。

**LLM 引导**：`prompts.{zh,en}.ts` svg-figure schema 声明了所有硬约束。发现 LLM 滥用（用 svg-figure 画能用 bar-chart 的内容、颜色硬编码、viewBox 不对齐）时，**先加 LLM 负面示例**而非放宽消毒器。

---

## §5 底纹（Texture）

底纹 = Canvas 背景上的静态视觉图案（等高线、点阵、几何等）。

- 可替换、可在 §0 前提下增加
- 开关独立于氛围（两者正交）
- 关闭后背景回退到纯色 / 简单渐变

---

## §6 氛围（Ambient）

氛围 = Canvas 上的动态层（纯 CSS animation，零 JS）。如光晕呼吸、星空闪烁、篝火跳动。

- 可替换、可在 §0 前提下增加
- 新增只需在 `globals.css` 添加 keyframe + 选择器
- `[data-no-fx="1"]` 永远禁用（缩略图专用）
- 受 §0.3 rule 3 兜底（`prefers-reduced-motion` / `@media print` 永远关闭）

---

## §7 精灵（Sprite）

精灵 = Canvas 前景层的动画角色 / 元素（非演示动画）。
例：奔跑的小猫、旋转的齿轮、飘落的雪花。

与氛围的区别：氛围是背景环境层，精灵是前景角色层。

- 精灵可在 §0 前提下增加
- 精灵层 z-index 高于氛围层
- 受 §0.3 rule 3 兜底

英文对应：**Sprite**（游戏开发标准术语）。

> 精灵系统的长远规划（Buddy 人格化、3D 深度层）属于未来计划，归 `docs/ARCH.md` Planned 区管理。宪法只描述现行秩序。

---

## §8 Motion（转场与入场动效）

Motion = 页面切换动画（transition）+ 页面内元素入场动画（entry stagger）。与 §6 氛围、§7 精灵**正交**：氛围 / 精灵是"页面稳态下的动"，Motion 是"状态切换时的动"。

### 规则
1. **每个 layout 必须声明默认转场**：权威映射见 `app/src/lib/types.ts: DEFAULT_TRANSITION`（及 `DEFAULT_TRANSITION_BY_COMPOSITION`）。Presenter 不得硬编码转场，一律走这张表。
2. **元素入场 stagger 为宪法级常量**：每个子元素延迟 `i * 90ms`，每条动画时长 `700ms`。改动需明确讨论。
3. **双层切换**：上一页淡出 / 下一页淡入同时发生，避免"闪现"（实现见 ARCH.md §5.4）。
4. **WAAPI，不是 CSS transition**：理由见 ARCH.md §5.5。宪法层禁止回退到 CSS transition + RAF 路径。
5. **兜底**：受 §0.3 rule 3 约束，`prefers-reduced-motion` 和 `@media print` 下所有 Motion 静止。

---

## §9 Report 专属规则

当 `pageSize = letter` 或 `a4` 时适用。Report 不是"横屏改纵屏的 Slide"，而是独立视觉体系。

1. **纵向优化**：利用垂直空间。标题可以占据上 1/4，正文分 2–3 栏。
2. **段落呼吸**：段落间距 = 1.5–2× 行距，避免文字墙。
3. **视觉锚点**：每页至少有 1 个非文字元素（数字、引用框、分隔线、小图表）。
4. **字号层级**：最多 3 级（标题 / 正文 / 注释），标题 vs 正文字号比 ≥ 2:1。
5. **边距慷慨**：上下左右边距 ≥ 页面尺寸的 8%。

**双语报告**（bilingual-report preset）是 Report 的一个特例，用于中英混排场景。中文正文 + 英文 display 字体的混用组合在 `designPrinciples.ts: recommendedFontPair()` 中有专门映射。

规则的 prompt 注入以 `designPrinciples.ts` 的 Report 专属段为权威，宪法此处为摘要。

---

## §10 可访问性（Accessibility）

本章汇总所有可访问性规则。§0.3 rule 1 和 rule 3 是其中的红线核心。

1. **WCAG AA 文本对比（红线，§0.3 rule 1）**：文字与背景对比度达标。唯一不允许讨论的视觉可访问性规则。
2. **非文本对比**：图标、边框、分隔线、数据可视化要素**建议**满足 WCAG AA Non-Text Contrast（3:1），非红线但强烈推荐。
3. **减少动效（红线，§0.3 rule 3）**：`@media (prefers-reduced-motion: reduce)` 下关闭所有 Ambient / Sprite / Motion。
4. **打印模式（红线，§0.3 rule 3）**：`@media print` 下同样关闭动效。`[data-no-fx="1"]` 缩略图场景永远静止。
5. **键盘可达（Shell 范围）**：编辑器 UI 的交互元素需有可见焦点态。Canvas 内容为演示介质，不要求 tab 导航。

---

## §11 反模式清单（Anti-Patterns）

以下模式**任何情况下都不被允许**，是 Lasca 产品审美的硬边界。
**权威清单以 `app/src/lib/ai/harness/designPrinciples.ts: BANNED_AESTHETICS` 为准**（该常量会被注入到所有 AI prompt），宪法此处为摘要以便人类阅读。

### 通用反模式
- **主字体禁用**：Inter、Arial、Roboto、Helvetica、system-ui（最典型的 AI slop）
- **已被用滥**：Space Grotesk（SKILL.md 显式警告 NEVER converge on this）
- **色彩禁区**：紫色渐变 + 白底
- **构图禁区**：所有元素居中对齐 + 灰底（"安全牌"布局）
- **调色板禁区**：均匀分布的彩虹调色板（每个色权重相同）
- **emoji 禁区**：icon / tile / bento / card / featured-grid 任一 icon 字段放 emoji（⏰⚙️💅💻🚀✨ 等）——需要符号就用排印字符（§ ★ ◆ → ● 1–9）或留空让系统生成几何图形

### Report 反模式
- 密集文字墙 + 小字号（report 不是 Word 文档）
- 标题和正文字号差距 < 2 倍（层级不清晰）
- 纯文字页面无视觉锚点
- 段落间距 = 行距（视觉粘连）
- 超过 4 级字号层级（过度复杂）

---

## 附录 A：Shell 基准色

Lasca shell 色盘与 Anthropic Brand Guidelines 完全一致（有意设计）。
受 §0.3 rule 2 约束，**不经明确讨论不允许改动**这些值。

| Token | 值 | 用途 |
|---|---|---|
| `--color-panel-bg` | `#faf9f5` | 所有面板背景 |
| `--color-editor-bg` | `#f0efeb` | 编辑器大背景 |
| `--color-background` | `#f5f5f0` | body 默认背景 |
| `--color-primary` | `#d97757` | 主 accent（橘陶土） |
| `--color-accent` | `#6a9bcc` | 次 accent（冷蓝） |
| `--color-muted` | `#b0aea5` | 次要文字 / 边框 |
| `--color-border` | `#e8e6dc` | 分割线 |
| `--color-foreground` | `#141413` | 主文字 |
| `--color-green` | `#788c5d` | 成功 / 正向 |

实现见 `app/src/app/globals.css`。

---

## 附录 B：已装 Skill 清单

以下 skill 全部来自 https://github.com/anthropics/skills/tree/main/skills，
已装入 `app/src/lib/ai/harness/skills/`：

| Skill | 用途 |
|---|---|
| `pptx` | 幻灯片设计原则：颜色策略、视觉元素、版式多样性 |
| `algorithmic-art` | 占位艺术作品生成：算法线条艺术 / 有机抽象图形 |
| `pdf` | PDF 导出友好的设计约束 |
| `docx` | Report .docx 导出 / 导入的结构和排版约束 |
| `frontend-design` | 每张 canvas 本质是网页；空间构图、字体选择 |
| `canvas-design` | cover / quote / section-break 视觉重页面 |
| `brand-guidelines` | 品牌识别提取和应用（premium theme knowledgeRef）|
| `theme-factory` | 主题生成（色盘 + 字体配对） |
| `report-structure` | Report 结构和内容组织 |
