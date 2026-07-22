import { describe, expect, it } from 'vitest';

import { parseStackOutputs } from './outputs';

describe('CloudFormation output boundary', () => {
  it('accepts only the requested physical stack and required outputs', () => {
    expect(
      parseStackOutputs(
        JSON.stringify({
          Stacks: [
            {
              StackName: 'mcat-dev-web',
              StackStatus: 'CREATE_COMPLETE',
              Outputs: [
                { OutputKey: 'LearnerArtifactBucketName', OutputValue: 'learner-bucket' },
                { OutputKey: 'LearnerDistributionId', OutputValue: 'E1234567890ABC' },
              ],
            },
          ],
        }),
        'mcat-dev-web',
        ['LearnerArtifactBucketName', 'LearnerDistributionId'],
      ),
    ).toEqual({
      LearnerArtifactBucketName: 'learner-bucket',
      LearnerDistributionId: 'E1234567890ABC',
    });
  });

  it('rejects missing outputs, the wrong stack, and non-complete state', () => {
    const stack = (name: string, status: string, outputs: unknown[] = []) =>
      JSON.stringify({ Stacks: [{ StackName: name, StackStatus: status, Outputs: outputs }] });
    expect(() => parseStackOutputs(stack('other', 'CREATE_COMPLETE'), 'mcat-dev-web', [])).toThrow(
      'exactly mcat-dev-web',
    );
    expect(() =>
      parseStackOutputs(stack('mcat-dev-web', 'UPDATE_IN_PROGRESS'), 'mcat-dev-web', []),
    ).toThrow('stable complete state');
    expect(() =>
      parseStackOutputs(stack('mcat-dev-web', 'UPDATE_COMPLETE'), 'mcat-dev-web', ['Required']),
    ).toThrow('Required');
  });
});
