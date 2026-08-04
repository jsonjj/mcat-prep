import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  validateAgainst,
  type JsonObject,
  type JsonValue,
} from './lesson-factory/json-schema-subset';
import {
  loadArtifact,
  loadFixture,
  loadFixtureEnvelope,
  loadRegistry,
  loadSchema,
  PROFILE_DIR,
  REPO_ROOT,
  SCHEMA_VERSIONS,
  schemaId,
  sha256OfFile,
  sha256OfSchema,
} from './lesson-factory/contract-registry';
import { REFERENCE_KINDS, referenceKind } from './lesson-factory/reference-model.js';
import {
  admitIntake,
  declaredReferencePointers,
  DYNAMIC_REFERENCE_KINDS,
  INTAKE_REGISTRY,
  IntakeRefusal,
  offerFromPath,
  verifyIntake,
  type IntakeRecord,
  type Offer,
} from './lesson-factory/intake.js';

/**
 * Intake: what a consumer has to do before it may call a document valid, and what an
 * admission record has to be bound to before anyone may believe it.
 *
 * Ajv answers one question — is this document the shape the contract describes. It
 * cannot answer the other one, because JSON Schema cannot read a second file: do the
 * references in it point at bytes that exist and hash to what they claim.
 *
 * The defect this suite closes is the one after that. An intake record used to name a
 * document kind and a schema file the caller chose, and said ADMITTED about no
 * particular bytes. That is an admission of nothing: the record fitted every document
 * of that kind, including one edited afterwards. So a record now carries the exact
 * offered document — its canonical reference, its digest, its contract, and the exact
 * contract version — every one of those derived by the API from the offered bytes and
 * the trusted registry, and an admission proof over the whole derivation that
 * `verifyIntake` recomputes from the bytes.
 */

const asObject = (value: JsonValue | undefined, label: string): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object, found ${JSON.stringify(value)}`);
  }
  return value;
};

const INTAKE_SCHEMA = 'intake-validation.schema.json';
const PROFILE_PATH = 'content/lesson-factory/deadline-profile/deadline-profile.json';
const POLICY_PATH = 'content/lesson-factory/deadline-profile/release-policy.json';
const HANDOFF_LOCATOR = 'lane-01/v3-les-000101';

const offerOf = (document: JsonObject, locator: string): Offer => ({
  locator,
  bytes: Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8'),
});

const profileOffer = (): Offer => offerFromPath(PROFILE_PATH);

const record = (offer: Offer): IntakeRecord =>
  admitIntake({ ...offer, now: '2026-08-03T22:28:00Z' });

describe('lesson-factory intake: the contract for an admission record', () => {
  it('ships a closed contract that binds a record to the document it admitted', () => {
    const schema = loadSchema(INTAKE_SCHEMA);
    expect(schema.$id).toBe(schemaId(INTAKE_SCHEMA));
    expect(schema.additionalProperties).toBe(false);
    const properties = asObject(schema.properties, 'properties');
    for (const required of [
      'document',
      'schema_validation',
      'resolver_validation',
      'admission',
      'admission_proof',
    ]) {
      expect(properties[required], `intake records must carry ${required}`).toBeDefined();
    }
    const document = asObject(
      asObject(properties.document, 'document').properties,
      'document.properties',
    );
    for (const required of [
      'kind',
      'ref',
      'sha256',
      'contract_id',
      'contract_version',
      'schema_file',
      'schema_locator',
      'schema_sha256',
    ]) {
      expect(
        document[required],
        `an admission names the offered document by ${required}`,
      ).toBeDefined();
    }
  });

  it('maps kind, schema locator, contract id, and contract version as one closed set', () => {
    const branches = loadSchema(INTAKE_SCHEMA).oneOf;
    expect(Array.isArray(branches), 'the mapping is a closed oneOf, not a field triple').toBe(true);
    const declared = (branches as JsonObject[]).map((branch) => {
      const properties = asObject(
        asObject(asObject(branch.properties, 'branch').document, 'document').properties,
        'document.properties',
      );
      const constOf = (name: string): JsonValue =>
        asObject(properties[name], `document.${name}`).const as JsonValue;
      return {
        kind: constOf('kind'),
        contractId: constOf('contract_id'),
        contractVersion: constOf('contract_version'),
        schemaFile: constOf('schema_file'),
        schemaLocator: constOf('schema_locator'),
      };
    });

    for (const entry of declared) {
      const schema = loadSchema(String(entry.schemaFile));
      expect(schema.x_contract_id, `${String(entry.schemaFile)} contract id`).toBe(
        entry.contractId,
      );
      expect(schema.x_contract_version, `${String(entry.schemaFile)} version`).toBe(
        entry.contractVersion,
      );
      expect(SCHEMA_VERSIONS[entry.schemaFile as keyof typeof SCHEMA_VERSIONS]).toBe(
        entry.contractVersion,
      );
      expect(entry.schemaLocator).toBe(
        `content/lesson-factory/schemas/${String(entry.schemaFile)}`,
      );
    }

    expect(
      declared.map((entry) => entry.kind).sort(),
      'the schema mapping and the implementation registry are one registry',
    ).toEqual(INTAKE_REGISTRY.map((entry) => entry.documentKind).sort());
  });

  it('states in the profile that identity is derived and admission is proved', () => {
    const contract = asObject(
      loadArtifact('deadline-profile.json').intake_contract,
      'intake_contract',
    );
    expect(contract.schema_validation_required).toBe(true);
    expect(
      contract.resolver_validation_required,
      'every dynamic reference has to be resolved before a document is admitted',
    ).toBe(true);
    expect(
      contract.schema_validation_alone_sufficient,
      'a consumer that validates with Ajv and stops has not admitted anything',
    ).toBe(false);
    expect(contract.admission_rule).toBe('BOTH_MUST_PASS');
    expect(
      contract.caller_supplied_identity_permitted,
      'a caller that names the kind and the contract has told intake what to conclude',
    ).toBe(false);
    expect(
      contract.admission_proof_required,
      'an admission that is not bound to the offered bytes is an admission of nothing',
    ).toBe(true);
    expect(contract.record_contract).toBe('lesson-factory.intake-validation');
    expect(contract.record_contract_version).toBe(SCHEMA_VERSIONS[INTAKE_SCHEMA]);
    expect(contract.record_schema_path).toBe(`content/lesson-factory/schemas/${INTAKE_SCHEMA}`);
    expect(
      contract.record_schema_sha256,
      'the intake contract is pinned like every other authority in the freeze',
    ).toBe(sha256OfSchema(INTAKE_SCHEMA));
    expect(contract.dynamic_reference_kinds).toEqual([...DYNAMIC_REFERENCE_KINDS]);
  });

  it('names as dynamic exactly the reference kinds a runner will write', () => {
    const derived = REFERENCE_KINDS.filter(
      (kind) => kind.resolution.strategy === 'DERIVED_PATH',
    ).map((kind) => kind.kind);
    expect(
      [...DYNAMIC_REFERENCE_KINDS].sort(),
      'a reference whose target is produced at runtime is exactly the reference Ajv cannot check',
    ).toEqual(derived.sort());
  });

  it('keeps the shipped control in step with the frozen profile it claims to have admitted', () => {
    const control = loadFixture('intake-validation.json') as unknown as IntakeRecord;
    expect(verifyIntake(control, profileOffer())).toEqual([]);
  });
});

describe('lesson-factory intake: identity is derived, never accepted', () => {
  it('admits the frozen profile and binds the record to the exact bytes it read', () => {
    const offer = profileOffer();
    const result = record(offer);

    expect(result.admission).toBe('ADMITTED');
    expect(result.document.kind).toBe('profile');
    expect(result.document.contract_id).toBe('lesson-factory.deadline-profile');
    expect(result.document.contract_version).toBe(SCHEMA_VERSIONS['deadline-profile.schema.json']);
    expect(result.document.schema_file).toBe('deadline-profile.schema.json');
    expect(result.document.schema_locator).toBe(
      'content/lesson-factory/schemas/deadline-profile.schema.json',
    );
    expect(result.document.schema_sha256).toBe(sha256OfSchema('deadline-profile.schema.json'));
    expect(result.document.sha256).toBe(sha256OfFile(join(REPO_ROOT, PROFILE_PATH)));
    expect(result.document.ref).toBe(`profile:${PROFILE_PATH}#sha256:${result.document.sha256}`);
    expect(
      validateAgainst(loadRegistry(), schemaId(INTAKE_SCHEMA), result as unknown as JsonObject),
    ).toEqual([]);
  });

  it('refuses a document that relabels itself as another contract at its own locator', () => {
    const relabelled = {
      ...loadArtifact('deadline-profile.json'),
      contract_id: 'lesson-factory.lesson-handoff',
    };
    expect(() => record(offerOf(relabelled, PROFILE_PATH))).toThrow(IntakeRefusal);
    try {
      record(offerOf(relabelled, PROFILE_PATH));
    } catch (error) {
      expect((error as IntakeRefusal).code).toBe('LOCATOR_NOT_CANONICAL');
    }
  });

  it('refuses a relabelled document even when it is offered at a canonical locator for the label', () => {
    const relabelled = {
      ...loadArtifact('deadline-profile.json'),
      contract_id: 'lesson-factory.lesson-handoff',
    };
    const result = record(offerOf(relabelled, HANDOFF_LOCATOR));
    expect(
      result.document.kind,
      'the label decides which contract is applied, not which one passes',
    ).toBe('handoff');
    expect(result.admission).toBe('REJECTED');
    expect(result.refusal_code).toBe('SCHEMA_INVALID');
  });

  it('refuses a document whose contract this freeze does not ship', () => {
    const invented = {
      ...loadArtifact('deadline-profile.json'),
      contract_id: 'lesson-factory.answer-key',
    };
    expect(() => record(offerOf(invented, PROFILE_PATH))).toThrow(/contract/i);
  });

  it('refuses a test-only envelope at the door', () => {
    expect(() => record(offerOf(loadFixtureEnvelope('kit-manifest.json'), PROFILE_PATH))).toThrow(
      IntakeRefusal,
    );
  });

  it('refuses a document offered at a locator that is not a canonical location for its kind', () => {
    const profile = loadArtifact('deadline-profile.json');
    expect(() =>
      record(offerOf(profile, 'tests/architecture/lesson-factory/fixtures/profile.json')),
    ).toThrow(/locator/i);
  });
});

describe('lesson-factory intake: references are discovered, not declared by the caller', () => {
  it('derives a row for every reference the contract declares', () => {
    const declared = declaredReferencePointers(
      'deadline-profile.schema.json',
      loadArtifact('deadline-profile.json'),
    );
    expect(declared, 'the profile declares reference-typed fields').toContain(
      '/release_policy_ref',
    );
    expect(declared).toContain('/lifecycle_nonclaims_ref');

    const rows = record(profileOffer()).resolver_validation.references.map((row) => row.field);
    for (const pointer of declared) {
      expect(rows, `a contract-declared reference at ${pointer} must be checked`).toContain(
        pointer,
      );
    }
  });

  it('binds each row to the field it came from, the kind, the digest, and the resolver result', () => {
    const profile = loadArtifact('deadline-profile.json');
    const rows = record(profileOffer()).resolver_validation.references;
    const policy = rows.find((row) => row.field === '/release_policy_ref');
    expect(policy?.kind).toBe('policy');
    expect(policy?.status).toBe('RESOLVED');
    expect(policy?.digest).toBe(String(profile.release_policy_ref).split('#sha256:')[1]);
    expect(record(profileOffer()).resolver_validation.checked_count).toBe(rows.length);
  });

  it('refuses a document whose reference is well formed, correctly hashed, and points elsewhere', () => {
    const lifecycleDigest = sha256OfFile(`${PROFILE_DIR}/lifecycle-nonclaims.json`);
    const result = record(
      offerOf(
        {
          ...loadArtifact('deadline-profile.json'),
          // A real digest of a real file in the freeze, under the policy kind. Ajv sees a
          // conforming policy reference; the resolver sees a policy that is not the policy.
          release_policy_ref: `policy:${POLICY_PATH}#sha256:${lifecycleDigest}`,
        },
        PROFILE_PATH,
      ),
    );
    expect(result.admission).toBe('REJECTED');
    expect(result.resolver_validation.status).toBe('FAIL');
  });

  it('reports a reference to an artifact no runner has written yet as unresolved, not as valid', () => {
    const result = record(offerOf(loadFixture('lesson-handoff.json'), HANDOFF_LOCATOR));
    // The packet this handoff names does not exist: WP-01 freezes contracts, it runs
    // nothing. That is a refusal to admit, not a pass.
    expect(result.admission).toBe('REJECTED');
    expect(result.refusal_code).toBe('REFERENCES_UNRESOLVED');
    expect(
      result.resolver_validation.references.find((row) => row.field === '/task_packet_ref')?.status,
    ).toBe('NOT_YET_PRODUCED');
  });

  it('cannot be satisfied by the schema half alone', () => {
    const handoff = loadFixture('lesson-handoff.json');
    // Ajv is happy with this document …
    expect(
      validateAgainst(loadRegistry(), schemaId('lesson-handoff.schema.json'), handoff),
    ).toEqual([]);
    // … and intake still refuses it, which is the whole point of the contract.
    expect(record(offerOf(handoff, HANDOFF_LOCATOR)).admission).toBe('REJECTED');
  });
});

/**
 * The authority half. A schema can check that a record is shaped like an admission; only
 * a recomputation from the offered bytes can check that it is an admission *of them*.
 * Each row below is a record that validates against the contract and is still a lie.
 */
describe('lesson-factory intake: an admission is bound to the bytes it admitted', () => {
  const registry = loadRegistry();
  const admitted = (): IntakeRecord => record(profileOffer());

  const forgeries: Array<[string, (base: IntakeRecord) => IntakeRecord, () => Offer]> = [
    [
      'the offered document changed by one byte after it was admitted',
      (base) => base,
      () => {
        const profile = loadArtifact('deadline-profile.json');
        return offerOf({ ...profile, profile_version: '1.0.1' }, PROFILE_PATH);
      },
    ],
    [
      'the document digest swapped for the digest of another frozen artifact',
      (base) => ({
        ...base,
        document: { ...base.document, sha256: sha256OfFile(`${PROFILE_DIR}/release-policy.json`) },
      }),
      profileOffer,
    ],
    [
      'the document relabelled as another kind on a record that is otherwise true',
      (base) => ({ ...base, document: { ...base.document, kind: 'policy' } }),
      profileOffer,
    ],
    [
      'the contract version rolled back on a record that is otherwise true',
      (base) => ({ ...base, document: { ...base.document, contract_version: '1.0.0' } }),
      profileOffer,
    ],
    [
      'the reference counts zeroed while the document still carries references',
      (base) => ({
        ...base,
        resolver_validation: { ...base.resolver_validation, checked_count: 0 },
      }),
      profileOffer,
    ],
    [
      'the reference rows emptied',
      (base) => ({
        ...base,
        resolver_validation: {
          ...base.resolver_validation,
          checked_count: 0,
          references: [],
        },
      }),
      profileOffer,
    ],
    [
      'a reference row duplicated with a different verdict',
      (base) => ({
        ...base,
        resolver_validation: {
          ...base.resolver_validation,
          checked_count: base.resolver_validation.checked_count + 1,
          references: [
            ...base.resolver_validation.references,
            { ...base.resolver_validation.references[0]!, status: 'IDENTITY_ONLY' as const },
          ],
        },
      }),
      profileOffer,
    ],
    [
      'a record for the profile attached to the policy',
      (base) => base,
      () => offerFromPath(POLICY_PATH),
    ],
  ];

  it.each(forgeries)('refuses %s', (_name, forge, offer) => {
    const forged = forge(admitted());
    expect(
      verifyIntake(forged, offer()),
      'a record that survives recomputation against bytes it does not describe is not an admission',
    ).not.toEqual([]);
  });

  it('refuses an ADMITTED record nobody derived', () => {
    const genuine = admitted();
    const selfAuthored: IntakeRecord = {
      ...genuine,
      admission_proof: {
        derivation: genuine.admission_proof.derivation,
        // A digest of the right shape, of nothing.
        derivation_sha256: sha256OfFile(`${PROFILE_DIR}/lifecycle-nonclaims.json`),
      },
    };
    expect(
      validateAgainst(registry, schemaId(INTAKE_SCHEMA), selfAuthored as unknown as JsonObject),
    ).toEqual([]);
    expect(
      verifyIntake(selfAuthored, profileOffer()),
      'the proof is the only thing standing between a record and a wish',
    ).not.toEqual([]);
  });

  it('refuses an ADMITTED record that carries no proof at all', () => {
    const { admission_proof: _dropped, ...unproved } = admitted();
    expect(
      validateAgainst(registry, schemaId(INTAKE_SCHEMA), unproved as unknown as JsonObject),
      'the contract itself requires the proof, so this never reaches the verifier',
    ).not.toEqual([]);
  });

  it('accepts the record it produced, recomputed from the same bytes', () => {
    expect(verifyIntake(admitted(), profileOffer())).toEqual([]);
  });

  it('reads the offered bytes from disk exactly as they are, comments and formatting included', () => {
    const offer = offerFromPath(PROFILE_PATH);
    expect(offer.bytes.equals(readFileSync(join(REPO_ROOT, PROFILE_PATH)))).toBe(true);
    expect(offer.locator).toBe(PROFILE_PATH);
  });
});

/**
 * Every document the factory persists has an admission path, and the three contracts
 * that do not are named and given a reason.
 *
 * The previous round admitted ten kinds and refused the rest with `UNKNOWN_CONTRACT`,
 * which is fail-closed but not finished: a team handoff and an import index are real
 * artifacts a lane and a packager write to disk, and "we never gave that one a locator"
 * is not a scope decision. The other three genuinely are out of scope, for three
 * different reasons, and saying so in the profile is what stops the list from being read
 * as an oversight later.
 */
describe('lesson-factory intake: every persisted factory document has an admission path', () => {
  const scope = (): JsonObject =>
    asObject(loadArtifact('deadline-profile.json').intake_contract, 'intake_contract');

  it('admits the team handoff and the import index like any other factory artifact', () => {
    const admissible = INTAKE_REGISTRY.map((entry) => entry.documentKind);
    expect(admissible).toContain('team-handoff');
    expect(admissible).toContain('import-index');
  });

  it('accounts for every shipped contract, as admissible or as declared out of scope', () => {
    const declared = (scope().non_admissible_contracts as JsonObject[]).map((entry) =>
      String(entry.contract_id),
    );
    const admissible = INTAKE_REGISTRY.map((entry) => entry.contractId);

    const shipped = Object.keys(SCHEMA_VERSIONS).map((file) =>
      String(loadSchema(file).x_contract_id),
    );
    expect(
      [...admissible, ...declared].sort(),
      'a contract that is neither admissible nor declared out of scope is an oversight wearing the shape of a decision',
    ).toEqual([...shipped].sort());
    expect(
      admissible.filter((id) => declared.includes(id)),
      'a contract cannot be both admissible and out of scope',
    ).toEqual([]);
  });

  it('gives each out-of-scope contract the reason it is out of scope', () => {
    const byId = new Map(
      (scope().non_admissible_contracts as JsonObject[]).map((entry) => [
        String(entry.contract_id),
        String(entry.reason_code),
      ]),
    );
    expect(
      byId.get('lesson-factory.shared-vocabulary'),
      'the vocabulary defines types; there is no vocabulary document to admit',
    ).toBe('SCHEMA_ONLY');
    expect(
      byId.get('lesson-factory.intake-validation'),
      'the admission record is the output of intake, not an input to it',
    ).toBe('ADMISSION_RECORD');
    expect(
      byId.get('lesson-factory.runner-log-record'),
      'a log line is an event bounded by the log contract, not an artifact anyone hands on',
    ).toBe('LOG_EVENT');
  });

  it('does not admit its own records, so admission cannot be laundered through a second pass', () => {
    const control = loadFixture('intake-validation.json');
    expect(() => record(offerOf(control, PROFILE_PATH))).toThrow(IntakeRefusal);
  });

  it('does not admit a log line', () => {
    expect(() => record(offerOf(loadFixture('runner-log-record.json'), 'lane-01'))).toThrow(
      /contract/i,
    );
  });
});

/**
 * The two lane-level artifacts, admitted end to end.
 *
 * Both reference artifacts a runner writes, so until one runs they resolve to
 * `NOT_YET_PRODUCED` and intake refuses them — correctly, and uselessly as a test of the
 * admitted path. So these tests write the targets first, exactly where the locator says
 * a runner would put them, then admit the document against them and clean up. What is
 * being proved is that nothing about these two kinds is special: the same derivation, the
 * same proof, the same recomputation.
 */
describe('lesson-factory intake: the team handoff and the import index, admitted', () => {
  const produced: string[] = [];

  /** Write the artifacts a document's references name, and re-pin the document to them. */
  const produceTargets = (document: JsonObject): JsonObject => {
    const text = JSON.stringify(document);
    let rewritten = text;
    for (const match of text.matchAll(/"([a-z][a-z0-9-]*):([^"#]+)#sha256:([0-9a-f]{64})"/g)) {
      const [whole = '', kind = '', locator = ''] = match;
      const { resolution } = referenceKind(kind);
      if (resolution.strategy !== 'DERIVED_PATH') continue;
      const expectedPath = resolution.template(locator);
      const path = join(REPO_ROOT, expectedPath);
      if (!existsSync(path)) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `${JSON.stringify({ produced_for: expectedPath }, null, 2)}\n`);
        produced.push(path);
      }
      const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
      rewritten = rewritten.replaceAll(whole, `"${kind}:${locator}#sha256:${digest}"`);
    }
    return JSON.parse(rewritten) as JsonObject;
  };

  const SCRATCH = join(REPO_ROOT, '.tmp', 'lesson-factory');
  const scratchExisted = existsSync(SCRATCH);

  afterAll(() => {
    // Leave the scratch tree as it was found: if a runner's directory was already there,
    // remove only the files this suite wrote; if there was nothing, remove the lot.
    if (scratchExisted) for (const path of produced) rmSync(path, { force: true });
    else rmSync(SCRATCH, { recursive: true, force: true });
  });

  /**
   * Move a control onto lane and kit numbers no other suite and no runner uses.
   *
   * The targets below are written under `.tmp/`, where a runner will one day write real
   * ones. Producing them at the control's own `lane-01` would put this test in the way of
   * anything that resolves that lane — including the script that regenerates the two
   * refusal controls, which would start producing admissions. `-99` is reserved for tests
   * that write.
   */
  const reserve = (document: JsonObject): JsonObject =>
    JSON.parse(
      JSON.stringify(document)
        .replaceAll('lane-01', 'lane-99')
        .replaceAll('kit-01', 'kit-99')
        .replaceAll('assignment-01', 'assignment-99')
        .replaceAll('import-index-01', 'import-index-99'),
    ) as JsonObject;

  const reserved = (locator: string): string =>
    locator.replaceAll('lane-01', 'lane-99').replaceAll('import-index-01', 'import-index-99');

  const cases: Array<[string, string, string]> = [
    ['team-handoff', 'team-handoff.json', 'lane-01'],
    ['import-index', 'import-index.json', 'lesson-factory-deadline-2026-08-03/import-index-01'],
  ];

  it.each(cases)('admits a %s once the artifacts it names exist', (kind, fixture, at) => {
    const locator = reserved(at);
    const offer = offerOf(produceTargets(reserve(loadFixture(fixture))), locator);
    const result = record(offer);

    expect(result.document.kind).toBe(kind);
    expect(result.admission, JSON.stringify(result.resolver_validation, null, 2)).toBe('ADMITTED');
    expect(result.document.ref).toBe(`${kind}:${locator}#sha256:${result.document.sha256}`);
    expect(result.resolver_validation.checked_count).toBeGreaterThan(0);
    expect(
      validateAgainst(loadRegistry(), schemaId(INTAKE_SCHEMA), result as unknown as JsonObject),
    ).toEqual([]);
    expect(verifyIntake(result, offer)).toEqual([]);
  });

  it.each(cases)('refuses a %s whose targets are not written yet', (kind, fixture, locator) => {
    const result = record(offerOf(loadFixture(fixture), locator));
    expect(result.document.kind).toBe(kind);
    expect(result.admission).toBe('REJECTED');
    expect(
      result.refusal_code,
      'the schema half passes; what is missing is the artifacts, and the record says so',
    ).toBe('REFERENCES_UNRESOLVED');
    expect(result.schema_validation.status).toBe('PASS');
  });

  it.each(cases)('refuses a %s offered at a locator of the other kind', (_kind, fixture, _l) => {
    const other =
      _kind === 'team-handoff' ? 'lesson-factory-deadline-2026-08-03/import-index-01' : 'lane-01';
    expect(() => record(offerOf(loadFixture(fixture), other))).toThrow(/locator/i);
  });

  it.each(cases)('refuses %s bytes relabelled as the other contract', (kind, fixture, locator) => {
    const other =
      kind === 'team-handoff' ? 'lesson-factory.import-index' : 'lesson-factory.team-handoff';
    const relabelled = { ...loadFixture(fixture), contract_id: other };
    // The label decides which contract is applied, so the locator no longer fits either.
    expect(() => record(offerOf(relabelled, locator))).toThrow(/locator/i);
  });

  it.each(cases)('refuses a forged admission of a %s', (_kind, fixture, at) => {
    const offer = offerOf(produceTargets(reserve(loadFixture(fixture))), reserved(at));
    const genuine = record(offer);
    const forgeries: IntakeRecord[] = [
      { ...genuine, document: { ...genuine.document, contract_version: '1.0.0' } },
      {
        ...genuine,
        document: { ...genuine.document, sha256: sha256OfFile(join(REPO_ROOT, PROFILE_PATH)) },
      },
      {
        ...genuine,
        resolver_validation: { ...genuine.resolver_validation, checked_count: 0, references: [] },
      },
      {
        ...genuine,
        admission_proof: {
          ...genuine.admission_proof,
          derivation_sha256: sha256OfFile(`${PROFILE_DIR}/lifecycle-nonclaims.json`),
        },
      },
    ];
    for (const forged of forgeries) {
      expect(verifyIntake(forged, offer), JSON.stringify(forged.document)).not.toEqual([]);
    }
    // And the genuine one still verifies, so the table above is testing the forgery.
    expect(verifyIntake(genuine, offer)).toEqual([]);
  });
});
