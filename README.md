<div align="center">

# ⭐ gitant-mcp

**MCP server for Gitant** — 160+ tools for AI agents to interact with Gitant nodes.

![License](https://img.shields.io/badge/license-MIT-blue)
[![Release](https://img.shields.io/github/v/release/GrayCodeAI/gitant-mcp)](https://github.com/GrayCodeAI/gitant-mcp/releases)
[![Node.js](https://img.shields.io/badge/node-20+-green)](https://nodejs.org/)
[![CI](https://github.com/GrayCodeAI/gitant-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/GrayCodeAI/gitant-mcp/actions)

**Model Context Protocol** — Give your AI agents superpowers with 160+ tools.

</div>

---

## 🌟 What is Gitant?

**Gitant** is a decentralized Git hosting platform for solo developers and AI agents.

| Component | Role |
|-----------|------|
| [`gitant-cli`](https://github.com/GrayCodeAI/gitant-cli) | **Developer CLI** — push/pull, issues, PRs, agents |
| [`gitant-daemon`](https://github.com/GrayCodeAI/gitant-daemon) | **Server** — HTTP API, git smart HTTP, optional P2P |
| [`gitant-web`](https://github.com/GrayCodeAI/gitant-web) | **Dashboard** — Browser UI (Next.js) |
| [`gitant-mcp`](https://github.com/GrayCodeAI/gitant-mcp) | **Agents** — MCP tools for AI integration |

---

## 🚀 Quick Start

### Install from GitHub

```bash
git clone https://github.com/GrayCodeAI/gitant-mcp.git
cd gitant-mcp
make build
make run
```

### Run from release tarball

```bash
# Download latest release
curl -LO https://github.com/GrayCodeAI/gitant-mcp/releases/latest/download/gitant-mcp.tar.gz
tar xzf gitant-mcp.tar.gz
node dist/index.js
```

---

## ⚙️ MCP Client Config

Point your MCP client at the built entrypoint:

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

---

## 📖 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GITANT_DAEMON_URL` | `http://localhost:7777` | Daemon base URL |
| `GITANT_UCAN_TOKEN` | — | Bearer UCAN token (**required for write ops**) |

---

## 🛠️ Tools (161)

All tools are prefixed with `gitant_`. Split into categories:

### 🔧 System (5)
- `get_daemon_status` — Health + node status
- `get_network_status` — libp2p peers and listen addresses
- `discover_federation` — Federated node discovery (requires `--p2p`)
- `get_bootstrap_peers` — List federation bootstrap multiaddrs
- `whoami` — Current authenticated identity

### 📦 Repos (8)
- `list_repos`, `get_repo`, `create_repo`, `delete_repo`, `fork_repository`
- `push_code` — Push git objects + ref updates
- `push_packfile` — Push base64 packfile + ref updates
- `clone_repo`

### 📄 Files & Search (3)
- `get_file`, `list_files`, `search_code`

### 🐛 Issues (6) + 🔀 Pull Requests (6)
- `create_issue`, `list_issues`, `get_issue`, `close_issue`
- `add_issue_comment`, `list_issue_comments`
- `open_pr`, `list_prs`, `get_pr`, `review_pr`, `merge_pr`
- `list_pr_comments`

> 💡 **Tip**: Use string IDs (e.g., `issue-1734567890123456789`, `pr-1734567890123456789`)

### 🔀 Git Refs & Commits (5)
- `list_refs`, `create_branch`, `get_commit_log`, `diff_commits`, `get_commit_parents`

### 🦾 Agents & Identity (12)
- `list_agents`, `get_agent`, `generate_did`, `resolve_did`
- `delegate_capability`, `verify_ucan`, `revoke_ucan`, `list_revocations`
- `attest_agent`, `identity_new`, `identity_export`, `identity_sign`

### 🤝 Trust & Maintainers (6)
- `trust_show`, `trust_issue`, `trust_verify`
- `list_maintainers`, `add_maintainer`, `remove_maintainer`

### 📋 Tasks (5)
- `list_tasks`, `create_task`, `claim_task`, `complete_task`, `fail_task`

### 🏷️ Labels & Releases (7)
- `list_labels`, `create_label`, `delete_label`
- `list_releases`, `get_release`, `create_release`, `delete_release`

### ⭐ Stars (3)
- `star_repo`, `unstar_repo`, `get_star_count`

### 🔒 Branch Protection (4)
- `get_branch_protection`, `set_branch_protection`, `delete_branch_protection`, `list_branch_protections`

### 📡 Webhooks (3)
- `list_webhooks`, `register_webhook`, `delete_webhook`

### 📊 Activity (2)
- `get_activity`, `get_changelog`

### 🔄 CI/CD (16)
- **Pipelines**: `list_pipelines`, `get_pipeline`, `create_pipeline`
- **Runners**: `list_runners`, `get_runner`, `create_runner`
- **Variables**: `list_variables`, `create_variable`, `update_variable`
- **Deployments**: `list_deployments`, `create_deployment`, `rollback_deployment`, `get_deployment_status`
- **Environments**: `list_environments`, `create_environment`, `delete_environment`

### 📢 Notifications (3)
- `list_notifications`, `mark_notification_read`, `mark_all_read`

### 📝 Code Snippets (4)
- `list_snippets`, `get_snippet`, `create_snippet`, `delete_snippet`

### 🎯 Milestones & Epics (6)
- `list_milestones`, `create_milestone`, `get_milestone`
- `list_epics`, `create_epic`, `get_epic`

### 💰 Bounties (6)
- `list_bounties`, `create_bounty`, `get_bounty`, `claim_bounty`, `complete_bounty`, `fund_bounty`

### ✅ Todos (3)
- `list_todos`, `create_todo`, `complete_todo`

### 🔐 Secrets & Certificates (9)
- **Secrets**: `list_secrets`, `create_secret`, `update_secret`, `delete_secret`
- **Certificates**: `list_certificates`, `create_certificate`, `revoke_certificate`, `get_certificate`, `verify_certificate`

### 🌐 IPFS & Sync (4)
- `ipfs_pin`, `ipfs_unpin`
- `sync_status`, `sync_start`

### 🔗 Federation (5)
- `list_mirrors`, `add_mirror`, `remove_mirror`
- `list_seed_nodes`, `add_seed_node`

### 💬 Community (19)
- **Discussions**: `list_discussions`, `get_discussion`, `create_discussion`, `answer_discussion`, `accept_discussion_answer`, `upvote_discussion`
- **Projects/Kanban**: `list_projects`, `get_project`, `create_project`, `add_project_card`, `move_project_card`
- **Wiki**: `list_wiki_pages`, `get_wiki_page`, `create_wiki_page`, `update_wiki_page`, `delete_wiki_page`
- **Governance**: `list_proposals`, `create_proposal`, `vote_proposal`

### 🧠 Advanced (6)
- **Stacked Diffs**: `create_stacked_diff`, `reorder_stacked_diff`
- **Time Tracking**: `start_timer`, `stop_timer`, `get_time_entries`
- **Peer Management**: `list_peers`
- **Repo Tokenization**: `tokenize_repo`

---

## 📋 License

**MIT** — see [LICENSE](LICENSE).

---

<div align="center">

### 🔗 Related Repos

[gitant-cli](https://github.com/GrayCodeAI/gitant-cli) •
[gitant-daemon](https://github.com/GrayCodeAI/gitant-daemon) •
[gitant-web](https://github.com/GrayCodeAI/gitant-web)

*Made with ❤️ for AI agents*

</div>
