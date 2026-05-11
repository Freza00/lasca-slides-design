import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { StreamingText } from '../lib/StreamingText';
import { ChatBubble, WorkingPhrase } from '../lib/ChatBubble';
import { Caption } from '../lib/Caption';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 05 — ChatPanel polish (30–42s, 360 frames duration)
export const ChatPolish: React.FC = () => {
  const frame = useCurrentFrame();

  // Subtitle on canvas fades out at frame 215
  const subtitleOpacity = interpolate(frame, [215, 230], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  // New canvas heading streams in starting frame 240
  const newHeadingStart = 240;

  // Event sequence — give chat polish more room before settling
  const userBubbleFrame = 100;
  const workingFrame = 115;
  const phaseFrame = 160;
  const replyFrame = 290;
  const undoToastFrame = 305;
  const undoOpacity = interpolate(
    frame,
    [undoToastFrame, undoToastFrame + 8, undoToastFrame + 20, undoToastFrame + 28],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ background: T.editorBg, display: 'flex', flexDirection: 'row' }}>
      {/* Left: Sidebar */}
      <div
        style={{
          width: 240,
          background: T.panelBg,
          borderRight: `1px solid ${T.border}`,
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 12,
            fontWeight: 600,
            color: T.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}
        >
          Slides
        </div>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            style={{
              padding: 10,
              borderRadius: 8,
              background: i === 3 ? T.editorBg : 'transparent',
              border: i === 3 ? `1.5px solid ${T.primary}` : `1px solid ${T.border}`,
              opacity: i === 3 ? 1 : 0.7,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontFamily: FONT_FAMILIES.bodySans,
              fontSize: 12,
              color: T.foreground,
            }}
          >
            <span style={{ color: T.muted, width: 14 }}>{i}</span>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  height: 6,
                  width: '60%',
                  background: T.border,
                  borderRadius: 3,
                  marginBottom: 4,
                }}
              />
              <div
                style={{
                  height: 5,
                  width: '40%',
                  background: T.border,
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Center: Canvas */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 56,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: 880,
            height: 510,
            background: T.panelBg,
            border: `1px solid ${T.border}`,
            borderRadius: 14,
            padding: '56px 64px',
            boxShadow: '0 16px 56px rgba(20,20,19,0.06)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 16,
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILIES.displaySerif,
              fontSize: 56,
              color: T.foreground,
              letterSpacing: '-0.02em',
              lineHeight: 1.05,
            }}
          >
            {frame < newHeadingStart ? (
              'Built for designers'
            ) : (
              <StreamingText
                text="Built for designers"
                startFrame={newHeadingStart}
                framesPerChar={0.85}
                cursor={false}
              />
            )}
          </div>
          <div
            style={{
              fontFamily: FONT_FAMILIES.bodySans,
              fontSize: 22,
              color: T.muted,
              opacity: subtitleOpacity,
            }}
          >
            A subtitle that explains the line above in a few words.
          </div>
        </div>

        {/* Undo toast */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            left: 56,
            opacity: undoOpacity,
            background: T.foreground,
            color: T.panelBg,
            padding: '10px 16px',
            borderRadius: 10,
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          ← Undo
        </div>
      </div>

      {/* Right: ChatPanel */}
      <div
        style={{
          width: 360,
          background: T.panelBg,
          borderLeft: `1px solid ${T.border}`,
          padding: '24px 20px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 12,
            fontWeight: 600,
            color: T.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 14,
          }}
        >
          Chat
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {frame >= userBubbleFrame && (
            <ChatBubble role="user" appearFrame={userBubbleFrame}>
              Make this slide more minimal — remove the subtitle
            </ChatBubble>
          )}

          {frame >= workingFrame && frame < replyFrame && (
            <WorkingPhrase text="sculpting the layout" appearFrame={workingFrame} />
          )}

          {frame >= phaseFrame && frame < replyFrame && (
            <div
              style={{
                marginTop: 16,
                marginLeft: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontFamily: FONT_FAMILIES.bodySans,
                fontSize: 12,
                color: T.muted,
              }}
            >
              <PhaseRow label="connecting" doneAt={phaseFrame + 8} currentFrame={frame} />
              <PhaseRow label="planning" doneAt={phaseFrame + 24} currentFrame={frame} />
              <PhaseRow label="rendering" doneAt={phaseFrame + 48} currentFrame={frame} />
            </div>
          )}

          {frame >= replyFrame && (
            <ChatBubble role="assistant" appearFrame={replyFrame}>
              Done — stripped the subtitle, headline now carries the beat.
            </ChatBubble>
          )}
        </div>

        {/* Input box */}
        <div
          style={{
            background: T.editorBg,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: '12px 14px',
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 13,
            color: T.muted,
          }}
        >
          {frame < userBubbleFrame ? (
            <StreamingText
              text="Make this slide more minimal — remove the subtitle"
              startFrame={15}
              framesPerChar={0.85}
              cursor
              style={{ color: T.foreground }}
            />
          ) : (
            'Ask anything…'
          )}
        </div>
      </div>

      <Caption text="Talk to it. It listens." inFrame={30} outFrame={340} />
    </AbsoluteFill>
  );
};

const PhaseRow: React.FC<{ label: string; doneAt: number; currentFrame: number }> = ({
  label,
  doneAt,
  currentFrame,
}) => {
  const done = currentFrame >= doneAt;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 6,
          background: done ? T.green : 'transparent',
          border: done ? 'none' : `1.5px solid ${T.border}`,
          color: 'white',
          fontSize: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
        }}
      >
        {done ? '✓' : ''}
      </span>
      <span style={{ color: done ? T.foreground : T.muted }}>{label}</span>
    </div>
  );
};
