import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // ブラウザから Firebase を呼ばない（AGENTS.md「壊してはいけないもの」6）。パスワードの確認はサーバーが REST で行う。
  // firebase パッケージはテスト（tests/emulator/firestoreRules.test.ts）だけで使う
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ regex: "^firebase(/|$)", message: "ブラウザから Firebase を呼ばない。サーバーは firebase-admin を使う" }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
