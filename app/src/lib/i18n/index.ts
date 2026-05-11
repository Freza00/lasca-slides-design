// ============================================================================
// Lasca i18n — lightweight, Zustand-backed, zero-dependency
// ============================================================================

import { useCallback } from 'react';
import { useEditorStore } from '@/lib/store';
import { zh } from './zh';
import { en } from './en';
import { DEFAULT_LOCALE } from './constants';

export type Locale = 'zh' | 'en';

const DICTS: Record<Locale, Record<string, string>> = { zh, en };

// ---------------------------------------------------------------------------
// React hook — use in 'use client' components
// ---------------------------------------------------------------------------

/** Read the active locale from the Zustand store. */
export function useLocale(): Locale {
  return useEditorStore(s => s.locale ?? DEFAULT_LOCALE);
}

/**
 * Returns a translation function `t(key)` bound to the active locale.
 *
 * Usage:
 *   const t = useT();
 *   return <h1>{t('landing.title')}</h1>;
 */
export function useT() {
  const locale = useLocale();
  return useCallback(
    (key: string, replacements?: Record<string, string | number>): string => {
      let text = DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE][key] ?? DICTS.zh[key] ?? key;
      if (replacements) {
        for (const [k, v] of Object.entries(replacements)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale],
  );
}

// ---------------------------------------------------------------------------
// Non-hook version — use in Zustand actions, API routes, lib functions
// ---------------------------------------------------------------------------

/**
 * Translate a key for a given locale. Works outside React.
 *
 * Usage:
 *   t('zh', 'error.save_failed')
 */
export function t(locale: Locale, key: string, replacements?: Record<string, string | number>): string {
  let text = DICTS[locale]?.[key] ?? DICTS[DEFAULT_LOCALE][key] ?? DICTS.zh[key] ?? key;
  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}

/**
 * Get the full dictionary for a locale. Useful when you need multiple
 * lookups in a tight loop without per-call overhead.
 */
export function getDict(locale: Locale): Record<string, string> {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}
