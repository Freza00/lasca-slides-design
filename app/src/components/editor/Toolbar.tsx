'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { downloadLasca } from '@/lib/exportLasca';
import { downloadJson } from '@/lib/exportJson';
import { exportPdf } from '@/lib/exportPdf';
import { formatFileSize, getImportLimitBytes } from '@/lib/importLimit';
import { importFile, extractPptxText, textSlidesToMdContext } from '@/lib/importFile';
import { polishImportedDeck } from '@/lib/ai/pptxPolish';
import type { Theme } from '@/lib/types';
import type { PdfKind } from '@/lib/import/pdfFaithful';
import { IntentChooser, type Intent, type FileKind } from './IntentChooser';
import { TEXTURE_VARIANTS, AMBIENT_VARIANTS } from '@/lib/themes';
import { BASE_THEMES, BRAND_THEMES, SCENE_GROUPS, getSignature } from '@/lib/themeCatalog';
import { addToast } from '@/lib/toast';
import { useT, useLocale } from '@/lib/i18n';
import { useFlagEnabled, useFlagNumber } from '@/lib/featureFlags';
import { logRemoteEvent } from '@/lib/logger';

const btnStyle: React.CSSProperties = {
  padding: '5px 10px', fontSize: 13, background: '#fff', border: '1px solid #e8e6dc',
  borderRadius: 6, cursor: 'pointer', color: '#141413', fontWeight: 400,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontFamily: 'inherit',
};

function DropdownItem({
  onClick,
  label,
  desc,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  desc: string;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => {
        if (!disabled) onClick();
      }}
      onMouseEnter={() => {
        if (!disabled) setHover(true);
      }}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '8px 14px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#b0aea5' : '#141413', background: hover ? '#f5f4ef' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, transition: 'background 0.1s', opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 10, color: '#b0aea5' }}>{desc}</span>
    </div>
  );
}

export function Toolbar() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const deck = useEditorStore(s => s.activeDeck());
  const deckCount = useEditorStore(s => s.decks.length);
  const currentIndex = useEditorStore(s => s.currentIndex);
  const setCurrentIndex = useEditorStore(s => s.setCurrentIndex);
  const removeSlide = useEditorStore(s => s.removeSlide);
  const addDeck = useEditorStore(s => s.addDeck);
  const setPendingImportRedesign = useEditorStore(s => s.setPendingImportRedesign);
  const setTheme = useEditorStore(s => s.setTheme);
  const setDeckTexture = useEditorStore(s => s.setDeckTexture);
  const setDeckTextureVariant = useEditorStore(s => s.setDeckTextureVariant);
  const setDeckAmbient = useEditorStore(s => s.setDeckAmbient);
  const setDeckAmbientVariant = useEditorStore(s => s.setDeckAmbientVariant);
  const setDeckPresetId = useEditorStore(s => s.setDeckPresetId);
  const textureOn = deck.texture !== false;
  const ambientOn = deck.ambient !== false;
  const importFilesEnabled = useFlagEnabled('import_file', true);
  const importPptxEnabled = useFlagEnabled('import_pptx', true);
  const importPdfEnabled = useFlagEnabled('import_pdf', true);
  const exportEnabled = useFlagEnabled('export_enabled', true);
  const exportLascaEnabled = useFlagEnabled('export_lasca_enabled', false);
  const maxImportMb = useFlagNumber('max_import_mb', 0);
  const maxDecks = useFlagNumber('max_decks', 999);

  // Texture variant dropdown state
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  const variantMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!variantMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!variantMenuRef.current?.contains(e.target as Node)) setVariantMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [variantMenuOpen]);

  // Ambient variant dropdown state
  const [ambientMenuOpen, setAmbientMenuOpen] = useState(false);
  const ambientMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ambientMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!ambientMenuRef.current?.contains(e.target as Node)) setAmbientMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ambientMenuOpen]);

  // Signature (theme) picker dropdown state — mirrors create flow's StylePicker
  // but in a compact 3×4 grid so it fits alongside the Texture/Ambient pills.
  const [signatureMenuOpen, setSignatureMenuOpen] = useState(false);
  const signatureMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!signatureMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!signatureMenuRef.current?.contains(e.target as Node)) setSignatureMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [signatureMenuOpen]);

  // Active theme's variants — original has no variants so we fall back to warm
  const activeVariantTheme: Theme = deck.theme === 'original' ? 'warm' : deck.theme;
  const activeVariantList = TEXTURE_VARIANTS[activeVariantTheme];
  const activeVariantId = deck.textureVariant?.[activeVariantTheme] ?? activeVariantList[0]?.id ?? 'grid';
  // Ambient variant tracking (parallel to texture)
  const activeAmbientList = AMBIENT_VARIANTS[activeVariantTheme];
  const activeAmbientId = deck.ambientVariant?.[activeVariantTheme] ?? activeAmbientList[0]?.id ?? 'pulse';

  const slides = deck.slides;

  const guardImportFile = useCallback((file: File): boolean => {
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
  }, [maxImportMb, t]);

  // Export dropdown state
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // N1 — .lasca export option: inline Google Fonts as base64 so the file
  // renders offline. Off by default; the user opts in per export.
  const [inlineLascaFonts, setInlineLascaFonts] = useState(false);
  const [lascaExporting, setLascaExporting] = useState(false);

  // PDF export progress
  const [pdfExporting, setPdfExporting] = useState(false);
  const [pdfProgress, setPdfProgress] = useState('');

  const handlePdfExport = useCallback(async () => {
    if (!exportEnabled) {
      addToast('warn', 'Export is disabled by admin.');
      return;
    }
    setExportOpen(false);
    setPdfExporting(true);
    setPdfProgress(t('toolbar.pdf_preparing'));
    try {
      await exportPdf(deck, (current, total) => {
        setPdfProgress(`${current}/${total}`);
      });
      logRemoteEvent('export_pdf', { slideCount: deck.slides.length });
    } catch (err) {
      addToast('error', t('toolbar.pdf_export_failed'), String(err));
    } finally {
      setPdfExporting(false);
      setPdfProgress('');
    }
  }, [deck, exportEnabled, t]);

  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!exportRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [exportOpen]);


  const moveSlide = (idx: number, dir: number) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= slides.length) return;
    const newSlides = [...slides];
    [newSlides[idx], newSlides[newIdx]] = [newSlides[newIdx], newSlides[idx]];
    useEditorStore.getState().replaceAllSlides(newSlides);
    setCurrentIndex(newIdx);
  };

  const insertTextBox = () => {
    window.dispatchEvent(new CustomEvent('lasca:insert-textbox'));
  };

  const insertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        window.dispatchEvent(new CustomEvent('lasca:insert-image', { detail: { src: reader.result } }));
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  // Pending import file waiting for an intent choice (pptx or pdf).
  // For PDFs we also stash the peeked `pdfKind` so the IntentChooser can
  // show the right copy ("PPT-exported PDF" vs "Report") before the full
  // parse runs.
  const [pendingImport, setPendingImport] = useState<
    { file: File; kind: FileKind; pdfKind?: PdfKind } | null
  >(null);
  const addChatMessage = useEditorStore(s => s.addChatMessage);
  const addPolishActions = useEditorStore(s => s.addPolishActions);

  type ImportOpts = { pptxMode?: 'text' | 'faithful'; pdfMode?: 'text' | 'faithful' };

  const finishImport = useCallback(async (file: File, opts: ImportOpts = {}) => {
    const isFaithful = opts.pptxMode === 'faithful' || opts.pdfMode === 'faithful';
    try {
      if (!guardImportFile(file)) return;
      if (deckCount >= maxDecks) {
        addToast('warn', t('error.deck_limit'));
        return;
      }
      const result = await importFile(file, opts);
      // v2.2: parsePdfFaithful carries deckPageSize / deckPageWidth /
      // deckPageHeight on ImportResult. Other paths leave them undefined
      // → deck falls back to 'slide-16:9'.
      // v2.4.2: PDF slides render via a single unified mode (raster bg +
      // editable text overlay), so there's no pdfRenderMode to set.
      addDeck({
        id: 'deck-' + Date.now(),
        name: result.name,
        // Faithful imports start on 'original' so the first view matches
        // the source file byte-for-byte. Text-only imports inherit the
        // current theme so Lasca's native layouts stay consistent.
        theme: isFaithful ? 'original' : deck.theme,
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
      // AI polish is currently PPTX-specific (prompts reference pptx terminology).
      // PDF polish will arrive in a follow-up with its own prompt.
      if (opts.pptxMode === 'faithful') {
        // v2.4.2: hint users up-front about the OOXML parser's limits so
        // they don't mistake missing SmartArt/charts for a Lasca bug, and
        // suggest the PPT→PDF workaround for pixel-perfect fidelity.
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
        polishImportedDeck(result.slides, undefined, locale).then(({ messages, actions }) => {
          messages.forEach(addChatMessage);
          if (actions.length > 0) addPolishActions(actions);
        }).catch(err => {
          addChatMessage({
            id: 'msg-' + Date.now() + '-perr',
            type: 'status',
            text: t('import.ai_polish_failed_msg', { msg: err instanceof Error ? err.message : t('import.unknown_error') }),
            timestamp: Date.now(),
          });
        });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Import failed');
    }
  }, [
    addChatMessage,
    addDeck,
    addPolishActions,
    deck.theme,
    deckCount,
    guardImportFile,
    locale,
    maxDecks,
    t,
  ]);

  // Listen for drag-drop file imports from Editor.tsx
  useEffect(() => {
    const handler = (e: Event) => {
      const file = (e as CustomEvent).detail?.file as File | undefined;
      if (!file) return;
      if (!guardImportFile(file)) return;
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'pptx') {
        setPendingImport({ file, kind: 'pptx' });
      } else if (ext === 'pdf') {
        finishImport(file, { pdfMode: 'text' });
      } else {
        finishImport(file);
      }
    };
    window.addEventListener('lasca:import-file', handler);
    return () => window.removeEventListener('lasca:import-file', handler);
  }, [finishImport, guardImportFile]);

  const handleImport = () => {
    if (!importFilesEnabled) {
      addToast('warn', 'Import is disabled by admin.');
      return;
    }

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
    logRemoteEvent('import_picker_opened');
    input.click();
  };

  const handleIntentChosen = async (intent: Intent) => {
    if (!pendingImport) return;
    const { file, kind } = pendingImport;
    setPendingImport(null);

    if (intent === 'polish') {
      // Faithful path — stays in editor (unchanged)
      finishImport(file, kind === 'pptx' ? { pptxMode: 'faithful' } : { pdfMode: 'faithful' });
      return;
    }

    // ── Redesign: extract text → build mdContext → /create step 4 ──
    try {
      const baseName = file.name.replace(/\.[^.]+$/, '');
      let textSlides: { title: string; body: string }[];

      if (kind === 'pptx') {
        textSlides = await extractPptxText(file);
      } else {
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
      router.push('/create?type=slide&step=style-pick&from=editor');
    } catch (err) {
      addToast('error', t('import.text_failed', { msg: (err as Error).message }));
    }
  };

  return (
    <div style={{
      height: 48, background: '#faf9f5', borderBottom: '1px solid #e8e6dc',
      display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, flexShrink: 0,
    }}>
      {/* Undo/Redo — with press feedback + toast */}
      <button
        onClick={(e) => {
          window.dispatchEvent(new CustomEvent('lasca:undo'));
          addToast('info', t('toolbar.undone'));
          const btn = e.currentTarget;
          btn.style.transform = 'scale(0.9)';
          btn.style.background = '#f0efeb';
          setTimeout(() => { btn.style.transform = ''; btn.style.background = ''; }, 120);
        }}
        style={{ ...btnStyle, transition: 'transform 0.1s, background 0.1s' }}
        title={t('toolbar.undo')}
      >↩</button>
      <button
        onClick={(e) => {
          window.dispatchEvent(new CustomEvent('lasca:redo'));
          addToast('info', t('toolbar.redone'));
          const btn = e.currentTarget;
          btn.style.transform = 'scale(0.9)';
          btn.style.background = '#f0efeb';
          setTimeout(() => { btn.style.transform = ''; btn.style.background = ''; }, 120);
        }}
        style={{ ...btnStyle, transition: 'transform 0.1s, background 0.1s' }}
        title={t('toolbar.redo')}
      >↪</button>

      <div style={{ width: 1, height: 20, background: '#e8e6dc', margin: '0 4px' }} />

      {/* Slide management */}
      <button
        onClick={() => moveSlide(currentIndex, -1)}
        disabled={currentIndex === 0}
        style={{ ...btnStyle, opacity: currentIndex === 0 ? 0.3 : 1 }}
        title={t('toolbar.move_up')}
      >↑</button>
      <button
        onClick={() => moveSlide(currentIndex, 1)}
        disabled={currentIndex === slides.length - 1}
        style={{ ...btnStyle, opacity: currentIndex === slides.length - 1 ? 0.3 : 1 }}
        title={t('toolbar.move_down')}
      >↓</button>
      <button
        onClick={() => removeSlide(currentIndex)}
        disabled={slides.length <= 1}
        style={{ ...btnStyle, opacity: slides.length <= 1 ? 0.3 : 1 }}
        title={t('toolbar.delete_page')}
      >🗑</button>
      <button onClick={insertImage} style={btnStyle} title={t('toolbar.insert_image')}>🖼</button>
      <button onClick={insertTextBox} style={btnStyle} title={t('toolbar.insert_textbox')}>T</button>

      <div style={{ flex: 1 }} />

      {/* Page info */}
      <span style={{ fontSize: 13, color: '#b0aea5', whiteSpace: 'nowrap', flexShrink: 0 }}>{currentIndex + 1} / {slides.length}</span>

      {/* Theme switcher — Texture · Ambient · Original (when PPTX-faithful) · Signature */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 8px' }}>
        {/* 原样 pill — only meaningful when deck has at least one pptx-faithful slide */}
        {slides.some(s => s.layout === 'pptx-faithful') && (() => {
          const active = deck.theme === 'original';
          return (
            <button
              onClick={() => { setTheme('original'); setDeckPresetId(undefined); }}
              style={{
                height: 22,
                padding: '0 10px',
                borderRadius: 11,
                background: active ? '#141413' : '#fff',
                color: active ? '#fff' : '#141413',
                border: active ? '1px solid #141413' : '1px solid #e8e6dc',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease-out',
                whiteSpace: 'nowrap',
              }}
              title={t('toolbar.original_tooltip')}
            >
              {t('toolbar.original')}
            </button>
          );
        })()}
        {/* 底纹 (Texture) — split pill: left = on/off toggle, right = variant menu */}
        <div ref={variantMenuRef} style={{ position: 'relative', marginRight: 3, display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setDeckTexture(!textureOn)}
            title={textureOn ? `${t('toolbar.texture_on')} · ${t('toolbar.texture_current')}: ${activeVariantList.find(v => v.id === activeVariantId)?.label[locale] ?? ''}` : t('toolbar.texture_off')}
            style={{
              height: 22,
              padding: '0 8px 0 10px',
              borderTopLeftRadius: 11,
              borderBottomLeftRadius: 11,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
              background: textureOn ? '#141413' : '#fff',
              color: textureOn ? '#fff' : '#141413',
              borderTop: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderBottom: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderLeft: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderRight: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease-out',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span style={{
              display: 'inline-block',
              width: 6, height: 6, borderRadius: '2px',
              background: textureOn ? '#a89372' : '#b0aea5',
              transition: 'all 0.2s',
            }} />
            {t('toolbar.texture')}
          </button>
          <button
            onClick={() => setVariantMenuOpen(o => !o)}
            disabled={!textureOn}
            title={t('toolbar.texture_select')}
            style={{
              height: 22,
              padding: '0 6px',
              borderTopLeftRadius: 0,
              borderBottomLeftRadius: 0,
              borderTopRightRadius: 11,
              borderBottomRightRadius: 11,
              background: textureOn ? '#141413' : '#fff',
              color: textureOn ? '#fff' : '#b0aea5',
              borderTop: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderBottom: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderRight: textureOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderLeft: textureOn ? '1px solid rgba(255,255,255,0.18)' : '1px solid #e8e6dc',
              fontSize: 9,
              fontWeight: 600,
              cursor: textureOn ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease-out',
              opacity: textureOn ? 1 : 0.5,
            }}
          >
            ▾
          </button>
          {variantMenuOpen && textureOn && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: '#fff',
              border: '1px solid #e8e6dc',
              borderRadius: 6,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
              padding: 4,
              minWidth: 120,
              zIndex: 100,
            }}>
              <div style={{ fontSize: 10, color: '#b0aea5', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {deck.theme === 'warm' ? t('toolbar.theme_warm') : deck.theme === 'cool' ? t('toolbar.theme_cool') : deck.theme === 'dark' ? t('toolbar.theme_dark') : t('toolbar.theme_warm')} · {t('toolbar.texture')}
              </div>
              {activeVariantList.map(v => {
                const active = v.id === activeVariantId;
                return (
                  <div
                    key={v.id}
                    onClick={() => {
                      setDeckTextureVariant(activeVariantTheme, v.id);
                      setVariantMenuOpen(false);
                    }}
                    style={{
                      padding: '6px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                      borderRadius: 4,
                      background: active ? '#f5f4ef' : 'transparent',
                      color: '#141413',
                      fontWeight: active ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#faf9f5'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 8, height: 8, borderRadius: '50%',
                      background: active ? '#d97757' : 'transparent',
                      border: active ? 'none' : '1px solid #e8e6dc',
                    }} />
                    {v.label[locale]}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* 氛围 (Ambience) — split pill: left = on/off, right = variant menu */}
        <div ref={ambientMenuRef} style={{ position: 'relative', marginRight: 4, display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => setDeckAmbient(!ambientOn)}
            title={ambientOn ? `${t('toolbar.ambient_on')} · ${t('toolbar.texture_current')}: ${activeAmbientList.find(v => v.id === activeAmbientId)?.label[locale] ?? ''}` : t('toolbar.ambient_off')}
            style={{
              height: 22, padding: '0 8px 0 10px',
              borderTopLeftRadius: 11, borderBottomLeftRadius: 11,
              borderTopRightRadius: 0, borderBottomRightRadius: 0,
              background: ambientOn ? '#141413' : '#fff',
              color: ambientOn ? '#fff' : '#141413',
              borderTop: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderBottom: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderLeft: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderRight: 'none',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              transition: 'all 0.15s ease-out', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: ambientOn ? '#e89968' : '#b0aea5',
              boxShadow: ambientOn ? '0 0 6px rgba(232,153,104,0.8)' : 'none',
              transition: 'all 0.2s',
            }} />
            {t('toolbar.ambient')}
          </button>
          <button
            onClick={() => setAmbientMenuOpen(o => !o)}
            disabled={!ambientOn}
            title={t('toolbar.ambient_select')}
            style={{
              height: 22, padding: '0 6px',
              borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
              borderTopRightRadius: 11, borderBottomRightRadius: 11,
              background: ambientOn ? '#141413' : '#fff',
              color: ambientOn ? '#fff' : '#b0aea5',
              borderTop: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderBottom: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderRight: ambientOn ? '1px solid #141413' : '1px solid #e8e6dc',
              borderLeft: ambientOn ? '1px solid rgba(255,255,255,0.18)' : '1px solid #e8e6dc',
              fontSize: 9, fontWeight: 600,
              cursor: ambientOn ? 'pointer' : 'not-allowed',
              fontFamily: 'inherit', transition: 'all 0.15s ease-out',
              opacity: ambientOn ? 1 : 0.5,
            }}
          >
            ▾
          </button>
          {ambientMenuOpen && ambientOn && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: '#fff', border: '1px solid #e8e6dc', borderRadius: 6,
              boxShadow: '0 4px 14px rgba(0,0,0,0.12)', padding: 4,
              minWidth: 140, zIndex: 100,
            }}>
              <div style={{ fontSize: 10, color: '#b0aea5', padding: '4px 8px 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {deck.theme === 'warm' ? t('toolbar.theme_warm') : deck.theme === 'cool' ? t('toolbar.theme_cool') : deck.theme === 'dark' ? t('toolbar.theme_dark') : t('toolbar.theme_warm')} · {t('toolbar.ambient')}
              </div>
              {activeAmbientList.map(v => {
                const active = v.id === activeAmbientId;
                return (
                  <div
                    key={v.id}
                    onClick={() => { setDeckAmbientVariant(activeVariantTheme, v.id); setAmbientMenuOpen(false); }}
                    title={v.desc[locale]}
                    style={{
                      padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderRadius: 4,
                      background: active ? '#f5f4ef' : 'transparent', color: '#141413',
                      fontWeight: active ? 600 : 400,
                      display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#faf9f5'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? '#f5f4ef' : 'transparent'; }}
                  >
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: active ? '#e89968' : 'transparent',
                      border: active ? 'none' : '1px solid #e8e6dc',
                    }} />
                    {v.label[locale]}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Style picker — single Style control for all 11 themes,
            split into BASE (3) + PREMIUM (3 Analyst) + PRO (8 Brand) sections to mirror StylePicker. */}
        <div ref={signatureMenuRef} style={{ position: 'relative' }}>
          {(() => {
            const active = getSignature(deck.theme) ?? BASE_THEMES[0];
            return (
              <button
                onClick={() => setSignatureMenuOpen(o => !o)}
                title={`${active.name[locale]} · ${active.philosophy[locale]}`}
                style={{
                  height: 22, padding: '0 10px 0 6px',
                  borderRadius: 11,
                  background: signatureMenuOpen ? '#141413' : '#fff',
                  color: signatureMenuOpen ? '#fff' : '#141413',
                  border: signatureMenuOpen ? '1px solid #141413' : '1px solid #e8e6dc',
                  fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s ease-out', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: active.colors.primary,
                  border: `1px solid ${signatureMenuOpen ? 'rgba(255,255,255,0.3)' : '#e8e6dc'}`,
                }} />
                {active.name[locale]}
                <span style={{ fontSize: 8, opacity: 0.6 }}>▼</span>
              </button>
            );
          })()}
          {signatureMenuOpen && (() => {
            const renderCard = (sig: typeof BASE_THEMES[number]) => {
              const isActive = deck.theme === sig.theme;
              return (
                <button
                  key={sig.theme}
                  onClick={() => {
                    setTheme(sig.theme);
                    setDeckPresetId(undefined);
                    setSignatureMenuOpen(false);
                  }}
                  title={sig.philosophy[locale]}
                  style={{
                    padding: 0, borderRadius: 8,
                    border: isActive ? '2px solid #141413' : '1px solid #e8e6dc',
                    background: 'transparent', cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                    overflow: 'hidden',
                    boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  <div style={{
                    width: '100%', height: 40,
                    background: sig.colors.bg,
                    display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px',
                    color: sig.colors.text,
                  }}>
                    <span style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: sig.colors.primary,
                    }} />
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: sig.colors.text,
                      letterSpacing: '-0.005em',
                    }}>{sig.name[locale]}</span>
                  </div>
                  <div style={{
                    padding: '4px 8px 6px',
                    background: isActive ? '#faf9f5' : '#fff',
                    fontSize: 9, color: '#6b6a65',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {sig.philosophy[locale]}
                  </div>
                </button>
              );
            };
            const sectionLabel: React.CSSProperties = {
              fontSize: 10, color: '#b0aea5',
              padding: '2px 4px 6px',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              display: 'flex', alignItems: 'center', gap: 6,
            };
            return (
              <div style={{
                position: 'absolute', top: 30, right: 0,
                background: '#fff', border: '1px solid #e8e6dc',
                borderRadius: 10, boxShadow: '0 6px 22px rgba(0,0,0,0.12)',
                padding: 10, width: 380, zIndex: 100,
                maxHeight: 520, overflowY: 'auto',
              }}>
                <div style={sectionLabel}>{t('style.base_section')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                  {BASE_THEMES.map(renderCard)}
                </div>
                {/* Scene × Colorway groups (v2) — filtered by deck surface:
                 *  report decks (letter/a4) show analysis-report only;
                 *  slide decks show analyst + future scene groups. */}
                {(() => {
                  const surface: 'slide' | 'report' =
                    deck.pageSize === 'letter' || deck.pageSize === 'a4' ? 'report' : 'slide';
                  const showBrandThemes = surface === 'slide';
                  const visibleGroups = SCENE_GROUPS.filter(g => !g.surface || g.surface === surface);
                  return (
                    <>
                      {visibleGroups.map(group => (
                        <div key={group.id}>
                          <div style={sectionLabel}>
                            {group.label[locale]}
                            <span style={{
                              fontSize: 9, color: '#d97757', background: '#fdf0e9',
                              padding: '1px 5px', borderRadius: 4, fontWeight: 600,
                              letterSpacing: '0.04em',
                            }}>PREMIUM</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                            {group.themes.map(renderCard)}
                          </div>
                        </div>
                      ))}
                      {showBrandThemes && (
                        <>
                          <div style={sectionLabel}>
                            {t('style.premium_section')}
                            <span style={{
                              fontSize: 9, color: '#d97757', background: '#fdf0e9',
                              padding: '1px 5px', borderRadius: 4, fontWeight: 600,
                              letterSpacing: '0.04em',
                            }}>PRO</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                            {BRAND_THEMES.map(renderCard)}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })()}
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Import / Export actions */}
      <button
        onClick={handleImport}
        style={{ ...btnStyle, opacity: importFilesEnabled ? 1 : 0.45 }}
        title={importFilesEnabled ? t('toolbar.import_tooltip') : 'Import disabled by admin'}
      >
        {t('toolbar.import')}
      </button>

      {/* Export dropdown */}
      <div style={{ position: 'relative' }} ref={exportRef}>
        <button
          onClick={() => {
            if (!exportEnabled) {
              addToast('warn', 'Export is disabled by admin.');
              return;
            }
            if (!pdfExporting) setExportOpen(o => !o);
          }}
          style={{ ...btnStyle, gap: 4, opacity: (!exportEnabled || pdfExporting) ? 0.6 : 1 }}
          title={exportEnabled ? t('toolbar.export') : 'Export disabled by admin'}
          disabled={pdfExporting}
        >
          {pdfExporting ? `${t('toolbar.exporting')} ${pdfProgress}` : t('toolbar.export')} {!pdfExporting && <span style={{ fontSize: 9, color: '#b0aea5' }}>▾</span>}
        </button>
        {exportOpen && (
          <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4,
            background: '#fff', border: '1px solid #e8e6dc', borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 100,
            minWidth: 180, padding: '4px 0', fontFamily: 'inherit',
          }}>
            <DropdownItem
              onClick={async () => {
                if (lascaExporting) return;
                setLascaExporting(true);
                try {
                  await downloadLasca(deck, locale, { inlineFonts: inlineLascaFonts });
                  logRemoteEvent('export_lasca', {
                    slideCount: deck.slides.length,
                    inlineFonts: inlineLascaFonts,
                  });
                } catch (err) {
                  addToast('error', t('toolbar.export_lasca_failed'), String(err));
                } finally {
                  setLascaExporting(false);
                  setExportOpen(false);
                }
              }}
              label=".lasca"
              desc={
                !exportLascaEnabled ? t('toolbar.export_lasca_disabled')
                  : lascaExporting ? t('toolbar.export_lasca_exporting')
                    : t('toolbar.export_lasca_desc')
              }
              disabled={!exportLascaEnabled || lascaExporting}
            />
            {exportLascaEnabled && (
              <label
                onClick={(e) => e.stopPropagation()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 14px 10px', fontSize: 11,
                  color: '#6d6b64', cursor: 'pointer', userSelect: 'none',
                  borderBottom: '1px solid #f0efeb',
                }}
                title={t('toolbar.export_lasca_inline_fonts_hint')}
              >
                <input
                  type="checkbox"
                  checked={inlineLascaFonts}
                  onChange={(e) => setInlineLascaFonts(e.target.checked)}
                  style={{ margin: 0, cursor: 'pointer' }}
                />
                <span>{t('toolbar.export_lasca_inline_fonts')}</span>
              </label>
            )}
            <DropdownItem
              onClick={() => handlePdfExport()}
              label="PDF"
              desc={pdfExporting ? pdfProgress : t('toolbar.export_pdf_desc')}
            />
            <DropdownItem
              onClick={() => {
                downloadJson(deck);
                setExportOpen(false);
              }}
              label="JSON"
              desc="Raw slide data (debug / handoff)"
            />
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 20, background: '#e8e6dc', margin: '0 4px' }} />

      {/* Present */}
      <button onClick={() => {
        logRemoteEvent('present_opened', { mode: 'presenter', slideCount: deck.slides.length });
        window.open('/present?mode=presenter', '_blank');
      }}
        style={{ ...btnStyle, background: '#555', color: '#fff' }} title={t('toolbar.presenter')}>
        🖥 {t('toolbar.presenter')}
      </button>
      <button
        onClick={() => {
          logRemoteEvent('present_opened', { mode: 'present', slideCount: deck.slides.length });
          window.open('/present', '_blank');
        }}
        style={{ ...btnStyle, background: '#d97757', color: '#fff', fontWeight: 600 }}
        title={t('toolbar.present')}
      >▶ {t('toolbar.present')}</button>

      <IntentChooser
        open={pendingImport !== null}
        fileKind={pendingImport?.kind ?? 'pptx'}
        pdfKind={pendingImport?.pdfKind}
        onChoose={handleIntentChosen}
        onCancel={() => setPendingImport(null)}
      />
    </div>
  );
}
