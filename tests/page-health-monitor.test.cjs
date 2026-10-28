/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { collectErrors, planMonitor, loadState, saveState, RETRY_MS } = require("../scripts/page-health-monitor.cjs");

const report = (errors = []) => ({
  base: "http://localhost:3000",
  results: [
    { page: "menu", viewport: "desktop", errors, warnings: [{ message: "net::ERR_ABORTED" }] },
    { page: "menu", viewport: "mobile", errors, warnings: [] },
  ],
});
const error = { type: "http", url: "http://localhost:3000/api/catalog?attempt=1", status: 503 };

test("new errors are deduplicated across viewports; successful diagnosis suppresses repeat calls", () => {
  const first = planMonitor(report([error]));
  assert.equal(first.newErrors.length, 1);
  assert.equal(first.toDiagnose.length, 1);
  const id = first.toDiagnose[0].id;
  first.active[id].diagnosed = true;
  const repeated = planMonitor(report([{ ...error, url: "http://localhost:3000/api/catalog?attempt=2" }]), first);
  assert.equal(repeated.newErrors.length, 0);
  assert.equal(repeated.toDiagnose.length, 0);
  assert.equal(repeated.recoveredErrors.length, 0);
});

test("recovery clears an incident and a later recurrence is a new error", () => {
  const first = planMonitor(report([error]));
  const firstClean = planMonitor(report(), first);
  assert.equal(firstClean.recoveredErrors.length, 0);
  const recovered = planMonitor(report(), firstClean);
  assert.equal(recovered.recoveredErrors.length, 1);
  assert.equal(recovered.toDiagnose.length, 0);
  const recurred = planMonitor(report([error]), recovered);
  assert.equal(recurred.newErrors.length, 1);
  assert.equal(recurred.toDiagnose.length, 1);
});

test("one missed observation does not retrigger diagnosis of the same error", () => {
  const first = planMonitor(report([error]));
  first.active[first.toDiagnose[0].id].diagnosed = true;
  const missed = planMonitor(report(), first);
  const repeated = planMonitor(report([error]), missed);
  assert.equal(repeated.newErrors.length, 0);
  assert.equal(repeated.toDiagnose.length, 0);
  assert.equal(repeated.active[first.toDiagnose[0].id].cleanScans, 0);
});

test("failed diagnosis retries after six hours without treating the error as new", () => {
  const now = Date.parse("2026-10-27T00:00:00Z");
  const first = planMonitor(report([error]), undefined, now);
  first.active[first.toDiagnose[0].id].lastAttemptAt = new Date(now).toISOString();
  assert.equal(planMonitor(report([error]), first, now + RETRY_MS - 1).toDiagnose.length, 0);
  const retry = planMonitor(report([error]), first, now + RETRY_MS);
  assert.equal(retry.toDiagnose.length, 1);
  assert.equal(retry.newErrors.length, 0);
});

test("warnings are excluded and stack/query changes do not create a new incident", () => {
  assert.deepEqual(collectErrors(report()), []);
  const a = { type: "javascript", message: "Error: fetch failed https://example.com/path?v=1\n at module:1:2" };
  const b = { ...a, message: "Error: fetch failed https://example.com/path?v=2\n at module:5:8" };
  assert.equal(collectErrors(report([a]))[0].id, collectErrors(report([b]))[0].id);
});

test("tool failure does not falsely resolve previously observed page errors", () => {
  const first = planMonitor(report([error]));
  const failed = planMonitor({ ...report(), runtimeError: "Browser unavailable" }, first);
  assert.equal(failed.recoveredErrors.length, 0);
  assert.equal(Object.keys(failed.active).length, 2);
});

test("state persists a successful diagnosis and separates targets and injected runs", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "page-health-monitor-test-"));
  try {
    const current = report([error]);
    const loaded = await loadState(current, directory);
    const plan = planMonitor(current, loaded.state);
    await saveState(loaded.filename, loaded.state, plan, { status: "success" }, "test-report");
    const saved = await loadState(current, directory);
    assert.equal(planMonitor(current, saved.state).toDiagnose.length, 0);
    assert.equal(saved.state.lastReport, "test-report");
    assert.notEqual((await loadState({ ...current, injectedError: true }, directory)).filename, saved.filename);
    assert.notEqual((await loadState({ ...current, base: "https://example.com" }, directory)).filename, saved.filename);
    await fs.writeFile(saved.filename, "invalid JSON");
    await assert.rejects(loadState(current, directory));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
