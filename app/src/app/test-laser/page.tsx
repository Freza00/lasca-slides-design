'use client';

import { useState } from 'react';

const CARDS = [
  { title: 'NVIDIA Still Sets the Pace', sub: 'Cover slide' },
  { title: '4 chips to software', sub: 'Data highlight' },
  { title: 'Training vs Inference', sub: 'Two-column analysis' },
  { title: 'Full-stack moat', sub: 'Key argument' },
  { title: 'Conclusion & Outlook', sub: 'Summary slide' },
];

export default function TestLaser() {
  const [key, setKey] = useState(0);

  return (
    <div style={{
      minHeight: '100vh', background: '#f5f5f0',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '40px 20px', gap: 24,
    }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#141413' }}>
        Liquid Glass Laser Sweep Test
      </h1>
      <p style={{ fontSize: 14, color: '#6b6a65', maxWidth: 500, textAlign: 'center' }}>
        Content starts behind frosted glass. Laser sweeps left→right, clearing the glass along its path.
      </p>
      <button
        onClick={() => setKey(k => k + 1)}
        style={{
          padding: '10px 28px', borderRadius: 10, border: '1px solid #e8e6dc',
          background: '#1a1a2e', color: '#fff', fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
        }}
      >
        Replay Animation
      </button>

      <div key={key} style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16, maxWidth: 720, width: '100%',
      }}>
        {CARDS.map((card, i) => (
          <div key={i} style={{
            width: 220, height: 140, borderRadius: 14,
            overflow: 'hidden', position: 'relative',
            background: '#fff',
            border: '1px solid rgba(232,230,220,0.5)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}>
            {/* Clear slide content (always rendered underneath) */}
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 6,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#d97757' }}>
                {card.title}
              </div>
              <div style={{ fontSize: 11, color: '#6b6a65' }}>
                {card.sub}
              </div>
            </div>

            {/* Frosted glass overlay — laser sweeps it away left→right */}
            <div style={{
              position: 'absolute', inset: 0,
              backdropFilter: 'blur(12px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.45) 0%, rgba(240,238,234,0.3) 50%, rgba(255,255,255,0.2) 100%)',
              clipPath: 'inset(0 0 0 0)',
              animation: `genGlassSweep 3s ease-out ${i * 0.6}s forwards`,
            }} />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: '#b0aea5', marginTop: 8 }}>
        Each card: frosted glass → laser sweep clears it. Click &quot;Replay&quot; to restart.
      </p>
    </div>
  );
}
