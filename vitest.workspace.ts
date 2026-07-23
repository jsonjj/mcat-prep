import { defineWorkspace } from 'vitest/config';

// Node-environment library + service packages, plus the architecture test suite.
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: [
        'packages/contracts/**/*.test.ts',
        'packages/domain/**/*.test.ts',
        'packages/policies/**/*.test.ts',
        'packages/content/**/*.test.ts',
        'packages/authority-core/**/*.test.ts',
        'packages/client-core/**/*.test.ts',
        'packages/ai-gateway/**/*.test.ts',
        'packages/learner-core/**/*.test.ts',
        'packages/scene-core/**/*.test.ts',
        'packages/analytics-events/**/*.test.ts',
        'packages/ai-speech-contracts/**/*.test.ts',
        'packages/test-fixtures/**/*.test.ts',
        'apps/landing-web/server/**/*.test.ts',
        'services/**/*.test.ts',
        'database/**/*.test.ts',
        'infra/cdk/**/*.test.ts',
        'tools/**/*.test.ts',
      ],
    },
  },
  {
    test: {
      name: 'architecture',
      environment: 'node',
      include: ['tests/architecture/**/*.test.ts'],
    },
  },
]);
