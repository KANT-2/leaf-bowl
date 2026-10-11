/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const layers = [
  "modules",
  "application",
  "infrastructure",
  "features",
  "components",
  "app",
];
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(filename);
    else if (/\.tsx?$/.test(filename)) files.push(filename);
  }
}
layers.forEach((layer) => walk(path.join(root, layer)));

function resolve(from, reference) {
  if (!reference.startsWith("@/") && !reference.startsWith(".")) return null;
  const base = reference.startsWith("@/")
    ? path.join(root, reference.slice(2))
    : path.resolve(path.dirname(from), reference);
  const target = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".json",
    path.join(base, "index.ts"),
  ].find(
    (filename) => fs.existsSync(filename) && fs.statSync(filename).isFile(),
  );
  assert.ok(
    target,
    `${path.relative(root, from)}: unresolved import ${reference}`,
  );
  return target;
}

const graph = new Map(
  files.map((filename) => {
    const source = ts.createSourceFile(
      filename,
      fs.readFileSync(filename, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const imports = [];
    function visit(node) {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      ) {
        const clause = node.importClause;
        const bindings = clause?.namedBindings;
        const typeOnly =
          node.isTypeOnly ||
          clause?.isTypeOnly ||
          (!clause?.name &&
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.every((element) => element.isTypeOnly));
        imports.push({
          reference: node.moduleSpecifier.text,
          runtime: !typeOnly,
        });
      }
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === "require") &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        imports.push({ reference: node.arguments[0].text, runtime: true });
      ts.forEachChild(node, visit);
    }
    visit(source);
    return [
      filename,
      {
        client: source.statements.some(
          (node) =>
            ts.isExpressionStatement(node) &&
            ts.isStringLiteral(node.expression) &&
            node.expression.text === "use client",
        ),
        imports: imports.map((item) => ({
          ...item,
          target: resolve(filename, item.reference),
        })),
      },
    ];
  }),
);

test("architecture: relative, alias, type and dynamic imports obey layer boundaries", () => {
  for (const [filename, node] of graph) {
    const layer = path.relative(root, filename).split(path.sep)[0];
    for (const item of node.imports) {
      const targetLayer =
        item.target && path.relative(root, item.target).split(path.sep)[0];
      const description = `${path.relative(root, filename)} -> ${item.reference}`;
      assert.ok(
        !["seed", "tests", "lib", "data"].includes(targetLayer),
        description,
      );
      if (layer === "modules") {
        assert.ok(
          ![
            "application",
            "infrastructure",
            "features",
            "components",
            "app",
            "public",
            "generated",
          ].includes(targetLayer),
          description,
        );
        assert.ok(
          !/^(next|react|@prisma)(\/|$)/.test(item.reference),
          description,
        );
      }
      if (layer === "infrastructure")
        assert.ok(
          !["application", "features", "components", "app"].includes(
            targetLayer,
          ),
          description,
        );
      if (["features", "components"].includes(layer)) {
        assert.ok(
          !["application", "app", "generated"].includes(targetLayer),
          description,
        );
        if (targetLayer === "infrastructure")
          assert.ok(
            path
              .relative(root, item.target)
              .startsWith("infrastructure/browser/"),
            description,
          );
      }
    }
  }
});

test("architecture: runtime module graph has no dependency cycles", () => {
  const complete = new Set();
  const active = [];
  function visit(filename) {
    if (complete.has(filename) || !graph.has(filename)) return;
    assert.ok(
      !active.includes(filename),
      `Dependency cycle: ${[...active, filename].map((item) => path.relative(root, item)).join(" -> ")}`,
    );
    active.push(filename);
    graph
      .get(filename)
      .imports.filter((item) => item.runtime && item.target)
      .forEach((item) => visit(item.target));
    active.pop();
    complete.add(filename);
  }
  files.forEach(visit);
});

test("architecture: client entry points never load server-only or Node modules", () => {
  for (const [entry, node] of graph) {
    if (!node.client) continue;
    const visited = new Set();
    function visit(filename) {
      if (visited.has(filename) || !graph.has(filename)) return;
      visited.add(filename);
      for (const item of graph
        .get(filename)
        .imports.filter((item) => item.runtime)) {
        assert.ok(
          item.reference !== "server-only" &&
            !item.reference.startsWith("node:") &&
            !["next/server", "next/headers", "pg"].includes(item.reference) &&
            !item.reference.startsWith("@prisma/"),
          `${path.relative(root, entry)} loads ${item.reference} through ${path.relative(root, filename)}`,
        );
        if (item.target) visit(item.target);
      }
    }
    visit(entry);
  }
});

test("architecture: ESLint rejects new forbidden imports and allows shared contracts", async () => {
  const { ESLint } = require("eslint");
  const eslint = new ESLint({ cwd: root });
  for (const [filename, target] of [
    ["modules/catalog/boundary-probe.ts", "@/application/catalog"],
    ["components/boundary-probe.tsx", "@/seed/legacy/catalog"],
    ["infrastructure/boundary-probe.ts", "@/features/admin/request"],
  ]) {
    const [result] = await eslint.lintText(
      `import * as dependency from "${target}"; void dependency;`,
      { filePath: path.join(root, filename) },
    );
    assert.ok(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
      `${filename} allowed ${target}`,
    );
  }
  const [allowed] = await eslint.lintText(
    'import type { Catalog } from "@/modules/catalog/schema"; export type Contract = Catalog;',
    { filePath: path.join(root, "modules/orders/boundary-probe.ts") },
  );
  assert.equal(allowed.errorCount, 0);
});
