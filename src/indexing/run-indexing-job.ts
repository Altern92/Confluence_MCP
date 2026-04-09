import { pathToFileURL } from "node:url";

import { buildSyncStatusSnapshot } from "./sync-status.js";
import { createAppContext } from "../app/context.js";
import type { BodyFormat } from "../types/tool-schemas.js";
import type { ReindexReason } from "./sync-types.js";

type CliCommand =
  | {
      type: "status";
      recentRuns: number;
    }
  | {
      type: "full";
      reason: ReindexReason;
      tenantId?: string | null;
      spaceKeys?: string[];
      maxSpaces?: number;
      maxPagesPerSpace?: number;
    }
  | {
      type: "space";
      reason: ReindexReason;
      tenantId?: string | null;
      spaceKey: string;
      maxPagesPerSpace?: number;
    }
  | {
      type: "page";
      reason: ReindexReason;
      tenantId?: string | null;
      pageId: string;
      spaceKey?: string | null;
      bodyFormat?: BodyFormat;
    };

const allowedReasons = new Set<ReindexReason>(["manual", "bootstrap", "content_changed", "retry"]);
const allowedBodyFormats = new Set<BodyFormat>(["storage", "atlas_doc_format"]);

function isFlag(value: string, flag: string) {
  return value === `--${flag}` || value.startsWith(`--${flag}=`);
}

function readFlagValue(argv: string[], flag: string) {
  const index = argv.findIndex((argument) => isFlag(argument, flag));

  if (index === -1) {
    return undefined;
  }

  const argument = argv[index]!;

  if (argument.includes("=")) {
    return argument.split("=", 2)[1]?.trim();
  }

  const nextValue = argv[index + 1];

  if (!nextValue || nextValue.startsWith("--")) {
    throw new Error(`--${flag} requires a value.`);
  }

  return nextValue.trim();
}

function parseOptionalPositiveInt(value: string | undefined, flag: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--${flag} must be a positive integer.`);
  }

  return parsed;
}

function parseReason(argv: string[]) {
  const value = readFlagValue(argv, "reason");

  if (!value) {
    return "manual" as const;
  }

  if (!allowedReasons.has(value as ReindexReason)) {
    throw new Error("--reason must be one of: manual, bootstrap, content_changed, retry.");
  }

  return value as ReindexReason;
}

function parseSpaceKeys(argv: string[]) {
  const value = readFlagValue(argv, "spaces");

  if (!value) {
    return undefined;
  }

  const spaceKeys = value
    .split(",")
    .map((spaceKey) => spaceKey.trim())
    .filter(Boolean);

  return spaceKeys.length > 0 ? spaceKeys : undefined;
}

function parseBodyFormat(argv: string[]) {
  const value = readFlagValue(argv, "body-format");

  if (!value) {
    return undefined;
  }

  if (!allowedBodyFormats.has(value as BodyFormat)) {
    throw new Error("--body-format must be storage or atlas_doc_format.");
  }

  return value as BodyFormat;
}

export function parseIndexingCliArgs(argv: string[]): CliCommand {
  const [command, firstArg] = argv;

  if (!command) {
    throw new Error(
      "Indexing command is required. Use one of: status, full, space <SPACE>, page <PAGE_ID>.",
    );
  }

  const tenantId = readFlagValue(argv, "tenant-id") ?? undefined;
  const reason = parseReason(argv);

  if (command === "status") {
    return {
      type: "status",
      recentRuns: parseOptionalPositiveInt(readFlagValue(argv, "recent-runs"), "recent-runs") ?? 20,
    };
  }

  if (command === "full") {
    return {
      type: "full",
      reason,
      tenantId,
      spaceKeys: parseSpaceKeys(argv),
      maxSpaces: parseOptionalPositiveInt(readFlagValue(argv, "max-spaces"), "max-spaces"),
      maxPagesPerSpace: parseOptionalPositiveInt(
        readFlagValue(argv, "max-pages-per-space"),
        "max-pages-per-space",
      ),
    };
  }

  if (command === "space") {
    const spaceKey = firstArg?.trim();

    if (!spaceKey || spaceKey.startsWith("--")) {
      throw new Error(
        "space command requires a space key. Example: npm run indexing:run -- space ENG",
      );
    }

    return {
      type: "space",
      reason,
      tenantId,
      spaceKey,
      maxPagesPerSpace: parseOptionalPositiveInt(
        readFlagValue(argv, "max-pages-per-space"),
        "max-pages-per-space",
      ),
    };
  }

  if (command === "page") {
    const pageId = firstArg?.trim();

    if (!pageId || !/^\d+$/.test(pageId)) {
      throw new Error("page command requires a numeric page ID.");
    }

    return {
      type: "page",
      reason,
      tenantId,
      pageId,
      spaceKey: readFlagValue(argv, "space-key") ?? undefined,
      bodyFormat: parseBodyFormat(argv),
    };
  }

  throw new Error("Unknown indexing command. Use one of: status, full, space, page.");
}

function summarizePageResult(
  result: Awaited<
    ReturnType<ReturnType<typeof createAppContext>["internalReindexService"]["reindexPage"]>
  >,
) {
  return {
    run: result.run,
    outcome: result.outcome,
    page: {
      pageId: result.document.pageId,
      title: result.document.title,
      spaceKey: result.document.spaceKey,
      lastModified: result.document.lastModified,
      chunkCount: result.chunks.length,
      sectionPaths: [
        ...new Set(result.chunks.map((chunk) => chunk.metadata.sectionPath.join(" > "))),
      ],
    },
  };
}

function summarizeFullResult(
  result:
    | Awaited<
        ReturnType<ReturnType<typeof createAppContext>["internalReindexService"]["fullReindex"]>
      >
    | Awaited<
        ReturnType<ReturnType<typeof createAppContext>["internalReindexService"]["reindexSpace"]>
      >,
) {
  return {
    run: result.run,
    processedSpaceKeys: result.processedSpaceKeys,
    spaceRuns: result.spaceRuns.map((spaceRun) => ({
      runId: spaceRun.runId,
      target: spaceRun.target,
      status: spaceRun.status,
      stats: spaceRun.stats,
      errorMessage: spaceRun.errorMessage,
    })),
  };
}

export async function main() {
  const command = parseIndexingCliArgs(process.argv.slice(2));
  const context = createAppContext();

  try {
    if (command.type === "status") {
      const snapshot = await buildSyncStatusSnapshot({
        config: context.config,
        stateStore: context.syncStateStore,
        indexStore: context.indexStore,
        worker: context.incrementalSyncWorker,
        vectorStore: context.vectorStore,
        recentRunLimit: command.recentRuns,
      });

      process.stdout.write(
        `${JSON.stringify(
          {
            command: "status",
            snapshot,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    if (command.type === "full") {
      const result = await context.internalReindexService.fullReindex({
        tenantId: command.tenantId,
        spaceKeys: command.spaceKeys,
        maxSpaces: command.maxSpaces,
        maxPagesPerSpace: command.maxPagesPerSpace,
        reason: command.reason,
      });

      process.stdout.write(
        `${JSON.stringify(
          {
            command: "full",
            result: summarizeFullResult(result),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    if (command.type === "space") {
      const result = await context.internalReindexService.reindexSpace({
        tenantId: command.tenantId,
        spaceKey: command.spaceKey,
        maxPagesPerSpace: command.maxPagesPerSpace,
        reason: command.reason,
      });

      process.stdout.write(
        `${JSON.stringify(
          {
            command: "space",
            result: summarizeFullResult(result),
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const result = await context.internalReindexService.reindexPage({
      tenantId: command.tenantId,
      pageId: command.pageId,
      spaceKey: command.spaceKey,
      bodyFormat: command.bodyFormat,
      reason: command.reason,
    });

    process.stdout.write(
      `${JSON.stringify(
        {
          command: "page",
          result: summarizePageResult(result),
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await context.vectorStore?.close?.();
  }
}

const entryScript = process.argv[1];

if (entryScript && import.meta.url === pathToFileURL(entryScript).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify(
        {
          message: error instanceof Error ? error.message : "Unknown indexing command error.",
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  });
}
