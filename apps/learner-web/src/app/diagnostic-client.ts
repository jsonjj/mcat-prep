/**
 * Browser client for the diagnostic API (served by the dev/preview Vite plugin,
 * and by an API Gateway route in production). It only ever sends a session token,
 * a one-use item token, and the learner's choice; it never receives an answer key
 * or per-item correctness. The session token is kept in `sessionStorage` so an
 * interrupted diagnostic resumes exactly where it left off.
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

export interface DiagnosticResultView {
  confidenceLabel: 'High' | 'Medium' | 'Still building';
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
  }[];
  itemsScored: number;
}

export interface DiagnosticNextView {
  done: boolean;
  progress: number;
  itemsScored: number;
  question: DiagnosticItemView | null;
  result: DiagnosticResultView | null;
}

interface WireResponse extends DiagnosticNextView {
  sessionToken: string;
  itemToken: string | null;
}

const SESSION_KEY = 'mcat.diagnostic.session';
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

export class DiagnosticClient {
  private sessionToken: string | null = loadSessionToken();
  private itemToken: string | null = null;

  private async post(path: string, body: Record<string, unknown>): Promise<DiagnosticNextView> {
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
    this.itemToken = wire.itemToken;
    saveSessionToken(wire.sessionToken);
    return {
      done: wire.done,
      progress: wire.progress,
      itemsScored: wire.itemsScored,
      question: wire.question,
      result: wire.result,
    };
  }

  /** Start a new diagnostic or resume the stored session; serves the current item. */
  async start(): Promise<DiagnosticNextView> {
    try {
      return await this.post('/next', this.sessionToken ? { sessionToken: this.sessionToken } : {});
    } catch (error) {
      // If a stored session was rejected, retry once with a fresh session.
      if (this.sessionToken === null) throw error;
      this.reset();
      return this.post('/next', {});
    }
  }

  /** Submit one answer and receive the next item (or the completed result). */
  async answer(questionId: string, choiceId: ChoiceId | null, elapsedMs: number): Promise<DiagnosticNextView> {
    if (this.sessionToken === null || this.itemToken === null) {
      // No live item to answer — re-sync by serving the current item.
      return this.start();
    }
    return this.post('/answer', {
      sessionToken: this.sessionToken,
      itemToken: this.itemToken,
      questionId,
      choiceId,
      elapsedMs,
    });
  }

  reset(): void {
    this.sessionToken = null;
    this.itemToken = null;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }
}

export const diagnosticClient = new DiagnosticClient();
