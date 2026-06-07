import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  { ignores: ["dist/**", "dev-dist/**", "node_modules/**", "*.config.js", "public/**", "e2e/**", "playwright-report/**"] },
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // Lo crítico: usar un identificador no importado/definido es ERROR.
      // (Esto habría detectado el `tint` sin importar que dejó Optimización en blanco.)
      "no-undef": "error",
      // Ayudas, no bloqueantes:
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^[A-Z_]" }],
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",
      "react/no-unknown-property": "off",
      "react/no-unescaped-entities": "off",
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["tests/**/*.{js,jsx}"],
    plugins: { react },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: { "react/jsx-uses-vars": "error" },
  },
];
