import { fileURLToPath } from 'node:url';

import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  aws_ec2 as ec2,
  aws_kms as kms,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { applySandboxPermissionsBoundary } from './permissions-boundary.js';
import { applyRequiredTags } from './tags.js';

/**
 * Standalone, one-shot CONTENT SEED stack. It is intentionally NOT part of the
 * reviewed workload app in `bin/mcat.ts` — it is synthesized from its own
 * entrypoint (`bin/seed.ts`) so it never widens that deployment allowlist and,
 * critically, so editing/synthesizing it cannot disturb a concurrent
 * `cdk deploy McatDev*` (it shares no construct graph and performs no synth-time
 * context lookups).
 *
 * It provisions a single in-VPC Lambda that mirrors the migration Lambda: placed
 * in the SAME isolated subnets and REUSING the existing `mcat-dev-migration`
 * security group (which already egresses to the RDS Proxy on 5432 and to the
 * Secrets Manager interface endpoint on 443), so no security-group rules are
 * added to any existing stack. The bundled corpus is upserted into Aurora through
 * the proxy using the Aurora admin credentials from Secrets Manager.
 *
 * Every existing resource is referenced by EXPLICIT id/ARN (passed as CDK
 * context) rather than by `fromLookup`, so synthesis writes no `cdk.context.json`
 * and races nothing.
 */

const DEFAULT_SEED_ENTRY = fileURLToPath(
  new URL('../../../services/lambdas/seed/src/lambda.ts', import.meta.url),
);
const DEFAULT_CORPUS_DIR = fileURLToPath(
  new URL('../../../content/question-bank/.local/seed-bundle/', import.meta.url),
);

export interface SeedStackProps extends StackProps {
  readonly account: string;
  readonly vpcId: string;
  readonly availabilityZones: readonly string[];
  readonly isolatedSubnetIds: readonly string[];
  readonly migrationSecurityGroupId: string;
  readonly adminSecretArn: string;
  readonly appKeyArn: string;
  readonly proxyEndpoint: string;
  readonly databaseName: string;
  readonly corpusDir?: string;
  readonly seedEntry?: string;
}

export class SeedStack extends Stack {
  public constructor(scope: Construct, id: string, props: SeedStackProps) {
    super(scope, id, props);

    applySandboxPermissionsBoundary(this);
    applyRequiredTags(this, 'restricted');

    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: props.vpcId,
      availabilityZones: [...props.availabilityZones],
      isolatedSubnetIds: [...props.isolatedSubnetIds],
    });
    const securityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'MigrationSecurityGroup',
      props.migrationSecurityGroupId,
      { mutable: false },
    );
    const appKey = kms.Key.fromKeyArn(this, 'ApplicationKey', props.appKeyArn);
    const adminSecret = secretsmanager.Secret.fromSecretCompleteArn(
      this,
      'AdminSecret',
      props.adminSecretArn,
    );

    const seedLogGroup = new logs.LogGroup(this, 'SeedLogGroup', {
      logGroupName: '/aws/lambda/mcat-dev-content-seed',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const corpusDir = props.corpusDir ?? DEFAULT_CORPUS_DIR;
    const seedFunction = new nodejs.NodejsFunction(this, 'SeedFunction', {
      functionName: 'mcat-dev-content-seed',
      description:
        'One-shot in-VPC content seeder: upserts the bundled question + passage corpus into Aurora via the RDS Proxy.',
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      entry: props.seedEntry ?? DEFAULT_SEED_ENTRY,
      handler: 'handler',
      logGroup: seedLogGroup,
      memorySize: 1024,
      timeout: Duration.minutes(10),
      reservedConcurrentExecutions: 1,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [securityGroup],
      environment: {
        AWS_ACCOUNT_ID: props.account,
        ADMIN_DB_SECRET_ID: props.adminSecretArn,
        DB_PROXY_ENDPOINT: props.proxyEndpoint,
        DB_NAME: props.databaseName,
        CORPUS_DIR: '/var/task/corpus',
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
            `cp -R ${shellQuote(corpusDir)} ${shellQuote(`${outputDir}/corpus`)}`,
          ],
        },
      },
    });

    adminSecret.grantRead(seedFunction);
    appKey.grantDecrypt(seedFunction);

    new CfnOutput(this, 'SeedFunctionArn', {
      value: seedFunction.functionArn,
      description: 'ARN of the one-shot content seed Lambda. Invoke with {"operation":"seed"}.',
    });
    new CfnOutput(this, 'SeedFunctionName', {
      value: seedFunction.functionName,
      description: 'Name of the one-shot content seed Lambda.',
    });
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
