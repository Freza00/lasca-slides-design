'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { useLocale, useT } from '@/lib/i18n';
import { LascaBrand } from '@/components/ui/LascaBrand';
import { detectPages } from '@/lib/detectPages';
import { classifyIntent } from '@/lib/classifyIntent';
import { textSlidesToMdContext } from '@/lib/importFile';
import { GlimmerSpinner } from './GlimmerSpinner';
import { StreamingText } from './StreamingText';
import { AiActionBlock } from './AiActionBlock';
import { getRandomPhrase } from './funStatusPhrases';
import { GenerationPhases, type Phase } from './GenerationPhases';
import { SlideThumbnail } from '@/components/ui/SlideThumbnail';
import { getLogicalDims, fitToBox } from '@/lib/pageSize';
import type { ChatMessage, Conversation, Slide, Layout } from '@/lib/types';
import type { PolishAction } from '@/lib/ai/pptxPolish';
import type { MdContext } from '@/lib/ai/harness/types';
import { logger } from '@/lib/logger';
import { addToast } from '@/lib/toast';
import { withSessionHeaders } from '@/lib/clientApi';
import { hasFileDragData, isTextDocumentFile, readTextDocumentFile } from '@/lib/fileDrop';

// Stable empty refs to avoid infinite re-render from selector `?? []` creating new objects
const EMPTY_CHAT: ChatMessage[] = [];
const EMPTY_CONVOS: Conversation[] = [];
const EMPTY_POLISH: (PolishAction & { id: string; status: 'pending' | 'applied' | 'dismissed' })[] = [];

function msgId() { return 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6); }

/** Single rotating phrase shown while AI is working — disappears when done. */
function WorkingPhrase() {
  const [phrase, setPhrase] = useState(getRandomPhrase);
  useEffect(() => {
    const t = setInterval(() => setPhrase(getRandomPhrase()), 3000);
    return () => clearInterval(t);
  }, []);
  return <span style={{ fontSize: 13, color: '#d97757', lineHeight: 1.6 }}>{phrase}...</span>;
}

/* ------------------------------------------------------------------ */
/*  fadeIn keyframes — injected once                                   */
/* ------------------------------------------------------------------ */
const FADE_IN_INJECTED = { current: false };
function ensureFadeIn() {
  if (typeof document === 'undefined' || FADE_IN_INJECTED.current) return;
  const style = document.createElement('style');
  style.textContent = `@keyframes chatFadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`;
  document.head.appendChild(style);
  FADE_IN_INJECTED.current = true;
}

/* ------------------------------------------------------------------ */
/*  ChatPanel                                                          */
/* ------------------------------------------------------------------ */
interface ChatPanelProps {
  mode?: 'draft' | 'scratch' | 'generate' | null;
}

export function ChatPanel({ mode }: ChatPanelProps = {}) {
  const t = useT();
  const locale = useLocale();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [undoToast, setUndoToast] = useState<{ text: string; remaining: number } | null>(null);
  /** md-context 构建完成、等待用户确认的 pending state。用户点"就这么干"前一直 hold 着。 */
  const [pendingMdContext, setPendingMdContext] = useState<MdContext | null>(null);
  /** 上一次用户发送的原始 rawInput，用于 mdContextOverride 回传时一并提供 */
  const lastRawInputRef = useRef<string>('');
  /** md-context 预览里是否展开了完整 canonical md */
  const [canonicalExpanded, setCanonicalExpanded] = useState(false);
  /** B4 — cover variations picker. Appears above the input after the pipeline
   *  emits `cover-variations`; pick replaces slides[0] (undoable), dismiss
   *  keeps the default. Component-local state (not persisted to chat history):
   *  this is a one-shot decision consumed within the current session. */
  const [coverPicker, setCoverPicker] = useState<{ original: Slide; alternates: Slide[] } | null>(null);
  const [phases, setPhases] = useState<Phase[] | null>(null);
  // Total pages tracked across SSE events so `slide` can update the generate subLabel.
  const generateTotalRef = useRef(0);
  const activeDeckId = useEditorStore(s => s.activeDeckId);
  const chatMessages = useEditorStore(s => s.chatMessages[s.activeDeckId] ?? EMPTY_CHAT);
  const addChatMessage = useEditorStore(s => s.addChatMessage);
  const clearChat = useEditorStore(s => s.clearChat);
  const archiveChat = useEditorStore(s => s.archiveChat);
  const loadConversation = useEditorStore(s => s.loadConversation);
  const deleteConversation = useEditorStore(s => s.deleteConversation);
  const chatConversations = useEditorStore(s => s.chatConversations[s.activeDeckId] ?? EMPTY_CONVOS);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const currentIndex = useEditorStore(s => s.currentIndex);
  const activeDeck = useEditorStore(s => s.activeDeck());
  const updateSlide = useEditorStore(s => s.updateSlide);
  const updateSlideField = useEditorStore(s => s.updateSlideField);
  const chatTargetField = useEditorStore(s => s.chatTargetField);
  const setChatTargetField = useEditorStore(s => s.setChatTargetField);
  const replaceAllSlides = useEditorStore(s => s.replaceAllSlides);
  const renameDeck = useEditorStore(s => s.renameDeck);
  const addSlideAction = useEditorStore(s => s.addSlideAction);
  const polishActions = useEditorStore(s => s.polishActions[s.activeDeckId] ?? EMPTY_POLISH);
  const setPolishStatus = useEditorStore(s => s.setPolishStatus);
  const applyRawHtmlPatch = useEditorStore(s => s.applyRawHtmlPatch);
  const setCurrentIndex = useEditorStore(s => s.setCurrentIndex);
  const setPendingImportRedesign = useEditorStore(s => s.setPendingImportRedesign);
  const isGenerating = useEditorStore(s => s.isGenerating);
  const setIsGenerating = useEditorStore(s => s.setIsGenerating);
  const router = useRouter();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [tooltip, setTooltip] = useState<string | null>(null);
  // Page selector state — defaults to current page, user can multi-select
  const [selectedPages, setSelectedPages] = useState<number[]>([currentIndex + 1]);
  const [showPagePicker, setShowPagePicker] = useState(false);
  const pagePickerRef = useRef<HTMLDivElement>(null);

  // Sync selectedPages with sidebar multi-select or currentIndex
  const selectedSlideIndices = useEditorStore(s => s.selectedSlideIndices);
  const setSelectedSlideIndices = useEditorStore(s => s.setSelectedSlideIndices);
  useEffect(() => {
    if (selectedSlideIndices.length > 0) {
      setSelectedPages(selectedSlideIndices.map(i => i + 1));
    } else {
      setSelectedPages([currentIndex + 1]);
    }
  }, [currentIndex, selectedSlideIndices]);

  /** Reusable: add greeting + hint messages for the current mode */
  const addGreeting = useCallback(() => {
    let greeting = t('chat.greeting.default');
    let hint = t('chat.hint.default');
    if (mode === 'draft') {
      greeting = t('chat.greeting.draft');
      hint = t('chat.hint.draft');
    } else if (mode === 'scratch') {
      greeting = t('chat.greeting.scratch');
      hint = t('chat.hint.scratch');
    } else if (mode === 'generate') {
      greeting = t('chat.greeting.generate');
      hint = t('chat.hint.generate');
    }
    addChatMessage({ id: msgId(), type: 'greeting', text: greeting, timestamp: Date.now() });
    setTimeout(() => addChatMessage({ id: msgId(), type: 'hint', text: hint, timestamp: Date.now() }), 200);
  }, [mode, addChatMessage, t]);

  // --- Chart conversion multi-turn session ---
  const [chartSession, setChartSession] = useState<{
    chartLayout: Layout;
    chartLabel: string;
    pageIndex: number;
    phase: 'ask' | 'planning' | 'confirming';
    planText?: string;
  } | null>(null);

  // --- Sticky confirm bar: pin the most recent unresolved confirmation ---
  const [activeConfirm, setActiveConfirm] = useState<{
    text: string;
    options: { label: string; action: string }[];
  } | null>(null);

  // --- Batch edit continuation: stores remaining pages + message when rate-limited ---
  const [batchContinuation, setBatchContinuation] = useState<{
    remainingPages: number[];
    message: string;
  } | null>(null);

  // inject fadeIn keyframes
  useEffect(() => { ensureFadeIn(); }, []);

  // close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHistory]);

  // close page picker on outside click
  useEffect(() => {
    if (!showPagePicker) return;
    const handler = (e: MouseEvent) => {
      if (pagePickerRef.current && !pagePickerRef.current.contains(e.target as Node)) {
        setShowPagePicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPagePicker]);

  // auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  // initial messages — per-deck, re-triggers when switching to a deck with no messages
  const initedDecks = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (initedDecks.current.has(activeDeckId)) return;
    initedDecks.current.add(activeDeckId);
    if (chatMessages.length === 0) {
      let greeting = t('chat.greeting.default');
      let hint = t('chat.hint.default');
      if (mode === 'draft') {
        greeting = t('chat.greeting.draft');
        hint = t('chat.hint.draft');
      } else if (mode === 'scratch') {
        greeting = t('chat.greeting.scratch');
        hint = t('chat.hint.scratch');
      } else if (mode === 'generate') {
        greeting = t('chat.greeting.generate');
        hint = t('chat.hint.generate');
      }
      addChatMessage({ id: msgId(), type: 'greeting', text: greeting, timestamp: Date.now() });
      setTimeout(() => {
        addChatMessage({ id: msgId(), type: 'hint', text: hint, timestamp: Date.now() });
      }, 400);

      // Focus the textarea in entry modes
      if (mode === 'draft' || mode === 'scratch' || mode === 'generate') {
        setTimeout(() => textareaRef.current?.focus(), 500);
      }
    }
  }, [activeDeckId, chatMessages.length, addChatMessage, mode]);

  // Auto-trigger generation from /create page handoff
  const pendingCreate = useEditorStore(s => s.pendingCreate);
  const setPendingCreateMdContext = useEditorStore(s => s.setPendingCreateMdContext);
  const pendingCreateHandled = useRef(false);
  useEffect(() => {
    if (!pendingCreate || pendingCreateHandled.current || isGenerating) return;
    pendingCreateHandled.current = true;

    // Clear the pending state
    setPendingCreateMdContext(null);

    // Start generation with the pre-built md-context
    setLoading(true);
    setIsGenerating(true);
    lastRawInputRef.current = pendingCreate.rawInput;

    streamHarnessEvents({
      workflow: 'generate-from-draft',
      rawInput: pendingCreate.rawInput,
      mdContextOverride: pendingCreate.mdContext,
      clarifierAnswers: pendingCreate.answers,
      theme: pendingCreate.theme,
      format: pendingCreate.format,
      presetId: pendingCreate.presetId,
      pageCount: pendingCreate.mdContext.pages.length,
      skipClarifier: true,
    }).catch(err => {
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.request_failed', { msg: (err as Error).message }), timestamp: Date.now() });
    }).finally(() => {
      setLoading(false);
      setIsGenerating(false);
    });
  }, [pendingCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInputFileDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragData(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleInputFileDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (!hasFileDragData(e.dataTransfer)) return;
    e.preventDefault();
    if (loading || isGenerating) return;

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!isTextDocumentFile(file)) {
      addToast('error', t('drop.text_only'));
      return;
    }

    try {
      const text = await readTextDocumentFile(file);
      setInput(prev => prev.trim() ? `${prev}\n\n${text}` : text);
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      addToast('error', t('drop.read_failed', { msg: (err as Error).message }));
    }
  }, [loading, isGenerating, t]);

  // undo countdown
  useEffect(() => {
    if (!undoToast) return;
    undoTimerRef.current = setInterval(() => {
      setUndoToast(prev => {
        if (!prev || prev.remaining <= 1) {
          if (undoTimerRef.current) clearInterval(undoTimerRef.current);
          return null;
        }
        return { ...prev, remaining: prev.remaining - 1 };
      });
    }, 1000);
    return () => { if (undoTimerRef.current) clearInterval(undoTimerRef.current); };
  }, [undoToast?.text]); // re-run only when a new toast appears

  // auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = '0';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }, [input]);

  /* ---------- smart label logic ---------- */
  const detectedPages = detectPages(input);
  // Auto-sync selector when user types explicit page references
  const prevDetectedRef = useRef<string>('');
  useEffect(() => {
    const key = detectedPages ? detectedPages.join(',') : '';
    if (key && key !== prevDetectedRef.current) {
      setSelectedPages(detectedPages!);
    }
    prevDetectedRef.current = key;
  }, [detectedPages?.join(',')]);
  // Page selector label: compact range notation (e.g. "3-5, 9")
  const totalPages = activeDeck.slides.length;
  const isAllSelected = selectedPages.length === totalPages && totalPages > 0;

  const formatPageRange = (pages: number[]): string => {
    if (pages.length === 0) return '';
    const sorted = [...pages].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) { end = sorted[i]; }
      else { ranges.push(start === end ? `${start}` : `${start}-${end}`); start = end = sorted[i]; }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return ranges.join(', ');
  };

  const pageSelectorLabel = isAllSelected
    ? t('chat.scope.all')
    : selectedPages.length === 1
      ? t('chat.scope.page', { n: selectedPages[0] })
      : formatPageRange(selectedPages);

  // Legacy smartLabel used for scope badge on sent messages
  const smartLabel = detectedPages
    ? (detectedPages.length === 1 ? t('chat.scope.page', { n: detectedPages[0] }) : t('chat.scope.multi'))
    : (selectedPages.length === totalPages ? t('chat.scope.all_pages')
      : selectedPages.length === 1 ? t('chat.scope.page', { n: selectedPages[0] })
      : formatPageRange(selectedPages));
  const smartTooltip = detectedPages && detectedPages.length > 1
    ? t('chat.scope.pages', { pages: detectedPages.join(', ') }) : '';

  /* ====================================================================
     AI LOGIC — kept from original
     ==================================================================== */

  // --- Auto-title the deck tab from the first slide's heading ---
  const autoTitleDeck = useCallback((slides: Slide[]) => {
    const d = slides[0]?.data as Record<string, unknown> | undefined;
    const raw = (d?.title as string) ?? (d?.number as string) ?? '';
    const clean = raw.replace(/<[^>]*>/g, '').trim();
    if (clean) renameDeck(activeDeckId, clean.length > 30 ? clean.slice(0, 30) + '...' : clean);
  }, [renameDeck, activeDeckId]);

  // --- Stream harness events (shared between initial send and md-context approval) ---
  const streamHarnessEvents = useCallback(async (body: Record<string, unknown>) => {
    logger.info('ai', 'SSE stream started', { workflow: body.workflow, format: body.format });

    // Total timeout (15 min) + per-chunk heartbeat (30s). Reasoning models on
    // large mdContext can spend 4-7 min per LLM call through the proxy; 5 min
    // was mid-generation on real jobs.
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const totalTimeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);

    let res: Response;
    try {
      res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...body, locale }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(totalTimeout);
      if ((err as Error).name === 'AbortError') throw new Error(t('chat.request_timeout'));
      throw err;
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) { clearTimeout(totalTimeout); throw new Error('No response body'); }

    let buffer = '';
    let heartbeat: ReturnType<typeof setTimeout> | null = null;
    const resetHeartbeat = () => {
      if (heartbeat) clearTimeout(heartbeat);
      heartbeat = setTimeout(() => {
        controller.abort();
        reader.cancel();
      }, 30_000); // 30s no data = disconnect
    };
    resetHeartbeat();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetHeartbeat();
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;

          const event = JSON.parse(raw);
          switch (event.type) {
            case 'md-context-preview':
              setPendingMdContext(event.data.mdContext as MdContext);
              setCanonicalExpanded(false);
              addChatMessage({
                id: msgId(),
                type: 'status',
                text: t('chat.md_context_ready'),
                timestamp: Date.now(),
              });
              return;
            case 'plan':
              addChatMessage({
                id: msgId(),
                type: 'status',
                text: event.plan?.summary || t('chat.plan_generated'),
                timestamp: Date.now(),
              });
              break;
            case 'clarify-needed':
              addChatMessage({
                id: msgId(),
                type: 'status',
                text: t('chat.defaults_used'),
                timestamp: Date.now(),
              });
              break;
            case 'outline': {
              const n = Array.isArray(event.data) ? event.data.length : 0;
              addChatMessage({
                id: msgId(),
                type: 'action',
                text: t('chat.outline_generated', { n }),
                timestamp: Date.now(),
                detail: JSON.stringify(event.data, null, 2),
              });
              // N5 — user-visible phase checklist: outline done → generate active.
              generateTotalRef.current = n;
              setPhases([
                { id: 'outline', label: t('chat.phase.outline'), status: 'done' },
                { id: 'generate', label: t('chat.phase.generate'), status: 'active', subLabel: n ? `0 / ${n}` : undefined },
                { id: 'recheck', label: t('chat.phase.recheck'), status: 'pending' },
              ]);
              break;
            }
            case 'generating': {
              // Transient working event. Update generate sub-label with batch range;
              // the silent "working" feel is preserved by the spinner inside the phase row.
              const { from, to, total } = event.data ?? {};
              if (typeof total === 'number') generateTotalRef.current = total;
              setPhases(prev => prev
                ? prev.map(p => p.id === 'generate'
                  ? { ...p, status: 'active', subLabel: from && to && total ? `${from}–${to} / ${total}` : p.subLabel }
                  : p)
                : prev);
              break;
            }
            case 'validating':
            case 'fixing':
              // Transient working events — no chat message, no phase transition (folded into 'recheck').
              break;
            case 'rechecking':
              // B2 P1 silent-on-pass: 'rechecking' fires ONLY when failures exist.
              // Mark generate done + recheck active. If no 'rechecking' ever fires, the
              // 'done' case below flips recheck to done (pass-by-absence).
              setPhases(prev => prev
                ? prev.map(p =>
                  p.id === 'generate' ? { ...p, status: 'done', subLabel: undefined }
                  : p.id === 'recheck' ? { ...p, status: 'active' }
                  : p)
                : prev);
              break;
            case 'slide':
              // Per-slide arrival — update generate counter only.
              if (typeof event.data?.index === 'number' && generateTotalRef.current > 0) {
                const idx = event.data.index + 1;
                const total = generateTotalRef.current;
                setPhases(prev => prev
                  ? prev.map(p => p.id === 'generate'
                    ? { ...p, subLabel: `${idx} / ${total}` }
                    : p)
                  : prev);
              }
              break;
            case 'violations':
            case 'fixed':
              // B2 P1 silent-on-pass: 'fixed' fires after auto-fix succeeded; no chat noise.
              break;
            case 'cover-variations':
              // B4 — stash the 3 covers; the picker renders above the input.
              setCoverPicker({
                original: event.data.original,
                alternates: event.data.alternates,
              });
              // Insert a "Cover options" phase after generate, marked done.
              setPhases(prev => {
                if (!prev) return prev;
                if (prev.some(p => p.id === 'cover-variations')) return prev;
                const out: Phase[] = [];
                for (const p of prev) {
                  out.push(p);
                  if (p.id === 'generate') {
                    out.push({ id: 'cover-variations', label: t('chat.phase.cover_variations'), status: 'done' });
                  }
                }
                return out;
              });
              break;
            case 'done':
              replaceAllSlides(event.data.slides);
              useEditorStore.getState().setContentLocked(true);
              if (event.data.presetId) {
                useEditorStore.getState().setDeckPresetId(event.data.presetId);
              }
              autoTitleDeck(event.data.slides);
              addChatMessage({
                id: msgId(),
                type: 'done',
                text: t('chat.slides_generated', { n: event.data.slides.length }),
                timestamp: Date.now(),
              });
              setUndoToast({ text: t('chat.slides_generated_short', { n: event.data.slides.length }), remaining: 3 });
              (event.data.slides as unknown[]).forEach((_, i: number) => {
                addSlideAction(i, t('chat.ai_generated'), '#788c5d');
              });
              // N5 — mark any still-pending/active phases as done (recheck pass-by-absence).
              setPhases(prev => prev ? prev.map(p => p.status === 'done' ? p : { ...p, status: 'done', subLabel: undefined }) : prev);
              break;
            case 'error':
              logger.error('ai', `SSE error event`, { fatal: event.data.fatal, message: event.data.message });
              if (event.data.fatal !== false) {
                addToast('error', t('chat.ai_error', { msg: event.data.message }));
              }
              if (event.data.kind === 'recheck-fix-failed') {
                // B2 P1: route recheck-fix failures through AiActionBlock so
                // the user sees WHAT the golden-rule check caught (expandable).
                addChatMessage({
                  id: msgId(),
                  type: 'action',
                  text: event.data.message,
                  timestamp: Date.now(),
                  detail: Array.isArray(event.data.issues) && event.data.issues.length > 0
                    ? event.data.issues.join('\n')
                    : undefined,
                });
              } else {
                addChatMessage({
                  id: msgId(),
                  type: event.data.fatal === false ? 'status' : 'done',
                  text: event.data.fatal === false ? event.data.message : t('chat.error_prefix', { msg: event.data.message }),
                  timestamp: Date.now(),
                });
              }
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User-initiated stop → silent exit (handleStop already added a message)
        if (controller.signal.reason === 'user-stop') return;
        throw new Error(t('chat.connection_timeout'));
      }
      throw err;
    } finally {
      clearTimeout(totalTimeout);
      if (heartbeat) clearTimeout(heartbeat);
      abortControllerRef.current = null;
      // N5 — clear checklist state; the phases render is gated on `loading && phases`.
      setPhases(null);
      generateTotalRef.current = 0;
    }
  }, [addChatMessage, addSlideAction, autoTitleDeck, locale, replaceAllSlides, t]);

  // --- Generate full deck via md-context workflow ---
  const handleGenerate = useCallback(async (prompt: string) => {
    if (isGenerating) return; // prevent double-click
    setLoading(true);
    setIsGenerating(true);
    lastRawInputRef.current = prompt;

    // v2.4: letter/a4 decks ask for a report, everything else is slides.
    const format: 'slide' | 'report' =
      (activeDeck.pageSize === 'letter' || activeDeck.pageSize === 'a4') ? 'report' : 'slide';

    try {
      await streamHarnessEvents({
        workflow: 'generate-from-draft',
        rawInput: prompt,
        theme: activeDeck.theme,
        skipClarifier: true,
        format,
      });
    } catch (err) {
      logger.error('ai', 'generate request failed', { error: (err as Error).message });
      addToast('error', t('chat.ai_generate_failed', { msg: (err as Error).message }));
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.request_failed', { msg: (err as Error).message }), timestamp: Date.now() });
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [isGenerating, activeDeck.theme, activeDeck.pageSize, addChatMessage, streamHarnessEvents, setIsGenerating, t]);

  // --- Approve md-context → send second request with mdContextOverride ---
  const approveMdContext = useCallback(async () => {
    if (!pendingMdContext || isGenerating) return;
    const mdContext = pendingMdContext;
    setPendingMdContext(null);
    setCanonicalExpanded(false);
    setLoading(true);
    setIsGenerating(true);
    addChatMessage({ id: msgId(), type: 'status', text: t('chat.confirm_go'), timestamp: Date.now() });

    const format: 'slide' | 'report' =
      (activeDeck.pageSize === 'letter' || activeDeck.pageSize === 'a4') ? 'report' : 'slide';

    try {
      await streamHarnessEvents({
        workflow: 'generate-from-draft',
        rawInput: lastRawInputRef.current,
        mdContextOverride: mdContext,
        theme: activeDeck.theme,
        skipClarifier: true,
        format,
      });
    } catch (err) {
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.request_failed', { msg: (err as Error).message }), timestamp: Date.now() });
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [isGenerating, pendingMdContext, activeDeck.theme, activeDeck.pageSize, addChatMessage, streamHarnessEvents, setIsGenerating, t]);

  // --- Reject md-context → write canonical md back to textarea so user can edit ---
  const editMdContext = useCallback(() => {
    if (!pendingMdContext) return;
    setInput(pendingMdContext.canonicalMd);
    setPendingMdContext(null);
    setCanonicalExpanded(false);
    addChatMessage({
      id: msgId(),
      type: 'status',
      text: t('chat.md_rewrite'),
      timestamp: Date.now(),
    });
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [pendingMdContext, addChatMessage]);

  // --- Build updated slide from AI patch (shared by handleEdit + handleMultiEdit) ---
  const buildUpdatedSlide = useCallback((slide: Slide, patch: Record<string, unknown>, isLocked: boolean): Slide => {
    const layoutChanging = patch.layout && patch.layout !== slide.layout;
    let finalData = slide.data;
    if (patch.data) {
      if (isLocked && !layoutChanging) {
        finalData = slide.data; // Locked: ignore AI's data changes
      } else {
        finalData = { ...slide.data, ...(patch.data as Record<string, unknown>) };
      }
    } else if (patch.layout) {
      finalData = (patch.data as Record<string, unknown>) ?? slide.data;
    }
    return {
      layout: (patch.layout as string) || slide.layout,
      data: finalData,
      notes: slide.notes,
      style: patch.style ? { ...(slide.style ?? {}), ...(patch.style as Record<string, unknown>) } : slide.style,
      transition: (patch.transition as string) ?? slide.transition,
    } as Slide;
  }, []);

  // --- Edit single page (targetIndex overrides currentIndex, targetLayout locks chart conversion) ---
  const handleEdit = useCallback(async (message: string, targetIndex?: number, targetLayout?: string) => {
    // Prevent concurrent edits while generating or another edit is in-flight
    if (useEditorStore.getState().isGenerating) return;

    // Read fresh state so targetIndex works even if currentIndex hasn't updated yet
    const state = useEditorStore.getState();
    const idx = targetIndex ?? state.currentIndex;
    const deck = state.decks.find(d => d.id === state.activeDeckId);
    if (!deck) return;
    const slide = deck.slides[idx];
    if (!slide) {
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.page_not_exist', { n: idx + 1 }), timestamp: Date.now() });
      return;
    }

    // B1 — single-field mode is only valid on native layouts. Faithful layouts
    // use DOM-locator data-field paths ("pdf.p0.l3") that don't resolve to
    // slide.data JSON paths, so they stay on the whole-slide edit path.
    const isFaithful = slide.layout === 'pptx-faithful' || slide.layout === 'pdf-faithful';
    const activeFieldPath = !targetLayout && !isFaithful ? state.chatTargetField : null;

    setIsGenerating(true);
    setLoading(true);

    try {
      const outline = deck.slides.map((s, i) => `${i + 1}. ${s.layout}: ${(s.data as Record<string, string>).title || ''}`);
      const prevTitle = idx > 0 ? (deck.slides[idx - 1].data as Record<string, string>).title : undefined;
      const nextTitle = idx < deck.slides.length - 1 ? (deck.slides[idx + 1].data as Record<string, string>).title : undefined;

      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          theme: deck.theme,
          outline,
          targetPage: idx + 1,
          currentSlide: slide,
          prevTitle,
          nextTitle,
          message,
          contentLocked: targetLayout ? false : (deck.contentLocked ?? false),
          locale,
          ...(targetLayout ? { targetLayout } : {}),
          ...(activeFieldPath ? { fieldPath: activeFieldPath } : {}),
        }),
      });

      const patch = await res.json();

      if (patch.error) {
        logger.error('ai', 'edit returned error', { error: patch.error, raw: patch.raw?.slice(0, 300) });
        addToast('error', t('chat.ai_edit_failed', { msg: patch.error }));
        addChatMessage({ id: msgId(), type: 'done', text: t('chat.error_prefix', { msg: patch.error }), timestamp: Date.now() });
      } else if (patch.locked) {
        addChatMessage({ id: msgId(), type: 'done', text: patch.hint || t('chat.content_lock_hint'), timestamp: Date.now() });
      } else if (activeFieldPath && typeof patch.fieldPath === 'string' && typeof patch.newValue === 'string') {
        // B1 — single-field response: patch just that leaf via updateSlideField.
        // Skip buildUpdatedSlide entirely so we don't round-trip the whole slide.
        updateSlideField(idx, patch.fieldPath, patch.newValue);
        setCurrentIndex(idx);
        window.dispatchEvent(new CustomEvent('lasca:slide-edited', { detail: { pageIndex: idx } }));
        addChatMessage({ id: msgId(), type: 'done', text: t('chat.page_updated', { n: idx + 1 }), timestamp: Date.now() });
        setUndoToast({ text: t('chat.page_updated_short', { n: idx + 1 }), remaining: 3 });
        addSlideAction(idx, message.slice(0, 30), '#6a9bcc');
        setChatTargetField(null);
      } else {
        // Chart conversion: force correct layout if AI returned a different one
        if (targetLayout && patch.layout && patch.layout !== targetLayout) {
          logger.warn('ai', `Chart conversion layout mismatch: wanted ${targetLayout}, got ${patch.layout}`);
          patch.layout = targetLayout;
        }
        const isLocked = targetLayout ? false : (deck.contentLocked ?? false);
        const updated = buildUpdatedSlide(slide, patch, isLocked);
        updateSlide(idx, updated);
        // Auto-navigate to the edited page so user sees the result + animation
        setCurrentIndex(idx);
        // Signal Canvas to play the reveal animation
        window.dispatchEvent(new CustomEvent('lasca:slide-edited', { detail: { pageIndex: idx } }));
        addChatMessage({ id: msgId(), type: 'done', text: t('chat.page_updated', { n: idx + 1 }), timestamp: Date.now() });
        setUndoToast({ text: t('chat.page_updated_short', { n: idx + 1 }), remaining: 3 });
        addSlideAction(idx, message.slice(0, 30), '#6a9bcc');
      }
    } catch (err) {
      logger.error('ai', 'edit request failed', { error: (err as Error).message });
      addToast('error', t('chat.ai_edit_failed', { msg: (err as Error).message }));
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.request_failed', { msg: (err as Error).message }), timestamp: Date.now() });
    } finally {
      setLoading(false);
      setIsGenerating(false);
    }
  }, [addChatMessage, addSlideAction, buildUpdatedSlide, locale, setIsGenerating, t, updateSlide, updateSlideField, setChatTargetField]);

  // --- Edit multiple pages sequentially ---
  const handleMultiEdit = useCallback(async (message: string, pages?: number[]) => {
    // Prevent concurrent edits while generating or another edit is in-flight
    if (useEditorStore.getState().isGenerating) return;

    const state = useEditorStore.getState();
    const deck = state.decks.find(d => d.id === state.activeDeckId);
    if (!deck) return;

    // pages=undefined → all pages; pages=[3,5] → those specific pages (1-indexed)
    const targetPages = pages && pages.length > 0
      ? pages
      : deck.slides.map((_, i) => i + 1);

    setIsGenerating(true);
    setLoading(true);
    setBatchContinuation(null);

    let successCount = 0;
    let rateLimitedAt = -1; // index in targetPages where 429 hit
    const outline = deck.slides.map((s, i) => `${i + 1}. ${s.layout}: ${(s.data as Record<string, string>).title || ''}`);
    const isLocked = deck.contentLocked ?? false;

    for (let pi = 0; pi < targetPages.length; pi++) {
      const pageNum = targetPages[pi];
      const idx = pageNum - 1;
      const slide = deck.slides[idx];
      if (!slide) continue;

      try {
        const prevTitle = idx > 0 ? (deck.slides[idx - 1].data as Record<string, string>).title : undefined;
        const nextTitle = idx < deck.slides.length - 1 ? (deck.slides[idx + 1].data as Record<string, string>).title : undefined;

        const res = await fetch('/api/ai/edit', {
          method: 'POST',
          headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            theme: deck.theme,
            outline,
            targetPage: pageNum,
            currentSlide: slide,
            prevTitle,
            nextTitle,
            message,
            contentLocked: isLocked,
            locale,
          }),
        });

        // Detect rate limit (429) — stop loop and offer continue
        if (res.status === 429) {
          rateLimitedAt = pi;
          break;
        }

        const patch = await res.json();
        if (patch.error || patch.locked) continue;

        const updated = buildUpdatedSlide(slide, patch, isLocked);
        updateSlide(idx, updated);
        addSlideAction(idx, message.slice(0, 30), '#6a9bcc');
        successCount++;
      } catch (err) {
        logger.error('ai', `multi-edit page ${pageNum} failed`, { error: (err as Error).message });
      }
    }

    // Rate-limited mid-batch: save remaining pages for continuation
    if (rateLimitedAt >= 0) {
      const remaining = targetPages.slice(rateLimitedAt);
      setBatchContinuation({ remainingPages: remaining, message });

      const doneText = t('chat.multi_edit_done', { success: successCount, total: targetPages.length, remaining: remaining.length });
      addChatMessage({ id: msgId(), type: 'done', text: doneText, timestamp: Date.now() });

      // Offer continue via sticky confirm
      const confirmOpts = [
        { label: t('chat.continue_remaining', { n: remaining.length }), action: 'batch:continue' },
        { label: t('chat.nevermind'), action: 'cancel' },
      ];
      addChatMessage({
        id: msgId(), type: 'confirm', timestamp: Date.now(),
        text: t('chat.rate_limit', { range: `${remaining[0]}-${remaining[remaining.length - 1]}` }),
        options: confirmOpts,
      });
      setActiveConfirm({ text: t('chat.remaining_pages', { n: remaining.length }), options: confirmOpts });
    } else {
      addChatMessage({
        id: msgId(), type: 'done',
        text: t('chat.multi_edit_complete', { success: successCount, total: targetPages.length }),
        timestamp: Date.now(),
      });
    }

    if (successCount > 0) {
      setUndoToast({ text: t('chat.batch_modified', { n: successCount }), remaining: 3 });
    }
    setLoading(false);
    setIsGenerating(false);
  }, [addChatMessage, addSlideAction, buildUpdatedSlide, locale, setIsGenerating, t, updateSlide]);

  /* ====================================================================
     Stop generation
     ==================================================================== */
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('user-stop');
    }
    // Force-reset state (covers edit paths where no AbortController exists)
    setIsGenerating(false);
    setLoading(false);
    addChatMessage({ id: msgId(), type: 'done', text: t('chat.stopped'), timestamp: Date.now() });
  }, [addChatMessage, setIsGenerating, t]);

  /* ====================================================================
     Dispatch — single-button, intent-based routing
     ==================================================================== */
  const handleSend = () => {
    if (!input.trim() || loading) return;

    const text = input.trim();

    // Chart session intercept: user is describing data for manual chart conversion
    if (chartSession?.phase === 'ask') {
      addChatMessage({ id: msgId(), type: 'user', text, timestamp: Date.now(), scope: 'page', scopeLabel: t('chat.scope.page', { n: chartSession.pageIndex + 1 }) });
      setInput('');
      setChartSession(prev => prev ? { ...prev, phase: 'planning' } : null);
      chartPlan(text);
      return;
    }

    // Batch continuation intercept: "继续" / "continue" triggers remaining pages
    if (batchContinuation && /^(?:继续|接着|continue)$/i.test(text)) {
      setInput('');
      handleConfirmAction('batch:continue');
      return;
    }

    const intent = classifyIntent(text, activeDeck.slides.length);

    // Effective pages: text-detected > picker selection > current page
    const effectivePages = detectedPages ?? (selectedPages.length > 0 ? selectedPages : [currentIndex + 1]);
    const effectiveIsAll = effectivePages.length === totalPages && totalPages > 0;

    // Derive scope label for chat message display
    let scopeType: ChatMessage['scope'] = effectivePages.length > 1 ? 'multi' : 'page';
    let scopeLabel = smartLabel;
    if (intent.type === 'edit-all' || intent.type === 'generate' || effectiveIsAll) {
      scopeType = 'global';
      scopeLabel = intent.type === 'generate' ? t('chat.scope_generate') : t('chat.scope.all_pages');
    }

    addChatMessage({
      id: msgId(),
      type: 'user',
      text,
      timestamp: Date.now(),
      pages: effectivePages,
      scope: scopeType,
      scopeLabel,
    });
    setInput('');
    logger.info('ai', `user sent: "${text.slice(0, 80)}"`, { intent: intent.type });

    // --- Route based on intent ---

    if (intent.type === 'edit') {
      const targetPages = intent.pages.length > 0 ? intent.pages : effectivePages;
      if (targetPages.length === 1) {
        handleEdit(text, targetPages[0] - 1);
      } else {
        handleMultiEdit(text, targetPages);
      }
      return;
    }

    if (intent.type === 'edit-all') {
      // "重新设计" on all pages → navigate to Create flow style picker (same as PPTX import redesign)
      if (/(?:重新设计|redesign|重新排版|重新布局)/i.test(text) && activeDeck.slides.length > 0) {
        const textSlides = activeDeck.slides.map((s, i) => {
          const d = s.data as Record<string, unknown>;
          const title = (d.title as string) || `Slide ${i + 1}`;
          const body = d.left
            ? ((d.left as Record<string, string>)?.content || '')
            : ((d.body as string) || '');
          return { title, body };
        });
        const deckName = activeDeck.name || 'Untitled';
        const mdContext = textSlidesToMdContext(textSlides, deckName);
        setPendingImportRedesign({ mdContext, fileName: deckName });
        router.push('/create?type=slide&step=style-pick&from=editor');
        return;
      }
      handleMultiEdit(text);
      return;
    }

    if (intent.type === 'ambiguous') {
      // Existing deck → default to edit (safer); empty deck → generate
      if (activeDeck.slides.length > 0) {
        if (effectivePages.length === 1) {
          handleEdit(text, effectivePages[0] - 1);
        } else {
          handleMultiEdit(text, effectivePages);
        }
      } else {
        handleGenerate(text);
      }
      return;
    }

    // intent.type === 'generate' — apply safety guards
    if (activeDeck.contentLocked && activeDeck.slides.length > 0) {
      addChatMessage({
        id: msgId(), type: 'done',
        text: t('chat.content_lock_block'),
        timestamp: Date.now(),
      });
      return;
    }

    if (activeDeck.slides.length > 1) {
      const opts = [
        { label: t('chat.regenerate'), action: `generate:${text}` },
        { label: t('common.cancel'), action: 'cancel' },
      ];
      const confirmText = t('chat.confirm_regenerate', { n: activeDeck.slides.length });
      addChatMessage({
        id: msgId(),
        type: 'confirm',
        text: confirmText,
        timestamp: Date.now(),
        options: opts,
      });
      setActiveConfirm({ text: confirmText, options: opts });
      return;
    }

    handleGenerate(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Listen for edit requests from canvas SlideToolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, pageIndex } = (e as CustomEvent).detail;
      // Add a chat message to show what was requested
      addChatMessage({
        id: msgId(),
        type: 'user',
        text: message,
        timestamp: Date.now(),
        pages: [pageIndex + 1],
        scope: 'page',
        scopeLabel: t('chat.scope.page', { n: pageIndex + 1 }),
      });
      handleEdit(message, pageIndex);
    };
    window.addEventListener('lasca:edit-slide', handler);
    return () => window.removeEventListener('lasca:edit-slide', handler);
  }, [handleEdit, addChatMessage]);

  // Listen for chart-convert requests from SlideToolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const { chartLayout, chartLabel, pageIndex } = (e as CustomEvent).detail;
      setChartSession({ chartLayout, chartLabel, pageIndex, phase: 'ask' });
      const askOpts = [
        { label: t('chat.infer_from_page'), action: 'chart:infer' },
        { label: t('chat.describe_data'), action: 'chart:manual' },
      ];
      const askText = t('chat.chart_convert', { n: pageIndex + 1, label: chartLabel });
      addChatMessage({
        id: msgId(), type: 'confirm', timestamp: Date.now(),
        text: askText,
        pages: [pageIndex + 1], scope: 'page', scopeLabel: t('chat.scope.page', { n: pageIndex + 1 }),
        options: askOpts,
      });
      setActiveConfirm({ text: askText, options: askOpts });
    };
    window.addEventListener('lasca:chart-convert', handler);
    return () => window.removeEventListener('lasca:chart-convert', handler);
  }, [addChatMessage]);

  // Listen for confirm/adjust actions from the ChartPlanSheet bottom sheet
  const handleConfirmActionRef = useRef<(action: string) => void>(() => {});
  const editedPlanTextRef = useRef<string | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string; editedPlanText?: string };
      if (detail.action === 'confirm') {
        // Stash edited plan text so handleConfirmAction can read it
        editedPlanTextRef.current = detail.editedPlanText ?? null;
        handleConfirmActionRef.current('chart:confirm');
      } else if (detail.action === 'dismiss') {
        setChartSession(null);
        setActiveConfirm(null);
      }
    };
    window.addEventListener('lasca:chart-plan-action', handler);
    return () => window.removeEventListener('lasca:chart-plan-action', handler);
  }, []);

  // Chart plan: ask LLM to propose a chart structure (planOnly mode)
  const chartPlan = useCallback(async (userContext: string | null) => {
    const session = chartSession;
    if (!session) return;
    setChartSession(prev => prev ? { ...prev, phase: 'planning' } : null);
    setLoading(true);

    const state = useEditorStore.getState();
    const deck = state.decks.find(d => d.id === state.activeDeckId);
    const slide = deck?.slides[session.pageIndex];
    if (!deck || !slide) { setLoading(false); return; }

    const outline = deck.slides.map((s, i) => `${i + 1}. ${s.layout}: ${(s.data as Record<string, unknown>).title || ''}`);

    // Chart-type-specific constraints for the plan prompt
    const CHART_PLAN_HINTS: Record<string, string> = {
      'bar-chart': t('chart.bar'),
      'horizontal-bar-chart': t('chart.horizontal_bar'),
      'line-chart': t('chart.line'),
      'pie-chart': t('chart.pie'),
      'flowchart': t('chart.flowchart'),
      'funnel': t('chart.funnel'),
      'pyramid': t('chart.pyramid'),
      'steps': t('chart.steps'),
      'matrix': t('chart.matrix'),
      'versus': t('chart.versus'),
      'venn': t('chart.venn'),
      'bullseye': t('chart.bullseye'),
      'cycle': t('chart.cycle'),
      'hub-spoke': t('chart.hub_spoke'),
    };
    const chartHint = CHART_PLAN_HINTS[session.chartLayout] || `${session.chartLabel}, 3-6 items.`;

    const planInstruction = t('chat.chart_plan_instruction', { hint: chartHint });

    const msg = userContext
      ? t('chat.chart_convert_with_data', { label: session.chartLabel, layout: session.chartLayout, context: userContext, instruction: planInstruction })
      : t('chat.chart_convert_infer', { label: session.chartLabel, layout: session.chartLayout, instruction: planInstruction });

    try {
      const res = await fetch('/api/ai/edit', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          theme: deck.theme, outline, targetPage: session.pageIndex + 1,
          currentSlide: slide, message: msg, planOnly: true, locale,
        }),
      });
      const result = await res.json();
      const planText = result.plan || t('chat.chart_no_plan');

      setChartSession(prev => prev ? { ...prev, phase: 'confirming', planText } : null);

      // Dispatch to bottom sheet overlay on the canvas (Editor.tsx listens)
      window.dispatchEvent(new CustomEvent('lasca:chart-plan-ready', {
        detail: {
          chartLayout: session.chartLayout,
          chartLabel: session.chartLabel,
          planText,
          pageIndex: session.pageIndex,
        },
      }));

      // Also show a brief status in chat (no buttons — buttons are on the sheet)
      addChatMessage({
        id: msgId(), type: 'status', timestamp: Date.now(),
        text: t('chat.chart_plan_ready'),
        pages: [session.pageIndex + 1], scope: 'page',
      });
    } catch (err) {
      addChatMessage({ id: msgId(), type: 'done', text: t('chat.chart_plan_failed', { msg: (err as Error).message }), timestamp: Date.now() });
      setChartSession(null);
    } finally {
      setLoading(false);
    }
  }, [addChatMessage, chartSession, locale, t]);

  const handleConfirmAction = (action: string) => {
    setActiveConfirm(null);
    if (action === 'cancel') return;

    // --- Chart conversion flow ---
    if (action === 'chart:infer') {
      chartPlan(null);
      return;
    }
    if (action === 'chart:manual') {
      setChartSession(prev => prev ? { ...prev, phase: 'ask' } : null);
      addChatMessage({ id: msgId(), type: 'hint', text: t('chat.describe_data_hint'), timestamp: Date.now() });
      return;
    }
    if (action === 'chart:confirm' && chartSession) {
      const session = chartSession;
      // Use edited plan text from bottom sheet if available, otherwise original
      const finalPlan = editedPlanTextRef.current ?? session.planText;
      editedPlanTextRef.current = null;
      const msg = t('chat.chart_confirm_msg', { label: session.chartLabel, layout: session.chartLayout, plan: finalPlan ?? '' });
      addChatMessage({ id: msgId(), type: 'user', text: t('chat.confirm_generate'), timestamp: Date.now(), scope: 'page', scopeLabel: t('chat.scope.page', { n: session.pageIndex + 1 }) });
      handleEdit(msg, session.pageIndex, session.chartLayout);
      setChartSession(null);
      // Dismiss the bottom sheet
      window.dispatchEvent(new CustomEvent('lasca:chart-plan-dismiss'));
      return;
    }
    if (action === 'chart:adjust') {
      setChartSession(prev => prev ? { ...prev, phase: 'ask' } : null);
      addChatMessage({ id: msgId(), type: 'hint', text: t('chat.adjust_hint'), timestamp: Date.now() });
      // Dismiss the bottom sheet
      window.dispatchEvent(new CustomEvent('lasca:chart-plan-dismiss'));
      return;
    }

    // --- Batch continuation (rate-limit recovery) ---
    if (action === 'batch:continue' && batchContinuation) {
      const { remainingPages, message } = batchContinuation;
      setBatchContinuation(null);
      addChatMessage({ id: msgId(), type: 'user', text: t('chat.continue_pages', { range: `${remainingPages[0]}-${remainingPages[remainingPages.length - 1]}` }), timestamp: Date.now(), scope: 'multi' });
      handleMultiEdit(message, remainingPages);
      return;
    }

    addChatMessage({ id: msgId(), type: 'user', text: action.replace(/^(?:generate|edit-all):/, ''), timestamp: Date.now(), scope: 'global', scopeLabel: t('chat.confirm_label') });
    if (action.startsWith('generate:')) {
      handleGenerate(action.slice('generate:'.length));
    } else if (action.startsWith('edit-all:')) {
      handleMultiEdit(action.slice('edit-all:'.length));
    } else if (/^(generate|生成)/.test(action)) {
      handleGenerate(action);
    } else {
      handleEdit(action);
    }
  };
  // Keep ref in sync for event-based access (avoids stale closure in useEffect)
  handleConfirmActionRef.current = handleConfirmAction;

  /* ====================================================================
     Render helpers
     ==================================================================== */
  const isLastOfType = (msg: ChatMessage, idx: number) => {
    for (let i = idx + 1; i < chatMessages.length; i++) {
      if (chatMessages[i].type === msg.type) return false;
    }
    return true;
  };

  const scopeBadgeColor = (scope?: ChatMessage['scope']) => {
    switch (scope) {
      case 'page': return '#d97757';
      case 'multi': return '#6a9bcc';
      case 'global': return '#141413';
      default: return '#d97757';
    }
  };

  /* ====================================================================
     JSX
     ==================================================================== */
  return (
    <div style={{ width: 300, minWidth: 220, background: '#faf9f5', borderLeft: '1px solid #e8e6dc', display: 'flex', flexDirection: 'column', flexShrink: 0, height: '100%' }}>

      {/* ---- Header ---- */}
      <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e8e6dc', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <LascaBrand variant="full" size={12} />
          {/* 文字锁 toggle */}
          <button
            onClick={() => useEditorStore.getState().setContentLocked(!(activeDeck.contentLocked ?? false))}
            title={activeDeck.contentLocked ? t('chat.content_lock_on') : t('chat.content_lock_off')}
            style={{
              height: 18,
              padding: '0 6px',
              borderRadius: 9,
              background: activeDeck.contentLocked ? '#141413' : 'transparent',
              color: activeDeck.contentLocked ? '#fff' : '#b0aea5',
              border: activeDeck.contentLocked ? '1px solid #141413' : '1px solid #e8e6dc',
              fontSize: 10,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s ease-out',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              marginLeft: 2,
            }}
          >
            {activeDeck.contentLocked ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V4a5 5 0 0 1 10 0" />
              </svg>
            )}
            {t('chat.content_lock_label')}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* History icon — clock with arrow */}
          <button
            title={t('chat.history')}
            onClick={() => setShowHistory(h => !h)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: showHistory ? '#141413' : '#b0aea5', fontSize: 14, lineHeight: 1, borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#141413')}
            onMouseLeave={e => { if (!showHistory) e.currentTarget.style.color = '#b0aea5'; }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12C1 5.9 5.9 1 12 1c3.1 0 5.9 1.3 7.9 3.3" />
              <path d="M23 12c0 6.1-4.9 11-11 11-3.1 0-5.9-1.3-7.9-3.3" />
              <polyline points="20 4 20 0 16 0" transform="translate(0 0.5)" />
              <polyline points="4 20 4 24 8 24" transform="translate(0 -0.5)" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          {/* New chat icon — plus in circle */}
          <button
            title={t('chat.new_conversation')}
            onClick={() => {
              if (chatMessages.length > 0) {
                archiveChat();
              }
              initedDecks.current.delete(activeDeckId);
              addGreeting();
              initedDecks.current.add(activeDeckId);
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: '#b0aea5', fontSize: 14, lineHeight: 1, borderRadius: 4,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = '#141413')}
            onMouseLeave={e => (e.currentTarget.style.color = '#b0aea5')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---- History dropdown ---- */}
      {showHistory && (
        <div ref={historyRef} style={{
          position: 'absolute', top: 44, right: 8, zIndex: 50,
          width: 260, maxHeight: 320, overflowY: 'auto',
          background: '#fff', border: '1px solid #e8e6dc', borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          padding: '8px 0',
        }}>
          {chatConversations.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: 12, color: '#b0aea5' }}>
              {t('chat.no_history')}
            </div>
          ) : (
            [...chatConversations].reverse().map(conv => (
              <div
                key={conv.id}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f5f4ef')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div
                  onClick={() => {
                    loadConversation(conv.id);
                    setShowHistory(false);
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <div style={{ fontSize: 12, color: '#141413', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.title}
                  </div>
                  <div style={{ fontSize: 10, color: '#b0aea5', marginTop: 2 }}>
                    {new Date(conv.createdAt).toLocaleDateString()} · {t('chat.messages_count', { n: conv.messages.filter(m => m.type === 'user').length })}
                  </div>
                </div>
                <button
                  title={t('chat.delete')}
                  onClick={e => { e.stopPropagation(); deleteConversation(conv.id); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                    color: '#b0aea5', fontSize: 12, lineHeight: 1, borderRadius: 4,
                    transition: 'color 0.15s', flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#d97757')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#b0aea5')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* ---- Messages ---- */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', minHeight: 0 }}>
        {/* top fade mask */}
        <div style={{ position: 'sticky', top: 0, height: 24, background: 'linear-gradient(to bottom, #faf9f5, transparent)', zIndex: 1, pointerEvents: 'none' }} />

        <div style={{ padding: '0 16px 16px' }}>
          {chatMessages.map((msg, i) => (
            <div key={msg.id} style={{ marginBottom: 12, animation: 'chatFadeIn 0.3s ease-out' }}>

              {/* ---- user message ---- */}
              {msg.type === 'user' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 2 }}>
                  <div style={{ maxWidth: '85%' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 3, alignItems: 'center' }}>
                      {msg.scopeLabel && (
                        <span style={{
                          fontSize: 10,
                          color: '#fff',
                          background: scopeBadgeColor(msg.scope),
                          borderRadius: 3,
                          padding: '1px 5px',
                          fontWeight: 500,
                        }}>
                          {msg.scopeLabel}
                        </span>
                      )}
                    </div>
                    <div style={{
                      background: '#141413',
                      color: '#fff',
                      fontSize: 13,
                      padding: '8px 12px',
                      borderRadius: '12px 12px 4px 12px',
                      lineHeight: 1.6,
                      wordBreak: 'break-word',
                    }}>
                      {msg.text}
                    </div>
                  </div>
                </div>
              )}

              {/* ---- greeting ---- */}
              {msg.type === 'greeting' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#788c5d', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 13, color: '#141413', fontWeight: 500, lineHeight: 1.6 }}>{msg.text}</span>
                </div>
              )}

              {/* ---- hint ---- */}
              {msg.type === 'hint' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#b0aea5', flexShrink: 0, marginTop: 5 }} />
                  <span style={{ fontSize: 12, color: '#b0aea5', lineHeight: 1.6 }}>{msg.text}</span>
                </div>
              )}

              {/* ---- status ---- */}
              {msg.type === 'status' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {isLastOfType(msg, i) && loading
                    ? <div style={{ flexShrink: 0, marginTop: 4 }}><GlimmerSpinner size={9} /></div>
                    : <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6a9bcc', flexShrink: 0, marginTop: 6 }} />
                  }
                  <span style={{ fontSize: 13, color: '#141413', lineHeight: 1.6 }}>{msg.text}</span>
                </div>
              )}

              {/* ---- action ---- */}
              {msg.type === 'action' && (
                <AiActionBlock text={msg.text} detail={msg.detail} />
              )}

              {/* ---- done ---- */}
              {msg.type === 'done' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#788c5d', flexShrink: 0, marginTop: 5 }} />
                  <div style={{ fontSize: 13, color: '#141413', lineHeight: 1.6 }}>
                    {isLastOfType(msg, i) ? (
                      <StreamingText text={msg.text} style={{ fontWeight: 500 }} />
                    ) : (
                      <span style={{ fontWeight: 500 }}>{msg.text}</span>
                    )}
                  </div>
                </div>
              )}

              {/* ---- confirm ---- */}
              {msg.type === 'confirm' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#d97757', flexShrink: 0, marginTop: 5 }} />
                  <div>
                    <div style={{ fontSize: 13, color: '#141413', lineHeight: 1.6, marginBottom: activeConfirm ? 0 : 6 }}>{msg.text}</div>
                    {/* Hide inline buttons when sticky bar is pinned (buttons live there instead) */}
                    {msg.options && !activeConfirm && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {msg.options.map(opt => (
                          <button
                            key={opt.action}
                            onClick={() => handleConfirmAction(opt.action)}
                            disabled={loading}
                            style={{
                              fontSize: 11,
                              padding: '4px 10px',
                              borderRadius: 6,
                              border: '1px solid #e8e6dc',
                              background: '#fff',
                              color: '#141413',
                              cursor: loading ? 'default' : 'pointer',
                              opacity: loading ? 0.5 : 1,
                              fontWeight: 500,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { if (!loading) (e.target as HTMLElement).style.background = '#f0efeb'; }}
                            onMouseLeave={e => { (e.target as HTMLElement).style.background = '#fff'; }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {/* ---- Generation checklist (N5) + rotating working indicator ---- */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, animation: 'chatFadeIn 0.3s ease-out' }}>
              {phases && phases.length > 0 && <GenerationPhases phases={phases} />}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <GlimmerSpinner size={9} />
                <WorkingPhrase />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* bottom fade mask */}
        <div style={{ position: 'sticky', bottom: 0, height: 24, background: 'linear-gradient(to top, #faf9f5, transparent)', zIndex: 1, pointerEvents: 'none' }} />
      </div>

      {/* ---- Polish actions (PPTX faithful import) ---- */}
      {polishActions.filter(p => p.status === 'pending').length > 0 && (
        <div style={{
          maxHeight: 240, overflowY: 'auto',
          padding: '8px 12px 0', flexShrink: 0,
          borderTop: '1px solid #e8e6dc',
          background: '#f5f4ef',
        }}>
          <div style={{
            fontSize: 10, color: '#b0aea5', textTransform: 'uppercase' as const,
            letterSpacing: 0.5, fontWeight: 600, marginBottom: 6,
          }}>
            {t('chat.polish_label')} · {polishActions.filter(p => p.status === 'pending').length}
          </div>
          {polishActions.filter(p => p.status === 'pending').map(p => {
            const dotColor = p.suggestion.severity === 'high' ? '#d97757'
              : p.suggestion.severity === 'medium' ? '#e8a87c'
              : '#788c5d';
            const kindLabel = ({
              copy: t('chat.polish_kind.copy'), color: t('chat.polish_kind.color'), typography: t('chat.polish_kind.typography'),
              spacing: t('chat.polish_kind.spacing'), repair: t('chat.polish_kind.repair'),
            } as Record<string, string>)[p.suggestion.kind] || p.suggestion.kind;
            const accept = () => {
              const ok = applyRawHtmlPatch(p.pageIndex, p.suggestion.find, p.suggestion.replace);
              setPolishStatus(p.id, 'applied');
              addChatMessage({
                id: msgId(),
                type: 'done',
                text: ok
                  ? t('chat.polish_applied', { n: p.pageIndex + 1, desc: p.suggestion.description })
                  : t('chat.polish_skipped', { n: p.pageIndex + 1 }),
                timestamp: Date.now(),
              });
              if (ok) addSlideAction(p.pageIndex, '✦ ' + p.suggestion.description.slice(0, 24), '#788c5d');
            };
            const dismiss = () => setPolishStatus(p.id, 'dismissed');
            const focus = () => setCurrentIndex(p.pageIndex);
            return (
              <div key={p.id} style={{
                background: '#fff', border: '1px solid #e8e6dc',
                borderRadius: 8, padding: '8px 10px', marginBottom: 6,
                fontSize: 12, color: '#141413',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      onClick={focus}
                      style={{
                        background: 'transparent', border: 'none', padding: 0,
                        fontSize: 10, color: '#b0aea5', cursor: 'pointer',
                        fontFamily: 'inherit', display: 'block', marginBottom: 2,
                      }}
                      title={t('chat.jump_to_page')}
                    >
                      {t('chat.polish_page', { n: p.pageIndex + 1, kind: kindLabel })}
                    </button>
                    <div style={{ lineHeight: 1.5, fontWeight: 500 }}>{p.suggestion.description}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={dismiss}
                    style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 5,
                      border: '1px solid #e8e6dc', background: '#fff', color: '#b0aea5',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{t('chat.dismiss')}</button>
                  <button
                    onClick={accept}
                    style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 5,
                      border: 'none', background: '#d97757', color: '#fff',
                      cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >{t('chat.apply')}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---- md-context preview (sticky above input) ---- */}
      {pendingMdContext && (() => {
        const changeLevel = pendingMdContext.changeLevel;
        const meaningfulChanges = pendingMdContext.diff.changes.filter(
          c => c.kind !== 'parsed-frontmatter' && c.kind !== 'unchanged',
        );
        const heading = changeLevel === 'none'
          ? t('chat.md_clean')
          : changeLevel === 'heavy'
            ? t('chat.md_major_changes', { n: meaningfulChanges.length })
            : t('chat.md_minor_changes', { n: meaningfulChanges.length });
        const dotColor = changeLevel === 'heavy' ? '#d97757' : '#788c5d';
        return (
          <div style={{
            borderTop: '1px solid #e8e6dc',
            background: '#f5f4ef',
            padding: '10px 12px',
            flexShrink: 0,
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 5 }} />
              <div style={{ fontSize: 12, color: '#141413', fontWeight: 600, lineHeight: 1.5 }}>
                {heading}
              </div>
            </div>

            {meaningfulChanges.length > 0 && (
              <ul style={{
                listStyle: 'none',
                padding: '0 0 0 15px',
                margin: '0 0 8px 0',
                fontSize: 11,
                color: '#141413',
                lineHeight: 1.6,
              }}>
                {meaningfulChanges.slice(0, 6).map((c, i) => (
                  <li key={i} style={{ marginBottom: 2 }}>· {c.detail}</li>
                ))}
                {meaningfulChanges.length > 6 && (
                  <li style={{ color: '#b0aea5', marginTop: 2 }}>
                    {t('chat.md_more_changes', { n: meaningfulChanges.length - 6 })}
                  </li>
                )}
              </ul>
            )}

            {/* LLM1 self-review warnings */}
            {pendingMdContext.reviewWarnings && pendingMdContext.reviewWarnings.length > 0 && (
              <div style={{
                background: '#fef9ee',
                border: '1px solid #f0d9a0',
                borderRadius: 6,
                padding: '6px 10px',
                margin: '0 0 8px 0',
                fontSize: 11,
                lineHeight: 1.5,
                color: '#8a6d3b',
              }}>
                {pendingMdContext.reviewWarnings.map((w, i) => (
                  <div key={i} style={{ marginBottom: i < pendingMdContext.reviewWarnings!.length - 1 ? 2 : 0 }}>
                    {'\u26A0'} {w.message}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => setCanonicalExpanded(v => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                fontSize: 11,
                color: '#b0aea5',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: 6,
              }}
            >
              {canonicalExpanded ? t('chat.collapse_canonical') : t('chat.expand_canonical')}
            </button>

            {(canonicalExpanded || changeLevel === 'heavy') && (
              <pre style={{
                background: '#fff',
                border: '1px solid #e8e6dc',
                borderRadius: 6,
                padding: '8px 10px',
                fontSize: 11,
                lineHeight: 1.5,
                color: '#141413',
                fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                margin: '0 0 8px 0',
                maxHeight: 180,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {pendingMdContext.canonicalMd}
              </pre>
            )}

            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={editMdContext}
                disabled={loading}
                style={{
                  fontSize: 11,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #e8e6dc',
                  background: '#fff',
                  color: '#141413',
                  cursor: loading ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('chat.let_me_edit')}
              </button>
              <button
                onClick={approveMdContext}
                disabled={loading}
                style={{
                  fontSize: 11,
                  padding: '5px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#d97757',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: loading ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t('chat.go_ahead')}
              </button>
            </div>
          </div>
        );
      })()}

      {/* ---- Input area ---- */}
      <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>

        {/* undo toast */}
        {undoToast && (
          <div style={{
            background: '#141413',
            color: '#fff',
            fontSize: 12,
            padding: '6px 12px',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}>
            <span>{undoToast.text}</span>
            <button
              onClick={() => {
                useEditorStore.getState().undo();
                setUndoToast(null);
                if (undoTimerRef.current) clearInterval(undoTimerRef.current);
                addChatMessage({ id: msgId(), type: 'done', text: t('chat.undone'), timestamp: Date.now() });
              }}
              style={{ background: 'transparent', border: 'none', color: '#d97757', fontSize: 12, cursor: 'pointer', fontWeight: 600, padding: '0 0 0 8px' }}
            >
              {t('chat.undo_remaining', { n: undoToast.remaining })}
            </button>
          </div>
        )}

        {/* page selector pill */}
        <div ref={pagePickerRef} style={{ position: 'relative', marginBottom: 6 }}>
          <div
            onClick={() => setShowPagePicker(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              background: '#f5f4ef', borderRadius: 8,
              cursor: 'pointer', transition: 'background 0.1s',
              border: '1px solid #e8e6dc',
            }}
          >
            <span style={{ fontSize: 12, color: '#141413', fontWeight: 500 }}>
              {pageSelectorLabel} selected
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* select all icon */}
              <button
                title={t('chat.select_all')}
                onClick={e => {
                  e.stopPropagation();
                  if (isAllSelected) {
                    // Deselect all — clear store's multi-select; useEffect will reset selectedPages to [currentIndex + 1]
                    setSelectedSlideIndices([]);
                  } else {
                    // Select all — write to store so sidebar thumbnails also show all-selected;
                    // useEffect will mirror selectedPages.
                    setSelectedSlideIndices(Array.from({ length: totalPages }, (_, i) => i));
                  }
                }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  color: isAllSelected ? '#d97757' : '#b0aea5', fontSize: 11, lineHeight: 1,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#141413')}
                onMouseLeave={e => (e.currentTarget.style.color = isAllSelected ? '#d97757' : '#b0aea5')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  {isAllSelected && <polyline points="9 11 12 14 22 4" />}
                </svg>
              </button>
              {/* × close removed — user deselects via checkbox toggle or clicking elsewhere */}
            </div>
          </div>

          {/* page grid popup */}
          {showPagePicker && totalPages > 0 && (
            <div style={{
              position: 'absolute', bottom: '100%', left: 0, right: 0,
              marginBottom: 4, zIndex: 50,
              background: '#fff', border: '1px solid #e8e6dc', borderRadius: 10,
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
              padding: '8px 10px',
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                  const isSelected = selectedPages.includes(page);
                  return (
                    <button
                      key={page}
                      onClick={() => {
                        setSelectedPages(prev => {
                          if (isSelected) {
                            const next = prev.filter(p => p !== page);
                            return next.length > 0 ? next : [page]; // keep at least one
                          }
                          return [...prev, page];
                        });
                      }}
                      style={{
                        width: 28, height: 28,
                        borderRadius: 6,
                        border: isSelected ? '1.5px solid #d97757' : '1px solid #e8e6dc',
                        background: isSelected ? '#fef3ee' : '#fff',
                        color: isSelected ? '#d97757' : '#141413',
                        fontSize: 11, fontWeight: isSelected ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.1s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {page}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ---- Sticky confirm bar (pins unresolved confirmation buttons) ---- */}
        {activeConfirm && (
          <div style={{
            padding: '8px 12px',
            background: '#f5f4ef',
            borderRadius: 10,
            border: '1px solid #e8e6dc',
            marginBottom: 6,
            animation: 'chatFadeIn 0.2s ease-out',
          }}>
            <div style={{
              fontSize: 12, color: '#6b6a65', lineHeight: 1.5,
              marginBottom: 6, maxHeight: 40, overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {activeConfirm.text.length > 80 ? activeConfirm.text.slice(0, 80) + '...' : activeConfirm.text}
            </div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              {activeConfirm.options.map(opt => (
                <button
                  key={opt.action}
                  onClick={() => handleConfirmAction(opt.action)}
                  disabled={loading}
                  style={{
                    fontSize: 11,
                    padding: '4px 12px',
                    borderRadius: 6,
                    border: '1px solid #e8e6dc',
                    background: opt === activeConfirm.options[0] ? '#d97757' : '#fff',
                    color: opt === activeConfirm.options[0] ? '#fff' : '#141413',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.5 : 1,
                    fontWeight: 500,
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* B4 — cover variation picker. Appears above the input when the
             pipeline emits `cover-variations`. 3 thumbnails: [original, alt1,
             alt2]. Click alt → updateSlide(0, picked) + dismiss. Click current
             or × → just dismiss. Picker is component-local state; once closed
             it's gone for the session. */}
        {coverPicker && (() => {
          const logical = getLogicalDims(activeDeck);
          const THUMB_W = 108;
          const THUMB_H = Math.round(THUMB_W * logical.h / logical.w);
          const thumb = fitToBox(logical.w, logical.h, THUMB_W, THUMB_H);
          const applyPick = (slide: Slide | null) => {
            if (slide) {
              updateSlide(0, slide);
              addChatMessage({
                id: msgId(),
                type: 'status',
                text: t('chat.cover_picker_applied'),
                timestamp: Date.now(),
              });
            }
            setCoverPicker(null);
          };
          const options: { label: string; slide: Slide; isCurrent: boolean }[] = [
            { label: t('chat.cover_picker_current'), slide: coverPicker.original, isCurrent: true },
            ...coverPicker.alternates.map((s, i) => ({
              label: `Alt ${i + 1}`,
              slide: s,
              isCurrent: false,
            })),
          ];
          return (
            <div style={{
              marginBottom: 8,
              padding: '10px 12px',
              background: '#faf6f0',
              border: '1px solid #e8d7c6',
              borderRadius: 10,
              animation: 'chatFadeIn 0.3s ease-out',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}>
                <span style={{ fontSize: 12, color: '#7a5c42', fontWeight: 500 }}>
                  {t('chat.cover_picker_title')}
                </span>
                <button
                  onClick={() => setCoverPicker(null)}
                  aria-label={t('chat.cover_picker_dismiss')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#7a5c42',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: 2,
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => applyPick(opt.isCurrent ? null : opt.slide)}
                    title={opt.label}
                    style={{
                      padding: 0,
                      background: 'transparent',
                      border: `1.5px solid ${opt.isCurrent ? '#d97757' : '#e8d7c6'}`,
                      borderRadius: 6,
                      cursor: opt.isCurrent ? 'default' : 'pointer',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'stretch',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      if (!opt.isCurrent) e.currentTarget.style.borderColor = '#d97757';
                    }}
                    onMouseLeave={e => {
                      if (!opt.isCurrent) e.currentTarget.style.borderColor = '#e8d7c6';
                    }}
                  >
                    <SlideThumbnail
                      slide={opt.slide}
                      theme={activeDeck.theme}
                      w={logical.w}
                      h={logical.h}
                      scale={thumb.scale}
                    />
                    <span style={{
                      fontSize: 10,
                      color: opt.isCurrent ? '#d97757' : '#7a5c42',
                      padding: '3px 4px',
                      textAlign: 'center',
                      fontWeight: opt.isCurrent ? 600 : 400,
                    }}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* B1 — active single-field target chip. Shown when the user clicked
             a [data-field] in Canvas; the next chat edit rewrites only that
             JSON leaf. Click × to clear and fall back to whole-slide editing. */}
        {chatTargetField && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 8px',
            marginBottom: 6,
            background: '#faf6f0',
            border: '1px solid #e8d7c6',
            borderRadius: 6,
            fontSize: 12,
            color: '#7a5c42',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}>
            <span style={{ opacity: 0.7 }}>{t('chat.editing_field_prefix')}</span>
            <span>{chatTargetField}</span>
            <button
              onClick={() => setChatTargetField(null)}
              aria-label={t('chat.editing_field_clear')}
              style={{
                marginLeft: 2,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#7a5c42',
                fontSize: 12,
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* input container */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e8e6dc',
          overflow: 'hidden',
          transition: 'border-color 0.15s',
        }}
        data-lasca-file-drop-target="1"
        onDragOver={handleInputFileDragOver}
        onDrop={handleInputFileDrop}
        >
          <textarea
            ref={textareaRef}
            data-lasca-chat-composer="1"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              activeDeck.sourceMd
                ? t('chat.placeholder.report_mode')
                : loading
                  ? t('chat.placeholder.loading')
                  : t('chat.placeholder.default')
            }
            disabled={loading || Boolean(activeDeck.sourceMd)}
            rows={1}
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: '10px 12px 4px',
              fontSize: 13,
              color: '#141413',
              background: 'transparent',
              lineHeight: 1.5,
              maxHeight: 80,
              boxSizing: 'border-box',
              opacity: loading ? 0.5 : 1,
            }}
          />

          {/* send / stop button */}
          <div style={{ padding: '4px 8px 8px' }}>
            {isGenerating ? (
              <button
                onClick={handleStop}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: '#4a4a48',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.15s, background 0.15s',
                }}
              >
                {t('chat.stop_generating')}
              </button>
            ) : (
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                style={{
                  width: '100%',
                  padding: '6px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: '#d97757',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: (loading || !input.trim()) ? 'default' : 'pointer',
                  opacity: (loading || !input.trim()) ? 0.4 : 1,
                  transition: 'opacity 0.15s, background 0.15s',
                }}
              >
                {t('chat.send')}
              </button>
            )}
          </div>
        </div>

        {/* helper text */}
        <div style={{ textAlign: 'center', fontSize: 10, color: '#b0aea5', marginTop: 6, letterSpacing: 0.2 }}>
          {t('chat.send_hint')}
        </div>
      </div>
    </div>
  );
}
