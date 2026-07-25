import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const ENERGY_KC = 'V3-KC-554697';

function energyBar(caption?: string) {
  return relations(
    'Mechanical-energy exchange on a frictionless track',
    'With only conservative forces, kinetic plus potential energy stays constant. As height falls, potential energy converts fully into kinetic energy, so the total is unchanged.',
    [
      {
        label: 'At the top (at rest)',
        nodes: [
          { label: 'PE = mgh', detail: 'maximum', emphasis: 'active' },
          { label: 'KE = 0', detail: 'v = 0' },
          { label: 'Total E', detail: 'mgh' },
        ],
        links: ['+', '=' ],
      },
      {
        label: 'At the bottom',
        continuationLabel: 'total energy is unchanged',
        nodes: [
          { label: 'PE = 0', detail: 'h = 0' },
          { label: 'KE = ½mv²', detail: 'maximum', emphasis: 'active' },
          { label: 'Total E', detail: 'still mgh' },
        ],
        links: ['+', '='],
      },
    ],
    caption,
  );
}

const energySection: LessonSectionAuthoring = {
  key: 'energy-conserve',
  kcId: ENERGY_KC,
  stageLabel: 'Energy conservation',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Speed at the bottom',
    'A cart starts from rest at height h on a frictionless track. Using energy conservation, what is its speed at the bottom?',
    [
      ['v = √(2gh)', 'Correct. Setting mgh = ½mv² and solving gives v = √(2gh); the mass cancels.'],
      ['v = 2gh', 'That has the wrong units and skips the square root from ½mv².'],
      ['v = √(gh)', 'This drops the factor of 2 that comes from ½mv² = mgh.'],
      ['v = mgh', 'That is an energy, not a speed, and includes mass, which cancels.'],
    ],
    'A',
    'Only gravity does work, so mechanical energy is conserved: mgh = ½mv². Mass cancels and v = √(2gh).',
    'Set the potential energy at the top equal to the kinetic energy at the bottom.',
    'With only conservative forces, KE + PE stays constant.',
    energyBar('All potential energy becomes kinetic energy at the bottom.'),
  ),
  model: {
    title: 'Trade potential for kinetic',
    supportingLine: 'Mechanical energy is conserved when only conservative forces act.',
    explanation: [
      'Mechanical energy is the sum of kinetic energy, KE = ½mv², and potential energy, here gravitational PE = mgh. When only conservative forces (like gravity) act, this sum stays constant.',
      'So you can equate the total energy at any two points: KE₁ + PE₁ = KE₂ + PE₂. Energy converts between forms as height and speed change, but the total does not disappear. Friction and drag are nonconservative and would remove mechanical energy as heat.',
    ],
    visual: energyBar('Height falls, speed rises, and the total energy line stays flat.'),
    takeaway: 'Set total energy equal at two points; solve for the unknown speed or height.',
  },
  understandingCheck: question(
    'Track the exchange',
    'As the frictionless cart descends, how do its energies change?',
    [
      ['Potential energy decreases, kinetic energy increases, and their sum stays constant.', 'Correct. Energy converts from potential to kinetic with no loss.'],
      ['Both potential and kinetic energy decrease.', 'Kinetic energy rises as speed increases; only potential energy falls.'],
      ['Kinetic energy stays constant while potential energy falls.', 'If kinetic energy did not rise, the lost potential energy would vanish, violating conservation.'],
      ['The total energy decreases as it speeds up.', 'With no friction, the total mechanical energy is constant.'],
    ],
    'A',
    'Descending lowers height, so PE falls; the released energy appears as increased KE. With no friction, KE + PE is unchanged.',
    'Whatever potential energy is lost reappears as kinetic energy.',
  ),
  worked: {
    title: 'Work a numeric drop',
    supportingLine: 'Plug into mgh = ½mv² and cancel mass.',
    explanation: [
      'Let h = 5 m and use g ≈ 10 m/s². Conservation gives mgh = ½mv², so v² = 2gh = 2 × 10 × 5 = 100 m²/s².',
      'Taking the square root, v = 10 m/s. Notice the mass never enters the answer: a heavier and a lighter cart reach the same speed on the same frictionless track.',
    ],
    visual: relations(
      'Numeric energy balance',
      'With h = 5 m and g = 10 m/s², v squared equals 2gh = 100, so v = 10 m/s regardless of mass.',
      [
        {
          label: 'Solve for v',
          nodes: [
            { label: 'mgh = ½mv²', detail: 'cancel m' },
            { label: 'v² = 2gh', detail: '= 100' },
            { label: 'v = 10 m/s', emphasis: 'active' },
          ],
          links: ['→', '→'],
        },
      ],
    ),
    takeaway: 'What to notice: on a frictionless path, speed depends on height, not on mass.',
  },
  guided: question(
    'Does mass matter?',
    'Two balls of different mass are released from rest at the same height on a frictionless ramp. Compare their speeds at the bottom.',
    [
      ['Equal speeds, because mass cancels in mgh = ½mv².', 'Correct. Both reach v = √(2gh) independent of mass.'],
      ['The heavier ball is faster, because it has more energy.', 'It has more energy, but also more mass, so its speed is the same.'],
      ['The lighter ball is faster, because it accelerates more easily.', 'On a frictionless ramp both reach the same speed; mass cancels.'],
      ['Cannot tell without the masses.', 'The masses are unnecessary because they cancel.'],
    ],
    'A',
    'Energy conservation gives v = √(2gh) with no mass term, so identical starting heights yield identical bottom speeds.',
    'Cancel the mass from both sides before comparing.',
  ),
  reducedSupport: question(
    'Maximum height of a toss',
    'A ball is thrown straight up with speed v. Ignoring air resistance, how high does it rise?',
    [
      ['h = v²/(2g)', 'Correct. Setting ½mv² = mgh and solving for h gives v²/(2g).'],
      ['h = v²/g', 'This omits the factor of ½ from the kinetic energy.'],
      ['h = 2v²/g', 'This doubles the height; the correct factor gives v²/(2g).'],
      ['h = vg', 'That has the wrong units and no energy balance.'],
    ],
    'A',
    'At the top the ball is momentarily at rest, so all kinetic energy has become potential energy: ½mv² = mgh, giving h = v²/(2g).',
    'At maximum height the speed is zero, so KE fully converts to PE.',
  ),
  independent: question(
    'Speed at an intermediate height',
    'A cart starts from rest at height H on a frictionless track. What is its speed when it has descended to height H/2?',
    [
      ['v = √(gH)', 'Correct. It has dropped H/2, so ½mv² = mg(H/2), giving v = √(gH).'],
      ['v = √(2gH)', 'That is the speed at the very bottom, after dropping the full height H.'],
      ['v = √(gH/2)', 'This uses only a quarter of the expected energy; the drop is H/2, not H/4.'],
      ['v = √(2gH)/2', 'Halving the bottom speed is not how energy scales; use the height actually dropped.'],
    ],
    'A',
    'The relevant drop is H − H/2 = H/2. Conservation gives ½mv² = mg(H/2), so v² = gH and v = √(gH).',
  ),
  near: question(
    'Two-hill speed',
    'A frictionless coaster leaves the top of a 20 m hill from rest and crests a second 15 m hill. Using g = 10 m/s², what is its speed at the top of the second hill?',
    [
      ['v = 10 m/s', 'Correct. The net drop is 5 m, so v² = 2 × 10 × 5 = 100 and v = 10 m/s.'],
      ['v = 20 m/s', 'That uses the full 20 m drop, ignoring the 15 m it climbs back up.'],
      ['v = √(2·10·35) ≈ 26 m/s', 'Heights add incorrectly; the coaster rises to 15 m, it does not drop 35 m.'],
      ['v = 0 m/s', 'The second hill is lower than the first, so energy remains as motion.'],
    ],
    'A',
    'Only the net height change matters: 20 − 15 = 5 m dropped. So v² = 2g(5) = 100 and v = 10 m/s.',
  ),
  changed: question(
    'Add friction',
    'On a real ramp, a block released from height h reaches the bottom slower than √(2gh). What accounts for the difference?',
    [
      [
        'Friction does negative work, converting some mechanical energy into heat.',
        'Correct. Mechanical energy is no longer conserved; the missing energy becomes thermal energy.',
      ],
      [
        'Gravity is weaker on a rough surface.',
        'Gravity is unchanged; friction, a separate nonconservative force, removes mechanical energy.',
      ],
      [
        'The block\u2019s mass increased during the slide.',
        'Mass is constant; mass would cancel anyway on a frictionless track.',
      ],
      [
        'Potential energy was never converted.',
        'Potential energy is still released, but part of it is dissipated by friction rather than becoming kinetic energy.',
      ],
    ],
    'A',
    'Friction is nonconservative: it does negative work equal to the heat generated. Now mgh = ½mv² + (heat), so the final speed is less than √(2gh).',
  ),
  repair: {
    title: 'Balance total energy at two points',
    supportingLine: 'The usual error is forgetting friction or keeping the mass.',
    explanation: [
      'Write KE + PE at the start equal to KE + PE at the end. Choose a reference height for PE, and let the mass cancel when only gravity acts.',
      'If a nonconservative force such as friction is present, add its energy loss: mgh = ½mv² + |W_friction|. Solve for the unknown speed or height last.',
    ],
    visual: energyBar('Equate total energy at two points; add a heat term only when friction acts.'),
    strategy: 'Set E_top = E_bottom, cancel mass, and include a loss term only if a nonconservative force acts.',
    checkYourThinking: 'Are all the forces conservative, or does friction remove some mechanical energy?',
  },
  recap: {
    title: 'You can solve motion with energy',
    explanation: [
      'You used KE + PE conservation to find speeds and heights without tracking forces over time, saw why mass cancels, and accounted for friction as a loss of mechanical energy to heat.',
    ],
    visual: energyBar('One balance—total energy in equals total energy out—solves many motion problems.'),
    takeaway: 'Conserve KE + PE when only conservative forces act; add a heat term when friction does not.',
  },
};

const { script: ENERGY_CONSERVATION_SCRIPT, presentation: ENERGY_CONSERVATION_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-338400',
    contentVersion: 'app-native-energy-v1.0.0',
    slug: 'energy-conservation',
    title: 'Solve motion with energy conservation',
    internalTitle: 'Work, energy, and power · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Use conservation of mechanical energy (KE + PE) to find speeds and heights, see why mass cancels, and account for friction as energy lost to heat.',
    estimatedMinutes: 15,
    requiredKcs: [
      {
        id: ENERGY_KC,
        title: 'Conserve mechanical energy',
        learnerOutcome:
          'Use conservation of kinetic and potential energy to solve for an unknown speed or height.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-273349',
        title: 'Calculate constant-force work',
        learnerOutcome: 'Recall that work by a force transfers energy into or out of a system.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-803469',
        title: 'Apply work\u2013kinetic-energy reasoning',
        learnerOutcome: 'Connect net work to changes in kinetic energy.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-076684',
        title: 'Relate power and mechanical advantage',
        learnerOutcome: 'Recognize power as the rate of energy transfer (covered elsewhere).',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given a start and end state, use conservation of mechanical energy to solve for an unknown speed or height and adjust for friction when present.',
    intro: {
      id: 'energy-intro',
      title: 'Solve motion with energy conservation',
      outcome: 'Find speeds and heights by balancing kinetic and potential energy.',
      details: [
        'Equate total mechanical energy at two points, let mass cancel, and treat friction as energy lost to heat.',
      ],
      kcIds: [ENERGY_KC],
    },
    sections: [energySection],
    completion: {
      id: 'energy-complete',
      title: 'You can use energy to solve motion',
      summary:
        'You balanced kinetic and potential energy to find speeds and heights, explained why mass cancels, and adjusted for friction as an energy loss.',
      takeaways: [
        'With only conservative forces, KE + PE is constant.',
        'On a frictionless path, speed depends on height, not mass.',
        'Friction removes mechanical energy as heat, so add a loss term.',
      ],
      nextStep: 'Extend energy accounting to power (energy per time) and simple machines.',
      kcIds: [ENERGY_KC],
    },
  });

export { ENERGY_CONSERVATION_SCRIPT, ENERGY_CONSERVATION_PRESENTATION };
