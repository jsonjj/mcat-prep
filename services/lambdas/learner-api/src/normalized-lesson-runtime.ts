import { randomUUID } from 'node:crypto';

import type {
  ExitFunction,
  NormalizedItem,
  NormalizedKc,
  NormalizedLesson,
} from '@mcat/content/lesson-normalization';

import {
  lessonContentProvider,
  type LessonContentProvider,
  type ServerItemAnswer,
} from './lesson-content-provider';

/**
 * The grammar-agnostic delivery engine for the Real Lesson Catalog (Phase 5,
 * wave 5B).
 *
 * L1 (`V3-LES-130923`) keeps its bespoke 1660-line machine untouched (owner
 * decision: per-grammar dispatch). THIS engine drives every OTHER lesson — today
 * L2/L3, tomorrow anything the authoring template (Phase 9) produces — off the
 * single shared `NormalizedLesson`, so a new lesson needs zero new runtime code.
 *
 * It reads structure ONLY through `LessonContentProvider.getNormalizedLesson`
 * (answer-free) for what the learner sees, and scores ONLY through
 * `getAnswerKey` (server-only). The correct answer never enters a render.
 *
 * The persisted run is a small progress record: it stores the cursor, the
 * committed responses, and which exits have passed — never the lesson body,
 * which is recomputed from the content-addressed provider on every call. The
 * `definitionHash` pins the exact revision the progress belongs to, so a run
 * cannot silently drift onto a re-authored lesson.
 */

// ---------------------------------------------------------------------------
// Learner-committed response. Mirrors the two shapes the seam already speaks
// (`@mcat/contracts` lesson-observation: MULTIPLE_CHOICE + multi-field
// CONSTRUCTED), plus SHORT for L2's short-response items (a single free field).
// ---------------------------------------------------------------------------

export type EngineResponse =
  | { readonly kind: 'MULTIPLE_CHOICE'; readonly choiceId: string | null }
  | { readonly kind: 'SHORT'; readonly text: string | null }
  | { readonly kind: 'CONSTRUCTED'; readonly fields: Readonly<Record<string, string | null>> };

export type NormalizedLessonAction =
  | { readonly type: 'SUBMIT_RESPONSE'; readonly response: EngineResponse }
  | { readonly type: 'CONTINUE' };

export type NormalizedRunStatus = 'IN_PROGRESS' | 'BLOCKED' | 'DELIVERY_COMPLETE';

/** One committed response, kept for evidence emission (5B.2) and idempotent replay. */
export interface NormalizedResponseRecord {
  readonly itemId: string;
  readonly primaryKcId: string;
  readonly activityRole: NormalizedItem['activityRole'];
  readonly exitFunction: ExitFunction;
  readonly isReentry: boolean;
  readonly response: EngineResponse;
  readonly correct: boolean;
  readonly committedAt: string;
}

/**
 * Persisted delivery state. Serializable to the learner projection as-is; every
 * derived fact (the current item, the KC sequence) is recomputed from the
 * provider, so this stays small and revision-pinned.
 */
export interface NormalizedLessonRun {
  readonly runId: string;
  readonly lessonId: string;
  /** `content_sha256` of the delivered revision — the attribution key for evidence. */
  readonly definitionHash: string;
  readonly status: NormalizedRunStatus;
  readonly paused: boolean;
  /** Index into `orderedKcIds`. */
  readonly kcIndex: number;
  /** BASELINE walks the always-shown items; BRANCH walks repair/re-entry after a missed exit. */
  readonly phase: 'BASELINE' | 'BRANCH';
  readonly baselineCursor: number;
  /** The exit function under repair while `phase === 'BRANCH'`; otherwise null. */
  readonly branchFunction: ExitFunction | null;
  readonly branchCursor: number;
  /** PROMPT awaits a response (scored) or CONTINUE (exposition); FEEDBACK awaits CONTINUE. */
  readonly stage: 'PROMPT' | 'FEEDBACK';
  readonly currentItemId: string | null;
  readonly responses: Readonly<Record<string, NormalizedResponseRecord>>;
  /** kcId -> exit functions confirmed passed (fresh check, not repair process). */
  readonly passedExits: Readonly<Record<string, readonly ExitFunction[]>>;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export class NormalizedLessonRuntimeError extends Error {
  constructor(
    message: string,
    readonly detail: { lessonId: string; runId?: string; itemId?: string },
  ) {
    super(message);
    this.name = 'NormalizedLessonRuntimeError';
  }
}

// ---------------------------------------------------------------------------
// Structural helpers — pure over the NormalizedLesson.
// ---------------------------------------------------------------------------

const isExitItem = (item: NormalizedItem): boolean =>
  item.activityRole === 'NEAR_EXIT' || item.activityRole === 'CHANGED_EXIT';

/** Branch items are held out of the baseline walk and only administered after a miss. */
const isBranchItem = (item: NormalizedItem): boolean =>
  item.activityRole === 'REPAIR_CONFIRMATION' || item.isReentry;

const baselineItems = (kc: NormalizedKc): readonly NormalizedItem[] =>
  kc.items.filter((item) => !isBranchItem(item));

/**
 * The repair→re-entry sequence for a missed exit function: process-repair
 * confirmations first (in authored order), then the fresh re-entry exit that
 * actually re-checks the function. L2 has repairs but NO re-entry, so its branch
 * ends without a fresh check — the caller treats that as BLOCKED rather than
 * fabricating an exit pass from process evidence alone.
 */
function branchItems(kc: NormalizedKc, fn: ExitFunction): readonly NormalizedItem[] {
  const repairs = kc.items.filter(
    (item) =>
      item.activityRole === 'REPAIR_CONFIRMATION' && item.repairsFunction === fn && !item.isReentry,
  );
  const reentries = kc.items.filter(
    (item) => item.isReentry && (item.exitFunction === fn || item.repairsFunction === fn),
  );
  return [...repairs, ...reentries];
}

function kcOf(lesson: NormalizedLesson, kcIndex: number): NormalizedKc {
  const kc = lesson.kcs[kcIndex];
  if (kc === undefined) {
    throw new NormalizedLessonRuntimeError(`kc index ${kcIndex} out of range`, {
      lessonId: lesson.lessonId,
    });
  }
  return kc;
}

function itemOf(lesson: NormalizedLesson, itemId: string): NormalizedItem {
  const item = lesson.items.find((candidate) => candidate.itemId === itemId);
  if (item === undefined) {
    throw new NormalizedLessonRuntimeError(`item "${itemId}" not found in lesson`, {
      lessonId: lesson.lessonId,
      itemId,
    });
  }
  return item;
}

// ---------------------------------------------------------------------------
// Scoring — the ONLY place the server-only answer key is consulted.
// ---------------------------------------------------------------------------

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, ' ');

/**
 * Whether a committed response supplied no answer at all. Exported so the seam
 * adapter derives the `omitted`/`outcome` fact from the SAME rule the engine
 * scored with, never a second copy that could drift.
 */
export function isEngineResponseOmitted(response: EngineResponse): boolean {
  if (response.kind === 'MULTIPLE_CHOICE') return response.choiceId === null;
  if (response.kind === 'SHORT') return response.text === null || response.text.trim() === '';
  return Object.values(response.fields).every((value) => value === null || value.trim() === '');
}

export function scoreEngineResponse(answer: ServerItemAnswer, response: EngineResponse): boolean {
  // Multiple choice: the key names the winning choiceId directly.
  if (answer.correctChoiceId !== null) {
    return response.kind === 'MULTIPLE_CHOICE' && response.choiceId === answer.correctChoiceId;
  }
  // No choiceId → free/short or constructed. The accepted strings ARE the key.
  const accepted = new Set(answer.acceptedResponses.map(normalizeText));
  if (accepted.size === 0) return false;
  if (response.kind === 'SHORT') {
    return response.text !== null && accepted.has(normalizeText(response.text));
  }
  if (response.kind === 'CONSTRUCTED') {
    const supplied = new Set(
      Object.values(response.fields)
        .filter((value): value is string => value !== null)
        .map(normalizeText),
    );
    // A constructed item is correct only when EVERY required part (each expected
    // equation form + the solution pair) is present — partial construction is a miss.
    return [...accepted].every((part) => supplied.has(part));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Sequencing — compute the current item and the next state.
// ---------------------------------------------------------------------------

function currentItem(lesson: NormalizedLesson, run: NormalizedLessonRun): NormalizedItem | null {
  if (run.currentItemId === null) return null;
  return itemOf(lesson, run.currentItemId);
}

/** First deliverable position from a KC index, skipping KCs whose baseline is empty. */
function enterKc(
  lesson: NormalizedLesson,
  kcIndex: number,
): Pick<NormalizedLessonRun, 'kcIndex' | 'phase' | 'baselineCursor' | 'branchFunction' | 'branchCursor' | 'currentItemId' | 'stage' | 'status'> {
  for (let index = kcIndex; index < lesson.kcs.length; index += 1) {
    const baseline = baselineItems(kcOf(lesson, index));
    const first = baseline[0];
    if (first !== undefined) {
      return {
        kcIndex: index,
        phase: 'BASELINE',
        baselineCursor: 0,
        branchFunction: null,
        branchCursor: 0,
        currentItemId: first.itemId,
        stage: 'PROMPT',
        status: 'IN_PROGRESS',
      };
    }
  }
  return {
    kcIndex: lesson.kcs.length,
    phase: 'BASELINE',
    baselineCursor: 0,
    branchFunction: null,
    branchCursor: 0,
    currentItemId: null,
    stage: 'PROMPT',
    status: 'DELIVERY_COMPLETE',
  };
}

/**
 * Compute the run after a CONTINUE from the current screen. This is the whole
 * sequencer: it decides whether a missed exit diverts into repair, whether a
 * re-entry passed or blocked, and when a KC (then the lesson) is done.
 */
function advance(lesson: NormalizedLesson, run: NormalizedLessonRun): NormalizedLessonRun {
  const kc = kcOf(lesson, run.kcIndex);
  const item = currentItem(lesson, run);
  if (item === null) return run;
  const record = run.responses[item.itemId];

  if (run.phase === 'BASELINE') {
    // A missed baseline exit diverts into its repair→re-entry branch.
    if (isExitItem(item) && record !== undefined && !record.correct) {
      const branch = branchItems(kc, item.exitFunction);
      const first = branch[0];
      if (first === undefined) {
        // No repair path authored for this function: cannot confirm the exit.
        return { ...run, status: 'BLOCKED', stage: 'PROMPT' };
      }
      return {
        ...run,
        phase: 'BRANCH',
        branchFunction: item.exitFunction,
        branchCursor: 0,
        currentItemId: first.itemId,
        stage: 'PROMPT',
      };
    }
    // Otherwise walk to the next baseline item, or finish the KC.
    const baseline = baselineItems(kc);
    const nextCursor = run.baselineCursor + 1;
    const next = baseline[nextCursor];
    if (next !== undefined) {
      return { ...run, baselineCursor: nextCursor, currentItemId: next.itemId, stage: 'PROMPT' };
    }
    return { ...run, ...enterKc(lesson, run.kcIndex + 1) };
  }

  // phase === 'BRANCH' — walk repair→re-entry in order, then resolve on exhaustion.
  const branch = branchItems(kc, run.branchFunction ?? 'NONE');
  const nextBranchCursor = run.branchCursor + 1;
  const next = branch[nextBranchCursor];
  if (next !== undefined) {
    return { ...run, branchCursor: nextBranchCursor, currentItemId: next.itemId, stage: 'PROMPT' };
  }
  // Branch exhausted. The fresh re-entry item(s) are the actual re-check —
  // detected by `isReentry`, NOT by role, because L3's changed re-entry is
  // authored as REPAIR_CONFIRMATION. The exit is confirmed only if every
  // re-entry was answered correctly; repair confirmations alone (L2 has no
  // re-entry) are process evidence and cannot pass the exit.
  const reentries = branch.filter((candidate) => candidate.isReentry);
  const passedReentry =
    reentries.length > 0 &&
    reentries.every((candidate) => run.responses[candidate.itemId]?.correct === true);
  if (passedReentry) {
    const passed = markPassed(run.passedExits, kc.kcId, run.branchFunction);
    return resumeBaselineAfterExit(lesson, { ...run, passedExits: passed });
  }
  return { ...run, status: 'BLOCKED', stage: 'PROMPT' };
}

function markPassed(
  passedExits: NormalizedLessonRun['passedExits'],
  kcId: string,
  fn: ExitFunction | null,
): NormalizedLessonRun['passedExits'] {
  if (fn === null || fn === 'NONE') return passedExits;
  const current = passedExits[kcId] ?? [];
  if (current.includes(fn)) return passedExits;
  return { ...passedExits, [kcId]: [...current, fn] };
}

/** Resume the baseline walk at the item after the exit that diverted into repair. */
function resumeBaselineAfterExit(
  lesson: NormalizedLesson,
  run: NormalizedLessonRun,
): NormalizedLessonRun {
  const kc = kcOf(lesson, run.kcIndex);
  const baseline = baselineItems(kc);
  const nextCursor = run.baselineCursor + 1;
  const next = baseline[nextCursor];
  const resumed: NormalizedLessonRun = {
    ...run,
    phase: 'BASELINE',
    branchFunction: null,
    branchCursor: 0,
  };
  if (next !== undefined) {
    return { ...resumed, baselineCursor: nextCursor, currentItemId: next.itemId, stage: 'PROMPT' };
  }
  return { ...resumed, ...enterKc(lesson, run.kcIndex + 1) };
}

// ---------------------------------------------------------------------------
// Public API — mirrors the vector-lesson runtime shape so the dispatcher can
// treat both engines uniformly.
// ---------------------------------------------------------------------------

export interface CreateNormalizedLessonRunOptions {
  readonly lessonId: string;
  readonly now: string;
  readonly runId?: string;
  readonly provider?: LessonContentProvider;
}

export function createNormalizedLessonRun(
  options: CreateNormalizedLessonRunOptions,
): NormalizedLessonRun {
  const provider = options.provider ?? lessonContentProvider;
  const lesson = provider.getNormalizedLesson(options.lessonId);
  const entry = enterKc(lesson, 0);
  return {
    runId: options.runId ?? randomUUID(),
    lessonId: lesson.lessonId,
    definitionHash: lesson.definitionHash,
    paused: false,
    responses: {},
    passedExits: {},
    startedAt: options.now,
    updatedAt: options.now,
    ...entry,
  };
}

export function applyNormalizedLessonAction(
  run: NormalizedLessonRun,
  action: NormalizedLessonAction,
  now: string,
  provider: LessonContentProvider = lessonContentProvider,
): NormalizedLessonRun {
  if (run.status !== 'IN_PROGRESS') {
    throw new NormalizedLessonRuntimeError('lesson is no longer in progress', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }
  const lesson = provider.getNormalizedLesson(run.lessonId);
  const item = currentItem(lesson, run);
  if (item === null) {
    throw new NormalizedLessonRuntimeError('no current item to act on', {
      lessonId: run.lessonId,
      runId: run.runId,
    });
  }

  if (action.type === 'SUBMIT_RESPONSE') {
    if (run.stage !== 'PROMPT') {
      throw new NormalizedLessonRuntimeError('a response is only accepted at the prompt', {
        lessonId: run.lessonId,
        runId: run.runId,
        itemId: item.itemId,
      });
    }
    if (!item.scored) {
      throw new NormalizedLessonRuntimeError('this item is exposition — advance with CONTINUE', {
        lessonId: run.lessonId,
        runId: run.runId,
        itemId: item.itemId,
      });
    }
    const answerKey = provider.getAnswerKey(run.lessonId);
    const answer = answerKey.byItemId[item.itemId];
    if (answer === undefined) {
      throw new NormalizedLessonRuntimeError('scored item has no answer key entry', {
        lessonId: run.lessonId,
        runId: run.runId,
        itemId: item.itemId,
      });
    }
    const correct = scoreEngineResponse(answer, action.response);
    const record: NormalizedResponseRecord = {
      itemId: item.itemId,
      primaryKcId: item.primaryKcId,
      activityRole: item.activityRole,
      exitFunction: item.exitFunction,
      isReentry: item.isReentry,
      response: action.response,
      correct,
      committedAt: now,
    };
    // A baseline exit answered correctly is confirmed here (no branch needed).
    const passedExits =
      run.phase === 'BASELINE' && isExitItem(item) && correct
        ? markPassed(run.passedExits, item.primaryKcId, item.exitFunction)
        : run.passedExits;
    return {
      ...run,
      stage: 'FEEDBACK',
      responses: { ...run.responses, [item.itemId]: record },
      passedExits,
      updatedAt: now,
    };
  }

  // CONTINUE
  if (item.scored && run.stage === 'PROMPT') {
    throw new NormalizedLessonRuntimeError('this item requires a response before continuing', {
      lessonId: run.lessonId,
      runId: run.runId,
      itemId: item.itemId,
    });
  }
  return { ...advance(lesson, run), updatedAt: now };
}

export function resumeNormalizedLessonRun(
  run: NormalizedLessonRun,
  now: string,
): NormalizedLessonRun {
  return { ...run, paused: false, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Learner-safe rendering — never consults the answer key.
// ---------------------------------------------------------------------------

export type NormalizedLessonScreen =
  | { readonly kind: 'EXPOSITION'; readonly itemId: string; readonly heading: string; readonly prompt: string }
  | {
      readonly kind: 'QUESTION';
      readonly itemId: string;
      readonly kcId: string;
      readonly heading: string;
      readonly prompt: string;
      readonly responseType: string;
      readonly choices: readonly { readonly choiceId: string; readonly text: string }[];
    }
  | { readonly kind: 'FEEDBACK'; readonly itemId: string; readonly outcome: 'CORRECT' | 'INCORRECT' }
  | { readonly kind: 'BLOCKED' }
  | { readonly kind: 'COMPLETE' };

export interface NormalizedLessonRunView {
  readonly runId: string;
  readonly lessonId: string;
  readonly status: NormalizedRunStatus;
  readonly paused: boolean;
  readonly kcId: string | null;
  readonly kcOrdinal: number | null;
  readonly totalKcs: number;
  readonly screen: NormalizedLessonScreen;
}

export function renderNormalizedLessonRun(
  run: NormalizedLessonRun,
  provider: LessonContentProvider = lessonContentProvider,
): NormalizedLessonRunView {
  const lesson = provider.getNormalizedLesson(run.lessonId);
  const totalKcs = lesson.kcs.length;
  const kc = run.kcIndex < totalKcs ? kcOf(lesson, run.kcIndex) : null;
  const base = {
    runId: run.runId,
    lessonId: run.lessonId,
    status: run.status,
    paused: run.paused,
    kcId: kc?.kcId ?? null,
    kcOrdinal: kc?.canonicalOrdinal ?? null,
    totalKcs,
  };

  if (run.status === 'BLOCKED') return { ...base, screen: { kind: 'BLOCKED' } };
  if (run.status === 'DELIVERY_COMPLETE') return { ...base, screen: { kind: 'COMPLETE' } };

  const item = currentItem(lesson, run);
  if (item === null) return { ...base, screen: { kind: 'COMPLETE' } };

  if (run.stage === 'FEEDBACK') {
    const record = run.responses[item.itemId];
    return {
      ...base,
      screen: {
        kind: 'FEEDBACK',
        itemId: item.itemId,
        outcome: record?.correct ? 'CORRECT' : 'INCORRECT',
      },
    };
  }

  if (!item.scored) {
    return {
      ...base,
      screen: {
        kind: 'EXPOSITION',
        itemId: item.itemId,
        heading: item.projection.title ?? 'Worked example',
        prompt: item.projection.prompt,
      },
    };
  }

  return {
    ...base,
    screen: {
      kind: 'QUESTION',
      itemId: item.itemId,
      kcId: item.primaryKcId,
      heading: item.projection.title ?? kc?.kcId ?? item.primaryKcId,
      prompt: item.projection.prompt,
      responseType: item.projection.responseType,
      // Learner-safe: choiceId + text only. The correct answer is never here.
      choices: item.projection.choices.map((choice) => ({ choiceId: choice.choiceId, text: choice.text })),
    },
  };
}

// ---------------------------------------------------------------------------
// Restore — validate a persisted blob back into a run. The lesson body is NOT
// stored, so restore also confirms the pinned revision still resolves.
// ---------------------------------------------------------------------------

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

export function restoreNormalizedLessonRun(
  value: unknown,
  provider: LessonContentProvider = lessonContentProvider,
): NormalizedLessonRun {
  const raw = asRecord(value);
  if (raw === undefined) {
    throw new NormalizedLessonRuntimeError('run state is not an object', { lessonId: '(unknown)' });
  }
  const lessonId = raw.lessonId;
  if (typeof lessonId !== 'string') {
    throw new NormalizedLessonRuntimeError('run state has no lessonId', { lessonId: '(unknown)' });
  }
  // Resolving the lesson proves the pinned revision is still deliverable.
  const lesson = provider.getNormalizedLesson(lessonId);
  const definitionHash = raw.definitionHash;
  if (definitionHash !== lesson.definitionHash) {
    throw new NormalizedLessonRuntimeError(
      `run pinned revision ${String(definitionHash)} but catalog serves ${lesson.definitionHash}`,
      { lessonId },
    );
  }
  // The blob is our own; a shallow structural check is enough to fail loud on
  // corruption without duplicating every field's schema here.
  const run = value as NormalizedLessonRun;
  if (
    typeof run.runId !== 'string' ||
    typeof run.kcIndex !== 'number' ||
    (run.phase !== 'BASELINE' && run.phase !== 'BRANCH') ||
    (run.stage !== 'PROMPT' && run.stage !== 'FEEDBACK') ||
    asRecord(run.responses) === undefined ||
    asRecord(run.passedExits) === undefined
  ) {
    throw new NormalizedLessonRuntimeError('run state is malformed', { lessonId, runId: run.runId });
  }
  return run;
}
