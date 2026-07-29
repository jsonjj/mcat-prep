import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import {
  DUEL_DIFFICULTY_LABELS,
  DUEL_MODE_LABELS,
  HttpAiChat,
  MAX_ROUNDS,
  buildCarsSystemPrompt,
  buildDuelRubricPrompt,
  buildReflectionPrompt,
  parseDuelRubric,
  type AiMessage,
  type DuelDifficulty,
  type DuelMode,
  type DuelSide,
} from '@mcat/ai-gateway';
import type { CarsDuelSelectionView } from '@mcat/contracts';
import { useRecordCarsDuel } from '../app/queries';

/**
 * CARS Duel — an AI debate that sharpens critical analysis and reasoning.
 * No win/lose: it ends with constructive reflection. Contributes only contextual
 * CA1/CA2 evidence (an AI is in the loop, so it can never mint mastery).
 * The provider key stays server-side behind /api/ai/chat.
 */
const MODES: DuelMode[] = ['rebut', 'defend'];
const DIFFICULTIES: DuelDifficulty[] = ['warmup', 'standard', 'challenge'];
const SUGGESTED_TOPICS = [
  'Whether anonymous authorship strengthens or weakens a public argument',
  'Whether a community is better served by preserving monuments or reinventing them',
  'Whether difficult art should be judged by its intent or its effect',
];

type Phase = 'setup' | 'debating' | 'reflection';
type Shown = { role: 'user' | 'assistant'; content: string };

export function CarsDuel() {
  const navigate = useNavigate();
  const location = useLocation();
  // Today's Path launches the duel with the server-resolved selection + a return
  // target. The selection ({mode, topicId, intensity, side}) is authoritative — the
  // learner never picks their topic, intensity, or stance (WS6).
  const navState = location.state as
    | {
        autostart?: boolean;
        returnTo?: string;
        activityId?: string;
        selection?: CarsDuelSelectionView | null;
      }
    | null;
  const returnTo = navState?.returnTo;
  const activityId = navState?.activityId;
  const finish = (complete = true) => {
    if (returnTo) navigate(returnTo, complete ? { state: { completedActivityId: activityId } } : {});
    else navigate('/app');
  };
  const recordDuel = useRecordCarsDuel();
  const ai = useMemo(() => new HttpAiChat({ endpoint: '/api/ai/chat' }), []);

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<DuelMode>('rebut');
  const [difficulty, setDifficulty] = useState<DuelDifficulty>('standard');
  // The system picks the topic. On autostart it comes from the resolved selection;
  // the manual entry point falls back to a suggested prompt (shown read-only).
  const [topic, setTopic] = useState(SUGGESTED_TOPICS[0] ?? '');
  // The selection actually played, reported back so the formative engine can update
  // its history/intensity/unlock (WS6). topicId stays null for a manual duel, so a
  // free-text practice never writes engine history.
  const played = useRef<{
    mode: DuelMode;
    intensity: DuelDifficulty;
    topicId: string | null;
  }>({ mode: 'rebut', intensity: 'standard', topicId: null });

  const sent = useRef<AiMessage[]>([]);
  const [shown, setShown] = useState<Shown[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [reflection, setReflection] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  const rounds = shown.filter((m) => m.role === 'user').length;
  const canReflect = shown.some((m) => m.role === 'user');

  const call = async (messages: AiMessage[]): Promise<string | null> => {
    setBusy(true);
    try {
      const { text } = await ai.chat({ messages });
      return text;
    } catch (err) {
      setUnavailable(true);
      setErrorDetail(err instanceof Error ? err.message : String(err));
      if (import.meta.env.DEV) console.error('CARS Duel AI error', err);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const start = async (override?: {
    mode: DuelMode;
    difficulty: DuelDifficulty;
    topic: string;
    side?: DuelSide;
    topicId?: string;
  }) => {
    const useMode = override?.mode ?? mode;
    const useDifficulty = override?.difficulty ?? difficulty;
    const useTopic = override?.topic ?? topic;
    const useSide = override?.side;
    if (override) {
      setMode(useMode);
      setDifficulty(useDifficulty);
      setTopic(useTopic);
    }
    played.current = {
      mode: useMode,
      intensity: useDifficulty,
      topicId: override?.topicId ?? null,
    };
    const system: AiMessage = {
      role: 'system',
      content: buildCarsSystemPrompt(useMode, useDifficulty, useTopic, useSide),
    };
    if (useMode === 'rebut') {
      const kickoff: AiMessage = {
        role: 'user',
        content: 'Begin: state your position on the topic in 2-3 sentences, then invite my rebuttal.',
      };
      sent.current = [system, kickoff];
      setPhase('debating');
      const reply = await call(sent.current);
      if (reply !== null) {
        sent.current = [...sent.current, { role: 'assistant', content: reply }];
        setShown([{ role: 'assistant', content: reply }]);
      }
    } else {
      sent.current = [system];
      setShown([]);
      setPhase('debating');
    }
  };

  const sendTurn = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    const userMsg: AiMessage = { role: 'user', content: text };
    sent.current = [...sent.current, userMsg];
    setShown((prev) => [...prev, { role: 'user', content: text }]);
    const reply = await call(sent.current);
    if (reply !== null) {
      sent.current = [...sent.current, { role: 'assistant', content: reply }];
      setShown((prev) => [...prev, { role: 'assistant', content: reply }]);
    }
  };

  const reflect = async () => {
    const reply = await call([...sent.current, buildReflectionPrompt()]);
    if (reply === null) return;
    setReflection(reply);
    setPhase('reflection');
    // Best-effort formative rubric → a low-weight CARS ability nudge. Never blocks
    // the reflection, and a missing/invalid grade simply records the duel with no
    // rubric (contextual only).
    let rubric: ReturnType<typeof parseDuelRubric> | undefined;
    try {
      const graded = await ai.chat({ messages: [...sent.current, buildDuelRubricPrompt()] });
      const scores = parseDuelRubric(graded.text);
      if (Object.keys(scores).length > 0) rubric = scores;
    } catch {
      /* rubric grading is optional */
    }
    // Report the rubric AND which selection was played so the formative engine can
    // update its history/intensity/unlock. topicId is null for a manual duel, so
    // only a real (autostarted) selection writes engine history.
    recordDuel.mutate({
      ...(rubric ? { rubric } : {}),
      mode: played.current.mode,
      intensity: played.current.intensity,
      ...(played.current.topicId ? { topicId: played.current.topicId } : {}),
    });
  };

  // Auto-start when launched from Today's Path (skip the setup screen), using the
  // server-resolved selection when present and falling back to defaults otherwise.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (navState?.autostart && !autoStarted.current && phase === 'setup') {
      autoStarted.current = true;
      const sel = navState.selection;
      if (sel) {
        void start({
          mode: sel.mode,
          difficulty: sel.intensity,
          topic: sel.proposition,
          side: sel.side,
          topicId: sel.topicId,
        });
      } else {
        void start();
      }
    }
    // start reads the selection/defaults directly; run once on autostart.
  }, [navState?.autostart, phase]);

  if (unavailable) {
    return (
      <div className="mc-screen">
        <Eyebrow>CARS Duel</Eyebrow>
        <h1 className="mc-h1">Your sparring partner is offline</h1>
        <Callout tone="info" title="AI opponent not connected">
          The debate opponent runs through the dev AI proxy (see{' '}
          <code>apps/learner-web/.env</code>). After setting/changing the key you must fully restart
          the dev server — Vite only reads the key at startup. Your key never touches the browser.
        </Callout>
        {errorDetail ? (
          <Callout tone="warning" title="What went wrong">
            {errorDetail}
          </Callout>
        ) : null}
        <Stack gap={2}>
          <Button
            variant="primary"
            onClick={() => {
              setUnavailable(false);
              setErrorDetail(null);
            }}
          >
            Try again
          </Button>
          <Button variant="secondary" onClick={() => finish(false)}>
            {returnTo ? 'Back to plan' : 'Back to Home'}
          </Button>
        </Stack>
      </div>
    );
  }

  if (phase === 'setup') {
    return (
      <div className="mc-screen">
        <h1 className="mc-h1">Debate to sharpen your reasoning</h1>
        <p className="mc-muted mc-fineprint">
          CARS Duel is a live, back-and-forth debate with an AI sparring partner — the fastest way to
          train the exact skill CARS tests: reading an argument closely and pressure-testing it.
          Choose how you want to spar, trade a few rounds on the topic below, and finish with a
          constructive reflection. No winner or loser, and it never counts toward mastery.
        </p>

        <Card elevated>
          <Stack gap={4}>
            <div>
              <p className="mc-label">Mode</p>
              <div className="mc-segmented" role="radiogroup" aria-label="Debate mode">
                {MODES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    className={`mc-segmented__opt ${mode === m ? 'is-active' : ''}`}
                    onClick={() => setMode(m)}
                  >
                    {DUEL_MODE_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mc-label">Intensity</p>
              <div className="mc-segmented" role="radiogroup" aria-label="Difficulty">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d}
                    className={`mc-segmented__opt ${difficulty === d ? 'is-active' : ''}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {DUEL_DIFFICULTY_LABELS[d]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mc-label">Topic</p>
              <p style={{ margin: '6px 0 0', fontSize: '1.25rem', lineHeight: 1.5, fontWeight: 600 }}>
                {topic}
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              disabled={topic.trim().length === 0 || busy}
              onClick={() => void start()}
            >
              {busy ? 'Setting up…' : 'Start the duel'}
            </Button>
          </Stack>
        </Card>
      </div>
    );
  }

  if (phase === 'reflection') {
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Duel reflection</Eyebrow>
        <h1 className="mc-h1">Nice sparring.</h1>
        <Card elevated>
          <p className="mc-duel__reflection">{reflection}</p>
        </Card>
        <Stack gap={2}>
          <Button
            variant="primary"
            onClick={() => {
              sent.current = [];
              setShown([]);
              setReflection(null);
              setPhase('setup');
            }}
          >
            New duel
          </Button>
          <Button variant="secondary" onClick={() => finish(true)}>
            {returnTo ? 'Back to plan' : 'Back to Home'}
          </Button>
        </Stack>
      </div>
    );
  }

  // debating
  return (
    <div className="mc-screen mc-study">
      <Eyebrow>
        CARS Duel · {DUEL_DIFFICULTY_LABELS[difficulty]} · round {Math.min(rounds + 1, MAX_ROUNDS)} of{' '}
        {MAX_ROUNDS}
      </Eyebrow>
      <p className="mc-muted mc-fineprint">{topic}</p>

      <div className="mc-duel__log" aria-live="polite">
        {mode === 'defend' && shown.length === 0 ? (
          <p className="mc-muted mc-fineprint">State your thesis to open — the AI will push back.</p>
        ) : null}
        {shown.map((m, i) => (
          <div key={i} className={`mc-duel__msg mc-duel__msg--${m.role === 'user' ? 'user' : 'ai'}`}>
            <span className="mc-duel__who">{m.role === 'user' ? 'You' : 'Opponent'}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {busy ? <p className="mc-muted mc-fineprint">Opponent is thinking…</p> : null}
      </div>

      <textarea
        className="mc-input"
        rows={3}
        aria-label="Your argument"
        placeholder={mode === 'defend' && shown.length === 0 ? 'Your thesis…' : 'Your rebuttal…'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={busy || rounds >= MAX_ROUNDS}
      />

      <Stack gap={2}>
        {rounds >= MAX_ROUNDS ? (
          <Callout tone="info">You&apos;ve hit the round limit — wrap up with a reflection.</Callout>
        ) : (
          <Button
            variant="primary"
            size="lg"
            disabled={draft.trim().length === 0 || busy}
            onClick={sendTurn}
          >
            Send argument
          </Button>
        )}
        <button
          type="button"
          className="mc-textbtn"
          disabled={!canReflect || busy}
          onClick={reflect}
        >
          End &amp; get feedback
        </button>
      </Stack>
    </div>
  );
}
