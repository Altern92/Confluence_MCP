# API Key Governance

This server is API-key-only for inbound MCP access.

## Scope and usage rules

- One API key grants access to the full read-only MCP surface.
- API keys do not grant write access to Confluence because the server does not expose write tools.
- Keys must be treated as operator secrets, not user credentials.
- Keys are intended for trusted MCP clients such as VS Code or controlled internal connectors.
- Keys must never be embedded in source control, screenshots, or shared chat transcripts.

## Header contract

- Primary header: `X-API-Key: <key>`
- Compatibility header: `Authorization: ApiKey <key>`

## Issuance process

1. Generate a random key with at least 32 bytes of entropy.
2. Store the key in the approved secret manager before handing it to a client.
3. Record the owner, environment, issue date, and intended MCP client.
4. Add the key as `MCP_API_KEY`.
5. If rotating, place the next key in `MCP_NEXT_API_KEY` during the overlap window.

## Storage rules

- Local workstation usage:
  - `.env` is acceptable only for local development on a trusted machine.
- Shared or production usage:
  - store keys in Azure Key Vault
  - inject them into the runtime environment at deploy time
  - do not store production keys in `.env` files on disk

## Rotation process

1. Generate the replacement key.
2. Set the replacement as `MCP_NEXT_API_KEY`.
3. Update clients to use the new key.
4. Confirm traffic is using the new fingerprint in logs.
5. Promote the new key into `MCP_API_KEY`.
6. Remove the old key from the runtime and secret manager references.

## Revocation process

1. Remove the compromised key from the runtime.
2. Remove it from Azure Key Vault or mark it inactive.
3. Restart the service or redeploy so the old key is no longer accepted.
4. Review access logs for the old fingerprint.
5. Issue a replacement key if continued access is required.

## Logging expectations

- Log only API key fingerprints, never raw values.
- Investigate repeated authentication failures from the same client or IP path.
- Keep access logs according to the retention rules in [AUDIT-AND-RETENTION.md](../security/AUDIT-AND-RETENTION.md).
