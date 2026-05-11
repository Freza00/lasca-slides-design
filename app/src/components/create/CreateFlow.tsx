'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEditorStore } from '@/lib/store';
import { useLocale, useT } from '@/lib/i18n';
import { DECIDE_FOR_YOU_VALUE } from '@/lib/ai/harness/types';
import type { ClarifierQuestion, ClarifierAnswers, MdContext, PlanOutline, StylePresetId } from '@/lib/ai/harness/types';
import { isValidMdContext, summarizeRawMdContext } from '@/lib/ai/harness/validateMdContext';
import type { Theme, Slide, CoverData } from '@/lib/types';
import { derivePreset } from '@/lib/ai/harness/stylePresets';
import { mdLooksComplete, parseMd, type ParsedReport } from '@/lib/reports/mdToReportDeck';
import { TopicInput } from './TopicInput';
import { FullContentInput } from './FullContentInput';
import { ModeChooser } from './ModeChooser';
import { recommendMode, type FullContentMode, type ModeRecommendation } from '@/lib/ai/recommendMode';
import { QAStep } from './QAStep';
import { MdContextCards } from './MdContextCards';
import StylePicker from './StylePicker';
import { GenerationPreview } from './GenerationPreview';
import { FastPathGenerating } from './FastPathGenerating';
import { PlanPreview } from './PlanPreview';
import { StepErrorBoundary } from './StepErrorBoundary';
import { logger, logRemoteEvent } from '@/lib/logger';
import { addToast } from '@/lib/toast';
import { LascauxBg } from '@/components/ui/LascauxBg';
import { useFlagNumber } from '@/lib/featureFlags';
import { withSessionHeaders } from '@/lib/clientApi';
import {
  loadCreateDraft,
  saveCreateDraft,
  clearCreateDraft,
  shouldPersistStep,
} from '@/lib/createDraft';

type Step = 'input' | 'mode-pick' | 'content-qa' | 'building-mc' | 'plan-preview' | 'md-cards' | 'style-pick' | 'generating';

const STEP_LABEL_KEYS = [
  'create.step.input',
  'create.step.confirm',
  'create.step.outline',
  'create.step.adjust',
  'create.step.style',
  'create.step.generate',
] as const;

// Full-content mode has fewer steps (no QA step)
const FULL_CONTENT_STEP_LABEL_KEYS = [
  'create.step.input',
  'create.step.check_structure',
  'create.step.adjust',
  'create.step.style',
  'create.step.generate',
] as const;

function stepToIndex(step: Step, fullContent = false): number {
  if (fullContent) {
    switch (step) {
      case 'input': return 0;
      case 'mode-pick': return 0; // sub-step of input; same progress position
      case 'content-qa': return 1; // shouldn't happen in full-content mode
      case 'building-mc': return 1;
      case 'plan-preview': return 1;
      case 'md-cards': return 2;
      case 'style-pick': return 3;
      case 'generating': return 4;
    }
  }
  switch (step) {
    case 'input': return 0;
    case 'mode-pick': return 0; // unreachable in non-full-content mode but
                                // keeping the case shape exhaustive for TS
    case 'content-qa': return 1;
    case 'building-mc': return 2;
    case 'plan-preview': return 2;
    case 'md-cards': return 3;
    case 'style-pick': return 4;
    case 'generating': return 5;
  }
}

export function CreateFlow() {
  const t = useT();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const typeParam = searchParams.get('type') as 'slide' | 'report' | null;
  const format: 'slide' | 'report' = typeParam === 'report' ? 'report' : 'slide';
  const modeParam = searchParams.get('mode');
  const [forceNormalMode, setForceNormalMode] = useState(false);
  const isFullContent = modeParam === 'full-content' && !forceNormalMode;

  const addDeck = useEditorStore(s => s.addDeck);
  const deckCount = useEditorStore(s => s.decks.length);
  const pendingImportRedesign = useEditorStore(s => s.pendingImportRedesign);
  const setPendingImportRedesign = useEditorStore(s => s.setPendingImportRedesign);
  const maxDecks = useFlagNumber('max_decks', 999);

  // If arriving from import redesign (?step=style-pick), jump to style picker
  const stepParam = searchParams.get('step');
  const fromEditor = searchParams.get('from') === 'editor';
  const prefillParam = searchParams.get('prefill');
  const importRedesignRef = useRef(false);

  // Read prefill content from sessionStorage (set by full-content too-short redirect)
  const prefillValue = useMemo(() => {
    if (prefillParam !== '1') return undefined;
    try {
      const val = sessionStorage.getItem('lasca-prefill');
      if (val) sessionStorage.removeItem('lasca-prefill');
      return val || undefined;
    } catch { return undefined; }
  }, [prefillParam]);

  const [step, setStep] = useState<Step>(() => {
    if (stepParam === 'style-pick' && pendingImportRedesign) return 'style-pick';
    return 'input';
  });
  const [rawInput, setRawInput] = useState('');
  const [questions, setQuestions] = useState<ClarifierQuestion[]>([]);
  const [answers, setAnswers] = useState<ClarifierAnswers>({});
  // Raw TopicInput form state (pre-transform) — preserved across step
  // navigation so going back to the Describe step rehydrates pills / extra
  // note / custom inputs. Null before first submit.
  const [topicFormState, setTopicFormState] = useState<{
    answers: ClarifierAnswers;
    customMode: Record<string, boolean>;
    customValues: Record<string, string>;
    extraNote: string;
    touched?: string[];
  } | null>(null);
  const [mdContext, setMdContext] = useState<MdContext | null>(() => {
    if (stepParam === 'style-pick' && pendingImportRedesign) return pendingImportRedesign.mdContext;
    return null;
  });
  const [planOutline, setPlanOutline] = useState<PlanOutline | null>(null);
  // Tracks whether we've completed the post-mount restore from sessionStorage.
  // Until true, the persist effect must NOT write — otherwise the empty
  // initial state would clobber a valid stored draft before we get to
  // restore it.
  const draftHydratedRef = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Filled by /api/ai/clarify — true means this content is unstructured (or
  // topic mode) and should go through plan-outline review; false skips it.
  const [needsPlanReview, setNeedsPlanReview] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [buildProgress, setBuildProgress] = useState(0); // 0-3 for animated loading steps
  // Wall-clock elapsed seconds for any long-wait state (clarify / mdContext).
  // The UI shows it so the user knows the request is alive during multi-minute
  // LLM calls (reasoning models can take 3-8 min on long source md).
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Guard: only fetch AI supplemental questions once per session */
  const aiSupplementalFetched = useRef(false);
  /** Guard: prevents duplicate addDeck when GenerationPreview auto-saves on `done`
   *  and the user subsequently clicks Edit/Play (both go through saveGeneratedDeck).
   *  Reset at the start of each new generation in handleGenerate. */
  const savedDeckRef = useRef<string | null>(null);

  // Style picker state
  const [selectedTheme, setSelectedTheme] = useState<Theme>('warm');
  const [selectedPresetId, setSelectedPresetId] = useState<StylePresetId | null>(null);

  // Fast-path state — when a complete report md is pasted, we parse it
  // locally (no LLM) and short-circuit to style-pick. Pagination happens in
  // handleGenerate once the theme is locked, so DOM measurement uses the
  // actual fonts the user picked.
  const [pendingReportParse, setPendingReportParse] = useState<
    | { parsed: ParsedReport; rawContent: string; defaultName: string }
    | null
  >(null);

  // Mode recommendation snapshotted when the user clicks Next from
  // FullContentInput; surfaced by <ModeChooser /> at step === 'mode-pick'.
  // Cleared after the user picks a mode (or goes back).
  const [modeRecommendation, setModeRecommendation] = useState<ModeRecommendation | null>(null);
  // Which mode the user actually picked. Phase B: 'asis' triggers the
  // existing fast path; 'polish' and 'generate' both route through the
  // current LLM clarifier path. Phase C will split polish into its own
  // workflow with stricter LLM constraints + a content-question clarifier.
  const [pickedMode, setPickedMode] = useState<FullContentMode | null>(null);

  // ── One-time: consume pendingImportRedesign on mount ────────────────
  useEffect(() => {
    if (importRedesignRef.current) return;
    if (pendingImportRedesign && stepParam === 'style-pick') {
      importRedesignRef.current = true;
      setRawInput(pendingImportRedesign.mdContext.canonicalMd);
      setPendingImportRedesign(null); // consumed
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Diagnostics: capture every step transition + window-level errors ──
  // The previous bug round produced a "page silently flipped to input,
  // no console error" symptom. The user may have had DevTools closed; an
  // unhandled rejection or window error would have been invisible. This
  // mounts a fall-through capture so the next reproduction lands in the
  // server log even without DevTools.
  const prevStepRef = useRef<Step>(step);
  useEffect(() => {
    if (prevStepRef.current !== step) {
      logRemoteEvent('create_step_change', {
        from: prevStepRef.current,
        to: step,
        hasRawInput: rawInput.length > 0,
        hasAnswers: Object.keys(answers).length > 0,
        hasPlanOutline: !!planOutline,
        hasMdContext: !!mdContext,
        format,
      });
      prevStepRef.current = step;
    }
  }, [step, rawInput, answers, planOutline, mdContext, format]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onError = (e: ErrorEvent) => {
      logRemoteEvent('window_error', {
        route: '/create',
        step: prevStepRef.current,
        message: e.message,
        filename: e.filename,
        lineno: e.lineno,
        colno: e.colno,
        stack: e.error?.stack?.split('\n').slice(0, 5).join('\n'),
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string; stack?: string } | string | undefined;
      logRemoteEvent('window_unhandled_rejection', {
        route: '/create',
        step: prevStepRef.current,
        message: typeof reason === 'string' ? reason : reason?.message,
        stack: typeof reason === 'object' ? reason?.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      });
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  // Re-entering the describe step (back button, progress-bar jump, or fresh
  // mount) re-enables the AI clarifier fetch. Without this, re-submits after
  // an edit would hang on an infinite Confirm-step spinner because
  // fetchAiQuestions early-returns while setLoadingMore(true) already fired.
  useEffect(() => {
    if (step === 'input') {
      aiSupplementalFetched.current = false;
    }
  }, [step]);

  // Tick elapsed counter while waiting on clarify or mdContext build. Reset on
  // every step change so the counter starts at 0 each time the user enters a
  // wait state.
  useEffect(() => {
    const isWaiting = step === 'content-qa' || step === 'building-mc';
    setElapsedSecs(0);
    if (!isWaiting) return;
    const start = Date.now();
    const id = setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // Restore an in-flight draft from sessionStorage on mount. Done in an
  // effect (not in useState initializers) because sessionStorage is
  // client-only and reading it during render produces an SSR/CSR
  // hydration mismatch. The brief flash of `step='input'` before the
  // restored step paints is acceptable in a crash-recovery context.
  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    if (stepParam === 'style-pick' && pendingImportRedesign) return;
    const draft = loadCreateDraft(format);
    if (!draft) return;
    if (draft.rawInput) setRawInput(draft.rawInput);
    if (draft.answers && Object.keys(draft.answers).length > 0) setAnswers(draft.answers);
    if (draft.topicFormState) setTopicFormState(draft.topicFormState);
    if (draft.planOutline) setPlanOutline(draft.planOutline);
    if (draft.mdContext) setMdContext(draft.mdContext);
    // Remap transient steps to the most recent committed step they came
    // from. Restoring at 'building-mc' or 'generating' would land the user
    // on a spinner with no in-flight stream — unrecoverable.
    let restoredStep: Step = draft.step;
    if (restoredStep === 'building-mc') {
      restoredStep = draft.planOutline ? 'plan-preview' : (draft.rawInput ? 'content-qa' : 'input');
    } else if (restoredStep === 'generating') {
      restoredStep = draft.mdContext ? 'style-pick' : 'input';
    }
    if (restoredStep !== draft.step) {
      logRemoteEvent('draft_restore_remap', { from: draft.step, to: restoredStep });
    }
    setStep(restoredStep);
  }, [format, stepParam, pendingImportRedesign]);

  // Persist creation-flow state to sessionStorage so a crash that escapes
  // both the SSE shape guard and StepErrorBoundary doesn't wipe topic /
  // outline / mdContext. Debounced 300ms — typing in TopicInput would
  // otherwise write on every keystroke. Only persist while the user is in
  // a recoverable step; transient (building-mc / generating) and terminal
  // (input) states are skipped. Skipped before the hydrate effect runs so
  // the empty initial state can't overwrite a stored draft.
  useEffect(() => {
    if (!draftHydratedRef.current) return;
    if (!shouldPersistStep(step)) return;
    const handle = setTimeout(() => {
      saveCreateDraft(format, {
        step,
        rawInput,
        answers,
        topicFormState,
        planOutline,
        mdContext,
      });
    }, 300);
    return () => clearTimeout(handle);
  }, [format, step, rawInput, answers, topicFormState, planOutline, mdContext]);

  // ── Fetch AI contextual questions in parallel (non-blocking) ────────
  const fetchAiQuestions = useCallback(async (
    input: string,
    mode: 'topic' | 'full-content',
    existingAnswers: ClarifierAnswers,
    polishMode = false,
  ) => {
    if (aiSupplementalFetched.current) return;
    aiSupplementalFetched.current = true;
    setLoadingMore(true);
    let gotQuestions = false;
    let planReviewFromServer = true;  // default conservative
    // 10-min hard timeout: clarify normally finishes in 30-180s; anything
    // longer indicates upstream hang (gateway dead / model stuck). Without
    // this abort the UI sits on "Check Structure" forever because there's
    // no SSE-style inactivity signal on a plain POST.
    let timedOut = false;
    const clarifyController = new AbortController();
    const clarifyTimeout = setTimeout(() => {
      timedOut = true;
      clarifyController.abort();
    }, 10 * 60 * 1000);
    try {
      const res = await fetch('/api/ai/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: clarifyController.signal,
        body: JSON.stringify({
          rawInput: input,
          existingAnswers,
          workflow: 'generate-from-draft',
          mode,
          format,
          locale,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        planReviewFromServer = data.needsPlanReview !== false;
        if (data.questions?.length > 0) {
          setQuestions(prev => [...prev, ...data.questions]);
          gotQuestions = true;
        }
      }
    } catch (err) {
      // Distinguish timeout abort from generic failure: timeout surfaces as a
      // toast and resets to input so the user can retry; other errors fall
      // through to the existing silent-fallthrough behaviour (cascade to
      // fetchMdContext, since clarify is non-critical when the upstream
      // responds at all).
      const isTimeout = timedOut || (err as Error)?.name === 'AbortError';
      if (isTimeout) {
        clearTimeout(clarifyTimeout);
        setLoadingMore(false);
        setStep('input');
        aiSupplementalFetched.current = false;
        addToast('error', t('create.error.timeout'));
        return;
      }
      logger.warn('ai', 'AI contextual questions failed, non-critical');
    } finally {
      clearTimeout(clarifyTimeout);
      if (!timedOut) {
        setLoadingMore(false);
        setNeedsPlanReview(planReviewFromServer);
        if (!gotQuestions) {
          fetchMdContext(input, existingAnswers, { skipPlanIfStructured: !planReviewFromServer, polishMode });
        }
      }
    }
  }, [format, locale, t]);

  // ── Step 1 → Step 2 (AI content questions) or Step 3 (md-context) ──
  // Template questions (audience/length/density/data/takeaway) are now
  // inline selectors in TopicInput — answers arrive with the submit.
  const handleTopicSubmit = useCallback((
    input: string,
    templateAnswers: ClarifierAnswers,
    raw: {
      answers: ClarifierAnswers;
      customMode: Record<string, boolean>;
      customValues: Record<string, string>;
      extraNote: string;
      touched: string[];
    },
  ) => {
    setRawInput(input);
    setAnswers(templateAnswers);
    setTopicFormState(raw);

    // Always go to Step 2 for AI content questions — even short topics need clarification
    setQuestions([]);
    setStep('content-qa');
    setLoadingMore(true);
    fetchAiQuestions(input, 'topic', templateAnswers);
  }, [fetchAiQuestions]);

  // ── Step 2 → Step 3: merge AI answers with template answers from Step 1 ──
  // Strip `__defer__` sentinels so downstream LLM1/LLM2 see no value for axes
  // the user abdicated — default-recommendation path runs for those.
  const handleQAComplete = useCallback(async (aiAnswers: ClarifierAnswers) => {
    const stripped: ClarifierAnswers = {};
    for (const [k, v] of Object.entries(aiAnswers)) {
      if (v === DECIDE_FOR_YOU_VALUE) continue;
      if (Array.isArray(v)) {
        const filtered = v.filter(x => x !== DECIDE_FOR_YOU_VALUE);
        if (filtered.length > 0) stripped[k] = filtered;
      } else {
        stripped[k] = v;
      }
    }
    const merged = { ...answers, ...stripped };
    setAnswers(merged);
    const polishMode = pickedMode === 'polish';
    if (needsPlanReview) {
      fetchMdContext(rawInput, merged, { polishMode });
    } else {
      fetchMdContext(rawInput, merged, { skipPlanIfStructured: true, polishMode });
    }
  }, [rawInput, answers, needsPlanReview, pickedMode]);

  // ── Fetch md-context via SSE ───────────────────────────────────────
  const fetchMdContext = useCallback(async (input: string, ans: ClarifierAnswers, opts?: { skipPlanIfStructured?: boolean; polishMode?: boolean }) => {
    setStep('building-mc');
    setBuildProgress(0);
    // Animate through loading steps
    const progressTimer = setInterval(() => {
      setBuildProgress(p => Math.min(p + 1, 3));
    }, 1500);

    abortRef.current = new AbortController();
    const controller = abortRef.current;
    // Inactivity-based timeout: aborts if *no SSE traffic* (including backend
    // heartbeats) for 5 min. Backend sends a heartbeat every 10s, so under
    // normal conditions this never fires — but proxy/network layers can buffer
    // SSE frames during a 4-7 min reasoning-model LLM call, delaying
    // heartbeats. 5 min is generous enough to ride through one buffered round
    // trip without masking a genuinely stalled backend.
    const INACTIVITY_MS = 300 * 1000;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => controller.abort(), INACTIVITY_MS);
    };
    resetInactivity();
    const clearInactivity = () => { if (inactivityTimer) clearTimeout(inactivityTimer); };
    // Track the most recent non-fatal SSE `error` event. The orchestrator
    // emits these for "recoverable, page-scoped" failures — but if the
    // stream then ends without an mdContext, the failure is not actually
    // recoverable from the user's POV, and the captured message is more
    // useful than a generic "no response received".
    let lastNonFatalError: string | null = null;

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workflow: 'generate-from-draft',
          rawInput: input,
          clarifierAnswers: ans,
          aiQuestions: questions.map(q => ({ id: q.id, question: q.question })),
          pageCount: typeof ans.length === 'number' ? ans.length : undefined,
          skipClarifier: true, // we already ran it client-side
          format,
          theme: selectedTheme,
          locale,
          skipPlanIfStructured: opts?.skipPlanIfStructured,
          polishMode: opts?.polishMode,
          // Don't pass mdContextOverride — we want the orchestrator to build it
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetInactivity();
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;

          const event = JSON.parse(raw);
          if (event.type === 'heartbeat') continue;
          if (event.type === 'content-too-short') {
            // Content is too short for full-content mode — switch to normal TopicInput
            clearInterval(progressTimer);
            clearInactivity();
            reader.cancel();
            addToast('warn', t('create.content_too_short'));
            // Switch to normal mode with content pre-filled (rawInput already set)
            setForceNormalMode(true);
            setStep('input');
            return;
          }
          if (event.type === 'plan-outline') {
            setPlanOutline(event.data.plan as PlanOutline);
            clearInterval(progressTimer);
            setStep('plan-preview');
            reader.cancel();
            clearInactivity();
            return;
          }
          if (event.type === 'md-context-preview') {
            const rawMd = event.data?.mdContext;
            if (!isValidMdContext(rawMd)) {
              logger.error('ai', 'malformed mdContext from SSE (fetchMdContext)', summarizeRawMdContext(rawMd));
              throw new Error(t('create.error.malformed_mdcontext'));
            }
            setMdContext(rawMd);
            clearInterval(progressTimer);
            setGenerating(false);
            setStep('md-cards');
            reader.cancel();
            clearInactivity();
            return;
          }
          if (event.type === 'clarify-needed') {
            // LLM detected a conflict (e.g., content too rich for page count)
            // Go back to Q&A step with the new questions appended
            clearInterval(progressTimer);
            const newQs = event.questions as ClarifierQuestion[];
            setQuestions(prev => [...prev, ...newQs]);
            setStep('content-qa');
            reader.cancel();
            clearInactivity();
            return;
          }
          if (event.type === 'error') {
            // Fail-open: only escalate to a user-visible failure when the
            // producer explicitly marks the event fatal. Non-fatal errors
            // are logged AND remembered so we can surface the most recent
            // one if the stream ends without delivering an mdContext.
            if (event.data?.fatal === true) {
              throw new Error(event.data.message);
            }
            const msg = event.data?.message ?? 'unspecified';
            lastNonFatalError = msg;
            logger.warn('ai', 'non-fatal SSE error (fetchMdContext)', { msg });
            continue;
          }
        }
      }

      // Stream ended without md-context-preview. If we collected any
      // non-fatal error along the way, surface it — the user's flow
      // depended on this stream actually producing an outline, so the
      // "recoverable" framing on the server doesn't apply here.
      throw new Error(lastNonFatalError ?? t('create.error.no_response'));
    } catch (err) {
      clearInactivity();
      clearInterval(progressTimer);
      if ((err as Error).name === 'AbortError') {
        addToast('error', t('create.error.timeout'));
      } else {
        addToast('error', t('create.error.md_context', { msg: (err as Error).message }));
      }
      logger.error('ai', 'md-context fetch failed', { error: (err as Error).message });
      // Fall back to the most recent step that still has user state. Going
      // straight to 'input' looks like all progress was wiped — even though
      // rawInput / answers / planOutline are still in memory — and is the
      // exact symptom users reported as "silently flipped to step 1".
      if (planOutline) {
        setStep('plan-preview');
      } else if (questions.length > 0) {
        setStep('content-qa');
      } else {
        setStep('input');
      }
    }
  }, [format, locale, t, router, planOutline, questions]);

  // ── Full-content mode: submit → Step 2 LLM Q&A for content-specific axes ──
  // Step 1 pills (purpose/length/language/narrative/evidence/density + optional
  // length override) arrive as `step1Answers`. We forward to /api/ai/clarify,
  // which inspects structure: structured md → compact Q&A + skip plan review;
  // unstructured → full Q&A + plan review. Route determined later in
  // handleQAComplete via `needsPlanReview`.
  const handleFullContentSubmit = useCallback((content: string, step1Answers: ClarifierAnswers) => {
    setRawInput(content);
    setAnswers(step1Answers);
    // Stash a recommendation so <ModeChooser> can pre-select a card. The
    // user always overrides at click time; whatever they pick goes through
    // the same fallback chain in handleModePick.
    setModeRecommendation(recommendMode(content, format));
    setPickedMode(null);
    setStep('mode-pick');
  }, [format]);

  // ── Mode-pick handler ────────────────────────────────────────────────
  // User selected one of the three commitment levels. Each level has a
  // specific success path and a one-step fallback when the content can't
  // honor that commitment:
  //   asis     → parseMd → style-pick   (report only); fallback: polish
  //   polish   → LLM polish path        (Phase C); fallback: generate
  //   generate → LLM generate path      (always succeeds)
  //
  // Phase B: 'polish' temporarily routes through the existing
  // fetchAiQuestions/generate path with a flag so we can ship the UX
  // without yet having the polish prompt + clarifier. Phase C swaps in the
  // real polish-from-draft workflow.
  const handleModePick = useCallback((mode: FullContentMode) => {
    // Resolve the user's pick down through the fallback chain to a final
    // executable mode. This keeps the routing block below flat.
    let resolved: FullContentMode = mode;

    if (resolved === 'asis') {
      // As-is success requires deterministic md → ParsedReport. That only
      // exists for reports; slides have no equivalent splitter yet.
      const canParseAsis = format === 'report' && mdLooksComplete(rawInput);
      if (!canParseAsis) {
        addToast('info', t('create.mode.asis_fallback_polish'));
        resolved = 'polish';
      }
    }

    if (resolved === 'polish' && rawInput.trim().length < 200) {
      addToast('info', t('create.mode.polish_fallback_generate'));
      resolved = 'generate';
    }

    setPickedMode(resolved);

    // Execute the resolved mode.
    if (resolved === 'asis') {
      try {
        const parsed = parseMd(rawInput, { locale });
        logger.info('general', 'report full-content: parsed locally', {
          chars: rawInput.length,
          elementCount: parsed.elements.length,
        });
        setPendingReportParse({
          parsed,
          rawContent: rawInput,
          defaultName: t('create.default_report_name'),
        });
        setQuestions([]);
        setStep('style-pick');
        return;
      } catch (err) {
        // parseMd failed at execution time even though mdLooksComplete
        // passed (rare malformed-md case). Surface and fall to polish.
        logger.warn('general', 'parseMd threw at asis execute, falling back to polish', {
          error: (err as Error).message,
        });
        addToast('warn', t('create.report_local_split_failed'));
        resolved = 'polish';
        setPickedMode('polish');
      }
    }

    // Polish and generate share the same clarifier UI (audience / density /
    // narrative / etc.). Their downstream divergence is a single flag —
    // polishMode — that injects a hard "preserve every paragraph" constraint
    // into buildMdContext's user message. Wired into both fetchAiQuestions
    // (which falls through to fetchMdContext when the clarifier is empty)
    // and handleQAComplete (which calls fetchMdContext directly after the
    // user answers).
    setQuestions([]);
    setStep('content-qa');
    setLoadingMore(true);
    fetchAiQuestions(rawInput, 'full-content', answers, resolved === 'polish');
  }, [format, rawInput, answers, locale, t, fetchAiQuestions]);

  // ── Fetch full md-context based on approved plan ──
  // (defined here so handlePlanApprove can reference it)
  const fetchMdContextFromPlan = useCallback(async (plan: PlanOutline) => {
    setStep('building-mc');
    setBuildProgress(0);
    const progressTimer = setInterval(() => {
      setBuildProgress(p => Math.min(p + 1, 3));
    }, 1500);

    const controller = new AbortController();
    const INACTIVITY_MS = 300 * 1000;
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
    const resetInactivity = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => controller.abort(), INACTIVITY_MS);
    };
    resetInactivity();
    const clearInactivity = () => { if (inactivityTimer) clearTimeout(inactivityTimer); };

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workflow: 'generate-from-draft',
          rawInput: rawInput,
          clarifierAnswers: answers,
          planOverride: plan,
          pageCount: plan.pages.length,
          skipClarifier: true,
          format,
          theme: selectedTheme,
          locale,
          polishMode: pickedMode === 'polish',
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetInactivity();
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;

          const event = JSON.parse(raw);
          if (event.type === 'heartbeat') continue;
          if (event.type === 'md-context-preview') {
            const rawMd = event.data?.mdContext;
            if (!isValidMdContext(rawMd)) {
              logger.error('ai', 'malformed mdContext from SSE (fetchMdContextFromPlan)', summarizeRawMdContext(rawMd));
              throw new Error(t('create.error.malformed_mdcontext'));
            }
            setMdContext(rawMd);
            clearInterval(progressTimer);
            setGenerating(false);
            setStep('md-cards');
            reader.cancel();
            clearInactivity();
            return;
          }
          if (event.type === 'error') {
            if (event.data?.fatal === true) {
              throw new Error(event.data.message);
            }
            logger.warn('ai', 'non-fatal SSE error (fetchMdContextFromPlan)', { msg: event.data?.message });
            continue;
          }
        }
      }

      throw new Error(t('create.error.no_response'));
    } catch (err) {
      clearInactivity();
      clearInterval(progressTimer);
      setGenerating(false);
      if ((err as Error).name === 'AbortError') {
        addToast('error', t('create.error.timeout'));
      } else {
        addToast('error', t('create.error.generate', { msg: (err as Error).message }));
      }
      setStep('plan-preview');
    }
  }, [answers, format, locale, rawInput, t]);

  const handlePlanApprove = useCallback((approvedPlan: PlanOutline) => {
    if (generating) return;
    setGenerating(true);
    setPlanOutline(approvedPlan);
    fetchMdContextFromPlan(approvedPlan);
  }, [generating, fetchMdContextFromPlan]);

  // ── Plan feedback → regenerate plan with user's feedback ──
  function extractPageCountFromFeedback(text: string): number | null {
    const zhMatch = text.match(/(\d+)\s*页/);
    if (zhMatch) return parseInt(zhMatch[1], 10);
    const enMatch = text.match(/(\d+)\s*pages?/i);
    if (enMatch) return parseInt(enMatch[1], 10);
    return null;
  }

  const handlePlanFeedback = useCallback(async (currentPlan: PlanOutline, feedbackText: string) => {
    if (generating) return;
    setGenerating(true);
    setStep('building-mc');
    setBuildProgress(0);
    const progressTimer = setInterval(() => setBuildProgress(p => Math.min(p + 1, 3)), 1500);

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: withSessionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workflow: 'generate-from-draft',
          rawInput: locale === 'en'
            ? `${rawInput}\n\n[User feedback on the structure plan: ${feedbackText}]\n\n[Current structure:\n${currentPlan.pages.map((p, i) => `${i + 1}. [${p.pageType}] ${p.title}`).join('\n')}\n]`
            : `${rawInput}\n\n[用户对结构规划的反馈：${feedbackText}]\n\n[当前结构：\n${currentPlan.pages.map((p, i) => `${i + 1}. [${p.pageType}] ${p.title}`).join('\n')}\n]`,
          clarifierAnswers: answers,
          aiQuestions: questions.map(q => ({ id: q.id, question: q.question })),
          pageCount: extractPageCountFromFeedback(feedbackText) ?? currentPlan.pages.length,
          skipClarifier: true,
          format,
          theme: selectedTheme,
          locale,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;
          const event = JSON.parse(raw);
          if (event.type === 'plan-outline') {
            setPlanOutline(event.data.plan as PlanOutline);
            clearInterval(progressTimer);
            setStep('plan-preview');
            reader.cancel();
            return;
          }
          if (event.type === 'error') {
            // Was previously dropped silently — leaving generating=true and
            // the UI stuck in 'building-mc'. Fail-open polarity per
            // feedback_lasca_sse_failopen.md.
            if (event.data?.fatal === true) {
              throw new Error(event.data.message);
            }
            logger.warn('ai', 'non-fatal SSE error (handlePlanFeedback)', { msg: event.data?.message });
            continue;
          }
        }
      }

      // Stream ended without a plan-outline event — surface as an error so
      // the catch below clears `generating` and returns the user to the
      // plan-preview step.
      throw new Error(t('create.error.no_response'));
    } catch (err) {
      clearInterval(progressTimer);
      setGenerating(false);
      addToast('error', t('create.error.adjust', { msg: (err as Error).message }));
      setStep('plan-preview');
    }
  }, [answers, format, generating, locale, questions, rawInput, t]);

  // (fetchMdContextFromPlan is defined above, before handlePlanApprove)

  // ── Step 3 → Step 4 (outline done, go to style picker) ────────────
  const handleOutlineContinue = useCallback(() => {
    if (!mdContext) return;
    setStep('style-pick');
  }, [mdContext]);

  // ── Step 5: Generate → stay on page, show preview ────────────────
  const handleGenerate = useCallback(async () => {
    // Fast-path: report md was parsed locally. Skip paged.js here — the
    // editor's ReportEditor pane runs it live against `deck.sourceMd`. We
    // still pad the 'generating' phase to MIN_FASTPATH_ANIM_MS so the
    // transition reads as intentional rather than abrupt.
    if (pendingReportParse) {
      if (deckCount >= maxDecks) {
        addToast('warn', t('error.deck_limit'));
        return;
      }
      setGenerating(true);
      setStep('generating');
      const MIN_FASTPATH_ANIM_MS = 1600;
      await new Promise(res => setTimeout(res, MIN_FASTPATH_ANIM_MS));

      const { parsed, rawContent, defaultName } = pendingReportParse;
      const name = parsed.cover?.title || defaultName;
      const deckId = 'deck-' + Date.now();
      addDeck({
        id: deckId,
        name,
        theme: selectedTheme,
        slides: [],
        pageSize: 'letter',
        header: parsed.header,
        footer: parsed.footer,
        sourceMd: rawContent,
      });
      if (selectedPresetId) {
        useEditorStore.getState().setDeckPresetId(selectedPresetId);
      }
      logger.info('general', 'fast-path report deck ready', {
        chars: rawContent.length,
      });
      logRemoteEvent('deck_created', {
        source: 'create',
        destination: 'editor',
        slideCount: 0,
        format,
      });
      clearCreateDraft(format);
      router.push('/editor');
      return;
    }

    if (!mdContext || generating) return;
    // New generation run: clear the idempotency guard so auto-save can create
    // a fresh deck instead of returning the previous run's id.
    savedDeckRef.current = null;
    setGenerating(true);
    setStep('generating');
    // GenerationPreview component handles SSE streaming + preview animation
  }, [pendingReportParse, deckCount, maxDecks, t, addDeck, selectedTheme, selectedPresetId, format, router, mdContext, generating, locale]);

  // ── After generation: idempotent persist + navigate ─────────────────
  //
  // Previously `handleEnterEditor` / `handlePresent` created a fresh deck on
  // every call, and the deck was only persisted when the user clicked one of
  // those buttons. Closing the tab, hitting back, or letting the connection
  // time out all silently discarded the generated slides — the React state
  // holding them evaporated with the component.
  //
  // Now GenerationPreview calls `saveGeneratedDeck` the moment slides are
  // ready (on `done`, or on timeout/error with accumulated earlySlides).
  // `savedDeckRef` guarantees the same slides don't get added twice when the
  // user later clicks Edit/Play.
  const saveGeneratedDeck = useCallback((slides: Slide[], presetId?: string): string | null => {
    if (savedDeckRef.current) return savedDeckRef.current;
    if (deckCount >= maxDecks) {
      addToast('warn', t('error.deck_limit'));
      return null;
    }
    const deckId = 'deck-' + Date.now();
    const pageSize = format === 'report' ? 'letter' as const : 'slide-16:9' as const;
    // Phase B step 7: composer-driven cover variant. The composer reads the
    // theme's family and picks a default cover; we apply it to every cover-
    // layout slide that doesn't already carry a coverVariant. Family='base'
    // (or theme without a family) returns 'default' → no-op. The LLM is also
    // told (via family prompt + cover schema) to set coverVariant itself; this
    // mutation is a backstop for when the LLM forgets the field.
    const composed = derivePreset({ theme: selectedTheme });
    const slidesWithCover = slides.map((s) => {
      if (s.layout !== 'cover' || composed.cover === 'default') return s;
      const data = s.data as CoverData;
      if (data.coverVariant) return s;
      return { ...s, data: { ...data, coverVariant: composed.cover } };
    });
    addDeck({
      id: deckId,
      name: mdContext?.frontmatter.title || (format === 'slide' ? t('create.new_slide') : t('create.new_report')),
      theme: selectedTheme,
      slides: slidesWithCover,
      pageSize,
    });
    if (presetId) {
      useEditorStore.getState().setDeckPresetId(presetId as StylePresetId);
    }
    savedDeckRef.current = deckId;
    // Deck has landed in IndexedDB; the in-flight draft is no longer at
    // risk and shouldn't survive into the next /create session.
    clearCreateDraft(format);
    logRemoteEvent('deck_created', { source: 'create', destination: 'auto-save', slideCount: slides.length, format });
    return deckId;
  }, [deckCount, maxDecks, t, format, mdContext, selectedTheme, addDeck]);

  const handleDeckReady = useCallback((slides: Slide[], presetId?: string) => {
    saveGeneratedDeck(slides, presetId);
  }, [saveGeneratedDeck]);

  const handleEnterEditor = useCallback((slides: Slide[], presetId?: string) => {
    const id = saveGeneratedDeck(slides, presetId);
    if (!id) return; // hit deck-limit toast
    logRemoteEvent('enter_editor', { source: 'create', slideCount: slides.length, format });
    router.push('/editor');
  }, [saveGeneratedDeck, router, format]);

  const handlePresent = useCallback((slides: Slide[], presetId?: string) => {
    const id = saveGeneratedDeck(slides, presetId);
    if (!id) return;
    logRemoteEvent('present_opened', { mode: 'present', slideCount: slides.length, source: 'create' });
    router.push('/present');
  }, [saveGeneratedDeck, router, format]);

  // Check if user set any layout hints in outline
  const hasLayoutHints = mdContext
    ? Object.keys(mdContext.demands.pageLayouts ?? {}).length > 0
    : false;

  const currentIdx = stepToIndex(step, isFullContent);

  // ── Back navigation ─────────────────────────────────────────────────
  const goBack = useCallback(() => {
    switch (step) {
      case 'mode-pick':
        // Mode picker is a sub-step of input. Back returns to the textarea
        // with the user's draft preserved (FullContentInput re-mounts but
        // rawInput stays in CreateFlow state — ModeChooser doesn't need to
        // round-trip its own state).
        setModeRecommendation(null);
        setPickedMode(null);
        setStep('input');
        break;
      case 'content-qa': setStep('input'); break;
      case 'plan-preview':
        // Full-content mode skips content-qa, go straight back to input
        setStep(isFullContent ? 'input' : 'content-qa');
        break;
      case 'md-cards':
        // Full-content structured path may have skipped plan-preview entirely
        setStep(planOutline ? 'plan-preview' : 'input');
        break;
      case 'style-pick':
        // Fast-path never built an mdContext; go back to input and drop the
        // parsed report so the user can re-edit the paste.
        if (pendingReportParse) {
          setPendingReportParse(null);
          setStep('input');
        } else {
          setStep('md-cards');
        }
        break;
      // building-mc and generating are non-interruptible
    }
  }, [step, isFullContent, planOutline, pendingReportParse]);

  // Import redesign skips steps 1-4 — hide back button and progress for those steps
  const isImportRedesign = importRedesignRef.current;
  const canGoBack = !isImportRedesign && (step === 'mode-pick' || step === 'content-qa' || step === 'plan-preview' || step === 'md-cards' || step === 'style-pick')
    || (isFullContent && (step === 'mode-pick' || step === 'plan-preview' || step === 'md-cards' || step === 'style-pick'));

  // ── Restart: discard everything and return to a blank input step ───
  // Hidden during mid-flight LLM calls (would orphan in-progress streams)
  // and on the input step when there's nothing yet to discard.
  const canRestart = !isImportRedesign
    && step !== 'building-mc'
    && step !== 'generating'
    && (step !== 'input' || rawInput.trim().length > 0);
  const handleRestart = useCallback(() => {
    if (!window.confirm(t('create.restart_confirm'))) return;
    clearCreateDraft(format);
    setRawInput('');
    setQuestions([]);
    setAnswers({});
    setTopicFormState(null);
    setMdContext(null);
    setPlanOutline(null);
    setPendingReportParse(null);
    setModeRecommendation(null);
    setPickedMode(null);
    setForceNormalMode(false);
    setNeedsPlanReview(true);
    setStep('input');
  }, [format, t]);

  // ── Clickable progress — jump to any completed step ────────────────
  const handleStepClick = useCallback((idx: number) => {
    const curIdx = stepToIndex(step, isFullContent);
    if (idx >= curIdx) return; // can only go backward
    const targets: Step[] = isFullContent
      ? ['input', 'plan-preview', 'md-cards', 'style-pick', 'generating']
      : ['input', 'content-qa', 'plan-preview', 'md-cards', 'style-pick', 'generating'];
    const target = targets[idx];
    if (target && target !== 'generating') setStep(target);
  }, [step, isFullContent]);

  // ── Render ─────────────────────────────────────────────────────────
  const BUILD_MESSAGES = useMemo(() => [
    t('create.building.1'),
    t('create.building.2'),
    t('create.building.3'),
    t('create.building.4'),
  ], [t]);

  const stepLabels = useMemo(() => {
    const keys = isFullContent ? FULL_CONTENT_STEP_LABEL_KEYS : STEP_LABEL_KEYS;
    return keys.map(k => t(k));
  }, [t, isFullContent]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #e8edf8 0%, #f0eff8 40%, #f5f4f0 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '60px 24px 80px',
      position: 'relative',
      /* Override body overflow-hidden from root layout so /create can scroll */
      height: '100vh',
      overflowY: 'auto',
    }}>
      <LascauxBg mode={step === 'building-mc' || step === 'generating' ? 'active' : 'calm'} />
      {/* Top-left: back to landing or previous step */}
      <div style={{
        position: 'fixed', top: 16, left: 20, zIndex: 10,
        display: 'flex', gap: 8,
      }}>
        <button
          onClick={() => router.push(fromEditor ? '/editor' : '/')}
          style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e6dc',
            background: '#fff', color: '#6b6a65', fontSize: 13, cursor: 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          {fromEditor ? t('create.back_editor') : t('create.back_home')}
        </button>
        {canGoBack && step !== 'md-cards' && step !== 'plan-preview' && step !== 'style-pick' && (
          <button
            onClick={goBack}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e6dc',
              background: '#fff', color: '#6b6a65', fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('create.back_step')}
          </button>
        )}
      </div>

      {/* Top-right: restart from zero (mirror of top-left back/home) */}
      {canRestart && (
        <div style={{ position: 'fixed', top: 16, right: 20, zIndex: 10 }}>
          <button
            onClick={handleRestart}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #e8e6dc',
              background: '#fff', color: '#6b6a65', fontSize: 13, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {t('create.restart')}
          </button>
        </div>
      )}

      {/* Progress indicator — hidden for import redesign (no steps 1-4) */}
      {!isImportRedesign && (
        <div style={{
          display: 'flex', gap: 8, marginBottom: 40, alignItems: 'center',
        }}>
          {stepLabels.map((label, idx) => {
            const isActive = idx === currentIdx;
            const isDone = idx < currentIdx;
            const isClickable = isDone;

            return (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  onClick={() => isClickable && handleStepClick(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    cursor: isClickable ? 'pointer' : 'default',
                  }}
                  title={isClickable ? t('create.back_to_step', { label }) : undefined}
                >
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: isDone ? '#788c5d' : isActive ? '#d97757' : '#e8e6dc',
                    color: isDone || isActive ? '#fff' : '#b0aea5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600,
                    transition: 'all 0.3s',
                  }}>
                    {isDone ? '✓' : idx + 1}
                  </span>
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? '#141413' : '#b0aea5',
                    transition: 'all 0.3s',
                  }}>
                    {label}
                  </span>
                </div>
                {idx < stepLabels.length - 1 && (
                  <div style={{
                    width: 32, height: 1,
                    background: isDone ? '#788c5d' : '#e8e6dc',
                    transition: 'background 0.3s',
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Step content — wrapped in a keyed div for fade-in animation */}
      <div
        key={step}
        style={{
          width: '100%', display: 'flex', justifyContent: 'center',
          animation: 'stepFadeIn 0.3s ease-out',
        }}
      >
       <StepErrorBoundary
         resetKey={step}
         stepLabel={step}
         fallbackTitle={t('create.step_error.title')}
         fallbackBody={t('create.step_error.body')}
         fallbackBackLabel={t('create.step_error.back')}
         fallbackReloadLabel={t('create.step_error.reload')}
         onBack={canGoBack ? goBack : undefined}
       >
        {step === 'input' && isFullContent && (
          <FullContentInput
            format={format}
            onSubmit={handleFullContentSubmit}
            initialValue={rawInput || prefillValue}
          />
        )}

        {step === 'mode-pick' && isFullContent && modeRecommendation && (
          <ModeChooser
            format={format}
            recommendation={modeRecommendation}
            onPick={handleModePick}
          />
        )}

        {step === 'input' && !isFullContent && (
          <TopicInput
            format={format}
            onSubmit={handleTopicSubmit}
            initialValue={forceNormalMode ? rawInput : (rawInput || prefillValue)}
            initialAnswers={topicFormState?.answers}
            initialCustomMode={topicFormState?.customMode}
            initialCustomValues={topicFormState?.customValues}
            initialExtraNote={topicFormState?.extraNote}
            initialTouched={topicFormState?.touched}
          />
        )}

        {step === 'content-qa' && (
          <>
            <QAStep
              questions={questions}
              onComplete={handleQAComplete}
              onSkip={() => fetchMdContext(rawInput, answers)}
              loadingMore={loadingMore}
            />
            {loadingMore && elapsedSecs > 5 && (
              <div style={{
                textAlign: 'center', fontSize: 12, color: '#b0aea5',
                marginTop: 12, fontFamily: 'monospace',
              }}>
                Thinking… {Math.floor(elapsedSecs / 60)}:{String(elapsedSecs % 60).padStart(2, '0')}
              </div>
            )}
          </>
        )}

        {step === 'building-mc' && (() => {
          // Derive expected page count from answers
          const lengthVal = String(answers.length || '6');
          const expectedPages = parseInt(lengthVal, 10) || 6;
          return (
            <div style={{ width: '100%', maxWidth: 680, margin: '0 auto' }}>
              {/* Status text */}
              <p style={{
                fontSize: 14, color: '#b0aea5', textAlign: 'center',
                marginBottom: 6, animation: 'qaFadeIn 0.3s ease-out',
              }}>
                {BUILD_MESSAGES[buildProgress] || BUILD_MESSAGES[BUILD_MESSAGES.length - 1]}
              </p>
              {/* Elapsed counter: only shows after 5s so fast responses stay clean.
                  Reassures the user during 3-8min reasoning-model calls on long md. */}
              {elapsedSecs > 5 && (
                <p style={{
                  textAlign: 'center', fontSize: 12, color: '#b0aea5',
                  fontFamily: 'monospace', marginBottom: 18,
                }}>
                  Thinking… {Math.floor(elapsedSecs / 60)}:{String(elapsedSecs % 60).padStart(2, '0')}
                </p>
              )}

              {/* Skeleton cards — "being drawn" */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: expectedPages }).map((_, i) => (
                  <div key={i} style={{
                    padding: '16px 20px', borderRadius: 14,
                    border: '1px solid #e8e6dc',
                    background: '#faf9f5',
                    animation: `cardRise 0.5s ease-out ${i * 200}ms both`,
                  }}>
                    {/* Skeleton title — shimmer */}
                    <div style={{
                      height: 14, borderRadius: 7, marginBottom: 10,
                      width: `${55 + (i * 7) % 30}%`,
                      background: 'linear-gradient(90deg, #e8e6dc 25%, #f0efeb 50%, #e8e6dc 75%)',
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s ease-in-out infinite',
                    }} />
                    {/* Skeleton body line */}
                    <div style={{
                      height: 10, borderRadius: 5,
                      width: `${70 + (i * 11) % 25}%`,
                      background: 'linear-gradient(90deg, #e8e6dc 25%, #f0efeb 50%, #e8e6dc 75%)',
                      backgroundSize: '200% 100%',
                      animation: `shimmer 1.5s ease-in-out ${0.3}s infinite`,
                    }} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {step === 'plan-preview' && planOutline && (
          <PlanPreview
            plan={planOutline}
            answers={answers}
            onApprove={handlePlanApprove}
            onFeedback={handlePlanFeedback}
            onBack={goBack}
          />
        )}

        {step === 'md-cards' && mdContext && (
          <MdContextCards
            mdContext={mdContext}
            onUpdate={setMdContext}
            onContinue={handleOutlineContinue}
            answers={answers}
            onBack={goBack}
          />
        )}

        {step === 'style-pick' && (
          <StylePicker
            selectedTheme={selectedTheme}
            onSelectTheme={setSelectedTheme}
            selectedPresetId={selectedPresetId}
            onSelectPreset={setSelectedPresetId}
            format={format}
            onGenerate={handleGenerate}
            disabled={generating}
            onBack={canGoBack ? goBack : undefined}
          />
        )}

        {step === 'generating' && mdContext && (
          <GenerationPreview
            mdContext={mdContext}
            rawInput={rawInput}
            answers={answers}
            format={format}
            theme={selectedTheme}
            presetId={selectedPresetId ?? undefined}
            onEnterEditor={handleEnterEditor}
            onPresent={handlePresent}
            onDeckReady={handleDeckReady}
            onGenerationStart={() => { savedDeckRef.current = null; }}
            onBack={() => { setGenerating(false); setStep('style-pick'); }}
          />
        )}

        {step === 'generating' && !mdContext && pendingReportParse && (
          <FastPathGenerating
            title={pendingReportParse.defaultName}
            label={t('create.report_building')}
          />
        )}
       </StepErrorBoundary>
      </div>

      {/* spin + stepFadeIn defined in globals.css */}
    </div>
  );
}
