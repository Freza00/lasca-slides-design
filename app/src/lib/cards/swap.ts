// ============================================================================
// Lasca — swapComposition (loss-free)
// ============================================================================
// Editor-side helper: remap a card-canvas slide's cards onto a different
// composition. Cards are CSS-grid region occupants; whether a region draws
// visible chrome is a THEME decision (ThemeConfig.cardChrome).
//
// Core guarantee: **swap never drops data**. Cards that do not fit the target
// composition go into `data.sidelined[]`. On the next swap that has room,
// sidelined cards are re-absorbed into `cards[]` transparently. The renderer
// shows a small "N hidden" badge when sidelined is non-empty.
//
// Three branches:
//   A. Expand 1 → N — if the single source card is a decomposable items/
//      events/spokes role (list / steps / funnel / pyramid / cycle / bullseye
//      / timeline / hub-spoke), split into N text cards. Otherwise place the
//      source in the first compatible slot; extra slots stay empty.
//   B. Shrink N → 1 — place first card in slot 'a'; trailing cards go to
//      sidelined (preserved for round-trip).
//   C. N → M general — place first M cards in slots (skipping zone-
//      incompatible); any overflow + zone-incompatible cards go to sidelined.
//
// Zone compatibility: hero-grid's 'hero' slot and title-grid's 'title' slot
// only render text/quote roles. Incompatible cards are sidelined, not dropped.
// ============================================================================

import type { CardCanvasData, Card, CardContent, Composition } from './types';
import { COMPOSITIONS, generateSlots } from './compositions';
import { getCompositionMeta } from './compositionRegistry';

/** Roles with an items/events/spokes array that can split into N text cards. */
function extractItems(content: CardContent): { title?: string; body?: string }[] {
  switch (content.role) {
    case 'list':
      return content.items.map(it => ({ title: it.title, body: it.desc }));
    case 'steps':
      return content.items.map(it => ({ title: it.text, body: it.desc }));
    case 'funnel':
    case 'pyramid':
    case 'cycle':
    case 'bullseye':
      return content.items.map(it => ({ title: it.text }));
    case 'timeline':
      return content.events.map(e => ({ title: e.title, body: e.desc }));
    case 'hub-spoke':
      return content.spokes.map(s => ({ title: s.text, body: s.desc }));
    default:
      return [];
  }
}

/** hero-grid.hero and title-grid.title only render text/quote roles through
 *  renderHeroZone / renderTitleZone. Other slots accept any role. */
function isZoneCompatible(slotName: string, content: CardContent): boolean {
  if (slotName !== 'hero' && slotName !== 'title') return true;
  return content.role === 'text' || content.role === 'quote';
}

/** Desired slot count for the target composition given the source card count.
 *  Fixed compositions return their canonical size; variable (grid / banner)
 *  expand to accommodate more source cards, shrink to match source when
 *  source has fewer. */
function getTargetSlots(target: Composition, sourceCount: number): string[] {
  const meta = getCompositionMeta(target.id);
  const natural = meta?.slotCount ?? 1;

  if (target.mode === 'full-bleed' || target.mode === 'full-center') return ['a'];
  if (target.mode === 'split') return ['a', 'b'];
  if (target.mode === 'bento') return target.slots ?? [];

  if (target.mode === 'hero-grid' || target.mode === 'title-grid') {
    const zone = target.mode === 'hero-grid' ? 'hero' : 'title';
    // Keep at least the natural layout shape; if source has more cards,
    // expand; if source has fewer, shrink to source (no fake placeholder
    // tiles).
    const total = sourceCount >= natural ? sourceCount : Math.max(sourceCount, natural);
    const tileCount = Math.max(total - 1, 0);
    return tileCount === 0 ? [zone] : [zone, ...generateSlots(tileCount, 'a')];
  }

  // grid-2col / grid-3col / grid-4col — fill at least natural when source has
  // enough; otherwise match source count.
  const count = sourceCount >= natural ? sourceCount : Math.max(sourceCount, 1);
  return generateSlots(count, 'a');
}

/** Read the 3 functional zones from any CardContent. */
function readZones(content: CardContent): { title?: string; body?: string; footnote?: string } {
  return {
    title: 'title' in content ? content.title : undefined,
    body: 'body' in content ? content.body : undefined,
    footnote: 'footnote' in content ? content.footnote : undefined,
  };
}

/** Build the output CardCanvasData, dropping `sidelined` when empty. */
function buildResult(
  title: string | undefined,
  compositionId: string,
  cards: Card[],
  sidelined: Card[],
): CardCanvasData {
  const out: CardCanvasData = { title, compositionId, cards };
  if (sidelined.length > 0) out.sidelined = sidelined;
  return out;
}

// --- Branch A: expand 1 → N with optional item decomposition ---------------
function buildExpandFromOne(
  source: Card,
  targetSlots: string[],
  slideTitle: string | undefined,
  toCompositionId: string,
  carriedSidelined: Card[],
): CardCanvasData {
  const items = extractItems(source.content);
  const { title: cardTitle, footnote: cardFootnote } = readZones(source.content);

  // Decomposable role: one text card per item. Remaining slots stay empty.
  if (items.length > 0) {
    const cards: Card[] = [];
    const zoneSlot = targetSlots[0] === 'hero' || targetSlots[0] === 'title'
      ? targetSlots[0]
      : undefined;
    const tileSlots = zoneSlot ? targetSlots.slice(1) : targetSlots;

    if (zoneSlot && (cardTitle || cardFootnote)) {
      cards.push({
        slot: zoneSlot,
        content: { role: 'text', title: cardTitle ?? '', footnote: cardFootnote },
      });
    }

    const useItems = items.slice(0, tileSlots.length);
    useItems.forEach((it, i) => {
      cards.push({
        slot: tileSlots[i],
        content: { role: 'text', title: it.title ?? '', body: it.body },
      });
    });

    return buildResult(
      slideTitle ?? (zoneSlot ? undefined : cardTitle),
      toCompositionId,
      cards,
      carriedSidelined,
    );
  }

  // Non-decomposable: place source in the first compatible slot; rest empty.
  const cards: Card[] = [];
  const firstSlot = targetSlots[0];
  if (isZoneCompatible(firstSlot, source.content)) {
    cards.push({ slot: firstSlot, content: source.content });
  } else {
    const tileSlots = targetSlots.slice(1);
    if (tileSlots.length > 0) {
      cards.push({ slot: tileSlots[0], content: source.content });
    }
  }

  return buildResult(slideTitle, toCompositionId, cards, carriedSidelined);
}

// --- Main entry ------------------------------------------------------------
export function swapComposition(data: CardCanvasData, toCompositionId: string): CardCanvasData {
  const target = COMPOSITIONS[toCompositionId];
  if (!target) return data;

  // Step 1: absorb existing sidelined cards back into the working pool. They
  // become re-eligible for placement if the new target has room.
  const pool: Card[] = [...(data.cards ?? []), ...(data.sidelined ?? [])];
  const slideTitle = data.title;
  const targetSlots = getTargetSlots(target, pool.length);

  // Branch A: pool has exactly 1 card and target has >1 slot (expand).
  if (pool.length === 1 && targetSlots.length > 1) {
    return buildExpandFromOne(pool[0], targetSlots, slideTitle, toCompositionId, []);
  }

  // Branch B + C: walk target slots, place pool cards in order, skipping zone-
  // incompatible ones (those get sidelined). Overflow also goes to sidelined.
  const newCards: Card[] = [];
  const sidelined: Card[] = [];
  let cursor = 0;
  for (const slot of targetSlots) {
    // Skip ahead past any zone-incompatible pool cards for this slot, pushing
    // them to sidelined so we don't drop content.
    while (cursor < pool.length && !isZoneCompatible(slot, pool[cursor].content)) {
      sidelined.push(pool[cursor]);
      cursor++;
    }
    if (cursor >= pool.length) break;
    newCards.push({ slot, content: pool[cursor].content });
    cursor++;
  }
  // Any remaining pool cards that never got a slot: sideline them.
  for (; cursor < pool.length; cursor++) {
    sidelined.push(pool[cursor]);
  }

  return buildResult(slideTitle, toCompositionId, newCards, sidelined);
}
