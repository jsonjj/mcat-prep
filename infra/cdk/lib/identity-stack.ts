import {
  Duration,
  Fn,
  RemovalPolicy,
  Stack,
  Token,
  Validations,
  type StackProps,
  aws_cognito as cognito,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
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

    const learnerUserPool = new cognito.UserPool(this, 'LearnerUserPool', {
      userPoolName: 'mcat-dev-learners',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      deletionProtection: true,
      featurePlan: cognito.FeaturePlan.PLUS,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          emailOtp: true,
          passkey: true,
        },
      },
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: true,
        requireUppercase: true,
        passwordHistorySize: 5,
        tempPasswordValidity: Duration.days(3),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const learnerClient = learnerUserPool.addClient('LearnerWebClient', {
      userPoolClientName: 'mcat-dev-learner-web',
      generateSecret: false,
      authFlows: { user: true, userSrp: true },
      accessTokenValidity: Duration.minutes(15),
      idTokenValidity: Duration.minutes(15),
      refreshTokenValidity: Duration.days(30),
      authSessionValidity: Duration.minutes(3),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL],
        callbackUrls: [`${props.webOrigins.learner}/auth/callback`],
        logoutUrls: [`${props.webOrigins.learner}/`],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });

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

    Validations.of(learnerUserPool).acknowledge({
      id: 'AwsSolutions-COG2',
      reason:
        'Learner MFA is intentionally optional for the adult beta to preserve accessible account entry; staff MFA remains mandatory and learner TOTP is available as an opt-in control.',
    });

    this.resources = { learnerUserPool, learnerClient, staffUserPool, staffClient };
  }
}
