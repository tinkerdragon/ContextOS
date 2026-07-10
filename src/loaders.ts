import type * as JSZipType from "jszip";
import type * as MammothType from "mammoth";
import type * as XlsxType from "@e965/xlsx";
import type * as PptType from "ppt-to-text";
import type WordExtractorType from "word-extractor";

let _jszip: typeof JSZipType | undefined;
let _mammoth: typeof MammothType | undefined;
let _xlsx: typeof XlsxType | undefined;
let _wordExtractor: typeof WordExtractorType | undefined;
let _ppt: typeof PptType | undefined;

const requireModule = (depPath: string, pkgName: string): unknown => {
  const w = window as unknown as { require?: (module: string) => unknown };
  if (typeof w.require !== "function") throw new Error("require not available");
  try {
    return w.require(depPath);
  } catch {
    return w.require(pkgName);
  }
};

export function getJSZip(): typeof JSZipType {
  if (!_jszip) _jszip = requireModule("./deps/jszip.js", "jszip") as typeof JSZipType;
  return _jszip;
}

export function getMammoth(): typeof MammothType {
  if (!_mammoth) _mammoth = requireModule("./deps/mammoth.js", "mammoth") as typeof MammothType;
  return _mammoth;
}

export function getXlsx(): typeof XlsxType {
  if (!_xlsx) _xlsx = requireModule("./deps/xlsx.js", "@e965/xlsx") as typeof XlsxType;
  return _xlsx;
}

export function getWordExtractor(): typeof WordExtractorType {
  if (!_wordExtractor) _wordExtractor = requireModule("./deps/word-extractor.js", "word-extractor") as typeof WordExtractorType;
  return _wordExtractor;
}

export function getPptToText(): typeof PptType {
  if (!_ppt) _ppt = requireModule("./deps/ppt-to-text.js", "ppt-to-text") as typeof PptType;
  return _ppt;
}
