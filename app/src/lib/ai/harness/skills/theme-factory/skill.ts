// ============================================================================
// Theme Factory Skill
// ============================================================================
// 根据 preset 生成 theme 相关的约束。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';

const themeFactorySkill: Skill = {
  name: 'theme-factory',
  description: 'Theme and color palette constraints from style preset',

  async invoke(input: SkillInput, ctx: SkillContext): Promise<SkillOutput> {
    const { preset } = input;

    if (!preset) {
      return { promptAppendix: '' };
    }

    // preset.promptAppendix 已经包含了完整的 theme 约束
    // 这里只需要返回它（已经在 orchestrator 层注入，这个 skill 作为显式标记）
    return {
      promptAppendix: '', // preset.promptAppendix 由 orchestrator 直接注入
      theme: preset.theme,
    };
  },
};

export default themeFactorySkill;
