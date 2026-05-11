'use client';

// ============================================================================
// /test-paged — pagedjs spike route
// ============================================================================
// Standalone test harness: paste markdown → parseMd → render blocks into one
// flow → pagedjs Previewer → paginated output. Does NOT touch the production
// paginator. Purpose is to verify pagedjs handles the known failure modes on
// the CJK+English institutional memo (mid-character clip, sparse pages from
// hard H2 breaks, narrow table columns) before any migration commitment.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseMd, type Element } from '@/lib/reports/mdToReportDeck';
import type { ReportCoverData } from '@/lib/types';
import { renderReportBlock } from '@/lib/reports/renderReportPage';
import { THEMES } from '@/lib/themes';

const SAMPLE_MD = `---
title: 3月成屋市场观察
date: 2026-04-22
author: LASCA Research
header: § MEMO · LASCA RESEARCH
footer: LASCA Research · 2026-04
---

## 01 3月成屋市场：滞后逻辑与价格韧性

### 交割环比压力的根源解读

3月成屋销售（SAAR）为398万套，环比下降3.6%，一度看似疲软。但这一数据的正确解读需要理解签约与交割的时间滞后机制。成屋销售的签约到交割通常滞后1-2个月，因此3月的成交量本质上是1月和2月签约的混合结果。

1月签约处于年度最低点（历史低位），是3月成交承压的主要拖累因素。同时，2月签约环比反弹+1.8%，但其积极效应仅部分传导至3月，更大的改善预期将体现在4月-5月的成交数据中。因此，3月成交的下降不是当下市场流动性恶化的信号，而是前期低迷的延迟体现——这种滞后效应属于正常的市场运行范畴。

源: NAR 2026年4月13日《成屋销售报告》 https://www.nar.realtor/newsroom/nar-existing-home-sales-report-shows-3-6-decrease-in-march

### 连续第33个月的同比正增长

价格端呈现出显著的韧性与持续性。全类型房屋中位数价格为\\$408,800，环比上升0.7%，同比增长1.4%——这标志着资产价格实现连续第33个月的同比正增长。在利率处于6.3%-6.5%区间、消费者信心承压的双重背景下，这种持续的同比正增长充分证明了住房资产在供给受限环境下的稀缺溢价。

物业类型层面呈现出清晰的分化。独栋别墅中位数\\$412,400、同比上涨1.3%，继续守住\\$400,000关口，体现出这一物业类型在供给极度受限环境下的持久竞争力。Condominiums and Co-ops 的价格表现更弱，中位数\\$371,500、同比增长2.3%；但销量环比下降5.4%，同比下降9.0%。

### 区域分化：南部领先，西部开始跟上

| 区域 | 销量口径 | 价格口径 | 当前判断 |
|---|---|---|---|
| 东北部 | SAAR 43万套，环比-8.5%，同比-12.2% | 中位价 \\$494,500，同比+5.7% | 交易受季节性压制最明显，但高端置换需求和价格韧性仍在 |
| 中西部 | SAAR 92万套，环比-4.2%，同比-3.2% | 中位价 \\$315,500，同比+4.9% | 成交回落但价格韧性最强之一，属于"量弱价稳" |
| 南部 | SAAR 186万套，环比-3.1%，同比+2.2% | 中位价 \\$362,600，同比+0.8% | 唯一销量同比转正且价格同比继续上涨的区域，仍是全国修复主轴 |
| 西部 | SAAR 77万套，环比-1.3%，同比+1.3% | 中位价 \\$613,400，同比-1.3% | 高价区域仍在消化可负担性压力，但销量已率先同比转正 |

这组数据说明，3月全国区域分化的主线并不是"只有南部能看"，而是"南部领先、西部开始跟上、中西部和东北价格韧性仍在"。

## 02 前瞻指标：新签约领涨，可负担性

### Zillow新签约走强

最强的前瞻信号来自Zillow的新签约数据。3月新签约（Newly Pending）同比增长6.4%，环比增长29.8%；3月新增pending总量达到281,546套，为2022年8月以来第二高。同周Zillow口径还交叉到30,047套，同比增长5.3%，环比下降25.2%——这一路径仍然到成交交易的通道里，修复势头仍然显著。

Zillow Research 将当前市场的定性为"Spring housing market accelerates despite mortgage rate spike"。虽然短期强调了利率的短期扰动，但核心判断是4月报告中市场的情绪通道。基于这一领先信号，我们可以合理预测4月-5月的NAR成交数据将进一步改善。

### 可负担性指数的同比恢复

NAR 可负担性指数3月录得113.7，环比下降3.2%（来自2月的117.5），但同比大幅改善9.1%（来自一年前的104.2）。环比的小幅回落主要由价格抬升驱动，但同比改善意味着薪资增长、利率下行、房价回调三者叠加。

## 03 买家构成的逆周期信号

3月的实家构成数据透露出一个关键的市场心理变化。独栋买家占比从2月的31%下降到3月的27%，较2月下降4个百分点，可变化幅度不大，但其金义又深远——这反映出消费者的购房意愿在改善。当前实力提升、可负担性改善时，消费者会更愿意用利率下调作为金融全部条件。这种担心被压制的购房需求正在酝酿释放。

## 04 结论

市场当前整体图景：修复逻辑仍在轨道上，但节奏比 headline 看起来更慢。区域分化仍是主轴，南部领跑，西部跟上。前瞻指标整体偏强。
`;

// Basic HTML escape for user-authored strings we drop into the minimal
// cover block. Mirrors what esc() does in renderSlide.ts — repeated here
// so we don't have to deepen the import surface for a 4-field cover.
function escText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildCoverHtml(cover: ReportCoverData | null): string {
  if (!cover) return '';
  const t = THEMES.warm;
  const subtitle = cover.subtitle
    ? `<p style="font-size:15px; color:${t.muted}; margin:0 0 60px; line-height:1.6; max-width:560px;">${escText(cover.subtitle)}</p>`
    : '';
  const meta: string[] = [];
  if (cover.date) meta.push(escText(cover.date));
  if (cover.author) meta.push(escText(cover.author));
  const metaLine = meta.length
    ? `<p style="font-size:11px; color:${t.muted}; letter-spacing:0.12em; text-transform:uppercase; margin:0;">${meta.join(' · ')}</p>`
    : '';
  // Flex-column fills the page; title block centers vertically. `height: 100vh`
  // would size against viewport, not a paged.js page — a big min-height hint
  // lets the page shell give this block its own page naturally.
  return `
    <div class="cover-page" style="display:flex; flex-direction:column; justify-content:center; align-items:flex-start; min-height:900px; padding:40px 0;">
      <h1 style="font-size:36px; font-weight:600; color:${t.primary}; line-height:1.25; margin:0 0 28px; max-width:640px;">${escText(cover.title)}</h1>
      ${subtitle}
      ${metaLine}
    </div>`;
}

function buildFlowHtml(elements: Element[], cover: ReportCoverData | null): string {
  const themeConfig = THEMES.warm;
  const parts: string[] = [];
  let blockIdx = 0;

  // Dedupe helper — skip emitting a break when the last part already IS a
  // break. Prevents runs like (H2 __page_break__ + standalone table break)
  // from stacking into empty pages between content.
  const pushBreakIfNotDup = () => {
    const last = parts[parts.length - 1] ?? '';
    if (!last.includes('paged-break')) {
      parts.push('<div class="paged-break" aria-hidden="true"></div>');
    }
  };

  // Emit cover first. Doing so also sets the "any content rendered" flag
  // so the FIRST __page_break__ marker (the one before Section 01) now
  // naturally emits a page break — Section 01 starts on page 2 and the
  // cover owns page 1 by itself.
  const coverHtml = buildCoverHtml(cover);
  if (coverHtml) parts.push(coverHtml);
  let sawAnyContent = coverHtml !== '';

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];

    if (el.kind === '__page_break__') {
      // Numbered H2 ceremony: each new section starts on a fresh page.
      // The VERY FIRST break (before any rendered content) is suppressed
      // so we don't leave a blank page zero. A short section at the end
      // of the report that leaves half a page blank after 风险提示 /
      // 免责声明 is intentional ceremony for institutional reports.
      if (sawAnyContent) pushBreakIfNotDup();
      continue;
    }

    // Every table-block starts on a fresh page. Paged.js has a reproducible
    // bug where mid-page tables whose total height exceeds the remaining
    // space silently drop rows during its split/fallback path (witnessed
    // 4-row, 7-row, and section-tail tables all losing rows when they
    // happened to start mid-page). Starting every table at page top
    // sidesteps that code path entirely — the table either fits on its
    // own page or splits cleanly at row boundaries via `tr { break-inside:
    // avoid }` + `thead { display: table-header-group }`.
    //
    // Consistent with the existing H2 / heading+table ceremony rules.
    // Pre-break is deduped so heading+table pairs (handled below) don't
    // double-break.
    if (el.kind === 'table-block' && sawAnyContent) {
      pushBreakIfNotDup();
      parts.push(renderReportBlock(el, blockIdx++, themeConfig, false));
      continue;
    }

    sawAnyContent = true;
    const html = renderReportBlock(el, blockIdx++, themeConfig, false);

    // Keep-with-next only wraps heading + atomic next block (figure /
    // callout / quote-pull / list / sidenote). Paragraphs flow naturally;
    // tables take the fresh-page path above, not this wrapper.
    const ATOMIC_NEXT_KINDS: Array<Element['kind']> = [
      'figure', 'callout', 'quote-pull', 'list-block', 'sidenote-group',
    ];

    if (el.kind === 'section-heading') {
      const next = elements[i + 1];

      // section-heading + table pair: emit break + heading + table as a
      // single fresh-page unit. Consuming both i and i+1 prevents the
      // table-block branch above from emitting a second break that would
      // land the heading alone on one page and the table on the next.
      if (next && next.kind === 'table-block') {
        pushBreakIfNotDup();
        parts.push(html);
        parts.push(renderReportBlock(next, blockIdx++, themeConfig, false));
        i++;
        continue;
      }

      if (next && next.kind !== '__page_break__' && ATOMIC_NEXT_KINDS.includes(next.kind)) {
        const nextHtml = renderReportBlock(next, blockIdx++, themeConfig, false);
        parts.push(`<div class="keep-with-next">${html}${nextHtml}</div>`);
        i++;
        continue;
      }
    }

    parts.push(html);
  }
  return parts.join('');
}

function buildPageCss(header: string | undefined, footer: string | undefined): string {
  const t = THEMES.warm;
  const headerText = header ? JSON.stringify(header) : '""';
  const footerLeft = footer ? JSON.stringify(footer) : '""';
  return `
@page {
  size: letter;
  margin: 72px 72px 72px 72px;

  @top-left {
    content: ${headerText};
    font-family: 'Poppins', 'Noto Sans SC', sans-serif;
    font-size: 10px;
    color: ${t.muted};
    letter-spacing: 0.05em;
    padding-bottom: 6px;
    border-bottom: 1px solid ${t.border};
    width: 100%;
    vertical-align: bottom;
  }
  @top-right {
    content: "LASCA RESEARCH";
    font-family: 'Poppins', 'Noto Sans SC', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: ${t.muted};
    letter-spacing: 0.15em;
    text-transform: uppercase;
    padding-bottom: 6px;
    border-bottom: 1px solid ${t.border};
    vertical-align: bottom;
  }
  @bottom-left {
    content: ${footerLeft};
    font-family: 'Poppins', 'Noto Sans SC', sans-serif;
    font-size: 10px;
    color: ${t.muted};
    padding-top: 6px;
    border-top: 1px solid ${t.border};
    width: 100%;
    vertical-align: top;
  }
  @bottom-right {
    content: counter(page) " / " counter(pages);
    font-family: 'Poppins', 'Noto Sans SC', sans-serif;
    font-size: 10px;
    font-weight: 600;
    color: ${t.accent};
    padding-top: 6px;
    border-top: 1px solid ${t.border};
    vertical-align: top;
  }
}

@page :first {
  @top-left { content: ""; border: none; }
  @top-right { content: ""; border: none; }
  @bottom-left { content: ""; border: none; }
  @bottom-right { content: ""; border: none; }
}

html, body {
  background: ${t.bg};
  color: ${t.text};
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  margin: 0;
  padding: 0;
}

.lasca-flow {
  font-family: 'Poppins', 'Noto Sans SC', sans-serif;
  color: ${t.text};
  /* Intentionally no background here. Paged.js clones the ancestor chain
     onto each page when an element is split across page boundaries, so a
     colored bg on .lasca-flow would appear ONLY on pages that happen to
     contain the tail of a split paragraph (looking like a random cream
     highlight). Page color comes from the .pagedjs_page rule alone. */
}

/* Hard page break before numbered H2 sections (replaces __page_break__
   marker from mdToReportDeck). A zero-height div with break-before:page. */
.paged-break {
  break-before: page;
  height: 0;
  margin: 0;
  padding: 0;
}

/* Keep related elements intact across page breaks. Tables split at row
   boundaries — break-inside:avoid on rows, header auto-repeats via
   table-header-group. The previous table-level break-inside:avoid kept
   the whole table atomic, but a 7-row CJK table can't fit on any single
   page, and paged.js's forced-split fallback truncated rows silently.
   Letting tables break at row boundaries is the standard print-media
   approach and handles arbitrarily long tables gracefully.
   The table wrapper's overflow:auto (from renderReportPage.ts) is a
   scroll affordance for the on-screen editor and only confuses paged.js
   in a print context — override to visible so paged.js sees the full
   table layout. */
.lasca-flow > figure { break-inside: avoid; }
.lasca-flow div[style*="overflow:auto"],
.lasca-flow div[style*="overflow: auto"] {
  overflow: visible !important;
}
thead { display: table-header-group; }
table, tbody { break-inside: auto; }
tr { break-inside: avoid; page-break-inside: avoid; }

/* Why no table { break-before: avoid } here: we tried it. For a table
   that exceeds a full page (e.g. 7-row CJK data table), paged.js would
   cascade the break back to the heading, land them both on a fresh page,
   discover the table STILL doesn't fit, cascade back again, and loop.
   The loop eventually gives up and truncates mid-table, losing rows.
   Instead, buildFlowHtml emits an explicit .paged-break before any
   section-heading immediately followed by a table, so the pair always
   starts on a fresh page without any retry cascade. */

/* Table column-width fixes. Lasca's cell renderer sets
   word-break:break-word + overflow-wrap:break-word (renderSlide.ts:1498),
   which makes the browser think min-content for each CJK cell is ONE
   character. Auto-table then shrinks the label column to ~20px and
   labels like "成交动向" wrap to three single-character lines.
   Counter:
   - word-break:keep-all on cells keeps CJK syllables together as long as
     a line has room, only breaking when truly necessary. Pairs with
     overflow-wrap:anywhere as a fallback for extreme cases.
   - A generous min-width on the first column (label column) reserves
     ~100px so 2-4-char CJK labels stay on one line.
   - Cells get padding-right via their inline style; we leave that alone. */
.lasca-flow table th,
.lasca-flow table td {
  word-break: keep-all !important;
  overflow-wrap: anywhere !important;
}
.lasca-flow table th:first-child,
.lasca-flow table td:first-child {
  min-width: 100px;
}

/* Citation-keep pairs a body-para with its trailing [信源: ...] citation
   into one atomic div (renderParagraphs in renderSlide.ts:2073). The
   break-inside:avoid rule normally lives under .preset-bilingual-report
   scope (globals.css:954) — we echo it here so the spike gets the same
   behavior without needing the preset class. */
.citation-keep { break-inside: avoid; }

/* Heading + atomic next block travel together: buildFlowHtml wraps the
   pair in a .keep-with-next div when the next block has break-inside:
   avoid (table, figure, callout, quote, list). For heading + body-para
   we rely on widows/orphans + break-after:avoid instead, so long bodies
   can flow mid-page without pushing the whole pair to the next page. */
.keep-with-next { break-inside: avoid; }
h1, h2, h3, h4 { break-after: avoid; }

/* Stay with the CSS default widows/orphans (2) — a previous attempt at
   3/3 caused short section-body paragraphs to get pushed whole to the
   next page when only 2 lines fit on the current one, orphaning the
   heading above them. 2/2 lets at least 2 lines cling to the heading. */
p { widows: 2; orphans: 2; }

/* Pagedjs chrome — hide construction marks, show clean pages */
.pagedjs_pages {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
}
.pagedjs_page {
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08);
}
`;
}

type Status = 'idle' | 'paginating' | 'done' | 'error';

export default function TestPagedPage() {
  const [md, setMd] = useState(SAMPLE_MD);
  const [status, setStatus] = useState<Status>('idle');
  const [pageCount, setPageCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<unknown>(null);

  const parsed = useMemo(() => {
    try {
      return parseMd(md, { locale: 'zh' });
    } catch {
      return null;
    }
  }, [md]);

  async function paginate() {
    if (!outputRef.current || !parsed) return;
    setStatus('paginating');
    setErrorMsg('');
    const started = performance.now();

    // Clear previous render via DOM primitive (no innerHTML write).
    while (outputRef.current.firstChild) {
      outputRef.current.removeChild(outputRef.current.firstChild);
    }

    try {
      const pagedjs = await import('pagedjs');
      const { Previewer } = pagedjs as unknown as { Previewer: new () => {
        preview: (
          content: string | HTMLElement,
          stylesheets: Array<string | Record<string, string>>,
          renderTo: HTMLElement,
        ) => Promise<{ total: number }>;
      } };

      const flowHtml = buildFlowHtml(parsed.elements, parsed.cover);
      const css = buildPageCss(parsed.header, parsed.footer);

      // Build the flow DOM directly. Range.createContextualFragment mirrors
      // ContentParser's own string-path internals (pagedjs/src/chunker/parser.js)
      // — doing it ourselves lets us hand paged.js an HTMLElement. Same trust
      // boundary as Canvas.tsx imperative innerHTML rendering convention.
      const range = document.createRange();
      const fragment = range.createContextualFragment(
        `<div class="lasca-flow">${flowHtml}</div>`,
      );
      const flowEl = fragment.firstElementChild as HTMLElement | null;
      if (!flowEl) throw new Error('Failed to build flow element from parsed md');

      const previewer = new Previewer();
      previewerRef.current = previewer;
      // Paged.js's `polisher.add(...stylesheets)` treats plain strings as URLs
      // and XHRs them. Inline CSS must be passed as { urlKey: cssString } — the
      // key is only used as a sourcemap label; the value is what gets parsed.
      // Without this wrapping, paged.js fetches the CSS string as a relative
      // URL, the dev server returns the Next.js root HTML, and the CSS parser
      // then emits garbage selectors that blow up downstream querySelectorAll.
      const flow = await previewer.preview(
        flowEl,
        [{ 'lasca:inline-page-css': css }],
        outputRef.current,
      );
      setPageCount(flow.total);
      setElapsedMs(Math.round(performance.now() - started));
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  useEffect(() => {
    // Auto-paginate once on mount with the sample.
    paginate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadFromFile(evt: React.ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setMd(text);
    };
    reader.readAsText(file);
    // Clear input so the same file can be re-loaded later.
    evt.target.value = '';
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #ddd', background: '#f7f6f2' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          <strong style={{ fontSize: 14 }}>/test-paged</strong>
          <span style={{ color: '#666' }}>pagedjs spike · warm theme · letter</span>
          <div style={{ flex: 1 }} />
          <label
            style={{
              padding: '6px 12px',
              background: 'white',
              color: '#444',
              border: '1px solid #ccc',
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Load .md
            <input
              type="file"
              accept=".md,.markdown,.txt"
              onChange={loadFromFile}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={paginate}
            disabled={status === 'paginating'}
            style={{
              padding: '6px 14px',
              background: status === 'paginating' ? '#ccc' : '#d97757',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              cursor: status === 'paginating' ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {status === 'paginating' ? 'Paginating…' : 'Paginate'}
          </button>
        </div>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid #ddd', fontSize: 12, color: '#555', display: 'flex', gap: 18 }}>
          <span>Status: <b>{status}</b></span>
          {status === 'done' && <span>Pages: <b>{pageCount}</b></span>}
          {status === 'done' && <span>Elapsed: <b>{elapsedMs}ms</b></span>}
          {status === 'error' && <span style={{ color: '#c33' }}>Error: {errorMsg}</span>}
        </div>
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          style={{
            flex: 1,
            border: 'none',
            padding: '14px',
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: 12,
            background: '#faf9f5',
            color: '#333',
            resize: 'none',
            outline: 'none',
          }}
          spellCheck={false}
          placeholder="Paste your markdown here, then click Paginate."
        />
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#e8e6e0' }}>
        <div ref={outputRef} />
      </div>
    </div>
  );
}
