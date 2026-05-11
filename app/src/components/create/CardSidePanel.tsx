'use client';

// ============================================================================
// Lasca — CardSidePanel (card-canvas era)
// ============================================================================
// Layout picker for MdContextCards. Mirrors the editor's SlideToolbar:
//   • Layer 1 (Intent) — what this slide is ABOUT. Drives demands.pageLayouts
//     via onSetLayoutHint, the same field the AI generation pipeline reads.
//   • Layer 2 (Card layout) — power-user direct grid control. 6 base
//     structures × variant chips. Drives demands.pageCompositions via
//     onSetCompositionHint, which overrides pickComposition() at adapt time.
//
// Cover/section/back pages collapse to structural intents only — other
// intents would reshape into body-content layouts that contradict pageType.
// ============================================================================

import { useState } from 'react';
import {
  LAYOUT_REGISTRY,
  INTENT_GROUP_LABELS,
  layoutsGroupedByIntent,
  type Layout,
  type LayoutMeta,
} from '@/lib/types';
import type { PageType } from '@/lib/ai/harness/types';
import {
  COMPOSITION_REGISTRY,
  compositionsForPageType,
  getCompositionMeta,
} from '@/lib/cards/compositionRegistry';
import {
  STRUCTURE_BASES,
  baseForComposition,
  type StructureBase,
} from '@/lib/cards/structureBases';
import { CompositionThumb } from '@/components/ui/CompositionThumb';
import { LayoutThumb } from '@/components/ui/LayoutThumb';
import { useLocale, useT } from '@/lib/i18n';

interface CardSidePanelProps {
  /** User-picked semantic layout for this page (from demands.pageLayouts). */
  layoutHint?: Layout;
  /** User-picked composition variant (from demands.pageCompositions). */
  compositionHint?: string;
  /** Auto-inferred effective layout when no hint is set — drives soft highlight. */
  effectiveLayout?: Layout;
  pageType?: PageType;
  onSetLayoutHint: (layout: Layout | undefined) => void;
  onSetCompositionHint: (compositionId: string | undefined) => void;
  onClose: () => void;
}

export function CardSidePanel({
  layoutHint, compositionHint, effectiveLayout, pageType,
  onSetLayoutHint, onSetCompositionHint, onClose,
}: CardSidePanelProps) {
  const locale = useLocale();
  const t = useT();
  const [structureOpen, setStructureOpen] = useState(false);

  const isAuto = !layoutHint && !compositionHint;

  // Cover/section/back pages should only show structural intents.
  const isContentPage = !pageType || pageType === 'content';
  const allIntentGroups = layoutsGroupedByIntent();
  const intentGroups = isContentPage
    ? allIntentGroups
    : allIntentGroups.filter(g => g.intent === 'structural');

  // Structure layer: filter variants by current pageType.
  const applicable = compositionsForPageType(pageType);
  const applicableSet = new Set(applicable.map(m => m.id));
  const visibleBases = STRUCTURE_BASES
    .map(b => ({
      base: b,
      variants: b.variants.filter(v => applicableSet.has(v.compositionId)),
    }))
    .filter(x => x.variants.length > 0);
  const currentBase = compositionHint
    ? baseForComposition(compositionHint)
    : undefined;

  // Status text — reflects whichever hint is set, or auto-inferred layout.
  const compLabel = compositionHint
    ? getCompositionMeta(compositionHint)?.label[locale]
    : undefined;
  const layoutLabel = layoutHint
    ? LAYOUT_REGISTRY.find(m => m.layout === layoutHint)?.label[locale]
    : undefined;
  const inferredLabel = effectiveLayout
    ? LAYOUT_REGISTRY.find(m => m.layout === effectiveLayout)?.label[locale]
    : undefined;
  const currentLabel = compLabel ?? layoutLabel ?? inferredLabel;

  const renderIntentTile = (meta: LayoutMeta) => {
    const isActive = meta.layout === layoutHint;
    return (
      <button
        key={meta.layout}
        onClick={() => onSetLayoutHint(meta.layout)}
        title={meta.hint?.[locale] ?? meta.label[locale]}
        style={{
          padding: '4px 4px 5px', borderRadius: 6,
          border: isActive ? '2px solid #d97757' : '1px solid #eae8e2',
          background: isActive ? '#fdf6f2' : '#fff',
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        }}
      >
        <LayoutThumb layout={meta.layout} active={isActive} size="sm" />
        <span style={{
          fontSize: 9,
          color: isActive ? '#d97757' : '#6b695e',
          fontWeight: isActive ? 600 : 400,
          fontFamily: 'inherit',
          lineHeight: 1.2,
        }}>{meta.label[locale]}</span>
      </button>
    );
  };

  const renderBaseTile = (b: StructureBase, variants: StructureBase['variants']) => {
    const baseActive = currentBase?.id === b.id;
    const showCompId = baseActive && compositionHint
      ? compositionHint
      : variants[0].compositionId;
    return (
      <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => onSetCompositionHint(showCompId)}
          title={b.label[locale]}
          style={{
            padding: '4px 4px 5px', borderRadius: 6,
            border: baseActive ? '2px solid #d97757' : '1px solid #eae8e2',
            background: baseActive ? '#fdf6f2' : '#fff',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          }}
        >
          <CompositionThumb compositionId={showCompId} active={baseActive} size="sm" />
          <span style={{
            fontSize: 9,
            color: baseActive ? '#d97757' : '#6b695e',
            fontWeight: baseActive ? 600 : 400,
            fontFamily: 'inherit',
            lineHeight: 1.2,
          }}>{b.label[locale]}</span>
        </button>
        {baseActive && variants.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
            {variants.map(v => {
              const chipActive = v.compositionId === compositionHint;
              return (
                <button
                  key={v.compositionId}
                  onClick={() => onSetCompositionHint(v.compositionId)}
                  title={v.hint?.[locale] ?? v.chip[locale]}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 4,
                    border: chipActive ? '1px solid #d97757' : '1px solid #e8e6dc',
                    background: chipActive ? '#fdf0e9' : '#fff',
                    color: chipActive ? '#d97757' : '#6b695e',
                    fontWeight: chipActive ? 600 : 400,
                    fontSize: 9,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    lineHeight: 1.3,
                  }}
                >{v.chip[locale]}</button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: '100%',
      height: '100%',
      background: '#fff', borderRadius: 12,
      border: '1px solid #e8e6dc',
      boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
      animation: 'sidePanelSlideIn 0.2s ease-out',
    }}>
      <div style={{
        flex: 1,
        padding: '8px 10px 8px', overflow: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header: label + Auto + close */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: '#b0aea5', fontWeight: 600 }}>{t('cardPanel.layout')}</span>
          <button
            onClick={() => { onSetLayoutHint(undefined); onSetCompositionHint(undefined); }}
            style={{
              padding: '1px 8px', borderRadius: 4,
              border: isAuto ? '1.5px solid #d97757' : '1px solid #e8e6dc',
              background: isAuto ? '#fdf0e9' : 'transparent',
              color: isAuto ? '#d97757' : '#6b6a65',
              fontSize: 10, fontWeight: isAuto ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >{t('cardPanel.auto')}</button>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#b0aea5', cursor: 'pointer', fontSize: 12, padding: '0 2px' }}
          >×</button>
        </div>

        {/* Current status line */}
        {currentLabel && (
          <div style={{
            fontSize: 10, color: isAuto ? '#b07a55' : '#d97757',
            marginBottom: 8, lineHeight: 1.3,
          }}>
            <span style={{ color: '#b0aea5' }}>{locale === 'zh' ? '当前: ' : 'Current: '}</span>
            <span style={{ fontWeight: 600 }}>{currentLabel}</span>
            <span style={{ color: '#b0aea5' }}>
              {' · '}
              {isAuto ? (locale === 'zh' ? '自动' : 'auto') : (locale === 'zh' ? '已选' : 'picked')}
            </span>
          </div>
        )}

        {/* === Layer 1: Intent === */}
        <div style={{ fontSize: 9, color: '#a8a59c', marginBottom: 4, paddingLeft: 2, letterSpacing: '0.02em' }}>
          {locale === 'zh' ? '这页要表达什么' : 'What this slide is about'}
        </div>
        {intentGroups.map(({ intent, items }, gi) => (
          <div key={intent}>
            {gi > 0 && (
              <div style={{ height: 1, background: '#eae8e2', opacity: 0.5, margin: '6px 0' }} />
            )}
            <div style={{ fontSize: 9, color: '#b0aea5', marginBottom: 3, paddingLeft: 2 }}>
              {INTENT_GROUP_LABELS[intent][locale]}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
              gap: 4,
            }}>
              {items.map(renderIntentTile)}
            </div>
          </div>
        ))}

        {/* === Layer 2: Card layout (collapsible) === */}
        {visibleBases.length > 0 && (
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #eae8e2' }}>
            <button
              onClick={() => setStructureOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', border: 'none',
                color: '#8a8880', fontSize: 10,
                cursor: 'pointer', padding: 2, fontFamily: 'inherit',
                letterSpacing: '0.02em',
              }}
            >
              <span style={{
                display: 'inline-block',
                transform: structureOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s', fontSize: 8,
              }}>▶</span>
              {locale === 'zh' ? '卡片布局（直接控制网格）' : 'Card layout (advanced)'}
            </button>
            {structureOpen && (
              <div style={{
                marginTop: 6,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
                gap: 6,
              }}>
                {visibleBases.map(({ base, variants }) => renderBaseTile(base, variants))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dev-time: keep COMPOSITION_REGISTRY referenced so tree-shake doesn't
          strip registry-side sanity warnings. */}
      {false && <span data-registry-count={COMPOSITION_REGISTRY.length} />}
    </div>
  );
}
