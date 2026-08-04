type Value = string | number | bigint | null | Uint8Array

export type AdapterStatement = {
  run(...params: Value[]): unknown
  get(...params: Value[]): unknown
  all(...params: Value[]): unknown[]
}

export type AdapterDatabase = {
  exec(sql: string): void
  prepare(sql: string): AdapterStatement
  close(): void
}
