#!/usr/bin/env bun
/// <reference types="bun" />
// IDE 语言服务可能未按 scripts/tsconfig.json 归属本文件，显式引用 Bun 全局类型。

import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const sidecar = await Bun.file("out/main/sidecar.js").text()
const relative = sidecar.match(/import\("(\.\/chunks\/node-[^"]+\.js)"\)/)?.[1]
if (!relative) throw new Error("Could not find the bundled server chunk imported by the desktop sidecar")

const rendererNodeParserPatterns = ["requireOleHeader", "requireWordOleExtractor", "word-ole-extractor", "ole-header"]
const rendererFiles = await Array.fromAsync(new Bun.Glob("**/*.js").scan("out/renderer"))
const rendererNodeParserMatches = (
  await Promise.all(
    rendererFiles.map(async (file) => {
      const content = await Bun.file(path.join("out/renderer", file)).text()
      const pattern = rendererNodeParserPatterns.find((value) => content.includes(value))
      return pattern ? `${file}: ${pattern}` : undefined
    }),
  )
).filter((value) => value !== undefined)
if (rendererNodeParserMatches.length) {
  throw new Error(
    `Renderer bundle contains Node-only legacy Word parser code:\n${rendererNodeParserMatches.join("\n")}`,
  )
}

const chunk = path.resolve("out/main", relative)
const chunkContent = await Bun.file(chunk).text()
if (chunkContent.includes("bun:sqlite")) {
  throw new Error(`Desktop sidecar contains the unsupported bun:sqlite module: ${chunk}`)
}
const unsupportedBunGlobal = ["Bun.file", "Bun.write", "Bun.Glob", "Bun.CryptoHasher", "Bun.spawn"].find((pattern) =>
  chunkContent.includes(pattern),
)
if (unsupportedBunGlobal) throw new Error(`Desktop sidecar contains unsupported ${unsupportedBunGlobal}: ${chunk}`)

// 在非 Electron 运行时中，electron 包导出的是可执行文件路径字符串；但其类型
// 声明只描述应用内的 API 模块（CrossProcessExports），因此从 unknown 收窄。
const electronExport: unknown = createRequire(import.meta.url)("electron")
if (typeof electronExport !== "string") throw new Error("Could not resolve the Electron executable")

const child = Bun.spawn(
  [
    electronExport,
    "--input-type=module",
    "-e",
    "await import(process.argv[1])",
    pathToFileURL(chunk).href,
  ],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
)
const [exit, stdout, stderr] = await Promise.all([
  child.exited,
  new Response(child.stdout).text(),
  new Response(child.stderr).text(),
])
if (exit) {
  throw new Error(
    [`Electron failed to load the desktop sidecar server chunk (exit ${exit}).`, stdout.trim(), stderr.trim()]
      .filter(Boolean)
      .join("\n"),
  )
}

console.log("Electron sidecar runtime smoke test passed")
