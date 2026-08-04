import { describe, expect, test } from "bun:test"

const component = await Bun.file(import.meta.dir + "/xiaoxue-knowledge.tsx").text()
const styles = await Bun.file(import.meta.dir + "/settings-v2.css").text()

describe("xiaoxue knowledge settings layout", () => {
  test("uses a dedicated spaced content container", () => {
    expect(component).toContain('class="settings-v2-xiaoxue"')
    expect(styles).toContain(".settings-v2-xiaoxue {")
    expect(styles).toContain("gap: 36px;")
    expect(styles).toContain("padding: 32px 40px 40px;")
  })

  test("keeps Chinese titles and descriptions on a consistent line rhythm", () => {
    expect(styles).toContain('.settings-v2-xiaoxue [data-slot="settings-v2-row-title"]')
    expect(styles).toContain('.settings-v2-xiaoxue [data-slot="settings-v2-row-description"]')
    expect(styles).toContain("margin-block: 0;")
    expect(styles).toMatch(/\.settings-v2-xiaoxue \.settings-v2-section-title \{[^}]*line-height: 20px;/)
    expect(styles).toMatch(/\.settings-v2-xiaoxue \[data-slot="settings-v2-row-title"] \{[^}]*line-height: 20px;/)
    expect(styles).toMatch(/\.settings-v2-xiaoxue \[data-slot="settings-v2-row-description"] \{[^}]*line-height: 20px;/)
  })

  test("keeps the Vault picker button on one line", () => {
    expect(component).toContain('class="settings-v2-xiaoxue-vault-control"')
    expect(styles).toContain("grid-template-columns: minmax(0, 1fr) auto;")
    expect(styles).toContain("width: min(420px, 100%);")
    expect(styles).toContain("white-space: nowrap;")
  })

  test("keeps zero-configuration memory separate from optional Obsidian archival", () => {
    expect(component).toContain("小雪记得的内容")
    expect(component).toContain("记忆由小雪本机数据库独立管理，无需安装 Obsidian")
    expect(component).toContain("外部知识归档（可选）")
    expect(component).toContain("未安装、未连接或关闭它，都不会影响上方的小雪长期记忆")
    expect(component).toContain("xiaoxueMemory()")
  })

  test("places technical controls behind the advanced settings disclosure", () => {
    expect(component).toContain("aria-expanded={advanced()}")
    expect(component).toContain("记忆预算、外部知识归档与 Obsidian 集成")
    expect(component.indexOf("高级设置")).toBeLessThan(component.indexOf("总记忆预算"))
    expect(styles).toContain(".settings-v2-xiaoxue-advanced-trigger")
    expect(styles).toContain("@media (max-width: 720px)")
  })

  test("supports explicit correction and two-step forgetting", () => {
    expect(component).toContain("xiaoxueMemoryUpdate")
    expect(component).toContain("xiaoxueMemoryForget")
    expect(component).toContain("保存纠正")
    expect(component).toContain('forgetID() === entry.id ? "确认忘记" : "忘记"')
    expect(component).toContain("这条记忆将停止参与召回")
    expect(styles).toContain(".settings-v2-xiaoxue-memory-editor")
    expect(styles).toContain(".settings-v2-xiaoxue-manage-status")
  })

  test("shows version history and restores an older version as a new revision", () => {
    expect(component).toContain("xiaoxueMemoryHistory")
    expect(component).toContain("恢复此版本")
    expect(component).toContain("已将所选内容恢复为新的当前版本")
    expect(component).toContain("v{version.version}")
    expect(styles).toContain(".settings-v2-xiaoxue-history-item")
    expect(styles).toContain(".settings-v2-xiaoxue-history-content")
  })
})
