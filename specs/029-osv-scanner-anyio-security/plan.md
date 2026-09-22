# Plan: OSV Scanner and AnyIO Security Refresh

## Summary

Keep Dependabot's OSV Scanner action update, add the fixed AnyIO pin exposed by the updated scan, and validate both through the repository's normal gates.

## Technical Context

- changed paths: `.github/workflows/osv-scan.yml`, `requirements.txt`
- changed dependencies: `google/osv-scanner-action/osv-scanner-action`, `anyio`
- application and data changes: none

## Scope Boundaries

- in scope: immutable scanner revision, exact AnyIO security pin, feature memory, local preflight, OSV scan, and GitHub review/check evidence
- out of scope: bot source changes, workflow redesign, lockfile introduction, deployment changes, and unrelated dependency updates

## Constitution Check

- Spec-first: complete feature memory accompanies the runtime dependency update.
- Testable boundaries: preflight and OSV scan validate the resulting dependency set and repository controls.
- PR-only: all changes remain on this Dependabot PR branch and its isolated worktree.
- Simplicity: no code path or dependency-management abstraction is added.
- Deployability: exact pins preserve reproducible installs while removing the reported vulnerable resolution.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Diff review confirms the Dependabot-provided Scanner 2.6.0 SHA and matching version comment |
| AC-002 | Dependency resolution and diff review confirm the exact AnyIO 4.14.2 pin |
| AC-003 | `pnpm run preflight`, final `osv-scan`, and required GitHub checks |
| AC-004 | Current-head Codex review and zero unresolved blocking review threads |

Negative-scenario evidence:

- `git diff --name-only origin/main...HEAD` remains limited to the scanner workflow, requirements, and this feature-memory folder.
- Scanner arguments and workflow permissions remain unchanged.

## Risks

- An explicit transitive dependency pin may conflict with upstream requirements; mitigate with a clean dependency-resolution check, repository preflight, and final GitHub checks.

## Process Memory

### Dead Ends

- The initial Dependabot head failed `osv-scan` because Scanner 2.6.0 reported AnyIO 4.9.0 vulnerabilities fixed in 4.14.2.
- The initial `AI Review` run had no trusted current-head review request marker.
- A local Scanner 2.6.0 container run was unavailable because the Docker daemon is not running; the dedicated GitHub `osv-scan` job provides the scan evidence instead.

### Decisions

- Pin the exact fixed AnyIO version reported by OSV rather than weakening or excluding the scan.
- Request a fresh Codex review after the implementation commit so review evidence targets the final head.

### Known Issues

- Clean dependency resolution succeeded and `pnpm run preflight` passed with 58 tests.
- On implementation head `bb193a6`, `baseline-checks`, `guard`, `osv-scan`, and `AI Review` passed; Codex reported no major issues, and the only earlier false-positive thread was answered with commit-author evidence and resolved.
- The final evidence-only head must pass the same checks and current-head review before merge.
