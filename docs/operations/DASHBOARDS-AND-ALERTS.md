# Dashboards And Alerts

## Minimum dashboards

### 1. Service health dashboard

- request volume
- request latency
- auth failures
- `5xx` responses
- process restarts

### 2. Retrieval dashboard

- `tool_latency_ms`
- `confluence_requests_total`
- `confluence_request_latency_ms`
- `vector_query_latency_ms`
- `permission_denials_total`

### 3. Sync dashboard

- `sync_lag_seconds`
- sync run counts
- pages indexed
- pages deleted
- chunks produced
- last successful reindex time

## Minimum alerts

- service unavailable for 5 minutes
- auth failures spike above normal baseline
- `sync_lag_seconds` above acceptable threshold
- repeated Confluence `429` or `403`
- background sync run failures on two consecutive runs

## Suggested implementation path

- local or workstation:
  - rely on `/metrics`, `/sync-status`, and structured logs
- shared environment:
  - scrape `/metrics` into Prometheus-compatible storage
  - visualize in Grafana or Azure Monitor
