'use client';

// Next.js App Router top-level error boundary. Routes can also define their
// own error.tsx (e.g. /create/error.tsx) which take precedence — this file
// catches anything thrown outside those scoped boundaries.

import { useEffect } from 'react';
import { logRemoteEvent } from '@/lib/logger';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    logRemoteEvent('error', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      digest: error.digest,
      route: 'global',
    });
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#faf9f5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#9888;&#65039;</div>
      <h1 style={{ fontSize: 22, color: '#3a3935', marginBottom: 8 }}>
        Something went wrong
      </h1>
      <p
        style={{
          fontSize: 14,
          color: '#7a766f',
          marginBottom: 8,
          textAlign: 'center',
          maxWidth: 440,
          lineHeight: 1.5,
        }}
      >
        {error.message || 'Lasca hit an unexpected error.'}
      </p>
      <p
        style={{
          fontSize: 13,
          color: '#b0aea5',
          marginBottom: 24,
          textAlign: 'center',
          maxWidth: 440,
        }}
      >
        Your work is auto-saved locally — try reopening the editor or going
        back home.
      </p>
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={reset}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: '#d97757',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/works"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            background: '#fff',
            color: '#3a3935',
            border: '1px solid #d6d3cd',
            borderRadius: 8,
            textDecoration: 'none',
          }}
        >
          Open My Works
        </a>
        <a
          href="/"
          style={{
            padding: '10px 20px',
            fontSize: 14,
            color: '#7a766f',
            textDecoration: 'none',
            alignSelf: 'center',
          }}
        >
          Back to home
        </a>
      </div>
    </div>
  );
}
