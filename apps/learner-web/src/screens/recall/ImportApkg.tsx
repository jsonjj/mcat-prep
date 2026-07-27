import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { useQueryClient } from '@tanstack/react-query';
import { useRecallService } from '../../app/recall-queries';
import {
  ApkgUnsupportedError,
  type ImportSummary,
  type PreparedImport,
} from '../../recall/adapters/apkg-importer';

type Phase = 'idle' | 'parsing' | 'preview' | 'importing' | 'done' | 'error';

export function ImportApkg() {
  const service = useRecallService();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [prepared, setPrepared] = useState<PreparedImport | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file || !service) return;
    setPhase('parsing');
    setError(null);
    try {
      const result = await service.parseImport(file);
      setPrepared(result);
      setPhase('preview');
    } catch (e) {
      setError(
        e instanceof ApkgUnsupportedError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'That file could not be read as an Anki deck.',
      );
      setPhase('error');
    }
  };

  const onConfirm = async () => {
    if (!service || !prepared) return;
    setPhase('importing');
    try {
      const result = await service.commitImport(prepared);
      setSummary(result);
      setPrepared(null);
      await qc.invalidateQueries({ queryKey: ['recall'] });
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import could not be completed.');
      setPhase('error');
    }
  };

  const reset = () => {
    setPhase('idle');
    setPrepared(null);
    setSummary(null);
    setError(null);
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Import an Anki deck</h1>
        <p className="mc-muted">
          Upload an <code>.apkg</code> file. Cards start fresh on our schedule; deck names become tags.
        </p>
      </header>

      {phase === 'idle' || phase === 'parsing' ? (
        <Card elevated>
          <Stack gap={4}>
            <label className="mc-recall__drop">
              <input
                type="file"
                accept=".apkg,application/zip"
                className="mc-visually-hidden"
                disabled={phase === 'parsing'}
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
              <span className="mc-recall__drop-label">
                {phase === 'parsing' ? 'Reading deck…' : 'Choose an .apkg file'}
              </span>
            </label>
            <p className="mc-fineprint mc-muted">
              Exported from Anki with “Support older Anki versions” checked. Images and audio are
              supported.
            </p>
          </Stack>
        </Card>
      ) : null}

      {phase === 'preview' && prepared ? (
        <Card elevated>
          <Stack gap={4}>
            <Eyebrow>Preview</Eyebrow>
            <div className="mc-recall__stats">
              <Stat label="Cards" value={prepared.counts.cards} />
              <Stat label="Notes" value={prepared.counts.notes} />
              <Stat label="Images" value={prepared.counts.images} />
              <Stat label="Audio" value={prepared.counts.audio} />
            </div>
            {prepared.counts.skipped > 0 ? (
              <Callout tone="warning">
                {prepared.counts.skipped} card(s) were skipped (unknown note type).
              </Callout>
            ) : null}
            {prepared.warnings.length > 0 ? (
              <Callout tone="warning" title="Some media was missing">
                <ul>
                  {prepared.warnings.slice(0, 5).map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Callout>
            ) : null}
            <div className="mc-recall__actions">
              <Button variant="primary" size="lg" onClick={() => void onConfirm()}>
                Add {prepared.counts.cards} cards
              </Button>
              <button type="button" className="mc-textbtn" onClick={reset}>
                Cancel
              </button>
            </div>
          </Stack>
        </Card>
      ) : null}

      {phase === 'importing' ? (
        <Card elevated>
          <p className="mc-muted">Adding your cards…</p>
        </Card>
      ) : null}

      {phase === 'done' && summary ? (
        <Card elevated>
          <Stack gap={3}>
            <Eyebrow>Imported</Eyebrow>
            <p>
              Added <strong>{summary.cards}</strong> cards and <strong>{summary.media}</strong> media
              files.
            </p>
            <div className="mc-recall__actions">
              <Link to="/app/recall" className="mc-button mc-button--primary mc-button--lg">
                <span className="mc-button__label">Back to Recall</span>
              </Link>
              <button type="button" className="mc-textbtn" onClick={reset}>
                Import another
              </button>
            </div>
          </Stack>
        </Card>
      ) : null}

      {phase === 'error' ? (
        <Card elevated>
          <Stack gap={3}>
            <Callout tone="warning" title="Couldn’t import that file">
              {error}
            </Callout>
            <button type="button" className="mc-textbtn" onClick={reset}>
              Try another file
            </button>
          </Stack>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="mc-recall__stat">
      <span className="mc-recall__stat-value">{value}</span>
      <span className="mc-recall__stat-label">{label}</span>
    </div>
  );
}
