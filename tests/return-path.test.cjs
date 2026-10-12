/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { safeReturnPath } = require("../modules/shared/return-path.ts");

test("login return paths reject external URLs and browser-normalized authority escapes", () => {
  for (const value of [
    null,
    "",
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/\n/attacker.example",
    "/\r/attacker.example",
    "/\t/attacker.example",
    "/\u0000/attacker.example",
    "/\u007f/attacker.example",
    "javascript:alert(1)",
    " /menu",
    "/".repeat(2049),
  ]) {
    assert.equal(safeReturnPath(value), "/mypage", JSON.stringify(value));
  }
  for (const value of [
    "/menu",
    "/",
    "/menu?category=시그니처#reviews",
    "/orders/../mypage?tab=orders",
    "/menu?link=https://attacker.example",
    "/%2F%2Fattacker.example",
    "/%5Cattacker.example",
  ]) {
    const result = safeReturnPath(value);
    const parsed = new URL(result, "https://app.example");
    assert.equal(parsed.origin, "https://app.example");
    assert.equal(parsed.pathname + parsed.search + parsed.hash, result);
  }
  assert.equal(safeReturnPath("/menu?tab=salads#reviews"), "/menu?tab=salads#reviews");
});
