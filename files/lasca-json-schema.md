# Lasca V1 — JSON Schema 定义

## 一份完整的 deck

```json
{
  "theme": "warm",
  "title": "AI 不是 Magic",
  "author": "Lasca Team",
  "page_count": 10,
  "slides": [ ... ]
}
```

### theme 可选值（V1 三套）

| 值 | 名称 | 主色 | 强调色 | 背景 | 文字 |
|---|---|---|---|---|---|
| `warm` | 岩壁 | `#d97757` | `#6a9bcc` | `#faf9f5` | `#141413` |
| `cool` | 冰川 | `#4a8db7` | `#d97757` | `#f5f8fa` | `#1a2332` |
| `dark` | 洞穴 | `#d97757` | `#6a9bcc` | `#1a1a1a` | `#f0efeb` |

每套主题对应一组 CSS 变量，模板引擎渲染时注入。AI 不需要管颜色，只管内容。

---

## 单页 slide 结构

每一页都有相同的外层结构：

```json
{
  "layout": "cover",
  "notes": "演讲备注，观众看不到",
  "data": { ... }
}
```

- `layout` — 8 种之一
- `notes` — speaker notes（可选）
- `data` — 每种 layout 的字段不同，见下方

---

## 8 种 layout 及其 data 字段

### 1. cover — 封面 / 结尾

```json
{
  "layout": "cover",
  "data": {
    "title": "AI 不是 Magic",
    "subtitle": "给普通员工的一张 AI 自学路线图",
    "footnote": "从 Chatbox，到 Workflow，到 Agent 与 System",
    "author": "Lasca Team · 2026"
  }
}
```

### 2. big-number — 大数字冲击

```json
{
  "layout": "big-number",
  "data": {
    "number": "84%",
    "text": "的人从未真正与 AI 对话过",
    "footnote": "用过 AI 16% · 听说过 AI 60% · 从未对话过 84%",
    "highlight": "认知鸿沟比技术鸿沟更大"
  }
}
```

### 3. three-cards — 并列卡片（2-5 列自适应）

```json
{
  "layout": "three-cards",
  "data": {
    "title": "三个阶段",
    "cards": [
      { "label": "01", "title": "Chatbox / Copilot", "desc": "先会用，再协作" },
      { "label": "02", "title": "Workflow / Agent", "desc": "让 AI 参与流程" },
      { "label": "03", "title": "Harness / System", "desc": "让 AI 进入系统" }
    ]
  }
}
```

`cards` 数组长度 2-5，模板自动调整列数。

### 4. two-column — 左右对比

```json
{
  "layout": "two-column",
  "data": {
    "title": "从搜索思维到实习生思维",
    "left": {
      "heading": "✕ 搜索思维",
      "content": "\"帮我写个方案。\"",
      "sub": "没有目标、没有受众\n没有材料、没有格式要求"
    },
    "right": {
      "heading": "✓ 实习生思维",
      "content": "\"给老板做10页汇报，受众是管理层...\"",
      "sub": ""
    },
    "footer": "本质变化：不是 AI 更懂你了，而是你更会交代任务了"
  }
}
```

### 5. stacked-bars — 多层横条

```json
{
  "layout": "stacked-bars",
  "data": {
    "title": "AI 世界总地图",
    "bars": [
      { "text": "模型层 — GPT / Claude / Gemini / Kimi / 豆包", "color": "primary" },
      { "text": "产品入口层 — ChatGPT / Claude App / 豆包 / Kimi", "color": "accent" },
      { "text": "搜索层 — Perplexity / 秘塔搜索", "color": "green" },
      { "text": "工作台层 — Cherry Studio / CC Switch", "color": "muted" },
      { "text": "Agent 层 — Manus / OpenClaw / Claude Code / Coze", "color": "primary" },
      { "text": "系统接入层 — API / MCP / 中转站 / 企业系统", "color": "dark" }
    ]
  }
}
```

`color` 引用主题语义色，不是具体 hex。

### 6. grid-cards — 网格

```json
{
  "layout": "grid-cards",
  "data": {
    "title": "Prompt 不是玄学，Context 才是核心",
    "columns": 3,
    "cards": [
      { "label": "01", "title": "目标" },
      { "label": "02", "title": "受众 / 场景" },
      { "label": "03", "title": "材料" },
      { "label": "04", "title": "规则" },
      { "label": "05", "title": "输出格式" },
      { "label": "06", "title": "评价标准" }
    ],
    "footer": "六要素越完整，AI 越不容易「自作聪明」"
  }
}
```

`columns` 可选 2、3、4。卡片数量不限，自动折行。

### 7. quote — 引用 / 金句

```json
{
  "layout": "quote",
  "data": {
    "quote": "AI 不是许愿机",
    "body": "真正的 Magic，是你如何设计它进入工作。\n从会聊天，到会工作，到会重构工作方式。",
    "highlight": "现在就开始，不要等准备好。",
    "author": "AI 不是 Magic · Lasca Team · 2026"
  }
}
```

### 8. image — 全出血图片

```json
{
  "layout": "image",
  "data": {
    "title": "看见未来",
    "subtitle": "当 AI 成为你的第二大脑",
    "image_prompt": "abstract futuristic workspace, warm earth tones, minimal",
    "image_url": "",
    "overlay": "dark"
  }
}
```

`image_prompt` 供 AI 图片生成用。`image_url` 为空时用 prompt 生成，有值时直接用。`overlay` 控制文字可读性：`dark` / `light` / `none`。

---

## AI 生成时发送的上下文

### 生成新 deck 时

```json
{
  "action": "generate",
  "user_prompt": "帮我做一个关于 AI 趋势的 pitch deck",
  "page_count": 10,
  "theme": "warm",
  "type": "keynote"
}
```

AI 返回完整 slides 数组。

### 修改单页时

```json
{
  "action": "edit_page",
  "theme": "warm",
  "outline": ["1. AI 不是 Magic (cover)", "2. 84% (big-number)", "..."],
  "target_page": 3,
  "current_slide": { "layout": "three-cards", "data": { ... } },
  "prev_title": "84% 的人从未真正与 AI 对话过",
  "next_title": "这门课不是…… 而是交付……",
  "user_message": "把第三列改成 Agent"
}
```

AI 只返回变化的字段：`{ "data": { "cards": [...] } }`

### 修改全局时

```json
{
  "action": "edit_global",
  "theme": "warm",
  "outline": ["1. AI 不是 Magic (cover)", "..."],
  "user_message": "改成暗色主题"
}
```

AI 返回：`{ "theme": "dark" }` → 前端切换 CSS 变量，所有页面自动更新。

---

## 约束规则（写进 AI system prompt）

- 每页最多 1 个核心观点
- 标题不超过 8 个词
- 每页要点不超过 3 条，每条不超过 6 个词
- 最小字号 28px
- 不要纯文字列表 — 用 cards 或 two-column
- 同一个关键词在整份 slides 中出现不超过 2 次
- 优先使用 big-number、cards、two-column 等有视觉结构的 layout
- 页数由用户选择，范围 8-35 页（含首尾 cover/quote）
