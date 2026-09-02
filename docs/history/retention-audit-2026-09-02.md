# Long-term retention audit — 2026-09-02

Baseline: `4ab77b4694836c882e682bb5b28bebfb3dd5d3f4`

## Current behavior

KanaGame currently has two useful but distinct mechanisms:

- a five-box character performance signal used for practice weighting / historical unlock logic;
- a mistake-driven Review queue where a miss activates an item and two consecutive correct answers graduate it.

The current Review queue is not time-driven. Once an item graduates from mistake Review, elapsed time alone never makes it due again. Character progress stores `lastSeen`, but Review selection does not use it. Word progress has no retention timestamp or due state.

## Learning-effectiveness implication

The existing flow is strong at immediate error repair but does not yet guarantee distributed retrieval after a learner stops making mistakes. Long-term retention therefore depends on incidental reuse in later lessons or voluntary replay rather than an explicit spacing schedule.

## Recommended direction

Preserve the current mistake-repair behavior and add a separate time-based Due Review layer.

Important constraints:

- Do not make Review accuracy gate Recommended Path progression.
- Do not replace Retry or the current two-correct mistake graduation behavior.
- Do not reuse the existing character `box` directly as a due-interval stage: it can rise during massed same-session practice, so it is not a reliable measure of successful spaced retrieval.
- Track due scheduling independently for characters and words.
- Review should use the union of mistake-active items and time-due items, deduplicated.
- Normal practice may refresh retention evidence, but only successful spaced/due retrieval should advance the long-term interval stage.
- A miss on a due item should immediately enter the existing mistake-repair flow and shorten/reset its next interval.
- Keep the design local-first and deterministic; no account/server dependency is required.

## Product decision still required before implementation

Choose the initial due interval policy and how strongly due Review should be surfaced to the learner. A simple expanding schedule is recommended over a full SM-2/FSRS-style algorithm for this beginner kana app.
