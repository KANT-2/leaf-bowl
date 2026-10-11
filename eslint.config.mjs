import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import stylistic from "@stylistic/eslint-plugin";

const functionStatement = {
  selector: [
    "FunctionDeclaration",
    "VariableDeclaration:has(VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression))",
    ':matches(ExportNamedDeclaration, ExportDefaultDeclaration)[declaration.type="FunctionDeclaration"]',
    'ExportNamedDeclaration[declaration.type="VariableDeclaration"]:has(VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression))',
  ].join(", "),
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: {
      "@stylistic": stylistic,
    },
    rules: {
      curly: ["error", "all"],
      "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: functionStatement, next: functionStatement },
      ],
      "@stylistic/lines-between-class-members": [
        "error",
        { enforce: [{ blankLine: "always", prev: "method", next: "method" }] },
      ],
    },
  },
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "application/**/*.ts",
      "infrastructure/**/*.ts",
      "features/**/*.ts",
      "modules/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/seed/**", "@/tests/**", "@/lib/**", "@/data/**"],
              message: "운영 코드는 시드·테스트·이전 lib 데이터에 의존할 수 없습니다.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/application/**",
                "@/infrastructure/**",
                "@/features/**",
                "@/components/**",
                "@/app/**",
                "@/seed/**",
                "@/tests/**",
                "@/lib/**",
                "@/data/**",
                "@/public/**",
                "@/generated/**",
                "react",
                "react/**",
                "next",
                "next/**",
                "@prisma/**",
              ],
              message: "업무 모듈은 화면·프레임워크·저장소 구현을 import할 수 없습니다. 계약과 입력값을 사용하세요.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/application/**",
                "@/features/**",
                "@/components/**",
                "@/app/**",
                "@/seed/**",
                "@/tests/**",
                "@/lib/**",
              ],
              message: "인프라 어댑터는 업무 계약에 의존하며 애플리케이션·화면 구현을 가져오지 않습니다.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["features/**/*.ts", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/application/**",
                "@/infrastructure/database/**",
                "@/infrastructure/catalog/**",
                "@/infrastructure/settings/**",
                "@/infrastructure/orders/**",
                "@/infrastructure/identity/**",
                "@/infrastructure/http/**",
                "@/generated/**",
                "@/seed/**",
                "@/tests/**",
                "@/lib/**",
                "@/data/**",
              ],
              message: "화면은 업무 계약·브라우저 어댑터를 사용하고 서버 구현은 API로 호출하세요.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "generated/prisma/**",
  ]),
]);

export default eslintConfig;
