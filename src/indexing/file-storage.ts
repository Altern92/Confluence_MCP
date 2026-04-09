import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

function resolveStoragePath(filePath: string) {
  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

export function ensureParentDirectory(filePath: string) {
  mkdirSync(dirname(resolveStoragePath(filePath)), {
    recursive: true,
  });
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  const resolvedPath = resolveStoragePath(filePath);

  if (!existsSync(resolvedPath)) {
    return fallback;
  }

  const raw = readFileSync(resolvedPath, "utf8");
  return JSON.parse(raw) as T;
}

export function writeJsonFileAtomic(filePath: string, value: unknown) {
  const resolvedPath = resolveStoragePath(filePath);
  const tempPath = `${resolvedPath}.tmp`;

  ensureParentDirectory(resolvedPath);
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

  try {
    if (existsSync(resolvedPath)) {
      rmSync(resolvedPath);
    }

    renameSync(tempPath, resolvedPath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only.
    }

    throw error;
  }
}
