// ============================================================================
// Lasca — mdDesign parser
// ============================================================================
// Parses a Slidev-compatible mdDesign string into ParsedMdDesign.
//
// Format recap:
//   ---                          ← deck-level YAML front-matter
//   theme: lasca
//   preset: editorial
//   ---
//
//   ---                          ← slide 1 YAML front-matter
//   layout: cover
//   ---
//
//   # Q3 Business Review         ← slide 1 body markdown
//
//   ---                          ← slide 2 YAML front-matter
//   layout: big-number
//   bigNumber: $3.5M
//   ---
//
//   ## Revenue Growth             ← slide 2 body markdown
//
// The first --- block (if it has no `layout` key) is treated as deck-level.
// Every subsequent --- block with a `layout` key starts a new slide.
// ============================================================================

import matter from 'gray-matter';
import type {
  MdDesignDeckFrontMatter,
  MdDesignSlideFrontMatter,
  ParsedSlide,
  ParsedMdDesign,
} from './types';
import { MdDesignParseError } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Split mdDesign source into raw sections delimited by `---` on its own line.
 * Returns an array of { yaml: string; body: string } tuples.
 *
 * We don't use gray-matter for the whole document because gray-matter only
 * parses the FIRST front-matter block.  Slidev format has N blocks, so we
 * split manually, then run gray-matter on each block individually.
 */
function splitSections(source: string): Array<{ raw: string; yaml: string; body: string }> {
  // Normalize line endings
  const normalized = source.replace(/\r\n/g, '\n');

  // Split on lines that are exactly `---` (with optional trailing whitespace)
  // The regex splits on `\n---\n` boundaries.  We also handle the case where
  // the document starts with `---` (common Slidev format).
  const parts: string[] = [];
  const lines = normalized.split('\n');
  let inFrontMatter = false;
  let sectionStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') {
      if (inFrontMatter) {
        // Closing a front-matter block
        inFrontMatter = false;
        parts.push(lines.slice(sectionStart, i + 1).join('\n'));
        sectionStart = i + 1;
      } else {
        // Opening a new front-matter block — flush any body before it
        const bodyBefore = lines.slice(sectionStart, i).join('\n').trim();
        if (bodyBefore && parts.length > 0) {
          // Append body to the last section
          parts[parts.length - 1] += '\n' + bodyBefore;
        }
        inFrontMatter = true;
        sectionStart = i;
      }
    }
  }

  // Flush remaining lines as body of the last section
  const remaining = lines.slice(sectionStart).join('\n').trim();
  if (remaining) {
    if (parts.length > 0) {
      parts[parts.length - 1] += '\n' + remaining;
    } else {
      parts.push(remaining);
    }
  }

  // Parse each section into { yaml, body } using gray-matter
  return parts.map(raw => {
    const trimmedRaw = raw.trim();
    if (trimmedRaw.startsWith('---')) {
      try {
        const parsed = matter(trimmedRaw);
        return {
          raw: trimmedRaw,
          yaml: JSON.stringify(parsed.data),
          body: parsed.content.trim(),
        };
      } catch {
        return { raw: trimmedRaw, yaml: '{}', body: trimmedRaw };
      }
    }
    return { raw: trimmedRaw, yaml: '{}', body: trimmedRaw };
  });
}

/**
 * Validate that a layout value is one of the 8 Lasca layouts or the 2
 * faithful layouts.
 */
const VALID_LAYOUTS = new Set([
  'cover', 'big-number', 'three-cards', 'two-column',
  'stacked-bars', 'grid-cards', 'quote', 'image',
  'pptx-faithful', 'pdf-faithful',
]);

function isValidLayout(v: unknown): boolean {
  return typeof v === 'string' && VALID_LAYOUTS.has(v);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse a Slidev-compatible mdDesign document into structured data.
 *
 * @param source  The raw mdDesign markdown string.
 * @returns       ParsedMdDesign with deck-level settings + per-slide array.
 * @throws        MdDesignParseError on malformed input (safe to surface in UI).
 */
export function parseMdDesign(source: string): ParsedMdDesign {
  if (!source || !source.trim()) {
    throw new MdDesignParseError('mdDesign document is empty');
  }

  const sections = splitSections(source);

  if (sections.length === 0) {
    throw new MdDesignParseError('mdDesign document has no sections');
  }

  let deck: MdDesignDeckFrontMatter = {};
  const slides: ParsedSlide[] = [];
  let startIdx = 0;

  // Check if the first section is deck-level (has no `layout` field)
  try {
    const firstData = JSON.parse(sections[0].yaml);
    if (!firstData.layout) {
      // This is deck-level front-matter
      deck = firstData as MdDesignDeckFrontMatter;
      startIdx = 1;
    }
  } catch {
    // First section is not valid YAML — treat as slide body
  }

  // Parse remaining sections as slides
  for (let i = startIdx; i < sections.length; i++) {
    const section = sections[i];
    let data: Record<string, unknown>;

    try {
      data = JSON.parse(section.yaml);
    } catch {
      data = {};
    }

    // Skip empty sections (just whitespace between --- blocks)
    if (!data.layout && !section.body.trim()) {
      continue;
    }

    // Validate layout
    if (!data.layout) {
      throw new MdDesignParseError(
        `第 ${slides.length + 1} 页缺少 layout 字段`,
        slides.length,
      );
    }

    if (!isValidLayout(data.layout)) {
      throw new MdDesignParseError(
        `第 ${slides.length + 1} 页的 layout "${String(data.layout)}" 不是有效的 Lasca layout`,
        slides.length,
      );
    }

    slides.push({
      frontMatter: data as MdDesignSlideFrontMatter,
      body: section.body,
    });
  }

  if (slides.length === 0) {
    throw new MdDesignParseError('mdDesign document has no slides (no sections with layout field found)');
  }

  return { deck, slides, source };
}

// ---------------------------------------------------------------------------
// Serializer (for round-tripping: ParsedMdDesign → mdDesign string)
// ---------------------------------------------------------------------------

/**
 * Serialize a ParsedMdDesign back to a Slidev-compatible mdDesign string.
 * Used when the user edits the parsed structure (e.g. changes a layout in
 * the UI) and we need to regenerate the source for storage / display.
 */
export function serializeMdDesign(parsed: ParsedMdDesign): string {
  const parts: string[] = [];

  // Deck-level front-matter
  const deckKeys = Object.keys(parsed.deck);
  if (deckKeys.length > 0) {
    const deckYaml = deckKeys
      .filter(k => parsed.deck[k as keyof MdDesignDeckFrontMatter] !== undefined)
      .map(k => {
        const val = parsed.deck[k as keyof MdDesignDeckFrontMatter];
        if (typeof val === 'object' && val !== null) {
          // Nested object (e.g. fonts) — inline YAML
          const inner = Object.entries(val as Record<string, unknown>)
            .map(([ik, iv]) => `  ${ik}: ${String(iv)}`)
            .join('\n');
          return `${k}:\n${inner}`;
        }
        if (Array.isArray(val)) {
          return `${k}:\n${(val as string[]).map(v => `  - ${v}`).join('\n')}`;
        }
        return `${k}: ${typeof val === 'string' && val.includes(' ') ? `"${val}"` : String(val)}`;
      })
      .join('\n');
    parts.push(`---\n${deckYaml}\n---`);
  }

  // Per-slide sections
  for (const slide of parsed.slides) {
    const fm = slide.frontMatter;
    const yamlLines: string[] = [];

    // layout is always first
    yamlLines.push(`layout: ${fm.layout}`);

    // Other front-matter fields
    for (const [k, v] of Object.entries(fm)) {
      if (k === 'layout') continue;
      if (v === undefined || v === null) continue;
      if (typeof v === 'string') {
        yamlLines.push(`${k}: ${v.includes('\n') ? `|\n  ${v.replace(/\n/g, '\n  ')}` : v}`);
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        yamlLines.push(`${k}: ${String(v)}`);
      }
      // Skip complex objects for now (cards etc. stay in body markdown)
    }

    const slideBlock = `---\n${yamlLines.join('\n')}\n---`;
    parts.push(slide.body ? `${slideBlock}\n\n${slide.body}` : slideBlock);
  }

  return parts.join('\n\n');
}
