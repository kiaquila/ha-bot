# Plan: Encrypted On-Disk State Persistence

## Summary

Add a small persistence layer to `bot.py` that mirrors the durable parts of the
in-memory `USERS` dict to a single Fernet-encrypted file. The whole serialized
state record is encrypted as one blob (which inherently encrypts `usuario` /
`password`) and written atomically. On startup the bot decrypts and rehydrates
`USERS`; the access token is never persisted and is re-derived by the existing
`ensure_token` path on the next poll. If `HA_CRED_KEY` is not configured, the
layer is inert and the bot behaves exactly as it does today.

Prerequisite (met): feature `004-specialty-search-autologin` merged to `main`
(PR #5), providing `UserState.usuario` / `UserState.password`, the per-task
`paciente` / `plan` snapshot, and the `ha_login` / `ensure_token` /
`token_expired` helpers this layer relies on.

## Technical Context

- runtime: Python 3 worker (`worker: python bot.py`), `python-telegram-bot==20.7`
  job queue polling every 5 minutes.
- dependencies: `cryptography==49.0.0` (Fernet) added to `requirements.txt`; no
  other new deps.
- product paths: `bot.py`, `requirements.txt` (both listed in
  `.unicorn-hub/config.json` `productPaths`).
- data changes: introduces one encrypted state file on disk (default
  `HA_STATE_PATH`, e.g. `./ha_state.enc`), git-ignored, `0600` permissions.

### Serialization model

Persisted per user (keyed by Telegram `uid`):

- `paciente: int | null`
- `usuario: str | null`, `password: str | null`
- `tasks`: list of **active** task records — `task_id`, `especialidad`,
  `agenda_nombre`, `cod_acme`, `cod_instancia`, `month`, `year`, `paciente`,
  `plan`, `active`, `agenda_nombres`, and `notified` serialized as a **sorted
  list** (JSON has no set type) and restored to a `set` on load. Inactive
  (cancelled/auto-paused) tasks are not persisted.

Never persisted: `token` (ephemeral, re-derived via `ensure_token`), `wizard`
(`WizardState`, transient UI), `awaiting` (transient prompt state).

### Encryption & IO

- Key: `Fernet(HA_CRED_KEY)`. Absent/invalid key → `PERSIST = None`, layer inert,
  log once at startup that persistence is disabled (no key material logged).
- Save: `json.dumps` the state dict → `fernet.encrypt(bytes)` → write to
  `HA_STATE_PATH.tmp` → `os.replace` onto the real path → `chmod 0600`. Atomic
  replace means an interrupted write never corrupts the live file.
- Load: read file (missing → empty), `fernet.decrypt`, `json.loads`, rebuild
  `UserState`/`Task`. Any failure (`InvalidToken`, corrupt JSON) → log a warning
  with no contents and start empty.
- Save is called from the durable mutation sites: after successful login
  (password/token), after patient selection, after task create, after task
  cancel, after a `notified` slot is added, on `/login` and `auth:login`/
  `auth:token` resets, and once at the end of each poll cycle (to capture
  credential clears and auto-paused tasks).

## Scope Boundaries

- in scope: `bot.py` persistence layer, `requirements.txt`, deploy/docs/env
  documentation, `.gitignore` entry, persistence logic tests.
- out of scope: auth-flow changes, polling/matching/notification changes,
  database or multi-writer support, key rotation tooling, persisting UI/token.

## Constitution Check

- Spec-first: this folder (`spec.md` / `plan.md` / `tasks.md`) precedes and gates
  the product-code change; the folder is required by the guard for `bot.py` /
  `requirements.txt` edits.
- Testable boundaries: encryption + (de)serialization live in pure helpers
  (`serialize_state` / `deserialize_state` / `save_state` / `load_state`) that are
  unit-testable with a throwaway Fernet key and temp path, no portal or Telegram
  calls.
- PR-only: one branch, one worktree, one PR; no direct pushes to `main`.
- Simplicity: one new dependency (`cryptography`) and one encryption boundary.
  See Complexity Tracking for the whole-blob-vs-field-level decision.
- Deployability: absent `HA_CRED_KEY` preserves current behavior, so the default
  branch stays deployable whether or not the operator has configured a key;
  `HA_CRED_KEY` is added as an optional deploy secret.

## Complexity Tracking

- New dependency `cryptography` is justified: Fernet gives authenticated
  symmetric encryption (AES-CBC + HMAC) from a single env-provided key, which is
  the requested at-rest protection; hand-rolling this would be riskier than one
  well-audited dependency.
- Encrypt the **entire serialized record** as one Fernet blob rather than only
  the `usuario`/`password` fields. Rationale: it satisfies "encrypt credentials
  at rest" as a superset, also protects the `paciente` (a patient identifier) and
  task details at rest, and avoids a mixed plaintext/ciphertext file format. This
  is a deliberate simplicity choice, documented here per Principle VIII.
- No new persistence abstraction beyond four module-level functions; state still
  lives in the existing `USERS` dict as the single source of truth in memory.

## Verification

Evidence: 14/14 tests pass (`python3 -m unittest tests.test_persistence -v`) and a
two-process restart drill using the real `HA_CRED_KEY`-driven path.

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 (restart restores state) | Two-process drill: process 1 `save_state()`, fresh process 2 `load_state()` → paciente/usuario/task restored, `token None`. `test_roundtrip_restores_state_and_notified_set`. |
| AC-002 (no key → in-memory only) | `test_key_absent_writes_nothing`: `FERNET=None` → no file written, `load_state` no-op. |
| AC-003 (`notified` set round-trips) | `test_roundtrip_...`: `notified` restored as `set`; drill shows already-notified slot still present (no duplicate alert). |
| AC-004 (no plaintext creds on disk) | `test_credentials_not_plaintext_on_disk` + drill `grep`: raw file has no `usuario`/`password`; `Fernet.decrypt` recovers them. |
| AC-005 (token not persisted) | `test_token_not_persisted`: token string absent from ciphertext; reloaded `token is None`. |
| AC-006 (deps + docs, no secrets) | Diff: `cryptography==49.0.0` in `requirements.txt`; `HA_CRED_KEY` in ssh-autodeploy.md / README / `.env.example`; no real key/password/token/patient id committed. |

Negative scenario evidence:

- Corrupt file / rotated key / malformed decrypted schema →
  `test_corrupt_file_starts_empty`, `test_wrong_key_starts_empty`,
  `test_malformed_users_shape_starts_empty`,
  `test_malformed_user_record_starts_empty`: `load_state` logs a warning,
  returns empty, does not raise.
- Atomic write → `test_atomic_write_leaves_no_tmp_file`: after `save_state` the
  live file exists and no `*.tmp` remains (`os.replace` is atomic).
- Manual-token-only user → `test_manual_token_user_persists_tasks_without_credentials`:
  tasks/`paciente` restored, `usuario`/`token` are `None`.
- No secret leakage in logs → log statements only emit exception type names and
  counts; credentials/token are never passed to `log.*`.

## Risks

- Dependency on unmerged 004: 004 is currently uncommitted in a sibling worktree.
  Mitigation: implementation is held until 004 is on `main`; this branch rebases
  onto post-004 `main` before wiring `bot.py`, so it builds on the real
  `usuario`/`password`/`ensure_token` surface, not a guess.
- State file not persisted by the host: if the deploy wipes untracked files, state
  is lost on deploy. Mitigation: default `HA_STATE_PATH` is git-ignored and
  documented as operator-configurable to a persistent location; deploy uses
  `git reset --hard` (which keeps untracked files), not `git clean`.
- Key loss / rotation: changing `HA_CRED_KEY` makes the existing file
  undecryptable. Mitigation: treated as the corrupt-file negative scenario (start
  empty, warn); key rotation tooling is explicitly out of scope for this release.
- `cryptography` build/runtime availability on the host: it ships manylinux
  wheels, so `pip install -r requirements.txt` needs no compiler. Verify the
  pinned version installs cleanly on the deploy Python during implementation.
