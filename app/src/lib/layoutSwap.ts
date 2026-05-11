// ============================================================================
// Lasca — Client-side Layout Swap (no LLM)
// ============================================================================
// Extracts semantic content from any native layout's data, then re-injects it
// into a different layout's schema. Instant, free, no API call.
// ============================================================================

import type { Layout, ChartEmbed } from './types';

// ---------------------------------------------------------------------------
// Generic content — the "lingua franca" between layouts
// ---------------------------------------------------------------------------

export interface GenericContent {
  title: string;
  subtitle: string;
  body: string;                // paragraph text
  items: Array<{ label: string; title: string; desc: string }>;
  footnote: string;
  imageUrl: string;
  chart?: ChartEmbed;          // carried forward for split-image / two-column embeds
}

type D = Record<string, unknown>;

function str(v: unknown): string { return typeof v === 'string' ? v : ''; }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

// ---------------------------------------------------------------------------
// Extract: any layout data → GenericContent
// ---------------------------------------------------------------------------

function extractContent(data: D, layout: Layout): GenericContent {
  const g: GenericContent = { title: '', subtitle: '', body: '', items: [], footnote: '', imageUrl: '' };

  switch (layout) {
    case 'cover':
      g.title = str(data.title);
      g.subtitle = str(data.subtitle);
      g.footnote = [str(data.footnote), str(data.author)].filter(Boolean).join(' · ');
      break;

    case 'big-number':
      g.title = str(data.number);
      g.subtitle = str(data.text);
      g.footnote = str(data.footnote);
      g.body = str(data.highlight);
      break;

    case 'three-cards':
      g.title = str(data.title);
      g.items = arr(data.cards).map((c: unknown) => {
        const card = c as D;
        return { label: str(card.label), title: str(card.title), desc: str(card.desc) };
      });
      break;

    case 'two-column':
      g.title = str(data.title);
      g.footnote = str(data.footer);
      { const left = (data.left ?? {}) as D;
        const right = (data.right ?? {}) as D;
        g.items = [
          { label: '', title: str(left.heading), desc: str(left.content) },
          { label: '', title: str(right.heading), desc: str(right.content) },
        ];
      }
      if (data.chart) g.chart = data.chart as ChartEmbed;
      break;

    case 'stacked-bars':
      g.title = str(data.title);
      g.items = arr(data.bars).map((b: unknown) => {
        const bar = b as D;
        return { label: str(bar.color), title: str(bar.text), desc: '' };
      });
      break;

    case 'grid-cards':
      g.title = str(data.title);
      g.footnote = str(data.footer);
      g.items = arr(data.cards).map((c: unknown) => {
        const card = c as D;
        return { label: str(card.label), title: str(card.title), desc: str(card.desc) };
      });
      break;

    case 'quote':
      g.body = str(data.quote);
      g.subtitle = str(data.body);
      g.footnote = str(data.author);
      g.title = str(data.highlight);
      break;

    case 'image':
      g.title = str(data.title);
      g.subtitle = str(data.subtitle);
      g.imageUrl = str(data.image_url);
      break;

    case 'title-body':
      g.title = str(data.title);
      g.body = str(data.body);
      g.footnote = str(data.footnote);
      break;

    case 'split-image':
      g.title = str(data.title);
      g.body = str(data.body);
      g.imageUrl = str(data.image_url);
      if (data.chart) g.chart = data.chart as ChartEmbed;
      break;

    case 'icon-list':
      g.title = str(data.title);
      g.items = arr(data.items).map((it: unknown) => {
        const item = it as D;
        return { label: str(item.icon), title: str(item.text), desc: str(item.sub) };
      });
      break;

    case 'timeline':
      g.title = str(data.title);
      g.items = arr(data.events).map((ev: unknown) => {
        const event = ev as D;
        return { label: str(event.label), title: str(event.title), desc: str(event.desc) };
      });
      break;

    case 'table':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      // Flatten headers + rows into body text
      { const headers = arr(data.headers).map(str);
        const rows = arr(data.rows).map(r => arr(r).map(str));
        g.body = [headers.join(' | '), ...rows.map(r => r.join(' | '))].join('\n');
      }
      break;

    // v4 Charts
    case 'bar-chart':
    case 'horizontal-bar-chart':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      g.items = arr(data.items).map((it: unknown) => {
        const d = it as D;
        return { label: str(d.label), title: String(d.value ?? ''), desc: '' };
      });
      break;

    case 'line-chart':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      { const labels = arr(data.labels).map(str);
        const series = arr(data.series);
        g.body = series.map((s: unknown) => {
          const sd = s as D;
          return `${str(sd.name)}: ${arr(sd.values).join(', ')}`;
        }).join('\n');
        g.subtitle = labels.join(', ');
      }
      break;

    case 'pie-chart':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      g.items = arr(data.items).map((it: unknown) => {
        const d = it as D;
        return { label: str(d.label), title: String(d.value ?? ''), desc: '' };
      });
      break;

    case 'stacked-bar-chart':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      { const labels = arr(data.labels).map(str);
        const series = arr(data.series);
        g.body = series.map((s: unknown) => {
          const sd = s as D;
          return `${str(sd.name)}: ${arr(sd.values).join(', ')}`;
        }).join('\n');
        g.subtitle = labels.join(', ');
      }
      break;

    case 'scatter-chart':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      g.items = arr(data.points).map((pt: unknown) => {
        const d = pt as D;
        return { label: str(d.label), title: `${d.x ?? ''},${d.y ?? ''}`, desc: str(d.group) };
      });
      break;

    // v4 Diagrams
    case 'flowchart':
      g.title = str(data.title);
      g.items = arr(data.steps).map((s: unknown) => {
        const d = s as D;
        return { label: '', title: str(d.text), desc: '' };
      });
      break;

    case 'funnel':
    case 'pyramid':
    case 'bullseye':
    case 'cycle':
      g.title = str(data.title);
      g.items = arr(data.items).map((it: unknown) => {
        const d = it as D;
        return { label: '', title: str(d.text), desc: '' };
      });
      break;

    case 'steps':
      g.title = str(data.title);
      g.items = arr(data.items).map((it: unknown) => {
        const d = it as D;
        return { label: str(d.label), title: str(d.text), desc: str(d.desc) };
      });
      break;

    case 'matrix':
      g.title = str(data.title);
      g.items = [
        { label: '', title: str(data.topLeft), desc: '' },
        { label: '', title: str(data.topRight), desc: '' },
        { label: '', title: str(data.bottomLeft), desc: '' },
        { label: '', title: str(data.bottomRight), desc: '' },
      ];
      g.subtitle = `${str(data.yAxis)} / ${str(data.xAxis)}`;
      g.footnote = str(data.footnote);
      break;

    case 'versus':
      g.title = str(data.title);
      g.footnote = str(data.footnote);
      { const left = (data.left ?? {}) as D;
        const right = (data.right ?? {}) as D;
        const lPts = arr(left.points).map(str);
        const rPts = arr(right.points).map(str);
        g.items = [
          { label: 'L', title: str(left.heading), desc: lPts.join(', ') },
          { label: 'R', title: str(right.heading), desc: rPts.join(', ') },
        ];
      }
      break;

    case 'venn':
      g.title = str(data.title);
      g.items = arr(data.items).map((it: unknown) => {
        const d = it as D;
        return { label: '', title: str(d.text), desc: '' };
      });
      g.footnote = str(data.overlap);
      break;

    default:
      // Faithful/report/unknown — grab common fields
      g.title = str(data.title);
      g.subtitle = str(data.subtitle);
      g.body = str(data.body);
      break;
  }

  return g;
}

// ---------------------------------------------------------------------------
// Inject: GenericContent → target layout data
// ---------------------------------------------------------------------------

const BAR_COLORS = ['primary', 'accent', 'green', 'muted', 'dark'] as const;
const DEFAULT_ICONS = ['📌', '🎯', '💡', '🔑', '⚡', '🏆'];

function ensureItems(g: GenericContent, min: number): GenericContent['items'] {
  const items = [...g.items];
  // If no items, try to synthesize from body text (split paragraphs or lines)
  if (items.length === 0 && (g.body || g.subtitle)) {
    const text = g.body || g.subtitle;
    const lines = text.split(/\n+/).filter(Boolean);
    for (const line of lines) {
      items.push({ label: '', title: line, desc: '' });
    }
  }
  // Pad to minimum
  while (items.length < min) {
    items.push({ label: '', title: '...', desc: '' });
  }
  return items;
}

/** Take the first `n` items; fold any excess into an overflow string so text is never silently lost. */
function takeItems(
  allItems: GenericContent['items'],
  n: number,
): { taken: GenericContent['items']; overflow: string } {
  const taken = allItems.slice(0, n);
  if (allItems.length <= n) return { taken, overflow: '' };
  const rest = allItems.slice(n);
  const overflow = rest
    .map(it => [it.title, it.desc].filter(Boolean).join(': '))
    .filter(Boolean)
    .join(' · ');
  return { taken, overflow };
}

/** Merge overflow text into an existing string field (footnote / footer / overlap). */
function mergeOverflow(existing: string, overflow: string): string {
  if (!overflow) return existing;
  return [existing, overflow].filter(Boolean).join(' · ');
}

function injectContent(g: GenericContent, target: Layout): D {
  const items = ensureItems(g, 0);
  const bodyOrSub = g.body || g.subtitle || '';

  switch (target) {
    case 'cover':
      return {
        title: g.title || '标题',
        subtitle: g.subtitle || bodyOrSub,
        footnote: g.footnote,
        author: '',
      };

    case 'big-number': {
      // Use title as-is if short, otherwise extract first word/number
      let num = g.title;
      if (num.length > 8) {
        const match = num.match(/\d[\d,.%]+/);
        num = match ? match[0] : num.slice(0, 4);
      }
      return {
        number: num || '01',
        text: bodyOrSub || g.title,
        footnote: g.footnote,
        highlight: '',
      };
    }

    case 'three-cards': {
      const { taken: cards, overflow } = takeItems(ensureItems(g, 3), 5);
      return {
        title: g.title || '标题',
        cards: cards.map((it, i) => ({
          label: it.label || `0${i + 1}`,
          title: it.title,
          desc: it.desc,
        })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'two-column': {
      const cols = ensureItems(g, 2);
      const result: D = {
        title: g.title || '标题',
        left: { heading: cols[0].title, content: cols[0].desc || bodyOrSub },
        right: { heading: cols[1].title, content: cols[1].desc },
        footer: g.footnote,
      };
      if (g.chart) result.chart = g.chart;
      return result;
    }

    case 'stacked-bars': {
      const { taken: bars, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '标题',
        bars: bars.map((it, i) => ({
          text: it.title,
          color: BAR_COLORS[i % BAR_COLORS.length],
        })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'grid-cards': {
      const { taken: cards, overflow } = takeItems(ensureItems(g, 4), 8);
      return {
        title: g.title || '标题',
        columns: Math.min(cards.length, 4) as 2 | 3 | 4,
        cards: cards.map((it, i) => ({
          label: it.label || `0${i + 1}`,
          title: it.title,
          desc: it.desc,
        })),
        footer: mergeOverflow(g.footnote, overflow),
      };
    }

    case 'quote':
      return {
        quote: bodyOrSub || g.title || '引用',
        body: g.subtitle,
        highlight: '',
        author: g.footnote,
      };

    case 'image':
      return {
        title: g.title || '标题',
        subtitle: bodyOrSub,
        image_url: g.imageUrl,
        image_prompt: '',
        overlay: 'dark',
      };

    case 'title-body': {
      // Convert items to bullet list if we have items but no body
      let body = bodyOrSub;
      if (!body && items.length > 0) {
        body = items.map(it => `• ${it.title}${it.desc ? ' — ' + it.desc : ''}`).join('\n\n');
      }
      return {
        title: g.title || '标题',
        body: body || '正文内容',
        footnote: g.footnote,
      };
    }

    case 'icon-list': {
      const { taken: listItems, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '标题',
        items: listItems.map((it, i) => ({
          icon: it.label || DEFAULT_ICONS[i % DEFAULT_ICONS.length],
          text: it.title,
          sub: it.desc,
        })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'timeline': {
      const { taken: events, overflow } = takeItems(ensureItems(g, 3), 5);
      return {
        title: g.title || '标题',
        events: events.map((it, i) => ({
          label: it.label || `${2020 + i}`,
          title: it.title,
          desc: it.desc,
        })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'split-image': {
      const result: D = {
        title: g.title || '标题',
        body: bodyOrSub,
        image_url: g.imageUrl,
        image_prompt: '',
        imagePosition: 'left',
      };
      if (g.chart) result.chart = g.chart;
      return result;
    }

    case 'table': {
      // Convert items to table rows
      const { taken: tItems, overflow } = takeItems(ensureItems(g, 2), 6);
      return {
        title: g.title || '标题',
        headers: ['项目', '内容', '说明'],
        rows: tItems.map(it => [it.label || '', it.title, it.desc]),
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    // v4 Charts
    case 'bar-chart':
    case 'horizontal-bar-chart': {
      const { taken: cItems, overflow } = takeItems(ensureItems(g, 3), 8);
      return {
        title: g.title || '图表',
        items: cItems.map(it => ({
          label: it.title || it.label || '项目',
          value: parseFloat(it.desc) || (10 + Math.round(Math.random() * 90)),
        })),
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    case 'line-chart': {
      const { taken: cItems, overflow } = takeItems(ensureItems(g, 3), 8);
      return {
        title: g.title || '趋势图',
        labels: cItems.map(it => it.label || it.title),
        series: [{ name: '数据', values: cItems.map(() => 10 + Math.round(Math.random() * 90)) }],
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    case 'pie-chart': {
      const { taken: cItems, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '占比图',
        items: cItems.map(it => ({
          label: it.title || it.label || '项目',
          value: parseFloat(it.desc) || (10 + Math.round(Math.random() * 40)),
        })),
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    case 'stacked-bar-chart': {
      const { taken: cItems, overflow } = takeItems(ensureItems(g, 4), 8);
      const labels = cItems.map(it => it.label || it.title);
      return {
        title: g.title || '构成图',
        labels,
        series: [
          { name: 'A', values: labels.map(() => 20 + Math.round(Math.random() * 40)) },
          { name: 'B', values: labels.map(() => 10 + Math.round(Math.random() * 30)) },
        ],
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    case 'scatter-chart': {
      const { taken: cItems, overflow } = takeItems(ensureItems(g, 6), 40);
      return {
        title: g.title || '相关性',
        points: cItems.map((it, i) => ({
          x: parseFloat(it.desc) || (i + 1) * 10,
          y: parseFloat(it.title) || 10 + Math.round(Math.random() * 80),
          label: it.label || undefined,
        })),
        footnote: mergeOverflow(g.footnote, overflow),
      };
    }

    // v4 Diagrams
    case 'flowchart': {
      const { taken: fItems, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '流程图',
        steps: fItems.map(it => ({ text: it.title })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'funnel': {
      const { taken: fItems, overflow } = takeItems(ensureItems(g, 3), 5);
      return {
        title: g.title || '漏斗',
        items: fItems.map(it => ({ text: it.title })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'pyramid': {
      const { taken: pItems, overflow } = takeItems(ensureItems(g, 3), 5);
      return {
        title: g.title || '金字塔',
        items: pItems.map(it => ({ text: it.title })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'steps': {
      const { taken: sItems, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '步骤',
        items: sItems.map((it, i) => ({
          label: it.label || `${i + 1}`,
          text: it.title,
          desc: it.desc,
        })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'matrix': {
      const mItems = ensureItems(g, 4);
      return {
        title: g.title || '矩阵分析',
        xAxis: '维度 X',
        yAxis: '维度 Y',
        topLeft: mItems[0]?.title || '高优先',
        topRight: mItems[1]?.title || '观察',
        bottomLeft: mItems[2]?.title || '低优先',
        bottomRight: mItems[3]?.title || '评估',
        footnote: g.footnote,
      };
    }

    case 'versus': {
      const vItems = ensureItems(g, 2);
      const halfIdx = Math.ceil(vItems.length / 2);
      return {
        title: g.title || '对比',
        left: { heading: vItems[0]?.title || 'A', points: vItems.slice(0, halfIdx).map(it => it.desc || it.title) },
        right: { heading: vItems[halfIdx]?.title || 'B', points: vItems.slice(halfIdx).map(it => it.desc || it.title) },
        footnote: g.footnote,
      };
    }

    case 'venn': {
      const { taken: vnItems, overflow } = takeItems(ensureItems(g, 2), 3);
      return {
        title: g.title || '韦恩图',
        items: vnItems.map(it => ({ text: it.title })),
        overlap: mergeOverflow(g.footnote || '', overflow),
      };
    }

    case 'bullseye': {
      const { taken: bItems, overflow } = takeItems(ensureItems(g, 2), 4);
      return {
        title: g.title || '靶心图',
        items: bItems.map(it => ({ text: it.title })),
        footnote: mergeOverflow('', overflow),
      };
    }

    case 'cycle': {
      const { taken: cyItems, overflow } = takeItems(ensureItems(g, 3), 6);
      return {
        title: g.title || '循环图',
        items: cyItems.map(it => ({ text: it.title })),
        footnote: mergeOverflow('', overflow),
      };
    }

    default:
      return { title: g.title, subtitle: g.subtitle, body: bodyOrSub };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract the full semantic content from a layout's data.
 * Exported so callers can persist this as a lossless snapshot.
 */
export function extractGenericContent(data: D, layout: Layout): GenericContent {
  return extractContent(data, layout);
}

/**
 * Swap a slide's data from one layout to another, client-side, no LLM.
 * Extracts semantic content from the source and re-injects into the target schema.
 *
 * If `savedContent` is provided (a previously extracted GenericContent snapshot),
 * the swap merges it with the current extraction — whichever has richer data for
 * each field wins. This prevents permanent text loss when round-tripping through
 * layouts with fewer slots.
 */
export function swapLayout(
  currentData: D,
  fromLayout: Layout,
  toLayout: Layout,
  savedContent?: GenericContent,
): D {
  if (fromLayout === toLayout) return currentData;
  const current = extractContent(currentData, fromLayout);

  // Merge: for each field, prefer whichever source has more content
  const merged: GenericContent = savedContent
    ? {
        title:    current.title    || savedContent.title,
        subtitle: current.subtitle || savedContent.subtitle,
        body:     current.body.length >= savedContent.body.length ? current.body : savedContent.body,
        items:    current.items.length >= savedContent.items.length ? current.items : savedContent.items,
        footnote: current.footnote || savedContent.footnote,
        imageUrl: current.imageUrl || savedContent.imageUrl,
      }
    : current;

  return injectContent(merged, toLayout);
}
