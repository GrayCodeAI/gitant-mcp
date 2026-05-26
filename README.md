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

## Tools (64)

### System
- `get_daemon_status` — Health + node status
- `get_network_status` — libp2p peers and listen addresses
- `discover_federation` — Federated node discovery (requires `--p2p`)
- `get_bootstrap_peers` — List federation bootstrap multiaddrs
- `attest_agent` — Cross-peer agent trust attestation
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

## Releases

Push a version tag — GitHub Actions builds and attaches a tarball:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

See [Release workflow](.github/workflows/release.yml).

See [PLAN.md](https://github.com/GrayCodeAI/gitant-daemon/blob/main/PLAN.md) in `gitant-daemon` for the full product roadmap.
