/**
 * Shared layout thumbnail SVGs — abstract schematics showing layout structure.
 * Used by both SlideToolbar (editor) and MdContextCard (create flow).
 * Each is rendered at a base 48×30 (16:9 ratio), scalable via CSS.
 */
import type { JSX } from 'react';
import type { Layout } from '@/lib/types';

export interface LayoutThumbProps {
  layout: Layout;
  active?: boolean;
  /** Slide thumbs: sm = 36×22, md = 48×30. Report layouts auto-switch to portrait. */
  size?: 'sm' | 'md';
  /** Force portrait rendering even for non-report layouts (e.g. report format in GenerationPreview). */
  forcePortrait?: boolean;
}

/** Map generic slide layouts to the closest report-layout wireframe. */
function mapToReportLayout(layout: Layout): string {
  if (layout === 'report-cover' || layout === 'report-section' || layout === 'report-body' || layout === 'report-quote') return layout;
  if (layout === 'cover') return 'report-cover';
  if (layout === 'section-break') return 'report-section';
  if (layout === 'quote') return 'report-quote';
  return 'report-body';
}

const COLORS = {
  stroke: '#a8a59c',
  fill: '#f5f3ef',
  activeStroke: '#d97757',
  activeFill: '#fdf6f2',
  data: '#c0a07a',       // warm accent for chart data elements
  dataActive: '#d97757',
};

export function LayoutThumb({ layout, active = false, size = 'md', forcePortrait = false }: LayoutThumbProps): JSX.Element {
  const isReportLayout = forcePortrait
    || layout === 'report-cover'
    || layout === 'report-section'
    || layout === 'report-body'
    || layout === 'report-quote';
  const s = active ? COLORS.activeStroke : COLORS.stroke;
  const f = active ? COLORS.activeFill : COLORS.fill;
  const d = active ? COLORS.dataActive : COLORS.data; // warm data accent
  const sw = size === 'sm' ? 1 : 1.2;
  const W = size === 'sm'
    ? (isReportLayout ? 22 : 36)
    : (isReportLayout ? 30 : 48);
  const H = size === 'sm'
    ? (isReportLayout ? 36 : 22)
    : (isReportLayout ? 48 : 30);

  const frame = isReportLayout
    ? <rect x="0.5" y="0.5" width="29" height="47" rx="3" fill={f} stroke={s} strokeWidth={sw} />
    : <rect x="0.5" y="0.5" width="47" height="29" rx="3" fill={f} stroke={s} strokeWidth={sw} />;

  const thumbs: Record<string, JSX.Element> = {
    // ── Content layouts ──────────────────────────────────────────────
    'cover': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="10" y="10" width="28" height="3.5" rx="1.2" fill={s} opacity="0.8" />
        <rect x="14" y="16" width="20" height="2" rx="0.8" fill={s} opacity="0.35" />
        <rect x="18" y="21" width="12" height="1.5" rx="0.6" fill={s} opacity="0.2" />
      </svg>
    ),
    'big-number': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <text x="24" y="17" textAnchor="middle" fontSize="13" fontWeight="800" fill={d} opacity="0.85">84</text>
        <rect x="14" y="22" width="20" height="1.8" rx="0.6" fill={s} opacity="0.3" />
      </svg>
    ),
    'three-cards': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="10" y="4" width="28" height="2" rx="0.8" fill={s} opacity="0.4" />
        <rect x="4" y="9" width="12" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="18" y="9" width="12" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="32" y="9" width="12" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="6" y="12" width="8" height="1.2" rx="0.5" fill={s} opacity="0.4" />
        <rect x="20" y="12" width="8" height="1.2" rx="0.5" fill={s} opacity="0.4" />
        <rect x="34" y="12" width="8" height="1.2" rx="0.5" fill={s} opacity="0.4" />
      </svg>
    ),
    'two-column': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="10" y="4" width="28" height="2" rx="0.8" fill={s} opacity="0.4" />
        <rect x="4" y="9" width="19" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="25" y="9" width="19" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="6" y="12" width="12" height="1.2" rx="0.5" fill={s} opacity="0.4" />
        <rect x="27" y="12" width="12" height="1.2" rx="0.5" fill={s} opacity="0.4" />
      </svg>
    ),
    'stacked-bars': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="6" y="6" width="34" height="3.5" rx="1.2" fill={d} opacity="0.75" />
        <rect x="6" y="12" width="27" height="3.5" rx="1.2" fill={d} opacity="0.55" />
        <rect x="6" y="18" width="20" height="3.5" rx="1.2" fill={d} opacity="0.4" />
        <rect x="6" y="24" width="13" height="3.5" rx="1.2" fill={d} opacity="0.28" />
      </svg>
    ),
    'grid-cards': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="4" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="18" y="4" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="32" y="4" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="4" y="16" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="18" y="16" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
        <rect x="32" y="16" width="12" height="9" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.8" />
      </svg>
    ),
    'quote': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <text x="7" y="15" fontSize="16" fontWeight="700" fill={d} opacity="0.3">&ldquo;</text>
        <rect x="14" y="10" width="26" height="2" rx="0.8" fill={s} opacity="0.5" />
        <rect x="14" y="15" width="22" height="1.8" rx="0.8" fill={s} opacity="0.3" />
        <rect x="14" y="22" width="14" height="1.5" rx="0.6" fill={s} opacity="0.25" />
      </svg>
    ),
    'image': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="2" y="2" width="20" height="26" rx="2" fill={s} opacity="0.1" />
        <circle cx="9" cy="10" r="3" fill={s} opacity="0.15" />
        <path d="M2,22 L10,16 L16,20 L22,14 L22,28 L2,28 Z" fill={s} opacity="0.1" />
        <rect x="26" y="10" width="18" height="3" rx="1" fill={s} opacity="0.7" />
        <rect x="26" y="16" width="14" height="1.8" rx="0.6" fill={s} opacity="0.35" />
        <rect x="26" y="21" width="10" height="1.5" rx="0.6" fill={s} opacity="0.25" />
      </svg>
    ),
    'title-body': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="6" y="5" width="22" height="3" rx="1" fill={s} opacity="0.7" />
        <rect x="6" y="12" width="36" height="1.5" rx="0.6" fill={s} opacity="0.3" />
        <rect x="6" y="16" width="34" height="1.5" rx="0.6" fill={s} opacity="0.25" />
        <rect x="6" y="20" width="30" height="1.5" rx="0.6" fill={s} opacity="0.2" />
        <rect x="6" y="24" width="24" height="1.5" rx="0.6" fill={s} opacity="0.15" />
      </svg>
    ),
    'split-image': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="2" y="2" width="20" height="26" rx="2" fill={s} opacity="0.1" />
        <circle cx="12" cy="12" r="4" fill={s} opacity="0.15" />
        <rect x="26" y="6" width="18" height="2.5" rx="0.8" fill={s} opacity="0.7" />
        <rect x="26" y="12" width="16" height="1.5" rx="0.6" fill={s} opacity="0.3" />
        <rect x="26" y="16" width="12" height="1.5" rx="0.6" fill={s} opacity="0.2" />
      </svg>
    ),
    'icon-list': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="8" cy="10" r="2.5" fill={d} opacity="0.45" />
        <rect x="14" y="9" width="20" height="1.8" rx="0.6" fill={s} opacity="0.4" />
        <circle cx="8" cy="17" r="2.5" fill={d} opacity="0.35" />
        <rect x="14" y="16" width="18" height="1.8" rx="0.6" fill={s} opacity="0.3" />
        <circle cx="8" cy="24" r="2.5" fill={d} opacity="0.25" />
        <rect x="14" y="23" width="16" height="1.8" rx="0.6" fill={s} opacity="0.25" />
      </svg>
    ),
    'timeline': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <line x1="6" y1="15" x2="42" y2="15" stroke={s} strokeWidth="1" opacity="0.2" />
        <circle cx="10" cy="15" r="3" fill={d} opacity="0.6" />
        <circle cx="24" cy="15" r="3" fill={d} opacity="0.45" />
        <circle cx="38" cy="15" r="3" fill={d} opacity="0.35" />
        <rect x="6" y="20" width="8" height="1.2" rx="0.5" fill={s} opacity="0.25" />
        <rect x="20" y="20" width="8" height="1.2" rx="0.5" fill={s} opacity="0.2" />
        <rect x="34" y="20" width="8" height="1.2" rx="0.5" fill={s} opacity="0.15" />
      </svg>
    ),
    'table': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="4" width="40" height="5" rx="1.2" fill={d} opacity="0.15" />
        <line x1="4" y1="12" x2="44" y2="12" stroke={s} strokeWidth="0.6" opacity="0.25" />
        <line x1="4" y1="17" x2="44" y2="17" stroke={s} strokeWidth="0.6" opacity="0.2" />
        <line x1="4" y1="22" x2="44" y2="22" stroke={s} strokeWidth="0.6" opacity="0.15" />
        <line x1="18" y1="4" x2="18" y2="26" stroke={s} strokeWidth="0.6" opacity="0.2" />
        <line x1="32" y1="4" x2="32" y2="26" stroke={s} strokeWidth="0.6" opacity="0.2" />
      </svg>
    ),
    'agenda': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="6" y="4" width="16" height="2.5" rx="0.8" fill={s} opacity="0.6" />
        <circle cx="8" cy="12" r="2" fill={d} opacity="0.4" />
        <rect x="13" y="11" width="20" height="1.5" rx="0.6" fill={s} opacity="0.35" />
        <circle cx="8" cy="18" r="2" fill={d} opacity="0.3" />
        <rect x="13" y="17" width="18" height="1.5" rx="0.6" fill={s} opacity="0.28" />
        <circle cx="8" cy="24" r="2" fill={d} opacity="0.22" />
        <rect x="13" y="23" width="22" height="1.5" rx="0.6" fill={s} opacity="0.22" />
      </svg>
    ),
    'team': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="12" cy="12" r="4" fill={d} opacity="0.2" />
        <rect x="7" y="19" width="10" height="1.5" rx="0.6" fill={s} opacity="0.3" />
        <circle cx="24" cy="12" r="4" fill={d} opacity="0.2" />
        <rect x="19" y="19" width="10" height="1.5" rx="0.6" fill={s} opacity="0.3" />
        <circle cx="36" cy="12" r="4" fill={d} opacity="0.2" />
        <rect x="31" y="19" width="10" height="1.5" rx="0.6" fill={s} opacity="0.3" />
      </svg>
    ),
    'logo-wall': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="5" y="5" width="10" height="7" rx="1.5" fill={s} opacity="0.12" />
        <rect x="19" y="5" width="10" height="7" rx="1.5" fill={s} opacity="0.12" />
        <rect x="33" y="5" width="10" height="7" rx="1.5" fill={s} opacity="0.12" />
        <rect x="5" y="17" width="10" height="7" rx="1.5" fill={s} opacity="0.09" />
        <rect x="19" y="17" width="10" height="7" rx="1.5" fill={s} opacity="0.09" />
        <rect x="33" y="17" width="10" height="7" rx="1.5" fill={s} opacity="0.09" />
      </svg>
    ),
    'pricing': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="5" width="12" height="21" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.7" />
        <rect x="18" y="3" width="12" height="23" rx="2" fill="#fff" stroke={d} strokeWidth="1" opacity="0.8" />
        <rect x="32" y="5" width="12" height="21" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.7" />
        <rect x="21" y="5.5" width="6" height="2" rx="0.6" fill={d} opacity="0.5" />
      </svg>
    ),
    'device-mockup': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="16" y="3" width="16" height="22" rx="2.5" fill="#fff" stroke={s} strokeWidth="1" opacity="0.8" />
        <rect x="18" y="6" width="12" height="14" rx="0.8" fill={s} opacity="0.08" />
        <circle cx="24" cy="23" r="1" fill={s} opacity="0.25" />
      </svg>
    ),
    'section-break': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="8" y="11" width="32" height="4" rx="1.2" fill={s} opacity="0.55" />
        <rect x="14" y="18" width="20" height="2" rx="0.8" fill={s} opacity="0.2" />
      </svg>
    ),
    'stat-row': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <text x="10" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill={d} opacity="0.65">42</text>
        <text x="24" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill={d} opacity="0.5">87</text>
        <text x="38" y="15" textAnchor="middle" fontSize="7" fontWeight="700" fill={d} opacity="0.4">5k</text>
        <rect x="5" y="19" width="10" height="1.2" rx="0.5" fill={s} opacity="0.2" />
        <rect x="19" y="19" width="10" height="1.2" rx="0.5" fill={s} opacity="0.2" />
        <rect x="33" y="19" width="10" height="1.2" rx="0.5" fill={s} opacity="0.2" />
      </svg>
    ),

    // ── Charts ────────────────────────────────────────────────────────
    'bar-chart': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* Axes */}
        <line x1="8" y1="24" x2="42" y2="24" stroke={s} strokeWidth="0.7" opacity="0.25" />
        <line x1="8" y1="6" x2="8" y2="24" stroke={s} strokeWidth="0.7" opacity="0.25" />
        {/* Bars */}
        <rect x="12" y="17" width="5" height="7" rx="1" fill={d} opacity="0.85" />
        <rect x="19" y="12" width="5" height="12" rx="1" fill={d} opacity="0.65" />
        <rect x="26" y="8" width="5" height="16" rx="1" fill={d} opacity="0.9" />
        <rect x="33" y="14" width="5" height="10" rx="1" fill={d} opacity="0.5" />
      </svg>
    ),
    'horizontal-bar-chart': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* Axis */}
        <line x1="10" y1="5" x2="10" y2="25" stroke={s} strokeWidth="0.7" opacity="0.25" />
        {/* Bars */}
        <rect x="10" y="6" width="28" height="4" rx="1" fill={d} opacity="0.8" />
        <rect x="10" y="13" width="20" height="4" rx="1" fill={d} opacity="0.55" />
        <rect x="10" y="20" width="14" height="4" rx="1" fill={d} opacity="0.4" />
        {/* Labels */}
        <rect x="4" y="7.5" width="4" height="1" rx="0.4" fill={s} opacity="0.3" />
        <rect x="4" y="14.5" width="4" height="1" rx="0.4" fill={s} opacity="0.25" />
        <rect x="4" y="21.5" width="4" height="1" rx="0.4" fill={s} opacity="0.2" />
      </svg>
    ),
    'line-chart': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* Grid lines */}
        <line x1="8" y1="24" x2="42" y2="24" stroke={s} strokeWidth="0.6" opacity="0.2" />
        <line x1="8" y1="16" x2="42" y2="16" stroke={s} strokeWidth="0.4" opacity="0.1" strokeDasharray="2,2" />
        <line x1="8" y1="8" x2="42" y2="8" stroke={s} strokeWidth="0.4" opacity="0.1" strokeDasharray="2,2" />
        <line x1="8" y1="6" x2="8" y2="24" stroke={s} strokeWidth="0.6" opacity="0.2" />
        {/* Line */}
        <polyline points="10,20 17,14 24,17 31,9 38,12" fill="none" stroke={d} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
        {/* Data points */}
        <circle cx="10" cy="20" r="1.5" fill={d} opacity="0.7" />
        <circle cx="17" cy="14" r="1.5" fill={d} opacity="0.7" />
        <circle cx="24" cy="17" r="1.5" fill={d} opacity="0.7" />
        <circle cx="31" cy="9" r="1.5" fill={d} opacity="0.9" />
        <circle cx="38" cy="12" r="1.5" fill={d} opacity="0.7" />
      </svg>
    ),
    'pie-chart': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="20" cy="15" r="10" fill="none" stroke={s} strokeWidth="0.8" opacity="0.3" />
        <path d="M20 15 L20 5 A10 10 0 0 1 28.66 10 Z" fill={d} opacity="0.75" />
        <path d="M20 15 L28.66 10 A10 10 0 0 1 28.66 20 Z" fill={d} opacity="0.45" />
        <path d="M20 15 L28.66 20 A10 10 0 0 1 20 25 Z" fill={d} opacity="0.25" />
        {/* Legend */}
        <rect x="35" y="9" width="3" height="3" rx="0.6" fill={d} opacity="0.7" />
        <rect x="35" y="15" width="3" height="3" rx="0.6" fill={d} opacity="0.4" />
        <rect x="35" y="21" width="3" height="3" rx="0.6" fill={d} opacity="0.22" />
      </svg>
    ),

    // ── Diagrams ──────────────────────────────────────────────────────
    'flowchart': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="11" width="10" height="8" rx="2" fill="#fff" stroke={d} strokeWidth="0.9" opacity="0.8" />
        <rect x="19" y="11" width="10" height="8" rx="2" fill="#fff" stroke={d} strokeWidth="0.9" opacity="0.7" />
        <rect x="34" y="11" width="10" height="8" rx="2" fill="#fff" stroke={d} strokeWidth="0.9" opacity="0.6" />
        {/* Arrows */}
        <line x1="14" y1="15" x2="18" y2="15" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <polyline points="17,13.5 19,15 17,16.5" fill="none" stroke={s} strokeWidth="0.7" opacity="0.5" />
        <line x1="29" y1="15" x2="33" y2="15" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <polyline points="32,13.5 34,15 32,16.5" fill="none" stroke={s} strokeWidth="0.7" opacity="0.5" />
      </svg>
    ),
    'funnel': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <path d="M8,5 L40,5 L40,9 L8,9 Z" fill={d} opacity="0.6" rx="1" />
        <path d="M12,11 L36,11 L36,15 L12,15 Z" fill={d} opacity="0.42" />
        <path d="M16,17 L32,17 L32,21 L16,21 Z" fill={d} opacity="0.28" />
        <path d="M20,23 L28,23 L28,27 L20,27 Z" fill={d} opacity="0.18" />
      </svg>
    ),
    'pyramid': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <path d="M24,4 L18,14 L30,14 Z" fill={d} opacity="0.55" />
        <path d="M18,15 L30,15 L34,24 L14,24 Z" fill={d} opacity="0.3" />
        <line x1="18" y1="14.5" x2="30" y2="14.5" stroke={f} strokeWidth="1" />
      </svg>
    ),
    'steps': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* Vertical connector */}
        <line x1="10" y1="11" x2="10" y2="19" stroke={s} strokeWidth="0.7" opacity="0.2" strokeDasharray="1.5,1.5" />
        {/* Step 1 */}
        <circle cx="10" cy="8" r="3.5" fill={d} opacity="0.55" />
        <text x="10" y="10" textAnchor="middle" fontSize="4.5" fontWeight="600" fill="#fff">1</text>
        <rect x="16" y="6.5" width="16" height="1.5" rx="0.6" fill={s} opacity="0.35" />
        {/* Step 2 */}
        <circle cx="10" cy="22" r="3.5" fill={d} opacity="0.38" />
        <text x="10" y="24" textAnchor="middle" fontSize="4.5" fontWeight="600" fill="#fff">2</text>
        <rect x="16" y="20.5" width="12" height="1.5" rx="0.6" fill={s} opacity="0.25" />
      </svg>
    ),
    'matrix': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <line x1="24" y1="4" x2="24" y2="26" stroke={s} strokeWidth="0.7" opacity="0.25" />
        <line x1="6" y1="15" x2="42" y2="15" stroke={s} strokeWidth="0.7" opacity="0.25" />
        <circle cx="14" cy="10" r="2.5" fill={d} opacity="0.5" />
        <circle cx="34" cy="10" r="2.5" fill={d} opacity="0.35" />
        <circle cx="14" cy="21" r="2.5" fill={d} opacity="0.25" />
        <circle cx="34" cy="21" r="2.5" fill={d} opacity="0.45" />
      </svg>
    ),
    'versus': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="6" width="16" height="18" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.7" />
        <rect x="28" y="6" width="16" height="18" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.7" />
        <circle cx="24" cy="15" r="4.5" fill={d} opacity="0.35" />
        <text x="24" y="17" textAnchor="middle" fontSize="5" fontWeight="700" fill={d} opacity="0.7">vs</text>
      </svg>
    ),
    'venn': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="18" cy="15" r="8" fill={d} opacity="0.12" stroke={d} strokeWidth="0.8" />
        <circle cx="30" cy="15" r="8" fill={d} opacity="0.12" stroke={d} strokeWidth="0.8" />
      </svg>
    ),
    'bullseye': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="24" cy="15" r="12" fill="none" stroke={d} strokeWidth="0.7" opacity="0.2" />
        <circle cx="24" cy="15" r="8" fill="none" stroke={d} strokeWidth="0.8" opacity="0.35" />
        <circle cx="24" cy="15" r="4" fill={d} opacity="0.45" />
      </svg>
    ),
    'cycle': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="24" cy="7" r="3.5" fill={d} opacity="0.45" />
        <circle cx="14" cy="22" r="3.5" fill={d} opacity="0.35" />
        <circle cx="34" cy="22" r="3.5" fill={d} opacity="0.35" />
        {/* Connecting arcs with arrow indicators */}
        <path d="M27,9 L31,19" stroke={s} strokeWidth="0.8" opacity="0.3" />
        <polyline points="30,17 31,19 29,19" fill="none" stroke={s} strokeWidth="0.6" opacity="0.3" />
        <path d="M21,9 L17,19" stroke={s} strokeWidth="0.8" opacity="0.3" />
        <polyline points="18,17 17,19 19,19" fill="none" stroke={s} strokeWidth="0.6" opacity="0.3" />
        <path d="M17.5,23 L30.5,23" stroke={s} strokeWidth="0.8" opacity="0.3" />
        <polyline points="29,21.5 31,23 29,24.5" fill="none" stroke={s} strokeWidth="0.6" opacity="0.3" />
      </svg>
    ),

    // ── Additional layouts (v5/v6) ────────────────────────────────────
    'featured-grid': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* Top: title + subtitle text lines */}
        <rect x="4" y="4" width="22" height="3" rx="1" fill={s} opacity="0.6" />
        <rect x="4" y="9" width="16" height="2" rx="0.6" fill={s} opacity="0.3" />
        {/* Divider */}
        <line x1="4" y1="13" x2="44" y2="13" stroke={s} strokeWidth="0.5" opacity="0.2" />
        {/* Bottom: 3 card tiles */}
        <rect x="3" y="15" width="13" height="12" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="17.5" y="15" width="13" height="12" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="32" y="15" width="13" height="12" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
      </svg>
    ),
    'bento': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="3" y="3" width="20" height="12" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.7" />
        <rect x="25" y="3" width="20" height="12" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="3" y="17" width="12" height="10" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <rect x="17" y="17" width="12" height="10" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <rect x="31" y="17" width="14" height="10" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
      </svg>
    ),
    'dashboard': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        {/* 2×2 grid of metric tiles */}
        <rect x="3" y="3" width="20" height="11" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="25" y="3" width="20" height="11" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="3" y="16" width="20" height="11" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="25" y="16" width="20" height="11" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        {/* Mini sparkline in top-left tile */}
        <polyline points="5,11 8,9 11,10 14,7 17,8 20,6" fill="none" stroke={d} strokeWidth="1" opacity="0.4" />
        {/* Mini number in top-right tile */}
        <rect x="27" y="5" width="10" height="3" rx="0.6" fill={s} opacity="0.4" />
      </svg>
    ),
    'hub-spoke': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <circle cx="24" cy="15" r="4" fill={d} opacity="0.45" />
        <circle cx="10" cy="8" r="2.5" fill={d} opacity="0.25" />
        <circle cx="38" cy="8" r="2.5" fill={d} opacity="0.25" />
        <circle cx="10" cy="22" r="2.5" fill={d} opacity="0.25" />
        <circle cx="38" cy="22" r="2.5" fill={d} opacity="0.25" />
        <line x1="20" y1="13" x2="12" y2="9" stroke={s} strokeWidth="0.6" opacity="0.25" />
        <line x1="28" y1="13" x2="36" y2="9" stroke={s} strokeWidth="0.6" opacity="0.25" />
        <line x1="20" y1="17" x2="12" y2="21" stroke={s} strokeWidth="0.6" opacity="0.25" />
        <line x1="28" y1="17" x2="36" y2="21" stroke={s} strokeWidth="0.6" opacity="0.25" />
      </svg>
    ),
    'title-bento': (
      <svg width={W} height={H} viewBox="0 0 48 30">
        {frame}
        <rect x="4" y="4" width="18" height="3" rx="1" fill={s} opacity="0.6" />
        <rect x="3" y="10" width="14" height="17" rx="2" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.6" />
        <rect x="19" y="10" width="14" height="8" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <rect x="19" y="20" width="14" height="7" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
        <rect x="35" y="10" width="10" height="17" rx="1.5" fill="#fff" stroke={s} strokeWidth="0.8" opacity="0.5" />
      </svg>
    ),

    // ── Report layouts (portrait) ─────────────────────────────────────
    'report-cover': (
      <svg width={W} height={H} viewBox="0 0 30 48">
        {frame}
        <rect x="6" y="12" width="18" height="3" rx="1" fill={s} opacity="0.72" />
        <rect x="8" y="17.5" width="14" height="1.8" rx="0.6" fill={s} opacity="0.32" />
        <line x1="7" y1="26" x2="23" y2="26" stroke={d} strokeWidth="1.1" opacity="0.34" />
        <rect x="9" y="31" width="12" height="1.2" rx="0.5" fill={s} opacity="0.18" />
      </svg>
    ),
    'report-section': (
      <svg width={W} height={H} viewBox="0 0 30 48">
        {frame}
        <rect x="5" y="9" width="4" height="4" rx="1.2" fill={d} opacity="0.35" />
        <rect x="5" y="17" width="19" height="3.2" rx="1" fill={s} opacity="0.62" />
        <rect x="5" y="23" width="15" height="1.8" rx="0.6" fill={s} opacity="0.26" />
        <rect x="5" y="28" width="20" height="1.3" rx="0.5" fill={s} opacity="0.14" />
      </svg>
    ),
    'report-body': (
      <svg width={W} height={H} viewBox="0 0 30 48">
        {frame}
        <rect x="5" y="6" width="12" height="2.2" rx="0.8" fill={s} opacity="0.52" />
        <rect x="5" y="12" width="20" height="1.1" rx="0.5" fill={s} opacity="0.2" />
        <rect x="5" y="15" width="18" height="1.1" rx="0.5" fill={s} opacity="0.18" />
        <rect x="5" y="18" width="20" height="1.1" rx="0.5" fill={s} opacity="0.16" />
        <rect x="5" y="21" width="17" height="1.1" rx="0.5" fill={s} opacity="0.14" />
        <rect x="5" y="24" width="20" height="1.1" rx="0.5" fill={s} opacity="0.12" />
        <rect x="5" y="27" width="16" height="1.1" rx="0.5" fill={s} opacity="0.11" />
        <rect x="5" y="33" width="20" height="1.1" rx="0.5" fill={s} opacity="0.1" />
        <rect x="5" y="36" width="14" height="1.1" rx="0.5" fill={s} opacity="0.08" />
      </svg>
    ),
    'report-quote': (
      <svg width={W} height={H} viewBox="0 0 30 48">
        {frame}
        <rect x="6" y="9" width="1.8" height="23" rx="0.7" fill={d} opacity="0.42" />
        <rect x="11" y="14" width="14" height="1.8" rx="0.6" fill={s} opacity="0.4" />
        <rect x="11" y="19" width="12" height="1.6" rx="0.6" fill={s} opacity="0.26" />
        <rect x="11" y="24" width="10" height="1.6" rx="0.6" fill={s} opacity="0.2" />
        <rect x="11" y="31" width="8" height="1.3" rx="0.5" fill={s} opacity="0.14" />
      </svg>
    ),
  };

  const effectiveLayout = forcePortrait ? mapToReportLayout(layout) : layout;
  return thumbs[effectiveLayout] || thumbs['cover'];
}
