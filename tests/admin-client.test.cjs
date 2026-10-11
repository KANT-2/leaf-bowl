/* eslint-disable @typescript-eslint/no-require-imports */
const {test}=require("node:test");
const assert=require("node:assert/strict");
require("./register-typescript.cjs");
const {request}=require("../lib/admin/request.ts");

test("admin requests reject malformed success responses, conflicts, uploads and network errors",async()=>{
  const previous=global.fetch;
  try{
    global.fetch=async()=>Response.json({revision:2});
    assert.equal((await request("/catalog")).revision,2);
    global.fetch=async()=>new Response("<html></html>",{status:200});
    await assert.rejects(request("/catalog"),/서버 응답/);
    global.fetch=async()=>Response.json({error:"다른 관리자가 저장했습니다."},{status:409});
    await assert.rejects(request("/catalog"),/다른 관리자/);
    global.fetch=async()=>new Response("too large",{status:413});
    await assert.rejects(request("/upload"),/5MB/);
    global.fetch=async()=>{throw Error("offline")};
    await assert.rejects(request("/catalog"),/연결/);
  }finally{global.fetch=previous}
});
