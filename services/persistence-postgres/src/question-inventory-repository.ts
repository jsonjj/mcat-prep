import {
  AssetReadinessSchema,
  QuestionAssetReadinessInventoryRowWireSchema,
  QuestionEligibilityInventoryRowWireSchema,
  QuestionFamilyOverlapInventoryRowWireSchema,
  QuestionInventoryFilterWireSchema,
  QuestionReviewGapInventoryRowWireSchema,
  type QuestionAssetReadinessInventoryRowWire,
  type QuestionEligibilityInventoryRowWire,
  type QuestionFamilyOverlapInventoryRowWire,
  type QuestionInventoryFilterWire,
  type QuestionReviewGapInventoryRowWire,
} from '@mcat/contracts/question-serving';
import type { Pool, QueryResultRow } from 'pg';

import { toPersistenceError } from './errors';

const REQUIRED_REVIEW_SCOPES_SQL = `
array[
  'CONTENT',
  'MAPPING',
  'FAMILY',
  'RIGHTS',
  'ACCESSIBILITY',
  'CERTIFICATION',
  'ASSETS',
  'SOURCE_PROVENANCE'
]::text[]`;

/** Metadata-only inventory grouped by canonical KC, activity role, and gap. */
export const QUESTION_ELIGIBILITY_INVENTORY_SQL = `
with latest as (
  select
    q.question_id,
    q.kc_id as imported_kc_id,
    v.item_version,
    v.primary_construct_type,
    v.primary_construct_id,
    v.allowed_activity_roles,
    v.calibration_status,
    v.semantic_family_decision,
    v.rights_status,
    v.model_processing_rights,
    v.accessibility_status,
    v.certification_state,
    v.publication_state,
    v.retirement_state,
    v.asset_readiness
  from questions q
  left join lateral (
    select serving.*
    from question_serving_versions serving
    where serving.question_id = q.question_id
    order by serving.item_version desc
    limit 1
  ) v on true
),
classified as (
  select
    latest.question_id,
    case
      when latest.primary_construct_type = 'KC' then latest.primary_construct_id
      else latest.imported_kc_id
    end as canonical_kc_id,
    role.activity_role,
    array_remove(array[
      case when latest.item_version is null then 'MISSING_VERSION_METADATA' end,
      case
        when latest.item_version is not null
         and latest.primary_construct_type <> 'KC'
        then 'MISSING_PRIMARY_KC'
      end,
      case
        when latest.item_version is not null and exists (
          select 1
          from unnest(${REQUIRED_REVIEW_SCOPES_SQL}) required_scope(review_scope)
          where not exists (
            select 1
            from question_version_review_approvals approval
            where approval.question_id = latest.question_id
              and approval.item_version = latest.item_version
              and approval.review_scope = required_scope.review_scope
          )
        )
        then 'MISSING_REVIEW_APPROVAL'
      end,
      case
        when latest.item_version is not null and not exists (
          select 1
          from question_protected_versions answer_version
          where answer_version.question_id = latest.question_id
            and answer_version.item_version = latest.item_version
        )
        then 'MISSING_PROTECTED_VERSION'
      end,
      case
        when latest.calibration_status in ('NOT_REVIEWED', 'PROVISIONAL', 'REJECTED')
        then 'CALIBRATION_NOT_READY'
      end,
      case
        when latest.semantic_family_decision <> 'CONFIRMED'
        then 'SEMANTIC_FAMILY_NOT_REVIEWED'
      end,
      case when latest.rights_status <> 'CLEARED' then 'RIGHTS_NOT_CLEARED' end,
      case
        when latest.model_processing_rights <> 'ALLOWED'
        then 'MODEL_PROCESSING_NOT_CLEARED'
      end,
      case
        when latest.accessibility_status not in ('EQUIVALENT', 'REVIEWED_NO_ADAPTATION')
        then 'ACCESSIBILITY_NOT_READY'
      end,
      case when latest.certification_state <> 'CERTIFIED' then 'NOT_CERTIFIED' end,
      case when latest.publication_state <> 'PUBLISHED' then 'NOT_PUBLISHED' end,
      case
        when latest.retirement_state in ('RETIRED', 'QUARANTINED')
        then 'RETIRED_OR_QUARANTINED'
      end,
      case
        when latest.asset_readiness not in ('NOT_REQUIRED', 'READY')
        then 'ASSET_NOT_READY'
      end,
      case
        when latest.item_version is not null and exists (
          select 1
          from question_version_invalidations invalidation
          where invalidation.question_id = latest.question_id
            and invalidation.item_version = latest.item_version
        )
        then 'INVALIDATED'
      end
    ]::text[], null) as gaps
  from latest
  left join lateral unnest(
    case
      when latest.allowed_activity_roles is null
        then array[null::text]
      else latest.allowed_activity_roles
    end
  ) role(activity_role) on true
),
expanded as (
  select
    classified.question_id,
    classified.canonical_kc_id,
    classified.activity_role,
    gap.eligibility_gap
  from classified
  cross join lateral unnest(
    case
      when cardinality(classified.gaps) = 0 then array['NO_GLOBAL_GAP']::text[]
      else classified.gaps
    end
  ) gap(eligibility_gap)
)
select
  canonical_kc_id,
  activity_role,
  eligibility_gap,
  count(*)::int as question_count,
  array_agg(distinct question_id order by question_id) as question_ids
from expanded
where ($1::text is null or canonical_kc_id = $1)
  and ($2::text is null or activity_role = $2)
  and ($3::text is null or eligibility_gap = $3)
group by canonical_kc_id, activity_role, eligibility_gap
order by canonical_kc_id nulls last, activity_role nulls last, eligibility_gap`;

export const QUESTION_FAMILY_OVERLAP_INVENTORY_SQL = `
with latest as (
  select v.*
  from questions q
  join lateral (
    select serving.*
    from question_serving_versions serving
    where serving.question_id = q.question_id
    order by serving.item_version desc
    limit 1
  ) v on true
)
select
  family_id,
  family_version,
  count(distinct question_id)::int as question_count,
  array_agg(distinct question_id order by question_id) as question_ids,
  array_remove(
    array_agg(
      distinct case when primary_construct_type = 'KC' then primary_construct_id end
    ),
    null
  ) as canonical_kc_ids,
  bool_or(local_dependence <> 'INDEPENDENT') as has_local_dependence
from latest
where ($1::text is null or family_id = $1)
group by family_id, family_version
having count(distinct question_id) > 1
order by family_id, family_version`;

export const QUESTION_REVIEW_GAP_INVENTORY_SQL = `
with latest as (
  select
    q.question_id,
    q.kc_id as imported_kc_id,
    v.item_version,
    v.primary_construct_type,
    v.primary_construct_id
  from questions q
  left join lateral (
    select serving.*
    from question_serving_versions serving
    where serving.question_id = q.question_id
    order by serving.item_version desc
    limit 1
  ) v on true
),
gaps as (
  select
    latest.question_id,
    latest.item_version,
    case
      when latest.primary_construct_type = 'KC' then latest.primary_construct_id
      else latest.imported_kc_id
    end as canonical_kc_id,
    array(
      select required_scope.review_scope
      from unnest(${REQUIRED_REVIEW_SCOPES_SQL}) required_scope(review_scope)
      where latest.item_version is null or not exists (
        select 1
        from question_version_review_approvals approval
        where approval.question_id = latest.question_id
          and approval.item_version = latest.item_version
          and approval.review_scope = required_scope.review_scope
      )
      order by required_scope.review_scope
    ) as missing_review_scopes
  from latest
)
select
  question_id,
  item_version,
  missing_review_scopes,
  (item_version is null) as missing_version_metadata
from gaps
where ($1::text is null or canonical_kc_id = $1)
  and (item_version is null or cardinality(missing_review_scopes) > 0)
order by question_id`;

export const QUESTION_ASSET_READINESS_INVENTORY_SQL = `
with latest as (
  select v.question_id, v.asset_readiness
  from questions q
  join lateral (
    select serving.*
    from question_serving_versions serving
    where serving.question_id = q.question_id
    order by serving.item_version desc
    limit 1
  ) v on true
)
select
  asset_readiness,
  count(*)::int as question_count,
  array_agg(question_id order by question_id) as question_ids
from latest
where ($1::text is null or asset_readiness = $1)
group by asset_readiness
order by asset_readiness`;

interface InventoryRow extends QueryResultRow {
  readonly canonical_kc_id: string | null;
  readonly activity_role: string | null;
  readonly eligibility_gap: string;
  readonly question_count: number;
  readonly question_ids: string[];
}

interface FamilyOverlapRow extends QueryResultRow {
  readonly family_id: string;
  readonly family_version: number;
  readonly question_count: number;
  readonly question_ids: string[];
  readonly canonical_kc_ids: string[];
  readonly has_local_dependence: boolean;
}

interface ReviewGapRow extends QueryResultRow {
  readonly question_id: string;
  readonly item_version: number | null;
  readonly missing_review_scopes: string[];
  readonly missing_version_metadata: boolean;
}

interface AssetReadinessRow extends QueryResultRow {
  readonly asset_readiness: string;
  readonly question_count: number;
  readonly question_ids: string[];
}

export async function listQuestionEligibilityInventory(
  pool: Pool,
  input: unknown,
): Promise<QuestionEligibilityInventoryRowWire[]> {
  const filter: QuestionInventoryFilterWire = QuestionInventoryFilterWireSchema.parse(input);
  try {
    const result = await pool.query<InventoryRow>(QUESTION_ELIGIBILITY_INVENTORY_SQL, [
      filter.canonical_kc_id,
      filter.activity_role,
      filter.eligibility_gap,
    ]);
    return result.rows.map((row) => QuestionEligibilityInventoryRowWireSchema.parse(row));
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listQuestionFamilyOverlapInventory(
  pool: Pool,
  familyId: string | null = null,
): Promise<QuestionFamilyOverlapInventoryRowWire[]> {
  try {
    const result = await pool.query<FamilyOverlapRow>(QUESTION_FAMILY_OVERLAP_INVENTORY_SQL, [
      familyId,
    ]);
    return result.rows.map((row) => QuestionFamilyOverlapInventoryRowWireSchema.parse(row));
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listQuestionReviewGapInventory(
  pool: Pool,
  canonicalKcId: string | null = null,
): Promise<QuestionReviewGapInventoryRowWire[]> {
  try {
    const result = await pool.query<ReviewGapRow>(QUESTION_REVIEW_GAP_INVENTORY_SQL, [
      canonicalKcId,
    ]);
    return result.rows.map((row) => QuestionReviewGapInventoryRowWireSchema.parse(row));
  } catch (error) {
    throw toPersistenceError(error);
  }
}

export async function listQuestionAssetReadinessInventory(
  pool: Pool,
  assetReadiness: string | null = null,
): Promise<QuestionAssetReadinessInventoryRowWire[]> {
  const parsed = assetReadiness === null ? null : AssetReadinessSchema.parse(assetReadiness);
  try {
    const result = await pool.query<AssetReadinessRow>(QUESTION_ASSET_READINESS_INVENTORY_SQL, [
      parsed,
    ]);
    return result.rows.map((row) => QuestionAssetReadinessInventoryRowWireSchema.parse(row));
  } catch (error) {
    throw toPersistenceError(error);
  }
}
