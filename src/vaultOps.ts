import { App, TFile } from "obsidian";
import { ChangePlan, FileOperation, LLMWikiSettings } from "./types";
import { normalizePath } from "./changePlan";
import { t } from "./i18n";
import { resolveWikilinks } from "./linkResolver";

const MAX_HISTORY_ENTRIES = 20;

interface HistoryEntry {
  plan: ChangePlan;
  snapshots: FileSnapshot[];
  appliedAt: string;
}

export function isRawPath(path: string, settings: LLMWikiSettings): boolean {
  const rawFolder = normalizePath(settings.rawFolder);
  return normalizePath(path).startsWith(`${rawFolder}/`);
}

export function ensureMarkdownPath(path: string): string {
  const normalized = normalizePath(path);
  if (!normalized.endsWith(".md")) {
    throw new Error(t("error.markdownExtensionRequired"));
  }
  return normalized;
}

export async function readTextFile(app: App, path: string): Promise<string> {
  const normalized = ensureMarkdownPath(path);
  const file = app.vault.getAbstractFileByPath(normalized);
  if (file instanceof TFile) return app.vault.read(file);
  return "";
}

export async function listMarkdownFiles(app: App, folder: string): Promise<Array<{ path: string; content: string }>> {
  const normalizedFolder = normalizePath(folder);
  const files = app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(`${normalizedFolder}/`));
  const pages = [];
  for (const file of files) {
    pages.push({ path: file.path, content: await app.vault.read(file) });
  }
  return pages;
}

export function listMarkdownFilePaths(app: App, folder: string): string[] {
  const normalizedFolder = normalizePath(folder);
  return app.vault.getMarkdownFiles()
    .filter((file) => file.path.startsWith(`${normalizedFolder}/`))
    .map((file) => file.path);
}

export async function readWikiPages(app: App, paths: string[]): Promise<Array<{ path: string; content: string }>> {
  const pages: Array<{ path: string; content: string }> = [];
  for (const path of paths) {
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      pages.push({ path, content: await app.vault.read(file) });
    }
  }
  return pages;
}

export async function applyChangePlan(app: App, plan: ChangePlan): Promise<void> {
  preValidatePlan(app, plan);
  warnUnresolvedLinks(app, plan);
  const snapshots = await snapshotAffectedFiles(app, plan);
  try {
    for (const operation of plan.operations) {
      await applyOperation(app, operation);
    }
    await saveHistory(app, { plan, snapshots, appliedAt: new Date().toISOString() });
  } catch (error) {
    await rollback(app, snapshots);
    throw error;
  }
}

// Reject the whole plan before any write when an operation is bound to fail, so a plan
// is never applied halfway.
function preValidatePlan(app: App, plan: ChangePlan): void {
  // Normalize each path once, then classify into delete vs write targets.
  const entries = plan.operations.map((operation) => ({ operation, path: ensureMarkdownPath(operation.path) }));
  const deletePaths = new Set<string>();
  const writePaths = new Set<string>();
  for (const { operation, path } of entries) {
    (operation.kind === "delete" ? deletePaths : writePaths).add(path);
  }
  for (const { operation, path } of entries) {
    // A path can't be both deleted and written in one plan: the intended order is ambiguous
    // and only half of the self-cancelling plan would apply.
    if (deletePaths.has(path) && writePaths.has(path)) {
      throw new Error(t("error.conflictingOperations", { path }));
    }
    const existing = app.vault.getAbstractFileByPath(path);
    if (operation.kind === "create") {
      if (existing) throw new Error(t("error.fileAlreadyExists", { path }));
    } else if (operation.kind === "delete") {
      // Reject deleting a path that isn't a current file (missing or a folder) so a
      // hallucinated or stale path surfaces instead of silently no-opping.
      if (!existing) throw new Error(t("error.cannotDeleteMissingFile", { path }));
      if (!(existing instanceof TFile)) throw new Error(t("error.pathIsFolder", { path }));
    } else if (existing && !(existing instanceof TFile)) {
      throw new Error(t("error.pathIsFolder", { path }));
    }
  }
}

function warnUnresolvedLinks(app: App, plan: ChangePlan): void {
  try {
    const existingPaths = app.vault.getMarkdownFiles().map((f) => f.path);
    const validKinds = new Set(["create", "update"]);
    for (const operation of plan.operations) {
      if (!validKinds.has(operation.kind) || !operation.content) continue;
      const { unresolved } = resolveWikilinks(operation.content, existingPaths);
      for (const link of unresolved) {
        console.warn(`[ContextOS] Unresolved wikilink [[${link}]] in ${operation.path}`);
      }
      if (!/^---\s*\n[\s\S]*?\bsources:\s/.test(operation.content)) {
        console.warn(`[ContextOS] Missing sources frontmatter in ${operation.path}`);
      }
    }
  } catch {
    // getMarkdownFiles may not be available in test environments
  }
}

interface FileSnapshot {
  path: string;
  existed: boolean;
  content: string | null;
}

async function snapshotAffectedFiles(app: App, plan: ChangePlan): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = [];
  const seen = new Set<string>();
  for (const operation of plan.operations) {
    const path = ensureMarkdownPath(operation.path);
    if (seen.has(path)) continue;
    seen.add(path);
    const existing = app.vault.getAbstractFileByPath(path);
    if (existing instanceof TFile) {
      snapshots.push({ path, existed: true, content: await app.vault.read(existing) });
    } else {
      snapshots.push({ path, existed: false, content: null });
    }
  }
  return snapshots;
}

// Best-effort restore to the pre-apply state: delete files that were newly created, recreate
// files that were deleted, and restore the original content of files that were modified. Keep
// going if one restore fails.
async function rollback(app: App, snapshots: FileSnapshot[]): Promise<void> {
  for (const snapshot of snapshots) {
    try {
      const existing = app.vault.getAbstractFileByPath(snapshot.path);
      if (snapshot.existed) {
        if (existing instanceof TFile && snapshot.content !== null) {
          await app.vault.modify(existing, snapshot.content);
        } else if (!existing && snapshot.content !== null) {
          await ensureParentFolders(app, snapshot.path);
          await app.vault.create(snapshot.path, snapshot.content);
        }
      } else if (existing instanceof TFile) {
        await app.fileManager.trashFile(existing);
      }
    } catch {
      // Ignore individual rollback failures; restore as much as possible.
    }
  }
}

async function applyOperation(app: App, operation: FileOperation): Promise<void> {
  const path = ensureMarkdownPath(operation.path);
  if (operation.kind === "delete") {
    const target = app.vault.getAbstractFileByPath(path);
    if (target instanceof TFile) await app.fileManager.trashFile(target);
    return;
  }
  await ensureParentFolders(app, path);
  const existing = app.vault.getAbstractFileByPath(path);
  if (operation.kind === "create") {
    if (existing) throw new Error(t("error.fileAlreadyExists", { path }));
    await app.vault.create(path, operation.content);
    return;
  }
  if (existing instanceof TFile) {
    if (operation.kind === "append") {
      const current = await app.vault.read(existing);
      await app.vault.modify(existing, `${current}\n${operation.content}`);
      return;
    }
    if (operation.kind === "prepend") {
      const current = await app.vault.read(existing);
      const separator = current.trim().length > 0 ? "\n\n" : "";
      await app.vault.modify(existing, `${operation.content}${separator}${current}`);
      return;
    }
    await app.vault.modify(existing, operation.content);
    return;
  }
  await app.vault.create(path, operation.content);
}

async function ensureParentFolders(app: App, path: string): Promise<void> {
  const parts = path.split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    if (!app.vault.getAbstractFileByPath(current)) {
      await app.vault.createFolder(current);
    }
  }
}

async function saveHistory(app: App, entry: HistoryEntry): Promise<void> {
  const configDir = getHistoryDir();
  try {
    const existing = await loadHistory(app);
    const hash = hashSimple(JSON.stringify(entry.plan));
    const fileName = `${Date.now()}-${hash}.json`;
    const historyPath = `${configDir}/${fileName}`;

    await ensureParentFolders(app, historyPath);
    await app.vault.create(historyPath, JSON.stringify(entry, null, 2));

    const allEntries = [...existing, fileName];
    if (allEntries.length > MAX_HISTORY_ENTRIES) {
      const toRemove = allEntries.slice(0, allEntries.length - MAX_HISTORY_ENTRIES);
      for (const name of toRemove) {
        try {
          const file = app.vault.getAbstractFileByPath(`${configDir}/${name}`);
          if (file instanceof TFile) await app.fileManager.trashFile(file);
        } catch {
          // Best-effort cleanup
        }
      }
    }
  } catch {
    // History persistence is best-effort; don't block the main flow
  }
}

async function loadHistory(app: App): Promise<string[]> {
  const configDir = getHistoryDir();
  try {
    const files = app.vault.getFiles().filter((f) => f.path.startsWith(`${configDir}/`) && f.path.endsWith(".json"));
    return files.map((f) => f.name).sort();
  } catch {
    return [];
  }
}

function getHistoryDir(): string {
  return ".contextos/history";
}

function hashSimple(content: string): string {
  let fnv = 2166136261;
  for (let i = 0; i < content.length; i++) {
    fnv = Math.imul(fnv ^ content.charCodeAt(i), 16777619);
  }
  return (fnv >>> 0).toString(16).padStart(8, "0");
}

export async function getLatestHistoryEntry(app: App): Promise<HistoryEntry | undefined> {
  const configDir = getHistoryDir();
  try {
    const entries = await loadHistory(app);
    if (entries.length === 0) return undefined;
    const latest = entries[entries.length - 1];
    const file = app.vault.getAbstractFileByPath(`${configDir}/${latest}`);
    if (!(file instanceof TFile)) return undefined;
    const content = await app.vault.read(file);
    return JSON.parse(content) as HistoryEntry;
  } catch {
    return undefined;
  }
}

export async function revertChangePlan(app: App, entry: HistoryEntry): Promise<void> {
  const snapshotMap = new Map(entry.snapshots.map((s) => [s.path, s]));

  for (const operation of entry.plan.operations) {
    if (operation.kind === "create") {
      const existing = app.vault.getAbstractFileByPath(operation.path);
      if (existing instanceof TFile) await app.fileManager.trashFile(existing);
    } else if (operation.kind === "update" || operation.kind === "append" || operation.kind === "prepend") {
      const snapshot = snapshotMap.get(operation.path);
      if (!snapshot || !snapshot.existed || snapshot.content === null) continue;
      const existing = app.vault.getAbstractFileByPath(operation.path);
      if (existing instanceof TFile) {
        await app.vault.modify(existing, snapshot.content);
      }
    } else if (operation.kind === "delete") {
      const snapshot = snapshotMap.get(operation.path);
      if (!snapshot || !snapshot.existed || snapshot.content === null) continue;
      await ensureParentFolders(app, operation.path);
      await app.vault.create(operation.path, snapshot.content);
    }
  }

  const configDir = getHistoryDir();
  const entries = await loadHistory(app);
  if (entries.length > 0) {
    const latest = entries[entries.length - 1];
    try {
      const file = app.vault.getAbstractFileByPath(`${configDir}/${latest}`);
      if (file instanceof TFile) await app.fileManager.trashFile(file);
    } catch {
      // Best-effort cleanup
    }
  }
}
