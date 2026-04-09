import * as z from "zod/v4";

import type { AppContext } from "../app/context.js";
import {
  buildOutputValidationToolError,
  classifyToolError,
  toStructuredToolResult,
  toToolError,
} from "./tool-results.js";

type ToolLogContext = Record<string, unknown>;

type ExecuteToolOptions<TInput, TOutput> = {
  context: AppContext;
  toolName: string;
  input: TInput;
  outputSchema: z.ZodType<TOutput>;
  execute: () => Promise<TOutput>;
  buildBaseContext?: (input: TInput) => ToolLogContext;
  buildSuccessContext?: (input: TInput, output: TOutput) => ToolLogContext;
};

export async function executeTool<TInput, TOutput>({
  context,
  toolName,
  input,
  outputSchema,
  execute,
  buildBaseContext,
  buildSuccessContext,
}: ExecuteToolOptions<TInput, TOutput>) {
  const startedAt = Date.now();
  const baseContext = {
    toolName,
    ...(buildBaseContext?.(input) ?? {}),
  };

  try {
    const output = await execute();
    const validatedOutput = outputSchema.parse(output);
    const durationMs = Date.now() - startedAt;

    context.metrics.recordToolInvocation({
      toolName,
      outcome: "success",
      durationMs,
    });

    context.logger.info(`${toolName} completed`, {
      ...baseContext,
      durationMs,
      ...(buildSuccessContext?.(input, validatedOutput) ?? {}),
    });

    return toStructuredToolResult(validatedOutput);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorInfo =
      error instanceof z.ZodError
        ? buildOutputValidationToolError(error)
        : classifyToolError(error);

    context.metrics.recordToolInvocation({
      toolName,
      outcome: "error",
      durationMs,
      errorClass: errorInfo.structuredContent.errorClass,
    });

    context.logger.error(`${toolName} failed`, {
      ...baseContext,
      durationMs,
      errorClass: errorInfo.structuredContent.errorClass,
      confluenceStatus: errorInfo.structuredContent.status ?? null,
      error,
      input,
    });

    return toToolError(errorInfo);
  }
}
