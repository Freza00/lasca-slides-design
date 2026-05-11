/**
 * Playful English status phrases shown while the AI is working.
 * Inspired by Claude Code's random idle messages.
 * Designed to feel creative and spark inspiration — not describe the actual task.
 */

const PHRASES = [
  'moonwalking through pixels',
  'stirring the palette',
  'aligning the stars',
  'brewing something nice',
  'arranging molecules',
  'dusting off the canvas',
  'negotiating with fonts',
  'consulting the muse',
  'whispering to gradients',
  'folding light',
  'nudging the grid',
  'tuning the contrast',
  'sketching in thin air',
  'polishing the edges',
  'weaving some magic',
  'dancing with whitespace',
  'composing the scene',
  'bending the curves',
  'painting between the lines',
  'chasing the golden ratio',
  'simmering ideas',
  'shaping the negative space',
  'threading the needle',
  'calibrating vibes',
  'mixing fresh colors',
  'sculpting the layout',
  'harmonizing elements',
  'sparking connections',
  'drifting through layers',
  'finding the rhythm',
  'balancing the composition',
  'illuminating details',
  'tracing the contour',
  'distilling the essence',
  'orchestrating the flow',
];

let lastIndex = -1;

/** Returns a random fun phrase, never repeating the previous one. */
export function getRandomPhrase(): string {
  let idx: number;
  do {
    idx = Math.floor(Math.random() * PHRASES.length);
  } while (idx === lastIndex && PHRASES.length > 1);
  lastIndex = idx;
  return PHRASES[idx];
}
