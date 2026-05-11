import React from 'react';
import { useCurrentFrame, interpolate, random } from 'remotion';
import { T } from './tokens';
import { EASE } from './easing';
import { FONT_FAMILIES } from './fonts';

type SlideKind = 'cover' | 'stat-row' | 'chart-bar' | 'compare-bar' | 'flowchart' | 'closing';

const SLIDES: { kind: SlideKind; title: string }[] = [
  { kind: 'cover', title: 'Q3 Product Update' },
  { kind: 'stat-row', title: 'Highlights' },
  { kind: 'chart-bar', title: 'Adoption growth' },
  { kind: 'compare-bar', title: 'Where we lead' },
  { kind: 'flowchart', title: 'How Lasca works' },
  { kind: 'closing', title: 'Up next' },
];

type Props = {
  /** Absolute frame within the parent sequence at which streaming begins. */
  streamStartFrame: number;
  /** Sweep duration per card. Default 28 frames (~0.93s). */
  framesPerSlide?: number;
  /** Frames between successive sweep starts. Default 0.55 of framesPerSlide (overlap). */
  strideFrames?: number;
  /** Absolute frame to begin re-blur "exploding" pass. */
  revealFrame: number;
};

// 3×2 grid of glass cards. Each card unmasks a hand-drawn slide thumbnail
// via a left-to-right scan sweep timed by streamStartFrame + i * framesPerSlide.
export const GenGrid: React.FC<Props> = ({
  streamStartFrame,
  framesPerSlide = 28,
  strideFrames,
  revealFrame,
}) => {
  const stride = strideFrames ?? Math.round(framesPerSlide * 0.55);
  const frame = useCurrentFrame();
  const COLS = 3;
  const ROWS = 2;
  // 16:9 landscape — Lasca's real slide aspect, not portrait thumbnails
  const CARD_W = 400;
  const CARD_H = 225;
  const GAP = 32;

  // Phase 1: cards rise in together at streamStartFrame
  const cardsEntry = (i: number) => {
    const delay = i * 2.4; // 80ms stagger
    const local = Math.max(0, frame - streamStartFrame + 30 - delay);
    return {
      opacity: interpolate(local, [0, 13], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
      }),
      ty: interpolate(local, [0, 13], [20, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: EASE,
      }),
    };
  };

  // Phase 2: per-card sweep + reveal (stride < duration → overlapping reveals)
  const sweepProgress = (i: number) => {
    const sweepStart = streamStartFrame + 20 + i * stride;
    const sweepDuration = framesPerSlide;
    const local = Math.max(0, Math.min(sweepDuration, frame - sweepStart));
    return local / sweepDuration;
  };

  // Phase 3: re-blur then clear (the "done" reveal explosion)
  const revealLocal = frame - revealFrame;
  const reblur = interpolate(revealLocal, [0, 12], [0, 8], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const clear = interpolate(revealLocal, [12, 30], [reblur, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const finalBlur = revealLocal >= 0 ? clear : 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${COLS}, ${CARD_W}px)`,
        gridTemplateRows: `repeat(${ROWS}, ${CARD_H}px)`,
        gap: GAP,
      }}
    >
      {SLIDES.map((slide, i) => {
        const entry = cardsEntry(i);
        const sweep = sweepProgress(i);
        const revealed = sweep >= 1;

        return (
          <div
            key={slide.kind}
            style={{
              position: 'relative',
              width: CARD_W,
              height: CARD_H,
              borderRadius: 16,
              overflow: 'hidden',
              border: `1px solid rgba(255, 255, 255, 0.35)`,
              background: revealed
                ? T.panelBg
                : 'rgba(255, 255, 255, 0.4)',
              backdropFilter: revealed ? 'none' : 'blur(12px) saturate(1.4)',
              boxShadow: '0 8px 32px rgba(20, 20, 19, 0.06)',
              opacity: entry.opacity,
              transform: `translateY(${entry.ty}px)`,
              filter: `blur(${finalBlur}px)`,
            }}
          >
            {/* Real slide thumbnail (revealed once swept past) */}
            <SlideThumb kind={slide.kind} title={slide.title} />

            {/* Glass overlay receding left → right */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: T.panelBg,
                opacity: revealed ? 0 : 1,
                clipPath: `inset(0 0 0 ${sweep * 100}%)`,
                backdropFilter: 'blur(8px)',
              }}
            />

            {/* Scan sweep bar */}
            {sweep > 0 && sweep < 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${sweep * 100}%`,
                  width: 60,
                  marginLeft: -30,
                  background:
                    'linear-gradient(90deg, transparent, rgba(255,255,255,0.85), transparent)',
                  pointerEvents: 'none',
                }}
              />
            )}

            {/* ✓ done badge */}
            {revealed && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  background: T.green,
                  color: 'white',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: FONT_FAMILIES.inter,
                  fontWeight: 700,
                  opacity: interpolate(
                    frame - (streamStartFrame + 20 + i * stride + framesPerSlide),
                    [0, 8],
                    [0, 1],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                  ),
                }}
              >
                ✓
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// Hand-drawn 16:9 slide thumbnail mimicking Lasca's real landscape output.
const SlideThumb: React.FC<{ kind: SlideKind; title: string }> = ({ kind, title }) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: T.panelBg,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {kind === 'cover' && <CoverThumb title={title} />}
      {kind === 'stat-row' && <StatRowThumb title={title} />}
      {kind === 'chart-bar' && <BarChartThumb title={title} />}
      {kind === 'compare-bar' && <CompareBarThumb title={title} />}
      {kind === 'flowchart' && <FlowchartThumb title={title} />}
      {kind === 'closing' && <ClosingThumb title={title} />}
    </div>
  );
};

const ThumbTitle: React.FC<{ children: React.ReactNode; size?: number }> = ({
  children,
  size = 13,
}) => (
  <div
    style={{
      fontFamily: FONT_FAMILIES.displaySerif,
      fontSize: size,
      color: T.foreground,
      letterSpacing: '-0.015em',
      lineHeight: 1.1,
      marginBottom: 6,
    }}
  >
    {children}
  </div>
);

const CoverThumb: React.FC<{ title: string }> = ({ title }) => (
  <>
    <div style={{ flex: 1 }} />
    <div
      style={{
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 22,
        color: T.foreground,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
        maxWidth: '85%',
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: FONT_FAMILIES.bodySans,
        fontSize: 9,
        color: T.muted,
        marginTop: 4,
        letterSpacing: '0.02em',
      }}
    >
      Design Team · 2026
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ width: 36, height: 2, background: T.primary }} />
  </>
);

const StatRowThumb: React.FC<{ title: string }> = ({ title }) => (
  <>
    <ThumbTitle>{title}</ThumbTitle>
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 8,
      }}
    >
      {(
        [
          ['+42%', 'adoption', T.primary],
          ['128k', 'active', T.accent],
          ['0.7s', 'p95', T.green],
        ] as const
      ).map(([num, lbl, color], i) => (
        <div
          key={i}
          style={{
            background: T.editorBg,
            border: `1px solid ${T.border}`,
            borderRadius: 5,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 3,
          }}
        >
          <div
            style={{
              fontFamily: FONT_FAMILIES.displaySerif,
              fontSize: 18,
              color,
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            {num}
          </div>
          <div
            style={{
              fontSize: 8,
              color: T.muted,
              fontFamily: FONT_FAMILIES.bodySans,
            }}
          >
            {lbl}
          </div>
        </div>
      ))}
    </div>
  </>
);

const BarChartThumb: React.FC<{ title: string }> = ({ title }) => (
  <>
    <ThumbTitle>{title}</ThumbTitle>
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'flex-end',
        gap: 5,
        padding: '4px 0 2px',
      }}
    >
      {[28, 42, 35, 50, 60, 72, 65, 90].map((h, i, arr) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h}%`,
            background: i === arr.length - 1 ? T.primary : T.chartC,
            borderRadius: '2px 2px 0 0',
          }}
        />
      ))}
    </div>
    <div
      style={{
        fontSize: 7,
        color: T.muted,
        fontFamily: FONT_FAMILIES.bodySans,
        marginTop: 4,
        display: 'flex',
        justifyContent: 'space-between',
      }}
    >
      <span>Q1</span>
      <span>Q3</span>
    </div>
  </>
);

const CompareBarThumb: React.FC<{ title: string }> = ({ title }) => {
  const rows = [
    { label: 'Layouts', usVal: 92, themVal: 48 },
    { label: 'Charts', usVal: 88, themVal: 62 },
    { label: 'Editing speed', usVal: 95, themVal: 55 },
    { label: 'Bilingual', usVal: 90, themVal: 30 },
  ];
  return (
    <>
      <ThumbTitle>{title}</ThumbTitle>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          justifyContent: 'center',
        }}
      >
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 78,
                fontSize: 8,
                fontFamily: FONT_FAMILIES.bodySans,
                color: T.foreground,
                textAlign: 'right',
              }}
            >
              {r.label}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div
                style={{
                  height: 6,
                  width: `${r.usVal}%`,
                  background: T.primary,
                  borderRadius: 3,
                }}
              />
              <div
                style={{
                  height: 6,
                  width: `${r.themVal}%`,
                  background: T.border,
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          fontSize: 7,
          color: T.muted,
          fontFamily: FONT_FAMILIES.bodySans,
          marginTop: 4,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span
            style={{
              width: 8,
              height: 4,
              background: T.primary,
              borderRadius: 1,
            }}
          />
          Lasca
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 4, background: T.border, borderRadius: 1 }} />
          Status quo
        </span>
      </div>
    </>
  );
};

const FlowchartThumb: React.FC<{ title: string }> = ({ title }) => {
  const nodes = [
    { label: 'Draft', color: T.primary },
    { label: 'Plan', color: T.accent },
    { label: 'Slides', color: T.green },
  ];
  return (
    <>
      <ThumbTitle>{title}</ThumbTitle>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        {nodes.map((n, i) => (
          <React.Fragment key={i}>
            <div
              style={{
                background: T.editorBg,
                border: `1.5px solid ${n.color}`,
                borderRadius: 8,
                padding: '10px 14px',
                fontFamily: FONT_FAMILIES.bodySans,
                fontSize: 10,
                fontWeight: 600,
                color: T.foreground,
                minWidth: 60,
                textAlign: 'center',
              }}
            >
              {n.label}
            </div>
            {i < nodes.length - 1 && (
              <div
                style={{
                  width: 28,
                  height: 1.5,
                  background: T.muted,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    right: -1,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 0,
                    height: 0,
                    borderLeft: `5px solid ${T.muted}`,
                    borderTop: '3.5px solid transparent',
                    borderBottom: '3.5px solid transparent',
                  }}
                />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <div
        style={{
          fontSize: 7,
          color: T.muted,
          fontFamily: FONT_FAMILIES.bodySans,
          textAlign: 'center',
          marginTop: 2,
        }}
      >
        local-first · no upload
      </div>
    </>
  );
};

const ClosingThumb: React.FC<{ title: string }> = ({ title }) => (
  <>
    <div style={{ flex: 1 }} />
    <div
      style={{
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 18,
        color: T.foreground,
        letterSpacing: '-0.02em',
        lineHeight: 1.1,
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: FONT_FAMILIES.bodySans,
        fontSize: 9,
        color: T.muted,
        marginTop: 5,
      }}
    >
      Q4 → Q1 · Roadmap
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ display: 'flex', gap: 4 }}>
      <div style={{ width: 36, height: 2, background: T.primary }} />
      <div style={{ width: 18, height: 2, background: T.accent }} />
    </div>
  </>
);

// Confetti particles for the explode moment. Seeded random so renders are deterministic.
export const Confetti: React.FC<{ activeFrame: number; centerX: number; centerY: number }> = ({
  activeFrame,
  centerX,
  centerY,
}) => {
  const frame = useCurrentFrame();
  const local = frame - activeFrame;
  if (local < 0 || local > 60) return null;

  const PARTICLES = 120;
  return (
    <>
      {Array.from({ length: PARTICLES }).map((_, i) => {
        const angle = random(`p-angle-${i}`) * Math.PI * 2;
        const speed = 200 + random(`p-speed-${i}`) * 380;
        const t = local / 60;
        const x = centerX + Math.cos(angle) * speed * t;
        const y = centerY + Math.sin(angle) * speed * t + 400 * t * t;
        const color = T.confetti[Math.floor(random(`p-color-${i}`) * T.confetti.length)];
        const size = 6 + random(`p-size-${i}`) * 6;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: size,
              height: size,
              background: color,
              opacity: interpolate(t, [0, 0.7, 1], [1, 1, 0]),
              transform: `rotate(${random(`p-rot-${i}`) * 360 + t * 360}deg)`,
              borderRadius: 2,
            }}
          />
        );
      })}
    </>
  );
};
