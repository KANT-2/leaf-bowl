/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
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

const { withFileLock } = require("../lib/admin/file-lock.ts");
const { spawnSync, spawn } = require("node:child_process");

test("dead owner and interrupted recovery are restored without removing a live owner", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-lock-"));
  const lock = path.join(directory, ".lock");
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  try {
    fs.symlinkSync(`${child.stdout}:dead`, lock);
    fs.symlinkSync(`${child.stdout}:dead-recovery`, lock + ".recovery");
    await withFileLock(directory, async () => assert.equal(fs.readlinkSync(lock).split(":")[0], String(process.pid)));
    assert.ok(!fs.existsSync(lock));
    fs.mkdirSync(lock);
    const past = new Date(Date.now() - 120_000);
    fs.utimesSync(lock, past, past);
    await withFileLock(directory, async () => {});
    assert.ok(!fs.existsSync(lock));
    let release;
    let entered;
    const enteredPromise = new Promise((resolve) => { entered = resolve; });
    const first = withFileLock(directory, async () => { entered(); await new Promise((resolve) => { release = resolve; }); });
    await enteredPromise;
    const liveToken = fs.readlinkSync(lock);
    let secondEntered = false;
    const second = withFileLock(directory, async () => { secondEntered = true; });
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(secondEntered, false);
    assert.equal(fs.readlinkSync(lock), liveToken);
    release();
    await Promise.all([first, second]);
    assert.ok(secondEntered);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("separate processes serialize updates and compete safely to recover a dead lock", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-lock-race-"));
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  fs.symlinkSync(`${child.stdout}:dead`, path.join(directory, ".lock"));
  fs.writeFileSync(path.join(directory, "count"), "0");
  const loader = fs.readFileSync(__filename, "utf8").split('const { withFileLock }')[0];
  const worker = loader + `
    const { withFileLock } = require(${JSON.stringify(path.resolve(__dirname, "../lib/admin/file-lock.ts"))});
    (async () => { for(let i=0;i<4;i++) await withFileLock(${JSON.stringify(directory)}, async () => {
      const file=path.join(${JSON.stringify(directory)}, "count");
      const count=Number(fs.readFileSync(file,"utf8"));
      await new Promise(r=>setTimeout(r,25));
      fs.writeFileSync(file,String(count+1));
    }); })().catch(e=>{console.error(e);process.exitCode=1;});`;
  try {
    await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
      const process = spawn(global.process.execPath, ["-e", worker], { cwd: __dirname, stdio: "pipe" });
      let error = "";
      process.stderr.on("data", (chunk) => error += chunk);
      process.on("error", reject);
      process.on("exit", (code) => code === 0 ? resolve() : reject(Error(error)));
    })));
    assert.equal(fs.readFileSync(path.join(directory, "count"), "utf8"), "12");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
