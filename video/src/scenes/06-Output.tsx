import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { Caption } from '../lib/Caption';
import { T } from '../lib/tokens';
import { FONT_FAMILIES } from '../lib/fonts';
import { EASE } from '../lib/easing';

// Scene 06 — Output proof (36–52s, 480 frames duration)
// Split-screen: 5-slide carousel on left, paged.js report on right.
export const Output: React.FC = () => {
  const frame = useCurrentFrame();

  const dividerOpacity = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const leftIn = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });
  const rightIn = interpolate(frame, [6, 24], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE,
  });

  // 5 slides, ~80 frames each = 400 frames; held last 50 frames.
  const slidePhase = Math.min(4, Math.floor(Math.max(0, frame - 30) / 80));

  // Report scrolls across the whole scene.
  const reportScroll = interpolate(frame, [30, 480], [0, 460], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: T.editorBg, flexDirection: 'row' }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          opacity: leftIn,
          transform: `translateX(${interpolate(leftIn, [0, 1], [-30, 0])}px)`,
          position: 'relative',
        }}
      >
        <SlideCarousel index={slidePhase} />
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 20,
            color: T.muted,
          }}
        >
          Slides.
        </div>
      </div>

      <div
        style={{
          width: 1,
          background: T.border,
          opacity: dividerOpacity,
        }}
      />

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 48,
          opacity: rightIn,
          transform: `translateX(${interpolate(rightIn, [0, 1], [30, 0])}px)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <ReportPreview scrollY={reportScroll} />
        <div
          style={{
            position: 'absolute',
            bottom: 32,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 20,
            color: T.muted,
          }}
        >
          Reports.
        </div>
      </div>

      <Caption text="Slides or reports. Both yours." inFrame={30} outFrame={460} />
    </AbsoluteFill>
  );
};

type SlideLayout =
  | 'cover'
  | 'h-bar-compare'
  | 'line-annotated'
  | 'flowchart'
  | 'dashboard';

const SLIDES_DATA: { layout: SlideLayout; title: string; accent: string }[] = [
  { layout: 'cover', title: 'Q3 Product Update', accent: 'Design Team · October 2026' },
  { layout: 'h-bar-compare', title: 'Where we lead', accent: 'Lasca vs the status quo' },
  { layout: 'line-annotated', title: 'Adoption is compounding', accent: 'Weekly active users, 12-week trail' },
  { layout: 'flowchart', title: 'How Lasca works', accent: 'Local-first. Three steps. No upload.' },
  { layout: 'dashboard', title: 'Q3 by the numbers', accent: 'Four signals that matter' },
];

const SLIDE_W = 660;
const SLIDE_H = 372; // 16:9-ish

const SlideCarousel: React.FC<{ index: number }> = ({ index }) => {
  const slide = SLIDES_DATA[index];
  return (
    <div
      style={{
        width: SLIDE_W,
        height: SLIDE_H,
        background: T.panelBg,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        boxShadow: '0 18px 64px rgba(20,20,19,0.08)',
        padding: '36px 44px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        overflow: 'hidden',
      }}
    >
      {slide.layout === 'cover' && <CoverSlide title={slide.title} accent={slide.accent} />}
      {slide.layout === 'h-bar-compare' && (
        <HBarCompareSlide title={slide.title} accent={slide.accent} />
      )}
      {slide.layout === 'line-annotated' && (
        <LineAnnotatedSlide title={slide.title} accent={slide.accent} />
      )}
      {slide.layout === 'flowchart' && (
        <FlowchartSlide title={slide.title} accent={slide.accent} />
      )}
      {slide.layout === 'dashboard' && (
        <DashboardSlide title={slide.title} accent={slide.accent} />
      )}
    </div>
  );
};

const SlideTitle: React.FC<{ title: string; accent: string }> = ({ title, accent }) => (
  <>
    <div
      style={{
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 32,
        color: T.foreground,
        letterSpacing: '-0.02em',
        lineHeight: 1.05,
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: FONT_FAMILIES.bodySans,
        fontSize: 13,
        color: T.muted,
        letterSpacing: '0.01em',
      }}
    >
      {accent}
    </div>
  </>
);

const CoverSlide: React.FC<{ title: string; accent: string }> = ({ title, accent }) => (
  <>
    <div style={{ flex: 1 }} />
    <div
      style={{
        fontFamily: FONT_FAMILIES.displaySerif,
        fontSize: 48,
        color: T.foreground,
        letterSpacing: '-0.025em',
        lineHeight: 1.02,
      }}
    >
      {title}
    </div>
    <div
      style={{
        fontFamily: FONT_FAMILIES.bodySans,
        fontSize: 18,
        color: T.muted,
        marginTop: 4,
      }}
    >
      {accent}
    </div>
    <div style={{ flex: 1 }} />
    <div style={{ width: 88, height: 2, background: T.primary }} />
  </>
);

const HBarCompareSlide: React.FC<{ title: string; accent: string }> = ({ title, accent }) => {
  const rows = [
    { label: 'Layouts', us: 92, them: 48 },
    { label: 'Charts & diagrams', us: 88, them: 62 },
    { label: 'Editing speed', us: 95, them: 55 },
    { label: 'Bilingual support', us: 90, them: 30 },
    { label: 'Local-first privacy', us: 100, them: 18 },
  ];
  return (
    <>
      <SlideTitle title={title} accent={accent} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingTop: 6,
        }}
      >
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 150,
                fontFamily: FONT_FAMILIES.bodySans,
                fontSize: 12,
                color: T.foreground,
                textAlign: 'right',
              }}
            >
              {r.label}
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div
                style={{
                  height: 11,
                  width: `${r.us}%`,
                  background: T.primary,
                  borderRadius: 5,
                }}
              />
              <div
                style={{
                  height: 11,
                  width: `${r.them}%`,
                  background: T.border,
                  borderRadius: 5,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          fontSize: 10,
          color: T.muted,
          fontFamily: FONT_FAMILIES.bodySans,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 8, background: T.primary, borderRadius: 2 }} />
          Lasca
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 14, height: 8, background: T.border, borderRadius: 2 }} />
          Status quo
        </span>
      </div>
    </>
  );
};

const LineAnnotatedSlide: React.FC<{ title: string; accent: string }> = ({ title, accent }) => {
  // Hand-drawn line chart as SVG polyline. Annotation callout at the peak.
  const W = 540;
  const H = 180;
  const points = [
    [0, 130],
    [60, 115],
    [120, 120],
    [180, 95],
    [240, 88],
    [300, 70],
    [360, 55],
    [420, 38],
    [480, 28],
    [540, 14],
  ];
  const poly = points.map((p) => p.join(',')).join(' ');
  return (
    <>
      <SlideTitle title={title} accent={accent} />
      <div style={{ flex: 1, position: 'relative', paddingTop: 8 }}>
        <svg width={W} height={H} style={{ display: 'block' }}>
          {/* gridlines */}
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={0}
              x2={W}
              y1={(i * H) / 3}
              y2={(i * H) / 3}
              stroke={T.border}
              strokeWidth={0.5}
            />
          ))}
          {/* area fill */}
          <polygon
            points={`0,${H} ${poly} ${W},${H}`}
            fill={T.primary}
            fillOpacity={0.08}
          />
          {/* line */}
          <polyline
            points={poly}
            fill="none"
            stroke={T.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* end dot */}
          <circle cx={528} cy={14} r={5} fill={T.primary} />
          <circle cx={528} cy={14} r={9} fill={T.primary} fillOpacity={0.2} />
          {/* annotation callout — pulled in from right edge */}
          <line
            x1={448}
            y1={48}
            x2={524}
            y2={20}
            stroke={T.muted}
            strokeWidth={1}
            strokeDasharray="3,3"
          />
          <rect x={360} y={36} width={92} height={26} rx={4} fill={T.foreground} />
          <text
            x={406}
            y={53}
            textAnchor="middle"
            fontFamily={FONT_FAMILIES.bodySans}
            fontSize={11}
            fontWeight={600}
            fill={T.panelBg}
          >
            +42% WoW
          </text>
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: FONT_FAMILIES.bodySans,
          fontSize: 10,
          color: T.muted,
        }}
      >
        <span>Wk 1</span>
        <span>Wk 4</span>
        <span>Wk 8</span>
        <span>Wk 12</span>
      </div>
    </>
  );
};

const FlowchartSlide: React.FC<{ title: string; accent: string }> = ({ title, accent }) => {
  const nodes = [
    { label: 'Your draft', sub: 'Markdown or paste', color: T.primary },
    { label: 'Lasca plans', sub: 'Reads, picks layouts', color: T.accent },
    { label: 'Slides + report', sub: 'Edit-ready', color: T.green },
  ];
  return (
    <>
      <SlideTitle title={title} accent={accent} />
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingTop: 8,
        }}
      >
        {nodes.map((n, i) => (
          <React.Fragment key={i}>
            <div
              style={{
                background: T.editorBg,
                border: `2px solid ${n.color}`,
                borderRadius: 12,
                padding: '14px 16px',
                width: 142,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div
                style={{
                  fontFamily: FONT_FAMILIES.displaySerif,
                  fontSize: 16,
                  color: T.foreground,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.1,
                }}
              >
                {n.label}
              </div>
              <div
                style={{
                  fontFamily: FONT_FAMILIES.bodySans,
                  fontSize: 11,
                  color: T.muted,
                  lineHeight: 1.3,
                }}
              >
                {n.sub}
              </div>
            </div>
            {i < nodes.length - 1 && (
              <svg width={44} height={20} viewBox="0 0 44 20">
                <line x1={2} y1={10} x2={36} y2={10} stroke={T.muted} strokeWidth={2} strokeLinecap="round" />
                <polygon points="36,4 42,10 36,16" fill={T.muted} />
              </svg>
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
};

const DashboardSlide: React.FC<{ title: string; accent: string }> = ({ title, accent }) => {
  const tiles = [
    {
      label: 'Active users',
      value: '128k',
      delta: '+42% WoW',
      color: T.primary,
      sparkline: [12, 18, 14, 22, 26, 32, 38, 48],
    },
    {
      label: 'Decks shipped',
      value: '4,210',
      delta: '+31% MoM',
      color: T.accent,
      sparkline: [8, 12, 18, 16, 24, 28, 30, 36],
    },
    {
      label: 'P95 generation',
      value: '0.7s',
      delta: 'down 0.4s',
      color: T.green,
      sparkline: [40, 38, 32, 30, 24, 22, 18, 14],
    },
    {
      label: 'NPS',
      value: '64',
      delta: '+11 since Q2',
      color: T.chartC,
      sparkline: [20, 22, 30, 32, 38, 42, 48, 52],
    },
  ];
  return (
    <>
      <SlideTitle title={title} accent={accent} />
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          gap: 10,
          paddingTop: 6,
        }}
      >
        {tiles.map((t, i) => (
          <div
            key={i}
            style={{
              background: T.editorBg,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontFamily: FONT_FAMILIES.bodySans,
                fontSize: 10,
                color: T.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontFamily: FONT_FAMILIES.displaySerif,
                fontSize: 26,
                color: t.color,
                fontWeight: 600,
                letterSpacing: '-0.02em',
              }}
            >
              {t.value}
            </div>
            <div
              style={{
                fontFamily: FONT_FAMILIES.bodySans,
                fontSize: 10,
                color: T.muted,
              }}
            >
              {t.delta}
            </div>
            <svg
              viewBox="0 0 80 30"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                right: 10,
                bottom: 10,
                width: 80,
                height: 26,
              }}
            >
              <polyline
                points={t.sparkline
                  .map((v, j, arr) => `${(j / (arr.length - 1)) * 80},${30 - (v / 60) * 30}`)
                  .join(' ')}
                fill="none"
                stroke={t.color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ))}
      </div>
    </>
  );
};

const ReportPreview: React.FC<{ scrollY: number }> = ({ scrollY }) => {
  return (
    <div
      style={{
        width: 520,
        height: 680,
        background: '#ffffff',
        boxShadow: '0 12px 48px rgba(20,20,19,0.1)',
        padding: '64px 56px 80px',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div style={{ transform: `translateY(${-scrollY}px)` }}>
        <div
          style={{
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 30,
            color: T.foreground,
            letterSpacing: '-0.015em',
            marginBottom: 16,
          }}
        >
          Q3 Product Update
        </div>
        <div
          style={{
            fontFamily: FONT_FAMILIES.bodySans,
            fontSize: 11,
            color: T.muted,
            marginBottom: 32,
          }}
        >
          Internal · For the design team · October 2026
        </div>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara />
            <ReportPara short />
          </div>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara short />
            <ReportPara />
          </div>
        </div>
        <div
          style={{
            marginTop: 32,
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 18,
            color: T.foreground,
            letterSpacing: '-0.01em',
          }}
        >
          Adoption highlights
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara />
          </div>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara short />
          </div>
        </div>
        <div
          style={{
            marginTop: 32,
            fontFamily: FONT_FAMILIES.displaySerif,
            fontSize: 18,
            color: T.foreground,
            letterSpacing: '-0.01em',
          }}
        >
          Where we lead
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara short />
          </div>
          <div style={{ flex: 1 }}>
            <ReportPara />
            <ReportPara />
          </div>
        </div>
      </div>
    </div>
  );
};

const ReportPara: React.FC<{ short?: boolean }> = ({ short }) => (
  <div style={{ marginBottom: 14 }}>
    {Array.from({ length: short ? 3 : 5 }).map((_, i) => (
      <div
        key={i}
        style={{
          height: 6,
          background: i === (short ? 2 : 4) ? '#0001' : '#0002',
          borderRadius: 3,
          marginBottom: 4,
          width: i === (short ? 2 : 4) ? '60%' : '100%',
        }}
      />
    ))}
  </div>
);
