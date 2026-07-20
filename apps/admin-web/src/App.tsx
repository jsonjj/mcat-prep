import { useMemo } from 'react';
import { loadSyntheticBank } from '@mcat/content';
import { CLUSTER_INFO, SKILL_CLUSTERS } from '@mcat/contracts';
import { Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';

export function App() {
  const bank = useMemo(() => loadSyntheticBank(), []);
  const { manifest, questions } = bank;

  return (
    <div className="mc-admin">
      <header className="mc-admin__header">
        <div className="mc-brand">
          <span className="mc-brand__mark" aria-hidden="true" />
          <span className="mc-brand__name">Content Admin</span>
        </div>
        <span className="mc-pill">Release: {manifest.contentRelease}</span>
      </header>

      <main id="main" className="mc-admin__main">
        <Stack gap={5}>
          <div>
            <h1 className="mc-h1">Question bank</h1>
            <p className="mc-muted">
              Reviewer view. Answer keys and rationales are server-only and are never shown here or
              shipped to learners.
            </p>
          </div>

          <Callout tone="warning" title="This is a synthetic development bank">
            All {manifest.counts.testOnly} items are <code>test_only</code> and are rejected by
            production publication. The production bank starts empty; publishing connects in the AWS
            phase.
          </Callout>

          <div className="mc-admin__stats">
            <Stat label="Questions" value={manifest.counts.questions} />
            <Stat label="Stimuli" value={manifest.counts.stimuli} />
            <Stat label="Test-only" value={manifest.counts.testOnly} />
            <Stat label="Clusters covered" value={Object.keys(manifest.familiesByCluster).length} />
          </div>

          <section>
            <h2 className="mc-h2">Coverage by cluster</h2>
            <div className="mc-admin__coverage">
              {SKILL_CLUSTERS.map((c) => {
                const families = manifest.familiesByCluster[c] ?? 0;
                return (
                  <div key={c} className={`mc-cov ${families > 0 ? 'mc-cov--has' : ''}`}>
                    <span className="mc-cov__id">{c}</span>
                    <span className="mc-cov__title">{CLUSTER_INFO[c].title}</span>
                    <span className="mc-cov__n">{families} families</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mc-h2">Content library</h2>
            <Stack gap={2}>
              {questions.map((q) => (
                <Card key={q.id} elevated>
                  <div className="mc-item">
                    <div>
                      <Eyebrow>
                        {q.skill_cluster} · {q.format} · d{q.difficulty}
                      </Eyebrow>
                      <p className="mc-item__id">{q.id}</p>
                      <p className="mc-muted mc-fineprint">{q.learning_objective}</p>
                    </div>
                    <div className="mc-item__flags">
                      <span className="mc-pill">{q.status}</span>
                      {q.delivery.protected ? <span className="mc-pill">protected</span> : null}
                      {q.delivery.mastery_eligible ? <span className="mc-pill mc-pill--ok">mastery</span> : null}
                      <span className="mc-pill" title="Answer key hidden">
                        key: server-only
                      </span>
                    </div>
                  </div>
                </Card>
              ))}
            </Stack>
          </section>

          <Callout tone="info" title="Coming with AWS authority (Phase 4)">
            Import wizard (CSV / JSON / JSONL), row-and-field validation reports, independent review
            queues, dry-run diffs, two-person atomic publication, correction/retirement/restoration,
            and affected-evidence recomputation.
          </Callout>
        </Stack>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mc-stat">
      <span className="mc-stat__value">{value}</span>
      <span className="mc-stat__label">{label}</span>
    </div>
  );
}
