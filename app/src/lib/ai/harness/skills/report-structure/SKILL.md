---
name: report-structure
description: Report composition guidance — block types, page budgets, citation pattern
scope: deck
activates-when: format=report AND preset.format !== 'report'
---

# Report Structure Skill

Guides the LLM on how to compose a block-based `report-page` — the Phase 3
replacement for separate `report-section` / `-body` / `-quote` layouts.

## When this skill fires

- `format === 'report'` (i.e. user requested a Letter/A4 document, not a slide deck)
- `preset.format !== 'report'` — channel-native report presets (currently
  just bilingual-report) own their visual system via a 870-line promptAppendix
  that already covers composition rules; we defer to it rather than double-
  inject. Slide-format presets carried into the report channel (legacy
  fallback) go through this skill.

## What it emits

A `promptAppendix` describing:

1. **Block kinds** — the 9 ReportBlock variants (section-heading, body-para,
   callout, quote-pull, figure, table-block, footnote-row, sidenote-group,
   list-block) with field shapes + 1-line when-to-use
2. **Composition rules** — at most 1 section-heading per page (top),
   footnote-row always last, at most 6 flow blocks per page, citation markers
   inline via `[信源：...]` / `[Source: ...]`
3. **JSON example** — a mixed 4-5 block page
4. **Deprecation note** — `report-section/-body/-quote` kept for backward
   compat only; new generation must use `report-page`

## What it does NOT do

- No runtime validation (that's future phase)
- No layout inference (reports don't go through inferLayout.ts)
- No theme/color decisions (that's theme-factory / brand-guidelines)
