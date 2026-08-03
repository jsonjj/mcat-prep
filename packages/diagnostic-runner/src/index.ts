/**
 * `@mcat/diagnostic-runner` — the deployable core of the placement diagnostic:
 * the server-side bank (holds the protected answer key), the pure multistage
 * engine, the session state + one-use-block-token integrity primitives, and the
 * serving seam that keeps the browser wire identical across every environment.
 *
 * Node-only, and never imported by the browser bundle — enforced by the
 * architecture boundary tests. It is imported by the dev/preview Vite
 * middleware, the local full-engine authority, and the deployed learner-API.
 */
export {
  DiagnosticBank,
  diagnosticItemsFromRows,
  loadDiagnosticBankItems,
  loadPulledBank,
  resolveDiagnosticBankItems,
  diagnosticBankSourceLine,
  type DiagnosticBankResult,
  type DiagnosticBankScope,
  type DiagnosticBankSource,
  type DiagnosticBankSourceDeps,
  type DiagnosticItemView,
  type DiagnosticSourceRow,
  type RecallGrade,
} from './bank';

export {
  bankSupportsProductionForm,
  deriveState,
  recordBlock,
  resolveBlock,
  REPORTED_PRIORITY_COUNT,
  type ClusterSignalView,
  type DiagnosticBlockView,
  type DiagnosticResultView,
  type PriorityView,
} from './engine';

export {
  consumePendingBlock,
  DiagnosticSessionError,
  DiagnosticSessionStore,
  hashToken,
  issuePendingBlock,
  newOpaqueToken,
  type PendingBlock,
  type ScoredResponse,
  type SessionRecord,
} from './session-store';

export {
  InMemoryDiagnosticSessions,
  parseAnswers,
  parseElapsed,
  renderBlock,
  serveDiagnosticBlock,
  serveDiagnosticNext,
  type DiagnosticBlockResponse,
  type DiagnosticSessionStore as DiagnosticSessionStorePort,
} from './serve';
