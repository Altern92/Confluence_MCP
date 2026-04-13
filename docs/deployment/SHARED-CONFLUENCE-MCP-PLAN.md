# Shared Confluence MCP Plan

Sis dokumentas suraso visas pagrindines uzduotis, kuriu reikia, kad sis `confluence-mcp` serveris:

- saugiai pasileistu salia jau veikiancio Azure DevOps MCP serverio
- galetu susiindeksuoti visa leistina Confluence turini
- taptu bendra "tarpine stotele" kitiems MCP klientams
- nebutu tiesiog vieno service account vartai
- galetu priimti kitu vartotoju Confluence credentials ir naudoti juos request metu
- neisduotu vienam vartotojui kito vartotojo nematomo turinio

Sis planas remiasi dabartine lokalia repo bukle `/opt/confluence-mcp` ir esama gyva Azure DevOps MCP infrastruktura `/opt/mcp-server`.

## Tikslinis rezultatas

Norimas galutinis modelis:

1. viesas ingress lieka esamas Azure DevOps `nginx`
2. `confluence-mcp` paleidziamas kaip atskiras backend servisas
3. viesi route'ai naujam servisui:
   - `/confluence/mcp`
   - `/confluence/health`
   - `/confluence/ready`
4. esamas Azure DevOps route nelieciamas:
   - `/mcp`
   - `/health`
5. Confluence indexing gali buti daromas per service account
6. user request metu Confluence prieiga vyksta su konkretaus vartotojo credentials
7. shared index naudojamas tik kaip kandidatu paieskos sluoksnis
8. pries grazinant rezultatus atliekamas per-user access validation

## Nekeiciamos taisykles

- Negalima sulauzyti esamo Azure DevOps MCP serverio.
- Negalima perrasyti `/opt/mcp-server/nginx/nginx.conf` is GitHub.
- Jei keiciamas esamas `nginx.conf`, reikia daryti tik tikslu lokalu diff.
- Naujas Confluence MCP neturi konfliktuoti su host portais.
- Jei imanoma, nereikia publishinti naujo host porto Confluence MCP servisui.
- Secret'ai neturi atsidurti dokumentuose, loguose ar test outputuose.

## Dabartine bukle

### Azure DevOps MCP

Patvirtinta lokaliai:

- repo branch: `main`
- HEAD: `c9b8cf9`
- lokalus `nginx/nginx.conf` yra pakeistas ir svarbus veikimui
- host publish:
  - `127.0.0.1:3000 -> 3000` `mcp` servisui
  - `80:80` ir `443:443` `nginx` servisui
- aktyvus domeninis route modelis jau remiasi lokalia `nginx.conf` versija
- `.env` turi `ALLOWED_HOSTS` su domenu ir IP

### Confluence MCP

Patvirtinta lokaliai:

- repo branch: `main`
- HEAD: `8fe3d02`
- serverinis `.env` jau sukurtas ir uzpildytas aktyviam deployment
- jau yra paruostas serverinio `.env` sablonas:
  - `.env.server.example`
- lokali `dist/` kopija po cleanup nepalikta repozitorijoje
- `.data/` ir `.pgdata/` jau sukurti gyvo Docker stacko
- default `docker-compose.yml` dabar nera tinkamas saugiam shared serverio deployment, nes:
  - publishina `3001:3000`
  - publishina `5432:5432`
  - nenaudoja esamo isorinio Docker tinklo
- jau prideti nauji serveriniai artefaktai:
  - `docker-compose.server.yml`
  - `deploy/nginx/confluence-mcp-paths.conf.example`
- jau ivestas pirmas request-scoped Confluence auth pagrindas:
  - `src/confluence/runtime-auth.ts`
  - `src/http/middleware/confluence-runtime-auth.ts`
  - `src/confluence/client.ts`
- jau atnaujinti:
  - `.env.example`
  - `.env.server.example`
  - `README.md`
  - `docs/deployment/UBUNTU-DEPLOY.md`
  - `docs/retrieval/RAG-RULES-FOR-THIS-SERVER.md`
- jau prideti pirmi testai naujam auth modeliui:
  - `tests/http/confluence-runtime-auth.test.ts`
  - papildymai `tests/confluence/client.test.ts`

### Kas jau padaryta repozitorijoje

Pirma implementacijos banga jau atlikta.

Igyvendinta:

- request-scoped Confluence auth per `X-Confluence-*` header'ius
- atskirti rezimai:
  - `service_account`
  - `prefer_user`
  - `require_user`
- runtime requestai gali naudoti vartotojo Confluence credentials
- background/indexing srautai vis dar gali naudoti service account
- shared server deployment compose failas be naujo host porto
- nginx path-based route pavyzdys shared ingress modeliui
- request logging papildytas auth fingerprint lygio auditu be raw secret'u
- is log konteksto pasalintas nereikalingas vartotojo `principal` / email atspaudas
- RAG verify faze pagerinta, kad neuzstrigtu po pirmu drop'u
- local ir server compose failai suparametrizuoti per `POSTGRES_*` ir host-port env'us

Dar nepatvirtinta gyvai:

- semantic/hybrid paieska ant realiai uzpildyto shared indekso
- pilni cross-user leakage testai su dviem atskirais vartotojais
- production schedule nuolatiniam indekso atnaujinimui dar neturi pilno acceptance testo

Jau patvirtinta lokaliai ne per Docker:

- `npm run verify` praeina sekmingai
- `npm run build` praeina sekmingai
- serveris sekmingai startuoja lokaliai su laikinais runtime override ant `127.0.0.1:3301`
- `/health` ir `/ready` grazina `200`
- autorizuotas `POST /mcp` su `tools/list` grazina `200`
- gyvas `confluence.search` per MCP jau grazino realius rezultatus is `PA` space

Jau patvirtinta gyvai per Docker ir shared nginx:

- `docker-compose.server.yml` stackas sekmingai pakeltas
- `confluence-mcp-postgres` ir `confluence-mcp-server` konteineriai tapo `healthy`
- vidiniai `/health` ir `/ready` veikia is konteinerio vidaus
- nauji route'ai per esama ADO `nginx` veikia:
  - `http://10.121.21.76/confluence/health`
  - `http://10.121.21.76/confluence/mcp`
- `https://ado.mcp.thermofisher.lt/confluence/health`
- `https://ado.mcp.thermofisher.lt/confluence/mcp`
- esamas ADO `http://10.121.21.76/health` ir `https://ado.mcp.thermofisher.lt/health` neluzo
- pilnas bootstrap indexing baigtas sekmingai:
  - `runId: 5edbca47-1373-4b61-bff0-4e48da7f1901`
  - `startedAt: 2026-04-09T12:59:40.147Z`
  - `finishedAt: 2026-04-10T07:25:56.616Z`
  - `pagesDiscovered: 12155`
  - `pagesIndexed: 12154`
  - `chunksProduced: 78602`
- dabartinis snapshot mastas po bootstrap:
  - `documents.json`: `12155` dokumentai
  - pgvector: apie `78k` vector irasu
  - realiai uzpildyti `131` space is leistino `135` saraso
- paruostas production weekly reindex kelias:
- hoste jau ijungtas production weekly reindex kelias:
  - `scripts/indexing-weekly-sync.sh`
  - `deploy/systemd/confluence-mcp-weekly-sync.service.example`
  - `deploy/systemd/confluence-mcp-weekly-sync.timer.example`
  - `systemd` timer aktyvus penktadieni `20:00 UTC`

Techninis apribojimas sioje masinoje siuo metu:

- hoste vis dar nera globalaus `node` / `npm`
- Docker prieiga siam vartotojui tiesiogiai neveikia be `sudo`
- taciau gyvas deploy ir smoke test jau atlikti naudojant `sudo`

### Likusios spragos po pirmos implementacijos

Dabartinis kodas jau turi pirma per-user auth pagrinda, bet dar nepasieke pilno tavo tikslinio modelio.

Svarbiausi ribojimai:

- `src/security/access-policy.ts`
  - vis dar moka tik static allowlist pagal `space` ir `root page`
- `src/indexing/create-indexing-stores.ts`
  - document index ir sync state vis dar turi tik `memory` arba `file`
- `src/retrieval/postgres-vector-store.ts`
  - Postgres vis dar naudojamas tik vector store, ne visam document index
- nepadarytas gyvas end-to-end deploy testas su realiu `nginx`
- nepadaryti pilni cross-user leakage integraciniai testai su realiu backend'u
- nepadarytas pilnas production-level multi-user acceptance test planas

## Tikslines architekturos kryptis

### 1. Deploy topologija

Tikslinis serverinis modelis:

- esamas `/opt/mcp-server` lieka kaip vienintelis viesas reverse proxy taskas
- naujas `/opt/confluence-mcp` paleidziamas atskirai
- `confluence-mcp` backendas neklauso ant naujo viesai publishinto host porto
- `confluence-mcp` prijungiamas prie bendro Docker tinklo `mcp-server_internal`
- esamas Azure DevOps `nginx` proxina i vidini Confluence servisa pagal path prefix

### 2. Routing modelis

Tiksliniai route'ai:

- Azure DevOps MCP:
  - `/mcp`
  - `/health`
- Confluence MCP:
  - `/confluence/mcp`
  - `/confluence/health`
  - `/confluence/ready`
  - opcioniskai `/confluence/metrics`
  - opcioniskai `/confluence/sync-status`

### 3. Auth modelis

Reikalingas dvieju sluoksniu auth:

- sluoksnis A: MCP serverio apsauga
  - API key tarp kliento ir `confluence-mcp`
- sluoksnis B: Confluence access auth
  - kiekvienas klientas perduoda savo Confluence credentials
  - serveris request metu naudoja butent juos

### 4. Shared index modelis

Tikslinis modelis:

- indexing daromas su serverio service account
- shared index saugo tik paieskos kandidatus ir technine metadata
- semantic/hybrid retrieval is index gauna kandidatus
- pries grazinant klientui kandidatai prafiltruojami per user credentials

Tai reiskia:

- indexas gali buti bendras
- galutinis rezultatu sarasas negali remtis vien service account matomumu

## Darbu planas

## Etapas 0. Freeze ir apsauga

Tikslas: pries bet koki deployment darba apsaugoti veikianti Azure DevOps MCP.

Uzduotys:

- [x] nejudinti `/opt/mcp-server/nginx/nginx.conf`, kol nera paruostas tikslus minimalus diff
- [x] neforsuoti `git pull` i `/opt/mcp-server`
- [x] neforsuoti jokio `docker compose down` esamam ADO stack
- [x] uzfiksuoti lokaliai, kad ADO `nginx.conf` yra intentional local override
- [x] pries kiekviena `nginx` pakeitima tureti:
  - backup kopija
  - `nginx -t`
  - aiski rollback komanda

Priemimo kriterijai:

- esamas `/mcp` ir `/health` ir toliau veikia identiskai

## Etapas 1. Serverinio deploy varianto paruosimas Confluence MCP

Tikslas: parengti nauja Confluence serverio paleidima taip, kad jis nesikirstu su ADO MCP.

Uzduotys:

- [x] sukurti atskira serverini compose faila, pvz. `docker-compose.server.yml`
- [x] pasalinti host `ports` Confluence `mcp` servisui
- [x] jei naudojamas Postgres:
  - nepublishinti `5432` i hosta
  - palikti ji tik vidiniam compose tinklui
- [x] prijungti `confluence-mcp` servisa prie isorinio Docker tinklo `mcp-server_internal`
- [x] prireikus palikti papildoma lokalu vidini compose tinkla Postgres servisui
- [x] nustatyti `HOST=0.0.0.0` konteineryje
- [x] nustatyti tinkama `MCP_ALLOWED_HOSTS`, kad tiktu:
  - domenas
  - serverio IP
- [x] parinkti persistent volume vietas:
  - `.data/`
  - `.pgdata/`, jei naudojamas local Postgres
- [x] sukurti realu `.env` pagal serverio modeli
- [x] paruosti serverinio `.env` sablona pagal shared deployment modeli

Priemimo kriterijai:

- `confluence-mcp` gali startuoti neprasydamas naujo host porto
- jis neblokuoja `80`, `443`, `3000`
- jis matomas per Docker network is bendro `nginx`

## Etapas 2. Reverse proxy integracija be ADO route sugadinimo

Tikslas: prijungti Confluence MCP prie esamo `nginx`, nepakeiciant esamo Azure DevOps marsrutavimo.

Uzduotys:

- [x] isanalizuoti esama `/opt/mcp-server/nginx/nginx.conf`
- [x] paruosti minimalu route diff tik Confluence servisui
- [x] prideti tikslias `location` sekcijas:
  - `/confluence/mcp`
  - `/confluence/health`
  - `/confluence/ready`
- [x] forwardinti sias antrastes:
  - `Host`
  - `X-Forwarded-Proto`
  - `X-Forwarded-For`
  - `X-Real-IP`
  - `Authorization`
  - `X-API-Key`
- [x] prideti ir Confluence runtime auth header forwardinima:
  - `X-Confluence-Authorization`
  - `X-Confluence-Email`
  - `X-Confluence-Api-Token`
  - `X-Confluence-Base-Url`
- [x] uztikrinti, kad esamas `/mcp` ir toliau proxy'inamas i Azure DevOps `mcp:3000`
- [x] `nginx -t`
- [x] reload tik po sekmingos validacijos

Priemimo kriterijai:

- `https://ado.mcp.thermofisher.lt/mcp` ir toliau rodo i Azure DevOps MCP
- `https://ado.mcp.thermofisher.lt/confluence/health` rodo i Confluence MCP
- IP route modeli galima papildyti analogiskais `/confluence/...` keliais, jei reikia

## Etapas 3. Bazinis Confluence MCP paleidimas

Tikslas: paleisti serveri su esamu upstream auth modeliu, dar nepradedant per-user relay logikos.

Uzduotys:

- [x] sukurti serverini `.env`
- [x] uzpildyti:
  - `APP_ENV=production`
  - `MCP_TRANSPORT=http`
  - `MCP_API_KEY`
  - `MCP_ALLOWED_HOSTS`
  - `CONFLUENCE_BASE_URL`
  - `CONFLUENCE_EMAIL`
  - `CONFLUENCE_API_TOKEN`
  - `INDEXING_*`
- [x] paleisti `npm ci`
- [x] paleisti `npm run verify`
- [x] paleisti `npm run build`
- [x] sukurti ir paleisti Docker image arba pasirinkta runtime varianta
- [x] patikrinti:
  - `/health`
  - `/ready`
  - `POST /mcp`

Priemimo kriterijai:

- serveris stabiliai startuoja
- health endpointai gyvi
- tool list matoma per MCP

Pastaba:

Sis etapas dar nesprendzia tavo galutinio per-user credentials reikalavimo. Jis tik paruosia baze saugiam serveriniam deploy.

## Etapas 4. Pilnas indexing planas

Tikslas: susiindeksuoti visa leistina Confluence turini kaip shared paieskos sluoksni.

Svarbi pastaba:

"Visa Confluence" praktikoje turi reiksti tik ta scope, kuri operatorius yra samoningai leidziama indeksuoti. Negalima aklai indeksuoti visko vien del to, kad service account tai mato.

Uzduotys:

- [x] apsispresti del indexing storage:
  - `file` tik laikinas arba mazas variantas
  - `postgres + pgvector` rekomenduojamas shared serveriui
- [x] apsispresti del document index storage:
  - laikinas variantas `file`
  - ilgalaikis variantas reikalaus naujo shared store, nes dabar jo dar nera
- [x] nustatyti approved indexing scope:
  - `CONFLUENCE_ALLOWED_SPACE_KEYS`
  - opcioniskai `CONFLUENCE_ALLOWED_ROOT_PAGE_IDS`
- [x] apsispresti del inicialaus indexing paleidimo budo:
  - `full`
  - `space`
  - batch pagal spaces
- [x] nustatyti `INDEXING_SYNC_ENABLED`
- [x] nustatyti `INDEXING_SYNC_RUN_ON_STARTUP`
- [x] nustatyti `INDEXING_SYNC_SPACE_KEYS`
- [x] paleisti pradini indexing job
- [x] patikrinti dokumentu ir chunk'u kieki
- [ ] patikrinti, kad semantic search grazina kandidatus
- [x] ivertinti reindex strategija:
  - poll interval
  - full reconcile interval
  - retry modelis

Pastaba:

- `INDEXING_SYNC_ENABLED` samoningai paliktas `false`
- production atnaujinimui pasirinktas host-level `systemd timer` su savaitiniu pilnu reindex penktadieni `20:00 UTC`

Priemimo kriterijai:

- indeksas turi tiketina dokumentu apimti
- semantic/hybrid ieska veikia
- reindex nepazeidzia Confluence rate limit

## Etapas 5. Per-user Confluence credentials modelis

Tikslas: padaryti, kad klientai jungtusi i si MCP, o jis request metu naudotu ju paciu Confluence credentials.

Tai yra didziausias architekturinis pakeitimas.

Reikalingos uzduotys:

- [x] apibrezti inbound auth contract kliento -> MCP serveriui
- [x] pasirinkti, kaip klientas perduos Confluence credentials:
  - `X-Confluence-Authorization: Basic ...`
  - arba `X-Confluence-Email` + `X-Confluence-Api-Token`
  - saugesnis signed credential envelope
- [x] nuspresti, kaip atskirti:
  - MCP API key serverio apsaugai
  - Confluence user auth request vykdymui
- [x] isplesti `request-context` kad laikytu:
  - user auth source
  - user credential fingerprint
  - galimai user identifier
- [x] atskirti MCP API key auth middleware nuo Confluence runtime auth middleware
- [x] sukurti request-scoped Confluence auth abstractions
- [x] perdirbti `src/confluence/client.ts`, kad jis moketu:
  - naudoti globalu service account indexing darbams
  - naudoti per-request user credentials runtime requestams
- [x] perdirbti request konteksto wiring, kad aktyvus auth kontekstas butu pasiekiamas per request lifecycle
- [ ] perdirbti dependency injection sluoksni, kad `contentService` ir paieska galetu gauti request-scoped client be `AsyncLocalStorage`
- [ ] nuspresti, ar reikia naujo helper, pvz. `createConfluenceClientForRequest(...)`
- [x] prideti header forwarding per `nginx`, jei vartotojo credentials ateina per HTTP antrastes
- [x] atnaujinti testus auth ir request context sluoksniuose

Priemimo kriterijai:

- du skirtingi vartotojai gali kreiptis i ta pati MCP
- serveris nenaudoja vien service account runtime skaitymui
- vartotojo credentials nera issaugomi ilgalaikiame storage
- logai nerodo raw credentials

## Etapas 6. Shared index + per-user access filtering

Tikslas: uztikrinti, kad shared semantic index nenutekintu uzdrausto turinio.

Dabartine svarbi isvada:

Upstream turetas post-retrieval verification sluoksnis jau pradetas adaptuoti aktyviam auth kontekstui, bet visas saugumo modelis dar neuzbaigtas.

Reikalingos uzduotys:

- [x] pakeisti verification logika, kad ji naudotu aktyvu runtime auth konteksta
- [x] isplesti semantic/hybrid paieska, kad overfetchintu daugiau kandidatu pries filtravima
- [x] uztikrinti, kad po `forbidden` drop'u vartotojas vis tiek gautu pakankamai rezultatu
- [ ] perziureti `debug` lauka, kad jis nenutekintu per daug informacijos apie atmestus kandidatus
- [ ] ivertinti, ar index metadata neturi laikyti papildomo ACL snapshot
- [ ] jei laikomas ACL snapshot:
  - tai gali padeti pre-filtering
  - bet negali pakeisti gyvo per-user patikrinimo
- [ ] ivertinti, ar `tenantId` siame projekte turi likti techninis shard'inimas, o ne user isolation pakaitalas
- [x] itraukti aktyvu runtime auth konteksta i:
  - `search`
  - `get_page`
  - `get_page_tree`
  - `get_page_descendants`
  - `get_page_attachments`, jei reikia

Priemimo kriterijai:

- semantic rezultatai negrizta vien del to, kad juos mate service account
- vartotojas negauna snippet'o ar pavadinimo is puslapio, kurio nemato
- keyword, semantic ir hybrid visi laikosi vienodos permission logikos

## Etapas 7. Shared storage stiprinimas production naudojimui

Tikslas: pereiti nuo "veikia lokaliai" prie "veikia kaip bendras serveris".

Uzduotys:

- [ ] apsispresti del shared Postgres instanco arba lokalaus serverinio Postgres
- [ ] palikti `pgvector` semantic store
- [ ] suplanuoti nauja bendra document index store realizacija
- [ ] suplanuoti nauja bendra sync state store realizacija
- [ ] ivertinti migraciju poreiki
- [ ] ivertinti backup ir restore strategija
- [ ] apriboti kas gali pasiekti DB ir volume'us

Pastaba:

Jei document index ir sync state liks tik `file`, serveris gali veikti, bet shared production rezime tai bus silpnesnis variantas nei pilnai centralizuotas store.

## Etapas 8. Observability ir saugumas

Tikslas: uztikrinti, kad production rezime butu aisku, kas vyksta ir kas luzta.

Uzduotys:

- [x] perziureti request logging, kad nepatektu vartotoju credentials
- [x] prideti fingerprint lygio audit trail inbound auth ir user Confluence auth
- [ ] perziureti `metrics` ir `sync-status` endpointu apsauga
- [ ] apsispresti, ar `metrics` ir `sync-status` bus isvis proxy'inami i isore
- [ ] dokumentuoti key rotation modeli
- [ ] dokumentuoti incident response, kai:
  - blogi vartotojo credentials
  - rate limit
  - Confluence 403/404
  - partial index corruption
- [ ] dokumentuoti rollback plana

Priemimo kriterijai:

- loguose nera nei MCP API key, nei Confluence secret'u
- aiskiai matosi auth, rate limit ir permission drop problemos

## Etapas 9. Integraciniai ir saugumo testai

Tikslas: pries gyva rollout patikrinti, kad architektura tikrai neleidzia duomenu nutekejimo.

Uzduotys:

- [x] testas: ADO `/mcp` tebeveikia po Confluence deploy
- [x] testas: Confluence `/confluence/health` veikia per ta pati `nginx`
- [ ] testas: vartotojas A mato tik savo Confluence leidziama turini
- [ ] testas: vartotojas B nemato vartotojo A rezultatams priklausancio uzdaro turinio
- [x] testas: keyword paieska su per-user credentials
- [ ] testas: semantic paieska su per-user post-filter
- [ ] testas: hybrid paieska su per-user post-filter
- [ ] testas: `get_page` su neleistinu puslapiu turi buti atmestas
- [ ] testas: `debug` output nera informacijos nutekejimo saltinis
- [x] testas: `nginx` header forwarding tikrai persiuncia reikiamus header'ius
- [ ] testas: Confluence user credentials nenuseda diske

Priemimo kriterijai:

- nera cross-user leakage
- nera regressijos esamam ADO MCP

## Etapas 10. Rollout i produkcija

Tikslas: isjungti "eksperimenta" ir pereiti prie stabilaus naudojimo.

Uzduotys:

- [x] paleisti Confluence MCP pirmiausia be vieso route, tik vidiniam smoke test
- [ ] paleisti inicialu indexing
- [ ] patikrinti kokybe ir apimti
- [x] ijungti `nginx` route tik po sekmingo smoke testo
- [ ] pirmam etapui laikyti ribota vartotoju grupe
- [ ] stebeti:
  - CPU
  - RAM
  - Postgres dydi
  - Confluence rate limit
  - permission drop kieki
- [ ] tureti greita rollback:
  - isjungti `/confluence/*` route
  - palikti ADO route nepaliesta

Priemimo kriterijai:

- Confluence MCP pasiekiamas per shared ingress
- ADO MCP veikia kaip anksciau
- pirmieji vartotojai gali naudoti savo credentials

## Konkretus techninis backlog pagal failus

### Failai, kuriuos beveik tikrai reikes keisti

- `docker-compose.yml` arba naujas `docker-compose.server.yml`
- `docs/deployment/UBUNTU-DEPLOY.md`
- `src/http/middleware/request-context.ts`
- `src/logging/request-context.ts`
- `src/confluence/client.ts`
- `src/app/context.ts`
- `src/domain/confluence-content-service.ts`
- `src/domain/confluence-search-service.ts`
- `src/domain/confluence-page-service.ts`
- `src/domain/confluence-tree-service.ts`
- `src/retrieval/rag-policy.ts`
- `src/mcp/execute-tool.ts` arba artimas request wiring sluoksnis

### Failai, kurie jau pakeisti pirmoje implementacijos bangoje

- `docker-compose.server.yml`
- `deploy/nginx/confluence-mcp-paths.conf.example`
- `.env.example`
- `.env.server.example`
- `README.md`
- `docs/deployment/UBUNTU-DEPLOY.md`
- `docs/retrieval/RAG-RULES-FOR-THIS-SERVER.md`
- `src/config.ts`
- `src/confluence/client.ts`
- `src/confluence/runtime-auth.ts`
- `src/http/create-app.ts`
- `src/http/middleware/confluence-runtime-auth.ts`
- `src/http/middleware/request-context.ts`
- `src/http/middleware/request-logging.ts`
- `src/logging/logger.ts`
- `src/logging/request-context.ts`
- `src/retrieval/rag-policy.ts`
- `src/runtime/startup.ts`
- `tests/config.test.ts`
- `tests/confluence/client.test.ts`
- `tests/http/confluence-runtime-auth.test.ts`
- `tests/integration/helpers.ts`

### Failai, kuriuos tikriausiai reikes pildyti naujai

- nauji integraciniai testai per-user auth srautui
- galimai naujas persistent document index store production naudojimui

### Failai, kuriuos reikia liesti ypac atsargiai

- `/opt/mcp-server/nginx/nginx.conf`

## Minimalus MVP ir pilnas variantas

### MVP

Kas leistu greiciau paleisti pirma veikianti varianta:

- shared `nginx`
- atskiras Confluence backend be host porto
- service-account Confluence auth
- shared index
- be per-user credentials

Trukumas:

- tai neatitiktu tavo galutinio saugumo reikalavimo

### Pilnas variantas

Kas atitiktu tavo tikslini modeli:

- shared `nginx`
- atskiras Confluence backend be host porto
- service-account indexing
- per-user runtime credentials
- per-user verification pries rezultatu grazinima
- shared semantic index be cross-user leakage

Sis variantas yra teisinga kryptis, bet jis jau reikalauja kodo pakeitimu, ne vien deploy darbo.

## Rekomenduojama vykdymo seka

1. Paruosti atskira serverini deploy varianta be host port konfliktu.
2. Paleisti bazini Confluence MCP backend per shared Docker network.
3. Prijungti tik `/confluence/health` ir `/confluence/ready`.
4. Patikrinti, kad ADO MCP neluzo.
5. Paruosti ir paleisti indexing.
6. Ijungti `/confluence/mcp`, kai backend smoke testai zali.
7. Galiausiai atlikti security ir leakage testus.

## Kas yra blockeriai siandien

Svarbiausi blockeriai pries tavo norima galutini modeli:

- shared document index production storage dar nera pilnai centralizuotas
- semantic/hybrid paieska dar netestuota ant realiai uzpildyto shared indekso
- nepadaryti gyvi integraciniai leakage testai su realiais vartotoju credentials

Kodo prasme pirmas "shared index + per-user credentials" pagrindas jau yra, bazinis gyvas deploy ir pilnas bootstrap indexing jau patvirtinti. Pagrindiniai likusieji darbai dabar yra production-grade storage stiprinimas, semantic/hybrid kokybes patikra, savaiminio savaitinio refresh uzbaigimas ir pilni leakage / saugumo testai.
