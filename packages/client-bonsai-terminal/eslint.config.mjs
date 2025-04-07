import eslintGlobalConfig from "../../eslint.config.mjs";

export default [
  ...eslintGlobalConfig,
  {
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off"
    }
  }
];
