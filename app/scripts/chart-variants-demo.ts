/**
 * Renders every chart-embedding layout variant into a single static HTML file
 * so maintainers can visually confirm that "chart is not a layout" is actually
 * wired up — each variant places a chart inside a text-first composition.
 *
 * Run:   npx tsx scripts/chart-variants-demo.ts
 * Open:  app/scripts/chart-variants-demo.html (open in a real browser)
 */
import { writeFileSync } from 'node:fs';
import { renderSlide } from '../src/lib/renderSlide';
import type { Slide } from '../src/lib/types';

const W = 960;
const H = 540;

const barData = {
  title: '各区域 2024 年销售额',
  items: [
    { label: '华东', value: 82 },
    { label: '华南', value: 64 },
    { label: '华北', value: 48 },
    { label: '西南', value: 31 },
    { label: '东北', value: 19 },
  ],
};

const lineData = {
  title: '过去 12 个月活跃用户',
  labels: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
  series: [
    { name: '活跃', values: [12, 15, 18, 21, 23, 26, 28, 32, 35, 41, 48, 56] },
  ],
  area: true,
};

const pieData = {
  title: '收入结构',
  items: [
    { label: '订阅', value: 58 },
    { label: '企业', value: 24 },
    { label: '咨询', value: 12 },
    { label: '其它', value: 6 },
  ],
};

const scatterData = {
  title: '价格 vs 销量',
  xLabel: '价格（元）',
  yLabel: '月销量',
  points: [
    { x: 100, y: 820 }, { x: 120, y: 740 }, { x: 150, y: 690 },
    { x: 180, y: 610 }, { x: 220, y: 540 }, { x: 260, y: 470 },
    { x: 300, y: 410 }, { x: 350, y: 330 }, { x: 420, y: 260 },
    { x: 500, y: 180 },
  ],
  trendline: true,
};

const variants: Array<{ caption: string; slide: Slide }> = [
  {
    caption: '1. split-image · imagePosition=bottom（上文下图 / analyst 默认）',
    slide: {
      layout: 'split-image',
      data: {
        title: '华东持续领跑，占集团营收的 38%',
        body: '上半年华东区同比 +22%，西南与东北继续承压。\n预计下半年区域差距进一步拉大。',
        imagePosition: 'bottom',
        chart: { type: 'bar-chart', data: barData },
      },
    },
  },
  {
    caption: '2. split-image · imagePosition=top（上图下文）',
    slide: {

      layout: 'split-image',
      data: {
        title: '活跃用户年内翻 4.6 倍',
        body: '10 月后增长陡增，主要由付费推荐渠道拉动；\n用户留存率同步提升至 62%。',
        imagePosition: 'top',
        chart: { type: 'line-chart', data: lineData },
      },
    },
  },
  {
    caption: '3. split-image · imagePosition=right（左文右图）',
    slide: {

      layout: 'split-image',
      data: {
        title: '订阅业务接近六成收入',
        body: '订阅 + 企业合计占 82%，抗周期性好。\n咨询是增速最快的第三曲线。',
        imagePosition: 'right',
        chart: { type: 'pie-chart', data: pieData },
      },
    },
  },
  {
    caption: '4. split-image · imagePosition=left（左图右文）',
    slide: {

      layout: 'split-image',
      data: {
        title: '价格敏感度高于预期',
        body: '价格每上浮 100 元，月销量平均下滑 ~16%。\n建议在 180–220 元区间找到甜区。',
        imagePosition: 'left',
        chart: { type: 'scatter-chart', data: scatterData },
      },
    },
  },
  {
    caption: '5. two-column · chartPosition=right（显式左文右图分栏）',
    slide: {

      layout: 'two-column',
      data: {
        title: '核心问题：为什么华北掉队？',
        left: {
          heading: '三点归因',
          content: '1. 经销商网络覆盖不足\n2. 线上投放预算削减 35%\n3. 竞品新品集中华北首发',
        },
        right: { heading: '', content: '' },
        chart: { type: 'bar-chart', data: barData },
        chartPosition: 'right',
      },
    },
  },
  {
    caption: '6. featured-grid · hero 文 + 多 tile 图（一页多图对比）',
    slide: {

      layout: 'featured-grid',
      data: {
        title: '三个业务线的不同温度',
        subtitle: '同一段时间，不同速度',
        body: '订阅稳定扩张，企业承压，咨询从零起步。',
        columns: 3,
        tiles: [
          { title: '订阅', desc: '+18% YoY', chart: { type: 'line-chart', data: lineData } },
          { title: '企业', desc: '-4% YoY',  chart: { type: 'bar-chart', data: barData } },
          { title: '咨询', desc: '新开业务', chart: { type: 'pie-chart', data: pieData } },
        ],
      },
    },
  },
  {
    caption: '7. bento · 不对称拼块，其中一块是图（Apple 发布会风）',
    slide: {

      layout: 'bento',
      data: {
        title: '本季度要点',
        items: [
          { heading: '营收', body: '+22% YoY，创历史新高', highlight: true, chart: { type: 'line-chart', data: lineData } },
          { heading: '毛利率', body: '48.6%（+3.1pp）' },
          { heading: '新用户', body: '2.3 M（+61%）' },
          { heading: '留存', body: '62% D30，行业首位' },
        ],
      },
    },
  },
  {
    caption: '8. title-bento · 左大标题 + 右卡片网格，其中卡片带图',
    slide: {

      layout: 'title-bento',
      data: {
        label: 'Key dynamics',
        title: '华东是压舱石，\n西南是变量',
        footer: '数据来源：内部 CRM + Nielsen 2024Q4',
        cards: [
          { heading: '华东', body: '占比 38%，连续 6 季度正增长', chart: { type: 'bar-chart', data: barData } },
          { heading: '西南', body: '首次出现负增长，需要专项' },
          { heading: '华北', body: '持续掉队，原因待深挖' },
          { heading: '东北', body: '规模小，策略按市场收缩处理' },
        ],
      },
    },
  },
];

function pageFrame(caption: string, slideHtml: string): string {
  return `
  <section style="margin:32px auto; max-width:1040px;">
    <div style="font:500 14px/1.4 -apple-system,'SF Pro Text',sans-serif; color:#555; margin:0 0 10px 4px; letter-spacing:0.02em;">${caption}</div>
    <div style="width:${W}px; height:${H}px; box-shadow:0 2px 18px rgba(0,0,0,0.08); border-radius:10px; overflow:hidden; background:#fff;">
      ${slideHtml}
    </div>
  </section>`;
}

const body = variants
  .map(({ caption, slide }) => {
    const html = renderSlide(slide, 'warm', { w: W, h: H });
    return pageFrame(caption, html);
  })
  .join('\n');

const full = `<!doctype html>
<html lang="zh"><head>
<meta charset="utf-8">
<title>Lasca — chart embedding variants</title>
<style>
  body { margin:0; padding:40px 0 80px; background:#f0efeb; font-family:-apple-system,'SF Pro Text','PingFang SC',sans-serif; }
  h1 { max-width:1040px; margin:0 auto 8px; padding:0 16px; font:600 22px/1.3 -apple-system,sans-serif; color:#222; }
  .sub { max-width:1040px; margin:0 auto 20px; padding:0 16px; color:#666; font-size:14px; }
</style>
</head><body>
<h1>Chart 嵌入变体样张（8 种）</h1>
<p class="sub">每一页都不是整页图 — 图都被塞进了某个文字为主的布局里。验证"chart 不是 layout"已经跑通。</p>
${body}
</body></html>`;

const out = new URL('./chart-variants-demo.html', import.meta.url).pathname;
writeFileSync(out, full, 'utf8');
console.log('Wrote', out, `(${(full.length / 1024).toFixed(1)} kB)`);
