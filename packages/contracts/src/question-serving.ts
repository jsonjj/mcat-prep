import { z } from 'zod';

import { UtcTimestampSchema } from './time';

const nonEmptyId = z.string().trim().min(1).max(256);
const positiveVersion = z.number().int().positive();
export const Sha256DigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const QuestionChoiceIdSchema = z.enum(['A', 'B', 'C', 'D']);

export const QuestionConstructTypeSchema = z.enum([
  'KC',
  'SKILL',
  'LESSON',
  'REASONING_OPERATION',
  'TOPIC',
]);
export const QuestionActivityRoleSchema = z.enum([
  'INSTRUCTION',
  'GUIDED_PRACTICE',
  'INDEPENDENT_PRACTICE',
  'DIAGNOSTIC',
  'TRANSFER_CHECK',
  'REHEARSAL',
]);
export const QuestionEvidenceModeSchema = z.enum([
  'NONE',
  'FORMATIVE',
  'MASTERY',
  'DIAGNOSTIC',
  'CALIBRATION',
  'REHEARSAL_ONLY',
]);
export const CalibrationStatusSchema = z.enum([
  'NOT_REVIEWED',
  'NOT_REQUIRED',
  'PROVISIONAL',
  'OPERATIONAL',
  'VALIDATED',
  'REJECTED',
]);
export const CalibrationRequirementSchema = z.enum([
  'NOT_REQUIRED',
  'REQUIRED_OPERATIONAL',
  'REQUIRED_VALIDATED',
]);
export const JointScoringSemanticsSchema = z.enum([
  'PRIMARY_ONLY',
  'PRIMARY_AND_REQUIRED_SECONDARIES',
]);
export const SemanticFamilyDecisionSchema = z.enum(['CONFIRMED', 'SPLIT_REQUIRED', 'NOT_REVIEWED']);
export const LocalDependenceSchema = z.enum(['INDEPENDENT', 'SHARED_STIMULUS', 'TESTLET']);
export const RightsStatusSchema = z.enum([
  'NOT_REVIEWED',
  'PENDING',
  'CLEARED',
  'RESTRICTED',
  'REJECTED',
]);
export const ModelProcessingRightsSchema = z.enum(['NOT_REVIEWED', 'ALLOWED', 'PROHIBITED']);
export const AccessibilityStatusSchema = z.enum([
  'NOT_REVIEWED',
  'PENDING',
  'EQUIVALENT',
  'REVIEWED_NO_ADAPTATION',
  'BLOCKED',
]);
export const CertificationStateSchema = z.enum(['DRAFT', 'IN_REVIEW', 'CERTIFIED', 'REVOKED']);
export const PublicationStateSchema = z.enum(['UNPUBLISHED', 'PUBLISHED', 'WITHDRAWN']);
export const RetirementStateSchema = z.enum(['ACTIVE', 'RETIRED', 'QUARANTINED']);
export const AssetReadinessSchema = z.enum(['NOT_REQUIRED', 'PENDING', 'READY', 'BLOCKED']);
export const ReviewScopeSchema = z.enum([
  'CONTENT',
  'MAPPING',
  'FAMILY',
  'RIGHTS',
  'ACCESSIBILITY',
  'CERTIFICATION',
  'ASSETS',
  'SOURCE_PROVENANCE',
  'CALIBRATION',
]);
export const FamilyReuseModeSchema = z.enum(['FRESH_ONLY', 'REHEARSAL_ONLY']);
export const ExposureModeSchema = z.enum(['FRESH_EVIDENCE', 'REHEARSAL_REUSE']);

export type QuestionConstructType = z.infer<typeof QuestionConstructTypeSchema>;
export type QuestionActivityRole = z.infer<typeof QuestionActivityRoleSchema>;
export type QuestionEvidenceMode = z.infer<typeof QuestionEvidenceModeSchema>;
export type CalibrationRequirement = z.infer<typeof CalibrationRequirementSchema>;
export type FamilyReuseMode = z.infer<typeof FamilyReuseModeSchema>;
export type ExposureMode = z.infer<typeof ExposureModeSchema>;

const ConstructReferenceSchema = z
  .object({
    construct_type: QuestionConstructTypeSchema,
    construct_id: nonEmptyId,
  })
  .strict();

const ReviewerApprovalSchema = z
  .object({
    review_scope: ReviewScopeSchema,
    reviewer_id: nonEmptyId,
    approval_version: positiveVersion,
    approved_at: UtcTimestampSchema,
    approval_digest: Sha256DigestSchema,
  })
  .strict();

const SecondaryKcSchema = z
  .object({
    kc_id: nonEmptyId,
    joint_scored: z.boolean(),
  })
  .strict();

const IncidentalMappingSchema = z
  .object({
    construct_type: QuestionConstructTypeSchema,
    construct_id: nonEmptyId,
  })
  .strict();

/**
 * Exact, reviewed serving projection. This is intentionally independent from
 * permissive corpus-ingestion schemas: unknown corpus fields never become
 * reviewed publication metadata by implication.
 */
export const QuestionAuthoringMetadataWireSchema = z
  .object({
    question_id: nonEmptyId,
    item_version: positiveVersion,
    content_version: positiveVersion,
    content_hash: Sha256DigestSchema,
    content_release: nonEmptyId,
    content_published_at: UtcTimestampSchema,
    mapping_version: positiveVersion,
    mapping_hash: Sha256DigestSchema,
    calibration_version: positiveVersion.nullable(),
    calibration_status: CalibrationStatusSchema,
    primary_construct: ConstructReferenceSchema,
    required_secondary_kcs: z.array(SecondaryKcSchema).max(64),
    incidental_mappings: z.array(IncidentalMappingSchema).max(128),
    joint_scoring_semantics: JointScoringSemanticsSchema,
    family_id: nonEmptyId,
    family_version: positiveVersion,
    semantic_family_decision: SemanticFamilyDecisionSchema,
    semantic_family_decision_version: positiveVersion,
    stimulus_id: nonEmptyId.nullable(),
    stimulus_version: positiveVersion.nullable(),
    testlet_id: nonEmptyId.nullable(),
    testlet_version: positiveVersion.nullable(),
    local_dependence: LocalDependenceSchema,
    representation: nonEmptyId,
    context_domain: nonEmptyId,
    allowed_activity_roles: z.array(QuestionActivityRoleSchema).min(1),
    allowed_evidence_modes: z.array(QuestionEvidenceModeSchema).min(1),
    rights_status: RightsStatusSchema,
    model_processing_rights: ModelProcessingRightsSchema,
    rights_review_version: positiveVersion,
    accessibility_status: AccessibilityStatusSchema,
    accessibility_equivalence_version: positiveVersion,
    accessibility_equivalence_hash: Sha256DigestSchema,
    certification_state: CertificationStateSchema,
    publication_state: PublicationStateSchema,
    retirement_state: RetirementStateSchema,
    asset_manifest_digest: Sha256DigestSchema,
    asset_readiness: AssetReadinessSchema,
    reviewer_approvals: z.array(ReviewerApprovalSchema).max(32),
    source_ledger_digest: Sha256DigestSchema,
    review_report_digest: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const duplicate = (values: readonly string[]): boolean =>
      new Set(values).size !== values.length;
    if (duplicate(value.allowed_activity_roles)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowed_activity_roles'],
        message: 'activity roles must be unique',
      });
    }
    if (duplicate(value.allowed_evidence_modes)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allowed_evidence_modes'],
        message: 'evidence modes must be unique',
      });
    }
    if (duplicate(value.reviewer_approvals.map(({ review_scope }) => review_scope))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reviewer_approvals'],
        message: 'review scopes must be unique',
      });
    }
    if (duplicate(value.required_secondary_kcs.map(({ kc_id }) => kc_id))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['required_secondary_kcs'],
        message: 'required secondary KCs must be unique',
      });
    }
    if (
      value.primary_construct.construct_type === 'KC' &&
      value.required_secondary_kcs.some(
        ({ kc_id }) => kc_id === value.primary_construct.construct_id,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['required_secondary_kcs'],
        message: 'the reviewed primary KC cannot also be secondary',
      });
    }
    const shouldJointScore = value.joint_scoring_semantics === 'PRIMARY_AND_REQUIRED_SECONDARIES';
    if (
      value.required_secondary_kcs.some(({ joint_scored }) => joint_scored !== shouldJointScore)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['required_secondary_kcs'],
        message: 'secondary joint-scoring flags must match the declared semantics',
      });
    }
    if (
      (value.stimulus_id === null) !== (value.stimulus_version === null) ||
      (value.testlet_id === null) !== (value.testlet_version === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['local_dependence'],
        message: 'stimulus and testlet identifiers require matching versions',
      });
    }
    if (
      (value.local_dependence === 'TESTLET') !== (value.testlet_id !== null) ||
      (value.local_dependence === 'SHARED_STIMULUS' && value.stimulus_id === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['local_dependence'],
        message: 'local-dependence metadata does not match the stimulus/testlet identity',
      });
    }
    if (
      (value.calibration_status === 'NOT_REVIEWED' ||
        value.calibration_status === 'NOT_REQUIRED') !==
      (value.calibration_version === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['calibration_version'],
        message: 'reviewed calibration states require a version and unreviewed states do not',
      });
    }
  });
export type QuestionAuthoringMetadataWire = z.infer<typeof QuestionAuthoringMetadataWireSchema>;

const SelectionPolicyVersionsSchema = z
  .object({
    eligibility_policy_version: nonEmptyId,
    selection_policy_version: nonEmptyId,
    exposure_policy_version: nonEmptyId,
  })
  .strict();

/**
 * Authority-private request. It intentionally has no seed, candidate IDs,
 * family ID, sort, offset, or caller-controlled limit.
 */
export const QuestionSelectionRequestWireSchema = z
  .object({
    request_id: z.string().uuid(),
    learner_id: z.string().uuid(),
    session_id: z.string().uuid(),
    requested_at: UtcTimestampSchema,
    primary_construct: ConstructReferenceSchema,
    activity_role: QuestionActivityRoleSchema,
    evidence_mode: QuestionEvidenceModeSchema,
    representations: z.array(nonEmptyId).max(32),
    context_domains: z.array(nonEmptyId).max(32),
    calibration_requirement: CalibrationRequirementSchema,
    family_reuse_mode: FamilyReuseModeSchema,
    content_release: nonEmptyId,
    content_cutoff: UtcTimestampSchema,
    policy_cutoff: UtcTimestampSchema,
    policy_versions: SelectionPolicyVersionsSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.representations).size !== value.representations.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representations'],
        message: 'representations must be unique',
      });
    }
    if (new Set(value.context_domains).size !== value.context_domains.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['context_domains'],
        message: 'context domains must be unique',
      });
    }
    const isRehearsal = value.family_reuse_mode === 'REHEARSAL_ONLY';
    if (isRehearsal !== (value.evidence_mode === 'REHEARSAL_ONLY')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['family_reuse_mode'],
        message: 'family reuse is permitted only for rehearsal-only evidence mode',
      });
    }
    if (Date.parse(value.content_cutoff) > Date.parse(value.requested_at)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['content_cutoff'],
        message: 'content cutoff cannot be after the request',
      });
    }
    if (Date.parse(value.policy_cutoff) > Date.parse(value.requested_at)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['policy_cutoff'],
        message: 'policy cutoff cannot be after the request',
      });
    }
  });
export type QuestionSelectionRequestWire = z.infer<typeof QuestionSelectionRequestWireSchema>;

const SafeChoicesSchema = z
  .object({
    A: z.string().min(1),
    B: z.string().min(1),
    C: z.string().min(1),
    D: z.string().min(1),
  })
  .strict();

const AuthoritySafeAssetSchema = z
  .object({
    url: z.string().url(),
    alt_text: z.string().min(1),
    media_type: z.string().min(1),
  })
  .strict();

/** Selected row before the learner projection is applied. Authority-private. */
export const AuthorityPrivateSelectedCandidateWireSchema = z
  .object({
    question_id: nonEmptyId,
    item_version: positiveVersion,
    content_version: positiveVersion,
    content_hash: Sha256DigestSchema,
    mapping_version: positiveVersion,
    mapping_hash: Sha256DigestSchema,
    content_release: nonEmptyId,
    family_id: nonEmptyId,
    family_version: positiveVersion,
    stimulus_id: nonEmptyId.nullable(),
    stimulus_version: positiveVersion.nullable(),
    testlet_id: nonEmptyId.nullable(),
    testlet_version: positiveVersion.nullable(),
    local_dependence: LocalDependenceSchema,
    representation: nonEmptyId,
    context_domain: nonEmptyId,
    stem: z.string().min(1),
    passage: z.string(),
    choices: SafeChoicesSchema,
    assets: z.array(AuthoritySafeAssetSchema),
  })
  .strict();
export type AuthorityPrivateSelectedCandidateWire = z.infer<
  typeof AuthorityPrivateSelectedCandidateWireSchema
>;

export const MinimalCueSafeLearnerQuestionWireSchema = z
  .object({
    presentation_id: z.string().uuid(),
    stem: z.string().min(1),
    passage: z.string(),
    choices: z
      .array(
        z
          .object({
            choice_id: QuestionChoiceIdSchema,
            text: z.string().min(1),
          })
          .strict(),
      )
      .length(4),
    assets: z.array(AuthoritySafeAssetSchema),
  })
  .strict();
export type MinimalCueSafeLearnerQuestionWire = z.infer<
  typeof MinimalCueSafeLearnerQuestionWireSchema
>;

const ReceiptSelectionSchema = z
  .object({
    question_id: nonEmptyId,
    item_version: positiveVersion,
    content_version: positiveVersion,
    content_hash: Sha256DigestSchema,
    mapping_version: positiveVersion,
    mapping_hash: Sha256DigestSchema,
    family_id: nonEmptyId,
    family_version: positiveVersion,
    stimulus_id: nonEmptyId.nullable(),
    stimulus_version: positiveVersion.nullable(),
    testlet_id: nonEmptyId.nullable(),
    testlet_version: positiveVersion.nullable(),
  })
  .strict();

export const QuestionSelectionReceiptWireSchema = z
  .object({
    receipt_id: z.string().uuid(),
    request_id: z.string().uuid(),
    learner_id: z.string().uuid(),
    request_digest: Sha256DigestSchema,
    candidate_set_digest: Sha256DigestSchema,
    decision_digest: Sha256DigestSchema,
    request_constraints: QuestionSelectionRequestWireSchema,
    selected: ReceiptSelectionSchema,
    exposure_mode: ExposureModeSchema,
    selected_at: UtcTimestampSchema,
  })
  .strict();
export type QuestionSelectionReceiptWire = z.infer<typeof QuestionSelectionReceiptWireSchema>;

export const FamilyExposureReservationWireSchema = z
  .object({
    learner_id: z.string().uuid(),
    family_id: nonEmptyId,
    family_version: positiveVersion,
    first_request_id: z.string().uuid(),
    reserved_at: UtcTimestampSchema,
    exposure_mode: ExposureModeSchema,
  })
  .strict();
export type FamilyExposureReservationWire = z.infer<typeof FamilyExposureReservationWireSchema>;

/** Authority-private result. Only `learner_view` may cross the learner boundary. */
export const PresentationAuthorizationWireSchema = z
  .object({
    presentation_id: z.string().uuid(),
    authorized_at: UtcTimestampSchema,
    receipt: QuestionSelectionReceiptWireSchema,
    reservation: FamilyExposureReservationWireSchema,
    learner_view: MinimalCueSafeLearnerQuestionWireSchema,
  })
  .strict();
export type PresentationAuthorizationWire = z.infer<typeof PresentationAuthorizationWireSchema>;

export const QuestionVersionInvalidationWireSchema = z
  .object({
    invalidation_id: z.string().uuid(),
    question_id: nonEmptyId,
    item_version: positiveVersion,
    invalidation_kind: z.enum(['INVALID', 'QUARANTINE']),
    reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/),
    report_digest: Sha256DigestSchema,
    invalidated_by: nonEmptyId,
    invalidated_at: UtcTimestampSchema,
  })
  .strict();
export type QuestionVersionInvalidationWire = z.infer<typeof QuestionVersionInvalidationWireSchema>;

export const QuestionEligibilityGapSchema = z.enum([
  'NO_GLOBAL_GAP',
  'MISSING_VERSION_METADATA',
  'MISSING_PRIMARY_KC',
  'MISSING_REVIEW_APPROVAL',
  'MISSING_PROTECTED_VERSION',
  'CALIBRATION_NOT_READY',
  'SEMANTIC_FAMILY_NOT_REVIEWED',
  'RIGHTS_NOT_CLEARED',
  'MODEL_PROCESSING_NOT_CLEARED',
  'ACCESSIBILITY_NOT_READY',
  'NOT_CERTIFIED',
  'NOT_PUBLISHED',
  'RETIRED_OR_QUARANTINED',
  'ASSET_NOT_READY',
  'INVALIDATED',
]);
export type QuestionEligibilityGap = z.infer<typeof QuestionEligibilityGapSchema>;

export const QuestionInventoryFilterWireSchema = z
  .object({
    canonical_kc_id: nonEmptyId.nullable(),
    activity_role: QuestionActivityRoleSchema.nullable(),
    eligibility_gap: QuestionEligibilityGapSchema.nullable(),
  })
  .strict();
export type QuestionInventoryFilterWire = z.infer<typeof QuestionInventoryFilterWireSchema>;

export const QuestionEligibilityInventoryRowWireSchema = z
  .object({
    canonical_kc_id: nonEmptyId.nullable(),
    activity_role: QuestionActivityRoleSchema.nullable(),
    eligibility_gap: QuestionEligibilityGapSchema,
    question_count: z.number().int().nonnegative(),
    question_ids: z.array(nonEmptyId),
  })
  .strict();
export type QuestionEligibilityInventoryRowWire = z.infer<
  typeof QuestionEligibilityInventoryRowWireSchema
>;

export const QuestionFamilyOverlapInventoryRowWireSchema = z
  .object({
    family_id: nonEmptyId,
    family_version: positiveVersion,
    question_count: z.number().int().positive(),
    question_ids: z.array(nonEmptyId),
    canonical_kc_ids: z.array(nonEmptyId),
    has_local_dependence: z.boolean(),
  })
  .strict();
export type QuestionFamilyOverlapInventoryRowWire = z.infer<
  typeof QuestionFamilyOverlapInventoryRowWireSchema
>;

export const QuestionReviewGapInventoryRowWireSchema = z
  .object({
    question_id: nonEmptyId,
    item_version: positiveVersion.nullable(),
    missing_review_scopes: z.array(ReviewScopeSchema),
    missing_version_metadata: z.boolean(),
  })
  .strict();
export type QuestionReviewGapInventoryRowWire = z.infer<
  typeof QuestionReviewGapInventoryRowWireSchema
>;

export const QuestionAssetReadinessInventoryRowWireSchema = z
  .object({
    asset_readiness: AssetReadinessSchema,
    question_count: z.number().int().nonnegative(),
    question_ids: z.array(nonEmptyId),
  })
  .strict();
export type QuestionAssetReadinessInventoryRowWire = z.infer<
  typeof QuestionAssetReadinessInventoryRowWireSchema
>;

export interface InternalSelectionRequest {
  readonly requestId: string;
  readonly learnerId: string;
  readonly sessionId: string;
  readonly requestedAt: string;
  readonly primaryConstruct: {
    readonly constructType: QuestionConstructType;
    readonly constructId: string;
  };
  readonly activityRole: QuestionActivityRole;
  readonly evidenceMode: QuestionEvidenceMode;
  readonly representations: readonly string[];
  readonly contextDomains: readonly string[];
  readonly calibrationRequirement: CalibrationRequirement;
  readonly familyReuseMode: FamilyReuseMode;
  readonly contentRelease: string;
  readonly contentCutoff: string;
  readonly policyCutoff: string;
  readonly policyVersions: {
    readonly eligibilityPolicyVersion: string;
    readonly selectionPolicyVersion: string;
    readonly exposurePolicyVersion: string;
  };
}

/** Strict snake_case wire -> internal adapter. */
export function selectionRequestFromWire(input: unknown): InternalSelectionRequest {
  const value = QuestionSelectionRequestWireSchema.parse(input);
  return {
    requestId: value.request_id,
    learnerId: value.learner_id,
    sessionId: value.session_id,
    requestedAt: value.requested_at,
    primaryConstruct: {
      constructType: value.primary_construct.construct_type,
      constructId: value.primary_construct.construct_id,
    },
    activityRole: value.activity_role,
    evidenceMode: value.evidence_mode,
    representations: [...value.representations],
    contextDomains: [...value.context_domains],
    calibrationRequirement: value.calibration_requirement,
    familyReuseMode: value.family_reuse_mode,
    contentRelease: value.content_release,
    contentCutoff: value.content_cutoff,
    policyCutoff: value.policy_cutoff,
    policyVersions: {
      eligibilityPolicyVersion: value.policy_versions.eligibility_policy_version,
      selectionPolicyVersion: value.policy_versions.selection_policy_version,
      exposurePolicyVersion: value.policy_versions.exposure_policy_version,
    },
  };
}

/** Internal -> canonical snake_case wire adapter. */
export function selectionRequestToWire(
  value: InternalSelectionRequest,
): QuestionSelectionRequestWire {
  return QuestionSelectionRequestWireSchema.parse({
    request_id: value.requestId,
    learner_id: value.learnerId,
    session_id: value.sessionId,
    requested_at: value.requestedAt,
    primary_construct: {
      construct_type: value.primaryConstruct.constructType,
      construct_id: value.primaryConstruct.constructId,
    },
    activity_role: value.activityRole,
    evidence_mode: value.evidenceMode,
    representations: [...value.representations],
    context_domains: [...value.contextDomains],
    calibration_requirement: value.calibrationRequirement,
    family_reuse_mode: value.familyReuseMode,
    content_release: value.contentRelease,
    content_cutoff: value.contentCutoff,
    policy_cutoff: value.policyCutoff,
    policy_versions: {
      eligibility_policy_version: value.policyVersions.eligibilityPolicyVersion,
      selection_policy_version: value.policyVersions.selectionPolicyVersion,
      exposure_policy_version: value.policyVersions.exposurePolicyVersion,
    },
  });
}

export interface InternalLearnerQuestionView {
  readonly presentationId: string;
  readonly stem: string;
  readonly passage: string;
  readonly choices: readonly {
    readonly choiceId: z.infer<typeof QuestionChoiceIdSchema>;
    readonly text: string;
  }[];
  readonly assets: readonly {
    readonly url: string;
    readonly altText: string;
    readonly mediaType: string;
  }[];
}

export function learnerQuestionToWire(
  value: InternalLearnerQuestionView,
): MinimalCueSafeLearnerQuestionWire {
  return MinimalCueSafeLearnerQuestionWireSchema.parse({
    presentation_id: value.presentationId,
    stem: value.stem,
    passage: value.passage,
    choices: value.choices.map(({ choiceId, text }) => ({
      choice_id: choiceId,
      text,
    })),
    assets: value.assets.map(({ url, altText, mediaType }) => ({
      url,
      alt_text: altText,
      media_type: mediaType,
    })),
  });
}

export function learnerQuestionFromWire(input: unknown): InternalLearnerQuestionView {
  const value = MinimalCueSafeLearnerQuestionWireSchema.parse(input);
  return {
    presentationId: value.presentation_id,
    stem: value.stem,
    passage: value.passage,
    choices: value.choices.map(({ choice_id, text }) => ({
      choiceId: choice_id,
      text,
    })),
    assets: value.assets.map(({ url, alt_text, media_type }) => ({
      url,
      altText: alt_text,
      mediaType: media_type,
    })),
  };
}
