/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { runAiDiagnosis, exitCodeFor, acquireRunLock } = require("../scripts/page-health.cjs");

test("overlapping scans of one server are rejected and the lock is reusable after release", async () => {
  const target = `http://localhost:${20000 + (process.pid % 30000)}`;
  const release = await acquireRunLock(target);
  try {
    await assert.rejects(acquireRunLock(target + "/menu"), /이미 실행 중/);
  } finally {
    await release();
  }
  const releaseAgain = await acquireRunLock(target);
  await releaseAgain();
});

test("page health distinguishes page errors from diagnosis and runtime failures", () => {
  assert.equal(exitCodeFor({ pagePassed: true, ai: { status: "skipped" } }), 0);
  assert.equal(exitCodeFor({ pagePassed: false, ai: { status: "success" } }), 1);
  assert.equal(exitCodeFor({ pagePassed: true, ai: { status: "failed" } }), 2);
  assert.equal(exitCodeFor({ runtimeError: "no browser", ai: { status: "skipped" } }), 2);
});

test("AI diagnosis saves only a successful result and restricts the CLI to reading artifacts", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "page-health-test-"));
  try {
    const result = await runAiDiagnosis({
      directory,
      execute: async (command, args, options) => {
        assert.ok(command);
        assert.equal(options.cwd, directory);
        assert.equal(options.timeout, 180000);
        assert.equal(options.shell, undefined);
        assert.equal(args[args.indexOf("--tools") + 1], "Read");
        assert.ok(args.includes("--restricted"));
        assert.ok(args.includes("--safe-mode"));
        assert.ok(args.includes("--strict-mcp-config"));
        return { stdout: JSON.stringify({ subtype: "success", is_error: false, result: "검증 결과" }) };
      },
    });
    assert.equal(result.status, "success");
    assert.equal(await fs.readFile(path.join(directory, result.file), "utf8"), "검증 결과");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("missing CLI, timeout, invalid JSON and provider errors never become successful diagnoses", async () => {
  for (const failure of ["missing", "timeout", "invalid-json", "provider-error", "empty-result"]) {
    const result = await runAiDiagnosis({
      execute: async () => {
        if (failure === "missing" || failure === "timeout") {
          throw Object.assign(new Error("sensitive stderr must not be copied"), {
            code: failure === "missing" ? "ENOENT" : undefined,
            killed: failure === "timeout",
          });
        }
        return {
          stdout:
            failure === "invalid-json"
              ? "not JSON"
              : JSON.stringify({
                  subtype: failure === "provider-error" ? "error_during_execution" : "success",
                  is_error: failure === "provider-error",
                  result: "",
                }),
        };
      },
    });
    assert.equal(result.status, "failed", failure);
    assert.doesNotMatch(result.error, /sensitive stderr/);
  }
});
