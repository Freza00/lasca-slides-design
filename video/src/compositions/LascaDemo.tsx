import React, { useEffect } from 'react';
import { AbsoluteFill, Sequence, Audio, staticFile, useVideoConfig, useCurrentFrame, interpolate } from 'remotion';
import { Intro } from '../scenes/01-Intro';
import { Prompt } from '../scenes/02-Prompt';
import { Building } from '../scenes/03-Building';
import { Streaming } from '../scenes/04-Streaming';
import { ChatPolish } from '../scenes/05-ChatPolish';
import { Output } from '../scenes/06-Output';
import { Close } from '../scenes/07-Close';
import { SubtitleTrack } from '../audio/SubtitleTrack';
import { ensureFonts } from '../lib/fonts';
import { s } from '../lib/tokens';

type Props = {
  withCaptions?: boolean;
  withAudio?: boolean;
};

// Master composition. Scene timing locked at 4 / 8 / 10 / 16 / 10 / 6 / 6 seconds.
export const LascaDemo: React.FC<Props> = ({ withCaptions = true, withAudio = true }) => {
  useEffect(() => {
    ensureFonts();
  }, []);

  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // BGM curve: 0 → 0.45 by 3s, hold, lift at streaming climax (~22s), fade to 0 by 60s
  const bgmVolume = interpolate(
    frame,
    [0, s(3), s(20), s(24), s(52), s(60)],
    [0, 0.45, 0.45, 0.55, 0.45, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill>
      <Sequence from={s(0)} durationInFrames={s(4)}>
        <Intro />
      </Sequence>

      <Sequence from={s(4)} durationInFrames={s(8)}>
        <Prompt />
      </Sequence>

      <Sequence from={s(12)} durationInFrames={s(4)}>
        <Building />
      </Sequence>

      <Sequence from={s(16)} durationInFrames={s(8)}>
        <Streaming />
      </Sequence>

      <Sequence from={s(24)} durationInFrames={s(12)}>
        <ChatPolish />
      </Sequence>

      <Sequence from={s(36)} durationInFrames={s(16)}>
        <Output />
      </Sequence>

      <Sequence from={s(52)} durationInFrames={s(8)}>
        <Close />
      </Sequence>

      {withCaptions && <SubtitleTrack />}

      {withAudio && (
        <>
          <OptionalAudio src="bgm.mp3" volume={bgmVolume} />
          <OptionalAudio src="voiceover.wav" volume={0.95} />
        </>
      )}
    </AbsoluteFill>
  );
};

// Wraps <Audio> in a try-load so a missing file doesn't crash the composition.
// Remotion's <Audio> errors hard if the file isn't found; this swallows that.
const OptionalAudio: React.FC<{ src: string; volume: number | ((f: number) => number) }> = ({
  src,
  volume,
}) => {
  const [exists, setExists] = React.useState<boolean | null>(null);

  useEffect(() => {
    fetch(staticFile(src), { method: 'HEAD' })
      .then((r) => setExists(r.ok))
      .catch(() => setExists(false));
  }, [src]);

  if (!exists) return null;
  return <Audio src={staticFile(src)} volume={volume as number} />;
};
