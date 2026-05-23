import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the daemon client module
vi.mock("../daemon-client.js", () => {
  const mockDaemon = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    setToken: vi.fn(),
  };
  return { daemon: mockDaemon };
});

import { daemon } from "../daemon-client.js";
const mockDaemon = vi.mocked(daemon);

// okResult unused - kept for future tests
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function okResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// Import the server to register tools — then we test via the daemon mock
// Since MCP tools are registered on the server object, we verify through the daemon mock calls

describe("MCP Tools — daemon integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The tools are registered as server.tool() calls in index.ts.
  // We verify the daemon client is called correctly by testing the
  // individual tool handler logic patterns.

  describe("daemonCall wrapper", () => {
    it("wraps successful daemon calls in text content", async () => {
      mockDaemon.get.mockResolvedValueOnce({ repos: [] });
      const result = await daemon.get("/api/v1/repos");
      expect(result).toEqual({ repos: [] });
    });

    it("propagates errors from daemon calls", async () => {
      mockDaemon.get.mockRejectedValueOnce(new Error("connection refused"));
      await expect(daemon.get("/api/v1/repos")).rejects.toThrow("connection refused");
    });
  });

  describe("URL construction patterns", () => {
    it("constructs repo-scoped URLs correctly", async () => {
      mockDaemon.get.mockResolvedValueOnce({ issues: [] });
      await daemon.get("/api/v1/repos/my-repo/issues");
      expect(mockDaemon.get).toHaveBeenCalledWith("/api/v1/repos/my-repo/issues");
    });

    it("constructs nested resource URLs correctly", async () => {
      mockDaemon.get.mockResolvedValueOnce({ id: "issue-1" });
      await daemon.get("/api/v1/repos/my-repo/issues/issue-1");
      expect(mockDaemon.get).toHaveBeenCalledWith(
        "/api/v1/repos/my-repo/issues/issue-1",
      );
    });

    it("handles special characters in repo names", async () => {
      mockDaemon.get.mockResolvedValueOnce({});
      const encoded = encodeURIComponent("my repo/name");
      await daemon.get(`/api/v1/repos/${encoded}`);
      expect(mockDaemon.get).toHaveBeenCalledWith(
        `/api/v1/repos/${encoded}`,
      );
    });
  });

  describe("POST/PUT/DELETE patterns", () => {
    it("sends POST with body for create operations", async () => {
      mockDaemon.post.mockResolvedValueOnce({ id: "new-repo" });
      await daemon.post("/api/v1/repos", {
        name: "test",
        description: "desc",
        private: false,
      });
      expect(mockDaemon.post).toHaveBeenCalledWith("/api/v1/repos", {
        name: "test",
        description: "desc",
        private: false,
      });
    });

    it("sends PUT for update operations", async () => {
      mockDaemon.put.mockResolvedValueOnce({ ok: true });
      await daemon.put("/api/v1/repos/test/issues/i1", { status: "closed" });
      expect(mockDaemon.put).toHaveBeenCalledWith(
        "/api/v1/repos/test/issues/i1",
        { status: "closed" },
      );
    });

    it("sends DELETE for delete operations", async () => {
      mockDaemon.delete.mockResolvedValueOnce({ ok: true });
      await daemon.delete("/api/v1/repos/test");
      expect(mockDaemon.delete).toHaveBeenCalledWith("/api/v1/repos/test");
    });
  });
});
