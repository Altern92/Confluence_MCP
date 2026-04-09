import * as z from "zod/v4";

function numericIdSchema(fieldName: string) {
  return z.string().trim().regex(/^\d+$/, `${fieldName} must be a numeric Confluence page ID.`);
}

function isValidUpdatedAfter(value: string): boolean {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  }

  return !Number.isNaN(Date.parse(value));
}

const spaceKeySchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^\S+$/, "spaceKey cannot contain whitespace.");

const updatedAfterSchema = z.string().trim().min(1).refine(isValidUpdatedAfter, {
  message: "updatedAfter must be an ISO-8601 datetime or YYYY-MM-DD date.",
});

export const bodyFormatSchema = z.enum(["storage", "atlas_doc_format"]);

export const scopeSchema = z
  .object({
    type: z.enum(["page", "page_tree", "space"]),
    pageId: numericIdSchema("pageId").optional(),
    spaceKey: spaceKeySchema.optional(),
  })
  .superRefine((scope, ctx) => {
    if ((scope.type === "page" || scope.type === "page_tree") && !scope.pageId) {
      ctx.addIssue({
        code: "custom",
        message: "pageId is required when scope.type is page or page_tree.",
        path: ["pageId"],
      });
    }

    if (scope.type === "space" && !scope.spaceKey) {
      ctx.addIssue({
        code: "custom",
        message: "spaceKey is required when scope.type is space.",
        path: ["spaceKey"],
      });
    }
  });

export const searchFiltersSchema = z.object({
  contentType: z.literal("page").default("page"),
  updatedAfter: updatedAfterSchema.optional(),
  labels: z.array(z.string().trim().min(1)).optional(),
});

export const retrievalSchema = z.object({
  mode: z.enum(["keyword", "semantic", "hybrid"]).default("keyword"),
  topK: z.number().int().min(1).max(50).default(10),
});

const ragPolicyIdSchema = z.enum(["default-secure-rag"]);
const retrievalSourceSchema = z.enum(["confluence_keyword", "vector_semantic", "hybrid_rrf"]);
const verificationStatusSchema = z.enum(["verified_service_v2_fetch", "not_required"]);

const rankingDebugSchema = z.object({
  keywordRank: z.number().int().min(1).nullable(),
  semanticRank: z.number().int().min(1).nullable(),
  rrfScore: z.number().nullable(),
  similarity: z.number().nullable(),
});

const policyAppliedSchema = z.object({
  policyId: ragPolicyIdSchema,
  verificationRequired: z.boolean(),
  verificationMode: z.enum(["service_v2_fetch", "none"]),
  maxTopK: z.number().int().min(1),
  maxSnippetChars: z.number().int().min(1),
  maxVerifications: z.number().int().min(0),
  citationFirst: z.boolean(),
});

const searchDebugSchema = z.object({
  cqlUsed: z.string().nullable(),
  topKRequested: z.number().int().min(1),
  topKApplied: z.number().int().min(1),
  verifiedCandidates: z.number().int().min(0),
  droppedCandidates: z.number().int().min(0),
  dropReasons: z.object({
    forbidden: z.number().int().min(0),
    notFound: z.number().int().min(0),
    error: z.number().int().min(0),
  }),
  verificationMode: z.enum(["service_v2_fetch", "none"]),
});

export const searchInputShape = {
  query: z.string().trim().min(1).describe("Natural-language query for Confluence content."),
  scope: scopeSchema.describe("Scope restriction for the search request."),
  filters: searchFiltersSchema.optional(),
  retrieval: retrievalSchema.optional(),
  ragPolicyId: ragPolicyIdSchema.optional(),
  debug: z.boolean().optional(),
};

const searchResultSchema = z.object({
  rank: z.number().int().min(1),
  pageId: z.string(),
  title: z.string(),
  spaceKey: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  score: z.number().nullable(),
  retrievalSource: retrievalSourceSchema,
  sectionPath: z.array(z.string()),
  lastModified: z.string().nullable(),
  retrievedAt: z.string(),
  verificationStatus: verificationStatusSchema,
  rankingDebug: rankingDebugSchema,
  provenance: z.discriminatedUnion("source", [
    z.object({
      source: z.literal("confluence_keyword"),
      cql: z.string(),
    }),
    z.object({
      source: z.literal("vector_semantic"),
      chunkId: z.string(),
      documentId: z.string(),
      similarity: z.number(),
    }),
    z.object({
      source: z.literal("hybrid_rrf"),
      cql: z.string(),
      keywordRank: z.number().int().min(1).nullable(),
      semanticRank: z.number().int().min(1).nullable(),
      rrfScore: z.number(),
    }),
  ]),
});

export const searchOutputShape = {
  retrievalModeUsed: z.enum(["keyword", "semantic", "hybrid"]),
  policyApplied: policyAppliedSchema,
  results: z.array(searchResultSchema),
  nextCursor: z.string().nullable(),
  debug: searchDebugSchema.nullable(),
};

export const getPageInputShape = {
  pageId: numericIdSchema("pageId"),
  bodyFormat: bodyFormatSchema.default("storage"),
};

export const getPageOutputShape = {
  pageId: z.string(),
  title: z.string(),
  status: z.string().nullable(),
  spaceId: z.string().nullable(),
  url: z.string().url(),
  bodyFormat: bodyFormatSchema,
  body: z.string(),
  version: z.object({
    number: z.number().int().nullable(),
    createdAt: z.string().nullable(),
  }),
};

const pageTreeResultSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  spaceKey: z.string(),
  url: z.string().url(),
  snippet: z.string(),
});

const ancestorResultSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  spaceId: z.string().nullable(),
  url: z.string().url(),
  depth: z.number().int().min(1),
});

const descendantResultSchema = z.object({
  pageId: z.string(),
  title: z.string(),
  contentType: z.string(),
  status: z.string().nullable(),
  parentId: z.string().nullable(),
  depth: z.number().int().nullable(),
  childPosition: z.number().int().nullable(),
  url: z.string().url().nullable(),
});

const restrictionSubjectSchema = z.object({
  type: z.enum(["user", "group"]),
  identifier: z.string().nullable(),
  displayName: z.string().nullable(),
});

const restrictionOperationSchema = z.object({
  operation: z.string(),
  subjects: z.array(restrictionSubjectSchema),
});

const attachmentResultSchema = z.object({
  attachmentId: z.string(),
  title: z.string(),
  status: z.string().nullable(),
  mediaType: z.string().nullable(),
  mediaTypeDescription: z.string().nullable(),
  comment: z.string().nullable(),
  fileId: z.string().nullable(),
  fileSize: z.number().int().nullable(),
  createdAt: z.string().nullable(),
  pageId: z.string().nullable(),
  downloadUrl: z.string().url().nullable(),
  webuiUrl: z.string().url().nullable(),
  version: z.object({
    number: z.number().int().nullable(),
    createdAt: z.string().nullable(),
    message: z.string().nullable(),
    minorEdit: z.boolean().nullable(),
    authorId: z.string().nullable(),
  }),
});

export const getPageTreeInputShape = {
  rootPageId: numericIdSchema("rootPageId"),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
};

export const getPageTreeOutputShape = {
  rootPageId: z.string(),
  descendants: z.array(pageTreeResultSchema),
  nextCursor: z.string().nullable(),
};

export const getPageAncestorsInputShape = {
  pageId: numericIdSchema("pageId"),
};

export const getPageAncestorsOutputShape = {
  pageId: z.string(),
  ancestors: z.array(ancestorResultSchema),
  nextCursor: z.string().nullable(),
};

export const getPageRestrictionsInputShape = {
  pageId: numericIdSchema("pageId"),
};

export const getPageRestrictionsOutputShape = {
  pageId: z.string(),
  operations: z.array(restrictionOperationSchema),
};

export const getPageDescendantsInputShape = {
  pageId: numericIdSchema("pageId"),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
  depth: z.number().int().min(1).max(100).optional(),
};

export const getPageDescendantsOutputShape = {
  pageId: z.string(),
  descendants: z.array(descendantResultSchema),
  nextCursor: z.string().nullable(),
};

export const getPageAttachmentsInputShape = {
  pageId: numericIdSchema("pageId"),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).optional(),
  filename: z.string().trim().min(1).optional(),
  mediaType: z.string().trim().min(1).optional(),
};

export const getPageAttachmentsOutputShape = {
  pageId: z.string(),
  attachments: z.array(attachmentResultSchema),
  nextCursor: z.string().nullable(),
};

export const searchInputSchema = z.object(searchInputShape);
export const searchOutputSchema = z.object(searchOutputShape);
export const getPageInputSchema = z.object(getPageInputShape);
export const getPageOutputSchema = z.object(getPageOutputShape);
export const getPageTreeInputSchema = z.object(getPageTreeInputShape);
export const getPageTreeOutputSchema = z.object(getPageTreeOutputShape);
export const getPageAncestorsInputSchema = z.object(getPageAncestorsInputShape);
export const getPageAncestorsOutputSchema = z.object(getPageAncestorsOutputShape);
export const getPageRestrictionsInputSchema = z.object(getPageRestrictionsInputShape);
export const getPageRestrictionsOutputSchema = z.object(getPageRestrictionsOutputShape);
export const getPageDescendantsInputSchema = z.object(getPageDescendantsInputShape);
export const getPageDescendantsOutputSchema = z.object(getPageDescendantsOutputShape);
export const getPageAttachmentsInputSchema = z.object(getPageAttachmentsInputShape);
export const getPageAttachmentsOutputSchema = z.object(getPageAttachmentsOutputShape);

export type ScopeInput = z.infer<typeof scopeSchema>;
export type SearchFiltersInput = z.infer<typeof searchFiltersSchema>;
export type RetrievalInput = z.infer<typeof retrievalSchema>;
export type SearchToolInput = z.infer<typeof searchInputSchema>;
export type SearchToolOutput = z.infer<typeof searchOutputSchema>;
export type GetPageToolInput = z.infer<typeof getPageInputSchema>;
export type GetPageToolOutput = z.infer<typeof getPageOutputSchema>;
export type GetPageTreeToolInput = z.infer<typeof getPageTreeInputSchema>;
export type GetPageTreeToolOutput = z.infer<typeof getPageTreeOutputSchema>;
export type GetPageAncestorsToolInput = z.infer<typeof getPageAncestorsInputSchema>;
export type GetPageAncestorsToolOutput = z.infer<typeof getPageAncestorsOutputSchema>;
export type GetPageRestrictionsToolInput = z.infer<typeof getPageRestrictionsInputSchema>;
export type GetPageRestrictionsToolOutput = z.infer<typeof getPageRestrictionsOutputSchema>;
export type GetPageDescendantsToolInput = z.infer<typeof getPageDescendantsInputSchema>;
export type GetPageDescendantsToolOutput = z.infer<typeof getPageDescendantsOutputSchema>;
export type GetPageAttachmentsToolInput = z.infer<typeof getPageAttachmentsInputSchema>;
export type GetPageAttachmentsToolOutput = z.infer<typeof getPageAttachmentsOutputSchema>;
export type BodyFormat = z.infer<typeof bodyFormatSchema>;
