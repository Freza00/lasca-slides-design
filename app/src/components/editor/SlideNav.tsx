'use client';

import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';

export function SlideNav() {
  const t = useT();
  const currentIndex = useEditorStore(s => s.currentIndex);
  const setCurrentIndex = useEditorStore(s => s.setCurrentIndex);
  const deck = useEditorStore(s => s.activeDeck());
  const total = deck.slides.length;

  const goPrev = () => { if (currentIndex > 0) setCurrentIndex(currentIndex - 1); };
  const goNext = () => { if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1); };

  const btnStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.95)',
    border: '1px solid #e8e6dc',
    color: '#141413',
    cursor: 'pointer',
    fontSize: 20, fontWeight: 600,
    boxShadow: '0 2px 12px rgba(20,20,19,0.18)',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
    padding: 0,
    zIndex: 5,
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  };

  const onHover = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '#fff';
    e.currentTarget.style.background = '#d97757';
    e.currentTarget.style.borderColor = '#d97757';
    e.currentTarget.style.transform = 'translateY(-50%) scale(1.08)';
  };
  const onLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = '#141413';
    e.currentTarget.style.background = '#ffffff';
    e.currentTarget.style.borderColor = '#e8e6dc';
    e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
  };

  return (
    <>
      {/* Left arrow — overlay near canvas left edge */}
      {currentIndex > 0 && (
        <button
          className="lasca-canvas-corner"
          onClick={goPrev}
          style={{ ...btnStyle, left: 12 }}
          onMouseEnter={onHover}
          onMouseLeave={onLeave}
          title={t('nav.prev')}
        >
          ‹
        </button>
      )}
      {/* Right arrow — overlay near canvas right edge */}
      {currentIndex < total - 1 && (
        <button
          className="lasca-canvas-corner"
          onClick={goNext}
          style={{ ...btnStyle, right: 12 }}
          onMouseEnter={onHover}
          onMouseLeave={onLeave}
          title={t('nav.next')}
        >
          ›
        </button>
      )}
    </>
  );
}
