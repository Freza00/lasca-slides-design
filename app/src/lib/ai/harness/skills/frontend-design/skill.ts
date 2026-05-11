// ============================================================================
// Frontend Design Skill
// ============================================================================
// 包装现有的 designPrinciples.ts，作为全局审美底座。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';
import { DESIGN_PRINCIPLES_PROMPT } from '../../designPrinciples';

const frontendDesignSkill: Skill = {
  name: 'frontend-design',
  description: 'Global design principles from Claude Code frontend-design skill',

  async invoke(input: SkillInput, ctx: SkillContext): Promise<SkillOutput> {
    // 直接返回全局审美底座
    return {
      promptAppendix: DESIGN_PRINCIPLES_PROMPT,
    };
  },
};

export default frontendDesignSkill;
