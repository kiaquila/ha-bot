# Plan: Python Dependency Refresh

## Summary

Keep the grouped Dependabot Python version pins intact, add the required feature memory, and validate the update with the repository's normal checks and review gate.

## Technical Context

- changed path: `requirements.txt`
- changed dependencies: `anyio`, `idna`
- application and data changes: none

## Scope Boundaries

- in scope: exact Python dependency pins, feature memory, local preflight, GitHub checks, and review evidence
- out of scope: bot source changes, package-management migration, lockfile introduction, and deployment changes

## Constitution Check

- Spec-first: complete feature memory accompanies the product dependency update.
- Testable boundaries: preflight and required GitHub checks validate the resulting installation and bot checks.
- PR-only: all changes remain on this Dependabot PR branch and its isolated worktree.
- Simplicity: no code path or dependency-management abstraction is added.
- Deployability: exact pins retain reproducible production installs.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review of `requirements.txt` |
| AC-002 | Diff confirms bot and deployment files are unchanged |
| AC-003 | `pnpm run preflight` and final required GitHub checks |
| AC-004 | Current-head Codex review and zero unresolved threads |

Negative-scenario evidence:

- `git diff --name-only origin/main...HEAD` remains limited to `requirements.txt` and this feature-memory folder.
- Both updated dependencies remain exact pins and application code is unchanged.

## Risks

- An updated dependency may have an upstream compatibility regression; mitigate with exact pins, the existing test suite, OSV scan, and current-head review.

## Process Memory

### Dead Ends

- The initial Dependabot head failed `guard` because `requirements.txt` is a protected product path and the PR had no complete feature-memory folder.
- The initial `AI Review` run failed because no trusted current-head review request marker had been recorded.

### Decisions

- Preserve Dependabot's grouped update instead of splitting two compatible minor releases.
- Request Codex review only after the feature-memory commit is pushed so the marker and review evidence target the final PR head.

### Known Issues

- Required checks passed on implementation head `98091e7`; Codex's only P1 incorrectly reported that commit's already-present co-author trailer as missing. The GitHub commit API confirmed the exact trailer, and the false-positive thread was answered with that evidence and resolved.
- Codex repeated the trailer finding on evidence head `d6f0ef9` while citing `3f9b388`, which is not a commit in this PR; GitHub's PR commit list and current-head metadata were supplied, and that thread was also resolved.
- The next review of `5c35804` cited another unrelated SHA, `2fc8292`, as the requested commit. The authoritative PR commit list again disproved the finding, and the thread was resolved.
- The final evidence-only head must pass the same required checks and receive current-head Codex review evidence before merge.
