import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Generated phone entrypoints use MessengerBot R's CommonJS module loader.
    files: [
      "integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js",
      "integrations/messengerbot-r/nexus/NEXUS_KAKAO_BOT_MESSENGERBOT_R.js",
    ],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Disposable QA artifacts and private credentials are not source inputs.
    ".tmp/**",
    ".private/**",
  ]),
]);

export default eslintConfig;
