/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { eventSchema, eventsSchema, eventStatus } = require("../modules/events/schema.ts");
const event = {
  id: "test",
  title: "가을 이벤트",
  description: "",
  startDate: "2026-10-01",
  endDate: "2026-10-12",
  image: "",
  mobileImage: "",
  alt: "",
  href: "/menu",
  visible: true,
};
test("event periods use KST and include the final day", () => {
  assert.equal(eventStatus(event, Date.parse("2026-10-12T14:59:59Z")), "ongoing");
  assert.equal(eventStatus(event, Date.parse("2026-10-12T15:00:00Z")), "ended");
  assert.equal(eventStatus(event, Date.parse("2026-09-30T14:59:59Z")), "scheduled");
});
test("invalid dates, reversed periods, external links and duplicate identifiers are rejected", () => {
  for (const patch of [
    { startDate: "2026-02-30" },
    { endDate: "2026-09-30" },
    { href: "//example.com" },
    { href: "javascript:alert(1)" },
  ]) {
    assert.equal(eventSchema.safeParse({ ...event, ...patch }).success, false);
  }
  assert.equal(eventsSchema.safeParse([event, event]).success, false);
  assert.equal(eventSchema.safeParse(event).success, true);
});
test("events saved before the main banner option still show in the banner by default", () => {
  const { heroVisible, ...legacy } = event;
  assert.equal(heroVisible, undefined);
  assert.equal(eventSchema.parse(legacy).heroVisible, true);
  assert.equal(eventSchema.parse({ ...legacy, heroVisible: false }).heroVisible, false);
});
