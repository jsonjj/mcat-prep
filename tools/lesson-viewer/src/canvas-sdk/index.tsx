/**
 * Local shim for the "cursor/canvas" SDK used by the V3 lesson prototypes.
 *
 * Implements the same component/hook API surface the lessons import, but
 * renders everything with the MCAT Mastery design language (tokens from
 * `@mcat/design-tokens`, class styles in ../viewer.css). `useHostTheme()`
 * returns concrete hex values (not CSS variables) because the lessons feed
 * these colors into SVG presentation attributes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export interface CategoryPalette {
  readonly gray: string;
  readonly purple: string;
  readonly green: string;
  readonly yellow: string;
  readonly cyan: string;
  readonly pink: string;
  readonly blue: string;
  readonly orange: string;
  readonly red: string;
}
export type Color = keyof CategoryPalette;

export interface CanvasTokens {
  bg: { editor: string; chrome: string; elevated: string };
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    quaternary: string;
    link: string;
    onAccent: string;
  };
  stroke: { primary: string; secondary: string; tertiary: string; focused: string };
  fill: { primary: string; secondary: string; tertiary: string; quaternary: string };
  accent: { primary: string; control: string; controlHover: string };
  diff: { insertedLine: string; removedLine: string; stripAdded: string; stripRemoved: string };
  category: CategoryPalette;
}

export interface CanvasHostTheme extends CanvasTokens {
  readonly kind: string;
  readonly tokens: CanvasTokens;
  readonly palette: Record<string, string>;
}

/** Mapped from packages/design-tokens/src/tokens.css (light theme). */
const lightTokens: CanvasTokens = {
  bg: { editor: '#ffffff', chrome: '#f5f8f8', elevated: '#ffffff' },
  text: {
    primary: '#10222e',
    secondary: '#4a5a66',
    tertiary: '#10222e99',
    quaternary: '#10222e5c',
    link: '#0e7c74',
    onAccent: '#ffffff',
  },
  stroke: { primary: '#c3d4d7', secondary: '#d5e0e2', tertiary: '#e4edee', focused: '#0e7c74' },
  fill: {
    primary: '#10222e2b',
    secondary: '#10222e1c',
    tertiary: '#10222e10',
    quaternary: '#10222e0a',
  },
  accent: { primary: '#0e7c74', control: '#0b6a63', controlHover: '#095a54' },
  diff: {
    insertedLine: '#0b6a6322',
    removedLine: '#a3283d1c',
    stripAdded: '#0b6a63cc',
    stripRemoved: '#a3283dcc',
  },
  category: {
    gray: '#4a5a66',
    purple: '#574a9e',
    green: '#0b6a63',
    yellow: '#8a6d1f',
    cyan: '#0f6e83',
    pink: '#a3487d',
    blue: '#1e5a96',
    orange: '#b05a28',
    red: '#a3283d',
  },
};

/** Mapped from packages/design-tokens/src/tokens.css ([data-theme='dark']). */
const darkTokens: CanvasTokens = {
  bg: { editor: '#12242f', chrome: '#0a1620', elevated: '#17303d' },
  text: {
    primary: '#eaf3f4',
    secondary: '#a9bec6',
    tertiary: '#eaf3f499',
    quaternary: '#eaf3f45c',
    link: '#4fd1c4',
    onAccent: '#06231f',
  },
  stroke: { primary: '#35576a', secondary: '#23414f', tertiary: '#1b3441', focused: '#4fd1c4' },
  fill: {
    primary: '#eaf3f42e',
    secondary: '#eaf3f41f',
    tertiary: '#eaf3f412',
    quaternary: '#eaf3f40a',
  },
  accent: { primary: '#4fd1c4', control: '#2bb6a8', controlHover: '#46cabd' },
  diff: {
    insertedLine: '#2bb6a826',
    removedLine: '#ff9aa620',
    stripAdded: '#2bb6a8cc',
    stripRemoved: '#ff9aa6cc',
  },
  category: {
    gray: '#a9bec6',
    purple: '#c3b8ff',
    green: '#46cabd',
    yellow: '#e9cd83',
    cyan: '#86d3e8',
    pink: '#e8a0c4',
    blue: '#7fbbf2',
    orange: '#f0a088',
    red: '#ff9aa6',
  },
};

const buildTheme = (kind: 'light' | 'dark'): CanvasHostTheme => {
  const tokens = kind === 'dark' ? darkTokens : lightTokens;
  return { kind, tokens, palette: { ...tokens.category }, ...tokens };
};
const THEMES: Record<'light' | 'dark', CanvasHostTheme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};

const subscribeToThemeAttr = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};
const readThemeKind = (): 'light' | 'dark' =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

export function useHostTheme(): CanvasHostTheme {
  const kind = useSyncExternalStore(subscribeToThemeAttr, readThemeKind, () => 'light' as const);
  return THEMES[kind];
}

/* ------------------------------------------------------------------ */
/* Persistent state                                                    */
/* ------------------------------------------------------------------ */

export type SetCanvasState<T> = (action: T | ((prev: T) => T)) => void;

const StateScopeContext = createContext<string>('global');

/** Viewer-only helper: namespaces useCanvasState keys per lesson. */
export function CanvasStateScope({ id, children }: { id: string; children: ReactNode }) {
  return <StateScopeContext.Provider value={id}>{children}</StateScopeContext.Provider>;
}

export const canvasStateStorageKey = (scope: string, key: string) =>
  `mcat-lesson-viewer:${scope}:${key}`;

export function useCanvasState<T>(key: string, defaultValue: T): [T, SetCanvasState<T>] {
  const scope = useContext(StateScopeContext);
  const storageKey = canvasStateStorageKey(scope, key);
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch {
      /* fall through to default */
    }
    return defaultValue;
  });
  const set = useCallback<SetCanvasState<T>>(
    (action) => {
      setValue((prev) => {
        const next = typeof action === 'function' ? (action as (previous: T) => T)(prev) : action;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* storage quota — state stays in memory */
        }
        return next;
      });
    },
    [storageKey],
  );
  return [value, set];
}

/* ------------------------------------------------------------------ */
/* Layout primitives                                                   */
/* ------------------------------------------------------------------ */

export function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...override };
}

export type StackProps = { children?: ReactNode; gap?: number; style?: CSSProperties };
export function Stack({ children, gap = 12, style }: StackProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0, ...style }}>
      {children}
    </div>
  );
}

const alignMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
} as const;
const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
} as const;

export type RowProps = {
  children?: ReactNode;
  gap?: number;
  align?: keyof typeof alignMap;
  justify?: keyof typeof justifyMap;
  wrap?: boolean;
  style?: CSSProperties;
};
export function Row({
  children,
  gap = 8,
  align = 'center',
  justify = 'start',
  wrap = false,
  style,
}: RowProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap,
        alignItems: alignMap[align],
        justifyContent: justifyMap[justify],
        flexWrap: wrap ? 'wrap' : 'nowrap',
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type GridProps = {
  children?: ReactNode;
  columns: number | string;
  gap?: number;
  align?: keyof typeof alignMap;
  style?: CSSProperties;
};
export function Grid({ children, columns, gap = 12, align, style }: GridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns,
        gap,
        ...(align ? { alignItems: alignMap[align] } : null),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type DividerProps = { style?: CSSProperties };
export function Divider({ style }: DividerProps) {
  return <hr className="cv-divider" style={style} />;
}

export function Spacer() {
  return <span style={{ flex: 1 }} aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/* Typography                                                          */
/* ------------------------------------------------------------------ */

export type H1Props = { children?: ReactNode; style?: CSSProperties };
export function H1({ children, style }: H1Props) {
  return (
    <h1 className="cv-h1" style={style}>
      {children}
    </h1>
  );
}
export type H2Props = H1Props;
export function H2({ children, style }: H2Props) {
  return (
    <h2 className="cv-h2" style={style}>
      {children}
    </h2>
  );
}
export type H3Props = H1Props;
export function H3({ children, style }: H3Props) {
  return (
    <h3 className="cv-h3" style={style}>
      {children}
    </h3>
  );
}

export type CodeProps = { children?: ReactNode; style?: CSSProperties };
export function Code({ children, style }: CodeProps) {
  return (
    <code className="cv-code" style={style}>
      {children}
    </code>
  );
}

export type LinkProps = { children?: ReactNode; href: string; style?: CSSProperties };
export function Link({ children, href, style }: LinkProps) {
  return (
    <a className="cv-link" href={href} target="_blank" rel="noreferrer" style={style}>
      {children}
    </a>
  );
}

/** Renders `code spans` inside plain-string children (SDK parses backtick markdown). */
const renderInlineMarkdown = (node: ReactNode): ReactNode => {
  if (typeof node !== 'string' || !node.includes('`')) return node;
  const parts = node.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
      <Code key={i}>{part.slice(1, -1)}</Code>
    ) : (
      part
    ),
  );
};

const TextNestingContext = createContext(false);
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';
const weightMap: Record<TextWeight, number> = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export type TextProps = {
  children?: ReactNode;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
  size?: 'body' | 'small';
  as?: 'p' | 'span';
  weight?: TextWeight;
  italic?: boolean;
  truncate?: boolean | 'start' | 'end';
  style?: CSSProperties;
};
export function Text({
  children,
  tone = 'primary',
  size = 'body',
  as,
  weight = 'normal',
  italic = false,
  truncate,
  style,
}: TextProps) {
  const theme = useHostTheme();
  const nested = useContext(TextNestingContext);
  const Tag = as ?? (nested ? 'span' : 'p');
  const truncateStyle: CSSProperties = truncate
    ? {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(truncate === 'start' ? { direction: 'rtl', textAlign: 'left' } : null),
      }
    : {};
  return (
    <TextNestingContext.Provider value={true}>
      <Tag
        className={size === 'small' ? 'cv-text cv-text--small' : 'cv-text'}
        style={{
          color: theme.text[tone],
          fontWeight: weightMap[weight],
          fontStyle: italic ? 'italic' : undefined,
          ...truncateStyle,
          ...style,
        }}
      >
        {renderInlineMarkdown(children)}
      </Tag>
    </TextNestingContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export function CanvasChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{
        transform: expanded ? 'rotate(90deg)' : 'none',
        transition: 'transform var(--mc-motion-control) var(--mc-ease)',
        flexShrink: 0,
      }}
    >
      <path
        d="M3 1.5 L7 5 L3 8.5"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CardContextValue = {
  open: boolean;
  collapsible: boolean;
  toggle: () => void;
};
const CardContext = createContext<CardContextValue>({
  open: true,
  collapsible: false,
  toggle: () => {},
});

export type CardSize = 'base' | 'lg';
export type CardVariant = 'default' | 'borderless';
export type CardProps = {
  children?: ReactNode;
  variant?: CardVariant;
  size?: CardSize;
  stickyHeader?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
};
export function Card({
  children,
  variant = 'default',
  collapsible = false,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
}: CardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = collapsible ? (openProp ?? uncontrolledOpen) : true;
  const toggle = useCallback(() => {
    setUncontrolledOpen((prev) => {
      const next = openProp !== undefined ? !openProp : !prev;
      onOpenChange?.(next);
      return next;
    });
  }, [openProp, onOpenChange]);
  const ctx = useMemo(() => ({ open, collapsible, toggle }), [open, collapsible, toggle]);
  return (
    <CardContext.Provider value={ctx}>
      <section
        className={variant === 'borderless' ? 'cv-card cv-card--borderless' : 'cv-card'}
        style={style}
      >
        {children}
      </section>
    </CardContext.Provider>
  );
}

export type CardHeaderProps = { children?: ReactNode; trailing?: ReactNode; style?: CSSProperties };
export function CardHeader({ children, trailing, style }: CardHeaderProps) {
  const { open, collapsible, toggle } = useContext(CardContext);
  const inner = (
    <>
      {collapsible ? <CanvasChevron expanded={open} /> : null}
      <span className="cv-card__title">{children}</span>
      {trailing ? <span className="cv-card__trailing">{trailing}</span> : null}
    </>
  );
  if (collapsible) {
    return (
      <button
        type="button"
        className="cv-card__header cv-card__header--button"
        style={style}
        onClick={toggle}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="cv-card__header" style={style}>
      {inner}
    </div>
  );
}

export type CardBodyProps = { children?: ReactNode; style?: CSSProperties };
export function CardBody({ children, style }: CardBodyProps) {
  const { open } = useContext(CardContext);
  if (!open) return null;
  return (
    <div className="cv-card__body" style={style}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Controls                                                            */
/* ------------------------------------------------------------------ */

export type ButtonProps = {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  onClick?: () => void;
};
export function Button({
  children,
  variant = 'secondary',
  disabled,
  type = 'button',
  style,
  onClick,
}: ButtonProps) {
  const variantClass =
    variant === 'primary'
      ? 'mc-button--primary'
      : variant === 'ghost'
        ? 'mc-button--text'
        : 'mc-button--secondary';
  return (
    <button
      type={type}
      className={`mc-button ${variantClass} cv-button`}
      disabled={disabled}
      style={style}
      onClick={onClick}
    >
      <span className="mc-button__label">{children}</span>
    </button>
  );
}

export type PillTone = 'neutral' | 'added' | 'deleted' | 'renamed' | 'success' | 'warning' | 'info';
export type PillSize = 'sm' | 'md';
export type PillProps = {
  children?: ReactNode;
  active?: boolean;
  tone?: PillTone;
  size?: PillSize;
  leadingContent?: ReactNode;
  keyboardHint?: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
  onClick?: () => void;
};
export function Pill({
  children,
  active = false,
  size = 'md',
  leadingContent,
  keyboardHint,
  disabled,
  title,
  style,
  onClick,
}: PillProps) {
  const className = ['cv-pill', active ? 'cv-pill--active' : '', size === 'sm' ? 'cv-pill--sm' : '']
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {leadingContent ? <span className="cv-pill__leading">{leadingContent}</span> : null}
      <span>{children}</span>
      {keyboardHint ? <kbd className="cv-pill__hint">{keyboardHint}</kbd> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        title={title}
        style={style}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={className} title={title} style={style}>
      {content}
    </span>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };
export type SelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
};
export function Select({ value, onChange, options, placeholder, disabled, style }: SelectProps) {
  return (
    <select
      className="cv-select"
      value={value ?? ''}
      disabled={disabled}
      style={style}
      onChange={(e) => onChange?.(e.target.value)}
    >
      {placeholder !== undefined && (value === undefined || value === '') ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} disabled={opt.disabled}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Status & data display                                               */
/* ------------------------------------------------------------------ */

export type StatTone = 'success' | 'danger' | 'warning' | 'info';
const statToneColor = (theme: CanvasHostTheme, tone?: StatTone): string => {
  if (!tone) return theme.text.primary;
  const map: Record<StatTone, string> = {
    success: theme.category.green,
    danger: theme.category.red,
    warning: theme.category.yellow,
    info: theme.category.blue,
  };
  return map[tone];
};

export type StatProps = {
  value: ReactNode;
  label: string;
  tone?: StatTone;
  style?: CSSProperties;
};
export function Stat({ value, label, tone, style }: StatProps) {
  const theme = useHostTheme();
  return (
    <div className="cv-stat" style={style}>
      <div className="cv-stat__value" style={{ color: statToneColor(theme, tone) }}>
        {value}
      </div>
      <div className="cv-stat__label">{label}</div>
    </div>
  );
}

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type CalloutProps = {
  children?: ReactNode;
  tone?: CalloutTone;
  title?: ReactNode;
  icon?: ReactNode;
  style?: CSSProperties;
};
export function Callout({ children, tone = 'neutral', title, icon, style }: CalloutProps) {
  // Mirrors the @mcat/ui-web Callout markup (mc-callout classes) so the
  // lessons inherit the app's callout look; neutral is viewer-defined.
  const label: Record<CalloutTone, string> = {
    info: 'Note',
    success: 'Done',
    warning: 'Heads up',
    danger: 'Problem',
    neutral: 'Note',
  };
  const toneClass = tone === 'neutral' ? 'cv-callout--neutral' : `mc-callout--${tone}`;
  return (
    <div
      className={`mc-callout ${toneClass} cv-callout`}
      role={tone === 'danger' ? 'alert' : 'status'}
      style={style}
    >
      <span className="mc-callout__label">{icon ?? label[tone]}</span>
      <div className="mc-callout__body">
        {title ? <strong className="mc-callout__title">{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export type TableColumnAlign = 'left' | 'center' | 'right';
export type TableRowTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export type TableProps = {
  headers: ReactNode[];
  rows: ReactNode[][];
  columnAlign?: Array<TableColumnAlign | undefined>;
  rowTone?: Array<TableRowTone | undefined>;
  framed?: boolean;
  striped?: boolean;
  stickyHeader?: boolean;
  style?: CSSProperties;
  emptyMessage?: ReactNode;
};
export function Table({
  headers,
  rows,
  columnAlign,
  rowTone,
  framed = true,
  striped = false,
  stickyHeader = false,
  style,
  emptyMessage,
}: TableProps) {
  const theme = useHostTheme();
  const toneDot = (tone: TableRowTone | undefined) => {
    if (!tone) return null;
    const colors: Record<TableRowTone, string> = {
      success: theme.category.green,
      danger: theme.category.red,
      warning: theme.category.yellow,
      info: theme.category.blue,
      neutral: theme.category.gray,
    };
    return (
      <span className="cv-table__dot" style={{ background: colors[tone] }} aria-hidden="true" />
    );
  };
  return (
    <div className={framed ? 'cv-table-wrap cv-table-wrap--framed' : 'cv-table-wrap'} style={style}>
      <table className={striped ? 'cv-table cv-table--striped' : 'cv-table'}>
        <thead className={stickyHeader ? 'cv-table__head--sticky' : undefined}>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ textAlign: columnAlign?.[i] ?? 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && emptyMessage !== undefined ? (
            <tr>
              <td colSpan={headers.length} className="cv-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, r) => (
              <tr key={r}>
                {headers.map((_, c) => (
                  <td key={c} style={{ textAlign: columnAlign?.[c] ?? 'left' }}>
                    {c === 0 ? toneDot(rowTone?.[r]) : null}
                    {row[c]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export type CollapsibleSectionProps = {
  title: string;
  leading?: ReactNode;
  count?: number;
  trailing?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  style?: CSSProperties;
};
export function CollapsibleSection({
  title,
  leading,
  count,
  trailing,
  children,
  defaultOpen = false,
  style,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="cv-collapsible" style={style}>
      <button type="button" className="cv-collapsible__header" onClick={() => setOpen((v) => !v)}>
        <CanvasChevron expanded={open} />
        {leading ? <span className="cv-collapsible__leading">{leading}</span> : null}
        <span className="cv-collapsible__title">{title}</span>
        {count !== undefined ? <span className="cv-collapsible__count">{count}</span> : null}
        {trailing ? <span className="cv-collapsible__trailing">{trailing}</span> : null}
      </button>
      {open ? <div className="cv-collapsible__body">{children}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* UsageBar                                                            */
/* ------------------------------------------------------------------ */

export interface UsageBarSegment {
  readonly id: string;
  readonly value: number;
  readonly color?: Color;
}
export type UsageBarProps = {
  readonly segments: readonly UsageBarSegment[];
  readonly total: number;
  readonly topLeftLabel?: ReactNode;
  readonly topRightLabel?: ReactNode;
  readonly style?: CSSProperties;
};
const usageColorSequence: readonly Color[] = [
  'gray',
  'purple',
  'green',
  'yellow',
  'pink',
  'blue',
  'orange',
  'red',
  'cyan',
];
export function UsageBar({ segments, total, topLeftLabel, topRightLabel, style }: UsageBarProps) {
  const theme = useHostTheme();
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1;
  return (
    <div className="cv-usagebar" style={style}>
      {topLeftLabel !== undefined || topRightLabel !== undefined ? (
        <div className="cv-usagebar__labels">
          <span>{topLeftLabel}</span>
          <span>{topRightLabel}</span>
        </div>
      ) : null}
      <div className="cv-usagebar__track">
        {segments.map((seg, i) => {
          const value = Number.isFinite(seg.value) && seg.value > 0 ? seg.value : 0;
          if (value === 0) return null;
          const color =
            theme.category[seg.color ?? usageColorSequence[i % usageColorSequence.length]!];
          return (
            <span
              key={seg.id}
              className="cv-usagebar__segment"
              style={{ width: `${Math.min(100, (value / safeTotal) * 100)}%`, background: color }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */

export type ChartTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export type ChartDataPoint = { label: string; value: number };
export type ChartSeries = { name: string; data: number[]; tone?: ChartTone };
export type ChartReferenceLine = { value: number; label?: string; tone?: ChartTone };

const chartToneColor = (
  theme: CanvasHostTheme,
  tone: ChartTone | undefined,
  index: number,
): string => {
  if (tone) {
    const map: Record<ChartTone, string> = {
      success: theme.category.green,
      danger: theme.category.red,
      warning: theme.category.yellow,
      info: theme.category.blue,
      neutral: theme.category.gray,
    };
    return map[tone];
  }
  const sequence = [
    theme.category.green,
    theme.category.blue,
    theme.category.purple,
    theme.category.orange,
    theme.category.pink,
    theme.category.cyan,
    theme.category.yellow,
    theme.category.red,
  ];
  return sequence[index % sequence.length]!;
};

type ValueAxisProps = {
  beginAtZero?: boolean;
  yMin?: number;
  yMax?: number;
  referenceLines?: ChartReferenceLine[];
};

const computeDomain = (
  series: ChartSeries[],
  { beginAtZero = true, yMin, yMax }: ValueAxisProps,
): [number, number] => {
  const values = series.flatMap((s) => s.data).filter((v) => Number.isFinite(v));
  let lo = Math.min(0, ...values);
  let hi = Math.max(0, ...values);
  if (!beginAtZero && values.length > 0) {
    lo = Math.min(...values);
    hi = Math.max(...values);
  }
  if (yMin !== undefined) lo = yMin;
  if (yMax !== undefined) hi = yMax;
  if (hi === lo) hi = lo + 1;
  return [lo, hi];
};

const formatTick = (v: number): string =>
  Math.abs(v) >= 1000
    ? `${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k`
    : `${Math.round(v * 100) / 100}`;

const CHART_W = 720;
const PAD_LEFT = 46;
const PAD_RIGHT = 12;
const PAD_TOP = 16;
const PAD_BOTTOM = 34;

function ChartFrame({
  height,
  theme,
  domain,
  children,
  categories,
  xForCategory,
}: {
  height: number;
  theme: CanvasHostTheme;
  domain: [number, number];
  children: ReactNode;
  categories: string[];
  xForCategory: (index: number) => number;
}) {
  const [lo, hi] = domain;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const yFor = (v: number) => PAD_TOP + plotH - ((v - lo) / (hi - lo)) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${height}`}
      width="100%"
      role="img"
      style={{ display: 'block', fontFamily: 'var(--mc-font-body)' }}
    >
      {ticks.map((t, i) => (
        <g key={i}>
          <line
            x1={PAD_LEFT}
            x2={CHART_W - PAD_RIGHT}
            y1={yFor(t)}
            y2={yFor(t)}
            stroke={theme.stroke.tertiary}
            strokeWidth={1}
          />
          <text
            x={PAD_LEFT - 6}
            y={yFor(t) + 3.5}
            textAnchor="end"
            fontSize={11}
            fill={theme.text.tertiary}
          >
            {formatTick(t)}
          </text>
        </g>
      ))}
      {categories.map((c, i) => (
        <text
          key={i}
          x={xForCategory(i)}
          y={height - PAD_BOTTOM + 16}
          textAnchor="middle"
          fontSize={11}
          fill={theme.text.secondary}
        >
          {c.length > 14 ? `${c.slice(0, 13)}…` : c}
        </text>
      ))}
      {children}
    </svg>
  );
}

function ChartLegend({ series, theme }: { series: ChartSeries[]; theme: CanvasHostTheme }) {
  if (series.length < 2) return null;
  return (
    <div className="cv-chart__legend">
      {series.map((s, i) => (
        <span key={s.name} className="cv-chart__legend-item">
          <span
            className="cv-chart__legend-dot"
            style={{ background: chartToneColor(theme, s.tone, i) }}
          />
          {s.name}
        </span>
      ))}
    </div>
  );
}

export type BarChartProps = ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  normalized?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  style?: CSSProperties;
};
export function BarChart({
  categories,
  series,
  height = 220,
  valueSuffix = '',
  valuePrefix = '',
  showValues,
  style,
  ...axis
}: BarChartProps) {
  const theme = useHostTheme();
  const domain = computeDomain(series, axis);
  const [lo, hi] = domain;
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const yFor = (v: number) => PAD_TOP + plotH - ((v - lo) / (hi - lo)) * plotH;
  const slotW = plotW / Math.max(1, categories.length);
  const groupW = slotW * 0.68;
  const barW = groupW / Math.max(1, series.length);
  const labelBars = showValues ?? (series.length === 1 && categories.length <= 8);
  return (
    <div className="cv-chart" style={style}>
      <ChartLegend series={series} theme={theme} />
      <ChartFrame
        height={height}
        theme={theme}
        domain={domain}
        categories={categories}
        xForCategory={(i) => PAD_LEFT + slotW * i + slotW / 2}
      >
        {categories.map((_, ci) =>
          series.map((s, si) => {
            const v = s.data[ci] ?? 0;
            const x = PAD_LEFT + slotW * ci + (slotW - groupW) / 2 + barW * si;
            const y0 = yFor(Math.max(lo, 0));
            const y1 = yFor(v);
            const barTop = Math.min(y0, y1);
            const barH = Math.max(1.5, Math.abs(y0 - y1));
            const color = chartToneColor(theme, s.tone, si);
            return (
              <g key={`${ci}-${si}`}>
                <rect
                  x={x + 1}
                  y={barTop}
                  width={Math.max(2, barW - 2)}
                  height={barH}
                  rx={3}
                  fill={color}
                />
                {labelBars ? (
                  <text
                    x={x + barW / 2}
                    y={barTop - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill={theme.text.secondary}
                  >
                    {valuePrefix}
                    {v}
                    {valueSuffix}
                  </text>
                ) : null}
              </g>
            );
          }),
        )}
      </ChartFrame>
    </div>
  );
}

export type LineChartProps = ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  fill?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  showHoverGuide?: boolean;
  style?: CSSProperties;
};
export function LineChart({
  categories,
  series,
  height = 220,
  fill = false,
  valueSuffix = '',
  valuePrefix = '',
  showValues = false,
  style,
  ...axis
}: LineChartProps) {
  const theme = useHostTheme();
  const gradientId = useId();
  const domain = computeDomain(series, axis);
  const [lo, hi] = domain;
  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const yFor = (v: number) => PAD_TOP + plotH - ((v - lo) / (hi - lo)) * plotH;
  const xFor = (i: number) =>
    categories.length <= 1
      ? PAD_LEFT + plotW / 2
      : PAD_LEFT + (plotW * i) / (categories.length - 1);
  return (
    <div className="cv-chart" style={style}>
      <ChartLegend series={series} theme={theme} />
      <ChartFrame
        height={height}
        theme={theme}
        domain={domain}
        categories={categories}
        xForCategory={xFor}
      >
        {series.map((s, si) => {
          const color = chartToneColor(theme, s.tone, si);
          const pts = s.data.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
          const areaPts = `${PAD_LEFT},${yFor(Math.max(lo, 0))} ${pts} ${xFor(s.data.length - 1)},${yFor(Math.max(lo, 0))}`;
          return (
            <g key={s.name}>
              {fill ? <polygon points={areaPts} fill={color} opacity={0.12} /> : null}
              <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeLinejoin="round"
                id={`${gradientId}-${si}`}
              />
              {s.data.map((v, i) => (
                <g key={i}>
                  <circle cx={xFor(i)} cy={yFor(v)} r={3.2} fill={color} />
                  {showValues && categories.length <= 20 ? (
                    <text
                      x={xFor(i)}
                      y={yFor(v) - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fill={theme.text.secondary}
                    >
                      {valuePrefix}
                      {v}
                      {valueSuffix}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          );
        })}
      </ChartFrame>
    </div>
  );
}
