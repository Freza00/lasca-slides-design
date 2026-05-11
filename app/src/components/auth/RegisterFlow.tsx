'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';
import { useFlag } from '@/lib/featureFlags';

type Step = 'code' | 'survey' | 'done' | 'login';

interface RegisterResult {
  token: string;
  user: { id: number; email: string; displayName: string | null };
  inviteCodes: string[];
}

const BG = '#faf9f5';
const OCHRE = '#d97757';
const TEXT = '#3a3935';
const MUTED = '#b0aea5';
const CARD_BG = '#fff';
const INPUT_BORDER = '#e0ddd5';

// KEY FIX: body has overflow-hidden globally (for editor).
// Use height:100% + overflowY:auto to create our own scroll context.
const containerStyle: React.CSSProperties = {
  height: '100%',
  overflowY: 'auto',
  background: BG,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 24px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};
const cardStyle: React.CSSProperties = {
  background: CARD_BG, borderRadius: 16, padding: '40px 36px',
  maxWidth: 440, width: '100%', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  alignSelf: 'flex-start',
};
const headingStyle: React.CSSProperties = { fontSize: 24, fontWeight: 700, color: TEXT, marginBottom: 8 };
const subStyle: React.CSSProperties = { fontSize: 14, color: MUTED, marginBottom: 28, lineHeight: 1.5 };
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', fontSize: 15, border: `1px solid ${INPUT_BORDER}`,
  borderRadius: 8, outline: 'none', boxSizing: 'border-box', marginBottom: 12,
};
const btnStyle: React.CSSProperties = {
  width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
  background: OCHRE, color: '#fff', border: 'none', borderRadius: 8,
  cursor: 'pointer', marginTop: 8,
};
const btnDisabled: React.CSSProperties = { ...btnStyle, opacity: 0.5, cursor: 'not-allowed' };
const errorStyle: React.CSSProperties = { color: '#c0392b', fontSize: 13, marginBottom: 8 };

// ---------------------------------------------------------------------------
// Google Identity Services — types + sign-in panel
// ---------------------------------------------------------------------------

interface GoogleCredentialResponse { credential: string }
interface GoogleAccountsId {
  initialize: (config: { client_id: string; callback: (resp: GoogleCredentialResponse) => void }) => void;
  renderButton: (parent: HTMLElement, opts: { theme?: string; size?: string; width?: number; text?: string; shape?: string }) => void;
}
interface GoogleAccounts { id: GoogleAccountsId }
interface GoogleNamespace { accounts: GoogleAccounts }

function getGoogle(): GoogleNamespace | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { google?: GoogleNamespace }).google;
}

function GoogleSignInPanel() {
  const buttonHostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId) return;
    if (!buttonHostRef.current) return;

    let cancelled = false;
    let pollHandle: ReturnType<typeof setInterval> | null = null;

    const init = () => {
      const g = getGoogle();
      if (!g || !buttonHostRef.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          if (cancelled) return;
          setBusy(true);
          setError('');
          try {
            const res = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ idToken: resp.credential }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(data.error || 'Sign-in failed.');
              setBusy(false);
              return;
            }
            localStorage.setItem('lasca-session', data.token);
            window.location.href = '/';
          } catch {
            setError('Network error. Please try again.');
            setBusy(false);
          }
        },
      });
      g.accounts.id.renderButton(buttonHostRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'rectangular',
      });
    };

    if (getGoogle()) {
      init();
    } else {
      // GIS script (mounted in app/layout.tsx) may still be loading.
      pollHandle = setInterval(() => {
        if (cancelled) return;
        if (getGoogle()) {
          if (pollHandle) clearInterval(pollHandle);
          init();
        }
      }, 100);
      // Give up after 10 seconds — script blocked by network or extension.
      setTimeout(() => {
        if (pollHandle) clearInterval(pollHandle);
        if (!cancelled && !getGoogle()) {
          setError('Google sign-in failed to load. Check your network or ad blocker.');
        }
      }, 10_000);
    }

    return () => {
      cancelled = true;
      if (pollHandle) clearInterval(pollHandle);
    };
  }, [clientId]);

  if (!clientId) {
    return (
      <>
        <h1 style={headingStyle}>Welcome to Lasca</h1>
        <p style={subStyle}>
          Google sign-in isn&apos;t configured yet. Set <code style={{ background: '#f0efeb', padding: '1px 6px', borderRadius: 4 }}>GOOGLE_CLIENT_ID</code> and <code style={{ background: '#f0efeb', padding: '1px 6px', borderRadius: 4 }}>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in your environment, or flip <code style={{ background: '#f0efeb', padding: '1px 6px', borderRadius: 4 }}>auth_mode</code> to <code style={{ background: '#f0efeb', padding: '1px 6px', borderRadius: 4 }}>invite_legacy</code> from the admin page.
        </p>
      </>
    );
  }

  return (
    <>
      <h1 style={headingStyle}>Welcome to Lasca</h1>
      <p style={subStyle}>Sign in with your Google account to start creating decks and reports.</p>
      {error && <p style={errorStyle}>{error}</p>}
      <div ref={buttonHostRef} style={{ display: 'flex', justifyContent: 'center', marginTop: 12, opacity: busy ? 0.5 : 1, pointerEvents: busy ? 'none' : 'auto' }} />
      <p style={{ fontSize: 12, color: MUTED, marginTop: 24, lineHeight: 1.5 }}>
        By signing in, you agree that usage data will be collected to improve Lasca.
        Daily generation limits apply per account.
      </p>
    </>
  );
}

function ChipSelect({ options, selected, onChange }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {options.map(opt => {
        const active = selected.includes(opt);
        return (
          <button key={opt} type="button" onClick={() =>
            onChange(active ? selected.filter(s => s !== opt) : [...selected, opt])
          } style={{
            padding: '6px 14px', fontSize: 13, borderRadius: 20,
            border: `1px solid ${active ? OCHRE : INPUT_BORDER}`,
            background: active ? `${OCHRE}18` : 'transparent',
            color: active ? OCHRE : TEXT, cursor: 'pointer', fontWeight: active ? 600 : 400,
          }}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RadioSelect({ options, selected, onChange, name }: {
  options: string[]; selected: string; onChange: (v: string) => void; name: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
      {options.map(opt => (
        <label key={opt} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
          borderRadius: 8, cursor: 'pointer', fontSize: 14, color: TEXT,
          background: selected === opt ? `${OCHRE}10` : 'transparent',
        }}>
          <input type="radio" name={name} checked={selected === opt}
            onChange={() => onChange(opt)} style={{ accentColor: OCHRE }} />
          {opt}
        </label>
      ))}
    </div>
  );
}

export function RegisterFlow() {
  const t = useT();
  const authMode = useFlag('auth_mode') ?? 'google_only';
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [currentTool, setCurrentTool] = useState<string[]>([]);
  const [useCase, setUseCase] = useState<string[]>([]);
  const [role, setRole] = useState('');
  const [painPoint, setPainPoint] = useState('');

  const handleCodeSubmit = useCallback(async () => {
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      const trimmed = code.trim().toUpperCase();
      if (!/^LASCA-[A-Z0-9]{5}$/.test(trimmed)) { setError(t('register.invalid_code')); return; }
      setStep('survey');
    } finally { setLoading(false); }
  }, [code, t]);

  const handleRegister = useCallback(async () => {
    if (!email.trim()) { setError(t('register.email_required')); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(t('register.invalid_email')); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(), email: email.trim().toLowerCase(),
          survey: { currentTool, useCase, role: role || undefined, painPoint: painPoint || undefined },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t('register.failed'));
        if (res.status === 400 && (data.code === 'code_invalid' || data.code === 'code_email_required')) setStep('code');
        return;
      }
      localStorage.setItem('lasca-session', data.token);
      setResult(data);
      setStep('done');
    } catch { setError(t('register.network_error')); }
    finally { setLoading(false); }
  }, [code, email, currentTool, useCase, role, painPoint, t]);

  // Login with existing email or original invite code
  const [loginInput, setLoginInput] = useState('');
  const handleLogin = useCallback(async () => {
    if (!loginInput.trim()) return;
    setError('');
    setLoading(true);
    try {
      const val = loginInput.trim();
      const isCode = /^LASCA-[A-Z0-9]{5}$/i.test(val);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isCode ? { code: val.toUpperCase() } : { email: val.toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('register.failed')); return; }
      localStorage.setItem('lasca-session', data.token);
      window.location.href = '/';
    } catch {
      setError(t('register.network_error'));
    } finally {
      setLoading(false);
    }
  }, [loginInput, t]);

  const copyCode = (inviteCode: string, idx: number) => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  // ── Public Google-OAuth flow (default) ────────────────────────────────
  // The legacy invite-code form below is kept verbatim and rendered only when
  // feature_flags.auth_mode === 'invite_legacy'. Toggle from /admin.
  if (authMode === 'google_only') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <GoogleSignInPanel />
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        {step === 'code' && (
          <>
            <h1 style={headingStyle}>Welcome to Lasca Beta</h1>
            <p style={subStyle}>Enter your invitation code to get started.</p>
            {error && <p style={errorStyle}>{error}</p>}
            <input style={inputStyle} placeholder="LASCA-XXXXX" value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleCodeSubmit()} autoFocus />
            <button style={loading ? btnDisabled : btnStyle} disabled={loading || !code.trim()} onClick={handleCodeSubmit}>
              {loading ? 'Verifying...' : 'Continue'}
            </button>
            <button
              onClick={() => { setError(''); setStep('login'); }}
              style={{
                width: '100%', marginTop: 16, padding: '8px 0', fontSize: 13,
                background: 'none', border: 'none', color: MUTED, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('register.already_registered')}
            </button>
          </>
        )}

        {/* Login with existing account */}
        {step === 'login' && (
          <>
            <h1 style={headingStyle}>{t('register.login_title')}</h1>
            <p style={subStyle}>{t('register.login_desc')}</p>
            {error && <p style={errorStyle}>{error}</p>}
            <input
              style={inputStyle}
              placeholder={t('register.login_placeholder')}
              value={loginInput}
              onChange={e => setLoginInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
            <button
              style={loading ? btnDisabled : btnStyle}
              disabled={loading || !loginInput.trim()}
              onClick={handleLogin}
            >
              {loading ? '...' : t('register.login_button')}
            </button>
            <button
              onClick={() => { setError(''); setStep('code'); }}
              style={{
                width: '100%', marginTop: 16, padding: '8px 0', fontSize: 13,
                background: 'none', border: 'none', color: MUTED, cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              {t('register.new_user')}
            </button>
          </>
        )}

        {step === 'survey' && (
          <>
            <h1 style={headingStyle}>Almost there</h1>
            <p style={subStyle}>Tell us a bit about yourself.</p>
            {error && <p style={errorStyle}>{error}</p>}
            <label style={{ fontSize: 13, color: MUTED, marginBottom: 4, display: 'block' }}>Email *</label>
            <input style={inputStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
            <label style={{ fontSize: 13, color: MUTED, marginBottom: 6, display: 'block', marginTop: 12 }}>What do you currently use to make slides?</label>
            <ChipSelect options={['PowerPoint', 'Google Slides', 'Keynote', 'Canva', 'Gamma', 'Other']} selected={currentTool} onChange={setCurrentTool} />
            <label style={{ fontSize: 13, color: MUTED, marginBottom: 6, display: 'block' }}>What do you mainly make slides for?</label>
            <ChipSelect options={['Work presentations', 'Pitch decks', 'Teaching / lectures', 'Personal projects', 'Other']} selected={useCase} onChange={setUseCase} />
            <label style={{ fontSize: 13, color: MUTED, marginBottom: 6, display: 'block' }}>Your role (optional)</label>
            <RadioSelect name="role" options={['Founder', 'Designer', 'Product Manager', 'Engineer', 'Marketing / Sales', 'Student', 'Other']} selected={role} onChange={setRole} />
            <label style={{ fontSize: 13, color: MUTED, marginBottom: 6, display: 'block' }}>Most painful part of making slides? (optional)</label>
            <RadioSelect name="painPoint" options={['Layout and design', 'Organizing content', 'Takes too long', 'Keeping visual consistency', 'Other']} selected={painPoint} onChange={setPainPoint} />
            <p style={{ fontSize: 11, color: MUTED, marginTop: 16, lineHeight: 1.4 }}>By joining, you agree that usage data will be collected during the beta to improve Lasca.</p>
            <button style={loading ? btnDisabled : btnStyle} disabled={loading || !email.trim()} onClick={handleRegister}>{loading ? 'Joining...' : 'Join Beta'}</button>
            <button onClick={() => { setStep('code'); setError(''); }} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 13, cursor: 'pointer', marginTop: 12, width: '100%', textAlign: 'center' }}>Back</button>
          </>
        )}

        {step === 'done' && result && (
          <>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>&#10024;</div>
              <h1 style={{ ...headingStyle, textAlign: 'center' }}>You&apos;re in!</h1>
              <p style={{ ...subStyle, textAlign: 'center' }}>Welcome to the Lasca beta, {result.user.email}</p>
            </div>
            <div style={{ background: `${OCHRE}08`, borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 10 }}>Your invite codes (share with friends):</p>
              {result.inviteCodes.map((c, i) => (
                <div key={c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < result.inviteCodes.length - 1 ? `1px solid ${INPUT_BORDER}` : 'none' }}>
                  <code style={{ fontSize: 15, fontWeight: 600, color: OCHRE, letterSpacing: 1 }}>{c}</code>
                  <button onClick={() => copyCode(c, i)} style={{ background: 'none', border: `1px solid ${INPUT_BORDER}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', color: TEXT }}>{copiedIdx === i ? 'Copied!' : 'Copy'}</button>
                </div>
              ))}
            </div>
            <button style={btnStyle} onClick={() => { window.location.href = '/editor'; }}>Start Creating</button>
          </>
        )}
      </div>
    </div>
  );
}
