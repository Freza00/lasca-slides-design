// ============================================================================
// PPTX Skill
// ============================================================================
// 基于 anthropics/skills pptx skill 的设计原则。
// 指导 AI 生成不 "AI味" 的幻灯片设计：颜色策略、视觉元素、版式多样性。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const pptxSkill: Skill = {
  name: 'pptx',
  description: 'Slide design principles — color strategy, visual dominance, layout variety',

  async invoke(input: SkillInput, _ctx: SkillContext): Promise<SkillOutput> {
    const promptAppendix = `
## Slide Design 原则（pptx skill）

### 颜色策略
- **60-70% 主色统治画面**：确定一个主色调后，它要占据绝大多数面积
- **1-2 个辅色 + 1 个点缀色**：辅色用于次要元素，点缀色用于强调关键信息
- **颜色服务于主题**：颜色要让人感觉"为这个内容专门设计"，不是通用模板
- **深色/浅色二选一**：要么深色底色 + 浅色文字，要么浅色底色 + 深色文字，不要混用

### 每张幻灯片必须有视觉元素
纯文字幻灯片是最差的选择。每页至少有以下之一：
- 图表（chart）
- 图片或占位艺术作品（placeholder art）
- 图标（icon）
- 几何形状或装饰线条

### 版式多样性
- **不要重复相同版式**：连续两页不能用完全一样的布局
- **不要居中对齐正文**：标题可以居中，正文段落必须左对齐
- 标题字号 36-44pt，正文 14-16pt

### 绝对禁止（这些是 AI 生成的明显特征）
- 标题下方加装饰性下划线（accent underline）
- 默认蓝色配色
- 纯要点列表（bullet-only slides）
- 版式在多张幻灯片间完全重复
- 随机混用行距
- 低对比度元素（浅灰字在白色背景上）
- 遗留占位符文字（"在此输入内容"）
`.trim();

    return { promptAppendix };
  },
};

export default pptxSkill;
