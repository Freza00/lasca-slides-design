# Contributing to Lasca

First — thanks for considering it. Lasca is a small project run by a tiny
team and contributions of every size are welcome: bug reports, doc fixes,
small UX tweaks, and big chunks of the [ROADMAP](./ROADMAP.md) marked
*help wanted*.

If something here is wrong, unclear, or out of date, fixing it is a perfect
first PR.

## Code of conduct

Be kind, assume good faith, and skip the snark. We follow the
[Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Repeated bad behavior gets you banned without further explanation.

## Getting set up

```bash
git clone https://github.com/lasca-ai/lasca.git
cd lasca

# Use Node 20 — `nvm use` if you have nvm installed
cd app
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY *or* ANTHROPIC_API_KEY
cd ..
./dev.sh
```

Dev server runs at <http://localhost:3000>. The first generation can be slow
because LLM responses stream in — that is expected, not a bug.

### Optional: report PDF service

The Markdown report → PDF feature uses a small Python sidecar
(`lasca-report-pdf-service`). The Lasca app runs fine without it — exports
will use a built-in fallback. If you want the polished print-quality PDFs,
clone that repo and follow its README.

### Troubleshooting

- **`npm install` fails on Node 18 or earlier** — Lasca requires Node 20+
  (see `.nvmrc`). Newer Node 22 also works.
- **`/api/ai/*` returns 500** — `.env.local` is missing or the API key is
  invalid. Errors are logged in the dev server terminal.
- **Slide animations look frozen in a browser preview iframe** — Web
  Animations API stalls when `document.visibilityState === 'hidden'`. Visual
  verification must happen in a real foreground tab.

## Read this first

Before proposing a feature, please skim [`docs/PHILOSOPHY.md`](./docs/PHILOSOPHY.md).
It spells out the design principles we won't compromise — *AI is the editor
not the author*, local-first, opinionated typography, faithful content — and
the categories of feature we deliberately won't accept (cloud-sync,
real-time multi-user, "AI write the whole thing for me", etc.). A 30-second
read prevents a 30-hour misdirected PR.

## Finding something to work on

Three good ways:

1. Browse the [ROADMAP](./ROADMAP.md) — items under *Good first issues* are
   sized for a first PR; items under *Help wanted* are larger.
2. Check the GitHub issue tracker, especially the `good first issue` and
   `help wanted` labels.
3. Use Lasca yourself, find something annoying, file an issue, and (if you
   want) pick it up.

If you want to take on something bigger than a single file change, please
open an issue first so we can sanity-check the approach before you spend
hours on it.

## Architecture cheatsheet

A picture is worth a few paragraphs:

```
                  ┌────────────────────────────────────────────────────┐
  user input ───► │  /create wizard  ──►  orchestrator (server SSE)    │
                  │                            │                       │
                  │                            ▼                       │
                  │   clarifier ─►  outline ─► mdContext ─► generate ─►│─► slides
                  │                                              │     │
                  │                                              ▼     │
                  │                                          recheck   │
                  └────────────────────────────────────────────────────┘
                                              │
                                              ▼
                  ┌────────────────────────────────────────────────────┐
                  │  /editor   <──── store (Zustand + IndexedDB)       │
                  │     │                                              │
                  │     ├── Canvas.tsx    (per-slide DOM + drag/snap)  │
                  │     ├── ChatPanel.tsx (intent-routed edits)        │
                  │     └── ReportPreviewPane (paged.js for reports)   │
                  └────────────────────────────────────────────────────┘
```

The five extension points contributors most often want to touch are below.

### 1. Adding a new Slide Layout

A *layout* is one of the visual templates the renderer can emit (e.g.
`title-bullets`, `stat-card`, `quote-hero`). To add one:

1. **`app/src/lib/types.ts`** — add the literal to the `Layout` union, the
   `LAYOUT_RUNTIME` record (links it to its category), and a `LayoutMeta`
   entry in `LAYOUT_REGISTRY` (drives picker + LLM hints).
2. **`app/src/lib/renderSlide.ts`** — write a `renderYourLayout(slide, theme)`
   function and register it in the `RENDERERS` map near the bottom of the file.
3. **`app/src/lib/ai/harness/goldenRules.ts`** — add a row to
   `LAYOUT_REQUIRED_FIELDS` listing which JSON fields are mandatory. Without
   this, the silent recheck loop will pass invalid output.
4. **(Optional) `app/src/lib/ai/harness/stylePresets.ts`** — list the new
   layout in `avoidLayouts` / `preferredLayouts` of any preset that should
   bias toward or away from it.

Test by running the dev server and choosing the layout in the picker, or by
prompting the AI to generate one.

### 2. Adding a new Chart Type

Chart renderers live in `app/src/lib/renderCharts.ts`. To add `sankey`, for
example:

1. Write `renderSankey(data, opts): string` that returns SVG markup. Reuse
   the existing helpers — `shortUnit`, `stripSharedSuffix`,
   `autoCategoryFontSize`, `fitSvgText` — for unit handling and label
   sizing. Stick to the shared `viewBox="0 0 960 540"`.
2. Export the new function and add it to the `CHART_RENDERERS` map (search
   for that identifier in `renderSlide.ts`).
3. Add a small `ChartType` extension in `types.ts` if the new type carries
   data fields the existing union doesn't already cover.

Charts get strong opinions in the system prompt — see `prompts.zh.ts` and
`prompts.en.ts` for the rules the LLM must follow when emitting your new
chart type. Update both language files together.

### 3. Adding a new Style Preset

Presets bundle theme + typography + density into one named choice
(e.g. `editorial`, `playful`, `private-banking`). To add one:

1. Define a `StylePreset` object in `app/src/lib/ai/harness/stylePresets.ts`.
   Set `format: 'slide'` or `format: 'report'`.
2. Add it to `BUILTIN_PRESETS` (free) or `PREMIUM_PRESETS` (gated).
3. Add the literal to the `BuiltinPresetId` or `PremiumPresetId` union in
   `app/src/lib/ai/harness/types.ts`.

That's it — the create flow's StylePicker will pick it up automatically.

### 4. Adding a new LLM Provider

`app/src/lib/ai/model.ts` is the only file that should know about specific
providers. To wire up a new one (e.g. Google Gemini):

1. Install the relevant Vercel AI SDK adapter (`@ai-sdk/google`, etc.).
2. Add a `case 'google':` arm to the switch in `getModel()`.
3. Document the env vars (`GOOGLE_API_KEY`, etc.) in `.env.example` and
   in the README.
4. If the provider has different prompt-caching semantics, gate them inside
   `getCacheOpts()`. Don't sprinkle conditionals elsewhere.

### 5. Adding a new Cover Design

Cover renderers currently live inline at the top of `renderSlide.ts` (search
for `renderCover`). To add a new variant:

1. Write `renderCoverYourName(slide, theme)`.
2. Add it to the cover dispatch — `getSceneVariant(theme)` decides which
   cover function to call based on theme metadata.
3. If the cover should be selectable independently of theme, add a discriminant
   to the slide JSON (e.g. `cover_variant: 'your-name'`) and consume it.

Cover layout is one of the parts of the codebase that is overdue for being
refactored into its own module — see ROADMAP. PRs that introduce a clean
plug-in interface for covers (and migrate the existing five) are very welcome.

## Submitting a PR

- **Branch from `main`** and keep PRs focused. One feature or fix per PR.
- **Run `cd app && npm run verify`** before submitting. This catches
  TypeScript and Next.js build errors. There is no test suite to fail (yet).
- **For UI changes**, include a screenshot or short clip in the PR
  description. The reviewer cannot otherwise tell whether your change looks
  right.
- **Commit style**: short, imperative subject line (`fix: chart label
  collision on small viewports`). Body optional but preferred for non-trivial
  changes.
- **No CLA required.** Lasca is Apache 2.0 and contributions are accepted
  under that license — by submitting a PR you affirm you have the right to
  license your contribution under Apache 2.0.

## Where to ask questions

- **GitHub Discussions** — for design questions, feature ideas, "is this a
  bug?" type questions
- **GitHub Issues** — for confirmed bugs and concrete proposals
- Please don't email the maintainer directly for routine questions; public
  discussions help everyone

## Reporting security issues

If you find a security vulnerability, please don't open a public issue.
Email the maintainer with details (see the GitHub profile of the repo
owner). We will acknowledge within 72 hours and disclose responsibly.
