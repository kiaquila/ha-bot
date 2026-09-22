# Spec: OSV Scanner and AnyIO Security Refresh

## Goal

Update the OSV Scanner action and keep its stricter scan green by pinning the safe AnyIO release it requires.

## Scope

In scope:

- Update `google/osv-scanner-action/osv-scanner-action` from 2.5.1 to 2.6.0 at its immutable revision.
- Pin `anyio` 4.14.2 because OSV Scanner reports two fixed vulnerabilities in the previously resolved 4.9.0 release.
- Verify the dependency changes through repository preflight, OSV scan, and required GitHub checks.

Out of scope:

- Changes to bot behavior, Telegram handlers, persistence, or deployment configuration.
- Workflow refactoring or dependency-management migration.

## User Story

As a maintainer, I want the vulnerability scanner and affected runtime dependency refreshed, so that CI uses the current scanner and rejects no known fixed vulnerability in the resolved environment.

## Acceptance Criteria

1. The OSV workflow pins Scanner 2.6.0 to the Dependabot-provided immutable revision.
2. `requirements.txt` pins AnyIO 4.14.2, the fixed version named by OSV Scanner.
3. Repository preflight, OSV scan, and all required GitHub checks pass on the final PR head.
4. A current-head Codex review completes with no unresolved blocking findings or review threads.

## Negative Scenarios

1. The update must not change application source or deployment behavior.
2. The update must not weaken scanner arguments, workflow permissions, or immutable action pinning.

## Requirements

- FR-001: Keep the action reference pinned to a full commit SHA with its matching version comment.
- FR-002: Keep AnyIO exactly pinned to the OSV-reported fixed version.
- FR-003: Limit changes to the two dependency pins and their required process memory.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: The final GitHub `osv-scan` and required checks are green.
- SC-003: Codex review evidence is current and every review thread is resolved.
