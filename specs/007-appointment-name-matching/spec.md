# Spec: Appointment Name Matching

## Goal

Ensure that HA Bot notifies a monitor when the portal returns an appointment
whose doctor name differs from the selected name only by case, diacritics,
punctuation, or a common medical title.

## Scope

In scope:

- Canonical doctor-name token matching in `bot.py`.
- A safe aggregate diagnostic when returned slots are rejected by the
  doctor-name filter.
- Unit coverage for compatible and incompatible name forms.
- Feature memory for this bug fix.

Out of scope:

- Changing the Hospital Alemán request payload, month selection, booking flow,
  authentication, polling cadence, or notification deduplication.
- Broad substring/fuzzy matching that could notify for a different doctor.
- Logging patient data, access tokens, appointment details, or raw doctor names.

## User Stories

### User Story 1

As a monitor owner, I want an available appointment to be reported when the
portal renders the selected doctor's name in an equivalent format, so I do not
miss a valid slot because of presentation-only differences.

### User Story 2

As an operator, I want a privacy-safe indication that name filtering skipped
slots, so I can distinguish a matching issue from authentication or polling
failure.

## Acceptance Criteria

1. Given a selected doctor name and returned agenda name that differ only by
   case, accents, punctuation, or `Dr.`/`Dra.`, when a slot is polled, then the
   bot treats them as the same doctor and sends one notification.
2. Given genuinely different doctor names, when a slot is polled, then the bot
   does not notify and emits one aggregate unmatched-name diagnostic for that
   poll.
3. Given an unmatched-name diagnostic, then it contains neither patient data,
   access tokens, raw doctor names, nor appointment date/time values.
4. Given an already notified matching slot, when it is polled again, then the
   existing deduplication behavior remains unchanged.

## Negative Scenarios

1. Given names that share a partial token but identify different doctors, when
   a slot is polled, then the bot keeps rejecting the slot.
2. Given several unmatched slots in one response, when the poll ends, then the
   bot emits one aggregate diagnostic rather than one sensitive log per slot.

## Requirements

- FR-001: Canonical matching must be accent-insensitive and punctuation-insensitive.
- FR-002: Canonical matching must ignore common `Dr.`/`Dra.` title tokens only.
- FR-003: The existing exact-token boundary for meaningful name tokens must stay
  in place; arbitrary substring matching is forbidden.
- FR-004: A non-matching response must produce a concise, aggregate, safe log.
- FR-005: Tests must cover a previously failing canonical-name variant and a
  genuinely different name.

## Success Criteria

- SC-001: Targeted name-matching tests and `pnpm run preflight` pass.
- SC-002: A reviewed merge to `main` deploys through the existing Docker
  production workflow without changing its deployment contract.

## Assumptions

- Portal and reference responses can represent the same doctor with different
  casing, diacritics, punctuation, or medical titles.
- The existing API payload still narrows candidate slots before name matching.
