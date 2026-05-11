'use client';
import { useState, useEffect } from 'react';

const chars = ['\u00b7', '\u273b', '\u273d', '\u2736', '\u2733', '\u2722'];

export function GlimmerSpinner({ color = '#d97757', size }: { color?: string; size?: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % chars.length), 150);
    return () => clearInterval(t);
  }, []);
  const sz = size ?? 14;
  return (
    <span style={{ color, fontSize: sz, fontWeight: 700, display: 'inline-block', width: sz, height: sz, textAlign: 'center', lineHeight: `${sz}px`, flexShrink: 0 }}>
      {chars[idx]}
    </span>
  );
}
