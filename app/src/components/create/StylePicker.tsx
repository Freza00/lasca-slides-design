'use client';

import type { JSX } from 'react';
import type { Theme } from '@/lib/types';
import type { BrandColors, StylePresetId } from '@/lib/ai/harness/types';
import { DEFAULT_REPORT_PRESET_ID } from '@/lib/ai/harness/stylePresets';
import { useT, useLocale } from '@/lib/i18n';
import {
  BASE_THEMES,
  BRAND_THEMES,
  SCENE_GROUPS,
  type ThemeSignature,
} from '@/lib/themeCatalog';

// ── Font stack helper ──────────────────────────────────────────────
// Combines Latin + CJK stacks so the browser picks per-character.
// Strips the trailing generic family from the Latin stack so the CJK
// stack's named families get a chance first (otherwise the generic
// 'serif' would short-circuit on CJK systems that have a Latin-only
// generic-serif like Times).
function combineStacks(latin: string, cjk: string): string {
  const stripped = latin.replace(/,\s*(serif|sans-serif|monospace|cursive|fantasy)\s*$/i, '');
  return `${stripped}, ${cjk}`;
}

// Mix hex color with alpha for subtle fills.
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Motif hint layer (slide thumbs) ────────────────────────────────
// Tiny decorative cue so each card's motif is identifiable at a glance.
// Drawn behind text; must stay inside the 200×120 thumbnail box.
function SlideMotifHint({ motifId, colors }: { motifId: string; colors: BrandColors }): JSX.Element | null {
  const accent = colors.primary;
  switch (motifId) {
    case 'paper-deckle':
      return (
        <div style={{
          position: 'absolute', left: 0, top: 0, width: 10, height: 10,
          background: accent, opacity: 0.7,
          clipPath: 'polygon(0 0, 100% 0, 0 100%)',
        }} />
      );
    case 'hairline-frame':
      return (
        <div style={{
          position: 'absolute', inset: 5,
          border: `1px solid ${accent}`, opacity: 0.35,
          pointerEvents: 'none',
        }} />
      );
    case 'constellation':
      return (
        <>
          {[[168, 14], [184, 26], [160, 96], [180, 106], [150, 22]].map(([x, y], i) => (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: 2, height: 2, borderRadius: '50%',
              background: accent, opacity: 0.85,
              boxShadow: `0 0 4px ${accent}`,
            }} />
          ))}
        </>
      );
    case 'neon-underline':
      return (
        <div style={{
          position: 'absolute', left: 14, bottom: 32,
          width: 48, height: 2, borderRadius: 1,
          background: `linear-gradient(90deg, ${accent}, ${colors.accent})`,
        }} />
      );
    case 'grid-dot-matrix':
      return (
        <>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(${accent} 0.55px, transparent 0.55px)`,
            backgroundSize: '9px 9px', opacity: 0.18,
            pointerEvents: 'none',
          }} />
          {/* corner tick marks */}
          <div style={{ position: 'absolute', top: 6, left: 6, width: 6, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', top: 6, left: 6, width: 1, height: 6, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', bottom: 6, right: 6, width: 6, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', bottom: 6, right: 6, width: 1, height: 6, background: colors.text, opacity: 0.5 }} />
        </>
      );
    case 'left-rule':
      return (
        <div style={{
          position: 'absolute', left: 0, top: 10, bottom: 10, width: 3,
          background: accent, opacity: 0.95,
        }} />
      );
    case 'crop-marks':
      return (
        <>
          {/* TL */}
          <div style={{ position: 'absolute', top: 4, left: 4, width: 8, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', top: 4, left: 4, width: 1, height: 8, background: colors.text, opacity: 0.5 }} />
          {/* TR */}
          <div style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', top: 4, right: 4, width: 1, height: 8, background: colors.text, opacity: 0.5 }} />
          {/* BL */}
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 8, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', bottom: 4, left: 4, width: 1, height: 8, background: colors.text, opacity: 0.5 }} />
          {/* BR */}
          <div style={{ position: 'absolute', bottom: 4, right: 4, width: 8, height: 1, background: colors.text, opacity: 0.5 }} />
          <div style={{ position: 'absolute', bottom: 4, right: 4, width: 1, height: 8, background: colors.text, opacity: 0.5 }} />
        </>
      );
    case 'void':
      return null; // Apple: decoration by absence
    case 'waveform':
      return (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 8,
          display: 'flex', gap: 2, alignItems: 'flex-end', height: 10,
        }}>
          {[3, 6, 4, 9, 5, 7, 9, 4, 6, 3, 7, 5, 8, 6, 4, 3, 5, 7].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: h, background: accent, opacity: 0.75,
              borderRadius: 0.5,
            }} />
          ))}
        </div>
      );
    case 'rubber-stamp':
      return (
        <div style={{
          position: 'absolute', right: 10, bottom: 10,
          width: 26, height: 16, borderRadius: 6,
          border: `1.2px solid ${accent}`,
          background: hexToRgba(accent, 0.08),
        }} />
      );
    case 'racing-chevron':
      return (
        <div style={{
          position: 'absolute', right: -8, top: -8,
          width: 48, height: 6,
          background: accent,
          transform: 'rotate(-45deg)',
          transformOrigin: 'top right',
          opacity: 0.9,
        }} />
      );
    default:
      return null;
  }
}

// ── Slide thumbnail (200×120) ──────────────────────────────────────
// Uses the theme's real fonts. Locale chooses previewCopy{zh,en} so the
// "active" font in the thumb matches what will render in the deck.

function StyleThumbSlide({ signature, locale }: {
  signature: ThemeSignature; locale: 'zh' | 'en';
}): JSX.Element {
  const { colors, previewCopy, motifId } = signature;
  const copy = previewCopy[locale];
  const headlineFamily = combineStacks(signature.fontHeadlineLatin, signature.fontHeadlineCjk);
  const bodyFamily = combineStacks(signature.fontBodyLatin, signature.fontBodyCjk);
  const isDarkBg = (() => {
    const h = colors.bg.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) < 140;
  })();

  return (
    <div style={{
      position: 'relative',
      width: 200, height: 120,
      background: colors.bg,
      color: colors.text,
      overflow: 'hidden',
    }}>
      <SlideMotifHint motifId={motifId} colors={colors} />
      <div style={{
        position: 'absolute', inset: '16px 16px 14px',
        display: 'flex', flexDirection: 'column',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontFamily: headlineFamily,
          fontSize: 17, fontWeight: 600,
          lineHeight: 1.1,
          color: colors.text,
          letterSpacing: locale === 'en' ? '-0.01em' : 0,
        }}>{copy.title}</div>
        <div style={{
          fontFamily: bodyFamily,
          fontSize: 8.5, opacity: isDarkBg ? 0.7 : 0.55,
          marginTop: 5,
          color: colors.text,
          letterSpacing: '0.02em',
        }}>{copy.subtitle}</div>
        <div style={{
          fontFamily: bodyFamily,
          fontSize: 8, opacity: isDarkBg ? 0.75 : 0.65,
          marginTop: 8, lineHeight: 1.45,
          color: colors.text,
          // Keep body tight enough to not collide with waveform/rubber-stamp motifs
          maxWidth: motifId === 'waveform' ? 120 : 170,
        }}>{copy.body}</div>
      </div>
    </div>
  );
}

// ── Report thumbnail (200×120) ─────────────────────────────────────
// Shared baseline derived from the bilingual-report skill (caption →
// hairline → serif title → left-ruled section → page folio), but tinted
// with each theme's colors and fonts.

function StyleThumbReport({ signature, locale }: {
  signature: ThemeSignature; locale: 'zh' | 'en';
}): JSX.Element {
  const { colors, previewCopy } = signature;
  const copy = previewCopy[locale];
  const headFamily = combineStacks(signature.fontHeadlineLatin, signature.fontHeadlineCjk);
  const bodyFamily = combineStacks(signature.fontBodyLatin, signature.fontBodyCjk);
  const caption = locale === 'zh' ? '研究 ｜ 报告样本' : 'RESEARCH · SAMPLE REPORT';
  const sectionLabel = locale === 'zh' ? '一、市场速览' : 'I. Market Brief';

  return (
    <div style={{
      position: 'relative',
      width: 200, height: 120,
      background: colors.bg,
      color: colors.text,
      overflow: 'hidden',
    }}>
      {/* Top caption */}
      <div style={{
        position: 'absolute', top: 10, left: 14, right: 14,
        fontFamily: bodyFamily, fontSize: 6.5, fontWeight: 700,
        color: colors.primary, letterSpacing: '0.14em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{caption}</div>
      {/* Primary hairline */}
      <div style={{
        position: 'absolute', top: 22, left: 14, right: 14,
        height: 0.6, background: colors.primary,
      }} />
      {/* Title — single-line clamp; thumbnail is a typography sample, not a
          full-fidelity title render. Prevents wrap from overlapping subtitle. */}
      <div style={{
        position: 'absolute', top: 30, left: 14, right: 14,
        fontFamily: headFamily, fontSize: 13, fontWeight: 500,
        color: colors.text, lineHeight: 1.15,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{copy.title}</div>
      {/* Subtitle — also clamped to one line for the same reason. */}
      <div style={{
        position: 'absolute', top: 49, left: 14, right: 14,
        fontFamily: headFamily, fontSize: 8.5,
        color: colors.text, opacity: 0.55,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{copy.subtitle}</div>
      {/* Section block with left rule */}
      <div style={{
        position: 'absolute', left: 14, right: 50, bottom: 20,
        height: 18, background: hexToRgba(colors.primary, 0.08),
      }} />
      <div style={{
        position: 'absolute', left: 14, bottom: 20, width: 2, height: 18,
        background: colors.primary,
      }} />
      <div style={{
        position: 'absolute', left: 22, bottom: 24,
        fontFamily: headFamily, fontSize: 7.5, fontWeight: 500,
        color: colors.text,
      }}>{sectionLabel}</div>
      {/* Folio */}
      <div style={{
        position: 'absolute', right: 14, bottom: 8,
        fontFamily: bodyFamily, fontSize: 8.5, fontWeight: 700,
        color: colors.primary,
      }}>07</div>
    </div>
  );
}

// Dispatcher: picks slide or report thumb based on format.
function StyleThumb({ signature, locale, format }: {
  signature: ThemeSignature; locale: 'zh' | 'en'; format: 'slide' | 'report';
}): JSX.Element {
  if (format === 'report') return <StyleThumbReport signature={signature} locale={locale} />;
  return <StyleThumbSlide signature={signature} locale={locale} />;
}

// ── Component ───────────────────────────────────────────────────────

interface StylePickerProps {
  selectedTheme: Theme;
  onSelectTheme: (theme: Theme) => void;
  onGenerate: () => void;
  disabled?: boolean;
  onBack?: () => void;
  /** Switches thumbs + preset auto-application when generating a report. */
  format?: 'slide' | 'report';
  /** Selected preset id (separate from theme). null = no preset, theme-only. */
  selectedPresetId?: StylePresetId | null;
  /** Set the active preset. Pass null to clear back to theme-only mode. */
  onSelectPreset?: (id: StylePresetId | null) => void;
}

export default function StylePicker({ selectedTheme, onSelectTheme, onGenerate, disabled, onBack, format, selectedPresetId, onSelectPreset }: StylePickerProps) {
  const t = useT();
  const locale = useLocale();
  const thumbFormat: 'slide' | 'report' = format === 'report' ? 'report' : 'slide';
  const surface: 'slide' | 'report' = format === 'report' ? 'report' : 'slide';

  // Per template-level clutter-line cleanup (2026-04-21): reports show ONLY
  // base + analysis-report. Brand themes + other scene groups are slide-only.
  const visibleSceneGroups = SCENE_GROUPS.filter(g => !g.surface || g.surface === surface);
  const showBrandThemes = surface === 'slide';

  // In report mode, picking warm auto-applies the default report preset
  // (currently bilingual-report — Kai serif body + citation discipline + section
  // tint). Other themes clear the preset.
  const pickTheme = (theme: Theme): void => {
    onSelectTheme(theme);
    if (format === 'report' && theme === 'warm') {
      onSelectPreset?.(DEFAULT_REPORT_PRESET_ID);
    } else {
      onSelectPreset?.(null);
    }
  };

  // A card is "selected" if its theme matches AND either no preset is active,
  // or we're on warm+report with the auto-applied default report preset.
  const cardIsSelected = (theme: Theme): boolean => {
    if (selectedTheme !== theme) return false;
    if (!selectedPresetId) return true;
    return format === 'report' && theme === 'warm' && selectedPresetId === DEFAULT_REPORT_PRESET_ID;
  };

  return (
    <div style={{
      maxWidth: 900, margin: '0 auto', padding: '32px 24px 80px',
      fontFamily: 'var(--font-body-sans)',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <h2 style={{
          fontSize: 28, fontWeight: 700, color: '#1a1a2e',
          marginBottom: 8, fontFamily: 'var(--font-display-sans)',
        }}>{t('style.title')}</h2>
        <p style={{ fontSize: 15, color: '#6b6a65', lineHeight: 1.5 }}>
          {t('style.subtitle')}
        </p>
      </div>

      {/* Base themes */}
      <div style={{ marginBottom: 40 }}>
        <h3 style={{
          fontSize: 13, fontWeight: 600, color: '#6b6a65',
          marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>{t('style.base_section')}</h3>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
        }}>
          {BASE_THEMES.map(sig => {
            const isSelected = cardIsSelected(sig.theme);
            return (
              <button
                key={sig.theme}
                onClick={() => pickTheme(sig.theme)}
                style={{
                  border: 'none', background: 'transparent', padding: 0,
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = isSelected ? 'scale(1.02)' : 'scale(1)'; }}
              >
                <div style={{
                  borderRadius: 12,
                  border: isSelected ? '2px solid #1a1a2e' : '1px solid #e8e6dc',
                  overflow: 'hidden',
                  boxShadow: isSelected
                    ? '0 8px 24px rgba(0,0,0,0.12)'
                    : '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                  <StyleThumb signature={sig} locale={locale as 'zh' | 'en'} format={thumbFormat} />
                  <div style={{
                    padding: '12px 16px',
                    background: isSelected ? '#faf9f5' : '#fff',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                        {sig.name[locale as 'zh' | 'en']}
                      </div>
                      <div style={{
                        fontSize: 10, color: '#b0aea5', fontStyle: 'italic',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 120,
                      }}>
                        {sig.philosophy[locale as 'zh' | 'en']}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b6a65', marginTop: 4 }}>
                      {sig.desc[locale as 'zh' | 'en']}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scene × Colorway themes (v2) — report surface sees only analysis-report; slide sees analyst etc. */}
      {visibleSceneGroups.map(group => (
        <div key={group.id} style={{ marginBottom: 40 }}>
          <h3 style={{
            fontSize: 13, fontWeight: 600, color: '#6b6a65',
            marginBottom: group.desc ? 6 : 16, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {group.label[locale as 'zh' | 'en']}
            {' '}
            <span style={{
              fontSize: 10, color: '#d97757', background: '#fdf0e9',
              padding: '2px 6px', borderRadius: 4, fontWeight: 700,
              letterSpacing: '0.04em', verticalAlign: 'middle',
            }}>PREMIUM</span>
          </h3>
          {group.desc && (
            <p style={{
              fontSize: 12, color: '#8a8880', lineHeight: 1.5,
              marginTop: 0, marginBottom: 16,
            }}>
              {group.desc[locale as 'zh' | 'en']}
            </p>
          )}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16,
          }}>
            {group.themes.map(sig => {
              const isSelected = cardIsSelected(sig.theme);
              return (
                <button
                  key={sig.theme}
                  onClick={() => pickTheme(sig.theme)}
                  style={{
                    border: 'none', background: 'transparent', padding: 0,
                    cursor: 'pointer', textAlign: 'left', position: 'relative',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = isSelected ? 'scale(1.02)' : 'scale(1)'; }}
                >
                  <div style={{
                    borderRadius: 12,
                    border: isSelected ? '2px solid #1a1a2e' : '1px solid #e8e6dc',
                    overflow: 'hidden',
                    boxShadow: isSelected
                      ? '0 8px 24px rgba(0,0,0,0.12)'
                      : '0 2px 8px rgba(0,0,0,0.04)',
                  }}>
                    <StyleThumb signature={sig} locale={locale as 'zh' | 'en'} format={thumbFormat} />
                    <div style={{
                      padding: '10px 12px',
                      background: isSelected ? '#faf9f5' : '#fff',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>
                        {sig.name[locale as 'zh' | 'en']}
                      </div>
                      <div style={{
                        fontSize: 10, color: '#b0aea5', fontStyle: 'italic',
                        marginTop: 2,
                      }}>
                        {sig.philosophy[locale as 'zh' | 'en']}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Brand themes — slide surface only (reports per skill have no use for them) */}
      {showBrandThemes && (
      <div style={{ marginBottom: 40 }}>
        <h3 style={{
          fontSize: 13, fontWeight: 600, color: '#6b6a65',
          marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>{t('style.premium_section')} <span style={{ fontSize: 11, color: '#b0aea5' }}>(Pro)</span></h3>
        <p style={{
          fontSize: 12, color: '#8a8880', lineHeight: 1.5,
          marginTop: 0, marginBottom: 16,
        }}>
          {t('style.premium_desc')}
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16,
        }}>
          {BRAND_THEMES.map(sig => {
            const isSelected = cardIsSelected(sig.theme);
            return (
              <button
                key={sig.theme}
                onClick={() => pickTheme(sig.theme)}
                style={{
                  border: 'none', background: 'transparent', padding: 0,
                  cursor: 'pointer', textAlign: 'left', position: 'relative',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = isSelected ? 'scale(1.02)' : 'scale(1)'; }}
              >
                <div style={{
                  borderRadius: 12,
                  border: isSelected ? '2px solid #1a1a2e' : '1px solid #e8e6dc',
                  overflow: 'hidden',
                  boxShadow: isSelected
                    ? '0 8px 24px rgba(0,0,0,0.12)'
                    : '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                  <div style={{
                    position: 'absolute', top: 12, right: 12, zIndex: 1,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'rgba(26,26,46,0.9)', color: '#fff',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.03em',
                  }}>PRO</div>
                  <StyleThumb signature={sig} locale={locale as 'zh' | 'en'} format={thumbFormat} />
                  <div style={{
                    padding: '12px 16px',
                    background: isSelected ? '#faf9f5' : '#fff',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>
                        {sig.name[locale as 'zh' | 'en']}
                      </div>
                      <div style={{
                        fontSize: 10, color: '#b0aea5', fontStyle: 'italic',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        maxWidth: 140,
                      }}>
                        {sig.philosophy[locale as 'zh' | 'en']}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b6a65', marginTop: 4 }}>
                      {sig.desc[locale as 'zh' | 'en']}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Footer */}
      <div style={{
        position: 'sticky', bottom: 0, zIndex: 5,
        background: 'linear-gradient(rgba(250,249,245,0) 0%, rgba(250,249,245,1) 32%)',
        padding: '20px 0 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {onBack ? (
          <button onClick={onBack}
            style={{
              padding: '12px 20px', borderRadius: 12, border: 'none',
              background: 'transparent', color: '#6b6a65',
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#141413'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#6b6a65'; }}
          >{t('style.back')}</button>
        ) : <span />}
        <button
          onClick={onGenerate}
          disabled={disabled}
          style={{
            padding: '12px 32px', borderRadius: 14, border: 'none',
            background: disabled ? '#e8e6dc' : '#141413',
            color: disabled ? '#b0aea5' : '#faf9f5',
            fontSize: 15, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'var(--font-display-sans)', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#2c2b27'; }}
          onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = '#141413'; }}
        >
          <span style={{ fontSize: 18 }}>✦</span> {t('style.generate')}
        </button>
      </div>
    </div>
  );
}
