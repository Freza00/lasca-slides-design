'use client';

import React from 'react';
import { useT } from '@/lib/i18n';

interface StylePanelProps {
  element: HTMLElement;
  /** Called with the prop+value the user just changed.
   *  Editor commits this to the store via _fieldStyles so the change is
   *  undoable and survives the next re-render. (Mutating element.style alone
   *  is DOM-only — wiped on every render and invisible to undo history.) */
  onStyleChange: (prop: string, value: string) => void;
  onClose: () => void;
}

const BRAND_COLORS = ['#d97757', '#6a9bcc', '#788c5d', '#141413', '#b0aea5', '#faf9f5', '#fff', '#000'];

const FONT_OPTIONS = [
  { label: 'Poppins', value: "'Poppins', sans-serif" },
  { label: 'Noto Sans SC', value: "'Noto Sans SC', sans-serif" },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: "'Courier New', monospace" },
  { label: 'Sans-serif', value: 'sans-serif' },
  { label: 'Serif', value: 'serif' },
  { label: 'Monospace', value: 'monospace' },
];

/** Normalize any CSS color value to hex. Uses a canvas to resolve named
 *  colors, CSS variables, and system colors that getComputedStyle might return. */
function rgbToHex(rgb: string): string {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
  // Fast path: already looks like rgb()/rgba()
  const m = rgb.match(/\d+/g);
  if (m && m.length >= 3) {
    return '#' + m.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
  }
  // Fallback: use canvas to normalize named/system colors
  if (typeof document !== 'undefined') {
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      if (ctx) {
        ctx.fillStyle = rgb;
        const normalized = ctx.fillStyle; // always returns '#rrggbb' or 'rgba(...)'
        if (normalized.startsWith('#')) return normalized;
        const m2 = normalized.match(/\d+/g);
        if (m2 && m2.length >= 3) {
          return '#' + m2.slice(0, 3).map(n => parseInt(n).toString(16).padStart(2, '0')).join('');
        }
      }
    } catch { /* ignore */ }
  }
  return '#000000';
}

const label: React.CSSProperties = {
  fontSize: 9, color: '#b0aea5', textTransform: 'uppercase',
  letterSpacing: '0.5px', fontWeight: 500, marginRight: 2,
};

const divider: React.CSSProperties = {
  width: 1, height: 20, background: '#e8e6dc', flexShrink: 0,
};

const iconBtn: React.CSSProperties = {
  background: '#fff', border: '1px solid #e8e6dc', color: '#141413',
  borderRadius: 4, width: 24, height: 24,
  cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 0, flexShrink: 0,
};

const toggleBtn = (active: boolean): React.CSSProperties => ({
  ...iconBtn,
  background: active ? '#d97757' : '#fff',
  color: active ? '#fff' : '#141413',
  border: active ? '1px solid #d97757' : '1px solid #e8e6dc',
  fontWeight: 700,
});

function Swatch({ color, active, onClick }: { color: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        width: 18, height: 18, borderRadius: 3, background: color,
        border: active ? '2px solid #d97757' : '1px solid #d4d2ca',
        cursor: 'pointer', flexShrink: 0,
      }}
    />
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      width: 18, height: 18, borderRadius: 3,
      position: 'relative', overflow: 'hidden',
      border: '1px solid #d4d2ca',
      background: 'conic-gradient(red,yellow,lime,aqua,blue,magenta,red)',
      flexShrink: 0,
    }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          opacity: 0, cursor: 'pointer',
        }}
      />
    </div>
  );
}

// Align icon: 3 horizontal lines at different indents
function AlignIcon({ align }: { align: 'left' | 'center' | 'right' }) {
  const bars = [
    { w: align === 'right' ? 8 : 12, x: align === 'right' ? 4 : align === 'center' ? 2 : 0 },
    { w: 16, x: 0 },
    { w: align === 'left' ? 8 : align === 'center' ? 10 : 12, x: align === 'left' ? 0 : align === 'center' ? 3 : 4 },
  ];
  return (
    <svg width="16" height="14" viewBox="0 0 16 14">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={i * 5 + 1} width={b.w} height={2.5} rx={1} fill="currentColor" />
      ))}
    </svg>
  );
}

export function StylePanel({ element, onStyleChange, onClose }: StylePanelProps) {
  const t = useT();
  const cs = getComputedStyle(element);
  const bgC = rgbToHex(cs.backgroundColor);
  const txC = rgbToHex(cs.color);
  const fs = parseInt(cs.fontSize) || 16;
  const isBold = parseInt(cs.fontWeight) >= 700 || cs.fontWeight === 'bold';
  const textAlign = cs.textAlign as string;
  const isTransparent = parseFloat(cs.opacity) < 1;
  const currentFont = cs.fontFamily;

  const setStyle = (prop: string, val: string) => {
    // Apply visually right away so the user sees the change without waiting
    // for the React re-render. The Editor callback then commits it to the
    // store, which triggers the canonical apply via the _fieldStyles effect
    // in Canvas — both paths land on the same DOM state.
    (element.style as unknown as Record<string, string>)[prop] = val;
    onStyleChange(prop, val);
  };

  // Find which font option matches (by checking if the current fontFamily contains the option value)
  const matchedFont = FONT_OPTIONS.find(f => currentFont.includes(f.label))?.value || '';

  return (
    <div
      style={{
        height: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 16px', color: '#141413', fontFamily: 'inherit',
        overflow: 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Background color */}
      <span style={label}>{t('stylePanel.background')}</span>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {BRAND_COLORS.map(c => (
          <Swatch key={'bg-' + c} color={c} active={bgC === c} onClick={() => setStyle('backgroundColor', c)} />
        ))}
        <ColorPicker value={bgC} onChange={(v) => setStyle('backgroundColor', v)} />
      </div>

      <div style={divider} />

      {/* Text color */}
      <span style={label}>{t('stylePanel.text')}</span>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {BRAND_COLORS.map(c => (
          <Swatch key={'tx-' + c} color={c} active={txC === c} onClick={() => setStyle('color', c)} />
        ))}
        <ColorPicker value={txC} onChange={(v) => setStyle('color', v)} />
      </div>

      <div style={divider} />

      {/* Font family */}
      <select
        value={matchedFont}
        onChange={(e) => setStyle('fontFamily', e.target.value)}
        style={{
          fontSize: 11, padding: '2px 4px', borderRadius: 4,
          border: '1px solid #e8e6dc', background: '#fff', color: '#141413',
          cursor: 'pointer', fontFamily: 'inherit', maxWidth: 90,
        }}
        title={t('stylePanel.font')}
      >
        <option value="" disabled>{t('stylePanel.font')}</option>
        {FONT_OPTIONS.map(f => (
          <option key={f.value} value={f.value}>{f.label}</option>
        ))}
      </select>

      {/* Font size */}
      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
        <button
          onClick={() => setStyle('fontSize', Math.max(8, fs - 2) + 'px')}
          style={iconBtn}
          title={t('stylePanel.smaller')}
        >
          &#8722;
        </button>
        <span style={{ fontSize: 12, color: '#141413', fontWeight: 500, width: 28, textAlign: 'center' }}>
          {fs}
        </span>
        <button
          onClick={() => setStyle('fontSize', Math.min(200, fs + 2) + 'px')}
          style={iconBtn}
          title={t('stylePanel.larger')}
        >
          +
        </button>
      </div>

      <div style={divider} />

      {/* Bold */}
      <button
        onClick={() => setStyle('fontWeight', isBold ? '400' : '700')}
        style={toggleBtn(isBold)}
        title={t('stylePanel.bold')}
      >
        B
      </button>

      {/* Text alignment: left / center / right */}
      {(['left', 'center', 'right'] as const).map(align => (
        <button
          key={align}
          onClick={() => setStyle('textAlign', align)}
          style={toggleBtn(textAlign === align)}
          title={align === 'left' ? t('stylePanel.align_left') : align === 'center' ? t('stylePanel.align_center') : t('stylePanel.align_right')}
        >
          <AlignIcon align={align} />
        </button>
      ))}

      {/* Transparency */}
      <button
        onClick={() => setStyle('opacity', isTransparent ? '1' : '0.5')}
        style={{ ...toggleBtn(isTransparent), width: 38, fontSize: 10, fontWeight: 400 }}
        title={t('stylePanel.opacity')}
      >
        {t('stylePanel.transparent')}
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          background: 'transparent', border: 'none', color: '#b0aea5',
          cursor: 'pointer', fontSize: 14, padding: '4px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'inherit',
        }}
        title={t('stylePanel.close')}
      >
        ✕
      </button>
    </div>
  );
}
