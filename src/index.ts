#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { daemon } from "./daemon-client.js";
import { buildListQuery } from "./query.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
let pkgVersion = "0.1.0";
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
  pkgVersion = pkg.version ?? pkgVersion;
} catch { /* fallback to default */ }

const server = new McpServer({
  name: "gitant",
  version: pkgVersion,
});

// Helper to wrap daemon calls with error handling
async function daemonCall<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    };
  }
}

function paginationQuery(offset?: number, limit?: number): string {
  return buildListQuery({ offset, limit });
}

const paginationSchema = {
  offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
  limit: z.number().int().positive().max(100).optional().describe("Page size (max 100)"),
};

// Repository tools
server.registerTool("gitant_list_repos", { description: "List repositories on this node", inputSchema: paginationSchema }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_get_daemon_status", { description: "Get daemon health and node status", inputSchema: {} }, async () => {
  return daemonCall(async () => {
    const [health, status] = await Promise.all([
      daemon.get<{ status: string }>("/health"),
      daemon.get("/api/v1/status"),
    ]);
    return { health, status };
  });
});

server.registerTool("gitant_get_network_status", { description: "Get libp2p peer count and connected peers", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/peers"));
});

server.registerTool("gitant_discover_federation", { description: "Discover federated gitant nodes on the P2P network", inputSchema: {
  did: z.string().optional().describe("Optional DID to look up in the DHT"),
} }, async ({ did }) => {
  const query = did ? `?did=${encodeURIComponent(did)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/federation/discover${query}`));
});

server.registerTool("gitant_get_bootstrap_peers", { description: "List configured federation bootstrap multiaddrs", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/bootstrap"));
});

server.registerTool("gitant_attest_agent", { description: "Publish a cross-peer trust attestation for an agent DID", inputSchema: {
  did: z.string().min(1).describe("Target agent DID"),
  score: z.number().min(0).max(1).describe("Trust score between 0 and 1"),
  reason: z.string().optional().describe("Optional attestation reason"),
} }, async ({ did, score, reason }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/attest`, { score, reason }));
});

server.registerTool("gitant_get_repo", { description: "Get repository metadata, refs, and latest commit", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.registerTool("gitant_create_repo", { description: "Create a new repository", inputSchema: {
  name: z.string().min(1).max(64).describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repo is private"),
} }, async ({ name, description, private: isPrivate }) => {
  return daemonCall(() => daemon.post("/api/v1/repos", {
    name,
    description: description || "",
    private: isPrivate || false,
  }));
});

server.registerTool("gitant_delete_repo", { description: "Delete a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.registerTool("gitant_fork_repository", { description: "Fork a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Source repository name"),
  name: z.string().min(1).max(64).describe("Name for the forked repository"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/fork`, { name }));
});

server.registerTool("gitant_push_code", { description: "Push git objects and ref updates to a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  objects: z.array(z.object({
    hash: z.string().min(1).describe("Git object hash"),
    type: z.enum(["blob", "tree", "commit", "tag"]).describe("Git object type"),
    content: z.string().min(1).describe("Base64-encoded object content"),
  })).optional().describe("Git objects to store"),
  ref_updates: z.array(z.object({
    name: z.string().min(1).describe("Ref name (e.g. refs/heads/main)"),
    old_hash: z.string().optional().describe("Previous ref hash"),
    new_hash: z.string().min(1).describe("New ref hash"),
  })).describe("Reference updates"),
} }, async ({ repo, objects, ref_updates }) => {
  const MAX_BASE64_BYTES = 50 * 1024 * 1024; // 50MB
  if (objects) {
    for (const obj of objects) {
      if (obj.content.length > MAX_BASE64_BYTES) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify({ error: `Object content exceeds 50MB limit (got ${(obj.content.length / 1024 / 1024).toFixed(1)}MB)` }) }],
        };
      }
    }
  }
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/push`, {
    objects: objects ?? [],
    ref_updates,
  }));
});

server.registerTool("gitant_push_packfile", { description: "Push a base64-encoded git packfile and ref updates", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  packfile: z.string().min(1).describe("Base64-encoded git packfile"),
  ref_updates: z.array(z.object({
    name: z.string().min(1).describe("Ref name (e.g. refs/heads/main)"),
    old_hash: z.string().optional().describe("Previous ref hash"),
    new_hash: z.string().min(1).describe("New ref hash"),
  })).describe("Reference updates"),
} }, async ({ repo, packfile, ref_updates }) => {
  const MAX_BASE64_BYTES = 50 * 1024 * 1024; // 50MB
  if (packfile.length > MAX_BASE64_BYTES) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Packfile content exceeds 50MB limit (got ${(packfile.length / 1024 / 1024).toFixed(1)}MB)` }) }],
    };
  }
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/push-packfile`, {
    packfile,
    ref_updates,
  }));
});

server.registerTool("gitant_clone_repo", { description: "Clone/pull a repository (optionally specify branch)", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name or URL"),
  branch: z.string().optional().describe("Branch to pull"),
} }, async ({ repo, branch }) => {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/clone${query}`));
});

// File tools
server.registerTool("gitant_get_file", { description: "Get file contents from a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  path: z.string().min(1).describe("File path"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
} }, async ({ repo, path, ref }) => {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files/${encodeURIComponent(path)}${query}`));
});

server.registerTool("gitant_list_files", { description: "List files in a repository directory", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  path: z.string().optional().describe("Directory path (default: root)"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
} }, async ({ repo, path, ref }) => {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (ref) params.set("ref", ref);
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files${query}`));
});

server.registerTool("gitant_search_code", { description: "Search for text in repository code", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  query: z.string().min(1).describe("Search query"),
  ref: z.string().optional().describe("Git ref to search in"),
} }, async ({ repo, query, ref }) => {
  let url = `/api/v1/repos/${encodeURIComponent(repo)}/search?q=${encodeURIComponent(query)}`;
  if (ref) url += `&ref=${encodeURIComponent(ref)}`;
  return daemonCall(() => daemon.get(url));
});

// Issue tools
server.registerTool("gitant_create_issue", { description: "Create a new issue in a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  labels: z.array(z.string()).optional().describe("Labels for the issue"),
} }, async ({ repo, title, body, labels }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues`, {
    title,
    body: body || "",
    labels: labels || [],
  }));
});

server.registerTool("gitant_list_issues", { description: "List issues in a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "closed", "all"]).optional().describe("Filter by status"),
  labels: z.array(z.string()).optional().describe("Filter by labels"),
  ...paginationSchema,
} }, async ({ repo, status, labels, offset, limit }) => {
  const query = buildListQuery({ status, labels, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues${query}`));
});

server.registerTool("gitant_close_issue", { description: "Close an issue", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID (e.g. issue-1734567890123456789)"),
} }, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/close`));
});

server.registerTool("gitant_get_issue", { description: "Get details of a specific issue", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
} }, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}`));
});

// Pull Request tools
server.registerTool("gitant_open_pr", { description: "Open a new pull request", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("PR title"),
  body: z.string().optional().describe("PR description"),
  source_branch: z.string().min(1).describe("Source branch"),
  target_branch: z.string().min(1).describe("Target branch"),
} }, async ({ repo, title, body, source_branch, target_branch }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs`, {
    title,
    body: body || "",
    source_branch,
    target_branch,
  }));
});

server.registerTool("gitant_list_prs", { description: "List pull requests in a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "closed", "merged", "all"]).optional().describe("Filter by status"),
  ...paginationSchema,
} }, async ({ repo, status, offset, limit }) => {
  const query = buildListQuery({ status, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs${query}`));
});

server.registerTool("gitant_get_pr", { description: "Get details of a specific pull request", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
} }, async ({ repo, pr_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}`));
});

server.registerTool("gitant_review_pr", { description: "Review a pull request", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
  verdict: z.enum(["approve", "request_changes", "comment"]).describe("Review verdict"),
  body: z.string().optional().describe("Review comment"),
} }, async ({ repo, pr_id, verdict, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/review`, {
    verdict,
    body: body || "",
  }));
});

server.registerTool("gitant_merge_pr", { description: "Merge a pull request", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional().describe("Merge strategy"),
} }, async ({ repo, pr_id, merge_method }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/merge`, {
    merge_method: merge_method || "merge",
  }));
});

// Ref tools
server.registerTool("gitant_list_refs", { description: "List all refs (branches, tags) in a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/refs`));
});

server.registerTool("gitant_create_branch", { description: "Create a new branch in a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Branch name"),
  commit: z.string().min(1).describe("Commit hash to point to"),
} }, async ({ repo, name, commit }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/branches`, { name, commit }));
});

// Commit tools
server.registerTool("gitant_get_commit_log", { description: "Get commit history for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().optional().describe("Branch or tag name"),
  limit: z.number().int().positive().max(1000).optional().describe("Max number of commits to return"),
} }, async ({ repo, ref, limit }) => {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  if (limit) params.set("limit", limit.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits${query}`));
});

server.registerTool("gitant_diff_commits", { description: "Compare two commits and show changes", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  from: z.string().min(1).describe("From commit hash"),
  to: z.string().min(1).describe("To commit hash"),
} }, async ({ repo, from, to }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
});

server.registerTool("gitant_get_commit_parents", { description: "Get the parent commits of a specific commit", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  hash: z.string().min(1).describe("Commit hash"),
} }, async ({ repo, hash }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits/${encodeURIComponent(hash)}/parents`));
});

// Agent tools
server.registerTool("gitant_delegate_capability", { description: "Delegate a capability to another agent using UCAN", inputSchema: {
  did: z.string().min(1).describe("Audience DID"),
  resource: z.string().min(1).describe("Resource identifier"),
  actions: z.array(z.string()).describe("Allowed actions"),
} }, async ({ did, resource, actions }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/delegate`, {
    audience: did,
    resource,
    actions,
  }));
});

server.registerTool("gitant_revoke_ucan", { description: "Revoke a UCAN token by its nonce", inputSchema: {
  nonce: z.string().min(1).describe("UCAN nonce to revoke"),
} }, async ({ nonce }) => {
  return daemonCall(() => daemon.post("/api/v1/ucan/revoke", { nonce }));
});

server.registerTool("gitant_verify_ucan", { description: "Verify a UCAN token's validity and signature", inputSchema: {
  token: z.string().min(1).describe("UCAN token to verify"),
} }, async ({ token }) => {
  return daemonCall(() => daemon.post("/api/v1/agents/verify", { token }));
});

server.registerTool("gitant_list_revocations", { description: "List all revoked UCAN nonces", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/ucan/revocations"));
});

// Webhook tools
server.registerTool("gitant_list_webhooks", { description: "List registered webhooks", inputSchema: paginationSchema }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/webhooks${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_register_webhook", { description: "Register a new webhook", inputSchema: {
  url: z.string().min(1).url().describe("Webhook URL"),
  events: z.array(z.string()).min(1).describe("Event types to subscribe to"),
  secret: z.string().optional().describe("Webhook secret for signature verification"),
} }, async ({ url, events, secret }) => {
  return daemonCall(() => daemon.post("/api/v1/webhooks", { url, events, secret }));
});

server.registerTool("gitant_delete_webhook", { description: "Delete a webhook", inputSchema: {
  webhook_id: z.string().min(1).describe("Webhook ID to delete"),
} }, async ({ webhook_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`));
});

// Agent tools (extended)
server.registerTool("gitant_list_agents", { description: "List all known agents", inputSchema: paginationSchema }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_get_agent", { description: "Get details of a specific agent", inputSchema: {
  did: z.string().min(1).describe("Agent DID"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

server.registerTool("gitant_generate_did", { description: "Generate a new DID identity", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.post("/api/v1/agents/generate-did"));
});

server.registerTool("gitant_resolve_did", { description: "Resolve a DID to its document", inputSchema: {
  did: z.string().min(1).describe("DID to resolve"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/resolve/${encodeURIComponent(did)}`));
});

// Task tools
server.registerTool("gitant_list_tasks", { description: "List tasks for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "claimed", "completed"]).optional().describe("Filter by status"),
  ...paginationSchema,
} }, async ({ repo, status, offset, limit }) => {
  const query = buildListQuery({ status, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/tasks${query}`));
});

server.registerTool("gitant_create_task", { description: "Create a new task for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Task title"),
  description: z.string().optional().describe("Task description"),
} }, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks`, { title, description }));
});

server.registerTool("gitant_claim_task", { description: "Claim a task", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
} }, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/claim`));
});

server.registerTool("gitant_complete_task", { description: "Complete a task", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
  result: z.string().optional().describe("Task result"),
} }, async ({ repo, task_id, result }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/complete`, { result }));
});

// Release tools
server.registerTool("gitant_list_releases", { description: "List releases for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/releases${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_get_release", { description: "Get a specific release", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  release_id: z.string().min(1).describe("Release ID"),
} }, async ({ repo, release_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/releases/${encodeURIComponent(release_id)}`));
});

server.registerTool("gitant_create_release", { description: "Create a new release for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  tag: z.string().min(1).describe("Git tag for the release"),
  title: z.string().min(1).describe("Release title"),
  body: z.string().optional().describe("Release notes / body"),
} }, async ({ repo, tag, title, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/releases`, { tag, title, body: body || "" }));
});

server.registerTool("gitant_delete_release", { description: "Delete a release", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  release_id: z.string().min(1).describe("Release ID"),
} }, async ({ repo, release_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/releases/${encodeURIComponent(release_id)}`));
});

// Label tools
server.registerTool("gitant_list_labels", { description: "List labels for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/labels${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_label", { description: "Create a label for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).max(64).describe("Label name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Label color (hex, e.g. #ff0000)"),
} }, async ({ repo, name, color }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/labels`, { name, color }));
});

server.registerTool("gitant_delete_label", { description: "Delete a label from a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Label name"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/labels/${encodeURIComponent(name)}`));
});

server.registerTool("gitant_update_label_color", { description: "Update the color of an existing label", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Label name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("New label color (hex, e.g. #ff0000)"),
} }, async ({ repo, name, color }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/labels/${encodeURIComponent(name)}`, { color }));
});

// Star tools
server.registerTool("gitant_star_repo", { description: "Star a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/star`));
});

server.registerTool("gitant_unstar_repo", { description: "Unstar a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/unstar`));
});

server.registerTool("gitant_get_star_count", { description: "Get the star count for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stars`));
});

// Branch protection tools
server.registerTool("gitant_get_branch_protection", { description: "Get protection rules for a branch", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
} }, async ({ repo, branch }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.registerTool("gitant_set_branch_protection", { description: "Set protection rules for a branch", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
  require_pr: z.boolean().optional().describe("Require pull request before merging"),
  require_approval: z.boolean().optional().describe("Require approval before merging"),
  no_force_push: z.boolean().optional().describe("Disallow force pushes"),
} }, async ({ repo, branch, require_pr, require_approval, no_force_push }) => {
  const body: Record<string, boolean> = {};
  if (require_pr !== undefined) body.require_pr = require_pr;
  if (require_approval !== undefined) body.require_approval = require_approval;
  if (no_force_push !== undefined) body.no_force_push = no_force_push;
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`, body));
});

server.registerTool("gitant_remove_branch_protection", { description: "Remove protection rules for a branch", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
} }, async ({ repo, branch }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.registerTool("gitant_list_branch_protections", { description: "List all branch protection rules for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections`));
});

// Activity tools
server.registerTool("gitant_get_activity", { description: "Get unified activity feed across all repos", inputSchema: {
  ...paginationSchema,
} }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/activity${paginationQuery(offset, limit)}`));
});

// Comment tools
server.registerTool("gitant_add_issue_comment", { description: "Add a comment to an issue", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
  body: z.string().min(1).max(65536).describe("Comment body"),
} }, async ({ repo, issue_id, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/comment`, { body }));
});

server.registerTool("gitant_list_issue_comments", { description: "List comments on an issue", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
} }, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/comments`));
});

server.registerTool("gitant_list_pr_comments", { description: "List comments on a pull request", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
} }, async ({ repo, pr_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/comments`));
});

// Deployment tools
server.registerTool("gitant_list_deployments", { description: "List deployments for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  environment: z.string().optional().describe("Filter by environment"),
  ...paginationSchema,
} }, async ({ repo, environment, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/deployments${buildListQuery({ offset, limit, environment })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_create_deployment", { description: "Create a deployment", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  environment: z.string().min(1).describe("Environment name"),
  ref: z.string().min(1).describe("Git ref (branch/tag/SHA)"),
} }, async ({ repo, environment, ref }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments`, { environment, ref }));
});

server.registerTool("gitant_get_deployment", { description: "Get deployment status", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  deployment_id: z.string().min(1).describe("Deployment ID"),
} }, async ({ repo, deployment_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}`));
});

server.registerTool("gitant_rollback_deployment", { description: "Rollback a deployment", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  deployment_id: z.string().min(1).describe("Deployment ID"),
} }, async ({ repo, deployment_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}/rollback`));
});

// Environment tools
server.registerTool("gitant_list_environments", { description: "List environments for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/environments${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_environment", { description: "Create an environment", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Environment name"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/environments`, { name }));
});

server.registerTool("gitant_delete_environment", { description: "Delete an environment", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Environment name"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/environments/${encodeURIComponent(name)}`));
});

// CI/CD Runner tools
server.registerTool("gitant_list_runners", { description: "List CI/CD runners", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/runners${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_register_runner", { description: "Register a CI/CD runner", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Runner name"),
  tags: z.array(z.string()).optional().describe("Runner tags"),
} }, async ({ repo, name, tags }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/runners`, { name, tags: tags || [] }));
});

server.registerTool("gitant_delete_runner", { description: "Delete a CI/CD runner", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  runner_id: z.string().min(1).describe("Runner ID"),
} }, async ({ repo, runner_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/runners/${encodeURIComponent(runner_id)}`));
});

// CI/CD Variable tools
server.registerTool("gitant_list_variables", { description: "List CI/CD variables", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/variables`));
});

server.registerTool("gitant_set_variable", { description: "Set a CI/CD variable", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  key: z.string().min(1).describe("Variable key"),
  value: z.string().min(1).describe("Variable value"),
  protected: z.boolean().optional().describe("Whether variable is protected"),
} }, async ({ repo, key, value, protected: isProtected }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/variables`, { key, value, protected: isProtected || false }));
});

server.registerTool("gitant_delete_variable", { description: "Delete a CI/CD variable", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  key: z.string().min(1).describe("Variable key"),
} }, async ({ repo, key }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/variables/${encodeURIComponent(key)}`));
});

// CI/CD Pipeline tools
server.registerTool("gitant_list_pipelines", { description: "List CI/CD pipelines", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["pending", "running", "success", "failed", "cancelled"]).optional().describe("Filter by status"),
  ...paginationSchema,
} }, async ({ repo, status, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/pipelines${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_get_pipeline", { description: "Get pipeline details", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pipeline_id: z.string().min(1).describe("Pipeline ID"),
} }, async ({ repo, pipeline_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines/${encodeURIComponent(pipeline_id)}`));
});

server.registerTool("gitant_trigger_pipeline", { description: "Trigger a CI/CD pipeline", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().min(1).describe("Git ref to run pipeline on"),
} }, async ({ repo, ref }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines`, { ref }));
});

// Notification tools
server.registerTool("gitant_list_notifications", { description: "List notifications", inputSchema: {
  unread: z.boolean().optional().describe("Only unread notifications"),
  ...paginationSchema,
} }, async ({ unread, offset, limit }) => {
  const url = `/api/v1/notifications${buildListQuery({ offset, limit, unread })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_mark_notification_read", { description: "Mark a notification as read", inputSchema: {
  notification_id: z.string().min(1).describe("Notification ID"),
} }, async ({ notification_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/notifications/${encodeURIComponent(notification_id)}/read`));
});

server.registerTool("gitant_mark_all_notifications_read", { description: "Mark all notifications as read", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.post("/api/v1/notifications/read-all"));
});

// Snippet tools
server.registerTool("gitant_list_snippets", { description: "List code snippets", inputSchema: {
  ...paginationSchema,
} }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/snippets${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_snippet", { description: "Create a code snippet", inputSchema: {
  title: z.string().min(1).describe("Snippet title"),
  content: z.string().min(1).describe("Snippet content"),
  language: z.string().optional().describe("Programming language"),
  public: z.boolean().optional().describe("Whether snippet is public"),
} }, async ({ title, content, language, public: isPublic }) => {
  return daemonCall(() => daemon.post("/api/v1/snippets", { title, content, language, public: isPublic || false }));
});

server.registerTool("gitant_get_snippet", { description: "Get a code snippet", inputSchema: {
  snippet_id: z.string().min(1).describe("Snippet ID"),
} }, async ({ snippet_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/snippets/${encodeURIComponent(snippet_id)}`));
});

server.registerTool("gitant_delete_snippet", { description: "Delete a code snippet", inputSchema: {
  snippet_id: z.string().min(1).describe("Snippet ID"),
} }, async ({ snippet_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/snippets/${encodeURIComponent(snippet_id)}`));
});

server.registerTool("gitant_update_snippet", { description: "Update a code snippet", inputSchema: {
  snippet_id: z.string().min(1).describe("Snippet ID"),
  title: z.string().min(1).optional().describe("New title"),
  content: z.string().optional().describe("New content"),
  visibility: z.enum(["public", "private"]).optional().describe("New visibility"),
} }, async ({ snippet_id, title, content, visibility }) => {
  return daemonCall(() => daemon.put(`/api/v1/snippets/${encodeURIComponent(snippet_id)}`, { title, content, visibility }));
});

// Milestone tools
server.registerTool("gitant_list_milestones", { description: "List milestones for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state"),
  ...paginationSchema,
} }, async ({ repo, state, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/milestones${buildListQuery({ offset, limit, state })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_create_milestone", { description: "Create a milestone", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Milestone title"),
  description: z.string().optional().describe("Milestone description"),
  due_date: z.string().optional().describe("Due date (ISO 8601)"),
} }, async ({ repo, title, description, due_date }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/milestones`, { title, description, due_date }));
});

server.registerTool("gitant_get_milestone", { description: "Get a milestone", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  milestone_id: z.string().min(1).describe("Milestone ID"),
} }, async ({ repo, milestone_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/milestones/${encodeURIComponent(milestone_id)}`));
});

server.registerTool("gitant_update_milestone", { description: "Update a milestone", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  milestone_id: z.string().min(1).describe("Milestone ID"),
  title: z.string().min(1).optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  due_date: z.string().optional().describe("New due date (ISO 8601)"),
  state: z.enum(["open", "closed"]).optional().describe("New state"),
} }, async ({ repo, milestone_id, title, description, due_date, state }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/milestones/${encodeURIComponent(milestone_id)}`, { title, description, due_date, state }));
});

server.registerTool("gitant_close_milestone", { description: "Close a milestone", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  milestone_id: z.string().min(1).describe("Milestone ID"),
} }, async ({ repo, milestone_id }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/milestones/${encodeURIComponent(milestone_id)}`, { state: "closed" }));
});

// Epic tools
server.registerTool("gitant_list_epics", { description: "List epics for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/epics${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_epic", { description: "Create an epic", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Epic title"),
  description: z.string().optional().describe("Epic description"),
} }, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/epics`, { title, description }));
});

server.registerTool("gitant_get_epic", { description: "Get an epic", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  epic_id: z.string().min(1).describe("Epic ID"),
} }, async ({ repo, epic_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/epics/${encodeURIComponent(epic_id)}`));
});

server.registerTool("gitant_update_epic", { description: "Update an epic", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  epic_id: z.string().min(1).describe("Epic ID"),
  title: z.string().min(1).optional().describe("New title"),
  description: z.string().optional().describe("New description"),
  state: z.enum(["open", "closed"]).optional().describe("New state"),
} }, async ({ repo, epic_id, title, description, state }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/epics/${encodeURIComponent(epic_id)}`, { title, description, state }));
});

server.registerTool("gitant_delete_epic", { description: "Delete an epic", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  epic_id: z.string().min(1).describe("Epic ID"),
} }, async ({ repo, epic_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/epics/${encodeURIComponent(epic_id)}`));
});

// Project (kanban board) tools
server.registerTool("gitant_list_projects", { description: "List project boards for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["active", "closed", "archived"]).optional().describe("Filter by status"),
} }, async ({ repo, status }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/projects${buildListQuery({ status })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_get_project", { description: "Get a project board with its columns and cards", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  project_id: z.string().min(1).describe("Project ID"),
} }, async ({ repo, project_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/projects/${encodeURIComponent(project_id)}`));
});

server.registerTool("gitant_create_project", { description: "Create a project board", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Project name"),
  description: z.string().optional().describe("Project description"),
} }, async ({ repo, name, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/projects`, { name, description }));
});

server.registerTool("gitant_add_project_card", { description: "Add a card to a project board column", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  project_id: z.string().min(1).describe("Project ID"),
  column_id: z.string().min(1).describe("Column ID"),
  title: z.string().min(1).describe("Card title"),
  description: z.string().optional().describe("Card description"),
  assignee: z.string().optional().describe("Assignee"),
  issue_id: z.string().optional().describe("Linked issue ID"),
  pr_id: z.string().optional().describe("Linked PR ID"),
} }, async ({ repo, project_id, column_id, title, description, assignee, issue_id, pr_id }) => {
  return daemonCall(() => daemon.post(
    `/api/v1/repos/${encodeURIComponent(repo)}/projects/${encodeURIComponent(project_id)}/columns/${encodeURIComponent(column_id)}/cards`,
    { title, description, assignee, issue_id, pr_id },
  ));
});

server.registerTool("gitant_move_project_card", { description: "Move a card to a different column/position on a project board", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  project_id: z.string().min(1).describe("Project ID"),
  card_id: z.string().min(1).describe("Card ID"),
  column_id: z.string().min(1).describe("Destination column ID"),
  order: z.number().int().nonnegative().optional().describe("Position within the column"),
} }, async ({ repo, project_id, card_id, column_id, order }) => {
  return daemonCall(() => daemon.put(
    `/api/v1/repos/${encodeURIComponent(repo)}/projects/${encodeURIComponent(project_id)}/cards/${encodeURIComponent(card_id)}/move`,
    { column_id, order },
  ));
});

// Discussion tools
server.registerTool("gitant_list_discussions", { description: "List discussions for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/discussions${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_get_discussion", { description: "Get a discussion with its answers", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  discussion_id: z.string().min(1).describe("Discussion ID"),
} }, async ({ repo, discussion_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/discussions/${encodeURIComponent(discussion_id)}`));
});

server.registerTool("gitant_create_discussion", { description: "Create a discussion thread", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Discussion title"),
  body: z.string().min(1).describe("Discussion body"),
  category: z.string().optional().describe("Category (e.g. Q&A, General)"),
} }, async ({ repo, title, body, category }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/discussions`, { title, body, category }));
});

server.registerTool("gitant_answer_discussion", { description: "Add an answer to a discussion", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  discussion_id: z.string().min(1).describe("Discussion ID"),
  body: z.string().min(1).describe("Answer body"),
} }, async ({ repo, discussion_id, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/discussions/${encodeURIComponent(discussion_id)}/answers`, { body }));
});

server.registerTool("gitant_accept_discussion_answer", { description: "Mark an answer as the accepted answer", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  discussion_id: z.string().min(1).describe("Discussion ID"),
  answer_id: z.string().min(1).describe("Answer ID"),
} }, async ({ repo, discussion_id, answer_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/discussions/${encodeURIComponent(discussion_id)}/answers/${encodeURIComponent(answer_id)}/accept`));
});

server.registerTool("gitant_upvote_discussion", { description: "Upvote a discussion", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  discussion_id: z.string().min(1).describe("Discussion ID"),
} }, async ({ repo, discussion_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/discussions/${encodeURIComponent(discussion_id)}/upvote`));
});

// Wiki tools
server.registerTool("gitant_list_wiki_pages", { description: "List wiki pages for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/wiki`));
});

server.registerTool("gitant_get_wiki_page", { description: "Get a wiki page by slug", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  slug: z.string().min(1).describe("Page slug"),
} }, async ({ repo, slug }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/wiki/${encodeURIComponent(slug)}`));
});

server.registerTool("gitant_create_wiki_page", { description: "Create a wiki page", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Page title"),
  content: z.string().min(1).describe("Page content (markdown)"),
  slug: z.string().optional().describe("Page slug (derived from title if omitted)"),
} }, async ({ repo, title, content, slug }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/wiki`, { title, content, slug }));
});

server.registerTool("gitant_update_wiki_page", { description: "Update a wiki page", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  slug: z.string().min(1).describe("Page slug"),
  title: z.string().optional().describe("New title"),
  content: z.string().optional().describe("New content (markdown)"),
} }, async ({ repo, slug, title, content }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/wiki/${encodeURIComponent(slug)}`, { title, content }));
});

server.registerTool("gitant_delete_wiki_page", { description: "Delete a wiki page", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  slug: z.string().min(1).describe("Page slug"),
} }, async ({ repo, slug }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/wiki/${encodeURIComponent(slug)}`));
});

// Bounty tools
server.registerTool("gitant_list_bounties", { description: "List bounties for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "claimed", "paid"]).optional().describe("Filter by status"),
  ...paginationSchema,
} }, async ({ repo, status, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/bounties${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_create_bounty", { description: "Create a bounty", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
  amount: z.number().positive().describe("Bounty amount"),
  token: z.string().optional().describe("Token symbol"),
} }, async ({ repo, issue_id, amount, token }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties`, { issue_id, amount, token }));
});

server.registerTool("gitant_claim_bounty", { description: "Claim a bounty", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
} }, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/claim`));
});

// Todo tools
server.registerTool("gitant_list_todos", { description: "List todo items", inputSchema: {
  status: z.enum(["open", "done", "all"]).optional().describe("Filter by status"),
  ...paginationSchema,
} }, async ({ status, offset, limit }) => {
  const url = `/api/v1/todos${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.registerTool("gitant_create_todo", { description: "Create a todo item", inputSchema: {
  title: z.string().min(1).describe("Todo title"),
  body: z.string().optional().describe("Todo description"),
} }, async ({ title, body }) => {
  return daemonCall(() => daemon.post("/api/v1/todos", { title, body }));
});

server.registerTool("gitant_complete_todo", { description: "Mark a todo as complete", inputSchema: {
  todo_id: z.string().min(1).describe("Todo ID"),
} }, async ({ todo_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/todos/${encodeURIComponent(todo_id)}/complete`));
});

server.registerTool("gitant_delete_todo", { description: "Delete a todo item", inputSchema: {
  todo_id: z.string().min(1).describe("Todo ID"),
} }, async ({ todo_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/todos/${encodeURIComponent(todo_id)}`));
});

// Changelog tool
server.registerTool("gitant_get_changelog", { description: "Get unified activity changelog for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  limit: z.number().int().positive().max(100).optional().describe("Max events"),
} }, async ({ repo, limit }) => {
  const query = limit ? `?limit=${limit}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/changelog${query}`));
});

// Cert tools
server.registerTool("gitant_list_certs", { description: "List signed ref-update certificates", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs`));
});

server.registerTool("gitant_get_cert", { description: "Get a specific certificate", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  cert_id: z.string().min(1).describe("Certificate ID"),
} }, async ({ repo, cert_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs/${encodeURIComponent(cert_id)}`));
});

// IPFS tools
server.registerTool("gitant_list_ipfs_pins", { description: "List all CIDs pinned to the node", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/ipfs/pins"));
});

server.registerTool("gitant_get_ipfs_object", { description: "Retrieve a git object by CIDv1", inputSchema: {
  cid: z.string().min(1).describe("CIDv1 hash"),
} }, async ({ cid }) => {
  return daemonCall(() => daemon.get(`/api/v1/ipfs/${encodeURIComponent(cid)}`));
});

// Sync tools
server.registerTool("gitant_trigger_sync", { description: "Trigger sync from all known peers", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.post("/api/v1/sync/trigger"));
});

server.registerTool("gitant_get_sync_status", { description: "Get sync queue status", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/sync/status"));
});

// Name tools
server.registerTool("gitant_register_name", { description: "Register a name on Base L2", inputSchema: {
  name: z.string().min(1).describe("Name to register"),
} }, async ({ name }) => {
  return daemonCall(() => daemon.post("/api/v1/names/register", { name }));
});

server.registerTool("gitant_resolve_name", { description: "Resolve a name to owner address and DID", inputSchema: {
  name: z.string().min(1).describe("Name to resolve"),
} }, async ({ name }) => {
  return daemonCall(() => daemon.get(`/api/v1/names/${encodeURIComponent(name)}/resolve`));
});

server.registerTool("gitant_lookup_name", { description: "Reverse lookup DID to registered name", inputSchema: {
  did: z.string().min(1).describe("DID to lookup"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/names/lookup?did=${encodeURIComponent(did)}`));
});

// Whoami tool
server.registerTool("gitant_whoami", { description: "Get current identity (DID) and node info", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/identity"));
});

// Mirror tools
server.registerTool("gitant_mirror_repo", { description: "Mirror a repo from GitHub/GitLab", inputSchema: {
  source_url: z.string().min(1).url().describe("Source repository URL"),
  name: z.string().optional().describe("Local repo name"),
} }, async ({ source_url, name }) => {
  return daemonCall(() => daemon.post("/api/v1/mirrors", { source_url, name }));
});

server.registerTool("gitant_list_mirrors", { description: "List mirrored repositories", inputSchema: {
  ...paginationSchema,
} }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/mirrors${paginationQuery(offset, limit)}`));
});

// Seed node tools
server.registerTool("gitant_list_seeds", { description: "List seed nodes", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/seeds"));
});

server.registerTool("gitant_add_seed", { description: "Add a seed node", inputSchema: {
  multiaddr: z.string().min(1).describe("Multiaddr of the seed node"),
} }, async ({ multiaddr }) => {
  return daemonCall(() => daemon.post("/api/v1/network/seeds", { multiaddr }));
});

server.registerTool("gitant_remove_seed", { description: "Remove a seed node", inputSchema: {
  multiaddr: z.string().min(1).describe("Multiaddr of the seed node"),
} }, async ({ multiaddr }) => {
  return daemonCall(() => daemon.delete(`/api/v1/network/seeds/${encodeURIComponent(multiaddr)}`));
});

// Workspace tools
server.registerTool("gitant_list_workspaces", { description: "List workspaces", inputSchema: {
  ...paginationSchema,
} }, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/workspaces${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_workspace", { description: "Create a workspace", inputSchema: {
  name: z.string().min(1).describe("Workspace name"),
  description: z.string().optional().describe("Workspace description"),
} }, async ({ name, description }) => {
  return daemonCall(() => daemon.post("/api/v1/workspaces", { name, description }));
});

// NOTE: Legacy "forum" and "chat" tools were removed. Forum threads are now
// served by the canonical discussion tools (gitant_*_discussion) which map to
// the daemon's /discussions routes. Real-time chat has no daemon backend yet.

// Governance tools
server.registerTool("gitant_list_governance_proposals", { description: "List governance proposals", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/governance${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_create_governance_proposal", { description: "Create a governance proposal", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Proposal title"),
  description: z.string().min(1).describe("Proposal description"),
  type: z.string().min(1).describe("Proposal type"),
} }, async ({ repo, title, description, type: proposalType }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/governance`, { title, description, type: proposalType }));
});

server.registerTool("gitant_vote_on_proposal", { description: "Vote on a governance proposal", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  proposal_id: z.string().min(1).describe("Proposal ID"),
  vote: z.enum(["yes", "no", "abstain"]).describe("Vote"),
} }, async ({ repo, proposal_id, vote }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/governance/${encodeURIComponent(proposal_id)}/vote`, { vote }));
});

// Stacked diff tools
server.registerTool("gitant_list_stacks", { description: "List stacked diffs", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stacks`));
});

server.registerTool("gitant_get_stack", { description: "Get a stacked diff", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  stack_id: z.string().min(1).describe("Stack ID"),
} }, async ({ repo, stack_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stacks/${encodeURIComponent(stack_id)}`));
});

// Time tracking tools
server.registerTool("gitant_list_time_entries", { description: "List time tracking entries", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
} }, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/time${paginationQuery(offset, limit)}`));
});

server.registerTool("gitant_start_timer", { description: "Start a time tracking timer", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().optional().describe("Issue ID to track time against"),
  description: z.string().optional().describe("Time entry description"),
} }, async ({ repo, issue_id, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/time/start`, { issue_id, description }));
});

server.registerTool("gitant_stop_timer", { description: "Stop the current timer", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/time/stop`));
});

// Identity tools
server.registerTool("gitant_identity_new", { description: "Generate a new Ed25519 keypair and DID", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.post("/api/v1/identity/generate"));
});

server.registerTool("gitant_identity_export", { description: "Export DID document as JSON", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.get("/api/v1/identity/export"));
});

server.registerTool("gitant_identity_sign", { description: "Sign a message with Ed25519 private key", inputSchema: {
  message: z.string().min(1).describe("Message to sign"),
} }, async ({ message }) => {
  return daemonCall(() => daemon.post("/api/v1/identity/sign", { message }));
});

// Peer tools
server.registerTool("gitant_peer_add", { description: "Add a peer by multiaddr", inputSchema: {
  multiaddr: z.string().min(1).describe("Peer multiaddr"),
} }, async ({ multiaddr }) => {
  return daemonCall(() => daemon.post("/api/v1/network/peers", { multiaddr }));
});

// Bounty tools (extended)
server.registerTool("gitant_approve_bounty", { description: "Approve bounty submission and release payment", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
} }, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/approve`));
});

server.registerTool("gitant_cancel_bounty", { description: "Cancel bounty and refund escrow", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
} }, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/cancel`));
});

server.registerTool("gitant_bounty_stats", { description: "Show bounty statistics for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/stats`));
});

// Task tools (extended)
server.registerTool("gitant_fail_task", { description: "Mark a task as failed", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
} }, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/fail`));
});

// Cert tools (extended)
server.registerTool("gitant_verify_cert", { description: "Verify a ref-update certificate's signature", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  cert_id: z.string().min(1).describe("Certificate ID"),
} }, async ({ repo, cert_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs/${encodeURIComponent(cert_id)}/verify`));
});

// Identity (extended)
server.registerTool("gitant_identity_resolve", { description: "Resolve any DID method to its document", inputSchema: {
  did: z.string().min(1).describe("DID to resolve"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/identity/resolve/${encodeURIComponent(did)}`));
});

server.registerTool("gitant_identity_register_did", { description: "Anchor DID document on-chain (did:gitlawb)", inputSchema: {} }, async () => {
  return daemonCall(() => daemon.post("/api/v1/identity/register-did"));
});

// Cert (extended)
server.registerTool("gitant_set_cert_threshold", { description: "Set required signature threshold for ref updates", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  threshold: z.number().int().positive().describe("Required signatures"),
} }, async ({ repo, threshold }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/threshold`, { threshold }));
});

server.registerTool("gitant_sign_cert", { description: "Sign a ref-update certificate", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().min(1).describe("Ref name"),
  old_oid: z.string().min(1).describe("Previous commit hash"),
  new_oid: z.string().min(1).describe("New commit hash"),
} }, async ({ repo, ref, old_oid, new_oid }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/sign`, { ref, old_oid, new_oid }));
});

// Secrets tools
server.registerTool("gitant_list_secrets", { description: "List secret names (values never shown)", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`));
});

server.registerTool("gitant_set_secret", { description: "Set a secret (encrypted, capability-bound)", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
  value: z.string().min(1).describe("Secret value"),
} }, async ({ repo, name, value }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`, { name, value }));
});

server.registerTool("gitant_get_secret", { description: "Get a secret value (requires secrets/read capability)", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
});

server.registerTool("gitant_delete_secret", { description: "Delete a secret", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
} }, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
});

// Trust score tools
server.registerTool("gitant_trust_show", { description: "Show trust score and VC for an agent", inputSchema: {
  did: z.string().min(1).describe("Agent DID"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}/trust`));
});

server.registerTool("gitant_trust_issue", { description: "Issue a trust score VC for an agent", inputSchema: {
  did: z.string().min(1).describe("Agent DID"),
} }, async ({ did }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/trust/issue`));
});

server.registerTool("gitant_trust_verify", { description: "Verify a trust score VC", inputSchema: {
  vc: z.string().min(1).describe("VC JWT to verify"),
} }, async ({ vc }) => {
  return daemonCall(() => daemon.post("/api/v1/trust/verify", { vc }));
});

// Maintainers tools
server.registerTool("gitant_list_maintainers", { description: "List maintainers for a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
} }, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers`));
});

server.registerTool("gitant_add_maintainer", { description: "Add a maintainer to a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  did: z.string().min(1).describe("Maintainer DID"),
} }, async ({ repo, did }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers`, { did }));
});

server.registerTool("gitant_remove_maintainer", { description: "Remove a maintainer from a repository", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  did: z.string().min(1).describe("Maintainer DID"),
} }, async ({ repo, did }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers/${encodeURIComponent(did)}`));
});

// Repo tokenization
server.registerTool("gitant_tokenize_repo", { description: "Deploy ERC-20 token tied to this repo", inputSchema: {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Token name"),
  symbol: z.string().min(1).describe("Token symbol"),
} }, async ({ repo, name, symbol }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tokenize`, { name, symbol }));
});
async function main() {
  // Check daemon connectivity before starting
  try {
    await daemon.get("/health");
    console.error(`[gitant] daemon reachable at ${process.env.GITANT_DAEMON_URL || "http://localhost:7777"}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "unknown error";
    console.error(`[gitant] WARNING: daemon not reachable: ${msg}`);
    console.error("[gitant] MCP server will start anyway — tool calls will fail until daemon is running");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gitant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
