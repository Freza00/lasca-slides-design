'use client';

import { GlimmerSpinner } from './GlimmerSpinner';

export type PhaseStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface Phase {
  id: string;
  label: string;
  /** Optional right-aligned sub-label e.g. "5–8 / 8" during streaming generation. */
  subLabel?: string;
  status: PhaseStatus;
}

const DONE_COLOR = '#788c5d';
const PENDING_COLOR = '#b0aea5';
const ACTIVE_COLOR = '#2a2a2a';

function StatusIcon({ status }: { status: PhaseStatus }) {
  const size = 11;
  if (status === 'active') return <GlimmerSpinner size={size} />;
  if (status === 'done') {
    return (
      <span aria-hidden style={{ color: DONE_COLOR, fontSize: size + 1, lineHeight: `${size}px`, width: size, display: 'inline-block', textAlign: 'center', flexShrink: 0 }}>
        ✓
      </span>
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size - 2,
        height: size - 2,
        borderRadius: '50%',
        border: `1px solid ${status === 'skipped' ? '#d5d3c9' : PENDING_COLOR}`,
        display: 'inline-block',
        flexShrink: 0,
      }}
    />
  );
}

export function GenerationPhases({ phases }: { phases: Phase[] }) {
  return (
    <ul
      role="list"
      aria-label="Generation progress"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {phases.map(p => {
        const color =
          p.status === 'done' ? DONE_COLOR
          : p.status === 'active' ? ACTIVE_COLOR
          : p.status === 'skipped' ? '#c9c6bb'
          : PENDING_COLOR;
        return (
          <li
            key={p.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color, lineHeight: 1.5 }}
          >
            <StatusIcon status={p.status} />
            <span style={{ fontWeight: p.status === 'active' ? 500 : 400 }}>{p.label}</span>
            {p.subLabel && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: PENDING_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                {p.subLabel}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
