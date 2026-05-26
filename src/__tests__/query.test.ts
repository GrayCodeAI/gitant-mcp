import { describe, it, expect } from "vitest";
import { buildListQuery } from "../query.js";

describe("buildListQuery", () => {
  it("returns empty string when no params are set", () => {
    expect(buildListQuery({})).toBe("");
  });

  it("builds pagination query params", () => {
    expect(buildListQuery({ offset: 10, limit: 25 })).toBe("?offset=10&limit=25");
  });

  it("omits status=all", () => {
    expect(buildListQuery({ status: "all", offset: 0 })).toBe("?offset=0");
  });

  it("joins label filters as comma-separated values", () => {
    expect(buildListQuery({ labels: ["bug", "critical"], status: "open" })).toBe(
      "?labels=bug%2Ccritical&status=open",
    );
  });

  it("matches list_issues URL construction", () => {
    const repo = "my-repo";
    const query = buildListQuery({
      status: "closed",
      labels: ["bug"],
      offset: 5,
      limit: 20,
    });
    expect(`/api/v1/repos/${encodeURIComponent(repo)}/issues${query}`).toBe(
      "/api/v1/repos/my-repo/issues?status=closed&labels=bug&offset=5&limit=20",
    );
  });

  it("matches list_prs URL construction", () => {
    const query = buildListQuery({ status: "merged", limit: 10 });
    expect(`/api/v1/repos/demo/prs${query}`).toBe("/api/v1/repos/demo/prs?status=merged&limit=10");
  });
});
