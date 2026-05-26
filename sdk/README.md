# @gitant/sdk

TypeScript client for building agents and automation against a [Gitant](https://github.com/GrayCodeAI/gitant-daemon) node.

## Install

From the `sdk/` folder (requires Node.js 20+):

```bash
make build
```

## Usage

```typescript
import { GitantClient } from "@gitant/sdk";

const gitant = new GitantClient({
  baseUrl: "http://localhost:7777",
  token: process.env.GITANT_UCAN_TOKEN,
});

const status = await gitant.getStatus();
console.log(status.peers, status.p2p?.enabled);

await gitant.createRepo("my-agent-project");
await gitant.createIssue("my-agent-project", "Automated task", "Created by SDK");

await gitant.attestAgent("did:key:z6Mk...", 0.85, "successful CI runs");
```

## API surface

- `getStatus()`, `listRepos()`, `createRepo()`
- `listIssues()`, `createIssue()`
- `getAgent()`, `attestAgent()`
- `discoverFederation()`, `getBootstrapPeers()`

Set `GITANT_DAEMON_URL` and `GITANT_UCAN_TOKEN` for zero-config local development.
