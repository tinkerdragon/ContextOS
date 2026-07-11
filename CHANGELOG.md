# Changelog

## 0.4.0 (2026-07-11)

### Added
- **`max_tokens` per provider**: Configurable max output tokens on each provider entry. Sent with every completion request for gateways that require an explicit limit.
- **Deterministic link resolution**: Wikilinks in change plans are case-corrected before the preview modal. Unresolved links surface as warnings in the modal and console.
- **Deterministic lint**: Instant structural lint (broken links, missing frontmatter, orphans, dead index links, duplicate filenames, stale sources) runs before the AI lint call.
- **Source provenance**: Generated wiki pages include `sources` YAML frontmatter with raw file path, content hash, and ingest date for traceability.
- **Enhanced preview modal**: Update operations show a colored line-diff (`+`/`-`). Link resolution stats and unresolved-link warnings are displayed in the hero section.
- **Rollback/undo**: New `Undo last ContextOS change` command reverts the most recently applied change set. History is persisted in `.contextos/history/` (last 20 entries).

### Changed
- **Connection test**: Now sends a real completion ("ping"), verifies non-empty content, and returns structured diagnostics (status, finish_reason, content preview) instead of a simple pass/fail.
- **Git execution**: Replaced `child_process.exec` with `spawn` (argument arrays, no shell interpolation) for safer handling of remote URLs and commit messages.

### Fixed
- Better error messages on truncation (includes content length) and missing content (includes `finish_reason`).

## 0.3.0 (2026-07-10)

### Added
- **Git integration**: Auto-commit wiki changes to a local or remote (SSH) git repository after each change plan is applied. Supports manual SSH setup and auto-generated Ed25519 keypairs.
- **Git connection test**: Test connectivity to the configured git remote directly from settings, with auto-test on URL entry (debounced).
- **Git as standalone settings section**: Git settings moved out of Advanced into their own section.

### Fixed
- Git push now uses `origin HEAD` explicitly to avoid "No configured push destination" errors on fresh repos.
- GitHub API error handling improved to surface token permission guidance on 403/401 responses.

## 0.2.0 (2026-07-09)

### Added
- **Multi-provider routing**: Configure separate LLM providers for text operations (ingest/lint), chat, and vision (OCR). Supports OpenAI, Anthropic, Gemini, DeepSeek, Groq, Ollama, and OpenAI-compatible endpoints.
- **Streaming chat responses**: Replies stream token-by-token with a loading indicator, then re-render as full Markdown on completion.
- **Parallel OCR**: PDF pages needing vision OCR are processed concurrently (configurable concurrency, default 3).
- **Embeddings-based page selection**: Optional vector similarity search via Ollama, OpenAI, or Qdrant embeddings to replace LLM-based page selection for faster, cheaper queries on large wikis.
- **Collapsible provider settings**: Provider configuration cards expand/collapse for cleaner settings UI.
- **Custom prompt templates**: Override the system prompts for ingest, chat, and lint.
- **Per-operation provider routing bar**: Assign specific providers to text/chat/vision operations.
- **Auto git commit**: Optionally auto-commit wiki changes after each change plan is applied.
- **OCR page concurrency** and **request timeout** settings.
