'use client';

import { useState, useCallback } from 'react';
import type { PlanOutline, PlanPage, PageType, ClarifierAnswers } from '@/lib/ai/harness/types';
import { PAGE_TYPE_CONFIG } from './MdContextCard';
import { useT, useLocale } from '@/lib/i18n';
import { addToast } from '@/lib/toast';

const PURPOSE_KEYS: Record<string, string> = {
  'report-up': 'plan.purpose.report_up', persuade: 'plan.purpose.persuade', share: 'plan.purpose.share', research: 'plan.purpose.research', sales: 'plan.purpose.sales',
};
const NARRATIVE_KEYS: Record<string, string> = {
  'conclusion-first': 'plan.narrative.conclusion_first', progressive: 'plan.narrative.progressive', story: 'plan.narrative.story', comparison: 'plan.narrative.comparison',
};
const EVIDENCE_KEYS: Record<string, string> = {
  opinion: 'plan.evidence.opinion', 'key-data': 'plan.evidence.key_data', 'data-heavy': 'plan.evidence.data_heavy', 'case-study': 'plan.evidence.case_study',
};

// 宪法 §2：仅 4 种 pageType。
const ALL_PAGE_TYPES: PageType[] = ['cover', 'section', 'content', 'back'];

interface PlanPreviewProps {
  plan: PlanOutline;
  answers: ClarifierAnswers;
  onApprove: (plan: PlanOutline) => void;
  onFeedback: (plan: PlanOutline, feedback: string) => void;
  onBack: () => void;
}

export function PlanPreview({ plan: initialPlan, answers, onApprove, onFeedback, onBack }: PlanPreviewProps) {
  const t = useT();
  const locale = useLocale();
  const [plan, setPlan] = useState<PlanOutline>(initialPlan);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');

  // Target page count from the length selector (hard constraint)
  const targetPageCount = typeof answers.length === 'number' ? answers.length : null;

  const updatePage = useCallback((idx: number, updated: Partial<PlanPage>) => {
    setPlan(prev => ({
      ...prev,
      pages: prev.pages.map((p, i) => i === idx ? { ...p, ...updated } : p),
    }));
  }, []);

  const deletePage = useCallback((idx: number) => {
    if (plan.pages.length <= 2) return; // keep at least cover + back
    if (targetPageCount && plan.pages.length <= targetPageCount) {
      addToast('warn', locale === 'zh'
        ? `目标页数为 ${targetPageCount} 页，删除后将少于目标`
        : `Target is ${targetPageCount} pages — deleting will go below target`);
    }
    setPlan(prev => ({
      ...prev,
      pages: prev.pages.filter((_, i) => i !== idx),
      suggestedPageCount: prev.pages.length - 1,
    }));
  }, [plan.pages.length, targetPageCount, locale]);

  const insertPage = useCallback((afterIdx: number) => {
    if (targetPageCount && plan.pages.length >= targetPageCount) {
      addToast('warn', locale === 'zh'
        ? `目标页数为 ${targetPageCount} 页，已达到上限`
        : `Target is ${targetPageCount} pages — already at limit`);
      return;
    }
    const newPage: PlanPage = { title: t('plan.new_page'), direction: '', pageType: 'content' };
    setPlan(prev => {
      const pages = [...prev.pages];
      pages.splice(afterIdx + 1, 0, newPage);
      return { ...prev, pages, suggestedPageCount: pages.length };
    });
    setEditingIdx(afterIdx + 1);
  }, [plan.pages.length, targetPageCount, locale, t]);

  // Summary chips from answers
  const summaryParts = [
    answers.purpose && PURPOSE_KEYS[String(answers.purpose)] && t(PURPOSE_KEYS[String(answers.purpose)]),
    answers.length && t('plan.pages', { n: String(answers.length) }),
    answers.narrative && NARRATIVE_KEYS[String(answers.narrative)] && t(NARRATIVE_KEYS[String(answers.narrative)]),
    answers.evidence && EVIDENCE_KEYS[String(answers.evidence)] && t(EVIDENCE_KEYS[String(answers.evidence)]),
  ].filter(Boolean);

  return (
    <div className="create-container" style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#141413', marginBottom: 4 }}>
        {t('plan.title')}
      </h2>
      <p style={{ fontSize: 13, color: '#b0aea5', marginBottom: 16, lineHeight: 1.6 }}>
        {plan.summary}
      </p>

      {/* Page count note — AI explains why it deviated from target */}
      {plan.pageCountNote && targetPageCount && plan.pages.length !== targetPageCount && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: '#fff8f0', border: '1px solid #f0d8c8',
          fontSize: 13, color: '#8b6914', marginBottom: 16, lineHeight: 1.5,
        }}>
          {plan.pageCountNote}
        </div>
      )}

      {/* Preference chips */}
      {summaryParts.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {summaryParts.map((part, i) => (
            <span key={i} style={{
              fontSize: 11, color: '#6b6a65', background: '#f5f4f0',
              padding: '2px 8px', borderRadius: 6,
            }}>{part}</span>
          ))}
        </div>
      )}

      {/* Structure flow */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap',
        marginBottom: 20, padding: '8px 12px', borderRadius: 10,
        background: '#fff', border: '1px solid #e8e6dc',
      }}>
        {plan.pages.map((p, i) => {
          const cfg = PAGE_TYPE_CONFIG[p.pageType];
          return (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: cfg?.color || '#6b6a65',
                background: cfg?.bg || '#f5f4f0',
                padding: '1px 6px', borderRadius: 4,
              }}>{cfg?.label[locale] || t('cardPanel.content')}</span>
              {i < plan.pages.length - 1 && <span style={{ fontSize: 9, color: '#d4d3cd' }}>→</span>}
            </span>
          );
        })}
      </div>

      {/* Page list — each page is title + direction, inline editable */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
        {plan.pages.map((page, idx) => {
          const cfg = PAGE_TYPE_CONFIG[page.pageType];
          const isEditing = editingIdx === idx;

          return (
            <div key={idx}>
              <div
                onClick={() => setEditingIdx(isEditing ? null : idx)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 14px', borderRadius: 10,
                  background: isEditing ? '#fff' : '#faf9f5',
                  border: isEditing ? '1.5px solid #d97757' : '1px solid #e8e6dc',
                  cursor: 'pointer', transition: 'all 0.15s',
                  animation: `cardRise 0.3s ease-out ${idx * 60}ms both`,
                }}
              >
                {/* Number */}
                <span style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#d97757', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                }}>{idx + 1}</span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                        {ALL_PAGE_TYPES.map(pt => (
                          <button key={pt} onClick={e => { e.stopPropagation(); updatePage(idx, { pageType: pt }); }}
                            style={{
                              fontSize: 9, padding: '3px 8px', borderRadius: 4,
                              border: page.pageType === pt ? '1px solid #d97757' : '1px solid transparent',
                              background: page.pageType === pt ? (PAGE_TYPE_CONFIG[pt]?.bg || '#f5f4f0') : 'transparent',
                              color: PAGE_TYPE_CONFIG[pt]?.color || '#6b6a65',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >{PAGE_TYPE_CONFIG[pt]?.label[locale] || pt}</button>
                        ))}
                      </div>
                      <input
                        autoFocus
                        value={page.title}
                        onChange={e => updatePage(idx, { title: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: '100%', fontSize: 14, fontWeight: 600, color: '#141413',
                          border: 'none', borderBottom: '1px dashed #e8e6dc',
                          outline: 'none', background: 'transparent',
                          fontFamily: 'inherit', padding: '2px 0', marginBottom: 4,
                        }}
                      />
                      <input
                        value={page.direction}
                        onChange={e => updatePage(idx, { direction: e.target.value })}
                        onClick={e => e.stopPropagation()}
                        placeholder={t('plan.direction_placeholder')}
                        style={{
                          width: '100%', fontSize: 12, color: '#6b6a65',
                          border: 'none', borderBottom: '1px dashed #e8e6dc',
                          outline: 'none', background: 'transparent',
                          fontFamily: 'inherit', padding: '2px 0',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                        <button onClick={e => { e.stopPropagation(); insertPage(idx); }}
                          style={{ fontSize: 11, color: '#d97757', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                        >{t('plan.insert_below')}</button>
                        <button onClick={e => { e.stopPropagation(); deletePage(idx); }}
                          style={{ fontSize: 11, color: '#dc2626', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                        >{t('plan.delete')}</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 9, fontWeight: 600,
                          color: cfg?.color || '#6b6a65',
                          background: cfg?.bg || '#f5f4f0',
                          padding: '1px 6px', borderRadius: 4,
                        }}>{cfg?.label[locale] || t('cardPanel.content')}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#141413' }}>
                          {page.title}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6b6a65', lineHeight: 1.4 }}>
                        {page.direction || t('plan.click_edit_direction')}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Feedback input — scrollable, above sticky footer */}
      <div style={{ paddingTop: 16, borderTop: '1px solid #e8e6dc', marginBottom: 8 }}>
        <div style={{
          display: 'flex', gap: 8,
          alignItems: 'center',
        }}>
          <input
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && feedback.trim()) {
                onFeedback(plan, feedback.trim());
                setFeedback('');
              }
            }}
            placeholder={t('plan.feedback_placeholder')}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 12,
              border: '1px solid #e8e6dc', background: '#fff',
              color: '#141413', fontSize: 13, fontFamily: 'inherit',
              outline: 'none',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#d97757'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e8e6dc'; }}
          />
          {feedback.trim() && (
            <button
              onClick={() => { onFeedback(plan, feedback.trim()); setFeedback(''); }}
              style={{
                padding: '12px 18px', borderRadius: 12, border: 'none',
                background: '#d97757', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit', flexShrink: 0, minHeight: 44,
              }}
            >{t('plan.send')}</button>
          )}
        </div>
      </div>

      {/* Sticky footer — matches MdContextCards */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, background: 'linear-gradient(transparent 0%, rgba(245,244,240,0.97) 40%)', padding: '20px 0 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{
          padding: '12px 20px', borderRadius: 12, border: '1px solid #e8e6dc',
          background: '#fff', color: '#6b6a65',
          fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
        }}>{t('plan.back')}</button>
        <span style={{ fontSize: 13, color: targetPageCount && plan.pages.length !== targetPageCount ? '#d97757' : '#b0aea5' }}>
          {targetPageCount
            ? `${plan.pages.length}/${targetPageCount} ${locale === 'zh' ? '页' : 'pages'}`
            : t('plan.pages', { n: plan.pages.length })}
        </span>
        <button onClick={() => onApprove(plan)} style={{
          padding: '12px 32px', borderRadius: 14, border: 'none',
          background: '#1a1a2e', color: '#fff',
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#2a2a4e'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1a1a2e'; }}
        >{t('plan.approve')}</button>
      </div>
    </div>
  );
}
