import type {
  aws_ec2 as ec2,
  aws_kms as kms,
  aws_rds as rds,
  aws_s3 as s3,
  aws_secretsmanager as secretsmanager,
  aws_sqs as sqs,
} from 'aws-cdk-lib';

export interface FoundationResources {
  readonly vpc: ec2.IVpc;
  readonly appKey: kms.IKey;
  readonly auditKey: kms.IKey;
  readonly budgetName: string;
}

export interface DataBuckets {
  readonly sourceQuarantine: s3.IBucket;
  readonly protectedContent: s3.IBucket;
  readonly authorizedDelivery: s3.IBucket;
  readonly exports: s3.IBucket;
  readonly publicAssets: s3.IBucket;
  readonly analytics: s3.IBucket;
  readonly auditLogs: s3.IBucket;
}

export type AsyncQueueDomain = 'analytics' | 'publication' | 'privacy' | 'notifications';

export type AsyncQueues = Readonly<Record<AsyncQueueDomain, sqs.IQueue>>;

export interface DataResources {
  readonly cluster: rds.IDatabaseCluster;
  readonly proxy: rds.IDatabaseProxy;
  readonly dbSecret: secretsmanager.ISecret;
  readonly buckets: DataBuckets;
  readonly projectionQueue: sqs.IQueue;
  readonly projectionDlq: sqs.IQueue;
  readonly asyncQueues: AsyncQueues;
  readonly asyncDlqs: AsyncQueues;
}
