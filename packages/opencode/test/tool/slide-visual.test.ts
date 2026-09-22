import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { renderSlideVisual } from "../../src/tool/slide-visual"

let directory = ""

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "slide-visual-"))
  await mkdir(path.join(directory, "docs"), { recursive: true })
  await writeFile(path.join(directory, "docs", "page-global-config.json"), JSON.stringify({ primary: "#123456" }))
})

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

const cases = [
  ["chart", { kind: "bar", categories: ["甲", "乙"], series: [{ name: "数量", values: [2, 4] }] }],
  ["timeline", { items: [{ label: "立项", at: "一月" }, { label: "验收", at: "六月" }] }],
  ["flow", { steps: [{ label: "采集", desc: "获取数据" }, { label: "分析", desc: "形成结论" }] }],
  ["grid", { cols: 2, cards: [{ title: "质量", desc: "证据可追溯" }, { title: "效率", desc: "流程可复用" }] }],
  ["compare", { left: { title: "方案 A", items: ["稳定"] }, right: { title: "方案 B", items: ["灵活"] } }],
] as const

describe("slide visual", () => {
  test.each(cases)("renders safe deterministic %s SVG", async (visual_type, data) => {
    const output = path.join(directory, "frontend", "public", "assets", `${visual_type}.svg`)
    const result = await renderSlideVisual({ visual_type, data, output_path: output })
    const svg = await Bun.file(output).text()
    expect(result.render_mode).toBe("deterministic")
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg.endsWith("</svg>")).toBe(true)
    expect(svg).toContain("#123456")
    expect(svg).toContain("Microsoft YaHei")
    expect(svg).not.toMatch(/linearGradient|radialGradient|gradient\(|<script|(?:href|src)=["']https?:\/\//i)
  })

  test("truncates long text and reports a warning", async () => {
    const output = path.join(directory, "long.svg")
    const result = await renderSlideVisual({
      visual_type: "grid",
      data: { cards: [{ title: "这是一个明显超过十个汉字的卡片标题", desc: "正文" }] },
      output_path: output,
    })
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(await Bun.file(output).text()).toContain("…")
  })

  test("rejects concept fallback and existing targets", async () => {
    await expect(
      renderSlideVisual({ visual_type: "concept", description: "概念示意", output_path: path.join(directory, "concept.svg") }),
    ).rejects.toThrow("主流程模型")
    const output = path.join(directory, "existing.svg")
    await writeFile(output, "existing")
    await expect(
      renderSlideVisual({ visual_type: "grid", data: { cards: [{ title: "一", desc: "二" }] }, output_path: output }),
    ).rejects.toThrow("拒绝覆盖")
  })
})
