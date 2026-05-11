import tsparser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "main.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "no-unused-expressions": "error",
      "obsidianmd/ui/sentence-case": ["error", {
        brands: ["EMRALD", "Effort Mastery"],
        acronyms: ["EMRALD", "API", "AI", "UTC", "URL", "PRO"]
      }],
    },
  },
];
