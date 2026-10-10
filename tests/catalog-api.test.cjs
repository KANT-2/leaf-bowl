/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
// Load the project's TypeScript domain modules without a second test toolchain.
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    filename,
  );
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return resolve.call(
    this,
    request.startsWith("@/")
      ? path.join(__dirname, "..", request.slice(2))
      : request,
    ...args,
  );
};

const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if(request === "next/server") return {connection: async()=>{}};
  return originalLoad.call(this,request,...args);
};
const store = require("../lib/admin/store.ts");
const routes={list:require("../app/api/products/route.ts"),detail:require("../app/api/products/[id]/route.ts"),patch:require("../app/api/admin/products/[id]/route.ts")};
Module._load = originalLoad;
const api=require("../lib/customer/api.ts");
const request=(body,origin="http://localhost")=>new Request("http://localhost/api/admin/products/salad-0",{method:"PATCH",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)});
const ctx=(id)=>({params:Promise.resolve({id})});

test("product APIs read catalog edits, validate the complete catalog and reject concurrent revision writes",async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"catalog-api-"));
  const previous=process.env.ADMIN_DATA_DIR;
  process.env.ADMIN_DATA_DIR=directory;
  const originalRead=store.readCatalog;
  try{
    assert.equal((await routes.patch.PATCH(request({price:18000,name:"동일 저장소 메뉴"}),ctx("salad-0"))).status,200);
    const detail=await routes.detail.GET(new Request("http://localhost/api/products/0"),ctx("0"));
    const data=await detail.json();assert.equal(data.price,18000);assert.equal(data.name,"동일 저장소 메뉴");
    const list=await (await routes.list.GET(new Request("http://localhost/api/products"))).json();
    assert.equal(list.items.find(p=>p.id===0).price,18000);
    assert.equal((await routes.patch.PATCH(request({category:"등록되지 않은 분류"}),ctx("salad-0"))).status,400);
    assert.equal((await routes.patch.PATCH(request({price:-1}),ctx("salad-0"))).status,400);
    assert.equal((await routes.patch.PATCH(request({price:19000},"http://external.test"),ctx("salad-0"))).status,403);
    let reads=0,release;const barrier=new Promise(resolve=>release=resolve);
    store.readCatalog=async()=>{const state=await originalRead();if(++reads===2)release();await barrier;return state};
    const simultaneous=await Promise.all([routes.patch.PATCH(request({price:19000}),ctx("salad-0")),routes.patch.PATCH(request({price:20000}),ctx("salad-0"))]);
    assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
    store.readCatalog=originalRead;
    assert.equal((await routes.patch.PATCH(request({status:"hidden"}),ctx("salad-0"))).status,200);
    assert.equal((await routes.detail.GET(new Request("http://localhost/api/products/0"),ctx("0"))).status,404);
  }finally{
    store.readCatalog=originalRead;
    if(previous===undefined)delete process.env.ADMIN_DATA_DIR;else process.env.ADMIN_DATA_DIR=previous;
    fs.rmSync(directory,{recursive:true,force:true});
  }
});

test("paging is bounded and review ordering compares actual times and filters hidden menu reviews",()=>{
  const {customerSeed}=require("../lib/admin/customer-seed.ts");
  const c=customerSeed();
  c.reviews=[{id:"later",productId:"salad-0",rating:5,author:"고객",title:"새 리뷰",body:"좋아요",date:"2026.10.10",createdAt:"2026-10-10T01:00:00Z",deleted:false},{id:"earlier",productId:"salad-0",rating:5,author:"고객",title:"이전 리뷰",body:"좋아요",date:"2026.10.10",createdAt:"2026-10-10T09:00:00+09:00",deleted:false}];
  assert.equal(api.productReviews(c,c.products[0],1,10).items[0].id,"later");
  c.products[0].status="hidden";assert.equal(api.home(c).latestReviews.length,0);
  assert.equal(api.parsePaging(new URLSearchParams("page="+"9".repeat(400))),null);
  assert.equal(api.parsePaging(new URLSearchParams("page=1.5")),null);
  assert.deepEqual(api.parsePaging(new URLSearchParams("page=2&size=5")),{page:2,size:5});
});
