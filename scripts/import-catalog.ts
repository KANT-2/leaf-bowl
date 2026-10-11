import { loadEnvConfig } from "@next/env";
import { importCatalogFile } from "@/seed/import-catalog";
import { prisma } from "@/infrastructure/database/prisma";

loadEnvConfig(process.cwd());

async function main() {
  const filename = process.argv[2];
  if (!filename) throw new Error("사용법: npm run db:import -- /경로/catalog.json");
  const db = prisma();
  try {
    const result = await importCatalogFile(db, filename);
    console.log(result.imported ? `카탈로그 가져오기 완료: 상품 ${result.products}개, 리뷰 ${result.reviews}개, revision ${result.revision}` : "같은 파일을 이미 가져왔습니다. 현재 데이터를 보존했습니다.");
    console.log(`원본 백업: ${result.backup}`);
  } finally { await db.$disconnect(); }
}

main().catch(error => {
  // Prisma diagnostics may include SQL input. Keep connection credentials out of CLI logs.
  console.error(error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "DB 가져오기에 실패했습니다. 연결·마이그레이션을 확인해주세요.");
  process.exitCode = 1;
});
