'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEditorStore } from '@/lib/store';

// Stable empty ref to avoid infinite re-render from selector creating new objects
const EMPTY_SLIDE_ACTIONS: Record<string, {id: string; text: string; color: string; ts: number}[]> = {};

import { TabBar } from './TabBar';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { Canvas } from './Canvas';
import { SlideNav } from './SlideNav';
import { SlideToolbar } from './SlideToolbar';
import { NotesArea } from './NotesArea';
import { StylePanel } from './StylePanel';
import { ChatPanel } from '../chat/ChatPanel';
import { ReportSourcePane } from './ReportSourcePane';
import { ReportPreviewPane } from './ReportPreviewPane';
import { ReportChromeBar } from './ReportChromeBar';
import { ChartPlanSheet, type ChartPlanSheetProps } from './ChartPlanSheet';
import { getTransition, TRANSITION_LABELS, type TransitionType, type DeckPageSize, type Theme, type Layout } from '@/lib/types';
import { getPageSizeLabel } from '@/lib/pageSize';
import { getTextureVariant, getAmbientVariant } from '@/lib/themes';
import { useT, useLocale } from '@/lib/i18n';

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.1;
const clampZoom = (z: number) => Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX);
const roundZoom = (z: number) => Math.round(z * 100) / 100;
const shouldBypassDeckUndo = (target: EventTarget | null) => {
  if (!(target instanceof Element)) return false;

  // Slide text editing should keep the browser's native text undo behavior.
  if (target.closest('[contenteditable]')) return true;

  // Chat-triggered edits leave focus in the composer. Once the composer is
  // empty, Cmd/Ctrl+Z should undo the deck mutation, not restore the prompt.
  const chatComposer = target.closest('[data-lasca-chat-composer="1"]');
  if (chatComposer instanceof HTMLTextAreaElement || chatComposer instanceof HTMLInputElement) {
    return chatComposer.value.trim().length > 0;
  }

  // Other form controls keep their own native undo stack.
  return Boolean(target.closest('textarea, input'));
};
const isFileTextDropTarget = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('[data-lasca-file-drop-target="1"]'));

export function Editor() {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') as 'draft' | 'scratch' | 'generate' | null;

  const activeDeckId = useEditorStore(s => s.activeDeckId);
  const deck = useEditorStore(s => s.activeDeck());
  const currentIndex = useEditorStore(s => s.currentIndex);
  const setCurrentIndex = useEditorStore(s => s.setCurrentIndex);
  const updateSlide = useEditorStore(s => s.updateSlide);
  const setDeckPageSize = useEditorStore(s => s.setDeckPageSize);
  const slideActions = useEditorStore(s => s.slideActions[s.activeDeckId] || EMPTY_SLIDE_ACTIONS);
  const isGenerating = useEditorStore(s => s.isGenerating);
  // convertToNative was removed from store — re-add when the feature is ready
  const convertToNative = useEditorStore(s => (s as /* eslint-disable-line */ any).convertToNative);
  const slide = deck.slides[currentIndex];
  const isFaithfulSlide = slide?.layout === 'pptx-faithful' || slide?.layout === 'pdf-faithful';
  const [converting, setConverting] = useState(false);

  // Selected canvas element (bubble up from Canvas for StylePanel)
  const [selectedCanvasEl, setSelectedCanvasEl] = useState<HTMLElement | null>(null);
  // Force StylePanel to re-read computed styles after each change
  const [stylePanelKey, setStylePanelKey] = useState(0);

  // Canvas zoom level (1.0 = fit-to-box; session-local, not persisted)
  const [zoomLevel, setZoomLevel] = useState(1);

  // Keyboard shortcuts help overlay
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Chart plan bottom sheet overlay
  const [chartPlanSheet, setChartPlanSheet] = useState<{
    chartLayout: Layout;
    chartLabel: string;
    planText: string;
    pageIndex: number;
  } | null>(null);
  const [chartPlanMinimized, setChartPlanMinimized] = useState(false);

  // Listen for chart plan events from ChatPanel
  useEffect(() => {
    const onReady = (e: Event) => {
      const { chartLayout, chartLabel, planText, pageIndex } = (e as CustomEvent).detail;
      setChartPlanSheet({ chartLayout, chartLabel, planText, pageIndex });
    };
    const onDismiss = () => setChartPlanSheet(null);
    window.addEventListener('lasca:chart-plan-ready', onReady);
    window.addEventListener('lasca:chart-plan-dismiss', onDismiss);
    return () => {
      window.removeEventListener('lasca:chart-plan-ready', onReady);
      window.removeEventListener('lasca:chart-plan-dismiss', onDismiss);
    };
  }, []);

  // Global drag-drop: prevent browser from opening dropped files
  const [dragOver, setDragOver] = useState(false);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (isFileTextDropTarget(e.target)) {
      dragCountRef.current = 0;
      setDragOver(false);
      return;
    }
    e.preventDefault();
    dragCountRef.current++;
    if (dragCountRef.current === 1) setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (isFileTextDropTarget(e.target)) {
      dragCountRef.current = 0;
      setDragOver(false);
      return;
    }
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isFileTextDropTarget(e.target)) {
      dragCountRef.current = 0;
      setDragOver(false);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (isFileTextDropTarget(e.target)) {
      dragCountRef.current = 0;
      setDragOver(false);
      return;
    }
    e.preventDefault();
    dragCountRef.current = 0;
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      // Insert image into current slide
      const reader = new FileReader();
      reader.onload = () => {
        window.dispatchEvent(new CustomEvent('lasca:insert-image', { detail: { src: reader.result } }));
      };
      reader.readAsDataURL(file);
    } else {
      // Route to Toolbar's import flow (handles PPTX/PDF IntentChooser)
      window.dispatchEvent(new CustomEvent('lasca:import-file', { detail: { file } }));
    }
  }, []);

  // Reset stale transient state when switching decks
  useEffect(() => {
    setSelectedCanvasEl(null);
    setStylePanelKey(0);
    setZoomLevel(1);
  }, [activeDeckId]);

  // 底纹 (Texture) + 氛围 (Ambience) 双系统同步:
  // 1. data-lasca-texture="off" / data-lasca-ambient="off" — 全局 on/off
  // 2. --lasca-texture-{theme}-url CSS vars — 底纹 variant
  // 3. data-lasca-ambient-{theme}="{id}" — 氛围 variant (gates CSS keyframe rules)
  useEffect(() => {
    const textureOff = deck.texture === false;
    const ambientOff = deck.ambient === false;
    const root = document.documentElement;
    if (textureOff) root.setAttribute('data-lasca-texture', 'off');
    else root.removeAttribute('data-lasca-texture');
    if (ambientOff) root.setAttribute('data-lasca-ambient', 'off');
    else root.removeAttribute('data-lasca-ambient');

    const themeList: Theme[] = [
      'warm', 'cool', 'dark', 'original',
      'stripe', 'linear', 'notion', 'vercel', 'apple', 'spotify', 'airbnb', 'ferrari',
    ];

    // Texture variant → CSS var override
    const tvMap = deck.textureVariant ?? {};
    for (const th of themeList) {
      const cssVar = `--lasca-texture-${th}-url`;
      const pickedId = tvMap[th];
      if (pickedId) {
        const variant = getTextureVariant(th, pickedId);
        if (variant) { root.style.setProperty(cssVar, variant.url); continue; }
      }
      root.style.removeProperty(cssVar);
    }

    // Ambient variant → data attribute on <html> that gates CSS selector
    const avMap = deck.ambientVariant ?? {};
    for (const th of themeList) {
      const attr = `data-lasca-ambient-${th}`;
      const pickedId = avMap[th];
      const variant = getAmbientVariant(th, pickedId);
      if (variant && !ambientOff) {
        root.setAttribute(attr, variant.id);
      } else {
        root.removeAttribute(attr);
      }
    }

    return () => {
      root.removeAttribute('data-lasca-texture');
      root.removeAttribute('data-lasca-ambient');
      for (const th of themeList) {
        root.style.removeProperty(`--lasca-texture-${th}-url`);
        root.removeAttribute(`data-lasca-ambient-${th}`);
      }
    };
  }, [deck.texture, deck.ambient, deck.textureVariant, deck.ambientVariant]);

  // Page-size dropdown state + outside-click close
  const [pageSizeMenuOpen, setPageSizeMenuOpen] = useState(false);
  const pageSizeMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!pageSizeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pageSizeMenuRef.current?.contains(e.target as Node)) setPageSizeMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pageSizeMenuOpen]);

  const currentSlideActions = slideActions[String(currentIndex)] || [];

  // Persist StylePanel changes via _fieldStyles so they survive re-render
  // and live in undo history. Walks up to the nearest data-field ancestor
  // (the selected element may itself be a non-binding wrapper). Falls back
  // silently when no data-field exists; the visual change still appears via
  // StylePanel's own DOM mutation but is not undoable — surface that in a
  // console warning so we notice during dev.
  const handleStyleChange = useCallback((prop: string, value: string) => {
    setStylePanelKey(k => k + 1);
    if (!selectedCanvasEl) return;
    const fieldHost = selectedCanvasEl.getAttribute('data-field')
      ? selectedCanvasEl
      : (selectedCanvasEl.closest('[data-field]') as HTMLElement | null);
    const fieldPath = fieldHost?.getAttribute('data-field');
    if (!fieldPath) {
      console.warn('[StylePanel] style change has no data-field anchor — change is not undoable');
      return;
    }
    const deckNow = useEditorStore.getState().activeDeck();
    const slide = deckNow?.slides[currentIndex];
    if (!slide) return;
    const prevFieldStyles = slide._fieldStyles ?? {};
    const prevForField = prevFieldStyles[fieldPath] ?? {};
    const nextFieldStyles = {
      ...prevFieldStyles,
      [fieldPath]: { ...prevForField, [prop]: value },
    };
    updateSlide(currentIndex, { ...slide, _fieldStyles: nextFieldStyles });
  }, [selectedCanvasEl, currentIndex, updateSlide]);

  // Keyboard navigation
  const handleGlobalKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('textarea, [contenteditable]')) return;

    // Canvas zoom shortcuts (Cmd/Ctrl + = / - / 0)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoomLevel(z => clampZoom(roundZoom(z + ZOOM_STEP)));
        return;
      }
      if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setZoomLevel(z => clampZoom(roundZoom(z - ZOOM_STEP)));
        return;
      }
      if (e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
        return;
      }
    }

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      setCurrentIndex(Math.min(currentIndex + 1, deck.slides.length - 1));
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      setCurrentIndex(Math.max(currentIndex - 1, 0));
    }
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      setShowShortcuts(s => !s);
    }
    if (e.key === 'Escape') {
      setShowShortcuts(false);
    }
  }, [currentIndex, deck.slides.length, setCurrentIndex]);

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [handleGlobalKey]);

  // Undo / Redo: custom events from Toolbar + keyboard shortcut
  useEffect(() => {
    const handleUndo = () => useEditorStore.getState().undo();
    const handleRedo = () => useEditorStore.getState().redo();
    window.addEventListener('lasca:undo', handleUndo);
    window.addEventListener('lasca:redo', handleRedo);
    const handleKey = (e: KeyboardEvent) => {
      if (shouldBypassDeckUndo(e.target)) return;
      const key = e.key.toLowerCase();
      const isUndoRedoKey = e.code === 'KeyZ' || key === 'z';
      if ((e.metaKey || e.ctrlKey) && isUndoRedoKey) {
        e.preventDefault();
        if (e.shiftKey) handleRedo(); else handleUndo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('lasca:undo', handleUndo);
      window.removeEventListener('lasca:redo', handleRedo);
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f0efeb', fontFamily: "'Poppins', 'Noto Sans SC', sans-serif", position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 9999,
          background: 'rgba(217,119,87,0.08)',
          border: '3px dashed #d97757',
          borderRadius: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: '24px 40px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>+</div>
            <div style={{ fontSize: 15, color: '#141413', fontWeight: 600 }}>{t('editor.drop_here')}</div>
            <div style={{ fontSize: 12, color: '#b0aea5', marginTop: 4 }}>{t('editor.supported_formats')}</div>
          </div>
        </div>
      )}
      {/* Keyboard shortcuts help overlay */}
      {showShortcuts && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 9998,
            background: 'rgba(0,0,0,0.4)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 16, padding: '28px 36px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.15)', maxWidth: 400, width: '100%',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#141413', marginBottom: 16 }}>
              {t('editor.shortcuts')}
            </div>
            {[
              ['Cmd/Ctrl + Z', t('editor.shortcut.undo')],
              ['Cmd/Ctrl + Shift + Z', t('editor.shortcut.redo')],
              ['Cmd/Ctrl + +', t('editor.shortcut.zoom_in')],
              ['Cmd/Ctrl + -', t('editor.shortcut.zoom_out')],
              ['Cmd/Ctrl + 0', t('editor.shortcut.reset_zoom')],
              ['← →', t('editor.shortcut.prev_next')],
              ['Double-click', t('editor.shortcut.edit_text')],
              ['Cmd/Ctrl + B/I/U', t('editor.shortcut.formatting')],
              ['Escape', t('editor.shortcut.exit_edit')],
              ['?', t('editor.shortcut.toggle_help')],
            ].map(([key, desc]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13 }}>
                <span style={{ color: '#6b6a65' }}>{desc}</span>
                <kbd style={{
                  background: '#f5f4f0', border: '1px solid #e8e6dc', borderRadius: 4,
                  padding: '1px 8px', fontSize: 11, color: '#141413', fontFamily: 'monospace',
                }}>{key}</kbd>
              </div>
            ))}
            <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#b0aea5' }}>
              {t('editor.close_hint')}
            </div>
          </div>
        </div>
      )}
      {/* Tab Bar */}
      <TabBar />

      {/* Main Body: (Sidebar | ReportSourcePane) + Center + Chat.
          Report decks (deck.sourceMd set) swap Sidebar → ReportSourcePane
          and the Canvas → ReportPreviewPane, but Toolbar + StatusBar stay
          in place so zoom / pageSize / theme / export still work. */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left Sidebar — slide thumbnails, or md textarea for reports */}
        {deck.sourceMd ? <ReportSourcePane /> : <Sidebar />}

        {/* Center: Toolbar + StylePanel + Canvas + Notes */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <Toolbar />

          {/* Style panel — always-present 40px slot; shows StylePanel when element
              selected, or "AI 重新排版" button when on a faithful slide.
              Report decks: always-on chrome row (header/footer inputs). */}
          <div style={{
            height: 40, background: '#faf9f5', borderBottom: '1px solid #e8e6dc',
            flexShrink: 0,
            opacity: (deck.sourceMd || selectedCanvasEl || isFaithfulSlide) ? 1 : 0,
            transition: 'opacity 0.15s ease-out',
            pointerEvents: (deck.sourceMd || selectedCanvasEl || isFaithfulSlide) ? 'auto' : 'none',
          }}>
            {deck.sourceMd ? (
              <ReportChromeBar />
            ) : selectedCanvasEl ? (
              <StylePanel
                key={stylePanelKey}
                element={selectedCanvasEl}
                onStyleChange={handleStyleChange}
                onClose={() => setSelectedCanvasEl(null)}
              />
            ) : isFaithfulSlide ? (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center',
                padding: '0 16px', gap: 12,
              }}>
                <span style={{ fontSize: 12, color: '#b0aea5' }}>
                  {t('editor.original_theme_limited')}
                </span>
                <button
                  disabled={converting}
                  onClick={async () => {
                    setConverting(true);
                    try {
                      await convertToNative(currentIndex);
                    } catch (e) {
                      console.error('AI redesign failed:', e);
                    } finally {
                      setConverting(false);
                    }
                  }}
                  style={{
                    background: converting ? '#e8e6dc' : '#d97757',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 16px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: converting ? 'wait' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'background 0.15s',
                  }}
                >
                  {converting ? t('editor.ai_analyzing') : t('editor.ai_reformat')}
                </button>
                <span style={{ fontSize: 11, color: '#b0aea5' }}>
                  {t('editor.convert_native_hint')}
                </span>
              </div>
            ) : null}
          </div>

          {/* Canvas area — report decks render the live paged.js pane in place
              of the slide Canvas. */}
          {deck.sourceMd ? (
            <ReportPreviewPane zoomLevel={zoomLevel} />
          ) : (
          <div style={{
            flex: 1, display: 'flex',
            // `safe center` keeps content centered when it fits, but falls
            // back to start-aligned (with scrollbars) when zoomed in beyond
            // the available viewport so the user can still reach the edges.
            alignItems: 'safe center',
            justifyContent: 'safe center',
            padding: 24, overflow: 'auto', position: 'relative',
          }}>
            <div className="lasca-canvas-frame" style={{ position: 'relative', flexShrink: 0 }}>
              <SlideNav />
              <Canvas slide={slide} theme={deck.theme} zoomLevel={zoomLevel} onSelectionChange={setSelectedCanvasEl} />
              <SlideToolbar pageIndex={currentIndex} currentLayout={slide.layout} loading={isGenerating} />
            </div>

            {/* Chart plan bottom sheet — slides up from canvas bottom */}
            {chartPlanSheet && !chartPlanMinimized && (
              <div style={{
                position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                width: '88%', maxWidth: 720,
                background: '#fff',
                borderTop: '1px solid #e8e6dc',
                borderRadius: '16px 16px 0 0',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
                zIndex: 100,
                maxHeight: '50vh',
                minHeight: 220,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'chartSheetSlideUp 0.55s cubic-bezier(0.22, 0.61, 0.36, 1)',
              }}>
                <ChartPlanSheet
                  chartLayout={chartPlanSheet.chartLayout}
                  chartLabel={chartPlanSheet.chartLabel}
                  planText={chartPlanSheet.planText}
                  pageIndex={chartPlanSheet.pageIndex}
                  onConfirm={(editedPlanText: string) => {
                    window.dispatchEvent(new CustomEvent('lasca:chart-plan-action', {
                      detail: { action: 'confirm', editedPlanText },
                    }));
                    setChartPlanSheet(null);
                    setChartPlanMinimized(false);
                  }}
                  onDismiss={() => {
                    window.dispatchEvent(new CustomEvent('lasca:chart-plan-action', { detail: { action: 'dismiss' } }));
                    setChartPlanSheet(null);
                    setChartPlanMinimized(false);
                  }}
                  onMinimize={() => setChartPlanMinimized(true)}
                />
              </div>
            )}
            {/* Minimized chart plan pill */}
            {chartPlanSheet && chartPlanMinimized && (
              <button
                onClick={() => setChartPlanMinimized(false)}
                style={{
                  position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                  zIndex: 100,
                  background: '#fff', border: '1px solid #e8e6dc', borderRadius: 20,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                  padding: '6px 16px',
                  display: 'flex', alignItems: 'center', gap: 6,
                  cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateX(-50%) translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateX(-50%)'; }}
              >
                <span style={{ fontSize: 11, fontWeight: 600, color: '#d97757', background: 'rgba(217,119,87,0.08)', padding: '2px 8px', borderRadius: 12 }}>
                  {chartPlanSheet.chartLabel}
                </span>
                <span style={{ fontSize: 11, color: '#b0aea5' }}>
                  P.{chartPlanSheet.pageIndex + 1}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#b0aea5" strokeWidth="2" strokeLinecap="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
            )}
          </div>
          )}

          {/* Action log bar — slide decks only */}
          {!deck.sourceMd && currentSlideActions.length > 0 && (
            <div style={{
              overflow: 'hidden', background: '#f5f4ef', borderTop: '1px solid #e8e6dc',
              padding: '5px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 10, color: '#b0aea5', flexShrink: 0, fontWeight: 500 }}>
                {t('editor.page_number', { n: currentIndex + 1 })}
              </span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, overflow: 'hidden' }}>
                {currentSlideActions.slice(-4).map((a, i, arr) => {
                  const age = arr.length - 1 - i;
                  const opacity = age === 0 ? 1 : age === 1 ? 0.6 : 0.3;
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4, opacity, transition: 'opacity 0.5s' }}>
                      <div style={{ width: 4, height: 4, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#8a8880', whiteSpace: 'nowrap' }}>{a.text}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes area — slide decks only */}
          {!deck.sourceMd && (
            <div style={{ height: 72, background: '#faf9f5', borderTop: '1px solid #e8e6dc', display: 'flex', flexShrink: 0 }}>
              <div style={{ width: 80, borderRight: '1px solid #e8e6dc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: '#b0aea5', textTransform: 'uppercase' as const, letterSpacing: 1 }}>Notes</span>
              </div>
              <NotesArea />
            </div>
          )}

          {/* Status bar */}
          <div style={{ height: 28, background: '#faf9f5', borderTop: '1px solid #e8e6dc', display: 'flex', alignItems: 'center', padding: '0 16px', fontSize: 11, color: '#b0aea5', flexShrink: 0, gap: 12 }}>
            {/* Page size picker — clickable dropdown */}
            <div ref={pageSizeMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setPageSizeMenuOpen(o => !o)}
                style={{
                  background: 'transparent', border: 'none', fontSize: 11,
                  color: '#141413', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '2px 6px', borderRadius: 3, display: 'inline-flex',
                  alignItems: 'center', gap: 4,
                }}
                title={t('editor.page_size_tooltip')}
              >
                {getPageSizeLabel(deck)}
                <span style={{ fontSize: 8, color: '#b0aea5' }}>▾</span>
              </button>
              {pageSizeMenuOpen && (
                <div style={{
                  position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
                  background: '#fff', border: '1px solid #e8e6dc', borderRadius: 6,
                  boxShadow: '0 -4px 16px rgba(0,0,0,0.10)', zIndex: 100,
                  minWidth: 168, padding: '4px 0', fontFamily: 'inherit',
                }}>
                  {([
                    { ps: 'slide-16:9' as const, label: 'Slide · 16:9', dims: '960×540' },
                    { ps: 'letter' as const,     label: 'Letter',       dims: '612×792' },
                    { ps: 'a4' as const,         label: 'A4',           dims: '595×842' },
                  ] satisfies { ps: DeckPageSize; label: string; dims: string }[]).map(opt => {
                    const active = (deck.pageSize || 'slide-16:9') === opt.ps;
                    return (
                      <div
                        key={opt.ps}
                        onClick={() => { setDeckPageSize(opt.ps); setPageSizeMenuOpen(false); }}
                        style={{
                          padding: '6px 12px', fontSize: 11, cursor: 'pointer',
                          background: active ? '#f5f4ef' : 'transparent',
                          display: 'flex', justifyContent: 'space-between', gap: 12,
                          color: '#141413',
                        }}
                        onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = '#faf9f5'; }}
                        onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                      >
                        <span style={{ fontWeight: active ? 600 : 400 }}>{opt.label}</span>
                        <span style={{ color: '#b0aea5' }}>{opt.dims}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {!deck.sourceMd && (
              <>
                <span>·</span>
                <span>{deck.slides.length} {t('editor.pages')}</span>
                <span>·</span>
                {/* Transition selector for current slide. `''` is the sentinel
                    for "auto" — clears slide.transition so Presenter falls
                    back to DEFAULT_TRANSITION[slide.layout]. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t('editor.transition')}
                  <select
                    value={slide?.transition ?? ''}
                    onChange={(e) => {
                      if (!slide) return;
                      const v = e.target.value;
                      if (v === '') {
                        const next = { ...slide };
                        delete next.transition;
                        updateSlide(currentIndex, next);
                      } else {
                        updateSlide(currentIndex, { ...slide, transition: v as TransitionType });
                      }
                    }}
                    style={{
                      background: 'transparent', border: 'none', color: '#141413',
                      fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
                      padding: '0 2px', outline: 'none',
                    }}
                    title={t('editor.transition_tooltip')}
                  >
                    {slide && (
                      <option value="">{t('editor.auto_transition', { name: TRANSITION_LABELS[getTransition(slide, currentIndex)][locale] })}</option>
                    )}
                    {(Object.keys(TRANSITION_LABELS) as TransitionType[]).map(tr => (
                      <option key={tr} value={tr}>{TRANSITION_LABELS[tr][locale]}</option>
                    ))}
                  </select>
                </span>
              </>
            )}
            {/* v2.4.2: the raster/vector mode toggle was removed when PDF
                moved to a unified render (raster background + editable
                text overlay). Nothing to toggle now. */}
            <span>·</span>
            {/* Canvas zoom slider */}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={t('editor.zoom_tooltip')}>
              <input
                type="range"
                min={Math.round(ZOOM_MIN * 100)}
                max={Math.round(ZOOM_MAX * 100)}
                step={5}
                value={Math.round(zoomLevel * 100)}
                onChange={(e) => setZoomLevel(Number(e.target.value) / 100)}
                style={{
                  width: 96, height: 2,
                  accentColor: '#d97757', cursor: 'pointer',
                }}
                aria-label="Canvas zoom"
              />
              <button
                onClick={() => setZoomLevel(1)}
                style={{
                  background: 'transparent', border: 'none', fontSize: 11,
                  color: '#141413', cursor: 'pointer', fontFamily: 'inherit',
                  minWidth: 36, textAlign: 'right', padding: 0,
                }}
                title={t('editor.reset_zoom')}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
            </span>
            <div style={{ flex: 1 }} />
            <span>{t('editor.controls_hint')}</span>
          </div>
        </div>

        {/* Right Chat Panel */}
        <ChatPanel mode={mode} />
      </div>
    </div>
  );
}
