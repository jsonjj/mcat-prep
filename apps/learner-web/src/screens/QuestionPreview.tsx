import { useMemo, useState } from 'react';
import { Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import { compileQuestion, importCandidates, type ImportedItem } from '@mcat/content';

/**
 * Dev-only author tool: render imported candidate items in the learner UI for
 * review. Gated to DEV so the raw JSONL (which carries keys) is never bundled into
 * a production build. Content is shown as unverified draft — never scored, never
 * counted toward mastery. The learner-safe payload is what students would see; the
 * key/rationale is revealed only behind an explicit "author review" toggle.
 */
const rawModules = import.meta.env.DEV
  ? (import.meta.glob('../../../../question-bank/*.jsonl', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>)
  : {};

export function QuestionPreview() {
  const { items, errors } = useMemo(() => {
    const sources = Object.entries(rawModules).map(([path, text]) => ({
      name: path.split('/').pop() ?? path,
      text,
    }));
    return importCandidates(sources);
  }, []);

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <Eyebrow>Author tools · dev only</Eyebrow>
        <h1 className="mc-h1">Question preview</h1>
      </header>

      <Callout tone="warning" title="Preview · unverified">
        Imported candidate items shown in the learner UI for review only. They are drafts — not
        reviewed, not scored, and never counted toward mastery. Answer keys stay out of the
        learner-safe payload.
      </Callout>

      {items.length === 0 ? (
        <Callout tone="info">
          No candidate files found. Add JSONL files under <code>mcat-prep/question-bank/</code> and
          reload (dev only).
        </Callout>
      ) : (
        <>
          <p className="mc-muted mc-fineprint">
            {items.length} imported · {errors.length} skipped
          </p>
          <Stack gap={3}>
            {items.map((item) => (
              <PreviewItem key={item.question.id} item={item} />
            ))}
          </Stack>
        </>
      )}

      {errors.length > 0 ? (
        <Callout tone="warning" title={`${errors.length} line(s) could not be imported`}>
          <ul className="mc-evidence">
            {errors.slice(0, 8).map((e, i) => (
              <li key={i}>
                <span>
                  {e.source}:{e.line}
                </span>
                <span className="mc-evidence__n">skipped</span>
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  );
}

function PreviewItem({ item }: { item: ImportedItem }) {
  const compiled = useMemo(() => compileQuestion(item.question), [item]);
  const [revealed, setRevealed] = useState(false);
  const q = compiled.safe;
  return (
    <Card elevated>
      <Stack gap={3}>
        <Eyebrow>
          {item.question.skill_cluster} · {q.format} · draft
        </Eyebrow>
        {item.stimulus ? (
          <Card className="mc-stimulus">
            <Stack gap={2}>
              {item.stimulus.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </Stack>
          </Card>
        ) : null}
        <p className="mc-h3">{q.stem}</p>
        <ul className="mc-preview__choices">
          {q.choices.map((c) => (
            <li key={c.id}>
              <span className="mc-choice__key">{c.id}</span>
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="mc-textbtn" onClick={() => setRevealed((v) => !v)}>
          {revealed ? 'Hide' : 'Show'} key &amp; rationale (author review)
        </button>
        {revealed ? (
          <Callout tone="info" title={`Answer: ${compiled.protected.correct_choice_id}`}>
            {compiled.protected.rationales.correct}
          </Callout>
        ) : null}
      </Stack>
    </Card>
  );
}
