import * as obsidian from "obsidian";
import { __setLanguage } from "./obsidianMock";
import LLMWikiPlugin from "../src/main";
import { hashContent } from "../src/rawTracker";

const notices = (obsidian.Notice as unknown as { messages: string[] }).messages;

beforeEach(() => {
  notices.length = 0;
  __setLanguage("en");
  jest.restoreAllMocks();
});

function newPlugin(): LLMWikiPlugin {
  return new (LLMWikiPlugin as unknown as { new(): LLMWikiPlugin })();
}

test("enabling auto ingest registers a polling interval", async () => {
  const plugin = newPlugin();
  jest.spyOn(plugin, "loadData").mockResolvedValue({ openAIApiKey: "key", autoIngestEnabled: true });
  jest.spyOn(plugin, "saveData").mockResolvedValue();
  plugin.app = { vault: { on: jest.fn(() => "ref") } } as never;

  await plugin.onload();

  expect((plugin as unknown as { registeredIntervals: unknown[] }).registeredIntervals.length).toBe(1);
});

test("polling stays silent when there are no raw changes", async () => {
  const TFileMock = obsidian.TFile as unknown as { new(path: string): obsidian.TFile };
  const plugin = newPlugin();
  jest.spyOn(plugin, "loadData").mockResolvedValue({ openAIApiKey: "key", rawFileState: { "raw/a.md": hashContent("hello") } });
  jest.spyOn(plugin, "saveData").mockResolvedValue();
  const requestSpy = jest.spyOn(obsidian, "requestUrl");
  plugin.app = {
    vault: {
      getFiles: () => [{ path: "raw/a.md" }],
      getAbstractFileByPath: (path: string) => (path === "raw/a.md" ? new TFileMock(path) : null),
      read: async () => "hello",
      on: jest.fn(() => "ref")
    }
  } as never;

  await plugin.onload();
  await (plugin as unknown as { runAutoIngest(quiet: boolean): Promise<void> }).runAutoIngest(true);

  expect(requestSpy).not.toHaveBeenCalled();
  expect(notices).toEqual([]);
});

test("a create event for a new raw markdown file triggers ingest after the debounce", async () => {
  const TFileMock = obsidian.TFile as unknown as { new(path: string): obsidian.TFile };
  const stored = new Map<string, string>([["wiki/index.md", "# Index"], ["wiki/log.md", "# Log"]]);
  const created = new Map<string, string>();
  const handlers: Record<string, (file: unknown) => void> = {};
  const plugin = newPlugin();
  jest.spyOn(plugin, "loadData").mockResolvedValue({ openAIApiKey: "key", autoIngestEnabled: true, rawFileState: {} });
  jest.spyOn(plugin, "saveData").mockResolvedValue();
  const requestSpy = jest.spyOn(obsidian, "requestUrl").mockResolvedValue({
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      summary: "s",
      operations: [{ kind: "create", path: "wiki/new.md", content: "# New", rationale: "r" }]
    }) } }] })
  } as never);
  const newFile = new TFileMock("raw/note.md");
  plugin.app = {
    vault: {
      on: (event: string, cb: (file: unknown) => void) => { handlers[event] = cb; return "ref"; },
      getFiles: () => [newFile],
      getAbstractFileByPath: (path: string) => (stored.has(path) || created.has(path) ? new TFileMock(path) : null),
      read: async (file: { path: string }) => (file.path === "raw/note.md" ? "hello" : stored.get(file.path) ?? created.get(file.path) ?? ""),
      create: async (path: string, content: string) => { created.set(path, content); },
      modify: async () => undefined,
      createFolder: async () => undefined,
      delete: async () => undefined
    }
  } as never;

  await plugin.onload();
  // Shorten the debounce so the scheduled timer fires promptly, then simulate Obsidian's event.
  plugin.settings = { ...plugin.settings, autoIngestDebounceMs: 0 };
  expect(typeof handlers.create).toBe("function");
  handlers.create(newFile);
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(requestSpy).toHaveBeenCalledTimes(1);
  expect(created.get("wiki/new.md")).toBe("# New");
});

test("polling ingests a file that appears in the vault list without a file event", async () => {
  const TFileMock = obsidian.TFile as unknown as { new(path: string): obsidian.TFile };
  const stored = new Map<string, string>([["raw/new.md", "hello"], ["wiki/index.md", "# Index"], ["wiki/log.md", "# Log"]]);
  const created = new Map<string, string>();
  const plugin = newPlugin();
  jest.spyOn(plugin, "loadData").mockResolvedValue({ openAIApiKey: "key", rawFileState: {} });
  jest.spyOn(plugin, "saveData").mockResolvedValue();
  const requestSpy = jest.spyOn(obsidian, "requestUrl").mockResolvedValue({
    status: 200,
    text: JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      summary: "s",
      operations: [{ kind: "create", path: "wiki/new.md", content: "# New", rationale: "r" }]
    }) } }] })
  } as never);
  plugin.app = {
    vault: {
      getFiles: () => [{ path: "raw/new.md" }],
      getAbstractFileByPath: (path: string) => (stored.has(path) || created.has(path) ? new TFileMock(path) : null),
      read: async (file: { path: string }) => stored.get(file.path) ?? created.get(file.path) ?? "",
      create: async (path: string, content: string) => { created.set(path, content); },
      modify: async () => undefined,
      createFolder: async () => undefined,
      delete: async () => undefined,
      on: jest.fn(() => "ref")
    }
  } as never;

  await plugin.onload();
  await (plugin as unknown as { runAutoIngest(quiet: boolean): Promise<void> }).runAutoIngest(true);

  expect(requestSpy).toHaveBeenCalledTimes(1);
  expect(created.get("wiki/new.md")).toBe("# New");
});
