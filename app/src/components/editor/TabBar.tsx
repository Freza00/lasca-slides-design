'use client';

import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import type { Deck } from '@/lib/types';
import { addToast } from '@/lib/toast';
import { useFlagNumber } from '@/lib/featureFlags';
import { logRemoteEvent } from '@/lib/logger';

export function TabBar() {
  const t = useT();
  const decks = useEditorStore(s => s.decks);
  const activeDeckId = useEditorStore(s => s.activeDeckId);
  const setActiveDeck = useEditorStore(s => s.setActiveDeck);
  const addDeck = useEditorStore(s => s.addDeck);
  const removeDeck = useEditorStore(s => s.removeDeck);
  const maxDecks = useFlagNumber('max_decks', 999);
  const canCreateDeck = decks.length < maxDecks;

  const handleNewDeck = () => {
    if (!canCreateDeck) {
      addToast('warn', t('error.deck_limit'));
      return;
    }
    const deck: Deck = {
      id: 'deck-' + Date.now(),
      name: t('tab.new_presentation'),
      theme: 'warm',
      slides: [{ layout: 'cover', data: { title: t('tab.new_title'), subtitle: t('tab.subtitle'), author: '' } }],
    };
    addDeck(deck);
    logRemoteEvent('deck_created', { source: 'tabbar', deckCount: decks.length + 1 });
  };

  return (
    <div style={{
      height: 36, background: '#e8e6dc', display: 'flex', alignItems: 'flex-end',
      paddingLeft: 8, gap: 2, flexShrink: 0,
    }}>
      {decks.map(deck => (
        <div
          key={deck.id}
          onClick={() => setActiveDeck(deck.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px 5px 14px',
            fontSize: 12, fontWeight: deck.id === activeDeckId ? 600 : 400,
            color: deck.id === activeDeckId ? '#141413' : '#b0aea5',
            background: deck.id === activeDeckId ? '#faf9f5' : 'transparent',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            maxWidth: 180,
            whiteSpace: 'nowrap' as const,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{deck.name}</span>
          {decks.length > 1 && (
            <span
              onClick={(e) => { e.stopPropagation(); removeDeck(deck.id); }}
              style={{ fontSize: 14, color: '#b0aea5', cursor: 'pointer', lineHeight: 1, marginLeft: 2 }}
              title={t('tab.close')}
            >
              ×
            </span>
          )}
        </div>
      ))}
      <button
        onClick={handleNewDeck}
        style={{
          background: 'none', border: 'none', fontSize: 16, color: '#b0aea5',
          cursor: 'pointer', padding: '4px 10px', marginBottom: 1,
          opacity: canCreateDeck ? 1 : 0.45,
        }}
        title={canCreateDeck ? t('tab.new') : 'Deck limit reached'}
      >
        +
      </button>

      {/* Spacer pushes nav icons to the right */}
      <div style={{ flex: 1 }} />

      {/* Home */}
      <a
        href="/"
        title={t('tab.home')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, marginBottom: 2, marginRight: 2,
          borderRadius: 6, color: '#b0aea5', cursor: 'pointer',
          transition: 'color 0.15s, background 0.15s',
          background: 'transparent', textDecoration: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.background = '#faf9f5'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#b0aea5'; e.currentTarget.style.background = 'transparent'; }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" />
          <path d="M6 14V9h4v5" />
        </svg>
      </a>

      {/* Profile (includes works + invite codes) */}
      <a
        href="/profile"
        title={t('profile.title')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, marginBottom: 2, marginRight: 8,
          borderRadius: 6, color: '#b0aea5', cursor: 'pointer',
          transition: 'color 0.15s, background 0.15s',
          background: 'transparent', textDecoration: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.background = '#faf9f5'; }}
        onMouseLeave={e => { e.currentTarget.style.color = '#b0aea5'; e.currentTarget.style.background = 'transparent'; }}
      >
        {/* Person icon */}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="8" cy="5" r="3" />
          <path d="M2.5 14c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        </svg>
      </a>
    </div>
  );
}
