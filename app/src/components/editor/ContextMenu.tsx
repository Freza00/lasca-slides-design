'use client';

import React from 'react';
import { useT } from '@/lib/i18n';

interface ContextMenuProps {
  x: number;
  y: number;
  hasElement: boolean;
  onAction: (action: string) => void;
  onClose: () => void;
}

const itemStyle: React.CSSProperties = {
  padding: '7px 16px',
  cursor: 'pointer',
  transition: 'background 0.1s',
};

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#333'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      style={itemStyle}
    >
      {label}
    </div>
  );
}

export function ContextMenu({ x, y, hasElement, onAction, onClose }: ContextMenuProps) {
  const t = useT();
  return (
    <>
      {/* Invisible backdrop to catch outside clicks */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 199 }}
      />
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          background: '#1a1a1a',
          borderRadius: 8,
          padding: '4px 0',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
          zIndex: 200,
          minWidth: 160,
          fontSize: 13,
          fontFamily: 'inherit',
          color: '#eee',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasElement && (
          <MenuItem label={t('menu.edit_text')} onClick={() => onAction('editText')} />
        )}
        <MenuItem label={t('menu.insert_textbox')} onClick={() => onAction('insertTextBox')} />
        <MenuItem label={t('menu.insert_image')} onClick={() => onAction('insertImage')} />
        {hasElement && (
          <>
            <MenuItem label={t('menu.duplicate')} onClick={() => onAction('duplicateElement')} />
            <MenuItem label={t('menu.delete')} onClick={() => onAction('deleteElement')} />
            <MenuItem label={t('menu.bring_front')} onClick={() => onAction('bringToFront')} />
            <MenuItem label={t('menu.send_back')} onClick={() => onAction('sendToBack')} />
          </>
        )}
        {/* Separator */}
        <div style={{ height: 1, background: '#333', margin: '4px 0' }} />
        <MenuItem label={t('menu.add_page')} onClick={() => onAction('addPage')} />
        <MenuItem label={t('menu.delete_page')} onClick={() => onAction('deletePage')} />
      </div>
    </>
  );
}
