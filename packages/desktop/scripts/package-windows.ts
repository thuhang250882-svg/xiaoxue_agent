import { existsSync } from "node:fs"
import path from "node:path"

if (process.platform !== "win32") throw new Error("Windows packages must be built on Windows")

const electron = await import("electron").catch(() => undefined)
const executable = typeof electron?.default === "string" ? electron.default : undefined

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

process.exit(await child.exited)
