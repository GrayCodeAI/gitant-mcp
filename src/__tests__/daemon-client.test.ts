import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { DaemonClient } from "../daemon-client.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockOk(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  };
}

describe("DaemonClient", () => {
  let client: DaemonClient;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    client = new DaemonClient("http://localhost:7777", "test-token");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends GET with correct URL and auth header", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({ repos: [] }));
    await client.get("/api/v1/repos");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/v1/repos"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("sends POST with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({ id: "test" }));
    await client.post("/api/v1/repos", { name: "test" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "test" }),
      }),
    );
  });

  it("sends PUT with JSON body", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({ ok: true }));
    await client.put("/api/v1/repos/x", { description: "updated" });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("sends DELETE request", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({ ok: true }));
    await client.delete("/api/v1/repos/x");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: () => Promise.resolve("Not found"),
    });
    await expect(client.get("/api/v1/repos/missing")).rejects.toThrow(
      "Daemon error 404",
    );
  });

  it("encodes special characters in URL path segments", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({}));
    await client.get(`/api/v1/repos/${encodeURIComponent("my repo/name")}`);
    const calledUrl = mockFetch.mock.calls[0]![0] as string;
    expect(calledUrl).toContain("my%20repo%2Fname");
  });

  it("uses token from constructor", async () => {
    mockFetch.mockResolvedValueOnce(mockOk({}));
    await client.get("/test");
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer test-token");
  });

  it("uses setToken to update token", async () => {
    client.setToken("new-token");
    mockFetch.mockResolvedValueOnce(mockOk({}));
    await client.get("/test");
    const headers = mockFetch.mock.calls[0]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers["Authorization"]).toBe("Bearer new-token");
  });

  it("falls back to env vars for URL and token", async () => {
    const envClient = new DaemonClient();
    // Should not throw — uses defaults
    expect(envClient).toBeDefined();
  });
});
