import { createHash } from "node:crypto"
import { readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"

const ZIP_LOCAL_HEADER = 0x04034b50
const ZIP_CENTRAL_HEADER = 0x02014b50
const DOS_EPOCH_DATE = 0x21

export async function normalizePythonLaunchers(sitePackages: string) {
  const bin = path.join(sitePackages, "bin")
  const launchers = new Map(
    await Promise.all(
      (await readdir(bin, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
        .map(async (entry) => {
          const location = path.join(bin, entry.name)
          const content = Buffer.from(await readFile(location))
          const headers = normalizeZipTimestamps(content)
          if (headers === 0) throw new Error(`Python launcher has no embedded ZIP headers: ${location}`)
          await writeFile(location, content)
          return [
            entry.name.toLowerCase(),
            {
              hash: createHash("sha256").update(content).digest("base64url"),
              size: content.length,
            },
          ] as const
        }),
    ),
  )

  const updated = (
    await Promise.all(
      (await readdir(sitePackages, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name.endsWith(".dist-info"))
        .map((entry) => updateRecord(path.join(sitePackages, entry.name, "RECORD"), launchers)),
    )
  ).reduce((total, count) => total + count, 0)
  if (updated !== launchers.size) {
    throw new Error(`Python launcher RECORD mismatch: normalized=${launchers.size} updated=${updated}`)
  }
  return { launchers: launchers.size, records: updated }
}

// pip's Windows launchers append a ZIP payload stamped with the install time.
// The timestamps do not affect execution but otherwise make fresh runtime hashes drift.
function normalizeZipTimestamps(content: Buffer) {
  let headers = 0
  for (let index = 0; index <= content.length - 16; index++) {
    const signature = content.readUInt32LE(index)
    const timestamp = signature === ZIP_LOCAL_HEADER ? index + 10 : signature === ZIP_CENTRAL_HEADER ? index + 12 : undefined
    if (timestamp === undefined) continue
    content.writeUInt16LE(0, timestamp)
    content.writeUInt16LE(DOS_EPOCH_DATE, timestamp + 2)
    headers++
  }
  return headers
}

async function updateRecord(
  location: string,
  launchers: Map<string, { hash: string; size: number }>,
) {
  const file = Bun.file(location)
  if (!(await file.exists())) return 0
  const content = await file.text()
  const newline = content.includes("\r\n") ? "\r\n" : "\n"
  let updated = 0
  const lines = content.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\.\.\/\.\.\/bin\/)([^,]+\.exe),sha256=[^,]+,\d+$/i)
    if (!match) return line
    const launcher = launchers.get((match[2] ?? "").toLowerCase())
    if (!launcher) return line
    updated++
    return `${match[1]}${match[2]},sha256=${launcher.hash},${launcher.size}`
  })
  await writeFile(location, lines.join(newline))
  return updated
}
