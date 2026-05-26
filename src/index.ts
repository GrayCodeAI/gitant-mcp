#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { daemon } from "./daemon-client.js";
import { buildListQuery } from "./query.js";

const server = new McpServer({
  name: "gitant",
  version: "0.1.0",
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
  did: z.string().describe("Target agent DID"),
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
    hash: z.string().describe("Git object hash"),
    type: z.enum(["blob", "tree", "commit", "tag"]).describe("Git object type"),
    content: z.string().describe("Base64-encoded object content"),
  })).optional().describe("Git objects to store"),
  ref_updates: z.array(z.object({
    name: z.string().describe("Ref name (e.g. refs/heads/main)"),
    old_hash: z.string().optional().describe("Previous ref hash"),
    new_hash: z.string().describe("New ref hash"),
  })).describe("Reference updates"),
}, async ({ repo, objects, ref_updates }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/push`, {
    objects: objects ?? [],
    ref_updates,
  }));
});

server.tool("gitant_push_packfile", "Push a base64-encoded git packfile and ref updates", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  packfile: z.string().describe("Base64-encoded git packfile"),
  ref_updates: z.array(z.object({
    name: z.string().describe("Ref name (e.g. refs/heads/main)"),
    old_hash: z.string().optional().describe("Previous ref hash"),
    new_hash: z.string().describe("New ref hash"),
  })).describe("Reference updates"),
}, async ({ repo, packfile, ref_updates }) => {
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
  path: z.string().describe("File path"),
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
  query: z.string().describe("Search query"),
  ref: z.string().optional().describe("Git ref to search in"),
}, async ({ repo, query, ref }) => {
  let url = `/api/v1/repos/${encodeURIComponent(repo)}/search?q=${encodeURIComponent(query)}`;
  if (ref) url += `&ref=${encodeURIComponent(ref)}`;
  return daemonCall(() => daemon.get(url));
});

// Issue tools
server.tool("gitant_create_issue", "Create a new issue in a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  title: z.string().describe("Issue title"),
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
  title: z.string().describe("PR title"),
  body: z.string().optional().describe("PR description"),
  source_branch: z.string().describe("Source branch"),
  target_branch: z.string().describe("Target branch"),
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
  name: z.string().describe("Branch name"),
  commit: z.string().describe("Commit hash to point to"),
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
  from: z.string().describe("From commit hash"),
  to: z.string().describe("To commit hash"),
}, async ({ repo, from, to }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
});

server.tool("gitant_get_commit_parents", "Get the parent commits of a specific commit", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  hash: z.string().describe("Commit hash"),
}, async ({ repo, hash }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits/${encodeURIComponent(hash)}/parents`));
});

// Agent tools
server.tool("gitant_delegate_capability", "Delegate a capability to another agent using UCAN", {
  did: z.string().describe("Audience DID"),
  resource: z.string().describe("Resource identifier"),
  actions: z.array(z.string()).describe("Allowed actions"),
}, async ({ did, resource, actions }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/delegate`, {
    audience: did,
    resource,
    actions,
  }));
});

server.tool("gitant_revoke_ucan", "Revoke a UCAN token by its nonce", {
  nonce: z.string().describe("UCAN nonce to revoke"),
}, async ({ nonce }) => {
  return daemonCall(() => daemon.post("/api/v1/ucan/revoke", { nonce }));
});

server.tool("gitant_verify_ucan", "Verify a UCAN token's validity and signature", {
  token: z.string().describe("UCAN token to verify"),
}, async ({ token }) => {
  return daemonCall(() => daemon.post("/api/v1/agents/verify", { token }));
});

server.tool("gitant_list_revocations", "List all revoked UCAN nonces", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/ucan/revocations"));
});

server.tool("gitant_get_agent_profile", "Get an agent's profile, capabilities, and trust score", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

// Webhook tools
server.tool("gitant_list_webhooks", "List registered webhooks", paginationSchema, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/webhooks${paginationQuery(offset, limit)}`));
});

server.tool("gitant_register_webhook", "Register a new webhook", {
  url: z.string().url().describe("Webhook URL"),
  events: z.array(z.string()).min(1).describe("Event types to subscribe to"),
  secret: z.string().optional().describe("Webhook secret for signature verification"),
}, async ({ url, events, secret }) => {
  return daemonCall(() => daemon.post("/api/v1/webhooks", { url, events, secret }));
});

server.tool("gitant_delete_webhook", "Delete a webhook", {
  webhook_id: z.string().describe("Webhook ID to delete"),
}, async ({ webhook_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`));
});

// Agent tools (extended)
server.tool("gitant_list_agents", "List all known agents", paginationSchema, async ({ offset, limit }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents${paginationQuery(offset, limit)}`));
});

server.tool("gitant_get_agent", "Get details of a specific agent", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

server.tool("gitant_generate_did", "Generate a new DID identity", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/agents/generate-did"));
});

server.tool("gitant_resolve_did", "Resolve a DID to its document", {
  did: z.string().describe("DID to resolve"),
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
  title: z.string().describe("Task title"),
  description: z.string().optional().describe("Task description"),
}, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks`, { title, description }));
});

server.tool("gitant_claim_task", "Claim a task", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().describe("Task ID"),
}, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/claim`));
});

server.tool("gitant_complete_task", "Complete a task", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  task_id: z.string().describe("Task ID"),
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
  release_id: z.string().describe("Release ID"),
}, async ({ repo, release_id }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/releases/${encodeURIComponent(release_id)}`));
});

server.tool("gitant_create_release", "Create a new release for a repository", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  tag: z.string().describe("Git tag for the release"),
  title: z.string().describe("Release title"),
  body: z.string().optional().describe("Release notes / body"),
}, async ({ repo, tag, title, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/releases`, { tag, title, body: body || "" }));
});

server.tool("gitant_delete_release", "Delete a release", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  release_id: z.string().describe("Release ID"),
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
  name: z.string().describe("Label name"),
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
  branch: z.string().describe("Branch name"),
}, async ({ repo, branch }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.tool("gitant_set_branch_protection", "Set protection rules for a branch", {
  repo: z.string().min(1).max(64).describe("Repository name"),
  branch: z.string().describe("Branch name"),
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
  branch: z.string().describe("Branch name"),
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

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("gitant MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
