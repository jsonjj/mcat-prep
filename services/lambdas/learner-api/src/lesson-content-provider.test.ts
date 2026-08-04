import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { normalizeLesson, type RawLessonArtifacts } from '@mcat/content/lesson-normalization';

import {
  AnswerKeyResolutionError,
  UnknownLessonError,
  createRepoLessonContentProvider,
} from './lesson-content-provider';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const contentRoot = join(repoRoot, 'content', 'lessons');

const L1 = 'V3-LES-130923';
const L2 = 'V3-LES-789208';
const L3 = 'V3-LES-844372';
const ALL = [L1, L2, L3];

const dirOf = (id: string): string => join(contentRoot, id.toLowerCase());
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

function readArtifacts(id: string): RawLessonArtifacts {
  const dir = dirOf(id);
  const optional = (name: string): unknown => {
    const p = join(dir, name);
    return existsSync(p) ? readJson(p) : undefined;
  };
  return {
    script: readJson(join(dir, 'lesson-script.json')),
    learnerSafeItems: optional('learner-safe-items.json'),
    protectedItems: optional('protected-items.json'),
  };
}

const provider = createRepoLessonContentProvider();

describe('LessonContentProvider — discovery and the learner-safe surface', () => {
  it('discovers exactly the three real lessons, sorted, by their own lesson_id', () => {
    expect(provider.listLessonIds()).toEqual([L1, L2, L3]);
    for (const id of ALL) expect(provider.hasLesson(id)).toBe(true);
    expect(provider.hasLesson('V3-LES-000000')).toBe(false);
  });

  it('normalizes each lesson byte-for-byte the same as @mcat/content (no IO drift)', () => {
    for (const id of ALL) {
      expect(provider.getNormalizedLesson(id)).toEqual(normalizeLesson(readArtifacts(id)));
    }
  });

  it('surfaces the on-disk content_sha256 as the definition hash', () => {
    for (const id of ALL) {
      const onDisk = readJson(join(dirOf(id), 'lesson-script.json')).content_sha256;
      expect(typeof onDisk).toBe('string');
      expect((onDisk as string).length).toBeGreaterThan(0);
      expect(provider.getDefinitionHash(id)).toBe(onDisk);
    }
  });

  it('the learner-safe normalized payload contains NO protected answer material', () => {
    for (const id of ALL) {
      const serialized = JSON.stringify(provider.getNormalizedLesson(id));
      for (const leak of [
        'correctChoiceId',
        'acceptedResponses',
        'correct_option_index',
        'correct_response',
        'answer_record_id',
      ]) {
        expect(serialized, `${id} normalized payload leaked "${leak}"`).not.toContain(leak);
      }
    }
    // A specific L3 rationale string must never ride along in the learner-safe payload.
    expect(JSON.stringify(provider.getNormalizedLesson(L3))).not.toContain(
      'Equal spacing between 1, 10, and 100',
    );
  });
});

describe('getAnswerKey — a total, self-consistent join over every SCORED item', () => {
  for (const id of ALL) {
    it(`${id}: keys exactly the scored items (worked examples excluded), each answer internally consistent`, () => {
      const normalized = provider.getNormalizedLesson(id);
      const key = provider.getAnswerKey(id);
      const scored = normalized.items.filter((item) => item.scored);

      // Totality, both directions: every scored item has an answer, and every
      // answer belongs to a scored item — no holes, no strays.
      expect(Object.keys(key.byItemId).sort()).toEqual(scored.map((item) => item.itemId).sort());
      for (const item of normalized.items) {
        if (!item.scored) expect(key.byItemId[item.itemId]).toBeUndefined();
      }
      expect(key.definitionHash).toBe(provider.getDefinitionHash(id));
      expect(key.lessonId).toBe(id);

      for (const item of scored) {
        const answer = key.byItemId[item.itemId];
        expect(answer, `${id} missing answer for ${item.itemId}`).toBeDefined();
        if (answer === undefined) continue;
        expect(answer.acceptedResponses.length).toBeGreaterThan(0);
        if (answer.correctChoiceId === null) {
          // free/short response: no options to point at
          expect(item.projection.choices).toHaveLength(0);
        } else {
          const choice = item.projection.choices.find((c) => c.choiceId === answer.correctChoiceId);
          expect(
            choice,
            `${item.itemId} correctChoiceId does not resolve to a real option`,
          ).toBeDefined();
          expect(answer.acceptedResponses[0]).toBe(choice?.text);
        }
      }
    });
  }
});

describe('getAnswerKey — every heterogeneous answer encoding resolves correctly', () => {
  it('L1 (letter authority in code): entry-check resolves to A', () => {
    expect(provider.getAnswerKey(L1).byItemId['vtr-vec-entry-check-1']?.correctChoiceId).toBe('A');
  });

  it('L2 (correct_response TEXT matched to an option): units-entry resolves to option 0', () => {
    const answer = provider.getAnswerKey(L2).byItemId['prompt-qms-units-entry'];
    expect(answer?.correctChoiceId).toBe('0');
    expect(answer?.acceptedResponses[0]).toBe('2.4 km × (1,000 m / 1 km)');
  });

  it('L2 (SHORT_RESPONSE): a short-response item has no choiceId but keeps its accepted text', () => {
    const answer = provider.getAnswerKey(L2).byItemId['prompt-qms-units-light'];
    expect(answer).toBeDefined();
    expect(answer?.correctChoiceId).toBeNull();
    expect(answer?.acceptedResponses.length).toBeGreaterThan(0);
  });

  it('L3 (correct_option_index ordinal): entry=2, changed-exit=0 map to those choice ordinals', () => {
    const key = provider.getAnswerKey(L3);
    expect(key.byItemId['ALG-GRAPH-ENTRY-01']?.correctChoiceId).toBe('2');
    expect(key.byItemId['ALG-GRAPH-CHANGED-01']?.correctChoiceId).toBe('0');
  });

  it('L3 (constructed_system_and_solution): the BKT-licensed SYS changed-exit keeps its full scoring authority, no choiceId', () => {
    // ALG-SYS-CHANGED-01 is a constructed item (build two equations + solve),
    // not multiple choice — and it is one of L3's 6 BKT-licensed changed exits.
    const answer = provider.getAnswerKey(L3).byItemId['ALG-SYS-CHANGED-01'];
    expect(answer).toBeDefined();
    expect(answer?.correctChoiceId).toBeNull();
    expect(answer?.acceptedResponses).toEqual(expect.arrayContaining(['2L + 2W = 22', 'L = 7']));
    expect(answer?.structuredAuthority?.scoring_mode).toBe('STRUCTURED_CONSTRUCTION_AND_SOLUTION');
  });
});

describe('the provider fails loud — it never guesses or silently drops an item', () => {
  it('throws UnknownLessonError for an unknown lesson (both surfaces)', () => {
    expect(() => provider.getNormalizedLesson('V3-LES-000000')).toThrow(UnknownLessonError);
    expect(() => provider.getAnswerKey('V3-LES-000000')).toThrow(UnknownLessonError);
  });

  it('throws AnswerKeyResolutionError when a protected key points off the end of the options', () => {
    // Copy L3 into a temp catalog and corrupt one record's option index out of range.
    const tmpRoot = mkdtempSync(join(tmpdir(), 'mcat-provider-'));
    tempRoots.push(tmpRoot);
    const tmpLessonDir = join(tmpRoot, L3.toLowerCase());
    cpSync(dirOf(L3), tmpLessonDir, { recursive: true });

    const protectedPath = join(tmpLessonDir, 'protected-items.json');
    const protectedDoc = readJson(protectedPath);
    const records = (protectedDoc.records as Record<string, unknown>[]).map((r) =>
      r.answer_record_id === 'ALG-GRAPH-ENTRY-01' ? { ...r, correct_option_index: 99 } : r,
    );
    writeFileSync(protectedPath, JSON.stringify({ ...protectedDoc, records }, null, 2));

    const corrupt = createRepoLessonContentProvider(tmpRoot);
    expect(() => corrupt.getAnswerKey(L3)).toThrow(AnswerKeyResolutionError);
    expect(() => corrupt.getAnswerKey(L3)).toThrow(/out of range/);
  });
});

const tempRoots: string[] = [];
afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});
