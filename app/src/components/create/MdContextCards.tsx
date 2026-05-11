'use client';

import { useState, useCallback, useMemo } from 'react';
import { useT, useLocale } from '@/lib/i18n';
import { inferLayout } from '@/lib/ai/harness/inferLayout';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import type { MdContext, MdContextPage, MdContextWarning, PageType } from '@/lib/ai/harness/types';
import { type Layout } from '@/lib/types';
import { MdContextCard, PAGE_TYPE_CONFIG } from './MdContextCard';
import { CardSidePanel } from './CardSidePanel';
import { OutlineChat } from './OutlineChat';
import { addToast } from '@/lib/toast';
import { detectLayoutMismatch } from '@/lib/ai/harness/layoutRules';

/** Remap a Record<number, T> when an item moves, is inserted, or is deleted */
function remapHints<T>(hints: Record<number, T>, op: 'move' | 'delete' | 'insert', idx: number, toIdx?: number): Record<number, T> {
  const out: Record<number, T> = {};
  for (const [key, val] of Object.entries(hints)) {
    const k = Number(key);
    if (op === 'delete') {
      if (k === idx) continue;
      out[k > idx ? k - 1 : k] = val;
    } else if (op === 'insert') {
      out[k > idx ? k + 1 : k] = val;
    } else if (op === 'move' && toIdx !== undefined) {
      let n: number;
      if (k === idx) n = toIdx;
      else if (idx < toIdx && k > idx && k <= toIdx) n = k - 1;
      else if (idx > toIdx && k >= toIdx && k < idx) n = k + 1;
      else n = k;
      out[n] = val;
    }
  }
  return out;
}

interface MdContextCardsProps {
  mdContext: MdContext;
  onUpdate: (updated: MdContext) => void;
  onContinue: () => void;
  /** @deprecated — use onContinue */
  onGenerate?: () => void;
  disabled?: boolean;
  answers?: Record<string, string | number | (string | number)[]>;
  onBack?: () => void;
}

export function MdContextCards({ mdContext, onUpdate, onContinue, onGenerate, disabled, answers, onBack }: MdContextCardsProps) {
  const t = useT();
  const locale = useLocale();
  const handleProceed = onContinue || onGenerate || (() => {});
  // Target page count from the length selector (hard constraint)
  const targetPageCount = answers?.length ? Number(answers.length) : null;
  // Default to first card expanded only — the full list of expanded cards is
  // overwhelming on first view (Step 4 UX echo of Step 1's progressive
  // disclosure). Users click to expand any card they want to inspect or edit.
  // Defensive: tolerate mdContext.pages being absent if a caller bypassed
  // the SSE-side isValidMdContext guard.
  const [expandedSet, setExpandedSet] = useState<Set<number>>(() => new Set((mdContext.pages?.length ?? 0) > 0 ? [0] : []));
  const [hoverGap, setHoverGap] = useState<number | null>(null);
  // Which card has its side panel open (null = all closed)
  const [openPanel, setOpenPanel] = useState<number | null>(null);
  // Layout mismatch modal state
  const [pendingLayoutChange, setPendingLayoutChange] = useState<{
    idx: number; layout: Layout | undefined; mismatch: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const pages = Array.isArray(mdContext.pages) ? mdContext.pages : [];
  const demands = (mdContext.demands ?? {}) as MdContext['demands'];
  const layoutHints = demands.pageLayouts ?? {};
  const chartHints = demands.pageCharts ?? {};
  const compositionHints = demands.pageCompositions ?? {};
  const warnings = mdContext.reviewWarnings ?? [];

  // Mirror the backend layout decision per page so the side panel can show
  // "what will actually render here" — user hint > LLM hint > inferred.
  // Diversity tracker walks the deck so inferred picks match what mdContextToOutline
  // produces at generation time. Pure JS, recomputes only when inputs change.
  const effectiveLayouts = useMemo(() => {
    const usedRecently: Layout[] = [];
    const push = (l: Layout) => {
      usedRecently.push(l);
      if (usedRecently.length > 2) usedRecently.shift();
    };
    return pages.map((page, i) => {
      const userHint = (layoutHints as Record<number, Layout>)[i];
      if (userHint) { push(userHint); return userHint; }
      const inferred = inferLayout(
        page, i, pages.length,
        mdContext.contentSignals,
        [], undefined, usedRecently,
      );
      push(inferred);
      return inferred;
    });
  }, [pages, layoutHints, mdContext.contentSignals]);

  const warningForPage = (idx: number): string | undefined => {
    const w = warnings.find((w: MdContextWarning) => w.pageIndex === idx);
    return w?.message;
  };

  const updateDemands = useCallback((
    newPages: MdContextPage[],
    newLayouts?: Record<number, Layout>,
    newCharts?: Record<number, Layout>,
  ) => {
    onUpdate({
      ...mdContext,
      pages: newPages,
      demands: {
        ...mdContext.demands,
        pageLayouts: newLayouts ?? mdContext.demands.pageLayouts,
        pageCharts: newCharts ?? mdContext.demands.pageCharts,
      },
      frontmatter: { ...mdContext.frontmatter, pageCount: newPages.length },
    });
  }, [mdContext, onUpdate]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = pages.findIndex((_, i) => `card-${i}` === active.id);
    const newIdx = pages.findIndex((_, i) => `card-${i}` === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const newPages = arrayMove([...pages], oldIdx, newIdx);
    const newLayouts = remapHints(layoutHints, 'move', oldIdx, newIdx);
    const newCharts = remapHints(chartHints, 'move', oldIdx, newIdx);

    setExpandedSet(prev => {
      const next = new Set<number>();
      prev.forEach(i => {
        if (i === oldIdx) next.add(newIdx);
        else if (oldIdx < newIdx && i > oldIdx && i <= newIdx) next.add(i - 1);
        else if (oldIdx > newIdx && i >= newIdx && i < oldIdx) next.add(i + 1);
        else next.add(i);
      });
      return next;
    });
    // Remap openPanel
    if (openPanel !== null) {
      if (openPanel === oldIdx) setOpenPanel(newIdx);
      else if (oldIdx < newIdx && openPanel > oldIdx && openPanel <= newIdx) setOpenPanel(openPanel - 1);
      else if (oldIdx > newIdx && openPanel >= newIdx && openPanel < oldIdx) setOpenPanel(openPanel + 1);
    }
    updateDemands(newPages, newLayouts, newCharts);
  }, [pages, layoutHints, chartHints, updateDemands, openPanel]);

  const handleUpdatePage = useCallback((idx: number, updated: MdContextPage) => {
    const newPages = [...pages];
    newPages[idx] = updated;
    updateDemands(newPages);
  }, [pages, updateDemands]);

  const handleDelete = useCallback((idx: number) => {
    if (pages.length <= 1) return;
    if (targetPageCount && pages.length <= targetPageCount) {
      addToast('warn', locale === 'zh'
        ? `目标页数为 ${targetPageCount} 页，删除后将少于目标`
        : `Target is ${targetPageCount} pages — deleting will go below target`);
    }
    const newPages = pages.filter((_, i) => i !== idx);
    const newLayouts = remapHints(layoutHints, 'delete', idx);
    const newCharts = remapHints(chartHints, 'delete', idx);
    setExpandedSet(prev => {
      const next = new Set<number>();
      prev.forEach(i => { if (i !== idx) next.add(i > idx ? i - 1 : i); });
      return next;
    });
    if (openPanel !== null) {
      if (openPanel === idx) setOpenPanel(null);
      else if (openPanel > idx) setOpenPanel(openPanel - 1);
    }
    updateDemands(newPages, newLayouts, newCharts);
  }, [pages, layoutHints, chartHints, updateDemands, openPanel, targetPageCount, locale]);

  const handleInsert = useCallback((afterIdx: number, pageType?: PageType) => {
    if (targetPageCount && pages.length >= targetPageCount) {
      addToast('warn', locale === 'zh'
        ? `目标页数为 ${targetPageCount} 页，已达到上限`
        : `Target is ${targetPageCount} pages — already at limit`);
      return;
    }
    const defaultTitleKeys: Partial<Record<PageType, string>> = {
      cover: 'mdCards.pageType.cover',
      section: 'mdCards.pageType.section',
      back: 'mdCards.pageType.back',
    };
    const newPage: MdContextPage = {
      title: (pageType && defaultTitleKeys[pageType] ? t(defaultTitleKeys[pageType]!) : '') || t('mdCards.new_page'),
      corePoint: '', body: '', pageType,
    };
    const newPages = [...pages];
    newPages.splice(afterIdx + 1, 0, newPage);
    const newLayouts = remapHints(layoutHints, 'insert', afterIdx);
    const newCharts = remapHints(chartHints, 'insert', afterIdx);
    setExpandedSet(prev => {
      const next = new Set<number>();
      prev.forEach(i => next.add(i > afterIdx ? i + 1 : i));
      next.add(afterIdx + 1);
      return next;
    });
    if (openPanel !== null && openPanel > afterIdx) setOpenPanel(openPanel + 1);
    updateDemands(newPages, newLayouts, newCharts);
  }, [pages, layoutHints, chartHints, updateDemands, openPanel, t, targetPageCount, locale]);

  const handleSetLayoutHint = useCallback((idx: number, layout: Layout | undefined) => {
    const page = pages[idx];
    const mismatch = layout ? detectLayoutMismatch(page, layout) : null;

    if (mismatch) {
      setPendingLayoutChange({ idx, layout, mismatch });
    } else {
      const newHints = { ...(mdContext.demands.pageLayouts ?? {}) };
      if (layout) newHints[idx] = layout; else delete newHints[idx];
      onUpdate({ ...mdContext, demands: { ...mdContext.demands, pageLayouts: newHints } });
    }
  }, [pages, mdContext, onUpdate]);

  const handleSetCompositionHint = useCallback((idx: number, compositionId: string | undefined) => {
    const newHints = { ...(mdContext.demands.pageCompositions ?? {}) };
    if (compositionId) newHints[idx] = compositionId; else delete newHints[idx];
    onUpdate({ ...mdContext, demands: { ...mdContext.demands, pageCompositions: newHints } });
  }, [mdContext, onUpdate]);

  const toggleExpand = useCallback((idx: number) => {
    setExpandedSet(prev => { const n = new Set(prev); if (n.has(idx)) n.delete(idx); else n.add(idx); return n; });
  }, []);
  const togglePanel = useCallback((idx: number) => {
    setOpenPanel(prev => prev === idx ? null : idx);
  }, []);
  const expandAll = () => setExpandedSet(new Set(pages.map((_, i) => i)));
  const collapseAll = () => setExpandedSet(new Set());

  const handleChatUpdateDeck = useCallback((newPages: MdContextPage[], _summary: string) => {
    updateDemands(newPages);
    setExpandedSet(new Set(newPages.map((_, i) => i)));
  }, [updateDemands]);

  const [chatOpen, setChatOpen] = useState(true);
  const scrollToCard = useCallback((idx: number) => {
    document.getElementById(`outline-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Validation
  const invalidIndices = pages
    .map((p, i) => (!p.title.trim() || !p.corePoint.trim()) ? i : -1)
    .filter(i => i !== -1);
  const hasValidationErrors = invalidIndices.length > 0;

  const handleContinueClick = useCallback(() => {
    if (hasValidationErrors) {
      const first = invalidIndices[0];
      setExpandedSet(prev => new Set([...prev, first]));
      setTimeout(() => document.getElementById(`outline-card-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    handleProceed();
  }, [hasValidationErrors, invalidIndices, handleProceed]);

  // Defense-in-depth: if mdContext.pages somehow arrives empty/non-array
  // here (the SSE-side guard should have caught it), don't crash — show
  // an empty-state with a Back affordance so the user can return to the
  // outline step without losing context.
  if (pages.length === 0) {
    return (
      <div style={{ width: '100%', maxWidth: 800, margin: '0 auto', padding: '40px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#7a766f', marginBottom: 16 }}>{t('mdCards.empty_state')}</div>
        {onBack && (
          <button
            onClick={onBack}
            style={{ padding: '10px 20px', fontSize: 14, fontWeight: 600, background: '#fff', color: '#3a3935', border: '1px solid #d6d3cd', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {t('common.back')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: '100%', maxWidth: 800, margin: '0 auto',
      position: 'relative',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#141413' }}>{t('mdCards.content_outline')}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={expandAll} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e8e6dc', background: '#fff', color: '#6b6a65', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t('mdCards.expand_all')}</button>
          <button onClick={collapseAll} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e8e6dc', background: '#fff', color: '#6b6a65', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>{t('mdCards.collapse_all')}</button>
        </div>
      </div>

      {/* Answer summary bar */}
      {answers && Object.keys(answers).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {answers.audience && (
            <span style={{ fontSize: 12, color: '#6b6a65', background: '#f5f4f0', padding: '3px 10px', borderRadius: 8 }}>
              {t('mdCards.audience')}: {answers.audience === 'boss' ? t('mdCards.audience.boss') : answers.audience === 'all-hands' ? t('mdCards.audience.all_hands') : answers.audience === 'client' ? t('mdCards.audience.client') : answers.audience === 'investor' ? t('mdCards.audience.investor') : String(answers.audience)}
            </span>
          )}
          {answers.length && (
            <span style={{ fontSize: 12, color: '#6b6a65', background: '#f5f4f0', padding: '3px 10px', borderRadius: 8 }}>{t('mdCards.page_count', { n: String(answers.length) })}</span>
          )}
        </div>
      )}

      {/* Interactive structure flow */}
      {pages.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12, padding: '8px 12px', borderRadius: 10, background: '#fff', border: '1px solid #e8e6dc' }}>
          <span style={{ fontSize: 11, color: '#b0aea5', fontWeight: 600, marginRight: 4 }}>{t('mdCards.structure')}</span>
          {pages.map((p, i) => {
            const pt = p.pageType || 'content';
            const cfg = PAGE_TYPE_CONFIG[pt] || PAGE_TYPE_CONFIG.content;
            return (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  onClick={() => scrollToCard(i)}
                  style={{ fontSize: 10, fontWeight: pt === 'cover' || pt === 'back' ? 600 : 400, color: cfg.color, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px', borderRadius: 4, transition: 'background 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = cfg.bg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  title={t('mdCards.jump_to_page', { n: String(i + 1), title: p.title })}
                >{cfg.label[locale]}</button>
                {i < pages.length - 1 && <span style={{ fontSize: 10, color: '#d4d3cd' }}>→</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Content signals banner */}
      {mdContext.contentSignals?.hasNumericData && (
        <div style={{ padding: '6px 14px', borderRadius: 8, background: '#f0f9ff', color: '#0f3d7a', fontSize: 12, marginBottom: 12, border: '1px solid #c6e5ff' }}>
          {t('mdCards.data_detected')}
          {mdContext.contentSignals.dataPoints.length > 0 && (
            <span style={{ color: '#6b6a65', marginLeft: 8 }}>({mdContext.contentSignals.dataPoints.slice(0, 4).join(', ')})</span>
          )}
        </div>
      )}

      {/* Card list — no inner scroll container (page scrolls), so absolute panels aren't clipped */}
      <div style={{ paddingBottom: 80 }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pages.map((_, i) => `card-${i}`)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {pages.map((page, idx) => {
              const isExpanded = expandedSet.has(idx);
              const isPanelOpen = openPanel === idx;
              return (
                <div key={`card-${idx}`} id={`outline-card-${idx}`} style={{
                  animation: `cardRise 0.4s ease-out ${idx * 120}ms both`,
                }}>
                  {/* Card row with strip + card + optional absolute panel */}
                  <div style={{ position: 'relative' }}>
                    {/* Toggle strip — 2px visible line with 20px invisible hit zone */}
                    <div
                      onClick={() => togglePanel(idx)}
                      className="layout-strip"
                      style={{
                        position: 'absolute',
                        left: -16, top: 12, bottom: 12,
                        width: 20,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                        zIndex: 2,
                      }}
                      title={isPanelOpen ? t('cardPanel.close') : t('cardPanel.layout')}
                    >
                      {/* The visible line */}
                      <div style={{
                        width: 3, height: '100%',
                        borderRadius: 2,
                        background: isPanelOpen
                          ? 'linear-gradient(180deg, #d97757 0%, #e8a87c 100%)'
                          : 'linear-gradient(180deg, #e0ded6 0%, #d4d3cd 100%)',
                        transition: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                        transformOrigin: 'center',
                      }} />
                      {/* Tiny dot indicator on hover — lives in the hit zone */}
                      <div className="layout-strip-dot" style={{
                        position: 'absolute',
                        left: 2, top: '50%', transform: 'translateY(-50%)',
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#d97757',
                        opacity: 0,
                        transition: 'opacity 0.2s, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      }} />
                    </div>

                    {/* Card */}
                    <MdContextCard
                      page={page}
                      index={idx}
                      isExpanded={isExpanded}
                      layoutHint={(layoutHints as Record<number, Layout>)[idx]}
                      warning={warningForPage(idx)}
                      hasError={invalidIndices.includes(idx)}
                      onToggleExpand={() => toggleExpand(idx)}
                      onUpdatePage={(updated) => handleUpdatePage(idx, updated)}
                      onDelete={() => handleDelete(idx)}
                      onSetLayoutHint={(layout) => handleSetLayoutHint(idx, layout)}
                      mdContext={mdContext}
                    />

                    {/* Side panel — absolute left overlay. clamp() so on wide
                        screens we use the empty left margin (up to 380px), on
                        narrow screens we fall back to 260px before clipping. */}
                    {isPanelOpen && (
                      <div style={{
                        position: 'absolute',
                        right: 'calc(100% + 10px)',
                        top: 0, bottom: 0,
                        width: 'clamp(260px, calc((100vw - 800px) / 2 - 24px), 380px)',
                        zIndex: 10,
                        animation: 'sidePanelSlideIn 0.2s ease-out',
                      }}>
                        <CardSidePanel
                          layoutHint={(layoutHints as Record<number, Layout>)[idx]}
                          compositionHint={(compositionHints as Record<number, string>)[idx]}
                          effectiveLayout={effectiveLayouts[idx]}
                          pageType={page.pageType}
                          onSetLayoutHint={(layout) => handleSetLayoutHint(idx, layout)}
                          onSetCompositionHint={(id) => handleSetCompositionHint(idx, id)}
                          onClose={() => setOpenPanel(null)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Insert gap */}
                  <div style={{ height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={() => setHoverGap(idx)} onMouseLeave={() => setHoverGap(null)}>
                    {hoverGap === idx ? (
                      <button onClick={() => handleInsert(idx)} style={{ width: 24, height: 24, borderRadius: '50%', border: '2px dashed #d97757', background: '#fff', color: '#d97757', fontSize: 16, lineHeight: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'qaFadeIn 0.15s ease-out' }} title={t('mdCards.insert_page')}>+</button>
                    ) : (
                      <div style={{ width: '60%', height: 1, background: '#e8e6dc', opacity: 0.4 }} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, background: 'linear-gradient(transparent 0%, rgba(245,244,240,0.97) 40%)', padding: '20px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {onBack ? (
          <button onClick={onBack} style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid #e8e6dc', background: '#fff', color: '#6b6a65', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>{t('mdCards.back')}</button>
        ) : <span />}
        <span style={{ fontSize: 13, color: targetPageCount && pages.length !== targetPageCount ? '#d97757' : '#b0aea5' }}>
          {targetPageCount
            ? `${pages.length}/${targetPageCount} ${locale === 'zh' ? '页' : 'pages'}`
            : t('mdCards.page_count', { n: String(pages.length) })}
        </span>
        <button
          onClick={handleContinueClick}
          disabled={disabled || pages.length === 0 || hasValidationErrors}
          style={{
            padding: '12px 32px', borderRadius: 14, border: 'none',
            background: (disabled || hasValidationErrors) ? '#e8e6dc' : '#1a1a2e',
            color: (disabled || hasValidationErrors) ? '#b0aea5' : '#fff',
            fontSize: 15, fontWeight: 700, cursor: (disabled || hasValidationErrors) ? 'default' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.2s',
          }}
          onMouseEnter={e => { if (!disabled && !hasValidationErrors) e.currentTarget.style.background = '#2a2a4e'; }}
          onMouseLeave={e => { if (!disabled && !hasValidationErrors) e.currentTarget.style.background = '#1a1a2e'; }}
        >{t('mdCards.continue')}</button>
      </div>

      {/* Floating chat */}
      <button onClick={() => setChatOpen(!chatOpen)} style={{ position: 'fixed', bottom: 80, right: 24, zIndex: 10, width: 48, height: 48, borderRadius: '50%', background: chatOpen ? '#d97757' : '#1a1a2e', color: '#fff', border: 'none', fontSize: 20, cursor: 'pointer', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('mdCards.chat_tooltip')}>💬</button>
      {chatOpen && (
        <div style={{ position: 'fixed', bottom: 140, right: 24, zIndex: 10, width: 340, height: 'calc(100vh - 300px)', maxHeight: 500, borderRadius: 16, background: '#fff', border: '1px solid #e8e6dc', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', overflow: 'hidden', animation: 'qaFadeIn 0.2s ease-out' }}>
          <OutlineChat mdContext={mdContext} onUpdateDeck={handleChatUpdateDeck} />
        </div>
      )}

      {/* Layout mismatch modal */}
      {pendingLayoutChange && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 24,
            maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: '#141413' }}>
              {locale === 'en' ? 'Layout Mismatch' : '布局不匹配'}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: '#666', lineHeight: 1.5 }}>
              {pendingLayoutChange.mismatch}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingLayoutChange(null)}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid #e8e6dc',
                  background: '#fff', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {locale === 'en' ? 'Cancel' : '取消'}
              </button>
              <button
                onClick={() => {
                  const { idx, layout } = pendingLayoutChange;
                  const newHints = { ...(mdContext.demands.pageLayouts ?? {}) };
                  if (layout) newHints[idx] = layout;
                  onUpdate({ ...mdContext, demands: { ...mdContext.demands, pageLayouts: newHints } });
                  setPendingLayoutChange(null);
                }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#1a1a2e', color: '#fff', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {locale === 'en' ? 'Change anyway' : '仍然更改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
