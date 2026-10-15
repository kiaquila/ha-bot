# Native Codex Review Compatibility

## Goal

Accept current native Codex receipt and edited summary formats while retaining
trusted authors, current-head evidence, severity checks, and unresolved findings.

## Scope

Review classification, required AI Review gate, event filter, rerun router,
regression tests, and the review contract. Runtime bot behavior is unchanged.

## Acceptance criteria

- Legacy summaries and formal native reviews continue to work.
- Trusted receipt comments require an explicit matching reviewed commit.
- Structured summaries require an exact full commit SHA, validated schema,
  completed code review, explicit false findings flags, and a consistent visible row.
- Edited summaries use their update time, including comments created before the request.
- Spoofed, malformed, duplicate, conflicting, negative, pending, stale, or unbound
  evidence cannot produce success. New requests cannot clear existing findings.
- Every unresolved Codex thread blocks success, including advisory and outdated threads.
- Created and edited events reach the actual runtime router and required check.
- Rerun handles a completed gate and the completion race of an active gate,
  deduplicates already evaluated evidence, and checks the live PR head before POST.
- The gate rejects a head change during evidence collection and stale workflow events.
- Local preflight and required GitHub checks pass; native review covers the final head.

## Negative scenario

A trusted bot updates a previously created summary to pending or findings=true.
An older clean receipt and a new request marker must not make that head pass.
