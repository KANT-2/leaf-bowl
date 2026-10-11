import { loadEnvConfig } from "@next/env";
import { databaseTransaction, prisma } from "@/lib/prisma";
import { customerSeed } from "@/lib/admin/customer-seed";
import { saveCatalogState } from "@/lib/admin/postgres-catalog";
import { hashPassword } from "@/modules/identity/crypto";

loadEnvConfig(process.cwd());

async function main() {
  const db = prisma();
  try {
    const seeded = await databaseTransaction(db, async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(910000)::text`;
      if (await tx.catalogMeta.findUnique({ where: { id: 1 } })) return false;
      await saveCatalogState(tx, { catalog: customerSeed(), revision: 1, updatedAt: new Date().toISOString(), nextCustomerId: 12, deletedReviewIds: [] });
      return true;
    });
    console.log(seeded ? "기본 카탈로그를 저장했습니다." : "기존 카탈로그를 보존했습니다.");
    const loginId = process.env.ADMIN_LOGIN_ID;
    const password = process.env.ADMIN_PASSWORD;
    if (loginId || password) {
      if (!loginId || !password || !loginId.trim() || loginId.length > 50 || password.length > 200) throw new Error("ADMIN_LOGIN_ID와 ADMIN_PASSWORD를 모두 올바르게 설정해주세요.");
      const passwordHash = await hashPassword(password);
      await db.adminUser.upsert({ where: { loginId }, create: { loginId, passwordHash }, update: {} });
      console.log("관리자 계정을 준비했습니다. 기존 비밀번호는 변경하지 않았습니다.");
    } else {
      console.log("관리자 추가: ADMIN_LOGIN_ID와 ADMIN_PASSWORD를 설정한 뒤 db:seed를 다시 실행하세요.");
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => { console.error("DB 초기화에 실패했습니다. DB 연결·마이그레이션과 관리자 환경변수를 확인해주세요."); process.exitCode = 1; });
