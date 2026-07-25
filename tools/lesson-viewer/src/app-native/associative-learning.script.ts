import type { LessonQuestionOptionPreview, RelationVisualPreview } from './contract';
import { defineLessonScriptPreview } from './contract';
import type { LessonSectionAuthoring, SectionQuestionAuthoring } from './section-authoring';
import { buildSectionNodes, sectionNodeId } from './section-authoring';

type ChoiceId = 'A' | 'B' | 'C' | 'D';
type ChoiceSet = readonly [
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
  readonly [string, string],
];

function question(
  title: string,
  prompt: string,
  choices: ChoiceSet,
  correctOptionId: ChoiceId,
  explanation: string,
  help?: string,
  supportingLine?: string,
  visual?: RelationVisualPreview,
): SectionQuestionAuthoring {
  const ids: readonly ChoiceId[] = ['A', 'B', 'C', 'D'];
  const options = ids.map((id, index) => ({
    id,
    label: choices[index][0],
  })) as unknown as readonly [
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
    LessonQuestionOptionPreview,
  ];
  return {
    title,
    prompt,
    options,
    correctOptionId,
    feedbackByOption: Object.fromEntries(ids.map((id, index) => [id, choices[index][1]])),
    explanation,
    help,
    supportingLine,
    visual,
  };
}

function relations(
  alt: string,
  textEquivalent: string,
  lanes: RelationVisualPreview['lanes'],
  caption?: string,
): RelationVisualPreview {
  return { kind: 'relations', alt, textEquivalent, lanes, caption };
}

const CAUSAL_MAP = relations(
  'Three distinct learning relations with directional arrows',
  'In habituation, repeating the same stimulus is followed by a smaller response. In classical conditioning, a cue predicts a following event that elicits a response. In operant conditioning, an action produces a consequence that changes the future action.',
  [
    {
      label: 'Repetition only',
      nodes: [
        { label: 'Same stimulus', detail: 'presented repeatedly' },
        { label: 'Smaller response', detail: 'to that stimulus' },
      ],
      links: ['response falls across trials'],
    },
    {
      label: 'Classical pairing',
      nodes: [
        { label: 'Predictive cue' },
        { label: 'Following event' },
        { label: 'Elicited response' },
      ],
      links: ['predicts', 'elicits'],
    },
    {
      label: 'Operant contingency',
      nodes: [{ label: 'Action' }, { label: 'Consequence' }, { label: 'Future action' }],
      links: ['produces', 'changes'],
    },
  ],
  'Start by locating the causal arrow before naming the learning process.',
);

const ASSOCIATIVE_SECTIONS: readonly LessonSectionAuthoring[] = [
  {
    key: 'learning-habituation',
    kcId: 'V3-KC-337354',
    stageLabel: 'Habituation',
    nextActionLabel: 'Build a predictive pairing',
    starting: question(
      'Track the original response',
      'A harmless tone repeats and orienting falls from 9 to 3. A novel light flashes, then the original tone produces an orienting score of 8. Which pattern is best supported?',
      [
        [
          'Habituation followed by dishabituation.',
          'Correct. Repetition reduced responding, and the original response rebounded after a different stimulus.',
        ],
        [
          'Sensory adaptation followed by sensory recovery.',
          'No sensory-system measure shows reduced tone detection; the decisive measure is behavioral response to the original tone.',
        ],
        ['Classical acquisition.', 'No second event was paired with the tone.'],
        ['Operant extinction.', 'No action produced a consequence.'],
      ],
      'A',
      'Habituation is a learned decrease in responding to repetition; dishabituation is renewed responding to that original stimulus after a different event.',
      'Follow the response to the original tone before and after the light.',
      'Distinguish repetition from pairing and consequences.',
      CAUSAL_MAP,
    ),
    model: {
      title: 'Locate where the decrease occurred',
      explanation: [
        'Habituation is a stimulus-specific decrease in behavior across repeated presentations. If the sensory system still detects the stimulus and the response system can still act, the smaller behavior is not well explained by sensory adaptation or fatigue.',
        'Dishabituation requires an extra operation: present a different stimulus, then retest the original. A strong response to the novel event alone shows novelty, not recovery of the habituated response.',
      ],
      visual: relations(
        'Habituation and dishabituation sequence',
        'The same stimulus produces smaller responses across repetitions. After a different stimulus, the original stimulus is presented again and its response rebounds.',
        [
          {
            label: 'Habituation',
            nodes: [
              { label: 'Original tone', detail: 'response 9' },
              { label: 'Original tone', detail: 'response 6' },
              { label: 'Original tone', detail: 'response 3', emphasis: 'active' },
            ],
            links: ['repeat', 'repeat'],
          },
          {
            label: 'Dishabituation check',
            nodes: [
              { label: 'Different light', detail: 'brief change' },
              { label: 'Original tone', detail: 'present again' },
              { label: 'Original response', detail: 'rebounds to 8', emphasis: 'active' },
            ],
            links: ['then retest', 'measure'],
          },
        ],
      ),
      takeaway:
        'Measure the original response after the change; do not use the response to novelty as the dishabituation result.',
    },
    understandingCheck: question(
      'Check the required retest',
      'Response to a repeated tone falls. A novel light then produces a strong response, but the tone is never presented again. What is supported?',
      [
        [
          'Habituation may be supported, but dishabituation has not been demonstrated.',
          'Correct. Recovery must be measured with the original tone.',
        ],
        [
          'Dishabituation is proven by the response to the light.',
          'A novelty response is not recovery of the habituated response.',
        ],
        ['Classical acquisition occurred.', 'No tone–light predictive pairing is described.'],
        ['Operant extinction occurred.', 'No action has lost a consequence.'],
      ],
      'A',
      'Dishabituation adds a specific final operation: after the different event, present the original stimulus again and measure whether its response rebounds.',
      'Identify which stimulus produced the final measured response.',
    ),
    worked: {
      title: 'Read the complete trial structure',
      explanation: [
        'Head-turn probability to one desk vibration falls from 92% to 18% across five trials. Tactile detection stays above 95%, and participants still turn toward their name, so broad sensory loss and motor fatigue are poor explanations.',
        'After a lamp flash, the same desk vibration produces a 71% head-turn rate. The original stimulus was retested and its response recovered, supporting habituation followed by dishabituation.',
      ],
      visual: relations(
        'Worked habituation trace',
        'Response to the desk vibration falls from 92 percent to 18 percent while sensing and turning remain intact. After a lamp flash, response to that same vibration returns to 71 percent.',
        [
          {
            label: 'Original vibration',
            nodes: [
              { label: 'Trial 1', detail: '92%' },
              { label: 'Trial 3', detail: '55%' },
              { label: 'Trial 5', detail: '18%' },
            ],
            links: ['falls', 'falls'],
          },
          {
            label: 'Causal checks',
            nodes: [
              { label: 'Detection intact', detail: 'above 95%' },
              { label: 'Lamp flash', detail: 'different event' },
              { label: 'Original vibration', detail: '71%', emphasis: 'active' },
            ],
            links: ['then', 'retest'],
          },
        ],
      ),
      takeaway:
        'What to notice: intact sensing plus stimulus-specific decline locates the change in learned responding.',
    },
    guided: question(
      'Locate the final measurement',
      'Skin-conductance response to one repeated visual pulse falls 9, 7, 5, 4. A novel tone occurs. The next original pulse produces 8. The final increase is:',
      [
        [
          'Dishabituation.',
          'Correct. Response to the original stimulus recovered after another stimulus.',
        ],
        [
          'Generalization.',
          'Generalization is responding to a similar new cue, not renewed response to the original.',
        ],
        ['Acquisition.', 'No predictive pairing was trained.'],
        ['Operant reinforcement.', 'No action–consequence contingency appears.'],
      ],
      'A',
      'The decisive comparison is the original pulse before and after the different tone.',
      'Identify which stimulus produced the final response.',
    ),
    reducedSupport: question(
      'Recognize habituation without overclaiming',
      'Response to one repeated vibration falls while detection remains stable and response to a different vibration remains strong. No novel-event retest occurs. What is supported?',
      [
        [
          'Habituation, but not yet dishabituation.',
          'Correct. The decrement is stimulus-specific with intact sensing, but original-response recovery was not tested.',
        ],
        ['Dishabituation.', 'A different event followed by a retest of the original is missing.'],
        ['Sensory adaptation.', 'Detection remains stable and the decline is stimulus-specific.'],
        ['Classical conditioning.', 'No two-event predictive pairing exists.'],
      ],
      'A',
      'Habituation and dishabituation are related but distinct claims; the latter needs the change-and-retest operation.',
    ),
    independent: question(
      'Identify sensory-level evidence',
      'Receptor output to a constant odor falls while the odor continues, and no behavioral control or stimulus-specific retest is reported. Which explanation is closest?',
      [
        [
          'Sensory adaptation.',
          'Correct. The measured decrement occurs in sensory responsiveness itself.',
        ],
        ['Habituation is established.', 'A behavioral learning change has not been isolated.'],
        [
          'Dishabituation is established.',
          'No different stimulus and original-response recovery appear.',
        ],
        ['Operant extinction.', 'No action loses its consequence.'],
      ],
      'A',
      'Classify the level of the measured change: sensory input, behavior to repetition, cue prediction, or action consequence.',
    ),
    near: question(
      'Check a repetition sequence',
      'Startle to the same weak chair pulse falls 14, 11, 8, 5. A door chime occurs. The next original chair pulse produces 12. What occurred?',
      [
        [
          'Habituation followed by dishabituation.',
          'Correct. Repetition reduced the original response, which then rebounded after a different event.',
        ],
        [
          'Sensory adaptation followed by spontaneous recovery.',
          'No rest interval or direct sensory measure is given.',
        ],
        ['Classical acquisition.', 'The chime was not paired as a predictor of the pulse.'],
        ['Negative reinforcement.', 'No action removes a consequence.'],
      ],
      'A',
      'The original pulse is both the habituated stimulus and the stimulus used to measure recovery.',
    ),
    changed: question(
      'Audit a dishabituation claim',
      'A report shows declining response to icon A and a strong response to novel sound B, then claims dishabituation without presenting A again. What is missing?',
      [
        [
          'Present icon A again and show that its response recovered.',
          'Correct. Dishabituation is recovery to the original stimulus.',
        ],
        [
          'Show an even stronger response to sound B.',
          'Novelty response does not replace the original-stimulus retest.',
        ],
        ['Pair icon A with a reward.', 'That adds a different learning relation.'],
        ['Remove icon A permanently.', 'Without a retest, recovery cannot be measured.'],
      ],
      'A',
      'A change stimulus is part of the operation, but the dependent measure remains the response to the original stimulus.',
    ),
    repair: {
      title: 'Keep stimulus, response, and measurement level separate',
      explanation: [
        'Write the repeated stimulus and the measured response on different lines. Then ask whether the evidence shows reduced sensing or reduced behavior with sensing intact.',
        'For dishabituation, add a different event and a final box for the original stimulus. Only a rebound in that original response completes the pattern.',
      ],
      visual: relations(
        'Habituation decision repair',
        'Stable sensing with reduced behavior supports habituation. A different event must be followed by the original stimulus, and the original response must rebound for dishabituation.',
        [
          {
            label: 'Locate the decrement',
            nodes: [
              { label: 'Sensing', detail: 'stable' },
              { label: 'Original behavior', detail: 'decreases', emphasis: 'active' },
            ],
            links: ['while'],
          },
          {
            label: 'Verify recovery',
            nodes: [
              { label: 'Different event' },
              { label: 'Original stimulus' },
              { label: 'Original response', detail: 'rebounds', emphasis: 'active' },
            ],
            links: ['then', 'measure'],
          },
        ],
      ),
      strategy: 'Circle the original stimulus each time it appears and compare only its responses.',
      checkYourThinking:
        'Did the evidence locate the decline in behavior, and was the original stimulus actually retested?',
    },
    recap: {
      title: 'Repetition is now separate from association',
      explanation: [
        'Habituation needs one repeated stimulus and a smaller stimulus-specific response; dishabituation adds a different event and recovery to the original. Next, two events will be paired so one predicts the other.',
      ],
      visual: CAUSAL_MAP,
      takeaway:
        'Before using conditioning vocabulary, verify that the record contains the required causal relation.',
    },
  },
  {
    key: 'learning-classical',
    kcId: 'V3-KC-564671',
    stageLabel: 'Classical conditioning',
    nextActionLabel: 'Connect actions to consequences',
    starting: question(
      'Map stimuli and responses',
      'A green square initially produces no blink. An air puff naturally produces a blink. After square → puff pairings, the square alone produces an anticipatory blink. Which map is correct?',
      [
        [
          'Square NS→CS; puff US; blink to puff UR; blink to square CR.',
          'Correct. Labels follow event type and whether the relation was learned.',
        ],
        [
          'Square US; puff CS; blink to puff CR; blink to square UR.',
          'The puff naturally elicits the response; the square gains predictive function.',
        ],
        [
          'Square remains NS after training.',
          'A cue that elicits a learned response after pairing functions as a CS.',
        ],
        ['The blink was operantly reinforced.', 'No voluntary blink produces a consequence.'],
      ],
      'A',
      'Stimulus labels describe events; response labels describe reactions. The cue changes from neutral to conditioned when it gains predictive control.',
      'Separate stimuli from responses, then ask which relation required learning.',
      'One event predicts another; no action earns an outcome.',
      CAUSAL_MAP,
    ),
    model: {
      title: 'A pairing makes one event predictive',
      explanation: [
        'Before learning, the unconditioned stimulus (US) naturally elicits an unconditioned response (UR). During acquisition, a neutral stimulus (NS) reliably precedes the US; after learning, that cue is a conditioned stimulus (CS) that elicits a conditioned response (CR).',
        'NS, US, and CS are stimuli; UR and CR are responses. The same cue can change from NS to CS because its function changes, but a stimulus never turns into a response.',
      ],
      visual: relations(
        'Classical-conditioning timeline',
        'Before learning, an air puff naturally causes a reflex blink. During learning, a square predicts the puff. After learning, the square alone causes an anticipatory blink.',
        [
          {
            label: 'Before learning',
            nodes: [
              { label: 'US', detail: 'air puff' },
              { label: 'UR', detail: 'reflex blink' },
            ],
            links: ['naturally elicits'],
          },
          {
            label: 'During acquisition',
            nodes: [
              { label: 'NS → CS', detail: 'square cue', emphasis: 'active' },
              { label: 'US', detail: 'air puff' },
            ],
            links: ['predicts'],
          },
          {
            label: 'After learning',
            nodes: [
              { label: 'CS', detail: 'square alone' },
              { label: 'CR', detail: 'anticipatory blink', emphasis: 'active' },
            ],
            links: ['elicits'],
          },
        ],
      ),
      takeaway:
        'Classical conditioning changes what a cue predicts, not what consequence an action produces.',
    },
    understandingCheck: question(
      'Check cue and response roles',
      'After square → puff pairings, the square alone produces an anticipatory blink. Which labels fit that final trial?',
      [
        [
          'The square is the CS and the anticipatory blink is the CR.',
          'Correct. The cue gained predictive function, and its learned response is conditioned.',
        ],
        [
          'The square is the CR and the blink is the CS.',
          'This reverses the stimulus and response roles.',
        ],
        [
          'The square remains neutral because no puff appears on the final trial.',
          'Its ability to elicit the learned response shows that it now functions as a CS.',
        ],
        [
          'The blink is operantly reinforced.',
          'The blink does not produce a consequence in this sequence.',
        ],
      ],
      'A',
      'Classical labels follow function and trial order. The earlier cue becomes a conditioned stimulus after it predicts the naturally effective event; the response it later elicits is the conditioned response.',
      'Separate the event presented from the response measured.',
    ),
    worked: {
      title: 'Follow acquisition, extinction, and return',
      explanation: [
        'Across square → puff blocks, anticipatory blinking rises from 0 to 8 of 10 trials: acquisition. Then square-alone trials reduce the CR to zero: extinction changes the learned prediction because the expected puff no longer follows.',
        'After a 24-hour rest, the square alone produces 3 blinks without new pairing: spontaneous recovery. A similar pentagon initially evokes blinking through generalization; differential training with square → puff and blue square → no puff produces discrimination.',
      ],
      visual: relations(
        'Classical-conditioning phases',
        'Pairing raises conditioned responding, cue-alone trials lower it, and a partial response returns after rest. Similar cues may generalize until different outcomes train discrimination.',
        [
          {
            label: 'Across time',
            nodes: [
              { label: 'Acquisition', detail: 'CS → US; CR rises', emphasis: 'active' },
              { label: 'Extinction', detail: 'CS alone; CR falls' },
              { label: 'Rest', detail: 'no training' },
              { label: 'Recovery', detail: 'small CR returns' },
            ],
            links: ['then', 'then', 'probe'],
          },
          {
            label: 'Across cues',
            nodes: [
              { label: 'Similar cue', detail: 'respond' },
              { label: 'Paired cue', detail: 'US follows' },
              { label: 'Unpaired cue', detail: 'US absent' },
              { label: 'Discrimination', detail: 'respond selectively' },
            ],
            links: ['generalize', 'contrast with', 'learn'],
          },
        ],
      ),
      takeaway:
        'What to notice: each term is defined by the trial sequence, not by a single response level.',
    },
    guided: question(
      'Label a fresh pairing',
      'A blue triangle initially produces no salivation. A tart droplet naturally produces salivation. After triangle → droplet pairings, the triangle alone produces salivation.',
      [
        [
          'Triangle NS→CS; droplet US; droplet salivation UR; triangle salivation CR.',
          'Correct. The map separates stimuli from responses and learned from unlearned functions.',
        ],
        ['Triangle UR; droplet CR.', 'The triangle and droplet are stimuli, not responses.'],
        ['Droplet CS because it occurs second.', 'Its natural eliciting function makes it the US.'],
        ['Positive reinforcement.', 'No action produces the droplet.'],
      ],
      'A',
      'Label the naturally effective event first, then identify the cue whose predictive function changed.',
      'Start with what naturally elicits the response.',
    ),
    reducedSupport: question(
      'Identify extinction',
      'After acquisition, a purple cue is repeatedly presented without the puff and conditioned blinking declines. This is:',
      [
        ['Extinction.', 'Correct. CS-alone trials reduce conditioned responding.'],
        ['Acquisition.', 'Acquisition strengthens the relation through pairing.'],
        ['Spontaneous recovery.', 'Recovery requires a rest after extinction.'],
        [
          'Dishabituation.',
          'The decline depends on a learned CS–US relation, not repetition alone.',
        ],
      ],
      'A',
      'Extinction is new learning that the CS no longer predicts the US; it is not erasure proved by one low response.',
    ),
    independent: question(
      'Recognize spontaneous recovery',
      'A cue’s CR reaches zero during extinction. Forty-eight hours pass. The cue alone again produces a small CR, with no new cue–US pairing. What occurred?',
      [
        ['Acquisition.', 'No new pairing occurred.'],
        ['Extinction.', 'Extinction happened before the rest.'],
        [
          'Spontaneous recovery.',
          'Correct. An extinguished CR partially returned after time passed.',
        ],
        ['Discrimination.', 'Only one cue is involved.'],
      ],
      'C',
      'Spontaneous recovery is the return of conditioned responding after extinction and a rest interval without retraining.',
    ),
    near: question(
      'Read differential training',
      'A high tone is followed by food and a low tone is not. Responding becomes strong to the high tone and weak to the low tone. This pattern is:',
      [
        [
          'Discrimination.',
          'Correct. Different consequences train selective responding to the cues.',
        ],
        [
          'Generalization.',
          'Generalization would be similar responding without this learned distinction.',
        ],
        ['Habituation.', 'The change depends on cue–outcome differences, not repetition alone.'],
        ['Operant punishment.', 'No action is followed by a response-decreasing consequence.'],
      ],
      'A',
      'Discrimination emerges when cues predict different outcomes; generalization is responding across similarity before or despite that distinction.',
    ),
    changed: question(
      'Trace higher-order conditioning',
      'A tone already predicts a puff. A striped card is repeatedly followed by the tone but never directly by the puff. The card later evokes anticipatory blinking. What best explains this?',
      [
        [
          'Higher-order conditioning.',
          'Correct. The new cue gained control through an established CS.',
        ],
        ['Generalization.', 'The card need not resemble the tone.'],
        ['Spontaneous recovery.', 'No extinction-and-rest sequence occurs.'],
        ['Negative reinforcement.', 'No action removes an event.'],
      ],
      'A',
      'An established conditioned stimulus can support learning about a new cue even when that new cue is not paired directly with the US.',
    ),
    repair: {
      title: 'Label by function, then follow the timeline',
      explanation: [
        'First separate events from responses. Identify what naturally elicits a response, then identify the earlier cue whose predictive function changes through pairing.',
        'For process terms, write the sequence: pairing for acquisition, CS alone for extinction, extinction plus rest for spontaneous recovery, and different cue outcomes for discrimination.',
      ],
      visual: relations(
        'Classical-conditioning repair',
        'Event type and trial order determine the labels: US naturally elicits UR; a cue paired before the US becomes CS and elicits CR; later processes depend on the sequence of paired, unpaired, and rest phases.',
        [
          {
            label: 'Label function',
            nodes: [
              { label: 'US', detail: 'naturally effective' },
              { label: 'UR', detail: 'natural response' },
              { label: 'CS', detail: 'learned predictor', emphasis: 'active' },
              { label: 'CR', detail: 'learned response' },
            ],
            links: ['elicits', 'pair cue to event', 'elicits'],
          },
          {
            label: 'Label process',
            nodes: [
              { label: 'Pairing', detail: 'acquisition' },
              { label: 'CS alone', detail: 'extinction' },
              { label: 'Rest then CR', detail: 'recovery' },
            ],
            links: ['then', 'then'],
          },
        ],
      ),
      strategy:
        'Write the temporal order with arrows before assigning any abbreviation or process name.',
      checkYourThinking:
        'Which items are stimuli, which are responses, and what exact trial sequence changed prediction?',
    },
    recap: {
      title: 'Prediction is now distinct from consequence',
      explanation: [
        'Classical learning links a cue to a following event and changes an elicited response. Next, the learner’s own action will produce or prevent a consequence, and that consequence will change future action.',
      ],
      visual: CAUSAL_MAP,
      takeaway: 'Cue → event is classical; action → consequence is operant.',
    },
  },
  {
    key: 'learning-operant',
    kcId: 'V3-KC-628404',
    stageLabel: 'Operant conditioning',
    nextActionLabel: 'Add cognitive and biological limits',
    starting: question(
      'Classify an action–consequence relation',
      'Whenever a participant taps a key, an irritating flicker stops for 30 seconds. Key taps rise from 2 to 12 per session. What occurred?',
      [
        ['Negative reinforcement.', 'Correct. The action removes an event and then increases.'],
        ['Positive punishment.', 'Punishment requires the behavior to decrease.'],
        ['Negative punishment.', 'Removal plus a behavior decrease would be negative punishment.'],
        ['Classical conditioning.', 'The defining relation is action → consequence.'],
      ],
      'A',
      'Reinforcement and punishment describe the future direction of behavior; positive and negative describe addition and removal.',
      'Decide whether behavior rose or fell before deciding whether the event was added or removed.',
      'Track the action, consequence, and later action.',
      CAUSAL_MAP,
    ),
    model: {
      title: 'Use two independent axes',
      explanation: [
        'In operant conditioning, an action changes its environment and the consequence changes how likely that action is later. Reinforcement means behavior increases; punishment means it decreases.',
        'Positive means an event is added and negative means an event is removed. These words do not mean good or bad, so removal can reinforce and addition can punish.',
      ],
      visual: relations(
        'Operant two-axis model',
        'An action produces a consequence and future action rises or falls. Added plus rising is positive reinforcement; removed plus rising is negative reinforcement; added plus falling is positive punishment; removed plus falling is negative punishment.',
        [
          {
            label: 'Behavior rises · reinforcement',
            nodes: [
              { label: 'Event added', detail: 'positive reinforcement' },
              { label: 'Event removed', detail: 'negative reinforcement', emphasis: 'active' },
            ],
            links: ['or'],
          },
          {
            label: 'Behavior falls · punishment',
            nodes: [
              { label: 'Event added', detail: 'positive punishment' },
              { label: 'Event removed', detail: 'negative punishment' },
            ],
            links: ['or'],
          },
          {
            label: 'Contingency',
            nodes: [
              { label: 'Cue', detail: 'signals availability' },
              { label: 'Action' },
              { label: 'Consequence' },
              { label: 'Future action', detail: 'changes' },
            ],
            links: ['sets occasion', 'produces', 'alters'],
          },
        ],
      ),
      takeaway: 'Classify behavior direction first; only then classify addition or removal.',
    },
    understandingCheck: question(
      'Check the two axes',
      'A key press turns off an irritating sound, and later key pressing increases. How should the consequence be classified?',
      [
        [
          'Negative reinforcement.',
          'Correct. The sound is removed, and the future action increases.',
        ],
        [
          'Negative punishment.',
          'Removal is negative, but punishment would require the action to decrease.',
        ],
        [
          'Positive reinforcement.',
          'The action rises, but the consequence removes rather than adds an event.',
        ],
        ['Positive punishment.', 'Neither addition nor a decrease in behavior is present.'],
      ],
      'A',
      'The later behavior direction decides reinforcement versus punishment: pressing increased, so this is reinforcement. Removal of the sound then makes it negative reinforcement.',
      'Read the later action first, then ask whether an event was added or removed.',
    ),
    worked: {
      title: 'Shape a response and read its schedule',
      explanation: [
        'A training program first reinforces opening any command menu, then opening Tools, then selecting Export, and finally pressing Ctrl+E. Reinforcing successive closer approximations is shaping because each criterion moves behavior toward the target.',
        'Once Ctrl+E is established, a point after every fourth response is fixed-ratio 4: ratio counts responses and fixed means the requirement stays constant. If points stop and Ctrl+E declines, that is operant extinction because the action no longer produces its learned reinforcer.',
      ],
      visual: relations(
        'Shaping and schedule sequence',
        'Successively closer actions are reinforced until Ctrl plus E is reached. Then one point follows every fourth response, a fixed-ratio schedule. Removing points leads the response to decline.',
        [
          {
            label: 'Shaping',
            nodes: [
              { label: 'Any menu' },
              { label: 'Tools' },
              { label: 'Export' },
              { label: 'Ctrl+E', emphasis: 'active' },
            ],
            links: ['closer', 'closer', 'target'],
          },
          {
            label: 'Contingency',
            nodes: [
              { label: '4 responses', detail: 'fixed count' },
              { label: 'Point', detail: 'reinforcer' },
              { label: 'Points stop', detail: 'extinction' },
              { label: 'Responding falls' },
            ],
            links: ['earns', 'later', 'produces'],
          },
        ],
      ),
      takeaway:
        'What to notice: schedules are defined by the programmed contingency, not merely by the shape of a response graph.',
    },
    guided: question(
      'Choose the next approximation',
      'Opening the Tools menu is currently reinforced. The final target is pressing Ctrl+E. What is the best next shaping criterion?',
      [
        [
          'Reinforce selecting Export inside Tools.',
          'Correct. It is a closer achievable approximation to the target.',
        ],
        ['Reinforce any mouse movement.', 'That moves farther from the target.'],
        [
          'Require Ctrl+E immediately and reinforce nothing else.',
          'That skips the next attainable approximation.',
        ],
        [
          'Deliver points regardless of action.',
          'That removes the action–consequence contingency.',
        ],
      ],
      'A',
      'Shaping changes the reinforcement criterion gradually toward the target response.',
      'Choose the next behavior that is closer than the current one but still attainable.',
    ),
    reducedSupport: question(
      'Classify a schedule from its rule',
      'A point is delivered after an unpredictable number of responses, averaging one point per six responses. Which schedule is programmed?',
      [
        [
          'Variable ratio.',
          'Correct. The requirement counts responses and varies around an average.',
        ],
        ['Fixed ratio.', 'The response requirement is not constant.'],
        ['Variable interval.', 'No time interval controls availability.'],
        ['Fixed interval.', 'Neither a fixed time nor an interval rule appears.'],
      ],
      'A',
      'Ratio schedules count responses; interval schedules track time. Fixed requirements stay constant, while variable requirements change around an average.',
    ),
    independent: question(
      'Separate escape from avoidance',
      'A warning light signals that a loud tone will begin in 10 seconds. Pressing a key during the warning prevents the tone, and warning-period key presses increase. This is:',
      [
        [
          'Avoidance maintained by negative reinforcement.',
          'Correct. The action prevents the aversive event and becomes more likely.',
        ],
        ['Escape only.', 'Escape ends an aversive event that has already begun.'],
        ['Negative punishment.', 'The action increases rather than decreases.'],
        [
          'Classical extinction.',
          'An action prevents a consequence; this is an operant contingency.',
        ],
      ],
      'A',
      'Escape terminates an ongoing aversive event; avoidance prevents it before onset. Both can be negatively reinforced when the action increases.',
    ),
    near: question(
      'Read behavior direction first',
      'After a learner interrupts, an extra task is added. Interruptions fall from eight to two per class. The consequence is:',
      [
        ['Positive punishment.', 'Correct. An event is added and the behavior decreases.'],
        ['Positive reinforcement.', 'Reinforcement would increase interruptions.'],
        ['Negative punishment.', 'The consequence is added, not removed.'],
        ['Negative reinforcement.', 'Nothing is removed, and behavior falls.'],
      ],
      'A',
      'The falling behavior makes this punishment; the added task makes it positive.',
    ),
    changed: question(
      'Use a discriminative cue',
      'A green icon signals that pressing a key will earn a point; a gray icon signals no point. Pressing increases only during green. What role does green play?',
      [
        [
          'A discriminative cue that signals when reinforcement is available.',
          'Correct. It sets the occasion for the action–consequence relation.',
        ],
        [
          'An unconditioned stimulus that naturally elicits pressing.',
          'Pressing is selected by its consequence rather than a reflex described here.',
        ],
        [
          'A punisher because it appears before the action.',
          'Timing alone does not define punishment, and pressing increases.',
        ],
        ['The response itself.', 'The key press is the response; green is an environmental cue.'],
      ],
      'A',
      'A discriminative cue does not force the action; it signals that a particular action will have a particular consequence in that situation.',
    ),
    repair: {
      title: 'Read the contingency in a fixed order',
      explanation: [
        'Write the action, the immediate consequence, and the later change in that same action. The later direction decides reinforcement versus punishment; addition or removal decides positive versus negative.',
        'For schedules and cues, ask what controls availability: response count or elapsed time, constant or varying, and whether a cue marks when the consequence can be earned.',
      ],
      visual: relations(
        'Operant contingency repair',
        'First identify the action and consequence, then observe whether future action rises or falls. Only after that decide whether the event was added or removed.',
        [
          {
            label: 'Required order',
            nodes: [
              { label: 'Action', detail: 'what was emitted' },
              { label: 'Consequence', detail: 'added or removed' },
              { label: 'Future action', detail: 'rises or falls', emphasis: 'active' },
              { label: 'Classification', detail: 'reinforce or punish' },
            ],
            links: ['produces', 'changes', 'determines'],
          },
        ],
      ),
      strategy:
        'Do not interpret “positive” or “negative” until behavior direction has fixed reinforcement or punishment.',
      checkYourThinking:
        'What exact action changed later, and did the consequence add an event, remove one, or prevent one?',
    },
    recap: {
      title: 'The contingency now predicts future action',
      explanation: [
        'Operant learning connects an emitted response to what follows it. Behavior direction, addition or removal, schedule, and signaling cues explain the pattern—but learning is also shaped by knowledge and biological tendencies.',
      ],
      visual: CAUSAL_MAP,
      takeaway:
        'A consequence is defined by what it does to future behavior, not by whether it seems pleasant.',
    },
  },
  {
    key: 'learning-constraints',
    kcId: 'V3-KC-730668',
    stageLabel: 'Learning constraints',
    nextActionLabel: 'Finish the lesson',
    starting: question(
      'Separate learning from visible performance',
      'People explore a virtual building without reward. Later a destination is announced and most choose a short route they never practiced directly. What is best supported?',
      [
        [
          'Latent learning represented in a cognitive map.',
          'Correct. Knowledge acquired without reward supports a flexible novel route.',
        ],
        [
          'No learning occurred until reward appeared.',
          'The immediate novel shortcut shows prior acquisition that was not visible in performance.',
        ],
        ['Instinctive drift.', 'No species-typical action displaces a trained response.'],
        ['Classical extinction.', 'No CS-alone decline is described.'],
      ],
      'A',
      'Acquisition and performance can separate: knowledge may be learned before conditions make it visible.',
      'Ask whether the later behavior uses information that was available during unrewarded exploration.',
      'Compare predicted learning with what is actually expressed.',
      relations(
        'Learning versus performance',
        'Unrewarded exploration builds route knowledge. A later goal makes that knowledge visible through a novel shortcut.',
        [
          {
            label: 'Across phases',
            nodes: [
              { label: 'Explore', detail: 'no reward' },
              { label: 'Acquire map', detail: 'not yet obvious' },
              { label: 'Goal appears', detail: 'motivation changes' },
              { label: 'Novel shortcut', detail: 'knowledge expressed', emphasis: 'active' },
            ],
            links: ['can build', 'then', 'reveals'],
          },
        ],
      ),
    ),
    model: {
      title: 'Learning is constrained by knowledge and biology',
      explanation: [
        'Latent learning occurs when knowledge is acquired without immediate reinforcement and appears later when motivation or opportunity changes. A cognitive map is supported when behavior flexibly adapts to a new route, not merely when a practiced turn becomes faster.',
        'Preparedness means biological history makes some associations easier to acquire than others; it is a bias, not an absolute rule. Instinctive drift occurs when a species-typical behavior begins to displace a trained response even though reinforcement for the trained response remains available.',
      ],
      visual: relations(
        'Three ways simple predictions can fail',
        'Knowledge can be acquired before performance reveals it, some pairings can be learned more readily than others, and species-typical behavior can compete with a reinforced response.',
        [
          {
            label: 'Latent learning',
            nodes: [
              { label: 'Explore', detail: 'no reward' },
              { label: 'Knowledge acquired' },
              { label: 'Goal reveals it', emphasis: 'active' },
            ],
            links: ['builds', 'later'],
          },
          {
            label: 'Preparedness',
            nodes: [
              { label: 'Possible pairings' },
              { label: 'Biological fit', detail: 'changes ease', emphasis: 'active' },
              { label: 'Different learning rates' },
            ],
            links: ['filtered by', 'produces'],
          },
          {
            label: 'Instinctive drift',
            nodes: [
              { label: 'Trained action' },
              { label: 'Reward continues' },
              { label: 'Typical action intrudes', emphasis: 'active' },
            ],
            links: ['still earns', 'yet'],
          },
        ],
      ),
      takeaway:
        'Compare the simple learning prediction with the observed departure, then identify the relation that explains the mismatch.',
    },
    understandingCheck: question(
      'Check the decisive departure',
      'A trained action still earns food, but a species-typical action increasingly replaces it. Which detail rules against simple extinction?',
      [
        [
          'The reinforcer remains available for the trained action.',
          'Correct. The contingency continues even as a competing typical response grows.',
        ],
        [
          'The trained response becomes less frequent.',
          'Decline alone could fit several processes and is not the decisive contrast.',
        ],
        [
          'The behavior occurs across multiple sessions.',
          'Repeated measurement does not distinguish extinction from drift.',
        ],
        [
          'Food is biologically relevant.',
          'The key evidence is continued reinforcement plus growth of the competing action.',
        ],
      ],
      'A',
      'Operant extinction requires the learned reinforcer to stop following the action. Continued reward paired with growth of a species-typical competitor instead supports instinctive drift.',
      'Check whether the original consequence was actually removed.',
    ),
    worked: {
      title: 'Read expected versus observed behavior',
      explanation: [
        'A fictional species is reinforced for placing food-like tokens into a box. Across sessions, correct deposits fall from 18 to 8 while species-typical token rubbing rises from 1 to 12, even though every correct deposit can still earn food.',
        'Extinction is a poor fit because the reinforcer remains available. The reciprocal change toward a natural handling pattern supports instinctive drift: the biological response competes with the trained action.',
      ],
      visual: relations(
        'Instinctive-drift trace',
        'Across four sessions, correct deposits decrease from 18 to 8 while species-typical rubbing increases from 1 to 12, even though deposit rewards remain available.',
        [
          {
            label: 'Correct deposits',
            nodes: [
              { label: 'Session 1', detail: '18' },
              { label: 'Session 2', detail: '17' },
              { label: 'Session 3', detail: '13' },
              { label: 'Session 4', detail: '8' },
            ],
            links: ['falls', 'falls', 'falls'],
          },
          {
            label: 'Typical rubbing',
            nodes: [
              { label: 'Session 1', detail: '1' },
              { label: 'Session 2', detail: '3' },
              { label: 'Session 3', detail: '7' },
              { label: 'Session 4', detail: '12', emphasis: 'active' },
            ],
            links: ['rises', 'rises', 'rises'],
          },
        ],
      ),
      takeaway:
        'What to notice: the reward remains available while a competing species-typical action grows.',
    },
    guided: question(
      'Infer a flexible representation',
      'After unrewarded exploration, a corridor is blocked and a goal is announced. Participants immediately choose a short route they never practiced. Which evidence is decisive?',
      [
        [
          'They use a novel detour, showing flexible spatial knowledge.',
          'Correct. The response goes beyond repeating one trained route.',
        ],
        [
          'They move faster only after receiving a reward.',
          'Faster performance alone does not show when the route knowledge was acquired.',
        ],
        [
          'They repeat the last rewarded turn.',
          'That could be a fixed response rather than a map.',
        ],
        ['They avoid every unfamiliar corridor.', 'That does not demonstrate the learned layout.'],
      ],
      'A',
      'A novel shortcut or detour is strong evidence for a flexible representation because it recombines learned spatial relations.',
      'Look for a route that was not directly practiced.',
    ),
    reducedSupport: question(
      'Recognize preparedness',
      'After one pairing, flavor → nausea produces much stronger avoidance than light → nausea, while light → surface vibration is learned more readily than flavor → vibration. What is supported?',
      [
        [
          'Preparedness: some cue–outcome combinations are acquired more readily.',
          'Correct. Learning differs by the biological fit of the pairing.',
        ],
        [
          'Flavor can never be associated with vibration.',
          'Preparedness is a relative bias, not impossibility.',
        ],
        [
          'All pairings are equally learnable.',
          'The contrasting acquisition strengths argue against that claim.',
        ],
        ['Instinctive drift.', 'No trained response is displaced over time by a typical action.'],
      ],
      'A',
      'Preparedness is inferred from relative learning across matched pairings, not from one successful association alone.',
    ),
    independent: question(
      'Identify instinctive drift',
      'A trained animal continues to receive food for placing tokens in a box, but token rubbing increasingly replaces depositing. What best explains the pattern?',
      [
        [
          'Instinctive drift.',
          'Correct. A species-typical response displaces the reinforced action.',
        ],
        ['Operant extinction.', 'The reinforcer remains available.'],
        ['Spontaneous recovery.', 'No extinguished conditioned response returns after rest.'],
        [
          'Sensory adaptation.',
          'The change concerns competing actions, not reduced sensory input.',
        ],
      ],
      'A',
      'The key evidence is not merely declining performance; it is the rise of a biologically typical competing response while reward continues.',
    ),
    near: question(
      'Check latent learning',
      'Rats explore a maze without food. When food is later introduced, errors drop rapidly, and a blocked path produces a short novel detour. Which account fits best?',
      [
        [
          'Latent learning expressed through a cognitive map.',
          'Correct. Prior knowledge becomes visible and supports flexible routing.',
        ],
        [
          'No learning before food.',
          'The rapid improvement and novel detour suggest information was already acquired.',
        ],
        [
          'Classical generalization.',
          'The evidence concerns spatial representation, not similar predictive cues.',
        ],
        ['Negative punishment.', 'No action decreases because an event is removed.'],
      ],
      'A',
      'A goal can reveal previously acquired knowledge; it need not be the moment acquisition begins.',
    ),
    changed: question(
      'State the preparedness boundary',
      'A biologically matched pairing is learned faster than a mismatched pairing, but the mismatched pairing is eventually learned with more trials. Which conclusion is warranted?',
      [
        [
          'Preparedness changes ease or rate of learning, not absolute possibility.',
          'Correct. The pattern shows a relative learning bias.',
        ],
        [
          'The mismatched association is biologically impossible.',
          'It was learned with additional trials.',
        ],
        [
          'Biology has no effect because both are eventually learned.',
          'Different acquisition rates still show a constraint.',
        ],
        [
          'The faster pairing must be operant.',
          'Learning speed does not determine classical versus operant structure.',
        ],
      ],
      'A',
      'Constraints change the probability, speed, or expression of learning; they need not create all-or-none outcomes.',
    ),
    repair: {
      title: 'Compare the simple prediction with the departure',
      explanation: [
        'First state what a basic reinforcement or pairing account predicts. Then locate the mismatch: knowledge appears before reward, one pairing is learned more readily, or a natural response grows despite continued reinforcement.',
        'Use the pattern across conditions or time. A single successful trial cannot distinguish flexible knowledge, preparedness, or drift.',
      ],
      visual: relations(
        'Constraint decision repair',
        'Knowledge before reward points to latent learning, unequal acquisition across pairings points to preparedness, and growth of a typical action despite continued reward points to instinctive drift.',
        [
          {
            label: 'Decisive contrast',
            nodes: [
              { label: 'Before reward', detail: 'knowledge later appears' },
              { label: 'Across pairings', detail: 'learning ease differs' },
              { label: 'Despite reward', detail: 'typical action grows' },
            ],
            links: ['or', 'or'],
          },
          {
            label: 'Name the relation',
            nodes: [
              { label: 'Latent learning' },
              { label: 'Preparedness' },
              { label: 'Instinctive drift', emphasis: 'active' },
            ],
            links: ['contrast', 'contrast'],
          },
        ],
      ),
      strategy:
        'Underline when learning was acquired, what pairings are being compared, and whether reinforcement remains available.',
      checkYourThinking:
        'Which observation would be unexpected under a simple reward-strength account?',
    },
    recap: {
      title: 'Learning is a relation, not a vocabulary list',
      explanation: [
        'You separated repetition-only change, cue–event prediction, action–consequence learning, and departures caused by knowledge or biology. The same surface behavior can reflect different mechanisms, so temporal order and contingency must lead the classification.',
      ],
      visual: CAUSAL_MAP,
      takeaway:
        'Find what predicts what, what produces what, and what changed later before choosing a term.',
    },
  },
] as const;

const INTRO_NODE = {
  id: 'associative-intro',
  kcIds: ['V3-KC-337354', 'V3-KC-564671', 'V3-KC-628404', 'V3-KC-730668'],
  kind: 'intro',
  title: 'Connect cues, consequences, and behavior',
  outcome:
    'Read the sequence first, then decide whether behavior changed through repetition, prediction, consequences, or a learning constraint.',
  details: [
    'Track what came first, what followed, and which response changed across later trials.',
  ],
} as const;

const COMPLETION_NODE = {
  id: 'associative-complete',
  kcIds: ['V3-KC-337354', 'V3-KC-564671', 'V3-KC-628404', 'V3-KC-730668'],
  kind: 'completion',
  title: 'You can trace the decisive learning relation',
  summary:
    'You used repetition, cue–event pairing, action–consequence contingencies, and expected-versus-observed evidence to explain behavior change.',
  takeaways: [
    'Habituation follows repetition; dishabituation requires recovery to the original stimulus.',
    'Classical learning links a cue to an event; operant learning links an action to a consequence.',
    'Learning and performance can separate, and biological tendencies can change what is learned or expressed.',
  ],
  nextStep:
    'On a new vignette, draw the event order and mark the response measured before naming the process.',
} as const;

export const ASSOCIATIVE_LEARNING_SCRIPT = defineLessonScriptPreview({
  schemaVersion: 'lesson-script-preview/v2',
  status: 'internal-preview',
  id: 'V3-LES-225658',
  contentVersion: 'app-native-associative-v2.1.0-review-flow',
  slug: 'associative-learning',
  title: 'Connect cues, consequences, and behavior',
  internalTitle: 'Discriminate and model associative learning',
  subject: 'Psychological & social foundations',
  description:
    'Distinguish repetition, classical pairing, operant contingencies, and constraints on learned behavior.',
  estimatedMinutes: 50,
  requiredKcs: [
    {
      id: 'V3-KC-337354',
      title: 'Distinguish habituation and dishabituation',
      learnerOutcome:
        'Use repetition, sensory controls, and an original-stimulus retest to classify response change.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-564671',
      title: 'Model classical conditioning',
      learnerOutcome:
        'Map stimulus and response functions and predict change from cue–event trial sequences.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-628404',
      title: 'Model operant conditioning',
      learnerOutcome:
        'Predict behavior from consequences, schedules, cues, shaping, extinction, escape, and avoidance.',
      previewCoverage: 'complete-review-focus',
    },
    {
      id: 'V3-KC-730668',
      title: 'Explain cognitive and biological constraints on associative learning',
      learnerOutcome:
        'Explain departures from simple learning predictions using knowledge, preparedness, and instinctive drift.',
      previewCoverage: 'complete-review-focus',
    },
  ],
  teachingObjective:
    'Make temporal order and causal contingency the basis for discriminating learning mechanisms.',
  nodes: [
    INTRO_NODE,
    ...ASSOCIATIVE_SECTIONS.flatMap((section) => buildSectionNodes(section)),
    COMPLETION_NODE,
  ],
  modelNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
    sectionNodeId(section, 'model'),
  ) as unknown as [string, ...string[]],
  workedExplanationNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
    sectionNodeId(section, 'worked'),
  ) as unknown as [string, ...string[]],
  practice: {
    guidedNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
      sectionNodeId(section, 'guided'),
    ) as unknown as [string, ...string[]],
    reducedSupportNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
      sectionNodeId(section, 'reduced-support'),
    ) as unknown as [string, ...string[]],
    independentNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
      sectionNodeId(section, 'independent'),
    ) as unknown as [string, ...string[]],
  },
  exit: {
    nearNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-near'),
    ) as unknown as [string, ...string[]],
    changedNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
      sectionNodeId(section, 'exit-changed'),
    ) as unknown as [string, ...string[]],
  },
  repairNodeIds: ASSOCIATIVE_SECTIONS.map((section) =>
    sectionNodeId(section, 'repair'),
  ) as unknown as [string, ...string[]],
  completionNodeId: COMPLETION_NODE.id,
});

export { ASSOCIATIVE_SECTIONS };
