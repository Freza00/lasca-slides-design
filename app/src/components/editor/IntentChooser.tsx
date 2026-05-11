'use client';

import type { PdfKind } from '@/lib/import/pdfFaithful';
import { useT } from '@/lib/i18n';

/**
 * Two-choice modal shown when the user uploads a .pptx or .pdf.
 * - Redesign: Lasca strips the content and rebuilds it with its own 8 layouts
 * - Polish:   Lasca preserves the original layout 1:1 and the AI suggests
 *             targeted improvements on top
 *
 * v2.2: PDF is split into two sub-products — 'slide' (PPT-exported 16:9)
 * vs 'report' (letter/a4 portrait). The IntentChooser copy swaps wording
 * accordingly so users immediately understand which product path they're on.
 *
 * Neither option is marked "recommended" — user wants both options to feel
 * equally valid by default.
 */
export type Intent = 'redesign' | 'polish';
export type FileKind = 'pptx' | 'pdf';

interface Props {
  open: boolean;
  fileKind?: FileKind;
  /**
   * Only read when fileKind === 'pdf'. Drives the copy branch between
   * "PPT-exported PDF" and "Report" wording. Defaults to 'report' when
   * the peek fails (conservative: report copy is more generic).
   */
  pdfKind?: PdfKind;
  onChoose: (intent: Intent) => void;
  onCancel: () => void;
}

/** Resolve the i18n key prefix from `fileKind + pdfKind`. */
function resolveCopyPrefix(fileKind: FileKind, pdfKind?: PdfKind): string {
  if (fileKind === 'pptx') return 'intent.pptx';
  // fileKind === 'pdf' → fall into slide/report split, default to report
  // when pdfKind is missing (more generic wording).
  return pdfKind === 'slide' ? 'intent.pdf_slide' : 'intent.pdf_report';
}

export function IntentChooser({ open, fileKind = 'pptx', pdfKind, onChoose, onCancel }: Props) {
  const t = useT();
  if (!open) return null;
  const prefix = resolveCopyPrefix(fileKind, pdfKind);
  const copy = {
    title: t(`${prefix}.title`),
    polishTitle: t(`${prefix}.polish_title`),
    polishDesc: t(`${prefix}.polish_desc`),
    redesignTitle: t(`${prefix}.redesign_title`),
    redesignDesc: t(`${prefix}.redesign_desc`),
  };
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.3)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#faf9f5', borderRadius: 16,
          padding: '28px 32px 24px',
          maxWidth: 520, width: '92%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141413', marginBottom: 4 }}>
          {copy.title}
        </h2>
        <p style={{ fontSize: 12, color: '#b0aea5', marginBottom: 20 }}>
          {t('intent.warning')}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Choice
            icon="✨"
            title={copy.polishTitle}
            desc={copy.polishDesc}
            onClick={() => onChoose('polish')}
          />
          <Choice
            icon="↻"
            title={copy.redesignTitle}
            desc={copy.redesignDesc}
            onClick={() => onChoose('redesign')}
          />
        </div>

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent', border: 'none',
              fontSize: 12, color: '#b0aea5', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('landing.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Choice({
  icon, title, desc, onClick,
}: { icon: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        background: '#fff',
        border: '1px solid #e8e6dc',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: 'inherit',
        transition: 'all 0.15s ease-out',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; }}
    >
      <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#141413', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#b0aea5', lineHeight: 1.5 }}>{desc}</div>
      </div>
    </button>
  );
}
