import { t, getOutputLanguageName } from "./i18n";
import { extractJsonArray } from "./jsonExtract";
import { DEFAULT_SETTINGS } from "./settings";
import { LLMWikiSettings, WikiContext } from "./types";

function outputLanguageInstruction(): string {
  return t("prompt.outputLanguageInstruction", { language: getOutputLanguageName() });
}

// `allowDelete` is enabled only for lint: delete is destructive and belongs to the reconcile
// pass, not to ingest/query (which should only create/update pages). Offering delete to the
// auto-ingest flow would also make plans defer to manual review and re-run every poll.
function buildJsonContract(settings: LLMWikiSettings, allowDelete = false): string {
  const deleteExample = allowDelete
    ? `,\n    { "kind": "delete", "path": "${settings.wikiFolder}/obsolete.md", "rationale": "why this page is removed" }`
    : "";
  const kinds = allowDelete ? "create, update, append, prepend, or delete" : "create, update, append, or prepend";
  const deleteNote = allowDelete
    ? ` delete removes a page inside ${settings.wikiFolder}/ and takes no content — use it only for orphaned or fully superseded pages.`
    : "";
  return `Return only JSON with this shape:
{
  "summary": "short human-readable summary",
  "operations": [
    { "kind": "create", "path": "${settings.wikiFolder}/example.md", "content": "markdown", "rationale": "why this file changes" },
    { "kind": "update", "path": "${settings.indexPath}", "content": "full replacement markdown", "rationale": "why this file changes" },
    { "kind": "prepend", "path": "${settings.logPath}", "content": "newest-first markdown log entry", "rationale": "why this file changes" }${deleteExample}
  ]
}
Use only ${kinds}.${deleteNote} Write only inside ${settings.wikiFolder}/. Use ${settings.indexPath} for the content index and ${settings.logPath} for the newest-first chronological log. Use prepend for new entries in ${settings.logPath}. Treat ${settings.rawFolder}/ and ${settings.assetsFolder}/ as read-only.`;
}

export function buildIngestPrompt(context: WikiContext, settings: LLMWikiSettings = DEFAULT_SETTINGS): string {
  return `You maintain a persistent LLM Wiki in Obsidian. Raw sources are immutable. Integrate the source into the wiki by creating or updating markdown pages, refreshing the configured index, and prepending a newest-first entry to the configured log.

${outputLanguageInstruction()}

${buildJsonContract(settings)}

Current index:
${context.index}

Current log:
${context.log}

Changed raw sources:
${formatSources(context)}`;
}

export function buildQueryPrompt(context: WikiContext, settings: LLMWikiSettings = DEFAULT_SETTINGS): string {
  // When an answer is supplied (e.g. "Save to wiki" from the chat), persist THAT answer rather
  // than re-deriving one, so the saved page matches what the user actually saw.
  const intro = context.answer !== undefined
    ? "You are filing a completed question-and-answer back into the persistent LLM Wiki. Persist the answer below as a new or updated wiki page (with citations) so explorations compound, and prepend a newest-first entry to the log to record this query."
    : "You answer questions using the persistent LLM Wiki. Synthesize an answer from the index and the relevant pages, with citations. If the answer is worth keeping — a comparison, analysis, or connection — file it back as a new or updated wiki page so explorations compound in the knowledge base. Also prepend a newest-first entry to the log to record this query.";
  const answerSection = context.answer !== undefined ? `\nAnswer to file:\n${context.answer}\n` : "";
  return `${intro}

${outputLanguageInstruction()}

${buildJsonContract(settings)}

Question: ${context.question}
${answerSection}
Current index:
${context.index}

Current log:
${context.log}

Relevant wiki pages:
${formatWikiPages(context.wikiPages ?? [])}`;
}

export function buildChatSystemPrompt(settings: LLMWikiSettings = DEFAULT_SETTINGS): string {
  return `You are a helpful assistant answering questions from a user's persistent LLM Wiki. Answer only from the wiki context provided in the conversation (the index and the relevant pages). Cite the wiki pages you use by their path, e.g. ${settings.wikiFolder}/example.md. If the wiki does not cover the question, say so plainly instead of guessing. Be concise and conversational. Reply in plain text or Markdown — never JSON.

${outputLanguageInstruction()}`;
}

export function buildChatContextMessage(
  context: { index: string; wikiPages: Array<{ path: string; content: string }> },
  settings: LLMWikiSettings = DEFAULT_SETTINGS
): string {
  // The log records ingest/query operations, not knowledge, so it is deliberately omitted here.
  return `Wiki context for answering the question. Treat the ${settings.wikiFolder}/ pages below as your only knowledge source.

Current index:
${context.index}

Relevant wiki pages:
${formatWikiPages(context.wikiPages)}`;
}

export function buildQuerySelectionPrompt(
  context: { index: string; question: string; pagePaths: string[] },
  settings: LLMWikiSettings = DEFAULT_SETTINGS
): string {
  return `You are selecting which wiki pages are most relevant to a question. Choose only from the provided page paths.

Question: ${context.question}

Current index:
${context.index}

Available page paths:
${context.pagePaths.join("\n")}

Return only a JSON array of the most relevant page paths (fewer is better), for example ["${settings.wikiFolder}/example.md"]. Do not include any other text.`;
}

export function parseSelectedQueryPages(response: string, availablePaths: string[], limit: number): string[] {
  const available = new Set(availablePaths);
  const parsed = extractJsonArray(response);
  const selected = Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === "string" && available.has(value))
    : [];
  const deduped = Array.from(new Set(selected));
  return deduped.length > 0 ? deduped.slice(0, limit) : availablePaths.slice(0, limit);
}

export function buildLintPrompt(context: WikiContext, settings: LLMWikiSettings = DEFAULT_SETTINGS): string {
  return `You lint a persistent LLM Wiki. Raw sources in ${settings.rawFolder}/ are the ground truth, and the wiki is a synthesis distilled from them — a page usually draws on several sources and is rarely a 1:1 mirror of one file. Your job is to reconcile the wiki with the CURRENT set of raw sources listed below, and to fix contradictions, stale claims, missing cross-references, important concepts without pages, and data gaps.

When a page is no longer fully backed by an existing raw source, judge it page by page instead of deleting blindly:
- If the page only mirrored a source that was removed and nothing of value remains, propose a delete operation (it is a true orphan).
- If the page still synthesizes other present sources, or holds conclusions and cross-references that still stand, propose an update instead: drop the claims that lost their source, keep what remains valid, and note the resulting gap.
Prefer revising over deleting; delete a page only when it would otherwise be empty or meaningless. Do not save a lint report as a wiki page — put all findings in the summary field only.

${outputLanguageInstruction()}

${buildJsonContract(settings, true)}

Current index:
${context.index}

Current log:
${context.log}

Current raw sources (${settings.rawFolder}/):
${formatRawPaths(context.rawPaths ?? [])}

Wiki pages:
${formatWikiPages(context.wikiPages ?? [])}`;
}

function formatRawPaths(paths: string[]): string {
  return paths.length > 0 ? paths.join("\n") : "(none)";
}

function formatWikiPages(pages: Array<{ path: string; content: string }>): string {
  return pages.map((page) => `---
Path: ${page.path}
${page.content}`).join("\n\n");
}

function formatSources(context: WikiContext): string {
  const sources = context.sources ?? (
    context.sourcePath && context.sourceContent !== undefined
      ? [{ path: context.sourcePath, content: context.sourceContent }]
      : []
  );
  return sources.map((source) => `---
Source path: ${source.path}
${source.content}`).join("\n");
}
