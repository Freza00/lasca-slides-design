# Architecture Decisions & Feature Status

Companion to [`AGENTS.md`](../AGENTS.md) and [`AESTHETICS.md`](./AESTHETICS.md).
This file records every load-bearing technical decision in the codebase along
with why the obvious alternative didn't work.

Every pattern below was tried the "obvious" way first, broke, and was rewritten. **Don't revert without reading why.**

---

## 5.1 Imperative `innerHTML` — NOT `dangerouslySetInnerHTML`

Both `Canvas.tsx` and `Presenter.tsx` set slide HTML imperatively with a `lastHtmlRef` guard:

```tsx
useLayoutEffect(() => {
  if (lastHtmlRef.current === html) return;
  lastHtmlRef.current = html;
  if (containerRef.current) {
    containerRef.current.innerHTML = html;
    // then run WAAPI animations
  }
}, [current, deck.slides, html, animateSlideEntry]);
```

**Why**: `dangerouslySetInnerHTML={{__html: html}}` creates a new object literal on every render → React sees new prop → re-applies innerHTML → destroys DOM mid-animation. The ref guard ensures we only reset when the HTML string actually changes.

---

## 5.2 `data-field` bidirectional binding

Every editable element in `renderSlide.ts` gets `data-field="title"` or `data-field="cards.0.desc"`. On blur, `Canvas.tsx` reads the attribute and calls `updateSlideField(currentIndex, path, value)`. **JSON is source of truth; DOM is projection.**

---

## 5.3 Transition presets

Every slide has optional `transition?: TransitionType`. `DEFAULT_TRANSITION` in `types.ts` maps all 40+ layouts to appropriate defaults:
- `cover`/`quote`/`fade`-oriented layouts → `fade`
- `big-number`/`pie-chart`/`pyramid`/`device-mockup` → `zoom`
- Card/list layouts (`three-cards`/`grid-cards`/`icon-list`/`team`/`pricing`) → `slide-up`
- Split/column layouts (`two-column`/`split-image`/`timeline`/`versus`) → `slide-left`
- Faithful layouts → `fade` (but `getTransition()` rotates through 4 presets by index for variety)

User can override per-slide in Editor status bar. `Presenter.tsx` reads via `getTransition(slide, slideIndex)`.

---

## 5.4 Dual-layer slide transition

When `current` changes in `Presenter.tsx`:
1. Snapshot previous slide HTML into `prevSlide` state with unique `key`
2. Render both layers simultaneously
3. `.lasca-slide-prev` animates out (opacity 1→0, blur 0→12px, scale 1→1.02, 0.7s)
4. `.lasca-slide-active` animates in (opacity 0→1, 0.35s — short so children stagger dominates)
5. After 850ms, `setPrevSlide(null)` cleans up

**Don't collapse to single-layer fade** — old slide needs exit motion or it "闪现" (flashes).

---

## 5.5 Web Animations API — NOT CSS transition + RAF

Child entry animations use `el.animate([...keyframes], {...options})`. **Why not CSS + double-RAF?** React StrictMode double-invokes `useLayoutEffect`; the `lastHtmlRef` guard kicks in on second run → phase 2 RAF never fires → animations stuck at initial state. WAAPI is self-contained.

---

## 5.6 Zustand store with undo/redo

`store.ts` uses `persist` middleware with `partialize`:
- `history` is `Deck[][]` (deep-cloned snapshots, `MAX_HISTORY=50`)
- Every mutation calls `pushHistory()` at the top
- Ctrl/Cmd+Z and `lasca:undo` custom event trigger `store.undo()`
- Undo toast in `ChatPanel.tsx` wires "撤销 Ns" button

---

## 5.7 Suspense wrapping for `useSearchParams()`

Both `editor/page.tsx` and `present/page.tsx` wrap in `<Suspense>`. Next.js 16 SSG errors on `useSearchParams()` without it. **If you create a new page that reads query params, wrap it.**

---

## 5.8 Faithful slide layouts (`pptx-faithful` + `pdf-faithful`)

When user imports `.pptx`/`.pdf` and picks "保留原样 + AI 优化", Lasca emits slides with `layout: 'pptx-faithful'` or `'pdf-faithful'`, each carrying `rawHtml` + authoritative `width × height` in source coordinates.

- **PPTX**: `@jvmr/pptx-to-html` → inline base64 `<img>` + absolute-position text
- **PDF**: pdfjs text layer → `<span>` + v2.3 operator-list walk → `<img data:...base64>` for bitmaps

Rendering: `renderFaithfulFrame(rawHtml, sourceW, sourceH, bg, theme, targetW, targetH)` in `renderSlide.ts`:
- Outer wrapper: DISPLAY dims (what Canvas/Sidebar/Presenter fit into)
- Inner wrapper: LOGICAL dims (source aspect ratio preserved)
- Scale: `min(targetW/sourceW, targetH/sourceH)` → letterbox if aspect mismatch
- Theme filter: `original` → no filter; `warm`/`cool`/`dark` → CSS filter on inner wrapper

**Image-escape layer** (v1.2): `<img>` tags inside faithful rawHtml get `position: relative; z-index: 10` → escape theme filter → preserve original colors. Text still gets filtered.

---

## 5.9 Image-escape layer for faithful slides (v1.2)

**Problem**: CSS `filter: invert(1) hue-rotate(180deg)` (dark mode) cascades to every descendant including `<img>` and `<svg>` → imported images get color-inverted.

**Solution**: `Canvas.tsx` `useEffect` (when slide or theme changes):
1. Clear previous `[data-lasca-img-escape="1"]` overlay
2. If faithful slide AND theme ≠ 'original', walk filter wrapper for `img, svg, canvas, video, picture, [style*="background-image"]`
3. For each match, `getBoundingClientRect()` → clone node → position absolutely in outer (unfiltered) wrapper
4. Append overlay as sibling OUTSIDE filter stacking context

Clones paint on top with true colors. `getBoundingClientRect()` accounts for all ancestor scales → clones land correctly at any zoom. v2.3 PDF image extraction automatically shows up in overlay — no Canvas changes needed.

**Gotcha**: clones are `pointer-events: none` — click/drag goes to original underneath (non-issue in practice).

Reference: `Canvas.tsx` lines ~340-392.

---

## 5.10 Adaptive Canvas sizing (v2.1)

**Problem**: 16:9 slide at 960×540 looks tiny on 1440p monitor; A4 report at 595×842pt needs different fit.

**Solution**: `pageSize.ts` exports:
- `getLogicalDims(pageSize)` → intrinsic w×h (e.g., `slide-16:9` → 1920×1080, `letter` → 612×792pt)
- `fitToBox(logical, container)` → `{ display: {w, h}, effectiveScale }` (letterbox fit)
- `getPrintDims(pageSize)` → CSS `@page` size for PDF export

Canvas/Sidebar/Presenter call `fitToBox` with their container dims. `renderSlide` receives `display.w × display.h` as target.

DOM: outer box at `display.w × display.h`, inner box at `logical.w × logical.h` with `transform: scale(effectiveScale)`. All handlers attach to inner box; `DOMMatrix.a` walk handles scale compensation.

**Don't manually subtract `effectiveScale` in drag math** — the DOMMatrix ancestor walk already divides by compounded scale.

---

## 5.11 IndexedDB persistence (v2 Phase A)

**Problem**: `localStorage` ~5MB quota. Medium PPTX with base64 images → 1-2MB rawHtml → 2-3 faithful decks brick the editor.

**Fix**: `store.ts` uses `idb-keyval` adapter. IndexedDB handles tens to hundreds of MB. One-time migration at module load: if `localStorage['lasca-editor']` exists, copy to IndexedDB then clear.

**Hydration**: IndexedDB is async → users see `DEFAULT_DECK` for 100-200ms before real decks hydrate. MVP accepts this.

---

## 5.12 PDF product split: slide vs report (v2.2)

**Detection**: `detectPdfKind(w, h)` — aspect ratio `w/h > 1.1` → `'slide'`, else `'report'`.

**Peek**: `peekPdfKind(file)` loads only page 1 → `{ kind, width, height, numPages }` in <100ms → IntentChooser picks right copy BEFORE full parse.

**Derive page size**: `deriveDeckPageSize(kind, w, h)`:
- slide + ≈16:9 → `slide-16:9`
- slide + other → `custom`
- report + letter (612×792 ±5pt) → `letter`
- report + a4 (595×842 ±5pt) → `a4`
- report + other → `custom`

IntentChooser COPY table has 3 keys: `'pptx' | 'pdf-slide' | 'pdf-report'`. "Redesign" for report PDFs says **"重新设计成 slide"** (explicit vertical→horizontal conversion).

**Manual override**: Editor status bar pageSize dropdown → `setDeckPageSize` (goes through `pushHistory` so Cmd+Z works).

---

## 5.13 Chat-with-deck: Messages API + prompt caching, NOT Managed Agents

When Lasca adds long-session "chat with deck" (iterative refinement over many turns), use **Messages API + prompt caching + persisted `chatMessages` in IndexedDB**, NOT Anthropic Managed Agents.

**Why not Managed Agents**:
1. Hard conflict with §5.11 — Managed Agents own state on Anthropic servers; §5.11 is client-first IndexedDB
2. Rate limit: 60 req/min org-wide for session creation → burns quota fast at scale
3. Cold start latency adds overhead on top of existing first-turn pain
4. Overkill — typical ChatPanel is 1-3 turns; Managed Agents designed for "hours-long multi-tool tasks"

**If/when built**: add `cache_control: {type: "ephemeral"}` at end of chat system prompt → first turn writes cache, subsequent turns hit cache, ITPM drops ~75%.

---

## 5.14 User preferences: IndexedDB extension, NOT Managed Agents Memory

When Lasca wants AI to "remember user aesthetic preferences" (e.g., "user picked editorial 8×, dark 5× → default toward editorial"), use **Zustand `userPreferences` field in IndexedDB**, NOT Managed Agents Memory.

**Fatal mismatch**: Memory stores are workspace-scoped, not user-scoped. Lasca is local-first with no accounts → no stable user identity. Architectural prerequisite absent.

**If/when built**: `store.ts` adds `userPreferences: { preferredPreset?, preferredTheme?, acceptedSuggestionKinds, rejectedPatterns }`. Every ChatPanel accept/reject updates counters client-side. `prompts.ts` injects as preamble.

§5.13 + §5.14 judgment: **Lasca's local-first is a hard constraint. Any Anthropic API assuming "server remembers this user" is incompatible.** Don't re-litigate.

---

## 5.15 License key = closed beta invite code (Lemon Squeezy $0 product)

Before paid launch, **don't build parallel invite-code system**. Reuse `license.ts` by creating **$0 product "Lasca Closed Beta"** in Lemon Squeezy dashboard → generate keys in bulk. Beta testers enter code in same UI as future paid users. `license.ts:isPro()` returns true for both — it just asks LS `/v1/licenses/validate` whether key is valid, doesn't care which product.

**Zero code changes** to `license.ts`. Phase 2 transition: create "Lasca Pro" at real price → same `isPro()` works.

**TODO (not yet implemented as of 2026-04-09)**:
1. LS dashboard: create $0 product + generate keys (one-time, no code)
2. UI for license key entry (~30 lines)
3. Paid feature gating (read `isPro()` to show/hide)

---

## 5.16 Phase 2 auth: Auth.js + Google/GitHub (deferred to scale signals)

When Lasca needs real user identity (multi-device sync, AI preference memory, account-based license), use **Auth.js with Google + GitHub**, NOT Clerk / Supabase Auth / Firebase Auth / rolled-own password.

**Phase 1 (now through MVP)**: license-key-only gating via §5.15. No Auth.js, no Postgres, no user table. Decks in IndexedDB per §5.11.

**Phase 2 trigger signals** (ANY justifies rolling Phase 2):
1. Multiple users complain "changed computers, had to re-enter key"
2. User preferences / AI memory becomes concrete roadmap item
3. Need to bind license to stable identity for billing / subscriptions / team seats

**Phase 2 work**: `npm install next-auth` → Google + GitHub providers → provision Postgres → bind license_key to user account. IndexedDB decks stay source of truth; opt-in cloud sync later.

**Implications**:
- §5.13 (Chat-with-deck): 4 reasons against Managed Agents still hold after Phase 2
- §5.14 (User preferences): "no user identity" argument dissolves at Phase 2, but Postgres JSON column still simpler than Managed Agents Memory research preview
- §2 three pillars: "No auth" becomes "Local-first + optional cloud auth" AT Phase 2 — don't preemptively revise

---

## Feature Status (§6)

All V1 features shipped: 8 layouts × 3 themes (warm/cool/dark), editor 3-column, Canvas interactions, WAAPI animations, AI generate/edit, import/export, presentation mode. **Current state: 40+ layouts across v3–v6 (content/chart/diagram/business/report), 12 themes (warm/cool/dark/original/stripe/linear/notion/vercel/apple/spotify/airbnb/ferrari).**

Post-V1 additions:
- **v1**: PPTX faithful import + AI polish
- **v1.1**: Faithful slides editable (drag + contentEditable sync)
- **v1.2**: `original` theme + image-escape layer
- **v2A**: IndexedDB persistence (§5.11)
- **v2B**: PDF faithful import
- **v2C**: Letter/A4 PDF export
- **v2.1**: Adaptive Canvas sizing (§5.10)
- **v2.2**: Canvas zoom slider + PDF slide/report split (§5.12)
- **v2.3**: PDF image extraction (operator list + CTM stack)
- **AI harness v0.3**: 🚧 Part A (server) done, Part B (frontend) TBD

⚠️ Visual recheck: `@sparticuz/chromium` + `puppeteer-core` NOT installed → graceful skip (§7.6)
