import type { Layout } from '../../../types';

export interface DesignSystem {
  brand: string;
  category: 'ai' | 'devtool' | 'productivity' | 'fintech' | 'consumer' | 'automotive';
  aesthetic: string;
  colors: { primary: string; accent: string; bg: string; text: string };
  typography: { display: string; body: string };
  principles: string[];
  preferLayouts?: Layout[];
  avoidLayouts?: Layout[];
  promptGuide: string;
}
