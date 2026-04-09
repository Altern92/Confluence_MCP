# Ubuntu Deployment

Sis dokumentas skirtas greitam ir tvarkingam sio read-only Confluence MCP serverio perkelimui is GitHub i Ubuntu serveri.

## Rekomenduojamas kelias

Jei nori paprasto ir stabilaus paleidimo:

1. klonuok repo is GitHub
2. susikurk serverio `.env`
3. paleisk `npm run verify`
4. sugeneruok `dist/`
5. paleisk per `systemd`
6. jei reikia isorinio HTTPS adreso, padek `nginx` atvirksini proxy pries procesa

## 1. Sistemos paketai

Ubuntu serveryje rekomenduojama tureti:

- `git`
- `curl`
- `nginx`, jei naudosi reverse proxy
- `nodejs` 20+ arba 22+
- `npm`

Pavyzdys su NodeSource:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 2. Repo paemimas is GitHub

```bash
cd /opt
sudo git clone <TAVO_GITHUB_REPO_URL> confluence-mcp
sudo chown -R $USER:$USER /opt/confluence-mcp
cd /opt/confluence-mcp
```

## 3. Konfiguracija

Susikurk realu serverio `.env` is [`.env.example`](../../.env.example).

Minimalus variantas serveriui:

```env
APP_ENV=production
MCP_TRANSPORT=http
HOST=127.0.0.1
PORT=3000

MCP_API_KEY=<stiprus_api_key>
MCP_NEXT_API_KEY=
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,mcp.example.com
MCP_ALLOWED_ORIGINS=

METRICS_ENABLED=true
MCP_MAX_REQUEST_BODY_BYTES=262144
HTTP_REQUEST_TIMEOUT_MS=30000
DEFAULT_TOP_K=10
LOG_LEVEL=info

CONFLUENCE_BASE_URL=https://your-company.atlassian.net
CONFLUENCE_EMAIL=service-account@example.com
CONFLUENCE_API_TOKEN=<confluence_api_token>

CONFLUENCE_ALLOWED_SPACE_KEYS=ENG,OPS
CONFLUENCE_ALLOWED_ROOT_PAGE_IDS=

INDEXING_TENANT_ID=
INDEXING_STORAGE_DRIVER=file
INDEXING_STORAGE_PATH=.data/indexing
INDEXING_CHUNK_MAX_CHARS=1200
INDEXING_CHUNK_OVERLAP_CHARS=150
INDEXING_SYNC_ENABLED=false
INDEXING_SYNC_POLL_INTERVAL_MS=300000
INDEXING_SYNC_SPACE_KEYS=
INDEXING_SYNC_MAX_PAGES_PER_SPACE=500
INDEXING_SYNC_RUN_ON_STARTUP=false
INDEXING_SYNC_FULL_RECONCILE_ENABLED=false
INDEXING_SYNC_FULL_RECONCILE_INTERVAL_RUNS=12
INDEXING_SYNC_FULL_RECONCILE_RUN_ON_STARTUP=false

INDEXING_SEMANTIC_ENABLED=true
INDEXING_EMBEDDING_PROVIDER=hash
INDEXING_EMBEDDING_DIMENSIONS=256
INDEXING_VECTOR_STORE_DRIVER=file
INDEXING_VECTOR_STORE_PATH=.data/indexing/vectors.json

INDEXING_VECTOR_STORE_POSTGRES_URL=
INDEXING_VECTOR_STORE_POSTGRES_SCHEMA=public
INDEXING_VECTOR_STORE_POSTGRES_TABLE=confluence_semantic_chunks
INDEXING_VECTOR_STORE_POSTGRES_SSL=false
INDEXING_VECTOR_STORE_POSTGRES_AUTO_INIT=true
```

Pastaba:

- `HOST=127.0.0.1` yra rekomenduojamas, jei isoreje stoves `nginx`
- `CONFLUENCE_ALLOWED_SPACE_KEYS` labai rekomenduojama uzpildyti
- jei dar nenaudoji `pgvector`, palik `file` storage

## 4. Build ir patikra

```bash
cd /opt/confluence-mcp
npm ci
npm run verify
```

Jei `verify` zalia:

```bash
npm run build
```

## 5. Rankinis paleidimas smoke testui

```bash
cd /opt/confluence-mcp
node dist/index.js
```

Kitame terminale:

```bash
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/ready
curl -H "X-API-Key: <tavo_api_key>" http://127.0.0.1:3000/metrics
curl -H "X-API-Key: <tavo_api_key>" http://127.0.0.1:3000/sync-status
```

## 6. `systemd` paleidimas

Naudok [confluence-mcp.service.example](../../deploy/systemd/confluence-mcp.service.example) kaip sablona.

```bash
sudo cp deploy/systemd/confluence-mcp.service.example /etc/systemd/system/confluence-mcp.service
sudo systemctl daemon-reload
sudo systemctl enable confluence-mcp
sudo systemctl start confluence-mcp
sudo systemctl status confluence-mcp
```

Naudingi logai:

```bash
journalctl -u confluence-mcp -f
```

## 7. `nginx` reverse proxy

Jei norisi isorinio HTTPS adreso, naudok [confluence-mcp.conf.example](../../deploy/nginx/confluence-mcp.conf.example).

Esminiai reikalavimai:

- forward'inti `Host`
- forward'inti `Authorization`
- forward'inti `X-Forwarded-Proto`
- laikyti backend ant `127.0.0.1:3000`

Po `nginx` konfiguracijos:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 8. Po deploy minimalus checklist

- `systemctl status confluence-mcp` yra `active (running)`
- `/health` veikia
- `/ready` veikia
- `/metrics` pasiekiamas tik su API key
- MCP klientas mato visus tool'us
- `confluence.search` grazina rezultatus

## 9. Jei pereisi i Postgres/pgvector

Tuomet pakeisk:

- `INDEXING_VECTOR_STORE_DRIVER=postgres`
- `INDEXING_VECTOR_STORE_POSTGRES_URL=postgresql://...`

Ir tik tada paleisk realu semantic reindex serverineje aplinkoje.
