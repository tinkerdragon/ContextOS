import * as obsidian from "obsidian";
import { QuestionInputModal } from "../src/queryModal";
import { __setLanguage } from "./obsidianMock";

type ModalContent = {
  textInputs: Array<{ onchange?: (value: string) => Promise<void>; inputEl: { trigger(event: string, arg: unknown): void } }>;
  buttons: Array<{ onclick?: () => void | Promise<void> }>;
};

beforeEach(() => {
  __setLanguage("en");
  (obsidian.Modal as unknown as { instances: unknown[] }).instances.length = 0;
});

test("resolves with the trimmed question when submitted", async () => {
  const result = await new Promise<string | null>((resolve) => {
    const modal = new QuestionInputModal({} as never, resolve);
    modal.open();
    const content = modal.contentEl as unknown as ModalContent;
    void content.textInputs[0].onchange!("  hello world  ");
    void content.buttons[0].onclick!();
  });
  expect(result).toBe("hello world");
});

test("resolves null when submitted with an empty question", async () => {
  const result = await new Promise<string | null>((resolve) => {
    const modal = new QuestionInputModal({} as never, resolve);
    modal.open();
    const content = modal.contentEl as unknown as ModalContent;
    void content.buttons[0].onclick!();
  });
  expect(result).toBeNull();
});

test("resolves null when the question is only whitespace", async () => {
  const result = await new Promise<string | null>((resolve) => {
    const modal = new QuestionInputModal({} as never, resolve);
    modal.open();
    const content = modal.contentEl as unknown as ModalContent;
    void content.textInputs[0].onchange!("   ");
    void content.buttons[0].onclick!();
  });
  expect(result).toBeNull();
});

test("submits the question when Enter is pressed", async () => {
  const result = await new Promise<string | null>((resolve) => {
    const modal = new QuestionInputModal({} as never, resolve);
    modal.open();
    const content = modal.contentEl as unknown as ModalContent;
    void content.textInputs[0].onchange!("via enter");
    content.textInputs[0].inputEl.trigger("keydown", { key: "Enter", preventDefault: () => undefined });
  });
  expect(result).toBe("via enter");
});

test("resolves null when dismissed without submitting", async () => {
  const result = await new Promise<string | null>((resolve) => {
    const modal = new QuestionInputModal({} as never, resolve);
    modal.open();
    (modal as unknown as { onClose(): void }).onClose();
  });
  expect(result).toBeNull();
});
