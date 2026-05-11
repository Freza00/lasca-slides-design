'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { Theme, Slide } from '@/lib/types';
import type { MdContext, ClarifierAnswers, StylePresetId, HarnessEvent } from '@/lib/ai/harness/types';
import type { OutlineItem } from '@/lib/ai/pipeline';
import confetti from 'canvas-confetti';
import { LayoutThumb } from '@/components/ui/LayoutThumb';
import { GenerationRating } from '@/components/ui/GenerationRating';
import { SlideThumbnail } from '@/components/ui/SlideThumbnail';
import { fitToBox, getLogicalDims } from '@/lib/pageSize';
import { getSceneClass } from '@/lib/themes';
import { PAGE_TYPE_CONFIG, inferPageType } from '@/lib/pageTypes';
import { useT, useLocale } from '@/lib/i18n';
import { withSessionHeaders } from '@/lib/clientApi';
import { downloadLasca } from '@/lib/exportLasca';
import { exportPdf } from '@/lib/exportPdf';
import type { Deck } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────

type GenPhase = 'connecting' | 'streaming' | 'revealing' | 'exploding' | 'done' | 'error';

interface GenerationPreviewProps {
  mdContext: MdContext;
  rawInput: string;
  answers: ClarifierAnswers;
  format: 'slide' | 'report';
  theme: Theme;
  presetId?: StylePresetId;
  onEnterEditor: (slides: Slide[], presetId?: string) => void;
  onPresent: (slides: Slide[], presetId?: string) => void;
  /** Called the moment slides are ready (on `done`, or on timeout/error with
   *  partial earlySlides). Persists the deck to the Zustand/IndexedDB store so
   *  the user can't lose the generation just by closing the tab. Implementation
   *  in CreateFlow is idempotent — subsequent clicks on Edit/Play hit the same
   *  deck id, not a duplicate. */
  onDeckReady?: (slides: Slide[], presetId?: string) => void;
  /** Called at the start of every new generation attempt (including Retry).
   *  Tells the parent to clear its "already-saved" guard so the next
   *  onDeckReady creates a fresh deck rather than reusing the previous run's
   *  partial-save id. */
  onGenerationStart?: () => void;
  onBack?: () => void;
}

/** Await a batch of WAAPI animations and swallow cancellation rejections.
 *  `Animation.finished` rejects with an AbortError when the animation is
 *  cancelled (component unmount, route change, StrictMode double-invoke).
 *  An unhandled rejection here can be promoted into a React error in
 *  React 19 concurrent mode and tear down the whole tree — losing every
 *  streamed slide. Always go through this helper. */
function awaitAnimations(anims: Animation[]): Promise<void> {
  return Promise.all(anims.map(a => a.finished))
    .then(() => undefined)
    .catch(() => undefined);
}

// ── Preview boxes ───────────────────────────────────────────────────────

const THUMB_BOX = { w: 220, h: 260 };
const SMALL_BOX = { w: 152, h: 190 };
const BIG_BOX = { w: 900, h: 980 };
const BIG_BOX_REPORT = { w: 540, h: 700 };

// Sparkles + light orbs
const SPARKLE_CHARS = ['✦', '✧', '✶', '✸', '⋆'];
const SPARKLE_COUNT = 14;
const ORB_COUNT = 10;
const RATING_POPUP_DELAY_MS = 3500;

// ── Component ──────────────────────────────────────────────────────────

export function GenerationPreview({
  mdContext,
  rawInput,
  answers,
  format,
  theme,
  presetId,
  onEnterEditor,
  onPresent,
  onDeckReady,
  onGenerationStart,
  onBack,
}: GenerationPreviewProps) {
  const t = useT();
  const locale = useLocale();
  const isReport = format === 'report';
  const logical = useMemo(
    () => getLogicalDims({ pageSize: isReport ? 'letter' : 'slide-16:9' }),
    [isReport],
  );
  const thumbMetrics = useMemo(
    () => fitToBox(logical.w, logical.h, THUMB_BOX.w, THUMB_BOX.h),
    [logical.w, logical.h],
  );
  const smallMetrics = useMemo(
    () => fitToBox(logical.w, logical.h, SMALL_BOX.w, SMALL_BOX.h),
    [logical.w, logical.h],
  );
  const bigMetrics = useMemo(
    () => {
      const box = isReport ? BIG_BOX_REPORT : BIG_BOX;
      return fitToBox(logical.w, logical.h, box.w, box.h);
    },
    [isReport, logical.w, logical.h],
  );
  const [phase, setPhase] = useState<GenPhase>('connecting');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [resultPresetId, setResultPresetId] = useState<string | undefined>(undefined);
  // Mirror ref so the streaming closure (catch block at partial-save) can read
  // the latest presetId without putting `resultPresetId` in startGeneration's
  // useCallback deps — that re-creation churn during the stream window
  // widens race conditions around 'done'/animation transitions.
  const resultPresetIdRef = useRef<string | undefined>(undefined);
  const [progress, setProgress] = useState<{ from: number; to: number; total: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Slides that arrived via individual 'slide' SSE events (progressive preview)
  const [earlySlides, setEarlySlides] = useState<Map<number, Slide>>(new Map());
  // Mirror ref for the catch block: setState snapshots aren't available on the
  // closure captured when the stream loop started, but a ref always sees
  // current contents — crucial for partial-save on abort/error.
  const earlySlidesRef = useRef<Map<number, Slide>>(new Map());
  // Guard: onDeckReady is idempotent in CreateFlow, but calling it N times per
  // run is wasteful and (more importantly) every call hits deck-limit checks.
  // Flip once per generation attempt; reset by startGeneration.
  const autoSavedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);

  // ── Sparkle + orb positions (stable across re-renders) ──────────────

  const sparkles = useMemo(() =>
    Array.from({ length: SPARKLE_COUNT }, (_, i) => ({
      char: SPARKLE_CHARS[i % SPARKLE_CHARS.length],
      x: Math.random() * 90 + 5,
      y: Math.random() * 85 + 5,
      size: 10 + Math.random() * 8,
      delay: Math.random() * 3,
      dur: 1.5 + Math.random() * 2,
    })),
  []);

  const orbs = useMemo(() =>
    Array.from({ length: ORB_COUNT }, (_, i) => ({
      x: Math.random() * 90 + 5,
      y: Math.random() * 85 + 5,
      size: 6 + Math.random() * 14, // 6-20px orb diameter
      delay: Math.random() * 4,
      dur: 2 + Math.random() * 3, // 2-5s
      color: i % 3 === 0
        ? 'rgba(255,255,255,0.7)'  // bright white
        : i % 3 === 1
          ? 'rgba(220,230,255,0.6)' // cool white-blue
          : 'rgba(255,240,220,0.6)', // warm white
    })),
  []);

  // ── SSE stream ──────────────────────────────────────────────────────

  const startGeneration = useCallback(async () => {
    setPhase('connecting');
    setOutline([]);
    setSlides(null);
    setErrorMsg(null);
    setRevealedCount(0);
    setSelectedIdx(0);
    setShowRating(false);
    setEarlySlides(new Map());
    earlySlidesRef.current = new Map();
    autoSavedRef.current = false;
    onGenerationStart?.();

    const controller = new AbortController();
    abortRef.current = controller;
    // 15 min total: reasoning-model generations on long mdContext (~20k tokens
    // in/out) take 4-7 min per LLM call through the proxy gateway, and a retry
    // can double that. 5 min was cutting off legitimate work.
    const totalTimeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workflow: 'generate-from-draft',
          rawInput,
          mdContextOverride: mdContext,
          clarifierAnswers: answers,
          theme,
          format,
          presetId,
          pageCount: mdContext.pages.length,
          skipClarifier: true,
          locale,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let heartbeat: ReturnType<typeof setTimeout> | null = null;

      let gotFirstEvent = false;
      const resetHeartbeat = () => {
        if (heartbeat) clearTimeout(heartbeat);
        // Backend heartbeats every 10s, so any value > 15s detects a true
        // stall. We use 240s pre-first-event (outline on large drafts can
        // silently spin behind a slow buildMdContext) and 180s after — long
        // enough to absorb one slow LLM round-trip on the flaky proxy
        // without masking a genuinely dead connection.
        const ms = gotFirstEvent ? 180_000 : 240_000;
        heartbeat = setTimeout(() => { controller.abort(); reader.cancel(); }, ms);
      };
      resetHeartbeat();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetHeartbeat();
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          let event: HarnessEvent;
          try { event = JSON.parse(raw) as HarnessEvent; } catch { continue; }
          gotFirstEvent = true;
          switch (event.type) {
            case 'outline':
              setOutline(event.data as OutlineItem[]);
              setPhase('streaming');
              break;
            case 'generating':
              setProgress(event.data as { from: number; to: number; total: number });
              break;
            case 'slide': {
              // Individual slide arrived — show it progressively (blur → clear)
              const { index, slide } = event.data as { index: number; slide: Slide };
              setEarlySlides(prev => {
                const next = new Map(prev).set(index, slide);
                earlySlidesRef.current = next;
                return next;
              });
              break;
            }
            case 'done': {
              const d = event.data as { slides: Slide[]; presetId?: string };
              setSlides(d.slides);
              resultPresetIdRef.current = d.presetId;
              setResultPresetId(d.presetId);
              // Persist the moment the deck is assembled, not when the user
              // clicks Edit — otherwise closing the tab / hitting back just
              // before Edit throws the whole generation away.
              if (!autoSavedRef.current && onDeckReady) {
                try { onDeckReady(d.slides, d.presetId); autoSavedRef.current = true; }
                catch (e) { console.warn('[GenerationPreview] auto-save failed', e); }
              }
              setPhase('revealing');
              break;
            }
            case 'error':
              // Fail-open: only escalate to error phase when producer
              // EXPLICITLY marks the event fatal. Missing/unknown shape
              // is treated as a non-fatal warning so a single page failure
              // never wipes the whole streamed deck off-screen.
              if (event.data?.fatal === true) {
                setErrorMsg(event.data.message ?? 'Generation failed');
                setPhase('error');
              } else {
                console.warn('[GenerationPreview] non-fatal:', event.data?.message);
              }
              break;
          }
        }
      }
      if (heartbeat) clearTimeout(heartbeat);
    } catch (err) {
      // If a newer startGeneration() replaced our controller (e.g. React
      // StrictMode unmount+remount), this is a stale abort — ignore silently.
      if (abortRef.current !== controller) return;
      if (unmountRef.current) return;
      // Rescue whatever streamed in before the abort/error. 15 min can elapse
      // generating 38 pages and then a single flaky network chunk aborts the
      // fetch — without this the user sees "timeout" and loses 35+ real
      // slides that already arrived. We save a deck with whatever's in
      // earlySlides, sorted by page index; the error UI still surfaces, but
      // now the deck also appears in /works and the editor.
      if (!autoSavedRef.current && onDeckReady && earlySlidesRef.current.size > 0) {
        const partial = Array.from(earlySlidesRef.current.entries())
          .sort(([a], [b]) => a - b)
          .map(([, s]) => s);
        try { onDeckReady(partial, resultPresetIdRef.current); autoSavedRef.current = true; }
        catch (e) { console.warn('[GenerationPreview] partial auto-save failed', e); }
      }
      if ((err as Error).name === 'AbortError') setErrorMsg(t('generation.timeout'));
      else setErrorMsg((err as Error).message);
      setPhase('error');
    } finally {
      clearTimeout(totalTimeout);
      // Only clear abortRef if we're still the active generation
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }, [rawInput, mdContext, answers, theme, format, presetId, onDeckReady, onGenerationStart]);

  const unmountRef = useRef(false);
  useEffect(() => {
    unmountRef.current = false;
    startGeneration();
    return () => {
      unmountRef.current = true;
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Phase 1: Wireframe entrance ─────────────────────────────────────

  useEffect(() => {
    if (phase !== 'streaming' || outline.length === 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    const cards = grid.querySelectorAll<HTMLElement>('[data-card]');
    cards.forEach((card, i) => {
      card.animate(
        [
          { opacity: 0, transform: 'translateY(24px) scale(0.92)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 450, delay: i * 80, easing: 'cubic-bezier(0.22,0.61,0.36,1)', fill: 'forwards' },
      );
    });
  }, [phase, outline.length]);

  // ── Phase 2: Reveal → re-blur → clear → explode ────────────────────

  useEffect(() => {
    if (phase !== 'revealing' || !slides) return;
    const grid = gridRef.current;

    // Immediately mark all as revealed
    setRevealedCount(slides.length);

    // Re-blur all cards, then animate clear, then explode
    if (grid) {
      const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-card]'));
      // Re-blur all cards
      const blurAnims = cards.map((card, idx) =>
        card.animate(
          [
            { filter: 'blur(0px)', opacity: 1 },
            { filter: 'blur(8px)', opacity: 0.7 },
          ],
          { duration: 400, delay: idx * 30, easing: 'ease-in', fill: 'forwards' },
        ),
      );
      awaitAnimations(blurAnims).then(() => {
        if (unmountRef.current) return;
        // Clear up from blur
        const clearAnims = cards.map((card, idx) =>
          card.animate(
            [
              { filter: 'blur(8px)', opacity: 0.7 },
              { filter: 'blur(0px)', opacity: 1 },
            ],
            { duration: 600, delay: idx * 40, easing: 'ease-out', fill: 'forwards' },
          ),
        );
        awaitAnimations(clearAnims).then(() => {
          if (unmountRef.current) return;
          setTimeout(() => {
            if (unmountRef.current) return;
            setPhase('exploding');
          }, 150);
        });
      });
    } else {
      setTimeout(() => setPhase('exploding'), 250);
    }
  }, [phase, slides]);

  // ── Phase 3: Explosion (canvas-confetti) ──────────────────────────

  useEffect(() => {
    if (phase !== 'exploding') return;
    const grid = gridRef.current;
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-card]'));
    if (cards.length === 0) { setPhase('done'); return; }

    const gridRect = grid.getBoundingClientRect();
    const cx = gridRect.width / 2;
    const cy = gridRect.height / 2;

    const cardData = cards.map(card => {
      const r = card.getBoundingClientRect();
      return { el: card, dx: cx - (r.left - gridRect.left + r.width / 2), dy: cy - (r.top - gridRect.top + r.height / 2) };
    });

    // Gather cards to center
    const gatherAnims = cardData.map(({ el, dx, dy }) => {
      const rot = (Math.random() - 0.5) * 40;
      return el.animate(
        [
          { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(0.7)`, opacity: 1 },
        ],
        { duration: 450, delay: Math.random() * 60, easing: 'cubic-bezier(0.4,0,0.2,1)', fill: 'forwards' },
      );
    });

    awaitAnimations(gatherAnims).then(() => {
      if (unmountRef.current) return;
      // ── White flash overlay ──
      const flashEl = document.createElement('div');
      flashEl.style.cssText = 'position:fixed;inset:0;background:white;pointer-events:none;z-index:9999;';
      document.body.appendChild(flashEl);
      const flashAnim = flashEl.animate(
        [{ opacity: 0.7 }, { opacity: 0 }],
        { duration: 400, easing: 'ease-out', fill: 'forwards' },
      );
      // .finished — not .onfinish — so cancellation doesn't strand flashEl on body.
      flashAnim.finished
        .catch(() => undefined)
        .finally(() => flashEl.remove());

      // ── Confetti burst — high-intensity bright colors ──
      const origin = {
        x: (gridRect.left + cx) / window.innerWidth,
        y: (gridRect.top + cy) / window.innerHeight,
      };

      // Burst 1: big bright explosion
      confetti({
        particleCount: 120,
        spread: 100,
        origin,
        startVelocity: 50,
        colors: ['#ffffff', '#ffe066', '#a0d8ff', '#c4b5fd', '#fda4af', '#86efac'],
        shapes: ['circle', 'square'],
        gravity: 0.8,
        scalar: 1.2,
        ticks: 80,
      });

      // Burst 2: delayed sparkle shower
      setTimeout(() => {
        confetti({
          particleCount: 60,
          spread: 160,
          origin,
          startVelocity: 30,
          colors: ['#ffffff', '#e0e7ff', '#fef08a', '#fbcfe8'],
          shapes: ['circle'],
          gravity: 0.6,
          scalar: 0.8,
          ticks: 100,
        });
      }, 100);

      // Burst 3: star shower
      setTimeout(() => {
        confetti({
          particleCount: 40,
          spread: 360,
          origin,
          startVelocity: 20,
          colors: ['#ffffff', '#f0f0f0'],
          shapes: ['star' as confetti.Shape],
          gravity: 0.4,
          scalar: 1.5,
          ticks: 120,
          flat: true,
        });
      }, 200);

      // Scatter cards outward (same as before)
      const scatterAnims = cardData.map(({ el }, i) => {
        const angle = (Math.PI * 2 * i) / cards.length + (Math.random() - 0.5) * 0.6;
        const dist = 250 + Math.random() * 300;
        return el.animate(
          [
            { opacity: 1 },
            { transform: `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) rotate(${(Math.random() - 0.5) * 180}deg) scale(0.3)`, opacity: 0 },
          ],
          { duration: 400, easing: 'cubic-bezier(0.4,0,1,1)', fill: 'forwards' },
        );
      });
      awaitAnimations(scatterAnims).then(() => {
        if (unmountRef.current) return;
        setPhase('done');
      });
    });
  }, [phase]);

  // ── Phase 4: Done layout entrance ───────────────────────────────────

  useEffect(() => {
    if (phase !== 'done') return;
    sidebarRef.current?.animate(
      [{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 600, easing: 'cubic-bezier(0.22,0.61,0.36,1)', fill: 'forwards' },
    );
    showcaseRef.current?.animate(
      [{ opacity: 0, transform: 'translateY(30px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 700, delay: 200, easing: 'cubic-bezier(0.22,0.61,0.36,1)', fill: 'forwards' },
    );
    actionRef.current?.animate(
      [{ opacity: 0, transform: 'translateX(30px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 500, delay: 400, easing: 'cubic-bezier(0.22,0.61,0.36,1)', fill: 'forwards' },
    );
  }, [phase]);

  useEffect(() => {
    if (phase !== 'done' || !slides?.length) {
      setShowRating(false);
      return;
    }
    const timer = setTimeout(() => setShowRating(true), RATING_POPUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [phase, slides]);

  // ── Scroll-snap sync: showcase scroll drives selectedIdx, sidebar follows ──

  // Showcase scroll → detect which slide is closest to container center → update selectedIdx
  const scrollRafRef = useRef(0);

  useEffect(() => {
    if (phase !== 'done' || !slides) return;
    const container = showcaseRef.current;
    if (!container) return;

    const onScroll = () => {
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = requestAnimationFrame(() => {
        const slideEls = container.querySelectorAll<HTMLElement>('[data-slide-idx]');
        if (slideEls.length === 0) return;
        const containerRect = container.getBoundingClientRect();
        const containerCenter = containerRect.top + containerRect.height / 2;
        let bestIdx = 0;
        let bestDist = Infinity;
        slideEls.forEach(el => {
          const r = el.getBoundingClientRect();
          const elCenter = r.top + r.height / 2;
          const dist = Math.abs(elCenter - containerCenter);
          if (dist < bestDist) { bestDist = dist; bestIdx = parseInt(el.getAttribute('data-slide-idx') || '0', 10); }
        });
        setSelectedIdx(bestIdx);
      });
    };

    // Wait for entrance animation before listening
    const timer = setTimeout(() => {
      container.addEventListener('scroll', onScroll, { passive: true });
    }, 800);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(scrollRafRef.current);
      container.removeEventListener('scroll', onScroll);
    };
  }, [phase, slides]);

  // Left sidebar: scroll the selected thumbnail to vertical center
  useEffect(() => {
    if (phase !== 'done') return;
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const thumb = sidebar.querySelector(`[data-thumb-idx="${selectedIdx}"]`) as HTMLElement | null;
    if (thumb) thumb.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedIdx, phase]);

  // Click sidebar → scroll showcase to center that slide
  const handleThumbClick = useCallback((idx: number) => {
    setSelectedIdx(idx);
    const el = showcaseRef.current?.querySelector(`[data-slide-idx="${idx}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  // Keyboard navigation: arrow keys to change selected slide
  useEffect(() => {
    if (phase !== 'done' || !slides) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIdx(prev => {
          const next = Math.min(prev + 1, slides.length - 1);
          const el = showcaseRef.current?.querySelector(`[data-slide-idx="${next}"]`) as HTMLElement | null;
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIdx(prev => {
          const next = Math.max(prev - 1, 0);
          const el = showcaseRef.current?.querySelector(`[data-slide-idx="${next}"]`) as HTMLElement | null;
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, slides]);

  // ── Export helpers ──────────────────────────────────────────────────

  const buildDeck = useCallback((): Deck | null => {
    if (!slides) return null;
    return {
      id: `gen-${Date.now()}`,
      name: 'Generated Deck',
      slides,
      theme,
      pageSize: isReport ? 'letter' : 'slide-16:9',
    };
  }, [slides, theme, isReport]);

  const handleExport = useCallback(async (type: 'lasca' | 'pdf') => {
    const deck = buildDeck();
    if (!deck) return;
    setExportOpen(false);
    if (type === 'lasca') { downloadLasca(deck, locale); return; }
    // PDF — single 1080p variant; the previous 4K opt-in was dropped.
    setExporting(true);
    try { await exportPdf(deck); } finally { setExporting(false); }
  }, [buildDeck, locale]);

  // Close export dropdown on outside click
  const exportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [exportOpen]);

  // ── Render ──────────────────────────────────────────────────────────

  const isStreaming = phase === 'streaming' || phase === 'revealing' || phase === 'exploding';

  // Adaptive grid columns: try to balance into 2 rows, capped at max
  const maxCols = isReport ? 4 : 3;
  const itemCount = outline.length || 1;
  const gridCols = itemCount <= maxCols
    ? itemCount
    : Math.min(maxCols, Math.ceil(itemCount / 2));

  const previewMaxWidth = phase === 'done'
    ? (isReport ? 1120 : 1200)
    : gridCols * thumbMetrics.w + (gridCols - 1) * 16 + 40;
  const phaseTitle = phase === 'streaming'
    ? t(isReport ? 'generation.streaming_report' : 'generation.streaming')
    : phase === 'done' && slides
      ? t(isReport ? 'generation.done_report' : 'generation.done', { n: slides.length })
      : phase === 'connecting'
        ? t('generation.connecting')
        : phase === 'revealing'
          ? t('generation.revealing')
          : phase === 'exploding'
            ? '✦'
            : t('generation.error');

  return (
    <div
      className={[((presetId === 'bilingual-report' || resultPresetId === 'bilingual-report') ? 'preset-bilingual-report' : ''), getSceneClass(theme)].filter(Boolean).join(' ') || undefined}
      style={{
      width: '100%',
      maxWidth: previewMaxWidth,
      margin: '0 auto',
      paddingBottom: phase === 'done' ? 40 : 120,
      transition: 'max-width 0.6s ease',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: phase === 'done' ? 20 : 32 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#141413', marginBottom: 6 }}>
          {phaseTitle}
        </h2>
        {phase === 'streaming' && progress && (
          <p style={{ fontSize: 14, color: '#b0aea5' }}>
            {t('generation.progress', { from: progress.from, to: Math.min(progress.to, progress.total), total: progress.total })}
          </p>
        )}
      </div>

      {/* Connecting spinner */}
      {phase === 'connecting' && (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <div style={{ fontSize: 28, animation: 'spin 2s linear infinite' }}>✦</div>
        </div>
      )}

      {/* ════════ Streaming + Exploding: 3-column centered grid ════════ */}
      {isStreaming && outline.length > 0 && (
        <div
          ref={gridRef}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gap: 16,
            justifyItems: 'center',
            position: 'relative',
            overflow: phase === 'exploding' ? 'hidden' : 'visible',
            width: '100%',
            maxWidth: isReport ? 4 * thumbMetrics.w + 3 * 16 : 3 * thumbMetrics.w + 2 * 16,
            margin: '0 auto',
            paddingTop: isReport ? 4 : 0,
          }}
        >
          {/* ── Sparkle characters ── */}
          {phase === 'streaming' && sparkles.map((sp, i) => (
            <div
              key={`sparkle-${i}`}
              style={{
                position: 'absolute',
                left: `${sp.x}%`, top: `${sp.y}%`,
                fontSize: sp.size,
                color: '#fff',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: 5,
                animation: `genSparkle ${sp.dur}s ease-in-out ${sp.delay}s infinite`,
                filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.8)) drop-shadow(0 0 8px rgba(217,119,87,0.3))',
                textShadow: '0 0 6px rgba(255,255,255,0.9)',
              }}
            >
              {sp.char}
            </div>
          ))}

          {/* ── Glowing light orbs ── */}
          {phase === 'streaming' && orbs.map((orb, i) => (
            <div
              key={`orb-${i}`}
              style={{
                position: 'absolute',
                left: `${orb.x}%`, top: `${orb.y}%`,
                width: orb.size, height: orb.size,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
                boxShadow: `0 0 ${orb.size * 1.5}px ${orb.size * 0.5}px ${orb.color}`,
                opacity: 0,
                pointerEvents: 'none',
                zIndex: 4,
                animation: `genOrbDrift ${orb.dur}s ease-in-out ${orb.delay}s infinite`,
              }}
            />
          ))}

          {/* ── Scanning light sweep (marquee shining bar) ── */}
          {phase === 'streaming' && (
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              zIndex: 6, overflow: 'hidden',
            }}>
              <div style={{
                position: 'absolute',
                top: 0, width: '25%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), rgba(255,255,255,0.25), rgba(255,255,255,0.06), transparent)',
                animation: 'genSweep 3s ease-in-out infinite',
                filter: 'blur(10px)',
              }} />
            </div>
          )}

          {outline.map((item, i) => {
            const isRevealed = slides && i < revealedCount;
            const hasEarly = earlySlides.has(i);        // slide arrived during streaming
            const isReady = isRevealed || hasEarly;      // either way, we have data
            const isActive = phase === 'streaming' && progress
              && (i + 1) >= progress.from && (i + 1) <= progress.to;
            const floatDelay = ((i * 370) % 2000) / 1000;
            const floatDuration = 2.5 + (i % 3) * 0.4;
            const slideData = isRevealed && slides ? slides[i] : earlySlides.get(i);

            return (
              <div
                key={i}
                data-card
                style={{
                  width: thumbMetrics.w,
                  height: thumbMetrics.h + 28,
                  opacity: 0,
                  position: 'relative',
                  // Stop floating when slide is ready (it's "solidifying")
                  animation: !isReady && phase !== 'exploding'
                    ? `genFloat ${floatDuration}s ease-in-out ${floatDelay}s infinite`
                    : 'none',
                }}
              >
                <div style={{
                  width: thumbMetrics.w, height: thumbMetrics.h,
                  borderRadius: isReport ? 16 : 14,
                  border: isReady
                    ? '1px solid rgba(232,230,220,0.5)'
                    : isActive
                      ? '1.5px solid rgba(255,255,255,0.6)'
                      : '1px solid rgba(255,255,255,0.35)',
                  // Glass → solid when slide arrives
                  background: isReady
                    ? '#fff'
                    : isActive
                      ? 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(240,238,234,0.3) 50%, rgba(255,255,255,0.2) 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, rgba(245,244,240,0.25) 50%, rgba(255,255,255,0.15) 100%)',
                  backdropFilter: isReady ? 'none' : 'blur(12px) saturate(1.4)',
                  WebkitBackdropFilter: isReady ? 'none' : 'blur(12px) saturate(1.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', position: 'relative',
                  transition: 'background 0.5s ease-out, border-color 0.5s ease-out, box-shadow 0.5s ease-out',
                  animation: isActive && !isReady ? 'genPulse 1.8s ease-in-out infinite' : 'none',
                  boxShadow: isReady
                    ? (isReport ? '0 18px 36px rgba(20,20,19,0.08), 0 2px 8px rgba(20,20,19,0.04)' : '0 2px 8px rgba(0,0,0,0.06)')
                    : isActive
                      ? '0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.5)'
                      : '0 2px 8px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.4)',
                }}>
                  {/* Inner specular highlight — only on glass cards */}
                  {!isReady && (
                    <div style={{
                      position: 'absolute', top: -1, left: -1, right: '50%', height: '50%',
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 60%)',
                      borderRadius: '14px 14px 0 0',
                      pointerEvents: 'none',
                    }} />
                  )}
                  {/* Wireframe SVG — fades when slide arrives */}
                  <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: isReady ? 0 : 0.75,
                    transition: 'opacity 0.6s ease-out',
                    animation: !isReady && phase !== 'exploding'
                      ? `genSvgBreath ${3 + (i % 4) * 0.3}s ease-in-out ${floatDelay * 0.7}s infinite`
                      : 'none',
                    transform: `scale(${isReport ? 3.05 : 3.5})`,
                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.08))',
                  }}>
                    <LayoutThumb layout={item.layout} active={!!isActive} size="md" forcePortrait={isReport} />
                  </div>
                  {/* Real slide — clear underneath, frosted glass overlay sweeps away */}
                  {slideData && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      // After laser sweep completes, breathe between blur and clear
                      // (synced with genFloat rhythm). Stop breathing during revealing/exploding.
                      animation: hasEarly && !isRevealed && phase === 'streaming'
                        ? `genGlassBreath ${floatDuration}s ease-in-out ${i * 0.6 + 3}s infinite`
                        : 'none',
                    }}>
                      <SlideThumbnail slide={slideData} theme={theme} scale={thumbMetrics.scale} w={logical.w} h={logical.h} />
                      {/* Frosted glass overlay — laser sweeps it away left→right */}
                      {hasEarly && !isRevealed && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          backdropFilter: 'blur(12px) saturate(1.4)',
                          WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(240,238,234,0.3) 50%, rgba(255,255,255,0.2) 100%)',
                          clipPath: 'inset(0 0 0 0)',
                          animation: `genGlassSweep 3s ease-out ${i * 0.6}s forwards`,
                        }} />
                      )}
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: isReady ? '#788c5d' : '#e8e6dc',
                    color: isReady ? '#fff' : '#b0aea5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 600, transition: 'all 0.3s',
                  }}>
                    {isReady ? '✓' : i + 1}
                  </span>
                  <span style={{
                    fontSize: 12, color: '#6b6a65',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: thumbMetrics.w - 30,
                  }}>
                    {item.point.slice(0, 30)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ════════ Done: left thumbs + right showcase + action sidebar ════════ */}
      {phase === 'done' && slides && (
        <div style={{ display: 'flex', gap: isReport ? 16 : 20, alignItems: 'flex-start' }}>
          {/* Left: clickable thumbnail strip — sticky, vertically centered */}
          <div
            ref={sidebarRef}
            className="no-scrollbar"
            style={{
              width: isReport ? smallMetrics.w + 26 : 178, flexShrink: 0,
              display: 'flex', flexDirection: 'column', gap: 8,
              opacity: 0,
              position: 'sticky', top: 80,
              maxHeight: 'calc(100vh - 120px)',
              overflowY: 'auto',
              overflowX: 'hidden',
              padding: '4px 8px 4px 6px',
              userSelect: 'none',
            }}
          >
            {slides.map((slide, i) => (
              <div
                key={i}
                data-thumb-idx={i}
                onClick={() => handleThumbClick(i)}
                style={{
                  position: 'relative', cursor: 'pointer',
                  transition: 'transform 0.2s',
                  opacity: selectedIdx === i ? 1 : 0.7,
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = selectedIdx === i ? '1' : '0.7'; }}
              >
                <div style={{
                  width: smallMetrics.w, height: smallMetrics.h,
                  borderRadius: 8, overflow: 'hidden',
                  border: selectedIdx === i ? '2px solid #d97757' : '1px solid #e8e6dc',
                  boxShadow: selectedIdx === i ? '0 0 0 3px rgba(217,119,87,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
                  transition: 'all 0.2s',
                }}>
                  <SlideThumbnail slide={slide} theme={theme} scale={smallMetrics.scale} w={logical.w} h={logical.h} />
                </div>
                <div style={{
                  position: 'absolute', top: 4, left: 4,
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                  color: selectedIdx === i ? '#d97757' : '#6b6a65',
                }}>
                  {i + 1}
                </div>
                {/* Page type label */}
                {(() => {
                  const pt = inferPageType(slide, i, slides.length);
                  const cfg = PAGE_TYPE_CONFIG[pt];
                  return (
                    <div style={{
                      position: 'absolute', top: 4, right: 4,
                      fontSize: 8, padding: '1px 5px', borderRadius: 3,
                      lineHeight: '14px', fontWeight: 500, letterSpacing: '0.02em',
                      background: cfg.bg, color: cfg.color,
                    }}>
                      {cfg.label[locale]}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>

          {/* Center: large showcase — scroll-snap container, snaps each slide to center */}
          <div
            ref={showcaseRef}
            className="no-scrollbar"
            style={{
              flex: 1, minWidth: 0, opacity: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: isReport ? 'center' : 'stretch',
              gap: 14,
              paddingBottom: 80,
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: 'calc(100vh - 100px)',
              scrollSnapType: 'y mandatory',
              scrollBehavior: 'smooth',
            }}
          >
            {slides.map((slide, i) => (
              <div
                key={i}
                data-slide-idx={i}
                onClick={() => handleThumbClick(i)}
                style={{
                  width: bigMetrics.w,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: selectedIdx === i
                    ? '1.5px solid rgba(217,119,87,0.3)'
                    : '1px solid rgba(232,230,220,0.5)',
                  boxShadow: selectedIdx === i
                    ? '0 0 24px 4px rgba(217,119,87,0.18), 0 0 60px rgba(217,119,87,0.08)'
                    : '0 1px 6px rgba(0,0,0,0.04)',
                  background: '#fff',
                  transition: 'box-shadow 0.3s, border 0.3s',
                  cursor: 'pointer',
                  flexShrink: 0,
                  scrollSnapAlign: 'center',
                }}
              >
                <SlideThumbnail slide={slide} theme={theme} scale={bigMetrics.scale} w={logical.w} h={logical.h} />
              </div>
            ))}
          </div>

          {/* Right: action buttons, vertical, sticky */}
          <div
            ref={actionRef}
            style={{
              width: 80, flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              gap: 10, paddingTop: 8,
              opacity: 0,
              position: 'sticky', top: 80,
            }}
          >
            <ActionBtn
              label={t('generation.edit')}
              icon="✎"
              primary
              onClick={() => onEnterEditor(slides, resultPresetId)}
            />
            <ActionBtn
              label={t('generation.play')}
              icon="▶"
              onClick={() => onPresent(slides, resultPresetId)}
            />
            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: 'relative' }}>
              <ActionBtn
                label={exporting ? '...' : t('generation.export')}
                icon="↓"
                onClick={() => setExportOpen(o => !o)}
              />
              {exportOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: '100%', marginTop: 4,
                  background: '#fff', borderRadius: 10, border: '1px solid #e8e6dc',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  padding: '4px 0', minWidth: 180, zIndex: 10,
                }}>
                  <ExportDropdownItem onClick={() => handleExport('lasca')} label=".lasca" desc={t('toolbar.export_lasca_desc')} />
                  <ExportDropdownItem onClick={() => handleExport('pdf')} label="PDF" desc={exporting ? '...' : t('toolbar.export_pdf_desc')} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <p style={{ color: '#c0392b', fontSize: 14, marginBottom: 20 }}>{errorMsg}</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  padding: '10px 28px', borderRadius: 10, border: '1px solid #e8e6dc',
                  background: '#fff', color: '#141413', fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {t('generation.back')}
              </button>
            )}
            <button
              onClick={startGeneration}
              style={{
                padding: '10px 28px', borderRadius: 10, border: '1px solid #d97757',
                background: '#d97757', color: '#fff', fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('generation.retry')}
            </button>
          </div>
        </div>
      )}

      {phase === 'done' && slides && showRating && (
        <GenerationRating
          slideCount={slides.length}
          presetId={resultPresetId}
          onDismiss={() => setShowRating(false)}
        />
      )}
    </div>
  );
}

// ── Vertical action button ────────────────────────────────────────────

function ActionBtn({ label, icon, primary, onClick }: {
  label: string; icon: string; primary?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '10px 0',
        borderRadius: 12,
        border: primary ? 'none' : '1px solid #e8e6dc',
        background: primary ? '#1a1a2e' : '#fff',
        color: primary ? '#fff' : '#141413',
        fontSize: 13, fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 3,
        transition: 'all 0.2s',
        boxShadow: primary ? '0 2px 8px rgba(26,26,46,0.2)' : '0 1px 4px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.05)';
        if (primary) e.currentTarget.style.background = '#2a2a4e';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
        if (primary) e.currentTarget.style.background = '#1a1a2e';
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// ── Export dropdown item (matches editor Toolbar style) ───────────────

function ExportDropdownItem({ onClick, label, desc }: { onClick: () => void; label: string; desc: string }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '8px 14px', fontSize: 12, cursor: 'pointer',
        color: '#141413', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f5f4ef'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 10, color: '#b0aea5' }}>{desc}</span>
    </div>
  );
}

// ── SlideRender removed (Phase 2.6) ────────────────────────────────────
// Replaced by shared SlideThumbnail from components/ui/SlideThumbnail.tsx.
// The imperative innerHTML pattern is preserved in the shared component.
