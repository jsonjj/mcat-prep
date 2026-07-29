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
    void requestRewrite({ questionId, mode, source })
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
        <Callout tone="info" title={REWRITE_MODE_LABELS[activeMode]}>
          <div className="mc-explain__body">
            {paragraphs.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        </Callout>
      ) : null}
    </div>
  );
}
