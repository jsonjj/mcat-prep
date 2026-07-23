import type { LessonActivityPhase } from '@mcat/contracts';
import {
  ActivityDefinitionSchema,
  LessonDefinitionSchema,
  type ActivityDefinition,
  type KnowledgeComponentDefinition,
  type LessonDefinition,
} from '../lesson-definition';

/**
 * SYNTHETIC, TEST-ONLY curriculum fixture.
 *
 * "Glimmer dials" and "Nacre relays" are invented mechanisms with no MCAT
 * claim. This fixture exists only to exercise V3 authoring and runtime rules.
 */

const timing = {
  minimumSeconds: 1,
  targetSeconds: 20,
  maximumSeconds: 120,
} as const;

const allAssistance = {
  allowedLevels: ['A3', 'A2', 'A1', 'A0'] as const,
  initialLevel: 'A3' as const,
  hints: [
    {
      level: 'A3' as const,
      text: 'Use the complete fictional dial checklist.',
      contentBearing: true,
    },
    {
      level: 'A2' as const,
      text: 'Compare the marker before and after the invented signal.',
      contentBearing: true,
    },
    {
      level: 'A1' as const,
      text: 'Name the changed marker.',
      contentBearing: false,
    },
  ],
  revealAllowed: true,
};

const unsupported = {
  allowedLevels: ['A0'] as const,
  initialLevel: 'A0' as const,
  hints: [],
  revealAllowed: false,
};

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
    assistance: allAssistance,
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
    exit?: boolean;
    changed?: boolean;
    entrySignals?: { ready: string; prerequisite: string; misconception: string };
  } = {},
): ActivityDefinition {
  const choices = options.entrySignals
    ? [
        {
          id: 'ready',
          label: 'The two fictional markers align.',
          feedback: 'The markers align in this synthetic rule set.',
          diagnosticSignalIds: [options.entrySignals.ready],
        },
        {
          id: 'prerequisite',
          label: 'I cannot yet identify either marker.',
          feedback: 'Revisit how the invented markers are named.',
          diagnosticSignalIds: [options.entrySignals.prerequisite],
        },
        {
          id: 'swap',
          label: 'The marker names should be swapped.',
          feedback: 'The invented marker names stay fixed.',
          diagnosticSignalIds: [options.entrySignals.misconception],
        },
      ]
    : [
        {
          id: 'aligned',
          label: 'The fictional markers align.',
          feedback: 'The synthetic rule predicts aligned markers.',
          diagnosticSignalIds: [],
        },
        {
          id: 'offset',
          label: 'The fictional markers remain offset.',
          feedback: 'That does not follow the synthetic rule.',
          diagnosticSignalIds: [`signal-${kcId.toLowerCase()}-offset`],
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
    prompt: `Choose the result for the invented ${kcId.endsWith('001') ? 'Glimmer dial' : 'Nacre relay'}.`,
    instructions: [],
    representationIds,
    response: {
      kind: 'choice',
      legend: 'Synthetic response options',
      choices,
      correctChoiceIds: [options.entrySignals ? 'ready' : 'aligned'],
      correctFeedback: 'Correct under the invented fixture rule.',
      notSureFeedback: 'Not sure keeps or increases support.',
      allowNotSure: true,
    },
    assistance: options.exit ? unsupported : allAssistance,
    timing,
  });
}

function makeKc(
  suffix: '001' | '002',
  noun: 'Glimmer dial' | 'Nacre relay',
): KnowledgeComponentDefinition {
  const kcId = `V3-KC-SYNTH-${suffix}`;
  const prefix = `V3-ACT-SYNTH-${suffix}`;
  const textRepId = `V3-REP-SYNTH-${suffix}-TEXT`;
  const diagramRepId = `V3-REP-SYNTH-${suffix}-DIAGRAM`;
  const signalPrefix = `signal-synth-${suffix}`;
  const ids = {
    probe1: `${prefix}-ENTRY-1`,
    probe2: `${prefix}-ENTRY-2`,
    concise: `${prefix}-ORIENT-CONCISE`,
    standard: `${prefix}-ORIENT-STANDARD`,
    prerequisite: `${prefix}-ORIENT-PREREQUISITE`,
    misconception: `${prefix}-ORIENT-MISCONCEPTION`,
    build: `${prefix}-BUILD`,
    expert: `${prefix}-EXPERT`,
    completion1: `${prefix}-COMPLETE-1`,
    completion2: `${prefix}-COMPLETE-2`,
    completion3: `${prefix}-COMPLETE-3`,
    completion4: `${prefix}-COMPLETE-4`,
    contrast: `${prefix}-CONTRAST`,
    near0: `${prefix}-EXIT-NEAR-0`,
    changed0: `${prefix}-EXIT-CHANGED-0`,
    near1: `${prefix}-EXIT-NEAR-1`,
    changed1: `${prefix}-EXIT-CHANGED-1`,
    near2: `${prefix}-EXIT-NEAR-2`,
    changed2: `${prefix}-EXIT-CHANGED-2`,
    repairGeneric: `${prefix}-REPAIR-GENERIC`,
    repairPrerequisite: `${prefix}-REPAIR-PREREQUISITE`,
    repairMisconception: `${prefix}-REPAIR-MISCONCEPTION`,
  };
  const signals = {
    ready: `${signalPrefix}-ready`,
    prerequisite: `${signalPrefix}-prerequisite`,
    misconception: `${signalPrefix}-misconception`,
  };

  const activities: ActivityDefinition[] = [
    choiceActivity(kcId, ids.probe1, 'enter_routing', [textRepId], 'First entry probe', {
      entrySignals: signals,
    }),
    choiceActivity(kcId, ids.probe2, 'enter_routing', [diagramRepId], 'Second entry probe', {
      entrySignals: signals,
    }),
    choiceActivity(kcId, ids.concise, 'orient_elicit', [textRepId], 'Concise orientation'),
    choiceActivity(kcId, ids.standard, 'orient_elicit', [textRepId], 'Standard orientation'),
    choiceActivity(
      kcId,
      ids.prerequisite,
      'orient_elicit',
      [textRepId],
      'Prerequisite orientation',
    ),
    choiceActivity(
      kcId,
      ids.misconception,
      'orient_elicit',
      [textRepId],
      'Misconception orientation',
    ),
    contentActivity(kcId, ids.build, 'build_model', [diagramRepId], 'Build the invented model'),
    contentActivity(
      kcId,
      ids.expert,
      'show_expert_decisions',
      [textRepId],
      'Show expert decisions',
    ),
    choiceActivity(
      kcId,
      ids.completion1,
      'completion',
      [textRepId],
      'Completion at support step one',
    ),
    choiceActivity(
      kcId,
      ids.completion2,
      'completion',
      [textRepId],
      'Completion at support step two',
    ),
    choiceActivity(
      kcId,
      ids.completion3,
      'completion',
      [textRepId],
      'Completion at support step three',
    ),
    choiceActivity(kcId, ids.completion4, 'completion', [textRepId], 'Completion without support'),
    contentActivity(kcId, ids.contrast, 'contrast_bound', [textRepId], 'Contrast and bound'),
    choiceActivity(kcId, ids.near0, 'exit_near', [textRepId], 'Fresh near-use exit zero', {
      exit: true,
    }),
    choiceActivity(kcId, ids.changed0, 'exit_changed', [diagramRepId], 'Fresh changed exit zero', {
      exit: true,
      changed: true,
    }),
    choiceActivity(kcId, ids.near1, 'exit_near', [textRepId], 'Fresh near-use exit one', {
      exit: true,
    }),
    choiceActivity(kcId, ids.changed1, 'exit_changed', [diagramRepId], 'Fresh changed exit one', {
      exit: true,
      changed: true,
    }),
    choiceActivity(kcId, ids.near2, 'exit_near', [textRepId], 'Fresh near-use exit two', {
      exit: true,
    }),
    choiceActivity(kcId, ids.changed2, 'exit_changed', [diagramRepId], 'Fresh changed exit two', {
      exit: true,
      changed: true,
    }),
    contentActivity(kcId, ids.repairGeneric, 'targeted_repair', [textRepId], 'Generic repair'),
    contentActivity(
      kcId,
      ids.repairPrerequisite,
      'targeted_repair',
      [textRepId],
      'Prerequisite repair',
    ),
    contentActivity(
      kcId,
      ids.repairMisconception,
      'targeted_repair',
      [diagramRepId],
      'Convergent misconception repair',
    ),
  ];

  const shared = [
    ids.build,
    ids.expert,
    ids.completion1,
    ids.completion2,
    ids.completion3,
    ids.completion4,
    ids.contrast,
    ids.near0,
    ids.changed0,
  ];

  return {
    id: kcId as KnowledgeComponentDefinition['id'],
    title: `Synthetic ${noun} calibration`,
    objective: `Apply an invented rule to one ${noun.toLowerCase()} construct.`,
    scope: {
      included: [`The invented ${noun.toLowerCase()} rule.`],
      excluded: ['Any real scientific, medical, or test-preparation claim.'],
      prerequisiteKcIds: [],
    },
    representations: [
      {
        id: textRepId as KnowledgeComponentDefinition['representations'][number]['id'],
        kind: 'text',
        label: `${noun} text rule`,
        body: [
          `In this fixture only, the ${noun.toLowerCase()} aligns when both invented markers match.`,
        ],
        assetRef: null,
        table: null,
        alternatives: [],
      },
      {
        id: diagramRepId as KnowledgeComponentDefinition['representations'][number]['id'],
        kind: 'diagram',
        label: `${noun} diagram`,
        body: [],
        assetRef: `test-only://${suffix}/diagram`,
        table: null,
        alternatives: [
          {
            format: 'long_description',
            content: [
              `A text description of two matching invented markers on the ${noun.toLowerCase()}.`,
            ],
          },
        ],
      },
    ],
    activities,
    microcycle: {
      entryRouting: {
        probeActivityIds: [
          ids.probe1,
          ids.probe2,
        ] as KnowledgeComponentDefinition['microcycle']['entryRouting']['probeActivityIds'],
        routes: [
          {
            route: 'concise',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.ready],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A1',
            activityIds: [ids.concise, ...shared],
          },
          {
            route: 'standard',
            criteria: { kind: 'default', signalIds: [], minimumDistinctFamilies: 0 },
            initialAssistanceLevel: 'A3',
            activityIds: [ids.standard, ...shared],
          },
          {
            route: 'prerequisite',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.prerequisite],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A3',
            activityIds: [ids.repairPrerequisite, ids.prerequisite, ...shared],
          },
          {
            route: 'misconception',
            criteria: {
              kind: 'convergent_evidence',
              signalIds: [signals.misconception],
              minimumDistinctFamilies: 2,
            },
            initialAssistanceLevel: 'A3',
            activityIds: [ids.repairMisconception, ids.misconception, ...shared],
          },
        ] as KnowledgeComponentDefinition['microcycle']['entryRouting']['routes'],
      },
      fading: {
        ladder: ['A3', 'A2', 'A1', 'A0'],
        successesToFade: 1,
        nonSuccessRule: 'hold_or_increase_support',
      },
      workedDecisionActivityIds: [
        ids.expert,
      ] as KnowledgeComponentDefinition['microcycle']['workedDecisionActivityIds'],
      pairedExit: {
        feedbackSealedUntilBoth: true,
        attempts: [
          { nearActivityId: ids.near0, changedActivityId: ids.changed0 },
          { nearActivityId: ids.near1, changedActivityId: ids.changed1 },
          { nearActivityId: ids.near2, changedActivityId: ids.changed2 },
        ] as KnowledgeComponentDefinition['microcycle']['pairedExit']['attempts'],
      },
      repairs: {
        maximumCycles: 2,
        mappings: [
          {
            id: `${signalPrefix}-generic`,
            kind: 'generic',
            signalIds: [],
            minimumDistinctFamilies: 0,
            activityIds: [
              ids.repairGeneric,
              ids.completion1,
              ids.completion2,
              ids.completion3,
              ids.completion4,
            ],
          },
          {
            id: `${signalPrefix}-prerequisite-route`,
            kind: 'targeted',
            signalIds: [signals.prerequisite],
            minimumDistinctFamilies: 2,
            activityIds: [
              ids.repairPrerequisite,
              ids.completion1,
              ids.completion2,
              ids.completion3,
              ids.completion4,
            ],
          },
          {
            id: `${signalPrefix}-misconception-route`,
            kind: 'targeted',
            signalIds: [signals.misconception],
            minimumDistinctFamilies: 2,
            activityIds: [
              ids.repairMisconception,
              ids.completion1,
              ids.completion2,
              ids.completion3,
              ids.completion4,
            ],
          },
        ] as KnowledgeComponentDefinition['microcycle']['repairs']['mappings'],
      },
    },
    artifactReferences: [
      {
        kind: 'support',
        id: `V3-SUP-SYNTH-${suffix}`,
        evidenceUse: 'none',
      },
    ],
    timing: {
      minimumSeconds: 60,
      targetSeconds: 480,
      maximumSeconds: 1_800,
    },
  };
}

const fixtureInput = {
  schemaVersion: '3.0.0',
  id: 'V3-LES-SYNTH-FOUNDATION',
  definitionVersion: '3.0.0-test.1',
  contentRelease: 'synthetic-v3-foundation-test-only',
  canonicalRegistryRef: null,
  title: 'Synthetic V3 microcycle foundation fixture',
  summary:
    'Test-only multi-KC shell for deterministic routing, fading, paired exits, repair, and handoff.',
  orderedKcIds: ['V3-KC-SYNTH-001', 'V3-KC-SYNTH-002'],
  knowledgeComponents: [makeKc('001', 'Glimmer dial'), makeKc('002', 'Nacre relay')],
  artifactReferences: [
    {
      kind: 'extension',
      id: 'V3-EXT-SYNTH-FOUNDATION',
      evidenceUse: 'none',
    },
    {
      kind: 'capstone',
      id: 'V3-CAP-SYNTH-FOUNDATION',
      evidenceUse: 'separate_capstone_only',
    },
  ],
  timing: {
    minimumSeconds: 120,
    targetSeconds: 960,
    maximumSeconds: 3_600,
  },
  status: 'draft',
  provenance: {
    origin: 'original',
    source_refs: [],
    rights_status: 'cleared',
    ai_assisted: false,
  },
  review: {
    content_status: 'pending',
    copy_status: 'pending',
    accessibility_status: 'pending',
    reviewer_ids: [],
  },
  testOnly: true,
  accessibility: {
    language: 'en-US',
    readingOrder: ['V3-KC-SYNTH-001', 'V3-KC-SYNTH-002'],
    keyboardOnlySupported: true,
    reducedMotionSupported: true,
    authorNotes: ['Fixture terms are deliberately fictional and are not learner content.'],
  },
};

export const syntheticV3LessonDefinition: LessonDefinition =
  LessonDefinitionSchema.parse(fixtureInput);

export const freshSyntheticV3LessonInput = (): unknown => structuredClone(fixtureInput);
