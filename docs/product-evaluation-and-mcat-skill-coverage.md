# MCAT Mastery: Product Evaluation and MCAT Blueprint Coverage

**Assessment date:** 2026-07-21  
**Repository baseline:** `main` at `f8e74d7`  
**Inputs:** current repository, product requirements document, MCAT Mastery Brainlift, and current official AAMC MCAT materials  
**Purpose:** consolidate the product review and determine whether the proposed 15 skill clusters cover the MCAT

## Executive conclusion

MCAT Mastery has a strong architectural and policy foundation for a prototype, but it is not yet a complete MVP or a release-ready MCAT course. The repository proves one coherent synthetic learning vertical—BB1 enzyme inhibition—inside a polished learner shell. It does not yet prove the production backend, full curriculum, content-review operation, adaptive plan, protected-content boundary, or broad assessment coverage described by the PRD and Brainlift.

The 15 skill clusters should be retained as learner-facing navigation, with clearer names and scope. At that level, every official AAMC foundational concept and reasoning category has a plausible home. The clusters do **not**, by themselves, prove complete MCAT coverage. Several are overloaded, several important requirements are hidden by broad labels, and the current repository has no complete topic/subtopic-to-assessment ledger. The shipped curriculum remains intentionally synthetic and covers only two internal skills in BB1.

| Dimension               | Verdict                                   | Reason                                                                                                                                                           |
| ----------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Strong prototype foundation               | Clear contracts, domain policies, authority port, content compiler, and dependency boundaries                                                                    |
| PRD completeness        | Early vertical slice                      | Most production capabilities are absent, local-only, static, or represented by policy code rather than a complete user workflow                                  |
| Brainlift alignment     | Strong in philosophy, narrow in execution | Evidence-based mastery, Diagnose-Before-Reveal, ghost pacing, and AI authority boundaries are visible, but only in a tiny synthetic slice                        |
| 15-cluster taxonomy     | Good navigation shell                     | All official domains can be assigned, but names, ownership, weighting, and cross-section reasoning need correction                                               |
| Auditable MCAT coverage | Not established                           | No complete official topic/subtopic ledger, full skill DAG, production item bank, or coverage evidence exists                                                    |
| Release readiness       | Not ready                                 | The browser bundle contains answer-bearing synthetic content, the authority is in-process, and production identity, storage, sync, and review systems are absent |

## 1. Scope, evidence standard, and terminology

This assessment distinguishes three different questions that must not be collapsed:

1. **Taxonomy containment:** Can an official MCAT requirement plausibly fit under one of the 15 labels?
2. **Curriculum coverage:** Is every official requirement explicitly mapped to an internal skill, objective, lesson, and assessment?
3. **Implemented coverage:** Does the current application actually teach and assess that requirement with reviewed content?

The answer is:

- taxonomy containment: broadly yes;
- curriculum coverage: not yet demonstrated; and
- implemented coverage: no—the current bank is a synthetic BB1 enzyme-inhibition slice.

The assessment used repository code and documentation as evidence. A feature described only in a plan or ADR is not counted as implemented. A broad cluster title is not counted as covering every topic that could fit beneath it. A policy with unit tests is counted as implemented policy logic, but not as a complete production workflow unless the learner path exercises it.

No runtime code was changed for this assessment. This document is the only repository addition.

## 2. What exists today

### 2.1 Repository and architecture

The repository is a TypeScript monorepo using pnpm workspaces and Turborepo.

| Area                | Current implementation                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Learner application | React, Vite, React Router, TanStack Query, reusable design-system components, PWA manifest, and service worker |
| Admin application   | Read-only bank and metadata inspection                                                                         |
| Contracts           | Branded IDs, API/event schemas, vocabulary, error contracts, and shared types                                  |
| Domain              | Evidence, mastery-state, skill-graph, FSRS, planning, assistance, and related domain models                    |
| Policies            | Diagnostic, mastery, planning, assistance, and ghost-pacing policies with version manifests                    |
| Content             | Zod schemas, compiler, learner/protected payload separation, validation, and a synthetic enzyme bank           |
| Authority           | In-process authoritative engine behind an `AuthorityPort`                                                      |
| Persistence         | Whole learner state stored in browser `localStorage`, with an in-memory fallback                               |
| AI                  | Development-only CARS chat path and safety-oriented prompt/response handling                                   |
| Production services | No API service, Lambda, database, Cognito integration, infrastructure-as-code, or server-side event store      |

The intended boundary is sound: clients should receive learner-safe payloads, while scoring keys and protected content remain authoritative. The current local adapter deliberately collapses that boundary by running the authority and loading the full synthetic bank in the browser. That is acceptable only as an explicit development compromise.

### 2.2 Current learner journey

The working path is:

1. create or resume a local guest;
2. answer one synthetic diagnostic probe;
3. confirm a goal and weekly minutes;
4. see a hard-coded enzyme-inhibition task and quick-practice task;
5. progress through a lesson, independent questions, transfer questions, a passage, a simulation placeholder, a protected question, and recall;
6. diagnose a probable cause before reveal after an error;
7. view basic evidence, error-log, and ghost/readiness summaries.

This is a coherent proof of architecture. It is not yet an adaptive, full-MCAT plan.

### 2.3 Verification performed

After installing the repository-pinned dependencies, the following direct checks passed:

- ESLint;
- recursive package type-checking;
- Vitest: 19 test files and 67 tests;
- recursive package builds;
- Prettier check; and
- the current protected-field scanner.

The root aggregate Turbo command could not locate a `pnpm` binary in the nested Corepack environment, while equivalent direct package commands succeeded. This is a tooling portability issue rather than evidence of a source-code build failure.

Important limits on those green checks:

- there is no browser end-to-end suite;
- there are no component tests;
- there is no automated accessibility suite;
- the scanner checks tracked path patterns and a canary, not built learner bundles or arbitrary key/rationale fields; and
- direct inspection of the built learner JavaScript found `correct_choice_id` and synthetic protected-question material.

## 3. Product assessment against the PRD

Status meanings:

- **Implemented:** usable and materially aligned;
- **Partial:** real implementation with substantial missing scope;
- **Placeholder:** visible shell or static stand-in;
- **Not built:** no meaningful implementation found;
- **Contradiction:** current behavior conflicts with a stated requirement or boundary.

| PRD capability                             | Status                       | Evidence and gap                                                                                                                                   |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo, contracts, and module boundaries | Implemented                  | Clean package separation, architecture tests, shared schemas, and policy manifests                                                                 |
| Responsive learner shell and visual system | Implemented                  | Consistent tokens, components, screen layouts, reduced-motion handling, and responsive CSS                                                         |
| Authentication and identity                | Placeholder                  | Local guest identity only; no Cognito, account linking, or authenticated session lifecycle                                                         |
| Diagnostic placement                       | Partial                      | Real no-feedback placement flow, but it uses one fixed probe rather than a representative adaptive diagnostic                                      |
| Goal and capacity intake                   | Partial                      | Test date, target score, and weekly minutes are captured; capacity thresholds use provisional hard-coded workload estimates                        |
| Today plan                                 | Placeholder                  | One hard-coded enzyme task plus quick practice; no full prerequisite, freshness, breadth, or calendar scheduling                                   |
| Lesson-to-evidence study loop              | Partial                      | Strong synthetic path with independent, transfer, passage, protected, and recall phases; only one topic is available                               |
| Diagnose-Before-Reveal                     | Implemented                  | Cause selection precedes reveal for errors, with event and error-log support                                                                       |
| Assistance ladder                          | Partial                      | Assistance contracts and policy exist; the learner experience does not yet provide the complete hint/AI-assisted ladder                            |
| Evidence-based mastery                     | Partial                      | Versioned evidence recipes and freshness overlay are well designed; current content cannot exercise the full retained/strong ladder                |
| Transfer and interleaving                  | Partial                      | Transfer dimensions and item phases exist in the synthetic path; no broad cross-topic interleaving planner exists                                  |
| FSRS scheduling                            | Partial                      | Scheduling logic and tests exist, with limited recall-step integration; there is no complete review queue feeding Today                            |
| Ghost pacing                               | Partial                      | Real deterministic calculations and projections exist, but inputs and progress breadth are synthetic                                               |
| Readiness and analytics                    | Placeholder                  | Basic counts and summaries exist; no calibrated score model, section projection, uncertainty model, or longitudinal analytics                      |
| Error log and repair loop                  | Partial                      | Error cause and repair status are represented; broad repair scheduling and recurrence analysis are not complete                                    |
| Interactive simulations                    | Placeholder                  | The study step displays explanatory text and a continue button; there is no interactive model                                                      |
| CARS training                              | Partial                      | A CARS Duel route, AI gateway, and guardrails exist; it is hidden from normal navigation, development-only, and not a full CARS curriculum         |
| Notifications and reminders                | Placeholder                  | Permission request and transient UI message exist; no durable notification scheduler or service exists                                             |
| Offline support                            | Partial                      | Shell caching and local state support a demo; no IndexedDB event queue, server reconciliation, or authoritative offline sync                       |
| Accessibility                              | Partial                      | Good semantic and CSS foundations, focus styling, contrast intent, and reduced-motion support; no automated or manual WCAG audit evidence          |
| Privacy, export, and deletion              | Not built                    | No user-facing export, delete, consent, retention, or account data-management flow                                                                 |
| Content schemas and compilation            | Implemented foundation       | Strong learner/protected separation at compile boundaries and useful validation                                                                    |
| Official curriculum ledger                 | Not built                    | Repository documentation explicitly says the complete official-blueprint ledger and full internal-skill DAG are future human-authored deliverables |
| Production content bank                    | Not built                    | The canonical bank is synthetic; root candidate files are disconnected from the canonical pipeline                                                 |
| Human review and publishing workflow       | Placeholder                  | Status fields and governance documentation exist; the admin app cannot import, blind-solve, approve, version, or publish content                   |
| Production authority and storage           | Not built                    | No server-side API, database, authoritative event stream, idempotent sync endpoint, or infrastructure                                              |
| Protected-content delivery                 | Contradiction in local build | Compiler boundaries are sound, but the full synthetic bank and answer material are bundled into learner JavaScript                                 |
| Observability and operations               | Not built                    | No production logging, metrics, tracing, alerting, release dashboard, or incident workflow                                                         |
| Test and release gates                     | Partial                      | Strong policy/domain/unit and architecture tests; no E2E, UI integration, accessibility, visual-regression, or bundle-leak gate                    |

## 4. Alignment with the Brainlift

| Brainlift principle or thesis                                                                  | Assessment                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Optimize for durable evidence, not content completion                                          | Strongly represented in the evidence and mastery models; not yet proven across a real curriculum                       |
| Diagnose before revealing the answer                                                           | One of the strongest implemented product ideas                                                                         |
| Mastery requires independent, transfer, delayed, mixed, passage, timed, and protected evidence | Encoded in the strong-mastery recipe; the current path cannot collect all required evidence kinds                      |
| Preserve learning history while marking stale knowledge                                        | Implemented through base mastery plus a `refreshNeeded` overlay                                                        |
| Plan from prerequisites, freshness, capacity, and test date                                    | Policy vocabulary exists, but the learner plan is currently hard-coded                                                 |
| Show honest pacing through a ghost learner                                                     | Deterministic ghost math exists; output quality is limited by synthetic coverage and workload assumptions              |
| Use simulations as conceptual atoms, then verify with unseen transfer                          | The principle appears in copy and sequencing, but the simulation itself is static                                      |
| AI may assist but must not own scoring, mastery, scheduling, or truth                          | Good architectural boundary and CARS safety framing; production isolation is not implemented                           |
| Human-authored, provenance-aware content with independent review                               | Schemas and governance documents anticipate this; the operational review pipeline is absent                            |
| Minimize cognitive load and avoid generic dashboard design                                     | The frontend is focused, consistent, and visibly aligned with the design brief                                         |
| Build accessibility and alternatives into the learning experience                              | Good initial UI foundations; simulations, charts, and full workflows still need equivalent alternatives and validation |
| Do not claim readiness without representative evidence                                         | At risk: summary surfaces can appear more complete than the one-topic synthetic bank warrants                          |

The app therefore embodies the Brainlift's decision rules better than it fulfills the PRD's production scope. The central problem is not conceptual direction; it is the gap between policy architecture and real breadth, authority, content operations, and verification.

## 5. Highest-priority findings

### 5.1 Release and trust blockers

1. **Answer-bearing content is in the learner bundle.**  
   `packages/authority-core` imports `loadSyntheticBank`, and the learner uses the local authority. The production build therefore contains `correct_choice_id`, rationales, and protected synthetic question material. The current scanner explicitly defers bundle scanning. Synthetic content reduces immediate intellectual-property impact, but the architecture would expose real answer keys if production content were substituted without first moving authority and protected content server-side.

2. **The production authority does not exist.**  
   There is no API, identity provider integration, database, event stream, optimistic-concurrency implementation, or protected-content service. Browser `localStorage` stores the complete mutable learner state. Several schemas and comments describe the future event-sourced system, but the current authority directly mutates sessions and evidence and records only selected actions as events.

3. **The 132 root candidate items are outside the canonical content pipeline.**  
   `question-bank/cars-passed-candidates.jsonl` contains 42 records and `question-bank/other-passed-candidates.jsonl` contains 90. They include proposed keys and option rationales, are not referenced by the canonical compiler, and are not covered by a meaningful key/rationale scanner. Their presence does not establish improper provenance, but provenance, independent solve, review status, ownership, and publication eligibility must be resolved before they are used.

4. **There is no complete official-blueprint ledger.**  
   The repository has 15 cluster labels but only a small synthetic internal-skill graph. Without a leaf-level official obligation ledger, neither content completeness nor balanced assessment coverage can be measured.

### 5.2 Product blockers

1. The diagnostic, Today plan, study queue, and readiness outputs are driven by a single hard-coded enzyme path.
2. The 15-cluster interface suggests breadth that the underlying content does not have.
3. CARS and several learner screens exist as routes but are absent from primary navigation.
4. Simulations and reminders are placeholders rather than functioning systems.
5. The admin application cannot perform the content-review and publishing work assumed by governance documents.
6. There is no account, sync, export, deletion, telemetry, or production support path.
7. The design has not been verified with browser E2E, representative devices, screen readers, keyboard-only use, or automated accessibility testing.

### 5.3 Policy and modeling limitations

1. Policy implementations are versioned but explicitly provisional; hard-coded workload and freshness constants are not calibrated.
2. The current learning path does not produce delayed, mixed, and timed evidence, so it cannot demonstrate retained or strong mastery end to end.
3. A full event-replay model is described but not implemented: state and evidence are persisted directly alongside an incomplete event log.
4. The singular `section` field in cluster metadata puts R1–R3 under C/P even though official scientific reasoning applies to C/P, B/B, and P/S.
5. Equal treatment of 15 clusters would be invalid because the official blueprint weights sections, foundational concepts, disciplines, and reasoning categories—not learner navigation tiles.

## 6. Official MCAT blueprint used for the skill audit

Research used current AAMC pages and AAMC-hosted outline PDFs, accessed 2026-07-21. The live pages still present the linked outline as the complete competency description. Percentages are approximate, rounded to the nearest 5%, and may vary by test form. AAMC does not publish weights for individual content categories, so this report does not invent them.

### 6.1 Exam sections

| Section                                                             | Questions |   Time | Format                                        |
| ------------------------------------------------------------------- | --------: | -----: | --------------------------------------------- |
| Chemical and Physical Foundations of Biological Systems (C/P)       |        59 | 95 min | Passage-based sets plus independent questions |
| Critical Analysis and Reasoning Skills (CARS)                       |        53 | 90 min | Nine passage-based sets                       |
| Biological and Biochemical Foundations of Living Systems (B/B)      |        59 | 95 min | Passage-based sets plus independent questions |
| Psychological, Social, and Biological Foundations of Behavior (P/S) |        59 | 95 min | Passage-based sets plus independent questions |

### 6.2 Scientific Inquiry and Reasoning Skills

The same skill distribution applies separately to C/P, B/B, and P/S.

| Official skill                                          | Approximate weight | Required capability                                                                               | Current likely home                    |
| ------------------------------------------------------- | -----------------: | ------------------------------------------------------------------------------------------------- | -------------------------------------- |
| SIRS 1: Knowledge of Scientific Concepts and Principles |                35% | Understand concepts and identify relationships among them, including representations              | Content clusters plus `K`; parts of R2 |
| SIRS 2: Scientific Reasoning and Problem-Solving        |                45% | Reason with principles, theories, models, explanations, predictions, causal claims, and formulas  | R1, R3, and all content clusters       |
| SIRS 3: Design and Execution of Research                |                10% | Hypotheses, variables, controls, sampling, measurement, design, validity, limitations, and ethics | R3; P/S-context application in PS1     |
| SIRS 4: Data-Based and Statistical Reasoning            |                10% | Interpret tables/figures/graphs, statistics, uncertainty, and evidence-bounded conclusions        | R2; P/S-context application in PS1     |

These are cross-cutting dimensions, not separate science content domains. A science question or objective needs both a content mapping and a reasoning mapping.

### 6.3 General mathematical requirements

Across C/P, B/B, and P/S, AAMC explicitly requires:

1. linear, semilog, and log-log scales and slope calculation;
2. significant digits and reasonable numerical estimation;
3. metric conversions and dimensional analysis;
4. probability, proportion, ratio, percentage, and square-root estimation;
5. Algebra II-level exponentials, natural and base-10 logarithms, scientific notation, and simultaneous equations;
6. basic and inverse trigonometry, specified standard angles, and 30°/45°/60° right triangles; and
7. vector addition/subtraction and the right-hand rule.

Calculus is not required, and a periodic table is supplied.

### 6.4 Science content framework

#### Biological and Biochemical Foundations

Discipline targets: introductory biology 65%, first-semester biochemistry 25%, general chemistry 5%, and organic chemistry 5%.

| Foundational concept                          | Weight | Official content categories                                                                              | Proposed cluster home |
| --------------------------------------------- | -----: | -------------------------------------------------------------------------------------------------------- | --------------------- |
| FC1: biomolecules and life processes          |    55% | 1A proteins/amino acids; 1B gene-to-protein transfer; 1C heredity/diversity; 1D bioenergetics/metabolism | BB1 and BB2           |
| FC2: cellular and multicellular assemblies    |    20% | 2A cells/assemblies; 2B prokaryotes/viruses; 2C division/differentiation/specialization                  | BB2 and BB4           |
| FC3: integrated organ systems and homeostasis |    25% | 3A nervous/endocrine coordination; 3B main organ systems                                                 | BB3 and BB4           |

#### Chemical and Physical Foundations

Discipline targets: general chemistry 30%, first-semester biochemistry 25%, introductory physics 25%, organic chemistry 15%, and introductory biology 5%.

| Foundational concept                              | Weight | Official content categories                                                                                                                                | Proposed cluster home                 |
| ------------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| FC4: physical principles in living systems        |    40% | 4A motion/forces/work/energy/equilibrium; 4B fluids/circulation/gases; 4C electrochemistry/circuits; 4D light/sound; 4E atomic/nuclear/electronic behavior | CP1, CP2, and CP3                     |
| FC5: chemical interactions and molecular dynamics |    60% | 5A water/solutions; 5B molecules/interactions; 5C separation/purification; 5D biologically relevant molecules; 5E thermodynamics/kinetics                  | CP3, with explicit cross-links to BB1 |

#### Psychological, Social, and Biological Foundations

Discipline targets: introductory psychology 65%, introductory sociology 30%, and introductory biology 5%. AAMC separately notes that about 5% includes biologically relevant psychology.

| Foundational concept                            | Weight | Official content categories                                                 | Proposed cluster home |
| ----------------------------------------------- | -----: | --------------------------------------------------------------------------- | --------------------- |
| FC6: perception, thought, and reaction          |    25% | 6A sensing; 6B making sense of the environment; 6C responding to the world  | PS2                   |
| FC7: behavior and behavior change               |    35% | 7A individual influences; 7B social processes; 7C attitudes/behavior change | PS2 and PS3           |
| FC8: self, others, and interaction              |    20% | 8A self-identity; 8B social thinking; 8C social interactions                | PS3                   |
| FC9: culture, society, and well-being           |    15% | 9A social structure; 9B demographics/processes                              | PS3                   |
| FC10: stratification, resources, and well-being |     5% | 10A social inequality                                                       | PS3                   |

### 6.5 CARS framework

CARS requires no outside content knowledge.

| Official category            | Approximate weight | Required capability                                                                                          |
| ---------------------------- | -----------------: | ------------------------------------------------------------------------------------------------------------ |
| Foundations of Comprehension |                30% | Understand basic text components; infer meaning or intent from immediate context                             |
| Reasoning Within the Text    |                30% | Integrate distant components; recognize and evaluate arguments, claims, evidence, support, and relationships |
| Reasoning Beyond the Text    |                40% | Apply/extrapolate ideas; assess how new information or conditions change passage ideas                       |

Passage content is approximately 50% humanities and 50% social sciences.

## 7. How well the 15 clusters cover the MCAT

### 7.1 Overall verdict

| Coverage question                                                              | Assessment                                                                                   |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Does every official foundational concept have a plausible cluster home?        | Yes                                                                                          |
| Can all 31 official science content categories be assigned to the 15 clusters? | Yes, but several assignments split across clusters and need explicit ownership               |
| Are all four SIRS categories conceptually represented?                         | Broadly yes, but R1–R3 are under-specified and incorrectly scoped to C/P in current metadata |
| Are all explicit math requirements represented?                                | Only partially in current descriptions                                                       |
| Are all three CARS categories representable with CA1/CA2?                      | Yes, if the two halves of Reasoning Within the Text are assigned explicitly                  |
| Are official weights and passage domains represented?                          | Not in the cluster model                                                                     |
| Does the current internal curriculum prove full coverage?                      | No                                                                                           |
| Does the current item bank implement broad MCAT coverage?                      | No; it is a synthetic BB1 slice                                                              |

The accurate conclusion is therefore:

- **high-level thematic coverage:** strong;
- **naming and ownership precision:** moderate;
- **balance and weighting fidelity:** weak without a ledger;
- **reasoning-skill fidelity:** moderate, with repairable scope gaps;
- **implemented curriculum coverage:** intentionally minimal; and
- **auditable completeness:** not established.

No defensible numeric “percent of MCAT covered” can be calculated until official topic and subtopic leaves have stable IDs and are mapped to reviewed learning and assessment evidence.

### 7.2 Cluster-by-cluster mapping

| ID  | Current label                  | Official mapping                                                                                       | Coverage assessment                                                                                           | Recommended learner label                 |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| R1  | Quantitative Reasoning         | SIRS 2 and 4; all official math techniques across C/P, B/B, and P/S                                    | Good umbrella, but current `cp` scope and description omit most explicit math obligations                     | Quantitative and Model-Based Reasoning    |
| R2  | Data and Representations       | SIRS 4 primary; SIRS 1/2 secondary across all science sections                                         | Good umbrella, but current wording undernames statistics, uncertainty, error, and inference                   | Data-Based and Statistical Reasoning      |
| R3  | Experiments and Evidence       | SIRS 3 primary; SIRS 2/4 secondary across all science sections                                         | Good umbrella, but must add sampling, validity, measurement, causation, limitations, and ethics               | Research Design and Scientific Evidence   |
| CP1 | Mechanics and Fluids           | 4A and 4B                                                                                              | Strong grouping; gases and biological circulation/respiration contexts must be explicit                       | Mechanics and Fluids                      |
| CP2 | Electricity, Waves, and Optics | 4C and 4D                                                                                              | Strong grouping; electrochemistry, spectroscopy/imaging, magnetism, and biological signaling must be explicit | Electricity, Waves, and Optics            |
| CP3 | Chemical Systems               | 4E and 5A–5E                                                                                           | Plausible but severely overloaded; title hides atomic/nuclear content and all of FC5                          | Atomic and Chemical Systems               |
| BB1 | Biomolecules and Metabolism    | 1A and 1D                                                                                              | Strong grouping if proteins, enzymes, major pathways, redox, and integrated regulation are explicit           | Biomolecules and Metabolism               |
| BB2 | Cells and Genetics             | 1B, 1C, 2A, 2B, and cell-cycle/cancer portions of 2C                                                   | Plausible but overloaded; microbes, viruses, evolution, division, and cancer are hidden                       | Cells, Genetics, and Microbes             |
| BB3 | Signaling and Organ Systems    | 3A and nonimmune/nonreproductive portions of 3B                                                        | Strong grouping; should explicitly cover integration, homeostasis, muscle, skeletal, and skin systems         | Signaling and Integrated Organ Systems    |
| BB4 | Immunity and Development       | developmental portions of 2C; immune, lymphatic, and reproductive portions of 3B                       | Plausible, but reproduction is an important hidden obligation and ownership overlaps BB2/BB3                  | Immunity, Reproduction, and Development   |
| PS1 | Research and Statistics        | SIRS 3/4 in behavioral and social contexts                                                             | Useful practice cluster, but it is not an independent official P/S content domain and overlaps R2/R3          | Behavioral Research and Statistics        |
| PS2 | Mind and Behavior              | 6A–6C, 7A, and learning-related parts of 7C                                                            | Good umbrella; brain/biological bases, consciousness, language, stress, and disorders should be explicit      | Mind, Brain, and Behavior                 |
| PS3 | People and Society             | 7B, attitude-change parts of 7C, 8A–8C, 9A–9B, and 10A                                                 | Covers the domain but is extremely overloaded and undernamed                                                  | Identity, Social Interaction, and Society |
| CA1 | Passage Structure and Evidence | all Foundations of Comprehension plus integration of distant components from Reasoning Within the Text | Plausible, but “evidence” overlaps CA2 and immediate-context inference is hidden                              | Comprehension and Passage Structure       |
| CA2 | Inference and Argument         | argument evaluation from Reasoning Within the Text plus all Reasoning Beyond the Text                  | Plausible, but application/extrapolation and new-information effects must be explicit                         | Argument Evaluation and Application       |

### 7.3 Requirements hidden or unsupported by the current descriptions

The broad titles could contain these topics, but the current cluster descriptions do not prove that they do:

- semilog/log-log scales, significant figures, estimation, simultaneous equations, trigonometry, vectors, and the right-hand rule;
- research ethics, sampling and generalizability, operationalization, accuracy/precision, reliability/validity, and causal design;
- gas behavior, electrochemistry, spectroscopy, atomic/nuclear processes, stoichiometry, and separation/purification;
- evolution/population genetics, prokaryotes, viruses, cell division, cancer, differentiation, and aging;
- lymphatic, muscular, skeletal, skin, and reproductive systems;
- consciousness, language, stress, biological bases of behavior, socialization, deviance, demographic change, sociological theory, and health disparities;
- CARS immediate-context inference, explicit new-information integration, and the humanities/social-sciences passage mix.

This is not evidence that the product team intended to omit those topics. It is evidence that the labels are too coarse to certify their presence.

### 7.4 Overloaded clusters

The most important balance risks are:

- **CP3:** owns 4E plus all five FC5 categories; FC5 is approximately 60% of C/P.
- **BB2:** spans genetics, molecular biology, cells, microbes, viruses, and part of development.
- **PS3:** owns most social psychology and essentially all sociology across FC8–FC10.
- **PS1:** duplicates R2/R3 unless it is explicitly defined as behavioral/social application rather than separate content.

Cluster counts therefore must not be used as mastery weights. “One of 15 mastered” has no stable relationship to exam coverage.

### 7.5 Overlaps requiring one accountable owner

| Overlap    | Required ownership rule                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R2 vs PS1  | R2 owns cross-science data/statistical operations; PS1 owns application in behavioral/social study contexts                       |
| R3 vs PS1  | R3 owns cross-science research design; PS1 owns P/S-specific methods and examples                                                 |
| CP3 vs BB1 | Assign by official section/category context; preserve explicit cross-links for proteins, enzymes, biomolecules, and bioenergetics |
| BB2 vs BB4 | BB2 owns heredity/cell-cycle context; BB4 owns reproduction, embryogenesis, differentiation, and development context              |
| BB3 vs BB4 | BB3 owns system coordination/homeostasis; BB4 owns immune, lymphatic, reproductive, and developmental obligations                 |
| PS2 vs PS3 | PS2 owns individual cognition/behavior; PS3 owns social processes, identity, institutions, demographics, and inequality           |
| CA1 vs CA2 | CA1 owns comprehension and distant-component integration; CA2 owns argument evaluation and application beyond the text            |
| CP2 vs CP3 | Assign electrochemistry to 4C/CP2 and atomic/nuclear/separation/chemical methods to 4E/5C/CP3                                     |

Where AAMC repeats a topic in distinct official contexts, both obligations must remain. For example, meiosis under heredity/genetic diversity is not interchangeable with gametogenesis under development.

## 8. Recommended 15-cluster specification

Keep the stable IDs, but revise the learner labels and tested descriptions as follows.

### Cross-science reasoning

- **R1 — Quantitative and Model-Based Reasoning:** equations and scientific models; linear, semilog, and log-log scales; slopes; significant digits; estimation; units and dimensional analysis; probability, proportions, ratios, percentages, square-root estimation; exponentials, logarithms, scientific notation, simultaneous equations, basic/inverse trigonometry, vectors, and the right-hand rule.
- **R2 — Data-Based and Statistical Reasoning:** translate among words, equations, diagrams, tables, figures, and graphs; identify patterns; evaluate representations; interpret descriptive statistics, error, uncertainty, statistical significance, confidence intervals, relationships, and evidence-bounded conclusions.
- **R3 — Research Design and Scientific Evidence:** theory, prior findings, observations, questions, and hypotheses; samples, populations, and generalizability; independent, dependent, control, and confounding variables; measurement accuracy, precision, reliability, and validity; temporality, random assignment, association versus causation, limitations, ethics, evidence, and claim scope.

R1–R3 must apply to C/P, B/B, and P/S. The data model should support multiple sections rather than assigning these clusters only to C/P.

### Chemical and physical

- **CP1 — Mechanics and Fluids:** translational and periodic motion; vectors; forces, friction, equilibrium, torque, work, energy, power, mechanical advantage, density, pressure, buoyancy, viscosity, continuity, turbulence, surface tension, Bernoulli flow, and gas behavior in biological systems.
- **CP2 — Electricity, Waves, and Optics:** electrostatics, electric potential, circuits, resistance, capacitance, magnetism, electrochemistry and electrical signaling; sound and electromagnetic radiation; Doppler effect, resonance, interference, diffraction, polarization, spectroscopy/imaging, reflection, refraction, mirrors, lenses, and the eye.
- **CP3 — Atomic and Chemical Systems:** atomic/nuclear structure, decay, electronic structure, periodic trends, and stoichiometry; water, solutions, acids/bases, buffers, and titration; bonding, stereochemistry, intermolecular forces; separation/purification; organic and biologically relevant molecules/reactions; thermodynamics, kinetics, and equilibrium.

### Biological and biochemical

- **BB1 — Biomolecules and Metabolism:** amino acids; protein structure and function; enzyme mechanism, kinetics, inhibition, and regulation; carbohydrates and lipids; ATP/redox; major metabolic pathways and integrated hormonal regulation.
- **BB2 — Cells, Genetics, and Microbes:** nucleic acids, replication/repair, transcription, translation, gene regulation, biotechnology, inheritance, population genetics, evolution, membranes, transport, organelles, cytoskeleton, tissues, prokaryotes, viruses, cell cycle, mitosis, and cancer.
- **BB3 — Signaling and Integrated Organ Systems:** nerve cells, receptors, membrane signaling, nervous/endocrine coordination, feedback, respiratory, circulatory, digestive, excretory, muscular, skeletal, and skin systems, integration, and homeostasis.
- **BB4 — Immunity, Reproduction, and Development:** innate/adaptive immunity, lymphatic tissues, self/nonself recognition, gametogenesis, reproductive anatomy/physiology, fertilization, embryogenesis, differentiation, stem cells, programmed cell death, senescence/aging, and hormonal control.

### Psychological and social

- **PS1 — Behavioral Research and Statistics:** experimental, observational, survey, ethnographic, qualitative, and quantitative approaches; operationalization, sampling, generalizability, reliability/validity, bias/confounding, causation, ethics, and statistical interpretation in behavioral/social contexts.
- **PS2 — Mind, Brain, and Behavior:** sensation, perception, attention, cognition, consciousness, memory, language, emotion, stress, neural/endocrine/genetic/developmental bases, personality, disorders, motivation, attitudes, habituation, conditioning, and observational learning.
- **PS3 — Identity, Social Interaction, and Society:** social influence, groups, norms, deviance, socialization, attitude change, self/identity, attribution, prejudice, stereotypes, interaction, organizations, discrimination, sociological theory, institutions, culture, demographics, population change, stratification, inequality, and health disparities.

### CARS

- **CA1 — Comprehension and Passage Structure:** literal/contextual meaning; thesis, main point, themes, examples; sentence/paragraph function; rhetorical devices, word choice, tone, and structure; integrate distant components to infer message, purpose, position, perspective, beliefs, bias, and assumptions.
- **CA2 — Argument Evaluation and Application:** recognize and evaluate claims, evidence, support, and logical relationships; assess plausibility, generalization, causality, and source credibility; apply or extrapolate passage ideas; assess how new factors, information, or conditions alter those ideas.

Timing, distractor recognition, endurance, and passage-control techniques remain useful pedagogical operation tags, but they are not substitutes for official coverage categories.

## 9. Minimum ledger needed to prove complete coverage

The 15 clusters should sit above a versioned, leaf-level obligation ledger. At minimum, each official topic and nested subtopic needs:

### 9.1 Source and official hierarchy

- stable obligation ID;
- AAMC outline snapshot/revision;
- access date and official URL/page anchor;
- section;
- foundational concept;
- content category;
- full topic/subtopic path;
- discipline/course code; and
- independently written short paraphrase.

### 9.2 Internal ownership

- one primary learner cluster;
- optional secondary cluster links;
- internal-skill ID;
- objective IDs;
- prerequisites;
- rationale for any split or repeated topic; and
- active/versioned/retired status.

### 9.3 Reasoning and format

- primary SIRS tag for every science assessment;
- secondary operation tags where useful;
- applicable general-math requirement tags;
- for CARS, official category and subskill group;
- passage domain: humanities or social sciences;
- passage/discrete, representation, transfer-dimension, and timed-condition metadata.

### 9.4 Coverage evidence

- teaching-asset IDs;
- assessment-item and item-family IDs;
- evidence recipe;
- author, reviewer, blind-solve, and approval state;
- provenance and rights record;
- release/version metadata; and
- learner-safe versus protected delivery classification.

### 9.5 Required automated invariants

1. No official topic/subtopic leaf is orphaned.
2. Every internal objective traces to at least one official obligation.
3. Every science item has section, foundational concept, content category, discipline, and primary SIRS.
4. Every repeated AAMC topic preserves its distinct official context.
5. All seven explicit mathematics requirement groups have teaching and independent-assessment evidence.
6. All six CARS subskill groups and both passage domains have evidence.
7. Every overlap has exactly one accountable primary owner.
8. Section inventory can be compared with official discipline, foundational-concept, and SIRS targets.
9. CARS inventory can be compared with the 30/30/40 skill and 50/50 passage-domain targets.
10. No fabricated category-level weights are introduced where AAMC publishes none.

## 10. Recommended sequence

### P0: protect trust and establish truth

1. Treat the 15 clusters as navigation only and approve the revised mapping.
2. Build the official topic/subtopic ledger before scaling content generation.
3. Quarantine and provenance-review the 132 candidate records; do not publish them directly.
4. Move authority, scoring keys, protected content, and consequential decisions server-side.
5. Add built-bundle protected-field/key/rationale scanning before any real content is used.

### P1: complete one production-grade vertical

1. Add production identity, storage, event acceptance, idempotency, sync, and account lifecycle.
2. Replace the hard-coded plan with prerequisite/freshness/capacity scheduling.
3. Connect FSRS reviews, mixed practice, timed evidence, repair work, and CARS contact to Today.
4. Implement a real simulation with equivalent nonvisual controls and unseen transfer checks.
5. Build the admin blind-solve, independent-review, approval, versioning, and publishing flow.
6. Add browser E2E, accessibility, and bundle-leak tests.

### P2: expand breadth under measured coverage

1. Author internal skills and objectives from the approved official ledger.
2. Scale reviewed item families while auditing section, discipline, FC, SIRS, CARS, passage-domain, and representation distributions.
3. Calibrate mastery, freshness, workload, readiness, and ghost assumptions with real learner evidence.
4. Add privacy, export/deletion, consent, telemetry, support, and operational readiness.

## 11. Evidence index

### Repository evidence

- `README.md`
- `docs/governance/authority-boundaries.md`
- `docs/implementation-status.md`
- `docs/known-limitations.md`
- `docs/design/frontend-design-brief.md`
- `docs/adr/0004-local-authority-port.md`
- `content/curriculum/README.md`
- `packages/contracts/src/vocab.ts`
- `packages/contracts/src/events.ts`
- `packages/domain/src/evidence.ts`
- `packages/domain/src/mastery.ts`
- `packages/policies/src/mastery-policy.ts`
- `packages/policies/src/planner.ts`
- `packages/authority-core/src/authority.ts`
- `packages/authority-core/src/types.ts`
- `packages/content/src/compiler.ts`
- `packages/content/src/synthetic/enzyme-bank.ts`
- `packages/platform-web/src/state-store.ts`
- `packages/ai-gateway/src/cars.ts`
- `apps/learner-web/src/screens/Study.tsx`
- `apps/learner-web/src/screens/CarsDuel.tsx`
- `apps/learner-web/vite.config.ts`
- `apps/admin-web/src/App.tsx`
- `tests/architecture/boundaries.test.ts`
- `tools/scanners/protected-field-scan.mjs`
- `question-bank/cars-passed-candidates.jsonl`
- `question-bank/other-passed-candidates.jsonl`

### Official AAMC sources

All sources below were accessed 2026-07-21. No third-party prep-company taxonomy was used.

- [What's on the MCAT Exam? PDF outline landing page](https://students-residents.aamc.org/prepare-mcat-exam/whats-mcat-exam-pdf-outline)
- [Complete AAMC content outline PDF](https://students-residents.aamc.org/media/9261/download)
- [Exam overview and section format](https://students-residents.aamc.org/whats-mcat-exam/publication-chapters/whats-mcat-exam)
- [Biological and Biochemical Foundations overview](https://students-residents.aamc.org/whats-mcat-exam/biological-and-biochemical-foundations-living-systems-overview)
- [Chemical and Physical Foundations overview](https://students-residents.aamc.org/whats-mcat-exam/chemical-and-physical-foundations-biological-systems-section-overview)
- [Psychological, Social, and Biological Foundations overview](https://students-residents.aamc.org/whats-mcat-exam/psychological-social-and-biological-foundations-behavior-section-overview)
- [Scientific Inquiry and Reasoning Skills overview](https://students-residents.aamc.org/whats-mcat-exam/scientific-inquiry-reasoning-skills-overview)
- [Scientific Inquiry and Reasoning Skills PDF](https://students-residents.aamc.org/media/9061/download)
- [General Mathematical Concepts and Techniques](https://students-residents.aamc.org/scientific-inquiry-and-reasoning-skills/scientific-inquiry-reasoning-skills-general-mathematical-concepts-and-techniques)
- [CARS overview](https://students-residents.aamc.org/whats-mcat-exam/critical-analysis-and-reasoning-skills-section-overview)
- [CARS content and skill PDF](https://students-residents.aamc.org/media/9271/download)
- [CARS passage types](https://students-residents.aamc.org/critical-analysis-and-reasoning-skills/critical-analysis-and-reasoning-skills-section-passage-types)

## 12. Limitations of this assessment

- This is a static code, document, and build-artifact review, not a learner study or production penetration test.
- No deployed AWS environment, production data, analytics, or content-review records were available.
- The AAMC-hosted outline PDF carries an older publication footer, while the live AAMC pages accessed on the assessment date reproduce the same framework and weights.
- The origin and rights status of the 132 root candidate records cannot be determined from repository structure alone; the finding is a governance and provenance requirement, not a legal conclusion.
- A quantitative MCAT-coverage percentage would be misleading until the official leaf-level ledger and reviewed asset mappings exist.
