export type DeploymentStage = 'dev' | 'staging' | 'production';

export interface EnvironmentConfig {
  readonly stage: DeploymentStage;
  readonly account: string;
  readonly region: string;
  readonly deployable: true;
  readonly budgetUsd: number;
  readonly budgetEmail: string;
}

export interface CdkTargetEnvironment {
  readonly [name: string]: string | undefined;
  readonly CDK_DEFAULT_ACCOUNT?: string;
  readonly CDK_DEFAULT_REGION?: string;
}

const DEVELOPMENT_ENVIRONMENT = {
  stage: 'dev',
  account: '056956104102',
  region: 'us-east-1',
  deployable: true,
  budgetUsd: 100,
  budgetEmail: 'jonathan.thomas@alphaaiengineering.com',
} as const satisfies EnvironmentConfig;

export class EnvironmentNotProvisionedError extends Error {
  public constructor(stage: Exclude<DeploymentStage, 'dev'>) {
    super(`${stage} environment is not provisioned`);
    this.name = 'EnvironmentNotProvisionedError';
  }
}

export function getEnvironment(stage: string): EnvironmentConfig {
  switch (stage) {
    case 'dev':
      return DEVELOPMENT_ENVIRONMENT;
    case 'staging':
    case 'production':
      throw new EnvironmentNotProvisionedError(stage);
    default:
      throw new Error(`Unsupported deployment stage: ${stage}`);
  }
}

export function assertCdkTarget(
  config: EnvironmentConfig,
  environment: CdkTargetEnvironment,
): void {
  const account = environment.CDK_DEFAULT_ACCOUNT;
  const region = environment.CDK_DEFAULT_REGION;

  if (account === undefined || account.length === 0) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required before synthesis');
  }

  if (region === undefined || region.length === 0) {
    throw new Error('CDK_DEFAULT_REGION is required before synthesis');
  }

  if (account !== config.account) {
    throw new Error(`AWS account mismatch: expected ${config.account}, received ${account}`);
  }

  if (region !== config.region) {
    throw new Error(`AWS region mismatch: expected ${config.region}, received ${region}`);
  }
}
