// ============================================================================
// recommendMode — auto-detect which of the three FullContent modes (asis /
// polish / generate) best fits a piece of pasted markdown.
// ----------------------------------------------------------------------------
// Used to PRE-SELECT a card in <ModeChooser>; the user can always override.
// The recommendation never short-circuits the user's choice — at click time
// CreateFlow.handleModePick still runs the same fallback chain (asis →
// polish → generate) so a wrong recommendation only costs one extra click.
// ============================================================================

import { mdLooksComplete } from '@/lib/reports/mdToReportDeck';

export type FullContentMode = 'asis' | 'polish' | 'generate';

export interface ModeRecommendation {
  mode: FullContentMode;
  /** i18n key for the small "Recommended because…" line on the chosen card. */
  reasonKey: string;
  /** Tokens for {n}-style replacement when rendering the reason string. */
  reasonTokens?: Record<string, string>;
}

// Counts: tells us whether the markdown has "structure signal" beyond
// just length. mdLooksComplete is the strict gate; this function is for the
// softer "polish-eligible" check.
function countStructureSignals(md: string): {
  h1: number;
  h2: number;
  h3: number;
  bulletItems: number;
  boldOnlyParas: number;
  totalParas: number;
} {
  const h1 = (md.match(/^#\s+\S/gm) || []).length;
  const h2 = (md.match(/^##\s+\S/gm) || []).length;
  const h3 = (md.match(/^###\s+\S/gm) || []).length;
  const bulletItems = (md.match(/^[-*+]\s+\S/gm) || []).length
    + (md.match(/^\d+[.)]\s+\S/gm) || []).length;
  // Paragraphs that are entirely a single bold span — Word's "implicit
  // heading" pattern after wordImport's promotion didn't catch (e.g. user
  // pasted plain text instead of a docx).
  const boldOnlyParas = (md.match(/^\s*\*\*[^*\n]+\*\*\s*$/gm) || []).length;
  // Rough paragraph count — non-empty lines that aren't list items / headings.
  const lines = md.split('\n');
  let totalParas = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/^#{1,6}\s/.test(t)) continue;
    if (/^[-*+]\s|^\d+[.)]\s/.test(t)) continue;
    totalParas++;
  }
  return { h1, h2, h3, bulletItems, boldOnlyParas, totalParas };
}

// Slide as-is needs much stricter structure: a single H1 (cover title) plus
// at least 2 H2s (slide bodies) AND no extreme length imbalance. Slides
// derived from Word docs almost never qualify; that's by design — slide
// "as-is" should fire only when the user pasted slide-shaped markdown.
function looksLikeSlideMd(md: string): boolean {
  const { h1, h2 } = countStructureSignals(md);
  if (md.length < 200) return false;
  if (h1 !== 1) return false;
  if (h2 < 2) return false;
  return true;
}

/** Pick the best initial mode + a human-readable reason for the choice. */
export function recommendMode(
  md: string,
  format: 'slide' | 'report',
): ModeRecommendation {
  const trimmed = (md ?? '').trim();
  const len = trimmed.length;
  const sig = countStructureSignals(trimmed);

  if (format === 'report') {
    if (mdLooksComplete(trimmed)) {
      const headingCount = sig.h1 + sig.h2;
      return {
        mode: 'asis',
        reasonKey: 'create.mode.reason.asis_report',
        reasonTokens: { n: String(headingCount) },
      };
    }
    if (len >= 200 && (sig.bulletItems >= 3 || sig.boldOnlyParas >= 2 || sig.totalParas >= 4)) {
      return {
        mode: 'polish',
        reasonKey: 'create.mode.reason.polish_partial',
      };
    }
    return {
      mode: 'generate',
      reasonKey: 'create.mode.reason.generate_thin',
    };
  }

  // format === 'slide'
  if (looksLikeSlideMd(trimmed)) {
    return {
      mode: 'asis',
      reasonKey: 'create.mode.reason.asis_slide',
      reasonTokens: { n: String(sig.h2) },
    };
  }
  if (len >= 200 && (sig.h2 >= 2 || sig.bulletItems >= 4 || sig.totalParas >= 4)) {
    return {
      mode: 'polish',
      reasonKey: 'create.mode.reason.polish_partial',
    };
  }
  return {
    mode: 'generate',
    reasonKey: 'create.mode.reason.generate_thin',
  };
}
