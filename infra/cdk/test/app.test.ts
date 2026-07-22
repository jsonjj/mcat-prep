import { Stack } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import { createMcatApp } from '../lib/app.js';

describe('MCAT CDK application', () => {
  it('composes foundation before data with stable stack IDs and names', () => {
    const app = createMcatApp({
      stage: 'dev',
      target: {
        CDK_DEFAULT_ACCOUNT: '056956104102',
        CDK_DEFAULT_REGION: 'us-east-1',
      },
    });
    const stacks = app.node.children.filter(Stack.isStack);

    expect(stacks.map((stack) => stack.node.id)).toEqual(['McatDevFoundation', 'McatDevData']);
    expect(stacks.map((stack) => stack.stackName)).toEqual([
      'mcat-dev-foundation',
      'mcat-dev-data',
    ]);
    expect(stacks[1]?.dependencies).toContain(stacks[0]);
  });
});
