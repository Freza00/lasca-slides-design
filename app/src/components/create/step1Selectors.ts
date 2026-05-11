// ============================================================================
// Step 1 Selector SSOT — shared by TopicInput + FullContentInput
// ============================================================================
// These are the templated, universal axes every deck asks: audience/purpose,
// length, language, narrative, evidence, density. They render as pill rows in
// both input modes. The LLM-generated Q&A (Step 2, /api/ai/clarify) MUST NOT
// ask about these axes — see feedback_clarifier_step_division in user memory.
// ============================================================================

export interface SelectorDef {
  id: string;
  labelKey: string;
  options: { labelKey: string; value: string; tooltipKey: string }[];
  default: string;
}

export const STEP1_SELECTOR_DEFS: SelectorDef[] = [
  {
    id: 'purpose',
    labelKey: 'selector.purpose',
    options: [
      { labelKey: 'selector.purpose.research', value: 'research', tooltipKey: 'selector.purpose.research_tip' },
      { labelKey: 'selector.purpose.report', value: 'report-up', tooltipKey: 'selector.purpose.report_tip' },
      { labelKey: 'selector.purpose.persuade', value: 'persuade', tooltipKey: 'selector.purpose.persuade_tip' },
      { labelKey: 'selector.purpose.sales', value: 'sales', tooltipKey: 'selector.purpose.sales_tip' },
      { labelKey: 'selector.purpose.academic', value: 'academic', tooltipKey: 'selector.purpose.academic_tip' },
      { labelKey: 'selector.purpose.share', value: 'share', tooltipKey: 'selector.purpose.share_tip' },
    ],
    default: 'research',
  },
  {
    id: 'length',
    labelKey: 'selector.length',
    options: [
      { labelKey: 'selector.length.short', value: '3', tooltipKey: 'selector.length.short_tip' },
      { labelKey: 'selector.length.medium', value: '6', tooltipKey: 'selector.length.medium_tip' },
      { labelKey: 'selector.length.long', value: '10', tooltipKey: 'selector.length.long_tip' },
    ],
    default: '10',
  },
  {
    id: 'language',
    labelKey: 'selector.language.label',
    options: [
      { labelKey: 'selector.language.zh', value: 'zh', tooltipKey: 'selector.language.zh_tip' },
      { labelKey: 'selector.language.en', value: 'en', tooltipKey: 'selector.language.en_tip' },
      { labelKey: 'selector.language.bilingual', value: 'bilingual', tooltipKey: 'selector.language.bilingual_tip' },
    ],
    default: 'en',
  },
  {
    id: 'narrative',
    labelKey: 'selector.narrative',
    options: [
      { labelKey: 'selector.narrative.conclusion_first', value: 'conclusion-first', tooltipKey: 'selector.narrative.conclusion_first_tip' },
      { labelKey: 'selector.narrative.progressive', value: 'progressive', tooltipKey: 'selector.narrative.progressive_tip' },
      { labelKey: 'selector.narrative.story', value: 'story', tooltipKey: 'selector.narrative.story_tip' },
      { labelKey: 'selector.narrative.comparison', value: 'comparison', tooltipKey: 'selector.narrative.comparison_tip' },
    ],
    default: 'conclusion-first',
  },
  {
    id: 'evidence',
    labelKey: 'selector.evidence',
    options: [
      { labelKey: 'selector.evidence.opinion', value: 'opinion', tooltipKey: 'selector.evidence.opinion_tip' },
      { labelKey: 'selector.evidence.key_data', value: 'key-data', tooltipKey: 'selector.evidence.key_data_tip' },
      { labelKey: 'selector.evidence.data_heavy', value: 'data-heavy', tooltipKey: 'selector.evidence.data_heavy_tip' },
      { labelKey: 'selector.evidence.case_study', value: 'case-study', tooltipKey: 'selector.evidence.case_study_tip' },
    ],
    default: 'data-heavy',
  },
  {
    id: 'density',
    labelKey: 'selector.density',
    options: [
      { labelKey: 'selector.density.minimal', value: 'minimal', tooltipKey: 'selector.density.minimal_tip' },
      { labelKey: 'selector.density.moderate', value: 'moderate', tooltipKey: 'selector.density.moderate_tip' },
      { labelKey: 'selector.density.detailed', value: 'detailed', tooltipKey: 'selector.density.detailed_tip' },
    ],
    default: 'detailed',
  },
];

/** Purpose → (length, density) defaults. Applied on purpose change ONLY for
 *  fields the user hasn't manually touched. */
export const PURPOSE_DEFAULTS: Record<string, { length: string; density: string }> = {
  research:    { length: '10', density: 'detailed' },
  academic:    { length: '10', density: 'detailed' },
  persuade:    { length: '6',  density: 'moderate' },
  sales:       { length: '6',  density: 'moderate' },
  'report-up': { length: '6',  density: 'moderate' },
  share:       { length: '3',  density: 'minimal' },
};

/** PURPOSE_DEFAULTS.length uses the topic-mode scale (3 / 6 / 10 pages).
 *  FullContentInput has its own discrete length picker tuned for long-form
 *  pastes — auto / short(8) / medium(16) / long(24). This map bridges the two
 *  so the purpose cascade in FullContentInput stays in sync with TopicInput
 *  without duplicating the shape of PURPOSE_DEFAULTS. Unmapped lengths
 *  intentionally fall through to 'auto' in the consumer. */
export const TOPIC_LENGTH_TO_FULL_CONTENT: Record<string, 'short' | 'medium' | 'long'> = {
  '3':  'short',
  '6':  'medium',
  '10': 'long',
};

export type DetectedLang = 'zh' | 'en' | 'bilingual';

/** Infer answers.language from a user's draft. Returns 'zh' / 'en' / 'bilingual'.
 *
 *  Counts CJK ideographs (\u3400–\u9fff) + CJK punctuation (\u3000–\u303f)
 *  as Chinese codepoints, and Latin alpha as English. Digits, spaces, URLs,
 *  and arabic punctuation are not counted — they're script-neutral.
 *
 *  - Under 8 total alpha codepoints: too short to judge reliably → fall back
 *    to the UI locale. Avoids snap-decisions on one-word topics.
 *  - Locale bias (zh): if the user's UI locale is zh AND Latin share is low
 *    (<60%), prefer 'zh' over 'bilingual'. This catches the common case of a
 *    Chinese deck that cites English brand names / unit labels ("Zillow / CPI
 *    / Q1 2026") and keeps the bilingual pill hidden.
 *  - Otherwise: CJK share in [0.25, 0.75] → bilingual; ≥0.75 → zh; ≤0.25 → en.
 */
export function detectInputLanguage(text: string, locale: 'zh' | 'en'): DetectedLang {
  let cjk = 0;
  let latin = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0x3000 && code <= 0x303f)) {
      cjk++;
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      latin++;
    }
  }

  const total = cjk + latin;
  if (total < 8) return locale;

  const cjkShare = cjk / total;
  const latinShare = latin / total;

  if (locale === 'zh' && cjk > 0 && latinShare < 0.6) return 'zh';

  if (cjkShare >= 0.75) return 'zh';
  if (cjkShare <= 0.25) return 'en';
  return 'bilingual';
}
