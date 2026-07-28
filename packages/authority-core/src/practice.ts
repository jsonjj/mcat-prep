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
 * Deliberately carries no cause, no confidence and no response time: cause is
 * unrecoverable (§2.3) and the other two are separate, undecided workstreams.
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
}

/** Server-only answer material (never in a queue payload). */
export interface PracticeAnswer {
  readonly correctChoiceId: 'A' | 'B' | 'C' | 'D';
  readonly rationale: string;
  readonly choiceRationales: Record<string, string>;
}

export interface PracticeRepairTarget {
  readonly kcId: string;
  readonly skill?: ReasoningOperation;
}

/**
 * The single seam between the authority and the item corpus + per-learner
 * practice bookkeeping. `findItems`/`getAnswer` are the core (as planned); the
 * remaining methods carry the difficulty stats, recent-exposure freshness, and
 * repair queue. All per-learner methods take an explicit `learnerId` so one port
 * instance can serve every learner (the deployed path shares one pool).
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
  recordExposure(learnerId: string, questionId: string, now: UtcTimestamp): Promise<void>;
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

/**
 * In-memory `PracticeBankPort` over the loaded synthetic bank. Used in dev when
 * no `DATABASE_URL` is configured and in deterministic tests. Exposure + repair
 * are held per-instance so each `new Authority()` starts clean.
 */
export class SyntheticPracticeBankPort implements PracticeBankPort {
  private readonly exposure = new Map<string, Map<string, ExposureEntry>>();
  private readonly misses = new Map<string, { kcId: string; skill?: ReasoningOperation; at: string }[]>();
  /** Practice attempt log. Newest last; keyed per learner, one row per item. */
  private readonly attempts = new Map<string, PracticeAttemptLogEntry[]>();

  constructor(private readonly bank: LoadedBank) {}

  private reasoningOp(q: EngineQuestion): ReasoningOperation | null {
    return OPERATION_TAG_TO_REASONING[q.template_tags[0] ?? 'K'] ?? null;
  }

  private domainOf(section: string): PracticeDomain {
    return section === 'cars' ? 'cars' : 'science';
  }

  async listUnits({ limit }: { limit: number }): Promise<PracticeCandidateUnit[]> {
    const byKey = new Map<string, PracticeCandidateUnit>();
    for (const q of this.bank.questions) {
      const kcId = q.internal_skill_ids[0];
      if (kcId === undefined) continue;
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
    if (query.kcId !== undefined && q.internal_skill_ids[0] !== query.kcId) return false;
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
            kcId: q.internal_skill_ids[0] ?? null,
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
      kcId: q.internal_skill_ids[0] ?? null,
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

  async recordExposure(learnerId: string, questionId: string, now: UtcTimestamp): Promise<void> {
    const map = this.exposure.get(learnerId) ?? new Map<string, ExposureEntry>();
    const entry = map.get(questionId);
    map.set(questionId, { count: (entry?.count ?? 0) + 1, lastSeenAt: now });
    this.exposure.set(learnerId, map);
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
