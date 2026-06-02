import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { daemon, daemonCall, paginationQuery, paginationSchema, buildListQuery } from "../shared.js";

export function registerAgentTools(server: McpServer) {
  // Agent tools
  server.registerTool("gitant_list_agents", { description: "List known agents (with DID documents and trust scores)", inputSchema: paginationSchema }, async ({ offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/agents${paginationQuery(offset, limit)}`));
  });

  server.registerTool("gitant_get_agent", { description: "Get details for an agent DID", inputSchema: {
    did: z.string().min(1).describe("Target DID"),
  } }, async ({ did }) => {
    return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}`));
  });

  server.registerTool("gitant_delegate_capability", { description: "Delegate capabilities (e.g. repo push) to an agent DID via UCAN", inputSchema: {
    did: z.string().min(1).describe("Target agent DID to delegate to"),
    resource: z.string().min(1).describe("Resource URI (e.g. repo:my-repo)"),
    actions: z.array(z.string()).min(1).describe("Allowed actions (e.g. ['push'])"),
  } }, async ({ did, resource, actions }) => {
    return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/delegate`, {
      audience: did,
      resource,
      actions,
    }));
  });

  server.registerTool("gitant_verify_ucan", { description: "Verify a UCAN token's signature, capabilities, and validity path", inputSchema: {
    token: z.string().min(1).describe("UCAN token string"),
  } }, async ({ token }) => {
    return daemonCall(() => daemon.post("/api/v1/agents/verify-ucan", { token }));
  });

  // Agent tools (extended)
  server.registerTool("gitant_generate_did", { description: "Generate a new local DID document", inputSchema: {} }, async () => {
    return daemonCall(() => daemon.post("/api/v1/agents/generate-did"));
  });

  server.registerTool("gitant_resolve_did", { description: "Resolve local agent DID document", inputSchema: {
    did: z.string().min(1).describe("DID to resolve"),
  } }, async ({ did }) => {
    return daemonCall(() => daemon.get(`/api/v1/agents/resolve/${encodeURIComponent(did)}`));
  });

  server.registerTool("gitant_get_did_trust", { description: "Get the local trust score for a DID", inputSchema: {
    did: z.string().min(1).describe("DID to query"),
  } }, async ({ did }) => {
    return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}/trust`));
  });

  server.registerTool("gitant_set_did_trust", { description: "Manually override local trust score for a DID", inputSchema: {
    did: z.string().min(1).describe("DID to update"),
    score: z.number().min(0).max(1).describe("Trust score to set (0 to 1)"),
  } }, async ({ did, score }) => {
    return daemonCall(() => daemon.post(`/api/v1/agents/${encodeURIComponent(did)}/trust`, { score }));
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

  // Activity tools
  server.registerTool("gitant_get_activity_feed", { description: "Get global activity feed", inputSchema: {
    ...paginationSchema,
  } }, async ({ offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/activity${paginationQuery(offset, limit)}`));
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

  // Identity (extended)
  server.registerTool("gitant_identity_resolve", { description: "Resolve any DID method to its document", inputSchema: {
    did: z.string().min(1).describe("DID to resolve"),
  } }, async ({ did }) => {
    return daemonCall(() => daemon.get(`/api/v1/identity/resolve/${encodeURIComponent(did)}`));
  });

  server.registerTool("gitant_identity_register_did", { description: "Anchor DID document on-chain (did:gitlawb)", inputSchema: {} }, async () => {
    return daemonCall(() => daemon.post("/api/v1/identity/register-did"));
  });

  // Trust score tools
  server.registerTool("gitant_trust_score", { description: "Get the trust score for a DID on this node", inputSchema: {
    did: z.string().min(1).describe("Agent DID"),
  } }, async ({ did }) => {
    return daemonCall(() => daemon.get(`/api/v1/agents/${encodeURIComponent(did)}/trust`));
  });

  server.registerTool("gitant_trust_issue_vc", { description: "Issue a signed trust credential for a DID", inputSchema: {
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
}
