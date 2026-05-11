// ============================================================================
// Lasca — Tutorial Deck for new users
// ============================================================================
// Bilingual (zh/en) onboarding deck using native Lasca layouts.
// Called by store.ts as the DEFAULT_DECK for first-time launches.
// ============================================================================

import type { Slide, Deck } from './types';
import type { Locale } from './i18n';

// ---------------------------------------------------------------------------
// Chinese slides
// ---------------------------------------------------------------------------

const ZH_SLIDES: Slide[] = [
  {
    layout: 'cover',
    data: {
      title: '欢迎使用 Lasca',
      subtitle: 'AI 演示文稿编辑器',
      footnote: '本地优先 · 零登录 · 数据在你手里',
    },
  },
  {
    layout: 'big-number',
    data: {
      number: '3',
      text: '种方式开始创作',
      footnote: '一键生成 · 导入优化 · 从零编辑',
      highlight: '告诉 AI 你想要什么，剩下的交给它',
    },
  },
  {
    layout: 'three-cards',
    data: {
      title: '开始创作',
      cards: [
        { label: '01', title: '一键生成', desc: '描述主题，AI 从零生成完整幻灯片' },
        { label: '02', title: '导入优化', desc: '上传 PPT 或 PDF，AI 逐页优化建议' },
        { label: '03', title: '直接编辑', desc: '在画布上拖拽、双击编辑、右键菜单' },
      ],
    },
  },
  {
    layout: 'two-column',
    data: {
      title: 'AI 聊天助手',
      left: {
        heading: '描述需求',
        content: '告诉 AI 你想修改什么，\n它会理解并执行。',
        sub: '支持中英文输入',
      },
      right: {
        heading: '智能识别',
        content: 'AI 会自动判断你要改哪页、\n改什么内容。',
        sub: '多页批量修改也支持',
      },
    },
  },
  {
    layout: 'quote',
    data: {
      quote: '开始创作',
      body: '点击左上角首页按钮，\n选择生成或导入，开始你的第一份幻灯片。',
      highlight: 'Cmd+Z 随时撤销，放心大胆尝试。',
    },
  },
];

// ---------------------------------------------------------------------------
// English slides
// ---------------------------------------------------------------------------

const EN_SLIDES: Slide[] = [
  {
    layout: 'cover',
    data: {
      title: 'Welcome to Lasca',
      subtitle: 'AI Slide Editor',
      footnote: 'Local-first · No login · Your data stays with you',
    },
  },
  {
    layout: 'big-number',
    data: {
      number: '3',
      text: 'ways to start creating',
      footnote: 'Generate · Import & optimize · Edit from scratch',
      highlight: 'Tell AI what you want, it handles the rest',
    },
  },
  {
    layout: 'three-cards',
    data: {
      title: 'Get Started',
      cards: [
        { label: '01', title: 'Generate', desc: 'Describe a topic, AI creates complete slides from scratch' },
        { label: '02', title: 'Import & Optimize', desc: 'Upload PPT or PDF, AI reviews and suggests improvements' },
        { label: '03', title: 'Direct Edit', desc: 'Drag on canvas, double-click to edit, right-click for menu' },
      ],
    },
  },
  {
    layout: 'two-column',
    data: {
      title: 'AI Chat Assistant',
      left: {
        heading: 'Describe what you want',
        content: 'Tell AI what to modify,\nit understands and executes.',
        sub: 'Works in English and Chinese',
      },
      right: {
        heading: 'Smart detection',
        content: 'AI auto-detects which page\nand what content to change.',
        sub: 'Batch editing across pages too',
      },
    },
  },
  {
    layout: 'quote',
    data: {
      quote: 'Start Creating',
      body: 'Click the Home button in the top-left corner,\nchoose Generate or Import to begin your first deck.',
      highlight: 'Cmd+Z to undo anytime — experiment freely.',
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createTutorialDeck(locale: Locale): Deck {
  return {
    id: 'deck-' + Date.now(),
    name: locale === 'en' ? 'Welcome to Lasca' : '欢迎使用 Lasca',
    theme: 'warm',
    slides: locale === 'en' ? EN_SLIDES : ZH_SLIDES,
  };
}
