// ============================================================================
// Lasca — renderSlide(slide, theme)
// 输入一个 slide 对象 + theme 字符串，输出完整的 HTML 字符串
// ============================================================================

const THEMES = {
  warm: {
    primary:    '#d97757',
    accent:     '#6a9bcc',
    bg:         '#faf9f5',
    text:       '#141413',
    muted:      '#b0aea5',
    green:      '#788c5d',
    dark:       '#141413',
    border:     '#e8e6dc',
    cardBg:     '#ffffff',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cool: {
    primary:    '#4a8db7',
    accent:     '#d97757',
    bg:         '#f5f8fa',
    text:       '#1a2332',
    muted:      '#8a9bae',
    green:      '#5a9a6e',
    dark:       '#1a2332',
    border:     '#dce4ec',
    cardBg:     '#ffffff',
    cardShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  dark: {
    primary:    '#d97757',
    accent:     '#6a9bcc',
    bg:         '#1a1a1a',
    text:       '#f0efeb',
    muted:      '#777775',
    green:      '#788c5d',
    dark:       '#f0efeb',
    border:     '#333333',
    cardBg:     '#262626',
    cardShadow: '0 1px 4px rgba(0,0,0,0.3)',
  },
};

// 语义色 → 实际色值
function resolveBarColor(colorName, t) {
  return t[colorName] || t.primary;
}

// 序号在不同卡片间循环使用的颜色
function labelColor(index, t) {
  const cycle = [t.primary, t.accent, t.green, t.muted, t.dark];
  return cycle[index % cycle.length];
}

// 基础容器样式（所有 layout 共享）
function baseStyle(t) {
  return `font-family:'Poppins','Noto Sans SC',sans-serif; height:100%; background:${t.bg};`;
}

// 转义 HTML
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 将 \n 换行转成 <br>
function nl2br(str) {
  if (!str) return '';
  return esc(str).replace(/\n/g, '<br>');
}

// ============================================================================
// 8 种 Layout 渲染器
// ============================================================================

function renderCover(data, t) {
  return `
<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; ${baseStyle(t)}">
  <h1 style="font-size:52px; font-weight:700; color:${t.primary}; margin-bottom:16px; letter-spacing:-1px;">${esc(data.title)}</h1>
  ${data.subtitle ? `<p style="font-size:22px; color:${t.text}; margin-bottom:8px;">${esc(data.subtitle)}</p>` : ''}
  ${data.footnote ? `<p style="font-size:15px; color:${t.muted};">${esc(data.footnote)}</p>` : ''}
  <div style="width:200px; height:3px; background:${t.primary}; margin:28px 0 16px;"></div>
  ${data.author ? `<p style="font-size:13px; color:${t.muted};">${esc(data.author)}</p>` : ''}
</div>`;
}

function renderBigNumber(data, t) {
  return `
<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; ${baseStyle(t)}">
  <span style="font-size:140px; font-weight:700; color:${t.primary}; line-height:1;">${esc(data.number)}</span>
  <p style="font-size:28px; color:${t.text}; margin-top:16px;">${esc(data.text)}</p>
  <div style="width:120px; height:2px; background:${t.border}; margin:24px 0;"></div>
  ${data.footnote ? `<p style="font-size:14px; color:${t.muted};">${esc(data.footnote)}</p>` : ''}
  ${data.highlight ? `<p style="font-size:17px; color:${t.accent}; margin-top:20px; font-weight:500;">${esc(data.highlight)}</p>` : ''}
</div>`;
}

function renderThreeCards(data, t) {
  const cards = data.cards || [];
  const cardsHtml = cards.map((card, i) => `
    <div style="flex:1; background:${t.cardBg}; border-radius:12px; padding:28px 20px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:${t.cardShadow};">
      <span style="font-size:52px; font-weight:700; color:${labelColor(i, t)};">${esc(card.label)}</span>
      <p style="font-size:16px; color:${t.text}; text-align:center; margin-top:16px; font-weight:500;">${esc(card.title)}</p>
      ${card.desc ? `<p style="font-size:13px; color:${t.muted}; text-align:center; margin-top:6px;">${esc(card.desc)}</p>` : ''}
    </div>`).join('\n');

  return `
<div style="display:flex; flex-direction:column; ${baseStyle(t)} padding:36px 40px;">
  <h2 style="font-size:34px; font-weight:700; color:${t.primary}; margin-bottom:28px;">${esc(data.title)}</h2>
  <div style="display:flex; gap:20px; flex:1;">
    ${cardsHtml}
  </div>
</div>`;
}

function renderTwoColumn(data, t) {
  const left = data.left || {};
  const right = data.right || {};
  return `
<div style="display:flex; flex-direction:column; ${baseStyle(t)} padding:36px 40px;">
  <h2 style="font-size:30px; font-weight:700; color:${t.primary}; margin-bottom:24px;">${esc(data.title)}</h2>
  <div style="display:flex; gap:32px; flex:1;">
    <div style="flex:1;">
      ${left.heading ? `<p style="font-size:20px; font-weight:600; color:${t.muted}; margin-bottom:12px;">${esc(left.heading)}</p>` : ''}
      ${left.content ? `<p style="font-size:17px; color:${t.text}; line-height:1.8;">${nl2br(left.content)}</p>` : ''}
      ${left.sub ? `<p style="font-size:14px; color:${t.muted}; margin-top:12px; line-height:1.8;">${nl2br(left.sub)}</p>` : ''}
    </div>
    <div style="width:1px; background:${t.border};"></div>
    <div style="flex:1;">
      ${right.heading ? `<p style="font-size:20px; font-weight:600; color:${t.primary}; margin-bottom:12px;">${esc(right.heading)}</p>` : ''}
      ${right.content ? `<p style="font-size:17px; color:${t.text}; line-height:1.8;">${nl2br(right.content)}</p>` : ''}
      ${right.sub ? `<p style="font-size:14px; color:${t.muted}; margin-top:12px; line-height:1.8;">${nl2br(right.sub)}</p>` : ''}
    </div>
  </div>
  ${data.footer ? `<p style="font-size:15px; font-weight:500; text-align:center; color:${t.accent}; margin-top:16px;">${esc(data.footer)}</p>` : ''}
</div>`;
}

function renderStackedBars(data, t) {
  const bars = data.bars || [];
  const barsHtml = bars.map(bar => {
    const bg = resolveBarColor(bar.color, t);
    return `<div style="background:${bg}; color:#fff; padding:14px 24px; border-radius:8px; font-size:16px; text-align:center;">${esc(bar.text)}</div>`;
  }).join('\n');

  return `
<div style="display:flex; flex-direction:column; ${baseStyle(t)} padding:32px 40px;">
  <h2 style="font-size:30px; font-weight:700; color:${t.primary}; margin-bottom:20px;">${esc(data.title)}</h2>
  <div style="display:flex; flex-direction:column; gap:8px; flex:1; justify-content:center;">
    ${barsHtml}
  </div>
</div>`;
}

function renderGridCards(data, t) {
  const cols = data.columns || 3;
  const cards = data.cards || [];
  const cardsHtml = cards.map((card, i) => `
    <div style="background:${t.cardBg}; border-radius:10px; padding:20px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:${t.cardShadow};">
      <span style="font-size:32px; font-weight:700; color:${labelColor(i, t)};">${esc(card.label)}</span>
      <p style="font-size:15px; color:${t.text}; margin-top:8px; font-weight:500;">${esc(card.title)}</p>
      ${card.desc ? `<p style="font-size:13px; color:${t.muted}; text-align:center; margin-top:4px;">${esc(card.desc)}</p>` : ''}
    </div>`).join('\n');

  return `
<div style="display:flex; flex-direction:column; ${baseStyle(t)} padding:32px 40px;">
  <h2 style="font-size:28px; font-weight:700; color:${t.primary}; margin-bottom:20px;">${esc(data.title)}</h2>
  <div style="display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:14px; flex:1;">
    ${cardsHtml}
  </div>
  ${data.footer ? `<p style="font-size:13px; text-align:center; color:${t.muted}; margin-top:12px;">${esc(data.footer)}</p>` : ''}
</div>`;
}

function renderQuote(data, t) {
  return `
<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; ${baseStyle(t)} padding:60px;">
  <span style="font-size:100px; color:${t.border}; font-weight:700; line-height:0.8; margin-bottom:8px;">"</span>
  <h2 style="font-size:34px; font-weight:700; color:${t.primary}; margin-bottom:16px;">${esc(data.quote)}</h2>
  ${data.body ? `<p style="font-size:20px; color:${t.text}; line-height:1.8; text-align:center;">${nl2br(data.body)}</p>` : ''}
  ${data.highlight ? `<p style="font-size:18px; font-weight:500; color:${t.accent}; margin-top:24px;">${esc(data.highlight)}</p>` : ''}
  <div style="width:200px; height:3px; background:${t.primary}; margin:32px 0 16px;"></div>
  ${data.author ? `<p style="font-size:13px; color:${t.muted};">${esc(data.author)}</p>` : ''}
</div>`;
}

function renderImage(data, t) {
  const overlayMap = {
    dark:  'rgba(0,0,0,0.45)',
    light: 'rgba(255,255,255,0.35)',
    none:  'transparent',
  };
  const overlay = overlayMap[data.overlay] || overlayMap.dark;
  const hasImage = !!data.image_url;
  const bgImage = hasImage
    ? `background-image:url('${data.image_url}'); background-size:cover; background-position:center;`
    : `background:${t.bg};`;
  const textColor = (data.overlay === 'light' || (!hasImage && t.bg === '#1a1a1a')) ? t.text : '#ffffff';
  const mutedColor = (data.overlay === 'light' || (!hasImage && t.bg === '#1a1a1a')) ? t.muted : 'rgba(255,255,255,0.7)';

  // 无图片时使用占位 + prompt 提示
  const placeholder = !hasImage ? `
    <div style="width:120px; height:120px; border:2px dashed ${t.muted}; border-radius:16px; display:flex; align-items:center; justify-content:center; margin-bottom:24px;">
      <span style="font-size:40px; color:${t.muted};">🖼</span>
    </div>
    ${data.image_prompt ? `<p style="font-size:13px; color:${t.muted}; margin-bottom:24px; font-style:italic;">${esc(data.image_prompt)}</p>` : ''}
  ` : '';

  return `
<div style="position:relative; ${baseStyle(t)} ${bgImage}">
  ${hasImage ? `<div style="position:absolute; inset:0; background:${overlay};"></div>` : ''}
  <div style="position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; padding:60px; text-align:center;">
    ${placeholder}
    ${data.title ? `<h2 style="font-size:40px; font-weight:700; color:${hasImage ? textColor : t.primary}; margin-bottom:12px;">${esc(data.title)}</h2>` : ''}
    ${data.subtitle ? `<p style="font-size:20px; color:${hasImage ? mutedColor : t.text};">${esc(data.subtitle)}</p>` : ''}
  </div>
</div>`;
}

// ============================================================================
// 主函数
// ============================================================================

const RENDERERS = {
  'cover':        renderCover,
  'big-number':   renderBigNumber,
  'three-cards':  renderThreeCards,
  'two-column':   renderTwoColumn,
  'stacked-bars': renderStackedBars,
  'grid-cards':   renderGridCards,
  'quote':        renderQuote,
  'image':        renderImage,
};

/**
 * 将一个 slide JSON 对象渲染为 HTML 字符串
 * @param {{ layout: string, data: object }} slide
 * @param {'warm' | 'cool' | 'dark'} theme
 * @returns {string} HTML
 */
export function renderSlide(slide, theme = 'warm') {
  const t = THEMES[theme] || THEMES.warm;
  const renderer = RENDERERS[slide.layout];
  if (!renderer) {
    return `<div style="${baseStyle(t)} display:flex; align-items:center; justify-content:center;">
      <p style="color:${t.muted};">Unknown layout: ${esc(slide.layout)}</p>
    </div>`;
  }
  return renderer(slide.data || {}, t);
}

/**
 * 渲染完整 deck 为 HTML 页面数组
 * @param {{ theme: string, slides: Array }} deck
 * @returns {string[]}
 */
export function renderDeck(deck) {
  const theme = deck.theme || 'warm';
  return (deck.slides || []).map(slide => renderSlide(slide, theme));
}

export { THEMES };
