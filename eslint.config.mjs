import nextConfig from "eslint-config-next";
import eslintConfigPrettier from "eslint-config-prettier/flat";

const config = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "archive/**",
      "drizzle/**",
      "coverage/**",
    ],
  },
  {
    rules: {
      // React 19's new strict rule flags legitimate patterns (reset-on-dep-change,
      // init-from-prop). Leave as warn so future refactors surface them without
      // blocking builds.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  eslintConfigPrettier,
];

export default config;
