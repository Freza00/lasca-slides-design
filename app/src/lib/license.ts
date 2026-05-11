// ============================================================================
// License key management — localStorage based
// ============================================================================

const LICENSE_KEY = 'lasca-license-key';
const LICENSE_CACHE_KEY = 'lasca-license-cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface LicenseCache {
  valid: boolean;
  checkedAt: number;
}

export function getLicenseKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(LICENSE_KEY);
}

export function setLicenseKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LICENSE_KEY, key);
  // Clear cache to force re-validation
  localStorage.removeItem(LICENSE_CACHE_KEY);
}

export function removeLicenseKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LICENSE_KEY);
  localStorage.removeItem(LICENSE_CACHE_KEY);
}

/**
 * Check if the user has a valid pro license.
 * Uses a 24h local cache to avoid hitting the API on every check.
 */
export async function isPro(): Promise<boolean> {
  const key = getLicenseKey();
  if (!key) return false;

  // Check cache
  try {
    const cached = localStorage.getItem(LICENSE_CACHE_KEY);
    if (cached) {
      const { valid, checkedAt } = JSON.parse(cached) as LicenseCache;
      if (Date.now() - checkedAt < CACHE_TTL) return valid;
    }
  } catch { /* ignore cache errors */ }

  // Validate against Lemon Squeezy API
  try {
    const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ license_key: key }),
    });
    const data = await res.json();
    const valid = data.valid === true;

    // Cache result
    localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify({ valid, checkedAt: Date.now() }));
    return valid;
  } catch {
    // Network error → use cached value or assume invalid
    return false;
  }
}
