#!/usr/bin/env node
/**
 * LucidLink Connect API MCP Server
 *
 * Provides access to LucidLink Connect API: filesystem entries,
 * external data stores, and external entries (bring-your-own-bucket).
 * Cross-platform — connects to a running LucidLink API instance.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { ApiClient } from "./shared/api-client.js";
import { getBearerToken, CONFIG_PATH_DISPLAY } from "./shared/config.js";
import { checkApiConnectivity } from "./shared/api-health.js";
import { formatSuccess, formatError, ok, err } from "./shared/formatters.js";
import {
  ensureFolderPath,
  importS3Object,
  bulkImportS3Objects,
  linkHttpFile,
  bulkLinkHttpFiles,
} from "./connect/workflow-tools.js";
import { generateConnectUI, GeneratedProject } from "./connect/ui-template.js";
import { registerBrandResource } from "./shared/brand-resource.js";
import { registerCapabilitiesResource } from "./shared/capabilities-resource.js";

// ── Workflow guide (no token needed) ──

const CONNECT_WORKFLOW_GUIDE = `LucidLink Connect MCP Server — Workflow Guide
=============================================

WHAT IS LUCIDLINK CONNECT?
LucidLink Connect links existing external files into a filespace as read-only "external entries"
without copying data.

TWO KINDS OF EXTERNAL ENTRY:
- SingleObjectFile — backed by an S3 object via a LucidLink-managed Data Store.
                     LucidLink presigns the URLs on the user's behalf.
- HttpLinkFile     — backed by any HTTP/HTTPS URL. No Data Store needed.
                     The user/automation supplies and rotates the URL.
                     Requires LucidLink API v1.4.3+.

PATH 1 — S3 OBJECT (with Data Store)
  Step 1: Create a data store (S3 credentials, stored per-filespace, encrypted)
    tool: create_data_store
    required: filespace_id, name, access_key, secret_key, bucket_name, use_virtual_addressing

  Step 2: Ensure folder structure exists
    tool: ensure_folder_path

  Step 3: Link S3 objects
    tool: import_s3_object  (one at a time)
      OR
    tool: bulk_import_s3_objects  (many at once)

PATH 2 — HTTP LINK (no Data Store)
  Step 1: Ensure folder structure exists
    tool: ensure_folder_path

  Step 2: Link an HTTP/HTTPS URL
    tool: link_http_file   (one at a time)
      OR
    tool: bulk_link_http_files   (many at once)
      OR primitive: create_http_link

  Rotating an expiring URL: use update_http_link_url (PATCH) with the entry_id
  returned by create_http_link / link_http_file.

  HTTP URL requirements:
    - Direct asset URL (not a webpage that embeds the file).
    - Server must return Content-Length and Range headers.
    - LucidLink does NOT renew or re-sign URLs — rotation is your job.

HIGH-LEVEL WORKFLOW TOOLS (recommended):
  - ensure_folder_path        — creates /a/b/c directory hierarchy in one call
  - import_s3_object          — ensures dirs + links one S3 object (SingleObjectFile)
  - bulk_import_s3_objects    — ensures dirs + links many S3 objects
  - link_http_file            — ensures dirs + links one HTTP URL (HttpLinkFile)
  - bulk_link_http_files      — ensures dirs + links many HTTP URLs
  - create_connect_ui         — generates a browser-based import UI

PRIMITIVE API TOOLS (for fine-grained control):
  Entries:          create_entry, resolve_entry, get_entry, delete_entry, list_entry_children
  Data Stores:      create_data_store, list_data_stores, get_data_store, update_data_store, delete_data_store
  External Entries: create_external_entry (S3), create_http_link, update_http_link_url,
                    list_external_entry_ids, delete_external_entry

LIMITATIONS:
  - Read-only (external entries cannot be written to)
  - Individual file/object linking (no bucket-level or folder-level mount)
  - SingleObjectFile is S3-only; HttpLinkFile works with any HTTP/HTTPS server
  - Delete removes the filespace entry only (not the underlying object/URL target)
  - Copy creates a native LucidLink file (no longer external)

ROTATING CREDENTIALS / URLS:
  - S3 data store: update_data_store with new access_key + secret_key
  - HTTP link URL: update_http_link_url with new url

COMMON ERRORS:
  409 on create_entry -> folder already exists, use resolve_entry to get its ID
  404 on resolve_entry -> path doesn't exist, use create_entry on parent
  401 -> bearer token expired, update LUCIDLINK_BEARER_TOKEN`;

// ── Lazy API client ──

let apiClient: ApiClient | null = null;

function getClient(): ApiClient {
  if (apiClient) return apiClient;
  const token = getBearerToken();
  if (!token) {
    throw new Error(
      "No bearer token found.\n\n" +
      "Set one of:\n" +
      "  export LUCIDLINK_BEARER_TOKEN=your_token\n" +
      `  or add bearerToken to ${CONFIG_PATH_DISPLAY}`,
    );
  }
  apiClient = new ApiClient(token);
  return apiClient;
}

async function ensureReady(): Promise<string | null> {
  const result = await checkApiConnectivity();
  if (!result.ok) return result.error ?? "API is not reachable.";
  return null;
}

// ── Server ──

const server = new McpServer(
  { name: "lucidlink-connect-api", version: "2.3.1" },
  { instructions: `LucidLink Connect API server — links existing external files into filespaces as read-only external entries.

The LucidLink API runs as a self-hosted Docker container (lucidlink/lucidlink-api on DockerHub).
Configure the API URL via LUCIDLINK_API_URL env var (default: http://localhost:3003/api/v1).
Set your bearer token via LUCIDLINK_BEARER_TOKEN env var or in ~/.lucidlink/mcp-config.json.

Two kinds of external entry:
  - SingleObjectFile — S3 object via a LucidLink-managed Data Store
                       (LucidLink presigns URLs for the user)
  - HttpLinkFile     — any HTTP/HTTPS URL (no Data Store; user owns URL rotation,
                       requires LucidLink API v1.4.3+)

Use get_connect_workflow_guide for a complete quickstart.
Typical S3 workflow:    create_data_store → ensure_folder_path → bulk_import_s3_objects.
Typical HTTP workflow:  ensure_folder_path → link_http_file (or bulk_link_http_files).
URL rotation for HTTP links: update_http_link_url.

Use create_connect_ui when the user asks to create, generate, build, or launch a UI, interface,
dashboard, or app for LucidLink Connect — always use it instead of building a UI manually.

Connection check (check_api_connection) is on the lucidlink-api server.` },
);

registerBrandResource(server);
registerCapabilitiesResource(server);

// ── Tools that need NO token ──

server.tool(
  "get_connect_workflow_guide",
  "Return step-by-step guide for the LucidLink Connect import workflow (no token needed)",
  {},
  async () => ok(CONNECT_WORKFLOW_GUIDE),
);

server.tool(
  "create_connect_ui",
  "Generate a Connect web UI (S3 browser). Writes files, runs npm install, starts the server, opens the browser. Returns the running URL.",
  {
    filespace_id: z.string().optional().describe("Pre-fill filespace ID"),
    data_store_id: z.string().optional().describe("Pre-fill data store ID"),
    output_dir: z.string().optional().describe("Directory to write files to (default: ~/Desktop/connect-ui)"),
  },
  async ({ filespace_id, data_store_id, output_dir }) => {
    const project = generateConnectUI(filespace_id ?? "", data_store_id ?? "");

    const fs = await import("node:fs");
    const path = await import("node:path");
    const os = await import("node:os");
    const { execSync, spawn } = await import("node:child_process");

    // Expand ~ to home directory, default to ~/Desktop/connect-ui
    const raw = output_dir || "~/Desktop/connect-ui";
    const dir = raw.replace(/^~(?=$|\/)/, os.homedir()).replace(/\/+$/, "");

    // Write project files
    for (const [relPath, content] of Object.entries(project.files)) {
      const fullPath = path.join(dir, relPath);
      const parentDir = path.dirname(fullPath);
      fs.mkdirSync(parentDir, { recursive: true });
      fs.writeFileSync(fullPath, content, "utf-8");
    }

    // Install dependencies
    try {
      execSync("npm install --production", { cwd: dir, stdio: "pipe", timeout: 60000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return err(`Generated files in ${dir}/ but npm install failed:\n${msg}\n\nTry manually: cd ${dir} && npm install && node server.js`);
    }

    // Launch server in background (detached so it survives MCP server restart)
    const serverProcess = spawn("node", ["server.js"], {
      cwd: dir,
      detached: true,
      stdio: "ignore",
    });
    serverProcess.unref();

    // Wait briefly for server to start
    await new Promise((r) => setTimeout(r, 1500));

    return ok(
      `Connect UI is running at http://localhost:8080\n\n` +
      `Project files: ${dir}/\n` +
      Object.keys(project.files).map((f) => `  ${f}`).join("\n") +
      `\n\nThe server is running in the background. To stop it: kill ${serverProcess.pid}`,
    );
  },
);

// ── Filesystem Entry Tools ──

server.tool(
  "create_entry",
  "Create a new directory inside a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    parent_id: z.string().describe("Parent directory entry ID"),
    name: z.string().describe("New directory name"),
  },
  async ({ filespace_id, parent_id, name }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Entry", startErr));

    const res = await getClient().createEntry(filespace_id, parent_id, name);
    return res.success
      ? ok(formatSuccess(`Created directory '${name}'`, res.data ?? {}))
      : err(formatError("Create Entry", res.error ?? "Unknown error"));
  },
);

server.tool(
  "resolve_entry",
  "Look up a filesystem entry by path",
  {
    filespace_id: z.string().describe("Filespace ID"),
    path: z.string().describe("Full filesystem path (e.g. /reports/q3/)"),
  },
  async ({ filespace_id, path }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Resolve Entry", startErr));

    const res = await getClient().resolveEntry(filespace_id, path);
    return res.success
      ? ok(formatSuccess(`Resolved path '${path}'`, res.data ?? {}))
      : err(formatError("Resolve Entry", res.error ?? "Unknown error"));
  },
);

server.tool(
  "get_entry",
  "Get details about a filesystem entry by ID",
  {
    filespace_id: z.string().describe("Filespace ID"),
    entry_id: z.string().describe("Filesystem entry ID"),
  },
  async ({ filespace_id, entry_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Entry", startErr));

    const res = await getClient().getEntry(filespace_id, entry_id);
    return res.success
      ? ok(formatSuccess("Entry Details", res.data ?? {}))
      : err(formatError("Get Entry", res.error ?? "Unknown error"));
  },
);

server.tool(
  "delete_entry",
  "Delete a filesystem entry (directory must be empty)",
  {
    filespace_id: z.string().describe("Filespace ID"),
    entry_id: z.string().describe("Entry ID to delete"),
    confirm: z.boolean().describe("Must be true to proceed"),
  },
  async ({ filespace_id, entry_id, confirm }) => {
    if (!confirm) return err("Deletion not confirmed. Set confirm=true to proceed.");

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Entry", startErr));

    const res = await getClient().deleteEntry(filespace_id, entry_id);
    return res.success
      ? ok(formatSuccess("Deleted Entry", { entry_id }))
      : err(formatError("Delete Entry", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_entry_children",
  "List the contents of a directory in a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    entry_id: z.string().describe("Directory entry ID"),
    limit: z.number().optional().describe("Max entries to return"),
    next_cursor: z.string().optional().describe("Pagination cursor"),
  },
  async ({ filespace_id, entry_id, limit, next_cursor }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Entry Children", startErr));

    const res = await getClient().listEntryChildren(filespace_id, entry_id, {
      limit,
      nextCursor: next_cursor,
    });
    if (!res.success) return err(formatError("List Entry Children", res.error ?? "Unknown error"));

    const inner = (res.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const entries = (inner?.entries ?? []) as Record<string, unknown>[];
    const nextCur = inner?.nextCursor as string | undefined;

    if (entries.length === 0) return ok("Directory is empty.");

    let list = entries.map((e) =>
      `- [${e.type ?? "?"}] ${e.name ?? "?"} (ID: ${e.id ?? "N/A"})`,
    ).join("\n");
    let msg = `${entries.length} item(s):\n\n${list}`;
    if (nextCur) msg += `\n\nMore results available. Use next_cursor='${nextCur}' to continue.`;
    return ok(msg);
  },
);

// ── Data Store Tools ──

server.tool(
  "create_data_store",
  "Create an S3 external data store for a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    name: z.string().describe("Data store name"),
    access_key: z.string().describe("S3 access key ID"),
    secret_key: z.string().describe("S3 secret access key"),
    bucket_name: z.string().describe("S3 bucket name"),
    use_virtual_addressing: z.boolean().describe("Virtual-hosted addressing (true for AWS S3)"),
    region: z.string().optional().describe("AWS region"),
    endpoint: z.string().optional().describe("Custom S3-compatible endpoint URL"),
    url_expiration_minutes: z.number().optional().describe("Pre-signed URL expiration in minutes"),
  },
  async ({ filespace_id, name, access_key, secret_key, bucket_name, use_virtual_addressing, region, endpoint, url_expiration_minutes }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Data Store", startErr));

    const s3Params: Record<string, unknown> = {
      accessKey: access_key,
      secretKey: secret_key,
      bucketName: bucket_name,
      useVirtualAddressing: use_virtual_addressing,
    };
    if (region) s3Params.region = region;
    if (endpoint) s3Params.endpoint = endpoint;
    if (url_expiration_minutes != null) s3Params.urlExpirationMinutes = url_expiration_minutes;

    const res = await getClient().createDataStore(filespace_id, {
      name,
      kind: "S3DataStore",
      s3StorageParams: s3Params,
    });
    return res.success
      ? ok(formatSuccess(`Created data store '${name}'`, res.data ?? {}))
      : err(formatError("Create Data Store", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_data_stores",
  "List external data stores configured for a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    name: z.string().optional().describe("Filter by data store name"),
  },
  async ({ filespace_id, name }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Data Stores", startErr));

    const res = await getClient().listDataStores(filespace_id, name);
    if (!res.success) return err(formatError("List Data Stores", res.error ?? "Unknown error"));

    const stores = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (stores.length === 0) return ok("No data stores found for this filespace.");

    const list = stores.map((s) =>
      `- ${s.name ?? "Unknown"} (ID: ${s.id ?? "N/A"}, kind: ${s.kind ?? "N/A"})`,
    ).join("\n");
    return ok(`${stores.length} data store(s):\n\n${list}`);
  },
);

server.tool(
  "get_data_store",
  "Get details about a specific external data store",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID"),
  },
  async ({ filespace_id, data_store_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Data Store", startErr));

    const res = await getClient().getDataStore(filespace_id, data_store_id);
    return res.success
      ? ok(formatSuccess("Data Store Details", res.data ?? {}))
      : err(formatError("Get Data Store", res.error ?? "Unknown error"));
  },
);

server.tool(
  "update_data_store",
  "Update credentials for an external data store",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID"),
    access_key: z.string().describe("New S3 access key ID"),
    secret_key: z.string().describe("New S3 secret access key"),
  },
  async ({ filespace_id, data_store_id, access_key, secret_key }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update Data Store", startErr));

    const res = await getClient().updateDataStore(filespace_id, data_store_id, {
      s3StorageParams: { accessKey: access_key, secretKey: secret_key },
    });
    return res.success
      ? ok(formatSuccess("Updated Data Store Credentials", res.data ?? {}))
      : err(formatError("Update Data Store", res.error ?? "Unknown error"));
  },
);

server.tool(
  "delete_data_store",
  "Delete an external data store from a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID to delete"),
    confirm: z.boolean().describe("Must be true to proceed"),
  },
  async ({ filespace_id, data_store_id, confirm }) => {
    if (!confirm) return err("Deletion not confirmed. Set confirm=true to proceed.");

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Data Store", startErr));

    const res = await getClient().deleteDataStore(filespace_id, data_store_id);
    return res.success
      ? ok(formatSuccess("Deleted Data Store", { data_store_id }))
      : err(formatError("Delete Data Store", res.error ?? "Unknown error"));
  },
);

// ── External Entry Tools ──

server.tool(
  "create_external_entry",
  "Create an external file entry backed by an S3 object",
  {
    filespace_id: z.string().describe("Filespace ID"),
    path: z.string().describe("Filesystem path (e.g. /videos/clip.mp4)"),
    data_store_id: z.string().describe("Data store ID"),
    object_id: z.string().describe("Object key/ID within the bucket"),
  },
  async ({ filespace_id, path, data_store_id, object_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create External Entry", startErr));

    const res = await getClient().createExternalEntry(filespace_id, {
      path,
      kind: "SingleObjectFile",
      dataStoreId: data_store_id,
      singleObjectFileParams: { objectId: object_id },
    });
    return res.success
      ? ok(formatSuccess(`Created external entry at '${path}'`, res.data ?? {}))
      : err(formatError("Create External Entry", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_external_entry_ids",
  "List external entry IDs associated with a data store",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID"),
    limit: z.number().optional().describe("Max IDs to return"),
    next_cursor: z.string().optional().describe("Pagination cursor"),
  },
  async ({ filespace_id, data_store_id, limit, next_cursor }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List External Entry IDs", startErr));

    const res = await getClient().listExternalEntryIds(filespace_id, {
      dataStoreId: data_store_id,
      limit,
      nextCursor: next_cursor,
    });
    if (!res.success) return err(formatError("List External Entry IDs", res.error ?? "Unknown error"));

    const inner = (res.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const ids = (inner?.ids ?? []) as string[];
    const nextCur = inner?.nextCursor as string | undefined;

    if (ids.length === 0) return ok("No external entries found.");

    let msg = `${ids.length} external entry ID(s):\n\n` + ids.map((id) => `- ${id}`).join("\n");
    if (nextCur) msg += `\n\nMore available. Use next_cursor='${nextCur}' to continue.`;
    return ok(msg);
  },
);

server.tool(
  "delete_external_entry",
  "Delete an external entry from a filespace",
  {
    filespace_id: z.string().describe("Filespace ID"),
    entry_id: z.string().describe("External entry ID"),
    confirm: z.boolean().describe("Must be true to proceed"),
  },
  async ({ filespace_id, entry_id, confirm }) => {
    if (!confirm) return err("Deletion not confirmed. Set confirm=true to proceed.");

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete External Entry", startErr));

    const res = await getClient().deleteExternalEntry(filespace_id, entry_id);
    return res.success
      ? ok(formatSuccess("Deleted External Entry", { entry_id }))
      : err(formatError("Delete External Entry", res.error ?? "Unknown error"));
  },
);

// ── HTTP Link File Tools (kind: HttpLinkFile, no data store) ──

server.tool(
  "create_http_link",
  "Create an HTTP link file entry. Links an external URL into the filespace as a read-only file. No data store required. Requires LucidLink API v1.4.3+.",
  {
    filespace_id: z.string().describe("Filespace ID"),
    path: z.string().describe("Filespace path (e.g. /reports/dataset.csv)"),
    url: z.string().describe("HTTP or HTTPS URL of the file. Server must support Content-Length and Range headers."),
  },
  async ({ filespace_id, path, url }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create HTTP Link", startErr));

    const res = await getClient().createExternalEntry(filespace_id, {
      path,
      kind: "HttpLinkFile",
      httpFileParams: { url },
    });
    return res.success
      ? ok(formatSuccess(`Linked HTTP file at '${path}'`, res.data ?? {}))
      : err(formatError("Create HTTP Link", res.error ?? "Unknown error"));
  },
);

server.tool(
  "update_http_link_url",
  "Rotate the URL behind an existing HTTP link file entry (PATCH). Useful for refreshing pre-signed URLs before they expire. Only entries with kind=HttpLinkFile can be patched this way.",
  {
    filespace_id: z.string().describe("Filespace ID"),
    entry_id: z.string().describe("HTTP link entry ID (returned from create_http_link)"),
    url: z.string().describe("New HTTP or HTTPS URL"),
  },
  async ({ filespace_id, entry_id, url }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update HTTP Link URL", startErr));

    const res = await getClient().patchExternalEntry(filespace_id, entry_id, {
      httpFileParams: { url },
    });
    return res.success
      ? ok(formatSuccess(`Updated HTTP link URL for entry ${entry_id}`, res.data ?? {}))
      : err(formatError("Update HTTP Link URL", res.error ?? "Unknown error"));
  },
);

// ── High-Level Workflow Tools ──

server.tool(
  "ensure_folder_path",
  "Create all directories in a filespace path, returning leaf entry ID",
  {
    filespace_id: z.string().describe("Filespace ID"),
    path: z.string().describe("Directory path to create (e.g. /videos/2024/clips)"),
  },
  async ({ filespace_id, path }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Ensure Folder Path", startErr));

    const result = await ensureFolderPath(getClient(), filespace_id, path);
    return result.ok
      ? ok(formatSuccess(`Ensured folder path '${path}'`, { path, leaf_entry_id: result.leafId }))
      : err(formatError("Ensure Folder Path", result.error));
  },
);

server.tool(
  "import_s3_object",
  "Ensure directory path exists, then link one S3 object as an external entry",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID"),
    s3_key: z.string().describe("S3 object key (e.g. media/clip.mp4)"),
    ll_path: z.string().describe("Full filespace path (e.g. /media/clip.mp4)"),
  },
  async ({ filespace_id, data_store_id, s3_key, ll_path }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Import S3 Object", startErr));

    const res = await importS3Object(getClient(), filespace_id, data_store_id, s3_key, ll_path);
    return res.success
      ? ok(formatSuccess(`Imported S3 object '${s3_key}' -> '${ll_path}'`, res.data ?? {}))
      : err(formatError("Import S3 Object", res.error ?? "Unknown error"));
  },
);

server.tool(
  "bulk_import_s3_objects",
  "Ensure all directories exist, then link multiple S3 objects as external entries",
  {
    filespace_id: z.string().describe("Filespace ID"),
    data_store_id: z.string().describe("Data store ID"),
    objects: z.array(z.object({
      s3_key: z.string().describe("S3 object key"),
      ll_path: z.string().describe("Target filespace path"),
    })).describe("List of objects to import"),
    stop_on_error: z.boolean().optional().describe("Stop on first error (default false)"),
  },
  async ({ filespace_id, data_store_id, objects, stop_on_error }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Bulk Import", startErr));

    const result = await bulkImportS3Objects(
      getClient(), filespace_id, data_store_id, objects, stop_on_error ?? false,
    );

    if (result.failed === 0 && result.dirFailures.length === 0) {
      return ok(formatSuccess(
        `Bulk Import: ${result.succeeded}/${result.total} objects imported`,
        result as unknown as Record<string, unknown>,
      ));
    }
    return err(
      `Bulk Import completed with errors: ${result.succeeded} succeeded, ${result.failed} failed\n\n` +
      JSON.stringify(result, null, 2),
    );
  },
);

server.tool(
  "link_http_file",
  "Ensure directory path exists, then link an HTTP/HTTPS URL as an external file entry. No data store needed. Requires LucidLink API v1.4.3+.",
  {
    filespace_id: z.string().describe("Filespace ID"),
    url: z.string().describe("HTTP or HTTPS URL (server must support Content-Length and Range headers)"),
    ll_path: z.string().describe("Full filespace path (e.g. /reports/dataset.csv)"),
  },
  async ({ filespace_id, url, ll_path }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Link HTTP File", startErr));

    const res = await linkHttpFile(getClient(), filespace_id, url, ll_path);
    return res.success
      ? ok(formatSuccess(`Linked '${url}' -> '${ll_path}'`, res.data ?? {}))
      : err(formatError("Link HTTP File", res.error ?? "Unknown error"));
  },
);

server.tool(
  "bulk_link_http_files",
  "Ensure all directories exist, then link multiple HTTP URLs as external file entries (no data store).",
  {
    filespace_id: z.string().describe("Filespace ID"),
    items: z.array(z.object({
      url: z.string().describe("HTTP or HTTPS URL"),
      ll_path: z.string().describe("Target filespace path"),
    })).describe("List of URL → filespace-path links"),
    stop_on_error: z.boolean().optional().describe("Stop on first error (default false)"),
  },
  async ({ filespace_id, items, stop_on_error }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Bulk Link HTTP Files", startErr));

    const result = await bulkLinkHttpFiles(
      getClient(), filespace_id, items, stop_on_error ?? false,
    );

    if (result.failed === 0 && result.dirFailures.length === 0) {
      return ok(formatSuccess(
        `Bulk HTTP Link: ${result.succeeded}/${result.total} files linked`,
        result as unknown as Record<string, unknown>,
      ));
    }
    return err(
      `Bulk HTTP Link completed with errors: ${result.succeeded} succeeded, ${result.failed} failed\n\n` +
      JSON.stringify(result, null, 2),
    );
  },
);

// ── Start server ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
