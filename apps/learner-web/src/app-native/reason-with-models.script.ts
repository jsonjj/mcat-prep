import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const MODEL_KC = 'V3-KC-991992';

function predictionMap(caption?: string) {
  return relations(
    'Turning a model rule into a prediction',
    'To predict a consequence, state the model rule, apply it to the specific setup, name the direction and endpoint, and check that the setup stays inside the model assumptions.',
    [
      {
        label: 'Apply the rule',
        nodes: [
          { label: 'Model rule', detail: 'water → higher solute', emphasis: 'active' },
          { label: 'This setup', detail: 'which side is higher?' },
          { label: 'Prediction', detail: 'direction + endpoint' },
        ],
        links: ['to', 'gives'],
      },
      {
        label: 'Stay in scope',
        continuationLabel: 'a prediction is only as good as its assumptions',
        nodes: [
          { label: 'Assumptions', detail: 'membrane blocks solute' },
          { label: 'In scope?', detail: 'check before extending', emphasis: 'active' },
          { label: 'Revise if failed', detail: 'not just re-predict' },
        ],
        links: ['then', 'else'],
      },
    ],
    caption,
  );
}

const modelSection: LessonSectionAuthoring = {
  key: 'model-predict',
  kcId: MODEL_KC,
  stageLabel: 'Model prediction',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Apply the osmosis model',
    'Model: water crosses a semipermeable membrane toward the side with higher solute concentration until the two sides are equal. A red blood cell is placed in a hypertonic solution (higher solute outside than inside). What does the model predict?',
    [
      ['Water leaves the cell, so it shrinks.', 'Correct. Solute is higher outside, so water moves out toward it and the cell loses volume.'],
      ['Water enters the cell, so it swells.', 'Water moves toward higher solute, which is outside here, so it leaves rather than enters.'],
      ['Solute leaves the cell to balance concentrations.', 'The membrane is semipermeable to water; the model moves water, not solute.'],
      ['Nothing happens, because the membrane blocks all movement.', 'The membrane passes water; the model predicts net water flow toward the higher solute side.'],
    ],
    'A',
    'A prediction applies the model rule to the specific case. Solute is higher outside, so water moves out; the cell loses water and shrinks.',
    'State the rule, then ask which side has the higher solute concentration.',
    'To predict, apply the model rule to the exact setup.',
    predictionMap('Water moves toward higher solute — here, out of the cell.'),
  ),
  model: {
    title: 'Prediction is rule plus setup',
    supportingLine: 'Name the direction, the endpoint, and the assumptions.',
    explanation: [
      'A scientific model is a rule that links conditions to consequences. To predict, you take the rule and apply it to the specific arrangement in front of you, then state both the direction of change and where it stops.',
      'Every prediction rests on the model\u2019s assumptions. The osmosis model assumes the membrane passes water but not solute. If a prediction is wrong, the useful next step is to check whether the setup violated an assumption, not simply to guess again.',
    ],
    visual: predictionMap('Rule + setup → direction and endpoint, within the model\u2019s assumptions.'),
    takeaway: 'A prediction is the model rule applied to one case, bounded by the model\u2019s assumptions.',
  },
  understandingCheck: question(
    'Predict the opposite case',
    'The same cell is now placed in a hypotonic solution (lower solute outside than inside). What does the osmosis model predict?',
    [
      ['Water enters the cell, so it swells.', 'Correct. Solute is higher inside, so water moves in toward it and the cell gains volume.'],
      ['Water leaves the cell, so it shrinks.', 'Water moves toward the higher solute side, which is now the inside.'],
      ['No net movement occurs.', 'The concentrations differ, so the model predicts net flow until they equalize.'],
      ['The solute diffuses out of the cell.', 'The model governs water movement across a solute-impermeable membrane.'],
    ],
    'A',
    'Now the interior has the higher solute concentration, so water moves inward and the cell swells until concentrations equalize.',
    'Reapply the rule with the higher-solute side now inside.',
  ),
  worked: {
    title: 'Work the equilibrium case',
    supportingLine: 'The endpoint is where the driving difference disappears.',
    explanation: [
      'Place the cell in an isotonic solution, where inside and outside solute concentrations are already equal. The model rule finds no concentration difference to drive net water movement.',
      'So the prediction is no net change in cell volume. This also shows the general endpoint: net water flow continues only until the two sides reach equal concentration, then stops.',
    ],
    visual: relations(
      'Isotonic prediction',
      'With equal solute concentrations inside and outside, the model predicts no net water movement and no volume change.',
      [
        {
          label: 'Equal concentrations',
          nodes: [
            { label: 'Inside = outside', detail: 'no gradient' },
            { label: 'No net flow', detail: 'endpoint reached', emphasis: 'active' },
            { label: 'Volume steady', detail: 'no change' },
          ],
          links: ['so', 'so'],
        },
      ],
    ),
    takeaway: 'What to notice: the endpoint is equal concentrations, where the driving difference is zero.',
  },
  guided: question(
    'Predict the flow direction',
    'Two compartments are separated by a water-permeable, solute-impermeable membrane: side X is 5% solute and side Y is 10% solute. Which way does water flow?',
    [
      ['From X to Y, toward the higher solute concentration.', 'Correct. Water moves toward side Y until the concentrations equalize.'],
      ['From Y to X, toward the lower solute concentration.', 'Water moves toward higher solute, not lower.'],
      ['No net flow, because both sides have solute.', 'A concentration difference drives net flow even when both sides contain solute.'],
      ['Solute flows from Y to X.', 'The membrane blocks solute; the model moves water.'],
    ],
    'A',
    'The 10% side has higher solute, so water flows from X (5%) to Y (10%) until the concentrations match.',
    'Higher solute side pulls water toward it.',
  ),
  reducedSupport: question(
    'Predict the endpoint',
    'When does the osmosis model predict that net water movement stops between two compartments?',
    [
      ['When the solute concentrations on both sides are equal.', 'Correct. With no concentration difference, there is no net driving force.'],
      ['When all the water has moved to one side.', 'Net flow stops at equal concentrations, well before one side is emptied.'],
      ['When the solute fully dissolves.', 'The endpoint is about equal concentration, not dissolving more solute.'],
      ['Water movement never stops.', 'The model predicts a clear endpoint at equal concentrations.'],
    ],
    'A',
    'Net movement continues only while a concentration difference exists. It stops when both sides reach the same solute concentration.',
    'The driving force is the difference; it ends when the difference does.',
  ),
  independent: question(
    'Apply to a plant cell',
    'A plant cell with high internal solute is placed in pure water (no solute). Using the osmosis model, what is predicted before the rigid wall limits expansion?',
    [
      ['Water enters the cell, which swells.', 'Correct. Pure water has the lowest possible solute, so water moves inward toward the higher-solute interior.'],
      ['Water leaves the cell, which shrinks.', 'Water moves toward higher solute, which is inside, so it enters.'],
      ['No movement, because pure water has no solute to move.', 'Water still moves toward the higher-solute side even when the other side is pure water.'],
      ['Solute leaves the cell into the water.', 'The membrane is modeled as solute-impermeable, so the model moves water.'],
    ],
    'A',
    'Pure water is maximally hypotonic, so water moves inward toward the cell\u2019s higher solute concentration, and the cell swells (until the wall resists).',
  ),
  near: question(
    'Predict a red-cell outcome',
    'A red blood cell is placed in concentrated salt water. What does the osmosis model predict?',
    [
      ['The cell shrinks as water exits toward the higher external solute.', 'Correct. External solute is higher, so water leaves and the cell shrivels.'],
      ['The cell swells as water enters.', 'Water moves out toward the higher external solute, not in.'],
      ['The cell stays the same size.', 'A large concentration difference drives net water movement.'],
      ['Salt moves into the cell to balance.', 'The model moves water across a solute-impermeable membrane.'],
    ],
    'A',
    'Concentrated salt water is hypertonic, so water exits the cell toward the higher external solute and the cell shrinks.',
  ),
  changed: question(
    'A failed prediction',
    'A cell is placed in a hypotonic solution, but instead of swelling it barely changes volume. Experiments show the solute here can also cross the membrane. What is the best interpretation?',
    [
      [
        'A model assumption (solute-impermeable membrane) was violated, so the model must be revised, not just re-applied.',
        'Correct. The prediction failed because the setup broke an assumption; that calls for revising the model\u2019s scope.',
      ],
      [
        'The osmosis rule is simply wrong in all cases.',
        'The rule holds where its assumptions do; the issue is a violated assumption, not a universally false rule.',
      ],
      [
        'The prediction was fine and the measurement must be an error.',
        'When a documented assumption is broken, revising the model is more warranted than dismissing the data.',
      ],
      [
        'The cell has no membrane.',
        'The membrane exists but is permeable to this solute, which is exactly the violated assumption.',
      ],
    ],
    'A',
    'Predictions are conditional on assumptions. Here the membrane passes the solute, violating the model\u2019s assumption, so the correct response is to revise the model\u2019s scope rather than force the original prediction.',
  ),
  repair: {
    title: 'State the rule, then check the scope',
    supportingLine: 'Most misses come from reversing the rule or ignoring assumptions.',
    explanation: [
      'Write the model rule explicitly, identify which side of the setup meets each condition, then state the predicted direction and endpoint.',
      'Before trusting the prediction, confirm the setup satisfies the model\u2019s assumptions. If a result contradicts a careful prediction, look for a violated assumption and revise the model rather than merely re-guessing.',
    ],
    visual: predictionMap('Apply the rule to the case, then verify the assumptions before trusting it.'),
    strategy: 'Rule → setup → direction and endpoint → assumption check.',
    checkYourThinking: 'Did you apply the rule in the right direction, and does the setup satisfy the model\u2019s assumptions?',
  },
  recap: {
    title: 'You can predict from a model',
    explanation: [
      'You applied a model rule to specific setups, stated directions and endpoints, and recognized that a failed prediction points to a violated assumption—and to revising the model, not abandoning reasoning.',
    ],
    visual: predictionMap('Prediction is rule-plus-setup, always bounded by assumptions.'),
    takeaway: 'Predict by applying the rule to the case; a failed prediction usually flags a broken assumption.',
  },
};

const { script: REASON_WITH_MODELS_SCRIPT, presentation: REASON_WITH_MODELS_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-275615',
    contentVersion: 'app-native-models-v1.0.0',
    slug: 'reason-with-models',
    title: 'Predict consequences from scientific models',
    internalTitle: 'Scientific model prediction and evaluation · app-native candidate',
    subject: 'Scientific inquiry',
    description:
      'Apply a scientific model\u2019s rule to specific setups to predict direction and endpoint, and recognize when a failed prediction signals a violated assumption.',
    estimatedMinutes: 14,
    requiredKcs: [
      {
        id: MODEL_KC,
        title: 'Predict consequences from scientific models',
        learnerOutcome:
          'Apply a model\u2019s rule to a new situation to predict the direction and endpoint of change.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-814479',
        title: 'Evaluate scientific explanations and causal arguments',
        learnerOutcome: 'Recall that predictions test the causal claims a model makes.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-215450',
        title: 'Reconcile theories with observations and findings',
        learnerOutcome: 'See that a failed prediction can prompt model revision.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given a stated model and a new setup, predict the direction and endpoint of change and judge whether the setup stays within the model\u2019s assumptions.',
    intro: {
      id: 'model-intro',
      title: 'Predict consequences from scientific models',
      outcome: 'Apply a model rule to new setups and know when its assumptions no longer hold.',
      details: [
        'Use a simple osmosis model to predict direction and endpoint, then test the limits of the prediction.',
      ],
      kcIds: [MODEL_KC],
    },
    sections: [modelSection],
    completion: {
      id: 'model-complete',
      title: 'You can turn models into predictions',
      summary:
        'You applied a model rule to several setups, stated directions and endpoints, and interpreted a failed prediction as a violated assumption.',
      takeaways: [
        'A prediction is the model rule applied to a specific setup.',
        'State both the direction of change and the endpoint.',
        'A failed prediction usually means an assumption was violated—revise the model.',
      ],
      nextStep: 'Use prediction and revision to evaluate causal arguments in research passages.',
      kcIds: [MODEL_KC],
    },
  });

export { REASON_WITH_MODELS_SCRIPT, REASON_WITH_MODELS_PRESENTATION };
