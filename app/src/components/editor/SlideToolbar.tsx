'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '@/lib/store';
import { swapLayout, extractGenericContent, type GenericContent } from '@/lib/layoutSwap';
import {
  LAYOUT_REGISTRY,
  INTENT_GROUP_LABELS,
  layoutsGroupedByIntent,
  type Layout,
  type LayoutMeta,
} from '@/lib/types';
import { LayoutThumb } from '@/components/ui/LayoutThumb';
import { CompositionThumb } from '@/components/ui/CompositionThumb';
import { useLocale, useT } from '@/lib/i18n';
import { compositionsForPageType, getCompositionMeta } from '@/lib/cards/compositionRegistry';
import { STRUCTURE_BASES, baseForComposition, type StructureBase } from '@/lib/cards/structureBases';
import { swapComposition } from '@/lib/cards/swap';
import { maybeAdaptToCardCanvas } from '@/lib/cards/adapt';
import type { CardCanvasData } from '@/lib/cards/types';
import { inferPageType } from '@/lib/pageTypes';


// LayoutThumb imported from @/components/ui/LayoutThumb

// Derived from LAYOUT_REGISTRY — add new layouts there, they appear here automatically.
const CHART_DIAGRAM_LAYOUTS = LAYOUT_REGISTRY.filter(m => m.category === 'chart' || m.category === 'diagram');

const QUICK_ACTION_KEYS = [
  { labelKey: 'slideToolbar.restyle', msgKey: 'slideToolbar.restyle_msg' },
  { labelKey: 'slideToolbar.shorten', msgKey: 'slideToolbar.shorten_msg' },
  { labelKey: 'slideToolbar.expand', msgKey: 'slideToolbar.expand_msg' },
  { labelKey: 'slideToolbar.polish', msgKey: 'slideToolbar.polish_msg' },
];

// ---------------------------------------------------------------------------
// Button icons
// ---------------------------------------------------------------------------

function GridIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="1" width="5" height="5" rx="0.8" />
      <rect x="8" y="1" width="5" height="5" rx="0.8" />
      <rect x="1" y="8" width="5" height="5" rx="0.8" />
      <rect x="8" y="8" width="5" height="5" rx="0.8" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1.5" y="8" width="2.5" height="4.5" rx="0.5" />
      <rect x="5.75" y="4.5" width="2.5" height="8" rx="0.5" />
      <rect x="10" y="1.5" width="2.5" height="11" rx="0.5" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <path d="M7 0.5L8.2 5.2L13 6.5L8.2 7.8L7 12.5L5.8 7.8L1 6.5L5.8 5.2Z" />
      <path d="M11 0.5L11.5 2.5L13.5 3L11.5 3.5L11 5.5L10.5 3.5L8.5 3L10.5 2.5Z" opacity="0.5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 6h9M7 2.5L10.5 6 7 9.5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SlideToolbarProps {
  pageIndex: number;
  currentLayout: string;
  loading: boolean;
}

export function SlideToolbar({ pageIndex, currentLayout, loading }: SlideToolbarProps) {
  const locale = useLocale();
  const t = useT();
  const QUICK_ACTIONS = QUICK_ACTION_KEYS.map(k => ({ label: t(k.labelKey), message: t(k.msgKey) }));
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  // Structure (Card layout) section is collapsed by default — Intent layer is
  // the primary affordance; users only open structure when they want direct
  // grid control.
  const [structureOpen, setStructureOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);
  const updateSlide = useEditorStore(s => s.updateSlide);
  // Derive original layout from _preSwapLayout stashed on slide data (for ↩ marker)
  const origLayout = useEditorStore(s => {
    const deck = s.activeDeck();
    const d = deck.slides[pageIndex]?.data as Record<string, unknown> | undefined;
    return (d?._preSwapLayout as Layout) || (currentLayout as Layout);
  });

  // Hide on faithful layouts (no native layout to switch to)
  const isFaithful = currentLayout === 'pptx-faithful' || currentLayout === 'pdf-faithful';
  const isReport = currentLayout.startsWith('report-');
  // NOTE: early return moved BELOW all hooks to satisfy Rules of Hooks

  const closeAll = useCallback(() => {
    setLayoutOpen(false);
    setChartOpen(false);
    setAiOpen(false);
    setAiInput('');
  }, []);

  // Close on ESC
  useEffect(() => {
    if (!layoutOpen && !chartOpen && !aiOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [layoutOpen, chartOpen, aiOpen, closeAll]);

  // Dispatch edit request via custom event (ChatPanel listens)
  const dispatchEdit = useCallback((message: string) => {
    window.dispatchEvent(
      new CustomEvent('lasca:edit-slide', {
        detail: { message, pageIndex },
      }),
    );
    closeAll();
  }, [pageIndex, closeAll]);

  // Chart/diagram layout set — used to decide client-side swap vs AI-mediated conversion
  const CHART_LAYOUT_SET = new Set(CHART_DIAGRAM_LAYOUTS.map(c => c.layout));
  const isChartLayout = (l: string) => CHART_LAYOUT_SET.has(l as Layout);

  // Direct layout swap — no LLM, instant.
  // Exception: text→chart conversions need AI to generate meaningful numeric data.
  // _preSwapLayout / _preSwapData are stashed on the slide object itself.
  const handleLayoutSwap = useCallback((targetLayout: Layout) => {
    if (targetLayout === currentLayout) { setLayoutOpen(false); setChartOpen(false); return; }

    // Text→chart: start multi-turn conversation in ChatPanel
    if (isChartLayout(targetLayout) && !isChartLayout(currentLayout)) {
      const chartLabel = CHART_DIAGRAM_LAYOUTS.find(c => c.layout === targetLayout)?.label[locale] || targetLayout;
      window.dispatchEvent(new CustomEvent('lasca:chart-convert', {
        detail: { chartLayout: targetLayout, chartLabel, pageIndex },
      }));
      closeAll();
      return;
    }
    const state = useEditorStore.getState();
    const deck = state.decks.find(d => d.id === state.activeDeckId);
    if (!deck) return;
    const slide = deck.slides[pageIndex];
    if (!slide) return;

    const data = slide.data as Record<string, unknown>;

    // The stashed original (from the very first swap) — used for the ↩ marker
    const stashedLayout = data._preSwapLayout as Layout | undefined;
    const stashedData = data._preSwapData as Record<string, unknown> | undefined;
    // Lossless content snapshot — survives round-trips through narrow layouts
    const savedContent = data._savedContent as GenericContent | undefined;

    // Strip internal markers before extracting
    const cleanCurrent = { ...data };
    delete cleanCurrent._preSwapLayout;
    delete cleanCurrent._preSwapData;
    delete cleanCurrent._savedContent;

    // Extract full GenericContent from current data — this is the lossless snapshot
    const currentGeneric = extractGenericContent(cleanCurrent, slide.layout as Layout);
    // Merge with any previously saved content to recover text lost in narrow layouts
    const mergedGeneric: GenericContent = savedContent
      ? {
          title:    currentGeneric.title    || savedContent.title    || '',
          subtitle: currentGeneric.subtitle || savedContent.subtitle || '',
          body:     currentGeneric.body.length >= (savedContent.body?.length ?? 0)
                      ? currentGeneric.body : savedContent.body || '',
          items:    currentGeneric.items.length >= (savedContent.items?.length ?? 0)
                      ? currentGeneric.items : savedContent.items || [],
          footnote: currentGeneric.footnote || savedContent.footnote || '',
          imageUrl: currentGeneric.imageUrl || savedContent.imageUrl || '',
        }
      : currentGeneric;

    let newData: Record<string, unknown>;
    if (stashedLayout && targetLayout === stashedLayout) {
      // Going back to original layout
      newData = swapLayout(cleanCurrent, slide.layout as Layout, targetLayout, mergedGeneric);
    } else {
      // Forward swap
      newData = swapLayout(cleanCurrent, slide.layout as Layout, targetLayout, mergedGeneric);
      newData._preSwapLayout = stashedLayout || (slide.layout as Layout);
      newData._preSwapData = stashedData || cleanCurrent;
    }
    // Save the lossless snapshot only on the FIRST swap — never update it afterward.
    // This prevents phantom padding items ("04", "...") from intermediate layouts
    // from accumulating into the saved content.
    newData._savedContent = savedContent || currentGeneric;

    updateSlide(pageIndex, { ...slide, layout: targetLayout, data: newData });
    setLayoutOpen(false);
    setChartOpen(false);
  }, [pageIndex, currentLayout, updateSlide]);

  // Card-canvas composition swap — for already-card-canvas slides we rewrite
  // the compositionId in place; legacy slides are adapted through the
  // adapter with a compositionHint override.
  const handleCompositionSwap = useCallback((targetCompositionId: string) => {
    const state = useEditorStore.getState();
    const deck = state.decks.find(d => d.id === state.activeDeckId);
    if (!deck) return;
    const slide = deck.slides[pageIndex];
    if (!slide) return;

    if (slide.layout === 'card-canvas') {
      const data = slide.data as CardCanvasData;
      if (data.compositionId === targetCompositionId) { setLayoutOpen(false); return; }
      const swapped = swapComposition(data, targetCompositionId);
      updateSlide(pageIndex, { ...slide, data: swapped as unknown as Record<string, unknown> });
    } else {
      // Legacy slide → adapt with hint (adapter handles all 25 legacy layouts).
      const adapted = maybeAdaptToCardCanvas(slide, targetCompositionId);
      updateSlide(pageIndex, adapted);
    }
    setLayoutOpen(false);
  }, [pageIndex, updateSlide]);

  // Resolve the currently-rendered compositionId (for active-highlight in popover).
  const currentCompositionId = useEditorStore(s => {
    const deck = s.activeDeck();
    const slide = deck.slides[pageIndex];
    if (!slide || slide.layout !== 'card-canvas') return undefined;
    return (slide.data as CardCanvasData).compositionId;
  });

  // Current slide's pageType — drives Layout panel's per-type filter. Falls
  // back to inferPageType() for legacy decks without an explicit pageType
  // (infers from layout + position: cover at idx 0, back at last, else content).
  const currentPageType = useEditorStore(s => {
    const deck = s.activeDeck();
    const slide = deck.slides[pageIndex];
    if (!slide) return undefined;
    return inferPageType(slide, pageIndex, deck.slides.length);
  });

  const handleAiSubmit = () => {
    const text = aiInput.trim();
    if (!text) return;
    dispatchEdit(text);
  };

  const handleAiKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSubmit();
    }
  };

  // Focus textarea when AI popover opens
  useEffect(() => {
    if (aiOpen) {
      setTimeout(() => aiInputRef.current?.focus(), 50);
    }
  }, [aiOpen]);

  // Compute fixed panel position from rootRef (avoids parent overflow clipping).
  // Clamp top so the panel never extends below the viewport.
  const [panelRect, setPanelRect] = useState<{ top: number; left: number } | null>(null);
  const updatePanelRect = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const naturalTop = r.bottom + 6;
    const viewH = window.innerHeight;
    // Reserve enough room for the tallest panel (~520px for layout grid)
    const clampedTop = Math.min(naturalTop, viewH - 520);
    setPanelRect({ top: Math.max(8, clampedTop), left: r.left });
  }, []);

  const openPanel = useCallback((which: 'layout' | 'chart' | 'ai') => {
    updatePanelRect();
    setLayoutOpen(which === 'layout' ? (v: boolean) => !v : false);
    setChartOpen(which === 'chart' ? (v: boolean) => !v : false);
    setAiOpen(which === 'ai' ? (v: boolean) => !v : false);
  }, [updatePanelRect]);

  // Early return AFTER all hooks — faithful/report layouts have no toolbar
  if (isFaithful || isReport) return null;

  const btnStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.85)',
    backdropFilter: 'blur(4px)',
    border: '1px solid #e8e6dc',
    borderRadius: 6,
    cursor: loading ? 'default' : 'pointer',
    color: '#8a8880',
    transition: 'opacity 0.15s, color 0.15s, border-color 0.15s',
    padding: 0,
    fontFamily: 'inherit',
  };

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: panelRect?.top ?? 44,
    left: panelRect?.left ?? 16,
    background: '#faf9f5',
    border: '1px solid #e8e6dc',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.04)',
    padding: 12,
    zIndex: 101,
    overflowY: 'visible' as const,
  };

  const thumbBtnBase: React.CSSProperties = {
    padding: 6,
    borderRadius: 8,
    border: '1px solid #eae8e2',
    background: '#fff',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    transition: 'all 0.15s ease-out',
  };

  return (
    <>
      {/* Hover style for thumbnail buttons */}
      <style>{`
        .lasca-thumb-btn:hover:not(.lasca-thumb-active) {
          background: #f5f3ee !important;
          border-color: #d4d1c8 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .lasca-thumb-btn:active {
          transform: translateY(0) !important;
        }
      `}</style>

      {/* Backdrop — click anywhere outside to close popovers */}
      {(layoutOpen || chartOpen || aiOpen) && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          onMouseDown={closeAll}
        />
      )}

      <div
        ref={rootRef}
        className={`lasca-canvas-corner${(layoutOpen || chartOpen || aiOpen) ? ' is-active' : ''}`}
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 100,
          opacity: loading ? 0.4 : undefined,
          pointerEvents: loading ? 'none' : undefined,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* --- Icon buttons --- */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            style={{
              ...btnStyle,
              borderColor: layoutOpen ? '#d97757' : '#e8e6dc',
              color: layoutOpen ? '#d97757' : '#8a8880',
            }}
            title={t('slideToolbar.change_layout')}
            onClick={() => openPanel('layout')}
          >
            <GridIcon />
          </button>
          <button
            style={{
              ...btnStyle,
              borderColor: chartOpen ? '#d97757' : '#e8e6dc',
              color: chartOpen ? '#d97757' : '#8a8880',
            }}
            title={t('slideToolbar.charts')}
            onClick={() => openPanel('chart')}
          >
            <ChartIcon />
          </button>
          <button
            style={{
              ...btnStyle,
              borderColor: aiOpen ? '#d97757' : '#e8e6dc',
              color: aiOpen ? '#d97757' : '#8a8880',
            }}
            title={t('slideToolbar.ai_edit')}
            onClick={() => openPanel('ai')}
          >
            <SparkleIcon />
          </button>
        </div>

        {/* --- Layout picker: two layers (Intent + Card layout) --- */}
        {layoutOpen && (() => {
          // Layer 1 (Intent) — what the slide is ABOUT. Routes through
          // handleLayoutSwap, the same path used by chart picker, generation,
          // and AI edits. Layer 2 (Card layout) — power-user direct grid
          // control, 6 base structures × variant chips. Routes through
          // handleCompositionSwap.
          const isContentPage = !currentPageType || currentPageType === 'content';
          const allIntentGroups = layoutsGroupedByIntent();
          // For cover/section/back pages only structural intents apply; the
          // other intent groups would reshape the slide into a body-content
          // layout that contradicts the structural pageType.
          const intentGroups = isContentPage
            ? allIntentGroups
            : allIntentGroups.filter(g => g.intent === 'structural');

          // Highlight the intent tile that matches the slide's semantic layout.
          // For card-canvas slides we take origLayout (the pre-swap snapshot).
          const activeIntentLayout: Layout | undefined =
            origLayout && origLayout !== 'card-canvas' ? origLayout : undefined;

          // Structure layer: filter variants by current pageType so cover/
          // section pages only expose compositions they support.
          const applicable = compositionsForPageType(currentPageType);
          const applicableSet = new Set(applicable.map(m => m.id));
          const visibleBases = STRUCTURE_BASES
            .map(b => ({
              base: b,
              variants: b.variants.filter(v => applicableSet.has(v.compositionId)),
            }))
            .filter(x => x.variants.length > 0);
          const currentBase = currentCompositionId
            ? baseForComposition(currentCompositionId)
            : undefined;

          const renderIntentTile = (meta: LayoutMeta) => {
            const isActive = meta.layout === activeIntentLayout;
            return (
              <button
                key={meta.layout}
                className={`lasca-thumb-btn${isActive ? ' lasca-thumb-active' : ''}`}
                onClick={() => handleLayoutSwap(meta.layout)}
                title={meta.hint?.[locale] ?? meta.label[locale]}
                style={{
                  ...thumbBtnBase,
                  border: isActive ? '2px solid #d97757' : '1px solid #eae8e2',
                  background: isActive ? '#fdf6f2' : '#fff',
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
            const showCompId = baseActive && currentCompositionId
              ? currentCompositionId
              : variants[0].compositionId;
            return (
              <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  className={`lasca-thumb-btn${baseActive ? ' lasca-thumb-active' : ''}`}
                  onClick={() => handleCompositionSwap(showCompId)}
                  title={b.label[locale]}
                  style={{
                    ...thumbBtnBase,
                    border: baseActive ? '2px solid #d97757' : '1px solid #eae8e2',
                    background: baseActive ? '#fdf6f2' : '#fff',
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
                      const chipActive = v.compositionId === currentCompositionId;
                      return (
                        <button
                          key={v.compositionId}
                          onClick={() => handleCompositionSwap(v.compositionId)}
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
            <div style={{ ...panelStyle, width: 'min(640px, calc(100vw - 32px))', maxHeight: '78vh', overflowY: 'auto' }}>
              {/* === Layer 1: Intent === */}
              <div style={{ fontSize: 10, color: '#8a8880', marginBottom: 8, paddingLeft: 2, fontFamily: 'inherit', letterSpacing: '0.02em' }}>
                {locale === 'zh' ? '这页要表达什么' : 'What this slide is about'}
              </div>
              {intentGroups.map(({ intent, items }, gi) => (
                <div key={intent}>
                  {gi > 0 && (
                    <div style={{ height: 1, background: '#eae8e2', opacity: 0.5, margin: '8px 0' }} />
                  )}
                  <div style={{ fontSize: 9, color: '#a8a59c', marginBottom: 4, paddingLeft: 2, fontFamily: 'inherit' }}>
                    {INTENT_GROUP_LABELS[intent][locale]}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                    gap: 6,
                  }}>
                    {items.map(renderIntentTile)}
                  </div>
                </div>
              ))}

              {/* === Layer 2: Card layout (collapsible) === */}
              {visibleBases.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #eae8e2' }}>
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
                      marginTop: 8,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))',
                      gap: 8,
                    }}>
                      {visibleBases.map(({ base, variants }) => renderBaseTile(base, variants))}
                    </div>
                  )}
                </div>
              )}

              {/* Restore original — shown when the slide has a pre-swap snapshot
                  whose origin layout is a legacy semantic layout (not a composition). */}
              {origLayout && origLayout !== currentLayout && !getCompositionMeta(origLayout) && (
                <div style={{ marginTop: 8, paddingTop: 10, borderTop: '1px solid #eae8e2' }}>
                  <button
                    onClick={() => handleLayoutSwap(origLayout)}
                    style={{
                      padding: '5px 10px', borderRadius: 6,
                      border: '1.5px dashed #b0aea5', background: '#fff',
                      fontSize: 10, color: '#6b695e',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >↩ {LAYOUT_REGISTRY.find(m => m.layout === origLayout)?.label[locale] ?? origLayout}</button>
                </div>
              )}
            </div>
          );
        })()}

        {/* --- Chart/Diagram picker --- */}
        {chartOpen && (
          <div style={{ ...panelStyle, width: 380 }}>
            <div style={{ fontSize: 10, color: '#8a8880', marginBottom: 8, paddingLeft: 2, fontFamily: 'inherit', letterSpacing: '0.02em' }}>{t('slideToolbar.charts_diagrams')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {CHART_DIAGRAM_LAYOUTS.map(({ layout, label }) => {
                const isActive = layout === currentLayout;
                return (
                  <button
                    key={layout}
                    className={`lasca-thumb-btn${isActive ? ' lasca-thumb-active' : ''}`}
                    onClick={() => handleLayoutSwap(layout)}
                    title={label[locale]}
                    style={{
                      ...thumbBtnBase,
                      border: isActive ? '2px solid #d97757' : '1px solid #eae8e2',
                      background: isActive ? '#fdf6f2' : '#fff',
                    }}
                  >
                    <LayoutThumb layout={layout} active={isActive} />
                    <span style={{
                      fontSize: 10,
                      color: isActive ? '#d97757' : '#6b695e',
                      fontWeight: isActive ? 600 : 400,
                      fontFamily: 'inherit',
                      lineHeight: 1.2,
                    }}>
                      {label[locale]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* --- AI edit popover --- */}
        {aiOpen && (
          <div style={{ ...panelStyle, width: 380 }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <textarea
                ref={aiInputRef}
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={handleAiKeyDown}
                placeholder={t('slideToolbar.edit_placeholder')}
                rows={2}
                style={{
                  flex: 1,
                  resize: 'none',
                  border: '1px solid #e8e6dc',
                  borderRadius: 8,
                  padding: '6px 8px',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  lineHeight: 1.5,
                  outline: 'none',
                  color: '#141413',
                  background: '#faf9f5',
                }}
              />
              <button
                onClick={handleAiSubmit}
                disabled={!aiInput.trim()}
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  alignSelf: 'flex-end',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: aiInput.trim() ? '#d97757' : '#e8e6dc',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: aiInput.trim() ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                  padding: 0,
                }}
              >
                <ArrowIcon />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {QUICK_ACTIONS.map(({ label, message }) => (
                <button
                  key={label}
                  onClick={() => dispatchEdit(message)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid #e8e6dc',
                    background: '#f5f4ef',
                    fontSize: 11,
                    color: '#5a5852',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#ede9e1'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#f5f4ef'; }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
