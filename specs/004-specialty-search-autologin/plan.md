# Plan: Specialty Search, Automatic Login & Patient Selection

## Summary

Replace the 196-button specialty keyboard with a type-to-search + A→Z paginated
selector (reused for doctors), add credential-based automatic token refresh so
monitoring survives the 1-hour JWT expiry, and replace the error-prone manual
"enter patient number" step with name-based patient selection that stores the
correct internal paciente id. Also harden invalid-token detection (HTTP 401).
Everything stays in `bot.py`; no new dependency, no disk state.

## Technical Context

- runtime: Python Telegram worker (`python-telegram-bot` 20.7, `requests`)
- product paths: `bot.py`
- portal endpoints (all Bearer): `auth/login`, `referencias/.../datosProfesionalEspecialidad`,
  `turnos/turnosDisponiblesMes`, `usuarios/perfiles/dni/:nrodoc`,
  `usuarios/perfiles/socios/:nrosoc/credenciales/:credencial/menoresAutorizados`
- data changes: none persisted; credentials + token + selected patient are in-memory

## Design

- Rendering: `filter_indices`, `build_list_markup`, `specialty_view`, `doctor_view`.
  Selection callbacks stay `wiz:speci:{i}`/`wiz:doci:{i}` (index into the full list);
  paging state (`spec_query`,`doc_query`) on `WizardState`, captured in back snapshots.
- Auth: `ha_login`, `token_expired` (JWT exp, 120s skew), `ensure_token` (refresh from
  stored creds). All token reads route through `ensure_token`.
- Patients: `fetch_patients(token)` derives ids from the JWT `ps` claim (authoritative —
  the slot API validates against it) and enriches names/plan from the titular profile
  and authorized minors. `present_patient_selection` auto-selects a lone patient or
  shows name buttons (`pat:{id}`); the chosen internal id + plan are stored and used in
  the slot payload. Each monitoring task snapshots that id + plan at creation, so later
  re-auth or patient switches do not silently move existing monitors. No manual number
  entry.
- Invalid token: `_is_invalid_token_error` treats HTTP 401 (or an "Invalid token" body)
  as a token failure; credentials users refresh silently next cycle, manual users are
  asked for a fresh token.
- Onboarding: after auth (login or manual token) → patient selection → menu. `/login`
  resets auth + patient and restarts. Password message deleted on receipt; never logged.

## Scope Boundaries

- in scope: specialty/doctor selector, auth client + refresh, patient selection, 401 fix
- out of scope: disk persistence (follow-up), slot polling/matching logic, notification
  text, RU→ES synonyms

## Constitution Check

- Spec-first: complete `spec.md`, `plan.md`, `tasks.md` accompany the `bot.py` change.
- Testable boundaries: pure/mockable helpers covered by importable suites; portal
  contracts (`auth/login`, `fetch_patients`) verified live.
- PR-only: work stays on `agent/004-specialty-search-autologin`.
- Simplicity: single file, no new dependency, credentials in memory (no new at-rest
  surface); manual-token retained as a first-class choice.
- Deployability: `Procfile.py` and install steps unchanged.

## Complexity Tracking

`fetch_patients`' fallback (ps ids + generic labels when non-auth enrichment fails) is
justified, not a shim: `ps` is the authoritative source of valid ids (one profile
endpoint was observed returning 502), so degrading to valid-ids-without-names keeps
correctness while never storing a wrong id. Token rejection does not use this
fallback; it returns no patients so onboarding asks for fresh auth.

## Verification

| Acceptance criterion | Evidence |
| --- | --- |
| AC-001 / AC-002 | logic suite: A→Z covers all 196, ≤100 buttons/page, `oftal`→OFTALMOLOGIA |
| AC-003 | logic suite: 130-doctor list fully reachable, ≤100 buttons/page |
| AC-004 | logic suite: `ensure_token` refreshes expired JWT, skips when valid |
| AC-005 / AC-006 | patient-flow suite: multiple patients by name with internal ids; single auto-selected; LIVE `fetch_patients` confirmed the operator account's expected patient set with raw identifiers kept out of repository docs |
| AC-007 | patient-flow suite: `_is_invalid_token_error` True on 401, False on 500 |
| AC-008 | code path: malformed/invalid manual token clears the bad token and re-prompts for a replacement |
| Negative 1 | live `ha_login` on bogus creds raises `AuthError` |
| Negative 2 | password message deleted; no password/token in any log statement |
| Negative 3 | patient-flow suite: enrichment failure falls back to ps ids |

## Risks

- JWT success field parsed defensively; a renamed field → clear AuthError, not a bad token.
- Blocking `requests` calls run on the event loop (pre-existing pattern), unchanged.
- Patient names are PII: fetched at runtime, shown only to the owning user, never logged
  or committed.
