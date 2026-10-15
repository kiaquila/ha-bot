#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  extractClaudeOutcome,
  isCodexReviewSignal,
  isTrustedReviewLogin
} from "./ai-review-helpers.mjs";
import { blueprintRoot, readConfig } from "./shared.mjs";

const rerunnableConclusions = new Set(["failure", "cancelled", "timed_out", "action_required"]);
const activeStatuses = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

function normalizeAgent(agent) {
  return String(agent || "codex").trim().toLowerCase() || "codex";
}

export function shouldRouteAiReviewRerunEvent(event, selectedAgent = "codex", config = {}) {
  const agent = normalizeAgent(selectedAgent);

  if (event?.review) {
    if (!["submitted", "edited", "dismissed"].includes(event.action)) return false;
    return ["codex", "gemini"].includes(agent) &&
      isTrustedReviewLogin(event.review.user?.login, agent, config);
  }

  if (event?.pull_request?.number && event?.comment) {
    return ["created", "edited", "deleted"].includes(event.action) &&
      ["codex", "gemini"].includes(agent) && isTrustedReviewLogin(event.comment.user?.login, agent, config);
  }

  if (!event?.issue?.pull_request || !event?.comment || !["created", "edited"].includes(event.action)) return false;
  const body = String(event.comment.body || "");
  const login = event.comment.user?.login;

  if (agent === "codex") {
    const previous = event.action === "edited" ? event.changes?.body?.from : null;
    return (isCodexReviewSignal(body) || isCodexReviewSignal(previous)) && isTrustedReviewLogin(login, "codex", config);
  }

  if (agent === "claude") {
    const previous = event.action === "edited" ? event.changes?.body?.from : null;
    return Boolean(extractClaudeOutcome(body) || extractClaudeOutcome(previous)) && isTrustedReviewLogin(login, "claude", config);
  }

  return false;
}

export function rerunEvidenceUpdatedAt(event) {
  // REST formal reviews retain submitted_at after edits/dismissal. Missing time
  // deliberately forces conservative requeue of an already successful gate.
  if (event.review) return event.action === "submitted" ? event.review.submitted_at : null;
  if (event.pull_request && event.comment && event.action !== "created") return null;
  return event.comment?.updated_at || event.comment?.created_at;
}

export function selectAiReviewRun(runs = [], headSha) {
  const candidates = runs
    .filter((run) => ["pull_request", "workflow_dispatch"].includes(run.event) && run.head_sha === headSha)
    .filter((run) => activeStatuses.has(run.status) ||
      (run.status === "completed" && (rerunnableConclusions.has(run.conclusion) || run.conclusion === "success")));
  // Dispatch jobs are diagnostic: GitHub rulesets only evaluate eligible PR jobs.
  const matchingRuns = (candidates.some((run) => run.event === "pull_request")
    ? candidates.filter((run) => run.event === "pull_request") : candidates)
    .sort((left, right) => Date.parse(right.created_at || "") - Date.parse(left.created_at || "") || Number(right.id) - Number(left.id));

  const latest = matchingRuns[0];
  if (!latest) return { action: "not_found", run: null };
  if (activeStatuses.has(latest.status)) return { action: "already_running", run: latest };
  if (latest.status === "completed" && rerunnableConclusions.has(latest.conclusion)) return { action: "rerun", run: latest };
  if (latest.status === "completed" && latest.conclusion === "success") return { action: "already_success", run: latest };
  return { action: "not_found", run: null };
}

async function defaultRequest(token, repository, path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function listPaginated(request, token, repository, path) {
  const items = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; ; page += 1) {
    const data = await request(token, repository, `${path}${separator}per_page=100&page=${page}`);
    const batch = data.workflow_runs || data;
    items.push(...batch);
    if (batch.length < 100) return items;
  }
}

export async function rerunAiReviewForPrHead({
  token,
  repository,
  headSha,
  prNumber,
  evidenceUpdatedAt = null,
  request = defaultRequest,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  waitMs = 120000
}) {
  if (!token || !repository || !headSha || !prNumber) {
    throw new Error("token, repository, headSha, and prNumber are required to rerun AI Review.");
  }
  const pullPath = `/repos/${repository}/pulls/${prNumber}`;
  const currentHead = async () => {
    const pull = await request(token, repository, pullPath);
    return pull.state === "open" && pull.head?.sha === headSha;
  };
  const started = now();
  let delay = 2000;
  while (true) {
    if (!await currentHead()) return { action: "stale", message: "PR head moved or PR closed; rerun rejected." };
    const runs = await listPaginated(request, token, repository,
      `/repos/${repository}/actions/workflows/ai-review.yml/runs?head_sha=${encodeURIComponent(headSha)}`);
    const selected = selectAiReviewRun(runs, headSha);
    if (selected.action === "already_running") {
      // Wait through completion: the active gate may already have read its last evidence snapshot.
      if (now() - started >= waitMs) throw new Error("AI Review is still active; bounded rerun wait expired.");
      await sleep(Math.min(delay, waitMs - (now() - started)));
      delay = Math.min(delay * 2, 10000);
      continue;
    }
    const evidenceTime = Date.parse(evidenceUpdatedAt || "");
    const runStarted = Date.parse(selected.run?.run_started_at || selected.run?.created_at || "");
    if (Number.isFinite(evidenceTime) && Number.isFinite(runStarted) && evidenceTime < runStarted) {
      return { action: "already_evaluated", message: `AI Review already evaluated this evidence for ${headSha}.` };
    }
    const changedEvidence = !Number.isFinite(evidenceTime) || !Number.isFinite(runStarted) || evidenceTime >= runStarted;
    if (selected.action === "rerun" || (selected.action === "already_success" && changedEvidence)) {
      // Check again immediately before POST so a new push cannot requeue the obsolete head.
      if (!await currentHead()) return { action: "stale", message: "PR head moved before rerun; rejected." };
      await request(token, repository, `/repos/${repository}/actions/runs/${selected.run.id}/rerun`, { method: "POST" });
      return { ...selected, action: "rerun", message: `Requested AI Review rerun for ${headSha} from run ${selected.run.id}.` };
    }
    return { ...selected, message: `AI Review rerun: ${selected.action} for ${headSha}.` };
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const selectedAgent = normalizeAgent(process.env.AI_REVIEW_AGENT);
  const config = readConfig(blueprintRoot);

  if (!token || !repository || !eventPath) {
    console.error("GITHUB_TOKEN, GITHUB_REPOSITORY, and GITHUB_EVENT_PATH are required.");
    process.exit(1);
  }

  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  if (!shouldRouteAiReviewRerunEvent(event, selectedAgent, config)) {
    console.log("AI Review rerun skipped: event is not trusted review evidence for the selected agent.");
    return;
  }

  const prNumber = event.pull_request?.number || event.issue?.number;
  const pull = await defaultRequest(token, repository, `/repos/${repository}/pulls/${prNumber}`);
  const evidenceUpdatedAt = rerunEvidenceUpdatedAt(event);
  const evidenceHead = event.review?.commit_id;
  if (evidenceHead && evidenceHead !== pull.head?.sha) {
    console.log("AI Review rerun skipped: review belongs to an obsolete head.");
    return;
  }
  const result = await rerunAiReviewForPrHead({
    token,
    repository,
    headSha: pull.head?.sha,
    prNumber,
    evidenceUpdatedAt
  });
  console.log(result.message);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`AI Review rerun failed: ${error.message}`);
    process.exit(1);
  }
}
