import { describe, expect, it } from 'vitest';
import {
  LessonDefinitionSchema,
  LessonDefinitionRegistry,
  syntheticV3LessonDefinition,
} from './index';

describe('V3 lesson definition schema', () => {
  it('validates the explicit multi-KC synthetic fixture and all routing modes', () => {
    const parsed = LessonDefinitionSchema.parse(syntheticV3LessonDefinition);

    expect(parsed.testOnly).toBe(true);
    expect(parsed.knowledgeComponents).toHaveLength(2);
    expect(
      parsed.knowledgeComponents[0]!.microcycle.entryRouting.routes.map((route) => route.route),
    ).toEqual(['concise', 'standard', 'prerequisite', 'misconception']);
    expect(parsed.knowledgeComponents[0]!.microcycle.pairedExit.attempts).toHaveLength(3);
    expect(parsed.knowledgeComponents[0]!.microcycle.repairs.maximumCycles).toBe(2);
  });

  it('rejects aggregate ordering that diverges from the KC authoring order', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    invalid.orderedKcIds.reverse();

    const result = LessonDefinitionSchema.safeParse(invalid);

    expect(result.success).toBe(false);
  });

  it('rejects same-family or revealed-capable exit checks', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const kc = invalid.knowledgeComponents[0]!;
    const pair = kc.microcycle.pairedExit.attempts[0]!;
    const near = kc.activities.find((activity) => activity.id === pair.nearActivityId)!;
    const changed = kc.activities.find((activity) => activity.id === pair.changedActivityId)!;
    changed.familyId = near.familyId;
    changed.assistance.revealAllowed = true;

    const result = LessonDefinitionSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('distinct item families')),
      ).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('reveal disabled'))).toBe(
        true,
      );
    }
  });

  it('requires convergent evidence for every non-standard entry route', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const route = invalid.knowledgeComponents[0]!.microcycle.entryRouting.routes.find(
      (candidate) => candidate.route === 'misconception',
    )!;
    route.criteria = {
      kind: 'default',
      signalIds: [],
      minimumDistinctFamilies: 0,
    };

    expect(LessonDefinitionSchema.safeParse(invalid).success).toBe(false);
  });

  it('keeps support, extension, and capstone evidence boundaries explicit', () => {
    const lessonRefs = syntheticV3LessonDefinition.artifactReferences;
    const kcRefs = syntheticV3LessonDefinition.knowledgeComponents.flatMap(
      (kc) => kc.artifactReferences,
    );

    expect(lessonRefs.find((ref) => ref.kind === 'extension')?.evidenceUse).toBe('none');
    expect(lessonRefs.find((ref) => ref.kind === 'capstone')?.evidenceUse).toBe(
      'separate_capstone_only',
    );
    expect(kcRefs.every((ref) => ref.evidenceUse === 'none')).toBe(true);
  });

  it('fails publication closed for test fixtures without canonical review', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    invalid.status = 'published';

    const result = LessonDefinitionSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('cannot be published')),
      ).toBe(true);
    }
  });

  it('loads only through an explicit registry mode and exact version pins', () => {
    const registry = new LessonDefinitionRegistry([syntheticV3LessonDefinition], 'test_fixture');

    expect(
      registry.get(
        syntheticV3LessonDefinition.id,
        syntheticV3LessonDefinition.definitionVersion,
        syntheticV3LessonDefinition.contentRelease,
      ),
    ).toEqual(syntheticV3LessonDefinition);
    expect(() => new LessonDefinitionRegistry([syntheticV3LessonDefinition], 'production')).toThrow(
      /Test-only lesson/,
    );
  });
});
