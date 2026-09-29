# Tasks: Python Dependency Refresh

## Setup

- [x] T001 Confirm the PR head and grouped dependency changes.
- [x] T002 Add complete feature memory for the dependency update.

## Implementation

- [x] T003 Retain the requested exact pins in `requirements.txt`.
- [x] T004 Keep application and deployment source unchanged.

## Verification

- [x] T005 Run `pnpm run preflight` (58 tests passed locally).
- [ ] T006 Confirm all required GitHub checks are green on the final head.
- [ ] T007 Confirm Codex review completed and all review threads are resolved.

## Process Memory

### Decisions

- Keep both compatible minor dependency updates in the existing grouped Dependabot PR.
- Trigger Codex review from the maintainer account after pushing the final implementation head.

### Known Issues

- Implementation head `98091e7` passed `baseline-checks`, `guard`, and `osv-scan`; its only Codex P1 was a false positive about the co-author trailer and was resolved with GitHub API evidence.
- Evidence head `d6f0ef9` passed the non-review checks; its Codex P1 cited a commit not present in the PR and was resolved with the GitHub PR commit list.
- Evidence head `5c35804` also passed the non-review checks; its Codex P1 cited unrelated SHA `2fc8292` and was resolved from the same authoritative metadata.
- Final required-check and review evidence remains pending for this evidence-only head.
