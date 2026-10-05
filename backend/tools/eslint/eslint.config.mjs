/**
 * ESLint für das Backend (Flat Config). Aufruf im Ordner backend: npm run lint (0 Warnungen erlaubt).
 *
 * Liegt in tools/eslint mit eigenen Abhängigkeiten: typescript-eslint braucht die JavaScript-API von TypeScript 6,
 * das Backend baut und prüft mit TypeScript 7 (nativer Compiler, ohne diese API). Dateimuster gelten relativ zum
 * Arbeitsordner backend/ (Aufruf mit --config).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'tools/**', 'drizzle/**', 'database/**', 'backups/**']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        // Code und Tests haben getrennte tsconfig-Dateien (Tests weniger streng)
        project: ['./tsconfig.json', './tsconfig.test.json'],
        tsconfigRootDir: backendRoot
      }
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      // Services sind bewusst async, obwohl better-sqlite3 synchron arbeitet: Die Schnittstelle bleibt stabil, wenn
      // später doch etwas Asynchrones dazukommt (z. B. Passwort-Hashing). await auf Nicht-Promises meldet await-thenable.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-floating-promises': ['error', {
        // test()/describe() aus node:test liefern Promises, die der Testrunner selbst abwartet
        allowForKnownSafeCalls: [{ from: 'package', package: 'node:test', name: ['test', 'it', 'describe', 'suite'] }]
      }]
    }
  },
  {
    // Ausgaben auf der Konsole sind in CLI-Skripten und Tests gewollt (Server-Code loggt über lib/logger.ts)
    files: ['src/scripts/**/*.ts', 'test/**/*.ts'],
    rules: { 'no-console': 'off' }
  },
  {
    // Tests lesen JSON-Antworten und Protokolleinträge bewusst locker (tsconfig.test.json: noImplicitAny aus)
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off'
    }
  }
]);
