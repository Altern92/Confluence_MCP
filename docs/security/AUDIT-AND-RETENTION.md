# Audit And Retention

## Audit event types

The server must retain structured logs for these event groups:

- service startup and shutdown
- configuration validation failures
- inbound authentication failures
- MCP tool invocation success and failure
- Confluence upstream authentication or permission failures
- manual reindex jobs
- background sync runs
- metrics and sync-status access in shared environments

## Critical actions to log

- server start with sanitized configuration summary
- server stop or crash
- `/mcp` authentication failures
- `/metrics` and `/sync-status` authentication failures
- `full`, `space`, and `page` internal reindex command runs
- incremental sync failures
- repeated Confluence `401`, `403`, or `429` responses

## Retention rules

- Local workstation logs:
  - keep 7 to 14 days unless a debugging session needs longer retention
- Shared non-production environment:
  - keep 30 days
- Production:
  - keep 90 days for operational logs
  - keep 180 days for security-relevant audit exports when policy allows

## Redaction rules

- Never log raw API keys.
- Never log raw Confluence API tokens.
- Avoid logging full page bodies by default.
- Prefer page IDs, space keys, run IDs, trace IDs, and snippets over full content.

## Review cadence

- Review authentication failures weekly.
- Review reindex and sync failures daily in active usage periods.
- Review unusual rate limiting patterns weekly.
