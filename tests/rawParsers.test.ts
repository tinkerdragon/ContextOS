import * as obsidian from "obsidian";
import { getRawParser, isSupportedRawPath, readRawFileWithParser } from "../src/rawParsers";

const supportedExtensions = [
  ".md",
  ".txt",
  ".csv",
  ".tsv",
  ".json",
  ".yaml",
  ".yml",
  ".log",
  ".ts",
  ".js",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".cpp",
  ".sql",
  ".sh",
  ".rtf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif"
];

test.each(supportedExtensions)("supports raw text/code extension %s", (extension) => {
  const path = `raw/example${extension}`;

  expect(isSupportedRawPath(path)).toBe(true);
  expect(getRawParser(path)?.supports(path)).toBe(true);
});

test("does not support executable raw files", () => {
  expect(isSupportedRawPath("raw/tool.exe")).toBe(false);
  expect(getRawParser("raw/tool.exe")).toBeUndefined();
});

test.each([
  ["raw/notes.txt", "plain text\nwith trailing spaces  "],
  ["raw/source.ts", "export const answer = 42;\n\n"],
  ["raw/config.yaml", "name: raw parser\nitems:\n  - exact\n"]
])("reads %s through app.vault.read and preserves content exactly", async (path, content) => {
  const file = { path };
  const read = jest.fn(async () => content);
  const app = { vault: { read } };

  await expect(readRawFileWithParser(app as never, file as never, {})).resolves.toBe(content);
  expect(read).toHaveBeenCalledTimes(1);
  expect(read).toHaveBeenCalledWith(file);
});

test("reads PDFs through app.vault.readBinary and extracts text with PDF.js", async () => {
  jest.spyOn(obsidian, "loadPdfJs").mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "PDF" }, { str: "text" }] })
        })
      })
    })
  });
  const file = { path: "raw/a.pdf" };
  const readBinary = jest.fn(async () => new ArrayBuffer(4));
  const app = { vault: { readBinary } };

  await expect(readRawFileWithParser(app as never, file as never, {})).resolves.toBe("PDF text");
  expect(readBinary).toHaveBeenCalledTimes(1);
  expect(readBinary).toHaveBeenCalledWith(file);
});

test("calls onPdfExtract for PDFs", async () => {
  jest.spyOn(obsidian, "loadPdfJs").mockResolvedValue({
    getDocument: () => ({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: "PDF" }, { str: "text" }] })
        })
      })
    })
  });
  const file = { path: "raw/a.pdf" };
  const app = { vault: { readBinary: jest.fn(async () => new ArrayBuffer(4)) } };
  const onPdfExtract = jest.fn();

  await readRawFileWithParser(app as never, file as never, { onPdfExtract });

  expect(onPdfExtract).toHaveBeenCalledTimes(1);
  expect(onPdfExtract).toHaveBeenCalledWith("raw/a.pdf");
});

test("extracts readable HTML text without scripts and styles", async () => {
  const html = `<!doctype html>
<html>
<head><title>Saved Page</title><style>.hidden{}</style><script>bad()</script></head>
<body><h1>Title</h1><p>Hello&nbsp;world</p><noscript>noscript text</noscript></body>
</html>`;
  const htmlApp = { vault: { read: async () => html } };

  await expect(readRawFileWithParser(htmlApp as never, { path: "raw/page.html" } as never, {}))
    .resolves.toBe("# Saved Page\n\nTitle\nHello world");
});

test("excludes malformed unclosed HTML hidden block content", async () => {
  const html = "<html><body>Visible<script>bad()";
  const htmlApp = { vault: { read: async () => html } };

  await expect(readRawFileWithParser(htmlApp as never, { path: "raw/page.html" } as never, {}))
    .resolves.toBe("Visible");
});

test("extracts image text through the OCR provider", async () => {
  const file = { path: "raw/screenshot.png" };
  const readBinary = jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer);
  const app = { vault: { readBinary } };
  const imageOcrProvider = jest.fn(async () => "Image text");

  await expect(readRawFileWithParser(app as never, file as never, { imageOcrProvider })).resolves.toBe("Image text");

  expect(readBinary).toHaveBeenCalledTimes(1);
  expect(readBinary).toHaveBeenCalledWith(file);
  expect(imageOcrProvider).toHaveBeenCalledTimes(1);
  expect(imageOcrProvider).toHaveBeenCalledWith({ path: "raw/screenshot.png", imageDataUrl: "data:image/png;base64,AQID" });
});

test("wraps parser failures with raw file path context", async () => {
  const file = { path: "raw/screenshot.png" };
  const app = { vault: { readBinary: jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer) } };
  const imageOcrProvider = jest.fn(async () => {
    throw new Error("OCR down");
  });

  await expect(readRawFileWithParser(app as never, file as never, { imageOcrProvider }))
    .rejects.toThrow("Failed to parse raw file raw/screenshot.png: OCR down");
});

test("reports image OCR output that is empty after trimming", async () => {
  const file = { path: "raw/screenshot.png" };
  const app = { vault: { readBinary: jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer) } };
  const imageOcrProvider = jest.fn(async () => " \n\t ");

  await expect(readRawFileWithParser(app as never, file as never, { imageOcrProvider }))
    .rejects.toThrow("Failed to parse raw file raw/screenshot.png: No text found in image: raw/screenshot.png");
});

test("encodes image data URLs without relying on Node Buffer", async () => {
  const originalBuffer = (globalThis as unknown as { Buffer?: unknown }).Buffer;
  (globalThis as unknown as { Buffer?: unknown }).Buffer = undefined;
  try {
    const file = { path: "raw/screenshot.png" };
    const app = { vault: { readBinary: jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer) } };
    const imageOcrProvider = jest.fn(async () => "Image text");

    await expect(readRawFileWithParser(app as never, file as never, { imageOcrProvider })).resolves.toBe("Image text");

    expect(imageOcrProvider).toHaveBeenCalledWith({ path: "raw/screenshot.png", imageDataUrl: "data:image/png;base64,AQID" });
  } finally {
    (globalThis as unknown as { Buffer?: unknown }).Buffer = originalBuffer;
  }
});

test("extracts GIF text through the OCR provider", async () => {
  const file = { path: "raw/animation.gif" };
  const app = { vault: { readBinary: jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer) } };
  const imageOcrProvider = jest.fn(async () => "GIF text");

  await expect(readRawFileWithParser(app as never, file as never, { imageOcrProvider })).resolves.toBe("GIF text");

  expect(imageOcrProvider).toHaveBeenCalledWith({ path: "raw/animation.gif", imageDataUrl: "data:image/gif;base64,AQID" });
});

test("reports image files without an OCR provider", async () => {
  const file = { path: "raw/screenshot.png" };
  const app = { vault: { readBinary: jest.fn(async () => Uint8Array.from([1, 2, 3]).buffer) } };

  await expect(readRawFileWithParser(app as never, file as never, {}))
    .rejects.toThrow("Failed to parse raw file raw/screenshot.png: Image OCR provider is not configured: raw/screenshot.png");
});
