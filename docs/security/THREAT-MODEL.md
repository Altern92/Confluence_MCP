# Threat Model

## System purpose

The Confluence MCP server provides read-only access to Confluence content for trusted MCP clients. It may build local or database-backed semantic indexes, but it must not mutate Confluence content.

## Trust boundaries

1. MCP client to MCP server
   - protected by API key authentication
   - optionally restricted by host and origin allowlists
2. MCP server to Confluence Cloud
   - protected by Confluence API token credentials
3. MCP server to local or Postgres-backed index storage
   - protected by filesystem or database access controls
4. Operator environment to runtime
   - protected by secret management and deployment controls

## Main assets

- Confluence API token
- MCP API keys
- indexed document content and chunk metadata
- retrieval results and snippets
- request, trace, and audit logs

## Primary threats

### Unauthorized MCP access

- Threat: a caller sends MCP requests without a valid key.
- Mitigation:
  - mandatory API key auth outside local experimentation
  - key fingerprint logging
  - rotation support via `MCP_NEXT_API_KEY`

### Data leakage through logs

- Threat: secrets or sensitive Confluence content appears in logs.
- Mitigation:
  - secret redaction in structured logs
  - no raw API keys in logs
  - request and trace metadata over payload dumps

### DNS rebinding or host header abuse

- Threat: remote callers reach the server through an unexpected host or browser origin.
- Mitigation:
  - `MCP_ALLOWED_HOSTS`
  - `MCP_ALLOWED_ORIGINS`
  - bind to localhost for workstation usage unless a reverse proxy is intentional

### Overexposed Confluence retrieval scope

- Threat: the server returns more content than expected.
- Mitigation:
  - server-side scope enforcement for `page`, `page_tree`, and `space`
  - read-only tool surface only
  - optional future space/root-page allowlists

### Index persistence risk

- Threat: local `.data` or Postgres index storage is copied or accessed by an unauthorized user.
- Mitigation:
  - workstation file permissions
  - disk encryption on developer machines
  - managed database access controls in shared environments

### Prompt or tool misuse

- Threat: an MCP client or model attempts to use the server for non-approved workflows.
- Mitigation:
  - no write tools are exposed
  - internal reindex and sync operations stay outside the public MCP tool surface
  - API key distribution limited to trusted clients

## Security decisions

- Inbound auth model: API-key-only
- Confluence interaction model: read-only via Confluence API token
- Public tool surface: read-only only
- Preferred production secret manager: Azure Key Vault
