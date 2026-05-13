'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useEditorStore } from '@/lib/store';
import { LascaBrand } from '@/components/ui/LascaBrand';
import { LascauxBg } from '@/components/ui/LascauxBg';
import { importFile, extractPptxText, textSlidesToMdContext } from '@/lib/importFile';
import { IntentChooser, type Intent, type FileKind } from '@/components/editor/IntentChooser';
import { polishImportedDeck } from '@/lib/ai/pptxPolish';
import { logger, logRemoteEvent } from '@/lib/logger';
import { addToast } from '@/lib/toast';
import { formatFileSize, getImportLimitBytes } from '@/lib/importLimit';
import { useLocale, useT } from '@/lib/i18n';
import type { PdfKind } from '@/lib/import/pdfFaithful';
import { useFlagEnabled, useFlagNumber } from '@/lib/featureFlags';

interface ContentType {
  label: string;
  comingSoon?: boolean;
}

interface Card {
  id: 'generate' | 'optimize' | 'from-content';
  icon: string;
  title: string;
  subtitle: string;
  desc: string;
  contentTypes: ContentType[];
  recommended?: boolean;
}

export function LandingHero() {
  const router = useRouter();
  const addDeck = useEditorStore(s => s.addDeck);
  const deckCount = useEditorStore(s => s.decks.length);
  const addChatMessage = useEditorStore(s => s.addChatMessage);
  const addPolishActions = useEditorStore(s => s.addPolishActions);
  const setPendingImportRedesign = useEditorStore(s => s.setPendingImportRedesign);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingImport, setPendingImport] = useState<
    { file: File; kind: FileKind; pdfKind?: PdfKind } | null
  >(null);
  // Generate chooser modal — asks slide vs report BEFORE entering the editor,
  // so the user knows what they're committing to and we can create a fresh
  // blank deck (not show the leftover DEFAULT_DECK sample slides).
  const [generateChooserOpen, setGenerateChooserOpen] = useState(false);
  const [generateSource, setGenerateSource] = useState<'generate' | 'from-content'>('generate');
  const t = useT();
  const locale = useLocale();
  const importFilesEnabled = useFlagEnabled('import_file', true);
  const importPptxEnabled = useFlagEnabled('import_pptx', true);
  const importPdfEnabled = useFlagEnabled('import_pdf', true);
  const maxImportMb = useFlagNumber('max_import_mb', 0);
  const maxDecks = useFlagNumber('max_decks', 999);

  const guardImportFile = (file: File): boolean => {
    const limitBytes = getImportLimitBytes(maxImportMb);
    if (limitBytes === null || file.size <= limitBytes) return true;
    addToast(
      'warn',
      t('import.file_too_large'),
      t('import.file_too_large_detail', {
        name: file.name,
        size: formatFileSize(file.size),
        limit: formatFileSize(limitBytes),
      }),
    );
    return false;
  };

  // Cards built inside the component so t() has access to the active locale.
  const cards: Card[] = [
    {
      id: 'generate',
      icon: '◇',
      title: t('landing.generate.title'),
      subtitle: t('landing.generate.subtitle'),
      desc: t('landing.generate.desc'),
      // v2.4: Both PPT (slide deck) and Report generation are live.
      contentTypes: [
        { label: t('landing.content_type.ppt') },
        { label: t('landing.content_type.report') },
      ],
    },
    {
      id: 'from-content',
      icon: '✦',
      title: t('landing.from_content.title'),
      subtitle: t('landing.from_content.subtitle'),
      desc: t('landing.from_content.desc'),
      recommended: true,
      contentTypes: [
        { label: t('landing.content_type.ppt') },
        { label: t('landing.content_type.report') },
      ],
    },
    {
      id: 'optimize',
      icon: '❖',
      title: t('landing.optimize.title'),
      subtitle: t('landing.optimize.subtitle'),
      desc: t('landing.optimize.desc'),
      // Both paths already ship: PPTX → pptx-faithful, PDF-report → pdf-faithful.
      contentTypes: [
        { label: t('landing.content_type.ppt') },
        { label: t('landing.content_type.report') },
      ],
    },
  ];

  type ImportOpts = { pptxMode?: 'text' | 'faithful'; pdfMode?: 'text' | 'faithful' };

  const finishImport = async (file: File, opts: ImportOpts = {}) => {
    setLoading(true);
    const isFaithful = opts.pptxMode === 'faithful' || opts.pdfMode === 'faithful';
    try {
      if (!guardImportFile(file)) return;
      if (deckCount >= maxDecks) {
        addToast('warn', t('error.deck_limit'));
        return;
      }
      const result = await importFile(file, opts);
      // v2.2: parsePdfFaithful carries deckPageSize/deckPageWidth/deckPageHeight
      // on the ImportResult directly. Other paths leave these undefined and
      // fall back to slide-16:9.
      // v2.4.2: PDF slides render via a single unified mode (raster bg +
      // editable text overlay), so there's no pdfRenderMode to set.
      addDeck({
        id: 'deck-' + Date.now(),
        name: result.name,
        // Faithful imports start on 'original' (raw source file, no Lasca theme).
        // User can opt into warm/cool/dark from the Toolbar.
        theme: isFaithful ? 'original' : 'warm',
        slides: result.slides,
        sourceMd: result.sourceMd,
        pageSize: result.deckPageSize ?? 'slide-16:9',
        pageWidth: result.deckPageWidth,
        pageHeight: result.deckPageHeight,
      });
      logRemoteEvent('deck_imported', {
        fileType: file.name.split('.').pop()?.toLowerCase() ?? 'unknown',
        mode: isFaithful ? 'faithful' : 'text',
        slideCount: result.slides.length,
        pageSize: result.deckPageSize ?? 'slide-16:9',
      });
      if (result.warning) {
        addChatMessage({
          id: 'msg-' + Date.now(),
          type: 'status',
          text: result.warning,
          timestamp: Date.now(),
        });
      }
      router.push('/editor');
      // Kick off polish in the background; messages will land in chat once user lands in editor.
      // Note: polish prompts are PPTX-specific for now — PDF polish ships in a follow-up.
      if (opts.pptxMode === 'faithful') {
        // v2.4.2: explain the OOXML parser's limits up-front so users
        // don't mistake missing SmartArt/charts for a Lasca bug.
        addChatMessage({
          id: 'msg-' + Date.now() + '-pptxlim',
          type: 'hint',
          text: t('import.pptx_limitations'),
          timestamp: Date.now(),
        });
        addChatMessage({
          id: 'msg-' + Date.now() + '-p',
          type: 'status',
          text: t('import.pptx_checking'),
          timestamp: Date.now(),
        });
        logger.info('ai', 'PPTX polish started', { slideCount: result.slides.length });
        polishImportedDeck(result.slides, undefined, locale).then(({ messages, actions }) => {
          logger.info('ai', 'PPTX polish done', { messageCount: messages.length, actionCount: actions.length });
          messages.forEach(addChatMessage);
          if (actions.length > 0) addPolishActions(actions);
        }).catch(err => {
          logger.error('ai', 'PPTX polish failed', { error: (err as Error).message });
          addToast('warn', t('import.ai_polish_failed'), (err as Error).message);
          addChatMessage({
            id: 'msg-' + Date.now() + '-perr',
            type: 'status',
            text: t('import.ai_polish_failed_msg', { msg: err instanceof Error ? err.message : t('import.unknown_error') }),
            timestamp: Date.now(),
          });
        });
      }
    } catch (err) {
      logger.error('import', 'Import failed (LandingHero)', { error: (err as Error).message });
      addToast('error', err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = async (id: Card['id']) => {
    if (id === 'optimize') {
      if (!importFilesEnabled) {
        addToast('warn', 'Import is disabled by admin.');
        return;
      }

      // Open file picker (same flow as Toolbar.handleImport)
      const accept = ['.html', '.htm', '.lasca', '.json', '.md', '.txt'];
      if (importPptxEnabled) accept.push('.pptx');
      if (importPdfEnabled) accept.push('.pdf');

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept.join(',');
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (!guardImportFile(file)) return;
        const ext = file.name.split('.').pop()?.toLowerCase();
        if (ext === 'pptx') {
          if (!importPptxEnabled) {
            addToast('warn', 'PPTX import is disabled by admin.');
            return;
          }
          setPendingImport({ file, kind: 'pptx' });
        } else if (ext === 'pdf') {
          if (!importPdfEnabled) {
            addToast('warn', 'PDF import is disabled by admin.');
            return;
          }
          // PDF → heuristic spatial matching, zero AI
          finishImport(file, { pdfMode: 'text' });
        } else {
          finishImport(file);
        }
      };
      logRemoteEvent('import_picker_opened', { source: 'landing' });
      input.click();
      return;
    }

    if (id === 'generate') {
      logRemoteEvent('create_flow_opened', { source: 'landing' });
      setGenerateSource('generate');
      setGenerateChooserOpen(true);
      return;
    }

    if (id === 'from-content') {
      logRemoteEvent('create_flow_opened', { source: 'landing', mode: 'full-content' });
      setGenerateSource('from-content');
      setGenerateChooserOpen(true);
      return;
    }
  };

  // Route to the /create page instead of directly into the editor.
  // Deck creation now happens in CreateFlow after the user finishes
  // the Q&A + md-context card flow.
  const handleGenerateSlide = () => {
    setGenerateChooserOpen(false);
    const mode = generateSource === 'from-content' ? '&mode=full-content' : '';
    logRemoteEvent('create_mode_selected', { format: 'slide', source: 'landing', mode: generateSource });
    router.push(`/create?type=slide${mode}`);
  };

  const handleGenerateReport = () => {
    setGenerateChooserOpen(false);
    const mode = generateSource === 'from-content' ? '&mode=full-content' : '';
    logRemoteEvent('create_mode_selected', { format: 'report', source: 'landing', mode: generateSource });
    router.push(`/create?type=report${mode}`);
  };

  const handleIntentChosen = async (intent: Intent) => {
    if (!pendingImport) return;
    const { file, kind } = pendingImport;
    setPendingImport(null);

    if (intent === 'polish') {
      // Faithful path — goes to editor directly (unchanged)
      finishImport(file, kind === 'pptx' ? { pptxMode: 'faithful' } : { pdfMode: 'faithful' });
      return;
    }

    // ── Redesign: extract text → build mdContext → /create step 4 ──
    setLoading(true);
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      let textSlides: { title: string; body: string }[];

      if (kind === 'pptx') {
        textSlides = await extractPptxText(file);
      } else {
        // PDF: use parsePdfToSlides text extraction
        const { parsePdfToSlides } = await import('@/lib/import/pdfFaithful');
        const pdfSlides = await parsePdfToSlides(file);
        textSlides = pdfSlides.map((s, i) => ({
          title: (s.data as Record<string, string>).title || `Page ${i + 1}`,
          body: (s.data as Record<string, unknown>).left
            ? ((s.data as Record<string, Record<string, string>>).left?.content || '')
            : ((s.data as Record<string, string>).body || ''),
        }));
      }

      if (textSlides.length === 0) throw new Error(t('import.no_text'));

      const mdContext = textSlidesToMdContext(textSlides, baseName);
      setPendingImportRedesign({ mdContext, fileName: baseName });
      router.push('/create?type=slide&step=style-pick');
    } catch (err) {
      addToast('error', t('import.text_failed', { msg: (err as Error).message }));
      logger.error('import', 'redesign text extraction failed', { error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      overflowY: 'auto',
      background: '#f0efeb',
      fontFamily: "'Poppins', 'Noto Sans SC', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      <LascauxBg mode="calm" />
      {/* Top bar */}
      <div style={{
        height: 60, display: 'flex', alignItems: 'center',
        padding: '0 32px', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <LascaBrand variant="full" size={22} />
          <span style={{ fontSize: 11, color: '#b0aea5' }}>v1.2</span>
        </div>
        <button
          onClick={() => router.push('/editor')}
          style={{
            background: 'transparent', border: 'none',
            fontSize: 12, color: '#b0aea5', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#d97757')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#b0aea5')}
        >
          {t('landing.enter_editor')}
        </button>
      </div>

      {/* Hero */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 32px',
      }}>
        {/* Bling headline — animated gradient + shimmer + sparkles */}
        <div style={{
          position: 'relative', marginBottom: 16, textAlign: 'center',
          display: 'inline-block',
        }}>
          {/* v2.4 halo/breathing fix: NO background elements.
              All glow lives on the h1 itself. text-shadow carries the 2.8s
              breathing pulse; filter drop-shadow handles sweep + flash on
              the 9s lascaShine cycle. This is how the prototype does it
              (files/slide-editor-v4.html) — text is the only thing that
              can glow, so there's no rectangular blob artifact. */}
          {/* Sparkles — synchronized with text flash */}
          <span style={{
            position: 'absolute', top: '-8px', left: '-24px',
            fontSize: 22, animation: 'lascaSparkleA 9s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            zIndex: 2, pointerEvents: 'none',
          }}>✦</span>
          <span style={{
            position: 'absolute', top: '14px', right: '-32px',
            fontSize: 28, animation: 'lascaSparkleB 9s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            zIndex: 2, pointerEvents: 'none',
          }}>✧</span>
          <span style={{
            position: 'absolute', bottom: '0px', left: '50%', marginLeft: '-120px',
            fontSize: 16, animation: 'lascaSparkleA 9s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            zIndex: 2, pointerEvents: 'none',
          }}>✦</span>
          {/* All-warm gradient (no white) — text always readable, shimmer subtle.
              Two composed animations on the same element:
                lascaShine    9s → sweep flare + flash burst via filter drop-shadow
                lascaBreathe  2.8s → continuous warmth via text-shadow (independent CSS property) */}
          <h1 className="landing-headline" style={{
            position: 'relative',
            fontSize: 68, fontWeight: 800,
            letterSpacing: '-2px',
            lineHeight: 1.1,
            background: 'linear-gradient(100deg, #c95f3b 0%, #d97757 30%, #f4b88c 50%, #d97757 70%, #c95f3b 100%)',
            backgroundSize: '200% 100%',
            backgroundPosition: '50% 50%',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            animation: 'lascaShine 9s ease-in-out infinite',
            zIndex: 1,
          }}>
            Let your content shine
          </h1>
        </div>
        {/* Keyframes — shimmer sweep at start, long readable rest, brief flash.
            Rest-phase drop-shadow is intentionally faint; the breathing layer
            (lascaBreathe) carries the "alive" signal during 10-78%. */}
        <style>{`
          @keyframes lascaShine {
            /* Rest = position 0%: the brightest gradient stop (#f4b88c)
               sits at the far RIGHT edge of the text, not centered on "con".
               With background-size 200%, position 0% shows the left half
               of the gradient (dark → warm → bright-at-edge), which reads
               as a smooth directional tint, not a hotspot. */
            0%, 3% {
              background-position: 0% 50%;
              filter: none;
            }
            /* Sweep start: filter glow fades in while position holds */
            7% {
              background-position: 0% 50%;
              filter: drop-shadow(0 2px 18px rgba(244,184,140,0.35));
            }
            /* Sweep traverse: bright peak sweeps right→left across the text */
            14% {
              background-position: 100% 50%;
              filter: drop-shadow(0 3px 24px rgba(244,184,140,0.55));
            }
            /* Ease back to rest position over ~0.7s */
            22% {
              background-position: 0% 50%;
              filter: none;
            }
            /* Long readable rest — absolutely clean */
            24%, 78% {
              background-position: 0% 50%;
              filter: none;
            }
            /* Flash burst — pure filter effect, NO position shift */
            83% {
              background-position: 0% 50%;
              filter: drop-shadow(0 0 28px rgba(244,184,140,0.85)) drop-shadow(0 0 50px rgba(244,217,164,0.4)) brightness(1.18);
            }
            /* Ease out of flash */
            88% {
              background-position: 0% 50%;
              filter: drop-shadow(0 2px 16px rgba(217,119,87,0.16));
            }
            /* Back to exact rest — matches 0% for clean seam */
            100% {
              background-position: 0% 50%;
              filter: none;
            }
          }
          /* lascaBreathe removed in v2.4 — user wants the rest phase to be
             absolutely clean (no text-shadow at all). All glow effects are
             contained inside lascaShine's sweep + flash phases only. */
          @keyframes lascaSparkleA {
            0%, 3%, 24%, 78%, 100% { opacity: 0.12; transform: scale(0.85); color: #d97757; }
            7%                     { opacity: 0.42; transform: scale(1.1);  color: #f4b88c; }
            14%                    { opacity: 0.72; transform: scale(1.2);  color: #f4b88c; }
            19%                    { opacity: 0.25; transform: scale(0.95); color: #d97757; }
            83%                    { opacity: 0.95; transform: scale(1.4);  color: #f4d9a4; }
          }
          @keyframes lascaSparkleB {
            0%, 3%, 24%, 78%, 100% { opacity: 0.12; transform: scale(0.9);  color: #e8a87c; }
            7%                     { opacity: 0.38; transform: scale(1.08); color: #f4b88c; }
            14%                    { opacity: 0.62; transform: scale(1.15); color: #f4b88c; }
            19%                    { opacity: 0.22; transform: scale(0.98); color: #e8a87c; }
            83%                    { opacity: 0.95; transform: scale(1.45); color: #f4d9a4; }
          }
        `}</style>
        <p style={{
          fontSize: 18, color: '#b0aea5', marginBottom: 64,
          textAlign: 'center', maxWidth: 560, lineHeight: 1.6,
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            flexWrap: 'wrap',
            columnGap: 6,
            rowGap: 0,
          }}>
            <span>{t('landing.hero_desc_before_brand')}</span>
            <LascaBrand
              variant="full"
              size={18}
              className={locale === 'zh' ? 'landing-hero-brand-zh' : 'landing-hero-brand-en'}
            />
            <span>{t('landing.hero_desc_after_brand')}</span>
          </span>
          <br />
          {t('landing.hero_desc2')}
        </p>
        <style>{`
          .landing-hero-brand-en {
            transform: translateY(1px);
          }
          .landing-hero-brand-zh {
            transform: translateY(1px);
          }
        `}</style>

        {/* 66s demo video — Remotion-rendered, autoplay muted loop.
            Sits between the hero copy and the action cards so visitors
            see what Lasca does before choosing a path. */}
        <div
          style={{
            width: '100%',
            maxWidth: 960,
            aspectRatio: '16 / 9',
            marginBottom: 40,
            borderRadius: 14,
            overflow: 'hidden',
            background: '#f5f5f0',
            boxShadow: '0 18px 60px rgba(20,20,19,0.12)',
            position: 'relative',
          }}
        >
          <video
            src="/demo/lasca-demo.webm"
            poster="/demo/lasca-demo-thumbnail.png"
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            aria-label="66-second Lasca product demo"
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>

        {/* Two large cards — 一键生成 / 一键优化.
            Content-type pills at the bottom of each card show PPT + 报告
            support; 报告 under 生成 is marked "即将上线" (see CARDS def). */}
        <div className="landing-cards-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 20,
          maxWidth: 960,
          width: '100%',
        }}>
          {cards.map(card => {
            const isHovered = hoveredId === card.id;
            const isRecommended = card.recommended;
            return (
              <div
                key={card.id}
                onClick={() => !loading && handleCardClick(card.id)}
                onMouseEnter={() => setHoveredId(card.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  position: 'relative',
                  background: '#faf9f5',
                  borderRadius: 14,
                  padding: '28px 22px',
                  border: isHovered
                    ? '2px solid #d97757'
                    : isRecommended
                      ? '2px solid #f0d7c4'
                      : '2px solid #e8e6dc',
                  cursor: loading ? 'wait' : 'pointer',
                  transition: 'all 0.2s ease-out',
                  transform: isHovered ? 'translateY(-4px)' : 'translateY(0)',
                  boxShadow: isHovered ? '0 12px 32px rgba(217,119,87,0.12)' : '0 2px 6px rgba(0,0,0,0.04)',
                  display: 'flex', flexDirection: 'column',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {/* "推荐" badge */}
                {isRecommended && (
                  <span style={{
                    position: 'absolute', top: 14, right: 16,
                    fontSize: 11, fontWeight: 600,
                    color: '#d97757', background: '#fdf4ef',
                    padding: '3px 10px', borderRadius: 999,
                    border: '1px solid #f0d7c4',
                  }}>
                    {t('landing.recommended')}
                  </span>
                )}
                <div style={{
                  fontSize: 28,
                  color: '#d97757',
                  marginBottom: 16,
                  fontWeight: 300,
                }}>
                  {card.icon}
                </div>
                <h3 style={{
                  fontSize: 18, fontWeight: 700, color: '#141413',
                  marginBottom: 4,
                }}>
                  {card.title}
                </h3>
                <p style={{
                  fontSize: 13, color: '#d97757', fontWeight: 500,
                  marginBottom: 8,
                }}>
                  {card.subtitle}
                </p>
                <p style={{
                  fontSize: 13, color: '#b0aea5',
                  lineHeight: 1.6, flex: 1, marginBottom: 20,
                }}>
                  {card.desc}
                </p>
                {/* Content-type pills — show what formats this action supports */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {card.contentTypes.map(ct => (
                    <span
                      key={ct.label}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 11,
                        fontWeight: 500,
                        padding: '4px 10px',
                        borderRadius: 999,
                        background: ct.comingSoon ? '#f0efeb' : '#fdf4ef',
                        color: ct.comingSoon ? '#b0aea5' : '#d97757',
                        border: ct.comingSoon ? '1px solid #e8e6dc' : '1px solid #f0d7c4',
                      }}
                    >
                      {ct.label}
                      {ct.comingSoon && (
                        <span style={{ fontSize: 9, opacity: 0.85 }}>· {t('landing.coming_soon')}</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <p style={{
          fontSize: 11, color: '#b0aea5', marginTop: 48, textAlign: 'center',
        }}>
          {loading ? t('landing.importing') : t('landing.features')}
        </p>
      </div>

      <IntentChooser
        open={pendingImport !== null}
        fileKind={pendingImport?.kind ?? 'pptx'}
        pdfKind={pendingImport?.pdfKind}
        onChoose={handleIntentChosen}
        onCancel={() => setPendingImport(null)}
      />

      {/* Generate chooser — slide deck vs report. Both options are live; they
          route into /create with `type=slide` or `type=report`. Mirrors the
          visual language of IntentChooser for consistency. */}
      {generateChooserOpen && (
        <div
          onClick={() => setGenerateChooserOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(20,20,19,0.35)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
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
              {t('landing.generate_what')}
            </h2>
            <p style={{ fontSize: 12, color: '#b0aea5', marginBottom: 20 }}>
              {t('landing.generate_what_subtitle')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Slide deck — live */}
              <button
                onClick={handleGenerateSlide}
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
                <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>✦</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#141413', marginBottom: 4 }}>
                    {t('landing.slide_deck')}
                  </div>
                  <div style={{ fontSize: 12, color: '#b0aea5', lineHeight: 1.5 }}>
                    {t('landing.slide_deck_desc')}
                  </div>
                </div>
              </button>

              {/* Report — live; creates a letter-pageSize deck */}
              <button
                onClick={handleGenerateReport}
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
                <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }}>▤</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#141413', marginBottom: 4 }}>
                    {t('landing.report_letter')}
                  </div>
                  <div style={{ fontSize: 12, color: '#b0aea5', lineHeight: 1.5 }}>
                    {t('landing.report_desc')}
                  </div>
                </div>
              </button>
            </div>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <button
                onClick={() => setGenerateChooserOpen(false)}
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
      )}
    </div>
  );
}
