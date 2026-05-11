'use client';

/**
 * Feature flags — AuthContext is the primary source for authenticated pages.
 * For public pages (or before auth finishes), fall back to /api/flags and keep
 * a tiny client-side cache so flags are still usable outside the auth shell.
 */

import { useEffect, useState } from 'react';
import { useAuth } from './authContext';

let cachedPublicFlags: Record<string, string> | null = null;
let inFlightFlagsRequest: Promise<Record<string, string>> | null = null;

async function fetchPublicFlags(): Promise<Record<string, string>> {
  if (cachedPublicFlags) return cachedPublicFlags;
  if (!inFlightFlagsRequest) {
    inFlightFlagsRequest = fetch('/api/flags')
      .then(async (res): Promise<Record<string, string>> => (res.ok ? res.json() : {}))
      .catch((): Record<string, string> => ({}))
      .then((flags: Record<string, string>) => {
        cachedPublicFlags = flags ?? {};
        inFlightFlagsRequest = null;
        return cachedPublicFlags!;
      });
  }
  return inFlightFlagsRequest;
}

export function useFlags(): Record<string, string> {
  const { flags: authFlags } = useAuth();
  const hasAuthFlags = Object.keys(authFlags).length > 0;
  const [publicFlags, setPublicFlags] = useState<Record<string, string>>(cachedPublicFlags ?? {});

  useEffect(() => {
    if (hasAuthFlags) return;
    let cancelled = false;
    fetchPublicFlags().then((flags) => {
      if (!cancelled) setPublicFlags(flags);
    });
    return () => {
      cancelled = true;
    };
  }, [hasAuthFlags]);

  return hasAuthFlags ? authFlags : publicFlags;
}

/** Read a feature flag value. Returns null if unknown. */
export function useFlag(key: string): string | null {
  const flags = useFlags();
  return flags[key] ?? null;
}

/** Check if a feature flag is enabled (value === 'true').
 *
 * Local dev shortcut: without POSTGRES_URL `/api/flags` returns `{}` so every
 * `_enabled` flag falls through to its admin-default (often `false`, e.g.
 * `export_lasca_enabled`) and the feature appears disabled. That's wrong for
 * localhost — the admin UI isn't reachable locally and the developer wants
 * every feature on. All client-consumed flags today are `*_enabled`/`import_*`
 * style switches where `true` = on, so a blanket override is safe. Matches the
 * existing `AuthGuard.tsx:16` NODE_ENV=development bypass pattern.
 */
export function useFlagEnabled(key: string, fallback = false): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  const val = useFlag(key);
  return val === null ? fallback : val === 'true';
}

/** Read a numeric feature flag. Returns fallback if not set or NaN. */
export function useFlagNumber(key: string, fallback: number): number {
  const val = useFlag(key);
  if (val === null) return fallback;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}
