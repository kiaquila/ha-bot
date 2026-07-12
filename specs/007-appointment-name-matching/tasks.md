# Tasks: Appointment Name Matching

Status legend: `[x]` done, `[ ]` pending.

## Setup and Reproduction

- [x] T001 Create an isolated branch/worktree from refreshed `origin/main`.
- [x] T002 Inspect the production symptom read-only: the API returns one slot,
  but no Telegram notification follows.
- [x] T003 Create complete feature memory before product changes.
- [x] T004 Add failing unit coverage for canonical doctor-name variants and
  privacy-safe unmatched diagnostics.

## Implementation

- [x] T005 Normalize meaningful doctor-name tokens for case, accents,
  punctuation, and `Dr.`/`Dra.` titles while preserving exact token boundaries.
- [x] T006 Emit one aggregate, non-sensitive unmatched-name diagnostic per poll.
- [x] T007 Add mocked polling coverage for delivery, rejection, deduplication,
  and diagnostic hygiene.

## Verification and Pull Request

- [x] T008 Run targeted tests, `git diff --check`, and `pnpm run preflight`.
- [x] T009 Update this feature memory with commands and results.
- [ ] T010 Commit with attribution, push, and open one draft PR.
- [ ] T011 Trigger Codex review, resolve findings, and verify current-head checks.

## Process Memory

### Dead Ends

- Browser-side verification could not retrieve the slot details because the
  existing portal session expired; no credentials were entered or changed.
- Production logs intentionally include only the slot count, so the exact name
  variation cannot be recovered without adding a safe diagnostic.

### Decisions

- Fix only presentation-level name differences and retain exact meaningful-token
  matching to avoid cross-doctor notifications.
- Use an aggregate log count/mode rather than raw names or appointment data.

### Known Issues

- This change cannot prove upstream portal availability; it only ensures that a
  returned slot with a canonical-equivalent name reaches Telegram.

### Verification Evidence

- Before the implementation,
  `python3 -m unittest tests.test_appointment_name_matching -v` failed the
  canonical-equivalent delivery and diagnostic cases, confirming the regression.
- After the implementation, the same targeted suite passed all five cases.
- `git diff --check` and `pnpm run preflight` completed successfully; preflight
  included feature-memory, repository baseline, context, Python compilation,
  and the full unit-test suite.
- Independent review strengthened the diagnostic test to assert that two
  rejected slots produce exactly one aggregate record and that test ID/token
  values are absent from that record; the targeted suite passed again.
