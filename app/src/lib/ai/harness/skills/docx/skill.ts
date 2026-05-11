// ============================================================================
// DOCX Skill
// ============================================================================
// 当 Report 需要导出为 .docx 或从 .docx 导入素材时的设计约束。
// 基于 anthropics/skills docx skill 的技术规范。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const docxSkill: Skill = {
  name: 'docx',
  description: 'Word-compatible design constraints for Report docx export/import',

  async invoke(input: SkillInput, _ctx: SkillContext): Promise<SkillOutput> {
    const promptAppendix = `
## DOCX（Word）兼容设计约束

当 Report 内容需要以 .docx 形式导出，或从 .docx 导入素材时：

### 结构层级
- 使用严格的 heading 层级：H1（章节）→ H2（小节）→ H3（段落标题）
- 不要用加粗段落模拟标题——使用真正的 Heading 样式
- 段落之间用段落间距（spacing）分隔，不用空行

### 表格
- 列宽必须在 A4 页面宽度（约 16cm 内容区）内合理分配
- 表格单元格不能有溢出内容
- 表头行始终重复（长表格跨页时）

### 字体和样式
- 标题字体 / 正文字体要映射到 Word 可用字体
- 避免使用 Word 不支持的 CSS 属性描述样式
- 字号：H1 约 18-20pt，H2 约 14-16pt，正文 11-12pt

### 技术约束（来自 docx npm package 规范）
- 页面尺寸必须显式设置（默认 A4，不是 Letter）
- 项目符号使用 LevelFormat.BULLET，不用 unicode 字符 "•"
- 分页符必须包裹在 Paragraph 元素内
- 图片必须指定 type（png/jpg/jpeg/gif/bmp/svg）
- 引号使用 XML entities：&#x201C; &#x201D; &#x2019;

### 与 Report 的关系
- Report 的 layout 设计要在 docx 导出后仍然可读
- 多栏布局在 docx 里通常退化为单栏，设计时要确保内容降级后依然合理
`.trim();

    return { promptAppendix };
  },
};

export default docxSkill;
