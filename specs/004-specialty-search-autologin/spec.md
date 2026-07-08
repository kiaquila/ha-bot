# Spec: Specialty Search, Automatic Login & Patient Selection

## Goal

Make `/new` show every specialty the portal offers, keep the bot authorized
without hourly manual tokens, and let a user pick which patient (themselves or a
family member) to monitor — by name, using a valid id, never a hand-typed number.

## Background

Confirmed against the live portal and the production bot (Telethon-driven):

1. `GET referencias/agenda/datosProfesionalEspecialidad` returns the full catalog
   (~196 specialties incl. `OFTALMOLOGIA`). `cmd_new` rendered 196 inline buttons
   in one keyboard; Telegram silently clips at 100, hiding the alphabetically-last
   ~96 (48%: OFTALMOLOGIA, ONCOLOGIA, PEDIATRIA, PSIQUIATRIA, TRAUMATOLOGIA*,
   UROLOGIA*, …). Reproduced: exactly 100 buttons ending at `HEMATOLOGIA ONCOLOGICA`.
2. The portal JWT expires ~1 h after issue (`exp − iat = 3600`). Background
   monitoring polls every 5 min for hours/days, so the token dies mid-run.
3. `turnosDisponiblesMes` validates the payload's `paciente` against the token's
   `ps` claim and returns 401 `"Invalid token compared against request values"`
   otherwise. The value must be the INTERNAL paciente id, not the user-facing
   credencial number. Combined with (4), a user who typed their credencial got
   silently-failing monitoring.
4. On a 401, `requests.raise_for_status()` raises `HTTPError` whose string is
   "401 Client Error…" — it lacks "Invalid token", so the old detection missed it
   and monitoring stalled without telling the user.

## Scope

In scope (all in `bot.py`, no new dependency, no disk state):

- Specialty selection UX: type-to-search + A→Z pagination; same for the doctor step.
- Automatic login/token-refresh via portal credentials held in memory.
- Patient selection by name (titular + authorized minors), replacing the manual
  patient-number entry; store the internal paciente id + plan.
- Robust invalid-token detection (HTTP 401 or "Invalid token" body).

Out of scope:

- Persisting user state / tasks / credentials to disk (still in-memory only) —
  tracked as a follow-up (encrypted store).
- Changing slot-polling logic, matching, or notification format.
- Cross-language (RU→ES) synonym search.

## User Stories

### User Story 1 — Find any specialty
As a patient, I want to type part of a specialty name or browse A→Z, so that I
can select any specialty, including those past the 100th alphabetically.

### User Story 2 — Stay logged in
As a patient running long monitoring, I want the bot to log in and refresh the
token itself, so that monitoring keeps working without hourly token pasting.

### User Story 3 — Pick the right patient by name
As an account holder with family members, I want to choose whom to monitor from
a list of names, so that the correct patient id is used and I never guess a number.

### User Story 4 — Keep manual token option
As a privacy-conscious patient, I want to keep pasting a token instead of sharing
my password.

## Acceptance Criteria

1. Given >100 specialties, when the user runs `/new`, then every specialty is
   selectable via search or pagination and no keyboard exceeds 100 buttons.
2. Given the user searches `oftal`, then `OFTALMOLOGIA` appears as a button.
3. Given a specialty has >100 doctors, then all remain reachable, ≤100 buttons/page.
4. Given login+password, when the token nears expiry, then the bot re-logins and
   continues with no user action.
5. Given an account with multiple patients, when auth completes, then the bot lists
   the patients by name and the chosen internal paciente id is used for slot queries.
6. Given a single-patient account, when auth completes, then that patient is
   auto-selected without a prompt.
7. Given the token is rejected (HTTP 401) mid-poll, then a credentials user is
   refreshed silently and a manual-token user is asked for a new token (no silent stall).
8. Given the manual-token option, when the token is invalid, then the bot asks for
   a new token.
9. Given active monitors had invalid-token failures, when fresh credentials or a
   replacement manual token is accepted, then active monitors get a fresh retry
   cycle without reactivating monitors already paused at the failure cap.

## Negative Scenarios

1. Wrong credentials → surface the portal message and re-prompt; never store an
   invalid password as valid.
2. Password sent in chat → the message is deleted and the value is never logged.
3. A non-auth profile/minors enrichment call fails → patient list falls back to the
   token's `ps` ids with generic labels (still valid ids), never a wrong id, no crash.
4. Stored credentials rejected during background refresh → clear them before
   prompting re-auth so polling does not keep retrying a bad password.
5. Empty specialty/doctor search → offer retry + full list, no crash.

## Requirements

- FR-001: Specialty step defaults to a search prompt; free text filters accent-insensitively.
- FR-002: Specialty and doctor lists paginate at ≤80/page (< 100-button cap).
- FR-003: `auth/login` client + proactive JWT-expiry detection + auto re-login from
  in-memory credentials.
- FR-004: Onboarding offers login+password or manual token; `/login` re-authorizes.
- FR-005: Credentials in memory only, never persisted, never logged; the password
  chat message is deleted on receipt.
- FR-006: Derive the patient list from the token's `ps` claim (valid ids) enriched
  with names from `perfiles/dni/:nrodoc` (titular) and `.../menoresAutorizados`;
  select by name; store the internal paciente id and plan. No manual number entry.
- FR-007: Treat HTTP 401 (or an "Invalid token" body) as an invalid token everywhere
  slots are fetched.

## Success Criteria

- SC-001: `pnpm run preflight` passes locally.
- SC-002: Logic + patient-flow suites pass (search, pagination coverage, ≤100 buttons,
  token expiry/refresh, patient derivation with correct ids, 401 detection).
- SC-003: Live `fetch_patients` confirms the operator account's patient derivation
  without recording patient identifiers in repository docs; live `auth/login` on
  bad creds raises the portal error.

## Assumptions

- Portal contracts verified live on 2026-07-07: `auth/login` (`{usuario,password}`→JWT),
  `perfiles/dni/:nrodoc`, `.../menoresAutorizados`, and that `turnosDisponiblesMes`
  wants the internal paciente id from `ps`.
