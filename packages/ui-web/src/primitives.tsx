import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react';

/** Content visible only to assistive tech. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="mc-visually-hidden">{children}</span>;
}

/** Keyboard skip link; becomes visible on focus. */
export function SkipLink({ targetId = 'main', children = 'Skip to main content' }: { targetId?: string; children?: ReactNode }) {
  return (
    <a className="mc-skip-link" href={`#${targetId}`}>
      {children}
    </a>
  );
}

interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  as?: ElementType;
  children: ReactNode;
}

/** Vertical flow with a token gap. */
export function Stack({ gap = 4, as: Tag = 'div', style, children, ...rest }: StackProps) {
  const s: CSSProperties = { display: 'flex', flexDirection: 'column', gap: `var(--mc-space-${gap})`, ...style };
  return (
    <Tag style={s} {...rest}>
      {children}
    </Tag>
  );
}

/** Horizontal flow that wraps. */
export function Inline({ gap = 3, as: Tag = 'div', style, children, ...rest }: StackProps) {
  const s: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: `var(--mc-space-${gap})`,
    ...style,
  };
  return (
    <Tag style={s} {...rest}>
      {children}
    </Tag>
  );
}

export function Card({
  children,
  elevated = true,
  as: Tag = 'section',
  className = '',
  ...rest
}: HTMLAttributes<HTMLElement> & { children: ReactNode; elevated?: boolean; as?: ElementType }) {
  return (
    <Tag className={`mc-card ${elevated ? 'mc-card--elevated' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

/** Non-decorative status message. Tone is conveyed by icon + label, not color alone. */
export function Callout({ tone = 'info', title, children }: { tone?: CalloutTone; title?: string; children: ReactNode }) {
  const label: Record<CalloutTone, string> = {
    info: 'Note',
    success: 'Done',
    warning: 'Heads up',
    danger: 'Problem',
  };
  return (
    <div className={`mc-callout mc-callout--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="mc-callout__label">{label[tone]}</span>
      <div className="mc-callout__body">
        {title ? <strong className="mc-callout__title">{title}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="mc-eyebrow">{children}</p>;
}
