# Do RAG Rules Help a Confluence MCP Server?

## Executive summary

Introducing **RAG (Retrieval-Augmented Generation)** can significantly improve a Confluence MCP server’s **discovery and ad‑hoc extraction** experience—especially when users don’t know where information lives or when they need section-level answers quickly. RAG’s core benefit is adding a **retrieval layer (often indexed)** so the agent can find relevant passages efficiently and provide grounded answers with citations, rather than relying on the model’s parametric memory alone. This aligns with classic RAG framing: combine parametric generation with non‑parametric retrieval for more factual, specific outputs and easier updates. citeturn1search0turn1search4

However, on Confluence the main risks are **authorization leakage (ACL mismatch between index and user permissions)**, **staleness**, and **content-format complexity** (macros, tables, ADF/storage conversions, attachments). Confluence Cloud adds operational risk from **rate limits** (new points-based quotas/enforcement beginning March 2, 2026 for 3LO/Forge/Connect apps). citeturn0search2turn0search14

**Conclusion:** RAG rules/policies are worthwhile if you implement them as **server-enforced controls** at multiple points in the request flow—especially **verify-before-reveal** using the user’s token, **scope-first retrieval** (CQL + metadata filters), conservative snippet/citation policies, attachment allow/deny controls, and strong sync watermarking. MCP’s Streamable HTTP security requirements (including `Origin` validation and authentication) should remain foundational. citeturn0search7turn0search2

## What RAG adds vs direct API proxy and hybrid approaches

A **direct API proxy** (no index) relies on Confluence APIs at query time: v1 **CQL search** (`/wiki/rest/api/search`) to discover candidates and v2 page fetches (`/wiki/api/v2/pages/{id}`) to retrieve bodies. citeturn0search0turn0search1 This is naturally permission-aligned but can be slower and less semantically capable.

An **indexed RAG** approach adds: chunking, embeddings, vector search, and (optionally) keyword indexing. This improves semantic discovery and repeated-query speed but introduces ACL and staleness risks.

A **hybrid** approach combines:

1. Confluence CQL search for permission-safe candidate discovery (and for scope enforcement in CQL), plus
2. semantic retrieval from the index for better recall on fuzzy queries, then
3. a fusion/rerank method like **RRF**. citeturn0search0turn0search24turn1search0turn1search4

**What RAG adds (net new capability):** fast **semantic passage retrieval** and **section-level** extraction at scale (especially across many pages), and improved grounding/citation workflows when coupled to a provenance model. citeturn1search0turn1search4

### Comparison (where RAG rules matter most)

| Approach         | UX benefit                    | Main failure mode                          | Why rules help                                                    |
| ---------------- | ----------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Direct API proxy | Correct, fresh, simple        | Slow; weaker fuzzy discovery; rate limits  | Rules help with scope defaults, paging budgets, citation-first    |
| Indexed RAG      | Fast, semantic, scalable      | ACL leakage; stale results; parsing errors | Rules are essential for verify-before-reveal + watermark controls |
| Hybrid           | Best discovery + verification | Complexity (two retrieval paths)           | Rules unify scope, verification, and debug transparency           |

## Benefits to user experience

RAG improves experience in three practical ways:

**Discovery:** users can ask “Where is X documented?” without knowing page titles or exact keywords. Semantic retrieval finds relevant chunks even when terminology differs from the query. citeturn1search0turn1search4

**Ad-hoc extraction:** once the system finds the right section(s), it can return precise snippets and citations rapidly (especially if pages are pre-chunked and indexed). Confluence v2 page objects include canonical UI link fields (`_links.webui`, etc.), which you can embed in citations. citeturn0search1

**Speed and rate-limit efficiency:** an index reduces repeated calls to Confluence, which is increasingly important given Confluence Cloud rate limits and the points-based quota rollout for apps (3LO included). citeturn0search2turn0search14

## Confluence-specific risks with RAG

**Permissions/ACL leakage:** a shared index can return embeddings/snippets for content the requesting user cannot view unless you enforce per-user filtering or verify returned passages against Confluence using the user’s auth. Confluence v2 endpoints state that only content the user has permission to view is returned—use this as the verification oracle. citeturn0search1

**Staleness:** indexed content can lag behind Confluence updates unless you implement incremental sync (e.g., CQL `lastmodified`) and reconciliation. CQL supports `lastmodified`, and the v1 search endpoint supports CQL queries with cursor pagination. citeturn0search0turn0search24

**Attachments:** attachments can contain sensitive data and can change independently. v2 attachment APIs return metadata and pagination via `Link` headers; downloads may use v1 attachment download endpoints/flows. citeturn1search3turn1search7turn0search9

**Macros / ADF parsing / tables:** Confluence Cloud page bodies may be in `atlas_doc_format` or `storage` (v2 `body-format`). For reliable text normalization you may need v1 **content-body conversion** (async, limited retention and bulk limits). citeturn0search1turn0search9turn0search12

**RAG security surface:** research and industry guidance explicitly call out “retrieval data leakage” as a central RAG risk category. citeturn1search5

## Concrete RAG rules and where to enforce them

### Enforcement points in the request flow

```mermaid
flowchart LR
  Q[User query] --> P1[Pre-retrieval rules<br/>scope required + budgets]
  P1 --> K[CQL search (optional)<br/>space/ancestor/lastmodified]
  P1 --> V[Vector/keyword index retrieval<br/>metadata filters]
  K --> F[Fusion (RRF) + dedupe]
  V --> F
  F --> P2[Post-retrieval verification<br/>verify-before-reveal via v2 page fetch]
  P2 --> A[Answer assembly<br/>citation-first + snippet caps]
  A --> R[Tool response + debug fields]
```

**Pre-retrieval (scope-first):** always require a scope object and compile it into CQL + index filters:

- `space` scope → `space = "KEY"` in CQL. citeturn0search24
- `page_tree` scope → `ancestor = <rootPageId>` in CQL. citeturn0search24
- incremental constraints → add `lastmodified > "<ISO>"`. citeturn0search24  
  This reduces overbroad retrieval before any snippet is generated.

**Post-retrieval (verify-before-reveal):** for any indexed result, verify the candidate page (and ideally the section) by fetching it with the user’s token (`GET /wiki/api/v2/pages/{id}`) before returning text. v2 explicitly notes only pages the user can view are returned. citeturn0search1

**Final assembly (citation-first):** return citations and snippets derived from verified page bodies; treat CQL excerpts as hints, not as final evidence. v2 provides web UI links for provenance. citeturn0search1

### Example JSON RAG policy schema and sample rules

```json
{
  "policyId": "default-secure-rag",
  "version": 1,
  "rules": [
    {
      "priority": 10,
      "name": "scope-first-retrieval",
      "scope_required": true,
      "pre_retrieval": {
        "require_scope_type": ["page", "page_tree", "space"],
        "max_topK": 20,
        "max_pages_fetched": 10,
        "max_total_snippet_chars": 4000
      }
    },
    {
      "priority": 20,
      "name": "verify-before-reveal",
      "verification_required": true,
      "verification": {
        "method": "confluence_v2_fetch",
        "drop_on_forbidden": true,
        "drop_on_not_found": true,
        "max_verifications": 12
      }
    },
    {
      "priority": 30,
      "name": "conservative-snippets",
      "max_snippet_chars": 600,
      "citation_first": true
    },
    {
      "priority": 40,
      "name": "attachments-policy",
      "allow_attachments": false,
      "allowlist_media_types": ["application/pdf"],
      "denylist_extensions": [".key", ".pem", ".p12"],
      "reverify_on_click": true
    }
  ]
}
```

## Sample MCP tool behavior changes with RAG policy enforcement

### `confluence.search` (hybrid + debug + verification)

**Request (excerpt):**

```json
{
  "scope": { "type": "page_tree", "rootPageId": "12345" },
  "query": "How do we rotate secrets?",
  "retrievalMode": "hybrid",
  "topK": 15,
  "ragPolicyId": "default-secure-rag",
  "debug": true
}
```

**Response (excerpt):**

```json
{
  "results": [
    {
      "pageId": "9988",
      "title": "Secrets Rotation Runbook",
      "url": "https://.../wiki/spaces/SEC/pages/9988",
      "sectionPath": ["Operations", "Secret rotation"],
      "snippet": "Rotate the KMS envelope keys quarterly...",
      "retrieval": { "denseRank": 2, "keywordRank": 5, "rrfScore": 0.031 },
      "verificationStatus": "verified_v2_fetch"
    }
  ],
  "policyApplied": {
    "policyId": "default-secure-rag",
    "verificationRequired": true,
    "maxSnippetChars": 600
  },
  "debug": {
    "cqlUsed": "ancestor=12345 AND text ~ \"rotate\"",
    "droppedCandidates": 3,
    "dropReasons": { "forbidden": 2, "not_found": 1 }
  }
}
```

RRF is the recommended fusion method because it is rank-based and robust to score-scale mismatch. citeturn1search4turn1search0

### `confluence.get_page` (structure + snippet caps)

Add fields indicating applied policy and `maxChars` enforcement. Use v2 `body-format` and, if needed, v1 conversion for normalization. citeturn0search1turn0search12

### `confluence.reindex` (operational control)

Expose reindex as a tool but restrict it by allowlist/admin claims; return `jobId`, `enqueuedAt`, and progress. (This is an MCP-level design; implement as side-effecting tool with strict auth.)

## Operational controls, testing, metrics, and rollout

**Index watermarking & sync cadence:** store a per-scope watermark (e.g., per space) and poll with CQL `lastmodified > watermark`. citeturn0search24turn0search0  
**Webhook + polling fallback:** Cloud webhooks are best-effort and not guaranteed; treat them as acceleration only. citeturn0search12turn0search24turn0search0  
**Rate-limit resilience:** implement 429 handling using `Retry-After` and record rate-limit headers; points-based enforcement begins March 2, 2026. citeturn0search2turn0search14  
**Content conversion controls:** v1 content-body conversions are async and cached briefly; apply batching and reuse within the retention window. citeturn0search12

### Testing plan for RAG safety

Permission regression tests: two users with different page visibility; ensure “verify-before-reveal” drops unauthorized results. citeturn0search1  
Leakage fuzz tests: inject random chunkIds/pageIds and ensure no snippet is returned without verification. citeturn1search5  
Stale-index tests: update a page and ensure the system either refreshes or flags staleness (watermark lag). citeturn0search24  
Attachment policy tests: ensure denylisted types never get extracted, and allowed types require re-verification on download. citeturn1search3turn1search7

### Recommended metrics and alerts

Metrics: `verification_failures_total`, `verification_drop_total{reason}`, `index_staleness_seconds`, `permission_denials_total`, `rate_limit_hits_total`, `retrieval_mode_usage_total{keyword|semantic|hybrid}`. Rate-limits and enforcement timing are explicitly documented by Atlassian. citeturn0search2turn0search14  
Alerts: sudden rise in `verification_drop_total{forbidden}`, `index_staleness_seconds` above SLO, any “leakage_incidents” (define as “snippet returned without verified_v2_fetch”).

### Rollout strategy and gates

Canary (internal): enable RAG index but keep **verification required** and low snippet limits.  
Pilot: expand to a few spaces; require “no leakage incidents” and stable staleness SLO.  
Full: broaden allowlists; only after passing permission regression and stale-index tests.

## Implementation roadmap to add RAG rules to an existing MCP server

Assuming you already have scoped tools (`search`, `get_page`, `get_page_tree`) and auth middleware:

Milestone one (1–2 weeks): **Policy engine + enforcement hooks**  
Implement policy schema, pre-retrieval budgets, and response debug fields; add deny/allow attachment controls.

Milestone two (1–3 weeks): **Verify-before-reveal pipeline**  
Add post-retrieval verification via v2 page fetch; drop unauthorized/unfetchable candidates; return `verificationStatus`. v2 states only viewable pages are returned, making it a practical verification oracle. citeturn0search1

Milestone three (2–4 weeks): **Incremental sync + watermarking**  
CQL `lastmodified` polling per scope; webhook acceleration if available; staleness metrics; rate-limit backoff aligned to Atlassian guidance. citeturn0search24turn0search2

**Bottom line:** RAG itself improves UX, but **RAG rules** are what make it safe and enterprise-credible on Confluence. Without server-enforced scope-first + verify-before-reveal + staleness controls, indexed retrieval is likely to create unacceptable ACL or freshness failures.
