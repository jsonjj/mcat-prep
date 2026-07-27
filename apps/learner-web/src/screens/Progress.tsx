import { useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Callout } from '@mcat/ui-web';
import { EvidenceAtlas } from '../components/EvidenceAtlas';
import { CarsReadiness } from '../components/CarsReadiness';

const TABS = [
  { id: 'lessons', label: 'Lessons' },
  { id: 'cars', label: 'CARS' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const initialTab = (): TabId =>
  typeof window !== 'undefined' && window.location.hash === '#cars' ? 'cars' : 'lessons';

/**
 * Progress — two views of the learner's evidence behind one segmented control so
 * the page stays short: "Lessons" shows the Evidence Atlas brain (per-lesson
 * P(L)); "CARS" shows the reading-ability dial + sub-skills. Selection follows
 * focus (ARIA APG tablist), matching the Curriculum tabs.
 */
export function Progress() {
  const [active, setActive] = useState<TabId>(initialTab);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number): void => {
    const tab = TABS[index];
    if (!tab) return;
    tabRefs.current[index]?.focus();
    setActive(tab.id);
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const i = TABS.findIndex((t) => t.id === active);
    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        select((i + 1) % TABS.length);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        select((i - 1 + TABS.length) % TABS.length);
        break;
      case 'Home':
        event.preventDefault();
        select(0);
        break;
      case 'End':
        event.preventDefault();
        select(TABS.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="mc-screen">
      <header className="mc-screen__head">
        <h1 className="mc-h1">Progress</h1>
        <p className="mc-muted">
          Two views of your evidence — the lessons you have mastered, and your CARS reading ability.
        </p>
      </header>

      <div className="mc-seg" role="tablist" aria-label="Progress view">
        {TABS.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`mc-progress-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`mc-progress-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className={`mc-seg__tab${selected ? ' mc-seg__tab--active' : ''}`}
              onClick={() => setActive(tab.id)}
              onKeyDown={onTabKeyDown}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id="mc-progress-panel-lessons"
        role="tabpanel"
        aria-labelledby="mc-progress-tab-lessons"
        hidden={active !== 'lessons'}
      >
        <EvidenceAtlas />
      </section>

      <section
        id="mc-progress-panel-cars"
        role="tabpanel"
        aria-labelledby="mc-progress-tab-cars"
        hidden={active !== 'cars'}
      >
        <CarsReadiness />
      </section>

      <Callout tone="info" title="No numeric score">
        Progress shows direction, not a scaled score — a numeric MCAT prediction stays hidden until it
        is validated and you have enough recent, broad evidence.
      </Callout>

      <Link to="/app/wrapped" className="mc-daily" aria-label="See your Wrapped recap">
        <div className="mc-daily__text">
          <span className="mc-upnext__eyebrow">Your Wrapped · private</span>
          <span className="mc-daily__title">See your recap</span>
          <span className="mc-upnext__meta">A keepable summary of the evidence you have built.</span>
        </div>
        <span className="mc-daily__arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  );
}
