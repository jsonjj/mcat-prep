import { useRef, useState, type ComponentType, type SVGProps } from 'react';
import type { BetaUpdateSource } from './beta-update-types';
import { AtlasPreview } from './components/AtlasPreview';
import { BetaUpdatesDialog } from './components/BetaUpdatesDialog';
import { ThemeToggle } from './components/ThemeToggle';
import {
  ArrowRightIcon,
  ChartIcon,
  CheckIcon,
  CompassIcon,
  LayersIcon,
  RefreshIcon,
  SparkIcon,
} from './components/icons';
import { SnapshotExperience } from './diagnostic/SnapshotExperience';
import { SNAPSHOT_EXPECTED_MINUTES, SNAPSHOT_QUESTION_COUNT } from './diagnostic/questions';

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

const productDifferences: Array<{
  eyebrow: string;
  title: string;
  body: string;
  icon: IconComponent;
}> = [
  {
    eyebrow: 'Diagnose before reveal',
    title: 'Name what failed before reading the explanation.',
    body: 'The current learner prototype asks whether a miss came from content, setup, representation, execution, or inference before revealing the answer.',
    icon: LayersIcon,
  },
  {
    eyebrow: 'Help fades · proof gets harder',
    title: 'Practice can teach without pretending to prove mastery.',
    body: 'The broader beta is designed to separate assisted work from independent evidence, then recheck it in new contexts and after time has passed.',
    icon: RefreshIcon,
  },
  {
    eyebrow: 'One next task · with reasons',
    title: 'The plan should explain why today’s task comes next.',
    body: 'The broader beta is designed to weigh prerequisites, unresolved errors, stale evidence, available time, and what one repair may unlock.',
    icon: CompassIcon,
  },
];

const snapshotOutcomes: Array<{
  eyebrow: string;
  title: string;
  body: string;
  icon: IconComponent;
}> = [
  {
    eyebrow: 'All six pair results',
    title: 'See where answers held up, split, or missed twice.',
    body: 'Every paired observation remains visible. A positive data result never hides a larger weakness elsewhere.',
    icon: LayersIcon,
  },
  {
    eyebrow: 'A high bar for patterns',
    title: 'No named pattern unless the answer evidence repeats.',
    body: 'The four-item data check names a signal only under a strict replication rule. Otherwise the report says what remains uncertain.',
    icon: ChartIcon,
  },
  {
    eyebrow: 'One prioritized retest',
    title: 'The weakest pair comes before reassurance.',
    body: 'The report prioritizes a no-match pair, then mixed evidence, and shows a transparent tie when twelve questions cannot rank the options.',
    icon: CompassIcon,
  },
];

const faqItems = [
  {
    question: 'Is this an MCAT score predictor?',
    answer:
      'No. The Snapshot does not estimate a 472–528 score, section score, percentile, mastery level, or admissions readiness.',
  },
  {
    question: 'Is the Snapshot hard enough for a dedicated student?',
    answer:
      'This version uses more multi-step interpretation, controlled comparisons, and stronger distractors than the first pilot. Its real difficulty and perfect-score rate are still unknown until target learners complete it; expert review cannot replace item-level pilot data.',
  },
  {
    question: 'What does the Snapshot cover?',
    answer:
      'It uses two CARS questions and ten selected science-reasoning questions arranged as six pairs. It does not cover psychology/sociology, full-passage endurance, section pacing, or broad MCAT content.',
  },
  {
    question: 'Do I need to enter an email to see my report?',
    answer:
      'No. The Snapshot and report are ungated. You can separately opt into occasional beta-launch and product-testing emails, and that address is not linked to your Snapshot responses.',
  },
];

export function App() {
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSource, setEmailSource] = useState<BetaUpdateSource>('hero');
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const snapshotReturnRef = useRef({ originId: 'landing-snapshot-hero', scrollY: 0 });
  const emailReturnRef = useRef('landing-beta-updates-hero');

  const openEmailUpdates = (originId: string, source: BetaUpdateSource) => {
    emailReturnRef.current = originId;
    setEmailSource(source);
    setEmailOpen(true);
  };
  const closeEmailUpdates = () => {
    setEmailOpen(false);
    requestAnimationFrame(() =>
      document.getElementById(emailReturnRef.current)?.focus({ preventScroll: true }),
    );
  };
  const openSnapshot = (originId: string) => {
    snapshotReturnRef.current = { originId, scrollY: window.scrollY };
    setSnapshotOpen(true);
    window.scrollTo({ top: 0 });
  };
  const closeSnapshot = () => {
    setSnapshotOpen(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: snapshotReturnRef.current.scrollY });
      document.getElementById(snapshotReturnRef.current.originId)?.focus({ preventScroll: true });
    });
  };

  if (snapshotOpen) {
    return (
      <>
        <SnapshotExperience
          onExit={closeSnapshot}
          onEmailUpdates={(originId, source) => openEmailUpdates(originId, source)}
        />
        <BetaUpdatesDialog open={emailOpen} onClose={closeEmailUpdates} source={emailSource} />
      </>
    );
  }

  return (
    <>
      <a className="lp-skip-link" href="#main">
        Skip to main content
      </a>

      <div className="lp-preview-bar">
        <span className="lp-preview-bar__dot" aria-hidden="true" />
        Snapshot available now
        <span aria-hidden="true">·</span>
        broader learner beta in development
      </div>

      <header className="lp-header">
        <div className="lp-shell lp-header__inner">
          <a className="lp-brand" href="#top" aria-label="MCAT Mastery landing page">
            <span className="lp-brand__mark" aria-hidden="true" />
            <span className="lp-brand__name">MCAT Mastery</span>
          </a>

          <nav className="lp-nav" aria-label="Primary">
            <a href="#why-different">Why it’s different</a>
            <a href="#what-you-get">The Snapshot</a>
            <a href="#faq">Questions</a>
          </nav>

          <div className="lp-header__actions">
            <ThemeToggle />
            <button
              id="landing-beta-updates-header"
              className="lp-button lp-button--small lp-button--secondary lp-button--updates"
              type="button"
              onClick={() => openEmailUpdates('landing-beta-updates-header', 'header')}
            >
              Beta updates
            </button>
            <button
              id="landing-snapshot-header"
              className="lp-button lp-button--small lp-button--primary lp-button--snapshot-header"
              type="button"
              onClick={() => openSnapshot('landing-snapshot-header')}
            >
              Start snapshot
              <ArrowRightIcon />
            </button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section id="top" className="lp-hero lp-hero--snapshot">
          <div className="lp-shell lp-hero__grid">
            <div className="lp-hero__copy">
              <p className="lp-eyebrow">Evidence-first MCAT preparation</p>
              <h1>Know what to study next—and what counts as progress.</h1>
              <p className="lp-hero__lede">
                MCAT Mastery is designed to diagnose misses before reveal, fade help, and use
                independent evidence to choose one focused next task. Try that idea now in the
                ungated Snapshot.
              </p>

              <p className="lp-hero__offer">
                <span>Available now · about {SNAPSHOT_EXPECTED_MINUTES} minutes</span>
                {SNAPSHOT_QUESTION_COUNT} paired CARS and science-reasoning questions
              </p>

              <div className="lp-hero__actions">
                <button
                  id="landing-snapshot-hero"
                  className="lp-button lp-button--primary lp-button--large"
                  type="button"
                  onClick={() => openSnapshot('landing-snapshot-hero')}
                >
                  Take the {SNAPSHOT_QUESTION_COUNT}-question snapshot
                  <ArrowRightIcon />
                </button>
                <button
                  id="landing-beta-updates-hero"
                  className="lp-button lp-button--secondary lp-button--large"
                  type="button"
                  onClick={() => openEmailUpdates('landing-beta-updates-hero', 'hero')}
                >
                  Get beta updates
                </button>
              </div>

              <ul className="lp-hero__assurances" aria-label="Snapshot assurances">
                <li>
                  <CheckIcon />
                  Immediate report
                </li>
                <li>
                  <CheckIcon />
                  Email always optional
                </li>
                <li>
                  <CheckIcon />
                  No score prediction
                </li>
              </ul>
              <p className="lp-hero__legal">
                Pilot items are awaiting independent validation. Not affiliated with or endorsed by
                the AAMC.
              </p>
            </div>

            <div className="lp-hero__visual">
              <AtlasPreview />
              <article className="lp-proof-card" aria-label="Example Snapshot output">
                <div className="lp-proof-card__header">
                  <span>
                    <SparkIcon />
                    Example output
                  </span>
                  <span className="lp-proof-card__status">Provisional</span>
                </div>
                <p className="lp-eyebrow">Evidence, not a score</p>
                <h2>One narrow signal—with every limit still visible</h2>
                <p>
                  All six paired observations remain in the report. A repeated pattern adds context;
                  it never erases mixed or weaker evidence.
                </p>
                <div className="lp-proof-card__action">
                  <span className="lp-proof-card__action-icon">
                    <CompassIcon />
                  </span>
                  <span>
                    <strong>One prioritized retest</strong>
                    The weakest evidence comes before a reassuring result
                  </span>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="why-different" className="lp-section lp-section--difference">
          <div className="lp-shell">
            <div className="lp-section-heading lp-section-heading--center">
              <p className="lp-eyebrow">What makes the broader app different</p>
              <h2>Built around evidence, not completion.</h2>
              <p>
                The current learner prototype demonstrates this loop in one synthetic topic. The
                broader beta is being built to make practice more honest about what was assisted,
                what transferred, what lasted, and what should happen next.
              </p>
            </div>

            <div className="lp-difference-grid">
              {productDifferences.map((difference) => {
                const Icon = difference.icon;
                return (
                  <article className="lp-difference-card" key={difference.eyebrow}>
                    <span className="lp-difference-card__icon">
                      <Icon />
                    </span>
                    <div>
                      <p className="lp-eyebrow">{difference.eyebrow}</p>
                      <h3>{difference.title}</h3>
                      <p>{difference.body}</p>
                    </div>
                  </article>
                );
              })}
            </div>

            <aside className="lp-evidence-rule">
              <span className="lp-evidence-rule__icon" aria-hidden="true">
                <SparkIcon />
              </span>
              <div>
                <p className="lp-eyebrow">The Evidence Atlas rule</p>
                <h3>Completion is history. Independent evidence changes the plan.</h3>
                <p>
                  The Atlas is designed to distinguish assisted practice from independent,
                  new-context, delayed, mixed, passage, timed, and protected evidence—not reward
                  clicks with decorative progress.
                </p>
              </div>
            </aside>
          </div>
        </section>

        <section id="what-you-get" className="lp-section lp-section--snapshot-focus">
          <div className="lp-shell">
            <div className="lp-section-heading lp-section-heading--center">
              <p className="lp-eyebrow">Try the idea now</p>
              <h2>Useful enough to act on. Narrow enough to trust.</h2>
              <p>
                The Snapshot reports only what twelve harder, paired questions can support. It does
                not compress a full-length exam into a confident-looking label.
              </p>
            </div>

            <div className="lp-snapshot-outcomes">
              {snapshotOutcomes.map((outcome) => {
                const Icon = outcome.icon;
                return (
                  <article className="lp-snapshot-outcome" key={outcome.eyebrow}>
                    <span className="lp-snapshot-outcome__icon">
                      <Icon />
                    </span>
                    <p className="lp-eyebrow">{outcome.eyebrow}</p>
                    <h3>{outcome.title}</h3>
                    <p>{outcome.body}</p>
                  </article>
                );
              })}
            </div>

            <div className="lp-snapshot-boundary">
              <div>
                <p className="lp-eyebrow">What it can show</p>
                <h3>Six paired observations, a strict repetition check, and one retest.</h3>
              </div>
              <div>
                <p className="lp-eyebrow">What stays unknown</p>
                <p>
                  Broad content coverage, psychology/sociology, endurance, pacing, and how this
                  compares with a calibrated longer diagnostic.
                </p>
              </div>
            </div>

            <div className="lp-inline-cta">
              <p>
                <strong>Ready to try it?</strong>
                Your report appears immediately after question {SNAPSHOT_QUESTION_COUNT}.
              </p>
              <div className="lp-inline-cta__actions">
                <button
                  id="landing-snapshot-middle"
                  className="lp-button lp-button--primary lp-button--large"
                  type="button"
                  onClick={() => openSnapshot('landing-snapshot-middle')}
                >
                  Start the snapshot
                  <ArrowRightIcon />
                </button>
                <button
                  id="landing-beta-updates-middle"
                  className="snapshot-text-button"
                  type="button"
                  onClick={() =>
                    openEmailUpdates('landing-beta-updates-middle', 'snapshot-section')
                  }
                >
                  Or get beta updates
                </button>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="lp-section lp-section--faq lp-section--faq-compact">
          <div className="lp-shell lp-faq-layout">
            <div className="lp-section-heading">
              <p className="lp-eyebrow">Before you begin</p>
              <h2>Important answers.</h2>
              <p>The limits are part of the product, not fine print added after the result.</p>
            </div>

            <div className="lp-faq-list">
              {faqItems.map((item) => (
                <details key={item.question}>
                  <summary>
                    {item.question}
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-section lp-final-snapshot">
          <div className="lp-shell">
            <div className="lp-final-snapshot__card">
              <div>
                <p className="lp-eyebrow">
                  About {SNAPSHOT_EXPECTED_MINUTES} minutes · email optional
                </p>
                <h2>Start with evidence, not another study-plan guess.</h2>
                <p>
                  Twelve questions. Six visible pair results. One prioritized retest—or an honest
                  tie.
                </p>
              </div>
              <div className="lp-final-snapshot__actions">
                <button
                  id="landing-snapshot-final"
                  className="lp-button lp-button--primary lp-button--large"
                  type="button"
                  onClick={() => openSnapshot('landing-snapshot-final')}
                >
                  Take the snapshot
                  <ArrowRightIcon />
                </button>
                <button
                  id="landing-beta-updates-final"
                  className="lp-button lp-button--secondary"
                  type="button"
                  onClick={() => openEmailUpdates('landing-beta-updates-final', 'final')}
                >
                  Get beta updates
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-shell lp-footer__main">
          <div>
            <a className="lp-brand" href="#top">
              <span className="lp-brand__mark" aria-hidden="true" />
              <span className="lp-brand__name">MCAT Mastery</span>
            </a>
            <p>A working-name prototype for evidence-led MCAT preparation.</p>
          </div>
          <div className="lp-footer__links">
            <button
              id="landing-snapshot-footer"
              type="button"
              onClick={() => openSnapshot('landing-snapshot-footer')}
            >
              Take the snapshot
            </button>
            <a href="#why-different">Why it’s different</a>
            <a href="#faq">Questions</a>
            <button
              id="landing-beta-updates-footer"
              type="button"
              onClick={() => openEmailUpdates('landing-beta-updates-footer', 'footer')}
            >
              Get beta updates
            </button>
          </div>
        </div>
        <div className="lp-shell lp-footer__legal">
          <p>Working name; brand clearance remains pending.</p>
          <p>
            MCAT® is a registered trademark of the Association of American Medical Colleges (AAMC).
            This product is not affiliated with or endorsed by the AAMC.
          </p>
        </div>
      </footer>

      <BetaUpdatesDialog open={emailOpen} onClose={closeEmailUpdates} source={emailSource} />
    </>
  );
}
