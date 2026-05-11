import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { LascaWordmark } from '../lib/LascaWordmark';
import { SkeletonCard } from '../lib/SkeletonCard';
import { Caption } from '../lib/Caption';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';

// Scene 03 — building-mc / Thinking (12–16s, 120 frames duration)
// One message, fast skeleton entry, quick handoff to streaming.
export const Building: React.FC = () => {
  const frame = useCurrentFrame();

  // Counter appears ~0.5s in
  const counterIn = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const elapsedSeconds = 2 + Math.floor((frame - 15) / 30);
  const elapsedDisplay =
    counterIn > 0
      ? `Thinking… 0:0${Math.max(2, elapsedSeconds)}`
      : '';

  // Crossfade out at the tail to bridge into streaming
  const tailFade = interpolate(frame, [100, 120], [1, 0.85], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${T.createGrad1} 0%, ${T.createGrad2} 40%, ${T.createGrad3} 100%)`,
        opacity: tailFade,
      }}
    >
      <div style={{ position: 'absolute', top: 36, left: 56 }}>
        <LascaWordmark size={22} showSparkle={false} cycleOffset={420} />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 92,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: i <= 1 ? T.primary : 'transparent',
              border: i <= 1 ? 'none' : `1.5px solid ${T.border}`,
              color: i <= 1 ? 'white' : T.muted,
              fontFamily: FONT_FAMILIES.bodySans,
              fontSize: 13,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 168,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: FONT_FAMILIES.displaySerif,
          fontSize: 26,
          color: T.foreground,
          letterSpacing: '-0.01em',
        }}
      >
        Analyzing your content…
      </div>

      <div
        style={{
          position: 'absolute',
          top: 210,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 13,
          color: T.muted,
          opacity: counterIn,
        }}
      >
        {elapsedDisplay}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 260,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonCard
            key={i}
            delayFrames={i * 3}
            width={560}
            titleWidthPct={55 + (i % 3) * 10}
            bodyWidthPct={70 + (i % 2) * 15}
          />
        ))}
      </div>

      <Caption text="Reads your draft. Plans the structure." inFrame={12} outFrame={105} />
    </AbsoluteFill>
  );
};
