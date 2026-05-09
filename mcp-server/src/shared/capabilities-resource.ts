/**
 * LucidLink MCP capabilities guide — registered as a resource on every server.
 * Gives Claude Desktop a complete map of what's available, how the pieces
 * connect, and how to use them correctly.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const CAPABILITIES_GUIDE = `LucidLink MCP — Complete Capabilities Guide
=============================================

You have access to 6 MCP servers that together manage LucidLink filespaces.
The lucidlink-api and lucidlink-connect-api servers connect to a LucidLink API instance.
Read this guide before taking action — it will save you from mistakes.

ARCHITECTURE
============
                                    ┌─ lucidlink-api (57 tools — Admin + Connect)
  Claude Desktop ──► MCP servers ───┼─ lucidlink-filespace (5 tools)
                                    ├─ lucidlink-audit-trail (14 tools)
                                    └─ lucidlink-python-sdk (1 tool + 11 resources)
                                          │
                          LucidLink API ◄──┘  (Docker: lucidlink/lucidlink-api)
                          fs-index-server ◄── (localhost:3201, Go binary)
                          OpenSearch ◄─────── (localhost:9200, Docker)

CONFIGURATION:
  LUCIDLINK_API_URL         — API endpoint (default: http://localhost:3003/api/v1)
  LUCIDLINK_BEARER_TOKEN    — Authentication token
  ~/.lucidlink/mcp-config.json — Optional config file (apiUrl, bearerToken, fsIndexPort)

The LucidLink API is deployed as a self-hosted Docker container (lucidlink/lucidlink-api
on DockerHub). See search_api_docs for deployment, scaling, and best practices.

lucidlink-api covers both administration (filespaces, members, groups, permissions, service
accounts) and Connect (S3 data stores, external entries, HTTP link files) — they share the
same API container.
The fs-index-server is a separate Go binary managed by lucidlink-filespace.

IMPORTANT RULES
===============
- NEVER rewrite or replace the Go binary (fs-index-server) — it is a compiled,
  tested backend with SQLite FTS5 search. If it fails, diagnose the error.
- NEVER build a search backend in Python, FastAPI, or any other language.
- NEVER use fonts other than Inter (body) and IBM Plex Mono (monospace).
  Read the lucidlink://brand/design-tokens resource for full brand guidelines.
- ALWAYS use existing tools. Do not build custom scripts for tasks the tools handle.
- When generating any UI, use dark theme (#151519 background, white text, #B0FB15 accent).

SERVER 1: lucidlink-api (Admin + Connect)
==========================================
Single MCP server covering the full LucidLink API — administration (filespaces, members,
groups, permissions, service accounts) and Connect (data stores, external entries,
HTTP link files). Backed by the LucidLink API container at :3003.

Connection:
  check_api_connection      — verify API connectivity and configuration
  check_api_health          — lightweight health check
  list_providers            — list cloud storage providers

Filespace CRUD:
  create_filespace          — create a new filespace (needs name, provider, region)
  list_filespaces           — list all filespaces
  get_filespace_details     — get details for one filespace by ID
  update_filespace          — update filespace settings
  delete_filespace          — delete a filespace by ID

Member management:
  add_member                — invite user by email to a filespace
  list_members              — list all members of a filespace
  get_member_details        — get details for one member
  remove_member             — remove a member from a filespace
  update_member_role        — change a member's role (admin, contributor, viewer)
  get_member_groups         — list groups a member belongs to

Group management:
  create_group              — create a group in a filespace
  list_groups               — list all groups in a filespace
  get_group                 — get group details
  update_group              — rename a group
  delete_group              — delete a group
  list_group_members        — list members in a group
  add_member_to_group       — add a member to a group (batch endpoint, works for one or many)
  remove_member_from_group  — remove a member from a group

Permissions:
  grant_permission          — grant folder permission to a user, group, or service account
  list_permissions          — list permissions on a filespace
  update_permission         — change permission level
  revoke_permission         — remove a permission

Service accounts (collaborators):
  create_service_account    — create a service account + initial bearer token (token shown ONCE)
  list_service_accounts     — list all service accounts in the workspace
  get_service_account       — get service account details by ID
  delete_service_account    — delete a service account and revoke all its identities
  create_identity           — issue a new bearer token for an existing service account
  list_identities           — list all identities (token metadata) for a service account
  delete_identity           — revoke a specific identity (rotate keys without recreating account)

  Note: when granting filespace permissions, use the SERVICE ACCOUNT id as principalId,
  NOT the identity id. Identities are just rotatable credentials for a service account.

Direct links:
  generate_direct_link      — generate a shareable URL for a file or folder

Documentation search:
  search_api_docs           — search across all LucidLink API documentation

Resources:
  lucidlink://docs/index    — index of all documentation topics
  lucidlink://docs/{topic}  — individual doc topics

Example workflow — set up a new filespace:
  1. list_providers → get provider ID
  2. create_filespace → get filespace ID
  3. add_member (for each user) → get member IDs
  4. create_group → get group ID
  5. add_member_to_group → assign members
  6. grant_permission → set folder access

Connect tools (link external files into filespaces, read-only):
  Workflow guide:
    get_connect_workflow_guide — full quickstart and reference (call this first)

  UI generation:
    create_connect_ui         — generates a complete web app for S3 browsing/importing
                                Do NOT build UIs manually — always use this tool.

  High-level tools (recommended):
    ensure_folder_path        — create nested directory structure in one call
    import_s3_object          — create dirs + link one S3 object
    bulk_import_s3_objects    — create dirs + link many objects with progress
    link_http_file            — create dirs + link one HTTP/HTTPS URL (no Data Store)
    bulk_link_http_files      — create dirs + link many HTTP URLs

  Primitive API tools:
    create_entry, resolve_entry, get_entry, delete_entry, list_entry_children
    create_data_store, list_data_stores, get_data_store, update_data_store, delete_data_store
    create_external_entry, list_external_entry_ids, delete_external_entry
    create_http_link, update_http_link_url

SERVER 2: lucidlink-filespace (search + index)
===============================================
Runs a Go backend (fs-index-server) that crawls mounted filespaces and provides
full-text search via SQLite FTS5. The only UI generator on this server is
create_search_ui — there is no separate "browser" tool.

Tools:
  start_filespace_indexer, search_filespace, browse_filespace, indexer_status,
  create_search_ui

Resource:
  lucidlink://search/api-reference — Complete REST API reference for fs-index-server.

SERVER 3: lucidlink-audit-trail (file operation analytics)
============================================================
Manages the audit trail Docker Compose stack (OpenSearch + Dashboards + Fluent Bit).

Tools:
  discover_filespace_mounts, setup_audit_trail, start_audit_trail, stop_audit_trail,
  audit_trail_status, query_audit_events (mode: search | user_activity | file_history | aggregate),
  run_opensearch_query, create_audit_alert, list_audit_alerts,
  delete_audit_alert, setup_slack_webhook, get_audit_trail_schema, create_audit_dashboard

SERVER 4: lucidlink-python-sdk (Python SDK documentation)
============================================================
Searchable documentation for the LucidLink Python SDK.

Tools:
  lucidlink_sdk_search      — search SDK docs by keyword

Resources:
  lucidlink-sdk://docs/{topic} — 9 documentation sections covering daemon lifecycle,
    file I/O, Connect, fsspec, models, examples, and performance

WHEN TO USE WHICH SERVER
========================
"List my filespaces"              → lucidlink-api: list_filespaces
"Add a user to the marketing fs"  → lucidlink-api: add_member
"Search for quarterly reports"    → lucidlink-filespace: start_filespace_indexer + search_filespace
"Build me a search app"           → lucidlink-filespace: create_search_ui
"Link S3 objects into a filespace"→ lucidlink-api: get_connect_workflow_guide
"Set up audit trail dashboard"   → lucidlink-audit-trail: setup_audit_trail + start_audit_trail
"How do I use the Python SDK?"   → lucidlink-python-sdk: lucidlink_sdk_search

GENERATING UIs
==============
When asked to create any UI, dashboard, or web interface:
1. Check if a tool already generates it (create_connect_ui, create_search_ui, create_audit_dashboard)
2. If yes, USE THAT TOOL — do not build from scratch
3. If you must generate custom UI, read lucidlink://brand/design-tokens first
4. Use: Inter font, dark theme (#151519), neon accent (#B0FB15), sentence case
5. Never use: DM Sans, Aeonik, system fonts, title case, right-aligned text, FastAPI`;

export function registerCapabilitiesResource(server: McpServer): void {
  server.resource(
    "capabilities-guide",
    "lucidlink://guide/capabilities",
    {
      description: "Complete guide to all LucidLink MCP capabilities — servers, tools, workflows, and rules. READ THIS FIRST before taking any action.",
      mimeType: "text/plain",
    },
    async () => ({
      contents: [{
        uri: "lucidlink://guide/capabilities",
        text: CAPABILITIES_GUIDE,
      }],
    }),
  );
}
