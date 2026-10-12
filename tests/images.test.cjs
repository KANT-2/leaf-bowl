/* eslint-disable @typescript-eslint/no-require-imports */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const files = require("../infrastructure/images/files.ts");
const maintenance = require("../application/images.ts");
const store = require("../application/catalog.ts");
const eventStore = require("../application/events.ts");
const { setServicesForTests } = require("../application/container.ts");
const { customerSeed } = require("../seed/legacy/catalog.ts");
const { withDefaults } = require("./fixtures/settings.cjs");
const { POST } = require("../app/api/admin/images/route.ts");
const { GET } = require("../app/api/admin/images/[key]/route.ts");
const { readLimited } = require("../infrastructure/http/request.ts");
let directory, png, snapshot, events;
const originalDirectory = process.env.ADMIN_DATA_DIR;
const originalMaintenance = maintenance.maintainImages;
const originalRead = store.readCatalog;
const originalReadEvents = eventStore.readEvents;
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "leaf-bowl-images-"));
  process.env.ADMIN_DATA_DIR = directory;
  png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#00ff0080" } })
    .png()
    .toBuffer();
  snapshot = withDefaults({ catalog: customerSeed(), revision: 1, updatedAt: new Date().toISOString() });
  store.readCatalog = async () => snapshot;
  events = [];
  eventStore.readEvents = async () => ({ events, revision: 1 });
  maintenance.maintainImages = async () => {};
  setServicesForTests({
    identity: {
      resolve: async (token, kind) =>
        token === "test-admin" && kind === "admin" ? { adminUserId: "admin-test" } : null,
    },
  });
});
after(async () => {
  maintenance.maintainImages = originalMaintenance;
  store.readCatalog = originalRead;
  eventStore.readEvents = originalReadEvents;
  setServicesForTests(undefined);
  if (originalDirectory === undefined) {
    delete process.env.ADMIN_DATA_DIR;
  } else {
    process.env.ADMIN_DATA_DIR = originalDirectory;
  }
  await fs.rm(directory, { recursive: true, force: true });
});
function upload(bytes, cookie = "lb_admin=test-admin") {
  const form = new FormData();
  form.append("file", new File([bytes], "untrusted.bin", { type: "application/octet-stream" }));
  return new Request("http://localhost/api/admin/images", {
    method: "POST",
    body: form,
    headers: { cookie, origin: "http://localhost" },
  });
}

function imageRequest(key, cookie = "") {
  return GET(new Request("http://localhost/api/admin/images/" + key, { headers: { cookie } }), {
    params: Promise.resolve({ key }),
  });
}
test("full decoding accepts raster formats and strips metadata and appended payloads", async () => {
  for (const format of ["png", "jpeg", "webp"]) {
    const original = await sharp(png)
      .withExif({ IFD0: { Artist: "private-metadata" } })
      .toFormat(format)
      .toBuffer();
    const normalized = await files.normalizeImage(
      Buffer.concat([original, Buffer.from("private-trailing-payload")]),
      5 * 1024 * 1024,
    );
    const metadata = await sharp(normalized.bytes).metadata();
    assert.equal(metadata.format, format);
    assert.equal(metadata.exif, undefined);
    assert.equal(normalized.bytes.includes(Buffer.from("private-trailing-payload")), false);
  }
});
test("invalid signatures, SVG and excessive pixels are rejected before saving", async () => {
  for (const bytes of [
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
    Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/>"),
  ]) {
    await assert.rejects(files.normalizeImage(bytes, 5 * 1024 * 1024), (e) => e.status === 400);
  }
  const oversized = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } })
    .png()
    .toBuffer();
  await assert.rejects(files.normalizeImage(oversized, 5 * 1024 * 1024), (e) => e.status === 400);
  await assert.rejects(files.normalizeImage(Buffer.alloc(1025), 1024), (e) => e.status === 413);
});
test("admin upload enforces authority, body limits, form syntax and full image validation", async () => {
  assert.equal((await POST(upload(png, ""))).status, 401);
  const foreign = upload(png);
  foreign.headers.set("origin", "https://attacker.example");
  assert.equal((await POST(foreign)).status, 403);
  assert.equal(
    (
      await POST(
        new Request("http://localhost/api/admin/images", {
          method: "POST",
          headers: { cookie: "lb_admin=test-admin", "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
    400,
  );
  assert.equal((await POST(upload(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])))).status, 400);
  assert.equal((await POST(upload(Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
  const oversizedBody = upload(png);
  oversizedBody.headers.set("content-length", String(6 * 1024 * 1024 + 1));
  assert.equal((await POST(oversizedBody)).status, 413);
  const response = await POST(upload(png));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const url = (await response.json()).url;
  assert.match(url, /^\/api\/admin\/images\/[0-9a-f-]+\.png$/);
  const key = url.split("/").at(-1);
  assert.equal((await imageRequest(key)).status, 404);
  assert.equal((await imageRequest(key, "lb_admin=test-admin")).status, 200);
  snapshot.catalog.products[0].image = url;
  const published = await imageRequest(key);
  assert.equal(published.status, 200);
  assert.equal(published.headers.get("x-content-type-options"), "nosniff");
  assert.match(published.headers.get("cache-control"), /no-store/);
  snapshot.catalog.products[0].deleted = true;
  assert.equal((await imageRequest(key)).status, 404);
  const event = { id: "autumn", title: "가을", image: url, mobileImage: "", visible: false };
  events.push(event);
  assert.equal((await imageRequest(key)).status, 404);
  event.visible = true;
  assert.equal((await imageRequest(key)).status, 200);
  events.length = 0;
  assert.equal((await imageRequest("../secret.png")).status, 404);
});
test("atomic storage cleans partial writes and failed renames without publishing files", async () => {
  const write = fs.writeFile,
    rename = fs.rename;
  const beforeFiles = (await fs.readdir(path.join(directory, "images"))).sort();
  try {
    fs.writeFile = async (filename) => {
      await write(filename, "partial");
      throw Error("synthetic disk error");
    };
    await assert.rejects(files.saveImage({ bytes: png, ext: "png" }), /synthetic/);
    assert.deepEqual((await fs.readdir(path.join(directory, "images"))).sort(), beforeFiles);
    fs.writeFile = write;
    fs.rename = async () => {
      throw Error("synthetic rename error");
    };
    await assert.rejects(files.saveImage({ bytes: png, ext: "png" }), /synthetic/);
    assert.deepEqual((await fs.readdir(path.join(directory, "images"))).sort(), beforeFiles);
  } finally {
    fs.writeFile = write;
    fs.rename = rename;
  }
});
test("banner and season uploads are public only while their pages are visible", async () => {
  const key = await files.saveImage({ bytes: png, ext: "png" });
  const url = "/api/admin/images/" + key;
  snapshot.catalog.content.bannerPages = [
    { id: "banner", image: url, mobileImage: "", alt: "", href: "", visible: true },
  ];
  snapshot.catalog.content.bannerVisible = true;
  assert.equal((await imageRequest(key)).status, 200);
  snapshot.catalog.content.bannerPages[0].visible = false;
  assert.equal((await imageRequest(key)).status, 404);
  snapshot.catalog.content.heroImage = url;
  snapshot.catalog.content.bannerVisible = false;
  assert.equal((await imageRequest(key)).status, 404);
  snapshot.catalog.content.seasonImage = url;
  snapshot.catalog.content.seasonVisible = true;
  assert.equal((await imageRequest(key)).status, 200);
  snapshot.catalog.content.seasonVisible = false;
  assert.equal((await imageRequest(key)).status, 404);
  assert.equal((await imageRequest(key, "lb_admin=test-admin")).status, 200);
});
test("expired drafts and partial files are eligible while fresh/shared files are protected", async () => {
  const old = await files.saveImage({ bytes: png, ext: "png" });
  const shared = await files.saveImage({ bytes: png, ext: "png" });
  const fresh = await files.saveImage({ bytes: png, ext: "png" });
  const temp = "interrupted.png.uuid.tmp";
  await fs.writeFile(path.join(directory, "images", temp), "partial");
  const past = new Date(Date.now() - files.IMAGE_DRAFT_TTL_MS - 60_000);
  for (const key of [old, shared, temp]) {
    await fs.utimes(path.join(directory, "images", key), past, past);
  }
  const candidates = await files.expiredImageFiles(Date.now(), 1, new Set([shared]));
  assert.equal(candidates.length, 1);
  const all = await files.expiredImageFiles(Date.now(), 2000, new Set([shared]));
  assert.ok(all.includes(old));
  assert.ok(all.includes(temp));
  assert.ok(!all.includes(shared));
  assert.ok(!all.includes(fresh));
});
test("bounded body reads cancel oversized, stalled and aborted streams", async () => {
  let canceled = false;
  const stalled = new Request("http://localhost", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      cancel() {
        canceled = true;
      },
    }),
  });
  await assert.rejects(readLimited(stalled, 10, 15), (e) => e.status === 408);
  assert.equal(canceled, true);
  const controller = new AbortController();
  const aborted = new Request("http://localhost", {
    method: "POST",
    duplex: "half",
    signal: controller.signal,
    body: new ReadableStream(),
  });
  const pending = readLimited(aborted, 10);
  controller.abort();
  await assert.rejects(pending, (e) => e.status === 408);
  await assert.rejects(
    readLimited(new Request("http://localhost", { method: "POST", body: "12345" }), 4),
    (e) => e.constructor.name === "BodyTooLarge",
  );
});
