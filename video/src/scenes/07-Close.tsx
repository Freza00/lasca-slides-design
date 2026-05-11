import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { LascaWordmark } from '../lib/LascaWordmark';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 07 — Close (52–60s, 240 frames duration)
export const Close: React.FC = () => {
  const frame = useCurrentFrame();

  const wordmarkIn = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  const line1In = interpolate(frame, [45, 57], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const line1Ty = interpolate(line1In, [0, 1], [6, 0]);

  const line2In = interpolate(frame, [85, 97], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const line2Ty = interpolate(line2In, [0, 1], [6, 0]);

  const urlIn = interpolate(frame, [140, 152], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade-to-black at the very end (last ~0.7s)
  const fadeOut = interpolate(frame, [220, 240], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: T.background }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 26,
        }}
      >
        <div style={{ opacity: wordmarkIn }}>
          <LascaWordmark size={56} showSparkle />
        </div>

        <div
          style={{
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 30,
            color: T.foreground,
            letterSpacing: '-0.015em',
            opacity: line1In,
            transform: `translateY(${line1Ty}px)`,
            marginTop: 8,
          }}
        >
          Hand your content to Lasca.
        </div>

        <div
          style={{
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 28,
            color: T.muted,
            fontStyle: 'italic',
            letterSpacing: '-0.01em',
            opacity: line2In,
            transform: `translateY(${line2Ty}px)`,
          }}
        >
          AI is editor, not author.
        </div>

        <div
          style={{
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 16,
            color: T.muted,
            letterSpacing: '0.04em',
            opacity: urlIn,
            marginTop: 12,
          }}
        >
          lasca.app
        </div>
      </div>

      {/* Fade to black on last beat */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'black',
          opacity: fadeOut,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
