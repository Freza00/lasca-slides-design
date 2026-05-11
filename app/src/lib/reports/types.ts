// ============================================================================
// Lasca — Report block model (Phase 3)
// ============================================================================
// ReportBlock replaces the 4 legacy report data types (ReportSectionData /
// ReportBodyData / ReportQuoteData stay for backward compat, but new content
// flows through ReportPageData.blocks).
//
// Design: inspired by the docx skill's block model — a single page is a
// heterogeneous array of blocks that the renderer walks top-to-bottom, with
// footnote-row always bottom-anchored.
//
// Block set (9 kinds):
//   - section-heading: H2 with optional number prefix + horizontal rule
//   - body-para:       paragraph with inline markdown + citation regex
//   - callout:         left-border accented side box
//   - quote-pull:      large italic pull-quote with optional attribution
//   - figure:          image + caption (new — legacy didn't support images)
//   - table-block:     inline table (reuses renderTable's inner structure)
//   - footnote-row:    small muted text at page bottom with border-top
//   - sidenote-group:  left 34% sidenote + right 66% body (preserves legacy
//                      ReportBodyData.offset+sidenote pattern)
//   - list-block:      structured bullet list (new — was freeform body text)
// ============================================================================

import type { TableData } from '../types';

export type ReportBlock =
  | { kind: 'section-heading'; text: string; number?: string }
  | { kind: 'body-para'; text: string }
  | { kind: 'callout'; text: string }
  | { kind: 'quote-pull'; text: string; attribution?: string; context?: string }
  | { kind: 'figure'; imageUrl: string; caption?: string; alt?: string }
  | { kind: 'table-block'; table: TableData }
  | { kind: 'footnote-row'; text: string }
  | { kind: 'sidenote-group'; body: string; sidenote: string }
  | { kind: 'list-block'; items: string[]; ordered?: boolean };

/** A single report page containing a heterogeneous block sequence. */
export interface ReportPageData {
  blocks: ReportBlock[];
}
