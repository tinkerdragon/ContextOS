import { App, TFile } from "obsidian";
import { LLMWikiSettings, BrokenLink, StalePage, DeterministicLintReport } from "./types";
import { normalizePath } from "./changePlan";
import { hashContent } from "./rawTracker";

const WIKILINK_PARSE_RE = /\[\[([^\]|#]+)(?:[#][^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

export async function runDeterministicLint(app: App, settings: LLMWikiSettings): Promise<DeterministicLintReport> {
  const wikiFolder = normalizePath(settings.wikiFolder);
  const indexPath = normalizePath(settings.indexPath);
  const logPath = normalizePath(settings.logPath);

  const allFiles = app.vault.getMarkdownFiles();
  const wikiFiles = allFiles.filter((f) => f.path.startsWith(`${wikiFolder}/`));

  const filePaths = wikiFiles.map((f) => f.path);
  const fileContents = new Map<string, string>();

  for (const file of wikiFiles) {
    try {
      fileContents.set(file.path, await app.vault.read(file));
    } catch {
      fileContents.set(file.path, "");
    }
  }

  const brokenLinks = findBrokenLinks(filePaths, fileContents, wikiFolder);
  const missingFrontmatter = findMissingFrontmatter(filePaths, fileContents);
  const orphans = findOrphans(filePaths, fileContents, indexPath, logPath);
  const deadIndexLinks = findDeadIndexLinks(indexPath, fileContents, filePaths);
  const duplicates = findDuplicateFilenames(filePaths);
  const stalePages = await findStalePages(app, settings, filePaths, fileContents);

  return { brokenLinks, missingFrontmatter, orphans, deadIndexLinks, duplicates, stalePages };
}

function findBrokenLinks(
  filePaths: string[],
  fileContents: Map<string, string>,
  wikiFolder: string
): BrokenLink[] {
  const basenameSet = new Map<string, string>();
  for (const p of filePaths) {
    const basename = p.replace(/^.*[/\\]/, "").replace(/\.md$/i, "");
    basenameSet.set(basename.toLowerCase(), basename);
  }

  const broken: BrokenLink[] = [];
  for (const filePath of filePaths) {
    const content = fileContents.get(filePath) ?? "";
    let match;
    while ((match = WIKILINK_PARSE_RE.exec(content)) !== null) {
      const target = match[1].trim();
      if (!target) continue;
      const lowerTarget = target.toLowerCase();
      if (!basenameSet.has(lowerTarget)) {
        broken.push({ pagePath: filePath, linkTarget: target });
      }
    }
    WIKILINK_PARSE_RE.lastIndex = 0;
  }

  return broken;
}

function findMissingFrontmatter(
  filePaths: string[],
  fileContents: Map<string, string>
): string[] {
  const missing: string[] = [];
  for (const path of filePaths) {
    const content = fileContents.get(path) ?? "";
    if (content.length === 0 && !FRONTMATTER_RE.test(content)) {
      continue;
    }
    if (!FRONTMATTER_RE.test(content)) {
      missing.push(path);
    }
  }
  return missing;
}

function findOrphans(
  filePaths: string[],
  fileContents: Map<string, string>,
  indexPath: string,
  logPath: string
): string[] {
  if (filePaths.length < 10) return [];

  const linkTargetSet = new Map<string, string>();
  for (const p of filePaths) {
    const basename = p.replace(/^.*[/\\]/, "").replace(/\.md$/i, "");
    linkTargetSet.set(basename.toLowerCase(), p);
  }

  const linked = new Set<string>();
  for (const filePath of filePaths) {
    const content = fileContents.get(filePath) ?? "";
    let match;
    while ((match = WIKILINK_PARSE_RE.exec(content)) !== null) {
      const target = match[1].trim();
      if (!target) continue;
      const resolved = linkTargetSet.get(target.toLowerCase());
      if (resolved) linked.add(resolved);
    }
    WIKILINK_PARSE_RE.lastIndex = 0;
  }

  const excluded = new Set([indexPath, logPath]);
  return filePaths.filter((p) => !excluded.has(p) && !linked.has(p));
}

function findDeadIndexLinks(
  indexPath: string,
  fileContents: Map<string, string>,
  filePaths: string[]
): string[] {
  const content = fileContents.get(indexPath);
  if (!content) return [];

  const basenameSet = new Map<string, string>();
  for (const p of filePaths) {
    const basename = p.replace(/^.*[/\\]/, "").replace(/\.md$/i, "");
    basenameSet.set(basename.toLowerCase(), basename);
  }

  const dead: string[] = [];
  let match;
  while ((match = WIKILINK_PARSE_RE.exec(content)) !== null) {
    const target = match[1].trim();
    if (!target) continue;
    if (!basenameSet.has(target.toLowerCase()) && !dead.includes(target)) {
      dead.push(target);
    }
  }

  return dead;
}

function findDuplicateFilenames(filePaths: string[]): string[] {
  const seen = new Map<string, string[]>();
  for (const path of filePaths) {
    const basename = path.replace(/^.*[/\\]/, "").replace(/\.md$/i, "");
    const lower = basename.toLowerCase();
    const existing = seen.get(lower) ?? [];
    existing.push(basename);
    seen.set(lower, existing);
  }

  const dupes: string[] = [];
  for (const [, names] of seen) {
    if (names.length > 1) {
      const unique = Array.from(new Set(names));
      if (unique.length > 1) dupes.push(unique[0]);
    }
  }
  return dupes;
}

async function findStalePages(
  app: App,
  settings: LLMWikiSettings,
  filePaths: string[],
  fileContents: Map<string, string>
): Promise<StalePage[]> {
  const stale: StalePage[] = [];

  for (const filePath of filePaths) {
    const fullContent = fileContents.get(filePath);
    if (!fullContent) continue;

    const fmMatch = fullContent.match(FRONTMATTER_RE);
    if (!fmMatch) continue;

    const sourcesRegex = /^sources:\s*\n([\s\S]*?)(?:\n\S)/m;
    const sourcesBlock = fmMatch[1].match(sourcesRegex);
    if (!sourcesBlock) continue;

    const sourceLines = sourcesBlock[1];
    const sourceEntries = sourceLines.match(/\s*-\s*path:\s*(\S+)\s*\n\s+hash:\s*(\S+)\s*\n\s+ingest_date:\s*(\S+)/g);
    if (!sourceEntries) continue;

    for (const entry of sourceEntries) {
      const pathMatch = entry.match(/path:\s*(\S+)/);
      const hashMatch = entry.match(/hash:\s*(\S+)/);
      if (!pathMatch || !hashMatch) continue;

      const sourcePath = pathMatch[1];
      const storedHash = hashMatch[1];

      try {
        const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
        if (!(sourceFile instanceof TFile)) {
          stale.push({ pagePath: filePath, sourcePath, storedHash, currentHash: "(missing)" });
          continue;
        }
        const content = await app.vault.read(sourceFile);
        const currentHash = hashContent(content);
        if (!currentHash.startsWith(storedHash) && storedHash.length >= 8 && !currentHash.startsWith(storedHash)) {
          stale.push({ pagePath: filePath, sourcePath, storedHash, currentHash });
        }
      } catch {
        // Can't read source; skip stale check for this entry
      }
    }
  }

  return stale;
}
