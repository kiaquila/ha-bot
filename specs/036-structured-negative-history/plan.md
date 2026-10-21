# Plan

Validate the closed structured envelope before retaining per-channel finding history. Require a newer clean authoritative state for that channel, using that section’s completion time and conservative second ordering.

## Verification

Run spawned gate regressions for old security findings, formal approval, explicit newer clean security completion, foreign head and malformed history; run `pnpm preflight` and obtain exact-head native review.

Historical resolution remains independent of later requests; fresh approval remains bound to the current request.
