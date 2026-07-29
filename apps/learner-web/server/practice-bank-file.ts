import type {
  PracticeAnswer,
  PracticeAttemptAuthorization,
  PracticeAttemptGrant,
  PracticeAttemptLogEntry,
  PracticeBankItem,
  PracticeBankPort,
  PracticeCandidateUnit,
  PracticeExposure,
  PracticeItemClassification,
  PracticeItemQuery,
  PracticeRepairTarget,
  StoredPracticeAttemptGrant,
} from '@mcat/authority-core';
import { adjudicateAttemptGrant } from '@mcat/authority-core';
import {
  SKILL_CLUSTERS,
  type CarsSkill,
  type PracticeDomain,
  type PracticeQuestion,
  type ReasoningOperation,
  type SkillCluster,
  type UtcTimestamp,
} from '@mcat/contracts';
import { resolveCarsSkill, resolveReasoningOperation } from '@mcat/content';
import { coldStartB } from '@mcat/policies';
import { loadPulledCorpus, type PulledCorpus, type PulledQuestion } from './db-pull';

/**
 * DEV-ONLY `PracticeBankPort` over the local corpus pull.
 *
 * Without `DATABASE_URL` the dev authority used to fall back to the 7-question
 * synthetic enzyme bank, which adaptive Practice exhausts in one session (every
 * served item is recorded as exposure and never re-served). The same 2,108-item
 * pull the Bayesian diagnostic already reads is available offline, so practice
 * reads it too and behaves like the deployed Postgres path.
 *
 * It deliberately mirrors `PostgresPracticeBankPort`'s DERIVATIONS — the same
 * held-out status list, the same `primary_skill` → reasoning-operation fallback,
 * the same DOK cold-start difficulty, the same `kc_id` grain — so dev exercises
 * the vocabulary production uses. What it does NOT mirror is persistence:
 * exposure, repair and the attempt log are per-instance and in-memory, exactly
 * as `SyntheticPracticeBankPort` keeps them. No migration, no Postgres.
 *
 * Node-only: `getAnswer` reads the pull's protected key material.
 */

/** Mirrors HELD_OUT_STATUSES in services/persistence-postgres question-bank-repository. */
const HELD_OUT_STATUSES = new Set([
  'held_out',
  'holdout',
  'retired',
  'archived',
  'draft',
  'rejected',
]);

const VALID_CLUSTERS = new Set<string>(SKILL_CLUSTERS);

const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const;

/**
 * One pulled row with every derivation the port needs precomputed. Doing this
 * once at construction keeps `findItems`/`listUnits` a linear scan over 2k
 * plain objects rather than re-deriving the mastery grain per request.
 */
interface FileBankItem {
  readonly id: string;
  readonly question: PracticeQuestion;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly cluster: SkillCluster | null;
  readonly section: string;
  readonly domain: PracticeDomain;
  readonly dok: number | null;
  readonly lessonId: string | null;
  readonly familyId: string | null;
  readonly primarySkill: string | null;
  /** DOK cold-start difficulty; the corpus pull carries no calibration stats. */
  readonly coldB: number;
}

/** What the pull actually yielded, so the dev server can state it at boot. */
export interface FileBankStats {
  /** Deliverable items (held-out statuses and malformed rows already dropped). */
  readonly items: number;
  /** Rows the pull contained before filtering. */
  readonly rows: number;
  /** Distinct KC × skill × cluster × section units the bank exposes. */
  readonly units: number;
  /**
   * Units that survive `buildPracticeSnapshot`'s filter (science needs both a
   * reasoning skill and a cluster; CARS needs a sub-skill). A unit that fails it
   * is invisible to selection, so a bank whose units all fail looks exactly like
   * an empty bank from the queue endpoint.
   */
  readonly practisableUnits: number;
}

const domainOf = (section: string, carsSkill: CarsSkill | null): PracticeDomain =>
  section === 'cars' || carsSkill !== null ? 'cars' : 'science';

const clusterOf = (value: string | null): SkillCluster | null =>
  value !== null && VALID_CLUSTERS.has(value) ? (value as SkillCluster) : null;

function toItem(row: PulledQuestion): FileBankItem | null {
  const choices = row.choices;
  if (
    HELD_OUT_STATUSES.has(row.status ?? '') ||
    row.stem.trim() === '' ||
    choices === null ||
    CHOICE_IDS.some((id) => (choices[id] ?? '').trim() === '')
  ) {
    return null;
  }
  const carsSkill = resolveCarsSkill(row.primary_skill);
  const domain = domainOf(row.section, carsSkill);
  return {
    id: row.question_id,
    question: {
      id: row.question_id,
      section: row.section,
      cluster: row.cluster,
      passage: row.passage ?? '',
      stem: row.stem,
      choices: CHOICE_IDS.map((id) => ({ id, text: choices[id]! })),
    },
    kcId: row.kc_id,
    // The pull has no authored `reasoning_operation` column and no construct
    // text, so this resolves through the same SIRS→op seed the Postgres port
    // falls back to on a content-only database (SIRS2 → EXPLAIN).
    skill:
      domain === 'science'
        ? resolveReasoningOperation({ primary_skill: row.primary_skill ?? undefined })
        : null,
    carsSkill,
    cluster: clusterOf(row.cluster),
    section: row.section,
    domain,
    dok: row.dok_level,
    lessonId: row.lesson_id,
    familyId: row.family_id,
    primarySkill: row.primary_skill,
    coldB: coldStartB(row.dok_level ?? undefined),
  };
}

interface ExposureEntry {
  count: number;
  lastSeenAt: string;
}

export class FilePracticeBankPort implements PracticeBankPort {
  private readonly items: readonly FileBankItem[];
  private readonly byId: ReadonlyMap<string, FileBankItem>;
  private readonly answers: ReadonlyMap<string, PracticeAnswer>;
  readonly stats: FileBankStats;

  private readonly exposure = new Map<string, Map<string, ExposureEntry>>();
  /** Served-item authorizations, kept strictly apart from `exposure`. */
  private readonly grants = new Map<string, Map<string, StoredPracticeAttemptGrant>>();
  private readonly misses = new Map<
    string,
    { kcId: string; skill?: ReasoningOperation; at: string }[]
  >();
  private readonly attemptLog = new Map<string, PracticeAttemptLogEntry[]>();

  constructor(corpus: PulledCorpus) {
    const items: FileBankItem[] = [];
    const byId = new Map<string, FileBankItem>();
    const answers = new Map<string, PracticeAnswer>();
    for (const row of corpus.questions) {
      const key = corpus.protectedById.get(row.question_id);
      const item = toItem(row);
      // No key → no scoring and no refutation, so the item is undeliverable.
      if (item === null || key === undefined) continue;
      items.push(item);
      byId.set(item.id, item);
      const explanations = key.explanations ?? {};
      answers.set(item.id, {
        correctChoiceId: key.correct_answer,
        rationale: explanations[key.correct_answer] ?? 'See the per-choice explanations.',
        choiceRationales: explanations,
        // Server-only per-choice misconceptions (WS2); null until the pull carries them.
        errorModels: key.error_models ?? null,
      });
    }
    this.items = items;
    this.byId = byId;
    this.answers = answers;

    const units = this.buildUnits();
    this.stats = {
      items: items.length,
      rows: corpus.questions.length,
      units: units.length,
      practisableUnits: units.filter((u) =>
        u.domain === 'cars' ? u.carsSkill !== null : u.skill !== null && u.cluster !== null,
      ).length,
    };
  }

  /**
   * Every unit in the bank, richest first — the grouping and ordering the
   * Postgres port gets from `group by kc_id, primary_skill, cluster, section
   * order by item_count desc`. The tie-break on key is ours: the authority asks
   * for a capped 400 and an unstable cap makes the queue non-reproducible.
   */
  private buildUnits(): PracticeCandidateUnit[] {
    const groups = new Map<
      string,
      { item: FileBankItem; count: number; dokSum: number; dokN: number }
    >();
    for (const item of this.items) {
      const key = `${item.kcId ?? ''}|${item.primarySkill ?? ''}|${item.cluster ?? ''}|${item.section}`;
      const group = groups.get(key);
      if (group === undefined) {
        groups.set(key, {
          item,
          count: 1,
          dokSum: item.dok ?? 0,
          dokN: item.dok === null ? 0 : 1,
        });
        continue;
      }
      group.count += 1;
      if (item.dok !== null) {
        group.dokSum += item.dok;
        group.dokN += 1;
      }
    }

    const ordered = [...groups.entries()]
      .sort((a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1))
      .map(([, group]) => group);

    const units: PracticeCandidateUnit[] = [];
    for (const group of ordered) {
      const { item } = group;
      const dok = group.dokN === 0 ? null : Math.round(group.dokSum / group.dokN);
      if (item.domain === 'cars') {
        if (item.carsSkill === null) continue;
        units.push({
          kcId: item.kcId ?? `cars:${item.carsSkill}`,
          skill: null,
          carsSkill: item.carsSkill,
          cluster: item.cluster,
          section: item.section,
          domain: 'cars',
          dok,
          lessonId: item.lessonId,
          itemCount: group.count,
        });
        continue;
      }
      if (item.kcId === null) continue; // science mastery needs a KC to route to
      units.push({
        kcId: item.kcId,
        skill: item.skill,
        carsSkill: null,
        cluster: item.cluster,
        section: item.section,
        domain: 'science',
        dok,
        lessonId: item.lessonId,
        itemCount: group.count,
      });
    }
    return units;
  }

  async listUnits({ limit }: { limit: number }): Promise<PracticeCandidateUnit[]> {
    return this.buildUnits().slice(0, Math.min(Math.max(limit, 1), 2000));
  }

  private matches(item: FileBankItem, query: PracticeItemQuery): boolean {
    if (item.domain !== query.domain) return false;
    if (query.domain === 'cars') {
      return query.carsSkill === undefined || item.carsSkill === query.carsSkill;
    }
    if (query.kcId !== undefined && item.kcId !== query.kcId) return false;
    if (query.skill !== undefined && item.skill !== query.skill) return false;
    return true;
  }

  async findItems(
    query: PracticeItemQuery,
    { excludeIds, limit }: { excludeIds: readonly string[]; limit: number },
  ): Promise<PracticeBankItem[]> {
    const exclude = new Set(excludeIds);
    return this.items
      .filter((item) => !exclude.has(item.id) && this.matches(item, query))
      .map((item) => ({ item, distance: Math.abs(item.coldB - query.targetB) }))
      .sort((a, b) => a.distance - b.distance || (a.item.id < b.item.id ? -1 : 1))
      .slice(0, Math.min(Math.max(limit, 1), 50))
      .map(({ item }) => ({
        question: item.question,
        // Uncalibrated: the pull carries no attempt counts, so `b` is withheld
        // and the DOK cold-start is used only for ranking (as in the PG port
        // against a content-only database).
        b: null,
        attempts: 0,
        correct: 0,
        dok: item.dok,
        kcId: item.kcId,
        skill: item.skill,
        carsSkill: item.carsSkill,
        cluster: item.cluster,
        domain: item.domain,
      }));
  }

  async classify(questionId: string): Promise<PracticeItemClassification | null> {
    const item = this.byId.get(questionId);
    if (item === undefined) return null;
    return {
      kcId: item.kcId,
      skill: item.skill,
      carsSkill: item.carsSkill,
      cluster: item.cluster,
      domain: item.domain,
      dok: item.dok,
      lessonId: item.lessonId,
      familyId: item.familyId,
    };
  }

  async getQuestion(questionId: string): Promise<PracticeQuestion | null> {
    return this.byId.get(questionId)?.question ?? null;
  }

  /** SERVER-ONLY. Key + per-choice refutations; never enters a queue payload. */
  async getAnswer(questionId: string): Promise<PracticeAnswer | null> {
    return this.answers.get(questionId) ?? null;
  }

  async questionStats(): Promise<{ attempts: number; correct: number }> {
    return { attempts: 0, correct: 0 };
  }

  async recordAttempt(): Promise<void> {
    // No population stats offline; difficulty stays the DOK cold-start.
  }

  async recentlySeenIds(
    learnerId: string,
    { withinDays, limit }: { withinDays: number; limit: number },
  ): Promise<string[]> {
    const map = this.exposure.get(learnerId);
    if (map === undefined) return [];
    const cutoff = Date.now() - Math.max(0, withinDays) * 86_400_000;
    return [...map.entries()]
      .filter(([, entry]) => Date.parse(entry.lastSeenAt) >= cutoff)
      .sort((a, b) => Date.parse(b[1].lastSeenAt) - Date.parse(a[1].lastSeenAt))
      .slice(0, Math.max(0, limit))
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
    list.push(
      target.skill
        ? { kcId: target.kcId, skill: target.skill, at: now }
        : { kcId: target.kcId, at: now },
    );
    this.misses.set(learnerId, list);
  }

  async recordPracticeAttempt(learnerId: string, entry: PracticeAttemptLogEntry): Promise<void> {
    const list = this.attemptLog.get(learnerId) ?? [];
    // Mirrors the partial unique index on (learner_id, activity_type, question_id):
    // a resubmit must not double-count a miss.
    if (
      list.some((e) => e.questionId === entry.questionId && e.activityType === entry.activityType)
    ) {
      return;
    }
    list.push(entry);
    this.attemptLog.set(learnerId, list);
  }

  async listPracticeAttempts(
    learnerId: string,
    { limit }: { limit: number },
  ): Promise<PracticeAttemptLogEntry[]> {
    return [...(this.attemptLog.get(learnerId) ?? [])]
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, Math.max(0, limit));
  }
}

/**
 * Build the file-backed port, or null when the pull is absent/unusable (fresh
 * clone, CI) so the caller can fall back to the synthetic bank.
 */
export function createFilePracticeBankPort(
  corpus: PulledCorpus | null = loadPulledCorpus(),
): FilePracticeBankPort | null {
  if (corpus === null) return null;
  const port = new FilePracticeBankPort(corpus);
  return port.stats.items > 0 ? port : null;
}
