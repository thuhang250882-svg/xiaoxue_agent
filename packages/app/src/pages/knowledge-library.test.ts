import { describe, expect, test } from "bun:test"

const source = await Bun.file(new URL("./knowledge-library.tsx", import.meta.url)).text()

describe("knowledge library layout", () => {
  test("stretches to the route container instead of sizing to its content", () => {
    expect(source).toContain("min-w-0 flex-1 self-stretch")
    expect(source).toContain("max-w-[1280px]")
  })

  test("adapts form and action columns to the available container width", () => {
    expect(source).toContain("repeat(auto-fit, minmax(min(100%, 220px), 1fr))")
    expect(source).toContain("repeat(auto-fit, minmax(min(100%, 320px), 1fr))")
    expect(source).not.toContain("md:grid-cols-3")
    expect(source).not.toContain("md:grid-cols-2")
  })
})
