import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { T } from './tokens';
import { FONT_FAMILIES } from './fonts';
import { EASE } from './easing';

type Props = {
  text: string;
  /** Frame at which caption appears (relative to current sequence). */
  inFrame: number;
  /** Frame at which caption exits. */
  outFrame: number;
};

// Fraunces 22px, bottom-center, no box. 300ms fade in / 200ms fade out.
export const Caption: React.FC<Props> = ({ text, inFrame, outFrame }) => {
  const frame = useCurrentFrame();
  const fadeInDur = 9; // ~300ms @ 30fps
  const fadeOutDur = 6; // ~200ms

  const opacity = interpolate(
    frame,
    [inFrame, inFrame + fadeInDur, outFrame - fadeOutDur, outFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }
  );

  const ty = interpolate(
    frame,
    [inFrame, inFrame + fadeInDur],
    [8, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }
  );

  if (frame < inFrame - 2 || frame > outFrame + 2) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 72,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 22,
        color: T.foreground,
        letterSpacing: '-0.01em',
        opacity,
        transform: `translateY(${ty}px)`,
        textShadow: '0 1px 12px rgba(245, 245, 240, 0.85)',
      }}
    >
      {text}
    </div>
  );
};
