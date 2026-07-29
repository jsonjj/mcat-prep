/**
 * Programmatic token references. The canonical theming source is `tokens.css`
 * (custom properties); these string references let TS code (charts, canvas,
 * inline styles) read the same variables without hard-coding hex values.
 */
export type ThemeName = 'light' | 'dark';

export const cssVar = (name: string): string => `var(--mc-${name})`;

export const color = {
  canvas: cssVar('canvas'),
  surface: cssVar('surface'),
  surface2: cssVar('surface-2'),
  ink: cssVar('ink'),
  inkMuted: cssVar('ink-muted'),
  border: cssVar('border'),
  primary: cssVar('primary'),
  primaryText: cssVar('primary-text'),
  onPrimary: cssVar('on-primary'),
  info: cssVar('info'),
  retained: cssVar('retained'),
  warning: cssVar('warning'),
  danger: cssVar('danger'),
  focus: cssVar('focus'),
} as const;

export const space = (step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): string => cssVar(`space-${step}`);

export const font = {
  display: cssVar('font-display'),
  body: cssVar('font-body'),
  mono: cssVar('font-mono'),
} as const;
