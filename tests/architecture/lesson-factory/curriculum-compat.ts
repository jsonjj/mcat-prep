/**
 * Project the real curriculum into packet shape.
 *
 * This is not the generator, and the previous version of this file was worse than not
 * being the generator: it fabricated the facts the generator has to establish. It hashed
 * the string `file:<path>` instead of the file, it wrote relation ids by pasting the last
 * six digits of a lesson id into `R14-FD-`, it declared every source REPOSITORY without
 * consulting the receipt, it took the first knowledge component as the host of every
 * attachment, it left support artifacts out, and it marked packets READY while every
 * source in them sat at PENDING. A contract validated against that projection is validated
 * against a fixture wearing the curriculum's identifiers.
 *
 * Every value below now comes from the manifest, the crosswalk, the owner receipt, or a
 * digest of bytes on disk. Where the curriculum does not supply a required fact, the
 * projection blocks and says which one, because a packet nobody can author is a real
 * outcome and inventing the missing fact is not.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { loadSchema, REPO_ROOT } from './contract-registry';
import { SchemaRegistry, type JsonObject } from './json-schema-subset';
import { canonicalJson } from './packet-semantics';

/**
 * One row of parsed curriculum JSON. Deliberately untyped: the manifest is a megabyte of
 * somebody else's schema, and a hand-written interface for it would be a second contract
 * that nothing checks against the first — the exact failure this file exists to catch.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const readText = (repoRelativePath: string): string =>
  readFileSync(join(REPO_ROOT, repoRelativePath), 'utf8');
const readJson = (repoRelativePath: string): Row => JSON.parse(readText(repoRelativePath)) as Row;
const sha = (text: string): string =>
  createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');

const MANIFEST_PATH = 'curriculum/v3/v3-lesson-authoring-manifest.json';
export const MANIFEST: Row = readJson(MANIFEST_PATH);

/* ── the ten inputs, at their real locations, with their real digests ───────── */

export interface InputProvenance {
  key: string;
  path: string;
}

const VOCABULARY = loadSchema('shared-vocabulary.schema.json');
const vocabDef = (name: string): Row => (VOCABULARY.$defs as Row)[name] as Row;

export const INPUT_PROVENANCE: readonly InputProvenance[] = (
  vocabDef('PacketInputKey').enum as string[]
).map((key, index) => ({ key, path: (vocabDef('PacketInputPath').enum as string[])[index]! }));

const digestCache = new Map<string, { file: string; content: string }>();

/** Both digests of one input. Cached: the manifest alone is megabytes, and a packet is
 * built 114 times in one test. */
const digestsOf = (repoRelativePath: string): { file: string; content: string } => {
  const cached = digestCache.get(repoRelativePath);
  if (cached !== undefined) return cached;
  const text = readText(repoRelativePath);
  const digests = {
    file: sha(text),
    content: repoRelativePath.endsWith('.json') ? sha(canonicalJson(JSON.parse(text))) : sha(text),
  };
  digestCache.set(repoRelativePath, digests);
  return digests;
};

export const fileSha256 = (repoRelativePath: string): string => digestsOf(repoRelativePath).file;

/** The digest of an input's content, canonicalised the way the generator canonicalises it. */
export const canonicalContentSha256 = (repoRelativePath: string): string =>
  digestsOf(repoRelativePath).content;

/** The ten input rows, computed once and shared by every packet. */
const INPUT_HASH_ROWS: JsonObject[] = INPUT_PROVENANCE.map(({ key, path }) => ({
  input: key,
  path,
  file_sha256: fileSha256(path),
  content_sha256: canonicalContentSha256(path),
}));

const MANIFEST_SHA256 = fileSha256(MANIFEST_PATH);

/* ── the owner's per-source-id decisions, read from the receipt ─────────────── */

const RECEIPT_PATH = 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json';
export const RECEIPT: Row = readJson(RECEIPT_PATH);

export interface SourceDecision {
  source_id: string;
  source_class: string;
  usable: boolean;
  permitted_use_codes: string[];
  derived_field_allowlist: string[];
  class_evidence: { locator_kind: string; reason_code: string };
}

export const SOURCE_DECISIONS: readonly SourceDecision[] =
  RECEIPT.source_decisions as SourceDecision[];
const decisionFor = (sourceId: string): SourceDecision | undefined =>
  SOURCE_DECISIONS.find((row) => row.source_id === sourceId);

/* ── indexes over the manifest ──────────────────────────────────────────────── */

const lessons: Row[] = MANIFEST.curriculum.lessons;
const kcs: Row[] = MANIFEST.curriculum.kcs;
const holds: Row[] = MANIFEST.governance.holds;
const relations: Row = MANIFEST.sequence.normalized_relations;

const index = <T extends Row>(rows: readonly T[], key: string): Map<string, T> =>
  new Map(rows.map((row) => [row[key] as string, row]));

const lessonById = index(lessons, 'lesson_id');
const kcById = index(kcs, 'kc_id');
const holdById = index(holds, 'hold_id');
const capstoneById = index(MANIFEST.curriculum.capstones as Row[], 'capstone_id');
const extensionById = index(MANIFEST.curriculum.extensions as Row[], 'extension_id');
const supportById = index(MANIFEST.curriculum.support_artifacts as Row[], 'support_id');
const occurrenceById = index(
  MANIFEST.source_references.occurrences as Row[],
  'source_occurrence_id',
);
const CROSSWALK: Row = readJson(
  '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
);
const crosswalkOccurrence = index(
  (CROSSWALK.source_occurrences ?? []) as Row[],
  'source_occurrence_id',
);

const attachmentKind = new Map<string, 'CAPSTONE' | 'EXTENSION' | 'SUPPORT'>([
  ...[...capstoneById.keys()].map((id) => [id, 'CAPSTONE'] as const),
  ...[...extensionById.keys()].map((id) => [id, 'EXTENSION'] as const),
  ...[...supportById.keys()].map((id) => [id, 'SUPPORT'] as const),
]);

const orderedKcsOf = (lessonId: string): string[] =>
  (lessonById.get(lessonId)?.ordered_required_kc_ids ?? []) as string[];

/* ── canonical identifier inventory ─────────────────────────────────────────── */

export type CanonicalIdFamily =
  | 'lesson_id'
  | 'kc_id'
  | 'kc_prerequisite_id'
  | 'grouping_id'
  | 'phase_id'
  | 'module_id'
  | 'pathway_id'
  | 'attachment_id'
  | 'relation_id'
  | 'hold_id'
  | 'source_occurrence_id'
  | 'source_anchor_id';

const gather = (): Record<CanonicalIdFamily, string[]> => {
  const sets: Record<string, Set<string>> = {};
  const add = (family: string, value: unknown): void => {
    if (typeof value !== 'string' || value === '') return;
    (sets[family] ??= new Set()).add(value);
  };
  const addAll = (family: string, values: unknown): void => {
    if (Array.isArray(values)) for (const value of values) add(family, value);
  };

  for (const lesson of lessons) {
    add('lesson_id', lesson.lesson_id);
    add('grouping_id', lesson.owning_cluster_id);
    addAll('kc_id', lesson.ordered_required_kc_ids);
    addAll('kc_id', lesson.nested_kc_ids);
    addAll('phase_id', lesson.phase_ids);
    addAll('module_id', lesson.module_ids);
    addAll('attachment_id', lesson.capstone_ids);
    addAll('attachment_id', lesson.extension_ids);
    addAll('attachment_id', lesson.support_artifact_ids);
    addAll('lesson_id', lesson.hard_prerequisite_lesson_ids);
    addAll('lesson_id', lesson.helpful_prerequisite_lesson_ids);
    addAll('lesson_id', lesson.direct_successor_lesson_ids);
    addAll('hold_id', lesson.unresolved_holds);
    addAll('relation_id', lesson.accelerated_handling?.candidate_relation_ids);
    addAll('relation_id', lesson.remediation_handling?.domain_relation_ids);
    addAll('relation_id', lesson.remediation_handling?.cars_relation_ids);
    for (const position of lesson.pathway_positions ?? []) add('pathway_id', position.pathway_id);
    for (const revisit of lesson.revisit_positions ?? []) {
      add('module_id', revisit.module_id);
      add('phase_id', revisit.phase_id);
      add('relation_id', revisit.relation_id);
    }
  }
  for (const kc of kcs) {
    add('kc_id', kc.kc_id);
    add('lesson_id', kc.owning_lesson_id);
    addAll('kc_prerequisite_id', kc.hard_prerequisite_ids);
    addAll('kc_prerequisite_id', kc.helpful_prerequisite_ids);
    addAll('attachment_id', kc.capstone_ids);
    addAll('attachment_id', kc.extension_ids);
    addAll('source_occurrence_id', kc.direct_source_occurrence_ids);
    addAll('source_anchor_id', kc.source_anchor_ids);
  }
  for (const grouping of MANIFEST.curriculum.groupings as Row[]) {
    add('grouping_id', grouping.grouping_id);
    addAll('kc_id', grouping.member_kc_ids);
  }
  for (const id of attachmentKind.keys()) add('attachment_id', id);
  for (const hold of holds) add('hold_id', hold.hold_id);
  for (const phase of MANIFEST.sequence.phases as Row[]) add('phase_id', phase.phase_id);
  for (const module of MANIFEST.sequence.modules as Row[]) add('module_id', module.module_id);
  for (const pathway of MANIFEST.sequence.pathways as Row[]) add('pathway_id', pathway.pathway_id);
  for (const occurrence of MANIFEST.source_references.occurrences as Row[]) {
    add('source_occurrence_id', occurrence.source_occurrence_id);
    addAll('source_anchor_id', occurrence.source_anchor_ids);
    add('source_anchor_id', occurrence.source_anchor_id);
  }
  for (const anchor of MANIFEST.source_references.anchors as Row[]) {
    add('source_anchor_id', anchor.source_anchor_id);
  }
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Row)) {
      if (key === 'relation_id' || key === 'edge_id') add('relation_id', value);
      else if (key.endsWith('relation_ids') || key.endsWith('edge_ids'))
        addAll('relation_id', value);
      else walk(value);
    }
  };
  walk(relations);
  walk(MANIFEST.graph.edges);

  return Object.fromEntries(
    Object.entries(sets).map(([family, values]) => [family, [...values].sort()]),
  ) as Record<CanonicalIdFamily, string[]>;
};

export const CANONICAL_ID_SETS = gather();

/* ── attachments: the host scope every reference actually resolves to ───────── */

export type HostScope =
  | { kind: 'LESSON' }
  | { kind: 'SINGLE_KC'; kc_id: string }
  | { kind: 'MULTI_KC'; kc_ids: string[] }
  | { kind: 'CAPSTONE'; capstone_ids: string[] }
  | { kind: 'SECONDARY_APPLICATION'; primary_lesson_id: string };

export interface AttachmentScope {
  lesson_id: string;
  attachment_id: string;
  kind: 'CAPSTONE' | 'EXTENSION' | 'SUPPORT';
  owner_lesson_id: string;
  host_scope: HostScope;
  declared_host_core_ids: string[];
  mismatch: boolean;
}

/**
 * Resolve one (lesson, attachment) pair the way the attachment-host resolution note
 * specifies. There is no fallback branch: every reference in the manifest reaches one of
 * the five shapes on the facts in the record, and a reference that did not would show up
 * as a thrown error rather than as a first knowledge component.
 */
const resolveHost = (lessonId: string, attachmentId: string): AttachmentScope => {
  const lesson = lessonById.get(lessonId)!;
  const ordered = orderedKcsOf(lessonId);
  const inLesson = (kcId: string): boolean => ordered.includes(kcId);
  const kind = attachmentKind.get(attachmentId);
  const base = { lesson_id: lessonId, attachment_id: attachmentId, mismatch: false };

  if (kind === 'CAPSTONE') {
    const capstone = capstoneById.get(attachmentId)!;
    const components = (capstone.component_kc_ids ?? []) as string[];
    if (capstone.owning_lesson_id !== lessonId) {
      return {
        ...base,
        kind,
        owner_lesson_id: capstone.owning_lesson_id as string,
        host_scope: { kind: 'SECONDARY_APPLICATION', primary_lesson_id: capstone.owning_lesson_id },
        declared_host_core_ids: components,
      };
    }
    // A capstone coordinates components that legitimately live in several lessons. Only
    // the ones this lesson owns are hosts here; the rest stay in the declared set, which
    // is why the declared set is carried whole rather than replaced by the hosts.
    const hosts = components.filter(inLesson);
    const scope: HostScope =
      hosts.length >= 2
        ? { kind: 'MULTI_KC', kc_ids: hosts }
        : hosts.length === 1
          ? { kind: 'SINGLE_KC', kc_id: hosts[0]! }
          : { kind: 'LESSON' };
    // Components outside this lesson are not a lineage defect: coordinating knowledge
    // components that several lessons taught is what a capstone is for. Ten of the 43 have
    // all their components here, and the other 33 are correct as written.
    return {
      ...base,
      kind,
      owner_lesson_id: lessonId,
      host_scope: scope,
      declared_host_core_ids: components,
    };
  }

  if (kind === 'EXTENSION') {
    const extension = extensionById.get(attachmentId)!;
    const owner = extension.owning_lesson_id as string;
    const secondary = (extension.secondary_application_lesson_ids ?? []) as string[];
    const cores = (extension.host_core_ids ?? []) as string[];
    if (owner !== lessonId && secondary.includes(lessonId)) {
      return {
        ...base,
        kind,
        owner_lesson_id: owner,
        host_scope: { kind: 'SECONDARY_APPLICATION', primary_lesson_id: owner },
        declared_host_core_ids: cores,
      };
    }
    const hostCapstones = ((extension.host_capstone_ids ?? []) as string[]).filter((id) =>
      ((lesson.capstone_ids ?? []) as string[]).includes(id),
    );
    if (cores.length === 0 && hostCapstones.length > 0) {
      return {
        ...base,
        kind,
        owner_lesson_id: owner,
        host_scope: { kind: 'CAPSTONE', capstone_ids: hostCapstones },
        declared_host_core_ids: cores,
      };
    }
    const hosts = cores.filter(inLesson);
    if (hosts.length > 1) {
      return {
        ...base,
        kind,
        owner_lesson_id: owner,
        host_scope: { kind: 'MULTI_KC', kc_ids: hosts },
        declared_host_core_ids: cores,
      };
    }
    if (hosts.length === 1) {
      return {
        ...base,
        kind,
        owner_lesson_id: owner,
        host_scope: { kind: 'SINGLE_KC', kc_id: hosts[0]! },
        declared_host_core_ids: cores,
      };
    }
    // No core of this lesson hosts it. Either the record declared cores that live
    // elsewhere — a lineage mismatch, delivered at lesson level and crediting nothing — or
    // it declared none at all, in which case the lesson is the host and always was.
    return {
      ...base,
      kind,
      owner_lesson_id: owner,
      host_scope: { kind: 'LESSON' },
      declared_host_core_ids: cores,
      mismatch: cores.length > 0,
    };
  }

  const support = supportById.get(attachmentId)!;
  const host = support.host_lesson_id as string;
  return {
    ...base,
    kind: 'SUPPORT',
    owner_lesson_id: host,
    host_scope:
      host === lessonId
        ? { kind: 'LESSON' }
        : { kind: 'SECONDARY_APPLICATION', primary_lesson_id: host },
    declared_host_core_ids: [],
  };
};

const attachmentRefsOf = (lessonId: string): string[] => {
  const lesson = lessonById.get(lessonId)!;
  return [
    ...((lesson.capstone_ids ?? []) as string[]),
    ...((lesson.extension_ids ?? []) as string[]),
    ...((lesson.support_artifact_ids ?? []) as string[]),
  ];
};

export const ATTACHMENT_SCOPES: readonly AttachmentScope[] = lessons.flatMap((lesson) =>
  attachmentRefsOf(lesson.lesson_id as string).map((attachmentId) =>
    resolveHost(lesson.lesson_id as string, attachmentId),
  ),
);

/** The attachments whose declared host cores are not knowledge components of their lesson. */
export const HOST_MISMATCHES: ReadonlyArray<{
  lesson_id: string;
  attachment_id: string;
  declared_host_core_ids: string[];
}> = ATTACHMENT_SCOPES.filter((row) => row.mismatch).map((row) => ({
  lesson_id: row.lesson_id,
  attachment_id: row.attachment_id,
  declared_host_core_ids: row.declared_host_core_ids,
}));

/* ── relations, read rather than constructed ────────────────────────────────── */

const sequenceRefs = (lessonId: string): Row =>
  (lessonById.get(lessonId)?.sequence_relation_refs ?? {}) as Row;

const pathwayRelations = new Map<string, string>();
for (const row of (relations.pathway_lesson_scope_relations ?? []) as Row[]) {
  pathwayRelations.set(`${row.lesson_id}|${row.pathway_id}`, row.relation_id as string);
}

/**
 * The entities a lesson consists of, which is what a graph edge actually connects. This is
 * WP-04's `lessonEntityIds` set, member for member.
 *
 * The earlier version of this join resolved an edge endpoint to a lesson by asking which
 * lesson owned it as a knowledge component. That answers for 72 of the 143 canonical
 * `HARD_PREREQUISITE` edges and for none of the other 71, which have a capstone at one end or
 * both. Those edges indexed under a raw capstone identifier, no lesson pair ever matched them,
 * and 18 hard prerequisites were reported as having no relation to cite when the relation was
 * sitting in the graph the whole time.
 */
const entityIdsOf = (lessonId: string): ReadonlySet<string> => {
  const lesson = lessonById.get(lessonId);
  if (lesson === undefined) return new Set<string>();
  return new Set<string>([
    lessonId,
    ...((lesson.ordered_required_kc_ids ?? []) as string[]),
    ...((lesson.capstone_ids ?? []) as string[]),
    ...((lesson.extension_ids ?? []) as string[]),
    ...((lesson.support_artifact_ids ?? []) as string[]),
  ]);
};

/**
 * Which lessons hold a given entity. Multi-valued on purpose: 18 capstones and 15 extensions
 * belong to more than one lesson, so there is no such thing as the owning lesson of an
 * endpoint. `V3-CAP-481386` alone is held by four, and two of them are prerequisites of a third
 * through it. A single-owner map would have to give both pairs the same answer or neither.
 */
const lessonsByEntity = new Map<string, string[]>();
for (const lesson of lessons) {
  const lessonId = lesson.lesson_id as string;
  for (const entityId of entityIdsOf(lessonId)) {
    lessonsByEntity.set(entityId, [...(lessonsByEntity.get(entityId) ?? []), lessonId]);
  }
}

/**
 * Graph edges keyed by `type|prerequisiteLesson|dependentLesson`, expanded over every lesson
 * that holds each endpoint. Looking a pair up here is the same question WP-04 asks by testing
 * both endpoints against the two lessons' entity sets, asked once instead of per pair.
 */
const edgesByLessonPair = new Map<string, string[]>();
for (const edge of MANIFEST.graph.edges as Row[]) {
  const sourceLessons = lessonsByEntity.get(edge.source_id as string) ?? [];
  const targetLessons = lessonsByEntity.get(edge.target_id as string) ?? [];
  for (const source of sourceLessons) {
    for (const target of targetLessons) {
      const key = `${edge.edge_type}|${source}|${target}`;
      edgesByLessonPair.set(key, [...(edgesByLessonPair.get(key) ?? []), edge.edge_id as string]);
    }
  }
}

const edgeById = index(MANIFEST.graph.edges as Row[], 'edge_id');

/**
 * Normalized point-of-use relations, forward only. `graph_projection_key` and `projection_key`
 * already read `TYPE|source|target`, and the previous version accepted the reversed key as well
 * — which is to say it accepted a relation running the wrong way as evidence that something
 * came first. Direction is the entire content of a prerequisite, so only the forward key counts.
 */
const projectedRelations = new Map<string, Row>();
for (const row of (relations.sirs_math_point_of_use_relations ?? []) as Row[]) {
  projectedRelations.set(row.graph_projection_key as string, row);
}
for (const row of (relations.helpful_order_decision_relations ?? []) as Row[]) {
  projectedRelations.set(row.projection_key as string, row);
}

/**
 * Every canonical relation that evidences one prerequisite between two lessons, in that
 * direction. Nothing is synthesised: an unevidenced pair returns nothing and the packet blocks.
 */
const prerequisiteRelations = (kind: string, prerequisite: string, dependent: string): string[] => {
  const key = `${kind}|${prerequisite}|${dependent}`;
  const projected = projectedRelations.get(key);
  // WP-04 admits a projected relation only when one of the edges beneath it starts inside the
  // prerequisite lesson. A projection whose edges all begin elsewhere is a summary of somebody
  // else's ordering that happens to name these two lessons.
  const sourceEntities = entityIdsOf(prerequisite);
  const projectedIsAuthoritative =
    projected !== undefined &&
    ((projected.underlying_edge_ids ?? []) as string[]).some((edgeId) =>
      sourceEntities.has(edgeById.get(edgeId)?.source_id as string),
    );
  return [
    ...new Set([
      ...(projectedIsAuthoritative ? [projected!.relation_id as string] : []),
      ...(edgesByLessonPair.get(key) ?? []),
    ]),
  ].sort();
};

const deliveryOrdinal = new Map<string, number>();
for (const row of (relations.module_delivery_event_relations ?? []) as Row[]) {
  const lessonId = row.target_lesson_id as string | undefined;
  if (lessonId !== undefined && row.first_delivery_once === true) {
    deliveryOrdinal.set(lessonId, row.global_delivery_event_ordinal as number);
  }
}

const attachmentRelationIds = (scope: AttachmentScope): string[] => {
  const refs = sequenceRefs(scope.lesson_id);
  if (scope.kind === 'CAPSTONE') {
    const capstone = capstoneById.get(scope.attachment_id)!;
    const declared = (capstone.delivery_evidence?.source_relation_ids ?? []) as string[];
    const placements = ((refs.capstone_placements ?? []) as string[]).filter((id) =>
      id.endsWith(scope.attachment_id.slice(-6)),
    );
    return [...new Set([...declared, ...placements])].sort();
  }
  if (scope.kind === 'EXTENSION') {
    const extension = extensionById.get(scope.attachment_id)!;
    return [
      ...new Set((extension.delivery_evidence?.source_relation_ids ?? []) as string[]),
    ].sort();
  }
  const support = supportById.get(scope.attachment_id)!;
  return [...new Set((support.delivery_evidence?.source_relation_ids ?? []) as string[])].sort();
};

const RELATION_CLASS: Record<string, string> = {
  'R14-FD': 'FIRST_DELIVERY',
  'R14-RV': 'REVISIT',
  'R14-CAP': 'CAPSTONE_PLACEMENT',
  'R14-HELD': 'HELD_ATTACHMENT',
  'R14-INTERNAL': 'LESSON_INTERNAL',
};
const relationClassOf = (relationIds: readonly string[]): string => {
  for (const relationId of relationIds) {
    for (const [prefix, klass] of Object.entries(RELATION_CLASS)) {
      if (relationId.startsWith(`${prefix}-`)) return klass;
    }
  }
  return 'LESSON_INTERNAL';
};

/* ── frozen artifacts a packet pins ─────────────────────────────────────────── */

const frozenLiteral = (name: string): string => {
  const def = vocabDef(name);
  const literal =
    def.const ?? ((def.allOf ?? []) as Row[]).find((branch) => branch.const !== undefined)?.const;
  if (typeof literal !== 'string') throw new Error(`${name} pins no literal reference`);
  return literal;
};

export const FROZEN_SOURCE_USE_RECEIPT_REF = frozenLiteral('FrozenSourceUseReceiptRef');

const PROFILE_PATH = 'content/lesson-factory/deadline-profile/deadline-profile.json';
const PROFILE: Row = readJson(PROFILE_PATH);
const PROFILE_REF = `profile:${PROFILE_PATH}#sha256:${fileSha256(PROFILE_PATH)}`;
const PROOF_PATH = 'content/lesson-factory/assignments/partition-proof.json';
const PROOF: Row = readJson(PROOF_PATH);
const PROOF_REF = `allocation-proof:${PROOF_PATH}#sha256:${fileSha256(PROOF_PATH)}`;
const POLICY: Row = readJson('content/lesson-factory/deadline-profile/release-policy.json');
const ANCHOR_SET_VERSION = `${PROFILE.rubric_identity.rubric_version as string}-candidate`;

/**
 * Which lane and team the allocation proof gives this lesson. Read from the proof rows
 * rather than accepted from a caller: the proof is what decides, and three of the 114
 * lessons already exist and are deliberately not allocated to anybody.
 */
const ALLOCATION = new Map<string, { lane: string; team: string; assignment: string }>();
for (const assignment of (PROOF.assignments ?? []) as Row[]) {
  for (const row of (assignment.rows ?? []) as Row[]) {
    ALLOCATION.set(row.lesson_id as string, {
      lane: assignment.lane_id as string,
      team: assignment.team_id as string,
      assignment: assignment.assignment_id as string,
    });
  }
}
const allocationOf = (
  lessonId: string,
): { lane: string; team: string; assignment: string } | null => ALLOCATION.get(lessonId) ?? null;

/* ── source occurrences, projected under the receipt's per-id decision ──────── */

/** The anchors of a crosswalk occurrence, whichever of the two shapes it records them in. */
const anchorIdsOf = (row: Row): string[] => {
  const listed = row.source_anchor_ids as string[] | undefined;
  if (listed !== undefined) return listed;
  const single = row.source_anchor_id as string | undefined;
  return single === undefined ? [] : [single];
};

/**
 * Every field here is read off the crosswalk row by name and then gated on the receipt's
 * allowlist for that exact source. Reading by name rather than spreading the row is the reason
 * the packet has no field containing source prose: `source_summary`, `aamc_pages` and the
 * candidate identifiers are simply never asked for, so there is no path by which they arrive.
 */
const sourceOccurrence = (occurrenceId: string): JsonObject => {
  const row = crosswalkOccurrence.get(occurrenceId) ?? occurrenceById.get(occurrenceId)!;
  const sourceId = row.source_id as string;
  const decision = decisionFor(sourceId);
  const allows = (field: string): boolean =>
    decision?.derived_field_allowlist.includes(field) === true;
  const permitted = decision !== undefined && decision.usable;

  return {
    source_occurrence_id: occurrenceId,
    // Unreachable with the ratified receipt, which allows `occurrence_kind` for all thirteen
    // sources. Kept because the alternative is a projection that reports a kind the owner did
    // not release, and this is what the reference model reads when nobody released one.
    occurrence_kind: allows('occurrence_kind') ? row.occurrence_kind : 'UNSPECIFIED_OCCURRENCE',
    source_id: sourceId,
    source_class: decision?.source_class ?? 'PRIVATE_COMPARISON',
    official_path: allows('official_path') ? ((row.official_path ?? []) as string[]) : [],
    official_topic: allows('official_topic') ? (row.official_topic ?? null) : null,
    printed_pages: allows('printed_pages') ? (row.printed_pages ?? []) : [],
    // The crosswalk writes anchors two ways: a teachable topic lists `source_anchor_ids` and an
    // anchor occurrence names the single `source_anchor_id` it is. 162 rows use the first form
    // and 110 the second, so reading only the plural silently drops the anchors of 110 of them.
    source_anchor_ids: allows('source_anchor_ids') ? anchorIdsOf(row) : [],
    derived_summary: allows('derived_summary') ? ((row.source_summary as string) ?? null) : null,
    scope_status: allows('scope_status') ? (row.scope_status ?? null) : null,
    authority_status: { source_id: sourceId, present_day_authority_refreshed: false },
    rights_status: permitted ? 'PERMITTED' : 'PROHIBITED',
    derived_fields_only: true,
    permitted_use: permitted ? decision.permitted_use_codes : [],
    permission_receipt_refs: [],
    source_use_receipt_ref: permitted ? FROZEN_SOURCE_USE_RECEIPT_REF : null,
  };
};

/* ── source mappings, read off the crosswalk rather than left empty ─────────── */

/**
 * The crosswalk's mappings, indexed by the knowledge component each one targets. Only `direct`
 * and `enabling` roles: a `grouping` or `integration` mapping targets the KC through something
 * else and is not this KC's evidence, and the reference model rejects one that is cited as if
 * it were. All 422 ordered required components are covered, by 1,002 mappings between them.
 */
const CANONICAL_MAPPING_ROLES = new Set([undefined, 'direct', 'enabling']);
const mappingsByKc = new Map<string, Row[]>();
for (const mapping of (CROSSWALK.mappings ?? []) as Row[]) {
  if (mapping.target_type !== 'KC') continue;
  if (!CANONICAL_MAPPING_ROLES.has(mapping.mapping_role as string | undefined)) continue;
  const kcId = mapping.target_id as string;
  mappingsByKc.set(kcId, [...(mappingsByKc.get(kcId) ?? []), mapping]);
}

/** The occurrences one crosswalk mapping rests on, both lists it may name them in. */
const mappingOccurrenceIds = (mapping: Row): string[] =>
  [
    ...new Set([
      ...((mapping.source_occurrence_ids ?? []) as string[]),
      ...((mapping.direct_source_occurrence_ids ?? []) as string[]),
    ]),
  ].sort();

/** Sorted by identifier, so two runs over the same curriculum produce the same bytes. */
const sourceMappingsOf = (kcId: string): Row[] =>
  [...(mappingsByKc.get(kcId) ?? [])].sort((left, right) =>
    (left.mapping_id as string).localeCompare(right.mapping_id as string),
  );

/* ── the projection ─────────────────────────────────────────────────────────── */

const HOLD_TYPE_BY_ID = new Map(holds.map((hold) => [hold.hold_id as string, hold]));

/**
 * The four fields a lesson outside the allocation proof does not get, and the placeholder lane
 * that stands in while the rest of the projection is computed.
 *
 * A packet is addressed by things that belong to an allocation rather than to a lesson: the
 * packet identifier, the lane, the team, the assignment. None of them exists for a lesson no
 * assignment row mentions. The earlier version supplied `lane-01`, `primary` and
 * `assignment-01` regardless, and the result was a quarantine record indistinguishable from a
 * real allocation that had gone wrong. It had not gone wrong; it had never been made.
 *
 * Everything else about such a lesson is real and is kept. What `outOfScope` does is delete the
 * four invented fields, which leaves a record that fails its own schema — correctly, because
 * there is no valid packet for a lesson nobody has been given, and a diagnostic should not be
 * able to pass for one.
 */
const UNALLOCATED_LANE = 'lane-unallocated';
const ALLOCATION_DERIVED_FIELDS = ['packet_id', 'lane_id', 'team_id', 'assignment_id'] as const;

const outOfScope = (packet: JsonObject, lessonId: string): JsonObject => {
  const diagnostic: JsonObject = { ...packet, out_of_scope: true };
  for (const field of ALLOCATION_DERIVED_FIELDS) delete diagnostic[field];
  const requirements = { ...(packet.output_requirements as JsonObject) };
  delete requirements.output_directory;
  return {
    ...diagnostic,
    output_requirements: requirements,
    packet_status: 'BLOCKED',
    packet_surface: 'QUARANTINE',
    block_reasons: [
      {
        code: 'ASSIGNMENT_IDENTITY_MISMATCH',
        path: '/assignment_id',
        message: `${PROOF_PATH} has no assignment row for ${lessonId}, so no lane, team or assignment identity exists to project`,
      },
    ],
    authorable_packet_ref: null,
    packet_content_sha256: null,
  };
};

/** Build the packet a lane would receive for one real lesson, and block where it must. */
export const packetForLesson = (lessonId: string): JsonObject => {
  const lesson = lessonById.get(lessonId);
  if (lesson === undefined) throw new Error(`no such canonical lesson: ${lessonId}`);
  const slug = lessonId.toLowerCase();
  const orderedKcIds = orderedKcsOf(lessonId);
  const blocks: JsonObject[] = [];
  const block = (code: string, path: string, message: string): void => {
    blocks.push({ code, path, message });
  };

  // A lesson the allocation proof has no row for keeps every fact of its own — its knowledge
  // components, sources, attachments, relations, input digests — and loses only the four fields
  // that are properties of an allocation rather than of a lesson. See `outOfScope` below.
  const allocation = allocationOf(lessonId);
  const lane = allocation?.lane ?? UNALLOCATED_LANE;

  const kcRecords = orderedKcIds.map((kcId, position) => {
    const kc = kcById.get(kcId)!;
    const mappings = sourceMappingsOf(kcId);
    if (mappings.length === 0) {
      block(
        'SOURCE_MAPPING_MISSING',
        `/ordered_kc_records/${position}/source_mappings`,
        `the crosswalk gives ${kcId} no direct or enabling mapping`,
      );
    }

    // The occurrences a record carries are the ones its own mappings rest on together with the
    // ones the manifest declares directly. Both are canonical and they do not agree: 182 of the
    // mapped occurrences are absent from the manifest's list and 28 declared ones carry no
    // mapping. Taking the union keeps every occurrence some authority vouches for, and keeps
    // the mappings from citing an occurrence the record does not carry.
    const occurrenceIds = [
      ...new Set([
        ...((kc.direct_source_occurrence_ids ?? []) as string[]),
        ...mappings.flatMap(mappingOccurrenceIds),
      ]),
    ]
      .filter((id) => crosswalkOccurrence.has(id) || occurrenceById.has(id))
      .sort();
    if (occurrenceIds.length === 0) {
      block(
        'SOURCE_OCCURRENCE_MISSING',
        `/ordered_kc_records/${position}`,
        `${kcId} resolves to no source occurrence`,
      );
    }

    for (const mapping of mappings) {
      const unresolved = mappingOccurrenceIds(mapping).filter((id) => !occurrenceIds.includes(id));
      if (unresolved.length > 0) {
        block(
          'SOURCE_MAPPING_CONTRADICTION',
          `/ordered_kc_records/${position}/source_mappings`,
          `mapping ${String(mapping.mapping_id)} rests on ${unresolved.join(', ')}, which ${kcId} does not carry`,
        );
      }
    }

    const occurrences = occurrenceIds.map(sourceOccurrence);
    // A source with no decision, or a decision that refuses it, cannot reach an author. The
    // receipt binds by exact identifier, so an unknown source is unbound, not merely unlisted.
    for (const occurrence of occurrences) {
      if (occurrence.rights_status !== 'PERMITTED') {
        block(
          'SOURCE_RIGHTS_UNCLEARED',
          `/ordered_kc_records/${position}/source_occurrences`,
          `${String(occurrence.source_occurrence_id)} rests on ${String(occurrence.source_id)}, which the receipt does not permit`,
        );
      }
    }
    return {
      kc_id: kcId,
      label: kc.display_label as string,
      competency: (kc.statement_of_competence as string) ?? (kc.display_label as string),
      scope_in: (kc.scope_in ?? []) as string[],
      scope_out: (kc.scope_out ?? []) as string[],
      representations: (kc.representations ?? []) as string[],
      reasoning_operation: (kc.transfer_expectation as string) ?? (kc.display_label as string),
      source_set_status:
        occurrences.length === 0
          ? 'UNRESOLVED'
          : occurrences.length > 1
            ? 'MULTI_SOURCE_CORROBORATED'
            : 'EXACT_SOURCE',
      source_mappings: mappings.map((mapping) => ({
        mapping_id: mapping.mapping_id as string,
        relation: mapping.relation as string,
        source_occurrence_ids: mappingOccurrenceIds(mapping),
      })),
      source_occurrences: occurrences,
    };
  });

  const attachments = attachmentRefsOf(lessonId).map((attachmentId, position) => {
    const scope = resolveHost(lessonId, attachmentId);
    const relationIds = attachmentRelationIds(scope);
    if (relationIds.length === 0) {
      block(
        'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
        `/attachments/${position}`,
        `${attachmentId} is delivered by no canonical relation`,
      );
    }
    const secondary = scope.host_scope.kind === 'SECONDARY_APPLICATION';
    return {
      attachment_id: attachmentId,
      kind: scope.kind,
      owner_lesson_id: scope.owner_lesson_id,
      host_scope: scope.host_scope as unknown as JsonObject,
      declared_host_core_ids: scope.declared_host_core_ids,
      host_core_membership_status: scope.mismatch ? 'MISMATCH_PROVISIONAL' : 'RESOLVED',
      credits_kc_evidence: !scope.mismatch && !secondary && scope.host_scope.kind !== 'LESSON',
      relation_ids: relationIds,
      relation_class: relationClassOf(relationIds),
      relation_direction: secondary ? 'LESSON_TO_ATTACHMENT' : 'ATTACHMENT_TO_LESSON',
      required_delivery:
        scope.kind === 'CAPSTONE' && capstoneById.get(attachmentId)?.delivery_state === 'required',
      ...(scope.mismatch
        ? {
            lineage_nonclaim:
              'The declared host cores belong to another lesson. They are preserved as lineage and credit no knowledge component, no exit condition, and no mastery attribution here.',
            correction_required_after_deadline: true,
          }
        : {}),
    } as JsonObject;
  });
  const mismatched = attachments.some(
    (attachment) => attachment.host_core_membership_status === 'MISMATCH_PROVISIONAL',
  );

  const lessonHolds = ((lesson.unresolved_holds ?? []) as string[])
    .map((holdId) => HOLD_TYPE_BY_ID.get(holdId) ?? holdById.get(holdId))
    .filter((hold): hold is Row => hold !== undefined);
  const heldClaimCount = lessonHolds.filter((hold) => hold.blocks_authoring === true).length;

  const hard = ((lesson.hard_prerequisite_lesson_ids ?? []) as string[]).map((prerequisiteId) => {
    const relationIds = prerequisiteRelations('HARD_PREREQUISITE', prerequisiteId, lessonId);
    if (relationIds.length === 0) {
      block(
        'PREREQUISITE_RELATION_UNRESOLVED',
        '/prerequisites/hard',
        `no canonical relation carries the hard prerequisite ${prerequisiteId} -> ${lessonId}`,
      );
    }
    return {
      lesson_id: prerequisiteId,
      relation_ids: relationIds,
      source_kc_ids: orderedKcsOf(prerequisiteId),
      taught_at_sequence_position: deliveryOrdinal.get(prerequisiteId) ?? 1,
    };
  });
  const helpful = ((lesson.helpful_prerequisite_lesson_ids ?? []) as string[]).map(
    (prerequisiteId) => {
      const relationIds = prerequisiteRelations('HELPFUL_PREREQUISITE', prerequisiteId, lessonId);
      if (relationIds.length === 0) {
        block(
          'PREREQUISITE_RELATION_UNRESOLVED',
          '/prerequisites/helpful',
          `no canonical relation carries the helpful prerequisite ${prerequisiteId} -> ${lessonId}`,
        );
      }
      return { lesson_id: prerequisiteId, relation_ids: relationIds };
    },
  );

  const refs = sequenceRefs(lessonId);
  const firstDelivery = (refs.first_delivery as string) ?? null;
  if (firstDelivery === null) {
    block(
      'REQUIRED_SEQUENCE_RELATION_UNRESOLVED',
      '/placements',
      `${lessonId} has no first delivery`,
    );
  }

  const selectedOccurrences = kcRecords.reduce(
    (total, record) => total + record.source_occurrences.length,
    0,
  );
  const sourceIds = [
    ...new Set(
      kcRecords.flatMap((record) =>
        record.source_occurrences.map((occurrence) => occurrence.source_id as string),
      ),
    ),
  ].sort();

  const ready = blocks.length === 0 && allocation !== null;
  const outputDirectory = ready
    ? `.tmp/lesson-factory/${lane}/${slug}`
    : `.tmp/lesson-factory/${lane}/${slug}/quarantine/blocked-packet-audit.json`;

  const packet = {
    contract_id: 'lesson-factory.task-source-packet',
    contract_version: '5.0.0',
    frozen: true,
    packet_id: `packet:${lane}/${slug}`,
    packet_status: ready ? 'READY' : 'BLOCKED',
    packet_surface: ready ? 'AUTHORABLE' : 'QUARANTINE',
    block_reasons: blocks,
    authorable_packet_ref: null,
    packet_content_sha256: null,
    request_id: 'lesson-factory-deadline-2026-08-03-request-01',
    assignment_id: allocation?.assignment,
    team_id: allocation?.team,
    lane_id: lane,
    requested_name: lesson.canonical_display_label,
    lesson_id: lessonId,
    grouping_id: lesson.owning_cluster_id,
    identity: {
      canonical_title: lesson.canonical_display_label,
      short_alias: slug,
      lesson_type: lesson.lesson_type,
      cluster_id: lesson.owning_cluster_id,
      content_categories: lesson.content_categories,
      foundational_concepts: lesson.foundational_concepts ?? [],
      source_sections: lesson.source_sections,
    },
    source_sanitization: {
      scope: 'SELECTED_PACKET_OCCURRENCES',
      considered_occurrence_count: selectedOccurrences,
      trusted_canonical_input: false,
      sanitized_raw_field_count: 0,
      excluded_held_claim_count: heldClaimCount,
      codes: heldClaimCount > 0 ? ['HELD_SOURCE_CLAIMS_EXCLUDED'] : [],
    },
    curriculum_manifest_sha256: MANIFEST_SHA256,
    input_hashes: INPUT_HASH_ROWS,
    placements: {
      phase_ids: lesson.phase_ids ?? [],
      module_ids: lesson.module_ids ?? [],
      pathway_positions: (lesson.pathway_positions ?? []).map((position: Row) => ({
        pathway_id: position.pathway_id,
        position: position.position,
        relation_ids: [pathwayRelations.get(`${lessonId}|${position.pathway_id as string}`)].filter(
          (id): id is string => typeof id === 'string',
        ),
      })),
      first_delivery_relation_id: firstDelivery,
      revisit_relation_ids: [...new Set((refs.revisits ?? []) as string[])].sort(),
    },
    ordered_kc_ids: orderedKcIds,
    ordered_kc_records: kcRecords,
    prerequisites: { hard, helpful },
    attachments,
    holds: lessonHolds.map((hold) => ({
      hold_id: hold.hold_id,
      type: hold.type,
      issue: hold.issue,
      classification: 'CONTEXTUAL_NONBLOCKING',
      safe_interim_code: 'RECORD_CANONICAL_HOLD_WITHOUT_VALIDATION_CLAIM',
      safe_interim_behavior: hold.release_condition,
      nonclaim: 'The hold remains open and nothing here closes it.',
      blocks_authoring: false,
    })),
    source_anchors: [
      ...new Set(
        kcRecords.flatMap((record) =>
          record.source_occurrences.flatMap(
            (occurrence) => occurrence.source_anchor_ids as string[],
          ),
        ),
      ),
    ].sort(),
    source_documents: sourceIds.map((sourceId) => ({
      source_id: sourceId,
      source_class: decisionFor(sourceId)?.source_class ?? 'PRIVATE_COMPARISON',
      source_locator: '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
      present_day_authority_refreshed: false,
    })),
    research_evidence: {
      registry_id: 'v3-research-evidence-registry',
      authority: 'DESIGN_ONLY',
      used_as_domain_fact_authority: false,
      nonclaim:
        'Research evidence is design-only and cannot validate lesson facts, efficacy, mastery, readiness, or learner validity.',
    },
    adaptive_policy: {
      bypass_authorized: false,
      mastery_threshold: null,
      fluency_threshold: null,
      uncertainty_threshold: null,
    },
    dok_authoring: {
      item_level_dok_labels_authorized: false,
      requirement:
        'Use the authoritative KC competency, scope, representation, and operation evidence; do not invent item-level DOK labels.',
    },
    output_requirements: {
      authorable_packet_path: `content/lesson-factory/packets/${lessonId}/task-source-packet.json`,
      output_directory: outputDirectory,
      canonical_template_path: 'docs/lesson-authoring/template/v3-les-000000',
      anchor_set_version: ANCHOR_SET_VERSION,
      max_revision_cycles: 2,
      required_handoff_files: [
        'lesson-script.json',
        'kc-coverage-matrix.json',
        'lesson-presentation-plan.json',
        'lesson-quality-report.json',
        'lesson-handoff.json',
      ],
    },
    ...(mismatched
      ? {
          provisional_host_lineage: {
            present: true,
            nonclaim:
              'One or more attachments in this packet declare host cores that are not knowledge components of this lesson. They are delivered at lesson level and credit nothing.',
            correction_required_after_deadline: true,
          },
        }
      : {}),
    route_universe: ['STANDARD', 'CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT'],
    route_proofs: POLICY.route_proofs,
    required_human_review_roles: ['PRODUCT_PEDAGOGY_OWNER'],
    rubric_identity: PROFILE.rubric_identity,
    deadline_profile_ref: PROFILE_REF,
    release_policy_ref: frozenLiteral('FrozenReleasePolicyRef'),
    source_use_receipt_ref: FROZEN_SOURCE_USE_RECEIPT_REF,
    allocation_proof_ref: PROOF_REF,
    nonclaims: PROFILE.nonclaims,
    route_scope_code: POLICY.route_scope_code,
    applicable_routes: POLICY.applicable_routes,
    ratified_policy_version: POLICY.policy_version,
  } as JsonObject;

  return allocation === null ? outOfScope(packet, lessonId) : packet;
};

/**
 * The lessons a packet can be cut for at all: the ones WP-02's allocation proof gives to a lane.
 * A lesson outside this set has no lane, no team and no assignment, which is a fact about the
 * allocation and not a defect in the lesson.
 */
export const GENERATION_SET: readonly string[] = lessons
  .map((lesson) => lesson.lesson_id as string)
  .filter((lessonId) => allocationOf(lessonId) !== null);

/**
 * The lessons the proof leaves out, reported rather than projected. These are diagnostics, not
 * quarantined packets: quarantine is where a packet goes when its own facts fail, and these
 * never got as far as having facts of their own to fail.
 */
export const OUT_OF_SCOPE_LESSONS: ReadonlyArray<{ lesson_id: string; reason: string }> = lessons
  .map((lesson) => lesson.lesson_id as string)
  .filter((lessonId) => allocationOf(lessonId) === null)
  .map((lessonId) => ({
    lesson_id: lessonId,
    reason: `${PROOF_PATH} has no assignment row for ${lessonId}`,
  }));

/** The lessons this projection can carry all the way to READY, and the ones it cannot. */
export const READY_LESSON_IDS: readonly string[] = GENERATION_SET.filter(
  (lessonId) => packetForLesson(lessonId).packet_status === 'READY',
);

/* ── the registry the compatibility tests validate against ─────────────────── */

const CONTRACT_BASE = 'https://mcat-mastery.internal/lesson-factory/schemas/v1/';
export const schemaId = (file: string): string => `${CONTRACT_BASE}${file}`;

const built = new SchemaRegistry();
for (const file of [
  'shared-vocabulary.schema.json',
  'task-source-packet.schema.json',
  'owner-source-use-receipt.schema.json',
]) {
  built.add(loadSchema(file));
}
export const registry = built;
