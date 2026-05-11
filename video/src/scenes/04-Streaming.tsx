import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { LascaWordmark } from '../lib/LascaWordmark';
import { GenGrid, Confetti } from '../lib/GenGrid';
import { Caption } from '../lib/Caption';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 04 — Slide Stream (16–24s, 240 frames duration) — HERO BEAT
// 0–20: spinner / glass cards present
// 20–125: 6 sweeps overlapping (sweep 28 frames, stride ~15) → all done by ~125
// 130–145: re-blur
// 150–210: white flash + confetti
// 210–240: confetti fade, hold
export const Streaming: React.FC = () => {
  const frame = useCurrentFrame();

  const spinnerOpacity = interpolate(frame, [0, 4, 16, 20], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const spinnerRot = (frame / 20) * 360 * 1.2;

  const flashFrame = 150;
  const flashOpacity = interpolate(
    frame,
    [flashFrame, flashFrame + 6, flashFrame + 18],
    [0, 0.7, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: EASE,
    }
  );

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${T.createGrad1} 0%, ${T.createGrad2} 40%, ${T.createGrad3} 100%)`,
      }}
    >
      <div style={{ position: 'absolute', top: 36, left: 56 }}>
        <LascaWordmark size={22} showSparkle={false} cycleOffset={720} />
      </div>

      {spinnerOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: `translate(-50%, -50%) rotate(${spinnerRot}deg)`,
            opacity: spinnerOpacity,
            fontSize: 64,
            color: T.primary,
            fontFamily: FONT_FAMILIES.brand,
          }}
        >
          ✦
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GenGrid
          streamStartFrame={0}
          framesPerSlide={28}
          strideFrames={15}
          revealFrame={150}
        />
      </div>

      {flashOpacity > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'white',
            opacity: flashOpacity,
            pointerEvents: 'none',
          }}
        />
      )}

      <Confetti activeFrame={flashFrame} centerX={960} centerY={540} />

      <Caption text="Layouts. Charts. Diagrams. Generated." inFrame={30} outFrame={215} />
    </AbsoluteFill>
  );
};
