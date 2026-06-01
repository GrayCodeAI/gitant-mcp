# Changelog

All notable changes to `gitant-mcp` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Community tools wired to live daemon routes: discussions (`gitant_list_discussions`,
  `gitant_get_discussion`, `gitant_create_discussion`, `gitant_answer_discussion`,
  `gitant_accept_discussion_answer`, `gitant_upvote_discussion`), projects/kanban
  (`gitant_list_projects`, `gitant_get_project`, `gitant_create_project`,
  `gitant_add_project_card`, `gitant_move_project_card`), and wiki
  (`gitant_list_wiki_pages`, `gitant_get_wiki_page`, `gitant_create_wiki_page`,
  `gitant_update_wiki_page`, `gitant_delete_wiki_page`).

### Removed
- Orphaned `gitant_*_kanban_board`, `gitant_*_forum_thread`, and
  `gitant_*_chat_message` tools that targeted endpoints the daemon never served.
  Forum threads are now covered by discussions; kanban boards by projects.

### Security
- encodeURIComponent() on all URL-interpolated parameters (154 tools) — prevents path injection
- 15s AbortController timeout on all daemon fetch calls
- GET retry with exponential backoff on 5xx/network errors (1 retry, 1s delay)
- Zod validation hardened: .url() on webhook URLs, .regex() on hex colors, .min(1) on required strings
- noUncheckedIndexedAccess enabled in tsconfig

### Fixed
- isError flag now set to true on daemon errors (was always undefined, misleading AI agents)
- All `any` type defaults removed from DaemonClient generics
- catch block uses `unknown` with proper instanceof Error narrowing

### Added
- Test suite with vitest (daemon-client tests, MCP tool integration tests)
- ESLint configuration with @typescript-eslint strict rules
- Test and lint scripts in package.json
- CI: type check, lint, test, build, dist sync verification

### Changed
- DaemonClient uses AbortController for request timeouts
- DaemonClient retries GET requests once on 5xx or network errors

## [0.1.0] - 2026-05-22

### Added
- Initial release with 154 MCP tools
- Repository CRUD, fork, clone, push, pull
- File browsing and code search
- Issue and PR management with comments
- Commit log and diff
- Agent/DID management with UCAN delegation
- Webhook registration and management
- Task board, labels, stars
- Branch protection rules
- Activity feed
