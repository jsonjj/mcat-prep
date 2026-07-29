/**
 * Browser client for the diagnostic API (served by the dev/preview Vite plugin,
 * and by an API Gateway route in production). It only ever sends a session token,
 * a one-use block token, and the learner's choices; it never receives an answer
 * key or per-item correctness. The session token is kept in `sessionStorage` so
 * an interrupted diagnostic resumes exactly where it left off.
 *
 * Delivery is by block: the server serves a whole multistage stage, the learner
 * moves around inside it and revises freely, and one commit scores the block and
 * routes to the next one. Drafts are held in `sessionStorage` too — the server
 * only learns an answer at commit, so a refresh mid-block would otherwise lose
 * work the learner considers already done.
 */

export type ChoiceId = 'A' | 'B' | 'C' | 'D';
export type Section = 'cp' | 'cars' | 'bb' | 'ps';
export type SkillCluster = string;
export type DiagnosticClassification =
  | 'provisionally_ready'
  | 'likely_weak'
  | 'unresolved'
  | 'unsampled';
export type DiagnosticRecommendation =
  | 'CONCISE_INSTRUCTION'
  | 'STANDARD_INSTRUCTION'
  | 'MISCONCEPTION_INSTRUCTION'
  | 'PREREQUISITE_SUPPORT_CANDIDATE'
  | 'DIAGNOSTIC_PROBE';

export interface DiagnosticItemView {
  id: string;
  section: Section;
  sectionTitle: string;
  cluster: SkillCluster;
  clusterTitle: string;
  clusterTested: string;
  passage: string;
  stem: string;
  choices: { id: ChoiceId; text: string }[];
}

/**
 * Opening BKT priors the diagnostic produced, in `MasterySeedSchema`'s shape.
 * Restated structurally rather than imported so this module keeps its "browser
 * client, no policy imports" character; the authority validates it on arrival.
 */
export interface MasterySeedPayload {
  kcPriors: Record<string, number>;
  skillPriors: Record<string, number>;
  lessonPriors: Record<string, number>;
  carsAbility: Record<string, number>;
}

export interface DiagnosticResultView {
  confidenceLabel: 'High' | 'Medium' | 'Still building';
  /**
   * Areas to start with, capped server-side by `REPORTED_PRIORITY_COUNT`. The
   * cap is not a filter on the read: `perCluster` still carries every concept.
   */
  topPriorities: {
    cluster: SkillCluster;
    title: string;
    tested: string;
    recommendation: DiagnosticRecommendation;
  }[];
  stillConfirming: { cluster: SkillCluster; title: string }[];
  perCluster: {
    cluster: SkillCluster;
    title: string;
    section: Section;
    classification: DiagnosticClassification;
    recommendation: DiagnosticRecommendation;
    /** 0..1, higher = more likely to need work. */
    gap: number;
    /** 0..1, how much to trust the gap. */
    certainty: number;
    itemsSeen: number;
  }[];
  itemsScored: number;
  masterySeed: MasterySeedPayload;
}

export interface DiagnosticBlockView {
  done: boolean;
  progress: number;
  itemsScored: number;
  /** Length of the whole multistage form, known before the learner starts. */
  totalItems: number;
  /** Stable identity of the open block; the same value on every re-serve of it. */
  stageId: string | null;
  stageNumber: number;
  stageCount: number;
  /** Items committed in earlier blocks; the open block numbers on from here. */
  itemsCommitted: number;
  questions: DiagnosticItemView[];
  result: DiagnosticResultView | null;
}

/** The learner's draft answers for one block. Null is an explicit "not known". */
export type BlockAnswers = Record<string, ChoiceId | null>;

interface WireResponse extends DiagnosticBlockView {
  sessionToken: string;
  blockToken: string | null;
}

const SESSION_KEY = 'mcat.diagnostic.session';
const DRAFT_PREFIX = 'mcat.diagnostic.draft.';
const BASE = '/api/diagnostic';

class DiagnosticApiError extends Error {}

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
 * Drafts for a block, keyed by its stable stage id. Only entries whose question
 * is in the block are returned, so a stale key can never inject an answer for an
 * item the learner is not being shown.
 */
export function loadBlockDrafts(stageId: string, questionIds: readonly string[]): BlockAnswers {
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${stageId}`);
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

export function saveBlockDrafts(stageId: string, answers: Readonly<Record<string, string>>): void {
  try {
    sessionStorage.setItem(`${DRAFT_PREFIX}${stageId}`, JSON.stringify(answers));
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

export class DiagnosticClient {
  private sessionToken: string | null = loadSessionToken();
  private blockToken: string | null = null;
  private stageId: string | null = null;

  private async post(path: string, body: Record<string, unknown>): Promise<DiagnosticBlockView> {
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
      throw new DiagnosticApiError('The diagnostic service returned an invalid response.');
    }
    if (!response.ok) {
      const message =
        typeof (json as { error?: unknown }).error === 'string'
          ? (json as { error: string }).error
          : 'The diagnostic service is unavailable.';
      // A stale/expired session should restart cleanly.
      if (response.status === 401) this.reset();
      throw new DiagnosticApiError(message);
    }
    const wire = json as WireResponse;
    this.sessionToken = wire.sessionToken;
    this.blockToken = wire.blockToken;
    this.stageId = wire.stageId;
    saveSessionToken(wire.sessionToken);
    return {
      done: wire.done,
      progress: wire.progress,
      itemsScored: wire.itemsScored,
      totalItems: wire.totalItems,
      stageId: wire.stageId,
      stageNumber: wire.stageNumber,
      stageCount: wire.stageCount,
      itemsCommitted: wire.itemsCommitted,
      questions: wire.questions ?? [],
      result: wire.result,
    };
  }

  /** Start a new diagnostic or resume the stored session; serves the current block. */
  async start(): Promise<DiagnosticBlockView> {
    try {
      return await this.post('/next', this.sessionToken ? { sessionToken: this.sessionToken } : {});
    } catch (error) {
      // If a stored session was rejected, retry once with a fresh session.
      if (this.sessionToken === null) throw error;
      this.reset();
      return this.post('/next', {});
    }
  }

  /**
   * Commit the open block and receive the next one (or the completed result).
   *
   * Every question of the block is sent, unanswered ones as an explicit null:
   * the engine reads null as "not known", and an omission that the server had to
   * guess at would put the not-known signal and the number-correct route out of
   * step with each other.
   */
  async submitBlock(
    questionIds: readonly string[],
    answers: Readonly<Record<string, string>>,
    elapsedMs: Readonly<Record<string, number>> = {},
  ): Promise<DiagnosticBlockView> {
    if (this.sessionToken === null || this.blockToken === null || this.stageId === null) {
      // No live block to commit — re-sync by serving the current block.
      return this.start();
    }
    const payload: BlockAnswers = {};
    for (const questionId of questionIds) {
      const choice = answers[questionId];
      payload[questionId] = choice === undefined ? null : (choice as ChoiceId);
    }
    const committedStageId = this.stageId;
    const view = await this.post('/block', {
      sessionToken: this.sessionToken,
      blockToken: this.blockToken,
      stageId: committedStageId,
      answers: payload,
      elapsedMs,
    });
    try {
      sessionStorage.removeItem(`${DRAFT_PREFIX}${committedStageId}`);
    } catch {
      /* ignore */
    }
    return view;
  }

  reset(): void {
    this.sessionToken = null;
    this.blockToken = null;
    this.stageId = null;
    clearBlockDrafts();
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const diagnosticClient = new DiagnosticClient();
