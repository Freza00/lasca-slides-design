import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { T } from './tokens';
import { FONT_FAMILIES } from './fonts';
import { LINEAR } from './easing';

type Props = {
  size?: number;
  showSparkle?: boolean;
  /** Frame offset so the marquee/breathe loop can start mid-cycle when scene begins. */
  cycleOffset?: number;
};

// Port of LascaBrand.tsx — CSS animation rewritten as frame-driven values.
// - 10s marquee sweep (background-position 0 → 200%)
// - 5s breathing glow (opacity 0.6 ↔ 1.0 on a soft shadow layer)
// - 5s sparkle pulse (✦ opacity 0 → 1 → 0)
export const LascaWordmark: React.FC<Props> = ({
  size = 36,
  showSparkle = true,
  cycleOffset = 0,
}) => {
  const frame = useCurrentFrame() + cycleOffset;

  const FPS = 30;
  const SWEEP_FRAMES = 10 * FPS;
  const BREATHE_FRAMES = 5 * FPS;
  const SPARKLE_FRAMES = 5 * FPS;

  const sweepProgress = (frame % SWEEP_FRAMES) / SWEEP_FRAMES;
  const breatheProgress = (frame % BREATHE_FRAMES) / BREATHE_FRAMES;
  const sparkleProgress = (frame % SPARKLE_FRAMES) / SPARKLE_FRAMES;

  // Gradient sweep — animate background-position 0% → 200%
  const bgPosition = `${interpolate(sweepProgress, [0, 1], [0, 200], {
    easing: LINEAR,
  })}% 50%`;

  // Breathing — opacity oscillates softly (sine-like via abs of triangle wave)
  const breatheTriangle = Math.abs(breatheProgress * 2 - 1);
  const breatheOpacity = interpolate(breatheTriangle, [0, 1], [1.0, 0.65]);

  // Sparkle — peak around 0.5 of cycle
  const sparkleOpacity =
    sparkleProgress < 0.5
      ? interpolate(sparkleProgress, [0, 0.5], [0, 1])
      : interpolate(sparkleProgress, [0.5, 1], [1, 0]);

  const gradient = `linear-gradient(90deg, ${T.wordmark1} 0%, ${T.wordmark2} 25%, ${T.wordmark3} 50%, ${T.wordmark4} 75%, ${T.wordmark1} 100%)`;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: size * 0.18,
        fontFamily: FONT_FAMILIES.brand,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
        opacity: breatheOpacity,
      }}
    >
      <span
        style={{
          background: gradient,
          backgroundSize: '200% 100%',
          backgroundPosition: bgPosition,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
          filter: `drop-shadow(0 0 ${size * 0.3}px rgba(245, 222, 179, ${
            breatheOpacity * 0.3
          }))`,
        }}
      >
        Lasca
      </span>
      {showSparkle && (
        <span
          style={{
            color: T.wordmark4,
            fontSize: size * 0.55,
            opacity: sparkleOpacity,
            transform: `scale(${interpolate(sparkleOpacity, [0, 1], [0.6, 1])})`,
          }}
        >
          ✦
        </span>
      )}
    </div>
  );
};
