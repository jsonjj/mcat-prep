import { defineDraftLesson } from './contract';

/**
 * DRAFT LESSON AUTHORING TEMPLATE
 *
 * This module is intentionally NOT imported by registry.ts, so it never
 * appears in the lesson picker. To start a lesson:
 *
 * 1. Copy this file to `lessons/<your-slug>.lesson.ts`.
 * 2. Replace every template value while keeping stable, URL-safe IDs.
 * 3. Import that module in registry.ts and pass it to registerDraftLessons().
 * 4. Bump metadata.contentVersion whenever saved preview responses should reset.
 *
 * Keep this file data-only. Do not add React, raw HTML, callbacks, planner
 * decisions, or scoring policy. The renderer deliberately owns those concerns.
 */
const draftLessonAuthoringTemplate = defineDraftLesson({
  // Incrementing this requires a renderer-supported contract migration.
  schemaVersion: 1,

  metadata: {
    // Must be unique in the registry and safe in #/draft/<slug>.
    slug: 'replace-me-template',
    // Internal authoring identifier only; do not reuse a production lesson ID.
    id: 'DRAFT-LES-REPLACE-ME',
    // Bump when an authored change invalidates locally saved responses.
    contentVersion: '0.1.0',
    // Required literal: this system never promotes content to production status.
    status: 'internal-draft',
    // Learner-facing picker and top-bar title.
    title: 'Replace with a learner-facing lesson title',
    // More precise internal name, visible in reviewer detail only.
    internalTitle: 'Replace with the internal content title',
    description: 'One sentence describing what the learner will practice.',
    subject: 'Replace with the MCAT subject area',
    estimatedMinutes: 10,
  },

  /**
   * Knowledge components are ordered. Put prerequisites first and use these
   * stable IDs in every block's kcIds. Keep each outcome observable and narrow.
   */
  knowledgeComponents: [
    {
      id: 'template-kc-1',
      title: 'Replace with the first knowledge component',
      learnerOutcome: 'Replace with what the learner should be able to do.',
    },
  ],

  /**
   * Starting checks are low-stakes route inputs for this local preview only.
   * They are not mastery evidence. Keep options learner-facing and place all
   * answer-bearing material in evaluation, where it remains out of the DOM
   * until the response is submitted.
   */
  entryChecks: [
    {
      id: 'template-entry-1',
      kcIds: ['template-kc-1'],
      title: 'Check one prerequisite',
      context: 'Optional short setup. Use plain text, never HTML.',
      prompt: 'Replace with a quick, non-consequential prerequisite question.',
      options: [
        { id: 'ready', label: 'Replace with the correct option' },
        { id: 'developing', label: 'Replace with a plausible distractor' },
        { id: 'not-sure', label: 'I am not sure yet' },
      ],
      evaluation: {
        // Must exactly match one option ID.
        correctOptionId: 'ready',
        // Include one concise feedback string for every option ID.
        feedbackByOption: {
          ready: 'Explain why this choice works.',
          developing: 'Name the specific adjustment without shaming the learner.',
          'not-sure': 'Normalize uncertainty and preview what will be built next.',
        },
        // Revealed only after submission; state the governing idea.
        explanation: 'Replace with a compact explanation of the prerequisite.',
        /**
         * Every option needs a preview route signal. The local simulation uses
         * these only to vary model length:
         * - concise: clearly ready
         * - standard: partial or mixed readiness
         * - support: explicit uncertainty or a foundational reversal
         */
        previewRouteSignalByOption: {
          ready: 'concise',
          developing: 'standard',
          'not-sure': 'support',
        },
      },
    },
  ],

  /**
   * Orientation is explanation, not a question. Use ordinary language and
   * identify the single question that organizes the lesson.
   */
  orientation: {
    title: 'Name the one idea to focus on',
    plainLanguage: [
      'Explain why this idea matters without introducing unnecessary terminology.',
      'Describe the repeatable reasoning move the learner will use.',
    ],
    focusQuestion: 'Replace with the question the learner should keep asking.',
    // These notes explain only why the preview path is shorter or longer.
    previewPathNotes: {
      concise: 'Explain what the concise preview keeps.',
      standard: 'Explain what the standard preview builds.',
      support: 'Explain what the support preview separates or makes visible.',
    },
  },

  /**
   * Each model step becomes one screen. Use routes to vary preview depth while
   * ensuring every path still has at least one explanatory step. Figures are
   * safe descriptors—not HTML. Every figure requires a complete text alt.
   */
  modelSteps: [
    {
      id: 'template-model-1',
      kcIds: ['template-kc-1'],
      title: 'Build one part of the model',
      explanation: [
        'Explain one reasoning move in plain language.',
        'Connect that move to what the learner will do in the worked example.',
      ],
      takeaway: 'State the shortest useful rule to carry forward.',
      routes: 'all',
      figure: {
        kind: 'flow',
        alt: 'Describe the full meaning and order of the flow in text.',
        caption: 'Optional visible caption that adds context without replacing the alt.',
        steps: [
          { label: 'Observe', detail: 'Name the relevant feature' },
          { label: 'Connect', detail: 'Apply the model', tone: 'accent' },
          { label: 'Conclude', detail: 'State the result', tone: 'positive' },
        ],
      },
    },
  ],

  /**
   * The worked example always appears before guided, light, solo, or exit
   * questions. Show the reasoning—not merely the final answer.
   */
  workedExample: {
    id: 'template-worked-1',
    kcIds: ['template-kc-1'],
    title: 'Work one complete example',
    setup: 'Give all information needed for a representative example.',
    steps: [
      {
        label: 'Notice',
        reasoning: 'Identify the feature that controls the first reasoning move.',
      },
      {
        label: 'Apply',
        reasoning: 'Apply the model explicitly and show the intermediate result.',
      },
    ],
    conclusion: 'State the result and why it follows from the model.',
    /**
     * Other supported figure kinds:
     * - comparison: semantic side-by-side cards
     * - svg: constrained static shapes/text; no scripts, handlers, or raw markup
     * Omit figure entirely when prose is clearer.
     */
  },

  /**
   * Each item is one screen. Assistance decreases by section:
   * guided → light → solo. Keep option IDs stable and feedback complete.
   */
  practice: {
    guided: [
      {
        id: 'template-guided-1',
        kcIds: ['template-kc-1'],
        title: 'Practice with explicit support',
        context: 'Provide the relevant setup and make the first step visible.',
        prompt: 'Ask for one application of the worked model.',
        options: [
          { id: 'a', label: 'Replace with the correct response' },
          { id: 'b', label: 'Replace with a diagnostic distractor' },
        ],
        hint: 'Point to the next reasoning move without giving the answer.',
        evaluation: {
          correctOptionId: 'a',
          feedbackByOption: {
            a: 'Confirm the reasoning, not just the selected label.',
            b: 'Name the misconception and the direction to repair it.',
          },
          explanation: 'Give the compact post-response explanation.',
          // Must match one targetedRepairs ID below.
          repairId: 'template-repair-1',
        },
      },
    ],
    light: [
      {
        id: 'template-light-1',
        kcIds: ['template-kc-1'],
        title: 'Practice with less help',
        prompt: 'Ask a parallel question with less setup.',
        options: [
          { id: 'a', label: 'Replace with the correct response' },
          { id: 'b', label: 'Replace with a diagnostic distractor' },
        ],
        hint: 'Optional lighter hint.',
        evaluation: {
          correctOptionId: 'a',
          feedbackByOption: {
            a: 'Explain why the reasoning transfers.',
            b: 'Give targeted corrective feedback.',
          },
          explanation: 'State the model-based answer after submission.',
          repairId: 'template-repair-1',
        },
      },
    ],
    solo: [
      {
        id: 'template-solo-1',
        kcIds: ['template-kc-1'],
        title: 'Apply the model independently',
        prompt: 'Ask a representative independent item without a hint.',
        options: [
          { id: 'a', label: 'Replace with the correct response' },
          { id: 'b', label: 'Replace with a diagnostic distractor' },
        ],
        evaluation: {
          correctOptionId: 'a',
          feedbackByOption: {
            a: 'Confirm the independent reasoning.',
            b: 'Identify the reasoning step that needs repair.',
          },
          explanation: 'Explain the correct application after submission.',
          repairId: 'template-repair-1',
        },
      },
    ],
  },

  /**
   * Final checks come in two forms. `near` closely resembles the taught model;
   * `changed` varies surface features or context while preserving the same KC.
   * The preview does not turn these responses into mastery evidence.
   */
  exits: {
    near: [
      {
        id: 'template-exit-near-1',
        kcIds: ['template-kc-1'],
        title: 'Check a near example',
        prompt: 'Ask a fresh item with the same representation and demand.',
        options: [
          { id: 'a', label: 'Replace with the correct response' },
          { id: 'b', label: 'Replace with a diagnostic distractor' },
        ],
        evaluation: {
          correctOptionId: 'a',
          feedbackByOption: {
            a: 'Confirm the model use.',
            b: 'Give concise targeted feedback.',
          },
          explanation: 'Explain the near-transfer answer.',
          repairId: 'template-repair-1',
        },
      },
    ],
    changed: [
      {
        id: 'template-exit-changed-1',
        kcIds: ['template-kc-1'],
        title: 'Check a changed context',
        context: 'Change a meaningful surface feature without changing the target KC.',
        prompt: 'Ask the learner to apply the same model in the changed context.',
        options: [
          { id: 'a', label: 'Replace with the correct response' },
          { id: 'b', label: 'Replace with a diagnostic distractor' },
        ],
        evaluation: {
          correctOptionId: 'a',
          feedbackByOption: {
            a: 'Explain why the model still applies.',
            b: 'Distinguish the changed surface from the unchanged reasoning.',
          },
          explanation: 'Explain the changed-context answer.',
          repairId: 'template-repair-1',
        },
      },
    ],
  },

  /**
   * A repair is inserted immediately after any incorrect practice/exit item
   * that references its ID. Keep it brief and focused on one diagnosed gap.
   */
  targetedRepairs: [
    {
      id: 'template-repair-1',
      kcIds: ['template-kc-1'],
      title: 'Repair one specific reasoning step',
      explanation: [
        'Restate the model from a different angle.',
        'Contrast the correct move with the likely misconception.',
      ],
      strategy: 'Give one concrete action to use on the next item.',
      checkYourThinking: 'Ask a short, unscored self-check question.',
    },
  ],

  /**
   * Recap consolidates the model without scores, mastery claims, or planner
   * recommendations. Keep takeaways reusable beyond the specific examples.
   */
  recap: {
    title: 'Carry the model forward',
    summary: 'Summarize the reasoning path the learner just practiced.',
    takeaways: [
      'Replace with the first portable takeaway.',
      'Replace with the second portable takeaway.',
    ],
    nextStep: 'Name a sensible next application without claiming authority.',
  },
});

export default draftLessonAuthoringTemplate;
