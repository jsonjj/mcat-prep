import {
  ACTIVITY_ROLES,
  LessonNormalizationError,
  type ActivityRole,
  type BranchExitFunction,
  type CanonicalLessonCompilation,
  type CanonicalServerAnswerKey,
  type CanonicalServerItemAnswer,
  type ExitFunction,
  type LessonGrammar,
  type NormalizedBranchBinding,
  type NormalizedChoice,
  type NormalizedDeliveryStep,
  type NormalizedItem,
  type NormalizedKc,
  type NormalizedLesson,
  type NormalizedProjection,
  type NormalizedResponseControl,
} from './types';

/**
 * Parsed lesson artifacts. All fields are the parsed JSON of the on-disk files;
 * this module performs NO file IO (matching the package convention — the caller
 * reads the files and feeds parsed objects). `learnerSafeItems` / `protectedItems`
 * are required for the L2/L3 grammars. `presentationPlan` is optional so current
 * callers remain compatible; when present, its screen grouping/order/headings are
 * authoritative, otherwise source node order is used without title inference.
 */
export interface RawLessonArtifacts {
  readonly script: unknown;
  readonly learnerSafeItems?: unknown;
  readonly protectedItems?: unknown;
  readonly presentationPlan?: unknown;
}

type Json = Record<string, unknown>;
type Detail = {
  lessonId?: string | undefined;
  itemId?: string | undefined;
  ref?: string | undefined;
  stepId?: string | undefined;
};

function asObject(value: unknown, ctx: string, detail: Detail = {}): Json {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new LessonNormalizationError(`expected an object at ${ctx}`, detail);
  }
  return value as Json;
}
function asArray(value: unknown, ctx: string, detail: Detail = {}): unknown[] {
  if (!Array.isArray(value))
    throw new LessonNormalizationError(`expected an array at ${ctx}`, detail);
  return value;
}
function asString(value: unknown, ctx: string, detail: Detail = {}): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LessonNormalizationError(`expected a non-empty string at ${ctx}`, detail);
  }
  return value;
}
function asStringArray(value: unknown, ctx: string, detail: Detail = {}): string[] {
  return asArray(value, ctx, detail).map((entry, index) =>
    asString(entry, `${ctx}[${index}]`, detail),
  );
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
  throw new LessonNormalizationError(
    'cannot detect lesson grammar: no known learner-safe ref on the first item',
    {},
  );
}

function normalizeExitFunction(raw: unknown, ctx: string, detail: Detail): ExitFunction {
  if (raw === 'NEAR_USE') return 'NEAR_USE';
  if (raw === 'CHANGED_TASK') return 'CHANGED_TASK';
  if (raw === null || raw === undefined || raw === 'NOT_EXIT') return 'NONE';
  throw new LessonNormalizationError(`unknown exit function "${String(raw)}" at ${ctx}`, detail);
}

function normalizeBranchFunction(raw: unknown, ctx: string, detail: Detail): BranchExitFunction {
  if (raw === 'NEAR_USE' || raw === 'NEAR_EXIT') return 'NEAR_USE';
  if (raw === 'CHANGED_TASK' || raw === 'CHANGED_EXIT') return 'CHANGED_TASK';
  throw new LessonNormalizationError(
    `unknown branch failed_function "${String(raw)}" at ${ctx}`,
    detail,
  );
}

function assertRole(raw: unknown, lessonId: string, itemId: string): ActivityRole {
  if (typeof raw === 'string' && (ACTIVITY_ROLES as readonly string[]).includes(raw)) {
    return raw as ActivityRole;
  }
  throw new LessonNormalizationError(`unknown activity_role "${String(raw)}"`, {
    lessonId,
    itemId,
  });
}

function mapObjectChoices(raw: unknown, lessonId: string, itemId: string): NormalizedChoice[] {
  const list = asArray(raw, `${itemId}.learner_safe_projection.choices`, { lessonId });
  const choices = list.map((c, ordinal) => {
    const choice = asObject(c, `${itemId}.choices[${ordinal}]`, { lessonId, itemId });
    return {
      choiceId: typeof choice.id === 'string' && choice.id.length > 0 ? choice.id : String(ordinal),
      ordinal,
      text: asString(choice.text, `${itemId}.choices[${ordinal}].text`, { lessonId, itemId }),
    };
  });
  assertUniqueChoiceIds(choices, lessonId, itemId);
  return choices;
}

function mapStringOptions(raw: unknown, lessonId: string, itemId: string): NormalizedChoice[] {
  if (raw === undefined) return [];
  const choices = asArray(raw, `${itemId}.options`, { lessonId, itemId }).map((text, ordinal) => ({
    choiceId: String(ordinal),
    ordinal,
    text: asString(text, `${itemId}.options[${ordinal}]`, { lessonId, itemId }),
  }));
  assertUniqueChoiceIds(choices, lessonId, itemId);
  return choices;
}

function assertUniqueChoiceIds(
  choices: readonly NormalizedChoice[],
  lessonId: string,
  itemId: string,
): void {
  const ids = new Set<string>();
  for (const choice of choices) {
    if (ids.has(choice.choiceId)) {
      throw new LessonNormalizationError(`duplicate choice_id "${choice.choiceId}"`, {
        lessonId,
        itemId,
      });
    }
    ids.add(choice.choiceId);
  }
}

const PROTECTED_LEARNER_KEYS = new Set([
  'acceptedresponses',
  'answerauthority',
  'answerauthorityref',
  'answerkey',
  'correctanswer',
  'correctchoiceid',
  'correctoptionindex',
  'correctresponse',
  'rationale',
  'rationaleauthorityref',
  'responseauthority',
  'scoringrule',
]);

function assertLearnerSafeFields(value: unknown, ctx: string, detail: Detail): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertLearnerSafeFields(entry, `${ctx}[${index}]`, detail));
    return;
  }
  for (const [key, child] of Object.entries(value as Json)) {
    const canonicalKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROTECTED_LEARNER_KEYS.has(canonicalKey)) {
      throw new LessonNormalizationError(
        `protected field "${key}" is forbidden in learner-safe content at ${ctx}`,
        detail,
      );
    }
    assertLearnerSafeFields(child, `${ctx}.${key}`, detail);
  }
}

function buildResponseControl(
  responseType: string,
  choices: readonly NormalizedChoice[],
  safe: Json,
  lessonId: string,
  itemId: string,
): NormalizedResponseControl | null {
  if (responseType === 'WORKED_EXAMPLE') {
    if (choices.length > 0) {
      throw new LessonNormalizationError('worked exposition cannot author response choices', {
        lessonId,
        itemId,
      });
    }
    return null;
  }
  if (responseType === 'MULTIPLE_CHOICE' || responseType === 'single_select') {
    if (choices.length < 2) {
      throw new LessonNormalizationError(
        `response type "${responseType}" requires at least two options`,
        {
          lessonId,
          itemId,
        },
      );
    }
    if (safe.response_schema !== undefined) {
      throw new LessonNormalizationError(
        `response type "${responseType}" contradicts response_schema`,
        {
          lessonId,
          itemId,
        },
      );
    }
    return { kind: 'SINGLE_SELECT', choices };
  }
  if (responseType === 'SHORT_RESPONSE') {
    if (choices.length !== 0 || safe.response_schema !== undefined) {
      throw new LessonNormalizationError(
        'SHORT_RESPONSE must not carry options or response_schema',
        {
          lessonId,
          itemId,
        },
      );
    }
    return {
      kind: 'SHORT_TEXT',
      inputConvention: {
        normalization: 'TRIM_AND_COLLAPSE_WHITESPACE',
        matching: 'AUTHORED_EQUIVALENTS_ONLY',
        caseSensitive: true,
      },
    };
  }
  if (responseType === 'constructed_system_and_solution') {
    if (choices.length !== 0) {
      throw new LessonNormalizationError('structured response must not carry select options', {
        lessonId,
        itemId,
      });
    }
    const schema = asObject(safe.response_schema, `${itemId}.response_schema`, {
      lessonId,
      itemId,
    });
    const fieldIds = asStringArray(
      schema.required_fields,
      `${itemId}.response_schema.required_fields`,
      {
        lessonId,
        itemId,
      },
    );
    const labels = asStringArray(schema.field_labels, `${itemId}.response_schema.field_labels`, {
      lessonId,
      itemId,
    });
    if (fieldIds.length === 0 || fieldIds.length !== labels.length) {
      throw new LessonNormalizationError(
        'structured response field ids and labels must be non-empty and one-to-one',
        {
          lessonId,
          itemId,
        },
      );
    }
    if (new Set(fieldIds).size !== fieldIds.length) {
      throw new LessonNormalizationError('structured response field ids must be unique', {
        lessonId,
        itemId,
      });
    }
    return {
      kind: 'STRUCTURED_FIELDS',
      fields: fieldIds.map((fieldId, index) => ({
        fieldId,
        label: labels[index] as string,
      })),
    };
  }
  throw new LessonNormalizationError(`unknown response type "${responseType}"`, {
    lessonId,
    itemId,
  });
}

// ---------------------------------------------------------------------------
// L1 — inline projection
// ---------------------------------------------------------------------------
interface ResolvedProjection {
  readonly sourceRef: string;
  readonly projection: NormalizedProjection;
}

function resolveL1Projection(item: Json, lessonId: string, itemId: string): ResolvedProjection {
  const proj = asObject(item.learner_safe_projection, `${itemId}.learner_safe_projection`, {
    lessonId,
    itemId,
  });
  assertLearnerSafeFields(proj, `${itemId}.learner_safe_projection`, { lessonId, itemId });
  const choices = mapObjectChoices(proj.choices, lessonId, itemId);
  return {
    sourceRef: '[inline]',
    projection: {
      prompt: asString(proj.prompt, `${itemId}.learner_safe_projection.prompt`, {
        lessonId,
        itemId,
      }),
      responseType: 'single_select', // L1 inline items are 4-choice MCQ; no response_type field authored
      responseControl: buildResponseControl('single_select', choices, proj, lessonId, itemId),
      choices,
    },
  };
}

// ---------------------------------------------------------------------------
// L2 — two-hop join: prompt_ref -> protected.prompt_ref -> learner_token -> learner-safe
// ---------------------------------------------------------------------------
function buildL2Resolver(artifacts: RawLessonArtifacts, lessonId: string) {
  assertLearnerSafeFields(artifacts.learnerSafeItems, 'learner-safe-items.json', { lessonId });
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
      if (tokenByPromptRef.has(rec.prompt_ref)) {
        throw new LessonNormalizationError(
          `duplicate L2 prompt_ref "${rec.prompt_ref}" in protected-items.json`,
          {
            lessonId,
            ref: rec.prompt_ref,
          },
        );
      }
      tokenByPromptRef.set(rec.prompt_ref, rec.learner_token);
    }
  }
  const safeByToken = new Map<string, Json>();
  for (const s of learnerSafe) {
    const rec = asObject(s, 'learner-safe item', { lessonId });
    if (typeof rec.learner_token === 'string') {
      if (safeByToken.has(rec.learner_token)) {
        throw new LessonNormalizationError(`duplicate L2 learner_token "${rec.learner_token}"`, {
          lessonId,
          ref: rec.learner_token,
        });
      }
      safeByToken.set(rec.learner_token, rec);
    }
  }
  return (item: Json, itemId: string): ResolvedProjection => {
    const ref = asString(item.learner_safe_prompt_ref, `${itemId}.learner_safe_prompt_ref`, {
      lessonId,
      itemId,
    });
    const token = tokenByPromptRef.get(ref);
    if (!token) {
      throw new LessonNormalizationError(
        `L2 prompt_ref "${ref}" not bridged in protected-items.json`,
        { lessonId, itemId, ref },
      );
    }
    const safe = safeByToken.get(token);
    if (!safe) {
      throw new LessonNormalizationError(
        `L2 learner_token "${token}" (from "${ref}") missing in learner-safe-items.json`,
        { lessonId, itemId, ref },
      );
    }
    const responseType = asString(safe.response_type, `learner-safe[${token}].response_type`, {
      lessonId,
      itemId,
    });
    const choices = mapStringOptions(safe.options, lessonId, itemId);
    return {
      sourceRef: ref,
      projection: {
        prompt: asString(safe.prompt, `learner-safe[${token}].prompt`, { lessonId, itemId }),
        responseType,
        responseControl: buildResponseControl(responseType, choices, safe, lessonId, itemId),
        choices,
        title: typeof safe.phase_label === 'string' ? safe.phase_label : undefined,
        directions: typeof safe.directions === 'string' ? safe.directions : undefined,
        accessibilityAlternative:
          typeof safe.accessibility_alternative === 'string'
            ? safe.accessibility_alternative
            : undefined,
      },
    };
  };
}

// ---------------------------------------------------------------------------
// L3 — prompt_key direct, or NODE:<id> -> node content (WORKED_EXAMPLE)
// ---------------------------------------------------------------------------
function buildL3Resolver(artifacts: RawLessonArtifacts, script: unknown, lessonId: string) {
  assertLearnerSafeFields(artifacts.learnerSafeItems, 'learner-safe-items.json', { lessonId });
  const learnerSafe = asArray(
    asObject(artifacts.learnerSafeItems, 'learner-safe-items.json', { lessonId }).items,
    'learner-safe-items.json.items',
    { lessonId },
  );
  const safeByKey = new Map<string, Json>();
  for (const s of learnerSafe) {
    const rec = asObject(s, 'learner-safe item', { lessonId });
    if (typeof rec.prompt_key === 'string') {
      if (safeByKey.has(rec.prompt_key)) {
        throw new LessonNormalizationError(`duplicate L3 prompt_key "${rec.prompt_key}"`, {
          lessonId,
          ref: rec.prompt_key,
        });
      }
      safeByKey.set(rec.prompt_key, rec);
    }
  }
  const nodeById = new Map<string, Json>();
  for (const n of asArray(payloadOf(script, lessonId).nodes, 'payload.nodes', { lessonId })) {
    const node = asObject(n, 'node', { lessonId });
    if (typeof node.node_id === 'string') nodeById.set(node.node_id, node);
  }
  return (item: Json, itemId: string): ResolvedProjection => {
    const ref = asString(
      item.learner_safe_projection_ref,
      `${itemId}.learner_safe_projection_ref`,
      { lessonId, itemId },
    );
    if (ref.startsWith('NODE:')) {
      const nodeId = ref.slice('NODE:'.length);
      const node = nodeById.get(nodeId);
      if (!node) {
        throw new LessonNormalizationError(
          `L3 projection ref node "${nodeId}" not found in payload.nodes`,
          { lessonId, itemId, ref },
        );
      }
      const contentBlocks = learnerContentBlocks(node, `node "${nodeId}"`, {
        lessonId,
        itemId,
        ref,
      });
      if (contentBlocks.length === 0) {
        throw new LessonNormalizationError(
          `L3 projection ref node "${nodeId}" has no learner-safe content`,
          {
            lessonId,
            itemId,
            ref,
          },
        );
      }
      return {
        sourceRef: ref,
        projection: {
          prompt: contentBlocks.join('\n\n'),
          responseType: 'WORKED_EXAMPLE',
          responseControl: null,
          choices: [],
        },
      };
    }
    const safe = safeByKey.get(ref);
    if (!safe) {
      throw new LessonNormalizationError(
        `L3 projection_ref "${ref}" missing in learner-safe-items.json (prompt_key)`,
        { lessonId, itemId, ref },
      );
    }
    const responseType = asString(safe.response_type, `learner-safe[${ref}].response_type`, {
      lessonId,
      itemId,
    });
    const choices = mapStringOptions(safe.options, lessonId, itemId);
    return {
      sourceRef: ref,
      projection: {
        prompt: asString(safe.prompt, `learner-safe[${ref}].prompt`, { lessonId, itemId }),
        responseType,
        responseControl: buildResponseControl(responseType, choices, safe, lessonId, itemId),
        choices,
        title: typeof safe.title === 'string' ? safe.title : undefined,
      },
    };
  };
}

// ---------------------------------------------------------------------------
// Shared assembly
// ---------------------------------------------------------------------------
interface ScriptIndex {
  readonly payload: Json;
  readonly lessonId: string;
  readonly orderedKcIds: readonly string[];
  readonly nodes: readonly Json[];
  readonly nodeById: ReadonlyMap<string, Json>;
  readonly activities: readonly Json[];
  readonly activityById: ReadonlyMap<string, Json>;
  readonly kcScripts: readonly Json[];
  readonly kcScriptByKc: ReadonlyMap<string, Json>;
  readonly qep: readonly Json[];
  readonly qepByItemId: ReadonlyMap<string, Json>;
}

interface BranchMetadata {
  readonly reentryFunctionByItemId: ReadonlyMap<string, BranchExitFunction>;
  readonly repairFunctionByItemId: ReadonlyMap<string, BranchExitFunction>;
  readonly bindingsByKc: ReadonlyMap<string, readonly NormalizedBranchBinding[]>;
}

function learnerContentBlocks(node: Json, ctx: string, detail: Detail): string[] {
  return asArray(node.learner_content_blocks, `${ctx}.learner_content_blocks`, detail).map(
    (block, index) => {
      if (typeof block === 'string')
        return asString(block, `${ctx}.learner_content_blocks[${index}]`, detail);
      const record = asObject(block, `${ctx}.learner_content_blocks[${index}]`, detail);
      return asString(record.text, `${ctx}.learner_content_blocks[${index}].text`, detail);
    },
  );
}

function indexByRequiredId(
  records: readonly Json[],
  field: string,
  ctx: string,
  lessonId: string,
): Map<string, Json> {
  const index = new Map<string, Json>();
  records.forEach((record, ordinal) => {
    const id = asString(record[field], `${ctx}[${ordinal}].${field}`, { lessonId });
    if (index.has(id)) {
      throw new LessonNormalizationError(`duplicate ${field} "${id}"`, { lessonId, ref: id });
    }
    index.set(id, record);
  });
  return index;
}

function assertUniqueStrings(values: readonly string[], ctx: string, lessonId: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new LessonNormalizationError(`duplicate value "${value}" at ${ctx}`, {
        lessonId,
        ref: value,
      });
    }
    seen.add(value);
  }
}

function createScriptIndex(script: unknown): ScriptIndex {
  const payload = payloadOf(script);
  const lessonId = asString(payload.lesson_id, 'payload.lesson_id');
  const orderedKcIds = asStringArray(payload.ordered_kc_ids, 'payload.ordered_kc_ids', {
    lessonId,
  });
  assertUniqueStrings(orderedKcIds, 'payload.ordered_kc_ids', lessonId);

  const nodes = asArray(payload.nodes, 'payload.nodes', { lessonId }).map((node, index) =>
    asObject(node, `payload.nodes[${index}]`, { lessonId }),
  );
  const activities = asArray(payload.activities, 'payload.activities', { lessonId }).map(
    (activity, index) => asObject(activity, `payload.activities[${index}]`, { lessonId }),
  );
  const kcScripts = asArray(payload.kc_scripts, 'payload.kc_scripts', { lessonId }).map(
    (kcScript, index) => asObject(kcScript, `payload.kc_scripts[${index}]`, { lessonId }),
  );
  const qep = asArray(payload.question_evidence_plan, 'payload.question_evidence_plan', {
    lessonId,
  }).map((item, index) => asObject(item, `payload.question_evidence_plan[${index}]`, { lessonId }));

  const nodeById = indexByRequiredId(nodes, 'node_id', 'payload.nodes', lessonId);
  const activityById = indexByRequiredId(activities, 'activity_id', 'payload.activities', lessonId);
  const kcScriptByKc = indexByRequiredId(kcScripts, 'kc_id', 'payload.kc_scripts', lessonId);
  const qepByItemId = indexByRequiredId(
    qep,
    'item_binding_id',
    'payload.question_evidence_plan',
    lessonId,
  );
  const kcSet = new Set(orderedKcIds);

  for (const [nodeId, node] of nodeById) {
    const kcId = asString(node.primary_kc_id, `node "${nodeId}".primary_kc_id`, {
      lessonId,
      ref: nodeId,
    });
    if (!kcSet.has(kcId)) {
      throw new LessonNormalizationError(`node "${nodeId}" references undeclared KC "${kcId}"`, {
        lessonId,
        ref: nodeId,
      });
    }
  }
  for (const [activityId, activity] of activityById) {
    const kcId = asString(activity.primary_kc_id, `activity "${activityId}".primary_kc_id`, {
      lessonId,
      ref: activityId,
    });
    if (!kcSet.has(kcId)) {
      throw new LessonNormalizationError(
        `activity "${activityId}" references undeclared KC "${kcId}"`,
        {
          lessonId,
          ref: activityId,
        },
      );
    }
  }
  for (const kcId of orderedKcIds) {
    if (!kcScriptByKc.has(kcId)) {
      throw new LessonNormalizationError(`ordered KC "${kcId}" has no kc_script`, {
        lessonId,
        ref: kcId,
      });
    }
  }

  const index: ScriptIndex = {
    payload,
    lessonId,
    orderedKcIds,
    nodes,
    nodeById,
    activities,
    activityById,
    kcScripts,
    kcScriptByKc,
    qep,
    qepByItemId,
  };
  validateKcScriptReferences(index);
  return index;
}

function validateKcScriptReferences(index: ScriptIndex): void {
  const { lessonId } = index;
  const assertNode = (value: unknown, ctx: string): void => {
    const ref = asString(value, ctx, { lessonId });
    if (!index.nodeById.has(ref)) {
      throw new LessonNormalizationError(
        `required node reference "${ref}" at ${ctx} does not resolve`,
        {
          lessonId,
          ref,
        },
      );
    }
  };
  const assertNodes = (value: unknown, ctx: string): void => {
    asStringArray(value, ctx, { lessonId }).forEach((ref, ordinal) =>
      assertNode(ref, `${ctx}[${ordinal}]`),
    );
  };
  const assertActivity = (value: unknown, ctx: string): void => {
    const ref = asString(value, ctx, { lessonId });
    if (!index.activityById.has(ref)) {
      throw new LessonNormalizationError(
        `required activity reference "${ref}" at ${ctx} does not resolve`,
        {
          lessonId,
          ref,
        },
      );
    }
  };
  const assertActivities = (value: unknown, ctx: string): void => {
    asStringArray(value, ctx, { lessonId }).forEach((ref, ordinal) =>
      assertActivity(ref, `${ctx}[${ordinal}]`),
    );
  };

  index.kcScripts.forEach((kcScript, scriptOrdinal) => {
    const ctx = `payload.kc_scripts[${scriptOrdinal}]`;
    assertNode(kcScript.entry_check_boundary_id, `${ctx}.entry_check_boundary_id`);
    assertNode(kcScript.orientation_node_id, `${ctx}.orientation_node_id`);
    assertNodes(kcScript.explanation_node_ids, `${ctx}.explanation_node_ids`);
    assertNodes(kcScript.mental_model_node_ids, `${ctx}.mental_model_node_ids`);
    assertNodes(kcScript.expert_think_aloud_node_ids, `${ctx}.expert_think_aloud_node_ids`);
    assertNodes(kcScript.worked_example_node_ids, `${ctx}.worked_example_node_ids`);
    assertActivities(kcScript.guided_activity_ids, `${ctx}.guided_activity_ids`);
    assertActivities(kcScript.light_support_activity_ids, `${ctx}.light_support_activity_ids`);
    assertActivities(kcScript.solo_activity_ids, `${ctx}.solo_activity_ids`);
    assertNodes(kcScript.contrast_boundary_node_ids, `${ctx}.contrast_boundary_node_ids`);
    assertNode(kcScript.recap_node_id, `${ctx}.recap_node_id`);

    for (const field of ['near_exit_binding', 'changed_exit_binding'] as const) {
      const binding = asObject(kcScript[field], `${ctx}.${field}`, { lessonId });
      if (binding.node_id !== undefined) assertNode(binding.node_id, `${ctx}.${field}.node_id`);
    }
    asArray(kcScript.repair_bindings, `${ctx}.repair_bindings`, { lessonId }).forEach(
      (raw, ordinal) => {
        const binding = asObject(raw, `${ctx}.repair_bindings[${ordinal}]`, { lessonId });
        const nodeRef = binding.node_id ?? binding.repair_node_id;
        assertNode(nodeRef, `${ctx}.repair_bindings[${ordinal}].node`);
      },
    );
    asArray(kcScript.exact_reentry_bindings, `${ctx}.exact_reentry_bindings`, { lessonId }).forEach(
      (raw, ordinal) => {
        const binding = asObject(raw, `${ctx}.exact_reentry_bindings[${ordinal}]`, { lessonId });
        const nodeRef = binding.node_id ?? binding.reentry_ref;
        assertNode(nodeRef, `${ctx}.exact_reentry_bindings[${ordinal}].node`);
      },
    );
  });
}

function qepMatches(index: ScriptIndex, field: string, value: string): Json[] {
  return index.qep.filter((item) => item[field] === value);
}

function resolveOneQep(index: ScriptIndex, field: string, value: unknown, ctx: string): Json {
  const ref = asString(value, ctx, { lessonId: index.lessonId });
  const matches =
    field === 'item_binding_id'
      ? index.qepByItemId.has(ref)
        ? [index.qepByItemId.get(ref) as Json]
        : []
      : qepMatches(index, field, ref);
  if (matches.length !== 1) {
    throw new LessonNormalizationError(
      `${ctx} "${ref}" resolved ${matches.length} question_evidence_plan items (expected exactly one)`,
      { lessonId: index.lessonId, ref },
    );
  }
  return matches[0] as Json;
}

function resolveQepThroughNode(index: ScriptIndex, nodeRef: unknown, ctx: string): Json {
  const nodeId = asString(nodeRef, ctx, { lessonId: index.lessonId });
  const node = index.nodeById.get(nodeId);
  if (!node) {
    throw new LessonNormalizationError(`node "${nodeId}" does not resolve`, {
      lessonId: index.lessonId,
      ref: nodeId,
    });
  }
  const activityIds = asStringArray(node.activity_ids, `node "${nodeId}".activity_ids`, {
    lessonId: index.lessonId,
    ref: nodeId,
  });
  const matches = index.qep.filter(
    (item) =>
      (typeof item.activity_id === 'string' && activityIds.includes(item.activity_id)) ||
      item.learner_safe_projection_ref === `NODE:${nodeId}`,
  );
  if (matches.length !== 1) {
    throw new LessonNormalizationError(
      `${ctx} node "${nodeId}" resolved ${matches.length} question_evidence_plan items (expected exactly one)`,
      { lessonId: index.lessonId, ref: nodeId },
    );
  }
  return matches[0] as Json;
}

function resolveExactReentryItem(index: ScriptIndex, binding: Json, ctx: string): Json {
  if (binding.fresh_item_id !== undefined) {
    return resolveOneQep(index, 'item_binding_id', binding.fresh_item_id, `${ctx}.fresh_item_id`);
  }
  if (binding.fresh_confirmation_activity_id !== undefined) {
    return resolveOneQep(
      index,
      'activity_id',
      binding.fresh_confirmation_activity_id,
      `${ctx}.fresh_confirmation_activity_id`,
    );
  }
  if (binding.fresh_confirmation_family_id !== undefined) {
    return resolveOneQep(
      index,
      'semantic_family_id',
      binding.fresh_confirmation_family_id,
      `${ctx}.fresh_confirmation_family_id`,
    );
  }
  const directRef = binding.reentry_ref;
  if (typeof directRef === 'string') {
    for (const field of ['item_binding_id', 'activity_id', 'semantic_family_id']) {
      const matches = qepMatches(index, field, directRef);
      if (matches.length === 1) return matches[0] as Json;
      if (matches.length > 1) {
        throw new LessonNormalizationError(`${ctx}.reentry_ref "${directRef}" is ambiguous`, {
          lessonId: index.lessonId,
          ref: directRef,
        });
      }
    }
  }
  return resolveQepThroughNode(index, binding.node_id ?? binding.reentry_ref, `${ctx}.node`);
}

function resolveRepairItems(index: ScriptIndex, binding: Json, ctx: string): Json[] {
  if (binding.confirmation_activity_ids !== undefined) {
    return asStringArray(binding.confirmation_activity_ids, `${ctx}.confirmation_activity_ids`, {
      lessonId: index.lessonId,
    }).map((activityId, ordinal) =>
      resolveOneQep(
        index,
        'activity_id',
        activityId,
        `${ctx}.confirmation_activity_ids[${ordinal}]`,
      ),
    );
  }
  if (binding.confirmation_activity_id !== undefined) {
    return [
      resolveOneQep(
        index,
        'activity_id',
        binding.confirmation_activity_id,
        `${ctx}.confirmation_activity_id`,
      ),
    ];
  }
  if (binding.confirmation_family_id !== undefined) {
    return [
      resolveOneQep(
        index,
        'semantic_family_id',
        binding.confirmation_family_id,
        `${ctx}.confirmation_family_id`,
      ),
    ];
  }
  return [resolveQepThroughNode(index, binding.node_id ?? binding.repair_node_id, `${ctx}.node`)];
}

function putBranchItem(
  map: Map<string, BranchExitFunction>,
  item: Json,
  fn: BranchExitFunction,
  lessonId: string,
  kind: string,
): string {
  const itemId = asString(item.item_binding_id, `${kind}.item_binding_id`, { lessonId });
  const prior = map.get(itemId);
  if (prior !== undefined && prior !== fn) {
    throw new LessonNormalizationError(
      `${kind} item "${itemId}" is bound to contradictory failed functions`,
      {
        lessonId,
        itemId,
      },
    );
  }
  map.set(itemId, fn);
  return itemId;
}

function compileBranchMetadata(index: ScriptIndex): BranchMetadata {
  const reentryFunctionByItemId = new Map<string, BranchExitFunction>();
  const repairFunctionByItemId = new Map<string, BranchExitFunction>();
  const bindingsByKc = new Map<string, readonly NormalizedBranchBinding[]>();

  for (const kcScript of index.kcScripts) {
    const kcId = asString(kcScript.kc_id, 'kc_script.kc_id', { lessonId: index.lessonId });
    const repairByFunction = new Map<
      BranchExitFunction,
      { readonly raw: Json; readonly items: readonly Json[]; readonly nodeId: string }
    >();
    asArray(kcScript.repair_bindings, `${kcId}.repair_bindings`, {
      lessonId: index.lessonId,
    }).forEach((raw, ordinal) => {
      const ctx = `${kcId}.repair_bindings[${ordinal}]`;
      const binding = asObject(raw, ctx, { lessonId: index.lessonId });
      const failedFunction = normalizeBranchFunction(
        binding.failed_function,
        `${ctx}.failed_function`,
        {
          lessonId: index.lessonId,
        },
      );
      if (repairByFunction.has(failedFunction)) {
        throw new LessonNormalizationError(
          `${kcId} has duplicate repair binding for ${failedFunction}`,
          {
            lessonId: index.lessonId,
            ref: kcId,
          },
        );
      }
      const nodeId = asString(binding.node_id ?? binding.repair_node_id, `${ctx}.node`, {
        lessonId: index.lessonId,
      });
      const items = resolveRepairItems(index, binding, ctx);
      items.forEach((item) =>
        putBranchItem(repairFunctionByItemId, item, failedFunction, index.lessonId, 'repair'),
      );
      repairByFunction.set(failedFunction, { raw: binding, items, nodeId });
    });

    const normalizedBindings: NormalizedBranchBinding[] = [];
    const seenFunctions = new Set<BranchExitFunction>();
    asArray(kcScript.exact_reentry_bindings, `${kcId}.exact_reentry_bindings`, {
      lessonId: index.lessonId,
    }).forEach((raw, ordinal) => {
      const ctx = `${kcId}.exact_reentry_bindings[${ordinal}]`;
      const binding = asObject(raw, ctx, { lessonId: index.lessonId });
      const failedFunction = normalizeBranchFunction(
        binding.failed_function,
        `${ctx}.failed_function`,
        {
          lessonId: index.lessonId,
        },
      );
      if (seenFunctions.has(failedFunction)) {
        throw new LessonNormalizationError(
          `${kcId} has duplicate exact re-entry binding for ${failedFunction}`,
          {
            lessonId: index.lessonId,
            ref: kcId,
          },
        );
      }
      seenFunctions.add(failedFunction);
      const repair = repairByFunction.get(failedFunction);
      if (!repair) {
        throw new LessonNormalizationError(
          `${kcId} exact re-entry ${failedFunction} has no repair binding`,
          {
            lessonId: index.lessonId,
            ref: kcId,
          },
        );
      }
      const reentryItem = resolveExactReentryItem(index, binding, ctx);
      const reentryItemId = putBranchItem(
        reentryFunctionByItemId,
        reentryItem,
        failedFunction,
        index.lessonId,
        're-entry',
      );
      const reentryNodeId = asString(binding.node_id ?? binding.reentry_ref, `${ctx}.node`, {
        lessonId: index.lessonId,
      });
      const successNextNodeId =
        typeof binding.success_next_node_id === 'string'
          ? binding.success_next_node_id
          : typeof binding.required_continuation_node_id === 'string'
            ? binding.required_continuation_node_id
            : null;
      const plannerHandoffNodeId =
        typeof binding.planner_handoff_node_id === 'string'
          ? binding.planner_handoff_node_id
          : null;
      for (const ref of [successNextNodeId, plannerHandoffNodeId]) {
        if (ref !== null && !index.nodeById.has(ref)) {
          throw new LessonNormalizationError(`${ctx} continuation node "${ref}" does not resolve`, {
            lessonId: index.lessonId,
            ref,
          });
        }
      }
      normalizedBindings.push({
        failedFunction,
        repairNodeIds: [repair.nodeId],
        repairItemIds: repair.items.map((item) =>
          asString(item.item_binding_id, `${ctx}.repair.item_binding_id`, {
            lessonId: index.lessonId,
          }),
        ),
        reentryNodeId,
        reentryItemId,
        successNextNodeId,
        plannerHandoffNodeId,
      });
    });
    bindingsByKc.set(kcId, normalizedBindings);
  }
  return { reentryFunctionByItemId, repairFunctionByItemId, bindingsByKc };
}

function buildItem(
  item: Json,
  lessonId: string,
  branches: BranchMetadata,
  resolveProjection: (item: Json, itemId: string) => ResolvedProjection,
): NormalizedItem {
  const itemId = asString(item.item_binding_id, 'item.item_binding_id', { lessonId });
  const activityRole = assertRole(item.activity_role, lessonId, itemId);
  const isReentry = branches.reentryFunctionByItemId.has(itemId);
  const branchFunction =
    branches.reentryFunctionByItemId.get(itemId) ??
    branches.repairFunctionByItemId.get(itemId) ??
    null;
  if (activityRole === 'REPAIR_CONFIRMATION' && branchFunction === null) {
    throw new LessonNormalizationError(
      `repair-confirmation item "${itemId}" is not bound by kc_scripts`,
      {
        lessonId,
        itemId,
      },
    );
  }
  if (item.exact_reentry_for !== null && item.exact_reentry_for !== undefined) {
    const explicit = normalizeBranchFunction(
      item.exact_reentry_for,
      `${itemId}.exact_reentry_for`,
      {
        lessonId,
        itemId,
      },
    );
    if (!isReentry || branchFunction !== explicit) {
      throw new LessonNormalizationError(
        `item "${itemId}" exact_reentry_for contradicts kc_scripts`,
        {
          lessonId,
          itemId,
        },
      );
    }
  }
  const resolved = resolveProjection(item, itemId);
  const scored = activityRole !== 'WORKED_EXAMPLE';
  if (scored && resolved.projection.responseControl === null) {
    throw new LessonNormalizationError(`scored item "${itemId}" has no response control`, {
      lessonId,
      itemId,
    });
  }
  if (!scored && resolved.projection.responseControl !== null) {
    throw new LessonNormalizationError(
      `worked exposition "${itemId}" must not expose a response control`,
      {
        lessonId,
        itemId,
      },
    );
  }
  return {
    itemId,
    sourceRef: resolved.sourceRef,
    activityId:
      typeof item.activity_id === 'string' && item.activity_id.length > 0 ? item.activity_id : null,
    primaryKcId: asString(item.primary_kc_id, `${itemId}.primary_kc_id`, { lessonId, itemId }),
    activityRole,
    // `exitFunction` is reserved for actual exit items (model contract: "exit items
    // only; otherwise NONE"). L3 repair/re-entry items also carry an `exit_function`
    // naming the exit they repair — that flows to `repairsFunction`, not here.
    exitFunction:
      activityRole === 'NEAR_EXIT' || activityRole === 'CHANGED_EXIT'
        ? normalizeExitFunction(
            item.exit_function ?? item.near_or_changed_function,
            `${itemId}.exit_function`,
            {
              lessonId,
              itemId,
            },
          )
        : 'NONE',
    repairsFunction: activityRole === 'REPAIR_CONFIRMATION' ? branchFunction : null,
    isReentry,
    semanticFamilyId: asString(item.semantic_family_id, `${itemId}.semantic_family_id`, {
      lessonId,
      itemId,
    }),
    scored,
    projection: resolved.projection,
  };
}

function itemIdsForNodes(
  index: ScriptIndex,
  items: readonly NormalizedItem[],
  nodeIds: readonly string[],
): string[] {
  const candidateActivityIds = new Set<string>();
  const candidateItemIds = new Set<string>();
  const nodeKinds = new Set<string>();
  for (const nodeId of nodeIds) {
    const node = index.nodeById.get(nodeId) as Json;
    nodeKinds.add(
      asString(node.node_kind, `node "${nodeId}".node_kind`, { lessonId: index.lessonId }),
    );
    const activityIds = asStringArray(node.activity_ids, `node "${nodeId}".activity_ids`, {
      lessonId: index.lessonId,
      ref: nodeId,
    });
    for (const activityId of activityIds) {
      candidateActivityIds.add(activityId);
      const activity = index.activityById.get(activityId);
      if (activity && typeof activity.item_binding_id === 'string') {
        candidateItemIds.add(activity.item_binding_id);
      }
    }
  }
  return items
    .filter((item) => {
      const linked =
        (item.activityId !== null && candidateActivityIds.has(item.activityId)) ||
        candidateItemIds.has(item.itemId) ||
        nodeIds.some((nodeId) => item.sourceRef === `NODE:${nodeId}`);
      if (!linked) return false;
      if (nodeKinds.has('EXACT_REENTRY')) return item.isReentry;
      if (nodeKinds.has('NEAR_EXIT') || nodeKinds.has('CHANGED_EXIT')) return !item.isReentry;
      return true;
    })
    .map((item) => item.itemId);
}

function compileDeliverySteps(
  artifacts: RawLessonArtifacts,
  index: ScriptIndex,
  items: readonly NormalizedItem[],
  branches: BranchMetadata,
): Map<string, readonly NormalizedDeliveryStep[]> {
  const branchNodeIds = new Set<string>();
  for (const bindings of branches.bindingsByKc.values()) {
    for (const binding of bindings) {
      binding.repairNodeIds.forEach((nodeId) => branchNodeIds.add(nodeId));
      branchNodeIds.add(binding.reentryNodeId);
      if (binding.plannerHandoffNodeId !== null) branchNodeIds.add(binding.plannerHandoffNodeId);
    }
  }

  type StepSource = {
    readonly stepId: string;
    readonly stage: string;
    readonly heading: string | null;
    readonly nodeIds: readonly string[];
  };
  const sourceByKc = new Map<string, StepSource[]>();
  index.orderedKcIds.forEach((kcId) => sourceByKc.set(kcId, []));

  if (artifacts.presentationPlan !== undefined) {
    const presentationPayload = asObject(
      asObject(artifacts.presentationPlan, 'lesson-presentation-plan.json', {
        lessonId: index.lessonId,
      }).payload,
      'lesson-presentation-plan.json.payload',
      { lessonId: index.lessonId },
    );
    const seenSteps = new Set<string>();
    const seenNodes = new Set<string>();
    asArray(presentationPayload.screens, 'lesson-presentation-plan.json.payload.screens', {
      lessonId: index.lessonId,
    }).forEach((raw, ordinal) => {
      const screen = asObject(raw, `presentation.screens[${ordinal}]`, {
        lessonId: index.lessonId,
      });
      const stepId = asString(screen.screen_id, `presentation.screens[${ordinal}].screen_id`, {
        lessonId: index.lessonId,
      });
      if (seenSteps.has(stepId)) {
        throw new LessonNormalizationError(`duplicate delivery step id "${stepId}"`, {
          lessonId: index.lessonId,
          stepId,
        });
      }
      seenSteps.add(stepId);
      const nodeIds = asStringArray(screen.script_node_ids, `${stepId}.script_node_ids`, {
        lessonId: index.lessonId,
        stepId,
      });
      if (nodeIds.length === 0) {
        throw new LessonNormalizationError(`delivery step "${stepId}" has no script nodes`, {
          lessonId: index.lessonId,
          stepId,
        });
      }
      const kcIds = new Set<string>();
      for (const nodeId of nodeIds) {
        const node = index.nodeById.get(nodeId);
        if (!node) {
          throw new LessonNormalizationError(
            `delivery step "${stepId}" references missing node "${nodeId}"`,
            {
              lessonId: index.lessonId,
              stepId,
              ref: nodeId,
            },
          );
        }
        if (seenNodes.has(nodeId)) {
          throw new LessonNormalizationError(
            `script node "${nodeId}" appears in more than one delivery step`,
            {
              lessonId: index.lessonId,
              stepId,
              ref: nodeId,
            },
          );
        }
        seenNodes.add(nodeId);
        kcIds.add(
          asString(node.primary_kc_id, `node "${nodeId}".primary_kc_id`, {
            lessonId: index.lessonId,
          }),
        );
      }
      if (kcIds.size !== 1) {
        throw new LessonNormalizationError(`delivery step "${stepId}" mixes knowledge components`, {
          lessonId: index.lessonId,
          stepId,
        });
      }
      const kcId = [...kcIds][0] as string;
      sourceByKc.get(kcId)?.push({
        stepId,
        stage: asString(screen.screen_kind, `${stepId}.screen_kind`, {
          lessonId: index.lessonId,
          stepId,
        }),
        heading: typeof screen.learner_heading === 'string' ? screen.learner_heading : null,
        nodeIds,
      });
    });
    for (const [nodeId, node] of index.nodeById) {
      const kcId = asString(node.primary_kc_id, `node "${nodeId}".primary_kc_id`, {
        lessonId: index.lessonId,
      });
      if (index.orderedKcIds.includes(kcId) && !seenNodes.has(nodeId)) {
        throw new LessonNormalizationError(`presentation plan omits authored node "${nodeId}"`, {
          lessonId: index.lessonId,
          ref: nodeId,
        });
      }
    }
  } else {
    for (const [nodeId, node] of index.nodeById) {
      const kcId = asString(node.primary_kc_id, `node "${nodeId}".primary_kc_id`, {
        lessonId: index.lessonId,
      });
      sourceByKc.get(kcId)?.push({
        stepId: nodeId,
        stage: asString(node.node_kind, `node "${nodeId}".node_kind`, { lessonId: index.lessonId }),
        heading: null,
        nodeIds: [nodeId],
      });
    }
  }

  const out = new Map<string, readonly NormalizedDeliveryStep[]>();
  for (const kcId of index.orderedKcIds) {
    const kcItems = items.filter((item) => item.primaryKcId === kcId);
    const steps = (sourceByKc.get(kcId) ?? []).map((source, ordinal): NormalizedDeliveryStep => {
      const nodes = source.nodeIds.map((nodeId) => index.nodeById.get(nodeId) as Json);
      const nodeKinds = nodes.map((node, nodeOrdinal) =>
        asString(node.node_kind, `${source.stepId}.nodes[${nodeOrdinal}].node_kind`, {
          lessonId: index.lessonId,
          stepId: source.stepId,
        }),
      );
      return {
        stepId: source.stepId,
        canonicalOrdinal: ordinal + 1,
        primaryKcId: kcId,
        stage: source.stage,
        heading: source.heading,
        nodeIds: source.nodeIds,
        contentBlocks: nodes.flatMap((node, nodeOrdinal) =>
          learnerContentBlocks(node, `${source.stepId}.nodes[${nodeOrdinal}]`, {
            lessonId: index.lessonId,
            stepId: source.stepId,
          }),
        ),
        itemIds: itemIdsForNodes(index, kcItems, source.nodeIds),
        branchOnly:
          source.nodeIds.every((nodeId) => branchNodeIds.has(nodeId)) ||
          nodeKinds.every((kind) => kind === 'TARGETED_REPAIR' || kind === 'EXACT_REENTRY'),
      };
    });
    const linked = steps.flatMap((step) => step.itemIds);
    const duplicateLinks = [
      ...new Set(linked.filter((itemId, ordinal) => linked.indexOf(itemId) !== ordinal)),
    ];
    if (duplicateLinks.length > 0) {
      throw new LessonNormalizationError(
        `items linked by more than one delivery step: ${duplicateLinks.join(', ')}`,
        {
          lessonId: index.lessonId,
          itemId: duplicateLinks[0],
        },
      );
    }
    const missing = kcItems.map((item) => item.itemId).filter((itemId) => !linked.includes(itemId));
    if (missing.length > 0) {
      throw new LessonNormalizationError(
        `items missing node → activity → QEP delivery links: ${missing.join(', ')}`,
        {
          lessonId: index.lessonId,
          itemId: missing[0],
        },
      );
    }
    out.set(kcId, steps);
  }
  return out;
}

function assemble(
  artifacts: RawLessonArtifacts,
  grammar: LessonGrammar,
  resolveProjection: (item: Json, itemId: string) => ResolvedProjection,
): NormalizedLesson {
  const scriptObj = asObject(artifacts.script, 'script');
  const index = createScriptIndex(artifacts.script);
  const { lessonId, orderedKcIds } = index;
  const branches = compileBranchMetadata(index);
  const items = index.qep.map((item) => buildItem(item, lessonId, branches, resolveProjection));
  const kcSet = new Set(index.orderedKcIds);
  for (const it of items) {
    if (!kcSet.has(it.primaryKcId)) {
      throw new LessonNormalizationError(
        `item "${it.itemId}" references KC "${it.primaryKcId}" not in ordered_kc_ids`,
        {
          lessonId,
          itemId: it.itemId,
        },
      );
    }
  }
  const deliveryByKc = compileDeliverySteps(artifacts, index, items, branches);
  const kcs: NormalizedKc[] = orderedKcIds.map((kcId, ordinal) => {
    const kcItems = items.filter((item) => item.primaryKcId === kcId);
    const deliverySteps = deliveryByKc.get(kcId) ?? [];
    const cleanBaselineItemIds = kcItems
      .filter((item) => item.activityRole !== 'REPAIR_CONFIRMATION' && !item.isReentry)
      .map((item) => item.itemId);
    const cleanBaselineSet = new Set(cleanBaselineItemIds);
    const cleanBaselineSteps = deliverySteps.filter(
      (step) => !step.branchOnly && step.itemIds.every((itemId) => cleanBaselineSet.has(itemId)),
    );
    return {
      kcId,
      canonicalOrdinal: ordinal + 1,
      items: kcItems,
      deliverySteps,
      cleanBaselineSteps,
      cleanBaselineItemIds,
      branchBindings: branches.bindingsByKc.get(kcId) ?? [],
    };
  });
  const definitionHash =
    typeof scriptObj.content_sha256 === 'string' ? scriptObj.content_sha256 : '';
  return {
    lessonId,
    groupingId: String(index.payload.grouping_id ?? ''),
    grammar,
    orderedKcIds,
    definitionHash,
    kcs,
    items,
  };
}

// ---------------------------------------------------------------------------
// Public adapters + dispatcher
// ---------------------------------------------------------------------------
export function normalizeL1(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(artifacts, 'L1_INLINE', (item, itemId) =>
    resolveL1Projection(item, lessonId, itemId),
  );
}
export function normalizeL2(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(artifacts, 'L2_PROMPTREF', buildL2Resolver(artifacts, lessonId));
}
export function normalizeL3(artifacts: RawLessonArtifacts): NormalizedLesson {
  const lessonId = asString(payloadOf(artifacts.script).lesson_id, 'payload.lesson_id');
  return assemble(
    artifacts,
    'L3_PROJECTIONREF',
    buildL3Resolver(artifacts, artifacts.script, lessonId),
  );
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

function protectedRecords(value: unknown, key: 'items' | 'records', lessonId: string): Json[] {
  return asArray(
    asObject(value, 'protected-items.json', { lessonId })[key],
    `protected-items.json.${key}`,
    {
      lessonId,
    },
  ).map((record, ordinal) =>
    asObject(record, `protected-items.json.${key}[${ordinal}]`, {
      lessonId,
    }),
  );
}

function uniqueProtectedIndex(
  records: readonly Json[],
  keyOf: (record: Json) => string | null,
  lessonId: string,
): Map<string, Json> {
  const index = new Map<string, Json>();
  for (const record of records) {
    const key = keyOf(record);
    if (key === null) continue;
    if (index.has(key)) {
      throw new LessonNormalizationError(`duplicate protected answer record "${key}"`, {
        lessonId,
        itemId: key,
      });
    }
    index.set(key, record);
  }
  return index;
}

function l2ServerAnswer(
  item: NormalizedItem,
  record: Json,
  lessonId: string,
): CanonicalServerItemAnswer {
  const authoredAccepted = Array.isArray(record.accepted_responses)
    ? record.accepted_responses.map((value, ordinal) =>
        asString(value, `${item.itemId}.accepted_responses[${ordinal}]`, {
          lessonId,
          itemId: item.itemId,
        }),
      )
    : [];
  const correct =
    typeof record.correct_response === 'string' && record.correct_response.length > 0
      ? [record.correct_response]
      : [];
  const acceptedResponses = [...new Set([...correct, ...authoredAccepted])];
  if (acceptedResponses.length === 0) {
    throw new LessonNormalizationError(
      `protected answer for "${item.itemId}" has no accepted response`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  const control = item.projection.responseControl;
  if (control === null) {
    throw new LessonNormalizationError(`scored item "${item.itemId}" has no response control`, {
      lessonId,
      itemId: item.itemId,
    });
  }
  let correctChoiceId: string | null = null;
  let normalizedAccepted = acceptedResponses;
  if (control.kind === 'SINGLE_SELECT') {
    const accepted = new Set(acceptedResponses);
    const choice = control.choices.find((candidate) => accepted.has(candidate.text));
    if (!choice) {
      throw new LessonNormalizationError(
        `protected answer for "${item.itemId}" matches no learner choice`,
        {
          lessonId,
          itemId: item.itemId,
        },
      );
    }
    correctChoiceId = choice.choiceId;
    normalizedAccepted = [choice.text];
  }
  return {
    itemId: item.itemId,
    primaryKcId: item.primaryKcId,
    responseType: item.projection.responseType,
    correctChoiceId,
    acceptedResponses: normalizedAccepted,
    rationale:
      typeof record.rationale === 'string'
        ? record.rationale
        : typeof record.post_commitment_feedback === 'string'
          ? record.post_commitment_feedback
          : null,
  };
}

function stringsFromUnknownArray(
  value: unknown,
  ctx: string,
  lessonId: string,
  itemId: string,
): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, ordinal) => asString(entry, `${ctx}[${ordinal}]`, { lessonId, itemId }));
}

function l3ServerAnswer(
  item: NormalizedItem,
  record: Json,
  lessonId: string,
): CanonicalServerItemAnswer {
  const control = item.projection.responseControl;
  if (control === null) {
    throw new LessonNormalizationError(`scored item "${item.itemId}" has no response control`, {
      lessonId,
      itemId: item.itemId,
    });
  }
  const base = {
    itemId: item.itemId,
    primaryKcId: item.primaryKcId,
    responseType: item.projection.responseType,
    rationale: typeof record.rationale === 'string' ? record.rationale : null,
  };
  if (control.kind === 'SINGLE_SELECT') {
    if (
      typeof record.correct_option_index !== 'number' ||
      !Number.isInteger(record.correct_option_index)
    ) {
      throw new LessonNormalizationError(
        `protected answer for "${item.itemId}" needs an integer correct_option_index`,
        {
          lessonId,
          itemId: item.itemId,
        },
      );
    }
    const choice = control.choices.find(
      (candidate) => candidate.ordinal === record.correct_option_index,
    );
    if (!choice) {
      throw new LessonNormalizationError(
        `protected correct_option_index for "${item.itemId}" is outside its learner choices`,
        { lessonId, itemId: item.itemId },
      );
    }
    return {
      ...base,
      correctChoiceId: choice.choiceId,
      acceptedResponses: [choice.text],
    };
  }
  if (control.kind === 'SHORT_TEXT') {
    const acceptedResponses = [
      ...(typeof record.correct_response === 'string' ? [record.correct_response] : []),
      ...stringsFromUnknownArray(
        record.accepted_responses,
        `${item.itemId}.accepted_responses`,
        lessonId,
        item.itemId,
      ),
    ];
    if (acceptedResponses.length === 0) {
      throw new LessonNormalizationError(
        `protected short-text answer for "${item.itemId}" is empty`,
        {
          lessonId,
          itemId: item.itemId,
        },
      );
    }
    return { ...base, correctChoiceId: null, acceptedResponses: [...new Set(acceptedResponses)] };
  }
  const authority = asObject(record.response_authority, `${item.itemId}.response_authority`, {
    lessonId,
    itemId: item.itemId,
  });
  const requiredFields = asStringArray(
    authority.required_fields,
    `${item.itemId}.response_authority.required_fields`,
    {
      lessonId,
      itemId: item.itemId,
    },
  );
  const projectedFields = control.fields.map((field) => field.fieldId);
  if (
    requiredFields.length !== projectedFields.length ||
    requiredFields.some((field, index) => field !== projectedFields[index])
  ) {
    throw new LessonNormalizationError(
      `protected structured fields for "${item.itemId}" contradict learner-safe fields`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  const acceptedResponses = [
    ...stringsFromUnknownArray(
      authority.expected_equation_forms,
      `${item.itemId}.response_authority.expected_equation_forms`,
      lessonId,
      item.itemId,
    ),
    ...stringsFromUnknownArray(
      authority.expected_solution_pair,
      `${item.itemId}.response_authority.expected_solution_pair`,
      lessonId,
      item.itemId,
    ),
  ];
  if (acceptedResponses.length === 0) {
    throw new LessonNormalizationError(
      `protected structured answer for "${item.itemId}" has no expected values`,
      {
        lessonId,
        itemId: item.itemId,
      },
    );
  }
  return {
    ...base,
    correctChoiceId: null,
    acceptedResponses,
    structuredAuthority: authority,
  };
}

/**
 * Compile the shared canonical grammars into strictly separated learner and
 * server projections. L1 intentionally stays on its bespoke vector authority.
 */
export function compileCanonicalLesson(artifacts: RawLessonArtifacts): CanonicalLessonCompilation {
  const lesson = normalizeLesson(artifacts);
  if (lesson.grammar === 'L1_INLINE') {
    throw new LessonNormalizationError(
      'L1_INLINE uses the isolated bespoke vector answer authority and is not a canonical compiler input',
      { lessonId: lesson.lessonId },
    );
  }
  const byItemId: Record<string, CanonicalServerItemAnswer> = {};
  if (lesson.grammar === 'L2_PROMPTREF') {
    const index = uniqueProtectedIndex(
      protectedRecords(artifacts.protectedItems, 'items', lesson.lessonId),
      (record) =>
        typeof record.internal_item_binding_id === 'string'
          ? record.internal_item_binding_id
          : typeof record.prompt_ref === 'string'
            ? record.prompt_ref
            : null,
      lesson.lessonId,
    );
    for (const item of lesson.items.filter((candidate) => candidate.scored)) {
      const record = index.get(item.itemId);
      if (!record) {
        throw new LessonNormalizationError(
          `scored item "${item.itemId}" has no protected answer record`,
          {
            lessonId: lesson.lessonId,
            itemId: item.itemId,
          },
        );
      }
      byItemId[item.itemId] = l2ServerAnswer(item, record, lesson.lessonId);
    }
  } else {
    const index = uniqueProtectedIndex(
      protectedRecords(artifacts.protectedItems, 'records', lesson.lessonId),
      (record) => (typeof record.answer_record_id === 'string' ? record.answer_record_id : null),
      lesson.lessonId,
    );
    for (const item of lesson.items.filter((candidate) => candidate.scored)) {
      const record = index.get(item.itemId);
      if (!record) {
        throw new LessonNormalizationError(
          `scored item "${item.itemId}" has no protected answer record`,
          {
            lessonId: lesson.lessonId,
            itemId: item.itemId,
          },
        );
      }
      byItemId[item.itemId] = l3ServerAnswer(item, record, lesson.lessonId);
    }
  }
  const answerKey: CanonicalServerAnswerKey = {
    lessonId: lesson.lessonId,
    definitionHash: lesson.definitionHash,
    byItemId,
  };
  return { lesson, answerKey };
}
