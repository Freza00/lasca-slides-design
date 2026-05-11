import React, { useEffect, useState } from 'react';
import { staticFile, useCurrentFrame, useVideoConfig, delayRender, continueRender } from 'remotion';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';

type Cue = { startMs: number; endMs: number; text: string };

const parseSrt = (raw: string): Cue[] => {
  const blocks = raw.replace(/\r/g, '').trim().split(/\n\n+/);
  return blocks.flatMap((b) => {
    const lines = b.split('\n');
    if (lines.length < 2) return [];
    const timecode = lines.find((l) => l.includes('-->'));
    if (!timecode) return [];
    const [s, e] = timecode.split('-->').map((t) => t.trim());
    const toMs = (t: string) => {
      const [hms, msStr] = t.split(',');
      const [h, m, sec] = hms.split(':').map(Number);
      return ((h * 3600 + m * 60 + sec) * 1000) + Number(msStr ?? 0);
    };
    const text = lines.slice(lines.indexOf(timecode) + 1).join(' ').trim();
    if (!text) return [];
    return [{ startMs: toMs(s), endMs: toMs(e), text }];
  });
};

// Loads captions.srt at runtime. Hidden gracefully if file isn't there.
export const SubtitleTrack: React.FC = () => {
  const [cues, setCues] = useState<Cue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();

  useEffect(() => {
    const handle = delayRender('Loading captions.srt');
    fetch(staticFile('captions.srt'))
      .then((r) => (r.ok ? r.text() : ''))
      .then((text) => {
        if (text) setCues(parseSrt(text));
        setLoaded(true);
        continueRender(handle);
      })
      .catch(() => {
        setLoaded(true);
        continueRender(handle);
      });
  }, []);

  if (!loaded) return null;
  const currentMs = (frame / fps) * 1000;
  const active = cues.find((c) => currentMs >= c.startMs && currentMs <= c.endMs);
  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 36,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 22,
        color: T.foreground,
        letterSpacing: '-0.01em',
        textShadow: '0 1px 12px rgba(245, 245, 240, 0.85)',
        padding: '0 80px',
        pointerEvents: 'none',
      }}
    >
      {active.text}
    </div>
  );
};
