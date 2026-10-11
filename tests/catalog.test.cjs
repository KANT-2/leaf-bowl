/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
require("./register-typescript.cjs");
const {
  customerSeed,
  migrateCatalog,
} = require("../lib/admin/customer-seed.ts");
const { catalogSchema } = require("../lib/admin/catalog.ts");
const { customerCatalog } = require("../lib/customer/catalog.ts");
const { PRODUCTS } = require("../data/products.ts");
const snapshot = (catalog) => ({
  catalog,
  revision: 1,
  updatedAt: new Date().toISOString(),
});
test("customer data seeds valid admin data without changing product URLs", () => {
  const seed = customerSeed();
  catalogSchema.parse(seed);
  const data = customerCatalog(snapshot(seed));
  assert.equal(data.visibleProducts.length, PRODUCTS.length);
  for (const p of PRODUCTS) {
    const actual = data.getProduct(p.id);
    assert.equal(actual.name, p.name);
    assert.equal(actual.price, p.price);
    assert.equal(actual.imageUrl, p.imageUrl);
    assert.equal(actual.description, p.description);
    assert.deepEqual(actual.allergens, p.allergens);
  }
  assert.ok(data.reviews.length > 0);
  assert.ok(data.ingredients.length > 0);
});
test("edits, visibility, new stable IDs, options and cart prices share one snapshot", () => {
  const seed = customerSeed();
  seed.products[0].name = "수정 메뉴";
  seed.products[0].price = 15000;
  seed.products[0].status = "soldout";
  seed.products[1].status = "hidden";
  seed.products[2].deleted = true;
  seed.products.push({
    ...seed.products[0],
    id: "new-salad",
    customerId: undefined,
    status: "active",
  });
  const migrated = migrateCatalog(seed);
  const data = customerCatalog(snapshot(migrated));
  assert.equal(data.getProduct(0).name, "수정 메뉴");
  assert.equal(data.getProduct(0).price, 15000);
  assert.equal(data.getProduct(1), undefined);
  assert.equal(data.getProduct(2), undefined);
  const next = migrated.products.at(-1);
  assert.equal(next.customerId, 12);
  assert.equal(migrateCatalog(migrated).products.at(-1).customerId, 12);
  assert.equal(
    data.itemAvailable({ id: 0, dressing: 0, drinks: [], qty: 1 }),
    false,
  );
  migrated.products[0].status = "active";
  migrated.products.find((p) => p.id === "drink-0").price = 5000;
  let latest = customerCatalog(snapshot(migrated));
  const item = {
    id: 0,
    dressing: 0,
    drinks: [0],
    qty: 1,
    optionSelections: { dressing: ["dressing-0"], drinks: ["drink-0"] },
  };
  assert.equal(latest.itemUnitPrice(item), 20000);
  assert.equal(latest.itemAvailable(item), true);
  migrated.products.find((p) => p.id === "drink-0").status = "hidden";
  latest = customerCatalog(snapshot(migrated));
  assert.equal(latest.itemAvailable(item), false);
});
test("persistent edits survive restart; revision conflicts and review moderation are shared", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "front5-catalog-"));
  process.env.ADMIN_DATA_DIR = directory;
  try {
    const {
      readCatalog,
      writeCatalog,
      appendCustomerReview,
    } = require("../lib/admin/store.ts");
    const initial = await readCatalog();
    initial.catalog.products[0].price = 16000;
    const saved = await writeCatalog(initial.catalog, initial.revision);
    assert.equal(saved.revision, 2);
    assert.equal((await readCatalog()).catalog.products[0].price, 16000);
    assert.equal(await writeCatalog(initial.catalog, 1), null);
    const reviewed = await appendCustomerReview({
      id: "test-review",
      pid: 0,
      author: "고객",
      stars: 5,
      title: "좋은 메뉴",
      text: "고객과 관리자 화면에서 함께 확인할 리뷰입니다.",
      via: "delivery",
    });
    assert.ok(
      customerCatalog(reviewed).reviews.some((r) => r.id === "test-review"),
    );
    reviewed.catalog.reviews.find((r) => r.id === "test-review").deleted = true;
    const moderated = await writeCatalog(reviewed.catalog, reviewed.revision);
    assert.ok(
      !customerCatalog(moderated).reviews.some((r) => r.id === "test-review"),
    );
    const replay=await appendCustomerReview({id:'test-review',pid:0,author:'고객',stars:5,title:'좋은 메뉴',text:'이관 과정에서 삭제한 리뷰가 다시 등록되지 않아야 합니다.',via:'delivery'});
    assert.equal(replay.revision,moderated.revision);
    assert.ok(!customerCatalog(replay).reviews.some(r=>r.id==='test-review'));
    const old = {
      catalog: customerSeed(),
      revision: 8,
      updatedAt: new Date().toISOString(),
    };
    old.catalog.products[0].name = "기존 수정 보존";
    fs.writeFileSync(path.join(directory, "catalog.json"), JSON.stringify(old));
    const migrated = await readCatalog();
    assert.equal(migrated.catalog.products[0].name, "기존 수정 보존");
    assert.equal(migrated.revision, 9);
    assert.ok(fs.existsSync(path.join(directory, "catalog.v1.backup.json")));
  } finally {
    delete process.env.ADMIN_DATA_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("custom options, new-item cart persistence and public visibility are consistent", () => {
  const seed = customerSeed();
  seed.groups.push({
    id: "custom",
    name: "추가 토핑",
    source: "custom",
    required: true,
    multiple: true,
    deleted: false,
    choices: [
      {
        id: "12345678-1234-1234-1234-123456789012",
        name: "추가 토핑",
        price: 700,
      },
    ],
  });
  seed.products[0].optionIds.push("custom");
  let data = customerCatalog(snapshot(seed));
  const item = data.defaultItem(0);
  assert.ok(item);
  assert.equal(data.itemUnitPrice(item), 11600);
  assert.equal(data.itemAvailable(item), true);
  seed.groups.at(-1).choices[0].price = 1000;
  data = customerCatalog(snapshot(seed));
  assert.equal(data.itemUnitPrice(item), 11900);
  seed.groups.at(-1).deleted = true;
  assert.equal(customerCatalog(snapshot(seed)).itemAvailable(item), false);
  seed.products[1].status = "hidden";
  seed.reviews[0].deleted = true;
  const { publicSnapshot } = require("../lib/customer/catalog.ts");
  const publicData = publicSnapshot(snapshot(seed));
  assert.equal(publicData.catalog.products[1].name, "");
  assert.ok(
    !publicData.catalog.reviews.some((r) => r.id === seed.reviews[0].id),
  );
  const storage = require("../lib/storage.ts");
  const memory = new Map();
  global.localStorage = {
    setItem: (key, value) => memory.set(key, value),
    getItem: (key) => memory.get(key) ?? null,
  };
  try {
    storage.saveCart([{ ...item, id: 12 }]);
    const restored = storage.loadCart();
    assert.equal(restored[0].id, 12);
    assert.deepEqual(restored[0].optionSelections, item.optionSelections);
  } finally {
    delete global.localStorage;
  }
});

test("permanently removed product IDs are not reused after a review write", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "front5-purge-"));
  const previous = process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR = directory;
  try {
    const { readCatalog, writeCatalog, appendCustomerReview } = require("../lib/admin/store.ts");
    let state = await readCatalog();
    const prototype = state.catalog.products.find(p=>p.type==="salad");
    state = await writeCatalog({...state.catalog,products:[...state.catalog.products,{...prototype,id:"new-first"}]},state.revision);
    const firstId = state.catalog.products.find(p=>p.id==="new-first").customerId;
    state = await writeCatalog({...state.catalog,products:state.catalog.products.filter(p=>p.id!=="new-first")},state.revision);
    state = await appendCustomerReview({id:"purge-regression",pid:0,author:"고객",stars:5,title:"저장 확인",text:"영구 삭제 이후 상품 번호가 유지되는지 확인합니다.",via:"delivery"});
    state = await readCatalog();
    state = await writeCatalog({...state.catalog,products:[...state.catalog.products,{...prototype,id:"new-second"}]},state.revision);
    assert.ok(state.catalog.products.find(p=>p.id==="new-second").customerId > firstId);
  } finally {
    if(previous===undefined)delete process.env.ADMIN_DATA_DIR;else process.env.ADMIN_DATA_DIR=previous;
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('allergen suggestions use registered ingredients and flag unknown names',()=>{
 const {ingredientAllergens}=require('../lib/admin/allergens.ts');
 const ingredients=[{name:'탱글한 새우',allergens:'새우',deleted:false},{name:'방울토마토',allergens:'토마토, 새우',deleted:false},{name:'우유',allergens:'우유',deleted:true}];
 assert.deepEqual(ingredientAllergens('새우 · 방울토마토, 새우\n미등록 재료',ingredients),{allergens:'새우, 토마토',unknown:['미등록 재료']});
 assert.deepEqual(ingredientAllergens('우유',ingredients),{allergens:'',unknown:['우유']});
 assert.deepEqual(ingredientAllergens('',ingredients),{allergens:'',unknown:[]});
});

test('origin details survive catalog validation and persistent storage',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'front5-origins-'));
 const previous=process.env.ADMIN_DATA_DIR;process.env.ADMIN_DATA_DIR=directory;
 try{
  const {catalogSchema}=require('../lib/admin/catalog.ts');
  const {readCatalog,writeCatalog}=require('../lib/admin/store.ts');
  let state=await readCatalog();
  const ingredients=state.catalog.ingredients.map((i,index)=>index===0?{...i,origin:'국내산',originDetail:'충청남도',allergens:'대두, 우유'}:i);
  const validated=catalogSchema.parse({...state.catalog,ingredients});
  await writeCatalog(validated,state.revision);state=await readCatalog();
  assert.equal(state.catalog.ingredients[0].origin,'국내산');
  assert.equal(state.catalog.ingredients[0].originDetail,'충청남도');
  assert.equal(state.catalog.ingredients[0].allergens,'대두, 우유');
 }finally{if(previous===undefined)delete process.env.ADMIN_DATA_DIR;else process.env.ADMIN_DATA_DIR=previous;fs.rmSync(directory,{recursive:true,force:true});}
});

test('permanently deleted reviews stay removed after reload and later saves', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'front5-review-purge-'));
  const previous = process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR = directory;
  try {
    const { readCatalog, writeCatalog } = require('../lib/admin/store.ts');
    let state = await readCatalog();
    const target = state.catalog.reviews[0];
    const otherIds = state.catalog.reviews.slice(1).map(r => r.id);
    state = await writeCatalog({ ...state.catalog, reviews: state.catalog.reviews.map(r => r.id === target.id ? { ...r, deleted: true } : r) }, state.revision);
    state = await writeCatalog({ ...state.catalog, reviews: state.catalog.reviews.filter(r => r.id !== target.id) }, state.revision);
    state = await readCatalog();
    assert.ok(!state.catalog.reviews.some(r => r.id === target.id));
    assert.deepEqual(state.catalog.reviews.map(r => r.id), otherIds);
    state = await writeCatalog(state.catalog, state.revision);
    assert.ok(!(await readCatalog()).catalog.reviews.some(r => r.id === target.id));
    state = await writeCatalog({ ...state.catalog, reviews: [] }, state.revision);
    assert.deepEqual((await readCatalog()).catalog.reviews, []);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_DATA_DIR;
    else process.env.ADMIN_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('purged review retries cannot restore content and deletion IDs remain internal', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'front5-review-retry-'));
  const previous = process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR = directory;
  try {
    const { readCatalog, writeCatalog, appendCustomerReview } = require('../lib/admin/store.ts');
    const payload = { id: 'purged-retry', pid: 0, author: '검증', stars: 5, title: '삭제 대상', text: '삭제할 본문', via: 'delivery' };
    let state = await appendCustomerReview(payload);
    const removedReview = state.catalog.reviews.find(r => r.id === payload.id);
    state = await writeCatalog({ ...state.catalog, reviews: state.catalog.reviews.filter(r => r.id !== payload.id) }, state.revision);
    const revision = state.revision;
    state = await appendCustomerReview(payload);
    assert.equal(state.revision, revision);
    assert.ok(!state.catalog.reviews.some(r => r.id === payload.id));
    assert.ok(!('deletedReviewIds' in state));
    state = await appendCustomerReview({ ...payload, id: 'fresh-review' });
    assert.ok(state.catalog.reviews.some(r => r.id === 'fresh-review'));
    state = await writeCatalog({ ...state.catalog, reviews: [...state.catalog.reviews, removedReview] }, state.revision);
    assert.ok(!state.catalog.reviews.some(r => r.id === payload.id));
    const { reviews: omittedReviews, ...withoutReviews } = state.catalog;
    assert.ok(omittedReviews.length);
    state = await writeCatalog(withoutReviews, state.revision);
    assert.ok(state.catalog.reviews.some(r => r.id === 'fresh-review'));
    state = await readCatalog();
    assert.ok(!('deletedReviewIds' in state));
    const disk = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
    assert.ok(disk.deletedReviewIds.includes(payload.id));
    assert.ok(!disk.catalog.reviews.some(r => r.id === payload.id));
    state = await appendCustomerReview(payload);
    assert.ok(!state.catalog.reviews.some(r => r.id === payload.id));
    state = await writeCatalog({ ...state.catalog, reviews: state.catalog.reviews.map(r => r.id === 'fresh-review' ? { ...r, deleted: true } : r) }, state.revision);
    state = await writeCatalog({ ...state.catalog, reviews: state.catalog.reviews.map(r => r.id === 'fresh-review' ? { ...r, deleted: false } : r) }, state.revision);
    assert.equal(state.catalog.reviews.find(r => r.id === 'fresh-review').deleted, false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_DATA_DIR;
    else process.env.ADMIN_DATA_DIR = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});


test("review retries keep an ID and duplicated/deleted requests leave no orphan photos", async () => {
  const { createReviewSubmission } = require("../lib/review-submission.ts");
  const submit = createReviewSubmission();
  const draft = { pid: 0, author: "익명", stars: 5, title: "맛있어요", text: "아주 신선하고 맛있어요.", via: "delivery" };
  const photo = "data:image/png;base64," + Buffer.from([137,80,78,71,13,10,26,10,1]).toString("base64");
  const first = submit(draft, [photo]);
  assert.equal(submit(draft, [photo]).id, first.id);
  assert.notEqual(submit({ ...draft, text: "수정한 새로운 리뷰 내용입니다." }, [photo]).id, first.id);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "review-retry-"));
  const oldDirectory = process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR = directory;
  try {
    const { POST } = require("../app/api/reviews/route.ts");
    const { readCatalog, writeCatalog } = require("../lib/admin/store.ts");
    const request = () => new Request("http://localhost/api/reviews", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ ...first, photos: [photo] }) });
    const results = await Promise.all([POST(request()), POST(request())]);
    assert.deepEqual(results.map((r) => r.status), [200, 200]);
    let state = await readCatalog();
    assert.equal(state.catalog.reviews.filter((r) => r.id === first.id).length, 1);
    assert.equal(fs.readdirSync(path.join(directory, "images")).length, 1);
    const existingImages = fs.readdirSync(path.join(directory, "images"));
    state.catalog.reviews = state.catalog.reviews.filter((r) => r.id !== first.id);
    await writeCatalog(state.catalog, state.revision);
    assert.equal((await POST(request())).status, 200);
    assert.deepEqual(fs.readdirSync(path.join(directory, "images")), existingImages);
  } finally {
    if (oldDirectory === undefined) delete process.env.ADMIN_DATA_DIR;
    else process.env.ADMIN_DATA_DIR = oldDirectory;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("local review migration retries failures, acknowledges success and cancels pending work", async () => {
  const { startReviewMigration } = require("../lib/review-migration.ts");
  const migrated = new Set();
  let sends = 0;
  let refreshes = 0;
  const cancel = startReviewMigration([{ id: "local" }], migrated, async () => ++sends > 1, () => refreshes++);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  cancel();
  assert.equal(sends, 2);
  assert.ok(migrated.has("local"));
  assert.equal(refreshes, 1);
  const cancelFailure = startReviewMigration([{ id: "offline" }], migrated, async () => { throw Error("offline"); }, () => assert.fail("failed migration refreshed"));
  await new Promise((resolve) => setImmediate(resolve));
  cancelFailure();
  assert.ok(!migrated.has("offline"));
});
