/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");

async function signInAdmin(context, base) {
  const response = await context.request.post(base + "/api/v1/auth/login", {
    data: {
      loginId: process.env.FRONT5_ADMIN_LOGIN_ID || "quality-admin",
      password: process.env.FRONT5_ADMIN_PASSWORD || "quality-password",
    },
  });
  assert.equal(response.status(), 200, await response.text());
}

module.exports = { signInAdmin };
