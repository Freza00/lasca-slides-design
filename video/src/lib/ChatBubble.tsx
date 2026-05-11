import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { T } from './tokens';
import { FONT_FAMILIES } from './fonts';
import { EASE } from './easing';

type Props = {
  role: 'user' | 'assistant';
  appearFrame: number;
  children: React.ReactNode;
};

// Chat bubble matching ChatPanel's chatFadeIn keyframe (opacity 0→1 + translateY 6→0)
export const ChatBubble: React.FC<Props> = ({ role, appearFrame, children }) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - appearFrame);
  const opacity = interpolate(local, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const ty = interpolate(opacity, [0, 1], [6, 0]);

  const isUser = role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        opacity,
        transform: `translateY(${ty}px)`,
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          background: isUser ? T.foreground : T.panelBg,
          color: isUser ? T.panelBg : T.foreground,
          border: isUser ? 'none' : `1px solid ${T.border}`,
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          padding: '10px 14px',
          fontFamily: FONT_FAMILIES.bodySans,
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// "WorkingPhrase" indicator — small text with subtle pulse
export const WorkingPhrase: React.FC<{ text: string; appearFrame: number }> = ({
  text,
  appearFrame,
}) => {
  const frame = useCurrentFrame();
  const local = Math.max(0, frame - appearFrame);
  const opacity = interpolate(local, [0, 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Subtle pulse
  const pulse = 0.6 + Math.abs(((local % 45) / 45) * 2 - 1) * 0.4;

  return (
    <div
      style={{
        fontFamily: FONT_FAMILIES.bodySans,
        fontSize: 13,
        color: T.primary,
        opacity: opacity * pulse,
        marginLeft: 4,
      }}
    >
      {text}…
    </div>
  );
};
