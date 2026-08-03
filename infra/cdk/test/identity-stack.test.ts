import { App, aws_iam as iam } from 'aws-cdk-lib';
import { Annotations, Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { IdentityStack } from '../lib/identity-stack.js';

const environment = getEnvironment('dev');
const webOrigins = {
  learner: 'https://learner.example.test',
  staff: 'https://admin.example.test',
} as const;

const PROJECT_REF = 'abcdefghijklmnopqrst';

function createIdentity(context: Record<string, unknown> = { supabaseProjectRef: PROJECT_REF }): {
  readonly app: App;
  readonly stack: IdentityStack;
} {
  const app = new App({ context });
  const stack = new IdentityStack(app, 'McatDevIdentity', {
    env: { account: environment.account, region: environment.region },
    environment,
    webOrigins,
  });
  return { app, stack };
}

describe('IdentityStack', () => {
  it('keeps only the staff pool, since learner credentials live in Supabase', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'mcat-dev-staff',
      DeletionProtection: 'ACTIVE',
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ['PASSWORD'] },
      },
      WebAuthnFactorConfiguration: 'MULTI_FACTOR_WITH_USER_VERIFICATION',
      WebAuthnRelyingPartyID: 'admin.example.test',
      WebAuthnUserVerification: 'required',
    });
    for (const resource of Object.values(template.findResources('AWS::Cognito::UserPool'))) {
      expect(resource.DeletionPolicy).toBe('Retain');
      expect(resource.UpdateReplacePolicy).toBe('Retain');
    }
  });

  it('keeps the staff console on a public PKCE browser client', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'mcat-dev-staff-web',
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      SupportedIdentityProviders: ['COGNITO'],
      CallbackURLs: [`${webOrigins.staff}/auth/callback`],
      LogoutURLs: [`${webOrigins.staff}/`],
    });
  });

  it('publishes the Supabase verification config in the shape the runtime parses', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/mcat/dev/supabase/learner-api',
    });

    // Asserted structurally rather than eyeballed. `infra/cdk` deliberately has no
    // workspace dependencies, so it cannot call the runtime parser directly; the
    // matching assertion lives beside it in
    // `services/lambdas/learner-api/src/auth/supabase.test.ts`, and the two must be
    // changed together. A drift between them surfaces only as a cold-start crash
    // in a deployed Lambda, which is why each side pins the shape.
    const [secret] = Object.values(template.findResources('AWS::SecretsManager::Secret'));
    const config = JSON.parse(String(secret?.Properties?.SecretString)) as {
      projectUrl: unknown;
      jwks: { keys: unknown };
    };

    expect(config.projectUrl).toBe(`https://${PROJECT_REF}.supabase.co`);
    // A nested object, not a string of JSON. `secretObjectValue` would produce the
    // latter and the runtime parser rejects it.
    expect(config.jwks).toEqual({ keys: [] });
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });

  it('retains the verification secret so a redeploy cannot drop synced keys', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    for (const resource of Object.values(template.findResources('AWS::SecretsManager::Secret'))) {
      expect(resource.DeletionPolicy).toBe('Retain');
      expect(resource.UpdateReplacePolicy).toBe('Retain');
    }
  });

  it('warns rather than silently shipping a placeholder project', () => {
    const { stack } = createIdentity({});
    const warnings = Annotations.fromStack(stack).findWarning(
      '*',
      Match.stringLikeRegexp('supabaseProjectRef'),
    );

    expect(warnings.length).toBeGreaterThan(0);
  });

  it('creates staff separation-of-duty groups without federation', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPoolGroup', 5);
    for (const groupName of [
      'content-author',
      'reviewer',
      'publisher',
      'privacy-operator',
      'sre',
    ]) {
      template.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: groupName });
    }
    template.resourceCountIs('AWS::Cognito::UserPoolIdentityProvider', 0);
    template.resourceCountIs('AWS::Cognito::IdentityPool', 0);
  });

  it('applies required tags and sandbox boundaries to generated resources', () => {
    const { stack } = createIdentity();
    new iam.Role(stack, 'BoundaryProbe', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTags: Match.objectLike({
        Application: 'mcat-mastery',
        DataClassification: 'restricted',
        Environment: 'dev',
        ManagedBy: 'cdk',
        Owner: 'jonathan-thomas',
      }),
    });
    template.allResourcesProperties('AWS::IAM::Role', {
      PermissionsBoundary: 'arn:aws:iam::056956104102:policy/InternSandboxBoundary',
    });
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const { app } = createIdentity();
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

    expect(report.violations).toEqual([]);
    expect(report.success).toBe(true);
  });
});
