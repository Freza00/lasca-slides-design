// ============================================================================
// Algorithmic Art Skill
// ============================================================================
// 指导 AI 为 cover / section-break / back 页生成算法线条艺术（占位艺术作品）。
// 基于 anthropics/skills algorithmic-art skill 的生成哲学。
// 典型示例：机构研究封面的扇形曲线、Calder 风格有机形状。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const algorithmicArtSkill: Skill = {
  name: 'algorithmic-art',
  description: 'Placeholder art generation — algorithmic line art for cover/section/back pages',

  async invoke(input: SkillInput, _ctx: SkillContext): Promise<SkillOutput> {
    const promptAppendix = `
## 占位艺术作品（Placeholder Art）设计原则

占位艺术作品出现在 cover、section-break、back page 等视觉重的页面。
它是该 Style 美学身份的集中体现，不携带内容信息，只是视觉装饰。

### 两种形式

**1. 算法线条艺术**（generative / algorithmic）
- 数学曲线族：扇形展开线、Fibonacci 螺旋、流场曲线
- 特征：精细平行线、有方向感、几何韵律
- 典型案例：机构研究封面的蓝色扇形弧线从右上角向外展开
- 实现：SVG path 或 inline Canvas，以主题色为基础色

**2. 抽象有机图形**（abstract / organic）
- 平面有机形状：圆形、不规则多边形、流动曲线的组合
- 特征：Calder / Matisse 风格，高对比度黑白 + 纯色背景
- 典型案例：粉色背景 + 黑色有机线条 + 白色几何形状
- 实现：SVG shapes，3-5 个元素，构图不对称

### 构图原则
- **不对称**：艺术作品偏向画面一侧（通常右侧或右上），给文字留空间
- **不竞争**：艺术作品不抢夺文字的视觉注意力，是背景的延伸
- **与 Style 一致**：颜色取自 Style 的色系，不引入新颜色
- **密度克制**：元素少（3-6个），留白多，不要堆满

### 与 Style 的对应关系
- analyst-mist（consulting-firm）：扇形曲线，细线，蓝色系
- analyst-light（investment-bank）：简洁几何，横线，深海军蓝
- analyst-dark（private-equity）：稀疏，高对比，奢华感
- 暖陶土：有机曲线，暖橙/米色
- 冰川：冰晶几何，冷蓝/白
- 洞穴：暗色背景，发光点/弧
`.trim();

    return {
      promptAppendix,
      suggestedLayouts: ['cover', 'section-break'],
    };
  },
};

export default algorithmicArtSkill;
