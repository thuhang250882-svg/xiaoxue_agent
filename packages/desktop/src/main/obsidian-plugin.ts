import { app } from "electron"
import { existsSync } from "node:fs"
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { verifyBundledResource } from "./resource-integrity"

const PLUGIN_ID = "xiaoxue-assistant"
const FILES = ["manifest.json", "main.js", "styles.css"]
const DEFAULT_ARCHIVE_DIRECTORY = "06-日常工作管理/智能体协作"

export async function obsidianIntegrationStatus(vaultPath?: string) {
  const selected = vaultPath?.trim() || (await ensureDefaultObsidianVault())
  if (!selected || !path.isAbsolute(selected)) {
    return { available: false, pluginInstalled: false, vaultPath: selected }
  }
  const vault = path.resolve(selected)
  const available =
    (await stat(vault).catch(() => undefined))?.isDirectory() === true &&
    (await stat(path.join(vault, ".obsidian")).catch(() => undefined))?.isDirectory() === true
  const pluginInstalled =
    available &&
    (await stat(path.join(vault, ".obsidian", "plugins", PLUGIN_ID, "manifest.json")).catch(() => undefined))
      ?.isFile() === true
  return { available, pluginInstalled, vaultPath: vault }
}

export async function ensureDefaultObsidianVault(vaultPath?: string) {
  const requested = vaultPath?.trim() || process.env.XIAOXUE_OBSIDIAN_VAULT?.trim()
  const selected = requested || defaultVaultPath()
  if (!path.isAbsolute(selected)) throw new Error("默认知识库路径必须是绝对路径。")
  const initialized = await initializeObsidianVault(selected).catch((error) => {
    if (requested || selected !== "D:\\知识库") throw error
  })
  if (initialized) return initialized
  return initializeObsidianVault(path.join(app.getPath("documents"), "小雪知识库"))
}

async function initializeObsidianVault(vaultPath: string) {
  const vault = path.resolve(vaultPath)
  const archive = path.join(vault, DEFAULT_ARCHIVE_DIRECTORY)
  await Promise.all([mkdir(path.join(vault, ".obsidian"), { recursive: true }), mkdir(archive, { recursive: true })])
  await Promise.all([
    writeInitial(
      path.join(vault, "小雪知识库.md"),
      [
        "# 小雪知识库",
        "",
        "这是小雪智能助手的本地长期知识库。项目完成记录、可复用结论、重要决策、风险和验证结果统一归档到智能体协作区。",
        "",
        "## 入口",
        "",
        `- [[${DEFAULT_ARCHIVE_DIRECTORY}/智能体共享记忆索引|智能体共享记忆索引]]`,
        `- [[${DEFAULT_ARCHIVE_DIRECTORY}/小雪长期记忆|小雪长期记忆]]`,
        `- [[${DEFAULT_ARCHIVE_DIRECTORY}/小雪任务归档索引|小雪任务归档索引]]`,
        "",
      ].join("\n"),
    ),
    writeInitial(
      path.join(archive, "智能体共享记忆索引.md"),
      "# 智能体共享记忆索引\n\n- [[小雪长期记忆]]\n- [[小雪任务归档索引]]\n- [[小雪任务归档模板]]\n",
    ),
    writeInitial(
      path.join(archive, "小雪长期记忆.md"),
      "# 小雪长期记忆\n\n仅记录经过确认、可跨会话复用的用户偏好、项目约定、重要决策、风险与验证结论。\n",
    ),
    writeInitial(path.join(archive, "小雪任务归档索引.md"), "# 小雪任务归档索引\n\n"),
    writeInitial(path.join(archive, "小雪待审核归档索引.md"), "# 小雪待审核归档索引\n\n"),
    writeInitial(
      path.join(archive, "小雪任务归档模板.md"),
      "# 任务标题\n\n## 可复用结论\n\n## 涉及路径\n\n## 风险与决策\n\n## 验证结果\n",
    ),
  ])
  return vault
}

export async function installObsidianCompanion(vaultPath: string) {
  if (!path.isAbsolute(vaultPath)) return { success: false, message: "Vault 路径必须是绝对路径。" }
  const vault = path.resolve(vaultPath)
  if (!(await stat(vault).catch(() => undefined))?.isDirectory()) {
    return { success: false, message: "选择的 Obsidian Vault 不存在。" }
  }
  const obsidian = path.join(vault, ".obsidian")
  if (!(await stat(obsidian).catch(() => undefined))?.isDirectory()) {
    return { success: false, message: "所选目录不是有效的 Obsidian Vault（缺少 .obsidian）。" }
  }
  const source = app.isPackaged
    ? path.join(process.resourcesPath, "obsidian-plugin")
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../resources/obsidian-plugin")
  if (!(await stat(path.join(source, "manifest.json")).catch(() => undefined))?.isFile()) {
    return { success: false, message: "安装包中缺少小雪 Obsidian 伴侣插件资源。" }
  }
  verifyBundledResource("obsidian-plugin", source)
  const destination = path.join(obsidian, "plugins", PLUGIN_ID)
  await mkdir(destination, { recursive: true })
  await Promise.all(FILES.map((file) => copyFile(path.join(source, file), path.join(destination, file))))
  return {
    success: true,
    message: "插件已安装。请在 Obsidian 设置 → 第三方插件中启用“小雪智能助手”。",
  }
}

function defaultVaultPath() {
  if (process.platform === "win32" && existsSync("D:\\")) return "D:\\知识库"
  return path.join(app.getPath("documents"), "小雪知识库")
}

async function writeInitial(destination: string, content: string) {
  if ((await stat(destination).catch(() => undefined))?.isFile()) return
  await writeFile(destination, content, { encoding: "utf8", flag: "wx" }).catch((error) => {
    if (!alreadyExists(error)) throw error
  })
}

function alreadyExists(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST"
}
