/**
 * Adaptive Practice server logic for @mcat/authority-core.
 *
 * The authority owns the WRITE side of Practice: it turns the learner's mastery
 * state into a scored snapshot, asks the pure selection engine
 * (@mcat/policies `practice-selection`) for specs, pulls one FRESH item per spec
 * from an injected `PracticeBankPort`, and — on a first, unassisted answer —
 * moves the P(L) mastery signal through the EXISTING mastery-bkt engine (BKT for
 * science, IRT `carsUpdate` for CARS).
 *
 * The `PracticeBankPort` is the ONLY seam to the item corpus + per-learner
 * exposure/repair. Keeping it an interface here means authority-core never
 * imports pg/persistence: the deployed learner-api injects a Postgres-backed
 * port, and dev/tests fall back to the in-memory `SyntheticPracticeBankPort`
 * built from the loaded bank.
 */
import type {
  CarsSkill,
  PracticeDomain,
  PracticeQuestion,
  ReasoningOperation,
  SkillCluster,
  UtcTimestamp,
} from '@mcat/contracts';
import { coldStartB } from '@mcat/policies';
import type { CompiledQuestion, EngineQuestion, LoadedBank } from '@mcat/content';

/**
 * A single spec resolved to a concrete bank query. Uses only contracts types so
 * the port stays independent of the selection engine's internals.
 */
export interface PracticeItemQuery {
  readonly domain: PracticeDomain;
  readonly kcId?: string;
  readonly skill?: ReasoningOperation;
  readonly carsSkill?: CarsSkill;
  /** Target difficulty `b` (the band centre) the bank ranks items against. */
  readonly targetB: number;
}

/** A distinct practisable unit discovered in the bank (KC × reasoning skill). */
export interface PracticeCandidateUnit {
  readonly kcId: string;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly cluster: SkillCluster | null;
  readonly section: string;
  readonly domain: PracticeDomain;
  readonly dok: number | null;
  readonly lessonId: string | null;
  /** Number of deliverable items backing this unit. */
  readonly itemCount: number;
}

/** One fresh learner-safe item matched to a spec, with the difficulty signals. */
export interface PracticeBankItem {
  readonly question: PracticeQuestion;
  /** Calibrated IRT `b` if the item cleared the attempts floor, else null. */
  readonly b: number | null;
  readonly attempts: number;
  readonly correct: number;
  readonly dok: number | null;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly cluster: SkillCluster | null;
  readonly domain: PracticeDomain;
}

/** The classification the authority needs to route a scored attempt to mastery. */
export interface PracticeItemClassification {
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly cluster: SkillCluster | null;
  readonly domain: PracticeDomain;
  readonly dok: number | null;
  readonly lessonId: string | null;
  /** Item family, so a re-attempt can prefer a sibling rather than a re-serve. */
  readonly familyId: string | null;
}

/**
 * Which surface a logged attempt came from. Both are genuine QUESTION attempts:
 * adaptive Practice serves from the v7 corpus, the Study path serves the authored
 * lesson sequence. Recall lapses and in-lesson comprehension checks are
 * deliberately absent — those are acquisition events, not mistakes
 * (docs/design/error-handling-design.md §6.5).
 */
export type AttemptActivityType = 'practice' | 'study';

/**
 * One logged first attempt: which item, which grain, and WHICH WRONG ANSWER.
 *
 * Correct attempts are logged too — the pattern section has to show a
 * denominator ("4 of 6 items in this KC"), and a misses-only log cannot produce
 * one (docs/design/error-handling-design.md §6.5).
 *
 * Deliberately carries no cause: cause is unrecoverable (§2.3). It DOES carry
 * the diagnose-before-reveal timing — `elapsedMs` (deliberation time to submit)
 * and `answerChanges` (how many times the selection changed first) — as
 * behavioural proxies for confidence (WS0). Both are OPTIONAL: a surface that
 * did not measure them omits them and the store records the absence as NULL
 * ("not captured"), which WS1 must tell apart from a real `0`. Neither ever
 * awards mastery.
 */
export interface PracticeAttemptLogEntry {
  readonly questionId: string;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly cluster: SkillCluster | null;
  readonly familyId: string | null;
  readonly chosenChoiceId: 'A' | 'B' | 'C' | 'D' | null;
  readonly correct: boolean;
  readonly firstAttempt: boolean;
  readonly activityType: AttemptActivityType;
  readonly occurredAt: UtcTimestamp;
  /** Deliberation time to submit, in whole ms. `null` when not captured. */
  readonly elapsedMs?: number | null;
  /** Selection changes before submit. `null` when not captured. */
  readonly answerChanges?: number | null;
}

/** Server-only answer material (never in a queue payload). */
export interface PracticeAnswer {
  readonly correctChoiceId: 'A' | 'B' | 'C' | 'D';
  readonly rationale: string;
  readonly choiceRationales: Record<string, string>;
  /**
   * Per-choice authored misconceptions (WS2), keyed by choice letter — the
   * correct choice tagged `correct_model`, the rest naming the misconception
   * behind picking them. SERVER-ONLY, exactly like `choiceRationales`: it exists
   * so the Mistakes read can join the PICKED option's misconception post-answer,
   * and it is never placed on a learner-safe (queue) payload. Null when the item
   * carries no error model (older corpus, synthetic bank).
   */
  readonly errorModels?: Record<string, string> | null;
}

export interface PracticeRepairTarget {
  readonly kcId: string;
  readonly skill?: ReasoningOperation;
}

/**
 * A learner's exposure to one item, as of immediately after recording this one.
 *
 * `recordExposure` returns it rather than a separate reader answering the same
 * question, because the two would be a read and a write of one fact with a gap
 * between them: two concurrent submissions of the same item would both read
 * zero and both count as a first attempt. Incrementing and reporting in one
 * operation makes exactly one of them first, whatever the ordering.
 */
export interface PracticeExposure {
  /** How many times the learner had answered this item BEFORE this response. */
  readonly priorExposures: number;
}

/**
 * The server's record that it handed ONE item to ONE learner and will accept
 * one answer to it.
 *
 * This is the authorization for an adaptive-practice submission, and it exists
 * because `specId` alone was not one: the command carried a spec the server
 * merely read back, so a caller who never asked for a queue could name any
 * corpus item, forge any spec, and receive an independent evidence record and a
 * BKT write. Teach-before-test, queue selection and the taught-set gate all
 * live in `getPracticeQueue`, so anything that can be answered without going
 * through it is outside every one of them.
 *
 * Four facts are bound here and re-checked at submission, so each is a claim
 * the server issued rather than one the request makes:
 * - `questionId` — the grant is stored under it, so a grant for one item can
 *   never authorize another,
 * - `specId` — the selection decision that produced the serve,
 * - `contentRelease` — an answer to an item served under a superseded release
 *   is refused rather than scored against the current one,
 * - `expiresAt` — a grant is not a standing permission.
 *
 * NOT AN EXPOSURE. A grant records that the server served an item; exposure
 * records that the learner answered one. They are deliberately separate stores
 * with separate lifetimes — see the `SERVING IS NOT AN EXPOSURE` docblock on
 * `Authority.getPracticeQueue` for what collapsing them would cost.
 */
export interface PracticeAttemptGrant {
  readonly questionId: string;
  readonly specId: string;
  readonly contentRelease: string;
  readonly expiresAt: UtcTimestamp;
}

/** Why the server will not accept this answer. Named, never a bare boolean. */
export type PracticeAttemptRefusal =
  | 'PRACTICE_ATTEMPT_NOT_ISSUED'
  | 'PRACTICE_ATTEMPT_EXPIRED'
  | 'PRACTICE_ATTEMPT_SPEC_MISMATCH'
  | 'PRACTICE_ATTEMPT_CONTENT_RELEASE_STALE';

/**
 * The outcome of presenting one answer against a stored grant.
 *
 * `firstUse` is the ONE-USE half: a grant is spent by the first answer it
 * authorizes. A later answer to the same item is still admitted — a repeat is
 * a documented, learning-only outcome and refusing it would delete that
 * behaviour rather than gate it — but it can never again be a capability
 * claim. So the grant is a second, independent server-held fact standing beside
 * the exposure count, and `firstAttempt` requires BOTH to agree.
 */
export type PracticeAttemptAuthorization =
  | { readonly status: 'authorized'; readonly firstUse: boolean }
  | { readonly status: 'refused'; readonly reason: PracticeAttemptRefusal };

/**
 * The single seam between the authority and the item corpus + per-learner
 * practice bookkeeping. `findItems`/`getAnswer` are the core (as planned); the
 * remaining methods carry the difficulty stats, recent-exposure freshness, the
 * repair queue, and the served-item grants that authorize a submission. All
 * per-learner methods take an explicit `learnerId` so one port instance can
 * serve every learner (the deployed path shares one pool).
 */
export interface PracticeBankPort {
  listUnits(input: { limit: number }): Promise<PracticeCandidateUnit[]>;
  findItems(
    query: PracticeItemQuery,
    input: { excludeIds: readonly string[]; limit: number },
  ): Promise<PracticeBankItem[]>;
  classify(questionId: string): Promise<PracticeItemClassification | null>;
  /** The learner-safe item, re-read when a past miss is displayed back. */
  getQuestion(questionId: string): Promise<PracticeQuestion | null>;
  getAnswer(questionId: string): Promise<PracticeAnswer | null>;
  questionStats(questionId: string): Promise<{ attempts: number; correct: number }>;
  recordAttempt(questionId: string, correct: boolean, now: UtcTimestamp): Promise<void>;
  recentlySeenIds(learnerId: string, input: { withinDays: number; limit: number }): Promise<string[]>;
  /**
   * Record one exposure and report what the learner's history was before it.
   *
   * The prior count is what the authority derives `firstAttempt` from, so this
   * must be the learner's WHOLE history with the item and never a recent
   * window: a window would let a repeat far enough in the past read as a first
   * attempt again.
   */
  recordExposure(
    learnerId: string,
    questionId: string,
    now: UtcTimestamp,
  ): Promise<PracticeExposure>;
  /**
   * Record that the server served one item to one learner, replacing any
   * earlier grant for the same item.
   *
   * Replacement rather than accumulation, because a re-serve IS a fresh
   * authorization: the queue only re-serves an item the rotation window has
   * released, and at that point a new answer to it is exactly as legitimate as
   * the first was. What it is not is a fresh FIRST attempt — that stays with
   * the exposure count, which is unwindowed.
   */
  issueAttemptGrant(learnerId: string, grant: PracticeAttemptGrant): Promise<void>;
  /**
   * Check one answer against the stored grant and spend it, in one operation.
   *
   * Read-then-write would leave a window in which two concurrent submissions of
   * the same item both saw an unspent grant — the same race `recordExposure`
   * closes by returning the count from the write that increments it.
   */
  consumeAttemptGrant(
    learnerId: string,
    claim: {
      questionId: string;
      specId: string;
      contentRelease: string;
      now: UtcTimestamp;
    },
  ): Promise<PracticeAttemptAuthorization>;
  recentMisses(learnerId: string, input: { limit: number }): Promise<PracticeRepairTarget[]>;
  queueRepair(learnerId: string, target: PracticeRepairTarget, now: UtcTimestamp): Promise<void>;
  /** Append one first-attempt row (idempotent per learner × activity type × item). */
  recordPracticeAttempt(learnerId: string, entry: PracticeAttemptLogEntry): Promise<void>;
  /** A learner's logged question attempts (practice and study), newest first. */
  listPracticeAttempts(
    learnerId: string,
    input: { limit: number },
  ): Promise<PracticeAttemptLogEntry[]>;
}

/**
 * DEV/TEST fallback: the 8 operation-template tags the synthetic bank uses map
 * onto the 7 reasoning operations the mastery engine tracks (same heuristic the
 * synthetic study loop uses). Real v7 items carry `reasoning_operation` directly.
 */
const OPERATION_TAG_TO_REASONING: Readonly<Record<string, ReasoningOperation>> = {
  K: 'IDENTIFY',
  Q: 'QUANTIFY',
  E: 'EVIDENCE',
  D: 'RELATE',
  P: 'EXPLAIN',
  A: 'EXPLAIN',
  I: 'PREDICT',
  T: 'IDENTIFY',
};

/** Map a compiled engine question + its stimulus into the learner-safe practice DTO. */
export function compiledToPracticeQuestion(
  bank: LoadedBank,
  compiled: CompiledQuestion,
): PracticeQuestion {
  const passage =
    compiled.safe.stimulus_id !== null
      ? (bank.stimuli.find((s) => s.id === compiled.safe.stimulus_id)?.body.join('\n\n') ?? '')
      : '';
  return {
    id: compiled.safe.id,
    section: compiled.safe.section,
    cluster: compiled.safe.skill_cluster,
    passage,
    stem: compiled.safe.stem,
    choices: compiled.safe.choices.map((c) => ({ id: c.id, text: c.text })),
  };
}

interface ExposureEntry {
  count: number;
  lastSeenAt: string;
}

/** A stored grant plus whether its one capability use has been spent. */
export interface StoredPracticeAttemptGrant extends PracticeAttemptGrant {
  readonly consumedAt: string | null;
}

/**
 * Adjudicate one answer against a stored grant, shared by every in-memory
 * grant store (the synthetic port, the dev file port, and the Postgres port's
 * schema-absent fallback) so the four checks cannot drift between them.
 *
 * Order is deliberate. Absence is reported before any binding mismatch, and a
 * mismatch before expiry, so the message a caller can provoke says as little as
 * possible about a grant they were not issued.
 */
export function adjudicateAttemptGrant(
  entry: StoredPracticeAttemptGrant | undefined,
  claim: { specId: string; contentRelease: string; now: UtcTimestamp },
): PracticeAttemptAuthorization {
  if (entry === undefined) return { status: 'refused', reason: 'PRACTICE_ATTEMPT_NOT_ISSUED' };
  if (entry.specId !== claim.specId) {
    return { status: 'refused', reason: 'PRACTICE_ATTEMPT_SPEC_MISMATCH' };
  }
  if (entry.contentRelease !== claim.contentRelease) {
    return { status: 'refused', reason: 'PRACTICE_ATTEMPT_CONTENT_RELEASE_STALE' };
  }
  if (Date.parse(claim.now) > Date.parse(entry.expiresAt)) {
    return { status: 'refused', reason: 'PRACTICE_ATTEMPT_EXPIRED' };
  }
  return { status: 'authorized', firstUse: entry.consumedAt === null };
}

/**
 * In-memory `PracticeBankPort` over the loaded synthetic bank. Used in dev when
 * no `DATABASE_URL` is configured and in deterministic tests. Exposure + repair
 * are held per-instance so each `new Authority()` starts clean.
 */
export class SyntheticPracticeBankPort implements PracticeBankPort {
  private readonly exposure = new Map<string, Map<string, ExposureEntry>>();
  /** Served-item authorizations, kept strictly apart from `exposure`. */
  private readonly grants = new Map<string, Map<string, StoredPracticeAttemptGrant>>();
  private readonly misses = new Map<string, { kcId: string; skill?: ReasoningOperation; at: string }[]>();
  /** Practice attempt log. Newest last; keyed per learner, one row per item. */
  private readonly attempts = new Map<string, PracticeAttemptLogEntry[]>();

  constructor(private readonly bank: LoadedBank) {}

  private reasoningOp(q: EngineQuestion): ReasoningOperation | null {
    return OPERATION_TAG_TO_REASONING[q.template_tags[0] ?? 'K'] ?? null;
  }

  /**
   * The KC an item routes to, in the id space the deployed port reports.
   *
   * The Postgres port reads `questions.kc_id`, a v3 KC id, and this fixture stands
   * in for that corpus — so it has to report the same kind of id or dev and tests
   * silently exercise a KC vocabulary production never sees. That drift is what
   * hid the mismatch between the two attempt-log write paths. `internal_skill_ids`
   * remains the fallback for an engine question authored before `kc_ids` existed.
   */
  private kcOf(q: EngineQuestion): string | null {
    return q.kc_ids[0] ?? q.internal_skill_ids[0] ?? null;
  }

  private domainOf(section: string): PracticeDomain {
    return section === 'cars' ? 'cars' : 'science';
  }

  async listUnits({ limit }: { limit: number }): Promise<PracticeCandidateUnit[]> {
    const byKey = new Map<string, PracticeCandidateUnit>();
    for (const q of this.bank.questions) {
      const kcId = this.kcOf(q);
      if (kcId === null) continue;
      const skill = this.reasoningOp(q);
      const domain = this.domainOf(q.section);
      const key = `${domain}:${kcId}:${skill ?? ''}`;
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, { ...existing, itemCount: existing.itemCount + 1 });
        continue;
      }
      byKey.set(key, {
        kcId,
        skill: domain === 'science' ? skill : null,
        carsSkill: null,
        cluster: q.skill_cluster,
        section: q.section,
        domain,
        dok: q.difficulty ?? null,
        lessonId: null,
        itemCount: 1,
      });
    }
    return [...byKey.values()].slice(0, limit);
  }

  private matches(q: EngineQuestion, query: PracticeItemQuery): boolean {
    if (this.domainOf(q.section) !== query.domain) return false;
    if (query.domain === 'cars') return true;
    if (query.kcId !== undefined && this.kcOf(q) !== query.kcId) return false;
    if (query.skill !== undefined && this.reasoningOp(q) !== query.skill) return false;
    return true;
  }

  async findItems(
    query: PracticeItemQuery,
    { excludeIds, limit }: { excludeIds: readonly string[]; limit: number },
  ): Promise<PracticeBankItem[]> {
    const exclude = new Set(excludeIds);
    return this.bank.questions
      .filter((q) => this.matches(q, query) && !exclude.has(q.id))
      .map((q) => {
        const compiled = this.bank.compiled.get(q.id)!;
        // Uncalibrated in dev: rank by the DOK cold-start difficulty.
        const b = coldStartB(q.difficulty);
        return {
          item: {
            question: compiledToPracticeQuestion(this.bank, compiled),
            b: null,
            attempts: 0,
            correct: 0,
            dok: q.difficulty ?? null,
            kcId: this.kcOf(q),
            skill: query.domain === 'science' ? this.reasoningOp(q) : null,
            carsSkill: null,
            cluster: q.skill_cluster,
            domain: this.domainOf(q.section),
          } satisfies PracticeBankItem,
          sortB: Math.abs(b - query.targetB),
        };
      })
      .sort((a, b) => a.sortB - b.sortB)
      .slice(0, limit)
      .map((x) => x.item);
  }

  async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const q = this.bank.questions.find((x) => x.id === questionId);
    if (q === undefined) return null;
    const domain = this.domainOf(q.section);
    return {
      kcId: this.kcOf(q),
      skill: domain === 'science' ? this.reasoningOp(q) : null,
      carsSkill: null,
      cluster: q.skill_cluster,
      domain,
      dok: q.difficulty ?? null,
      lessonId: null,
      familyId: q.family_id ?? null,
    };
  }

  async getQuestion(questionId: string): Promise<PracticeQuestion | null> {
    const compiled = this.bank.compiled.get(questionId);
    return compiled === undefined ? null : compiledToPracticeQuestion(this.bank, compiled);
  }

  async getAnswer(questionId: string): Promise<PracticeAnswer | null> {
    const compiled = this.bank.compiled.get(questionId);
    if (compiled === undefined) return null;
    return {
      correctChoiceId: compiled.protected.correct_choice_id,
      rationale: compiled.protected.rationales.correct,
      choiceRationales: compiled.protected.rationales.choices as Record<string, string>,
      // The engine projection carries no error models; the real corpus paths do.
      errorModels: null,
    };
  }

  async questionStats(): Promise<{ attempts: number; correct: number }> {
    return { attempts: 0, correct: 0 };
  }

  async recordAttempt(): Promise<void> {
    // Synthetic bank difficulty is DOK cold-start only; no population stats.
  }

  async recentlySeenIds(
    learnerId: string,
    { withinDays, limit }: { withinDays: number; limit: number },
  ): Promise<string[]> {
    const map = this.exposure.get(learnerId);
    if (map === undefined) return [];
    const cutoff = Date.now() - withinDays * 86_400_000;
    return [...map.entries()]
      .filter(([, entry]) => Date.parse(entry.lastSeenAt) >= cutoff)
      .sort((a, b) => Date.parse(b[1].lastSeenAt) - Date.parse(a[1].lastSeenAt))
      .slice(0, limit)
      .map(([id]) => id);
  }

  async recordExposure(
    learnerId: string,
    questionId: string,
    now: UtcTimestamp,
  ): Promise<PracticeExposure> {
    const map = this.exposure.get(learnerId) ?? new Map<string, ExposureEntry>();
    const entry = map.get(questionId);
    const priorExposures = entry?.count ?? 0;
    map.set(questionId, { count: priorExposures + 1, lastSeenAt: now });
    this.exposure.set(learnerId, map);
    return { priorExposures };
  }

  async issueAttemptGrant(learnerId: string, grant: PracticeAttemptGrant): Promise<void> {
    const map = this.grants.get(learnerId) ?? new Map<string, StoredPracticeAttemptGrant>();
    map.set(grant.questionId, { ...grant, consumedAt: null });
    this.grants.set(learnerId, map);
  }

  async consumeAttemptGrant(
    learnerId: string,
    claim: { questionId: string; specId: string; contentRelease: string; now: UtcTimestamp },
  ): Promise<PracticeAttemptAuthorization> {
    const map = this.grants.get(learnerId);
    const entry = map?.get(claim.questionId);
    const outcome = adjudicateAttemptGrant(entry, claim);
    if (outcome.status === 'authorized' && outcome.firstUse && entry !== undefined) {
      map!.set(claim.questionId, { ...entry, consumedAt: claim.now });
    }
    return outcome;
  }

  async recentMisses(
    learnerId: string,
    { limit }: { limit: number },
  ): Promise<PracticeRepairTarget[]> {
    const list = this.misses.get(learnerId) ?? [];
    const seen = new Set<string>();
    const out: PracticeRepairTarget[] = [];
    for (const miss of [...list].reverse()) {
      if (seen.has(miss.kcId)) continue;
      seen.add(miss.kcId);
      out.push(miss.skill ? { kcId: miss.kcId, skill: miss.skill } : { kcId: miss.kcId });
      if (out.length >= limit) break;
    }
    return out;
  }

  async queueRepair(
    learnerId: string,
    target: PracticeRepairTarget,
    now: UtcTimestamp,
  ): Promise<void> {
    const list = this.misses.get(learnerId) ?? [];
    list.push(target.skill ? { kcId: target.kcId, skill: target.skill, at: now } : { kcId: target.kcId, at: now });
    this.misses.set(learnerId, list);
  }

  async recordPracticeAttempt(learnerId: string, entry: PracticeAttemptLogEntry): Promise<void> {
    const list = this.attempts.get(learnerId) ?? [];
    // Mirrors the partial unique index on (learner_id, activity_type, question_id):
    // a resubmit must not double-count a miss.
    if (
      list.some(
        (e) => e.questionId === entry.questionId && e.activityType === entry.activityType,
      )
    ) {
      return;
    }
    list.push(entry);
    this.attempts.set(learnerId, list);
  }

  async listPracticeAttempts(
    learnerId: string,
    { limit }: { limit: number },
  ): Promise<PracticeAttemptLogEntry[]> {
    return [...(this.attempts.get(learnerId) ?? [])]
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, Math.max(0, limit));
  }
}
