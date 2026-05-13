# Lasca

**Open-source AI studio for slides and print-quality reports. HTML-native, local-first, and refuses to make data up.**

**Live demo → [lasca.ai](https://lasca.ai)**

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![Status: Public beta](https://img.shields.io/badge/Status-Public_beta-orange.svg)](#status)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green.svg)](./.nvmrc)

<p align="center">
  <a href="./docs/demo/lasca-demo.mp4">
    <img src="./docs/demo/lasca-demo.gif" alt="Lasca 66-second product demo — click for full-quality MP4" width="820">
  </a>
  <br/>
  <em>66-second product demo · <a href="./docs/demo/lasca-demo.mp4">▶ MP4 (7 MB)</a> · <a href="./docs/demo/lasca-demo.webm">WebM (1.8 MB)</a></em>
</p>

> **"AI is editor, not author."** Bring the content. Lasca restructures,
> lays out, polishes, and presents it.

Lasca turns rough ideas, Markdown drafts, or imported PPTX/PDF files into
either a deck of slides or a print-quality report — without leaving your
browser. Decks live in IndexedDB, so your work stays on your device. The
server only handles auth, feature flags, and the LLM bridge.

This repo is the public-source release of a project that's been cooking in
private since early 2026. **We just turned the lights on. Come help shape
where it goes** — see [`ROADMAP.md`](./ROADMAP.md) for the wishlist and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for how to get involved.

---

## What makes Lasca different

1. **HTML-native canvas, not a PPTX wrapper.** Slides are React + CSS Grid; charts are real SVG. The browser does what it's good at — typography, layout, animation — instead of being a renderer for someone else's binary format.
2. **A preset composer, not blank-canvas prompt-and-pray.** 40+ hand-tuned layouts and 12 themes form a registered grammar the LLM picks from. Outputs are consistent across runs; the model can't invent typography or break the grid.
3. **Field-level editing with a single source of truth.** Every drag, resize, and recolor persists through structured override bags (`_dragOffsets / _dragSizes / _fieldStyles`), survives regeneration, and joins the undo stack. Most "AI deck" tools are regenerate-only.
4. **Charts and diagrams are first-class.** Real SVG with a math layer for label sizing, axis-unit hoisting, and flowchart annotation. No screenshots, no iframes, no matplotlib paste-backs.
5. **Natural-language editing, not menu archaeology.** Three of four edit flows route through the chat panel today as intents — edit a page, extend a deck, match another deck's style. (Full-deck redesign over chat is on the roadmap.) No nested toolbars for "make this section darker."
6. **Real pagination via paged.js.** PDF exports match the on-screen preview pixel-for-pixel. Running headers, footnotes, TOC, multi-page reports — print-publishing primitives, not `@page` CSS hacks.
7. **Quality gates built in.** `goldenRules.ts` runs 22 pure-function validators (AABB overlap, golden ratio, schema, language consistency) plus a silent LLM recheck loop before any preview lands. Bad output rarely reaches your eyes.
8. **Token-efficient by design.** Prompts are cached, the layout grammar is fixed, and the system prompt is reused across slides. Materially cheaper than skill-driven generators at production volume.
9. **Streaming with explicit error classification.** Long operations run over SSE; the pipeline classifies every error with a `fatal` flag instead of leaving consumers to guess from opaque stalls.
10. **Slide and report are architecturally separated.** A `format` channel on every preset routes the two through different composition paths. One product, two formats, no monolithic if-else.

Plus the table-stakes things you'd hope for: **local-first** (your decks live in IndexedDB; the server only handles auth and rate limits), **provider-agnostic LLM bridge** (OpenAI / Anthropic / any OpenAI-compatible gateway via one env-var swap), and **Apache 2.0** (audit it, self-host it, fork it).

---

## Why HTML, not PPTX

The choice of HTML as the rendering substrate (instead of generating `.pptx` files) isn't an aesthetic preference — it changes what the product can do.

**Speed.** A slide renders the moment the LLM finishes streaming a JSON patch — there's no intermediate "build a binary, parse it, paint it" step. Edits are DOM mutations, not file rewrites. Re-rendering one field of one slide takes microseconds; re-rendering the whole deck takes milliseconds. PPTX-based tools have to go LLM → JSON/XML → OOXML build → image preview before you see anything.

**Expressiveness.** Anything CSS can do, a slide can do — gradients, flex/grid layouts, real SVG charts with `viewBox` math, web fonts that render identically on every device, multi-page reports with running headers via paged.js, WAAPI animations, embedded interactive figures. The OOXML schema PPTX is built on is closed-world; the browser is open-world. The same engine that runs the web runs your deck.

**AI-native.** LLM training corpora contain orders of magnitude more HTML/CSS than OOXML XML, so models write HTML correctly the first time far more often than they write PPTX. A broken `<h1>` is one wrong character; a broken `<a:p><a:pPr>...` chain is unparseable garbage. HTML also supports partial updates — replace one element, leave the rest alone — while PPTX rewrites the whole file. Lasca's per-slide regeneration, per-field edit, and incremental SSE streaming are all only possible because the substrate allows them.

---

## The editor — built for AI-generated content

Most "AI deck" tools have an LLM, a preview pane, and a regenerate button. Lasca has a real editor, and that's where the work happens after generation lands.

**Edit doesn't mean regenerate.** Drag, resize, recolor, edit text in place — every change persists through structured override bags (`_dragOffsets`, `_dragSizes`, `_fieldStyles`) that survive regeneration. You can hand-tune a page and then re-run the LLM on its content; your manual edits stay. Other AI deck tools throw away your work the moment the LLM touches the page again.

**Chat for semantic, mouse for spatial.** "Make this section darker" goes through the chat panel as an intent — no menu-diving. Moving a chart 20 pixels left goes through drag. Both feed the same 50-step undo history with deep-cloned snapshots. The chat and the canvas aren't separate apps glued together; they share the same state and the same undo stack.

**Animations that actually survive AI updates.** The canvas uses imperative `innerHTML` updates guarded by a render ref, not React's reconciler. Web Animations API entries don't tear when state changes mid-flight. Slide transitions run in a dual-layer setup (previous animates out while next animates in) so there's never a "flash." This is the kind of detail that requires a hand-written editor — you can't get there by wrapping a third-party slide library.

**Drag with real snap, not visual fudging.** The Canvas walks the DOMMatrix ancestor chain to compensate for zoom and pan, so snap guides land on the pixel you intended even at 50% zoom on a Retina display. Faithful-imported PPTX/PDF pages share the same drag surface as native slides via a shared `data-pptx-faithful` marker.

**Local-first means actually local.** Your decks live in your browser's IndexedDB, not a vendor database. Close the tab, come back hours later, resume exactly where you left off, with no server roundtrip. The 3-column workspace (thumbnails / canvas / chat) collapses sensibly on narrow viewports and runs full-bleed for `/present` mode.

---

## What's in the box today

Concrete, working features as of the public-launch commit:

- **`/create` wizard** — one-line topic or rough Markdown → clarifier
  questionnaire → outline → mdContext → style pick → final deck or report.
  Generation streams in over SSE.
- **`/editor`** — 3-column workspace (thumbnails / canvas / chat). Drag,
  snap, undo, page size, zoom, notes. Imperative DOM updates keep WAAPI
  animations from tearing.
- **40+ slide layouts and 12 themes** — opinionated, hand-tuned. No 200-knob
  style panel. Themes range from editorial newsprint (`analyst-light`) to PE
  ledger (`analyst-dark`) to glacial Nordic (`冰川`).
- **Faithful import** — drop a `.pptx` or `.pdf` and either keep the original
  layout for tweaks or have Lasca redesign it into native layouts.
- **Print-quality reports** — Markdown reports flow through paged.js for
  proper page breaks, running headers, TOC, and footnotes. The optional
  sidecar in
  [`lasca-report-pdf-service`](https://github.com/lasca-ai/lasca-report-pdf-service)
  bakes the result into a PDF.
- **Provider-agnostic LLM bridge** — point at the official OpenAI or
  Anthropic APIs, or any OpenAI-compatible gateway (Moonshot/Kimi, DeepSeek,
  vLLM, Ollama, your own proxy). One env-var swap.
- **Google sign-in (or invite-code legacy)** — public sign-up via Google
  Identity Services; the original invite-code flow stays in the codebase
  behind a feature flag for self-hosters who want a closed beta.
- **Per-account daily quota** — 30 LLM calls / day / user by default, tunable
  via `feature_flags.ai_daily_limit`. Keeps a public demo from being abused.
- **Local-first** — your work persists in IndexedDB. The server has no copy.

---

## Why Lasca?

Most "AI deck" tools optimise for **producing plausible-looking output from
a one-word prompt**. Lasca takes the opposite stance: AI is the editor, not
the author. You bring content; Lasca handles structure, layout, typography,
and chart rendering — and refuses to fabricate the data points that make a
chart narrate.

The trade-off is concrete:

|  | Other AI tools | Lasca |
|---|---|---|
| Source of content | LLM generates it | You provide it |
| Fabricated data in charts | Common — chart "looks right" but values are invented | Forbidden by prompt + validator (`goldenRules.ts`) |
| Rendering substrate | PPTX wrapper or screenshot-back | HTML / React / CSS Grid + real SVG charts |
| Visual design | 200+ knobs + free-style fonts | ~20 hand-tuned themes, opinionated typography |
| Editing after generation | Regenerate the whole page | Field-level drag / resize / recolor with persistent overrides |
| Re-edit workflow | Modal-and-button maze | Natural language via chat (edit / extend / match-style today; redesign on the way) |
| Where your decks live | Vendor's database | Your browser's IndexedDB |
| Output medium | Mostly decks | Decks **and** print-quality reports (paged.js, real pagination) |
| Quality control | Trust the LLM | `goldenRules.ts` validators + silent recheck loop before preview |
| Real-time multi-user | Often yes | No, by design (local-first) |
| License | Proprietary SaaS | Apache 2.0, self-hostable |

Read [`docs/PHILOSOPHY.md`](./docs/PHILOSOPHY.md) for the full set of
design principles — including the things Lasca deliberately won't do.

## Who it's for

Lasca is built for people whose readers are **paying attention** — and who
care that the output looks like something a human took time over.

- **Investment / market researchers** writing monthly reports for
  institutional readers
- **Strategy consultants** producing pitch decks where the visual register
  signals "this is a recommendation, not a sales doc"
- **Founders** preparing investor updates that need to look serious
  without burning two hours in PowerPoint
- **Product managers / analysts** drafting internal proposals where
  typography credibility matters
- **Researchers** putting together pre-print figure layouts that aren't
  equation-heavy enough to need LaTeX

Five concrete walk-throughs live in [`docs/USE_CASES.md`](./docs/USE_CASES.md),
including "where Lasca is the wrong tool."

---

## Status

**Public beta.** This release is the first time the source has been
available outside a small private group; expect rough edges. Public APIs
(`Layout` union, `StylePreset` interface, SSE event shape) may change
between minor versions until 1.0. Known gaps and "help wanted" items are
tracked in [`ROADMAP.md`](./ROADMAP.md). The full architectural narrative
is in [`docs/ARCH.md`](./docs/ARCH.md).

There are **no automated tests** yet — see ROADMAP.md *Help wanted*.
Verification is currently manual: `npm run verify` (TypeScript + Next.js
build) and a real browser session.

---

## Where we're going (the short version)

The maintainer's bigger ambitions, all on [`ROADMAP.md`](./ROADMAP.md):

- **Refuse to make stuff up.** When a user says "build me a Q1 analysis"
  without saying *what* Q1, the AI should ask or refuse — not invent.
- **Visual recheck as a hard gate** before any preview lands.
- **Move LLM rules out of inline prompts** into a real skills + knowledge
  architecture (the `harness/skills/` + `harness/knowledge/` scaffold is
  already there).
- **Chart-by-default** when content has numbers. Right now generation under-
  produces charts.
- **Diagram + flowchart layouts** as first-class citizens.
- **Public share links** so a deck can be sent without the recipient
  installing Lasca.
- **Per-page "draw another card"** — regenerate any single page with N
  alternatives.
- **Per-style colour customization**, faithful one-click translation,
  three-D cover effects, animated waiting screens — and a long tail of
  smaller polish items.

If any of those sound interesting, the corresponding ROADMAP entry is
where to claim it.

---

## Quick start

```bash
# Requires Node 20+ — `nvm use` if you have nvm
git clone https://github.com/Freza00/lasca-slides-design.git lasca
cd lasca/app
npm install
cp .env.example .env.local
```

Set the LLM provider in `app/.env.local`. Three common shapes:

```bash
# Official OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Any OpenAI-compatible gateway (Moonshot/Kimi, DeepSeek, vLLM, etc.)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://your-gateway.example/v1
AI_MODEL=Kimi-K2.6

# Anthropic Claude
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Optional — Google sign-in (skip in local dev; auth is bypassed there):

```bash
GOOGLE_CLIENT_ID=...        # https://console.cloud.google.com/apis/credentials
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...    # same value, exposed to the client
```

Then from the repo root:

```bash
./dev.sh
# equivalent to: cd app && npm run dev
```

Open <http://localhost:3000>. Auth is bypassed in local dev so you can go
straight to `/create` or `/editor`.

For the optional report → PDF sidecar service, see the
[`lasca-report-pdf-service`](https://github.com/lasca-ai/lasca-report-pdf-service)
repo. The Lasca app runs fine without it — exports use a built-in fallback.

---

## Architecture at a glance

```
                ┌─────────────────────────────────────────────┐
   user input ──┤  /create wizard ──► orchestrator (SSE) ──┐  │
                │                                          │  │
                │   clarifier ─► outline ─► mdContext ─►   │  │
                │                       generate ──► recheck│ │
                └────────────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────────────┐
                │  /editor (3-column)                         │
                │      ├── Canvas    (per-slide DOM + WAAPI)  │
                │      ├── ChatPanel (intent-routed edits)    │
                │      └── ReportPreviewPane (paged.js)       │
                │              │                              │
                │              ▼                              │
                │      Zustand store + IndexedDB              │
                └─────────────────────────────────────────────┘
                                    │
                                    ▼
                ┌─────────────────────────────────────────────┐
                │  Optional sidecar:                          │
                │  lasca-report-pdf-service (paged.js → PDF)  │
                └─────────────────────────────────────────────┘
```

For decisions and rationale, see [`docs/ARCH.md`](./docs/ARCH.md).

---

## Project structure

| Path | What it is |
|---|---|
| `app/` | The Next.js application — the actual product. |
| `app/src/app/` | App Router routes (`/create`, `/editor`, `/present`, …) and API endpoints. |
| `app/src/components/` | React components grouped by feature (`editor`, `chat`, `create`, `present`, `auth`, …). |
| `app/src/lib/` | Core libraries — slide rendering, AI orchestration, theming, storage. |
| `docs/` | Public design and architecture docs (`ARCH.md`, `AESTHETICS.md`, `CHANGELOG.md`, `PHILOSOPHY.md`, `USE_CASES.md`). |
| `files/` | Reference material — product brief and JSON schema. |
| `sketches/` | Scratch experiments. Not shipped, sometimes broken. |
| `dev.sh` | Convenience launcher (`cd app && next dev --webpack`). |

For the agent-oriented map (where each subsystem lives, what files matter
most), see [`AGENTS.md`](./AGENTS.md).

---

## Routes

| URL | What it is |
|---|---|
| `/` | Landing page |
| `/create?type=slide` | Slide-deck generation wizard |
| `/create?type=report` | Report generation wizard |
| `/editor` | Main editor |
| `/present` | Fullscreen presentation mode |
| `/present?mode=presenter` | Dual-pane presenter view (current + next + notes + timer) |
| `/works` | Local deck gallery |
| `/register` | Public sign-up (Google by default; invite code under feature flag) |
| `/admin?key=…` | Admin dashboard (feature flags, users, caps) |

---

## Contributing

Contributions of every size are welcome. See [`CONTRIBUTING.md`](./CONTRIBUTING.md)
for setup, the architecture cheatsheet, and recipes for the five most-common
extension points (layouts, charts, presets, providers, covers).

[`ROADMAP.md`](./ROADMAP.md) lays out what the maintainer plans to do, what's
open for community contribution (`good first issue` and `help wanted`
buckets), and what's explicitly out of scope.

If you're not sure whether something fits — open an issue and ask. Discussion
before code is cheaper than a PR that has to be rewritten.

---

## License

[Apache License 2.0](./LICENSE) — see also [`NOTICE`](./NOTICE) for
third-party acknowledgements. By contributing you agree to license your
work under the same terms.
