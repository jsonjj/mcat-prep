import {
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
  aws_iam as iam,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

/**
 * Standalone deploy-identity stack for the automated GitHub Actions pipeline
 * (`.github/workflows/deploy.yml`). It is intentionally NOT part of the workload
 * app in `bin/mcat.ts` (`createMcatApp`) — that app is the fail-closed, human
 * reviewed set of nine `McatDev*` stacks. This stack provisions only the IAM
 * identity CI assumes via GitHub OIDC and is synthesized from its own entrypoint
 * (`bin/github-deploy.ts`) so it never widens the reviewed deployment allowlist.
 *
 * Nothing here hardcodes an account, region, org/repo, or ref: every value is a
 * CDK context / environment parameter resolved by `resolveGithubDeployConfig`.
 */

export const GITHUB_OIDC_PROVIDER_DOMAIN = 'token.actions.githubusercontent.com';
export const GITHUB_OIDC_PROVIDER_URL = `https://${GITHUB_OIDC_PROVIDER_DOMAIN}`;
/** Audience GitHub's OIDC tokens are minted for when `aws-actions/configure-aws-credentials` runs. */
export const GITHUB_OIDC_AUDIENCE = 'sts.amazonaws.com';

export const DEFAULT_CDK_QUALIFIER = 'hnb659fds';
export const DEFAULT_DEPLOY_ROLE_NAME = 'mcat-github-deploy';
export const DEFAULT_DEPLOY_ENVIRONMENT = 'aws-dev';
export const DEFAULT_ALLOWED_REFS = ['refs/heads/main'] as const;

const GITHUB_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const GITHUB_REPO = /^[A-Za-z0-9._-]{1,100}$/;
const AWS_ACCOUNT = /^\d{12}$/;
const AWS_REGION = /^[a-z]{2}-[a-z]+-\d$/;

export interface GithubDeployStackProps extends StackProps {
  /** GitHub org / user that owns the repository (e.g. `jsonjj`). */
  readonly githubOwner: string;
  /** Repository name (e.g. `mcat-prep`). */
  readonly githubRepo: string;
  /**
   * Fully-formed OIDC `sub` claims the role will trust (StringLike), e.g.
   * `repo:jsonjj/mcat-prep:environment:aws-dev`. Wildcards are allowed but the
   * defaults are exact.
   */
  readonly allowedSubjects: readonly string[];
  /** CDK bootstrap qualifier; the role may assume `cdk-<qualifier>-*` roles only. */
  readonly cdkQualifier?: string;
  /** Physical IAM role name (exposed to the workflow as `AWS_DEPLOY_ROLE_ARN`). */
  readonly roleName?: string;
  /**
   * ARN of an EXISTING GitHub OIDC provider to reuse. When omitted, this stack
   * creates the provider (the one-time bootstrap can be owned by CDK instead of
   * `aws iam create-open-id-connect-provider`).
   */
  readonly oidcProviderArn?: string;
  /**
   * Optional permissions boundary. REQUIRED in the sandbox dev account, whose
   * boundary policy denies role creation without it:
   * `arn:aws:iam::056956104102:policy/InternSandboxBoundary`.
   */
  readonly permissionsBoundaryArn?: string;
}

/**
 * GitHub OIDC deploy identity. The role trusts GitHub's OIDC provider scoped to
 * one repository and an allowlist of refs/environments, and is granted a
 * documented, mostly least-privilege deploy policy: it delegates the heavy
 * CloudFormation work to the CDK bootstrap roles and only holds the direct
 * permissions the pipeline's non-CDK steps need (read stack outputs, publish the
 * SPA to S3, invalidate CloudFront).
 */
export class GithubDeployStack extends Stack {
  public readonly deployRole: iam.IRole;
  public readonly oidcProvider: iam.IOpenIdConnectProvider;

  public constructor(scope: Construct, id: string, props: GithubDeployStackProps) {
    super(scope, id, props);

    if (props.allowedSubjects.length === 0) {
      throw new Error('At least one GitHub OIDC subject must be allowed');
    }

    // Apply the optional boundary at stack scope so EVERY role created here — the
    // deploy role and the OIDC-provider custom-resource role — carries it. The
    // sandbox account denies role creation without its boundary.
    if (props.permissionsBoundaryArn !== undefined) {
      iam.PermissionsBoundary.of(this).apply(
        iam.ManagedPolicy.fromManagedPolicyArn(
          this,
          'DeployPermissionsBoundary',
          props.permissionsBoundaryArn,
        ),
      );
    }

    const account = Stack.of(this).account;
    const region = Stack.of(this).region;
    const qualifier = props.cdkQualifier ?? DEFAULT_CDK_QUALIFIER;

    this.oidcProvider =
      props.oidcProviderArn === undefined
        ? new iam.OpenIdConnectProvider(this, 'GithubOidcProvider', {
            url: GITHUB_OIDC_PROVIDER_URL,
            clientIds: [GITHUB_OIDC_AUDIENCE],
          })
        : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
            this,
            'GithubOidcProvider',
            props.oidcProviderArn,
          );

    const principal = new iam.OpenIdConnectPrincipal(this.oidcProvider, {
      StringEquals: { [`${GITHUB_OIDC_PROVIDER_DOMAIN}:aud`]: GITHUB_OIDC_AUDIENCE },
      StringLike: { [`${GITHUB_OIDC_PROVIDER_DOMAIN}:sub`]: [...props.allowedSubjects] },
    });

    const role = new iam.Role(this, 'GithubDeployRole', {
      roleName: props.roleName ?? DEFAULT_DEPLOY_ROLE_NAME,
      description: `GitHub Actions OIDC deploy role for ${props.githubOwner}/${props.githubRepo}.`,
      assumedBy: principal,
      maxSessionDuration: Duration.hours(1),
    });

    role.attachInlinePolicy(
      new iam.Policy(this, 'GithubDeployPolicy', {
        statements: this.deployPolicyStatements(account, region, qualifier),
      }),
    );

    this.deployRole = role;

    new CfnOutput(this, 'GithubDeployRoleArn', {
      value: role.roleArn,
      description: 'Set this as the GitHub Actions repository/environment variable AWS_DEPLOY_ROLE_ARN.',
    });
    new CfnOutput(this, 'GithubOidcProviderArn', {
      value: this.oidcProvider.openIdConnectProviderArn,
      description: 'GitHub OIDC provider ARN. Pass as -c githubOidcProviderArn to reuse it later.',
    });
  }

  private deployPolicyStatements(
    account: string,
    region: string,
    qualifier: string,
  ): iam.PolicyStatement[] {
    return [
      // The actual CloudFormation / S3 / Lambda mutations run under the CDK
      // bootstrap roles; CI's identity only needs to assume them. This keeps the
      // long-lived deploy identity minimal.
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${account}:role/cdk-${qualifier}-*`],
      }),
      new iam.PolicyStatement({
        sid: 'ReadCdkBootstrapVersion',
        actions: ['ssm:GetParameter', 'ssm:GetParameters'],
        resources: [`arn:aws:ssm:${region}:${account}:parameter/cdk-bootstrap/${qualifier}/version`],
      }),
      // Read stack outputs (bucket name / distribution id) for the SPA publish step.
      new iam.PolicyStatement({
        sid: 'ReadDeploymentStackOutputs',
        actions: ['cloudformation:DescribeStacks'],
        resources: [`arn:aws:cloudformation:${region}:${account}:stack/mcat-dev-*/*`],
      }),
      // Upload the built learner SPA to the web artifact buckets.
      new iam.PolicyStatement({
        sid: 'PublishLearnerWebArtifacts',
        actions: [
          's3:PutObject',
          's3:DeleteObject',
          's3:GetObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: [
          `arn:aws:s3:::mcat-dev-*-web-${account}-${region}`,
          `arn:aws:s3:::mcat-dev-*-web-${account}-${region}/*`,
        ],
      }),
      // Invalidate the CloudFront shell after publishing.
      new iam.PolicyStatement({
        sid: 'InvalidateLearnerCdn',
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [`arn:aws:cloudfront::${account}:distribution/*`],
      }),
    ];
  }
}

export interface GithubDeployConfig {
  readonly account: string;
  readonly region: string;
  readonly githubOwner: string;
  readonly githubRepo: string;
  readonly allowedSubjects: readonly string[];
  readonly roleName: string;
  readonly cdkQualifier: string;
  readonly deployEnvironment: string;
  readonly oidcProviderArn?: string;
  readonly permissionsBoundaryArn?: string;
}

export type ContextReader = (key: string) => unknown;
export type ProcessEnvironment = Readonly<Record<string, string | undefined>>;

function contextString(context: ContextReader, key: string): string | undefined {
  const value = context(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function firstDefined(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value !== undefined && value.length > 0) return value;
  }
  return undefined;
}

function splitList(value: string | undefined): readonly string[] {
  if (value === undefined) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function required(value: string | undefined, message: string): string {
  if (value === undefined) throw new Error(message);
  return value;
}

/**
 * Resolve every deploy-role parameter from CDK context (`-c key=value` /
 * `cdk.json`) with a documented environment-variable fallback. Never reads AWS
 * credentials and never invents an account/org/repo — those are required.
 */
export function resolveGithubDeployConfig(
  context: ContextReader,
  env: ProcessEnvironment,
): GithubDeployConfig {
  const account = required(
    firstDefined(
      contextString(context, 'awsAccountId'),
      env.CDK_DEFAULT_ACCOUNT,
      env.AWS_ACCOUNT_ID,
    ),
    'awsAccountId is required (set -c awsAccountId=<12-digit id> or CDK_DEFAULT_ACCOUNT)',
  );
  if (!AWS_ACCOUNT.test(account)) {
    throw new Error('awsAccountId must be a 12-digit AWS account id');
  }

  const region =
    firstDefined(
      contextString(context, 'awsRegion'),
      env.CDK_DEFAULT_REGION,
      env.AWS_REGION,
    ) ?? 'us-east-1';
  if (!AWS_REGION.test(region)) {
    throw new Error(`awsRegion is not a valid AWS region: ${region}`);
  }

  const githubOwner = required(
    firstDefined(contextString(context, 'githubOwner'), env.GITHUB_DEPLOY_OWNER),
    'githubOwner is required (set -c githubOwner=<org-or-user>)',
  );
  if (!GITHUB_OWNER.test(githubOwner)) {
    throw new Error(`githubOwner is not a valid GitHub owner: ${githubOwner}`);
  }

  const githubRepo = required(
    firstDefined(contextString(context, 'githubRepo'), env.GITHUB_DEPLOY_REPO),
    'githubRepo is required (set -c githubRepo=<repository>)',
  );
  if (!GITHUB_REPO.test(githubRepo)) {
    throw new Error(`githubRepo is not a valid GitHub repository: ${githubRepo}`);
  }

  const deployEnvironment =
    contextString(context, 'githubDeployEnvironment') ?? DEFAULT_DEPLOY_ENVIRONMENT;

  const explicitSubjects = splitList(contextString(context, 'githubAllowedSubjects'));
  const allowedRefs = splitList(contextString(context, 'githubAllowedRefs'));
  const refs = allowedRefs.length > 0 ? allowedRefs : [...DEFAULT_ALLOWED_REFS];
  const allowedSubjects =
    explicitSubjects.length > 0
      ? explicitSubjects
      : [
          ...refs.map((ref) => `repo:${githubOwner}/${githubRepo}:ref:${normalizeRef(ref)}`),
          `repo:${githubOwner}/${githubRepo}:environment:${deployEnvironment}`,
        ];

  return {
    account,
    region,
    githubOwner,
    githubRepo,
    allowedSubjects,
    roleName: contextString(context, 'deployRoleName') ?? DEFAULT_DEPLOY_ROLE_NAME,
    cdkQualifier: contextString(context, 'cdkQualifier') ?? DEFAULT_CDK_QUALIFIER,
    deployEnvironment,
    oidcProviderArn: firstDefined(
      contextString(context, 'githubOidcProviderArn'),
      env.GITHUB_OIDC_PROVIDER_ARN,
    ),
    permissionsBoundaryArn: firstDefined(
      contextString(context, 'permissionsBoundaryArn'),
      env.DEPLOY_ROLE_PERMISSIONS_BOUNDARY_ARN,
    ),
  };
}

/** A bare branch/tag name becomes a full ref; an already-qualified ref is kept. */
function normalizeRef(ref: string): string {
  return ref.startsWith('refs/') ? ref : `refs/heads/${ref}`;
}
