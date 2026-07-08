# Spec: Encrypted On-Disk State Persistence

## Goal

Let active monitoring survive a worker restart by persisting each user's portal
credentials, `paciente`, and active tasks to an encrypted on-disk store, so the
bot resumes automatically instead of losing all state when `python bot.py`
restarts.

## Background

Feature `004-specialty-search-autologin` added automatic login: the bot stores
portal credentials (`usuario`, `password`) in memory and refreshes the access
token itself via `ha_login` / `ensure_token`. Everything still lives only in the
in-memory `USERS` dict (`UserState`), so a deploy, crash, or systemd restart of
the `worker: python bot.py` process wipes all credentials, the selected
`paciente`, and every active `Task`. Users must then re-run `/login` and recreate
every monitoring task. Because the production host auto-deploys on every merge to
`main` (see `docs_project/project/devops/ssh-autodeploy.md`), restarts are
routine, and monitoring silently stalls until each user notices and reconfigures.

This feature is the explicit out-of-scope item deferred by 004
(`specs/004-specialty-search-autologin/spec.md`: "Persisting user state / tasks /
credentials to disk (still in-memory only)").

## Scope

In scope:

- `bot.py`: a persistence layer that serializes durable per-user state
  (`paciente`, `plan`, `usuario`, `password`, and active `Task` definitions —
  each carrying its own `paciente`/`plan` snapshot and `notified` set) to a single
  Fernet-encrypted file; load-on-startup; save on durable mutations.
- Fernet encryption keyed from environment variable `HA_CRED_KEY`; graceful
  fallback to in-memory-only when the key is absent or invalid.
- `requirements.txt`: add `cryptography`.
- Deploy/docs: document `HA_CRED_KEY` (and the optional state-path override) in
  `docs_project/project/devops/ssh-autodeploy.md`, `README.md`, and a new
  `.env.example`, plus key-generation guidance. `.gitignore` for the state file.
- `AGENTS.md`: add a mandatory Commit Protocol requiring a `Co-authored-by:`
  trailer on every commit and squash-merge (bundled per owner request).
- `tests/test_persistence.py`: logic tests for the persistence layer.

Out of scope:

- Changing the auth flow, slot-polling logic, matching, or notification format.
- Persisting transient UI state (`WizardState`, `awaiting`) or the access token.
- A database, multi-process access, or key rotation/re-encryption tooling.
- Migrating or encrypting historical state (there is none — first release).

## User Stories

### User Story 1 — Monitoring survives a restart

As a patient with active monitoring, I want the bot to remember my login,
`paciente`, and tasks across a restart, so that a routine deploy or crash does
not silently stop my monitoring or make me reconfigure everything.

### User Story 2 — No duplicate alerts after restart

As a patient, I want slots the bot already told me about to stay "already
notified" after a restart, so that I do not get a burst of duplicate
notifications for openings I have already seen.

### User Story 3 — Persistence is optional and safe

As the operator, I want persistence to activate only when I provide an
encryption key, and credentials to be encrypted at rest, so that running without
a key keeps today's in-memory behavior and a leaked state file does not expose
plaintext credentials.

## Acceptance Criteria

1. Given `HA_CRED_KEY` is set and a user has stored credentials plus active
   tasks, when the worker process restarts, then on startup the bot restores that
   user's `paciente`, credentials, and active tasks, and monitoring resumes on
   the next poll with no user action.
2. Given `HA_CRED_KEY` is unset or invalid, when the bot starts, then persistence
   is disabled, the bot runs exactly as today (in-memory only), and no state file
   is created.
3. Given a `Task` with a populated `notified` set, when state is saved and later
   reloaded, then `notified` is restored as a `set` and previously-notified slots
   are not re-notified after restart.
4. Given credentials are persisted, when the state file is inspected on disk,
   then `usuario` and `password` do not appear in plaintext (the file content is
   Fernet ciphertext).
5. Given the access token, when state is saved, then the token is not written to
   disk; on load `token` is `None` and is re-derived via `ensure_token` /
   `ha_login` from stored credentials on the next poll.
6. Given the change is reviewed, when the diff is inspected, then `cryptography`
   is pinned in `requirements.txt`, `HA_CRED_KEY` is documented in deploy docs,
   README, and `.env.example`, and no real key, password, token, or patient
   identifier appears anywhere in the repository.

## Negative Scenarios

1. Given a missing, corrupt, or undecryptable state file (e.g. `HA_CRED_KEY`
   changed), when the bot starts, then it logs a warning without printing file
   contents and starts with empty state instead of crashing.
2. Given a write is interrupted mid-flush, when the process restarts, then the
   previous good state file is intact (writes are atomic via temp file + replace),
   so a crash never leaves a truncated/corrupt store.
3. Given a manual-token-only user (no stored `usuario`/`password`), when the
   worker restarts, then `paciente` and tasks are restored, the token is not
   restored, and the user is re-prompted for a token exactly as today — no crash.
4. Given any INFO/WARNING log line, when persistence loads, saves, or logs in on
   behalf of a user, then `usuario`, `password`, and the token never appear in
   logs.

## Requirements

- FR-001: Add an encrypted persistence layer that serializes per-user durable
  state (`paciente`, `usuario`, `password`, and active `Task` definitions) to a
  single Fernet-encrypted file.
- FR-002: Derive the Fernet key from `HA_CRED_KEY`; if it is absent or invalid,
  disable persistence and fall back to in-memory-only (current behavior), logging
  the disabled state once without leaking the key.
- FR-003: Serialize `Task.notified` (a `set`) as a JSON list and restore it as a
  `set`; never persist `WizardState`, `awaiting`, or the access `token`.
- FR-004: Load state on startup before polling begins; tolerate a missing,
  corrupt, or undecryptable file by starting empty without crashing and without
  logging file contents.
- FR-005: Persist on every durable mutation (successful login, `paciente` set,
  task create, task cancel, `notified` update) using an atomic temp-file +
  `os.replace` write, with `0600` file permissions.
- FR-006: Never log credentials or tokens; keep the token ephemeral and re-derive
  it via `ensure_token` / `ha_login` after load.
- FR-007: Add `cryptography` to `requirements.txt`; document `HA_CRED_KEY` (and
  the optional `HA_STATE_PATH`) in `docs_project/project/devops/ssh-autodeploy.md`,
  `README.md`, and a new `.env.example`, with key-generation guidance and no real
  secrets.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally on the branch.
- SC-002: Persistence logic tests pass: round-trip of state including the
  `notified` set, key-absent fallback, no-plaintext-credentials-on-disk, and
  token-not-persisted.
- SC-003: Restart drill — with `HA_CRED_KEY` set, create a task under stored
  credentials, restart the process, and confirm the task resumes from disk and an
  already-notified slot produces no duplicate notification.

## Assumptions

- Feature `004-specialty-search-autologin` is merged to `main` (PR #5); it
  provides the `usuario`/`password` fields, the per-task `paciente`/`plan`
  snapshot, and the `ha_login`/`ensure_token`/`token_expired` helpers this feature
  builds on.
- `HA_CRED_KEY` is a valid url-safe base64 32-byte Fernet key supplied as a host
  or CI environment variable, never committed to the repository.
- The deployment host provides a persistent path for the state file
  (`HA_STATE_PATH`) that survives worker restarts; the deploy's `git reset --hard`
  to the pushed SHA does not remove untracked runtime files.
- A single worker process owns the state file (no concurrent writers).
