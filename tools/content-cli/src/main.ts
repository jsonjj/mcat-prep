import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Repo root, independent of the current working directory (tools/content-cli/src -> up 3).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
import {
  AssetSchema,
  QuestionSchema,
  StimulusSchema,
  compileV7Bank,
  compileV7Question,
  loadSyntheticBank,
  loadV7Jsonl,
  resolveReasoningOperation,
  resolveV7Placement,
  summarizeV7,
  validateV7Question,
  type ValidationIssue,
} from '@mcat/content';
import {
  buildVectorLessonArtifacts,
  canonicalVectorLessonArtifactJson,
  validateVectorLessonArtifacts,
} from '@mcat/content/v3-vector-lesson';
import { planLessonRehash, type RehashFile } from '@mcat/content/lesson-validator';

/**
 * Default v7 corpus location. This lives in the LOCAL-ONLY archive OUTSIDE the
 * repo and must never be copied into the repo or committed. We only read it.
 */
const DEFAULT_V7_PATH =
  '/Users/jonat/Desktop/mcat-prep_LOCAL_ONLY_DO_NOT_PUSH_20260721_131303/question-corpus/generated/v7-dok-dynamic-textonly-2026-07-23/repairs_2026-07-23/generated-v7-dok-dynamic-final.jsonl';

const args = process.argv.slice(2).filter((a) => a !== '--');
const command = args[0];
const arg = args[1];

function listJsonFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listJsonFiles(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

function printIssues(file: string, issues: ValidationIssue[]): void {
  for (const i of issues) {
    console.error(
      `  ${i.severity.toUpperCase()} ${file} ${i.path} [${i.code}] ${i.message}` +
        (i.received ? ` (received: ${i.received})` : ''),
    );
  }
}

function cmdManifest(): void {
  const bank = loadSyntheticBank();
  console.log(JSON.stringify(bank.manifest, null, 2));
}

function cmdDryRun(): void {
  const bank = loadSyntheticBank();
  console.log('Dry run (synthetic engine bank):');
  console.log(`  release: ${bank.contentRelease}`);
  console.log(`  questions: ${bank.manifest.counts.questions}`);
  console.log(`  stimuli: ${bank.manifest.counts.stimuli}`);
  console.log(`  test-only: ${bank.manifest.counts.testOnly}`);
  console.log('  families by cluster:');
  for (const [cluster, n] of Object.entries(bank.manifest.familiesByCluster)) {
    console.log(`    ${cluster}: ${n}`);
  }
  console.log('  NOTE: synthetic content is rejected by production publication.');
}

/** Validate canonical v7 JSON content (one file per record) under a directory. */
function cmdValidate(dir: string): void {
  const files = listJsonFiles(dir);
  if (files.length === 0) {
    console.log(
      `No content JSON found under ${dir}. Bank is empty — the app stays in "not loaded".`,
    );
    return;
  }
  let errors = 0;
  for (const file of files) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const isStimulus = !('choices' in raw) && Array.isArray(raw?.body);
    const parsed = isStimulus ? StimulusSchema.safeParse(raw) : QuestionSchema.safeParse(raw);
    if (!parsed.success) {
      errors += 1;
      console.error(`FAIL ${file}`);
      for (const issue of parsed.error.issues) {
        console.error(`  SCHEMA /${issue.path.join('/')} [${issue.code}] ${issue.message}`);
      }
      continue;
    }
    if (!isStimulus) {
      const semantic = validateV7Question(parsed.data as never).filter(
        (i) => i.severity === 'error',
      );
      if (semantic.length > 0) {
        errors += 1;
        console.error(`FAIL ${file}`);
        printIssues(file, semantic);
      }
    }
  }
  if (errors > 0) {
    console.error(`\nValidation failed: ${errors} file(s) with errors.`);
    process.exit(1);
  }
  console.log(`Validation OK: ${files.length} file(s).`);
}

function cmdSchemas(): void {
  const outDir = join(REPO_ROOT, 'content', 'question-bank', 'schema');
  mkdirSync(outDir, { recursive: true });
  const question = zodToJsonSchema(QuestionSchema, 'Question');
  const stimulus = zodToJsonSchema(StimulusSchema, 'Stimulus');
  const asset = zodToJsonSchema(AssetSchema, 'Asset');
  writeFileSync(join(outDir, 'question.schema.json'), JSON.stringify(question, null, 2) + '\n');
  writeFileSync(join(outDir, 'stimulus.schema.json'), JSON.stringify(stimulus, null, 2) + '\n');
  writeFileSync(join(outDir, 'asset.schema.json'), JSON.stringify(asset, null, 2) + '\n');
  console.log(`Wrote schemas to ${outDir}`);
}

/**
 * Read a v7 JSONL corpus READ-ONLY, validate every record, compile the safe +
 * protected split, and write a gitignored local bundle + report. Never copies the
 * source into the repo and never writes tracked answer-bearing output.
 */
function cmdLoadV7(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(
      `Could not read v7 corpus at:\n  ${path}\n${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return;
  }

  const result = loadV7Jsonl([{ name: path, text }]);
  const summary = summarizeV7(result);

  console.log('v7 load report');
  console.log(`  source: ${path} (read-only)`);
  console.log(`  valid records: ${summary.total}`);
  console.log(`  schema-rejected lines: ${summary.schemaErrors}`);
  console.log(
    `  semantic errors: ${summary.semanticErrors}  warnings: ${summary.semanticWarnings}`,
  );
  console.log(`  with passage: ${summary.withPassage}  with assets: ${summary.withAssets}`);
  console.log('  by section:');
  for (const [section, n] of Object.entries(summary.bySection).sort()) {
    console.log(`    ${section}: ${n}`);
  }
  if (result.errors.length > 0) {
    console.log('  first schema errors:');
    for (const e of result.errors.slice(0, 10)) {
      console.log(`    line ${e.line}: ${e.message.split('\n')[0]}`);
    }
  }

  // Compile + write a LOCAL, gitignored bundle (never tracked). The protected
  // bundle carries answer material and must stay out of git / off learner surfaces.
  const compiled = compileV7Bank(result.items);
  const outDir = join(REPO_ROOT, 'content', 'question-bank', '.local', 'v7-load');
  mkdirSync(outDir, { recursive: true });
  const safeJsonl = compiled.map((c) => JSON.stringify(c.safe)).join('\n') + '\n';
  const protectedJsonl = compiled.map((c) => JSON.stringify(c.protected)).join('\n') + '\n';
  writeFileSync(join(outDir, 'learner-safe.jsonl'), safeJsonl);
  writeFileSync(join(outDir, 'protected.jsonl'), protectedJsonl);
  writeFileSync(
    join(outDir, 'report.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), source: path, summary }, null, 2) +
      '\n',
  );
  console.log(`\nWrote local (gitignored) bundle to ${outDir}`);
  console.log('  - learner-safe.jsonl (no keys/explanations)');
  console.log('  - protected.jsonl (server-only: correct_answer + explanations)');
  console.log('  - report.json');
  console.log(
    '\nNOTE: DB load is a separate step (Postgres provisioning is still an open decision).',
  );
}

// ---- SQL emit helpers (single-quote escaping; jsonb literals) --------------
const sqlStr = (s: string | null | undefined): string =>
  s === null || s === undefined ? 'null' : `'${s.replace(/'/g, "''")}'`;
const sqlNum = (n: number | null | undefined): string =>
  n === null || n === undefined ? 'null' : String(n);
const sqlJson = (v: unknown): string => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;

/**
 * Read the v7 corpus READ-ONLY, derive each question's section + 15-cluster
 * rollup (via the KC path), split the answer key/explanations into the protected
 * table, and emit a gitignored `seed.sql`. The seed carries answer material and
 * MUST stay out of git (it is written under the gitignored `.local/` bundle).
 */
function cmdDbSeed(path: string): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    console.error(
      `Could not read v7 corpus at:\n  ${path}\n${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
    return;
  }

  const result = loadV7Jsonl([{ name: path, text }]);
  if (result.errors.length > 0) {
    console.error(
      `Refusing to seed: ${result.errors.length} schema-invalid line(s). Fix the corpus first.`,
    );
    process.exit(1);
    return;
  }

  const byCluster: Record<string, number> = {};
  const bySection: Record<string, number> = {};
  let unresolved = 0;

  const lines: string[] = [
    '-- AUTO-GENERATED seed for the MCAT v7 question bank.',
    '-- Contains ANSWER KEYS + explanations (question_protected). NEVER commit this file.',
    '-- Apply after migrations 0006_question_bank.sql + 0008_reasoning_operation.sql. Idempotent.',
    'begin;',
  ];

  for (const q of result.items) {
    const { safe, protected: prot } = compileV7Question(q);
    const placement = resolveV7Placement(q);
    const dbSection = placement.crossSection ? 'cross_section' : placement.section;
    if (!placement.cluster) unresolved += 1;
    byCluster[placement.cluster ?? 'UNRESOLVED'] =
      (byCluster[placement.cluster ?? 'UNRESOLVED'] ?? 0) + 1;
    bySection[dbSection ?? 'null'] = (bySection[dbSection ?? 'null'] ?? 0) + 1;

    lines.push(
      'insert into questions (question_id, content_release, section, cluster, kc_id, lesson_id, family_id, ' +
        'subject, primary_skill, reasoning_operation, dok_level, stem, passage, choices, assets, status) values (' +
        [
          sqlStr(q.id),
          sqlStr('v7-local'),
          sqlStr(dbSection),
          sqlStr(placement.cluster),
          sqlStr(q.primary_kc_id),
          sqlStr(q.lesson_id),
          sqlStr(q.family_id),
          sqlStr(q.subject),
          sqlStr(q.primary_skill),
          sqlStr(resolveReasoningOperation(q)),
          sqlNum(q.dok_level),
          sqlStr(safe.stem),
          sqlStr(safe.passage),
          sqlJson(safe.choices),
          sqlJson(safe.assets),
          sqlStr(q.status),
        ].join(', ') +
        ') on conflict (question_id) do nothing;',
    );
    lines.push(
      'insert into question_protected (question_id, correct_answer, explanations) values (' +
        [sqlStr(q.id), sqlStr(prot.correct_answer), sqlJson(prot.explanations)].join(', ') +
        ') on conflict (question_id) do nothing;',
    );
  }
  lines.push('commit;');

  const outDir = join(REPO_ROOT, 'content', 'question-bank', '.local', 'v7-load');
  mkdirSync(outDir, { recursive: true });
  const seedPath = join(outDir, 'seed.sql');
  writeFileSync(seedPath, lines.join('\n') + '\n');

  console.log('v7 db-seed report');
  console.log(`  source: ${path} (read-only)`);
  console.log(`  questions: ${result.items.length}`);
  console.log(`  unresolved cluster: ${unresolved}`);
  console.log('  by section:');
  for (const [s, n] of Object.entries(bySection).sort()) console.log(`    ${s}: ${n}`);
  console.log('  by cluster:');
  for (const [c, n] of Object.entries(byCluster).sort()) console.log(`    ${c}: ${n}`);
  console.log(`\nWrote gitignored seed to ${seedPath} (contains answer keys — do NOT commit).`);
  console.log(
    '\nTo load into a real Postgres (local docker / Neon / Supabase), set DATABASE_URL then run:',
  );
  console.log('  psql "$DATABASE_URL" -f database/migrations/0006_question_bank.sql');
  console.log('  psql "$DATABASE_URL" -f database/migrations/0008_reasoning_operation.sql');
  console.log('  psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql');
  console.log(
    '  psql "$DATABASE_URL" -c \'select section, count(*) from questions group by section order by section;\'',
  );
}

function cmdVectorLessonArtifacts(): void {
  const artifacts = buildVectorLessonArtifacts();
  const issues = validateVectorLessonArtifacts(artifacts);
  if (issues.length > 0) {
    for (const issue of issues) console.error(`FAIL ${issue}`);
    process.exit(1);
  }

  const outDir = join(REPO_ROOT, 'content', 'lessons', 'v3-les-130923');
  mkdirSync(outDir, { recursive: true });
  for (const [filename, artifact] of [
    ['lesson-script.json', artifacts.script],
    ['kc-coverage-matrix.json', artifacts.coverage],
    ['lesson-presentation-plan.json', artifacts.presentation],
    ['lesson-quality-report.json', artifacts.quality],
  ] as const) {
    writeFileSync(join(outDir, filename), canonicalVectorLessonArtifactJson(artifact));
  }
  console.log(`Wrote four validated V3-LES-130923 internal-draft artifacts to ${outDir}`);
}

/**
 * Recompute a lesson's content-hash chain after an authored edit (Real Lesson
 * Catalog, Phase 3/4). Byte-faithful for the four primary artifacts (only hash
 * substrings change; historical `lineage.*` hashes are preserved); refreshes the
 * manifest + `file_sha256`. Reuses the validator's canonical primitives, then
 * INDEPENDENTLY re-rehashes the written files to prove the chain is self-consistent.
 */
function cmdRehash(lessonDirArg: string | undefined): void {
  if (!lessonDirArg) {
    console.error('rehash: expected a lesson directory, e.g. content/lessons/v3-les-844372');
    process.exit(1);
    return;
  }
  const dir = isAbsolute(lessonDirArg) ? lessonDirArg : join(REPO_ROOT, lessonDirArg);
  const readFiles = (): RehashFile[] =>
    readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'artifact-manifest.json')
      .map((relPath) => ({ relPath, rawText: readFileSync(join(dir, relPath), 'utf8') }));
  const manifestPath = join(dir, 'artifact-manifest.json');
  const readManifest = (): string | null => (existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null);

  const plan = planLessonRehash(readFiles(), readManifest());
  console.log(`rehash: ${dir}`);
  for (const c of plan.primaryContentSha) {
    const arrow = c.oldContentSha256 === c.newContentSha256 ? '==' : '->';
    console.log(`  ${c.relPath.padEnd(28)} ${String(c.oldContentSha256).slice(0, 12)} ${arrow} ${c.newContentSha256.slice(0, 12)}`);
  }
  if (!plan.changed) {
    console.log('  already consistent — no files written.');
    return;
  }
  for (const w of plan.writes) writeFileSync(join(dir, w.relPath), w.newText);
  console.log(`  wrote ${plan.writes.length} file(s): ${plan.writes.map((w) => w.relPath).join(', ')}`);

  // Independent verification: a fresh read + rehash of what we just wrote must be a no-op.
  const verify = planLessonRehash(readFiles(), readManifest());
  if (verify.changed) {
    console.error(`  VERIFY FAILED: re-rehash still reports changes to ${verify.writes.map((w) => w.relPath).join(', ')}`);
    process.exit(1);
    return;
  }
  console.log('  verify: independent re-rehash is a no-op — hash chain self-consistent. OK');
}

switch (command) {
  case 'manifest':
    cmdManifest();
    break;
  case 'dry-run':
    cmdDryRun();
    break;
  case 'validate':
    cmdValidate(arg ?? join(REPO_ROOT, 'content', 'question-bank', 'items'));
    break;
  case 'schemas':
    cmdSchemas();
    break;
  case 'load-v7':
    cmdLoadV7(arg ?? DEFAULT_V7_PATH);
    break;
  case 'db-seed':
    cmdDbSeed(arg ?? DEFAULT_V7_PATH);
    break;
  case 'vector-lesson-artifacts':
    cmdVectorLessonArtifacts();
    break;
  case 'rehash':
    cmdRehash(arg);
    break;
  default:
    console.log(
      'MCAT content CLI\n\nCommands:\n' +
        '  manifest            Print the (synthetic) engine bank manifest\n' +
        '  dry-run             Coverage summary for the synthetic engine bank\n' +
        '  validate [dir]      Validate canonical v7 JSON content in a directory\n' +
        '  schemas             Generate JSON Schemas into content/question-bank/schema/\n' +
        '  load-v7 [path]      Validate + compile the v7 JSONL corpus (read-only) into a local bundle\n' +
        '  db-seed [path]      Emit a gitignored seed.sql (questions + protected answers) with derived cluster/section\n' +
        '  vector-lesson-artifacts  Generate exactly four V3-LES-130923 internal-draft artifacts\n' +
        '  rehash <lessonDir>  Recompute a lesson content-hash chain (content_sha256 + file_sha256) after an authored edit\n',
    );
}
