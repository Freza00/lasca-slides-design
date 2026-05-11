// ============================================================================
// Canvas Design Skill
// ============================================================================
// 专门处理 cover/quote/section-break 等视觉重的 layout。
// 基于 anthropics/skills 的 canvas-design skill 理念：90% 视觉，10% 文字。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const canvasDesignSkill: Skill = {
  name: 'canvas-design',
  description: 'Visual-heavy layout specialist for cover/quote/section-break',

  async invoke(input: SkillInput, ctx: SkillContext): Promise<SkillOutput> {
    const promptAppendix = `
## Canvas Design 约束（视觉重的页面）

当 layout 是 cover / quote / section-break 时，这些页面是**视觉为主**的：

### 核心原则：90% 视觉，10% 文字
- **Cover 页**：标题占据页面 40-60%，其余全是留白或背景纹理。不需要副标题、不需要正文
- **Quote 页**：引用文字占据页面中心，字号巨大（48-72px），引用标记（"）作为视觉锚点
- **Section-break 页**：一个短标题（2-4 个词）+ 大量留白，作为章节转场

### Typography
- **字号要大胆**：Cover 标题 60-100px，Quote 正文 48-72px
- **行距要宽松**：line-height 1.4-1.6，让文字有呼吸空间
- **字重对比强烈**：标题 weight 700-800，让它成为视觉主体

### 空间构图
- **留白 ≥ 60%**：这些页面的力量来自空间，不是元素
- **居中或偏心对齐**：Cover 可以居中偏下，Quote 居中，Section-break 偏左上
- **不要添加装饰元素**：不要 icon、不要分割线、不要卡片。只有文字和背景

### 色彩
- **背景可以有纹理**：使用 theme 的 texture variant，增加视觉层次
- **文字对比度要高**：确保在纹理背景上清晰可读
- **Cover 可以用强调色**：标题的关键词可以用 accent color 高亮

### 禁止
- 不要在 Cover 页添加副标题、日期、作者信息（除非用户明确要求）
- 不要在 Quote 页添加解释文字
- 不要在 Section-break 页添加正文
`.trim();

    return {
      promptAppendix,
      suggestedLayouts: ['cover', 'quote', 'section-break'],
    };
  },
};

export default canvasDesignSkill;
