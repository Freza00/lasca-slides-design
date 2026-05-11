import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { LascaWordmark } from '../lib/LascaWordmark';
import { StreamingText } from '../lib/StreamingText';
import { Caption } from '../lib/Caption';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 02 — /create textarea hero (4–12s, 240 frames internal duration)
// Internal frame counter starts at 0. Wired via <Sequence from={4*30}/>.
export const Prompt: React.FC = () => {
  const frame = useCurrentFrame();

  // Textarea slide-up at 0.3s into scene
  const textareaIn = interpolate(frame, [9, 27], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const textareaTy = interpolate(textareaIn, [0, 1], [60, 0]);

  // Typing starts 1s into scene
  const typingStart = 30;

  // Next button at 6.5s into scene
  const buttonIn = interpolate(frame, [195, 204], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  // Click ripple at 7.5s
  const rippleProgress = interpolate(frame, [225, 240], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${T.createGrad1} 0%, ${T.createGrad2} 40%, ${T.createGrad3} 100%)`,
      }}
    >
      {/* Top wordmark */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <LascaWordmark size={28} showSparkle={false} cycleOffset={120} />
      </div>

      {/* Progress dots */}
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
              background: i === 0 ? T.primary : 'transparent',
              border: i === 0 ? 'none' : `1.5px solid ${T.border}`,
              color: i === 0 ? 'white' : T.muted,
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

      {/* Textarea card */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, calc(-50% + ${textareaTy}px))`,
          opacity: textareaIn,
          width: 720,
          background: T.panelBg,
          border: `1px solid ${T.border}`,
          borderRadius: 18,
          padding: '28px 32px',
          boxShadow: '0 12px 48px rgba(20,20,19,0.06)',
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 18,
            color: T.muted,
            marginBottom: 14,
          }}
        >
          What are you making?
        </div>
        <div
          style={{
            minHeight: 120,
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 22,
            color: T.foreground,
            lineHeight: 1.4,
          }}
        >
          <StreamingText
            text="Q3 product update for the design team"
            startFrame={typingStart}
            framesPerChar={1.05}
            cursor
          />
        </div>
      </div>

      {/* Next button */}
      <div
        style={{
          position: 'absolute',
          bottom: 180,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: buttonIn,
        }}
      >
        <div
          style={{
            position: 'relative',
            background: T.primary,
            color: 'white',
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 16,
            fontWeight: 600,
            padding: '14px 32px',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          Next →
          {rippleProgress > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 120,
                height: 120,
                borderRadius: 60,
                background: 'rgba(255,255,255,0.45)',
                transform: `translate(-50%, -50%) scale(${rippleProgress * 2})`,
                opacity: 1 - rippleProgress,
              }}
            />
          )}
        </div>
      </div>

      <Caption text="Drop your content. Describe your deck." inFrame={15} outFrame={210} />
    </AbsoluteFill>
  );
};
