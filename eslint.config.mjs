// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    files: ["src/**/*.ts"],
    plugins: { obsidianmd },
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    rules: {
      ...Object.fromEntries(
        Object.keys(obsidianmd.rules).map((name) => [`obsidianmd/${name}`, "warn"])
      ),
      "obsidianmd/prefer-get-language": "off",
      "obsidianmd/settings-tab/require-display": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
]);
