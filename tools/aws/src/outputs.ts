import { runChecked, type CommandRunner } from './command';
import { EXPECTED_PROFILE, EXPECTED_REGION } from './preflight';

const STABLE_STACK_STATUSES = new Set(['CREATE_COMPLETE', 'UPDATE_COMPLETE', 'IMPORT_COMPLETE']);

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

export function parseStackOutputs(
  json: string,
  expectedStackName: string,
  requiredOutputKeys: readonly string[],
): Readonly<Record<string, string>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('CloudFormation describe-stacks returned invalid JSON');
  }
  const root = object(parsed, 'CloudFormation response');
  if (!Array.isArray(root.Stacks) || root.Stacks.length !== 1) {
    throw new Error(`CloudFormation response must contain exactly ${expectedStackName}`);
  }
  const stack = object(root.Stacks[0], 'CloudFormation stack');
  if (stack.StackName !== expectedStackName) {
    throw new Error(`CloudFormation response must contain exactly ${expectedStackName}`);
  }
  if (typeof stack.StackStatus !== 'string' || !STABLE_STACK_STATUSES.has(stack.StackStatus)) {
    throw new Error(`${expectedStackName} must be in a stable complete state`);
  }
  const outputs = Array.isArray(stack.Outputs) ? stack.Outputs : [];
  const values = new Map<string, string>();
  for (const [index, value] of outputs.entries()) {
    const output = object(value, `CloudFormation output ${index}`);
    if (typeof output.OutputKey === 'string' && typeof output.OutputValue === 'string') {
      values.set(output.OutputKey, output.OutputValue);
    }
  }
  return Object.fromEntries(
    requiredOutputKeys.map((key) => {
      const value = values.get(key);
      if (value === undefined || value.length === 0) {
        throw new Error(`${expectedStackName} is missing required output ${key}`);
      }
      return [key, value];
    }),
  );
}

export async function readStackOutputs(
  runner: CommandRunner,
  stackName: string,
  requiredOutputKeys: readonly string[],
): Promise<Readonly<Record<string, string>>> {
  if (!/^mcat-dev-[a-z0-9-]+$/.test(stackName)) {
    throw new Error('Only exact mcat-dev physical stack names may be inspected');
  }
  const json = await runChecked(runner, {
    command: 'aws',
    args: [
      '--profile',
      EXPECTED_PROFILE,
      '--region',
      EXPECTED_REGION,
      'cloudformation',
      'describe-stacks',
      '--stack-name',
      stackName,
      '--output',
      'json',
    ],
  });
  return parseStackOutputs(json, stackName, requiredOutputKeys);
}
