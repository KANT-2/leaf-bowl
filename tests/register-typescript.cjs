/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
// Next.js checks server-only boundaries when building; isolated Node tests have no RSC resolver.
const load = Module._load;
Module._load = function (request, ...args) {
  if (request === "next/server") {
    const server = load.call(this, request, ...args);
    // Route unit tests provide their own Web Request instead of a Next.js request scope.
    return { ...server, connection: async () => {} };
  }
  return request === "server-only" ? {} : load.call(this, request, ...args);
};
// Load the project's TypeScript domain modules without a second test toolchain.
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(__dirname, "..", request.slice(2))
      : request,
    ...args,
  );
};
