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
server.tool("gitant_list_repos", "List repositories on this node", paginationSchema, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos${paginationQuery(offset, limit)}`));
});

server.tool("gitant_get_daemon_status", "Get daemon health and node status", {}, async () => {
  return daemonCall(async () => {
    const [health, status] = await Promise.all([
      daemon.get<{ status: string }>("/health"),
      daemon.get("/api/v1/status"),
    ]);
    return { health, status };
  });
});

server.tool("gitant_get_network_status", "Get libp2p peer count and connected peers", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/peers"));
});

server.tool("gitant_discover_federation", "Discover federated gitant nodes on the P2P network", {
  did: z.string().optional().describe("Optional DID to look up in the DHT"),
}, async ({ did }) => {
  const query = did ? `?did=${encodeURIComponent(did)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/federation/discover${query}`));
});

server.tool("gitant_get_bootstrap_peers", "List configured federation bootstrap multiaddrs", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/bootstrap"));
});

server.tool("gitant_attest_agent", "Publish a cross-peer trust attestation for an agent DID", {
  did: z.string().min(1).describe("Target agent DID"),
  score: z.number().min(0).max(1).describe("Trust score between 0 and 1"),
  reason: z.string().optional().describe("Optional attestation reason"),
}, async ({ did, score, reason }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/attest`, { score, reason }));
});

server.tool("gitant_get_repo", "Get repository metadata, refs, and latest commit", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.tool("gitant_create_repo", "Create a new repository", {
  name: z.string().min(1).max(64).describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repo is private"),
}, async ({ name, description, private: isPrivate }) => {
  return daemonCall(() => daemon.post("/api/v1/repos", {
    name,
    description: description || "",
    private: isPrivate || false,
  }));
});

server.tool("gitant_delete_repo", "Delete a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.tool("gitant_fork_repository", "Fork a repository", {
  repo: z.string().min(1).max(64).describe("Source repository name"),
  name: z.string().min(1).max(64).describe("Name for the forked repository"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/fork`, { name }));
});

server.tool("gitant_push_code", "Push git objects and ref updates to a repository", {
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
}, async ({ repo, objects, ref_updates }) => {
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

server.tool("gitant_push_packfile", "Push a base64-encoded git packfile and ref updates", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  packfile: z.string().min(1).describe("Base64-encoded git packfile"),
  ref_updates: z.array(z.object({
    name: z.string().min(1).describe("Ref name (e.g. refs/heads/main)"),
    old_hash: z.string().optional().describe("Previous ref hash"),
    new_hash: z.string().min(1).describe("New ref hash"),
  })).describe("Reference updates"),
}, async ({ repo, packfile, ref_updates }) => {
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

server.tool("gitant_clone_repo", "Clone/pull a repository (optionally specify branch)", {
  repo: z.string().min(1).max(64).describe("Repository name or URL"),
  branch: z.string().optional().describe("Branch to pull"),
}, async ({ repo, branch }) => {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/clone${query}`));
});

// File tools
server.tool("gitant_get_file", "Get file contents from a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  path: z.string().min(1).describe("File path"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
}, async ({ repo, path, ref }) => {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files/${encodeURIComponent(path)}${query}`));
});

server.tool("gitant_list_files", "List files in a repository directory", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  path: z.string().optional().describe("Directory path (default: root)"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
}, async ({ repo, path, ref }) => {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (ref) params.set("ref", ref);
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files${query}`));
});

server.tool("gitant_search_code", "Search for text in repository code", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  query: z.string().min(1).describe("Search query"),
  ref: z.string().optional().describe("Git ref to search in"),
}, async ({ repo, query, ref }) => {
  let url = `/api/v1/repos/${encodeURIComponent(repo)}/search?q=${encodeURIComponent(query)}`;
  if (ref) url += `&ref=${encodeURIComponent(ref)}`;
  return daemonCall(() => daemon.get(url));
});

// Issue tools
server.tool("gitant_create_issue", "Create a new issue in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  labels: z.array(z.string()).optional().describe("Labels for the issue"),
}, async ({ repo, title, body, labels }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues`, {
    title,
    body: body || "",
    labels: labels || [],
  }));
});

server.tool("gitant_list_issues", "List issues in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "closed", "all"]).optional().describe("Filter by status"),
  labels: z.array(z.string()).optional().describe("Filter by labels"),
  ...paginationSchema,
}, async ({ repo, status, labels, offset, limit }) => {
  const query = buildListQuery({ status, labels, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues${query}`));
});

server.tool("gitant_close_issue", "Close an issue", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID (e.g. issue-1734567890123456789)"),
}, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/close`));
});

server.tool("gitant_get_issue", "Get details of a specific issue", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
}, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}`));
});

// Pull Request tools
server.tool("gitant_open_pr", "Open a new pull request", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("PR title"),
  body: z.string().optional().describe("PR description"),
  source_branch: z.string().min(1).describe("Source branch"),
  target_branch: z.string().min(1).describe("Target branch"),
}, async ({ repo, title, body, source_branch, target_branch }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs`, {
    title,
    body: body || "",
    source_branch,
    target_branch,
  }));
});

server.tool("gitant_list_prs", "List pull requests in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "closed", "merged", "all"]).optional().describe("Filter by status"),
  ...paginationSchema,
}, async ({ repo, status, offset, limit }) => {
  const query = buildListQuery({ status, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs${query}`));
});

server.tool("gitant_get_pr", "Get details of a specific pull request", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
}, async ({ repo, pr_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}`));
});

server.tool("gitant_review_pr", "Review a pull request", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
  verdict: z.enum(["approve", "request_changes", "comment"]).describe("Review verdict"),
  body: z.string().optional().describe("Review comment"),
}, async ({ repo, pr_id, verdict, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/review`, {
    verdict,
    body: body || "",
  }));
});

server.tool("gitant_merge_pr", "Merge a pull request", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional().describe("Merge strategy"),
}, async ({ repo, pr_id, merge_method }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/merge`, {
    merge_method: merge_method || "merge",
  }));
});

// Ref tools
server.tool("gitant_list_refs", "List all refs (branches, tags) in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/refs`));
});

server.tool("gitant_create_branch", "Create a new branch in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Branch name"),
  commit: z.string().min(1).describe("Commit hash to point to"),
}, async ({ repo, name, commit }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/branches`, { name, commit }));
});

// Commit tools
server.tool("gitant_get_commit_log", "Get commit history for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().optional().describe("Branch or tag name"),
  limit: z.number().int().positive().max(10000).optional().describe("Max number of commits to return"),
}, async ({ repo, ref, limit }) => {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  if (limit) params.set("limit", limit.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits${query}`));
});

server.tool("gitant_diff_commits", "Compare two commits and show changes", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  from: z.string().min(1).describe("From commit hash"),
  to: z.string().min(1).describe("To commit hash"),
}, async ({ repo, from, to }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
});

server.tool("gitant_get_commit_parents", "Get the parent commits of a specific commit", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  hash: z.string().min(1).describe("Commit hash"),
}, async ({ repo, hash }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits/${encodeURIComponent(hash)}/parents`));
});

// Agent tools
server.tool("gitant_delegate_capability", "Delegate a capability to another agent using UCAN", {
  did: z.string().min(1).describe("Audience DID"),
  resource: z.string().min(1).describe("Resource identifier"),
  actions: z.array(z.string()).describe("Allowed actions"),
}, async ({ did, resource, actions }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/delegate`, {
    audience: did,
    resource,
    actions,
  }));
});

server.tool("gitant_revoke_ucan", "Revoke a UCAN token by its nonce", {
  nonce: z.string().min(1).describe("UCAN nonce to revoke"),
}, async ({ nonce }) => {
  return daemonCall(() => daemon.post("/api/v1/ucan/revoke", { nonce }));
});

server.tool("gitant_verify_ucan", "Verify a UCAN token's validity and signature", {
  token: z.string().min(1).describe("UCAN token to verify"),
}, async ({ token }) => {
  return daemonCall(() => daemon.post("/api/v1/agents/verify", { token }));
});

server.tool("gitant_list_revocations", "List all revoked UCAN nonces", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/ucan/revocations"));
});

// Webhook tools
server.tool("gitant_list_webhooks", "List registered webhooks", paginationSchema, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/webhooks${paginationQuery(offset, limit)}`));
});

server.tool("gitant_register_webhook", "Register a new webhook", {
  url: z.string().min(1).url().describe("Webhook URL"),
  events: z.array(z.string()).min(1).describe("Event types to subscribe to"),
  secret: z.string().optional().describe("Webhook secret for signature verification"),
}, async ({ url, events, secret }) => {
  return daemonCall(() => daemon.post("/api/v1/webhooks", { url, events, secret }));
});

server.tool("gitant_delete_webhook", "Delete a webhook", {
  webhook_id: z.string().min(1).describe("Webhook ID to delete"),
}, async ({ webhook_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`));
});

// Agent tools (extended)
server.tool("gitant_list_agents", "List all known agents", paginationSchema, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents${paginationQuery(offset, limit)}`));
});

server.tool("gitant_get_agent", "Get details of a specific agent", {
  did: z.string().min(1).describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

server.tool("gitant_generate_did", "Generate a new DID identity", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/agents/generate-did"));
});

server.tool("gitant_resolve_did", "Resolve a DID to its document", {
  did: z.string().min(1).describe("DID to resolve"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/resolve/${encodeURIComponent(did)}`));
});

// Task tools
server.tool("gitant_list_tasks", "List tasks for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "claimed", "completed"]).optional().describe("Filter by status"),
  ...paginationSchema,
}, async ({ repo, status, offset, limit }) => {
  const query = buildListQuery({ status, offset, limit });
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/tasks${query}`));
});

server.tool("gitant_create_task", "Create a new task for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Task title"),
  description: z.string().optional().describe("Task description"),
}, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks`, { title, description }));
});

server.tool("gitant_claim_task", "Claim a task", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
}, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/claim`));
});

server.tool("gitant_complete_task", "Complete a task", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
  result: z.string().optional().describe("Task result"),
}, async ({ repo, task_id, result }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/complete`, { result }));
});

// Release tools
server.tool("gitant_list_releases", "List releases for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/releases${paginationQuery(offset, limit)}`));
});

server.tool("gitant_get_release", "Get a specific release", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  release_id: z.string().min(1).describe("Release ID"),
}, async ({ repo, release_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/releases/${encodeURIComponent(release_id)}`));
});

server.tool("gitant_create_release", "Create a new release for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  tag: z.string().min(1).describe("Git tag for the release"),
  title: z.string().min(1).describe("Release title"),
  body: z.string().optional().describe("Release notes / body"),
}, async ({ repo, tag, title, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/releases`, { tag, title, body: body || "" }));
});

server.tool("gitant_delete_release", "Delete a release", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  release_id: z.string().min(1).describe("Release ID"),
}, async ({ repo, release_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/releases/${encodeURIComponent(release_id)}`));
});

// Label tools
server.tool("gitant_list_labels", "List labels for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/labels${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_label", "Create a label for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).max(64).describe("Label name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Label color (hex, e.g. #ff0000)"),
}, async ({ repo, name, color }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/labels`, { name, color }));
});

server.tool("gitant_delete_label", "Delete a label from a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Label name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/labels/${encodeURIComponent(name)}`));
});

// Star tools
server.tool("gitant_star_repo", "Star a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/star`));
});

server.tool("gitant_unstar_repo", "Unstar a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/unstar`));
});

server.tool("gitant_get_star_count", "Get the star count for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stars`));
});

// Branch protection tools
server.tool("gitant_get_branch_protection", "Get protection rules for a branch", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
}, async ({ repo, branch }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.tool("gitant_set_branch_protection", "Set protection rules for a branch", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
  require_pr: z.boolean().optional().describe("Require pull request before merging"),
  require_approval: z.boolean().optional().describe("Require approval before merging"),
  no_force_push: z.boolean().optional().describe("Disallow force pushes"),
}, async ({ repo, branch, require_pr, require_approval, no_force_push }) => {
  return daemonCall(() => daemon.put(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`, {
    require_pr: require_pr || false,
    require_approval: require_approval || false,
    no_force_push: no_force_push || false,
  }));
});

server.tool("gitant_remove_branch_protection", "Remove protection rules for a branch", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().min(1).describe("Branch name"),
}, async ({ repo, branch }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.tool("gitant_list_branch_protections", "List all branch protection rules for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections`));
});

// Activity tools
server.tool("gitant_get_activity", "Get unified activity feed across all repos", {
  ...paginationSchema,
}, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/activity${paginationQuery(offset, limit)}`));
});

// Comment tools
server.tool("gitant_add_issue_comment", "Add a comment to an issue", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
  body: z.string().min(1).max(65536).describe("Comment body"),
}, async ({ repo, issue_id, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/comment`, { body }));
});

server.tool("gitant_list_issue_comments", "List comments on an issue", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
}, async ({ repo, issue_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${encodeURIComponent(issue_id)}/comments`));
});

server.tool("gitant_list_pr_comments", "List comments on a pull request", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pr_id: z.string().min(1).describe("Pull request ID"),
}, async ({ repo, pr_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${encodeURIComponent(pr_id)}/comments`));
});

// Deployment tools
server.tool("gitant_list_deployments", "List deployments for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  environment: z.string().optional().describe("Filter by environment"),
  ...paginationSchema,
}, async ({ repo, environment, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/deployments${buildListQuery({ offset, limit, environment })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_create_deployment", "Create a deployment", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  environment: z.string().min(1).describe("Environment name"),
  ref: z.string().min(1).describe("Git ref (branch/tag/SHA)"),
}, async ({ repo, environment, ref }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments`, { environment, ref }));
});

server.tool("gitant_get_deployment", "Get deployment status", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  deployment_id: z.string().min(1).describe("Deployment ID"),
}, async ({ repo, deployment_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}`));
});

server.tool("gitant_rollback_deployment", "Rollback a deployment", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  deployment_id: z.string().min(1).describe("Deployment ID"),
}, async ({ repo, deployment_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}/rollback`));
});

// Environment tools
server.tool("gitant_list_environments", "List environments for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/environments${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_environment", "Create an environment", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Environment name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/environments`, { name }));
});

server.tool("gitant_delete_environment", "Delete an environment", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Environment name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/environments/${encodeURIComponent(name)}`));
});

// CI/CD Runner tools
server.tool("gitant_list_runners", "List CI/CD runners", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/runners${paginationQuery(offset, limit)}`));
});

server.tool("gitant_register_runner", "Register a CI/CD runner", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Runner name"),
  tags: z.array(z.string()).optional().describe("Runner tags"),
}, async ({ repo, name, tags }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/runners`, { name, tags: tags || [] }));
});

server.tool("gitant_delete_runner", "Delete a CI/CD runner", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  runner_id: z.string().min(1).describe("Runner ID"),
}, async ({ repo, runner_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/runners/${encodeURIComponent(runner_id)}`));
});

// CI/CD Variable tools
server.tool("gitant_list_variables", "List CI/CD variables", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/variables`));
});

server.tool("gitant_set_variable", "Set a CI/CD variable", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  key: z.string().min(1).describe("Variable key"),
  value: z.string().min(1).describe("Variable value"),
  protected: z.boolean().optional().describe("Whether variable is protected"),
}, async ({ repo, key, value, protected: isProtected }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/variables`, { key, value, protected: isProtected || false }));
});

server.tool("gitant_delete_variable", "Delete a CI/CD variable", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  key: z.string().min(1).describe("Variable key"),
}, async ({ repo, key }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/variables/${encodeURIComponent(key)}`));
});

// CI/CD Pipeline tools
server.tool("gitant_list_pipelines", "List CI/CD pipelines", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["pending", "running", "success", "failed", "cancelled"]).optional().describe("Filter by status"),
  ...paginationSchema,
}, async ({ repo, status, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/pipelines${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_get_pipeline", "Get pipeline details", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  pipeline_id: z.string().min(1).describe("Pipeline ID"),
}, async ({ repo, pipeline_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines/${encodeURIComponent(pipeline_id)}`));
});

server.tool("gitant_trigger_pipeline", "Trigger a CI/CD pipeline", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().min(1).describe("Git ref to run pipeline on"),
}, async ({ repo, ref }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines`, { ref }));
});

// Notification tools
server.tool("gitant_list_notifications", "List notifications", {
  unread: z.boolean().optional().describe("Only unread notifications"),
  ...paginationSchema,
}, async ({ unread, offset, limit }) => {
  const url = `/api/v1/notifications${buildListQuery({ offset, limit, unread: unread ? "true" : undefined })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_mark_notification_read", "Mark a notification as read", {
  notification_id: z.string().min(1).describe("Notification ID"),
}, async ({ notification_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/notifications/${encodeURIComponent(notification_id)}/read`));
});

server.tool("gitant_mark_all_notifications_read", "Mark all notifications as read", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/notifications/read-all"));
});

// Snippet tools
server.tool("gitant_list_snippets", "List code snippets", {
  ...paginationSchema,
}, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/snippets${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_snippet", "Create a code snippet", {
  title: z.string().min(1).describe("Snippet title"),
  content: z.string().min(1).describe("Snippet content"),
  language: z.string().optional().describe("Programming language"),
  public: z.boolean().optional().describe("Whether snippet is public"),
}, async ({ title, content, language, public: isPublic }) => {
  return daemonCall(() => daemon.post("/api/v1/snippets", { title, content, language, public: isPublic || false }));
});

server.tool("gitant_get_snippet", "Get a code snippet", {
  snippet_id: z.string().min(1).describe("Snippet ID"),
}, async ({ snippet_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/snippets/${encodeURIComponent(snippet_id)}`));
});

server.tool("gitant_delete_snippet", "Delete a code snippet", {
  snippet_id: z.string().min(1).describe("Snippet ID"),
}, async ({ snippet_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/snippets/${encodeURIComponent(snippet_id)}`));
});

// Milestone tools
server.tool("gitant_list_milestones", "List milestones for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  state: z.enum(["open", "closed", "all"]).optional().describe("Filter by state"),
  ...paginationSchema,
}, async ({ repo, state, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/milestones${buildListQuery({ offset, limit, state })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_create_milestone", "Create a milestone", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Milestone title"),
  description: z.string().optional().describe("Milestone description"),
  due_date: z.string().optional().describe("Due date (ISO 8601)"),
}, async ({ repo, title, description, due_date }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/milestones`, { title, description, due_date }));
});

server.tool("gitant_get_milestone", "Get a milestone", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  milestone_id: z.string().min(1).describe("Milestone ID"),
}, async ({ repo, milestone_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/milestones/${encodeURIComponent(milestone_id)}`));
});

// Epic tools
server.tool("gitant_list_epics", "List epics for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/epics${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_epic", "Create an epic", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Epic title"),
  description: z.string().optional().describe("Epic description"),
}, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/epics`, { title, description }));
});

server.tool("gitant_get_epic", "Get an epic", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  epic_id: z.string().min(1).describe("Epic ID"),
}, async ({ repo, epic_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/epics/${encodeURIComponent(epic_id)}`));
});

// Kanban tools
server.tool("gitant_list_kanban_boards", "List kanban boards", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/kanban`));
});

server.tool("gitant_get_kanban_board", "Get a kanban board", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  board_id: z.string().min(1).describe("Board ID"),
}, async ({ repo, board_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/kanban/${encodeURIComponent(board_id)}`));
});

// Bounty tools
server.tool("gitant_list_bounties", "List bounties for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  status: z.enum(["open", "claimed", "paid"]).optional().describe("Filter by status"),
  ...paginationSchema,
}, async ({ repo, status, offset, limit }) => {
  const url = `/api/v1/repos/${encodeURIComponent(repo)}/bounties${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_create_bounty", "Create a bounty", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().min(1).describe("Issue ID"),
  amount: z.number().positive().describe("Bounty amount"),
  token: z.string().optional().describe("Token symbol"),
}, async ({ repo, issue_id, amount, token }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties`, { issue_id, amount, token }));
});

server.tool("gitant_claim_bounty", "Claim a bounty", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
}, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/claim`));
});

// Todo tools
server.tool("gitant_list_todos", "List todo items", {
  status: z.enum(["open", "done", "all"]).optional().describe("Filter by status"),
  ...paginationSchema,
}, async ({ status, offset, limit }) => {
  const url = `/api/v1/todos${buildListQuery({ offset, limit, status })}`;
  return daemonCall(() => daemon.get(url));
});

server.tool("gitant_create_todo", "Create a todo item", {
  title: z.string().min(1).describe("Todo title"),
  body: z.string().optional().describe("Todo description"),
}, async ({ title, body }) => {
  return daemonCall(() => daemon.post("/api/v1/todos", { title, body }));
});

server.tool("gitant_complete_todo", "Mark a todo as complete", {
  todo_id: z.string().min(1).describe("Todo ID"),
}, async ({ todo_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/todos/${encodeURIComponent(todo_id)}/complete`));
});

// Changelog tool
server.tool("gitant_get_changelog", "Get unified activity changelog for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  limit: z.number().int().positive().max(100).optional().describe("Max events"),
}, async ({ repo, limit }) => {
  const query = limit ? `?limit=${limit}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/changelog${query}`));
});

// Cert tools
server.tool("gitant_list_certs", "List signed ref-update certificates", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs`));
});

server.tool("gitant_get_cert", "Get a specific certificate", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  cert_id: z.string().min(1).describe("Certificate ID"),
}, async ({ repo, cert_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs/${encodeURIComponent(cert_id)}`));
});

// IPFS tools
server.tool("gitant_list_ipfs_pins", "List all CIDs pinned to the node", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/ipfs/pins"));
});

server.tool("gitant_get_ipfs_object", "Retrieve a git object by CIDv1", {
  cid: z.string().min(1).describe("CIDv1 hash"),
}, async ({ cid }) => {
  return daemonCall(() => daemon.get(`/api/v1/ipfs/${encodeURIComponent(cid)}`));
});

// Sync tools
server.tool("gitant_trigger_sync", "Trigger sync from all known peers", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/sync/trigger"));
});

server.tool("gitant_get_sync_status", "Get sync queue status", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/sync/status"));
});

// Name tools
server.tool("gitant_register_name", "Register a name on Base L2", {
  name: z.string().min(1).describe("Name to register"),
}, async ({ name }) => {
  return daemonCall(() => daemon.post("/api/v1/names/register", { name }));
});

server.tool("gitant_resolve_name", "Resolve a name to owner address and DID", {
  name: z.string().min(1).describe("Name to resolve"),
}, async ({ name }) => {
  return daemonCall(() => daemon.get(`/api/v1/names/${encodeURIComponent(name)}/resolve`));
});

server.tool("gitant_lookup_name", "Reverse lookup DID to registered name", {
  did: z.string().min(1).describe("DID to lookup"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/names/lookup?did=${encodeURIComponent(did)}`));
});

// Whoami tool
server.tool("gitant_whoami", "Get current identity (DID) and node info", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/identity"));
});

// Mirror tools
server.tool("gitant_mirror_repo", "Mirror a repo from GitHub/GitLab", {
  source_url: z.string().min(1).url().describe("Source repository URL"),
  name: z.string().optional().describe("Local repo name"),
}, async ({ source_url, name }) => {
  return daemonCall(() => daemon.post("/api/v1/mirrors", { source_url, name }));
});

server.tool("gitant_list_mirrors", "List mirrored repositories", {
  ...paginationSchema,
}, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/mirrors${paginationQuery(offset, limit)}`));
});

// Seed node tools
server.tool("gitant_list_seeds", "List seed nodes", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/network/seeds"));
});

server.tool("gitant_add_seed", "Add a seed node", {
  multiaddr: z.string().min(1).describe("Multiaddr of the seed node"),
}, async ({ multiaddr }) => {
  return daemonCall(() => daemon.post("/api/v1/network/seeds", { multiaddr }));
});

server.tool("gitant_remove_seed", "Remove a seed node", {
  multiaddr: z.string().min(1).describe("Multiaddr of the seed node"),
}, async ({ multiaddr }) => {
  return daemonCall(() => daemon.delete(`/api/v1/network/seeds/${encodeURIComponent(multiaddr)}`));
});

// Workspace tools
server.tool("gitant_list_workspaces", "List workspaces", {
  ...paginationSchema,
}, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/workspaces${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_workspace", "Create a workspace", {
  name: z.string().min(1).describe("Workspace name"),
  description: z.string().optional().describe("Workspace description"),
}, async ({ name, description }) => {
  return daemonCall(() => daemon.post("/api/v1/workspaces", { name, description }));
});

// Forum tools
server.tool("gitant_list_forum_threads", "List forum threads", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/forum${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_forum_thread", "Create a forum thread", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Thread title"),
  body: z.string().min(1).describe("Thread body"),
}, async ({ repo, title, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/forum`, { title, body }));
});

// Chat tools
server.tool("gitant_list_chat_messages", "List chat messages", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/chat${paginationQuery(offset, limit)}`));
});

server.tool("gitant_send_chat_message", "Send a chat message", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  message: z.string().min(1).describe("Message content"),
}, async ({ repo, message }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/chat`, { message }));
});

// Governance tools
server.tool("gitant_list_governance_proposals", "List governance proposals", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/governance${paginationQuery(offset, limit)}`));
});

server.tool("gitant_create_governance_proposal", "Create a governance proposal", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().min(1).describe("Proposal title"),
  description: z.string().min(1).describe("Proposal description"),
  type: z.string().min(1).describe("Proposal type"),
}, async ({ repo, title, description, type: proposalType }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/governance`, { title, description, type: proposalType }));
});

server.tool("gitant_vote_on_proposal", "Vote on a governance proposal", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  proposal_id: z.string().min(1).describe("Proposal ID"),
  vote: z.enum(["yes", "no", "abstain"]).describe("Vote"),
}, async ({ repo, proposal_id, vote }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/governance/${encodeURIComponent(proposal_id)}/vote`, { vote }));
});

// Stacked diff tools
server.tool("gitant_list_stacks", "List stacked diffs", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stacks`));
});

server.tool("gitant_get_stack", "Get a stacked diff", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  stack_id: z.string().min(1).describe("Stack ID"),
}, async ({ repo, stack_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/stacks/${encodeURIComponent(stack_id)}`));
});

// Time tracking tools
server.tool("gitant_list_time_entries", "List time tracking entries", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ...paginationSchema,
}, async ({ repo, offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/time${paginationQuery(offset, limit)}`));
});

server.tool("gitant_start_timer", "Start a time tracking timer", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  issue_id: z.string().optional().describe("Issue ID to track time against"),
  description: z.string().optional().describe("Time entry description"),
}, async ({ repo, issue_id, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/time/start`, { issue_id, description }));
});

server.tool("gitant_stop_timer", "Stop the current timer", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/time/stop`));
});

// Identity tools
server.tool("gitant_identity_new", "Generate a new Ed25519 keypair and DID", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/identity/generate"));
});

server.tool("gitant_identity_export", "Export DID document as JSON", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/identity/export"));
});

server.tool("gitant_identity_sign", "Sign a message with Ed25519 private key", {
  message: z.string().min(1).describe("Message to sign"),
}, async ({ message }) => {
  return daemonCall(() => daemon.post("/api/v1/identity/sign", { message }));
});

// Peer tools
server.tool("gitant_peer_add", "Add a peer by multiaddr", {
  multiaddr: z.string().min(1).describe("Peer multiaddr"),
}, async ({ multiaddr }) => {
  return daemonCall(() => daemon.post("/api/v1/network/peers", { multiaddr }));
});

// Bounty tools (extended)
server.tool("gitant_approve_bounty", "Approve bounty submission and release payment", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
}, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/approve`));
});

server.tool("gitant_cancel_bounty", "Cancel bounty and refund escrow", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  bounty_id: z.string().min(1).describe("Bounty ID"),
}, async ({ repo, bounty_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/${encodeURIComponent(bounty_id)}/cancel`));
});

server.tool("gitant_bounty_stats", "Show bounty statistics for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/bounties/stats`));
});

// Task tools (extended)
server.tool("gitant_fail_task", "Mark a task as failed", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().min(1).describe("Task ID"),
}, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/fail`));
});

// Cert tools (extended)
server.tool("gitant_verify_cert", "Verify a ref-update certificate's signature", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  cert_id: z.string().min(1).describe("Certificate ID"),
}, async ({ repo, cert_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs/${encodeURIComponent(cert_id)}/verify`));
});

// Identity (extended)
server.tool("gitant_identity_resolve", "Resolve any DID method to its document", {
  did: z.string().min(1).describe("DID to resolve"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/identity/resolve/${encodeURIComponent(did)}`));
});

server.tool("gitant_identity_register_did", "Anchor DID document on-chain (did:gitlawb)", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/identity/register-did"));
});

// Cert (extended)
server.tool("gitant_set_cert_threshold", "Set required signature threshold for ref updates", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  threshold: z.number().int().positive().describe("Required signatures"),
}, async ({ repo, threshold }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/threshold`, { threshold }));
});

server.tool("gitant_sign_cert", "Sign a ref-update certificate", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  ref: z.string().min(1).describe("Ref name"),
  old_oid: z.string().min(1).describe("Previous commit hash"),
  new_oid: z.string().min(1).describe("New commit hash"),
}, async ({ repo, ref, old_oid, new_oid }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/sign`, { ref, old_oid, new_oid }));
});

// Secrets tools
server.tool("gitant_list_secrets", "List secret names (values never shown)", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`));
});

server.tool("gitant_set_secret", "Set a secret (encrypted, capability-bound)", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
  value: z.string().min(1).describe("Secret value"),
}, async ({ repo, name, value }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`, { name, value }));
});

server.tool("gitant_get_secret", "Get a secret value (requires secrets/read capability)", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
});

server.tool("gitant_delete_secret", "Delete a secret", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Secret name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
});

// Trust score tools
server.tool("gitant_trust_show", "Show trust score and VC for an agent", {
  did: z.string().min(1).describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}/trust`));
});

server.tool("gitant_trust_issue", "Issue a trust score VC for an agent", {
  did: z.string().min(1).describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/trust/issue`));
});

server.tool("gitant_trust_verify", "Verify a trust score VC", {
  vc: z.string().min(1).describe("VC JWT to verify"),
}, async ({ vc }) => {
  return daemonCall(() => daemon.post("/api/v1/trust/verify", { vc }));
});

// Maintainers tools
server.tool("gitant_list_maintainers", "List maintainers for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers`));
});

server.tool("gitant_add_maintainer", "Add a maintainer to a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  did: z.string().min(1).describe("Maintainer DID"),
}, async ({ repo, did }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers`, { did }));
});

server.tool("gitant_remove_maintainer", "Remove a maintainer from a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  did: z.string().min(1).describe("Maintainer DID"),
}, async ({ repo, did }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/maintainers/${encodeURIComponent(did)}`));
});

// Repo tokenization
server.tool("gitant_tokenize_repo", "Deploy ERC-20 token tied to this repo", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  name: z.string().min(1).describe("Token name"),
  symbol: z.string().min(1).describe("Token symbol"),
}, async ({ repo, name, symbol }) => {
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
