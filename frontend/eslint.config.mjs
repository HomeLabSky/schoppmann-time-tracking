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
    // Übergangsweise Warnungen statt Fehler: ~70 Altlasten in lib/ und types/.
    // Werden mit dem Frontend-Umbau (Phase 3 im Modernisierungsbericht) behoben,
    // danach wieder auf "error" stellen.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
];

export default eslintConfig;
