// ============================================================================
// Lasca AI Harness — Skills Library Types
// ============================================================================
// Skills 是可组合的 AI 能力模块，每个 skill 负责一个特定领域的设计决策。
// ============================================================================

import type { Layout } from '../../../types';
import type { MdContext, StylePreset } from '../types';
import type { GenerateFormat } from '../../prompts';

/**
 * Skill 输入
 */
export interface SkillInput {
  /** 用户意图（从 mdContext 提取） */
  intent: string;
  /** 结构化内容上下文 */
  context: MdContext;
  /** 当前 style preset（如果有） */
  preset?: StylePreset;
  /** 工作流类型 */
  workflowType?: string;
  /** 输出格式（slide / report）— Phase 3 加入以支持 report-structure skill */
  format?: GenerateFormat;
}

/**
 * Skill 输出
 */
export interface SkillOutput {
  /** 追加到 system prompt 的约束文本 */
  promptAppendix: string;
  /** 建议的 layout 列表（可选） */
  suggestedLayouts?: Layout[];
  /** 建议的 theme（可选） */
  theme?: string;
}

/**
 * Skill 上下文（运行时环境）
 */
export interface SkillContext {
  /** 当前语言 */
  locale: 'zh' | 'en';
  /** 是否为 premium 用户 */
  isPremium?: boolean;
}

/**
 * Skill 接口
 */
export interface Skill {
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** 执行 skill */
  invoke(input: SkillInput, ctx: SkillContext): Promise<SkillOutput>;
}
