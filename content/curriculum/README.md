# Curriculum ledger

The learner-facing layer is **15 skill clusters**; the graded, evidence-bearing unit is the **internal skill**. The internal skill graph (skills, objectives, prerequisites, evidence recipes, coverage obligations) is a versioned record validated for hard-prerequisite acyclicity by `@mcat/domain` (`findHardPrerequisiteCycle`) and consumed by the engine.

The complete official-blueprint ledger and full internal-skill DAG are an owner-approved, human-authored deliverable (Phase 2/8). This repository ships:

- the 15 clusters, sections, operation tags, and distractor vocabulary (`@mcat/contracts/vocab`);
- a working, schema-valid **synthetic** slice (BB1 enzyme kinetics → inhibition) in `@mcat/content` to prove the pipeline end-to-end;
- the folder contract and templates under `content/question-bank/`.

## Clusters

R1 Quantitative Reasoning · R2 Data & Representations · R3 Experiments & Evidence · CP1 Mechanics & Fluids · CP2 Electricity, Waves & Optics · CP3 Chemical Systems · BB1 Biomolecules & Metabolism · BB2 Cells & Genetics · BB3 Signaling & Organ Systems · BB4 Immunity & Development · PS1 Research & Statistics · PS2 Mind & Behavior · PS3 People & Society · CA1 Passage Structure & Evidence · CA2 Inference & Argument.

## Operation tags

`K` knowledge use · `Q` quantitative · `E` experiment/evidence · `D` data/representation translation · `P` passage control · `A` CARS argument · `I` integrated · `T` timed endurance.

## Prohibited

No cluster/skill definition may be derived from copyrighted reference material. Objectives and coverage come from the official AAMC content outline and independent authoring.
