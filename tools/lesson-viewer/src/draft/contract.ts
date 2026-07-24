/**
 * Data-only authoring contract for draft lesson previews.
 *
 * This contract intentionally contains no React nodes, HTML strings, callbacks,
 * or planner/mastery concepts. Authors supply plain data; the generic renderer
 * owns behavior and only renders the safe structures declared below.
 */

export type NonEmptyReadonlyArray<T> = readonly [T, ...T[]];

export type DraftPreviewRoute = 'concise' | 'standard' | 'support';

export interface DraftLessonMetadata {
  /** URL-safe and unique within the draft registry. */
  readonly slug: string;
  /** Internal content identifier; never treated as a production lesson ID. */
  readonly id: string;
  /** Bump whenever persisted responses should be invalidated. */
  readonly contentVersion: string;
  readonly status: 'internal-draft';
  readonly title: string;
  readonly internalTitle: string;
  readonly description: string;
  readonly subject: string;
  readonly estimatedMinutes: number;
}

export interface DraftKnowledgeComponent {
  readonly id: string;
  readonly title: string;
  readonly learnerOutcome: string;
}

export type DraftFigureTone = 'primary' | 'accent' | 'muted' | 'positive' | 'warning';

interface DraftFigureBase {
  /** A complete text equivalent, even when a visible caption is also present. */
  readonly alt: string;
  readonly caption?: string;
}

export interface DraftFlowFigure extends DraftFigureBase {
  readonly kind: 'flow';
  readonly steps: NonEmptyReadonlyArray<{
    readonly label: string;
    readonly detail?: string;
    readonly tone?: DraftFigureTone;
  }>;
}

export interface DraftComparisonFigure extends DraftFigureBase {
  readonly kind: 'comparison';
  readonly items: NonEmptyReadonlyArray<{
    readonly heading: string;
    readonly lines: NonEmptyReadonlyArray<string>;
    readonly tone?: DraftFigureTone;
  }>;
}

interface DraftSvgShapeBase {
  readonly tone?: DraftFigureTone;
}

export type DraftSvgShape =
  | (DraftSvgShapeBase & {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly arrowEnd?: boolean;
    })
  | (DraftSvgShapeBase & {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius?: number;
      readonly filled?: boolean;
    })
  | (DraftSvgShapeBase & {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly radius: number;
      readonly filled?: boolean;
    })
  | (DraftSvgShapeBase & {
      readonly kind: 'path';
      readonly d: string;
      readonly filled?: boolean;
    })
  | (DraftSvgShapeBase & {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly anchor?: 'start' | 'middle' | 'end';
      readonly weight?: 'normal' | 'bold';
    });

/**
 * A deliberately constrained inline-SVG descriptor. It permits static shapes
 * and text only—never event handlers, scripts, foreignObject, or raw markup.
 */
export interface DraftSvgFigure extends DraftFigureBase {
  readonly kind: 'svg';
  readonly viewBox: readonly [x: number, y: number, width: number, height: number];
  readonly shapes: NonEmptyReadonlyArray<DraftSvgShape>;
}

export type DraftFigure = DraftFlowFigure | DraftComparisonFigure | DraftSvgFigure;

export interface DraftQuestionOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Answer-bearing data is deliberately separated from learner-facing options.
 * The renderer reads it to commit a response and reveal feedback, but does not
 * place it in the learner DOM before submission.
 */
export interface DraftQuestionEvaluation {
  readonly correctOptionId: string;
  readonly feedbackByOption: Readonly<Record<string, string>>;
  readonly explanation: string;
  readonly repairId?: string;
}

export interface DraftQuestionContent {
  readonly id: string;
  readonly kcIds: NonEmptyReadonlyArray<string>;
  readonly title: string;
  readonly context?: string;
  readonly prompt: string;
  readonly options: NonEmptyReadonlyArray<DraftQuestionOption>;
  readonly hint?: string;
}

export interface DraftEntryCheck extends DraftQuestionContent {
  readonly evaluation: DraftQuestionEvaluation & {
    /**
     * Preview-only route signal for each option. This cannot represent planner
     * policy, placement, mastery, or any other production decision.
     */
    readonly previewRouteSignalByOption: Readonly<Record<string, DraftPreviewRoute>>;
  };
}

export interface DraftOrientation {
  readonly title: string;
  readonly plainLanguage: NonEmptyReadonlyArray<string>;
  readonly focusQuestion: string;
  readonly previewPathNotes: Readonly<Record<DraftPreviewRoute, string>>;
}

export interface DraftModelStep {
  readonly id: string;
  readonly kcIds: NonEmptyReadonlyArray<string>;
  readonly title: string;
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly takeaway: string;
  /**
   * Route filtering changes preview length only. Every route still receives
   * orientation and the worked example before practice.
   */
  readonly routes: 'all' | NonEmptyReadonlyArray<DraftPreviewRoute>;
  readonly figure?: DraftFigure;
}

export interface DraftWorkedExample {
  readonly id: string;
  readonly kcIds: NonEmptyReadonlyArray<string>;
  readonly title: string;
  readonly setup: string;
  readonly steps: NonEmptyReadonlyArray<{
    readonly label: string;
    readonly reasoning: string;
  }>;
  readonly conclusion: string;
  readonly figure?: DraftFigure;
}

export interface DraftPracticeItem extends DraftQuestionContent {
  readonly evaluation: DraftQuestionEvaluation;
}

export interface DraftPracticeSequence {
  readonly guided: NonEmptyReadonlyArray<DraftPracticeItem>;
  readonly light: NonEmptyReadonlyArray<DraftPracticeItem>;
  readonly solo: NonEmptyReadonlyArray<DraftPracticeItem>;
}

export interface DraftExitSequence {
  /** Same representation and reasoning demand as the taught model. */
  readonly near: NonEmptyReadonlyArray<DraftPracticeItem>;
  /** Changed surface features or context, while targeting the same KCs. */
  readonly changed: NonEmptyReadonlyArray<DraftPracticeItem>;
}

export interface DraftTargetedRepair {
  readonly id: string;
  readonly kcIds: NonEmptyReadonlyArray<string>;
  readonly title: string;
  readonly explanation: NonEmptyReadonlyArray<string>;
  readonly strategy: string;
  readonly checkYourThinking: string;
  readonly figure?: DraftFigure;
}

export interface DraftRecap {
  readonly title: string;
  readonly summary: string;
  readonly takeaways: NonEmptyReadonlyArray<string>;
  readonly nextStep: string;
}

export interface DraftLesson {
  readonly schemaVersion: 1;
  readonly metadata: DraftLessonMetadata;
  /**
   * Array order is instructional order. IDs are referenced by lesson blocks
   * and should remain stable after authors begin previewing.
   */
  readonly knowledgeComponents: NonEmptyReadonlyArray<DraftKnowledgeComponent>;
  readonly entryChecks: NonEmptyReadonlyArray<DraftEntryCheck>;
  readonly orientation: DraftOrientation;
  readonly modelSteps: NonEmptyReadonlyArray<DraftModelStep>;
  readonly workedExample: DraftWorkedExample;
  readonly practice: DraftPracticeSequence;
  readonly exits: DraftExitSequence;
  readonly targetedRepairs: NonEmptyReadonlyArray<DraftTargetedRepair>;
  readonly recap: DraftRecap;
}

/**
 * Identity helper that preserves literal IDs while checking the complete
 * authoring contract at compile time. Runtime validation is intentionally not
 * presented as production content validation.
 */
export function defineDraftLesson<const Lesson extends DraftLesson>(lesson: Lesson): Lesson {
  return lesson;
}
