# Tasks: Specialty Search, Automatic Login & Patient Selection

## Setup

- [x] T001 Confirm root cause live (Telethon-driven prod bot returns 100 buttons; API returns 196).
- [x] T002 Recover `auth/login`, profile, and minors contracts from portal bundle + live probes.
- [x] T003 Create worktree/branch `agent/004-specialty-search-autologin` off `main`.

## Implementation

- [x] T004 Add search/pagination helpers (`filter_indices`, `build_list_markup`, `specialty_view`, `doctor_view`).
- [x] T005 Rewrite specialty step in `cmd_new` to search-first; add browsing callbacks.
- [x] T006 Rewrite doctor step to the same paged/search selector.
- [x] T007 Add auth client + refresh (`ha_login`, `token_expired`, `ensure_token`, `AuthError`).
- [x] T008 Add onboarding auth-mode choice + `/login`; delete password message; route token reads through `ensure_token`.
- [x] T009 Add `fetch_patients` + `present_patient_selection` (name-based selection, internal id + plan); replace manual patient-number entry.
- [x] T010 Harden invalid-token detection (`_is_invalid_token_error` on HTTP 401).

## Verification

- [x] T011 `python3 -m py_compile bot.py` passes.
- [x] T012 Logic suite: search finds OFTALMOLOGIA, A→Z coverage complete, ≤100 buttons, 130-doctor coverage, token expiry/refresh, manual pass-through.
- [x] T013 Patient-flow suite (mocked): 2 patients by name with internal ids, single auto-select, enrichment-failure fallback, 401 detection.
- [x] T014 LIVE: `fetch_patients` returns the expected account patients using valid internal ids (raw identifiers redacted from repo docs); `ha_login` on bogus creds raises `AuthError`; `turnosDisponiblesMes` accepts the internal id and rejects the user-facing credencial (401).
- [x] T015 Run `pnpm run preflight` locally.
- [x] T016 Independent review pass (code-reviewer + security-reviewer): LOW risk, no blocking findings; addressed the actionable items below.

## Review fixes applied

- Persistent-401 silent loop → per-user `auth_fail_count` with `AUTH_FAIL_CAP`; credential users self-heal up to the cap, then monitoring pauses and notifies once (reset on any success / re-auth).
- Background `_prompt_reauth` no longer clobbers an in-progress `awaiting` step or spams; background patient re-prompts removed (selection is interactive only).
- `fetch_patients`: `ps` normalized to a list; `sub`/`nrosoc`/`credencial` require digits before URL interpolation (injection hardening); enrichment failures log the exception TYPE only (no DNI/nrosoc/credencial URL in logs).
- `pat:` selection accepts only an id present in the user's own list.
- Slot logging redacts `paciente` and logs a slot count instead of the full response.
- `/new` routes a 401 to re-auth instead of a generic error.
- Malformed manual tokens now clear the bad token and keep the user in token-entry mode after patient selection fails.
- Patient enrichment treats 401/invalid-token as failed auth, not as a generic-label fallback.
- Patient chooser options are limited to ids present in the token claim; profile/minors data only enriches names and plan.
- Manual-token mode clears stale stored credentials; login mode clears stale manual token state.
- Tasks snapshot patient id and plan at creation, so later `/login` or patient switches do not silently retarget existing monitors.
- Invalid-token retry counts are tracked per task, so one rejected monitor cannot be reset by another task's success.
- Accepting fresh credentials or a new manual token resets active task-dict values' retry counts before polling resumes.
- Background auto-login rejection clears stored credentials before prompting re-auth, avoiding repeated bad login attempts.
- Not changed (documented): blocking `requests` on the event loop (pre-existing); password-over-chat exposure (inherent to Telegram, mitigated by message deletion).

## Process Memory

### Dead Ends

- Hypothesis "endpoint returns only the patient's referrals" was wrong: `datosProfesionalEspecialidad` returns the full ~196-specialty catalog. The defect was Telegram's silent 100-button clip.
- Assumed the slot payload `paciente` was the credencial (the number users type). Live test proved it must be the INTERNAL paciente id from the token `ps` claim; the credencial returns 401. So the old manual-number flow was silently broken for anyone entering a credencial. Raw patient identifiers were intentionally left out of repo docs.
- Static extraction of the `auth/login` body from `main.js` failed (lazy chunk); recovered from webpack chunk `535`.

### Decisions

- Credentials kept in memory only (no disk, no `cryptography` dep): same threat model as the existing in-memory token. Disk persistence is follow-up feat-005.
- Patient selection derives valid ids from the JWT `ps` claim and names from profile + minors; on enrichment failure it degrades to `ps` ids with generic labels (never a wrong id).
- Manual-token stays a first-class auth mode.
- Selection callbacks keep indexing the full option list so existing handlers/back-nav stay intact.

### Known Issues

- User state (tasks, credentials, token, selected patient) is still lost on process restart; auto-login removes the hourly re-paste but not restart re-entry. Tracked as feat-005 (encrypted persistence).
- Blocking `requests` calls remain on the event loop (pre-existing).
- Cross-language search (Russian specialty names) is not supported; users type the Spanish/latin fragment.
