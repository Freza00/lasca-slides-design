// ============================================================================
// Lasca — PPTX polish orchestrator (client side)
// Calls /api/ai/polish for each pptx-faithful slide and surfaces the
// returned suggestions as ChatMessages with action metadata so the
// ChatPanel can render Accept buttons.
// ============================================================================

import type { Locale } from '@/lib/i18n';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';
import { withSessionHeaders } from '@/lib/clientApi';
import type { Slide, ChatMessage } from '../types';

export interface PolishSuggestion {
  kind: 'copy' | 'color' | 'typography' | 'spacing' | 'repair';
  severity: 'high' | 'medium' | 'low';
  description: string;
  find: string;
  replace: string;
}

export interface PolishAction {
  pageIndex: number;
  suggestion: PolishSuggestion;
}

function msgId() {
  return 'polish-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
}

const SEVERITY_RANK: Record<PolishSuggestion['severity'], number> = { high: 0, medium: 1, low: 2 };

/** Run polish over an array of slides; returns chat messages to inject. */
export async function polishImportedDeck(
  slides: Slide[],
  onProgress?: (done: number, total: number) => void,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ messages: ChatMessage[]; actions: PolishAction[] }> {
  const targets = slides
    .map((s, i) => ({ slide: s, index: i }))
    .filter(t => t.slide.layout === 'pptx-faithful');

  if (targets.length === 0) {
    return { messages: [], actions: [] };
  }

  const allActions: PolishAction[] = [];
  let done = 0;

  // Run sequentially to avoid hammering the API. ~1 req per slide.
  for (const t of targets) {
    const data = t.slide.data as { rawHtml?: string };
    if (!data.rawHtml) {
      done++;
      onProgress?.(done, targets.length);
      continue;
    }
    try {
      const res = await fetch('/api/ai/polish', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ rawHtml: data.rawHtml, pageIndex: t.index, locale }),
      });
      const json = await res.json();
      const list: PolishSuggestion[] = Array.isArray(json.suggestions) ? json.suggestions : [];
      list.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
      list.slice(0, 3).forEach(suggestion => {
        allActions.push({ pageIndex: t.index, suggestion });
      });
    } catch (err) {
      console.warn('[lasca] polish failed for page', t.index, err);
    }
    done++;
    onProgress?.(done, targets.length);
  }

  const messages: ChatMessage[] = [];
  if (allActions.length === 0) {
    messages.push({
      id: msgId(),
      type: 'done',
      text: locale === 'en'
        ? 'Import complete · no obvious polish opportunities found ✦'
        : '导入完成 · 没有发现明显需要优化的地方 ✦',
      timestamp: Date.now(),
    });
  } else {
    messages.push({
      id: msgId(),
      type: 'done',
      text: locale === 'en'
        ? `Import complete · found ${allActions.length} suggested improvements`
        : `导入完成 · 发现 ${allActions.length} 条改进建议`,
      timestamp: Date.now(),
    });
  }
  return { messages, actions: allActions };
}
