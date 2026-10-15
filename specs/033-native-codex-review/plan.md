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

The workflow provides an explicit `workflow_dispatch` input, `reviewed_gate_sha`,
for initial validation of already reviewed gate code. That path has read-only
contents, issues, and pull-request permissions, uses policy configuration from
main, forbids automatic review triggers, and requires the input SHA to match the
workflow SHA, checkout SHA, and live PR head. It executes the complete gate and
must find genuine native evidence for that exact head; no bootstrap success or
skip replaces review. Ordinary PR events always use default-branch gate scripts.

Before invoking this path, the operator verifies native review and resolved
threads for the pinned full SHA. Recheck all applicable required pipelines after
manual validation and use normal protected merge. A moved head requires a fresh
review and explicit new input. No branch protection or trusted identity changes
are needed.

## Verification

Original reproduction: identical body accepted=true without the receipt prefix,
accepted=false with the receipt prefix. Regression coverage executes the gate
CLI with an intercepted GitHub API, and evaluates the actual workflow condition.

Local verification passed: `pnpm run preflight` (58 Python tests and 12 Node
regression groups), plus `git diff --check`. Full observed receipt and summary
fixtures are in `tests/fixtures/native-codex-review.json`, with public sources.
