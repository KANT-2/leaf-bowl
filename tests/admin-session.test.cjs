/* eslint-disable @typescript-eslint/no-require-imports */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { redirectIfAdminUnauthorized } = require('../lib/admin/session-client.ts');
const { request } = require('../lib/admin/request.ts');
const originalFetch = global.fetch;
const originalWindow = global.window;
after(() => { global.fetch = originalFetch; if (originalWindow === undefined) delete global.window; else global.window = originalWindow; });
function location(pathname = '/admin') {
  const destinations = [];
  global.window = { location: { pathname, replace: value => destinations.push(value) } };
  return destinations;
}
test('401 redirects before body parsing for load, save and image upload', async () => {
  const destinations = location();
  global.fetch = async () => ({ status: 401, json: () => { throw new Error('must not parse'); } });
  for (const [url, init] of [['/api/admin/catalog'], ['/api/admin/catalog', { method: 'PUT' }], ['/api/admin/images', { method: 'POST' }]]) {
    await assert.rejects(request(url, init), /로그인이 필요합니다/);
  }
  assert.deepEqual(destinations, ['/admin/login', '/admin/login', '/admin/login']);
});
test('401 on the login page does not create a redirect loop', () => {
  const destinations = location('/admin/login');
  assert.throws(() => redirectIfAdminUnauthorized({ status: 401 }), /로그인이 필요합니다/);
  assert.deepEqual(destinations, []);
});
test('success, permission errors and server errors do not navigate', async () => {
  const destinations = location();
  global.fetch = async () => Response.json({ revision: 7 });
  assert.equal((await request('/api/admin/catalog')).revision, 7);
  for (const status of [403, 500]) {
    global.fetch = async () => Response.json({ error: '기존 오류 안내' }, { status });
    await assert.rejects(request('/api/admin/catalog'), /기존 오류 안내/);
  }
  assert.deepEqual(destinations, []);
});
test('network failure keeps connection error and does not navigate', async () => {
  const destinations = location();
  global.fetch = async () => { throw new TypeError('network'); };
  await assert.rejects(request('/api/admin/catalog'), /연결을 확인/);
  assert.deepEqual(destinations, []);
});
test('a cancelled request does not navigate even if a late 401 arrives', async () => {
  const destinations = location();
  const controller = new AbortController();
  controller.abort();
  global.fetch = async () => Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  await assert.rejects(request('/api/admin/catalog', { signal: controller.signal }));
  assert.deepEqual(destinations, []);
});
