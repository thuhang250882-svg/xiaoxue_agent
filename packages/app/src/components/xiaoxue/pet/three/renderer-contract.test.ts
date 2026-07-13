import { describe, expect, test } from "bun:test"

const renderer = await Bun.file(new URL("../ThreePetRenderer.tsx", import.meta.url)).text()
const scene = await Bun.file(new URL("./PetScene.ts", import.meta.url)).text()
const models = await Bun.file(new URL("./Pet3DModelManager.ts", import.meta.url)).text()

describe("xiaoxue 3D renderer recovery contract", () => {
  test("keeps transparent WebGL output", () => {
    expect(scene).toContain("alpha: options.alpha ?? true")
    expect(scene).toContain("renderer.setClearColor(0x000000, 0)")
    expect(scene).toContain("renderer.setClearAlpha(0)")
  })

  test("ignores transient zero size and resumes after hide/show", () => {
    expect(renderer).toContain("width >= 64 && height >= 64")
    expect(renderer).toContain('window.addEventListener("xiaoxue:pet-visibility"')
    expect(renderer).toContain("animController?.ensurePlaying()")
  })

  test("recovers WebGL context without switching to image fallback", () => {
    expect(renderer).toContain('canvasRef.addEventListener("webglcontextlost"')
    expect(renderer).toContain('canvasRef.addEventListener("webglcontextrestored"')
    expect(renderer).not.toContain("onContextRestored = tryLoadImageAvatar")
  })

  test("clones cached GLTF into an independent scene instance", () => {
    expect(models).toContain('from "three/examples/jsm/utils/SkeletonUtils.js"')
    expect(models).toContain("const scene = clone(gltf.scene)")
    expect(models).not.toContain("let cachedModel")
  })
})
