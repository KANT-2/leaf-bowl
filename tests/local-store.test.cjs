/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createLocalStore } = require("../lib/local-store.ts");

test("local store refreshes after unsubscribe and handles another tab clearing storage", () => {
  const previous = global.window;
  const events = new Set();
  global.window = { addEventListener: (_type, fn) => events.add(fn), removeEventListener: (_type, fn) => events.delete(fn) };
  let persisted = ["old"];
  let calls = 0;
  const store = createLocalStore("recipes", () => [...persisted], next => { persisted = next; }, []);
  try {
    const stop = store.subscribe(() => calls++);
    const snapshot = store.getSnapshot();
    assert.equal(store.getSnapshot(), snapshot, "snapshot references remain stable between changes");
    stop();
    assert.equal(events.size, 0);
    persisted = ["from another tab while unmounted"];
    const stopAgain = store.subscribe(() => calls++);
    assert.deepEqual(store.getSnapshot(), persisted);
    for (const event of events) event({ key: "other-key" });
    assert.equal(calls, 0);
    persisted = [];
    for (const event of events) event({ key: null });
    assert.deepEqual(store.getSnapshot(), []);
    assert.equal(calls, 1);
    store.set(["new"]);
    assert.deepEqual(persisted, ["new"]);
    assert.equal(calls, 2);
    stopAgain();
  } finally { if (previous === undefined) delete global.window; else global.window = previous; }
});
