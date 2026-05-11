import React from 'react';
import { Composition } from 'remotion';
import { LascaDemo } from './compositions/LascaDemo';
import { LascaDemoSquare } from './compositions/LascaDemoSquare';
import { LascaDemoVertical } from './compositions/LascaDemoVertical';
import { FPS, TOTAL_FRAMES } from './lib/tokens';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="LascaDemo"
        component={LascaDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
        defaultProps={{ withCaptions: true, withAudio: true }}
      />
      <Composition
        id="LascaDemoSquare"
        component={LascaDemoSquare}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1080}
      />
      <Composition
        id="LascaDemoVertical"
        component={LascaDemoVertical}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1080}
        height={1920}
      />
    </>
  );
};
