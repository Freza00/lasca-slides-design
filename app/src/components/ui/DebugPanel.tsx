'use client';

import { useState, useEffect, useRef, useSyncExternalStore, useCallback } from 'react';
import { logger, type LogEntry, type LogCategory, type LogLevel } from '@/lib/logger';
import { useT } from '@/lib/i18n';

// Category labels are constructed inside DebugPanel() using useT() for i18n keys

const LEVEL_BG: Record<LogLevel, string> = {
  debug: 'transparent',
  info: 'transparent',
  warn: 'rgba(250,204,21,0.08)',
  error: 'rgba(239,68,68,0.12)',
};

const LEVEL_COLOR: Record<LogLevel, string> = {
  debug: '#777',
  info: '#d4d4d4',
  warn: '#facc15',
  error: '#ef4444',
};

const CATEGORY_TAG_COLOR: Record<LogCategory, string> = {
  ai: '#4a90d9',
  import: '#5a9e6f',
  store: '#8b5ec0',
  render: '#c08b5e',
  export: '#5eb8c0',
  general: '#888',
};

type FilterKey = LogCategory | 'all' | 'errors';

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = entry.detail !== undefined;

  return (
    <div
      style={{
        padding: '3px 12px',
        background: LEVEL_BG[entry.level],
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: hasDetail ? 'pointer' : 'default',
        fontSize: 12,
        lineHeight: '20px',
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      }}
      onClick={() => hasDetail && setExpanded(!expanded)}
    >
      <span style={{ color: '#666', marginRight: 8 }}>{formatTime(entry.timestamp)}</span>
      <span style={{
        color: CATEGORY_TAG_COLOR[entry.category],
        fontWeight: 600,
        marginRight: 8,
      }}>
        [{entry.category}]
      </span>
      <span style={{ color: LEVEL_COLOR[entry.level] }}>{entry.message}</span>
      {hasDetail && <span style={{ color: '#555', marginLeft: 6 }}>{expanded ? '▼' : '▶'}</span>}
      {expanded && hasDetail && (
        <pre style={{
          margin: '4px 0 4px 0',
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 4,
          fontSize: 11,
          color: '#aaa',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: 200,
          overflow: 'auto',
        }}>
          {typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail, null, 2)}
        </pre>
      )}
    </div>
  );
}

const EMPTY_ENTRIES: LogEntry[] = [];

export function DebugPanel() {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  const CATEGORY_LABELS: Record<LogCategory | 'all' | 'errors', string> = {
    all: t('debug.all'),
    ai: 'AI',
    import: 'Import',
    store: 'Store',
    render: 'Render',
    export: 'Export',
    general: 'General',
    errors: t('debug.errors_only'),
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const entries = useSyncExternalStore(logger.subscribe, logger.getEntries, () => EMPTY_ENTRIES);

  // Ctrl+D toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && !e.shiftKey && !e.altKey) {
        // Don't capture if inside a text input
        if ((e.target as HTMLElement).closest('textarea, input, [contenteditable]')) return;
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  const filtered = entries.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'errors') return e.level === 'error' || e.level === 'warn';
    return e.category === filter;
  });

  const handleCopyAll = useCallback(() => {
    const text = filtered.map(e => {
      const time = formatTime(e.timestamp);
      const detail = e.detail !== undefined
        ? ` ${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail)}`
        : '';
      return `${time} [${e.level}] [${e.category}] ${e.message}${detail}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
  }, [filtered]);

  if (!visible) return null;

  const filterKeys: FilterKey[] = ['all', 'ai', 'import', 'store', 'export', 'errors'];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: 300,
      zIndex: 99998,
      background: 'rgba(30,30,30,0.95)',
      backdropFilter: 'blur(8px)',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
      color: '#d4d4d4',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#888', marginRight: 8 }}>
          Lasca Log
        </span>
        {filterKeys.map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              border: 'none',
              fontSize: 11,
              cursor: 'pointer',
              background: filter === key ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: filter === key ? '#fff' : '#888',
              fontFamily: 'inherit',
            }}
          >
            {CATEGORY_LABELS[key]}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: '#555', marginRight: 8 }}>
          {t('debug.count', { n: filtered.length })}
        </span>
        <button
          onClick={handleCopyAll}
          style={{
            padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
            fontSize: 11, cursor: 'pointer', background: 'transparent', color: '#aaa',
            fontFamily: 'inherit',
          }}
          title={t('debug.copy_all')}
        >
          {t('debug.copy')}
        </button>
        <button
          onClick={() => logger.clear()}
          style={{
            padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.15)',
            fontSize: 11, cursor: 'pointer', background: 'transparent', color: '#aaa',
            fontFamily: 'inherit',
          }}
        >
          {t('debug.clear')}
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{
            padding: '2px 8px', borderRadius: 4, border: 'none',
            fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#888',
            fontFamily: 'inherit',
          }}
          title={t('debug.close')}
        >
          ×
        </button>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: '#555', fontSize: 12 }}>
            {t('debug.empty')}
          </div>
        )}
        {filtered.map(e => <LogRow key={e.id} entry={e} />)}
      </div>
    </div>
  );
}
