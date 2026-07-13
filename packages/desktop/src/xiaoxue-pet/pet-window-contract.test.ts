import { describe, expect, test } from "bun:test"

const source = await Bun.file(new URL("./XiaoxuePetWindow.tsx", import.meta.url)).text()
const mainSource = await Bun.file(new URL("./main.ts", import.meta.url)).text()

describe("xiaoxue desktop pet shell", () => {
  test("uses one persistent 3D renderer and one conditional chat input", () => {
    expect(source.match(/<XiaoxueModel/g)?.length).toBe(1)
    expect(source.match(/<textarea/g)?.length).toBe(1)
    expect(source).not.toContain("ImageAvatar")
  })

  test("does not expose business navigation or debug HUD", () => {
    for (const text of ["选择操作", "quickActions", "报告", "办公", "知识", "标书", "合同", "更多", "FPS", "JANK", "EXPANDED:"]) {
      expect(source).not.toContain(text)
    }
  })

  test("keeps the shell transparent and sends real xiaoxue tasks", () => {
    expect(source).toContain('background: "transparent"')
    expect(source).toContain("background: transparent !important")
    expect(source).toContain('agent: "xiaoxue"')
    expect(source).toContain("autoSubmit: true")
    expect(source).toContain('source: "xiaoxue-pet"')
  })

  test("handles pet renderer load failures without leaving a broken window", () => {
    expect(mainSource).toContain('loadURL(url.toString()).catch')
    expect(mainSource).toContain('loadingWindow.destroy()')
  })})
