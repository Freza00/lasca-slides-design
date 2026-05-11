'use client';

// ============================================================================
// ReportChromeBar — the 40px strip above the paged.js preview (report mode)
// ============================================================================
// Hosts the global "deck chrome" inputs: running header + running footer.
// Lives in the StylePanel slot in Editor.tsx when deck.sourceMd is set.
// Writes through to the store immediately; the ReportPreviewPane debounces
// its own re-paginate.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { useEditorStore } from '@/lib/store';

export function ReportChromeBar() {
  const deck = useEditorStore(s => s.activeDeck());
  const setDeckHeader = useEditorStore(s => s.setDeckHeader);
  const setDeckFooter = useEditorStore(s => s.setDeckFooter);

  // Local drafts keep the inputs responsive; writes go through immediately
  // (setters don't push history).
  const [headerDraft, setHeaderDraft] = useState(deck.header ?? '');
  const [footerDraft, setFooterDraft] = useState(deck.footer ?? '');

  const lastDeckIdRef = useRef<string>(deck.id);
  useEffect(() => {
    if (lastDeckIdRef.current !== deck.id) {
      lastDeckIdRef.current = deck.id;
      setHeaderDraft(deck.header ?? '');
      setFooterDraft(deck.footer ?? '');
    }
  }, [deck.id, deck.header, deck.footer]);

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '0 14px',
      fontSize: 11,
      color: '#8a8880',
    }}>
      <span>Header</span>
      <input
        value={headerDraft}
        onChange={(e) => { setHeaderDraft(e.target.value); setDeckHeader(e.target.value); }}
        placeholder="§ MEMO · LASCA RESEARCH"
        style={{
          width: 260, padding: '4px 8px', fontSize: 11,
          border: '1px solid #e8e6dc', borderRadius: 4,
          background: '#fff', color: '#141413', outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <span>Footer</span>
      <input
        value={footerDraft}
        onChange={(e) => { setFooterDraft(e.target.value); setDeckFooter(e.target.value); }}
        placeholder="LASCA Research · 2026-04"
        style={{
          width: 220, padding: '4px 8px', fontSize: 11,
          border: '1px solid #e8e6dc', borderRadius: 4,
          background: '#fff', color: '#141413', outline: 'none',
          fontFamily: 'inherit',
        }}
      />
      <span style={{ color: '#b0aea5' }}>
        Shown on every page (except cover).
      </span>
    </div>
  );
}
