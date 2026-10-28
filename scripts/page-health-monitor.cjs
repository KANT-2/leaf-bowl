/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const RETRY_MS = 6 * 60 * 60 * 1000;

function normalizeMessage(message = "") {
  return String(message)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split(/\r?\n/)[0]
    .replace(/https?:\/\/[^\s)]+/g, (url) => {
      try {
        const parsed = new URL(url);
        return parsed.origin + parsed.pathname;
      } catch {
        return url;
      }
    })
    .trim();
}

function collectErrors(report) {
  const errors = new Map();
  const cases = report.results ?? [];
  const inputs = cases.flatMap((result) => result.errors.map((error) => ({ ...error, page: result.page })));
  if (report.runtimeError) {
    inputs.push({ type: "runtime", message: report.runtimeError, page: "monitor" });
  }
  for (const error of inputs) {
    let url = "";
    if (error.url) {
      const parsed = new URL(error.url, report.base);
      url = parsed.origin + parsed.pathname;
    }
    const summary = {
      page: error.page,
      type: error.type,
      status: error.status ?? null,
      url,
      message: normalizeMessage(error.message),
    };
    const id = createHash("sha256").update(JSON.stringify(summary)).digest("hex");
    errors.set(id, { id, ...summary });
  }
  return [...errors.values()];
}

function planMonitor(report, previous = { active: {} }, now = Date.now()) {
  const errors = collectErrors(report);
  const old = previous.active;
  const active = Object.fromEntries(
    errors.map((error) => [
      error.id,
      {
        error,
        diagnosed: old[error.id]?.diagnosed ?? false,
        lastAttemptAt: old[error.id]?.lastAttemptAt ?? null,
        cleanScans: 0,
      },
    ]),
  );
  // 도구 자체가 실패하면 관찰하지 못한 페이지 오류를 복구됐다고 표시하지 않는다.
  if (report.runtimeError) {
    for (const [id, entry] of Object.entries(old)) {
      active[id] ??= entry;
    }
  } else {
    // 짧은 관찰 구간에서 응답을 놓친 한 번의 점검만으로 복구·재발을 반복 판정하지 않는다.
    for (const [id, entry] of Object.entries(old)) {
      if (!active[id] && (entry.cleanScans ?? 0) + 1 < 2) {
        active[id] = { ...entry, cleanScans: (entry.cleanScans ?? 0) + 1 };
      }
    }
  }
  const newErrors = errors.filter((error) => !old[error.id]);
  const recoveredErrors = Object.entries(old)
    .filter(([id]) => !active[id])
    .map(([, entry]) => entry.error);
  const toDiagnose = errors.filter((error) => {
    const entry = active[error.id];
    return !entry.diagnosed && (!entry.lastAttemptAt || now - Date.parse(entry.lastAttemptAt) >= RETRY_MS);
  });
  return { active, newErrors, recoveredErrors, toDiagnose };
}

async function loadState(report, root = path.resolve(__dirname, "../.data/page-health/state")) {
  const scope = JSON.stringify({ origin: new URL(report.base).origin, injected: !!report.injectedError });
  const key = createHash("sha256").update(scope).digest("hex").slice(0, 24);
  const filename = path.join(root, `${key}.json`);
  try {
    const state = JSON.parse(await fs.readFile(filename, "utf8"));
    if (
      state.version !== 1 ||
      state.scope !== scope ||
      !state.active ||
      typeof state.active !== "object" ||
      Array.isArray(state.active)
    ) {
      throw new Error("잘못된 감시 상태 파일입니다. 파일을 확인하세요.");
    }
    return { filename, state };
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    return { filename, state: { version: 1, scope, active: {} } };
  }
}

async function saveState(filename, state, plan, ai, directory, now = new Date().toISOString()) {
  if (ai.status === "success" || ai.status === "failed") {
    for (const error of plan.toDiagnose) {
      plan.active[error.id].lastAttemptAt = now;
      plan.active[error.id].diagnosed = ai.status === "success";
    }
  }
  const next = { ...state, active: plan.active, checkedAt: now, lastReport: directory, ai };
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(next, null, 2), "utf8");
    await fs.rename(temporary, filename);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

module.exports = { collectErrors, planMonitor, loadState, saveState, RETRY_MS };
