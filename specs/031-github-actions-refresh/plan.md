# Plan: GitHub Actions Refresh

## Summary

Preserve Dependabot's grouped Docker action updates on its current rebased head, add the required feature memory, and validate that workflow behavior is unchanged.

## Technical Context

- changed workflows: `.github/workflows/ci.yml`, `.github/workflows/deploy-production.yml`
- changed actions: `docker/setup-qemu-action`, `docker/setup-buildx-action`, `docker/build-push-action`
- application, data, and secret changes: none

## Scope Boundaries

- in scope: exact action SHA pins, feature memory, local preflight, required checks, and current-head review evidence
- out of scope: workflow restructuring, permission changes, deployment changes, runtime dependency changes, and mutable action references

## Constitution Check

- Spec-first: this complete feature-memory folder accompanies the protected workflow change.
- Testable boundaries: repository preflight and GitHub checks validate the resulting workflows.
- PR-only: all changes stay on the existing Dependabot PR branch in its isolated worktree.
- Simplicity: no workflow step, abstraction, or deployment mechanism is added.
- Deployability: the production workflow keeps its existing immutable-image and gated-deployment contract.

## Implementation

1. Sync the isolated worktree to Dependabot's current rebased PR head.
2. Retain Dependabot's full-SHA updates for the three Docker actions.
3. Add this feature memory without changing workflow behavior.
4. Run local preflight, push the branch, and verify required checks and current-head review evidence.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review of the five updated `uses:` lines |
| AC-002 | Workflow diff confirms no changes outside the action references and version comments |
| AC-003 | `git diff --name-only origin/main...HEAD` contains only the two workflows and this feature-memory folder |
| AC-004 | Local `pnpm run preflight` plus final required GitHub checks |
| AC-005 | Current-head Codex outcome and GraphQL review-thread count |

Negative-scenario evidence:

- Every updated reference remains a 40-character commit SHA.
- No workflow trigger, permission, job, input, secret, or deployment command changes in the PR diff.

## Risks

- Minor action releases may change Docker setup or build behavior; mitigate with immutable SHA pins, local repository checks, container-contract CI, and current-head review.

## Process Memory

### Dead Ends

- The initial Dependabot head failed `guard` because `.github/workflows/deploy-production.yml` is a protected product path and the PR had no complete feature-memory folder.
- The initial `AI Review` run failed because no trusted current-head review request marker existed.

### Decisions

- Keep the three compatible Docker action updates grouped in the existing Dependabot PR.
- Use Dependabot's rebased current head as the base for the feature-memory commit.
- Preserve every full commit-SHA pin and all existing workflow behavior.

### Known Issues

- Final GitHub checks and current-head Codex review remain external merge gates and must be re-read from GitHub after the branch is pushed.
