import { beforeEach, describe, expect, test } from "bun:test"
import { consumePetTask, resetConsumedPetTasks } from "./pending-pet-action"

const homeSource = await Bun.file(new URL("./home.tsx", import.meta.url)).text()

beforeEach(resetConsumedPetTasks)

describe("pet task does not duplicate session", () => {
  test("home gates pet actions on single task consumption before opening a session", () => {
    const gateIndex = homeSource.indexOf("consumePetTask(detail.taskId)")
    const openIndex = homeSource.indexOf("openNewSession(detail.prompt")
    expect(gateIndex).toBeGreaterThan(-1)
    expect(openIndex).toBeGreaterThan(-1)
    // 单次消费检查必须发生在创建会话入口之前
    expect(gateIndex).toBeLessThan(openIndex)
  })

  test("double dispatched pet action yields a single session open", () => {
    // 以消费锁模拟 runPetAction 的入口判定：重复派发同一任务只有第一次生效
    const deliveries = [
      { taskId: "pet-task-9", prompt: "整理录井数据" },
      { taskId: "pet-task-9", prompt: "整理录井数据" },
    ]
    const opened = deliveries.filter((action) => consumePetTask(action.taskId))
    expect(opened).toHaveLength(1)
  })

  test("retries of different pet tasks are not blocked by earlier tasks", () => {
    expect(consumePetTask("pet-task-1")).toBe(true)
    expect(consumePetTask("pet-task-2")).toBe(true)
    expect(consumePetTask("pet-task-1")).toBe(false)
  })
})
