/**
 * Shared slide-type config and inference.
 *
 * 宪法 §2：PageType 仅 4 种（cover / section / content / back），表达"文档结构角色"。
 * 宪法 §3：Layout 表达"视觉排版"。两者正交。
 *
 * 本文件提供两层标签：
 *  - PageType 的结构标签（4 种，严格）——给 pageType 字段和 prompt 用
 *  - 细分语义标签（目录/数据/案例/总结/过渡/金句/内容等）——由 layout 推断，仅供 UI 展示
 *
 * Used by: MdContextCard (create flow), Sidebar (editor), GenerationPreview.
 */
import type { PageType } from '@/lib/ai/harness/types';
import type { Layout, Slide } from '@/lib/types';

// ---------------------------------------------------------------------------
// PageType 结构标签（宪法 §2 的 4 种）
// ---------------------------------------------------------------------------

export const PAGE_TYPE_CONFIG: Record<PageType, { label: { zh: string; en: string }; bg: string; color: string }> = {
  cover:   { label: { zh: '封面', en: 'Cover' },   bg: '#fdf0e9', color: '#d97757' },
  section: { label: { zh: '小节', en: 'Section' }, bg: '#eff6ff', color: '#2563eb' },
  content: { label: { zh: '内容', en: 'Content' }, bg: '#f5f4f0', color: '#6b6a65' },
  back:    { label: { zh: '尾页', en: 'End' },     bg: '#fdf0e9', color: '#d97757' },
};

export const ALL_PAGE_TYPES: PageType[] = ['cover', 'section', 'content', 'back'];

// ---------------------------------------------------------------------------
// Layout → PageType
// ---------------------------------------------------------------------------

const SECTION_LAYOUTS: ReadonlySet<string> = new Set(['agenda', 'section-break']);

const DATA_LAYOUTS: ReadonlySet<string> = new Set([
  'bar-chart', 'horizontal-bar-chart', 'line-chart', 'pie-chart',
  'stacked-bar-chart', 'scatter-chart', 'dual-axis-bar', 'heatmap',
  'big-number', 'stat-row', 'stacked-bars', 'dashboard',
]);

/**
 * 从 slide 的 layout 和位置推断结构 PageType。
 * 如果 slide 已有显式 pageType（create flow 或用户 override），优先使用。
 */
export function inferPageType(slide: Slide, index: number, total: number): PageType {
  if (slide.pageType && slide.pageType in PAGE_TYPE_CONFIG) return slide.pageType;

  const layout = slide.layout as Layout;

  if (layout === 'cover') {
    return index === 0 ? 'cover' : (index === total - 1 ? 'back' : 'content');
  }
  if (SECTION_LAYOUTS.has(layout)) return 'section';
  return 'content';
}

// ---------------------------------------------------------------------------
// 细分语义标签（仅供 UI 展示；由 layout 推断；不参与结构约束）
// ---------------------------------------------------------------------------

export type PageSubtype =
  | 'cover' | 'back' | 'toc' | 'section'
  | 'data' | 'quote' | 'content';

export const PAGE_SUBTYPE_CONFIG: Record<PageSubtype, { label: { zh: string; en: string }; bg: string; color: string }> = {
  cover:   { label: { zh: '封面', en: 'Cover' },   bg: '#fdf0e9', color: '#d97757' },
  back:    { label: { zh: '尾页', en: 'End' },     bg: '#fdf0e9', color: '#d97757' },
  toc:     { label: { zh: '目录', en: 'TOC' },     bg: '#ecfdf5', color: '#059669' },
  section: { label: { zh: '小节', en: 'Section' }, bg: '#eff6ff', color: '#2563eb' },
  data:    { label: { zh: '数据', en: 'Data' },    bg: '#f0f9ff', color: '#0369a1' },
  quote:   { label: { zh: '金句', en: 'Quote' },   bg: '#fefce8', color: '#a16207' },
  content: { label: { zh: '内容', en: 'Content' }, bg: '#f5f4f0', color: '#6b6a65' },
};

/**
 * UI 展示用的细分标签。由 layout + 位置 推断，不改变结构语义。
 * Sidebar / MdContextCards 等展示"目录""数据""金句"彩色标签时用这个。
 */
export function inferPageSubtype(slide: Slide, index: number, total: number): PageSubtype {
  const layout = slide.layout as Layout;

  if (layout === 'cover') {
    if (index === 0) return 'cover';
    if (index === total - 1) return 'back';
  }
  if (layout === 'agenda') return 'toc';
  if (layout === 'section-break') return 'section';
  if (DATA_LAYOUTS.has(layout)) return 'data';
  if (layout === 'quote') return 'quote';
  return 'content';
}

/** Convenience: 给 MdContextPage 用的简化版（只有 pageType + title，没有 layout 可用时的兜底） */
export function pageTypeLabel(pageType: PageType | undefined, locale: 'zh' | 'en'): string {
  const cfg = PAGE_TYPE_CONFIG[pageType ?? 'content'] ?? PAGE_TYPE_CONFIG.content;
  return cfg.label[locale];
}
