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