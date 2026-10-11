/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sameOrigin } = require('../infrastructure/http/request.ts');

function configured(origin, fn) {
  const before = process.env.APP_ORIGIN;
  if (origin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = origin;
  try { fn(); } finally {
    if (before === undefined) delete process.env.APP_ORIGIN;
    else process.env.APP_ORIGIN = before;
  }
}
function request(origin, headers = {}) {
  return new Request('http://127.0.0.1:3100/api/v1/orders', { headers: { ...(origin ? { origin } : {}), ...headers } });
}
test('origin guard keeps local callers and refuses untrusted forwarded origins', () => configured(undefined, () => {
  assert.equal(sameOrigin(request()), true);
  assert.equal(sameOrigin(request('http://127.0.0.1:3100')), true);
  assert.equal(sameOrigin(request('https://app.example.test', { 'x-forwarded-host': 'app.example.test', 'x-forwarded-proto': 'https' })), false);
  assert.equal(sameOrigin(request('http://127.0.0.1:3100', { 'sec-fetch-site': 'cross-site' })), false);
}));
test('explicit public origin works through TLS proxy without accepting other sites or invalid settings', () => {
  configured('https://app.example.test', () => {
    assert.equal(sameOrigin(request('https://app.example.test', { host: '127.0.0.1:3100' })), true);
    assert.equal(sameOrigin(request('https://app.example.test', { 'sec-fetch-site': 'cross-site' })), false);
    for (const origin of ['http://app.example.test', 'https://attacker.example.test', 'https://app.example.test.attacker.test', 'https://app.example.test:444']) assert.equal(sameOrigin(request(origin)), false);
  });
  for (const setting of ['invalid', 'https://app.example.test/path', 'https://user:secret@app.example.test', 'ftp://app.example.test', 'https://app.example.test?query=1']) configured(setting, () => assert.equal(sameOrigin(request('https://app.example.test')), false));
});
