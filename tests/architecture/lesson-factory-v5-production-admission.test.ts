import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import type { ValidateFunction } from 'ajv';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CONTRACT_COUNT,
  loadAssignmentArtifact,
  loadFixture,
  loadRegistry,
  loadSchema,
  REPO_ROOT,
  SCHEMA_FILES,
  SCHEMA_VERSIONS,
  schemaId,
} from './lesson-factory/contract-registry';
import { packetForLesson } from './lesson-factory/curriculum-compat';
import * as architectureIntake from './lesson-factory/intake';
import { admitIntake, verifyIntake, type IntakeRecord, type Offer } from './lesson-factory/intake';
import * as architectureSubset from './lesson-factory/json-schema-subset';
import {
  validateAgainst,
  type JsonObject,
  type JsonValue,
} from './lesson-factory/json-schema-subset';
import * as architectureSemantics from './lesson-factory/packet-semantics';
import { packetSemanticErrors } from './lesson-factory/packet-semantics';
import * as architectureReferences from './lesson-factory/reference-model';

const PACKET_SCHEMA = 'task-source-packet.schema.json';
const INTAKE_SCHEMA = 'intake-validation.schema.json';
const SOURCE_CROSSWALK = JSON.parse(
  readFileSync(
    join(REPO_ROOT, '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json'),
    'utf8',
  ),
) as JsonObject;
const SOURCE_RECEIPT = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'content/lesson-factory/deadline-profile/owner-source-use-receipt.json'),
    'utf8',
  ),
) as JsonObject;
const FIELD_MAP = join(
  REPO_ROOT,
  '.tmp/scratch/lesson-factory-2026-08-03T1727-0500/wp-01-to-wp-04-packet-field-map.md',
);

const clone = <T>(value: T): T => structuredClone(value);
const objects = (value: JsonValue | undefined): JsonObject[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is JsonObject => row !== null && typeof row === 'object' && !Array.isArray(row),
      )
    : [];

const OFFICIAL_PATHS: Record<string, string[]> = {
  'V3-SRC-100096': [
    'Chemical and Physical Foundations of Biological Systems',
    'Foundational Concept 5',
    'Content Category 5A: Unique nature of water and its solutions',
    'Acid-Base Equilibria (GC, BC)',
  ],
  'V3-SRC-100097': [
    'Chemical and Physical Foundations of Biological Systems',
    'Foundational Concept 5',
    'Content Category 5A: Unique nature of water and its solutions',
    'Ions in Solutions (GC, BC)',
  ],
  'V3-SRC-200068': [
    'Chemical and Physical Foundations of Biological Systems',
    'Foundational Concept 5',
    'Content Category 5A: Unique nature of water and its solutions',
  ],
};

const EXACT_MAPPINGS = [
  'V3-MAP-600899',
  'V3-MAP-600411',
  'V3-MAP-600504',
  'V3-MAP-601257',
  'V3-MAP-600384',
] as const;

/**
 * Transitional construction used only by the RED suite. The shipped control is updated
 * in GREEN; keeping this projection here makes the RED failures about the missing
 * contract rules rather than about the fixture not having been re-pinned yet.
 */
const productionPacket = (): JsonObject => {
  const packet = clone(loadFixture('task-source-packet.json'));
  for (const [index, record] of objects(packet.ordered_kc_records).entries()) {
    const occurrenceIds = objects(record.source_occurrences).map((row) =>
      String(row.source_occurrence_id),
    );
    record.source_set_status = 'EXACT_SOURCE';
    record.source_mappings = [
      {
        mapping_id: EXACT_MAPPINGS[index]!,
        relation: 'exact',
        source_occurrence_ids: occurrenceIds,
      },
    ];
    for (const occurrence of objects(record.source_occurrences)) {
      const occurrenceId = String(occurrence.source_occurrence_id);
      occurrence.official_path = OFFICIAL_PATHS[occurrenceId] ?? ['UNRESOLVED'];
      if (occurrenceId === 'V3-SRC-200068') {
        occurrence.source_anchor_ids = ['CP-SA-019'];
      }
    }
  }
  return packet;
};

const packetOffer = (packet: JsonObject): Offer => ({
  locator: 'lane-01/v3-les-151730',
  bytes: Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8'),
});

const packetWithCanonicalEvidence = (lessonId: string): JsonObject => {
  const packet = clone(packetForLesson(lessonId));
  const canonicalMappings = objects(SOURCE_CROSSWALK.mappings);
  const canonicalOccurrences = new Map(
    objects(SOURCE_CROSSWALK.source_occurrences).map((row) => [
      String(row.source_occurrence_id),
      row,
    ]),
  );
  const sourceDecisions = new Map(
    objects(SOURCE_RECEIPT.source_decisions).map((row) => [String(row.source_id), row]),
  );
  for (const record of objects(packet.ordered_kc_records)) {
    const candidates = canonicalMappings.filter((mapping) => {
      const occurrenceIds = [
        ...new Set([
          ...(mapping.source_occurrence_ids as string[]),
          ...((mapping.direct_source_occurrence_ids ?? []) as string[]),
        ]),
      ];
      return (
        mapping.target_id === record.kc_id &&
        mapping.target_type === 'KC' &&
        [undefined, 'direct', 'enabling'].includes(mapping.mapping_role as string | undefined) &&
        occurrenceIds.length > 0
      );
    });
    const mapping = candidates.find((candidate) => candidate.relation === 'exact') ?? candidates[0];
    if (mapping === undefined) throw new Error(`no carried canonical mapping for ${record.kc_id}`);
    const mappingOccurrenceIds = [
      ...new Set([
        ...(mapping.source_occurrence_ids as string[]),
        ...((mapping.direct_source_occurrence_ids ?? []) as string[]),
      ]),
    ].sort();
    record.source_set_status = mapping.relation === 'exact' ? 'EXACT_SOURCE' : 'BOUNDED_SOURCE_SET';
    record.source_mappings = [
      {
        mapping_id: String(mapping.mapping_id),
        relation: String(mapping.relation),
        source_occurrence_ids: mappingOccurrenceIds,
      },
    ];
    const occurrenceById = new Map(
      objects(record.source_occurrences).map((row) => [String(row.source_occurrence_id), row]),
    );
    for (const occurrenceId of mappingOccurrenceIds) {
      if (!occurrenceById.has(occurrenceId)) {
        occurrenceById.set(occurrenceId, { source_occurrence_id: occurrenceId });
      }
    }
    record.source_occurrences = [...occurrenceById.values()].sort((left, right) =>
      String(left.source_occurrence_id).localeCompare(String(right.source_occurrence_id)),
    );
    for (const occurrence of objects(record.source_occurrences)) {
      const canonical = canonicalOccurrences.get(String(occurrence.source_occurrence_id));
      if (canonical === undefined) continue;
      const sourceId = String(canonical.source_id);
      const decision = sourceDecisions.get(sourceId);
      if (decision === undefined) throw new Error(`no receipt decision for ${sourceId}`);
      const allowed = new Set(decision.derived_field_allowlist as string[]);
      const permitted = decision.usable === true;
      occurrence.occurrence_kind = allowed.has('occurrence_kind')
        ? String(canonical.occurrence_kind)
        : 'UNSPECIFIED_OCCURRENCE';
      occurrence.source_id = sourceId;
      occurrence.source_class = String(decision.source_class);
      occurrence.official_path = canonical.official_path ?? [];
      occurrence.official_topic = allowed.has('official_topic')
        ? (canonical.official_topic ?? null)
        : null;
      occurrence.printed_pages = allowed.has('printed_pages')
        ? (canonical.printed_pages ?? [])
        : [];
      occurrence.source_anchor_ids =
        canonical.source_anchor_ids ??
        (canonical.source_anchor_id === undefined ? [] : [canonical.source_anchor_id]);
      occurrence.derived_summary = allowed.has('derived_summary')
        ? (canonical.source_summary ?? null)
        : null;
      occurrence.scope_status = allowed.has('scope_status')
        ? (canonical.scope_status ?? null)
        : null;
      occurrence.authority_status = {
        source_id: sourceId,
        present_day_authority_refreshed: false,
      };
      occurrence.rights_status = permitted ? 'PERMITTED' : 'PROHIBITED';
      occurrence.derived_fields_only = true;
      occurrence.permitted_use = permitted ? (decision.permitted_use_codes ?? []) : [];
      occurrence.permission_receipt_refs = [];
      occurrence.source_use_receipt_ref = permitted
        ? (packet.source_use_receipt_ref ?? null)
        : null;
    }
  }
  const allOccurrences = objects(packet.ordered_kc_records).flatMap((record) =>
    objects(record.source_occurrences),
  );
  const sourceIds = [...new Set(allOccurrences.map((row) => String(row.source_id)))].sort();
  packet.source_documents = sourceIds.map((sourceId) => ({
    source_id: sourceId,
    source_class: sourceDecisions.get(sourceId)?.source_class ?? 'PRIVATE_COMPARISON',
    source_locator: '../research/mcat-curriculum-architecture-v3/v3-source-crosswalk.json',
    present_day_authority_refreshed: false,
  }));
  packet.source_anchors = [
    ...new Set(allOccurrences.flatMap((occurrence) => occurrence.source_anchor_ids as string[])),
  ].sort();
  (packet.source_sanitization as JsonObject).considered_occurrence_count = allOccurrences.length;
  return packet;
};

let ajv: Ajv2020;
let packetAjv: ValidateFunction;
let intakeAjv: ValidateFunction;

beforeAll(() => {
  ajv = new Ajv2020({ strict: true, allErrors: true, allowUnionTypes: false });
  ajv.addVocabulary(['x_contract_id', 'x_contract_version']);
  for (const file of SCHEMA_FILES) ajv.addSchema(loadSchema(file) as object);
  const compiled = ajv.getSchema(schemaId(PACKET_SCHEMA));
  if (compiled === undefined) throw new Error('strict Ajv did not compile the packet schema');
  packetAjv = compiled;
  const intakeCompiled = ajv.getSchema(schemaId(INTAKE_SCHEMA));
  if (intakeCompiled === undefined) throw new Error('strict Ajv did not compile the intake schema');
  intakeAjv = intakeCompiled;
});

const schemaResults = (packet: JsonObject): { subset: string[]; ajv: boolean } => ({
  subset: validateAgainst(loadRegistry(), schemaId(PACKET_SCHEMA), packet),
  ajv: packetAjv(packet),
});

describe('v5 READY source evidence is schema-visible and canonically bound', () => {
  it('keeps the enriched control valid under both validators', () => {
    const packet = productionPacket();
    const result = schemaResults(packet);
    expect(result.subset).toEqual([]);
    expect(result.ajv, JSON.stringify(packetAjv.errors)).toBe(true);
    expect(packetSemanticErrors(packet)).toEqual([]);
  });

  it('rejects a READY KC with an empty source_mappings array in strict Ajv/subset parity', () => {
    const packet = productionPacket();
    objects(packet.ordered_kc_records)[0]!.source_mappings = [];

    const result = schemaResults(packet);
    expect(result.subset).not.toEqual([]);
    expect(result.ajv).toBe(false);
  });

  it('requires official_path on the authoritative occurrence interface in validator parity', () => {
    const packet = productionPacket();
    delete objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.official_path;

    const result = schemaResults(packet);
    expect(result.subset).not.toEqual([]);
    expect(result.ajv).toBe(false);
  });

  it('permits an empty mapping only on quarantine with an explicit blocker fact', () => {
    const packet = productionPacket();
    objects(packet.ordered_kc_records)[0]!.source_mappings = [];
    packet.packet_status = 'BLOCKED';
    packet.packet_surface = 'QUARANTINE';
    packet.block_reasons = [
      {
        code: 'SOURCE_MAPPING_MISSING',
        path: '/ordered_kc_records/0/source_mappings',
        message: 'The canonical mapping could not be resolved, so no authorable packet exists.',
      },
    ];
    (packet.output_requirements as JsonObject).output_directory =
      '.tmp/lesson-factory/lane-01/v3-les-151730/quarantine/blocked-packet-audit.json';

    const result = schemaResults(packet);
    expect(result.subset).toEqual([]);
    expect(result.ajv, JSON.stringify(packetAjv.errors)).toBe(true);
    expect(packetSemanticErrors(packet)).toEqual([]);
  });

  it('rejects empty, foreign, and orphan mappings semantically', () => {
    const empty = productionPacket();
    objects(empty.ordered_kc_records)[0]!.source_mappings = [];

    const foreign = productionPacket();
    const foreignMapping = objects(objects(foreign.ordered_kc_records)[0]!.source_mappings)[0]!;
    foreignMapping.mapping_id = EXACT_MAPPINGS[1];

    const orphan = productionPacket();
    const orphanMapping = objects(objects(orphan.ordered_kc_records)[0]!.source_mappings)[0]!;
    orphanMapping.source_occurrence_ids = ['V3-SRC-999999'];

    expect(packetSemanticErrors(empty).join('\n')).toMatch(/source_mappings/);
    expect(packetSemanticErrors(foreign).join('\n')).toMatch(/mapping.*V3-KC-585369/i);
    expect(packetSemanticErrors(orphan).join('\n')).toMatch(/V3-SRC-999999/);
  });

  it('binds occurrence path, source id, anchors, rights, and packet unions to authorities', () => {
    const cases: Array<[string, (packet: JsonObject) => void]> = [
      [
        'official path',
        (packet) => {
          objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.official_path = [
            'Invented path',
          ];
        },
      ],
      [
        'exact source id',
        (packet) => {
          objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.source_id =
            'AAMC-2020-MCAT-CONTENT';
        },
      ],
      [
        'source anchors',
        (packet) => {
          objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.source_anchor_ids =
            [];
        },
      ],
      [
        'rights decision',
        (packet) => {
          objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.permitted_use = [
            'INTERNAL_HUMAN_REVIEW',
          ];
        },
      ],
      [
        'source document union',
        (packet) => {
          packet.source_documents = objects(packet.source_documents).slice(1);
        },
      ],
      [
        'source anchor union',
        (packet) => {
          packet.source_anchors = [];
        },
      ],
    ];

    for (const [name, mutate] of cases) {
      const packet = productionPacket();
      mutate(packet);
      expect(packetSemanticErrors(packet), name).not.toEqual([]);
    }
  });
});

describe('v5 relation evidence resolves by canonical record and direction', () => {
  it('accepts the exact prerequisite and attachment relations for an allocated lesson', () => {
    expect(packetSemanticErrors(packetWithCanonicalEvidence('V3-LES-006619'))).toEqual([]);
  });

  it('accepts canonical relation evidence across every authoring allocation', () => {
    const proof = loadAssignmentArtifact('partition-proof.json');
    const failures: Array<[string, string]> = [];
    for (const lessonId of objects(proof.assignments).flatMap((assignment) =>
      objects(assignment.rows).map((row) => String(row.lesson_id)),
    )) {
      try {
        const errors = packetSemanticErrors(packetWithCanonicalEvidence(lessonId));
        if (errors.length > 0) failures.push([lessonId, errors.slice(0, 2).join('; ')]);
      } catch (error) {
        failures.push([lessonId, String(error)]);
      }
    }
    expect(failures.slice(0, 10), `${failures.length} allocated packets failed semantics`).toEqual(
      [],
    );
  });

  it('rejects an attachment relation belonging to a different canonical attachment', () => {
    const packet = productionPacket();
    const attachment = objects(packet.attachments)[0]!;
    attachment.relation_ids = ['R14-CAP-004008'];

    expect(packetSemanticErrors(packet).join('\n')).toMatch(/relation/i);
  });

  it('rejects a prerequisite relation of the wrong class and endpoint pair', () => {
    const packet = clone(packetForLesson('V3-LES-006619'));
    const hard = objects((packet.prerequisites as JsonObject).hard)[0]!;
    hard.relation_ids = ['R14-HELPFUL-01'];

    expect(packetSemanticErrors(packet).join('\n')).toMatch(/R14-HELPFUL-01/);
  });

  it('never accepts a projected relation by looking up the reversed projection key', () => {
    const packet = clone(packetForLesson('V3-LES-191933'));
    const helpful = objects((packet.prerequisites as JsonObject).helpful)[0]!;
    helpful.lesson_id = String(packet.lesson_id);
    packet.lesson_id = 'V3-LES-556584';

    expect(packetSemanticErrors(packet).join('\n')).toMatch(/direction|endpoint|prerequisite/i);
  });
});

describe('v5 quarantine identity never fabricates allocation', () => {
  it('refuses an unallocated quarantine identity unless WP-02 supplies an authoritative row', () => {
    const proof = loadAssignmentArtifact('partition-proof.json');
    const allocated = new Set(
      objects(proof.assignments).flatMap((assignment) =>
        objects(assignment.rows).map((row) => String(row.lesson_id)),
      ),
    );
    const absent = (proof.excluded_existing_lesson_ids as string[]).find(
      (lessonId) => !allocated.has(lessonId),
    );

    if (absent === undefined) {
      // The closed WP-02 interface landed: packetForLesson now has a real proof row to use.
      for (const lessonId of proof.excluded_existing_lesson_ids as string[]) {
        expect(
          packetSemanticErrors(packetForLesson(lessonId)).filter((problem) =>
            problem.includes('authoritative allocation proof row'),
          ),
        ).toEqual([]);
      }
      return;
    }

    expect(packetSemanticErrors(packetForLesson(absent)).join('\n')).toMatch(
      /authoritative allocation proof row/,
    );
  });
});

describe('production intake runs packet semantics before ADMITTED', () => {
  const admittedAt = '2026-08-03T22:28:00Z';

  it('records the exact packet semantic validator result for a valid packet', () => {
    const result = admitIntake({ ...packetOffer(productionPacket()), now: admittedAt });
    expect(result.admission).toBe('ADMITTED');
    expect((result as unknown as { semantic_validation: JsonObject }).semantic_validation).toEqual({
      validator: 'PACKET_SEMANTICS_V1',
      status: 'PASS',
      error_count: 0,
    });
  });

  it.each([
    [
      'allocation identity',
      (packet: JsonObject) => {
        packet.lane_id = 'lane-02';
      },
    ],
    [
      'ordered KC scope',
      (packet: JsonObject) => {
        packet.ordered_kc_ids = [...(packet.ordered_kc_ids as string[])].reverse();
      },
    ],
    [
      'source authority',
      (packet: JsonObject) => {
        objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.official_path = [
          'Invented path',
        ];
      },
    ],
    [
      'attachment ownership',
      (packet: JsonObject) => {
        objects(packet.attachments)[0]!.owner_lesson_id = 'V3-LES-151730';
      },
    ],
    [
      'relation class',
      (packet: JsonObject) => {
        objects(packet.attachments)[0]!.relation_class = 'REVISIT';
      },
    ],
    [
      'packet surface path',
      (packet: JsonObject) => {
        (packet.output_requirements as JsonObject).output_directory =
          '.tmp/lesson-factory/lane-02/v3-les-151730';
      },
    ],
  ] as Array<[string, (packet: JsonObject) => void]>)(
    'refuses a schema-valid %s contradiction with one stable code',
    (_name, mutate) => {
      const packet = productionPacket();
      mutate(packet);
      const result = admitIntake({ ...packetOffer(packet), now: admittedAt });

      expect(result.schema_validation.status).toBe('PASS');
      expect(result.resolver_validation.status).toBe('PASS');
      expect(result.input_validation.status).toBe('PASS');
      expect(result.admission).toBe('REJECTED');
      expect(result.refusal_code).toBe('PACKET_SEMANTICS_INVALID');
      expect(
        (result as unknown as { semantic_validation: JsonObject }).semantic_validation,
      ).toMatchObject({ validator: 'PACKET_SEMANTICS_V1', status: 'FAIL' });
      expect(
        validateAgainst(loadRegistry(), schemaId(INTAKE_SCHEMA), result as unknown as JsonObject),
      ).toEqual([]);
      expect(intakeAjv(result as unknown as JsonValue), JSON.stringify(intakeAjv.errors)).toBe(
        true,
      );
    },
  );

  it('rejects an ADMITTED record whose packet semantics failed in Ajv/subset parity', () => {
    const packet = productionPacket();
    packet.lane_id = 'lane-02';
    const rejected = admitIntake({ ...packetOffer(packet), now: admittedAt });
    const forged = clone(rejected) as unknown as JsonObject;
    forged.admission = 'ADMITTED';
    delete forged.refusal_code;

    expect(validateAgainst(loadRegistry(), schemaId(INTAKE_SCHEMA), forged)).not.toEqual([]);
    expect(intakeAjv(forged)).toBe(false);
  });

  it('does not run packet semantics before a schema failure', () => {
    const packet = productionPacket();
    delete objects(objects(packet.ordered_kc_records)[0]!.source_occurrences)[0]!.official_path;
    const result = admitIntake({ ...packetOffer(packet), now: admittedAt });

    expect(result.refusal_code).toBe('SCHEMA_INVALID');
    expect(
      (result as unknown as { semantic_validation: JsonObject }).semantic_validation,
    ).toMatchObject({ status: 'NOT_RUN', error_count: 0 });
  });

  it('binds the semantic result into verification and the admission proof', () => {
    const offer = packetOffer(productionPacket());
    const genuine = admitIntake({ ...offer, now: admittedAt });
    const forged = {
      ...genuine,
      semantic_validation: {
        validator: 'PACKET_SEMANTICS_V1',
        status: 'FAIL',
        error_count: 1,
      },
    } as unknown as IntakeRecord;

    expect(verifyIntake(forged, offer)).not.toEqual([]);
  });
});

describe('v5 registry and WP-04 handoff truth', () => {
  it('publishes the actual closed sixteen-contract WP-01 set', () => {
    expect(CONTRACT_COUNT).toBe(16);
    expect(Object.keys(SCHEMA_VERSIONS)).toHaveLength(16);
    expect(SCHEMA_FILES).toHaveLength(16);
  });

  it('maps the complete v5 interface with no stale v4 or reduced-input text', () => {
    const map = readFileSync(FIELD_MAP, 'utf8');
    expect(map).toContain('5.0.0');
    expect(map).toContain('ten authoritative inputs');
    expect(map).toContain('source_mappings');
    expect(map).toContain('host_scope');
    expect(map).toContain('AUTHORABLE');
    expect(map).toContain('QUARANTINE');
    expect(map).toContain('PACKET_SEMANTICS_INVALID');
    expect(map).not.toContain('4.0.0');
    expect(map).not.toMatch(/\beight inputs?\b/i);
    expect(map).not.toContain('host_kc_id');
  });
});

describe('canonical production admission package export', () => {
  it('publishes the production admission module at the package subpath', async () => {
    const production = await import('@mcat/content/lesson-factory/admission');

    expect(production.admitTaskSourcePacketV5).toBeTypeOf('function');
  });

  it('keeps architecture consumers on the same production function objects', async () => {
    const production = await import('@mcat/content/lesson-factory/admission');

    expect(architectureIntake.admitIntake).toBe(production.admitIntake);
    expect(architectureIntake.verifyIntake).toBe(production.verifyIntake);
    expect(architectureSemantics.packetSemanticErrors).toBe(production.packetSemanticErrors);
    expect(architectureSemantics.canonicalJson).toBe(production.canonicalJson);
    expect(architectureReferences.parseReference).toBe(production.parseReference);
    expect(architectureSubset.validateAgainst).toBe(production.validateAgainst);
  });

  it('admits exact packet bytes through the narrow public API', async () => {
    const { admitTaskSourcePacketV5 } = await import('@mcat/content/lesson-factory/admission');

    expect(
      admitTaskSourcePacketV5({
        bytes: packetOffer(productionPacket()).bytes.toString('utf8'),
        locator: 'lane-01/v3-les-151730',
      }),
    ).toEqual({
      admission: 'ADMITTED',
      semantic_validation: {
        validator: 'PACKET_SEMANTICS_V1',
        status: 'PASS',
        error_count: 0,
      },
    });
  });

  it('rejects filesystem output paths and admits the canonical lane/lesson locator', async () => {
    const { admitTaskSourcePacketV5 } = await import('@mcat/content/lesson-factory/admission');
    const bytes = packetOffer(productionPacket()).bytes.toString('utf8');

    expect(() =>
      admitTaskSourcePacketV5({
        bytes,
        locator: 'content/lesson-factory/packets/V3-LES-151730/task-source-packet.json',
      }),
    ).toThrow(/LOCATOR_NOT_CANONICAL|not a canonical locator/i);
    expect(admitTaskSourcePacketV5({ bytes, locator: 'lane-01/v3-les-151730' }).admission).toBe(
      'ADMITTED',
    );
  });

  it('admits an exact blocked quarantine record without making it authorable', async () => {
    const { admitTaskSourcePacketV5 } = await import('@mcat/content/lesson-factory/admission');
    const packet = productionPacket();
    objects(packet.ordered_kc_records)[0]!.source_mappings = [];
    packet.packet_status = 'BLOCKED';
    packet.packet_surface = 'QUARANTINE';
    packet.block_reasons = [
      {
        code: 'SOURCE_MAPPING_MISSING',
        path: '/ordered_kc_records/0/source_mappings',
        message: 'The canonical mapping could not be resolved, so no authorable packet exists.',
      },
    ];
    packet.authorable_packet_ref = null;
    packet.packet_content_sha256 = null;
    (packet.output_requirements as JsonObject).output_directory =
      '.tmp/lesson-factory/lane-01/v3-les-151730/quarantine/blocked-packet-audit.json';

    expect(
      admitTaskSourcePacketV5({
        bytes: `${JSON.stringify(packet, null, 2)}\n`,
        locator: 'lane-01/v3-les-151730',
      }),
    ).toEqual({
      admission: 'ADMITTED',
      semantic_validation: {
        validator: 'PACKET_SEMANTICS_V1',
        status: 'PASS',
        error_count: 0,
      },
    });
  });
});
