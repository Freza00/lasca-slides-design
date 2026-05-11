// ============================================================================
// Lasca — CompositionThumb
// ============================================================================
// Abstract SVG schematic for a card-canvas composition. One schematic per
// canonical composition id (see compositionRegistry.ts).
//
// Chrome (bg/radius/shadow/border) is a THEME decision — the thumb does NOT
// commit to chrome for any composition. Every schematic shows content
// positioning (regionBars) only. The geometry itself (column ratios, row
// splits, asymmetric bento proportions) is the visual signal.
// ============================================================================

import type { JSX } from 'react';

export interface CompositionThumbProps {
  compositionId: string;
  active?: boolean;
  /** sm = 36×22 (picker strip), md = 48×30 (popover cell). */
  size?: 'sm' | 'md';
}

const COLORS = {
  stroke: '#a8a59c',
  fill: '#f5f3ef',
  activeStroke: '#d97757',
  activeFill: '#fdf6f2',
  data: '#c0a07a',
  dataActive: '#d97757',
};

export function CompositionThumb({ compositionId, active = false, size = 'md' }: CompositionThumbProps): JSX.Element {
  const s = active ? COLORS.activeStroke : COLORS.stroke;
  const f = active ? COLORS.activeFill : COLORS.fill;
  const d = active ? COLORS.dataActive : COLORS.data;
  const sw = size === 'sm' ? 1 : 1.2;
  const W = size === 'sm' ? 36 : 48;
  const H = size === 'sm' ? 22 : 30;

  const frame = (
    <rect x="0.5" y="0.5" width="47" height="29" rx="3" fill={f} stroke={s} strokeWidth={sw} />
  );
  /** Hairline subdivider between regions — communicates grid structure
   *  without committing to chrome (which is a theme decision). */
  const divH = (x1: number, x2: number, y: number) => (
    <line x1={x1} y1={y} x2={x2} y2={y} stroke={s} strokeWidth="0.4" opacity="0.35" />
  );
  const divV = (x: number, y1: number, y2: number) => (
    <line x1={x} y1={y1} x2={x} y2={y2} stroke={s} strokeWidth="0.4" opacity="0.35" />
  );
  /** 1-3 content bars positioned inside a region (no outline drawn). */
  const regionBars = (
    x: number, y: number, w: number, h: number,
    lines: number = 2, emphasis?: 'hero',
  ): JSX.Element => {
    const pad = Math.min(2, w * 0.15);
    const barW = w - pad * 2;
    const startY = y + pad + 1.2;
    const gap = 1.8;
    const bars: JSX.Element[] = [];
    for (let i = 0; i < lines; i++) {
      const barH = i === 0 ? 1.4 : 1;
      const barOpacity = i === 0 ? 0.55 : 0.3;
      const width = i === 0 ? barW : barW * (0.7 - i * 0.15);
      const color = i === 0 && emphasis === 'hero' ? d : s;
      const yPos = startY + i * (gap + 1);
      if (yPos + barH > y + h - pad) break;
      bars.push(
        <rect key={i} x={x + pad} y={yPos} width={Math.max(width, 3)} height={barH} rx="0.5" fill={color} opacity={barOpacity} />
      );
    }
    return <>{bars}</>;
  };
  const bar = (x: number, y: number, w: number, h: number, opacity = 0.35) => (
    <rect x={x} y={y} width={w} height={h} rx="0.5" fill={s} opacity={opacity} />
  );

  const schemas: Record<string, JSX.Element> = {
    // ── Full ─────────────────────────────────────────────────────────
    // Full-bleed: role-dispatched at render time (chart / table / diagram /
    // big-number each render differently), so the thumb shows a generic
    // "filled page with one emphasized bar" as a catch-all.
    'full-bleed': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        <rect x="2" y="2" width="44" height="26" rx="2" fill={d} opacity="0.18" />
        <rect x="6" y="12" width="36" height="8" rx="1" fill={d} opacity="0.35" />
      </svg>
    ),
    'full-center': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {bar(10, 11, 28, 3, 0.75)}
        {bar(14, 16, 20, 1.6, 0.35)}
        {bar(18, 20, 12, 1.2, 0.25)}
      </svg>
    ),

    // ── Split (bare) ─────────────────────────────────────────────────
    'split-equal': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {regionBars(4, 6, 19, 20, 3)}
        {regionBars(25, 6, 19, 20, 3)}
      </svg>
    ),
    'split-media': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        <rect x="2" y="2" width="22" height="26" rx="2" fill={s} opacity="0.15" />
        <circle cx="10" cy="11" r="3" fill={s} opacity="0.25" />
        <path d="M2,23 L12,15 L18,19 L24,14 L24,28 L2,28 Z" fill={s} opacity="0.2" />
        {bar(27, 10, 16, 2, 0.6)}{bar(27, 15, 12, 1.5, 0.3)}{bar(27, 19, 14, 1.5, 0.3)}
      </svg>
    ),
    'split-60-40': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(30, 4, 26)}
        {regionBars(4, 6, 24, 20, 3)}
        {regionBars(32, 6, 12, 20, 2)}
      </svg>
    ),
    'split-40-60': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(20, 4, 26)}
        {regionBars(4, 6, 14, 20, 2)}
        {regionBars(22, 6, 22, 20, 3)}
      </svg>
    ),

    // ── Stack (vertical 2-slot) ─────────────────────────────────────
    'stack-text-media': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divH(4, 44, 13)}
        {regionBars(4, 4, 40, 8, 2)}
        <rect x="4" y="15" width="40" height="12" rx="1.5" fill={s} opacity="0.18" />
        <circle cx="12" cy="20" r="2" fill={s} opacity="0.3" />
        <path d="M4,26 L14,20 L22,24 L30,19 L44,25 L44,27 L4,27 Z" fill={s} opacity="0.22" />
      </svg>
    ),
    'stack-media-text': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divH(4, 44, 17)}
        <rect x="4" y="3" width="40" height="12" rx="1.5" fill={s} opacity="0.18" />
        <circle cx="12" cy="8" r="2" fill={s} opacity="0.3" />
        <path d="M4,14 L14,8 L22,12 L30,7 L44,13 L44,15 L4,15 Z" fill={s} opacity="0.22" />
        {regionBars(4, 18, 40, 8, 2)}
      </svg>
    ),

    // ── Grid (bare — plain columns) ──────────────────────────────────
    'grid-2col': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {regionBars(4, 8, 19, 16, 3)}
        {regionBars(25, 8, 19, 16, 3)}
      </svg>
    ),
    'grid-3col': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {regionBars(4, 8, 12, 16, 3)}
        {regionBars(18, 8, 12, 16, 3)}
        {regionBars(32, 8, 12, 16, 3)}
      </svg>
    ),
    'grid-4col': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {regionBars(3, 8, 10, 16, 2)}
        {regionBars(14, 8, 10, 16, 2)}
        {regionBars(25, 8, 10, 16, 2)}
        {regionBars(36, 8, 9, 16, 2)}
      </svg>
    ),
    'grid-2x2': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(24, 4, 26)}
        {divH(4, 44, 15)}
        {regionBars(4, 5, 19, 9, 2)}
        {regionBars(25, 5, 19, 9, 2)}
        {regionBars(4, 17, 19, 9, 2)}
        {regionBars(25, 17, 19, 9, 2)}
      </svg>
    ),

    // ── Bento (asymmetric grid — geometry carries the signal) ──────
    // No tile outlines: chrome is a theme decision and the thumb shouldn't
    // promise what the renderer may not draw. The column-ratio dividers
    // make the asymmetric 1.6fr:1fr proportions readable on their own.
    'bento-1+2': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(28, 3, 27)}
        {divH(28, 45, 15)}
        {regionBars(3, 3, 24, 24, 3, 'hero')}
        {regionBars(29, 3, 16, 11, 1)}
        {regionBars(29, 16, 16, 11, 1)}
      </svg>
    ),
    'bento-1+3': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(24, 3, 27)}
        {divH(24, 45, 11)}
        {divH(24, 45, 20)}
        {regionBars(3, 3, 20, 24, 3, 'hero')}
        {regionBars(25, 3, 20, 7, 1)}
        {regionBars(25, 12, 20, 7, 1)}
        {regionBars(25, 21, 20, 6, 1)}
      </svg>
    ),
    'bento-1+4': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(24, 3, 27)}
        {divH(24, 45, 15)}
        {divV(35, 3, 27)}
        {regionBars(3, 3, 20, 24, 3, 'hero')}
        {regionBars(25, 3, 9.5, 11, 1)}
        {regionBars(35.5, 3, 9.5, 11, 1)}
        {regionBars(25, 16, 9.5, 11, 1)}
        {regionBars(35.5, 16, 9.5, 11, 1)}
      </svg>
    ),
    'bento-2x3': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {divV(17, 3, 27)}
        {divV(31, 3, 27)}
        {divH(3, 45, 15)}
        {regionBars(3, 3, 13, 11, 1)}
        {regionBars(17.5, 3, 13, 11, 1)}
        {regionBars(32, 3, 13, 11, 1)}
        {regionBars(3, 16, 13, 11, 1)}
        {regionBars(17.5, 16, 13, 11, 1)}
        {regionBars(32, 16, 13, 11, 1)}
      </svg>
    ),

    // ── Banner (hero/title zone + tile row — all bare) ──────────────
    'hero-grid': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {/* hero zone: bold primary bar + muted desc bar */}
        <rect x="4" y="6" width="40" height="1.8" rx="0.5" fill={d} opacity="0.6" />
        <rect x="4" y="9" width="26" height="1.2" rx="0.5" fill={s} opacity="0.35" />
        {regionBars(3, 15, 13, 12, 2)}
        {regionBars(17.5, 15, 13, 12, 2)}
        {regionBars(32, 15, 13, 12, 2)}
      </svg>
    ),
    'title-grid': (
      <svg width={W} height={H} viewBox="0 0 48 30">{frame}
        {/* title zone: stacked bars in the left column */}
        <rect x="4" y="8" width="13" height="2" rx="0.5" fill={d} opacity="0.65" />
        <rect x="4" y="12" width="10" height="1" rx="0.5" fill={s} opacity="0.35" />
        <rect x="4" y="14.5" width="11" height="1" rx="0.5" fill={s} opacity="0.3" />
        {regionBars(20, 4, 12, 22, 3)}
        {regionBars(33, 4, 12, 22, 3)}
      </svg>
    ),
  };

  return schemas[compositionId] ?? (
    <svg width={W} height={H} viewBox="0 0 48 30">{frame}
      {bar(10, 13, 28, 4, 0.3)}
    </svg>
  );
}
