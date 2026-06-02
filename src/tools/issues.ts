import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { daemon, daemonCall, paginationQuery, paginationSchema, buildListQuery } from "../shared.js";

export function registerIssueTools(server: McpServer) {
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

  // Task tools (extended)
  server.registerTool("gitant_fail_task", { description: "Mark a task as failed", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    task_id: z.string().min(1).describe("Task ID"),
  } }, async ({ repo, task_id }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/tasks/${encodeURIComponent(task_id)}/fail`));
  });
}
