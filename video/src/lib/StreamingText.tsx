import React from 'react';
import { useCurrentFrame } from 'remotion';

type Props = {
  text: string;
  /** Frames per character. At 30fps, 1 = ~33ms/char, 1.05 ≈ 35ms/char. */
  framesPerChar?: number;
  /** Frame offset within the parent sequence to start typing. */
  startFrame?: number;
  cursor?: boolean;
  style?: React.CSSProperties;
};

// Character-by-character reveal. Echoes app/StreamingText.tsx but frame-deterministic.
export const StreamingText: React.FC<Props> = ({
  text,
  framesPerChar = 1.05,
  startFrame = 0,
  cursor = true,
  style,
}) => {
  const frame = useCurrentFrame();
  const elapsed = Math.max(0, frame - startFrame);
  const charsToShow = Math.min(text.length, Math.floor(elapsed / framesPerChar));
  const visible = text.slice(0, charsToShow);
  const done = charsToShow >= text.length;

  // Cursor blink every ~0.6s
  const cursorVisible = cursor && (!done || Math.floor(frame / 18) % 2 === 0);

  return (
    <span style={style}>
      {visible}
      {cursorVisible && (
        <span
          style={{
            display: 'inline-block',
            width: '0.5ch',
            color: 'currentColor',
            opacity: 0.7,
          }}
        >
          ▍
        </span>
      )}
    </span>
  );
};
