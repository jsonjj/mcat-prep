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

const asRec = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const asArray = (v: unknown): readonly unknown[] => (Array.isArray(v) ? v : []);

/** The `payload` object of a primary artifact (all lesson artifacts wrap content under `payload`). */
function payloadOf(input: LessonValidationInput, name: string): Record<string, unknown> | undefined {
  return asRec(objByName(input, name)?.payload);
}
function orderedKcIds(payload: Record<string, unknown> | undefined): string[] {
  // Canonical location is top-level `payload.ordered_kc_ids` (what the normalizer
  // uses, present in all three); `registry_binding.ordered_kc_ids` is an L1-only mirror.
  const str = (x: unknown): x is string => typeof x === 'string';
  const direct = asArray(payload?.ordered_kc_ids).filter(str);
  if (direct.length) return direct;
  return asArray(asRec(payload?.registry_binding)?.ordered_kc_ids).filter(str);
}

/**
 * The 15 instructional node kinds every KC must exhibit (generator test :14-30).
 * Verified present in all three real lessons; L3 additionally carries a `TRANSITION`
 * kind, so R8 requires a SUPERSET of these, not exact equality.
 */
const REQUIRED_NODE_KINDS = [
  'ENTRY_CHECK_BOUNDARY',
  'ORIENTATION',
  'EXPLANATION',
  'MENTAL_MODEL',
  'EXPERT_THINK_ALOUD',
  'WORKED_EXAMPLE',
  'GUIDED_PRACTICE',
  'LIGHT_SUPPORT_PRACTICE',
  'SOLO_PRACTICE',
  'CONTRAST_BOUNDARY',
  'NEAR_EXIT',
  'CHANGED_EXIT',
  'TARGETED_REPAIR',
  'EXACT_REENTRY',
  'RECAP',
] as const;

/** The closed field set of a `nodes[]` record — identical across all three grammars. */
const ALLOWED_NODE_FIELDS = new Set([
  'node_id',
  'node_kind',
  'primary_kc_id',
  'secondary_kc_refs',
  'route_eligibility',
  'learner_content_blocks',
  'representation_ids',
  'activity_ids',
  'checkpoint_ref',
  'source_claim_refs',
]);

const CONTENT_ROUTES = ['concise', 'standard', 'misconception'] as const;

/** The five release-honesty flags every uncalibrated draft must pin false (generator test :158-164). */
const CORE_CLAIM_FLAGS = [
  'learner_validated',
  'efficacy_established',
  'mastery_calibrated',
  'readiness_validated',
  'production_published',
] as const;

const cap = (items: readonly string[], n = 5): string =>
  items.slice(0, n).join('; ') + (items.length > n ? ` (+${items.length - n} more)` : '');

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
    if (expected === null) return;
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

/** R6 — closed nested records: no unknown fields on `nodes[]` (generator test :233-244). */
export function ruleR6(input: LessonValidationInput): RuleResult[] {
  const nodes = asArray(payloadOf(input, 'lesson-script.json')?.nodes);
  if (!nodes.length) return [fail('R6', input.lessonId, 'lesson-script payload has no nodes[]')];
  const offenders: string[] = [];
  for (const n of nodes) {
    const node = asRec(n);
    if (!node) continue;
    const extra = Object.keys(node).filter((k) => !ALLOWED_NODE_FIELDS.has(k));
    if (extra.length) offenders.push(`${String(node.node_id ?? '?')}:{${extra.join(',')}}`);
  }
  if (offenders.length) return [fail('R6', input.lessonId, `node record(s) not closed: ${cap(offenders)}`)];
  return [pass('R6', input.lessonId, `all ${nodes.length} node records closed (${ALLOWED_NODE_FIELDS.size}-field schema)`)];
}

/** R8 — every KC exhibits all 15 required node kinds (superset; L3 adds TRANSITION). */
export function ruleR8(input: LessonValidationInput): RuleResult[] {
  const payload = payloadOf(input, 'lesson-script.json');
  const nodes = asArray(payload?.nodes);
  const kcIds = orderedKcIds(payload);
  if (!kcIds.length) return [fail('R8', input.lessonId, 'lesson-script payload has no ordered_kc_ids')];
  const results: RuleResult[] = [];
  for (const kc of kcIds) {
    const kinds = new Set<string>();
    for (const n of nodes) {
      const node = asRec(n);
      if (node && node.primary_kc_id === kc && typeof node.node_kind === 'string') kinds.add(node.node_kind);
    }
    const missing = REQUIRED_NODE_KINDS.filter((k) => !kinds.has(k));
    if (missing.length) results.push(fail('R8', input.lessonId, `${kc}: missing node kind(s): ${missing.join(', ')}`));
    else results.push(pass('R8', input.lessonId, `${kc}: all 15 required node kinds present (${kinds.size} total)`));
  }
  return results;
}

/** R9 — route coverage: each content route has exactly 2 exit_ids + >=1 repair_ids (status label varies by maturity, so unchecked). */
export function ruleR9(input: LessonValidationInput): RuleResult[] {
  const rows = asArray(payloadOf(input, 'kc-coverage-matrix.json')?.rows);
  if (!rows.length) return [fail('R9', input.lessonId, 'kc-coverage-matrix payload has no rows[]')];
  const results: RuleResult[] = [];
  for (const row of rows) {
    const r = asRec(row);
    const kc = String(r?.kc_id ?? '?');
    const cov = asRec(r?.route_coverage);
    if (!cov) {
      results.push(fail('R9', input.lessonId, `${kc}: no route_coverage`));
      continue;
    }
    const problems: string[] = [];
    for (const route of CONTENT_ROUTES) {
      const v = asRec(cov[route]);
      const exits = asArray(v?.exit_ids).length;
      const repairs = asArray(v?.repair_ids).length;
      if (exits !== 2) problems.push(`${route}.exit_ids=${exits}(need 2)`);
      if (repairs < 1) problems.push(`${route}.repair_ids=${repairs}(need >=1)`);
    }
    if (problems.length) results.push(fail('R9', input.lessonId, `${kc}: ${problems.join(', ')}`));
    else results.push(pass('R9', input.lessonId, `${kc}: 3 content routes each carry 2 exits + repair(s)`));
  }
  return results;
}

/** R10 — transition referential integrity: every authorized_next_node_id resolves to a real node. */
export function ruleR10(input: LessonValidationInput): RuleResult[] {
  const payload = payloadOf(input, 'lesson-script.json');
  const nodes = asArray(payload?.nodes);
  const activities = asArray(payload?.activities);
  if (!activities.length) return [fail('R10', input.lessonId, 'lesson-script payload has no activities[]')];
  const nodeIds = new Set<string>();
  for (const n of nodes) {
    const node = asRec(n);
    if (node && typeof node.node_id === 'string') nodeIds.add(node.node_id);
  }
  const dangling: string[] = [];
  let withNext = 0;
  for (const a of activities) {
    const act = asRec(a);
    const next = asArray(act?.authorized_next_node_ids);
    if (next.length) withNext++;
    for (const t of next) {
      if (typeof t === 'string' && !nodeIds.has(t)) dangling.push(`${String(act?.activity_id ?? '?')}->${t}`);
    }
  }
  if (dangling.length) return [fail('R10', input.lessonId, `dangling transition target(s): ${cap(dangling)}`)];
  return [
    pass('R10', input.lessonId, `all transitions resolve (${withNext}/${activities.length} activities author next nodes over ${nodeIds.size} nodes)`),
  ];
}

/** R12 — release honesty: gate BLOCKED, INTERNAL_DRAFT_ONLY, all core claim flags false (generator test :151-165). */
export function ruleR12(input: LessonValidationInput): RuleResult[] {
  const payload = payloadOf(input, 'lesson-quality-report.json');
  if (!payload) return [fail('R12', input.lessonId, 'no lesson-quality-report payload')];
  const problems: string[] = [];
  if (payload.final_gate_status !== 'BLOCKED') problems.push(`final_gate_status=${String(payload.final_gate_status)}(need BLOCKED)`);
  if (payload.release_eligibility !== 'INTERNAL_DRAFT_ONLY')
    problems.push(`release_eligibility=${String(payload.release_eligibility)}(need INTERNAL_DRAFT_ONLY)`);
  const claims = asRec(payload.claim_limits);
  if (!claims) problems.push('claim_limits missing');
  else for (const f of CORE_CLAIM_FLAGS) if (claims[f] !== false) problems.push(`claim_limits.${f}=${String(claims[f])}(need false)`);
  if (problems.length) return [fail('R12', input.lessonId, problems.join(', '))];
  return [pass('R12', input.lessonId, 'gate BLOCKED, INTERNAL_DRAFT_ONLY, all 5 core claim flags false')];
}

/** R13 — label vs structure: an item's exit role and its exit function must agree (the "label lies" catcher). */
export function ruleR13(input: LessonValidationInput): RuleResult[] {
  let lesson;
  try {
    lesson = normalizeLesson(toRawArtifacts(input));
  } catch (e) {
    return [fail('R13', input.lessonId, `normalize failed: ${(e as Error).message}`)];
  }
  const liars: string[] = [];
  for (const it of lesson.items) {
    const expected =
      it.activityRole === 'NEAR_EXIT' ? 'NEAR_USE' : it.activityRole === 'CHANGED_EXIT' ? 'CHANGED_TASK' : 'NONE';
    if (it.exitFunction !== expected)
      liars.push(`${it.itemId}[${it.activityRole}] exitFunction=${it.exitFunction} (expected ${expected})`);
  }
  if (liars.length) return [fail('R13', input.lessonId, `label≠structure: ${cap(liars)}`)];
  return [pass('R13', input.lessonId, `all ${lesson.items.length} item roles agree with their exit function`)];
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
