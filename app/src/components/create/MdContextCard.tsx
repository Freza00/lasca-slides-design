'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useT, useLocale } from '@/lib/i18n';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { MdContext, MdContextPage, PageType } from '@/lib/ai/harness/types';
import type { Layout } from '@/lib/types';
import { PAGE_TYPE_CONFIG, ALL_PAGE_TYPES } from '@/lib/pageTypes';
import { CardChat } from './CardChat';

export { PAGE_TYPE_CONFIG };

interface MdContextCardProps {
  page: MdContextPage;
  index: number;
  isExpanded: boolean;
  layoutHint?: Layout;
  warning?: string;
  /** Validation error — missing title or corePoint */
  hasError?: boolean;
  onToggleExpand: () => void;
  onUpdatePage: (updated: MdContextPage) => void;
  onDelete: () => void;
  onSetLayoutHint: (layout: Layout | undefined) => void;
  /** Full mdContext for CardChat API calls */
  mdContext?: MdContext;
}

export function MdContextCard({
  page, index, isExpanded, layoutHint, warning, hasError,
  onToggleExpand, onUpdatePage, onDelete, onSetLayoutHint, mdContext,
}: MdContextCardProps) {
  const t = useT();
  const locale = useLocale();
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: `card-${index}` });

  const [editingTitle, setEditingTitle] = useState(false);
  const [editingCore, setEditingCore] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const coreRef = useRef<HTMLInputElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!typeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [typeDropdownOpen]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleTitleBlur = useCallback(() => {
    setEditingTitle(false);
    const val = titleRef.current?.value.trim();
    if (val && val !== page.title) {
      onUpdatePage({ ...page, title: val });
    }
  }, [page, onUpdatePage]);

  const handleCoreBlur = useCallback(() => {
    setEditingCore(false);
    const val = coreRef.current?.value.trim();
    if (val !== undefined && val !== page.corePoint) {
      onUpdatePage({ ...page, corePoint: val });
    }
  }, [page, onUpdatePage]);

  // Card background: subtle tint based on pageType
  const cardBg = page.pageType && PAGE_TYPE_CONFIG[page.pageType]
    ? PAGE_TYPE_CONFIG[page.pageType].bg
    : '#faf9f5';

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: cardBg,
        borderRadius: 16,
        border: isDragging ? '2px solid #d97757' : hasError ? '2px solid #dc2626' : '1px solid #e8e6dc',
        overflow: 'hidden',
        boxShadow: isDragging ? '0 8px 32px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: `${transition || ''}, box-shadow 0.2s, border-color 0.2s, background 0.2s`.replace(/^, /, ''),
      }}
    >
      {/* Header — always visible */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('[data-no-toggle]')) return;
          onToggleExpand();
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          data-no-toggle
          style={{
            cursor: 'grab', padding: '4px 2px', color: '#b0aea5',
            fontSize: 16, lineHeight: 1, flexShrink: 0,
            touchAction: 'none',
          }}
          title={t('mdCard.drag_reorder')}
        >
          ⠿
        </div>

        {/* Number badge */}
        <span style={{
          width: 28, height: 28, borderRadius: '50%',
          background: '#d97757', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}>
          {index + 1}
        </span>

        {/* Title */}
        {editingTitle ? (
          <input
            ref={titleRef}
            data-no-toggle
            defaultValue={page.title}
            autoFocus
            onBlur={handleTitleBlur}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleBlur(); }}
            style={{
              flex: 1, fontSize: 15, fontWeight: 600, color: '#141413',
              border: '1px solid #d97757', borderRadius: 8, padding: '4px 10px',
              outline: 'none', fontFamily: 'inherit', background: '#fff',
            }}
          />
        ) : (
          <span
            data-no-toggle
            onDoubleClick={() => {
              setEditingTitle(true);
              setTimeout(() => titleRef.current?.select(), 50);
            }}
            style={{
              flex: 1, fontSize: 15, fontWeight: 600, color: '#141413',
              cursor: 'text', lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            title={t('mdCard.double_click_title')}
          >
            {page.title}
          </span>
        )}

        {/* Page type badge — clickable dropdown */}
        <div data-no-toggle ref={typeDropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setTypeDropdownOpen(!typeDropdownOpen); }}
            style={{
              fontSize: 10, fontWeight: 600,
              color: page.pageType && PAGE_TYPE_CONFIG[page.pageType]
                ? PAGE_TYPE_CONFIG[page.pageType].color : '#6b6a65',
              background: page.pageType && PAGE_TYPE_CONFIG[page.pageType]
                ? PAGE_TYPE_CONFIG[page.pageType].bg : '#f5f4f0',
              padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
              border: typeDropdownOpen ? '1px solid #d97757' : '1px solid transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
          >
            {page.pageType && PAGE_TYPE_CONFIG[page.pageType]
              ? PAGE_TYPE_CONFIG[page.pageType].label[locale] : t('mdCard.content_fallback')}
            <span style={{ fontSize: 8, marginLeft: 3, opacity: 0.6 }}>▼</span>
          </button>

          {/* Dropdown */}
          {typeDropdownOpen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, zIndex: 20,
              marginTop: 4, padding: 4, borderRadius: 10,
              background: '#fff', border: '1px solid #e8e6dc',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              animation: 'qaFadeIn 0.15s ease-out',
              minWidth: 100,
            }}>
              {ALL_PAGE_TYPES.map(pt => {
                const cfg = PAGE_TYPE_CONFIG[pt];
                const isActive = page.pageType === pt || (!page.pageType && pt === 'content');
                return (
                  <button
                    key={pt}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUpdatePage({ ...page, pageType: pt });
                      setTypeDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '6px 10px', borderRadius: 6,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: isActive ? cfg.bg : 'transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f4f0'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = isActive ? cfg.bg : 'transparent'; }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: cfg.color, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: 11, fontWeight: isActive ? 600 : 400,
                      color: isActive ? cfg.color : '#6b6a65',
                    }}>
                      {cfg.label[locale]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Warning badge */}
        {warning && (
          <span style={{
            fontSize: 11, color: '#c97a1a', background: '#fef3c7',
            padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
          }}>
            {warning}
          </span>
        )}

        {/* Delete button */}
        <button
          data-no-toggle
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            width: 26, height: 26, borderRadius: 8, border: 'none',
            background: 'transparent', color: '#b0aea5', cursor: 'pointer',
            fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b0aea5'; }}
          title={t('mdCard.delete_page')}
        >
          ×
        </button>

        {/* Chat bubble */}
        {mdContext && (
          <button
            data-no-toggle
            onClick={(e) => { e.stopPropagation(); setChatOpen(!chatOpen); }}
            style={{
              width: 26, height: 26, borderRadius: 8, border: 'none',
              background: chatOpen ? '#fdf0e9' : 'transparent',
              color: chatOpen ? '#d97757' : '#b0aea5',
              cursor: 'pointer', fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!chatOpen) { e.currentTarget.style.background = '#f5f4f0'; e.currentTarget.style.color = '#6b6a65'; } }}
            onMouseLeave={e => { if (!chatOpen) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#b0aea5'; } }}
            title={t('mdCard.ai_edit_page')}
          >
            ✦
          </button>
        )}

        {/* Expand chevron */}
        <span style={{
          fontSize: 12, color: '#b0aea5', flexShrink: 0,
          transition: 'transform 0.2s',
          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
        }}>
          ▶
        </span>
      </div>

      {/* Expanded body */}
      {isExpanded && (
        <div style={{
          padding: '0 16px 16px 56px',
          animation: 'cardExpand 0.2s ease-out',
        }}>
          {/* Subtitle (optional) */}
          {(page.subtitle !== undefined || isExpanded) && (
            <input
              value={page.subtitle || ''}
              onChange={e => onUpdatePage({ ...page, subtitle: e.target.value || undefined })}
              placeholder={t('mdCard.subtitle_optional')}
              style={{
                width: '100%', fontSize: 12, color: '#6b6a65',
                border: '1px solid #e8e6dc', borderRadius: 8, padding: '4px 10px',
                outline: 'none', fontFamily: 'inherit', background: '#fff',
                marginBottom: 8,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
            />
          )}

          {/* Core point — click to edit */}
          {editingCore ? (
            <input
              ref={coreRef}
              defaultValue={page.corePoint}
              autoFocus
              onBlur={handleCoreBlur}
              onKeyDown={e => { if (e.key === 'Enter') handleCoreBlur(); }}
              style={{
                width: '100%', fontSize: 13, color: '#141413',
                border: '1px solid #d97757', borderRadius: 8, padding: '6px 10px',
                outline: 'none', fontFamily: 'inherit', background: '#fff',
                marginBottom: 8,
              }}
            />
          ) : (
            <p
              onClick={() => {
                setEditingCore(true);
                setTimeout(() => coreRef.current?.select(), 50);
              }}
              style={{
                fontSize: 13, color: '#141413', lineHeight: 1.6,
                marginBottom: 8, cursor: 'text',
                padding: '6px 10px', borderRadius: 8,
                border: '1px solid transparent',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'transparent'; }}
              title={t('mdCard.click_edit_core')}
            >
              {page.corePoint || t('mdCard.click_add_core')}
            </p>
          )}

          {/* Sub-points (论据) */}
          {page.subPoints && page.subPoints.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#b0aea5', fontWeight: 600, marginBottom: 4 }}>{t('mdCard.evidence')}</div>
              {page.subPoints.map((sp, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
                  <span style={{ color: '#d97757', fontSize: 12, lineHeight: '24px', flexShrink: 0 }}>-</span>
                  <input
                    value={sp}
                    onChange={e => {
                      const newSp = [...(page.subPoints || [])];
                      newSp[i] = e.target.value;
                      onUpdatePage({ ...page, subPoints: newSp });
                    }}
                    style={{
                      flex: 1, fontSize: 12, color: '#141413', lineHeight: 1.6,
                      padding: '2px 8px', border: '1px solid transparent', borderRadius: 6,
                      outline: 'none', fontFamily: 'inherit', background: 'transparent',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#e8e6dc'; e.currentTarget.style.background = '#fff'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent'; }}
                  />
                  <button
                    onClick={() => {
                      const newSp = (page.subPoints || []).filter((_, j) => j !== i);
                      onUpdatePage({ ...page, subPoints: newSp.length > 0 ? newSp : undefined });
                    }}
                    style={{
                      border: 'none', background: 'transparent', color: '#d4d3cd',
                      cursor: 'pointer', fontSize: 12, padding: '2px 4px', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#d4d3cd'; }}
                  >×</button>
                </div>
              ))}
              <button
                onClick={() => {
                  const newSp = [...(page.subPoints || []), ''];
                  onUpdatePage({ ...page, subPoints: newSp });
                }}
                style={{
                  fontSize: 11, color: '#b0aea5', border: 'none', background: 'transparent',
                  cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#d97757'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#b0aea5'; }}
              >{t('mdCard.add_evidence')}</button>
            </div>
          )}

          {/* Evidence (数据/引证) */}
          {page.evidence && page.evidence.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: '#b0aea5', fontWeight: 600, marginBottom: 4 }}>{t('mdCard.data_evidence')}</div>
              {page.evidence.map((ev, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 4 }}>
                  <input
                    value={ev}
                    onChange={e => {
                      const newEv = [...(page.evidence || [])];
                      newEv[i] = e.target.value;
                      onUpdatePage({ ...page, evidence: newEv });
                    }}
                    style={{
                      flex: 1, fontSize: 12, color: '#6b6a65', lineHeight: 1.5,
                      padding: '3px 10px', background: '#f9f8f5', borderRadius: 6,
                      border: '1px solid transparent', borderLeft: '3px solid #d97757',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Body textarea — only show if no structured subPoints */}
          {(!page.subPoints || page.subPoints.length === 0) && (
            <textarea
              value={page.body}
              onChange={e => onUpdatePage({ ...page, body: e.target.value })}
              placeholder={t('mdCard.body_placeholder')}
              rows={3}
              style={{
                width: '100%', border: '1px solid #e8e6dc', borderRadius: 10,
                padding: '10px 12px', fontSize: 13, lineHeight: 1.7,
                color: '#141413', fontFamily: 'inherit', outline: 'none',
                background: '#fff', resize: 'vertical',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
            />
          )}

          {/* Notes (optional) */}
          {page.notes !== undefined && (
            <textarea
              value={page.notes || ''}
              onChange={e => onUpdatePage({ ...page, notes: e.target.value })}
              placeholder={t('mdCard.notes_placeholder')}
              rows={2}
              style={{
                width: '100%', border: '1px solid #e8e6dc', borderRadius: 10,
                padding: '8px 12px', fontSize: 12, lineHeight: 1.6,
                color: '#6b6a65', fontFamily: 'inherit', outline: 'none',
                background: '#f5f4f0', resize: 'vertical', marginTop: 8,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
            />
          )}

          {/* Per-card inline chat */}
          {chatOpen && mdContext && (
            <CardChat
              mdContext={mdContext}
              page={page}
              pageIndex={index}
              onUpdate={(updated) => {
                onUpdatePage(updated);
                setChatOpen(false);
              }}
              onClose={() => setChatOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
