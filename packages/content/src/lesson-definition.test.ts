import { describe, expect, it } from 'vitest';
import {
  computeLessonContentDigest,
  LessonDefinitionRegistry,
  LessonDefinitionSchema,
  syntheticV3LessonDefinition,
} from './index';

const refreshDigest = (definition: Record<string, unknown>): void => {
  const digest = computeLessonContentDigest(definition);
  (definition.contentDigest as { sha256: string }).sha256 = digest;
  (definition.reviewEnvelope as { reviewedContentHash: string }).reviewedContentHash = digest;
};

const configureApprovedProduction = (definition: Record<string, unknown>): void => {
  definition.status = 'published';
  definition.publicationIntent = 'production';
  definition.testOnly = false;
  (definition.registryBinding as { mode: string }).mode = 'canonical';
  const review = definition.reviewEnvelope as Record<string, unknown>;
  review.publicationFreezeId = 'CONTENT-FREEZE-1';
  review.authorIds = ['fixture-author'];
  review.independentContentReview = {
    status: 'approved',
    reviewerIds: ['content-reviewer'],
    reportId: 'content-report',
  };
  review.independentDomainReview = {
    status: 'approved',
    reviewerIds: ['domain-reviewer'],
    reportId: 'domain-report',
  };
  review.copyReview = {
    status: 'approved',
    reviewerIds: ['copy-reviewer'],
    reportId: 'copy-report',
  };
  review.accessibilityReview = {
    status: 'approved',
    reviewerIds: ['accessibility-reviewer'],
    reportId: 'accessibility-report',
  };
  review.blindSolve = {
    status: 'passed',
    solverIds: ['blind-solver'],
    keysHidden: true,
    reportId: 'blind-report',
  };
  review.rightsReview = {
    status: 'cleared',
    reviewerIds: ['rights-reviewer'],
    sourceRightsCleared: true,
    modelProcessingRightsCleared: true,
    similarity: {
      status: 'cleared',
      reviewerIds: ['similarity-reviewer'],
      reportId: 'similarity-report',
    },
  };
  review.finalApproval = {
    status: 'approved',
    reviewerIds: ['final-approver'],
    reportId: 'final-report',
  };
};

describe('V3 lesson definition schema', () => {
  it('computes standards-compatible, key-order-stable SHA-256 content digests', () => {
    expect(computeLessonContentDigest({ foo: 'bar' })).toBe(
      '7a38bf81f383f69433ad6e900d35b3e2385593f76a7b7ab5d4355b8ba41ee24b',
    );
    expect(computeLessonContentDigest({ second: 2, first: 1 })).toBe(
      computeLessonContentDigest({ first: 1, second: 2 }),
    );
  });

  it('validates finite fresh pools, all routes, six exit pairs, and two repair cycles', () => {
    const parsed = LessonDefinitionSchema.parse(syntheticV3LessonDefinition);
    const microcycle = parsed.knowledgeComponents[0]!.microcycle;

    expect(parsed.testOnly).toBe(true);
    expect(parsed.knowledgeComponents).toHaveLength(2);
    expect(microcycle.entryRouting.routes.map((route) => route.route)).toEqual([
      'concise',
      'standard',
      'prerequisite',
      'misconception',
    ]);
    expect(microcycle.entryRouting.probeActivityIds).toHaveLength(4);
    expect(microcycle.completionPools.A3).toHaveLength(4);
    expect(microcycle.pairedExit.pairs).toHaveLength(6);
    expect(microcycle.repairs.cycles.map((cycle) => cycle.cycle)).toEqual([1, 2]);
  });

  it('rejects aggregate ordering or canonical statements that drift from the binding', () => {
    const wrongOrder = structuredClone(syntheticV3LessonDefinition);
    wrongOrder.orderedKcIds.reverse();
    expect(LessonDefinitionSchema.safeParse(wrongOrder).success).toBe(false);

    const wrongClaim = structuredClone(syntheticV3LessonDefinition);
    wrongClaim.knowledgeComponents[0]!.objective = 'A hand-reinterpreted objective.';
    expect(LessonDefinitionSchema.safeParse(wrongClaim).success).toBe(false);
  });

  it('rejects reused exit families and reveal-capable A0 checks', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const kc = invalid.knowledgeComponents[0]!;
    const pair = kc.microcycle.pairedExit.pairs[0]!;
    const near = kc.activities.find((activity) => activity.id === pair.nearActivityId)!;
    const changed = kc.activities.find((activity) => activity.id === pair.changedActivityId)!;
    changed.familyId = near.familyId;
    changed.assistance.revealAllowed = true;

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('family'))).toBe(true);
      expect(result.error.issues.some((issue) => issue.message.includes('unsupported'))).toBe(true);
    }
  });

  it('requires enough fresh completion, entry, exit, and repair candidates for reentry', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const microcycle = invalid.knowledgeComponents[0]!.microcycle;
    microcycle.completionPools.A3.splice(2);
    microcycle.entryRouting.probeActivityIds.splice(2);
    microcycle.pairedExit.pairs.splice(3);
    microcycle.repairs.cycles[1].mappings[0]!.candidateActivityIds.splice(1);

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('fresh activities');
      expect(messages).toContain('fresh probes');
      expect(messages).toContain('fresh pairs');
      expect(messages).toContain('fresh candidate');
    }
  });

  it('requires cycle-specific repair families and representations plus one fallback per cycle', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const kc = invalid.knowledgeComponents[0]!;
    const cycleOne = kc.microcycle.repairs.cycles[0]!;
    const cycleTwo = kc.microcycle.repairs.cycles[1]!;
    const firstCycleActivity = kc.activities.find(
      (activity) => activity.id === cycleOne.mappings[0]!.candidateActivityIds[0],
    )!;
    const secondCycleActivity = kc.activities.find(
      (activity) => activity.id === cycleTwo.mappings[0]!.candidateActivityIds[0],
    )!;
    secondCycleActivity.familyId = firstCycleActivity.familyId;
    secondCycleActivity.representationIds = [...firstCycleActivity.representationIds];
    cycleTwo.mappings.push(structuredClone(cycleTwo.mappings[0]!));

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('fresh activity family');
      expect(messages).toContain('distinct representation');
      expect(messages).toContain('exactly one generic fallback');
    }
  });

  it('keeps structured diagram, chart, equation, and simulation data learner-safe', () => {
    const representations = syntheticV3LessonDefinition.knowledgeComponents[0]!.representations;
    const diagram = representations.find((representation) => representation.kind === 'diagram');
    const chart = representations.find((representation) => representation.kind === 'chart');
    const equation = representations.find((representation) => representation.kind === 'equation');
    const simulation = representations.find(
      (representation) => representation.kind === 'simulation',
    );

    expect(diagram?.alternative.longDescription).toContain('invented');
    expect(chart?.chart.dataTable.rows).toHaveLength(3);
    expect(equation?.spoken).toContain('Alignment');
    expect(simulation?.simulation.adapter).toBe('linear_relationship');
    expect(JSON.stringify(representations)).not.toContain('<script');
  });

  it('fails publication closed without exact digest-bound independent gates', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition) as unknown as Record<
      string,
      unknown
    >;
    invalid.status = 'published';
    invalid.publicationIntent = 'production';
    invalid.testOnly = false;
    (invalid.registryBinding as { mode: string }).mode = 'canonical';
    refreshDigest(invalid);

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('blind solve');
      expect(messages).toContain('rights');
      expect(messages).toContain('accessibility review');
      expect(messages).toContain('content freeze ID');
    }
  });

  it('rejects author/reviewer overlap even when status flags are approved', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition) as unknown as Record<
      string,
      unknown
    >;
    configureApprovedProduction(invalid);
    const review = invalid.reviewEnvelope as Record<string, unknown>;
    review.independentContentReview = {
      status: 'approved',
      reviewerIds: ['fixture-author'],
      reportId: 'content-report',
    };
    refreshDigest(invalid);

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message.includes('authors'))).toBe(true);
    }
  });

  it('rejects stale reviewed hashes after any digest-bearing content change', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition) as unknown as Record<
      string,
      unknown
    >;
    configureApprovedProduction(invalid);
    refreshDigest(invalid);
    expect(LessonDefinitionSchema.safeParse(invalid).success).toBe(true);

    invalid.summary = 'Changed after independent review.';
    const result = LessonDefinitionSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('recomputed SHA-256')),
      ).toBe(true);
    }
  });

  it('loads fixtures only through explicit test mode and exact pins', () => {
    const registry = new LessonDefinitionRegistry([syntheticV3LessonDefinition], 'test_fixture');

    expect(
      registry.get(
        syntheticV3LessonDefinition.id,
        syntheticV3LessonDefinition.definitionVersion,
        syntheticV3LessonDefinition.contentRelease,
      ),
    ).toEqual(syntheticV3LessonDefinition);
    expect(() => new LessonDefinitionRegistry([syntheticV3LessonDefinition], 'production')).toThrow(
      /canonical manifest/,
    );
  });
});
