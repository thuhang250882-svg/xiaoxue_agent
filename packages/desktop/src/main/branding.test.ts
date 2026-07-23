import { describe, expect, test } from "bun:test"

const main = await Bun.file(new URL("./index.ts", import.meta.url)).text()
const builder = await Bun.file(new URL("../../electron-builder.config.ts", import.meta.url)).text()
const manifest = await Bun.file(new URL("../../package.json", import.meta.url)).text()

describe("xiaoxue desktop branding", () => {
  test("uses the same application identifiers in the main process and installer", () => {
    for (const id of ["cn.xbzty.xiaoxue.dev", "cn.xbzty.xiaoxue.beta", "cn.xbzty.xiaoxue"]) {
      expect(main).toContain(id)
      expect(builder).toContain(id)
    }
  })

  test("keeps the legacy data directories while presenting the Xiaoxue brand", () => {
    expect(main).toContain("const DATA_IDS")
    expect(main).toContain("ai.opencode.desktop")
    expect(main).toContain('"录井小雪"')
    expect(manifest).toContain("录井小雪企业业务智能体桌面工作台")
  })
})
