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
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: error.message }) }],
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
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}`));
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
  return daemonCall(() => daemon.delete(`/api/v1/repos/${repo}`));
});

server.tool("push_code", "Push code changes to a repository", {
  repo: z.string().describe("Repository name"),
  ref_updates: z.array(z.object({
    name: z.string(),
    old_hash: z.string(),
    new_hash: z.string(),
  })).describe("Reference updates"),
}, async ({ repo, ref_updates }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/push`, { ref_updates }));
});

server.tool("pull_code", "Pull latest changes from a repository", {
  repo: z.string().describe("Repository name"),
  branch: z.string().optional().describe("Branch to pull"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/clone`));
});

server.tool("clone_repo", "Clone a repository to local", {
  repo: z.string().describe("Repository name or URL"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/clone`));
});

// File tools
server.tool("get_file", "Get file contents from a repository", {
  repo: z.string().describe("Repository name"),
  path: z.string().describe("File path"),
  ref: z.string().optional().describe("Git ref (branch/tag/commit)"),
}, async ({ repo, path, ref }) => {
  const query = ref ? `?ref=${ref}` : "";
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/files/${path}${query}`));
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
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/files${query}`));
});

server.tool("search_code", "Search for text in repository code", {
  repo: z.string().describe("Repository name"),
  query: z.string().describe("Search query"),
  ref: z.string().optional().describe("Git ref to search in"),
}, async ({ repo, query }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/search?q=${encodeURIComponent(query)}`));
});

// Issue tools
server.tool("create_issue", "Create a new issue in a repository", {
  repo: z.string().describe("Repository name"),
  title: z.string().describe("Issue title"),
  body: z.string().optional().describe("Issue body/description"),
  labels: z.array(z.string()).optional().describe("Labels for the issue"),
}, async ({ repo, title, body, labels }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/issues`, {
    title,
    body: body || "",
    labels: labels || [],
  }));
});

server.tool("list_issues", "List issues in a repository", {
  repo: z.string().describe("Repository name"),
  status: z.enum(["open", "closed", "all"]).optional().describe("Filter by status"),
  labels: z.array(z.string()).optional().describe("Filter by labels"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/issues`));
});

server.tool("close_issue", "Close an issue", {
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number to close"),
}, async ({ repo, issue_number }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/issues/${issue_number}/close`));
});

server.tool("get_issue", "Get details of a specific issue", {
  repo: z.string().describe("Repository name"),
  issue_number: z.number().describe("Issue number"),
}, async ({ repo, issue_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/issues/${issue_number}`));
});

// Pull Request tools
server.tool("open_pr", "Open a new pull request", {
  repo: z.string().describe("Repository name"),
  title: z.string().describe("PR title"),
  body: z.string().optional().describe("PR description"),
  source_branch: z.string().describe("Source branch"),
  target_branch: z.string().describe("Target branch"),
}, async ({ repo, title, body, source_branch, target_branch }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/prs`, {
    title,
    body: body || "",
    source_branch,
    target_branch,
  }));
});

server.tool("list_prs", "List pull requests in a repository", {
  repo: z.string().describe("Repository name"),
  status: z.enum(["open", "closed", "merged", "all"]).optional().describe("Filter by status"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/prs`));
});

server.tool("get_pr", "Get details of a specific pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
}, async ({ repo, pr_number }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/prs/${pr_number}`));
});

server.tool("review_pr", "Review a pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
  verdict: z.enum(["approve", "request_changes", "comment"]).describe("Review verdict"),
  body: z.string().optional().describe("Review comment"),
}, async ({ repo, pr_number, verdict, body }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/prs/${pr_number}/review`, {
    verdict,
    body: body || "",
  }));
});

server.tool("merge_pr", "Merge a pull request", {
  repo: z.string().describe("Repository name"),
  pr_number: z.number().describe("PR number"),
  merge_method: z.enum(["merge", "squash", "rebase"]).optional().describe("Merge strategy"),
}, async ({ repo, pr_number }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/prs/${pr_number}/merge`));
});

// Ref tools
server.tool("list_refs", "List all refs (branches, tags) in a repository", {
  repo: z.string().describe("Repository name"),
}, async ({ repo }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/refs`));
});

server.tool("create_branch", "Create a new branch in a repository", {
  repo: z.string().describe("Repository name"),
  name: z.string().describe("Branch name"),
  commit: z.string().describe("Commit hash to point to"),
}, async ({ repo, name, commit }) => {
  return daemonCall(() => daemon.post(`/api/v1/repos/${repo}/branches`, { name, commit }));
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
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/commits${query}`));
});

server.tool("diff_commits", "Compare two commits and show changes", {
  repo: z.string().describe("Repository name"),
  from: z.string().describe("From commit hash"),
  to: z.string().describe("To commit hash"),
}, async ({ repo, from, to }) => {
  return daemonCall(() => daemon.get(`/api/v1/repos/${repo}/diff?from=${from}&to=${to}`));
});

// Agent tools
server.tool("delegate_capability", "Delegate a capability to another agent using UCAN", {
  did: z.string().describe("Audience DID"),
  resource: z.string().describe("Resource identifier"),
  actions: z.array(z.string()).describe("Allowed actions"),
}, async ({ did, resource, actions }) => {
  return daemonCall(() => daemon.post(`/api/v1/agents/${did}/delegate`, {
    audience: did,
    resource,
    actions,
  }));
});

server.tool("revoke_capability", "Revoke a previously delegated capability", {
  capability_id: z.string().describe("Capability ID to revoke"),
}, async () => {
  return daemonCall(() => Promise.resolve({ success: true, message: "Revocation not yet implemented" }));
});

server.tool("get_agent_profile", "Get an agent's profile and capabilities", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${did}`));
});

server.tool("get_trust_score", "Get the trust score for an agent", {
  did: z.string().describe("Agent DID"),
}, async ({ did }) => {
  return daemonCall(() => daemon.get(`/api/v1/agents/${did}`));
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
