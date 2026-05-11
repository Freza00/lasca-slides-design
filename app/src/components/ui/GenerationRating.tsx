'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getRemoteSessionId, logRemoteEvent } from '@/lib/logger';
import { useT } from '@/lib/i18n';

const OCHRE = '#d97757';
const TEXT = '#3a3935';
const MUTED = '#b0aea5';

const RATINGS = [
  { key: 'love', emoji: '\ud83d\ude0d', labelKey: 'rating.love' },
  { key: 'good', emoji: '\ud83d\udc4d', labelKey: 'rating.good' },
  { key: 'meh',  emoji: '\ud83e\udd14', labelKey: 'rating.meh' },
  { key: 'bad',  emoji: '\ud83d\udc4e', labelKey: 'rating.bad' },
] as const;

interface GenerationRatingProps {
  slideCount: number;
  presetId?: string;
  onDismiss: () => void;
}

export function GenerationRating({ slideCount, presetId, onDismiss }: GenerationRatingProps) {
  const t = useT();
  const [selectedRating, setSelectedRating] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss after 15 seconds
  useEffect(() => {
    if (selectedRating || submitted) return;
    const timer = setTimeout(onDismiss, 15_000);
    return () => clearTimeout(timer);
  }, [selectedRating, submitted, onDismiss]);

  // Entry animation via WAAPI
  useEffect(() => {
    cardRef.current?.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) translateY(20px)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0)' },
      ],
      { duration: 400, easing: 'cubic-bezier(0.22,0.61,0.36,1)', fill: 'forwards' },
    );
  }, []);

  const submitRating = useCallback(async (rating: string, note: string) => {
    if (submitting) return;
    const trimmed = note.trim();
    setSubmitting(true);
    logRemoteEvent('generation-rating', { rating, slideCount, presetId, hasComment: !!trimmed });

    try {
      const token = localStorage.getItem('lasca-session');
      const sessionId = getRemoteSessionId();
      const res = await fetch('/api/feedback/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          category: 'generation_rating',
          sessionId,
          text: trimmed || `Rating: ${rating} · Slides: ${slideCount}${presetId ? ` · Preset: ${presetId}` : ''}`,
          meta: {
            rating,
            slideCount,
            presetId: presetId ?? null,
            source: 'generation_rating',
          },
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      logRemoteEvent('generation-rating-submit-failed', {
        rating,
        message: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
      setTimeout(onDismiss, 1500);
    }
  }, [slideCount, presetId, onDismiss, submitting]);

  const handleRate = useCallback((rating: string) => {
    if (rating === 'love' || rating === 'good') {
      void submitRating(rating, '');
      return;
    }
    setSelectedRating(rating);
  }, [submitRating]);

  const handleCommentSubmit = useCallback(() => {
    if (!selectedRating) return;
    void submitRating(selectedRating, comment);
  }, [selectedRating, comment, submitRating]);

  return (
    <div
      ref={cardRef}
      style={{
        position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
        zIndex: 900, opacity: 0,
        background: '#fff', borderRadius: 14,
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        padding: '14px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {submitted ? (
        <div style={{ fontSize: 14, color: TEXT, textAlign: 'center', padding: '4px 0' }}>
          {t('rating.thanks')}
        </div>
      ) : selectedRating ? (
        <>
          <div style={{ fontSize: 14, color: TEXT, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
            {t('rating.tell_us_more')}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('rating.placeholder')}
            style={{
              width: 320,
              minHeight: 92,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e8e6dc',
              color: TEXT,
              fontSize: 13,
              resize: 'vertical',
              outline: 'none',
              marginBottom: 10,
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button
              onClick={() => setSelectedRating(null)}
              disabled={submitting}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #e8e6dc',
                background: '#fff',
                color: MUTED,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {t('rating.back')}
            </button>
            <button
              onClick={handleCommentSubmit}
              disabled={submitting}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: OCHRE,
                color: '#fff',
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {submitting ? t('rating.sending') : t('rating.send')}
            </button>
            <button
              onClick={() => void submitRating(selectedRating, '')}
              disabled={submitting}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: 'none',
                background: 'transparent',
                color: MUTED,
                cursor: submitting ? 'not-allowed' : 'pointer',
                fontSize: 12,
              }}
            >
              {t('rating.skip_detail')}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 14, color: TEXT, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>
            {t('rating.how_was_it')}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 6 }}>
            {RATINGS.map(r => (
              <button
                key={r.key}
                onClick={() => handleRate(r.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  padding: '8px 12px', borderRadius: 10,
                  border: '1px solid #e8e6dc', background: '#fff',
                  cursor: 'pointer', fontSize: 12, color: TEXT,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${OCHRE}12`;
                  e.currentTarget.style.borderColor = OCHRE;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = '#fff';
                  e.currentTarget.style.borderColor = '#e8e6dc';
                }}
              >
                <span style={{ fontSize: 22 }}>{r.emoji}</span>
                <span>{t(r.labelKey)}</span>
              </button>
            ))}
          </div>
          <button
            onClick={onDismiss}
            style={{
              display: 'block', margin: '0 auto', background: 'none', border: 'none',
              fontSize: 12, color: MUTED, cursor: 'pointer', padding: '4px 8px',
            }}
          >
            {t('rating.skip')}
          </button>
        </>
      )}
    </div>
  );
}
