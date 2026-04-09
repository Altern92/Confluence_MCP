# RAG Rules For This Server

Sis dokumentas paaiskina, kurios pirminiu RAG uzrasu idejos yra tiesiogiai aktualios siam Confluence MCP serveriui, o kurios ne.

## Esama architektura

- viesas MCP surface yra tik read-only
- inbound autentikacija yra tik API key
- Confluence upstream autentikacija dabar turi du rezimus:
  - `CONFLUENCE_EMAIL`
  - `CONFLUENCE_API_TOKEN`
  - `CONFLUENCE_RUNTIME_AUTH_MODE=service_account|prefer_user|require_user`
- `confluence.search` jau palaiko:
  - `keyword`
  - `semantic`
  - `hybrid`
- sync, indexing ir reindex egzistuoja tik kaip vidiniai serverio mechanizmai

## Kas is pirminiu RAG uzrasu tinka tiesiogiai

### 1. Scope-first retrieval

Tai jau yra pagrindinis sio serverio principas ir ji reikia islaikyti:

- `space` -> CQL `space = "KEY"`
- `page_tree` -> CQL `ancestor = <pageId>`
- `page` -> siauras konkretus scope
- papildomai veikia deployment-time allowlist:
  - `CONFLUENCE_ALLOWED_SPACE_KEYS`
  - `CONFLUENCE_ALLOWED_ROOT_PAGE_IDS`

### 2. Conservative retrieval budgets

RAG politika turi riboti ne tik tai, kiek rezultatu graziname, bet ir kiek kandidatu surenkame:

- `maxTopK`
- `maxVerifications`
- `maxSnippetChars`

Tai apsaugo nuo per dideliu atsakymu, nereikalingu fetch'u ir triuksmo rezultate.

### 3. Verify-before-reveal

Sis principas siam serveriui tinka, bet reikia atskirti du scenarijus:

- kai `CONFLUENCE_RUNTIME_AUTH_MODE=require_user` arba `prefer_user` ir vartotojas pateikia `X-Confluence-*` credentials:
  - verification vyksta per to konkretaus vartotojo Confluence credentials
- kai serveris dirba `service_account` rezimu arba vykdo background indexing:
  - verification vyksta per service-account `GET /wiki/api/v2/pages/{id}`

Tai vis tiek naudinga, nes padeda:

- ismesti pasenusius indekso rezultatus
- atmesti neberandamus puslapius
- atmesti aktyviam auth kontekstui nematomus puslapius
- uztikrinti, kad snippet negrizta is aklai pasitiketo lokalaus indekso

Svarbu:

- tik `service_account` rezime tai nera tikras per-user ACL verify
- `require_user` rezime verify jau gali veikti kaip realus per-user post-filter

### 4. Citation-first rezultatai

Paieskos rezultatai turi likti grounded:

- `pageId`
- `title`
- `url`
- `sectionPath`
- `retrievalSource`
- `rankingDebug`
- `verificationStatus`

Tai ypac naudinga VS Code scenarijuje, kur tas pats agentas lygina informacija is keliu MCP serveriu.

### 5. Attachment policy

Pirminiai RAG uzrasai teisingai akcentuoja attachments. Siame serveryje:

- attachment metadata gali buti skaitoma
- attachment extraction ir attachment-based retrieval turi buti laikomi konservatyviais
- pagal nutylejima nereikia attachment turinio traukti i bendra retrieval kelia

## Kas netinka 1:1

### Per-user authorization fidelity

Pirminiai RAG uzrasai akcentuoja verify pagal konkretaus vartotojo tokena. Dabar siame projekte tam jau yra pagrindas, bet ne visos storage dalys dar pilnai shared-production brandos:

- inbound auth yra API key
- runtime fetch'ai gali eiti per vartotojo `X-Confluence-*` credentials
- indexing ir background darbai vis dar eina per service account

Todėl siame projekte reikia aiskiai skirti:

- deployment-time scope enforcement
- per-user verify runtime requestams, kai ijungtas `require_user` arba `prefer_user`
- service-account-level verification background darbams
- read-only public MCP surface

## Kas jau igyvendinta

Siame serveryje jau yra:

- `keyword`, `semantic`, `hybrid`
- RRF fusion
- heading-aware chunking
- table normalization
- sync watermarking
- benchmarking ir citation correctness matavimas
- `default-secure-rag` politika paieskai
- `policyApplied` paieskos atsakyme
- `verificationStatus` paieskos rezultatuose
- `debug` laukai paieskai, kai jie explicit paprasomi

## Dabartine RAG politika

Siame etape `confluence.search` taiko `default-secure-rag`:

- scope yra privalomas
- `topK` yra clamp'inamas politikos ribomis
- snippet ilgis ribojamas
- rezultatai verify'inami per aktyvu auth konteksta:
  - vartotojo credentials runtime requestuose, jei jie naudojami
  - service account background srautuose
- verify nepraeje kandidatai drop'inami

## Kitas rekomenduojamas zingsnis

Kai serveris bus keliamas i tikra host'a, verta prideti:

- `verification_failures_total`
- `verification_drop_total{reason}`
- `retrieval_mode_usage_total`
- minimalu dashboard'a:
  - sync lag
  - verification drop spike
  - rate-limit spike

## Praktine isvada

Sie RAG uzrasai padeda siam projektui ne tiek kaip teorija apie embeddings, kiek kaip taisykliu rinkinys:

- retrieval turi buti scope-first
- rezultatai turi buti verify-before-reveal
- snippet'ai turi buti konservatyvus
- attachment elgsena turi buti aiskiai valdoma
- debug laukai turi padeti paaiskinti, kodel grazintas butent toks rezultatas

Butent toks RAG sluoksnis geriausiai tinka siam read-only Confluence MCP serveriui.
