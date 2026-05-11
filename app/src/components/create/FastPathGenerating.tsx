'use client';

import { useEffect, useState } from 'react';

interface FastPathGeneratingProps {
  title: string;
  label: string;
}

export function FastPathGenerating({ title, label }: FastPathGeneratingProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        paddingBottom: 120,
        opacity: mounted ? 1 : 0,
        transition: 'opacity 400ms ease',
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 18, animation: 'spin 2s linear infinite' }}>✦</div>

      <h2 style={{
        fontSize: 22,
        fontWeight: 700,
        color: '#141413',
        marginBottom: 6,
        textAlign: 'center',
        maxWidth: 560,
        padding: '0 24px',
      }}>
        {title}
      </h2>
      <p style={{ fontSize: 14, color: '#b0aea5', marginBottom: 36 }}>{label}</p>

      {/* Shimmering page stack — three stacked rectangles with light sweep */}
      <div style={{
        position: 'relative',
        width: 240,
        height: 180,
        overflow: 'hidden',
        borderRadius: 10,
      }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: i * 14,
              top: i * 10,
              width: 200,
              height: 160,
              background: '#fff',
              border: '1px solid rgba(20,20,19,0.08)',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              animation: `genPulse ${2 + i * 0.2}s ease-in-out ${i * 0.15}s infinite`,
            }}
          >
            {/* faint faux-lines */}
            <div style={{
              position: 'absolute', top: 16, left: 16, right: 40, height: 6,
              background: 'rgba(20,20,19,0.08)', borderRadius: 3,
            }} />
            <div style={{
              position: 'absolute', top: 32, left: 16, right: 60, height: 4,
              background: 'rgba(20,20,19,0.05)', borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: 44, left: 16, right: 48, height: 4,
              background: 'rgba(20,20,19,0.05)', borderRadius: 2,
            }} />
            <div style={{
              position: 'absolute', top: 56, left: 16, right: 80, height: 4,
              background: 'rgba(20,20,19,0.05)', borderRadius: 2,
            }} />
          </div>
        ))}
        {/* sweeping highlight */}
        <div style={{
          position: 'absolute',
          top: 0,
          width: '30%',
          height: '100%',
          background: 'linear-gradient(90deg, transparent, rgba(217,119,87,0.14), rgba(255,255,255,0.35), rgba(217,119,87,0.14), transparent)',
          animation: 'genSweep 2.4s ease-in-out infinite',
          filter: 'blur(8px)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}
