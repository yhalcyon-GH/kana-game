# Checkpoint E1B Commercial Access Gates Design

## Goal

Apply the E1A commercial-access policy to every navigation and direct-route
surface without changing curriculum progression, Recommended Path, mastery,
SRS, or persisted learning data.

## Access model

`src/lib/commercialAccess.ts` remains the only source of free/paid policy.
Hiragana is accessible for every entitlement state, including `loading` and
`unavailable`. Every known non-Hiragana target is accessible only while the
server-derived entitlement state is `active`; unknown targets fail closed.

UI code may supply a target to this policy, but must not infer free/paid status
from kana characters, route names, ordering, or duplicated category lists.

## Route enforcement

A shared route gate resolves the current row, checkpoint, or assessment route
parameters and evaluates them through `commercialAccess.ts`. It renders the
normal child only when accessible. Paid targets render one shared access-state
screen: loading hides content, signed-out links to sign-in/account, inactive
links to account, and unavailable offers Retry plus account access.

The gate covers Learn, Practice Hub, Tracing, Kana Quiz, Listening, Typing,
Word Builder, Restaurant/Cafe checkpoints, all section assessments, and the
Final Kana Test. Invalid identifiers are denied before page code can render.

## Navigation surfaces

Home and category pages continue to show paid curriculum. Their cards retain
the unchanged Recommended target and progression state, but inaccessible
actions become locked controls leading to the same access-state UX. Continue
retains `lastStudied` unchanged and uses the row policy before navigation.

The navigation bar gains a compact Account entry. No checkout, price, purchase
intent, or Paddle UI is introduced in E1B.

## Review and Saved

`useCurriculum()` remains unchanged. A commercial overlay consumes its
existing Review result and filters only the visible/playable Review pools.
Character source category is resolved through `CHARACTERS_BY_ID[id].rowId`
and `ROWS_BY_ID[rowId].categoryId`. Word source category is resolved through
canonical `WORDS_BY_ROW` membership and that row's category. Ambiguous or
unresolved items fail closed.

Saved uses the same canonical source resolvers to filter rendering and badge
counts. Neither overlay mutates progress, SRS, saved IDs, or persistent
storage. When entitlement returns to `active`, the original paid items become
available again from their retained data.

## Verification

Tests cover every entitlement state, direct routes, Home/Recommended/Continue,
category cards, Review/Saved filtering and restoration, unknown targets,
Hiragana end-to-end access, the unchanged Recommended result, and the E1A dev
network guard. Final verification includes focused tests, `npm run verify`,
Playwright browser smoke, `git diff --check`, and a real 320px browser check.

