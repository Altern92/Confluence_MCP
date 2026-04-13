# Indexing Runbook

Sis runbook skirtas saugiam pirmajam Confluence indeksavimo paleidimui esamame shared MCP serveryje.

Esama busena:

- indexing ribojamas iki `CONFLUENCE_ALLOWED_SPACE_KEYS`
- siuo metu tai yra `135` ne asmeniniai space
- background sync workeris isjungtas (`INDEXING_SYNC_ENABLED=false`)
- production atnaujinimui naudojamas hosto scheduleris, o ne process-local workeris
- semantic vectoriai saugomi Postgres/pgvector
- dokumentu snapshotai ir sync state saugomi `.data/indexing`
- paskutinis pilnas bootstrap baigtas sekmingai:
  - `pagesDiscovered=12155`
  - `pagesIndexed=12154`
  - `chunksProduced=78602`

## 1. Preflight

Jei siam vartotojui reikia `sudo docker`, naudok:

```bash
USE_SUDO=1 ./scripts/indexing-preflight.sh
```

Jei leidi is neinteraktyvios sesijos, gali papildomai paduoti:

```bash
USE_SUDO=1 SUDO_PASSWORD='<slaptazodis>' ./scripts/indexing-preflight.sh
```

Ko tiketis:

- abu konteineriai `healthy`
- `vector` extension egzistuoja
- matysis dabartinis `documentCount`, `chunkCount`, `vectorRecordCount`

## 2. Statusas

Trumpa suvestine:

```bash
USE_SUDO=1 ./scripts/indexing-status.sh
```

Pilnas raw JSON:

```bash
USE_SUDO=1 ./scripts/indexing-status.sh --raw
```

## 3. Pilotinis paleidimas

Rekomenduojamas pirmas zingsnis:

```bash
USE_SUDO=1 ./scripts/indexing-bootstrap.sh --spaces=PA --max-pages-per-space=100
```

Arba sunkesnis pilotas:

```bash
USE_SUDO=1 ./scripts/indexing-bootstrap.sh --spaces=dso --max-pages-per-space=100
```

## 4. Pilnas bootstrap pagal dabartini limita

Tai naudos visa allowlist is `.env` ir dabartini `INDEXING_SYNC_MAX_PAGES_PER_SPACE`.

```bash
USE_SUDO=1 ./scripts/indexing-bootstrap.sh
```

Siuo metu tai reikstu mazdaug `12,138` puslapiu bootstrap del `500` puslapiu limito vienam space.

## 5. Savaitinis production sync

Production rezime paliekame:

- `INDEXING_SYNC_ENABLED=false`
- `INDEXING_SYNC_RUN_ON_STARTUP=false`

Vietoj nuolatinio process-local workerio naudojamas hosto `systemd timer`, kuris paleidzia pilna reindex kiekviena penktadieni `20:00 UTC`.

Greitas patikrinimas nieko nepaleidziant:

```bash
./scripts/indexing-weekly-sync.sh --dry-run
```

Rankinis paleidimas:

```bash
./scripts/indexing-weekly-sync.sh
```

Timer failai:

- `deploy/systemd/confluence-mcp-weekly-sync.service.example`
- `deploy/systemd/confluence-mcp-weekly-sync.timer.example`

## 6. Pilnas bootstrap be 500 limito

Jei veliau noresi indeksuoti visus puslapius visuose leistinuose space, pirma pakeisk:

```bash
INDEXING_SYNC_MAX_PAGES_PER_SPACE=<didesne_reiksme_arba_kitas_tikslas>
```

Tik po to paleisk bootstrap is naujo.

## 7. Svarbios pastabos

- `scripts/indexing-bootstrap.sh` neijungia background sync
- jis paleidzia tik viena rankini bootstrap procesa
- `scripts/indexing-weekly-sync.sh` naudoja lock faila ir tikrina konteineriu sveikata
- `confluence.get_page*` ir `confluence.search` jau apriboti tik leistinais space
- jei bus noras pereiti prie daznesnio incremental sync, tai reiketu daryti atskirai nuo dabartinio host-level weekly reindex modelio
