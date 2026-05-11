# ROADMAP — Lasca

This is the social contract between the maintainer and contributors. Every
item below is something we want done; the buckets describe **who is most
likely to do it** and **how much help is welcome**.

If you want to claim something, open an issue (or comment on the existing
one) so we don't double-up. None of these are stable APIs — assume the
specifics will be discussed in the issue thread before code lands.

> **Status legend** — 🎯 maintainer pipeline · 🌱 good first issue ·
> 💪 help wanted · 🚫 explicitly out of scope · 📓 maintainer's notebook

## 🎯 Maintainer pipeline

Things the maintainer plans to ship soon-ish. PRs welcome but please
coordinate first — these are mid-flight.

### Trust + correctness

- **Refuse to fabricate when source content is missing.** When a user
  prompts "Q1 analysis", "internal review", "product deck" without saying
  *what* Q1 / *what* review / *what* product, the model must ask a
  clarifying question or refuse — not invent. Bake this into both the
  clarifier prompt and the generation prompt; add a validator on the
  generated mdContext that flags placeholder-shaped content
  (e.g. "Section 1: [topic]") and bounces it back.
- **Visual recheck as a hard gate before preview.** Today recheck is
  best-effort, post-generate. Promote it to a blocking step before the SSE
  `done` event so users never see a broken render in the preview.
- **Audit and fix the `.lasca` HTML export.** Reportedly the bundled file
  doesn't reopen. Trace the round-trip — what the editor includes, what the
  reader expects — and either fix or document the constraint.

### Architecture

- **Move LLM rules from inline prompts into the skills + knowledge stack.**
  `harness/skills/` and `harness/knowledge/` are the home; today most of the
  rules still live in `prompts.zh.ts` / `prompts.en.ts`. Migrate the
  load-bearing rule blocks (chart rules, page-count constraints, evidence
  citation, language-matching) into pluggable skill modules so they can be
  versioned, audited, and selectively activated.
- **Sidebar generation flow with explicit scope.** From the editor sidebar,
  let the user pick: regenerate just this page / a range / the whole deck.
  Decide whether to enter the full `/create` wizard or stay inline.

### Generation quality

- **Charts emerge during the *adjust* pass, not the *generate* pass.**
  Right now generation under-produces charts even when the content has
  numbers. Move chart inference to the post-generate adjust phase where the
  model has the full slide context.
- **Auto-suggest charts** more aggressively. When mdContext shows numeric
  evidence, the layout selector should prefer chart layouts over prose.
- **Diagram + flowchart layouts as first-class citizens.** Process flows,
  system diagrams, org charts, decision trees. Both auto-generated (model
  produces structure) and explicit ("draw me a flowchart of X").
- **Geometric / algorithmic placeholders for sparse pages.** Cover, end,
  TOC, transition, section, data-light pages — generate distinct geometric
  art instead of empty space. Inspired by `algorithmic-art` and
  `canvas-design` skill conventions.

### Reports

- **Report layout redesign.** Current report layouts are slide layouts in
  trench coats. Redesign as actual report pages — typography, running
  headers, TOC, drop caps, footnote rules. Lean on `docx` /
  `canvas-design` / `pdf` skill heritage for inspiration.
- **Report-specific style register.** Distinct from slide styles. Different
  scenarios (memo, white-paper, glossy retail, internal flux) need
  different type and rule conventions.

### Editor

- **Brand visual + UX consistency pass.** Single design pass across landing,
  `/create`, `/editor`, `/admin` so every screen feels like the same product.
- **Show page-count on preset cards in `/create`.** Today the preset pills
  don't tell you how many pages the preset is calibrated for.

### Pipeline (carried over from before public launch)

- **Delete the legacy 14 hand-built style presets.** The composer
  (`derivePreset`) is the live path; the old objects in `stylePresets.ts`
  are dead code from the orchestrator's perspective. (See the comment
  around `BUILTIN_PRESETS` in that file.)
- **Wire up `redesign-deck` intent dispatch in ChatPanel.** The clarifier
  template exists; `classifyIntent` needs a new union arm and ChatPanel
  needs the routing case. Currently right-side chat cannot trigger a full
  deck redesign.
- **Structured logging for long-running generations.** When `xhigh`
  reasoning effort is set, we sometimes hit the per-chunk heartbeat. We
  want a structured log line so it's easy to triage from production.

## 🌱 Good first issues

Bite-sized changes that don't require deep familiarity with the renderer.
Great way to do a first PR.

- **Skip-this-question button skips one, not all.** Today the skip control
  in the clarifier abandons the whole questionnaire; it should advance a
  single question only.
- **Sidebar select-all and chat select-all should mirror.** When the user
  ticks "all" on one panel, the other should reflect it; same for unticking.
- **Show page count on preset cards.** Each preset in `/create` carries a
  default page band (e.g. "10–14 pages"); render it on the card.
- **Random ambient status messages.** Long generations show a single static
  spinner. Borrow the Claude Code "moonwalking", "stirring", "ruminating"
  rotation — short, playful, occasionally jolts the user into a creative
  thought. Word them so they're charming, not annoying.
- **Mobile / device-size report presets.** Letter / A4 today; add A6,
  mobile-portrait, and tablet sizes for short-form reading.
- **Mute or remove the new ambient texture overlay.** Several testers
  reported the latest "氛围 / 底纹" overlay is too loud; some configs don't
  show it at all. Audit, fix, and turn down the default opacity.
- **Per-route `error.tsx` boundaries.** Currently only `/create` has one.
  Add minimal boundaries for `/editor`, `/works`, `/profile`, `/admin`,
  `/register`, plus a global `app/error.tsx` fallback. The `/create` one
  is a good template.
- **Gate dev-only test pages.** `/harness-test`, `/test-laser`, and
  `/test-paged` are currently reachable in production. Either wrap them
  in `AuthGuard` (admin-only) or hide them behind a
  `NEXT_PUBLIC_ENABLE_DEV_PAGES` env flag.
- **Linux/Docker font fallback for the PDF service.** `report_engine.py`
  has a macOS-only fallback path block. Add a Linux equivalent (try
  `/usr/share/fonts`, `/usr/local/share/fonts`) so Docker images can pick
  up host fonts the same way macOS does.
- **Replace the inert "Report" button on the Landing page.** Right now
  clicking it does nothing. Make it visibly disabled with a "Coming soon"
  tooltip linking to the relevant tracking issue.
- **i18n the Report-mode ChatPanel placeholder.** Currently a hardcoded
  English string ("Report mode — edit markdown directly..."). Move it to
  the i18n dict keyed off `chat.report_mode_placeholder` so the Chinese
  locale doesn't show English.
- **Extend `prompts.*.ts` rules audit.** Three files (`prompts.zh.ts`,
  `prompts.en.ts`, the bilingual-report block in `stylePresets.ts`) all
  define LLM rules that have to stay consistent. A small linter (or even
  a doc table) that catches drift between them would be valuable.
- **Add a `LICENSE` header script.** Apache 2.0 doesn't strictly require
  per-file headers, but a one-liner SPDX comment in new files would help.
  Land a small script + pre-commit hook that checks new files have it.

## 💪 Help wanted

Larger, often-architectural pieces. The maintainer will review and merge
but isn't planning to do them solo.

### Sharing + distribution

- **Public share link.** A read-only URL for any deck — server-side rendered
  or static-exported to S3 / R2 / a Vercel route. Today the only way to
  share is to send the `.lasca` file.
- **Single-page export that drops into another deck.** Many users only want
  one slide and want to paste it into their own existing PowerPoint / Slides
  / Keynote. Investigate clean per-page PPTX export or HTML-as-image.

### Content + style ingestion

- **One-click style copy from any source.** Upload a PPTX / PDF /
  screenshot / a URL — extract a `StylePreset` from it. The hard parts are
  colour-cluster extraction, font detection, and layout pattern inference.
- **DOCX / PDF / non-conformant Markdown report ingestion.** Today report
  mode wants well-structured Markdown. Pre-process arbitrary input via LLM
  into clean MD before mdContext.
- **Style-from-template.** Upload a reference deck or a single page; the
  system "absorbs" its style and applies it to your content.

### Generation depth

- **Per-page "draw a card" regeneration.** A Pro-tier feature: every page
  exposes N alternative layouts / treatments / paraphrases as a card-deck
  picker. Each card is a fresh generation against the same mdContext page.
- **Free per-style colour customization.** Every theme exposes a primary /
  accent / surface picker without breaking typographic relationships.
  Trickier than it looks because some themes derive from physical-pigment
  ratios.
- **Auto-generate explanatory schematics + flowcharts.** Diagrams produced
  *as part of* a slide, not just user-uploaded. Pairs with the
  diagram-layout work in maintainer pipeline.
- **Apple-Music-style animated cover art.** Investigate WebGL / Lottie /
  CSS-3D for cover motion. Experimental — might not ship.
- **3D / depth effects for cover slides.** Scope first; small experiments
  before any platform commitment.
- **Animated mascots and ambient motion.** GitHub-style running cat,
  animated gears, low whispers / micro-animations on long waits.

### Editor experience

- **Frosted-glass + laser-reveal during single-page edit.** When the user
  edits one page, frost the whole canvas and "unveil" the new state with a
  laser-sweep transition once the model returns. Sells "thinking" without
  being a generic spinner.
- **"Pretext" pre-content motion.** Subtle pre-roll animations before the
  slide actually renders — a moment of anticipation, like a film fade.
- **Speaker mode with per-page timer.** Presenter view with a running clock
  that resets per slide; surfaces overrun risk to the speaker.

### Infrastructure

- **Cloudflare-fronted attack mitigation for the public demo.** Turnstile
  on registration, WAF rules on the API routes, IP rate limits beyond the
  current in-memory map. The maintainer has a Cloudflare account ready;
  needs someone to actually wire it.
- **Decompose `renderSlide.ts`.** ~3000 lines. Suggested split:
  `renderCovers.ts`, `chartBridge.ts`, layouts grouped by category.
- **Decompose `ChatPanel.tsx`.** ~2200 lines. The intent router, message
  list, and input toolbar can each live in their own file.
- **Test foundation for the highest-risk modules.** No tests today.
  Priority targets — `renderSlide.ts`, `harness/orchestrator.ts`,
  `cards/adapt.ts`, `reports/pagedjsFlow.ts`, `harness/stylePresets.ts`.
  Snapshot tests of layout output are particularly high-value.
- **Runtime schema lockdown with [zod](https://zod.dev).** SSE event
  payloads, `StylePreset` objects, and per-layout JSON contracts are
  TypeScript-only today. A zod-validated boundary at API entry would catch
  a class of bugs that currently surface only after a re-render.
- **Cover template plug-in interface.** Today the five cover variants are
  hardcoded inside `renderSlide.ts`. We'd like a registration model
  similar to layouts.
- **Finish the Report-mode ChatPanel.** The right-pane chat is disabled in
  Report mode — users edit Markdown directly. The intent classifier and
  prompts need extending to cover prose-level edits.
- **Centralised feature flag client.** `import_pptx_enabled`,
  `import_pdf_enabled`, etc. are read in scattered places. A single
  `useFeatureFlags()` hook with batching would simplify a lot of code.
- **Tracing dashboard.** `LASCA_TRACE=1` dumps prompt traces to the server
  console. A small dev-only page that pretty-prints those traces would
  speed up prompt iteration considerably.

## 🚫 Out of scope

Saying "no" up front so we don't accidentally take work we won't merge:

- **Adding a third UI language.** Lasca ships Chinese and English; a third
  language (Spanish, Japanese, etc.) needs an active maintainer in that
  language to keep the i18n dict honest. Without one, translations rot.
- **Replacing paged.js with a non-browser PDF backend.** The `pdfRenderMode`
  field on `Deck` is ignored as of v2.4.2 — paged.js is the supported
  path. A second backend would double the surface area of report bugs.
- **PPTX export.** Lasca imports PPTX (faithful or redesigned) but does
  not export. We've decided this is a downstream concern, not a core
  feature. (Single-slide PPTX export under "Help wanted" is different —
  that's a tactical drop-in, not a full export pipeline.)
- **Multi-user real-time collaboration.** Lasca is local-first
  (IndexedDB). Real-time multi-user editing would require a major
  architectural change and is not on the table.

## 📓 Maintainer's notebook

Things the maintainer is mulling but hasn't committed to. Track loosely;
promote to one of the four buckets above when the shape clarifies.

- **Triple-card layout: small functional cards underneath the three big
  ones.** New functions including one-click translation that operates on
  faithful (PPTX/PDF) input and preserves the original formatting — the
  translated text replaces source text at the same coordinates.
- **Style adaptation by use-case.** Map each style preset explicitly to
  the scenarios it's calibrated for (memo, pitch, IC submission, weekly
  internal). Today the matching is implicit.
- **Industry-specific skill packs.** Financial / PE / IB / consulting skill
  modules to bolt onto the harness. Should plug in cleanly via the skills
  system once that migration lands.
- **Ask-first vs to-do.** Some users want a finished deliverable;
  others want a structured to-do list of decisions. Surface both as
  explicit modes rather than blending them.
- **Single-page-only flow.** Some users only ever want one slide (think:
  the "single great chart" use case). Make the flow first-class instead
  of forcing them through a deck wizard.
- **Geometry as decorative element.** The recent
  `LascauxBg`/algorithmic-art work hints at a richer visual identity.
  Geometric shapes as cover art, transition flourishes, ambient motion in
  waiting screens — without crossing into "AI deck slop" territory.
- **What other skill libraries are worth borrowing from?** ppt-template,
  canvas-design, theme-factory, algorithmic-art, docx, pdf — and the
  financial / banking / private-equity packs visible upstream. Audit which
  patterns actually help Lasca and which would dilute the philosophy.

## Versioning and breaking changes

Until we cut a 1.0, public APIs may change between minor versions. We will
call out breaking changes in `docs/CHANGELOG.md` and in PR descriptions.
The `Layout` union, `StylePreset` interface, and SSE event shape are the
three contracts most likely to break — pin to a specific tag if you build
something on top of them.
