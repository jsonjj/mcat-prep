import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const EQ_KC = 'V3-KC-714060';

function stressMap(caption?: string) {
  return relations(
    'Le Chatelier stress-and-response map',
    'A system at equilibrium partially counteracts an applied stress. Adding a species shifts away from it, increasing pressure shifts toward fewer gas moles, and for an exothermic reaction raising temperature shifts toward reactants.',
    [
      {
        label: 'Concentration and pressure (K unchanged)',
        nodes: [
          { label: 'Add a species', detail: 'shift away from it', emphasis: 'active' },
          { label: 'Remove a species', detail: 'shift toward it' },
          { label: 'Raise pressure', detail: 'shift to fewer gas moles' },
        ],
        links: ['then', 'then'],
      },
      {
        label: 'Temperature (K changes)',
        continuationLabel: 'treat heat as a reactant or product',
        nodes: [
          { label: 'Exothermic', detail: 'heat is a product' },
          { label: 'Raise T', detail: 'shift toward reactants', emphasis: 'active' },
          { label: 'K itself', detail: 'decreases' },
        ],
        links: ['so', 'and'],
      },
    ],
    caption,
  );
}

const equilibriumSection: LessonSectionAuthoring = {
  key: 'eq-shift',
  kcId: EQ_KC,
  stageLabel: 'Equilibrium shifts',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Add a reactant',
    'For N₂(g) + 3 H₂(g) ⇌ 2 NH₃(g) at equilibrium, more N₂ is injected. Which way does the system shift?',
    [
      ['Toward products (right), consuming some added N₂.', 'Correct. The system partially counteracts the added reactant by making more product.'],
      ['Toward reactants (left), making more N₂.', 'That would add to the stress rather than relieve it.'],
      ['No shift, because a catalyst is not present.', 'Catalysts are unrelated; a concentration change alone shifts the position.'],
      ['No shift, because the amounts are already fixed.', 'Adding a species disturbs equilibrium and forces a response.'],
    ],
    'A',
    'Le Chatelier\u2019s principle: a system at equilibrium responds to a stress by shifting to partially oppose it. Adding N₂ pushes the reaction toward products.',
    'Ask which direction consumes some of what you just added.',
    'A stressed equilibrium shifts to partially undo the stress.',
    stressMap('Add a reactant, shift toward products.'),
  ),
  model: {
    title: 'Shift to oppose the stress',
    supportingLine: 'Concentration and pressure move the position; only temperature moves K.',
    explanation: [
      'At equilibrium the forward and reverse rates are equal. A stress—added or removed species, changed pressure, or changed temperature—makes the system shift in the direction that partially opposes the change.',
      'Adding or removing a species, or changing pressure, shifts the position but leaves the equilibrium constant K unchanged. Only a temperature change alters K. For gases, raising pressure (shrinking volume) shifts toward the side with fewer moles of gas.',
    ],
    visual: stressMap('Read the stress, then shift to counteract it.'),
    takeaway: 'Concentration and pressure relocate the balance point; temperature rewrites K itself.',
  },
  understandingCheck: question(
    'Remove a product',
    'In the same ammonia equilibrium, NH₃ is continuously removed as it forms. What happens?',
    [
      ['The system shifts toward products to replace the removed NH₃.', 'Correct. Removing a product pulls the reaction forward.'],
      ['The system shifts toward reactants.', 'Removing a product does not favor the reverse direction.'],
      ['Nothing, because total mass is conserved.', 'Mass is conserved, but removing a species still disturbs the balance and forces a shift.'],
      ['K increases because more product forms.', 'K is fixed at constant temperature; only the position moves.'],
    ],
    'A',
    'Removing a product is a stress the system opposes by making more product, so the equilibrium shifts to the right. K stays the same because temperature did not change.',
    'Removing a species pulls the reaction toward that species.',
  ),
  worked: {
    title: 'Work through a pressure change',
    supportingLine: 'Count gas moles on each side.',
    explanation: [
      'The forward reaction converts 1 + 3 = 4 moles of gas into 2 moles of gas. Raising the pressure by compressing the container stresses the system toward whichever side occupies less volume.',
      'Fewer gas moles means less volume, so the system shifts toward the product side (2 moles) to relieve the pressure. If the two sides had equal moles of gas, pressure changes would cause no shift.',
    ],
    visual: relations(
      'Pressure shift by mole count',
      'The reactant side has 4 moles of gas and the product side has 2, so higher pressure shifts toward the products.',
      [
        {
          label: 'Gas mole count',
          nodes: [
            { label: 'Reactants', detail: '4 mol gas' },
            { label: 'Products', detail: '2 mol gas', emphasis: 'active' },
          ],
          links: ['raise P → fewer moles'],
        },
      ],
    ),
    takeaway: 'What to notice: pressure only matters when the two sides differ in moles of gas.',
  },
  guided: question(
    'Change the temperature',
    'The ammonia synthesis is exothermic. If the temperature is raised, which way does the equilibrium shift?',
    [
      ['Toward reactants, because heat acts like a product being added.', 'Correct. For an exothermic reaction, added heat is opposed by shifting left, and K decreases.'],
      ['Toward products, because heat speeds the forward reaction.', 'Heat speeds both directions; the equilibrium position shifts left for an exothermic reaction.'],
      ['No shift, because temperature changes only rates.', 'Temperature uniquely changes K and therefore the position.'],
      ['Toward products, and K increases.', 'For an exothermic reaction, higher T lowers K and favors reactants.'],
    ],
    'A',
    'Write heat as a product for an exothermic reaction. Adding heat (raising T) shifts the system toward reactants and decreases K.',
    'Treat heat as a product for exothermic reactions.',
  ),
  reducedSupport: question(
    'Add a catalyst',
    'A catalyst is added to a gas-phase reaction already at equilibrium. What is the effect on the equilibrium position?',
    [
      ['No shift; the catalyst speeds both directions equally.', 'Correct. A catalyst lowers the activation barrier for forward and reverse alike, so it changes only how fast equilibrium is reached.'],
      ['Shifts toward products, increasing yield.', 'Catalysts do not change the equilibrium position or K.'],
      ['Shifts toward reactants.', 'A catalyst does not favor either direction.'],
      ['Increases K.', 'K depends on temperature, not on catalysts.'],
    ],
    'A',
    'A catalyst accelerates the forward and reverse reactions by the same factor, so the equilibrium position and K are unchanged. It only shortens the time to reach equilibrium.',
    'A catalyst changes speed, not the balance point.',
  ),
  independent: question(
    'Maximize the yield',
    'To increase the equilibrium yield of NH₃ from the exothermic synthesis, which single change works?',
    [
      ['Lower the temperature.', 'Correct. For an exothermic reaction, lower T shifts toward products and raises K.'],
      ['Raise the temperature.', 'Higher T favors reactants for an exothermic reaction, lowering yield.'],
      ['Decrease the total pressure.', 'Lower pressure favors the side with more gas moles (reactants), reducing yield.'],
      ['Add an inert gas at constant volume.', 'That raises total pressure without changing partial pressures, so it causes no shift.'],
    ],
    'A',
    'The forward reaction is exothermic and reduces gas moles, so products are favored by lower temperature and higher pressure. Of the options, lowering temperature increases the yield.',
  ),
  near: question(
    'Predict a concentration shift',
    'For 2 SO₂(g) + O₂(g) ⇌ 2 SO₃(g), extra O₂ is added at equilibrium. Which way does it shift?',
    [
      ['Toward products (right).', 'Correct. Adding a reactant shifts the system toward products to consume some of it.'],
      ['Toward reactants (left).', 'That would increase the added reactant rather than consume it.'],
      ['No shift, because O₂ is a reactant already present.', 'Adding more of any species still disturbs the balance.'],
      ['No shift, because moles of gas differ.', 'Differing gas moles matter for pressure changes, not for adding a species.'],
    ],
    'A',
    'Adding O₂ increases a reactant, so the system shifts right to partially consume it and form more SO₃.',
  ),
  changed: question(
    'Does K change?',
    'Two changes are made to a reaction at equilibrium: (1) more reactant is added, and (2) the temperature is raised. For which change does the equilibrium constant K itself change?',
    [
      ['Only the temperature change alters K.', 'Correct. Concentration changes move the position but not K; only temperature changes K.'],
      ['Both changes alter K.', 'Adding reactant shifts the position while K stays fixed at constant temperature.'],
      ['Only adding reactant alters K.', 'Adding reactant changes the position, not K.'],
      ['Neither change alters K.', 'Temperature changes do alter K.'],
    ],
    'A',
    'K is constant at a fixed temperature, so concentration or pressure changes shift the position without changing K. Changing the temperature is the one stress that changes K.',
  ),
  repair: {
    title: 'Name the stress, then oppose it',
    supportingLine: 'The frequent error is thinking every stress changes K.',
    explanation: [
      'Identify the stress type: species added or removed, pressure/volume change, or temperature change. Then shift in the direction that partially opposes it.',
      'For pressure, compare moles of gas on each side. For temperature, write heat as a product (exothermic) or reactant (endothermic). Remember: only temperature changes K, and catalysts change neither position nor K.',
    ],
    visual: stressMap('Classify the stress first, then apply the counteracting shift.'),
    strategy: 'Sort the change into concentration, pressure, or temperature before predicting.',
    checkYourThinking: 'Does this change move only the position, or does it also change K?',
  },
  recap: {
    title: 'You can predict equilibrium shifts',
    explanation: [
      'You applied Le Chatelier\u2019s principle to concentration, pressure, and temperature changes, and separated shifts that move the position from the one change—temperature—that rewrites K. Catalysts change only the speed of approach.',
    ],
    visual: stressMap('One principle handles concentration, pressure, and temperature stresses.'),
    takeaway: 'A stressed equilibrium shifts to oppose the stress; only temperature changes K.',
  },
};

const { script: EQUILIBRIUM_SHIFTS_SCRIPT, presentation: EQUILIBRIUM_SHIFTS_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-315313',
    contentVersion: 'app-native-equilibrium-v1.0.0',
    slug: 'equilibrium-shifts',
    title: 'Predict how equilibria respond to stress',
    internalTitle: 'Chemical kinetics and equilibrium response · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Apply Le Chatelier\u2019s principle to predict equilibrium shifts from concentration, pressure, and temperature changes, and tell which change alters K.',
    estimatedMinutes: 14,
    requiredKcs: [
      {
        id: EQ_KC,
        title: 'Predict equilibrium perturbations',
        learnerOutcome:
          'Predict the direction of an equilibrium shift after a concentration, pressure, or temperature change.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-573055',
        title: 'Interpret reaction-energy profiles',
        learnerOutcome: 'Recall that exothermic and endothermic labels come from the energy profile.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-538252',
        title: 'Distinguish catalysis and reaction control',
        learnerOutcome: 'Recognize that a catalyst speeds both directions without shifting equilibrium.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-947249',
        title: 'Infer rate laws and reaction order',
        learnerOutcome: 'See that kinetics governs the approach to the equilibrium studied here.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-980903',
        title: 'Predict temperature effects on rate',
        learnerOutcome: 'Separate temperature\u2019s effect on rate from its effect on K.',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given an equilibrium and an applied stress, predict the shift direction and state whether K changes.',
    intro: {
      id: 'eq-intro',
      title: 'Predict how equilibria respond to stress',
      outcome: 'Predict shift direction for concentration, pressure, and temperature changes.',
      details: [
        'Use Le Chatelier\u2019s principle and separate changes that move the position from the one that changes K.',
      ],
      kcIds: [EQ_KC],
    },
    sections: [equilibriumSection],
    completion: {
      id: 'eq-complete',
      title: 'You can predict equilibrium responses',
      summary:
        'You predicted shifts from concentration, pressure, and temperature stresses and identified temperature as the only change that alters K.',
      takeaways: [
        'A system shifts to partially oppose any applied stress.',
        'Pressure shifts toward the side with fewer moles of gas.',
        'Only temperature changes K; catalysts change neither position nor K.',
      ],
      nextStep: 'Combine these shifts with rate reasoning to optimize real reaction conditions.',
      kcIds: [EQ_KC],
    },
  });

export { EQUILIBRIUM_SHIFTS_SCRIPT, EQUILIBRIUM_SHIFTS_PRESENTATION };
