import { normalizeLesson, type RawLessonArtifacts } from '../lesson-normalization';
import { contentSha256, fileSha256 } from './canonical';
import {
  PRIMARY_ARTIFACT_FILES,
  type ArtifactFile,
  type LessonValidationInput,
  type ManifestRecord,
  type RuleResult,
} from './types';

const pass = (rule: string, lessonId: string, detail: string): RuleResult => ({ rule, lessonId, ok: true, detail });
const fail = (rule: string, lessonId: string, detail: string): RuleResult => ({ rule, lessonId, ok: false, detail });
const short = (s: unknown): string => String(s).slice(0, 12);

const PRIMARY = PRIMARY_ARTIFACT_FILES as readonly string[];

function fileByName(input: LessonValidationInput, name: string): ArtifactFile | undefined {
  return input.files.find((f) => f.relPath === name);
}
function objByName(input: LessonValidationInput, name: string): Record<string, unknown> | undefined {
  const j = fileByName(input, name)?.json;
  return j !== null && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : undefined;
}
function embeddedSha(obj: Record<string, unknown> | undefined): string | null {
  return obj && typeof obj.content_sha256 === 'string' ? obj.content_sha256 : null;
}
function depBindings(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  const d = obj?.dependency_bindings;
  return d !== null && typeof d === 'object' ? (d as Record<string, unknown>) : {};
}
function toRawArtifacts(input: LessonValidationInput): RawLessonArtifacts {
  const learnerSafeItems = objByName(input, 'learner-safe-items.json');
  const protectedItems = objByName(input, 'protected-items.json');
  return {
    script: objByName(input, 'lesson-script.json'),
    ...(learnerSafeItems ? { learnerSafeItems } : {}),
    ...(protectedItems ? { protectedItems } : {}),
  };
}

/** R2 union: normalize L2 (`file` keys + protected/learner-safe objects) and L3 (`path` keys + companion_artifacts). */
export function reconcileManifest(manifest: unknown): ManifestRecord[] {
  if (manifest === null || typeof manifest !== 'object') return [];
  const m = manifest as Record<string, unknown>;
  const out: ManifestRecord[] = [];
  const push = (rec: unknown): void => {
    if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) return;
    const r = rec as Record<string, unknown>;
    const relPath = typeof r.file === 'string' ? r.file : typeof r.path === 'string' ? r.path : null;
    if (!relPath) return;
    out.push({
      relPath,
      artifactType: typeof r.artifact_type === 'string' ? r.artifact_type : null,
      contentSha256: typeof r.content_sha256 === 'string' ? r.content_sha256 : null,
      fileSha256: typeof r.file_sha256 === 'string' ? r.file_sha256 : null,
    });
  };
  if (Array.isArray(m.primary_artifacts)) m.primary_artifacts.forEach(push);
  if (Array.isArray(m.companion_artifacts)) m.companion_artifacts.forEach(push); // L3
  push(m.protected_material); // L2 single object
  push(m.learner_safe_projection); // L2 single object
  return out;
}

/** R1 — shape tolerance: 4 primary files required; manifest optional (present L2/L3, absent L1). */
export function ruleR1(input: LessonValidationInput): RuleResult {
  const missing = PRIMARY.filter((n) => !fileByName(input, n));
  if (missing.length) return fail('R1', input.lessonId, `missing primary artifact(s): ${missing.join(', ')}`);
  return pass(
    'R1',
    input.lessonId,
    input.manifest ? 'all 4 primary artifacts + manifest (L2/L3 envelope)' : 'all 4 primary artifacts, no manifest (L1 envelope)',
  );
}

/** R2 — manifest reconciliation (skipped for L1). */
export function ruleR2(input: LessonValidationInput, recs: ManifestRecord[]): RuleResult {
  if (!input.manifest) return pass('R2', input.lessonId, 'no manifest (L1) — reconciliation N/A');
  const primaries = recs.filter((r) => PRIMARY.includes(r.relPath));
  if (primaries.length < PRIMARY.length) {
    return fail('R2', input.lessonId, `manifest reconciled only ${primaries.length}/${PRIMARY.length} primary records`);
  }
  const noFileSha = recs.filter((r) => !r.fileSha256).map((r) => r.relPath);
  if (noFileSha.length) return fail('R2', input.lessonId, `manifest records missing file_sha256: ${noFileSha.join(', ')}`);
  return pass('R2', input.lessonId, `manifest reconciled to ${recs.length} records (${primaries.length} primary)`);
}

/** R3 — canonicalization label vs reality: recompute content_sha256; must equal embedded AND manifest. */
export function ruleR3(input: LessonValidationInput, recs: ManifestRecord[]): RuleResult[] {
  const results: RuleResult[] = [];
  for (const name of PRIMARY) {
    const obj = objByName(input, name);
    if (!obj) {
      results.push(fail('R3', input.lessonId, `${name}: missing or not an object`));
      continue;
    }
    const embedded = embeddedSha(obj);
    if (!embedded) {
      results.push(fail('R3', input.lessonId, `${name}: no embedded content_sha256`));
      continue;
    }
    const recomputed = contentSha256(obj);
    if (recomputed !== embedded) {
      results.push(fail('R3', input.lessonId, `${name}: embedded content_sha256 ${short(embedded)} != repo-canonical ${short(recomputed)}`));
      continue;
    }
    const rec = recs.find((r) => r.relPath === name);
    if (rec?.contentSha256 && rec.contentSha256 !== embedded) {
      results.push(fail('R3', input.lessonId, `${name}: manifest content_sha256 ${short(rec.contentSha256)} != file ${short(embedded)}`));
      continue;
    }
    results.push(pass('R3', input.lessonId, `${name}: content_sha256 canonical & consistent (${short(embedded)})`));
  }
  return results;
}

/** R4 — file_sha256 = SHA-256 of stored bytes (skipped for L1: no manifest). */
export function ruleR4(input: LessonValidationInput, recs: ManifestRecord[]): RuleResult[] {
  if (!input.manifest) return [pass('R4', input.lessonId, 'no manifest (L1) — file_sha256 convention N/A')];
  const results: RuleResult[] = [];
  for (const rec of recs) {
    if (!rec.fileSha256) continue;
    const f = fileByName(input, rec.relPath);
    if (!f) {
      results.push(fail('R4', input.lessonId, `manifest lists ${rec.relPath} but file absent`));
      continue;
    }
    const recomputed = fileSha256(f.rawBytes);
    if (recomputed !== rec.fileSha256) {
      results.push(fail('R4', input.lessonId, `${rec.relPath}: file_sha256 ${short(rec.fileSha256)} != bytes ${short(recomputed)}`));
    } else {
      results.push(pass('R4', input.lessonId, `${rec.relPath}: file_sha256 matches stored bytes (${short(recomputed)})`));
    }
  }
  return results;
}

/** R5 — dependency hash chain, recomputed from embedded content hashes (not trusted blindly). */
export function ruleR5(input: LessonValidationInput): RuleResult[] {
  const script = objByName(input, 'lesson-script.json');
  const coverage = objByName(input, 'kc-coverage-matrix.json');
  const presentation = objByName(input, 'lesson-presentation-plan.json');
  const quality = objByName(input, 'lesson-quality-report.json');
  const scriptSha = embeddedSha(script);
  const coverageSha = embeddedSha(coverage);
  const presentationSha = embeddedSha(presentation);
  const results: RuleResult[] = [];
  const check = (label: string, actual: unknown, expected: string | null): void => {
    if (expected == null) return;
    if (actual === expected) results.push(pass('R5', input.lessonId, `${label} chain ok`));
    else results.push(fail('R5', input.lessonId, `${label}: binding ${short(actual)} != upstream ${short(expected)}`));
  };
  if (coverage) check('coverage->script', depBindings(coverage).lesson_script_sha256, scriptSha);
  if (presentation) {
    check('presentation->script', depBindings(presentation).lesson_script_sha256, scriptSha);
    check('presentation->coverage', depBindings(presentation).kc_coverage_matrix_sha256, coverageSha);
  }
  if (quality) {
    check('quality->script', depBindings(quality).lesson_script_sha256, scriptSha);
    check('quality->coverage', depBindings(quality).kc_coverage_matrix_sha256, coverageSha);
    check('quality->presentation', depBindings(quality).lesson_presentation_plan_sha256, presentationSha);
  }
  return results;
}

/** R11 — semantic-family isolation + per-KC exit coverage (generalized to >=1 near/changed; L1's >=2 was L1-specific). */
export function ruleR11(input: LessonValidationInput): RuleResult[] {
  let lesson;
  try {
    lesson = normalizeLesson(toRawArtifacts(input));
  } catch (e) {
    return [fail('R11', input.lessonId, `normalize failed: ${(e as Error).message}`)];
  }
  const results: RuleResult[] = [];
  const fams = lesson.items.map((i) => i.semanticFamilyId);
  const dupes = [...new Set(fams.filter((f, i) => fams.indexOf(f) !== i))];
  if (dupes.length) results.push(fail('R11', input.lessonId, `duplicate semantic_family_id: ${dupes.join(', ')}`));
  else results.push(pass('R11', input.lessonId, `all ${fams.length} semantic_family_id unique`));
  for (const kc of lesson.kcs) {
    const near = kc.items.filter((i) => i.activityRole === 'NEAR_EXIT').length;
    const changed = kc.items.filter((i) => i.activityRole === 'CHANGED_EXIT').length;
    if (near >= 1 && changed >= 1) results.push(pass('R11', input.lessonId, `${kc.kcId}: exits near=${near} changed=${changed}`));
    else results.push(fail('R11', input.lessonId, `${kc.kcId}: exit coverage near=${near} changed=${changed} (need >=1 each)`));
  }
  return results;
}

const PRACTICE_ROLES = ['GUIDED_PRACTICE', 'LIGHT_SUPPORT_PRACTICE', 'SOLO_PRACTICE'] as const;

/** R15 — runtime-servability: normalizes cleanly AND every KC carries a full micro-cycle. */
export function ruleR15(input: LessonValidationInput): RuleResult[] {
  let lesson;
  try {
    lesson = normalizeLesson(toRawArtifacts(input));
  } catch (e) {
    return [fail('R15', input.lessonId, `not servable — normalize threw: ${(e as Error).message}`)];
  }
  const results: RuleResult[] = [];
  for (const kc of lesson.kcs) {
    const roles = new Set(kc.items.map((i) => i.activityRole));
    const missing: string[] = [];
    if (!roles.has('ENTRY_CHECK')) missing.push('ENTRY_CHECK');
    if (!PRACTICE_ROLES.some((r) => roles.has(r))) missing.push('PRACTICE');
    if (!roles.has('NEAR_EXIT')) missing.push('NEAR_EXIT');
    if (!roles.has('CHANGED_EXIT')) missing.push('CHANGED_EXIT');
    if (!roles.has('REPAIR_CONFIRMATION')) missing.push('REPAIR_CONFIRMATION');
    if (missing.length) results.push(fail('R15', input.lessonId, `${kc.kcId}: missing required role(s): ${missing.join(', ')}`));
    else results.push(pass('R15', input.lessonId, `${kc.kcId}: full micro-cycle present`));
  }
  return results;
}
