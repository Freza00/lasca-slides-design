import React from 'react';
import { AbsoluteFill } from 'remotion';
import { LascaDemo } from './LascaDemo';

// Square (1080×1080) reframe: render master in the upper-center then letterbox.
// Crops left/right ~420px of the 1920px master via center-crop.
export const LascaDemoSquare: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: '#0a0a09' }}>
      <div
        style={{
          width: 1920,
          height: 1080,
          position: 'absolute',
          left: -420,
          top: 0,
        }}
      >
        <LascaDemo />
      </div>
    </AbsoluteFill>
  );
};
