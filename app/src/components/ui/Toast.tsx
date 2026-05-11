'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { getToasts, subscribeToasts, removeToast, type Toast, type ToastType } from '@/lib/toast';
import { useT } from '@/lib/i18n';

const TYPE_STYLES: Record<ToastType, { bg: string; border: string; icon: string }> = {
  error:   { bg: '#fef2f2', border: '#fca5a5', icon: '✗' },
  warn:    { bg: '#fffbeb', border: '#fcd34d', icon: '⚠' },
  info:    { bg: '#eff6ff', border: '#93c5fd', icon: 'ℹ' },
  success: { bg: '#f0fdf4', border: '#86efac', icon: '✓' },
};

function ToastItem({ toast }: { toast: Toast }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const s = TYPE_STYLES[toast.type];

  return (
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 8,
        padding: '10px 14px',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        animation: 'lasca-toast-in 0.25s ease-out',
        maxWidth: 380,
        fontSize: 13,
        fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
      }}
    >
      <span style={{ fontSize: 16, lineHeight: '20px', flexShrink: 0 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ lineHeight: '20px', wordBreak: 'break-word' }}>{toast.message}</div>
        {toast.detail && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
              fontSize: 11, padding: '2px 0', textDecoration: 'underline',
            }}
          >
            {expanded ? t('toast.collapse') : t('toast.expand')}
          </button>
        )}
        {expanded && toast.detail && (
          <pre style={{
            fontSize: 11, color: '#6b7280', marginTop: 4, whiteSpace: 'pre-wrap',
            wordBreak: 'break-all', maxHeight: 120, overflow: 'auto',
            background: 'rgba(0,0,0,0.04)', padding: 6, borderRadius: 4,
          }}>
            {toast.detail}
          </pre>
        )}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af',
          fontSize: 16, lineHeight: '20px', padding: 0, flexShrink: 0,
        }}
        aria-label={t('toast.close')}
      >
        ×
      </button>
    </div>
  );
}

const EMPTY_TOASTS: Toast[] = [];

export function ToastContainer() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, () => EMPTY_TOASTS);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 99999,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
