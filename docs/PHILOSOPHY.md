# Lasca — Design Philosophy

This is the soul of the project. It's what makes Lasca different from the
dozen other "AI deck" tools, and what we won't compromise even when it would
be expedient.

If you're contributing, please read this before proposing features. Things
that look like "obvious wins" often violate one of these principles, and
the principle is usually the more important thing.

---

## 1. AI is the editor, not the author

Lasca will not write your content for you. It will not "fill in the blanks"
with plausible-sounding text. It will not invent data points to make a
chart narrate. It will not — under almost any circumstance — produce
content that you didn't ask for.

What Lasca *will* do is take **content you provide** — a one-line topic, a
rough Markdown draft, a set of bullet points, an imported PPTX — and:

- Restructure it into a coherent story
- Decide what belongs on each slide vs. what should fold together
- Pick the visual treatment (layout, typography, accent colors) that makes
  the content land
- Render charts and diagrams *only when the underlying data is real*
- Polish wording for tone consistency, never for substance

Why this matters: tools that write for you produce **plausible mediocrity at
scale**. The more polished the output looks, the harder it is for the user
to notice that the substance is hollow. Lasca refuses to do this. If you
hand it nothing, it asks you a question. It does not generate filler.

This rule has teeth in the codebase. `prompts.zh.ts` and `prompts.en.ts`
explicitly forbid the model from inventing numerical data to populate a
chart. `goldenRules.ts` flags slides where decoration appears without
underlying content. The clarifier in `harness/clarifier.ts` exists
specifically so the model can ask before it guesses.

## 2. Local-first

Your decks live in **IndexedDB on your device**. The server stores nothing
except auth tokens, feature flags, and the LLM bridge. You can:

- Use Lasca for an entire authoring session offline (after the first load)
- Export your work in standard formats and walk away
- Self-host with confidence that the server has no copy of your content

This is non-negotiable. We will never add a "save to cloud" mode that
silently uploads your decks. If a feature requires server-owned state
(real-time multi-user editing, for example), we will refuse it before
breaking this principle.

Why: presentations and reports are often pre-publication, often confidential,
sometimes sensitive enough that "the vendor has a copy" is itself a
disqualifier. The default has to be that the tool can't betray you because
it doesn't have the bullets.

## 3. Style is opinionated. Content stays yours.

Lasca ships **fewer than 20 themes**, by design. Each one is a complete,
considered visual language — typography, colors, motif, page geometry, chart
treatment all coordinated. We don't expose 200 knobs and tell you to figure
it out.

When you pick "Premium Editorial" or "Memo" or "Stripe-style", you're
buying into a coherent design decision someone made on your behalf. The
goal is that *every* output looks like it was made by someone who cares,
not by an AI default.

But within a theme, your **content is exactly what you wrote**. We don't
paraphrase. We don't add adjectives. We don't "punch up" your data points.
If you wrote *"Q3 revenue grew 12%"*, that's what appears on the slide,
not *"Q3 revenue surged 12%"*.

This split — opinionated style, faithful content — is the central design
trade. It's what lets a non-designer produce something that looks like a
designer made it, *without losing authorship*.

## 4. Typography is a first-class concern

Most AI deck tools treat typography as styling — pick a font, size, color.
Lasca treats typography as **semantic structure** that the model has to
respect:

- Same hierarchy ⇒ same font and size, **always**. Mixing weights at the
  same level is forbidden by `goldenRules.ts`.
- Subhead spacing is computed by the renderer, not free-styled by the
  layout engine. Every `### subhead` in a report has exactly the same
  `30pt` of air above it, regardless of what came before.
- Charts inherit typography rules from the surrounding slide. Y-axis
  labels never carry units (units belong on data labels). Categorical
  axes shrink fonts when labels would collide. Long labels get
  short-formed by `shortUnit` / `stripSharedSuffix`.

This is finicky engineering work that a "just call an LLM" approach
skips entirely. The visible payoff is that Lasca decks look quiet and
considered, where many AI-generated decks look busy and tonally mixed.

## 5. Anti-features

These are things Lasca **deliberately won't add**, even when users ask.
The reasons are spelled out so contributors don't accidentally chip away
at them:

- **No "AI write the whole deck for me from a one-word prompt"** — see §1.
  We will always require enough input to anchor the output to your intent.
- **No real-time multi-user collaboration** — see §2. Local-first is the
  premise; collaboration is a different product.
- **No "100+ font picker"** — see §3 and §4. Type pairings are part of
  the theme decision, not a knob.
- **No "10,000 templates" gallery** — see §3. We will keep the theme
  count small enough that each one is hand-tuned.
- **No "AI personality" / "style of [famous person]"** — taste-laundering
  someone else's voice through a generative model produces uncanny output
  and dilutes the user's own authorship.
- **No telemetry on content** — we measure error rates and feature usage,
  never the substance of what you wrote.

---

## How this shapes contribution

When proposing a feature, ask yourself which of the principles above it
strengthens, and whether it's at risk of weakening any other.

- A new chart type that improves how real data lands → strengthens §1, §4
- A new theme distilled from a real reference design → strengthens §3, §4
- A new layout category with hand-tuned spacing rules → strengthens §4
- An "AI write for me" mode → violates §1
- A "saved to cloud automatically" toggle → violates §2
- A "freeform font / color picker for everything" → violates §3 and §4

Most contribution discussions happen in
[GitHub Discussions](https://github.com/lasca-ai/lasca/discussions).
If you're unsure whether an idea fits, that's the place to ask before
writing code.
