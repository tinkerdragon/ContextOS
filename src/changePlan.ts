import { t } from "./i18n";
import { extractJsonObject } from "./jsonExtract";
import { ChangePlan, FileOperation, LLMWikiSettings } from "./types";

const ALLOWED_KINDS = new Set(["create", "update", "append", "prepend", "delete"]);

// A change plan is a record with a string summary and an operations array. Passed to the JSON
// extractor so a shape-valid example/preamble object cannot be mistaken for the real plan.
function isChangePlanShape(value: unknown): boolean {
  return isRecord(value) && typeof value.summary === "string" && Array.isArray(value.operations);
}

export function parseChangePlan(text: string): ChangePlan {
  const parsed = extractJsonObject(text, isChangePlanShape);
  if (!isChangePlanShape(parsed)) {
    throw new Error(t("error.invalidChangePlanShape"));
  }
  const record = parsed as { summary: string; operations: unknown[] };
  const operations = record.operations.map(assertOperationShape);
  return { summary: record.summary, operations };
}

// Whether an operation kind mutates or removes existing content destructively. Centralized so the
// auto-apply gate, preview, and any future consumer share one definition of "needs review".
export function isDestructiveOperationKind(kind: FileOperation["kind"]): boolean {
  return kind === "delete";
}

export function planHasDestructiveOperation(plan: ChangePlan): boolean {
  return plan.operations.some((operation) => isDestructiveOperationKind(operation.kind));
}

export function validateChangePlan(plan: ChangePlan, settings: LLMWikiSettings): ChangePlan {
  validateSettingsPaths(settings);
  for (const operation of plan.operations) {
    const normalized = normalizePath(operation.path);
    if (normalized !== operation.path) {
      throw new Error(t("error.unsafePath", { path: operation.path }));
    }
    if (!isAllowedWritePath(normalized, settings)) {
      throw new Error(t("error.pathOutsideWiki", { path: operation.path }));
    }
    if (isReadOnlyPath(normalized, settings)) {
      throw new Error(t("error.pathInsideReadOnly", { path: operation.path }));
    }
    if (operation.kind === "delete"
      && (normalized === normalizePath(settings.indexPath) || normalized === normalizePath(settings.logPath))) {
      throw new Error(t("error.cannotDeleteIndexOrLog", { path: operation.path }));
    }
  }
  return plan;
}

export function normalizePath(path: string): string {
  if (path.startsWith("/") || path.includes("\\")) {
    throw new Error(t("error.unsafePath", { path }));
  }
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") throw new Error(t("error.unsafePath", { path }));
    parts.push(part);
  }
  return parts.join("/");
}

function assertOperationShape(operation: unknown): FileOperation {
  if (!isRecord(operation) || typeof operation.kind !== "string" || !ALLOWED_KINDS.has(operation.kind)) {
    throw new Error(t("error.invalidOperationKind"));
  }
  const kind = operation.kind as FileOperation["kind"];
  if (typeof operation.path !== "string") throw new Error(t("error.invalidOperationPath"));
  // delete has nothing to write, so its content is optional (defaults to empty).
  if (kind !== "delete" && typeof operation.content !== "string") throw new Error(t("error.invalidOperationContent"));
  if (typeof operation.rationale !== "string") throw new Error(t("error.invalidOperationRationale"));
  return {
    kind,
    path: operation.path,
    content: typeof operation.content === "string" ? operation.content : "",
    rationale: operation.rationale
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function validateSettingsPaths(settings: LLMWikiSettings): void {
  const wikiFolder = normalizePath(settings.wikiFolder);
  const indexPath = normalizePath(settings.indexPath);
  const logPath = normalizePath(settings.logPath);

  if (!isInsideFolder(indexPath, wikiFolder)) {
    throw new Error(t("error.indexOutsideWiki"));
  }
  if (!isInsideFolder(logPath, wikiFolder)) {
    throw new Error(t("error.logOutsideWiki"));
  }
}

function isAllowedWritePath(path: string, settings: LLMWikiSettings): boolean {
  const wikiFolder = normalizePath(settings.wikiFolder);
  return isInsideFolder(path, wikiFolder);
}

function isReadOnlyPath(path: string, settings: LLMWikiSettings): boolean {
  return isInsideFolder(path, normalizePath(settings.rawFolder)) ||
    isInsideFolder(path, normalizePath(settings.assetsFolder));
}

function isInsideFolder(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}
