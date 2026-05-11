# AGENTS.md — Lasca

This file briefs AI coding agents (Claude Code, Codex, Cursor, Copilot CLI,
etc.) on how the repo is organised so they can act quickly without flailing.
For human contributors, start with [`README.md`](./README.md) and
[`CONTRIBUTING.md`](./CONTRIBUTING.md).

## What this project is

Lasca is an AI-native presentation and report generator. The Next.js app
(`app/`) handles authoring, rendering, and orchestrating LLM calls. The
optional sidecar service in
[`lasca-report-pdf-service`](https://github.com/lasca-ai/lasca-report-pdf-service)
turns long-form Markdown reports into print-ready PDFs via paged.js.

Source of truth: when this file and `app/src/` disagree, **trust the code.**

## Stack at a glance

- **Framework**: Next.js 16 (App Router) + React 19, TypeScript strict
- **State**: Zustand + IndexedDB (`idb-keyval`) — client-first persistence
- **Styling**: inline styles via `renderSlide.ts` (no Tailwind / CSS-in-JS lib)
- **AI**: Vercel AI SDK with pluggable provider (OpenAI, Anthropic)
- **Auth**: invite-only beta — JWT cookie + Supabase as DB. Auth bypassed in dev
- **Rendering**: paged.js for reports, custom WAAPI engine for slides
- **No tests yet** — see ROADMAP.md "Help wanted"

## Directory map

```
/
├── app/                       Next.js application (the main product)
│   ├── src/app/               App-Router routes (pages + API)
│   │   ├── create/            generation wizard (slide + report)
│   │   ├── editor/            main editor (3-column layout)
│   │   ├── present/           fullscreen presentation
│   │   ├── works/             deck gallery
│   │   ├── admin/             admin dashboard (feature flags, users)
│   │   ├── register/          beta registration
│   │   └── api/               SSE + REST endpoints
│   ├── src/components/        React components (editor / chat / present / …)
│   ├── src/lib/               core libraries (see below)
│   └── public/                static assets
├── docs/                      public design / architecture notes
│   ├── ARCH.md                  architectural decisions + rationale
│   ├── AESTHETICS.md            visual / UX preferences
│   └── CHANGELOG.md             version history
├── files/                     product spec + JSON schema reference
├── sketches/                  scratch experiments — not shipped
└── dev.sh                     dev launcher (`cd app && next dev --webpack`)
```

### Critical files in `app/src/lib/`

- **`renderSlide.ts`** — Slide JSON → HTML. Owns layout dispatch (`RENDERERS`),
  cover variants, and chart bridges. Currently a single ~3000-line module —
  see ROADMAP for the planned decomposition.
- **`types.ts`** — `Slide` / `Deck` / `Layout` / `pageSize` types and the
  `LAYOUT_REGISTRY` that drives both validation and the picker.
- **`store.ts`** — Zustand store, IndexedDB persistence, undo history.
- **`themes.ts` / `themeCatalog.ts`** — visual themes (colors, fonts, motifs)
  and the metadata consumed by `StylePicker` + `Toolbar`.
- **`renderCharts.ts`** — chart SVG renderers and shared helpers (`shortUnit`,
  `stripSharedSuffix`, `autoCategoryFontSize`, `fitSvgText`).
- **`cards/`** — CSS-Grid canvas region system. `compositions.ts` carves the
  slide via `grid-template-areas`; `adapt.ts` funnels legacy layouts into
  this engine.
- **`reports/pagedjsFlow.ts`** — paged.js report rendering, called by
  `ReportPreviewPane.tsx`. Editor canvas does NOT paginate.
- **`ai/`**
  - `model.ts` — provider abstraction (OpenAI / Anthropic / others)
  - `prompts.ts` (+ `prompts.zh.ts` / `prompts.en.ts`) — system prompts
  - `harness/orchestrator.ts` — outline → mdContext → parallelGenerate → recheck
  - `harness/stylePresets.ts` — preset registry (`derivePreset` is the live path)
  - `harness/goldenRules.ts` — pure-fn validators run after every generation
  - `harness/clarifier.ts` — template-based questionnaire (NOT an LLM call)

## How to run it

```bash
# Node.js 20+ required (see .nvmrc)
cd app
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY *or* ANTHROPIC_API_KEY
cd ..
./dev.sh   # or: cd app && npm run dev
```

Dev URL: <http://localhost:3000>

`./dev.sh` forces `--webpack` because the Web Animations API used in
`Presenter.tsx` does not yet play well with Turbopack. Production build is
unaffected.

## Conventions agents should follow

### Editing the slide renderer

`renderSlide.ts` is large and pattern-dense. Before adding a layout, read
[CONTRIBUTING.md → "Adding a new Slide Layout"](./CONTRIBUTING.md). The
short version: types union → `RENDERERS` map → `goldenRules` field check.

### React quirks the agent will hit

- `useSearchParams()` must be wrapped in `<Suspense>` (Next 16 requirement)
- `params` in dynamic routes is a Promise — `const { slug } = await params`
- Routes default to Server Components — opt in with `"use client"`
- `Canvas.tsx` uses imperative DOM mutation through `innerHTML` writes (not
  the React-managed prop), guarded by a `lastHtmlRef`. The reason is that
  WAAPI mid-flight gets torn down if React reconciles the slide DOM. Don't
  "simplify" the imperative path back into JSX.
- WAAPI is the animation primitive — don't mix CSS transitions on the same
  element. React StrictMode will double-invoke effects, breaking CSS-based
  approaches.

### Provider abstraction

`getModel()` in `app/src/lib/ai/model.ts` returns a Vercel AI SDK
`LanguageModel`. Adding a third provider means adding one `case` to the
switch and (if needed) a config block in `.env.example`. Don't sprinkle
provider-specific calls outside `model.ts`.

### Prompt caching

We rely on Anthropic prompt caching — `cache_control: { type: 'ephemeral' }`
applied at the top-level `providerOptions` in `model.ts`. Cache hits are
visible in `cache_read_input_tokens` on the response. Don't add new system
prompt content above the cached prefix without understanding the cache
boundary.

### "No tests" reality

There is no Jest/Vitest/Playwright suite as of the open-source release. CI
runs `npm run verify` which is `npm run build` (TypeScript + Next.js build
errors only). Before claiming a fix is complete:

- Run `cd app && npm run verify`
- Manually exercise the affected UI in a real browser at `localhost:3000`
- For UI changes, capture a before/after screenshot if possible

## Where to find more context

- [`README.md`](./README.md) — quick start and project status
- [`docs/PHILOSOPHY.md`](./docs/PHILOSOPHY.md) — design principles the
  project won't compromise; check this before proposing or accepting
  feature additions
- [`docs/USE_CASES.md`](./docs/USE_CASES.md) — concrete scenarios the
  project is built for (and one section listing where Lasca is the wrong
  tool — useful when triaging "is this in scope?")
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — extension recipes (layouts, charts,
  presets, providers, covers) and PR guide
- [`ROADMAP.md`](./ROADMAP.md) — what the maintainer plans to do, what's
  open for community contribution, and what's explicitly out of scope
- [`docs/ARCH.md`](./docs/ARCH.md) — architectural decisions with rationale
- [`docs/AESTHETICS.md`](./docs/AESTHETICS.md) — visual / typographic preferences

## Communication style

When a tradeoff comes up, propose two or three concrete options with their
costs before picking one. When something doesn't work after a couple of
attempts, say so plainly rather than silently struggling. Lasca is small
enough that getting unstuck quickly matters more than looking polished.
