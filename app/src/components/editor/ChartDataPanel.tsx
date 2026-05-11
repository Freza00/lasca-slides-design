'use client';

import { useCallback } from 'react';
import { useEditorStore } from '@/lib/store';
import { LAYOUT_REGISTRY } from '@/lib/types';
import type { Layout, Slide } from '@/lib/types';
import { useLocale, useT } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_LAYOUT_SET = new Set(
  LAYOUT_REGISTRY.filter(m => m.category === 'chart' || m.category === 'diagram').map(m => m.layout),
);

export function isChartOrDiagram(layout: string): boolean {
  return CHART_LAYOUT_SET.has(layout as Layout);
}

/** Find the first card with role='chart' in a card-canvas slide. Returns its
 *  index so callers can patch `data.cards[i].content.chart`. */
function findChartCardIndex(data: Record<string, unknown>): number {
  const cards = (data?.cards as Array<{ content?: { role?: string } }> | undefined) ?? [];
  return cards.findIndex(c => c?.content?.role === 'chart');
}

/** Check if a slide has an embedded chart.
 *  - Legacy split-image/two-column stash it in data.chart.
 *  - card-canvas slides wrap it inside a card with role='chart'. */
export function hasEmbeddedChart(layout: string, data: Record<string, unknown>): boolean {
  if (layout === 'split-image' || layout === 'two-column') return !!data?.chart;
  if (layout === 'card-canvas') return findChartCardIndex(data) >= 0;
  return false;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const panelStyle: React.CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 110,
  background: '#1a1a19',
  color: '#e8e0d0',
  borderRadius: 10,
  padding: '10px 12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
  fontSize: 12,
  fontFamily: 'inherit',
  maxHeight: '70%',
  overflowY: 'auto',
  minWidth: 220,
  maxWidth: 320,
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  color: '#e8e0d0',
  padding: '3px 6px',
  fontSize: 12,
  fontFamily: 'inherit',
  outline: 'none',
  width: '100%',
};

const numInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 64,
  textAlign: 'right' as const,
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
  alignItems: 'center',
  marginBottom: 4,
};

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#8a8880',
  cursor: 'pointer',
  fontSize: 14,
  padding: '0 2px',
  lineHeight: 1,
};

const addBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px dashed rgba(255,255,255,0.15)',
  borderRadius: 4,
  color: '#8a8880',
  cursor: 'pointer',
  padding: '4px 0',
  fontSize: 11,
  width: '100%',
  textAlign: 'center' as const,
  marginTop: 4,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ChartDataPanelProps {
  slideIndex: number;
  layout: string;
  onClose: () => void;
}

export function ChartDataPanel({ slideIndex, layout, onClose }: ChartDataPanelProps) {
  const locale = useLocale();
  const t = useT();
  const slide = useEditorStore(s => {
    const deck = s.activeDeck();
    return deck.slides[slideIndex];
  });
  const updateSlideField = useEditorStore(s => s.updateSlideField);
  const updateSlide = useEditorStore(s => s.updateSlide);

  const rawData = slide?.data as Record<string, unknown>;
  if (!rawData) return null;

  // Resolve embedded chart:
  //   - Legacy split-image/two-column: rawData.chart
  //   - card-canvas: first card with role='chart' → cards[chartCardIdx].content.chart
  const chartCardIdx = layout === 'card-canvas' ? findChartCardIndex(rawData) : -1;
  const legacyEmbedded = rawData.chart as { type: string; data: Record<string, unknown> } | undefined;
  type CardWithChart = { content: { role: 'chart'; chart: { type: string; data: Record<string, unknown> } } };
  const cardChart = chartCardIdx >= 0
    ? (rawData.cards as CardWithChart[])[chartCardIdx].content.chart
    : undefined;
  const embedded = cardChart ?? legacyEmbedded;
  const inCardCanvas = chartCardIdx >= 0;
  const effectiveLayout = embedded ? embedded.type : layout;
  const data = embedded ? embedded.data : rawData;

  // Deep-set a value at a dot-separated path on slide data, then persist.
  const setField = useCallback((path: string, value: unknown) => {
    const fullPath = inCardCanvas
      ? `cards.${chartCardIdx}.content.chart.data.${path}`
      : legacyEmbedded
        ? `chart.data.${path}`
        : path;
    const parts = fullPath.split('.');
    const clone = JSON.parse(JSON.stringify(rawData));
    let cur = clone as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      const nextKey = parts[i + 1];
      const nextIsIndex = /^\d+$/.test(nextKey);
      if (cur[key] === undefined || cur[key] === null) cur[key] = nextIsIndex ? [] : {};
      cur = cur[key] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
    updateSlide(slideIndex, { ...slide, data: clone } as typeof slide);
  }, [rawData, legacyEmbedded, inCardCanvas, chartCardIdx, slide, slideIndex, updateSlide]);

  // Add item to array
  const addItem = useCallback((arrayPath: string, newItem: unknown) => {
    const arr = (data[arrayPath] as unknown[]) || [];
    const updatedChartData = { ...data, [arrayPath]: [...arr, newItem] };
    if (inCardCanvas && embedded) {
      const cards = [...(rawData.cards as unknown[])];
      const card = { ...(cards[chartCardIdx] as CardWithChart) };
      card.content = { ...card.content, chart: { ...embedded, data: updatedChartData } };
      cards[chartCardIdx] = card;
      updateSlide(slideIndex, { ...slide, data: { ...rawData, cards } } as typeof slide);
    } else if (legacyEmbedded) {
      const updatedRaw = { ...rawData, chart: { ...legacyEmbedded, data: updatedChartData } };
      updateSlide(slideIndex, { ...slide, data: updatedRaw } as typeof slide);
    } else {
      updateSlide(slideIndex, { ...slide, data: updatedChartData } as typeof slide);
    }
  }, [data, rawData, legacyEmbedded, embedded, inCardCanvas, chartCardIdx, slide, slideIndex, updateSlide]);

  // Remove item from array
  const removeItem = useCallback((arrayPath: string, index: number) => {
    const arr = (data[arrayPath] as unknown[]) || [];
    const updatedChartData = { ...data, [arrayPath]: arr.filter((_, i) => i !== index) };
    if (inCardCanvas && embedded) {
      const cards = [...(rawData.cards as unknown[])];
      const card = { ...(cards[chartCardIdx] as CardWithChart) };
      card.content = { ...card.content, chart: { ...embedded, data: updatedChartData } };
      cards[chartCardIdx] = card;
      updateSlide(slideIndex, { ...slide, data: { ...rawData, cards } } as typeof slide);
    } else if (legacyEmbedded) {
      const updatedRaw = { ...rawData, chart: { ...legacyEmbedded, data: updatedChartData } };
      updateSlide(slideIndex, { ...slide, data: updatedRaw } as typeof slide);
    } else {
      updateSlide(slideIndex, { ...slide, data: updatedChartData } as typeof slide);
    }
  }, [data, rawData, legacyEmbedded, embedded, inCardCanvas, chartCardIdx, slide, slideIndex, updateSlide]);

  // Header — effectiveLayout routes card-canvas chart role to the underlying
  // chart type (bar-chart / line-chart / …) so the panel body below dispatches
  // to the right editor variant.
  const layoutMeta = LAYOUT_REGISTRY.find(m => m.layout === effectiveLayout);
  const title = layoutMeta?.label[locale] || effectiveLayout;

  return (
    <div style={panelStyle} onMouseDown={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 11, opacity: 0.7 }}>📊 {title} {t('chartData.title_suffix')}</span>
        <button onClick={onClose} style={{ ...btnStyle, fontSize: 16 }}>×</button>
      </div>

      {/* Bar / Horizontal Bar / Pie: items[{label, value}] */}
      {(effectiveLayout === 'bar-chart' || effectiveLayout === 'horizontal-bar-chart' || effectiveLayout === 'pie-chart') && (
        <ItemValueEditor
          items={(data.items as { label: string; value: number }[]) || []}
          onLabelChange={(i, v) => setField(`items.${i}.label`, v)}
          onValueChange={(i, v) => setField(`items.${i}.value`, v)}
          onAdd={() => addItem('items', { label: t('chartData.new_item'), value: 10 })}
          onRemove={(i) => removeItem('items', i)}
        />
      )}

      {/* Line chart: labels[] + series[{name, values[]}] */}
      {effectiveLayout === 'line-chart' && (
        <LineChartEditor
          labels={(data.labels as string[]) || []}
          series={(data.series as { name: string; values: number[] }[]) || []}
          slideIndex={slideIndex}
          slide={slide}
          updateSlide={updateSlide}
          setField={setField}
        />
      )}

      {/* Simple text-item diagrams */}
      {['flowchart', 'funnel', 'pyramid', 'bullseye', 'cycle', 'venn'].includes(effectiveLayout) && (
        <TextItemEditor
          arrayPath={effectiveLayout === 'flowchart' ? 'steps' : 'items'}
          items={((data[effectiveLayout === 'flowchart' ? 'steps' : 'items']) as { text: string }[]) || []}
          onTextChange={(i, v) => setField(`${effectiveLayout === 'flowchart' ? 'steps' : 'items'}.${i}.text`, v)}
          onAdd={() => addItem(effectiveLayout === 'flowchart' ? 'steps' : 'items', { text: t('chartData.new_item') })}
          onRemove={(i) => removeItem(effectiveLayout === 'flowchart' ? 'steps' : 'items', i)}
        />
      )}

      {/* Steps: items[{label, text, desc?}] */}
      {effectiveLayout === 'steps' && (
        <StepsEditor
          items={(data.items as { label: string; text: string; desc?: string }[]) || []}
          setField={setField}
          onAdd={() => addItem('items', { label: String(((data.items as unknown[])?.length || 0) + 1), text: t('chartData.new_step') })}
          onRemove={(i) => removeItem('items', i)}
        />
      )}

      {/* Matrix */}
      {effectiveLayout === 'matrix' && (
        <div>
          <div style={rowStyle}>
            <span style={{ width: 32, opacity: 0.5 }}>{t('chartData.x_axis')}</span>
            <input style={inputStyle} value={String(data.xAxis || '')} onChange={e => setField('xAxis', e.target.value)} />
          </div>
          <div style={rowStyle}>
            <span style={{ width: 32, opacity: 0.5 }}>{t('chartData.y_axis')}</span>
            <input style={inputStyle} value={String(data.yAxis || '')} onChange={e => setField('yAxis', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6 }}>
            <input style={inputStyle} value={String(data.topLeft || '')} onChange={e => setField('topLeft', e.target.value)} placeholder={t('chartData.placeholder_top_left')} />
            <input style={inputStyle} value={String(data.topRight || '')} onChange={e => setField('topRight', e.target.value)} placeholder={t('chartData.placeholder_top_right')} />
            <input style={inputStyle} value={String(data.bottomLeft || '')} onChange={e => setField('bottomLeft', e.target.value)} placeholder={t('chartData.placeholder_bottom_left')} />
            <input style={inputStyle} value={String(data.bottomRight || '')} onChange={e => setField('bottomRight', e.target.value)} placeholder={t('chartData.placeholder_bottom_right')} />
          </div>
        </div>
      )}

      {/* Versus */}
      {effectiveLayout === 'versus' && (
        <VersusEditor data={data} setField={setField} slideIndex={slideIndex} slide={slide} updateSlide={updateSlide} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-editors
// ---------------------------------------------------------------------------

function ItemValueEditor({ items, onLabelChange, onValueChange, onAdd, onRemove }: {
  items: { label: string; value: number }[];
  onLabelChange: (i: number, v: string) => void;
  onValueChange: (i: number, v: number) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const t = useT();
  return (
    <div>
      <div style={{ ...rowStyle, opacity: 0.5, fontSize: 10 }}>
        <span style={{ flex: 1 }}>{t('chartData.label')}</span>
        <span style={{ width: 64, textAlign: 'right' }}>{t('chartData.value')}</span>
        <span style={{ width: 18 }} />
      </div>
      {items.map((item, i) => (
        <div key={i} style={rowStyle}>
          <input style={{ ...inputStyle, flex: 1 }} value={item.label} onChange={e => onLabelChange(i, e.target.value)} />
          <input style={numInputStyle} type="number" value={item.value} onChange={e => onValueChange(i, parseFloat(e.target.value) || 0)} />
          <button style={btnStyle} onClick={() => onRemove(i)} title={t('chartData.delete')}>×</button>
        </div>
      ))}
      <button style={addBtnStyle} onClick={onAdd}>＋ {t('chartData.add')}</button>
    </div>
  );
}

function TextItemEditor({ items, onTextChange, onAdd, onRemove }: {
  arrayPath: string;
  items: { text: string }[];
  onTextChange: (i: number, v: string) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const t = useT();
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={rowStyle}>
          <input style={{ ...inputStyle, flex: 1 }} value={item.text} onChange={e => onTextChange(i, e.target.value)} />
          <button style={btnStyle} onClick={() => onRemove(i)} title={t('chartData.delete')}>×</button>
        </div>
      ))}
      <button style={addBtnStyle} onClick={onAdd}>＋ {t('chartData.add')}</button>
    </div>
  );
}

function StepsEditor({ items, setField, onAdd, onRemove }: {
  items: { label: string; text: string; desc?: string }[];
  setField: (path: string, value: unknown) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
}) {
  const t = useT();
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: 6, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={rowStyle}>
            <input style={{ ...inputStyle, width: 36 }} value={item.label} onChange={e => setField(`items.${i}.label`, e.target.value)} />
            <input style={{ ...inputStyle, flex: 1 }} value={item.text} onChange={e => setField(`items.${i}.text`, e.target.value)} />
            <button style={btnStyle} onClick={() => onRemove(i)} title={t('chartData.delete')}>×</button>
          </div>
          <input style={{ ...inputStyle, marginTop: 2, opacity: 0.7 }} value={item.desc || ''} onChange={e => setField(`items.${i}.desc`, e.target.value)} placeholder={t('chartData.desc_optional')} />
        </div>
      ))}
      <button style={addBtnStyle} onClick={onAdd}>＋ {t('chartData.add')}</button>
    </div>
  );
}

function LineChartEditor({ labels, series, slideIndex, slide, updateSlide, setField }: {
  labels: string[];
  series: { name: string; values: number[] }[];
  slideIndex: number;
  slide: Slide;
  updateSlide: (i: number, s: Slide) => void;
  setField: (path: string, value: unknown) => void;
}) {
  const t = useT();
  const data = slide.data as Record<string, unknown>;

  const addPoint = () => {
    const newLabels = [...labels, `P${labels.length + 1}`];
    const newSeries = series.map(s => ({ ...s, values: [...s.values, 0] }));
    updateSlide(slideIndex, { ...slide, data: { ...data, labels: newLabels, series: newSeries } as unknown as Slide['data'] });
  };

  const removePoint = (idx: number) => {
    const newLabels = labels.filter((_, i) => i !== idx);
    const newSeries = series.map(s => ({ ...s, values: s.values.filter((_, i) => i !== idx) }));
    updateSlide(slideIndex, { ...slide, data: { ...data, labels: newLabels, series: newSeries } as unknown as Slide['data'] });
  };

  return (
    <div>
      <div style={{ ...rowStyle, opacity: 0.5, fontSize: 10 }}>
        <span style={{ width: 60 }}>{t('chartData.label')}</span>
        {series.map((s, si) => (
          <span key={si} style={{ width: 56, textAlign: 'right' }}>
            <input style={{ ...inputStyle, width: 56, fontSize: 10 }} value={s.name} onChange={e => setField(`series.${si}.name`, e.target.value)} />
          </span>
        ))}
        <span style={{ width: 18 }} />
      </div>
      {labels.map((lbl, li) => (
        <div key={li} style={rowStyle}>
          <input style={{ ...inputStyle, width: 60 }} value={lbl} onChange={e => setField(`labels.${li}`, e.target.value)} />
          {series.map((s, si) => (
            <input key={si} style={{ ...numInputStyle, width: 56 }} type="number" value={s.values[li] ?? 0} onChange={e => setField(`series.${si}.values.${li}`, parseFloat(e.target.value) || 0)} />
          ))}
          <button style={btnStyle} onClick={() => removePoint(li)} title={t('chartData.delete')}>×</button>
        </div>
      ))}
      <button style={addBtnStyle} onClick={addPoint}>＋ {t('chartData.add_data_point')}</button>
    </div>
  );
}

function VersusEditor({ data, setField, slideIndex, slide, updateSlide }: {
  data: Record<string, unknown>;
  setField: (path: string, value: unknown) => void;
  slideIndex: number;
  slide: Slide;
  updateSlide: (i: number, s: Slide) => void;
}) {
  const t = useT();
  const left = (data.left as { heading: string; points: string[] }) || { heading: '', points: [] };
  const right = (data.right as { heading: string; points: string[] }) || { heading: '', points: [] };

  const addPoint = (side: 'left' | 'right') => {
    const sideData = side === 'left' ? left : right;
    const updated = { ...data, [side]: { ...sideData, points: [...sideData.points, t('chartData.new_point')] } };
    updateSlide(slideIndex, { ...slide, data: updated as unknown as Slide['data'] });
  };

  const removePoint = (side: 'left' | 'right', idx: number) => {
    const sideData = side === 'left' ? left : right;
    const updated = { ...data, [side]: { ...sideData, points: sideData.points.filter((_, i) => i !== idx) } };
    updateSlide(slideIndex, { ...slide, data: updated as unknown as Slide['data'] });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <div>
        <input style={{ ...inputStyle, fontWeight: 600, marginBottom: 4 }} value={left.heading} onChange={e => setField('left.heading', e.target.value)} placeholder={t('chartData.left_heading')} />
        {left.points.map((p, i) => (
          <div key={i} style={rowStyle}>
            <input style={{ ...inputStyle, flex: 1 }} value={p} onChange={e => setField(`left.points.${i}`, e.target.value)} />
            <button style={btnStyle} onClick={() => removePoint('left', i)}>×</button>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => addPoint('left')}>＋</button>
      </div>
      <div>
        <input style={{ ...inputStyle, fontWeight: 600, marginBottom: 4 }} value={right.heading} onChange={e => setField('right.heading', e.target.value)} placeholder={t('chartData.right_heading')} />
        {right.points.map((p, i) => (
          <div key={i} style={rowStyle}>
            <input style={{ ...inputStyle, flex: 1 }} value={p} onChange={e => setField(`right.points.${i}`, e.target.value)} />
            <button style={btnStyle} onClick={() => removePoint('right', i)}>×</button>
          </div>
        ))}
        <button style={addBtnStyle} onClick={() => addPoint('right')}>＋</button>
      </div>
    </div>
  );
}
