import { describe, expect, it } from 'vitest';
import {
  buildLessonAssetManifest,
  computeLessonContentDigest,
  LessonDefinitionRegistry,
  LessonDefinitionSchema,
  RepresentationDefinitionSchema,
  syntheticV3LessonDefinition,
  validateLessonAssetManifest,
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
    expect(computeLessonContentDigest({ '\u00e9': 1, '\u{1f642}': 2, alpha: 3 })).toBe(
      computeLessonContentDigest(
        Object.fromEntries([
          ['alpha', 3],
          ['\u{1f642}', 2],
          ['\u00e9', 1],
        ]),
      ),
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

    const prerequisiteDrift = structuredClone(syntheticV3LessonDefinition);
    prerequisiteDrift.knowledgeComponents[0]!.scope.hardPrerequisiteEntityIds.push(
      syntheticV3LessonDefinition.knowledgeComponents[1]!.id,
    );
    expect(LessonDefinitionSchema.safeParse(prerequisiteDrift).success).toBe(false);

    const representationDrift = structuredClone(syntheticV3LessonDefinition);
    representationDrift.knowledgeComponents[0]!.canonicalRepresentationMappings[0]!.canonicalLabel =
      'Hand-inferred representation label';
    expect(LessonDefinitionSchema.safeParse(representationDrift).success).toBe(false);
  });

  it('rejects KC-level artifact bypass fields instead of allowing a second activation surface', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition) as unknown as {
      knowledgeComponents: Array<Record<string, unknown>>;
    };
    invalid.knowledgeComponents[0]!.artifactReferences = [
      {
        kind: 'capstone',
        id: 'V3-CAP-INVENTED-BYPASS',
        deliveryState: 'required',
        activation: 'required_separate',
        evidenceUse: 'separate_capstone_only',
      },
    ];

    expect(LessonDefinitionSchema.safeParse(invalid).success).toBe(false);
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

  it('rejects impossible fading, contaminated entry probes, and unreachable route evidence', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const kc = invalid.knowledgeComponents[0]!;
    kc.microcycle.fading.successesToFade = 3;
    const firstProbe = kc.activities.find(
      (activity) => activity.id === kc.microcycle.entryRouting.probeActivityIds[0],
    )!;
    firstProbe.assistance.allowedLevels = ['A3', 'A0'];
    firstProbe.assistance.initialLevel = 'A3';
    firstProbe.assistance.revealAllowed = true;
    if (firstProbe.response.kind !== 'choice') throw new Error('Expected a choice entry probe.');
    firstProbe.response.notSureDiagnosticSignalIds = [];
    const prerequisite = kc.microcycle.entryRouting.routes.find(
      (route) => route.route === 'prerequisite',
    )!;
    if (prerequisite.criteria.kind !== 'convergent_evidence') {
      throw new Error('Expected convergent prerequisite criteria.');
    }
    prerequisite.criteria.signalIds = ['signal-that-no-probe-can-emit'];

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('maxAttemptsPerLevel');
      expect(messages).toContain('unsupported');
      expect(messages).toContain('not-sure');
      expect(messages).toContain('cannot reach');
    }
  });

  it('validates route, repair-start, contrast, and targeted-evidence assistance assumptions', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    const kc = invalid.knowledgeComponents[0]!;
    const concise = kc.microcycle.entryRouting.routes.find((route) => route.route === 'concise')!;
    const routeActivity = kc.activities.find(
      (activity) => activity.id === concise.instructionActivityIds[0],
    )!;
    routeActivity.assistance.allowedLevels = ['A3'];
    const contrast = kc.activities.find(
      (activity) => activity.id === kc.microcycle.contrastActivityIds[0],
    )!;
    contrast.assistance.allowedLevels = ['A3'];
    const targeted = kc.microcycle.repairs.cycles[0].mappings.find(
      (mapping) => mapping.kind === 'targeted',
    )!;
    targeted.signalIds = ['signal-with-no-declared-source'];
    const repair = kc.activities.find(
      (activity) => activity.id === targeted.candidateActivityIds[0],
    )!;
    repair.assistance.allowedLevels = ['A2'];
    repair.assistance.initialLevel = 'A2';

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('route support');
      expect(messages).toContain('post-completion A0');
      expect(messages).toContain('repair-start A3');
      expect(messages).toContain('targeted evidence cannot converge');
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

  it('requires exit pair IDs to be unique across the complete lesson shell', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    invalid.knowledgeComponents[1]!.microcycle.pairedExit.pairs[0]!.id =
      invalid.knowledgeComponents[0]!.microcycle.pairedExit.pairs[0]!.id;

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('lesson-global unique')),
      ).toBe(true);
    }
  });

  it('requires activity family IDs to be unique across the complete lesson shell', () => {
    const invalid = structuredClone(syntheticV3LessonDefinition);
    invalid.knowledgeComponents[1]!.activities[0]!.familyId =
      invalid.knowledgeComponents[0]!.activities[0]!.familyId;

    const result = LessonDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message.includes('lesson-global unique')),
      ).toBe(true);
    }
  });

  it('binds worked-decision declarations exactly to route-reachable expert activities', () => {
    const listedNowhere = structuredClone(syntheticV3LessonDefinition);
    const firstKc = listedNowhere.knowledgeComponents[0]!;
    const expertId = firstKc.microcycle.workedDecisionActivityIds[0]!;
    const expert = firstKc.activities.find((activity) => activity.id === expertId)!;
    const unreachableExpert = {
      ...structuredClone(expert),
      id: 'V3-ACT-SYNTH-001-EXPERT-UNREACHABLE' as typeof expert.id,
      familyId: 'family-v3-act-synth-001-expert-unreachable',
    };
    firstKc.activities.push(unreachableExpert);
    firstKc.microcycle.workedDecisionActivityIds.push(unreachableExpert.id);

    const listedNowhereResult = LessonDefinitionSchema.safeParse(listedNowhere);
    expect(listedNowhereResult.success).toBe(false);
    if (!listedNowhereResult.success) {
      expect(
        listedNowhereResult.error.issues.some((issue) =>
          issue.message.includes('exactly match expert-decision activities'),
        ),
      ).toBe(true);
    }

    const omitted = structuredClone(syntheticV3LessonDefinition);
    const omittedKc = omitted.knowledgeComponents[0]!;
    const omittedExpert = {
      ...structuredClone(
        omittedKc.activities.find(
          (activity) => activity.id === omittedKc.microcycle.workedDecisionActivityIds[0],
        )!,
      ),
      id: 'V3-ACT-SYNTH-001-EXPERT-OMITTED' as (typeof omittedKc.activities)[number]['id'],
      familyId: 'family-v3-act-synth-001-expert-omitted',
    };
    omittedKc.activities.push(omittedExpert);
    omittedKc.microcycle.entryRouting.routes[0]!.instructionActivityIds.push(omittedExpert.id);

    const omittedResult = LessonDefinitionSchema.safeParse(omitted);
    expect(omittedResult.success).toBe(false);
    if (!omittedResult.success) {
      expect(
        omittedResult.error.issues.some((issue) =>
          issue.message.includes('exactly match expert-decision activities'),
        ),
      ).toBe(true);
    }
  });

  it('rejects duplicate correct IDs and failure features attached only to correct choices', () => {
    const duplicate = structuredClone(syntheticV3LessonDefinition);
    const duplicateResponse = duplicate.knowledgeComponents[0]!.activities[0]!.response;
    if (duplicateResponse.kind !== 'choice') throw new Error('Expected fixture choice response.');
    duplicateResponse.correctChoiceIds.push(duplicateResponse.correctChoiceIds[0]!);
    const duplicateResult = LessonDefinitionSchema.safeParse(duplicate);
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) {
      expect(
        duplicateResult.error.issues.some((issue) =>
          issue.message.includes('correct choice IDs must be unique'),
        ),
      ).toBe(true);
    }

    const correctOnlyFeature = structuredClone(syntheticV3LessonDefinition);
    const featureKc = correctOnlyFeature.knowledgeComponents[0]!;
    featureKc.microcycle.entryRouting.probeActivityIds.forEach((probeId) => {
      const response = featureKc.activities.find((activity) => activity.id === probeId)!.response;
      if (response.kind !== 'choice') throw new Error('Expected fixture choice response.');
      response.choices
        .filter((choice) => response.correctChoiceIds.includes(choice.id))
        .forEach((choice) => choice.objectiveFeatureIds.push('feature-correct-only'));
    });
    const targeted = featureKc.microcycle.repairs.cycles[0].mappings.find(
      (mapping) => mapping.kind === 'targeted',
    )!;
    targeted.signalIds = [];
    targeted.objectiveFeatureIds = ['feature-correct-only'];

    const featureResult = LessonDefinitionSchema.safeParse(correctOnlyFeature);
    expect(featureResult.success).toBe(false);
    if (!featureResult.success) {
      const messages = featureResult.error.issues.map((issue) => issue.message).join(' ');
      expect(messages).toContain('failure-only objective features');
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

  it('binds reviewed media paths to verified byte digests and detects deployment drift', () => {
    const approvedBytes = new TextEncoder().encode('reviewed synthetic video bytes');
    const mutatedBytes = new TextEncoder().encode('mutated synthetic video bytes');
    const path = '/lesson-assets/synthetic/reviewed.webm';
    const approvedManifest = buildLessonAssetManifest([
      { path, kind: 'video', bytes: approvedBytes },
    ]);
    const mutatedManifest = buildLessonAssetManifest([
      { path, kind: 'video', bytes: mutatedBytes },
    ]);
    const definition = structuredClone(syntheticV3LessonDefinition);
    definition.knowledgeComponents[0]!.representations.push(
      RepresentationDefinitionSchema.parse({
        id: 'V3-REP-SYNTH-001-REVIEWED-VIDEO',
        kind: 'video',
        label: 'Synthetic reviewed video',
        alternative: {
          shortText: 'A synthetic reviewed clip.',
          longDescription: 'A test-only clip with no scientific content.',
        },
        assetRef: path,
        transcript: ['Synthetic transcript.'],
        captionsRef: '/lesson-assets/synthetic/reviewed.vtt',
      }),
    );
    const captionsManifest = buildLessonAssetManifest([
      {
        path: '/lesson-assets/synthetic/reviewed.vtt',
        kind: 'captions',
        bytes: new TextEncoder().encode('WEBVTT\n\n00:00.000 --> 00:01.000\nSynthetic'),
      },
    ]);
    definition.reviewedAssets = [...approvedManifest.assets, ...captionsManifest.assets];

    expect(LessonDefinitionSchema.safeParse(definition).success).toBe(true);
    expect(
      validateLessonAssetManifest(definition, {
        schemaVersion: '1.0',
        assets: [...approvedManifest.assets, ...captionsManifest.assets],
      }),
    ).toEqual([]);
    expect(
      validateLessonAssetManifest(definition, {
        schemaVersion: '1.0',
        assets: [...mutatedManifest.assets, ...captionsManifest.assets],
      }),
    ).toEqual([
      'reviewed asset /lesson-assets/synthetic/reviewed.webm does not match its approved SHA-256',
    ]);
    expect(validateLessonAssetManifest(definition, undefined)).toEqual([
      'reviewed media bytes are unavailable or the verified asset manifest is invalid',
    ]);
    expect(JSON.stringify(definition.knowledgeComponents[0]!.representations)).not.toContain(
      'reviewed synthetic video bytes',
    );
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
