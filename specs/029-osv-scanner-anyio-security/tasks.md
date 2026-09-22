# Tasks: OSV Scanner and AnyIO Security Refresh

## Setup

- [x] T001 Confirm the PR head and OSV Scanner action change.
- [x] T002 Reproduce and identify the OSV failure on the initial Dependabot head.
- [x] T003 Add complete feature memory for the runtime dependency update.

## Implementation

- [x] T004 Retain the Dependabot-provided immutable Scanner 2.6.0 revision.
- [x] T005 Pin AnyIO 4.14.2, the fixed version reported by OSV Scanner.
- [x] T006 Keep application source, deployment files, scanner arguments, and workflow permissions unchanged.

## Verification

- [x] T007 Verify a clean dependency resolution for `requirements.txt`.
- [x] T008 Run `pnpm run preflight` (58 tests passed locally).
- [x] T009 Confirm `osv-scan` and all required GitHub checks are green on implementation head `bb193a6`.
- [x] T010 Confirm Codex reported no major issues on implementation head `bb193a6` and the only earlier review thread was resolved.

## Process Memory

### Decisions

- The explicit AnyIO pin is the minimal change that removes the two vulnerabilities reported by the updated scanner.
- Final review is requested only after the implementation head is pushed.

### Known Issues

- The local Docker daemon is unavailable, so the final GitHub `osv-scan` job supplies Scanner 2.6.0 execution evidence.
- The final evidence-only head must pass the same checks and current-head review before merge.
