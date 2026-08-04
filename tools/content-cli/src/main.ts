import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
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
  buildResolvableIds,
  computeQuality,
  lessonOrderedKcIds,
  planLessonRehash,
  planProposedKcs,
  validateCatalog,
  type LessonKcRefs,
  type LessonValidationInput,
  type RehashFile,
  type ResolvableIds,
} from '@mcat/content/lesson-validator';
import {
  createAssignmentAllocation,
  finalizeAssignmentManifests,
  type AssignmentPartitionInput,
} from '@mcat/content/lesson-factory';

/**
 * Where the v7 JSONL corpus is expected under the repo when a developer keeps a
 * local copy. It is gitignored (`.local/`): the corpus is answer-bearing and large,
 * so it is intentionally NOT vendored into git. See content/question-bank/corpus-source.md.
 */
const DEFAULT_V7_RELATIVE = join(
  'content',
  'question-bank',
  '.local',
  'v7-corpus',
  'generated-v7-dok-dynamic-final.jsonl',
);

/** Actionable hint printed whenever the corpus cannot be located/read. */
const CORPUS_HINT =
  'Point at the v7 corpus with $MCAT_V7_CORPUS_PATH (absolute, or relative to the repo ' +
  'root), or pass the path as the command argument. The corpus is answer-bearing and is ' +
  'NOT vendored into git — see content/question-bank/corpus-source.md for how to obtain/place it.';

/**
 * Resolve the v7 corpus path from (in order): an explicit CLI argument,
 * $MCAT_V7_CORPUS_PATH, else the documented gitignored repo-relative default. This
 * replaces the former hardcoded single-machine absolute path so the same command
 * works on any machine / in CI once the corpus is provided.
 */
function resolveV7CorpusPath(explicit: string | undefined): string {
  if (explicit !== undefined && explicit.trim() !== '') {
    return isAbsolute(explicit) ? explicit : join(process.env.INIT_CWD ?? process.cwd(), explicit);
  }
  const fromEnv = process.env.MCAT_V7_CORPUS_PATH;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return isAbsolute(fromEnv) ? fromEnv : join(REPO_ROOT, fromEnv);
  }
  return join(REPO_ROOT, DEFAULT_V7_RELATIVE);
}

/** Read the corpus, or exit with the resolved path + an actionable hint. */
function readCorpusOrExit(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    console.error(
      `Could not read the v7 corpus at:\n  ${path}\n` +
        `${err instanceof Error ? err.message : String(err)}\n\n${CORPUS_HINT}`,
    );
    process.exit(1);
  }
}

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
  const text = readCorpusOrExit(path);

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
/** jsonb literal, or SQL NULL when absent — for optional protected columns. */
const sqlJsonOrNull = (v: unknown): string => (v === undefined || v === null ? 'null' : sqlJson(v));

/**
 * Read the v7 corpus READ-ONLY, derive each question's section + 15-cluster
 * rollup (via the KC path), split the answer key/explanations into the protected
 * table, and emit a gitignored `seed.sql`. The seed carries answer material and
 * MUST stay out of git (it is written under the gitignored `.local/` bundle).
 */
function cmdDbSeed(path: string): void {
  const text = readCorpusOrExit(path);

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
      'insert into question_protected (question_id, correct_answer, explanations, error_models) values (' +
        [
          sqlStr(q.id),
          sqlStr(prot.correct_answer),
          sqlJson(prot.explanations),
          // Server-only per-choice misconceptions (WS2); NULL when the item has none.
          sqlJsonOrNull(prot.error_models),
        ].join(', ') +
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
  // 0015 adds question_protected.error_models, which the seed now populates (WS2).
  console.log('  psql "$DATABASE_URL" -f database/migrations/0015_question_protected_error_models.sql');
  console.log('  psql "$DATABASE_URL" -f content/question-bank/.local/v7-load/seed.sql');
  console.log(
    '  psql "$DATABASE_URL" -c \'select section, count(*) from questions group by section order by section;\'',
  );
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

/**
 * Structural lesson-catalog merge gate (Real Lesson Catalog, Phase 3). Discovers
 * every real lesson under content/lessons/ (a directory carrying lesson-script.json),
 * builds the pure LessonValidationInput EXACTLY as the validator's own tests do —
 * artifact files + artifact-manifest + the in-repo R14 curriculum catalog + L1
 * browser evidence — runs the full R1–R15 rule set, prints a concise per-lesson
 * report, and EXITS NON-ZERO on any failure so CI can block the merge. Pass a single
 * lesson dir to scope it; pass `--json` for the machine-readable catalog report.
 */
function cmdLessonValidate(): void {
  const lessonsRoot = join(REPO_ROOT, 'content', 'lessons');
  const positional = args.slice(1).find((a) => !a.startsWith('--'));
  const jsonOut = args.includes('--json');

  let lessonDirs: string[];
  if (positional !== undefined) {
    lessonDirs = [isAbsolute(positional) ? positional : join(REPO_ROOT, positional)];
  } else {
    let entries: string[] = [];
    try {
      entries = readdirSync(lessonsRoot);
    } catch {
      console.error(`lesson-validate: cannot read ${lessonsRoot}`);
      process.exit(1);
      return;
    }
    lessonDirs = entries
      .map((name) => join(lessonsRoot, name))
      .filter((d) => {
        try {
          return statSync(d).isDirectory() && existsSync(join(d, 'lesson-script.json'));
        } catch {
          return false;
        }
      })
      .sort();
  }
  if (lessonDirs.length === 0) {
    console.error(
      `lesson-validate: no lessons (directories with lesson-script.json) found under ${lessonsRoot}`,
    );
    process.exit(1);
    return;
  }

  // Frozen in-repo id catalog R14 resolves against; null ⇒ R14 reports N/A (never a silent pass).
  const curriculumPath = join(REPO_ROOT, 'curriculum', 'v3', 'v3-lesson-authoring-manifest.json');
  const resolvableIds: ResolvableIds | null = existsSync(curriculumPath)
    ? buildResolvableIds(JSON.parse(readFileSync(curriculumPath, 'utf8')) as unknown)
    : null;
  if (resolvableIds === null) {
    console.error(
      `lesson-validate: WARNING — curriculum catalog missing at ${curriculumPath}; R14 will be N/A`,
    );
  }

  const inputs: LessonValidationInput[] = lessonDirs.map((dir) => {
    const dirName = basename(dir);
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'artifact-manifest.json')
      .sort()
      .map((relPath) => {
        const rawBytes = readFileSync(join(dir, relPath), 'utf8');
        return { relPath, rawBytes, json: JSON.parse(rawBytes) as unknown };
      });
    const manifestPath = join(dir, 'artifact-manifest.json');
    const manifest = existsSync(manifestPath)
      ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown)
      : null;
    // Browser evidence lives outside the lesson dir (L1 only today); supply it for R7 when present.
    const reportPath = join(REPO_ROOT, 'tests', 'browser', 'evidence', dirName, 'browser-report.json');
    const browserEvidence = existsSync(reportPath)
      ? {
          reportRawText: readFileSync(reportPath, 'utf8'),
          reportJson: JSON.parse(readFileSync(reportPath, 'utf8')) as unknown,
        }
      : null;
    return { lessonId: dirName.toUpperCase(), files, manifest, resolvableIds, browserEvidence };
  });

  const report = validateCatalog(inputs);

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `lesson-validate: ${inputs.length} lesson(s) under content/lessons/  (R14 catalog: ${resolvableIds ? 'loaded' : 'N/A'})`,
    );
    for (const lesson of report.lessons) {
      const failing = lesson.results.filter((r) => !r.ok);
      console.log(
        `\n  ${lesson.ok ? 'PASS' : 'FAIL'}  ${lesson.lessonId}  —  ${lesson.results.length} rules, ${failing.length} failing`,
      );
      for (const r of failing) console.error(`      x ${r.rule} [${lesson.lessonId}]: ${r.detail}`);
    }
    console.log(
      report.ok
        ? `\nCATALOG OK — all ${report.lessons.length} lessons pass R1–R15.`
        : `\nCATALOG FAILED — ${report.failures.length} failing rule(s) across ${report.lessons.filter((l) => !l.ok).length} lesson(s).`,
    );
  }

  if (!report.ok) process.exit(1);
}

/**
 * Proposed-KCs queue (Real Lesson Catalog, Phase 3). ADVISORY mirror of R14: surfaces every
 * KC a lesson declares (payload.ordered_kc_ids) that is absent from the curriculum catalog, so
 * an author of a genuinely-new lesson can propose the KCs it needs instead of being silently
 * blocked. NEVER a gate — always exits 0. Default is a dry-run report; `--write` reconciles an
 * idempotent managed block in key-docs/roadmap-todo.md. For today's three lessons the set is
 * empty (every KC resolves — R14 is green), so this reports zero and writes nothing by default.
 */
function cmdProposedKcs(): void {
  const write = args.includes('--write');
  const lessonsRoot = join(REPO_ROOT, 'content', 'lessons');
  const lessonDirs = readdirSync(lessonsRoot)
    .map((name) => join(lessonsRoot, name))
    .filter((d) => {
      try {
        return statSync(d).isDirectory() && existsSync(join(d, 'lesson-script.json'));
      } catch {
        return false;
      }
    })
    .sort();
  const lessons: LessonKcRefs[] = lessonDirs.map((dir) => ({
    lessonId: basename(dir).toUpperCase(),
    orderedKcIds: lessonOrderedKcIds(JSON.parse(readFileSync(join(dir, 'lesson-script.json'), 'utf8')) as unknown),
  }));

  const curriculumPath = join(REPO_ROOT, 'curriculum', 'v3', 'v3-lesson-authoring-manifest.json');
  if (!existsSync(curriculumPath)) {
    console.error(`proposed-kcs: curriculum catalog missing at ${curriculumPath} (cannot decide what is unknown)`);
    process.exit(1);
    return;
  }
  const catalogKcIds = buildResolvableIds(JSON.parse(readFileSync(curriculumPath, 'utf8')) as unknown).kcIds;
  const roadmapPath = join(REPO_ROOT, 'key-docs', 'roadmap-todo.md');
  const existing = existsSync(roadmapPath) ? readFileSync(roadmapPath, 'utf8') : '';
  const plan = planProposedKcs(lessons, catalogKcIds, existing);

  console.log(
    `proposed-kcs: ${lessons.length} lesson(s), ${catalogKcIds.size} catalog KCs → ${plan.proposed.length} proposed (advisory; not a gate)`,
  );
  for (const p of plan.proposed) console.log(`  ${p.kcId}  (referenced by ${p.lessons.join(', ')})`);
  if (plan.proposed.length === 0) {
    console.log('  none — every declared KC resolves against the curriculum catalog.');
  }

  if (write) {
    if (plan.changed) {
      writeFileSync(roadmapPath, plan.newRoadmapText);
      console.log(`  wrote managed block to ${roadmapPath}`);
    } else {
      console.log(`  ${roadmapPath} already current — no write.`);
    }
  } else if (plan.changed) {
    console.log('  (dry-run) re-run with --write to reconcile key-docs/roadmap-todo.md');
  }
}

/**
 * Computed-quality checks (Real Lesson Catalog, Phase 3): estimatedMinutes plausibility and
 * difficulty-label distribution — the two computed rubric dimensions not already in the gate
 * (R11 = evidence independence, R14 = declared-vs-actual coverage). Detect-then-assert: N/A
 * when a lesson carries no calibrated timing / no difficulty labels (today's catalog), FAIL
 * (non-zero exit) only when a lesson populates them implausibly. `--json` for machine output.
 */
function cmdComputedQuality(): void {
  const jsonOut = args.includes('--json');
  const lessonsRoot = join(REPO_ROOT, 'content', 'lessons');
  const reports = readdirSync(lessonsRoot)
    .map((name) => join(lessonsRoot, name))
    .filter((d) => {
      try {
        return statSync(d).isDirectory() && existsSync(join(d, 'lesson-script.json'));
      } catch {
        return false;
      }
    })
    .sort()
    .map((dir) =>
      computeQuality(
        basename(dir).toUpperCase(),
        JSON.parse(readFileSync(join(dir, 'lesson-script.json'), 'utf8')) as unknown,
      ),
    );

  if (jsonOut) {
    console.log(JSON.stringify(reports, null, 2));
  } else {
    for (const r of reports) {
      console.log(`\n  ${r.ok ? 'OK  ' : 'FAIL'} ${r.lessonId}`);
      for (const c of r.checks) console.log(`     ${c.status.toUpperCase().padEnd(4)} ${c.check}: ${c.detail}`);
    }
    const failed = reports.filter((r) => !r.ok).length;
    console.log(`\ncomputed-quality: ${reports.length} lesson(s), ${failed} with FAIL(s) (N/A never blocks).`);
  }
  if (reports.some((r) => !r.ok)) process.exit(1);
}

/**
 * Deterministically partition the 111 not-yet-authored canonical lessons into the
 * 51/30/30 factory lanes. The pure implementation receives exact bytes; this command
 * only resolves the frozen WP-01 inputs, verifies their pins, and persists its files.
 */
function assignmentAllocationInput(): AssignmentPartitionInput {
  const manifestRel = 'curriculum/v3/v3-lesson-authoring-manifest.json';
  const assignmentSchemaRel = 'content/lesson-factory/schemas/assignment-manifest.schema.json';
  const proofSchemaRel = 'content/lesson-factory/schemas/assignment-partition-proof.schema.json';
  const sharedSchemaRel = 'content/lesson-factory/schemas/shared-vocabulary.schema.json';
  const profileRel = 'content/lesson-factory/deadline-profile/deadline-profile.json';
  const releasePolicyRel = 'content/lesson-factory/deadline-profile/release-policy.json';

  const manifestText = readFileSync(join(REPO_ROOT, manifestRel), 'utf8');
  const assignmentSchemaText = readFileSync(join(REPO_ROOT, assignmentSchemaRel), 'utf8');
  const proofSchemaText = readFileSync(join(REPO_ROOT, proofSchemaRel), 'utf8');
  const sharedVocabularySchemaText = readFileSync(join(REPO_ROOT, sharedSchemaRel), 'utf8');
  const profileText = readFileSync(join(REPO_ROOT, profileRel), 'utf8');
  const releasePolicyText = readFileSync(join(REPO_ROOT, releasePolicyRel), 'utf8');
  const profile = JSON.parse(profileText) as Record<string, unknown>;
  const rubricIdentity = profile.rubric_identity;
  if (
    rubricIdentity === null ||
    typeof rubricIdentity !== 'object' ||
    Array.isArray(rubricIdentity)
  ) {
    throw new Error('assignment-partition: deadline profile has no rubric_identity object');
  }
  const rubric = rubricIdentity as Record<string, unknown>;
  if (
    typeof rubric.rubric_path !== 'string' ||
    typeof rubric.rubric_version !== 'string' ||
    typeof rubric.rubric_sha256 !== 'string'
  ) {
    throw new Error('assignment-partition: deadline profile rubric_identity is incomplete');
  }
  if (typeof profile.frozen_at !== 'string') {
    throw new Error('assignment-partition: deadline profile has no deterministic frozen_at');
  }

  const sha256 = (text: string): string =>
    createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
  const expectedReleasePolicyRef = `policy:${releasePolicyRel}#sha256:${sha256(releasePolicyText)}`;
  if (profile.release_policy_ref !== expectedReleasePolicyRef) {
    throw new Error(
      `assignment-partition: deadline profile release_policy_ref is stale; expected ${expectedReleasePolicyRef}`,
    );
  }
  const rubricText = readFileSync(join(REPO_ROOT, rubric.rubric_path), 'utf8');
  const actualRubricSha256 = sha256(rubricText);
  if (rubric.rubric_sha256 !== actualRubricSha256) {
    throw new Error(
      `assignment-partition: deadline profile rubric hash is stale; expected ${actualRubricSha256}`,
    );
  }

  return {
    manifestText,
    assignmentSchemaText,
    proofSchemaText,
    sharedVocabularySchemaText,
    sourceManifestPath: manifestRel,
    assignmentSchemaPath: assignmentSchemaRel,
    proofSchemaPath: proofSchemaRel,
    createdAt: profile.frozen_at,
    deadlineProfileRef: `profile:${profileRel}#sha256:${sha256(profileText)}`,
    releasePolicyRef: expectedReleasePolicyRef,
    rubricIdentity: {
      rubric_path: rubric.rubric_path,
      rubric_version: rubric.rubric_version,
      rubric_sha256: rubric.rubric_sha256,
    },
  };
}

function cmdAssignmentPartition(): void {
  const result = createAssignmentAllocation(assignmentAllocationInput());
  const staleAssignmentFiles = [
    'content/lesson-factory/assignments/primary-51.json',
    'content/lesson-factory/assignments/team-A-30.json',
    'content/lesson-factory/assignments/team-B-30.json',
  ];
  for (const relativePath of staleAssignmentFiles) {
    rmSync(join(REPO_ROOT, relativePath), { force: true });
  }

  for (const [relativePath, bytes] of Object.entries(result.files)) {
    const outputPath = join(REPO_ROOT, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
  }

  console.log('assignment-partition: wrote deterministic allocation proof only');
  for (const assignment of result.allocations) {
    console.log(`  ${assignment.teamId}: ${assignment.rows.length}`);
  }
  console.log(`  allocation: ${result.allocationContentSha256}`);
  console.log(`  output set: ${result.outputSetSha256}`);
}

function cmdAssignmentFinalize(packetMapArg: string | undefined): void {
  if (packetMapArg === undefined) {
    throw new Error('assignment-finalize: expected a packet-reference map JSON path');
  }
  const packetMapPath = isAbsolute(packetMapArg) ? packetMapArg : join(REPO_ROOT, packetMapArg);
  const parsedPacketMap = JSON.parse(readFileSync(packetMapPath, 'utf8')) as unknown;
  if (
    parsedPacketMap === null ||
    typeof parsedPacketMap !== 'object' ||
    Array.isArray(parsedPacketMap)
  ) {
    throw new Error('assignment-finalize: packet-reference map must be a JSON object');
  }
  const allocationInput = assignmentAllocationInput();
  const proofPath = join(REPO_ROOT, 'content/lesson-factory/assignments/partition-proof.json');
  const result = finalizeAssignmentManifests({
    allocationProof: JSON.parse(readFileSync(proofPath, 'utf8')) as unknown,
    assignmentSchemaText: allocationInput.assignmentSchemaText,
    proofSchemaText: allocationInput.proofSchemaText,
    sharedVocabularySchemaText: allocationInput.sharedVocabularySchemaText,
    packetRefs: parsedPacketMap as Record<string, string>,
  });
  for (const [relativePath, bytes] of Object.entries(result.files)) {
    const outputPath = join(REPO_ROOT, relativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bytes);
  }
  console.log('assignment-finalize: wrote final WP-01 assignment manifests');
  console.log(`  assignment set: ${result.assignmentSetContentSha256}`);
  console.log(`  output set: ${result.outputSetSha256}`);
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
    cmdLoadV7(resolveV7CorpusPath(arg));
    break;
  case 'db-seed':
    cmdDbSeed(resolveV7CorpusPath(arg));
    break;
  case 'rehash':
    cmdRehash(arg);
    break;
  case 'lesson-validate':
    cmdLessonValidate();
    break;
  case 'proposed-kcs':
    cmdProposedKcs();
    break;
  case 'computed-quality':
    cmdComputedQuality();
    break;
  case 'assignment-partition':
    cmdAssignmentPartition();
    break;
  case 'assignment-finalize':
    cmdAssignmentFinalize(arg);
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
        '  rehash <lessonDir>  Recompute a lesson content-hash chain (content_sha256 + file_sha256) after an authored edit\n' +
        '  lesson-validate [dir] [--json]  Structural R1–R15 gate over content/lessons/ (non-zero exit on failure; CI merge gate)\n' +
        '  proposed-kcs [--write]  Advisory queue of lesson KCs absent from the curriculum catalog (mirrors R14; never gates)\n' +
        '  computed-quality [--json]  estimatedMinutes plausibility + difficulty distribution (N/A when uncalibrated; FAIL gates)\n' +
        '  assignment-partition  Generate deterministic lesson-factory 51/30/30 allocation proof (removes stale manifests)\n' +
        '  assignment-finalize <packet-ref-map.json>  Finalize assignment manifests after WP-04 packet generation\n',
    );
}
