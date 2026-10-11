import { lstat, readlink, rm, symlink, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const RETRY_MS = 50;
const MAX_ATTEMPTS = 100;
const LEGACY_GRACE_MS = 60_000;
const pause = () => new Promise((resolve) => setTimeout(resolve, RETRY_MS));

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== "ESRCH"; }
}

async function owner(lock: string): Promise<{ token: string; stale: boolean } | null> {
  try {
    const stat = await lstat(lock);
    if (stat.isSymbolicLink()) {
      const token = await readlink(lock);
      const pid = Number(token.split(":")[0]);
      return { token, stale: Number.isInteger(pid) && pid > 0 && !alive(pid) };
    }
    // 기존 버전의 비어 있는 디렉터리 잠금만 유예 시간 후 복구한다.
    return { token: `legacy:${stat.ino}:${stat.mtimeMs}`, stale: stat.isDirectory() && Date.now() - stat.mtimeMs > LEGACY_GRACE_MS && !(await readdir(lock)).length };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** 로컬 파일 저장소용 프로세스 잠금. 소유자 PID는 symlink 생성과 함께 원자적으로 기록된다. */
async function acquire(lock: string): Promise<() => Promise<void>> {
  const token = `${process.pid}:${crypto.randomUUID()}`;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await symlink(token, lock);
      return async () => {
        if ((await owner(lock))?.token === token) await rm(lock, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const previous = await owner(lock);
    if (previous?.stale) {
      // 같은 죽은 소유자를 두 프로세스가 동시에 제거하지 않도록 복구 자체도 잠근다.
      // 복구 프로세스가 종료된 경우에도 이 잠금에 동일한 복구 규칙을 적용한다.
      const releaseRecovery = await acquire(lock + ".recovery");
      try {
        const current = await owner(lock);
        if (current?.token === previous.token && current.stale) await rm(lock, { recursive: true, force: true });
      } finally { await releaseRecovery(); }
      continue;
    }
    await pause();
  }
  throw Error("다른 저장 작업이 진행 중입니다. 잠시 후 다시 시도해주세요.");
}

export async function withFileLock<T>(directory: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(directory, { recursive: true });
  const release = await acquire(path.join(directory, ".lock"));
  try { return await fn(); }
  finally { await release(); }
}
