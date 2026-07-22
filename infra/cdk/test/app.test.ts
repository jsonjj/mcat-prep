import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Stack } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import { createMcatApp } from '../lib/app.js';

describe('MCAT CDK application', () => {
  it('composes all development stacks in deployable dependency order', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const app = createMcatApp({
      stage: 'dev',
      target: {
        CDK_DEFAULT_ACCOUNT: '056956104102',
        CDK_DEFAULT_REGION: 'us-east-1',
      },
      learnerRuntimeEntry: path.join(repoRoot, 'services/lambdas/learner-api/src/lambda.ts'),
      workerRuntimeEntries: {
        outboxPublisher: {
          entry: path.join(repoRoot, 'services/lambdas/workers/src/lambda.ts'),
          handler: 'outboxHandler',
        },
        projectionConsumer: {
          entry: path.join(repoRoot, 'services/lambdas/workers/src/lambda.ts'),
          handler: 'projectionHandler',
        },
      },
    });
    const stacks = app.node.children.filter(Stack.isStack);

    expect(stacks.map((stack) => stack.node.id)).toEqual([
      'McatDevFoundation',
      'McatDevData',
      'McatDevWeb',
      'McatDevIdentity',
      'McatDevApi',
      'McatDevAsync',
      'McatDevPublication',
      'McatDevOperations',
      'McatDevAnalytics',
    ]);
    expect(stacks.map((stack) => stack.stackName)).toEqual([
      'mcat-dev-foundation',
      'mcat-dev-data',
      'mcat-dev-web',
      'mcat-dev-identity',
      'mcat-dev-api',
      'mcat-dev-async',
      'mcat-dev-publication',
      'mcat-dev-operations',
      'mcat-dev-analytics',
    ]);
    const assembly = app.synth();
    expect(JSON.stringify(assembly.manifest)).not.toContain('example.test');
  });
});
