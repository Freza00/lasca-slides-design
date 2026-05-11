// ============================================================================
// Lasca — Card primitive model (card-canvas era)
// ============================================================================
// A Card is the primitive unit. Every card shares three optional functional
// zones — title / body / footnote — on top of role-specific data.
//
// Composition = CSS Grid template that splits the slide into named slots.
// CardCanvasData = { title?, compositionId, cards[] }.
//
// 18 canonical compositions live in compositions.ts (6 categories: full,
// split, stack, grid, bento, banner). Legacy layouts funnel through
// adapt.ts into this model.
// ============================================================================

import type { ChartEmbed, BarColor, GroupLabel } from '../types';

export type CardRole =
  | 'text' | 'stat' | 'chart' | 'media' | 'quote'
  | 'list' | 'table' | 'big-number'
  | 'funnel' | 'pyramid' | 'matrix' | 'versus' | 'venn'
  | 'bullseye' | 'cycle' | 'hub-spoke' | 'flowchart' | 'steps' | 'timeline';

/** The three functional zones every card can use. Role-specific fields live
 *  beside these. `title` is the card-level heading (distinct from the slide
 *  title in CardCanvasData.title). */
export interface CardZones {
  title?: string;
  body?: string;
  footnote?: string;
}

/** Unified list-item shape covering icon-list / agenda / stacked-bars. */
export interface ListItem {
  icon?: string;
  label?: string;
  title: string;
  desc?: string;
  value?: string | number;
  /** For style='bar' — tile palette key. */
  color?: BarColor;
}

export type CardContent =
  | ({
      role: 'text';
      badge?: string;
      icon?: string;
      /** Hero/numeric label displayed above the title (three-cards '01', grid-cards 'A'). */
      label?: string;
      /** Text alignment for the card block. */
      align?: 'left' | 'center';
    } & CardZones)
  | ({
      role: 'stat';
      value: string;
      delta?: string;
      trend?: number[];
      donut?: number;
    } & CardZones)
  | ({
      role: 'chart';
      chart: ChartEmbed;
    } & CardZones)
  | ({
      role: 'media';
      imageUrl: string;
      overlay?: string;
      badge?: string;
    } & CardZones)
  | ({
      role: 'quote';
      quote: string;
    } & CardZones)
  | ({
      role: 'list';
      items: ListItem[];
      ordered?: boolean;
      style?: 'icon' | 'number' | 'bar';
    } & CardZones)
  | ({
      role: 'table';
      columns: string[];
      rows: string[][];
      /** Column index highlighted with accent background. */
      highlight?: number;
    } & CardZones)
  | ({
      role: 'big-number';
      number: string;
      highlight?: string;
    } & CardZones)
  | ({ role: 'funnel'; items: { text: string }[] } & CardZones)
  | ({ role: 'pyramid'; items: { text: string; sidenote?: string; style?: 'solid' | 'dashed' }[]; groupLabel?: GroupLabel } & CardZones)
  | ({
      role: 'matrix';
      xAxis: string;
      yAxis: string;
      topLeft: string;
      topRight: string;
      bottomLeft: string;
      bottomRight: string;
    } & CardZones)
  | ({
      role: 'versus';
      left: { heading: string; points: string[] };
      right: { heading: string; points: string[] };
    } & CardZones)
  | ({
      role: 'venn';
      items: { text: string }[];
      overlap?: string;
    } & CardZones)
  | ({ role: 'bullseye'; items: { text: string }[] } & CardZones)
  | ({ role: 'cycle'; items: { text: string; sidenote?: string; transitionLabel?: string }[] } & CardZones)
  | ({
      role: 'hub-spoke';
      center: string;
      spokes: { text: string; desc?: string; sidenote?: string }[];
    } & CardZones)
  | ({
      role: 'flowchart';
      steps: { text: string; style?: 'solid' | 'dashed'; transitionLabel?: string }[];
      direction?: 'horizontal' | 'vertical';
      groupLabel?: GroupLabel;
    } & CardZones)
  | ({
      role: 'steps';
      items: { label: string; text: string; desc?: string; sidenote?: string; transitionLabel?: string }[];
      groupLabel?: GroupLabel;
    } & CardZones)
  | ({
      role: 'timeline';
      events: { label: string; title: string; desc?: string }[];
    } & CardZones)
  // svg-figure is the C2 escape hatch: when no structured diagram can
  // express a metaphorical / freeform visual (bell curves, bridge diagrams,
  // custom stage maps), the LLM emits sanitized inline SVG. Text inside the
  // SVG is NOT editable via data-field binding — the figure is a single
  // atomic block, swapped whole or not at all. Caption lives below.
  | ({
      role: 'svg-figure';
      /** Raw SVG markup. Passed through `sanitizeSvg()` before innerHTML. */
      svg: string;
      /** Optional caption rendered below the figure (§4.7 requires one). */
      caption?: string;
      /** Hint for the outer aspect ratio; defaults to viewBox / 16:9. */
      aspectRatio?: number;
    } & CardZones)
  // A card-group is a slot whose rendered content is itself a grid of cards.
  // Used by split-cards-chart / stack-cards-chart to hold the non-chart cards
  // while the chart gets its own dedicated slot. No CardZones — groups have
  // no title/body/footnote of their own (slide title or inner cards carry them).
  | {
      role: 'card-group';
      /** compositionId of the inner grid (e.g. 'bento-1+2', 'grid-3col'). */
      innerCompositionId: string;
      /** The nested cards. Slots match innerCompositionId's slot names. */
      cards: Card[];
    };

export interface Card {
  /** Slot name matching Composition.slots (e.g. 'a', 'b', 'c'). */
  slot: string;
  content: CardContent;
}

/** Behavior hint emitted from a Composition to renderCardCanvas. */
export type CompositionMode =
  | 'full-bleed'    // single slot, no padding, dispatch by role to legacy renderer
  | 'full-center'   // single slot, centered vertically + horizontally
  | 'split'         // 2-slot horizontal split (equal / 60-40 / 40-60 / media)
  | 'stack'         // 2-slot vertical stack (text-top+media-bottom or reverse)
  | 'grid'          // uniform N-col grid
  | 'bento'         // asymmetric grid with hero tile
  | 'hero-grid'     // hero banner on top + tile row below
  | 'title-grid'    // left title column + right tile grid
  | 'split-chart'   // 2-slot: cards-group region + dedicated chart region (horizontal)
  | 'stack-chart';  // 2-slot: cards-group region + dedicated chart region (vertical)

export interface Composition {
  id: string;
  mode: CompositionMode;
  /** Full CSS for the grid container (may be computed per card count — see
   *  `adaptive`). When present this is used verbatim; otherwise renderer
   *  synthesizes one from mode + card count. */
  gridTemplate?: string;
  /** Canonical slot names for fixed compositions. Variable-slot compositions
   *  (grid / hero-grid / title-grid) generate slot names from card count. */
  slots?: string[];
  /** Slots that receive larger type / more padding (hero tiles). */
  largeSlots?: string[];
  gap?: number;
  /** When true, slot names come from `generateSlots(cardCount)`. */
  variableSlots?: boolean;
}

export interface CardCanvasData {
  title?: string;
  compositionId: string;
  cards: Card[];
  /** Cards displaced by a shrink swap. Preserved so data survives
   *  composition changes; renderer ignores them and shows a badge. */
  sidelined?: Card[];
}
