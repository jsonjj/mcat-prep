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
import { WebStack } from '../lib/web-stack.js';

const environment = getEnvironment('dev');
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
  const web = new WebStack(app, 'McatDevWeb', { env, environment });
  const stack = new ApiStack(app, 'McatDevApi', {
    env,
    environment,
    foundation: foundation.resources,
    data: data.resources,
    web: web.resources,
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

  it('associates the regional API WAF without rate-limiting shared CloudFront edge IPs', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::WAFv2::WebACL', {
      DefaultAction: { Allow: {} },
      Rules: Match.arrayWith([Match.objectLike({ Name: 'AWSManagedCommonRuleSet' })]),
      Scope: 'REGIONAL',
    });
    const webAcls = Object.values(template.findResources('AWS::WAFv2::WebACL'));
    const wafDescriptionPattern = /^[\w+=:#@/,\-.][\w+=:#@/,\-.\s]+[\w+=:#@/,\-.]$/;
    for (const webAcl of webAcls) {
      expect((webAcl.Properties as { Description: string }).Description).toMatch(
        wafDescriptionPattern,
      );
    }
    const regional = webAcls.find(
      (resource) => (resource.Properties as { Scope?: string }).Scope === 'REGIONAL',
    );
    const edge = webAcls.find(
      (resource) => (resource.Properties as { Scope?: string }).Scope === 'CLOUDFRONT',
    );
    expect(JSON.stringify(regional)).not.toContain('SourceIpRateLimit');
    expect(JSON.stringify(edge)).toContain('SourceIpRateLimit');
    expect(regional?.Properties).toMatchObject({
      Rules: expect.arrayContaining([
        expect.objectContaining({
          Action: { Block: {} },
          Name: 'RequireCloudFrontOriginVerification',
          Priority: 0,
          Statement: {
            NotStatement: {
              Statement: expect.objectContaining({
                ByteMatchStatement: expect.objectContaining({
                  FieldToMatch: { SingleHeader: { Name: 'x-mcat-origin-verify' } },
                  PositionalConstraint: 'EXACTLY',
                }),
              }),
            },
          },
        }),
      ]),
    });
    template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
  });

  it('serves the learner API from the same CloudFront origin without caching writes', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const distributions = Object.values(template.findResources('AWS::CloudFront::Distribution'));

    expect(distributions).toHaveLength(2);
    const learner = distributions.find((resource) =>
      JSON.stringify(resource).includes('MCAT development learner PWA'),
    );
    expect(learner).toBeDefined();
    const config = (learner?.Properties as { DistributionConfig: Record<string, unknown> })
      .DistributionConfig;
    expect(config).not.toHaveProperty('CustomErrorResponses');
    expect(config).toMatchObject({
      HttpVersion: 'http2and3',
      Restrictions: {
        GeoRestriction: { Locations: ['US'], RestrictionType: 'whitelist' },
      },
      WebACLId: expect.any(Object),
    });
    expect(config.CacheBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'],
          CachePolicyId: '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
          OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
          PathPattern: 'v1/*',
        }),
      ]),
    );
    const serialized = JSON.stringify(learner);
    expect(serialized).toContain('x-mcat-origin-verify');
    expect(serialized).toContain('{{resolve:secretsmanager:');
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 2);
    template.resourceCountIs('AWS::CloudFront::Function', 2);
  });

  it('owns exact OAC bucket policies without introducing a reverse web-stack dependency', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const policies = JSON.stringify(template.findResources('AWS::S3::BucketPolicy'));

    template.resourceCountIs('AWS::S3::BucketPolicy', 2);
    expect(policies).toContain('cloudfront.amazonaws.com');
    expect(policies).toContain('AWS:SourceArn');
    expect(policies).toContain('distribution/');
    expect(policies).not.toContain('distribution/*');
  });

  it('applies edge security headers, SPA rewrites, and two WAF scopes', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const serialized = JSON.stringify(template.toJSON());

    template.resourceCountIs('AWS::WAFv2::WebACL', 2);
    expect(serialized).toContain('CLOUDFRONT');
    expect(serialized).toContain('REGIONAL');
    expect(serialized).toContain("default-src 'none'");
    expect(serialized).toContain("frame-ancestors 'none'");
    expect(serialized).toContain('noindex, nofollow, noarchive');
    expect(serialized).toContain("request.uri = '/index.html'");
  });

  it('uses exact learner CORS and no-store error responses', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          LEARNER_WEB_ORIGIN: Match.anyValue(),
          NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
          ORIGIN_VERIFICATION_SECRET_ARN: Match.anyValue(),
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

  it('runs the learner handler on Node 22 in the egress subnet tier without secret values', () => {
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
      // The AI provider config is fetched at runtime from this secret; only the
      // ARN is on the function, never the key itself.
      Environment: {
        Variables: Match.objectLike({ AI_CONFIG_SECRET_ARN: Match.anyValue() }),
      },
    });
    const functions = template.findResources('AWS::Lambda::Function');
    const variables = Object.values(functions).map(
      (resource) =>
        (resource.Properties as { readonly Environment: { readonly Variables: object } })
          .Environment.Variables,
    );
    expect(JSON.stringify(variables)).not.toMatch(/password|secret_value|session_token/i);
  });

  it('creates the AI provider secret without baking the key into the template', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/mcat/dev/ai/provider',
    });
    // The generated secret only ever holds empty placeholders in the template; the
    // real key is populated out-of-band with put-secret-value.
    const secrets = JSON.stringify(template.findResources('AWS::SecretsManager::Secret'));
    expect(secrets).not.toContain('tfy_pat_');
  });

  it('uses the foundation service endpoints and a metered HTTPS egress for Lambda execution', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::EC2::VPCEndpoint', 0);
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 443,
    });
    // The only CidrIp-based rule is the deliberate outbound-HTTPS path to the AI
    // provider via NAT; inbound never allows an open CIDR.
    expect(JSON.stringify(template.findResources('AWS::EC2::SecurityGroupIngress'))).not.toContain(
      'CidrIp',
    );
    // The open-CIDR egress rule is rendered inline on the learner SG (CIDR rules
    // stay inline; the cross-stack SG rules break out into SecurityGroupEgress).
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupDescription: 'Allows the learner API Lambda to reach only approved private services.',
      SecurityGroupEgress: Match.arrayWith([
        Match.objectLike({
          CidrIp: '0.0.0.0/0',
          FromPort: 443,
          ToPort: 443,
          IpProtocol: 'tcp',
        }),
      ]),
    });
  });

  it('grants only secret/KMS access and network connectivity to the proxy', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const policies = JSON.stringify(template.findResources('AWS::IAM::Policy'));

    expect(policies).toContain('secretsmanager:GetSecretValue');
    expect(policies).toContain('OriginVerificationSecret');
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

  it('uses only one Secrets Manager dynamic reference for the origin proof value', () => {
    const { stack } = createApi();
    const template = Template.fromStack(stack);
    const serialized = JSON.stringify(template.toJSON());
    const dynamicReferences = serialized.match(/\{\{resolve:secretsmanager:/g) ?? [];

    expect(dynamicReferences).toHaveLength(2);
    expect(serialized).toContain(':SecretString:::}}');
    expect(serialized).not.toMatch(/x-mcat-origin-verify[^}]{0,300}[A-Za-z0-9]{64}/);
  });

  it('exports the stage base URL so versioned clients do not request /v1/v1', () => {
    const { stack } = createApi();
    const outputs = Template.fromStack(stack).findOutputs('LearnerApiUrl');

    expect(JSON.stringify(outputs)).not.toContain('v1');
  });

  it('exports learner/admin delivery origins and distribution IDs from the API stack', () => {
    const { stack } = createApi();
    const outputs = Template.fromStack(stack).toJSON().Outputs;

    expect(outputs).toHaveProperty('LearnerWebUrl');
    expect(outputs).toHaveProperty('AdminWebUrl');
    expect(outputs).toHaveProperty('LearnerDistributionId');
    expect(outputs).toHaveProperty('AdminDistributionId');
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
