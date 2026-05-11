'use client';

// ============================================================================
// ReportPreviewPane — middle pane for report-type decks (replaces Canvas)
// ============================================================================
// Runs paged.js live against deck.sourceMd / theme / header / footer / pageSize.
// A generation counter cancels stale runs so rapid edits don't race. Accepts
// a zoomLevel prop from Editor.tsx so the existing status-bar zoom slider
// still works — paged.js pages are scaled via transform: scale() since their
// physical size is fixed (letter = 816×1056 at 96 dpi).
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '@/lib/store';
import { parseMd } from '@/lib/reports/mdToReportDeck';
import { buildFlowHtml, buildPageCss, runPagedjs } from '@/lib/reports/pagedjsFlow';
import { THEMES } from '@/lib/themes';
import type { Theme } from '@/lib/types';
import { useLocale } from '@/lib/i18n';

const DEBOUNCE_MS = 350;

// One canvas for every theme — the desk is constant, only the paper changes.
// Value is the Lasca shell editor-bg (see docs/AESTHETICS.md). Depth comes
// from the per-theme page shadow: warm-black drop for light themes, warm
// amber halo for Cavern (both defined in pagedjsFlow.ts). Figma / Keynote /
// Apple Pages use the same pattern — one desk, many papers.
const CANVAS_BG = '#f0efeb';

type Status = 'idle' | 'paginating' | 'done' | 'error';

interface Props {
  zoomLevel: number;
}

export function ReportPreviewPane({ zoomLevel }: Props) {
  const locale = useLocale();
  const deck = useEditorStore(s => s.activeDeck());

  const [status, setStatus] = useState<Status>('idle');
  const [pageCount, setPageCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);

  const paginate = useCallback(async (
    md: string,
    theme: Theme,
    header: string,
    footer: string,
    pageSize: 'letter' | 'a4',
  ) => {
    const mountEl = outputRef.current;
    if (!mountEl) return;

    const myGen = ++generationRef.current;
    setStatus('paginating');
    setErrorMsg('');
    const started = performance.now();

    while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);

    try {
      const parsed = parseMd(md, { locale });
      const themeConfig = THEMES[theme] ?? THEMES.warm;
      const flowHtml = buildFlowHtml(parsed, themeConfig, theme);
      const pageCss = buildPageCss(
        header || undefined,
        footer || undefined,
        pageSize,
        themeConfig,
        theme,
      );
      const result = await runPagedjs(flowHtml, pageCss, mountEl);
      if (myGen !== generationRef.current) return;
      setPageCount(result.total);
      setElapsedMs(Math.round(performance.now() - started));
      setStatus('done');
    } catch (e) {
      if (myGen !== generationRef.current) return;
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }, [locale]);

  const md = deck.sourceMd ?? '';
  const theme = deck.theme;
  const header = deck.header ?? '';
  const footer = deck.footer ?? '';
  const pageSize: 'letter' | 'a4' = deck.pageSize === 'a4' ? 'a4' : 'letter';

  // Re-paginate on any input change. Initial run also goes through this
  // effect (fires immediately on mount because it has no preceding state).
  useEffect(() => {
    const tid = setTimeout(() => {
      void paginate(md, theme, header, footer, pageSize);
    }, DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [md, theme, header, footer, pageSize, paginate]);

  // Fire once on mount so the first paint doesn't wait the full debounce.
  useEffect(() => {
    void paginate(md, theme, header, footer, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Double-click to locate (text-find) ─────────────────────────────────
  // Right → left: dblclick anywhere. Read the clicked block's
  // data-lasca-section-title (stamped by buildFlowHtml from the parent
  // H1/H2/H3 plain text). Fire 'lasca:locate-text' with { query } — the
  // source pane then runs `textarea.value.indexOf(query)` and highlights
  // the whole line containing the match. No line-number math anywhere;
  // robust against paged.js split-clones and parser line-count drift.
  // Cover-area content (before the first heading) has no sectionTitle —
  // we fall back to the first ~20 chars of the clicked block's own text.
  useEffect(() => {
    const el = outputRef.current;
    if (!el) return;
    const handler = (ev: Event) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const hit = target.closest('[data-lasca-source-line]') as HTMLElement | null;
      if (!hit) return;
      const sectionTitle = hit.getAttribute('data-lasca-section-title');
      const query = sectionTitle && sectionTitle.trim()
        ? sectionTitle.trim()
        : (hit.textContent ?? '').trim().slice(0, 20);
      if (!query) return;
      window.dispatchEvent(new CustomEvent('lasca:locate-text', { detail: { query } }));
    };
    el.addEventListener('dblclick', handler);
    return () => el.removeEventListener('dblclick', handler);
  }, []);

  // Left → right: md pane fires 'lasca:scroll-to-line' with { line }.
  // We find the matching [data-lasca-source-line], scroll it into view,
  // and flash an outline. Paged.js split-continuations carry data-split-
  // from; we filter those so we always land on the origin block.
  useEffect(() => {
    const mount = outputRef.current;
    if (!mount) return;
    const handler = (ev: Event) => {
      const line = (ev as CustomEvent<{ line: number }>).detail?.line;
      if (line == null) return;
      const target = mount.querySelector<HTMLElement>(
        `[data-lasca-source-line="${line}"]:not([data-split-from])`,
      );
      if (!target) return;
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const prevOutline = target.style.outline;
      target.style.outline = '2px solid rgba(217,119,87,0.6)';
      target.style.outlineOffset = '4px';
      target.style.borderRadius = '2px';
      setTimeout(() => {
        target.style.outline = prevOutline;
        target.style.outlineOffset = '';
      }, 1500);
    };
    window.addEventListener('lasca:scroll-to-line', handler);
    return () => window.removeEventListener('lasca:scroll-to-line', handler);
  }, []);

  return (
    <div style={{
      flex: 1,
      overflow: 'auto',
      background: CANVAS_BG,
      position: 'relative',
    }}>
      {/* Scaled wrapper — paged.js pages are physical-sized; scale via
          transform so the Editor's zoom slider still works. */}
      <div style={{
        transform: `scale(${zoomLevel})`,
        transformOrigin: 'top center',
      }}>
        <div ref={outputRef} />
      </div>

      {/* Status pill — top-right floating indicator */}
      <div style={{
        position: 'absolute', top: 12, right: 14,
        padding: '4px 10px', fontSize: 11, fontWeight: 500,
        background: 'rgba(255,255,255,0.92)', color: '#8a8880',
        border: '1px solid #e8e6dc', borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        pointerEvents: 'none',
      }}>
        {status === 'paginating' && 'Paginating…'}
        {status === 'done' && `${pageCount} pages · ${elapsedMs}ms`}
        {status === 'error' && <span style={{ color: '#c33' }}>Error</span>}
        {status === 'idle' && 'Ready'}
      </div>

      {status === 'error' && (
        <div style={{
          position: 'absolute', top: 48, left: 16, right: 16,
          padding: 12, background: '#fff2f0',
          border: '1px solid #f5c2c0', borderRadius: 6,
          fontSize: 12, color: '#b42318',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>
          Paginate error: {errorMsg}
        </div>
      )}
    </div>
  );
}
