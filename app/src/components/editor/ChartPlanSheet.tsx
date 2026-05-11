'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Layout } from '@/lib/types';
import { useT } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChartPlanSheetProps {
  chartLayout: Layout;
  chartLabel: string;
  planText: string;
  pageIndex: number;
  onConfirm: (editedPlanText: string) => void;
  onDismiss: () => void;
  onMinimize?: () => void;
}

// ---------------------------------------------------------------------------
// Plan text parser — extract structured items from the AI's free-form plan
// ---------------------------------------------------------------------------

interface ParsedPlan {
  title?: string;
  items: string[];
  unit?: string;
  direction?: 'horizontal' | 'vertical';
}

function parsePlanText(text: string): ParsedPlan {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let title: string | undefined;
  const items: string[] = [];
  let unit: string | undefined;
  let direction: 'horizontal' | 'vertical' | undefined;

  // Try to find title
  for (const line of lines) {
    const titleMatch = line.match(/^(?:标题|Title)[：:]\s*(.+)/i);
    if (titleMatch) { title = titleMatch[1].trim(); continue; }
    const unitMatch = line.match(/^(?:单位|Unit)[：:]\s*(.+)/i);
    if (unitMatch) { unit = unitMatch[1].trim(); continue; }
    const dirMatch = line.match(/(?:方向|direction)[：:]\s*(horizontal|vertical|水平|垂直)/i);
    if (dirMatch) {
      direction = dirMatch[1].includes('vert') || dirMatch[1] === '垂直' ? 'vertical' : 'horizontal';
      continue;
    }
  }

  // Extract items — look for arrow-separated, numbered, or bulleted
  const arrowLine = lines.find(l => l.includes('→'));
  if (arrowLine) {
    // "小行星撞击 → 瞬时释能 → 遮蔽阳光 → 气候突变 → 食物链失序"
    const parts = arrowLine.split('→').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      items.push(...parts);
      return { title, items, unit, direction };
    }
  }

  // Try numbered or labeled items
  for (const line of lines) {
    // "1. 小行星撞击" or "步骤1标签：小行星撞击"
    const numMatch = line.match(/^(?:\d+[\.\)、]|(?:步骤|Step)\d+[：:标签]*[：:]?)\s*(.+)/i);
    if (numMatch) {
      // Strip trailing metadata like "数值：xxx 单位：xxx" or "Value: xxx Unit: xxx"
      let val = numMatch[1].trim();
      const labelMatch = val.match(/^(?:标签|Label)[：:]\s*(.+?)(?:\s+(?:数值|Value)|$)/i);
      if (labelMatch) val = labelMatch[1].trim();
      // Strip anything after "数值"/"Value" or "单位"/"Unit"
      val = val.replace(/\s+(?:数值|Value)[：:].*$/i, '').replace(/\s+(?:单位|Unit)[：:].*$/i, '').trim();
      if (val) items.push(val);
      continue;
    }
    // "- 小行星撞击"
    const bulletMatch = line.match(/^[-·•*]\s+(.+)/);
    if (bulletMatch) {
      items.push(bulletMatch[1].trim());
    }
  }

  // Fallback: if no items found, treat non-title lines as items
  if (items.length === 0) {
    for (const line of lines) {
      if (line === title) continue;
      if (line.match(/^(?:标题|Title|单位|Unit|方向|Direction|备注|Notes|说明|Description)[：:]/i)) continue;
      items.push(line);
    }
  }

  return { title, items, unit, direction };
}

// ---------------------------------------------------------------------------
// Mini preview sketches — simplified SVG showing chart shape with labels
// ---------------------------------------------------------------------------

function FlowchartSketch({ items, direction }: { items: string[]; direction?: string }) {
  const isVert = direction === 'vertical';
  const boxW = isVert ? 140 : Math.min(120, 600 / Math.max(items.length, 1));
  const boxH = 36;
  const gap = isVert ? 28 : 20;

  if (isVert) {
    const totalH = items.length * boxH + (items.length - 1) * gap;
    return (
      <svg width={boxW + 20} height={totalH} viewBox={`0 0 ${boxW + 20} ${totalH}`} style={{ display: 'block', margin: '0 auto' }}>
        {items.map((item, i) => {
          const y = i * (boxH + gap);
          return (
            <g key={i}>
              <rect x={10} y={y} width={boxW} height={boxH} rx={8} fill="#fef3ee" stroke="#d97757" strokeWidth={1.2} />
              <text x={10 + boxW / 2} y={y + boxH / 2 + 4} textAnchor="middle" fontSize={11} fill="#141413">{item.slice(0, 8)}</text>
              {i < items.length - 1 && (
                <path d={`M${10 + boxW / 2} ${y + boxH} L${10 + boxW / 2} ${y + boxH + gap - 8} l-4 -4 l4 8 l4 -8 l-4 4`}
                  fill="none" stroke="#d97757" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
              )}
            </g>
          );
        })}
      </svg>
    );
  }

  // Horizontal
  const totalW = items.length * boxW + (items.length - 1) * gap;
  return (
    <svg width={totalW} height={boxH + 4} viewBox={`0 0 ${totalW} ${boxH + 4}`} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
      {items.map((item, i) => {
        const x = i * (boxW + gap);
        return (
          <g key={i}>
            <rect x={x} y={2} width={boxW} height={boxH} rx={8} fill="#fef3ee" stroke="#d97757" strokeWidth={1.2} />
            <text x={x + boxW / 2} y={2 + boxH / 2 + 4} textAnchor="middle" fontSize={10} fill="#141413">{item.slice(0, 8)}</text>
            {i < items.length - 1 && (
              <path d={`M${x + boxW} ${2 + boxH / 2} L${x + boxW + gap - 6} ${2 + boxH / 2} l-4 -4 l8 4 l-8 4 l4 -4`}
                fill="none" stroke="#d97757" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function BarSketch({ items }: { items: string[] }) {
  const barH = 24;
  const gap = 6;
  const maxW = 200;
  const totalH = items.length * (barH + gap);
  return (
    <svg width={maxW + 80} height={totalH} viewBox={`0 0 ${maxW + 80} ${totalH}`} style={{ display: 'block', margin: '0 auto' }}>
      {items.map((item, i) => {
        const y = i * (barH + gap);
        const w = maxW * (1 - i * 0.15);
        return (
          <g key={i}>
            <rect x={0} y={y} width={w} height={barH} rx={4} fill="#d97757" opacity={0.7 - i * 0.08} />
            <text x={w + 6} y={y + barH / 2 + 4} fontSize={10} fill="#6b6a65">{item.slice(0, 10)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function PieSketch({ items }: { items: string[] }) {
  const r = 40;
  const cx = 50;
  const cy = 50;
  const colors = ['#d97757', '#e8a87c', '#788c5d', '#6a9bcc', '#b0aea5', '#9b8bb4'];
  const total = items.length;
  let startAngle = -Math.PI / 2;

  return (
    <svg width={200} height={100} viewBox="0 0 200 100" style={{ display: 'block', margin: '0 auto' }}>
      {items.map((item, i) => {
        const angle = (2 * Math.PI) / total;
        const endAngle = startAngle + angle;
        const x1 = cx + r * Math.cos(startAngle);
        const y1 = cy + r * Math.sin(startAngle);
        const x2 = cx + r * Math.cos(endAngle);
        const y2 = cy + r * Math.sin(endAngle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc} 1 ${x2},${y2} Z`;
        const labelAngle = startAngle + angle / 2;
        const lx = cx + (r + 16) * Math.cos(labelAngle);
        const ly = cy + (r + 16) * Math.sin(labelAngle);
        startAngle = endAngle;
        return (
          <g key={i}>
            <path d={d} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={1.5} />
            <text x={lx} y={ly + 3} textAnchor="middle" fontSize={8} fill="#6b6a65">{item.slice(0, 6)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function FunnelSketch({ items }: { items: string[] }) {
  const h = 24;
  const gap = 3;
  const maxW = 200;
  const totalH = items.length * (h + gap);
  return (
    <svg width={maxW + 80} height={totalH} viewBox={`0 0 ${maxW + 80} ${totalH}`} style={{ display: 'block', margin: '0 auto' }}>
      {items.map((item, i) => {
        const y = i * (h + gap);
        const w = maxW * (1 - i * (0.6 / Math.max(items.length - 1, 1)));
        const x = (maxW - w) / 2;
        return (
          <g key={i}>
            <rect x={x} y={y} width={w} height={h} rx={4} fill="#d97757" opacity={0.85 - i * 0.1} />
            <text x={maxW / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={500}>{item.slice(0, 10)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function StepsSketch({ items }: { items: string[] }) {
  const r = 14;
  const gap = 50;
  const totalW = items.length * (2 * r + gap) - gap;
  return (
    <svg width={totalW} height={60} viewBox={`0 0 ${totalW} 60`} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}>
      {items.map((item, i) => {
        const cx = i * (2 * r + gap) + r;
        return (
          <g key={i}>
            <circle cx={cx} cy={16} r={r} fill="#d97757" opacity={0.8} />
            <text x={cx} y={20} textAnchor="middle" fontSize={10} fill="#fff" fontWeight={600}>{i + 1}</text>
            <text x={cx} y={46} textAnchor="middle" fontSize={9} fill="#6b6a65">{item.slice(0, 6)}</text>
            {i < items.length - 1 && (
              <line x1={cx + r + 2} y1={16} x2={cx + 2 * r + gap - r - 2} y2={16}
                stroke="#e8e6dc" strokeWidth={1.5} strokeDasharray="3,3" />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function CycleSketch({ items }: { items: string[] }) {
  const n = items.length;
  const R = 38;
  const cx = 50;
  const cy = 50;
  return (
    <svg width={120} height={120} viewBox="0 0 120 120" style={{ display: 'block', margin: '0 auto' }}>
      {/* circle ring */}
      <circle cx={cx + 10} cy={cy + 10} r={R} fill="none" stroke="#e8e6dc" strokeWidth={1.5} strokeDasharray="4,4" />
      {items.map((item, i) => {
        const angle = (2 * Math.PI * i) / n - Math.PI / 2;
        const x = cx + 10 + R * Math.cos(angle);
        const y = cy + 10 + R * Math.sin(angle);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={12} fill="#fef3ee" stroke="#d97757" strokeWidth={1.2} />
            <text x={x} y={y + 3} textAnchor="middle" fontSize={7} fill="#141413">{item.slice(0, 4)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function GenericListSketch({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '4px 0' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: '#d97757', color: '#fff',
            fontSize: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>{i + 1}</div>
          <span style={{ fontSize: 12, color: '#141413' }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function MiniPreview({ layout, items, direction }: { layout: Layout; items: string[]; direction?: string }) {
  if (items.length === 0) return null;
  switch (layout) {
    case 'flowchart': return <FlowchartSketch items={items} direction={direction} />;
    case 'bar-chart':
    case 'horizontal-bar-chart': return <BarSketch items={items} />;
    case 'pie-chart': return <PieSketch items={items} />;
    case 'funnel': return <FunnelSketch items={items} />;
    case 'pyramid': return <FunnelSketch items={[...items].reverse()} />;
    case 'steps': return <StepsSketch items={items} />;
    case 'cycle': return <CycleSketch items={items} />;
    default: return <GenericListSketch items={items} />;
  }
}

// ---------------------------------------------------------------------------
// Main component — two-zone horizontal layout (preview | form)
// ---------------------------------------------------------------------------

export function ChartPlanSheet({
  chartLayout, chartLabel, planText, pageIndex,
  onConfirm, onDismiss, onMinimize,
}: ChartPlanSheetProps) {
  const t = useT();
  const parsed = parsePlanText(planText);
  const [editItems, setEditItems] = useState<string[]>(parsed.items);
  const [editTitle, setEditTitle] = useState(parsed.title || '');
  const [extraNote, setExtraNote] = useState('');
  const [compact, setCompact] = useState(false);
  const [hoveredItem, setHoveredItem] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);
  const prevItemsRef = useRef<string[]>([]);

  // Responsive: collapse to single-column below 560px
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 800;
      setCompact(w < 560);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mark animated after mount so stagger only plays once
  useEffect(() => { hasAnimated.current = true; }, []);

  // WAAPI pulse on preview when items change
  useEffect(() => {
    const key = JSON.stringify(editItems.filter(Boolean));
    if (prevItemsRef.current.length > 0 && key !== JSON.stringify(prevItemsRef.current)) {
      const el = previewRef.current;
      if (el) {
        el.animate(
          [
            { transform: 'scale(0.97)', opacity: '0.7' },
            { transform: 'scale(1)', opacity: '1' },
          ],
          { duration: 250, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
        );
      }
    }
    prevItemsRef.current = editItems.filter(Boolean);
  });

  // Rebuild plan text from current edited state
  const buildEditedPlan = useCallback(() => {
    const parts: string[] = [];
    if (editTitle) parts.push(`${t('chartPlan.title_prefix')}${editTitle}`);
    editItems.filter(Boolean).forEach((item, i) => parts.push(`${i + 1}. ${item}`));
    if (extraNote.trim()) parts.push(`\n${t('chartPlan.notes_prefix')}${extraNote.trim()}`);
    return parts.join('\n');
  }, [editTitle, editItems, extraNote, t]);

  const handleItemChange = useCallback((idx: number, val: string) => {
    setEditItems(prev => prev.map((item, i) => i === idx ? val : item));
  }, []);

  const handleRemoveItem = useCallback((idx: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleAddItem = useCallback(() => {
    setEditItems(prev => [...prev, '']);
  }, []);

  const previewItems = editItems.filter(Boolean);
  const anim = !hasAnimated.current; // only stagger on first mount
  const itemCount = editItems.length;
  const confirmDelay = 0.3 + itemCount * 0.04 + 0.1;

  // -------------------------------------------------------------------------
  // Left zone — preview panel
  // -------------------------------------------------------------------------
  const previewZone = (
    <div style={{
      flex: compact ? 'none' : '0 0 38%',
      minWidth: compact ? undefined : 200,
      width: compact ? '100%' : undefined,
      height: compact ? 130 : undefined,
      background: '#faf9f5',
      borderRight: compact ? 'none' : '1px solid #e8e6dc',
      borderBottom: compact ? '1px solid #e8e6dc' : 'none',
      padding: compact ? '14px 20px' : 24,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
      ...(anim ? { animation: 'chartPreviewReveal 0.5s cubic-bezier(0.22,0.61,0.36,1) 0.15s both' } : {}),
    }}>
      {/* Chart type pill badge */}
      <span style={{
        position: 'absolute',
        top: compact ? 10 : 16,
        left: compact ? 14 : 16,
        fontSize: 11,
        fontWeight: 600,
        color: '#d97757',
        background: 'rgba(217,119,87,0.08)',
        border: '1px solid rgba(217,119,87,0.2)',
        borderRadius: 20,
        padding: '3px 12px',
        letterSpacing: 0.3,
      }}>
        {chartLabel}
      </span>

      {/* Minimize + Close controls */}
      <div style={{
        position: 'absolute',
        top: compact ? 8 : 12,
        right: compact ? 10 : 12,
        display: 'flex', gap: 2,
      }}>
        {onMinimize && (
          <button
            onClick={onMinimize}
            title={t('chartPlan.minimize')}
            style={{
              width: 24, height: 24,
              background: 'transparent', border: 'none', borderRadius: 5,
              cursor: 'pointer', color: '#b0aea5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#f0efeb'; e.currentTarget.style.color = '#141413'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b0aea5'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="5" y1="18" x2="19" y2="18" />
            </svg>
          </button>
        )}
        <button
          onClick={onDismiss}
          title={t('chartPlan.close')}
          style={{
            width: 24, height: 24,
            background: 'transparent', border: 'none', borderRadius: 5,
            cursor: 'pointer', color: '#b0aea5',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0efeb'; e.currentTarget.style.color = '#141413'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b0aea5'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Live preview */}
      <div ref={previewRef} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', maxHeight: compact ? 80 : undefined,
        overflow: 'hidden',
        transform: compact ? 'scale(0.85)' : 'scale(1.15)',
        transformOrigin: 'center',
      }}>
        {previewItems.length > 0 ? (
          <MiniPreview layout={chartLayout} items={previewItems} direction={parsed.direction} />
        ) : (
          <span style={{ fontSize: 12, color: '#d4d2ca' }}>preview</span>
        )}
      </div>

      {/* Page indicator */}
      <span style={{
        position: 'absolute',
        bottom: compact ? 8 : 12,
        right: compact ? 14 : 16,
        fontSize: 11,
        color: '#d4d2ca',
        letterSpacing: 0.5,
      }}>
        P.{pageIndex + 1}
      </span>
    </div>
  );

  // -------------------------------------------------------------------------
  // Right zone — compact form
  // -------------------------------------------------------------------------
  const formZone = (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      minWidth: compact ? undefined : 280,
    }}>
      {/* Title input — borderless inline-edit feel */}
      <div style={{
        padding: compact ? '12px 16px 4px' : '16px 24px 4px',
        flexShrink: 0,
        ...(anim ? { animation: 'chartItemFadeIn 0.3s ease-out 0.2s both' } : {}),
      }}>
        <input
          value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          placeholder={t('chartPlan.enter_title')}
          style={{
            width: '100%',
            fontSize: 15,
            fontWeight: 600,
            color: '#141413',
            background: 'transparent',
            border: 'none',
            borderBottom: '1.5px solid transparent',
            padding: '4px 0',
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderBottomColor = '#d97757')}
          onBlur={e => (e.currentTarget.style.borderBottomColor = e.currentTarget.value ? 'transparent' : '#e8e6dc')}
        />
      </div>

      {/* Items area — scrollable if many items */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: compact ? '6px 16px 8px' : '6px 24px 8px',
      }}>
        {editItems.map((item, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              marginBottom: 2,
              borderRadius: 6,
              background: hoveredItem === i ? '#faf9f5' : 'transparent',
              transition: 'background 0.12s',
              ...(anim ? { animation: `chartItemFadeIn 0.25s ease-out ${0.25 + i * 0.04}s both` } : {}),
            }}
            onMouseEnter={() => setHoveredItem(i)}
            onMouseLeave={() => setHoveredItem(-1)}
          >
            {/* Colored dot index */}
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#d97757',
              opacity: 0.4 + (i / Math.max(itemCount - 1, 1)) * 0.5,
              flexShrink: 0,
            }} />
            {/* Borderless input */}
            <input
              value={item}
              onChange={e => handleItemChange(i, e.target.value)}
              placeholder={t('chartPlan.item_n', { n: i + 1 })}
              style={{
                flex: 1, fontSize: 13, color: '#141413',
                background: 'transparent', border: 'none', outline: 'none',
                padding: '2px 0', fontFamily: 'inherit',
                borderBottom: '1px solid transparent',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderBottomColor = 'rgba(217,119,87,0.3)')}
              onBlur={e => (e.currentTarget.style.borderBottomColor = 'transparent')}
            />
            {/* Delete — visible on hover */}
            <button
              onClick={() => handleRemoveItem(i)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#b0aea5', padding: '2px 4px', fontSize: 13, lineHeight: 1,
                transition: 'all 0.12s', flexShrink: 0,
                opacity: hoveredItem === i ? 1 : 0,
                pointerEvents: hoveredItem === i ? 'auto' : 'none',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#d97757')}
              onMouseLeave={e => (e.currentTarget.style.color = '#b0aea5')}
              title={t('chartPlan.delete')}
            >
              ×
            </button>
          </div>
        ))}

        {/* Add item */}
        <button
          onClick={handleAddItem}
          style={{
            fontSize: 12, color: '#b0aea5', background: 'none', border: 'none',
            cursor: 'pointer', padding: '6px 8px', display: 'flex',
            alignItems: 'center', gap: 5, transition: 'color 0.15s',
            marginLeft: 14,
            ...(anim ? { animation: `chartItemFadeIn 0.25s ease-out ${0.25 + itemCount * 0.04 + 0.05}s both` } : {}),
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#d97757')}
          onMouseLeave={e => (e.currentTarget.style.color = '#b0aea5')}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="8" y1="2" x2="8" y2="14" /><line x1="2" y1="8" x2="14" y2="8" />
          </svg>
          {t('chartPlan.add_item')}
        </button>
      </div>

      {/* Note input with inline confirm button */}
      <div style={{
        flexShrink: 0,
        padding: compact ? '6px 16px 12px' : '8px 24px 14px',
        ...(anim ? { animation: `chartItemFadeIn 0.3s ease-out ${confirmDelay}s both` } : {}),
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 6,
          background: '#faf9f5',
          border: '1px solid #e8e6dc',
          borderRadius: 10,
          padding: '6px 6px 6px 12px',
          transition: 'border-color 0.15s',
        }}
          onFocus={e => (e.currentTarget.style.borderColor = '#d97757')}
          onBlur={e => {
            // Only reset border if focus leaves the entire container
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              e.currentTarget.style.borderColor = '#e8e6dc';
            }
          }}
        >
          <input
            value={extraNote}
            onChange={e => setExtraNote(e.target.value)}
            placeholder={t('chartPlan.note_placeholder')}
            style={{
              flex: 1, fontSize: 12, color: '#141413',
              background: 'transparent', border: 'none', outline: 'none',
              padding: '4px 0', fontFamily: 'inherit',
              minWidth: 0,
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && previewItems.length > 0) {
                e.preventDefault();
                onConfirm(buildEditedPlan());
              }
            }}
          />
          {previewItems.length > 0 && (
            <button
              onClick={() => onConfirm(buildEditedPlan())}
              style={{
                padding: '6px 14px',
                borderRadius: 7,
                background: '#d97757',
                color: '#fff',
                fontSize: 11,
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#c4684a';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#d97757';
              }}
            >
              {t('chartPlan.confirm_generate')}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // -------------------------------------------------------------------------
  // Compose
  // -------------------------------------------------------------------------
  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: compact ? 'column' : 'row',
        flex: 1,
        minHeight: 0,
      }}
    >
      {previewZone}
      {formZone}
    </div>
  );
}
