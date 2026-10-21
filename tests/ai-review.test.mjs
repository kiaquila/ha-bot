import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { classifyCodexSummaryComment as classifyReceipt, latestCodexCommentResult as selectSummary, isAcceptableCodexSummaryComment as accepts, classifyCodexNativeReview, latestCodexNativeReviewResult, latestCodexCommentResult } from '../scripts/ai-review-helpers.mjs';
import { shouldRouteAiReviewRerunEvent as routes, selectAiReviewRun, rerunAiReviewForPrHead, rerunEvidenceUpdatedAt } from '../scripts/ai-review-rerun.mjs';
const sha = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
const before = '2026-10-15T10:00:00Z', after = '2026-10-15T10:01:00Z';
const bot = { login: 'chatgpt-codex-connector[bot]', type: 'Bot' };
const legacy = "Codex Review: Didn't find any major issues. :rocket:\n\n**Reviewed commit:** `2667f79cd7`";
const observed = JSON.parse(readFileSync(new URL('./fixtures/native-codex-review.json', import.meta.url), 'utf8'));
const receipt = observed.receipt;
const marker = { agent: 'codex', sha, requestedAt: before };
const comment = (body, extra = {}) => ({ id: 2, user: bot, body, created_at: after, ...extra });
function summary(code = {}, security = {}) {
  return '<!-- codex-pull-request-review-summary -->\n<!-- codex-review-state:v1 ' + JSON.stringify({
    code_review: { commit_sha: sha, has_any_findings: false, has_unresolved_findings: false, status: 'completed', ...code },
    security_review: { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null, ...security }
  }) + ' -->\n\n## Codex Review Summary\n\n| Review | Status | Commit | Review trigger |\n| 📝 **Code Review** | ✅ **Completed** <relative-time datetime="2026-10-15T10:01:00Z">2026-10-15T10:01:00Z</relative-time> | `2667f79` | Manual request |';
}
test('observed receipt, legacy and informational footer pass', () => {
  assert.equal(accepts(comment(observed.summary, { updated_at: "2026-10-15T21:49:23Z" }), sha, marker), true);
  for (const body of [legacy, receipt, receipt.replace(':rocket:', 'Keep it up!'), legacy + '\n<details> <summary>ℹ️ About Codex in GitHub</summary>\nInformation\n</details>']) assert.equal(accepts(comment(body), sha, marker), true);
  const noSha = comment("Codex Review: Didn't find any major issues.");
  assert.equal(accepts(noSha, sha, marker), true); assert.equal(accepts(noSha, sha), false);
});
test('receipt rejects wrong/missing/ambiguous SHA, spoofing, malformed markers and conflicts', () => {
  for (const body of [receipt.replace('2667f79cd7', 'aaaaaaaaaa'), receipt.replace('2667f79cd7', sha.slice(0, 9)), receipt.split('\n\n**')[0], receipt + '\n**Reviewed commit:** `aaaaaaaaaa`', '<!-- codex-review-receipt:v1 -->\n' + receipt, receipt.replace('receipt:v1', 'receipt:v2'), receipt + '\nP2: blocker', receipt + '\nUnresolved issues.', receipt.replace("Didn't find any major issues.", 'Running.'), receipt.replace("Didn't find any major issues.", 'Found issues.')]) assert.equal(accepts(comment(body), sha, marker), false, body);
  assert.equal(accepts(comment(receipt, { user: { login: 'spoof[bot]' } }), sha, marker), false);
  assert.equal(accepts(comment(receipt), ''), false);
});
test('structured summary requires exact schema, full SHA, explicit verdict, completed state and matching row', () => {
  assert.equal(accepts(comment(summary()), sha, marker), true);
  for (const code of [{ commit_sha: sha.slice(0, 10) }, { commit_sha: 'a'.repeat(40) }, { commit_sha: null }, { status: 'in_progress' }, { status: 'failed' }, { status: null }, { has_any_findings: 'false' }, { has_any_findings: null }, { has_any_findings: true }, { has_unresolved_findings: true }, { extra: false }]) assert.equal(accepts(comment(summary(code)), sha, marker), false, JSON.stringify(code));
  for (const body of [summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'), summary().replace('"code_review":', '"other":'), summary().replace('"completed"', 'completed'), summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('**Completed**', '**Running**'), summary().replace('`2667f79`', '`aaaaaaa`'), summary() + '\n[P1] Defect', summary() + '\n| Unexpected | Found major issues |', summary() + '\nFound unresolved issues.', summary().replace('**Completed**', '**Completed** Failed'), summary() + '\n<!-- codex-review-receipt:v1 -->']) assert.equal(accepts(comment(body), sha, marker), false, body);
  assert.equal(accepts(comment(summary({}, { has_any_findings: 'false' })), sha, marker), false);
  assert.equal(accepts(comment(summary({}, { commit_sha: [sha], has_any_findings: false, has_unresolved_findings: false, status: 'completed' })), sha, marker), false);
});
test('edited summary uses updated_at; newer negative/unfinished result overrides previous clean receipt', () => {
  const old = comment(receipt, { created_at: before });
  const edited = comment(summary(), { id: 1, created_at: '2026-10-14T10:00:00Z', updated_at: after });
  assert.equal(latestCodexCommentResult([old, edited], sha, marker), 'pass');
  assert.equal(latestCodexCommentResult([old, comment(receipt.replace('receipt:v1', 'receipt:v2'))], sha, marker), 'fail');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ status: 'in_progress' }) }], sha, marker), 'pending');
  assert.equal(latestCodexCommentResult([old, { ...edited, body: summary({ has_any_findings: true, has_unresolved_findings: true }) }], sha, marker), 'fail');
  assert.equal(latestCodexCommentResult([comment(receipt), { ...edited, body: summary({ status: 'in_progress' }) }], sha, marker), 'pending');
});
test('formal reviews preserve P0-P2 severity and require exact commit_id', () => {
  const review = { id: 1, user: bot, commit_id: sha, state: 'COMMENTED' };
  assert.equal(classifyCodexNativeReview(review, [], sha), 'pass');
  for (const commit_id of [undefined, 'a'.repeat(40), sha.slice(0, 10)]) assert.equal(classifyCodexNativeReview({ ...review, commit_id }, [], sha), null);
  for (const body of ['P0', 'P1', 'P2', 'unknown']) assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body }], sha), 'fail');
  assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body: 'P3 advisory' }], sha), 'pass');
});
const workflow = readFileSync(new URL('../.github/workflows/ai-review-rerun.yml', import.meta.url), 'utf8');
const filter = workflow.match(/    if: \|\n([\s\S]*?)    runs-on:/)[1];
const workflowRoutes = (event, name = 'issue_comment') => new Function('github', 'startsWith', 'contains', `return (${filter});`)({ event_name: name, event }, (s, p) => s?.toLowerCase().startsWith(p.toLowerCase()), (s, p) => s?.toLowerCase().includes(p.toLowerCase()));
test('actual workflow filter and runtime router handle created/edited signals', () => {
  assert.match(workflow, /types: \[created, edited, deleted\]/); assert.match(workflow, /cancel-in-progress: false/);
  for (const action of ['created', 'edited']) for (const body of [legacy, '\n  ' + legacy, receipt, summary(), receipt.replace('receipt:v1', 'receipt:v2'), '<!-- codex-review-state:v2 {} -->']) {
    const event = { action, issue: { number: 1, pull_request: {} }, comment: comment(body) };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, comment: comment(body, { user: { login: 'spoof[bot]', type: 'Bot' } }) }), false);
    assert.equal(routes({ ...event, issue: {} }), false); assert.equal(routes({ ...event, action: 'deleted' }), true);
    assert.equal(routes({ ...event, action: 'unsupported' }), false);
  }
  assert.equal(routes({ action: 'created', issue: { pull_request: {} }, comment: comment('👍 Completed') }), true);
  assert.equal(routes({ action: 'submitted', review: { user: bot } }), true);
  assert.equal(workflowRoutes({ review: { user: bot } }, 'pull_request_review'), true);
});
const run = (extra = {}) => ({ id: 10, event: 'pull_request', head_sha: sha, created_at: before, run_started_at: before, status: 'completed', conclusion: 'failure', ...extra });
test('newest current-head run wins over old failed runs', () => {
  assert.equal(selectAiReviewRun([run(), run({ id: 11, created_at: after, conclusion: 'success' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ head_sha: 'a'.repeat(40) })], sha).action, 'not_found');
  assert.equal(selectAiReviewRun([run(), run({ id: 11, conclusion: 'success' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ event: 'workflow_dispatch', conclusion: 'success' }), run({ id: 11, created_at: after, conclusion: 'skipped' })], sha).action, 'already_success');
  assert.equal(selectAiReviewRun([run({ id: 10, conclusion: 'success' }), run({ id: 11, created_at: after, event: 'workflow_dispatch' })], sha).run.id, 10);
});
async function requeue({ runs = [run()], move = false, evidenceUpdatedAt = after, waitMs = 5000 } = {}) {
  let time = 0, gets = 0, lists = 0, posts = 0;
  const result = await rerunAiReviewForPrHead({ token: 'fixture', repository: 'example/repo', headSha: sha, prNumber: 1, evidenceUpdatedAt, waitMs,
    now: () => time, sleep: async (ms) => { time += ms; },
    request: async (_token, _repo, path, options = {}) => {
      if (options.method === 'POST') { posts++; return null; }
      if (path.endsWith('/pulls/1')) { gets++; return { state: 'open', head: { sha: move && gets > 1 ? 'b'.repeat(40) : sha } }; }
      assert.doesNotMatch(path, /event=pull_request/);
      return { workflow_runs: [runs[Math.min(lists++, runs.length - 1)]] };
    }
  }); return { result, posts, lists };
}
test('rerun covers active/completed gate, deduplication, updated successful gate and push race', async () => {
  assert.equal((await requeue()).posts, 1);
  const manual = await requeue({ runs: [run({ event: 'workflow_dispatch', conclusion: 'success' })] });
  assert.equal(manual.posts, 1); assert.equal(manual.result.run.event, 'workflow_dispatch');
  const active = await requeue({ runs: [run({ status: 'in_progress' }), run()] }); assert.equal(active.posts, 1); assert.equal(active.lists, 2);
  assert.equal((await requeue({ move: true })).posts, 0); assert.equal((await requeue({ evidenceUpdatedAt: '2026-10-15T09:59:59Z' })).posts, 0);
  assert.equal((await requeue({ evidenceUpdatedAt: before })).posts, 1);
  assert.equal((await requeue({ evidenceUpdatedAt: before, runs: [run({ conclusion: 'success' })] })).posts, 1);
  assert.equal((await requeue({ evidenceUpdatedAt: null, runs: [run({ conclusion: 'success' })] })).posts, 1);
  assert.equal((await requeue({ runs: [run({ conclusion: 'success' })] })).posts, 1);
  await assert.rejects(requeue({ runs: [run({ status: 'in_progress' })], waitMs: 100 }), /bounded rerun wait expired/);
});
function gate(fixture = {}) {
  return spawnSync(process.execPath, ['--import', './tests/fixtures/ai-review-fetch.mjs', 'scripts/ai-review-gate.mjs'], { encoding: 'utf8', env: { ...process.env,
    GITHUB_TOKEN: 'fixture', GITHUB_REPOSITORY: 'example/repo', AI_REVIEW_PR_NUMBER: '1', AI_REVIEW_HEAD_SHA: sha, AI_REVIEW_AGENT: 'codex', AI_REVIEW_TRIGGER_MODE: 'skip', AI_REVIEW_WAIT_MS: '1', AI_REVIEW_POLL_MS: '1', AI_REVIEW_DEBOUNCE_MS: '0', AI_REVIEW_FIXTURE: JSON.stringify({ sha, receipt, ...fixture }) }
  });
}
test('actual gate CLI accepts receipt, legacy, edited summary and formal review', () => {
  for (const fixture of [{}, { body: legacy }, { body: summary(), edited: true }, { formal: true }, { formal: true, advisory: true }, { noSha: true }]) { const result = gate(fixture); assert.equal(result.status, 0, result.stderr + result.stdout); }
});
test('actual gate blocks stale/missing SHA, findings before new request, unresolved P3 and races', () => {
  for (const fixture of [{ body: receipt.replace('2667f79cd7', 'aaaaaaaaaa') }, { noMarker: true }, { body: receipt.split('\n\n**')[0] }, { unresolved: true }, { unresolvedGraphqlBot: true }, { previousFailure: true }, { headRace: true }, { timelineRace: true }, { body: summary({ status: 'in_progress' }) }, { body: summary({ has_any_findings: true }) }, { body: summary({}, { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' }) }, { spoof: true }, { graphqlError: true }, { missingFormalSha: true, body: 'Completed' }]) { const result = gate(fixture); assert.equal(result.status, 1, JSON.stringify(fixture) + result.stdout); }
});

test('actual manual runtime selection pins dispatch, checkout and PR head; ordinary events use main', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const yaml = readFileSync(new URL('../.github/workflows/ai-review.yml', import.meta.url), 'utf8');
  assert.match(yaml, /permissions:\n  contents: read\n  pull-requests: read\n  issues: read/);
  assert.doesNotMatch(yaml, /first_install|skip\|comment/);
  const block = yaml.match(/- name: Select reviewed gate runtime[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'ha-bot-review-selection-'));
  try {
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = rev-parse ]; then echo "$FIXTURE_CHECKOUT_SHA"; else exit "$FIXTURE_DIRTY"; fi\n', { mode: 0o700 });
    for (const [extra, expected] of [
      [{}, 0], [{ REVIEWED_GATE_SHA: '' }, 0], [{ EVENT_NAME: 'pull_request' }, 1],
      [{ CURRENT_HEAD_SHA: 'a'.repeat(40) }, 1], [{ GITHUB_SHA: 'a'.repeat(40) }, 1],
      [{ FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 1], [{ FIXTURE_DIRTY: '1' }, 1],
      [{ REVIEWED_GATE_SHA: '', GITHUB_SHA: 'a'.repeat(40) }, 1],
      [{ REVIEWED_GATE_SHA: sha.slice(0, 10) }, 1], [{ SELECTED_AGENT: 'claude' }, 1]
    ]) {
      const output = join(dir, 'output');
      writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env,
        PATH: `${dir}:${process.env.PATH}`, FIXTURE_CHECKOUT_SHA: sha, FIXTURE_DIRTY: '0',
        REVIEWED_GATE_SHA: sha, CURRENT_HEAD_SHA: sha, GITHUB_SHA: sha,
        EVENT_ACTION: '', REVIEW_LABEL: '', EVENT_HEAD_SHA: sha, PR_LABELS: '[]',
        EVENT_NAME: 'workflow_dispatch', SELECTED_AGENT: 'codex', GITHUB_OUTPUT: output, ...extra
      } });
      assert.equal(result.status, expected, JSON.stringify(extra) + result.stderr);
      if (expected === 0) assert.equal(readFileSync(output, 'utf8').trim(),
        extra.REVIEWED_GATE_SHA === '' ? 'script_dir=.gate-trusted/scripts' : 'script_dir=scripts');
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('equal-time formal reviews prefer failure independently of API order or ID', () => {
  const positive = { id: 20, user: bot, commit_id: sha, state: 'APPROVED', submitted_at: after };
  const negative = { ...positive, id: 10, state: 'CHANGES_REQUESTED' };
  for (const reviews of [[positive, negative], [negative, positive]]) {
    assert.equal(latestCodexNativeReviewResult(reviews, [], sha), 'fail');
  }
  assert.equal(latestCodexNativeReviewResult([positive, { ...negative, submitted_at: undefined }], [], sha), 'fail');
  assert.equal(latestCodexNativeReviewResult([{ ...positive, submitted_at: undefined }], [], sha), null);
});


test('eligible labeled PR validation requires a writer and exact event, checkout and live SHA', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const yaml = readFileSync(new URL('../.github/workflows/ai-review.yml', import.meta.url), 'utf8');
  assert.match(yaml, /types: \[opened, synchronize, reopened, ready_for_review, labeled\]/);
  const condition = yaml.match(/    if: \|\n([\s\S]*?)    runs-on:/)[1];
  const eligible = (action, label, draft = false) => new Function('github', 'startsWith', `return (${condition});`)(
    { event_name: 'pull_request', event: { action, label: { name: label }, pull_request: { draft } } },
    (s, p) => s?.toLowerCase().startsWith(p.toLowerCase()));
  assert.equal(eligible('labeled', 'gate:' + sha), true);
  // Unrelated labels must run the real trusted gate: a skipped required job would count as success.
  assert.equal(eligible('labeled', 'unrelated'), true);
  assert.equal(eligible('labeled', 'gate:' + sha, true), false);
  assert.equal(eligible('synchronize', ''), true);
  const block = yaml.match(/- name: Select reviewed gate runtime[\s\S]*?        run: \|\n([\s\S]*?)\n      - name:/)[1].replace(/^          /gm, '');
  const dir = mkdtempSync(join(tmpdir(), 'ha-bot-labeled-gate-'));
  try {
    writeFileSync(join(dir, 'git'), '#!/bin/sh\nif [ "$1" = rev-parse ]; then echo "$FIXTURE_CHECKOUT_SHA"; else exit "$FIXTURE_DIRTY"; fi\n', { mode: 0o700 });
    writeFileSync(join(dir, 'gh'), '#!/bin/sh\necho "$*" >> "$FIXTURE_GH_LOG"\ncase "$*" in *\"/events?\"*) echo "$FIXTURE_LABEL_EVENTS";; *) echo "$FIXTURE_PERMISSION";; esac\n', { mode: 0o700 });
    for (const [extra, expected, script] of [
      [{}, 0, 'scripts'], [{ FIXTURE_PERMISSION: 'write' }, 0, 'scripts'],
      [{ FIXTURE_PERMISSION: 'read' }, 1], [{ FIXTURE_PERMISSION: 'triage' }, 1],
      [{ FIXTURE_PERMISSION: '' }, 1], [{ FIXTURE_LABEL_ACTOR: '' }, 1],
      [{ GITHUB_ACTOR: 'read-only-trigger' }, 0, 'scripts'], [{ REVIEW_LABEL: 'gate:' + sha.slice(0, 10) }, 1],
      [{ REVIEW_LABEL: 'gate:' + 'a'.repeat(40) }, 1], [{ EVENT_HEAD_SHA: 'a'.repeat(40) }, 1],
      [{ CURRENT_HEAD_SHA: 'a'.repeat(40) }, 1], [{ FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 1],
      [{ FIXTURE_DIRTY: '1' }, 1], [{ SELECTED_AGENT: 'claude' }, 1],
      [{ EVENT_ACTION: 'synchronize', REVIEW_LABEL: 'gate:' + sha }, 0, 'scripts'],
      [{ EVENT_ACTION: 'reopened' }, 0, 'scripts'], [{ EVENT_ACTION: 'ready_for_review' }, 0, 'scripts'],
      [{ REVIEW_LABEL: 'unrelated' }, 0, 'scripts'],
      [{ REVIEW_LABEL: 'unrelated', PR_LABELS: '[]' }, 0, '.gate-trusted/scripts'],
      [{ EVENT_ACTION: 'synchronize', EVENT_HEAD_SHA: 'a'.repeat(40), CURRENT_HEAD_SHA: 'a'.repeat(40), FIXTURE_CHECKOUT_SHA: 'a'.repeat(40) }, 0, '.gate-trusted/scripts']
    ]) {
      const output = join(dir, 'output'); writeFileSync(output, '');
      const result = spawnSync('bash', ['-c', block], { encoding: 'utf8', env: { ...process.env,
        PATH: `${dir}:${process.env.PATH}`, FIXTURE_CHECKOUT_SHA: sha, FIXTURE_DIRTY: '0', FIXTURE_PERMISSION: 'admin',
        FIXTURE_LABEL_EVENTS: JSON.stringify([[{ event: 'labeled', label: { name: 'gate:' + sha }, actor: { login: extra.FIXTURE_LABEL_ACTOR ?? 'writer' } }]]), FIXTURE_GH_LOG: join(dir, 'gh-log'), PR_NUMBER: '1',
        REVIEWED_GATE_SHA: '', CURRENT_HEAD_SHA: sha, GITHUB_SHA: 'b'.repeat(40), EVENT_HEAD_SHA: sha,
        EVENT_NAME: 'pull_request', EVENT_ACTION: 'labeled', REVIEW_LABEL: 'gate:' + sha, PR_LABELS: JSON.stringify(['gate:' + sha]),
        GITHUB_REPOSITORY: 'example/repo', GITHUB_ACTOR: 'writer', SELECTED_AGENT: 'codex', GITHUB_OUTPUT: output, ...extra
      } });
      assert.equal(result.status, expected, JSON.stringify(extra) + result.stderr);
      if (expected === 0) assert.equal(readFileSync(output, 'utf8').trim(), 'script_dir=' + script);
      if (extra.GITHUB_ACTOR) {
        assert.match(readFileSync(join(dir, 'gh-log'), 'utf8'), /collaborators\/writer\/permission/);
        assert.doesNotMatch(readFileSync(join(dir, 'gh-log'), 'utf8'), /collaborators\/read-only-trigger/);
      }
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pre-merge rollout watcher requeues real PR gates on edited evidence and thread changes', async () => {
  const { watchRolloutReview } = await import('../scripts/ai-review-rollout-watch.mjs');
  async function watch({ changed = true, threadChange = false, move = false, missingRun = false, apiError = false, gateComments = false } = {}) {
    let tick = 0;
    const posts = [];
    await watchRolloutReview({ repository: 'example/repo', prNumber: 1, headSha: sha,
      now: () => tick * 1000, sleep: async () => { tick++; }, log: () => {}, maxMs: 10000,
      request: async (_token, _repo, path, options = {}) => {
        if (apiError) throw new Error('GitHub unavailable');
        if (path === '/graphql') return { data: { repository: { pullRequest: { reviewThreads: {
          pageInfo: { hasNextPage: false }, nodes: [{ id: 'thread', isResolved: !threadChange || tick === 0 }]
        } } } } };
        if (options.method === 'POST') { posts.push(path); return null; }
        if (path.endsWith('/pulls/1')) return { state: tick >= 2 ? 'closed' : 'open', merged: tick >= 2,
          head: { sha: move && tick > 0 ? 'a'.repeat(40) : sha } };
        if (path.includes('/actions/workflows/')) return { workflow_runs: missingRun ? [] : [run({ conclusion: 'success' })] };
        if (path.includes('/issues/1/comments')) return [{ id: 1, user: bot, body: changed && tick > 0 ? summary({ status: 'in_progress' }) : summary() }, ...(gateComments && tick > 0 ? [{ id: 2, user: { login: 'github-actions[bot]' }, body: 'AI Review gate failed.' }] : [])];
        return [];
      }
    });
    return posts;
  }
  assert.deepEqual(await watch(), ['/repos/example/repo/actions/runs/10/rerun']);
  assert.deepEqual(await watch({ changed: false }), []);
  assert.deepEqual(await watch({ changed: false, gateComments: true }), []);
  assert.deepEqual(await watch({ changed: false, threadChange: true }), ['/repos/example/repo/actions/runs/10/rerun']);
  await assert.rejects(watch({ move: true }), /head moved/);
  await assert.rejects(watch({ missingRun: true }), /could not invalidate/);
  await assert.rejects(watch({ apiError: true }), /GitHub unavailable/);
});

test('marker-removing edits route from the old body and cannot hide behind previous success', () => {
  for (const from of [receipt, summary(), '<!-- codex-review-state:v2 {} -->']) {
    const event = { action: 'edited', issue: { pull_request: {} }, comment: comment(''), changes: { body: { from } } };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, comment: comment('', { user: { login: 'spoof[bot]' } }) }), false);
  }
  assert.equal(latestCodexCommentResult([comment(receipt, { updated_at: before }), comment('')], sha, marker), 'pending');
  const result = gate({ formal: true, formalSubmittedAt: '2026-10-15T10:00:30Z', body: '', edited: true });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.doesNotMatch(workflow, /first-install|script_dir=scripts/);
});


test('formal review edits and dismissals requeue without the original submission timestamp', () => {
  assert.match(workflow, /types: \[submitted, edited, dismissed\]/);
  for (const action of ['submitted', 'edited', 'dismissed']) {
    const event = { action, review: { user: bot, submitted_at: before } };
    assert.equal(workflowRoutes(event, 'pull_request_review'), true);
    assert.equal(routes(event), true);
    assert.equal(rerunEvidenceUpdatedAt(event), action === 'submitted' ? before : null);
    assert.equal(routes({ ...event, review: { ...event.review, user: { login: 'spoof[bot]' } } }), false);
  }
  const approval = { id: 1, user: bot, commit_id: sha, state: 'APPROVED', submitted_at: after };
  assert.equal(classifyCodexNativeReview({ ...approval, state: 'DISMISSED' }, [], sha), 'fail');
  assert.equal(classifyCodexNativeReview(approval, [{ pull_request_review_id: 1, user: bot, body: '[P1] defect' }], sha), 'fail');
  assert.equal(latestCodexNativeReviewResult([{ ...approval, id: 2 }, { ...approval, body: '[P1] edited old review', submitted_at: before }], [], sha), 'fail');
});


test('inline review mutations route and all blocking priority mentions are preserved', () => {
  for (const action of ['created', 'edited', 'deleted']) {
    const event = { action, pull_request: { number: 1 }, comment: { ...comment('[P3] advisory'), updated_at: after } };
    assert.equal(workflowRoutes(event, 'pull_request_review_comment'), true);
    assert.equal(routes(event), true);
    assert.equal(rerunEvidenceUpdatedAt(event), action === 'created' ? after : null);
    assert.equal(routes({ ...event, comment: comment('', { user: { login: 'spoof[bot]' } }) }), false);
  }
  const review = { id: 1, user: bot, commit_id: sha, state: 'COMMENTED' };
  assert.equal(classifyCodexNativeReview(review, [{ pull_request_review_id: 1, user: bot, body: '[P3] advisory with P1 blocker' }], sha), 'fail');
});


test('all new trusted Codex top-level comments route consistently with pending classification', () => {
  for (const body of ['', 'Unrecognized format', '<!-- CODEX-REVIEW-RECEIPT:v2 -->']) {
    const event = { action: 'created', issue: { pull_request: {} }, comment: comment(body) };
    assert.equal(workflowRoutes(event), true); assert.equal(routes(event), true);
    assert.equal(routes({ ...event, action: 'deleted' }), true);
    assert.equal(rerunEvidenceUpdatedAt({ ...event, action: 'deleted' }), null);
    assert.equal(latestCodexCommentResult([comment(receipt, { updated_at: before }), event.comment], sha, marker), 'pending');
  }
  assert.equal(routes({ action: 'created', issue: { pull_request: {} }, comment: comment('AI Review gate failed.', { user: { login: 'github-actions[bot]' } }) }), false);
});


test("unseen closings require an authoritative later structured verdict", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const trusted = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const make = (body, timestamp = '2026-10-15T02:00:00Z') => ({ id: 7, user: trusted, body, created_at: timestamp, updated_at: timestamp });
  for (const closing of ['Swish!', "You're on a roll.", 'Another round soon, please!', "Chef's kiss.",
    'May your coffee stay warm.', 'Authentication leaks credentials.', 'The deployment deletes all customer data.']) {
    const unknown = make(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. ${closing}\n\n**Reviewed commit:** \`${head}\``);
    assert.notEqual(classifyReceipt(unknown, head, request), 'pass', closing);
    const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
    assert.equal(selectSummary([unknown, clean], head, request), 'pass');
    assert.notEqual(selectSummary([clean, { ...unknown, updated_at: '2026-10-15T04:00:00Z' }], head, request), 'pass');
  }
  const clean = make(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T03:00:00Z').replaceAll('2026-10-15T02:00:00Z', '2026-10-15T03:00:00Z'), '2026-10-15T03:00:00Z');
  for (const invalid of [
    summary({ status: 'in_progress' }), summary({ has_any_findings: true }),
    summary({ has_unresolved_findings: true }), summary({ commit_sha: 'a'.repeat(40) }),
    summary().replace('"has_any_findings":false', '"has_any_findings":true,"has_any_findings":false'),
    summary() + '\n<!-- codex-review-state:v1 {} -->', summary().replace('state:v1', 'state:v2'),
    summary() + '\nFound unresolved issues.'
  ]) assert.notEqual(selectSummary([clean, make(invalid, '2026-10-15T04:00:00Z')], head, request), 'pass', invalid);
});


test('actual gate requires newer structured authority and rejects late invalidation', () => {
  const unknown = receipt.replace(':rocket:', 'Swish!');
  for (const fixture of [{ body: unknown, extraBodies: [summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:03:00Z')] }]) {
    const result = gate(fixture); assert.equal(result.status, 0, result.stderr);
  }
  for (const body of [unknown, summary({ status: 'in_progress' }), summary({ has_any_findings: true }),
    summary({}, { commit_sha: sha, has_any_findings: false, has_unresolved_findings: false, status: 'running' })]) {
    const result = gate({ body: summary(), extraBodies: [unknown, body] }); assert.equal(result.status, 1, result.stdout);
  }
});


test("security-only edits cannot refresh or reorder old code completion", () => {
  const head = '2667f79cd7676ff331730cabf661d38dbbcddb0d';
  const user = { login: 'chatgpt-codex-connector[bot]' };
  const request = { agent: 'codex', sha: head, requestedAt: '2026-10-15T01:00:00Z' };
  const dated = (body, updated_at) => ({ user, body, created_at: '2026-10-15T00:00:00Z', updated_at });
  const codeAt = (time) => summary().replace(/datetime="[^"]+">[^<]+<\/relative-time>/g, `datetime="${time}">${time}</relative-time>`);
  const unknown = dated(`<!-- codex-review-receipt:v1 -->\nCodex Review: Didn't find any major issues. Needs work.\n\n**Reviewed commit:** \`${head}\``, '2026-10-15T02:30:00Z');
  const edited = dated(codeAt('2026-10-15T02:00:00Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, edited], head, request), 'pending');
  const sameSecond = dated(codeAt('2026-10-15T02:30:00.070Z'), '2026-10-15T03:00:00Z');
  assert.equal(selectSummary([unknown, sameSecond], head, request), 'pending');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00.070Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T01:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T00:30:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T04:00:00Z'), '2026-10-15T03:00:00Z'), head, request), 'pass');
  assert.equal(selectSummary([unknown, dated(codeAt('2026-10-15T02:45:00Z'), '2026-10-15T03:00:00Z')], head, request), 'pass');
  assert.notEqual(classifyReceipt(dated(codeAt('2026-10-15T02:00:00Z').replace(/<relative-time[^>]+>[^<]+<\/relative-time>/, ''), '2026-10-15T03:00:00Z'), head, request), 'pass');
});


test('editing a static clean receipt cannot renew or reorder its approval', () => {
  const positive = comment(receipt, { created_at: '2026-10-15T10:01:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const pending = comment(summary({ status: 'in_progress' }), { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([positive, pending], sha, marker), 'pending');
  assert.notEqual(latestCodexCommentResult([comment(receipt, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' })], sha, marker), 'pass');
});


test('new review requests can supersede historical prose failures and stale positive edits', () => {
  const oldFailure = comment('Codex Review: Found issues.', { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  const stale = comment(receipt, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const fresh = comment(receipt, { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([oldFailure, fresh], sha, marker), 'pass');
  assert.equal(latestCodexCommentResult([stale, fresh], sha, marker), 'pass');
});


test('formal review ordering uses code completion rather than security edit time', () => {
  const oldCode = comment(summary(), { created_at: '2026-10-15T10:01:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const unknown = comment(receipt.replace(' :rocket:', ' Needs work.'), { created_at: '2026-10-15T10:03:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const result = gate({ body: oldCode.body, comments: [oldCode, unknown], formal: true, formalSubmittedAt: '2026-10-15T10:04:00Z' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('stale clean legacy edit cannot overtake current approval', () => {
  const stale = comment("Codex Review: Didn't find any major issues.", { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:03:00Z' });
  const fresh = comment(receipt, { created_at: '2026-10-15T10:02:00Z', updated_at: '2026-10-15T10:02:00Z' });
  assert.equal(latestCodexCommentResult([stale, fresh], sha, marker), 'pass');
  const result = gate({ body: fresh.body, comments: [stale] });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});


test('historical security findings require newer explicit clean security state', () => {
  const security = { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' };
  const old = comment(summary({}, security), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.notEqual(gate({ body: '', comments: [old], formal: true }).status, 0);
  const cleanBody = summary({}, { ...security, has_any_findings: false, has_unresolved_findings: false })
    .replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:05:00Z') + '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="2026-10-15T10:05:00Z">2026-10-15T10:05:00Z</relative-time> | `2667f79` | Manual request |';
  const clean = comment(cleanBody, { created_at: '2026-10-15T10:05:00Z', updated_at: '2026-10-15T10:05:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
  const staleSecurity = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replaceAll('2026-10-15T10:05:00Z', '2026-10-15T09:00:00Z') : line).join('\n') };
  assert.notEqual(gate({ body: '', comments: [old, staleSecurity], formal: true }).status, 0);
  const missingTime = { ...clean, body: clean.body.split('\n').map((line) => line.includes('**Security Review**') ? line.replace(/ <relative-time[^>]+>[^<]+<\/relative-time>/, '') : line).join('\n') };
  assert.notEqual(gate({ body: '', comments: [old, missingTime], formal: true }).status, 0);
  for (const body of [old.body.replaceAll(sha, 'a'.repeat(40)), old.body.replace('"has_any_findings":true', '"has_any_findings":true,"has_any_findings":false')]) {
    assert.equal(gate({ body: '', comments: [{ ...old, body }], formal: true }).status, 0);
  }
});


test('security-only edits do not refresh a canonical typed finding clock', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('security finding completion survives unrelated newer code/comment edits', () => {
  const sec = { commit_sha: sha, has_any_findings: true, has_unresolved_findings: true, status: 'completed' };
  const securityRow = (time) => '\n| 🔒 **Security Review** | ✅ **Completed** <relative-time datetime="' + time + '">' + time + '</relative-time> | `2667f79` | Manual request |';
  const old = comment(summary({}, sec).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:05:00Z') + securityRow('2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary({}, { ...sec, has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z') + securityRow('2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('running section edit retains observation timestamp after code finding clearance', () => {
  const old = comment(summary({ has_any_findings: true }, { commit_sha: sha, status: 'in_progress', has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T10:05:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T10:04:00Z'), { created_at: '2026-10-15T10:04:00Z', updated_at: '2026-10-15T10:04:00Z' });
  assert.notEqual(gate({ body: '', comments: [old, clean] }).status, 0);
});


test('historically resolved typed finding stays resolved across repeated requests', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  const clean = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.equal(gate({ body: '', comments: [old, clean], formal: true }).status, 0);
});


test('historical code resolution is section-local with unrelated running security', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  const clear = comment(summary({}, { commit_sha: sha, status: 'in_progress', has_any_findings: false, has_unresolved_findings: false }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z'), { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
  assert.equal(gate({ body: '', comments: [old, clear], formal: true }).status, 0);
});


test('contradictory historical section clear cannot resolve a typed finding', () => {
  const old = comment(summary({ has_any_findings: true }).replaceAll('2026-10-15T10:01:00Z', '2026-10-15T08:00:00Z'), { created_at: '2026-10-15T08:00:00Z', updated_at: '2026-10-15T08:00:00Z' });
  for (const extra of ['Found P1 issues.', 'Security review failed.']) {
    const clear = comment(summary().replaceAll('2026-10-15T10:01:00Z', '2026-10-15T09:00:00Z') + '\n' + extra, { created_at: '2026-10-15T09:00:00Z', updated_at: '2026-10-15T09:00:00Z' });
    assert.notEqual(gate({ body: '', comments: [old, clear], formal: true }).status, 0);
  }
});
