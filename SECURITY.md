# Security

This plugin requires several system-level capabilities to function. Each is explicitly documented below with its justification.

## File system access (`fs`)

The plugin reads raw source files (PDF, Office documents, images, plain text) from the user-configured raw folder for conversion into wiki notes. File writes are restricted to the user-configured wiki folder. No files outside the vault are accessed.

## Shell execution (`child_process`)

Used indirectly by bundled document parsers. The plugin does not execute arbitrary shell commands. The only direct usage is for optional git integration (commit, push) and SSH key generation, all triggered by explicit user action in settings.

## Vault enumeration

The plugin scans the vault for raw files, wiki pages, and embedding data. This is essential for detecting file changes, selecting relevant wiki context for queries, and maintaining the embeddings index.

## Clipboard access

Clipboard access is limited to the chat view's copy button, which writes assistant responses to the clipboard only on explicit user click. The plugin never reads from the clipboard.

## Local storage

The plugin reads `localStorage.getItem("language")` for i18n language detection on Obsidian versions below 1.8.7, where `app.vault.getLanguage()` is not available. No other localStorage keys are accessed. The declared `minAppVersion` is 1.7.2.

## Dynamic code execution

The plugin source does not use `eval()` or `new Function()`. A `setImmediate` shim is included for bundled dependency compatibility (`src/shims/safeSetImmediate.js`) but does not execute arbitrary code.
