import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Repo root, independent of the current working directory (tools/content-cli/src -> up 3).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
import {
  QuestionSchema,
  StimulusSchema,
  loadSyntheticBank,
  validateQuestion,
  type ValidationIssue,
} from '@mcat/content';

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
  console.log('Dry run (synthetic bank):');
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

function cmdValidate(dir: string): void {
  const files = listJsonFiles(dir);
  if (files.length === 0) {
    console.log(`No content JSON found under ${dir}. Bank is empty — the app stays in "not loaded".`);
    return;
  }
  let errors = 0;
  for (const file of files) {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const isStimulus = typeof raw?.type === 'string' && !('choices' in raw);
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
      const semantic = validateQuestion(parsed.data as never).filter((i) => i.severity === 'error');
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
  writeFileSync(join(outDir, 'question.schema.json'), JSON.stringify(question, null, 2) + '\n');
  writeFileSync(join(outDir, 'stimulus.schema.json'), JSON.stringify(stimulus, null, 2) + '\n');
  console.log(`Wrote schemas to ${outDir}`);
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
  default:
    console.log(
      'MCAT content CLI\n\nCommands:\n  manifest            Print the (synthetic) bank manifest\n  dry-run             Coverage summary for the synthetic bank\n  validate [dir]      Validate canonical JSON content in a directory\n  schemas             Generate JSON Schemas into content/question-bank/schema/\n',
    );
}
