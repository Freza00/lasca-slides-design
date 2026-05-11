'use client';

import { useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { LascaBrand } from '@/components/ui/LascaBrand';
import { renderSlide } from '@/lib/renderSlide';
import { getLogicalDims, fitToBox } from '@/lib/pageSize';
import type { Deck } from '@/lib/types';

const THUMB_W = 280;
const THUMB_H = 180;

// Parse the creation timestamp from a deck id. IDs are generated as
// deck-<ms> in CreateFlow and GenerationPreview, so the numeric suffix is
// the creation instant in milliseconds. Returns null for ids from other
// sources (imports, legacy fixture decks) that do not follow this pattern.
function deckCreatedAt(id: string): number | null {
  const match = /^deck-(\d{10,})$/.exec(id);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? ts : null;
}

// Format a deck creation timestamp for display. Shows MM/DD HH:mm for
// anything this year and adds a year prefix for older. Kept terse so the
// card info row does not wrap.
function formatDeckTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmm = pad(d.getHours()) + ':' + pad(d.getMinutes());
  if (d.getFullYear() !== now.getFullYear()) {
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
  }
  const sameDay = d.getDate() === now.getDate()
    && d.getMonth() === now.getMonth();
  if (sameDay) return hhmm;
  return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + hhmm;
}

function DeckCard({ deck, onOpen, onDelete, t }: {
  deck: Deck;
  onOpen: () => void;
  onDelete: () => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}) {
  const logical = getLogicalDims(deck);
  const thumb = fitToBox(logical.w, logical.h, THUMB_W, THUMB_H);
  const firstSlide = deck.slides[0];

  const html = useMemo(
    () => firstSlide ? renderSlide(firstSlide, deck.theme, logical) : '',
    [firstSlide, deck.theme, logical],
  );

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        border: '1px solid #e8e6dc',
        transition: 'box-shadow 0.2s, transform 0.2s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'none';
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: '100%',
        height: thumb.h + 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f4f0',
        overflow: 'hidden',
        padding: 8,
      }}>
        <div data-no-fx="1" style={{ width: thumb.w, height: thumb.h, overflow: 'hidden', position: 'relative' }}>
          <div
            style={{
              width: logical.w,
              height: logical.h,
              transform: `scale(${thumb.scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 14, fontWeight: 600, color: '#141413',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {deck.name}
          </div>
          <div style={{ fontSize: 11, color: '#b0aea5', marginTop: 2, display: 'flex', gap: 8 }}>
            <span>{t('works.pages', { n: deck.slides.length })}</span>
            {(() => {
              const ts = deckCreatedAt(deck.id);
              return ts === null ? null : (
                <span style={{ color: '#b0aea5' }}>· {formatDeckTime(ts)}</span>
              );
            })()}
          </div>
        </div>

        {/* Delete */}
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title={t('works.delete')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#b0aea5', fontSize: 16, padding: '4px 6px',
            borderRadius: 4, lineHeight: 1,
            transition: 'color 0.15s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#d97757')}
          onMouseLeave={e => (e.currentTarget.style.color = '#b0aea5')}
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function WorksGallery() {
  const router = useRouter();
  const t = useT();
  const decks = useEditorStore(s => s.decks);
  const setActiveDeck = useEditorStore(s => s.setActiveDeck);
  const removeDeck = useEditorStore(s => s.removeDeck);

  // Newest first. Decks without a parseable timestamp (imports, fixtures)
  // sort to the end, preserving their relative order.
  const sortedDecks = useMemo(() => {
    return [...decks].sort((a, b) => {
      const ta = deckCreatedAt(a.id);
      const tb = deckCreatedAt(b.id);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    });
  }, [decks]);

  const handleOpen = useCallback((deckId: string) => {
    setActiveDeck(deckId);
    router.push('/editor');
  }, [setActiveDeck, router]);

  const handleDelete = useCallback((deckId: string, deckName: string) => {
    if (!confirm(t('works.confirm_delete', { name: deckName }))) return;
    removeDeck(deckId);
  }, [removeDeck]);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#faf9f5',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        borderBottom: '1px solid #e8e6dc',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', color: '#b0aea5', textDecoration: 'none' }} title={t('tab.home')}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" />
              <path d="M6 14V9h4v5" />
            </svg>
          </a>
          <LascaBrand variant="full" size={20} />
          <span style={{ fontSize: 16, color: '#6b6a65', fontWeight: 500 }}>{t('works.title')}</span>
        </div>
        <div style={{ fontSize: 13, color: '#b0aea5' }}>
          {t('works.deck_count', { n: decks.length })}
        </div>
      </div>

      {/* Grid */}
      <div style={{
        padding: '24px 32px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 20,
      }}>
        {sortedDecks.map(deck => (
          <DeckCard
            key={deck.id}
            deck={deck}
            onOpen={() => handleOpen(deck.id)}
            onDelete={() => handleDelete(deck.id, deck.name)}
            t={t}
          />
        ))}

        {decks.length === 0 && (
          <div style={{
            gridColumn: '1 / -1',
            textAlign: 'center',
            padding: '80px 0',
            color: '#b0aea5',
            fontSize: 15,
          }}>
            {t('works.empty')}
            <a href="/" style={{ color: '#d97757', textDecoration: 'none' }}>{t('works.create_first')}</a>
          </div>
        )}
      </div>
    </div>
  );
}
