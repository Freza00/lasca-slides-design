# Lasca — 产品文档补充 V2 (本次对话决策记录)

基于 slide-editor-v4.html 原型迭代和产品讨论，以下为所有新增决策和设计细节。

---

## 一、编辑器交互升级

### 对齐辅助线 + 吸附
- 拖拽元素时自动检测对齐：画布中心、画布边缘、其他元素边缘/中心
- 5px 阈值内自动吸附
- 橙色线 = 画布中心，蓝色线 = 元素对齐
- 松手后辅助线消失

### 样式编辑
- 从固定右侧面板改为**浮出气泡** — 选中元素时在元素旁边弹出
- 可调：背景色、文字颜色（含品牌色快选）、字号、字重、字体、圆角、内边距、透明度、对齐
- 不占固定布局空间

---

## 二、导入导出系统

### 统一导入（一个按钮，多格式）
- 点"导入"弹出文件选择器，接受 `.html`、`.lasca`、`.pptx`、`.pdf`、`.docx`、`.json`、`.md`、`.txt`
- HTML/lasca → 解析 slides 结构，作为新标签打开
- PPTX → JSZip 解压，提取每页文字生成 HTML slides
- PDF/DOCX → 提取文字内容，按标题分页（V1 基础支持，V2 增强）
- MD/TXT → 按标题（`#`/`##`）分页
- JSON → `[{id, html}, ...]` 格式
- 旧版 `.ppt` → 提示转为 `.pptx`
- 共享 `parseHtmlToSlides()` 解析器，tab 栏"+"和导入按钮复用

### 导出
- **主要：`.lasca`** — 自包含 HTML，双击浏览器打开可演示（翻页、进度条、键盘控制）
- **次要：JSON** — 小按钮
- **PDF** — 不变
- 避免模板字符串中 `</script>` 导致解析崩溃（用数组拼接 + `'<' + '/script>'`）

---

## 三、AI 对话面板（右侧）

### 设计风格
- **暖色系**，和编辑器统一（`#faf9f5` 背景，`#e8e6dc` 边框）
- 不用深色/黑色面板 — 和左侧岩壁色调割裂

### 消息流设计（参考 Claude Code TUI）
- 不同颜色圆点标记消息类型：
  - 🟢 `#788c5d` — AI 问候/完成
  - 🔵 `#6a9bcc` — 正在执行/操作
  - 🟠 `#d97757` — 用户消息
- **思考动画**：`· ✻ ✽ ✶ ✳ ✢` 六字符 150ms 循环（仅最新一条消息上显示，旧消息变静态淡色点）
- **流式打字**：AI 回复逐字出现 + 光标 `▍`（仅最新一条，旧消息直接显示）
- **操作块可折叠**：默认一行摘要，点击展开详情
- **消息流边缘渐隐**：顶部/底部 24px CSS mask 渐隐遮罩
- **新消息滑入**：fadeIn 0.3s 动画
- **Scope 标签**：每条用户消息显示颜色标签 — 橙色 `第4页`、蓝色 `第3、5页`、黑色 `全局`

### 顶部面板状态栏
- 绿点 + "Lasca" + 当前页码

---

## 四、Scope 系统（单页 vs 全局 vs 多页）

### 两个发送键
- `[第N页 ↵]`（橙色 `#d97757`）— 当前页/检测到的页
- `[全部 ↵]`（黑色 `#141413`）— 全局操作
- Enter = 换行，Cmd+Enter = 快捷发送当前页

### 智能页码检测（纯正则，不调模型）
```javascript
// 优先级：范围 → 多次提及 → 紧凑列表 → 单页
"第3到8页"       → [3,4,5,6,7,8]   按钮显示 "多页"
"第7页和第5页"    → [5,7]           按钮显示 "多页"
"第3、5、7页"    → [3,5,7]         按钮显示 "多页"
"第7页"          → [7]             按钮显示 "第7页"
无页码            → null            按钮显示 "第N页"（当前页）
```
- 多页时鼠标悬浮自定义气泡显示具体页码

### 渐进式应用（全局/多页操作的防呆）
```
用户: "所有标题改成蓝色" [全部]
  ↓
1. AI 先在当前页预览
  ↓
2. 弹出确认按钮：[满意，全部应用] / [再调一下]
  ↓  满意
3. 抽样验证 2-3 页（选跨度大的，如第1页和最后一页）
  ↓  没问题
4. 应用剩余页面
```
- 不满意 → 只浪费 1 页的 token
- 抽样选跨度大的页（cover 和内容页），确保不同 layout 效果一致

### 撤销倒计时（3 秒）
- 每次 AI 操作完成后，输入框上方出现黑色 toast：`已修改第4页  [撤销 3s]`
- 3 秒倒计时，点击回滚
- 不点自动消失
- 三层防护：发送前（两个按钮） + 执行后（3s 撤销） + 事后（Cmd+Z）

---

## 五、本页操作记录（工具栏下方）

- 窄条，只在有操作记录时显示
- 横向排列最近 4 条操作
- 旧条目渐隐：最新 100% → 60% → 30% 透明度
- 只显示本页操作，全局操作不写入
- 翻页自动切换

---

## 六、Speaker Notes

- 画布下方固定 72px 区域
- 每页独立备注，数据存 `slideNotes` state（`slideId → text`）
- 演示模式讲者视图可显示
- 不承担 AI 对话功能

---

## 七、AI 上下文架构

### 两层分离
```
全局上下文（每次都发，~200 token）
├── theme: { primary, bg, font, type }
├── outline: ["1. cover: AI不是Magic", "2. big-number: 84%", ...]
└── rules: "每页≤15字, 最多3要点"

本页上下文（只发目标页，~150 token）
├── current_slide: { layout, data }
├── prev_title
└── next_title
```

### AI 只返回变化的字段
```
用户: "把数字改成92%"
AI 返回: { "data": { "number": "92%" } }  ← 不是整页
前端 merge 进当前 slide → 重新渲染
```

### 三种操作 scope
| scope | 发什么 | 改什么 |
|---|---|---|
| 单页 | theme + 当前页 JSON | 当前页 JSON diff |
| 多页 | theme + 目标页 JSON | 每页 JSON diff |
| 全局/主题 | 只发 theme 变量 | CSS 变量，全页自动更新 |

---

## 八、JSON Schema（V1 锁定版）

### Deck 结构
```json
{
  "theme": "warm | cool | dark",
  "title": "string",
  "author": "string",
  "page_count": 8-35,
  "slides": [{ "layout": "...", "notes": "...", "data": {} }]
}
```

### 8 种 Layout
1. **cover** — title, subtitle, footnote, author
2. **big-number** — number, text, footnote, highlight
3. **three-cards** — title, cards[{label, title, desc}]（2-5列）
4. **two-column** — title, left{heading, content, sub}, right{...}, footer
5. **stacked-bars** — title, bars[{text, color}]
6. **grid-cards** — title, columns(2-4), cards[{label, title}], footer
7. **quote** — quote, body, highlight, author
8. **image** — title, subtitle, image_prompt, image_url, overlay

### 3 套主题
| 值 | 名称 | 参考 | 主色 | 背景 |
|---|---|---|---|---|
| `warm` | 岩壁 | Anthropic | `#d97757` | `#faf9f5` |
| `cool` | 冰川 | Linear + Atlassian | `#4a8db7` | `#f5f8fa` |
| `dark` | 洞穴 | Linear + Vercel | `#d97757` | `#1a1a1a` |

### 页数：用户选择，最多 35 页

---

## 九、（已合并至第十六章"产品哲学"）

---

## 十、键盘交互修复

- textarea/input 获得焦点时，跳过导航键（空格、方向键、Delete）
- 只有 Escape 和 Cmd+Z 仍然全局生效
- 防止在 AI 对话框/Notes 里打字时意外翻页

---

## 十一、原型文件清单

- `slide-editor-v4.html` — 完整单文件原型，包含以上所有交互
- `lasca-json-schema.md` — JSON schema 定义文档
- 本文档 — 产品决策记录

---

## 十二、V1 上线待做清单

| 任务 | 工作量 | 谁做 |
|---|---|---|
| 1. 三种输入入口的流程 UI | 半天 | Claude Code |
| 2. `renderSlide(json, theme)` 模板引擎 | 半天 | Claude Code（基于 schema） |
| 3. AI prompt（结构化+润色+起标题，不凭空生成内容） | 2小时 | 你测试，Claude Code 接入 |
| 4. Next.js 重写 + 3套主题 CSS 变量 | 1天 | Claude Code |
| 5. Lemon Squeezy 付费接入 | 2小时 | Claude Code |
| 6. 部署 Vercel | 30分钟 | Claude Code |
| 7. Landing page | 半天 | Claude Code |

---

## 十三、导出分层体系（精细版）

### 三级体验 — 岩壁 / 拓本 / 精拓

| 层级 | 能做什么 | 不能做什么 |
|---|---|---|
| **官网 lasca.ai（岩壁）** | 一切：AI 对话、加页、换布局、换主题、模板引擎 | — |
| **免费 .lasca（拓本）** | 双击打开演示、文字微调 ≤5%、删页 | 不能加页、不能改布局/主题/颜色、不能导入别的文件、不能导入回 lasca.ai |
| **付费 .lasca（精拓）** | 导入别的 .lasca 文件、更多编辑、导入回 lasca.ai | AI 对话（仍需回官网） |
| **PDF（压平）** | 看、打印 | 完全静态 |

### PDF 导出分辨率分层

| 层级 | 分辨率 | 水印 | scale 参数 | 场景 |
|---|---|---|---|---|
| 免费 | 1080p（1920×1080） | 有 Buddy 水印 | `scale: 2` | 屏幕阅读、发邮件 |
| Pro | 2K（2560×1440） | 无水印 | `scale: 2.67` | 投影仪、大屏演示 |
| Ultra | 4K（3840×2160） | 无水印 | `scale: 4` | 打印、高端场景 |

设计原则：**免费版给"正常好用"的品质（1080p），不故意降质。** 水印是免费版的限制，不是模糊。用户分享一份带水印但清晰的 PDF = 品牌曝光（对你有利）。分享一份模糊的 PDF = 产品差评（对你有害）。

### .lasca 导出动画分层

官网编辑器和演示模式中所有动画都在跑，用户先看到完整效果。导出后根据付费状态降级：

**基础动画（免费保留）**
- 元素渐入（fadeIn）
- 文字出现
- 页面切换过渡
- 免费版仍然比 PPT 好看十倍，不丢人

**高级动画（付费解锁）**
- 漂浮气泡 / 粒子背景
- 数字滚动（count-up）
- 视差深度
- 3D 倾斜
- 滚动驱动动画
- Buddy 全页动画
- 鼠标跟随效果

**用户感知路径：**
```
官网编辑（全部动画）→ "好好看！"
  ↓ 免费导出
.lasca（基础动画）→ "还行，能用"
  ↓ 但是
"粒子背景没了？数字不滚动了？"
  ↓
付费 $1.50-2.99 解锁全部动画
```

不是"变丑了"，是"少了一点魔法"。技术实现：导出时检查付费状态，免费版在 HTML 中移除高级动画的 CSS/JS 代码块。

### 免费 .lasca 编辑限制（类比微信公众号发布后修改）

- **文字修改 ≤ 5%** — 按总字符数计算
  - 编辑器实时显示 "已使用 3/5%"
  - 超过阈值 → 锁定编辑，弹提示 "需要更多修改？回到 lasca.ai"
- **可以删页，不能加页**
- **不能改布局、主题、字体、颜色**
- **没有"打开文件"/"导入"按钮** — 只能编辑导出时绑定的这一个文件
- **带 Buddy 水印**
- 技术实现：导出时记录原始字符总数，每次编辑对比 diff 长度

### 付费 .lasca

- 有导入按钮（能打开别的 .lasca 文件）
- 文字修改无上限
- 可导入回 lasca.ai 继续用 AI 编辑
- Buddy 全动画 或 可去除
- 单份付费 $1.50-2.99

### 设计哲学

**"拓本永远不如原刻"不是人为制造障碍，是真实的能力差距。** 能用 VS Code 改你 HTML 的人，本来就不是你的客户。你的客户是不会写代码的人 — 给他们一个 HTML 文件，他们能看能演示，但想改布局、加页、用 AI 说一句话就改好 → 只有 lasca.ai 能做。

**价值在工具里，不在文件里。** Obsidian 的笔记是纯 Markdown，任何编辑器都能打开，但没人因此离开 Obsidian。

---

## 十四、Local-First 架构（借鉴 Obsidian）

### 核心原则：服务器无状态，用户数据零存储

```
Obsidian: 笔记是本地 .md 文件
Lasca:    slides 是浏览器 localStorage 里的 JSON

Obsidian: .obsidian 文件夹存设置
Lasca:    主题、偏好存 localStorage

Obsidian: 核心功能完全离线
Lasca:    编辑器完全离线可用（拖拽、改文字、删页、换颜色 → 零 API 调用）
          只有 AI 对话才需要联网

Obsidian: Sync 是付费附加服务
Lasca:    不需要 Sync — 用户的"同步"是把 .lasca 放进自己的 iCloud/Google Drive
```

### 服务器只做 3 件事（全部无状态）

```
1. 静态托管（Vercel/Cloudflare）
   - Next.js 前端
   - 零成本，CDN 全球加速

2. AI 代理（Serverless Function）
   - 用户发消息 → 转发给 Claude API → 返回结果
   - 无状态，按调用收费
   - 不存储任何对话历史

3. 付款（Lemon Squeezy 托管）
   - 不经过你的服务器
   - Webhook 通知解锁功能
```

### 不需要的东西

- ✗ 数据库 — slides JSON 存浏览器 localStorage
- ✗ 用户系统 — Lemon Squeezy 的 license key 即可
- ✗ 文件存储 — .lasca 文件下载到用户本地
- ✗ CDN for 用户内容 — 用户自己的文件自己管
- ✗ 聊天记录存储 — 对话历史存 localStorage

### 数据流

```
编辑（离线）: 浏览器 localStorage → 编辑 → 保存回 localStorage
AI 调用:     浏览器 → Serverless Function → Claude API → 返回 → 浏览器
导出:        浏览器 → 生成 .lasca 文件 → 下载到本地
付款:        浏览器 → Lemon Squeezy → Webhook → 解锁功能
```

### 对话历史存储

```javascript
// 每次消息存 localStorage
localStorage.setItem('lasca-chat-' + deckId, JSON.stringify(messages));
// 刷新页面从 localStorage 恢复
const saved = localStorage.getItem('lasca-chat-' + deckId);
```

### BYOK 模式（V2）

```
V1: 你的 serverless function 代理 AI 调用
    用户 → 你的服务器 → Claude API
    你承担 API 成本，从售价赚差价

V2: 用户自带 API key (BYOK)
    用户 → 直接从浏览器调 Claude API
    你的服务器成本 = 0
    你只收平台费 $12.99/月
```

### 成本对比

| 规模 | 传统 SaaS（有数据库） | Lasca local-first |
|---|---|---|
| 100 用户 | ~$50/月 | ~$5/月 |
| 1,000 用户 | ~$200/月 | ~$30/月 |
| 10,000 用户 | ~$800/月 | ~$150/月 |

### 极端 local-first 版本（远期愿景）

整个 Lasca 编辑器可以是一个单 HTML 文件。用户下载 `lasca-editor.html`，双击打开就能用。不需要网站在线。AI 功能用 BYOK 直接从浏览器调 API。网站只做三件事：下载编辑器、展示模板、收款。

---

## 十五、Obsidian 经验总结

### 值得借鉴

| Obsidian 的做法 | Lasca 应用 |
|---|---|
| 核心免费，云服务收费 | 编辑器免费，AI + 导出收费 |
| Local-first，用户拥有数据 | .lasca 文件不依赖服务器 |
| 插件生态 2700+ | V3 模板市场 + 社区模板 |
| 两人团队零会议全天写代码 | 一人团队 + Claude Code |
| 社区自然生长（从 Discord 开始） | 上线后开 Discord 收反馈 |
| Roam 又贵又封闭 → Obsidian 的机会 | Gamma 云端锁定 → Lasca 的机会 |
| $25M ARR，零融资，18 人 | 目标 $5000/月即成功 |

### 需要避免的坑

| Obsidian 的教训 | Lasca 怎么避 |
|---|---|
| Sync 是地狱（冲突、延迟、数据丢失） | 不做 Sync，.lasca 文件就是用户的"同步" |
| Electron 性能问题（启动慢、内存大） | 不用 Electron，用浏览器 |
| 插件生态变成不可管理的混乱 | V1 不做插件，V3 模板市场要有策展 |
| 缺乏协作导致用户流失到 Notion | V1 不做协作，产品定位是"个人做好看的东西分享出去" |
| Vault 膨胀后性能下降 | 每份 .lasca 是独立文件，不存在"越用越慢" |

---

## 十六、产品哲学更新

### AI 是编辑，不是作者（V1 核心决策）

- 用户负责带内容，Lasca 负责变好看
- **AI 可以做的（基于用户已有内容）：**
  - 润色文字（精简、调整语气）
  - 起标题（从段落内容提炼）
  - 归纳总结（三段话 → 三个要点）
  - 分页分段（长文拆成合理的 slides 结构）
  - 匹配 layout（判断内容适合 cards 还是 two-column）
- **AI 不做的（凭空创造）：**
  - 用户说"帮我做个 AI 的 PPT" → 不编内容，引导用户提供素材
  - 用户给了 3 个点 → 不替他展开成段落
  - 用户没给素材 → 不替他想论据
- 一句话：**AI 是编辑，不是作者。** 用户给原材料，AI 帮他切、拼、磨、抛光
- 以后版本可以加内容生成，V1 不做

### 三种输入入口

1. **改造 Redesign** — "我有现成的，变好看"（上传 .pptx/.pdf/.docx/.html）
   - 自动提取文字结构 → 匹配 layout → 套主题
   - AI 可润色标题、归纳要点，但不改变用户的核心信息
2. **排版 From Draft** — "我有内容，没有设计"（粘贴文字/.md/.txt）
   - AI 识别段落标题 → 按逻辑分页 → 匹配 layout
   - AI 可提炼标题、精简冗余文字
3. **新建 From Scratch** — "我从零开始"（填 points，不填 pages）
   - 结构化表单引导用户填要点
   - AI 分配 layout，自动加首尾页

### 所有入口都有结构预览确认
```
第1页 cover      "AI 不是 Magic"
第2页 big-number  "84%"
第3页 three-cards "三个阶段"
...
        [确认] [调整]
```

### From Scratch 的 AI 边界

用户只填了简短的要点，AI 怎么处理：
```
用户填: "大部分人没用过 AI"

AI 做:
  - layout = big-number
  - text = "大部分人没用过 AI"（用户原文）
  - number = ""（留空，让用户自己填数字）
  - footnote = ""（留空）

AI 不做:
  - 不编造 "84%" 这个数字
  - 不替用户展开成一段话
```
原则：**宁可留空让用户填，不替用户编。** 用户进入编辑器后，空字段会有占位提示"点击填写"。

### 内容不够怎么办（防呆）

用户的内容量和选择的页数不匹配时：
```
From Draft: 粘贴了 3 句话，但选了 15 页

● 你的内容大约够 4 页。
  ┌──────────┐ ┌──────────────┐
  │ 做 4 页   │ │ 我再补充内容   │
  └──────────┘ └──────────────┘

From Scratch: 填了 2 个点，选了 20 页

● 2 个要点建议 6-8 页。要加更多要点吗？
  ┌──────────┐ ┌──────────────┐
  │ 做 6 页   │ │ 我再加几个点   │
  └──────────┘ └──────────────┘
```
不替用户凑内容，告诉他不够，让他决定。

### From Scratch 表单设计

```
标题: [                    ]
你要讲几个点？
  1. [                    ] 1页 ▾   ← 默认灰色，AI 自动分配
  2. [                    ] 2页 ▾   ← 点击可展开选 1/2/3 页
  3. [                    ] 1页 ▾
  + 再加一个
                  合计 8 页（含首尾）  ← 实时更新
风格: [岩壁] [冰川] [洞穴]
              [开始设计 →]
```

- 用户填 points/topics，不填 pages
- 页数右侧默认不显眼，不碰 = AI 自动分配，碰了 = 用户说了算
- AI 自动加 cover（首页）和 quote（尾页）

### 参考品牌指南（主题设计）

| 主题 | 参考公司 | 链接 |
|---|---|---|
| warm 岩壁 | Anthropic | 当前品牌色 |
| cool 冰川 | Linear + Atlassian | linear.app/brand, atlassian.design |
| dark 洞穴 | Linear + Vercel | linear.app/brand, vercel.com/design |
| 更多（V2） | Stripe, GitHub, Spotify, IBM Carbon | 各自官网 |
