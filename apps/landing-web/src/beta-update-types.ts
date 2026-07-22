export const BETA_UPDATE_SOURCES = [
  'header',
  'hero',
  'snapshot-section',
  'snapshot-intro',
  'snapshot-report',
  'final',
  'footer',
] as const;

export type BetaUpdateSource = (typeof BETA_UPDATE_SOURCES)[number];
