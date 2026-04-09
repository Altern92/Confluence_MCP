# Confluence MCP Server

Basic MCP server starter for scoped Confluence search and page retrieval.

## Read-only policy

This MCP server is intentionally read-only from the client perspective.

- all public MCP tools only read Confluence data
- no Confluence create, update, delete, move, or restriction-mutation tools are planned
- sync, indexing, and reindex logic are internal server mechanisms only
- internal sync may update local server state, but it must not write back to Confluence

Detailed operating documents:

- `docs/operations/API-KEY-GOVERNANCE.md`
- `docs/deployment/UBUNTU-DEPLOY.md`
- `docs/retrieval/RAG-RULES-FOR-THIS-SERVER.md`
- `docs/security/READ-ONLY-POLICY.md`
- `docs/security/THREAT-MODEL.md`
- `docs/security/AUDIT-AND-RETENTION.md`
- `docs/operations/DASHBOARDS-AND-ALERTS.md`
- `docs/operations/INCIDENT-RUNBOOK.md`
- `docs/releases/RELEASE-PROCESS.md`

## What works today

- `confluence.search`
  - keyword search via Confluence CQL
  - optional `semantic` and `hybrid` retrieval when semantic indexing is enabled
  - scope enforcement for `page`, `page_tree`, and `space`
  - structured results with citations, snippets, `sectionPath`, `retrievedAt`, ranking debug metadata, and RAG policy metadata
- `confluence.get_page`
  - fetches a single page body and metadata by `pageId`
- `confluence.get_page_tree`
  - lists descendant pages for a root page via CQL `ancestor`
- `confluence.get_page_ancestors`
  - fetches the ancestor chain for a page through the v2 ancestors endpoint
- `confluence.get_page_restrictions`
  - fetches normalized page content restrictions grouped by operation
- `confluence.get_page_descendants`
  - fetches descendant content through the v2 descendants endpoint
- `confluence.get_page_attachments`
  - fetches attachment metadata for a page through the v2 attachments endpoint
- pluggable local indexing storage
  - `memory` driver for ephemeral runs
  - `file` driver for durable local VS Code / workstation usage
- pluggable vector storage
  - `memory` driver for ephemeral semantic experiments
  - `file` driver for durable local workstation use
  - `postgres` driver for shared production-grade vector persistence via pgvector
- HTTP MCP endpoint
  - `POST /mcp` via Streamable HTTP
  - `GET /health` healthcheck
  - `GET /ready` readiness check
  - `GET /metrics` in-memory metrics snapshot
  - `GET /sync-status` internal sync diagnostics snapshot
  - compatible starting point for ChatGPT connector setup

## Deployment paths

Recommended deploy targets:

- local workstation / VS Code: `file` storage backend
- Ubuntu server: native `systemd` process or `nginx` + `systemd`
- shared production semantic backend: `postgres` + `pgvector`

Deployment references:

- `docs/deployment/UBUNTU-DEPLOY.md`
- `deploy/systemd/confluence-mcp.service.example`
- `deploy/nginx/confluence-mcp.conf.example`

## Current limitations

- default transport: `http`
- `stdio` kept only as an optional local fallback, not for ChatGPT connector use
- auth: Confluence API token only
- default retrieval mode: keyword
- optional semantic/hybrid retrieval via hash embeddings, with vector storage selectable across `memory`, `file`, or `postgres`
- sync worker is in-memory and process-local
- local index persistence is available through the file-backed storage driver
- shared vector persistence is available through the Postgres/pgvector driver, but shared document index and sync state stores are still local-only
- delete reconciliation depends on periodic full snapshot passes, not webhooks

## Project structure

- `src/http`
  - Express app, health/readiness, MCP endpoint, middleware
- `src/mcp`
  - MCP server wiring, tool registration, tool execution helpers
- `src/domain`
  - Confluence-facing business logic and result normalization
- `src/indexing`
  - indexing data model and heading-aware chunking scaffold
- `src/confluence`
  - upstream API client, pagination, CQL, formatting, error handling
- `src/logging`
  - structured stderr logging and request context propagation
- `src/runtime`
  - startup and server bootstrapping

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:

```env
APP_ENV=development
MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=3000
MCP_ALLOWED_HOSTS=localhost,127.0.0.1
MCP_API_KEY=replace-me-for-shared-http
MCP_NEXT_API_KEY=
METRICS_ENABLED=true
MCP_MAX_REQUEST_BODY_BYTES=262144
HTTP_REQUEST_TIMEOUT_MS=30000
CONFLUENCE_BASE_URL=https://your-site.atlassian.net
CONFLUENCE_EMAIL=your-account@company.com
CONFLUENCE_API_TOKEN=your-api-token
CONFLUENCE_ALLOWED_SPACE_KEYS=
CONFLUENCE_ALLOWED_ROOT_PAGE_IDS=
INDEXING_TENANT_ID=
INDEXING_STORAGE_DRIVER=file
INDEXING_STORAGE_PATH=.data/indexing
INDEXING_CHUNK_MAX_CHARS=1200
INDEXING_CHUNK_OVERLAP_CHARS=150
INDEXING_SYNC_ENABLED=false
INDEXING_SYNC_POLL_INTERVAL_MS=300000
INDEXING_SYNC_SPACE_KEYS=
INDEXING_SYNC_MAX_PAGES_PER_SPACE=500
INDEXING_SYNC_RUN_ON_STARTUP=true
INDEXING_SYNC_FULL_RECONCILE_ENABLED=false
INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS=12
INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP=false
INDEXING_SEMANTIC_ENABLED=true
INDEXING_EMBEDDING_PROVIDER=hash
INDEXING_EMBEDDING_DIMENSIONS=256
INDEXING_VECTOR_STORE_DRIVER=file
INDEXING_VECTOR_STORE_PATH=.data/indexing/vectors.json
INDEXING_VECTOR_STORE_POSTGRES_URL=
INDEXING_VECTOR_STORE_POSTGRES_SCHEMA=public
INDEXING_VECTOR_STORE_POSTGRES_TABLE=confluence_semantic_chunks
INDEXING_VECTOR_STORE_POSTGRES_SSL=false
INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT=true
```

Recommended local mode for a single workstation:

- keep `INDEXING_STORAGE_DRIVER=file`
- keep `INDEXING_VECTOR_STORE_DRIVER=file`
- keep `INDEXING_SEMANTIC_ENABLED=true`
- keep `INDEXING_SYNC_ENABLED=false` until you intentionally run an indexing job
- build or refresh the local index with `npm run indexing:run -- ...`

Optional deployment guardrails:

- `CONFLUENCE_ALLOWED_SPACE_KEYS=ENG,OPS`
  - limits public space-scoped search and internal sync/reindex to approved spaces
- `CONFLUENCE_ALLOWED_ROOT_PAGE_IDS=123456,987654`
  - limits root-based public tree lookups such as `page`, `page_tree`, and descendants flows

## Commands

```bash
npm install
npm run format
npm run build
npm run dev
```

Available hygiene commands:

```bash
npm run format
npm run format:check
npm run verify
npm run lint
npm run typecheck
npm run audit:prod
npm run indexing:run -- status
npm run indexing:run -- full --spaces=ENG
npm run indexing:run -- page 123456 --space-key=ENG
npm run evaluate:retrieval -- benchmarks/sample-retrieval-benchmark.json
```

Then expose the local HTTP endpoint if you want to connect it to ChatGPT during development:

```bash
https://<your-tunnel-domain>/mcp
```

ChatGPT connector setup expects the public `/mcp` URL, not a stdio process.

## Docker

Build the image:

```bash
docker build -t confluence-mcp-server .
```

Run it with your local `.env` file:

```bash
docker run --rm -p 3000:3000 --env-file .env confluence-mcp-server
```

The MCP endpoint will then be available at:

```text
http://localhost:3000/mcp
```

If you want to connect ChatGPT, expose that endpoint through a public HTTPS tunnel or reverse proxy and use the public `/mcp` URL in the connector setup.

If metrics are enabled, the server also exposes:

```text
http://localhost:3000/metrics
```

When `MCP_API_KEY` is configured, the same API key is required for `/metrics`.

The same internal auth policy also applies to:

```text
http://localhost:3000/sync-status
```

## Docker Compose with Postgres/pgvector

When you want to run Postgres together with the MCP server, the repo now includes `docker-compose.yml`.

What it does:

- starts `pgvector/pgvector:pg17`
- starts the MCP server container
- keeps Postgres data in `./.pgdata`
- keeps MCP local indexing data in `./.data`
- reuses your local `.env` for Confluence credentials and MCP API key
- overrides the vector backend inside compose to `postgres`

Start the full stack:

```bash
docker compose up --build -d
```

Watch logs:

```bash
docker compose logs -f mcp
docker compose logs -f postgres
```

Stop the stack:

```bash
docker compose down
```

Important note:

- when you run `npm run dev` locally, your `.env` stays on the recommended `file` backend
- when you run `docker compose up`, the compose file overrides the vector store to Postgres for the containerized MCP server
- the compose stack publishes the MCP HTTP endpoint on `http://localhost:3001` to avoid conflicts with a locally running server on `3000`
- this means you can keep one `.env` and choose the mode you want per run

## Request correlation and tracing

The server now propagates two correlation headers end-to-end:

- `X-Request-Id`
- `X-Trace-Id`

Behavior:

- if the client sends them, the server reuses them
- if they are missing, the server generates them
- both are echoed back in HTTP responses
- both are included in structured logs
- both are forwarded to Confluence upstream requests

## API key policy

Inbound access to this MCP server is API-key-only.

- primary header: `X-API-Key: <key>`
- compatibility header: `Authorization: ApiKey <key>`
- preferred client behavior: use `X-API-Key` unless a specific MCP client can only work through the compatibility form

Optional rotation is supported:

- `MCP_API_KEY` = active key
- `MCP_NEXT_API_KEY` = next key accepted during rollout

This lets you move clients gradually without dropping access in the middle of a rotation window.

## VS Code usage note

This server is designed to work well as a local or team-shared MCP context source for VS Code and similar MCP clients.

- no UI layer is required for the core use case
- the primary value is structured read-only retrieval plus internal indexing
- for local workstation usage, the file-backed indexing store is often the most practical next step before moving to a shared database
- the new semantic layer is also oriented toward local tooling first: it can run fully in-process without any UI or web app surface
- when you need a team-shared semantic backend, the `postgres` vector store driver is the current production path

## Internal sync policy

Read-only applies to the public MCP surface, not to internal indexing mechanics.

- periodic sync may fetch pages, ancestors, and metadata from Confluence
- periodic sync may update local watermarks, sync runs, and indexing artifacts through the configured storage driver
- periodic sync may trigger a full internal reconciliation pass for safe local delete handling
- these internal jobs are not exposed as MCP tools
- these internal jobs must never modify Confluence content
- when `CONFLUENCE_ALLOWED_SPACE_KEYS` is configured, internal full and space reindex jobs are restricted to that allowlist

## Reverse Proxy Notes

If you publish the server behind Nginx, Nginx Proxy Manager, Caddy, or a tunnel service, make sure the proxy forwards these headers to the app:

- `Authorization`
- `Host`
- `X-Forwarded-Proto`
- `X-Request-Id` if your edge already assigns one
- `X-Trace-Id` if your edge already assigns one

Example Nginx location block:

```nginx
location /mcp {
    proxy_pass http://127.0.0.1:3000/mcp;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_set_header X-Request-Id $request_id;
    proxy_set_header X-Trace-Id $request_id;
}
```

Recommended production settings:

- set `APP_ENV=production`
- set `MCP_ALLOWED_HOSTS` to your public hostname
- set `MCP_ALLOWED_ORIGINS` to the exact browser/client origins you trust
- set `MCP_API_KEY` for inbound MCP authentication
- optionally set `MCP_NEXT_API_KEY` during key rotation windows
- keep the app bound to `127.0.0.1` when a reverse proxy terminates public traffic

In production HTTP mode, this project now enforces inbound API-key auth at startup. If `APP_ENV=production` and `MCP_API_KEY` is missing, the server will refuse to start.

## Deployment patterns

### Local development

- run the server on `127.0.0.1:3000`
- test it with a local MCP client or Inspector
- keep `MCP_ALLOWED_HOSTS` and `MCP_ALLOWED_ORIGINS` narrow even in dev when possible
- if `MCP_ALLOWED_HOSTS` is omitted in development, the server applies safe local defaults such as `localhost`, `127.0.0.1`, and `::1`

### Public HTTPS via tunnel

For ChatGPT connector testing from your workstation, the simplest route is a public HTTPS tunnel.

Typical pattern:

- app listens on `http://127.0.0.1:3000`
- tunnel exposes `https://your-subdomain.example.com/mcp`
- `MCP_ALLOWED_HOSTS=your-subdomain.example.com`
- if the browser/client origin is known, set `MCP_ALLOWED_ORIGINS` to that exact origin

Examples:

- Cloudflare Tunnel
- ngrok
- Tailscale Funnel

### Reverse proxy on a VM or container host

Typical production pattern:

- app container listens only on a private interface
- reverse proxy terminates TLS
- proxy forwards:
  - `X-API-Key` preferred, `Authorization: ApiKey ...` only for compatibility
  - `Host`
  - `X-Forwarded-Proto`
  - `X-Request-Id`
  - `X-Trace-Id`
- MCP server validates `Host` / `Origin`
- inbound MCP API-key auth remains enabled

This is the preferred pattern for a shared team endpoint.

## Tool overview

### `confluence.search`

Searches Confluence using CQL and returns ranked results:

- `query`
- `scope`
  - `page`
  - `page_tree`
  - `space`
- optional `filters`
- optional `retrieval`

Response includes:

- `retrievalModeUsed`
- `policyApplied`
- `results`
- `nextCursor`
- optional `debug`

Each search result now also carries:

- `verificationStatus`
- `sectionPath`
- `retrievalSource`
- `rankingDebug`

Example response shape:

```json
{
  "retrievalModeUsed": "hybrid",
  "policyApplied": {
    "policyId": "default-secure-rag",
    "verificationRequired": true,
    "verificationMode": "service_v2_fetch",
    "maxTopK": 20,
    "maxSnippetChars": 600,
    "maxVerifications": 12,
    "citationFirst": true
  },
  "results": [
    {
      "rank": 1,
      "pageId": "123",
      "title": "Release Notes",
      "verificationStatus": "verified_service_v2_fetch",
      "retrievalSource": "hybrid_rrf",
      "sectionPath": ["Release Notes", "Checklist"]
    }
  ],
  "nextCursor": null,
  "debug": null
}
```

Example tool call payload:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "confluence.search",
    "arguments": {
      "query": "release notes",
      "scope": {
        "type": "space",
        "spaceKey": "ENG"
      },
      "retrieval": {
        "mode": "keyword",
        "topK": 10
      }
    }
  }
}
```

### `confluence.get_page`

Fetches:

- page metadata
- requested body format
- canonical page URL

Example arguments:

```json
{
  "pageId": "123",
  "bodyFormat": "storage"
}
```

### `confluence.get_page_tree`

Lists descendant pages for a root page with:

- `rootPageId`
- `limit`
- `cursor`

Example arguments:

```json
{
  "rootPageId": "123",
  "limit": 25
}
```

### `confluence.get_page_ancestors`

Fetches the ancestor chain for a page:

- `pageId`

Example arguments:

```json
{
  "pageId": "123"
}
```

Example response shape:

```json
{
  "pageId": "123",
  "ancestors": [
    {
      "pageId": "100",
      "title": "Engineering",
      "spaceId": "42",
      "url": "https://example.atlassian.net/spaces/ENG/overview",
      "depth": 1
    }
  ],
  "nextCursor": null
}
```

### `confluence.get_page_restrictions`

Fetches page restrictions normalized by operation:

- `pageId`

Example arguments:

```json
{
  "pageId": "123"
}
```

Example response shape:

```json
{
  "pageId": "123",
  "operations": [
    {
      "operation": "read",
      "subjects": [
        {
          "type": "user",
          "identifier": "abc-123",
          "displayName": "Ada Lovelace"
        }
      ]
    }
  ]
}
```

### `confluence.get_page_descendants`

Fetches descendant content for a page from the v2 descendants endpoint:

- `pageId`
- optional `limit`
- optional `cursor`
- optional `depth`

Example arguments:

```json
{
  "pageId": "123",
  "limit": 25,
  "depth": 2
}
```

Example response shape:

```json
{
  "pageId": "123",
  "descendants": [
    {
      "pageId": "124",
      "title": "Child Page",
      "contentType": "page",
      "status": "current",
      "parentId": "123",
      "depth": 1,
      "childPosition": 10,
      "url": "https://example.atlassian.net/wiki/pages/viewpage.action?pageId=124"
    }
  ],
  "nextCursor": null
}
```

### `confluence.get_page_attachments`

Fetches page attachment metadata from the v2 attachments endpoint:

- `pageId`
- optional `limit`
- optional `cursor`
- optional `filename`
- optional `mediaType`

Example arguments:

```json
{
  "pageId": "123",
  "limit": 25,
  "filename": "release-notes.pdf"
}
```

Example response shape:

```json
{
  "pageId": "123",
  "attachments": [
    {
      "attachmentId": "900",
      "title": "release-notes.pdf",
      "status": "current",
      "mediaType": "application/pdf",
      "mediaTypeDescription": "PDF document",
      "comment": "Latest release notes",
      "fileId": "file-900",
      "fileSize": 2048,
      "createdAt": "2026-04-08T10:00:00Z",
      "pageId": "123",
      "downloadUrl": "https://example.atlassian.net/wiki/download/attachments/123/release-notes.pdf",
      "webuiUrl": "https://example.atlassian.net/wiki/spaces/ENG/pages/123/Release+Notes",
      "version": {
        "number": 3,
        "createdAt": "2026-04-08T10:00:00Z",
        "message": "Updated attachment",
        "minorEdit": false,
        "authorId": "abc-123"
      }
    }
  ],
  "nextCursor": null
}
```

## Suggested next steps

- replace the local hash embedding baseline with a production embedding provider
- replace local file-backed persistence with shared database-backed storage when multi-user scale is needed
- add retrieval evaluation and ranking quality benchmarks

## Confluence scope policy

The server now supports deployment-time guardrails for allowed Confluence scope:

- `CONFLUENCE_ALLOWED_SPACE_KEYS`
  - restricts public `space` searches
  - restricts internal full/space indexing jobs
  - restricts configured background sync spaces
- `CONFLUENCE_ALLOWED_ROOT_PAGE_IDS`
  - restricts root-based public search scopes
  - restricts `confluence.get_page_tree`
  - restricts `confluence.get_page_descendants`

These controls are intended for server deployments where only a known subset of Confluence should be searchable.

## Indexing scaffold

The repo now includes an initial indexing model in `src/indexing`:

- indexable Confluence page schema
- indexed chunk metadata schema
- indexed document chunk schema
- page snapshot builder for turning fetched Confluence data into indexable documents
- heading-aware chunk extraction from Confluence HTML bodies
- Confluence table normalization into structured text rows for chunking
- initial chunk splitting with overlap support
- Confluence page loader for fetching page bodies plus ancestor context for indexing
- pluggable sync state storage with `memory` and `file` drivers
- pluggable document index storage with `memory` and `file` drivers
- pluggable vector storage with `memory`, `file`, and `postgres` drivers
- page-level sync coordinator that produces chunks, records run stats, and skips unchanged snapshots
- space-level incremental sync coordinator that polls changed pages via `lastmodified` CQL
- full sync coordinator that bootstraps indexing across paged Confluence spaces and pages
- internal reindex service for page, space, and full reindex jobs inside the server
- full-space snapshot reconciliation against the local index store
- optional background incremental sync worker driven by configured space keys and poll interval
- optional periodic full reconciliation inside the worker for safe local stale-document cleanup
- internal sync-status snapshot builder for operator diagnostics across watermarks, runs, and per-space counts
- hash-based embedding service for local semantic experimentation
- semantic indexer that replaces page chunk vectors during sync
- `semantic` and `hybrid` search modes with metadata filters and RRF fusion
- Postgres/pgvector vector store scaffold with schema init, HNSW index creation, and metadata-filtered search

This is the foundation for later sync jobs, embeddings, and vector storage.

## Metrics overview

The server now keeps an in-memory metrics registry and records:

- HTTP requests and request latency
- MCP tool invocations and tool latency
- Confluence upstream requests and latency
- vector query latency and result counts
- rate-limit hits
- permission denials
- sync lag gauges per configured space
- sync worker run counters and duration summaries

Current exposure model:

- `GET /metrics`
- `GET /sync-status`
- JSON snapshot format
- intended as an internal bootstrap endpoint before Prometheus/OpenTelemetry integration

## Retrieval evaluation

The repo now includes a local retrieval evaluation harness for keyword, semantic, and hybrid search.

What it does:

- loads a benchmark suite from JSON
- runs each case against `confluence.search`
- computes recall@k and MRR per requested mode
- validates citation/snippet correctness against the local indexed document store
- outputs a JSON report with per-case results, per-mode summaries, and a keyword-vs-hybrid comparison block

Starter benchmark file:

```text
benchmarks/sample-retrieval-benchmark.json
```

Run against the current local index:

```bash
npm run evaluate:retrieval -- benchmarks/sample-retrieval-benchmark.json
```

Optionally rebuild the local index before evaluation:

```bash
npm run evaluate:retrieval -- benchmarks/sample-retrieval-benchmark.json --reindex-full
npm run evaluate:retrieval -- benchmarks/sample-retrieval-benchmark.json --reindex-space=ENG
```

This is intentionally an internal operator workflow, not a public MCP tool.

## Ready-to-test checklist

Before everyday use in VS Code or another MCP client:

1. Run `npm run verify`
2. Start the server with `npm run dev` or `docker compose up --build -d`
3. Check `/health`, `/ready`, and `/sync-status`
4. Run `npm run indexing:run -- status`
5. If needed, run a targeted `page` or `space` reindex

## Internal indexing commands

The repo now includes an internal CLI for operator workflows around indexing and sync. This is not exposed as a public MCP tool, but it is useful for local VS Code workflows and team-shared maintenance jobs.

Examples:

```bash
npm run indexing:run -- status
npm run indexing:run -- full --spaces=ENG,OPS --max-pages-per-space=100
npm run indexing:run -- space ENG --max-pages-per-space=100
npm run indexing:run -- page 123456 --space-key=ENG
```

Behavior:

- `status` prints the current sync snapshot, recent runs, watermarks, and vector record counts
- `full` runs internal full reindex across all allowed spaces or a selected subset
- `space` reindexes one space through the same internal full-sync path
- `page` reloads and reindexes a single page
- all commands print structured JSON to stdout and keep logs on stderr

## Postgres vector store

When you want a shared semantic backend instead of local `memory` or `file` vectors, set:

```env
INDEXING_SEMANTIC_ENABLED=true
INDEXING_VECTOR_STORE_DRIVER=postgres
INDEXING_VECTOR_STORE_POSTGRES_URL=postgres://user:password@host:5432/database
INDEXING_VECTOR_STORE_POSTGRES_SCHEMA=public
INDEXING_VECTOR_STORE_POSTGRES_TABLE=confluence_semantic_chunks
INDEXING_VECTOR_STORE_POSTGRES_SSL=false
INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT=true
```

Current behavior:

- requires a Postgres database with the `pgvector` extension available
- can auto-create the schema, table, and vector indexes when `INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT=true`
- stores semantic chunk vectors plus filterable metadata such as `pageId`, `spaceKey`, `ancestorIds`, and `tenantId`
- keeps the public MCP surface read-only; only internal indexing writes to the vector store
