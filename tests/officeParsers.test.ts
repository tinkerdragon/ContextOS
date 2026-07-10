jest.mock("mammoth", () => ({
  extractRawText: jest.fn(async () => ({ value: "  Docx text\n" }))
}));

jest.mock("word-extractor", () => {
  const mockWordExtractor = jest.fn().mockImplementation(() => ({
    extract: jest.fn(async (buffer: Buffer) => ({
      getBody: () => "  Legacy DOC text\n"
    }))
  }));
  (mockWordExtractor as any).default = mockWordExtractor;
  return mockWordExtractor;
});

jest.mock("@e965/xlsx", () => ({
  read: jest.fn(() => ({
    SheetNames: ["Sheet1", "Data"],
    Sheets: {
      Sheet1: { name: "Sheet1" },
      Data: { name: "Data" }
    }
  })),
  utils: {
    sheet_to_json: jest.fn((sheet: { name: string }, options: unknown) => {
      expect(options).toEqual({ header: 1, blankrows: false });
      return sheet.name === "Sheet1"
        ? [["A", "B"], ["1", "2"]]
        : [["Name"], ["Alice"]];
    })
  }
}));

jest.mock("jszip", () => ({
  loadAsync: jest.fn(async () => ({
    files: {
      "ppt/slides/slide1.xml": { async: async () => "<p:sld><a:t>Title</a:t><a:t>Body</a:t></p:sld>" },
      "ppt/slides/slide2.xml": { async: async () => "<p:sld><a:t>Second</a:t></p:sld>" },
      "ppt/notesSlides/notesSlide1.xml": { async: async () => "<a:t>Ignored notes</a:t>" }
    }
  }))
}));

jest.mock("ppt-to-text", () => ({
  extractText: jest.fn(() => [
    "  Legacy PPT title  ",
    "Legacy PPT body"
  ].join("\n\n"))
}));

import { readRawFileWithParser } from "../src/rawParsers";
import * as mammoth from "mammoth";
import WordExtractor from "word-extractor";
import * as XLSX from "@e965/xlsx";
import * as JSZip from "jszip";
import * as PPT from "ppt-to-text";

test("extracts DOCX text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/file.docx" } as never, {})).resolves.toBe("Docx text");

  expect((mammoth.extractRawText as jest.Mock).mock.calls[0][0]).toEqual({ arrayBuffer: buffer });
});

test("reports DOCX output that is empty after trimming", async () => {
  (mammoth.extractRawText as jest.Mock).mockResolvedValueOnce({ value: " \n\t " });
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/file.docx" } as never, {}))
    .rejects.toThrow("Failed to parse raw file raw/file.docx: No extractable text found in Office file: raw/file.docx");
});

test("extracts legacy DOC text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/file.doc" } as never, {})).resolves.toBe("Legacy DOC text");

  const extractor = (WordExtractor as unknown as jest.Mock).mock.results[0].value;
  const extractInput = extractor.extract.mock.calls[0][0];
  expect(Buffer.isBuffer(extractInput)).toBe(true);
  expect([...extractInput]).toEqual([1, 2, 3]);
});

test("extracts XLSX sheets as tab-separated text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/book.xlsx" } as never, {})).resolves.toBe([
    "# Sheet: Sheet1",
    "A\tB",
    "1\t2",
    "",
    "# Sheet: Data",
    "Name",
    "Alice"
  ].join("\n"));

  expect(XLSX.read).toHaveBeenCalledWith(new Uint8Array(buffer), { type: "array" });
});

test("extracts legacy XLS sheets as tab-separated text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/book.xls" } as never, {})).resolves.toBe([
    "# Sheet: Sheet1",
    "A\tB",
    "1\t2",
    "",
    "# Sheet: Data",
    "Name",
    "Alice"
  ].join("\n"));

  expect(XLSX.read).toHaveBeenCalledWith(new Uint8Array(buffer), { type: "array" });
});

test("extracts RTF text", async () => {
  const app = { vault: { read: async () => "{\\rtf1\\ansi Plain \\b bold\\b0 \\par Unicode \\u20320?}" } };

  await expect(readRawFileWithParser(app as never, { path: "raw/note.rtf" } as never, {}))
    .resolves.toBe("Plain bold\nUnicode 你");
});

test("skips RTF unicode fallback characters", async () => {
  const app = { vault: { read: async () => "{\\rtf1\\ansi Dash \\u8212- Quote \\u8217'}" } };

  await expect(readRawFileWithParser(app as never, { path: "raw/note.rtf" } as never, {}))
    .resolves.toBe("Dash — Quote ’");
});

test("skips RTF non-text destination groups", async () => {
  const app = { vault: { read: async () => "{\\rtf1{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red255\\green0\\blue0;}{\\*\\generator Word;}{\\pict\\pngblip abcdef}Visible}" } };

  await expect(readRawFileWithParser(app as never, { path: "raw/note.rtf" } as never, {}))
    .resolves.toBe("Visible");
});

test("extracts legacy PPT text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/deck.ppt" } as never, {})).resolves.toBe([
    "# Slide 1",
    "Legacy PPT title",
    "",
    "# Slide 2",
    "Legacy PPT body"
  ].join("\n"));

  expect(PPT.extractText).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), { separator: "\n\n" });
});

test("extracts PPTX slide text", async () => {
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/deck.pptx" } as never, {})).resolves.toBe([
    "# Slide 1",
    "Title",
    "Body",
    "",
    "# Slide 2",
    "Second"
  ].join("\n"));
});

test("uses PPTX presentation relationships for slide order", async () => {
  (JSZip.loadAsync as jest.Mock).mockResolvedValueOnce({
    files: {
      "ppt/presentation.xml": {
        async: async () => [
          "<p:presentation>",
          "<p:sldIdLst>",
          "<p:sldId r:id=\"rId2\"/>",
          "<p:sldId r:id=\"rId1\"/>",
          "</p:sldIdLst>",
          "</p:presentation>"
        ].join("")
      },
      "ppt/_rels/presentation.xml.rels": {
        async: async () => [
          "<Relationships>",
          "<Relationship Id=\"rId1\" Target=\"slides/slide1.xml\"/>",
          "<Relationship Id=\"rId2\" Target=\"slides/slide2.xml\"/>",
          "</Relationships>"
        ].join("")
      },
      "ppt/slides/slide1.xml": { async: async () => "<p:sld><a:t>Filename slide 1</a:t></p:sld>" },
      "ppt/slides/slide2.xml": { async: async () => "<p:sld><a:t>Filename slide 2</a:t></p:sld>" }
    }
  });
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };

  await expect(readRawFileWithParser(app as never, { path: "raw/deck.pptx" } as never, {})).resolves.toBe([
    "# Slide 1",
    "Filename slide 2",
    "",
    "# Slide 2",
    "Filename slide 1"
  ].join("\n"));
});

test("OCRs PPTX slides that only contain embedded images", async () => {
  (JSZip.loadAsync as jest.Mock).mockResolvedValueOnce({
    files: {
      "ppt/slides/slide1.xml": {
        async: async () => "<p:sld><p:pic><a:blip r:embed=\"rId2\"/></p:pic></p:sld>"
      },
      "ppt/slides/_rels/slide1.xml.rels": {
        async: async () => [
          "<Relationships>",
          "<Relationship Id=\"rId2\" Target=\"../media/image1.png\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\"/>",
          "</Relationships>"
        ].join("")
      },
      "ppt/media/image1.png": {
        async: async (type: string) => {
          expect(type).toBe("base64");
          return "AQID";
        }
      }
    }
  });
  const buffer = Uint8Array.from([1, 2, 3]).buffer;
  const app = { vault: { readBinary: async () => buffer } };
  const imageOcrProvider = jest.fn(async () => "Scanned slide text");

  await expect(readRawFileWithParser(app as never, { path: "raw/deck.pptx" } as never, { imageOcrProvider }))
    .resolves.toBe("# Slide 1\nScanned slide text");
  expect(imageOcrProvider).toHaveBeenCalledWith({
    path: "raw/deck.pptx#slide-1-image-1",
    imageDataUrl: "data:image/png;base64,AQID"
  });
});
