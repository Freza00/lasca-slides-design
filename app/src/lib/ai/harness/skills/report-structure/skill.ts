// ============================================================================
// Report Structure Skill (Phase 3)
// ============================================================================
// Fires when the user is generating a REPORT (Letter/A4 document) with a
// SLIDE-format preset (i.e. preset.format === 'slide' carried into the
// report channel). Channel-native report presets (preset.format === 'report')
// own their visual system via long preset appendices — we defer to them.
//
// For slide-format presets used in the report channel (legacy fallback),
// this skill injects the block-based composition guide: 9 ReportBlock
// variants, page budget rules, citation markers, JSON example.
// ============================================================================

import type { Skill, SkillInput, SkillOutput } from '../types';

const REPORT_STRUCTURE_APPENDIX = `## Report 页面结构（必须遵守）

Report 以 block-based page 为主体。每页的 \`layout\` 必须是：
- \`report-cover\`：仅用于 deck 第一页（封面），字段 \`{title, subtitle?, date?, author?}\`
- \`report-page\`：所有正文页。字段 \`{blocks: ReportBlock[]}\`

旧 layout \`report-section\` / \`report-body\` / \`report-quote\` **仅保留用于兼容旧 deck**，新生成一律使用 \`report-page\`。

### ReportBlock 9 种类型

每个 block 有 \`kind\` 字段区分。按内容需要混合使用，同一页可混合多种 block。

1. **section-heading**：\`{kind:'section-heading', text, number?}\` — 章节标题，每页最多 1 条，放在页顶。
2. **body-para**：\`{kind:'body-para', text}\` — 普通正文段落。可以用 Markdown 内联（\`**粗体**\`、\`*斜体*\`）。citation 标记 \`[信源：...]\` 或 \`[Source: ...]\` 放段末，渲染器会自动拆分成独立样式。
3. **callout**：\`{kind:'callout', text}\` — 左侧有 accent 竖线的强调块，适合关键结论或警示。
4. **quote-pull**：\`{kind:'quote-pull', text, attribution?, context?}\` — 大字号斜体引用，用于突出某个人物观点或重要论断。
5. **figure**：\`{kind:'figure', imageUrl, caption?, alt?}\` — 图片 + 图注。适合数据可视化、实景照片。
6. **table-block**：\`{kind:'table-block', table: {headers, rows, highlight?}}\` — 内联表格，headers 数组 + rows 二维数组。
7. **footnote-row**：\`{kind:'footnote-row', text}\` — 页脚小字注释，**自动置底**（渲染器会把所有 footnote-row 浮到页面底部）。
8. **sidenote-group**：\`{kind:'sidenote-group', body, sidenote}\` — 左 34% 小字 sidenote + 右 66% 正文段落的双栏结构，适合需要旁注说明的段落。
9. **list-block**：\`{kind:'list-block', items: string[], ordered?: boolean}\` — 结构化 bullet 或编号列表。每个 item 是一条。

### 页面预算规则

- 每页最多 **6 个 flow block**（不计 footnote-row，因为它自动置底）
- 每页最多 **1 个 section-heading**（应在首位）
- 每页最多 **1 个 figure** 或 **1 个 table-block**（大尺寸内容不堆叠）
- footnote-row 如果存在，应在 blocks 数组**末尾**
- 文字密度：body-para 单条不超过约 200 字（中文）或 500 字符（英文）。超了拆成两个 body-para 或转为 list-block

### JSON 示例（混合 4 种 block 的一页）

\`\`\`json
{
  "layout": "report-page",
  "data": {
    "blocks": [
      {"kind":"section-heading","number":"2.1","text":"需求侧动态"},
      {"kind":"body-para","text":"NAR 数据显示 Pending Home Sales 连续 3 个月环比上行，其中西部地区贡献主要增量。[信源：NAR, 2026-04]"},
      {"kind":"callout","text":"40 万美元以下的房源流动性最强，支撑起市场底盘。"},
      {"kind":"list-block","items":["Texas 三城仍保持 12% 以上的租金 yield","BTR 在 Houston 和 DFW 供给快速扩张","加州独栋库存下降带动租金企稳"]},
      {"kind":"footnote-row","text":"数据截至 2026-04-14。Pending Home Sales 口径：已签约但未过户。"}
    ]
  }
}
\`\`\`

### Deprecated layouts（仅兼容旧 deck）

\`report-section\` / \`report-body\` / \`report-quote\` 的 renderer 保留可运行，但新生成**禁止输出**。需要 section heading 就用 \`section-heading\` block，需要 body 就用 \`body-para\`，需要引用就用 \`quote-pull\`。
`;

const reportStructureSkill: Skill = {
  name: 'report-structure',
  description: 'Report composition guidance — block types, page budgets, citation pattern',

  async invoke(input: SkillInput): Promise<SkillOutput> {
    // Guard: this skill should only fire for slide-format presets used in the
    // report channel. Channel-native report presets (preset.format === 'report')
    // own their visual system via a long preset appendix — return empty so it
    // stays the sole source of truth. selectSkills() already gates on this;
    // defense-in-depth.
    if (input.preset?.format === 'report') {
      return { promptAppendix: '' };
    }
    // Also guard on format — same defense-in-depth. If a non-report call
    // path picks this skill up accidentally, emit nothing.
    if (input.format !== 'report') {
      return { promptAppendix: '' };
    }

    return {
      promptAppendix: REPORT_STRUCTURE_APPENDIX,
      suggestedLayouts: ['report-page', 'report-cover'],
    };
  },
};

export default reportStructureSkill;
