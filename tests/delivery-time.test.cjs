/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
require("./register-typescript.cjs");
const { deliveryWindowUTC, deliveryWindowKST } = require("../modules/delivery/time.ts");
const { createOrderSchema } = require("../modules/orders/schema.ts");
const { requestHash } = require("../modules/orders/request-hash.ts");

test("UTC/KST conversion preserves dates, midnight and 24:00 without invalid calendar rollover", () => {
  const window = deliveryWindowUTC("2026-10-13", "12:00–13:00");
  assert.deepEqual(window, { desiredStartAt: "2026-10-13T03:00:00.000Z", desiredEndAt: "2026-10-13T04:00:00.000Z" });
  assert.deepEqual(deliveryWindowKST(window.desiredStartAt, window.desiredEndAt), { day: "2026-10-13", timeLabel: "12:00–13:00" });
  assert.equal(deliveryWindowUTC("2026-01-01", "00:00–01:00").desiredStartAt, "2025-12-31T15:00:00.000Z");
  const midnight = deliveryWindowUTC("2026-12-31", "23:00–24:00");
  assert.deepEqual(deliveryWindowKST(midnight.desiredStartAt, midnight.desiredEndAt), { day: "2026-12-31", timeLabel: "23:00–24:00" });
  for (const [day, slot] of [["2026-02-30", "10:00–11:00"], ["2026-10-13", "25:00–26:00"], ["2026-10-13", "12:00–14:00"]]) {
    assert.equal(deliveryWindowUTC(day, slot), null);
  }
});

test("server input requires UTC Z instants and legacy input normalizes to the same retry hash", () => {
  const base = { items: [{ productId: 0, quantity: 2 }], ordererName: "검증", phone: "010-1234-5678", address: "서울 중구" };
  const legacy = createOrderSchema.parse({ ...base, desiredDate: "2026-10-13", desiredSlot: "12:00–13:00" });
  const utc = createOrderSchema.parse({ ...base, desiredStartAt: "2026-10-13T03:00:00Z", desiredEndAt: "2026-10-13T04:00:00Z" });
  assert.equal(requestHash(legacy), requestHash(utc));
  assert.equal(utc.desiredStartAt, "2026-10-13T03:00:00.000Z");
  const bad = (fields) => assert.throws(() => createOrderSchema.parse({ ...base, ...fields }));
  bad({ desiredStartAt: "2026-10-13T12:00:00+09:00", desiredEndAt: "2026-10-13T13:00:00+09:00" });
  bad({ desiredStartAt: "2026-10-13T03:00:00", desiredEndAt: "2026-10-13T04:00:00" });
  bad({ desiredStartAt: "2026-02-30T03:00:00Z", desiredEndAt: "2026-02-30T04:00:00Z" });
  bad({ desiredStartAt: utc.desiredStartAt });
  bad({ desiredStartAt: utc.desiredEndAt, desiredEndAt: utc.desiredStartAt });
  bad({ desiredStartAt: "2026-10-13T03:30:00Z", desiredEndAt: "2026-10-13T04:30:00Z" });
  bad({ desiredStartAt: utc.desiredStartAt, desiredEndAt: utc.desiredEndAt, desiredDate: "2026-10-13", desiredSlot: "12:00–13:00" });
});

test("slot calculation and UTC serialization are independent of server TZ including DST boundaries", () => {
  const script = `require('./tests/register-typescript.cjs');
    const { dateValue, timeOptions } = require('./modules/delivery/slots.ts');
    const { deliveryWindowUTC, deliveryWindowKST } = require('./modules/delivery/time.ts');
    const output = ['2026-10-12T15:10:00Z','2026-03-08T03:00:00Z','2026-11-01T03:00:00Z'].map(at => {
      const now = Date.parse(at), day = dateValue(now,0);
      const slots = timeOptions(day,now,{open:10,close:21});
      const window = deliveryWindowUTC(day,slots[0].label);
      return {day,slots,window,display:deliveryWindowKST(window.desiredStartAt,window.desiredEndAt)};
    }); process.stdout.write(JSON.stringify(output));`;
  const outputs = ["UTC", "Asia/Seoul", "America/Los_Angeles"].map((TZ) => execFileSync(process.execPath, ["-e", script], { cwd: require("node:path").join(__dirname, ".."), env: { ...process.env, TZ }, encoding: "utf8" }));
  assert.equal(outputs[0], outputs[1]);
  assert.equal(outputs[0], outputs[2]);
  assert.equal(JSON.parse(outputs[0])[0].day, "2026-10-13");
});

test("local order history migrates KST records and saves new UTC windows without display labels", () => {
  const previous = global.localStorage;
  let raw = JSON.stringify([{ id: "old", createdAt: 1, day: "2026-10-13", timeLabel: "12:00–13:00", address: "서울", total: 23000, items: [] }]);
  global.localStorage = { getItem: () => raw, setItem: (_key, value) => raw = value };
  try {
    const { ordersStore, recordOrder } = require("../infrastructure/browser/legacy-orders.ts");
    const old = ordersStore.getSnapshot()[0];
    assert.equal(old.desiredStartAt, "2026-10-13T03:00:00.000Z");
    assert.equal(old.day, undefined);
    recordOrder({ ...deliveryWindowUTC("2026-10-14", "10:00–11:00"), address: "서울", total: 23000, items: [] });
    const saved = JSON.parse(raw);
    assert.equal(saved[0].desiredStartAt, "2026-10-14T01:00:00.000Z");
    assert.equal(saved[0].day, undefined);
    assert.equal(saved[0].timeLabel, undefined);
  } finally {
    if (previous === undefined) delete global.localStorage;
    else global.localStorage = previous;
  }
});
