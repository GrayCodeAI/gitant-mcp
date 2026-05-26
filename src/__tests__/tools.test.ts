import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildListQuery } from "../query.js";

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

describe("MCP list tool query integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("list_issues forwards status, labels, and pagination to the daemon", async () => {
    mockDaemon.get.mockResolvedValueOnce({ issues: [], total: 0 });
    const repo = "demo";
    const query = buildListQuery({
      status: "open",
      labels: ["bug", "critical"],
      offset: 0,
      limit: 50,
    });

    await daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues${query}`);

    expect(mockDaemon.get).toHaveBeenCalledWith(
      "/api/v1/repos/demo/issues?status=open&labels=bug%2Ccritical&offset=0&limit=50",
    );
  });

  it("list_prs forwards merged status filter", async () => {
    mockDaemon.get.mockResolvedValueOnce({ prs: [], total: 0 });
    const query = buildListQuery({ status: "merged", limit: 10 });

    await daemon.get(`/api/v1/repos/demo/prs${query}`);

    expect(mockDaemon.get).toHaveBeenCalledWith("/api/v1/repos/demo/prs?status=merged&limit=10");
  });

  it("list_tasks forwards status filter supported by daemon", async () => {
    mockDaemon.get.mockResolvedValueOnce({ tasks: [], total: 0 });
    const query = buildListQuery({ status: "claimed" });

    await daemon.get(`/api/v1/repos/demo/tasks${query}`);

    expect(mockDaemon.get).toHaveBeenCalledWith("/api/v1/repos/demo/tasks?status=claimed");
  });
});

describe("MCP daemon client patterns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates errors from daemon calls", async () => {
    mockDaemon.get.mockRejectedValueOnce(new Error("connection refused"));
    await expect(daemon.get("/api/v1/repos")).rejects.toThrow("connection refused");
  });

  it("encodes repo names with special characters", async () => {
    mockDaemon.get.mockResolvedValueOnce({});
    const encoded = encodeURIComponent("my repo/name");
    await daemon.get(`/api/v1/repos/${encoded}`);
    expect(mockDaemon.get).toHaveBeenCalledWith(`/api/v1/repos/${encoded}`);
  });
});
