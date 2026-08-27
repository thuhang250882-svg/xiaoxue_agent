import { describe, expect, test } from "bun:test"

const component = await Bun.file(new URL("./XiaoxueWebP.tsx", import.meta.url)).text()
const overlay = await Bun.file(new URL("./XiaoxuePetOverlay.tsx", import.meta.url)).text()
const moduleIndex = await Bun.file(new URL("./index.ts", import.meta.url)).text()
const packageJson = await Bun.file(new URL("../../../../package.json", import.meta.url)).json()

describe("xiaoxue WebP renderer", () => {
  test("maps every desktop pet animation to transparent WebP", () => {
    for (const asset of [
      "idle",
      "idle-random",
      "waiting",
      "listen",
      "speaking",
      "thinking",
      "searching",
      "reading",
      "writing",
      "success",
      "celebrate",
      "error",
    ]) {
      expect(component).toContain(`/assets/pet/xiaoxue-${asset}.webp`)
    }
  })

  test("keeps greeting out of idle and work-state mappings", () => {
    expect(component).not.toContain("xiaoxue-greeting-wave.webp")
    expect(component).toContain('reviewing: { src: "/assets/pet/xiaoxue-reading.webp"')
    expect(component).toContain('warning: { src: "/assets/pet/xiaoxue-waiting.webp"')
  })

  test("uses a per-state body and feet anchor", () => {
    expect(component).toContain("XIAOXUE_WEBP_VIEWS")
    expect(component).toContain("transform-origin")
    expect(component).toContain("translate(${view().x}%, ${view().y}%) scale(${view().scale})")
    expect(component).toContain("scale: 0.58")
    expect(component).toContain('idle: { src: IDLE_PRIMARY_ASSET, x: -16.5, y: 0.1, scale: 0.58 }')
    expect(component).toContain('listen: { src: "/assets/pet/xiaoxue-listen.webp", x: -4.5, y: 0.1, scale: 0.67 }')
  })

  test("renders the overlay without a WebGL runtime dependency", () => {
    expect(overlay).toContain("<XiaoxueWebP")
    expect(overlay).not.toContain("<canvas")
    expect(moduleIndex).not.toContain("XiaoxueSprite")
    expect(moduleIndex).not.toContain("createSpriteController")
    expect(packageJson.dependencies.three).toBeUndefined()
    expect(packageJson.devDependencies["@types/three"]).toBeUndefined()
  })

  test("returns terminal event animations to idle after a bounded hold", () => {
    expect(component).toContain("TERMINAL_STATES")
    expect(component).toContain("TERMINAL_HOLD_MS = 9_000")
    expect(component).toContain('setDisplay("idle")')
    expect(component).toContain("clearTerminalTimer")
  })
})
