'use client';

import { useState, useCallback } from 'react';
import { getRemoteSessionId, logRemoteEvent } from '@/lib/logger';

const OCHRE = '#d97757';
const BG = '#faf9f5';
const TEXT = '#3a3935';
const MUTED = '#b0aea5';

const CATEGORIES = [
  { id: 'bug', emoji: '\ud83d\udc1b', label: 'Bug' },
  { id: 'feature', emoji: '\ud83d\udca1', label: 'Feature idea' },
  { id: 'design', emoji: '\ud83c\udfa8', label: 'Design issue' },
  { id: 'confused', emoji: '\ud83d\ude15', label: "I'm stuck" },
  { id: 'other', emoji: '\ud83d\udcac', label: 'Other' },
];

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setOpen(false);
    setCategory(null);
    setText('');
    setSubmitted(false);
    setError('');
  }, []);

  const submit = useCallback(async () => {
    if (!category || !text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const token = localStorage.getItem('lasca-session');
      const sessionId = getRemoteSessionId();
      const res = await fetch('/api/feedback/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ category, text: text.trim(), sessionId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSubmitted(true);
      setTimeout(reset, 2000);
    } catch (error) {
      logRemoteEvent('feedback_submit_failed', {
        category,
        message: error instanceof Error ? error.message : 'unknown',
      });
      setError('Failed to send. Please try again.');
    } finally {
      setSending(false);
    }
  }, [category, text, sending, reset]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Send feedback"
        style={{
          position: 'fixed', bottom: 24, left: 24, zIndex: 1000,
          width: 44, height: 44, borderRadius: '50%',
          background: OCHRE, color: '#fff', border: 'none',
          fontSize: 20, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        ?
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 1000,
      width: 320, background: BG, borderRadius: 16,
      boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
      padding: 20, fontFamily: 'sans-serif',
    }}>
      {/* Close */}
      <button onClick={reset} style={{
        position: 'absolute', top: 12, right: 14,
        background: 'none', border: 'none', fontSize: 18, color: MUTED, cursor: 'pointer',
      }}>x</button>

      {submitted ? (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>&#128591;</div>
          <p style={{ fontSize: 14, color: TEXT }}>Thanks for your feedback!</p>
        </div>
      ) : !category ? (
        <>
          <p style={{ fontSize: 15, fontWeight: 600, color: TEXT, marginBottom: 14 }}>
            How can we help?
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {CATEGORIES.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 10,
                border: '1px solid #e0ddd5', background: '#fff',
                cursor: 'pointer', fontSize: 14, color: TEXT, textAlign: 'left',
              }}>
                <span style={{ fontSize: 18 }}>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button onClick={() => setCategory(null)} style={{
            background: 'none', border: 'none', fontSize: 12, color: MUTED,
            cursor: 'pointer', marginBottom: 8,
          }}>
            &larr; Back
          </button>
          <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
            {CATEGORIES.find(c => c.id === category)?.emoji} Tell us more
          </p>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Describe what happened or what you'd like..."
            autoFocus
            style={{
              width: '100%', minHeight: 80, padding: 10, fontSize: 13,
              border: '1px solid #e0ddd5', borderRadius: 8, resize: 'vertical',
              outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={submit}
            disabled={!text.trim() || sending}
            style={{
              width: '100%', padding: '10px 0', marginTop: 10,
              fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none',
              background: text.trim() ? OCHRE : '#e0ddd5',
              color: text.trim() ? '#fff' : MUTED,
              cursor: text.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? 'Sending...' : 'Send Feedback'}
          </button>
          {error && (
            <p style={{ fontSize: 12, color: '#c0392b', marginTop: 8 }}>{error}</p>
          )}
        </>
      )}
    </div>
  );
}
