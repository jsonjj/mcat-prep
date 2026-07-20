# Frontend design brief — MCAT Mastery (pass 1 + critique)

Method: two-pass (`frontend-design` skill). Ground the design in the subject, propose tokens + layout + signature, then critique against the brief and revise generic choices before building.

## 1. Ground it

- **Subject:** a personalized MCAT learning system for anxious, time-pressured pre-meds — primarily the "Plateaued Grinder" (3+ months in, stuck ~500–508, drowning in tools).
- **Audience feeling:** overwhelmed, self-critical, short on time. The interface must lower cognitive load, not add to it.
- **The single job of Home:** answer one question — *"What is the most valuable thing to do next?"* — calmly, with one obvious action.
- **World / materials:** the brain-as-atlas metaphor, luminous and translucent, like bioluminescence or backlit glass. Cool, clean, clinical-dawn light. Evidence that *settles* rather than jolts.

## 2. Signature (the one memorable thing)

**The Evidence Atlas.** A luminous, translucent brain where the 15 regions are progress surfaces. A region gains a narrow **prismatic edge** only when its evidence changes — the glow is earned, not ambient. This is the single aesthetic risk. Everything around it stays quiet, flat, high-contrast, and content-first. When a task starts, the atlas recedes.

Structural device: **evidence, not decoration.** Progress rings/segments encode real evidence stages (Learning → Independent → Retained → Strong), never arbitrary numbering. No "01/02/03" markers.

## 3. Palette (exact tokens; iridescence is decorative only)

Light:

| Token | Hex | Use |
|---|---|---|
| canvas | `#F5F8F8` | app background |
| surface | `#FFFFFF` | cards/controls |
| ink | `#10222E` | primary text (~15:1 on canvas) |
| inkMuted | `#4A5A66` | secondary text (≥7:1) |
| primary | `#0B6A63` | action base / white-text-safe teal |
| primaryText | `#0E7C74` | teal text/borders on light |
| info | `#1E5A96` | information |
| retained | `#574A9E` | Retained state |
| warning | `#7A4B00` | warnings (text-safe) |
| danger | `#A3283D` | errors |
| focus | `#0E7C74` | focus ring |

Dark:

| Token | Hex |
|---|---|
| canvas | `#0A1620` |
| surface | `#12242F` |
| ink | `#EAF3F4` |
| inkMuted | `#A9BEC6` |
| primary | `#4FD1C4` |
| info | `#7FBBF2` |
| retained | `#C3B8FF` |
| warning | `#F0C56B` |
| danger | `#FF9AA6` |

Decorative-only (brain material; **never** used for text, status, or controls): mint `#D9F5F1`, aqua `#CFEAF4`, lavender `#DED6EC`, cream `#FBE8C6`, rose `#EBD5D6`.

The primary CTA may carry a teal→periwinkle sheen, but its label sits on a guaranteed-contrast solid base (`primary`), not on the pale gradient. This directly fixes the reference image's low-contrast button.

## 4. Type

Deliberately not the generic Inter-everywhere dashboard.

- **Display / brand:** `Fraunces` (variable optical serif) — intelligent, warm, distinctive; used sparingly for big moments (e.g., "Day 42", section titles).
- **Body / UI:** `Atkinson Hyperlegible Next` — legibility-first, on-thesis for anxious learners and accessibility.
- **Data / equations / timers:** `IBM Plex Mono` — purposeful for numbers, units, and countdowns.

Scale (px): 12, 14, 15, 17, 22, 28, 36, 48. Body 17/26. No fixed-height text containers; no all-caps paragraphs (only short eyebrows).

## 5. Structure & layout

```
Mobile (portrait)                     Desktop / wide
┌───────────────────────┐            ┌───────┬───────────────────────────┐
│  MCAT Mastery      ☺   │            │ ☰ nav │  Day 42 · 3 skills updated │
│                        │            │ Home  │                            │
│      Day 42            │            │ Today │     [ Evidence Atlas ]      │
│  3 skills updated      │            │ Recall│                            │
│                        │            │ Mistk │  ┌──────────────────────┐  │
│   [ Evidence Atlas ]   │            │ Prog  │  │ UP NEXT · 25 min      │  │
│                        │            │       │  │ Enzyme Inhibition  →  │  │
│ ┌────────────────────┐ │            │  ☺    │  └──────────────────────┘  │
│ │ UP NEXT · 25 min   │ │            │       │  [   Continue   ]          │
│ │ Enzyme Inhibition →│ │            │       │  Quick practice · 5 min     │
│ └────────────────────┘ │            └───────┴───────────────────────────┘
│ [    Continue    ]     │
│  Quick practice · 5min │
├───────────────────────┤
│ Home Today Recall … …  │   ← 5-item bottom bar
└───────────────────────┘
```

- Mobile: five-item bottom bar (Home, Today, Recall, Mistakes, Progress); avatar opens Profile. Desktop: labeled sidebar, same IA.
- One primary action per screen (**Continue**). The "Up Next" card and Continue resolve to the *same* action (the reference's duplicate arrow + button is collapsed into one clear affordance).
- Compact status ("Day 42 · 3 skills updated") is neutral history, never a streak-shame counter.

## 6. Motion

Restrained. Evidence "settles" once after a completed session; the atlas has an optional slow float. Reduced-motion disables float/parallax/pulse. Nothing depends on motion, color, sound, or precise gestures. Feedback 120ms · controls 180ms · route 280ms · guided camera ≤560ms.

## 7. Critique vs. generic defaults (pass 2)

- **Not** cream + serif + terracotta, not near-black + acid accent, not a broadsheet grid — those are AI defaults unrelated to this subject. This palette is a cool clinical-dawn teal grounded in the luminous-brain world.
- Fraunces + Atkinson + Plex Mono is a purposeful, legibility-forward pairing rather than Inter-everywhere.
- The reference's pale, low-contrast button and ambiguous "3 skills glowing" are corrected: accessible CTA base, and a factual "3 skills updated" with an explanation on tap.
- Boldness is spent in exactly one place (the Evidence Atlas); everything else is quiet and disciplined.

These decisions are encoded verbatim in `@mcat/design-tokens` and realized in `@mcat/ui-web`.
