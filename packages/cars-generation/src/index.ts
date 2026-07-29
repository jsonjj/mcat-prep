/**
 * CARS passage-and-item generation.
 *
 * Design and evidence base:
 *  - `docs/research/cars-item-design/00-README.md` — what a CARS item is, officially.
 *  - `docs/research/item-generation/00-README.md` — how items get generated and screened.
 *  - `docs/design/cars-generation.md` — how this package implements both.
 *
 * Nothing here sets an answer key, approves content, or awards mastery. Generated items
 * are candidates; a human approves the blueprint before generation and reviews anything
 * the harness flags after it.
 */

export * from './taxonomy';
export * from './archetypes';
export * from './distractors';
export * from './calibration';
export * from './blueprint';
export * from './schema';
export * from './prompts';
export * from './pipeline';
export * from './checks/report';
export * from './checks/deterministic';
export * from './checks/originality';
export * from './checks/solver';
export { EXAMPLE_BLUEPRINT, EXAMPLE_SET, EXAMPLE_PARAGRAPHS } from './fixtures/example-set';
