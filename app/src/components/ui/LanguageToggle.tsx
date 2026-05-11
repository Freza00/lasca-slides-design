'use client';

import { useEditorStore } from '@/lib/store';
import { DEFAULT_LOCALE } from '@/lib/i18n/constants';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Global language toggle — renders a small pill at the bottom-right of every
 * page. Hidden in full-screen presenter mode unless hovered.
 */
export function LanguageToggle() {
  const locale = useEditorStore(s => s.locale ?? DEFAULT_LOCALE);
  const setLocale = useEditorStore(s => s.setLocale);
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);

  const isPresenter = pathname === '/present';

  return (
    <button
      onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        padding: '5px 2px',
        borderRadius: 999,
        border: '1px solid #e0ded6',
        background: hovered ? '#faf9f5' : 'rgba(250,249,245,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
        opacity: isPresenter ? (hovered ? 0.9 : 0.15) : (hovered ? 1 : 0.6),
        transition: 'all 0.2s ease-out',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
        transform: hovered ? 'scale(1.04)' : 'scale(1)',
      }}
      title={locale === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <span style={{
        padding: '2px 8px',
        borderRadius: 999,
        background: locale === 'zh' ? '#141413' : 'transparent',
        color: locale === 'zh' ? '#faf9f5' : '#b0aea5',
        transition: 'all 0.15s ease-out',
      }}>
        中
      </span>
      <span style={{
        padding: '2px 8px',
        borderRadius: 999,
        background: locale === 'en' ? '#141413' : 'transparent',
        color: locale === 'en' ? '#faf9f5' : '#b0aea5',
        transition: 'all 0.15s ease-out',
      }}>
        EN
      </span>
    </button>
  );
}

/**
 * Side-effect component: keeps `<html lang="...">` in sync with the Zustand
 * locale. Renders nothing. Placed inside layout.tsx body.
 */
export function HtmlLangSetter() {
  const locale = useEditorStore(s => s.locale ?? DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  }, [locale]);

  return null;
}
