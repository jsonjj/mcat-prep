import { fileURLToPath } from 'node:url';

import { App, Validations } from 'aws-cdk-lib';
import { AwsSolutionsChecks } from 'cdk-nag';

import {
  assertCdkTarget,
  getEnvironment,
  type CdkTargetEnvironment,
} from '../config/environments.js';
import { AnalyticsStack } from './analytics-stack.js';
import { ApiStack } from './api-stack.js';
import { AsyncStack, type WorkerRuntimeEntries } from './async-stack.js';
import { DataStack } from './data-stack.js';
import { FoundationStack } from './foundation-stack.js';
import { IdentityStack } from './identity-stack.js';
import { OperationsStack } from './operations-stack.js';
import { PublicationStack } from './publication-stack.js';
import { WebStack } from './web-stack.js';

export interface CreateMcatAppOptions {
  readonly stage: string;
  readonly target: CdkTargetEnvironment;
  readonly learnerRuntimeEntry: string;
  readonly workerRuntimeEntries: WorkerRuntimeEntries;
}

export const DEFAULT_RUNTIME_ENTRIES = {
  learner: fileURLToPath(
    new URL('../../../services/lambdas/learner-api/src/lambda.ts', import.meta.url),
  ),
  workers: {
    outboxPublisher: {
      entry: fileURLToPath(
        new URL('../../../services/lambdas/workers/src/lambda.ts', import.meta.url),
      ),
      handler: 'outboxHandler',
    },
    projectionConsumer: {
      entry: fileURLToPath(
        new URL('../../../services/lambdas/workers/src/lambda.ts', import.meta.url),
      ),
      handler: 'projectionHandler',
    },
  },
} as const;

export function createMcatApp(options: CreateMcatAppOptions): App {
  const environment = getEnvironment(options.stage);
  assertCdkTarget(environment, options.target);

  const app = new App();
  Validations.of(app).addPlugins(
    new AwsSolutionsChecks(app, {
      verbose: true,
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
  const web = new WebStack(app, 'McatDevWeb', {
    stackName: 'mcat-dev-web',
    description: 'MCAT Mastery development learner and staff private web delivery.',
    env,
    environment,
    terminationProtection: true,
  });
  web.addDependency(data);
  const api = new ApiStack(app, 'McatDevApi', {
    stackName: 'mcat-dev-api',
    description: 'MCAT Mastery development authoritative learner REST API.',
    env,
    environment,
    foundation: foundation.resources,
    data: data.resources,
    web: web.resources,
    learnerRuntimeEntry: options.learnerRuntimeEntry,
    terminationProtection: true,
  });
  api.addDependency(data);
  api.addDependency(web);
  const identity = new IdentityStack(app, 'McatDevIdentity', {
    stackName: 'mcat-dev-identity',
    description: 'MCAT Mastery development learner and staff identity boundary.',
    env,
    environment,
    webOrigins: {
      learner: api.resources.learnerOrigin,
      staff: api.resources.adminOrigin,
    },
    terminationProtection: true,
  });
  identity.addDependency(api);
  const async = new AsyncStack(app, 'McatDevAsync', {
    stackName: 'mcat-dev-async',
    description: 'MCAT Mastery development outbox and projection workers.',
    env,
    environment,
    foundation: foundation.resources,
    data: data.resources,
    runtimeEntries: options.workerRuntimeEntries,
    terminationProtection: true,
  });
  async.addDependency(identity);
  const publication = new PublicationStack(app, 'McatDevPublication', {
    stackName: 'mcat-dev-publication',
    description: 'MCAT Mastery development fail-closed content publication workflow.',
    env,
    environment,
    applicationKey: foundation.resources.appKey,
    sourceQuarantine: data.resources.buckets.sourceQuarantine,
    protectedContent: data.resources.buckets.protectedContent,
    authorizedDelivery: data.resources.buckets.authorizedDelivery,
    terminationProtection: true,
  });
  publication.addDependency(async);
  const operations = new OperationsStack(app, 'McatDevOperations', {
    stackName: 'mcat-dev-operations',
    description: 'MCAT Mastery development WAF, flow logs, dashboards, and actionable alarms.',
    env,
    environment,
    vpc: foundation.resources.vpc,
    auditKey: foundation.resources.auditKey,
    restApi: api.resources.restApi,
    functions: [
      api.resources.learnerHandler,
      async.resources.outboxPublisher,
      async.resources.projectionConsumer,
      data.resources.migrationFunction,
    ],
    cluster: data.resources.cluster,
    proxy: data.resources.proxy,
    dlqs: [data.resources.projectionDlq, ...Object.values(data.resources.asyncDlqs)],
    publicationStateMachine: publication.resources.stateMachine,
    distributions: [api.resources.learnerDistribution, api.resources.adminDistribution],
    budgetName: foundation.resources.budgetName,
    terminationProtection: true,
  });
  operations.addDependency(publication);
  const analytics = new AnalyticsStack(app, 'McatDevAnalytics', {
    stackName: 'mcat-dev-analytics',
    description: 'MCAT Mastery development governed first-party analytics lake.',
    env,
    environment,
    analyticsBucket: data.resources.buckets.analytics,
    auditKey: foundation.resources.auditKey,
    terminationProtection: true,
  });
  analytics.addDependency(operations);

  return app;
}
