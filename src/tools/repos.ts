import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { daemon, daemonCall, paginationQuery, paginationSchema } from "../shared.js";

export function registerRepoTools(server: McpServer) {
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
}
