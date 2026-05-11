import { Easing } from 'remotion';

// Match Lasca's WAAPI easing — cubic-bezier(0.22, 0.61, 0.36, 1)
export const EASE = Easing.bezier(0.22, 0.61, 0.36, 1);

// Quick exit (350ms-class motion)
export const EASE_OUT = Easing.bezier(0.16, 1, 0.3, 1);

// Linear for shimmer / marquee
export const LINEAR = Easing.linear;
