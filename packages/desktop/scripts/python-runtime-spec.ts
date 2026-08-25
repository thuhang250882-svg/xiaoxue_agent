import { readFileSync } from "node:fs"

const SEMVER_RE = /^\d+\.\d+\.\d+$/

/**
 * 解析 PYTHON_VERSION 并 fail closed。任何读取失败或格式错误都视作硬错,
 * 因为 prepare / verify / install-checklist 全链路必须基于同一份 spec 决策。
 */
export function loadPinnedPythonVersion(specPath: string): string {
  let raw = ""
  try {
    raw = readFileSync(specPath, "utf8")
  } catch {
    throw new Error(`Bundled Python runtime spec missing: ${specPath}`)
  }
  const trimmed = raw.trim()
  if (!SEMVER_RE.test(trimmed)) {
    throw new Error(`Bundled Python runtime spec malformed: '${trimmed}' (expected X.Y.Z) at ${specPath}`)
  }
  return trimmed
}

/** 比对 actual vs pinned, 不匹配即抛错。actual 形如 "3.14.4"。 */
export function assertPythonVersion(actual: string, pinned: string, sourceHint: string): void {
  if (actual !== pinned) {
    throw new Error(
      `Bundled Python version mismatch: actual=${actual} but PYTHON_VERSION pins ${pinned}. ` +
        `${sourceHint}`,
    )
  }
}
