# gitant-mcp

MCP (Model Context Protocol) server for [gitant](https://github.com/GrayCodeAI/gitant). Gives AI agents structured access to a gitant node via the daemon REST API.

## Quick Start

```bash
npm install
npm run build
```

Or after npm publish:

```bash
npx gitant-mcp
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `GITANT_DAEMON_URL` | `http://localhost:7777` | Daemon base URL |
| `GITANT_UCAN_TOKEN` | — | Bearer UCAN token (**required for write operations**) |

## MCP client config

```json
{
  "mcpServers": {
    "gitant": {
      "command": "npx",
      "args": ["gitant-mcp"],
      "env": {
        "GITANT_DAEMON_URL": "http://localhost:7777",
        "GITANT_UCAN_TOKEN": "your-delegated-ucan-token"
      }
    }
  }
}
```

Local dev without publish:

```json
{
  "mcpServers": {
    "gitant": {
      "command": "node",
      "args": ["/path/to/gitant-mcp/dist/index.js"],
      "env": {
        "GITANT_DAEMON_URL": "http://localhost:7777"
      }
    }
  }
}
```

## Tools (62)

### System
- `get_daemon_status` — Health + node status
- `get_network_status` — libp2p peers and listen addresses
- `discover_federation` — Federated node discovery (requires `--p2p`)
- `list_repos`, `get_repo`, `create_repo`, `delete_repo`, `fork_repository`
- `push_code` — Push git objects + ref updates
- `push_packfile` — Push base64-encoded packfile + ref updates
- `clone_repo`

List tools accept optional `offset` and `limit` pagination parameters.

### Files & search
- `get_file`, `list_files`, `search_code`

### Issues & PRs
- `create_issue`, `list_issues`, `get_issue`, `close_issue`
- `add_issue_comment`, `list_issue_comments`
- `open_pr`, `list_prs`, `get_pr`, `review_pr`, `merge_pr`
- `list_pr_comments`

Use **string IDs** for issues/PRs (e.g. `issue-1734567890123456789`, `pr-1734567890123456789`).

### Git refs & commits
- `list_refs`, `create_branch`, `get_commit_log`, `diff_commits`, `get_commit_parents`

### Agents & UCAN
- `generate_did`, `resolve_did`, `list_agents`, `get_agent`, `get_agent_profile`
- `delegate_capability`, `verify_ucan`, `revoke_ucan`, `list_revocations`

### Webhooks, tasks, releases, labels, stars, protection, activity
- Full CRUD/list tools for each domain (see `src/index.ts`)

## Publish

Tag a release to trigger npm publish:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

Requires `NPM_TOKEN` secret in GitHub Actions.

See [PLAN.md](../PLAN.md) in the monorepo root for the full product roadmap.
