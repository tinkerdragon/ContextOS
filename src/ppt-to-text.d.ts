declare module "ppt-to-text" {
  export function extractText(input: Buffer | string, options?: { separator?: string }): string;
}
