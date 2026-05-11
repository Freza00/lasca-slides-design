// ============================================================================
// Lasca AI Harness — Barrel export
// ============================================================================
// 一站式入口。外部只需要 `import { runOrchestrator, validateDeck, ... } from '@/lib/ai/harness'`。
// ============================================================================

export { runOrchestrator } from './orchestrator';
export { validateDeck, validateSlide, formatViolationsForPrompt } from './goldenRules';
export { runClarifier, assessComplexity, extractFromAnswers } from './clarifier';
export { buildMdContext } from './mdContext';
export {
  STYLE_PRESETS,
  DEFAULT_PRESET_ID,
  getPreset,
  listPresetOptions,
} from './stylePresets';

export type {
  WorkflowType,
  ClarifierQuestion,
  ClarifierOption,
  ClarifierAnswers,
  ClarifierDecision,
  Complexity,
  StylePreset,
  StylePresetId,
  RuleSeverity,
  RuleViolation,
  RuleReport,
  HarnessEvent,
  HarnessPlan,
  OrchestratorInput,
  MdContext,
  MdContextPage,
  MdContextChange,
  MdContextChangeKind,
  MdContextDiff,
  UserDemand,
  DeckFrontmatter,
  ChangeLevel,
} from './types';
