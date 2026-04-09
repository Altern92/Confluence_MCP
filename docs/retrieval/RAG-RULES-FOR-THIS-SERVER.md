# RAG Rules For This Server

Sis dokumentas paaiskina, kurios pirminiu RAG uzrasu idejos yra tiesiogiai aktualios siam Confluence MCP serveriui, o kurios ne.

## Esama architektura

- viesas MCP surface yra tik read-only
- inbound autentikacija yra tik API key
- Confluence upstream autentikacija vyksta per viena service account:
  - `CONFLUENCE_EMAIL`
  - `CONFLUENCE_API_TOKEN`
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

Sis principas siam serveriui tinka, bet su viena svarbia islyga:

- verification vyksta ne per galutinio vartotojo Confluence tokena
- verification vyksta per service-account `GET /wiki/api/v2/pages/{id}`

Tai vis tiek naudinga, nes padeda:

- ismesti pasenusius indekso rezultatus
- atmesti neberandamus puslapius
- atmesti service account nematomus puslapius
- uztikrinti, kad snippet negrizta is aklai pasitiketo lokalaus indekso

Svarbu: tai nera tikras per-user ACL verify.

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

Pirminiai RAG uzrasai akcentuoja verify pagal konkretaus vartotojo tokena. Sio serverio architekturoje to nera, nes:

- inbound auth yra API key
- Confluence fetch'ai eina per viena service account

Todėl siame projekte nereikia apsimetineti, kad turime per-user ACL enforcement. Turime:

- deployment-time scope enforcement
- service-account-level verification
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
- rezultatai verify'inami per service-account page fetch
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
