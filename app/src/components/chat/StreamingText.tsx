'use client';
import { useState, useEffect } from 'react';

export function StreamingText({ text, speed = 30, style }: { text: string; speed?: number; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown(n => n + 1), speed);
    return () => clearTimeout(t);
  }, [shown, text, speed]);
  return <span style={style}>{text.slice(0, shown)}{shown < text.length ? '\u258d' : ''}</span>;
}
