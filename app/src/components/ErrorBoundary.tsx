'use client';

import React from 'react';
import { logRemoteEvent } from '@/lib/logger';

interface State { hasError: boolean; error?: Error }

const ERROR_DEDUPE_WINDOW_MS = 60_000;
let lastErrorSignature = '';
let lastErrorAt = 0;

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const payload = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      componentStack: info.componentStack?.split('\n').slice(0, 5).join('\n'),
    };
    const signature = JSON.stringify([payload.message, payload.stack, payload.componentStack]);
    const now = Date.now();
    if (signature === lastErrorSignature && now - lastErrorAt < ERROR_DEDUPE_WINDOW_MS) {
      return;
    }
    lastErrorSignature = signature;
    lastErrorAt = now;
    logRemoteEvent('error', payload);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', background: '#faf9f5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', fontFamily: 'sans-serif', padding: 24,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#128560;</div>
          <h1 style={{ fontSize: 22, color: '#3a3935', marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: '#b0aea5', marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 24px', fontSize: 14, fontWeight: 600,
                background: '#d97757', color: '#fff', border: 'none',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Refresh
            </button>
            <button
              onClick={() => { window.location.href = '/works'; }}
              style={{
                padding: '10px 24px', fontSize: 14, fontWeight: 600,
                background: '#fff', color: '#3a3935',
                border: '1px solid #d6d3cd',
                borderRadius: 8, cursor: 'pointer',
              }}
            >
              Open last draft
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
