# Lasca — Use Cases

Five concrete scenarios where Lasca is the right tool, and one where it
isn't. If you're trying to decide whether Lasca fits your workflow, read
the closest match below.

---

## 1. Investment-research analyst — monthly market reports

**Input**: a Markdown draft you've been writing all month — a dozen sections,
a few tables, citations to source data, the occasional chart annotation
("YoY 12%, down from 18% last month").

**What Lasca does**: imports the Markdown, runs it through the report flow
(`/create?type=report`), produces a print-quality PDF with proper page
breaks, running headers, source-anchored footnotes, and consistent
typography across every section. The chart treatments follow the rules
in `docs/PHILOSOPHY.md` — no fabricated data points, no decorative
decoration, no marketing-deck color salad.

**Why not just `pandoc`**: pandoc gives you a generic PDF. Lasca gives you
a PDF that looks like the institutional research notes your readers
recognize — quiet, dense, hand-typeset feel. The visual coherence is what
makes a CIO actually open the attachment.

**Why not Beautiful.ai / Gamma**: those tools are deck-first, optimised
for spoken delivery. A 30-page printed research note is a different
medium with different typography, and most "AI deck" tools collapse on
that page count.

## 2. Strategy consultant — client pitch deck

**Input**: a one-page brief, an exhibit list (3-4 charts you sketched on
paper), a logo.

**What Lasca does**: clarifier asks 3-4 questions about audience,
density, and tone (these go to `selectorRules.ts`). You pick a theme.
The flow turns each exhibit into a layout (split-image, stat-row,
horizontal-bar-chart, etc.), inserts agenda + section breaks, and
produces a 12-15 slide deck where the typography hierarchy stays
consistent across every page.

**Why not PowerPoint**: PowerPoint gives you the canvas. Lasca gives you
the *deck shape* — opinionated layouts, transitions that match the
content type, and a presenter mode (`/present?mode=presenter`) that
shows current + next + notes + timer.

**Why not Pitch / Tome**: those tools nudge you toward a "modern startup
pitch" aesthetic. Lasca's premium themes (Memo, Editorial, Premium
Stripe-style) target serious institutional readers — the people who'd
roll their eyes at a gradient background.

## 3. Founder — investor update

**Input**: monthly metrics, a few qualitative paragraphs, last month's
deck (you want to keep the structure).

**What Lasca does**: import last month's `.lasca` file, swap the data
in-place via the chat panel ("change Q3 to Q4 numbers in slide 4-7,
update the runway chart"), keep the same theme and structure. Export to
PDF and send.

**Why not Notion AI**: Notion's strengths are doc-shaped. Investor updates
are a hybrid — a few key visuals + concise prose — and decks are a more
honest format. Lasca treats this as the primary case.

**Why not duplicating last month's PowerPoint**: you can. But every duplicate
introduces little drift — fonts shift, spacing creeps, last-minute edits
break the visual hierarchy. Lasca's renderer guarantees the same
typography rules apply on every regeneration.

## 4. Product manager — internal proposal

**Input**: a Notion doc with a problem statement, a proposed solution,
some metrics, three open questions.

**What Lasca does**: paste the Notion text, pick the "Memo" theme, and
get a 6-8 page document that reads like an internal strategy memo from
a senior firm — quiet typography, well-anchored citations, and a
discussion section that signals "this is a recommendation, not a sales
pitch."

**Why not Google Docs**: Google Docs writing reads as Google Docs writing.
For an internal proposal that needs to *land* — to make a director say
"yes, do this" — the visual register matters as much as the substance.
The Memo theme codifies that register.

## 5. Researcher / academic — pre-print figure layout

**Input**: a paper draft with figures, captions, and reference list.

**What Lasca does**: report flow with the academic preset (a typography
register tuned for citation density), figure layouts that respect
side-note conventions, and a TOC + page numbering system that holds up
on a 30+ page document.

**Why not LaTeX**: LaTeX is unmatched for math typography but brittle for
non-math figures (charts, photos, mixed-CJK content). Lasca gets you
80% of LaTeX's typographic discipline with none of the toolchain pain,
*if* your work isn't equation-heavy.

---

## Where Lasca is the wrong tool

- **Equation-heavy academic papers** — use LaTeX.
- **Real-time multi-user editing of one deck** — Lasca is local-first by
  design; collaboration happens via export + review, not concurrent
  cursors.
- **Highly interactive presentations with embedded code/widgets** — use
  reveal.js or Slidev with custom HTML, those are designed for it.
- **One-page web landing pages** — Lasca produces decks and reports, not
  websites. Use Webflow, Framer, or hand-coded HTML.
- **Spreadsheet-driven dashboards** — use the spreadsheet. Lasca's chart
  rendering is for narrative emphasis on a known data point, not for
  exploratory data work.

---

If your use case isn't on this list and you're not sure, open a
[Discussion](https://github.com/lasca-ai/lasca/discussions) — we're
genuinely curious where Lasca lands or doesn't.
