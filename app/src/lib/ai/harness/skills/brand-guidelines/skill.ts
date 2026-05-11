// ============================================================================
// Brand Guidelines Skill
// ============================================================================
// 品牌识别提取和应用。当 preset 有 knowledgeRef 时，加载对应的设计系统。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from '../types';
import { getPromptGuide } from '../../knowledge';

const brandGuidelinesSkill: Skill = {
  name: 'brand-guidelines',
  description: 'Brand identity extraction and application',

  async invoke(input: SkillInput, ctx: SkillContext): Promise<SkillOutput> {
    const { preset } = input;

    // 如果 preset 有 knowledgeRef，从 knowledge base 加载 promptGuide
    if (preset && 'knowledgeRef' in preset && preset.knowledgeRef) {
      const promptGuide = await getPromptGuide(preset.knowledgeRef as string);
      if (promptGuide) {
        return { promptAppendix: promptGuide };
      }
    }

    return { promptAppendix: '' };
  },
};

export default brandGuidelinesSkill;
