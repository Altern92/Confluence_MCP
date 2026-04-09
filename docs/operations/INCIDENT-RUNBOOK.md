# Incident Runbook

## Scope

Use this runbook when the MCP server is unreachable, returns wrong data, or stops reflecting indexing changes.

## 1. Basic health check

1. Check `/health`
2. Check `/ready`
3. Check `/sync-status`
4. Check `/metrics`

## 2. Authentication problems

- Confirm the client sends `X-API-Key`
- Check API key fingerprint logs
- Confirm `MCP_API_KEY` or `MCP_NEXT_API_KEY` is set correctly

## 3. Confluence access problems

- Check recent logs for `401`, `403`, or `429`
- Validate `CONFLUENCE_BASE_URL`, `CONFLUENCE_EMAIL`, and `CONFLUENCE_API_TOKEN`
- Confirm the Confluence account can still access the target space or page

## 4. Index or sync problems

- Check `/sync-status`
- Run `npm run indexing:run -- status`
- If needed, run:
  - `npm run indexing:run -- page <PAGE_ID> --space-key=<SPACE_KEY>`
  - `npm run indexing:run -- space <SPACE_KEY>`
  - `npm run indexing:run -- full`

## 5. Local Docker troubleshooting

- `docker compose ps`
- `docker compose logs --tail=200 mcp`
- `docker compose logs --tail=200 postgres`
- restart with `docker compose up --build -d`

## 6. Recovery options

- restart the MCP server
- run a targeted page reindex
- run a space reindex
- run a full reindex if local index state is clearly inconsistent
