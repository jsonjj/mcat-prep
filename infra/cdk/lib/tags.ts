import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

const REQUIRED_TAGS = {
  Application: 'mcat-mastery',
  Environment: 'dev',
  ManagedBy: 'cdk',
  Owner: 'jonathan-thomas',
} as const;

export function applyRequiredTags(scope: IConstruct, classification: string): void {
  const normalizedClassification = classification.trim();
  if (normalizedClassification.length === 0) {
    throw new Error('Data classification is required');
  }

  const tags = Tags.of(scope);
  for (const [key, value] of Object.entries(REQUIRED_TAGS)) {
    tags.add(key, value);
  }
  tags.add('DataClassification', normalizedClassification);
}
