'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import type { ClarifierQuestion, ClarifierAnswers, ClarifierOption } from '@/lib/ai/harness/types';
import { DECIDE_FOR_YOU_VALUE } from '@/lib/ai/harness/types';
import { AUTO_SENTINEL } from '@/lib/ai/harness/clarifier';
import { useT } from '@/lib/i18n';

// Muted background palette (Anthropic-inspired)
const BG_COLORS = ['#c9b8a8', '#b5a898', '#a8b4a0', '#b0a8b8'];

/**
 * Modern abstract illustration animation (Anthropic-style):
 * - Geometric shapes (triangles, circles, rectangles) on muted backgrounds
 * - Bold hand-drawn brush strokes in black
 * - Clean, editorial, abstract feel
 * - Each "card" is a mini abstract composition that draws itself
 */
function CaveThinking() {
  const t = useT();
  const thinkingMsgs = useMemo(() => [
    t('qa.thinking.1'), t('qa.thinking.2'), t('qa.thinking.3'),
    t('qa.thinking.4'), t('qa.thinking.5'),
  ], [t]);
  const [msgIdx, setMsgIdx] = useState(0);
  const [cardIdx, setCardIdx] = useState(0);
  useEffect(() => {
    const t1 = setInterval(() => setMsgIdx(i => (i + 1) % thinkingMsgs.length), 2800);
    const t2 = setInterval(() => setCardIdx(i => (i + 1) % 4), 3500);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  const draw = (delay: number, dur = 1.8) => ({
    strokeDasharray: '1', pathLength: 1,
    strokeDashoffset: 1,
    animation: `caveStrokeDraw ${dur}s ease-out ${delay}s forwards`,
  } as React.CSSProperties);

  // 4 abstract compositions that cycle
  const compositions = [
    // 1: Triangle + circle + connector (like the "Fundamentals" image)
    <svg key="c0" width="200" height="140" viewBox="0 0 200 140" fill="none">
      <rect width="200" height="140" rx="12" fill={BG_COLORS[0]} />
      <polygon points="130,20 170,80 90,80" fill="#faf8f5" opacity="0.9" />
      <circle cx="85" cy="95" r="28" fill="#faf8f5" opacity="0.9" />
      <path d="M100 80 L125 50" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" style={draw(0.3)} />
      <circle cx="100" cy="80" r="5" fill="#1a1a1a" style={{ opacity: 0, animation: 'qaFadeIn 0.3s ease-out 1s forwards' }} />
      <circle cx="125" cy="50" r="5" fill="#1a1a1a" style={{ opacity: 0, animation: 'qaFadeIn 0.3s ease-out 1.2s forwards' }} />
    </svg>,
    // 2: Spiral notebook + brush stroke (like the notebook image)
    <svg key="c1" width="200" height="140" viewBox="0 0 200 140" fill="none">
      <rect width="200" height="140" rx="12" fill={BG_COLORS[1]} />
      <rect x="60" y="25" width="100" height="90" rx="4" fill="#faf8f5" opacity="0.9" />
      <path d="M55 35 Q48 40 50 48 Q52 55 48 60 Q44 67 48 74 Q52 80 48 87 Q44 93 48 100 Q52 107 48 112" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" fill="none" style={draw(0.2, 2)} />
      <path d="M145 90 L145 45" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" fill="none" style={draw(0.8, 1.5)} />
      <path d="M80 105 L135 105" stroke="#1a1a1a" strokeWidth="4" strokeLinecap="round" fill="none" style={draw(1.2, 1.2)} />
    </svg>,
    // 3: Steps + bouncing curve (like the purple stairs image)
    <svg key="c2" width="200" height="140" viewBox="0 0 200 140" fill="none">
      <rect width="200" height="140" rx="12" fill="#9b8eb8" />
      <path d="M70 120 L70 90 L110 90 L110 60 L150 60 L150 30 L190 30" fill="#faf8f5" opacity="0.9" />
      <path d="M55 120 Q70 85 85 90 Q100 55 115 60 Q130 25 145 30 Q160 -5 175 10" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" style={draw(0.3, 2.5)} />
    </svg>,
    // 4: Warning / curly braces (like the alert image)
    <svg key="c3" width="200" height="140" viewBox="0 0 200 140" fill="none">
      <rect width="200" height="140" rx="12" fill={BG_COLORS[2]} />
      <polygon points="100,25 145,100 55,100" fill="#faf8f5" opacity="0.9" />
      <path d="M45 40 Q38 50 40 70 Q42 85 38 100" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" fill="none" style={draw(0.2, 1.5)} />
      <path d="M155 40 Q162 50 160 70 Q158 85 162 100" stroke="#1a1a1a" strokeWidth="4.5" strokeLinecap="round" fill="none" style={draw(0.4, 1.5)} />
      <path d="M98 55 L98 82" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" fill="none" style={draw(0.8, 1)} />
      <circle cx="98" cy="90" r="4" fill="#1a1a1a" style={{ opacity: 0, animation: 'qaFadeIn 0.3s ease-out 1.5s forwards' }} />
    </svg>,
  ];

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 24, padding: '40px 0 24px',
      animation: 'qaFadeIn 0.4s ease-out',
    }}>
      {/* Cycling abstract composition */}
      <div key={cardIdx} style={{
        animation: 'qaFadeIn 0.5s ease-out',
        borderRadius: 12, overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
      }}>
        {compositions[cardIdx]}
      </div>

      {/* Rotating text */}
      <p key={msgIdx} style={{
        fontSize: 14, color: '#b0aea5',
        animation: 'qaFadeIn 0.3s ease-out',
        minHeight: 20,
      }}>
        {thinkingMsgs[msgIdx]}
      </p>
    </div>
  );
}

interface QAStepProps {
  questions: ClarifierQuestion[];
  onComplete: (answers: ClarifierAnswers) => void;
  /** Skip all questions and proceed with defaults */
  onSkip?: () => void;
  /** If true, show a loading spinner after template Qs while fetching AI supplemental Qs */
  loadingMore?: boolean;
}

export function QAStep({ questions, onComplete, onSkip, loadingMore }: QAStepProps) {
  const t = useT();
  const [answers, setAnswers] = useState<ClarifierAnswers>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Seed recommendedValue into answers when new questions arrive. We only
  // fill ids that aren't already answered so user selections win over the
  // LLM's suggestion. Runs on every questions list mutation so AI supplemental
  // questions get their recommendations too.
  useEffect(() => {
    setAnswers(prev => {
      let changed = false;
      const next: ClarifierAnswers = { ...prev };
      for (const q of questions) {
        if (q.id in next) continue;
        if (q.recommendedValue !== undefined && q.recommendedValue !== null) {
          next[q.id] = q.recommendedValue as ClarifierAnswers[string];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [questions]);

  const handleSelect = (qId: string, value: string | number, multiSelect?: boolean) => {
    // Picking a pill clears the custom-input override if any — they represent
    // the same answer slot and showing both selected is confusing.
    setCustomInputs(prev => {
      if (!(qId in prev)) return prev;
      const next = { ...prev };
      delete next[qId];
      return next;
    });

    setAnswers(prev => {
      if (multiSelect) {
        const current = (prev[qId] as (string | number)[] | undefined) ?? [];
        // AUTO_SENTINEL / DECIDE_FOR_YOU_VALUE are both exclusive on multi-select:
        // picking them clears other options; picking any other option clears them.
        // Prevents inconsistent "auto + specific" state.
        const isExclusive = value === AUTO_SENTINEL || value === DECIDE_FOR_YOU_VALUE;
        if (isExclusive) {
          const hasSame = current.includes(value);
          return { ...prev, [qId]: hasSame ? [] : [value] };
        }
        const cleaned = current.filter(v => v !== AUTO_SENTINEL && v !== DECIDE_FOR_YOU_VALUE);
        const exists = cleaned.includes(value);
        return { ...prev, [qId]: exists ? cleaned.filter(v => v !== value) : [...cleaned, value] };
      }
      return { ...prev, [qId]: value };
    });
  };

  const handleCustomChange = (qId: string, text: string) => {
    setCustomInputs(prev => ({ ...prev, [qId]: text }));
    const trimmed = text.trim();
    setAnswers(prev => {
      const next = { ...prev };
      if (trimmed) next[qId] = `custom:${trimmed}`;
      else delete next[qId];
      return next;
    });
  };

  const allAnswered = questions.every(q => q.id in answers);
  const canContinue = allAnswered && !loadingMore;

  const hasQuestions = questions.length > 0;

  // If no questions have arrived yet, show full-screen cave animation
  if (!hasQuestions && loadingMore) {
    return (
      <div style={{ width: '100%', maxWidth: 680, margin: '0 auto', paddingTop: 40 }}>
        <CaveThinking />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="create-container" style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{
        fontSize: 22, fontWeight: 700, color: '#141413',
        textAlign: 'center', marginBottom: 8,
        animation: 'qaFadeIn 0.3s ease-out',
      }}>
        {t('qa.about_content')}
      </h2>
      <p style={{
        fontSize: 14, color: '#b0aea5', textAlign: 'center',
        marginBottom: 32,
      }}>
        {t('qa.answer_questions')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {questions.map(q => {
          const selectedValue = answers[q.id];
          const isMulti = !!q.multiSelect;
          const selectedSet = isMulti
            ? new Set((selectedValue as (string | number)[] | undefined) ?? [])
            : null;

          // Server already auto-injects the "let AI decide" option, but a
          // defensive belt-and-suspenders check keeps the UI contract stable
          // even if an older clarify response is cached client-side.
          const hasDefer = q.options.some(o => o.isDecideForYou || o.value === DECIDE_FOR_YOU_VALUE);
          const displayOptions: ClarifierOption[] = hasDefer
            ? q.options
            : [...q.options, { label: t('qa.decide_for_you'), value: DECIDE_FOR_YOU_VALUE, isDecideForYou: true }];

          const recommendedSet = new Set<string | number>();
          if (Array.isArray(q.recommendedValue)) {
            for (const v of q.recommendedValue) recommendedSet.add(v);
          } else if (q.recommendedValue !== undefined && q.recommendedValue !== null) {
            recommendedSet.add(q.recommendedValue);
          }

          return (
            <div
              key={q.id}
              style={{
                padding: 24, borderRadius: 16,
                background: '#faf9f5', border: '1px solid #e8e6dc',
                animation: 'qaFadeIn 0.35s ease-out',
              }}
            >
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, color: '#d97757',
                  background: '#fdf0e9', padding: '3px 10px', borderRadius: 8,
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  {q.header}
                </span>
                {isMulti && (
                  <span style={{ fontSize: 11, color: '#b0aea5', fontWeight: 400 }}>
                    {t('qa.multi_select')}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: 17, fontWeight: 600, color: '#141413',
                marginBottom: q.hint ? 6 : 20, lineHeight: 1.5,
              }}>
                {q.question}
              </p>
              {q.hint && (
                <p style={{
                  fontSize: 12, color: '#8a8880',
                  marginBottom: 20, lineHeight: 1.5,
                }}>
                  {q.hint}
                </p>
              )}

              {/* Option pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
                {displayOptions.map(opt => {
                  const isSelected = isMulti
                    ? selectedSet!.has(opt.value)
                    : selectedValue === opt.value;
                  const isRecommended = recommendedSet.has(opt.value);
                  const isDefer = !!opt.isDecideForYou || opt.value === DECIDE_FOR_YOU_VALUE;

                  return (
                    <button
                      key={String(opt.value)}
                      onClick={() => handleSelect(q.id, opt.value, isMulti)}
                      style={{
                        position: 'relative',
                        padding: '12px 20px',
                        borderRadius: 12,
                        border: isSelected ? '2px solid #d97757' : '1px solid #e8e6dc',
                        background: isSelected ? '#fdf0e9' : isDefer ? '#f7f6f0' : '#fff',
                        color: isSelected ? '#d97757' : isDefer ? '#8a8880' : '#141413',
                        fontSize: 14, fontWeight: 500, cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'flex-start', gap: 2,
                        minHeight: 44,
                      }}
                      onMouseEnter={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = '#d97757';
                      }}
                      onMouseLeave={e => {
                        if (!isSelected) e.currentTarget.style.borderColor = '#e8e6dc';
                      }}
                    >
                      {isRecommended && !isDefer && (
                        <span style={{
                          position: 'absolute', top: -8, right: 8,
                          fontSize: 10, fontWeight: 600,
                          background: '#788c5d', color: '#fff',
                          padding: '2px 7px', borderRadius: 8,
                          letterSpacing: 0.3,
                        }}>
                          {t('qa.recommended')}
                        </span>
                      )}
                      <span>{opt.label}</span>
                      {opt.hint && (
                        <span style={{ fontSize: 11, color: '#b0aea5', fontWeight: 400 }}>
                          {opt.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Implication feedback — shows for the currently selected option(s). */}
              {(() => {
                const selectedOpts = isMulti
                  ? displayOptions.filter(o => selectedSet!.has(o.value))
                  : displayOptions.filter(o => o.value === selectedValue);
                const implications = selectedOpts
                  .map(o => o.implication)
                  .filter((s): s is string => !!s);
                if (implications.length === 0) return null;
                return (
                  <div style={{
                    fontSize: 13, color: '#d97757', fontWeight: 500,
                    padding: '4px 0 8px',
                    animation: 'qaFadeIn 0.3s ease-out',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    {implications.map((imp, i) => <span key={i}>{imp}</span>)}
                  </div>
                );
              })()}

              {/* "Other…" text input — only on questions the LLM flagged
                  allowCustom. Value is stored as `custom:${text}` so downstream
                  freeFormHints picks it up. */}
              {q.allowCustom && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <input
                    type="text"
                    placeholder={t('qa.other_placeholder')}
                    value={customInputs[q.id] || ''}
                    onChange={e => handleCustomChange(q.id, e.target.value)}
                    style={{
                      flex: 1, padding: '8px 14px', borderRadius: 10,
                      border: '1px solid #e8e6dc', background: '#fff',
                      fontSize: 13, color: '#141413', fontFamily: 'inherit',
                      outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {/* Loading — cave painting thinking animation */}
        {loadingMore && (
          <CaveThinking />
        )}
      </div>

      {/* Continue + Skip buttons */}
      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
        {onSkip && (
          <button
            onClick={onSkip}
            style={{
              padding: '10px 20px', borderRadius: 12, border: '1px solid #e8e6dc',
              background: 'transparent', color: '#b0aea5',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#6b6a65'; e.currentTarget.style.borderColor = '#b0aea5'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#b0aea5'; e.currentTarget.style.borderColor = '#e8e6dc'; }}
          >
            {t('qa.skip_defaults')}
          </button>
        )}
        <button
          onClick={() => canContinue && onComplete(answers)}
          disabled={!canContinue}
          style={{
            padding: '10px 28px', borderRadius: 12, border: 'none',
            background: canContinue ? '#1a1a2e' : '#e8e6dc',
            color: canContinue ? '#fff' : '#b0aea5',
            fontSize: 15, fontWeight: 600, cursor: canContinue ? 'pointer' : 'default',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (canContinue) e.currentTarget.style.background = '#2a2a4e'; }}
          onMouseLeave={e => { if (canContinue) e.currentTarget.style.background = '#1a1a2e'; }}
        >
          {t('create.continue')}
        </button>
      </div>

      {/* qaFadeIn defined in globals.css */}
    </div>
  );
}
