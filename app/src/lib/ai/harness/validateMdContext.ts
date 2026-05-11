import type { MdContext, MdContextPage } from './types';

/**
 * Type guard for the MdContext payload arriving over SSE
 * (`md-context-preview` event). LLM output is `as MdContext` cast at the
 * boundary; without this guard a single missing field would throw inside
 * MdContextCards' render phase and unmount the whole CreateFlow tree.
 *
 * Conservative: checks the exact fields MdContextCards / inferLayout read
 * synchronously on first render. Anything beyond that is tolerated as
 * optional / defaulted downstream.
 */
export function isValidMdContext(raw: unknown): raw is MdContext {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) return false;
  for (const p of obj.pages as unknown[]) {
    if (!isValidMdContextPage(p)) return false;
  }
  // demands is read at MdContextCards.tsx:83-85; tolerate it being absent
  // by treating it as empty there, but if present it must be an object.
  if (obj.demands !== undefined && (typeof obj.demands !== 'object' || obj.demands === null)) {
    return false;
  }
  return true;
}

function isValidMdContextPage(p: unknown): p is MdContextPage {
  if (!p || typeof p !== 'object') return false;
  const page = p as Record<string, unknown>;
  // title and corePoint and body are required strings in the type; in
  // practice LLM may emit empty strings — accept those, only reject wrong
  // types / missing keys.
  if (typeof page.title !== 'string') return false;
  if (typeof page.corePoint !== 'string') return false;
  if (typeof page.body !== 'string') return false;
  return true;
}

/** Compact summary safe to log when validation fails. */
export function summarizeRawMdContext(raw: unknown): {
  topLevelKeys: string[] | null;
  pageCount: number | null;
  firstPageKeys: string[] | null;
  sample: string | null;
} {
  if (!raw || typeof raw !== 'object') {
    return { topLevelKeys: null, pageCount: null, firstPageKeys: null, sample: null };
  }
  const obj = raw as Record<string, unknown>;
  const pages = Array.isArray(obj.pages) ? (obj.pages as unknown[]) : null;
  const firstPage = pages && pages.length > 0 && pages[0] && typeof pages[0] === 'object'
    ? Object.keys(pages[0] as Record<string, unknown>)
    : null;
  let sample: string | null = null;
  try {
    sample = JSON.stringify(raw).slice(0, 600);
  } catch {
    sample = null;
  }
  return {
    topLevelKeys: Object.keys(obj),
    pageCount: pages?.length ?? null,
    firstPageKeys: firstPage,
    sample,
  };
}
