import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_ROLES,
  LessonNormalizationError,
  compileCanonicalLesson,
  detectGrammar,
  normalizeL1,
  normalizeL2,
  normalizeL3,
  normalizeLesson,
  type NormalizedLesson,
  type RawLessonArtifacts,
} from './index';

// packages/content/src/lesson-normalization -> repo root is four levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const lessonDir = (id: string): string => join(repoRoot, 'content/lessons', id);
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function loadArtifacts(id: string): RawLessonArtifacts {
  const dir = lessonDir(id);
  const read = (f: string): unknown => readJson(join(dir, f));
  const artifacts: {
    script: unknown;
    learnerSafeItems?: unknown;
    protectedItems?: unknown;
    presentationPlan?: unknown;
  } = {
    script: read('lesson-script.json'),
    presentationPlan: read('lesson-presentation-plan.json'),
  };
  // L2/L3 carry these; L1 does not.
  try {
    artifacts.learnerSafeItems = read('learner-safe-items.json');
    artifacts.protectedItems = read('protected-items.json');
  } catch {
    /* L1 has no external learner-safe / protected files */
  }
  return artifacts;
}

const histogram = (lesson: NormalizedLesson): Record<string, number> => {
  const h: Record<string, number> = {};
  for (const it of lesson.items) h[it.activityRole] = (h[it.activityRole] ?? 0) + 1;
  return h;
};
const perKcHistogram = (lesson: NormalizedLesson, kcId: string): Record<string, number> => {
  const h: Record<string, number> = {};
  for (const it of lesson.items)
    if (it.primaryKcId === kcId) h[it.activityRole] = (h[it.activityRole] ?? 0) + 1;
  return h;
};
const HEX64 = /^[0-9a-f]{64}$/;

const L1 = normalizeL1(loadArtifacts('v3-les-130923'));
const L2 = normalizeL2(loadArtifacts('v3-les-789208'));
const L3 = normalizeL3(loadArtifacts('v3-les-844372'));

describe('grammar detection (id-agnostic)', () => {
  it('classifies each real lesson by its learner-safe ref shape', () => {
    expect(detectGrammar(loadArtifacts('v3-les-130923').script)).toBe('L1_INLINE');
    expect(detectGrammar(loadArtifacts('v3-les-789208').script)).toBe('L2_PROMPTREF');
    expect(detectGrammar(loadArtifacts('v3-les-844372').script)).toBe('L3_PROJECTIONREF');
  });
  it('auto-dispatches via normalizeLesson to the same result as the explicit adapter', () => {
    const auto = normalizeLesson(loadArtifacts('v3-les-789208'));
    expect(auto.lessonId).toBe(L2.lessonId);
    expect(auto.items.length).toBe(L2.items.length);
  });
});

describe('normalized invariants shared by all three lessons', () => {
  for (const [label, lesson, id] of [
    ['L1', L1, 'V3-LES-130923'],
    ['L2', L2, 'V3-LES-789208'],
    ['L3', L3, 'V3-LES-844372'],
  ] as const) {
    describe(label, () => {
      it('binds the expected lesson id + 64-hex definition hash', () => {
        expect(lesson.lessonId).toBe(id);
        expect(lesson.definitionHash).toMatch(HEX64);
      });
      it('resolves EVERY item projection (no partial lesson) with a prompt', () => {
        for (const it of lesson.items) {
          expect(it.projection.prompt.length).toBeGreaterThan(0);
          expect(it.itemId.length).toBeGreaterThan(0);
          // Choices are required only for select-type items; short-response /
          // constructed / worked-example items legitimately carry none.
          const isSelect = /select|multiple_choice/i.test(it.projection.responseType);
          if (isSelect) expect(it.projection.choices.length).toBeGreaterThanOrEqual(2);
          if (!it.scored) expect(it.projection.choices.length).toBe(0);
        }
      });
      it('uses only known roles and keeps every item KC within ordered_kc_ids', () => {
        const kcSet = new Set(lesson.orderedKcIds);
        for (const it of lesson.items) {
          expect(ACTIVITY_ROLES).toContain(it.activityRole);
          expect(kcSet.has(it.primaryKcId)).toBe(true);
        }
      });
      it('flattened items equal the sum over KC groups', () => {
        expect(lesson.kcs.reduce((n, kc) => n + kc.items.length, 0)).toBe(lesson.items.length);
      });
      it('exposes both exit functions among its exit items', () => {
        const exitFns = new Set(
          lesson.items.filter((i) => i.exitFunction !== 'NONE').map((i) => i.exitFunction),
        );
        expect(exitFns).toContain('NEAR_USE');
        expect(exitFns).toContain('CHANGED_TASK');
      });
    });
  }
});

describe('L1 V3-LES-130923 — inline grammar', () => {
  it('is rejected by the canonical compiler and remains on its bespoke vector authority', () => {
    expect(() => compileCanonicalLesson(loadArtifacts('v3-les-130923'))).toThrow(
      /L1_INLINE uses the isolated bespoke vector answer authority/,
    );
  });

  it('has 42 items across 3 KCs, no worked examples, all scored', () => {
    expect(L1.grammar).toBe('L1_INLINE');
    expect(L1.items.length).toBe(42);
    expect(L1.orderedKcIds.length).toBe(3);
    expect(histogram(L1).WORKED_EXAMPLE ?? 0).toBe(0);
    expect(L1.items.every((i) => i.scored)).toBe(true);
  });
  it('per-KC role histogram matches the authored micro-cycle', () => {
    for (const kc of L1.orderedKcIds) {
      expect(perKcHistogram(L1, kc)).toEqual({
        ENTRY_CHECK: 1,
        GUIDED_PRACTICE: 2,
        LIGHT_SUPPORT_PRACTICE: 2,
        SOLO_PRACTICE: 1,
        NEAR_EXIT: 2,
        CHANGED_EXIT: 2,
        REPAIR_CONFIRMATION: 4,
      });
    }
  });
  it('inline projections carry exactly four labelled choices', () => {
    for (const it of L1.items) expect(it.projection.choices.length).toBe(4);
  });
  it('marks the 6 re-entry exit items', () => {
    expect(L1.items.filter((i) => i.isReentry).length).toBe(6);
  });
});

describe('L2 V3-LES-789208 — prompt-ref grammar (two-hop join)', () => {
  it('has 40 items across 4 KCs, all scored, all prompts resolved through protected bridge', () => {
    expect(L2.grammar).toBe('L2_PROMPTREF');
    expect(L2.items.length).toBe(40);
    expect(L2.orderedKcIds.length).toBe(4);
    expect(L2.items.every((i) => i.scored)).toBe(true);
    expect(L2.items.every((i) => i.sourceRef.startsWith('prompt-'))).toBe(true);
  });
  it('per-KC role histogram matches the authored micro-cycle', () => {
    for (const kc of L2.orderedKcIds) {
      expect(perKcHistogram(L2, kc)).toEqual({
        ENTRY_CHECK: 1,
        GUIDED_PRACTICE: 1,
        LIGHT_SUPPORT_PRACTICE: 1,
        SOLO_PRACTICE: 1,
        NEAR_EXIT: 2,
        CHANGED_EXIT: 2,
        REPAIR_CONFIRMATION: 2,
      });
    }
  });
  it('carries mixed response types (multiple-choice + short-response)', () => {
    const types = new Set(L2.items.map((i) => i.projection.responseType));
    expect(types).toContain('MULTIPLE_CHOICE');
    expect(types).toContain('SHORT_RESPONSE');
  });
  it('hard-fails when the protected bridge file is absent (server-side resolution required)', () => {
    const noBridge: RawLessonArtifacts = { script: loadArtifacts('v3-les-789208').script };
    expect(() => normalizeL2(noBridge)).toThrow(LessonNormalizationError);
  });
  it('compiles authored teaching and exposition before practice in presentation order', () => {
    const steps = L2.kcs[0]?.deliverySteps ?? [];
    expect(steps.slice(0, 7).map((step) => step.stage)).toEqual([
      'ENTRY_CHECK_BOUNDARY',
      'ORIENTATION',
      'EXPLANATION',
      'MENTAL_MODEL',
      'EXPERT_THINK_ALOUD',
      'WORKED_EXAMPLE',
      'GUIDED_PRACTICE',
    ]);
    expect(steps[1]?.heading).toBe('Focus now: Convert units and dimensions');
    expect(steps.slice(1, 6).every((step) => step.contentBlocks.length > 0)).toBe(true);
  });
  it('recognizes exactly eight bound re-entry items and excludes branch-only items from the clean baseline', () => {
    const reentries = L2.items.filter((item) => item.isReentry);
    const baselineIds = L2.kcs.flatMap((kc) => kc.cleanBaselineItemIds ?? []);
    expect(reentries).toHaveLength(8);
    expect(baselineIds).toHaveLength(24);
    expect(baselineIds.some((itemId) => reentries.some((item) => item.itemId === itemId))).toBe(
      false,
    );
    expect(
      L2.kcs.every(
        (kc) =>
          kc.branchBindings.length === 2 &&
          kc.branchBindings.every((binding) => binding.reentryItemId.length > 0),
      ),
    ).toBe(true);
  });
});

describe('L3 V3-LES-844372 — projection-ref grammar (prompt_key + NODE)', () => {
  it('has 33 items across 3 KCs, with 3 unscored worked examples', () => {
    expect(L3.grammar).toBe('L3_PROJECTIONREF');
    expect(L3.items.length).toBe(33);
    expect(L3.orderedKcIds.length).toBe(3);
    expect(histogram(L3).WORKED_EXAMPLE).toBe(3);
    expect(L3.items.filter((i) => i.scored).length).toBe(30);
  });
  it('per-KC role histogram matches the authored micro-cycle', () => {
    for (const kc of L3.orderedKcIds) {
      expect(perKcHistogram(L3, kc)).toEqual({
        ENTRY_CHECK: 1,
        WORKED_EXAMPLE: 1,
        GUIDED_PRACTICE: 1,
        LIGHT_SUPPORT_PRACTICE: 1,
        SOLO_PRACTICE: 1,
        NEAR_EXIT: 1,
        CHANGED_EXIT: 1,
        REPAIR_CONFIRMATION: 4,
      });
    }
  });
  it('resolves worked-example NODE refs and marks the 6 explicit re-entry items', () => {
    const worked = L3.items.filter((i) => i.activityRole === 'WORKED_EXAMPLE');
    expect(worked.every((i) => i.sourceRef.startsWith('NODE:'))).toBe(true);
    expect(worked.every((i) => i.activityId === null)).toBe(true);
    expect(L3.items.filter((i) => i.isReentry).length).toBe(6);
  });
  it('carries select, constructed, and worked-example response types', () => {
    const types = new Set(L3.items.map((i) => i.projection.responseType));
    expect(types).toContain('single_select');
    expect(types).toContain('constructed_system_and_solution');
    expect(types).toContain('WORKED_EXAMPLE');
  });
  it('hard-fails on an unresolvable projection ref (never drops an item)', () => {
    const artifacts = loadArtifacts('v3-les-844372');
    const script = JSON.parse(JSON.stringify(artifacts.script)) as {
      payload: { question_evidence_plan: Array<{ learner_safe_projection_ref?: string }> };
    };
    const firstItem = script.payload.question_evidence_plan[0];
    if (!firstItem) throw new Error('fixture missing question_evidence_plan items');
    firstItem.learner_safe_projection_ref = 'DOES_NOT_EXIST';
    expect(() => normalizeL3({ ...artifacts, script })).toThrow(LessonNormalizationError);
  });
  it('resolves worked NODE exposition to authored prose without an internal placeholder token', () => {
    const worked = L3.items.find((item) => item.itemId === 'ALG-GRAPH-WORKED-01');
    expect(worked?.projection.prompt).toContain(
      'Worked visual: a vertical axis shows 1, 10, 100, and 1000',
    );
    expect(worked?.projection.prompt).not.toMatch(/\[worked example:|NODE:/i);
    expect(JSON.stringify(worked?.projection)).not.toContain('ALG-GRAPH-WORKED-01');
  });
  it('exposes the exact stable authored fields for a structured response', () => {
    const structured = L3.items.find((item) => item.itemId === 'ALG-SYS-CHANGED-01');
    expect(structured?.projection.responseControl).toEqual({
      kind: 'STRUCTURED_FIELDS',
      fields: [
        { fieldId: 'equation_1', label: 'Perimeter equation' },
        { fieldId: 'equation_2', label: 'Difference equation' },
        { fieldId: 'solution_pair', label: 'Ordered pair (L, W)' },
      ],
    });
  });
});

describe('normalization fails closed at compiler boundaries', () => {
  it('rejects an unknown authored response type', () => {
    const artifacts = loadArtifacts('v3-les-844372');
    const learnerSafeItems = JSON.parse(JSON.stringify(artifacts.learnerSafeItems)) as {
      items: Array<{ response_type?: string }>;
    };
    const first = learnerSafeItems.items[0];
    if (!first) throw new Error('fixture missing learner-safe items');
    first.response_type = 'UNBOUNDED_ESSAY';
    expect(() => normalizeL3({ ...artifacts, learnerSafeItems })).toThrow(LessonNormalizationError);
  });

  it('rejects a response control that contradicts its authored options', () => {
    const artifacts = loadArtifacts('v3-les-789208');
    const learnerSafeItems = JSON.parse(JSON.stringify(artifacts.learnerSafeItems)) as {
      items: Array<{ response_type?: string; options?: string[] }>;
    };
    const first = learnerSafeItems.items[0];
    if (!first) throw new Error('fixture missing learner-safe items');
    first.response_type = 'SHORT_RESPONSE';
    expect(() => normalizeL2({ ...artifacts, learnerSafeItems })).toThrow(LessonNormalizationError);
  });

  it('rejects an unresolved required kc_script node reference', () => {
    const artifacts = loadArtifacts('v3-les-789208');
    const script = JSON.parse(JSON.stringify(artifacts.script)) as {
      payload: { kc_scripts: Array<{ orientation_node_id?: string }> };
    };
    const first = script.payload.kc_scripts[0];
    if (!first) throw new Error('fixture missing kc_scripts');
    first.orientation_node_id = 'missing-required-orientation';
    expect(() => normalizeL2({ ...artifacts, script })).toThrow(LessonNormalizationError);
  });

  it('rejects protected answer material embedded in a learner-safe record', () => {
    const artifacts = loadArtifacts('v3-les-844372');
    const learnerSafeItems = JSON.parse(JSON.stringify(artifacts.learnerSafeItems)) as {
      items: Array<Record<string, unknown>>;
    };
    const first = learnerSafeItems.items[0];
    if (!first) throw new Error('fixture missing learner-safe items');
    first.rationale = 'This must remain server-only.';
    expect(() => normalizeL3({ ...artifacts, learnerSafeItems })).toThrow(LessonNormalizationError);
  });

  it('keeps every normalized learner projection answer- and rationale-free', () => {
    for (const lesson of [L1, L2, L3]) {
      const projections = JSON.stringify(lesson.items.map((item) => item.projection));
      expect(projections).not.toMatch(
        /answerKey|answer_authority|accepted_responses|correct_response|correct_option|rationale|response_authority/i,
      );
    }
  });

  it('rejects duplicate item and presentation-step identities', () => {
    const artifacts = loadArtifacts('v3-les-789208');
    const script = JSON.parse(JSON.stringify(artifacts.script)) as {
      payload: { question_evidence_plan: Array<{ item_binding_id: string }> };
    };
    const first = script.payload.question_evidence_plan[0];
    const second = script.payload.question_evidence_plan[1];
    if (!first || !second) throw new Error('fixture missing question_evidence_plan items');
    second.item_binding_id = first.item_binding_id;
    expect(() => normalizeL2({ ...artifacts, script })).toThrow(LessonNormalizationError);

    const presentationPlan = JSON.parse(JSON.stringify(artifacts.presentationPlan)) as {
      payload: { screens: Array<{ screen_id: string }> };
    };
    const firstScreen = presentationPlan.payload.screens[0];
    const secondScreen = presentationPlan.payload.screens[1];
    if (!firstScreen || !secondScreen) throw new Error('fixture missing presentation screens');
    secondScreen.screen_id = firstScreen.screen_id;
    expect(() => normalizeL2({ ...artifacts, presentationPlan })).toThrow(LessonNormalizationError);
  });
});
