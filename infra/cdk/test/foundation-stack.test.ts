import { Match, Template } from 'aws-cdk-lib/assertions';
import { App, aws_iam as iam } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { FoundationStack } from '../lib/foundation-stack.js';

const environment = getEnvironment('dev');

function createFoundation(): { readonly app: App; readonly stack: FoundationStack } {
  const app = new App();
  const stack = new FoundationStack(app, 'McatDevFoundation', {
    env: { account: environment.account, region: environment.region },
    environment,
  });
  return { app, stack };
}

describe('FoundationStack', () => {
  it('creates a two-AZ VPC without NAT gateways', () => {
    const { stack } = createFoundation();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::EC2::Subnet', 4);
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('creates the no-NAT gateway and shared private service endpoints', () => {
    const { stack } = createFoundation();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::VPCEndpoint', 4);
    template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
      ServiceName: Match.objectLike({ 'Fn::Join': Match.anyValue() }),
      VpcEndpointType: 'Gateway',
    });
    const endpoints = JSON.stringify(template.findResources('AWS::EC2::VPCEndpoint'));
    expect(endpoints).toContain('secretsmanager');
    expect(endpoints).toContain('sqs');
    expect(endpoints).toContain('xray');
    expect(endpoints).not.toContain('0.0.0.0/0');
    expect(JSON.stringify(template.findResources('AWS::EC2::SecurityGroupIngress'))).not.toContain(
      'CidrIp',
    );
    expect(JSON.stringify(template.findResources('AWS::EC2::SecurityGroup'))).not.toContain(
      'CidrBlock',
    );
  });

  it('creates independently rotating application and audit keys', () => {
    const { stack } = createFoundation();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KMS::Key', 2);
    template.allResourcesProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  it('does not grant the S3 logging service broad access to the analytics audit key', () => {
    const { stack } = createFoundation();
    const template = Template.fromStack(stack);
    const keys = template.findResources('AWS::KMS::Key');
    const auditKey = Object.values(keys).find(
      (resource) =>
        (resource.Properties as { readonly Description?: string }).Description ===
        'Encrypts MCAT Mastery development analytics and audit data.',
    );

    expect(JSON.stringify(auditKey)).not.toContain('logging.s3.amazonaws.com');
  });

  it('creates the exact monthly budget with early forecast and hard actual notifications', () => {
    const { stack } = createFoundation();

    Template.fromStack(stack).hasResourceProperties('AWS::Budgets::Budget', {
      Budget: {
        BudgetLimit: { Amount: 100, Unit: 'USD' },
        BudgetName: 'mcat-dev-monthly',
        BudgetType: 'COST',
        TimeUnit: 'MONTHLY',
      },
      NotificationsWithSubscribers: Match.arrayWith([
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'FORECASTED', Threshold: 50 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'FORECASTED', Threshold: 80 }),
        }),
        Match.objectLike({
          Notification: Match.objectLike({ NotificationType: 'ACTUAL', Threshold: 100 }),
        }),
      ]),
    });
  });

  it('tags taggable foundation resources with the required ownership metadata', () => {
    const { stack } = createFoundation();
    const requiredTags = Match.arrayWith([
      { Key: 'Application', Value: 'mcat-mastery' },
      { Key: 'DataClassification', Value: 'internal' },
      { Key: 'Environment', Value: 'dev' },
      { Key: 'ManagedBy', Value: 'cdk' },
      { Key: 'Owner', Value: 'jonathan-thomas' },
    ]);

    Template.fromStack(stack).hasResourceProperties('AWS::EC2::VPC', { Tags: requiredTags });
    Template.fromStack(stack).allResourcesProperties('AWS::KMS::Key', { Tags: requiredTags });
  });

  it('applies the sandbox permissions boundary to every role in the stack', () => {
    const { stack } = createFoundation();
    new iam.Role(stack, 'BoundaryProbe', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    Template.fromStack(stack).allResourcesProperties('AWS::IAM::Role', {
      PermissionsBoundary: 'arn:aws:iam::056956104102:policy/InternSandboxBoundary',
    });
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const { app, stack } = createFoundation();
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

    expect(stack.stackName).toBe('McatDevFoundation');
    expect(report.violations).toEqual([]);
    expect(report.success).toBe(true);
  });
});
