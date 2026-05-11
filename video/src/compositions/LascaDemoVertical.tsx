import React from 'react';
import { AbsoluteFill } from 'remotion';
import { LascaDemo } from './LascaDemo';

// Vertical (1080×1920) reframe: render scaled master centered.
// Letterbox top/bottom with brand bg; master is scaled to fit width.
export const LascaDemoVertical: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#0a0a09' }}>
      <div
        style={{
          position: 'absolute',
          top: 410,
          left: 0,
          width: 1920,
          height: 1080,
          transform: 'scale(0.5625)',
          transformOrigin: 'top left',
        }}
      >
        <LascaDemo />
      </div>
    </AbsoluteFill>
  );
};
