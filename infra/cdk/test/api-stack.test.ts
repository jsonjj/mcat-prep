import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { ApiStack } from '../lib/api-stack.js';
import { DataStack } from '../lib/data-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';
import { IdentityStack } from '../lib/identity-stack.js';

const environment = getEnvironment('dev');
const webOrigins = {
  learner: 'https://learner.example.test',
  staff: 'https://admin.example.test',
} as const;
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const learnerEntry = path.join(repoRoot, 'services/lambdas/learner-api/src/lambda.ts');

function createApi(): { readonly app: App; readonly stack: ApiStack } {
  const app = new App();
  const env = { account: environment.account, region: environment.region };
  const foundation = new FoundationStack(app, 'McatDevFoundation', { env, environment });
  const data = new DataStack(app, 'McatDevData', {
    env,
    environment,
    foundation: foundation.resources,
  });
  const identity = new IdentityStack(app, 'McatDevIdentity', {
    env,
    environment,
    webOrigins,
  });
  const stack = new ApiStack(app, 'McatDevApi', {
    env,
    environment,
    foundation: foundation.resources,
    data: data.resources,
    identity: identity.resources,
    allowedOrigins: [webOrigins.learner],
    learnerRuntimeEntry: learnerEntry,
  });
  return { app, stack };
}

describe('ApiStack', () => {
  it('creates a regional REST API with a versioned route and bounded stage', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      EndpointConfiguration: { Types: ['REGIONAL'] },
      MinimumCompressionSize: 1024,
      Name: 'mcat-dev-learner-api',
    });
    template.hasResourceProperties('AWS::ApiGateway::Resource', { PathPart: 'v1' });
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      AccessLogSetting: Match.objectLike({ DestinationArn: Match.anyValue() }),
      MethodSettings: Match.arrayWith([
        Match.objectLike({
          DataTraceEnabled: false,
          LoggingLevel: 'INFO',
          MetricsEnabled: true,
          ThrottlingBurstLimit: 100,
          ThrottlingRateLimit: 50,
        }),
      ]),
      StageName: 'dev',
      TracingEnabled: true,
    });
    expect(JSON.stringify(template.findResources('AWS::ApiGateway::Stage'))).not.toContain(
      'identity.sourceIp',
    );
  });

  it('uses exact learner CORS and no-store error responses', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          LEARNER_WEB_ORIGIN: webOrigins.learner,
          NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
          RATE_LIMIT_PEPPER_SECRET_ARN: Match.anyValue(),
        }),
      },
    });
    template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
      ResponseParameters: {
        'gatewayresponse.header.Cache-Control': "'no-store'",
        'gatewayresponse.header.Pragma': "'no-cache'",
      },
    });
    expect(JSON.stringify(template.toJSON())).not.toContain('Access-Control-Allow-Origin":"*');
  });

  it('runs the learner handler on Node 22 in isolated subnets without secret values', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 1);
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'mcat-dev-learner-api',
      Handler: 'index.handler',
      Runtime: 'nodejs22.x',
      TracingConfig: { Mode: 'Active' },
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
    });
    const functions = template.findResources('AWS::Lambda::Function');
    const variables = Object.values(functions).map(
      (resource) =>
        (resource.Properties as { readonly Environment: { readonly Variables: object } })
          .Environment.Variables,
    );
    expect(JSON.stringify(variables)).not.toMatch(/password|secret_value|session_token/i);
  });

  it('uses the foundation service endpoints required by no-NAT Lambda execution', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 443,
    });
    expect(JSON.stringify(template.findResources('AWS::EC2::SecurityGroupIngress'))).not.toContain(
      'CidrIp',
    );
  });

  it('grants only secret/KMS access and network connectivity to the proxy', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));

    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('kms:Decrypt');
    expect(policies).not.toContain('rds-db:connect');
    template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
      FromPort: 5432,
      IpProtocol: 'tcp',
      ToPort: 5432,
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      ToPort: 443,
    });
  });

  it('exports the stage base URL so versioned clients do not request /v1/v1', () => {
    const { stack } = createApi();
    const outputs = Template.fromStack(stack).findOutputs('LearnerApiUrl');

    expect(JSON.stringify(outputs)).not.toContain('v1');
  });

  it('retains access logs and applies the sandbox boundary to every role', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/apigateway/mcat-dev-learner-api-access',
      RetentionInDays: 90,
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/lambda/mcat-dev-learner-api',
      RetentionInDays: 90,
    });
    template.allResourcesProperties('AWS::IAM::Role', {
      PermissionsBoundary: 'arn:aws:iam::056956104102:policy/InternSandboxBoundary',
    });
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const { app } = createApi();
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

    expect(report.violations).toEqual([]);
    expect(report.success).toBe(true);
  });
});
