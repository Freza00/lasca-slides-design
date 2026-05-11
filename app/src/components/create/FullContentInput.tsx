'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useT, useLocale } from '@/lib/i18n';
import { hasFileDragData, isTextDocumentFile, isWordDocumentFile, readTextDocumentFile } from '@/lib/fileDrop';
import { addToast } from '@/lib/toast';
import { looksLikeOfficeHtml, wordToMarkdown, WordImportError } from '@/lib/wordImport';
import type { ClarifierAnswers } from '@/lib/ai/harness/types';
import {
  STEP1_SELECTOR_DEFS,
  PURPOSE_DEFAULTS,
  TOPIC_LENGTH_TO_FULL_CONTENT,
  detectInputLanguage,
  type DetectedLang,
} from './step1Selectors';

interface FullContentInputProps {
  format: 'slide' | 'report';
  /** Emits the pasted text + pre-selected Step 1 answers (purpose / language /
   *  narrative / evidence / density + optional length override from the
   *  full-content length picker). */
  onSubmit: (content: string, answers: ClarifierAnswers) => void;
  /** Re-hydrate the textarea after the user goes back from a later step
   *  (mode-pick / content-qa). Empty string on first mount. */
  initialValue?: string;
  disabled?: boolean;
}

// Full-content's own length picker uses a different scale than TopicInput
// (users pasting a full draft usually want coverage, not brevity), so we keep
// its values (auto / 8 / 16 / 24) separate from the step1 length pill (3/6/10)
// and skip the step1 length row here — this one replaces it.
const STEP1_FOR_FULL_CONTENT = STEP1_SELECTOR_DEFS.filter(s => s.id !== 'length');

type LengthChoice = 'auto' | 'short' | 'medium' | 'long' | 'custom';

// Maps the preset pills to concrete `pageCount` override values. `auto` omits
// the override so the backend inferSlideStructure heuristic runs; `custom` is
// user-typed and handled separately in handleSubmit. Numbers are tuned for
// full-content mode (long-form pastes) — higher than TopicInput's 3/6/10.
const LENGTH_PAGE_COUNTS: Record<Exclude<LengthChoice, 'auto' | 'custom'>, number> = {
  short: 8,
  medium: 16,
  long: 24,
};

const LENGTH_LABELS: Record<LengthChoice, { zh: string; en: string }> = {
  auto:   { zh: '按内容推荐', en: 'Auto' },
  short:  { zh: '精简 ~8 页',  en: 'Concise ~8' },
  medium: { zh: '标准 ~16 页', en: 'Standard ~16' },
  long:   { zh: '详尽 ~24 页', en: 'In-depth ~24' },
  custom: { zh: '自定义',      en: 'Custom' },
};

const LENGTH_ORDER: LengthChoice[] = ['auto', 'short', 'medium', 'long', 'custom'];

export function FullContentInput({ format, onSubmit, initialValue, disabled }: FullContentInputProps) {
  const t = useT();
  const locale = useLocale();
  const [value, setValue] = useState(initialValue ?? '');
  const [dragOver, setDragOver] = useState(false);
  const [lengthChoice, setLengthChoice] = useState<LengthChoice>('auto');
  // Custom page count (string for the input field; parsed on submit).
  const [customLength, setCustomLength] = useState<string>('');
  // Two-stage reveal — textarea alone on first open, pill rows + length picker
  // revealed after the user clicks Next. Matches TopicInput's UX.
  const [stage, setStage] = useState<'write' | 'customize'>('write');
  // Language detection is snapshotted on Next; pill row only surfaces when the
  // paste is genuinely bilingual. `null` means not yet detected.
  const [detectedLang, setDetectedLang] = useState<DetectedLang | null>(null);
  // Word import is async (mammoth dynamic import + parse). While converting
  // we show a translucent overlay and refuse new paste/drop input.
  const [importing, setImporting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 1 answers — each axis starts at its own default. Locale seeds language.
  const initialStep1 = useMemo<Record<string, string>>(() => {
    const ans: Record<string, string> = {};
    for (const s of STEP1_FOR_FULL_CONTENT) {
      ans[s.id] = s.default;
    }
    // Override language default from UI locale so 英文用户 doesn't have to flip it.
    if (locale === 'en') ans.language = 'en';
    return ans;
  }, [locale]);
  const [step1, setStep1] = useState<Record<string, string>>(initialStep1);

  // Track manually-touched axes so the purpose cascade doesn't clobber them.
  const touchedRef = useRef<Set<string>>(new Set());
  const prevPurposeRef = useRef<string | undefined>(undefined);

  const updateStep1 = useCallback((id: string, value: string) => {
    touchedRef.current.add(id);
    setStep1(prev => ({ ...prev, [id]: value }));
  }, []);

  // Cascade: when purpose changes, fill density + lengthChoice defaults unless
  // the user already committed to a value. Both axes guard on touchedRef so the
  // cascade can re-fire across successive purpose changes (the initial mount
  // cascade doesn't count as a user touch).
  useEffect(() => {
    const purpose = step1.purpose;
    if (!purpose || purpose === prevPurposeRef.current) return;
    prevPurposeRef.current = purpose;
    const defaults = PURPOSE_DEFAULTS[purpose];
    if (!defaults) return;
    if (!touchedRef.current.has('density')) {
      setStep1(prev => ({ ...prev, density: defaults.density }));
    }
    if (!touchedRef.current.has('length')) {
      const mapped = TOPIC_LENGTH_TO_FULL_CONTENT[defaults.length];
      if (mapped) setLengthChoice(mapped);
    }
  }, [step1.purpose]);

  const handleFileRead = useCallback(async (file: File) => {
    if (isWordDocumentFile(file)) {
      setImporting(true);
      try {
        const { markdown, ignoredImages } = await wordToMarkdown({ kind: 'docx', file });
        setValue(markdown);
        if (ignoredImages > 0) {
          addToast('info', t('create.word.ignored_images', { n: String(ignoredImages) }));
        }
        setTimeout(() => textareaRef.current?.focus(), 100);
      } catch (err) {
        if (err instanceof WordImportError && err.code === 'FILE_TOO_LARGE') {
          addToast('warn', t('create.word.file_too_large'));
        } else {
          addToast('error', t('create.word.parse_failed'));
        }
      } finally {
        setImporting(false);
      }
      return;
    }
    if (!isTextDocumentFile(file)) {
      addToast('warn', t('drop.unsupported_type'));
      return;
    }
    try {
      const text = await readTextDocumentFile(file);
      setValue(text);
      // Focus textarea after file load
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch {
      addToast('error', t('create.error.structure_check'));
    }
  }, [t]);

  // Intercept Word-formatted clipboard HTML and convert to markdown so the
  // existing fast path / generate-from-draft pipeline gets structured input.
  // Plain text / non-Office HTML pastes fall through to the browser default.
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (importing) return;
    const html = e.clipboardData.getData('text/html');
    if (!looksLikeOfficeHtml(html)) return;
    e.preventDefault();
    setImporting(true);
    wordToMarkdown({ kind: 'office-html', html })
      .then(({ markdown, ignoredImages }) => {
        setValue(markdown);
        if (ignoredImages > 0) {
          addToast('info', t('create.word.ignored_images', { n: String(ignoredImages) }));
        }
      })
      .catch(() => addToast('error', t('create.word.parse_failed')))
      .finally(() => setImporting(false));
  }, [importing, t]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (hasFileDragData(e.dataTransfer)) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }, [handleFileRead]);

  // Stage transition: snapshot detected language, seed step1.language, flip
  // into 'customize'. We don't re-detect on textarea edits afterwards — the
  // pill row flicker would be jarring.
  //
  // Reports skip 'customize' entirely: from-context reports treat the paste as
  // final content and the fast path (mdLooksComplete) discards step1 answers
  // anyway — asking purpose/narrative/evidence/density would be noise.
  const handleNext = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    const lang = detectInputLanguage(trimmed, locale === 'zh' ? 'zh' : 'en');
    setDetectedLang(lang);
    setStep1(prev => ({ ...prev, language: lang }));
    if (format === 'report') {
      const answers: ClarifierAnswers = {
        purpose: step1.purpose,
        audience: step1.purpose,
        language: lang,
        narrative: step1.narrative,
        'key-takeaway': step1.narrative,
        evidence: step1.evidence,
        density: step1.density,
      };
      onSubmit(trimmed, answers);
      return;
    }
    setStage('customize');
  }, [value, disabled, locale, format, step1, onSubmit]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    let length: number | undefined;
    if (lengthChoice === 'auto') {
      length = undefined;
    } else if (lengthChoice === 'custom') {
      const parsed = parseInt(customLength, 10);
      length = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    } else {
      length = LENGTH_PAGE_COUNTS[lengthChoice];
    }
    // Map step1 into ClarifierAnswers shape. TopicInput's submit maps
    // `purpose` → `audience` and `narrative` → `key-takeaway` to align with
    // downstream selectorRules / extractFromAnswers — do the same here so
    // full-content and topic paths produce identical answer shapes.
    const answers: ClarifierAnswers = {
      purpose: step1.purpose,
      audience: step1.purpose,
      language: step1.language,
      narrative: step1.narrative,
      'key-takeaway': step1.narrative,
      evidence: step1.evidence,
      density: step1.density,
    };
    if (typeof length === 'number') answers.length = length;
    onSubmit(trimmed, answers);
  }, [value, onSubmit, lengthChoice, customLength, step1]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (stage === 'write') handleNext();
      else handleSubmit();
    }
  }, [stage, handleNext, handleSubmit]);

  const charCount = value.length;

  return (
    <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{
        fontSize: 24, fontWeight: 700, color: '#141413',
        marginBottom: 6, textAlign: 'center',
      }}>
        {format === 'slide' ? t('create.title.full_content_slide') : t('create.title.full_content_report')}
      </h2>
      <p style={{
        fontSize: 13, color: '#b0aea5', textAlign: 'center',
        marginBottom: 28, lineHeight: 1.6,
      }}>
        {format === 'slide' ? t('create.subtitle.full_content_slide') : t('create.subtitle.full_content_report')}
      </p>

      {/* Textarea with drag-and-drop */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          position: 'relative',
          border: dragOver ? '2px dashed #d97757' : '2px solid #e8e6dc',
          borderRadius: 14,
          background: '#fff',
          transition: 'border-color 0.15s',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={format === 'slide' ? t('create.placeholder.full_content_slide') : t('create.placeholder.full_content_report')}
          disabled={disabled || importing}
          autoFocus
          style={{
            width: '100%',
            minHeight: 320,
            padding: '16px 18px',
            fontSize: 14,
            lineHeight: 1.7,
            color: '#141413',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'vertical',
            fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
            boxSizing: 'border-box',
          }}
        />

        {/* Bottom bar: char count + upload button */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 16px', borderTop: '1px solid #f0efeb',
        }}>
          <span style={{ fontSize: 11, color: '#b0aea5' }}>
            {t('create.char_count', { n: String(charCount) })}
          </span>
          <button
            onClick={handleUploadClick}
            disabled={disabled || importing}
            style={{
              fontSize: 12, color: '#d97757', background: 'transparent',
              border: '1px solid #f0d7c4', borderRadius: 8,
              padding: '4px 12px', cursor: importing ? 'default' : 'pointer', fontFamily: 'inherit',
              opacity: importing ? 0.5 : 1,
            }}
          >
            {t('create.upload_md')}
          </button>
        </div>

        {/* Word-import overlay — covers the textarea while mammoth/turndown
            run so users see something is happening (parse can take 1-2s on a
            5MB docx). Reuses the warm primary tint, no new decoration. */}
        {importing && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(255, 255, 255, 0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 14, backdropFilter: 'blur(2px)',
            pointerEvents: 'all',
          }}>
            <span style={{ fontSize: 13, color: '#c25b35', fontWeight: 500 }}>
              {t('create.word.converting')}
            </span>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt,.docx"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Step 1 pill rows — templated universal axes. Only shown in the
          'customize' stage so the first view stays approachable; content-
          specific questions live in the Q&A step (/api/ai/clarify) after this.
          The language row is further gated by detection — we only surface it
          when the paste is genuinely bilingual. Reports never enter customize
          (handleNext submits directly), so this block is slide-only in practice
          — the format guard is a defensive belt on top of the unreachable path. */}
      {stage === 'customize' && format !== 'report' && (<>
      <p style={{
        fontSize: 11, color: '#b0aea5', margin: '16px 0 0 0',
        textAlign: 'center', animation: 'qaFadeIn 0.3s ease-out',
      }}>
        {t('create.customize_hint')}
      </p>
      <div style={{
        marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10,
        animation: 'qaFadeIn 0.3s ease-out',
      }}>
        {STEP1_FOR_FULL_CONTENT
          .filter(sel => sel.id !== 'language' || detectedLang === 'bilingual')
          .map(sel => (
          <div key={sel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 12, color: '#8e8a80',
              minWidth: 56, flexShrink: 0,
            }}>
              {t(sel.labelKey)}
            </span>
            {sel.options.map(opt => {
              const active = step1[sel.id] === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => updateStep1(sel.id, opt.value)}
                  disabled={disabled}
                  title={t(opt.tooltipKey)}
                  style={{
                    fontSize: 12,
                    padding: '4px 11px',
                    borderRadius: 999,
                    border: active ? '1px solid #d97757' : '1px solid #e8e6dc',
                    background: active ? '#fbe9dd' : '#fff',
                    color: active ? '#c25b35' : '#6b6a63',
                    fontWeight: active ? 500 : 400,
                    cursor: disabled ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {t(opt.labelKey)}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Length selector — slides only (the whole 'customize' block above is
          already gated on format !== 'report'). */}
      <div style={{
        marginTop: 16, display: 'flex', alignItems: 'center',
        justifyContent: 'center', gap: 8, flexWrap: 'wrap',
        animation: 'qaFadeIn 0.3s ease-out',
      }}>
        <span style={{ fontSize: 12, color: '#8e8a80', marginRight: 4 }}>
          {locale === 'en' ? 'Length' : '篇幅'}
        </span>
        {LENGTH_ORDER.map(choice => {
          const active = lengthChoice === choice;
          // 'custom' when active swaps the pill for an inline number input so
          // users can type an exact page count. Blur or Enter commits; the
          // value is read from `customLength` in handleSubmit.
          if (choice === 'custom' && active) {
            return (
              <span key={choice} style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 999,
                border: '1px solid #d97757', background: '#fbe9dd',
              }}>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  max={200}
                  value={customLength}
                  onChange={e => {
                    touchedRef.current.add('length');
                    setCustomLength(e.target.value.replace(/[^0-9]/g, ''));
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
                  disabled={disabled}
                  placeholder="12"
                  style={{
                    width: 40, border: 'none', outline: 'none',
                    background: 'transparent', color: '#c25b35',
                    fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
                    textAlign: 'right',
                  }}
                />
                <span style={{ fontSize: 12, color: '#c25b35' }}>
                  {locale === 'en' ? 'pages' : '页'}
                </span>
              </span>
            );
          }
          return (
            <button
              key={choice}
              onClick={() => {
                touchedRef.current.add('length');
                setLengthChoice(choice);
              }}
              disabled={disabled}
              style={{
                fontSize: 12,
                padding: '5px 12px',
                borderRadius: 999,
                border: active ? '1px solid #d97757' : choice === 'custom' ? '1px dashed #e8e6dc' : '1px solid #e8e6dc',
                background: active ? '#fbe9dd' : '#fff',
                color: active ? '#c25b35' : choice === 'custom' ? '#b0aea5' : '#6b6a63',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {locale === 'en' ? LENGTH_LABELS[choice].en : LENGTH_LABELS[choice].zh}
            </button>
          );
        })}
      </div>
      </>)}

      {/* Submit button */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <button
          onClick={stage === 'write' ? handleNext : handleSubmit}
          disabled={disabled || !value.trim()}
          style={{
            padding: '12px 36px',
            borderRadius: 12,
            border: 'none',
            background: value.trim() ? '#d97757' : '#e8e6dc',
            color: value.trim() ? '#fff' : '#b0aea5',
            fontSize: 15,
            fontWeight: 600,
            cursor: value.trim() && !disabled ? 'pointer' : 'default',
            fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
        >
          {stage === 'customize' || format === 'report' ? t('create.generate_from_content') : t('create.next')}
        </button>
        <p style={{ fontSize: 11, color: '#b0aea5', marginTop: 8 }}>
          {t('create.submit_shortcut')}
        </p>
      </div>
    </div>
  );
}
