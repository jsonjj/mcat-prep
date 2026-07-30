/**
 * Browser client for the periodic practice-test API (served by the dev/preview
 * Vite plugin, and by a deployed backend route in production). It is the
 * diagnostic client's sibling and shares its contract exactly — it only ever
 * sends a session token, a one-use block token, and the learner's choices, and it
 * never receives an answer key or per-item correctness. The session token lives in
 * `sessionStorage` so an interrupted sitting resumes where it left off.
 *
 * Delivery is by block: the server serves a whole section, the learner moves
 * around inside it and revises freely, and one commit scores the block and serves
 * the next. Drafts are held in `sessionStorage` too, so a refresh mid-block never
 * loses work the learner considers already done. The one addition over the
 * diagnostic is the serve-boundary CADENCE gate: starting a sitting that is not
 * due answers `409`, which this surfaces as a `notDue` view rather than an error.
 */

export type ChoiceId = 'A' | 'B' | 'C' | 'D';
export type Section = 'cp' | 'cars' | 'bb' | 'ps';

export interface PracticeTestItemView {
  id: string;
  section: Section;
  sectionTitle: string;
  cluster: string;
  clusterTitle: string;
  passage: string;
  stem: string;
  choices: { id: ChoiceId; text: string }[];
}

/** One section's score line on a completed test. */
export interface PracticeTestSectionScore {
  section: Section;
  itemsScored: number;
  correct: number;
  /** correct / itemsScored, in [0,1]. */
  accuracy: number;
}

export interface PracticeTestClusterScore {
  cluster: string;
  itemsScored: number;
  correct: number;
  accuracy: number;
}

/** The result envelope a completed test returns (no key, no per-item correctness). */
export interface PracticeTestResultView {
  itemsScored: number;
  correct: number;
  perSection: PracticeTestSectionScore[];
  perCluster: PracticeTestClusterScore[];
  /** How many items the learner missed — the review flow repairs these. */
  missedQuestionIds: string[];
  blueprintMet: boolean;
}

export interface PracticeTestBlockView {
  done: boolean;
  progress: number;
  itemsScored: number;
  /** Length of the whole fixed form, known before the learner starts. */
  totalItems: number;
  /** The open block's section, or null once done. */
  section: Section | null;
  sectionTitle: string | null;
  /** Stable identity of the open block; the same value on every re-serve of it. */
  blockId: string | null;
  /** 1-based block number; 0 once done. */
  blockNumber: number;
  blockCount: number;
  /** Items committed in earlier blocks; the open block numbers on from here. */
  itemsCommitted: number;
  questions: PracticeTestItemView[];
  result: PracticeTestResultView | null;
  /** Set when the serve boundary refused to START a sitting (no test due). */
  notDue: { reason: string } | null;
}

/** The learner's draft answers for one block. Null is an explicit "not known". */
export type BlockAnswers = Record<string, ChoiceId | null>;

interface WireResponse extends Omit<PracticeTestBlockView, 'notDue'> {
  sessionToken: string;
  blockToken: string | null;
}

const SESSION_KEY = 'mcat.practice-test.session';
const DRAFT_PREFIX = 'mcat.practice-test.draft.';
const BASE = '/api/practice-test';

class PracticeTestApiError extends Error {}

function loadSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function saveSessionToken(token: string): void {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
  } catch {
    /* storage unavailable (private mode) — session stays in memory only */
  }
}

/**
 * Drafts for a block, keyed by its stable block id. Only entries whose question
 * is in the block are returned, so a stale key can never inject an answer for an
 * item the learner is not being shown.
 */
export function loadBlockDrafts(blockId: string, questionIds: readonly string[]): BlockAnswers {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${blockId}`);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const drafts: BlockAnswers = {};
    for (const questionId of questionIds) {
      const choice = parsed[questionId];
      if (choice === 'A' || choice === 'B' || choice === 'C' || choice === 'D') {
        drafts[questionId] = choice;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

export function saveBlockDrafts(blockId: string, answers: Readonly<Record<string, string>>): void {
  try {
    sessionStorage.setItem(`${DRAFT_PREFIX}${blockId}`, JSON.stringify(answers));
  } catch {
    /* storage unavailable (private mode) — drafts stay in memory only */
  }
}

function clearBlockDrafts(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key !== null && key.startsWith(DRAFT_PREFIX)) stale.push(key);
    }
    for (const key of stale) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

const EMPTY_VIEW = (notDue: { reason: string } | null): PracticeTestBlockView => ({
  done: false,
  progress: 0,
  itemsScored: 0,
  totalItems: 0,
  section: null,
  sectionTitle: null,
  blockId: null,
  blockNumber: 0,
  blockCount: 0,
  itemsCommitted: 0,
  questions: [],
  result: null,
  notDue,
});

export class PracticeTestClient {
  private sessionToken: string | null = loadSessionToken();
  private blockToken: string | null = null;
  private blockId: string | null = null;

  private async post(path: string, body: Record<string, unknown>): Promise<PracticeTestBlockView> {
    const response = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    });
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new PracticeTestApiError('The practice-test service returned an invalid response.');
    }
    // The serve boundary refuses an off-cadence START with 409 — a normal state
    // (no test due), not an error the runner should show as a failure.
    if (response.status === 409) {
      const reason =
        typeof (json as { reason?: unknown }).reason === 'string'
          ? (json as { reason: string }).reason
          : 'not_due';
      return EMPTY_VIEW({ reason });
    }
    if (!response.ok) {
      const message =
        typeof (json as { error?: unknown }).error === 'string'
          ? (json as { error: string }).error
          : 'The practice-test service is unavailable.';
      if (response.status === 401) this.reset();
      throw new PracticeTestApiError(message);
    }
    const wire = json as WireResponse;
    this.sessionToken = wire.sessionToken;
    this.blockToken = wire.blockToken;
    this.blockId = wire.blockId;
    saveSessionToken(wire.sessionToken);
    return {
      done: wire.done,
      progress: wire.progress,
      itemsScored: wire.itemsScored,
      totalItems: wire.totalItems,
      section: wire.section,
      sectionTitle: wire.sectionTitle,
      blockId: wire.blockId,
      blockNumber: wire.blockNumber,
      blockCount: wire.blockCount,
      itemsCommitted: wire.itemsCommitted,
      questions: wire.questions ?? [],
      result: wire.result,
      notDue: null,
    };
  }

  /** Start a new sitting or resume the stored session; serves the current block. */
  async start(): Promise<PracticeTestBlockView> {
    try {
      return await this.post('/next', this.sessionToken ? { sessionToken: this.sessionToken } : {});
    } catch (error) {
      // A stored session that was rejected restarts cleanly, once.
      if (this.sessionToken === null) throw error;
      this.reset();
      return this.post('/next', {});
    }
  }

  /**
   * Commit the open block and receive the next one (or the completed result).
   * Every question of the block is sent, unanswered ones as an explicit null.
   */
  async submitBlock(
    questionIds: readonly string[],
    answers: Readonly<Record<string, string>>,
    elapsedMs: Readonly<Record<string, number>> = {},
  ): Promise<PracticeTestBlockView> {
    if (this.sessionToken === null || this.blockToken === null || this.blockId === null) {
      // No live block to commit — re-sync by serving the current block.
      return this.start();
    }
    const payload: BlockAnswers = {};
    for (const questionId of questionIds) {
      const choice = answers[questionId];
      payload[questionId] = choice === undefined ? null : (choice as ChoiceId);
    }
    const committedBlockId = this.blockId;
    const view = await this.post('/block', {
      sessionToken: this.sessionToken,
      blockToken: this.blockToken,
      blockId: committedBlockId,
      answers: payload,
      elapsedMs,
    });
    try {
      sessionStorage.removeItem(`${DRAFT_PREFIX}${committedBlockId}`);
    } catch {
      /* ignore */
    }
    return view;
  }

  /** Mark the just-completed test's review as done, releasing the §6 cadence gate. */
  async markReviewed(): Promise<void> {
    await fetch(`${BASE}/review`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ sessionToken: this.sessionToken ?? undefined }),
    });
  }

  reset(): void {
    this.sessionToken = null;
    this.blockToken = null;
    this.blockId = null;
    clearBlockDrafts();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const practiceTestClient = new PracticeTestClient();
