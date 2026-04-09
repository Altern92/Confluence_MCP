# Confluence MCP serverio enterprise-grade įgyvendinimo roadmap

## Dabartine kryptis

Sis projektas yra vystomas kaip:

- API-key-only MCP serveris
- read-only MCP tool surface Confluence atzvilgiu
- vidinis sync/indexing mechanizmas be Confluence write operaciju

## Dokumento paskirtis

Šis dokumentas aprašo visus pagrindinius žingsnius, reikalingus tam, kad dabartinis bazinis Confluence MCP serveris būtų išplėtotas iki **enterprise-grade** sprendimo, tinkamo:

- naudoti per ChatGPT connector / MCP server integraciją
- dirbti su realiais organizacijos duomenimis ir leidimais
- atlaikyti produkcinę apkrovą ir gedimus
- atitikti saugumo, stebėsenos, eksploatacijos ir valdymo reikalavimus

Tai nėra vien architektūros aprašas. Tai yra **vykdomasis planas**, skirtas:

- backlog formavimui
- etapų planavimui
- priėmimo kriterijams
- release ir rollout kontrolei

---

## 1. Dabartinė būsena

Šiuo metu projekte jau yra veikiantis pradinis pagrindas:

- HTTP MCP endpointas `POST /mcp`
- `GET /health` healthcheck
- MCP tool’ai:
  - `confluence.search`
  - `confluence.get_page`
  - `confluence.get_page_tree`
- server-side scope enforcement:
  - `page`
  - `page_tree`
  - `space`
- Confluence Cloud integracija:
  - CQL paieška per `/wiki/rest/api/search`
  - puslapio gavimas per `/wiki/api/v2/pages/{id}`
- bazinė autentikacija per Confluence API token
- struktūrizuoti tool atsakymai su citations/provenance laukais

### Dabartinės spragos

Ši versija dar nėra enterprise-grade, nes trūksta:

- vartotojo lygio autentikacijos per OAuth 2.0 (3LO)
- leidimų tikslumo daugeliui vartotojų
- retry/backoff/rate-limit valdymo
- observability, tracing, audit logų
- semantinės paieškos, indeksavimo ir sync sluoksnio
- webhookų / incremental sync
- multi-tenant ir governance modelio
- produkcinio saugumo kontrolės
- rollout, incident response ir operational readiness

---

## 2. Ką reiškia enterprise-grade šiame projekte

Sprendimas laikomas enterprise-grade tik tada, kai tenkinami visi šie kriterijai:

### Funkciniai

- Tiksliai ieško Confluence pagal `page`, `page_tree`, `space`
- Palaiko `keyword`, `semantic`, `hybrid` paiešką
- Grąžina citatas, snippetus, provenance ir stabilius URL
- Sinchronizuoja pasikeitusius duomenis be pilno reindex kiekvieną kartą

### Saugumo

- Vartotojo prieiga valdoma pagal realias Confluence teises
- Transporto lygis apsaugotas
- Origin / host validacija įjungta
- Secret’ai valdomi per secret manager
- Audit trail leidžia suprasti kas, kada ir ko ieškojo

### Patikimumo

- Toleruoja Confluence 429 ir laikinus 5xx
- Turi aiškų degradavimo režimą
- Gali būti horizontaliai plečiamas
- Turi healthchecks, readiness ir restart saugiklius

### Operaciniai

- Yra dashboardai
- Yra runbook’ai
- Yra release gating
- Yra incidentų valdymo taisyklės
- Yra testavimo ir kokybės vartai

---

## 3. Tikslinė produkto ir platformos vizija

Tikslinė architektūra turi būti tokia:

1. **MCP serveris**
   Priima ChatGPT ar kitų MCP klientų užklausas per HTTPS `/mcp`.

2. **Identity and auth layer**
   Autentikuoja vartotoją ir valdo Confluence 3LO tokenus.

3. **Confluence live access layer**
   Vykdo CQL paiešką, puslapių gavimą, descendants ir metadata užklausas.

4. **Indexing and retrieval layer**
   Tvarko chunking, embeddings, vector DB, sync ir hybrid retrieval.

5. **Security and policy layer**
   Užtikrina scope enforcement, tenant isolation, app access rules ir audituojamumą.

6. **Observability and ops layer**
   Renka logus, metrikas, traces, sync lag ir incident signalus.

---

## 4. Dabarties ir tikslo skirtumo analizė

| Sritis                 | Turime dabar                 | Enterprise tikslas                                             | Prioritetas |
| ---------------------- | ---------------------------- | -------------------------------------------------------------- | ----------- |
| MCP transportas        | HTTP `/mcp`, bazinis         | Hardened Streamable HTTP, auth, origin policy, deploy pipeline | Aukštas     |
| Confluence auth        | API token                    | OAuth 2.0 (3LO), token refresh, per-user access                | Kritinis    |
| Scope enforcement      | `page`, `page_tree`, `space` | Pilnai testuotas, security-reviewed, naudojamas visur          | Kritinis    |
| Retrieval              | CQL keyword                  | Hybrid: CQL + vector + RRF                                     | Aukštas     |
| Sync                   | Nėra                         | Full sync + incremental sync + webhook fallback                | Aukštas     |
| Rate limits            | Nėra                         | Retry, backoff, throttling, circuit breaker                    | Aukštas     |
| Observability          | Minimali                     | Metrics, logs, tracing, dashboards, alertai                    | Aukštas     |
| Multi-user / tenant    | Nėra                         | Tenant-aware isolation, policy controls                        | Aukštas     |
| Governance             | Nėra                         | Audit logs, retention, access review                           | Aukštas     |
| UI / ChatGPT app layer | Nėra                         | Pasirinktinai Apps SDK resource/UI support                     | Vidutinis   |

---

## 5. Roadmap principai

Tolimesnis įgyvendinimas turi laikytis šių principų:

- Pirma saugumas, tada semantika
- Pirma permission correctness, tada performance
- Pirma observability, tada scale
- Jokio „service account forever“ sprendimo produkcijai
- Jokio modelio pasitikėjimo scope kontrolėje
- Jokio vector retrieval be metadata filtravimo
- Jokio rollout be testų ir runbook’ų

---

## 6. Pagrindiniai workstream’ai

Toliau pateikiami visi pagrindiniai darbų srautai, kuriuos reikia uždaryti iki enterprise-grade lygio.

## 6.1. Workstream A: MCP platforma ir transportas

Tikslas:

- padaryti serverį saugiu, stabiliai deployinamu ir tinkamu ChatGPT connectoriui

Darbai:

- stabilizuoti `POST /mcp` Streamable HTTP įgyvendinimą
- aiškiai aprašyti supported methods, error model ir timeout behavior
- pridėti request size limitus
- pridėti structured JSON-RPC klaidų modelį
- įdiegti `X-Request-Id` arba `trace_id`
- pridėti graceful shutdown
- pridėti readiness/liveness endpointus
- pridėti reverse-proxy friendly konfigūraciją

Deliverables:

- produkcijai tinkamas HTTP MCP serveris
- load balancer / ingress compatible config
- documented deployment contract

## 6.2. Workstream B: Identity, auth ir permission fidelity

Tikslas:

- užtikrinti, kad kiekvieno vartotojo paieška atitiktų realias Confluence teises

Darbai:

- įdiegti Atlassian OAuth 2.0 (3LO)
- sukurti token storage
- sukurti token refresh procesą
- pridėti session-to-user mapping
- užtikrinti, kad visi Confluence kvietimai vyktų vartotojo kontekste
- service account režimą palikti tik dev/test fallback
- pridėti auth error klasifikaciją:
  - `unauthorized`
  - `forbidden`
  - `policy_block`
  - `token_expired`

Deliverables:

- 3LO auth flow
- saugus token lifecycle
- per-user Confluence access enforcement

## 6.3. Workstream C: Confluence integracija ir duomenų modelis

Tikslas:

- padaryti Confluence integraciją pilnesnę, stabilesnę ir pasiruošusią indeksavimui

Darbai:

- sutvarkyti Confluence API wrapper sluoksnį
- pridėti centralizuotą pagination logiką
- pridėti centralizuotą retry logiką
- pridėti page ancestors gavimą
- pridėti content restrictions support
- pridėti attachment metadata support
- standartizuoti page URL, space metadata, version metadata
- standartizuoti body format handling

Deliverables:

- stiprus Confluence client modulis
- vieningas domain model Confluence objektams

## 6.4. Workstream D: Indexing ir sync

Tikslas:

- pereiti nuo live-only keyword paieškos prie stabilaus, atnaujinamo retrieval sluoksnio

Darbai:

- sukurti full bootstrap sync procesą
- sukurti incremental sync pagal `lastmodified`
- pridėti watermark storage
- sukurti retryable job runner’į
- pridėti dead-letter arba failed jobs mechanizmą
- sukurti reindex-by-page ir reindex-by-space operacijas
- pridėti webhook/event fallback architektūrą

Deliverables:

- full sync job
- incremental sync job
- sync state storage
- admin reindex mechanizmai

## 6.5. Workstream E: Chunking, embeddings ir vector search

Tikslas:

- pridėti semantinę paiešką be leidimų kompromisų

Darbai:

- apibrėžti canonical body-to-text pipeline
- chunkinti pagal antraštes ir sekcijas
- pridėti table normalization
- saugoti `sectionPath`
- pasirinkti embeddings modelį
- pasirinkti vector DB
- kurti metadata filtrus:
  - `pageId`
  - `spaceKey`
  - `ancestorIds`
  - `lastModified`
  - `tenantId`
  - `visibilityMode`

Deliverables:

- embeddings pipeline
- vector schema
- metadata filters

## 6.6. Workstream F: Hybrid retrieval ir atsakymų kokybė

Tikslas:

- padidinti paieškos kokybę neprarandant permission correctness

Darbai:

- implementuoti `semantic` paiešką
- implementuoti `hybrid` paiešką
- pridėti RRF fusion
- pridėti re-ranking sluoksnį, jei reikės
- įvertinti chunk-level ir page-level scoring
- standartizuoti citation snippet generavimą

Deliverables:

- `keyword`, `semantic`, `hybrid` režimai
- retrieval quality evaluation ataskaita

## 6.7. Workstream G: Saugumas ir governance

Tikslas:

- paruošti serverį organizaciniams saugumo ir audit reikalavimams

Darbai:

- atlikti threat model review
- aprašyti trust boundaries
- pridėti secret rotation planą
- pridėti data retention policy
- pridėti audit log schema
- pridėti PII / sensitive content logging policy
- pridėti allowlist / denylist politiką erdvėms
- apdoroti app access rules ir policy blokavimus

Deliverables:

- threat model
- governance checklist
- audit-ready logging schema

## 6.8. Workstream H: Observability ir SRE readiness

Tikslas:

- matyti, kas vyksta sistemoje, ir galėti greitai diagnozuoti problemas

Darbai:

- pridėti metrikų eksportą
- pridėti structured logs
- pridėti tracing
- matuoti sync lag
- matuoti Confluence request latency
- matuoti tool success/error rate
- sukurti dashboardus
- sukurti alertus

Deliverables:

- production dashboards
- alerting policy
- incident signal definitions

## 6.9. Workstream I: Testavimas ir release quality

Tikslas:

- užtikrinti, kad release’ai būtų stabilūs ir nepažeistų leidimų

Darbai:

- schema/contract testai
- unit testai CQL builderiui ir response mapperiams
- integraciniai testai su testine Confluence aplinka
- permission regression testai
- retrieval quality benchmark
- performance testai
- chaos / fault injection testai

Deliverables:

- CI pipeline su gate’ais
- regression suite
- release sign-off checklist

---

## 7. Etapinis įgyvendinimo planas

Žemiau pateikiama rekomenduojama seka nuo dabartinės būsenos iki enterprise-grade sprendimo.

## 7.1. Etapas 0: Stabilizuoti dabartinį starterį

Tikslas:

- padaryti dabartinę bazę tvarkingą, palaikomą ir pasiruošusią rimtesniems plėtros darbams

Žingsniai:

1. Išskaidyti `src/index.ts` į atskirus modulius:
   - MCP server factory
   - HTTP app setup
   - auth middleware
   - tool registration
2. Įdiegti centralizuotą error handling sluoksnį
3. Įdiegti centralizuotą JSON-RPC klaidų formatą
4. Pridėti request logging middleware
5. Pridėti bazinius unit testus `cql.ts`, `formatting.ts`, `client.ts`
6. Pridėti CI build + lint + test pipeline

Exit criteria:

- build ir test pipeline stabiliai žali
- bazinis HTTP serveris turi aiškią struktūrą
- nėra kritinių TODO pagrindiniame request path

## 7.2. Etapas 1: Produkcinis HTTP sluoksnis

Tikslas:

- paversti serverį realiai deployinamu ir saugiu

Žingsniai:

1. Įdiegti bearer auth privalomą režimą produkcijai
2. Įdiegti host/origin policy pagal environment
3. Pridėti rate limiting pačiam MCP endpointui
4. Įdiegti timeout policy
5. Pridėti graceful shutdown
6. Paruošti Dockerfile
7. Paruošti deployment manifestus:
   - container app
   - Kubernetes
   - arba kitas organizacijos hosting modelis

Exit criteria:

- serveris gali būti paleistas už reverse proxy
- yra health, readiness ir shutdown elgsena
- yra deployment artefaktai

## 7.3. Etapas 2: OAuth 3LO ir vartotojų teisės

Tikslas:

- atsisakyti produkcinės priklausomybės nuo bendro API token

Žingsniai:

1. Sukurti OAuth callback endpointus
2. Sukurti auth flow pradžios ir pabaigos logiką
3. Įdiegti token encryption
4. Įdiegti refresh logiką
5. Įdiegti user identity mapping
6. Įdiegti per-user Confluence client factory
7. Perkelti visus Confluence requestus į vartotojo token kontekstą
8. Sukurti auth failure testus

Exit criteria:

- bent 2 skirtingi vartotojai gauna skirtingus leidimų rezultatus
- API token režimas likęs tik dev/test fallback

## 7.4. Etapas 3: Resilience, retries ir rate limits

Tikslas:

- padaryti Confluence integraciją atsparią realioms produkcinėms sąlygoms

Žingsniai:

1. Įdiegti retry politiką ant 429 ir transient 5xx
2. Pridėti exponential backoff + jitter
3. Pridėti request concurrency limits
4. Pridėti global throttling Confluence kvietimams
5. Pridėti circuit breaker arba degraded mode signalą
6. Pridėti response headers logging rate limit analizavimui

Exit criteria:

- testuose imituoti 429 atvejai apdorojami korektiškai
- sistemai nekyla request storm’ai

## 7.5. Etapas 4: Full sync ir indexing pagrindas

Tikslas:

- sukurti minimalų, bet tvirtą semantinės paieškos pamatą

Žingsniai:

1. Pasirinkti metadata store
2. Pasirinkti vector DB
3. Sukurti indeksavimo schemą
4. Sukurti bootstrap sync job
5. Sukurti chunking pipeline
6. Sukurti embeddings pipeline
7. Išsaugoti `ancestorIds`, `spaceKey`, `pageId`, `version`, `sectionPath`
8. Sukurti admin komandą pilnam reindex

Exit criteria:

- vienas testinis space gali būti pilnai suindeksuotas
- galima vykdyti metadata-filtered vector query

## 7.6. Etapas 5: Incremental sync ir event handling

Tikslas:

- išlaikyti indeksą aktualų be pilno perindeksavimo

Žingsniai:

1. Sukurti watermark storage
2. Implementuoti CQL `lastmodified` polling job
3. Pridėti delete / move / rename apdorojimą
4. Jei naudojami webhookai ar eventai:
   - pridėti event consumer
   - pridėti replay-safe handling
5. Palikti polling kaip fallback

Exit criteria:

- puslapio pakeitimas atsispindi indekse per nustatytą SLO laiką
- sync lag matuojamas dashboarde

## 7.7. Etapas 6: Hybrid retrieval

Tikslas:

- pagerinti atsakymų kokybę, ypač sudėtingesnėms natūralios kalbos užklausoms

Žingsniai:

1. Pridėti `semantic` paiešką į `confluence.search`
2. Pridėti `hybrid` režimą
3. Implementuoti RRF fusion
4. Įdiegti testų benchmark’ą
5. Tuning:
   - chunk size
   - topK keyword
   - topK semantic
   - RRF k
   - rerank threshold

Exit criteria:

- benchmarke `hybrid` aiškiai lenkia `keyword-only` bent dalyje scenarijų
- nėra leidimų pažeidimų per vector retrieval

## 7.8. Etapas 7: Observability ir operational readiness

Tikslas:

- paruošti komandą eksploatuoti sistemą stabiliai

Žingsniai:

1. Įdiegti structured logs
2. Įdiegti distributed tracing
3. Įdiegti metrics endpoint arba exporter
4. Sukurti dashboardus
5. Sukurti alertus
6. Sukurti runbook’us:
   - Confluence outage
   - rate-limit spike
   - sync lag
   - token refresh failures
   - vector DB issue

Exit criteria:

- kiekvienam kritiniam alertui yra runbook’as
- on-call komanda gali diagnozuoti pagrindines problemas be kūrėjo pagalbos

## 7.9. Etapas 8: Governance, audit ir rollout

Tikslas:

- užtikrinti, kad sprendimas būtų priimtinas enterprise valdymo kontekste

Žingsniai:

1. Parengti data retention taisykles
2. Parengti incident notification flow
3. Parengti access review procesą
4. Parengti change management procesą
5. Parengti release approval checklist
6. Paleisti pilotą su ribota vartotojų grupe
7. Surinkti feedback ir security review pastabas
8. Palaipsniui didinti rollout apimtį

Exit criteria:

- pilotas sėkmingas
- security review uždarytas
- governance stakeholders davė sign-off

---

## 8. Detalus techninis backlog’as

Žemiau pateikiamas konkretus backlog’as, kurį galima tiesiogiai paversti užduotimis.

## 8.1. Kodo bazės refaktorizacija

- Iškelti MCP tool registraciją į `src/server/register-tools.ts`
- Iškelti HTTP app setup į `src/server/http-app.ts`
- Sukurti `src/server/errors.ts`
- Sukurti `src/server/middleware/request-context.ts`
- Sukurti `src/server/middleware/auth.ts`
- Sukurti `src/server/middleware/origin-policy.ts`
- Sukurti `src/server/middleware/logging.ts`
- Sukurti `src/confluence/pagination.ts`
- Sukurti `src/confluence/retry.ts`
- Sukurti `src/confluence/errors.ts`

## 8.2. Auth backlog

- Atlassian app registracija
- OAuth callback endpoint
- Auth session storage
- Token encryption at rest
- Refresh token rotation handling
- Per-user client factory
- Auth metrics
- Auth failure alertai

## 8.3. Retrieval backlog

- Chunk schema
- Metadata schema
- Embedding service wrapper
- Vector query abstraction
- RRF module
- Snippet selection policy
- Citation normalization policy

## 8.4. Sync backlog

- Full sync job
- Incremental sync job
- Watermark persistence
- Delete reconciliation
- Reindex by page
- Reindex by space
- Admin diagnostics endpoint arba admin tool

## 8.5. Observability backlog

- JSON log schema
- Prometheus/OpenTelemetry integracija
- Grafana / Azure Monitor / kitas dashboard sluoksnis
- Tool latency metrics
- Confluence upstream metrics
- Sync lag metrics
- Alert rules

## 8.6. Security backlog

- Threat model dokumentas
- Secret inventory
- Token storage review
- Pen test scope
- Dependency scanning
- SBOM / artifact provenance
- Audit event taxonomy

---

## 9. Release gates

Kiekvienas etapas turi turėti aiškų gate prieš judant toliau.

## Gate A: Starteris stabilus

- build žalias
- baziniai unit testai žali
- MCP inspector testas praeina

## Gate B: HTTP produkciškai paruoštas

- `/mcp` veikia už reverse proxy
- yra auth middleware
- yra origin/host policy
- yra Docker artefaktas

## Gate C: Permission correctness

- vartotojų leidimų regresiniai testai žali
- nėra cross-user leakage
- security review uždarytas

## Gate D: Indexing pagrindas

- bent vienas testinis space indeksuojasi nuo nulio
- sync state išsaugomas
- galima filtruoti per `spaceKey` ir `ancestorIds`

## Gate E: Hybrid retrieval ready

- benchmarkas parodo pagerėjimą
- nėra regression į citation correctness

## Gate F: Operational readiness

- dashboardai gyvi
- alertai sukonfigūruoti
- runbook’ai parašyti
- pilotas sėkmingai įvykdytas

---

## 10. Testavimo strategija

Enterprise-grade lygis nebus pasiektas be pilnos testavimo strategijos.

## 10.1. Unit testai

Padengti bent:

- CQL query builder
- scope validation
- HTML/snippet normalization
- page URL resolution
- error mapping
- retry policy calculations

## 10.2. Contract testai

Padengti:

- MCP tool schema suderinamumą
- JSON-RPC klaidų formatą
- output schema stabilumą

## 10.3. Integraciniai testai

Padengti:

- realius Confluence search scenarijus
- page fetch
- pagination
- 401/403/429/5xx atvejus

## 10.4. Permission regression testai

Privaloma:

- bent du vartotojai su skirtingomis teisėmis
- bent vienas ribotas puslapis
- bent vienas restricted subtree

## 10.5. Retrieval kokybės testai

Reikia benchmark’o su:

- klausimų rinkiniu
- expected relevant pages
- citation correctness
- Recall@K
- MRR
- hybrid vs keyword-only palyginimu

## 10.6. Performance testai

Reikia:

- tool latency testų
- concurrent request testų
- sync throughput testų
- vector query latency testų

---

## 11. SLO ir KPI

Rekomenduojami pradiniai tikslai:

### Užklausų SLO

- `confluence.search` p95 < 3 s keyword režime
- `confluence.get_page` p95 < 2 s
- error rate < 1% normaliomis sąlygomis

### Sync SLO

- incremental sync lag < 10 min
- webhook assisted update propagation < 2 min

### Kokybės KPI

- citation correctness > 95%
- permission leakage incidents = 0
- hybrid retrieval recall pagerėjimas prieš keyword-only

### Operaciniai KPI

- MTTR mažėja po dashboardų ir runbook’ų įvedimo
- auth token refresh failure rate < nustatyto slenksčio

---

## 12. Rekomenduojama komandos sudėtis

Minimaliai:

- 1 backend engineer
- 1 engineer su stipresniu security/auth background

Patogiau:

- 2 backend/platform engineers
- 1 security / IAM konsultuojantis žmogus
- 1 QA / test automation inžinierius daliniam laikui
- 1 produktinis stakeholderis ar knowledge owner’is benchmark’ams

---

## 13. Laiko planas

Realistiška seka:

| Etapas     | Trukmė   |
| ---------- | -------- |
| Etapas 0-1 | 1-2 sav. |
| Etapas 2   | 2-4 sav. |
| Etapas 3   | 1-2 sav. |
| Etapas 4-5 | 3-5 sav. |
| Etapas 6   | 2-3 sav. |
| Etapas 7-8 | 2-4 sav. |

### Bendra prognozė

- **Minimum production path:** 8-12 savaičių
- **Pilnas enterprise path:** 12-20 savaičių

Tai priklausys nuo:

- 3LO sudėtingumo
- organizacijos hosting modelio
- governance review proceso
- attachment / indexing apimties

---

## 14. Ką daryti pirmiausia šiame repo

Kad progresas būtų tiesioginis ir ne per daug išsiplėstų, rekomenduojama tokia seka:

### Pirmas sprintas

- suskaidyti `src/index.ts`
- pridėti request logging
- pridėti centralizuotas klaidas
- pridėti unit testus CQL ir formatting
- pridėti Dockerfile

### Antras sprintas

- įdiegti retries/backoff
- įdiegti bearer auth production režimą
- įdiegti basic metrics
- paruošti deploy artefaktus

### Trečias sprintas

- pradėti OAuth 3LO
- sukurti user token storage
- perkelti Confluence client į per-user režimą

### Ketvirtas sprintas

- full sync
- chunking
- embeddings
- vector DB schema

### Penktas sprintas

- incremental sync
- hybrid retrieval
- benchmark ir tuning

---

## 15. Priėmimo kriterijai enterprise-grade lygiui

Sprendimas laikomas enterprise-grade tik tada, kai:

1. ChatGPT gali stabiliai prisijungti prie viešo HTTPS `/mcp` endpointo
2. Vartotojų teisės taikomos per realų vartotojo Confluence kontekstą
3. Scope enforcement neturi žinomų leakage scenarijų
4. Yra production-grade observability
5. Yra retry/throttling/rate-limit handling
6. Yra sync ir reindex procesai
7. Yra benchmark’as ir retrieval kokybės metrika
8. Yra security review ir audit trail
9. Yra runbook’ai ir rollout planas
10. Yra pilotinis ir pilnas release gate

---

## 16. Galutinis rekomenduojamas tikslinis rezultatas

Galutinis sprendimas turėtų atrodyti taip:

- viešas, saugus HTTPS MCP serveris
- OAuth 3LO paremtas per-user Confluence access
- keyword + semantic + hybrid paieška
- citations/provenance kaip pirma klasės objektai
- incremental sync ir galimas webhook acceleration
- metrics, tracing, audit logs, alertai
- aiškus governance ir rollout modelis

Tai jau būtų ne „demo MCP serveris“, o pilnavertis organizacinis integracinis produktas.

---

## 17. Rekomenduojamas kitas žingsnis

Po šio dokumento patvirtinimo siūlomas labai konkretus tęsinys:

1. Iš šio roadmap suformuoti epics ir user stories
2. Suskirstyti darbus į 2 savaičių sprintus
3. Pradėti nuo:
   - `src/index.ts` refaktorizacijos
   - retries/backoff
   - logging/metrics
   - Docker/deploy pagrindo
4. Tuo pačiu metu atsidaryti auth track’ą 3LO dizainui

Jei šis žingsnis bus padarytas, projektas pereis iš „starterio“ į realų produkcinio įgyvendinimo kelią.
