import { defineDraftLesson } from '../contract';

const aminoAcidChargeLesson = defineDraftLesson({
  schemaVersion: 1,
  metadata: {
    slug: 'amino-acid-charge',
    id: 'DRAFT-LES-AA-CHARGE-001',
    contentVersion: '0.1.0',
    status: 'internal-draft',
    title: 'Predict amino acid charge as pH changes',
    internalTitle: 'Amino acid protonation and net-charge ledger',
    description:
      'Use pH and pKa one group at a time, then combine group charges without relying on memorized curves.',
    subject: 'Chemical & physical foundations',
    estimatedMinutes: 12,
  },
  knowledgeComponents: [
    {
      id: 'aa-charge-compare',
      title: 'Compare pH with pKa',
      learnerOutcome:
        'Decide whether an ionizable group is predominantly protonated or deprotonated.',
    },
    {
      id: 'aa-charge-assign',
      title: 'Assign each group charge',
      learnerOutcome: 'Translate a group’s identity and protonation state into its formal charge.',
    },
    {
      id: 'aa-charge-sum',
      title: 'Build a net-charge ledger',
      learnerOutcome: 'Add all ionizable group charges to predict the predominant net charge.',
    },
  ],
  entryChecks: [
    {
      id: 'entry-ph-pka',
      kcIds: ['aa-charge-compare'],
      title: 'Read the pH–pKa direction',
      prompt: 'When the solution pH is well below a group’s pKa, which form usually predominates?',
      options: [
        { id: 'protonated', label: 'The protonated form' },
        { id: 'deprotonated', label: 'The deprotonated form' },
        { id: 'unsure', label: 'I am not sure yet' },
      ],
      evaluation: {
        correctOptionId: 'protonated',
        feedbackByOption: {
          protonated:
            'Yes. Lower pH means more available H+, so the group tends to retain a proton.',
          deprotonated: 'The direction is reversed. Below pKa, the protonated form predominates.',
          unsure: 'That is useful to notice. The model will make this comparison explicit.',
        },
        explanation: 'Use pH below pKa → protonated; pH above pKa → deprotonated.',
        previewRouteSignalByOption: {
          protonated: 'concise',
          deprotonated: 'standard',
          unsure: 'support',
        },
      },
    },
    {
      id: 'entry-carboxyl-charge',
      kcIds: ['aa-charge-assign'],
      title: 'Name one group charge',
      prompt: 'A carboxyl group has lost H+ and is written COO−. What is its charge?',
      options: [
        { id: 'minus-one', label: '−1' },
        { id: 'zero', label: '0' },
        { id: 'plus-one', label: '+1' },
        { id: 'unsure', label: 'I am not sure yet' },
      ],
      evaluation: {
        correctOptionId: 'minus-one',
        feedbackByOption: {
          'minus-one': 'Correct. Deprotonated carboxyl is COO−, so it contributes −1.',
          zero: 'COOH is neutral, but losing H+ leaves COO− with a −1 charge.',
          'plus-one': 'Losing a positive H+ does not make the group positive; COO− is −1.',
          unsure: 'The group-charge ledger ahead will keep this visible.',
        },
        explanation:
          'A carboxyl group switches from neutral COOH to negatively charged COO− when it deprotonates.',
        previewRouteSignalByOption: {
          'minus-one': 'concise',
          zero: 'standard',
          'plus-one': 'standard',
          unsure: 'support',
        },
      },
    },
  ],
  orientation: {
    title: 'Treat net charge as a short ledger',
    plainLanguage: [
      'Amino acid charge problems become manageable when you stop trying to name the whole molecule at once.',
      'Handle one ionizable group at a time: compare pH with that group’s pKa, assign the group charge, and add the charges.',
    ],
    focusQuestion:
      'For each ionizable group, is pH above or below its pKa—and what charge follows?',
    previewPathNotes: {
      concise: 'The concise preview keeps the core comparison, then moves to the worked ledger.',
      standard:
        'The standard preview builds both the pH–pKa comparison and the group-charge ledger.',
      support:
        'The support preview separates protonation, group identity, and arithmetic before the worked ledger.',
    },
  },
  modelSteps: [
    {
      id: 'compare-first',
      kcIds: ['aa-charge-compare'],
      title: 'Compare first; do not guess the charge yet',
      explanation: [
        'pKa marks the pH where protonated and deprotonated forms are equally abundant. Far from that point, the predominant form follows a simple direction.',
        'Below pKa, keep H+. Above pKa, release H+. Make this decision before translating the group into a charge.',
      ],
      takeaway: 'Below keeps the proton; above releases the proton.',
      routes: 'all',
      figure: {
        kind: 'comparison',
        alt: 'Two cases: pH below pKa gives the protonated form, while pH above pKa gives the deprotonated form.',
        caption: 'The comparison determines protonation—not the final molecular charge.',
        items: [
          {
            heading: 'pH < pKa',
            lines: ['Predominantly protonated', 'Keep H+ on the group'],
            tone: 'accent',
          },
          {
            heading: 'pH > pKa',
            lines: ['Predominantly deprotonated', 'Remove H+ from the group'],
            tone: 'warning',
          },
        ],
      },
    },
    {
      id: 'translate-groups',
      kcIds: ['aa-charge-assign', 'aa-charge-sum'],
      title: 'Translate each state into one ledger entry',
      explanation: [
        'Protonation alone does not tell you the number to add. Group identity matters.',
        'A carboxyl group contributes 0 as COOH and −1 as COO−. An amino group contributes +1 as NH3+ and 0 as NH2.',
      ],
      takeaway: 'Write one signed number per ionizable group, then add once.',
      routes: ['standard', 'support'],
      figure: {
        kind: 'comparison',
        alt: 'Carboxyl changes from neutral COOH to negative COO minus; amino changes from positive NH3 plus to neutral NH2.',
        items: [
          {
            heading: 'Carboxyl group',
            lines: ['COOH → 0', 'COO− → −1'],
            tone: 'warning',
          },
          {
            heading: 'Amino group',
            lines: ['NH3+ → +1', 'NH2 → 0'],
            tone: 'accent',
          },
        ],
      },
    },
    {
      id: 'separate-decisions',
      kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
      title: 'Use the same four decisions every time',
      explanation: [
        'If several facts are competing for attention, use a fixed sequence. Do not combine protonation and arithmetic in your head.',
        'Finish each group’s pH–pKa comparison and charge assignment before calculating the total.',
      ],
      takeaway: 'A fixed sequence protects the direction rule from arithmetic mistakes.',
      routes: ['support'],
      figure: {
        kind: 'flow',
        alt: 'A four-step sequence: identify one group, compare pH with pKa, assign that group charge, then update the running sum.',
        steps: [
          { label: 'Name group', detail: 'carboxyl or amino' },
          { label: 'Compare', detail: 'pH vs pKa', tone: 'accent' },
          { label: 'Assign', detail: '0, −1, or +1', tone: 'warning' },
          { label: 'Add', detail: 'update net charge', tone: 'positive' },
        ],
      },
    },
  ],
  workedExample: {
    id: 'worked-glycine-neutral',
    kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
    title: 'Work a two-group ledger',
    setup:
      'Glycine is in a pH 7 solution. Its carboxyl pKa is 2.3 and its amino pKa is 9.6. Predict the predominant net charge.',
    steps: [
      {
        label: 'Carboxyl: compare',
        reasoning: 'pH 7 is above pKa 2.3, so the carboxyl is predominantly deprotonated as COO−.',
      },
      {
        label: 'Carboxyl: assign',
        reasoning: 'COO− contributes −1 to the ledger.',
      },
      {
        label: 'Amino: compare and assign',
        reasoning:
          'pH 7 is below pKa 9.6, so the amino group stays protonated as NH3+ and contributes +1.',
      },
      {
        label: 'Add once',
        reasoning: 'The ledger is −1 + 1 = 0.',
      },
    ],
    conclusion:
      'The predominant glycine form at pH 7 has net charge 0, even though it contains two charged groups.',
    figure: {
      kind: 'svg',
      alt: 'A charge ledger with carboxyl COO minus contributing minus one and amino NH3 plus contributing plus one, summing to net zero.',
      viewBox: [0, 0, 620, 170],
      shapes: [
        {
          kind: 'rect',
          x: 20,
          y: 30,
          width: 170,
          height: 80,
          radius: 14,
          tone: 'warning',
        },
        {
          kind: 'text',
          x: 105,
          y: 63,
          text: 'COO−',
          anchor: 'middle',
          weight: 'bold',
          tone: 'warning',
        },
        {
          kind: 'text',
          x: 105,
          y: 91,
          text: '−1',
          anchor: 'middle',
          tone: 'warning',
        },
        {
          kind: 'text',
          x: 220,
          y: 79,
          text: '+',
          anchor: 'middle',
          weight: 'bold',
        },
        {
          kind: 'rect',
          x: 250,
          y: 30,
          width: 170,
          height: 80,
          radius: 14,
          tone: 'accent',
        },
        {
          kind: 'text',
          x: 335,
          y: 63,
          text: 'NH3+',
          anchor: 'middle',
          weight: 'bold',
          tone: 'accent',
        },
        {
          kind: 'text',
          x: 335,
          y: 91,
          text: '+1',
          anchor: 'middle',
          tone: 'accent',
        },
        {
          kind: 'line',
          x1: 440,
          y1: 70,
          x2: 490,
          y2: 70,
          arrowEnd: true,
          tone: 'primary',
        },
        {
          kind: 'text',
          x: 550,
          y: 65,
          text: 'Net 0',
          anchor: 'middle',
          weight: 'bold',
          tone: 'positive',
        },
        {
          kind: 'text',
          x: 550,
          y: 93,
          text: 'zwitterion',
          anchor: 'middle',
          tone: 'muted',
        },
      ],
      caption: 'Charged groups can cancel; “net 0” does not mean “no charged groups.”',
    },
  },
  practice: {
    guided: [
      {
        id: 'practice-glycine-ph1',
        kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
        title: 'Build the ledger with the comparisons shown',
        context:
          'Glycine at pH 1: carboxyl pKa = 2.3; amino pKa = 9.6. Both groups are predominantly protonated.',
        prompt: 'What is the predominant net charge?',
        options: [
          { id: 'plus-one', label: '+1' },
          { id: 'zero', label: '0' },
          { id: 'minus-one', label: '−1' },
          { id: 'plus-two', label: '+2' },
        ],
        hint: 'Translate protonated carboxyl as 0 and protonated amino as +1.',
        evaluation: {
          correctOptionId: 'plus-one',
          feedbackByOption: {
            'plus-one': 'Yes. COOH contributes 0 and NH3+ contributes +1.',
            zero: 'The carboxyl is neutral here, but the protonated amino group contributes +1.',
            'minus-one':
              'A negative carboxyl would require COO−; at pH 1 it is predominantly COOH.',
            'plus-two': 'Protonated carboxyl COOH is neutral, not +1.',
          },
          explanation: 'The two ledger entries are 0 and +1, so the net charge is +1.',
          repairId: 'repair-group-charge',
        },
      },
    ],
    light: [
      {
        id: 'practice-glycine-ph11',
        kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
        title: 'Build the same ledger with less help',
        context: 'Glycine at pH 11: carboxyl pKa = 2.3; amino pKa = 9.6.',
        prompt: 'What is the predominant net charge?',
        options: [
          { id: 'plus-one', label: '+1' },
          { id: 'zero', label: '0' },
          { id: 'minus-one', label: '−1' },
          { id: 'minus-two', label: '−2' },
        ],
        hint: 'At pH 11, the solution pH is above both pKa values.',
        evaluation: {
          correctOptionId: 'minus-one',
          feedbackByOption: {
            'plus-one':
              'Above both pKa values, neither group remains in its positively charged form.',
            zero: 'The amino group becomes neutral, but COO− still contributes −1.',
            'minus-one': 'Correct. COO− contributes −1 and NH2 contributes 0.',
            'minus-two': 'Deprotonated amino NH2 is neutral, not −1.',
          },
          explanation: 'The ledger is carboxyl −1 plus amino 0, for net −1.',
          repairId: 'repair-ph-direction',
        },
      },
    ],
    solo: [
      {
        id: 'practice-aspartate-ph7',
        kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
        title: 'Add a third ionizable group',
        context:
          'Aspartate at pH 7: α-carboxyl pKa = 2.1; side-chain carboxyl pKa = 3.9; α-amino pKa = 9.8.',
        prompt: 'What is the predominant net charge?',
        options: [
          { id: 'plus-one', label: '+1' },
          { id: 'zero', label: '0' },
          { id: 'minus-one', label: '−1' },
          { id: 'minus-two', label: '−2' },
        ],
        evaluation: {
          correctOptionId: 'minus-one',
          feedbackByOption: {
            'plus-one': 'Both carboxyl groups are above pKa and contribute negative charges.',
            zero: 'One +1 amino charge does not cancel two −1 carboxyl charges.',
            'minus-one': 'Correct. The ledger is −1 −1 +1 = −1.',
            'minus-two': 'The amino group is still protonated at pH 7 and contributes +1.',
          },
          explanation:
            'Both carboxyl groups are COO−, while the amino group is NH3+: −1 −1 +1 = −1.',
          repairId: 'repair-charge-sum',
        },
      },
    ],
  },
  exits: {
    near: [
      {
        id: 'exit-lysine-ph7',
        kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
        title: 'Use the ledger on a basic side chain',
        context:
          'Lysine at pH 7: α-carboxyl pKa = 2.2; α-amino pKa = 9.0; side-chain amino pKa = 10.5.',
        prompt: 'What is the predominant net charge?',
        options: [
          { id: 'plus-two', label: '+2' },
          { id: 'plus-one', label: '+1' },
          { id: 'zero', label: '0' },
          { id: 'minus-one', label: '−1' },
        ],
        evaluation: {
          correctOptionId: 'plus-one',
          feedbackByOption: {
            'plus-two': 'Both amino groups are +1, but the carboxyl contributes −1.',
            'plus-one': 'Correct. The ledger is −1 +1 +1 = +1.',
            zero: 'The two protonated amino groups outweigh the one negative carboxyl.',
            'minus-one': 'This leaves out the two +1 amino-group entries.',
          },
          explanation: 'At pH 7, the carboxyl is −1 and both amino groups are +1, giving net +1.',
          repairId: 'repair-charge-sum',
        },
      },
    ],
    changed: [
      {
        id: 'exit-histidine-ph8',
        kcIds: ['aa-charge-compare', 'aa-charge-assign', 'aa-charge-sum'],
        title: 'Change the side-chain chemistry',
        context:
          'Histidine at pH 8: α-carboxyl pKa = 1.8; imidazole side-chain pKa = 6.0; α-amino pKa = 9.2. Protonated imidazole is +1; deprotonated imidazole is neutral.',
        prompt: 'What is the predominant net charge?',
        options: [
          { id: 'plus-one', label: '+1' },
          { id: 'zero', label: '0' },
          { id: 'minus-one', label: '−1' },
          { id: 'minus-two', label: '−2' },
        ],
        evaluation: {
          correctOptionId: 'zero',
          feedbackByOption: {
            'plus-one': 'At pH 8, the imidazole side chain is above its pKa and is neutral.',
            zero: 'Correct. The ledger is carboxyl −1, imidazole 0, and amino +1.',
            'minus-one': 'The α-amino group is below pKa 9.2 and still contributes +1.',
            'minus-two': 'Neutral imidazole and protonated amino do not add negative entries.',
          },
          explanation:
            'The three entries are −1 + 0 + 1, so histidine is predominantly net neutral at pH 8.',
          repairId: 'repair-ph-direction',
        },
      },
    ],
  },
  targetedRepairs: [
    {
      id: 'repair-ph-direction',
      kcIds: ['aa-charge-compare'],
      title: 'Repair the pH–pKa direction',
      explanation: [
        'Imagine pH as the environment’s tendency to supply or remove H+. Lower pH favors keeping a proton; higher pH favors releasing it.',
        'Compare pH with each pKa separately. Do not use one group’s pKa for the whole molecule.',
      ],
      strategy: 'Write “below = keep H+” and “above = release H+” beside every pKa comparison.',
      checkYourThinking:
        'If pH rises from below to above a group’s pKa, should that group gain or lose H+?',
      figure: {
        kind: 'flow',
        alt: 'As pH rises across pKa, a group changes from predominantly protonated to predominantly deprotonated.',
        steps: [
          { label: 'pH below pKa', detail: 'keep H+', tone: 'accent' },
          { label: 'Cross pKa', detail: 'equal mixture', tone: 'muted' },
          { label: 'pH above pKa', detail: 'release H+', tone: 'warning' },
        ],
      },
    },
    {
      id: 'repair-group-charge',
      kcIds: ['aa-charge-assign'],
      title: 'Repair the group-charge translation',
      explanation: [
        'Adding or removing H+ changes a group by one charge unit, but the starting charge depends on group identity.',
        'Carboxyl: COOH is 0 and COO− is −1. Amino: NH3+ is +1 and NH2 is 0.',
      ],
      strategy: 'Name the written group form before assigning its signed ledger entry.',
      checkYourThinking: 'Which protonated group is neutral—carboxyl COOH or amino NH3+?',
    },
    {
      id: 'repair-charge-sum',
      kcIds: ['aa-charge-sum'],
      title: 'Repair the final charge sum',
      explanation: [
        'Do not collapse repeated groups. A molecule with two carboxyl groups needs two separate carboxyl entries.',
        'List every signed contribution in one row, then perform the arithmetic once.',
      ],
      strategy:
        'Count ionizable groups, write the same number of ledger entries, and only then sum.',
      checkYourThinking: 'How many signed entries should lysine have at physiological pH?',
    },
  ],
  recap: {
    title: 'Carry the ledger into the next problem',
    summary:
      'You used one repeatable model across neutral, acidic, basic, and imidazole side chains.',
    takeaways: [
      'Below pKa favors the protonated form; above pKa favors the deprotonated form.',
      'Translate protonation into charge using the group’s identity.',
      'Write one charge per ionizable group and add only after the ledger is complete.',
    ],
    nextStep:
      'Use the same ledger when a problem asks for an isoelectric range or the direction an amino acid moves in an electric field.',
  },
});

export default aminoAcidChargeLesson;
