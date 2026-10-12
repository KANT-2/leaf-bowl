import { loadEnvConfig } from "@next/env";
import { pruneExpiredImages } from "@/application/images";
import { prisma } from "@/infrastructure/database/prisma";

async function main() {
  try {
    const result = await pruneExpiredImages(process.argv.includes("--apply"));
    console.log(JSON.stringify(result));
  } finally {
    await prisma().$disconnect();
  }
}

main().catch(() => {
  console.error("이미지 정리에 실패했습니다. DB 연결·파일 권한을 확인해주세요.");
  process.exitCode = 1;
});
loadEnvConfig(process.cwd());
