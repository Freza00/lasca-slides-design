// ============================================================================
// Lasca AI Harness — Knowledge Base Query Engine
// ============================================================================
// 查询和加载设计系统知识。
// ============================================================================

import type { DesignSystem } from './types';

/**
 * 设计系统缓存（懒加载）
 */
const DESIGN_SYSTEM_CACHE: Record<string, DesignSystem> = {};

/**
 * 设计系统加载器（懒加载）
 */
const DESIGN_SYSTEM_LOADERS: Record<string, () => Promise<{ default: any }>> = {
  stripe: () => import('./design-systems/stripe.json'),
  linear: () => import('./design-systems/linear.json'),
  notion: () => import('./design-systems/notion.json'),
  vercel: () => import('./design-systems/vercel.json'),
  apple: () => import('./design-systems/apple.json'),
  ferrari: () => import('./design-systems/ferrari.json'),
  spotify: () => import('./design-systems/spotify.json'),
  airbnb: () => import('./design-systems/airbnb.json'),
  figma: () => import('./design-systems/figma.json'),
  raycast: () => import('./design-systems/raycast.json'),
};

/**
 * 查询设计系统
 */
export async function queryDesignSystem(id: string): Promise<DesignSystem | null> {
  // 检查缓存
  if (DESIGN_SYSTEM_CACHE[id]) {
    return DESIGN_SYSTEM_CACHE[id];
  }

  // 加载
  const loader = DESIGN_SYSTEM_LOADERS[id];
  if (!loader) {
    return null;
  }

  try {
    const module = await loader();
    const designSystem = module.default;
    DESIGN_SYSTEM_CACHE[id] = designSystem;
    return designSystem;
  } catch (error) {
    console.error(`Failed to load design system: ${id}`, error);
    return null;
  }
}

/**
 * 获取 promptGuide（用于注入到 AI prompt）
 */
export async function getPromptGuide(id: string): Promise<string> {
  const designSystem = await queryDesignSystem(id);
  return designSystem?.promptGuide || '';
}

/**
 * 列出所有可用的设计系统
 */
export function listDesignSystems(): string[] {
  return Object.keys(DESIGN_SYSTEM_LOADERS);
}
