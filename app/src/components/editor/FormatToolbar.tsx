'use client';

import React from 'react';
import { useT } from '@/lib/i18n';

interface FormatToolbarProps {
  x: number;
  y: number;
  onFormat: (cmd: string, val?: string) => void;
}

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  width: 28,
  height: 28,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  fontFamily: 'inherit',
};

const separatorStyle: React.CSSProperties = {
  width: 1,
  background: 'rgba(255,255,255,0.2)',
  margin: '2px 4px',
};

export function FormatToolbar({ x, y, onFormat }: FormatToolbarProps) {
  const t = useT();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translateX(-50%)',
        background: '#141413',
        color: '#fff',
        borderRadius: 8,
        padding: '4px 6px',
        display: 'flex',
        gap: 2,
        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        zIndex: 100,
        fontSize: 13,
        fontFamily: 'inherit',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button
        onClick={() => onFormat('bold')}
        style={btnStyle}
        title={t('format.bold')}
      >
        <b>B</b>
      </button>
      <button
        onClick={() => onFormat('italic')}
        style={btnStyle}
        title={t('format.italic')}
      >
        <i>I</i>
      </button>
      <button
        onClick={() => onFormat('underline')}
        style={btnStyle}
        title={t('format.underline')}
      >
        <u>U</u>
      </button>
      <div style={separatorStyle} />
      {/* Font size */}
      <button
        onClick={() => onFormat('fontSize', '2')}
        style={btnStyle}
        title={t('format.decrease_size')}
      >
        A-
      </button>
      <button
        onClick={() => onFormat('fontSize', '5')}
        style={btnStyle}
        title={t('format.increase_size')}
      >
        A+
      </button>
      <div style={separatorStyle} />
      {/* Color dots — matches BRAND_COLORS from StylePanel */}
      {[
        { color: '#d97757', labelKey: 'format.orange' as const },
        { color: '#6a9bcc', labelKey: 'format.blue' as const },
        { color: '#788c5d', labelKey: 'format.green' as const },
        { color: '#141413', labelKey: 'format.black' as const, display: '#faf9f5' },
        { color: '#b0aea5', labelKey: 'format.gray' as const },
        { color: '#fff', labelKey: 'format.white' as const, display: '#e8e6dc' },
      ].map(({ color, labelKey, display }) => (
        <button
          key={color}
          onClick={() => onFormat('foreColor', color)}
          style={{ ...btnStyle, color: display || color }}
          title={t(labelKey)}
        >
          &#9679;
        </button>
      ))}
    </div>
  );
}
