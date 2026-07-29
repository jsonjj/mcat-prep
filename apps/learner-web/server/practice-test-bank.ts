import {
  CLUSTER_INFO,
  SectionSchema,
  SKILL_CLUSTERS,
  type CarsSkill,
  type QuestionFormat,
  type ReasoningOperation,
  type Section,
  type SkillCluster,
} from '@mcat/contracts';
import { resolveCarsSkill, resolveReasoningOperation } from '@mcat/content';
import type { DatedUnitObservation, PracticeTestCandidate } from '@mcat/policies';
import { loadPulledCorpus, type PulledCorpus, type PulledQuestion } from './db-pull';

/**
 * Server-side bank for the periodic practice test (WS5).
 *
 * It is the diagnostic bank's sibling and shares its guarantees — built once,
 * the only place the protected key lives on the server, hands out learner-safe
 * views that cannot represent a key — with one deliberate difference: it keeps
 * CARS. The diagnostic reaches a concept through its lesson and so drops the
 * whole reasoning/CARS bank; a practice test is a blueprint exam, and the AAMC
 * blueprint is a quarter CARS, so every eligible item with a real cluster is a
 * candidate here, CARS included.
 *
 * The per-learner "already scored" set lives here too, in memory, exactly as the
 * file practice bank keeps exposure/repair state: it is what makes a periodic
 * test FRESH — an item scored on any prior sitting is never dealt again. The
 * durable equivalents are `database/migrations/0016_practice_test.sql`; the dev
 * server keeps them in memory, as the diagnostic and the file bank do.
 *
 * Node-only: `grade`/`score` read the protected key material.
 */

/** A learner-safe question view for the browser. No key, no explanations. */
export interface PracticeTestItemView {
  id: string;
  section: Section;
  sectionTitle: string;
  cluster: SkillCluster;
  clusterTitle: string;
  passage: string;
  stem: string;
  choices: { id: 'A' | 'B' | 'C' | 'D'; text: string }[];
}

/** Per-item classification the scorer + session record need after a sitting. */
export interface PracticeTestClassification {
  section: Section;
  cluster: SkillCluster;
  kcId: string | null;
  skill: ReasoningOperation | null;
  carsSkill: CarsSkill | null;
  familyId: string;
  dokLevel: number | undefined;
}

/** Server-only reveal for the post-test review flow. */
export interface PracticeTestGrade {
  correct: boolean;
  correctChoiceId: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

const SECTION_TITLE: Readonly<Record<Section, string>> = {
  cp: 'Chemical & Physical Foundations',
  cars: 'Critical Analysis & Reasoning',
  bb: 'Biological & Biochemical Foundations',
  ps: 'Psychological & Social Foundations',
};

/** status values treated as test-eligible (the corpus ships as candidates). */
const ELIGIBLE_STATUS = new Set(['production_candidate', 'published']);
const HELD_OUT_STATUSES = new Set(['held_out', 'holdout', 'retired', 'archived', 'draft', 'rejected']);
const VALID_CLUSTERS = new Set<string>(SKILL_CLUSTERS);
const CHOICE_IDS = ['A', 'B', 'C', 'D'] as const;

interface BankItem {
  readonly id: string;
  readonly section: Section;
  readonly cluster: SkillCluster;
  readonly kcId: string | null;
  readonly skill: ReasoningOperation | null;
  readonly carsSkill: CarsSkill | null;
  readonly format: QuestionFormat;
  readonly dokLevel: number | null;
  readonly familyId: string | null;
  readonly eligible: boolean;
  readonly passage: string;
  readonly stem: string;
  readonly choices: Readonly<Record<'A' | 'B' | 'C' | 'D', string>>;
  readonly correctAnswer: 'A' | 'B' | 'C' | 'D';
  readonly explanations: Readonly<Record<string, string>>;
}

/**
 * Item format from what the pull actually carries. The corpus has no reliable
 * format column (the diagnostic bank hardcodes `discrete_mcq`), so a passage is
 * the one signal available: a question with one is a passage item, without one a
 * discrete item. The graph/experiment variants are not distinguishable here and
 * are left for a bank that tags them, which is why the default blueprint floors
 * only these two.
 */
const formatOf = (passage: string): QuestionFormat =>
  passage.trim() === '' ? 'discrete_mcq' : 'passage_mcq';

function toItem(row: PulledQuestion, key: { correct_answer: 'A' | 'B' | 'C' | 'D'; explanations: Record<string, string> }): BankItem | null {
  const choices = row.choices;
  const c = row.cluster;
  if (
    c === null ||
    !VALID_CLUSTERS.has(c) ||
    choices === null ||
    CHOICE_IDS.some((id) => (choices[id] ?? '').trim() === '') ||
    row.stem.trim() === ''
  ) {
    return null;
  }
  const cluster = c as SkillCluster;
  // Canonical section from the cluster, exactly as the diagnostic bank does, so
  // a CARS cluster is section `cars` whatever the raw `section` string says.
  const section = CLUSTER_INFO[cluster].section;
  const domain: 'science' | 'cars' = section === 'cars' ? 'cars' : 'science';
  const passage = row.passage ?? '';
  return {
    id: row.question_id,
    section,
    cluster,
    kcId: row.kc_id,
    skill:
      domain === 'science'
        ? resolveReasoningOperation({ primary_skill: row.primary_skill ?? undefined })
        : null,
    carsSkill: domain === 'cars' ? resolveCarsSkill(row.primary_skill) : null,
    format: formatOf(passage),
    dokLevel: row.dok_level,
    familyId: row.family_id,
    // A held-out item is present but not deliverable; keep it out of the candidate
    // set the same way the diagnostic and file banks do.
    eligible: ELIGIBLE_STATUS.has(row.status ?? '') && !HELD_OUT_STATUSES.has(row.status ?? ''),
    passage,
    stem: row.stem,
    choices: { A: choices.A!, B: choices.B!, C: choices.C!, D: choices.D! },
    correctAnswer: key.correct_answer,
    explanations: key.explanations ?? {},
  };
}

export interface PracticeTestBankStats {
  /** Deliverable items (eligible, cluster-resolved, keyed). */
  readonly items: number;
  /** How many of those are CARS — the section the diagnostic cannot reach. */
  readonly cars: number;
  readonly rows: number;
}

export class PracticeTestBank {
  private readonly byId = new Map<string, BankItem>();
  readonly candidates: PracticeTestCandidate[];
  readonly stats: PracticeTestBankStats;
  /** Per-learner ids scored on a COMPLETED prior sitting; never re-dealt. */
  private readonly scored = new Map<string, Set<string>>();
  /** Per-learner per-unit observation history across sittings, for the decay-weighted re-measure. */
  private readonly history = new Map<string, DatedUnitObservation[]>();

  constructor(corpus: PulledCorpus) {
    const candidates: PracticeTestCandidate[] = [];
    let cars = 0;
    for (const row of corpus.questions) {
      const key = corpus.protectedById.get(row.question_id);
      if (key === undefined) continue; // no key → no scoring/reveal → undeliverable
      const item = toItem(row, key);
      if (item === null) continue;
      this.byId.set(item.id, item);
      if (item.section === 'cars') cars += 1;
      candidates.push({
        questionId: item.id,
        section: item.section,
        cluster: item.cluster,
        skill: item.skill,
        carsSkill: item.carsSkill,
        format: item.format,
        dokLevel: item.dokLevel,
        familyId: item.familyId,
        eligible: item.eligible,
      });
    }
    this.candidates = candidates;
    this.stats = { items: candidates.length, cars, rows: corpus.questions.length };
  }

  has(questionId: string): boolean {
    return this.byId.has(questionId);
  }

  /** Learner-safe view for delivery. Choices as an ordered A–D list for the UI. */
  view(questionId: string): PracticeTestItemView | null {
    const item = this.byId.get(questionId);
    if (item === undefined) return null;
    return {
      id: item.id,
      section: item.section,
      sectionTitle: SECTION_TITLE[item.section],
      cluster: item.cluster,
      clusterTitle: CLUSTER_INFO[item.cluster].title,
      passage: item.passage,
      stem: item.stem,
      choices: CHOICE_IDS.map((id) => ({ id, text: item.choices[id] })),
    };
  }

  /** SERVER-ONLY scoring: whether the choice matches the protected key. */
  score(questionId: string, choiceId: string | null): boolean {
    const item = this.byId.get(questionId);
    if (item === undefined) return false;
    return choiceId !== null && choiceId === item.correctAnswer;
  }

  classify(questionId: string): PracticeTestClassification | null {
    const item = this.byId.get(questionId);
    if (item === undefined) return null;
    return {
      section: item.section,
      cluster: item.cluster,
      kcId: item.kcId,
      skill: item.skill,
      carsSkill: item.carsSkill,
      familyId: item.familyId ?? `fam-${item.id}`,
      dokLevel: item.dokLevel ?? undefined,
    };
  }

  /**
   * SERVER-ONLY reveal for the review flow: correctness, the correct choice, and
   * the explanation for the option the learner picked (falling back to the key's).
   * The test itself never echoes per-item correctness; only the review does.
   */
  grade(questionId: string, choiceId: 'A' | 'B' | 'C' | 'D' | null): PracticeTestGrade | null {
    const item = this.byId.get(questionId);
    if (item === undefined) return null;
    const explanation =
      (choiceId !== null ? item.explanations[choiceId] : undefined) ??
      item.explanations[item.correctAnswer] ??
      '';
    return {
      correct: choiceId !== null && choiceId === item.correctAnswer,
      correctChoiceId: item.correctAnswer,
      explanation,
    };
  }

  /** The learner's already-scored item ids (from completed prior sittings). */
  scoredIds(learnerId: string): ReadonlySet<string> {
    return this.scored.get(learnerId) ?? new Set<string>();
  }

  /** Mark a completed sitting's items scored, so no future test can re-serve them. */
  markScored(learnerId: string, questionIds: readonly string[]): void {
    const set = this.scored.get(learnerId) ?? new Set<string>();
    for (const id of questionIds) set.add(id);
    this.scored.set(learnerId, set);
  }

  /** The learner's per-unit observation history from prior completed sittings. */
  unitHistory(learnerId: string): readonly DatedUnitObservation[] {
    return this.history.get(learnerId) ?? [];
  }

  /** Append one completed sitting's per-unit observations to the learner's history. */
  appendUnitHistory(learnerId: string, observations: readonly DatedUnitObservation[]): void {
    const list = this.history.get(learnerId) ?? [];
    list.push(...observations);
    this.history.set(learnerId, list);
  }
}

/** Prefer the real pulled corpus; null when absent so the caller can fall back. */
export function createPracticeTestBank(
  corpus: PulledCorpus | null = loadPulledCorpus(),
): PracticeTestBank | null {
  if (corpus === null) return null;
  const bank = new PracticeTestBank(corpus);
  return bank.stats.items > 0 ? bank : null;
}

/** The four sections in blueprint delivery order (C/P → CARS → B/B → P/S). */
export const PRACTICE_TEST_SECTION_ORDER: readonly Section[] = SectionSchema.options;
