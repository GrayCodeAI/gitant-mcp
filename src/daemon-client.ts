const DAEMON_URL = process.env.GITANT_DAEMON_URL || "http://localhost:7777";
const GITANT_UCAN_TOKEN = process.env.GITANT_UCAN_TOKEN;

export class DaemonClient {
  private baseUrl: string;
  private token: string | undefined;

  constructor(baseUrl?: string, token?: string) {
    this.baseUrl = baseUrl || DAEMON_URL;
    this.token = token || GITANT_UCAN_TOKEN;
  }

  setToken(token: string) {
    this.token = token;
  }

  async fetch<T = any>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options?.headers as Record<string, string>) || {}),
    };
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "Unknown error");
      throw new Error(`Daemon error ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }

  async get<T = any>(path: string): Promise<T> {
    return this.fetch<T>(path, { method: "GET" });
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    return this.fetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T = any>(path: string, body?: any): Promise<T> {
    return this.fetch<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T = any>(path: string): Promise<T> {
    return this.fetch<T>(path, { method: "DELETE" });
  }
}

export const daemon = new DaemonClient();
