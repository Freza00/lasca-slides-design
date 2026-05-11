'use client';

// ============================================================================
// Lasca — SlideThumbnail (Phase 2.6)
// ============================================================================
// Shared scaled-preview component used by:
//   - components/editor/Sidebar.tsx  (editor slide strip, box 180×180)
//   - components/create/GenerationPreview.tsx  (streaming + result sidebars)
//
// Uses the imperative innerHTML + htmlRef guard pattern (same convention
// as Canvas.tsx). Do NOT switch to React's HTML-injection prop — that
// recreates the wrapper object every render and causes React to reset
// innerHTML between frames, wiping animation state and triggering
// StrictMode unmount warnings.
//
// Distinct from components/ui/LayoutThumb.tsx, which renders abstract SVG
// wireframes for the pre-stream generation placeholder. LayoutThumb is NOT
// a slide renderer.
// ============================================================================

import React, { useLayoutEffect, useRef, forwardRef } from 'react';
import type { Slide, Theme } from '@/lib/types';
import { renderSlide } from '@/lib/renderSlide';

export interface SlideThumbnailProps {
  slide: Slide;
  theme: Theme;
  /** Logical canvas width (deck aspect-dependent: 960 for 16:9 slides,
   *  612/595 for Letter/A4 reports). Caller computes via getLogicalDims(). */
  w: number;
  /** Logical canvas height. */
  h: number;
  /** Uniform scale factor applied to the inner render via CSS transform.
   *  Caller computes via fitToBox(w, h, boxW, boxH).scale. */
  scale: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Scaled slide thumbnail. Renders `renderSlide(slide, theme, {w, h})` into a
 * div sized to `floor(w*scale) × floor(h*scale)` with an inner transform-scale
 * wrapper. Imperative innerHTML write is guarded by a ref so React doesn't
 * rewrite the DOM on every render — only when the HTML string actually
 * changes do we touch innerHTML.
 *
 * forwardRef is exposed because call sites use the outer wrapper ref for
 * measurement (e.g. scroll positioning in GenerationPreview).
 */
export const SlideThumbnail = forwardRef<HTMLDivElement, SlideThumbnailProps>(
  function SlideThumbnail({ slide, theme, w, h, scale, className, style }, ref) {
    const innerRef = useRef<HTMLDivElement>(null);
    const htmlRef = useRef('');

    useLayoutEffect(() => {
      const html = renderSlide(slide, theme, { w, h });
      if (html === htmlRef.current) return;
      htmlRef.current = html;
      if (innerRef.current) innerRef.current.innerHTML = html;
    }, [slide, theme, w, h]);

    return (
      <div
        ref={ref}
        className={className}
        style={{
          overflow: 'hidden',
          width: Math.floor(w * scale),
          height: Math.floor(h * scale),
          position: 'relative',
          ...style,
        }}
      >
        <div
          ref={innerRef}
          data-no-fx="1"
          style={{
            width: w,
            height: h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
      </div>
    );
  },
);
