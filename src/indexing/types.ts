import * as z from "zod/v4";

import { bodyFormatSchema } from "../types/tool-schemas.js";

export const indexableContentTypeSchema = z.enum(["page"]);

export const indexedDocumentVersionSchema = z.object({
  number: z.number().int().nullable(),
  createdAt: z.string().nullable(),
});

export const indexableConfluencePageSchema = z.object({
  contentType: indexableContentTypeSchema.default("page"),
  pageId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  spaceKey: z.string().trim().min(1).nullable(),
  ancestorIds: z.array(z.string().trim().min(1)),
  body: z.string(),
  bodyFormat: bodyFormatSchema,
  lastModified: z.string().nullable(),
  version: indexedDocumentVersionSchema,
  tenantId: z.string().trim().min(1).nullable(),
  url: z.string().url().nullable(),
});

export const indexedChunkMetadataSchema = z.object({
  contentType: indexableContentTypeSchema,
  pageId: z.string().trim().min(1),
  pageTitle: z.string().trim().min(1),
  spaceKey: z.string().trim().min(1).nullable(),
  ancestorIds: z.array(z.string().trim().min(1)),
  sectionPath: z.array(z.string().trim().min(1)),
  lastModified: z.string().nullable(),
  version: indexedDocumentVersionSchema,
  tenantId: z.string().trim().min(1).nullable(),
  url: z.string().url().nullable(),
  bodyFormat: bodyFormatSchema,
});

export const indexedDocumentChunkSchema = z.object({
  chunkId: z.string().trim().min(1),
  documentId: z.string().trim().min(1),
  chunkIndex: z.number().int().min(0),
  content: z.string().trim().min(1),
  charCount: z.number().int().min(1),
  metadata: indexedChunkMetadataSchema,
});

export type IndexableConfluencePage = z.infer<typeof indexableConfluencePageSchema>;
export type IndexedChunkMetadata = z.infer<typeof indexedChunkMetadataSchema>;
export type IndexedDocumentChunk = z.infer<typeof indexedDocumentChunkSchema>;
