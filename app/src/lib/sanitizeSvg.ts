// ============================================================================
// Lasca — SVG sanitizer for the svg-figure free-slot (C2)
// ============================================================================
// A ~100-line whitelist parser: stricter than DOMPurify's blacklist approach,
// zero runtime dependencies, predictable attack surface. LLM emits inline
// <svg>; we parse it, drop anything not on the whitelist, re-serialize.
//
// Forbidden at all costs: <script>, <foreignObject>, on* handlers,
// javascript: URLs, href on anything other than <use>, external data: URLs.
//
// Theme bridge: LLMs are instructed via prompts.{zh,en}.ts to use
// `currentColor` and `var(--lasca-*)` — NOT hex literals. This function does
// not enforce palette (too fragile) but strips anything that could break out
// of the SVG sandbox.
// ============================================================================

/** Elements the LLM may emit. Everything else is dropped (children preserved
 *  for layout-only wrappers like <g>, removed entirely for structural
 *  forbidden elements like <script>). */
const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'symbol', 'use',
  'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textpath',
  'marker', 'linearGradient', 'radialGradient', 'stop',
  'clipPath', 'mask', 'pattern',
  'title', 'desc',
]);

/** Attributes allowed on any element. `style` is a nested allowlist — see
 *  ALLOWED_STYLE_PROPS. `href` / `xlink:href` restricted to <use> only. */
const ALLOWED_ATTRS = new Set([
  'id', 'class', 'style',
  'viewBox', 'preserveAspectRatio', 'xmlns', 'xmlns:xlink',
  'width', 'height',
  'x', 'y', 'dx', 'dy',
  'cx', 'cy', 'r', 'rx', 'ry',
  'x1', 'y1', 'x2', 'y2',
  'd', 'points',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
  'opacity', 'transform',
  'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing',
  'offset', 'stop-color', 'stop-opacity',
  'vector-effect', 'clip-path', 'mask',
  'gradientUnits', 'gradientTransform', 'spreadMethod',
  'patternUnits', 'patternTransform',
  'markerUnits', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
]);

/** Inside style="..." only these CSS properties are preserved. Everything
 *  else is stripped — no `background: url(...)`, no `cursor`, no `position`. */
const ALLOWED_STYLE_PROPS = new Set([
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray',
  'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
  'opacity', 'transform', 'transform-origin',
  'font-family', 'font-size', 'font-weight', 'font-style',
  'letter-spacing', 'text-anchor', 'dominant-baseline',
  'mix-blend-mode', 'filter',
]);

const URL_BLOCKLIST = /^\s*(javascript|data|vbscript|file):/i;

/** Sanitize an SVG string. Returns the cleaned markup, or empty string if the
 *  input is not parseable SVG. Never throws. */
export function sanitizeSvg(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Require a top-level <svg> tag — reject anything else to keep the attack
  // surface minimal. The LLM is instructed to emit a complete <svg ...>.
  if (!/^<svg[\s>]/i.test(trimmed)) return '';

  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // SSR/node fallback — conservative regex strip. Good enough because
    // Lasca only renders in the browser today; this path is defensive.
    return regexStrip(trimmed);
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(trimmed, 'image/svg+xml');
    const root = doc.documentElement;
    // parsererror nodes signal malformed SVG — reject wholesale.
    if (root.tagName.toLowerCase() === 'parsererror' || doc.getElementsByTagName('parsererror').length > 0) {
      return '';
    }
    if (root.tagName.toLowerCase() !== 'svg') return '';
    cleanNode(root);
    return new XMLSerializer().serializeToString(root);
  } catch {
    return '';
  }
}

function cleanNode(node: Element): void {
  // Walk children first (clone to array — we mutate). Depth-first so we can
  // decide to drop the parent after its children were sanitized.
  const children = Array.from(node.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (!ALLOWED_ELEMENTS.has(tag)) {
      // Hostile tags (<script>, <foreignObject>, <iframe>, ...) are removed
      // entirely, children included. Unknown SVG tags also dropped.
      child.remove();
      continue;
    }
    cleanNode(child);
  }

  // Strip disallowed attrs on this node.
  const attrs = Array.from(node.attributes);
  for (const attr of attrs) {
    const name = attr.name.toLowerCase();
    // on* event handlers are always removed.
    if (name.startsWith('on')) {
      node.removeAttribute(attr.name);
      continue;
    }
    // href / xlink:href only allowed on <use>, and never a hostile URL.
    if (name === 'href' || name === 'xlink:href') {
      if (node.tagName.toLowerCase() !== 'use' || URL_BLOCKLIST.test(attr.value)) {
        node.removeAttribute(attr.name);
      }
      continue;
    }
    if (name === 'style') {
      const cleaned = cleanStyle(attr.value);
      if (cleaned) node.setAttribute('style', cleaned);
      else node.removeAttribute('style');
      continue;
    }
    if (!ALLOWED_ATTRS.has(attr.name) && !ALLOWED_ATTRS.has(name)) {
      node.removeAttribute(attr.name);
      continue;
    }
    // Even allowed attrs get their value scrubbed for URL-ish values.
    if (URL_BLOCKLIST.test(attr.value)) {
      node.removeAttribute(attr.name);
    }
  }
}

function cleanStyle(raw: string): string {
  const parts: string[] = [];
  for (const decl of raw.split(';')) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx < 0) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = decl.slice(colonIdx + 1).trim();
    if (!prop || !val) continue;
    if (!ALLOWED_STYLE_PROPS.has(prop)) continue;
    if (/url\s*\(/i.test(val)) continue;
    if (/expression\s*\(/i.test(val)) continue;
    if (URL_BLOCKLIST.test(val)) continue;
    parts.push(`${prop}: ${val}`);
  }
  return parts.join('; ');
}

function regexStrip(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<image[^>]*\shref\s*=\s*("[^"]*"|'[^']*')[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^>\s]+)/gi, '')
    .replace(/(href|xlink:href)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '')
    .replace(/\sstyle\s*=\s*"[^"]*url\s*\([^"]*"/gi, '');
}
