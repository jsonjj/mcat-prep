import { randomUUID } from 'node:crypto';

import {
  AuthorityPrivateSelectedCandidateWireSchema,
  FamilyExposureReservationWireSchema,
  PresentationAuthorizationWireSchema,
  QuestionSelectionReceiptWireSchema,
  QuestionSelectionRequestWireSchema,
  QuestionVersionInvalidationWireSchema,
  learnerQuestionToWire,
  type AuthorityPrivateSelectedCandidateWire,
  type ExposureMode,
  type FamilyExposureReservationWire,
  type PresentationAuthorizationWire,
  type QuestionSelectionReceiptWire,
  type QuestionSelectionRequestWire,
  type QuestionVersionInvalidationWire,
} from '@mcat/contracts/question-serving';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

import { PersistenceError, toPersistenceError } from './errors';
import { rankEligibleCandidates } from './question-selection';

const BASE_REVIEW_SCOPES = [
  'CONTENT',
  'MAPPING',
  'FAMILY',
  'RIGHTS',
  'ACCESSIBILITY',
  'CERTIFICATION',
  'ASSETS',
  'SOURCE_PROVENANCE',
] as const;

/**
 * Every production gate is expressed in this parameterized query. Returned
 * rows are authority-private and projected again before learner delivery.
 */
export const ELIGIBLE_QUESTION_CANDIDATES_SQL = `
select
  v.question_id,
  v.item_version,
  v.content_version,
  v.content_hash,
  v.mapping_version,
  v.mapping_hash,
  v.content_release,
  v.family_id,
  v.family_version,
  v.stimulus_id,
  v.stimulus_version,
  v.testlet_id,
  v.testlet_version,
  v.local_dependence,
  v.representation,
  v.context_domain,
  v.learner_stem as stem,
  v.learner_passage as passage,
  v.learner_choices as choices,
  v.learner_assets as assets
from question_serving_versions v
where v.primary_construct_type = $2
  and v.primary_construct_id = $3
  and $4 = any(v.allowed_activity_roles)
  and $5 = any(v.allowed_evidence_modes)
  and (cardinality($6::text[]) = 0 or v.representation = any($6::text[]))
  and (cardinality($7::text[]) = 0 or v.context_domain = any($7::text[]))
  and v.content_release = $9
  and v.content_published_at <= $10::timestamptz
  and v.materialized_at <= $12::timestamptz
  and v.semantic_family_decision = 'CONFIRMED'
  and v.rights_status = 'CLEARED'
  and v.model_processing_rights = 'ALLOWED'
  and v.accessibility_status in ('EQUIVALENT', 'REVIEWED_NO_ADAPTATION')
  and v.certification_state = 'CERTIFIED'
  and v.publication_state = 'PUBLISHED'
  and v.retirement_state = 'ACTIVE'
  and v.asset_readiness in ('NOT_REQUIRED', 'READY')
  and (
    (
      $8 = 'NOT_REQUIRED'
      and v.calibration_status in ('NOT_REQUIRED', 'PROVISIONAL', 'OPERATIONAL', 'VALIDATED')
    )
    or (
      $8 = 'REQUIRED_OPERATIONAL'
      and v.calibration_version is not null
      and v.calibration_status in ('OPERATIONAL', 'VALIDATED')
    )
    or (
      $8 = 'REQUIRED_VALIDATED'
      and v.calibration_version is not null
      and v.calibration_status = 'VALIDATED'
    )
  )
  and not exists (
    select 1
    from unnest($13::text[]) required_scope(review_scope)
    where not exists (
      select 1
      from question_version_review_approvals a
      where a.question_id = v.question_id
        and a.item_version = v.item_version
        and a.review_scope = required_scope.review_scope
        and a.approved_at <= $12::timestamptz
        and a.materialized_at <= $12::timestamptz
    )
  )
  and (
    $8 = 'NOT_REQUIRED'
    or exists (
      select 1
      from question_version_review_approvals calibration_review
      where calibration_review.question_id = v.question_id
        and calibration_review.item_version = v.item_version
        and calibration_review.review_scope = 'CALIBRATION'
        and calibration_review.approved_at <= $12::timestamptz
        and calibration_review.materialized_at <= $12::timestamptz
    )
  )
  and exists (
    select 1
    from question_protected_versions protected_version
    where protected_version.question_id = v.question_id
      and protected_version.item_version = v.item_version
      and protected_version.materialized_at <= $12::timestamptz
  )
  and not exists (
    select 1
    from question_version_mappings late_mapping
    where late_mapping.question_id = v.question_id
      and late_mapping.item_version = v.item_version
      and late_mapping.materialized_at > $12::timestamptz
  )
  and not exists (
    select 1
    from question_version_mappings mapping
    where mapping.question_id = v.question_id
      and mapping.item_version = v.item_version
      and mapping.mapping_role = 'REQUIRED_SECONDARY'
      and mapping.materialized_at <= $12::timestamptz
      and mapping.joint_scored <>
        (v.joint_scoring_semantics = 'PRIMARY_AND_REQUIRED_SECONDARIES')
  )
  and not exists (
    select 1
    from question_version_invalidations invalidation
    where invalidation.question_id = v.question_id
      and invalidation.item_version = v.item_version
  )
  and not exists (
    select 1
    from question_serving_versions newer
    where newer.question_id = v.question_id
      and newer.item_version > v.item_version
      and newer.content_release = v.content_release
      and newer.publication_state <> 'UNPUBLISHED'
      and newer.content_published_at <= $10::timestamptz
      and newer.materialized_at <= $12::timestamptz
  )
  and (
    (
      $11 = 'FRESH_ONLY'
      and not exists (
        select 1
        from learner_question_family_reservations family_reservation
        where family_reservation.learner_id = $1::uuid
          and family_reservation.family_id = v.family_id
      )
      and not exists (
        select 1
        from question_family_exposures prior_exposure
        where prior_exposure.learner_id = $1::uuid
          and prior_exposure.family_id = v.family_id
      )
      and (
        v.local_dependence = 'INDEPENDENT'
        or not exists (
          select 1
          from learner_question_dependence_reservations dependence_reservation
          where dependence_reservation.learner_id = $1::uuid
            and dependence_reservation.dependence_kind = v.local_dependence
            and dependence_reservation.dependence_id =
              case
                when v.local_dependence = 'TESTLET' then v.testlet_id
                else v.stimulus_id
              end
        )
      )
    )
    or (
      $11 = 'REHEARSAL_ONLY'
      and exists (
        select 1
        from learner_question_family_reservations family_reservation
        where family_reservation.learner_id = $1::uuid
          and family_reservation.family_id = v.family_id
      )
      and exists (
        select 1
        from question_family_exposures prior_exposure
        where prior_exposure.learner_id = $1::uuid
          and prior_exposure.family_id = v.family_id
      )
    )
  )
order by v.question_id, v.item_version`;

const INSERT_REQUEST_SQL = `
insert into question_selection_requests (
  request_id,
  learner_id,
  session_id,
  request_digest,
  request_snapshot,
  content_release,
  content_cutoff,
  policy_cutoff,
  eligibility_policy_version,
  selection_policy_version,
  exposure_policy_version,
  requested_at
) values (
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4,
  $5::jsonb,
  $6,
  $7::timestamptz,
  $8::timestamptz,
  $9,
  $10,
  $11,
  $12::timestamptz
)
on conflict (request_id) do nothing
returning request_digest`;

const SELECT_EXISTING_REQUEST_SQL = `
select request_digest
from question_selection_requests
where request_id = $1::uuid
for update`;

const SELECT_EXISTING_AUTHORIZATION_SQL = `
select
  p.presentation_id,
  p.authorized_at,
  p.exposure_mode,
  r.receipt_id,
  r.request_id,
  r.learner_id,
  r.request_digest,
  r.candidate_set_digest,
  r.decision_digest,
  r.selected_at,
  v.question_id,
  v.item_version,
  v.content_version,
  v.content_hash,
  v.mapping_version,
  v.mapping_hash,
  v.content_release,
  v.family_id,
  v.family_version,
  v.stimulus_id,
  v.stimulus_version,
  v.testlet_id,
  v.testlet_version,
  v.local_dependence,
  v.representation,
  v.context_domain,
  v.learner_stem as stem,
  v.learner_passage as passage,
  v.learner_choices as choices,
  v.learner_assets as assets,
  family_reservation.first_request_id,
  family_reservation.family_version as reserved_family_version,
  family_reservation.reserved_at
from question_presentations p
join question_selection_receipts r on r.receipt_id = p.receipt_id
join question_serving_versions v
  on v.question_id = p.question_id
 and v.item_version = p.item_version
join learner_question_family_reservations family_reservation
  on family_reservation.learner_id = p.learner_id
 and family_reservation.family_id = p.family_id
where p.request_id = $1::uuid
  and not exists (
    select 1
    from question_version_invalidations invalidation
    where invalidation.question_id = p.question_id
      and invalidation.item_version = p.item_version
  )`;

const INSERT_FAMILY_RESERVATION_SQL = `
insert into learner_question_family_reservations (
  learner_id,
  family_id,
  family_version,
  first_request_id,
  reserved_at
) values ($1::uuid, $2, $3, $4::uuid, $5::timestamptz)
on conflict (learner_id, family_id) do nothing
returning first_request_id, family_version as reserved_family_version, reserved_at`;

const SELECT_FAMILY_RESERVATION_SQL = `
select first_request_id, family_version as reserved_family_version, reserved_at
from learner_question_family_reservations
where learner_id = $1::uuid and family_id = $2`;

const INSERT_DEPENDENCE_RESERVATION_SQL = `
insert into learner_question_dependence_reservations (
  learner_id,
  dependence_kind,
  dependence_id,
  dependence_version,
  first_request_id,
  reserved_at
) values ($1::uuid, $2, $3, $4, $5::uuid, $6::timestamptz)
on conflict (learner_id, dependence_kind, dependence_id) do nothing
returning dependence_id`;

const INSERT_RECEIPT_SQL = `
insert into question_selection_receipts (
  receipt_id,
  request_id,
  learner_id,
  request_digest,
  candidate_set_digest,
  decision_digest,
  selected_question_id,
  selected_item_version,
  selected_content_version,
  selected_content_hash,
  selected_mapping_version,
  selected_mapping_hash,
  selected_family_id,
  selected_family_version,
  selected_stimulus_id,
  selected_stimulus_version,
  selected_testlet_id,
  selected_testlet_version,
  exposure_mode,
  selected_at
) values (
  $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10,
  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::timestamptz
)`;

const INSERT_PRESENTATION_SQL = `
insert into question_presentations (
  presentation_id,
  request_id,
  receipt_id,
  learner_id,
  question_id,
  item_version,
  family_id,
  family_version,
  exposure_mode,
  authorized_at
) values (
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::timestamptz
)`;

const INSERT_EXPOSURE_SQL = `
insert into question_family_exposures (
  exposure_id,
  presentation_id,
  receipt_id,
  learner_id,
  question_id,
  item_version,
  family_id,
  family_version,
  exposure_mode,
  exposed_at
) values (
  $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, $9, $10::timestamptz
)`;

interface ExistingRequestRow extends QueryResultRow {
  readonly request_digest: string;
}

interface ReservationRow extends QueryResultRow {
  readonly first_request_id: string;
  readonly reserved_family_version: number;
  readonly reserved_at: Date | string;
}

interface CandidateRow extends QueryResultRow {
  readonly question_id: string;
  readonly item_version: number;
  readonly content_version: number;
  readonly content_hash: string;
  readonly mapping_version: number;
  readonly mapping_hash: string;
  readonly content_release: string;
  readonly family_id: string;
  readonly family_version: number;
  readonly stimulus_id: string | null;
  readonly stimulus_version: number | null;
  readonly testlet_id: string | null;
  readonly testlet_version: number | null;
  readonly local_dependence: string;
  readonly representation: string;
  readonly context_domain: string;
  readonly stem: string;
  readonly passage: string;
  readonly choices: unknown;
  readonly assets: unknown;
}

interface ExistingAuthorizationRow extends CandidateRow, ReservationRow {
  readonly presentation_id: string;
  readonly authorized_at: Date | string;
  readonly exposure_mode: ExposureMode;
  readonly receipt_id: string;
  readonly request_id: string;
  readonly learner_id: string;
  readonly request_digest: string;
  readonly candidate_set_digest: string;
  readonly decision_digest: string;
  readonly selected_at: Date | string;
}

export interface QuestionPresentationAuthorityOptions {
  readonly selectionAuthoritySecret: string | Uint8Array;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

async function query<Row extends QueryResultRow>(
  client: PoolClient,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  try {
    return await client.query<Row>(text, [...values]);
  } catch (error) {
    throw toPersistenceError(error);
  }
}

function toIso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new PersistenceError({
      code: 'database_error',
      message: 'The question database returned an invalid timestamp.',
    });
  }
  return parsed.toISOString();
}

function candidateFromRow(row: CandidateRow): AuthorityPrivateSelectedCandidateWire {
  return AuthorityPrivateSelectedCandidateWireSchema.parse({
    question_id: row.question_id,
    item_version: row.item_version,
    content_version: row.content_version,
    content_hash: row.content_hash,
    mapping_version: row.mapping_version,
    mapping_hash: row.mapping_hash,
    content_release: row.content_release,
    family_id: row.family_id,
    family_version: row.family_version,
    stimulus_id: row.stimulus_id,
    stimulus_version: row.stimulus_version,
    testlet_id: row.testlet_id,
    testlet_version: row.testlet_version,
    local_dependence: row.local_dependence,
    representation: row.representation,
    context_domain: row.context_domain,
    stem: row.stem,
    passage: row.passage,
    choices: row.choices,
    assets: row.assets,
  });
}

function learnerView(candidate: AuthorityPrivateSelectedCandidateWire, presentationId: string) {
  return learnerQuestionToWire({
    presentationId,
    stem: candidate.stem,
    passage: candidate.passage,
    choices: [
      { choiceId: 'A', text: candidate.choices.A },
      { choiceId: 'B', text: candidate.choices.B },
      { choiceId: 'C', text: candidate.choices.C },
      { choiceId: 'D', text: candidate.choices.D },
    ],
    assets: candidate.assets.map(({ url, alt_text, media_type }) => ({
      url,
      altText: alt_text,
      mediaType: media_type,
    })),
  });
}

function selectedReceiptFields(candidate: AuthorityPrivateSelectedCandidateWire) {
  return {
    question_id: candidate.question_id,
    item_version: candidate.item_version,
    content_version: candidate.content_version,
    content_hash: candidate.content_hash,
    mapping_version: candidate.mapping_version,
    mapping_hash: candidate.mapping_hash,
    family_id: candidate.family_id,
    family_version: candidate.family_version,
    stimulus_id: candidate.stimulus_id,
    stimulus_version: candidate.stimulus_version,
    testlet_id: candidate.testlet_id,
    testlet_version: candidate.testlet_version,
  };
}

function makeReceipt(options: {
  readonly receiptId: string;
  readonly request: QuestionSelectionRequestWire;
  readonly requestDigest: string;
  readonly candidateSetDigest: string;
  readonly decisionDigest: string;
  readonly candidate: AuthorityPrivateSelectedCandidateWire;
  readonly exposureMode: ExposureMode;
  readonly selectedAt: string;
}): QuestionSelectionReceiptWire {
  return QuestionSelectionReceiptWireSchema.parse({
    receipt_id: options.receiptId,
    request_id: options.request.request_id,
    learner_id: options.request.learner_id,
    request_digest: options.requestDigest,
    candidate_set_digest: options.candidateSetDigest,
    decision_digest: options.decisionDigest,
    request_constraints: options.request,
    selected: selectedReceiptFields(options.candidate),
    exposure_mode: options.exposureMode,
    selected_at: options.selectedAt,
  });
}

function makeAuthorization(options: {
  readonly presentationId: string;
  readonly authorizedAt: string;
  readonly receipt: QuestionSelectionReceiptWire;
  readonly reservation: FamilyExposureReservationWire;
  readonly candidate: AuthorityPrivateSelectedCandidateWire;
}): PresentationAuthorizationWire {
  return PresentationAuthorizationWireSchema.parse({
    presentation_id: options.presentationId,
    authorized_at: options.authorizedAt,
    receipt: options.receipt,
    reservation: options.reservation,
    learner_view: learnerView(options.candidate, options.presentationId),
  });
}

function candidateQueryParameters(request: QuestionSelectionRequestWire): readonly unknown[] {
  return [
    request.learner_id,
    request.primary_construct.construct_type,
    request.primary_construct.construct_id,
    request.activity_role,
    request.evidence_mode,
    request.representations,
    request.context_domains,
    request.calibration_requirement,
    request.content_release,
    request.content_cutoff,
    request.family_reuse_mode,
    request.policy_cutoff,
    BASE_REVIEW_SCOPES,
  ];
}

function dependenceIdentity(
  candidate: AuthorityPrivateSelectedCandidateWire,
): { readonly id: string; readonly version: number } | null {
  if (candidate.local_dependence === 'TESTLET') {
    if (candidate.testlet_id === null || candidate.testlet_version === null) {
      throw new PersistenceError({
        code: 'database_error',
        message: 'A testlet candidate is missing its dependence identity.',
      });
    }
    return { id: candidate.testlet_id, version: candidate.testlet_version };
  }
  if (candidate.local_dependence === 'SHARED_STIMULUS') {
    if (candidate.stimulus_id === null || candidate.stimulus_version === null) {
      throw new PersistenceError({
        code: 'database_error',
        message: 'A shared-stimulus candidate is missing its dependence identity.',
      });
    }
    return { id: candidate.stimulus_id, version: candidate.stimulus_version };
  }
  return null;
}

async function reserveFreshCandidate(
  client: PoolClient,
  request: QuestionSelectionRequestWire,
  candidate: AuthorityPrivateSelectedCandidateWire,
  authorizedAt: string,
): Promise<ReservationRow | null> {
  await query(client, 'savepoint candidate_reservation');
  const family = await query<ReservationRow>(client, INSERT_FAMILY_RESERVATION_SQL, [
    request.learner_id,
    candidate.family_id,
    candidate.family_version,
    request.request_id,
    authorizedAt,
  ]);
  const reservation = family.rows[0];
  if (reservation === undefined) {
    await query(client, 'rollback to savepoint candidate_reservation');
    await query(client, 'release savepoint candidate_reservation');
    return null;
  }

  const dependence = dependenceIdentity(candidate);
  if (dependence !== null) {
    const reserved = await query(client, INSERT_DEPENDENCE_RESERVATION_SQL, [
      request.learner_id,
      candidate.local_dependence,
      dependence.id,
      dependence.version,
      request.request_id,
      authorizedAt,
    ]);
    if (reserved.rowCount !== 1) {
      await query(client, 'rollback to savepoint candidate_reservation');
      await query(client, 'release savepoint candidate_reservation');
      return null;
    }
  }
  await query(client, 'release savepoint candidate_reservation');
  return reservation;
}

async function existingReservation(
  client: PoolClient,
  request: QuestionSelectionRequestWire,
  candidate: AuthorityPrivateSelectedCandidateWire,
): Promise<ReservationRow | null> {
  const result = await query<ReservationRow>(client, SELECT_FAMILY_RESERVATION_SQL, [
    request.learner_id,
    candidate.family_id,
  ]);
  return result.rows[0] ?? null;
}

function reservationWire(options: {
  readonly request: QuestionSelectionRequestWire;
  readonly candidate: AuthorityPrivateSelectedCandidateWire;
  readonly reservation: ReservationRow;
  readonly exposureMode: ExposureMode;
}): FamilyExposureReservationWire {
  return FamilyExposureReservationWireSchema.parse({
    learner_id: options.request.learner_id,
    family_id: options.candidate.family_id,
    family_version: options.reservation.reserved_family_version,
    first_request_id: options.reservation.first_request_id,
    reserved_at: toIso(options.reservation.reserved_at),
    exposure_mode: options.exposureMode,
  });
}

async function loadExistingAuthorization(
  client: PoolClient,
  request: QuestionSelectionRequestWire,
): Promise<PresentationAuthorizationWire> {
  const result = await query<ExistingAuthorizationRow>(client, SELECT_EXISTING_AUTHORIZATION_SQL, [
    request.request_id,
  ]);
  const row = result.rows[0];
  if (row === undefined) {
    throw new PersistenceError({
      code: 'not_found',
      message: 'The previously authorized question is no longer presentable.',
    });
  }
  const candidate = candidateFromRow(row);
  const receipt = makeReceipt({
    receiptId: row.receipt_id,
    request,
    requestDigest: row.request_digest,
    candidateSetDigest: row.candidate_set_digest,
    decisionDigest: row.decision_digest,
    candidate,
    exposureMode: row.exposure_mode,
    selectedAt: toIso(row.selected_at),
  });
  return makeAuthorization({
    presentationId: row.presentation_id,
    authorizedAt: toIso(row.authorized_at),
    receipt,
    reservation: reservationWire({
      request,
      candidate,
      reservation: row,
      exposureMode: row.exposure_mode,
    }),
    candidate,
  });
}

/**
 * Atomically selects, reserves local-dependence/family identity, records the
 * receipt and exposure, and only then returns the minimal learner view.
 */
export async function authorizeQuestionPresentation(
  pool: Pool,
  requestInput: unknown,
  options: QuestionPresentationAuthorityOptions,
): Promise<PresentationAuthorizationWire> {
  const request = QuestionSelectionRequestWireSchema.parse(requestInput);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const newId = options.newId ?? randomUUID;
  const emptyRanking = rankEligibleCandidates(request, [], options.selectionAuthoritySecret);

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    throw toPersistenceError(error);
  }
  let committed = false;
  try {
    await query(client, 'begin isolation level serializable');
    const inserted = await query<ExistingRequestRow>(client, INSERT_REQUEST_SQL, [
      request.request_id,
      request.learner_id,
      request.session_id,
      emptyRanking.requestDigest,
      JSON.stringify(request),
      request.content_release,
      request.content_cutoff,
      request.policy_cutoff,
      request.policy_versions.eligibility_policy_version,
      request.policy_versions.selection_policy_version,
      request.policy_versions.exposure_policy_version,
      request.requested_at,
    ]);

    if (inserted.rowCount !== 1) {
      const existing = await query<ExistingRequestRow>(client, SELECT_EXISTING_REQUEST_SQL, [
        request.request_id,
      ]);
      if (existing.rows[0]?.request_digest !== emptyRanking.requestDigest) {
        throw new PersistenceError({
          code: 'conflict',
          message: 'The request identity is already bound to different constraints.',
        });
      }
      const authorization = await loadExistingAuthorization(client, request);
      await query(client, 'commit');
      committed = true;
      return authorization;
    }

    const candidateResult = await query<CandidateRow>(
      client,
      ELIGIBLE_QUESTION_CANDIDATES_SQL,
      candidateQueryParameters(request),
    );
    const candidates = candidateResult.rows.map(candidateFromRow);
    const ranking = rankEligibleCandidates(request, candidates, options.selectionAuthoritySecret);
    const exposureMode: ExposureMode =
      request.family_reuse_mode === 'FRESH_ONLY' ? 'FRESH_EVIDENCE' : 'REHEARSAL_REUSE';

    for (const candidate of ranking.rankedCandidates) {
      const reservation =
        exposureMode === 'FRESH_EVIDENCE'
          ? await reserveFreshCandidate(client, request, candidate, now)
          : await existingReservation(client, request, candidate);
      if (reservation === null) continue;

      const receiptId = newId();
      const presentationId = newId();
      const exposureId = newId();
      const receipt = makeReceipt({
        receiptId,
        request,
        requestDigest: ranking.requestDigest,
        candidateSetDigest: ranking.candidateSetDigest,
        decisionDigest: ranking.decisionDigest(candidate),
        candidate,
        exposureMode,
        selectedAt: now,
      });
      const authorization = makeAuthorization({
        presentationId,
        authorizedAt: now,
        receipt,
        reservation: reservationWire({
          request,
          candidate,
          reservation,
          exposureMode,
        }),
        candidate,
      });

      await query(client, INSERT_RECEIPT_SQL, [
        receiptId,
        request.request_id,
        request.learner_id,
        ranking.requestDigest,
        ranking.candidateSetDigest,
        ranking.decisionDigest(candidate),
        candidate.question_id,
        candidate.item_version,
        candidate.content_version,
        candidate.content_hash,
        candidate.mapping_version,
        candidate.mapping_hash,
        candidate.family_id,
        candidate.family_version,
        candidate.stimulus_id,
        candidate.stimulus_version,
        candidate.testlet_id,
        candidate.testlet_version,
        exposureMode,
        now,
      ]);
      await query(client, INSERT_PRESENTATION_SQL, [
        presentationId,
        request.request_id,
        receiptId,
        request.learner_id,
        candidate.question_id,
        candidate.item_version,
        candidate.family_id,
        candidate.family_version,
        exposureMode,
        now,
      ]);
      await query(client, INSERT_EXPOSURE_SQL, [
        exposureId,
        presentationId,
        receiptId,
        request.learner_id,
        candidate.question_id,
        candidate.item_version,
        candidate.family_id,
        candidate.family_version,
        exposureMode,
        now,
      ]);
      await query(client, 'commit');
      committed = true;
      return authorization;
    }

    throw new PersistenceError({
      code: 'not_found',
      message: 'No eligible question family is available for the requested constraints.',
    });
  } catch (error) {
    if (!committed) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the authoritative error; releasing the client discards state.
      }
    }
    throw toPersistenceError(error);
  } finally {
    client.release();
  }
}

const INSERT_INVALIDATION_SQL = `
insert into question_version_invalidations (
  invalidation_id,
  question_id,
  item_version,
  invalidation_kind,
  reason_code,
  report_digest,
  invalidated_by,
  invalidated_at
) values ($1::uuid, $2, $3, $4, $5, $6, $7, $8::timestamptz)
on conflict do nothing
returning invalidation_id`;

const SELECT_INVALIDATION_SQL = `
select
  invalidation_id,
  question_id,
  item_version,
  invalidation_kind,
  reason_code,
  report_digest,
  invalidated_by,
  invalidated_at
from question_version_invalidations
where invalidation_id = $1::uuid
   or (question_id = $2 and item_version = $3 and report_digest = $4)
order by (invalidation_id = $1::uuid) desc
limit 1`;

interface InvalidationRow extends QueryResultRow {
  readonly invalidation_id: string;
  readonly question_id: string;
  readonly item_version: number;
  readonly invalidation_kind: string;
  readonly reason_code: string;
  readonly report_digest: string;
  readonly invalidated_by: string;
  readonly invalidated_at: Date | string;
}

/** Append-only invalidation. It never deletes presentation/exposure history. */
export async function invalidateQuestionVersion(
  pool: Pool,
  input: unknown,
): Promise<QuestionVersionInvalidationWire> {
  const invalidation = QuestionVersionInvalidationWireSchema.parse(input);
  try {
    await pool.query(INSERT_INVALIDATION_SQL, [
      invalidation.invalidation_id,
      invalidation.question_id,
      invalidation.item_version,
      invalidation.invalidation_kind,
      invalidation.reason_code,
      invalidation.report_digest,
      invalidation.invalidated_by,
      invalidation.invalidated_at,
    ]);
    const result = await pool.query<InvalidationRow>(SELECT_INVALIDATION_SQL, [
      invalidation.invalidation_id,
      invalidation.question_id,
      invalidation.item_version,
      invalidation.report_digest,
    ]);
    const row = result.rows[0];
    if (row === undefined) {
      throw new PersistenceError({
        code: 'database_error',
        message: 'The invalidation was not durably recorded.',
      });
    }
    const persisted = QuestionVersionInvalidationWireSchema.parse({
      ...row,
      invalidated_at: toIso(row.invalidated_at),
    });
    if (JSON.stringify(persisted) !== JSON.stringify(invalidation)) {
      throw new PersistenceError({
        code: 'conflict',
        message: 'The invalidation identity is already bound to different input.',
      });
    }
    return persisted;
  } catch (error) {
    throw toPersistenceError(error);
  }
}
