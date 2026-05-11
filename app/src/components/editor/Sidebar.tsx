'use client';

import React, { useMemo, useCallback, useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useEditorStore } from '@/lib/store';
import { getSceneClass } from '@/lib/themes';
import { LascaBrand } from '@/components/ui/LascaBrand';
import { SlideThumbnail as SharedSlideThumbnail } from '@/components/ui/SlideThumbnail';
import { getLogicalDims, fitToBox } from '@/lib/pageSize';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Slide, Theme, Layout } from '@/lib/types';
import { useT, useLocale } from '@/lib/i18n';
import { getPreset } from '@/lib/ai/harness/stylePresets';
import type { StylePresetId } from '@/lib/ai/harness/types';
import { swapLayout } from '@/lib/layoutSwap';
import { maybeAdaptToCardCanvas } from '@/lib/cards/adapt';
import { PAGE_TYPE_CONFIG, ALL_PAGE_TYPES, inferPageType } from '@/lib/pageTypes';

// Thumbnails are fit inside a 180×180 bounding box so 16:9 decks stay
// 180×101 (unchanged) while portrait decks become ~139×180 (Letter) /
// ~127×180 (A4) — vertical thumbnails that match the deck aspect ratio.
const THUMB_BOX = 180;

/* ------------------------------------------------------------------ */
/*  SlideThumbnail — memoized to skip re-rendering unchanged slides   */
/* ------------------------------------------------------------------ */

interface SlideThumbnailProps {
  slide: Slide;
  theme: Theme;
  logicalW: number;
  logicalH: number;
  thumbW: number;
  thumbH: number;
  thumbScale: number;
  index: number;
  total: number;
  isActive: boolean;
  isMultiSelected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onTypeBadgeClick: (e: React.MouseEvent, index: number) => void;
}

const SlideThumbnail = React.memo(function SlideThumbnail({
  slide, theme, logicalW, logicalH, thumbW, thumbH, thumbScale,
  index, total, isActive, isMultiSelected, onClick, onContextMenu, onTypeBadgeClick,
}: SlideThumbnailProps) {
  const t = useT();
  const locale = useLocale();
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `slide-${index}` });
  const [hover, setHover] = useState(false);

  const pageType = inferPageType(slide, index, total);
  const typeConfig = PAGE_TYPE_CONFIG[pageType];

  const wrapperStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Phase 2.6 visual improvements:
  // - border-radius 8 → 12 to match Canvas
  // - active state: 2px border + soft halo via box-shadow (layered affordance)
  // - hover: subtle shadow lift on idle thumbnails (not when already active)
  // - thumbW/thumbH and translateY need to coexist without double-transform
  //   — the dnd-kit transform is on the outer wrapper, so lift goes on the
  //   inner clickable div.
  const activeShadow = '0 0 0 2px rgba(217,119,87,0.18), 0 2px 10px rgba(217,119,87,0.12)';
  const hoverShadow = '0 2px 8px rgba(0,0,0,0.08)';
  const innerShadow = isActive ? activeShadow : (hover ? hoverShadow : 'none');

  return (
    <div ref={setNodeRef} style={wrapperStyle} {...attributes} {...listeners}>
      <div
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          cursor: 'pointer',
          borderRadius: 12,
          border: isActive ? '2px solid #d97757' : isMultiSelected ? '2px dashed #d97757' : '2px solid transparent',
          overflow: 'hidden',
          background: '#fff',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          boxShadow: innerShadow,
          transform: (isActive && !isDragging) ? 'translateY(-1px)' : 'none',
          transition: 'box-shadow 0.12s, transform 0.12s',
        }}
      >
        {/* Page number badge — bumped from 9→10px, bg 0.45→0.55 for contrast */}
        <div style={{
          position: 'absolute', top: 4, left: 4, fontSize: 10, color: '#fff',
          fontWeight: 600, zIndex: 2, background: 'rgba(0,0,0,0.55)',
          borderRadius: 4, padding: '1px 6px', lineHeight: '16px',
        }}>
          {index + 1}
        </div>
        {/* Page type label — click to change. Bumped 8→10px + padding 2px vertical */}
        <div
          onClick={(e) => { e.stopPropagation(); onTypeBadgeClick(e, index); }}
          style={{
            position: 'absolute', top: 4, right: 4, fontSize: 10, zIndex: 2,
            padding: '2px 6px', borderRadius: 3, lineHeight: '14px',
            fontWeight: 500, letterSpacing: '0.02em', cursor: 'pointer',
            background: typeConfig.bg, color: typeConfig.color,
            transition: 'opacity 0.12s',
          }}
          title={t('sidebar.change_page_type')}
        >
          {typeConfig.label[locale]}
        </div>
        {/* Shared imperative-innerHTML thumbnail — no more dangerouslySetInnerHTML */}
        <SharedSlideThumbnail
          slide={slide}
          theme={theme}
          w={logicalW}
          h={logicalH}
          scale={thumbScale}
          style={{ width: thumbW, height: thumbH }}
        />
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  GapInsert — hover zone between thumbnails, click to insert slide  */
/* ------------------------------------------------------------------ */

function GapInsert({ onInsert }: { onInsert: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onInsert}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 12,
        position: 'relative',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Line + "+" indicator */}
      <div style={{
        position: 'absolute',
        left: 8,
        right: 8,
        height: 0,
        borderTop: '1.5px solid #d97757',
        opacity: hover ? 1 : 0,
        transition: 'opacity 0.15s',
      }} />
      <div style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#d97757',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '16px',
        textAlign: 'center',
        opacity: hover ? 1 : 0,
        transition: 'opacity 0.15s',
        zIndex: 1,
        pointerEvents: 'none',
      }}>
        +
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SidebarContextMenu                                                 */
/* ------------------------------------------------------------------ */

interface SidebarMenuState {
  x: number;
  y: number;
  index: number;
}

function SidebarContextMenu({ x, y, index, slideCount, onClose }: {
  x: number; y: number; index: number; slideCount: number;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const removeSlide = useEditorStore(s => s.removeSlide);
  const duplicateSlide = useEditorStore(s => s.duplicateSlide);
  const moveSlide = useEditorStore(s => s.moveSlide);
  const updateSlide = useEditorStore(s => s.updateSlide);
  const slide = useEditorStore(s => s.activeDeck().slides[index]);
  const [showTypeSub, setShowTypeSub] = useState(false);

  const handleSetType = (pt: import('@/lib/ai/harness/types').PageType) => {
    if (slide) updateSlide(index, { ...slide, pageType: pt });
    onClose();
  };

  const items: { label: string; action: () => void; disabled?: boolean; hasSubmenu?: boolean }[] = [
    { label: t('sidebar.duplicate'), action: () => { duplicateSlide(index); onClose(); } },
    { label: t('sidebar.delete'), action: () => { removeSlide(index); onClose(); }, disabled: slideCount <= 1 },
  ];
  if (index > 0) {
    items.push({ label: t('sidebar.move_up'), action: () => { moveSlide(index, index - 1); onClose(); } });
  }
  if (index < slideCount - 1) {
    items.push({ label: t('sidebar.move_down'), action: () => { moveSlide(index, index + 1); onClose(); } });
  }
  items.push({ label: t('sidebar.change_type'), action: () => {}, hasSubmenu: true });

  const menuItemStyle = (disabled?: boolean): React.CSSProperties => ({
    padding: '7px 16px',
    fontSize: 13,
    color: disabled ? '#666' : '#eee',
    cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.1s',
    position: 'relative',
  });

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 199 }}
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      <div style={{
        position: 'fixed', left: x,
        top: Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200),
        zIndex: 200,
        background: '#1a1a1a', borderRadius: 8, padding: '4px 0',
        minWidth: 120, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}>
        {items.map((item, i) => (
          <div
            key={item.label}
            onClick={item.disabled || item.hasSubmenu ? undefined : item.action}
            onMouseEnter={(e) => {
              if (!item.disabled) (e.currentTarget as HTMLElement).style.background = '#333';
              if (item.hasSubmenu) setShowTypeSub(true);
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              if (item.hasSubmenu) setShowTypeSub(false);
            }}
            style={{
              ...menuItemStyle(item.disabled),
              borderTop: i === 2 ? '1px solid #333' : undefined,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}
          >
            {item.label}
            {item.hasSubmenu && <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 8 }}>▸</span>}
            {/* Right-expanding type submenu */}
            {item.hasSubmenu && showTypeSub && (
              <div
                onMouseEnter={() => setShowTypeSub(true)}
                onMouseLeave={() => setShowTypeSub(false)}
                style={{
                  position: 'absolute', left: '100%', bottom: -4, marginLeft: 4,
                  background: '#1a1a1a', borderRadius: 8, padding: '4px 0',
                  minWidth: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                  zIndex: 201,
                }}
              >
                {ALL_PAGE_TYPES.map(pt => {
                  const cfg = PAGE_TYPE_CONFIG[pt];
                  const current = slide ? inferPageType(slide, index, slideCount) : 'content';
                  return (
                    <div
                      key={pt}
                      onClick={() => handleSetType(pt)}
                      style={{
                        padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                        color: pt === current ? cfg.color : '#ccc',
                        fontWeight: pt === current ? 600 : 400,
                        transition: 'background 0.1s',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                      onMouseEnter={e => { (e.currentTarget).style.background = '#333'; }}
                      onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: 2,
                        background: cfg.color, opacity: 0.7, flexShrink: 0,
                      }} />
                      {cfg.label[locale]}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  TypePicker — popup for changing a slide's semantic PageType        */
/* ------------------------------------------------------------------ */

interface TypePickerState { x: number; y: number; index: number }

function TypePicker({ x, y, index, onClose }: TypePickerState & { onClose: () => void }) {
  const locale = useLocale();
  const updateSlide = useEditorStore(s => s.updateSlide);
  const slide = useEditorStore(s => {
    const d = s.activeDeck();
    return d.slides[index];
  });

  const handlePick = (pt: import('@/lib/ai/harness/types').PageType) => {
    if (!slide) return;
    updateSlide(index, { ...slide, pageType: pt } as Slide);
    onClose();
  };

  // Position the picker so it doesn't go off-screen
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const top = Math.min(y, viewH - 260);

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={onClose} />
      <div style={{
        position: 'fixed', left: x, top: Math.max(8, top), zIndex: 200,
        background: '#faf9f5', border: '1px solid #e8e6dc', borderRadius: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
        display: 'flex', flexWrap: 'wrap', gap: 4, width: 180,
      }}>
        {ALL_PAGE_TYPES.map(pt => {
          const cfg = PAGE_TYPE_CONFIG[pt];
          return (
            <div
              key={pt}
              onClick={() => handlePick(pt)}
              style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4,
                background: cfg.bg, color: cfg.color, cursor: 'pointer',
                fontWeight: 500, transition: 'opacity 0.1s', lineHeight: 1.4,
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.opacity = '0.7'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.opacity = '1'; }}
            >
              {cfg.label[locale]}
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

export function Sidebar() {
  const t = useT();
  const locale = useLocale();
  const deck = useEditorStore(s => s.activeDeck());
  const currentIndex = useEditorStore(s => s.currentIndex);
  const setCurrentIndex = useEditorStore(s => s.setCurrentIndex);
  const selectedSlideIndices = useEditorStore(s => s.selectedSlideIndices);
  const setSelectedSlideIndices = useEditorStore(s => s.setSelectedSlideIndices);
  const addSlide = useEditorStore(s => s.addSlide);
  const moveSlide = useEditorStore(s => s.moveSlide);
  const [ctxMenu, setCtxMenu] = useState<SidebarMenuState | null>(null);
  const [typePicker, setTypePicker] = useState<TypePickerState | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sidebarW, setSidebarW] = useState(200);

  // Client-side mount guard: DndContext generates different aria IDs on
  // server vs client, causing hydration mismatch. Render DnD only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useLayoutEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 200;
      setSidebarW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isCompact = sidebarW < 120;
  const thumbBox = Math.max(sidebarW - 16, 40); // padding 8px each side

  const logical = getLogicalDims(deck);
  const thumb = fitToBox(logical.w, logical.h, thumbBox, thumbBox);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const sortableItems = useMemo(
    () => deck.slides.map((_, i) => `slide-${i}`),
    [deck.slides],
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortableItems.indexOf(active.id as string);
    const newIndex = sortableItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    moveSlide(oldIndex, newIndex);
  }, [sortableItems, moveSlide]);

  const blankSlide: Slide = useMemo(() => {
    const base: Slide = { layout: 'cover', data: { title: t('sidebar.new_page'), subtitle: '' } };
    // Start from a cover and delegate to preset's preferredLayouts[0] if any,
    // then adapt into card-canvas so the result matches the rendering path
    // every other slide takes.
    let staged: Slide = base;
    if (deck.presetId) {
      const preset = getPreset(deck.presetId as StylePresetId);
      const pref = preset.preferredLayouts[0] as Layout | undefined;
      if (pref && pref !== 'cover') {
        staged = { layout: pref, data: swapLayout(base.data as Record<string, unknown>, 'cover', pref) };
      }
    }
    return maybeAdaptToCardCanvas(staged);
  }, [deck.presetId, t]);

  return (
    <div ref={sidebarRef} className={[deck.presetId === 'bilingual-report' ? 'preset-bilingual-report' : '', getSceneClass(deck.theme)].filter(Boolean).join(' ') || undefined} style={{ width: 200, minWidth: 60, background: '#faf9f5', borderRight: '1px solid #e8e6dc', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 3 }}>
      {/* Logo — hidden when compact */}
      {!isCompact && (
        <div style={{ padding: '12px 16px 8px', borderBottom: '1px solid #e8e6dc' }}>
          <LascaBrand variant="full" size={18} />
          <span style={{ fontSize: 12, color: '#b0aea5', marginLeft: 6 }}>v1</span>
        </div>
      )}

      {/* Slide thumbnails — DndContext only after mount to avoid hydration mismatch */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 8, userSelect: 'none' }}>
        {mounted ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={sortableItems} strategy={verticalListSortingStrategy}>
            {/* Gap before first slide */}
            <GapInsert onInsert={() => addSlide(-1, blankSlide)} />
            {deck.slides.map((slide, idx) => (
              <React.Fragment key={`slide-${idx}`}>
                <SlideThumbnail
                  slide={slide}
                  theme={deck.theme}
                  logicalW={logical.w}
                  logicalH={logical.h}
                  thumbW={thumb.w}
                  thumbH={thumb.h}
                  thumbScale={thumb.scale}
                  index={idx}
                  total={deck.slides.length}
                  isActive={idx === currentIndex}
                  isMultiSelected={selectedSlideIndices.includes(idx)}
                  onClick={(e: React.MouseEvent) => {
                    if (e.shiftKey) {
                      e.preventDefault(); // prevent text selection
                      const from = Math.min(currentIndex, idx);
                      const to = Math.max(currentIndex, idx);
                      const range = Array.from({ length: to - from + 1 }, (_, i) => from + i);
                      setSelectedSlideIndices(range);
                    } else if (e.metaKey || e.ctrlKey) {
                      e.preventDefault();
                      const next = selectedSlideIndices.includes(idx)
                        ? selectedSlideIndices.filter(i => i !== idx)
                        : [...selectedSlideIndices, idx];
                      setSelectedSlideIndices(next);
                    } else {
                      setCurrentIndex(idx);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (e.ctrlKey) return;
                    setCtxMenu({ x: e.clientX, y: e.clientY, index: idx });
                  }}
                  onTypeBadgeClick={(e) => {
                    e.stopPropagation();
                    setTypePicker({ x: e.clientX, y: e.clientY, index: idx });
                  }}
                />
                {/* Gap after each slide */}
                <GapInsert onInsert={() => addSlide(idx, blankSlide)} />
              </React.Fragment>
            ))}
          </SortableContext>
        </DndContext>
        ) : null}
      </div>

      {/* Add slide button */}
      <div style={{ padding: 8, borderTop: '1px solid #e8e6dc', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          onClick={() => addSlide(currentIndex, blankSlide)}
          style={{
            padding: '6px 0', fontSize: 13, background: '#d97757', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500,
          }}
        >
          {isCompact ? t('sidebar.add_page_compact') : t('sidebar.add_page')}
        </button>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <SidebarContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          index={ctxMenu.index}
          slideCount={deck.slides.length}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
