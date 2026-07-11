import { ChangePlan, FileOperation } from "./types";

export interface ResolvedLink {
  from: string;
  to: string;
}

export interface ResolvedLinks {
  resolved: ResolvedLink[];
  unresolved: string[];
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:[#][^\]|]+)?(?:\|([^\]]+))?\]\]/g;

export function resolveWikilinks(content: string, existingPaths: string[]): ResolvedLinks {
  const resolved: ResolvedLink[] = [];
  const unresolved: string[] = [];
  const basenameIndex = buildBasenameIndex(existingPaths);
  const seenUnresolved = new Set<string>();

  let match;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const fullMatch = match[0];
    const target = match[1].trim();
    const alias = match[2];

    if (target.length === 0) continue;

    const lowerTarget = target.toLowerCase();
    const correctBasename = basenameIndex.get(lowerTarget);

    if (correctBasename === undefined) {
      if (!seenUnresolved.has(lowerTarget)) {
        unresolved.push(target);
        seenUnresolved.add(lowerTarget);
      }
      continue;
    }

    if (correctBasename === target) continue;

    const displayText = alias ?? target;
    const sectionMatch = fullMatch.match(/\[\[[^\]|#]+(#[^\]|]+)(?:\|[^\]]+)?\]\]/);
    const section = sectionMatch ? sectionMatch[1] : "";

    const to = section
      ? `[[${correctBasename}${section}|${displayText}]]`
      : `[[${correctBasename}|${displayText}]]`;

    resolved.push({ from: fullMatch, to });
  }

  return { resolved, unresolved };
}

function buildBasenameIndex(paths: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of paths) {
    const basename = path.replace(/^.*[/\\]/, "").replace(/\.md$/i, "");
    const lower = basename.toLowerCase();
    if (!index.has(lower)) {
      index.set(lower, basename);
    }
  }
  return index;
}

export function resolveLinksInPlan(
  plan: ChangePlan,
  existingPaths: string[]
): { plan: ChangePlan; links: ResolvedLinks } {
  const allResolved: ResolvedLink[] = [];
  const allUnresolved = new Set<string>();
  const operations: FileOperation[] = [];

  for (const operation of plan.operations) {
    if (operation.kind === "delete" || !operation.content) {
      operations.push(operation);
      continue;
    }

    const { resolved, unresolved } = resolveWikilinks(operation.content, existingPaths);
    for (const r of resolved) allResolved.push(r);
    for (const u of unresolved) allUnresolved.add(u);

    if (resolved.length === 0) {
      operations.push(operation);
      continue;
    }

    let newContent = operation.content;
    for (const r of resolved) {
      newContent = newContent.split(r.from).join(r.to);
    }

    operations.push({ ...operation, content: newContent });
  }

  return {
    plan: { ...plan, operations },
    links: { resolved: allResolved, unresolved: Array.from(allUnresolved) }
  };
}
