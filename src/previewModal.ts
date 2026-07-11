import { App, Modal, Notice, TFile } from "obsidian";
import { t } from "./i18n";
import { ChangePlan, FileOperationKind } from "./types";
import { applyChangePlan } from "./vaultOps";
import { ResolvedLinks } from "./linkResolver";

export class ChangePlanPreviewModal extends Modal {
  constructor(
    app: App,
    private readonly plan: ChangePlan,
    private readonly updateStatus: (message: string) => void = () => undefined,
    private readonly onApplySuccess: () => Promise<void> = async () => undefined,
    private readonly resolvedLinks?: ResolvedLinks
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    this.modalEl.addClass("contextos-review-modal-shell");
    this.applyStyles(this.modalEl, {
      width: "min(1120px, 96vw)",
      "max-width": "1120px"
    });
    this.contentEl.empty();
    this.contentEl.addClass("contextos-review-modal");
    this.applyStyles(this.contentEl, {
      display: "flex",
      "flex-direction": "column",
      width: "100%",
      "max-height": "min(820px, 88vh)",
      overflow: "hidden"
    });

    const hero = this.contentEl.createDiv();
    hero.addClass("contextos-review-hero");
    this.applyStyles(hero, {
      padding: "28px 32px 22px",
      "border-bottom": "1px solid var(--background-modifier-border)"
    });
    hero.createEl("h2", { text: t("preview.title") });
    hero.createEl("p", { text: this.plan.summary || t("preview.noSummary") });

    const stats = hero.createDiv();
    stats.addClass("contextos-review-stats");
    this.addStatChip(stats, t("preview.proposedFileChanges", { count: this.plan.operations.length }));
    for (const [kind, count] of this.operationCounts()) {
      this.addStatChip(stats, t("preview.operationCount", {
        count,
        kind: this.getOperationLabel(kind).toLocaleLowerCase()
      }));
    }
    if (this.resolvedLinks && (this.resolvedLinks.resolved.length > 0 || this.resolvedLinks.unresolved.length > 0)) {
      this.addStatChip(stats, t("preview.linksResolved", {
        total: this.resolvedLinks.resolved.length + this.resolvedLinks.unresolved.length,
        resolved: this.resolvedLinks.resolved.length
      }));
    }

    if (this.resolvedLinks && this.resolvedLinks.unresolved.length > 0) {
      const warning = hero.createDiv();
      warning.addClass("contextos-warning-banner");
      this.applyStyles(warning, {
        margin: "12px 0 0",
        padding: "8px 12px",
        background: "var(--color-orange-100)",
        "border-radius": "8px",
        "font-size": "13px",
        color: "var(--text-warning)"
      });
      warning.setText(t("preview.unresolvedLinksWarning", { count: this.resolvedLinks.unresolved.length }));
    }

    const changes = this.contentEl.createDiv();
    changes.addClass("contextos-changes-list");
    this.applyStyles(changes, {
      display: "flex",
      "flex-direction": "column",
      gap: "16px",
      "min-height": "220px",
      "max-height": "min(58vh, 620px)",
      overflow: "auto",
      padding: "20px 32px"
    });

    if (this.plan.operations.length === 0) {
      const emptyState = changes.createDiv();
      emptyState.addClass("contextos-empty-state");
      emptyState.createEl("p", { text: t("preview.noFileChanges") });
    }

    for (const operation of this.plan.operations) {
      const section = changes.createDiv();
      section.addClass("contextos-operation-card");
      this.applyStyles(section, {
        padding: "18px",
        border: "1px solid var(--background-modifier-border)",
        "border-radius": "16px",
        background: "var(--background-primary)",
        "box-shadow": "0 8px 24px rgba(0, 0, 0, 0.08)"
      });

      const header = section.createDiv();
      header.addClass("contextos-operation-header");
      const badge = header.createSpan({ text: this.getOperationLabel(operation.kind) });
      badge.addClass("contextos-operation-badge");
      badge.addClass(`contextos-operation-${operation.kind}`);
      const path = header.createSpan({ text: operation.path });
      path.addClass("contextos-path-pill");

      section.createEl("p", { text: operation.rationale });
      if (operation.kind !== "delete") {
        let displayContent = operation.content;
        if (operation.kind === "update") {
          try {
            const existing = this.app.vault.getAbstractFileByPath(operation.path);
            if (existing instanceof TFile) {
              const current = await this.app.vault.read(existing);
              displayContent = this.computeDiff(current, operation.content);
            }
          } catch {
            // If we can't read the existing file, show the new content as-is
          }
        }
        const preview = section.createEl("pre");
        preview.addClass("contextos-code-preview");
        this.applyStyles(preview, {
          "max-height": "380px",
          overflow: "auto",
          padding: "16px",
          "border-radius": "12px",
          "white-space": "pre-wrap"
        });
        if (operation.kind === "update") {
          this.renderDiff(preview, displayContent);
        } else {
          preview.setText(displayContent);
        }
      }
    }

    const actions = this.contentEl.createDiv();
    actions.addClass("contextos-action-bar");
    this.applyStyles(actions, {
      position: "sticky",
      bottom: "0",
      display: "flex",
      "justify-content": "flex-end",
      gap: "12px",
      padding: "16px 32px",
      "border-top": "1px solid var(--background-modifier-border)",
      background: "var(--background-primary)"
    });
    const applyButton = actions.createEl("button", { text: t("preview.applyChanges") });
    applyButton.addClass("mod-cta");
    applyButton.onclick = async () => {
      applyButton.disabled = true;
      this.updateStatus(t("status.applyingChanges"));
      new Notice(t("status.applyingChanges"));
      try {
        await applyChangePlan(this.app, this.plan);
        await this.onApplySuccess();
        this.updateStatus(t("status.applied"));
        new Notice(t("notice.changesApplied"));
        this.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : t("error.unknown");
        applyButton.disabled = false;
        this.updateStatus(t("status.error", { message }));
        new Notice(t("notice.applyChangesFailed", { message }));
      }
    };
    const cancelButton = actions.createEl("button", { text: t("preview.cancel") });
    cancelButton.onclick = () => this.close();
  }

  private computeDiff(oldContent: string, newContent: string): string {
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    const lcs = this.longestCommonSubsequence(oldLines, newLines);

    const result: string[] = [];
    let oi = 0;
    let ni = 0;

    for (const line of lcs) {
      while (oi < oldLines.length && oldLines[oi] !== line) {
        result.push(`- ${oldLines[oi]}`);
        oi++;
      }
      while (ni < newLines.length && newLines[ni] !== line) {
        result.push(`+ ${newLines[ni]}`);
        ni++;
      }
      result.push(`  ${line}`);
      oi++;
      ni++;
    }

    while (oi < oldLines.length) {
      result.push(`- ${oldLines[oi]}`);
      oi++;
    }
    while (ni < newLines.length) {
      result.push(`+ ${newLines[ni]}`);
      ni++;
    }

    return result.join("\n");
  }

  private longestCommonSubsequence(a: string[], b: string[]): string[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const result: string[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        result.unshift(a[i - 1]);
        i--;
        j--;
      } else if (dp[i - 1][j] > dp[i][j - 1]) {
        i--;
      } else {
        j--;
      }
    }

    return result;
  }

  private renderDiff(preview: HTMLElement, diffContent: string): void {
    const lines = diffContent.split("\n");
    for (const line of lines) {
      const lineEl = preview.createDiv();
      if (line.startsWith("+ ")) {
        lineEl.setText(line);
        this.applyStyles(lineEl, { color: "var(--color-green)", background: "var(--color-green-100)" });
      } else if (line.startsWith("- ")) {
        lineEl.setText(line);
        this.applyStyles(lineEl, { color: "var(--color-red)", background: "var(--color-red-100)" });
      } else {
        lineEl.setText(line);
        this.applyStyles(lineEl, { opacity: "0.7" });
      }
    }
  }

  private applyStyles(element: HTMLElement, styles: Record<string, string>): void {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value);
    }
  }

  private addStatChip(container: HTMLElement, text: string): void {
    const chip = container.createSpan({ text });
    chip.addClass("contextos-stat-chip");
  }

  private operationCounts(): Array<[FileOperationKind, number]> {
    const counts = new Map<FileOperationKind, number>();
    for (const operation of this.plan.operations) {
      counts.set(operation.kind, (counts.get(operation.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }

  private getOperationLabel(kind: FileOperationKind): string {
    return t(`operation.${kind}`);
  }
}
