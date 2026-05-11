// ============================================================================
// Lasca AI Harness — Skills Registry
// ============================================================================
// 轻量级 skill 注册和调用机制。Phase 0 首次真实接入 orchestrator。
// ============================================================================

import type { Skill, SkillInput, SkillOutput, SkillContext } from './types';
import type { Layout } from '../../../types';
import type { StylePreset, WorkflowType } from '../types';
import type { GenerateFormat } from '../../prompts';

/**
 * Skill 注册表（懒加载）
 */
const SKILL_REGISTRY: Record<string, () => Promise<{ default: Skill }>> = {
  'frontend-design': () => import('./frontend-design/skill'),
  'theme-factory': () => import('./theme-factory/skill'),
  'canvas-design': () => import('./canvas-design/skill'),
  'brand-guidelines': () => import('./brand-guidelines/skill'),
  'report-structure': () => import('./report-structure/skill'),
  'pptx': () => import('./pptx/skill'),
  'algorithmic-art': () => import('./algorithmic-art/skill'),
  'pdf': () => import('./pdf/skill'),
  'docx': () => import('./docx/skill'),
};

export interface SelectSkillsArgs {
  intent: string;
  workflowType: WorkflowType;
  preset?: StylePreset;
  /** Layout hints if known; deck-level dispatch may not have them yet. */
  layouts?: Layout[];
  /** Where the call is made from — deck-level vs per-slide — gates which skills run. */
  scope?: 'deck' | 'slide';
  /** Output format (slide / report). Phase 3 gates report-structure skill
   *  on `format === 'report' && preset.format !== 'report'`. */
  format?: GenerateFormat;
}

/**
 * 选择要激活的 skills。Phase 0 只在 deck 级别真实激活 brand-guidelines（当 preset 有
 * knowledgeRef 时），其它 skill 要么当前与 prompts.ts 重复、要么是 per-slide 级别
 * 的决策。Phase 1 将迁移 frontend-design 的 DESIGN_PRINCIPLES_PROMPT 进来。
 */
export function selectSkills(args: SelectSkillsArgs): string[] {
  const { preset, layouts, scope = 'deck', format } = args;
  const skills: string[] = [];

  // theme-factory: always dispatched so the pipe is always warm.
  // Current invoke() body is a no-op (preset.promptAppendix is injected directly
  // by orchestrator). Phase 4 will populate it with token-layer output.
  skills.push('theme-factory');

  // brand-guidelines: only when preset references a vendored design system.
  // Returns concise promptGuide string from knowledge/design-systems/<id>.json.
  if (preset?.knowledgeRef) {
    skills.push('brand-guidelines');
  }

  // canvas-design: visual-heavy layout specialist (cover/quote/section-break).
  // Only meaningful when we know the layout — Phase 1 will invoke it per-slide.
  if (scope === 'slide' && layouts?.some(l => ['cover', 'quote', 'section-break'].includes(l))) {
    skills.push('canvas-design');
  }

  // report-structure (Phase 3): fires for report generation with slide-format
  // presets carried into the report channel (legacy fallback). Channel-native
  // report presets (preset.format === 'report', i.e. bilingual-report) own
  // their visual system via a 870-line promptAppendix — we defer to it.
  if (format === 'report' && preset?.format !== 'report') {
    skills.push('report-structure');
  }

  // frontend-design: currently duplicates prompts.ts::slideSystemPrompt
  // (DESIGN_PRINCIPLES_PROMPT is hardcoded there). Not dispatched to avoid
  // double injection. Phase 1 migrates the constant into this skill and
  // removes the prompts.ts duplicate.

  return skills;
}

/**
 * 调用一个 skill
 */
export async function invokeSkill(
  name: string,
  input: SkillInput,
  ctx: SkillContext
): Promise<SkillOutput> {
  const loader = SKILL_REGISTRY[name];
  if (!loader) {
    throw new Error(`Skill not found: ${name}`);
  }

  const module = await loader();
  return module.default.invoke(input, ctx);
}

/**
 * 批量调用 skills 并合并输出
 */
export async function invokeSkills(
  skillNames: string[],
  input: SkillInput,
  ctx: SkillContext
): Promise<SkillOutput & { perSkill: Array<{ name: string; chars: number }> }> {
  const outputs = await Promise.all(
    skillNames.map(async name => ({ name, out: await invokeSkill(name, input, ctx) })),
  );

  return {
    promptAppendix: outputs.map(o => o.out.promptAppendix).filter(Boolean).join('\n\n'),
    suggestedLayouts: outputs.flatMap(o => o.out.suggestedLayouts || []),
    theme: outputs.find(o => o.out.theme)?.out.theme,
    perSkill: outputs.map(o => ({ name: o.name, chars: o.out.promptAppendix?.length ?? 0 })),
  };
}
