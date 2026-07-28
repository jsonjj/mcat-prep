import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Button, Callout, Card, Eyebrow, SkipLink, Stack, useTheme } from '@mcat/ui-web';

import '../styles/app.css';
import './app-native.css';

import type {
  AccountingVisualPreview,
  BoundaryVisualPreview,
  LessonCompletionNodePreview,
  LessonExplanationNodePreview,
  LessonIntroNodePreview,
  LessonMapVisualPreview,
  LessonNodePreview,
  LessonPresentationPreview,
  LessonPresentationScreenPreview,
  LessonQuestionNodePreview,
  LessonRepairNodePreview,
  LessonScriptPreview,
  LessonVisualPreview,
  OpticsRayVisualPreview,
  PassageVisualPreview,
  RedoxCarrierVisualPreview,
  RelationVisualPreview,
} from './contract';
import { validateLessonPreviewPair } from './contract';

interface StoredQuestionResponse {
  readonly selectedOptionId: string;
  readonly submitted: boolean;
  readonly correct: boolean;
}

interface LessonPreviewRuntime {
  readonly schemaVersion: 1;
  readonly contentVersion: string;
  readonly currentNodeId: string;
  readonly responses: Readonly<Record<string, StoredQuestionResponse>>;
}

interface LessonRendererProps {
  readonly script: LessonScriptPreview;
  readonly presentation: LessonPresentationPreview;
  readonly lessonIndexHref: string;
  /**
   * When provided (e.g. launched from Today's Path), the completion action calls
   * this instead of a hard link — so the guided runner can mark the lesson done
   * and return to the plan with React Router state intact.
   */
  readonly onComplete?: () => void;
  /** Fired on a first wrong answer to an independent-stage question (count-only mistake signal). */
  readonly onIndependentMiss?: (questionId: string, chosenOptionId: string) => void;
}

const GROUP_LABELS: Record<LessonPresentationScreenPreview['progressGroup'], string> = {
  start: 'Start',
  learn: 'Learn',
  practice: 'Practice',
  check: 'Check',
  finish: 'Finish',
};

function storageKey(script: LessonScriptPreview): string {
  return `mcat-app-native-preview:${script.slug}:${script.contentVersion}`;
}

function initialRuntime(script: LessonScriptPreview): LessonPreviewRuntime {
  return {
    schemaVersion: 1,
    contentVersion: script.contentVersion,
    currentNodeId: presentationStartNode(script),
    responses: {},
  };
}

function presentationStartNode(script: LessonScriptPreview): string {
  return script.nodes[0].id;
}

function isStoredResponse(value: unknown): value is StoredQuestionResponse {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<StoredQuestionResponse>;
  return (
    typeof candidate.selectedOptionId === 'string' &&
    typeof candidate.submitted === 'boolean' &&
    typeof candidate.correct === 'boolean'
  );
}

function isStoredRuntime(
  value: unknown,
  script: LessonScriptPreview,
): value is LessonPreviewRuntime {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<LessonPreviewRuntime>;
  return (
    candidate.schemaVersion === 1 &&
    candidate.contentVersion === script.contentVersion &&
    typeof candidate.currentNodeId === 'string' &&
    typeof candidate.responses === 'object' &&
    candidate.responses !== null &&
    Object.values(candidate.responses).every(isStoredResponse)
  );
}

function readRuntime(script: LessonScriptPreview): LessonPreviewRuntime {
  try {
    const raw = localStorage.getItem(storageKey(script));
    if (raw === null) return initialRuntime(script);
    const parsed: unknown = JSON.parse(raw);
    return isStoredRuntime(parsed, script) ? parsed : initialRuntime(script);
  } catch {
    return initialRuntime(script);
  }
}

function shouldShowRepair(
  node: LessonRepairNodePreview,
  responses: LessonPreviewRuntime['responses'],
): boolean {
  return node.sourceQuestionIds.some((questionId) => {
    const response = responses[questionId];
    return response?.submitted === true && !response.correct;
  });
}

function buildActiveScreens(
  script: LessonScriptPreview,
  presentation: LessonPresentationPreview,
  responses: LessonPreviewRuntime['responses'],
): LessonPresentationScreenPreview[] {
  const nodes = new Map(script.nodes.map((node) => [node.id, node]));
  return presentation.screens.filter((screen) => {
    const node = nodes.get(screen.nodeId);
    return node?.kind !== 'repair' || shouldShowRepair(node, responses);
  });
}

function ThemeIcon() {
  const { resolved, setPreference } = useTheme();
  const nextTheme = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="mc-iconbtn"
      aria-label={`Switch to ${nextTheme} theme`}
      onClick={() => setPreference(nextTheme)}
    >
      {resolved === 'dark' ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z" />
        </svg>
      )}
    </button>
  );
}

function LessonOptions({ onReset }: { onReset: () => void }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  return (
    <details className="an-options" ref={detailsRef}>
      <summary className="mc-iconbtn an-options__trigger">
        <span aria-hidden="true">•••</span>
        <span className="mc-visually-hidden">Lesson options</span>
      </summary>
      <div className="an-options__menu">
        <Button
          variant="text"
          onClick={() => {
            detailsRef.current?.removeAttribute('open');
            onReset();
          }}
        >
          Start lesson over
        </Button>
      </div>
    </details>
  );
}

function VisualFrame({
  visual,
  children,
}: {
  visual: LessonVisualPreview;
  children: (titleId: string, descriptionId: string) => ReactNode;
}) {
  const rawId = useId().replaceAll(':', '');
  const titleId = `an-visual-title-${rawId}`;
  const descriptionId = `an-visual-description-${rawId}`;
  return (
    <figure className="an-figure">
      {children(titleId, descriptionId)}
      {visual.caption === undefined ? null : (
        <figcaption className="an-figure__caption">{visual.caption}</figcaption>
      )}
      <details className="an-visual-text">
        <summary>Read visual as text</summary>
        <p>{visual.textEquivalent}</p>
      </details>
    </figure>
  );
}

function RedoxEndpoint({
  visual,
  reduced,
  firstHighlighted,
  secondHighlighted,
  tailHighlighted,
}: {
  visual: RedoxCarrierVisualPreview;
  reduced: boolean;
  firstHighlighted: boolean;
  secondHighlighted: boolean;
  tailHighlighted: boolean;
}) {
  const bondLabels = reduced ? visual.reducedBondLabels : visual.oxidizedBondLabels;
  const stateLabel = reduced ? visual.reducedLabel : visual.oxidizedLabel;

  return (
    <section className="an-redox-endpoint" aria-hidden="true">
      <svg className="an-redox-structure" viewBox="0 0 240 290">
        <g className="an-redox-structure__ring">
          <path d="M120 70 L180 105 L180 175 L120 210 L60 175 L60 105 Z" />
          {reduced ? (
            <>
              <line x1="130" y1="80" x2="169" y2="103" />
              <line x1="169" y1="177" x2="130" y2="200" />
              <line x1="70" y1="118" x2="70" y2="162" />
            </>
          ) : (
            <>
              <line x1="169" y1="118" x2="169" y2="162" />
              <line x1="70" y1="118" x2="70" y2="162" />
            </>
          )}
        </g>

        <g
          className={`an-redox-structure__oxygen ${
            firstHighlighted ? 'an-redox-structure__oxygen--active' : ''
          }`}
        >
          {reduced ? (
            <line x1="120" y1="70" x2="120" y2="35" />
          ) : (
            <>
              <line x1="115" y1="70" x2="115" y2="35" />
              <line x1="125" y1="70" x2="125" y2="35" />
            </>
          )}
          <text className="an-redox-structure__atom" x="120" y="23" textAnchor="middle">
            {reduced ? 'OH' : 'O'}
          </text>
          <text className="an-redox-structure__bond-label" x="202" y="44" textAnchor="end">
            {bondLabels[0]}
          </text>
        </g>

        <g
          className={`an-redox-structure__oxygen ${
            secondHighlighted ? 'an-redox-structure__oxygen--active' : ''
          }`}
        >
          {reduced ? (
            <line x1="120" y1="210" x2="120" y2="250" />
          ) : (
            <>
              <line x1="115" y1="210" x2="115" y2="250" />
              <line x1="125" y1="210" x2="125" y2="250" />
            </>
          )}
          <text className="an-redox-structure__atom" x="120" y="276" textAnchor="middle">
            {reduced ? 'OH' : 'O'}
          </text>
          <text className="an-redox-structure__bond-label" x="202" y="257" textAnchor="end">
            {bondLabels[1]}
          </text>
        </g>

        <path
          className={`an-redox-structure__tail ${
            tailHighlighted ? 'an-redox-structure__tail--active' : ''
          }`}
          d="M180 105 L202 92 L219 104 L235 94"
        />
      </svg>
      <strong>{stateLabel}</strong>
      <small>{bondLabels.join(' · ')}</small>
    </section>
  );
}

function RedoxCarrierVisual({ visual }: { visual: RedoxCarrierVisualPreview }) {
  const firstHighlighted = ['endpoint-overview', 'first-oxygen', 'both-oxygens'].includes(
    visual.emphasis,
  );
  const secondHighlighted = ['endpoint-overview', 'second-oxygen', 'both-oxygens'].includes(
    visual.emphasis,
  );
  const accountingHighlighted = ['endpoint-overview', 'electron-in'].includes(visual.emphasis);
  const tailHighlighted = visual.emphasis === 'unchanged-tail';

  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div className="an-redox-visual" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>

          <div
            className={`an-redox-accounting ${
              accountingHighlighted ? 'an-redox-accounting--active' : ''
            }`}
            aria-hidden="true"
          >
            <span>{visual.accountingLabel}</span>
            <strong>{visual.equation}</strong>
            <small>{visual.mechanismBoundaryLabel}</small>
          </div>

          <div className="an-redox-endpoints">
            <RedoxEndpoint
              visual={visual}
              reduced={false}
              firstHighlighted={firstHighlighted}
              secondHighlighted={secondHighlighted}
              tailHighlighted={tailHighlighted}
            />
            <div
              className={`an-redox-transition ${
                accountingHighlighted ? 'an-redox-transition--active' : ''
              }`}
              aria-hidden="true"
            >
              <span>{visual.electronLabel}</span>
              <span>{visual.protonLabel}</span>
              <strong>
                <span className="an-redox-transition__horizontal">→</span>
                <span className="an-redox-transition__vertical">↓</span>
              </strong>
            </div>
            <RedoxEndpoint
              visual={visual}
              reduced
              firstHighlighted={firstHighlighted}
              secondHighlighted={secondHighlighted}
              tailHighlighted={tailHighlighted}
            />
          </div>

          <p
            className={`an-redox-tail-note ${tailHighlighted ? 'an-redox-tail-note--active' : ''}`}
            aria-hidden="true"
          >
            {visual.tailLabel}
          </p>
        </div>
      )}
    </VisualFrame>
  );
}

function AccountingVisual({ visual }: { visual: AccountingVisualPreview }) {
  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div className="an-accounting" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>
          <p className="an-equation" aria-hidden="true">
            {visual.equation}
          </p>
          <dl className="an-ledger" aria-hidden="true">
            {visual.rows.map((row) => (
              <div className="an-ledger__row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.reactants}</dd>
                <dd aria-hidden="true">→</dd>
                <dd>{row.products}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </VisualFrame>
  );
}

function BoundaryVisual({ visual }: { visual: BoundaryVisualPreview }) {
  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div className="an-boundary" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>
          <section className="an-boundary__side an-boundary__side--yes" aria-hidden="true">
            <strong>{visual.accountingLabel}</strong>
            <ul>
              {visual.accountingLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section className="an-boundary__side" aria-hidden="true">
            <strong>{visual.boundaryLabel}</strong>
            <ul>
              {visual.boundaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </VisualFrame>
  );
}

function OpticsRayVisual({ visual }: { visual: OpticsRayVisualPreview }) {
  const steps = ['geometry', 'first-ray', 'second-ray', 'intersection', 'properties'] as const;
  const level = steps.indexOf(visual.step);
  const showFirst = level >= 1;
  const showSecond = level >= 2;
  const showIntersection = level >= 3;
  const showProperties = level >= 4;
  const markerBase = useId().replaceAll(':', '');
  const firstMarkerId = `an-optics-first-arrow-${markerBase}`;
  const secondMarkerId = `an-optics-second-arrow-${markerBase}`;

  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div
          className="an-optics-visual"
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>
          <svg
            className="an-optics-diagram"
            viewBox="0 0 620 340"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <marker
                id={firstMarkerId}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path className="an-optics-diagram__arrow--first" d="M0 0 L12 6 L0 12 Z" />
              </marker>
              <marker
                id={secondMarkerId}
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="6"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path className="an-optics-diagram__arrow--second" d="M0 0 L12 6 L0 12 Z" />
              </marker>
            </defs>

            <line className="an-optics-diagram__axis" x1="26" y1="180" x2="594" y2="180" />
            <text className="an-optics-diagram__label" x="30" y="164">
              {visual.labels.axis}
            </text>

            <line className="an-optics-diagram__two-focus" x1="80" y1="173" x2="80" y2="187" />
            <line className="an-optics-diagram__two-focus" x1="480" y1="173" x2="480" y2="187" />
            <text className="an-optics-diagram__label" x="80" y="207" textAnchor="middle">
              2F
            </text>
            <text className="an-optics-diagram__label" x="480" y="207" textAnchor="middle">
              2F
            </text>
            <circle className="an-optics-diagram__focus" cx="180" cy="180" r="6" />
            <circle className="an-optics-diagram__focus" cx="380" cy="180" r="6" />
            <text className="an-optics-diagram__label" x="180" y="207" textAnchor="middle">
              F
            </text>
            <text className="an-optics-diagram__label" x="380" y="207" textAnchor="middle">
              F
            </text>

            <path
              className="an-optics-diagram__lens"
              d="M280 25 C244 92 244 268 280 335 C316 268 316 92 280 25 Z"
            />
            <line className="an-optics-diagram__object" x1="60" y1="180" x2="60" y2="60" />
            <path className="an-optics-diagram__object" d="M51 73 L60 60 L69 73" />

            {showFirst ? (
              <path
                className="an-optics-diagram__ray an-optics-diagram__ray--first"
                d="M60 60 L280 60 L510 336"
                markerEnd={`url(#${firstMarkerId})`}
              />
            ) : null}

            {showSecond ? (
              <path
                className="an-optics-diagram__ray an-optics-diagram__ray--second"
                d="M60 60 L550 327.27"
                markerEnd={`url(#${secondMarkerId})`}
              />
            ) : null}

            {showIntersection ? (
              <circle className="an-optics-diagram__intersection" cx="463.33" cy="280" r="9" />
            ) : null}

            {showProperties ? (
              <g className="an-optics-diagram__image">
                <line x1="463.33" y1="180" x2="463.33" y2="280" />
                <path d="M454.33 267 L463.33 280 L472.33 267" />
              </g>
            ) : null}
          </svg>

          <div className="an-optics-key" aria-hidden="true">
            <span>
              <i className="an-optics-key__swatch an-optics-key__swatch--object" />
              {visual.labels.object}
            </span>
            <span>
              <i className="an-optics-key__swatch an-optics-key__swatch--lens" />
              {visual.labels.element}
            </span>
            <span>
              <i className="an-optics-key__swatch an-optics-key__swatch--focus" />
              {`${visual.labels.nearFocus}, ${visual.labels.farFocus}; ${visual.labels.nearTwoFocus}, ${visual.labels.farTwoFocus}`}
            </span>
            {showFirst ? (
              <span>
                <i className="an-optics-key__swatch an-optics-key__swatch--first" />
                {visual.labels.firstRay}
              </span>
            ) : null}
            {showSecond ? (
              <span>
                <i className="an-optics-key__swatch an-optics-key__swatch--second" />
                {visual.labels.secondRay}
              </span>
            ) : null}
            {showIntersection ? (
              <span>
                <i className="an-optics-key__swatch an-optics-key__swatch--intersection" />
                {visual.labels.intersection}
              </span>
            ) : null}
            {showProperties ? (
              <span>
                <i className="an-optics-key__swatch an-optics-key__swatch--image" />
                {visual.labels.image}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </VisualFrame>
  );
}

function LessonMapVisual({ visual }: { visual: LessonMapVisualPreview }) {
  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div className="an-lesson-map" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>
          <ol aria-hidden="true">
            {visual.items.map((item) => (
              <li
                className={item.kcId === visual.focusKcId ? 'an-lesson-map__focus' : undefined}
                key={item.kcId}
              >
                <span className="an-lesson-map__marker" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.boundaryLabel}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </VisualFrame>
  );
}

function RelationVisual({ visual }: { visual: RelationVisualPreview }) {
  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <div className="an-relations" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
          <span id={titleId} className="mc-visually-hidden">
            {visual.alt}
          </span>
          <span id={descriptionId} className="mc-visually-hidden">
            {visual.textEquivalent}
          </span>
          <div aria-hidden="true">
            {visual.lanes.map((lane, laneIndex) => (
              <section className="an-relations__lane" key={lane.label}>
                {laneIndex > 0 && lane.continuationLabel !== undefined ? (
                  <div className="an-relations__continuation">
                    <span aria-hidden="true">↓</span>
                    <span>{lane.continuationLabel}</span>
                  </div>
                ) : null}
                <strong className="an-relations__label">{lane.label}</strong>
                <div className="an-relations__track">
                  {lane.nodes.map((node, index) => (
                    <div
                      className="an-relations__unit"
                      key={`${lane.label}:${node.label}:${index}`}
                    >
                      <div
                        className={`an-relations__node ${
                          node.emphasis === undefined ? '' : `an-relations__node--${node.emphasis}`
                        }`}
                      >
                        <strong>{node.label}</strong>
                        {node.detail === undefined ? null : <small>{node.detail}</small>}
                      </div>
                      {lane.links[index] === undefined ? null : (
                        <span className="an-relations__link">
                          <span>{lane.links[index]}</span>
                          <span aria-hidden="true">→</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </VisualFrame>
  );
}

function PassageVisual({ visual }: { visual: PassageVisualPreview }) {
  return (
    <VisualFrame visual={visual}>
      {(titleId, descriptionId) => (
        <section className="an-passage" aria-labelledby={titleId} aria-describedby={descriptionId}>
          <h2 id={titleId}>{visual.title}</h2>
          <span id={descriptionId} className="mc-visually-hidden">
            {`${visual.alt}. ${visual.textEquivalent}`}
          </span>
          <div className="an-passage__body">
            {visual.paragraphs.map((paragraph) => (
              <p key={paragraph.id}>
                {paragraph.sentences.map((sentence) => (
                  <span
                    className={`an-passage__sentence ${
                      sentence.focused ? 'an-passage__sentence--focused' : ''
                    }`}
                    key={sentence.id}
                  >
                    <span className="an-passage__marker" aria-hidden="true">
                      {sentence.label}
                    </span>
                    <span>{sentence.text}</span>
                    {sentence.annotation === undefined ? null : (
                      <span className="an-passage__annotation">{sentence.annotation}</span>
                    )}{' '}
                  </span>
                ))}
              </p>
            ))}
          </div>
        </section>
      )}
    </VisualFrame>
  );
}

function LessonVisual({ visual }: { visual: LessonVisualPreview }) {
  switch (visual.kind) {
    case 'redox-carrier':
      return <RedoxCarrierVisual visual={visual} />;
    case 'accounting':
      return <AccountingVisual visual={visual} />;
    case 'boundary':
      return <BoundaryVisual visual={visual} />;
    case 'optics-rays':
      return <OpticsRayVisual visual={visual} />;
    case 'lesson-map':
      return <LessonMapVisual visual={visual} />;
    case 'relations':
      return <RelationVisual visual={visual} />;
    case 'passage':
      return <PassageVisual visual={visual} />;
  }
}

function ScreenHeader({
  node,
  stageLabel,
  headingRef,
  headingId,
}: {
  node: LessonNodePreview;
  stageLabel: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
  headingId: string;
}) {
  return (
    <header className="an-screen__header">
      <Eyebrow>{stageLabel}</Eyebrow>
      <h1 className="mc-h1" id={headingId} ref={headingRef} tabIndex={-1}>
        {node.title}
      </h1>
      {node.supportingLine === undefined ? null : (
        <p className="an-screen__support">{node.supportingLine}</p>
      )}
    </header>
  );
}

function IntroScreen({
  node,
  actionLabel,
  onContinue,
}: {
  node: LessonIntroNodePreview;
  actionLabel: string;
  onContinue: () => void;
}) {
  return (
    <Stack gap={5}>
      <p className="an-intro__outcome">{node.outcome}</p>
      <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
        {actionLabel}
      </Button>
    </Stack>
  );
}

function ExplanationScreen({
  node,
  actionLabel,
  onContinue,
}: {
  node: LessonExplanationNodePreview;
  actionLabel: string;
  onContinue: () => void;
}) {
  return (
    <Stack gap={4}>
      <Card elevated className="an-model-surface">
        <LessonVisual visual={node.visual} />
      </Card>
      <div className="an-progressive-copy">
        {node.explanation.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {node.takeaway === undefined ? null : (
          <p className="an-takeaway">
            <strong>Keep this:</strong> {node.takeaway}
          </p>
        )}
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
        {actionLabel}
      </Button>
    </Stack>
  );
}

function QuestionScreen({
  node,
  response,
  actionLabel,
  onSelect,
  onSubmit,
  onContinue,
}: {
  node: LessonQuestionNodePreview;
  response: StoredQuestionResponse | undefined;
  actionLabel: string;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
}) {
  const selectedOptionId = response?.selectedOptionId;
  const submitted = response?.submitted ?? false;
  const feedback =
    submitted && selectedOptionId !== undefined
      ? node.evaluation.feedbackByOption[selectedOptionId]
      : undefined;

  return (
    <Stack gap={4}>
      {node.visual === undefined ? null : (
        <Card elevated className="an-model-surface an-question-context">
          <LessonVisual visual={node.visual} />
        </Card>
      )}
      <fieldset className="mc-choices an-question">
        <legend className="an-question__prompt">{node.prompt}</legend>
        {node.options.map((option) => (
          <label
            className={`mc-choice ${selectedOptionId === option.id ? 'mc-choice--selected' : ''}`}
            key={option.id}
          >
            <input
              type="radio"
              name={node.id}
              value={option.id}
              checked={selectedOptionId === option.id}
              disabled={submitted}
              onChange={() => onSelect(option.id)}
            />
            <span className="mc-choice__key">{option.id}</span>
            <span className="mc-choice__text">{option.label}</span>
          </label>
        ))}
      </fieldset>

      {!submitted && node.help !== undefined ? (
        <details className="an-details an-question__help">
          <summary>Need a hint?</summary>
          <p>{node.help}</p>
        </details>
      ) : null}

      {!submitted ? (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={selectedOptionId === undefined || selectedOptionId === ''}
          onClick={onSubmit}
        >
          Check answer
        </Button>
      ) : (
        <>
          <Callout tone={response?.correct ? 'success' : 'info'}>
            <Stack gap={2}>
              <strong>
                {response?.correct
                  ? 'That trace works.'
                  : (node.evaluation.incorrectHeading ??
                    'That answer is incorrect. We’ll work through it together.')}
              </strong>
              {feedback === undefined ? null : <p>{feedback}</p>}
              <p>{node.evaluation.explanation}</p>
            </Stack>
          </Callout>
          <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
            {actionLabel}
          </Button>
        </>
      )}
    </Stack>
  );
}

function RepairScreen({
  node,
  actionLabel,
  onContinue,
}: {
  node: LessonRepairNodePreview;
  actionLabel: string;
  onContinue: () => void;
}) {
  return (
    <Stack gap={4}>
      <Card elevated className="an-model-surface">
        <LessonVisual visual={node.visual} />
      </Card>
      <div className="an-progressive-copy">
        {node.explanation.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        <p className="an-takeaway">
          <strong>Try this:</strong> {node.strategy}
        </p>
        <p>
          <strong>Check your thinking:</strong> {node.checkYourThinking}
        </p>
      </div>
      <Button variant="primary" size="lg" fullWidth onClick={onContinue}>
        {actionLabel}
      </Button>
    </Stack>
  );
}

function CompletionScreen({
  node,
  actionLabel,
  lessonIndexHref,
  onComplete,
}: {
  node: LessonCompletionNodePreview;
  actionLabel: string;
  lessonIndexHref: string;
  onComplete?: () => void;
}) {
  return (
    <Stack gap={4}>
      <p>{node.summary}</p>
      <Card elevated>
        <ul className="an-completion-list">
          {node.takeaways.map((takeaway) => (
            <li key={takeaway}>{takeaway}</li>
          ))}
        </ul>
      </Card>
      <p className="mc-muted">{node.nextStep}</p>
      {onComplete ? (
        <button
          type="button"
          className="mc-button mc-button--primary mc-button--lg mc-button--full"
          onClick={onComplete}
        >
          <span className="mc-button__label">{actionLabel}</span>
        </button>
      ) : (
        <a
          className="mc-button mc-button--primary mc-button--lg mc-button--full"
          href={lessonIndexHref}
        >
          <span className="mc-button__label">{actionLabel}</span>
        </a>
      )}
    </Stack>
  );
}

function renderScreenBody({
  node,
  response,
  actionLabel,
  lessonIndexHref,
  onSelect,
  onSubmit,
  onContinue,
  onComplete,
}: {
  node: LessonNodePreview;
  response: StoredQuestionResponse | undefined;
  actionLabel: string;
  lessonIndexHref: string;
  onSelect: (optionId: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
  onComplete?: () => void;
}) {
  switch (node.kind) {
    case 'intro':
      return <IntroScreen node={node} actionLabel={actionLabel} onContinue={onContinue} />;
    case 'explanation':
      return <ExplanationScreen node={node} actionLabel={actionLabel} onContinue={onContinue} />;
    case 'question':
      return (
        <QuestionScreen
          node={node}
          response={response}
          actionLabel={actionLabel}
          onSelect={onSelect}
          onSubmit={onSubmit}
          onContinue={onContinue}
        />
      );
    case 'repair':
      return <RepairScreen node={node} actionLabel={actionLabel} onContinue={onContinue} />;
    case 'completion':
      return (
        <CompletionScreen
          node={node}
          actionLabel={actionLabel}
          lessonIndexHref={lessonIndexHref}
          onComplete={onComplete}
        />
      );
  }
}

export function LessonRenderer({
  script,
  presentation,
  lessonIndexHref,
  onComplete,
  onIndependentMiss,
}: LessonRendererProps) {
  useMemo(() => validateLessonPreviewPair(script, presentation), [presentation, script]);
  const [runtime, setRuntime] = useState<LessonPreviewRuntime>(() => readRuntime(script));
  const nodes = useMemo(() => new Map(script.nodes.map((node) => [node.id, node])), [script.nodes]);
  const screens = useMemo(
    () => buildActiveScreens(script, presentation, runtime.responses),
    [presentation, runtime.responses, script],
  );
  const currentScreen =
    screens.find((screen) => screen.nodeId === runtime.currentNodeId) ?? screens[0];
  const currentIndex = Math.max(
    0,
    screens.findIndex((screen) => screen.nodeId === currentScreen.nodeId),
  );
  const currentNode = nodes.get(currentScreen.nodeId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  useEffect(() => {
    localStorage.setItem(storageKey(script), JSON.stringify(runtime));
  }, [runtime, script]);

  useEffect(() => {
    if (runtime.currentNodeId !== currentScreen.nodeId) {
      setRuntime((current) => ({ ...current, currentNodeId: currentScreen.nodeId }));
    }
  }, [currentScreen.nodeId, runtime.currentNodeId]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [currentScreen.nodeId]);

  if (currentNode === undefined) return null;

  const response = currentNode.kind === 'question' ? runtime.responses[currentNode.id] : undefined;
  const progressPercent = Math.round(((currentIndex + 1) / screens.length) * 100);
  const actionLabel = currentScreen.primaryActionLabel ?? 'Continue';
  const taskWidthStyle = {
    '--an-task-width': `${presentation.taskColumnWidth}px`,
  } as CSSProperties;

  const updateResponse = (nextResponse: StoredQuestionResponse) => {
    setRuntime((current) => ({
      ...current,
      responses: { ...current.responses, [currentNode.id]: nextResponse },
    }));
  };

  const selectOption = (optionId: string) => {
    if (currentNode.kind !== 'question' || response?.submitted) return;
    updateResponse({
      selectedOptionId: optionId,
      submitted: false,
      correct: false,
    });
  };

  const submitQuestion = () => {
    if (
      currentNode.kind !== 'question' ||
      response === undefined ||
      response.selectedOptionId === '' ||
      response.submitted
    ) {
      return;
    }
    const correct = response.selectedOptionId === currentNode.evaluation.correctOptionId;
    updateResponse({ ...response, submitted: true, correct });
    // A first wrong answer at an independent stage is an independent miss (count-only
    // signal for Today's Path; no mistake content is stored here).
    const independentStage =
      currentNode.stage === 'independent' ||
      currentNode.stage === 'exit-near' ||
      currentNode.stage === 'exit-changed';
    if (!correct && independentStage) {
      onIndependentMiss?.(currentNode.id, response.selectedOptionId);
    }
  };

  const continueLesson = () => {
    const nextScreen = screens[Math.min(currentIndex + 1, screens.length - 1)];
    if (nextScreen === undefined) return;
    setRuntime((current) => ({ ...current, currentNodeId: nextScreen.nodeId }));
  };

  const reviewPrevious = () => {
    const previousScreen = screens[currentIndex - 1];
    if (previousScreen === undefined) return;
    setRuntime((current) => ({ ...current, currentNodeId: previousScreen.nodeId }));
  };

  const resetLesson = () => {
    localStorage.removeItem(storageKey(script));
    setRuntime(initialRuntime(script));
  };

  const isIntro = currentNode.kind === 'intro';
  const canReviewPrevious = presentation.allowBackReview === true && currentIndex > 0;
  return (
    <div className="mc-shell an-shell" data-app-native-lesson={script.slug} style={taskWidthStyle}>
      <SkipLink targetId="main" />
      <header className="mc-shell__header an-shell__header">
        <a className="mc-brand" href={lessonIndexHref} aria-label="Back to lessons">
          <span className="mc-brand__mark" aria-hidden="true" />
          <span className="mc-brand__name">MCAT Mastery</span>
        </a>
        <div className="mc-shell__header-actions">
          <ThemeIcon />
          <LessonOptions onReset={resetLesson} />
        </div>
      </header>

      <main id="main" className="mc-shell__main an-main" tabIndex={-1}>
        {!isIntro ? (
          <div className="an-progress" aria-label="Lesson progress">
            <div className="an-progress__labels">
              <span>{GROUP_LABELS[currentScreen.progressGroup]}</span>
              <span>{`Step ${currentIndex} of ${screens.length - 1}`}</span>
            </div>
            <div
              className="mc-progress"
              role="progressbar"
              aria-label="Lesson progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        ) : null}

        {canReviewPrevious ? (
          <Button
            variant="text"
            className="an-review-previous"
            aria-label="Review previous screen"
            onClick={reviewPrevious}
          >
            ← Review previous
          </Button>
        ) : null}

        <article
          className={`mc-screen an-screen ${isIntro ? 'an-screen--intro' : ''}`}
          aria-labelledby={headingId}
        >
          <ScreenHeader
            node={currentNode}
            stageLabel={currentScreen.stageLabel}
            headingRef={headingRef}
            headingId={headingId}
          />
          {renderScreenBody({
            node: currentNode,
            response,
            actionLabel,
            lessonIndexHref,
            onSelect: selectOption,
            onSubmit: submitQuestion,
            onContinue: continueLesson,
            onComplete,
          })}
        </article>
      </main>
    </div>
  );
}
