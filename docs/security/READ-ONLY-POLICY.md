# Read-Only Policy

## Core rule

This project is read-only toward Confluence.

## What is allowed

- search pages
- fetch pages
- fetch ancestors, descendants, restrictions, and attachments
- build internal indexes and embeddings from readable content
- run internal sync and reindex jobs

## What is not allowed

- create pages
- update pages
- delete pages
- move pages
- change page restrictions
- upload or delete attachments

## Enforcement rules

- No public MCP tool may call a Confluence write endpoint.
- Internal sync and reindex jobs must remain outside the MCP tool surface.
- Any new tool proposal must explicitly state why it remains read-only.
