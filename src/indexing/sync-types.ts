import * as z from "zod/v4";

export const reindexReasonSchema = z.enum(["manual", "bootstrap", "content_changed", "retry"]);
export const syncRunStatusSchema = z.enum(["queued", "running", "succeeded", "failed"]);

export const reindexTargetSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("page"),
    pageId: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("space"),
    spaceKey: z.string().trim().min(1),
  }),
  z.object({
    type: z.literal("full"),
  }),
]);

export const syncWatermarkSchema = z.object({
  scopeKey: z.string().trim().min(1),
  lastModified: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
});

export const syncRunStatsSchema = z.object({
  pagesDiscovered: z.number().int().min(0),
  pagesIndexed: z.number().int().min(0),
  pagesDeleted: z.number().int().min(0),
  chunksProduced: z.number().int().min(0),
});

export const syncRunRecordSchema = z.object({
  runId: z.string().trim().min(1),
  target: reindexTargetSchema,
  reason: reindexReasonSchema,
  status: syncRunStatusSchema,
  queuedAt: z.string().trim().min(1),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  stats: syncRunStatsSchema.nullable(),
  errorMessage: z.string().nullable(),
});

export type ReindexReason = z.infer<typeof reindexReasonSchema>;
export type SyncRunStatus = z.infer<typeof syncRunStatusSchema>;
export type ReindexTarget = z.infer<typeof reindexTargetSchema>;
export type SyncWatermark = z.infer<typeof syncWatermarkSchema>;
export type SyncRunStats = z.infer<typeof syncRunStatsSchema>;
export type SyncRunRecord = z.infer<typeof syncRunRecordSchema>;
