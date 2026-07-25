import { accounting, buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const BALANCE_KC = 'V3-KC-171746';

const balanceSection: LessonSectionAuthoring = {
  key: 'stoich-balance',
  kcId: BALANCE_KC,
  stageLabel: 'Balancing',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Spot the illegal move',
    'A student balances propane combustion, C₃H₈ + O₂ → CO₂ + H₂O, by rewriting it as C₃H₈ + O₂ → C₃O₆ + H₈. What is the core error?',
    [
      [
        'They changed subscripts to force the counts to match.',
        'Correct. Subscripts define the substances; balancing may adjust only the coefficients in front of formulas.',
      ],
      [
        'They forgot to write a catalyst above the arrow.',
        'A catalyst is not required to balance an equation, and inventing new formulas is the real problem.',
      ],
      [
        'The reaction simply cannot be balanced.',
        'It balances cleanly with coefficients; the student changed the compounds instead.',
      ],
      [
        'Oxygen should appear only on the reactant side.',
        'Oxygen legitimately appears in both products here; the rewrite changed the molecules themselves.',
      ],
    ],
    'A',
    'A balanced equation conserves atoms of every element. You may place coefficients in front of whole formulas, but changing a subscript changes the identity of the substance.',
    'Ask what each edit changes: a coefficient counts molecules; a subscript redefines the molecule.',
    'Balancing conserves atoms — it never invents new compounds.',
    accounting(
      'C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O',
      [
        { label: 'Carbon (C)', reactants: '3', products: '3 (in 3 CO₂)' },
        { label: 'Hydrogen (H)', reactants: '8', products: '8 (in 4 H₂O)' },
        { label: 'Oxygen (O)', reactants: '10 (in 5 O₂)', products: '10 (6 + 4)' },
      ],
      'Atom ledger for balanced propane combustion',
      'With coefficients 1, 5, 3, 4 the equation carries 3 C, 8 H, and 10 O on each side.',
      'Every element balances once the coefficients are set — the formulas never change.',
    ),
  ),
  model: {
    title: 'Balance by counting, not by rewriting',
    supportingLine: 'Coefficients are the only knob; conservation of atoms is the rule.',
    explanation: [
      'A chemical equation is balanced when each element has the same number of atoms on both sides. Matter is conserved, so atoms are only rearranged, never created or destroyed.',
      'The only legal edit is the coefficient in front of a formula. Changing a subscript turns one substance into another, so it is never a balancing move. A reliable order is: balance the most complex molecule first, then the element that appears in the fewest places, and save free elements such as O₂ for last.',
    ],
    visual: accounting(
      'C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O',
      [
        { label: 'Carbon (C)', reactants: '3', products: '3' },
        { label: 'Hydrogen (H)', reactants: '8', products: '8' },
        { label: 'Oxygen (O)', reactants: '10', products: '10' },
      ],
      'Balanced ledger with coefficients highlighted',
      'Coefficients 1, 5, 3, 4 make carbon, hydrogen, and oxygen each total the same on both sides.',
      'Set coefficients so every row on the left equals the right.',
    ),
    takeaway: 'If a subscript changed, you changed the chemistry — recount and adjust coefficients instead.',
  },
  understandingCheck: question(
    'Finish the oxygen count',
    'For C₃H₈ + O₂ → CO₂ + H₂O, the carbons and hydrogens are set with 3 CO₂ and 4 H₂O. How many O₂ molecules balance oxygen?',
    [
      ['5 O₂', 'Correct. The products hold 3×2 + 4 = 10 oxygen atoms, and 10 ÷ 2 = 5 O₂.'],
      ['3 O₂', 'That supplies only 6 oxygen atoms; the products need 10.'],
      ['7 O₂', 'That supplies 14 oxygen atoms — more than the 10 the products contain.'],
      ['4 O₂', 'That supplies 8 oxygen atoms; two atoms short of the 10 needed.'],
    ],
    'A',
    'Once carbon and hydrogen fix the product coefficients, oxygen on the right totals 10 atoms. Since O₂ carries 2 atoms, 5 O₂ balances it.',
    'Add the oxygens in the products first, then divide by the 2 atoms in each O₂.',
  ),
  worked: {
    title: 'Walk through the propane balance',
    supportingLine: 'Complex molecule first, free element last.',
    explanation: [
      'Start with the carbons: C₃H₈ has 3 carbons, so write 3 CO₂. Next the hydrogens: 8 hydrogens require 4 H₂O. Only now count oxygen on the right: 3×2 + 4×1 = 10 atoms.',
      'Oxygen enters as O₂, so 10 atoms need 5 O₂. The final equation, C₃H₈ + 5 O₂ → 3 CO₂ + 4 H₂O, has 3 C, 8 H, and 10 O on each side.',
    ],
    visual: relations(
      'Order of balancing steps for propane combustion',
      'Balance carbon, then hydrogen, then oxygen last because oxygen appears as a free element.',
      [
        {
          label: 'Balancing order',
          nodes: [
            { label: 'Carbon', detail: '→ 3 CO₂', emphasis: 'active' },
            { label: 'Hydrogen', detail: '→ 4 H₂O' },
            { label: 'Oxygen', detail: '→ 5 O₂ (last)' },
          ],
          links: ['then', 'then'],
        },
      ],
      'Free elements like O₂ are easiest to adjust after everything else is fixed.',
    ),
    takeaway: 'What to notice: fixing carbon and hydrogen first makes the oxygen count fall out automatically.',
  },
  guided: question(
    'Balance water formation',
    'Balance H₂ + O₂ → H₂O using the smallest whole-number coefficients.',
    [
      ['2 H₂ + O₂ → 2 H₂O', 'Correct. That gives 4 H and 2 O on each side with whole numbers.'],
      ['H₂ + O₂ → H₂O', 'Left has 2 oxygens but the right has only 1; it is not balanced.'],
      ['2 H₂ + 2 O₂ → 2 H₂O', 'Now oxygen is 4 on the left but 2 on the right.'],
      ['H₂ + O₂ → H₂O₂', 'That changes the product to hydrogen peroxide instead of balancing water.'],
    ],
    'A',
    'Two water molecules need 4 hydrogens (2 H₂) and 2 oxygens (1 O₂). The result uses the smallest whole-number set.',
    'Match oxygen first here, then confirm hydrogen with the smallest integers.',
  ),
  reducedSupport: question(
    'Balance ammonia synthesis',
    'Balance N₂ + H₂ → NH₃ with the smallest whole-number coefficients.',
    [
      ['N₂ + 3 H₂ → 2 NH₃', 'Correct. That gives 2 N and 6 H on each side.'],
      ['N₂ + H₂ → NH₃', 'Nitrogen and hydrogen are both short on the right.'],
      ['N₂ + 3 H₂ → NH₃', 'Nitrogen is 2 on the left but only 1 on the right.'],
      ['2 N₂ + 3 H₂ → 2 NH₃', 'Nitrogen becomes 4 on the left versus 2 on the right.'],
    ],
    'A',
    'Two NH₃ molecules require 2 nitrogens (1 N₂) and 6 hydrogens (3 H₂), the smallest whole-number solution.',
    'Let the diatomic N₂ set the product coefficient, then supply the hydrogens.',
  ),
  independent: question(
    'Balance rust formation',
    'Balance Fe + O₂ → Fe₂O₃ with the smallest whole-number coefficients.',
    [
      ['4 Fe + 3 O₂ → 2 Fe₂O₃', 'Correct. That gives 4 Fe and 6 O on each side.'],
      ['2 Fe + O₂ → Fe₂O₃', 'Oxygen is 2 on the left but 3 on the right.'],
      ['Fe + O₂ → Fe₂O₃', 'Neither iron nor oxygen balances.'],
      ['4 Fe + 6 O₂ → 2 Fe₂O₃', 'Oxygen becomes 12 on the left versus 6 on the right.'],
    ],
    'A',
    'Two Fe₂O₃ units contain 4 Fe and 6 O. Six oxygen atoms come from 3 O₂, giving the smallest whole-number set.',
  ),
  near: question(
    'Balance ethane combustion',
    'Balance C₂H₆ + O₂ → CO₂ + H₂O with the smallest whole-number coefficients.',
    [
      ['2 C₂H₆ + 7 O₂ → 4 CO₂ + 6 H₂O', 'Correct. That gives 4 C, 12 H, and 14 O on each side.'],
      ['C₂H₆ + O₂ → CO₂ + H₂O', 'Every element is short on the product side.'],
      ['C₂H₆ + 7 O₂ → 2 CO₂ + 3 H₂O', 'Oxygen is 14 on the left but only 7 on the right.'],
      ['2 C₂H₆ + 5 O₂ → 4 CO₂ + 6 H₂O', 'That supplies 10 oxygen atoms, but the products need 14.'],
    ],
    'A',
    'Balancing C then H gives 4 CO₂ and 6 H₂O for 2 C₂H₆, which need 14 oxygens, or 7 O₂.',
  ),
  changed: question(
    'Clear a fractional coefficient',
    'Balancing butane, C₄H₁₀ + O₂ → CO₂ + H₂O, gives C₄H₁₀ + 13/2 O₂ → 4 CO₂ + 5 H₂O. What is the standard final step?',
    [
      [
        'Multiply every coefficient by 2 to clear the fraction.',
        'Correct. Doubling gives 2 C₄H₁₀ + 13 O₂ → 8 CO₂ + 10 H₂O, all whole numbers, still balanced.',
      ],
      [
        'Round 13/2 up to 7 O₂.',
        'Rounding breaks the balance; 7 O₂ would supply 14 oxygens instead of 13.',
      ],
      [
        'Change H₂O to H₂O₂ to absorb the extra oxygen.',
        'That alters a substance; balancing never edits formulas.',
      ],
      [
        'Leave the fraction, since coefficients may be any number.',
        'Convention requires the smallest whole-number coefficients, so the fraction must be cleared.',
      ],
    ],
    'A',
    'A fractional coefficient is balanced but not in conventional form. Multiplying the whole equation by the denominator clears it while preserving the balance.',
  ),
  repair: {
    title: 'Recount, then adjust only coefficients',
    supportingLine: 'Most errors come from editing a formula or forgetting free elements.',
    explanation: [
      'Make an atom ledger: list each element and its count on both sides. Adjust a coefficient, then recount — never touch a subscript.',
      'Handle the most complex molecule first and free elements such as O₂ last. If a fraction appears, multiply the whole equation to reach the smallest whole numbers.',
    ],
    visual: relations(
      'Balancing repair loop',
      'Count atoms, change a coefficient, recount, and clear fractions — without ever editing a subscript.',
      [
        {
          label: 'Repair steps',
          nodes: [
            { label: 'Ledger atoms', emphasis: 'active' },
            { label: 'Adjust coefficient' },
            { label: 'Recount' },
            { label: 'Clear fractions' },
          ],
          links: ['then', 'then', 'if needed'],
        },
      ],
    ),
    strategy: 'Keep a running atom count and change one coefficient at a time.',
    checkYourThinking: 'Did any edit change a subscript? If so, it changed the chemistry, not the balance.',
  },
  recap: {
    title: 'You can balance by conserving atoms',
    explanation: [
      'You fixed carbon and hydrogen first, let oxygen fall out last, and cleared fractions to whole numbers — all by moving coefficients only. The same ledger extends to charge balance and to mole ratios for limiting-reagent work.',
    ],
    visual: accounting(
      '2 C₄H₁₀ + 13 O₂ → 8 CO₂ + 10 H₂O',
      [
        { label: 'Carbon (C)', reactants: '8', products: '8' },
        { label: 'Hydrogen (H)', reactants: '20', products: '20' },
        { label: 'Oxygen (O)', reactants: '26', products: '26' },
      ],
      'Balanced butane combustion after clearing the fraction',
      'Doubling gives 8 C, 20 H, and 26 O on each side with whole-number coefficients.',
      'A balanced equation is the foundation for mole and yield calculations.',
    ),
    takeaway: 'A balanced equation is a conserved atom ledger, not a rewritten set of formulas.',
  },
};

const { script: STOICHIOMETRY_SCRIPT, presentation: STOICHIOMETRY_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-915978',
    contentVersion: 'app-native-stoichiometry-v1.0.0',
    slug: 'stoichiometric-accounting',
    title: 'Balance reactions by conserving atoms',
    internalTitle: 'Stoichiometric and redox accounting · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Balance chemical equations by adjusting only coefficients, keeping an atom ledger, and clearing fractional coefficients to whole numbers.',
    estimatedMinutes: 14,
    requiredKcs: [
      {
        id: BALANCE_KC,
        title: 'Balance chemical equations',
        learnerOutcome:
          'Balance a chemical equation by adjusting coefficients to conserve atoms of every element.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-892484',
        title: 'Relate formulas, moles, and composition',
        learnerOutcome: 'Read a formula as a fixed atom-count ledger for later mole reasoning.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-378841',
        title: 'Assign oxidation states and redox roles',
        learnerOutcome: 'Recognize that redox accounting extends the same conservation bookkeeping.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-742978',
        title: 'Determine limiting reactants and yields',
        learnerOutcome: 'See how balanced coefficients set the mole ratios used for yields.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given an unbalanced equation, balance it with the smallest whole-number coefficients by conserving atoms and never editing subscripts.',
    intro: {
      id: 'stoich-intro',
      title: 'Balance reactions by conserving atoms',
      outcome: 'Balance any equation by moving coefficients so every element is conserved.',
      details: [
        'Use combustion and synthesis reactions to practice a reliable balancing order and to clear fractional coefficients.',
      ],
      kcIds: [BALANCE_KC],
    },
    sections: [balanceSection],
    completion: {
      id: 'stoich-complete',
      title: 'You can balance by conservation',
      summary:
        'You balanced combustion and synthesis reactions by counting atoms, adjusting only coefficients, and reducing to whole numbers.',
      takeaways: [
        'Only coefficients may change; subscripts define the substances.',
        'Balance complex molecules first and free elements like O₂ last.',
        'Clear fractional coefficients by multiplying the whole equation.',
      ],
      nextStep: 'Carry the balanced mole ratios into limiting-reagent and yield problems.',
      kcIds: [BALANCE_KC],
    },
  });

export { STOICHIOMETRY_SCRIPT, STOICHIOMETRY_PRESENTATION };
