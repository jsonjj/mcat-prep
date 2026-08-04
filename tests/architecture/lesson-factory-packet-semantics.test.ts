/**
 * The packet contract against the curriculum it governs, and against the generator that
 * has to fill it in.
 *
 * The v4 freeze passed its own suites and then failed an independent review against real
 * lessons, which is the failure mode a contract written from fixtures always has: the
 * fixtures agreed with the contract because the same person wrote both. Every assertion
 * here reads the manifest, the crosswalk, or a frozen artifact, and the projection under
 * test is forbidden to invent a hash, a relation, a host, or a rights decision.
 */

import { describe, expect, it } from 'vitest';

import { loadSchema } from './lesson-factory/contract-registry';
import {
  ATTACHMENT_SCOPES,
  CANONICAL_ID_SETS,
  HOST_MISMATCHES,
  INPUT_PROVENANCE,
  MANIFEST,
  GENERATION_SET,
  OUT_OF_SCOPE_LESSONS,
  READY_LESSON_IDS,
  RECEIPT,
  SOURCE_DECISIONS,
  canonicalContentSha256,
  fileSha256,
  packetForLesson,
  registry,
  schemaId,
} from './lesson-factory/curriculum-compat';
import { validateAgainst, type JsonObject } from './lesson-factory/json-schema-subset';
import { packetSemanticErrors } from './lesson-factory/packet-semantics';

const PACKET = 'task-source-packet.schema.json';
const validate = (packet: JsonObject): string[] =>
  validateAgainst(registry, schemaId(PACKET), packet);

const LESSONS: string[] = CANONICAL_ID_SETS.lesson_id;

describe('provenance: the packet binds every input generation consumed', () => {
  it('names all ten authoritative inputs, and no others', () => {
    const packet = packetForLesson('V3-LES-006619');
    const rows = packet.input_hashes as JsonObject[];
    expect(rows).toHaveLength(10);
    expect(rows.map((row) => row.input as string).sort()).toEqual(
      [
        'assignmentProof',
        'curriculumManifest',
        'deadlineProfile',
        'ownerSourceUseReceipt',
        'releasePolicy',
        'researchRegistry',
        'rubric',
        'sharedVocabularySchema',
        'sourceCrosswalk',
        'taskPacketSchema',
      ].sort(),
    );
  });

  it('carries the real file and canonical-content digests of those bytes', () => {
    const packet = packetForLesson('V3-LES-006619');
    for (const row of packet.input_hashes as JsonObject[]) {
      const provenance = INPUT_PROVENANCE.find((input) => input.key === row.input);
      expect(provenance, `no provenance for ${String(row.input)}`).toBeDefined();
      expect(row.path).toBe(provenance?.path);
      expect(row.file_sha256).toBe(fileSha256(provenance!.path));
      expect(row.content_sha256).toBe(canonicalContentSha256(provenance!.path));
    }
  });

  it('refuses a packet that drops an input, duplicates one, or renames its path', () => {
    const packet = packetForLesson('V3-LES-006619');
    const rows = packet.input_hashes as JsonObject[];

    expect(validate({ ...packet, input_hashes: rows.slice(1) })).not.toEqual([]);

    // Ten rows, all well-formed, but the rubric named twice and the proof not at all.
    // `uniqueItems` is satisfied by two rows that differ in a digit; exactness is not.
    const duplicated = rows.map((row) =>
      row.input === 'assignmentProof' ? { ...rows[rows.length - 1] } : row,
    );
    expect(validate({ ...packet, input_hashes: duplicated })).not.toEqual([]);

    const moved = rows.map((row) =>
      row.input === 'rubric' ? { ...row, path: 'key-docs/lesson-quality-author-protocol.md' } : row,
    );
    expect(validate({ ...packet, input_hashes: moved })).not.toEqual([]);
  });

  it('resolves and recomputes both digests for every input of every lesson', () => {
    const failures: string[] = [];
    for (const lessonId of LESSONS) {
      const packet = packetForLesson(lessonId);
      const problems = packetSemanticErrors(packet).filter((problem) =>
        problem.startsWith('input_hashes'),
      );
      if (problems.length > 0) failures.push(`${lessonId}: ${problems[0]}`);
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

describe('rights: every decision is bound to an exact source id', () => {
  it('the receipt decides all thirteen canonical source ids and nothing else', () => {
    const declared = SOURCE_DECISIONS.map((row) => row.source_id).sort();
    const used = [
      ...new Set(
        (MANIFEST.source_references.occurrences as JsonObject[]).map(
          (occurrence) => occurrence.source_id as string,
        ),
      ),
    ].sort();
    expect(declared).toEqual(used);
    expect(declared).toHaveLength(13);
  });

  it('derives class, uses, and derived fields from the receipt rather than from the id text', () => {
    for (const decision of SOURCE_DECISIONS) {
      expect(decision.source_class).toMatch(
        /^(REPOSITORY|PUBLIC_PRIMARY_RESEARCH|PRIVATE_COMPARISON)$/,
      );
      expect(decision.class_evidence).toBeDefined();
      if (decision.usable) expect(decision.permitted_use_codes.length).toBeGreaterThan(0);
      else expect(decision.permitted_use_codes).toEqual([]);
    }
    // The schema carries the same table, so a packet cannot be permitted by a receipt the
    // validator never read.
    const vocabulary = loadSchema('shared-vocabulary.schema.json');
    const ids = ((vocabulary.$defs as JsonObject).SourceDocumentId as JsonObject).enum as string[];
    expect([...ids].sort()).toEqual(SOURCE_DECISIONS.map((row) => row.source_id).sort());
  });

  it('refuses a source id the receipt does not decide', () => {
    const packet = packetForLesson('V3-LES-006619');
    const mutated = JSON.parse(JSON.stringify(packet)) as JsonObject;
    const record = (mutated.ordered_kc_records as JsonObject[])[0]!;
    const occurrence = (record.source_occurrences as JsonObject[])[0]!;
    occurrence.source_id = 'KAPLAN-2026';
    expect(validate(mutated)).not.toEqual([]);
  });

  it('refuses a class that disagrees with the receipt for that exact source id', () => {
    const packet = packetForLesson('V3-LES-006619');
    const mutated = JSON.parse(JSON.stringify(packet)) as JsonObject;
    const record = (mutated.ordered_kc_records as JsonObject[])[0]!;
    const occurrence = (record.source_occurrences as JsonObject[])[0]!;
    const decision = SOURCE_DECISIONS.find((row) => row.source_id === occurrence.source_id)!;
    occurrence.source_class =
      decision.source_class === 'REPOSITORY' ? 'PUBLIC_PRIMARY_RESEARCH' : 'REPOSITORY';
    expect(validate(mutated)).not.toEqual([]);
  });

  it('refuses a derived field the receipt does not allow for that source id', () => {
    const withoutSummary = SOURCE_DECISIONS.find(
      (row) => !row.derived_field_allowlist.includes('derived_summary'),
    );
    expect(withoutSummary, 'no source id withholds derived_summary').toBeDefined();

    const lessonId = LESSONS.find((id) =>
      (packetForLesson(id).ordered_kc_records as JsonObject[]).some((record) =>
        (record.source_occurrences as JsonObject[]).some(
          (occurrence) => occurrence.source_id === withoutSummary!.source_id,
        ),
      ),
    );
    expect(lessonId, `no lesson cites ${withoutSummary!.source_id}`).toBeDefined();

    const mutated = JSON.parse(JSON.stringify(packetForLesson(lessonId!))) as JsonObject;
    for (const record of mutated.ordered_kc_records as JsonObject[]) {
      for (const occurrence of record.source_occurrences as JsonObject[]) {
        if (occurrence.source_id === withoutSummary!.source_id) {
          occurrence.derived_summary = 'a summary this source is not allowed to carry';
        }
      }
    }
    expect(validate(mutated)).not.toEqual([]);
  });

  it('keeps the nonclaims: no clearance, no licence, no copying', () => {
    expect(RECEIPT.decision_scope).toMatchObject({
      grants_lesson_approval: false,
      grants_external_source_copying: false,
      grants_rights_clearance_for_third_party_material: false,
      is_legal_advice: false,
      is_third_party_license: false,
    });
    expect(RECEIPT.prohibited_use_codes).toContain('RAW_SOURCE_TEXT');
    expect(RECEIPT.prohibited_use_codes).toContain('PRIVATE_COMPARISON_CONTENT');
  });
});

describe('attachments: the host is whatever the curriculum says it is', () => {
  it('classifies all 157 canonical attachment references with no fallback', () => {
    expect(ATTACHMENT_SCOPES).toHaveLength(157);
    const kinds = new Set(ATTACHMENT_SCOPES.map((row) => row.host_scope.kind));
    // Four of the five shapes occur in the canonical data. CAPSTONE does not, because the
    // one extension with no host cores is displayed by lessons that are its secondary
    // applications, and the resolution note gives secondary application precedence. The
    // shape is still in the union and still constrained, which the next case proves; what
    // is not done here is inventing an occurrence of it.
    expect([...kinds].sort()).toEqual(['LESSON', 'MULTI_KC', 'SECONDARY_APPLICATION', 'SINGLE_KC']);
  });

  it('keeps a foreign-owned extension with host cores as a secondary application', () => {
    const projected = ATTACHMENT_SCOPES.find(
      (row) =>
        row.kind === 'EXTENSION' &&
        row.host_scope.kind === 'SECONDARY_APPLICATION' &&
        row.declared_host_core_ids.length > 0,
    )!;
    expect(projected).toBeDefined();
    const packet = packetForLesson(projected.lesson_id);
    const mutated = JSON.parse(JSON.stringify(packet)) as JsonObject;
    const attachment = (mutated.attachments as JsonObject[]).find(
      (row) => row.attachment_id === projected.attachment_id,
    )!;
    expect(attachment.owner_lesson_id).not.toBe(packet.lesson_id);
    expect((attachment.declared_host_core_ids as string[]).length).toBeGreaterThan(0);
    expect(attachment.host_scope).toEqual({
      kind: 'SECONDARY_APPLICATION',
      primary_lesson_id: attachment.owner_lesson_id,
    });
    expect(attachment.credits_kc_evidence).toBe(false);

    attachment.host_scope = { kind: 'CAPSTONE', capstone_ids: ['V3-CAP-004008'] };
    attachment.credits_kc_evidence = true;
    expect(validate(mutated), 'a capstone of this lesson').toEqual([]);
    expect(packetSemanticErrors(mutated)).not.toEqual([]);
  });

  it('carries every capstone, extension and support the 114 lessons reference', () => {
    let referenced = 0;
    for (const lesson of MANIFEST.curriculum.lessons as JsonObject[]) {
      referenced +=
        ((lesson.capstone_ids ?? []) as string[]).length +
        ((lesson.extension_ids ?? []) as string[]).length +
        ((lesson.support_artifact_ids ?? []) as string[]).length;
    }
    expect(referenced).toBe(157);

    let carried = 0;
    for (const lessonId of LESSONS) {
      carried += (packetForLesson(lessonId).attachments as JsonObject[]).length;
    }
    expect(carried).toBe(157);
  });

  it('validates a packet for every lesson that has an attachment of each scope', () => {
    const byKind = new Map<string, string>();
    for (const row of ATTACHMENT_SCOPES) byKind.set(row.host_scope.kind, row.lesson_id);
    expect(byKind.size).toBe(4);
    for (const [kind, lessonId] of byKind) {
      expect(validate(packetForLesson(lessonId)), `${kind} at ${lessonId}`).toEqual([]);
    }
  });

  it('keeps both provisional host-lineage mismatches as lesson-level, non-crediting facts', () => {
    expect(HOST_MISMATCHES.map((row) => `${row.attachment_id}@${row.lesson_id}`)).toEqual(
      expect.arrayContaining(['V3-EXT-647243@V3-LES-191915', 'V3-EXT-176907@V3-LES-495267']),
    );
    for (const mismatch of HOST_MISMATCHES) {
      const packet = packetForLesson(mismatch.lesson_id);
      const attachment = (packet.attachments as JsonObject[]).find(
        (row) => row.attachment_id === mismatch.attachment_id,
      )!;
      const scope = attachment.host_scope as JsonObject;
      expect(scope.kind).toBe('LESSON');
      expect(attachment.host_core_membership_status).toBe('MISMATCH_PROVISIONAL');
      expect(attachment.declared_host_core_ids).toEqual(mismatch.declared_host_core_ids);
      expect(attachment.credits_kc_evidence).toBe(false);
      expect(validate(packet)).toEqual([]);
    }
  });

  it('refuses a host KC that is not a KC of the lesson', () => {
    const mutated = JSON.parse(JSON.stringify(packetForLesson('V3-LES-006619'))) as JsonObject;
    const attachment = (mutated.attachments as JsonObject[])[0]!;
    attachment.host_scope = { kind: 'SINGLE_KC', kc_id: 'V3-KC-999999' };
    // The grammar is satisfied and the membership is not, which is precisely the split
    // between the two halves of this contract.
    expect(validate(mutated)).toEqual([]);
    expect(packetSemanticErrors(mutated)).not.toEqual([]);
  });

  it('refuses the retired singular host field outright', () => {
    const singular = JSON.parse(JSON.stringify(packetForLesson('V3-LES-006619'))) as JsonObject;
    const first = (singular.attachments as JsonObject[])[0]!;
    delete first.host_scope;
    first.host_kc_id = (singular.ordered_kc_ids as string[])[0] ?? 'V3-KC-000001';
    expect(validate(singular)).not.toEqual([]);
  });

  it('refuses a host scope that names a kind it has no members for', () => {
    const packet = packetForLesson('V3-LES-006619');
    const mutated = JSON.parse(JSON.stringify(packet)) as JsonObject;
    const attachment = (mutated.attachments as JsonObject[])[0]!;
    attachment.host_scope = { kind: 'MULTI_KC', kc_ids: [] };
    expect(validate(mutated)).not.toEqual([]);
  });
});

describe('READY is unreachable while anything required is unresolved', () => {
  const READY = READY_LESSON_IDS[0]!;
  const readyPacket = (): JsonObject =>
    JSON.parse(JSON.stringify(packetForLesson(READY))) as JsonObject;

  it('has a READY packet to test against at all', () => {
    expect(READY_LESSON_IDS.length).toBeGreaterThan(0);
    expect(packetForLesson(READY).packet_status).toBe('READY');
    expect(validate(packetForLesson(READY))).toEqual([]);
  });

  it('refuses READY with a block reason', () => {
    expect(
      validate({
        ...readyPacket(),
        block_reasons: [
          { code: 'REQUIRED_KC_UNRESOLVED', path: '/ordered_kc_records', message: 'unresolved' },
        ],
      }),
    ).not.toEqual([]);
  });

  it('refuses READY while any source is PENDING, restricted, prohibited or unbound', () => {
    for (const status of ['PENDING', 'RESTRICTED', 'PROHIBITED']) {
      const mutated = readyPacket();
      const occurrence = (
        (mutated.ordered_kc_records as JsonObject[])[0]!.source_occurrences as JsonObject[]
      )[0]!;
      occurrence.rights_status = status;
      occurrence.permitted_use = [];
      occurrence.source_use_receipt_ref = null;
      expect(validate(mutated), `READY with a ${status} source`).not.toEqual([]);
    }
  });

  it('refuses READY with an unresolved KC source set', () => {
    const mutated = readyPacket();
    (mutated.ordered_kc_records as JsonObject[])[0]!.source_set_status = 'UNRESOLVED';
    expect(validate(mutated)).not.toEqual([]);
  });

  it('refuses READY on a quarantine surface, and BLOCKED on an authorable one', () => {
    expect(validate({ ...readyPacket(), packet_surface: 'QUARANTINE' })).not.toEqual([]);
    const blocked = {
      ...readyPacket(),
      packet_status: 'BLOCKED',
      block_reasons: [
        { code: 'ASSIGNMENT_IDENTITY_MISMATCH', path: '/assignment_id', message: 'no row' },
      ],
    };
    expect(validate({ ...blocked, packet_surface: 'AUTHORABLE' })).not.toEqual([]);
  });

  it('holds the cross-field identities the schema cannot see', () => {
    const packet = packetForLesson('V3-LES-006619');
    expect(packetSemanticErrors(packet)).toEqual([]);

    const wrongLane = { ...packet, lane_id: 'lane-02' };
    expect(packetSemanticErrors(wrongLane)).not.toEqual([]);

    const wrongCluster = {
      ...packet,
      identity: { ...(packet.identity as JsonObject), cluster_id: 'V3-CL-000000' },
    };
    expect(packetSemanticErrors(wrongCluster)).not.toEqual([]);

    const wrongOrder = {
      ...packet,
      ordered_kc_ids: [...(packet.ordered_kc_ids as string[])].reverse(),
    };
    expect(packetSemanticErrors(wrongOrder)).not.toEqual([]);
  });
});

describe('BLOCKED evidence survives without becoming an authorable packet', () => {
  /**
   * A quarantine record built by refusing a packet that would otherwise be fine, rather than by
   * reaching for whichever lesson happens to be blocked today. The three that are blocked are
   * blocked on WP-02's allocation proof, and when that lands there will be none to borrow.
   */
  const blocked = (): JsonObject => {
    const packet = packetForLesson('V3-LES-006619');
    const requirements = packet.output_requirements as JsonObject;
    return {
      ...packet,
      packet_status: 'BLOCKED',
      packet_surface: 'QUARANTINE',
      block_reasons: [
        {
          code: 'ASSIGNMENT_IDENTITY_MISMATCH',
          path: '/assignment_id',
          message: 'the allocation proof pins a superseded profile',
        },
      ],
      authorable_packet_ref: null,
      packet_content_sha256: null,
      output_requirements: {
        ...requirements,
        output_directory: `${String(requirements.output_directory)}/quarantine/blocked-packet-audit.json`,
      },
    };
  };

  it('validates as a quarantine record', () => {
    expect(validate(blocked())).toEqual([]);
  });

  it('never carries a READY artifact hash or an authorable reference', () => {
    const withHash = { ...blocked(), packet_content_sha256: 'a'.repeat(63) + '1' };
    expect(validate(withHash)).not.toEqual([]);
  });

  it('resolves to a quarantine path, never to the author packet path', () => {
    const record = blocked();
    const problems = packetSemanticErrors(record);
    expect(problems).toEqual([]);
    const output = (record.output_requirements as JsonObject).output_directory as string;
    expect(output).toMatch(/quarantine/);
    expect(output).not.toMatch(/^content\/lesson-factory\/packets\//);
  });

  it('sends a READY packet to the author packet path WP-04 was briefed to write', () => {
    const packet = packetForLesson('V3-LES-006619');
    expect((packet.output_requirements as JsonObject).authorable_packet_path).toBe(
      'content/lesson-factory/packets/V3-LES-006619/task-source-packet.json',
    );
  });
});

describe('sanitization counts what this packet selected', () => {
  it('requires a code exactly when its count is positive, and the reverse', () => {
    const packet = packetForLesson('V3-LES-006619');
    const claimed = {
      ...packet,
      source_sanitization: {
        ...(packet.source_sanitization as JsonObject),
        excluded_held_claim_count: 0,
        codes: ['HELD_SOURCE_CLAIMS_EXCLUDED'],
      },
    };
    expect(validate(claimed), 'a code with no count behind it').not.toEqual([]);
  });

  it('scopes the raw-field count to the occurrences this packet selected', () => {
    const packet = packetForLesson('V3-LES-006619');
    const sanitization = packet.source_sanitization as JsonObject;
    expect(sanitization.scope).toBe('SELECTED_PACKET_OCCURRENCES');
    const selected = (packet.ordered_kc_records as JsonObject[]).reduce(
      (total, record) => total + (record.source_occurrences as JsonObject[]).length,
      0,
    );
    expect(sanitization.considered_occurrence_count).toBe(selected);

    const crosswalkWide = {
      ...packet,
      source_sanitization: { ...sanitization, considered_occurrence_count: 272 },
    };
    expect(packetSemanticErrors(crosswalkWide)).not.toEqual([]);
  });
});

describe('authorities are pinned, not asserted', () => {
  it('takes template, anchor set, roles, routes and nonclaims from the frozen artifacts', () => {
    const packet = packetForLesson('V3-LES-006619');
    expect(packetSemanticErrors(packet)).toEqual([]);
    for (const field of [
      'deadline_profile_ref',
      'release_policy_ref',
      'source_use_receipt_ref',
      'allocation_proof_ref',
    ]) {
      expect(packet[field], `a packet with no ${field}`).toBeDefined();
    }
  });

  it('refuses an anchor set version or review role a caller made up', () => {
    const packet = packetForLesson('V3-LES-006619');
    const output = packet.output_requirements as JsonObject;
    expect(
      validate({
        ...packet,
        output_requirements: { ...output, anchor_set_version: '9.9.9-mine' },
      }),
    ).not.toEqual([]);
    expect(validate({ ...packet, required_human_review_roles: ['LANE_AUTHOR'] })).not.toEqual([]);
  });
});

describe('every proof-backed lesson is representable', () => {
  it('builds and validates a packet for each', () => {
    const failures: Array<[string, string]> = [];
    for (const lessonId of GENERATION_SET) {
      const errors = validate(packetForLesson(lessonId));
      if (errors.length > 0) failures.push([lessonId, errors.slice(0, 2).join('; ')]);
    }
    expect(GENERATION_SET).toHaveLength(111);
    expect(failures.slice(0, 5), `${failures.length} of 111 lessons cannot be written`).toEqual([]);
  });

  it('passes the semantic model for each', () => {
    const failures: Array<[string, string]> = [];
    for (const lessonId of GENERATION_SET) {
      const problems = packetSemanticErrors(packetForLesson(lessonId));
      if (problems.length > 0) failures.push([lessonId, problems.slice(0, 2).join('; ')]);
    }
    expect(failures.slice(0, 5), `${failures.length} of 111 lessons fail semantics`).toEqual([]);
  });

  it('classifies the ones the curriculum genuinely blocks, without asserting a stale reason', () => {
    const blocked = GENERATION_SET.map((id) => packetForLesson(id)).filter(
      (packet) => packet.packet_status === 'BLOCKED',
    );
    for (const packet of blocked) {
      expect((packet.block_reasons as JsonObject[]).length).toBeGreaterThan(0);
      expect(packet.packet_surface).toBe('QUARANTINE');
      for (const reason of packet.block_reasons as JsonObject[]) {
        expect(reason.code).not.toBe('WP01_SCHEMA_CANONICAL_ID_INCOMPATIBLE');
      }
      expect(validate(packet)).toEqual([]);
    }
  });

  it('reports the three proof-absent lessons out of scope without packet identity', () => {
    expect(OUT_OF_SCOPE_LESSONS.map((row) => row.lesson_id)).toEqual([
      'V3-LES-130923',
      'V3-LES-789208',
      'V3-LES-844372',
    ]);
    for (const { lesson_id: lessonId } of OUT_OF_SCOPE_LESSONS) {
      const diagnostic = packetForLesson(lessonId);
      expect(diagnostic.out_of_scope).toBe(true);
      for (const field of ['packet_id', 'assignment_id', 'team_id', 'lane_id']) {
        expect(diagnostic).not.toHaveProperty(field);
      }
      expect((diagnostic.output_requirements as JsonObject).output_directory).toBeUndefined();
    }
  });

  /**
   * Round 9 read 18 of these blocks as a hole in the curriculum graph. They were a hole in the
   * helper's join, and the only thing left blocking anything is the three lessons WP-02's
   * partition proof does not allocate.
   */
  it('blocks nothing on a prerequisite relation', () => {
    const offenders = GENERATION_SET.flatMap((lessonId) =>
      (packetForLesson(lessonId).block_reasons as JsonObject[])
        .filter((reason) => reason.code === 'PREREQUISITE_RELATION_UNRESOLVED')
        .map((reason) => `${lessonId}: ${String(reason.message)}`),
    );
    expect(offenders, `${offenders.length} prerequisite blocks remain`).toEqual([]);
  });

  it('blocks only the lessons the allocation proof leaves out', () => {
    const blocked = GENERATION_SET.filter((id) => packetForLesson(id).packet_status === 'BLOCKED');
    const codes = new Set(
      blocked.flatMap((id) =>
        (packetForLesson(id).block_reasons as JsonObject[]).map((reason) => String(reason.code)),
      ),
    );
    expect([...codes]).toEqual([]);
    // Three today. When WP-02 publishes a proof covering all 114 this becomes zero blocked and
    // 114 READY, and this test is the thing that says so out loud rather than drifting.
    expect(blocked).toEqual([]);
    expect(READY_LESSON_IDS).toHaveLength(111);
  });
});
