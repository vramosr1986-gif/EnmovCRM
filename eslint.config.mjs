import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    plugins: { js },
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.browser }
    },
    rules: {
      "no-unused-vars": ["warn", { "args": "none" }],
      "no-undef": "off"
    }
  }
];