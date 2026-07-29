import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  archetypeDiversity,
  DISTRACTOR_FAMILIES,
  SKILL_CATEGORY_WEIGHTS,
  SUB_SKILLS,
  HUMANITIES_DISCIPLINES,
  SOCIAL_SCIENCE_DISCIPLINES,
  FORM_BLUEPRINT,
  countFalsifiable,
  mechanismsAreDistinct,
  deriveSkill,
  PassageSetBlueprintSchema,
  GeneratedPassageSetSchema,
  runDeterministicChecks,
  auditItem,
  checkOriginality,
  runSolverBattery,
  measureAblations,
  consensusPick,
  toSafePassageSet,
  assertNoProtectedFields,
  passageWordCount,
  verdict,
  summarize,
  generatePassageSet,
  GenerationFailedError,
  extractJson,
  solverPositionBias,
  OPTION_LENGTH,
  type GeneratedPassageSet,
  type NamedSolver,
} from './index';
import { EXAMPLE_BLUEPRINT, EXAMPLE_SET } from './fixtures/example-set';
import {
  PERFORMANCE_BLUEPRINT,
  PERFORMANCE_SET,
  SKILL_BLUEPRINT,
  SKILL_SET,
} from './fixtures/preview-sets';
import type { AiChat, AiChatRequest, AiChatResult } from '@mcat/ai-gateway';

/** Deep clone so mutation-based tests cannot leak into one another. */
function cloneSet(): GeneratedPassageSet {
  return structuredClone(EXAMPLE_SET);
}

function failing(set: GeneratedPassageSet): string[] {
  return runDeterministicChecks(set)
    .filter((r) => !r.passed && r.severity !== 'info')
    .map((r) => r.id);
}

describe('taxonomy', () => {
  it('encodes the official skill weights and tolerance', () => {
    const total = Object.values(SKILL_CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(SKILL_CATEGORY_WEIGHTS.RBT).toBeGreaterThan(SKILL_CATEGORY_WEIGHTS.FOC);
  });

  it('publishes exactly the six official sub-skills, two per category', () => {
    expect(SUB_SKILLS).toHaveLength(6);
    for (const skill of ['FOC', 'RWT', 'RBT'] as const) {
      expect(SUB_SKILLS.filter((s) => s.skill === skill)).toHaveLength(2);
    }
  });

  it('names the official discipline lists', () => {
    expect(HUMANITIES_DISCIPLINES).toHaveLength(11);
    expect(SOCIAL_SCIENCE_DISCIPLINES).toHaveLength(12);
    // AAMC lists studies of diverse cultures under both groupings.
    expect(HUMANITIES_DISCIPLINES).toContain('studies of diverse cultures');
    expect(SOCIAL_SCIENCE_DISCIPLINES).toContain('studies of diverse cultures');
  });

  it('encodes the section form blueprint', () => {
    expect(FORM_BLUEPRINT.totalItems).toBe(53);
    expect(FORM_BLUEPRINT.optionsPerItem).toBe(4);
    // The corpus profile independently measured 5, 6, and 7 items per set.
    expect(FORM_BLUEPRINT.itemsPerPassageMin).toBe(5);
    expect(FORM_BLUEPRINT.itemsPerPassageMax).toBe(7);
  });

  it('maps every archetype onto a real sub-skill', () => {
    const ids = new Set(SUB_SKILLS.map((s) => s.id));
    for (const archetype of ARCHETYPES) {
      expect(ids.has(archetype.subSkill)).toBe(true);
    }
  });

  it('covers all three skill categories with archetypes', () => {
    for (const skill of ['FOC', 'RWT', 'RBT'] as const) {
      expect(ARCHETYPES.filter((a) => a.skill === skill).length).toBeGreaterThan(0);
    }
  });
});

describe('skill derivation from retrieval scope', () => {
  it('treats stem-supplied information as decisive for RBT', () => {
    expect(
      deriveSkill({
        archetype: 'integrative-inference',
        evidenceParagraphs: [0, 4],
        stemSuppliedInformation: 'a new finding',
      }),
    ).toBe('RBT');
  });

  it('calls a single-span key Foundations regardless of archetype', () => {
    expect(deriveSkill({ archetype: 'integrative-inference', evidenceParagraphs: [2] })).toBe('FOC');
  });

  it('requires genuinely distant spans for Reasoning Within the Text', () => {
    // Adjacent paragraphs are still an immediate context.
    expect(deriveSkill({ archetype: 'central-thesis', evidenceParagraphs: [1, 2] })).toBe('FOC');
    expect(deriveSkill({ archetype: 'central-thesis', evidenceParagraphs: [1, 4] })).toBe('RWT');
  });
});

describe('distractor taxonomy', () => {
  it('gives every family a peer-reviewed mechanism', () => {
    for (const family of DISTRACTOR_FAMILIES) {
      expect(family.mechanism).toBeTruthy();
      expect(family.construction.length).toBeGreaterThan(20);
    }
  });

  it('detects repeated mechanisms across a distractor set', () => {
    // too-narrow and half-right are both partial-coverage.
    expect(mechanismsAreDistinct(['too-narrow', 'half-right', 'opposite'])).toBe(false);
    expect(mechanismsAreDistinct(['too-narrow', 'too-extreme', 'outside-knowledge'])).toBe(true);
  });

  it('counts falsifiable distractors', () => {
    expect(countFalsifiable(['too-extreme', 'reversal', 'opposite'])).toBe(3);
    expect(countFalsifiable(['too-narrow', 'too-broad', 'outside-knowledge'])).toBe(0);
  });
});

describe('blueprint schema', () => {
  it('accepts the authored example blueprint', () => {
    expect(() => PassageSetBlueprintSchema.parse(EXAMPLE_BLUEPRINT)).not.toThrow();
  });

  it('requires stem-supplied information for beyond-the-text archetypes', () => {
    const broken = structuredClone(EXAMPLE_BLUEPRINT);
    delete (broken.items[3] as { stemSuppliedInformation?: string }).stemSuppliedInformation;
    expect(() => PassageSetBlueprintSchema.parse(broken)).toThrow(/requires stem-supplied information/);
  });

  it('forbids stem-supplied information on within-the-text archetypes', () => {
    const broken = structuredClone(EXAMPLE_BLUEPRINT);
    broken.items[2]!.stemSuppliedInformation = 'a new fact the passage never states';
    expect(() => PassageSetBlueprintSchema.parse(broken)).toThrow(/must not supply new information/);
  });

  it('rejects evidence paragraphs outside the paragraph plan', () => {
    const broken = structuredClone(EXAMPLE_BLUEPRINT);
    broken.items[0]!.evidenceParagraphs = [99];
    expect(() => PassageSetBlueprintSchema.parse(broken)).toThrow(/references paragraph 99/);
  });

  it('enforces the minimum evidence spans an archetype needs', () => {
    const broken = structuredClone(EXAMPLE_BLUEPRINT);
    // central-thesis requires three spans.
    broken.items[0]!.evidenceParagraphs = [4];
    expect(() => PassageSetBlueprintSchema.parse(broken)).toThrow(/at least 3 evidence spans/);
  });
});

describe('the authored example set is a clean positive control', () => {
  it('sits inside the corpus-calibrated passage bands', () => {
    const words = passageWordCount(EXAMPLE_SET.passage);
    expect(words).toBeGreaterThanOrEqual(480);
    expect(words).toBeLessThanOrEqual(660);
  });

  it('passes every deterministic check', () => {
    // The point of this assertion: gates calibrated against real items must accept
    // content built to specification. If this fails, the thresholds have drifted
    // stricter than the corpus they were derived from.
    expect(failing(cloneSet())).toEqual([]);
  });

  it('reaches an accept-or-review verdict rather than a rejection', () => {
    const report = { results: runDeterministicChecks(cloneSet()) };
    expect(verdict(report)).toBe('accept');
    expect(summarize(report)).toContain('verdict: accept');
  });

  it('derives the declared skill tag for every item from its blueprint', () => {
    for (const model of EXAMPLE_BLUEPRINT.items) {
      const item = EXAMPLE_SET.items.find((i) => i.itemModelId === model.id);
      expect(item).toBeDefined();
      expect(item!.skill).toBe(deriveSkill(model));
    }
  });

  it('records a family id on every item so calibration can be inherited', () => {
    for (const item of EXAMPLE_SET.items) {
      expect(item.familyId).toBeTruthy();
    }
  });

  it('keeps a diverse archetype mix', () => {
    expect(archetypeDiversity(EXAMPLE_SET.items.map((i) => i.archetype))).toBeGreaterThan(0.6);
  });
});

describe('deterministic checks catch injected flaws', () => {
  const passage = EXAMPLE_SET.passage.paragraphs.join('\n\n');

  it('flags a key that is conspicuously longer than the distractors', () => {
    const set = cloneSet();
    const item = set.items[0]!;
    const key = item.choices.find((c) => c.label === item.correctChoice)!;
    key.text = `${key.text} ${'and this qualification continues at some length indeed '.repeat(3)}`;
    expect(failing(set)).toContain('key-length-cue');
  });

  it('rejects all-of-the-above style options', () => {
    const set = cloneSet();
    set.items[0]!.choices[3]!.text = 'All of the above';
    expect(failing(set)).toContain('no-complex-options');
  });

  it('rejects duplicated options', () => {
    const set = cloneSet();
    set.items[0]!.choices[1]!.text = set.items[0]!.choices[2]!.text;
    expect(failing(set)).toContain('options-distinct');
  });

  it('rejects an evidence quote that is not in the passage', () => {
    const set = cloneSet();
    set.items[0]!.evidenceQuotes = ['a sentence that the passage never contains at all'];
    expect(failing(set)).toContain('evidence-quotes-verbatim');
  });

  it('rejects a key label that matches no option', () => {
    const set = cloneSet();
    set.items[0]!.correctChoice = 'A';
    set.items[0]!.choices = set.items[0]!.choices.filter((c) => c.label !== 'A');
    expect(failing(set)).toContain('option-count');
  });

  it('flags absolutes that appear only in the key', () => {
    const set = cloneSet();
    const item = set.items[0]!;
    // Strip absolutes from the distractors, then plant one in the key.
    for (const choice of item.choices) {
      choice.text = choice.text.replace(/\b(no|never|always|only|all)\b/gi, 'some');
    }
    const key = item.choices.find((c) => c.label === item.correctChoice)!;
    key.text = `a map always argues most effectively when its choices stay hidden.`;
    expect(failing(set)).toContain('key-only-absolutes');
  });

  it('flags an option set whose distractors are all falsifiable from the passage', () => {
    const set = cloneSet();
    const item = set.items[0]!;
    for (const rationale of item.rationales) {
      if (rationale.label === item.correctChoice) continue;
      rationale.family = rationale.label === 'A' ? 'too-extreme' : rationale.label === 'B' ? 'reversal' : 'half-right';
    }
    expect(failing(set)).toContain('falsifiable-distractor-cap');
  });

  it('flags repeated distractor mechanisms', () => {
    const set = cloneSet();
    const item = set.items[0]!;
    for (const rationale of item.rationales) {
      if (rationale.label === item.correctChoice) continue;
      rationale.family = 'too-narrow';
    }
    expect(failing(set)).toContain('distractor-mechanisms-distinct');
  });

  it('flags an unbalanced key position distribution', () => {
    const set = cloneSet();
    for (const item of set.items) {
      item.correctChoice = 'A';
      // Keep rationale coverage intact so only the balance check fires.
      for (const rationale of item.rationales) {
        rationale.family = rationale.label === 'A' ? undefined : rationale.family ?? 'too-narrow';
      }
    }
    expect(failing(set)).toContain('key-position-balance');
  });

  it('rejects a passage that falls outside the calibrated word band', () => {
    const set = cloneSet();
    set.passage.paragraphs = set.passage.paragraphs.slice(0, 4).map((p) => p.split(' ').slice(0, 20).join(' '));
    expect(failing(set)).toContain('passage-words');
  });

  it('tolerates the uneven option lengths that real CARS items exhibit', () => {
    // Guards against over-correction. The corpus median longest/shortest ratio is 1.85
    // and the observed maximum is 6.33, so a moderately uneven set must still pass.
    const set = cloneSet();
    const item = set.items[0]!;
    item.choices[0]!.text = 'no flattening rule can retain area, shape, distance, and bearing all at once, whatever the mapmaker intends.';
    item.choices[3]!.text = 'coastline depictions improved over three centuries.';
    const spread = Math.max(...item.choices.map((c) => c.text.split(/\s+/).length)) /
      Math.min(...item.choices.map((c) => c.text.split(/\s+/).length));
    expect(spread).toBeGreaterThan(2);
    expect(spread).toBeLessThan(OPTION_LENGTH.spreadRatioMax);
    expect(auditItem(item, passage).filter((r) => !r.passed).map((r) => r.id)).not.toContain('option-spread');
  });
});

describe('safe projection', () => {
  it('strips the key, rationales, and evidence quotes', () => {
    const safe = toSafePassageSet(EXAMPLE_SET);
    expect(() => assertNoProtectedFields(safe)).not.toThrow();
    const json = JSON.stringify(safe);
    expect(json).not.toContain('correctChoice');
    expect(json).not.toContain('rationale');
    expect(json).not.toContain('evidenceQuotes');
    // Note that evidence-quote *text* legitimately remains, because a quote is a
    // verbatim span of the passage the learner is meant to read. What must not leak is
    // which spans were cited, since that identifies the key.
    for (const item of safe.items) {
      expect(item).not.toHaveProperty('evidenceQuotes');
      expect(item).not.toHaveProperty('correctChoice');
    }
  });

  it('keeps the stem and all four options', () => {
    const safe = toSafePassageSet(EXAMPLE_SET);
    expect(safe.items).toHaveLength(EXAMPLE_SET.items.length);
    for (const item of safe.items) {
      expect(item.choices).toHaveLength(4);
      expect(item.stem.length).toBeGreaterThan(10);
    }
  });
});

describe('originality battery', () => {
  const passage = EXAMPLE_SET.passage.paragraphs.join('\n\n');

  it('reports rather than passes when no corpus is supplied', async () => {
    const results = await checkOriginality(passage, []);
    const presence = results.find((r) => r.id === 'originality-corpus-present');
    expect(presence?.passed).toBe(false);
  });

  it('rejects an exact reproduction', async () => {
    const results = await checkOriginality(passage, [{ id: 'source-1', text: passage }]);
    const ngram = results.find((r) => r.id === 'originality-ngram-containment');
    const jaccard = results.find((r) => r.id === 'originality-jaccard');
    expect(ngram?.passed).toBe(false);
    expect(jaccard?.passed).toBe(false);
    expect(jaccard?.score).toBeCloseTo(1, 2);
  });

  it('accepts unrelated text and still records the scores', async () => {
    const results = await checkOriginality(passage, [
      { id: 'source-1', text: 'Enzyme kinetics describe the rate at which a substrate is converted to product under saturating conditions.' },
    ]);
    for (const result of results) {
      if (result.severity === 'reject') expect(result.passed).toBe(true);
    }
    // Scores are retained on pass, because thresholds get re-tuned and booleans cannot.
    expect(results.find((r) => r.id === 'originality-jaccard')?.score).toBeDefined();
  });

  it('uses an injected embedding layer when one is supplied', async () => {
    const results = await checkOriginality(passage, [{ id: 'source-1', text: 'unrelated' }], {
      embeddingSimilarity: async () => 0.99,
      embeddingMax: 0.85,
    });
    const embedding = results.find((r) => r.id === 'originality-embedding');
    expect(embedding?.passed).toBe(false);
    expect(embedding?.score).toBeCloseTo(0.99, 5);
  });
});

/** A solver that always names the option at a fixed position in the presented order. */
function positionalSolver(id: string, position: number): NamedSolver {
  return {
    id,
    chat: {
      async chat(): Promise<AiChatResult> {
        return { text: ['A', 'B', 'C', 'D'][position] ?? 'A' };
      },
    },
  };
}

/** A solver that reads the presented options and picks by matching a substring. */
function contentSolver(id: string, needle: string): NamedSolver {
  return {
    id,
    chat: {
      async chat(req: AiChatRequest): Promise<AiChatResult> {
        const prompt = req.messages.map((m) => m.content).join('\n');
        for (const line of prompt.split('\n')) {
          const match = /^([ABCD])\.\s+(.*)$/.exec(line.trim());
          if (match && match[2]!.toLowerCase().includes(needle.toLowerCase())) {
            return { text: match[1]! };
          }
        }
        return { text: 'A' };
      },
    },
  };
}

describe('solver ablation battery', () => {
  it('reports rather than passes when no ensemble is configured', async () => {
    const result = await runSolverBattery(EXAMPLE_SET, { solvers: [] });
    expect(result.results[0]?.id).toBe('solver-ensemble-present');
    expect(result.results[0]?.passed).toBe(false);
  });

  it('rejects an ensemble that contains the generating model', async () => {
    const result = await runSolverBattery(EXAMPLE_SET, {
      solvers: [positionalSolver('gpt-x', 0)],
      generatingModelId: 'gpt-x',
      conditions: ['full'],
      permutations: 1,
    });
    const independence = result.results.find((r) => r.id === 'solver-independence');
    expect(independence?.passed).toBe(false);
    expect(independence?.severity).toBe('reject');
  });

  it('un-rotates picks so a content-matching solver scores under every permutation', async () => {
    // This solver identifies the key by its wording, so it must score 100% regardless of
    // where the key was placed — which is what proves the rotation bookkeeping is right.
    const solver = contentSolver('reader', 'stay out of sight');
    const result = await runSolverBattery(
      { ...EXAMPLE_SET, items: [EXAMPLE_SET.items[0]!] },
      { solvers: [solver], conditions: ['full'], permutations: 4 },
    );
    const full = result.byCondition.find((c) => c.condition === 'full');
    expect(full?.trials).toBe(4);
    expect(full?.accuracy).toBe(1);
  });

  it('detects passage-blind answerability above the gate', async () => {
    const solver = contentSolver('leaky', 'stay out of sight');
    const result = await runSolverBattery(
      { ...EXAMPLE_SET, items: [EXAMPLE_SET.items[0]!] },
      { solvers: [solver], conditions: ['passage-blind'], permutations: 4 },
    );
    const leak = result.results.find((r) => r.id === 'solver-passage-blind');
    expect(leak?.passed).toBe(false);
    expect(leak?.score).toBe(1);
  });

  it('leaves a chance-level solver inside the leakage gates', async () => {
    // A fixed-position solver scores exactly 25% across four rotations, which is chance.
    const result = await runSolverBattery(EXAMPLE_SET, {
      solvers: [positionalSolver('fixed', 2)],
      conditions: ['passage-blind', 'options-only'],
      permutations: 4,
    });
    for (const summary of result.byCondition) {
      expect(summary.accuracy).toBeCloseTo(0.25, 6);
    }
    for (const check of result.results.filter((r) => r.id.startsWith('solver-'))) {
      if (check.id === 'solver-passage-blind' || check.id === 'solver-options-only') {
        expect(check.passed).toBe(true);
      }
    }
  });

  it('measures position bias in a solver as an instrument diagnostic', async () => {
    const result = await runSolverBattery(EXAMPLE_SET, {
      solvers: [positionalSolver('stuck', 0)],
      conditions: ['full'],
      permutations: 1,
    });
    // Always answering "A" in a single ordering is total concentration.
    expect(solverPositionBias(result.trials, 'stuck')).toBeCloseTo(1, 6);
  });

  it('flags per-item key disagreement even when the batch looks acceptable', async () => {
    const result = await runSolverBattery(
      { ...EXAMPLE_SET, items: [EXAMPLE_SET.items[0]!] },
      { solvers: [contentSolver('contrarian', 'wholly a work of persuasion')], conditions: ['full'], permutations: 4 },
    );
    const perItem = result.results.find((r) => r.id === 'solver-item-key-agreement');
    expect(perItem?.passed).toBe(false);
    expect(perItem?.score).toBe(0);
  });
});

/**
 * `measureAblations` and `consensusPick` exist so the *reference* corpus can be measured
 * with the same prompts as the live gate — see `tools/cars-generator/src/calibrate.ts`.
 * Reference items carry no rationales and no key, so both must work on the narrow
 * `SolvableItem` shape and must derive a label without one.
 */
describe('ablation measurement on unannotated items', () => {
  const bareItem = {
    id: 'ref-1',
    stem: 'Which statement is best supported?',
    choices: [
      { label: 'A' as const, text: 'the cartographer conceals a choice' },
      { label: 'B' as const, text: 'every projection distorts equally' },
      { label: 'C' as const, text: 'maps are wholly objective records' },
      { label: 'D' as const, text: 'projection is a technical matter only' },
    ],
    correctChoice: 'A' as const,
  };

  it('measures an item that has no rationales, evidence quotes, or archetype', async () => {
    const measured = await measureAblations('Some passage prose.', [bareItem], {
      solvers: [contentSolver('reader', 'conceals a choice')],
      conditions: ['full'],
      permutations: 4,
    });
    expect(measured.byCondition[0]?.trials).toBe(4);
    expect(measured.byCondition[0]?.accuracy).toBe(1);
  });

  it('derives a consensus label when the ensemble agrees, ignoring presented position', async () => {
    const measured = await measureAblations('Some passage prose.', [bareItem], {
      solvers: [contentSolver('a', 'conceals a choice'), contentSolver('b', 'conceals a choice')],
      conditions: ['full'],
      permutations: 4,
    });
    const consensus = consensusPick(measured.trials, 'ref-1', 'full', 0.6);
    expect(consensus?.label).toBe('A');
    expect(consensus?.share).toBe(1);
  });

  it('returns no label when the ensemble splits, so an unlabelled item is dropped not guessed', async () => {
    // Two solvers locking onto different options give a 0.5 share, under the threshold.
    const measured = await measureAblations('Some passage prose.', [bareItem], {
      solvers: [
        contentSolver('a', 'conceals a choice'),
        contentSolver('b', 'wholly objective records'),
      ],
      conditions: ['full'],
      permutations: 4,
    });
    expect(consensusPick(measured.trials, 'ref-1', 'full', 0.6)).toBeNull();
  });

  it('excludes non-answers from the consensus denominator', async () => {
    // A solver that never returns a parsable letter must not dilute the share of the
    // solver that does, or a flaky provider would silently suppress every label.
    const mute: NamedSolver = { id: 'mute', chat: { chat: async () => ({ text: '' }) } };
    const measured = await measureAblations('Some passage prose.', [bareItem], {
      solvers: [contentSolver('a', 'conceals a choice'), mute],
      conditions: ['full'],
      permutations: 4,
    });
    const consensus = consensusPick(measured.trials, 'ref-1', 'full', 0.6);
    expect(consensus?.label).toBe('A');
    expect(consensus?.share).toBe(1);
  });
});

/**
 * The preview sets exist to be shown to a reader, which only means anything if they still
 * satisfy the harness. Asserting `accept` rather than merely "parses" is deliberate: the
 * verbatim-evidence check caught a real misquote in one of them during authoring, and a
 * regression there would be invisible by eye.
 */
describe('preview fixtures', () => {
  for (const [name, blueprint, set] of [
    ['skill', SKILL_BLUEPRINT, SKILL_SET],
    ['performance', PERFORMANCE_BLUEPRINT, PERFORMANCE_SET],
  ] as const) {
    it(`${name}: blueprint and set are schema-valid and audit clean`, () => {
      expect(() => PassageSetBlueprintSchema.parse(blueprint)).not.toThrow();
      expect(() => GeneratedPassageSetSchema.parse(set)).not.toThrow();
      const results = runDeterministicChecks(set);
      const failures = results.filter((r) => !r.passed);
      expect(failures.map((f) => `${f.itemId ?? 'set'}:${f.id}`)).toEqual([]);
      expect(verdict({ results })).toBe('accept');
    });

    it(`${name}: every item's skill tag matches what the evidence scope derives`, () => {
      for (const item of blueprint.items) {
        expect(deriveSkill(item)).toBe(item.skill);
      }
    });
  }

  it('the two preview passages differ in thesis position, which is the difficulty lever', () => {
    expect(SKILL_BLUEPRINT.passage.thesisPosition).not.toBe(
      PERFORMANCE_BLUEPRINT.passage.thesisPosition,
    );
  });
});

describe('prompt plumbing', () => {
  it('extracts JSON from a fenced response', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: {"a":[1,2]} — done')).toEqual({ a: [1, 2] });
  });

  it('throws when there is no JSON object', () => {
    expect(() => extractJson('no object here')).toThrow(/no JSON object/);
  });
});

/** A generator that replays the authored example, so the pipeline can be tested offline. */
function replayGenerator(): AiChat {
  let itemIndex = 0;
  return {
    async chat(req: AiChatRequest): Promise<AiChatResult> {
      const prompt = req.messages.map((m) => m.content).join('\n');
      if (prompt.includes('Write one passage to this specification')) {
        return {
          text: JSON.stringify({
            title: EXAMPLE_SET.passage.title,
            paragraphs: EXAMPLE_SET.passage.paragraphs,
          }),
        };
      }
      if (prompt.includes('Write one four-option item')) {
        const item = EXAMPLE_SET.items[itemIndex];
        itemIndex += 1;
        if (!item) throw new Error('replay exhausted');
        return {
          text: JSON.stringify({
            stem: item.stem,
            choices: item.choices,
            correctChoice: item.correctChoice,
            evidenceQuotes: item.evidenceQuotes,
            rationales: item.rationales,
          }),
        };
      }
      // Adjudication.
      return {
        text: JSON.stringify({
          perOption: [],
          defensibleLabels: ['C'],
          verdict: 'single-defensible',
          notes: '',
        }),
      };
    },
  };
}

describe('pipeline', () => {
  const baseOptions = {
    generator: replayGenerator(),
    generatorModelId: 'replay-generator',
    now: () => new Date('2026-07-29T00:00:00.000Z'),
    idSuffix: () => 'fixed',
  };

  it('refuses to generate from an unapproved blueprint', async () => {
    const unapproved = structuredClone(EXAMPLE_BLUEPRINT);
    delete (unapproved as { approvedBy?: string }).approvedBy;
    await expect(generatePassageSet(unapproved, { ...baseOptions, generator: replayGenerator() })).rejects.toThrow(
      GenerationFailedError,
    );
    await expect(generatePassageSet(unapproved, { ...baseOptions, generator: replayGenerator() })).rejects.toThrow(
      /not approved/,
    );
  });

  it('produces a schema-valid set and records provenance', async () => {
    const result = await generatePassageSet(EXAMPLE_BLUEPRINT, {
      ...baseOptions,
      generator: replayGenerator(),
    });
    expect(result.set.items).toHaveLength(EXAMPLE_BLUEPRINT.items.length);
    expect(result.set.provenance.model).toBe('replay-generator');
    expect(result.set.provenance.pipelineVersion).toBeTruthy();
    expect(result.passageAttempts).toBe(1);
  });

  it('derives skill tags rather than trusting the generator', async () => {
    const result = await generatePassageSet(EXAMPLE_BLUEPRINT, {
      ...baseOptions,
      generator: replayGenerator(),
    });
    for (const [index, item] of result.set.items.entries()) {
      expect(item.skill).toBe(deriveSkill(EXAMPLE_BLUEPRINT.items[index]!));
    }
  });

  it('routes to review when no solver ensemble or adjudicator is configured', async () => {
    const result = await generatePassageSet(EXAMPLE_BLUEPRINT, {
      ...baseOptions,
      generator: replayGenerator(),
    });
    // An unrun check must not read as a passed check.
    expect(result.verdict).toBe('review');
    const ids = result.report.results.filter((r) => !r.passed).map((r) => r.id);
    expect(ids).toContain('solver-ensemble-present');
    expect(ids).toContain('adjudication-present');
  });

  it('passes every deterministic check on its own output', async () => {
    const result = await generatePassageSet(EXAMPLE_BLUEPRINT, {
      ...baseOptions,
      generator: replayGenerator(),
    });
    const mechanical = result.report.results.filter((r) => !r.passed && r.severity === 'reject');
    expect(mechanical.map((r) => r.id)).toEqual([]);
  });

  it('gives up after the configured number of passage attempts', async () => {
    const tooShort: AiChat = {
      async chat(): Promise<AiChatResult> {
        return {
          text: JSON.stringify({
            title: 'Too short',
            paragraphs: [
              'This paragraph is far too short to satisfy the calibrated passage band.',
              'So is this one, which means the shape gate should reject the candidate.',
              'A third short paragraph, still nowhere near five hundred words in total.',
              'And a fourth, so the paragraph-count gate passes and only length fails.',
            ],
          }),
        };
      },
    };
    await expect(
      generatePassageSet(EXAMPLE_BLUEPRINT, {
        ...baseOptions,
        generator: tooShort,
        maxPassageAttempts: 2,
      }),
    ).rejects.toThrow(/failed shape gates after 2 attempts/);
  });
});
