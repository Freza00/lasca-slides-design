'use client';

import { useState, useRef, useCallback } from 'react';
import type { MdContext, MdContextPage } from '@/lib/ai/harness/types';
import { logger } from '@/lib/logger';
import { useLocale, useT } from '@/lib/i18n';

interface CardChatProps {
  mdContext: MdContext;
  page: MdContextPage;
  pageIndex: number;
  onUpdate: (updated: MdContextPage) => void;
  onClose: () => void;
}

export function CardChat({ mdContext, page, pageIndex, onUpdate, onClose }: CardChatProps) {
  const t = useT();
  const locale = useLocale();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastSummary, setLastSummary] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setLoading(true);
    setLastSummary('');

    try {
      const res = await fetch('/api/ai/outline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mdContext,
          message: text,
          scope: 'page',
          pageIndex,
          locale,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.page) {
        onUpdate(data.page);
        setLastSummary(data.summary || t('cardChat.updated'));
      } else if (data.error) {
        setLastSummary(t('cardChat.error', { msg: data.error }));
      }
    } catch (err) {
      logger.error('ai', 'card-chat failed', { error: (err as Error).message });
      setLastSummary(t('cardChat.request_failed', { msg: (err as Error).message }));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, locale, mdContext, pageIndex, onUpdate, t]);

  return (
    <div style={{
      margin: '8px 0 12px',
      padding: '10px 14px',
      borderRadius: 12,
      background: '#f5f4f0',
      border: '1px solid #e8e6dc',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder={t('cardChat.placeholder', { title: page.title })}
          disabled={loading}
          autoFocus
          style={{
            flex: 1, padding: '6px 10px', borderRadius: 8,
            border: '1px solid #e8e6dc', background: '#fff',
            fontSize: 12, color: '#141413', fontFamily: 'inherit',
            outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: '6px 12px', borderRadius: 8, border: 'none',
            background: input.trim() && !loading ? '#1a1a2e' : '#e8e6dc',
            color: input.trim() && !loading ? '#fff' : '#b0aea5',
            fontSize: 11, fontWeight: 600, cursor: input.trim() && !loading ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {loading ? '...' : t('cardChat.send')}
        </button>
        <button
          onClick={onClose}
          style={{
            padding: '4px 8px', borderRadius: 6, border: 'none',
            background: 'transparent', color: '#b0aea5',
            fontSize: 14, cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      {lastSummary && (
        <div style={{
          marginTop: 6, fontSize: 11, color: '#788c5d', lineHeight: 1.4,
        }}>
          {lastSummary}
        </div>
      )}
    </div>
  );
}
