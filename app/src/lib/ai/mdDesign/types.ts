// ============================================================================
// Lasca — mdDesign types
// ============================================================================
// mdDesign is the intermediate artifact between mdContext (user's cleaned
// content) and Slide[] (final JSON).  It captures the agent's design
// decisions — layout per section, aesthetic direction, color, fonts,
// element choices, rationale — in a human-readable, human-editable format.
//
// Format: Slidev-compatible markdown.  A single `---`-delimited YAML block
// at the top of the document carries deck-level settings.  Each subsequent
// `---`-delimited YAML block introduces a new slide with per-slide settings,
// followed by the slide's body markdown.
//
// The three-stage pipeline (mdContext → mdDesign → Slide[]) lives in
// app/src/lib/ai/harness/orchestrator.ts; see that file for the rationale.
//
// Why Slidev format?
//   - Three years of production use → most edge cases already ironed out
//   - YAML front-matter is standard, parseable by gray-matter in one line
//   - Users can preview the mdDesign directly in VS Code with the Slidev
//     extension, without depending on Lasca's runtime — aligns with the
//     local-first pillar from §2
//   - Our custom `layout` values map to Lasca's 8 layouts; Slidev falls back
//     to `default` for unknown layouts, so the format degrades gracefully
// ============================================================================

import type { Layout, Theme } from '../../types';
import type { StylePresetId } from '../harness/types';

// ---------------------------------------------------------------------------
// Deck-level front-matter (first --- block at top of document)
// ---------------------------------------------------------------------------

/**
 * Allowed font-family identifiers.  Must match the CSS variables exposed by
 * `app/src/app/layout.tsx` (Fraunces / Bricolage Grotesque / Plus Jakarta
 * Sans / Lora) — see §5 design principles work added 2026-04-09.
 */
export type FontFamilyId =
  | 'fraunces'              // display serif, editorial
  | 'bricolage-grotesque'   // display sans, modern grotesque
  | 'plus-jakarta'          // body sans, refined neutral
  | 'lora';                 // body serif, editorial pair

/**
 * Deck-level design decisions — what the agent decided for the whole deck.
 * Parsed from the first YAML front-matter block at the very top of the
 * mdDesign document.
 *
 * All fields are optional because the refine + design steps may leave some
 * blank; downstream code falls back to preset defaults (stylePresets.ts) or
 * the design principles preamble (designPrinciples.ts) when a field is unset.
 */
export interface MdDesignDeckFrontMatter {
  /** Always 'lasca' for documents produced by our design step.  Slidev users
   *  who copy mdDesign into their own Slidev project will want to change this
   *  to a real Slidev theme name. */
  theme?: 'lasca';

  /** Which Lasca style preset applies to the whole deck.  Overrides any
   *  OrchestratorInput.presetId fallback when set. */
  preset?: StylePresetId;

  /** Color theme — maps to Lasca's themes.ts (`warm` / `cool` / `dark` /
   *  `original`).  Note this is separate from `preset`; a preset suggests
   *  a theme but users can override. */
  colorTheme?: Theme;

  /** Overall aesthetic emphasis.  Nudges per-slide choices toward one pole. */
  emphasis?: 'minimal' | 'bold' | 'editorial';

  /** Accent color override (hex string, e.g. "#c2410c").  When set,
   *  overrides the preset's default accent. */
  accent?: string;

  /** Font-family overrides.  When unset, inherits from preset. */
  fonts?: {
    display?: FontFamilyId;
    body?: FontFamilyId;
  };

  /** Free-text human-readable justification.  Shown in UI "why did the agent
   *  pick these?" panel.  The agent writes this during the design step so
   *  users can audit its reasoning. */
  rationale?: string;

  /** Things the agent must NOT produce on any slide — extracted from user's
   *  `demand.deck.bannedElements` and cascaded down. */
  bannedElements?: string[];

  /** Things the agent must include on every slide where applicable —
   *  extracted from user's `demand.deck.requiredElements`. */
  requiredElements?: string[];
}

// ---------------------------------------------------------------------------
// Per-slide front-matter (subsequent --- blocks, one per slide)
// ---------------------------------------------------------------------------

/**
 * Per-slide design decisions.  Each slide in mdDesign starts with its own
 * YAML front-matter block that specifies the layout and any layout-specific
 * field overrides.
 *
 * The `layout` field is mandatory — without it the agent's design step is
 * incomplete and the parser will reject the section.
 *
 * Additional string-keyed fields (`[key: string]: unknown`) are allowed so
 * the agent can pass layout-specific structured data (e.g. `bigNumber`,
 * `cards`, `quote`) directly via YAML instead of embedding it in the body
 * markdown.  The toSlides.ts adapter reads these fields preferentially when
 * building the final Slide JSON.
 */
export interface MdDesignSlideFrontMatter {
  /** Which Lasca layout to use for this slide.  Required. */
  layout: Layout;

  /** Free-text aesthetic direction for this specific slide, e.g. "oversized
   *  metric, small context below, warm accent line on the left".  Injected
   *  into the per-slide generation prompt as a hint. */
  aesthetic?: string;

  /** Human-readable justification for why this layout/aesthetic was chosen
   *  (e.g. "demand.perPage[0].preferredLayout forced this").  Audit trail. */
  rationale?: string;

  /** Per-slide background color override (hex or CSS color).  Rare. */
  background?: string;

  // ------- Layout-specific field overrides (optional, passed through) -------
  // When the agent wants to shape the data precisely instead of having
  // toSlides.ts derive it from the body markdown, it can put the values
  // directly in the front-matter.  toSlides.ts checks front-matter first,
  // then falls back to body parsing.

  /** big-number: main metric */
  bigNumber?: string;
  /** big-number: short label under the metric */
  bigNumberLabel?: string;
  /** big-number / others: secondary context line */
  context?: string;

  /** cover: overrides derived from #  title */
  title?: string;
  /** cover: subtitle line */
  subtitle?: string;
  /** cover: author attribution */
  author?: string;
  /** cover: footnote (small bottom-corner text) */
  footnote?: string;

  /** quote: the quoted text (usually derived from body blockquote) */
  quote?: string;
  /** quote: attribution / source */
  attribution?: string;

  /** Permissive escape hatch for future layout-specific fields */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Parsed structure (output of parser.ts)
// ---------------------------------------------------------------------------

/**
 * A single parsed slide section: the front-matter block plus the raw body
 * markdown that follows it.  The body is kept as a raw string so toSlides.ts
 * can parse bullets/bold/metrics however it needs without losing information.
 *
 * The slide's heading (# / ##) is still inside `body`; the parser does NOT
 * strip it.  Heading extraction is toSlides.ts's job, since different
 * layouts use the heading differently (cover vs per-section title).
 */
export interface ParsedSlide {
  frontMatter: MdDesignSlideFrontMatter;
  /** Raw markdown body text after the front-matter block, before the next
   *  `---` separator.  Trailing whitespace trimmed but internal structure
   *  preserved. */
  body: string;
}

/**
 * Complete parsed mdDesign document.  Produced by parser.ts's `parseMdDesign`
 * function.  Consumed by toSlides.ts and by the orchestrator for streaming
 * `design-ready` events to the client.
 */
export interface ParsedMdDesign {
  /** Deck-level settings from the first front-matter block.  Empty object
   *  if the document has no deck-level block. */
  deck: MdDesignDeckFrontMatter;

  /** One entry per slide, in document order. */
  slides: ParsedSlide[];

  /** The original mdDesign source string, preserved for round-tripping
   *  (e.g. when the user hand-edits mdDesign and we regenerate). */
  source: string;
}

// ---------------------------------------------------------------------------
// Error type (parser rejects malformed documents)
// ---------------------------------------------------------------------------

/**
 * Thrown by parser.ts when the mdDesign document is malformed.  The message
 * is human-readable and safe to surface in the UI ("第 3 页缺少 layout
 * 字段" etc.).  `slideIndex` is 0-based when the error is slide-specific;
 * -1 means deck-level or whole-document error.
 */
export class MdDesignParseError extends Error {
  constructor(
    message: string,
    public readonly slideIndex: number = -1,
  ) {
    super(message);
    this.name = 'MdDesignParseError';
  }
}
