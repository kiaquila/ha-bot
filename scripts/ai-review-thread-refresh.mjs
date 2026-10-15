#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { isTrustedReviewLogin } from './ai-review-helpers.mjs';
import { blueprintRoot, readConfig } from './shared.mjs';

async function defaultRequest(token, _repository, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28', ...(options.headers || {}) }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${body}`);
  return body ? JSON.parse(body) : null;
}

async function allPages(request, token, repository, path) {
  const values = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page++) {
    const data = await request(token, repository, `${path}${separator}per_page=100&page=${page}`);
    const batch = data.workflow_runs || data;
    values.push(...batch);
    if (batch.length < 100) return values;
  }
}

async function successfulGate(request, token, repository, pull) {
  const runs = await allPages(request, token, repository,
    `/repos/${repository}/actions/workflows/ai-review.yml/runs?event=pull_request&head_sha=${pull.head.sha}`);
  // Inspect the latest PR run even if cancelled/skipped: an older green run must
  // never cause a retry of a newer failed or active gate. Dispatch is diagnostic.
  const latest = runs.filter((run) => run.event === 'pull_request' && run.head_sha === pull.head.sha &&
      run.pull_requests?.some((pr) => pr.number === pull.number))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || Number(b.id) - Number(a.id))[0];
  return latest?.status === 'completed' && latest.conclusion === 'success' ? latest : null;
}

async function hasUnresolvedCodexThread(request, token, repository, pull, config) {
  const [owner, repo] = repository.split('/');
  let cursor = null, unresolved = false;
  do {
    const response = await request(token, repository, '/graphql', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query($owner:String!,$repo:String!,$number:Int!,$cursor:String) {
          repository(owner:$owner,name:$repo) { pullRequest(number:$number) {
            headRefOid reviewThreads(first:100,after:$cursor) {
              nodes { isResolved comments(first:1) { nodes { author { login __typename } } } }
              pageInfo { hasNextPage endCursor }
            }
          } }
        }`, variables: { owner, repo, number: pull.number, cursor }
      })
    });
    const current = response.data?.repository?.pullRequest;
    const threads = current?.reviewThreads;
    if (response.errors?.length || !threads?.nodes || !threads.pageInfo) throw new Error('Missing review thread evidence.');
    if (current.headRefOid !== pull.head.sha) return false;
    unresolved ||= threads.nodes.some((thread) => !thread.isResolved && thread.comments.nodes.some(({ author }) => {
      const login = author?.__typename === 'Bot' && !author.login.endsWith('[bot]') ? `${author.login}[bot]` : author?.login;
      return isTrustedReviewLogin(login, 'codex', config);
    }));
    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
    if (threads.pageInfo.hasNextPage && !cursor) throw new Error('Missing review thread cursor.');
  } while (cursor);
  return unresolved;
}

// Only invalidates stale green gates. A failed/active gate is never retried;
// after the first POST we return (or propagate its error), bounding each run.
export async function refreshUnresolvedCodexThreads({ token, repository, selectedAgent = 'codex',
  config = {}, request = defaultRequest }) {
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repository || '')) throw new Error('Token and repository are required.');
  if (String(selectedAgent || 'codex').trim().toLowerCase() !== 'codex') return { rerun: false };
  const pulls = await allPages(request, token, repository, `/repos/${repository}/pulls?state=open`);
  for (const pull of pulls) {
    if (pull.state !== 'open' || pull.draft || !/^[a-f0-9]{40}$/.test(pull.head?.sha || '')) continue;
    const run = await successfulGate(request, token, repository, pull);
    if (!run || !await hasUnresolvedCodexThread(request, token, repository, pull, config)) continue;
    const latest = await successfulGate(request, token, repository, pull);
    if (!latest || latest.id !== run.id) continue;
    const live = await request(token, repository, `/repos/${repository}/pulls/${pull.number}`);
    if (live.state !== 'open' || live.draft || live.head?.sha !== pull.head.sha) continue;
    await request(token, repository, `/repos/${repository}/actions/runs/${run.id}/rerun`, { method: 'POST' });
    return { rerun: true, prNumber: pull.number, runId: run.id, headSha: pull.head.sha };
  }
  return { rerun: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await refreshUnresolvedCodexThreads({ token: process.env.GITHUB_TOKEN,
      repository: process.env.GITHUB_REPOSITORY, selectedAgent: process.env.AI_REVIEW_AGENT,
      config: readConfig(blueprintRoot) });
    console.log(result.rerun ? `Requeued real AI Review run ${result.runId} for PR #${result.prNumber} at ${result.headSha}.` :
      'No successful current-head PR gate with an unresolved Codex thread requires requeue.');
  } catch (error) {
    console.error(`AI Review thread refresh failed: ${error.message}`);
    process.exitCode = 1;
  }
}
