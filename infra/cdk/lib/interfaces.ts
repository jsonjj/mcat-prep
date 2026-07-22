import type {
  aws_ec2 as ec2,
  aws_apigateway as apigateway,
  aws_cognito as cognito,
  aws_kms as kms,
  aws_lambda as lambda,
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
  readonly serviceEndpointSecurityGroup: ec2.ISecurityGroup;
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
  readonly learnerApiDbSecret: secretsmanager.ISecret;
  readonly workersDbSecret: secretsmanager.ISecret;
  readonly rateLimitPepperSecret: secretsmanager.ISecret;
  readonly migrationFunction: lambda.IFunction;
  readonly buckets: DataBuckets;
  readonly projectionQueue: sqs.IQueue;
  readonly projectionDlq: sqs.IQueue;
  readonly asyncQueues: AsyncQueues;
  readonly asyncDlqs: AsyncQueues;
  readonly databaseSecurityGroup: ec2.ISecurityGroup;
  readonly proxySecurityGroup: ec2.ISecurityGroup;
}

export interface IdentityResources {
  readonly learnerUserPool: cognito.IUserPool;
  readonly learnerClient: cognito.IUserPoolClient;
  readonly staffUserPool: cognito.IUserPool;
  readonly staffClient: cognito.IUserPoolClient;
}

export interface ApiResources {
  readonly restApi: apigateway.IRestApi;
  readonly learnerHandler: lambda.IFunction;
  readonly serviceEndpointSecurityGroup: ec2.ISecurityGroup;
  readonly apiUrl: string;
}

export interface AsyncResources {
  readonly outboxPublisher: lambda.IFunction;
  readonly projectionConsumer: lambda.IFunction;
}
