import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { daemon, daemonCall, paginationSchema, buildListQuery } from "../shared.js";

export function registerPrTools(server: McpServer) {
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
}
