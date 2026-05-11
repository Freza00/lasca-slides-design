'use client';

import { Component, type ReactNode } from 'react';
import { logRemoteEvent } from '@/lib/logger';

interface Props {
  /** When this changes the boundary re-renders children (clears its error). */
  resetKey: string;
  /** Step label at the time of failure — included in the remote log. */
  stepLabel: string;
  /** Localized strings the catch UI shows. */
  fallbackTitle: string;
  fallbackBody: string;
  fallbackBackLabel: string;
  fallbackReloadLabel: string;
  /** Called when the user clicks "Back". If absent, only "Reload step" shows. */
  onBack?: () => void;
  children: ReactNode;
}

interface State {
  prevResetKey: string;
  hasError: boolean;
  errorMessage: string;
}

/**
 * Component-level error boundary scoped to a single step inside CreateFlow.
 *
 * Reason: a render-phase throw from MdContextCards / StylePicker etc. used
 * to bubble up to the route-segment /create/error.tsx, which unmounts
 * CreateFlow and drops topic / answers / planOutline / mdContext (all kept
 * in useState, none persisted at the time of crash).
 *
 * With this boundary, the failure stays inside the step renderer; CreateFlow
 * itself never unmounts, so its state survives. Switching steps via
 * `resetKey` (parent passes the current `step` string) automatically clears
 * the error state — no manual reset() needed by callers.
 */
export class StepErrorBoundary extends Component<Props, State> {
  state: State = { prevResetKey: '', hasError: false, errorMessage: '' };

  static getDerivedStateFromProps(props: Props, state: State): State | null {
    if (props.resetKey !== state.prevResetKey) {
      return { prevResetKey: props.resetKey, hasError: false, errorMessage: '' };
    }
    return null;
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMessage: error.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    logRemoteEvent('error', {
      route: '/create',
      step: this.props.stepLabel,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      componentStack: info.componentStack?.split('\n').slice(0, 6).join('\n'),
      digest: 'StepErrorBoundary',
    });
  }

  private handleReload = () => {
    // Force a child remount by toggling hasError. resetKey on its own
    // doesn't change because the parent's `step` is still the same.
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          width: '100%',
          maxWidth: 640,
          margin: '40px auto',
          padding: '24px 28px',
          background: '#fff7ed',
          border: '1px solid #fed7aa',
          borderRadius: 12,
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 600, color: '#9a3412', marginBottom: 8 }}>
          {this.props.fallbackTitle}
        </div>
        <div style={{ fontSize: 13, color: '#7c2d12', lineHeight: 1.6, marginBottom: 16 }}>
          {this.props.fallbackBody}
        </div>
        <div
          style={{
            fontSize: 12,
            color: '#9a8478',
            background: '#fff',
            border: '1px solid #fed7aa',
            borderRadius: 6,
            padding: '8px 10px',
            marginBottom: 16,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            wordBreak: 'break-word',
          }}
        >
          {this.state.errorMessage}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {this.props.onBack && (
            <button
              type="button"
              onClick={this.props.onBack}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                background: '#d97757',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {this.props.fallbackBackLabel}
            </button>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: '#fff',
              color: '#7c2d12',
              border: '1px solid #fed7aa',
              borderRadius: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {this.props.fallbackReloadLabel}
          </button>
        </div>
      </div>
    );
  }
}
