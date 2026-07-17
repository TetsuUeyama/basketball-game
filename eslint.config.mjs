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
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_"
        }
      ]
    }
  },
  {
    // Sim コアは Babylon 非依存（ヘッドレス実行可能）を機械的に強制する
    files: ["src/BaseDefense/Sim/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@babylonjs/*"],
              message: "Sim/ 配下は Babylon 非依存を維持する（ヘッドレスハーネスで直接実行するため）。描画は View/ 層へ。",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
