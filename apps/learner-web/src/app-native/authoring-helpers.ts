/**
 * Shared authoring primitives for app-native lesson candidates.
 *
 * These helpers are the reusable core of the lesson-authoring loop: a compact
 * `question()` builder, a few data-only visual builders, and a `buildAppNativeLesson()`
 * factory that expands a small metadata + section spec into a fully-wired
 * script/presentation pair (via `section-authoring`). They contain no React, no
 * answer keys beyond the authored MCQ evaluation, and no planner/mastery claims.
 */
import {
  defineLessonPresentationPreview,
  defineLessonScriptPreview,
  type AccountingVisualPreview,
  type BoundaryVisualPreview,
  type LessonCompletionNodePreview,
  type LessonIntroNodePreview,
  type LessonMapVisualPreview,
  type LessonPresentationPreview,
  type LessonQuestionOptionPreview,
  type LessonScriptPreview,
  type NonEmptyReadonlyArray,
  type RelationVisualPreview,
} from './contract';
import {
  buildSectionNodes,
  buildSectionScreens,
  sectionNodeId,
  type LessonSectionAuthoring,
  type SectionQuestionAuthoring,
} from './section-authoring';

export type ChoiceId = 'A' | 'B' | 'C' | 'D';

/** Four `[label, feedback]` pairs, one per option. Keeps the correct answer honest. */
export type ChoiceSet = readonly [
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
];

type NonEmpty<T> = NonEmptyReadonlyArray<T>;
const nonEmpty = <T>(items: readonly T[]): NonEmpty<T> => items as unknown as NonEmpty<T>;

/** Compact MCQ authoring: labels + per-option feedback collapse into a section question. */
export function question(
  title: string,
  prompt: string,
  choices: ChoiceSet,
  correctOptionId: ChoiceId,
  explanation: string,
  help?: string,
  supportingLine?: string,
  visual?: SectionQuestionAuthoring['visual'],
): SectionQuestionAuthoring {
  const ids: readonly ChoiceId[] = ['A', 'B', 'C', 'D'];
  const options = ids.map((id, index) => ({
    id,
    label: choices[index][0],
  })) as unknown as NonEmpty<LessonQuestionOptionPreview>;
  const feedbackByOption = Object.fromEntries(ids.map((id, index) => [id, choices[index][1]]));
  return {
    title,
    supportingLine,
    prompt,
    options,
    correctOptionId,
    feedbackByOption,
    explanation,
    help,
    visual,
  };
}

/** Data-only relations diagram (rows of connected nodes). */
export function relations(
  alt: string,
  textEquivalent: string,
  lanes: RelationVisualPreview['lanes'],
  caption?: string,
): RelationVisualPreview {
  return { kind: 'relations', alt, textEquivalent, lanes, caption };
}

/** Data-only accounting table (equation + reactant/product ledger rows). */
export function accounting(
  equation: string,
  rows: AccountingVisualPreview['rows'],
  alt: string,
  textEquivalent: string,
  caption?: string,
): AccountingVisualPreview {
  return { kind: 'accounting', equation, rows, alt, textEquivalent, caption };
}

/** Data-only boundary panel (what is inside vs. outside a rule/model). */
export function boundary(
  accountingLabel: string,
  accountingLines: BoundaryVisualPreview['accountingLines'],
  boundaryLabel: string,
  boundaryLines: BoundaryVisualPreview['boundaryLines'],
  alt: string,
  textEquivalent: string,
  caption?: string,
): BoundaryVisualPreview {
  return {
    kind: 'boundary',
    accountingLabel,
    accountingLines,
    boundaryLabel,
    boundaryLines,
    alt,
    textEquivalent,
    caption,
  };
}

/** Data-only lesson map (focus KC plus neighboring KC boundaries). */
export function lessonMap(
  focusKcId: string,
  items: LessonMapVisualPreview['items'],
  alt: string,
  textEquivalent: string,
  caption?: string,
): LessonMapVisualPreview {
  return { kind: 'lesson-map', focusKcId, items, alt, textEquivalent, caption };
}

export interface IntroSpec {
  readonly id: string;
  readonly title: string;
  readonly outcome: string;
  readonly details: readonly string[];
  readonly kcIds: readonly string[];
  readonly supportingLine?: string;
}

export interface CompletionSpec {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly takeaways: readonly string[];
  readonly nextStep: string;
  readonly kcIds: readonly string[];
  readonly supportingLine?: string;
}

export interface LessonSpec {
  readonly id: string;
  readonly contentVersion: string;
  readonly slug: string;
  readonly title: string;
  readonly internalTitle: string;
  readonly subject: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly requiredKcs: LessonScriptPreview['requiredKcs'];
  readonly teachingObjective: string;
  readonly intro: IntroSpec;
  readonly sections: readonly LessonSectionAuthoring[];
  readonly completion: CompletionSpec;
  readonly taskColumnWidth?: LessonPresentationPreview['taskColumnWidth'];
}

export interface AppNativeLessonBuild {
  readonly script: LessonScriptPreview;
  readonly presentation: LessonPresentationPreview;
}

/**
 * The authoring-loop factory. Expands compact lesson metadata + sections into a
 * fully-wired, validated script/presentation pair. All node-id bookkeeping and
 * the required non-empty typing live here so individual lessons stay readable.
 */
export function buildAppNativeLesson(spec: LessonSpec): AppNativeLessonBuild {
  const introNode: LessonIntroNodePreview = {
    id: spec.intro.id,
    kind: 'intro',
    kcIds: nonEmpty(spec.intro.kcIds),
    title: spec.intro.title,
    supportingLine: spec.intro.supportingLine,
    outcome: spec.intro.outcome,
    details: nonEmpty(spec.intro.details),
  };
  const completionNode: LessonCompletionNodePreview = {
    id: spec.completion.id,
    kind: 'completion',
    kcIds: nonEmpty(spec.completion.kcIds),
    title: spec.completion.title,
    supportingLine: spec.completion.supportingLine,
    summary: spec.completion.summary,
    takeaways: nonEmpty(spec.completion.takeaways),
    nextStep: spec.completion.nextStep,
  };

  const sectionNodes = spec.sections.flatMap((section) => buildSectionNodes(section));
  const collect = (suffix: Parameters<typeof sectionNodeId>[1]): NonEmpty<string> =>
    nonEmpty(spec.sections.map((section) => sectionNodeId(section, suffix)));

  const script = defineLessonScriptPreview({
    schemaVersion: 'lesson-script-preview/v2',
    status: 'internal-preview',
    id: spec.id,
    contentVersion: spec.contentVersion,
    slug: spec.slug,
    title: spec.title,
    internalTitle: spec.internalTitle,
    subject: spec.subject,
    description: spec.description,
    estimatedMinutes: spec.estimatedMinutes,
    requiredKcs: spec.requiredKcs,
    teachingObjective: spec.teachingObjective,
    nodes: nonEmpty([introNode, ...sectionNodes, completionNode]),
    modelNodeIds: collect('model'),
    workedExplanationNodeIds: collect('worked'),
    practice: {
      guidedNodeIds: collect('guided'),
      reducedSupportNodeIds: collect('reduced-support'),
      independentNodeIds: collect('independent'),
    },
    exit: {
      nearNodeIds: collect('exit-near'),
      changedNodeIds: collect('exit-changed'),
    },
    repairNodeIds: collect('repair'),
    completionNodeId: completionNode.id,
  });

  const presentation = defineLessonPresentationPreview({
    schemaVersion: 'lesson-presentation-preview/v2',
    scriptId: spec.id,
    shell: 'app-native-immersive',
    taskColumnWidth: spec.taskColumnWidth ?? 620,
    allowBackReview: true,
    screens: nonEmpty([
      {
        nodeId: spec.intro.id,
        stageLabel: 'Lesson',
        progressGroup: 'start' as const,
        treatment: 'intro' as const,
        primaryActionLabel: 'Start',
      },
      ...spec.sections.flatMap((section) => buildSectionScreens(section)),
      {
        nodeId: spec.completion.id,
        stageLabel: 'Complete',
        progressGroup: 'finish' as const,
        treatment: 'completion' as const,
        primaryActionLabel: 'Back to lessons',
      },
    ]),
  });

  return { script, presentation };
}
