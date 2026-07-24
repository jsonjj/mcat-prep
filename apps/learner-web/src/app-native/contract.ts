/**
 * Closed, local-only contracts for the app-native lesson candidates.
 *
 * These values are visual-authoring inputs. They are not production
 * LessonDefinition records and they intentionally contain no React nodes,
 * callbacks, HTML strings, planner decisions, or mastery claims.
 */
export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export interface LessonKnowledgeComponentPreview {
  readonly id: string;
  readonly title: string;
  readonly learnerOutcome: string;
  readonly previewCoverage: 'complete-review-focus' | 'boundary-map-only';
}

interface LessonVisualBase {
  readonly alt: string;
  readonly textEquivalent: string;
  readonly caption?: string;
}

export interface RedoxCarrierVisualPreview extends LessonVisualBase {
  readonly kind: 'redox-carrier';
  readonly emphasis:
    | 'endpoint-overview'
    | 'electron-in'
    | 'first-oxygen'
    | 'second-oxygen'
    | 'both-oxygens'
    | 'unchanged-tail';
  readonly oxidizedLabel: string;
  readonly reducedLabel: string;
  readonly electronLabel: string;
  readonly protonLabel: string;
  readonly equation: string;
  readonly accountingLabel: string;
  readonly mechanismBoundaryLabel: string;
  readonly oxidizedBondLabels: readonly [string, string];
  readonly reducedBondLabels: readonly [string, string];
  readonly tailLabel: string;
}

export interface AccountingVisualPreview extends LessonVisualBase {
  readonly kind: 'accounting';
  readonly equation: string;
  readonly rows: NonEmptyReadonlyArray<{
    readonly label: string;
    readonly reactants: string;
    readonly products: string;
  }>;
}

export interface BoundaryVisualPreview extends LessonVisualBase {
  readonly kind: 'boundary';
  readonly accountingLabel: string;
  readonly boundaryLabel: string;
  readonly accountingLines: NonEmptyReadonlyArray<string>;
  readonly boundaryLines: NonEmptyReadonlyArray<string>;
}

export type OpticsRayStepPreview =
  | 'geometry'
  | 'first-ray'
  | 'second-ray'
  | 'intersection'
  | 'properties';

export interface OpticsRayVisualPreview extends LessonVisualBase {
  readonly kind: 'optics-rays';
  readonly step: OpticsRayStepPreview;
  readonly labels: {
    readonly axis: string;
    readonly element: string;
    readonly object: string;
    readonly nearFocus: string;
    readonly farFocus: string;
    readonly nearTwoFocus: string;
    readonly farTwoFocus: string;
    readonly image: string;
    readonly firstRay: string;
    readonly secondRay: string;
    readonly intersection: string;
  };
}

export interface LessonMapVisualPreview extends LessonVisualBase {
  readonly kind: 'lesson-map';
  readonly focusKcId: string;
  readonly items: NonEmptyReadonlyArray<{
    readonly kcId: string;
    readonly title: string;
    readonly boundaryLabel: string;
  }>;
}

export interface RelationVisualPreview extends LessonVisualBase {
  readonly kind: 'relations';
  readonly lanes: NonEmptyReadonlyArray<{
    readonly label: string;
    readonly nodes: NonEmptyReadonlyArray<{
      readonly label: string;
      readonly detail?: string;
      readonly emphasis?: 'active' | 'muted';
    }>;
    readonly links: readonly string[];
    readonly continuationLabel?: string;
  }>;
}

export interface PassageVisualPreview extends LessonVisualBase {
  readonly kind: 'passage';
  readonly title: string;
  readonly paragraphs: NonEmptyReadonlyArray<{
    readonly id: string;
    readonly sentences: NonEmptyReadonlyArray<{
      readonly id: string;
      readonly label: string;
      readonly text: string;
      readonly focused?: boolean;
      readonly annotation?: string;
    }>;
  }>;
}

export type LessonVisualPreview =
  | RedoxCarrierVisualPreview
  | AccountingVisualPreview
  | BoundaryVisualPreview
  | OpticsRayVisualPreview
  | LessonMapVisualPreview
  | RelationVisualPreview
  | PassageVisualPreview;

interface LessonNodeBase {
  readonly id: string;
  readonly kcIds: NonEmptyReadonlyArray<string>;
  readonly title: string;
  readonly supportingLine?: string;
}

export interface LessonIntroNodePreview extends LessonNodeBase {
  readonly kind: 'intro';
  readonly outcome: string;
  readonly details: NonEmptyReadonlyArray<string>;
}

export interface LessonExplanationNodePreview extends LessonNodeBase {
  readonly kind: 'explanation';
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly visual: LessonVisualPreview;
  readonly takeaway?: string;
}

export interface LessonQuestionOptionPreview {
  readonly id: string;
  readonly label: string;
}

export interface LessonQuestionEvaluationPreview {
  readonly correctOptionId: string;
  readonly feedbackByOption: Readonly<Record<string, string>>;
  readonly explanation: string;
  readonly incorrectHeading?: string;
  readonly repairNodeId?: string;
}

export type LessonQuestionStagePreview =
  | 'starting-check'
  | 'understanding-check'
  | 'guided'
  | 'reduced-support'
  | 'independent'
  | 'exit-near'
  | 'exit-changed';

export interface LessonQuestionNodePreview extends LessonNodeBase {
  readonly kind: 'question';
  readonly stage: LessonQuestionStagePreview;
  readonly prompt: string;
  readonly options: NonEmptyReadonlyArray<LessonQuestionOptionPreview>;
  readonly visual?: LessonVisualPreview;
  readonly help?: string;
  readonly evaluation: LessonQuestionEvaluationPreview;
}

export interface LessonRepairNodePreview extends LessonNodeBase {
  readonly kind: 'repair';
  readonly sourceQuestionIds: NonEmptyReadonlyArray<string>;
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly visual: LessonVisualPreview;
  readonly strategy: string;
  readonly checkYourThinking: string;
}

export interface LessonCompletionNodePreview extends LessonNodeBase {
  readonly kind: 'completion';
  readonly summary: string;
  readonly takeaways: NonEmptyReadonlyArray<string>;
  readonly nextStep: string;
}

export type LessonNodePreview =
  | LessonIntroNodePreview
  | LessonExplanationNodePreview
  | LessonQuestionNodePreview
  | LessonRepairNodePreview
  | LessonCompletionNodePreview;

export interface LessonScriptPreview {
  readonly schemaVersion: 'lesson-script-preview/v2';
  readonly status: 'internal-preview';
  readonly id: string;
  readonly contentVersion: string;
  readonly slug: string;
  readonly title: string;
  readonly internalTitle: string;
  readonly subject: string;
  readonly description: string;
  readonly estimatedMinutes: number;
  readonly requiredKcs: NonEmptyReadonlyArray<LessonKnowledgeComponentPreview>;
  readonly teachingObjective: string;
  /** Array order is the authored instructional order. */
  readonly nodes: NonEmptyReadonlyArray<LessonNodePreview>;
  readonly modelNodeIds: NonEmptyReadonlyArray<string>;
  readonly workedExplanationNodeIds: NonEmptyReadonlyArray<string>;
  readonly practice: {
    readonly guidedNodeIds: NonEmptyReadonlyArray<string>;
    readonly reducedSupportNodeIds: NonEmptyReadonlyArray<string>;
    readonly independentNodeIds: NonEmptyReadonlyArray<string>;
  };
  readonly exit: {
    readonly nearNodeIds: NonEmptyReadonlyArray<string>;
    readonly changedNodeIds: NonEmptyReadonlyArray<string>;
  };
  readonly repairNodeIds: NonEmptyReadonlyArray<string>;
  readonly completionNodeId: string;
}

export type LessonScreenTreatmentPreview =
  | 'intro'
  | 'visual-model'
  | 'question'
  | 'repair'
  | 'completion';

export interface LessonPresentationScreenPreview {
  readonly nodeId: string;
  readonly stageLabel: string;
  readonly progressGroup: 'start' | 'learn' | 'practice' | 'check' | 'finish';
  readonly treatment: LessonScreenTreatmentPreview;
  readonly primaryActionLabel?: string;
}

export interface LessonPresentationPreview {
  readonly schemaVersion: 'lesson-presentation-preview/v2';
  readonly scriptId: string;
  readonly shell: 'app-native-immersive';
  readonly taskColumnWidth: 560 | 580 | 600 | 620 | 640;
  readonly allowBackReview?: boolean;
  /**
   * Screen order is presentation order. Repair screens remain latent until a
   * named source question is submitted incorrectly.
   */
  readonly screens: NonEmptyReadonlyArray<LessonPresentationScreenPreview>;
}

export function defineLessonScriptPreview<const Script extends LessonScriptPreview>(
  script: Script,
): Script {
  return script;
}

export function defineLessonPresentationPreview<
  const Presentation extends LessonPresentationPreview,
>(presentation: Presentation): Presentation {
  return presentation;
}

export function validateLessonPreviewPair(
  script: LessonScriptPreview,
  presentation: LessonPresentationPreview,
): void {
  if (presentation.scriptId !== script.id) {
    throw new Error(`Presentation ${presentation.scriptId} does not match script ${script.id}.`);
  }

  const nodeIds = new Set(script.nodes.map((node) => node.id));
  const screenIds = presentation.screens.map((screen) => screen.nodeId);
  const unknownScreenId = screenIds.find((id) => !nodeIds.has(id));
  if (unknownScreenId !== undefined) {
    throw new Error(`Presentation references unknown node ${unknownScreenId}.`);
  }
  if (new Set(screenIds).size !== screenIds.length) {
    throw new Error(`Presentation for ${script.id} contains duplicate screen nodes.`);
  }

  const declaredIds = [
    ...script.modelNodeIds,
    ...script.workedExplanationNodeIds,
    ...script.practice.guidedNodeIds,
    ...script.practice.reducedSupportNodeIds,
    ...script.practice.independentNodeIds,
    ...script.exit.nearNodeIds,
    ...script.exit.changedNodeIds,
    ...script.repairNodeIds,
    script.completionNodeId,
  ];
  const unknownDeclaredId = declaredIds.find((id) => !nodeIds.has(id));
  if (unknownDeclaredId !== undefined) {
    throw new Error(`Script ${script.id} declares unknown node ${unknownDeclaredId}.`);
  }
}
