# Tasks and Process Memory

- [x] Verify GitHub identity, refresh refs, compare main with origin/main.
- [x] Create a dedicated branch and in-repository worktree from origin/main.
- [x] Reproduce receipt-prefix rejection before changes.
- [x] Implement strict native-format classification and latest-result selection.
- [x] Wire unresolved findings and head-race validation into the required gate.
- [x] Fix workflow routing and bounded rerun after active-gate completion.
- [x] Connect substantive Node regressions to preflight and baseline CI.
- [x] Full local preflight passed: 58 Python tests and 14 Node regression groups.
Final native review, required checks, thread resolution, and the 120-second
readiness window must be confirmed in the PR immediately before merge.

## Decisions

- Accept only observed versioned markers. Unknown or malformed evidence fails closed.
- Structured summaries require explicit clean code-review flags; findings require
  resolution and a fresh positive review, never a new administrative marker alone.
- Configuration follows trusted scripts rather than the PR checkout.
- Preserve the default-branch execution boundary during initial rollout.

## Dead ends and known issues

- Context7 rejected documentation lookup because its monthly quota was exhausted;
  official GitHub Actions and OpenAI documentation were read directly.
- Initial test-file creation failed when the execution host temporarily exhausted
  disk space. Free space recovered before retry; no source or cache was deleted.
- Initial rollout uses explicit read-only validation of the reviewed, pinned
  gate commit. The full native evidence checks still apply; default-branch
  scripts remain the ordinary automatic path.

## Native review follow-up

The first native review identified a missing workflow condition for standalone
`codex-review-state:` signals. Added the condition and covered it through the
actual workflow expression and runtime router. Also covered resolved formal P3
reviews alongside structured summaries so advisory severity remains compatible.

The second native review found an equal-timestamp rerun race. Equality is now
treated as changed evidence for both successful and failed runs. Strictly older
evidence is deduplicated; missing timestamps also require conservative requeue.
Regression cases cover equality, older evidence, and same-time run ordering.

The third native review found equal-time formal-review selection and omission
of pinned workflow-dispatch runs from requeue. Equal-time negative formal
reviews now win regardless of API ordering; manual runs participate in the
current-head rerun query, including after a skipped draft PR job. All manual
validations must publish on the exact PR head, including the ordinary trusted
script path. Runtime/workflow coverage also includes whitespace-prefixed legacy
summaries.

A real exact-head read-only workflow-dispatch validation passed, but GitHub kept
the PR blocked: rulesets exclude workflow-dispatch job checks. The rollout path
now uses an explicit SHA label on an eligible PR event, with a current writer
permission check and event/checkout/live-head pinning. Manual runs remain
diagnostic and cannot shadow an eligible PR gate in rerun selection. Executable
workflow tests cover writer rejection, malformed/stale labels, mismatched heads,
and retained labels on a later synchronize event.
Unrelated label events execute the ordinary trusted gate rather than skipping
a required job, because GitHub treats skipped required jobs as successful.

The next native review identified a later unrelated PR event selecting main's
older parser on the already labeled head. Runtime selection now honors the
exact-head label on every same-head PR event, with writer permission checks;
a retained label never applies to a different head. Workflow regressions cover
unrelated labels, reopen, ready-for-review, synchronize, and a changed head.

Native review identified two rollout-only gaps. Retained-label authorization
now reads the original label actor from paginated issue events and verifies that
writer, independently of later event actors. The initial rollout also requires
an already reviewed local supervisor before label validation: it watches native
comments/reviews/inline findings/thread state and reruns the real PR gate on
changes while main still has the old issue-comment handler. API/head/timeout or
watcher failure blocks merge and resets the required readiness window. Tests
exercise changed summaries and thread state, unchanged snapshots, missing runs,
head movement, and API failure without posting evidence or synthetic checks.
