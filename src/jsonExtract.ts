// Extract a JSON value from a possibly-chatty model reply. The prompts ask for pure JSON, so the
// dominant, unambiguous case is handled first: strip a whole-string code fence and parse the
// whole reply. Only when that fails (prose wraps the JSON) do we scan for balanced regions.
//
// A reply containing several valid JSON values is a malformed reply and is inherently ambiguous;
// we keep the LAST valid region, matching the common pattern where a model shows an example or
// restates the requested schema BEFORE emitting its real answer. The reverse (a valid decoy
// appended after the answer) is rare and accepted as ambiguous. Selection is not size-based, so a
// restated schema/example cannot outweigh the real payload by being longer.

function stripFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

function isPlainObject(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Collect every top-level balanced region in a single string-aware pass (O(n), no re-scanning and
// no scan cap): braces/brackets inside string literals do not affect depth, stray closers and an
// unterminated final opener are ignored.
function topLevelRegions(text: string, open: string, close: string): string[] {
  const regions: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === open) {
      if (depth === 0) start = index;
      depth++;
    } else if (char === close && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        regions.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  return regions;
}

function extractJson(text: string, open: string, close: string, isValid: (value: unknown) => boolean): unknown {
  const stripped = stripFence(text);
  // Common case: the reply is exactly the JSON (optionally fenced) — unambiguous.
  try {
    const whole = JSON.parse(stripped);
    if (isValid(whole)) return whole;
  } catch {
    // Not pure JSON — fall through to the balanced region scan.
  }
  // Chatty reply: keep the last valid top-level region (see file header for the rationale).
  let result: unknown;
  for (const region of topLevelRegions(stripped, open, close)) {
    try {
      const value = JSON.parse(region);
      if (isValid(value)) result = value;
    } catch {
      // Not JSON — ignore this region.
    }
  }
  return result;
}

export function extractJsonObject(text: string, isValid: (value: unknown) => boolean = isPlainObject): unknown {
  return extractJson(text, "{", "}", isValid);
}

export function extractJsonArray(text: string): unknown {
  return extractJson(text, "[", "]", Array.isArray);
}
