import { describe, it, expect } from "vitest";
import { GitantClient } from "../src/client.js";

describe("GitantClient", () => {
  it("builds encoded repo paths", async () => {
    const client = new GitantClient({ baseUrl: "http://example.test" });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/v1/repos/my%20repo/issues");
      return new Response(JSON.stringify({ issues: [], total: 0 }), { status: 200 });
    }) as typeof fetch;

    await client.listIssues("my repo");
    globalThis.fetch = originalFetch;
  });
});
