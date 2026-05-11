'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { ClarifierAnswers } from '@/lib/ai/harness/types';
import { useT, useLocale } from '@/lib/i18n';
import { addToast } from '@/lib/toast';
import { hasFileDragData, isTextDocumentFile, readTextDocumentFile } from '@/lib/fileDrop';
import { STEP1_SELECTOR_DEFS as SELECTOR_DEFS, PURPOSE_DEFAULTS, detectInputLanguage, type DetectedLang } from './step1Selectors';

interface TopicInputProps {
  format: 'slide' | 'report';
  onSubmit: (
    rawInput: string,
    answers: ClarifierAnswers,
    rawFormState: {
      answers: ClarifierAnswers;
      customMode: Record<string, boolean>;
      customValues: Record<string, string>;
      extraNote: string;
      touched: string[];
    },
  ) => void;
  disabled?: boolean;
  initialValue?: string;
  initialAnswers?: ClarifierAnswers;
  initialCustomMode?: Record<string, boolean>;
  initialCustomValues?: Record<string, string>;
  initialExtraNote?: string;
  initialTouched?: string[];
}

export function TopicInput({
  format,
  onSubmit,
  disabled,
  initialValue,
  initialAnswers,
  initialCustomMode,
  initialCustomValues,
  initialExtraNote,
  initialTouched,
}: TopicInputProps) {
  const t = useT();
  const locale = useLocale();
  const [value, setValue] = useState(initialValue ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Two-stage reveal: 'write' hides the pill rows / extra-note so the page
  // feels approachable on first open; 'customize' reveals them after the user
  // clicks Next. Pre-populated state (initialAnswers etc.) means the user is
  // coming back from a later step — skip straight to 'customize'.
  const [stage, setStage] = useState<'write' | 'customize'>(
    initialAnswers || initialCustomMode || initialCustomValues || initialExtraNote ? 'customize' : 'write',
  );
  // Detection result snapshotted on Next. `null` before Next is clicked.
  // Used to decide whether to render the language pill row and to seed
  // answers.language.
  const [detectedLang, setDetectedLang] = useState<DetectedLang | null>(
    initialAnswers ? (initialAnswers.language as DetectedLang | undefined) ?? null : null,
  );

  const slideExamples = useMemo(() => [
    t('example.slide.1'), t('example.slide.2'), t('example.slide.3'), t('example.slide.4'),
  ], [t]);
  const reportExamples = useMemo(() => [
    t('example.report.1'), t('example.report.2'), t('example.report.3'), t('example.report.4'),
  ], [t]);

  // Initialize selector answers with defaults (or from parent-preserved state on re-mount)
  const [answers, setAnswers] = useState<ClarifierAnswers>(() => {
    if (initialAnswers) return { ...initialAnswers };
    const init: ClarifierAnswers = {};
    for (const s of SELECTOR_DEFS) {
      init[s.id] = s.default;
    }
    return init;
  });
  // Track which rows are in "custom input" mode
  const [customMode, setCustomMode] = useState<Record<string, boolean>>(() => ({ ...(initialCustomMode ?? {}) }));
  const [customValues, setCustomValues] = useState<Record<string, string>>(() => ({ ...(initialCustomValues ?? {}) }));
  // Free-form extra instructions
  const [extraNote, setExtraNote] = useState(initialExtraNote ?? '');
  // Tooltip hover state: "purpose:report-up"
  const [hoveredOpt, setHoveredOpt] = useState<string | null>(null);
  // Track fields the user manually changed — purpose cascade must not clobber them.
  // Initialize ONLY from `initialTouched` (explicit clicks from prior visit), NOT
  // from `Object.keys(initialAnswers)` — the latter wrongly counts cascaded
  // defaults as "touched", blocking subsequent purpose changes from updating
  // length/density on revisit.
  const touchedRef = useRef<Set<string>>(new Set(initialTouched ?? []));
  const prevPurposeRef = useRef<string | undefined>(
    initialAnswers ? String(initialAnswers.purpose ?? '') || undefined : undefined,
  );

  // Cascade: when purpose changes, fill length+density defaults UNLESS the user
  // has manually touched those fields. Manual touches are recorded on click.
  useEffect(() => {
    const purpose = String(answers.purpose ?? '');
    if (!purpose || purpose === prevPurposeRef.current) return;
    prevPurposeRef.current = purpose;
    const defaults = PURPOSE_DEFAULTS[purpose];
    if (!defaults) return;
    setAnswers(prev => {
      const next = { ...prev };
      if (!touchedRef.current.has('length') && !customMode['length']) {
        next.length = defaults.length;
      }
      if (!touchedRef.current.has('density') && !customMode['density']) {
        next.density = defaults.density;
      }
      return next;
    });
  }, [answers.purpose, customMode]);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 200);
  }, []);

  const examples = format === 'slide' ? slideExamples : reportExamples;

  const placeholder = format === 'slide'
    ? t('create.placeholder.slide')
    : t('create.placeholder.report');

  // Stage transition: snapshot the detected language and seed answers.language
  // so downstream selectorRules receives a concrete value. We intentionally do
  // NOT re-detect on textarea edits in stage 2 — the pill row appearing or
  // disappearing mid-edit is jarring. Users can scroll up and retype to
  // re-trigger detection if they truly need to.
  const handleNext = () => {
    if (!value.trim() || disabled) return;
    const lang = detectInputLanguage(value, locale === 'zh' ? 'zh' : 'en');
    setDetectedLang(lang);
    setAnswers(prev => ({ ...prev, language: lang }));
    setStage('customize');
  };

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      // Snapshot raw UI state before transform — CreateFlow uses this to
      // rehydrate the form if the user navigates back to this step.
      const rawFormState = {
        answers: { ...answers },
        customMode: { ...customMode },
        customValues: { ...customValues },
        extraNote,
        touched: Array.from(touchedRef.current),
      };
      // Merge custom values into answers
      const finalAnswers = { ...answers };
      for (const [id, val] of Object.entries(customValues)) {
        if (val.trim()) finalAnswers[id] = val.trim();
      }
      if (extraNote.trim()) finalAnswers['extra-note'] = extraNote.trim();
      // Normalize length to a number so CreateFlow's `typeof === 'number'` gate
      // accepts it. Density is now a separate first-class field; no string split.
      const lengthVal = String(finalAnswers.length || '');
      if (lengthVal) {
        const parsed = parseInt(lengthVal, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          finalAnswers.length = parsed;
        }
      }
      // Map purpose → audience for downstream pipeline compatibility
      const purposeMap: Record<string, string> = {
        'report-up': 'boss', persuade: 'boss', share: 'all-hands',
        research: 'client', sales: 'client', academic: 'academic',
      };
      if (finalAnswers.purpose && !finalAnswers.audience) {
        finalAnswers.audience = purposeMap[String(finalAnswers.purpose)] || 'boss';
      }
      // Map narrative → key-takeaway
      const narrativeMap: Record<string, string> = {
        'conclusion-first': 'logic', progressive: 'logic',
        story: 'story', comparison: 'logic',
      };
      if (finalAnswers.narrative && !finalAnswers['key-takeaway']) {
        finalAnswers['key-takeaway'] = narrativeMap[String(finalAnswers.narrative)] || 'logic';
      }
      // Map evidence → data-emphasis
      const evidenceMap: Record<string, string> = {
        opinion: 'none', 'key-data': 'some',
        'data-heavy': 'heavy', 'case-study': 'some',
      };
      if (finalAnswers.evidence && !finalAnswers['data-emphasis']) {
        finalAnswers['data-emphasis'] = evidenceMap[String(finalAnswers.evidence)] || 'none';
      }
      onSubmit(value.trim(), finalAnswers, rawFormState);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && value.trim()) {
      handleSubmit();
    }
  };

  const handleFileDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragData(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragData(e.dataTransfer)) return;
    e.preventDefault();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!isTextDocumentFile(file)) {
      addToast('error', t('drop.text_only'));
      return;
    }

    try {
      const text = await readTextDocumentFile(file);
      setValue(prev => prev.trim() ? `${prev}\n\n${text}` : text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      addToast('error', t('drop.read_failed', { msg: (err as Error).message }));
    }
  };

  const charCount = value.length;

  return (
    <div className="create-container" style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
      <h1 style={{
        fontSize: 28, fontWeight: 700, color: '#141413',
        textAlign: 'center', marginBottom: 8, fontFamily: 'inherit',
      }}>
        {format === 'slide' ? t('create.title.slide') : t('create.title.report')}
      </h1>
      <p style={{
        fontSize: 14, color: '#b0aea5', textAlign: 'center',
        marginBottom: 24, lineHeight: 1.6,
      }}>
        {t('create.subtitle')}
      </p>

      {/* Example chips */}
      {!value && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
          marginBottom: 20, animation: 'qaFadeIn 0.3s ease-out',
        }}>
          {examples.map(ex => (
            <button
              key={ex}
              onClick={() => { setValue(ex); textareaRef.current?.focus(); }}
              style={{
                padding: '6px 14px', borderRadius: 20, border: '1px solid #e8e6dc',
                background: '#fff', color: '#6b6a65', fontSize: 13, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#d97757'; e.currentTarget.style.color = '#d97757'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e6dc'; e.currentTarget.style.color = '#6b6a65'; }}
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <div style={{
        background: '#faf9f5', borderRadius: 16, border: '1px solid #e8e6dc',
        padding: 20, marginBottom: 12,
      }}
      data-lasca-file-drop-target="1"
      onDragOver={handleFileDragOver}
      onDrop={handleFileDrop}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={8}
          style={{
            width: '100%', border: 'none', outline: 'none', resize: 'vertical',
            background: 'transparent', fontSize: 15, lineHeight: 1.7,
            color: '#141413', fontFamily: 'inherit',
            minHeight: 160,
          }}
        />

        {/* Inline selectors — compact pill rows.  Only shown in the
            'customize' stage so the initial view stays approachable.  The
            language row is further gated: we auto-detect from the textarea
            and only expose the pill when the content is genuinely bilingual. */}
        {stage === 'customize' && (
        <div style={{
          borderTop: '1px solid #e8e6dc', paddingTop: 12, marginTop: 8,
          display: 'flex', flexDirection: 'column', gap: 8,
          animation: 'qaFadeIn 0.3s ease-out',
        }}>
          <p style={{
            fontSize: 11, color: '#b0aea5', margin: '0 0 2px 0',
            paddingLeft: 44,
          }}>
            {t('create.customize_hint')}
          </p>
          {SELECTOR_DEFS.filter(sel => {
            if (sel.id === 'language' && detectedLang !== 'bilingual') return false;
            // Reports let content + pagination decide page count — asking
            // the user would mislead since the fast-path paginator ignores it.
            if (sel.id === 'length' && format === 'report') return false;
            return true;
          }).map(sel => (
            <div key={sel.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, color: '#b0aea5', fontWeight: 600,
                width: 36, flexShrink: 0, textAlign: 'right',
              }}>
                {t(sel.labelKey)}
              </span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', position: 'relative' }}>
                {sel.options.map(opt => {
                  const isSelected = !customMode[sel.id] && answers[sel.id] === opt.value;
                  const optKey = `${sel.id}:${opt.value}`;
                  const showTooltip = hoveredOpt === optKey;
                  return (
                    <span key={String(opt.value)} style={{ position: 'relative' }}>
                      <button
                        onClick={() => {
                          touchedRef.current.add(sel.id);
                          setCustomMode(prev => ({ ...prev, [sel.id]: false }));
                          setAnswers(prev => ({ ...prev, [sel.id]: opt.value }));
                        }}
                        onMouseEnter={() => setHoveredOpt(optKey)}
                        onMouseLeave={() => setHoveredOpt(null)}
                        style={{
                          padding: '3px 10px', borderRadius: 8,
                          border: isSelected ? '1.5px solid #d97757' : '1px solid #e8e6dc',
                          background: isSelected ? '#fdf0e9' : '#fff',
                          color: isSelected ? '#d97757' : '#6b6a65',
                          fontSize: 12, fontWeight: isSelected ? 600 : 400,
                          cursor: 'pointer', fontFamily: 'inherit',
                          transition: 'all 0.12s',
                        }}
                      >
                        {t(opt.labelKey)}
                        {sel.id === 'length' && (() => {
                          const n = parseInt(opt.value, 10);
                          return <span style={{ opacity: 0.6, fontWeight: 400 }}>{` · ${n}${locale === 'zh' ? '页' : (n === 1 ? ' page' : ' pages')}`}</span>;
                        })()}
                      </button>
                      {showTooltip && (
                        <div style={{
                          position: 'absolute', bottom: '100%', left: '50%',
                          transform: 'translateX(-50%)', marginBottom: 6,
                          padding: '6px 10px', borderRadius: 8,
                          background: '#1a1a2e', color: '#fff',
                          fontSize: 11, lineHeight: 1.4, whiteSpace: 'nowrap',
                          pointerEvents: 'none', zIndex: 20,
                          animation: 'qaFadeIn 0.15s ease-out',
                        }}>
                          {t(opt.tooltipKey)}
                        </div>
                      )}
                    </span>
                  );
                })}
                {/* Custom input toggle / field */}
                {customMode[sel.id] ? (
                  <input
                    autoFocus
                    value={customValues[sel.id] || ''}
                    onChange={e => setCustomValues(prev => ({ ...prev, [sel.id]: e.target.value }))}
                    onBlur={() => {
                      if (!customValues[sel.id]?.trim()) {
                        setCustomMode(prev => ({ ...prev, [sel.id]: false }));
                      }
                    }}
                    placeholder={t('create.custom_placeholder')}
                    style={{
                      padding: '3px 10px', borderRadius: 8,
                      border: '1.5px solid #d97757', background: '#fff',
                      color: '#141413', fontSize: 12, fontFamily: 'inherit',
                      outline: 'none', width: 100,
                    }}
                  />
                ) : (
                  <button
                    onClick={() => {
                      touchedRef.current.add(sel.id);
                      setCustomMode(prev => ({ ...prev, [sel.id]: true }));
                    }}
                    style={{
                      padding: '3px 10px', borderRadius: 8,
                      border: '1px dashed #e8e6dc', background: 'transparent',
                      color: '#b0aea5', fontSize: 12, cursor: 'pointer',
                      fontFamily: 'inherit', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#d97757'; e.currentTarget.style.color = '#d97757'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8e6dc'; e.currentTarget.style.color = '#b0aea5'; }}
                  >
                    {t('create.custom')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {/* Free-form extra row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 11, color: '#b0aea5', fontWeight: 600,
              width: 36, flexShrink: 0, textAlign: 'right',
            }}>
              {t('create.other')}
            </span>
            <input
              value={extraNote}
              onChange={e => setExtraNote(e.target.value)}
              placeholder={t('create.extra_requirements')}
              style={{
                flex: 1, padding: '3px 10px', borderRadius: 8,
                border: '1px solid #e8e6dc', background: '#fff',
                color: '#141413', fontSize: 12, fontFamily: 'inherit',
                outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
            />
          </div>
        </div>
        )}
      </div>

      {/* Bottom row: tips + char count + button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 12, color: charCount > 0 ? '#6b6a65' : '#b0aea5',
            transition: 'color 0.2s',
          }}>
            {charCount > 0 ? t('create.char_count', { n: charCount }) : t('create.markdown_support')}
          </span>
          {charCount > 300 && (
            <span style={{
              fontSize: 11, color: '#788c5d', background: '#f0f5eb',
              padding: '2px 8px', borderRadius: 6,
            }}>
              {t('create.long_text_hint')}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: '#b0aea5' }}>
            {t('create.submit_shortcut')}
          </span>
          <button
            onClick={stage === 'write' ? handleNext : handleSubmit}
            disabled={!value.trim() || disabled}
            style={{
              padding: '10px 28px', borderRadius: 12, border: 'none',
              background: value.trim() && !disabled ? '#1a1a2e' : '#e8e6dc',
              color: value.trim() && !disabled ? '#fff' : '#b0aea5',
              fontSize: 15, fontWeight: 600, cursor: value.trim() && !disabled ? 'pointer' : 'default',
              fontFamily: 'inherit', transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (value.trim() && !disabled) (e.currentTarget.style.background = '#2a2a4e');
            }}
            onMouseLeave={(e) => {
              if (value.trim() && !disabled) (e.currentTarget.style.background = '#1a1a2e');
            }}
          >
            {stage === 'write' ? t('create.next') : t('create.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
