// ============================================================================
// Lasca — Export deck slides (and report sourceMd) as a JSON file
// ----------------------------------------------------------------------------
// Two shapes round-trip through importFile.parseJsonToSlides:
//   1. Bare `Slide[]` — legacy slide-deck dumps. Kept for back-compat with
//      older Lasca exports users may already have on disk.
//   2. `{ name, slides, sourceMd?, ... }` envelope — required for
//      sourceMd-only report decks (the fast-path shape from CreateFlow).
//      A bare-array dump would lose the sourceMd entirely and produce an
//      empty file — that's the failure mode this guards against.
// ============================================================================

import type { Deck } from './types';

export function downloadJson(deck: Deck) {
  const isReportSourceMdDeck = deck.slides.length === 0
    && typeof deck.sourceMd === 'string'
    && deck.sourceMd.trim().length > 0;

  // Slide decks keep the legacy `Slide[]` top-level shape so external tools
  // that assumed an array still work. Report decks (or any deck carrying
  // sourceMd) need the envelope so the source survives the round trip.
  const payload = isReportSourceMdDeck || deck.sourceMd
    ? {
        name: deck.name,
        slides: deck.slides,
        sourceMd: deck.sourceMd,
        theme: deck.theme,
        pageSize: deck.pageSize,
        header: deck.header,
        footer: deck.footer,
        presetId: deck.presetId,
      }
    : deck.slides;

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${deck.name || 'slides'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
