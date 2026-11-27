# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

<!-- Copy this block for each session:

## YYYY-MM-DD · <short title>
- Goal:
- Delegated:
- Checkpoints:
- Went wrong:
- Changed by hand:

-->

## 2026-11-02 · mcp server creation
- Goal: mcp server creation
- Delegated: to gemini nothing, I asked claude for clarifications and sugestions
- Checkpoints: -
- Went wrong: what didn't went wrong with gemini is the correct question here...
- Changed by hand: wrote the teachers.json

## 2026-11-26 · slice 1 creation
- Goal: slice 1 creation
- Delegated: creation of slice 1
- Checkpoints: -
- Went wrong: gemini connection, initial plan, tables creation
- Changed by hand: some clarifications in the spec and postgre

## 2026-11-27 · slice 2 creation
- Goal: slice 2 creation
- Delegated: plan, migration, sign-up logic, endpoint
- Checkpoints: plan review, each file reviewed, `npm test` after each step (16 passed), browser check, commit per step
- Went wrong: wrong order of checks, SQL in the service, free places as text, chat text written into the test file
- Changed by hand: added some clarifications in the SPEC.md, never-commit rule in AGENTS.md, cleaned the test file

## 2026-11-27 · slice 3 creation
- Goal: event details and withdrawing (AC-17 to AC-20)
- Delegated: plan, data functions, withdraw logic, endpoints, details page
- Checkpoints: plan review, each file reviewed, `npm test` after each step (20 passed), browser check, commit per step
- Went wrong: tests planned as a separate last step, AC-20 test missed the free places check, status shown only through the button
- Changed by hand: chose 409 "You are not signed up", moved tests into the same step as the code, asked for the status line on the details page

## 2026-11-27 · slice 4 creation
- Goal: creating events (AC-21 to AC-25)
- Delegated: plan, create event service, POST /api/events, create event page, Create event button
- Checkpoints: plan review, each file reviewed, `npm test` after each step (25 passed), browser check as organizer, admin and member, commit per step
- Went wrong: plan wanted a second `createEvent`, weak limit check, missing location and description checks, stub endpoints for Slice 6, route missing from the first step
- Changed by hand: decided admins can create events (AC-25 in SPEC.md, Non-goals updated), limited AC-24 to creating events in this slice

## 2026-11-27 · slice 5 creation
- Goal: editing and cancelling events (AC-26 to AC-30)
- Delegated: plan, update and cancel logic, endpoints, cancelled check on sign-up, edit form, buttons
- Checkpoints: plan review, each file reviewed, `npm test` after each step (31 passed), browser check, commit per step
- Went wrong: routes planned after the tests, no way for the page to know who may edit, edit form showed the UTC date, Gemini tried to edit SPEC.md
- Changed by hand: chose 400 for started and 409 for cancelled events, asked for `can_manage`, refused the SPEC.md edit, ran the tests myself after token limit

## 2026-11-27 · slice 6 creation
- Goal: organizer/admin sees an event's sign-up list and removes a member (AC-31 to 33, rest of AC-24).
- Delegated: plan, data/service/routes, tests, sign-ups page.
- Checkpoints: plan reviewed
- Went wrong: plan said organizer "and" admin (fixed to "or"); test file was missing `after(pool.end)`.
- Changed by hand: nothing.