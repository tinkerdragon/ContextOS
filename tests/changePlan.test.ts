import { parseChangePlan, validateChangePlan } from "../src/changePlan";
import { DEFAULT_SETTINGS } from "../src/settings";
import { __setLanguage } from "./obsidianMock";

beforeEach(() => {
  __setLanguage("en");
});

test("parses fenced json change plans", () => {
  const plan = parseChangePlan("```json\n{\"summary\":\"ok\",\"operations\":[]}\n```");
  expect(plan.summary).toBe("ok");
  expect(plan.operations).toEqual([]);
});

test("parses a change plan wrapped in surrounding prose", () => {
  const plan = parseChangePlan("Sure! Here is the plan:\n{\"summary\":\"ok\",\"operations\":[]}\nHope that helps.");
  expect(plan.summary).toBe("ok");
  expect(plan.operations).toEqual([]);
});

test("parses a change plan when the surrounding prose contains braces", () => {
  const plan = parseChangePlan("Use the {placeholder} syntax.\n{\"summary\":\"ok\",\"operations\":[]}\nThanks {again}");
  expect(plan.summary).toBe("ok");
  expect(plan.operations).toEqual([]);
});

test("parses a change plan whose content contains nested braces", () => {
  const plan = parseChangePlan("prefix {x} {\"summary\":\"ok\",\"operations\":[{\"kind\":\"create\",\"path\":\"wiki/a.md\",\"content\":\"# H\\n{ nested }\",\"rationale\":\"r\"}]} suffix");
  expect(plan.operations[0].content).toBe("# H\n{ nested }");
});

test("parses a fenced change plan with surrounding prose", () => {
  const plan = parseChangePlan("Here you go:\n```json\n{\"summary\":\"ok\",\"operations\":[]}\n```\nDone.");
  expect(plan.summary).toBe("ok");
});

test("selects the real plan over a preceding example object or restated schema", () => {
  const real = "{\"summary\":\"real\",\"operations\":[{\"kind\":\"create\",\"path\":\"wiki/a.md\",\"content\":\"x\",\"rationale\":\"r\"}]}";
  // A model that shows an empty example, or restates the multi-operation schema template, before
  // emitting its real answer: the last valid top-level object wins (not first, not largest).
  const example = "{\"summary\":\"example\",\"operations\":[]}";
  const schemaTemplate = "{\"summary\":\"short human-readable summary\",\"operations\":[{\"kind\":\"create\",\"path\":\"wiki/example.md\",\"content\":\"markdown\",\"rationale\":\"why\"},{\"kind\":\"update\",\"path\":\"wiki/index.md\",\"content\":\"md\",\"rationale\":\"why\"}]}";
  const afterExample = parseChangePlan(`Example: ${example}\nReal plan:\n${real}`);
  expect(afterExample.summary).toBe("real");
  expect(afterExample.operations).toHaveLength(1);
  const afterSchema = parseChangePlan(`Schema: ${schemaTemplate}\nMy plan:\n${real}`);
  expect(afterSchema.summary).toBe("real");
  expect(afterSchema.operations).toHaveLength(1);
});

test("parses and validates a delete operation without content", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "remove orphan",
    operations: [{ kind: "delete", path: "wiki/orphan.md", rationale: "no supporting source" }]
  }));
  expect(plan.operations[0]).toEqual({ kind: "delete", path: "wiki/orphan.md", content: "", rationale: "no supporting source" });
  expect(validateChangePlan(plan, DEFAULT_SETTINGS)).toEqual(plan);
});

test("rejects deleting the configured index or log file", () => {
  const indexPlan = parseChangePlan(JSON.stringify({ summary: "x", operations: [{ kind: "delete", path: "wiki/index.md", rationale: "r" }] }));
  expect(() => validateChangePlan(indexPlan, DEFAULT_SETTINGS)).toThrow("Cannot delete the index or log file");
  const logPlan = parseChangePlan(JSON.stringify({ summary: "x", operations: [{ kind: "delete", path: "wiki/log.md", rationale: "r" }] }));
  expect(() => validateChangePlan(logPlan, DEFAULT_SETTINGS)).toThrow("Cannot delete the index or log file");
});

test("rejects deleting outside the wiki folder", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "delete", path: "raw/source.md", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, DEFAULT_SETTINGS)).toThrow("outside wiki folder");
});

test("rejects null change plans with localized shape error", () => {
  expect(() => parseChangePlan("null")).toThrow("Invalid change plan shape");
});

test("rejects null operations with localized operation kind error", () => {
  expect(() => parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [null]
  }))).toThrow("Invalid operation kind");
});

test("rejects writes outside wiki folder", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "update", path: "raw/source.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, DEFAULT_SETTINGS)).toThrow("outside wiki folder");
});

test("localizes writes outside wiki folder errors in Simplified Chinese", () => {
  __setLanguage("zh");
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "update", path: "raw/source.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, DEFAULT_SETTINGS)).toThrow("操作路径不在 wiki 文件夹中：raw/source.md");
});

test("accepts index and log paths", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "ok",
    operations: [
      { kind: "update", path: "wiki/index.md", content: "# Index", rationale: "refresh" },
      { kind: "append", path: "wiki/log.md", content: "entry", rationale: "record" }
    ]
  }));
  expect(validateChangePlan(plan, DEFAULT_SETTINGS)).toEqual(plan);
});

test("parses and validates prepend operations for newest-first logs", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "log latest change",
    operations: [
      { kind: "prepend", path: "wiki/log.md", content: "2026-06-03 latest", rationale: "record latest first" }
    ]
  }));

  expect(validateChangePlan(plan, DEFAULT_SETTINGS)).toEqual(plan);
});

test("rejects configured index path outside wiki folder", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "update", path: "raw/index.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, { ...DEFAULT_SETTINGS, indexPath: "raw/index.md" })).toThrow("Index path must be inside the wiki folder");
});

test("rejects configured log path outside wiki folder", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "append", path: "notes/log.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, { ...DEFAULT_SETTINGS, logPath: "notes/log.md" })).toThrow("Log path must be inside the wiki folder");
});

test("rejects writes inside configured raw folder even when nested under wiki", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "update", path: "wiki/raw/source.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, { ...DEFAULT_SETTINGS, rawFolder: "wiki/raw" })).toThrow("Operation path is inside a read-only folder");
});

test("rejects writes inside configured assets folder even when nested under wiki", () => {
  const plan = parseChangePlan(JSON.stringify({
    summary: "bad",
    operations: [{ kind: "update", path: "wiki/assets/image.md", content: "x", rationale: "bad" }]
  }));
  expect(() => validateChangePlan(plan, { ...DEFAULT_SETTINGS, assetsFolder: "wiki/assets" })).toThrow("Operation path is inside a read-only folder");
});
