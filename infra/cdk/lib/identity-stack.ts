import {
  Annotations,
  Duration,
  Fn,
  RemovalPolicy,
  SecretValue,
  Stack,
  Token,
  Validations,
  type StackProps,
  aws_cognito as cognito,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import {
  LEARNER_SUPABASE_SECRET_NAME,
  isPlaceholderProjectRef,
  supabaseProjectRef,
  supabaseProjectUrl,
} from './supabase-config.js';
import type { IdentityResources } from './interfaces.js';
import { assertExactHttpsOrigin, type WebOrigins } from './origins.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

export interface IdentityStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly webOrigins: WebOrigins;
}

const STAFF_GROUPS = [
  ['content-author', 50, 'Drafts original content without approval authority.'],
  ['reviewer', 40, 'Reviews content independently without publication authority.'],
  ['publisher', 30, 'Activates approved two-person content releases.'],
  ['privacy-operator', 20, 'Operates governed export and deletion workflows.'],
  ['sre', 10, 'Operates reliability and incident-response controls.'],
] as const;

function relyingPartyId(origin: string): string {
  return Token.isUnresolved(origin)
    ? Fn.select(1, Fn.split('https://', origin))
    : new URL(origin).hostname;
}

export class IdentityStack extends Stack {
  public readonly resources: IdentityResources;

  public constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    assertExactHttpsOrigin(props.webOrigins.learner);
    assertExactHttpsOrigin(props.webOrigins.staff);
    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    // Learner credentials live in Supabase, not in a user pool here. What this
    // stack owns for learners is the verification material the API needs:
    // the project URL and the public JWT signing keys.
    //
    // The key set is seeded empty and populated out of band by
    // `pnpm supabase:sync-jwks`, because the keys are owned by Supabase and
    // change on their rotation schedule, not on ours. Keeping them out of the
    // template means a key rotation is a one-command secret update rather than a
    // CloudFormation deployment, and means the repo never has to be redeployed to
    // recover from an unplanned rotation. An empty key set fails closed: every
    // token is rejected until the sync runs.
    const projectRef = supabaseProjectRef(this);
    const learnerApiSupabaseSecret = new secretsmanager.Secret(this, 'LearnerApiSupabaseSecret', {
      secretName: LEARNER_SUPABASE_SECRET_NAME,
      description:
        'Supabase project URL and public JWT signing keys used to verify learner access tokens.',
      // One JSON document rather than `secretObjectValue`, which stringifies each
      // field individually and would deliver `jwks` as a string of JSON that the
      // runtime parser rejects.
      secretStringValue: SecretValue.unsafePlainText(
        JSON.stringify({ projectUrl: supabaseProjectUrl(projectRef), jwks: { keys: [] } }),
      ),
    });
    learnerApiSupabaseSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    Validations.of(learnerApiSupabaseSecret).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason:
        'The value holds a project URL and public keys, so there is no secret material to rotate on a schedule; it is refreshed from Supabase when Supabase rotates its signing keys.',
    });
    if (isPlaceholderProjectRef(projectRef)) {
      Annotations.of(learnerApiSupabaseSecret).addWarning(
        'This secret points at a placeholder Supabase project. Learner sign-in will fail until ' +
          'the stack is synthesized with `-c supabaseProjectRef=<ref>` and `pnpm supabase:sync-jwks` has run.',
      );
    }

    const staffUserPool = new cognito.UserPool(this, 'StaffUserPool', {
      userPoolName: 'mcat-dev-staff',
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.NONE,
      deletionProtection: true,
      featurePlan: cognito.FeaturePlan.PLUS,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { sms: false, otp: true },
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
        },
      },
      passwordPolicy: {
        minLength: 14,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        passwordHistorySize: 10,
        tempPasswordValidity: Duration.days(1),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const staffUserPoolResource = staffUserPool.node.defaultChild as cognito.CfnUserPool;
    staffUserPoolResource.webAuthnFactorConfiguration = 'MULTI_FACTOR_WITH_USER_VERIFICATION';
    staffUserPoolResource.webAuthnRelyingPartyId = relyingPartyId(props.webOrigins.staff);
    staffUserPoolResource.webAuthnUserVerification = 'required';
    const staffClient = staffUserPool.addClient('StaffWebClient', {
      userPoolClientName: 'mcat-dev-staff-web',
      generateSecret: false,
      authFlows: { user: true, userSrp: true },
      accessTokenValidity: Duration.minutes(10),
      idTokenValidity: Duration.minutes(10),
      refreshTokenValidity: Duration.hours(12),
      authSessionValidity: Duration.minutes(3),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${props.webOrigins.staff}/auth/callback`],
        logoutUrls: [`${props.webOrigins.staff}/`],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    for (const [groupName, precedence, description] of STAFF_GROUPS) {
      new cognito.CfnUserPoolGroup(this, `Staff${groupName.replaceAll('-', '')}Group`, {
        groupName,
        description,
        precedence,
        userPoolId: staffUserPool.userPoolId,
      });
    }

    this.resources = { staffUserPool, staffClient };
  }
}
