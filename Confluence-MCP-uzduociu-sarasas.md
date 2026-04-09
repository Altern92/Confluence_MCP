# Confluence MCP serverio uzduociu sarasas

Atnaujinta: 2026-04-09

Sis dokumentas yra gyvas backlog'as, per kuri galima nuosekliai statyti enterprise-grade Confluence MCP serveri.

## Pagrindinis principas: tik Read-only

Sis MCP serveris turi buti read-only Confluence atzvilgiu.

Tai reiskia:

- per MCP tool'us leidziami tik skaitymo scenarijai
- nenumatome jokiu Confluence write endpoint'u ar tool'u
- nenumatome puslapiu kurimo, atnaujinimo, trynimo, perkelimo ar restrictions keitimo per MCP
- indexing, sync ir reindex logika leidziama tik kaip vidinis serverio mechanizmas, bet ne kaip viesas MCP tool surface
- bet koks busimas funkcionalumas turi islaikyti sia krypti

## Progress summary

### Jau uzdaryta

- [x] TypeScript projekto pagrindas
- [x] MCP HTTP endpointas `POST /mcp`
- [x] `GET /health`
- [x] `GET /ready`
- [x] Bazinis Confluence API klientas
- [x] Tool'ai:
  - [x] `confluence.search`
  - [x] `confluence.get_page`
  - [x] `confluence.get_page_tree`
  - [x] `confluence.get_page_ancestors`
  - [x] `confluence.get_page_restrictions`
  - [x] `confluence.get_page_descendants`
  - [x] `confluence.get_page_attachments`
- [x] MCP tool surface islaikytas tik read-only
- [x] Nenumatyti jokie Confluence write tool'ai
- [x] Scope enforcement:
  - [x] `page`
  - [x] `page_tree`
  - [x] `space`
- [x] API key auth middleware
- [x] `X-API-Key` kaip pagrindinis inbound auth kelias
- [x] `Authorization: ApiKey ...` kaip suderinamumo kelias
- [x] API key fingerprint loguose vietoj pacios reiksmes
- [x] API key rotation per `MCP_API_KEY` + `MCP_NEXT_API_KEY`
- [x] Host policy middleware
- [x] Origin policy middleware
- [x] Request context middleware su `X-Request-Id`
- [x] Trace ID middleware su `X-Trace-Id`
- [x] Request-scoped logger context per `AsyncLocalStorage`
- [x] Request logging middleware
- [x] Request body size limit
- [x] Request timeout middleware
- [x] Graceful shutdown handling
- [x] Runtime `APP_ENV` rezimai
- [x] Development-safe default `MCP_ALLOWED_HOSTS`
- [x] Startup klaida, jei production HTTP rezime neijungtas API key auth
- [x] Centralizuotas Confluence klaidu modelis
- [x] Centralizuotas retry/backoff sluoksnis
- [x] Centralizuoti pagination helper'iai
- [x] Tool klaidu zemelapiavimas i strukturuotus MCP tool error rezultatus
- [x] Sugrieztinti MCP tool input kontraktai
- [x] MCP tool input ir output contract testai
- [x] `retrievalModeUsed` paieskos rezultate
- [x] Dockerfile ir `.dockerignore`
- [x] `docker-compose.yml` su `Postgres + pgvector + MCP server` lokalioje aplinkoje
- [x] Lokalios `.env` konfiguracijos paruosimas testavimui
- [x] Docker paleidimo pavyzdys README'e
- [x] Reverse proxy / production deploy pavyzdys README'e
- [x] README request/response pavyzdziai pagrindiniams tool'ams
- [x] Success-path tool logging su `toolName` ir `scopeType`
- [x] Output schema enforcement per MCP tool call
- [x] Domain service interface tipai test doubles be `as unknown as`
- [x] Domain sluoksnis suskaidytas i Search/Page/Tree servisus
- [x] Citation builder atskirtas nuo bendro formatting sluoksnio
- [x] Snippet builder atskirtas nuo bendro formatting sluoksnio
- [x] Query-aware snippet builder paieskos rezultatams
- [x] Pradinis indexing modelis `src/indexing`
- [x] Heading-aware chunking karkasas
- [x] Page snapshot builder indexing pipeline'iui
- [x] Pradinis sync watermark ir reindex run modelis
- [x] Lokalios in-memory dokumentu index saugyklos karkasas
- [x] Pluggable local storage driver'ai `memory` ir `file`
- [x] File-backed sync state store lokalems paleidimams
- [x] File-backed document index store lokalems paleidimams
- [x] File-backed store refresh po isoriniu `indexing:run` procesu ir be serverio restart'o
- [x] Pluggable vector store driver'ai `memory`, `file` ir `postgres`
- [x] Hash-based embedding service local semantic retrieval pagrindui
- [x] Semantic indexer, prijungtas prie page sync
- [x] `semantic` retrieval kelias `confluence.search`
- [x] `hybrid` retrieval kelias `confluence.search`
- [x] RRF fusion keyword + semantic rezultatams
- [x] `default-secure-rag` policy `confluence.search`
- [x] `policyApplied` paieskos atsakyme
- [x] `verificationStatus` paieskos rezultatuose
- [x] Optional `debug` laukai RAG paieskos atsakyme
- [x] Service-account `verify-before-reveal` paieskos rezultatams
- [x] Ranking debug informacija `confluence.search` rezultatuose
- [x] Praturtintas search result citation modelis su `sectionPath`, `lastModified`, `retrievedAt`, `retrievalSource`
- [x] Vidinis retrieval benchmark runner keyword / semantic / hybrid palyginimui
- [x] Citation correctness validatorius pries lokalini index store
- [x] Postgres/pgvector production vector store scaffold
- [x] Page-level sync coordinator scaffold
- [x] Confluence page loader indexing pipeline'iui
- [x] Space-level incremental sync coordinator scaffold
- [x] Full sync coordinator per spaces ir pages
- [x] Pilno space snapshot reconciliation su lokaliu index store
- [x] Lokalinis stale document delete handling per pilna space snapshot
- [x] Konfiguruojamas background incremental sync worker'is
- [x] Update reconciliation per `skip unchanged` page sync logika
- [x] Periodinis full reconciliation incremental worker'yje
- [x] Delete handling incremental sync kelyje per saugu full reconciliation
- [x] Vidinis `reindex page` job servisas
- [x] Vidinis `reindex space` job servisas
- [x] Vidinis `full reindex` job servisas
- [x] Vidinis CLI paleidimas `status/full/space/page` indexing darbams
- [x] `lint`
- [x] `format`
- [x] `typecheck`
- [x] Unit testai
- [x] Integraciniai testai
- [x] Gyvas smoke testas pries realia Confluence Cloud instancija
- [x] Startup config summary log be secretu
- [x] Atskirtas config validacijos klaidu formatavimas startup metu
- [x] Bazinis in-memory metrics registry
- [x] `GET /metrics`
- [x] `GET /sync-status`
- [x] End-to-end `traceId` propagacija HTTP -> MCP -> Confluence
- [x] Sync status diagnostikos snapshot'as vidiniams operatoriams
- [x] Table normalization chunking sluoksnyje
- [x] `vector_query_latency_ms`

### Dar neuzdaryta

- [ ] Pilnas indexing ir sync production hardening
- [ ] Citation kokybes hardening ant realiu duomenu
- [ ] Observability dashboardai ir operatorinis sluoksnis
- [ ] Governance, audit ir rollout

---

## 1. Etapas A: Stabilizuoti pagrinda

Tikslas: tureti svaru, pletrai paruosta bazini serveri.

### A.1 Architektura ir runtime

- [x] Iskaidyti projekta i sluoksnius:
  - [x] `app`
  - [x] `http`
  - [x] `mcp`
  - [x] `domain`
  - [x] `confluence`
  - [x] `logging`
  - [x] `runtime`
- [x] Sukurti `request-context` middleware
- [x] Kiekvienam request prideti `requestId`
- [x] Ivesti vieninga logger context perdavima per visa request lifecycle
- [x] Prideti config summary log paleidimo metu be secretu
- [x] Atskerti config validacijos klaidas nuo bendru start klaidu

### A.2 Klaidu modelis

- [x] Sukurti `src/confluence/errors.ts`
- [x] Sukurti aiskias klaidu klases:
  - [x] `ConfluenceAuthError`
  - [x] `ConfluenceForbiddenError`
  - [x] `ConfluenceRateLimitError`
  - [x] `ConfluenceTransientError`
  - [x] `ConfluenceValidationError`
- [x] Tool layer'yje Confluence klaidas zemelapiuoti i aiskesnius MCP rezultatus
- [x] Standartizuoti `errorClass` lauka loguose

### A.3 Kodo higiena

- [x] `npm run build`
- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] Prideti formatter sprendima
- [x] Sutvarkyti `README.md` pagal nauja architektura

### A.4 Definition of done

- [x] Paleidimo metu aiskiai matosi transportas, hostas ir portas
- [x] Pagrindines Confluence klaidos turi savo tipus
- [x] Bazinis serveris statosi ir testuojasi be rankiniu veiksmu

---

## 2. Etapas B: HTTP sluoksnio sustiprinimas

Tikslas: padaryti `/mcp` saugu ir stablu produkcijai.

### B.1 Transport hardening

- [x] Prideti request body size limit
- [x] Prideti request timeout policy
- [x] Prideti graceful shutdown handling
- [x] Prideti readiness endpoint atskirai nuo health
- [x] Grazinti `X-Request-Id` response header

### B.2 Security middleware

- [x] Ivesti privaloma API key auth produkcijos rezimui
- [x] Igyvendinti `MCP_ALLOWED_ORIGINS` tikrinima
- [x] Igyvendinti aiskiu `MCP_ALLOWED_HOSTS` validavima ir testus
- [x] Nustatyti saugius dev rezimo default'us
- [x] Prideti klaida, jei production rezime API key auth neijungtas

### B.3 Deploy readiness

- [x] Sukurti `Dockerfile`
- [x] Sukurti `.dockerignore`
- [x] Prideti Ubuntu deploy dokumentacija ir sample failus
- [x] Prideti paleidimo pavyzdi per Docker
- [x] Paruosti reverse proxy reikalavimus:
  - [x] `Authorization` header forwarding
  - [x] `X-Forwarded-Proto`
  - [x] `Host`

### B.4 Definition of done

- [x] Serveris stabiliai kyla konteineryje
- [x] `/health` ir `/ready` veikia
- [x] `/mcp` saugomas per auth ir origin policy, kai jos sukonfiguruotos

---

## 3. Etapas C: Confluence kliento sustiprinimas

Tikslas: tureti produkcijai tinkama upstream klienta.

### C.1 Retry ir resilience

- [x] Sukurti `src/confluence/retry.ts`
- [x] Igyvendinti exponential backoff
- [x] Igyvendinti jitter
- [x] Retry daryti ant:
  - [x] `429`
  - [x] laikinu `5xx`
  - [x] transient network klaidu
- [x] Retry nedaryti ant:
  - [x] `400`
  - [x] `401`
  - [x] `403`
  - [x] validation klaidu

### C.2 Pagination

- [x] Sukurti `src/confluence/pagination.ts`
- [x] Centralizuoti `_links.next` cursor parsing
- [x] Centralizuoti v2 `Link` header handling
- [x] Prideti helperius keliu puslapiu traversavimui

### C.3 Request metadata

- [x] Kiekvienam Confluence request'ui prideti correlation id
- [x] Loginti response status ir latency
- [x] Fiksuoti rate-limit headerius

### C.4 API surface pletra

- [x] Prideti page ancestors gavima
- [x] Prideti descendants gavima per v2
- [x] Prideti content restrictions support
- [x] Prideti attachment metadata support

### C.5 Definition of done

- [x] Confluence klientas turi retry/backoff
- [x] Pagination tvarkoma vienoje vietoje
- [x] Kiekvienas request turi pilna correlation metadata

---

## 4. Etapas D: Tool'u ir domain logikos sutvirtinimas

Tikslas: tureti stabilius, prognozuojamus kontraktus.

### D.1 Tool kontraktai

- [x] Perziureti `confluence.search` input schema
- [x] Perziureti `confluence.get_page` output schema
- [x] Perziureti `confluence.get_page_tree` output schema
- [x] Aiskiai atskirti privalomus ir optional laukus
- [x] Prideti `retrievalModeUsed` lauka paieskos rezultatuose

### D.2 Domain logika

- [x] Ivesti `ConfluenceContentServicePort` interface tipa testams ir wiring'ui
- [x] Jei storeja `ConfluenceContentService`, skaidyti i:
  - [x] Search service
  - [x] Page service
  - [x] Tree service
- [x] Ivesti atskira citation builder'i
- [x] Ivesti atskira snippet builder'i

### D.3 Validation

- [x] Grieztai validuoti `pageId`
- [x] Grieztai validuoti `rootPageId`
- [x] Grieztai validuoti `updatedAfter`
- [x] Uzdeti ribas `topK` ir kitiems limit laukams

### D.4 Definition of done

- [x] Tool'ai turi aisku kontrakta
- [x] Domain logika nesedi handler'iuose
- [x] Citation/snippet logika atskirta nuo transporto
- [x] MCP tool surface lieka tik read-only

---

## 5. Etapas E: Testu pagrindas

Tikslas: padaryti koda saugu plesti.

### E.1 Testavimo infrastruktura

- [x] Isidiegti `vitest`
- [x] Prideti `npm test`
- [x] Prideti `npm run test:watch`
- [x] Sukurti `tests/` struktura

### E.2 Unit testai

- [x] Testai `src/confluence/cql.ts`
- [x] Testai `src/confluence/client.ts`
- [x] Testai `src/confluence/formatting.ts`
- [x] Testai `src/confluence/pagination.ts`
- [x] Testai `src/http/jsonrpc.ts`
- [x] Testai `src/http/middleware/host-policy.ts`
- [x] Testai `src/http/middleware/origin-policy.ts`
- [x] Testai `src/http/middleware/request-context.ts`
- [x] Testai `src/logging/logger.ts`
- [x] Testai `src/mcp/tool-results.ts`
- [x] Testai `src/observability/metrics-registry.ts`
- [x] Testai `src/domain/confluence-content-service.ts`
- [x] Testai `src/indexing/chunking.ts`
- [x] Testai `src/indexing/confluence-page-loader.ts`
- [x] Testai `src/indexing/create-indexing-stores.ts`
- [x] Testai `src/indexing/file-document-index-store.ts`
- [x] Testai `src/indexing/file-sync-state-store.ts`
- [x] Testai `src/indexing/full-sync-coordinator.ts`
- [x] Testai `src/indexing/incremental-sync-worker.ts`
- [x] Testai `src/indexing/page-sync-coordinator.ts`
- [x] Testai `src/indexing/page-snapshot.ts`
- [x] Testai `src/indexing/internal-reindex-service.ts`
- [x] Testai `src/indexing/sync-state-store.ts`
- [x] Testai `src/indexing/sync-status.ts`
- [x] Testai `src/indexing/sync-types.ts`
- [x] Testai `src/indexing/space-incremental-sync-coordinator.ts`
- [x] Testai `src/indexing/types.ts`
- [x] Testai `src/retrieval/hash-embedding-service.ts`
- [x] Testai `src/retrieval/memory-vector-store.ts`
- [x] Testai `src/retrieval/file-vector-store.ts`
- [x] Testai `src/retrieval/postgres-vector-store.ts`
- [x] Testai `src/retrieval/semantic-indexer.ts`
- [x] Testai `src/types/tool-schemas.ts`

### E.3 Contract testai

- [x] Patikrinti, kad MCP tool schemos validzios
- [x] Patikrinti error response shape
- [x] Patikrinti health/readiness response shape
- [x] Patikrinti metrics response shape
- [x] Patikrinti input ir output schema payload'us

### E.4 Integraciniai testai

- [x] Mock'inti Confluence API atsakymus
- [x] Patikrinti `confluence.search`
- [x] Patikrinti `confluence.get_page`
- [x] Patikrinti `confluence.get_page_tree`
- [x] Patikrinti `confluence.get_page_ancestors`
- [x] Patikrinti `confluence.get_page_restrictions`
- [x] Patikrinti `confluence.get_page_descendants`
- [x] Patikrinti `confluence.get_page_attachments`
- [x] Patikrinti gyva `confluence.search` darba su realiais Confluence duomenimis
- [x] Patikrinti auth middleware
- [x] Patikrinti metrics endpoint auth
- [x] Patikrinti sync-status endpoint auth ir response shape
- [x] Patikrinti host allowlist
- [x] Patikrinti body size limit
- [x] Patikrinti origin policy
- [x] Patikrinti timeout middleware
- [x] Patikrinti tool error logging metadata
- [x] Patikrinti success-path tool logging metadata
- [x] Patikrinti output schema enforcement per MCP tool call

### E.5 Definition of done

- [x] Kritinis CQL ir scope kodas turi testus
- [x] HTTP apsaugos turi bazinius testus
- [x] Testai paleidziami headless rezimu

---

## 6. Etapas F: API key autentikacijos sustiprinimas

Tikslas: islaikyti serveri API-key-only modelyje be kitu auth flow.

### F.1 Dizainas

- [x] Pasirinkti viena oficialu inbound API key perdavimo buda
- [x] Nuspresti, ar laikyti `X-API-Key` pagrindiniu, o `Authorization: ApiKey ...` kaip papildoma suderinamuma
- [x] Aprasyti API key scope ir naudojimo taisykles

### F.2 Implementacija

- [x] Sukurti `MCP_API_KEY` konfigura
- [x] Sukurti inbound API key auth middleware
- [x] Ta pati API key auth schema taikyti `/metrics`
- [x] Prideti API key hash arba fingerprint i logus vietoj pacios reiksmes
- [x] Prideti API key rotation palaikyma per aktyvu + kita rakta

### F.3 Operacinis valdymas

- [x] Aprasyti API key isdavimo procesa
- [x] Aprasyti API key saugojimo taisykles
- [x] Aprasyti API key atnaujinimo ir panaikinimo procesa

### F.4 Testai

- [x] `X-API-Key` scenarijus
- [x] `Authorization: ApiKey ...` scenarijus
- [x] Missing key scenarijus
- [x] Wrong key scenarijus
- [x] Active + next key rotation scenarijus

### F.5 Definition of done

- [x] Serveris veikia tik API-key-only modelyje
- [x] Nera jokio OAuth ar kito auth flow priklausomybes

---

## 7. Etapas G: Indexing ir sync

Tikslas: paruosti semantines paieskos pamata.

### G.1 Duomenu modelis

- [x] Apibrezti chunk schema
- [x] Apibrezti metadata schema:
  - [x] `pageId`
  - [x] `spaceKey`
  - [x] `ancestorIds`
  - [x] `sectionPath`
  - [x] `lastModified`
  - [x] `version`
  - [x] `tenantId`

### G.2 Full sync

- [x] Sukurti lokalu in-memory index store
- [x] Sukurti pluggable local storage backend pasirinkima
- [x] Sukurti bootstrap/full sync coordinator scaffold
- [x] Pereiti per spaces
- [x] Pereiti per pages per space
- [x] Gauti bodies
- [x] Sukurti Confluence page loader'i pilnam ir incremental sync
- [x] Normalizuoti teksta
- [x] Chunkinti
- [x] Rekonsiliuoti pilna space snapshot'a su lokaliu index
- [x] File-backed local storage durable paleidimams is VS Code / workstation
- [x] Generuoti embeddings
- [x] Lokalus vector store + metadata filter query pagrindas

### G.3 Incremental sync

- [x] Sukurti watermark storage
- [x] Sukurti space-level incremental sync coordinator pagal `lastmodified`
- [x] Sukurti polling worker'i pagal `lastmodified`
- [x] Sukurti update reconciliation logika
- [x] Sukurti delete handling incremental sync sluoksnyje

### G.4 Operaciniai darbai

- [x] Vidinis `reindex page` job
- [x] Vidinis `reindex space` job
- [x] Vidinis `full reindex` job
- [x] Sync status diagnostika

### G.5 Definition of done

- [ ] Vienas testinis space gali buti pilnai suindeksuotas
- [x] Pasikeites puslapis perindeksuojamas incremental rezimu

---

## 8. Etapas H: Semantic ir hybrid paieska

Tikslas: pagerinti retrieval kokybe.

### H.1 Chunking

- [x] Sukurti `src/indexing/chunking.ts`
- [x] Chunkinti pagal heading sekcijas
- [x] Prideti table normalization
- [x] Issaugoti `sectionPath`

### H.2 Embeddings

- [x] Pasirinkti pradine local embedding strategija
- [x] Sukurti embedding service wrapper
- [x] Prideti batching logika

### H.3 Vector DB

- [x] Pasirinkti `pgvector` / Postgres produkciniam keliui
- [x] Sukurti lokalu vector store schema / collection modeli
- [x] Sukurti Postgres/pgvector vector store schema ir query scaffolding
- [x] Prideti metadata filtrus
- [x] Igyvendinti query API

### H.4 Hybrid search

- [x] Igyvendinti `semantic` rezima
- [x] Igyvendinti `hybrid` rezima
- [x] Igyvendinti RRF fusion
- [x] Prideti ranking debug informacija

### H.5 Definition of done

- [x] `confluence.search` realiai palaiko `keyword`, `semantic`, `hybrid`
- [x] `hybrid` veikia su metadata filters ir scope enforcement

---

## 9. Etapas I: Citation ir snippet kokybe

Tikslas: pagerinti grounding ir atsakymu patikimuma.

### I.1 Citation modelis

- [x] Prideti `sectionPath`
- [x] Prideti `lastModified`
- [x] Prideti `retrievedAt`
- [x] Prideti `retrievalSource`
- [x] Naudoti esama `title` lauka kaip `pageTitle`

### I.2 Snippet kokybe

- [x] Snippet imti is tikro matching content
- [x] Uztikrinti, kad snippet atitinka cituojama puslapi bent keyword ir semantic keliuose
- [x] Isvalyti HTML ir perteklinius tagus

### I.3 Quality gates

- [x] Citation correctness testai
- [x] Benchmark klausimu rinkinys
- [x] Keyword vs hybrid palyginimas
- [x] RAG policy enforcement testai

### I.4 Definition of done

- [ ] Rezultatai turi tikslias ir naudingas citatas
- [x] Citation correctness yra matuojamas testuose

---

## 10. Etapas J: Observability

Tikslas: matyti sistemos bukle ir greitai diagnozuoti problemas.

### J.1 Logging

- [x] Prideti `requestId` i HTTP request logus
- [x] Prideti `traceId` i HTTP request ir operator endpoint logus
- [x] Prideti `toolName`
- [x] Prideti `scopeType`
- [x] Prideti `errorClass`
- [x] Prideti `confluenceStatus`
- [x] Prideti success-path tool completion logus
- [x] Prideti `durationMs` i tool success/failure logus

### J.2 Metrics

- [x] `tool_latency_ms`
- [x] `confluence_requests_total`
- [x] `confluence_rate_limit_hits_total`
- [x] `sync_lag_seconds`
- [x] Sync worker run counters ir summary metrikos
- [x] `vector_query_latency_ms`
- [x] Deployment-time `space` allowlist per `CONFLUENCE_ALLOWED_SPACE_KEYS`
- [x] Deployment-time root page allowlist per `CONFLUENCE_ALLOWED_ROOT_PAGE_IDS`
- [x] `permission_denials_total`
- [x] `http_requests_total`
- [x] `http_request_latency_ms`
- [x] `confluence_request_latency_ms`

### J.3 Tracing

- [x] Ivesti trace id
- [x] Trace'inti MCP -> Confluence -> Retrieval grandine

### J.4 Dashboardai

- [ ] Pagrindinis dashboard
- [ ] Sync dashboard
- [ ] Error dashboard

### J.5 Definition of done

- [ ] Pagrindines problemos matomos dashboarduose
- [x] Kiekvienas kritinis request turi traceable log grandine

---

## 11. Etapas K: Security ir governance

Tikslas: paruosti serveri enterprise saugumui ir auditui.

### K.1 Secret management

- [x] Nuspresti secret manager sprendima
- [ ] Iskelti produkcijos secretus is lokalios `.env`
- [ ] Prideti secret rotation plana

### K.2 Threat model

- [x] Aprasyti trust boundaries
- [x] Aprasyti auth pavirsius
- [x] Aprasyti data leakage rizikas
- [x] Aprasyti prompt/tool misuse scenarijus

### K.3 Audit

- [x] Apibrezt audit event tipus
- [ ] Loginti kritinius veiksmus
- [x] Prideti retention taisykles

### K.4 Policy controls

- [x] Space allowlist
- [x] Root page allowlist
- [ ] Tenant isolation modelis
- [ ] App access rule klaidu zymejimas
- [x] Read-only policy aprasymas ir jos laikymosi taisykles

### K.5 Definition of done

- [ ] Yra aiskus threat model
- [ ] Yra audit log schema
- [ ] Yra secret rotation ir retention taisykles

---

## 12. Etapas L: CI/CD ir release valdymas

Tikslas: tureti stabilu release procesa.

### L.1 CI

- [x] `build`
- [x] `format:check`
- [x] `typecheck`
- [x] `lint`
- [x] `test`
- [x] dependency scan

### L.2 Release artefaktai

- [ ] Docker image publish
- [x] Versioning schema
- [x] Changelog taisykles

### L.3 Release gates

- [x] Unit testai zali
- [x] Integraciniai testai zali
- [ ] Permission regression testai zali
- [x] Build green
- [ ] Security review pastabos uzdarytos

### L.4 Definition of done

- [ ] Kiekvienas release gali buti atsekamai isleistas ir atsauktas

---

## 13. Etapas M: Pilotas ir rollout

Tikslas: saugiai paleisti sistema tikriems vartotojams.

### M.1 Pilot preparation

- [ ] Pasirinkti testini Confluence scope
- [ ] Pasirinkti 3-5 pilotinius vartotojus
- [ ] Paruosti support kanala
- [x] Paruosti incident runbook'a

### M.2 Pilot execution

- [ ] Paleisti pilota ribotai grupei
- [ ] Surinkti usage feedback
- [ ] Surinkti retrieval quality feedback
- [ ] Surinkti auth / permission issues

### M.3 Full rollout

- [ ] Isplesti rollout scope
- [ ] Uzfiksuoti SLO
- [ ] Uzfiksuoti ownerius ir support procesa

### M.4 Definition of done

- [ ] Pilotas sekmingas
- [ ] Full rollout turi sign-off

---

## 14. Artimiausi darbai

### Kitas rekomenduojamas blokas

- [ ] Perleisti pilna full sync + semantic reindex su realiu Postgres/pgvector backend'u
- [ ] Paleisti retrieval benchmark su realiais Confluence duomenimis
- [x] Paruosti dashboard'u ir operatoriniu alert'u minimalius reikalavimus

### Po to

- [x] Aprasyti secret management ir API key operacini valdyma
- [x] Prideti dependency scan i CI
- [x] Paruosti pilotinio rollout ir incident runbook'u karkasa

---

## 15. Galutinis enterprise-grade priemimo kriteriju sarasas

Serveris laikomas paruostu tik tada, kai:

- [ ] ChatGPT gali prisijungti prie vieso HTTPS `/mcp` endpointo
- [x] Inbound prieiga valdoma tik per API key
- [x] Visi viesi MCP tool'ai yra tik read-only
- [x] Scope enforcement pilnai padengtas testais
- [x] Yra retry/throttling pagrindas
- [ ] Yra pilnas rate-limit telemetry sluoksnis
- [x] Yra sync ir reindex procesai
- [x] Veikia semantic ir hybrid retrieval
- [x] Yra citations ir ju correctness testai
- [ ] Yra observability dashboardai
- [ ] Yra governance, audit ir security review
- [ ] Yra rollout ir incident runbook'ai
