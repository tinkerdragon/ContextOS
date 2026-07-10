import { App, Modal, Setting } from "obsidian";
import { t } from "./i18n";

// Obsidian runs in Electron, where window.prompt() is not implemented (it returns null), so the
// query command must collect its question through a Modal instead. Resolves with the trimmed
// question, or null if the modal is dismissed or the input is empty.
export class QuestionInputModal extends Modal {
  private value = "";
  private settled = false;

  constructor(app: App, private readonly onResult: (question: string | null) => void) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h3", { text: t("prompt.queryQuestion") });
    new Setting(this.contentEl).addText((text) => {
      text.onChange((value) => { this.value = value; });
      const inputEl = text.inputEl;
      inputEl.addEventListener?.("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.settle(this.value);
        }
      });
      window.setTimeout(() => inputEl.focus?.(), 0);
    });
    new Setting(this.contentEl).addButton((button) => {
      button.setButtonText(t("prompt.querySubmit"));
      button.setCta?.();
      button.onClick(() => this.settle(this.value));
    });
  }

  onClose(): void {
    this.contentEl.empty();
    // Dismissed without submitting.
    this.settle(null);
  }

  private settle(question: string | null): void {
    if (this.settled) return;
    this.settled = true;
    // A submit action closes the modal (which re-enters onClose, guarded by `settled`); a null
    // result comes from onClose itself, so do not recursively close there.
    if (question !== null) this.close();
    const trimmed = question === null ? "" : question.trim();
    this.onResult(trimmed.length > 0 ? trimmed : null);
  }
}
