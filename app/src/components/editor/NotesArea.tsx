'use client';

import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';

export function NotesArea() {
  const t = useT();
  const currentIndex = useEditorStore(s => s.currentIndex);
  const slide = useEditorStore(s => s.currentSlide());
  const updateSlide = useEditorStore(s => s.updateSlide);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!slide) return;
    updateSlide(currentIndex, { ...slide, notes: e.target.value });
  };

  return (
    <textarea
      value={slide?.notes || ''}
      onChange={handleChange}
      placeholder={t('notes.placeholder')}
      style={{
        flex: 1, height: '100%', background: 'transparent', border: 'none', outline: 'none',
        padding: '10px 16px', fontSize: 12, color: '#141413', resize: 'none',
        fontFamily: 'inherit', lineHeight: 1.6,
      }}
    />
  );
}
