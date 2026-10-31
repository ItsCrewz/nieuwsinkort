// ESLint (#300): typescript-eslint recommended + react-hooks; bewust licht, geen formattering.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "prod-frozen/**", "node_modules/**", "worker/node_modules/**", "public/**", ".wrangler/**", "coverage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs,mts,js}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-useless-assignment": "warn",
      "no-useless-escape": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  { files: ["tests/usevoorladen.test.ts"], rules: { "react-hooks/rules-of-hooks": "off" } },
  { files: ["**/*.d.ts"], rules: { "@typescript-eslint/no-unused-vars": "off" } },
  { files: ["scripts/**", "tests/**", "export_from_canvas.mjs", "*.config.*"], rules: { "no-console": "off" } },
);
