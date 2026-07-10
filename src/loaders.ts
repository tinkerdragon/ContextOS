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

export function getJSZip(): typeof JSZipType {
  if (!_jszip) _jszip = require("jszip") as typeof JSZipType;
  return _jszip;
}

export function getMammoth(): typeof MammothType {
  if (!_mammoth) _mammoth = require("mammoth") as typeof MammothType;
  return _mammoth;
}

export function getXlsx(): typeof XlsxType {
  if (!_xlsx) _xlsx = require("@e965/xlsx") as typeof XlsxType;
  return _xlsx;
}

export function getWordExtractor(): typeof WordExtractorType {
  if (!_wordExtractor) _wordExtractor = require("word-extractor") as typeof WordExtractorType;
  return _wordExtractor;
}

export function getPptToText(): typeof PptType {
  if (!_ppt) _ppt = require("ppt-to-text") as typeof PptType;
  return _ppt;
}
