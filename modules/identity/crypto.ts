import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/** 쿠키에 담는 원본 토큰. DB 에는 hashToken 결과만 저장한다 (sessions.token_hash VARCHAR(64)). */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 로그인 시도 제한 칸의 수. 아이디를 이 개수의 칸으로 해시해서, 아무 아이디나 보내도 제한기의 키가 늘지 않는다 */
export const LOGIN_BUCKETS = 1024;

/**
 * 로그인 시도 제한에 쓰는 키. **계정이 존재하는지와 무관하게** 아이디만으로 정해진다.
 * (존재 여부에 따라 칸을 나누면 모르는 아이디와 실제 계정의 429/401 응답이 달라져 계정 존재 여부가 드러난다.)
 */
export function loginRateKey(loginId: string): string {
  const digest = createHash("sha256").update(loginId.trim().toLowerCase()).digest();
  return `account:${digest.readUInt32BE(0) % LOGIN_BUCKETS}`;
}

const KEY_LENGTH = 64;
// 형식: scrypt$<salt base64>$<hash base64>  (admin_users.password_hash VARCHAR(255) 안에 들어간다)
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, (err, key) =>
      err ? reject(err) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = await derive(password, Buffer.from(saltB64, "base64"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
