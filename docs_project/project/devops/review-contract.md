# Review Contract

Reviewers check the pull request against the active feature spec. Acceptance
criteria, negative scenarios, and known issues define expected behavior.

## Codex

Only configured trusted Codex identities provide evidence. A trusted human
request records a marker for the current full head SHA. Default-branch scripts
and configuration define the trust policy; PR configuration cannot add reviewers.

Native positive formal reviews require an exact current-head `commit_id` and
submission after the request. Every current-head negative or dismissed review
blocks; a later approval cannot conceal an older review edited to add a finding. P0, P1, and P2 findings block merge. Every unresolved Codex
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
  A summary with resolved findings cannot pass alone; a matching acceptable native
  formal review must establish their nonblocking severity. Security-review
  unresolved flags also block the gate.

Edited summaries use `updated_at`, even when `created_at` precedes the request.
The latest trusted signal determines the outcome; an older positive result cannot
hide a newer pending, invalid, or negative signal. Reactions and the word
Completed alone never satisfy the gate. The head is checked again after evidence
collection, so a push during validation cannot turn a stale run green.

## Event handling and initial rollout

Submitted, edited, and dismissed formal reviews wake the router. Edits and
dismissals force conservative requeue because their original `submitted_at`
cannot establish the mutation time. Inline review comments also route on
creation, editing, and deletion; edited/deleted inline timestamps never suppress
requeue. Created, edited, and deleted native comments also wake it. All trusted Codex top-level comments route, including unrecognized or blank
new content; removing a marker cannot suppress requeue. Newer trusted comments with
unrecognized/blank content remain pending instead of exposing an older success. Events are serialized
per PR. The latest eligible pull-request gate takes priority over diagnostic
manual runs. The router waits with bounded backoff for an active gate to finish,
then reevaluates evidence once if the latest run did not already evaluate it. It
never reruns an older failed PR run in preference to a newer successful PR run,
and checks the live head immediately before requesting a rerun.

A bounded default-branch poller checks thread state every five minutes because
Actions has no thread resolution-toggle trigger. It reruns at most one real gate
per invocation, only for an open non-draft PR whose latest current-head eligible
PR gate is successful and has an unresolved trusted Codex thread. It rechecks
that successful run and live head before POST. Failed or active gates and manual
diagnostics are excluded. All scripts and policy come from main. GitHub can delay
scheduled runs; the merge owner must still recheck current threads immediately
before merge. Once red, the gate waits for ordinary evidence events or an
operator rerun after resolution, avoiding repeated scheduled failures.

Ordinary PR gates and event routers execute default-branch scripts. For initial
rollout of a reviewed gate-format fix, a repository writer can add the PR label
`gate:<full-reviewed-head-sha>`. The PR event finds the label's original actor in paginated issue events and
verifies that actor's write permission, requires the label SHA to match the event head, checkout, and
live PR head, and runs the reviewed gate code with default-branch reviewer policy
and read-only permissions. The operator must first confirm genuine native review
and resolved threads for that exact SHA. Every later event for the same labeled
head uses that reviewed runtime, including unrelated labels, reopen, and ready
for review, so requeue cannot fall back to an older parser. The later event actor
does not need to be the writer who authorized the label. A label cannot enable
this path on a different head; a moved head needs a new SHA label and review.

The workflow also supports explicit `workflow_dispatch` diagnostics on the PR
head branch with `reviewed_gate_sha` equal to the full reviewed SHA. All manual
runs must match the live PR head. GitHub does not evaluate workflow-dispatch jobs
as required checks in a branch ruleset, so diagnostic success cannot establish
merge readiness. See [GitHub's required-check troubleshooting](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

Before the initial labeled validation, the operator starts the already reviewed
local supervisor with the authorized `gh` session:

```sh
node scripts/ai-review-rollout-watch.mjs owner/repo PR_NUMBER FULL_REVIEWED_SHA
```

This watcher remains supervised through merge. It polls current-head comments,
formal reviews, inline findings, and resolved-thread state every five seconds,
and requests a real current-head PR-gate rerun whenever that evidence changes.
It supplies pre-merge routing because `issue_comment` workflows still use the old
default branch until merge. It ignores github-actions-generated issue comments, preventing failure-comment
feedback loops. The read-only gate reports failures through logs/job summary
without posting issue comments. The watcher never posts review evidence or
creates check results. A moved head, API error, missing rerunnable gate, timeout, or stopped
watcher blocks the rollout: restore supervision and restart the full 120-second
readiness window after real native evidence and required checks are green.

Both reviewed-code paths execute the full evidence gate. A missing review,
failed gate, or moved head blocks success. Automatic review requests and
first-install success skips are not supported by this validation workflow.

## Claude

A trusted top-level comment must include `AI_REVIEW_AGENT: claude`,
`AI_REVIEW_SHA` equal to the full current head, and `AI_REVIEW_OUTCOME: pass`.
Advisory and block outcomes do not pass.

## Gemini

Native GitHub PR review from the configured app must match the current head.
Critical or high-severity findings block merge.

## Modern receipt closings and authoritative state

Unknown receipt closing prose alone never establishes approval. Modern native reviews supply a separate authoritative structured `codex-review-state:v1` summary; its current-request exact-head completed code verdict with explicit false findings flags permits new friendly closings without a phrase-list update. Security state must be entirely null or same-head completed with both flags false. Exact schema/types, duplicate detection, trusted author, request freshness and latest invalidation remain mandatory. A newer pending, malformed or contrary structured state invalidates older success; a later or equal-time unknown receipt remains pending and requires a fresh authoritative summary. Existing P0-P2, timeline, head and unresolved-thread vetoes remain in force.

Structured code approval uses the mandatory unique matching-head Code Review row completion datetime for freshness and ordering. It must follow the active request and cannot exceed comment edit time (allowing GitHub second precision). A security-only edit never refreshes or reorders an older code verdict. Pending/invalid state uses edit time to invalidate prior success.

Positive static receipt/legacy evidence uses immutable created_at for freshness and ordering; edits cannot renew approval or overtake later pending state. Invalidating signals continue to use updated_at. Added regression for clean receipt created before pending state and edited afterward.

Repeated same-head requests preserve validated typed code/security findings. Formal approval alone cannot clear them: a strictly newer authoritative structured completion must explicitly report false finding flags for the affected channel. Historical malformed or foreign-head payloads do not acquire this persistent barrier.

Completed typed negatives retain their affected section's valid canonical completion clock in candidate ordering and history clearance. Unrelated edits cannot renew old findings; missing, invalid or running section clocks use the edit time conservatively.

Historical canonical resolution is independent of later request markers: a repeated request cannot revive an already cleared finding. Current code approval still requires fresh evidence after the active request.

Canonical finding clocks require the visible section commit to match the typed full head; mismatches fall back to observation time. Native P1 regression and mandatory preflight passed (58 Python, 36 Node tests).

Completed typed negative observations use their own strict canonical section clock independently of the other section. The own row must have its canonical label, status, commit and trigger, and its projected full presentation must remain canonical before its completion clock is authoritative; warning text or contrary prose falls back to observation time. Historical negative facts come from the strict canonical leading envelope through the summary heading, with closed schema, duplicate-key detection and unique protocol markers inside that envelope. Later finding presentation, including quoted or fenced examples and trailing markers, cannot erase explicit true finding flags. Whole-body approval and historical clearing remain strict; examples and duplicate markers inside the leading envelope supply no authority. Existing multiline JSON and unrelated HTML comment compatibility remains supported. Once a strictly newer section completion clears a finding, its old malformed rendering cannot retain a veto; running-section observations remain active. Final mandatory preflight passed: 58 Python, 39 Node tests; independent bounded review cleared.

Malformed completed companions retain a separate observation-time invalidation even after an old finding is resolved. Each companion row is checked against its own typed SHA; a matching foreign-head completed companion remains valid. Paired actual gate controls and mandatory preflight passed: 58 Python, 40 Node tests.

Typed authority is bound to the active full head and preserves configured trusted actors. Finding-bearing foreign companions require their own canonical rows. Four-space/tab-indented protocol markers supply no typed authority; one-to-three-space HTML formatting remains supported. Case-varied Codex markers remain protocol comments and cannot be erased as unrelated HTML. Final mandatory preflight passed: 58 Python, 43 Node tests.

A strictly newer canonical same-section completion retires ordinary prose belonging to the resolved typed finding; raw negative prose and native unresolved findings retain their veto. Four-space/tab-indented summary headings are code examples, and visible review triggers must match the canonical request labels.

Visible P0–P2 and explicit “Do not merge” warnings remain blocking inside permitted informational footers. Their visible-text check decodes numeric HTML entities, standard HTML5 whitespace/format entities and balanced and defined-reference Markdown links (explicit, collapsed and shortcut forms)/emphasis (malformed destinations retain literal warning text), quote-aware inline HTML including image alt text (with block boundaries preserved) and Unicode default-ignorable characters; protocol markers, structured schema, commit identity and timestamps keep their original strict parsing. These warnings cannot establish approval or a structured finding clear.

Rendered review rows with a missing leading pipe or quoted/encoded labels invalidate ambiguous section clocks and inactive companion presentation. Such rows never establish completion authority; canonical original rows and strict full-body approval/clearing remain required.

Negative-only visible text removes raw comments while preserving line boundaries, tokenizes raw HTML attribute quoting, projects valid Markdown destinations and optional standard titles, then decodes character references. Decoded characters cannot manufacture HTML or Markdown structure; undefined reference labels remain literal counterevidence, and visible details summary rows remain ambiguous rather than gaining completion authority.

Existing explicit finding, failed/pending review and changes-requested footer contradictions cannot approve or clear findings. Case-varied rendered review labels participate only in ambiguity detection; canonical original labels remain required for authoritative clocks.

Link-label projection preserves code-rendered literal text in Markdown code spans/fences and raw code elements, so visible priority warnings inside literal link syntax remain counterevidence. This presentation handling grants no machine or completion-clock authority.

Nested active links retain precedence over an invalid enclosing link in visible warning checks; the enclosing destination remains literal counterevidence. Balanced plain labels remain supported.

Markdown literal code is isolated before HTML, links and entity projection; indented code, spans and fences retain their visible literal warning text. Rendered-equivalent duplicate review labels remain ambiguity only and never supply a clock.

Informational footer removal requires a single balanced details element; content after its matching close remains subject to the original strict grammar. Blockquote-contained code fences remain literal in warning projection, and the existing finding category includes singular article wording.

Defined reference links support a destination on the following line using the same destination/title validation as inline links. Quote and list container prefixes are recognized before literal code classification.

Escaped opening backticks remain literal punctuation around real links; only an unescaped opener establishes a code span, whose backslashes remain literal. Original table delimiters remain strict even inside HTML comments, and rendered finding statements retain observation-time vetoes.

Validated reference-definition blocks, including consumed destination/title lines, are omitted from visible warning text; malformed definitions and code-rendered definitions stay literal. Existing positive finding counts remain contradictory to clean proof.

Markdown link labels containing a blank line remain literal visible text; a valid soft line break does not change destination visibility. This projection does not change protocol authority.

Reference-definition labels must satisfy the standard nonempty label grammar and length bound before definitions become nonrendered; unescaped brackets remain literal warning text.

Visible contradiction projection preserves the standard raw HTML block distinction: HTML still renders, while Markdown syntax in the block remains literal until its standard terminator. About Codex has no special exception. Rendered no/zero/0 finding negation remains benign, and invalid reference destinations remain literal.

Optional-semicolon numeric character references are interpreted only in raw HTML block text, matching GitHub rendering; ordinary Markdown (including inline HTML) requires the semicolon, and literal Markdown code is never decoded. Finding statements normalize soft breaks while retaining paragraph boundaries.

Raw HTML context detection peels the existing Markdown quote/list container prefixes. Finding-statement negation applies per finding clause: a zero count in one section cannot hide a positive finding in another. GitHub tagfilter preserves visible script/style text as escaped markup; it must not be discarded.

Referenced footnote contents remain visible evidence; unused definitions are omitted only in Markdown contexts, with code and raw HTML contexts kept distinct. ordinary link destinations are suppressed only within GitHub’s balanced nesting limit. Malformed closing tags remain literal in Markdown but use HTML parsing inside raw blocks. Collapsed details remain non-authoritative across blank lines, independently of Markdown block termination. Existential issue statements retain the existing finding veto.

Positive numeric counts attached to issue, finding, or problem nouns remain contrary evidence independently of the reporting verb; zero/no-only statements retain their clean meaning.

Inline HTML is removed only after its complete GFM tag grammar validates; malformed visible tags retain warnings. Footnote evidence follows case-insensitive references transitively, retaining used lazy continuations and omitting unused definitions; invalid footnote identifiers use ordinary reference parsing. Raw HTML parsing ends when its Markdown quote/list container ends.

Footnote use graphs follow rendered inline labels and contents, including transitive references; hidden link destinations and HTML attributes cannot activate otherwise unused footnotes.
