#!/usr/bin/env node
/**
 * LucidLink Admin API MCP Server
 *
 * Provides natural language interface to the LucidLink Admin API.
 * Cross-platform — connects to a running LucidLink API instance
 * (Docker container or any HTTP endpoint).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { registerBrandResource } from "./shared/brand-resource.js";
import { registerCapabilitiesResource } from "./shared/capabilities-resource.js";
import { registerDocsSearch } from "./docs/docs-search.js";
import { registerConnectTools } from "./connect/register.js";

import { ApiClient } from "./shared/api-client.js";
import { getBearerToken, getApiUrl, CONFIG_PATH_DISPLAY } from "./shared/config.js";
import { checkApiConnectivity } from "./shared/api-health.js";
import { formatSuccess, formatError, ok, err } from "./shared/formatters.js";
import {
  validateFilespaceName,
  validateEmail,
  validateGroupName,
} from "./shared/validators.js";

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
  { name: "lucidlink-api", version: "2.5.4" },
  { instructions: `LucidLink API server — single MCP server for the entire LucidLink API surface (Admin + Connect).

The LucidLink API runs as a self-hosted Docker container (lucidlink/lucidlink-api on DockerHub).
Configure the API URL via LUCIDLINK_API_URL env var (default: http://localhost:3003/api/v1).
Set your bearer token via LUCIDLINK_BEARER_TOKEN env var or in ~/.lucidlink/mcp-config.json.

ADMIN — filespaces, members, groups, permissions, service accounts.
CANONICAL CRUD FLOW: every resource returns IDs from create/list operations. Always start with
list_* to discover IDs before calling get_*, update_*, delete_*, grant_*, or revoke_*. All IDs
are UUIDs.

Key admin workflows:
- Set up a filespace: list_providers → create_filespace → add_member → create_group → add_member_to_group → grant_permission
- Manage access: list_members/list_groups to find IDs, then grant_permission/update_permission/revoke_permission
- add_member_to_group is the batch endpoint (PUT /groups/members) — use it for adding one or many members
- Service accounts (collaborators): create_service_account → returns the bearer token ONCE in the same response. Use the SERVICE ACCOUNT id (not the identity id) as principalId in grant_permission. Rotate keys with create_identity / delete_identity without recreating the account.

CONNECT — link existing external files into filespaces as read-only entries (no copy).
Two kinds of external entry: SingleObjectFile (S3 via a Data Store) and HttpLinkFile (any
HTTP/HTTPS URL, no Data Store; requires API v1.4.3+). Use get_connect_workflow_guide for the
complete reference.

Typical S3 workflow:    create_data_store → ensure_folder_path → bulk_import_s3_objects.
Typical HTTP workflow:  ensure_folder_path → link_http_file (or bulk_link_http_files).
URL rotation for HTTP links: update_http_link_url.

Use create_connect_ui when the user asks to create, generate, build, or launch a Connect UI —
always use it instead of building a UI manually.

For questions about the API (authentication, deployment, best practices, scaling): use search_api_docs` },
);

registerBrandResource(server);
registerCapabilitiesResource(server);
registerDocsSearch(server);
registerConnectTools(server, { getClient, ensureReady });

// ── API Connection ──

server.tool(
  "check_api_connection",
  "Check connectivity to the LucidLink API. Returns status, endpoint URL, and configuration details.",
  {},
  async () => {
    const apiUrl = getApiUrl();
    const result = await checkApiConnectivity();
    if (result.ok) {
      return ok(formatSuccess("API Connection", { status: "Connected", endpoint: apiUrl }));
    }
    return err(result.error ?? "API is not reachable.");
  },
);

// ── Filespace Management ──

server.tool(
  "create_filespace",
  "Create a new LucidLink filespace. Returns the filespace ID and details.",
  {
    name: z.string().describe("Name (3-63 chars, alphanumeric with hyphens/underscores)"),
    region: z.string().optional().describe("Storage region (e.g. us-east-1)"),
    storage_provider: z.string().optional().describe("Storage provider (AWS, Azure, GCP, Wasabi)"),
  },
  async ({ name, region, storage_provider }) => {
    const v = validateFilespaceName(name);
    if (!v.ok) return err(formatError("Create Filespace", v.error));

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Filespace", startErr));

    const res = await getClient().createFilespace(v.value, region ?? "us-east-1", storage_provider ?? "AWS");
    return res.success
      ? ok(formatSuccess(`Created filespace '${v.value}'`, res.data ?? {}))
      : err(formatError("Create Filespace", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_filespaces",
  "List all filespaces in the workspace. Returns name, ID, region, and status for each.",
  {},
  async () => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Filespaces", startErr));

    const res = await getClient().listFilespaces();
    if (!res.success) return err(formatError("List Filespaces", res.error ?? "Unknown error"));

    const filespaces = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (filespaces.length === 0) return ok("No filespaces found in this workspace.");

    const list = filespaces.map((fs) => {
      const storage = fs.storage as Record<string, unknown> | undefined;
      return `- ${fs.name ?? "Unknown"} (ID: ${fs.id ?? "N/A"}, Region: ${storage?.region ?? "N/A"}, Status: ${fs.status ?? "N/A"})`;
    }).join("\n");
    return ok(`Found ${filespaces.length} filespace(s):\n\n${list}`);
  },
);

server.tool(
  "get_filespace_details",
  "Get full details for a filespace by ID — name, status, storage config, creation date, and usage stats.",
  { filespace_id: z.string().describe("ID of the filespace") },
  async ({ filespace_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Filespace Details", startErr));

    const res = await getClient().getFilespace(filespace_id);
    return res.success
      ? ok(formatSuccess("Filespace Details", res.data ?? {}))
      : err(formatError("Get Filespace Details", res.error ?? "Unknown error"));
  },
);

server.tool(
  "update_filespace",
  "Rename a filespace.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    name: z.string().describe("New name"),
  },
  async ({ filespace_id, name }) => {
    const v = validateFilespaceName(name);
    if (!v.ok) return err(formatError("Update Filespace", v.error));

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update Filespace", startErr));

    const res = await getClient().updateFilespace(filespace_id, v.value);
    return res.success
      ? ok(formatSuccess("Renamed Filespace", res.data ?? {}))
      : err(formatError("Update Filespace", res.error ?? "Unknown error"));
  },
);

server.tool(
  "delete_filespace",
  "Permanently delete a filespace and all its data. This cannot be undone. Requires confirm=true.",
  {
    filespace_id: z.string().describe("ID of the filespace to delete"),
    confirm: z.boolean().describe("Must be true to proceed"),
  },
  async ({ filespace_id, confirm }) => {
    if (!confirm) return err("Deletion not confirmed. Set confirm=true to proceed. This action is permanent!");

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Filespace", startErr));

    const res = await getClient().deleteFilespace(filespace_id);
    return res.success
      ? ok(formatSuccess("Deleted Filespace", { filespace_id }))
      : err(formatError("Delete Filespace", res.error ?? "Unknown error"));
  },
);

// ── Member Management ──

server.tool(
  "add_member",
  "Invite a user to the workspace by email. Returns member ID, status (pending/active), and an invitation link if applicable.",
  { email: z.string().describe("Email address of the member") },
  async ({ email }) => {
    const v = validateEmail(email);
    if (!v.ok) return err(formatError("Add Member", v.error));

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Add Member", startErr));

    const res = await getClient().addMember(v.value);
    if (!res.success) return err(formatError("Add Member", res.error ?? "Unknown error"));

    const memberData = (res.data as Record<string, unknown>)?.data as Record<string, unknown> ?? {};
    const user = memberData.user as Record<string, unknown> | undefined;
    const memberEmail = user?.email ?? v.value;
    const status = memberData.status ?? "unknown";
    const inviteLink = memberData.pendingInvitationLinkSecret as string | undefined;

    return ok(formatSuccess("Add Member", { email: memberEmail, status, inviteLink }));
  },
);

server.tool(
  "list_members",
  "List all workspace members. Returns email, status (active/pending), and member ID for each.",
  { email: z.string().optional().describe("Optional email filter") },
  async ({ email }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Members", startErr));

    const res = await getClient().listMembers(email);
    if (!res.success) return err(formatError("List Members", res.error ?? "Unknown error"));

    const members = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (members.length === 0) return ok("No members found in this workspace.");

    const list = members.map((m) => {
      const user = m.user as Record<string, unknown> | undefined;
      return `- ${user?.email ?? "Unknown"} — ${String(m.status ?? "unknown").toUpperCase()} (ID: ${m.id ?? "N/A"})`;
    }).join("\n");
    return ok(`Found ${members.length} member(s):\n\n${list}`);
  },
);

server.tool(
  "get_member_details",
  "Get full details for a member by ID — email, role, status, creation date, and group memberships.",
  { member_id: z.string().describe("ID of the member") },
  async ({ member_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Member Details", startErr));

    const res = await getClient().getMember(member_id);
    if (!res.success) return err(formatError("Get Member Details", res.error ?? "Unknown error"));

    const data = (res.data as Record<string, unknown>)?.data ?? res.data;
    return ok(formatSuccess("Member Details", data as Record<string, unknown>));
  },
);

server.tool(
  "remove_member",
  "Remove a member from the workspace entirely. This revokes all their permissions and group memberships.",
  { member_id: z.string().describe("ID of the member to remove") },
  async ({ member_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Remove Member", startErr));

    const res = await getClient().removeMember(member_id);
    return res.success
      ? ok(formatSuccess("Removed Member", { member_id }))
      : err(formatError("Remove Member", res.error ?? "Unknown error"));
  },
);

server.tool(
  "update_member_role",
  "Change a member's workspace role.",
  {
    member_id: z.string().describe("ID of the member"),
    role: z.enum(["admin", "filespaceAdmin", "standard"]).describe(
      "admin = full access, filespaceAdmin = manages specific filespaces (requires filespace_ids), standard = default",
    ),
    filespace_ids: z.array(z.string()).optional().describe("Required for filespaceAdmin: filespace IDs to manage"),
  },
  async ({ member_id, role, filespace_ids }) => {
    if (role === "filespaceAdmin" && (!filespace_ids || filespace_ids.length === 0)) {
      return err(formatError("Update Member Role", "filespace_ids is required when setting role to filespaceAdmin"));
    }

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update Member Role", startErr));

    const res = await getClient().updateMemberRole(member_id, role, filespace_ids);
    return res.success
      ? ok(formatSuccess(`Updated member role to '${role}'`, res.data ?? {}))
      : err(formatError("Update Member Role", res.error ?? "Unknown error"));
  },
);

server.tool(
  "get_member_groups",
  "List all groups a member belongs to. Returns group name, ID, and member count for each.",
  { member_id: z.string().describe("ID of the member") },
  async ({ member_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Member Groups", startErr));

    const res = await getClient().getMemberGroups(member_id);
    if (!res.success) return err(formatError("Get Member Groups", res.error ?? "Unknown error"));

    const groups = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (groups.length === 0) return ok("Member does not belong to any groups.");

    const list = groups.map((g) =>
      `- ${g.name ?? "Unknown"} (ID: ${g.id ?? "N/A"}, members: ${g.memberCount ?? "?"})`,
    ).join("\n");
    return ok(`Member belongs to ${groups.length} group(s):\n\n${list}`);
  },
);

// ── Group Management ──

server.tool(
  "create_group",
  "Create a new group for organizing members. Returns the group ID.",
  {
    name: z.string().describe("Name for the new group"),
    description: z.string().optional().describe("Optional group description"),
  },
  async ({ name, description }) => {
    const v = validateGroupName(name);
    if (!v.ok) return err(formatError("Create Group", v.error));

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Group", startErr));

    const res = await getClient().createGroup(v.value, description ?? "");
    return res.success
      ? ok(formatSuccess(`Created group '${v.value}'`, res.data ?? {}))
      : err(formatError("Create Group", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_groups",
  "List all groups in the workspace. Returns group name and ID for each. Optionally filter by name.",
  { name: z.string().optional().describe("Optional name filter") },
  async ({ name }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Groups", startErr));

    const res = await getClient().listGroups(name);
    if (!res.success) return err(formatError("List Groups", res.error ?? "Unknown error"));

    const groups = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (groups.length === 0) return ok("No groups found in this workspace.");

    const list = groups.map((g) => `- ${g.name ?? "Unknown"} (ID: ${g.id ?? "N/A"})`).join("\n");
    return ok(`Found ${groups.length} group(s):\n\n${list}`);
  },
);

server.tool(
  "get_group",
  "Get full details for a group by ID — name, description, member count, and creation date.",
  { group_id: z.string().describe("ID of the group") },
  async ({ group_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Group", startErr));

    const res = await getClient().getGroup(group_id);
    return res.success
      ? ok(formatSuccess("Group Details", res.data ?? {}))
      : err(formatError("Get Group", res.error ?? "Unknown error"));
  },
);

server.tool(
  "update_group",
  "Rename a group.",
  {
    group_id: z.string().describe("ID of the group"),
    name: z.string().describe("New name for the group"),
  },
  async ({ group_id, name }) => {
    const v = validateGroupName(name);
    if (!v.ok) return err(formatError("Update Group", v.error));

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update Group", startErr));

    const res = await getClient().updateGroup(group_id, v.value);
    return res.success
      ? ok(formatSuccess(`Renamed group to '${v.value}'`, res.data ?? {}))
      : err(formatError("Update Group", res.error ?? "Unknown error"));
  },
);

server.tool(
  "delete_group",
  "Delete a group from the workspace. Members are NOT removed from the workspace, only from this group. Requires confirm=true.",
  {
    group_id: z.string().describe("ID of the group to delete"),
    confirm: z.boolean().describe("Must be true to proceed"),
  },
  async ({ group_id, confirm }) => {
    if (!confirm) return err("Deletion not confirmed. Set confirm=true to proceed.");

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Group", startErr));

    const res = await getClient().deleteGroup(group_id);
    return res.success
      ? ok(formatSuccess("Deleted Group", { group_id }))
      : err(formatError("Delete Group", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_group_members",
  "List all members in a group. Returns email, status, and member ID for each.",
  { group_id: z.string().describe("ID of the group") },
  async ({ group_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Group Members", startErr));

    const res = await getClient().listGroupMembers(group_id);
    if (!res.success) return err(formatError("List Group Members", res.error ?? "Unknown error"));

    const members = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (members.length === 0) return ok("No members in this group.");

    const list = members.map((m) => {
      const user = m.user as Record<string, unknown> | undefined;
      return `- ${user?.email ?? "Unknown"} — ${String(m.status ?? "unknown").toUpperCase()} (ID: ${m.id ?? "N/A"})`;
    }).join("\n");
    return ok(`${members.length} member(s) in group:\n\n${list}`);
  },
);

server.tool(
  "add_member_to_group",
  "Add a member to a group. Uses the batch membership endpoint (PUT /groups/members).",
  {
    group_id: z.string().describe("ID of the group"),
    member_id: z.string().describe("ID of the member to add"),
  },
  async ({ group_id, member_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Add Member to Group", startErr));

    const res = await getClient().addMemberToGroup(group_id, member_id);
    return res.success
      ? ok(formatSuccess("Added Member to Group", { group_id, member_id }))
      : err(formatError("Add Member to Group", res.error ?? "Unknown error"));
  },
);

server.tool(
  "remove_member_from_group",
  "Remove a member from a group. The member remains in the workspace but loses group-based permissions.",
  {
    group_id: z.string().describe("ID of the group"),
    member_id: z.string().describe("ID of the member to remove"),
  },
  async ({ group_id, member_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Remove Member from Group", startErr));

    const res = await getClient().removeMemberFromGroup(group_id, member_id);
    return res.success
      ? ok(formatSuccess("Removed Member from Group", { group_id, member_id }))
      : err(formatError("Remove Member from Group", res.error ?? "Unknown error"));
  },
);

// ── Permission Management ──

server.tool(
  "grant_permission",
  "Grant folder-level permissions to a member or group on a filespace. Specify a path to scope the permission to a subdirectory.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    principal_id: z.string().describe("Member ID or group ID"),
    permissions: z.array(z.enum(["read", "write"])).optional().describe("Default: ['read']"),
    path: z.string().optional().describe("Path within filespace (default: /)"),
  },
  async ({ filespace_id, principal_id, permissions, path }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Grant Permission", startErr));

    const res = await getClient().grantPermission(filespace_id, principal_id, permissions ?? ["read"], path ?? "/");
    return res.success
      ? ok(formatSuccess("Granted Permissions", res.data ?? {}))
      : err(formatError("Grant Permission", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_permissions",
  "List all permission entries for a filespace. Returns principal ID, permission levels, and path for each.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    principal_id: z.string().optional().describe("Filter by member or group ID"),
    limit: z.number().optional().describe("Maximum results to return"),
    next_cursor: z.string().optional().describe("Pagination cursor from previous response"),
  },
  async ({ filespace_id, principal_id, limit, next_cursor }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Permissions", startErr));

    const res = await getClient().listPermissions(filespace_id, {
      principalId: principal_id,
      limit,
      nextCursor: next_cursor,
    });
    if (!res.success) return err(formatError("List Permissions", res.error ?? "Unknown error"));

    const perms = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (perms.length === 0) return ok("No permissions set for this filespace.");

    const list = perms.map((p) =>
      `- ${p.principalId ?? "Unknown"} — ${JSON.stringify(p.permissions ?? [])} on ${p.path ?? "/"} (ID: ${p.id ?? "N/A"})`,
    ).join("\n");
    return ok(`Permissions for filespace:\n\n${list}`);
  },
);

server.tool(
  "update_permission",
  "Change the permission level(s) on an existing permission entry.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    permission_id: z.string().describe("ID of the permission to update"),
    permissions: z.array(z.enum(["read", "write"])).describe("New permissions"),
  },
  async ({ filespace_id, permission_id, permissions }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Update Permission", startErr));

    const res = await getClient().updatePermission(filespace_id, permission_id, permissions);
    return res.success
      ? ok(formatSuccess("Updated Permission", res.data ?? {}))
      : err(formatError("Update Permission", res.error ?? "Unknown error"));
  },
);

server.tool(
  "revoke_permission",
  "Remove a permission entry from a filespace. The member/group will lose the access granted by this entry.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    permission_id: z.string().describe("ID of the permission to revoke"),
  },
  async ({ filespace_id, permission_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Revoke Permission", startErr));

    const res = await getClient().revokePermission(filespace_id, permission_id);
    return res.success
      ? ok(formatSuccess("Revoked Permission", { filespace_id, permission_id }))
      : err(formatError("Revoke Permission", res.error ?? "Unknown error"));
  },
);

// ── Direct Links ──

server.tool(
  "generate_direct_link",
  "Generate a shareable direct link to a file or folder in a filespace. Provide exactly one of entry_id or path — not both.",
  {
    filespace_id: z.string().describe("ID of the filespace"),
    entry_id: z.string().optional().describe("Entry ID of the file or folder (alternative to path)"),
    path: z.string().optional().describe("Absolute path to the file or folder (alternative to entry_id)"),
  },
  async ({ filespace_id, entry_id, path }) => {
    if (entry_id && path) {
      return err(formatError("Generate Direct Link", "Provide exactly one of entry_id or path, not both."));
    }
    if (!entry_id && !path) {
      return err(formatError("Generate Direct Link", "Provide either entry_id or path."));
    }

    const startErr = await ensureReady();
    if (startErr) return err(formatError("Generate Direct Link", startErr));

    const res = await getClient().generateDirectLink(filespace_id, { entryId: entry_id, path });
    if (!res.success) return err(formatError("Generate Direct Link", res.error ?? "Unknown error"));

    const data = (res.data as Record<string, unknown>)?.data as Record<string, unknown> ?? res.data;
    const url = data?.url as string | undefined;
    if (url) {
      return ok(`Direct link generated:\n\n${url}`);
    }
    return ok(formatSuccess("Direct Link", data as Record<string, unknown>));
  },
);

// ── Service Management ──

server.tool(
  "check_api_health",
  "Lightweight health check — returns whether the API is responding to requests.",
  {},
  async () => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("API Health Check", startErr));

    const res = await getClient().getHealth();
    return res.success
      ? ok(formatSuccess("API Health Check", { status: "Healthy", endpoint: getApiUrl() }))
      : err(formatError("API Health Check", res.error ?? "Unknown error"));
  },
);

server.tool(
  "list_providers",
  "List available cloud storage providers (AWS, Azure, GCP, Wasabi).",
  {},
  async () => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Providers", startErr));

    const res = await getClient().listProviders();
    if (!res.success) return err(formatError("List Providers", res.error ?? "Unknown error"));

    const providers = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (providers.length === 0) return ok("No storage providers found.");

    const list = providers.map((p) => `- ${p.name ?? "Unknown"} — ${p.description ?? "No description"}`).join("\n");
    return ok(`Available Storage Providers:\n\n${list}`);
  },
);

// ── Service Accounts (Collaborators) ──
//
// Service accounts are the authentication principal for programmatic API access.
// Identities are rotatable bearer tokens for a service account. When granting
// filespace permissions to a service account, use the SERVICE ACCOUNT id as
// principalId — never the identity id.
//
// Tokens are returned ONLY at identity creation time and cannot be retrieved
// again. The create_* tools surface this clearly so the user knows to capture
// the token immediately.

server.tool(
  "create_service_account",
  "Create a service account (collaborator) and an initial identity (bearer token). The token is returned ONLY in this response — it cannot be retrieved later. Optionally control the initial identity's expiration or single-use behavior.",
  {
    name: z.string().describe("Human-readable name for the service account, e.g. 'ci-deploy-bot'"),
    is_single_use: z.boolean().optional().describe("If true, the initial identity becomes invalid after its first successful use. Default false."),
    expires_at: z.string().optional().describe("ISO-8601 timestamp at which the initial identity expires, e.g. '2026-12-31T23:59:59.000Z'. Omit for a non-expiring key."),
  },
  async ({ name, is_single_use, expires_at }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Service Account", startErr));

    const identity = (is_single_use !== undefined || expires_at !== undefined)
      ? { isSingleUse: is_single_use, expiresAt: expires_at }
      : undefined;

    const res = await getClient().createServiceAccount(name, identity);
    if (!res.success) return err(formatError("Create Service Account", res.error ?? "Unknown error"));

    const data = (res.data as Record<string, unknown>)?.data as Record<string, unknown> ?? {};
    const serviceIdentity = (data.serviceIdentity as Record<string, unknown>) ?? {};
    const token = serviceIdentity.token as string | undefined;

    let msg = formatSuccess("Service Account Created", {
      serviceAccountId: data.id,
      name: data.name,
      createdAt: data.createdAt,
      identityId: serviceIdentity.id,
      expiresAt: serviceIdentity.expiresAt,
      isSingleUse: serviceIdentity.isSingleUse,
    });

    if (token) {
      msg += `\n\n⚠️  TOKEN (returned only once — store it now):\n${token}\n`;
      msg += `\nAuth header: Authorization: Bearer ${token}\n`;
      msg += `\nUse the serviceAccountId (${data.id}) as principalId when granting filespace permissions.`;
    }
    return ok(msg);
  },
);

server.tool(
  "list_service_accounts",
  "List all service accounts (collaborators) in the workspace. Returns id, name, and createdAt for each. Tokens are never included.",
  {},
  async () => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Service Accounts", startErr));

    const res = await getClient().listServiceAccounts();
    if (!res.success) return err(formatError("List Service Accounts", res.error ?? "Unknown error"));

    const accounts = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (accounts.length === 0) return ok("No service accounts found.");

    const list = accounts.map((a) =>
      `- ${a.name ?? "(unnamed)"} (ID: ${a.id ?? "N/A"}, created: ${a.createdAt ?? "?"})`
    ).join("\n");
    return ok(`Service Accounts:\n\n${list}`);
  },
);

server.tool(
  "get_service_account",
  "Retrieve a service account by ID. Returns id, name, and createdAt.",
  {
    service_account_id: z.string().describe("Service account UUID (from list_service_accounts)"),
  },
  async ({ service_account_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Get Service Account", startErr));

    const res = await getClient().getServiceAccount(service_account_id);
    if (!res.success) return err(formatError("Get Service Account", res.error ?? "Unknown error"));

    const data = (res.data as Record<string, unknown>)?.data as Record<string, unknown> ?? {};
    return ok(formatSuccess("Service Account", data));
  },
);

server.tool(
  "delete_service_account",
  "Permanently delete a service account and revoke all of its identities (bearer tokens). This action cannot be undone — any code using a token from this account will lose access immediately.",
  {
    service_account_id: z.string().describe("Service account UUID to delete"),
  },
  async ({ service_account_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Service Account", startErr));

    const res = await getClient().deleteServiceAccount(service_account_id);
    if (!res.success) return err(formatError("Delete Service Account", res.error ?? "Unknown error"));
    return ok(formatSuccess("Service Account Deleted", { serviceAccountId: service_account_id }));
  },
);

server.tool(
  "create_identity",
  "Issue a new bearer token (identity) for an existing service account. Use to rotate keys, add environment-specific keys, or generate one-shot bootstrap tokens. The token is returned ONLY in this response — store it immediately, it cannot be retrieved again.",
  {
    service_account_id: z.string().describe("Parent service account UUID"),
    is_single_use: z.boolean().optional().describe("If true, the identity becomes invalid after its first successful use. Useful for one-shot bootstrap flows. Default false."),
    expires_at: z.string().optional().describe("ISO-8601 timestamp at which the identity expires, e.g. '2026-12-31T23:59:59.000Z'. Omit for a non-expiring key."),
  },
  async ({ service_account_id, is_single_use, expires_at }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Create Identity", startErr));

    const res = await getClient().createIdentity(service_account_id, {
      isSingleUse: is_single_use,
      expiresAt: expires_at,
    });
    if (!res.success) return err(formatError("Create Identity", res.error ?? "Unknown error"));

    const data = (res.data as Record<string, unknown>)?.data as Record<string, unknown> ?? {};
    const token = data.token as string | undefined;

    let msg = formatSuccess("Identity Created", {
      identityId: data.id,
      status: data.status,
      isSingleUse: data.isSingleUse,
      expiresAt: data.expiresAt,
    });
    if (token) {
      msg += `\n\n⚠️  TOKEN (returned only once — store it now):\n${token}\n`;
      msg += `\nAuth header: Authorization: Bearer ${token}`;
    }
    return ok(msg);
  },
);

server.tool(
  "list_identities",
  "List all identities (bearer tokens) for a service account. Returns id, status, expiration, single-use flag, and lastUsedAt for each. Tokens themselves are never returned by this endpoint.",
  {
    service_account_id: z.string().describe("Parent service account UUID"),
  },
  async ({ service_account_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("List Identities", startErr));

    const res = await getClient().listIdentities(service_account_id);
    if (!res.success) return err(formatError("List Identities", res.error ?? "Unknown error"));

    const identities = (res.data as Record<string, unknown>)?.data as Record<string, unknown>[] ?? [];
    if (identities.length === 0) return ok(`No identities found for service account ${service_account_id}.`);

    const list = identities.map((i) =>
      `- ID ${i.id ?? "N/A"}: status=${i.status ?? "?"}, isSingleUse=${i.isSingleUse ?? false}, expiresAt=${i.expiresAt ?? "never"}, lastUsedAt=${i.lastUsedAt ?? "never"}`
    ).join("\n");
    return ok(`Identities for ${service_account_id}:\n\n${list}`);
  },
);

server.tool(
  "delete_identity",
  "Revoke a specific identity (bearer token) of a service account. Use this to rotate a leaked or stale key without removing the parent service account. The revocation is immediate.",
  {
    service_account_id: z.string().describe("Parent service account UUID"),
    identity_id: z.string().describe("Identity UUID to revoke (from list_identities)"),
  },
  async ({ service_account_id, identity_id }) => {
    const startErr = await ensureReady();
    if (startErr) return err(formatError("Delete Identity", startErr));

    const res = await getClient().deleteIdentity(service_account_id, identity_id);
    if (!res.success) return err(formatError("Delete Identity", res.error ?? "Unknown error"));
    return ok(formatSuccess("Identity Revoked", { serviceAccountId: service_account_id, identityId: identity_id }));
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
