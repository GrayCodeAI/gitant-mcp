const DAEMON_URL = process.env.GITANT_DAEMON_URL || "http://localhost:7777";

export interface DaemonResponse<T = any> {
  data: T;
  status: number;
}

export class DaemonClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || DAEMON_URL;
  }

  async fetch<T = any>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
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

  async delete<T = any>(path: string): Promise<T> {
    return this.fetch<T>(path, { method: "DELETE" });
  }

  async put<T = any>(path: string, body?: any): Promise<T> {
    return this.fetch<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

export const daemon = new DaemonClient();
