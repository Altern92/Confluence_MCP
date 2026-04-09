# Release Process

## Versioning

Use semantic versioning:

- `MAJOR` for breaking MCP contract or configuration changes
- `MINOR` for backward-compatible features
- `PATCH` for fixes and non-breaking improvements

## Changelog rules

Every release entry should include:

- changed tools or schemas
- config changes
- storage or indexing changes
- migration notes
- operator action required

## Pre-release checklist

1. `npm run verify`
2. `npm run audit:prod`
3. confirm Docker build succeeds
4. confirm README and docs are current
5. confirm no new write-oriented tool slipped into the MCP surface

## Release artifacts

- tagged source
- built Docker image
- release notes

## Rollback rule

If release behavior regresses retrieval quality, indexing integrity, or auth handling, roll back to the previous tagged image and re-run targeted smoke tests.
