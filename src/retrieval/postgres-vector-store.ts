import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { IndexedChunkMetadata } from "../indexing/types.js";
import type { SemanticChunkRecord, SemanticSearchFilters, SemanticSearchMatch } from "./types.js";
import type { VectorStore } from "./vector-store.js";

type PgPoolLike = Pick<Pool, "query" | "end"> & {
  connect?: () => Promise<Pick<PoolClient, "query" | "release">>;
};

type PostgresVectorStoreConfig = {
  connectionString: string;
  schema: string;
  table: string;
  dimensions: number;
  ssl: boolean;
  autoInit: boolean;
  pool?: PgPoolLike;
};

type SemanticChunkRow = QueryResultRow & {
  chunk_id: string;
  document_id: string;
  page_id: string;
  content: string;
  content_type: IndexedChunkMetadata["contentType"];
  page_title: string;
  space_key: string | null;
  ancestor_ids: string[] | null;
  section_path: string[] | null;
  last_modified: string | null;
  version_number: number | null;
  version_created_at: string | null;
  tenant_id: string | null;
  url: string | null;
  body_format: IndexedChunkMetadata["bodyFormat"];
  updated_at: string;
};

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${fieldName} must contain only letters, numbers, and underscores.`);
  }

  return `"${value}"`;
}

function formatQualifiedTable(schema: string, table: string) {
  return `${assertIdentifier(schema, "Postgres schema")}.${assertIdentifier(table, "Postgres table")}`;
}

function buildVectorLiteral(embedding: number[]) {
  return `[${embedding.map((value) => (Number.isFinite(value) ? value : 0)).join(",")}]`;
}

function mapRowToRecord(row: SemanticChunkRow): SemanticChunkRecord {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    pageId: row.page_id,
    content: row.content,
    metadata: {
      contentType: row.content_type,
      pageId: row.page_id,
      pageTitle: row.page_title,
      spaceKey: row.space_key,
      ancestorIds: row.ancestor_ids ?? [],
      sectionPath: row.section_path ?? [],
      lastModified: row.last_modified,
      version: {
        number: row.version_number,
        createdAt: row.version_created_at,
      },
      tenantId: row.tenant_id,
      url: row.url,
      bodyFormat: row.body_format,
    },
    embedding: [],
    updatedAt: row.updated_at,
  };
}

export class PostgresVectorStore implements VectorStore {
  private readonly pool: PgPoolLike;
  private readonly ownsPool: boolean;
  private readonly qualifiedTable: string;
  private initializationPromise: Promise<void> | null = null;

  constructor(private readonly config: PostgresVectorStoreConfig) {
    this.pool =
      config.pool ??
      new Pool({
        connectionString: config.connectionString,
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      });
    this.ownsPool = config.pool == null;
    this.qualifiedTable = formatQualifiedTable(config.schema, config.table);
  }

  async upsertPageChunks(pageId: string, records: SemanticChunkRecord[]) {
    await this.ensureInitialized();
    await this.pool.query(`DELETE FROM ${this.qualifiedTable} WHERE page_id = $1`, [pageId]);

    for (const record of records) {
      await this.pool.query(
        `
          INSERT INTO ${this.qualifiedTable} (
            chunk_id,
            document_id,
            page_id,
            content,
            content_type,
            page_title,
            space_key,
            ancestor_ids,
            section_path,
            last_modified,
            version_number,
            version_created_at,
            tenant_id,
            url,
            body_format,
            embedding,
            updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8::text[], $9::text[], $10, $11, $12, $13, $14, $15, $16::vector, $17
          )
        `,
        [
          record.chunkId,
          record.documentId,
          record.pageId,
          record.content,
          record.metadata.contentType,
          record.metadata.pageTitle,
          record.metadata.spaceKey,
          record.metadata.ancestorIds,
          record.metadata.sectionPath,
          record.metadata.lastModified,
          record.metadata.version.number,
          record.metadata.version.createdAt,
          record.metadata.tenantId,
          record.metadata.url,
          record.metadata.bodyFormat,
          buildVectorLiteral(record.embedding),
          record.updatedAt,
        ],
      );
    }
  }

  async deletePageChunks(pageId: string) {
    await this.ensureInitialized();
    await this.pool.query(`DELETE FROM ${this.qualifiedTable} WHERE page_id = $1`, [pageId]);
  }

  async deletePageChunksMany(pageIds: string[]) {
    if (pageIds.length === 0) {
      return;
    }

    await this.ensureInitialized();
    await this.pool.query(`DELETE FROM ${this.qualifiedTable} WHERE page_id = ANY($1::text[])`, [
      pageIds,
    ]);
  }

  async search(input: {
    embedding: number[];
    topK: number;
    filters?: SemanticSearchFilters;
  }): Promise<SemanticSearchMatch[]> {
    await this.ensureInitialized();

    const conditions: string[] = [];
    const parameters: unknown[] = [buildVectorLiteral(input.embedding)];

    if (input.filters?.pageId) {
      parameters.push(input.filters.pageId);
      conditions.push(`page_id = $${parameters.length}`);
    }

    if (input.filters?.spaceKey) {
      parameters.push(input.filters.spaceKey);
      conditions.push(`space_key = $${parameters.length}`);
    }

    if (input.filters?.ancestorId) {
      parameters.push(input.filters.ancestorId);
      conditions.push(`$${parameters.length} = ANY(ancestor_ids)`);
    }

    if (input.filters?.tenantId !== undefined) {
      if (input.filters.tenantId === null) {
        conditions.push(`tenant_id IS NULL`);
      } else {
        parameters.push(input.filters.tenantId);
        conditions.push(`tenant_id = $${parameters.length}`);
      }
    }

    parameters.push(input.topK);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.pool.query<SemanticChunkRow & { score: number }>(
      `
        SELECT
          chunk_id,
          document_id,
          page_id,
          content,
          content_type,
          page_title,
          space_key,
          ancestor_ids,
          section_path,
          last_modified,
          version_number,
          version_created_at,
          tenant_id,
          url,
          body_format,
          updated_at,
          (1 - (embedding <=> $1::vector)) AS score
        FROM ${this.qualifiedTable}
        ${whereClause}
        ORDER BY embedding <=> $1::vector ASC, chunk_id ASC
        LIMIT $${parameters.length}
      `,
      parameters,
    );

    return result.rows.map((row, index) => ({
      rank: index + 1,
      score: row.score,
      record: mapRowToRecord(row),
    }));
  }

  async count() {
    await this.ensureInitialized();
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${this.qualifiedTable}`,
    );

    return Number(result.rows[0]?.count ?? 0);
  }

  async list() {
    await this.ensureInitialized();
    const result = await this.pool.query<SemanticChunkRow>(
      `
        SELECT
          chunk_id,
          document_id,
          page_id,
          content,
          content_type,
          page_title,
          space_key,
          ancestor_ids,
          section_path,
          last_modified,
          version_number,
          version_created_at,
          tenant_id,
          url,
          body_format,
          updated_at
        FROM ${this.qualifiedTable}
        ORDER BY chunk_id ASC
      `,
    );

    return result.rows.map(mapRowToRecord);
  }

  async close() {
    if (!this.ownsPool) {
      return;
    }

    await this.pool.end();
  }

  private async ensureInitialized() {
    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      if (!this.config.autoInit) {
        return;
      }

      const lockKey = `${this.config.schema}.${this.config.table}.vector-store-init`;
      const schemaIdentifier = assertIdentifier(this.config.schema, "Postgres schema");
      const tableIdentifier = assertIdentifier(this.config.table, "Postgres table");
      const indexPrefix = `${this.config.table}_semantic`;
      const runInitializationQueries = async (
        queryable: Pick<PgPoolLike, "query"> | Pick<PoolClient, "query">,
      ) => {
        await queryable.query("CREATE EXTENSION IF NOT EXISTS vector");
        await queryable.query(`CREATE SCHEMA IF NOT EXISTS ${schemaIdentifier}`);
        await queryable.query(`
          CREATE TABLE IF NOT EXISTS ${this.qualifiedTable} (
            chunk_id text PRIMARY KEY,
            document_id text NOT NULL,
            page_id text NOT NULL,
            content text NOT NULL,
            content_type text NOT NULL,
            page_title text NOT NULL,
            space_key text NULL,
            ancestor_ids text[] NOT NULL DEFAULT '{}',
            section_path text[] NOT NULL DEFAULT '{}',
            last_modified text NULL,
            version_number integer NULL,
            version_created_at text NULL,
            tenant_id text NULL,
            url text NULL,
            body_format text NOT NULL,
            embedding vector(${this.config.dimensions}) NOT NULL,
            updated_at text NOT NULL
          )
        `);
        await queryable.query(`
          CREATE INDEX IF NOT EXISTS "${indexPrefix}_embedding_hnsw_idx"
          ON ${schemaIdentifier}.${tableIdentifier}
          USING hnsw (embedding vector_cosine_ops)
        `);
        await queryable.query(`
          CREATE INDEX IF NOT EXISTS "${indexPrefix}_page_idx"
          ON ${schemaIdentifier}.${tableIdentifier} (page_id)
        `);
        await queryable.query(`
          CREATE INDEX IF NOT EXISTS "${indexPrefix}_space_idx"
          ON ${schemaIdentifier}.${tableIdentifier} (space_key)
        `);
        await queryable.query(`
          CREATE INDEX IF NOT EXISTS "${indexPrefix}_tenant_idx"
          ON ${schemaIdentifier}.${tableIdentifier} (tenant_id)
        `);
        await queryable.query(`
          CREATE INDEX IF NOT EXISTS "${indexPrefix}_ancestor_ids_idx"
          ON ${schemaIdentifier}.${tableIdentifier}
          USING gin (ancestor_ids)
        `);
      };

      if (!this.pool.connect) {
        await runInitializationQueries(this.pool);
        return;
      }

      const client = await this.pool.connect();

      try {
        await client.query("SELECT pg_advisory_lock(hashtext($1))", [lockKey]);
        await runInitializationQueries(client);
      } finally {
        try {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
        } finally {
          client.release();
        }
      }
    })();

    try {
      await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }
}
