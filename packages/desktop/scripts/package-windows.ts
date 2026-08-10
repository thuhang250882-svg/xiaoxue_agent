import { copyFile, readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows")

// 在非 Electron 运行时中，electron 包导出的是可执行文件路径字符串；但其类型
// 声明只描述应用内的 API 模块，因此从 unknown 收窄。
const electronExport = (() => {
  try {
    return createRequire(import.meta.url)("electron") as unknown
  } catch {
    return undefined
  }
})()
const executable = typeof electronExport === "string" ? electronExport : undefined

if (!executable || !existsSync(executable)) {
  throw new Error(
    [
      "Electron is not installed correctly.",
      "Run `bun install --frozen-lockfile` from the repository root, then retry `bun run package:win`.",
      "Do not extract an Electron zip directly into node_modules/electron.",
    ].join("\n"),
  )
}

const cache = path.resolve(import.meta.dirname, "..", "..", "..", ".cache", "electron-builder")
await Bun.write(path.join(cache, "package.json"), JSON.stringify({ type: "commonjs" }) + "\n")
const child = Bun.spawn(
  [
    process.execPath,
    "run",
    "electron-builder",
    "--win",
    "--config",
    "electron-builder.config.ts",
    ...Bun.argv.slice(2),
  ],
  {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || cache,
    },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
)

const code = await child.exited
if (code !== 0) process.exit(code)

if (process.env.OPENCODE_CHANNEL === "prod") {
  const version = process.env.XIAOXUE_PRODUCT_VERSION
  const channel = process.env.XIAOXUE_UPDATE_CHANNEL
  if (!version || !channel) throw new Error("Production Windows packages require product version and update channel")

  const output = path.resolve(import.meta.dirname, "..", "dist", "xiaoxue-output")
  const metadata = path.join(output, `${channel}.yml`)
  const match = (await readFile(metadata, "utf8")).match(/^\s*-\s+url:\s+['"]?(.+?)['"]?\s*$/m)
  const updateName = match?.[1]
  if (!updateName || path.basename(updateName) !== updateName || updateName.includes("/") || updateName.includes("\\")) {
    throw new Error(`Unsafe or missing updater asset name in ${metadata}: ${updateName ?? "<missing>"}`)
  }

  const installer = path.join(output, `录井小雪-${version}-win-${process.arch}.exe`)
  await copyFile(installer, path.join(output, updateName))
  if (existsSync(`${installer}.blockmap`)) await copyFile(`${installer}.blockmap`, path.join(output, `${updateName}.blockmap`))
}

const verify = Bun.spawn([process.execPath, path.join(import.meta.dirname, "verify-packaged-windows.ts")], {
  cwd: path.resolve(import.meta.dirname, ".."),
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
})

process.exit(await verify.exited)
