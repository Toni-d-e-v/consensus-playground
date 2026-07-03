import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // SPEC §4 hard rules: the engine is framework-free, deterministic, and
    // lives on logical ticks. CI-enforced (SPEC §10.4).
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "Engine must be framework-free (SPEC §4).",
            },
            {
              group: ["**/exhibits/**"],
              message: "Engine must not import from exhibits (SPEC §4).",
            },
          ],
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "Math",
          property: "random",
          message: "All engine randomness goes through the injected seeded RNG (SPEC §4).",
        },
        {
          object: "Date",
          property: "now",
          message: "Engine time is logical ticks, not wall-clock (SPEC §4).",
        },
        {
          object: "performance",
          property: "now",
          message: "Engine time is logical ticks, not wall-clock (SPEC §4).",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "Engine must not touch the DOM (SPEC §4)." },
        { name: "document", message: "Engine must not touch the DOM (SPEC §4)." },
        { name: "performance", message: "Engine time is logical ticks, not wall-clock (SPEC §4)." },
      ],
    },
  },
);
