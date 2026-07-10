import { buildChatContextMessage, buildChatSystemPrompt, buildIngestPrompt, buildLintPrompt, buildQueryPrompt, buildQuerySelectionPrompt, parseSelectedQueryPages } from "../src/prompts";
import { DEFAULT_SETTINGS } from "../src/settings";
import { __setLanguage } from "./obsidianMock";

beforeEach(() => {
  __setLanguage("en");
});

test("ingest prompt asks for strict JSON change plan", () => {
  const prompt = buildIngestPrompt({ index: "# Index", log: "# Log", sourcePath: "raw/a.md", sourceContent: "hello" });
  expect(prompt).toContain("Return only JSON");
  expect(prompt).toContain("raw/a.md");
  expect(prompt).toContain("create");
  expect(prompt).toContain("update");
  expect(prompt).toContain("append");
});

test("ingest prompt asks for newest-first log prepends", () => {
  const prompt = buildIngestPrompt({ index: "# Index", log: "# Log", sourcePath: "raw/a.md", sourceContent: "hello" });

  expect(prompt).toContain('"kind": "prepend"');
  expect(prompt).toContain("newest-first");
  expect(prompt).toContain("Use prepend for new entries in wiki/log.md");
});

test("ingest prompt uses Simplified Chinese output instruction for zh locale", () => {
  __setLanguage("zh");

  const prompt = buildIngestPrompt({ index: "# Index", log: "# Log", sourcePath: "raw/a.md", sourceContent: "hello" });

  expect(prompt).toContain("Write user-visible natural-language output in Simplified Chinese.");
});

test("ingest and query prompts do not offer the destructive delete operation", () => {
  const ingest = buildIngestPrompt({ index: "# Index", log: "# Log", sourcePath: "raw/a.md", sourceContent: "hello" });
  const query = buildQueryPrompt({ index: "# Index", log: "# Log", question: "Q", wikiPages: [] });
  expect(ingest).not.toContain('"kind": "delete"');
  expect(ingest).toContain("create, update, append, or prepend");
  expect(query).not.toContain('"kind": "delete"');
  expect(query).toContain("create, update, append, or prepend");
});

test("only the lint prompt offers the delete operation in its contract", () => {
  const lint = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [], rawPaths: [] });
  expect(lint).toContain('"kind": "delete"');
  expect(lint).toContain("create, update, append, prepend, or delete");
});

test("query prompt includes question and asks for saveable result", () => {
  const prompt = buildQueryPrompt({ index: "# Index", log: "", question: "What changed?", wikiPages: [] });
  expect(prompt).toContain("What changed?");
  expect(prompt).toContain("file it back as a new or updated wiki page");
});

test("query prompt includes the log and asks to record the query", () => {
  const prompt = buildQueryPrompt({
    index: "# Index",
    log: "## [2026-01-01] ingest | Article",
    question: "Q",
    wikiPages: []
  });
  expect(prompt).toContain("Current log:");
  expect(prompt).toContain("## [2026-01-01] ingest | Article");
  expect(prompt).toContain("record this query");
});

test("lint prompt asks for contradictions and orphan pages", () => {
  const prompt = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [{ path: "wiki/a.md", content: "A" }] });
  expect(prompt).toContain("contradictions");
  expect(prompt).toContain("orphan");
});

test("json contract lists the delete operation", () => {
  const prompt = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [] });
  expect(prompt).toContain("delete");
});

test("lint prompt defines an orphan as a page whose raw source was removed and asks to delete it", () => {
  const prompt = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [], rawPaths: [] });
  // Pin the distinctive orphan-definition prose, not tokens the JSON contract always contains.
  expect(prompt).toContain("no longer fully backed by an existing raw source");
  expect(prompt).toContain("propose a delete operation (it is a true orphan)");
});

test("lint prompt lists the current raw sources so orphans can be detected", () => {
  const prompt = buildLintPrompt({
    index: "# Index",
    log: "# Log",
    wikiPages: [{ path: "wiki/a.md", content: "A" }],
    rawPaths: ["raw/kept.pdf", "raw/notes.md"]
  });
  expect(prompt).toContain("raw/kept.pdf");
  expect(prompt).toContain("raw/notes.md");
});

test("lint prompt does not ask to save a report as a wiki page", () => {
  const prompt = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [], rawPaths: [] });
  expect(prompt).not.toContain("Save the report");
});

test("lint reconciles the wiki as a synthesis, preferring revision over deletion", () => {
  const prompt = buildLintPrompt({ index: "# Index", log: "# Log", wikiPages: [], rawPaths: [] });
  // Karpathy: the wiki is distilled from many sources, so a lost source should usually trigger a
  // revising update, not a wholesale page delete. Pin the distinctive reconcile prose.
  expect(prompt).toContain("reconcile the wiki");
  expect(prompt).toContain("synthesis distilled from");
  expect(prompt).toContain("propose an update instead");
  expect(prompt).toContain("Prefer revising over deleting");
});

test("lint prompt separates wiki pages with a blank line", () => {
  const prompt = buildLintPrompt({
    index: "# Index",
    log: "# Log",
    wikiPages: [
      { path: "wiki/a.md", content: "A" },
      { path: "wiki/b.md", content: "B" }
    ]
  });
  expect(prompt).toContain("A\n\n---");
});

test("chat system prompt asks for cited, non-JSON answers grounded in the wiki", () => {
  const prompt = buildChatSystemPrompt();
  expect(prompt).toContain("Cite the wiki pages");
  expect(prompt).toContain("never JSON");
  expect(prompt).not.toContain("Return only JSON");
});

test("chat system prompt localizes the output-language instruction", () => {
  __setLanguage("zh");
  const prompt = buildChatSystemPrompt();
  expect(prompt).toContain("Write user-visible natural-language output in Simplified Chinese.");
});

test("chat context message includes the index and pages but not the log", () => {
  const message = buildChatContextMessage({
    index: "# Index",
    wikiPages: [{ path: "wiki/a.md", content: "alpha body" }]
  });
  expect(message).toContain("# Index");
  expect(message).toContain("wiki/a.md");
  expect(message).toContain("alpha body");
  expect(message).not.toContain("Current log:");
});

test("query prompt files a supplied answer verbatim while keeping the JSON contract", () => {
  const prompt = buildQueryPrompt({
    index: "# Index",
    log: "# Log",
    question: "What is X?",
    answer: "X is the answer, see wiki/x.md",
    wikiPages: []
  });
  expect(prompt).toContain("Answer to file:");
  expect(prompt).toContain("X is the answer, see wiki/x.md");
  expect(prompt).toContain("Return only JSON");
});

test("query selection prompt lists page paths and asks for a JSON array", () => {
  const prompt = buildQuerySelectionPrompt({
    index: "# Index",
    question: "What is X?",
    pagePaths: ["wiki/x.md", "wiki/y.md"]
  });
  expect(prompt).toContain("What is X?");
  expect(prompt).toContain("wiki/x.md");
  expect(prompt).toContain("wiki/y.md");
  expect(prompt).toContain("JSON array");
});

test("parseSelectedQueryPages keeps only known paths and caps the count", () => {
  const selected = parseSelectedQueryPages(
    '["wiki/a.md","wiki/b.md","wiki/ghost.md","wiki/c.md"]',
    ["wiki/a.md", "wiki/b.md", "wiki/c.md", "wiki/d.md"],
    2
  );
  expect(selected).toEqual(["wiki/a.md", "wiki/b.md"]);
});

test("parseSelectedQueryPages parses fenced JSON", () => {
  const selected = parseSelectedQueryPages("```json\n[\"wiki/a.md\"]\n```", ["wiki/a.md", "wiki/b.md"], 5);
  expect(selected).toEqual(["wiki/a.md"]);
});

test("parseSelectedQueryPages tolerates a bracket in trailing prose", () => {
  const selected = parseSelectedQueryPages('["wiki/a.md"] see also [notes]', ["wiki/a.md", "wiki/b.md"], 5);
  expect(selected).toEqual(["wiki/a.md"]);
});

test("parseSelectedQueryPages extracts an array wrapped in an object", () => {
  const selected = parseSelectedQueryPages('{"pages":["wiki/a.md"]}', ["wiki/a.md", "wiki/b.md"], 5);
  expect(selected).toEqual(["wiki/a.md"]);
});

test("parseSelectedQueryPages falls back to the first pages when the response is unusable", () => {
  const selected = parseSelectedQueryPages("all pages are relevant", ["wiki/a.md", "wiki/b.md", "wiki/c.md"], 2);
  expect(selected).toEqual(["wiki/a.md", "wiki/b.md"]);
});

test("prompt contract uses configured wiki paths", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    rawFolder: "sources",
    wikiFolder: "knowledge",
    assetsFolder: "sources/assets",
    indexPath: "knowledge/home.md",
    logPath: "knowledge/timeline.md"
  };
  const prompt = buildIngestPrompt(
    { index: "# Index", log: "# Log", sourcePath: "sources/a.md", sourceContent: "hello" },
    settings
  );
  expect(prompt).toContain("knowledge/example.md");
  expect(prompt).toContain("knowledge/home.md");
  expect(prompt).toContain("knowledge/timeline.md");
  expect(prompt).toContain("sources");
  expect(prompt).not.toContain("wiki/index.md");
  expect(prompt).not.toContain("wiki/log.md");
});
