import { useState } from 'react';
import { Button, Callout, Inline } from '@mcat/ui-web';
import {
  REWRITE_MODE_LABELS,
  canStepByStep,
  type GroundedRationale,
  type RewriteMode,
  type StepByStepGate,
} from '@mcat/ai-gateway';
import { requestRewrite, type RewriteResult } from '../app/explain-another-way';

/**
 * "Explain it another way" (WS4 / §5). Rendered ONLY below an already-shown,
 * vetted explanation (Practice reveal, Study reveal, Mistakes card). It
 * re-expresses that same explanation — multiple representations, worked-example
 * segmenting — and never introduces new facts: grounding is enforced on the
 * route and re-checked in `requestRewrite`.
 *
 * "Example / another way" is always offered. "Step by step" is gated to the
 * places a worked walk pays off (QUANTIFY / C-P / DOK ≥ 2), all learner-safe.
 */
interface Props {
  readonly questionId: string;
  readonly source: GroundedRationale;
  readonly gate: StepByStepGate;
}

export function ExplainAnotherWay({ questionId, source, gate }: Props) {
  const [activeMode, setActiveMode] = useState<RewriteMode | null>(null);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const stepsAllowed = canStepByStep(gate);

  const run = (mode: RewriteMode): void => {
    setActiveMode(mode);
    setResult(null);
    setLoading(true);
    void requestRewrite({ questionId, mode, source, gate })
      .then((rewrite) => setResult(rewrite))
      .finally(() => setLoading(false));
  };

  const paragraphs = result === null ? [] : result.text.split(/\n+/).filter((line) => line.trim().length > 0);

  return (
    <div className="mc-explain">
      <p className="mc-explain__prompt mc-muted mc-fineprint">Didn’t click? See it another way:</p>
      <Inline gap={2}>
        <Button
          variant="secondary"
          loading={loading && activeMode === 'example'}
          aria-pressed={activeMode === 'example'}
          onClick={() => run('example')}
        >
          Example / another way
        </Button>
        {stepsAllowed ? (
          <Button
            variant="secondary"
            loading={loading && activeMode === 'steps'}
            aria-pressed={activeMode === 'steps'}
            onClick={() => run('steps')}
          >
            Step by step
          </Button>
        ) : null}
      </Inline>
      {result !== null && activeMode !== null ? (
        result.fallback ? (
          // The model rewrite was unavailable (provider offline/over-budget) or its
          // output failed the grounding check. Rather than re-print the same explanation
          // under an "another way" heading — which reads as a bug — say so plainly. The
          // vetted explanation above still stands.
          <Callout tone="info" title="A fresh re-explanation isn’t available right now">
            <p className="mc-explain__body mc-muted">
              The AI re-explainer is momentarily unavailable — the explanation above still stands.
              Try again in a moment.
            </p>
          </Callout>
        ) : (
          <Callout tone="info" title={REWRITE_MODE_LABELS[activeMode]}>
            <div className="mc-explain__body">
              {paragraphs.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
            <p className="mc-explain__ainote mc-muted mc-fineprint">
              AI-generated re-explanation — double-check it against the official explanation above.
            </p>
          </Callout>
        )
      ) : null}
    </div>
  );
}
