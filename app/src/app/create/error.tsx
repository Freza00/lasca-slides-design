'use client';

// Next.js App Router route-level error boundary.
// Catches anything that throws under /create (render-phase errors, unhandled
// promise rejections promoted into the React tree). Without this file, the
// failure escalates to the root ErrorBoundary in layout.tsx and replaces the
// entire shell with a "Refresh" screen — wiping in-progress generation state
// from memory. Scoping the boundary here means only the /create content area
// is replaced; the auto-saved partial deck stays intact in IndexedDB.

import { useEffect } from 'react';
import { logRemoteEvent } from '@/lib/logger';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CreateError({ error, reset }: Props) {
  useEffect(() => {
    logRemoteEvent('error', {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      digest: error.digest,
      route: '/create',
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
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#129488;</div>
      <h1 style={{ fontSize: 22, color: '#3a3935', marginBottom: 8 }}>
        Generation hit a snag
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
        {error.message || 'Something went wrong while preparing your deck.'}
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
        Any pages that finished streaming were auto-saved to your library.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
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
          Open last draft
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
