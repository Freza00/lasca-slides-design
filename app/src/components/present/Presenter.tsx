'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { renderSlide } from '@/lib/renderSlide';
import { getSceneClass } from '@/lib/themes';
import { getLogicalDims, fitToBox } from '@/lib/pageSize';
import { getTransition, type TransitionType } from '@/lib/types';

export function Presenter() {
  const t = useT();
  const searchParams = useSearchParams();
  const isPresenterMode = searchParams.get('mode') === 'presenter';

  const deck = useEditorStore(s => s.activeDeck());
  const presenterAnimations = useEditorStore(s => s.presenterAnimations);
  const setPresenterAnimations = useEditorStore(s => s.setPresenterAnimations);
  const logical = getLogicalDims(deck);
  const CANVAS_W = logical.w;
  const CANVAS_H = logical.h;
  const [current, setCurrent] = useState(0);
  const [scale, setScale] = useState(1);
  const [penColor, setPenColor] = useState('#d97757');
  const [drawing, setDrawing] = useState(false);
  // Presentation tool: 'cursor' = plain mouse, 'laser' = laser pointer dot,
  // 'pen' = drawing mode. These are the three modes a presenter commonly
  // wants during a talk.
  const [tool, setTool] = useState<'cursor' | 'laser' | 'pen'>('cursor');
  const penActive = tool === 'pen';
  const [laserPos, setLaserPos] = useState<{x: number, y: number} | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const presenterSlideRef = useRef<HTMLDivElement>(null);
  const total = deck.slides.length;

  // Pen stroke storage — each stroke is { points, color, width }
  type Point = { x: number; y: number };
  type Stroke = { points: Point[]; color: string; width: number };
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Point[]>([]);

  // Redraw canvas from stroke array (replays everything)
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const drawStroke = (s: Stroke) => {
      if (s.points.length === 0) return;
      ctx.beginPath();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    };
    strokesRef.current.forEach(drawStroke);
    if (currentStrokeRef.current.length > 1) {
      drawStroke({ points: currentStrokeRef.current, color: penColor, width: 3 });
    }
  }, [penColor]);

  // Clear all strokes (C key + Clear button)
  const clearStrokes = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = [];
    redrawCanvas();
  }, [redrawCanvas]);

  // Presenter mode: timer
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Presenter mode: left panel scaling
  const [presenterScale, setPresenterScale] = useState(1);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Slide transition: previous slide overlay (for simultaneous fade+blur out)
  const [prevSlide, setPrevSlide] = useState<{ html: string; key: number } | null>(null);
  const prevIndexRef = useRef(0);
  const prevCleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-hide bottom controls
  const [showControls, setShowControls] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click drag detection
  const clickStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    if (!isPresenterMode) return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPresenterMode, startTime]);

  // Format elapsed time as MM:SS (演讲少超 1 小时)
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Track direction & save previous slide for simultaneous fade-out animation.
  // When the user has disabled presenter animations, skip the prev-slide
  // snapshot entirely so slide swaps are instant (no blur-out overlay).
  useEffect(() => {
    if (current !== prevIndexRef.current) {
      if (presenterAnimations) {
        // Capture the previous slide HTML for the outgoing animation layer
        const prevHtml = renderSlide(deck.slides[prevIndexRef.current], deck.theme, logical, undefined, prevIndexRef.current, deck.slides.length);
        setPrevSlide({ html: prevHtml, key: Date.now() });
        // Cleanup old prev layer after the transition completes (0.8s)
        if (prevCleanupRef.current) clearTimeout(prevCleanupRef.current);
        prevCleanupRef.current = setTimeout(() => setPrevSlide(null), 850);
      } else {
        setPrevSlide(null);
      }
      prevIndexRef.current = current;
    }
  }, [current, deck.slides, deck.theme, logical.w, logical.h, presenterAnimations]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (prevCleanupRef.current) clearTimeout(prevCleanupRef.current);
    };
  }, []);

  // Presenter mode: scale left panel to fit
  useEffect(() => {
    if (!isPresenterMode || !leftPanelRef.current) return;
    const updateScale = () => {
      const rect = leftPanelRef.current!.getBoundingClientRect();
      setPresenterScale(Math.min(rect.width / CANVAS_W, rect.height / CANVAS_H));
    };
    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(leftPanelRef.current);
    window.addEventListener('resize', updateScale);
    return () => { ro.disconnect(); window.removeEventListener('resize', updateScale); };
  }, [isPresenterMode, CANVAS_W, CANVAS_H]);

  // Fullscreen mode: reactive scale to fill viewport
  useEffect(() => {
    if (isPresenterMode) return;
    const updateScale = () => {
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    };
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [isPresenterMode, CANVAS_W, CANVAS_H]);

  // Resize pen canvas to match its actual CSS size (not window size).
  // In presenter mode the canvas lives inside a 65% left panel, not the
  // full viewport, so window.innerWidth/Height would produce a wrong-aspect
  // backing store and draw strokes at the wrong place. ResizeObserver keeps
  // backing store in sync with CSS size; HiDPI scale keeps strokes crisp.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sync = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // After resetting width/height the context transform is identity.
        // Set a dpr-scale so draw calls use CSS pixels and strokes stay crisp.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        redrawCanvas();
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(canvas);
    window.addEventListener('resize', sync);
    return () => { ro.disconnect(); window.removeEventListener('resize', sync); };
  }, [redrawCanvas]);

  const go = useCallback((d: number) => {
    setCurrent(prev => {
      const next = prev + d;
      if (next < 0 || next >= total) return prev;
      // Clear pen strokes on slide change
      strokesRef.current = [];
      currentStrokeRef.current = [];
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
      return next;
    });
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight': case 'ArrowDown': case ' ':
          e.preventDefault(); go(1); break;
        case 'ArrowLeft': case 'ArrowUp':
          e.preventDefault(); go(-1); break;
        case 'Escape':
          if (document.fullscreenElement) document.exitFullscreen();
          else { window.close(); window.location.href = '/'; }
          break;
        case 'f': case 'F':
          document.documentElement.requestFullscreen?.(); break;
        case 'p': case 'P':
          // Toggle pen ↔ cursor
          setTool(prev => prev === 'pen' ? 'cursor' : 'pen');
          break;
        case 'l': case 'L':
          // Toggle laser ↔ cursor
          setTool(prev => prev === 'laser' ? 'cursor' : 'laser');
          break;
        case 'c': case 'C': {
          clearStrokes();
          break;
        }
        case 'a': case 'A': {
          // Toggle entry animations for presenter mode
          setPresenterAnimations(!presenterAnimations);
          break;
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [go, clearStrokes, presenterAnimations, setPresenterAnimations]);

  // Pen drawing — store strokes as objects so color/width persists per stroke
  const startDraw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!penActive) return;
    setDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    currentStrokeRef.current = [{ x: e.clientX - rect.left, y: e.clientY - rect.top }];
    redrawCanvas();
  }, [penActive, redrawCanvas]);

  const draw = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing || !penActive) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    currentStrokeRef.current.push({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    redrawCanvas();
  }, [drawing, penActive, redrawCanvas]);

  const endDraw = useCallback(() => {
    if (currentStrokeRef.current.length > 1) {
      strokesRef.current.push({
        points: [...currentStrokeRef.current],
        color: penColor,
        width: 3,
      });
    }
    currentStrokeRef.current = [];
    setDrawing(false);
    redrawCanvas();
  }, [penColor, redrawCanvas]);

  // Mouse move for laser pointer + auto-show controls when mouse near bottom
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (tool === 'laser') {
      setLaserPos({ x: e.clientX, y: e.clientY });
    } else if (laserPos) {
      // Clear the laser dot as soon as the user leaves laser mode.
      setLaserPos(null);
    }
    // Show controls when mouse near bottom edge or on movement
    const nearBottom = e.clientY > window.innerHeight - 100;
    if (nearBottom) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      // Reset hide timer on any movement
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2000);
    }
  }, [tool, laserPos]);

  const handleMouseLeave = useCallback(() => {
    setLaserPos(null);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setShowControls(false);
  }, []);

  // Click drag detection — record start position
  const handleMouseDownAdvance = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  }, []);

  // Click to advance (fullscreen mode) — only if it was a quick stationary click
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (penActive) return;
    if ((e.target as HTMLElement).closest('.nav-control')) return;
    if (e.clientY > window.innerHeight - 60) return;
    // Drag detection: must be short, stationary
    const start = clickStartRef.current;
    clickStartRef.current = null;
    if (start) {
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      const dt = Date.now() - start.time;
      if (dx >= 5 || dy >= 5 || dt >= 400) return;
    }
    go(1);
  }, [penActive, go]);

  // Right-click to go back
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    go(-1);
  }, [go]);

  // Initial transform/opacity for each transition preset (larger offsets for visibility)
  const getInitialState = (t: TransitionType): { transform: string; opacity: string } => {
    switch (t) {
      case 'fade':        return { transform: 'translate3d(0,0,0)',     opacity: '0' };
      case 'slide-up':    return { transform: 'translate3d(0,40px,0)',  opacity: '0' };
      case 'slide-down':  return { transform: 'translate3d(0,-40px,0)', opacity: '0' };
      case 'slide-left':  return { transform: 'translate3d(50px,0,0)',  opacity: '0' };
      case 'slide-right': return { transform: 'translate3d(-50px,0,0)', opacity: '0' };
      case 'zoom':        return { transform: 'scale(0.85)',            opacity: '0' };
      case 'none':        return { transform: 'none',                   opacity: '1' };
    }
  };

  // Staggered child entry animation — uses Web Animations API for reliability.
  // Stagger window is capped so dense pages (20+ elements) still finish in
  // under ~900ms, while sparse pages keep a comfortable sequential rhythm.
  // If the user has turned off presenter animations, this is a no-op and
  // children render at their natural state immediately.
  const animateSlideEntry = useCallback((container: HTMLDivElement | null, transition: TransitionType) => {
    if (!container) return;
    if (!presenterAnimations) return;
    const root = container.firstElementChild as HTMLElement | null;
    if (!root) return;
    if (transition === 'none') return;

    // Find meaningful children: skip single-child wrappers
    const getMeaningfulChildren = (el: Element): Element[] => {
      let children = Array.from(el.children).filter(c =>
        c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT' &&
        getComputedStyle(c).display !== 'none'
      );
      while (children.length === 1 && children[0].children.length > 0) {
        children = Array.from(children[0].children).filter(c =>
          c.tagName !== 'STYLE' && c.tagName !== 'SCRIPT' &&
          getComputedStyle(c).display !== 'none'
        );
      }
      return children;
    };

    const children = getMeaningfulChildren(root);
    if (children.length === 0) return;

    const initial = getInitialState(transition);

    // Dynamic stride: keep per-element delay ≤ 90ms AND total stagger ≤ 400ms.
    // For dense pages this means many elements animate near-simultaneously,
    // which is exactly what the user asked for ("有些元素的动画可以做成一起的").
    const MAX_TOTAL_STAGGER = 400;
    const DURATION = 500;
    const stride = children.length > 1
      ? Math.min(90, MAX_TOTAL_STAGGER / (children.length - 1))
      : 0;

    // Use Web Animations API — reliable cross-browser, no CSS transition gotchas
    children.forEach((child, i) => {
      const el = child as HTMLElement;
      // Cancel any prior animations to avoid stacking
      el.getAnimations().forEach(a => a.cancel());
      el.animate(
        [
          { transform: initial.transform, opacity: initial.opacity, offset: 0 },
          { transform: 'translate3d(0,0,0) scale(1)', opacity: '1', offset: 1 },
        ],
        {
          duration: DURATION,
          delay: i * stride,
          easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
          fill: 'both',
        }
      );
    });
  }, [presenterAnimations]);

  const html = renderSlide(deck.slides[current], deck.theme, logical, undefined, current, total);
  const nextHtml = current < total - 1 ? renderSlide(deck.slides[current + 1], deck.theme, logical, undefined, current + 1, total) : null;
  const currentSlide = deck.slides[current];

  // Imperative innerHTML — set ONCE per slide change, then run entry animation.
  // Guard against re-running on unrelated re-renders (e.g. setPrevSlide), which
  // would otherwise reset children mid-animation and freeze them at initial state.
  const lastHtmlRef = useRef<string>('');
  useLayoutEffect(() => {
    if (lastHtmlRef.current === html) return;
    lastHtmlRef.current = html;
    const t = getTransition(deck.slides[current], current);
    if (slideRef.current) {
      slideRef.current.innerHTML = html;
      animateSlideEntry(slideRef.current, t);
    }
    if (presenterSlideRef.current) {
      presenterSlideRef.current.innerHTML = html;
      animateSlideEntry(presenterSlideRef.current, t);
    }
  }, [current, deck.slides, html, animateSlideEntry]);

  // -------------------------------------------------------------------
  // Presenter Mode Layout
  // -------------------------------------------------------------------
  if (isPresenterMode) {
    return (
      <div
        style={{
          position: 'fixed', inset: 0, background: '#202020',
          display: 'flex', fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
          userSelect: 'none', overflow: 'hidden',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onContextMenu={handleContextMenu}
      >
        {/* Slide transition keyframes — gentle cross-fade with blur on prev,
            slow fade-in on new (so children stagger remains visible inside) */}
        <style>{`
          @keyframes lascaPrevOut {
            from { opacity: 1; filter: blur(0px) brightness(1); transform: scale(var(--lp, 1)); }
            to   { opacity: 0; filter: blur(10px) brightness(1.04); transform: scale(calc(var(--lp, 1) * 1.015)); }
          }
          @keyframes lascaActiveIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          .lasca-slide-prev   { animation: lascaPrevOut 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
          .lasca-slide-active { animation: lascaActiveIn 0.35s cubic-bezier(0.22, 0.61, 0.36, 1) both; }
        `}</style>

        {/* Left panel: current slide */}
        <div
          ref={leftPanelRef}
          style={{
            width: '65%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f0efe9', position: 'relative',
          }}
        >
          {/* Previous slide layer (animates out) */}
          {prevSlide && (
            <div
              key={`pres-prev-${prevSlide.key}`}
              className="lasca-slide-prev"
              style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none', zIndex: 5,
              }}
            >
              <div
                style={{
                  width: CANVAS_W, height: CANVAS_H,
                  transform: `scale(${presenterScale * 1.02})`,
                  transformOrigin: 'center center',
                  flexShrink: 0, overflow: 'hidden',
                }}
                dangerouslySetInnerHTML={{ __html: prevSlide.html }}
              />
            </div>
          )}
          {/* Current slide layer */}
          <div
            key={`pres-slide-${current}`}
            className="lasca-slide-active"
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${presenterScale})`,
              transformOrigin: 'center center',
              flexShrink: 0,
              overflow: 'hidden',
              position: 'relative',
              zIndex: 10,
            }}
          >
            <div
              ref={presenterSlideRef}
              style={{ width: '100%', height: '100%' }}
            />
          </div>

          {/* Pen overlay */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              pointerEvents: penActive ? 'auto' : 'none',
              cursor: penActive ? 'crosshair' : 'default',
              zIndex: 20,
            }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
          />

          {/* Presenter mode nav arrows — subtle SVG matching fullscreen style */}
          {current > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              style={{
                position: 'absolute', left: 14, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                zIndex: 30, padding: 6,
                opacity: 0.3, transition: 'opacity 0.25s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
              title={t('presenter.prev')}
            >
              <svg width="26" height="40" viewBox="0 0 26 40" fill="none">
                <path d="M18 6 L8 20 L18 34" stroke="#141413" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {current < total - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); go(1); }}
              style={{
                position: 'absolute', right: 14, top: '50%',
                transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                zIndex: 30, padding: 6,
                opacity: 0.3, transition: 'opacity 0.25s ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
              title={t('presenter.next')}
            >
              <svg width="26" height="40" viewBox="0 0 26 40" fill="none">
                <path d="M8 6 L18 20 L8 34" stroke="#141413" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Right panel: next slide, timer, notes, controls */}
        <div style={{
          width: '35%', height: '100%',
          display: 'flex', flexDirection: 'column',
          background: '#202020', borderLeft: '1px solid #2e2e2e',
          padding: 16, gap: 12, overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Exit button — top-right corner */}
          <button
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              window.location.href = '/editor';
            }}
            title={t('presenter.exit')}
            style={{
              position: 'absolute', top: 12, right: 12,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.6)', borderRadius: 6,
              padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              fontFamily: 'inherit', zIndex: 5,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#d97757'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
          >
            {t('presenter.exit_label')}
          </button>

          {/* Next slide preview label */}
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 4 }}>
            Next ▸
          </div>

          {/* Next slide preview — fit logical aspect into a 320×180 box */}
          {(() => {
            const nextBox = fitToBox(CANVAS_W, CANVAS_H, 320, 180);
            return (
              <div style={{
                flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#0f0f0f', borderRadius: 8, overflow: 'hidden',
                height: 180, border: '1px solid #2e2e2e',
              }}>
                {nextHtml ? (
                  <div style={{
                    width: nextBox.w, height: nextBox.h,
                    overflow: 'hidden', position: 'relative',
                  }}>
                    <div style={{
                      width: CANVAS_W, height: CANVAS_H,
                      transform: `scale(${nextBox.scale})`,
                      transformOrigin: 'top left',
                    }}>
                      <div
                        style={{ width: '100%', height: '100%' }}
                        dangerouslySetInnerHTML={{ __html: nextHtml }}
                      />
                    </div>
                  </div>
                ) : (
                  <span style={{ color: '#555', fontSize: 14 }}>{t('presenter.last_page')}</span>
                )}
              </div>
            );
          })()}

          {/* Page counter + Timer (with reset) */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0, padding: '4px 0',
          }}>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 500 }}>
              {current + 1} / {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                color: '#d97757', fontSize: 24, fontFamily: 'monospace', fontWeight: 700,
              }}>
                {formatTime(elapsed)}
              </span>
              <button
                onClick={() => { setStartTime(Date.now()); setElapsed(0); }}
                title={t('presenter.reset_timer')}
                style={{
                  background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', fontSize: 11, padding: 2, fontFamily: 'inherit',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#d97757')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
              >
                ↻
              </button>
            </div>
          </div>

          {/* Speaker notes */}
          <div style={{
            flex: 1, background: '#0f0f0f', borderRadius: 8,
            padding: 12, overflow: 'auto',
            color: '#ccc', fontSize: 14, lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            border: '1px solid #2e2e2e',
          }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Speaker Notes
            </div>
            {currentSlide.notes || <span style={{ color: '#555', fontStyle: 'italic' }}>{t('presenter.no_notes')}</span>}
          </div>

          {/* Control buttons */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <button
              onClick={() => go(-1)}
              disabled={current === 0}
              title={t('presenter.prev')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                background: current === 0 ? '#2a2a2a' : '#3a3a3a', color: current === 0 ? '#555' : '#fff',
                cursor: current === 0 ? 'default' : 'pointer', fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              ◀ Prev
            </button>
            <button
              onClick={() => go(1)}
              disabled={current === total - 1}
              title={t('presenter.next')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: 'none',
                background: current === total - 1 ? '#2a2a2a' : '#3a3a3a',
                color: current === total - 1 ? '#555' : '#fff',
                cursor: current === total - 1 ? 'default' : 'pointer', fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              ▶ Next
            </button>
            <button
              onClick={() => setTool(tool === 'laser' ? 'cursor' : 'laser')}
              title={t('presenter.laser')}
              style={{
                padding: '8px 12px', borderRadius: 6, border: 'none',
                background: tool === 'laser' ? '#d97757' : '#3a3a3a',
                color: '#fff', cursor: 'pointer', fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              {tool === 'laser' ? t('presenter.laser_on') : `🔴 ${t('presenter.laser_label')}`}
            </button>
            <button
              onClick={() => setTool(tool === 'pen' ? 'cursor' : 'pen')}
              title={t('presenter.pen')}
              style={{
                padding: '8px 12px', borderRadius: 6, border: 'none',
                background: penActive ? '#d97757' : '#3a3a3a',
                color: '#fff', cursor: 'pointer', fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              {penActive ? '🖊 ON' : '🖊 Pen'}
            </button>
            <button
              onClick={() => setPresenterAnimations(!presenterAnimations)}
              title={t('presenter.animation')}
              style={{
                padding: '8px 12px', borderRadius: 6, border: 'none',
                background: presenterAnimations ? '#3a3a3a' : '#2a2a2a',
                color: presenterAnimations ? '#fff' : '#888',
                cursor: 'pointer', fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              ✨ {presenterAnimations ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        {/* Laser pointer */}
        {tool === 'laser' && laserPos && (
          <div style={{
            position: 'fixed', left: laserPos.x - 8, top: laserPos.y - 8,
            width: 16, height: 16, borderRadius: '50%',
            background: 'radial-gradient(circle, #ff3333 30%, rgba(255,50,50,0.4) 70%, transparent 100%)',
            boxShadow: '0 0 12px 4px rgba(255,50,50,0.5)',
            pointerEvents: 'none', zIndex: 30,
          }} />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Fullscreen Mode Layout (original)
  // -------------------------------------------------------------------
  return (
    <div
      className={[deck.presetId === 'bilingual-report' ? 'preset-bilingual-report' : '', getSceneClass(deck.theme)].filter(Boolean).join(' ') || undefined}
      style={{
        position: 'fixed', inset: 0, background: '#000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        userSelect: 'none', cursor: penActive ? 'crosshair' : 'default',
        overflow: 'hidden',
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDownAdvance}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      {/* Slide transition keyframes — only PREV animates out; new slide is born visible
          so children's per-direction stagger animation is fully visible */}
      <style>{`
        @keyframes lascaPrevOut {
          from { opacity: 1; filter: blur(0px) brightness(1); }
          to   { opacity: 0; filter: blur(12px) brightness(1.05); }
        }
        .lasca-slide-prev { animation: lascaPrevOut 0.65s cubic-bezier(0.22, 0.61, 0.36, 1) forwards; }
      `}</style>

      {/* Previous slide layer (animates out) */}
      {prevSlide && (
        <div
          key={`prev-${prevSlide.key}`}
          className="lasca-slide-prev"
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', zIndex: 5,
          }}
        >
          <div
            style={{
              width: CANVAS_W, height: CANVAS_H,
              transform: `scale(${scale * 1.02})`,
              transformOrigin: 'center center',
              flexShrink: 0, overflow: 'hidden',
            }}
            dangerouslySetInnerHTML={{ __html: prevSlide.html }}
          />
        </div>
      )}

      {/* Current slide layer */}
      <div
        key={`slide-${current}`}
        className="lasca-slide-active"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          flexShrink: 0,
          overflow: 'hidden',
          position: 'relative',
          zIndex: 10,
        }}
      >
        <div
          ref={slideRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Pen overlay -- full viewport, sits on top */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
          pointerEvents: penActive ? 'auto' : 'none',
          cursor: penActive ? 'crosshair' : 'default',
          zIndex: 20,
        }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
      />

      {/* Laser pointer */}
      {tool === 'laser' && laserPos && (
        <div style={{
          position: 'fixed', left: laserPos.x - 8, top: laserPos.y - 8,
          width: 16, height: 16, borderRadius: '50%',
          background: 'radial-gradient(circle, #ff3333 30%, rgba(255,50,50,0.4) 70%, transparent 100%)',
          boxShadow: '0 0 12px 4px rgba(255,50,50,0.5)',
          pointerEvents: 'none', zIndex: 30,
        }} />
      )}

      {/* Navigation arrows — dark backdrop circle works on any slide background */}
      {current > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); go(-1); }}
          style={{
            position: 'fixed', left: 24, top: '50%',
            transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(20,20,19,0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: 'none',
            cursor: 'pointer', zIndex: 30, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.4, transition: 'all 0.25s ease',
          }}
          className="nav-control"
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.95';
            e.currentTarget.style.background = 'rgba(20,20,19,0.7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '0.4';
            e.currentTarget.style.background = 'rgba(20,20,19,0.4)';
          }}
          title={t('presenter.prev')}
        >
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
            <path d="M14 4 L6 14 L14 24" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {current < total - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); go(1); }}
          style={{
            position: 'fixed', right: 24, top: '50%',
            transform: 'translateY(-50%)',
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(20,20,19,0.4)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: 'none',
            cursor: 'pointer', zIndex: 30, padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: 0.4, transition: 'all 0.25s ease',
          }}
          className="nav-control"
          onMouseEnter={e => {
            e.currentTarget.style.opacity = '0.95';
            e.currentTarget.style.background = 'rgba(20,20,19,0.7)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.opacity = '0.4';
            e.currentTarget.style.background = 'rgba(20,20,19,0.4)';
          }}
          title={t('presenter.next')}
        >
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
            <path d="M6 4 L14 14 L6 24" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Progress bar — semi-transparent, slow transition */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0,
        height: 3, background: 'rgba(217,119,87,0.7)',
        width: `${((current + 1) / total) * 100}%`,
        transition: 'width 0.4s ease-out', zIndex: 30,
      }} />

      {/* Bottom controls — nearly invisible until mouse near bottom */}
      <div
        style={{
          position: 'fixed', bottom: 16, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '6px 14px', borderRadius: 999,
          background: 'rgba(20,20,19,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          opacity: showControls ? 0.7 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          transition: 'opacity 0.3s ease',
          zIndex: 30,
        }}
        className="nav-control"
        onMouseEnter={() => setShowControls(true)}
      >
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace' }}>
          {current + 1} / {total}
        </span>

        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />

        {(['cursor', 'laser', 'pen'] as const).map(mode => (
          <button
            key={mode}
            onClick={(e) => { e.stopPropagation(); setTool(mode); }}
            title={mode === 'cursor' ? t('presenter.cursor') : mode === 'laser' ? t('presenter.laser') : t('presenter.pen')}
            style={{
              fontSize: 12, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: tool === mode ? '#d97757' : 'transparent',
              color: tool === mode ? '#fff' : 'rgba(255,255,255,0.6)',
              fontFamily: 'inherit',
            }}
          >
            {mode === 'cursor' ? t('presenter.cursor') : mode === 'laser' ? t('presenter.laser_label') : t('presenter.pen_label')}
          </button>
        ))}
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
        <button
          onClick={(e) => { e.stopPropagation(); setPresenterAnimations(!presenterAnimations); }}
          title={t('presenter.animation')}
          style={{
            fontSize: 12, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
            background: presenterAnimations ? 'transparent' : 'rgba(255,255,255,0.1)',
            color: presenterAnimations ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)',
            fontFamily: 'inherit',
          }}
        >
          ✨ {presenterAnimations ? 'On' : 'Off'}
        </button>
        {penActive && (
          <>
            <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.2)' }} />
            {(['#d97757', '#ff3333', '#6a9bcc', '#ffffff'] as const).map(c => (
              <button
                key={c}
                onClick={(e) => { e.stopPropagation(); setPenColor(c); }}
                title={`${t('presenter.pen_color')} ${c}`}
                style={{
                  width: 14, height: 14, borderRadius: '50%', background: c,
                  border: penColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                  cursor: 'pointer', padding: 0,
                }}
              />
            ))}
            <button
              onClick={(e) => { e.stopPropagation(); clearStrokes(); }}
              title={t('presenter.clear_pen')}
              style={{
                fontSize: 12, background: 'none', border: 'none',
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('presenter.clear')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
