# Plan: Python Patch Refresh

## Summary

Keep Dependabot's grouped Python patch updates intact, add the required feature memory, and validate the update with the repository's normal tests and review gate.

## Technical Context

- changed path: `requirements.txt`
- changed dependencies: `python-dotenv`, `cryptography`
- application, data-model, and deployment changes: none

## Scope Boundaries

- in scope: exact Python dependency pins, feature memory, local preflight, required checks, and current-head review evidence
- out of scope: bot source changes, persistence changes, package-management migration, lockfile introduction, and deployment changes

## Constitution Check

- Spec-first: this complete feature-memory folder accompanies the protected dependency change.
- Testable boundaries: preflight includes syntax checks and the persistence test suite that exercises encrypted state handling.
- PR-only: all changes stay on the existing Dependabot PR branch in its isolated worktree.
- Simplicity: no code path or dependency-management abstraction is added.
- Deployability: exact pins retain reproducible production installs.

## Implementation

1. Retain Dependabot's exact pins for `python-dotenv` 1.2.4 and `cryptography` 50.0.2.
2. Add this feature memory without changing application or deployment source.
3. Run local preflight, push the branch, and verify required checks and current-head review evidence.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review of `requirements.txt` |
| AC-002 | Diff confirms application, persistence, and deployment files are unchanged |
| AC-003 | `git diff --name-only origin/main...HEAD` contains only `requirements.txt` and this feature-memory folder |
| AC-004 | Local `pnpm run preflight` plus final required GitHub checks |
| AC-005 | Current-head Codex outcome and GraphQL review-thread count |

Negative-scenario evidence:

- Both updated dependencies remain exact pins.
- The existing persistence tests cover encrypted state round trips, invalid keys, corrupt state, and absence of plaintext credentials.

## Risks

- A patch release could introduce a runtime regression; mitigate with exact pins, the full local test suite, OSV scanning, required CI, and current-head review.

## Process Memory

### Dead Ends

- The initial Dependabot head failed `guard` because `requirements.txt` is a protected product path and the PR had no complete feature-memory folder.
- The initial `AI Review` run failed because no trusted current-head review request marker existed.
- Codex's first current-head review misread the assisted commit metadata and reported a missing co-author trailer even though the trailer is present and GitHub attributes the commit to both Kristina Aquila and OpenAI Codex.
- Codex's second review cited `b158c19` as a commit authored by Codex, but that object is not in the PR and GitHub's commit API returns 404 for it; the actual PR head and GitHub pull-request head ref both resolve to `b80503e`.

### Decisions

- Keep the two compatible patch updates grouped in the existing Dependabot PR.
- Preserve exact pins and avoid application changes because the requested updates are patch-level maintenance releases.
- Treat commit metadata as the attribution source of truth: the assisted commit is authored and committed by Kristina Aquila and ends with `Co-authored-by: OpenAI Codex <codex@openai.com>`.

### Known Issues

- Local preflight passed with 58 tests; final GitHub checks and current-head Codex review remain external merge gates and must be re-read after push.
