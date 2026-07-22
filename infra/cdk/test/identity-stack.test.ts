import { App, aws_iam as iam } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { IdentityStack } from '../lib/identity-stack.js';

const environment = getEnvironment('dev');
const webOrigins = {
  learner: 'https://learner.example.test',
  staff: 'https://admin.example.test',
} as const;

function createIdentity(): { readonly app: App; readonly stack: IdentityStack } {
  const app = new App();
  const stack = new IdentityStack(app, 'McatDevIdentity', {
    env: { account: environment.account, region: environment.region },
    environment,
    webOrigins,
  });
  return { app, stack };
}

describe('IdentityStack', () => {
  it('creates distinct retained learner and staff user pools', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPool', 2);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'mcat-dev-learners',
      DeletionProtection: 'ACTIVE',
      AccountRecoverySetting: {
        RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }],
      },
    });
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'mcat-dev-staff',
      DeletionProtection: 'ACTIVE',
      MfaConfiguration: 'ON',
      EnabledMfas: ['SOFTWARE_TOKEN_MFA'],
    });
    for (const resource of Object.values(template.findResources('AWS::Cognito::UserPool'))) {
      expect(resource.DeletionPolicy).toBe('Retain');
      expect(resource.UpdateReplacePolicy).toBe('Retain');
    }
  });

  it('creates public PKCE-capable browser clients without secrets', () => {
    const { stack } = createIdentity();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Cognito::UserPoolClient', 2);
    template.allResourcesProperties('AWS::Cognito::UserPoolClient', {
      AllowedOAuthFlows: ['code'],
      AllowedOAuthFlowsUserPoolClient: true,
      GenerateSecret: false,
      PreventUserExistenceErrors: 'ENABLED',
      SupportedIdentityProviders: ['COGNITO'],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'mcat-dev-learner-web',
      CallbackURLs: [`${webOrigins.learner}/auth/callback`],
      LogoutURLs: [`${webOrigins.learner}/`],
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ClientName: 'mcat-dev-staff-web',
      CallbackURLs: [`${webOrigins.staff}/auth/callback`],
      LogoutURLs: [`${webOrigins.staff}/`],
    });
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
