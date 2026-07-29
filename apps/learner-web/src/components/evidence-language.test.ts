import { describe, expect, it } from 'vitest';
import type { EvidenceReasonCode, MasteryMapEntry } from '@mcat/contracts';
import {
  EVIDENCE_REFRESH_LABEL,
  evidenceWarrant,
  lessonWarrantLine,
  warrantSentence,
} from './evidence-language';

/**
 * THE SENTENCE A LEARNER READS when a mastery claim is being withheld.
 *
 * It matters most on the lesson grain, and that is where it was missing. Since
 * `d438d43` a lesson-only path cannot satisfy the evidence gate, so a learner who
 * answered every question in a lesson correctly saw "In progress" on the Evidence
 * Atlas and nothing else — the capability half was finished, the warrant half was
 * what remained, and no surface said so. The wording already existed and was
 * wired only to the skill-grain surfaces.
 *
 * `Authority.getLessonWarrants` is the other half of this: it proves the reason
 * codes reach the lesson grain (`packages/authority-core/src/lesson-discounting
 * .test.ts`). This proves the codes become a sentence, so neither half can pass
 * while the learner still reads a bare status.
 */

const reasons = (...codes: EvidenceReasonCode[]): MasteryMapEntry['reasons'] =>
  codes.map((code) => ({ code }));

/**
 * What a completed-but-unwarranted lesson publishes: guided work on file, and
 * unassisted practice as the open slot. Taken from the codes the authority test
 * asserts, so the two describe one state.
 */
const COMPLETED_BUT_UNWARRANTED = reasons(
  'INSTRUCTIONAL_EVIDENCE_ONLY',
  'INDEPENDENT_EVIDENCE_GAP',
  'TRANSFER_EVIDENCE_GAP',
  'DELAYED_EVIDENCE_GAP',
);

describe('a withheld mastery claim explains itself', () => {
  it('says what is on file and what comes next, for a perfected lesson', () => {
    expect(warrantSentence(COMPLETED_BUT_UNWARRANTED)).toBe(
      'Guided work only so far. Next: unassisted practice.',
    );
  });

  it('names only the FIRST open slot, so the actionable one is not buried', () => {
    // The recipe's slots arrive in the order a learner earns them, and there are
    // seven. Listing them all would make the next step the least visible part.
    const sentence = warrantSentence(COMPLETED_BUT_UNWARRANTED);
    expect(sentence).not.toContain('transfer');
    expect(sentence).not.toContain('delayed recall');
    expect(sentence.match(/Next:/g)).toHaveLength(1);
  });

  it('drops the "next" clause when the warrant has no open slot', () => {
    expect(warrantSentence(reasons('INDEPENDENT_EVIDENCE_SATISFIED'))).toBe(
      'You have unassisted evidence.',
    );
  });

  it('is the same sentence at both grains, assembled once', () => {
    // The skill grain used to compose `status` and ` Next: gap.` inline in
    // `SkillDetail`, so the Atlas adding a second copy would have been two
    // spellings of one concept — the shape that produced the "Needs refresh"
    // ambiguity. Pinned against the parts so a change to either has to be
    // deliberate.
    const warrant = evidenceWarrant(COMPLETED_BUT_UNWARRANTED);
    expect(warrantSentence(COMPLETED_BUT_UNWARRANTED)).toBe(
      `${warrant.status} Next: ${warrant.nextGap}.`,
    );
  });

  it('says nothing about capability, and never borrows the freshness badge', () => {
    // Capability is `pL` / `atCapabilityCut` and comes from BKT alone; warrant
    // staleness is its own badge, rendered beside this sentence rather than in it.
    for (const code of [
      'INSTRUCTIONAL_EVIDENCE_ONLY',
      'INDEPENDENT_EVIDENCE_SATISFIED',
      'NO_USEFUL_EVIDENCE',
      'EVIDENCE_STALE',
    ] as const) {
      const sentence = warrantSentence(reasons(code));
      expect(sentence).not.toMatch(/master|%|strong|review due/i);
      expect(sentence).not.toContain(EVIDENCE_REFRESH_LABEL);
    }
  });

  it('falls back to "no evidence" only where a caller wants that said', () => {
    // The Atlas never asks: an empty lesson list means nothing is being withheld,
    // not that nothing is on file. `SkillDetail` does ask, for a grain with no
    // entry at all. One function, two callers, and the difference is the caller's.
    expect(warrantSentence([])).toBe('No evidence on file yet.');
  });
});

/**
 * The render boundary for the Atlas row: WHEN the sentence appears at all. It is
 * here rather than inside `EvidenceAtlas` because the decision is a copy
 * decision, and because the component itself needs WebGL and a selected 3D region
 * before a row exists to inspect.
 */
describe('the Evidence Atlas lesson row', () => {
  it('explains a lesson whose claim is withheld', () => {
    expect(lessonWarrantLine({ reasons: COMPLETED_BUT_UNWARRANTED })).toBe(
      'Guided work only so far. Next: unassisted practice.',
    );
  });

  it('says nothing about a mastered lesson', () => {
    // Empty reasons are the authority's signal that nothing is being withheld.
    // Rendering the fallback here would tell a learner who has finished AND
    // mastered a lesson that there is "No evidence on file yet."
    expect(lessonWarrantLine({ reasons: [] })).toBeNull();
  });

  it('says nothing about a lesson with no readout at all', () => {
    // Unpractised: the row already reads "Not started", and there is no warrant
    // to report because the rollup emits no entry for it.
    expect(lessonWarrantLine(undefined)).toBeNull();
  });
});
