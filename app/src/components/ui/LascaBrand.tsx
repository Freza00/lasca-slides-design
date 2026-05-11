'use client';

interface LascaBrandProps {
  variant?: 'full' | 'short';
  size?: number;
  className?: string;
}

export function LascaBrand({ variant = 'full', size = 18, className }: LascaBrandProps) {
  const text = variant === 'short' ? 'La' : 'Lasca';

  return (
    <>
      <style>{`
        /* --- Layer A: breathing glow (continuous, 5s, out-of-phase with 10s sweep) --- */
        @keyframes lascaBrandBreathe {
          0%, 100% {
            filter: brightness(1) drop-shadow(0 0 0px rgba(181,97,60,0));
          }
          50% {
            filter: brightness(1.12) drop-shadow(0 0 6px rgba(212,162,67,0.4));
          }
        }

        /* --- Layer B: marquee sweep (10s cycle, bright band sweeps right-to-left) --- */
        @keyframes lascaBrandSweep {
          0%, 12%   { background-position: 110% 50%; }
          28%       { background-position: -10% 50%; }
          34%, 100% { background-position: 110% 50%; }
        }

        /* --- Layer C: edge sparkle (synced to sweep completion at ~28%) --- */
        @keyframes lascaBrandSparkle {
          0%, 24%    { opacity: 0; transform: translateY(-50%) scale(0.4); }
          29%        { opacity: 1; transform: translateY(-50%) scale(1.4); filter: drop-shadow(0 0 4px #F2D49B); }
          35%        { opacity: 0.2; transform: translateY(-50%) scale(0.8); filter: drop-shadow(0 0 0px #F2D49B); }
          40%, 100%  { opacity: 0; transform: translateY(-50%) scale(0.4); }
        }

        .lasca-brand {
          position: relative;
          display: inline-block;
          /* Ochre gradient: dark base + bright gold sweep band at center.
             300% width hides the bright band off-screen during rest. */
          background: linear-gradient(100deg,
            #9E5535 0%,
            #B5613C 20%,
            #F5DEB3 48%,
            #F2D49B 52%,
            #B5613C 80%,
            #9E5535 100%
          );
          background-size: 300% 100%;
          background-position: 110% 50%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          font-family: var(--font-brand), cursive;
          font-weight: 700;
          letter-spacing: 0.02em;
          animation:
            lascaBrandSweep 10s ease-in-out infinite,
            lascaBrandBreathe 5s ease-in-out infinite;
        }

        .lasca-brand::after {
          content: '\\2726';
          position: absolute;
          right: -0.35em;
          top: 50%;
          transform: translateY(-50%) scale(0.4);
          font-size: 0.4em;
          color: #F2D49B;
          opacity: 0;
          pointer-events: none;
          font-family: system-ui, sans-serif;
          animation: lascaBrandSparkle 10s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .lasca-brand,
          .lasca-brand::after {
            animation: none !important;
            filter: none !important;
            background-position: 50% 50% !important;
          }
        }
      `}</style>
      <span
        className={`lasca-brand${className ? ' ' + className : ''}`}
        style={{ fontSize: size }}
      >
        {text}
      </span>
    </>
  );
}
