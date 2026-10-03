import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Altlasten sind mit dem Frontend-Umbau behoben – ab jetzt gilt wieder die strenge Regel
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": "error",
    },
  },
  { ignores: [".next/**", "node_modules/**", "e2e/**", "playwright-report/**", "test-results/**"] },
];

export default eslintConfig;
