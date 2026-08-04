/**
 * `@mcat/practice-test-runner` — the deployable core of the periodic scored
 * practice test: the server-side bank (holds the protected answer key), the pure
 * fixed-form engine, and the completion builder that turns a finished sitting
 * into the scored result the authority persists.
 *
 * The diagnostic's fixed-form sibling: it reuses `@mcat/diagnostic-runner`'s
 * session store + one-use-block-token primitives outright and drops adaptivity,
 * but keeps CARS. Node-only, and never imported by the browser bundle — enforced
 * by the architecture boundary tests. It is imported by the dev/preview Vite
 * middleware and the deployed learner-API, each supplying its own session store.
 */
export {
  createPracticeTestBank,
  practiceTestBankSourceLine,
  practiceTestCorpusFromRows,
  PracticeTestBank,
  PRACTICE_TEST_SECTION_ORDER,
  resolvePracticeTestBank,
  type PracticeTestBankResolution,
  type PracticeTestBankSource,
  type PracticeTestBankSourceRow,
  type PracticeTestBankStats,
  type PracticeTestClassification,
  type PracticeTestGrade,
  type PracticeTestItemView,
} from './bank';

export {
  bankSupportsPracticeTest,
  recordPracticeTestBlock,
  resolvePracticeTestBlock,
  validateServedForm,
  type PracticeTestBlockView,
  type PracticeTestFinalize,
  type PracticeTestFreshness,
  type PracticeTestResultView,
} from './engine';

export {
  buildPracticeTestCompletion,
  type PracticeTestAttemptPayload,
  type PracticeTestCompletionInput,
  type PracticeTestCompletionResult,
} from './completion';
