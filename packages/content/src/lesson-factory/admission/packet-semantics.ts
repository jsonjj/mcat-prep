import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ADMISSION_AUTHORITY_PATHS } from './authority';
import { canonicalJson } from './canonical-json';
import type { JsonObject, JsonValue } from './json-schema-subset';
import { REPO_ROOT } from './reference-model';

export { canonicalJson };

type Row = Record<string, unknown>;

const sha256 = (text: string | Buffer): string =>
  createHash('sha256')
    .update(typeof text === 'string' ? Buffer.from(text, 'utf8') : text)
    .digest('hex');

const fileCache = new Map<string, { file: string; content: string } | null>();

export function digestsOf(repoRelativePath: string): { file: string; content: string } | null {
  const cached = fileCache.get(repoRelativePath);
  if (cached !== undefined) return cached;
  const absolute = join(REPO_ROOT, repoRelativePath);
  if (!existsSync(absolute)) {
    fileCache.set(repoRelativePath, null);
    return null;
  }
  const text = readFileSync(absolute, 'utf8');
  let content = sha256(text);
  if (repoRelativePath.endsWith('.json')) {
    try {
      content = sha256(canonicalJson(JSON.parse(text)));
    } catch {
      content = sha256(text);
    }
  }
  const digests = { file: sha256(text), content };
  fileCache.set(repoRelativePath, digests);
  return digests;
}

let manifest: Row | undefined;
const curriculum = (): Row => {
  manifest ??= JSON.parse(
    readFileSync(join(REPO_ROOT, ADMISSION_AUTHORITY_PATHS.curriculumManifest), 'utf8'),
  ) as Row;
  return manifest;
};

const PACKET_INPUTS = Object.entries(ADMISSION_AUTHORITY_PATHS);

let allocation: Map<string, { lane: string; team: string; assignment: string }> | undefined;

function allocationOf(
  lessonId: string,
): { lane: string; team: string; assignment: string } | undefined {
  if (allocation === undefined) {
    allocation = new Map();
    const proof = JSON.parse(
      readFileSync(join(REPO_ROOT, ADMISSION_AUTHORITY_PATHS.assignmentProof), 'utf8'),
    ) as Row;
    for (const assignment of (proof.assignments ?? []) as Row[]) {
      for (const row of (assignment.rows ?? []) as Row[]) {
        allocation.set(String(row.lesson_id), {
          lane: String(assignment.lane_id),
          team: String(assignment.team_id),
          assignment: String(assignment.assignment_id),
        });
      }
    }
  }
  return allocation.get(lessonId);
}

const strings = (value: JsonValue | undefined): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const objects = (value: JsonValue | undefined): JsonObject[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is JsonObject =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
const object = (value: JsonValue | undefined): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};

const CROSSWALK_PATH = ADMISSION_AUTHORITY_PATHS.sourceCrosswalk;
const SOURCE_RECEIPT_PATH = ADMISSION_AUTHORITY_PATHS.ownerSourceUseReceipt;
const PROFILE_PATH = ADMISSION_AUTHORITY_PATHS.deadlineProfile;
const POLICY_PATH = ADMISSION_AUTHORITY_PATHS.releasePolicy;

const readAuthority = (repoRelativePath: string): Row =>
  JSON.parse(readFileSync(join(REPO_ROOT, repoRelativePath), 'utf8')) as Row;

let crosswalkAuthority: Row | undefined;
let sourceReceiptAuthority: Row | undefined;
let profileAuthority: Row | undefined;
let policyAuthority: Row | undefined;

const crosswalk = (): Row => (crosswalkAuthority ??= readAuthority(CROSSWALK_PATH));
const sourceReceipt = (): Row => (sourceReceiptAuthority ??= readAuthority(SOURCE_RECEIPT_PATH));
const profile = (): Row => (profileAuthority ??= readAuthority(PROFILE_PATH));
const policy = (): Row => (policyAuthority ??= readAuthority(POLICY_PATH));

const rows = (value: unknown): Row[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is Row => item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
const stringRows = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const sortedStrings = (value: unknown): string[] => [...new Set(stringRows(value))].sort();
const sameJson = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);
const sameStringSet = (left: unknown, right: unknown): boolean =>
  sameJson(sortedStrings(left), sortedStrings(right));

const uniqueRowBy = (source: Row[], field: string): Map<string, Row | null> => {
  const index = new Map<string, Row | null>();
  for (const row of source) {
    const id = String(row[field] ?? '');
    index.set(id, index.has(id) ? null : row);
  }
  return index;
};

interface CanonicalRelation {
  surface: 'GRAPH' | 'SEQUENCE';
  collection: string;
  row: Row;
}

let canonicalRelations: Map<string, CanonicalRelation[] | undefined> | undefined;

function relationIndex(): Map<string, CanonicalRelation[] | undefined> {
  if (canonicalRelations !== undefined) return canonicalRelations;
  const index = new Map<string, CanonicalRelation[] | undefined>();
  const add = (id: string, relation: CanonicalRelation): void => {
    const existing = index.get(id);
    index.set(id, existing === undefined ? [relation] : [...existing, relation]);
  };

  const manifest = curriculum();
  for (const edge of rows((manifest.graph as Row | undefined)?.edges)) {
    add(String(edge.edge_id ?? ''), { surface: 'GRAPH', collection: 'edges', row: edge });
  }
  const normalized = ((manifest.sequence as Row | undefined)?.normalized_relations ?? {}) as Row;
  for (const [collection, value] of Object.entries(normalized)) {
    for (const relation of rows(value)) {
      if (typeof relation.relation_id !== 'string') continue;
      add(relation.relation_id, { surface: 'SEQUENCE', collection, row: relation });
    }
  }
  canonicalRelations = index;
  return index;
}

const oneRelation = (relationId: string): CanonicalRelation | undefined => {
  const matches = relationIndex().get(relationId) ?? [];
  return matches.length === 1 ? matches[0] : undefined;
};

const relationClass = (relation: CanonicalRelation): string => {
  if (relation.surface === 'GRAPH') return String(relation.row.edge_type ?? '');
  if (relation.collection === 'helpful_order_decision_relations') return 'HELPFUL_PREREQUISITE';
  if (relation.collection === 'sirs_math_point_of_use_relations') {
    return String(relation.row.relation_type ?? '');
  }
  if (relation.collection === 'module_delivery_event_relations') {
    return relation.row.placement_kind === 'CAPSTONE_COORDINATION'
      ? 'CAPSTONE_PLACEMENT'
      : 'FIRST_DELIVERY';
  }
  if (relation.collection === 'module_revisit_relations') return 'REVISIT';
  if (relation.collection === 'held_nonrequired_relations') return 'HELD_ATTACHMENT';
  if (relation.collection === 'lesson_internal_order_relations') return 'LESSON_INTERNAL';
  if (relation.collection === 'pathway_lesson_scope_relations') return 'PATHWAY_PLACEMENT';
  return relation.collection;
};

const curriculumRows = (): {
  lessons: Row[];
  kcs: Row[];
  capstones: Row[];
  extensions: Row[];
  supports: Row[];
} => {
  const canonical = curriculum().curriculum as Row;
  return {
    lessons: rows(canonical.lessons),
    kcs: rows(canonical.kcs),
    capstones: rows(canonical.capstones),
    extensions: rows(canonical.extensions),
    supports: rows(canonical.support_artifacts),
  };
};

const lessonEntityIds = (lessonId: string): ReadonlySet<string> => {
  const lesson = curriculumRows().lessons.find((row) => row.lesson_id === lessonId);
  if (lesson === undefined) return new Set<string>();
  return new Set([
    lessonId,
    ...stringRows(lesson.ordered_required_kc_ids),
    ...stringRows(lesson.capstone_ids),
    ...stringRows(lesson.extension_ids),
    ...stringRows(lesson.support_artifact_ids),
  ]);
};

const canonicalPrerequisiteRelations = (
  kind: 'HARD_PREREQUISITE' | 'HELPFUL_PREREQUISITE',
  prerequisiteLessonId: string,
  dependentLessonId: string,
): string[] => {
  const sourceEntities = lessonEntityIds(prerequisiteLessonId);
  const targetEntities = lessonEntityIds(dependentLessonId);
  const found: string[] = [];
  for (const [relationId, matches] of relationIndex()) {
    if (matches === undefined || matches.length !== 1) continue;
    const relation = matches[0]!;
    if (relationClass(relation) !== kind) continue;
    if (relation.surface === 'GRAPH') {
      if (
        sourceEntities.has(String(relation.row.source_id)) &&
        targetEntities.has(String(relation.row.target_id))
      ) {
        found.push(relationId);
      }
      continue;
    }
    if (
      relation.row.source_lesson_id === prerequisiteLessonId &&
      relation.row.target_lesson_id === dependentLessonId &&
      stringRows(relation.row.underlying_edge_ids).every((edgeId) => {
        const edge = oneRelation(edgeId);
        return (
          edge?.surface === 'GRAPH' &&
          relationClass(edge) === kind &&
          sourceEntities.has(String(edge.row.source_id)) &&
          targetEntities.has(String(edge.row.target_id))
        );
      })
    ) {
      found.push(relationId);
    }
  }
  return [...new Set(found)].sort();
};

const sourceReceiptRef = (): string => {
  const digest = digestsOf(SOURCE_RECEIPT_PATH);
  return `source-use-receipt:${SOURCE_RECEIPT_PATH}#sha256:${digest?.file ?? '0'.repeat(64)}`;
};

export function packetSemanticErrors(packet: JsonObject): string[] {
  const problems: string[] = [];
  const say = (problem: string): void => {
    problems.push(problem);
  };

  const lessonId = String(packet.lesson_id ?? '');
  const laneId = String(packet.lane_id ?? '');
  const packetId = String(packet.packet_id ?? '');
  const status = String(packet.packet_status ?? '');
  const surface = String(packet.packet_surface ?? '');

  const idParts = /^packet:(lane-[0-9]{2})\/(v3-les-[0-9]{6})$/.exec(packetId);
  if (idParts === null) {
    say(`packet_id ${JSON.stringify(packetId)} is not a canonical packet id`);
  } else {
    if (idParts[1] !== laneId) {
      say(`packet_id names ${idParts[1]} but lane_id is ${laneId}`);
    }
    if (idParts[2] !== lessonId.toLowerCase()) {
      say(`packet_id names ${idParts[2]} but lesson_id is ${lessonId}`);
    }
  }

  const identity = object(packet.identity);
  if (identity.cluster_id !== packet.grouping_id) {
    say(
      `grouping_id ${String(packet.grouping_id)} and identity.cluster_id ${String(identity.cluster_id)} are the same fact and disagree`,
    );
  }
  if (identity.short_alias !== lessonId.toLowerCase()) {
    say(`identity.short_alias ${String(identity.short_alias)} is not the slug of ${lessonId}`);
  }

  const lesson = ((curriculum().curriculum as Row).lessons as Row[]).find(
    (row) => row.lesson_id === lessonId,
  );
  if (lesson === undefined) {
    say(`${lessonId} is not a canonical lesson`);
    return problems;
  }
  if (identity.canonical_title !== lesson.canonical_display_label) {
    say('identity.canonical_title is not the label the curriculum issued');
  }
  if (packet.grouping_id !== lesson.owning_cluster_id) {
    say(`grouping_id ${String(packet.grouping_id)} is not this lesson's owning cluster`);
  }
  if (packet.requested_name !== lesson.canonical_display_label) {
    say('requested_name is not the canonical lesson label');
  }
  for (const [field, canonical] of [
    ['lesson_type', lesson.lesson_type],
    ['content_categories', lesson.content_categories],
    ['foundational_concepts', lesson.foundational_concepts ?? []],
    ['source_sections', lesson.source_sections],
  ] as const) {
    if (!sameJson(identity[field], canonical)) {
      say(`identity.${field} is not the canonical curriculum value`);
    }
  }

  const orderedIds = strings(packet.ordered_kc_ids);
  const records = objects(packet.ordered_kc_records);
  const canonicalOrder = (lesson.ordered_required_kc_ids ?? []) as string[];
  if (JSON.stringify(orderedIds) !== JSON.stringify(canonicalOrder)) {
    say('ordered_kc_ids is not the curriculum order for this lesson');
  }
  if (JSON.stringify(records.map((record) => record.kc_id)) !== JSON.stringify(orderedIds)) {
    say('ordered_kc_records is not ordered_kc_ids in the same order');
  }
  const kcById = uniqueRowBy(curriculumRows().kcs, 'kc_id');
  for (const [index, record] of records.entries()) {
    const kcId = String(record.kc_id ?? '');
    const canonicalKc = kcById.get(kcId);
    if (canonicalKc === undefined || canonicalKc === null) {
      say(`ordered_kc_records/${index} names ${kcId}, which is not one canonical KC`);
    } else if (canonicalKc.owning_lesson_id !== lessonId) {
      say(`${kcId} is owned by ${String(canonicalKc.owning_lesson_id)}, not ${lessonId}`);
    }
  }

  const inputs = objects(packet.input_hashes);
  const seen = new Set<string>();
  for (const row of inputs) {
    const key = String(row.input ?? '');
    if (seen.has(key)) say(`input_hashes names ${key} more than once`);
    seen.add(key);
    const path = String(row.path ?? '');
    const digests = digestsOf(path);
    if (digests === null) {
      say(`input_hashes ${key} names ${path}, which is not on disk`);
      continue;
    }
    if (digests.file !== row.file_sha256) {
      say(
        `input_hashes ${key} declares file ${String(row.file_sha256)} but ${path} hashes to ${digests.file}`,
      );
    }
    if (digests.content !== row.content_sha256) {
      say(
        `input_hashes ${key} declares content ${String(row.content_sha256)} but ${path} canonicalises to ${digests.content}`,
      );
    }
  }
  if (inputs.length !== 10) say(`input_hashes has ${inputs.length} rows where generation reads 10`);
  for (const [key, path] of PACKET_INPUTS) {
    const row = inputs.find((candidate) => candidate.input === key);
    if (row === undefined) {
      say(`input_hashes does not bind ${key}, which generation reads`);
    } else if (row.path !== path) {
      say(`input_hashes reads ${key} from ${String(row.path)}, not from ${path}`);
    }
  }

  const manifestRow = inputs.find((row) => row.input === 'curriculumManifest');
  if (manifestRow !== undefined && manifestRow.file_sha256 !== packet.curriculum_manifest_sha256) {
    say('curriculum_manifest_sha256 and the curriculumManifest input digest disagree');
  }

  for (const [field, expectedPath] of [
    ['allocation_proof_ref', 'content/lesson-factory/assignments/partition-proof.json'],
    [
      'source_use_receipt_ref',
      'content/lesson-factory/deadline-profile/owner-source-use-receipt.json',
    ],
    ['deadline_profile_ref', 'content/lesson-factory/deadline-profile/deadline-profile.json'],
    ['release_policy_ref', 'content/lesson-factory/deadline-profile/release-policy.json'],
  ] as const) {
    const reference = String(packet[field] ?? '');
    const digest = reference.slice(reference.indexOf('#sha256:') + '#sha256:'.length);
    const onDisk = digestsOf(expectedPath);
    if (onDisk === null) {
      say(`${field} names ${expectedPath}, which is not on disk`);
    } else if (digest !== onDisk.file) {
      say(`${field} pins ${digest || '(nothing)'} but ${expectedPath} hashes to ${onDisk.file}`);
    }
  }

  const allocated = allocationOf(lessonId);
  if (allocated === undefined) {
    say(
      `${lessonId} has no authoritative allocation proof row; lane_id, team_id, assignment_id, packet_id, and lane-scoped paths cannot be fabricated for quarantine`,
    );
  } else {
    if (allocated.lane !== laneId) say(`the proof allocates ${lessonId} to ${allocated.lane}`);
    if (allocated.team !== packet.team_id) {
      say(`the proof allocates ${lessonId} to ${allocated.team}`);
    }
    if (allocated.assignment !== packet.assignment_id) {
      say(`the proof files ${lessonId} under ${allocated.assignment}`);
    }
  }

  const canonical = curriculumRows();
  const lessonById = uniqueRowBy(canonical.lessons, 'lesson_id');
  const ensureUniqueRelation = (relationId: string, context: string): CanonicalRelation | null => {
    const matches = relationIndex().get(relationId) ?? [];
    if (matches.length !== 1) {
      say(
        `${context} relation ${relationId} resolves ${matches.length} times in the canonical graph/sequence records`,
      );
      return null;
    }
    return matches[0]!;
  };

  const placements = object(packet.placements);
  if (!sameJson(placements.phase_ids, lesson.phase_ids ?? [])) {
    say('placements.phase_ids is not the canonical phase set for this lesson');
  }
  if (!sameJson(placements.module_ids, lesson.module_ids ?? [])) {
    say('placements.module_ids is not the canonical module set for this lesson');
  }

  const canonicalPathways = rows(lesson.pathway_positions);
  const packetPathways = objects(placements.pathway_positions);
  const canonicalPathwayShape = canonicalPathways.map((position) => ({
    pathway_id: position.pathway_id,
    position: position.position,
  }));
  const packetPathwayShape = packetPathways.map((position) => ({
    pathway_id: position.pathway_id,
    position: position.position,
  }));
  if (!sameJson(packetPathwayShape, canonicalPathwayShape)) {
    say('placements.pathway_positions is not the canonical pathway order for this lesson');
  }
  for (const position of packetPathways) {
    const pathwayId = String(position.pathway_id ?? '');
    for (const relationId of strings(position.relation_ids)) {
      const relation = ensureUniqueRelation(relationId, `pathway ${pathwayId}`);
      if (
        relation !== null &&
        (relation.collection !== 'pathway_lesson_scope_relations' ||
          relation.row.lesson_id !== lessonId ||
          relation.row.pathway_id !== pathwayId)
      ) {
        say(
          `pathway relation ${relationId} does not bind ${lessonId} to ${pathwayId} in its canonical direction`,
        );
      }
    }
    const canonicalIds = [...relationIndex()]
      .filter(([, matches]) => {
        const relation = matches?.length === 1 ? matches[0] : undefined;
        return (
          relation?.collection === 'pathway_lesson_scope_relations' &&
          relation.row.lesson_id === lessonId &&
          relation.row.pathway_id === pathwayId
        );
      })
      .map(([relationId]) => relationId)
      .sort();
    if (!sameStringSet(position.relation_ids, canonicalIds)) {
      say(
        `pathway ${pathwayId} relation_ids are ${JSON.stringify(strings(position.relation_ids))}, canonical is ${JSON.stringify(canonicalIds)}`,
      );
    }
  }

  const sequenceRefs = (lesson.sequence_relation_refs ?? {}) as Row;
  const expectedFirstDelivery = sequenceRefs.first_delivery ?? null;
  if (placements.first_delivery_relation_id !== expectedFirstDelivery) {
    say(
      `placements.first_delivery_relation_id is ${String(placements.first_delivery_relation_id)}, canonical is ${String(expectedFirstDelivery)}`,
    );
  }
  if (typeof placements.first_delivery_relation_id === 'string') {
    const relation = ensureUniqueRelation(placements.first_delivery_relation_id, 'first-delivery');
    if (
      relation !== null &&
      (relation.collection !== 'module_delivery_event_relations' ||
        relationClass(relation) !== 'FIRST_DELIVERY' ||
        relation.row.target_lesson_id !== lessonId)
    ) {
      say(
        `first-delivery relation ${placements.first_delivery_relation_id} does not target ${lessonId}`,
      );
    }
  }

  const expectedRevisits = sortedStrings(sequenceRefs.revisits ?? []);
  if (!sameStringSet(placements.revisit_relation_ids, expectedRevisits)) {
    say('placements.revisit_relation_ids is not the canonical revisit set');
  }
  for (const relationId of strings(placements.revisit_relation_ids)) {
    const relation = ensureUniqueRelation(relationId, 'revisit');
    if (
      relation !== null &&
      (relation.collection !== 'module_revisit_relations' ||
        relationClass(relation) !== 'REVISIT' ||
        relation.row.target_lesson_id !== lessonId)
    ) {
      say(`revisit relation ${relationId} does not target ${lessonId}`);
    }
  }

  const firstDeliveryOrdinal = (prerequisiteLessonId: string): number | undefined => {
    const prerequisite = lessonById.get(prerequisiteLessonId);
    if (prerequisite === undefined || prerequisite === null) return undefined;
    const reference = ((prerequisite.sequence_relation_refs ?? {}) as Row).first_delivery;
    if (typeof reference !== 'string') return undefined;
    const relation = oneRelation(reference);
    return relation?.collection === 'module_delivery_event_relations' &&
      typeof relation.row.global_delivery_event_ordinal === 'number'
      ? relation.row.global_delivery_event_ordinal
      : undefined;
  };

  const checkPrerequisiteRows = (
    kind: 'HARD_PREREQUISITE' | 'HELPFUL_PREREQUISITE',
    packetRows: JsonObject[],
    canonicalLessonIds: string[],
  ): void => {
    const label = kind === 'HARD_PREREQUISITE' ? 'hard' : 'helpful';
    if (
      !sameStringSet(
        packetRows.map((row) => row.lesson_id),
        canonicalLessonIds,
      )
    ) {
      say(`prerequisites.${label} is not the canonical prerequisite lesson set`);
    }
    for (const row of packetRows) {
      const prerequisiteId = String(row.lesson_id ?? '');
      const expectedRelations = canonicalPrerequisiteRelations(kind, prerequisiteId, lessonId);
      const emittedRelations = strings(row.relation_ids);
      const foreignRelations = emittedRelations.filter(
        (relationId) => !expectedRelations.includes(relationId),
      );
      if (emittedRelations.length === 0 || foreignRelations.length > 0) {
        say(
          `${label} prerequisite ${prerequisiteId} relation_ids are ${JSON.stringify(emittedRelations)}, canonical ${kind} direction permits ${JSON.stringify(expectedRelations)}`,
        );
      }
      for (const relationId of emittedRelations) {
        const relation = ensureUniqueRelation(relationId, `${label} prerequisite`);
        if (relation === null) continue;
        const sourceEntities = lessonEntityIds(prerequisiteId);
        const targetEntities = lessonEntityIds(lessonId);
        let sourceMatches = false;
        let targetMatches = false;
        let actualDirection = '';
        if (relation.surface === 'GRAPH') {
          const sourceId = String(relation.row.source_id);
          const targetId = String(relation.row.target_id);
          sourceMatches = sourceEntities.has(sourceId);
          targetMatches = targetEntities.has(targetId);
          actualDirection = `${sourceId} -> ${targetId}`;
        } else {
          const sourceLesson = String(relation.row.source_lesson_id ?? '');
          const targetLesson = String(relation.row.target_lesson_id ?? '');
          sourceMatches = sourceLesson === prerequisiteId;
          targetMatches = targetLesson === lessonId;
          actualDirection = `${sourceLesson} -> ${targetLesson}`;
        }
        const projectionKey =
          relation.row.graph_projection_key ?? relation.row.projection_key ?? null;
        if (
          relationClass(relation) !== kind ||
          !sourceMatches ||
          !targetMatches ||
          (projectionKey !== null && projectionKey !== `${kind}|${prerequisiteId}|${lessonId}`)
        ) {
          say(
            `${label} prerequisite relation ${relationId} is ${relationClass(relation)} ${actualDirection}, not ${kind} ${prerequisiteId} entities -> ${lessonId} entities`,
          );
        }
        for (const edgeId of stringRows(relation.row.underlying_edge_ids)) {
          const edge = oneRelation(edgeId);
          if (
            edge === undefined ||
            edge.surface !== 'GRAPH' ||
            relationClass(edge) !== kind ||
            !sourceEntities.has(String(edge.row.source_id)) ||
            !targetEntities.has(String(edge.row.target_id))
          ) {
            say(
              `${label} prerequisite projection ${relationId} has underlying edge ${edgeId} with a foreign class, endpoint set, or direction`,
            );
          }
        }
      }

      if (kind === 'HARD_PREREQUISITE') {
        const prerequisite = lessonById.get(prerequisiteId);
        const expectedKcs =
          prerequisite === undefined || prerequisite === null
            ? []
            : stringRows(prerequisite.ordered_required_kc_ids);
        if (!sameJson(row.source_kc_ids, expectedKcs)) {
          say(`hard prerequisite ${prerequisiteId} source_kc_ids is not its canonical KC order`);
        }
        const expectedPosition = firstDeliveryOrdinal(prerequisiteId);
        if (row.taught_at_sequence_position !== expectedPosition) {
          say(
            `hard prerequisite ${prerequisiteId} taught_at_sequence_position is ${String(row.taught_at_sequence_position)}, canonical is ${String(expectedPosition)}`,
          );
        }
      }
    }
  };

  const prerequisiteObject = object(packet.prerequisites);
  checkPrerequisiteRows(
    'HARD_PREREQUISITE',
    objects(prerequisiteObject.hard),
    stringRows(lesson.hard_prerequisite_lesson_ids),
  );
  checkPrerequisiteRows(
    'HELPFUL_PREREQUISITE',
    objects(prerequisiteObject.helpful),
    stringRows(lesson.helpful_prerequisite_lesson_ids),
  );

  const kcSet = new Set(orderedIds);
  const attachmentIds = new Set([
    ...((lesson.capstone_ids ?? []) as string[]),
    ...((lesson.extension_ids ?? []) as string[]),
    ...((lesson.support_artifact_ids ?? []) as string[]),
  ]);
  const packetAttachmentIds = objects(packet.attachments).map((attachment) =>
    String(attachment.attachment_id ?? ''),
  );
  if (!sameStringSet(packetAttachmentIds, [...attachmentIds])) {
    say('attachments is not the canonical attachment set for this lesson');
  }
  const capstoneById = uniqueRowBy(canonical.capstones, 'capstone_id');
  const extensionById = uniqueRowBy(canonical.extensions, 'extension_id');
  const supportById = uniqueRowBy(canonical.supports, 'support_id');
  let mismatched = 0;
  for (const attachment of objects(packet.attachments)) {
    const attachmentId = String(attachment.attachment_id ?? '');
    if (!attachmentIds.has(attachmentId)) {
      say(`${attachmentId} is not an attachment this lesson references`);
    }

    const capstone = capstoneById.get(attachmentId);
    const extension = extensionById.get(attachmentId);
    const support = supportById.get(attachmentId);
    const matches = [capstone, extension, support].filter(
      (row): row is Row => row !== undefined && row !== null,
    );
    if (matches.length !== 1) {
      say(`${attachmentId} resolves ${matches.length} times in canonical attachment records`);
      continue;
    }
    const canonicalAttachment = matches[0]!;
    const canonicalKind =
      capstone !== undefined && capstone !== null
        ? 'CAPSTONE'
        : extension !== undefined && extension !== null
          ? 'EXTENSION'
          : 'SUPPORT';
    const ownerLessonId =
      canonicalKind === 'SUPPORT'
        ? String(canonicalAttachment.host_lesson_id)
        : String(canonicalAttachment.owning_lesson_id);
    if (attachment.kind !== canonicalKind) {
      say(`${attachmentId} is canonically ${canonicalKind}, not ${String(attachment.kind)}`);
    }
    if (attachment.owner_lesson_id !== ownerLessonId) {
      say(
        `${attachmentId} is owned by ${ownerLessonId}, not ${String(attachment.owner_lesson_id)}`,
      );
    }

    const orderedSet = new Set(orderedIds);
    let declaredHostCoreIds: string[] = [];
    let expectedScope: JsonObject = { kind: 'LESSON' };
    let expectedMismatch = false;
    if (canonicalKind === 'CAPSTONE') {
      declaredHostCoreIds = stringRows(canonicalAttachment.component_kc_ids);
      if (ownerLessonId !== lessonId) {
        expectedScope = { kind: 'SECONDARY_APPLICATION', primary_lesson_id: ownerLessonId };
      } else {
        const localHosts = declaredHostCoreIds.filter((kcId) => orderedSet.has(kcId));
        expectedScope =
          localHosts.length >= 2
            ? { kind: 'MULTI_KC', kc_ids: localHosts }
            : localHosts.length === 1
              ? { kind: 'SINGLE_KC', kc_id: localHosts[0]! }
              : { kind: 'LESSON' };
      }
    } else if (canonicalKind === 'EXTENSION') {
      declaredHostCoreIds = stringRows(canonicalAttachment.host_core_ids);
      const secondaryLessons = stringRows(canonicalAttachment.secondary_application_lesson_ids);
      if (ownerLessonId !== lessonId && secondaryLessons.includes(lessonId)) {
        expectedScope = { kind: 'SECONDARY_APPLICATION', primary_lesson_id: ownerLessonId };
      } else {
        const localCapstones = stringRows(canonicalAttachment.host_capstone_ids).filter(
          (capstoneId) => stringRows(lesson.capstone_ids).includes(capstoneId),
        );
        const localHosts = declaredHostCoreIds.filter((kcId) => orderedSet.has(kcId));
        if (declaredHostCoreIds.length === 0 && localCapstones.length > 0) {
          expectedScope = { kind: 'CAPSTONE', capstone_ids: localCapstones };
        } else if (localHosts.length >= 2) {
          expectedScope = { kind: 'MULTI_KC', kc_ids: localHosts };
        } else if (localHosts.length === 1) {
          expectedScope = { kind: 'SINGLE_KC', kc_id: localHosts[0]! };
        } else {
          expectedScope = { kind: 'LESSON' };
          expectedMismatch = declaredHostCoreIds.length > 0;
        }
      }
    } else {
      expectedScope =
        ownerLessonId === lessonId
          ? { kind: 'LESSON' }
          : { kind: 'SECONDARY_APPLICATION', primary_lesson_id: ownerLessonId };
    }

    if (!sameJson(attachment.declared_host_core_ids, declaredHostCoreIds)) {
      say(`${attachmentId} declared_host_core_ids is not the canonical declared host set`);
    }
    if (!sameJson(attachment.host_scope, expectedScope)) {
      say(
        `${attachmentId} host_scope is ${canonicalJson(attachment.host_scope)}, canonical is ${canonicalJson(expectedScope)}`,
      );
    }
    const expectedMembership = expectedMismatch ? 'MISMATCH_PROVISIONAL' : 'RESOLVED';
    if (attachment.host_core_membership_status !== expectedMembership) {
      say(`${attachmentId} host_core_membership_status must be ${expectedMembership}`);
    }
    const expectedCredits =
      !expectedMismatch &&
      expectedScope.kind !== 'LESSON' &&
      expectedScope.kind !== 'SECONDARY_APPLICATION';
    if (attachment.credits_kc_evidence !== expectedCredits) {
      say(`${attachmentId} credits_kc_evidence must be ${String(expectedCredits)}`);
    }
    const expectedDirection =
      expectedScope.kind === 'SECONDARY_APPLICATION'
        ? 'LESSON_TO_ATTACHMENT'
        : 'ATTACHMENT_TO_LESSON';
    if (attachment.relation_direction !== expectedDirection) {
      say(`${attachmentId} relation_direction must be ${expectedDirection}`);
    }
    const expectedRequiredDelivery =
      canonicalKind === 'CAPSTONE' && canonicalAttachment.delivery_state === 'required';
    if (attachment.required_delivery !== expectedRequiredDelivery) {
      say(`${attachmentId} required_delivery must be ${String(expectedRequiredDelivery)}`);
    }

    const deliveryEvidence = (canonicalAttachment.delivery_evidence ?? {}) as Row;
    const expectedRelationIds = new Set(stringRows(deliveryEvidence.source_relation_ids));
    if (canonicalKind === 'CAPSTONE') {
      for (const relationId of stringRows(sequenceRefs.capstone_placements)) {
        const relation = oneRelation(relationId);
        if (
          relation?.collection === 'module_delivery_event_relations' &&
          relation.row.target_capstone_id === attachmentId
        ) {
          expectedRelationIds.add(relationId);
        }
      }
    }
    const emittedRelationIds = strings(attachment.relation_ids);
    if (!sameStringSet(emittedRelationIds, [...expectedRelationIds])) {
      say(
        `${attachmentId} relation_ids are ${JSON.stringify(emittedRelationIds)}, canonical is ${JSON.stringify([...expectedRelationIds].sort())}`,
      );
    }
    const emittedClasses = new Set<string>();
    for (const relationId of emittedRelationIds) {
      const relation = ensureUniqueRelation(relationId, `attachment ${attachmentId}`);
      if (relation === null) continue;
      const klass = relationClass(relation);
      emittedClasses.add(klass);
      const directlyNamesAttachment =
        relation.row.target_capstone_id === attachmentId || relation.row.entity_id === attachmentId;
      const declaredByAttachment = stringRows(deliveryEvidence.source_relation_ids).includes(
        relationId,
      );
      const targetsOwningLesson =
        relation.row.target_lesson_id === ownerLessonId || relation.row.lesson_id === ownerLessonId;
      if (!directlyNamesAttachment && !declaredByAttachment) {
        say(
          `attachment relation ${relationId} does not name ${attachmentId} and is not declared by its canonical delivery evidence`,
        );
      }
      if (!directlyNamesAttachment && declaredByAttachment && !targetsOwningLesson) {
        say(
          `attachment relation ${relationId} does not bind ${attachmentId} to owning lesson ${ownerLessonId}`,
        );
      }
      if (
        relation.row.target_capstone_id === attachmentId &&
        (relation.row.owning_lesson_id !== ownerLessonId ||
          !sameStringSet(relation.row.component_kc_ids, declaredHostCoreIds))
      ) {
        say(
          `attachment relation ${relationId} does not match ${attachmentId}'s owning lesson and component source entity set`,
        );
      }
    }
    if (emittedClasses.size !== 1 || !emittedClasses.has(String(attachment.relation_class ?? ''))) {
      say(
        `${attachmentId} relation_class ${String(attachment.relation_class)} does not match canonical classes ${JSON.stringify([...emittedClasses])}`,
      );
    }

    const scope = object(attachment.host_scope);
    const kind = String(scope.kind ?? '');
    if (kind === 'SINGLE_KC' && !kcSet.has(String(scope.kc_id))) {
      say(`${attachmentId} hosts on ${String(scope.kc_id)}, which is not a KC of this lesson`);
    }
    if (kind === 'MULTI_KC') {
      for (const kcId of strings(scope.kc_ids)) {
        if (!kcSet.has(kcId)) {
          say(`${attachmentId} hosts on ${kcId}, which is not a KC of this lesson`);
        }
      }
    }
    if (kind === 'CAPSTONE') {
      for (const capstoneId of strings(scope.capstone_ids)) {
        if (!((lesson.capstone_ids ?? []) as string[]).includes(capstoneId)) {
          say(`${attachmentId} hosts on ${capstoneId}, which is not a capstone of this lesson`);
        }
      }
    }
    if (kind === 'SECONDARY_APPLICATION' && scope.primary_lesson_id === lessonId) {
      say(`${attachmentId} is secondary to the lesson that is displaying it`);
    }
    if (attachment.host_core_membership_status === 'MISMATCH_PROVISIONAL') mismatched += 1;
  }
  const lineage = object(packet.provisional_host_lineage);
  if (mismatched > 0 && lineage.present !== true) {
    say(
      `${mismatched} attachments carry a provisional host lineage and the packet does not say so`,
    );
  }
  if (mismatched === 0 && packet.provisional_host_lineage !== undefined) {
    say('the packet declares a provisional host lineage it has no attachment for');
  }

  const sanitization = object(packet.source_sanitization);
  const selected = records.reduce(
    (total, record) => total + objects(record.source_occurrences).length,
    0,
  );
  if (sanitization.considered_occurrence_count !== selected) {
    say(
      `source_sanitization counts ${String(sanitization.considered_occurrence_count)} occurrences where this packet selected ${selected}`,
    );
  }
  if (Number(sanitization.sanitized_raw_field_count ?? 0) > selected * 8) {
    say('source_sanitization reports more removed fields than the selected occurrences can hold');
  }

  const output = object(packet.output_requirements);
  const expectedAuthorable = `content/lesson-factory/packets/${lessonId}/task-source-packet.json`;
  if (output.authorable_packet_path !== expectedAuthorable) {
    say(`the author packet path for ${lessonId} is ${expectedAuthorable}`);
  }
  const authoritativeLane = allocated?.lane ?? laneId;
  if (status === 'READY') {
    if (surface !== 'AUTHORABLE') say('a READY packet is authorable');
    if (
      output.output_directory !==
      `.tmp/lesson-factory/${authoritativeLane}/${lessonId.toLowerCase()}`
    ) {
      say('a READY packet works in its own lane directory');
    }
  } else {
    if (surface !== 'QUARANTINE') say('a BLOCKED record is quarantined');
    const expectedQuarantine = `.tmp/lesson-factory/${authoritativeLane}/${lessonId.toLowerCase()}/quarantine/blocked-packet-audit.json`;
    if (output.output_directory !== expectedQuarantine) {
      say(`a BLOCKED record is written to ${expectedQuarantine}`);
    }
    if (packet.authorable_packet_ref !== null || packet.packet_content_sha256 !== null) {
      say('a BLOCKED record carries no authorable reference and no artifact digest');
    }
  }

  const frozenProfile = profile();
  const frozenPolicy = policy();
  for (const [field, expected] of [
    ['route_universe', ['STANDARD', 'CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']],
    ['route_proofs', frozenPolicy.route_proofs],
    ['required_human_review_roles', ['PRODUCT_PEDAGOGY_OWNER']],
    ['rubric_identity', frozenProfile.rubric_identity],
    ['nonclaims', frozenProfile.nonclaims],
    ['route_scope_code', frozenPolicy.route_scope_code],
    ['applicable_routes', frozenPolicy.applicable_routes],
    ['ratified_policy_version', frozenPolicy.policy_version],
  ] as const) {
    if (!sameJson(packet[field], expected)) {
      say(`${field} is not the exact frozen profile/policy value`);
    }
  }

  const crosswalkMappings = uniqueRowBy(rows(crosswalk().mappings), 'mapping_id');
  const crosswalkOccurrences = uniqueRowBy(
    rows(crosswalk().source_occurrences),
    'source_occurrence_id',
  );
  const receiptDecisions = uniqueRowBy(rows(sourceReceipt().source_decisions), 'source_id');
  const crosswalkAuthorityStatus = ((crosswalk().metadata as Row | undefined)?.authority ??
    {}) as Row;
  const blockFacts = objects(packet.block_reasons);

  for (const [recordIndex, record] of records.entries()) {
    const kcId = String(record.kc_id ?? '');
    const mappings = objects(record.source_mappings);
    const occurrenceRows = objects(record.source_occurrences);
    const occurrenceIds = occurrenceRows.map((occurrence) =>
      String(occurrence.source_occurrence_id ?? ''),
    );
    const occurrenceSet = new Set(occurrenceIds);
    const mappingPath = `/ordered_kc_records/${recordIndex}/source_mappings`;
    const explicitMappingBlocker = blockFacts.some(
      (reason) =>
        ['SOURCE_MAPPING_MISSING', 'SOURCE_MAPPING_CONTRADICTION'].includes(
          String(reason.code ?? ''),
        ) &&
        (reason.path === mappingPath || String(reason.path ?? '').startsWith(`${mappingPath}/`)),
    );

    if (mappings.length === 0) {
      if (status === 'READY') {
        say(`${kcId} is READY with an empty source_mappings array`);
      } else if (!explicitMappingBlocker) {
        say(
          `${kcId} has unresolved source_mappings in quarantine without an explicit blocker at ${mappingPath}`,
        );
      }
    }

    for (const mapping of mappings) {
      const mappingId = String(mapping.mapping_id ?? '');
      const canonicalMapping = crosswalkMappings.get(mappingId);
      if (canonicalMapping === undefined || canonicalMapping === null) {
        say(`${mappingId} does not resolve exactly once in the canonical source crosswalk`);
        continue;
      }
      if (
        canonicalMapping.target_id !== kcId ||
        canonicalMapping.target_type !== 'KC' ||
        ![undefined, 'direct', 'enabling'].includes(
          canonicalMapping.mapping_role as string | undefined,
        )
      ) {
        say(
          `mapping ${mappingId} is not canonically bound to ${kcId} as a direct or enabling KC mapping`,
        );
      }
      if (mapping.relation !== canonicalMapping.relation) {
        say(
          `mapping ${mappingId} relation ${String(mapping.relation)} is not canonical ${String(canonicalMapping.relation)}`,
        );
      }
      const canonicalOccurrenceIds = [
        ...new Set([
          ...stringRows(canonicalMapping.source_occurrence_ids),
          ...stringRows(canonicalMapping.direct_source_occurrence_ids),
        ]),
      ].sort();
      if (!sameStringSet(mapping.source_occurrence_ids, canonicalOccurrenceIds)) {
        say(
          `mapping ${mappingId} source_occurrence_ids are ${JSON.stringify(strings(mapping.source_occurrence_ids))}, canonical is ${JSON.stringify(canonicalOccurrenceIds)}`,
        );
      }
      for (const occurrenceId of strings(mapping.source_occurrence_ids)) {
        if (!occurrenceSet.has(occurrenceId)) {
          say(
            `mapping ${mappingId} cites ${occurrenceId}, which is orphaned from ${kcId}.source_occurrences`,
          );
        }
      }
    }

    const seenOccurrences = new Set<string>();
    for (const occurrence of occurrenceRows) {
      const occurrenceId = String(occurrence.source_occurrence_id ?? '');
      if (seenOccurrences.has(occurrenceId)) {
        say(`${kcId} carries source occurrence ${occurrenceId} more than once`);
      }
      seenOccurrences.add(occurrenceId);
      const canonicalOccurrence = crosswalkOccurrences.get(occurrenceId);
      if (canonicalOccurrence === undefined || canonicalOccurrence === null) {
        say(`${occurrenceId} does not resolve exactly once in the canonical source crosswalk`);
        continue;
      }
      const sourceId = String(canonicalOccurrence.source_id ?? '');
      const decision = receiptDecisions.get(sourceId);
      if (decision === undefined || decision === null) {
        say(`${occurrenceId} source ${sourceId} has no unique exact owner rights decision`);
        continue;
      }
      const allow = new Set(stringRows(decision.derived_field_allowlist));
      const expectedRights = decision.usable === true ? 'PERMITTED' : 'PROHIBITED';
      const expectedUse =
        expectedRights === 'PERMITTED' ? stringRows(decision.permitted_use_codes) : [];
      const expectedFields: Array<[string, unknown]> = [
        [
          'occurrence_kind',
          allow.has('occurrence_kind')
            ? canonicalOccurrence.occurrence_kind
            : 'UNSPECIFIED_OCCURRENCE',
        ],
        ['source_id', sourceId],
        ['source_class', decision.source_class],
        ['official_path', allow.has('official_path') ? canonicalOccurrence.official_path : []],
        [
          'official_topic',
          allow.has('official_topic') ? (canonicalOccurrence.official_topic ?? null) : null,
        ],
        ['printed_pages', allow.has('printed_pages') ? canonicalOccurrence.printed_pages : []],
        [
          'source_anchor_ids',
          allow.has('source_anchor_ids')
            ? (canonicalOccurrence.source_anchor_ids ??
              (canonicalOccurrence.source_anchor_id === undefined
                ? []
                : [canonicalOccurrence.source_anchor_id]))
            : [],
        ],
        [
          'derived_summary',
          allow.has('derived_summary') ? (canonicalOccurrence.source_summary ?? null) : null,
        ],
        [
          'scope_status',
          allow.has('scope_status') ? (canonicalOccurrence.scope_status ?? null) : null,
        ],
        ['rights_status', expectedRights],
        ['derived_fields_only', true],
        ['permitted_use', expectedUse],
      ];
      for (const [field, expected] of expectedFields) {
        if (!sameJson(occurrence[field], expected)) {
          say(
            `${occurrenceId}.${field} is ${canonicalJson(occurrence[field])}, canonical authority gives ${canonicalJson(expected)}`,
          );
        }
      }
      const authorityStatus = object(occurrence.authority_status);
      if (
        authorityStatus.source_id !== sourceId ||
        authorityStatus.present_day_authority_refreshed !==
          (crosswalkAuthorityStatus.present_day_authority_refreshed === true)
      ) {
        say(`${occurrenceId}.authority_status is not bound to source ${sourceId}`);
      }
      const expectedReceiptRef = expectedRights === 'PERMITTED' ? sourceReceiptRef() : null;
      if ((occurrence.source_use_receipt_ref ?? null) !== expectedReceiptRef) {
        say(`${occurrenceId}.source_use_receipt_ref is not the exact owner decision`);
      }
    }
  }

  const occurrences = records.flatMap((record) => objects(record.source_occurrences));
  const usedSourceIds = new Set(occurrences.map((occurrence) => String(occurrence.source_id)));
  const sourceDocuments = objects(packet.source_documents);
  const listedSourceIds = new Set(sourceDocuments.map((document) => String(document.source_id)));
  for (const sourceId of usedSourceIds) {
    if (!listedSourceIds.has(sourceId)) {
      say(`${sourceId} is used by an occurrence and is not in source_documents`);
    }
  }
  for (const sourceId of listedSourceIds) {
    if (!usedSourceIds.has(sourceId)) {
      say(`source_documents lists ${sourceId}, which no occurrence in this packet uses`);
    }
  }
  const expectedDocuments = [...usedSourceIds]
    .map((sourceId) => {
      const decision = receiptDecisions.get(sourceId);
      return {
        source_id: sourceId,
        source_class:
          decision === undefined || decision === null
            ? 'PRIVATE_COMPARISON'
            : decision.source_class,
        source_locator: CROSSWALK_PATH,
        present_day_authority_refreshed:
          crosswalkAuthorityStatus.present_day_authority_refreshed === true,
      };
    })
    .sort((left, right) => left.source_id.localeCompare(right.source_id));
  const sortedDocuments = [...sourceDocuments].sort((left, right) =>
    String(left.source_id).localeCompare(String(right.source_id)),
  );
  if (!sameJson(sortedDocuments, expectedDocuments)) {
    say('source_documents is not the exact source-document union selected by occurrences');
  }

  const usedAnchors = new Set(
    occurrences.flatMap((occurrence) => strings(occurrence.source_anchor_ids)),
  );
  const listedAnchors = new Set(strings(packet.source_anchors));
  for (const anchor of usedAnchors) {
    if (!listedAnchors.has(anchor)) say(`${anchor} is cited by an occurrence and not listed`);
  }
  for (const anchor of listedAnchors) {
    if (!usedAnchors.has(anchor)) say(`source_anchors lists ${anchor}, which nothing cites`);
  }

  const blocks = blockFacts;
  if (status === 'READY' && blocks.length > 0) {
    say(`a READY packet carries ${blocks.length} block reasons`);
  }
  if (status !== 'READY' && blocks.length === 0) {
    say('a BLOCKED record does not say why');
  }

  if (status === 'READY') {
    for (const record of records) {
      const occurrences = objects(record.source_occurrences);
      if (occurrences.length === 0) {
        say(`${String(record.kc_id)} is READY with no source occurrence`);
      }
      for (const occurrence of occurrences) {
        if (occurrence.rights_status !== 'PERMITTED') {
          say(
            `${String(occurrence.source_occurrence_id)} is ${String(occurrence.rights_status)} in a READY packet`,
          );
        }
      }
    }
  }

  return problems;
}
