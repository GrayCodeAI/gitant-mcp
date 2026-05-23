const DAEMON_URL = process.env.GITANT_DAEMON_URL || "http://localhost:7777";
const GITANT_UCAN_TOKEN = process.env.GITANT_UCAN_TOKEN;

const TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 1_000;
const MAX_RETRIES = 1;

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

  async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const isGet = !options?.method || options.method === "GET";
    const maxAttempts = isGet ? 1 + MAX_RETRIES : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
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
          signal: controller.signal,
        });

        if (!response.ok) {
          if (
            isGet &&
            response.status >= 500 &&
            attempt < maxAttempts - 1
          ) {
            continue;
          }
          const text = await response.text().catch(() => "Unknown error");
          throw new Error(`Daemon error ${response.status}: ${text}`);
        }

        return response.json() as Promise<T>;
      } catch (error) {
        if (
          isGet &&
          attempt < maxAttempts - 1 &&
          error instanceof Error &&
          (error.name === "AbortError" || error.message.includes("fetch"))
        ) {
          continue;
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new Error("Unreachable");
  }

  async get<T>(path: string): Promise<T> {
    return this.fetch<T>(path, { method: "GET" });
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.fetch<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    return this.fetch<T>(path, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(path: string): Promise<T> {
    return this.fetch<T>(path, { method: "DELETE" });
  }
}

export const daemon = new DaemonClient();
