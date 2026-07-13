# Tasks: Container Healthcheck

Status legend: `[x]` done, `[ ]` pending.

## Setup and Specification

- [x] T001 Refresh GitHub state and create an isolated branch/worktree from
  `origin/main` with the repository helper.
- [x] T002 Inspect healthcheck patterns in the owner's other Telegram bot
  repositories and preserve their local-liveness semantics.
- [x] T003 Confirm the pinned JobQueue callback contract through Context7.
- [x] T004 Create complete feature memory before product changes.

## Test-First Implementation

- [x] T005 Add failing tests for fresh, missing, stale, future-dated, and
  non-regular heartbeat inputs.
- [x] T006 Add failing contract tests for heartbeat scheduling, Docker image
  health metadata, candidate-image validation, and unhealthy deploy
  rejection.
- [x] T007 Implement the standard-library heartbeat writer/probe.
- [x] T008 Register startup and recurring JobQueue heartbeat updates.
- [x] T009 Add the image healthcheck and require health in production deployment.
- [x] T010 Update production deployment documentation.

## Verification and Pull Request

- [x] T011 Run targeted tests, `git diff --check`, and `pnpm run preflight`.
- [x] T012 Run Dockerfile and rendered Compose validation when local Docker is
  available; record any environment limitation otherwise.
- [x] T013 Update this feature memory with exact verification evidence.
- [ ] T014 Commit with attribution, push, and open one ready pull request.
- [ ] T015 Post the trusted `@codex review` trigger from the owner account.
- [ ] T016 Resolve blocking review findings and verify current-head required
  checks.

## Process Memory

### Dead Ends

- No existing HTTP service is available in HA Bot, so copying Nome's `/healthz`
  route would add an unnecessary inbound-capable server solely for liveness.
- Testing PID 1 would inspect Compose's init process rather than necessarily
  proving progress in the Python worker.

### Decisions

- Use the local-heartbeat pattern because it matches the worker-only runtime and
  remains independent of Telegram and Hospital Alemán availability.
- Put the heartbeat in the existing writable `/tmp` tmpfs; do not mount or
  persist it.
- Allow two missed 30-second callbacks before the 90-second freshness threshold
  expires, then rely on bounded Docker retries.

### Known Issues

- The probe is a liveness signal, not an upstream-readiness guarantee. External
  API outages remain visible through application logs and task behavior rather
  than Docker health.

### Verification Evidence

- Before implementation, `python3 -m unittest tests.test_healthcheck -v`
  failed because `healthcheck.py` did not exist. The two new deploy cases also
  failed because a missing image healthcheck and `running + unhealthy` state
  were both accepted.
- After implementation, the targeted heartbeat suite passed all ten cases and
  the deployment contract suite passed, including candidate-image metadata and
  unhealthy-ledger rejection.
- `pnpm run preflight` exited 0 after the final implementation. It covered the
  feature-memory gate, repository baseline, context budgets, compilation of
  `bot.py` and `healthcheck.py`, and the complete unit-test suite.
- `git diff --check`, `bash -n scripts/deploy-production.sh`, `shellcheck
  scripts/deploy-production.sh`, and Python 3.12 compilation of both runtime
  modules exited 0.
- Offline `docker compose ... config --quiet --no-env-resolution` and JSON
  rendering exited 0 with a synthetic immutable digest and numeric runtime IDs.
  The local Docker daemon was unavailable, so the ARM64 image build and runtime
  health smoke are delegated to GitHub CI rather than reported as local
  evidence.
