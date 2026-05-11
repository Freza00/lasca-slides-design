# Version History

A high-level log of what landed when, before the public release. Companion
to [`ARCH.md`](./ARCH.md) (decisions and rationale) and the public
[`ROADMAP.md`](../ROADMAP.md) (what's planned next).

| Version | Date | Scope | Key files |
|---|---|---|---|
| V1 | 2026-02~03 | Initial Next.js migration: 8 layouts × 3 themes, editor, presenter, AI generate/edit/recheck | Everything under `app/src/` |
| v1 | ~2026-04-07 | PPTX faithful + IntentChooser + AI polish | `pptxFaithful.ts`, `IntentChooser.tsx`, `pptxPolish.ts`, `/api/ai/polish` |
| v1.1 | ~2026-04-07 | Faithful editable: drag + contentEditable sync + 3-theme filter | `Canvas.tsx`, `store.ts` |
| v1.2 | 2026-04-08 | `original` theme + image-escape layer + ChatPanel scope label fix | `Canvas.tsx`, `types.ts`, `themes.ts`, `Toolbar.tsx` |
| v2A | 2026-04-08 | IndexedDB persistence | `store.ts`, adds `idb-keyval` |
| v2B | 2026-04-08 | PDF import: `pdf-faithful` + `parsePdfToSlides` redesign | `pdfFaithful.ts`, `importFile.ts`, `IntentChooser.tsx` |
| v2C | 2026-04-08 | Letter/A4 PDF export via `@page` | `types.ts`, `exportPdf.ts` |
| v2.1 | 2026-04-08 | Adaptive Canvas sizing | `pageSize.ts`, `Canvas.tsx`, `Sidebar.tsx`, `Presenter.tsx`, `renderSlide.ts` |
| v2.2 | 2026-04-08 | Canvas zoom slider + PDF slide/report split | `Editor.tsx`, `Canvas.tsx`, `pdfFaithful.ts`, `IntentChooser.tsx`, `store.ts` |
| v2.3 | 2026-04-09 | PDF image extraction (operator list + CTM stack) + Map polyfill | `pdfFaithful.ts` |
| v3 | ~2026-04-10 | 5 new content layouts: title-body, split-image, icon-list, timeline, table | `types.ts`, `renderSlide.ts` |
| v4 | ~2026-04-10 | 13 chart/diagram layouts: bar-chart, line-chart, pie-chart, flowchart, funnel, pyramid, steps, matrix, versus, venn, bullseye, cycle, horizontal-bar-chart | `types.ts`, `renderSlide.ts` |
| v5 | ~2026-04-10 | 7 business/pitch layouts: agenda, team, logo-wall, pricing, device-mockup, section-break, stat-row | `types.ts`, `renderSlide.ts` |
| v6 | ~2026-04-10 | 5 compound layouts: featured-grid, bento, dashboard, hub-spoke, title-bento | `types.ts`, `renderSlide.ts` |
| v2.4 | 2026-04-11 | Report layouts (report-cover/section/body/quote), 8 new themes (stripe/linear/notion/vercel/apple/spotify/airbnb/ferrari), texture variants, create flow, auth/admin shell, OpenAI-first model abstraction | `types.ts`, `themes.ts`, `renderSlide.ts`, `ai/model.ts`, `components/create/` |
| AI harness v0.3 | 2026-04-08 | Scaffolding: clarifier/orchestrator/goldenRules/stylePresets. Part A done, Part B TBD | `lib/ai/harness/`, `app/harness-test/` |

## Out of scope (do NOT do without explicit ask)

- `.pptx` export — "一直到上线都不做 pptx 导出"
- Full-page PDF rasterization fallback (v2.3.1+)
- Per-slide pageSize (mixed horizontal + vertical)
- "Create blank Report" landing entry
- Zoom-to-cursor
- PDF image downscale for bandwidth
- Rotated/skewed image bbox math
- Real font resolution from pdfjs `fontName`

**Note**: Every entry above represents a decision that was iterated 3–5 times before landing. When changing a subsystem in the table, read the related code path *and* the matching `ARCH.md` section before refactoring — the obvious reshape is often what the original commit was trying *not* to do.
