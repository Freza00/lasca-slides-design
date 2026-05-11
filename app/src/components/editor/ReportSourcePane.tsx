'use client';

// ============================================================================
// ReportSourcePane — left pane for report-type decks
// ============================================================================
// Replaces <Sidebar /> when deck.sourceMd is set. Two view modes:
//   - 'source' — raw markdown textarea with a formatting toolbar that
//     inserts/wraps md syntax at the cursor.
//   - 'preview' — read-only rendered view (parseMd + buildFlowHtml).
//
// Writes through to the store via setDeckSourceMd (debounced 350ms). The
// store action handles undo granularity so fast typing merges into one
// snapshot.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useEditorStore } from '@/lib/store';
import { parseMd } from '@/lib/reports/mdToReportDeck';
import { renderMdPreviewHtml, MD_PREVIEW_CSS } from '@/lib/reports/mdPreview';
import { useLocale } from '@/lib/i18n';

const PANE_WIDTH = 420;
const DEBOUNCE_MS = 350;

type ViewMode = 'source' | 'preview';

// ── Toolbar button actions ─────────────────────────────────────────────────

interface InsertResult {
  next: string;
  selStart: number;
  selEnd: number;
}

function wrap(value: string, start: number, end: number, left: string, right: string = left): InsertResult {
  const selected = value.slice(start, end);
  const next = value.slice(0, start) + left + selected + right + value.slice(end);
  return { next, selStart: start + left.length, selEnd: end + left.length };
}

function prefixLines(value: string, start: number, end: number, prefix: string): InsertResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const rawLineEnd = end === start ? end : value.indexOf('\n', end - 1);
  const lineEnd = rawLineEnd === -1 ? value.length : rawLineEnd;
  const block = value.slice(lineStart, lineEnd);
  const patched = block
    .split('\n')
    .map(line => prefix + line)
    .join('\n');
  const next = value.slice(0, lineStart) + patched + value.slice(lineEnd);
  return {
    next,
    selStart: lineStart + prefix.length,
    selEnd: lineStart + patched.length,
  };
}

function insertAtLineStart(value: string, start: number, end: number, text: string): InsertResult {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const next = value.slice(0, lineStart) + text + value.slice(lineStart);
  return {
    next,
    selStart: lineStart + text.length,
    selEnd: lineStart + text.length + (end - start),
  };
}

interface ToolbarAction {
  label: string;
  title: string;
  apply: (value: string, start: number, end: number) => InsertResult;
}

const TABLE_SKELETON = `\n| Column A | Column B | Column C |\n|---|---|---|\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n`;

const ACTIONS: ToolbarAction[] = [
  { label: 'B',  title: 'Bold (**text**)',     apply: (v, s, e) => wrap(v, s, e, '**') },
  { label: 'I',  title: 'Italic (*text*)',     apply: (v, s, e) => wrap(v, s, e, '*') },
  { label: 'H1', title: 'Heading 1',           apply: (v, s, e) => insertAtLineStart(v, s, e, '# ') },
  { label: 'H2', title: 'Heading 2 (section)', apply: (v, s, e) => insertAtLineStart(v, s, e, '## ') },
  { label: 'H3', title: 'Heading 3',           apply: (v, s, e) => insertAtLineStart(v, s, e, '### ') },
  { label: '•',  title: 'Bullet list',         apply: (v, s, e) => prefixLines(v, s, e, '- ') },
  { label: '1.', title: 'Numbered list',       apply: (v, s, e) => prefixLines(v, s, e, '1. ') },
  { label: '❝',  title: 'Blockquote',          apply: (v, s, e) => prefixLines(v, s, e, '> ') },
  { label: '🔗', title: 'Link',                apply: (v, s, e) => wrap(v, s, e, '[', '](https://)') },
  {
    label: '▦',
    title: 'Table skeleton',
    apply: (v, _s, e) => ({
      next: v.slice(0, e) + TABLE_SKELETON + v.slice(e),
      selStart: e + TABLE_SKELETON.length,
      selEnd: e + TABLE_SKELETON.length,
    }),
  },
  {
    // The horizontal-rule line (`---`) is mapped to a hard page break by
    // mdToReportDeck.ts. Inserting it via this button is the user-facing
    // affordance for "force a page break here" in the rendered report —
    // useful for short weekly reports where the auto-paginator (paged.js)
    // wouldn't break by itself, or where the author wants a numbered
    // section to start fresh on a new page.
    label: '⤓',
    title: 'Page break (--- separator → new page)',
    apply: (v, _s, e) => {
      // Newline-pad to keep the `---` on its own line regardless of where
      // the cursor was (mid-paragraph cursor would otherwise produce a
      // setext heading underline instead of an hr).
      const before = v.slice(0, e);
      const after = v.slice(e);
      const lead = before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
      const trail = after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
      const inserted = `${lead}---${trail}`;
      return {
        next: before + inserted + after,
        selStart: e + inserted.length,
        selEnd: e + inserted.length,
      };
    },
  },
];

// ── Component ───────────────────────────────────────────────────────────────

export function ReportSourcePane() {
  const locale = useLocale();
  const deck = useEditorStore(s => s.activeDeck());
  const setDeckSourceMd = useEditorStore(s => s.setDeckSourceMd);

  const [mode, setMode] = useState<ViewMode>('source');
  const [mdDraft, setMdDraft] = useState<string>(deck.sourceMd ?? '');
  const [jumpToast, setJumpToast] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const lastDeckIdRef = useRef<string>(deck.id);
  const jumpToastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastDeckIdRef.current !== deck.id) {
      lastDeckIdRef.current = deck.id;
      setMdDraft(deck.sourceMd ?? '');
      setMode('source');
    }
  }, [deck.id, deck.sourceMd]);

  // Debounced write-through md → store.
  useEffect(() => {
    if (mdDraft === (deck.sourceMd ?? '')) return;
    const tid = setTimeout(() => {
      setDeckSourceMd(mdDraft);
    }, DEBOUNCE_MS);
    return () => clearTimeout(tid);
  }, [mdDraft, deck.sourceMd, setDeckSourceMd]);

  const wordCount = useMemo(() => {
    if (!mdDraft) return 0;
    const matches = mdDraft.match(/\S+/g);
    return matches ? matches.length : 0;
  }, [mdDraft]);

  const applyAction = useCallback((action: ToolbarAction) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const { next, selStart, selEnd } = action.apply(mdDraft, start, end);
    setMdDraft(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }, [mdDraft]);

  // ── Click-to-locate helpers ────────────────────────────────────────────
  //
  // Line-based anchoring: buildFlowHtml stamps data-lasca-source-line="N"
  // on every rendered block, where N is the original md line index. The
  // md pane receives { line } events and jumps the textarea to that
  // absolute line — block-accurate, no "nearest heading" ambiguity.

  // Convert a zero-based md line index to a character offset in mdDraft.
  const lineToCharOffset = useCallback((md: string, line: number): number => {
    if (line <= 0) return 0;
    let offset = 0;
    let count = 0;
    while (count < line) {
      const nl = md.indexOf('\n', offset);
      if (nl === -1) return md.length;
      offset = nl + 1;
      count++;
    }
    return offset;
  }, []);

  // Find the md line index for the character offset at the textarea cursor.
  const charOffsetToLine = useCallback((md: string, offset: number): number => {
    return (md.slice(0, offset).match(/\n/g) || []).length;
  }, []);

  // Measure the pixel offset of a character offset inside a textarea by
  // mounting a hidden mirror div with the same inner content width + font +
  // padding as the textarea, then reading the marker span's offsetTop.
  // Width is derived from ta.clientWidth (NOT computed CSS width) so it
  // matches the textarea's actual content area AFTER the vertical scrollbar
  // has taken its share — this was the quiet culprit of jumps landing a few
  // hundred px off on wrapped paragraphs.
  const measureCaretTop = useCallback((ta: HTMLTextAreaElement, offset: number): number => {
    const style = window.getComputedStyle(ta);
    const padL = parseFloat(style.paddingLeft) || 0;
    const padR = parseFloat(style.paddingRight) || 0;
    const padT = parseFloat(style.paddingTop) || 0;
    const innerWidth = Math.max(0, ta.clientWidth - padL - padR);
    const mirror = document.createElement('div');
    Object.assign(mirror.style, {
      position: 'absolute',
      top: '0',
      left: '-9999px',
      visibility: 'hidden',
      boxSizing: 'content-box',
      width: `${innerWidth}px`,
      padding: '0',
      border: 'none',
      margin: '0',
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      tabSize: style.tabSize,
      whiteSpace: 'pre-wrap',
      wordWrap: 'break-word',
      overflowWrap: 'break-word',
    });
    mirror.appendChild(document.createTextNode(ta.value.slice(0, offset)));
    const marker = document.createElement('span');
    marker.textContent = '​'; // zero-width space — gives the span a height
    mirror.appendChild(marker);
    // A trailing character forces the line height to reflect what a real
    // caret at this offset would occupy.
    mirror.appendChild(document.createTextNode(ta.value.slice(offset) || ' '));
    document.body.appendChild(mirror);
    // Add textarea's top padding back — offsetTop is from mirror's content
    // origin, but the textarea's scrollable coord system starts at the top
    // of the top padding.
    const top = marker.offsetTop + padT;
    document.body.removeChild(mirror);
    return top;
  }, []);

  // Right → left: preview pane fires 'lasca:locate-text' with { query } —
  // typically the clicked block's parent section title. Run a substring
  // search in the textarea, select the whole line containing the first
  // match, scroll it into view, pulse the border. No line-number math:
  // "所见即所得 — 右边看到的文字，一定能在左边找到."
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ query: string }>).detail;
      const query = detail?.query;
      if (!query) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const idx = mdDraft.indexOf(query);
      if (idx < 0) return;  // silent no-op when not found
      const selStart = mdDraft.lastIndexOf('\n', idx - 1) + 1;
      const nextNl = mdDraft.indexOf('\n', idx);
      const selEnd = nextNl === -1 ? mdDraft.length : nextNl;

      ta.focus();
      ta.setSelectionRange(selStart, selEnd);

      // Scrolling the selected line to ~1/3 from the top of the visible area
      // needs two passes: (1) set it immediately so the fast case looks right,
      // (2) reassert on the next frame because some browsers auto-scroll the
      // textarea to show the caret after focus/setSelectionRange, which would
      // otherwise land the line at the bottom or mid-screen.
      const scrollToCaret = () => {
        if (textareaRef.current !== ta) return;
        const caretTop = measureCaretTop(ta, selStart);
        ta.scrollTop = Math.max(0, caretTop - ta.clientHeight / 3);
      };
      scrollToCaret();
      requestAnimationFrame(scrollToCaret);

      ta.style.transition = 'box-shadow 0.35s ease-out';
      ta.style.boxShadow = 'inset 0 0 0 3px rgba(217,119,87,0.6)';
      window.setTimeout(() => {
        if (textareaRef.current === ta) ta.style.boxShadow = '';
      }, 1200);

      // Toast echoes the actual text we found — so it's obvious the jump is
      // driven by text-find, not line numbers. Trim long queries so cover-
      // fallback content (first ~20 chars of a paragraph) doesn't blow out
      // the pill.
      const label = query.length > 18 ? `${query.slice(0, 18)}…` : query;
      setJumpToast(`跳转到：${label}`);
      if (jumpToastTimerRef.current != null) {
        window.clearTimeout(jumpToastTimerRef.current);
      }
      jumpToastTimerRef.current = window.setTimeout(() => {
        setJumpToast(null);
        jumpToastTimerRef.current = null;
      }, 1800);
    };
    window.addEventListener('lasca:locate-text', handler);
    return () => window.removeEventListener('lasca:locate-text', handler);
  }, [mdDraft, measureCaretTop]);

  // Left → right: dblclick in the textarea. Compute the line at the cursor
  // and fire 'lasca:scroll-to-line' so ReportPreviewPane can scroll to the
  // rendered block with matching data-lasca-source-line.
  const handleTextareaDblClick = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? 0;
    const line = charOffsetToLine(mdDraft, cursor);
    window.dispatchEvent(new CustomEvent('lasca:scroll-to-line', {
      detail: { line },
    }));
  }, [mdDraft, charOffsetToLine]);

  // Inject the md-preview stylesheet + a brand-color ::selection rule on
  // the report md textarea (so the locate-line jump shows as clearly
  // terracotta-highlighted text, not subtle OS-blue on cream-bg).
  useEffect(() => {
    const STYLE_ID = 'lasca-md-preview-css';
    if (document.getElementById(STYLE_ID)) return;
    const styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.textContent = MD_PREVIEW_CSS + `
      .lasca-report-md-textarea::selection {
        background: rgba(217, 119, 87, 0.38);
        color: inherit;
      }
      .lasca-report-md-textarea::-moz-selection {
        background: rgba(217, 119, 87, 0.38);
        color: inherit;
      }
      @keyframes lasca-toast-fade {
        0%   { opacity: 0; transform: translateY(-6px); }
        12%  { opacity: 1; transform: translateY(0); }
        80%  { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(styleEl);
  }, []);

  // Rendered preview — a lightweight md → HTML pass (renderMdPreviewHtml).
  // This is deliberately NOT the paged.js flow. Preview shows md the way
  // Typora / Bear / GitHub renders it: styled text, no report cover, no
  // section capsules, no end page — just "can I read this?". Theme-agnostic.
  // Text is escaped inside mdPreview.ts; we use createContextualFragment so
  // React never owns this subtree (same imperative-DOM rule as Canvas.tsx).
  useEffect(() => {
    if (mode !== 'preview') return;
    const mount = previewRef.current;
    if (!mount) return;
    while (mount.firstChild) mount.removeChild(mount.firstChild);
    try {
      const parsed = parseMd(mdDraft, { locale });
      const html = renderMdPreviewHtml(parsed);
      const range = document.createRange();
      const fragment = range.createContextualFragment(html);
      mount.appendChild(fragment);
    } catch (e) {
      mount.textContent = `Preview error: ${(e as Error).message}`;
    }
  }, [mode, mdDraft, locale]);

  return (
    <div style={{
      width: PANE_WIDTH,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid #e8e6dc',
      background: '#faf9f5',
      position: 'relative',
    }}>
      {/* Jump toast — shows which md line range we landed on after a
          right→left sync, so any disagreement between click target and
          textarea position is visible at a glance. */}
      {jumpToast && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            zIndex: 20,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 0.02,
            color: '#fff',
            background: 'rgba(217, 119, 87, 0.92)',
            borderRadius: 14,
            boxShadow: '0 2px 8px rgba(0,0,0,0.16)',
            pointerEvents: 'none',
            animation: 'lasca-toast-fade 1.8s ease-out',
          }}
        >
          {jumpToast}
        </div>
      )}
      {/* Header row: mode label, word count, view toggle */}
      <div style={{
        padding: '6px 14px',
        borderBottom: '1px solid #e8e6dc',
        fontSize: 11,
        color: '#8a8880',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span>{mode === 'source' ? 'Source · Markdown' : 'Preview · Rendered'}</span>
        <span>·</span>
        <span>{wordCount} words</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setMode(m => m === 'source' ? 'preview' : 'source')}
          title="Toggle rendered preview"
          style={{
            padding: '3px 10px', fontSize: 11, fontWeight: 500,
            background: '#fff', color: '#141413',
            border: '1px solid #e8e6dc', borderRadius: 4,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {mode === 'source' ? 'Preview' : 'Edit'}
        </button>
      </div>

      {/* Formatting toolbar — only in source mode */}
      {mode === 'source' && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          padding: '6px 10px',
          borderBottom: '1px solid #e8e6dc',
          background: '#f5f4ef',
          flexShrink: 0,
        }}>
          {ACTIONS.map(a => (
            <button
              key={a.label}
              onClick={() => applyAction(a)}
              title={a.title}
              style={{
                minWidth: 28, height: 24, padding: '0 8px',
                background: '#fff', color: '#141413',
                border: '1px solid #e8e6dc', borderRadius: 4,
                fontSize: 12, fontWeight: 500,
                fontFamily: "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
                cursor: 'pointer', lineHeight: 1,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#faf9f5'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
            >
              {a.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <span
            title="Double-click anywhere in the markdown to jump the preview to that section"
            style={{
              fontSize: 10, color: '#b0aea5',
              fontFamily: 'inherit', alignSelf: 'center',
              letterSpacing: 0.02,
            }}
          >
            ⌥ Double-click text to locate in preview
          </span>
        </div>
      )}

      {/* Body: textarea OR rendered preview */}
      {mode === 'source' ? (
        <textarea
          ref={textareaRef}
          className="lasca-report-md-textarea"
          value={mdDraft}
          onChange={(e) => setMdDraft(e.target.value)}
          onDoubleClick={handleTextareaDblClick}
          spellCheck={false}
          placeholder="Paste or type your markdown here."
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            resize: 'none',
            padding: '12px 14px',
            fontFamily: "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
            fontSize: 12,
            lineHeight: 1.65,
            background: '#faf9f5',
            color: '#333',
          }}
        />
      ) : (
        <div
          ref={previewRef}
          className="md-preview"
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '20px 24px',
            background: '#fff',
          }}
        />
      )}
    </div>
  );
}
