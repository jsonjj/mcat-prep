import { describe, expect, it } from 'vitest';
import { authoredQuestionToBankRows, type AuthoredQuestion } from '@mcat/content';
import {
  FilePracticeBankPort,
  type PulledCorpus,
  type PulledProtected,
  type PulledQuestion,
} from '@mcat/corpus-pull';

/**
 * End-to-end round trip for an INGESTED authored question: author → compile →
 * dev pull rows → the file-backed practice bank. Proves the item becomes servable
 * (queue + question view), its per-choice misconceptions are retrievable
 * SERVER-ONLY via getAnswer, and NONE of the answer material reaches the
 * learner-safe question view. Nothing here touches the gitignored real pull.
 */

const science: AuthoredQuestion = {
  id: 'ingest-sci-1',
  section: 'BB',
  kc_id: 'V3-KC-010372', // → V3-LES-006619 → BB3 (a real registry id)
  skill: 'EXPLAIN',
  dok: 2,
  lesson_id: 'V3-LES-006619',
  family_id: 'FAM-ingest-sci',
  passage: '',
  stem: 'Which option explains the observation without an unsupported assumption?',
  choices: [
    { id: 'A', text: 'A text', correct: false, misconception: 'reverses cause and effect', rationale: 'why A is wrong' },
    { id: 'B', text: 'B text', correct: true, misconception: null, rationale: 'why B is right' },
    { id: 'C', text: 'C text', correct: false, misconception: 'confuses correlation with mechanism', rationale: 'why C is wrong' },
    { id: 'D', text: 'D text', correct: false, misconception: 'over-generalizes the rule', rationale: 'why D is wrong' },
  ],
  explanation: 'Worked explanation for the science item.',
} as AuthoredQuestion;

const cars: AuthoredQuestion = {
  id: 'ingest-cars-1',
  section: 'CARS',
  skill: 'FOC',
  dok: 2,
  family_id: 'FAM-ingest-cars',
  passage: 'A shared CARS stimulus the item is anchored to.',
  stem: 'The passage most strongly supports which claim?',
  choices: [
    { id: 'A', text: 'A text', correct: true, misconception: null, rationale: 'why A is right' },
    { id: 'B', text: 'B text', correct: false, misconception: 'misreads the author’s tone', rationale: 'why B is wrong' },
    { id: 'C', text: 'C text', correct: false, misconception: 'imports outside knowledge', rationale: 'why C is wrong' },
    { id: 'D', text: 'D text', correct: false, misconception: 'over-reads a hedge as a claim', rationale: 'why D is wrong' },
  ],
  explanation: 'Worked explanation for the CARS item.',
} as AuthoredQuestion;

function corpusFrom(authored: readonly AuthoredQuestion[]): PulledCorpus {
  const rows = authored.map(authoredQuestionToBankRows);
  return {
    questions: rows.map((r) => r.safe as unknown as PulledQuestion),
    protectedById: new Map(
      rows.map((r) => [r.protected.question_id, r.protected as unknown as PulledProtected]),
    ),
  };
}

describe('ingested authored questions round-trip through the file-backed practice bank', () => {
  const port = new FilePracticeBankPort(corpusFrom([science, cars]));

  it('loads both items and makes both practisable units', () => {
    expect(port.stats.items).toBe(2);
    // Science practisable needs skill + cluster; CARS practisable needs a carsSkill.
    expect(port.stats.practisableUnits).toBe(2);
  });

  it('serves the science item via the queue path, classified by its authored op', async () => {
    const classification = await port.classify('ingest-sci-1');
    expect(classification).not.toBeNull();
    expect(classification!.domain).toBe('science');
    expect(classification!.cluster).toBe('BB3');
    // The authored reasoning_operation flows through the pull (additive column).
    expect(classification!.skill).toBe('EXPLAIN');

    const found = await port.findItems(
      { domain: 'science', kcId: 'V3-KC-010372', skill: 'EXPLAIN', targetB: 0 },
      { excludeIds: [], limit: 10 },
    );
    expect(found.map((f) => f.question.id)).toContain('ingest-sci-1');
  });

  it('serves the CARS item classified by its CARS sub-skill', async () => {
    const classification = await port.classify('ingest-cars-1');
    expect(classification!.domain).toBe('cars');
    expect(classification!.carsSkill).toBe('FOC');
    const found = await port.findItems(
      { domain: 'cars', carsSkill: 'FOC', targetB: 0 },
      { excludeIds: [], limit: 10 },
    );
    expect(found.map((f) => f.question.id)).toContain('ingest-cars-1');
  });

  it('retrieves per-choice misconceptions SERVER-ONLY via getAnswer', async () => {
    const answer = await port.getAnswer('ingest-sci-1');
    expect(answer).not.toBeNull();
    expect(answer!.correctChoiceId).toBe('B');
    expect(answer!.errorModels).not.toBeNull();
    // Wrong choices carry the authored misconception; the key is tagged.
    expect(answer!.errorModels!.A).toBe('misconception: reverses cause and effect');
    expect(answer!.errorModels!.B).toBe('correct_model');
    expect(answer!.errorModels!.C).toContain('correlation');

    const carsAnswer = await port.getAnswer('ingest-cars-1');
    expect(carsAnswer!.errorModels!.B).toContain('tone');
  });

  it('never puts key/misconception material on the learner-safe question view', async () => {
    const view = await port.getQuestion('ingest-sci-1');
    expect(view).not.toBeNull();
    const json = JSON.stringify(view);
    expect(json).not.toContain('misconception');
    expect(json).not.toContain('correct_model');
    expect(json).not.toContain('error_models');
    expect(json).not.toContain('why B is right');
    // The view still carries the learner-facing content.
    expect(view!.stem).toContain('explains the observation');
    expect(view!.choices).toHaveLength(4);
  });
});
