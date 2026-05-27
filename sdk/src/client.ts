export interface GitantClientOptions {
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface StatusResponse {
  version: string;
  peers: number;
  repos: number;
  agents: number;
  uptime: string;
  identity: string;
  ipfs_pins?: number;
  p2p?: {
    enabled: boolean;
    peer_id?: string;
    addrs?: string[];
  };
}

export interface RepoSummary {
  id: string;
  name: string;
  description?: string;
  private?: boolean;
}

export interface Issue {
  id: string;
  repo: string;
  title: string;
  body?: string;
  status: string;
  labels?: string[];
}

export interface AgentProfile {
  did: string;
  trust_score: number;
  first_seen?: string;
  last_seen?: string;
}

export class GitantError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "GitantError";
  }
}

export class GitantClient {
  private baseUrl: string;
  private token?: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: GitantClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? process.env.GITANT_DAEMON_URL ?? "http://localhost:7777").replace(/\/$/, "");
    this.token = options.token ?? process.env.GITANT_UCAN_TOKEN;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 1;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
  }

  setToken(token: string) {
    this.token = token;
  }

  async getStatus(): Promise<StatusResponse> {
    return this.get("/api/v1/status");
  }

  async listRepos(): Promise<{ repos: RepoSummary[]; total: number }> {
    return this.get("/api/v1/repos");
  }

  async createRepo(name: string, description = "", isPrivate = false): Promise<RepoSummary> {
    return this.post("/api/v1/repos", { name, description, private: isPrivate });
  }

  async listIssues(repo: string, params: { status?: string; labels?: string[] } = {}): Promise<{ issues: Issue[]; total: number }> {
    const query = new URLSearchParams();
    if (params.status) query.set("status", params.status);
    if (params.labels?.length) query.set("labels", params.labels.join(","));
    const suffix = query.toString() ? `?${query}` : "";
    return this.get(`/api/v1/repos/${encodeURIComponent(repo)}/issues${suffix}`);
  }

  async createIssue(repo: string, title: string, body = "", labels: string[] = []): Promise<Issue> {
    return this.post(`/api/v1/repos/${encodeURIComponent(repo)}/issues`, { title, body, labels });
  }

  async getAgent(did: string): Promise<AgentProfile> {
    return this.get(`/api/v1/agents/${encodeURIComponent(did)}`);
  }

  async attestAgent(did: string, score: number, reason = ""): Promise<{ success: boolean; trust_score: number }> {
    return this.post(`/api/v1/agents/${encodeURIComponent(did)}/attest`, { score, reason });
  }

  async discoverFederation(did?: string): Promise<unknown> {
    const suffix = did ? `?did=${encodeURIComponent(did)}` : "";
    return this.get(`/api/v1/federation/discover${suffix}`);
  }

  async getBootstrapPeers(): Promise<{ peers: string[] }> {
    return this.get("/api/v1/network/bootstrap");
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const method = init.method || "GET";
    const isGet = method === "GET";
    const maxAttempts = isGet ? 1 + this.maxRetries : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        console.warn(`[gitant] Retrying ${method} ${path} (attempt ${attempt + 1}/${maxAttempts}) after ${this.retryDelayMs}ms`);
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const headers: Record<string, string> = {
          ...(init.headers as Record<string, string> | undefined),
        };
        if (this.token) {
          headers.Authorization = `Bearer ${this.token}`;
        }
        const response = await fetch(`${this.baseUrl}${path}`, {
          ...init,
          headers,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (isGet && response.status >= 500 && attempt < maxAttempts - 1) {
            console.warn(`[gitant] ${method} ${path} returned ${response.status}, will retry`);
            continue;
          }
          const text = await response.text().catch(() => "Unknown error");
          throw new GitantError(`Daemon error ${response.status}: ${text}`, response.status);
        }

        const text = await response.text();
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`Daemon returned non-JSON response for ${method} ${path}: ${text.slice(0, 200)}`);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          const timeoutError = new Error(`Request timed out after ${this.timeoutMs}ms: ${method} ${path}`);
          timeoutError.name = "TimeoutError";
          if (isGet && attempt < maxAttempts - 1) {
            console.warn(`[gitant] ${method} ${path} timed out, will retry`);
            continue;
          }
          throw timeoutError;
        }
        if (isGet && attempt < maxAttempts - 1 && error instanceof Error && error.message.includes("fetch")) {
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("Unreachable");
  }
}

export { GitantClient as default };
