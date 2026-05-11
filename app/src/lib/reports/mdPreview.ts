// ============================================================================
// mdPreview — lightweight md → HTML for the ReportSourcePane "Preview" tab
// ============================================================================
// Goal: turn a parsed report into a human-readable prose view, the way
// Typora / Bear / GitHub render a markdown file. Deliberately NOT the full
// paged.js channel — no cover, no section capsule, no end page, no per-theme
// fonts. Just legible styled text the author can scan to confirm their
// markdown parses as they expect.
//
// Front-matter (title/date/author/header/footer) renders as a small meta
// block at the top. Section headings keep their authored numeric prefix
// (the `## 03 X` stays "03 X", not a styled capsule + title split).
// ============================================================================

import type { ParsedReport } from './mdToReportDeck';
import type { ReportBlock } from '../types';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal inline markdown support — just enough for the preview to read
// naturally. Paragraphs with **bold**, *italic*, and `code` get styled;
// more exotic inline stuff stays as plain text. Full markdown spec is NOT
// a goal here — this is a visual sanity check.
function inline(s: string): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

function renderBlock(block: ReportBlock): string {
  switch (block.kind) {
    case 'section-heading': {
      // Preserve the authored numeric prefix verbatim — "03 X" stays together.
      const prefix = block.number ? `${block.number} ` : '';
      return `<h2 class="md-preview-h2">${esc(prefix)}${inline(block.text)}</h2>`;
    }
    case 'body-para':
      return `<p>${inline(block.text)}</p>`;
    case 'callout':
      return `<blockquote class="md-preview-callout">${inline(block.text)}</blockquote>`;
    case 'quote-pull': {
      const attr = block.attribution ? `<footer>— ${esc(block.attribution)}</footer>` : '';
      return `<blockquote class="md-preview-quote">${inline(block.text)}${attr}</blockquote>`;
    }
    case 'figure': {
      const cap = block.caption ? `<figcaption>${inline(block.caption)}</figcaption>` : '';
      return `<figure class="md-preview-figure"><img src="${esc(block.imageUrl)}" alt="${esc(block.alt || '')}" />${cap}</figure>`;
    }
    case 'table-block': {
      const headCells = block.table.headers.map(h => `<th>${inline(h)}</th>`).join('');
      const bodyRows = block.table.rows
        .map(row => `<tr>${row.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      return `<table class="md-preview-table"><thead><tr>${headCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    }
    case 'list-block': {
      const Tag = block.ordered ? 'ol' : 'ul';
      const items = block.items.map(i => `<li>${inline(i)}</li>`).join('');
      return `<${Tag} class="md-preview-list">${items}</${Tag}>`;
    }
    case 'footnote-row':
      return `<p class="md-preview-footnote"><small>${inline(block.text)}</small></p>`;
    case 'sidenote-group':
      return `
        <div class="md-preview-sidenote-group">
          <aside class="md-preview-sidenote-note">${inline(block.sidenote)}</aside>
          <div class="md-preview-sidenote-body">${inline(block.body)}</div>
        </div>`;
    default:
      return '';
  }
}

export function renderMdPreviewHtml(parsed: ParsedReport): string {
  const cover = parsed.cover;
  const metaRows: string[] = [];
  if (cover?.title) metaRows.push(`<h1 class="md-preview-h1">${inline(cover.title)}</h1>`);
  if (cover?.subtitle) metaRows.push(`<p class="md-preview-subtitle">${inline(cover.subtitle)}</p>`);
  const metaLine: string[] = [];
  if (cover?.date) metaLine.push(esc(cover.date));
  if (cover?.author) metaLine.push(esc(cover.author));
  if (parsed.header) metaLine.push(`Header: ${esc(parsed.header)}`);
  if (parsed.footer) metaLine.push(`Footer: ${esc(parsed.footer)}`);
  if (metaLine.length) {
    metaRows.push(`<p class="md-preview-meta">${metaLine.join(' · ')}</p>`);
  }
  const metaBlock = metaRows.length
    ? `<div class="md-preview-front">${metaRows.join('')}</div>`
    : '';

  const body = parsed.elements
    .filter((el): el is ReportBlock => el.kind !== '__page_break__')
    .map(renderBlock)
    .join('');

  return metaBlock + body;
}

// Inline stylesheet — scoped under the .md-preview root so it doesn't leak
// into the rest of the editor. Theme-agnostic palette: warm paper, plain
// serif for the two headings, sans for body. Kept small and self-contained.
export const MD_PREVIEW_CSS = `
  .md-preview {
    color: #2a2a2a;
    font-family: -apple-system, system-ui, 'Segoe UI', sans-serif;
  }
  .md-preview .md-preview-front {
    margin: 0 0 28px;
    padding: 0 0 18px;
    border-bottom: 1px solid #e8e6dc;
  }
  .md-preview .md-preview-h1 {
    font-size: 22px;
    font-weight: 700;
    color: #141413;
    margin: 0 0 6px;
    line-height: 1.3;
    font-family: Georgia, 'Noto Serif SC', serif;
  }
  .md-preview .md-preview-subtitle {
    font-size: 13px;
    color: #6b6a65;
    margin: 0 0 6px;
    line-height: 1.5;
  }
  .md-preview .md-preview-meta {
    font-size: 11px;
    color: #8a8880;
    margin: 0;
    letter-spacing: 0.04em;
  }
  .md-preview .md-preview-h2 {
    font-size: 16px;
    font-weight: 700;
    color: #141413;
    margin: 24px 0 8px;
    line-height: 1.4;
    font-family: Georgia, 'Noto Serif SC', serif;
  }
  .md-preview p {
    font-size: 13px;
    line-height: 1.7;
    color: #2a2a2a;
    margin: 0 0 10px;
  }
  .md-preview strong { font-weight: 700; color: #141413; }
  .md-preview em { font-style: italic; }
  .md-preview code {
    background: #f0efeb;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 12px;
  }
  .md-preview .md-preview-list {
    padding-left: 22px;
    margin: 0 0 12px;
  }
  .md-preview .md-preview-list li {
    font-size: 13px;
    line-height: 1.7;
    color: #2a2a2a;
    margin: 0 0 4px;
  }
  .md-preview .md-preview-callout {
    margin: 12px 0;
    padding: 10px 14px;
    background: #faf6f0;
    border-left: 3px solid #c9a981;
    border-radius: 2px;
    font-size: 13px;
    color: #2a2a2a;
  }
  .md-preview .md-preview-callout p { margin: 0; }
  .md-preview .md-preview-quote {
    margin: 16px 0;
    padding-left: 16px;
    border-left: 2px solid #d3cfbf;
    font-style: italic;
    color: #4a4a4a;
  }
  .md-preview .md-preview-quote footer {
    font-size: 12px;
    color: #8a8880;
    font-style: normal;
    margin-top: 4px;
  }
  .md-preview .md-preview-figure {
    margin: 16px 0;
    text-align: center;
  }
  .md-preview .md-preview-figure img {
    max-width: 100%;
    border-radius: 4px;
  }
  .md-preview .md-preview-figure figcaption {
    font-size: 12px;
    color: #8a8880;
    margin-top: 6px;
    font-style: italic;
  }
  .md-preview .md-preview-table {
    border-collapse: collapse;
    margin: 12px 0;
    width: 100%;
    font-size: 12px;
  }
  .md-preview .md-preview-table th,
  .md-preview .md-preview-table td {
    padding: 6px 10px;
    border: 1px solid #e8e6dc;
    text-align: left;
    vertical-align: top;
  }
  .md-preview .md-preview-table th {
    background: #f5f4ef;
    font-weight: 600;
    color: #141413;
  }
  .md-preview .md-preview-footnote {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid #eeece5;
    color: #6b6a65;
    font-size: 11px;
    line-height: 1.5;
  }
  .md-preview .md-preview-sidenote-group {
    display: grid;
    grid-template-columns: 120px 1fr;
    gap: 12px;
    margin: 12px 0;
  }
  .md-preview .md-preview-sidenote-note {
    font-size: 11px;
    color: #8a8880;
    font-style: italic;
    line-height: 1.45;
  }
  .md-preview .md-preview-sidenote-body {
    font-size: 13px;
    line-height: 1.7;
    color: #2a2a2a;
  }
`;
