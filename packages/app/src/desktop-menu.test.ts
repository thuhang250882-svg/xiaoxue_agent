import { describe, expect, test } from "bun:test"
import { DESKTOP_MENU } from "./desktop-menu"

describe("desktop menu", () => {
  test("exports logs through the desktop command registry", () => {
    const items = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.labelKey === "desktop.menu.exportLogs",
    )

    expect(items).toHaveLength(2)
    expect(items.every((item) => item.type === "item" && item.command === "logs.export" && !item.action)).toBe(true)
  })

  test("provides translated labels for role-backed entries", () => {
    const windowMenu = DESKTOP_MENU.find((menu) => menu.role === "windowMenu")
    const roleItems = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).filter(
      (item) => item.type === "item" && item.role && item.labelKey,
    )

    expect(windowMenu?.labelKey).toBe("desktop.menu.window")
    expect(roleItems.length).toBeGreaterThan(0)
  })

  test("opens the enterprise knowledge library from the desktop menu", () => {
    const item = DESKTOP_MENU.flatMap((menu) => menu.items ?? []).find(
      (entry) => entry.type === "item" && entry.command === "knowledge.open",
    )

    expect(item).toMatchObject({
      type: "item",
      label: "企业知识库",
      command: "knowledge.open",
      accelerator: { macos: "Cmd+Shift+K", windows: "Ctrl+Shift+K" },
    })
  })
})
