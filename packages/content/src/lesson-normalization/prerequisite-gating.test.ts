import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  LessonNormalizationError,
  normalizeLesson,
  type NormalizedLesson,
  type RawLessonArtifacts,
} from './index';

type Json = Record<string, unknown>;
type ExpectedGate = {
  readonly itemId: string;
  readonly activityId: string;
  readonly primaryKcId: string;
  readonly entryNodeId: string;
  readonly prerequisiteLessonId: string;
  readonly passNodeId: string;
  readonly failureHandoffNodeId: string | null;
  readonly allowedDestinationNodeIds: readonly string[];
};
type LessonWithGates = NormalizedLesson & {
  readonly prerequisiteGates?: readonly ExpectedGate[];
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const derivedRoot = join(
  repoRoot,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-09-primary-finalization/workspace',
);
const corpusRoot = join(repoRoot, 'content/lessons');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function loadArtifacts(directory: string): RawLessonArtifacts {
  const learnerSafeItems = join(directory, 'learner-safe-items.json');
  const protectedItems = join(directory, 'protected-items.json');
  return {
    script: readJson(join(directory, 'lesson-script.json')),
    learnerSafeItems: existsSync(learnerSafeItems) ? readJson(learnerSafeItems) : undefined,
    protectedItems: existsSync(protectedItems) ? readJson(protectedItems) : undefined,
    presentationPlan: readJson(join(directory, 'lesson-presentation-plan.json')),
  };
}

function loadDerived(lessonId: string): RawLessonArtifacts {
  return loadArtifacts(join(derivedRoot, lessonId));
}

function clonedScript(lessonId = 'V3-LES-320512'): Json {
  return structuredClone(loadDerived(lessonId).script) as Json;
}

function payload(script: Json): Json {
  return script.payload as Json;
}

function records(script: Json, key: string): Json[] {
  return (payload(script)[key] as Json[]) ?? [];
}

function recordBy(script: Json, key: string, field: string, value: string): Json {
  const record = records(script, key).find((candidate) => candidate[field] === value);
  if (record === undefined) throw new Error(`missing ${key}.${field}=${value}`);
  return record;
}

function expectGateFailure(script: Json, pattern: RegExp): void {
  const artifacts = loadDerived('V3-LES-320512');
  expect(() => normalizeLesson({ ...artifacts, script })).toThrowError(pattern);
}

const describeDerived = existsSync(derivedRoot) ? describe : describe.skip;

describeDerived('explicit prerequisite outcome normalization over frozen derived bytes', () => {
  it('normalizes the exact authored gates for all three blocked lessons', () => {
    const expected: Readonly<Record<string, readonly ExpectedGate[]>> = {
      'V3-LES-191915': [
        {
          itemId: 'ENTH-ITEM-ENTRY',
          activityId: 'ENTH-ACT-ENTRY',
          primaryKcId: 'V3-KC-304296',
          entryNodeId: 'ENTH-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-067950',
          passNodeId: 'ENTH-NODE-ORIENTATION',
          failureHandoffNodeId: 'ENTH-NODE-HANDOFF',
          allowedDestinationNodeIds: ['ENTH-NODE-ORIENTATION', 'ENTH-NODE-HANDOFF'],
        },
        {
          itemId: 'GIBB-ITEM-ENTRY',
          activityId: 'GIBB-ACT-ENTRY',
          primaryKcId: 'V3-KC-028740',
          entryNodeId: 'GIBB-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-067950',
          passNodeId: 'GIBB-NODE-ORIENTATION',
          failureHandoffNodeId: 'GIBB-NODE-HANDOFF',
          allowedDestinationNodeIds: ['GIBB-NODE-ORIENTATION', 'GIBB-NODE-HANDOFF'],
        },
        {
          itemId: 'EQDG-ITEM-ENTRY',
          activityId: 'EQDG-ACT-ENTRY',
          primaryKcId: 'V3-KC-444504',
          entryNodeId: 'EQDG-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-315313',
          passNodeId: 'EQDG-NODE-ORIENTATION',
          failureHandoffNodeId: 'EQDG-NODE-HANDOFF',
          allowedDestinationNodeIds: ['EQDG-NODE-ORIENTATION', 'EQDG-NODE-HANDOFF'],
        },
      ],
      'V3-LES-128144': [
        {
          itemId: 'PAT-ITEM-ENTRY',
          activityId: 'PAT-ACT-ENTRY',
          primaryKcId: 'V3-KC-102285',
          entryNodeId: 'PAT-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-264240',
          passNodeId: 'ERR-NODE-ENTRY',
          failureHandoffNodeId: 'PREREQ-264240-NODE-HANDOFF',
          allowedDestinationNodeIds: ['ERR-NODE-ENTRY', 'PREREQ-264240-NODE-HANDOFF'],
        },
        {
          itemId: 'ERR-ITEM-ENTRY',
          activityId: 'ERR-ACT-ENTRY',
          primaryKcId: 'V3-KC-434142',
          entryNodeId: 'ERR-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-765609',
          passNodeId: 'CON-NODE-ENTRY',
          failureHandoffNodeId: 'PREREQ-765609-NODE-HANDOFF',
          allowedDestinationNodeIds: ['CON-NODE-ENTRY', 'PREREQ-765609-NODE-HANDOFF'],
        },
        {
          itemId: 'CON-ITEM-ENTRY',
          activityId: 'CON-ACT-ENTRY',
          primaryKcId: 'V3-KC-062200',
          entryNodeId: 'CON-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-765609',
          passNodeId: 'PRJ-NODE-ENTRY',
          failureHandoffNodeId: 'PREREQ-765609-NODE-HANDOFF',
          allowedDestinationNodeIds: ['PRJ-NODE-ENTRY', 'PREREQ-765609-NODE-HANDOFF'],
        },
        {
          itemId: 'PRJ-ITEM-ENTRY',
          activityId: 'PRJ-ACT-ENTRY',
          primaryKcId: 'V3-KC-118833',
          entryNodeId: 'PRJ-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-765609',
          passNodeId: 'PAT-NODE-ORIENTATION',
          failureHandoffNodeId: 'PREREQ-765609-NODE-HANDOFF',
          allowedDestinationNodeIds: ['PAT-NODE-ORIENTATION', 'PREREQ-765609-NODE-HANDOFF'],
        },
      ],
      'V3-LES-320512': [
        {
          itemId: 'ERED-ITEM-ENTRY',
          activityId: 'ERED-ACT-ENTRY',
          primaryKcId: 'V3-KC-364960',
          entryNodeId: 'ERED-NODE-ENTRY',
          prerequisiteLessonId: 'V3-LES-915978',
          passNodeId: 'ERED-NODE-ORIENTATION',
          failureHandoffNodeId: 'ERED-NODE-HANDOFF-1',
          allowedDestinationNodeIds: ['ERED-NODE-ORIENTATION', 'ERED-NODE-HANDOFF-1'],
        },
      ],
    };

    for (const [lessonId, gates] of Object.entries(expected)) {
      expect((normalizeLesson(loadDerived(lessonId)) as LessonWithGates).prerequisiteGates).toEqual(
        gates,
      );
    }
  });

  it('marks every prerequisite-failure handoff branch-only and removes it from clean delivery', () => {
    for (const lessonId of ['V3-LES-191915', 'V3-LES-128144', 'V3-LES-320512']) {
      const lesson = normalizeLesson(loadDerived(lessonId)) as LessonWithGates;
      expect(lesson.prerequisiteGates?.length ?? 0, lessonId).toBeGreaterThan(0);
      for (const gate of lesson.prerequisiteGates ?? []) {
        if (gate.failureHandoffNodeId === null) continue;
        const handoff = lesson.kcs
          .flatMap((kc) => kc.deliverySteps)
          .find((step) => step.nodeIds.includes(gate.failureHandoffNodeId as string));
        expect(handoff, `${lessonId}:${gate.itemId}`).toBeDefined();
        expect(handoff?.branchOnly, `${lessonId}:${gate.itemId}`).toBe(true);
        expect(
          lesson.kcs.flatMap((kc) => kc.cleanBaselineSteps).map((step) => step.stepId),
          `${lessonId}:${gate.itemId}`,
        ).not.toContain(handoff?.stepId);
      }
    }
  });

  it('fails closed when the activity and QEP item identities disagree', () => {
    const script = clonedScript();
    recordBy(script, 'activities', 'activity_id', 'ERED-ACT-ENTRY').item_binding_id =
      'ERED-ITEM-GUIDED';
    expectGateFailure(script, /prerequisite gate.*item identity/i);
  });

  it('fails closed when an authored outcome destination is missing', () => {
    const script = clonedScript();
    const map = recordBy(script, 'activities', 'activity_id', 'ERED-ACT-ENTRY')
      .outcome_transition_map as Json;
    delete map.UNSUPPORTED_OR_OMITTED;
    expectGateFailure(script, /prerequisite gate.*outcome_transition_map/i);
  });

  it('fails closed when authorized destinations are duplicated', () => {
    const script = clonedScript();
    recordBy(script, 'activities', 'activity_id', 'ERED-ACT-ENTRY').authorized_next_node_ids = [
      'ERED-NODE-ORIENTATION',
      'ERED-NODE-HANDOFF-1',
      'ERED-NODE-HANDOFF-1',
    ];
    expectGateFailure(script, /prerequisite gate.*authorized destinations/i);
  });

  it('fails closed when an explicit gate entry node gains another activity', () => {
    const script = clonedScript();
    recordBy(script, 'nodes', 'node_id', 'ERED-NODE-ENTRY').activity_ids = [
      'ERED-ACT-ENTRY',
      'ERED-ACT-GUIDED',
    ];
    expectGateFailure(script, /prerequisite gate.*ambiguous activity identity/i);
  });

  it('fails closed on duplicate authored pass transitions', () => {
    const script = clonedScript();
    records(script, 'transitions').push({
      transition_id: 'ERED-TRANSITION-ENTRY-PASS-DUPLICATE',
      from_node_id: 'ERED-NODE-ENTRY',
      to_node_id: 'ERED-NODE-ORIENTATION',
      predicate: 'BOUND_REDOX_ACCOUNTING_CHECK_PASSED',
    });
    expectGateFailure(script, /prerequisite gate.*duplicate pass transition/i);
  });

  it('fails closed on an unrecognized authored prerequisite outcome predicate', () => {
    const artifacts = loadDerived('V3-LES-191915');
    const script = structuredClone(artifacts.script) as Json;
    recordBy(
      script,
      'transitions',
      'transition_id',
      'ENTH-TRANSITION-PREREQUISITE-FAIL',
    ).predicate = 'HARD_PREREQUISITE_CHECK_NOT_PASED';
    expect(() => normalizeLesson({ ...artifacts, script })).toThrowError(
      /prerequisite gate.*malformed outcome predicate/i,
    );
  });

  it('rejects explicit prerequisite fields on a non-entry item role', () => {
    const artifacts = loadDerived('V3-LES-128144');
    const script = structuredClone(artifacts.script) as Json;
    recordBy(script, 'question_evidence_plan', 'item_binding_id', 'PAT-ITEM-ENTRY').activity_role =
      'GUIDED_PRACTICE';
    expect(() => normalizeLesson({ ...artifacts, script })).toThrowError(
      /prerequisite gate.*requires ENTRY_CHECK/i,
    );
  });

  it('rejects a pass target that jumps directly into another KC instruction', () => {
    const script = clonedScript();
    const activity = recordBy(script, 'activities', 'activity_id', 'ERED-ACT-ENTRY');
    activity.authorized_next_node_ids = ['ECEL-NODE-ORIENTATION', 'ERED-NODE-HANDOFF-1'];
    (activity.outcome_transition_map as Json).SUPPORTED_REASONING = 'ECEL-NODE-ORIENTATION';
    recordBy(script, 'transitions', 'transition_id', 'ERED-TRANSITION-ENTRY-PASS').to_node_id =
      'ECEL-NODE-ORIENTATION';
    expectGateFailure(script, /prerequisite gate.*cross-KC pass target/i);
  });

  it('rejects pass/fail inversion even when the allowed set still contains both nodes', () => {
    const script = clonedScript();
    const activity = recordBy(script, 'activities', 'activity_id', 'ERED-ACT-ENTRY');
    activity.outcome_transition_map = {
      SUPPORTED_REASONING: 'ERED-NODE-HANDOFF-1',
      UNSUPPORTED_OR_OMITTED: 'ERED-NODE-ORIENTATION',
    };
    recordBy(script, 'transitions', 'transition_id', 'ERED-TRANSITION-ENTRY-PASS').to_node_id =
      'ERED-NODE-HANDOFF-1';
    recordBy(script, 'transitions', 'transition_id', 'ERED-TRANSITION-ENTRY-FAILED').to_node_id =
      'ERED-NODE-ORIENTATION';
    const curriculum = payload(script).curriculum_context as Json;
    const handoff = (curriculum.hard_prerequisite_handoffs as Json[])[0] as Json;
    handoff.failed_check_handoff_node_id = 'ERED-NODE-ORIENTATION';
    expectGateFailure(script, /prerequisite gate.*failure handoff.*terminal transition/i);
  });

  it('rejects a failure handoff with an authored cycle back to the entry check', () => {
    const script = clonedScript();
    records(script, 'transitions').push({
      transition_id: 'ERED-TRANSITION-HANDOFF-CYCLE',
      from_node_id: 'ERED-NODE-HANDOFF-1',
      to_node_id: 'ERED-NODE-ENTRY',
      predicate: 'HANDOFF_ACKNOWLEDGED',
    });
    expectGateFailure(script, /prerequisite gate.*failure cycle/i);
  });

  it('rejects a grouped entry screen containing more than one scored item', () => {
    const artifacts = loadDerived('V3-LES-320512');
    const presentationPlan = structuredClone(artifacts.presentationPlan) as Json;
    const screens = ((presentationPlan.payload as Json).screens as Json[]) ?? [];
    const entry = screens.find((screen) => screen.screen_id === 'ERED-SCREEN-ENTRY');
    if (entry === undefined) throw new Error('missing ERED entry screen');
    entry.script_node_ids = ['ERED-NODE-ENTRY', 'ERED-NODE-GUIDED'];
    expect(() => normalizeLesson({ ...artifacts, presentationPlan })).toThrowError(
      /prerequisite gate.*grouped scored entry/i,
    );
  });

  it('rejects transfer or mastery credit on a prerequisite gate', () => {
    const script = clonedScript();
    recordBy(
      script,
      'question_evidence_plan',
      'item_binding_id',
      'ERED-ITEM-ENTRY',
    ).candidate_evidence_modes = ['TRANSFER'];
    expectGateFailure(script, /prerequisite gate.*instructional noncredit/i);
  });

  it('preserves unsupported legacy ENTRY_CHECK behavior when no explicit gate binding exists', () => {
    const lesson = normalizeLesson(loadArtifacts(join(corpusRoot, 'v3-les-844372')));
    expect((lesson as LessonWithGates).prerequisiteGates ?? []).toEqual([]);
    const entry = lesson.items.find((item) => item.activityRole === 'ENTRY_CHECK');
    expect(entry).toBeDefined();
    expect(lesson.kcs.flatMap((kc) => kc.cleanBaselineItemIds).includes(entry?.itemId ?? '')).toBe(
      true,
    );
  });

  it('audits all 51 derived lessons and changes only complete explicit gates', () => {
    const lessonDirectories = readdirSync(derivedRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name.startsWith('V3-LES-') &&
          existsSync(join(derivedRoot, entry.name, 'lesson-script.json')),
      )
      .map((entry) => entry.name)
      .sort();
    expect(lessonDirectories).toHaveLength(51);

    const affected: Record<string, number> = {};
    for (const lessonId of lessonDirectories) {
      const lesson = normalizeLesson(loadDerived(lessonId)) as LessonWithGates;
      const count = lesson.prerequisiteGates?.length ?? 0;
      if (count > 0) affected[lessonId] = count;
    }

    expect(affected).toEqual({
      'V3-LES-095827': 1,
      'V3-LES-128144': 4,
      'V3-LES-191915': 3,
      'V3-LES-199474': 1,
      'V3-LES-320512': 1,
    });
  });

  it('keeps the existing three-lesson corpus free of inferred prerequisite gates', () => {
    const corpus = readdirSync(corpusRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() && existsSync(join(corpusRoot, entry.name, 'lesson-script.json')),
      )
      .map((entry) => normalizeLesson(loadArtifacts(join(corpusRoot, entry.name))));
    expect(corpus).toHaveLength(3);
    expect(
      corpus.flatMap(
        (lesson) => (lesson as LessonWithGates).prerequisiteGates?.map((gate) => gate.itemId) ?? [],
      ),
    ).toEqual([]);
  });
});

describe('prerequisite normalization error identity', () => {
  it('uses the canonical normalization error type', () => {
    expect(LessonNormalizationError.prototype).toBeInstanceOf(Error);
  });
});
