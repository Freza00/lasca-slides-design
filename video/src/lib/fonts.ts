import { delayRender, continueRender } from 'remotion';
import { loadFont as loadCaveat } from '@remotion/google-fonts/Caveat';
import { loadFont as loadFraunces } from '@remotion/google-fonts/Fraunces';
import { loadFont as loadBricolage } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadJakarta } from '@remotion/google-fonts/PlusJakartaSans';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';

export const FONT_FAMILIES = {
  brand: 'Caveat',
  displaySerif: 'Fraunces',
  displaySans: 'Bricolage Grotesque',
  bodySans: 'Plus Jakarta Sans',
  inter: 'Inter',
} as const;

let fontHandle: number | null = null;

export const ensureFonts = (): void => {
  if (fontHandle !== null) return;
  fontHandle = delayRender('Loading Google Fonts');

  Promise.all([
    loadCaveat().waitUntilDone(),
    loadFraunces().waitUntilDone(),
    loadBricolage().waitUntilDone(),
    loadJakarta().waitUntilDone(),
    loadInter().waitUntilDone(),
  ])
    .then(() => {
      if (fontHandle !== null) {
        continueRender(fontHandle);
      }
    })
    .catch((err) => {
      console.error('[fonts] load failed:', err);
      if (fontHandle !== null) {
        continueRender(fontHandle);
      }
    });
};
