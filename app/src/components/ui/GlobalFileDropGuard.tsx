'use client';

import { useEffect } from 'react';
import { hasFileDragData } from '@/lib/fileDrop';

export function GlobalFileDropGuard() {
  useEffect(() => {
    const preventBrowserOpen = (event: DragEvent) => {
      if (!hasFileDragData(event.dataTransfer)) return;
      event.preventDefault();
      if (event.type === 'dragover' && event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    window.addEventListener('dragover', preventBrowserOpen, true);
    window.addEventListener('drop', preventBrowserOpen, true);

    return () => {
      window.removeEventListener('dragover', preventBrowserOpen, true);
      window.removeEventListener('drop', preventBrowserOpen, true);
    };
  }, []);

  return null;
}
