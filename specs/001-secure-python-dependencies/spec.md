# Spec: Secure Python Dependencies

## Goal

Update vulnerable Python dependencies so the installed OSV scan can pass without weakening repository guardrails.

## Scope

In scope:

- `requirements.txt` pins for packages reported by OSV.
- Verification through local preflight and GitHub OSV Scan.

Out of scope:

- Bot behavior changes.
- Refactoring Telegram handlers or Hospital Aleman API logic.

## User Stories

### User Story 1

As a maintainer, I want dependency pins to use non-vulnerable versions, so that the default branch can remain protected by OSV scanning.

## Acceptance Criteria

1. Given OSV reports fixable vulnerabilities in Python dependencies, when the PR updates dependency pins, then OSV no longer reports those vulnerable versions.
2. Given the dependency update is included in the multi-agent bootstrap PR, when guardrails run, then product-path changes are accompanied by complete feature memory.

## Negative Scenarios

1. Given a dependency update could alter bot runtime behavior, when the PR is reviewed, then the change is limited to patched versions and does not edit bot logic.

## Requirements

- FR-001: Pin `requests` to the OSV fixed version.
- FR-002: Pin `idna` to the OSV fixed version so the transitive dependency cannot resolve to the vulnerable version.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: GitHub `osv-scan` passes on the PR.

## Assumptions

- The fixed versions reported by OSV are compatible with the current bot usage.
