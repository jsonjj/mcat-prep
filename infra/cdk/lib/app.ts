import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import {
  assertCdkTarget,
  getEnvironment,
  type CdkTargetEnvironment,
} from '../config/environments.js';
import { DataStack } from './data-stack.js';
import { FoundationStack } from './foundation-stack.js';

export interface CreateMcatAppOptions {
  readonly stage: string;
  readonly target: CdkTargetEnvironment;
}

export function createMcatApp(options: CreateMcatAppOptions): App {
  const environment = getEnvironment(options.stage);
  assertCdkTarget(environment, options.target);

  const app = new App();
  Validations.of(app).addPlugins(
    new AwsSolutionsChecks(app, {
      verbose: true,
      writeSuppressionsToCloudFormation: true,
    }),
  );

  const env = { account: environment.account, region: environment.region };
  const foundation = new FoundationStack(app, 'McatDevFoundation', {
    stackName: 'mcat-dev-foundation',
    description: 'MCAT Mastery development network, encryption, and budget foundation.',
    env,
    environment,
    terminationProtection: true,
  });
  const data = new DataStack(app, 'McatDevData', {
    stackName: 'mcat-dev-data',
    description: 'MCAT Mastery development relational, object, and queue data plane.',
    env,
    environment,
    foundation: foundation.resources,
    terminationProtection: true,
  });
  data.addDependency(foundation);

  return app;
}
