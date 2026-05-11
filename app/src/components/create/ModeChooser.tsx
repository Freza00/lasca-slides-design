'use client';

// ============================================================================
// ModeChooser — three-card picker for /create full-content flow
// ----------------------------------------------------------------------------
// Three commitment levels for what to do with the user's pasted draft:
//   asis     — keep verbatim; deterministic md → ParsedReport, zero LLM
//   polish   — preserve every paragraph; LLM may copy-edit & restore implicit
//              headings, and ask the user about ambiguous sections
//   generate — current LLM-heavy generate-from-draft pipeline
//
// The recommendation is only a pre-selection. Whatever the user clicks,
// CreateFlow.handleModePick runs the same fallback chain (asis → polish →
// generate) when content is too thin to honor the chosen commitment.
// ============================================================================

import { useT } from '@/lib/i18n';
import type { FullContentMode, ModeRecommendation } from '@/lib/ai/recommendMode';

interface ModeChooserProps {
  format: 'slide' | 'report';
  recommendation: ModeRecommendation;
  onPick: (mode: FullContentMode) => void;
  disabled?: boolean;
}

const MODES: FullContentMode[] = ['asis', 'polish', 'generate'];

export function ModeChooser({ format, recommendation, onPick, disabled }: ModeChooserProps) {
  const t = useT();

  return (
    <div style={{ width: '100%', maxWidth: 880, margin: '0 auto' }}>
      <h2 style={{
        fontSize: 24, fontWeight: 700, color: '#141413',
        marginBottom: 6, textAlign: 'center',
      }}>
        {t('create.mode.title')}
      </h2>
      <p style={{
        fontSize: 13, color: '#b0aea5', textAlign: 'center',
        marginBottom: 28, lineHeight: 1.6,
      }}>
        {t('create.mode.subtitle')}
      </p>

      <div style={{
        display: 'grid', gap: 14,
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      }}>
        {MODES.map(mode => {
          const recommended = recommendation.mode === mode;
          return (
            <button
              key={mode}
              onClick={() => !disabled && onPick(mode)}
              disabled={disabled}
              style={{
                position: 'relative',
                textAlign: 'left',
                padding: '20px 18px 18px',
                borderRadius: 14,
                border: recommended ? '2px solid #d97757' : '1px solid #e8e6dc',
                background: recommended ? '#fff7f0' : '#fff',
                cursor: disabled ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: 'transform 0.12s, box-shadow 0.12s, border-color 0.15s',
                boxShadow: recommended ? '0 6px 18px rgba(217, 119, 87, 0.18)' : '0 1px 3px rgba(0,0,0,0.04)',
                minHeight: 220,
                display: 'flex', flexDirection: 'column',
              }}
              onMouseEnter={e => {
                if (disabled) return;
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = recommended
                  ? '0 8px 22px rgba(217, 119, 87, 0.24)'
                  : '0 4px 10px rgba(0,0,0,0.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = recommended
                  ? '0 6px 18px rgba(217, 119, 87, 0.18)'
                  : '0 1px 3px rgba(0,0,0,0.04)';
              }}
            >
              {recommended && (
                <span style={{
                  position: 'absolute', top: 10, right: 12,
                  fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
                  color: '#fff', background: '#d97757',
                  padding: '3px 9px', borderRadius: 999,
                  textTransform: 'uppercase',
                }}>
                  {t('create.mode.recommended')}
                </span>
              )}
              <div style={{
                fontSize: 18, fontWeight: 600, color: '#141413',
                marginBottom: 8,
              }}>
                {t(`create.mode.${mode}.title`)}
              </div>
              <div style={{
                fontSize: 13, lineHeight: 1.65, color: '#6b6a63',
                flex: 1,
              }}>
                {t(`create.mode.${mode}.desc`)}
              </div>
              {recommended && (
                <div style={{
                  marginTop: 12, fontSize: 11, color: '#c25b35',
                  fontStyle: 'italic', lineHeight: 1.5,
                }}>
                  {t(recommendation.reasonKey, recommendation.reasonTokens)}
                </div>
              )}
              <div style={{
                marginTop: 14,
                fontSize: 12, color: recommended ? '#d97757' : '#b0aea5',
                fontWeight: recommended ? 600 : 400,
              }}>
                {t(`create.mode.${mode}.action`)} →
              </div>
            </button>
          );
        })}
      </div>

      <p style={{
        marginTop: 18, fontSize: 11, color: '#b0aea5',
        textAlign: 'center', lineHeight: 1.6,
      }}>
        {format === 'report'
          ? t('create.mode.footnote_report')
          : t('create.mode.footnote_slide')}
      </p>
    </div>
  );
}
