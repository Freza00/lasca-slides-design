// ============================================================================
// Lasca — Slide adapter (Phase 1 + Phase 2 + Phase 3)
// ============================================================================
// Rewrites all legacy card-shaped layouts into
// `{layout: 'card-canvas', data: CardCanvasData}`. Phase 3 is a complete
// migration: every legacy `Layout` (except report-* / *-faithful) flows
// through this adapter and comes out as a card-canvas slide.
//
// Phase 1: bento
// Phase 2: three-cards, grid-cards, stat-row, dashboard
// Phase 2.5: featured-grid, title-bento (hero/title zone compositions)
// Phase 3: 25 remaining layouts (cover, big-number, two-column, stacked-bars,
//   quote, image, title-body, split-image, icon-list, timeline, table,
//   flowchart, funnel, pyramid, steps, matrix, versus, venn, bullseye, cycle,
//   agenda, team, logo-wall, pricing, device-mockup, section-break, hub-spoke)
// ============================================================================

import type {
  Slide,
  Layout,
  BentoData,
  BentoItem,
  ThreeCardsData,
  GridCardsData,
  StatRowData,
  StatItem,
  DashboardData,
  DashboardMetric,
  CardItem,
  GridCardItem,
  FeaturedGridData,
  FeaturedGridTile,
  TitleBentoData,
  TitleBentoCard,
  BarChartData,
  HorizontalBarChartData,
  LineChartData,
  PieChartData,
  StackedBarChartData,
  ScatterChartData,
  DualAxisBarChartData,
  HeatmapData,
  CoverData,
  BigNumberData,
  TwoColumnData,
  StackedBarsData,
  QuoteData,
  ImageData,
  TitleBodyData,
  SplitImageData,
  IconListData,
  TimelineData,
  TableData,
  FlowchartData,
  FunnelData,
  PyramidData,
  StepsData,
  MatrixData,
  VersusData,
  VennData,
  BullseyeData,
  CycleData,
  HubSpokeData,
  AgendaData,
  TeamData,
  LogoWallData,
  PricingData,
  DeviceMockupData,
  SectionBreakData,
  SvgFigureData,
} from '../types';
import type { Card, CardContent, CardCanvasData } from './types';
import { COMPOSITIONS, pickBentoComposition, pickComposition, generateSlots } from './compositions';
import { swapComposition } from './swap';

// ---- chart-split helpers (shared by bento / featured-grid / title-bento) ---
// When a slide has BOTH chart and non-chart items, route to split-cards-chart
// or stack-cards-chart so the chart gets a dedicated region instead of being
// cramped into a peer tile. Threshold: ≤2 non-chart → split (left cards, right
// chart); ≥3 non-chart → stack (top cards, bottom chart) so the card sub-grid
// has room to breathe vertically.

function hasChartAndNonChart(items: Array<{ chart?: unknown }>): boolean {
  let hasChart = false;
  let hasNonChart = false;
  for (const it of items) {
    if (it.chart) hasChart = true;
    else hasNonChart = true;
    if (hasChart && hasNonChart) return true;
  }
  return false;
}

// ---- density detection (shared by bento / featured-grid / title-bento) ----
// "Dense" = average body length per card exceeds what a small bento slot
// (~80–120px tall after padding) can fit. The composition picker uses this
// to downgrade to fewer-but-taller slots; adapt.ts then slices excess cards.
//
// Threshold (45 chars ≈ short-label tile body) chosen empirically after
// observing image-11 case where bodies averaging 60-70 chars overflowed
// title-bento right-side cards even though the previous 60 threshold
// passed them. Lowered from 60 → 45 so detailed-density paragraph content
// reliably triggers the dense → split-equal downgrade path.
const DENSE_BODY_CHAR_THRESHOLD = 45;

function isDense(bodies: Array<string | undefined | null>): boolean {
  const lengths = bodies.filter((b): b is string => !!b).map((b) => b.length);
  if (lengths.length === 0) return false;
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return avg > DENSE_BODY_CHAR_THRESHOLD;
}

function pickChartSplitComposition(
  nonChartCount: number,
): 'split-cards-chart' | 'stack-cards-chart' {
  return nonChartCount >= 3 ? 'stack-cards-chart' : 'split-cards-chart';
}

/** Wrap non-chart CardContents into a card-group for the 'cards' slot.
 *  Inner grid uses pickBentoComposition so 1..6 counts all render nicely.
 *  `dense` propagates the caller's density measurement so the inner grid
 *  also downgrades to fewer/larger slots when bodies are long. */
function buildCardGroupContent(
  nonChartContents: CardContent[],
  dense = false,
): Extract<CardContent, { role: 'card-group' }> {
  const innerCompositionId = pickBentoComposition(nonChartContents.length, { dense });
  const innerComp = COMPOSITIONS[innerCompositionId];
  const innerSlots = (innerComp.slots ?? generateSlots(nonChartContents.length))
    .slice(0, nonChartContents.length);
  const cards: Card[] = nonChartContents.map((content, i) => ({
    slot: innerSlots[i] ?? generateSlots(i + 1).slice(-1)[0],
    content,
  }));
  return { role: 'card-group', innerCompositionId, cards };
}

// ---- bento (Phase 1) -------------------------------------------------------

function bentoItemToCardContent(item: BentoItem): CardContent {
  if (item.chart) {
    return { role: 'chart', chart: item.chart, title: item.heading, body: item.body };
  }
  if (item.image_url) {
    return {
      role: 'media',
      imageUrl: item.image_url,
      badge: item.badge,
      title: item.heading,
      body: item.body,
    };
  }
  return {
    role: 'text',
    title: item.heading,
    body: item.body,
    badge: item.badge,
    icon: item.icon,
  };
}

function bentoToCardCanvas(bento: BentoData): CardCanvasData {
  const items = bento.items || [];
  const dense = isDense(items.map((it) => it.body));

  // Chart-split path: chart gets its own dedicated region instead of a peer
  // tile. Only the first chart goes to the 'chart' slot; any additional
  // charts stay in the group sub-grid (rare, rendered as small chart tiles).
  if (hasChartAndNonChart(items)) {
    const chartItem = items.find((it) => it.chart)!;
    const nonChartItems = items.filter((it) => !it.chart);
    const splitId = pickChartSplitComposition(nonChartItems.length);
    const nonChartContents = nonChartItems.map((it) => bentoItemToCardContent(it));
    const chartContent: CardContent = {
      role: 'chart',
      chart: chartItem.chart!,
      title: chartItem.heading,
      body: chartItem.body,
    };
    return {
      title: bento.title,
      compositionId: splitId,
      cards: [
        { slot: 'cards', content: buildCardGroupContent(nonChartContents, dense) },
        { slot: 'chart', content: chartContent },
      ],
    };
  }

  const compositionId = pickBentoComposition(items.length, { dense });
  const slots = COMPOSITIONS[compositionId].slots ?? [];

  const hiIdx =
    items.findIndex((it) => it.highlight) >= 0
      ? items.findIndex((it) => it.highlight)
      : 0;
  const orderedIdx = [
    hiIdx,
    ...items.map((_, i) => i).filter((i) => i !== hiIdx),
  ].slice(0, slots.length);

  const cards: Card[] = orderedIdx.map((origIdx, i) => ({
    slot: slots[i],
    content: bentoItemToCardContent(items[origIdx]),
  }));

  return { title: bento.title, compositionId, cards };
}

// ---- three-cards (Phase 2) -------------------------------------------------

function cardItemToTextContent(item: CardItem): CardContent {
  return {
    role: 'text',
    label: item.label,
    title: item.title,
    body: item.desc,
    badge: item.badge,
    align: 'center',
  };
}

function threeCardsToCardCanvas(src: ThreeCardsData): CardCanvasData {
  const items = (src.cards || []).slice(0, 3);
  const slots = generateSlots(items.length);
  const cards: Card[] = items.map((item, i) => {
    const hasImage = !!item.image_url;
    if (hasImage) {
      return {
        slot: slots[i],
        content: {
          role: 'media',
          imageUrl: item.image_url!,
          badge: item.badge,
          title: item.title,
          body: item.desc,
        },
      };
    }
    return { slot: slots[i], content: cardItemToTextContent(item) };
  });
  return { title: src.title, compositionId: 'grid-3col', cards };
}

// ---- grid-cards (Phase 2) --------------------------------------------------

function gridCardItemToContent(item: GridCardItem): CardContent {
  if (item.image_url) {
    return {
      role: 'media',
      imageUrl: item.image_url,
      badge: item.badge,
      title: item.title,
      body: item.desc,
    };
  }
  return {
    role: 'text',
    label: item.label,
    title: item.title,
    body: item.desc,
    badge: item.badge,
    align: 'center',
  };
}

function gridCardsToCardCanvas(src: GridCardsData): CardCanvasData {
  const items = src.cards || [];
  const compositionId = pickComposition('grid-cards', items.length, src.columns);
  const slots = generateSlots(items.length);
  const cards: Card[] = items.map((item, i) => ({
    slot: slots[i],
    content: gridCardItemToContent(item),
  }));
  return { title: src.title, compositionId, cards };
}

// ---- stat-like (stat-row + dashboard share field shape) --------------------

/** Shared converter for StatItem and DashboardMetric (identical field shape). */
function statLikeToCardContent(s: StatItem | DashboardMetric): CardContent {
  return {
    role: 'stat',
    value: s.value,
    title: s.label,
    delta: s.change,
    trend: s.trend,
    donut: s.donut,
  };
}

// ---- stat-row (Phase 2) ----------------------------------------------------

function statRowToCardCanvas(src: StatRowData): CardCanvasData {
  const stats = src.stats || [];
  const compositionId = pickComposition('stat-row', stats.length);
  const slots = generateSlots(stats.length);
  const cards: Card[] = stats.map((stat, i) => ({
    slot: slots[i],
    content: statLikeToCardContent(stat),
  }));
  return { title: src.title, compositionId, cards };
}

// ---- dashboard (Phase 2) ---------------------------------------------------

function dashboardToCardCanvas(src: DashboardData): CardCanvasData {
  const metrics = src.metrics || [];
  const compositionId = pickComposition('dashboard', metrics.length, src.columns);
  const slots = generateSlots(metrics.length);
  const cards: Card[] = metrics.map((metric, i) => ({
    slot: slots[i],
    content: statLikeToCardContent(metric),
  }));
  return { title: src.title, compositionId, cards };
}

// ---- featured-grid (Phase 2.5) ---------------------------------------------

function featuredTileToCardContent(tile: FeaturedGridTile): CardContent {
  if (tile.chart) {
    return { role: 'chart', chart: tile.chart };
  }
  if (tile.image_url) {
    return {
      role: 'media',
      imageUrl: tile.image_url,
      badge: tile.badge,
      title: tile.title,
      body: tile.desc,
    };
  }
  return {
    role: 'text',
    title: tile.title,
    body: tile.desc,
    badge: tile.badge,
    icon: tile.icon,
    align: 'center',
  };
}

function featuredGridToCardCanvas(src: FeaturedGridData): CardCanvasData {
  const tiles = src.tiles || [];
  const dense = isDense(tiles.map((t) => t.desc));
  // pickComposition clamps cols to 2..4; featured-grid legacy default
  // matches: cols = columns || min(n, 4) || 3.
  const compositionId = pickComposition('featured-grid', tiles.length, src.columns, { dense });

  // Single-slot fallback (n<=1): pickComposition returns 'full-center', which
  // has no 'hero' grid-area. Emitting a slot:'hero' card under that composition
  // pushes it into CSS implicit-grid territory (bottom-right corner). Merge
  // hero text + the lone tile (if any) into a single slot 'a' card instead.
  if (COMPOSITIONS[compositionId]?.mode === 'full-center') {
    const tile = tiles[0];
    const tileContent = tile ? featuredTileToCardContent(tile) : undefined;
    const mergedTitle = src.title ?? (tileContent && 'title' in tileContent ? tileContent.title : undefined);
    const mergedBody = src.subtitle ?? (tileContent && 'body' in tileContent ? tileContent.body : undefined);
    return {
      title: undefined,
      compositionId,
      cards: [
        {
          slot: 'a',
          content: {
            role: 'text',
            title: mergedTitle,
            body: mergedBody,
            footnote: src.body,
          },
        },
      ],
    };
  }

  // Chart-split path: at least one chart tile AND at least one non-chart tile.
  // hero zone is synthetic text — split-cards-chart has no 'hero' slot, so
  // promote src.title to the slide title; src.subtitle / src.body migrate
  // to the chart card's title / footnote so no content is lost.
  if (hasChartAndNonChart(tiles)) {
    const chartTile = tiles.find((t) => t.chart)!;
    const nonChartTiles = tiles.filter((t) => !t.chart);
    const splitId = pickChartSplitComposition(nonChartTiles.length);
    const nonChartContents = nonChartTiles.map((t) => featuredTileToCardContent(t));
    const chartContent: CardContent = {
      role: 'chart',
      chart: chartTile.chart!,
      title: src.subtitle ?? undefined,
      footnote: src.body ?? undefined,
    };
    return {
      title: src.title,
      compositionId: splitId,
      cards: [
        { slot: 'cards', content: buildCardGroupContent(nonChartContents, dense) },
        { slot: 'chart', content: chartContent },
      ],
    };
  }

  // Dense fallback: pickComposition returned 'split-equal' because tiles
  // are too text-heavy for hero-grid's small bottom-row tiles. hero-grid's
  // synthetic 'hero' slot doesn't exist in split-equal, so restructure:
  // promote src.title to the slide title, put hero subtitle/body in slot 'a',
  // put the most important tile in slot 'b'. Excess tiles drop — rendering
  // 5 cropped tiles is worse than 2 readable ones.
  if (compositionId === 'split-equal') {
    const firstTile = tiles[0];
    const tileContent = firstTile ? featuredTileToCardContent(firstTile) : undefined;
    return {
      title: src.title,
      compositionId,
      cards: [
        {
          slot: 'a',
          content: {
            role: 'text',
            body: src.subtitle,
            footnote: src.body,
          },
        },
        ...(tileContent ? [{ slot: 'b', content: tileContent }] : []),
      ],
    };
  }

  const tileSlots = generateSlots(tiles.length);
  const cards: Card[] = [
    // Synthetic hero card at slot 'hero' — renderCardCanvas routes it to
    // renderHeroZone via slotRoles. data-field path is `cards.0.content.*`
    // so inline editing writes back through Canvas.tsx's lodash set.
    {
      slot: 'hero',
      content: {
        role: 'text',
        title: src.title,
        body: src.subtitle,
        footnote: src.body,
      },
    },
    ...tiles.map((tile, i) => ({
      slot: tileSlots[i],
      content: featuredTileToCardContent(tile),
    })),
  ];
  // title:undefined so renderCardCanvas doesn't double-render the title
  // (hero card already carries it).
  return { title: undefined, compositionId, cards };
}

// ---- title-bento (Phase 2.5) -----------------------------------------------

function titleBentoCardToContent(card: TitleBentoCard): CardContent {
  if (card.chart) {
    return { role: 'chart', chart: card.chart };
  }
  if (card.image_url) {
    return {
      role: 'media',
      imageUrl: card.image_url,
      badge: card.badge,
      title: card.heading,
      body: card.body,
    };
  }
  return {
    role: 'text',
    title: card.heading,
    body: card.body,
    badge: card.badge,
  };
}

function titleBentoToCardCanvas(src: TitleBentoData): CardCanvasData {
  const cards = src.cards || [];
  const dense = isDense(cards.map((c) => c.body));
  const compositionId = pickComposition('title-bento', cards.length, undefined, { dense });

  // Single-slot fallback (n<=1): pickComposition returns 'full-center', which
  // has no 'title' grid-area. A slot:'title' card under that composition would
  // land in implicit-grid territory (bottom-right). Merge title text + the lone
  // user card (if any) into a single slot 'a' card instead.
  if (COMPOSITIONS[compositionId]?.mode === 'full-center') {
    const userCard = cards[0];
    const userContent = userCard ? titleBentoCardToContent(userCard) : undefined;
    const mergedBody = userContent && 'title' in userContent ? userContent.title : undefined;
    const mergedFootnote = userContent && 'body' in userContent ? userContent.body : src.footer;
    return {
      title: undefined,
      compositionId,
      cards: [
        {
          slot: 'a',
          content: {
            role: 'text',
            label: src.label,
            title: src.title,
            body: mergedBody,
            footnote: mergedFootnote ?? src.footer,
          },
        },
      ],
    };
  }

  // Chart-split path: promote src.title to the slide title; label / footer
  // attach to the chart card so they're not lost when the title zone drops.
  if (hasChartAndNonChart(cards)) {
    const chartCard = cards.find((c) => c.chart)!;
    const nonChartCards = cards.filter((c) => !c.chart);
    const splitId = pickChartSplitComposition(nonChartCards.length);
    const nonChartContents = nonChartCards.map((c) => titleBentoCardToContent(c));
    const chartContent: CardContent = {
      role: 'chart',
      chart: chartCard.chart!,
      title: chartCard.heading,
      body: chartCard.body,
      footnote: src.footer,
    };
    return {
      title: src.title,
      compositionId: splitId,
      cards: [
        { slot: 'cards', content: buildCardGroupContent(nonChartContents, dense) },
        { slot: 'chart', content: chartContent },
      ],
    };
  }

  // Dense fallback: pickComposition returned 'split-equal' because cards are
  // too text-heavy for title-grid's small tile column. Restructure: promote
  // src.title to slide title, put label/footer in slot 'a', first user card
  // in slot 'b'. Excess cards drop — see featured-grid for the same trade-off.
  if (compositionId === 'split-equal') {
    const firstCard = cards[0];
    const cardContent = firstCard ? titleBentoCardToContent(firstCard) : undefined;
    return {
      title: src.title,
      compositionId,
      cards: [
        {
          slot: 'a',
          content: {
            role: 'text',
            label: src.label,
            footnote: src.footer,
          },
        },
        ...(cardContent ? [{ slot: 'b', content: cardContent }] : []),
      ],
    };
  }

  const tileSlots = generateSlots(cards.length);
  const cardsOut: Card[] = [
    // Synthetic title card at slot 'title' — carries label + heading + footer
    // (legacy: label 13px, title 28-44 auto, footer 14px bottom-aligned).
    // renderCardCanvas routes via slotRoles to renderTitleZone.
    {
      slot: 'title',
      content: {
        role: 'text',
        label: src.label,
        title: src.title,
        footnote: src.footer,
      },
    },
    ...cards.map((c, i) => ({
      slot: tileSlots[i],
      content: titleBentoCardToContent(c),
    })),
  ];
  return { title: undefined, compositionId, cards: cardsOut };
}

// ---- chart-as-whole-page (Phase 6) -----------------------------------------
// Four legacy full-page chart layouts collapse onto one card-canvas with the
// `chart-full` composition: a single slot fills the entire canvas, bare
// surface, no padding. chart role detects `composition.fullBleed` and renders
// at canvas-sized dimensions. Slide title (if present) and footnote (as the
// chart card's caption) carry over via standard field paths.

type AnyChartData = BarChartData | HorizontalBarChartData | LineChartData | PieChartData | StackedBarChartData | ScatterChartData | DualAxisBarChartData | HeatmapData;

function chartFullToCardCanvas(src: AnyChartData, layout: Layout): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'chart',
          chart: { type: layout, data: src as unknown as Record<string, unknown> },
          footnote: src.footnote,
        },
      },
    ],
  };
}

// ---- Phase 3: single-slot vertical-center adapters -------------------------

function coverToCardCanvas(src: CoverData): CardCanvasData {
  return {
    title: undefined,
    compositionId: 'full-center',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'text',
          title: src.title,
          body: src.subtitle,
          footnote: src.footnote,
          label: src.author,
          align: 'center',
        },
      },
    ],
  };
}

function sectionBreakToCardCanvas(src: SectionBreakData): CardCanvasData {
  // Drop src.number when the title already carries a Chinese or English
  // chapter marker ("一、/二、..." or "Chapter N / Part N / Section N").
  // The LLM frequently populates number with an Arabic index that visually
  // duplicates the Chinese section name — Design call: "汉字已经写了,
  // 阿拉伯数字毫无必要". Matches the same heuristic in renderSectionBreak.
  const rawNumber = (src.number ?? '').trim();
  const titleStr = (src.title ?? '').trim();
  const titleHasChapterMarker =
    /^[一二三四五六七八九十百千]+[、．.\s]/.test(titleStr)
    || /^(chapter|part|section|ch\.?|§)\s*[\dIVX]+/i.test(titleStr);
  const label = rawNumber && !titleHasChapterMarker ? rawNumber : undefined;
  return {
    title: undefined,
    compositionId: 'full-center',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'text',
          label,
          title: src.title,
          body: src.subtitle,
          align: 'center',
        },
      },
    ],
  };
}

function quoteToCardCanvas(src: QuoteData): CardCanvasData {
  return {
    title: undefined,
    compositionId: 'full-center',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'quote',
          quote: src.quote,
          footnote: src.author,
          body: src.body,
        },
      },
    ],
  };
}

function deviceMockupToCardCanvas(src: DeviceMockupData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-center',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'media',
          imageUrl: src.image_url ?? '',
          title: src.title,
          body: src.subtitle,
        },
      },
    ],
  };
}

// ---- Phase 3: single-slot fullBleed adapters (legacy short-circuit) --------

function bigNumberToCardCanvas(src: BigNumberData): CardCanvasData {
  return {
    title: undefined,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'big-number',
          number: src.number,
          title: src.text,
          footnote: src.footnote,
          highlight: src.highlight,
        },
      },
    ],
  };
}

function tableToCardCanvas(src: TableData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'table',
          columns: src.headers,
          rows: src.rows,
          footnote: src.footnote,
          highlight: src.highlight,
        },
      },
    ],
  };
}

function iconListToCardCanvas(src: IconListData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'list',
          style: 'icon',
          items: (src.items || []).map((it) => ({
            icon: it.icon,
            title: it.text,
            desc: it.sub,
          })),
        },
      },
    ],
  };
}

function agendaToCardCanvas(src: AgendaData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'list',
          style: 'number',
          ordered: true,
          items: (src.items || []).map((it) => ({
            title: it.text,
            desc: it.sub,
          })),
        },
      },
    ],
  };
}

function stackedBarsToCardCanvas(src: StackedBarsData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'list',
          style: 'bar',
          items: (src.bars || []).map((bar) => ({
            title: bar.text,
            color: bar.color,
          })),
        },
      },
    ],
  };
}

function timelineToCardCanvas(src: TimelineData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: { role: 'timeline', events: src.events || [] },
      },
    ],
  };
}

function flowchartToCardCanvas(src: FlowchartData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'flowchart',
          steps: src.steps || [],
          direction: src.direction,
          footnote: src.footnote,
          groupLabel: src.groupLabel,
        },
      },
    ],
  };
}

function funnelToCardCanvas(src: FunnelData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [{ slot: 'a', content: { role: 'funnel', items: src.items || [], footnote: src.footnote } }],
  };
}

function pyramidToCardCanvas(src: PyramidData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [{ slot: 'a', content: { role: 'pyramid', items: src.items || [], footnote: src.footnote, groupLabel: src.groupLabel } }],
  };
}

function stepsToCardCanvas(src: StepsData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [{ slot: 'a', content: { role: 'steps', items: src.items || [], footnote: src.footnote, groupLabel: src.groupLabel } }],
  };
}

function matrixToCardCanvas(src: MatrixData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'matrix',
          xAxis: src.xAxis,
          yAxis: src.yAxis,
          topLeft: src.topLeft,
          topRight: src.topRight,
          bottomLeft: src.bottomLeft,
          bottomRight: src.bottomRight,
          footnote: src.footnote,
        },
      },
    ],
  };
}

function versusToCardCanvas(src: VersusData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'versus',
          left: src.left,
          right: src.right,
          footnote: src.footnote,
        },
      },
    ],
  };
}

function vennToCardCanvas(src: VennData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: { role: 'venn', items: src.items || [], overlap: src.overlap },
      },
    ],
  };
}

function bullseyeToCardCanvas(src: BullseyeData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      { slot: 'a', content: { role: 'bullseye', items: src.items || [] } },
    ],
  };
}

function cycleToCardCanvas(src: CycleData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [{ slot: 'a', content: { role: 'cycle', items: src.items || [], footnote: src.footnote } }],
  };
}

function hubSpokeToCardCanvas(src: HubSpokeData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'hub-spoke',
          center: src.center,
          spokes: src.spokes || [],
          footnote: src.footnote,
        },
      },
    ],
  };
}

// ---- Phase 3: media / text fulls -------------------------------------------

function imageToCardCanvas(src: ImageData): CardCanvasData {
  return {
    title: undefined,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'media',
          imageUrl: src.image_url ?? '',
          title: src.title,
          body: src.subtitle,
          overlay: src.overlay,
        },
      },
    ],
  };
}

function titleBodyToCardCanvas(src: TitleBodyData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-center',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'text',
          body: src.body,
          footnote: src.footnote,
        },
      },
    ],
  };
}

// ---- Phase 3: two-pane adapters --------------------------------------------

function twoColumnToCardCanvas(src: TwoColumnData): CardCanvasData {
  const chart = src.chart;
  const chartOnLeft = src.chartPosition === 'left';
  const leftContent: CardContent = chart && chartOnLeft
    ? { role: 'chart', chart, footnote: src.left.sub }
    : {
        role: 'text',
        title: src.left.heading,
        body: src.left.content,
        footnote: src.left.sub,
      };
  const rightContent: CardContent = chart && !chartOnLeft
    ? { role: 'chart', chart, footnote: src.right.sub }
    : {
        role: 'text',
        title: src.right.heading,
        body: src.right.content,
        footnote: src.right.sub,
      };
  return {
    title: src.title,
    compositionId: 'split-equal',
    cards: [
      { slot: 'a', content: leftContent },
      { slot: 'b', content: rightContent },
    ],
  };
}

function splitImageToCardCanvas(src: SplitImageData): CardCanvasData {
  const pos = src.imagePosition;
  const mediaContent: CardContent = src.chart
    ? { role: 'chart', chart: src.chart }
    : { role: 'media', imageUrl: src.image_url ?? '' };
  const textContent: CardContent = {
    role: 'text',
    title: src.title,
    body: src.body,
  };
  // Vertical stacks route to stack-text-media / stack-media-text compositions.
  // Horizontal stays on split-media where card order picks the column.
  if (pos === 'top') {
    // Media on top, text below.
    return {
      title: undefined,
      compositionId: 'stack-media-text',
      cards: [
        { slot: 'a', content: mediaContent },
        { slot: 'b', content: textContent },
      ],
    };
  }
  if (pos === 'bottom') {
    // 上文下图: text on top, media below — analyst default.
    return {
      title: undefined,
      compositionId: 'stack-text-media',
      cards: [
        { slot: 'a', content: textContent },
        { slot: 'b', content: mediaContent },
      ],
    };
  }
  const imageOnLeft = pos === 'left';
  return {
    title: undefined,
    compositionId: 'split-media',
    cards: imageOnLeft
      ? [
          { slot: 'a', content: mediaContent },
          { slot: 'b', content: textContent },
        ]
      : [
          { slot: 'a', content: textContent },
          { slot: 'b', content: mediaContent },
        ],
  };
}

// ---- Phase 3: business layouts (aliased to existing grid / row) ------------

function teamToCardCanvas(src: TeamData): CardCanvasData {
  const members = src.members || [];
  const compositionId = pickComposition('team', members.length);
  const slots = generateSlots(members.length);
  const cards: Card[] = members.map((m, i) => ({
    slot: slots[i],
    content: {
      role: 'media',
      imageUrl: m.avatar ?? '',
      title: m.name,
      body: m.role,
    },
  }));
  return { title: src.title, compositionId, cards };
}

function logoWallToCardCanvas(src: LogoWallData): CardCanvasData {
  const logos = src.logos || [];
  const compositionId = pickComposition('logo-wall', logos.length);
  const slots = generateSlots(logos.length);
  const cards: Card[] = logos.map((logo, i) => ({
    slot: slots[i],
    content: {
      role: 'media',
      imageUrl: logo.image_url ?? '',
      title: logo.name,
    },
  }));
  return { title: src.title, compositionId, cards };
}

function svgFigureToCardCanvas(src: SvgFigureData): CardCanvasData {
  return {
    title: src.title,
    compositionId: 'full-bleed',
    cards: [
      {
        slot: 'a',
        content: {
          role: 'svg-figure',
          svg: src.svg || '',
          caption: src.caption,
          aspectRatio: src.aspectRatio,
        },
      },
    ],
  };
}

function pricingToCardCanvas(src: PricingData): CardCanvasData {
  const tiers = src.tiers || [];
  const compositionId = pickComposition('pricing', tiers.length);
  const slots = generateSlots(tiers.length);
  const cards: Card[] = tiers.map((tier, i) => ({
    slot: slots[i],
    content: {
      role: 'text',
      label: tier.price + (tier.period ? tier.period : ''),
      title: tier.name,
      body: (tier.features || []).map((f) => `• ${f}`).join('\n'),
      footnote: tier.cta,
      badge: tier.highlight ? 'Recommended' : undefined,
      align: 'center',
    },
  }));
  return { title: src.title, compositionId, cards };
}

// ---- unified adapter entry -------------------------------------------------

/**
 * Phase 3 — complete migration. Every card-shaped legacy layout flows
 * through here and comes out as `layout: 'card-canvas'`. The flag guard
 * from Phase 1/2 has been removed; the card system is always on.
 *
 * `compositionHint`, when present, overrides the default `pickComposition`
 * choice for layouts where multiple compositions are valid (e.g. user
 * picking a bento variant explicitly from the UI).
 */
export function maybeAdaptToCardCanvas(slide: Slide, compositionHint?: string): Slide {
  // Trace the pre-adapt layout for every slide that enters the card pipeline.
  // Uses console.error because Next.js 16 dev silently swallows console.log /
  // console.info from API routes — only .error reaches piped stdout. Diagnostic
  // output, not a real error. Gated by LASCA_TRACE=1 (double-gated with
  // NODE_ENV to keep production quiet).
  if (
    typeof process !== 'undefined'
    && process.env?.LASCA_TRACE === '1'
    && process.env?.NODE_ENV !== 'production'
  ) {
    console.error(`[LASCA_TRACE] maybeAdaptToCardCanvas ${JSON.stringify({
      stage: 'maybeAdaptToCardCanvas',
      preAdaptLayout: slide.layout,
      compositionHint: compositionHint ?? null,
    })}`);
  }
  const adapted = adaptInner(slide);
  if (compositionHint && adapted.layout === 'card-canvas' && COMPOSITIONS[compositionHint]) {
    // Route the hint through swapComposition so cards that don't fit the
    // target land in `sidelined[]` rather than getting silently clipped by
    // the renderer's rawCards.slice. This makes legacy→narrow swaps
    // lossless (editor reverts will restore the extras).
    const d = adapted.data as CardCanvasData;
    const swapped = swapComposition(d, compositionHint);
    return { ...adapted, data: swapped };
  }
  return adapted;
}

function adaptInner(slide: Slide): Slide {
  switch (slide.layout) {
    // --- Phase 1/2: already-migrated layouts --------------------------------
    case 'bento':
      return { ...slide, layout: 'card-canvas', data: bentoToCardCanvas(slide.data as BentoData) };
    case 'three-cards':
      return { ...slide, layout: 'card-canvas', data: threeCardsToCardCanvas(slide.data as ThreeCardsData) };
    case 'grid-cards':
      return { ...slide, layout: 'card-canvas', data: gridCardsToCardCanvas(slide.data as GridCardsData) };
    case 'stat-row':
      return { ...slide, layout: 'card-canvas', data: statRowToCardCanvas(slide.data as StatRowData) };
    case 'dashboard':
      return { ...slide, layout: 'card-canvas', data: dashboardToCardCanvas(slide.data as DashboardData) };
    case 'featured-grid':
      return { ...slide, layout: 'card-canvas', data: featuredGridToCardCanvas(slide.data as FeaturedGridData) };
    case 'title-bento':
      return { ...slide, layout: 'card-canvas', data: titleBentoToCardCanvas(slide.data as TitleBentoData) };

    // --- Phase 6: full-page chart layouts -----------------------------------
    case 'bar-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as BarChartData, 'bar-chart') };
    case 'horizontal-bar-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as HorizontalBarChartData, 'horizontal-bar-chart') };
    case 'line-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as LineChartData, 'line-chart') };
    case 'pie-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as PieChartData, 'pie-chart') };
    case 'stacked-bar-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as StackedBarChartData, 'stacked-bar-chart') };
    case 'scatter-chart':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as ScatterChartData, 'scatter-chart') };
    case 'dual-axis-bar':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as DualAxisBarChartData, 'dual-axis-bar') };
    case 'heatmap':
      return { ...slide, layout: 'card-canvas', data: chartFullToCardCanvas(slide.data as HeatmapData, 'heatmap') };

    // --- Phase 3: single-slot vertical-center -------------------------------
    case 'cover': {
      const coverData = slide.data as CoverData;
      // Family-driven cover variants (lookbook-numbered / -hero / -bold,
      // private-banking-split / -classic) skip the legacy card-canvas adapter
      // so renderCover routes them to the family-specific renderer. Default
      // centered cover (no variant) still goes through coverToCardCanvas.
      if (coverData.coverVariant) {
        return slide;
      }
      return { ...slide, layout: 'card-canvas', data: coverToCardCanvas(coverData) };
    }
    case 'section-break':
      return { ...slide, layout: 'card-canvas', data: sectionBreakToCardCanvas(slide.data as SectionBreakData) };
    case 'quote':
      return { ...slide, layout: 'card-canvas', data: quoteToCardCanvas(slide.data as QuoteData) };
    case 'device-mockup':
      return { ...slide, layout: 'card-canvas', data: deviceMockupToCardCanvas(slide.data as DeviceMockupData) };

    // --- Phase 3: single-slot fullBleed (legacy short-circuit) --------------
    case 'big-number':
      return { ...slide, layout: 'card-canvas', data: bigNumberToCardCanvas(slide.data as BigNumberData) };
    case 'table':
      return { ...slide, layout: 'card-canvas', data: tableToCardCanvas(slide.data as TableData) };
    case 'icon-list':
      return { ...slide, layout: 'card-canvas', data: iconListToCardCanvas(slide.data as IconListData) };
    case 'agenda':
      return { ...slide, layout: 'card-canvas', data: agendaToCardCanvas(slide.data as AgendaData) };
    case 'stacked-bars':
      return { ...slide, layout: 'card-canvas', data: stackedBarsToCardCanvas(slide.data as StackedBarsData) };
    case 'timeline':
      return { ...slide, layout: 'card-canvas', data: timelineToCardCanvas(slide.data as TimelineData) };
    case 'flowchart':
      return { ...slide, layout: 'card-canvas', data: flowchartToCardCanvas(slide.data as FlowchartData) };
    case 'funnel':
      return { ...slide, layout: 'card-canvas', data: funnelToCardCanvas(slide.data as FunnelData) };
    case 'pyramid':
      return { ...slide, layout: 'card-canvas', data: pyramidToCardCanvas(slide.data as PyramidData) };
    case 'steps':
      return { ...slide, layout: 'card-canvas', data: stepsToCardCanvas(slide.data as StepsData) };
    case 'matrix':
      return { ...slide, layout: 'card-canvas', data: matrixToCardCanvas(slide.data as MatrixData) };
    case 'versus':
      return { ...slide, layout: 'card-canvas', data: versusToCardCanvas(slide.data as VersusData) };
    case 'venn':
      return { ...slide, layout: 'card-canvas', data: vennToCardCanvas(slide.data as VennData) };
    case 'bullseye':
      return { ...slide, layout: 'card-canvas', data: bullseyeToCardCanvas(slide.data as BullseyeData) };
    case 'cycle':
      return { ...slide, layout: 'card-canvas', data: cycleToCardCanvas(slide.data as CycleData) };
    case 'hub-spoke':
      return { ...slide, layout: 'card-canvas', data: hubSpokeToCardCanvas(slide.data as HubSpokeData) };

    // --- Phase 3: media / text fulls ---------------------------------------
    case 'image':
      return { ...slide, layout: 'card-canvas', data: imageToCardCanvas(slide.data as ImageData) };
    case 'title-body':
      return { ...slide, layout: 'card-canvas', data: titleBodyToCardCanvas(slide.data as TitleBodyData) };

    // --- Phase 3: two-pane --------------------------------------------------
    case 'two-column':
      return { ...slide, layout: 'card-canvas', data: twoColumnToCardCanvas(slide.data as TwoColumnData) };
    case 'split-image':
      return { ...slide, layout: 'card-canvas', data: splitImageToCardCanvas(slide.data as SplitImageData) };

    // --- Phase 3: business layouts -----------------------------------------
    case 'team':
      return { ...slide, layout: 'card-canvas', data: teamToCardCanvas(slide.data as TeamData) };
    case 'logo-wall':
      return { ...slide, layout: 'card-canvas', data: logoWallToCardCanvas(slide.data as LogoWallData) };
    case 'pricing':
      return { ...slide, layout: 'card-canvas', data: pricingToCardCanvas(slide.data as PricingData) };

    // --- C2 — svg-figure escape hatch (inline sanitized SVG) --------------
    case 'svg-figure':
      return { ...slide, layout: 'card-canvas', data: svgFigureToCardCanvas(slide.data as SvgFigureData) };

    // Already card-canvas (re-entry), or non-card layouts (report-* / faithful
    // / card-canvas / column) — pass through.
    default:
      return slide;
  }
}

/**
 * Legacy alias kept for existing call sites (pipeline.ts, toSlides.ts) that
 * import the older name. Safe to remove after one release.
 */
export const maybeAdaptBentoToCardCanvas = maybeAdaptToCardCanvas;
