import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditSchema,
  collectPropertyNames,
  collectRefs,
  SUPPORTED_KEYWORDS,
  validateAgainst,
  withMutation,
  type JsonObject,
  type JsonValue,
} from './lesson-factory/json-schema-subset';
import { declaredProsePointers, loadControl } from './lesson-factory/negative-cases';
import {
  CANONICAL_ROUTES,
  INJECTION_SURFACES,
  DECISION_ROLE,
  DOC_PATH,
  EVIDENCE_CLASS_IDS,
  FIXTURE_CONTROLS,
  HARD_GATE_IDS,
  loadArtifact,
  loadFixture,
  loadRegistry,
  loadSchema,
  LOG_FORBIDDEN_TOKENS,
  LOG_SCHEMA_FILE,
  NONCLAIM_FLAGS,
  PROFILE_ARTIFACTS,
  PROFILE_DIR,
  PROTECTED_FIELD_TOKENS,
  RECEIPT_FILE,
  REPO_ROOT,
  resolveContractRef,
  ROUTE_SCOPE_CODE,
  RUBRIC_PATH,
  RUBRIC_VERSION,
  SCHEMA_DIR,
  SCHEMA_FILES,
  SCHEMA_VERSIONS,
  schemaId,
  SCREENED_STATUS,
  sha256OfFile,
  sha256OfSchema,
} from './lesson-factory/contract-registry';
import { resolveReference, sha256OfPath } from './lesson-factory/reference-model.js';

/**
 * WP-01 — the frozen `CANDIDATE_RUBRIC_SCREENED` deadline contract.
 *
 * This suite pins the machine-readable contract that the packet, author, judge,
 * handoff, intake, and database work packages consume. It asserts the shape and
 * the release policy; `lesson-factory-fail-closed.test.ts` proves the fail-closed
 * behaviour with negative fixtures.
 *
 * Authorities pinned here: `key-docs/lesson-quality-rubric.md` v0.9.1,
 * `docs/design/05-LESSON-STRUCTURAL-AUTHORING-SPEC.md` (R1–R15), and
 * `docs/lesson-evidence-mastery-contract.md`.
 */

const asObject = (value: JsonValue | undefined, label: string): JsonObject => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object, found ${JSON.stringify(value)}`);
  }
  return value;
};

/**
 * Every contract field that names the frozen release policy. For this deadline release
 * there is exactly one policy, at exactly one digest, so every one of these must pin it
 * rather than describe the shape a policy reference takes.
 */
const POLICY_REF_FIELDS: ReadonlyArray<[string, string]> = [
  ['deadline-profile.schema.json', 'release_policy_ref'],
  ['assignment-manifest.schema.json', 'release_policy_ref'],
  ['kit-manifest.schema.json', 'release_policy_ref'],
  ['task-source-packet.schema.json', 'release_policy_ref'],
  ['lesson-handoff.schema.json', 'release_policy_ref'],
];

const isConstrainedString = (node: JsonObject): boolean =>
  node.pattern !== undefined || node.enum !== undefined || node.const !== undefined;

/**
 * Every `type: "string"` node a contract can reach from `start`, with `$ref`s followed
 * into the shared vocabulary. Following the refs is the point: a field typed
 * `NonEmptyString` looks constrained at the call site and accepts any prose.
 */
const reachableStringNodes = (fileName: string, start?: string): Array<[string, JsonObject]> => {
  const found: Array<[string, JsonObject]> = [];
  const seen = new Set<string>();
  const walk = (node: JsonValue, path: string, file: string): void => {
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}/${index}`, file));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const object = node;
    if (object.type === 'string') found.push([path, object]);
    const ref = object.$ref;
    if (typeof ref === 'string' && !seen.has(`${file}|${ref}`)) {
      seen.add(`${file}|${ref}`);
      const [uri = ''] = ref.split('#');
      walk(resolveContractRef(ref, file), `${path} -> ${ref}`, uri === '' ? file : uri);
    }
    for (const [key, value] of Object.entries(object)) {
      if (key !== '$ref') walk(value, `${path}/${key}`, file);
    }
  };
  const schema = loadSchema(fileName);
  const root =
    start === undefined
      ? schema
      : asObject(asObject(schema.properties, 'properties')[start], start);
  walk(root, start === undefined ? fileName : `${fileName}#${start}`, fileName);
  return found;
};

describe('lesson-factory deadline contract: the contract set exists and is versioned', () => {
  it('ships every required schema, each closed, versioned, and self-identifying', () => {
    for (const fileName of SCHEMA_FILES) {
      const schema = loadSchema(fileName);
      expect(schema.$schema, `${fileName} must declare the 2020-12 dialect`).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      );
      expect(schema.$id, `${fileName} must be addressed by a versioned $id`).toBe(
        schemaId(fileName),
      );
      expect(typeof schema.x_contract_id, `${fileName} must carry a stable contract id`).toBe(
        'string',
      );
      expect(schema.x_contract_version, `${fileName} must be versioned`).toBe(
        SCHEMA_VERSIONS[fileName],
      );
    }
  });

  it('closes every object it defines and uses no keyword the checker ignores', () => {
    for (const fileName of SCHEMA_FILES) {
      const audit = auditSchema(loadSchema(fileName));
      expect(audit.problems, `${fileName} contract discipline`).toEqual([]);
      for (const keyword of audit.keywords) {
        expect(SUPPORTED_KEYWORDS.has(keyword), `${fileName} uses keyword ${keyword}`).toBe(true);
      }
    }
  });

  it('resolves every cross-contract $ref inside the frozen set', () => {
    const registry = loadRegistry();
    for (const fileName of SCHEMA_FILES) {
      for (const ref of collectRefs(loadSchema(fileName))) {
        const [uri] = ref.split('#');
        const target =
          uri === undefined || uri === ''
            ? schemaId(fileName)
            : new URL(uri, schemaId(fileName)).href;
        expect(registry.get(target), `${fileName} references ${ref}`).toBeDefined();
      }
    }
  });

  it('ships the profile artifacts and each validates against its own schema', () => {
    const registry = loadRegistry();
    for (const [artifact, schemaFile] of Object.entries(PROFILE_ARTIFACTS)) {
      const document = loadArtifact(artifact);
      expect(validateAgainst(registry, schemaId(schemaFile), document), artifact).toEqual([]);
    }
  });

  it('ships a valid control instance for every contract with no shipped artifact', () => {
    const registry = loadRegistry();
    for (const [fixture, schemaFile] of Object.entries(FIXTURE_CONTROLS)) {
      const document = loadFixture(fixture);
      expect(validateAgainst(registry, schemaId(schemaFile), document), fixture).toEqual([]);
    }
  });

  it('makes every instance declare the one contract version its schema is', () => {
    for (const fileName of SCHEMA_FILES) {
      const schema = loadSchema(fileName);
      const properties = schema.properties;
      if (properties === undefined) continue;
      const node = asObject(properties, `${fileName} properties`).contract_version;
      if (node === undefined) continue;
      expect(
        asObject(node, `${fileName}/contract_version`).const,
        `${fileName} must pin contract_version; a free semantic version lets an instance claim a contract version this schema never described`,
      ).toBe(SCHEMA_VERSIONS[fileName]);
    }
  });

  it('ships no instance that claims a version other than the one it was validated against', () => {
    for (const [artifact, schemaFile] of Object.entries(PROFILE_ARTIFACTS)) {
      expect(loadArtifact(artifact).contract_version, artifact).toBe(
        SCHEMA_VERSIONS[schemaFile as keyof typeof SCHEMA_VERSIONS],
      );
    }
    for (const [fixture, schemaFile] of Object.entries(FIXTURE_CONTROLS)) {
      expect(loadFixture(fixture).contract_version, fixture).toBe(
        SCHEMA_VERSIONS[schemaFile as keyof typeof SCHEMA_VERSIONS],
      );
    }
  });
});

describe('lesson-factory deadline contract: paths and commands are not free text', () => {
  it('retires the general repository-path and command types', () => {
    const defs = asObject(loadSchema('shared-vocabulary.schema.json').$defs, '$defs');
    for (const retired of ['RepoPath', 'ValidatorCommand']) {
      expect(
        defs[retired],
        `${retired} admits any path or any pnpm invocation; an authority pinned by a shape is not pinned`,
      ).toBeUndefined();
    }
    for (const fileName of SCHEMA_FILES) {
      for (const ref of collectRefs(loadSchema(fileName))) {
        expect(ref, `${fileName} still reaches a retired general type`).not.toMatch(
          /(?:RepoPath|ValidatorCommand)$/,
        );
      }
    }
  });

  it('names each pinned authority document by its one literal path', () => {
    const rubric = asObject(
      resolveContractRef(
        'shared-vocabulary.schema.json#/$defs/RubricIdentity',
        'shared-vocabulary.schema.json',
      ) as JsonValue,
      'RubricIdentity',
    );
    const path = asObject(
      asObject(rubric.properties, 'RubricIdentity properties').rubric_path,
      'rubric_path',
    );
    expect(
      path.const,
      'the rubric a screen cites is one file, so the contract should name that file',
    ).toBe('key-docs/lesson-quality-rubric.md');
  });

  it('records which screen ran as a code and a pinned run, never as a command line', () => {
    const defs = asObject(loadSchema('shared-vocabulary.schema.json').$defs, '$defs');
    const code = asObject(defs.ScreenCode, 'ScreenCode');
    expect(code.enum, 'the screens a runner may record are a closed set').toEqual([
      ...HARD_GATE_IDS,
    ]);

    for (const name of ['HardGateResult', 'StructuralValidation']) {
      const record = asObject(defs[name], name);
      const properties = asObject(record.properties, `${name} properties`);
      expect(
        Object.keys(properties).filter((key) => key.endsWith('_command')),
        `${name} must not record an executable command; a command string is implementation mapping, and on a record it is prose with a technical name`,
      ).toEqual([]);
      expect(properties.screen_code, `${name} must say which screen ran`).toBeDefined();
      expect(
        properties.screen_ref,
        `${name} must pin the run that produced the result`,
      ).toBeDefined();
    }
  });

  it('declares no command field on any shipped instance', () => {
    for (const [artifact] of Object.entries(PROFILE_ARTIFACTS)) {
      expect(JSON.stringify(loadArtifact(artifact)), artifact).not.toMatch(/_command"/);
    }
    for (const [fixture] of Object.entries(FIXTURE_CONTROLS)) {
      expect(JSON.stringify(loadFixture(fixture)), fixture).not.toMatch(/_command"/);
    }
  });
});

describe('lesson-factory deadline contract: the deadline profile pins its authorities', () => {
  it('pins rubric 0.9.1 by exact hash, so a rubric edit cannot silently relabel a screen', () => {
    const profile = loadArtifact('deadline-profile.json');
    const rubric = asObject(profile.rubric_identity, 'rubric_identity');
    expect(rubric.rubric_version).toBe(RUBRIC_VERSION);
    expect(rubric.rubric_path).toBe('key-docs/lesson-quality-rubric.md');
    expect(
      rubric.rubric_sha256,
      'the pinned rubric hash no longer matches key-docs/lesson-quality-rubric.md; re-pin the profile deliberately rather than loosening this test',
    ).toBe(sha256OfFile(RUBRIC_PATH));
  });

  it('names structural, mastery, and template authorities that exist on disk', () => {
    const profile = loadArtifact('deadline-profile.json');
    const structural = asObject(profile.structural_authority, 'structural_authority');
    const mastery = asObject(profile.mastery_authority, 'mastery_authority');
    expect(structural.validator_rule_set).toBe('R1-R15');
    for (const path of [
      structural.spec_path,
      mastery.contract_path,
      profile.canonical_template_path,
    ]) {
      expect(typeof path).toBe('string');
      expect(existsSync(join(REPO_ROOT, String(path))), `${String(path)} must exist`).toBe(true);
    }
  });

  it('pins its own companion artifacts by hash, so the freeze is a real chain', () => {
    const profile = loadArtifact('deadline-profile.json');
    const policy = loadArtifact('release-policy.json');
    const receipt = loadArtifact(RECEIPT_FILE);
    const authority = asObject(policy.policy_authority, 'policy_authority');
    const provenance = asObject(receipt.decision_provenance, 'decision_provenance');

    // profile -> release policy -> owner receipt -> verbatim statement, plus the
    // lifecycle register. Resolved through the trusted resolver rather than compared by
    // suffix: a hash that matches while the locator names something else pins nothing.
    const chain: Array<[string, string]> = [
      [String(profile.release_policy_ref), 'policy'],
      [String(profile.lifecycle_nonclaims_ref), 'lifecycle'],
      [String(authority.decision_ref), 'receipt'],
    ];
    for (const [reference, kind] of chain) {
      expect(() => resolveReference(reference, kind), `${reference}`).not.toThrow();
    }
    expect(
      provenance.statement_sha256,
      'the receipt no longer pins the bytes of the verbatim statement it cites',
    ).toBe(sha256OfPath(String(provenance.statement_path)));

    const structural = asObject(profile.structural_authority, 'structural_authority');
    const mastery = asObject(profile.mastery_authority, 'mastery_authority');
    expect(structural.spec_sha256).toBe(
      sha256OfFile(join(REPO_ROOT, String(structural.spec_path))),
    );
    expect(mastery.contract_sha256).toBe(
      sha256OfFile(join(REPO_ROOT, String(mastery.contract_path))),
    );

    const logBoundary = asObject(profile.log_boundary, 'log_boundary');
    expect(
      logBoundary.record_schema_sha256,
      'the profile no longer pins the bytes of the runner log contract',
    ).toBe(sha256OfSchema(LOG_SCHEMA_FILE));
  });

  it('declares exactly the six hard gates, all unwaivable and fail-closed', () => {
    const gates = asObject(loadArtifact('deadline-profile.json').hard_gates, 'hard_gates');
    expect(Object.keys(gates).sort()).toEqual([...HARD_GATE_IDS].sort());
    for (const [gateId, raw] of Object.entries(gates)) {
      const gate = asObject(raw, gateId);
      expect(gate.enforcement, gateId).toBe('HARD');
      expect(gate.fail_closed, gateId).toBe(true);
      expect(gate.waivable, gateId).toBe(false);
    }
  });

  it('declares the six missing-evidence classes BLOCKED and un-normalizable', () => {
    const classes = asObject(
      loadArtifact('deadline-profile.json').evidence_classes,
      'evidence_classes',
    );
    expect(Object.keys(classes).sort()).toEqual([...EVIDENCE_CLASS_IDS].sort());
    for (const [classId, raw] of Object.entries(classes)) {
      const evidenceClass = asObject(raw, classId);
      expect(evidenceClass.expected_state, classId).toBe('BLOCKED');
      expect(evidenceClass.normalization_to_pass_allowed, classId).toBe(false);
      expect(typeof evidenceClass.blocker_code, `${classId} must name its blocker`).toBe('string');
    }
  });

  it('keeps author diagnostics and official quality results in separate namespaces', () => {
    const namespaces = asObject(loadArtifact('deadline-profile.json').namespaces, 'namespaces');
    expect(namespaces.author_diagnostics_namespace).toBe('author_diagnostics');
    expect(namespaces.official_quality_namespace).toBe('official_quality_result');
    expect(namespaces.separation_enforced).toBe(true);
    expect(namespaces.author_diagnostics_namespace).not.toBe(namespaces.official_quality_namespace);
  });

  it('states the screened status as a lifecycle value that claims nothing', () => {
    const profile = loadArtifact('deadline-profile.json');
    const lifecycle = loadArtifact('lifecycle-nonclaims.json');
    expect(profile.screened_status).toBe(SCREENED_STATUS);
    expect(lifecycle.screened_status).toBe(SCREENED_STATUS);
    expect(lifecycle.status_kind).toBe('LIFECYCLE_ONLY');

    for (const document of [profile, lifecycle]) {
      const nonclaims = asObject(document.nonclaims, 'nonclaims');
      expect(Object.keys(nonclaims).sort()).toEqual([...NONCLAIM_FLAGS].sort());
      for (const flag of NONCLAIM_FLAGS) {
        expect(nonclaims[flag], `${flag} must be false`).toBe(false);
      }
    }

    const asserts = lifecycle.never_asserts;
    expect(Array.isArray(asserts) && asserts.length >= NONCLAIM_FLAGS.length).toBe(true);
  });
});

describe('lesson-factory deadline contract: the four-route proof and STANDARD-only policy', () => {
  it('defines the route proof as an object with exactly the four canonical members', () => {
    const shared = loadSchema('shared-vocabulary.schema.json');
    const defs = asObject(shared.$defs, '$defs');
    const routeProofs = asObject(defs.RouteProofs, 'RouteProofs');
    expect(routeProofs.type).toBe('object');
    expect(routeProofs.additionalProperties).toBe(false);
    expect(routeProofs.minProperties).toBe(4);
    expect(routeProofs.maxProperties).toBe(4);
    expect((routeProofs.required as string[]).slice().sort()).toEqual([...CANONICAL_ROUTES].sort());
    expect(Object.keys(asObject(routeProofs.properties, 'properties')).sort()).toEqual(
      [...CANONICAL_ROUTES].sort(),
    );
  });

  it('makes only STANDARD applicable, with a policy-backed absence proof for the rest', () => {
    const policy = loadArtifact('release-policy.json');
    expect(policy.applicable_routes).toEqual(['STANDARD']);
    const proofs = asObject(policy.route_proofs, 'route_proofs');
    expect(Object.keys(proofs).sort()).toEqual([...CANONICAL_ROUTES].sort());

    const standard = asObject(proofs.STANDARD, 'STANDARD');
    expect(standard.route_applicability).toBe('APPLICABLE');
    expect(standard.absence_proof_ref).toBeNull();
    expect(standard.blocker_code).toBeNull();
    expect((standard.evidence_refs as JsonValue[]).length).toBeGreaterThan(0);

    for (const route of ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']) {
      const proof = asObject(proofs[route], route);
      expect(proof.route_applicability, route).toBe('NOT_APPLICABLE');
      expect(proof.absence_proof_basis, route).toBe('VERSIONED_RELEASE_POLICY');
      expect(typeof proof.absence_proof_ref, `${route} needs an explicit absence proof`).toBe(
        'string',
      );
      expect(proof.blocker_code, route).toBeNull();
      expect((proof.evidence_refs as JsonValue[]).length, route).toBeGreaterThan(0);
    }
  });

  it('records an owner receipt that ratifies STANDARD-only for the initial release', () => {
    const receipt = loadArtifact(RECEIPT_FILE);
    expect(receipt.decision_status).toBe('RATIFIED');
    expect(receipt.decided_by_role).toBe(DECISION_ROLE);
    expect(receipt.initial_release_routes).toEqual(['STANDARD']);

    // The decision is dated twice, in two forms, and the two must agree.
    expect(typeof receipt.decided_at).toBe('string');
    expect(String(receipt.decided_at).startsWith(String(receipt.decision_date))).toBe(true);

    const decisions = asObject(receipt.route_decisions, 'route_decisions');
    expect(Object.keys(decisions).sort()).toEqual([...CANONICAL_ROUTES].sort());
    expect(asObject(decisions.STANDARD, 'STANDARD').decision).toBe('APPLICABLE');
    for (const route of ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']) {
      const decision = asObject(decisions[route], route);
      expect(decision.decision, route).toBe('NOT_APPLICABLE');
      expect(typeof decision.policy_clause_id, `${route} must name the clause it ratifies`).toBe(
        'string',
      );
    }

    expect((receipt.decision_basis_codes as JsonValue[]).length).toBeGreaterThan(0);
  });

  it('states its decision in codes, and keeps the human\u2019s words out of them', () => {
    const receipt = loadArtifact(RECEIPT_FILE);
    expect(receipt.route_scope_code).toBe(ROUTE_SCOPE_CODE);

    // No field of the receipt may hold a sentence. The check is structural rather than a
    // search for suspicious words: the surface admits no prose at all.
    for (const [path, node] of reachableStringNodes('owner-route-policy-receipt.schema.json')) {
      expect(
        isConstrainedString(node),
        `${path} accepts an unconstrained string; a decision field that accepts sentences accepts "and the lesson is approved"`,
      ).toBe(true);
    }
    expect(Object.keys(receipt)).not.toContain('decision_statement');
    expect(Object.keys(receipt)).not.toContain('decision_basis');
    expect(Object.keys(receipt)).not.toContain('scope_limits');

    // The words themselves survive, pinned, outside the machine fields and marked.
    const provenance = asObject(receipt.decision_provenance, 'decision_provenance');
    expect(provenance.authority).toBe('NON_AUTHORITATIVE_VERBATIM_RECORD');
    const statement = readFileSync(join(REPO_ROOT, String(provenance.statement_path)), 'utf8');
    expect(statement).toMatch(/STANDARD/);
    for (const route of ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']) {
      expect(statement, `the statement must name ${route}`).toContain(route);
    }
    expect(statement, 'the verbatim record must say on its face that it decides nothing').toMatch(
      /decides nothing|non-authoritative/i,
    );
  });

  it('derives every route field in both files from one scope code, so they cannot disagree', () => {
    const policy = loadArtifact('release-policy.json');
    const receipt = loadArtifact(RECEIPT_FILE);
    const proofs = asObject(policy.route_proofs, 'route_proofs');
    const decisions = asObject(receipt.route_decisions, 'route_decisions');

    expect(
      receipt.route_scope_code,
      'the receipt and the policy must ratify the same scope; everything else about routes is derived from it',
    ).toBe(policy.route_scope_code);
    expect(receipt.initial_release_routes).toEqual(policy.applicable_routes);

    for (const route of CANONICAL_ROUTES) {
      const applicability = asObject(proofs[route], route).route_applicability;
      const decision = asObject(decisions[route], route).decision;
      const listed = (policy.applicable_routes as string[]).includes(route);
      expect(applicability, `${route}: proof and owner decision must agree`).toBe(decision);
      expect(listed, `${route}: the applicable list must match its proof state`).toBe(
        applicability === 'APPLICABLE',
      );
    }
  });

  it('ratifies the policy by pinned receipt and leaves no ratification blocker', () => {
    const policy = loadArtifact('release-policy.json');
    const authority = asObject(policy.policy_authority, 'policy_authority');
    expect(authority.decision_status).toBe('RATIFIED');
    expect(authority.decided_by_role).toBe(DECISION_ROLE);
    expect(authority.ratification_blockers).toEqual([]);
    expect(String(authority.decision_ref).startsWith('receipt:')).toBe(true);
  });

  it('cites clauses at the policy version that carries them, and only clauses the owner named', () => {
    const policy = loadArtifact('release-policy.json');
    const receipt = loadArtifact(RECEIPT_FILE);
    const proofs = asObject(policy.route_proofs, 'route_proofs');
    const decisions = asObject(receipt.route_decisions, 'route_decisions');

    const ratified = asObject(receipt.ratified_policy, 'ratified_policy');
    expect(ratified.policy_id).toBe(policy.policy_id);
    expect(
      ratified.policy_version,
      'the receipt must ratify the exact policy version it is cited by',
    ).toBe(policy.policy_version);

    for (const route of ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']) {
      const ref = String(asObject(proofs[route], route).absence_proof_ref);
      const clause = String(asObject(decisions[route], route).policy_clause_id);
      expect(ref, `${route} must cite a clause of the current policy version`).toBe(
        `policy:${String(policy.policy_id)}@${String(policy.policy_version)}#clause:${clause}`,
      );
    }
  });

  it('refuses to let a policy take effect before the decision that ratified it', () => {
    const policy = loadArtifact('release-policy.json');
    const receipt = loadArtifact(RECEIPT_FILE);
    expect(
      Date.parse(String(policy.effective_from)) >= Date.parse(String(receipt.decided_at)),
    ).toBe(true);
  });

  it('ratifies route scope only, waiving no nonclaim, gate, or evidence requirement', () => {
    const receipt = loadArtifact(RECEIPT_FILE);
    expect(receipt.decision_authority_scope).toBe('RELEASE_ROUTE_SCOPE_ONLY');

    const nonclaims = asObject(receipt.nonclaims, 'nonclaims');
    for (const flag of NONCLAIM_FLAGS) {
      expect(nonclaims[flag], `${flag} must stay false: the owner ratified a route scope`).toBe(
        false,
      );
    }

    const waivers = asObject(receipt.receipt_nonclaims, 'receipt_nonclaims');
    expect(Object.keys(waivers).length).toBeGreaterThan(0);
    for (const [flag, value] of Object.entries(waivers)) {
      expect(value, `${flag} must be false`).toBe(false);
    }

    // The evidence classes and hard gates are untouched by this ratification.
    const classes = asObject(
      loadArtifact('deadline-profile.json').evidence_classes,
      'evidence_classes',
    );
    expect(asObject(classes.HUMAN_DECISION, 'HUMAN_DECISION').expected_state).toBe('BLOCKED');
  });

  it('keeps the ratification chain acyclic, so no pair of files can pin each other', () => {
    const receipt = loadArtifact(RECEIPT_FILE);
    expect(
      JSON.stringify(receipt),
      'the receipt must not hash-pin the policy that pins it; two files cannot each contain the other\u2019s hash',
    ).not.toMatch(/release-policy\.json#sha256:/);
  });

  it('refuses reviewer opinion, an empty coverage row, and a runtime fallback as absence proofs', () => {
    const shared = loadSchema('shared-vocabulary.schema.json');
    const defs = asObject(shared.$defs, '$defs');
    const basis = asObject(defs.AbsenceProofBasis, 'AbsenceProofBasis');
    const allowed = basis.enum as string[];
    expect(allowed).toContain('VERSIONED_RELEASE_POLICY');
    for (const rejected of ['REVIEWER_OPINION', 'EMPTY_COVERAGE_ROW', 'RUNTIME_FALLBACK']) {
      expect(allowed, `${rejected} is not an absence proof (rubric §3.2)`).not.toContain(rejected);
    }
  });
});

describe('lesson-factory deadline contract: namespace and protected-data separation', () => {
  it('declares no verdict-bearing field anywhere in the candidate namespace', () => {
    for (const fileName of SCHEMA_FILES) {
      for (const property of collectPropertyNames(loadSchema(fileName))) {
        expect(
          property.includes('verdict'),
          `${fileName} declares "${property}"; the factory records a lifecycle status, never a rubric verdict`,
        ).toBe(false);
      }
    }
  });

  it('namespaces every author diagnostic behind diag_ so it cannot read as a result', () => {
    const shared = loadSchema('shared-vocabulary.schema.json');
    const defs = asObject(shared.$defs, '$defs');
    const diagnostics = asObject(defs.AuthorDiagnostics, 'AuthorDiagnostics');
    expect(diagnostics.additionalProperties).toBe(false);
    for (const property of Object.keys(asObject(diagnostics.properties, 'properties'))) {
      expect(property.startsWith('diag_'), `AuthorDiagnostics.${property}`).toBe(true);
    }
  });

  it('never names protected material as a field in any factory contract', () => {
    for (const fileName of SCHEMA_FILES) {
      for (const property of collectPropertyNames(loadSchema(fileName))) {
        for (const token of PROTECTED_FIELD_TOKENS) {
          expect(
            property === token,
            `${fileName} declares protected field "${property}"; protected material is referenced by hash from server-only storage`,
          ).toBe(false);
        }
      }
    }
  });

  it('keeps protected material behind a server-only reference in the lesson handoff', () => {
    const handoff = loadFixture('lesson-handoff.json');
    const reference = asObject(
      handoff.protected_material_reference,
      'protected_material_reference',
    );
    expect(reference.storage_class).toBe('SERVER_ONLY');
    expect(typeof reference.inventory_sha256).toBe('string');
    expect(JSON.stringify(handoff)).not.toMatch(/"(?:answer_key|correct_choice_id|scoring_rules)"/);
  });

  it('admits no unconstrained string on any learner-safe, public, or diagnostic surface', () => {
    // The counterpart to the injection table in the fail-closed suite. That table proves
    // specific payloads are rejected; this proves there is no field left that could
    // accept one, which is the claim that survives a payload nobody thought of.
    const surfaces: Array<[string, string]> = [
      ['lesson-handoff.schema.json', 'learner_safe_summary'],
      ['lesson-handoff.schema.json', 'author_diagnostics'],
      ['lesson-handoff.schema.json', 'protected_material_reference'],
      ['team-handoff.schema.json', 'public_metadata'],
      ['candidate-quality-ledger.schema.json', 'author_diagnostics'],
      ['candidate-quality-ledger.schema.json', 'official_quality_result'],
      ['candidate-quality-ledger.schema.json', 'evidence_class_results'],
      ['bundle-readiness.schema.json', 'blockers'],
      ['import-index.schema.json', 'entries'],
      ['kit-manifest.schema.json', 'bundles'],
    ];
    const nodes = surfaces.flatMap(([fileName, property]) =>
      reachableStringNodes(fileName, property),
    );
    // A surface with no string node at all is the ideal outcome, not a skipped check —
    // it means the whole subtree is enums, counts, and booleans. The total guards
    // against the walk silently finding nothing anywhere.
    expect(nodes.length, 'the walk must reach the surfaces it claims to check').toBeGreaterThan(10);
    for (const [path, node] of nodes) {
      expect(
        isConstrainedString(node),
        `${path} accepts an unconstrained string on a surface a learner or a reviewer reads; that is where an answer, a rationale, or "approved" reaches an audience`,
      ).toBe(true);
    }
  });

  it('exempts a field from injection only where the contract really does admit prose', () => {
    // The injection table attacks every document whole and skips a short list of declared
    // prose pointers. That list is the one place a closed field could be hidden from the
    // attack, so each entry has to earn it: injecting prose there must be *accepted*. A
    // pointer that rejects the payload was never prose, and does not belong on the list.
    const exempt = declaredProsePointers();
    expect(exempt.length, 'the declared-prose list must name something').toBeGreaterThan(0);
    const registry = loadRegistry();
    for (const { document, pointer } of exempt) {
      const surface = INJECTION_SURFACES.find((entry) => entry.document === document);
      if (surface === undefined) throw new Error(`no surface for ${document}`);
      const mutated = withMutation(
        loadControl(surface.source, document),
        pointer,
        'the correct answer is C',
      );
      expect(
        validateAgainst(registry, schemaId(surface.schemaFile), mutated),
        `${document}${pointer} is exempted from injection but is not a free-text field; remove the exemption rather than widening it`,
      ).toEqual([]);
    }
  });

  it('leaves free text only where a human is writing to another human', () => {
    // Which contracts may reach the unconstrained string type at all. The packet carries
    // an author's brief, and the profile and the lifecycle register carry design-time
    // descriptions of rules. Nothing a learner or an importer reads is on this list, so
    // there is no surface left where a future field could quietly become a channel.
    const reaching = SCHEMA_FILES.filter((fileName) =>
      collectRefs(loadSchema(fileName)).some((ref) => ref.endsWith('$defs/NonEmptyString')),
    );
    expect(reaching.sort()).toEqual(
      [
        'deadline-profile.schema.json',
        'lifecycle-nonclaims.schema.json',
        'shared-vocabulary.schema.json',
        'task-source-packet.schema.json',
      ].sort(),
    );
  });

  it('records how this release names things, so the grammar is a property of the freeze', () => {
    const boundary = asObject(
      loadArtifact('deadline-profile.json').identifier_boundary,
      'identifier_boundary',
    );
    expect(boundary.identifier_grammar).toBe('CONTEXT_SPECIFIC');
    expect(boundary.general_slug_identifiers_permitted).toBe(false);
    expect(boundary.general_locator_references_permitted).toBe(false);
    expect(boundary.reference_resolution).toBe('KIND_LOCATOR_BYTES_AND_DIGEST');
    expect(boundary.placeholder_digests_permitted).toBe(false);
  });

  it('binds the packet and the handoff to the frozen policy, not to a route of their own', () => {
    for (const document of ['task-source-packet.json', 'lesson-handoff.json']) {
      const instance = loadFixture(document);
      expect(instance.route_scope_code, document).toBe(ROUTE_SCOPE_CODE);
      expect(instance.applicable_routes, document).toEqual(['STANDARD']);
      expect(instance.ratified_policy_version, document).toBe(
        loadArtifact('release-policy.json').policy_version,
      );
      // The policy reference resolves to the bytes on disk, so a fixture that drifts from
      // the current freeze fails here rather than passing with a stale hash.
      const resolved = resolveReference(instance.release_policy_ref, 'policy');
      expect(resolved.status, document).toBe('RESOLVED');

      const proofs = asObject(instance.route_proofs, 'route_proofs');
      for (const route of CANONICAL_ROUTES) {
        const proof = asObject(proofs[route], route);
        if (route === 'STANDARD') {
          expect(proof.route_applicability, route).toBe('APPLICABLE');
          continue;
        }
        expect(proof.route_applicability, route).toBe('NOT_APPLICABLE');
        expect(proof.absence_proof_basis, route).toBe('VERSIONED_RELEASE_POLICY');
        expect(proof.absence_proof_ref, route).toBe(
          `policy:lesson-factory-deadline-release@${String(
            loadArtifact('release-policy.json').policy_version,
          )}#clause:ROUTE_ABSENCE_${route}`,
        );
      }
    }
  });

  it('pins the policy every deadline consumer reads to the exact ratified bytes', () => {
    const frozen = asObject(
      resolveContractRef(
        'shared-vocabulary.schema.json#/$defs/FrozenReleasePolicyRef',
        'shared-vocabulary.schema.json',
      ) as JsonValue,
      'FrozenReleasePolicyRef',
    );
    const policyDigest = sha256OfFile(join(PROFILE_DIR, 'release-policy.json'));
    expect(
      frozen.const,
      'the frozen policy reference must carry the current policy locator and digest, not a shape a lookalike could satisfy',
    ).toBe(
      `policy:content/lesson-factory/deadline-profile/release-policy.json#sha256:${policyDigest}`,
    );

    // Every field that names the release policy must use that const, not the general
    // policy-reference grammar: a well-formed reference to a *different* policy is
    // exactly the value the grammar cannot reject and the const can.
    for (const [fileName, pointer] of POLICY_REF_FIELDS) {
      const node = asObject(
        asObject(loadSchema(fileName).properties, `${fileName} properties`)[pointer],
        `${fileName}/${pointer}`,
      );
      expect(node.$ref, `${fileName}/${pointer} must pin the frozen policy`).toBe(
        'shared-vocabulary.schema.json#/$defs/FrozenReleasePolicyRef',
      );
    }
  });

  it('gives each excluded route its own clause literal, leaving no reusable policy slug', () => {
    const defs = asObject(loadSchema('shared-vocabulary.schema.json').$defs, '$defs');
    expect(
      defs.PolicyAbsenceProofRef,
      'a general absence-proof grammar is a channel for any policy slug and any clause name',
    ).toBeUndefined();

    const policyVersion = String(loadArtifact('release-policy.json').policy_version);
    for (const route of ['CONCISE', 'MISCONCEPTION', 'PREREQUISITE_SUPPORT']) {
      const name = `${route
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join('')}AbsenceClauseRef`;
      const clause = asObject(defs[name], name);
      expect(clause.const, `${name} must name its own route at the ratified version`).toBe(
        `policy:lesson-factory-deadline-release@${policyVersion}#clause:ROUTE_ABSENCE_${route}`,
      );
    }

    // The union is closed: exactly the three clauses, so an absence proof cannot cite a
    // clause of a policy nobody ratified.
    const union = asObject(defs.AbsenceClauseRef, 'AbsenceClauseRef');
    const members = (union.oneOf ?? union.anyOf) as JsonValue;
    expect(
      Array.isArray(members) && members.length,
      'AbsenceClauseRef must be a closed union',
    ).toBe(3);
  });

  it('applies that check honestly: a free-text definition would fail it', () => {
    const freeText = resolveContractRef(
      'shared-vocabulary.schema.json#/$defs/NonEmptyString',
      'lesson-handoff.schema.json',
    );
    expect(
      isConstrainedString(freeText as JsonObject),
      'NonEmptyString must fail the constrained-string check, or the check proves nothing',
    ).toBe(false);
  });

  it('publishes only learner-safe metadata in the team handoff', () => {
    const team = loadFixture('team-handoff.json');
    const metadata = asObject(team.public_metadata, 'public_metadata');
    expect(metadata.screened_status).toBe(SCREENED_STATUS);
    expect(Object.keys(metadata)).not.toContain('author_diagnostics');
    expect(JSON.stringify(metadata)).not.toMatch(/sha256|protected|diag_/i);
  });
});

describe('lesson-factory deadline contract: runner logs carry no content', () => {
  it('admits no unconstrained string anywhere a runner could write prose', () => {
    const nodes = reachableStringNodes(LOG_SCHEMA_FILE);
    expect(nodes.length, 'the log contract must actually declare string fields').toBeGreaterThan(0);
    for (const [path, node] of nodes) {
      expect(
        isConstrainedString(node),
        `${path} accepts an unconstrained string; a runner log carries enumerated codes, opaque hashes, and counts, never free text`,
      ).toBe(true);
    }
  });

  it('uses log-specific identity types rather than the general reference and blocker types', () => {
    // The general types are patterns over slugs and locators, and a slug can be a
    // sentence with the spaces taken out. The log gets narrower types so that a lesson
    // reference must be a lesson id and a revision, and a blocker must be an enum member.
    const log = JSON.stringify(loadSchema(LOG_SCHEMA_FILE));
    for (const generic of ['$defs/PinnedRef', '$defs/BlockerRef', '$defs/NonEmptyString']) {
      expect(log, `the runner log must not reach ${generic}`).not.toContain(generic);
    }
    const defs = asObject(loadSchema('shared-vocabulary.schema.json').$defs, '$defs');
    expect(asObject(defs.BlockerCode, 'BlockerCode').enum).toBeDefined();
    const lessonRef = asObject(defs.LessonRef, 'LessonRef');
    expect(String(asObject((lessonRef.allOf as JsonValue[])[0], 'LessonRef pattern').pattern)).toBe(
      '^lesson:v3-les-[0-9]{6}@rev-[0-9]{6}#sha256:[0-9a-f]{64}$',
    );
  });

  it('declares no protected, free-text, or catch-all payload field', () => {
    const declared = collectPropertyNames(loadSchema(LOG_SCHEMA_FILE));
    expect(declared.length).toBeGreaterThan(0);
    for (const property of declared) {
      for (const token of LOG_FORBIDDEN_TOKENS) {
        expect(
          property === token,
          `the runner log declares "${property}"; that field is how protected material or arbitrary payload reaches a log line`,
        ).toBe(false);
      }
    }
  });

  it('closes every object in the log record, so no key can be appended at runtime', () => {
    const audit = auditSchema(loadSchema(LOG_SCHEMA_FILE));
    expect(audit.problems).toEqual([]);
  });

  it('binds the log contract into the profile and forbids free text there too', () => {
    const boundary = asObject(loadArtifact('deadline-profile.json').log_boundary, 'log_boundary');
    expect(boundary.record_contract).toBe('lesson-factory.runner-log-record');
    expect(boundary.free_text_permitted).toBe(false);
    expect(boundary.record_schema_sha256).toBe(sha256OfSchema(LOG_SCHEMA_FILE));

    const permitted = boundary.permitted_payload_kinds as string[];
    expect(permitted.slice().sort()).toEqual(['COUNT', 'OPAQUE_CODE', 'OPAQUE_HASH']);
    const forbidden = boundary.forbidden_payload_kinds as string[];
    for (const kind of [
      'PROTECTED_ANSWER',
      'SCORING_AUTHORITY',
      'ACCEPTED_RESPONSE',
      'RATIONALE',
      'SECRET',
      'ARBITRARY_PAYLOAD',
    ]) {
      expect(forbidden, `${kind} must be named as forbidden in the log boundary`).toContain(kind);
    }
  });

  it('permits the things a runner legitimately needs: codes, hashes, and counts', () => {
    const record = loadFixture('runner-log-record.json');
    expect(validateAgainst(loadRegistry(), schemaId(LOG_SCHEMA_FILE), record)).toEqual([]);
    expect(typeof record.event_code).toBe('string');
    expect(Object.keys(asObject(record.counts, 'counts')).length).toBeGreaterThan(0);
    expect(Object.keys(asObject(record.hashes, 'hashes')).length).toBeGreaterThan(0);
  });
});

describe('lesson-factory deadline contract: documentation is present and honest', () => {
  it('documents the profile, its nonclaims, and every shipped contract file', () => {
    expect(existsSync(DOC_PATH), `${DOC_PATH} must exist`).toBe(true);
    const doc = readFileSync(DOC_PATH, 'utf8');
    expect(doc).toContain(SCREENED_STATUS);
    expect(doc).toContain(RUBRIC_VERSION);
    for (const fileName of [...SCHEMA_FILES, ...Object.keys(PROFILE_ARTIFACTS)]) {
      expect(doc, `${fileName} must be documented`).toContain(fileName);
    }
    for (const route of CANONICAL_ROUTES) {
      expect(doc, `${route} must be documented`).toContain(route);
    }
    // The document must state the lifecycle nonclaim in prose, not only in JSON.
    expect(doc).toMatch(/never .*(?:PASS|approval|approved)/i);
    // ...and record who ratified the route scope, and how narrow that ratification is.
    expect(doc).toContain('RATIFIED');
    expect(doc).toContain(DECISION_ROLE);
    expect(doc).toContain(RECEIPT_FILE);
    // ...and that the ratification is coded, with the human's words held separately.
    expect(doc).toContain(ROUTE_SCOPE_CODE);
    expect(doc).toContain('owner-route-policy-statement.md');
    expect(doc).toContain('NON_AUTHORITATIVE_VERBATIM_RECORD');
  });

  it('keeps the contracts inside the one importable factory location', () => {
    expect(SCHEMA_DIR.endsWith(join('content', 'lesson-factory', 'schemas'))).toBe(true);
    expect(PROFILE_DIR.endsWith(join('content', 'lesson-factory', 'deadline-profile'))).toBe(true);
    expect(existsSync(SCHEMA_DIR)).toBe(true);
    expect(existsSync(PROFILE_DIR)).toBe(true);
  });
});
