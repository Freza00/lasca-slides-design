// B3 — inline SVG thumbnails for visual clarifier options.
//
// Rule: only attach previewSvg for *visual* decisions (density / preset /
// narrative structure). Factual questions (audience / length / data-emphasis)
// stay text-only — extra art there becomes clutter (plan §B3 risk note).
//
// Each SVG uses a consistent viewBox of 80×56 so QAStep can size them
// uniformly without per-option layout math. Warm shell colors (#faf9f5 bg,
// #2a2a2a ink, #d97757 accent) keep the thumbnails coherent with the
// clarifier card styling and StylePanel §9 palette.

// ---------- density ----------
// Drafts last reviewed 2026-04-20 (§density-drafts in plan).

export const DENSITY_MINIMAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><line x1="20" y1="26" x2="60" y2="26" stroke="#2a2a2a" stroke-width="2"/><line x1="28" y1="32" x2="52" y2="32" stroke="#2a2a2a" stroke-width="1" opacity="0.4"/></svg>`;

export const DENSITY_MODERATE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><line x1="10" y1="12" x2="45" y2="12" stroke="#2a2a2a" stroke-width="2"/><circle cx="12" cy="24" r="1.2" fill="#2a2a2a"/><line x1="16" y1="24" x2="60" y2="24" stroke="#2a2a2a" stroke-width="0.8"/><circle cx="12" cy="32" r="1.2" fill="#2a2a2a"/><line x1="16" y1="32" x2="56" y2="32" stroke="#2a2a2a" stroke-width="0.8"/><circle cx="12" cy="40" r="1.2" fill="#2a2a2a"/><line x1="16" y1="40" x2="58" y2="40" stroke="#2a2a2a" stroke-width="0.8"/></svg>`;

export const DENSITY_DETAILED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><line x1="6" y1="8" x2="50" y2="8" stroke="#2a2a2a" stroke-width="1.8"/><line x1="6" y1="16" x2="36" y2="16" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="20" x2="36" y2="20" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="24" x2="34" y2="24" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="28" x2="36" y2="28" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="32" x2="32" y2="32" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="36" x2="36" y2="36" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="40" x2="34" y2="40" stroke="#2a2a2a" stroke-width="0.6"/><line x1="6" y1="44" x2="36" y2="44" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="16" x2="74" y2="16" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="20" x2="74" y2="20" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="24" x2="72" y2="24" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="28" x2="74" y2="28" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="32" x2="70" y2="32" stroke="#2a2a2a" stroke-width="0.6"/><line x1="44" y1="36" x2="74" y2="36" stroke="#2a2a2a" stroke-width="0.6"/><text x="44" y="50" font-size="8" font-family="serif" fill="#d97757" font-weight="bold">38%</text></svg>`;

// ---------- key-takeaway (narrative structure) ----------

// "number" — one big number dominates the page
export const TAKEAWAY_NUMBER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><text x="40" y="36" font-size="22" font-family="serif" font-weight="bold" fill="#d97757" text-anchor="middle">73%</text><line x1="26" y1="44" x2="54" y2="44" stroke="#2a2a2a" stroke-width="0.6" opacity="0.5"/></svg>`;

// "logic" — 3-step chain with arrows
export const TAKEAWAY_LOGIC = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><rect x="6" y="22" width="16" height="12" rx="2" fill="none" stroke="#2a2a2a" stroke-width="1"/><rect x="32" y="22" width="16" height="12" rx="2" fill="none" stroke="#2a2a2a" stroke-width="1"/><rect x="58" y="22" width="16" height="12" rx="2" fill="none" stroke="#d97757" stroke-width="1.4"/><path d="M22 28 L32 28" stroke="#2a2a2a" stroke-width="0.8" marker-end="url(#ar)"/><path d="M48 28 L58 28" stroke="#2a2a2a" stroke-width="0.8" marker-end="url(#ar)"/><defs><marker id="ar" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto"><path d="M0,0 L4,2 L0,4 z" fill="#2a2a2a"/></marker></defs></svg>`;

// "action" — 3 checklist items with check marks
export const TAKEAWAY_ACTION = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><rect x="10" y="14" width="6" height="6" rx="1" fill="none" stroke="#2a2a2a" stroke-width="0.8"/><path d="M11 17 L13 19 L16 15" stroke="#d97757" stroke-width="1.2" fill="none"/><line x1="20" y1="17" x2="58" y2="17" stroke="#2a2a2a" stroke-width="0.7"/><rect x="10" y="26" width="6" height="6" rx="1" fill="none" stroke="#2a2a2a" stroke-width="0.8"/><path d="M11 29 L13 31 L16 27" stroke="#d97757" stroke-width="1.2" fill="none"/><line x1="20" y1="29" x2="62" y2="29" stroke="#2a2a2a" stroke-width="0.7"/><rect x="10" y="38" width="6" height="6" rx="1" fill="none" stroke="#2a2a2a" stroke-width="0.8"/><line x1="20" y1="41" x2="54" y2="41" stroke="#2a2a2a" stroke-width="0.7"/></svg>`;

// "story" — narrative arc (rising action → peak → resolution)
export const TAKEAWAY_STORY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><path d="M8 44 Q22 42 30 34 Q40 18 50 26 Q60 34 72 32" stroke="#2a2a2a" stroke-width="1.2" fill="none"/><circle cx="8" cy="44" r="1.5" fill="#2a2a2a"/><circle cx="40" cy="20" r="2" fill="#d97757"/><circle cx="72" cy="32" r="1.5" fill="#2a2a2a"/></svg>`;

// ---------- preset swatches ----------
// Compact color + typography fingerprint per built-in preset.
// bg + title bar (weight + shape of the font family) + accent mark.

export const PRESET_MINIMAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#ffffff" stroke="#e8e6dc" stroke-width="0.5"/><line x1="10" y1="20" x2="50" y2="20" stroke="#1a1a1a" stroke-width="1.6"/><line x1="10" y1="28" x2="36" y2="28" stroke="#1a1a1a" stroke-width="0.5" opacity="0.4"/><line x1="10" y1="33" x2="40" y2="33" stroke="#1a1a1a" stroke-width="0.5" opacity="0.4"/></svg>`;

export const PRESET_WARM = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf9f5"/><rect x="8" y="10" width="3" height="14" fill="#d97757"/><text x="16" y="22" font-family="serif" font-size="10" fill="#141413" font-weight="600">Warm</text><line x1="8" y1="32" x2="48" y2="32" stroke="#141413" stroke-width="0.4" opacity="0.4"/><line x1="8" y1="37" x2="52" y2="37" stroke="#141413" stroke-width="0.4" opacity="0.4"/><line x1="8" y1="42" x2="40" y2="42" stroke="#141413" stroke-width="0.4" opacity="0.4"/></svg>`;

export const PRESET_DARK_TECH = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#0a0a0a"/><text x="8" y="22" font-family="monospace" font-size="8" fill="#00ff88" font-weight="bold">$ ./deck</text><line x1="8" y1="30" x2="44" y2="30" stroke="#00ff88" stroke-width="0.4"/><line x1="8" y1="35" x2="52" y2="35" stroke="#f0f0f0" stroke-width="0.4" opacity="0.5"/><line x1="8" y1="40" x2="36" y2="40" stroke="#f0f0f0" stroke-width="0.4" opacity="0.5"/><rect x="8" y="44" width="2" height="4" fill="#00ff88"/></svg>`;

export const PRESET_EDITORIAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf8f4"/><text x="10" y="18" font-family="Georgia, serif" font-size="11" fill="#141413" font-weight="bold" font-style="italic">Editorial</text><line x1="10" y1="26" x2="38" y2="26" stroke="#141413" stroke-width="0.3"/><line x1="10" y1="30" x2="38" y2="30" stroke="#141413" stroke-width="0.3"/><line x1="10" y1="34" x2="34" y2="34" stroke="#141413" stroke-width="0.3"/><line x1="44" y1="26" x2="70" y2="26" stroke="#141413" stroke-width="0.3"/><line x1="44" y1="30" x2="70" y2="30" stroke="#141413" stroke-width="0.3"/><line x1="44" y1="34" x2="66" y2="34" stroke="#141413" stroke-width="0.3"/></svg>`;

export const PRESET_PLAYFUL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" rx="4" fill="#fff4ec"/><rect x="8" y="10" width="30" height="18" rx="4" fill="#d97757"/><text x="23" y="23" font-family="serif" font-size="9" fill="#fff" font-weight="bold" text-anchor="middle">42M</text><line x1="42" y1="16" x2="70" y2="16" stroke="#141413" stroke-width="0.5"/><line x1="42" y1="22" x2="64" y2="22" stroke="#141413" stroke-width="0.4" opacity="0.5"/><circle cx="14" cy="42" r="3" fill="#0066ff" opacity="0.7"/><circle cx="24" cy="42" r="3" fill="#00c896" opacity="0.7"/></svg>`;

export const PRESET_BILINGUAL = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 56"><rect width="80" height="56" fill="#faf7ee"/><text x="8" y="16" font-family="Kaiti, KaiTi, serif" font-size="9" fill="#141413" font-weight="bold">机构研报</text><text x="8" y="25" font-family="Georgia, serif" font-size="7" fill="#141413" font-style="italic" opacity="0.7">Research Report</text><line x1="8" y1="32" x2="50" y2="32" stroke="#d97757" stroke-width="0.8"/><line x1="8" y1="38" x2="70" y2="38" stroke="#141413" stroke-width="0.3" opacity="0.4"/><line x1="8" y1="43" x2="66" y2="43" stroke="#141413" stroke-width="0.3" opacity="0.4"/></svg>`;

/** Lookup for preset previews by id. */
export const PRESET_THUMBS: Record<string, string> = {
  minimal: PRESET_MINIMAL,
  warm: PRESET_WARM,
  'dark-tech': PRESET_DARK_TECH,
  editorial: PRESET_EDITORIAL,
  playful: PRESET_PLAYFUL,
  'bilingual-report': PRESET_BILINGUAL,
};

/** Lookup for density previews. */
export const DENSITY_THUMBS: Record<string, string> = {
  minimal: DENSITY_MINIMAL,
  moderate: DENSITY_MODERATE,
  detailed: DENSITY_DETAILED,
};

/** Lookup for key-takeaway (narrative) previews. */
export const TAKEAWAY_THUMBS: Record<string, string> = {
  number: TAKEAWAY_NUMBER,
  logic: TAKEAWAY_LOGIC,
  action: TAKEAWAY_ACTION,
  story: TAKEAWAY_STORY,
};
