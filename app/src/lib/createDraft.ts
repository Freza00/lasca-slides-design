import type { ClarifierAnswers, MdContext, PlanOutline } from './ai/harness/types';
import { isValidMdContext } from './ai/harness/validateMdContext';
import { logRemoteEvent } from './logger';

/**
 * Tab-scoped draft of an in-flight /create flow. Survives a CreateFlow
 * unmount (which happens when /create/error.tsx triggers, when the user
 * F5s, or when StepErrorBoundary's "Reload step" path remounts a child).
 *
 * Persists only to sessionStorage — NOT to IndexedDB / Zustand. Reasons:
 * - sessionStorage is per-tab so concurrent /create sessions don't collide.
 * - IndexedDB only holds completed Decks; mixing in-flight drafts there
 *   would force partialize / migration changes far beyond this bug's scope.
 *
 * Cleared explicitly when generation completes (step === 'done') or the
 * user starts over.
 */

export type CreateDraftStep =
  | 'input'
  | 'mode-pick'
  | 'content-qa'
  | 'building-mc'
  | 'plan-preview'
  | 'md-cards'
  | 'style-pick'
  | 'generating';

export interface TopicFormStateSnapshot {
  answers: ClarifierAnswers;
  customMode: Record<string, boolean>;
  customValues: Record<string, string>;
  extraNote: string;
  /** Field ids the user has explicitly clicked. Cascade defaults respect this
   *  to avoid clobbering user customizations on revisit. Older drafts without
   *  this field are treated as "nothing touched" (cascade fires freely). */
  touched?: string[];
}

export interface CreateDraft {
  step: CreateDraftStep;
  rawInput: string;
  answers: ClarifierAnswers;
  topicFormState: TopicFormStateSnapshot | null;
  planOutline: PlanOutline | null;
  mdContext: MdContext | null;
  savedAt: number;
}

const SCHEMA_VERSION = 1;
const TTL_MS = 6 * 60 * 60 * 1000;

function keyFor(format: 'slide' | 'report'): string {
  return `lasca-create-draft-${format}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

export function loadCreateDraft(format: 'slide' | 'report'): CreateDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(format));
    if (!raw) {
      logRemoteEvent('draft_load_empty', { format });
      return null;
    }
    const parsed = JSON.parse(raw) as { v?: number; draft?: CreateDraft };
    if (parsed?.v !== SCHEMA_VERSION || !parsed.draft) {
      logRemoteEvent('draft_load_skipped', { format, reason: 'schema-mismatch', v: parsed?.v });
      return null;
    }
    const draft = parsed.draft;
    if (typeof draft.savedAt !== 'number' || Date.now() - draft.savedAt > TTL_MS) {
      sessionStorage.removeItem(keyFor(format));
      logRemoteEvent('draft_load_skipped', { format, reason: 'expired' });
      return null;
    }
    // mdContext, if present, must round-trip through the same shape guard
    // used at the SSE boundary — otherwise restoring would re-introduce
    // exactly the crash the guard prevents.
    if (draft.mdContext !== null && !isValidMdContext(draft.mdContext)) {
      logRemoteEvent('draft_load_skipped', { format, reason: 'invalid-mdcontext' });
      return null;
    }
    logRemoteEvent('draft_load_ok', {
      format,
      step: draft.step,
      hasRawInput: draft.rawInput.length > 0,
      hasAnswers: Object.keys(draft.answers).length > 0,
      hasPlanOutline: !!draft.planOutline,
      hasMdContext: !!draft.mdContext,
      ageMs: Date.now() - draft.savedAt,
    });
    return draft;
  } catch (err) {
    logRemoteEvent('draft_load_failed', { format, message: (err as Error)?.message });
    return null;
  }
}

/**
 * Steps where it makes sense to persist. We deliberately INCLUDE the
 * transient stream phases (`building-mc`, `generating`) — those are the
 * exact windows where the previous round's bug fired. Persisting through
 * them means even a render crash mid-stream still leaves a recoverable
 * snapshot in sessionStorage.
 *
 * The only excluded step is `input` — at that step the user is either
 * fresh (state empty, would clobber a stored draft from a previous
 * session) or has done `forceNormalMode`-style step regression in which
 * case rawInput is the only thing worth keeping (handled by the
 * progress-presence guard in the persist effect).
 */
export function shouldPersistStep(step: CreateDraftStep): boolean {
  return step !== 'input';
}

export function saveCreateDraft(format: 'slide' | 'report', draft: Omit<CreateDraft, 'savedAt'>): void {
  if (!isBrowser()) return;
  try {
    const payload = JSON.stringify({
      v: SCHEMA_VERSION,
      draft: { ...draft, savedAt: Date.now() } satisfies CreateDraft,
    });
    sessionStorage.setItem(keyFor(format), payload);
    logRemoteEvent('draft_save', {
      format,
      step: draft.step,
      hasRawInput: draft.rawInput.length > 0,
      hasAnswers: Object.keys(draft.answers).length > 0,
      hasPlanOutline: !!draft.planOutline,
      hasMdContext: !!draft.mdContext,
      bytes: payload.length,
    });
  } catch (err) {
    // QuotaExceededError or serialization failure — record so a silent
    // failure to persist doesn't masquerade as "draft was empty".
    logRemoteEvent('draft_save_failed', {
      format,
      step: draft.step,
      message: (err as Error)?.message,
    });
  }
}

export function clearCreateDraft(format: 'slide' | 'report'): void {
  if (!isBrowser()) return;
  try {
    sessionStorage.removeItem(keyFor(format));
    // Stack trace tells us WHO cleared the draft when an unexpected clear
    // wipes a user's progress (the first reported bug had a similar
    // can't-tell-who-cleared shape).
    logRemoteEvent('draft_clear', {
      format,
      caller: new Error().stack?.split('\n').slice(1, 5).join('\n'),
    });
  } catch {
    // ignore
  }
}
