import * as obsidian from "obsidian";
import { __setLanguage } from "./obsidianMock";
import LLMWikiPlugin from "../src/main";

const notices = (obsidian.Notice as unknown as { messages: string[] }).messages;
const modals = (obsidian.Modal as unknown as { instances: unknown[] }).instances;

beforeEach(() => {
  notices.length = 0;
  modals.length = 0;
  __setLanguage("en");
  jest.restoreAllMocks();
});

test("lint feeds the current raw inventory into the prompt so orphans can be detected", async () => {
  const contentByPath = new Map<string, string>([
    ["wiki/topic.md", "# Topic"],
    ["wiki/index.md", "# Index"],
    ["wiki/log.md", "# Log"]
  ]);
  const TFileMock = obsidian.TFile as unknown as { new(path: string): obsidian.TFile };
  const requestSpy = jest.spyOn(obsidian, "requestUrl").mockResolvedValue({
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "clean", operations: [] }) } }] })
  } as never);

  const plugin = new (LLMWikiPlugin as unknown as { new(): LLMWikiPlugin })();
  jest.spyOn(plugin, "loadData").mockResolvedValue({ openAIApiKey: "key" });
  jest.spyOn(plugin, "saveData").mockResolvedValue();
  plugin.app = {
    vault: {
      getMarkdownFiles: () => [{ path: "wiki/topic.md" }, { path: "wiki/index.md" }, { path: "wiki/log.md" }],
      getFiles: () => [{ path: "raw/kept.md" }, { path: "wiki/topic.md" }],
      getAbstractFileByPath: (path: string) => (contentByPath.has(path) ? new TFileMock(path) : null),
      read: async (file: { path: string }) => contentByPath.get(file.path) ?? "",
      create: async () => undefined,
      modify: async () => undefined,
      createFolder: async () => undefined,
      delete: async () => undefined
    }
  } as never;

  await plugin.onload();
  await (plugin as unknown as { lintWiki(): Promise<void> }).lintWiki();

  const lintPrompt = JSON.parse(String((requestSpy.mock.calls[0][0] as { body: string }).body)).messages[1].content;
  expect(lintPrompt).toContain("Current raw sources");
  expect(lintPrompt).toContain("raw/kept.md");
  // Only raw-folder sources are listed. Isolate the raw-sources section and assert no wiki page
  // path leaks into it, regardless of position within the list.
  const rawSection = lintPrompt.slice(
    lintPrompt.indexOf("Current raw sources"),
    lintPrompt.indexOf("Wiki pages:")
  );
  expect(rawSection).toContain("raw/kept.md");
  expect(rawSection).not.toContain("wiki/");
});
