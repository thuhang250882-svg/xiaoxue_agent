import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { XiaoxueGovernance } from "../../src/xiaoxue/governance"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

describe("Xiaoxue governance store", () => {
  let directory = ""

  beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "xiaoxue-governance-"))
    process.env.XIAOXUE_GOVERNANCE_DB = path.join(directory, "governance.sqlite")
  })

  afterAll(async () => {
    delete process.env.XIAOXUE_GOVERNANCE_DB
    await rm(directory, { recursive: true, force: true })
  })

  test("writes a tamper-evident audit chain", async () => {
    await XiaoxueGovernance.audit({
      action: "test.verify",
      resource: "governance",
      outcome: "succeeded",
      metadata: { apiKey: "must-not-be-stored" },
    })
    expect(await XiaoxueGovernance.auditIntegrity()).toMatchObject({ valid: true })
  })

  test("updates durable task status idempotently", async () => {
    const id = crypto.randomUUID()
    await XiaoxueGovernance.recordTask({
      id,
      sessionID: "ses_test",
      kind: "test",
      status: "pending",
      requestID: id,
    })
    await XiaoxueGovernance.recordTask({ id, sessionID: "ses_test", kind: "test", status: "succeeded" })
    expect(await XiaoxueGovernance.auditIntegrity()).toMatchObject({ valid: true })
  })
})
