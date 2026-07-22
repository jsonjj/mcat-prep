import {
  Duration,
  RemovalPolicy,
  Stack,
  Validations,
  type StackProps,
  aws_ec2 as ec2,
  aws_kms as kms,
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

export interface DataStackProps extends StackProps {
  readonly environment: EnvironmentConfig;
  readonly foundation: FoundationResources;
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
      secrets: [dbSecret],
      securityGroups: [proxySecurityGroup],
      vpc: props.foundation.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
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
    Validations.of(dbSecret).acknowledge({
      id: 'AwsSolutions-SMG4',
      reason:
        'Automatic secret rotation is deferred until the private Secrets Manager endpoint and migration-safe credential rotation workflow are installed with the API stack.',
    });
    Validations.of(cluster).acknowledge({
      id: 'AwsSolutions-RDS10',
      reason:
        'Deletion protection is intentionally disabled only in the isolated development account; the cluster still snapshots on replacement and deletion.',
    });

    this.resources = {
      cluster,
      proxy,
      dbSecret,
      buckets,
      projectionQueue,
      projectionDlq,
      asyncQueues,
      asyncDlqs,
    };
  }
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
