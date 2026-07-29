/**
 * CARS generator CLI.
 *
 * Two modes:
 *
 *   audit  — runs the deterministic harness against a set that already exists on disk
 *            (or the authored example). No network, no key. Use this to see what the
 *            gates measure and to sanity-check thresholds after changing them.
 *
 *   generate — runs the full pipeline against a live provider: passage generation with
 *            measure-and-resample, originality, item generation, the deterministic
 *            audit, the solver ablation battery, and key adjudication.
 *
 *   calibrate — measures the solver ablations against the *reference* corpus so the
 *            leakage gates read "worse than a real CARS item" instead of an invented
 *            number. Reads screenshots outside the repo and emits accuracy rates only;
 *            see the guardrail in `calibrate.ts`. `--stub` runs the plumbing with a
 *            deterministic fake ensemble and no network.
 *
 * Configuration, matching the convention in `apps/learner-web/.env.example`:
 *   AI_API_KEY               provider key (required for `generate`)
 *   AI_BASE_URL              default https://api.openai.com/v1
 *   AI_MODEL                 generator model
 *   CARS_SOLVER_MODELS       comma-separated ensemble for the ablations
 *   CARS_ADJUDICATOR_MODEL   independent critic for key defensibility
 *
 * The generator model is refused as a solver or adjudicator. That is not fussiness: a
 * model asked to grade its own output exhibits self-preference, and the one published
 * ensemble with a measured AUROC was deliberately heterogeneous across vendors for this
 * reason.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import {
  ABLATION_CONDITIONS,
  EXAMPLE_BLUEPRINT,
  EXAMPLE_SET,
  GeneratedPassageSetSchema,
  PassageSetBlueprintSchema,
  generatePassageSet,
  runDeterministicChecks,
  summarize,
  toSafePassageSet,
  verdict,
  type AblationCondition,
  type NamedSolver,
  type PassageSetBlueprint,
} from '@mcat/cars-generation';
import { calibrateSolverGates } from './calibrate';
import { OpenAiChat } from './openai-chat';
import { stubSolvers } from './stub-solvers';

interface Args {
  readonly command: 'audit' | 'generate' | 'calibrate';
  readonly blueprintPath?: string;
  readonly setPath?: string;
  readonly outPath?: string;
  readonly dirs: readonly string[];
  readonly matches: readonly string[];
  readonly keysPath?: string;
  readonly maxSets?: number;
  readonly stub: boolean;
  readonly permutations?: number;
  readonly conditions?: readonly AblationCondition[];
  readonly yes: boolean;
}

/**
 * Loads every `.env` found, without overriding anything already set. All candidates are
 * read rather than just the first: the AI settings conventionally live in the app's
 * `.env.local` while the repo root `.env` holds unrelated keys, so stopping at the first
 * file that yielded anything would skip the one that matters. Earlier files win.
 */
function loadEnvFiles(): string[] {
  const candidates = [
    '.env',
    '../../.env',
    'apps/learner-web/.env.local',
    '../../apps/learner-web/.env.local',
  ];
  const loaded: string[] = [];
  for (const candidate of candidates) {
    let contents: string;
    try {
      contents = readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
    let tookAnything = false;
    for (const raw of contents.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!value || process.env[key]) continue;
      process.env[key] = value;
      tookAnything = true;
    }
    if (tookAnything) loaded.push(candidate);
  }
  return loaded;
}

const COMMANDS = ['audit', 'generate', 'calibrate'] as const;

function parseArgs(argv: readonly string[]): Args {
  const first = argv[0];
  const command = (COMMANDS as readonly string[]).includes(first ?? '')
    ? (first as Args['command'])
    : 'audit';
  let blueprintPath: string | undefined;
  let setPath: string | undefined;
  let outPath: string | undefined;
  let keysPath: string | undefined;
  let maxSets: number | undefined;
  let stub = false;
  let yes = false;
  let permutations: number | undefined;
  let conditions: readonly AblationCondition[] | undefined;
  const dirs: string[] = [];
  const matches: string[] = [];
  for (let i = 1; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === '--blueprint' && next) {
      blueprintPath = next;
      i += 1;
    } else if (argv[i] === '--set' && next) {
      setPath = next;
      i += 1;
    } else if (argv[i] === '--out' && next) {
      outPath = next;
      i += 1;
    } else if (argv[i] === '--dir' && next) {
      dirs.push(next);
      i += 1;
    } else if (argv[i] === '--match' && next) {
      matches.push(next);
      i += 1;
    } else if (argv[i] === '--keys' && next) {
      keysPath = next;
      i += 1;
    } else if (argv[i] === '--max-sets' && next) {
      maxSets = Number(next);
      i += 1;
    } else if (argv[i] === '--permutations' && next) {
      permutations = Number(next);
      i += 1;
    } else if (argv[i] === '--conditions' && next) {
      conditions = next
        .split(',')
        .map((c) => c.trim())
        .filter((c): c is AblationCondition =>
          (ABLATION_CONDITIONS as readonly string[]).includes(c),
        );
      i += 1;
    } else if (argv[i] === '--stub') {
      stub = true;
    } else if (argv[i] === '--yes' || argv[i] === '-y') {
      yes = true;
    }
  }
  return {
    command,
    dirs,
    matches,
    stub,
    yes,
    ...(blueprintPath ? { blueprintPath } : {}),
    ...(setPath ? { setPath } : {}),
    ...(outPath ? { outPath } : {}),
    ...(keysPath ? { keysPath } : {}),
    ...(maxSets && Number.isFinite(maxSets) ? { maxSets } : {}),
    ...(permutations && Number.isFinite(permutations) ? { permutations } : {}),
    ...(conditions && conditions.length > 0 ? { conditions } : {}),
  };
}

function loadBlueprint(path: string | undefined): PassageSetBlueprint {
  if (!path) return EXAMPLE_BLUEPRINT;
  return PassageSetBlueprintSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function buildSolvers(generatorModel: string): NamedSolver[] {
  const raw = process.env.CARS_SOLVER_MODELS;
  if (!raw) return [];
  const apiKey = requireEnv('AI_API_KEY');
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  return raw
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0)
    .filter((m) => {
      if (m === generatorModel) {
        process.stderr.write(
          `refusing to use the generating model ${m} as a solver; a model must not grade its own output\n`,
        );
        return false;
      }
      return true;
    })
    .map((model) => ({ id: model, chat: new OpenAiChat({ apiKey, baseUrl, model }) }));
}

function audit(args: Args): number {
  const set = args.setPath
    ? GeneratedPassageSetSchema.parse(JSON.parse(readFileSync(args.setPath, 'utf8')))
    : EXAMPLE_SET;

  const report = { results: runDeterministicChecks(set) };
  process.stdout.write(`Auditing ${set.items.length} item(s) on passage "${set.passage.title}"\n\n`);
  process.stdout.write(`${summarize(report)}\n\n`);

  // Every score is printed, not just failures: the thresholds are provisional and the
  // scores are what makes them re-tunable later.
  process.stdout.write('All measured scores:\n');
  for (const result of report.results) {
    if (result.score === undefined) continue;
    const scope = result.itemId ? result.itemId : 'set';
    const mark = result.passed ? 'ok  ' : 'FAIL';
    process.stdout.write(
      `  ${mark} ${scope.padEnd(24)} ${result.id.padEnd(32)} ${result.score.toFixed(3)}${
        result.threshold === undefined ? '' : ` (threshold ${result.threshold})`
      }\n`,
    );
  }

  if (args.outPath) {
    writeFileSync(args.outPath, `${JSON.stringify({ report, safe: toSafePassageSet(set) }, null, 2)}\n`);
    process.stdout.write(`\nwrote ${args.outPath}\n`);
  }

  return verdict(report) === 'reject' ? 1 : 0;
}

async function generate(args: Args): Promise<number> {
  const blueprint = loadBlueprint(args.blueprintPath);
  if (!process.env.AI_API_KEY) {
    process.stderr.write(
      'AI_API_KEY is not set.\n\n' +
        'Put it in apps/learner-web/.env.local (already has AI_BASE_URL and AI_MODEL),\n' +
        'or export it for one run:\n\n' +
        '  AI_API_KEY=sk-... CARS_SOLVER_MODELS=gpt-4o-mini \\\n' +
        '    pnpm cars:generate -- --conditions full,passage-blind --permutations 2\n',
    );
    return 1;
  }
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const generatorModel = process.env.AI_MODEL ?? 'gpt-4o-mini';

  const generator = new OpenAiChat({ apiKey, baseUrl, model: generatorModel });
  const solvers = buildSolvers(generatorModel);

  const adjudicatorModel = process.env.CARS_ADJUDICATOR_MODEL;
  const adjudicator =
    adjudicatorModel && adjudicatorModel !== generatorModel
      ? new OpenAiChat({ apiKey, baseUrl, model: adjudicatorModel })
      : undefined;

  const itemCount = blueprint.items.length;
  const conditions = args.conditions ?? ABLATION_CONDITIONS;
  const permutations = args.permutations ?? 4;

  process.stdout.write(`generator:   ${generatorModel}\n`);
  process.stdout.write(`solvers:     ${solvers.length > 0 ? solvers.map((s) => s.id).join(', ') : '(none — leakage checks will not run)'}\n`);
  process.stdout.write(`adjudicator: ${adjudicator ? adjudicatorModel : '(none — key defensibility will not be verified)'}\n`);

  // The ablation grid dominates the call count and every call is sequential, so the cost
  // is stated before any of it is spent rather than discovered afterwards.
  const solverCalls = solvers.length * itemCount * conditions.length * permutations;
  const generationCalls = 1 + itemCount + (adjudicator ? itemCount : 0);
  process.stdout.write(
    `\nablation grid: ${conditions.length} condition(s) × ${permutations} rotation(s) × ${itemCount} item(s) × ${solvers.length} solver(s)\n`,
  );
  process.stdout.write(
    `provider calls: ~${generationCalls + solverCalls} sequential` +
      ` (${generationCalls} generation/adjudication, ${solverCalls} solver)\n`,
  );
  if (solverCalls > 60 && !args.yes) {
    process.stdout.write(
      `\nThat is a lot of sequential calls for a first run. Narrow the grid with\n` +
        `  --conditions full,passage-blind --permutations 2\n` +
        `or pass --yes to run the full grid as configured.\n`,
    );
    return 1;
  }
  process.stdout.write('\n');

  const result = await generatePassageSet(blueprint, {
    generator,
    generatorModelId: generatorModel,
    solvers,
    solverConditions: conditions,
    solverPermutations: permutations,
    ...(adjudicator ? { adjudicator } : {}),
    referenceCorpus: [],
  });

  process.stdout.write(`${result.set.passage.title}\n\n`);
  for (const paragraph of result.set.passage.paragraphs) {
    process.stdout.write(`${paragraph}\n\n`);
  }
  for (const item of result.set.items) {
    process.stdout.write(`${item.stem}\n`);
    for (const choice of item.choices) {
      const mark = choice.label === item.correctChoice ? '*' : ' ';
      process.stdout.write(`  ${mark} ${choice.label}. ${choice.text}\n`);
    }
    process.stdout.write(`    [${item.skill} · ${item.archetype}]\n\n`);
  }

  process.stdout.write(`${summarize(result.report)}\n`);

  if (args.outPath) {
    writeFileSync(args.outPath, `${JSON.stringify(result, null, 2)}\n`);
    process.stdout.write(`\nwrote ${args.outPath}\n`);
  }

  // `review` is the expected outcome, not a failure: human review of anything flagged is
  // the control the evidence supports, so only a hard rejection is a non-zero exit.
  return result.verdict === 'reject' ? 1 : 0;
}

async function calibrate(args: Args): Promise<number> {
  if (args.dirs.length === 0) {
    process.stderr.write('calibrate requires at least one --dir pointing at the reference corpus\n');
    return 1;
  }

  const solvers = args.stub ? stubSolvers() : buildSolvers(process.env.AI_MODEL ?? '');
  if (solvers.length === 0) {
    process.stderr.write(
      'no solvers configured: set CARS_SOLVER_MODELS and AI_API_KEY, or pass --stub to exercise the plumbing offline\n',
    );
    return 1;
  }

  if (args.stub) {
    process.stdout.write(
      'STUB MODE — the ensemble follows fixed surface cues, so these rates describe the stubs,\nnot the corpus. Use it to verify recovery and aggregation only.\n\n',
    );
  }

  const report = await calibrateSolverGates({
    dirs: args.dirs,
    matches: args.matches,
    solvers,
    keysFile: args.keysPath,
    maxSets: args.maxSets,
  });

  process.stdout.write(`label source: ${report.labelSource}\n`);
  process.stdout.write(
    `corpus:       ${report.corpus.pagesRead} page(s) read, ${report.corpus.setsRecovered} set(s),` +
      ` ${report.corpus.itemsRecovered} complete item(s), ${report.corpus.itemsLabelled} labelled` +
      ` (${report.corpus.itemsDroppedNoConsensus} unlabelled)\n`,
  );
  process.stdout.write(
    `discarded:    ${report.corpus.rendersWithIncompleteOptions} item render(s) with fewer than four readable options\n`,
  );
  process.stdout.write(`solvers:      ${report.solvers.join(', ')}\n\n`);

  process.stdout.write('Measured accuracy by ablation condition:\n');
  for (const row of report.byCondition) {
    process.stdout.write(
      `  ${row.condition.padEnd(16)} ${row.accuracy.toFixed(3)}  (${row.trials} trials)\n`,
    );
  }

  process.stdout.write('\nRecommended gates (measured rate plus headroom):\n');
  for (const [gate, value] of Object.entries(report.recommendedGates)) {
    process.stdout.write(`  ${gate.padEnd(20)} ${value === null ? 'n/a' : value.toFixed(3)}\n`);
  }

  if (report.caveats.length > 0) {
    process.stdout.write('\nCaveats:\n');
    for (const caveat of report.caveats) process.stdout.write(`  - ${caveat}\n`);
  }

  if (args.outPath) {
    writeFileSync(args.outPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`\nwrote ${args.outPath}\n`);
  }

  return 0;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command !== 'audit') {
    const envFiles = loadEnvFiles();
    if (envFiles.length > 0) {
      process.stdout.write(`loaded config from ${envFiles.join(', ')}\n`);
    }
  }
  let code: number;
  if (args.command === 'generate') code = await generate(args);
  else if (args.command === 'calibrate') code = await calibrate(args);
  else code = audit(args);
  process.exitCode = code;
}

await main();
