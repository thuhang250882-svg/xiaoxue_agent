import { createHash } from "node:crypto"
import { copyFile, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Process } from "../util/process"
import type { MdbSnapshot } from "../../../../domains/geology_report/mdb-review"

// Constant code only: file names travel in the child environment, never in SQL or PowerShell source.
const script = String.raw`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
$c = New-Object System.Data.OleDb.OleDbConnection
try {
  $b = New-Object System.Data.OleDb.OleDbConnectionStringBuilder
  $b.set_Provider('Microsoft.Jet.OLEDB.4.0')
  $b.set_DataSource($env:XIAOXUE_MDB_SNAPSHOT)
  $b.set_Item('Mode', 'Read')
  $c.ConnectionString = $b.ConnectionString
  $c.Open()
  $tables = New-Object 'System.Collections.Generic.List[object]'
  $loadedRows = 0
  foreach ($t in @($c.GetSchema('Tables').Rows | Where-Object { $_.TABLE_TYPE -eq 'TABLE' } | Sort-Object TABLE_NAME)) {
    $name = [string]$t.TABLE_NAME
    $quoted = '[' + $name.Replace(']', ']]') + ']'
    $cmd = $c.CreateCommand()
    try {
      $cmd.CommandText = 'SELECT COUNT(*) FROM ' + $quoted
      $count = [int]$cmd.ExecuteScalar()
      $readData = $name -match '^A[DJ]LJ'
      if ($readData -and $count -gt 10000) { throw ($name + ' has more than 10000 rows; a scoped data-quality profile is required.') }
      if ($readData -and ($loadedRows + $count) -gt 50000) { throw 'Standard logging tables exceed the 50000-row review limit.' }
      $cmd.CommandText = 'SELECT * FROM ' + $quoted + ' WHERE 1=0'
      if ($readData) { $cmd.CommandText = 'SELECT * FROM ' + $quoted }
      $r = $cmd.ExecuteReader()
      try {
        $columns = @()
        for ($i = 0; $i -lt $r.FieldCount; $i++) { $columns += $r.GetName($i) }
        $records = New-Object 'System.Collections.Generic.List[object]'
        while ($r.Read()) {
          $row = [ordered]@{}
          for ($i = 0; $i -lt $r.FieldCount; $i++) {
            $v = $r.GetValue($i)
            if ($v -is [DBNull]) { $v = $null }
            elseif ($v -is [DateTime]) { $v = $v.ToString('yyyy-MM-dd') }
            elseif ($v -is [byte[]]) { $v = '<binary ' + $v.Length + ' bytes>' }
            elseif ($v -is [string] -and $v.Length -gt 10000) { throw ($name + ' contains a text cell exceeding the reader limit.') }
            $row[$r.GetName($i)] = $v
          }
          $records.Add([pscustomobject]$row)
        }
        if ($readData) { $loadedRows += $count }
        $tables.Add([pscustomobject]@{ name=$name; columns=$columns; rowCount=$count; records=@($records.ToArray()) })
      } finally { $r.Dispose() }
    } finally { $cmd.Dispose() }
  }
  $json = ConvertTo-Json -InputObject @($tables.ToArray()) -Depth 8 -Compress
  if ($json.Length -gt 64000000) { throw 'MDB review snapshot exceeds the 64 MB reader limit.' }
  [IO.File]::WriteAllText($env:XIAOXUE_MDB_OUTPUT, $json, (New-Object Text.UTF8Encoding($false)))
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
} finally { $c.Dispose() }
`

export async function readMdbSnapshot(file: string, signal?: AbortSignal): Promise<MdbSnapshot> {
  if (process.platform !== "win32") throw new Error("MDB 读取目前需要 Windows 的 32 位 Jet Access 驱动。")
  const info = await stat(file)
  if (!info.isFile() || info.size > 512 * 1024 * 1024) throw new Error("MDB 必须是普通文件且不超过 512 MiB。")
  signal?.throwIfAborted()
  const directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-mdb-"))
  try {
    const snapshot = path.join(directory, "source.mdb")
    await copyFile(file, snapshot)
    const bytes = await readFile(snapshot)
    if (!bytes.subarray(0, 32).includes(Buffer.from("Standard Jet DB")))
      throw new Error("文件不是支持的 Jet MDB 数据库。")
    const after = await stat(file)
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs)
      throw new Error("MDB 在复制期间发生变化，请保存数据库后重试。")
    const child = await Process.run(
      [
        path.join(process.env.SystemRoot ?? "C:\\Windows", "SysWOW64", "WindowsPowerShell", "v1.0", "powershell.exe"),
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(script, "utf16le").toString("base64"),
      ],
      {
        env: { XIAOXUE_MDB_SNAPSHOT: snapshot, XIAOXUE_MDB_OUTPUT: path.join(directory, "tables.json") },
        abort: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        nothrow: true,
      },
    )
    if (child.code !== 0)
      throw new Error(
        `MDB 读取失败，请检查 32 位 Jet 驱动、密码或数据库格式：${child.stderr.toString().slice(0, 2000)}`,
      )
    const tables: unknown = JSON.parse(await readFile(path.join(directory, "tables.json"), "utf8"))
    if (!Array.isArray(tables) || !tables.every(isTable)) throw new Error("MDB 读取器返回的表结构无效。")
    return {
      fileName: path.basename(file),
      size: info.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      tables,
    }
  } finally {
    // This directory is exclusively created by mkdtemp above, never supplied by the caller.
    await rm(directory, { recursive: true, force: true })
  }
}

function isTable(value: unknown): value is MdbSnapshot["tables"][number] {
  if (!value || typeof value !== "object") return false
  const table = value as Record<string, unknown>
  return (
    typeof table.name === "string" &&
    Number.isSafeInteger(table.rowCount) &&
    Number(table.rowCount) >= 0 &&
    Array.isArray(table.columns) &&
    table.columns.every((column) => typeof column === "string") &&
    Array.isArray(table.records) &&
    table.records.every(
      (row) =>
        row &&
        typeof row === "object" &&
        !Array.isArray(row) &&
        Object.values(row).every((cell) => cell === null || ["string", "number", "boolean"].includes(typeof cell)),
    )
  )
}
