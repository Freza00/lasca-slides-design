'use client';

import { useRef, useCallback, useState, useEffect, useLayoutEffect } from 'react';
import { renderSlide } from '@/lib/renderSlide';
import { getSceneClass } from '@/lib/themes';
import { useEditorStore } from '@/lib/store';
import { getLogicalDims } from '@/lib/pageSize';
import type { Slide, Theme, Layout, ReviewStatus } from '@/lib/types';
import { ContextMenu } from './ContextMenu';
import { FormatToolbar } from './FormatToolbar';
import { ChartDataPanel, isChartOrDiagram, hasEmbeddedChart } from './ChartDataPanel';
import { getPreset } from '@/lib/ai/harness/stylePresets';
import type { StylePresetId } from '@/lib/ai/harness/types';
import { swapLayout } from '@/lib/layoutSwap';
import { maybeAdaptToCardCanvas } from '@/lib/cards/adapt';
import { useT } from '@/lib/i18n';
import { useFlagEnabled } from '@/lib/featureFlags';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
// NOTE: Canvas width / height are no longer hard-coded. They come from
// getLogicalDims(deck) for the logical (authoring) coord system and from
// a ResizeObserver on the parent for the display size.
const SNAP_THRESHOLD = 5;
const DRAG_THRESHOLD = 6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Guide {
  type: 'v' | 'h';
  pos: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  el: HTMLElement | null;
}

interface DragState {
  block: HTMLElement;
  startX: number;
  startY: number;
  origLeft: number;
  origTop: number;
  moved: boolean;
}

interface CanvasProps {
  slide: Slide;
  theme: Theme;
  /** User zoom multiplier on top of the fit-to-box scale. Default 1.0 = fit. */
  zoomLevel?: number;
  onSelectionChange?: (el: HTMLElement | null) => void;
  selectionChangeKey?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Is element a slide-level wrapper that should NEVER be selected/dragged?
 *  The old version only checked direct children of canvas; we now treat any
 *  element covering ≥85% of both canvas dimensions as a wrapper regardless
 *  of depth. This prevents "dragging the whole slide" when the user clicks
 *  on a nested full-width container (e.g. the flex column wrapping all
 *  children of a three-cards layout). Real content blocks stay well under
 *  85% of canvas so they keep working. */
function isRootContainer(el: HTMLElement, canvas: HTMLElement): boolean {
  if (el === canvas.firstElementChild) return true;
  const r = el.getBoundingClientRect();
  const c = canvas.getBoundingClientRect();
  if (c.width > 0 && c.height > 0 &&
      r.width >= c.width * 0.85 &&
      r.height >= c.height * 0.85) {
    return true;
  }
  return false;
}

/** Is this target inside a region that has opted out of editing?
 *  `data-no-edit="1"` is Lasca's atomic-block escape hatch (C2): the element
 *  and its entire subtree are off-limits to drag / text-edit / sync. Used by
 *  svg-figure so the LLM-emitted SVG tree is never touched by the editor. */
function isNoEditZone(target: HTMLElement, canvas: HTMLElement): boolean {
  const noEdit = target.closest('[data-no-edit]') as HTMLElement | null;
  return !!(noEdit && canvas.contains(noEdit));
}

/** Walk up from click target to find a meaningful block element. */
function findBlock(target: HTMLElement, canvas: HTMLElement): HTMLElement | null {
  // C2 guard: svg-figure (and any future opt-out region) treats itself as a
  // single atomic block. Return the data-no-edit container so a click on the
  // SVG selects the figure but does NOT dive into SVG children.
  if (isNoEditZone(target, canvas)) {
    return target.closest('[data-no-edit]') as HTMLElement | null;
  }
  // pptx-faithful / pdf-faithful DOM:
  //   [data-pptx-inner] (our scale wrapper, maybe scale(1))
  //     └── library viewport div (position:relative, full slide size)
  //          └── library content div (position:absolute, transform:scale(x.x))  ← the "shape container"
  //               └── individual shapes / text runs ← what we want to drag
  //
  // Strategy: walk up from the click target looking for an ancestor whose
  // PARENT has a computed transform (i.e. the library's innermost scaled
  // container). The element sitting directly under that scaled container
  // is the "shape" — exactly the draggable unit.
  const inner = target.closest('[data-pptx-inner="1"]') as HTMLElement | null;
  if (inner) {
    if (target === inner) return null;
    // v2.4.3: structural wrapper divs must never be treated as draggable
    // atoms. Clicking on them should deselect (return null), not select
    // the entire layer.
    if (target.hasAttribute('data-lasca-raster') ||
        target.hasAttribute('data-lasca-vector') ||
        target.hasAttribute('data-lasca-vector-shapes')) {
      return null;
    }
    // pdf-faithful text spans and extracted images are leaf elements with
    // a `data-field` attribute (e.g. "pdf.p0.l3", "pdf.p0.img2"). They sit
    // directly under the vector wrapper, which is NOT transform-scaled, so
    // the ancestor-walker below would miss them and return the whole page
    // wrapper instead. Short-circuit: a data-field leaf IS the draggable
    // unit we want.
    const leafField = target.closest('[data-field]') as HTMLElement | null;
    if (leafField && inner.contains(leafField) && leafField !== inner) {
      return leafField;
    }
    let cur: HTMLElement | null = target;
    while (cur && cur !== inner) {
      // Skip structural wrappers that cover the whole page — they're never
      // the thing the user wants to drag.
      if (cur.hasAttribute('data-lasca-vector') ||
          cur.hasAttribute('data-lasca-vector-shapes')) {
        cur = cur.parentElement;
        continue;
      }
      const parent: HTMLElement | null = cur.parentElement;
      if (!parent || parent === inner) {
        return null;
      }
      const tr = getComputedStyle(parent).transform;
      if (tr && tr !== 'none') {
        return cur;
      }
      cur = parent;
    }
    return null;
  }

  let el: HTMLElement | null = target;
  while (el && el !== canvas) {
    const parent = el.parentElement;
    if (!parent) break;
    const isChild = parent === canvas || parent === canvas.firstElementChild;
    const pDisp = getComputedStyle(parent).display;
    const isFlexGridChild = pDisp.includes('flex') || pDisp.includes('grid');
    if (isChild || isFlexGridChild) {
      if (isRootContainer(el, canvas)) {
        el = el.parentElement;
        continue;
      }
      // Report-page puts data-field on leaf spans/paragraphs inside a
      // structural wrapper. Without this fallback, findBlock picks the wrapper
      // (no data-field) → delete/drag can't attach to a JSON path, and undo
      // silently becomes a no-op. Prefer the nearest data-field ancestor of
      // the click target when the wrapper itself has none.
      if (!el.hasAttribute('data-field')) {
        const leaf = target.closest('[data-field]') as HTMLElement | null;
        if (leaf && el.contains(leaf)) return leaf;
      }
      return el;
    }
    el = parent;
  }
  return null;
}

/** Compute snap guides and offset corrections for alignment.
 *  All returned positions are in LOGICAL coordinates. The caller renders
 *  them by multiplying by the current display scale. Drag position deltas
 *  (snapDx/snapDy) are also logical since block.style.left/top are authored
 *  in logical pixels.
 */
function calcGuides(
  block: HTMLElement,
  canvas: HTMLElement,
  cachedSiblings?: { left: number; right: number; top: number; bottom: number; cx: number; cy: number }[],
): { guides: Guide[]; snapDx: number; snapDy: number } {
  const canvasRect = canvas.getBoundingClientRect();
  // canvas.clientWidth/Height are UNSCALED layout dimensions (transform
  // doesn't affect them). The ratio gives us the current display scale.
  const logicalW = canvas.clientWidth || 960;
  const logicalH = canvas.clientHeight || 540;
  const displayScale = canvasRect.width > 0 ? canvasRect.width / logicalW : 1;
  const toLogical = (px: number) => px / displayScale;

  const blockRect = block.getBoundingClientRect();

  const bLeft = toLogical(blockRect.left - canvasRect.left);
  const bRight = toLogical(blockRect.right - canvasRect.left);
  const bTop = toLogical(blockRect.top - canvasRect.top);
  const bBottom = toLogical(blockRect.bottom - canvasRect.top);
  const bCx = (bLeft + bRight) / 2;
  const bCy = (bTop + bBottom) / 2;

  const cCx = logicalW / 2;
  const cCy = logicalH / 2;

  // Snap targets: canvas edges + center (logical coords)
  const vTargets = [{ pos: 0 }, { pos: cCx }, { pos: logicalW }];
  const hTargets = [{ pos: 0 }, { pos: cCy }, { pos: logicalH }];

  // Sibling elements — use pre-cached rects when available (populated
  // once at drag start), fall back to DOM query for other callers.
  if (cachedSiblings && cachedSiblings.length > 0) {
    for (const s of cachedSiblings) {
      vTargets.push({ pos: s.left }, { pos: s.right }, { pos: s.cx });
      hTargets.push({ pos: s.top }, { pos: s.bottom }, { pos: s.cy });
    }
  } else {
    const root = canvas.firstElementChild;
    if (root) {
      const siblings = root.querySelectorAll('[data-field]');
      siblings.forEach((sib) => {
        if (sib === block || sib.contains(block) || block.contains(sib)) return;
        const r = sib.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;
        const sLeft = toLogical(r.left - canvasRect.left);
        const sRight = toLogical(r.right - canvasRect.left);
        const sTop = toLogical(r.top - canvasRect.top);
        const sBottom = toLogical(r.bottom - canvasRect.top);
        const sCx = (sLeft + sRight) / 2;
        const sCy = (sTop + sBottom) / 2;
        vTargets.push({ pos: sLeft }, { pos: sRight }, { pos: sCx });
        hTargets.push({ pos: sTop }, { pos: sBottom }, { pos: sCy });
      });
    }
  }

  const blockVEdges = [bLeft, bRight, bCx];
  const blockHEdges = [bTop, bBottom, bCy];
  let snapDx = 0;
  let snapDy = 0;
  const foundGuides: Guide[] = [];

  // Vertical guides (X alignment)
  let bestVDist = SNAP_THRESHOLD + 1;
  for (const edge of blockVEdges) {
    for (const target of vTargets) {
      const dist = Math.abs(edge - target.pos);
      if (dist < SNAP_THRESHOLD && dist < bestVDist) {
        bestVDist = dist;
        snapDx = target.pos - edge;
      }
    }
  }
  for (const edge of blockVEdges) {
    const snappedEdge = edge + snapDx;
    for (const target of vTargets) {
      if (Math.abs(snappedEdge - target.pos) < 1) {
        foundGuides.push({ type: 'v', pos: target.pos });
      }
    }
  }

  // Horizontal guides (Y alignment)
  let bestHDist = SNAP_THRESHOLD + 1;
  for (const edge of blockHEdges) {
    for (const target of hTargets) {
      const dist = Math.abs(edge - target.pos);
      if (dist < SNAP_THRESHOLD && dist < bestHDist) {
        bestHDist = dist;
        snapDy = target.pos - edge;
      }
    }
  }
  for (const edge of blockHEdges) {
    const snappedEdge = edge + snapDy;
    for (const target of hTargets) {
      if (Math.abs(snappedEdge - target.pos) < 1) {
        foundGuides.push({ type: 'h', pos: target.pos });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique: Guide[] = [];
  foundGuides.forEach((g) => {
    const key = `${g.type}-${Math.round(g.pos)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(g);
    }
  });

  return { guides: unique, snapDx, snapDy };
}

// ---------------------------------------------------------------------------
// N2 — review status badge (flag-gated)
// ---------------------------------------------------------------------------
const REVIEW_CYCLE: Array<ReviewStatus | undefined> = [
  undefined,
  'needs-review',
  'approved',
  'changes-requested',
];

function nextReviewStatus(current: ReviewStatus | undefined): ReviewStatus | undefined {
  const idx = REVIEW_CYCLE.indexOf(current);
  return REVIEW_CYCLE[(idx + 1) % REVIEW_CYCLE.length];
}

function reviewBadgeStyle(status: ReviewStatus | undefined): { bg: string; fg: string; border: string; label: string } {
  switch (status) {
    case 'needs-review':      return { bg: '#fff4d1', fg: '#8a6e1a', border: '#e8d58a', label: 'Needs review' };
    case 'approved':          return { bg: '#e6f0d9', fg: '#4c6b2d', border: '#b9cf9a', label: 'Approved' };
    case 'changes-requested': return { bg: '#fbe1d4', fg: '#8a4520', border: '#ebb99c', label: 'Changes' };
    default:                  return { bg: '#f4f3ee', fg: '#8a8880', border: '#d5d3c9', label: 'Mark review' };
  }
}

function ReviewBadge({ status, onCycle }: { status: ReviewStatus | undefined; onCycle: () => void }) {
  const { bg, fg, border, label } = reviewBadgeStyle(status);
  return (
    <button
      type="button"
      onClick={onCycle}
      title="Click to cycle review status"
      style={{
        position: 'absolute',
        top: 8, right: 8,
        padding: '4px 10px',
        borderRadius: 999,
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.4,
        cursor: 'pointer',
        fontFamily: 'inherit',
        zIndex: 60,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      {label}
    </button>
  );
}

// ===========================================================================
// Canvas Component
// ===========================================================================

export function Canvas({ slide, theme, zoomLevel = 1, onSelectionChange }: CanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const hoverElRef = useRef<HTMLElement | null>(null);
  // Pre-cached sibling rects for snap guides — populated at drag start,
  // reused on every onMove frame to avoid O(n²) querySelectorAll('*').
  const siblingRectsRef = useRef<{ left: number; right: number; top: number; bottom: number; cx: number; cy: number }[]>([]);

  // pptx-faithful and pdf-faithful share the same wrapper markers and
  // interaction path. Context menu (insertTextBox, duplicate, etc.)
  // assumes Lasca-native DOM shape, so we disable it for both.
  const isFaithfulLayout = slide.layout === 'pptx-faithful' || slide.layout === 'pdf-faithful';
  const disableContextMenu = isFaithfulLayout;

  // Store actions + deck for logical page size
  const deck = useEditorStore((s) => s.activeDeck());
  const currentIndex = useEditorStore((s) => s.currentIndex);
  const updateSlideField = useEditorStore((s) => s.updateSlideField);
  const setChatTargetField = useEditorStore((s) => s.setChatTargetField);
  const updateSlide = useEditorStore((s) => s.updateSlide);
  const addSlide = useEditorStore((s) => s.addSlide);
  const removeSlide = useEditorStore((s) => s.removeSlide);
  const setSlideReviewStatus = useEditorStore((s) => s.setSlideReviewStatus);
  const t = useT();

  // N2 — review status badge (off by default)
  const reviewStatusEnabled = useFlagEnabled('LASCA_REVIEW_STATUS', false);

  // Logical (authoring) dims — come from the deck's pageSize.
  const logical = getLogicalDims(deck);

  // The fit-to-box scale is driven by a ResizeObserver on the Canvas's
  // direct parent (Editor.tsx's center area). Zoom is applied on top of
  // this in the derived `display` below — so we only need to track the
  // fit portion in state; zoom changes re-derive display without an
  // additional layout effect.
  const [fitScale, setFitScale] = useState(1);

  useLayoutEffect(() => {
    // Walk up to the flex center area (Editor.tsx) whose size is driven
    // purely by window / sidebar / chat-panel layout — NOT by us. DOM:
    //   <flex center area flex:1 overflow:auto>   ← host (observed)
    //     <div position:relative flexShrink:0>    ← Editor's Canvas wrapper
    //       <SlideNav />
    //       <Canvas root>                          ← outer.parentElement
    //         <div ref={outerRef}>                 ← outerRef
    // Observing the host (3 hops up) avoids a feedback loop that would
    // happen if we observed our own size-controlled ancestors.
    const outer = outerRef.current;
    if (!outer) return;
    const host = outer.parentElement?.parentElement?.parentElement;
    if (!host) return;
    const update = () => {
      const r = host.getBoundingClientRect();
      // Leave a small breathing room so shadow-lg / selection outlines don't clip.
      const availW = Math.max(0, r.width - 32);
      const availH = Math.max(0, r.height - 32);
      if (availW < 40 || availH < 40) return;
      setFitScale(Math.min(availW / logical.w, availH / logical.h));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, [logical.w, logical.h]);

  // Derived on every render — cheap, primitive values. Editable fields
  // in deps arrays (image-escape effect below) compare fine because
  // display.w / display.h are plain numbers.
  const effectiveScale = fitScale * zoomLevel;
  const display = {
    w: Math.floor(logical.w * effectiveScale),
    h: Math.floor(logical.h * effectiveScale),
    scale: effectiveScale,
  };

  // Local UI state
  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [editingEl, setEditingEl] = useState<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ x: 0, y: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const [chartPanelOpen, setChartPanelOpen] = useState(false);
  const isChartSlide = isChartOrDiagram(slide.layout) || hasEmbeddedChart(slide.layout, slide.data as Record<string, unknown>);

  // -----------------------------------------------------------------------
  // IMPERATIVE DOM MANAGEMENT
  // Slide HTML is set via innerHTML in useEffect, NOT dangerouslySetInnerHTML.
  // This prevents React re-renders from destroying DOM state (selection
  // outlines, contenteditable, drag positions, etc.)
  // -----------------------------------------------------------------------
  const htmlRef = useRef('');
  const skipNextUpdate = useRef(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    const totalSlides = deck?.slides.length ?? 0;
    if (skipNextUpdate.current) {
      skipNextUpdate.current = false;
      htmlRef.current = renderSlide(slide, theme, logical, undefined, currentIndex, totalSlides);
      return;
    }
    const newHtml = renderSlide(slide, theme, logical, undefined, currentIndex, totalSlides);
    if (newHtml !== htmlRef.current) {
      canvasRef.current.innerHTML = newHtml;
      htmlRef.current = newHtml;
      // _dragOffsets / _hiddenFields are applied by dedicated effects
      // below — they need to run on changes even when innerHTML didn't.
      // DOM was replaced — clear stale references
      setSelectedEl(null);
      setEditingEl(null);
      setShowToolbar(false);
      hoverElRef.current = null;
      onSelectionChange?.(null);
    }
  }, [slide, theme, onSelectionChange, logical.w, logical.h]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply per-element drag offsets, sizes, and inline style overrides.
  // Re-runs on every change so undo/redo flips state without a full HTML
  // re-render. Marks touched elements/props so cleanup is precise when an
  // entry disappears (otherwise stale inline styles would stick around).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Clean up previously-applied offsets/sizes/styles. We stash the list of
    // mutated style props on the element via a JSON marker so we only clear
    // what we set — leaving renderSlide-supplied inline styles alone.
    const prevMarked = canvas.querySelectorAll('[data-lasca-dragged="1"]');
    prevMarked.forEach((el) => {
      const h = el as HTMLElement;
      h.style.position = '';
      h.style.left = '';
      h.style.top = '';
      h.style.width = '';
      h.style.height = '';
      const overrideProps = h.getAttribute('data-lasca-style-props');
      if (overrideProps) {
        for (const prop of overrideProps.split(',')) {
          (h.style as unknown as Record<string, string>)[prop] = '';
        }
        h.removeAttribute('data-lasca-style-props');
      }
      h.removeAttribute('data-lasca-dragged');
    });
    const findField = (path: string): HTMLElement | null =>
      canvas.querySelector(`[data-field="${CSS.escape(path)}"]`);
    if (slide._dragOffsets) {
      for (const [path, offset] of Object.entries(slide._dragOffsets)) {
        const el = findField(path);
        if (el) {
          el.style.position = 'relative';
          el.style.left = offset.x + 'px';
          el.style.top = offset.y + 'px';
          el.setAttribute('data-lasca-dragged', '1');
        }
      }
    }
    if (slide._dragSizes) {
      for (const [path, size] of Object.entries(slide._dragSizes)) {
        const el = findField(path);
        if (el) {
          if (size.w !== undefined) el.style.width = size.w + 'px';
          if (size.h !== undefined) el.style.height = size.h + 'px';
          el.setAttribute('data-lasca-dragged', '1');
        }
      }
    }
    if (slide._fieldStyles) {
      for (const [path, styles] of Object.entries(slide._fieldStyles)) {
        const el = findField(path);
        if (!el) continue;
        const appliedProps: string[] = [];
        for (const [prop, val] of Object.entries(styles)) {
          if (val === undefined || val === '') continue;
          (el.style as unknown as Record<string, string>)[prop] = val;
          appliedProps.push(prop);
        }
        if (appliedProps.length > 0) {
          el.setAttribute('data-lasca-style-props', appliedProps.join(','));
          el.setAttribute('data-lasca-dragged', '1');
        }
      }
    }
  }, [slide._dragOffsets, slide._dragSizes, slide._fieldStyles, slide]);

  // Apply canvas-delete via display:none so undo can bring elements back
  // without needing to re-render from slide.data.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prevHidden = canvas.querySelectorAll('[data-lasca-hidden="1"]');
    prevHidden.forEach((el) => {
      (el as HTMLElement).style.display = '';
      el.removeAttribute('data-lasca-hidden');
    });
    if (slide._hiddenFields) {
      for (const path of slide._hiddenFields) {
        const el = canvas.querySelector(`[data-field="${CSS.escape(path)}"]`) as HTMLElement | null;
        if (el) {
          el.style.display = 'none';
          el.setAttribute('data-lasca-hidden', '1');
        }
      }
    }
  }, [slide._hiddenFields, slide]);

  // -----------------------------------------------------------------------
  // Post-edit reveal animation: blur-to-clear + flash
  // Triggered by ChatPanel after a successful AI edit via custom event.
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: Event) => {
      const { pageIndex } = (e as CustomEvent).detail as { pageIndex: number };
      if (pageIndex !== currentIndex) return; // not our page
      const el = canvasRef.current;
      if (!el) return;

      // Phase 1: blur-to-clear on the canvas content
      el.animate([
        { filter: 'blur(8px)', opacity: 0.4 },
        { filter: 'blur(0px)', opacity: 1 },
      ], { duration: 600, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' });

      // Phase 2: flash overlay after blur clears. Append to <body>, not the
      // React-managed canvas wrapper, to avoid commit/removeChild races.
      const hostRect = el.parentElement?.getBoundingClientRect();
      if (!hostRect) return;
      const flash = document.createElement('div');
      flash.style.cssText = [
        'position:fixed',
        `left:${hostRect.left}px`,
        `top:${hostRect.top}px`,
        `width:${hostRect.width}px`,
        `height:${hostRect.height}px`,
        'pointer-events:none',
        'z-index:9999',
        `border-radius:${getComputedStyle(el.parentElement!).borderRadius || '0px'}`,
      ].join(';');
      document.body.appendChild(flash);
      flash.animate([
        { background: 'rgba(217,119,87,0.15)', offset: 0 },
        { background: 'rgba(217,119,87,0.08)', offset: 0.5 },
        { background: 'transparent', offset: 1 },
      ], { duration: 500, delay: 400, easing: 'ease-out', fill: 'forwards' })
        .addEventListener('finish', () => flash.remove());
    };
    window.addEventListener('lasca:slide-edited', handler);
    return () => window.removeEventListener('lasca:slide-edited', handler);
  }, [currentIndex]);

  // -----------------------------------------------------------------------
  // faithful slide image-escape layer (REMOVED)
  // The old CSS filter approach (invert/hue-rotate/sepia) required cloning
  // images outside the filter stacking context to preserve true colors.
  // With v2.5's switch to subtle tint overlays (mix-blend-mode at very low
  // alpha), images are virtually unaffected and the escape layer is no
  // longer necessary. If the tint is ever made stronger, re-add this.
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Sync HTML edits back to JSON store
  // -----------------------------------------------------------------------
  const updateFaithfulRawHtml = useEditorStore((s) => s.updateFaithfulRawHtml);
  const updateSlideFields = useEditorStore((s) => s.updateSlideFields);
  const syncSlideHtml = useCallback(() => {
    if (!canvasRef.current) return;
    skipNextUpdate.current = true; // Skip next useEffect DOM update

    // pptx-faithful slides have no data-field bindings — serialize the
    // entire inner wrapper innerHTML back to the store so drag/edit/
    // delete survives the next re-render.
    if (isFaithfulLayout) {
      const inner = canvasRef.current.querySelector('[data-pptx-inner="1"]');
      if (inner) {
        updateFaithfulRawHtml(currentIndex, inner.innerHTML);
      }
      return;
    }

    // Batch all data-field writes into ONE history entry so a single canvas
    // op (drag/delete/format) costs exactly one Cmd+Z to undo.
    const patches: Record<string, string> = {};
    const fields = canvasRef.current.querySelectorAll('[data-field]');
    fields.forEach((el) => {
      // C2: skip data-fields trapped inside a data-no-edit region. SVG
      // <text> children inside an svg-figure would otherwise be serialized
      // as innerText back into slide.data.svg's parent path, mangling JSON.
      if ((el as HTMLElement).closest('[data-no-edit]')) return;
      const fieldPath = el.getAttribute('data-field');
      if (!fieldPath) return;
      patches[fieldPath] = (el as HTMLElement).innerText.trim();
    });
    if (Object.keys(patches).length > 0) {
      updateSlideFields(currentIndex, patches);
    }
  }, [currentIndex, updateSlideFields, isFaithfulLayout, updateFaithfulRawHtml]);

  // -----------------------------------------------------------------------
  // Clear selection
  // -----------------------------------------------------------------------
  const clearSelected = useCallback(() => {
    if (canvasRef.current) {
      const prev = canvasRef.current.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (prev) {
        prev.style.outline = '';
        prev.style.outlineOffset = '';
        prev.removeAttribute('data-selected');
      }
    }
    setSelectedEl(null);
    onSelectionChange?.(null);
  }, [onSelectionChange]);

  // -----------------------------------------------------------------------
  // Enter / exit text editing
  // -----------------------------------------------------------------------
  const enterTextEditing = useCallback(
    (el: HTMLElement) => {
      // v2.4.2: guard against non-text nodes. Historically a double-click
      // on an extracted PDF <img data-field="pdf.p0.img0"> would end up
      // calling enterTextEditing on the image. contentEditable on <img>
      // does nothing useful and (because of what exitTextEditing wrote)
      // the follow-up updateSlideField silently corrupted slide.data.
      // Just bail for non-editable tags.
      const tag = el.tagName;
      if (tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'SVG') {
        return;
      }
      clearSelected();
      el.setAttribute('contenteditable', 'true');
      el.style.outline = '2px solid #6a9bcc';
      el.style.outlineOffset = '2px';
      el.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setEditingEl(el);
    },
    [clearSelected],
  );

  const exitTextEditing = useCallback(() => {
    if (editingEl) {
      editingEl.removeAttribute('contenteditable');
      editingEl.style.outline = '';
      editingEl.style.outlineOffset = '';

      // Write back to store. Faithful slides (pptx-faithful / pdf-faithful)
      // don't use the `data-field → JSON path` shape — their data-field
      // values are DOM locators like "pdf.p0.l3", not nested paths. Their
      // sync goes through updateFaithfulRawHtml via syncSlideHtml. Calling
      // updateSlideField on them silently corrupts slide.data, so we gate.
      const faithful = slide.layout === 'pptx-faithful' || slide.layout === 'pdf-faithful';
      if (faithful) {
        syncSlideHtml();
      } else {
        const fieldPath = editingEl.getAttribute('data-field');
        if (fieldPath) {
          const newValue = editingEl.innerText.trim();
          updateSlideField(currentIndex, fieldPath, newValue);
        }
      }
    }
    setEditingEl(null);
    setShowToolbar(false);
  }, [editingEl, currentIndex, updateSlideField, slide.layout, syncSlideHtml]);

  // -----------------------------------------------------------------------
  // Reset state when slide changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    clearSelected();
    setEditingEl(null);
    setShowToolbar(false);
    setContextMenu(null);
    setGuides([]);
    dragState.current = null;
    hoverElRef.current = null;
  }, [currentIndex, slide.layout, clearSelected]);

  // -----------------------------------------------------------------------
  // Selection change listener -- show/hide FormatToolbar
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleSelect = () => {
      if (!editingEl) {
        setShowToolbar(false);
        return;
      }
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0 && canvasRef.current?.contains(sel.anchorNode)) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const canvasRect = canvasRef.current!.getBoundingClientRect();
        setToolbarPos({
          x: rect.left - canvasRect.left + rect.width / 2,
          y: rect.top - canvasRect.top - 44,
        });
        setShowToolbar(true);
      } else {
        setShowToolbar(false);
      }
    };
    document.addEventListener('selectionchange', handleSelect);
    return () => document.removeEventListener('selectionchange', handleSelect);
  }, [editingEl]);

  // -----------------------------------------------------------------------
  // Global keyboard shortcuts (Delete, Escape)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Delete selected element
      if (
        selectedEl &&
        !editingEl &&
        (e.key === 'Delete' || e.key === 'Backspace')
      ) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        const isInInput = tag === 'TEXTAREA' || tag === 'INPUT' || (document.activeElement as HTMLElement)?.contentEditable === 'true';
        if (!isInInput) {
          e.preventDefault();
          const fieldPath = selectedEl.getAttribute('data-field');
          if (!isFaithfulLayout && fieldPath) {
            // Native path: record the hidden field in slide state so the
            // element survives into undo history (post-render drops it
            // from the DOM). One pushHistory via updateSlide.
            const hidden = [...(slide._hiddenFields || []), fieldPath];
            updateSlide(currentIndex, { ...slide, _hiddenFields: hidden });
            clearSelected();
          } else {
            // Faithful path or non-data-field native element: preserve
            // prior behavior — DOM remove + raw HTML serialization.
            selectedEl.remove();
            clearSelected();
            syncSlideHtml();
          }
          return;
        }
      }
      // Escape handling
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (editingEl) {
          exitTextEditing();
          return;
        }
        if (selectedEl) {
          clearSelected();
          return;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedEl, editingEl, contextMenu, clearSelected, exitTextEditing, syncSlideHtml, isFaithfulLayout, slide, updateSlide, currentIndex]);

  // -----------------------------------------------------------------------
  // Format command (for FormatToolbar)
  // -----------------------------------------------------------------------
  const execFormat = useCallback(
    (cmd: string, val?: string) => {
      document.execCommand(cmd, false, val);
      syncSlideHtml();
    },
    [syncSlideHtml],
  );

  // -----------------------------------------------------------------------
  // Mouse move -- hover highlight
  // -----------------------------------------------------------------------
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (editingEl || dragState.current) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const block = findBlock(e.target as HTMLElement, canvas);

      // Clear previous hover
      if (hoverElRef.current && hoverElRef.current !== block && hoverElRef.current.getAttribute('data-selected') !== 'true') {
        hoverElRef.current.style.outline = '';
        hoverElRef.current.style.outlineOffset = '';
      }

      if (block && block.getAttribute('data-selected') !== 'true') {
        block.style.outline = '1.5px dashed rgba(106,155,204,0.6)';
        block.style.outlineOffset = '2px';
        hoverElRef.current = block;
        canvas.style.cursor = 'grab';
      } else {
        hoverElRef.current = null;
        canvas.style.cursor = 'default';
      }
    },
    [editingEl],
  );

  // -----------------------------------------------------------------------
  // Mouse leave -- clear hover
  // -----------------------------------------------------------------------
  const handleMouseLeave = useCallback(() => {
    if (hoverElRef.current && hoverElRef.current.getAttribute('data-selected') !== 'true') {
      hoverElRef.current.style.outline = '';
      hoverElRef.current.style.outlineOffset = '';
    }
    hoverElRef.current = null;
  }, []);

  // -----------------------------------------------------------------------
  // Mouse down -- select + start drag
  // -----------------------------------------------------------------------
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      // If text-editing, check if click is outside the editing element
      if (editingEl) {
        if (!editingEl.contains(e.target as Node)) {
          exitTextEditing();
        }
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const block = findBlock(e.target as HTMLElement, canvas);
      if (!block) {
        clearSelected();
        setChatTargetField(null);
        return;
      }

      // Select it
      clearSelected();
      block.style.outline = '2px solid #d97757';
      block.style.outlineOffset = '2px';
      block.setAttribute('data-selected', 'true');
      setSelectedEl(block);
      onSelectionChange?.(block);

      // B1 — remember the clicked field as the chat-edit target so the next
      // chat message rewrites only this leaf. Native layouts only: faithful
      // slides use DOM-locator paths ("pdf.p0.l3") that don't resolve to
      // slide.data JSON paths. Skip chart/report/card-canvas-wrapper clicks
      // — data-field must be a dotted JSON path to be patchable.
      const faithful = slide.layout === 'pptx-faithful' || slide.layout === 'pdf-faithful';
      const blockField = block.getAttribute('data-field');
      if (!faithful && blockField && !blockField.startsWith('pdf.') && !blockField.startsWith('pptx.')) {
        setChatTargetField(blockField);
      } else {
        setChatTargetField(null);
      }

      // Prepare for potential drag
      const comp = getComputedStyle(block);
      if (comp.position === 'static') {
        block.style.position = 'relative';
      }
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseFloat(block.style.left) || 0;
      const origTop = parseFloat(block.style.top) || 0;

      // pptx-faithful slides wrap content in possibly MULTIPLE nested
      // transform:scale(...) divs — the child's left/top coordinate system
      // is 1/scale as fast as the cursor. Compute the effective scale by
      // multiplying every transform-scale ancestor between the block and
      // the canvas.
      const faithfulWrapper = block.closest('[data-pptx-faithful]') as HTMLElement | null;
      // Walk ALL transform-scale ancestors between block and canvas,
      // then include the canvas's own scale(effectiveScale). This makes
      // drag 1:1 with the cursor at any zoom/fit level.
      let dragScale = 1;
      let cur: HTMLElement | null = block.parentElement;
      while (cur && cur !== canvas) {
        const tr = getComputedStyle(cur).transform;
        if (tr && tr !== 'none') {
          try {
            const m = new DOMMatrix(tr);
            if (m.a && m.a > 0) dragScale *= m.a;
          } catch { /* ignore */ }
        }
        cur = cur.parentElement;
      }
      // Include the canvas's own transform: scale(effectiveScale)
      dragScale *= display.scale;

      // Pre-cache sibling rects for snap guides (once per drag, not per frame)
      if (!faithfulWrapper) {
        const root = canvas.firstElementChild;
        if (root) {
          const canvasRect = canvas.getBoundingClientRect();
          const logicalW = canvas.clientWidth || 960;
          const ds = canvasRect.width > 0 ? canvasRect.width / logicalW : 1;
          const toLog = (px: number) => px / ds;
          const cached: typeof siblingRectsRef.current = [];
          root.querySelectorAll('[data-field]').forEach((sib) => {
            if (sib === block || sib.contains(block) || block.contains(sib as Node)) return;
            const r = (sib as HTMLElement).getBoundingClientRect();
            if (r.width < 10 || r.height < 10) return;
            const left = toLog(r.left - canvasRect.left);
            const right = toLog(r.right - canvasRect.left);
            const top = toLog(r.top - canvasRect.top);
            const bottom = toLog(r.bottom - canvasRect.top);
            cached.push({ left, right, top, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 });
          });
          siblingRectsRef.current = cached;
        }
      }

      dragState.current = { block, startX, startY, origLeft, origTop, moved: false };

      const onMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const rawDx = ev.clientX - dragState.current.startX;
        const rawDy = ev.clientY - dragState.current.startY;
        const dx = rawDx / dragScale;
        const dy = rawDy / dragScale;
        // Higher threshold to avoid accidental drags (check raw pixels)
        if (!dragState.current.moved && Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return;
        if (!dragState.current.moved) {
          dragState.current.moved = true;
          dragState.current.block.style.transition = 'none';
          dragState.current.block.style.cursor = 'grabbing';
        }
        // Apply position
        dragState.current.block.style.left = dragState.current.origLeft + dx + 'px';
        dragState.current.block.style.top = dragState.current.origTop + dy + 'px';
        // Snap guides are based on canvas-coordinate math and don't make
        // sense inside a scaled wrapper — skip them for faithful slides.
        if (!faithfulWrapper) {
          const { guides: g, snapDx, snapDy } = calcGuides(dragState.current.block, canvas, siblingRectsRef.current);
          if (snapDx !== 0 || snapDy !== 0) {
            dragState.current.block.style.left = dragState.current.origLeft + dx + snapDx + 'px';
            dragState.current.block.style.top = dragState.current.origTop + dy + snapDy + 'px';
          }
          setGuides(g);
        }
        dragState.current.block.style.opacity = '0.85';
        dragState.current.block.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
      };

      const onUp = () => {
        const wasDragged = dragState.current?.moved;
        const draggedBlock = dragState.current?.block;
        if (dragState.current) {
          dragState.current.block.style.opacity = '';
          dragState.current.block.style.boxShadow = '';
          dragState.current.block.style.cursor = '';
          dragState.current.block.style.transition = '';
        }
        dragState.current = null;
        siblingRectsRef.current = [];
        setGuides([]);
        // Only sync if we actually dragged — otherwise the re-render
        // wipes DOM state (selection outline, etc.)
        if (wasDragged) {
          // Faithful slides serialize the whole innerHTML (drag position
          // lives in inline style.left/top inside that raw HTML).
          // Native slides persist per-element offset via _dragOffsets so
          // the position survives re-render AND drops into undo history
          // as a single entry.
          if (isFaithfulLayout) {
            syncSlideHtml();
          } else if (draggedBlock) {
            // Walk up to find a data-field ancestor we can store the offset
            // against. Without this fallback any drag of a wrapper element
            // (no data-field) would be DOM-only — invisible to undo and wiped
            // on the next render. Falling through stores nothing and warns.
            const fieldHost = draggedBlock.getAttribute('data-field')
              ? draggedBlock
              : (draggedBlock.closest('[data-field]') as HTMLElement | null);
            const fieldPath = fieldHost?.getAttribute('data-field');
            if (fieldHost && fieldPath) {
              const x = parseFloat(draggedBlock.style.left) || 0;
              const y = parseFloat(draggedBlock.style.top) || 0;
              const offsets = { ...(slide._dragOffsets || {}), [fieldPath]: { x, y } };
              updateSlide(currentIndex, { ...slide, _dragOffsets: offsets });
            } else {
              // No data-field anywhere up the tree — refuse silently in JSON
              // but keep the visual move so the user knows something happened.
              // The next re-render will revert it; that's the honest signal
              // that this element isn't drag-persistable yet.
              console.warn('[Canvas] drag dropped without data-field anchor — change is not undoable');
            }
          }
        }
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      e.preventDefault();
    },
    [contextMenu, editingEl, clearSelected, exitTextEditing, syncSlideHtml, setChatTargetField, slide, isFaithfulLayout, updateSlide, currentIndex],
  );

  // -----------------------------------------------------------------------
  // Double-click -- enter text editing
  // -----------------------------------------------------------------------
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (editingEl) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Prefer data-field elements for JSON binding
      const target = e.target as HTMLElement;
      // C2: never enter text-edit inside a data-no-edit region (svg-figure).
      // Even if the click lands on an inner <text> element with inherited
      // data-field, contentEditable on SVG is broken AND would desync the
      // JSON — the whole figure is edited by replacing the svg string.
      if (isNoEditZone(target, canvas)) return;
      const fieldEl = target.closest('[data-field]') as HTMLElement | null;
      if (fieldEl && canvas.contains(fieldEl)) {
        enterTextEditing(fieldEl);
        return;
      }

      // Fallback: enter text editing on any block
      const block = findBlock(target, canvas);
      if (block) {
        enterTextEditing(block);
      }
    },
    [editingEl, enterTextEditing],
  );

  // -----------------------------------------------------------------------
  // Context menu
  // -----------------------------------------------------------------------
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (disableContextMenu) return;
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const block = findBlock(e.target as HTMLElement, canvas);
      setContextMenu({ x: e.clientX, y: e.clientY, el: block });
    },
    [disableContextMenu],
  );

  // -----------------------------------------------------------------------
  // Context menu action handler
  // -----------------------------------------------------------------------
  const handleContextAction = useCallback(
    (action: string) => {
      const el = contextMenu?.el;
      setContextMenu(null);

      switch (action) {
        case 'editText': {
          if (el) enterTextEditing(el);
          break;
        }
        case 'insertTextBox': {
          if (!canvasRef.current) break;
          useEditorStore.getState().pushHistory();
          const textBox = document.createElement('div');
          textBox.style.cssText =
            'position:absolute;left:100px;top:100px;padding:12px 16px;min-width:120px;min-height:40px;font-size:18px;color:#141413;background:rgba(255,255,255,0.9);border:1px dashed #b0aea5;border-radius:4px;cursor:text;';
          textBox.setAttribute('contenteditable', 'true');
          textBox.textContent = t('canvas.type_here');
          const root = canvasRef.current.firstElementChild || canvasRef.current;
          root.appendChild(textBox);
          syncSlideHtml();
          break;
        }
        case 'insertImage': {
          useEditorStore.getState().pushHistory();
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.onchange = (ev) => {
            const file = (ev.target as HTMLInputElement).files?.[0];
            if (!file || !canvasRef.current) return;
            const reader = new FileReader();
            reader.onload = () => {
              const img = document.createElement('img');
              img.src = reader.result as string;
              img.style.cssText = 'max-width:400px;max-height:300px;display:block;margin:20px auto;border-radius:8px;';
              const root = canvasRef.current!.firstElementChild || canvasRef.current!;
              root.appendChild(img);
              syncSlideHtml();
            };
            reader.readAsDataURL(file);
          };
          input.click();
          break;
        }
        case 'duplicateElement': {
          useEditorStore.getState().pushHistory();
          if (el && el.parentElement) {
            const clone = el.cloneNode(true) as HTMLElement;
            // Offset the clone slightly so it's visible
            const left = parseFloat(clone.style.left) || 0;
            const top = parseFloat(clone.style.top) || 0;
            clone.style.left = left + 20 + 'px';
            clone.style.top = top + 20 + 'px';
            el.parentElement.insertBefore(clone, el.nextSibling);
            syncSlideHtml();
          }
          break;
        }
        case 'deleteElement': {
          if (!el) break;
          const fieldPath = el.getAttribute('data-field');
          if (!isFaithfulLayout && fieldPath) {
            const hidden = [...(slide._hiddenFields || []), fieldPath];
            updateSlide(currentIndex, { ...slide, _hiddenFields: hidden });
            clearSelected();
          } else {
            el.remove();
            clearSelected();
            syncSlideHtml();
          }
          break;
        }
        case 'bringToFront': {
          useEditorStore.getState().pushHistory();
          if (el) {
            el.style.zIndex = '999';
            syncSlideHtml();
          }
          break;
        }
        case 'sendToBack': {
          useEditorStore.getState().pushHistory();
          if (el) {
            el.style.zIndex = '0';
            syncSlideHtml();
          }
          break;
        }
        case 'addPage': {
          const base: Slide = { layout: 'cover', data: { title: t('canvas.new_page'), subtitle: '', footnote: '', author: '' } };
          let staged = base;
          if (deck.presetId) {
            const preset = getPreset(deck.presetId as StylePresetId);
            const pref = preset.preferredLayouts[0] as Layout | undefined;
            if (pref && pref !== 'cover') {
              staged = { layout: pref, data: swapLayout(base.data as Record<string, unknown>, 'cover', pref) };
            }
          }
          addSlide(currentIndex, maybeAdaptToCardCanvas(staged));
          break;
        }
        case 'deletePage': {
          removeSlide(currentIndex);
          break;
        }
      }
    },
    [contextMenu, enterTextEditing, clearSelected, syncSlideHtml, addSlide, removeSlide, currentIndex],
  );

  // -----------------------------------------------------------------------
  // Blur handler for contentEditable data-field elements
  // -----------------------------------------------------------------------
  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      const target = e.target as HTMLElement;
      const fieldPath = target.getAttribute('data-field');
      if (!fieldPath) return;
      const newValue = target.innerText.trim();
      updateSlideField(currentIndex, fieldPath, newValue);
      // Clean up editing state if this was the editing element
      if (target === editingEl) {
        target.removeAttribute('contenteditable');
        target.style.outline = '';
        target.style.outlineOffset = '';
        setEditingEl(null);
        setShowToolbar(false);
        // Restore focus to canvas so keyboard navigation works immediately
        canvasRef.current?.focus();
      }
    },
    [currentIndex, updateSlideField, editingEl],
  );

  // -----------------------------------------------------------------------
  // KeyDown handler for contentEditable
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl/Cmd + B/I/U formatting shortcuts when text editing
      if (editingEl && (e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          document.execCommand('bold');
          syncSlideHtml();
          return;
        }
        if (key === 'i') {
          e.preventDefault();
          document.execCommand('italic');
          syncSlideHtml();
          return;
        }
        if (key === 'u') {
          e.preventDefault();
          document.execCommand('underline');
          syncSlideHtml();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        const target = e.target as HTMLElement;
        const fieldPath = target.getAttribute('data-field');
        if (!fieldPath) return;
        const multiLine = ['body', 'content', 'sub'].some((k) => fieldPath.endsWith(k));
        if (!multiLine) {
          e.preventDefault();
          target.blur();
        }
      }
      if (e.key === 'Escape') {
        (e.target as HTMLElement).blur();
      }
    },
    [editingEl, syncSlideHtml],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div style={{ position: 'relative', width: display.w, height: display.h }}>
      {/* Outer display box — fixed display.w × display.h, takes the shadow */}
      <div
        ref={outerRef}
        className={`relative bg-white shadow-lg${deck?.presetId === 'bilingual-report' ? ' preset-bilingual-report' : ''}${deck?.theme && getSceneClass(deck.theme) ? ` ${getSceneClass(deck.theme)}` : ''}`}
        style={{
          width: display.w,
          height: display.h,
          overflow: 'hidden',
        }}
      >
        {/* Inner logical box — logical.w × logical.h scaled to fit */}
        <div
          ref={canvasRef}
          className="select-none"
          style={{
            width: logical.w,
            height: logical.h,
            transform: `scale(${display.scale})`,
            transformOrigin: 'top left',
            position: 'relative',
            overflow: 'hidden',
          }}
          onBlur={handleBlur}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onMouseDown={handleMouseDown}
          onContextMenu={handleContextMenu}
        />
      </div>

      {/* N2 — review status badge. Flag-gated; click cycles through states. */}
      {reviewStatusEnabled && (
        <ReviewBadge
          status={slide.reviewStatus}
          onCycle={() => setSlideReviewStatus(currentIndex, nextReviewStatus(slide.reviewStatus))}
        />
      )}

      {/* Alignment guide overlay lines — positioned in DISPLAY coords */}
      {guides.map((g, i) =>
        g.type === 'v' ? (
          <div
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              left: g.pos * display.scale,
              top: 0,
              width: 1,
              height: display.h,
              background: 'rgba(217,119,87,0.6)',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        ) : (
          <div
            key={`guide-${i}`}
            style={{
              position: 'absolute',
              left: 0,
              top: g.pos * display.scale,
              width: display.w,
              height: 1,
              background: 'rgba(217,119,87,0.6)',
              pointerEvents: 'none',
              zIndex: 50,
            }}
          />
        ),
      )}

      {/* Resize handles — shown when an element is selected (not during text edit) */}
      {selectedEl && !editingEl && (() => {
        const outerRect = outerRef.current?.getBoundingClientRect();
        const elRect = selectedEl.getBoundingClientRect();
        if (!outerRect) return null;
        const x = elRect.left - outerRect.left;
        const y = elRect.top - outerRect.top;
        const w = elRect.width;
        const h = elRect.height;
        const S = 8; // handle size
        const handles: { dir: string; left: number; top: number; cursor: string }[] = [
          { dir: 'nw', left: x - S / 2, top: y - S / 2, cursor: 'nwse-resize' },
          { dir: 'ne', left: x + w - S / 2, top: y - S / 2, cursor: 'nesw-resize' },
          { dir: 'sw', left: x - S / 2, top: y + h - S / 2, cursor: 'nesw-resize' },
          { dir: 'se', left: x + w - S / 2, top: y + h - S / 2, cursor: 'nwse-resize' },
          { dir: 'n', left: x + w / 2 - S / 2, top: y - S / 2, cursor: 'ns-resize' },
          { dir: 's', left: x + w / 2 - S / 2, top: y + h - S / 2, cursor: 'ns-resize' },
          { dir: 'w', left: x - S / 2, top: y + h / 2 - S / 2, cursor: 'ew-resize' },
          { dir: 'e', left: x + w - S / 2, top: y + h / 2 - S / 2, cursor: 'ew-resize' },
        ];
        return handles.map(({ dir, left, top, cursor }) => (
          <div
            key={`handle-${dir}`}
            style={{
              position: 'absolute', left, top, width: S, height: S,
              background: '#fff', border: '1.5px solid #d97757', borderRadius: 2,
              cursor, zIndex: 60, boxSizing: 'border-box',
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const startX = e.clientX;
              const startY = e.clientY;
              const scale = display.scale;

              // Chart/diagram slides: resize = adjust chartScale (uniform scale)
              if (isChartSlide) {
                const origScale = slide.chartScale ?? 1;
                const origW = selectedEl.offsetWidth;
                const onMove = (ev: MouseEvent) => {
                  const dx = (ev.clientX - startX) / scale;
                  const ratio = (origW + dx) / origW;
                  const ns = Math.max(0.5, Math.min(1.5, origScale * ratio));
                  // Apply visually via CSS
                  const chartBody = selectedEl.closest('[data-chart-body]') || selectedEl;
                  (chartBody as HTMLElement).style.transform = `scale(${ns})`;
                  (chartBody as HTMLElement).style.transformOrigin = 'center';
                };
                const onUp = (ev: MouseEvent) => {
                  window.removeEventListener('mousemove', onMove);
                  window.removeEventListener('mouseup', onUp);
                  const dx = (ev.clientX - startX) / scale;
                  const ratio = (origW + dx) / origW;
                  const ns = Math.max(0.5, Math.min(1.5, origScale * ratio));
                  updateSlide(currentIndex, { ...slide, chartScale: Math.round(ns * 100) / 100 });
                };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                return;
              }

              // Normal elements: resize width/height/position
              const origW = selectedEl.offsetWidth;
              const origH = selectedEl.offsetHeight;
              const origLeft = parseFloat(selectedEl.style.left) || 0;
              const origTop = parseFloat(selectedEl.style.top) || 0;
              // Faithful slides serialize the entire HTML, so onUp can stay
              // with syncSlideHtml. For native slides, persist via _dragSizes
              // / _dragOffsets so the resize is undoable AND survives the next
              // re-render (syncSlideHtml only round-trips innerText for native
              // layouts and would silently drop the size change).
              const fieldPath = selectedEl.getAttribute('data-field');
              const onMove = (ev: MouseEvent) => {
                const dx = (ev.clientX - startX) / scale;
                const dy = (ev.clientY - startY) / scale;
                let nw = origW, nh = origH, nl = origLeft, nt = origTop;
                if (dir.includes('e')) nw = Math.max(20, origW + dx);
                if (dir.includes('w')) { nw = Math.max(20, origW - dx); nl = origLeft + (origW - nw); }
                if (dir.includes('s')) nh = Math.max(20, origH + dy);
                if (dir.includes('n')) { nh = Math.max(20, origH - dy); nt = origTop + (origH - nh); }
                if (dir.includes('w') || dir.includes('n')) {
                  selectedEl.style.position = 'relative';
                }
                selectedEl.style.width = nw + 'px';
                selectedEl.style.height = nh + 'px';
                selectedEl.style.left = nl + 'px';
                selectedEl.style.top = nt + 'px';
              };
              const onUp = (ev: MouseEvent) => {
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
                if (isFaithfulLayout) {
                  syncSlideHtml();
                  return;
                }
                if (!fieldPath) {
                  // No data-field on this element — fall back to syncSlideHtml
                  // (which for native slides is a no-op for size, but keeps
                  // text in sync). The resize won't be undoable in this case;
                  // the parent should add a data-field if it wants to be sized.
                  syncSlideHtml();
                  return;
                }
                const dx = (ev.clientX - startX) / scale;
                const dy = (ev.clientY - startY) / scale;
                let nw = origW, nh = origH, nl = origLeft, nt = origTop;
                if (dir.includes('e')) nw = Math.max(20, origW + dx);
                if (dir.includes('w')) { nw = Math.max(20, origW - dx); nl = origLeft + (origW - nw); }
                if (dir.includes('s')) nh = Math.max(20, origH + dy);
                if (dir.includes('n')) { nh = Math.max(20, origH - dy); nt = origTop + (origH - nh); }
                const nextSizes = { ...(slide._dragSizes || {}), [fieldPath]: { w: nw, h: nh } };
                const sizeChanged = nl !== origLeft || nt !== origTop;
                const nextOffsets = sizeChanged
                  ? { ...(slide._dragOffsets || {}), [fieldPath]: { x: nl, y: nt } }
                  : slide._dragOffsets;
                updateSlide(currentIndex, {
                  ...slide,
                  _dragSizes: nextSizes,
                  ...(sizeChanged ? { _dragOffsets: nextOffsets } : {}),
                });
              };
              window.addEventListener('mousemove', onMove);
              window.addEventListener('mouseup', onUp);
            }}
          />
        ));
      })()}

      {/* Format toolbar -- shown when text is selected during editing */}
      {showToolbar && editingEl && (
        <FormatToolbar x={toolbarPos.x} y={toolbarPos.y} onFormat={execFormat} />
      )}

      {/* Chart data panel trigger + panel */}
      {isChartSlide && !editingEl && (
        <button
          className={`lasca-canvas-corner${chartPanelOpen ? ' is-active' : ''}`}
          onClick={() => setChartPanelOpen(!chartPanelOpen)}
          title={t('canvas.edit_chart_data')}
          style={{
            position: 'absolute', top: 8, right: 8, zIndex: 105,
            width: 28, height: 28, borderRadius: 6,
            background: chartPanelOpen ? '#d97757' : 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(4px)',
            border: '1px solid ' + (chartPanelOpen ? '#d97757' : '#e8e6dc'),
            color: chartPanelOpen ? '#fff' : '#8a8880',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, padding: 0, transition: 'all 0.15s',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            {/* Sliders/tune icon — distinct from SlideToolbar's bar chart icon */}
            <line x1="2" y1="3.5" x2="12" y2="3.5" />
            <circle cx="5" cy="3.5" r="1.5" fill="currentColor" />
            <line x1="2" y1="7" x2="12" y2="7" />
            <circle cx="9" cy="7" r="1.5" fill="currentColor" />
            <line x1="2" y1="10.5" x2="12" y2="10.5" />
            <circle cx="4" cy="10.5" r="1.5" fill="currentColor" />
          </svg>
        </button>
      )}
      {isChartSlide && chartPanelOpen && (
        <ChartDataPanel
          slideIndex={currentIndex}
          layout={slide.layout}
          onClose={() => setChartPanelOpen(false)}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasElement={contextMenu.el !== null}
          onAction={handleContextAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
