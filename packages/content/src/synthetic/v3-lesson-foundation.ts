import type { AssistanceLevel, LessonActivityPhase } from '@mcat/contracts';
import {
  ActivityDefinitionSchema,
  computeLessonContentDigest,
  KnowledgeComponentDefinitionSchema,
  LessonDefinitionSchema,
  type ActivityDefinition,
  type KnowledgeComponentDefinition,
  type LessonDefinition,
} from '../lesson-definition';

/**
 * SYNTHETIC, TEST-ONLY curriculum fixture.
 *
 * “Glimmer dials” and “Nacre relays” are invented mechanisms with no MCAT
 * claim. The oversized fresh pools intentionally exercise bounded branching,
 * repair, and one planner-reentry generation.
 */

const timing = {
  minimumSeconds: 1,
  targetSeconds: 20,
  maximumSeconds: 120,
} as const;

const supportOrder: AssistanceLevel[] = ['A3', 'A2', 'A1', 'A0'];

const assistanceFor = (level: AssistanceLevel, exit = false) => {
  if (exit) {
    return {
      allowedLevels: ['A0'] as AssistanceLevel[],
      initialLevel: 'A0' as const,
      hints: [],
      revealAllowed: false,
    };
  }
  const levelIndex = supportOrder.indexOf(level);
  return {
    allowedLevels: supportOrder.slice(0, levelIndex + 1),
    initialLevel: level,
    hints: supportOrder
      .slice(0, Math.max(1, levelIndex + 1))
      .filter((candidate) => candidate !== 'A0')
      .map((candidate) => ({
        level: candidate,
        text: `Synthetic ${candidate} support for the invented rule.`,
        contentBearing: candidate !== 'A1',
      })),
    revealAllowed: level !== 'A0',
  };
};

const instructionAssistance = () => ({
  allowedLevels: [...supportOrder],
  initialLevel: 'A3' as const,
  hints: [
    {
      level: 'A3' as const,
      text: 'Synthetic content-bearing instruction for the invented rule.',
      contentBearing: true,
    },
  ],
  revealAllowed: true,
});

function contentActivity(
  kcId: string,
  id: string,
  phase: LessonActivityPhase,
  representationIds: string[],
  title: string,
): ActivityDefinition {
  return ActivityDefinitionSchema.parse({
    id,
    kcId,
    phase,
    familyId: `family-${id.toLowerCase()}`,
    constructId: `construct-${kcId.toLowerCase()}`,
    constructPreserving: true,
    changeDimensions: [],
    title,
    prompt: null,
    instructions: [`Synthetic instruction for ${title.toLowerCase()}.`],
    representationIds,
    response: { kind: 'none' },
    assistance: instructionAssistance(),
    timing,
  });
}

function choiceActivity(
  kcId: string,
  id: string,
  phase: LessonActivityPhase,
  representationIds: string[],
  title: string,
  options: {
    assistance?: AssistanceLevel;
    exit?: boolean;
    changed?: boolean;
    unassisted?: boolean;
    entrySignals?: { ready: string; prerequisite: string; misconception: string };
  } = {},
): ActivityDefinition {
  const choices = options.entrySignals
    ? [
        {
          id: 'ready',
          label: 'The two fictional markers align.',
          feedback: 'This response fits the invented rule.',
          diagnosticSignalIds: [options.entrySignals.ready],
          objectiveFeatureIds: [],
        },
        {
          id: 'prerequisite',
          label: 'I cannot yet identify either marker.',
          feedback: 'This response indicates a fictional naming gap.',
          diagnosticSignalIds: [options.entrySignals.prerequisite],
          objectiveFeatureIds: ['feature-marker-identification'],
        },
        {
          id: 'swap',
          label: 'The marker names should be swapped.',
          feedback: 'This response selects the fixture’s invented swap model.',
          diagnosticSignalIds: [options.entrySignals.misconception],
          objectiveFeatureIds: ['feature-marker-direction'],
        },
      ]
    : [
        {
          id: 'aligned',
          label: 'The fictional markers align.',
          feedback: 'The selected answer follows the synthetic rule.',
          diagnosticSignalIds: [],
          objectiveFeatureIds: [],
        },
        {
          id: 'offset',
          label: 'The fictional markers remain offset.',
          feedback: 'The selected answer conflicts with the synthetic rule.',
          diagnosticSignalIds: [`signal-${kcId.toLowerCase()}-offset`],
          objectiveFeatureIds: ['feature-alignment-operation'],
        },
      ];
  return ActivityDefinitionSchema.parse({
    id,
    kcId,
    phase,
    familyId: `family-${id.toLowerCase()}`,
    constructId: `construct-${kcId.toLowerCase()}`,
    constructPreserving: true,
    changeDimensions: options.changed ? ['representation'] : [],
    title,
    prompt: `Choose the result for this invented ${kcId.endsWith('001') ? 'Glimmer dial' : 'Nacre relay'}.`,
    instructions: [],
    representationIds,
    response: {
      kind: 'choice',
      legend: 'Synthetic response options',
      choices,
      correctChoiceIds: [options.entrySignals ? 'ready' : 'aligned'],
      correctFeedback: 'Correct under the invented fixture rule.',
      notSureFeedback: 'Not sure keeps or increases support.',
      notSureDiagnosticSignalIds: [
        options.entrySignals
          ? options.entrySignals.prerequisite
          : `signal-${kcId.toLowerCase()}-offset`,
      ],
      notSureObjectiveFeatureIds: [
        options.entrySignals ? 'feature-marker-identification' : 'feature-alignment-operation',
      ],
      allowNotSure: true,
    },
    assistance: assistanceFor(
      options.exit || options.unassisted ? 'A0' : (options.assistance ?? 'A3'),
      options.exit || options.unassisted,
    ),
    timing,
  });
}

const makeDiagram = (label: string) => ({
  width: 360,
  height: 160,
  nodes: [
    {
      id: 'input',
      label: 'Marker one',
      description: 'The first fictional marker.',
      x: 80,
      y: 80,
      shape: 'circle' as const,
      tone: 'accent' as const,
    },
    {
      id: 'output',
      label: 'Marker two',
      description: 'The second fictional marker.',
      x: 280,
      y: 80,
      shape: 'rectangle' as const,
      tone: 'positive' as const,
    },
  ],
  edges: [{ from: 'input', to: 'output', label, directed: true }],
});

function makeKc(
  suffix: '001' | '002',
  noun: 'Glimmer dial' | 'Nacre relay',
): KnowledgeComponentDefinition {
  const kcId = `V3-KC-SYNTH-${suffix}`;
  const prefix = `V3-ACT-SYNTH-${suffix}`;
  const rep = {
    text: `V3-REP-SYNTH-${suffix}-TEXT`,
    equation: `V3-REP-SYNTH-${suffix}-EQUATION`,
    diagram: `V3-REP-SYNTH-${suffix}-DIAGRAM`,
    chart: `V3-REP-SYNTH-${suffix}-CHART`,
    simulation: `V3-REP-SYNTH-${suffix}-SIMULATION`,
    cycle1: `V3-REP-SYNTH-${suffix}-REPAIR-CYCLE-1`,
    cycle2: `V3-REP-SYNTH-${suffix}-REPAIR-CYCLE-2`,
  };
  const signalPrefix = `signal-synth-${suffix}`;
  const signals = {
    ready: `${signalPrefix}-ready`,
    prerequisite: `${signalPrefix}-prerequisite`,
    misconception: `${signalPrefix}-misconception`,
  };
  const id = (name: string) => `${prefix}-${name}`;
  const activities: ActivityDefinition[] = [];
  const add = (activity: ActivityDefinition): ActivityDefinition['id'] => {
    activities.push(activity);
    return activity.id;
  };

  const probeIds = [
    ...Array.from({ length: 4 }, (_, index) =>
      add(
        choiceActivity(
          kcId,
          id(`ENTRY-${index + 1}`),
          'enter_routing',
          [index % 2 === 0 ? rep.text : rep.diagram],
          `Entry probe ${index + 1}`,
          { entrySignals: signals, unassisted: true },
        ),
      ),
    ),
  ];
  const build = add(
    contentActivity(kcId, id('BUILD'), 'build_model', [rep.diagram], 'Build the invented model'),
  );
  const expert = add(
    contentActivity(
      kcId,
      id('EXPERT'),
      'show_expert_decisions',
      [rep.equation],
      'Show expert decisions',
    ),
  );
  const orientByRoute = Object.fromEntries(
    ['concise', 'standard', 'prerequisite', 'misconception'].map((route) => [
      route,
      add(
        contentActivity(
          kcId,
          id(`ORIENT-${route.toUpperCase()}`),
          'orient_elicit',
          [rep.text],
          `${route} orientation`,
        ),
      ),
    ]),
  );

  const makePools = (
    name: string,
    representationId: string,
  ): KnowledgeComponentDefinition['microcycle']['completionPools'] =>
    Object.fromEntries(
      supportOrder.map((level) => [
        level,
        Array.from({ length: 4 }, (_, index) =>
          add(
            choiceActivity(
              kcId,
              id(`${name}-${level}-${index + 1}`),
              'completion',
              [representationId],
              `${name} ${level} fresh task ${index + 1}`,
              { assistance: level },
            ),
          ),
        ),
      ]),
    ) as KnowledgeComponentDefinition['microcycle']['completionPools'];

  const completionPools = makePools('COMPLETE', rep.simulation);
  const contrastIds = [
    add(contentActivity(kcId, id('CONTRAST'), 'contrast_bound', [rep.chart], 'Contrast and bound')),
  ];

  const exitPairs = Array.from({ length: 6 }, (_, index) => ({
    id: `${signalPrefix}-exit-pair-${index + 1}`,
    nearActivityId: add(
      choiceActivity(
        kcId,
        id(`EXIT-NEAR-${index + 1}`),
        'exit_near',
        [rep.text],
        `Fresh near-use exit ${index + 1}`,
        { exit: true },
      ),
    ),
    changedActivityId: add(
      choiceActivity(
        kcId,
        id(`EXIT-CHANGED-${index + 1}`),
        'exit_changed',
        [rep.chart],
        `Fresh changed-task exit ${index + 1}`,
        { exit: true, changed: true },
      ),
    ),
  }));

  const repairCycles = ([1, 2] as const).map((cycle) => {
    const representationId = cycle === 1 ? rep.cycle1 : rep.cycle2;
    const candidateIds = (name: string) =>
      Array.from({ length: 2 }, (_, index) =>
        add(
          contentActivity(
            kcId,
            id(`REPAIR-C${cycle}-${name}-${index + 1}`),
            'targeted_repair',
            [representationId],
            `Cycle ${cycle} ${name.toLowerCase()} repair ${index + 1}`,
          ),
        ),
      );
    return {
      cycle,
      mappings: [
        {
          id: `${signalPrefix}-cycle-${cycle}-generic`,
          kind: 'generic' as const,
          signalIds: [],
          objectiveFeatureIds: [],
          minimumDistinctFamilies: 0 as const,
          candidateActivityIds: candidateIds('GENERIC'),
        },
        {
          id: `${signalPrefix}-cycle-${cycle}-prerequisite`,
          kind: 'targeted' as const,
          signalIds: [signals.prerequisite],
          objectiveFeatureIds: ['feature-marker-identification'],
          minimumDistinctFamilies: 2,
          candidateActivityIds: candidateIds('PREREQUISITE'),
        },
        {
          id: `${signalPrefix}-cycle-${cycle}-misconception`,
          kind: 'targeted' as const,
          signalIds: [signals.misconception],
          objectiveFeatureIds: ['feature-marker-direction'],
          minimumDistinctFamilies: 2,
          candidateActivityIds: candidateIds('MISCONCEPTION'),
        },
      ],
      recoveryPools: makePools(`RECOVERY-C${cycle}`, representationId),
    };
  });

  const objective = `Apply an invented rule to one ${noun.toLowerCase()} construct.`;
  const included = [`The invented ${noun.toLowerCase()} rule.`];
  const excluded = ['Any real scientific, medical, or test-preparation claim.'];
  return KnowledgeComponentDefinitionSchema.parse({
    id: kcId as KnowledgeComponentDefinition['id'],
    title: `Synthetic ${noun} calibration`,
    objective,
    scope: {
      included,
      excluded,
      hardPrerequisiteEntityIds: [],
      helpfulPrerequisiteEntityIds: [],
    },
    representations: [
      {
        id: rep.text,
        kind: 'text',
        label: `${noun} text rule`,
        paragraphs: [
          `In this fixture only, the ${noun.toLowerCase()} aligns when both invented markers match.`,
        ],
      },
      {
        id: rep.equation,
        kind: 'equation',
        label: `${noun} invented equation`,
        expression: 'alignment = marker₁ − marker₂',
        spoken: 'Alignment equals marker one minus marker two.',
        variables: [
          { symbol: 'marker₁', meaning: 'First fictional marker', unit: null },
          { symbol: 'marker₂', meaning: 'Second fictional marker', unit: null },
        ],
      },
      {
        id: rep.diagram,
        kind: 'diagram',
        label: `${noun} semantic diagram`,
        alternative: {
          shortText: 'Two fictional markers connected in order.',
          longDescription: 'Marker one points to marker two in the invented fixture model.',
        },
        diagram: makeDiagram('aligns with'),
      },
      {
        id: rep.chart,
        kind: 'chart',
        label: `${noun} synthetic chart`,
        alternative: {
          shortText: 'A line rises as the fictional input increases.',
          longDescription: 'The fixture chart contains three points: zero-zero, one-one, two-two.',
        },
        chart: {
          chartType: 'line',
          xAxis: { label: 'Fictional input', unit: 'glims', min: 0, max: 2 },
          yAxis: { label: 'Fictional output', unit: 'nacres', min: 0, max: 2 },
          series: [
            {
              id: 'alignment',
              label: 'Alignment',
              points: [
                { x: 0, y: 0, label: 'zero' },
                { x: 1, y: 1, label: 'one' },
                { x: 2, y: 2, label: 'two' },
              ],
            },
          ],
          dataTable: {
            caption: 'Synthetic chart values',
            columns: ['Input (glims)', 'Output (nacres)'],
            rows: [
              ['0', '0'],
              ['1', '1'],
              ['2', '2'],
            ],
          },
        },
      },
      {
        id: rep.simulation,
        kind: 'simulation',
        label: `${noun} controlled simulation`,
        alternative: {
          shortText: 'A slider controls a linear fictional output.',
          longDescription: 'Output equals two times the selected fictional input plus one.',
        },
        simulation: {
          adapter: 'linear_relationship',
          input: {
            id: 'marker',
            label: 'Fictional marker',
            min: 0,
            max: 4,
            step: 1,
            initial: 1,
            unit: 'glims',
          },
          outputs: [
            {
              id: 'result',
              label: 'Fictional result',
              slope: 2,
              intercept: 1,
              unit: 'nacres',
              decimals: 0,
            },
          ],
        },
      },
      {
        id: rep.cycle1,
        kind: 'diagram',
        label: `${noun} repair cycle one diagram`,
        alternative: {
          shortText: 'Cycle-one marker comparison.',
          longDescription: 'The first repair representation compares the two invented markers.',
        },
        diagram: makeDiagram('compare'),
      },
      {
        id: rep.cycle2,
        kind: 'diagram',
        label: `${noun} repair cycle two diagram`,
        alternative: {
          shortText: 'Cycle-two boundary comparison.',
          longDescription: 'The second repair representation contrasts an invented boundary case.',
        },
        diagram: makeDiagram('bounds'),
      },
    ],
    canonicalRepresentationMappings: [
      { canonicalLabel: `${noun} text rule`, representationIds: [rep.text] },
      { canonicalLabel: `${noun} invented equation`, representationIds: [rep.equation] },
      { canonicalLabel: `${noun} semantic diagram`, representationIds: [rep.diagram] },
      { canonicalLabel: `${noun} synthetic chart`, representationIds: [rep.chart] },
      {
        canonicalLabel: `${noun} controlled simulation`,
        representationIds: [rep.simulation],
      },
      {
        canonicalLabel: `${noun} repair cycle one diagram`,
        representationIds: [rep.cycle1],
      },
      {
        canonicalLabel: `${noun} repair cycle two diagram`,
        representationIds: [rep.cycle2],
      },
    ],
    activities,
    microcycle: {
      entryRouting: {
        feedbackSealedUntilRouteFinalized: true,
        probeCount: 2,
        probeActivityIds: probeIds,
        routes: [
          {
            route: 'concise',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.ready],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A1',
            instructionActivityIds: [orientByRoute.concise!, build, expert],
          },
          {
            route: 'standard',
            criteria: { kind: 'default', signalIds: [], minimumDistinctFamilies: 0 },
            initialAssistanceLevel: 'A3',
            instructionActivityIds: [orientByRoute.standard!, build, expert],
          },
          {
            route: 'prerequisite',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.prerequisite],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A3',
            instructionActivityIds: [orientByRoute.prerequisite!, build, expert],
          },
          {
            route: 'misconception',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.misconception],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A3',
            instructionActivityIds: [orientByRoute.misconception!, build, expert],
          },
        ],
      },
      fading: {
        ladder: ['A3', 'A2', 'A1', 'A0'],
        successesToFade: 1,
        requiredA0Successes: 1,
        maxAttemptsPerLevel: 2,
        maxReentryGenerations: 1,
        nonSuccessRule: 'hold_or_increase_support',
        exhaustionRule: 'planner_reentry_handoff',
      },
      workedDecisionActivityIds: [expert],
      completionPools,
      contrastActivityIds: contrastIds,
      pairedExit: { feedbackSealedUntilBoth: true, pairs: exitPairs },
      repairs: {
        maximumCycles: 2,
        cycles: [repairCycles[0]!, repairCycles[1]!],
      },
    },
    timing: { minimumSeconds: 60, targetSeconds: 480, maximumSeconds: 1_800 },
  });
}

const kcOne = makeKc('001', 'Glimmer dial');
const kcTwo = makeKc('002', 'Nacre relay');
const orderedKcIds = [kcOne.id, kcTwo.id];
const artifacts = [
  {
    kind: 'support' as const,
    id: 'V3-SUP-SYNTH-001',
    deliveryState: 'host_only' as const,
    activation: 'host_only' as const,
    evidenceUse: 'none' as const,
  },
  {
    kind: 'support' as const,
    id: 'V3-SUP-SYNTH-002',
    deliveryState: 'host_only' as const,
    activation: 'host_only' as const,
    evidenceUse: 'none' as const,
  },
  {
    kind: 'extension' as const,
    id: 'V3-EXT-SYNTH-FOUNDATION',
    deliveryState: 'host_only' as const,
    activation: 'host_only' as const,
    evidenceUse: 'none' as const,
  },
  {
    kind: 'capstone' as const,
    id: 'V3-CAP-SYNTH-FOUNDATION',
    deliveryState: 'required' as const,
    activation: 'required_separate' as const,
    evidenceUse: 'separate_capstone_only' as const,
  },
];

const fixtureInput: Record<string, unknown> = {
  schemaVersion: '3.2.0',
  id: 'V3-LES-SYNTH-FOUNDATION',
  definitionVersion: '3.2.0-test.1',
  contentRelease: 'synthetic-v3-foundation-test-only',
  registryBinding: {
    mode: 'synthetic_test_fixture',
    registry: {
      manifestSchemaVersion: 'mcat-v3-lesson-authoring-manifest-2',
      artifactId: 'TEST-ONLY-V3-REGISTRY',
      sha256: 'f'.repeat(64),
      phase0FreezeId: 'TEST-ONLY-PHASE0-FREEZE',
      canonicalFreezeId: 'TEST-ONLY-CANONICAL-FREEZE',
      graphFreezeId: 'TEST-ONLY-GRAPH-FREEZE',
      sequenceFreezeId: 'TEST-ONLY-SEQUENCE-FREEZE',
    },
    phase1GateId: 'TEST-ONLY-PHASE1-GATE',
    lesson: {
      id: 'V3-LES-SYNTH-FOUNDATION',
      groupingId: 'V3-CL-SYNTH-FOUNDATION',
      canonicalDisplayLabel: 'Synthetic V3 foundation fixture',
      conciseScope: 'Invented fixture behavior only.',
      scopeExclusions: ['All real MCAT and scientific content.'],
      orderedKcIds,
      hardPrerequisiteLessonIds: [],
      helpfulPrerequisiteLessonIds: [],
      directSuccessorLessonIds: [],
    },
    grouping: {
      id: 'V3-CL-SYNTH-FOUNDATION',
      lessonId: 'V3-LES-SYNTH-FOUNDATION',
      memberKcIds: orderedKcIds,
      memberCapstoneIds: ['V3-CAP-SYNTH-FOUNDATION'],
      teachingOrderEntityIds: [...orderedKcIds, 'V3-CAP-SYNTH-FOUNDATION'],
    },
    kcs: [kcOne, kcTwo].map((kc) => ({
      id: kc.id,
      owningLessonId: 'V3-LES-SYNTH-FOUNDATION',
      statementOfCompetence: kc.objective,
      scopeIn: kc.scope.included,
      scopeOut: kc.scope.excluded,
      representationLabels: kc.representations.map((representation) => representation.label),
      hardPrerequisiteEntityIds: kc.scope.hardPrerequisiteEntityIds,
      helpfulPrerequisiteEntityIds: kc.scope.helpfulPrerequisiteEntityIds,
    })),
    attachments: artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      owningLessonId: 'V3-LES-SYNTH-FOUNDATION',
      deliveryState: artifact.deliveryState,
      activation: artifact.activation,
      holdIds: [],
      lessonRelation: artifact.kind === 'support' ? 'host' : 'owner',
      componentKcIds: artifact.kind === 'capstone' ? orderedKcIds : [],
      placementRelationId: artifact.kind === 'capstone' ? 'TEST-ONLY-CAPSTONE-PLACEMENT' : null,
      placementFreezeId: artifact.kind === 'capstone' ? 'TEST-ONLY-SEQUENCE-FREEZE' : null,
    })),
    graphEdgeIds: [],
    sequenceRelationIds: ['TEST-ONLY-FIRST-DELIVERY'],
    holdIds: [],
  },
  contentDigest: { algorithm: 'sha256', sha256: '0'.repeat(64) },
  publicationIntent: 'internal_draft',
  title: 'Synthetic V3 microcycle foundation fixture',
  summary:
    'Test-only multi-KC shell for deterministic routing, fading, paired exits, repair, and handoff.',
  orderedKcIds,
  knowledgeComponents: [kcOne, kcTwo],
  artifactReferences: artifacts,
  reviewedAssets: [],
  timing: { minimumSeconds: 120, targetSeconds: 960, maximumSeconds: 3_600 },
  status: 'draft',
  provenance: { origin: 'original', sourceRefs: [], aiAssisted: false, cleanRoom: true },
  reviewEnvelope: {
    schemaVersion: '1.0',
    reviewedContentHash: '0'.repeat(64),
    publicationFreezeId: null,
    authorIds: ['synthetic-fixture-author'],
    independentContentReview: { status: 'pending', reviewerIds: [], reportId: null },
    independentDomainReview: { status: 'pending', reviewerIds: [], reportId: null },
    copyReview: { status: 'pending', reviewerIds: [], reportId: null },
    accessibilityReview: { status: 'pending', reviewerIds: [], reportId: null },
    blindSolve: { status: 'pending', solverIds: [], keysHidden: true, reportId: null },
    rightsReview: {
      status: 'pending',
      reviewerIds: [],
      sourceRightsCleared: false,
      modelProcessingRightsCleared: false,
      similarity: { status: 'pending', reviewerIds: [], reportId: null },
    },
    finalApproval: { status: 'pending', reviewerIds: [], reportId: null },
  },
  testOnly: true,
  accessibility: {
    language: 'en-US',
    readingOrder: orderedKcIds,
    keyboardOnlySupported: true,
    reducedMotionSupported: true,
    authorNotes: ['Fixture terms are deliberately fictional and are not learner content.'],
  },
};

const digest = computeLessonContentDigest(fixtureInput);
(fixtureInput.contentDigest as { sha256: string }).sha256 = digest;
(fixtureInput.reviewEnvelope as { reviewedContentHash: string }).reviewedContentHash = digest;

export const syntheticV3LessonDefinition: LessonDefinition =
  LessonDefinitionSchema.parse(fixtureInput);

export const freshSyntheticV3LessonInput = (): unknown => structuredClone(fixtureInput);
