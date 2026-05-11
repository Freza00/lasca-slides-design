import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { LascaWordmark } from '../lib/LascaWordmark';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 01 — Cold Open (0–4s, 120 frames @ 30fps)
// 0–1s: black. 1s: wordmark fade in. 2.5s: subhead appears.
export const Intro: React.FC = () => {
  const frame = useCurrentFrame();

  const wordmarkOpacity = interpolate(frame, [30, 51], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  const subOpacity = interpolate(frame, [75, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const subTy = interpolate(subOpacity, [0, 1], [4, 0]);

  return (
    <AbsoluteFill style={{ background: '#0a0a09' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
        }}
      >
        <div style={{ opacity: wordmarkOpacity }}>
          <LascaWordmark size={72} showSparkle />
        </div>
        <div
          style={{
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 24,
            color: T.panelBg,
            letterSpacing: '-0.01em',
            opacity: subOpacity,
            transform: `translateY(${subTy}px)`,
          }}
        >
          Beautiful slides, from your words.
        </div>
      </div>
    </AbsoluteFill>
  );
};
