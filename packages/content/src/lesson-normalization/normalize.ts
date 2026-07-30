import {
  ACTIVITY_ROLES,
  LessonNormalizationError,
  type ActivityRole,
  type ExitFunction,
  type LessonGrammar,
  type NormalizedChoice,
  type NormalizedItem,
  type NormalizedKc,
  type NormalizedLesson,
  type NormalizedProjection,
} from './types';

/**
 * Parsed lesson artifacts. All fields are the parsed JSON of the on-disk files;
 * this module performs NO file IO (matching the package convention — the caller
 * reads the files and feeds parsed objects). `learnerSafeItems` / `protectedItems`
 * are required for the L2/L3 grammars and ignored for L1.
 */
export interface RawLessonArtifacts {
  readonly script: unknown;
  readonly learnerSafeItems?: unknown;
  readonly protectedItems?: unknown;
}

type Json = Record<string, unknown>;
type Detail = { lessonId?: string | undefined; itemId?: string | undefined };

function asObject(value: unknown, ctx: string, detail: Detail = {}): Json {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LessonNormalizationError(`expected an object at ${ctx}`, detail);
  }
  return value as Json;
}
function asArray(value: unknown, ctx: string, detail: Detail = {}): unknown[] {
  if (!Array.isArray(value)) throw new LessonNormalizationError(`expected an array at ${ctx}`, detail);
  return value;
}
function asString(value: unknown, ctx: string, detail: Detail = {}): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LessonNormalizationError(`expected a non-empty string at ${ctx}`, detail);
  }
  return value;
}

function payloadOf(script: unknown, lessonId?: string): Json {
  return asObject(asObject(script, 'script', { lessonId }).payload, 'script.payload', { lessonId });
}

/** Grammar detection is id-agnostic: it keys off which learner-safe ref each item carries. */
export function detectGrammar(script: unknown): LessonGrammar {
  const payload = payloadOf(script);
  const qep = asArray(payload.question_evidence_plan, 'payload.question_evidence_plan');
  const first = asObject(qep[0], 'question_evidence_plan[0]');
  if ('learner_safe_projection' in first) return 'L1_INLINE';
  if ('learner_safe_prompt_ref' in first) return 'L2_PROMPTREF';
  if ('learner_safe_projection_ref' in first) return 'L3_PROJECTIONREF';
  throw new LessonNormalizationError('cannot detect lesson grammar: no known learner-safe ref on the first item', {});
}

function normalizeExitFunction(raw: unknown): ExitFunction {
  if (raw === 'NEAR_USE') return 'NEAR_USE';
  if (raw === 'CHANGED_TASK') return 'CHANGED_TASK';
  return 'NONE'; // null (L1/L3), "NOT_EXIT" (L2), undefined
}

function assertRole(raw: unknown, lessonId: string, itemId: string): ActivityRole {
  if (typeof raw === 'string' && (ACTIVITY_ROLES as readonly string[]).includes(raw)) {
    return raw as ActivityRole;
  }
  throw new LessonNormalizationError(`unknown activity_role "${String(raw)}"`, { lessonId, itemId });
}

function deriveIsReentry(item: Json): boolean {
  if (item.exact_reentry_for != null) return true; // L3 explicit
  const id = String(item.activity_id ?? '').toLowerCase();
  return id.includes('reentry'); // L1 id suffix
}

/** For REPAIR_CONFIRMATION items, which exit function is being repaired (if determinable). */
function deriveRepairsFunction(item: Json): ExitFunction | null {
  const explicit = normalizeExitFunction(item.exit_function ?? item.near_or_changed_function);
  if (explicit !== 'NONE') return explicit; // L3 reentry items carry it explicitly
  const hay = `${String(item.semantic_family_id ?? '')} ${String(item.activity_id ?? '')}`.toLowerCase();
  if (hay.includes('near')) return 'NEAR_USE';
  if (hay.includes('changed')) return 'CHANGED_TASK';
  return null; // e.g. L3 generic repair-confirmation families — honestly undeterminable
}

function mapObjectChoices(raw: unknown, lessonId: string, itemId: string): NormalizedChoice[] {
  const list = asArray(raw, `${itemId}.learner_safe_projection.choices`, { lessonId });
  return list.map((c, ordinal) => {
    const choice = asObject(c, `${itemId}.choices[${ordinal}]`, { lessonId, itemId });
    return {
      choiceId: typeof choice.id === 'string' && choice.id.length > 0 ? choice.id : String(ordinal),
      ordinal,
      text: asString(choice.text, `${itemId}.choices[${ordinal}].text`, { lessonId, itemId }),
    };
  });
}
function mapStringOptions(raw: unknown): NormalizedChoice[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((text, ordinal) => ({ choiceId: String(ordinal), ordinal, text: String(text) }));
}

// ---------------------------------------------------------------------------
// L1 — inline projection
// ---------------------------------------------------------------------------
function resolveL1Projection(item: Json, lessonId: string, itemId: string): NormalizedProjection {
  const proj = asObject(item.learner_safe_projection, `${itemId}.learner_safe_projection`, { lessonId, itemId });
  return {
    sourceRef: '[inline]',
    prompt: asString(proj.prompt, `${itemId}.learner_safe_projection.prompt`, { lessonId, itemId }),
    responseType: 'single_select', // L1 inline items are 4-choice MCQ; no response_type field authored
    choices: mapObjectChoices(proj.choices, lessonId, itemId),
  };
}

// ---------------------------------------------------------------------------
// L2 — two-hop join: prompt_ref -> protected.prompt_ref -> learner_token -> learner-safe
// ---------------------------------------------------------------------------
function buildL2Resolver(artifacts: RawLessonArtifacts, lessonId: string) {
  const protectedItems = asArray(
    asObject(artifacts.protectedItems, 'protected-items.json', { lessonId }).items,
    'protected-items.json.items',
    { lessonId },
  );
  const learnerSafe = asArray(
    asObject(artifacts.learnerSafeItems, 'learner-safe-items.json', { lessonId }).items,
    'learner-safe-items.json.items',
    { lessonId },
  );
  const tokenByPromptRef = new Map<string, string>();
  for (const p of protectedItems) {
    const rec = asObject(p, 'protected item', { lessonId });
    if (typeof rec.prompt_ref === 'string' && typeof rec.learner_token === 'string') {
      tokenByPromptRef.set(rec.prompt_ref, rec.learner_token);
    }
  }
  const safeByToken = new Map<string, Json>();
  for (const s of learnerSafe) {
    const rec = asObject(s, 'learner-safe item', { lessonId });
    if (typeof rec.learner_token === 'string') safeByToken.set(rec.learner_token, rec);
  }
  return (item: Json, itemId: string): NormalizedProjection => {
    const ref = asString(item.learner_safe_prompt_ref, `${itemId}.learner_safe_prompt_ref`, { lessonId, itemId });
    const token = tokenByPromptRef.get(ref);
    if (!token) {
      throw new LessonNormalizationError(`L2 prompt_ref "${ref}" not bridged in protected-items.json`, { lessonId, itemId, ref });
    }
    const safe = safeByToken.get(token);
    if (!safe) {
      throw new LessonNormalizationError(`L2 learner_token "${token}" (from "${ref}") missing in learner-safe-items.json`, { lessonId, itemId, ref });
    }
    return {
      sourceRef: ref,
      prompt: asString(safe.prompt, `learner-safe[${token}].prompt`, { lessonId, itemId }),
      responseType: typeof safe.response_type === 'string' ? safe.response_type : 'single_select',
      choices: mapStringOptions(safe.options),
      title: typeof safe.phase_label === 'string' ? safe.phase_label : undefined,
      directions: typeof safe.directions === 'string' ? safe.directions : undefined,
      accessibilityAlternative: typeof safe.accessibility_alternative === 'string' ? safe.accessibility_alternative : undefined,
    };
  };
}

// ---------------------------------------------------------------------------
// L3 — prompt_key direct, or NODE:<id> -> node content (WORKED_EXAMPLE)
// ---------------------------------------------------------------------------
function buildL3Resolver(artifacts: RawLessonArtifacts, script: unknown, lessonId: string) {
  const learnerSafe = asArray(
    asObject(artifacts.learnerSafeItems, 'learner-safe-items.json', { lessonId }).items,
    'learner-safe-items.json.items',
    { lessonId },
  );
  const safeByKey = new Map<string, Json>();
  for (const s of learnerSafe) {
    const rec = asObject(s, 'learner-safe item', { lessonId });
    if (typeof rec.prompt_key === 'string') safeByKey.set(rec.prompt_key, rec);
  }
  const nodeIds = new Set<string>();
  for (const n of asArray(payloadOf(script, lessonId).nodes, 'payload.nodes', { lessonId })) {
    const node = asObject(n, 'node', { lessonId });
    if (typeof node.node_id === 'string') nodeIds.add(node.node_id);
  }
  return (item: Json, itemId: string): NormalizedProjection => {
    const ref = asString(item.learner_safe_projection_ref, `${itemId}.learner_safe_projection_ref`, { lessonId, itemId });
    if (ref.startsWith('NODE:')) {
      const nodeId = ref.slice('NODE:'.length);
      if (!nodeIds.has(nodeId)) {
        throw new LessonNormalizationError(`L3 projection ref node "${nodeId}" not found in payload.nodes`, { lessonId, itemId, ref });
      }
      return { sourceRef: ref, prompt: `[worked example: ${nodeId}]`, responseType: 'WORKED_EXAMPLE', choices: [] };
    }
    const safe = safeByKey.get(ref);
    if (!safe) {
      throw new LessonNormalizationError(`L3 projection_ref "${ref}" missing in learner-safe-items.json (prompt_key)`, { lessonId, itemId, ref });
    }
    return {
      sourceRef: ref,
      prompt: asString(safe.prompt, `learner-safe[${ref}].prompt`, { lessonId, itemId }),
      responseType: typeof safe.response_type === 'string' ? safe.response_type : 'single_select',
      choices: mapStringOptions(safe.options),
      title: typeof safe.title === 'string' ? safe.title : undefined,
    };
  };
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------
function buildItem(
  raw: unknown,
  lessonId: string,
  resolveProjection: (item: Json, itemId: string) => NormalizedProjection,
): NormalizedItem {
  const item = asObject(raw, 'question_evidence_plan[]', { lessonId });
  const itemId = asString(item.item_binding_id, 'item.item_binding_id', { lessonId });
  const activityRole = assertRole(item.activity_role, lessonId, itemId);
  return {
    itemId,
    activityId: typeof item.activity_id === 'string' && item.activity_id.length > 0 ? item.activity_id : null,
    primaryKcId: asString(item.primary_kc_id, `${itemId}.primary_kc_id`, { lessonId, itemId }),
    activityRole,
    exitFunction: normalizeExitFunction(item.exit_function ?? item.near_or_changed_function),
    repairsFunction: activityRole === 'REPAIR_CONFIRMATION' ? deriveRepairsFunction(item) : null,
    isReentry: deriveIsReentry(item),
    semanticFamilyId: asString(item.semantic_family_id, `${itemId}.semantic_family_id`, { lessonId, itemId }),
    scored: activityRole !== 'WORKED_EXAMPLE',
    projection: resolveProjection(item, itemId),
  };
}

function assemble(
  script: unknown,
  grammar: LessonGrammar,
  resolveProjection: (item: Json, itemId: string) => NormalizedProjection,
): NormalizedLesson {
  const scriptObj = asObject(script, 'script');
  const payload = payloadOf(script);
  const lessonId = asString(payload.lesson_id, 'payload.lesson_id');
  const orderedKcIds = asArray(payload.ordered_kc_ids, 'payload.ordered_kc_ids', { lessonId }).map((k, i) =>
    asString(k, `ordered_kc_ids[${i}]`, { lessonId }),
  );
  const qep = asArray(payload.question_evidence_plan, 'payload.question_evidence_plan', { lessonId });
  const items = qep.map((raw) => buildItem(raw, lessonId, resolveProjection));

  // every item's KC must be declared in ordered_kc_ids (closure)
  const kcSet = new Set(orderedKcIds);
  for (const it of items) {
    if (!kcSet.has(it.primaryKcId)) {
      throw new LessonNormalizationError(`item "${it.itemId}" references KC "${it.primaryKcId}" not in ordered_kc_ids`, {
        lessonId,
        itemId: it.itemId,
      });
    }
  }
  const kcs: NormalizedKc[] = orderedKcIds.map((kcId, index) => ({
    kcId,
    canonicalOrdinal: index + 1,
    items: items.filter((it) => it.primaryKcId === kcId),
  }));

  const definitionHash = typeof scriptObj.content_sha256 === 'string' ? scriptObj.content_sha256 : '';
  return { lessonId, groupingId: String(payload.grouping_id ?? ''), grammar, orderedKcIds, definitionHash, kcs, items };
}

// ---------------------------------------------------------------------------
// Public adapters + dispatcher
// ---------------------------------------------------------------------------
export function normalizeL1(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(artifacts.script, 'L1_INLINE', (item, itemId) => resolveL1Projection(item, lessonId, itemId));
}
export function normalizeL2(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(artifacts.script, 'L2_PROMPTREF', buildL2Resolver(artifacts, lessonId));
}
export function normalizeL3(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(artifacts.script, 'L3_PROJECTIONREF', buildL3Resolver(artifacts, artifacts.script, lessonId));
}

/** Normalize by auto-detecting the grammar. Throws (never partial) on any unresolvable ref. */
export function normalizeLesson(artifacts: RawLessonArtifacts): NormalizedLesson {
  switch (detectGrammar(artifacts.script)) {
    case 'L1_INLINE':
      return normalizeL1(artifacts);
    case 'L2_PROMPTREF':
      return normalizeL2(artifacts);
    case 'L3_PROJECTIONREF':
      return normalizeL3(artifacts);
  }
}
