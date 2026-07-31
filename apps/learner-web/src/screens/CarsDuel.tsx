import { useEffect, useMemo, useRef, useState, type SVGProps } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Callout, Card, Eyebrow, Stack } from '@mcat/ui-web';
import {
  DUEL_DIFFICULTY_LABELS,
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
import type { CarsDuelSelectionView, CarsReadinessLabel } from '@mcat/contracts';
import { useCarsReadiness, useRecordCarsDuel } from '../app/queries';
import { useRecordPlanActivity } from '../app/today-queries';
import { IconBook, IconChat, IconCheck, IconShield, IconSwords } from '../components/icons';
import { Markdown } from '../components/Markdown';

/**
 * CARS Duel — an AI debate that sharpens critical analysis and reasoning.
 * No win/lose: it ends with constructive reflection. Contributes only contextual
 * CA1/CA2 evidence (an AI is in the loop, so it can never mint mastery).
 * The provider key stays server-side behind /api/ai/chat.
 */
const MODES: DuelMode[] = ['rebut', 'defend'];

/** Setup mode cards — an icon + a short "what you'll do" line for each side of the duel. */
const MODE_CARDS: Record<DuelMode, { title: string; description: string; Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element }> = {
  rebut: {
    title: 'Rebut the argument',
    description: "You dismantle the AI's case — closest to real CARS",
    Icon: IconChat,
  },
  defend: {
    title: 'Defend a thesis',
    description: 'You hold a position; the AI attacks it',
    Icon: IconShield,
  },
};

/**
 * Fallback intensity while the learner's CARS ability is still loading — the middle
 * of the Standard band (the engine's neutral starting intensity).
 */
const DEFAULT_INTENSITY_PCT = 50;

/**
 * Recommended STARTING intensity for the manual setup, derived from the learner's
 * current CARS ability.
 *
 * The engine's system intensity (an Elo rating with hold-rate hysteresis,
 * `nextCarsDuelIntensity`, targeting a 75–85% hold-rate) is resolved server-side and
 * only reaches the client on a Today's-Path autostart (`CarsDuelSelectionView.intensity`).
 * The manual setup has no such selection, so — following the engine's own philosophy
 * (higher ability → higher intensity band) — we seed the slider from the learner's CARS
 * readiness band, using the SAME `overallV` thresholds the Progress gauge uses for its
 * label (≥1.7 on-track, ≥0.85 approaching, else building). Each band maps to the
 * midpoint of the matching duel band, so `pctToDifficulty()` lands on
 * Warm-up / Standard / Challenge respectively. The learner can still drag it anywhere.
 */
const RECOMMENDED_INTENSITY_PCT: Record<CarsReadinessLabel, number> = {
  building: 17, // Warm-up band midpoint (0–33)
  approaching: 50, // Standard band midpoint (34–66)
  on_track: 83, // Challenge band midpoint (67–100)
};

/**
 * Map the continuous 0–100 intensity slider onto the engine's existing
 * DuelDifficulty enum at start time: Warm-up 0–33, Standard 34–66, Challenge 67–100.
 */
function pctToDifficulty(pct: number): DuelDifficulty {
  if (pct <= 33) return 'warmup';
  if (pct <= 66) return 'standard';
  return 'challenge';
}

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
  const recordPlan = useRecordPlanActivity();
  const carsReadiness = useCarsReadiness();
  const ai = useMemo(() => new HttpAiChat({ endpoint: '/api/ai/chat' }), []);

  const [phase, setPhase] = useState<Phase>('setup');
  const [mode, setMode] = useState<DuelMode>('rebut');
  const [difficulty, setDifficulty] = useState<DuelDifficulty>('standard');
  // The intensity slider is the source of truth for the manual setup; its 0–100
  // position is mapped onto `difficulty` (the engine enum) at start time. `null` means
  // "not touched yet" → follow the ability-derived recommendation (falling back to the
  // neutral default until CARS readiness loads); any drag pins it to that value.
  const [intensityPct, setIntensityPct] = useState<number | null>(null);
  const recommendedIntensityPct = carsReadiness.data
    ? RECOMMENDED_INTENSITY_PCT[carsReadiness.data.label]
    : null;
  const effectiveIntensityPct = intensityPct ?? recommendedIntensityPct ?? DEFAULT_INTENSITY_PCT;
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

  // Safety net for the strictly in-order plan: when this duel was launched from
  // Today's Path but the AI opponent is unavailable (no key → "Your sparring
  // partner is offline"), mark the launched step complete so the plan advances.
  // Otherwise the offline runner pins `currentActivityId` to itself and every
  // later step stays Locked — a dead end the learner can't escape, since the
  // offline "Back to plan" returns without a completedActivityId. Mirrors
  // RecallReview's empty-runner safety net. A no-key duel records no CARS
  // evidence (`reflect` never runs), so completing the step mints nothing.
  const advancedOfflineRef = useRef(false);
  useEffect(() => {
    if (advancedOfflineRef.current) return;
    if (!unavailable || !returnTo || !activityId) return;
    advancedOfflineRef.current = true;
    recordPlan.mutate({ activityId, status: 'complete' });
  }, [unavailable, returnTo, activityId, recordPlan]);

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
      <div className="mc-screen mc-cars-setup">
        <header className="mc-cars-setup__head">
          <h1 className="mc-cars-setup__title">CARS Duel</h1>
          <p className="mc-muted mc-cars-setup__intro">
            Practice active reading by debating high-yield arguments with AI.
          </p>
        </header>

        {/* Mode = two side-by-side selectable cards (native radios styled as cards →
            arrow-key navigation + aria-checked for free). Each shows an icon, a title,
            and a one-line description; the selected card gets a teal check. */}
        <fieldset className="mc-modecards mc-cars-setup__section">
          <legend className="mc-cars-setup__seclabel">Mode</legend>
          <div className="mc-modecards__grid">
            {MODES.map((m) => {
              const { Icon } = MODE_CARDS[m];
              return (
                <label key={m} className={`mc-modecard ${mode === m ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="duel-mode"
                    className="mc-modecard__input"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  <span className="mc-modecard__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <span className="mc-modecard__body">
                    <span className="mc-modecard__title">{MODE_CARDS[m].title}</span>
                    <span className="mc-modecard__desc">{MODE_CARDS[m].description}</span>
                  </span>
                  {mode === m ? (
                    <span className="mc-modecard__check" aria-hidden="true">
                      <IconCheck />
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Intensity = a continuous drag slider mapped onto the engine's difficulty
            band at start time (Warm-up / Standard / Challenge), pre-set to the band
            recommended for this learner's CARS ability. The readout is the prominent
            element above the track. */}
        <section className="mc-cars-setup__section">
          <p className="mc-cars-setup__seclabel">Intensity</p>
          <div className="mc-intensity">
            <p className="mc-intensity__readout" aria-hidden="true">
              <strong>{DUEL_DIFFICULTY_LABELS[pctToDifficulty(effectiveIntensityPct)]}</strong>
              <span className="mc-intensity__pct"> &middot; {effectiveIntensityPct}%</span>
            </p>
            <input
              type="range"
              className="mc-range"
              min={0}
              max={100}
              step={1}
              value={effectiveIntensityPct}
              onChange={(e) => setIntensityPct(Number(e.target.value))}
              aria-label="Intensity"
              aria-valuetext={`${DUEL_DIFFICULTY_LABELS[pctToDifficulty(effectiveIntensityPct)]}, ${effectiveIntensityPct}%`}
            />
            <div className="mc-intensity__anchors" aria-hidden="true">
              <span>Warm-up</span>
              <span>Standard</span>
              <span>Challenge</span>
            </div>
          </div>
        </section>

        {/* Topic = a distinct, highlighted, read-only "today's topic" card (system-chosen). */}
        <section className="mc-cars-setup__section">
          <p className="mc-cars-setup__seclabel">Topic</p>
          <div className="mc-topiccard">
            <span className="mc-topiccard__icon" aria-hidden="true">
              <IconBook />
            </span>
            <div className="mc-topiccard__body">
              <p className="mc-topiccard__eyebrow">Today&rsquo;s topic</p>
              <p className="mc-topiccard__text">&ldquo;{topic}&rdquo;</p>
            </div>
          </div>
        </section>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          className="mc-cars-setup__start"
          disabled={topic.trim().length === 0 || busy}
          onClick={() =>
            void start({ mode, difficulty: pctToDifficulty(effectiveIntensityPct), topic })
          }
        >
          <IconSwords className="mc-cars-setup__starticon" aria-hidden="true" />
          {busy ? 'Setting up…' : 'Start the duel'}
        </Button>
      </div>
    );
  }

  if (phase === 'reflection') {
    return (
      <div className="mc-screen mc-study">
        <Eyebrow>Duel reflection</Eyebrow>
        <h1 className="mc-h1">Nice sparring.</h1>
        <Card elevated>
          <Markdown content={reflection ?? ''} className="mc-duel__reflection" />
          <p className="mc-duel__ainote mc-muted mc-fineprint">
            AI coach — formative feedback on how you argued, not a graded score.
          </p>
        </Card>
        <Stack gap={2}>
          <Button variant="primary" onClick={() => finish(true)}>
            {returnTo ? 'Back to plan' : 'Back to Home'}
          </Button>
        </Stack>
      </div>
    );
  }

  // debating
  const atRoundLimit = rounds >= MAX_ROUNDS;
  return (
    <div className="mc-screen mc-study">
      {/* Sticky context bar: round · topic · intensity stay pinned while the debate
          scrolls (they used to scroll away). Sits just under the transparent
          app-shell header via `top`; a blurred solid background keeps debate text
          from showing through. */}
      <header className="mc-duel__bar">
        <p className="mc-duel__bar-eyebrow">
          CARS Duel · {DUEL_DIFFICULTY_LABELS[difficulty]} · Round{' '}
          {Math.min(rounds + 1, MAX_ROUNDS)} of {MAX_ROUNDS}
        </p>
        <p className="mc-duel__bar-topic" title={topic}>
          {topic}
        </p>
      </header>

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

      {atRoundLimit ? (
        // Round limit reached: the only action is to wrap up. No rebuttal box and no
        // small text link — a single prominent button, sized like the per-round submit
        // so it reads as the one obvious next step.
        <Stack gap={2}>
          <p className="mc-muted mc-fineprint">
            You&apos;ve hit the round limit — wrap up with a reflection.
          </p>
          <Button variant="primary" size="lg" disabled={!canReflect || busy} onClick={reflect}>
            End &amp; get feedback
          </Button>
        </Stack>
      ) : (
        <>
          <textarea
            className="mc-input"
            rows={3}
            aria-label="Your argument"
            placeholder={mode === 'defend' && shown.length === 0 ? 'Your thesis…' : 'Your rebuttal…'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={busy}
          />
          <Stack gap={2}>
            <Button
              variant="primary"
              size="lg"
              disabled={draft.trim().length === 0 || busy}
              onClick={sendTurn}
            >
              Send argument
            </Button>
            <button
              type="button"
              className="mc-textbtn"
              disabled={!canReflect || busy}
              onClick={reflect}
            >
              End &amp; get feedback
            </button>
          </Stack>
        </>
      )}
    </div>
  );
}
