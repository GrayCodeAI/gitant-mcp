# gitant-mcp

MCP (Model Context Protocol) server for [gitant](https://github.com/GrayCodeAI/gitant-daemon). Gives AI agents structured access to a gitant node via the daemon REST API.

**Install and run from GitHub** — [releases](https://github.com/GrayCodeAI/gitant-mcp/releases) or clone + build.

**Full setup guide:** [gitant-daemon docs/QUICKSTART.md](https://github.com/GrayCodeAI/gitant-daemon/blob/main/docs/QUICKSTART.md)

## Install from GitHub

```bash
git clone https://github.com/GrayCodeAI/gitant-mcp.git
cd gitant-mcp
make build
make run
```

Requires **Node.js 20+**.

Or download a tagged [release tarball](https://github.com/GrayCodeAI/gitant-mcp/releases), extract, and run `node dist/index.js` (pre-built `dist/` is included in release artifacts).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `GITANT_DAEMON_URL` | `http://localhost:7777` | Daemon base URL |
| `GITANT_UCAN_TOKEN` | — | Bearer UCAN token (**required for write operations**) |

## MCP client config

Point your MCP client at the built entrypoint (adjust the path):

```json
{
  "mcpServers": {
    "gitant": {
      "command": "node",
      "args": ["/path/to/gitant-mcp/dist/index.js"],
      "env": {
        "GITANT_DAEMON_URL": "http://localhost:7777",
        "GITANT_UCAN_TOKEN": "your-delegated-ucan-token"
      }
    }
  }
}
```

## Tools (161)

All tool names are prefixed with `gitant_` when registered with the MCP server.

### System (5)
- `get_daemon_status` — Health + node status
- `get_network_status` — libp2p peers and listen addresses
- `discover_federation` — Federated node discovery (requires `--p2p`)
- `get_bootstrap_peers` — List federation bootstrap multiaddrs
- `whoami` — Current authenticated identity

### Repository CRUD (5) + Git Push/Clone (3)
- `list_repos`, `get_repo`, `create_repo`, `delete_repo`, `fork_repository`
- `push_code` — Push git objects + ref updates
- `push_packfile` — Push base64-encoded packfile + ref updates
- `clone_repo`

### Files & Search (3)
- `get_file`, `list_files`, `search_code`

### Issues (6) + Pull Requests (6)
- `create_issue`, `list_issues`, `get_issue`, `close_issue`
- `add_issue_comment`, `list_issue_comments`
- `open_pr`, `list_prs`, `get_pr`, `review_pr`, `merge_pr`
- `list_pr_comments`

Use **string IDs** for issues/PRs (e.g. `issue-1734567890123456789`, `pr-1734567890123456789`).

### Git Refs & Commits (5)
- `list_refs`, `create_branch`, `get_commit_log`, `diff_commits`, `get_commit_parents`

### Agents, DID & UCAN (12)
- `list_agents`, `get_agent`, `generate_did`, `resolve_did`
- `delegate_capability`, `verify_ucan`, `revoke_ucan`, `list_revocations`
- `attest_agent`, `identity_new`, `identity_export`, `identity_sign`

### Trust (3)
- `trust_show`, `trust_issue`, `trust_verify`

### Maintainers (3)
- `list_maintainers`, `add_maintainer`, `remove_maintainer`

### Tasks (5)
- `list_tasks`, `create_task`, `claim_task`, `complete_task`, `fail_task`

### Releases (4), Labels (3), Stars (3), Branch Protection (4)
- Full CRUD tools for each domain

### Webhooks (3), Activity/Changelog (2)
- `list_webhooks`, `register_webhook`, `delete_webhook`
- `get_activity`, `get_changelog`

### CI/CD: Pipelines (3), Runners (3), Variables (3), Deployments (4), Environments (3)
- Full lifecycle management for CI/CD infrastructure

### Notifications (3), Snippets (4), Milestones (3), Epics (3)
- CRUD tools for each domain

### Bounties (6), Todos (3), Secrets (4), Certificates (5)
- Full lifecycle management including escrow and signing

### IPFS (2), Sync (2), Names (3), Mirrors (2), Seed Nodes (3)
- Decentralized storage and networking tools

### Community: Kanban (2), Workspaces (2), Forum (2), Chat (2), Governance (3)
- Collaboration and community management tools

### Advanced: Stacked Diffs (2), Time Tracking (3), Peer Management (1), Repo Tokenization (1)
- Power-user and advanced workflow tools

List tools accept optional `offset` and `limit` pagination parameters.

## Releases

Push a version tag — GitHub Actions builds and attaches a tarball:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

See [Release workflow](.github/workflows/release.yml).

See [PLAN.md](https://github.com/GrayCodeAI/gitant-daemon/blob/main/PLAN.md) in `gitant-daemon` for the full product roadmap.
