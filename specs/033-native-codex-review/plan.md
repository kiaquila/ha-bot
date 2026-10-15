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

The existing default-branch gate accepts genuine current-head native formal
reviews and legacy summaries. Initial rollout must use that existing evidence
path and rerun the actual workflow after review. A new-format-only response
cannot satisfy the old gate. If the reviewer cannot provide a supported genuine
response, retain the PR and report that bootstrap blocker; do not forge evidence,
change required checks, bypass protection, or run unreviewed PR gate code with
write credentials.

## Verification

Original reproduction: identical body accepted=true without the receipt prefix,
accepted=false with the receipt prefix. Regression coverage executes the gate
CLI with an intercepted GitHub API, and evaluates the actual workflow condition.

Local verification passed: `pnpm run preflight` (58 Python tests and 10 Node
regression groups), plus `git diff --check`. Full observed receipt and summary
fixtures are in `tests/fixtures/native-codex-review.json`, with public sources.
