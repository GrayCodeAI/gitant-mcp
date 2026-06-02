import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { daemon, daemonCall, paginationQuery, paginationSchema, buildListQuery } from "../shared.js";

export function registerCicdTools(server: McpServer) {
  // Webhook tools
  server.registerTool("gitant_list_webhooks", { description: "List registered webhooks", inputSchema: paginationSchema }, async ({ offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/webhooks${paginationQuery(offset, limit)}`));
  });

  server.registerTool("gitant_register_webhook", { description: "Register a new webhook", inputSchema: {
    url: z.string().min(1).url().describe("Webhook URL"),
    events: z.array(z.string()).min(1).describe("Event types to subscribe to"),
    secret: z.string().optional().describe("Webhook secret for signature verification"),
  } }, async ({ url, events, secret }) => {
    return daemonCall(() => daemon.post("/api/v1/webhooks", { url, events, secret }));
  });

  server.registerTool("gitant_delete_webhook", { description: "Delete a webhook", inputSchema: {
    webhook_id: z.string().min(1).describe("Webhook ID to delete"),
  } }, async ({ webhook_id }) => {
    return daemonCall(() => daemon.delete(`/api/v1/webhooks/${encodeURIComponent(webhook_id)}`));
  });

  // Deployment tools
  server.registerTool("gitant_list_deployments", { description: "List deployments for a repository", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    environment: z.string().optional().describe("Filter by environment"),
    ...paginationSchema,
  } }, async ({ repo, environment, offset, limit }) => {
    const url = `/api/v1/repos/${encodeURIComponent(repo)}/deployments${buildListQuery({ offset, limit, environment })}`;
    return daemonCall(() => daemon.get(url));
  });

  server.registerTool("gitant_create_deployment", { description: "Create a deployment", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    environment: z.string().min(1).describe("Environment name"),
    ref: z.string().min(1).describe("Git ref (branch/tag/SHA)"),
  } }, async ({ repo, environment, ref }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments`, { environment, ref }));
  });

  server.registerTool("gitant_get_deployment", { description: "Get deployment status", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    deployment_id: z.string().min(1).describe("Deployment ID"),
  } }, async ({ repo, deployment_id }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}`));
  });

  server.registerTool("gitant_rollback_deployment", { description: "Rollback a deployment", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    deployment_id: z.string().min(1).describe("Deployment ID"),
  } }, async ({ repo, deployment_id }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/deployments/${encodeURIComponent(deployment_id)}/rollback`));
  });

  // Environment tools
  server.registerTool("gitant_list_environments", { description: "List environments for a repository", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    ...paginationSchema,
  } }, async ({ repo, offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/environments${paginationQuery(offset, limit)}`));
  });

  server.registerTool("gitant_create_environment", { description: "Create an environment", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Environment name"),
  } }, async ({ repo, name }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/environments`, { name }));
  });

  server.registerTool("gitant_delete_environment", { description: "Delete an environment", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Environment name"),
  } }, async ({ repo, name }) => {
    return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/environments/${encodeURIComponent(name)}`));
  });

  // CI/CD Runner tools
  server.registerTool("gitant_list_runners", { description: "List CI/CD runners", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    ...paginationSchema,
  } }, async ({ repo, offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/runners${paginationQuery(offset, limit)}`));
  });

  server.registerTool("gitant_register_runner", { description: "Register a CI/CD runner", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Runner name"),
    tags: z.array(z.string()).optional().describe("Runner tags"),
  } }, async ({ repo, name, tags }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/runners`, { name, tags: tags || [] }));
  });

  server.registerTool("gitant_delete_runner", { description: "Delete a CI/CD runner", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    runner_id: z.string().min(1).describe("Runner ID"),
  } }, async ({ repo, runner_id }) => {
    return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/runners/${encodeURIComponent(runner_id)}`));
  });

  // CI/CD Variable tools
  server.registerTool("gitant_list_variables", { description: "List CI/CD variables", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
  } }, async ({ repo }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/variables`));
  });

  server.registerTool("gitant_set_variable", { description: "Set a CI/CD variable", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    key: z.string().min(1).describe("Variable key"),
    value: z.string().min(1).describe("Variable value"),
    protected: z.boolean().optional().describe("Whether variable is protected"),
  } }, async ({ repo, key, value, protected: isProtected }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/variables`, { key, value, protected: isProtected || false }));
  });

  server.registerTool("gitant_delete_variable", { description: "Delete a CI/CD variable", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    key: z.string().min(1).describe("Variable key"),
  } }, async ({ repo, key }) => {
    return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/variables/${encodeURIComponent(key)}`));
  });

  // CI/CD Pipeline tools
  server.registerTool("gitant_list_pipelines", { description: "List CI/CD pipelines", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    status: z.enum(["pending", "running", "success", "failed", "cancelled"]).optional().describe("Filter by status"),
    ...paginationSchema,
  } }, async ({ repo, status, offset, limit }) => {
    const url = `/api/v1/repos/${encodeURIComponent(repo)}/pipelines${buildListQuery({ offset, limit, status })}`;
    return daemonCall(() => daemon.get(url));
  });

  server.registerTool("gitant_get_pipeline", { description: "Get pipeline details", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    pipeline_id: z.string().min(1).describe("Pipeline ID"),
  } }, async ({ repo, pipeline_id }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines/${encodeURIComponent(pipeline_id)}`));
  });

  server.registerTool("gitant_trigger_pipeline", { description: "Trigger a CI/CD pipeline", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    ref: z.string().min(1).describe("Git ref to run pipeline on"),
  } }, async ({ repo, ref }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/pipelines`, { ref }));
  });

  // Cert tools
  server.registerTool("gitant_list_certs", { description: "List ref-update certificates", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    ...paginationSchema,
  } }, async ({ repo, offset, limit }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs${paginationQuery(offset, limit)}`));
  });

  server.registerTool("gitant_verify_cert", { description: "Verify a ref-update certificate's signature", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    cert_id: z.string().min(1).describe("Certificate ID"),
  } }, async ({ repo, cert_id }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/certs/${encodeURIComponent(cert_id)}/verify`));
  });

  server.registerTool("gitant_set_cert_threshold", { description: "Set required signature threshold for ref updates", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    threshold: z.number().int().positive().describe("Required signatures"),
  } }, async ({ repo, threshold }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/threshold`, { threshold }));
  });

  server.registerTool("gitant_sign_cert", { description: "Sign a ref-update certificate", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    ref: z.string().min(1).describe("Ref name"),
    old_oid: z.string().min(1).describe("Previous commit hash"),
    new_oid: z.string().min(1).describe("New commit hash"),
  } }, async ({ repo, ref, old_oid, new_oid }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/certs/sign`, { ref, old_oid, new_oid }));
  });

  // Secrets tools
  server.registerTool("gitant_list_secrets", { description: "List secret names (values never shown)", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
  } }, async ({ repo }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`));
  });

  server.registerTool("gitant_set_secret", { description: "Set a secret (encrypted, capability-bound)", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Secret name"),
    value: z.string().min(1).describe("Secret value"),
  } }, async ({ repo, name, value }) => {
    return daemonCall(() => daemon.post(`/api/v1/repos/${encodeURIComponent(repo)}/secrets`, { name, value }));
  });

  server.registerTool("gitant_get_secret", { description: "Get a secret value (requires secrets/read capability)", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Secret name"),
  } }, async ({ repo, name }) => {
    return daemonCall(() => daemon.get(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
  });

  server.registerTool("gitant_delete_secret", { description: "Delete a secret", inputSchema: {
    repo: z.string().min(1).max(64).describe("Repository name"),
    name: z.string().min(1).describe("Secret name"),
  } }, async ({ repo, name }) => {
    return daemonCall(() => daemon.delete(`/api/v1/repos/${encodeURIComponent(repo)}/secrets/${encodeURIComponent(name)}`));
  });
}
