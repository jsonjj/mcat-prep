import type {
  LessonNodePreview,
  LessonPresentationScreenPreview,
  LessonQuestionNodePreview,
  LessonQuestionOptionPreview,
  LessonQuestionStagePreview,
  LessonVisualPreview,
  NonEmptyReadonlyArray,
} from './contract';

export interface SectionQuestionAuthoring {
  readonly title: string;
  readonly supportingLine?: string;
  readonly prompt: string;
  readonly options: NonEmptyReadonlyArray<LessonQuestionOptionPreview>;
  readonly correctOptionId: string;
  readonly feedbackByOption: Readonly<Record<string, string>>;
  readonly explanation: string;
  readonly help?: string;
  readonly visual?: LessonVisualPreview;
}

export interface SectionExplanationAuthoring {
  readonly title: string;
  readonly supportingLine?: string;
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly visual: LessonVisualPreview;
  readonly takeaway?: string;
}

export interface SectionRepairAuthoring {
  readonly title: string;
  readonly supportingLine?: string;
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly visual: LessonVisualPreview;
  readonly strategy: string;
  readonly checkYourThinking: string;
}

export interface LessonSectionAuthoring {
  readonly key: string;
  readonly kcId: string;
  readonly stageLabel: string;
  readonly nextActionLabel: string;
  readonly starting: SectionQuestionAuthoring;
  readonly model: SectionExplanationAuthoring;
  readonly understandingCheck: SectionQuestionAuthoring;
  readonly worked: SectionExplanationAuthoring;
  readonly guided: SectionQuestionAuthoring;
  readonly reducedSupport: SectionQuestionAuthoring;
  readonly independent: SectionQuestionAuthoring;
  readonly near: SectionQuestionAuthoring;
  readonly changed: SectionQuestionAuthoring;
  readonly repair: SectionRepairAuthoring;
  readonly recap: SectionExplanationAuthoring;
}

type SectionNodeSuffix =
  | 'starting-check'
  | 'model'
  | 'understanding-check'
  | 'worked'
  | 'guided'
  | 'reduced-support'
  | 'independent'
  | 'exit-near'
  | 'exit-changed'
  | 'repair'
  | 'recap';

export function sectionNodeId(
  section: Pick<LessonSectionAuthoring, 'key'>,
  suffix: SectionNodeSuffix,
): string {
  return `${section.key}-${suffix}`;
}

function questionNode(
  section: LessonSectionAuthoring,
  suffix: SectionNodeSuffix,
  stage: LessonQuestionStagePreview,
  question: SectionQuestionAuthoring,
): LessonQuestionNodePreview {
  return {
    id: sectionNodeId(section, suffix),
    kcIds: [section.kcId],
    kind: 'question',
    stage,
    title: question.title,
    supportingLine: question.supportingLine,
    prompt: question.prompt,
    options: question.options,
    visual: question.visual,
    help: question.help,
    evaluation: {
      correctOptionId: question.correctOptionId,
      feedbackByOption: question.feedbackByOption,
      explanation: question.explanation,
    },
  };
}

export function buildSectionNodes(section: LessonSectionAuthoring): LessonNodePreview[] {
  const independentId = sectionNodeId(section, 'independent');
  const nearId = sectionNodeId(section, 'exit-near');
  const changedId = sectionNodeId(section, 'exit-changed');

  return [
    questionNode(section, 'starting-check', 'starting-check', section.starting),
    {
      id: sectionNodeId(section, 'model'),
      kcIds: [section.kcId],
      kind: 'explanation',
      ...section.model,
    },
    questionNode(section, 'understanding-check', 'understanding-check', section.understandingCheck),
    {
      id: sectionNodeId(section, 'worked'),
      kcIds: [section.kcId],
      kind: 'explanation',
      ...section.worked,
    },
    questionNode(section, 'guided', 'guided', section.guided),
    questionNode(section, 'reduced-support', 'reduced-support', section.reducedSupport),
    questionNode(section, 'independent', 'independent', section.independent),
    questionNode(section, 'exit-near', 'exit-near', section.near),
    questionNode(section, 'exit-changed', 'exit-changed', section.changed),
    {
      id: sectionNodeId(section, 'repair'),
      kcIds: [section.kcId],
      kind: 'repair',
      sourceQuestionIds: [independentId, nearId, changedId],
      ...section.repair,
    },
    {
      id: sectionNodeId(section, 'recap'),
      kcIds: [section.kcId],
      kind: 'explanation',
      ...section.recap,
    },
  ];
}

export function buildSectionScreens(
  section: LessonSectionAuthoring,
): LessonPresentationScreenPreview[] {
  const stage = section.stageLabel;
  return [
    {
      nodeId: sectionNodeId(section, 'starting-check'),
      stageLabel: `${stage} · Starting check`,
      progressGroup: 'learn',
      treatment: 'question',
      primaryActionLabel: 'Build the model',
    },
    {
      nodeId: sectionNodeId(section, 'model'),
      stageLabel: `${stage} · Learn`,
      progressGroup: 'learn',
      treatment: 'visual-model',
      primaryActionLabel: 'Check your understanding',
    },
    {
      nodeId: sectionNodeId(section, 'understanding-check'),
      stageLabel: `${stage} · Quick check`,
      progressGroup: 'learn',
      treatment: 'question',
      primaryActionLabel: 'See worked reasoning',
    },
    {
      nodeId: sectionNodeId(section, 'worked'),
      stageLabel: `${stage} · Worked example`,
      progressGroup: 'learn',
      treatment: 'visual-model',
      primaryActionLabel: 'Practice with guidance',
    },
    {
      nodeId: sectionNodeId(section, 'guided'),
      stageLabel: `${stage} · Guided practice`,
      progressGroup: 'practice',
      treatment: 'question',
      primaryActionLabel: 'Try with less help',
    },
    {
      nodeId: sectionNodeId(section, 'reduced-support'),
      stageLabel: `${stage} · Reduced support`,
      progressGroup: 'practice',
      treatment: 'question',
      primaryActionLabel: 'Try independently',
    },
    {
      nodeId: sectionNodeId(section, 'independent'),
      stageLabel: `${stage} · Independent`,
      progressGroup: 'practice',
      treatment: 'question',
      primaryActionLabel: 'Check the same skill',
    },
    {
      nodeId: sectionNodeId(section, 'exit-near'),
      stageLabel: `${stage} · Final check`,
      progressGroup: 'check',
      treatment: 'question',
      primaryActionLabel: 'Try a changed task',
    },
    {
      nodeId: sectionNodeId(section, 'exit-changed'),
      stageLabel: `${stage} · Final check`,
      progressGroup: 'check',
      treatment: 'question',
      primaryActionLabel: 'Review this section',
    },
    {
      nodeId: sectionNodeId(section, 'repair'),
      stageLabel: `${stage} · Targeted repair`,
      progressGroup: 'check',
      treatment: 'repair',
      primaryActionLabel: 'Continue',
    },
    {
      nodeId: sectionNodeId(section, 'recap'),
      stageLabel: `${stage} · Recap`,
      progressGroup: 'learn',
      treatment: 'visual-model',
      primaryActionLabel: section.nextActionLabel,
    },
  ];
}
