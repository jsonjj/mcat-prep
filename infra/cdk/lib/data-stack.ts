import { fileURLToPath } from 'node:url';

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_ec2 as ec2,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_rds as rds,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentConfig } from '../config/environments.js';
import type {
  AsyncQueueDomain,
  DataBuckets,
  DataResources,
  FoundationResources,
} from './interfaces.js';
import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';
import { acknowledgeCdkNagFinding } from './nag.js';

export interface DataStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly foundation: FoundationResources;
  readonly migrationRuntimeEntry?: string;
  readonly migrationsDirectory?: string;
}

interface BucketOptions {
  readonly name: string;
  readonly encryptionKey?: FoundationResources['appKey'];
  readonly noncurrentVersionDays: number;
  readonly serverAccessLogsBucket?: s3.IBucket;
  readonly expirationDays?: number;
  readonly objectOwnership?: s3.ObjectOwnership;
}

interface QueuePair {
  readonly queue: sqs.Queue;
  readonly dlq: sqs.Queue;
}

const ASYNC_QUEUE_DOMAINS = [
  'analytics',
  'publication',
  'privacy',
  'notifications',
] as const satisfies readonly AsyncQueueDomain[];

const DEFAULT_MIGRATION_RUNTIME_ENTRY = fileURLToPath(
  new URL('../../../services/lambdas/migration/src/lambda.ts', import.meta.url),
);
const DEFAULT_MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../database/migrations/', import.meta.url),
);

export class DataStack extends Stack {
  public readonly resources: DataResources;

  public constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const appKey = kms.Key.fromKeyArn(
      this,
      'ApplicationKeyReference',
      props.foundation.appKey.keyArn,
    );
    const auditKey = kms.Key.fromKeyArn(
      this,
      'AuditKeyReference',
      props.foundation.auditKey.keyArn,
    );

    const databaseSecurityGroup = new ec2.SecurityGroup(this, 'DatabaseSecurityGroup', {
      vpc: props.foundation.vpc,
      allowAllOutbound: false,
      description: 'Allows Aurora traffic only from the RDS Proxy.',
      securityGroupName: 'mcat-dev-database',
    });
    const proxySecurityGroup = new ec2.SecurityGroup(this, 'ProxySecurityGroup', {
      vpc: props.foundation.vpc,
      allowAllOutbound: false,
      description: 'Allows the RDS Proxy to connect only to Aurora.',
      securityGroupName: 'mcat-dev-rds-proxy',
    });
    databaseSecurityGroup.addIngressRule(
      proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL from the RDS Proxy.',
    );
    proxySecurityGroup.addEgressRule(
      databaseSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow PostgreSQL to Aurora.',
    );

    const dbSecret = new secretsmanager.Secret(this, 'DatabaseSecret', {
      secretName: '/mcat/dev/database/admin',
      description: 'Generated administrator credentials for the MCAT development Aurora cluster.',
      encryptionKey: appKey,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: 'mcat_admin' }),
        generateStringKey: 'password',
        excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'"\\/@',
        passwordLength: 40,
      },
    });
    dbSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);
    const learnerApiDbSecret = createDatabasePrincipalSecret(
      this,
      'LearnerApiDatabaseSecret',
      '/mcat/dev/database/learner-api',
      'mcat_learner_api',
      'Generated least-privilege credentials for the MCAT learner API.',
      appKey,
    );
    const workersDbSecret = createDatabasePrincipalSecret(
      this,
      'WorkersDatabaseSecret',
      '/mcat/dev/database/workers',
      'mcat_workers',
      'Generated least-privilege credentials for MCAT asynchronous workers.',
      appKey,
    );
    const rateLimitPepperSecret = new secretsmanager.Secret(this, 'RateLimitPepperSecret', {
      secretName: '/mcat/dev/rate-limit/pepper',
      description: 'Keys irreversible source rate-limit identifiers for the learner API.',
      encryptionKey: appKey,
      generateSecretString: {
        excludePunctuation: true,
        passwordLength: 64,
      },
    });
    rateLimitPepperSecret.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const auroraLogGroup = new logs.LogGroup(this, 'AuroraPostgresqlLogGroup', {
      logGroupName: '/aws/rds/cluster/mcat-dev-aurora/postgresql',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const cluster = new rds.DatabaseCluster(this, 'AuroraCluster', {
      clusterIdentifier: 'mcat-dev-aurora',
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_17_9,
      }),
      writer: rds.ClusterInstance.serverlessV2('Writer', {
        publiclyAccessible: false,
      }),
      credentials: rds.Credentials.fromSecret(dbSecret),
      defaultDatabaseName: 'mcat',
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 2,
      storageEncrypted: true,
      storageEncryptionKey: appKey,
      iamAuthentication: true,
      backup: {
        retention: Duration.days(7),
        preferredWindow: '05:00-06:00',
      },
      cloudwatchLogsExports: ['postgresql'],
      copyTagsToSnapshot: true,
      deletionProtection: false,
      removalPolicy: RemovalPolicy.SNAPSHOT,
      securityGroups: [databaseSecurityGroup],
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    cluster.node.addDependency(auroraLogGroup);

    const proxy = cluster.addProxy('Proxy', {
      dbProxyName: 'mcat-dev-proxy',
      debugLogging: false,
      iamAuth: false,
      requireTLS: true,
      secrets: [dbSecret, learnerApiDbSecret, workersDbSecret],
      securityGroups: [proxySecurityGroup],
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    const migrationSecurityGroup = new ec2.SecurityGroup(this, 'MigrationSecurityGroup', {
      vpc: props.foundation.vpc,
      allowAllOutbound: false,
      description: 'Allows the one-shot migration Lambda to reach only the proxy and endpoints.',
      securityGroupName: 'mcat-dev-migration',
    });
    migrationSecurityGroup.addEgressRule(
      proxySecurityGroup,
      ec2.Port.tcp(5432),
      'Connect to the TLS-only RDS Proxy.',
    );
    migrationSecurityGroup.addEgressRule(
      props.foundation.serviceEndpointSecurityGroup,
      ec2.Port.tcp(443),
      'Read approved database secrets through the private endpoint.',
    );
    new ec2.CfnSecurityGroupIngress(this, 'ProxyIngressFromMigration', {
      groupId: proxySecurityGroup.securityGroupId,
      sourceSecurityGroupId: migrationSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      description: 'Allow PostgreSQL only from the migration Lambda security group.',
    });
    new ec2.CfnSecurityGroupIngress(this, 'EndpointIngressFromMigration', {
      groupId: props.foundation.serviceEndpointSecurityGroup.securityGroupId,
      sourceSecurityGroupId: migrationSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 443,
      toPort: 443,
      description: 'Allow only the migration Lambda to call approved AWS services.',
    });
    const migrationLogGroup = new logs.LogGroup(this, 'MigrationLogGroup', {
      logGroupName: '/aws/lambda/mcat-dev-migration',
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const migrationsDirectory = props.migrationsDirectory ?? DEFAULT_MIGRATIONS_DIRECTORY;
    const migrationFunction = new nodejs.NodejsFunction(this, 'MigrationFunction', {
      functionName: 'mcat-dev-migration-runner',
      description: 'Applies reviewed forward-only migrations and least-privilege role grants.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.migrationRuntimeEntry ?? DEFAULT_MIGRATION_RUNTIME_ENTRY,
      handler: 'handler',
      logGroup: migrationLogGroup,
      memorySize: 512,
      timeout: Duration.minutes(5),
      reservedConcurrentExecutions: 1,
      tracing: lambda.Tracing.ACTIVE,
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [migrationSecurityGroup],
      environment: {
        AWS_ACCOUNT_ID: props.environment.account,
        ADMIN_DB_SECRET_ARN: dbSecret.secretArn,
        LEARNER_API_DB_SECRET_ARN: learnerApiDbSecret.secretArn,
        WORKERS_DB_SECRET_ARN: workersDbSecret.secretArn,
        DB_PROXY_ENDPOINT: proxy.endpoint,
        DB_NAME: 'mcat',
        MIGRATIONS_DIR: '/var/task/migrations',
        NODE_EXTRA_CA_CERTS: '/var/runtime/ca-cert.pem',
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        target: 'node22',
        minify: true,
        sourceMap: false,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (_inputDir, outputDir) => [
            `cp -R ${shellQuote(migrationsDirectory)} ${shellQuote(`${outputDir}/migrations`)}`,
          ],
        },
      },
    });
    for (const secret of [dbSecret, learnerApiDbSecret, workersDbSecret, rateLimitPepperSecret]) {
      secret.grantRead(migrationFunction);
    }
    appKey.grantDecrypt(migrationFunction);

    new CfnOutput(this, 'MigrationFunctionArn', {
      value: migrationFunction.functionArn,
      exportName: 'mcat-dev-migration-function-arn',
    });

    const bucketSuffix = `${props.environment.account}-${props.environment.region}`;
    const auditLogs = createBucket(this, 'AuditLogsBucket', {
      name: `mcat-dev-audit-logs-${bucketSuffix}`,
      noncurrentVersionDays: 365,
      expirationDays: 730,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER,
    });
    const buckets: DataBuckets = {
      auditLogs,
      sourceQuarantine: createBucket(this, 'SourceQuarantineBucket', {
        name: `mcat-dev-source-quarantine-${bucketSuffix}`,
        encryptionKey: appKey,
        noncurrentVersionDays: 90,
        expirationDays: 180,
        serverAccessLogsBucket: auditLogs,
      }),
      protectedContent: createBucket(this, 'ProtectedContentBucket', {
        name: `mcat-dev-protected-content-${bucketSuffix}`,
        encryptionKey: appKey,
        noncurrentVersionDays: 180,
        serverAccessLogsBucket: auditLogs,
      }),
      authorizedDelivery: createBucket(this, 'AuthorizedDeliveryBucket', {
        name: `mcat-dev-authorized-delivery-${bucketSuffix}`,
        encryptionKey: appKey,
        noncurrentVersionDays: 30,
        expirationDays: 90,
        serverAccessLogsBucket: auditLogs,
      }),
      exports: createBucket(this, 'ExportsBucket', {
        name: `mcat-dev-exports-${bucketSuffix}`,
        encryptionKey: appKey,
        noncurrentVersionDays: 7,
        expirationDays: 14,
        serverAccessLogsBucket: auditLogs,
      }),
      publicAssets: createBucket(this, 'PublicAssetsBucket', {
        name: `mcat-dev-public-assets-${bucketSuffix}`,
        encryptionKey: appKey,
        noncurrentVersionDays: 30,
        serverAccessLogsBucket: auditLogs,
      }),
      analytics: createBucket(this, 'AnalyticsBucket', {
        name: `mcat-dev-analytics-${bucketSuffix}`,
        encryptionKey: auditKey,
        noncurrentVersionDays: 90,
        expirationDays: 365,
        serverAccessLogsBucket: auditLogs,
      }),
    };

    const projectionDlq = new sqs.Queue(this, 'ProjectionDlq', {
      queueName: 'mcat-dev-projection-dlq.fifo',
      fifo: true,
      contentBasedDeduplication: false,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: appKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    const projectionQueue = new sqs.Queue(this, 'ProjectionQueue', {
      queueName: 'mcat-dev-projection.fifo',
      fifo: true,
      contentBasedDeduplication: false,
      deduplicationScope: sqs.DeduplicationScope.MESSAGE_GROUP,
      fifoThroughputLimit: sqs.FifoThroughputLimit.PER_MESSAGE_GROUP_ID,
      encryption: sqs.QueueEncryption.KMS,
      encryptionMasterKey: appKey,
      enforceSSL: true,
      retentionPeriod: Duration.days(4),
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: { queue: projectionDlq, maxReceiveCount: 5 },
    });

    const asyncQueues = {} as Record<AsyncQueueDomain, sqs.IQueue>;
    const asyncDlqs = {} as Record<AsyncQueueDomain, sqs.IQueue>;
    for (const domain of ASYNC_QUEUE_DOMAINS) {
      const pair = createStandardQueuePair(this, domain, appKey);
      asyncQueues[domain] = pair.queue;
      asyncDlqs[domain] = pair.dlq;
    }

    Validations.of(auditLogs).acknowledge({
      id: 'AwsSolutions-S1',
      reason:
        'This bucket is the dedicated encrypted server-access-log sink; recursive access logging would create an unbounded logging loop.',
    });
    for (const secret of [dbSecret, learnerApiDbSecret, workersDbSecret, rateLimitPepperSecret]) {
      Validations.of(secret).acknowledge({
        id: 'AwsSolutions-SMG4',
        reason:
          'Automatic rotation is deferred until the migration-safe three-principal rotation workflow is exercised in development; generated credentials remain encrypted and are never exposed to browsers.',
      });
    }
    Validations.of(cluster).acknowledge({
      id: 'AwsSolutions-RDS10',
      reason:
        'Deletion protection is intentionally disabled only in the isolated development account; the cluster still snapshots on replacement and deletion.',
    });
    acknowledgeCdkNagFinding(
      migrationFunction,
      'AwsSolutions-L1',
      'The function uses the current project-standard Node.js 22 managed runtime.',
    );
    acknowledgeCdkNagFinding(
      migrationFunction,
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole]',
      'The CDK-managed Lambda role uses the AWS basic execution policy only for writes to the function-owned log group.',
    );
    acknowledgeCdkNagFinding(
      migrationFunction,
      'AwsSolutions-IAM4[Policy::arn:<AWS::Partition>:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole]',
      'The CDK-managed Lambda VPC policy provides only the ENI lifecycle permissions required for isolated-subnet execution.',
    );
    acknowledgeCdkNagFinding(
      migrationFunction,
      'AwsSolutions-IAM5[Resource::*]',
      'AWS X-Ray and EC2 network-interface lifecycle actions require wildcard resources; all secret and KMS grants remain resource-scoped.',
    );

    this.resources = {
      cluster,
      proxy,
      dbSecret,
      learnerApiDbSecret,
      workersDbSecret,
      rateLimitPepperSecret,
      migrationFunction,
      buckets,
      projectionQueue,
      projectionDlq,
      asyncQueues,
      asyncDlqs,
      databaseSecurityGroup,
      proxySecurityGroup,
    };
  }
}

function createDatabasePrincipalSecret(
  scope: Construct,
  id: string,
  secretName: string,
  username: string,
  description: string,
  encryptionKey: FoundationResources['appKey'],
): secretsmanager.Secret {
  const secret = new secretsmanager.Secret(scope, id, {
    secretName,
    description,
    encryptionKey,
    generateSecretString: {
      secretStringTemplate: JSON.stringify({ username }),
      generateStringKey: 'password',
      excludeCharacters: ' %+~`#$&*()|[]{}:;<>?!\'"\\/@',
      passwordLength: 40,
    },
  });
  secret.applyRemovalPolicy(RemovalPolicy.RETAIN);
  return secret;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function createBucket(scope: Construct, id: string, options: BucketOptions): s3.Bucket {
  const usesCustomerKey = options.encryptionKey !== undefined;
  return new s3.Bucket(scope, id, {
    bucketName: options.name,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    bucketKeyEnabled: usesCustomerKey,
    encryption: usesCustomerKey ? s3.BucketEncryption.KMS : s3.BucketEncryption.S3_MANAGED,
    ...(options.encryptionKey === undefined ? {} : { encryptionKey: options.encryptionKey }),
    enforceSSL: true,
    minimumTLSVersion: 1.2,
    objectOwnership: options.objectOwnership ?? s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
    publicReadAccess: false,
    removalPolicy: RemovalPolicy.RETAIN,
    serverAccessLogsBucket: options.serverAccessLogsBucket,
    serverAccessLogsPrefix:
      options.serverAccessLogsBucket === undefined ? undefined : `${options.name}/`,
    versioned: true,
    lifecycleRules: [
      {
        abortIncompleteMultipartUploadAfter: Duration.days(7),
        enabled: true,
        noncurrentVersionExpiration: Duration.days(options.noncurrentVersionDays),
        ...(options.expirationDays === undefined
          ? {}
          : { expiration: Duration.days(options.expirationDays) }),
      },
    ],
  });
}

function createStandardQueuePair(
  scope: Construct,
  domain: AsyncQueueDomain,
  encryptionKey: FoundationResources['appKey'],
): QueuePair {
  const constructPrefix = domain.charAt(0).toUpperCase() + domain.slice(1);
  const dlq = new sqs.Queue(scope, `${constructPrefix}Dlq`, {
    queueName: `mcat-dev-${domain}-dlq`,
    encryption: sqs.QueueEncryption.KMS,
    encryptionMasterKey: encryptionKey,
    enforceSSL: true,
    retentionPeriod: Duration.days(14),
  });
  const queue = new sqs.Queue(scope, `${constructPrefix}Queue`, {
    queueName: `mcat-dev-${domain}`,
    encryption: sqs.QueueEncryption.KMS,
    encryptionMasterKey: encryptionKey,
    enforceSSL: true,
    retentionPeriod: Duration.days(4),
    visibilityTimeout: Duration.minutes(5),
    deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
  });
  return { queue, dlq };
}
