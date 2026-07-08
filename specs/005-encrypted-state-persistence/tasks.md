# Tasks: Encrypted On-Disk State Persistence

Status legend: `[x]` done, `[ ]` pending.

## Setup

- [x] T001 Confirm active feature folder `specs/005-encrypted-state-persistence/`
  and isolated worktree/branch (`claude/bold-cohen-5d204d`).
- [x] T002 Read constitution, 004 source (`usuario`/`password`/`ha_login`/
  `ensure_token`, per-task `paciente`/`plan`), deploy docs, `.unicorn-hub/config.json`.
- [x] T003 Write `spec.md` and `plan.md` (design of record).
- [x] T004 GATE cleared: 004 merged to `main` (PR #5); fast-forwarded this branch
  onto post-004 `main` (`03c26dd`) so `bot.py` carries the real auth surface.

## Implementation

- [x] T005 Verified current `cryptography` release (49.0.0) and Fernet API in a
  venv before coding.
- [x] T006 Add `cryptography==49.0.0` to `requirements.txt`.
- [x] T007 `bot.py` config: read `HA_CRED_KEY` / `HA_STATE_PATH`; build module-level
  `FERNET` (or `None` when key absent/invalid), logging the disabled state with no
  key material.
- [x] T008 `_task_to_dict` / `_task_from_dict` / `serialize_users`: dump `paciente`,
  `plan`, `usuario`, `password`, and active task records (`notified` as a sorted
  list) and back; exclude `token`, `wizard`, `awaiting`, `pending_patients`.
- [x] T009 `save_state()`: `json.dumps` → `Fernet.encrypt` → write `*.tmp` →
  `chmod 0600` → `os.replace`; no-op when `FERNET is None`.
- [x] T010 `load_state()`: read + decrypt + `json.loads` + rehydrate `USERS`;
  missing file → start empty; `InvalidToken`/corrupt JSON → warn (no contents) and
  start empty.
- [x] T011 Call `load_state()` first in `main()`.
- [x] T012 Call `save_state()` at durable mutation sites: login success
  (password/token), patient selection (`pat:`), task create (`wiz:month`), task
  cancel (`tasks:cancel`), `/login` + `auth:login`/`auth:token` resets, after
  `t.notified.add`, and once per poll cycle (captures credential clears +
  auto-paused tasks).
- [x] T013 Confirmed no credential/token value reaches `log.*`; token stays
  re-derived via `ensure_token` only.
- [x] T014 Add default state file/path to `.gitignore`.
- [x] T015 Add `.env.example` (`BOT_TOKEN`, `HA_CRED_KEY`, `HA_STATE_PATH`,
  placeholders + Fernet key-generation one-liner).
- [x] T016 Document `HA_CRED_KEY`/`HA_STATE_PATH` in
  `docs_project/project/devops/ssh-autodeploy.md` and `README.md`; no real secrets.
- [x] T017 Add `tests/test_persistence.py` (round-trip incl. `notified` set,
  key-absent, no-plaintext-on-disk, token-not-persisted, corrupt/rotated-key,
  only-active, manual-token, atomic-write, `0600` file mode, invalid-key disables
  persistence, `Todos` `agenda_nombres` round-trip).
- [x] T018 Bundle the owner-requested `AGENTS.md` Commit Protocol (mandatory
  `Co-authored-by:` trailer on every commit/squash-merge).

## Verification

- [x] T019 `pnpm run preflight` — all gates pass (feature-memory, repo baseline,
  context budget ×2, `py_compile bot.py`).
- [x] T020 `python -m unittest tests.test_persistence -v` — 12/12 pass.
- [x] T021 Two-process restart drill with a real `HA_CRED_KEY`: process 1 saves,
  fresh process 2 restores paciente/credentials/task; `token None`; `notified`
  back as a `set`; already-notified slot preserved (no duplicate alert); file has
  no plaintext `usuario`/`password`.
- [x] T022 `grep` diff for real keys/passwords/tokens/patient identifiers — none.

## Process Memory

### Dead Ends

- Basing 005 on pre-004 `main` was rejected: that `bot.py` lacked
  `usuario`/`password`/`ensure_token`, so persistence wiring would reference
  undefined symbols. Waited for 004 to merge, then fast-forwarded onto it.
- Considered field-level encryption of only `usuario`/`password`. Rejected for a
  single whole-record Fernet blob: simpler, one file format, and also protects the
  `paciente` (a patient id) and task data at rest.

### Decisions

- Encrypt the entire serialized record as one Fernet blob; never persist the
  access `token` (re-derived via `ensure_token` on the next poll).
- Persist only **active** tasks; cancelled/auto-paused tasks are dropped so they
  do not resurrect on restart.
- Persistence is opt-in via `HA_CRED_KEY`; absent/invalid key ⇒ in-memory-only,
  preserving pre-005 behavior and keeping the default branch deployable.
- Pin `cryptography==49.0.0` (latest; manylinux wheels, no host compiler needed).
- Save synchronously at mutation sites plus once per poll cycle — simple and
  correct for a tiny file and a handful of users.
- Adversarial multi-lens review (security/spec-regression/test-adequacy) returned
  only low-severity items, all addressed pre-PR: refreshed the stale
  memory-only comment on `usuario`/`password`; added `save_state()` to the
  `auth:login`/`auth:token` resets for parity with `/login`; added tests for
  `0600` mode, the invalid-key branch, and `Todos` `agenda_nombres` round-trip.

### Known Issues

- Rotating or losing `HA_CRED_KEY` makes an existing state file undecryptable;
  handled as the corrupt-file path (start empty + warn). Key-rotation tooling is
  out of scope.
- State durability depends on the host providing a persistent `HA_STATE_PATH`.
  Deploy uses `git reset --hard` (keeps untracked files); the path is
  operator-configurable and gitignored.
- `save_state()` does blocking file IO on the event loop; negligible for a few-KB
  file, but worth revisiting if user/task counts grow substantially.
- No pytest runner is wired into `pnpm run preflight` (only `py_compile`); the
  persistence tests are run manually and captured as SC-002 evidence.