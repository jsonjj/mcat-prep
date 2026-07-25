import { defineLessonScriptPreview, type RedoxCarrierVisualPreview } from './contract';

const REDOX_LABELS = {
  oxidizedLabel: 'Q · oxidized endpoint',
  reducedLabel: 'QH₂ · reduced endpoint',
  electronLabel: '2 e⁻ enter Q overall',
  protonLabel: '2 H⁺ enter Q overall',
  equation: 'Q + 2 H⁺ + 2 e⁻ → QH₂',
  accountingLabel: 'Net endpoint accounting',
  mechanismBoundaryLabel: 'Balanced total—not an elementary mechanism',
  oxidizedBondLabels: ['C=O', 'C=O'],
  reducedBondLabels: ['C–OH', 'C–OH'],
  tailLabel: 'Unchanged carrier tail is muted on both endpoints.',
} as const;

function carrierVisual(
  emphasis: RedoxCarrierVisualPreview['emphasis'],
  alt: string,
  textEquivalent: string,
  caption?: string,
): RedoxCarrierVisualPreview {
  return {
    kind: 'redox-carrier',
    emphasis,
    alt,
    textEquivalent,
    caption,
    ...REDOX_LABELS,
  };
}

export const REDOX_V2_SCRIPT = defineLessonScriptPreview({
  schemaVersion: 'lesson-script-preview/v2',
  status: 'internal-preview',
  id: 'V3-LES-329622',
  contentVersion: 'app-native-redox-v2.2.0-review-flow',
  slug: 'biological-redox',
  title: 'Follow electrons through biological redox',
  internalTitle: 'Trace biological redox carriers and centers · app-native candidate',
  subject: 'Chemical & physical foundations',
  description:
    'Trace a two-electron quinone reduction by reading electron direction, two oxygen bond changes, and net accounting.',
  estimatedMinutes: 12,
  requiredKcs: [
    {
      id: 'V3-KC-271440',
      title: 'Trace phenolic two-electron redox',
      learnerOutcome:
        'Relate quinone and hydroquinone structures to a supplied biological two-electron redox operation.',
      previewCoverage: 'complete-review-focus',
    },
  ],
  teachingObjective:
    'Given quinone and hydroquinone endpoint structures or a supplied half-reaction, identify the redox center, trace electron direction, and classify the carrier as oxidized or reduced without treating net accounting as an elementary mechanism.',
  nodes: [
    {
      id: 'redox-intro',
      kind: 'intro',
      kcIds: ['V3-KC-271440'],
      title: 'Follow electrons through biological redox',
      outcome:
        'Learn to read one quinone switch: where the electrons go, what changes, and what stays put.',
      details: [
        'You will start with one quick check, build the model in short steps, and finish with two independent traces.',
        'The lesson focuses on the complete Q and QH₂ endpoints while keeping the mechanism boundary explicit.',
      ],
    },
    {
      id: 'redox-starting-check',
      kind: 'question',
      stage: 'starting-check',
      kcIds: ['V3-KC-271440'],
      title: 'Start with the electron',
      prompt: 'A carrier accepts electrons from a donor. What happened to the carrier?',
      options: [
        { id: 'A', label: 'It was reduced.' },
        { id: 'B', label: 'It was oxidized.' },
        { id: 'C', label: 'Electron direction does not tell us.' },
        { id: 'D', label: 'I’m not sure yet.' },
      ],
      help: 'Track the electrons into or out of the carrier before looking at names or structures.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Yes. The carrier receives negative charge with the electrons, so this direction is reduction.',
          B: 'This reverses the direction: electron loss would oxidize the carrier instead.',
          C: 'Electron direction is enough to name the operation before any structure is inspected.',
          D: 'That is useful starting information. Start by treating the electron arrow as the deciding cue.',
        },
        explanation:
          'Reduction means gaining electrons; oxidation means losing them. The donor transfers the same electrons away, so the carrier and donor undergo opposite operations.',
        incorrectHeading: 'That answer is incorrect. We’ll work through it together.',
      },
    },
    {
      id: 'redox-model-electron-in',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Electron in means reduced',
      supportingLine: 'Make this decision before reading the molecule.',
      explanation: [
        'The arrow sends two electrons into Q, increasing electron density on the carrier. Gaining electrons is reduction, while the donor that supplied them is oxidized. Naming the direction first keeps unfamiliar bond labels from reversing the conclusion.',
      ],
      visual: carrierVisual(
        'endpoint-overview',
        'Net endpoint accounting for two-electron, two-proton reduction of Q to QH₂.',
        'Endpoint accounting, not an elementary mechanism: Q has two opposite carbonyl groups, each drawn as a carbon double bonded to oxygen. QH₂ has hydroxyl groups at those same two carbon positions, each drawn as a carbon single bonded to OH. Overall, Q plus two H positive plus two electrons yields QH₂. The unchanged carrier tail is muted on both endpoints.',
        'Endpoint accounting: identify electron direction before interpreting the bond changes.',
      ),
      takeaway: 'Follow the arrow: the electron receiver is reduced; the donor is oxidized.',
    },
    {
      id: 'redox-check-electron-direction',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Check the direction',
      prompt: 'Two electrons enter Q overall. Which conclusion follows directly?',
      options: [
        { id: 'A', label: 'Q is reduced.' },
        { id: 'B', label: 'Q is oxidized.' },
        { id: 'C', label: 'The unchanged tail is reduced.' },
        { id: 'D', label: 'No redox conclusion is possible.' },
      ],
      help: 'Classify the operation from electron direction alone.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Electron gain is the deciding cue for reduction.',
          B: 'Oxidation requires electron loss, the opposite direction.',
          C: 'The equation tracks electrons into the carrier as a whole; the unchanged tail is not the changing center.',
          D: 'Electron direction is enough to classify the operation.',
        },
        explanation:
          'Q receives electrons, so Q is reduced. The bond comparison will confirm where that endpoint change appears.',
      },
    },
    {
      id: 'redox-model-oxygen-one',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Watch the first oxygen bond',
      supportingLine: 'Ignore the rest of the carrier for one moment.',
      explanation: [
        'A carbonyl is a C=O group; the matching reduced endpoint has a single C–O bond and an O–H bond, written C–OH. Comparing the same oxygen position across the arrow shows where part of the redox change appears in the structure. This bond change supports the electron-direction decision rather than replacing it.',
      ],
      visual: carrierVisual(
        'first-oxygen',
        'The first highlighted quinone carbonyl changes from C double bond O to C single bond OH.',
        'The upper designated oxygen bond is highlighted. It is labeled C=O on Q and C–OH on QH₂. The second oxygen bond and the carrier tail are muted.',
      ),
      takeaway: 'Match one oxygen position: carbonyl C=O becomes hydroxyl-bearing C–OH.',
    },
    {
      id: 'redox-model-oxygen-two',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'The second oxygen changes too',
      supportingLine: 'The full endpoint switch uses the pair.',
      explanation: [
        'The second designated carbonyl changes in the same way, so the complete reduced endpoint has two C–OH groups. The pair matters because QH₂ contains two new O–H hydrogens, not just one. Reading both positions prevents stopping at an incomplete halfway structure.',
      ],
      visual: carrierVisual(
        'second-oxygen',
        'The second highlighted quinone carbonyl also changes from C double bond O to C single bond OH.',
        'The lower designated oxygen bond is highlighted. It is labeled C=O on Q and C–OH on QH₂. Together, both designated carbonyls become hydroxyl-bearing bonds.',
      ),
      takeaway: 'Count the pair: two C=O groups become two C–OH groups.',
    },
    {
      id: 'redox-check-oxygen-pair',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Check the oxygen pair',
      prompt: 'Which comparison describes the complete Q → QH₂ endpoint change?',
      options: [
        { id: 'A', label: 'Both designated C=O groups become C–OH groups.' },
        { id: 'B', label: 'Only one designated C=O group becomes C–OH.' },
        { id: 'C', label: 'Both designated C–OH groups become C=O groups.' },
        { id: 'D', label: 'The carrier tail changes while both C=O groups stay fixed.' },
      ],
      help: 'Match both designated oxygen positions from left endpoint to right endpoint.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The same two carbon positions carry C=O in Q and C–OH in QH₂.',
          B: 'That stops at an incomplete endpoint; QH₂ has two C–OH groups.',
          C: 'This is the reverse QH₂ → Q oxidation.',
          D: 'The tail is unchanged; the two oxygen-bearing bonds are the changing features.',
        },
        explanation:
          'The complete endpoint comparison uses a pair of matched positions. Both carbonyls in Q correspond to hydroxyl-bearing bonds in QH₂.',
      },
    },
    {
      id: 'redox-model-net-accounting',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Balance the endpoint change',
      supportingLine: 'Now account for every added particle.',
      explanation: [
        'The two protons supply the two hydrogens in the new O–H bonds, while the two electrons supply −2 charge. Check atoms first: the carrier skeleton is unchanged and two added H atoms appear in QH₂. Then check charge: +2 from 2 H⁺ and −2 from 2 e⁻ sum to zero, matching the neutral endpoints.',
      ],
      visual: {
        kind: 'accounting',
        equation: 'Q + 2 H⁺ + 2 e⁻ → QH₂',
        rows: [
          { label: 'Electrons', reactants: '2 e⁻', products: 'stored in reduced QH₂' },
          { label: 'Hydrogens', reactants: '2 H⁺', products: '2 new O–H bonds' },
          { label: 'Net charge', reactants: '+2 + (−2) = 0', products: '0' },
        ],
        alt: 'Balanced quinone reduction showing two protons and two electrons entering Q to form QH2.',
        textEquivalent:
          'Q plus two H positive plus two electrons yields QH2. The two protons supply two hydrogens, the two electrons supply negative two charge, and the combined inputs add zero net charge.',
        caption: 'Net two-electron, two-proton accounting.',
      },
      takeaway: 'Balance H and charge separately: Q + 2 H⁺ + 2 e⁻ → QH₂.',
    },
    {
      id: 'redox-check-accounting',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Check the proton count',
      prompt: 'Why does the endpoint ledger include 2 H⁺?',
      options: [
        { id: 'A', label: 'They supply the two hydrogens in the two new O–H bonds.' },
        { id: 'B', label: 'They create two additional oxygen atoms.' },
        { id: 'C', label: 'They replace the unchanged carrier tail.' },
        { id: 'D', label: 'They force all transfers to occur in one step.' },
      ],
      help: 'Compare the atoms in Q with the atoms newly present in QH₂.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. QH₂ has two additional hydrogens, one on each designated oxygen.',
          B: 'The same two oxygen atoms appear in both endpoints; no oxygen is added.',
          C: 'The carrier tail remains present and unchanged.',
          D: 'Balancing totals does not determine the number or order of microscopic steps.',
        },
        explanation:
          'The two protons account for the two new hydrogen atoms. Separately, their +2 charge cancels the −2 charge of the two electrons.',
      },
    },
    {
      id: 'redox-model-tail',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Hold the tail constant',
      supportingLine: 'The redox decision lives in the highlighted head.',
      explanation: [
        'The redox center is the part whose bonding changes as electrons move; here, it is the two-oxygen head. The tail is identical on both sides, so it cancels from the endpoint comparison and cannot identify the oxidation state. A useful structural cue must differ across the arrow.',
      ],
      visual: carrierVisual(
        'unchanged-tail',
        'Oxidized Q and reduced QH2 have the same carrier tail while their two oxygen bonds differ.',
        'The identical carrier tails on Q and QH2 are highlighted and both labeled “same carrier tail.” The two designated oxygen bonds differ between the endpoints.',
      ),
      takeaway: 'Use changed bonds to identify state; ignore identical features.',
    },
    {
      id: 'redox-check-tail',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Check what stays fixed',
      prompt:
        'What role should the identical carrier tail play when you identify the endpoint state?',
      options: [
        { id: 'A', label: 'Ignore it for this comparison because it does not change.' },
        { id: 'B', label: 'Use it as the main evidence that Q was reduced.' },
        { id: 'C', label: 'Count it as a third oxygen-bearing redox center.' },
        { id: 'D', label: 'Treat it as the source of the two added hydrogens.' },
      ],
      help: 'A before-and-after cue can identify a change only if it differs across the arrow.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. An identical feature cancels from the endpoint comparison.',
          B: 'The tail gives no state evidence because it looks the same on both sides.',
          C: 'The designated redox center is the two-oxygen head, not the unchanged tail.',
          D: 'The two added hydrogens are supplied by the 2 H⁺ in the ledger.',
        },
        explanation:
          'Hold the tail constant and compare only changed features. Here, the paired oxygen bonds distinguish Q from QH₂.',
      },
    },
    {
      id: 'redox-model-boundary',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Accounting is not a mechanism',
      supportingLine: 'The equation states the net change—and stops there.',
      explanation: [
        'A half-reaction is an endpoint ledger: it records the total electrons, protons, atoms, and charge needed to connect Q with QH₂. That balance remains valid whether transfer occurs together or through several intermediates. It does not specify the elementary mechanism, meaning the step-by-step molecular path.',
      ],
      visual: {
        kind: 'boundary',
        accountingLabel: 'The model does say',
        boundaryLabel: 'The model does not say',
        accountingLines: [
          'Q gains 2 e⁻ overall.',
          'Q gains 2 H⁺ overall.',
          'The complete endpoint is QH₂.',
        ],
        boundaryLines: [
          'All four particles transfer at once.',
          'No intermediate can occur.',
          'The reaction must be fast or spontaneous.',
        ],
        alt: 'Boundary between net redox accounting and an elementary reaction mechanism.',
        textEquivalent:
          'The model states that Q gains two electrons and two protons overall to become QH2. It does not state that every transfer occurs at once, rule out intermediates, or predict rate or spontaneity.',
      },
      takeaway: 'A balanced total describes endpoints, not the order of microscopic steps.',
    },
    {
      id: 'redox-check-boundary',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Check the model boundary',
      prompt: 'What does Q + 2 H⁺ + 2 e⁻ → QH₂ establish?',
      options: [
        { id: 'A', label: 'The balanced overall change between the two endpoints.' },
        { id: 'B', label: 'That all particles transfer in one elementary step.' },
        { id: 'C', label: 'That no intermediate state can exist.' },
        { id: 'D', label: 'That the reaction must be rapid.' },
      ],
      help: 'Separate what a balanced ledger counts from a step-by-step pathway.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. The half-reaction balances the overall inputs and endpoint.',
          B: 'The ledger totals particles but does not specify a one-step transfer.',
          C: 'A net equation does not include or rule out intermediates.',
          D: 'Balanced accounting does not determine reaction rate.',
        },
        explanation:
          'The equation establishes atom and charge balance from Q to QH₂. It does not describe the elementary mechanism.',
      },
    },
    {
      id: 'redox-worked-trace',
      kind: 'explanation',
      kcIds: ['V3-KC-271440'],
      title: 'Work the trace in one order',
      supportingLine: 'Electron → oxygen pair → tail → equation.',
      explanation: [
        'First, electrons enter Q, so the operation is reduction. Next, match the same two oxygen positions and confirm that both C=O groups become C–OH. Cancel the unchanged tail from the comparison, then verify that two added H atoms and zero net added charge close the ledger Q + 2 H⁺ + 2 e⁻ → QH₂.',
      ],
      visual: carrierVisual(
        'both-oxygens',
        'Complete worked quinone reduction with electron input, both oxygen bond changes, and an unchanged tail.',
        'Two electrons enter Q. Both designated C=O labels on the quinone head change to C–OH on QH2. The carrier tail is identical on both sides.',
        'Worked trace: use the same four checks every time.',
      ),
      takeaway: 'Direction first; structure confirms; accounting closes the trace.',
    },
    {
      id: 'redox-practice-guided',
      kind: 'question',
      stage: 'guided',
      kcIds: ['V3-KC-271440'],
      title: 'Trace with the full model',
      prompt:
        'Q has two designated C=O groups. It accepts 2 e⁻ and 2 H⁺ while its tail stays unchanged. Which endpoint description follows?',
      options: [
        { id: 'A', label: 'QH₂ has two C–OH groups; Q was reduced.' },
        { id: 'B', label: 'QH₂ has two C=O groups; Q was oxidized.' },
        { id: 'C', label: 'QH₂ has one C–OH group; the tail was reduced.' },
        { id: 'D', label: 'The endpoint cannot be classified.' },
      ],
      help: 'Use the four-part trace: electrons, two oxygen bonds, unchanged tail, balanced endpoint.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Electron gain names reduction, and both C=O → C–OH changes confirm the complete QH₂ endpoint.',
          B: 'This keeps the oxidized carbonyl pattern and reverses the supplied electron direction.',
          C: 'Both designated oxygens change; the identical tail is outside the redox center.',
          D: 'The electron direction names the operation, and the paired bond changes identify the endpoint.',
        },
        explanation:
          'Q accepts two electrons, so it is reduced. Two protons provide the two O–H hydrogens, completing both hydroxyl-bearing bonds in QH₂.',
      },
    },
    {
      id: 'redox-practice-reduced-support',
      kind: 'question',
      stage: 'reduced-support',
      kcIds: ['V3-KC-271440'],
      title: 'Reverse the trace',
      prompt:
        'QH₂ releases 2 e⁻ and 2 H⁺ to become Q. The carrier tail is unchanged. What happened?',
      options: [
        { id: 'A', label: 'QH₂ was reduced; C=O became C–OH.' },
        { id: 'B', label: 'QH₂ was oxidized; two C–OH groups became two C=O groups.' },
        { id: 'C', label: 'The tail was oxidized; the head stayed reduced.' },
        { id: 'D', label: 'Only an acid–base change occurred.' },
      ],
      help: 'When electrons leave a species, reverse every cue from the reduction model.',
      evaluation: {
        correctOptionId: 'B',
        feedbackByOption: {
          A: 'Electron release is oxidation, and the structural change runs from C–OH back to C=O.',
          B: 'Correct. Electrons leave QH₂, so it is oxidized as both hydroxyl-bearing positions return to carbonyls.',
          C: 'The tail does not change; electron loss is expressed at the two-oxygen head.',
          D: 'Because electrons leave as well as protons, this is a redox operation rather than only acid–base transfer.',
        },
        explanation:
          'Reversing the arrow reverses every cue: QH₂ loses two electrons and two protons as two C–OH groups return to C=O. The ledger is QH₂ → Q + 2 H⁺ + 2 e⁻, so QH₂ is oxidized.',
      },
    },
    {
      id: 'redox-practice-independent',
      kind: 'question',
      stage: 'independent',
      kcIds: ['V3-KC-271440'],
      title: 'Choose the ledger',
      prompt:
        'An oxidized quinone head becomes the complete hydroquinone endpoint. Which half-reaction matches that change?',
      options: [
        { id: 'A', label: 'QH₂ → Q + 2 H⁺ + 2 e⁻' },
        { id: 'B', label: 'Q + 2 H⁺ → QH₂ + 2 e⁻' },
        { id: 'C', label: 'Q + 2 H⁺ + 2 e⁻ → QH₂' },
        { id: 'D', label: 'Q + 2 e⁻ → QH₂' },
      ],
      help: 'Ask which side must receive both the electrons and the two hydrogens.',
      evaluation: {
        correctOptionId: 'C',
        feedbackByOption: {
          A: 'This places electrons and protons on the product side, so it describes the reverse oxidation.',
          B: 'Electrons appear as products, which would oxidize Q rather than reduce it.',
          C: 'Correct. Both electrons and both protons enter Q overall, balancing charge and the two new hydrogens.',
          D: 'The electrons balance charge, but the two new O–H bonds still require two proton sources.',
        },
        explanation:
          'Complete reduction consumes two electrons because they enter Q, and two protons because QH₂ has two additional hydrogens. The +2 and −2 inputs cancel, so the neutral endpoint charge also balances.',
        repairNodeId: 'redox-repair-ledger',
      },
    },
    {
      id: 'redox-repair-ledger',
      kind: 'repair',
      kcIds: ['V3-KC-271440'],
      sourceQuestionIds: ['redox-practice-independent'],
      title: 'Repair the electron direction',
      explanation: [
        'Start the ledger with the electron arrow: electrons on the reactant side enter Q, so Q is being reduced. Add two H⁺ next because the product contains two new O–H hydrogens. Finally, confirm that +2 and −2 cancel rather than moving electrons to the product side.',
      ],
      visual: carrierVisual(
        'electron-in',
        'Repair model emphasizing two electrons entering Q before any structure labels are read.',
        'A prominent arrow labeled “2 e⁻ enter the carrier” points from Q toward QH2. The bond labels and carrier tail are visually secondary.',
      ),
      strategy: 'Place e⁻ first, name reduction, then balance H and charge.',
      checkYourThinking: 'In a reduction ledger, are electrons reactants or products?',
    },
    {
      id: 'redox-exit-near',
      kind: 'question',
      stage: 'exit-near',
      kcIds: ['V3-KC-271440'],
      title: 'Final check · same representation',
      prompt:
        'State X has two designated C=O groups. State Y has two designated C–OH groups and the same tail. X becomes Y. Which statement is correct?',
      options: [
        { id: 'A', label: 'X accepted 2 e⁻ and was reduced to the QH₂-type endpoint.' },
        { id: 'B', label: 'X released 2 e⁻ and was oxidized.' },
        { id: 'C', label: 'The unchanged tail accepted the electrons.' },
        { id: 'D', label: 'One-electron accounting is enough for both bond changes.' },
      ],
      help: 'Read the two highlighted bond changes before considering the rest of the structure.',
      evaluation: {
        correctOptionId: 'A',
        feedbackByOption: {
          A: 'Correct. Both carbonyls become hydroxyl-bearing bonds, identifying Y as the reduced endpoint.',
          B: 'Electron release would run the structural change backward from Y to X, not from X to Y.',
          C: 'The identical tail supplies no before-and-after difference and is not the designated redox center.',
          D: 'Both designated oxygen positions change in the supplied endpoint pair, requiring the complete two-electron accounting.',
        },
        explanation:
          'The two-oxygen head moves from two C=O groups to two C–OH groups, the structural signature of the reduced endpoint. Because the tail is unchanged, it cannot alter that classification.',
        repairNodeId: 'redox-repair-center',
      },
    },
    {
      id: 'redox-repair-center',
      kind: 'repair',
      kcIds: ['V3-KC-271440'],
      sourceQuestionIds: ['redox-exit-near'],
      title: 'Repair the redox-center read',
      explanation: [
        'A redox center is the region whose electron-linked bonding changes across the arrow. Compare the same two oxygen positions: two C=O labels identify the oxidized endpoint, while two C–OH labels identify the reduced endpoint. The unchanged tail cancels from this comparison.',
      ],
      visual: carrierVisual(
        'both-oxygens',
        'Repair model highlighting both designated oxygen bond changes and muting the unchanged tail.',
        'Both designated oxygen positions are highlighted. Q has two C=O labels and QH2 has two C–OH labels. The identical tail is muted.',
      ),
      strategy: 'Box the two oxygen positions, then ignore every unchanged feature.',
      checkYourThinking: 'Which two labels differ between the endpoints?',
    },
    {
      id: 'redox-exit-changed',
      kind: 'question',
      stage: 'exit-changed',
      kcIds: ['V3-KC-271440'],
      title: 'Final check · changed context',
      prompt:
        'Carrier ZH₂ has two designated C–OH groups. It becomes Z with two C=O groups while releasing electrons; its tail is unchanged. How should ZH₂ be classified in this step?',
      options: [
        { id: 'A', label: 'Reduced, because it contains O–H bonds.' },
        { id: 'B', label: 'Oxidized, because it loses electrons as both C–OH groups become C=O.' },
        { id: 'C', label: 'Neither, because the carrier name changed.' },
        { id: 'D', label: 'Acidified, because protons must be products.' },
      ],
      help: 'Classify the operation from electron direction; use the bonds as a structural cross-check.',
      evaluation: {
        correctOptionId: 'B',
        feedbackByOption: {
          A: 'ZH₂ starts in a reduced state, but losing electrons means it is oxidized during this step.',
          B: 'Correct. ZH₂ loses electrons and both C–OH groups return to the oxidized carbonyl endpoint.',
          C: 'A placeholder name does not affect the electron rule; direction across the arrow controls the operation.',
          D: 'Protons may also leave, but electron loss is what makes the operation oxidation.',
        },
        explanation:
          'State and operation answer different questions: ZH₂ begins reduced, then is oxidized as electrons leave. The two C–OH → C=O changes provide the structural cross-check.',
        repairNodeId: 'redox-repair-operation',
      },
    },
    {
      id: 'redox-repair-operation',
      kind: 'repair',
      kcIds: ['V3-KC-271440'],
      sourceQuestionIds: ['redox-exit-changed'],
      title: 'Repair state versus operation',
      explanation: [
        '“Reduced” can describe the starting endpoint, while “is oxidized” describes what happens across the arrow. A reduced carrier that loses electrons undergoes oxidation even though its starting structure has C–OH groups. Keep state and operation in separate statements.',
      ],
      visual: {
        kind: 'boundary',
        accountingLabel: 'Starting state',
        boundaryLabel: 'Operation across the arrow',
        accountingLines: ['ZH₂ begins reduced.', 'It has two C–OH groups.'],
        boundaryLines: ['Electrons leave ZH₂.', 'ZH₂ is oxidized to Z.'],
        alt: 'Comparison of a carrier starting in a reduced state and undergoing oxidation.',
        textEquivalent:
          'ZH2 starts as the reduced endpoint with two C–OH groups. Across the arrow it loses electrons and is therefore oxidized to Z.',
      },
      strategy: 'Say “starts as…” and “is ___ during the step” as two separate statements.',
      checkYourThinking: 'If electrons leave ZH₂, what operation is occurring?',
    },
    {
      id: 'redox-complete',
      kind: 'completion',
      kcIds: ['V3-KC-271440'],
      title: 'You can trace the switch',
      summary:
        'You followed electron direction, verified both oxygen bond changes, held the tail constant, and balanced the complete endpoint ledger.',
      takeaways: [
        'Electron gain is reduction; electron loss is oxidation.',
        'Q has two designated C=O groups; QH₂ has two designated C–OH groups.',
        'Q + 2 H⁺ + 2 e⁻ → QH₂ is net accounting, not an elementary mechanism claim.',
      ],
      nextStep:
        'Next, reuse the same electron-first trace whenever a supplied carrier changes between oxidized and reduced endpoints.',
    },
  ],
  modelNodeIds: [
    'redox-model-electron-in',
    'redox-model-oxygen-one',
    'redox-model-oxygen-two',
    'redox-model-net-accounting',
    'redox-model-tail',
    'redox-model-boundary',
  ],
  workedExplanationNodeIds: ['redox-worked-trace'],
  practice: {
    guidedNodeIds: ['redox-practice-guided'],
    reducedSupportNodeIds: ['redox-practice-reduced-support'],
    independentNodeIds: ['redox-practice-independent'],
  },
  exit: {
    nearNodeIds: ['redox-exit-near'],
    changedNodeIds: ['redox-exit-changed'],
  },
  repairNodeIds: ['redox-repair-ledger', 'redox-repair-center', 'redox-repair-operation'],
  completionNodeId: 'redox-complete',
});
