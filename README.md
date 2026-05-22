# gitant-mcp

MCP (Model Context Protocol) server for gitant. Gives AI agents structured access to a gitant node.

## Quick Start

```bash
npm install
npm run build
```

## Usage

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "gitant": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "GITANT_DAEMON_URL": "http://localhost:7777"
      }
    }
  }
}
```

## Tools (24)

### Repos
- `list_repos` — List repositories
- `get_repo` — Get repo metadata
- `create_repo` — Create repository
- `delete_repo` — Delete repository
- `push_code` — Push ref updates
- `pull_code` — Pull latest changes
- `clone_repo` — Clone repository

### Files
- `get_file` — Get file contents
- `list_files` — List directory contents
- `search_code` — Search code

### Issues
- `create_issue` — Create issue
- `list_issues` — List issues (with status/label filters)
- `get_issue` — Get issue details
- `close_issue` — Close issue

### Pull Requests
- `open_pr` — Open PR
- `list_prs` — List PRs (with status filter)
- `get_pr` — Get PR details
- `review_pr` — Review PR
- `merge_pr` — Merge PR (with method selection)

### Refs & Commits
- `list_refs` — List refs
- `create_branch` — Create branch
- `get_commit_log` — Commit history
- `diff_commits` — Compare commits

### Agents
- `delegate_capability` — Delegate UCAN capability
- `revoke_capability` — Revoke capability (not yet implemented)
- `get_agent_profile` — Get agent profile
- `get_trust_score` — Get trust score

## License

MIT
