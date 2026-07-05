import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Static design-handoff artifacts, not application code.
    "docs/**",
  ]),
  // Pre-existing violations in these files, downgraded to warnings so CI can
  // gate new code at error level. Remove each entry once the file is fixed —
  // do not add new files here.
  {
    files: [
      "src/app/dashboard/organizers/page.tsx",
      "src/app/org/calendar/page.tsx",
      "src/app/org/events/page.tsx",
      "src/app/org/inbox/page.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["src/app/schedule/page.tsx"],
    rules: {
      "react/no-unescaped-entities": "warn",
    },
  },
]);

export default eslintConfig;
