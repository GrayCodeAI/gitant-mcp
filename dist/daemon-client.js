const DAEMON_URL = process.env.GITANT_DAEMON_URL || "http://localhost:7777";
export class DaemonClient {
    baseUrl;
    constructor(baseUrl) {
        this.baseUrl = baseUrl || DAEMON_URL;
    }
    async fetch(path, options) {
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
        return response.json();
    }
    async get(path) {
        return this.fetch(path, { method: "GET" });
    }
    async post(path, body) {
        return this.fetch(path, {
            method: "POST",
            body: body ? JSON.stringify(body) : undefined,
        });
    }
    async delete(path) {
        return this.fetch(path, { method: "DELETE" });
    }
    async put(path, body) {
        return this.fetch(path, {
            method: "PUT",
            body: body ? JSON.stringify(body) : undefined,
        });
    }
}
export const daemon = new DaemonClient();
