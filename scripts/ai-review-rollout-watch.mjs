#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { rerunAiReviewForPrHead } from './ai-review-rerun.mjs';

const exec = promisify(execFile);
async function ghRequest(_token, _repository, path, options = {}) {
  const args = ['api', path];
  if (options.method) args.push('--method', options.method);
  for (const [key, value] of Object.entries(options.body || {})) args.push('-f', `${key}=${value}`);
  const { stdout } = await exec('gh', args, { maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : null;
}
async function allPages(request, repository, path) {
  const values = [];
  for (let page = 1; ; page++) {
    const batch = await request('authorized-gh-session', repository, `${path}?per_page=100&page=${page}`);
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

async function reviewThreads(request, repository, prNumber) {
  const [owner, repo] = repository.split('/');
  const nodes = [];
  let cursor = null;
  do {
    const query = `query { repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(repo)}) { pullRequest(number:${prNumber}) { reviewThreads(first:100,after:${JSON.stringify(cursor)}) { pageInfo {hasNextPage endCursor} nodes {id isResolved} } } } }`;
    const data = await request('authorized-gh-session', repository, '/graphql', { method: 'POST', body: { query } });
    if (data.errors?.length) throw new Error('Rollout watcher cannot read review threads.');
    const page = data.data.repository.pullRequest.reviewThreads;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (page.pageInfo.hasNextPage && !cursor) throw new Error('Rollout watcher received an invalid thread cursor.');
  } while (cursor);
  return nodes;
}

// The operator starts this already-reviewed local code before labeled validation
// and supervises it through merge. It supplies pre-merge routing while main still
// contains the old issue_comment workflow; it never creates review evidence.
export async function watchRolloutReview({
  repository, prNumber, headSha, request = ghRequest,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now, pollMs = 5000, maxMs = 1800000, log = console.log
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !/^[1-9]\d*$/.test(String(prNumber)) ||
      !/^[a-f0-9]{40}$/.test(headSha || '')) throw new Error('Repository, PR number, and full reviewed head SHA are required.');
  const started = now();
  let previous = null;
  while (now() - started < maxMs) {
    const pull = await request('authorized-gh-session', repository, `/repos/${repository}/pulls/${prNumber}`);
    if (pull.head?.sha !== headSha) throw new Error('Rollout watcher stopped: PR head moved; fresh review is required.');
    if (pull.state !== 'open') {
      if (!pull.merged) throw new Error('Rollout watcher stopped: PR closed without merge.');
      log(`Rollout watcher confirmed merge of ${headSha}.`);
      return;
    }
    const [comments, reviews, inline, threads] = await Promise.all([
      allPages(request, repository, `/repos/${repository}/issues/${prNumber}/comments`),
      allPages(request, repository, `/repos/${repository}/pulls/${prNumber}/reviews`),
      allPages(request, repository, `/repos/${repository}/pulls/${prNumber}/comments`),
      reviewThreads(request, repository, prNumber)
    ]);
    const evidence = JSON.stringify([
      comments.filter((comment) => comment.user?.login !== 'github-actions[bot]'), reviews, inline, threads
    ]);
    if (previous !== null && evidence !== previous) {
      log(`Review evidence changed on ${headSha}; requeueing the real PR gate.`);
      const result = await rerunAiReviewForPrHead({ token: 'authorized-gh-session', repository,
        headSha, prNumber, request, sleep, now, evidenceUpdatedAt: null });
      if (result.action !== 'rerun') throw new Error(`Rollout watcher could not invalidate the gate: ${result.action}.`);
      log(result.message);
    }
    previous = evidence;
    log(`Rollout watcher active for ${headSha}.`);
    await sleep(pollMs);
  }
  throw new Error('Rollout watcher expired before merge; restart supervision and the full readiness window.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [repository, prNumber, headSha] = process.argv.slice(2);
    await watchRolloutReview({ repository, prNumber, headSha });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
