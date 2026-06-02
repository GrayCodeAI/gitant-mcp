import { z } from "zod";
import { daemon } from "./daemon-client.js";
import { buildListQuery } from "./query.js";

export async function daemonCall<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    };
  }
}

export function paginationQuery(offset?: number, limit?: number): string {
  return buildListQuery({ offset, limit });
}

export const paginationSchema = {
  offset: z.number().int().nonnegative().optional().describe("Pagination offset"),
  limit: z.number().int().positive().max(100).optional().describe("Page size (max 100)"),
};
export { daemon, buildListQuery };
