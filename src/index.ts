import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { daemon } from "./daemon-client.js";

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

// Repository tools
server.tool("list_repos", "List repositories on this node", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/repos"));
});

server.tool("get_repo", "Get repository metadata, refs, and latest commit", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.tool("create_repo", "Create a new repository", {
  name: z.string().describe("Repository name"),
  description: z.string().optional().describe("Repository description"),
  private: z.boolean().optional().describe("Whether the repo is private"),
}, async ({ name, description, private: isPrivate }) => {
  return daemonCall(() => daemon.post("/api/v1/repos", {
    name,
    description: description || "",
    private: isPrivate || false,
  }));
});

server.tool("delete_repo", "Delete a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}`));
});

server.tool("fork_repository", "Fork a repository", {
  repo: z.string().describe("Source repository name"),
  name: z.string().describe("Name for the forked repository"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/fork`, { name }));
});

server.tool("push_code", "Push code changes to a repository", {
  repo: z.string().describe("Repository name"),
  ref_updates: z.array(z.object({
    name: z.string(),
    old_hash: z.string(),
    new_hash: z.string(),
  })).describe("Reference updates"),
}, async ({ repo, ref_updates }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/push`, { ref_updates }));
});

server.tool("pull_code", "Pull latest changes from a repository", {
  repo: z.string().describe("Repository name"),
  branch: z.string().optional().describe("Branch to pull"),
}, async ({ repo, branch }) => {
  const query = branch ? `?branch=${encodeURIComponent(branch)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/clone${query}`));
});

server.tool("clone_repo", "Clone a repository to local", {
  repo: z.string().describe("Repository name or URL"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/clone`));
});

// File tools
server.tool("get_file", "Get file contents from a repository", {
  repo: z.string().describe("Repository name"),
  path: z.string().describe("File path"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
}, async ({ repo, path, ref }) => {
  const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files/${encodeURIComponent(path)}${query}`));
});

server.tool("list_files", "List files in a repository directory", {
  repo: z.string().describe("Repository name"),
  path: z.string().optional().describe("Directory path (default: root)"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
}, async ({ repo, path, ref }) => {
  const params = new URLSearchParams();
  if (path) params.set("path", path);
  if (ref) params.set("ref", ref);
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/files${query}`));
});

server.tool("search_code", "Search for text in repository code", {
  repo: z.string().describe("Repository name"),
  query: z.string().describe("Search query"),
  ref: z.string().optional().describe("Git ref to search in"),
}, async ({ repo, query, ref }) => {
  let url = `/api/v1/repos/${encodeURIComponent(repo)}/search?q=${encodeURIComponent(query)}`;
  if (ref) url += `&ref=${encodeURIComponent(ref)}`;
  return daemonCall(() => daemon.get(url));
});

// Issue tools
server.tool("create_issue", "Create a new issue in a repository", {
  repo: z.string().describe("Repository name"),
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

server.tool("list_issues", "List issues in a repository", {
  repo: z.string().describe("Repository name"),
  status: z.enum(["open", "closed", "all"]).optional().describe("Filter by status"),
  labels: z.array(z.string()).optional().describe("Filter by labels"),
}, async ({ repo, status, labels }) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (labels) params.set("labels", labels.join(","));
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues${query}`));
});

server.tool("close_issue", "Close an issue", {
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number to close"),
}, async ({ repo, issue_number }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${issue_number}/close`));
});

server.tool("get_issue", "Get details of a specific issue", {
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
}, async ({ repo, issue_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${issue_number}`));
});

// Pull Request tools
server.tool("open_pr", "Open a new pull request", {
  repo: z.string().describe("Repository name"),
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

server.tool("list_prs", "List pull requests in a repository", {
  repo: z.string().describe("Repository name"),
  status: z.enum(["open", "closed", "merged", "all"]).optional().describe("Filter by status"),
}, async ({ repo, status }) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs${query}`));
});

server.tool("get_pr", "Get details of a specific pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
}, async ({ repo, pr_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${pr_number}`));
});

server.tool("review_pr", "Review a pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
  verdict: z.enum(["approve", "request_changes", "comment"]).describe("Review verdict"),
  body: z.string().optional().describe("Review comment"),
}, async ({ repo, pr_number, verdict, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${pr_number}/review`, {
    verdict,
    body: body || "",
  }));
});

server.tool("merge_pr", "Merge a pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional().describe("Merge strategy"),
}, async ({ repo, pr_number, merge_method }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${pr_number}/merge`, {
    merge_method: merge_method || "merge",
  }));
});

// Ref tools
server.tool("list_refs", "List all refs (branches, tags) in a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/refs`));
});

server.tool("create_branch", "Create a new branch in a repository", {
  repo: z.string().describe("Repository name"),
  name: z.string().describe("Branch name"),
  commit: z.string().describe("Commit hash to point to"),
}, async ({ repo, name, commit }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/branches`, { name, commit }));
});

// Commit tools
server.tool("get_commit_log", "Get commit history for a repository", {
  repo: z.string().describe("Repository name"),
  ref: z.string().optional().describe("Branch or tag name"),
  limit: z.number().optional().describe("Max number of commits to return"),
}, async ({ repo, ref, limit }) => {
  const params = new URLSearchParams();
  if (ref) params.set("ref", ref);
  if (limit) params.set("limit", limit.toString());
  const query = params.toString() ? `?${params.toString()}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/commits${query}`));
});

server.tool("diff_commits", "Compare two commits and show changes", {
  repo: z.string().describe("Repository name"),
  from: z.string().describe("From commit hash"),
  to: z.string().describe("To commit hash"),
}, async ({ repo, from, to }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`));
});

// Agent tools
server.tool("delegate_capability", "Delegate a capability to another agent using UCAN", {
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

server.tool("revoke_ucan", "Revoke a UCAN token by its nonce", {
  nonce: z.string().describe("UCAN nonce to revoke"),
}, async ({ nonce }) => {
  return daemonCall(() => daemon.post("/api/v1/ucan/revoke", { nonce }));
});

server.tool("list_revocations", "List all revoked UCAN nonces", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/ucan/revocations"));
});

server.tool("get_agent_profile", "Get an agent's profile and capabilities", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

server.tool("get_trust_score", "Get the trust score for an agent", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

// Webhook tools
server.tool("list_webhooks", "List registered webhooks", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/webhooks"));
});

server.tool("register_webhook", "Register a new webhook", {
  url: z.string().url().describe("Webhook URL"),
  events: z.array(z.string()).min(1).describe("Event types to subscribe to"),
  secret: z.string().optional().describe("Webhook secret for signature verification"),
}, async ({ url, events, secret }) => {
  return daemonCall(() => daemon.post("/api/v1/webhooks", { url, events, secret }));
});

server.tool("delete_webhook", "Delete a webhook", {
  webhook_id: z.string().describe("Webhook ID to delete"),
}, async ({ webhook_id }) => {
  return daemonCall(() => daemon.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`));
});

// Agent tools (extended)
server.tool("list_agents", "List all known agents", {}, async () => {
  return daemonCall(() => daemon.get("/api/v1/agents"));
});

server.tool("get_agent", "Get details of a specific agent", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
});

server.tool("generate_did", "Generate a new DID identity", {}, async () => {
  return daemonCall(() => daemon.post("/api/v1/agents/generate-did"));
});

server.tool("resolve_did", "Resolve a DID to its document", {
  did: z.string().describe("DID to resolve"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/resolve/${encodeURIComponent(did)}`));
});

// Task tools
server.tool("list_tasks", "List tasks for a repository", {
  repo: z.string().describe("Repository name"),
  status: z.string().optional().describe("Filter by status: open, claimed, completed"),
}, async ({ repo, status }) => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/tasks${query}`));
});

server.tool("create_task", "Create a new task for a repository", {
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Task title"),
  description: z.string().optional().describe("Task description"),
}, async ({ repo, title, description }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks`, { title, description }));
});

server.tool("claim_task", "Claim a task", {
  repo: z.string().describe("Repository name"),
  task_id: z.string().describe("Task ID"),
}, async ({ repo, task_id }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/claim`));
});

server.tool("complete_task", "Complete a task", {
  repo: z.string().describe("Repository name"),
  task_id: z.string().describe("Task ID"),
  result: z.string().optional().describe("Task result"),
}, async ({ repo, task_id, result }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/complete`, { result }));
});

// Label tools
server.tool("list_labels", "List labels for a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/labels`));
});

server.tool("create_label", "Create a label for a repository", {
  repo: z.string().describe("Repository name"),
  name: z.string().describe("Label name"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Label color (hex, e.g. #ff0000)"),
}, async ({ repo, name, color }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/labels`, { name, color }));
});

server.tool("delete_label", "Delete a label from a repository", {
  repo: z.string().describe("Repository name"),
  name: z.string().describe("Label name"),
}, async ({ repo, name }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/labels/${encodeURIComponent(name)}`));
});

// Star tools
server.tool("star_repo", "Star a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/star`));
});

server.tool("unstar_repo", "Unstar a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/unstar`));
});

// Branch protection tools
server.tool("get_branch_protection", "Get protection rules for a branch", {
  repo: z.string().describe("Repository name"),
  branch: z.string().describe("Branch name"),
}, async ({ repo, branch }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.tool("set_branch_protection", "Set protection rules for a branch", {
  repo: z.string().describe("Repository name"),
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

server.tool("remove_branch_protection", "Remove protection rules for a branch", {
  repo: z.string().describe("Repository name"),
  branch: z.string().describe("Branch name"),
}, async ({ repo, branch }) => {
  return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/protections/${encodeURIComponent(branch)}`));
});

server.tool("list_branch_protections", "List all branch protection rules for a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/protections`));
});

// Activity tools
server.tool("get_activity", "Get unified activity feed across all repos", {
  limit: z.number().optional().describe("Max number of events to return"),
}, async ({ limit }) => {
  const query = limit ? `?limit=${limit}` : "";
  return daemonCall(() => daemon.get(`/api/v1/activity${query}`));
});

// Comment tools
server.tool("list_issue_comments", "List comments on an issue", {
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
}, async ({ repo, issue_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues/${issue_number}/comments`));
});

server.tool("list_pr_comments", "List comments on a pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
}, async ({ repo, pr_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/prs/${pr_number}/comments`));
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
