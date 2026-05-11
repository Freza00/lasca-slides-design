'use client';

/**
 * Lascaux-themed animated background.
 * Renders scattered cave painting elements (bull, deer, dots, marks)
 * with gentle floating animations.
 *
 * mode='calm'   — landing page: slow drift, low opacity
 * mode='active' — generation wait: faster, brighter, more alive
 */

interface LascauxBgProps {
  mode?: 'calm' | 'active';
}

/* ---- Cave painting SVG paths (inline, no external files) ---- */

// Minimal-line bull: ~6 essential strokes
const BULL = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <path d="M7,7 Q5,5 4,7 Q3,9 5,10 Q7,11 9,10 Q12,8 16,7 Q20,6.5 23,8 Q26,10 26,14 Q26,17 24,19 L24,25" stroke-width="2"/>
  <path d="M12,14 L11,25" stroke-width="2"/>
  <path d="M11,17 Q16,19 24,17" stroke-width="1.2"/>
  <path d="M5,8 Q4,5 6,5" stroke-width="1.5"/>
  <path d="M26,13 Q28,11 29,9" stroke-width="1.5"/>
  <circle cx="6.5" cy="9" r="0.8" fill="currentColor"/>
</g>`;

// Deer with antlers
const DEER = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <path d="M9,10 L7,5 L5,3 M7,5 L8,3 M7,5 L6,2" stroke-width="1.3"/>
  <path d="M9,10 L8,6 L9,4" stroke-width="1.2"/>
  <path d="M9,16 Q8,13 10,11 Q12,9 16,9.5 Q20,10 23,11 Q25,12 25,15 Q25,17 23,18 Z" fill="currentColor" stroke-width="0.3"/>
  <path d="M12,18 L11,26" stroke-width="2"/>
  <path d="M16,18 L15.5,26" stroke-width="1.8"/>
  <path d="M20,18 L19.5,26" stroke-width="1.8"/>
  <path d="M23,17 L23.5,26" stroke-width="2"/>
</g>`;

// Simple hand mark — three short parallel strokes (cave counting marks)
const MARKS = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.8">
  <path d="M4,4 L4,20"/>
  <path d="M10,2 L10,22"/>
  <path d="M16,5 L16,19"/>
</g>`;

// Scattered dots — ochre splatter
const DOTS = `<g fill="currentColor">
  <circle cx="4" cy="8" r="2.5"/>
  <circle cx="14" cy="4" r="1.8"/>
  <circle cx="10" cy="16" r="2"/>
  <circle cx="20" cy="10" r="1.5"/>
  <circle cx="6" cy="20" r="1.2"/>
  <circle cx="18" cy="18" r="2.2"/>
</g>`;

// Rough spiral — common cave art motif
const SPIRAL = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.5">
  <path d="M16,16 Q20,16 20,12 Q20,8 16,8 Q12,8 12,12 Q12,14 14,15"/>
</g>`;

interface Element {
  svg: string;
  vb: string;      // viewBox
  x: string;       // CSS left %
  y: string;       // CSS top %
  size: number;     // px
  delay: number;    // animation delay s
  dur: number;      // animation duration s
  rot: number;      // initial rotation
  flip?: boolean;
}

const ELEMENTS: Element[] = [
  // Bull — scattered across the canvas
  { svg: BULL,   vb: '0 0 32 32', x: '8%',  y: '15%', size: 60, delay: 0,   dur: 25, rot: -5 },
  { svg: BULL,   vb: '0 0 32 32', x: '75%', y: '65%', size: 45, delay: 4,   dur: 30, rot: 8, flip: true },
  // Deer
  { svg: DEER,   vb: '0 0 32 32', x: '65%', y: '10%', size: 50, delay: 2,   dur: 28, rot: -3 },
  { svg: DEER,   vb: '0 0 32 32', x: '20%', y: '75%', size: 40, delay: 6,   dur: 32, rot: 5, flip: true },
  // Marks
  { svg: MARKS,  vb: '0 0 20 24', x: '45%', y: '20%', size: 24, delay: 1,   dur: 20, rot: 12 },
  { svg: MARKS,  vb: '0 0 20 24', x: '88%', y: '40%', size: 20, delay: 8,   dur: 22, rot: -8 },
  // Dots
  { svg: DOTS,   vb: '0 0 24 24', x: '30%', y: '45%', size: 30, delay: 3,   dur: 18, rot: 0 },
  { svg: DOTS,   vb: '0 0 24 24', x: '55%', y: '80%', size: 22, delay: 7,   dur: 24, rot: 15 },
  // Spiral
  { svg: SPIRAL, vb: '0 0 28 24', x: '85%', y: '18%', size: 28, delay: 5,   dur: 26, rot: -10 },
  { svg: SPIRAL, vb: '0 0 28 24', x: '10%', y: '55%', size: 22, delay: 9,   dur: 20, rot: 20 },
];

export function LascauxBg({ mode = 'calm' }: LascauxBgProps) {
  const isActive = mode === 'active';
  const baseOpacity = isActive ? 0.09 : 0.045;
  const speed = isActive ? 0.5 : 1; // multiplier for animation duration

  return (
    <>
      <style>{`
        @keyframes lascauxFloat {
          0%, 100% { transform: var(--lx-base) translateY(0px); }
          50%      { transform: var(--lx-base) translateY(-12px); }
        }
        @keyframes lascauxPulse {
          0%, 100% { opacity: var(--lx-op); }
          50%      { opacity: calc(var(--lx-op) * 1.6); }
        }
        @media (prefers-reduced-motion: reduce) {
          .lascaux-el { animation: none !important; }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 0,
        }}
        aria-hidden="true"
      >
        {ELEMENTS.map((el, i) => {
          const dur = Math.round(el.dur * speed);
          const opacity = baseOpacity + (i % 3) * 0.01;
          const baseTransform = `rotate(${el.rot}deg)${el.flip ? ' scaleX(-1)' : ''}`;
          return (
            <div
              key={i}
              className="lascaux-el"
              style={{
                position: 'absolute',
                left: el.x,
                top: el.y,
                width: el.size,
                height: el.size,
                color: '#A85432',
                ['--lx-base' as string]: baseTransform,
                ['--lx-op' as string]: String(opacity),
                opacity,
                animation: `lascauxFloat ${dur}s ease-in-out ${el.delay}s infinite, lascauxPulse ${Math.round(dur * 0.7)}s ease-in-out ${el.delay + 2}s infinite`,
              }}
              dangerouslySetInnerHTML={{
                __html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${el.vb}" width="100%" height="100%">${el.svg}</svg>`,
              }}
            />
          );
        })}
      </div>
    </>
  );
}
