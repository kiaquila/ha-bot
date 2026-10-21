# Tasks

- [x] Add validated per-channel historical finding barrier.
- [x] Add actual gate security-history regressions.
- [ ] Run mandatory preflight and final-head native review.

Mandatory `pnpm preflight` passed (58 Python, 29 Node tests); independent bounded reviewer cleared actual CLI old security finding, newer explicit same-section security completion, stale/missing security datetime, malformed and foreign-head cases. Native exact-head review remains required before merge.

Final clock correction: completed typed negatives use their own affected-section canonical clock in ordering and latches; malformed/missing/running clocks fall back to observation edits. Symmetric machine-only code/security clearing regressions pass despite later unrelated edits. Independent bounded review cleared. Mandatory preflight passed: 58 Python, 31 Node tests.

Final historical resolution projects the affected section through the strict canonical parser, retaining contradictory visible prose guards. Resolution survives repeated requests and unrelated section activity. Mandatory preflight passed: 58 Python, 35 Node tests; bounded independent reviewer cleared.

Canonical finding clocks require the visible section commit to match the typed full head; mismatches fall back to observation time. Native P1 regression and mandatory preflight passed (58 Python, 36 Node tests).
