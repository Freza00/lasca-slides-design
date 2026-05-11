import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Deck, Slide, Theme, ChatMessage, Conversation, DeckPageSize } from './types';
import type { PolishAction } from './ai/pptxPolish';
import type { MdContext, ClarifierAnswers, StylePresetId } from './ai/harness/types';
import { logger } from './logger';
import { addToast } from './toast';
import { t } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';

/** Data passed from /create page to ChatPanel for auto-generation handoff */
export interface PendingCreate {
  mdContext: MdContext;
  rawInput: string;
  answers: ClarifierAnswers;
  format: 'slide' | 'report';
  theme: Theme;
  /** Style preset selected in Step 4 (style picker). If set, overrides theme. */
  presetId?: StylePresetId;
}

// ----------------------------------------------------------------------------
// IndexedDB storage adapter for Zustand persist
// ----------------------------------------------------------------------------
// The default `localStorage` has a ~5MB/origin quota, which is immediately
// hit when importing a pptx-faithful slide: `@jvmr/pptx-to-html` embeds
// images as base64 data-URLs and a medium PPT easily crosses 5MB.
// IndexedDB has no practical quota (tens of MB per origin by default).
//
// We also ship a one-time migration: on the first load after this change,
// any existing `lasca-editor` key in localStorage is moved into IndexedDB.
// ----------------------------------------------------------------------------
const STORAGE_KEY = 'lasca-editor';

// Per-deck timestamp of the last undo snapshot pushed by setDeckSourceMd.
// Module-level so it resets when the tab reloads — we don't persist history
// anyway, so there's no point saving this.
const sourceMdLastPushAt = new Map<string, number>();

const idbStorage: StateStorage = {
  getItem: async (name) => {
    const value = await idbGet(name);
    return value == null ? null : String(value);
  },
  setItem: async (name, value) => {
    try {
      await idbSet(name, value);
    } catch (err) {
      logger.error('store', 'IndexedDB save failed', { error: (err as Error).message });
      // Access locale from the store if available; fallback to the global default during early init
      const locale = (typeof useEditorStore !== 'undefined' && useEditorStore.getState?.().locale) || DEFAULT_LOCALE;
      addToast('error', t(locale, 'store.save_failed'));
    }
  },
  removeItem: async (name) => {
    await idbDel(name);
  },
};

// Run the localStorage → IndexedDB migration exactly once on module load.
// We do it fire-and-forget; if the user's first action happens before this
// resolves, Zustand will read from empty IndexedDB and show the default
// deck — next refresh they get their data.
if (typeof window !== 'undefined') {
  try {
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      idbGet(STORAGE_KEY).then((existing) => {
        if (existing == null) {
          idbSet(STORAGE_KEY, legacy).then(() => {
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
          }).catch((err) => {
            logger.error('store', 'localStorage → IndexedDB migration failed', { error: (err as Error).message });
            // Migration runs at module load before store is initialized — hardcode fallback
            addToast('error', 'Data migration failed. Editing may not save.');
          });
        } else {
          // IndexedDB already has fresher data — just clean up legacy.
          try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        }
      }).catch(() => { /* ignore */ });
    }
  } catch { /* localStorage can throw in private-mode Safari */ }
}

// --- Tutorial deck for first launch ---
import { createTutorialDeck } from './tutorialDeck';

const DEFAULT_DECK: Deck = createTutorialDeck(DEFAULT_LOCALE);

// --- Undo / Redo constants ---
const MAX_HISTORY = 50;

const cloneDeckSnapshot = (deck: Deck): Deck => JSON.parse(JSON.stringify(deck)) as Deck;

function seedDeckHistories(decks: Deck[]) {
  const history: Record<string, Deck[]> = {};
  const historyIndex: Record<string, number> = {};
  for (const deck of decks) {
    history[deck.id] = [cloneDeckSnapshot(deck)];
    historyIndex[deck.id] = 0;
  }
  return { history, historyIndex };
}

function clampDeckIndex(index: number, decks: Deck[], activeDeckId: string) {
  const deck = decks.find(d => d.id === activeDeckId) || decks[0];
  if (!deck) return 0;
  return Math.min(Math.max(index, 0), Math.max(deck.slides.length - 1, 0));
}

// --- Store interface ---

interface EditorState {
  // Decks
  decks: Deck[];
  activeDeckId: string;
  currentIndex: number;

  // Multi-select: 0-indexed slide indices selected via Shift/Cmd+click in Sidebar.
  // Empty = only currentIndex is selected. Session-only, not persisted.
  selectedSlideIndices: number[];

  // Per-deck slide index (saved when switching away, restored when switching back)
  savedCurrentIndex: Record<string, number>;

  // Undo / Redo — per-deck (keyed by deck.id). Each deck has independent history.
  history: Record<string, Deck[]>;
  historyIndex: Record<string, number>;

  // Chat (per-deck, keyed by deck.id)
  chatMessages: Record<string, ChatMessage[]>;
  // Conversation history (per-deck, keyed by deck.id)
  chatConversations: Record<string, Conversation[]>;

  // Slide actions log (per-deck, keyed by deck.id → slide index)
  slideActions: Record<string, Record<string, {id: string; text: string; color: string; ts: number}[]>>;

  // Pending AI polish suggestions (per-deck, keyed by deck.id)
  polishActions: Record<string, (PolishAction & { id: string; status: 'pending' | 'applied' | 'dismissed' })[]>;

  // User preference: UI language (persisted)
  locale: 'zh' | 'en';
  setLocale: (locale: 'zh' | 'en') => void;

  // User preference: enable entry animations in presentation mode (persisted)
  presenterAnimations: boolean;

  // Generation lock — prevents double-click spam. NOT persisted.
  isGenerating: boolean;
  setIsGenerating: (generating: boolean) => void;

  // B1 — element-level chat edit target. When set, the next chat edit sends
  // `fieldPath` to /api/ai/edit and the response patches only that JSON leaf
  // via updateSlideField, instead of rewriting the whole slide. Cleared when
  // the user clicks canvas background, closes the chip, switches slides, or
  // completes an edit. NOT persisted.
  chatTargetField: string | null;
  setChatTargetField: (fieldPath: string | null) => void;

  // Pending create handoff from /create page. NOT persisted.
  pendingCreate: PendingCreate | null;
  setPendingCreateMdContext: (pending: PendingCreate | null) => void;

  // Pending import redesign handoff: import → /create step 4 (style picker). NOT persisted.
  pendingImportRedesign: { mdContext: MdContext; fileName: string } | null;
  setPendingImportRedesign: (v: { mdContext: MdContext; fileName: string } | null) => void;

  // Computed
  activeDeck: () => Deck;
  currentSlide: () => Slide | undefined;

  // Deck actions
  setActiveDeck: (id: string) => void;
  addDeck: (deck: Deck) => void;
  removeDeck: (id: string) => void;
  renameDeck: (id: string, name: string) => void;
  setTheme: (theme: Theme) => void;
  /**
   * Change the active deck's page size (slide-16:9 / letter / a4 / custom).
   * Used by the status-bar dropdown so the user can manually correct the
   * auto-detected kind on a PDF import. Triggers a history push because
   * the visual result changes for every faithful slide in the deck.
   */
  setDeckPageSize: (pageSize: DeckPageSize, pageWidth?: number, pageHeight?: number) => void;
  setDeckTexture: (enabled: boolean) => void;
  setDeckTextureVariant: (theme: Theme, variantId: string) => void;
  setDeckAmbient: (enabled: boolean) => void;
  setDeckAmbientVariant: (theme: Theme, variantId: string) => void;
  setContentLocked: (locked: boolean) => void;
  setDeckPresetId: (presetId: string | undefined) => void;
  /**
   * Replace the active deck's `sourceMd` (report-type decks). Pushes a new
   * undo snapshot only if >1.5s have elapsed since the last push for this
   * deck — fast typing merges into the previous snapshot so Cmd+Z undoes
   * paragraphs, not characters.
   */
  setDeckSourceMd: (md: string) => void;
  /** Running header / footer for report decks. No undo push — these are
   *  visual preferences edited via small inputs. */
  setDeckHeader: (header: string) => void;
  setDeckFooter: (footer: string) => void;
  /**
   * Toggle or set entry animations for presentation mode. Persisted across
   * sessions. Editor-side animations are not affected.
   */
  setPresenterAnimations: (enabled: boolean) => void;
  /**
   * @deprecated v2.4.2+ ignores `deck.pdfRenderMode` — PDF slides now use
   * a single unified render (raster background + editable text overlay).
   * The action is kept only for backward compatibility with serialized
   * state; it still writes to `deck.pdfRenderMode` but no renderer reads it.
   */
  setDeckPdfRenderMode: (mode: 'raster' | 'vector') => void;

  // Slide actions
  setCurrentIndex: (index: number) => void;
  setSelectedSlideIndices: (indices: number[]) => void;
  updateSlide: (index: number, slide: Slide) => void;
  updateSlideField: (index: number, fieldPath: string, value: string) => void;
  /** Batched variant — apply many field patches with a SINGLE pushHistory.
   *  Used by Canvas syncSlideHtml so one drag/delete doesn't produce N history entries. */
  updateSlideFields: (index: number, patches: Record<string, string>) => void;
  addSlide: (index: number, slide: Slide) => void;
  removeSlide: (index: number) => void;
  duplicateSlide: (index: number) => void;
  moveSlide: (fromIndex: number, toIndex: number) => void;
  replaceAllSlides: (slides: Slide[]) => void;
  /**
   * Apply a string-level find/replace patch to a pptx-faithful slide's
   * rawHtml. Used by AI polish actions. Pushes history.
   */
  applyRawHtmlPatch: (index: number, find: string, replace: string) => boolean;
  /**
   * Replace the rawHtml of a faithful slide (pptx-faithful or pdf-faithful)
   * outright. Called after drag / contentEditable / direct DOM edits so the
   * Zustand state stays the source of truth. Pushes history on actual change.
   */
  updateFaithfulRawHtml: (index: number, rawHtml: string) => void;

  /**
   * AI theme adaptation: rewrite a faithful slide's rawHtml so hardcoded
   * colors become CSS custom property references (var(--lasca-primary, #fallback)).
   * The result is stored in data.themedHtml; original rawHtml is preserved.
   * Calls /api/ai/recolor endpoint. Returns a promise for loading UI.
   */
  recolorFaithful: (index: number) => Promise<void>;

  // Undo / Redo actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Slide action log
  addSlideAction: (slideIdx: number, text: string, color: string) => void;

  /** N2 — set/clear a slide's review status. Pushes history so it undos cleanly. */
  setSlideReviewStatus: (index: number, status: import('./types').ReviewStatus | undefined) => void;

  // Chat actions
  addChatMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
  archiveChat: () => void;
  loadConversation: (convId: string) => void;
  deleteConversation: (convId: string) => void;

  // Polish actions
  addPolishActions: (actions: PolishAction[]) => void;
  setPolishStatus: (id: string, status: 'pending' | 'applied' | 'dismissed') => void;
  clearPolishActions: () => void;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      decks: [DEFAULT_DECK],
      activeDeckId: DEFAULT_DECK.id,
      currentIndex: 0,
      selectedSlideIndices: [],
      savedCurrentIndex: {},
      ...seedDeckHistories([DEFAULT_DECK]),
      chatMessages: {},
      chatConversations: {},
      slideActions: {},
      polishActions: {},
      locale: DEFAULT_LOCALE,
      setLocale: (locale) => set({ locale }),
      presenterAnimations: true,
      isGenerating: false,
      setIsGenerating: (generating) => set({ isGenerating: generating }),

      chatTargetField: null,
      setChatTargetField: (fieldPath) => set({ chatTargetField: fieldPath }),
      pendingCreate: null,
      setPendingCreateMdContext: (pending) => set({ pendingCreate: pending }),
      pendingImportRedesign: null,
      setPendingImportRedesign: (v) => set({ pendingImportRedesign: v }),

      activeDeck: () => {
        const { decks, activeDeckId } = get();
        return decks.find(d => d.id === activeDeckId) || decks[0];
      },

      currentSlide: () => {
        const deck = get().activeDeck();
        return deck.slides[get().currentIndex];
      },

      setActiveDeck: (id) => set(s => ({
        // Save current deck's slide position before switching
        savedCurrentIndex: { ...s.savedCurrentIndex, [s.activeDeckId]: s.currentIndex },
        activeDeckId: id,
        // Restore target deck's saved position (default 0)
        currentIndex: s.savedCurrentIndex[id] ?? 0,
      })),

      addDeck: (deck) => set(s => ({
        decks: [...s.decks, deck],
        // Save current deck's position before switching
        savedCurrentIndex: { ...s.savedCurrentIndex, [s.activeDeckId]: s.currentIndex },
        activeDeckId: deck.id,
        currentIndex: 0,
        // Initialize history for the new deck
        history: { ...s.history, [deck.id]: [cloneDeckSnapshot(deck)] },
        historyIndex: { ...s.historyIndex, [deck.id]: 0 },
      })),

      removeDeck: (id) => set(s => {
        const decks = s.decks.filter(d => d.id !== id);
        if (decks.length === 0) return s; // don't remove last deck
        // Clean up ALL per-deck state
        const { [id]: _cm, ...chatMessages } = s.chatMessages;
        const { [id]: _sa, ...slideActions } = s.slideActions;
        const { [id]: _pa, ...polishActions } = s.polishActions;
        const { [id]: _h, ...history } = s.history;
        const { [id]: _hi, ...historyIndex } = s.historyIndex;
        const { [id]: _ci, ...savedCurrentIndex } = s.savedCurrentIndex;
        const targetDeckId = decks[0].id;
        return {
          decks,
          activeDeckId: targetDeckId,
          currentIndex: s.savedCurrentIndex[targetDeckId] ?? 0,
          chatMessages,
          slideActions,
          polishActions,
          history,
          historyIndex,
          savedCurrentIndex,
        };
      }),

      renameDeck: (id, name) => set(s => ({
        decks: s.decks.map(d => d.id === id ? { ...d, name } : d),
      })),

      setTheme: (theme) => set(s => ({
        decks: s.decks.map(d => d.id === s.activeDeckId ? { ...d, theme } : d),
      })),

      setDeckPageSize: (pageSize, pageWidth, pageHeight) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, pageSize, pageWidth, pageHeight }
            : d),
        }));
      },

      setPresenterAnimations: (enabled) => set({ presenterAnimations: enabled }),

      setDeckPdfRenderMode: (mode) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, pdfRenderMode: mode }
            : d),
        }));
      },

      setDeckTexture: (enabled) => {
        // 不走 pushHistory — 视觉偏好 toggle 不占 undo 栈
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, texture: enabled }
            : d),
        }));
      },

      setDeckTextureVariant: (theme, variantId) => {
        // 每个主题独立记录 variant id, merge into existing map
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, textureVariant: { ...(d.textureVariant ?? {}), [theme]: variantId } }
            : d),
        }));
      },

      setDeckAmbient: (enabled) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, ambient: enabled }
            : d),
        }));
      },

      setDeckAmbientVariant: (theme, variantId) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, ambientVariant: { ...(d.ambientVariant ?? {}), [theme]: variantId } }
            : d),
        }));
      },

      setContentLocked: (locked) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, contentLocked: locked }
            : d),
        }));
      },

      setDeckPresetId: (presetId) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, presetId }
            : d),
        }));
      },

      setDeckHeader: (header) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId ? { ...d, header } : d),
        }));
      },

      setDeckFooter: (footer) => {
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId ? { ...d, footer } : d),
        }));
      },

      setDeckSourceMd: (md) => {
        // Debounced history: only push a new snapshot if >1.5s since the
        // last one for this deck. Fast typing merges into the previous
        // snapshot so Cmd+Z undoes meaningful chunks, not keystrokes.
        const deckId = get().activeDeckId;
        const now = Date.now();
        const last = sourceMdLastPushAt.get(deckId) ?? 0;
        if (now - last > 1500) {
          get().pushHistory();
          sourceMdLastPushAt.set(deckId, now);
        }
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId
            ? { ...d, sourceMd: md }
            : d),
        }));
      },

      setCurrentIndex: (index) => set({ currentIndex: index, selectedSlideIndices: [], chatTargetField: null }),

      setSelectedSlideIndices: (indices) => set({ selectedSlideIndices: indices }),

      updateSlide: (index, slide) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            slides[index] = slide;
            return { ...d, slides };
          }),
        }));
      },

      updateSlideField: (index, fieldPath, value) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            const slide = { ...slides[index], data: { ...slides[index].data } };
            // Deep set the field
            const parts = fieldPath.split('.');
            let current: Record<string, unknown> = slide.data as Record<string, unknown>;
            for (let i = 0; i < parts.length - 1; i++) {
              const key = parts[i];
              const next = current[key];
              if (Array.isArray(next)) {
                current[key] = [...next];
                current = current[key] as Record<string, unknown>;
              } else if (typeof next === 'object' && next) {
                current[key] = { ...(next as Record<string, unknown>) };
                current = current[key] as Record<string, unknown>;
              }
            }
            current[parts[parts.length - 1]] = value;
            slides[index] = slide;
            return { ...d, slides };
          }),
        }));
      },

      updateSlideFields: (index, patches) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            const target = slides[index];
            if (!target) return d;
            const slide = { ...target, data: JSON.parse(JSON.stringify(target.data)) };
            for (const [fieldPath, value] of Object.entries(patches)) {
              const parts = fieldPath.split('.');
              let current: Record<string, unknown> = slide.data as Record<string, unknown>;
              let ok = true;
              for (let i = 0; i < parts.length - 1; i++) {
                const key = parts[i];
                const next = current[key];
                if (typeof next !== 'object' || next === null) { ok = false; break; }
                current = next as Record<string, unknown>;
              }
              if (ok) current[parts[parts.length - 1]] = value;
            }
            slides[index] = slide;
            return { ...d, slides };
          }),
        }));
      },

      addSlide: (index, slide) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            slides.splice(index + 1, 0, slide);
            return { ...d, slides };
          }),
          currentIndex: index + 1,
        }));
      },

      removeSlide: (index) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            if (d.slides.length <= 1) return d; // keep at least 1
            const slides = d.slides.filter((_, i) => i !== index);
            return { ...d, slides };
          }),
          currentIndex: Math.min(s.currentIndex, s.decks.find(d => d.id === s.activeDeckId)!.slides.length - 2),
        }));
      },

      duplicateSlide: (index) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            const clone = JSON.parse(JSON.stringify(slides[index])) as Slide;
            slides.splice(index + 1, 0, clone);
            return { ...d, slides };
          }),
          currentIndex: index + 1,
        }));
      },

      moveSlide: (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        get().pushHistory();
        set(s => {
          const deck = s.decks.find(d => d.id === s.activeDeckId);
          if (!deck) return s;
          const slides = [...deck.slides];
          const [moved] = slides.splice(fromIndex, 1);
          slides.splice(toIndex, 0, moved);
          return {
            decks: s.decks.map(d => d.id === s.activeDeckId ? { ...d, slides } : d),
            currentIndex: toIndex,
          };
        });
      },

      replaceAllSlides: (slides) => {
        logger.info('store', `replaceAllSlides`, { slideCount: slides.length });
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => d.id === s.activeDeckId ? { ...d, slides } : d),
          currentIndex: 0,
        }));
      },

      updateFaithfulRawHtml: (index, rawHtml) => {
        const state = get();
        const deck = state.decks.find(d => d.id === state.activeDeckId);
        if (!deck) return;
        const slide = deck.slides[index];
        if (!slide || (slide.layout !== 'pptx-faithful' && slide.layout !== 'pdf-faithful')) return;
        // Both PptxFaithfulData and PdfFaithfulData have rawHtml as a field.
        const currentRawHtml = (slide.data as { rawHtml?: string }).rawHtml;
        if (currentRawHtml === rawHtml) return;
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            const target = slides[index];
            if (!target || (target.layout !== 'pptx-faithful' && target.layout !== 'pdf-faithful')) return d;
            // Preserve whichever concrete data shape we have — spread existing
            // fields and only override rawHtml. Cast via unknown to bypass
            // the union narrowing (we've already verified layout above).
            slides[index] = {
              ...target,
              data: { ...(target.data as object), rawHtml } as unknown as typeof target.data,
            };
            return { ...d, slides };
          }),
        }));
      },

      applyRawHtmlPatch: (index, find, replace) => {
        const state = get();
        const deck = state.decks.find(d => d.id === state.activeDeckId);
        if (!deck) return false;
        const slide = deck.slides[index];
        if (!slide || slide.layout !== 'pptx-faithful') return false;
        const data = slide.data as import('./types').PptxFaithfulData;
        if (!data.rawHtml || !data.rawHtml.includes(find)) return false;
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            const target = slides[index];
            if (!target || target.layout !== 'pptx-faithful') return d;
            const targetData = target.data as import('./types').PptxFaithfulData;
            const nextData: import('./types').PptxFaithfulData = {
              ...targetData,
              rawHtml: targetData.rawHtml.split(find).join(replace),
            };
            slides[index] = { ...target, data: nextData };
            return { ...d, slides };
          }),
        }));
        return true;
      },

      recolorFaithful: async (index) => {
        const state = get();
        const deck = state.decks.find(d => d.id === state.activeDeckId);
        if (!deck) return;
        const slide = deck.slides[index];
        if (!slide) return;
        if (slide.layout !== 'pptx-faithful' && slide.layout !== 'pdf-faithful') return;

        const data = slide.data as { rawHtml: string; themedHtml?: string };

        // Call AI recolor endpoint
        const res = await fetch('/api/ai/recolor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawHtml: data.rawHtml, locale: state.locale }),
        });
        if (!res.ok) throw new Error(`AI recolor failed: ${res.status}`);

        // Parse SSE stream for the 'done' event
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let themedHtml: string | null = null;
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') continue;
            try {
              const event = JSON.parse(payload);
              if (event.type === 'done' && event.data?.themedHtml) {
                themedHtml = event.data.themedHtml;
              }
            } catch { /* ignore parse errors in stream */ }
          }
        }

        // Store themedHtml alongside original rawHtml
        if (themedHtml) {
          get().pushHistory();
          set(s => ({
            decks: s.decks.map(d => d.id === s.activeDeckId
              ? {
                  ...d,
                  slides: d.slides.map((sl, i) => {
                    if (i !== index) return sl;
                    return { ...sl, data: { ...sl.data, themedHtml } };
                  }),
                }
              : d
            ),
          }));
        }
      },

      // --- Undo / Redo (per-deck) ---
      pushHistory: () => set(s => {
        const deckId = s.activeDeckId;
        const deck = s.decks.find(d => d.id === deckId);
        if (!deck) return s;
        const snapshot = cloneDeckSnapshot(deck);
        const deckHistory = s.history[deckId] || [];
        const deckIdx = s.historyIndex[deckId] ?? Math.max(deckHistory.length - 1, 0);
        // Rehydrated decks do not persist history, so seed from the current
        // snapshot before pushing the pre-mutation state.
        const newDeckHistory = deckHistory.length > 0
          ? deckHistory.slice(0, deckIdx + 1)
          : [snapshot];
        newDeckHistory.push(snapshot);
        // Enforce max history
        if (newDeckHistory.length > MAX_HISTORY) newDeckHistory.shift();
        return {
          history: { ...s.history, [deckId]: newDeckHistory },
          historyIndex: { ...s.historyIndex, [deckId]: newDeckHistory.length - 1 },
        };
      }),

      undo: () => set(s => {
        const deckId = s.activeDeckId;
        const deckHistory = s.history[deckId] || [];
        const deckIdx = s.historyIndex[deckId] ?? Math.max(deckHistory.length - 1, 0);
        if (deckIdx <= 0) return s;
        const newIdx = deckIdx - 1;
        logger.info('store', `undo → history[${newIdx}]`);
        const snapshot = cloneDeckSnapshot(deckHistory[newIdx]);
        return {
          decks: s.decks.map(d => d.id === deckId ? snapshot : d),
          historyIndex: { ...s.historyIndex, [deckId]: newIdx },
          currentIndex: Math.min(s.currentIndex, snapshot.slides.length - 1),
        };
      }),

      redo: () => set(s => {
        const deckId = s.activeDeckId;
        const deckHistory = s.history[deckId] || [];
        const deckIdx = s.historyIndex[deckId] ?? Math.max(deckHistory.length - 1, 0);
        if (deckIdx >= deckHistory.length - 1) return s;
        const newIdx = deckIdx + 1;
        const snapshot = cloneDeckSnapshot(deckHistory[newIdx]);
        return {
          decks: s.decks.map(d => d.id === deckId ? snapshot : d),
          historyIndex: { ...s.historyIndex, [deckId]: newIdx },
          currentIndex: Math.min(s.currentIndex, snapshot.slides.length - 1),
        };
      }),

      setSlideReviewStatus: (index, status) => {
        get().pushHistory();
        set(s => ({
          decks: s.decks.map(d => {
            if (d.id !== s.activeDeckId) return d;
            const slides = [...d.slides];
            if (!slides[index]) return d;
            const next = { ...slides[index] };
            if (status === undefined) delete next.reviewStatus;
            else next.reviewStatus = status;
            slides[index] = next;
            return { ...d, slides };
          }),
        }));
      },

      addSlideAction: (slideIdx, text, color) => set(s => {
        const deckId = s.activeDeckId;
        const deckActions = s.slideActions[deckId] || {};
        const key = String(slideIdx);
        const prev = deckActions[key] || [];
        return {
          slideActions: {
            ...s.slideActions,
            [deckId]: {
              ...deckActions,
              [key]: [...prev, { id: `sa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, color, ts: Date.now() }],
            },
          },
        };
      }),

      addChatMessage: (msg) => set(s => {
        const deckId = s.activeDeckId;
        const prev = s.chatMessages[deckId] || [];
        return { chatMessages: { ...s.chatMessages, [deckId]: [...prev, msg] } };
      }),

      clearChat: () => set(s => {
        const deckId = s.activeDeckId;
        return { chatMessages: { ...s.chatMessages, [deckId]: [] } };
      }),

      archiveChat: () => set(s => {
        const deckId = s.activeDeckId;
        const msgs = s.chatMessages[deckId] || [];
        if (msgs.length === 0) return s;
        const firstUser = msgs.find(m => m.type === 'user');
        const title = firstUser ? firstUser.text.slice(0, 40) : 'Untitled';
        const conv: Conversation = {
          id: 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          title,
          messages: msgs,
          createdAt: Date.now(),
        };
        const prev = s.chatConversations[deckId] || [];
        return {
          chatMessages: { ...s.chatMessages, [deckId]: [] },
          chatConversations: { ...s.chatConversations, [deckId]: [...prev, conv] },
        };
      }),

      loadConversation: (convId) => set(s => {
        const deckId = s.activeDeckId;
        const convs = s.chatConversations[deckId] || [];
        const conv = convs.find(c => c.id === convId);
        if (!conv) return s;
        return { chatMessages: { ...s.chatMessages, [deckId]: conv.messages } };
      }),

      deleteConversation: (convId) => set(s => {
        const deckId = s.activeDeckId;
        const convs = s.chatConversations[deckId] || [];
        return { chatConversations: { ...s.chatConversations, [deckId]: convs.filter(c => c.id !== convId) } };
      }),

      addPolishActions: (actions) => set(s => {
        const deckId = s.activeDeckId;
        const prev = s.polishActions[deckId] || [];
        return {
          polishActions: {
            ...s.polishActions,
            [deckId]: [
              ...prev,
              ...actions.map((a, i) => ({
                ...a,
                id: `polish-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                status: 'pending' as const,
              })),
            ],
          },
        };
      }),

      setPolishStatus: (id, status) => set(s => {
        const deckId = s.activeDeckId;
        const prev = s.polishActions[deckId] || [];
        return {
          polishActions: {
            ...s.polishActions,
            [deckId]: prev.map(p => p.id === id ? { ...p, status } : p),
          },
        };
      }),

      clearPolishActions: () => set(s => {
        const deckId = s.activeDeckId;
        return { polishActions: { ...s.polishActions, [deckId]: [] } };
      }),
    }),
    {
      name: STORAGE_KEY,
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      migrate: (persistedState, version) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState;
        let state = persistedState as Partial<EditorState>;

        if (version < 1) {
          state = { ...state, locale: DEFAULT_LOCALE };
        }

        // v1 → v2: replace the legacy Chinese tutorial deck with the English version
        // for users whose IndexedDB was seeded back when locale='zh' was the default.
        if (version < 2 && Array.isArray(state.decks)) {
          const ZH_TUTORIAL_DECK_NAME = '欢迎使用 Lasca';
          state = {
            ...state,
            decks: state.decks.map((deck) => {
              if (deck && typeof deck === 'object' && (deck as Deck).name === ZH_TUTORIAL_DECK_NAME) {
                const fresh = createTutorialDeck('en');
                return { ...fresh, id: (deck as Deck).id };
              }
              return deck;
            }),
          };
        }

        return state;
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<EditorState>;
        const decks = Array.isArray(persisted.decks) && persisted.decks.length > 0
          ? persisted.decks
          : currentState.decks;
        const activeDeckId = decks.some(deck => deck.id === persisted.activeDeckId)
          ? persisted.activeDeckId as string
          : decks[0].id;
        const currentIndex = clampDeckIndex(
          typeof persisted.currentIndex === 'number' ? persisted.currentIndex : currentState.currentIndex,
          decks,
          activeDeckId,
        );
        const { history, historyIndex } = seedDeckHistories(decks);
        return {
          ...currentState,
          ...persisted,
          decks,
          activeDeckId,
          currentIndex,
          history,
          historyIndex,
        };
      },
      partialize: (state) => ({
        decks: state.decks,
        activeDeckId: state.activeDeckId,
        currentIndex: state.currentIndex,
        savedCurrentIndex: state.savedCurrentIndex,
        locale: state.locale,
        presenterAnimations: state.presenterAnimations,
        chatMessages: state.chatMessages,
        chatConversations: state.chatConversations,
      }),
    }
  )
);
