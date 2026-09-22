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

  test("shows the daily profile and catch-up review status", () => {
    expect(component).toContain("记忆与进化")
    expect(component).toContain("每日用户画像")
    expect(component).toContain("应用运行时每日 01:30；错过后首次使用补做")
    expect(component).toContain("nextReviewAt")
    expect(component).toContain("待复盘对话证据")
    expect(component).toContain("仅保存定位与内容哈希")
    expect(component).toContain("对话复盘批次待处理")
    expect(component).toContain("已停止自动重试")
    expect(component).toContain('review.status === "succeeded" ? "画像已更新" : "内容无变化，已跳过重写"')
    expect(component).toContain("profile().content")
    expect(styles).toContain(".settings-v2-xiaoxue-profile-content")
  })

  test("enables automatic Provider review while preserving a disable switch and legacy decisions", () => {
    expect(component).toContain("自动整理对话记忆")
    expect(component).toContain('daily_review: enabled ? "current_provider" : "disabled"')
    expect(component).toContain('checked={memory().daily_review !== "disabled"}')
    expect(component).toContain("每天由当前模型提炼稳定的个人偏好和项目约定并自动写入")
    expect(component).toContain("xiaoxueMemoryCandidate")
    expect(component).toContain("待处理的旧版候选")
    expect(component).toContain('source === "user-confirmed"')
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
