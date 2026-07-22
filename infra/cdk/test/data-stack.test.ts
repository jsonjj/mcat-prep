import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AwsSolutionsChecks } from 'cdk-nag';
import { describe, expect, it } from 'vitest';

import { getEnvironment } from '../config/environments.js';
import { DataStack } from '../lib/data-stack.js';
import { FoundationStack } from '../lib/foundation-stack.js';

const environment = getEnvironment('dev');

function createData(): {
  readonly app: App;
  readonly foundation: FoundationStack;
  readonly stack: DataStack;
} {
  const app = new App();
  const env = { account: environment.account, region: environment.region };
  const foundation = new FoundationStack(app, 'McatDevFoundation', { env, environment });
  const stack = new DataStack(app, 'McatDevData', {
    env,
    environment,
    foundation: foundation.resources,
  });
  stack.addDependency(foundation);
  return { app, foundation, stack };
}

describe('DataStack', () => {
  it('creates Aurora PostgreSQL 17.9 Serverless v2 at the approved capacity', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::RDS::DBCluster', {
      BackupRetentionPeriod: 7,
      DatabaseName: 'mcat',
      DeletionProtection: false,
      EnableIAMDatabaseAuthentication: true,
      Engine: 'aurora-postgresql',
      EngineVersion: '17.9',
      ServerlessV2ScalingConfiguration: { MinCapacity: 0.5, MaxCapacity: 2 },
      StorageEncrypted: true,
    });
    template.hasResourceProperties('AWS::RDS::DBInstance', {
      DBInstanceClass: 'db.serverless',
      Engine: 'aurora-postgresql',
    });
  });

  it('creates separate encrypted principals and a TLS-only RDS Proxy', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::SecretsManager::Secret', 5);
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: 'Generated administrator credentials for the MCAT development Aurora cluster.',
      KmsKeyId: Match.anyValue(),
      Name: '/mcat/dev/database/admin',
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/mcat/dev/database/learner-api',
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/mcat/dev/database/workers',
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: '/mcat/dev/rate-limit/pepper',
    });
    template.hasResourceProperties('AWS::SecretsManager::Secret', {
      GenerateSecretString: {
        ExcludePunctuation: true,
        PasswordLength: 64,
      },
      KmsKeyId: Match.anyValue(),
      Name: '/mcat/dev/origin/verification',
    });
    template.resourceCountIs('AWS::RDS::DBProxy', 1);
    template.hasResourceProperties('AWS::RDS::DBProxy', {
      Auth: Match.arrayWith([
        Match.objectLike({
          AuthScheme: 'SECRETS',
          IAMAuth: 'DISABLED',
        }),
        Match.objectLike({
          AuthScheme: 'SECRETS',
          IAMAuth: 'DISABLED',
        }),
        Match.objectLike({
          AuthScheme: 'SECRETS',
          IAMAuth: 'DISABLED',
        }),
      ]),
      DebugLogging: false,
      RequireTLS: true,
    });
  });

  it('retains the generated origin-verification secret without synthesizing its value', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);
    const secrets = template.findResources('AWS::SecretsManager::Secret');
    const originVerification = Object.values(secrets).find(
      (resource) =>
        (resource.Properties as { readonly Name?: string }).Name ===
        '/mcat/dev/origin/verification',
    );

    expect(originVerification).toBeDefined();
    expect(originVerification).toMatchObject({
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        GenerateSecretString: {
          ExcludePunctuation: true,
          PasswordLength: 64,
        },
      },
    });
    expect(
      (originVerification as { readonly Properties?: Record<string, unknown> }).Properties,
    ).not.toHaveProperty('SecretString');
  });

  it('runs a one-shot migration Lambda with all principals and private endpoint access', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'mcat-dev-migration-runner',
      Handler: 'index.handler',
      Runtime: 'nodejs22.x',
      Environment: {
        Variables: Match.objectLike({
          ADMIN_DB_SECRET_ARN: Match.anyValue(),
          LEARNER_API_DB_SECRET_ARN: Match.anyValue(),
          WORKERS_DB_SECRET_ARN: Match.anyValue(),
          DB_NAME: 'mcat',
          DB_PROXY_ENDPOINT: Match.anyValue(),
          MIGRATIONS_DIR: '/var/task/migrations',
          NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
        }),
      },
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupEgress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      ToPort: 443,
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 443,
      IpProtocol: 'tcp',
      SourceSecurityGroupId: Match.anyValue(),
      ToPort: 443,
    });
    template.hasOutput('MigrationFunctionArn', { Value: Match.anyValue() });
  });

  it('creates private versioned buckets with a server-log-compatible encrypted audit sink', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::S3::Bucket', 7);
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'mcat-dev-audit-logs-056956104102-us-east-1',
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
          },
        ],
      },
    });

    const buckets = template.findResources('AWS::S3::Bucket');
    const applicationBuckets = Object.values(buckets).filter(
      (resource) =>
        (resource.Properties as { readonly BucketName: string }).BucketName !==
        'mcat-dev-audit-logs-056956104102-us-east-1',
    );
    expect(applicationBuckets).toHaveLength(6);
    for (const resource of applicationBuckets) {
      expect(resource.Properties).toMatchObject({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            {
              BucketKeyEnabled: true,
              ServerSideEncryptionByDefault: expect.objectContaining({
                SSEAlgorithm: 'aws:kms',
              }),
            },
          ],
        },
      });
    }

    template.allResourcesProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      VersioningConfiguration: { Status: 'Enabled' },
    });

    const names = Object.values(buckets).map(
      (resource) => (resource.Properties as { readonly BucketName: string }).BucketName,
    );
    expect(new Set(names).size).toBe(7);
    expect(names.every((name) => name.startsWith('mcat-dev-'))).toBe(true);
  });

  it('creates ordered projection queues with a FIFO dead-letter queue', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::SQS::Queue', {
      ContentBasedDeduplication: false,
      FifoQueue: true,
      QueueName: 'mcat-dev-projection.fifo',
      RedrivePolicy: Match.objectLike({ deadLetterTargetArn: Match.anyValue() }),
    });
    template.hasResourceProperties('AWS::SQS::Queue', {
      FifoQueue: true,
      QueueName: 'mcat-dev-projection-dlq.fifo',
    });
  });

  it('creates separate standard queues and dead-letter queues for async domains', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::SQS::Queue', 10);
    for (const domain of ['analytics', 'publication', 'privacy', 'notifications']) {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: `mcat-dev-${domain}`,
        RedrivePolicy: Match.objectLike({ deadLetterTargetArn: Match.anyValue() }),
      });
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: `mcat-dev-${domain}-dlq`,
      });
    }

    const standardQueues = Object.values(template.findResources('AWS::SQS::Queue')).filter(
      (resource) => !(resource.Properties as { readonly FifoQueue?: boolean }).FifoQueue,
    );
    expect(standardQueues).toHaveLength(8);
  });

  it('applies explicit snapshot and retention policies to stateful resources', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);

    template.hasResource('AWS::RDS::DBCluster', {
      DeletionPolicy: 'Snapshot',
      UpdateReplacePolicy: 'Snapshot',
    });
    expect(
      Object.values(template.findResources('AWS::S3::Bucket')).every(
        (resource) => resource.DeletionPolicy === 'Retain' || resource.DeletionPolicy === 'Delete',
      ),
    ).toBe(true);
  });

  it('tags the data plane with restricted classification', () => {
    const { stack } = createData();
    const requiredTags = Match.arrayWith([
      { Key: 'Application', Value: 'mcat-mastery' },
      { Key: 'DataClassification', Value: 'restricted' },
      { Key: 'Environment', Value: 'dev' },
      { Key: 'ManagedBy', Value: 'cdk' },
      { Key: 'Owner', Value: 'jonathan-thomas' },
    ]);
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::RDS::DBCluster', { Tags: requiredTags });
    template.hasResourceProperties('AWS::S3::Bucket', { Tags: requiredTags });
    template.hasResourceProperties('AWS::SQS::Queue', { Tags: requiredTags });
  });

  it('applies the sandbox permissions boundary to every generated role', () => {
    const { stack } = createData();
    const template = Template.fromStack(stack);
    const roles = template.findResources('AWS::IAM::Role');

    expect(Object.keys(roles).length).toBeGreaterThan(0);
    template.allResourcesProperties('AWS::IAM::Role', {
      PermissionsBoundary: 'arn:aws:iam::056956104102:policy/InternSandboxBoundary',
    });
  });

  it('has no unsuppressed AWS Solutions findings', () => {
    const { app, foundation, stack } = createData();
    app.synth();
    const report = new AwsSolutionsChecks(app, { verbose: true }).validateScope(app);

    expect(foundation.stackName).toBe('McatDevFoundation');
    expect(stack.stackName).toBe('McatDevData');
    expect(report.violations).toEqual([]);
    expect(report.success).toBe(true);
  });
});
