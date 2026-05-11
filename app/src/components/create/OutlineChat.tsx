'use client';

import { useState, useRef, useCallback } from 'react';
import type { MdContext, MdContextPage } from '@/lib/ai/harness/types';
import { logger } from '@/lib/logger';
import { useLocale, useT } from '@/lib/i18n';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface OutlineChatProps {
  mdContext: MdContext;
  onUpdateDeck: (pages: MdContextPage[], summary: string) => void;
}

export function OutlineChat({ mdContext, onUpdateDeck }: OutlineChatProps) {
  const t = useT();
  const locale = useLocale();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/outline-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mdContext,
          message: text,
          scope: 'deck',
          history: messages.slice(-6), // last 3 turns for context
          locale,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.pages?.length > 0) {
        onUpdateDeck(data.pages, data.summary || t('outline.updated'));
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.summary + (data.changes?.length > 0 ? '\n' + data.changes.map((c: string) => `- ${c}`).join('\n') : ''),
        }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: t('outline.error', { msg: data.error }) }]);
      }
    } catch (err) {
      logger.error('ai', 'outline-chat failed', { error: (err as Error).message });
      setMessages(prev => [...prev, { role: 'assistant', content: t('outline.request_failed', { msg: (err as Error).message }) }]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        inputRef.current?.focus();
      }, 100);
    }
  }, [input, loading, locale, mdContext, messages, onUpdateDeck, t]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', minHeight: 200,
      background: '#faf9f5', borderRadius: 16,
      border: '1px solid #e8e6dc',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid #e8e6dc',
        fontSize: 13, fontWeight: 600, color: '#6b6a65',
      }}>
        {t('outline.title')}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#b0aea5', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
            {t('outline.placeholder')}
            <br />{t('outline.example.1')}
            <br />{t('outline.example.2')}
            <br />{t('outline.example.3')}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '85%',
            padding: '8px 12px',
            borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
            background: msg.role === 'user' ? '#1a1a2e' : '#f0efeb',
            color: msg.role === 'user' ? '#fff' : '#141413',
            fontSize: 13, lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start', padding: '8px 12px',
            borderRadius: '12px 12px 12px 4px',
            background: '#f0efeb', color: '#b0aea5',
            fontSize: 13,
          }}>
            {t('outline.thinking')}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 14px', borderTop: '1px solid #e8e6dc',
        display: 'flex', gap: 8,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={t('outline.input_placeholder')}
          disabled={loading}
          style={{
            flex: 1, padding: '8px 12px', borderRadius: 10,
            border: '1px solid #e8e6dc', background: '#fff',
            fontSize: 13, color: '#141413', fontFamily: 'inherit',
            outline: 'none',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          style={{
            padding: '8px 14px', borderRadius: 10, border: 'none',
            background: input.trim() && !loading ? '#1a1a2e' : '#e8e6dc',
            color: input.trim() && !loading ? '#fff' : '#b0aea5',
            fontSize: 12, fontWeight: 600, cursor: input.trim() && !loading ? 'pointer' : 'default',
            fontFamily: 'inherit',
          }}
        >
          {t('outline.send')}
        </button>
      </div>
    </div>
  );
}
