import { buildAppNativeLesson, question, relations } from './authoring-helpers';
import type { LessonSectionAuthoring } from './section-authoring';

const NOTATION_KC = 'V3-KC-981438';

function exponentMap(caption?: string) {
  return relations(
    'Scientific-notation form and exponent rules',
    'A number in scientific notation is written as a coefficient between 1 and 10 times a power of ten. Multiplying adds the exponents, dividing subtracts them, and a positive exponent means a large number while a negative exponent means a small one.',
    [
      {
        label: 'Standard form',
        nodes: [
          { label: 'a × 10ⁿ', detail: '1 ≤ a < 10', emphasis: 'active' },
          { label: '+n', detail: 'large number' },
          { label: '−n', detail: 'small number' },
        ],
        links: ['where', 'vs'],
      },
      {
        label: 'Combining',
        continuationLabel: 'operate on coefficients and exponents separately',
        nodes: [
          { label: 'Multiply', detail: 'add exponents' },
          { label: 'Divide', detail: 'subtract exponents', emphasis: 'active' },
          { label: 'Power', detail: 'multiply the exponent' },
        ],
        links: ['·', '÷'],
      },
    ],
    caption,
  );
}

const notationSection: LessonSectionAuthoring = {
  key: 'sci-notation',
  kcId: NOTATION_KC,
  stageLabel: 'Scientific notation',
  nextActionLabel: 'Finish the lesson',
  starting: question(
    'Write a small number',
    'Express 0.00042 in scientific notation.',
    [
      ['4.2 × 10⁻⁴', 'Correct. Move the decimal four places right to get 4.2, so the exponent is −4.'],
      ['4.2 × 10⁴', 'A positive exponent would make this a large number (42,000), not a small one.'],
      ['42 × 10⁻⁵', 'The value is right, but the coefficient must be between 1 and 10, so write 4.2 × 10⁻⁴.'],
      ['4.2 × 10⁻³', 'That equals 0.0042, ten times too large; the decimal moves four places, not three.'],
    ],
    'A',
    'Scientific notation is a × 10ⁿ with 1 ≤ a < 10. Moving the decimal four places to the right gives 4.2, and shrinking the number means a negative exponent: 4.2 × 10⁻⁴.',
    'Count how many places the decimal moves, and let a number less than 1 take a negative exponent.',
    'Keep the coefficient between 1 and 10 and let the exponent carry the scale.',
    exponentMap('Small numbers take negative exponents.'),
  ),
  model: {
    title: 'One coefficient, one exponent',
    supportingLine: 'Normalize the coefficient, then handle exponents by rule.',
    explanation: [
      'Scientific notation writes any number as a × 10ⁿ, where the coefficient a satisfies 1 ≤ a < 10 and n counts factors of ten. Positive n means a large number; negative n means a small one.',
      'When combining, work on coefficients and exponents separately: multiplying adds exponents, dividing subtracts them, and raising to a power multiplies the exponent. If the resulting coefficient falls outside 1–10, adjust it and change the exponent to match.',
    ],
    visual: exponentMap('Normalize a, then add, subtract, or multiply exponents.'),
    takeaway: 'Multiply → add exponents; divide → subtract; power → multiply; then renormalize.',
  },
  understandingCheck: question(
    'Multiply in notation',
    'Compute (3 × 10⁵)(2 × 10³).',
    [
      ['6 × 10⁸', 'Correct. Multiply coefficients (3 × 2 = 6) and add exponents (5 + 3 = 8).'],
      ['6 × 10¹⁵', 'Exponents add when multiplying; they are not multiplied.'],
      ['5 × 10⁸', 'The coefficients multiply to 6, not add to 5.'],
      ['6 × 10²', 'Adding exponents gives 8, not subtracting to 2.'],
    ],
    'A',
    'Multiply the coefficients and add the exponents: (3 × 2) × 10^(5+3) = 6 × 10⁸.',
    'Coefficients multiply; exponents add.',
  ),
  worked: {
    title: 'Divide and square',
    supportingLine: 'Same rules, different operations.',
    explanation: [
      'Divide: (6 × 10⁸) ÷ (2 × 10²) = (6 ÷ 2) × 10^(8−2) = 3 × 10⁶. Coefficients divide and exponents subtract.',
      'Square: (2 × 10³)² = 2² × 10^(3×2) = 4 × 10⁶. A power applies to both the coefficient and the exponent, multiplying the exponent.',
    ],
    visual: relations(
      'Divide and power examples',
      'Dividing subtracts exponents to give 3 times ten to the sixth; squaring multiplies the exponent to give 4 times ten to the sixth.',
      [
        {
          label: 'Divide',
          nodes: [
            { label: '6×10⁸ ÷ 2×10²', detail: '' },
            { label: '3 × 10⁶', emphasis: 'active' },
          ],
          links: ['8 − 2 = 6'],
        },
        {
          label: 'Square',
          nodes: [
            { label: '(2×10³)²', detail: '' },
            { label: '4 × 10⁶', emphasis: 'active' },
          ],
          links: ['3 × 2 = 6'],
        },
      ],
    ),
    takeaway: 'What to notice: division subtracts exponents, and a power multiplies them.',
  },
  guided: question(
    'Write a large number',
    'Express 5,600,000 in scientific notation.',
    [
      ['5.6 × 10⁶', 'Correct. The decimal moves six places left, giving coefficient 5.6 and exponent 6.'],
      ['56 × 10⁵', 'The value is right, but the coefficient must be between 1 and 10.'],
      ['5.6 × 10⁵', 'That equals 560,000, ten times too small.'],
      ['5.6 × 10⁻⁶', 'A negative exponent would make it a tiny fraction, not millions.'],
    ],
    'A',
    'Move the decimal six places to the left to reach 5.6, so 5,600,000 = 5.6 × 10⁶.',
    'A large number has a positive exponent equal to the places moved left.',
  ),
  reducedSupport: question(
    'Mix signs of exponents',
    'Compute (4 × 10⁻³)(2 × 10⁵).',
    [
      ['8 × 10²', 'Correct. Coefficients 4 × 2 = 8, exponents −3 + 5 = 2.'],
      ['8 × 10⁻¹⁵', 'Exponents add; they are not multiplied.'],
      ['8 × 10⁻²', 'The exponents sum to +2, not −2.'],
      ['6 × 10²', 'The coefficients multiply to 8, not add to 6.'],
    ],
    'A',
    'Add the exponents including sign: −3 + 5 = 2, and 4 × 2 = 8, giving 8 × 10².',
    'Add exponents with their signs.',
  ),
  independent: question(
    'Renormalize a coefficient',
    'A calculation yields 42 × 10⁵. Rewrite it in proper scientific notation.',
    [
      ['4.2 × 10⁶', 'Correct. Divide the coefficient by 10 and add 1 to the exponent.'],
      ['42 × 10⁵', 'The coefficient must be between 1 and 10, so this is not standard form.'],
      ['4.2 × 10⁴', 'Reducing the coefficient by a factor of 10 requires raising the exponent, not lowering it.'],
      ['0.42 × 10⁷', 'The coefficient is now below 1, which is also not standard form.'],
    ],
    'A',
    'To bring 42 into the 1–10 range, write 4.2 and compensate by increasing the exponent by one: 42 × 10⁵ = 4.2 × 10⁶.',
  ),
  near: question(
    'Divide to a small result',
    'Compute (9 × 10⁴) ÷ (3 × 10⁷).',
    [
      ['3 × 10⁻³', 'Correct. 9 ÷ 3 = 3, and 4 − 7 = −3.'],
      ['3 × 10¹¹', 'Dividing subtracts exponents; it does not add them.'],
      ['3 × 10³', 'The exponent difference is 4 − 7 = −3, not +3.'],
      ['6 × 10⁻³', 'The coefficients divide to 3, not subtract to 6.'],
    ],
    'A',
    'Divide coefficients (9 ÷ 3 = 3) and subtract exponents (4 − 7 = −3): 3 × 10⁻³.',
  ),
  changed: question(
    'Estimate an order of magnitude',
    'Without a calculator, estimate (2.9 × 10⁴)(5.1 × 10³) to one significant figure.',
    [
      ['≈ 1.5 × 10⁸', 'Correct. 3 × 5 ≈ 15, and 10⁴·10³ = 10⁷, so 15 × 10⁷ = 1.5 × 10⁸.'],
      ['≈ 1.5 × 10⁷', 'The exponent should be 8 after renormalizing 15 × 10⁷.'],
      ['≈ 8 × 10⁷', 'That adds the coefficients (≈3 + 5) instead of multiplying them.'],
      ['≈ 1.5 × 10¹²', 'Exponents add to 7 here, not multiply to 12.'],
    ],
    'A',
    'Round coefficients (2.9 ≈ 3, 5.1 ≈ 5) and add exponents: 3 × 5 = 15 with 10^(4+3) = 10⁷, giving 15 × 10⁷ = 1.5 × 10⁸.',
  ),
  repair: {
    title: 'Normalize, then apply the exponent rule',
    supportingLine: 'Most errors come from multiplying exponents or leaving a bad coefficient.',
    explanation: [
      'First put each number in a × 10ⁿ form with 1 ≤ a < 10. Then operate: add exponents when multiplying, subtract when dividing, and multiply the exponent when raising to a power.',
      'Finally, check the coefficient. If it is ≥ 10 or < 1, shift the decimal and adjust the exponent so the coefficient lands back in the 1–10 range.',
    ],
    visual: exponentMap('Normalize first, apply the rule, then renormalize the coefficient.'),
    strategy: 'Separate coefficient work from exponent work, then renormalize at the end.',
    checkYourThinking: 'Did you add exponents for products and keep the coefficient between 1 and 10?',
  },
  recap: {
    title: 'You can compute in scientific notation',
    explanation: [
      'You converted numbers to standard form, combined them by adding, subtracting, or multiplying exponents, renormalized coefficients, and estimated an order of magnitude by hand—skills that keep MCAT arithmetic fast and calculator-free.',
    ],
    visual: exponentMap('Standard form plus three exponent rules covers the arithmetic you need.'),
    takeaway: 'Keep the coefficient in 1–10 and let exponent rules do the scaling.',
  },
};

const { script: SCIENTIFIC_NOTATION_SCRIPT, presentation: SCIENTIFIC_NOTATION_PRESENTATION } =
  buildAppNativeLesson({
    id: 'V3-LES-789208',
    contentVersion: 'app-native-notation-v1.0.0',
    slug: 'scientific-notation',
    title: 'Compute with scientific notation',
    internalTitle: 'Quantitative measurement, scaling, and notation · app-native candidate',
    subject: 'Chemical & physical foundations',
    description:
      'Write numbers in scientific notation and combine them by adding, subtracting, or multiplying exponents, then estimate orders of magnitude without a calculator.',
    estimatedMinutes: 13,
    requiredKcs: [
      {
        id: NOTATION_KC,
        title: 'Use scientific notation and exponents',
        learnerOutcome:
          'Convert numbers to scientific notation and combine them using exponent rules.',
        previewCoverage: 'complete-review-focus',
      },
      {
        id: 'V3-KC-399019',
        title: 'Convert units and dimensions',
        learnerOutcome: 'Recall that unit conversions rely on the same powers of ten.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-799492',
        title: 'Estimate with significant figures',
        learnerOutcome: 'See how order-of-magnitude estimates pair with significant figures.',
        previewCoverage: 'boundary-map-only',
      },
      {
        id: 'V3-KC-919842',
        title: 'Compute ratios and probabilities',
        learnerOutcome: 'Use exponent arithmetic to simplify ratios (covered elsewhere).',
        previewCoverage: 'boundary-map-only',
      },
    ],
    teachingObjective:
      'Given numbers in decimal or scientific form, convert and combine them using exponent rules and estimate results to one significant figure.',
    intro: {
      id: 'sci-intro',
      title: 'Compute with scientific notation',
      outcome: 'Convert and combine numbers using powers of ten quickly and correctly.',
      details: [
        'Normalize coefficients, apply exponent rules for products and quotients, and estimate orders of magnitude.',
      ],
      kcIds: [NOTATION_KC],
    },
    sections: [notationSection],
    completion: {
      id: 'sci-complete',
      title: 'You can compute by powers of ten',
      summary:
        'You converted numbers to standard form, combined them with exponent rules, renormalized coefficients, and estimated a product by hand.',
      takeaways: [
        'Standard form keeps the coefficient between 1 and 10.',
        'Multiply → add exponents; divide → subtract; power → multiply the exponent.',
        'Renormalize whenever the coefficient leaves the 1–10 range.',
      ],
      nextStep: 'Combine notation with significant figures and unit conversions for fast estimates.',
      kcIds: [NOTATION_KC],
    },
  });

export { SCIENTIFIC_NOTATION_SCRIPT, SCIENTIFIC_NOTATION_PRESENTATION };
