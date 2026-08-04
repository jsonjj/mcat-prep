/**
 * The contract against the curriculum it is a contract for.
 *
 * Every identifier grammar in this freeze was written from the shape of an example. WP-04
 * ran the generator against all 114 canonical lessons and 422 knowledge components and
 * found that most of those shapes were guesses: the manifest calls a cluster
 * `V3-CL-006619` where the contract required `V3-GRP-NNNNNN`, uses six-digit phase,
 * module and pathway numbers where the contract required four, names relations
 * `R14-PL-581402-067` and `R14-REM-BB-002` where the contract required `R<n>-XX-NN`, and
 * types attachments as `V3-CAP-*`, `V3-EXT-*` and `V3-SUP-*` where the contract required a
 * single `V3-ATT-*`. Not one of the 111 assigned lessons could be written down.
 *
 * A contract that cannot represent the thing it governs is not strict, it is wrong, and
 * the temptation it creates is worse than the defect: rewrite the canonical identifiers
 * into the contract's preferred shape. That would replace curriculum identity with
 * invented identity, and every downstream trace back to the manifest would be a guess.
 *
 * So these tests are driven by the real curriculum bytes rather than by fixtures. They
 * fail if the contract stops being able to say what the curriculum says, and they fail if
 * it starts being able to say something the curriculum does not.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadRegistry, loadSchema, REPO_ROOT, schemaId } from './lesson-factory/contract-registry';
import { validateAgainst, type JsonObject } from './lesson-factory/json-schema-subset';
import {
  CANONICAL_ID_SETS,
  FROZEN_SOURCE_USE_RECEIPT_REF,
  GENERATION_SET,
  MANIFEST,
  OUT_OF_SCOPE_LESSONS,
  packetForLesson,
  SOURCE_DECISIONS,
  type CanonicalIdFamily,
  type SourceDecision,
} from './lesson-factory/curriculum-compat';

const VOCABULARY = 'shared-vocabulary.schema.json';
const PACKET = 'task-source-packet.schema.json';
const RECEIPT = 'owner-source-use-receipt.schema.json';

const registry = loadRegistry();

/** Validate one bare string against one vocabulary definition. */
const matches = (defName: string, value: string): boolean => {
  const def = loadSchema(VOCABULARY).$defs as JsonObject;
  const pattern = collectPatterns(def[defName], def);
  return pattern.some((expression) => new RegExp(expression).test(value));
};

/** Every alternative pattern a definition can be satisfied by, flattened one level. */
const collectPatterns = (node: unknown, defs: JsonObject): string[] => {
  if (node === null || typeof node !== 'object') return [];
  const record = node as Record<string, unknown>;
  if (typeof record.pattern === 'string') return [record.pattern];
  if (typeof record.$ref === 'string') {
    const name = record.$ref.split('/$defs/')[1];
    return name === undefined ? [] : collectPatterns(defs[name], defs);
  }
  for (const key of ['oneOf', 'anyOf', 'allOf']) {
    const branches = record[key];
    if (Array.isArray(branches)) return branches.flatMap((branch) => collectPatterns(branch, defs));
  }
  return [];
};

const FAMILIES: ReadonlyArray<[CanonicalIdFamily, string]> = [
  ['lesson_id', 'LessonId'],
  ['kc_id', 'KcId'],
  ['grouping_id', 'GroupingId'],
  ['phase_id', 'PhaseId'],
  ['module_id', 'ModuleId'],
  ['pathway_id', 'PathwayId'],
  ['attachment_id', 'AttachmentId'],
  ['relation_id', 'RelationId'],
  ['hold_id', 'HoldId'],
  ['source_occurrence_id', 'SourceOccurrenceId'],
  ['source_anchor_id', 'SourceAnchorId'],
];

describe('the contract can say what the curriculum says', () => {
  it('reads the curriculum the packets are cut from', () => {
    expect(MANIFEST.curriculum.lessons).toHaveLength(114);
    expect(MANIFEST.curriculum.kcs).toHaveLength(422);
  });

  it.each(FAMILIES)('accepts every canonical %s the curriculum uses', (family, defName) => {
    const values = CANONICAL_ID_SETS[family];
    expect(
      values.length,
      `${family} is empty; the inventory is not reading the manifest`,
    ).toBeGreaterThan(0);
    const rejected = values.filter((value) => !matches(defName, value));
    expect(
      rejected.slice(0, 12),
      `${defName} cannot represent ${rejected.length} of ${values.length} canonical ${family} values`,
    ).toEqual([]);
  });

  it.each(FAMILIES)('rejects a %s that is not one the curriculum issued', (family, defName) => {
    const real = CANONICAL_ID_SETS[family][0] as string;
    const forgeries = [
      `${real}-answer-key-is-c`,
      `answer-key-is-c-${real}`,
      real.replace(/[0-9]/g, 'x'),
      real.toLowerCase(),
      `${real} `,
      'official-rubric-pass',
      'V3-XXX-000001',
      `${real}0`,
    ];
    for (const forgery of forgeries) {
      expect(matches(defName, forgery), `${defName} accepted ${JSON.stringify(forgery)}`).toBe(
        false,
      );
    }
  });

  it('does not accept an identifier family the curriculum retired or never had', () => {
    // The four shapes the frozen contract used to require. Every one of them is absent
    // from the manifest, which is exactly why nothing could be written down.
    expect(matches('GroupingId', 'V3-GRP-006619')).toBe(false);
    expect(matches('PhaseId', 'V3-PHS-0001')).toBe(false);
    expect(matches('ModuleId', 'V3-MOD-0001')).toBe(false);
    expect(matches('AttachmentId', 'V3-ATT-004008')).toBe(false);
  });
});

describe('a packet for a real lesson', () => {
  it('writes V3-LES-006619 down whole, and it validates', () => {
    const packet = packetForLesson('V3-LES-006619');
    expect(packet.lesson_id).toBe('V3-LES-006619');
    expect(packet.grouping_id).toBe('V3-CL-006619');
    expect(validateAgainst(registry, schemaId(PACKET), packet)).toEqual([]);
  });

  it('writes down every lesson the allocation proof gives to a lane', () => {
    const failures: Array<[string, string]> = [];
    for (const lessonId of GENERATION_SET) {
      const errors = validateAgainst(registry, schemaId(PACKET), packetForLesson(lessonId));
      if (errors.length > 0) failures.push([lessonId, errors.slice(0, 3).join('; ')]);
    }
    expect(
      failures.slice(0, 5),
      `${failures.length} of ${GENERATION_SET.length} lessons cannot be written down`,
    ).toEqual([]);
  });

  /**
   * The other three are not blocked packets, they are lessons nobody has been given. The
   * distinction is worth a test because the projection used to erase it: it invented a lane, a
   * team and an assignment for them, and the resulting quarantine record was indistinguishable
   * from an allocation that had gone wrong rather than one that was never made.
   */
  it('reports the lessons outside the proof without inventing an allocation for them', () => {
    expect(GENERATION_SET).toHaveLength(111);
    expect(OUT_OF_SCOPE_LESSONS.map((row) => row.lesson_id)).toEqual([
      'V3-LES-130923',
      'V3-LES-789208',
      'V3-LES-844372',
    ]);
    expect(GENERATION_SET.length + OUT_OF_SCOPE_LESSONS.length).toBe(114);

    for (const { lesson_id: lessonId } of OUT_OF_SCOPE_LESSONS) {
      const diagnostic = packetForLesson(lessonId);
      expect(diagnostic.out_of_scope).toBe(true);
      for (const invented of ['lane_id', 'team_id', 'assignment_id', 'packet_id']) {
        expect(diagnostic[invented], `${lessonId} invented a ${invented}`).toBeUndefined();
      }
      // Not a packet, and it does not get to pass for one.
      expect(validateAgainst(registry, schemaId(PACKET), diagnostic)).not.toEqual([]);
    }
  });

  it('carries the facts an author cannot proceed without', () => {
    const packet = packetForLesson('V3-LES-006619');
    // WP-04's audit found these missing from the closed contract, which meant a generator
    // that had them had nowhere to put them and a packet that reached an author without.
    for (const field of [
      'packet_id',
      'packet_status',
      'assignment_id',
      'team_id',
      'lane_id',
      'identity',
      'input_hashes',
      'ordered_kc_records',
      'prerequisites',
      'placements',
      'attachments',
      'holds',
      'block_reasons',
      'research_evidence',
      'adaptive_policy',
      'dok_authoring',
      'output_requirements',
      'source_use_receipt_ref',
      'source_sanitization',
    ]) {
      expect(packet[field], `a packet with no ${field}`).toBeDefined();
    }
    const identity = packet.identity as JsonObject;
    for (const field of [
      'canonical_title',
      'short_alias',
      'lesson_type',
      'cluster_id',
      'content_categories',
      'foundational_concepts',
      'source_sections',
    ]) {
      expect(identity[field], `an identity with no ${field}`).toBeDefined();
    }
  });

  it('refuses a sanitization record whose count and codes disagree', () => {
    // The count is the evidence and the code is the claim. A packet carrying one without
    // the other is a removal a reviewer cannot check, which is the whole reason the
    // generator's audit had to stop being a side channel.
    const uncounted = {
      ...packetForLesson('V3-LES-006619'),
      source_sanitization: {
        trusted_canonical_input: false,
        sanitized_raw_field_count: 0,
        excluded_held_claim_count: 4,
        codes: [],
      },
    };
    expect(validateAgainst(registry, schemaId(PACKET), uncounted)).not.toEqual([]);

    const untrusted = {
      ...packetForLesson('V3-LES-006619'),
      source_sanitization: {
        trusted_canonical_input: false,
        sanitized_raw_field_count: 9,
        excluded_held_claim_count: 0,
        codes: ['TRUSTED_CANONICAL_RAW_FIELDS_SANITIZED'],
      },
    };
    expect(validateAgainst(registry, schemaId(PACKET), untrusted)).not.toEqual([]);
  });

  it('refuses an exam section the curriculum does not name', () => {
    const packet = packetForLesson('V3-LES-006619');
    const invented = {
      ...packet,
      identity: { ...(packet.identity as JsonObject), source_sections: ['Biology'] },
    };
    expect(validateAgainst(registry, schemaId(PACKET), invented)).not.toEqual([]);
  });

  it('can be written down blocked, on the surface a blocked record belongs to', () => {
    const packet = packetForLesson('V3-LES-006619');
    const requirements = packet.output_requirements as JsonObject;
    const blocked = {
      ...packet,
      packet_status: 'BLOCKED',
      packet_surface: 'QUARANTINE',
      block_reasons: [
        {
          code: 'SOURCE_RIGHTS_UNCLEARED',
          path: '/ordered_kc_records/0/source_occurrences/0',
          message: 'no rights admission covers this occurrence',
        },
      ],
      output_requirements: {
        ...requirements,
        output_directory: `${String(requirements.output_directory)}/quarantine/blocked-packet-audit.json`,
      },
    };
    expect(validateAgainst(registry, schemaId(PACKET), blocked)).toEqual([]);
  });

  it('refuses a packet that reports no status for its own generation', () => {
    const { packet_status: _dropped, ...statusless } = packetForLesson('V3-LES-006619');
    expect(validateAgainst(registry, schemaId(PACKET), statusless)).not.toEqual([]);
  });

  it('refuses a READY packet that also carries a reason it was blocked', () => {
    const contradictory = {
      ...packetForLesson('V3-LES-006619'),
      packet_status: 'READY',
      block_reasons: [
        { code: 'SOURCE_RIGHTS_UNCLEARED', path: '/x', message: 'blocked and ready at once' },
      ],
    };
    expect(validateAgainst(registry, schemaId(PACKET), contradictory)).not.toEqual([]);
  });

  it('refuses a BLOCKED packet that gives no reason', () => {
    const silent = {
      ...packetForLesson('V3-LES-006619'),
      packet_status: 'BLOCKED',
      block_reasons: [],
    };
    expect(validateAgainst(registry, schemaId(PACKET), silent)).not.toEqual([]);
  });
});

/**
 * Round 9 reported 18 hard prerequisites with no relation to cite and called it curriculum
 * debt. It was not: the helper resolved a graph edge to a lesson by asking which lesson owned
 * the endpoint knowledge component, and 71 of the 143 canonical `HARD_PREREQUISITE` edges have
 * a capstone at one end. A capstone is not a knowledge component, so the lookup missed, the
 * pair indexed under the raw capstone identifier, and the prerequisite looked unevidenced.
 *
 * WP-04 does not have this defect. It tests membership against the whole entity set of each
 * lesson — the lesson, its ordered knowledge components, its capstones, extensions and
 * supports — and the join here is now the same one. These tests pin the edges that were always
 * there, so that a helper that stops finding them is a failure rather than a report of debt.
 */
describe('a hard prerequisite is evidenced by the edges the graph already has', () => {
  const hardOf = (lessonId: string): JsonObject[] =>
    ((packetForLesson(lessonId).prerequisites as JsonObject).hard ?? []) as JsonObject[];

  const relationsFor = (prerequisiteId: string, dependentId: string): string[] => {
    const row = hardOf(dependentId).find((entry) => entry.lesson_id === prerequisiteId);
    return ((row?.relation_ids ?? []) as string[]).slice().sort();
  };

  /**
   * The 18 pairs round 9 could not evidence, and the forward edges that evidence them. Six
   * pairs are carried by more than one edge, so 18 blocked prerequisites resolve to 22 edges.
   * Written out rather than derived: a list computed by the same join it is checking would
   * agree with the join whatever the join did.
   */
  const RESTORED: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['V3-LES-474771', 'V3-LES-006619', ['V3-EDG-103186']],
    ['V3-LES-252091', 'V3-LES-034099', ['V3-EDG-653998']],
    ['V3-LES-560768', 'V3-LES-041222', ['V3-EDG-145568', 'V3-EDG-407357']],
    ['V3-LES-191933', 'V3-LES-095827', ['V3-EDG-585563']],
    ['V3-LES-556584', 'V3-LES-095827', ['V3-EDG-768381']],
    ['V3-LES-315313', 'V3-LES-191915', ['V3-EDG-163436', 'V3-EDG-472444', 'V3-EDG-760962']],
    ['V3-LES-540203', 'V3-LES-258629', ['V3-EDG-798382']],
    ['V3-LES-386478', 'V3-LES-269427', ['V3-EDG-192746']],
    ['V3-LES-323416', 'V3-LES-563427', ['V3-EDG-155898']],
    ['V3-LES-020428', 'V3-LES-567976', ['V3-EDG-953372']],
    ['V3-LES-320512', 'V3-LES-774232', ['V3-EDG-776050']],
    ['V3-LES-567976', 'V3-LES-774232', ['V3-EDG-505125']],
    ['V3-LES-094421', 'V3-LES-788522', ['V3-EDG-381922', 'V3-EDG-677253']],
    ['V3-LES-264096', 'V3-LES-804390', ['V3-EDG-413554']],
    ['V3-LES-310043', 'V3-LES-804390', ['V3-EDG-348448']],
    ['V3-LES-930899', 'V3-LES-804390', ['V3-EDG-954025']],
    ['V3-LES-338400', 'V3-LES-811780', ['V3-EDG-924830']],
    ['V3-LES-615860', 'V3-LES-811780', ['V3-EDG-230453']],
  ];

  it.each(RESTORED)('cites the canonical edges for %s -> %s', (prerequisite, dependent, edges) => {
    expect(relationsFor(prerequisite, dependent)).toEqual([...edges].sort());
  });

  it('leaves no hard prerequisite in the whole curriculum without a relation', () => {
    const unevidenced: string[] = [];
    for (const lessonId of GENERATION_SET) {
      for (const row of hardOf(lessonId)) {
        if (((row.relation_ids ?? []) as string[]).length === 0) {
          unevidenced.push(`${String(row.lesson_id)} -> ${lessonId}`);
        }
      }
    }
    expect(unevidenced, `${unevidenced.length} hard prerequisites cite nothing`).toEqual([]);
  });

  it('reaches a capstone from a capstone, which the knowledge-component join could not', () => {
    // V3-EDG-585563 runs V3-CAP-765371 -> V3-CAP-039718. Neither end is a KC, so under the old
    // join neither end resolved to a lesson and the edge was invisible from both sides.
    expect(relationsFor('V3-LES-191933', 'V3-LES-095827')).toEqual(['V3-EDG-585563']);
  });

  it('reaches a knowledge component from a capstone', () => {
    // V3-EDG-768381 runs V3-CAP-218541 -> V3-KC-799926: the only canonical edge of that shape.
    expect(relationsFor('V3-LES-556584', 'V3-LES-095827')).toEqual(['V3-EDG-768381']);
  });

  it('reaches a capstone from a knowledge component', () => {
    // V3-EDG-103186 runs V3-KC-937306 -> V3-CAP-502257, the commonest shape: 67 of the 143.
    expect(relationsFor('V3-LES-474771', 'V3-LES-006619')).toEqual(['V3-EDG-103186']);
  });

  it('keeps two lessons that feed one shared capstone apart', () => {
    // V3-CAP-481386 belongs to four lessons at once. Two of them are prerequisites of
    // V3-LES-774232 through it, by different edges, and a join that resolved the capstone to a
    // single owning lesson would have to give both pairs the same answer or neither.
    expect(relationsFor('V3-LES-320512', 'V3-LES-774232')).toEqual(['V3-EDG-776050']);
    expect(relationsFor('V3-LES-567976', 'V3-LES-774232')).toEqual(['V3-EDG-505125']);
  });

  it('gives three prerequisites of one lesson three different edges into its capstone', () => {
    const into804390 = ['V3-LES-264096', 'V3-LES-310043', 'V3-LES-930899'].map((prerequisite) =>
      relationsFor(prerequisite, 'V3-LES-804390'),
    );
    expect(into804390).toEqual([['V3-EDG-413554'], ['V3-EDG-348448'], ['V3-EDG-954025']]);
  });

  it('does not cite an edge that runs the wrong way', () => {
    // V3-EDG-935230 runs V3-CAP-945802 -> V3-CAP-502257, out of V3-LES-006619 rather than into
    // it. Direction is the whole content of a prerequisite, so a reverse edge is not evidence.
    const cited = hardOf('V3-LES-006619').flatMap((row) => (row.relation_ids ?? []) as string[]);
    expect(cited).not.toContain('V3-EDG-935230');
  });

  it('keeps the normalized sequence relations it was already citing', () => {
    // Three pairs are carried by an R14 point-of-use relation as well as by their edges. Those
    // were the pairs the old join happened to resolve, and widening the entity set must not
    // drop them.
    expect(relationsFor('V3-LES-765609', 'V3-LES-631100')).toContain('R14-SM-011');
    expect(relationsFor('V3-LES-128144', 'V3-LES-773665')).toContain('R14-SM-044');
    expect(relationsFor('V3-LES-128144', 'V3-LES-788522')).toContain('R14-SM-021');
  });
});

/**
 * A knowledge component's mappings are the crosswalk's statement of which source material
 * teaches it, and until now this projection wrote `source_mappings: []` for all 422 of them.
 * An empty array is not a neutral placeholder: the contract requires the field, so an empty one
 * is a packet asserting that nothing in the source material maps to this knowledge component,
 * which is false for every single one of them. The crosswalk has 1,002 direct and enabling
 * mappings covering all 422.
 *
 * These tests read the crosswalk directly rather than through the helper, so a helper that
 * stops deriving mappings, derives them from somewhere else, or invents one, fails.
 */
describe('every knowledge component carries the mappings the crosswalk gives it', () => {
  const CROSSWALK = JSON.parse(
    readFileSync(
      join(REPO_ROOT, '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json'),
      'utf8',
    ),
  ) as { mappings: JsonObject[]; source_occurrences: JsonObject[] };

  /** The direct and enabling KC mappings of the crosswalk, which are the admissible ones. */
  const canonicalMappingsFor = (kcId: string): JsonObject[] =>
    CROSSWALK.mappings.filter(
      (row) =>
        row.target_type === 'KC' &&
        row.target_id === kcId &&
        ['direct', 'enabling', undefined].includes(row.mapping_role as string | undefined),
    );

  const occurrenceById = new Map(
    CROSSWALK.source_occurrences.map((row) => [String(row.source_occurrence_id), row]),
  );

  const kcRecordsOf = (lessonId: string): JsonObject[] =>
    packetForLesson(lessonId).ordered_kc_records as JsonObject[];

  const everyKcRecord = (): JsonObject[] =>
    GENERATION_SET.flatMap((lessonId) => kcRecordsOf(lessonId));

  it('gives all 422 at least one mapping, and none of them zero', () => {
    const empty = everyKcRecord()
      .filter((record) => (record.source_mappings as JsonObject[]).length === 0)
      .map((record) => String(record.kc_id));
    expect([...new Set(empty)].slice(0, 8), `${empty.length} records map to nothing`).toEqual([]);
  });

  it('cites exactly the canonical mapping identifiers, in a deterministic order', () => {
    const wrong: string[] = [];
    for (const record of everyKcRecord()) {
      const kcId = String(record.kc_id);
      const cited = (record.source_mappings as JsonObject[]).map((row) => String(row.mapping_id));
      const canonical = canonicalMappingsFor(kcId)
        .map((row) => String(row.mapping_id))
        .sort();
      if (JSON.stringify(cited) !== JSON.stringify(canonical)) {
        wrong.push(`${kcId}: ${JSON.stringify(cited)} != ${JSON.stringify(canonical)}`);
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} records cite the wrong mappings`).toEqual([]);
  });

  it('copies the relation and the occurrence set from the crosswalk, not from anywhere else', () => {
    const wrong: string[] = [];
    for (const record of everyKcRecord()) {
      for (const mapping of record.source_mappings as JsonObject[]) {
        const id = String(mapping.mapping_id);
        const canonical = CROSSWALK.mappings.find((row) => row.mapping_id === id);
        if (canonical === undefined) {
          wrong.push(`${id} is not in the crosswalk at all`);
          continue;
        }
        if (mapping.relation !== canonical.relation) {
          wrong.push(`${id} relation ${String(mapping.relation)}`);
        }
        const expected = [
          ...new Set([
            ...((canonical.source_occurrence_ids ?? []) as string[]),
            ...((canonical.direct_source_occurrence_ids ?? []) as string[]),
          ]),
        ].sort();
        const actual = [...(mapping.source_occurrence_ids as string[])].sort();
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          wrong.push(`${id} occurrences ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
        }
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} mappings disagree with the crosswalk`).toEqual([]);
  });

  it('orphans nothing: every occurrence a mapping cites is an occurrence the record carries', () => {
    const orphans: string[] = [];
    for (const record of everyKcRecord()) {
      const carried = new Set(
        (record.source_occurrences as JsonObject[]).map((row) => String(row.source_occurrence_id)),
      );
      for (const mapping of record.source_mappings as JsonObject[]) {
        for (const occurrenceId of mapping.source_occurrence_ids as string[]) {
          if (!carried.has(occurrenceId)) {
            orphans.push(`${String(record.kc_id)} <- ${occurrenceId}`);
          }
        }
      }
    }
    expect(orphans.slice(0, 5), `${orphans.length} cited occurrences are orphaned`).toEqual([]);
  });

  it('carries no occurrence that neither the crosswalk nor the manifest binds to the record', () => {
    // The reverse of the orphan test. Two authorities name the occurrences of a knowledge
    // component and they disagree — 182 of the mapped ones are missing from the manifest's
    // list and 28 of the manifest's carry no mapping — so the record takes the union. What it
    // must not take is anything outside the union, which would be an occurrence belonging to
    // some other knowledge component.
    const kcById = new Map(
      ((MANIFEST.curriculum as JsonObject).kcs as JsonObject[]).map((row) => [
        String(row.kc_id),
        row,
      ]),
    );
    const foreign: string[] = [];
    for (const record of everyKcRecord()) {
      const kcId = String(record.kc_id);
      const admissible = new Set([
        ...(((kcById.get(kcId)?.direct_source_occurrence_ids ?? []) as string[]) ?? []),
        ...canonicalMappingsFor(kcId).flatMap((mapping) => [
          ...((mapping.source_occurrence_ids ?? []) as string[]),
          ...((mapping.direct_source_occurrence_ids ?? []) as string[]),
        ]),
      ]);
      for (const occurrence of record.source_occurrences as JsonObject[]) {
        const id = String(occurrence.source_occurrence_id);
        if (!admissible.has(id)) foreign.push(`${kcId} <- ${id}`);
      }
    }
    expect(foreign.slice(0, 5), `${foreign.length} occurrences belong to no authority`).toEqual([]);
  });

  it('gives every occurrence the official path the crosswalk records', () => {
    // The receipt allows `official_path` for all thirteen sources and the contract requires at
    // least one segment, so an occurrence with no path is one this projection did not read.
    const wrong: string[] = [];
    for (const record of everyKcRecord()) {
      for (const occurrence of record.source_occurrences as JsonObject[]) {
        const id = String(occurrence.source_occurrence_id);
        const canonical = occurrenceById.get(id);
        const expected = (canonical?.official_path ?? []) as string[];
        const actual = (occurrence.official_path ?? []) as string[];
        if (JSON.stringify(actual) !== JSON.stringify(expected) || actual.length === 0) {
          wrong.push(`${id}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
        }
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} occurrences have the wrong path`).toEqual([]);
  });

  it('reads anchors and summaries from the crosswalk, under the receipt for that exact source', () => {
    const wrong: string[] = [];
    for (const record of everyKcRecord()) {
      for (const occurrence of record.source_occurrences as JsonObject[]) {
        const id = String(occurrence.source_occurrence_id);
        const canonical = occurrenceById.get(id)!;
        const decision = SOURCE_DECISIONS.find(
          (row) => row.source_id === String(canonical.source_id),
        );
        const allows = (field: string): boolean =>
          decision?.derived_field_allowlist.includes(field) === true;
        // A teachable topic lists its anchors; an anchor occurrence is one. Both are canonical
        // and a projection that reads only the plural form drops 110 of the 272.
        const canonicalAnchors = (canonical.source_anchor_ids ??
          (canonical.source_anchor_id === undefined
            ? []
            : [canonical.source_anchor_id])) as string[];
        const expectedAnchors = allows('source_anchor_ids') ? canonicalAnchors : [];
        const expectedSummary = allows('derived_summary')
          ? ((canonical.source_summary ?? null) as string | null)
          : null;
        if (
          JSON.stringify(occurrence.source_anchor_ids) !== JSON.stringify(expectedAnchors) ||
          (occurrence.derived_summary ?? null) !== expectedSummary
        ) {
          wrong.push(id);
        }
      }
    }
    expect(wrong.slice(0, 5), `${wrong.length} occurrences misreport derived fields`).toEqual([]);
  });

  it('keeps the multi-source records multi-source rather than collapsing them', () => {
    const multi = everyKcRecord().filter(
      (record) => (record.source_occurrences as JsonObject[]).length > 1,
    );
    expect(multi.length).toBeGreaterThan(0);
    for (const record of multi) {
      expect(record.source_set_status).toBe('MULTI_SOURCE_CORROBORATED');
    }
  });

  it('carries no crosswalk field the receipt does not allow, and no source text', () => {
    const permitted = new Set([
      'source_occurrence_id',
      'occurrence_kind',
      'source_id',
      'source_class',
      'official_path',
      'official_topic',
      'printed_pages',
      'source_anchor_ids',
      'derived_summary',
      'scope_status',
      'authority_status',
      'rights_status',
      'derived_fields_only',
      'permitted_use',
      'permission_receipt_refs',
      'source_use_receipt_ref',
    ]);
    const leaked = new Set<string>();
    for (const record of everyKcRecord()) {
      for (const occurrence of record.source_occurrences as JsonObject[]) {
        for (const key of Object.keys(occurrence)) if (!permitted.has(key)) leaked.add(key);
      }
      for (const mapping of record.source_mappings as JsonObject[]) {
        for (const key of Object.keys(mapping)) {
          if (!['mapping_id', 'relation', 'source_occurrence_ids'].includes(key)) leaked.add(key);
        }
      }
    }
    // `source_summary` is the crosswalk's own prose and `aamc_pages` its raw page list; both
    // would arrive by spreading a crosswalk row rather than reading named fields off it.
    expect([...leaked]).toEqual([]);
  });
});

describe('the owner source-use decision, and what it does not decide', () => {
  const receipt = (): JsonObject =>
    JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json'),
        'utf8',
      ),
    ) as JsonObject;

  it('is a closed, versioned artifact validated by its own contract', () => {
    expect(validateAgainst(registry, schemaId(RECEIPT), receipt())).toEqual([]);
  });

  it('permits derived scope metadata and original prose, and nothing else', () => {
    expect(receipt().permitted_use_codes).toEqual([
      'DERIVED_SCOPE_METADATA',
      'ORIGINAL_PROSE_FROM_UNCOPYRIGHTABLE_FACTS',
      'INTERNAL_HUMAN_REVIEW',
    ]);
  });

  it('prohibits the uses that would copy somebody else\u2019s work', () => {
    const prohibited = receipt().prohibited_use_codes as string[];
    for (const code of [
      'RAW_SOURCE_TEXT',
      'QUOTATION',
      'PASSAGE_REPRODUCTION',
      'FIGURE_REPRODUCTION',
      'PROPRIETARY_ITEM_REUSE',
      'PRIVATE_COMPARISON_CONTENT',
      'EXTERNAL_DISTRIBUTION',
      'MODEL_CALIBRATION',
      'EXCERPT_STORAGE',
    ]) {
      expect(prohibited, `the receipt does not prohibit ${code}`).toContain(code);
    }
  });

  it('cannot be read as approving a lesson', () => {
    const nonclaims = receipt().nonclaims as JsonObject;
    for (const claim of Object.keys(nonclaims)) expect(nonclaims[claim]).toBe(false);
    expect((receipt().decision_scope as JsonObject).grants_lesson_approval).toBe(false);
    expect((receipt().decision_scope as JsonObject).grants_external_source_copying).toBe(false);
    expect((receipt().decision_scope as JsonObject).is_legal_advice).toBe(false);
    expect((receipt().decision_scope as JsonObject).is_third_party_license).toBe(false);
  });

  it('refuses a receipt that quietly grants approval', () => {
    for (const pointer of [
      'grants_lesson_approval',
      'grants_external_source_copying',
      'is_legal_advice',
      'is_third_party_license',
    ]) {
      const forged = receipt();
      forged.decision_scope = { ...(forged.decision_scope as JsonObject), [pointer]: true };
      expect(
        validateAgainst(registry, schemaId(RECEIPT), forged),
        `a receipt that sets ${pointer} true`,
      ).not.toEqual([]);
    }
  });

  it('refuses a receipt that permits a use it also prohibits', () => {
    const forged = receipt();
    forged.permitted_use_codes = [
      'DERIVED_SCOPE_METADATA',
      'ORIGINAL_PROSE_FROM_UNCOPYRIGHTABLE_FACTS',
      'INTERNAL_HUMAN_REVIEW',
      'RAW_SOURCE_TEXT',
    ];
    expect(validateAgainst(registry, schemaId(RECEIPT), forged)).not.toEqual([]);
  });
});

describe('a source is permitted under one receipt, for bounded fields only', () => {
  const packetWith = (record: JsonObject): JsonObject => {
    const packet = packetForLesson('V3-LES-006619');
    const kcRecords = packet.ordered_kc_records as JsonObject[];
    const first = { ...(kcRecords[0] as JsonObject) };
    first.source_occurrences = [record];
    return { ...packet, ordered_kc_records: [first, ...kcRecords.slice(1)] };
  };

  /** The first real occurrence this lesson's knowledge components draw on. */
  const permitted = (): JsonObject => {
    const packet = packetForLesson('V3-LES-006619');
    for (const record of packet.ordered_kc_records as JsonObject[]) {
      const [first] = record.source_occurrences as JsonObject[];
      if (first !== undefined) return { ...first };
    }
    throw new Error('V3-LES-006619 has no source occurrence to test the rights rules against');
  };

  /** The owner's decision for whatever source id that first occurrence happens to cite. */
  const decision = (): SourceDecision => {
    const sourceId = String(permitted().source_id);
    const row = SOURCE_DECISIONS.find((candidate) => candidate.source_id === sourceId);
    if (row === undefined) throw new Error(`the receipt decides nothing about ${sourceId}`);
    return row;
  };

  it('projects each occurrence at the rights the receipt records for its exact source id', () => {
    const occurrence = permitted();
    expect(occurrence.source_class).toBe(decision().source_class);
    expect(occurrence.rights_status).toBe(decision().usable ? 'PERMITTED' : 'PENDING');
    expect(occurrence.permitted_use).toEqual(
      decision().usable ? decision().permitted_use_codes : [],
    );
  });

  it('admits a source under the receipt when only its allowlisted derived fields are used', () => {
    expect(validateAgainst(registry, schemaId(PACKET), packetWith(permitted()))).toEqual([]);
  });

  it('refuses a permitted source that reaches past the derived fields', () => {
    const record = { ...permitted(), derived_fields_only: false };
    expect(validateAgainst(registry, schemaId(PACKET), packetWith(record))).not.toEqual([]);
  });

  it('refuses a permitted source that claims a use the receipt does not grant', () => {
    for (const use of ['EXCERPT_STORAGE', 'MODEL_CALIBRATION', 'EXTERNAL_DISTRIBUTION']) {
      const record = { ...permitted(), permitted_use: [use] };
      expect(
        validateAgainst(registry, schemaId(PACKET), packetWith(record)),
        `a source permitted for ${use}`,
      ).not.toEqual([]);
    }
  });

  /**
   * The correction this round is about: a class is a property of a source id, not a claim
   * a packet gets to make. Every id in the receipt is tried against every class that is
   * not its own, so the rule is proven for the whole table rather than for one row.
   */
  it('refuses every source id claiming a class the receipt did not give it', () => {
    const classes = ['REPOSITORY', 'PUBLIC_PRIMARY_RESEARCH', 'PRIVATE_COMPARISON'];
    for (const row of SOURCE_DECISIONS) {
      for (const wrong of classes.filter((klass) => klass !== row.source_class)) {
        const record = { ...permitted(), source_id: row.source_id, source_class: wrong };
        expect(
          validateAgainst(registry, schemaId(PACKET), packetWith(record)),
          `${row.source_id} filed as ${wrong} rather than ${row.source_class}`,
        ).not.toEqual([]);
      }
    }
  });

  it('never permits the source ids the receipt refuses', () => {
    for (const row of SOURCE_DECISIONS.filter((candidate) => !candidate.usable)) {
      const record = {
        ...permitted(),
        source_id: row.source_id,
        source_class: row.source_class,
        rights_status: 'PERMITTED',
        derived_fields_only: true,
        permitted_use: ['DERIVED_SCOPE_METADATA'],
        source_use_receipt_ref: FROZEN_SOURCE_USE_RECEIPT_REF,
      };
      expect(
        validateAgainst(registry, schemaId(PACKET), packetWith(record)),
        `${row.source_id} permitted despite the receipt`,
      ).not.toEqual([]);
    }
  });

  it('refuses a permitted source pinned to a receipt nobody ratified', () => {
    const record = {
      ...permitted(),
      source_use_receipt_ref: `source-use-receipt:content/lesson-factory/deadline-profile/owner-source-use-receipt.json#sha256:${'ab'.repeat(32)}`,
    };
    expect(validateAgainst(registry, schemaId(PACKET), packetWith(record))).not.toEqual([]);
  });

  it('has no field in which to put raw source text', () => {
    const record = { ...permitted(), exact_text: 'Verbatim sentence from the source document.' };
    expect(validateAgainst(registry, schemaId(PACKET), packetWith(record))).not.toEqual([]);
  });
});

/**
 * An attachment's host is the thing inside a lesson it hangs off, and the v5 contract makes it a
 * closed discriminated union because the four answers are genuinely different: the lesson as a
 * whole, one knowledge component, several, a capstone, or somebody else's lesson borrowing it.
 *
 * The risk in projecting these is not inventing a host, it is quietly narrowing one — filtering
 * a capstone's declared components down to the ones this lesson happens to teach and then
 * reporting the filtered list as the declared set. A capstone coordinates components several
 * lessons taught; that is what it is for. The declared set and the host set are two different
 * facts and both have to survive.
 */
describe('the host of an attachment, at the cardinality the curriculum gives it', () => {
  const attachmentsOf = (lessonId: string): JsonObject[] =>
    packetForLesson(lessonId).attachments as JsonObject[];

  const everyAttachment = (): Array<[string, JsonObject]> =>
    GENERATION_SET.flatMap((lessonId) =>
      attachmentsOf(lessonId).map((row) => [lessonId, row] as [string, JsonObject]),
    );

  const scopeOf = (lessonId: string, attachmentId: string): JsonObject =>
    attachmentsOf(lessonId).find((row) => row.attachment_id === attachmentId)
      ?.host_scope as JsonObject;

  it('projects all 154 attachment occurrences the generation set references', () => {
    // 157 across the whole curriculum; the three lessons outside the allocation proof account
    // for the other three, and they have no packet to carry them.
    expect(everyAttachment()).toHaveLength(154);
  });

  it('resolves every host to one of the closed discriminator branches', () => {
    const kinds = new Set(
      everyAttachment().map(([, row]) => String((row.host_scope as JsonObject).kind)),
    );
    for (const kind of kinds) {
      expect(['LESSON', 'SINGLE_KC', 'MULTI_KC', 'CAPSTONE', 'SECONDARY_APPLICATION']).toContain(
        kind,
      );
    }
  });

  it('gives the cardinalities the curriculum actually has', () => {
    const counts = new Map<string, number>();
    for (const [, row] of everyAttachment()) {
      const kind = String((row.host_scope as JsonObject).kind);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(Object.fromEntries([...counts].sort())).toEqual({
      LESSON: 15,
      MULTI_KC: 63,
      SECONDARY_APPLICATION: 50,
      SINGLE_KC: 26,
    });
    // CAPSTONE is the one inhabited-by-nothing branch: it needs an extension declaring no host
    // cores and a capstone this lesson owns, and no canonical record does both. It is asserted
    // absent rather than quietly assumed present, so the day one appears this test says so.
    expect(counts.get('CAPSTONE')).toBeUndefined();
  });

  it('keeps a capstone\u2019s declared components whole when none of them is local', () => {
    // V3-CAP-502257 is owned by V3-LES-006619 and coordinates four components, not one of
    // which is a knowledge component of that lesson. The host is therefore the lesson. The
    // declared set is still four: filtering it to the local ones would leave it empty and
    // report that as what the curriculum declared, which it is not.
    const attachment = attachmentsOf('V3-LES-006619').find(
      (row) => row.attachment_id === 'V3-CAP-502257',
    )!;
    expect(attachment.declared_host_core_ids).toEqual([
      'V3-KC-937306',
      'V3-KC-175515',
      'V3-KC-146592',
      'V3-KC-928546',
    ]);
    expect(attachment.host_scope).toEqual({ kind: 'LESSON' });
    // A lesson-level host credits no knowledge component, but this is not a lineage mismatch:
    // coordinating components other lessons taught is what a capstone is for.
    expect(attachment.credits_kc_evidence).toBe(false);
    expect(attachment.host_core_membership_status).toBe('RESOLVED');
  });

  it('hosts a capstone on its local components while declaring all of them', () => {
    // 32 capstones declare more components than their owning lesson teaches. The hosts are the
    // local ones and the declared set is all of them; conflating the two loses whichever fact
    // it was that got overwritten.
    for (const [lessonId, capstoneId, declared, hosts] of [
      ['V3-LES-403395', 'V3-CAP-004008', 5, ['V3-KC-682857', 'V3-KC-174089']],
      [
        'V3-LES-269427',
        'V3-CAP-027756',
        9,
        ['V3-KC-717751', 'V3-KC-795113', 'V3-KC-521064', 'V3-KC-188841'],
      ],
      ['V3-LES-404423', 'V3-CAP-028265', 10, ['V3-KC-921385', 'V3-KC-946152', 'V3-KC-404327']],
    ] as ReadonlyArray<readonly [string, string, number, readonly string[]]>) {
      const attachment = attachmentsOf(lessonId).find((row) => row.attachment_id === capstoneId)!;
      expect((attachment.declared_host_core_ids as string[]).length).toBe(declared);
      expect(attachment.host_scope).toEqual({ kind: 'MULTI_KC', kc_ids: [...hosts] });
      expect(attachment.credits_kc_evidence).toBe(true);
    }
  });

  it('hands a capstone owned elsewhere to the borrowing lesson as a secondary application', () => {
    // V3-CAP-502257 is owned by V3-LES-006619 and referenced by three other lessons. From
    // theirs the host is not a knowledge component of theirs, it is somebody else's lesson.
    for (const lessonId of ['V3-LES-034099', 'V3-LES-474771', 'V3-LES-710436']) {
      expect(scopeOf(lessonId, 'V3-CAP-502257')).toEqual({
        kind: 'SECONDARY_APPLICATION',
        primary_lesson_id: 'V3-LES-006619',
      });
    }
  });

  it('keeps all three provisional lineage mismatches, at lesson level, crediting nothing', () => {
    const MISMATCHES: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      ['V3-LES-191915', 'V3-EXT-647243', ['V3-KC-115894']],
      ['V3-LES-329622', 'V3-EXT-072959', ['V3-KC-922672']],
      ['V3-LES-495267', 'V3-EXT-176907', ['V3-KC-092280', 'V3-KC-102285', 'V3-KC-434142']],
    ];
    for (const [lessonId, attachmentId, cores] of MISMATCHES) {
      const attachment = attachmentsOf(lessonId).find((row) => row.attachment_id === attachmentId)!;
      expect(attachment.host_scope, `${attachmentId} host`).toEqual({ kind: 'LESSON' });
      expect(attachment.host_core_membership_status).toBe('MISMATCH_PROVISIONAL');
      expect(attachment.credits_kc_evidence, `${attachmentId} credits`).toBe(false);
      // The declared cores survive the mismatch. They are the evidence that there is one.
      expect(attachment.declared_host_core_ids).toEqual([...cores]);
    }
    const provisional = everyAttachment().filter(
      ([, row]) => row.host_core_membership_status === 'MISMATCH_PROVISIONAL',
    );
    expect(provisional).toHaveLength(3);
  });

  it('credits knowledge-component evidence only where a component really is the host', () => {
    for (const [, attachment] of everyAttachment()) {
      const kind = String((attachment.host_scope as JsonObject).kind);
      const credits = attachment.credits_kc_evidence === true;
      expect(credits, `${String(attachment.attachment_id)} at ${kind}`).toBe(
        ['SINGLE_KC', 'MULTI_KC', 'CAPSTONE'].includes(kind) &&
          attachment.host_core_membership_status === 'RESOLVED',
      );
    }
  });

  it('points the relation at the lesson except where the lesson is the borrower', () => {
    for (const [, attachment] of everyAttachment()) {
      const kind = String((attachment.host_scope as JsonObject).kind);
      expect(attachment.relation_direction).toBe(
        kind === 'SECONDARY_APPLICATION' ? 'LESSON_TO_ATTACHMENT' : 'ATTACHMENT_TO_LESSON',
      );
    }
  });
});
