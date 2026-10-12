import nextEnv from "@next/env";
import { spawnSync } from "node:child_process";

process.env.NODE_ENV = "test";
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
let name;
try {
  name = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
} catch {
  /* handled below */
}
if (!name || !/(?:^|[_-])test$/.test(name)) {
  console.error("test:db는 이름이 _test 또는 -test로 끝나는 전용 DB에서만 실행할 수 있습니다.");
  process.exit(1);
}
// Persistence suites share destructive test-DB setup; run them sequentially.
for (const suite of ["tests/postgres.integration.cjs", "tests/review-purchase.integration.cjs"]) {
  const result = spawnSync(process.execPath, ["--require", "./tests/register-typescript.cjs", "--test", suite], {
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
