# Spec: Container Healthcheck

## Goal

Give the production HA Bot container a Docker health status that proves the
Telegram worker event loop is still making progress, so deployment and routine
operations can distinguish a live worker from a merely running process.

## Scope

In scope:

- An internal heartbeat written by the bot on startup and by a lightweight
  recurring JobQueue callback.
- A dependency-free Docker image healthcheck that accepts a fresh heartbeat and
  rejects a missing or stale heartbeat.
- Production Compose and deploy validation that require the configured probe and
  a `healthy` container before a release is recorded as stable.
- Unit and command-contract coverage for healthy and unhealthy states.
- Deployment documentation and complete feature/process memory.

Out of scope:

- Adding an HTTP server, host port, reverse proxy, or external monitoring
  service.
- Calling Telegram or Hospital Alemán from the healthcheck.
- Treating upstream availability, authentication, or appointment results as
  container liveness.
- Changing polling cadence, appointment matching, notifications, or user state.

## User Stories

### User Story 1 — Visible worker health

As the operator, I want Docker to report whether the bot event loop is advancing,
so a wedged worker is not mistaken for a healthy deployment.

### User Story 2 — Health-gated deployment

As the maintainer, I want deployment to wait for and explicitly verify the
container health status, so an unhealthy revision is never recorded as stable.

## Acceptance Criteria

1. Given the bot starts normally, when the JobQueue is running, then a heartbeat
   file is created in writable container-local temporary storage within the
   first 10 seconds and refreshed at least once every 30 seconds.
2. Given the heartbeat exists and is no older than 90 seconds, when the image
   healthcheck runs, then it exits successfully without network access.
3. Given the heartbeat is missing, not a regular file, or older than 90 seconds,
   when the image healthcheck runs, then it exits non-zero without exposing
   runtime environment values.
4. Given a production candidate image is inspected, then it contains the exact
   bounded local healthcheck and the bot service retains no published ports;
   deployment waits for health and verifies `.State.Health.Status` is `healthy`
   both immediately after startup and after the stability window.
5. Given the deployed container is unhealthy, when release verification runs,
   then deployment fails and does not update the stable-image ledger.

## Negative Scenarios

1. A running process with a missing or stale heartbeat must not pass the probe.
2. A container reporting `running` with health status `unhealthy` must fail
   deployment verification.
3. An upstream Telegram or Hospital Alemán outage must not by itself mark the
   container unhealthy while the local event loop continues to advance.

## Requirements

- FR-001: Add a standard-library-only healthcheck module with configurable path
  and maximum age defaults of `/tmp/ha-bot-heartbeat` and 90 seconds.
- FR-002: The heartbeat writer must use the same default path as the probe and
  must not record secrets or user data.
- FR-003: Register an async JobQueue callback every 30 seconds with its first
  refresh 10 seconds after scheduling. The worker must not report a successful
  heartbeat before the Telegram application lifecycle starts.
- FR-004: Add an exec-form Docker `HEALTHCHECK` with bounded interval, timeout,
  start period, and retries; it must invoke only local Python code.
- FR-005: Pre-cutover image validation must require the exact healthcheck
  command, interval, timeout, start period, and retry count.
- FR-006: Deployment must require `healthy` status before and after its existing
  stability window.
- FR-007: Tests must cover fresh, missing, stale, and non-regular heartbeat
  inputs plus healthy and unhealthy deploy states.

## Success Criteria

- SC-001: Targeted healthcheck and deployment tests pass.
- SC-002: `git diff --check` and `pnpm run preflight` pass on the PR head.
- SC-003: Required GitHub checks and a current-head Codex review complete on the
  ready-for-review pull request.

## Assumptions

- `/tmp` remains a writable container-local tmpfs under the existing production
  Compose hardening.
- Docker Compose honors the image-defined healthcheck when the service does not
  override or disable it.
- Worker liveness is intentionally separate from external-service readiness.
