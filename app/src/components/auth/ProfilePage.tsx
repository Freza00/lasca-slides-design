'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/authContext';
import { useEditorStore } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { LascaBrand } from '@/components/ui/LascaBrand';
import { renderSlide } from '@/lib/renderSlide';
import { getLogicalDims, fitToBox } from '@/lib/pageSize';
import type { Deck } from '@/lib/types';

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const BG = '#faf9f5';
const OCHRE = '#d97757';
const TEXT = '#3a3935';
const MUTED = '#b0aea5';
const INPUT_BORDER = '#e8e6dc';

type Tab = 'works' | 'invites';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface InviteCode {
  code: string;
  used: boolean;
  usedByEmail: string | null;
  usedAt: string | null;
  createdAt: string;
  maxUses: number | null;
  useCount: number;
}

// ---------------------------------------------------------------------------
// Deck card
// ---------------------------------------------------------------------------
const THUMB_W = 240;
const THUMB_H = 156;

function DeckCard({ deck, onOpen, onDelete, t }: {
  deck: Deck; onOpen: () => void; onDelete: () => void;
  t: (key: string, r?: Record<string, string | number>) => string;
}) {
  const logical = getLogicalDims(deck);
  const thumb = fitToBox(logical.w, logical.h, THUMB_W, THUMB_H);
  const firstSlide = deck.slides[0];
  const html = useMemo(
    () => firstSlide ? renderSlide(firstSlide, deck.theme, logical) : '',
    [firstSlide, deck.theme, logical],
  );

  return (
    <div
      onClick={onOpen}
      style={{
        background: '#fff', borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
        border: `1px solid ${INPUT_BORDER}`, transition: 'box-shadow 0.2s, transform 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.07)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{
        width: '100%', height: thumb.h + 12,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f4f0', overflow: 'hidden', padding: 6,
      }}>
        <div data-no-fx="1" style={{ width: thumb.w, height: thumb.h, overflow: 'hidden', position: 'relative' }}>
          <div
            style={{
              width: logical.w, height: logical.h,
              transform: `scale(${thumb.scale})`, transformOrigin: 'top left', pointerEvents: 'none',
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deck.name}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>
            {t('works.pages', { n: deck.slides.length })}
          </div>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title={t('works.delete')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: MUTED, fontSize: 14, padding: '2px 4px', borderRadius: 4, lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = OCHRE)}
          onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
        >
          ×
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar nav item
// ---------------------------------------------------------------------------
function NavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 12px', borderRadius: 8, border: 'none', width: '100%',
        background: active ? `${OCHRE}10` : 'transparent',
        color: active ? OCHRE : TEXT,
        fontSize: 14, fontWeight: active ? 600 : 400,
        cursor: 'pointer', textAlign: 'left',
        transition: 'all 0.15s',
      }}
    >
      <span style={{ fontSize: 16, lineHeight: 1, opacity: active ? 1 : 0.5 }}>{icon}</span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ProfilePage() {
  const t = useT();
  const router = useRouter();
  const { user, daysLeft, token, logout } = useAuth();
  const [tab, setTab] = useState<Tab>('works');

  // ── Works ──────────────────────────────────────────────────────────────
  const decks = useEditorStore(s => s.decks);
  const setActiveDeck = useEditorStore(s => s.setActiveDeck);
  const removeDeck = useEditorStore(s => s.removeDeck);

  const handleOpen = useCallback((deckId: string) => {
    setActiveDeck(deckId);
    router.push('/editor');
  }, [setActiveDeck, router]);

  const handleDelete = useCallback((deckId: string, deckName: string) => {
    if (!confirm(t('works.confirm_delete', { name: deckName }))) return;
    removeDeck(deckId);
  }, [removeDeck, t]);

  // ── Invite codes ───────────────────────────────────────────────────────
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (!token) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch('/api/invite/my-codes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!mountedRef.current) return;
        setCodes(data.codes ?? []);
        setRemaining(data.remaining ?? 0);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    })();
    return () => { mountedRef.current = false; };
  }, [token]);

  const copyCode = useCallback((code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(prev => prev === idx ? null : prev), 1500);
  }, []);

  const generateCode = useCallback(async () => {
    if (!token || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/invite/generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCodes(prev => [{ code: data.code, used: false, usedByEmail: null, usedAt: null, createdAt: new Date().toISOString(), maxUses: 1, useCount: 0 }, ...prev]);
      setRemaining(data.remaining ?? 0);
    } finally {
      setGenerating(false);
    }
  }, [token, generating]);

  return (
    <div style={{ minHeight: '100vh', height: '100vh', background: BG, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>

      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52, flexShrink: 0,
        borderBottom: `1px solid ${INPUT_BORDER}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', color: MUTED, textDecoration: 'none' }} title="Home">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5L8 2l5.5 4.5V13a1 1 0 01-1 1h-9a1 1 0 01-1-1V6.5z" />
              <path d="M6 14V9h4v5" />
            </svg>
          </a>
          <LascaBrand variant="full" size={18} />
        </div>
        <a href="/editor" style={{ fontSize: 13, color: OCHRE, textDecoration: 'none', fontWeight: 500 }}>
          {t('profile.back')}
        </a>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left sidebar ── */}
        <div style={{
          width: 220, flexShrink: 0, borderRight: `1px solid ${INPUT_BORDER}`,
          padding: '20px 12px', display: 'flex', flexDirection: 'column',
          overflowY: 'auto',
        }}>
          {/* User card */}
          {user && (
            <div style={{
              padding: '14px 12px', marginBottom: 16, borderRadius: 10,
              background: '#fff', border: `1px solid ${INPUT_BORDER}`,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 6,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.email}
              </div>
              <div style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                background: daysLeft > 4 ? `${OCHRE}12` : '#fde8e8',
                fontSize: 11, fontWeight: 600,
                color: daysLeft > 4 ? OCHRE : '#c0392b',
              }}>
                {daysLeft > 0 ? t('profile.beta_days', { n: daysLeft }) : t('profile.beta_expired')}
              </div>
              {/* Login credentials for other devices */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${INPUT_BORDER}` }}>
                <div style={{ fontSize: 10, color: MUTED, marginBottom: 4 }}>{t('profile.login_info')}</div>
                <div style={{ fontSize: 11, color: TEXT, marginBottom: 2 }}>{user.email}</div>
                {user.loginCode && (
                  <code style={{ fontSize: 12, fontWeight: 600, color: OCHRE, letterSpacing: 0.5 }}>
                    {user.loginCode}
                  </code>
                )}
              </div>
            </div>
          )}

          {/* Nav */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <NavItem
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>}
              label={t('profile.my_works')}
              active={tab === 'works'}
              onClick={() => setTab('works')}
            />
            <NavItem
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4l6-2 6 2v5c0 3-3 5-6 5s-6-2-6-5V4z"/><path d="M8 7v2"/><circle cx="8" cy="11" r="0.5" fill="currentColor"/></svg>}
              label={t('profile.invite_codes')}
              active={tab === 'invites'}
              onClick={() => setTab('invites')}
            />
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 12px', fontSize: 13, color: MUTED,
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              borderRadius: 8, transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c0392b')}
            onMouseLeave={e => (e.currentTarget.style.color = MUTED)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3"/><path d="M10 11l3-3-3-3"/><path d="M13 8H6"/>
            </svg>
            {t('profile.logout')}
          </button>
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto' }}>

          {/* Works tab */}
          {tab === 'works' && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
                <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: 0 }}>{t('profile.my_works')}</h1>
                <span style={{ fontSize: 12, color: MUTED }}>{t('works.deck_count', { n: decks.length })}</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16,
              }}>
                {decks.map(deck => (
                  <DeckCard key={deck.id} deck={deck} onOpen={() => handleOpen(deck.id)} onDelete={() => handleDelete(deck.id, deck.name)} t={t} />
                ))}
                {decks.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: MUTED, fontSize: 14 }}>
                    {t('works.empty')}{' '}
                    <a href="/" style={{ color: OCHRE, textDecoration: 'none', fontWeight: 500 }}>{t('works.create_first')}</a>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Invite codes tab */}
          {tab === 'invites' && (
            <>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: TEXT, margin: '0 0 20px' }}>
                {t('profile.invite_codes')}
              </h1>
              <p style={{ fontSize: 13, color: MUTED, marginBottom: 16, lineHeight: 1.5, maxWidth: 480 }}>
                {t('profile.invite_desc')}
              </p>

              {loading ? (
                <div style={{ fontSize: 13, color: MUTED, padding: '16px 0' }}>{t('profile.loading')}</div>
              ) : (
                <div style={{ maxWidth: 520 }}>
                  {codes.length === 0 ? (
                    <div style={{
                      padding: '32px 0', textAlign: 'center',
                      color: MUTED, fontSize: 13,
                      border: `1px dashed ${INPUT_BORDER}`, borderRadius: 10,
                    }}>
                      —
                    </div>
                  ) : (
                    <div style={{
                      background: '#fff', borderRadius: 10,
                      border: `1px solid ${INPUT_BORDER}`, overflow: 'hidden',
                    }}>
                      {codes.map((c, i) => (
                        <div key={c.code} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px',
                          borderBottom: i < codes.length - 1 ? `1px solid ${INPUT_BORDER}` : 'none',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <code style={{ fontSize: 14, fontWeight: 600, color: OCHRE, letterSpacing: 1, fontFamily: 'monospace' }}>
                              {c.code}
                            </code>
                            {c.maxUses !== null && c.maxUses <= 1 ? (
                              /* Single-use code */
                              c.used ? (
                                <span style={{ fontSize: 11, color: MUTED, padding: '2px 8px', borderRadius: 4, background: '#f5f4f0' }}>
                                  {c.usedByEmail ? t('profile.code_used_by', { email: c.usedByEmail }) : t('profile.code_used')}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#2d8a56', background: '#e8f5e9', padding: '2px 8px', borderRadius: 4 }}>
                                  {t('profile.code_available')}
                                </span>
                              )
                            ) : (
                              /* Multi-use code */
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                color: c.maxUses === null || c.useCount < c.maxUses ? '#2d8a56' : MUTED,
                                background: c.maxUses === null || c.useCount < c.maxUses ? '#e8f5e9' : '#f5f4f0',
                              }}>
                                {c.maxUses === null
                                  ? t('profile.code_uses_unlimited', { n: c.useCount })
                                  : t('profile.code_uses_counted', { n: c.useCount, max: c.maxUses })}
                              </span>
                            )}
                          </div>
                          {!(c.maxUses !== null && c.maxUses <= 1 && c.used) && (
                            <button
                              onClick={() => copyCode(c.code, i)}
                              style={{
                                background: copiedIdx === i ? `${OCHRE}12` : '#fff',
                                border: `1px solid ${copiedIdx === i ? OCHRE : INPUT_BORDER}`,
                                borderRadius: 6, padding: '4px 12px', fontSize: 12,
                                cursor: 'pointer', color: copiedIdx === i ? OCHRE : TEXT,
                                fontWeight: copiedIdx === i ? 600 : 400,
                                flexShrink: 0, transition: 'all 0.15s',
                              }}
                            >
                              {copiedIdx === i ? t('profile.copied') : t('profile.copy')}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Generate new */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
                    <button
                      onClick={generateCode}
                      disabled={remaining <= 0 || generating}
                      style={{
                        padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8,
                        border: 'none', cursor: remaining > 0 && !generating ? 'pointer' : 'not-allowed',
                        background: remaining > 0 ? OCHRE : '#e0ddd5',
                        color: remaining > 0 ? '#fff' : MUTED,
                        transition: 'opacity 0.15s',
                      }}
                    >
                      {generating ? t('profile.generating') : t('profile.generate_code')}
                    </button>
                    <span style={{ fontSize: 12, color: MUTED }}>
                      {remaining > 0 ? t('profile.remaining', { n: remaining }) : t('profile.no_remaining')}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
