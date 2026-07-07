# Tasks: Secure Python Dependencies

## Setup

- [x] T001 Confirm active feature folder and branch.
- [x] T002 Run baseline checks before editing.

## Implementation

- [x] T003 Update vulnerable dependency pins in `requirements.txt`.
- [x] T004 Keep bot source code unchanged.

## Verification

- [x] T005 Run local preflight.
- [x] T006 Confirm GitHub OSV Scan passes.
- [x] T007 Update docs and tasks status.

## Process Memory

### Dead Ends

- Initial PR bootstrap did not include product dependency changes; OSV exposed vulnerable pins once GitHub Actions could run.

### Decisions

- Pin `idna` directly because OSV reported the vulnerable transitive resolution from `requirements.txt`.
- Use first-install AI review bootstrap only while trusted scripts are absent from `main`.

### Known Issues

- Future dependency updates should be handled in their own PR after this control plane lands.
