export type QueryParamValue = string | number | boolean | string[] | undefined;

/** Builds a URL query string from optional list/filter/pagination params. */
export function buildListQuery(params: Record<string, QueryParamValue>): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      search.set(key, value.join(","));
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      search.set(key, value.toString());
      continue;
    }
    if (value === "all" && (key === "status" || key === "state")) {
      continue;
    }
    search.set(key, value);
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}
