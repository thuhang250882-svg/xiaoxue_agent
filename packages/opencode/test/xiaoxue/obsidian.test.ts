import { afterEach, describe, expect, test } from "bun:test"
import { XiaoxueObsidian } from "../../src/xiaoxue/obsidian"
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const directories: string[] = []
const originalVault = process.env.XIAOXUE_OBSIDIAN_VAULT

afterEach(async () => {
  if (originalVault === undefined) delete process.env.XIAOXUE_OBSIDIAN_VAULT
  if (originalVault !== undefined) process.env.XIAOXUE_OBSIDIAN_VAULT = originalVault
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe("Xiaoxue Obsidian integration", () => {
  test("searches and reads Markdown notes with WikiLinks", async () => {
    const vault = await temp()
    await Bun.write(
      path.join(vault, "项目说明.md"),
      ["---", "title: 小雪项目", "---", "# 小雪项目", "记忆预算为 6000 token。", "[[验证记录]]"].join("\n"),
    )

    const result = await XiaoxueObsidian.search("记忆预算", config(vault))
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0]).toMatchObject({ path: "项目说明.md", title: "小雪项目", wikiLinks: ["验证记录"] })

    expect(await XiaoxueObsidian.read(result.hits[0].path, config(vault))).toMatchObject({
      title: "小雪项目",
      truncated: false,
    })
  })

  test("excludes internal directories and rejects traversal", async () => {
    const vault = await temp()
    await mkdir(path.join(vault, ".obsidian"), { recursive: true })
    await Bun.write(path.join(vault, ".obsidian", "secret.md"), "# 不应读取\n隐藏设置")

    expect((await XiaoxueObsidian.search("隐藏设置", config(vault))).hits).toHaveLength(0)
    await expect(XiaoxueObsidian.read("../outside.md", config(vault))).rejects.toThrow("超出 Vault")
  })

  test("publishes approved outcomes and updates the formal WikiLink index", async () => {
    const vault = await temp()
    const result = await XiaoxueObsidian.archive(
      {
        title: "记忆与 Obsidian 闭环",
        content: "## 验证结果\n\n定向测试通过。",
        project: "E:\\software programming\\opencode-dev",
        sessionID: "ses_test",
      },
      config(vault),
    )

    expect(result).toMatchObject({ status: "published" })
    expect(result.path).toStartWith("智能体协作/")
    expect(await Bun.file(path.join(vault, result.path)).text()).toContain("status: published")
    expect(await Bun.file(path.join(vault, "智能体协作", "小雪任务归档索引.md")).text()).toContain(result.wikiLink)
  })

  test("keeps automatic archives in a review queue and blocks sensitive content", async () => {
    const vault = await temp()
    const draft = await XiaoxueObsidian.archive(
      {
        title: "待审核结论",
        content: "验证通过，等待知识管理员审核。",
        sessionID: "ses_draft",
        status: "pending_review",
        sources: ["测试报告：report-001"],
      },
      config(vault),
    )

    expect(draft).toMatchObject({ status: "pending_review" })
    expect(draft.path).toStartWith("智能体协作/待审核/")
    expect(await Bun.file(path.join(vault, "智能体协作", "小雪待审核归档索引.md")).text()).toContain(
      draft.wikiLink,
    )
    await expect(
      XiaoxueObsidian.archive(
        {
          title: "敏感内容",
          content: "password=super-secret",
          sessionID: "ses_sensitive",
        },
        config(vault),
      ),
    ).rejects.toThrow("可能包含敏感信息")
  })

  test("creates a portable default vault with long-term memory entrypoints", async () => {
    const root = await temp()
    const vault = path.join(root, "新用户知识库")
    const existing = path.join(vault, "06-日常工作管理", "智能体协作", "小雪长期记忆.md")
    await mkdir(path.dirname(existing), { recursive: true })
    await Bun.write(existing, "# 用户已有长期记忆\n")
    process.env.XIAOXUE_OBSIDIAN_VAULT = vault

    expect(await XiaoxueObsidian.status()).toMatchObject({
      enabled: true,
      available: true,
      vaultPath: vault,
      archiveDirectory: "06-日常工作管理/智能体协作",
    })
    expect((await stat(path.join(vault, ".obsidian"))).isDirectory()).toBeTrue()
    expect(await Bun.file(path.join(vault, "小雪知识库.md")).text()).toContain("智能体共享记忆索引")
    expect(await Bun.file(existing).text()).toBe("# 用户已有长期记忆\n")
    expect(
      await Bun.file(path.join(vault, "06-日常工作管理", "智能体协作", "小雪任务归档模板.md")).text(),
    ).toContain("验证结果")
  })
})

function config(vaultPath: string) {
  return {
    enabled: true,
    vault_path: vaultPath,
    archive_directory: "智能体协作",
    archive_mode: "auto" as const,
    exclude_patterns: [],
    search_limit: 8,
  }
}

async function temp() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-obsidian-"))
  directories.push(directory)
  return directory
}
