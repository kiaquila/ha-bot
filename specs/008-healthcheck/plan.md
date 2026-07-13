# Plan: Container Healthcheck

## Summary

Add a local heartbeat shared by the Telegram JobQueue and an image-defined
Docker probe. The probe checks only file type and freshness, so it detects a
stalled event loop without coupling container restarts to Telegram or Hospital
Alemán availability. Extend the existing deploy guard to require Docker health
before accepting the image and again after the stability window.

## Technical Context

- runtime: Python 3.12 Telegram long-polling worker
- scheduler: `python-telegram-bot[job-queue]==20.7`
- heartbeat path: `/tmp/ha-bot-heartbeat`
- heartbeat interval: 30 seconds; first scheduled refresh after 10 seconds
- freshness threshold: 90 seconds
- Docker probe: exec-form `python healthcheck.py`, 30-second interval,
  3-second timeout, 20-second start period, 3 retries
- deployment: existing `docker compose up --wait` plus explicit Docker health
  inspection on both sides of the stability window
- dependencies: Python standard library only

## Scope Boundaries

- in scope: `healthcheck.py`, JobQueue registration, Docker image metadata,
  Compose/deploy validation, tests, deployment docs, and feature memory
- out of scope: HTTP endpoints, inbound ports, external readiness checks,
  monitor behavior, and host-wide Docker changes

## Constitution Check

- Spec-first: this folder defines the behavior before product changes.
- Testable boundaries: heartbeat freshness is a pure local file boundary;
  deployment behavior is exercised through the existing fake Docker contract.
- Test-first bias: fresh/stale probe and unhealthy-deploy tests are added before
  implementation and their initial failures are recorded in `tasks.md`.
- PR-only: the work uses one branch, one in-repository worktree, and one PR.
- Simplicity: one small standard-library module is shared by the writer and
  probe; no server or dependency is introduced.
- Deployability: the existing bounded Compose wait and stability checks become
  stricter without changing project isolation or secret handling.

## Design

### 1. Record local event-loop progress

The bot schedules an async JobQueue callback every 30 seconds with `first=10`.
It deliberately does not write a pre-initialization success marker: the first
heartbeat comes from the running application lifecycle. The callback performs
only a local metadata update. The task poller also records progress between
tasks so sequential bounded portal calls do not make a long, advancing queue
look stalled.

### 2. Probe freshness without external dependencies

`healthcheck.py` reads a path and maximum age from non-secret environment
configuration with safe defaults. It succeeds only for a regular file whose
modification time is within the configured age. Missing, stale, future-dated,
or non-regular paths fail closed with a concise non-sensitive error.

### 3. Gate deployment on Docker health

The Dockerfile installs an exec-form probe. Pre-cutover image inspection requires
its exact command and bounded timings. After `compose up --wait`, deploy
inspection must see `healthy`; the same condition is checked after the stability
window before the image ledger is advanced.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 | Unit test verifies JobQueue interval/first values, no pre-init marker, and callback refresh. |
| AC-002 | Probe unit test accepts a fresh regular heartbeat. |
| AC-003 | Probe tests reject missing, stale, future-dated, and non-regular inputs. |
| AC-004 | Dockerfile/image contract tests plus deploy command log and health inspection assertions. |
| AC-005 | Fake-Docker unhealthy scenario fails before ledger creation. |

Negative scenario evidence:

- Probe tests never invoke network code and cover stale/missing files.
- Deployment test supplies `running=true` with `health=unhealthy` and expects a
  failed release with no stable-image ledger.

## Risks

- A threshold that is too short could flap during scheduler delay. Mitigation:
  the 90-second threshold allows two missed 30-second refreshes before a probe
  fails, with Docker retries providing an additional bounded grace period.
- The first scheduled heartbeat can be delayed during initialization.
  Mitigation: no pre-initialization marker is written, and Docker's bounded
  start period/retries plus Compose wait allow healthy startup while failing a
  worker whose application lifecycle never begins.
- A later image change could remove or weaken the probe. Mitigation: pre-cutover
  inspection requires the exact healthcheck command and timing metadata.

## Documentation Source

Context7 documentation for `python-telegram-bot` confirms that
`JobQueue.run_repeating` accepts an async `CallbackContext` callback and numeric
`interval`/`first` values interpreted as seconds. The implementation uses the
repository-pinned 20.7-compatible signature already used by `poll_tasks`.
