# Plan: Appointment Name Matching

## Summary

Replace the accent-sensitive tokenization used after slot polling with a small
canonical form that reuses the bot's established Unicode normalization. Strip
punctuation and common medical titles, retain exact matching for the remaining
tokens, and record a single privacy-safe unmatched count per poll.

## Technical Context

- runtime: Python Telegram long-polling worker
- dependencies: no new dependencies
- product paths: `bot.py`, `tests/test_appointment_name_matching.py`
- data changes: none; existing task and notification state stay compatible
- deployment: merge to `main` uses the existing ARM64 Docker deployment workflow

## Scope Boundaries

- in scope: canonical name tokens, aggregate rejection diagnostic, unit tests,
  and feature memory
- out of scope: portal API contract, task selection UI, booking, credentials,
  persistence format, and production Docker configuration

## Constitution Check

- Spec-first: this folder is the acceptance source before product changes.
- Testable boundaries: token matching and one-poll notification behavior are
  tested with mocked API and Telegram boundaries.
- PR-only: one branch, worktree, and pull request are used.
- Simplicity: reuse `_norm`; add no matching library or external service.
- Deployability: default-branch deployment contract is unchanged.

## Complexity Tracking

No new abstraction is introduced. Canonicalization is kept inside the existing
name-token helper because it has one caller domain and already owns punctuation
handling.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Targeted mocked-poll test sends one notification for canonical name variants. |
| AC-002 | Targeted mocked-poll test rejects a different name and records one aggregate log. |
| AC-003 | Targeted test asserts the diagnostic excludes raw test doctor names, slot details, synthetic ID, and token. |
| AC-004 | Regression test verifies an already-notified slot is not re-sent. |

Negative scenario evidence:

- Unit tests retain exact meaningful-token boundaries and reject unrelated names.

## Risks

- Over-broad matching could notify for the wrong doctor. Mitigation: normalize
  presentation-only differences only; keep exact equality for meaningful tokens.
- Per-slot logs could expose appointment details. Mitigation: log an aggregate
  count and mode only.
