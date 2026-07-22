export type ChoiceId = 'A' | 'B' | 'C' | 'D';

export type SnapshotVisualId =
  | 'lineweaver'
  | 'reaction-coordinate'
  | 'western-blot'
  | 'dose-response'
  | 'initial-rates'
  | 'pulse-chase';

export interface SnapshotChoice {
  id: ChoiceId;
  text: string;
}

export interface SnapshotQuestion {
  id: string;
  domain: string;
  skillLabel: string;
  passage?: string;
  stimulus?: string;
  visual?: SnapshotVisualId;
  stem: string;
  choices: SnapshotChoice[];
}

export interface SnapshotResponse {
  questionId: string;
  choiceId: ChoiceId;
}

export interface SnapshotSubmission {
  attemptToken: string;
  responses: SnapshotResponse[];
}

export type SignalState = 'limited-positive' | 'mixed' | 'drill-target';

export interface SnapshotSignal {
  id: string;
  label: string;
  state: SignalState;
  title: string;
  body: string;
}

export interface SnapshotPattern {
  kind: 'positive' | 'friction' | 'none';
  title: string;
  body: string;
}

export interface SnapshotReport {
  version: 'snapshot-pilot-v2';
  repeatedPattern: SnapshotPattern;
  pairedSignals: SnapshotSignal[];
  unknowns: string[];
  nextDrill: {
    title: string;
    body: string;
  };
  disclaimer: string;
}
