import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { T } from './tokens';
import { EASE, LINEAR } from './easing';

type Props = {
  delayFrames?: number;
  width?: number;
  titleWidthPct?: number;
  bodyWidthPct?: number;
};

// Skeleton card with shimmer for the building-mc scene.
// cardRise: opacity 0→1 + translateY(20→0) over 500ms with optional delay.
// shimmer: 1.5s infinite linear, background-position 0% → 200%.
export const SkeletonCard: React.FC<Props> = ({
  delayFrames = 0,
  width = 480,
  titleWidthPct = 65,
  bodyWidthPct = 85,
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - delayFrames);
  const rise = interpolate(local, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const ty = interpolate(rise, [0, 1], [20, 0]);

  // Shimmer cycle: 45 frames @ 30fps = 1.5s
  const shimmerCycle = (frame % 45) / 45;
  const shimmerPos = interpolate(shimmerCycle, [0, 1], [0, 200], {
    easing: LINEAR,
  });

  const shimmerBar: React.CSSProperties = {
    height: 12,
    borderRadius: 6,
    background: `linear-gradient(90deg, ${T.border} 25%, ${T.editorBg} 50%, ${T.border} 75%)`,
    backgroundSize: '200% 100%',
    backgroundPosition: `${shimmerPos}% 50%`,
  };

  return (
    <div
      style={{
        width,
        background: T.panelBg,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: '16px 20px',
        opacity: rise,
        transform: `translateY(${ty}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ ...shimmerBar, width: `${titleWidthPct}%` }} />
      <div style={{ ...shimmerBar, width: `${bodyWidthPct}%`, height: 10 }} />
    </div>
  );
};
