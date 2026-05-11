// ============================================================================
// PDF Skill
// ============================================================================
// 当输出会被导出为 PDF 时，指导 AI 做出对 PDF 友好的设计决策。
// 基于 anthropics/skills pdf skill 的操作规范。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const pdfSkill: Skill = {
  name: 'pdf',
  description: 'PDF-aware design constraints for print/export-safe output',

  async invoke(input: SkillInput, _ctx: SkillContext): Promise<SkillOutput> {
    const promptAppendix = `
## PDF 导出设计约束

当内容最终会以 PDF 形式交付时，设计必须满足以下约束：

### 颜色
- 避免依赖 CSS animation / filter 的视觉效果（氛围效果在 PDF 导出时关闭）
- 确保静态状态下颜色对比度足够（动态效果消失后依然好看）
- 渐变背景可以保留，但不要依赖动态渐变

### 字体
- 使用系统可嵌入的字体，避免只在屏幕上渲染的特殊字体
- 标题/正文字号关系要在打印尺寸下依然清晰（不要过小）

### 布局
- 不要让内容依赖 viewport 宽度（Report 使用固定 A4/Letter 尺寸）
- 避免 overflow hidden 截断内容 —— 确保所有文字在页面范围内
- 表格：列宽要在打印宽度内合适分配

### Report 专属
- Report 页面尺寸：A4 (210×297mm) 或 Letter (216×279mm)，通过 pageSize.ts 获取
- 页眉/页脚区域（header/footer）预留空间
- 章节之间的分页要自然，不要让标题孤立在页底
`.trim();

    return { promptAppendix };
  },
};

export default pdfSkill;
