import { readFile } from "node:fs/promises";
import path from "node:path";

import { createAppContext } from "../app/context.js";
import { retrievalBenchmarkSuiteSchema } from "./types.js";
import { RetrievalBenchmarkRunner } from "./retrieval-benchmark-runner.js";

type CliOptions = {
  benchmarkPath: string;
  reindex: "none" | "full" | { spaceKey: string };
};

function parseArgs(argv: string[]): CliOptions {
  const benchmarkPath = argv.find((argument) => !argument.startsWith("--"));

  if (!benchmarkPath) {
    throw new Error(
      "Benchmark file path is required. Example: npm run evaluate:retrieval -- benchmarks/sample-retrieval-benchmark.json --reindex-full",
    );
  }

  const reindexFull = argv.includes("--reindex-full");
  const reindexSpaceArgument = argv.find((argument) => argument.startsWith("--reindex-space="));

  if (reindexFull && reindexSpaceArgument) {
    throw new Error("Use either --reindex-full or --reindex-space=<SPACE>, not both.");
  }

  if (reindexFull) {
    return {
      benchmarkPath,
      reindex: "full",
    };
  }

  if (reindexSpaceArgument) {
    const spaceKey = reindexSpaceArgument.split("=", 2)[1]?.trim();

    if (!spaceKey) {
      throw new Error("--reindex-space requires a non-empty space key.");
    }

    return {
      benchmarkPath,
      reindex: {
        spaceKey,
      },
    };
  }

  return {
    benchmarkPath,
    reindex: "none",
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = createAppContext();

  if (options.reindex === "full") {
    context.logger.info("Running full internal reindex before retrieval evaluation");
    await context.internalReindexService.fullReindex({
      reason: "manual",
    });
  } else if (options.reindex !== "none") {
    context.logger.info("Running space internal reindex before retrieval evaluation", {
      spaceKey: options.reindex.spaceKey,
    });
    await context.internalReindexService.reindexSpace({
      spaceKey: options.reindex.spaceKey,
      reason: "manual",
    });
  }

  const benchmarkFile = path.resolve(process.cwd(), options.benchmarkPath);
  const rawBenchmark = await readFile(benchmarkFile, "utf8");
  const suite = retrievalBenchmarkSuiteSchema.parse(JSON.parse(rawBenchmark));
  const runner = new RetrievalBenchmarkRunner(context.contentService, context.indexStore);
  const report = await runner.runSuite(suite);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        message: error instanceof Error ? error.message : "Unknown evaluation error.",
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
