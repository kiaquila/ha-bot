# Implementation and Verification

1. Reproduce the original receipt-prefix rejection on the default-branch helper.
2. Parse observed receipt and structured-summary formats without stripping
   arbitrary HTML or accepting duplicate markers/JSON keys.
3. Connect latest evidence selection and unresolved-thread validation to the
   actual gate; validate the live head after collecting evidence.
4. Extend both the workflow filter and runtime event router. Serialize rerun
   events, wait with bounded backoff for active gates, and requeue only evidence
   that the selected latest run has not already evaluated.
5. Add Node regression tests to local preflight and the required baseline CI.
6. Obtain native review on the final PR head, validate all required checks,
   wait 120 seconds after merge readiness, recheck, and merge normally.

## Trust boundary and initial rollout

The workflow continues to execute gate/rerun/policy scripts from the default
branch. Policy configuration is loaded beside those scripts, so PR configuration
cannot expand the trusted reviewer set. No PR script is promoted into the
privileged execution path.

For initial rollout, a repository writer adds `gate:<full-reviewed-head-sha>`
to the PR after verifying genuine native review and resolved threads. This
eligible labeled PR event checks the original label actor's write permission
from paginated issue events and requires the
label SHA to equal the event head, checkout SHA, and live PR head. It runs the
complete reviewed gate with read-only permissions and main's reviewer policy.
All PR events on that same labeled head continue to use the reviewed runtime,
so rerun selection cannot choose a newer run with the old parser. Unlabeled
heads use main; retained labels cannot enable reviewed code on different heads. No bootstrap skip replaces native evidence.

The optional `workflow_dispatch` input `reviewed_gate_sha` supports read-only
exact-head diagnostics, but GitHub rulesets do not evaluate workflow-dispatch
jobs as required PR checks. A real diagnostic run confirmed this restriction;
only the eligible PR validation can establish merge readiness. Rerun selection
therefore gives eligible PR runs priority over later diagnostic dispatches.

After genuine native review of the final head, start the already reviewed local
`ai-review-rollout-watch.mjs` supervisor using the authorized operator's `gh`
session, then apply the SHA label. Keep it active through normal protected merge.
It polls comments/reviews/inline findings/thread state and requeues the real PR
gate on every change, supplying routing before the updated issue-comment
workflow reaches main. A stopped/erroring watcher blocks merge; restart it and
the full 120-second readiness window after native evidence/checks are green.

Recheck all applicable required pipelines after labeled validation and use
normal protected merge. A moved head requires fresh review and a new explicit
SHA label. No branch protection or trusted identity changes are needed.

## Verification

Original reproduction: identical body accepted=true without the receipt prefix,
accepted=false with the receipt prefix. Regression coverage executes the gate
CLI with an intercepted GitHub API, and evaluates the actual workflow condition.

Local verification passed: `pnpm run preflight` (58 Python tests and 14 Node
regression groups), plus `git diff --check`. Full observed receipt and summary
fixtures are in `tests/fixtures/native-codex-review.json`, with public sources.
