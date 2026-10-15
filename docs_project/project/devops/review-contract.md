# Review Contract

Reviewers check the pull request against the active feature spec. Acceptance
criteria, negative scenarios, and known issues define expected behavior.

## Codex

Only configured trusted Codex identities provide evidence. A trusted human
request records a marker for the current full head SHA. Default-branch scripts
and configuration define the trust policy; PR configuration cannot add reviewers.

Native formal reviews require an exact current-head `commit_id` and submission
after the request. P0, P1, and P2 findings block merge. Every unresolved Codex
thread also blocks merge, including P3 and outdated threads. New request markers
do not erase current-head failures or unresolved findings.

Supported top-level evidence:

- Legacy `Codex Review:` clean verdicts with a matching reviewed commit. Legacy
  summaries without a commit require the trusted request and an unchanged head
  throughout the interval between request and response.
- A single leading `codex-review-receipt:v1` HTML marker, the explicit clean
  verdict, and one matching ten-character or full reviewed commit field.
- A single `codex-pull-request-review-summary` marker and `codex-review-state:v1`
  JSON state. The schema and field types must match the observed native format;
  code review must be completed for the full current SHA with both findings flags
  false and a consistent completed code-review table row. Duplicate JSON keys,
  markers, malformed fields, or contradictory visible evidence are rejected.

Edited summaries use `updated_at`, even when `created_at` precedes the request.
The latest trusted signal determines the outcome; an older positive result cannot
hide a newer pending, invalid, or negative signal. Reactions and the word
Completed alone never satisfy the gate. The head is checked again after evidence
collection, so a push during validation cannot turn a stale run green.

## Event handling and initial rollout

Created and edited native comments wake the rerun router. Events are serialized
per PR. The router waits with bounded backoff for an active gate to finish, then
reevaluates evidence once if the latest run did not already evaluate it. It never
reruns an older failed run in preference to a newer successful one, and checks the
live head immediately before requesting a rerun.

Gate and router scripts continue to run from the default branch. The initial
compatibility PR must pass that existing gate using genuine native formal review
or legacy evidence; no PR-script fallback, fabricated check, or protection bypass
is permitted. If the native service produces only an unsupported new format,
keep the PR open until a supported genuine review path is available.

## Claude

A trusted top-level comment must include `AI_REVIEW_AGENT: claude`,
`AI_REVIEW_SHA` equal to the full current head, and `AI_REVIEW_OUTCOME: pass`.
Advisory and block outcomes do not pass.

## Gemini

Native GitHub PR review from the configured app must match the current head.
Critical or high-severity findings block merge.
