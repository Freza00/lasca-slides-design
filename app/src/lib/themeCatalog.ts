// ============================================================================
// Theme catalog — single source of truth for the 11 Lasca style signatures
// ============================================================================
// Consumed by:
//   - components/create/StylePicker.tsx  (create flow entry)
//   - components/editor/Toolbar.tsx      (editor entry, Phase E)
//
// Why this file exists: the StylePicker (create flow) and the editor toolbar
// must show identical theme cards. Previously the 11 themes lived inside
// StylePicker.tsx and the editor had no equivalent UI at all. Centralising
// them here unblocks sharing across both surfaces and lets us attach the
// per-signature metadata (motif / philosophy / preview copy / dual-lane
// fonts) that downstream consumers expect.
// ============================================================================

import type { Theme } from './types';
import type { BrandColors } from './ai/harness/types';

export interface ThemeSignature {
  theme: Theme;
  /** Display name per locale. Brand themes keep their English brand name; base
   *  themes get evocative CN/EN pairs (岩壁 / Clay, 冰川 / Glacier, 洞穴 / Cavern). */
  name: { zh: string; en: string };
  /** One-line use-case description. */
  desc: { zh: string; en: string };
  /** Tier: 'base' = open to all; 'brand' = Premium gated. */
  tier: 'base' | 'brand';
  /** Palette for thumbnail rendering (matches themes.ts runtime colors). */
  colors: BrandColors;
  /** Motif id — routes to decoration renderer (Phase C). */
  motifId: string;
  /** 1-line tagline shown under the card title ("Editorial Warmth"). */
  philosophy: { zh: string; en: string };
  /** Short bilingual preview text — thumbnails render this so users see the
   *  font in the language they'll author in. */
  previewCopy: {
    zh: { title: string; subtitle: string; body: string };
    en: { title: string; subtitle: string; body: string };
  };
  /** Latin (Unicode Basic Latin + Latin Extended) headline + body stacks. */
  fontHeadlineLatin: string;
  fontBodyLatin: string;
  /** CJK (Han + Kana + Hangul) headline + body stacks. Browser cascade picks
   *  these automatically for characters outside the Latin stack. */
  fontHeadlineCjk: string;
  fontBodyCjk: string;
}

// ----------------------------------------------------------------------------
// Base themes (3) — available to all users
// ----------------------------------------------------------------------------

const BASE: ThemeSignature[] = [
  {
    theme: 'warm',
    name: { zh: '岩壁', en: 'Clay' },
    desc: {
      zh: '暖橙色系，适合汇报、复盘、内部分享',
      en: 'Warm orange tones, great for reviews, retrospectives, and internal sharing',
    },
    tier: 'base',
    colors: { primary: '#d97757', accent: '#8b6f4e', bg: '#faf9f5', text: '#141413' },
    motifId: 'paper-deckle',
    philosophy: { zh: '纸本暖意', en: 'Editorial Warmth' },
    previewCopy: {
      zh: {
        title: '春山深处',
        subtitle: '纸本与笔触',
        body: '温润的底纹从文字里长出来——那是久经时间打磨的自然之色。',
      },
      en: {
        title: 'Of Paper & Ink',
        subtitle: 'Warm Canvas',
        body: 'Warmth that emerges from material itself — a texture built through patience.',
      },
    },
    fontHeadlineLatin: "'Fraunces', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'cool',
    name: { zh: '冰川', en: 'Glacier' },
    desc: {
      zh: '冷蓝色系，适合正式场合、客户展示',
      en: 'Cool blue tones, ideal for formal occasions and client presentations',
    },
    tier: 'base',
    colors: { primary: '#0f3d7a', accent: '#c2410c', bg: '#f8f9fc', text: '#1a2332' },
    motifId: 'hairline-frame',
    philosophy: { zh: '静序', en: 'Quiet Order' },
    previewCopy: {
      zh: {
        title: '北纬六十度',
        subtitle: '深蓝与银白',
        body: '每一条细线都自有节制——冷静并不意味冷漠。',
      },
      en: {
        title: 'North Latitude',
        subtitle: 'Navy & Ice',
        body: 'Each hairline holds its own restraint — composure is not coldness.',
      },
    },
    fontHeadlineLatin: "'Instrument Serif', serif",
    fontBodyLatin: "'Familjen Grotesk', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'dark',
    name: { zh: '洞穴', en: 'Cavern' },
    desc: {
      zh: '深色底 + 暖光，适合科技、发布会',
      en: 'Dark background + warm glow, perfect for tech and launch events',
    },
    tier: 'base',
    colors: { primary: '#e89968', accent: '#a89372', bg: '#0a0b0e', text: '#e8e0d0' },
    motifId: 'constellation',
    philosophy: { zh: '夜色静观', en: 'Nocturnal Gaze' },
    previewCopy: {
      zh: {
        title: '灯下夜读',
        subtitle: '幽光与深色',
        body: '让光明成为稀缺品——在黑暗中每个字都被郑重看见。',
      },
      en: {
        title: 'By Lamp & Onyx',
        subtitle: 'Ember & Night',
        body: 'When light becomes scarce, every word is seen in earnest.',
      },
    },
    fontHeadlineLatin: "'Fraunces', serif",
    fontBodyLatin: "'Fraunces', serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Serif SC', 'Songti SC', serif",
  },
];

// ----------------------------------------------------------------------------
// Brand themes (8) — Premium
// ----------------------------------------------------------------------------

const BRAND: ThemeSignature[] = [
  {
    theme: 'stripe',
    name: { zh: '冰锋', en: 'Voltage' },
    desc: {
      zh: '紫蓝电流，适合科技、金融、数据产品',
      en: 'Violet & blue current — built for fintech, data, SaaS decks',
    },
    tier: 'brand',
    colors: { primary: '#533afd', accent: '#00d4ff', bg: '#ffffff', text: '#061b31' },
    motifId: 'neon-underline',
    philosophy: { zh: '科技冷光', en: 'Crystalline Code' },
    previewCopy: {
      zh: {
        title: '金融即软件',
        subtitle: '紫蓝与白',
        body: '精密之美从不只是视觉——它是逻辑与速度的合谋。',
      },
      en: {
        title: 'Finance as Software',
        subtitle: 'Violet & Ice',
        body: "Precision beauty isn't visual alone — it's logic conspiring with speed.",
      },
    },
    fontHeadlineLatin: "'Bricolage Grotesque', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'linear',
    name: { zh: '黑曜', en: 'Obsidian' },
    desc: {
      zh: '黑玻璃与紫调，适合工程、工具、产品更新',
      en: 'Black glass & iris — for engineering, tooling, product updates',
    },
    tier: 'brand',
    colors: { primary: '#5e6ad2', accent: '#26b5ce', bg: '#08090a', text: '#f7f8f8' },
    motifId: 'grid-dot-matrix',
    philosophy: { zh: '工业精度', en: 'Industrial Precision' },
    previewCopy: {
      zh: {
        title: '从每一帧看',
        subtitle: '像素级工艺',
        body: '网格之下藏着所有对齐的欲望——这是工匠对秩序的承诺。',
      },
      en: {
        title: 'Frame by Frame',
        subtitle: 'Pixel Craft',
        body: "Under the grid lives every desire to align — a craftsman's vow to order.",
      },
    },
    fontHeadlineLatin: "'Plus Jakarta Sans', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'notion',
    name: { zh: '和紙', en: 'Vellum' },
    desc: {
      zh: '奶白纸与墨，适合笔记、学习、产品文档',
      en: 'Cream paper & ink — for notes, learning, product docs',
    },
    tier: 'brand',
    colors: { primary: '#0075de', accent: '#eb5757', bg: '#faf8f4', text: '#37352f' },
    motifId: 'left-rule',
    philosophy: { zh: '书房安静', en: 'Studious Calm' },
    previewCopy: {
      zh: {
        title: '桌面第二大脑',
        subtitle: '奶白与墨',
        body: '像老笔记本的纸——左边竖线是章节，右边文字是思考。',
      },
      en: {
        title: 'Second Brain',
        subtitle: 'Cream & Ink',
        body: 'Like the page of an old notebook — left rule marks section, right holds thought.',
      },
    },
    fontHeadlineLatin: "'Lora', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'vercel',
    name: { zh: '碑文', en: 'Monolith' },
    desc: {
      zh: '极黑与裁切标，适合声明性内容、发布',
      en: 'Monochrome + crop marks — for manifestos, product reveals',
    },
    tier: 'brand',
    colors: { primary: '#000000', accent: '#0070f3', bg: '#000000', text: '#ffffff' },
    motifId: 'crop-marks',
    philosophy: { zh: '极黑之美', en: 'Pitch Monochrome' },
    previewCopy: {
      zh: {
        title: '纯黑的声明',
        subtitle: '四角裁切标',
        body: '四角裁切标不是装饰——那是印刷留下的证据。',
      },
      en: {
        title: 'A Black Manifesto',
        subtitle: 'Crop Marks',
        body: "The crop marks aren't decoration — they're the residue of print itself.",
      },
    },
    fontHeadlineLatin: "'Plus Jakarta Sans', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'apple',
    name: { zh: '月白', en: 'Stillness' },
    desc: {
      zh: '极简留白，适合品牌、叙事、主题演讲',
      en: 'Pristine whitespace — for brand, narrative, keynote',
    },
    tier: 'brand',
    colors: { primary: '#06c', accent: '#ff3b30', bg: '#f5f5f7', text: '#1d1d1f' },
    motifId: 'void',
    philosophy: { zh: '无即是有', en: 'The Void Speaks' },
    previewCopy: {
      zh: {
        title: '一行就是一切',
        subtitle: '白与黑',
        body: '字号之差即全部权重——其余皆留白。',
      },
      en: {
        title: 'One Line, All',
        subtitle: 'Weight by Scale',
        body: 'Size contrast is the only hierarchy — everything else is breath.',
      },
    },
    fontHeadlineLatin: "'Plus Jakarta Sans', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'spotify',
    name: { zh: '极光', en: 'Aurora' },
    desc: {
      zh: '霓虹绿与夜色，适合文化、娱乐、产品故事',
      en: 'Neon green & night — for culture, entertainment, product stories',
    },
    tier: 'brand',
    colors: { primary: '#1ed760', accent: '#1db954', bg: '#121212', text: '#ffffff' },
    motifId: 'waveform',
    philosophy: { zh: '音律流动', en: 'Sonic Flow' },
    previewCopy: {
      zh: {
        title: '听觉的形状',
        subtitle: '绿与黑',
        body: '波形从底部生长——那是声音留给眼睛的轨迹。',
      },
      en: {
        title: 'Shape of Sound',
        subtitle: 'Neon & Night',
        body: 'The waveform grows from below — the trace sound leaves for the eye.',
      },
    },
    fontHeadlineLatin: "'Bricolage Grotesque', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'airbnb',
    name: { zh: '窑变', en: 'Ember' },
    desc: {
      zh: '珊瑚与米白，适合生活方式、体验、社区',
      en: 'Coral & cream — for lifestyle, hospitality, community',
    },
    tier: 'brand',
    colors: { primary: '#ff385c', accent: '#00a699', bg: '#ffffff', text: '#222222' },
    motifId: 'rubber-stamp',
    philosophy: { zh: '旅人印记', en: "Traveler's Mark" },
    previewCopy: {
      zh: {
        title: '在别处的家',
        subtitle: '珊瑚与白',
        body: '圆角像火漆印——每一次停留都留下一个柔软的戳记。',
      },
      en: {
        title: 'Home Elsewhere',
        subtitle: 'Coral & Calm',
        body: 'Round corners like a soft wax seal — every stay leaves its gentle stamp.',
      },
    },
    fontHeadlineLatin: "'Bricolage Grotesque', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'ferrari',
    name: { zh: '墨金', en: 'Goldleaf' },
    desc: {
      zh: '墨红与金，适合奢华、高端、仪式感',
      en: 'Ink red & gold — for luxury, premium, ceremonial',
    },
    tier: 'brand',
    colors: { primary: '#dc0000', accent: '#ffd700', bg: '#0a0a0a', text: '#f5f5dc' },
    motifId: 'racing-chevron',
    philosophy: { zh: '竞速之魂', en: 'Grand Prix Grit' },
    previewCopy: {
      zh: {
        title: '红与金',
        subtitle: '速度的重量',
        body: '斜纹不是速度——那是紧张本身的结晶。',
      },
      en: {
        title: 'Of Red & Gold',
        subtitle: 'Weight of Speed',
        body: "Chevrons aren't speed itself — they're tension crystallized into stripe.",
      },
    },
    fontHeadlineLatin: "'Fraunces', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
];

// ----------------------------------------------------------------------------
// Scene × Colorway themes (v2)
// ----------------------------------------------------------------------------

// Each Analyst colorway anchors to a specific institution's brand identity —
// user picks by "I want that firm's look" not by abstract color preference.
const ANALYST: ThemeSignature[] = [
  {
    theme: 'analyst-light',
    name: { zh: '分析·白', en: 'Analyst Light' },
    desc: { zh: '深海军蓝 + 钢蓝高光，适合投行 pitch book、并购推介', en: 'Deep navy + steel-blue accent — built for pitch books and M&A decks' },
    tier: 'brand',
    colors: { primary: '#00355F', accent: '#6B96C3', bg: '#ffffff', text: '#231F20' },
    motifId: 'precision-rule',
    philosophy: { zh: '顶级机构感', en: 'Institutional Authority' },
    previewCopy: {
      zh: { title: 'Project Athena', subtitle: '并购推介材料', body: 'Source: 公司披露数据 · Lasca 分析团队' },
      en: { title: 'Project Athena', subtitle: 'M&A Pitch Book', body: 'Source: Company filings · Lasca analysis team' },
    },
    fontHeadlineLatin: "'Fraunces', serif",
    fontBodyLatin: "'Inter', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'analyst-mist',
    name: { zh: '分析·雾', en: 'Analyst Mist' },
    desc: { zh: '深蓝雾灰 + 电光高光，适合战略咨询 deck、行业研究', en: 'Deep blue & mist + electric highlight — strategy consulting and industry research' },
    tier: 'brand',
    colors: { primary: '#051C2C', accent: '#2251FF', bg: '#f0f2f6', text: '#051C2C' },
    motifId: 'precision-rule',
    philosophy: { zh: '战略思考颗粒度', en: 'Strategic Rigor' },
    previewCopy: {
      zh: { title: 'Investment Memo', subtitle: 'Target: Project Helios', body: 'Confidential · 2026Q2 · Source: 管理层访谈 + 行业数据库' },
      en: { title: 'Investment Memo', subtitle: 'Target: Project Helios', body: 'Confidential · 2026 Q2 · Source: Management interviews + industry DB' },
    },
    fontHeadlineLatin: "'Source Serif 4', serif",
    fontBodyLatin: "'IBM Plex Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'analyst-dark',
    name: { zh: '分析·夜', en: 'Analyst Dark' },
    desc: { zh: '纯黑底 + 温暖 cream 字，适合 PE 路演、董事会演示', en: 'Pure black + warm cream — for PE pitches and boardroom decks' },
    tier: 'brand',
    colors: { primary: '#e8e0d0', accent: '#a89372', bg: '#0a0a0a', text: '#e8e0d0' },
    motifId: 'precision-rule',
    philosophy: { zh: '克制与重量', en: 'Restraint & Gravitas' },
    previewCopy: {
      zh: { title: 'Board Presentation', subtitle: '2026 Strategic Review', body: 'Confidential · For Board of Directors Only' },
      en: { title: 'Board Presentation', subtitle: '2026 Strategic Review', body: 'Confidential · For Board of Directors Only' },
    },
    fontHeadlineLatin: "'Cormorant Garamond', serif",
    fontBodyLatin: "'Work Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
];

// ----------------------------------------------------------------------------
// Analysis Report (3 colorways, report-only) — built from bilingual-report
// skill. Paper #faf9f5, ink #141413, Lora + Plus Jakarta + Noto Serif SC.
// Rules ONLY at top/bottom hairlines + table grids. No left rule, no nibbles,
// no corner marks — personality is expressed through primary color alone.
// ----------------------------------------------------------------------------

const ANALYSIS_REPORT: ThemeSignature[] = [
  {
    theme: 'analysis-paper',
    name: { zh: '分析·暖纸', en: 'Analysis · Paper' },
    desc: {
      zh: '暖橙 + 奶纸，机构分析报告默认配色',
      en: 'Warm orange on paper — default for institutional analysis reports',
    },
    tier: 'base',
    colors: { primary: '#d97757', accent: '#8b6f4e', bg: '#fcfbf8', text: '#141413' },
    motifId: 'analysis-editorial',
    philosophy: { zh: '纸本研究', en: 'Editorial Research' },
    previewCopy: {
      zh: {
        title: '2026年3月全美住宅市场分析',
        subtitle: '机构研究 · 报告 No. 24',
        body: '数据截止 2026-03-31。价格中位数同比上升 4.8%，库存周转放缓。',
      },
      en: {
        title: 'U.S. Housing Market · March 2026',
        subtitle: 'Institutional Research · Report No. 24',
        body: 'Data through 2026-03-31. Median price up 4.8% YoY; inventory turnover slowing.',
      },
    },
    fontHeadlineLatin: "'Lora', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'analysis-memo',
    name: { zh: '分析·墨蓝', en: 'Analysis · Memo' },
    desc: {
      zh: '深海军蓝 + 冷雾灰纸，适合政策备忘、监管摘要、研究快报',
      en: 'Deep navy on cool mist — policy memos, regulatory briefs, research notes',
    },
    tier: 'base',
    colors: { primary: '#243957', accent: '#6a89b4', bg: '#fafbfe', text: '#141413' },
    motifId: 'analysis-memo',
    philosophy: { zh: '备忘之重', en: 'Memo Weight' },
    previewCopy: {
      zh: {
        title: '利率路径与地产市场',
        subtitle: '政策备忘 · Memo 2026-Q1',
        body: '核心结论：降息预期延后至 Q3，利率敏感板块承压。',
      },
      en: {
        title: 'Rate Path & Housing Market',
        subtitle: 'Policy Memo · 2026 Q1',
        body: 'Key takeaway: cuts pushed to Q3; rate-sensitive sectors under pressure.',
      },
    },
    fontHeadlineLatin: "'Source Serif 4', serif",
    fontBodyLatin: "'IBM Plex Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'analysis-field',
    name: { zh: '分析·朱砂', en: 'Analysis · Noir' },
    desc: {
      zh: '黑白为主 + 樱桃红点缀，适合奢华品牌、深度特稿、年度述评',
      en: 'B&W with cherry-red accent — luxury briefs, longform features, annual reviews',
    },
    tier: 'base',
    colors: { primary: '#a3251f', accent: '#6b1a15', bg: '#fcfcfa', text: '#141413' },
    motifId: 'analysis-noir',
    philosophy: { zh: '朱砂奢章', en: 'Noir Quarterly' },
    previewCopy: {
      zh: {
        title: '高净值消费十年回望',
        subtitle: '奢华叙事 · 2026 春',
        body: '稀缺、节制与时间——构成下一阶段奢华消费的三重叙事。',
      },
      en: {
        title: 'A Decade of Quiet Luxury',
        subtitle: 'Editorial · Spring 2026',
        body: 'Scarcity, restraint, time — the triad shaping the next arc of luxury.',
      },
    },
    fontHeadlineLatin: "'Cormorant Garamond', serif",
    fontBodyLatin: "'Libre Caslon Text', serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Serif SC', 'Songti SC', serif",
  },
];

// ----------------------------------------------------------------------------
// Lookbook (slide-only) — Phase B start: ember. Forest / ink land in Phase C.
// ----------------------------------------------------------------------------

const LOOKBOOK: ThemeSignature[] = [
  {
    theme: 'lookbook-ember',
    name: { zh: '图册·焦糖', en: 'Lookbook · Ember' },
    desc: {
      zh: '奶纸 + 焦糖 + 墨黑——项目简报、产品集、公司画册的硬态版式',
      en: 'Cream + coral + ink — for project briefs, product books, and company portfolios',
    },
    tier: 'base',
    colors: { primary: '#d97757', accent: '#141413', bg: '#faf9f5', text: '#141413' },
    motifId: 'lookbook-chrome',
    philosophy: { zh: '硬态画册', en: 'Hard-edged Lookbook' },
    previewCopy: {
      zh: {
        title: '春季项目集 · 2026',
        subtitle: '01 · 城市更新',
        body: '十二个改造案例、三类干预策略、一段我们对城市纤维的回望。',
      },
      en: {
        title: 'Spring Lookbook · 2026',
        subtitle: '01 · Urban Renewal',
        body: 'Twelve case studies, three interventions, one perspective on city fabric.',
      },
    },
    fontHeadlineLatin: "'Poppins', sans-serif",
    fontBodyLatin: "'Poppins', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'lookbook-forest',
    name: { zh: '图册·森林', en: 'Lookbook · Forest' },
    desc: {
      zh: '森林绿 + 薄荷点缀——可持续品牌、ESG 报告、自然项目集',
      en: 'Forest green with mint accent — sustainability brands, ESG reports, nature briefs',
    },
    tier: 'base',
    colors: { primary: '#2c5f2d', accent: '#97bc62', bg: '#f5f5f0', text: '#141413' },
    motifId: 'lookbook-chrome',
    philosophy: { zh: '林间画册', en: 'Forest Folio' },
    previewCopy: {
      zh: {
        title: '生境观察 · 2026',
        subtitle: '02 · 森林修复',
        body: '九处试点、三类修复路径、一份关于林线变化的长期记录。',
      },
      en: {
        title: 'Habitat Observatory · 2026',
        subtitle: '02 · Forest Restoration',
        body: 'Nine pilot sites, three restoration paths, one long-term record of treeline shifts.',
      },
    },
    fontHeadlineLatin: "'Bricolage Grotesque', sans-serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'lookbook-ink',
    name: { zh: '图册·墨章', en: 'Lookbook · Ink' },
    desc: {
      zh: '黑白墨章 + 焦糖标点——单色专著、设计回顾、年度精选',
      en: 'Ink-on-paper with coral punctuation — monographs, design reviews, annual digests',
    },
    tier: 'base',
    colors: { primary: '#141413', accent: '#d97757', bg: '#ffffff', text: '#141413' },
    motifId: 'lookbook-chrome',
    philosophy: { zh: '墨章独白', en: 'Ink Monograph' },
    previewCopy: {
      zh: {
        title: '十年作品集',
        subtitle: '03 · 字体设计',
        body: '黑底白字、衬线疏朗、留白如纸——十年里我们只留下不会被时间冲淡的章节。',
      },
      en: {
        title: 'A Decade of Work',
        subtitle: '03 · Type Design',
        body: 'Ink, paper, generous space — ten years of chapters we kept because they outlast trends.',
      },
    },
    fontHeadlineLatin: "'Fraunces', serif",
    fontBodyLatin: "'Inter', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
];

// ----------------------------------------------------------------------------
// Private-banking (slide-only, Phase C) — sovereign / noir / clay
// ----------------------------------------------------------------------------

const PRIVATE_BANKING: ThemeSignature[] = [
  {
    theme: 'private-banking-sovereign',
    name: { zh: '私银·主权', en: 'Private Banking · Sovereign' },
    desc: {
      zh: '深海军蓝 + 黄金，机构级客户提案的主流配色',
      en: 'Deep navy with gold — the institutional default for client deliverables',
    },
    tier: 'base',
    colors: { primary: '#1a3360', accent: '#b08a4f', bg: '#f8f6f1', text: '#141413' },
    motifId: 'private-banking-hairline',
    philosophy: { zh: '主权之礼', en: 'Sovereign Counsel' },
    previewCopy: {
      zh: {
        title: '资产配置方案 · 2026 春',
        subtitle: 'ASSET 1 · DEBT',
        body: '为陈先生家族构建跨周期的固定收益骨架，平衡到期分布与币种敞口。',
      },
      en: {
        title: 'Asset Allocation · Spring 2026',
        subtitle: 'ASSET 1 · DEBT',
        body: 'A fixed-income spine for the Chen family, balancing maturities and currency exposure.',
      },
    },
    fontHeadlineLatin: "'Cormorant Garamond', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'private-banking-noir',
    name: { zh: '私银·玄章', en: 'Private Banking · Noir' },
    desc: {
      zh: '玄黑 + 香槟金，单色主导的庄重提案配色',
      en: 'Charcoal with champagne — monochromatic gravitas for restrained presentations',
    },
    tier: 'base',
    colors: { primary: '#0b0b0c', accent: '#c9a35f', bg: '#f5f2ea', text: '#0b0b0c' },
    motifId: 'private-banking-hairline',
    philosophy: { zh: '玄章之静', en: 'Quiet Authority' },
    previewCopy: {
      zh: {
        title: '家族办公室年度回顾',
        subtitle: 'ASSET 2 · EQUITY',
        body: '权益类配置回报符合预期；建议将再平衡频率从季度调整为半年。',
      },
      en: {
        title: 'Family Office · Annual Review',
        subtitle: 'ASSET 2 · EQUITY',
        body: 'Equity sleeve returns in line with expectations; rebalance from quarterly to semi-annual.',
      },
    },
    fontHeadlineLatin: "'Cormorant Garamond', serif",
    fontBodyLatin: "'Work Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
  {
    theme: 'private-banking-clay',
    name: { zh: '私银·土陶', en: 'Private Banking · Clay' },
    desc: {
      zh: '酒红 + 黄铜，温暖陶土底色的家族传承感',
      en: 'Burgundy with brass on warm clay — heirloom-quality estate planning',
    },
    tier: 'base',
    colors: { primary: '#6d2e46', accent: '#a88856', bg: '#ece2d0', text: '#141413' },
    motifId: 'private-banking-hairline',
    philosophy: { zh: '陶土温存', en: 'Heirloom Counsel' },
    previewCopy: {
      zh: {
        title: '家族传承架构方案',
        subtitle: 'ASSET 3 · TRUST',
        body: '通过两层信托结构降低跨境税务摩擦，明确两代人之间的治理边界。',
      },
      en: {
        title: 'Family Succession · Trust Plan',
        subtitle: 'ASSET 3 · TRUST',
        body: 'Two-tier trust structure reducing cross-border friction and clarifying generational governance.',
      },
    },
    fontHeadlineLatin: "'Instrument Serif', serif",
    fontBodyLatin: "'Plus Jakarta Sans', sans-serif",
    fontHeadlineCjk: "'Noto Serif SC', 'Songti SC', serif",
    fontBodyCjk: "'Noto Sans SC', 'PingFang SC', sans-serif",
  },
];

// ----------------------------------------------------------------------------
// Scene groups — consumed by StylePicker + Toolbar for grouped display
// ----------------------------------------------------------------------------

export interface SceneGroup {
  id: string;
  label: { zh: string; en: string };
  desc?: { zh: string; en: string };
  themes: ThemeSignature[];
  /** When `surface: 'report'`, the group only shows up on report decks.
   *  When `surface: 'slide'`, only on slide decks. Omit (default) = show on both. */
  surface?: 'report' | 'slide';
}

export const SCENE_GROUPS: SceneGroup[] = [
  {
    id: 'analysis-report',
    label: { zh: '分析报告', en: 'Analysis Report' },
    desc: {
      zh: '机构分析报告三款配色，继承 bilingual-report skill：只在页眉页脚留细线，不做装饰性横竖线',
      en: 'Three institutional analysis-report colorways rooted in the bilingual-report skill: hairlines only at header/footer, no decorative rules',
    },
    themes: ANALYSIS_REPORT,
    surface: 'report',
  },
  {
    id: 'analyst',
    label: { zh: '分析师', en: 'Analyst' },
    desc: {
      zh: '为机构路演、投研报告、董事会演示打造的高严肃配色',
      en: 'High-rigor palettes built for pitch decks, investment memos, and boardroom presentations',
    },
    themes: ANALYST,
    surface: 'slide',
  },
  {
    id: 'lookbook',
    label: { zh: '图册', en: 'Lookbook' },
    desc: {
      zh: '硬态版式 + 编号叙事——项目简报、产品集、公司画册',
      en: 'Hard-edged layouts with numbered narratives — project briefs, product books, company portfolios',
    },
    themes: LOOKBOOK,
    surface: 'slide',
  },
  {
    id: 'private-banking',
    label: { zh: '私银', en: 'Private Banking' },
    desc: {
      zh: '面向高净值客户的资产方案 / 家族办公室年度回顾——克制、机构感',
      en: 'Wealth-advisory deliverables: asset proposals, family-office reviews — restrained, institutional',
    },
    themes: PRIVATE_BANKING,
    surface: 'slide',
  },
  // Storyteller / Keynote / Scholar groups land in later phases
];

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

export const BASE_THEMES: ThemeSignature[] = BASE;
export const BRAND_THEMES: ThemeSignature[] = BRAND;
export const SCENE_THEMES: ThemeSignature[] = SCENE_GROUPS.flatMap(g => g.themes);
export const ALL_THEMES: ThemeSignature[] = [...BASE, ...BRAND, ...SCENE_THEMES];

/** Look up a signature by theme id. Returns undefined for unknown themes
 *  (e.g. 'original' which is the faithful-import passthrough). */
export function getSignature(theme: Theme): ThemeSignature | undefined {
  return ALL_THEMES.find(s => s.theme === theme);
}
